// CUDA-C kernels for the unity-donor CUDA backend. The four compute kernels (lif /
// spike_count / synapse_propagate / plasticity) are direct ports of shaders/*.wgsl so a CUDA
// donor returns byte-identical results to the wgpu/browser donor; the fill_zero_* /
// scatter_* pattern ops are device-side replacements for what the host used to do with
// dense vectors + full-span PCIe copies. Compiled to PTX at build time and committed as
// kernels.ptx, which the driver JITs to the host GPU's arch — so the runtime needs only
// libcuda (no nvrtc / no toolkit).
//
// Regenerate after editing — the toolkit version is LOAD-BEARING, use CUDA 12.x:
//   docker run --rm -v "$PWD/donor-app/src:/src" nvidia/cuda:12.0.1-devel-ubuntu22.04 \
//     nvcc --ptx -arch=compute_75 -o /src/kernels.ptx /src/cuda_kernels.cu
// (compute_75 = Turing+; CUDA 13 toolchains no longer emit compute_60.)
//
// WHY THE TOOLKIT VERSION MATTERS: nvcc stamps a PTX ISA `.version` tied to its own release,
// and a driver can only JIT PTX at or below its OWN ISA version. CUDA 13.x emits .version 9.0,
// which needs an r580+ driver — every r570 / CUDA-12.8 host fails cuModuleLoadData with
// CUDA_ERROR_UNSUPPORTED_PTX_VERSION and loses the CUDA path entirely. That costs more than
// throughput: the per-binding capacity advertised to the brain comes from the ACTIVE backend
// (CUDA -> the card's real VRAM, wgpu -> Vulkan's hard 2 GB maxStorageBufferRange), so a
// fallback advertises 2047 MB instead of the full VRAM, and the brain's capability gate sizes
// the whole community compute pool off that number. CUDA 12.0 emits .version 8.0, which loads
// on every driver from r525 up. The module-load failure is LOUD either way — a card that
// cannot JIT falls back to wgpu and never silently computes zero.

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

// ─── v0.3.14 device-side pattern ops ───────────────────────────────────────
// The host used to materialize a DENSE region/matrix-sized vector for every
// teach write (spike pattern, current pattern, clear, and the pre/post sets of
// every plasticity call) and memcpy the whole thing over PCIe — up to megabytes
// of mostly-zeros per frame, synchronously, on the single worker thread. These
// kernels move the scatter to the device: the host uploads ONLY the sparse
// indices (a few hundred bytes) and the GPU zeroes + scatters in-place. All
// launches ride the same stream, so clear→write→plasticity ordering is
// preserved by stream order with no host synchronization at all.

// dst[offset .. offset+n] = 0 (u32).
__global__ void fill_zero_u32(unsigned int n, unsigned int offset, unsigned int* dst) {
  unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= n) return;
  dst[offset + i] = 0u;
}

// dst[offset .. offset+n] = 0 (f32).
__global__ void fill_zero_f32(unsigned int n, unsigned int offset, float* dst) {
  unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= n) return;
  dst[offset + i] = 0.0f;
}

// dst[offset + indices[i]] = 1 for every in-bounds index (len = span guard).
__global__ void scatter_ones_u32(unsigned int count, unsigned int offset, unsigned int len,
                                 const unsigned int* indices, unsigned int* dst) {
  unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= count) return;
  unsigned int idx = indices[i];
  if (idx < len) dst[offset + idx] = 1u;
}

// dst[offset + indices[i]] = values[i] * psi (0 when values is shorter than indices —
// matches the host path's values.get(k).unwrap_or(0.0)).
__global__ void scatter_vals_f32(unsigned int count, unsigned int vcount, unsigned int offset,
                                 unsigned int len, float psi,
                                 const unsigned int* indices, const float* values, float* dst) {
  unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= count) return;
  unsigned int idx = indices[i];
  if (idx >= len) return;
  float v = (i < vcount) ? values[i] : 0.0f;
  dst[offset + idx] = v * psi;
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
