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
  // Escaped/NaN state reseeds into the bursting-attractor basin — same guard
  // as the browser reference (gpu-compute.js) and the WGSL twin.
  if (xN != xN || yN != yN || fabsf(xN) > 100.0f || fabsf(yN) > 100.0f) {
    const float PHI = 0.61803398875f;
    float f1 = (float)i * PHI;        float b1 = f1 - floorf(f1);
    float f2 = (float)i * PHI * 1.7f; float b2 = f2 - floorf(f2);
    xN = -1.0f + b1 * 0.5f;
    yN = -3.2f + b2 * 0.4f;
  }
  // Noise lives in the SLOW variable's units (±noiseAmp×5e-5, the browser
  // reference's (rand[0,1]-0.5)×noiseAmp×0.0001; rnd here spans [-1,1] so
  // ×0.5 gives the identical amplitude). The unscaled port injected
  // ±noiseAmp per step — 20,000× the reference — see the WGSL twin's note.
  float jitter = rnd(seed, i) * 0.5f * noiseAmp * 0.0001f;
  float xNext = ALPHA / (1.0f + xN * xN) + yN;
  float yNext = yN - MU * (xN - sigmaEff) + jitter;
  state[2u*i]      = xNext;
  state[2u*i + 1u] = yNext;
  spikes[i] = (xN <= 0.0f && xNext > 0.0f) ? 1u : 0u;
}

// GOTCHA.3b (v0.3.32) — mean of the Rulkov FAST variable. Port of
// voltage_mean.wgsl, and the CUDA half the board said this "must be written
// TWICE" for.
//
// ⛔ `state` here is FLAT, not vec2: `state[2*i]` is x (the fast variable, the
// membrane-potential analogue) and `state[2*i+1]` is y (the slow recovery
// variable). The WGSL twin binds `array<vec2<f32>>` and reads `.x`; this reads
// `state[2u*i]`. Same value, different memory view — reading `state[i]` here
// would silently interleave x and y and produce a plausible number that means
// nothing.
//
// ⚠ Partial sums, not an atomicAdd. CUDA *does* have atomicAdd(float*), unlike
// WGSL — but this deliberately mirrors the WGSL structure so the two halves can
// be compared line-for-line, and so both divide by the real `n` on the host
// rather than accumulating rounding differently. Matching shape beats a
// marginally shorter kernel when the whole point is cross-backend parity.
//
// One thread per partial slot; the host sums the slots. A slot starting past
// the end still WRITES 0.0f — the host sums the whole buffer, so a stale value
// from a previous larger cluster would otherwise read as real signal.
__global__ void voltage_mean(unsigned int n, unsigned int chunk, const float* state, float* partials) {
  unsigned int p = blockIdx.x * blockDim.x + threadIdx.x;
  unsigned int start = p * chunk;
  if (start >= n) { partials[p] = 0.0f; return; }
  unsigned int end = start + chunk;
  if (end > n) end = n;
  float sum = 0.0f;
  for (unsigned int i = start; i < end; i++) {
    sum += state[2u * i];
  }
  partials[p] = sum;
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
