// Atomic count of spiking neurons in a cluster. Returns one u32 the donor reads back
// and reports as spikeCount. Lifted from js/brain/gpu-compute.js.

struct Params {
  n: u32,
  gridX: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> spikes: array<u32>;
@group(0) @binding(2) var<storage, read_write> count: array<atomic<u32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x + gid.y * params.gridX * 256u;
  if (i >= params.n) { return; }
  if (spikes[i] != 0u) {
    atomicAdd(&count[0], 1u);
  }
}
