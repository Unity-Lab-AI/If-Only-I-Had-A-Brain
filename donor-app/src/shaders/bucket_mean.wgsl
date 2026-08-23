// GATEGPU.2 (v0.3.28) — DONOR-SIDE READOUT REDUCTION.
//
// One thread per word bucket: mean of that bucket's contiguous run of post
// currents. This is the arithmetic the brain's emission argmax was doing on
// the CPU *after* dragging the whole current vector across the wire — every
// spoken word pulled 720,000 floats (~2.9MB) back so the server could reduce
// them to ~2,500 bucket means. Reducing here makes the ack kilobytes.
//
// EXACT PARITY with the server's loop (`emitWordDirect`): bucket b spans
// [b*bucketSize, min(rows, b*bucketSize + bucketSize)) and the divisor is the
// REAL cell count of that span, not bucketSize — the final bucket may be
// short. A bucket starting at or past `rows` is capacity overflow and reads
// 0.0; the server keeps its own overflow break, so such a bucket can never
// win an argmax on either side.

struct Params {
  bucketCount: u32,
  bucketSize: u32,
  rows: u32,
  gridX: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> currents: array<f32>;
@group(0) @binding(2) var<storage, read_write> means: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let b = gid.x + gid.y * params.gridX * 256u;
  if (b >= params.bucketCount) { return; }
  let start = b * params.bucketSize;
  if (start >= params.rows) { means[b] = 0.0; return; }
  var end = start + params.bucketSize;
  if (end > params.rows) { end = params.rows; }
  var sum: f32 = 0.0;
  for (var i: u32 = start; i < end; i = i + 1u) {
    sum = sum + currents[i];
  }
  means[b] = sum / f32(end - start);
}
