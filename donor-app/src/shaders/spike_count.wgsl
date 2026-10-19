// Atomic count of spiking neurons in a cluster, per HALF. count[0] is the left
// half (index < half), count[1] the right; the donor reads both back and
// reports lastSpikeCount = sum, lastSpikeCountL / R = the halves (Seed Crystal,
// v0.3.40). Lifted from js/brain/gpu-compute.js.

struct Params {
  n: u32,
  gridX: u32,
  half: u32,
  _pad: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> spikes: array<u32>;
@group(0) @binding(2) var<storage, read_write> count: array<atomic<u32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x + gid.y * params.gridX * 256u;
  if (i >= params.n) { return; }
  if (spikes[i] != 0u) {
    if (i < params.half) {
      atomicAdd(&count[0], 1u);
    } else {
      atomicAdd(&count[1], 1u);
    }
  }
}
