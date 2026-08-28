# unity-donor 0.3.34 — the native donor gets the Ψ hemisphere gate, and per-region attention reaches donor stepping at all

**RHYTHM3S.2, second half.** The first half (server-side, same day) folded `actionGate` and the theta Kuramoto modulation into the drive the donor already receives. This release closes the two gate-side gaps the same measurement found.

## What was wrong

⛔ **The native donor never applied Ψ to region gates.** `compute.rs` set every gate to `1.0` at init with the comment *"psi modulation is a later refinement"* — and never touched them again. The **browser donor has recomputed gates from Ψ on every batch since T17.7** (`updateRegionGates(clusterName, psi)`). So a pod donor stepped the brain **without the hemisphere modulation browser donors apply** — a silent physics divergence between donor types, live in production until this release.

⛔ **Per-region attention reached no donor at all.** The server's `attentionGain` writes (word_motor arousal boost, etc.) fed only the CPU step's lookup — which never runs for cortex at biological scale. Attention was a biasing signal in the design and a no-op in the physics.

## What this release does

- **Per-batch gate rebuild, native side.** `donor.rs` caches each cluster's full protocol regions (including `side`, which the engines' `(start, end)` maps had been dropping) at `gpu_init`, and rebuilds the `[start, end, gate, pad]` table on every `compute_batch`: `gate = hemisphereGate(side, Ψ) × attentionGain`. The formula is byte-for-byte the browser's (`gpu-compute.js:943`): bilateral/center → `1.0`; lateralized → `0.5 + 0.5·sigmoid(Ψ·4)`; absent side takes the sigmoid path exactly as `undefined` does in JS. Verified: **JS-vs-Rust maxDiff = 0 over the probe set, including the undefined-side case.**
- **Regions emitted in sorted-name order** — deterministic, and deliberately decoupled from `HashMap` iteration order (each entry carries its own start/end, so the kernel does not care, and an order dependency between init and update is a bug that never gets to exist).
- **`regionGains` rides `compute_batch`** (new optional per-cluster field): the server sends non-1.0 attention gains clamped to `[0.5, 2.0]` (the CPU step's own clamp), the donor re-clamps. **Compatible in both directions** — older donors ignore the unknown JSON field (serde default), older servers simply never send it, older browser pages pass `undefined` and get pure-Ψ gates.
- **The browser donor consumes the same gains** (`gpu-compute.js` + `compute.html`), so both donor types now apply identical gate physics.
- Engine plumbing: `update_region_gates` on both backends — wgpu `write_buffer` capped at the init-allocated capacity; CUDA replaces the ~256-byte device slice via the already-proven `memcpy_stod` (failure keeps previous values and says so, never zeros).

## Cost

~256 bytes of gate table per cluster per batch (the browser donor has paid exactly this since T17.7, described in its own comment as *"zero cost relative to the per-neuron compute"*), plus ~100 bytes of JSON when attention gains are active.

## Compatibility

| | 0.3.33 | 0.3.34 |
|---|---|---|
| PTX / ISA / driver floor | `sm_75` / 8.0 / r525+ | **unchanged** |
| Ψ hemisphere gate (browser donor) | ✅ every batch | ✅ every batch |
| Ψ hemisphere gate (native donor) | ⛔ never (gates pinned 1.0) | ✅ **every batch** |
| per-region attention (any donor) | ⛔ never | ✅ **rides `compute_batch`** |

## Operational note

Tagging does not touch the running A40 — it keeps its current binary until deliberately updated (donor drop + full matrix re-upload; ride the next scheduled pod restart). ⚠ **Expectation for the first 0.3.34 pod boot:** lateralized-region firing rates will shift with Ψ where they previously ran ungated — that is the fix landing, not a regression. At high Ψ the sigmoid saturates toward 1.0, so the day-to-day delta is small; the structural change is that Ψ and attention are now *in* the stepping equation on every donor type.
