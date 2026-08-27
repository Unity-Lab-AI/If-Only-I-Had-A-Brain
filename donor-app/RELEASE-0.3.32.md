# unity-donor 0.3.32 — `mean_voltage` stops being `null`

**GOTCHA.3b.** `donor.rs` hardcoded `mean_voltage: None`, so the field read `null` on **all seven clusters** for the entire life of the native donor — while every other link in the chain was already built and waiting: the wire field (`protocol.rs:129`), the server's EMA blend (`brain-server.js:6282`), and the `state.js` publish. The browser donor had been proving the shape end-to-end the whole time. This release supplies the one missing piece: a reduction on the donor side.

## What "voltage" means here

⛔ **The name is historical and it misleads.** The live rule is the **Rulkov 2002 2D chaotic map**, not leaky-integrate-and-fire — the shader that runs it is still called `lif.wgsl` for the same reason. State is the `(x, y)` pair, where `x` is the **fast variable** and the membrane-potential analogue. The reported mean is `mean(state[i].x)`.

`y` is deliberately untouched: it is the slow recovery variable, and averaging it would produce a perfectly plausible number that means something else entirely.

## The reduction

- **Partial sums, not an atomic.** WGSL has no atomic float add, and scaling into fixed-point would shed precision on a value that straddles zero. One thread per slot sums its own contiguous run; the host adds the slots.
- **Fixed 256 slots**, so the readback is a constant ~1KB whether the cluster is 50K or 12M. The cost note this work was scoped against asks for "one reduction + one small readback per tick, not a hot path".
- **Engine-level buffers, not per-cluster.** `step_cluster` reduces one cluster at a time, so a single pair of buffers serves all of them and no `Cluster` allocation site was touched.
- **Sampled once per substep RUN**, after the loop — not per substep. `compute.html` carries the same rule with its own comment that per-substep "would be wasteful".
- **The host divides by the real `n`** after summing. A per-chunk mean-of-means would weight a short final chunk equally with a full one and drift from the CPU shadow's `sum / n` — the mirror of the short-final-bucket trap `bucket_mean.wgsl` documents.
- **`None` on any failure, never `Some(0.0)`.** ⛔ `0.0` is a legitimate mean for a Rulkov population straddling zero, so a zero-on-error would be indistinguishable from a genuinely quiet cluster — which is precisely the failure this field exists to end. Both backends unmap on every path, because one leaked mapping would poison every later tick.

## Backends

| backend | status |
|---|---|
| **wgpu** | ✅ live — `shaders/voltage_mean.wgsl` |
| **CUDA** | ⚠ written and staged in `cuda_kernels.cu`, **inert until `kernels.ptx` is regenerated** |

⛔ **Why the CUDA half is staged rather than active, and why that is deliberate.** The CUDA kernels are **not compiled from `cuda_kernels.cu` at build time** — they are loaded from `include_str!("kernels.ptx")`, a precompiled PTX checked into the repo. Adding a kernel to the `.cu` therefore does nothing on its own.

The load is **optional** (`Option<CudaFunction>`): absent from the PTX means this donor simply does not report the field, and the server reads `unreported-by-this-donor` — exactly what `meanVoltageSource` (GOTCHA.3a) was built to say. ⛔ A hard `load_function("voltage_mean")?` would have failed against the current PTX and taken **all of `CudaEngine::new`** with it, breaking every CUDA donor outright for the sake of one telemetry field.

The PTX is **not** regenerated here on purpose: it targets `compute_60`, and the available nvcc is CUDA 13.0, which has dropped that arch. Rebuilding all eight existing kernels on a newer toolkit to add a ninth is a donor-compatibility risk out of all proportion to a diagnostic. **When the PTX is regenerated with `voltage_mean` present, the CUDA half starts reporting with no further code change.**

## A bug caught in this work before it shipped

The first draft of the shader used `@workgroup_size(64)`, while the host computes its dispatch with the shared `dispatch_dims()` — which divides by `const WORKGROUP: u32 = 256`. For 256 slots that returns **one workgroup**: only 64 threads would have launched, `partials[64..255]` would **never have been written**, and the host would have summed stale memory into the mean **every tick, producing a plausible number with no error anywhere**.

Every other shader here uses 256 for exactly this reason — the constant is a **contract with the host**, not a tuning knob. The contract is now written on the shader.

## Compatibility

- **Wire-compatible in both directions.** `mean_voltage` is already `Option<f32>` on the wire (`protocol.rs:129`) with `skip_serializing_if`, so an older server ignores it and an older donor simply omits it. No protocol version change, no server change required.
- **No behavioural change to compute.** This adds a read-only reduction and one small readback per substep run. Step math, plasticity, propagation and the teach verbs are untouched.

## Verification

- `cargo check` clean on default features **and** `--features cuda`.
- ⚠ **WGSL is validated by naga at `build_pipeline`, i.e. at runtime** — `cargo check` does not parse `include_str!` shaders. Every construct is a structural copy of an already-shipping shader (`bucket_mean.wgsl`'s binding/loop/guard shape; `array<vec2<f32>>` verbatim from `lif.wgsl`), which is strong evidence and not proof.
- **What to read after this lands:** `clusters.<name>.meanVoltage` should stop being `null` on a wgpu donor, and `meanVoltageSource` should read `gpu-donor-readback` rather than `unreported-by-this-donor (native donor sends mean_voltage: None — GOTCHA.3b)`.
