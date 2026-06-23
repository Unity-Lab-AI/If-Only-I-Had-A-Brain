// CSR sparse matmul gated by presynaptic spikes (T17.7).
//   currents[dstOffset + i] += sum( values[k] for k in row i where spikes[srcOffset + colIdx[k]] != 0 )
// Lifted from js/brain/gpu-compute.js SYNAPSE_PROPAGATE_SHADER. For a standalone matrix
// srcOffset = dstOffset = 0 (preSpikes / postCurrents buffers); when cluster-bound they
// index into the cluster's spike / current slices.

struct Params {
  rows: u32,
  cols: u32,
  nnz: u32,
  srcOffset: u32,
  dstOffset: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> values: array<f32>;
@group(0) @binding(2) var<storage, read> colIdx: array<u32>;
@group(0) @binding(3) var<storage, read> rowPtr: array<u32>;
@group(0) @binding(4) var<storage, read> spikes: array<u32>;
@group(0) @binding(5) var<storage, read_write> currents: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.rows) { return; }
  let start = rowPtr[i];
  let end = rowPtr[i + 1u];
  var sum: f32 = 0.0;
  for (var k: u32 = start; k < end; k = k + 1u) {
    let j = colIdx[k];
    if (spikes[params.srcOffset + j] != 0u) {
      sum = sum + values[k];
    }
  }
  currents[params.dstOffset + i] = currents[params.dstOffset + i] + sum;
}
