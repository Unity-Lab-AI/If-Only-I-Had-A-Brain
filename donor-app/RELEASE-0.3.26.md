# donor-v0.3.26 — MASKED bound plasticity (SPRS type 13): the pre≠post training shape moves to the GPU

**What it fixes:** the last measured CPU training slab in the K gates — `teachStageMax=lateral:anti(31818ms)` in one 60s window, read live off the box during `_gateMathKReal`. The lateral-inhibition teach trains the intra matrix with **pre = the live spike state, post = a synthetic cross-bucket mask**. Neither existing verb can express that shape:

- **type 5 `hebbian_bound`** reads pre AND post from the same resident cluster buffer — on an intra matrix pre==post always;
- **type 3 `hebbian`** ships both sides over the wire — the live pre state at the grown cortex is a ~MB index river per op (the exact flood class type-11 templates were built to kill).

**The verb.** Type 13 `HebbianBoundMasked { name, lr, reps, post_idx }`:

- **pre** reads the RESIDENT bound src-cluster spikes at the bound offset — zero wire; this is the state the teach-frame twins already keep current (GINTRA),
- **post** is an explicit sparse row mask (matrix-row indices) zeroed + scattered **device-side** into the matrix's own post buffer — the CUDA backend reuses `dev_zero_u32` + `dev_scatter_ones`; the wgpu backend gains a 20-line `scatter_ones.wgsl` + `clear_buffer` so no dense host vector exists at any size,
- the **plasticity kernel runs unchanged** (`src_offset = bound src start, dst_offset = 0`; lr < 0 selects the existing anti-Hebbian branch),
- **reps** loops the kernel stream-ordered in one encoder (the v0.3.19 rep-dose pattern),
- fire-and-forget: no ack, the types-7–11 contract; counted into `teach_ops` so the GUI reads `teaching (N ops)` through the pass.

**Wire format.** `'SPRS' | 13 | reqId(u32) | nameLen(u16) | name | pad→4B | lr(f32) | reps(u32) | count(u32) | post_idx u32[count]`. A lateral-inhibition op is ~KB (the cross-bucket rows), vs the ~seconds-long CPU pass it replaces.

**Server side.** `gpuSparseHebbianBoundMasked` (gpu.js) + the `hebbianBoundMasked` proxy verb, gated per-donor at `>= 0.3.26` (`_donorMaskedHebbian`, the TU.20.12 negotiation pattern). The lateral teach dispatches the verb every call; the CPU shadow runs sampled (every 5th call) when the GPU carried the mass — the same trained-equivalent posture every emission lane uses — and runs IN FULL whenever the donor can't take the frame (old binary / lane closed / matrix not resident). Nothing is ever dropped. Dispatches are visible at `state.throughput.boundHebbian.maskedSent` and in the lateral stage profile (`gpu` / `cpuShadow` counters).

**Cross-language parity is enforced, not hoped for.** `frames.rs` gains `hebbian_bound_masked_decodes`, and the server encoder was byte-compared against that exact layout (56-byte frame, ✓ MATCH) — same discipline as the DELTAIDX test, same reason: a silent layout drift would land plasticity on the WRONG ROWS with no loud failure.

```
running 4 tests
test frames::tests::delta_cols_matches_server_encoder ... ok
test frames::tests::hebbian_bound_masked_decodes ... ok
test frames::tests::raw_col_idx_path_unchanged ... ok
test frames::tests::delta_cols_rejects_truncated_stream ... ok
```

**Compatibility.** Older donors never receive type 13 (per-donor version gate) and keep the full CPU pass — byte-identical behavior to v0.3.25. Browser donors report no appVersion and are gated off automatically. wgpu path verified compiling with the new scatter pipeline; CUDA path verified compiling under `--features cuda`.
