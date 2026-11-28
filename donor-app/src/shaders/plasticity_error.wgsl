// Error-driven plasticity — a wire changes only when its cell is WRONG.
// One thread per post-neuron row; every row in the range is visited (a resting cell can be wrong).
//   s = sum of w over the row's ACTIVE inputs
//   should fire (postSpikes != 0) and s < theta + margin  ->  w += eta on active inputs
//   should rest (postSpikes == 0) and s > theta - margin  ->  w -= eta on active inputs
//   otherwise nothing changes
// postSpikes is the TEACHING pattern (which target cells should fire for this input).
// Host twin: SparseMatrix.errorUpdate (js/brain/sparse-matrix.js). The two must agree.

struct Params {
  rows: u32,
  nnz: u32,
  eta: f32,
  theta: f32,
  margin: f32,
  wMin: f32,
  wMax: f32,
  srcOffset: u32,
  dstOffset: u32,
  rowStart: u32,   // first row to visit
  rowCount: u32,   // how many rows from there; 0 = every row of the matrix
  pad2: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> values: array<f32>;
@group(0) @binding(2) var<storage, read> colIdx: array<u32>;
@group(0) @binding(3) var<storage, read> rowPtr: array<u32>;
@group(0) @binding(4) var<storage, read> preSpikes: array<u32>;
@group(0) @binding(5) var<storage, read> postSpikes: array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  // A lesson that lies inside one region visits that region's rows only; the
  // dispatch is sized to the count, so the rest of the matrix costs nothing.
  let count = select(params.rowCount, params.rows, params.rowCount == 0u);
  if (gid.x >= count) { return; }
  let i = params.rowStart + gid.x;
  if (i >= params.rows) { return; }
  let start = rowPtr[i];
  let end = rowPtr[i + 1u];

  var s: f32 = 0.0;
  var lit: f32 = 0.0;
  for (var k: u32 = start; k < end; k = k + 1u) {
    if (preSpikes[params.srcOffset + colIdx[k]] != 0u) { s = s + values[k]; lit = lit + 1.0; }
  }
  if (lit == 0.0) { return; }

  // The step closes the gap: a wrong cell's lit wires share out what it is short
  // of (or over by), times eta (1 = all of it in one teach).
  var d: f32 = 0.0;
  let hi = params.theta + params.margin;
  let lo = params.theta - params.margin;
  if (postSpikes[params.dstOffset + i] != 0u) {
    if (s < hi) { d = params.eta * (hi - s) / lit; }
  } else {
    if (s > lo) { d = params.eta * (lo - s) / lit; }
  }
  if (d == 0.0) { return; }

  for (var k: u32 = start; k < end; k = k + 1u) {
    if (preSpikes[params.srcOffset + colIdx[k]] != 0u) {
      values[k] = clamp(values[k] + d, params.wMin, params.wMax);
    }
  }
}
