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
GUI build (default) opens **"Unity Brain Donor"** — a 1280×720 resizable, **OS light/white
themed** (high-contrast dark text on white — readable, no more washed-out grey-on-white),
tabbed app: **Donate** (server Live/Local radio, leaderboard name, GPU summary, green
Start / red Stop, verbose status, per-GPU rows), **Settings** (GPU selectors + util + auto-
reconnect + server incl. Custom), **Dashboard** (this machine's live stats + link to the public
dashboard), **Leaderboard** (your contribution + link to the live board), **About**. An
**Auto-reconnect** checkbox lives in Settings; a **📖 How it works / legend** link is on Donate
+ About. `--headless` runs without the window. On **Windows** the GUI build launches with
**no console window** behind it (`windows_subsystem = "windows"` on the `gui` feature build) —
the pure-headless `--no-default-features` CLI build keeps its console so server/RunPod
operators still see stdout.

## Auto-reconnect (default ON)
A dropped/closed connection (or an initial connect failure) now **auto-rejoins** after a
short backoff instead of going dark until someone presses Start again — the donor
supervises its own session. A user **Stop** / Ctrl+C never reconnects. Disable with
`--no-auto-restart` (headless) or by unchecking the GUI box. The backoff starts at 2 s and
caps at 30 s; a real session that simply dropped resets it.
