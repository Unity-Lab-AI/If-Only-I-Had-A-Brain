// GPUVERB.3 (v0.3.28) — max reduction over post currents, for the predictive-error
// normaliser. The CPU does `maxP = 1e-6; for each predicted[i] if (v > maxP) maxP = v`
// — i.e. the max over POSITIVE values with a 1e-6 floor, since a negative current can
// never beat the seed. So negatives are clamped to 0 here and the floor is applied by
// the consumer; for non-negative IEEE-754 floats the u32 bit pattern preserves ordering,
// which is what makes a plain atomicMax correct.

struct Params {
  n: u32,
  gridX: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> currents: array<f32>;
@group(0) @binding(2) var<storage, read_write> maxBits: array<atomic<u32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x + gid.y * params.gridX * 256u;
  if (i >= params.n) { return; }
  let v = currents[i];
  if (v <= 0.0) { return; }
  atomicMax(&maxBits[0], bitcast<u32>(v));
}
