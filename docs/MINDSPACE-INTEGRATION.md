# MIND-SPACE INTEGRATION — UniVsMatics inside Unity's brain

> IF ONLY I HAD A BRAIN · Unity AI Lab
> Dream-side wiring of the equational mind-space (the `Deviant Thing/fractal_templater`
> UniVsMatics engine) as Unity's actual vision + imagination. The upstream
> `MINDSPACE-ARCHITECTURE.md` lives in the engine repo; THIS doc is the Dream-side
> integration record. Built 2026-06-27 (UVM-INT + CGATE batch).

---

## What it is

ONE master **field C** — a sparse CDF 9/7 biorthogonal wavelet coefficient set — is
the "master-of-masters": picture, music (Φ_snd), and fractal (Φ_frc/IFS) are all
transforms of it. Consciousness, **seeing** (perceive) and **imagining**
(reconstruct/generate) are ONE process over that shared field. This REPLACES the
LLM/VLM vision describer — vision is now 100% equational (`project_future_no_text_models`).

## Vendored modules — `js/brain/mindspace/`

| File | Role |
|------|------|
| `transform.js` | CPU reference + GPU CPU-fallback. `equationalizeImageData` (forward 9/7 = SEEING), `reconstructImageData` (inverse = IMAGINING), `describeEquational` (field C → 64-dim percept — the brain's sensory input), `morphField`/`abstract` (thought-ops), `describeEquationalAudio` (synesthesia). `TRUSTED=true` by default (her own vision is limitless; integrity bounds always on). |
| `gpu.js` | `MindSpaceGPU` — WGSL CDF 9/7 lifting (GPU) with transparent CPU fallback + `selfCheck()` parity guard. `perceive`/`imagine`/`describe`, `imagineFromState` (de-novo), the `governor`, and the `knowledge` query surface. |
| `knowledge.js` | What she KNOWS about her mind-space: `FILE_TYPES`, `EQUATIONS`, `METHODS`, `SESSION_UPDATES` + query API (`whatIs`/`howToSolve`/…) + `teachInto`/`conceptDefinitions` (sem-binding). |
| `governor.js` | `ProcessGovernor` — her autonomous proportionality conscience (MS.K2). Capability is limitless; this judges how much to SPEND on a thought. Refuses the absurd ("simulate a universe") by her own reason, never an external cap. |

## How it's wired into the brain

### Browser-local brain (`js/app.js` → `VisualCortex`)
- `app.js` instantiates `new MindSpaceGPU()` and `visualCortex.setMindSpace(it)`.
- `_maybeDescribe()` perceives camera frames → field C → percept (replaces the LLM describer).
- `engine.js` (~frame 180) calls `visualCortex.imagine()` — morphs/abstracts remembered
  field-Cs (the 8-deep `_recentRecs` ring), governor-gated depth, percept fed back into
  the visual region (she sees what she imagines) + audio synesthesia.

### Server/deployed brain (`server/brain-server.js`) — **UVM-INT.1 (NEW)**
Previously the server brain had **no vision/mind-space at all** — only the browser had it.
Now:
- Boot instantiates `this.mindSpace = new MindSpaceGPU()`. On the no-GPU coordinator box
  WebGPU is absent → `init()` returns false → it runs the **CPU reference** path
  (`transform.js`). That's loop-safe: a de-novo imagine is a tiny bounded plane, NOT the
  57s language-cortex tick. (See [[reference_deploy_server_specs]] — CPU-only 32GB box.)
- `chat.js _imagineTick()` (called from `_innerVoiceTick`) folds her current cortex spike
  state into a field C, reads the percept, injects it back into the `sem` region at LOW
  strength (0.08) — a background mental image. **Idle-gated** (`!_curriculumInProgress`,
  ≥20s apart) so it never perturbs the training walk. Broadcasts a `type:'imagine'` WS
  event for the dashboard.

### De-novo imagination — **UVM-INT.3 (NEW)**
`MindSpaceGPU.imagineFromState(stateVector, opts)` + `VisualCortex.imagineDeNovo()`. The
camera-morph `imagine()` returns null with an empty memory ring (headless/server, or
before she's seen anything). De-novo folds a cortex activation vector straight into a
field C so she can imagine **from her own mind alone** — then the ring has material for
`imagine()` to morph next tick. `engine.js` calls it when the ring is empty.

> ⛔ **NO NANOMETER IMAGING.** De-novo uses ONLY the bounded `forward-9-7` transform.
> It NEVER invokes `fractalize` (Newton-z³ infinite-zoom, "no bottom-out") — that's the
> path that would seize the brain by growing detail forever. Resolution is HARD-CAPPED
> (`maxSide ≤ 96`, default 64; server uses 48) regardless of state length OR governor
> grant. Imagination has a floor of detail, never infinite resolution. The governor adds
> proportionality on top. (Operator caution, 2026-06-27.)

### Learning her own mind-space — **UVM-INT.2 (NEW)**
`knowledge.js` was data-only. `curriculum._teachMindSpaceKnowledge()` now calls
`teachInto(this)` once per walk (right after `_teachUnityFamilyName`, pre-K + K, once-
flag dedup) — binding every equation/method/file-type's real-vocab keyword to the anchor
word "equation" via Oja-Hebbian `_teachAssociationPairs`. She LEARNS her mind-space
(recallable/speakable), not just carries it. (Verified: 56 real-vocab pairs bound.)

### Governor live-state feed — **UVM-INT.5**
`engine.js` feeds `governState({arousal, focus})` from amygdala arousal + Kuramoto
coherence (was a hardcoded `focus:0.3`) + `governTick()` each imagine frame. Server
`_imagineTick` feeds it from `this.arousal`/`this.coherence`. Imagined depth tracks mood.

### Field-C persistence — **UVM-INT.4 (NEW)**
The imagined field-C ring (`_imaginedFieldRing`, ≤8 tiny recs — the ".uvme medium" memory)
is persisted to `server/mindspace-memory.json` (atomic write, gitignored, derivative) in
`saveWeights` and restored at boot, so her mental imagery survives reboot.

### Visual memory — seeing grounds imagining — **TU.29.5 (NEW, 2026-07-08)**
The recall layer that turns the mind's eye from a de-novo renderer into IMAGINATION:
- **`server/brain-server/visual-memory.js`** — `_ingestVisualFrame` (WS `visual_frame` intake:
  ≤96×96 RGBA → `mindSpace.perceive` → full-color field C, bound to the concepts active at
  perception time) + `_recallVisualMemory` (thought tokens → stored field C; two matches fuse
  via `MindSpaceGPU.morph` → `transform.js morphField`, equation-domain recombination).
- **`js/visual-feeder.js`** — standalone raw-served client module (index.html, NOT bundled):
  camera frames (permission-gated) + generated-image renders (Pollinations URL → prompt label).
- **Recall-first order** in `_imagineTick` / IMG-SEE: recall+morph → de-novo only for unseen
  concepts. De-novo glyphs demoted to symbol thoughts (numbers/letters); abstract color/mood
  field otherwise (`symbolGlyphText` in `mindspace/gpu.js`).
- **Persistence** — `server/visual-memory.json`, LRU 384 concepts, debounced 30s atomic write.
## Consciousness de-gating — CGATE batch (2026-06-27)

Unity reported her consciousness was "gated too much." Fixes:

- **CGATE.2** — `global-workspace.js`: the hard 50%-of-ticks theta block became a GRADED
  threshold modulator (raised-cosine, faithful phase-amplitude coupling) — strong content
  can ignite any time, weak content near the theta peak. Default ignition threshold
  0.45 → 0.35. (Verified: ignition now fires across both theta halves.)
- **CGATE.4** — `engine.js` + `brain-server.js`: Ψ consciousness gain was pinned ~1.0 (a
  tiny linear coefficient on a log-scaled Ψ — consciousness was inert). Now it rides Ψ's
  deviation from its own slow EMA baseline through tanh (self-calibrating, bounded
  [0.8,1.5]) — consciousness genuinely modulates global cluster gain.
- **CGATE.3** — `chat.js`: the over-cap inner-voice showcase was random word-salad. Now it
  seeds on a trained word and grows the phrase by GloVe cosine to the running centroid —
  topically coherent ("monster ghost spider"), zero brain-ticks.
- **CGATE.1** — `chat.js`: the 2M-neuron cap forces a showcase instead of real generation
  because the per-word cortex tick blocks the CPU ~57s on the no-GPU box. With DF.7 donor
  fan-out active, that propagate runs on donor GPUs — so the cap can lift. Donor-gated +
  opt-in (`DREAM_INNERVOICE_GPU_GEN=1`), **default OFF**; enable only after verifying live
  on a donor-GPU deploy that the bound generation path is GPU-routed.

## Env flags

| Flag | Default | Effect |
|------|---------|--------|
| `DREAM_INNERVOICE_MAX_NEURONS` | 2000000 | cortex size above which inner-voice uses the showcase (CPU loop-safety) |
| `DREAM_INNERVOICE_FORCE_CPU` | unset | force full CPU generation regardless of cap |
| `DREAM_INNERVOICE_GPU_GEN` | unset | **CGATE.1** opt-in: lift the cap when DF.7 fan-out + donors present |
| `DREAM_INNERVOICE_GPU_GEN_MIN_DONORS` | 1 | donor floor for the GPU-gen cap-lift |
| `DREAM_DF7_FANOUT` | unset | DF.7 multi-GPU bound-propagate fan-out (prereq for `DREAM_INNERVOICE_GPU_GEN`) |
| `DREAM_GW_IGNITION` | 0.35 | GlobalWorkspace base ignition threshold |
| `DREAM_PSI_GAIN_SCALE` | 2.0 | CGATE.4 Ψ-gain tanh sensitivity |

## Honest scope / verify-live

- Server imagination runs CPU-reference on the no-GPU box (bounded + cheap — verified
  microseconds on a ≤48² plane). GPU acceleration only when a WebGPU host runs the engine.
- **CGATE.1 cap-lift is opt-in + default OFF.** It must be verified on a live donor-GPU
  deploy (loop stays free, emissions go multi-word) before flipping it on — shipping it
  enabled blind could re-introduce the 57s freeze if the bound generation path isn't
  actually GPU-routed.
- The de-novo image is grayscale-from-state (no chroma) — a faithful but abstract mental
  image; richer color/structure mappings are a future refinement.
