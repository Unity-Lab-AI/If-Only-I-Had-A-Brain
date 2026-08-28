# unity-donor 0.3.33 — the CUDA half of `mean_voltage` goes live, with the toolchain matched rather than upgraded

**GOTCHA.3b, completed.** 0.3.32 shipped the wgpu half and left the CUDA half *staged*: the kernel was written into `cuda_kernels.cu` and the launch path into `cuda.rs`, but CUDA kernels load from `include_str!("kernels.ptx")` — a precompiled PTX checked into the repo — so nothing reached a CUDA donor until that PTX was regenerated. This release regenerates it. **A CUDA donor on 0.3.33 reports `mean_voltage`; no other code changed.**

## The whole release is one artifact, and the discipline around it is the point

⛔ **The blocking question was never "write the kernel" — it was "which toolchain regenerates the PTX".** The 0.3.32 note said the PTX targets `compute_60` and the local nvcc (CUDA 13.0) dropped that arch. **Both halves of that turned out wrong on inspection:** the checked-in PTX header reads `.target sm_75` / `.version 8.0`, built by CUDA **12.0.140**. The real constraint is the **PTX ISA version**: a CUDA 13 toolchain emits ISA 9.x, which drivers older than r580 cannot JIT — and a module that fails to JIT fails **whole**, every kernel, kicking that donor to wgpu (headless pods often have no Vulkan, so that can mean no compute at all).

⭐ **The ISA 8.0 pin is a shipped fix, not a preference** — v0.3.21 is literally *"kernels.ptx rebuilt at PTX ISA 8.0; the CUDA path comes back on r570 hosts."* Regenerating on a newer toolkit would have silently un-fixed it.

So the PTX was regenerated with the **exact same compiler build** that made the old one — CUDA 12.0.140 (`nvidia/cuda:12.0.1-devel-ubuntu22.04` container; compiling needs no GPU) at `-arch=sm_75`:

```
docker run --rm -v <donor-app/src>:/w nvidia/cuda:12.0.1-devel-ubuntu22.04 \
  nvcc -ptx -arch=sm_75 -o /w/kernels.ptx /w/cuda_kernels.cu
```

## Verification (no GPU was run — stated plainly, with what covers the gap)

- **Identity diff:** with basic-block labels normalized (`$L__BB<n>_` renumbers when a function is inserted), the **eight pre-existing kernels are byte-identical** to the PTX that has been serving the A40 in production. The new file is the proven file plus one function.
- **Assemble-proof at three real targets:** `ptxas` performs the same PTX→SASS compilation the driver JIT performs. The 12.0 `ptxas` (the generation older drivers JIT with) compiles this PTX clean for `sm_75` (the floor), `sm_86` (the A40 pod) and `sm_89` (Ada); the 13.0 `ptxas` accepts it too, so the newest drivers are covered from the other side.
- **Launch-wiring audit:** `.cu` signature `(n, chunk, state, partials)` against `cuda.rs`'s `b.arg(&n).arg(&chunk).arg(&c.state).arg(&mut partials)`; `cfg(256)` = one block × 256 threads for 256 partial slots, every slot written (an out-of-range slot still writes `0.0`, because the host sums the whole buffer and stale memory would read as signal).
- ⚠ **Not run on a GPU before tagging** — the only local NVIDIA card is the display GPU, which donor policy keeps compute off. The live verdict is loud either way: `meanVoltageSource` flips from `unreported-by-this-donor` to a real value when the pod updates, and stays honest if it doesn't.

## Compatibility

| | 0.3.32 | 0.3.33 |
|---|---|---|
| PTX target / ISA | `sm_75` / 8.0 | `sm_75` / 8.0 — **unchanged** |
| minimum driver for CUDA path | r525+ | r525+ — **unchanged** |
| pre-Turing NVIDIA cards | wgpu fallback | wgpu fallback — **unchanged** |
| `mean_voltage` (wgpu donor) | ✅ | ✅ |
| `mean_voltage` (CUDA donor) | `unreported-by-this-donor` | ✅ **reports** |

The `Option<CudaFunction>` load stays: any future PTX regeneration that drops the kernel degrades to *unreported*, never to a donor that fails to start.

## Operational note

Tagging this release does **not** touch the running A40 — the pod keeps its 0.3.32 binary until it is deliberately updated, which costs a donor drop + full matrix re-upload and should ride the next scheduled pod restart rather than spend a reconnect on telemetry alone.
