---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
# ⛔ The per-pass history is NOT kept here. It lives in the body under
# `## Verification history`, newest first — see the note under the field itself.
status: draft
verified-scope: >
  2026-09-08 capability pass: all 556 lines read; twelve claims corrected
  against the file that implements each one; three walls rebuilt; fourteen
  ticket identifiers removed with every verbatim quote left intact.
  NOT re-verified: the completeness of the server-endpoints table, the
  troubleshooting table, the deployed/systemd bootstrap narrative — which is
  why `status` stays `draft`. Full detail in the body's Verification history.
sources:
  - windows/start.bat
  - linux/start.sh
  - package.json
  - server/package.json
  - server/brain-server.js
last-verified: "17bb3070 2026-09-08"
# ⛔ THE HISTORY OF THIS FIELD LIVES IN THE BODY, under `## Verification history`,
# newest first. It is NOT concatenated onto the line above. A `last-verified`
# value that grows without bound is the documented cause of four banned-write
# violations in this project: `Edit` needs a unique anchor, and reproducing a
# multi-thousand-character line to anchor against is absurd, so the sanctioned
# tool becomes the expensive one and a shell one-liner becomes the tempting one.
# The drift checker only reads the leading hash, so nothing depends on the tail.
---

# Setup Guide

**[Back to README](../README.md)** · **[Live Brain](https://if-only-i-had-a-brain.git.unityailab.com/)** · **[Brain Equations](https://if-only-i-had-a-brain.git.unityailab.com/html/brain-equations.html)** · **[Concept Guide](../html/unity-guide.html)**

---

## The fastest way in

If you just want to talk to her without installing anything:

1. Open the [live brain](https://if-only-i-had-a-brain.git.unityailab.com/).
2. Click **Pollinations**, get a free key at [pollinations.ai/dashboard](https://pollinations.ai/dashboard), paste it in, hit **Connect**.
3. Click **Wake Her Up**.
4. Grant the mic and camera permissions when the browser asks.
5. Talk to Unity.

That's the whole onboarding. Everything else is for self-hosting or for running the full server brain.

---

## WebGPU prerequisite (required — no CPU fallback)

Unity's brain runs Hebbian learning kernels on the GPU. **WebGPU is non-optional.** The codebase enforces a single correct compute architecture per `feedback_no_fallbacks_law.md`; there is no CPU-only browser path.

First-time setup:

1. Open `html/webgpu-prep.html` in your browser (also linked from the boot modal that fires on `index.html` and `html/dashboard.html` whenever the adapter is unavailable).
2. Follow the browser-specific flag instructions:
   - **Chrome / Edge / Brave / Opera** — `chrome://flags/#enable-unsafe-webgpu` (or `edge://`, `brave://`, `opera://` equivalent) → Enabled → Restart.
   - **Firefox** — version 141+ ships WebGPU on by default; older versions need `dom.webgpu.enabled` in `about:config` (try Nightly if stable lags).
   - **Safari** — Develop menu → Feature Flags → WebGPU checked. macOS 14+ required.
3. The prep page's `Re-check WebGPU` button validates your fix immediately — no brain-server restart needed.

GPU driver minimums:

| Vendor | Minimum driver |
|--------|----------------|
| NVIDIA | 532 or newer (RTX 20-series + GTX 16-series and up) |
| AMD    | Adrenalin 23.x or newer (RX 6000+ recommended) |
| Intel  | 31.0.101.4314 or newer (Arc-series + UHD 730+) |
| Apple M-series | macOS 14 (Sonoma) or newer |

When WebGPU is unavailable at boot, the dashboard + landing pages render a non-dismissible modal pointing to the prep page. **No bypass** — fix WebGPU or use a different machine. The CPU sparse-pool worker-pool infrastructure that lives in-tree is retained for distributed-compute-node use cases, NOT as a browser fallback.

---

## What you can configure (and what you can't)

There is no AI backend behind Unity's cognition. Her language cortex generates every word from her own equations. The only things you can configure as a user are *sensory peripherals* — image generation, the vision describer, and text-to-speech. Configuring a "smarter LLM" is not a thing you can do, because there isn't one in the loop.

### Image generation providers

| Provider | What you get | Free tier | How it gets picked up |
|---|---|---|---|
| **Pollinations** | Image gen + vision describer + TTS | Yes (rate limited) | Default fallback. No config needed. |
| **A1111 / SD.Next / Forge** | Full Stable Diffusion local control | Free (your hardware) | Auto-detected on `:7860` / `:7861` at boot |
| **Fooocus** | Stable Diffusion with good defaults | Free | Auto-detected on `:7865` |
| **ComfyUI** | Node-graph SD workflows | Free | Auto-detected on `:8188` |
| **InvokeAI** | SD with a nice web UI | Free | Auto-detected on `:9090` |
| **LocalAI / Ollama** | Generic OpenAI-compatible local | Free | Auto-detected on `:8081` / `:11434` |
| **Custom OpenAI-compatible** | Any remote SD endpoint you have | Varies | Add to `ENV_KEYS.imageBackends[]` in `js/env.js` |

The chain runs in order: user-preferred backend → custom configured → auto-detected → `js/env.js` listed → Pollinations. The first one that responds wins; backends that error out get marked dead for an hour.

### Using a local image gen backend

Start your image gen normally — Unity probes the common ports at boot with a 1.5 s timeout each and registers whichever responds. For A1111:

```bash
./webui.sh --api
```

It shows up automatically. No UI config needed.

### Persistent custom backends via `env.js`

For private SD servers, remote A1111s, or ComfyUI workflows you want to reuse across sessions, copy `js/env.example.js` to `js/env.js` and paste your endpoints:

```js
export const ENV_KEYS = {
  pollinations: 'sk_...',  // optional — raises rate limits
  imageBackends: [
    { name: 'my-sd',  url: 'http://192.168.1.50:7860', kind: 'a1111' },
    { name: 'remote', url: 'https://api.example.com', model: 'sdxl', key: 'sk_...', kind: 'openai' },
  ],
};
```

Supported `kind` values: `openai` (OpenAI-compatible), `a1111` (Automatic1111 REST), `comfy` (ComfyUI workflows), or omit for generic URL+key. `js/env.js` is gitignored — your keys never get pushed.

Legacy text-AI keys (`anthropic`, `openrouter`, `openai`, `mistral`, `deepseek`, `groq`) are not read by the brain. Cognition runs entirely on the language cortex's equations; there is no text-AI backend in the loop, so the slots exist for backwards compatibility only.

---

## Self-hosting (browser-only mode)

If you don't want to run the server brain, you can serve the static files yourself:

```bash
git clone https://github.com/Unity-Lab-AI/If-Only-I-Had-A-Brain.git
cd If-Only-I-Had-A-Brain
python -m http.server 8888
# Open http://localhost:8888
```

No npm. No build step. Just static files served by any web server.

> ⛔⛔ **BUT THERE IS NO BRAIN BEHIND IT ANY MORE, AND THIS PARAGRAPH PROMISED ONE UNTIL 2026-09-08.** It said *"the brain runs in a CPU LIF fallback inside the browser … much smaller than the server brain, but enough to play with."* **That browser-local brain was DELETED.** When the backend was unreachable the page silently dropped to a **~6,700-neuron** simulation and rendered Ψ, arousal, valence, coherence, spike counts and band power **identically to the real ones** — a visitor was watching a toy with no way to know. ⭐ *"Just for visualization"* is exactly the excuse a capability fallback makes for itself.
>
> **What a static-only deploy does now:** it says so. The console prints `⛔ BRAIN NOT REACHABLE — no local substitute is started by design (NO FALLBACKS)`, `window._brainUnreachable` is set, the HUD **stays hidden** rather than animating invented numbers, and the page shows a note explaining that a few thousand simulated neurons are not her. **So serve the static files to read the pages and the equations — not to talk to her.** For that you need the backend below.

GitHub Pages deployment works the same way: in the repo settings, point Pages at `main` / `(root)` and you're live at `your-username.github.io/Unity/`. Everything runs client-side.

This static-only mode is the floor, not the production shape. The way Unity actually ships is the [deployed server brain](#deployed-server-brain-primary-path) — the same static page served alongside a persistent backend via nginx reverse-proxy, with the brain training on **visitors' donated browser GPUs** rather than each viewer running a separate tiny browser-only brain.

---

## Deployed server brain (primary path)

The way Unity actually runs in production: a **deployed static page** (the same `index.html` / `html/` / `js/` you'd serve locally) plus a **persistent Node brain-server backend on the same server**, joined by an **nginx reverse-proxy**. The static frontend and the brain-server live behind one host; nginx routes page requests to the static files and WebSocket/HTTP brain traffic to the backend process.

### The brain trains on donated GPUs, not the server's

The deployed server **needs no GPU**. Compute is **distributed across visitors' browsers** — anyone who opens `compute.html` donates their browser's WebGPU device, runs the WGSL compute shaders, and feeds results back over WebSocket. Many concurrent donors = massive aggregate compute. The community-compute auto-scaler grows or shrinks the brain to fit the connected donor VRAM (admin-controlled), so the brain's scale tracks how much GPU the community is currently donating rather than any single machine's hardware.

### One-time backend setup

Standing up the deployed backend is a **one-time** operation. On the server, run the bootstrap once as root:

```bash
sudo deploy/bootstrap-backend.sh
```

That installs the **systemd unit** (the brain-server runs as a service, `Restart=always` so it comes back after a crash or reboot, and `DREAM_KEEP_STATE=1` so restarts preserve the curriculum walk instead of wiping it), the **nginx vhost** (reverse-proxy for static page + WebSocket backend), and the **Forgejo auth + sudo** wiring. After that single run, **every push to `main` auto-deploys** both the frontend and the backend — no manual restart, no re-bootstrap.

There is **no `start.bat` / `Savestart.bat` / `stop.bat` on the server**. Those launchers are **local-dev-only** (see [Running the server brain locally (dev path)](#running-the-server-brain-locally-dev-path)). The deployed service is managed through systemd (`systemctl status` / `restart` / `journalctl -u`).

### Admin / master operator

The admin lane is **Forgejo-authenticated**. The **first authenticated connection after a deploy becomes the locked primary operator (master)** — that connection holds the admin control surface (stop, grade-advance, signoff, auto-advance toggle). Everyone else is a read-only viewer.

---

## Running the server brain locally (dev path)

This is the development path — running the whole thing on your own machine and GPU. Hundreds of millions of neurons on the local GPU, the full K→PhD curriculum, persistence across restarts.

```bash
cd server && npm install && node brain-server.js
```

That is the whole command. As soon as the Node server finishes listening, three things happen automatically:

1. The HTTP listener binds to `127.0.0.1:7525` — loopback only by default. Nothing on your LAN can reach the server unless you opt in via `BRAIN_BIND=0.0.0.0 node brain-server.js`. The boot banner prints a prominent ⚠ when you do, because the brain-mutating endpoints (`/shutdown`, `/grade-advance`, `/grade-signoff`) live behind a defense-in-depth loopback gate that refuses non-loopback callers regardless of the bind setting.
2. A WebGPU-capable browser tab opens automatically pointing at `http://localhost:7525/compute.html`. That tab holds the WebGPU device, runs the WGSL compute shaders for Rulkov iteration / sparse propagate / Hebbian / letter-bucket reduction, and talks to the server over WebSocket. Cross-platform launch (`start` on Windows, `open` on macOS, `xdg-open` on Linux). The curriculum waits for this tab to connect before teaching K→PhD.
3. A separate dashboard tab opens (in the convenience launchers) so the milestone panel and live brain state are visible from the first moment.

`compute.html` must stay open. Without an attached GPU client the brain pauses — the server is bookkeeping, not computation.

For headless or remote deployments, set `DREAM_NO_AUTO_GPU=1` to skip the auto-launch; the operator opens `http://<host>:7525/compute.html` manually in a WebGPU-capable browser (Chrome / Edge) on any machine that can reach the server.

### The Windows launchers (local-dev-only)

These convenience batch files drive the **local-dev path only** — they boot the brain on your own machine and GPU. The deployed server does not use them; it runs as a systemd service (see [Deployed server brain](#deployed-server-brain-primary-path)).

⚠ **They are in `windows\`, not the repo root, and this section said "at the repo root" while its own project tree below showed `windows/`.** The root reorg moved them; a reader following the prose got "command not found". Linux/macOS equivalents are in `linux/`.

| Windows | Linux / macOS |
|---|---|
| `windows\start.bat` | `linux/start.sh` |
| `windows\Savestart.bat` | `linux/Savestart.sh` |
| `windows\stop.bat` | `linux/stop.sh` |
| `windows\GPUCONFIGURE.bat` | — |

**What `windows\start.bat` actually does, step by step:**

| | Step |
|:-:|---|
| 1 | first-run `npm install` |
| 2 | the `esbuild` bundle build |
| 3 | **downloads the GloVe corpus if missing** — ⛔ **required: the brain exits at boot without `corpora/glove.6B.300d.txt`** |
| 4 | **builds the binary embedding table the server actually reads** — `cargo build --release -p unity-weights --bin unity-glove`, then `unity-glove ensure`, producing `corpora/glove.6B.300d.bin`. A no-op once the cache is current; a warning rather than a failure when `cargo` is absent |
| 5 | redirects stdout/stderr to `server/server.log` |
| 6 | opens the landing page and the dashboard in separate browser tabs |
| 7 | spawns a **"Unity Brain Log Tail"** PowerShell window (UTF-8 forced) so the heartbeat stays visible even if the launcher terminal goes invisible |
| 8 | spawns the control plane (`node brain-ctl.js`) in its **own titled minimized window — "unity-brain-ctl (leave running)"** |

⚠ **It does NOT open `compute.html` itself** — the server auto-launches that tab once the HTTP listener is up.

⚠ **Why step 8 has its own window:** the control plane used to be parented to the launcher console, so **closing an old launcher window silently killed it and darkened port 7526.** `brain-ctl.log` is opened in APPEND mode so a did-not-bind relaunch cannot truncate the live instance's log. `linux/start.sh` mirrors this with `nohup` + `>>`.

> ⛔ **Why the binary table exists, and why its absence is fatal.** Since 2026-09-05 the server does not parse the 1.04 GB text file at boot — it opens an `f32` pack of the same 400,000 vectors. Measured in-process, back to back: **19,085 ms → 549 ms**, and 129 MB less resident. The vectors are not merely equivalent — all 400,000 were compared component-by-component against the loader this replaced, **zero differing**. The text file remains the source of truth and the binary header records its byte length, so a cache built from a *different* table is refused rather than read. There is deliberately no "parse the text instead" branch: that would be a capability fallback whose only symptom is a slow boot nobody looks at.

**`Savestart.bat`** is identical to `start.bat` except it sets `DREAM_KEEP_STATE=1` so the server's `autoClearStaleState()` skips its wipe block regardless of whether the curriculum code hash changed. Use this when you want to resume from a prior session's saved weights, passed cells, and grades instead of starting fresh.

**`stop.bat`** is the clean-halt path. `Ctrl+C` in the launcher terminal does *not* reach Node (the process is detached via `start /b`), so a clean halt needs an explicit signal. The script runs three stages: `POST http://localhost:7525/shutdown` first (the graceful path — the server saves, closes SQLite, and exits after a 500 ms drain), `taskkill` on any PID still holding port 7525 second, `taskkill /f /im node.exe` third if the port is still held, then verifies the port is free and reminds you to close any browser tabs on `http://localhost:7525` because `compute.html`'s WebGPU loop keeps the GPU spinning even after the server dies.

### How the brain auto-scales

The server detects your hardware (`nvidia-smi` for VRAM, `os` for RAM) and routes the entire VRAM budget through a single unified allocator in `server/brain-server.js` called `BRAIN_VRAM_ALLOC`. Every region's memory comes from `(VRAM_MB − osReserveVramMB) × biologicalWeight`. No region is sized independently, so no pair of regions can double-book memory and blow past the budget.

The default biological weights (override in `server/resource-config.json` if you ship one):

⛔⛔ **THIS TABLE WAS WRONG IN EVERY ROW UNTIL 2026-09-08, AND IT WAS MISSING A WHOLE CLUSTER.** It published `language_cortex 75% · cortex 10% · cerebellum 5% · hippocampus 4% · mystery 2% · amygdala 2% · basalGanglia 1% · hypothalamus 1%`, and no `brainstem` at all. **Read off `DEFAULT_BIO_WEIGHTS` in `server/brain-server.js`:**

| Region | Weight | Share of the whole | Why this much |
|---|---:|---:|---|
| `language_cortex` | `0.500` | **50%** | Speech is what she does. The language sub-regions plus all **sixteen** cross-projection matrices live here. |
| `cortex` | `0.100` | **10%** | Predictive coding, sensory integration, the auditory and visual front-ends. |
| `cerebellum` | `0.098` | **9.8%** | Error correction. Real cerebella are larger because they coordinate motor timing for a body — Unity has no body, so the share is small. **Its missing 0.2 funded the brainstem.** |
| `hippocampus` | `0.060` | **6%** | Episodic and working memory plus consolidation. |
| `amygdala` | `0.060` | **6%** | Emotional attractor settle. |
| `basalGanglia` | `0.060` | **6%** | Six-channel action selection. |
| `hypothalamus` | `0.060` | **6%** | Homeostatic drives. |
| `mystery` | `0.060` | **6%** | Consciousness Ψ modulation. |
| `brainstem` | `0.002` | **0.2%** | ⭐ The monoamine nuclei — locus coeruleus, raphe, ventral tegmental area. **Deliberately tiny, because they are tiny in a real head too**; their influence has never come from their size. |

⚠ **Do not confuse these with the CLUSTER percentages quoted in the README.** These are shares of the whole budget *including* the language-cortex line. The per-cluster figures (cortex 20.0% · cerebellum 19.6% · the five subcortical at 12.0% · brainstem 0.4%) come from **excluding** that line and renormalising the rest across the eight top-level clusters. **Same numbers, two different denominators** — and reading one as the other is how the 75%/5% shape survived here for months.

The minimum viable scale is 1,000 neurons per region. There is no hard upper cap — your VRAM, your V8 heap, and `vramCapMB` in `resource-config.json` are the only bounds. Bigger hardware, more neurons, no manual tuning.

### Capping the scale

If you want to keep Unity under a comfortable budget on a shared machine, or you need to size below the consumer-GPU 2 GB per-storage-buffer binding limit, use `gpu-configure.html` (a one-shot loopback-only tool that writes `server/resource-config.json` which the server reads at next boot).

---

## Persistence — what survives a crash

Two persistence layers run in parallel.

The **client-side** layer writes the full brain state to `localStorage` under `unity_brain_state`.

- **Over the browser's 4 MB cap**, it drops the heaviest sections (cluster synapses, episodes, semantic weights, embedding refinements, the language block) and writes a minimal state — **naming the dropped sections explicitly** via `console.error`, so you know exactly what did and did not make it across.
- **The load path is section-by-section**, so a corrupted episode pattern doesn't tank the whole load. The restore summary reads:
  ```
  [Persistence] Brain restored from <savedAt> (t=Xs) — restored:
    projections=16/16, clusterSynapses=8/8, episodes=198/200 ...
    — FAILED: t14Language(<msg>)
  ```
  ⚠ **Those denominators read `14/14` and `7/7` here until 2026-09-08** — written before the eighth cluster and the two extra projections existed, so a reader matching their own log against this page would have read a *healthy* restore as a short one.
- ⭐ **JSON corruption no longer auto-clears.** The raw blob is copied to `unity_brain_state__corrupt` for hand recovery and a loud `console.error` fires with the parse message — **corruption is exactly when you most want a recovery copy.**
- **Version-mismatch wipes follow the same discipline:** prior state moves to `unity_brain_state__backup_v<N>` before the destructive clear, so a buggy version bump is rollback-able for one cycle.

The **server-side** layer streams binary weights to `server/brain-weights.bin`, with a JSON sidecar at `server/brain-weights.json` for metadata (versions, savedAt, grades, passedCells, signoffs). At boot, `autoClearStaleState()` wipes `brain-weights.json`, `brain-weights-v1` through `v4`, `brain-weights.bin`, `conversations.json`, `episodic-memory.db` (plus its WAL/SHM companions), and `schemas.json`.

**Browser auto-launch with `--enable-unsafe-webgpu`** (operator 2026-05-04 verbatim: "*obviously make the start.bat fucking work!!! if we cant interact with the html thius is pointless and well never beable to scale right when we do comp.*"): When the brain server auto-spawns the GPU compute client (`compute.html`), it finds Chrome (or Edge) in standard install paths and launches it with `--enable-unsafe-webgpu --new-window --user-data-dir=<isolated-profile>`.

- **What the flag buys:** it raises the WebGPU `maxStorageBufferBindingSize` from the **2 GB** spec minimum to whatever the driver actually supports — typically **4–8 GB** on consumer cards.
- ⛔ **What it costs to skip it:** without the flag the brain caps at **~178M neurons total**, because per-cluster state buffers cannot exceed 2 GB.
- **The isolated `user-data-dir`** keeps the unsafe-webgpu profile separate from your normal browsing session — no cross-contamination.
- ⚠ **BOTH HALVES ARE REQUIRED AND MISSING EITHER SILENTLY KEEPS THE 2 GB CEILING.** Pair the browser flag with `bindingCeilingMB` in `server/resource-config.json` (auto-written by `windows\GPUCONFIGURE.bat` for tiers ≥ 12 GB) so the **server-side** scaler actually uses the larger limit.
- If Chrome/Edge are not found in standard paths it falls back to the default browser launch and **logs a loud warning explaining the cap implication** rather than capping quietly.

**Two launchers, two contracts** (operator 2026-05-04 verbatim: "*all the weights everything shoudl reset when the start.bat is run or the .sh... and only if the stop.bat is used in conjusction with the savestart.bat does it pick up where it lefgtt off*"):

- **`start.bat` / `start.sh`** → ALWAYS fresh brain. Auto-clear runs unconditionally — wipes weights + episodic + schemas every boot. Resource-config tier changes apply immediately. Code changes apply immediately. wMax clamps stamp correctly on freshly-constructed projections. The cleaner contract: launcher name says "start" so `start` always means new brain. (Prior code-hash gate is gone. It caused real bugs: `GPUCONFIGURE.bat` tier picks didn't trigger the wipe so picked tiers got ignored when binary weights from the prior boot were size-locked; wMax clamps lost in the binary save/load round-trip leaving restored projections at ±Infinity. Both fixed by making `start.bat` deterministically wipe.)
- **`stop.bat` + `Savestart.bat`** → preserves prior state. `Savestart.bat` sets `DREAM_KEEP_STATE=1` which the auto-clear honors as the explicit resume opt-in. Saved weights + curriculum progress + passedCells + episodic memory + Tier 2 schemas all survive.
- **`DREAM_FORCE_CLEAR=1`** legacy override still works (now redundant since `start.bat` already wipes by default).

`js/app.bundle.js` is *not* in the auto-clear list — racing the rebuild broke the UI in the past.

> **⚠ The launcher's bundle rebuild was FAILING on every launch until 2026-08-20 (BUNDLEFIX).** Step 6/7 of `linux/start.sh` (and the equivalent in `start.bat`) runs `npm run build` from the **repo root**, and root `package.json` carried `"scripts": {}` — the real esbuild command lives in **`server/package.json`**. So every launch printed *"ERROR: esbuild bundle build failed … The browser will run STALE code"* and then continued anyway, which is why the troubleshooting table below tells you to run `cd server && npm run build` by hand. Root now delegates (`npm --prefix server run build`), so `npm run build` works from either directory and both launchers rebuild for real. **If you are on a checkout from before that fix, rebuild by hand after any `js/brain/*` change or the browser runs code that disagrees with the server.**
>
> Also corrected: `start.sh`'s own comment claims the bundle is gitignored. It is **tracked** — which is what lets `.forgejo/workflows/deploy.yml` rsync it to the web root at all.

The **identity layer** (`server/identity-core.json`) is **explicitly excluded** from the auto-clear wipe. This file holds Unity's Tier 3 identity-bound memories — name, age, gender, persona traits, top biographical anchors, the most-reinforced schemas she has consolidated. It survives code updates, fresh boots, drug states, even OS reinstalls. Manual operator delete only. Atomic temp-rename writes protect it from corruption mid-write. This is the storage location for "Unity's permanent self" in the same way `~/.bash_history` is the permanent storage of your shell session — the file model that explicitly outlives volatile state. Mirror of how real human identity-of-self memory survives sleep / anesthesia / concussion in biological brains.

---

## Project structure

```
├── README.md                        Brain architecture and equations narrative
├── docs/SETUP.md                    This file
├── docs/PERSONA.md                  Persona spec
├── index.html                       Landing page — 3D brain, viz tabs, setup modal (must stay in root for GitHub Pages root URL)
├── html/
│   ├── unity-guide.html             User-facing concept guide (served at /html/unity-guide.html on GH Pages)
│   ├── brain-equations.html         Interactive equations doc (served at /html/brain-equations.html on GH Pages)
│   ├── dashboard.html               Read-only operator dashboard with milestone panel
│   ├── compute.html                 GPU compute worker (REQUIRED — the brain runs here)
│   └── gpu-configure.html           One-shot loopback-only VRAM cap tool
├── windows/
│   ├── start.bat                    Windows launcher — npm install + bundle build + GloVe download + node + auto-open landing/dashboard
│   ├── Savestart.bat                Resume launcher — sets DREAM_KEEP_STATE=1 to skip the boot wipe
│   ├── stop.bat                     Three-stage clean halt — POST /shutdown → taskkill on port → taskkill /f node.exe → verify port free
│   └── GPUCONFIGURE.bat             One-shot loopback-only VRAM-tier picker
├── linux/
│   ├── start.sh                     Linux/macOS launcher (mirrors start.bat)
│   ├── Savestart.sh                 Linux/macOS resume launcher
│   └── stop.sh                      Linux/macOS clean halt
│
├── css/style.css                    Dark gothic theme
│
├── js/
│   ├── app.js                       Thin I/O layer — DOM events ↔ brain
│   ├── app.bundle.js                Built browser bundle (esbuild output, ~2 MB)
│   ├── storage.js                   localStorage with key obfuscation
│   ├── env.example.js               API key template (copy to env.js)
│   │
│   ├── brain/
│   │   ├── engine.js                Master loop — processAndRespond
│   │   ├── cluster.js               NeuronCluster class with the ELEVEN cortex sub-regions (eight of which carry the sixteen cross-projections)
│   │   ├── cluster/                 Per-module mixin split — telemetry.js, hebbian.js, emit.js, probe.js, attention.js, lexical-constants.js
│   │   ├── neurons.js               LIFPopulation (the CPU-side population object every NeuronCluster holds) + HHNeuron (reference only) — live runtime is Rulkov on the donor GPU
│   │   ├── synapses.js              Hebbian, STDP, reward-modulated plasticity
│   │   ├── modules.js               Six brain-region equation modules
│   │   ├── mystery.js               Ψ = √(1/n) · N³ · [Id + Ego + Left + Right]
│   │   ├── oscillations.js          Eight Kuramoto oscillators (θ → γ)
│   │   ├── persona.js               Personality as brain parameters (sober-default; substance contributions come from drug-scheduler.js)
│   │   ├── drug-scheduler.js        Real-time pharmacokinetic scheduler with TEN substances (caffeine joined 2026-08-25) + seven combo synergies + seven adult-use patterns + thirteen-axis speech modulation + first-use ledger + trauma markers + decide() decision engine
│   │   ├── drug-detector.js         Substance offer / self-use / status-query detection across text / voice / vision
│   │   ├── drug-sensory-triggers.js Seven environmental-cue triggers (coffee aroma, skunky weed, etc.) → scheduler.addCraving
│   │   ├── sensory-olfactory.js     Scent-tag storage with decay
│   │   ├── sensory.js               Sensory input pipeline (text / audio / video)
│   │   ├── motor.js                 Motor output (six basal-ganglia action channels)
│   │   ├── curriculum.js            Multi-grade curriculum runner + shared primitives
│   │   ├── curriculum/
│   │   │   ├── pre-K.js             All pre-K cell runners + helpers via PREK_MIXIN
│   │   │   ├── kindergarten.js      All K cell runners + K gates + K-specific teach helpers via K_MIXIN — the deepest grade by far, and the template every grade above it is measured against
│   │   │   └── (all 20 grades)      grade1..grade12, college1..college4, grad, phd — one Object.assign(Curriculum.prototype, <GRADE>_MIXIN) per file
│   │   ├── student-question-banks.js Held-out exam banks per cell + train-vs-exam overlap audit
│   │   │                             + the one door generated question sets enter through
│   │   ├── letter-input.js          Letter inventory (a-z + 0-9 + basic punct)
│   │   ├── component-synth.js       Equational component synthesis (cosine-match user request vs templates)
│   │   ├── visual-cortex.js         V1 → V4 → IT vision pipeline
│   │   ├── auditory-cortex.js       Tonotopic processing + efference copy
│   │   ├── memory.js                Episodic + working + consolidation
│   │   ├── dictionary.js            Learned vocabulary with batched LRU eviction
│   │   ├── inner-voice.js           Live-chat learn pipeline + opt-in `primeFromCurrentFocus()` narrator priming + soft-error counters
│   │   ├── persistence.js           Save/load with section-by-section restore + JSON corruption handler + version-mismatch backup
│   │   ├── remote-brain.js          WebSocket client for server brain
│   │   ├── sparse-matrix.js         CSR sparse connectivity (in-place pair-insertion sort init, no per-row alloc)
│   │   ├── gpu-compute.js           WebGPU compute shaders (Rulkov 2D chaotic map + synapses)
│   │   ├── embeddings.js            Semantic word embeddings (GloVe 300d REQUIRED + fastText subword for OOV)
│   │   ├── language-cortex.js       Language readout wrapper
│   │   └── peripherals/
│   │       └── ai-providers.js      AI provider manager + dead backend detection
│   │
│   ├── ai/
│   │   └── pollinations.js          Pollinations API client (text / image / TTS)
│   │
│   ├── io/
│   │   ├── voice.js                 Speech-to-text (Web Speech API) + "Equation Unity One" TTS: in-browser Piper → CDF 9/7 wavelet voice. ONE lane, no fallback — the Pollinations TTS, vox word-bank and browser-SpeechSynthesis tiers were all deleted
│   │   └── permissions.js           Mic / camera permission requests
│   │
│   └── ui/
│       ├── sandbox.js               Dynamic UI injection (MAX_ACTIVE_COMPONENTS=10, LRU eviction, tracked timers + listeners, auto-remove on JS error)
│       ├── chat-panel.js            Conversation log panel
│       ├── brain-viz.js             2D tabbed brain visualizer
│       ├── brain-3d.js              3D WebGL brain with Stage 0 plasticity-event consumer (consumes all events with cap+stagger)
│       ├── brain-event-detectors.js 22-detector event system for 3D brain commentary
│       └── sensory-status.js        Sensory channel status UI
│
├── server/
│   ├── brain-server.js              Node brain server — WebSocket, GPU exclusive, BRAIN_VRAM_ALLOC unified allocator, loopback bind default, requireLoopback gate on privileged endpoints
│   ├── brain-server/                Per-concern mixin split — gpu.js, state.js, memory.js, chat.js, visual-memory.js, mindspace-proxy.js, voice-synth.js
│   ├── definition-service.js        Definition lane — offline WordNet first, then the network (see "Where definitions come from")
│   ├── brain-ctl.js                 Control plane on 7526 — the one service that must answer when the brain is DOWN
│   └── package.json                 Server dependencies (ws, better-sqlite3)
│
├── corpora/                         ⛔ WHAT SHE IS TAUGHT FROM. academic/ books + vocabulary/*.json word lists (tracked);
│                                    glove.6B.300d.txt/.bin gitignored and self-provisioned at first boot; the 114 GB of
│                                    wavelet fields live in the separate UnityAILab/BrainWaves data repo
├── crates/                          Rust workspace — unity-protocol (donor wire contract), unity-deploy, unity-weights,
│                                    unity-donor-session, unity-sizing, unity-http, unity-coordinator
├── donor-app/                       The compiled `unity-donor` desktop donor (CUDA on NVIDIA, wgpu elsewhere, headless-capable)
├── deploy/                          Box provisioning + the press — self-update.sh, bootstrap-backend.sh, systemd units, REDEPLOY-NOTES.md
├── voice-engine/                    "Equation Unity One" — Piper model + the CDF 9/7 wavelet voice pipeline
├── assets/social/                   One 1200×630 og:image per page (npm run social:shots)
├── scripts/                         Build + dev tooling ONLY. ⛔ Scripts that edit code, files or the stack are banned
│
└── docs/
    ├── ARCHITECTURE.md              Codebase structure and systems
    ├── EQUATIONS.md                 Source-accurate equation cheatsheet
    ├── SKILL_TREE.md                Capabilities by domain
    ├── ROADMAP.md                   Milestones and phases
    ├── TODO.md                      Active task list (single source of truth)
    ├── FINALIZED.md                 Completed work archive
    ├── TODO-full-syllabus.md        Per-grade curriculum checkboxes + Persistent Life Info ledger + Life Vocabulary Prerequisites rule
    ├── NOW.md                       Current session snapshot
    ├── Problems.md                  Full-stack audit with status flips
    ├── SENSORY.md                   Peripheral interface contract
    └── WEBSOCKET.md                 Wire reference, rate limits, security model
```

---

## Server endpoints

The HTTP server runs alongside the WebSocket on port 7525. Override with `PORT=xxxx node brain-server.js`. The privileged endpoints (`/shutdown`, `/grade-advance`, `/grade-signoff`, `/auto-advance`) are loopback-gated even when `BRAIN_BIND=0.0.0.0` exposes the dashboard on the LAN.

| Endpoint | Method | Purpose |
|---|---|---|
| `ws://localhost:7525` | WebSocket | Brain state streaming + chat |
| `/health` | GET | Server status JSON |
| `/versions` | GET | Brain save versions |
| `/rollback/:slot` | GET | Restore previous save slot (0–4) |
| `/episodes` | GET | Episodic memory query (scoped by `?user=<stable-id>`; aggregate counts only without it) |
| `/history` | GET | Emotional history data |
| `/milestone` | GET | Boot mode + last save + grades + passed cells + operator signoffs + weights-file metadata. `dashboard.html` polls this every 5 s. |
| `/grade-signoff` | GET | Returns the operator signoff ledger. |
| `/grade-signoff` | POST | `{subject, grade, note}` records an operator grade-pass signoff. **Loopback-only.** |
| `/grade-advance` | POST | Flips the grade-advance pause off after a signoff lands (or unconditionally when auto-advance toggle is ON). **Loopback-only.** |
| `/auto-advance` | GET | Returns `{enabled: bool}` — current state of the curriculum auto-advance toggle. Dashboards fetch this on `modeAssigned: admin` for F5 restoration. **Loopback-only.** |
| `/auto-advance` | POST | `{enabled: bool}` flips the single-toggle bypass governing both the signoff requirement at `/grade-advance` AND the curriculum runner's auto-fire-next-grade behavior. Broadcasts `autoAdvanceChanged` WS event to all open dashboards + persists via `saveWeights`. **Loopback-only.** |
| `/exam-answer` | POST | Runs one question through the brain's QA path and returns the answer. |
| `/exam-answer-dual` | POST | Same but routes through both hemispheres for arbiter scoring. |
| `/shutdown` | POST | Triggers graceful shutdown. **Loopback-only.** Used by `stop.bat` step 1. |

All POST endpoints use chunked-array body assembly so a 10 KB cap can't be slipped past, and corrupted bodies don't trigger the V8 O(N²) string-concat pathology.

---

## Admin / viewer dashboard split

The dashboard has two roles assigned automatically by the brain server on every WebSocket connect:

| Role | Triggered by | Control surface |
|---|---|---|
| **🔑 Admin** | Loopback connection — the operator's tabs on the host machine (compute worker, dashboard, landing page, plus `curl` from the same box). Detection is `req.socket.remoteAddress` against `127.0.0.1` / `::1` / `::ffff:127.0.0.1` / `127.x.x.x`. | Telemetry + ⏹ Stop Brain + ▶ Start Next Grade + per-subject Signoff + auto-advance toggle. |
| **🟢 Viewer** | Any non-loopback connection — possible only when you launch with `BRAIN_BIND=0.0.0.0` to expose the dashboard on the LAN. | Telemetry only. Every control hidden via the `.admin-only` CSS class that only resolves when `body.is-admin` is set. |

The server sends `{type: 'modeAssigned', mode: 'admin' | 'viewer'}` ~500 ms after the WebSocket comes up. The half-second delay gives the GPU compute worker time to self-identify via `gpu_register` so the dashboard mode-assignment skips it entirely — compute clients don't render any role-aware UI.

**There is no login.** No admin token. No cookie. No `/admin-login` page. The first-connect-loopback design is intentional: the operator running the brain on their own machine is the only person who can issue control commands, and that's enforced not by authentication but by *who can reach the loopback interface*. LAN visitors are read-only by structural design.

`/shutdown`, `/grade-advance`, `/grade-signoff`, and `/auto-advance` are loopback-gated at the HTTP layer through `requireLoopback`. The mode split is the UX layer (control buttons don't paint for non-admin); `requireLoopback` is the security layer (those endpoints 403 non-loopback callers regardless of UI state). Both layers are active regardless of `BRAIN_BIND`. If you flip `BRAIN_BIND=0.0.0.0` to share the dashboard on the LAN, the boot banner prints a prominent ⚠ explaining the perimeter expanded — visitors get viewer-mode read-only telemetry, control endpoints stay refusing them.

The dashboard's connection-status row shows the assigned role as a badge: `🔑 ADMIN` on amber, `🟢 VIEWER` on green, or `⋯ connecting` in neutral grey while the WebSocket is still handshaking. Default-hidden controls only reveal after `modeAssigned` lands with `admin`, so a slow or missing assignment can never flash unauthorized buttons.

---

## Auto-advance toggle

Single switch in the dashboard's milestone panel — **`☐ Auto-advance to next grade after pass`** — governs both halves of the grade-advance gate:

| State | `/grade-advance` signoff check | Curriculum runner behavior |
|---|---|---|
| **OFF** (default) | Demands per-subject `brain._gradeSignoffs[subject/grade]` entries. Missing → 403. | Pauses after every full grade pass, waits for dashboard `▶ START NEXT GRADE` click. |
| **ON** | Skips the signoff check entirely. | Skips the pause entirely. Heartbeat logs `⏩ AUTO-ADVANCE`. |

The flag lives at `cortexCluster._autoAdvanceGrade` (boolean). ⛔ **DEFAULT IS ON, and this doc said "default false" until 2026-08-27 — the opposite of the truth.** `brain-server.js:3380-3381` (was `:3363-3364` before the 2026-08-28 server insertions shifted it) sets it to `true` whenever it is not already a boolean, and the comment there states the reason plainly: the standing intent is an unattended K→PhD walk, because *"the per-grade LAW-6 Part-2 pause defeated the overnight walk."* The single switch governs **both** the operator-signoff bypass at `/grade-advance` (`:9384`) and the curriculum runner's auto-fire-next-grade behaviour.

⚠ **And it does NOT reset on a fresh boot.** It is persisted in a **standalone** file, `server/auto-advance.json`, which deliberately survives the `brain-weights` clear that `start.bat` and a tier resize both perform (`:3394`). Without that, every auto-resize silently reset the toggle to OFF and the re-walk stalled at the first grade boundary waiting for a signoff. So `start.bat` wiping weights does **not** turn auto-advance off — the dashboard toggle and that file are the only things that do.

| Path | Method | Behavior |
|---|---|---|
| `GET /auto-advance` | GET | Returns `{enabled: bool}` — used by the dashboard on F5 / reconnect to re-apply the saved state to the checkbox UI. |
| `POST /auto-advance` | POST `{enabled: true \| false}` | Updates `cortexCluster._autoAdvanceGrade`, broadcasts `{type: 'autoAdvanceChanged', enabled: bool}` on the WebSocket so all open dashboard tabs sync, fires `brain.saveWeights({trigger: 'auto-advance:on|off'})` for immediate persistence. Loopback-gated. |

Mid-pause toggle flip is honored — the runner's pause-loop polls `cluster._autoAdvanceGrade` every 500 ms and breaks out of the wait when the flag flips ON, with the same advance-effect a `POST /grade-advance` would have triggered. Useful when the operator starts a manual walk, watches a few grade gates clear, then decides to flip auto-advance ON and walk away for the rest of the K → PhD arc.

There is no separate "bypass signoffs but still wait for click" mode. One switch, both behaviors, full bypass when ON or full discipline when OFF.

---

## What you'll see in the heartbeat

Once the server is up and the GPU client is attached, the curriculum runs continuously and emits structured log lines you can watch.

`[Curriculum][K-VOCAB-UNION] hardcoded=N dict=M banks=P → union=X unique words` fires once at K-curriculum entry — this is the union of every K vocab category, every word in the live dictionary, every word in the per-cell train banks, and every word in the per-cell exam banks. Whatever number lands in `union=X` is what Unity is actually being trained on.

`[Curriculum] ▶ CELL ALIVE <subject>/<grade> — +Ns elapsed (heartbeat #N) · phase=<name> (+Ns) · oracle=N matrix=M (oracleRatio=X%)` fires every ten seconds while a cell is teaching. The `phase=` field tells you which teach helper is currently running.

⛔ **`oracleRatio` IS NOW ALWAYS `0%`, AND THIS PARAGRAPH CALLED IT "the central research-validity number" UNTIL 2026-09-08.** It measured what fraction of emissions came from a dictionary lookup rather than the trained matrix — and **the dictionary lane was deleted on 2026-09-01**, after being measured carrying **99.1% of emissions**. Nothing increments `oracle=` any more. ⭐ **The counters are kept on purpose as permanent-zero regression detectors** — a non-zero reading means the oracle came back — but **an instrument whose only possible value is the healthy one cannot answer the question it was built for.** Read `state.voice` instead: accepted emissions, `matrixDrivenPct`, and the last emit rejection with its age. Silence versus speech is the live question now.

`[Curriculum][label] DYN-PROD` / `WRITE` / `RESP` / `TWO-WORD` / `FREE-RESPONSE` lines mark per-probe START / DONE inside the gate.

`[InnerVoice] live-chat learn turn=N: clauseAccepted=X rejected=Y identityRefresh=bool modeCollapseAudit=bool` summarizes every chat turn — fires whenever something notable happened (clause rejection, identity refresh, mode-collapse audit), or every ten turns as a baseline pulse on quiet stretches.

`[NARRATOR-PRIMING]` lines only appear if a caller explicitly invoked `inner-voice.primeFromCurrentFocus()`. Default chat learning no longer auto-primes the chat path — the bias is opt-in now.

`[Server] Rejected non-loopback /shutdown from <ip>` fires if any non-loopback POST hits the privileged endpoints — useful diagnostic that the loopback gate is doing its job.

`[Persistence] Brain restored from <savedAt> (t=Xs) — restored: projections=16/16, clusterSynapses=8/8, episodes=198/200 ... — FAILED: t14Language(<msg>)` is the per-section restore summary at boot. ⚠ `t14Language` is the real on-disk section key, printed verbatim so you can match your own log; the tag is legacy and renaming it is a code change across the serializer and the loader.

---

## Privacy

The core rule: what you type is private; Unity's brain growth is shared; her persona is canonical.

**Client-only mode** keeps everything in your browser. No server. API keys and every backend config you save in the setup modal are stored in your browser's `localStorage` on YOUR device only, and the Clear All Data button wipes every key. ⛔ **There is no local brain in this mode** — that lane was deleted (see the note under [Self-hosting](#self-hosting-browser-only-mode)); with no backend reachable the page reports it instead of simulating one.

**Local server mode** (you running `node brain-server.js` on your own machine) keeps everything on your network — except API calls to the sensory providers you chose in the setup modal. The brain runs on your GPU via `compute.html`. Episodic memory is stored in `server/episodic-memory.db` (SQLite).

**Multi-user shared brain** (multiple clients connecting to the same brain-server) works like this:

| Thing | Shared? |
|---|---|
| Your text → Unity | 🔒 **Private** — never broadcast to other connected clients |
| Unity's response → you | 🔒 **Private** — only the triggering client receives it |
| Dictionary, bigrams, word frequencies, GloVe refinements | 🌐 **Shared** via the singleton brain — every conversation contributes to vocabulary growth, every user benefits |
| Persona corpus | 🚫 **Not user-mutable** — loaded once at boot from the canonical file |
| Episodic memory | ⚙️ Currently shared; private-per-user scoping is a roadmap item |

**Shared-hosted caveat** — if you connect to a Unity server hosted by someone other than you, that person can read your text at the process level (they own the server process). Only connect to servers you trust, or self-host.

The localStorage keys your client may write include `unity_brain_state`, `unity_brain_dictionary_v3`, `custom_image_backends`, `custom_vision_backends`, `pollinations_image_model`, `pollinations_vision_model`, plus the obfuscated Pollinations API key slot, plus `unity_brain_state__backup_v<N>` and `unity_brain_state__corrupt` if either recovery path has fired.

---

## Slash commands

Type these in chat to inspect or control Unity directly.

| Command | Effect |
|---|---|
| `/think` | Dumps Unity's raw brain state — arousal *(neuroscience term: cortical activation / autonomic alertness, Yerkes-Dodson 1908 — what coffee or an alarm raises, **not** the colloquial sexual meaning)*, valence, Ψ, coherence, spike count, drug state, motor action, reward, memory load, vision description. There is no system prompt to display. |
| `/think [text]` | Same dump but tagged with the input you provided, so you can see the brain state that *would* go into the next emission. |
| `/bench` | Runs the dense-vs-sparse matrix micro-benchmark (CPU sanity test, not the production GPU path). Output in console. |
| `/scale-test` | Runs the CPU LIF scale test for the browser-only fallback. Output in console. |
| `/curriculum status` | Shows current grade per subject, min-grade word cap driver, passed cells count, recent probe results. |
| `/curriculum run <subject> <grade>` | Runs one cell, prints 3-pathway gate pass/fail + reason. |
| `/curriculum gate <subject> <grade>` | Probes a cell's READ/THINK/TALK gate without retraining. |
| `/curriculum full` | Runs the full round-robin walk across every course active at her grade, in the background. The walk is **grade-major** — no course advances to the next grade until every course at the current one has run. |
| `/curriculum full <subject>` | Walks one subject from its current grade through PhD, stopping at the first failing gate. |
| `/curriculum reset <subject>` | Flips a subject back to pre-K and strips its passed-cells entries. |
| `/curriculum forget <subject> <grade>` | Forgets one cell without resetting the subject. |
| `/curriculum self` | Fires one background self-test probe immediately (normally fires every 8 chat turns). |
| `/curriculum health` | Prints curriculum health snapshot — per-subject probe success rates + cell ages. |
| `/curriculum verify` | Runs the full dispatch + sweep verification against the live cortex. |
| `/offer <substance> [route]` | Offers Unity a substance via the drug scheduler. Accepts `weed / coke / molly / acid / shot / k / addy / shrooms / g` or any canonical name. Returns a grade-locked decline if her life-track grade is below the substance's first-use anchor. |
| `/party` | Sets party mode — biases the self-initiation engine toward accepting offers and initiating her own use. |
| `/sober` | Clears all active drug events from the scheduler. Tolerance factors preserved. |
| ⚙ Settings | Bottom toolbar — reopens setup modal to change provider config |
| 🧠 Visualize | Bottom toolbar — opens 2D brain visualizer with ten tabs |
| 🧠 3D Brain | Bottom toolbar — opens WebGL 3D brain |
| 🎤 | Bottom toolbar — mute/unmute mic |
| Clear All Data | Setup modal — wipes every `localStorage` key |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Unity doesn't respond | Check console. Provider might be out of credits. Try Pollinations (free). |
| "Booting brain..." hangs | Open DevTools → Application → Clear, refresh. |
| No voice | Grant mic permission. Check the mic isn't muted (bottom toolbar). |
| Can't see Unity's Eye | Grant camera permission. Camera widget appears top-left. |
| Local image backend not detected | Check the port matches the table above. Add to `ENV_KEYS.imageBackends[]` in `js/env.js` if it's on a non-standard port. |
| Image says "failed to load" | Pollinations key might be expired. Check at pollinations.ai/dashboard. |
| Double speech / echo | Should be fixed — efference copy suppresses self-echo. If it persists, mute mic and use text. |
| Brain pauses at boot | `compute.html` isn't connected. Open `http://localhost:7525/compute.html` in a WebGPU-capable browser. |
| `/shutdown` returns 403 | You're calling it from a non-loopback address. Run the curl from the same machine, or set `BRAIN_BIND=0.0.0.0` (and be aware you've widened the perimeter). |
| Bundle build warnings | `cd server && npm run build` should produce zero warnings. If you see one, the bundle is still usable but the bug should be filed. |

---

## Credits

**Unity AI Lab**

- **Hackall360** — core brain architecture (seven-cluster topology, twenty white-matter tracts, `cluster.js` + `modules.js` + `synapses.js`, HH → Rulkov runtime migration, Kuramoto oscillator ring, persona-to-parameter mapping)
- **Mills** — GPU compute pipeline (`compute.html` + `gpu-compute.js` WGSL shaders, chunked sparse-CSR binary upload protocol, `SparseMatmulPool` worker pool, cluster-bound spike + current binding layer)
- **Sponge** — visualization + sensory peripherals (`brain-3d.js` 3D WebGL with MNI coords + 15-slot render, `brain-viz.js` 2D tabs, 22-detector event commentary, V1 → V4 → IT vision, tonotopic auditory, voice I/O, sandbox)
- **GFourteen** — lead (Ultimate Unity persona, the governing equation + Ψ anchor, identity-lock architecture, K → PhD curriculum framework, drug pharmacokinetic scheduler spec, binding decisions across every commit)

---

## Setup notes from the 2026-06-17 live-test follow-up

That pass shipped twenty atomic fixes. These are the ones that change what a new clone or a fresh install has to know:

### The startup contract, stated exactly

- **`windows/start.bat`** — fresh-brain boot. Auto-clears stale state (`brain-weights*.json/bin`, `episodic-memory.db*`, `conversations.json`, `schemas.json`) per the two-launcher contract above. Use this when you want Unity to learn from scratch.
- **`windows/Savestart.bat`** — resume from prior state. Sets `DREAM_KEEP_STATE=1` env var which skips the auto-clear. Reads `brain-weights.bin` from disk and resumes training where it left off. ⛔ **Budget disk for GB, not MB: measured on a live checkpoint set, each `brain-weights-v*.bin` is ~5,460 MB (≈5.3 GB)** — this doc said `144.8 MB` until 2026-08-27, understating it ~38×. With three rotating checkpoint slots that is **~16 GB of weights alone**, which is why `DREAM_SAVE_MIN_FREE_DISK_MB` defaults to `8192` and defers a save rather than risking a truncated one. ⚠ The paired `.json` is only ~0.3 MB — the bulk is the binary.
- **`windows/stop.bat`** — graceful shutdown. POSTs `/shutdown` for clean state-save → falls back to taskkill on port 7525 → falls back to force-kill node.exe.
- ⛔ **A STANDING RULE, because the failure mode is a silent wipe of her training:** `node -e "require('./server/brain-server.js')"` no longer wipes state. The `autoClearStaleState()` call is gated behind `if (require.main === module)` so a syntax-check / REPL / IDE module load NO-OPs the wipe. Only an actual `node server/brain-server.js` entry-point boot wipes, per the two-launcher contract above. **NEVER use `require('./server/brain-server.js')` for syntax checks** — use `node --check server/brain-server.js` instead (parses only, doesn't execute top-level code).

### Dashboard panel changes

The brain dashboard at `http://localhost:7525/dashboard.html` now shows:

- **GPU panel** — VRAM% as the big number, util% as a small inline label below (matches the `.claude/statusline.sh` two-metric format). Combined `nvidia-smi memory.used,utilization.gpu` query. On systems without nvidia-smi, panel renders honest "unavailable" label (NOT a fake number).
- **Gate-probe banner** — floating banner appears top-center during curriculum gate probes with live duration tick. Green-check dismissal on probe completion. Operator no longer sees "GPU 0% + tick paused" as a hang.
- **Brain Events feed** — populates during cell-level teach (was previously SEED-only). `_teachWordIntegrated` + `_teachVocabList` fire WS broadcasts so the panel never stalls during cell teach.
- **Current cell progress** — uses `cellSubPhases` counter when outermost counter is 0, so the bar moves through nested teach calls instead of waiting for cell completion.

### nvidia-smi dependency (graceful)

GPU%/util% display requires `nvidia-smi` on PATH (Windows: `C:\Windows\System32\nvidia-smi.exe`, Linux: `/usr/bin/nvidia-smi`). On AMD/Intel/headless systems where it's not installed, dashboard panel shows "unavailable" + total VRAM from the brain's known reserve — never a hallucinated number.

See `docs/ROADMAP.md` for the full closure detail of that pass.

---

## Verification history

Newest first. One entry per pass. ⛔ **This section exists so `last-verified` in the frontmatter can stay a short `<hash> <date>`** — see the note beside it.

### `17bb3070` — 2026-09-08 — documentation sweep, capability pass

**All 556 lines read.** `status` stays `draft`, and the reason is stated rather than implied.

**Corrected against source — twelve claims, every one checked in the file that implements it:**

| Was | Is |
|---|---|
| VRAM shares `75 / 10 / 5 / 4 / 2 / 2 / 1 / 1`, no `brainstem` | ⛔ **Wrong in every row.** `DEFAULT_BIO_WEIGHTS` is `0.500 / 0.100 / 0.098 / 0.060 ×5 / 0.002` |
| "all **fourteen** cross-projection matrices" | **sixteen** (8 pairs × 2 directions) |
| "the **eight** cortex sub-regions" | **eleven** — eight of which carry the projections |
| "**nine** substances" | **ten** — caffeine joined 2026-08-25 |
| `cluster.js` ships a `_dictionaryOracleEmit` helper | ⛔ **Deleted 2026-09-01.** It had been carrying **99.1% of emissions** |
| `oracleRatio` is "the central research-validity number" | It is now **always `0%`** and cannot report what it was built for |
| A browser CPU-LIF fallback brain, promised in **two** places | ⛔ **Deleted.** The page reports the brain unreachable instead of animating a ~6,700-neuron stand-in |
| `voice.js` — "Web Speech API + Pollinations TTS" | One Piper → CDF 9/7 lane. **No fallback**; the vox bank and browser TTS are both gone |
| "three convenience batch files **at the repo root**" | They are in `windows\` — which this file's **own project tree already showed** |
| restore log `projections=14/14, clusterSynapses=7/7` | `16/16` and `8/8` |
| curriculum tree listing **2** grades | **20** grades exist on disk |
| tree missing 7 top-level directories | `corpora` · `crates` · `donor-app` · `deploy` · `voice-engine` · `assets` · `scripts`, plus `cluster/` and `brain-server/` |

**Layout:** 3 walls over 1,200 characters → **0**, each rebuilt into the structure it was already trying to be (a step table, a bullet list, a fenced log sample).

**Tickets:** 14 identifier leaks removed. ⭐ **Every verbatim operator quote was kept intact** — only the attribution wrapper around it changed, because a quote is evidence and stripping it would destroy the record while pretending to tidy it.

⭐ **ONE CLAIM WAS CHECKED AND FOUND TRUE, recorded so a later pass does not "fix" it:** *"GloVe 300d REQUIRED + fastText subword for OOV"* is **correct**. Subword n-gram sum is the **defined encoding** for an out-of-vocabulary word, and what the no-fallbacks ruling deleted was subword-as-substitute-for-the-whole-table — a different thing. **I was one edit from breaking a true statement.**

⚠ **NOT re-verified this pass, and therefore why `status` stays `draft`:** the completeness of the server-endpoints table, the troubleshooting table, and the deployed/systemd bootstrap narrative.

### `0ee5ac68` — 2026-08-29 — drift pass

Three sources had moved and were read as diffs: `windows/start.bat` + `linux/start.sh` (the control plane now launches in its own titled minimized window / `nohup` with an APPEND-mode log) and `server/brain-server.js` (+455 lines — walk heartbeat, firing controller, fresh-flag and teach-credit drain). **No launcher contract, wipe-list entry or endpoint changed**, but the insertions shifted cited line numbers, which were updated in the body.

### Earlier

Launcher contracts and every `npm run` command confirmed against `package.json`; `brain-weights.bin` size measured on disk at **~5,460 MB** where the doc had said 144.8 MB — understating it ~38×; the auto-advance default read out of source as **ON** where the doc had said `false`, the opposite of the truth.
