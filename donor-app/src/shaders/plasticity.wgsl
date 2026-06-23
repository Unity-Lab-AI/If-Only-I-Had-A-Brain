// Oja's self-normalizing Hebbian rule (lr >= 0), with anti-Hebbian mode (lr < 0).
// Lifted from js/brain/gpu-compute.js PLASTICITY_SHADER. One thread per post-neuron row.
//   Oja:  w = w*(1-eta) + eta*pre        (eta = |lr|*reward), clamp [wMin,wMax]
//   Anti: on co-activation, w = w - eta                       , clamp [wMin,wMax]

struct Params {
  rows: u32,
  nnz: u32,
  lr: f32,
  reward: f32,
  wMin: f32,
  wMax: f32,
  srcOffset: u32,
  dstOffset: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> values: array<f32>;
@group(0) @binding(2) var<storage, read> colIdx: array<u32>;
@group(0) @binding(3) var<storage, read> rowPtr: array<u32>;
@group(0) @binding(4) var<storage, read> preSpikes: array<u32>;
@group(0) @binding(5) var<storage, read> postSpikes: array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.rows) { return; }
  if (postSpikes[params.dstOffset + i] == 0u) { return; }

  let eta = abs(params.lr) * params.reward;
  let start = rowPtr[i];
  let end = rowPtr[i + 1u];

  if (params.lr >= 0.0) {
    // Oja
    for (var k: u32 = start; k < end; k = k + 1u) {
      let j = colIdx[k];
      let x = f32(preSpikes[params.srcOffset + j]);
      var w = values[k] * (1.0 - eta) + eta * x;
      values[k] = clamp(w, params.wMin, params.wMax);
    }
  } else {
    // Anti-Hebbian
    for (var k: u32 = start; k < end; k = k + 1u) {
      let j = colIdx[k];
      if (preSpikes[params.srcOffset + j] != 0u) {
        values[k] = clamp(values[k] - eta, params.wMin, params.wMax);
      }
    }
  }
}
