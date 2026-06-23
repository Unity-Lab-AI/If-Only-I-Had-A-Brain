// CUDA-C kernels for the unity-donor CUDA backend — direct ports of shaders/*.wgsl so a CUDA
// donor returns byte-identical results to the wgpu/browser donor. Compiled to PTX at build
// time (`nvcc --ptx -arch=compute_60`) and committed as kernels.ptx, which the driver JITs to
// the host GPU's arch — so the runtime needs only libcuda (no nvrtc / no toolkit).
//
// Regenerate after editing:  nvcc --ptx -arch=compute_60 -o src/kernels.ptx src/cuda_kernels.cu

extern "C" {

__device__ unsigned int pcg(unsigned int v) {
  unsigned int s = v * 747796405u + 2891336453u;
  unsigned int word = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (word >> 22u) ^ word;
}
__device__ float rnd(unsigned int seed, unsigned int idx) {
  unsigned int h = pcg(seed ^ pcg(idx));
  return ((float)h / 4294967295.0f) * 2.0f - 1.0f;
}
// regionGates packed [start, end, gate, pad] per region.
__device__ float region_gate(unsigned int n_idx, unsigned int numRegions, const float* g) {
  for (unsigned int i = 0u; i < numRegions; i++) {
    unsigned int base = i * 4u;
    unsigned int start = (unsigned int)g[base];
    unsigned int end   = (unsigned int)g[base + 1u];
    if (n_idx >= start && n_idx < end) return g[base + 2u];
  }
  return 1.0f;
}

// Rulkov 2002 map (port of lif.wgsl). state interleaved float2: state[2i]=x, state[2i+1]=y.
__global__ void lif(unsigned int n, float effectiveDrive, float noiseAmp,
                    unsigned int seed, unsigned int numRegions,
                    float* state, unsigned int* spikes,
                    const float* currents, const float* regionGates) {
  unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= n) return;
  const float ALPHA = 4.5f;
  const float MU = 0.001f;
  float gate = region_gate(i, numRegions, regionGates);
  float drive = (effectiveDrive + currents[i]) * gate;
  float sigmaEff = -1.0f + fminf(fmaxf(drive / 40.0f, 0.0f), 1.0f) * 1.5f;
  float xN = state[2u*i];
  float yN = state[2u*i + 1u];
  float jitter = rnd(seed, i) * noiseAmp;
  float xNext = ALPHA / (1.0f + xN * xN) + yN;
  float yNext = yN - MU * (xN - sigmaEff) + jitter;
  state[2u*i]      = xNext;
  state[2u*i + 1u] = yNext;
  spikes[i] = (xN <= 0.0f && xNext > 0.0f) ? 1u : 0u;
}

// Atomic spike count (port of spike_count.wgsl).
__global__ void spike_count(unsigned int n, const unsigned int* spikes, unsigned int* count) {
  unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= n) return;
  if (spikes[i] != 0u) atomicAdd(count, 1u);
}

// CSR matmul gated by presynaptic spikes (port of synapse_propagate.wgsl). rowPtr has rows+1.
__global__ void synapse_propagate(unsigned int rows, unsigned int srcOffset, unsigned int dstOffset,
                                  const float* values, const unsigned int* colIdx, const unsigned int* rowPtr,
                                  const unsigned int* spikes, float* currents) {
  unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= rows) return;
  unsigned int start = rowPtr[i];
  unsigned int end   = rowPtr[i + 1u];
  float sum = 0.0f;
  for (unsigned int k = start; k < end; k++) {
    unsigned int j = colIdx[k];
    if (spikes[srcOffset + j] != 0u) sum += values[k];
  }
  currents[dstOffset + i] += sum;
}

// Oja / anti-Hebbian plasticity (port of plasticity.wgsl).
__global__ void plasticity(unsigned int rows, float lr, float reward, float wMin, float wMax,
                           unsigned int srcOffset, unsigned int dstOffset,
                           float* values, const unsigned int* colIdx, const unsigned int* rowPtr,
                           const unsigned int* preSpikes, const unsigned int* postSpikes) {
  unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= rows) return;
  if (postSpikes[dstOffset + i] == 0u) return;
  float eta = fabsf(lr) * reward;
  unsigned int start = rowPtr[i];
  unsigned int end   = rowPtr[i + 1u];
  if (lr >= 0.0f) {
    for (unsigned int k = start; k < end; k++) {
      unsigned int j = colIdx[k];
      float x = (float)preSpikes[srcOffset + j];
      float w = values[k] * (1.0f - eta) + eta * x;
      values[k] = fminf(fmaxf(w, wMin), wMax);
    }
  } else {
    for (unsigned int k = start; k < end; k++) {
      unsigned int j = colIdx[k];
      if (preSpikes[srcOffset + j] != 0u) {
        values[k] = fminf(fmaxf(values[k] - eta, wMin), wMax);
      }
    }
  }
}

} // extern "C"
