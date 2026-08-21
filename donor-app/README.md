# unity-donor

Native GPU compute donor for the Unity brain — a compiled, cross-platform (Windows +
Linux) alternative to donating via the browser `compute.html`. Bigger buffers, no
tab-sleep drops, multi-GPU per machine, headless for servers/RunPod, plus a simple GUI.

**Stack:** Rust + `wgpu` (runs the brain's WGSL shaders verbatim). See `BUILD-PLAN.md`
for architecture, the protocol contract, and milestones.

## Status: v0.3.26 — SHIPPING (M0–M4 all delivered)

This said "M0 (scaffold)" for a long time after it stopped being true. Current reality:

- **M1 WS donor loop** — supervised reconnect, half-open detection, send forensics.
- **M2 GPU compute** — wgpu **and** a CUDA backend (`cudarc`, dynamic-loaded, so one binary runs on AMD/Intel too). On a CUDA-only Linux host with no Vulkan stack it donates over CUDA and skips wgpu entirely: `[gpu] no wgpu adapter found, but CUDA reports N device(s)`.
- **M3 sparse frames** — binary teach/propagate, delta-varint colIdx, `hebbian_ranges`, batched Hebbian, and (v0.3.26) **masked bound plasticity** (SPRS type 13): pre from the resident bound spikes, post from a sparse row mask zeroed + scattered device-side (`scatter_ones.wgsl` on wgpu, `dev_zero_u32`/`dev_scatter_ones` on CUDA), same plasticity kernel, `reps` looped stream-ordered. See `RELEASE-0.3.26.md`.
- **M4 GUI** — plus `--headless` for servers/RunPod.
- **Mind-space ops** — `perceive` / `describe` / `stylizeField` / `traceLineArt` / audio field-A, on the priority lane.

**Two behaviours worth knowing before you run it (both changed 2026-08-20):**

1. **`--utilization` defaults to `all`, not `10`.** It never duty-cycled anything — nothing in `compute.rs`/`cuda.rs` reads it, the card always computes flat out. It is *declared* to the brain, which sizes your donation as `fullVram × pct/100`. At the old default a 24GB card announced itself as **2.4GB**, could not hold the cortex, and was handed almost no work — a whole GPU donated and left idle. Holding back is now the thing you ask for.
2. **One entry per PHYSICAL GPU.** `--list-gpus` used to print the same card once per backend on Windows (Vulkan **and** DX12 are both `PRIMARY`), so `--gpus all` counted one card as two donors and the brain believed it had two full weight replicas. De-duplicated by `(vendor, device, name)`.

**One thing the flags cannot fix:** if your card cannot hold the FULL running brain it will never be PRIMARY, and **the canonical weight upload only ever targets the PRIMARY** — so it joins as a partial replica and receives no matrices at all, while still showing healthy cluster coverage and a real Gn/s rate. The brain logs the number at register (`needs ~NMB`), and the dashboard now prints `⛔ N GB SHORT of PRIMARY`.

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
unity-donor --gpus 0 --utilization 10      # hold back: treat card 1 as 10% of itself
unity-donor --gpus all --utilization all   # donate everything (THIS IS THE DEFAULT since v0.3.24)
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
