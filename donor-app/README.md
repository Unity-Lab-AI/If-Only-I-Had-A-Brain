# unity-donor

Native GPU compute donor for the Unity brain — a compiled, cross-platform (Windows +
Linux) alternative to donating via the browser `compute.html`. Bigger buffers, no
tab-sleep drops, multi-GPU per machine, headless for servers/RunPod, plus a simple GUI.

**Stack:** Rust + `wgpu` (runs the brain's WGSL shaders verbatim). See `BUILD-PLAN.md`
for architecture, the protocol contract, and milestones.

## Status: M0 (scaffold)
CLI flags + GPU enumeration + config + protocol types + embedded shaders. Compiles +
runs (`--list-gpus` enumerates real adapters). WS donor loop (M1), GPU compute (M2),
sparse frames (M3), and GUI (M4) follow.

## Build (per OS — compiled per-platform)
```
# Linux
cargo build --release                      # → target/release/unity-donor
# Windows (from Linux, cross): rustup target add x86_64-pc-windows-gnu
cargo build --release --target x86_64-pc-windows-gnu
# Pure-headless server build (no GUI/windowing deps — ideal for RunPod):
cargo build --release --no-default-features
```

## Run
```
unity-donor --list-gpus                    # see detected GPUs + buffer limits
unity-donor --gpus 0 --utilization 10      # donate card 1 at 10% (GUI defaults)
unity-donor --gpus all --utilization all   # donate everything, full tilt
unity-donor --headless --autostart --server wss://host/ws --gpus all   # server/RunPod
```
GUI build (default) opens a window with per-GPU toggles + utilization sliders + Start/Stop
(M4). `--headless` runs without it.
