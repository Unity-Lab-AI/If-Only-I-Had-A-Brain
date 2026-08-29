# unity-donor 0.3.35 — the noise term was 20,000× the reference, and one JSON null could discard a whole message

**FIREMATH + BATCHNULL hardening.** Two defects, both of the same species: the native donor silently diverging from the browser reference it claims byte-compatibility with.

## What was wrong

⛔ **The Rulkov noise term dropped its scaling in the port.** The browser reference (`gpu-compute.js`) injects `jitter = (rand[0,1] − 0.5) × noiseAmp × 0.0001` into the slow variable — ±(noiseAmp × 5e-5), comparable to the map's own μ=0.001 drift. Both native kernels (`lif.wgsl`, `cuda_kernels.cu`) shipped `jitter = rand[−1,1] × noiseAmp` — **±5 to ±13 per step, ~20,000× the reference.** The slow variable `y` random-walked out of the bursting-attractor basin, the fast variable pinned one sign, and firing collapsed to accidental crossings: **measured ~0.4-0.8% steady-state on both production brains against the map's true 9.6-33% range.** Drive had no authority at all under that noise (its entire influence on `y` is ±μ ≈ ±0.0015/step), which is why a ×10 drive multiplier moved firing by nothing. Reproduced exactly in simulation: broken formula → first-steps ~5.8% decaying to 0.85%; reference formula → 9.6% at σ=−1 rising to 33% at σ=+0.5.

⛔ **The escaped-state reseed guard was also dropped in the port.** The browser reseeds any NaN/escaped neuron (`|x|>100 or |y|>100`) back into the attractor basin every step; the native kernels never did — so state damaged by the noise bug could only heal via a full reconnect re-init.

⛔ **One `null` field discarded the entire message.** serde rejects JSON `null` for a bare `f32`, and the tagged dispatch drops the whole message on any field error (`Err(_) => ignore`, silent by design). A NaN-turned-null `tonicDrive` (BATCHNULL, server-side, fixed 2026-08-28) therefore cost the ENTIRE step lane for a day on both brains — every `compute_batch` unparseable, 180s timeouts, spikes 0, Ψ starved, and the zombie-kick pod-drop loop — with zero donor-side evidence.

## What this release does

- **Noise matches the reference exactly**: `rand[−1,1] × 0.5 × noiseAmp × 0.0001` in both kernels — identical ±amplitude to the browser's `(rand[0,1] − 0.5) × noiseAmp × 0.0001`. `kernels.ptx` regenerated with the sanctioned CUDA 12.0 toolchain (ISA 8.0 / `sm_75`, r525+ floor **unchanged**); new constants verified present in the committed PTX.
- **The basin reseed guard now runs in both native kernels** (byte-matched to the browser: golden-ratio low-discrepancy reseed into x∈(−1,−0.5), y∈(−3.2,−2.8)) — a donor carrying noise-smashed state from an earlier build heals itself on its first step after upgrade, no re-init required.
- **Null-tolerant numerics on every modulation field** (`ClusterParams`, `ComputeBatch.psi`, `GpuInit`): a JSON `null` degrades to that field's own default (gates → 1.0, additive terms → 0.0) instead of taking the message down with it. A `null` value inside `regionGains` drops that entry (kernel default 1.0).
- **Unparseable messages are never silent again**: the dispatch names the message `type` and serde's reason on stderr, rate-limited to one line per 30s with a running dropped-count.

## Expected behavior change

Firing rates come UP — from the broken ~0.4% to the map's real range (~9.6% at zero drive, ~19-24% at nominal tonic drives). The server's firing-rate controller (FIREKNOB, re-aimed server-side the same day to the drive knob's measured authority) steers toward its target and reports honestly when the target sits below the map's ~9.6% intrinsic floor.

## Compatibility

| | 0.3.34 | 0.3.35 |
|---|---|---|
| PTX / ISA / driver floor | `sm_75` / 8.0 / r525+ | **unchanged** |
| Rulkov noise scale | ⛔ ±noiseAmp (20,000× reference) | ✅ **±noiseAmp×5e-5 (byte-matched to browser)** |
| escaped-state reseed guard | ⛔ absent (browser-only) | ✅ **both kernels** |
| `null` in a numeric field | ⛔ whole message silently discarded | ✅ **field degrades to its default** |
| unparseable message | ⛔ silent | ✅ **named + counted on stderr (30s rate-limit)** |
