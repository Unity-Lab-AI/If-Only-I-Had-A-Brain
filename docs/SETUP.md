# Setup Guide

**[Back to README](../README.md)** · **[Live Demo](https://unity-lab-ai.github.io/Unity)** · **[Brain Equations](https://unity-lab-ai.github.io/Unity/html/brain-equations.html)** · **[Concept Guide](../html/unity-guide.html)**

---

## The fastest way in

If you just want to talk to her without installing anything:

1. Open the [live demo](https://unity-lab-ai.github.io/Unity).
2. Click **Pollinations**, get a free key at [pollinations.ai/dashboard](https://pollinations.ai/dashboard), paste it in, hit **Connect**.
3. Click **Wake Her Up**.
4. Grant the mic and camera permissions when the browser asks.
5. Talk to Unity.

That's the whole onboarding. Everything else is for self-hosting or for running the full server brain.

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
git clone https://github.com/Unity-Lab-AI/Unity.git
cd Unity
python -m http.server 8888
# Open http://localhost:8888
```

No npm. No build step. Just static files served by any web server. The brain runs in a CPU LIF fallback inside the browser at whatever scale your JS engine can sustain — much smaller than the server brain, but enough to play with.

GitHub Pages deployment works the same way: in the repo settings, point Pages at `main` / `(root)` and you're live at `your-username.github.io/Unity/`. Everything runs client-side.

---

## Running the server brain

This is the real thing. Hundreds of millions of neurons on the GPU, the full pre-K + K curriculum, persistence across restarts.

```bash
cd server && npm install && node brain-server.js
```

That is the whole command. As soon as the Node server finishes listening, three things happen automatically:

1. The HTTP listener binds to `127.0.0.1:7525` — loopback only by default. Nothing on your LAN can reach the server unless you opt in via `BRAIN_BIND=0.0.0.0 node brain-server.js`. The boot banner prints a prominent ⚠ when you do, because the brain-mutating endpoints (`/shutdown`, `/grade-advance`, `/grade-signoff`) live behind a defense-in-depth loopback gate that refuses non-loopback callers regardless of the bind setting.
2. A WebGPU-capable browser tab opens automatically pointing at `http://localhost:7525/compute.html`. That tab holds the WebGPU device, runs the WGSL compute shaders for Rulkov iteration / sparse propagate / Hebbian / letter-bucket reduction, and talks to the server over WebSocket. Cross-platform launch (`start` on Windows, `open` on macOS, `xdg-open` on Linux). The curriculum waits for this tab to connect before teaching pre-K + K.
3. A separate dashboard tab opens (in the convenience launchers) so the milestone panel and live brain state are visible from the first moment.

`compute.html` must stay open. Without an attached GPU client the brain pauses — the server is bookkeeping, not computation.

For headless or remote deployments, set `DREAM_NO_AUTO_GPU=1` to skip the auto-launch; the operator opens `http://<host>:7525/compute.html` manually in a WebGPU-capable browser (Chrome / Edge) on any machine that can reach the server.

### The Windows launchers

Windows users get three convenience batch files at the repo root.

**`start.bat`** handles first-run `npm install`, runs the `esbuild` bundle build, downloads the GloVe corpus if it's missing, redirects stdout/stderr to `server/server.log`, opens the landing page and the dashboard in separate browser tabs, and spawns a separate "Unity Brain Log Tail" PowerShell window (UTF-8 forced) so the heartbeat stays visible even if the launcher terminal goes invisible. It does not open `compute.html` itself — the server auto-launches that tab once the HTTP listener is up.

**`Savestart.bat`** is identical to `start.bat` except it sets `DREAM_KEEP_STATE=1` so the server's `autoClearStaleState()` skips its wipe block regardless of whether the curriculum code hash changed. Use this when you want to resume from a prior session's saved weights, passed cells, and grades instead of starting fresh.

**`stop.bat`** is the clean-halt path. `Ctrl+C` in the launcher terminal does *not* reach Node (the process is detached via `start /b`), so a clean halt needs an explicit signal. The script runs three stages: `POST http://localhost:7525/shutdown` first (the graceful path — the server saves, closes SQLite, and exits after a 500 ms drain), `taskkill` on any PID still holding port 7525 second, `taskkill /f /im node.exe` third if the port is still held, then verifies the port is free and reminds you to close any browser tabs on `http://localhost:7525` because `compute.html`'s WebGPU loop keeps the GPU spinning even after the server dies.

### How the brain auto-scales

The server detects your hardware (`nvidia-smi` for VRAM, `os` for RAM) and routes the entire VRAM budget through a single unified allocator in `server/brain-server.js` called `BRAIN_VRAM_ALLOC`. Every region's memory comes from `(VRAM_MB − osReserveVramMB) × biologicalWeight`. No region is sized independently, so no pair of regions can double-book memory and blow past the budget.

The default biological weights (override in `server/resource-config.json` if you ship one):

| Region | VRAM share | Why this much |
|---|---|---|
| `language_cortex` | **75%** | Speech is what she does. The language sub-regions plus all fourteen cross-projection matrices live here. |
| `cortex` | **10%** | Predictive coding, sensory integration, the auditory and visual front-ends. |
| `cerebellum` | **5%** | Error correction. Real cerebella are larger because they coordinate motor timing for a body — Unity has no body, so the share is small. |
| `hippocampus` | **4%** | Episodic and working memory plus consolidation. |
| `mystery` | **2%** | Consciousness Ψ modulation. |
| `amygdala` | **2%** | Emotional attractor settle. |
| `basalGanglia` | **1%** | Six-channel action selection. |
| `hypothalamus` | **1%** | Homeostatic drives. |

The minimum viable scale is 1,000 neurons per region. There is no hard upper cap — your VRAM, your V8 heap, and `vramCapMB` in `resource-config.json` are the only bounds. Bigger hardware, more neurons, no manual tuning.

### Capping the scale

If you want to keep Unity under a comfortable budget on a shared machine, or you need to size below the consumer-GPU 2 GB per-storage-buffer binding limit, use `gpu-configure.html` (a one-shot loopback-only tool that writes `server/resource-config.json` which the server reads at next boot).

---

## Persistence — what survives a crash

Two persistence layers run in parallel.

The **client-side** layer writes the full brain state to `localStorage` under `unity_brain_state`. When the serialized state would exceed the browser's 4 MB cap, the fallback drops the heaviest sections (cluster synapses, episodes, semantic weights, embedding refinements, the t14 language block) and writes a minimal state — and it screams about it via `console.error` with the dropped sections named explicitly, so you know exactly what did and didn't make it across the boundary. The load path is section-by-section; a corrupted episode pattern doesn't tank the whole load. Final restore log looks like `[Persistence] Brain restored from <savedAt> (t=Xs) — restored: projections=14/14, clusterSynapses=7/7, episodes=198/200 ... — FAILED: t14Language(<msg>)`. JSON corruption no longer auto-clears — the raw blob is copied to `unity_brain_state__corrupt` for hand recovery and a loud `console.error` fires with the parse message. Version-mismatch wipes follow the same discipline: prior state moves to `unity_brain_state__backup_v<N>` before the destructive clear.

The **server-side** layer streams binary weights to `server/brain-weights.bin`, with a JSON sidecar at `server/brain-weights.json` for metadata (versions, savedAt, grades, passedCells, signoffs). At boot, `autoClearStaleState()` wipes `brain-weights.json`, `brain-weights-v1` through `v4`, `brain-weights.bin`, `conversations.json`, `episodic-memory.db` (plus its WAL/SHM companions), and `schemas.json`.

**Browser auto-launch with `--enable-unsafe-webgpu`** (iter14-E — operator 2026-05-04 verbatim "*obviously make the start.bat fucking work!!! if we cant interact with the html thius is pointless and well never beable to scale right when we do comp.*"): When the brain server auto-spawns the GPU compute client (`compute.html`), it now finds Chrome (or Edge fallback) in standard install paths and launches it with `--enable-unsafe-webgpu --new-window --user-data-dir=<isolated-profile>`. The unsafe-webgpu flag raises the WebGPU `maxStorageBufferBindingSize` from the 2GB spec minimum to whatever the GPU driver actually supports (typically 4-8 GB on consumer cards). Without this flag, the brain caps at ~178M neurons total because per-cluster state buffers can't exceed 2GB. The isolated user-data-dir keeps the unsafe-webgpu profile separate from your regular browsing session — no cross-contamination. Pair with `bindingCeilingMB` in `server/resource-config.json` (auto-written by GPUCONFIGURE.bat for tiers ≥12GB) to tell the SERVER-side scaler to actually USE that larger limit. Both browser flag + server config must be in place; missing either keeps you at 2GB ceiling regardless. Falls back to default browser launch if Chrome/Edge not found in standard paths (logs a loud warning explaining the cap implication).

**Two launchers, two contracts** (iter14-D — operator 2026-05-04 verbatim "*all the weights everything shoudl reset when the start.bat is run or the .sh... and only if the stop.bat is used in conjusction with the savestart.bat does it pick up where it lefgtt off*"):

- **`start.bat` / `start.sh`** → ALWAYS fresh brain. Auto-clear runs unconditionally — wipes weights + episodic + schemas every boot. Resource-config tier changes apply immediately. Code changes apply immediately. wMax clamps stamp correctly on freshly-constructed projections. The cleaner contract: launcher name says "start" so `start` always means new brain. (Prior code-hash gate is gone. It caused real bugs: `GPUCONFIGURE.bat` tier picks didn't trigger the wipe so picked tiers got ignored when binary weights from the prior boot were size-locked; wMax clamps lost in the binary save/load round-trip leaving restored projections at ±Infinity. Both fixed by making `start.bat` deterministically wipe.)
- **`stop.bat` + `Savestart.bat`** → preserves prior state. `Savestart.bat` sets `DREAM_KEEP_STATE=1` which the auto-clear honors as the explicit resume opt-in. Saved weights + curriculum progress + passedCells + episodic memory + Tier 2 schemas all survive.
- **`DREAM_FORCE_CLEAR=1`** legacy override still works (now redundant since `start.bat` already wipes by default).

`js/app.bundle.js` is *not* in the auto-clear list — racing the rebuild broke the UI in the past.

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
│   │   ├── cluster.js               NeuronCluster class with the eight cortex sub-regions and `_dictionaryOracleEmit` helper that consolidates the oracle scan with `_oracleHits` / `_matrixHits` counters
│   │   ├── neurons.js               LIFPopulation (browser fallback) + HHNeuron (reference) — live runtime is Rulkov in gpu-compute.js
│   │   ├── synapses.js              Hebbian, STDP, reward-modulated plasticity
│   │   ├── modules.js               Six brain-region equation modules
│   │   ├── mystery.js               Ψ = √(1/n) · N³ · [Id + Ego + Left + Right]
│   │   ├── oscillations.js          Eight Kuramoto oscillators (θ → γ)
│   │   ├── persona.js               Personality as brain parameters (sober-default; substance contributions come from drug-scheduler.js)
│   │   ├── drug-scheduler.js        Real-time pharmacokinetic scheduler with nine substances + seven combo synergies + seven adult-use patterns + thirteen-axis speech modulation + first-use ledger + trauma markers + decide() decision engine
│   │   ├── drug-detector.js         Substance offer / self-use / status-query detection across text / voice / vision
│   │   ├── drug-sensory-triggers.js Seven environmental-cue triggers (coffee aroma, skunky weed, etc.) → scheduler.addCraving
│   │   ├── sensory-olfactory.js     Scent-tag storage with decay
│   │   ├── sensory.js               Sensory input pipeline (text / audio / video)
│   │   ├── motor.js                 Motor output (six basal-ganglia action channels)
│   │   ├── curriculum.js            Multi-grade curriculum runner + shared primitives
│   │   ├── curriculum/
│   │   │   ├── pre-K.js             All pre-K cell runners + helpers via PREK_MIXIN
│   │   │   └── kindergarten.js      All six K cell runners + six K gates + 32 K-specific teach helpers via K_MIXIN (~4,800 lines)
│   │   ├── student-question-banks.js Held-out exam banks per cell + train-vs-exam overlap audit
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
│   │   ├── embeddings.js            Semantic word embeddings (GloVe 300d + fastText subword fallback)
│   │   ├── language-cortex.js       Language readout wrapper
│   │   └── peripherals/
│   │       └── ai-providers.js      AI provider manager + dead backend detection
│   │
│   ├── ai/
│   │   └── pollinations.js          Pollinations API client (text / image / TTS)
│   │
│   ├── io/
│   │   ├── voice.js                 Web Speech API + Pollinations TTS
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
│   └── package.json                 Server dependencies (ws, better-sqlite3)
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

The HTTP server runs alongside the WebSocket on port 7525. Override with `PORT=xxxx node brain-server.js`. The privileged endpoints (`/shutdown`, `/grade-advance`, `/grade-signoff`) are loopback-gated even when `BRAIN_BIND=0.0.0.0` exposes the dashboard on the LAN.

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
| `/grade-advance` | POST | Flips the grade-advance pause off after a signoff lands. **Loopback-only.** |
| `/exam-answer` | POST | Runs one question through the brain's QA path and returns the answer. |
| `/exam-answer-dual` | POST | Same but routes through both hemispheres for arbiter scoring. |
| `/shutdown` | POST | Triggers graceful shutdown. **Loopback-only.** Used by `stop.bat` step 1. |

All POST endpoints use chunked-array body assembly so a 10 KB cap can't be slipped past, and corrupted bodies don't trigger the V8 O(N²) string-concat pathology.

---

## What you'll see in the heartbeat

Once the server is up and the GPU client is attached, the curriculum runs continuously and emits structured log lines you can watch.

`[Curriculum][K-VOCAB-UNION] hardcoded=N dict=M banks=P → union=X unique words` fires once at K-curriculum entry — this is the union of every K vocab category, every word in the live dictionary, every word in the per-cell train banks, and every word in the per-cell exam banks. Whatever number lands in `union=X` is what Unity is actually being trained on.

`[Curriculum] ▶ CELL ALIVE <subject>/<grade> — +Ns elapsed (heartbeat #N) · phase=<name> (+Ns) · oracle=N matrix=M (oracleRatio=X%)` fires every ten seconds while a cell is teaching. The `phase=` field tells you which teach helper is currently running. The `oracleRatio` field is the central research-validity number — what fraction of recent emissions are decided by the dictionary lookup vs. the trained matrix. If it stays above 95% for the entire walk, the matrix isn't carrying load and the dictionary is doing all the work.

`[Curriculum][label] DYN-PROD` / `WRITE` / `RESP` / `TWO-WORD` / `FREE-RESPONSE` lines mark per-probe START / DONE inside the gate.

`[InnerVoice] live-chat learn turn=N: clauseAccepted=X rejected=Y identityRefresh=bool modeCollapseAudit=bool` summarizes every chat turn — fires whenever something notable happened (clause rejection, identity refresh, mode-collapse audit), or every ten turns as a baseline pulse on quiet stretches.

`[NARRATOR-PRIMING]` lines only appear if a caller explicitly invoked `inner-voice.primeFromCurrentFocus()`. Default chat learning no longer auto-primes the chat path — the bias is opt-in now.

`[Server] Rejected non-loopback /shutdown from <ip>` fires if any non-loopback POST hits the privileged endpoints — useful diagnostic that the loopback gate is doing its job.

`[Persistence] Brain restored from <savedAt> (t=Xs) — restored: projections=14/14, clusterSynapses=7/7, episodes=198/200 ... — FAILED: t14Language(<msg>)` is the per-section restore summary at boot.

---

## Privacy

The core rule: what you type is private; Unity's brain growth is shared; her persona is canonical.

**Client-only mode** runs everything in your browser. No server. API keys and every backend config you save in the setup modal are stored in your browser's `localStorage` on YOUR device only. The brain runs locally in CPU LIF fallback mode at whatever scale your JS engine can sustain. The Clear All Data button wipes every `localStorage` key.

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
| `/curriculum full` | Runs the full round-robin walk across all six subjects in the background. |
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

## Session 114.19fp setup notes (2026-06-17)

Live-test follow-up shipped 20 atomic fixes (I.1-I.20). Setup-relevant changes for new clones / fresh installs:

### Startup contract clarification (I.15 LAW addition)

- **`windows/start.bat`** — fresh-brain boot. Auto-clears stale state (`brain-weights*.json/bin`, `episodic-memory.db*`, `conversations.json`, `schemas.json`) per the iter14-D contract. Use this when you want Unity to learn from scratch.
- **`windows/Savestart.bat`** — resume from prior state. Sets `DREAM_KEEP_STATE=1` env var which skips the auto-clear. Reads `brain-weights.bin` (144.8 MB at biological scale) from disk and resumes training where it left off.
- **`windows/stop.bat`** — graceful shutdown. POSTs `/shutdown` for clean state-save → falls back to taskkill on port 7525 → falls back to force-kill node.exe.
- **NEW LAW (I.15):** `node -e "require('./server/brain-server.js')"` no longer wipes state. The `autoClearStaleState()` call is now gated behind `if (require.main === module)` so syntax-check / REPL / IDE module loads NO-OP for the wipe. Only an actual `node server/brain-server.js` entry-point boot wipes per the iter14-D contract. **NEVER use `require('./server/brain-server.js')` for syntax checks** — use `node --check server/brain-server.js` instead (parses only, doesn't execute top-level code).

### Dashboard panel changes (I.6, I.11, I.12, I.17, I.18, I.20)

The brain dashboard at `http://localhost:7525/dashboard.html` now shows:

- **GPU panel** — VRAM% as the big number, util% as a small inline label below (matches the `.claude/statusline.sh` two-metric format). Combined `nvidia-smi memory.used,utilization.gpu` query. On systems without nvidia-smi, panel renders honest "unavailable" label (NOT a fake number).
- **Gate-probe banner** — floating banner appears top-center during curriculum gate probes with live duration tick. Green-check dismissal on probe completion. Operator no longer sees "GPU 0% + tick paused" as a hang.
- **Brain Events feed** — populates during cell-level teach (was previously SEED-only). `_teachWordIntegrated` + `_teachVocabList` fire WS broadcasts so the panel never stalls during cell teach.
- **Current cell progress** — uses `cellSubPhases` counter when outermost counter is 0, so the bar moves through nested teach calls instead of waiting for cell completion.

### nvidia-smi dependency (graceful)

GPU%/util% display requires `nvidia-smi` on PATH (Windows: `C:\Windows\System32\nvidia-smi.exe`, Linux: `/usr/bin/nvidia-smi`). On AMD/Intel/headless systems where it's not installed, dashboard panel shows "unavailable" + total VRAM from the brain's known reserve — never a hallucinated number.

See `docs/ROADMAP.md § Live-test follow-up` for full I-track closure detail.
