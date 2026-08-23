// GPUVERB.3 (v0.3.28) — PREDICTIVE-ERROR CORRECTION, ENTIRELY ON THE CARD.
//
// The last signed-magnitude CPU training lane. Its post term is a per-row FLOAT
// error in [-1,1], which no existing verb could express (every spike buffer is
// 0/1 u32) — and it could not be shipped as a mask either, because the error
// vector is DENSE: at the 12M cortex a float post mask is ~48MB per pair, worse
// than doing it on the CPU. So the whole computation moves here instead, and the
// wire carries a ~60-byte command.
//
// One thread per row, reproducing the server's rule EXACTLY:
//   target_i = (postSpikes[dstOffset + i] != 0) ? 1 : 0
//   p        = currents[i] / maxP
//   e        = clamp(target_i - p, -1, 1)
//   if e == 0: skip the row      (the CPU's `if (!postSpikes[i]) continue`)
//   for k in row i: values[k] += lr * e * pre        , clamped to [wMin, wMax]
//     where pre = (preSpikes[srcOffset + colIdx[k]] != 0) ? 1 : 0
//
// `currents` holds the intra propagate of the SAME spike vector, computed in the
// preceding dispatch of this encoder; `maxP` arrives already floored at 1e-6.

struct Params {
  rows: u32,
  nnz: u32,
  lr: f32,
  maxP: f32,
  wMin: f32,
  wMax: f32,
  srcOffset: u32,
  dstOffset: u32,
  gridX: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> values: array<f32>;
@group(0) @binding(2) var<storage, read> colIdx: array<u32>;
@group(0) @binding(3) var<storage, read> rowPtr: array<u32>;
@group(0) @binding(4) var<storage, read> preSpikes: array<u32>;
@group(0) @binding(5) var<storage, read> postSpikes: array<u32>;
@group(0) @binding(6) var<storage, read> currents: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x + gid.y * params.gridX * 256u;
  if (i >= params.rows) { return; }

  // `target` is a RESERVED WGSL keyword — the shader silently failed to compile
  // and every dispatch downstream reported an "invalid pipeline" cascade until
  // the parity test caught the un-applied weights.
  var tgt: f32 = 0.0;
  if (postSpikes[params.dstOffset + i] != 0u) { tgt = 1.0; }
  var e: f32 = tgt - (currents[i] / params.maxP);
  if (e > 1.0) { e = 1.0; }
  if (e < -1.0) { e = -1.0; }
  if (e == 0.0) { return; }

  let scaled = params.lr * e;
  let start = rowPtr[i];
  let end = rowPtr[i + 1u];
  for (var k: u32 = start; k < end; k = k + 1u) {
    if (preSpikes[params.srcOffset + colIdx[k]] != 0u) {
      var w = values[k] + scaled;
      if (w > params.wMax) { w = params.wMax; }
      if (w < params.wMin) { w = params.wMin; }
      values[k] = w;
    }
  }
}
