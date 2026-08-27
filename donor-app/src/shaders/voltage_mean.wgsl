// GOTCHA.3b (v0.3.32) — DONOR-SIDE VOLTAGE MEAN.
//
// `mean_voltage` has read `null` on all seven clusters for the entire life of
// the native donor, because `donor.rs` hardcoded `mean_voltage: None`. Every
// other link in the chain was already built and waiting: the wire field exists
// (`protocol.rs:129`), the server EMA-blends it (`brain-server.js:6282`), and
// `state.js` publishes it. The browser donor proves the shape end-to-end. The
// only missing piece was a reduction on this side — this file is it.
//
// ⛔ WHAT "VOLTAGE" MEANS HERE, because the name is historical and misleading.
// The live rule is the RULKOV 2002 2D chaotic map, not leaky-integrate-and-fire
// — the shader that runs it is still called `lif.wgsl` for the same historical
// reason. State is `array<vec2<f32>>` = the `(x, y)` pair, where `x` is the
// FAST variable and is the membrane-potential analogue. So the mean reported
// here is `mean(state[i].x)`, and `y` is deliberately untouched: it is the slow
// recovery variable and averaging it would produce a plausible number that
// means something else entirely.
//
// ⚠ WHY PARTIAL SUMS AND NOT AN ATOMIC. WGSL has no atomic float add. The
// `spike_count.wgsl` pattern (`atomicAdd` on a u32) cannot carry a float sum,
// and scaling into fixed-point would silently lose precision on a value that
// straddles zero. So: one thread per CHUNK, each summing its own contiguous
// run into `partials[p]`, and the host sums the partials. `PARTIALS` is fixed
// and small, so the readback is ~1KB regardless of cluster size — which is the
// whole point. `compute.html` deliberately reads this back ONCE PER TICK and
// not per substep, with its own comment saying per-substep "would be
// wasteful"; this shader is sized for exactly that cadence.
//
// ⭐ PARITY NOTE: the divisor is `n`, the real neuron count, applied on the
// HOST after summing partials — not per-chunk. A per-chunk mean-of-means would
// weight a short final chunk equally with a full one and drift from the CPU
// shadow's `sum / n`. The same trap `bucket_mean.wgsl` documents for its own
// short final bucket, in the opposite direction.

struct Params {
  n: u32,
  chunk: u32,
  gridX: u32,
  _pad: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> state: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> partials: array<f32>;

// ⛔ WORKGROUP SIZE MUST BE 256, AND THE INDEX MATH MUST USE 256u.
// The host computes its dispatch with the shared `dispatch_dims()`, which
// divides by `const WORKGROUP: u32 = 256` (compute.rs:16). A first draft of this
// shader used `workgroup_size(64)`: for 256 partial slots `dispatch_dims`
// returns ONE workgroup, so only 64 threads launched, `partials[64..255]` were
// never written, and the host summed stale memory into the mean. It would have
// produced a plausible number, every tick, with no error anywhere. Every other
// shader here uses 256 for exactly this reason — the constant is a contract
// with the host, not a tuning knob.
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let p = gid.x + gid.y * params.gridX * 256u;
  // One thread per partial slot. A slot whose run starts past the end
  // contributes 0.0 — it must still be WRITTEN, because the host sums the
  // whole partials buffer and a stale value from a previous, larger cluster
  // would be read as real signal.
  let start = p * params.chunk;
  if (start >= params.n) {
    partials[p] = 0.0;
    return;
  }
  var end = start + params.chunk;
  if (end > params.n) { end = params.n; }
  var sum: f32 = 0.0;
  for (var i: u32 = start; i < end; i = i + 1u) {
    sum = sum + state[i].x;
  }
  partials[p] = sum;
}
