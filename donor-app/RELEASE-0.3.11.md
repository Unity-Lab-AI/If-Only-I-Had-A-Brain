# unity-donor v0.3.11 — ONE PROCESS: the mind's eye (+ her voice's equations) on the donor

The donor that computes her brain now ALSO computes her imagery and speaks the
voice-equation protocol. One machine, one process, her whole mind.

## What's new in this binary

- **`mindspace_op` / `mindspace_result` protocol** — the brain routes her
  mind's-eye ops to the donor and awaits the reply (30s deadline, priority
  work lane so imagery never queues behind a teach flood):
  - `perceive` — RGBA image → field-C record (forward CDF 9/7, energy-target
    sparsify, int16 quant + LEB128 delta positions)
  - `describe` — field C → 64-dim percept value-vector (f32 LE, base64)
  - `stylizeField` — posterized styled render + her label strokes rasterized
    BOLD/silhouetted into the field before re-equationalizing
  - `traceLineArt` — clean-ink contour tracer (box-blur → Sobel → NMS →
    strongest-first bidirectional follow → RDP → one ink)
  - `perceiveAudio` / `reconstructAudio` — her VOICE's field-A equations
    (1-D CDF 9/7 over 32768-sample chunks @24kHz). Ships in this binary so the
    brain's voice-bank lane can land later server-side only, with no donor
    re-release.
- **`gpu_register` additions** — `mindspaceV1: true` + `mindspaceOps: [...]`
  (per-op capability list; the brain checks the op name before dispatch, so
  anything not in the list falls to its local ramp with zero round-trips).
- All new ops are pure CPU in `src/mindspace.rs` (line-faithful port of the
  brain's `js/brain/mindspace/transform.js` + `audio.js` CPU reference — same
  constants, same wire format; records round-trip bit-compatibly).

## NOT in this binary (deliberate)

- `imagineFromState` (de-novo daydream) — needs the glyph/state-plane renderer;
  a divergent render would make her thought look different per donor. Lands in
  a later binary with a true port. The brain's local ramp covers it.
- The piper ONNX voice **synth** — stays viewer-side (wasm) this release.
  Evaluating the `ort` crate for the native donor is the next binary's call.
- Type-6 sparse-index propagate (`sparseV2`) — still browser-donor only; this
  binary keeps the legacy dense path (the brain gates per-socket).

## Build (Sponge / CI — no cargo on the dev box)

```bash
# Linux GUI+CUDA (default features)
cargo build --release                      # → target/release/unity-donor

# Windows cross-build (from Linux)
rustup target add x86_64-pc-windows-gnu
cargo build --release --target x86_64-pc-windows-gnu

# Pure portable headless (AMD/no-CUDA)
cargo build --release --no-default-features
```

## Publish + rollout sequence (ORDER MATTERS)

1. Build both targets, publish binaries as a **Forgejo release** tagged
   `donor-v0.3.11` (same channel as v0.3.10).
2. Install v0.3.11 on the live donor host(s); confirm the brain log shows the
   register with `mindspaceV1` and the ops list, and mind's-eye frames keep
   flowing (`mindspace <op>` lines in the donor activity on a draw).
3. **Only after** every active donor runs v0.3.11: set
   `DREAM_MIN_DONOR_VERSION=0.3.11` on the box (env; default stays 0.3.7 in
   code) — that is the ramp-removal milestone for the server's local
   mind-space worker fallback. Do NOT set it before step 2 or the live donor
   gets refused at register and the brain goes donor-less.
