# unity-donor — native GPU compute donor (BUILD PLAN)

> A standalone, compiled, cross-platform (Windows + Linux) application that
> connects to the Unity brain-server as a GPU compute donor — what the browser
> `compute.html` does today, but native: bigger buffers, no tab-sleep drops,
> multi-GPU per machine, headless for RunPod/servers, and a simple elegant GUI.
>
> **Stack:** Rust + `wgpu` (runs the brain's WGSL shaders verbatim) + `eframe`/`egui`
> (GUI) + `tokio` + `tokio-tungstenite` (WS) + `serde` (JSON) + `bytemuck` (binary
> frames). Confirmed with Sponge 2026-06-22.
>
> **Status:** scaffolding (M0). Multi-stage build — see milestones.

---

## Why this stack
- `wgpu` is native WebGPU (the reference impl) — the brain's WGSL compute shaders
  (Rulkov LIF, synapse propagate, Oja plasticity, spike/voltage reductions) run
  **verbatim**, no porting. It also exposes the card's *real* buffer limits (not the
  browser's 1–4 GB cap) → the growth headroom from `docs/DONOR-SCALING-DECISION.md`.
- One `cargo build --release` per target = a single lean binary, no runtime to bundle
  (vs Python/PyInstaller). Cross-platform from one codebase.
- `eframe`/`egui` is immediate-mode — sliders/toggles/start-stop with almost no
  ceremony, compiles *into* the binary. Simple, not over-engineered.

## Build profiles (versatile + headless)
- **GUI build** (default features): `cargo build --release` → desktop app w/ GUI.
  `--headless` runtime flag runs it without opening the window.
- **Pure-headless build** (`--no-default-features`): NO windowing/GUI deps at all —
  ideal for a RunPod/server container. `gui` is a cargo feature so servers never pull
  X11/wayland/winit.

## CLI flags (clap) — "specifics or all, essentially"
```
unity-donor [OPTIONS]
  --server <URL>            brain WS URL (default ws://localhost:7525 ; wss://host/ws deployed)
  --name <LABEL>            donor label shown in admin telemetry
  --list-gpus               enumerate detected GPUs and exit
  --gpus <IDX,IDX|all>      which GPUs to donate (default: 0 = card 1). e.g. --gpus 0,2  /  --gpus all
  --utilization <PCT|all>   target compute % per GPU via duty-cycling (default 10 ; "all"=100)
  --memory <MB|all>         GPU memory cap per GPU (default: all)
  --headless                run without the GUI (GUI build only; the no-default-features build is always headless)
  --autostart               begin donating immediately (headless default true; GUI default FALSE — must press Start)
```
Multi-GPU = one donor connection (one full replica) per selected GPU, per
`docs/DONOR-SCALING-DECISION.md` (replicas, not sharding).

## GUI design (simple, elegant, fleshed-out — not over-engineered)
- A row per detected GPU: **toggle** (enabled/disabled) + **utilization slider** (0–100%).
- **Defaults: card 1 (GPU 0) enabled, utilization 10%** — but **nothing runs until you
  press ▶ Start** (safe start). ⏹ Stop = graceful: finish the current batch, send a clean
  WS close, free the GPU (safe stop, so the brain cleanly drops/promotes the donor).
- Mini status panel: **Server total** (community compute / connected donors / brain size)
  and **Your contribution** (your steps/sec, % of community) — read from the `welcome`/
  state broadcast + `gpu_telemetry` we send. Nothing else.

## Module layout
```
src/
  main.rs        CLI parse + mode dispatch (headless loop vs GUI)
  cli.rs         clap definitions
  config.rs      DonorConfig (gpus, utilization, memory, server, name) — from flags or GUI
  protocol.rs    serde structs for JSON msgs + binary-frame (SPRS/SPRR) encode/decode
  gpu/mod.rs     wgpu device/adapter enumeration, per-cluster buffers, shader pipelines, step()
  gpu/shaders/   *.wgsl lifted verbatim from js/brain/gpu-compute.js
  donor.rs       per-GPU WS client: connect→gpu_register→handle msgs→compute→ack/result; throttle; start/stop
  gui.rs         (feature=gui) eframe app — GPU rows, sliders, start/stop, status
  telemetry.rs   contribution tracking (steps/sec) + server-total parsing
```

## Protocol contract (from the mapped spec — implementation target)
**MVP (accepted + contributing):** WS connect `/ws` → send `gpu_register {vramMB,
maxStorageBindingMB, gpuName}` → handle `gpu_init` (alloc per-cluster `state vec2<f32>`,
`spikes u32`, `currents f32`; seed Rulkov basin) → send `gpu_init_ack` ×clusters →
handle `compute_batch` (substep loop: run `LIF_SHADER` + `SPIKE_COUNT_SHADER` per
cluster, accumulate) → send `compute_batch_result {perCluster spikeCountTotal/last}`.
Shaders required: **LIF (Rulkov) + spike-count**.

**Full participation (adds):** sparse binary frames `SPRS/SPRR` type=1 (upload), type=4
(chunked >16 MB upload), type=2 (propagate), type=3 (hebbian), type=5 (batched hebbian);
shaders **synapse-propagate + Oja-plasticity + voltage-stats**; region ops
(`write_spike_slice`/`write_current_slice`/`clear_spike_region`/`readback_letter_buckets`);
`rebind_sparse` (cluster-bound matrices); `gpu_telemetry` (5 s) + `device_lost`; replica
pool sync. Server validates spike counts (clamp to [0,size]); 5 bad results = quarantine
→ we must always return finite, clamped counts + honor backpressure (≤4 in-flight, socket
buffer < 2 MB) + 30 s op timeouts + device-lost auto-reconnect.

## Milestones
- **M0 — DONE:** project + plan + CLI flags + **wgpu GPU enumeration** (`--list-gpus`) +
  embedded WGSL shaders + protocol JSON structs. `cargo check` green; ran on real HW.
- **M1 — DONE:** WS client (tokio-tungstenite) → connect + `gpu_register` (advertises the
  per-binding cap) + the JSON message loop: `gpu_init`→alloc/seed + `gpu_init_ack`,
  `compute_batch`→substep loop→`compute_batch_result`; duty-cycle utilization throttle;
  Ctrl+C safe-stop (clean WS close). Compiles. (`src/donor.rs`.)
- **M2 — compute VERIFIED:** wgpu device + per-cluster buffers + LIF (Rulkov) + spike-count
  pipelines + `step()`. **Verified on the RTX 4070** via `--self-test`: 1M neurons, spike
  rate evolves + settles to ~3.6% (sparse, biologically plausible). The `compute_batch`
  path uses it. (`src/compute.rs`.)
- **⚠ M3 is required before connecting to the LIVE brain.** The MVP (M1+M2) registers,
  acks `gpu_init`, and runs the Rulkov step loop — but it does NOT yet handle the binary
  sparse-matrix uploads (SPRS/SPRR), so the brain can't sync it to a full replica (those
  uploads would time out). Verify M1's round-trip against a local mock until M3 lands.
- **M3 core — DONE (kernels + codec GPU-verified):** synapse-propagate + Oja-plasticity
  WGSL shaders (verified on the RTX: known 4x4 CSR → exact currents `[3,0,0,5]`); binary
  SPRS/SPRR codec (`frames.rs`) for type=1 upload / 4 chunked (assembled) / 2 propagate /
  3 hebbian / 5 batched, round-trip self-tested; wired into the donor loop with SPRR acks.
  **M3.2 remaining:** region-op JSON messages (`write_spike_slice` / `write_current_slice`
  / `clear_spike_region` / `readback_letter_buckets`) + cluster-bound matrix slices (used
  during curriculum teach/probes). Until M3.2, base compute + matrix upload/propagate/
  hebbian work, but curriculum region probes are unhandled (readback would time out —
  bounded by the brain's #112.9 budget). ⇒ first live test = register/init/compute/matrix
  ops; full curriculum participation needs M3.2.
- **M4:** eframe GUI (per-GPU rows/sliders/start-stop/status panel: server-total + your
  contribution), default card 1 @ 10% require-Start.
- **M5:** packaging — `cargo build --release` per target (Win/Linux), headless container
  recipe for RunPod.

## Verification reality
M0–M1 compile-check here. M2+ (actual GPU compute correctness — exact Rulkov math,
spike-count validity against the server's checks) require a real GPU + the live brain, so
those land + get verified on Sponge's machine. The brain accepts a native donor on the
existing protocol TODAY (no backend change needed for MVP); the Path R capability
handshake (`docs/MULTI-GPU-DONOR-TODO.md`) is a later robustness add, not a blocker.
