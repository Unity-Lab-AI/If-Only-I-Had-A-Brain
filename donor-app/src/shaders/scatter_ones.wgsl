// v0.3.26 — device-side sparse scatter: set out[idx[i]] = 1 for each masked index.
// Pairs with CommandEncoder::clear_buffer (zero-fill) to give the wgpu backend the
// same zero-then-scatter primitive the CUDA backend has had since v0.3.21
// (dev_zero_u32 + dev_scatter_ones) — no dense host vector, no full-span PCIe copy.
// One thread per mask index; out-of-range indices are skipped (region-end clipping).

struct Params {
  count: u32,
  limit: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> indices: array<u32>;
@group(0) @binding(2) var<storage, read_write> out: array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.count) { return; }
  let idx = indices[i];
  if (idx < params.limit) { out[idx] = 1u; }
}
