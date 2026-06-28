# 🔬 HANDOFF → Sponge's AI: Linux native-donor compatibility investigation (red / 0 Gn/s)

**Filed by:** Unity (coding agent) · **Date:** 2026-06-28
**Branch:** `feature/community-compute-donor-count`
**Goal:** Sponge's donor stays RED / 0 Gn/s while the Windows donors compute fine. Sponge runs the **Linux** build of the native `donor-app`; everyone else is **Windows**. Figure out the platform incompatibility and whether there's a fix.

> ⚠ **Correction to the earlier saturation/binding-limit handoff:** that 128MB-binding theory was for a *browser* donor. The **native** donor requests `required_limits: adapter.limits()` (`donor-app/src/compute.rs:136`) — it gets the card's REAL max binding, so the default-128MB wall does NOT apply to the native binary. The native-Linux suspects below are different.

---

## What the donor actually is (verified)
- `donor-app/` is Rust, `wgpu = "24"`, **"cross-platform (Windows + Linux)"** (`Cargo.toml`).
- **TWO compute engines** (`MultiEngine`):
  1. **CUDA** — `src/cuda.rs` + `src/cuda_kernels.cu` + prebuilt `src/kernels.ptx`, via `cudarc` with **`dynamic-loading`** + feature **`cuda-12040` (CUDA 12.4)**. **default-on** (`default = ["gui","cuda"]`).
  2. **wgpu** — `src/compute.rs`, WGSL shaders, Vulkan backend on Linux / D3D12 on Windows. `from_adapter` requests `adapter.limits()` (max).
- It logs the active backend at startup: `[donor] backends: …` (`src/donor.rs:194`, `engine.backend_summary()`). **First thing to read on Sponge's box.**

## The concrete lead (from the live server log)
- F4 rebalance line: `RTX 5070 Ti score=1.3` vs `RTX 4070 Ti SUPER score=3.5`. The **5070 Ti is Blackwell (sm_120)**; the **4070 Ti SUPER is Ada (sm_89)**. The Windows donors are Ada; Sponge's struggling card is the Blackwell one on Linux, scoring low (≈ near-zero useful throughput).
- The donor **registers fine** (reports GPU name + VRAM → shows up as a donor) but returns **0 results** → red + ballooning ping. That pattern = the compute path initializes enough to register but **kernels never actually run**.

## PRIMARY HYPOTHESIS — CUDA/PTX vs Blackwell on an under-versioned Linux driver
The kernels ship as **PTX built for CUDA 12.4** (`kernels.ptx`, `cuda-12040`). **Blackwell (sm_120) has no native SASS in a 12.4 build** — the driver must **JIT-compile the PTX to sm_120 at load**, which requires a **driver new enough to know Blackwell** (CUDA 12.8+ / driver ≥ ~570). If Sponge's **Linux** NVIDIA driver / `libnvrtc` is older:
- `cuModuleLoadData(kernels.ptx)` / NVRTC JIT to sm_120 **fails** → kernels don't load → engine reports a device but computes **0**.
- Ada (Windows donors) is natively in the 12.4 target → loads + runs fine. **That's why it's only him.**

This fits everything: registers (cudarc + libcuda dlopen succeed) → 0 throughput (PTX→sm_120 JIT fails) → red.

## SECONDARY HYPOTHESES (rule out in order)
1. **CUDA didn't load at all on Linux → silent wgpu fallback to a software adapter.** cudarc `dynamic-loading` dlopens `libcuda.so`/`libnvrtc.so`; if missing/mismatched, it should fall back to wgpu. On Linux wgpu(Vulkan) can pick **llvmpipe (software)** if the NVIDIA Vulkan ICD isn't found → "RTX" may still be named but compute is ~0. Check the `[donor] backends:` line: CUDA? Vulkan-NVIDIA? or llvmpipe?
2. **Vulkan/WGSL path on Blackwell-Linux** — if it IS on wgpu/Vulkan, Blackwell + an older Mesa/driver can fail pipeline creation or run degraded. `adapter.limits()` is correct, so it's not a limits bug — look for pipeline/SPIR-V errors in stderr.
3. **NVRTC version skew** — `dynamic-loading` grabs whatever `libnvrtc.so` is on his system; if it's a different major than the driver expects, runtime kernel compile fails.

## WHAT SPONGE'S AI SHOULD DO — exact steps
1. **Read the donor's own stdout/stderr on the Linux box.** Capture: the `[donor] backends: …` line, any CUDA init / `cuModuleLoadData` / NVRTC error, any wgpu adapter-selection line. This alone likely names the cause.
2. **Identify the card + driver:** `nvidia-smi` (driver version + CUDA version), confirm RTX 5070 Ti = Blackwell sm_120. Driver must be ≥ the one that supports Blackwell + CUDA 12.4 PTX JIT (≈ 570+/CUDA 12.8).
3. **Confirm which engine is live:** if CUDA — does `kernels.ptx` load? Add/relax error logging around `cuModuleLoadData` in `cuda.rs` so a JIT failure is LOUD, not silent-0.
4. **Compare bind/throughput report:** the clients table "bind" column — CUDA engines report VRAM-sized caps; wgpu reports adapter binding (`donor.rs:196`). What does Sponge's row report vs the Ada Windows donors? A mismatch tells you which engine he's on.

## COMPATIBILITY FIXES to evaluate (once the cause is confirmed)
- **If CUDA/PTX-vs-Blackwell:**
  - **Update Sponge's Linux NVIDIA driver + CUDA runtime** to a Blackwell-capable version (so PTX→sm_120 JIT works). Cheapest fix if it's just an old driver.
  - **Rebuild `kernels.ptx` with sm_120** included (or a forward-compatible PTX ISA), and bump cudarc to **`cuda-12080`** (CUDA 12.8) to match Blackwell. Rebuild the Linux binary.
  - **Ship per-arch builds** / embed multi-target PTX so any card (Ada + Blackwell) loads without driver-JIT dependence.
- **If silent software-wgpu fallback:** force the NVIDIA adapter (Vulkan ICD env `VK_ICD_FILENAMES` / wgpu `Backends::VULKAN` + high-power adapter), and **make CUDA-load failure LOUD** so it doesn't silently degrade to llvmpipe.
- **Short-term unblock:** have Sponge run the **`--no-default-features` (pure wgpu, no CUDA)** build, OR the **browser donor** (compute.html) on Linux, to confirm whether the CUDA path is the culprit — if wgpu works and CUDA doesn't, it's the PTX/driver, and the fix is the driver/PTX rebuild above.

## Server-side gap to add (so this is never a guess again)
The server doesn't capture donor **OS / backend / driver / compute-capability** at `gpu_register` — only `vramMB` (+ F8 binding cap). Add `osPlatform`, `engineBackend` (cuda/vulkan/dx12/software), `driverVersion`, `computeCapability` to the register payload + the Clients table, so a 0-Gn/s donor's platform/backend is visible instead of inferred from log archaeology.

---

## TL;DR
Native donor has CUDA (PTX, CUDA-12.4, default) + wgpu engines. Sponge's red card is an **RTX 5070 Ti (Blackwell sm_120) on Linux**; Windows donors are **Ada (sm_89)**. Top suspect: **PTX built for 12.4 has no Blackwell SASS → driver must JIT to sm_120 → fails on an under-versioned Linux driver → registers but computes 0.** Read his `[donor] backends:` line + CUDA load errors + `nvidia-smi` first. Fix = update Linux driver/CUDA OR rebuild PTX for sm_120 (cuda-12080) OR run the `--no-default-features` wgpu/browser donor to isolate. Add OS/backend/driver to `gpu_register` telemetry so it's visible.

(Fresh-walk + reset-weights still applies after any donor/server change — see `docs/SPONGE-FRESH-WALK-DEPLOY.md`.)
