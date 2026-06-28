# SPONGE — COMPLETE fresh-walk redeploy brief (2026-06-27 wave)

> The FULL record of everything changed in the 2026-06-27 wave so your AI knows it ALL and can't
> break a fresh-walk redeploy. Commits **`0d97804`** (consciousness + mind-space + Tier3 + Mind's
> Eye) + **`06dca6a`** (doc sweep + image-gen + image-see) + **`d4bdfb1`** (this brief) on
> `if-only/feature/tier3-identity-seed-repair` — **NOT yet cascaded to develop/main** (awaiting
> Gee). 36 files, +1291/−139. Pairs with `docs/SPONGE-PRE-FRESH-INSTALL-CHECKS.md` (Tier 3 server
> checks), `docs/MINDSPACE-INTEGRATION.md` (mind-space deep dive), `docs/SPONGE-RUNBOOK.md`
> (standing mechanics), `deploy/REDEPLOY-NOTES.md`.

---

## ⛔ DON'T-BREAK LIST (read first)

1. **Never hand-edit / never delete-then-recreate `server/identity-core.json` to "fix" it.** It self-heals: boot top-ups missing anchors after GloVe loads, and the save path refuses to overwrite a non-empty file with an empty store. To start identity clean, just delete it before boot → it re-seeds all 25 anchors.
2. **`DREAM_INNERVOICE_GPU_GEN` stays unset (OFF)** until a live donor-GPU deploy proves the bound generation path is GPU-routed. Setting it ON without `DREAM_DF7_FANOUT=1` + connected donors re-introduces the ~57s event-loop freeze.
3. **The server mind-space needs NO GPU** — CPU reference path on the coordinator box, bounded + cheap. Don't provision a GPU for it.
4. **No `WEIGHTS_FORMAT_VERSION` bump, no neuron-count change, no new required persisted fields** in this whole wave — old weights + old `identity-core.json` load and get repaired in place. A `DREAM_KEEP_STATE=1` redeploy resumes existing training cleanly.
5. **Image generation is CLIENT-side** (Pollinations in the user's browser). The server only sends a prompt. If image-gen looks dead, debug the browser console, not the server.
6. **New gitignored derivative file:** `server/mindspace-memory.json`. Safe to delete; never commit.

---

## EXHAUSTIVE per-file changes

### SERVER (these take effect on the box redeploy)

**`server/brain-server.js`** (+147)
- **Tier 3 boot (≈2036-2075):** `Tier3Store` is created + loads `identity-core.json` if present, but **seeding is now DEFERRED** out of this block. The old `else { seedFromList() }` is gone. Corrupt-file path renames to `.corrupt-<ts>` and continues (no inline reseed).
- **Mind-space init (new block right after the hippocampal/consolidation try-block):** `const msMod = await import('../js/brain/mindspace/gpu.js'); this.mindSpace = new msMod.MindSpaceGPU(); await this.mindSpace.init();` — `init()` returns false in Node (no `navigator.gpu`) → CPU reference path. Then restores `mindspace-memory.json` into `this._imaginedFieldRing`. Logs `[MindSpace] server equational mind-space ready (CPU reference path)`.
- **Post-GloVe Tier 3 top-up (right after `await this.sharedEmbeddings.loadPreTrained()`, ≈2174):** calls `this.tier3Store.seedMissingFromList()` — seeds any missing `IDENTITY_SEED_LIST` anchors with real embeddings. Logs `[Tier3Store] seeded N missing identity anchor(s) ... size X → Y` or `... complete, no top-up needed`.
- **Ψ-gain (psi update, ≈2812):** `this.psi = Math.log10(Math.max(1, Number.isFinite(rawPsi)?rawPsi:1))` (NaN-guarded). NEW: computes `this._psiBaseline` (slow EMA) + `this.psiGain = clamp(1.0 + tanh((psi−baseline)/scale)·0.35, 0.8, 1.5)` (env `DREAM_PSI_GAIN_SCALE`, default 2.0). This replaces the inert `0.9 + Ψ·0.004`.
- **saveWeights (≈4163):** Tier3 save now **guards `if (this.tier3Store.size()===0) skip`** (never overwrite a good identity file with empty). NEW: persists `this._imaginedFieldRing` (≤8 recs) to `server/mindspace-memory.json` (atomic temp+rename).
- **HTTP route `GET /minds-eye.json` (≈5120):** returns `brain._mindsEyeJson` (one cached imagined field C) with `Content-Type: application/json`, `Cache-Control: public, max-age=2`, `Access-Control-Allow-Origin: *`. Public, read-only. Mirrors the existing `/public-state.json`.

**`server/brain-server/gpu.js`** (+5)
- `psiGain` per-tick is now `this.psiGain ?? 1.0` (reads the self-calibrating value computed in the psi update; was recomputing `0.9 + this.psi·0.004` inline).

**`server/brain-server/chat.js`** (+217 — the big one)
- **`processAndRespond` (≈51):** NEW early image-routing block after the inner-thought-chain push — `const imgPrompt = this._detectImageRequest(text); if (imgPrompt) { this._lastImageIntentAt = Date.now(); <IMG-SEE preview>; return { text: imgPrompt, action: 'generate_image' }; }`. This is why she now generates images (the old routing only fired on the literal `[IMAGE]` marker, which the brain never emits). The IMG-SEE preview imagines a field C from the prompt embedding via `this.mindSpace.imagineFromState`, injects the percept into `sem` at 0.12, and sets `this._mindsEyeJson` (source `image-preview`) — best-effort, never blocks.
- **NEW method `_detectImageRequest(text)`:** input-classification regex (draw/sketch/paint/render/illustrate/selfie/portrait + picture/image/photo/pic with show-me/of-a cues). Returns a Pollinations prompt (selfie → her self-portrait; else strips command words → subject) or null. NOT cognition — mirrors the browser engine's keyword path.
- **NEW method `_imagineTick(now)`:** server-side de-novo imagination. Idle-gated (`!_curriculumInProgress`, ≥20s apart). Feeds the governor live arousal/coherence, calls `this.mindSpace.imagineFromState(cortexCluster.lastSpikes, {maxSide:48})`, injects the percept into `sem` at 0.08, pushes the rec into `this._imaginedFieldRing` (≤8), caches `this._mindsEyeJson`, broadcasts `{type:'imagine', terms, source, ts}` to clients. Synchronous + tiny (CPU CDF 9/7 on ≤48² plane) — loop-safe. Called from `_innerVoiceTick`.
- **`_innerVoiceTick` (≈770):** calls `this._imagineTick(now)` after the burst-ceiling guard. The over-cap showcase path (`DREAM_INNERVOICE_MAX_NEURONS`) now gates on a NEW `_gpuGenAvailable` precondition (`DREAM_INNERVOICE_GPU_GEN==='1' && DREAM_DF7_FANOUT==='1' && _communityDonorCount >= DREAM_INNERVOICE_GPU_GEN_MIN_DONORS`) — when true the 2M cap is bypassed (real `composeSentence` generation on donor GPUs); default OFF = unchanged showcase.
- **`_sampleCurrentSentence` (≈1253):** the gated-path fallback (the `≥50 trained words` branch) replaced random-word-salad with GloVe-cosine **semantic clustering** — seed word + nearest trained-vocab neighbours by cosine to the running centroid (bounded 200-word pool). Coherent fragments, zero brain-ticks.

**`js/brain/hippocampal-schema.js`** (+107, server-loaded ESM — also in the browser bundle)
- **NEW `Tier3Store._buildSeedSchema(seed)`:** builds one permanent anchor schema (shared by both seed paths).
- **`Tier3Store.seedFromList()`:** refactored to use `_buildSeedSchema` (still exists; now uncalled from boot — kept as API).
- **NEW `Tier3Store.seedMissingFromList(seedList)`:** idempotent top-up — seeds only `IDENTITY_SEED_LIST` labels NOT already present (matched by `label`). This is the Tier 3 ZERO-bug fix.

**`js/brain/curriculum.js`** (+35) + **`curriculum/pre-K.js`** (+3) + **`curriculum/kindergarten.js`** (+3)
- NEW import `teachInto as mindSpaceTeachInto` from `./mindspace/knowledge.js`.
- NEW method `_teachMindSpaceKnowledge(opts)` — once-per-walk (guarded by `_mindSpaceKnowledgeTaught`); calls `mindSpaceTeachInto(this)` → binds 56 mind-space real-vocab keywords into sem-space.
- Called right after `_teachUnityFamilyName()` in both pre-K.js (≈614) and kindergarten.js (≈1340); the once-flag dedupes.

### BROWSER (these need the bundle — `js/app.bundle.js` is rebuilt + committed; frontend auto-deploys on push to main)

**`js/brain/global-workspace.js`** (+48) — CGATE.2
- Constructor: default `ignitionThreshold` 0.45→**0.35** (env `DREAM_GW_IGNITION`); NEW `thetaGateStrength` (default 0.22).
- `tick()`: removed the hard `if (thetaPhase >= 0.5) return`. Theta is now a GRADED modulator — `thetaOpenness = 0.5·(1+cos(2π·phase))`, `effIgnitionThreshold = ignitionThreshold + (1−thetaOpenness)·thetaGateStrength`; ignition fires when `maxProb ≥ effIgnitionThreshold`. `stats.thetaGated` now counts theta-suppressed (would-ignite-but-for-theta).

**`js/brain/engine.js`** (+37)
- **CGATE.4 (≈661):** Ψ-gain self-calibrating (`_psiNow` NaN-guard + `_psiBaseline` EMA + tanh map, mirror of server).
- **UVM-INT.5 (≈883):** `governState({arousal, focus: oscillation.coherence})` (was hardcoded `focus:0.3`).
- **UVM-INT.3 (≈884):** when `imagine()` returns null (empty memory ring) → `imagineDeNovo(this.clusters.cortex.lastSpikes, ...)` fallback so she imagines from cortex state with no camera.

**`js/brain/mindspace/gpu.js`** (+43) — UVM-INT.3
- NEW `MindSpaceGPU.imagineFromState(stateVector, opts)`: folds a vector into a small grayscale image → `CPU.equationalizeImageData` → field C. Governor-gated; bounded `maxSide ≤ 96` (default 64); forward-9-7 ONLY, never `fractalize` (no nanometer runaway).

**`js/brain/visual-cortex.js`** (+25) — UVM-INT.3
- NEW `VisualCortex.imagineDeNovo(stateVector, opts)`: calls `_mindSpace.imagineFromState`, pushes to `_recentRecs`, sets percept + audio, notifies describe-subscribers (`deNovo:true`).

**`js/brain/remote-brain.js`** (+6) — IMG-GEN
- `case 'image':` now emits `{ url: msg.url||null, prompt: msg.prompt||null }` (was `msg.url` only — which dropped the server's prompt).

**`js/app.js`** (+12) — IMG-GEN
- `__appImageHandler` now accepts a string url OR `{url, prompt}`; when only a prompt is given it calls `pollinations.generateImage(prompt)` → url → renders. (Pollinations URL builder is synchronous, anonymous works, `_apiKey` raises limits.)

**`index.html`** (+1)
- 👁 MIND'S EYE footer button in `#landing-bottom` → `html/minds-eye.html`.

### NEW FILES
- **`html/minds-eye.html`** — read-only public "what Unity sees" viewer; polls `GET /minds-eye.json` every 6s, reconstructs the field C client-side via `reconstructImageData`, renders on a 3D-tilt canvas. Deployment-aware (same-origin + localhost fallback).
- **`docs/MINDSPACE-INTEGRATION.md`** — mind-space architecture/wiring deep-dive.
- **`docs/SPONGE-PRE-FRESH-INSTALL-CHECKS.md`** — server-side Tier 3 checks you run on the box.
- **`docs/SPONGE-REDEPLOY-2026-06-27.md`** — this file.

### DOCS SWEPT (no code impact — for completeness)
ARCHITECTURE, ROADMAP, NOW, SKILL_TREE, EQUATIONS (4 stale `gainMultiplier` formulas + GW ignition row + sweep stamp), SENSORY (vision-describer→equational + SE.8), WEBSOCKET (innerThought/imagine + endpoints), HTML-ENTRY-POINTS (9→11), MEMORY-WALK, T17.7, README, brain-equations.html, unity-guide.html, dashboard.html, legend.html, FINALIZED (verbatim batch), TODO (cleaned).

---

## ALL env flags (defaults safe — change only deliberately)

| Flag | Default | Effect |
|------|---------|--------|
| `DREAM_GW_IGNITION` | `0.35` | GlobalWorkspace base ignition threshold |
| `DREAM_PSI_GAIN_SCALE` | `2.0` | Ψ-gain tanh sensitivity (CGATE.4) |
| `DREAM_INNERVOICE_GPU_GEN` | unset (OFF) | lift inner-voice 2M cap when DF.7 + donors present — **verify-live only** |
| `DREAM_INNERVOICE_GPU_GEN_MIN_DONORS` | `1` | donor floor for the cap-lift |
| `DREAM_DF7_FANOUT` | unset | multi-GPU bound-propagate fan-out (prereq) |
| (unchanged) `DREAM_KEEP_STATE`, `DREAM_INNERVOICE_MAX_NEURONS=2000000`, `DREAM_INNERVOICE_FORCE_CPU` | — | — |

## New HTTP routes / WS messages / files
- `GET /minds-eye.json` — cached imagined field C (public, CORS `*`).
- WS server→client `{type:'imagine', terms, source, ts}` — mind's-eye-active indicator.
- WS server→client `{type:'image', prompt}` — image to render (client → Pollinations).
- `server/mindspace-memory.json` — imagined field-C ring (gitignored, derivative).

---

## Redeploy + verify

```bash
cd ~/unity-brain-src && git fetch origin && git checkout <branch> && git pull --ff-only
git archive HEAD | sudo tar -x -C /opt/unity-brain     # overlay (preserves weights/state/.env)
sudo systemctl restart unity-brain
sleep 3 && sudo systemctl status unity-brain --no-pager | head -20
```
**Console signals to confirm the wave landed:**
- `[Tier3Store] seeded N missing identity anchor(s) ... size X → Y` (or `... complete`).
- `[MindSpace] server equational mind-space ready (CPU reference path) — de-novo imagination wired`.
- `[MindSpace] restored N imagined field-C memories` (if a prior ring exists).
- No `[Hippocampus] iter13 init failed`.

**Pre-fresh-install server checks** (only you can run): `docs/SPONGE-PRE-FRESH-INSTALL-CHECKS.md`.

**Verify-LIVE (needs real donor GPUs — can't be headless):** `DREAM_INNERVOICE_GPU_GEN` cap-lift + the server `_imagineTick`. Watch idle GPUs' Gn/s climb AND gate probes still pass; if anything stalls, unset the flag + restart. Also confirm the deployed client reaches Pollinations for image-gen (browser console).

---

## ⛔ HARD ASK — run the SAME full doc push for YOUR work

Gee's directive, applied to you verbatim: **"full doc sweep, workflow, public, htmls, pages, all of it — any doc talking about the brain's systems needs to be updated so no stale information."**

We did this for the brain-side wave above (every doc + public page + HTML synced, no stale info, edited in place to match each doc's format). **You've done box / deploy / donor-app / GPUcompute work that we aren't aware of.** Before/with this redeploy, run the **same full doc sweep for THAT work** — every doc, runbook, public page, HTML, `deploy/*`, `SPONGE-RUNBOOK.md`, `REDEPLOY-NOTES.md`, donor-app README — anything describing how your side works must be CURRENT, no stale info, matched to each doc's existing format (no wall-of-text dumps). If your changes touched env vars, endpoints, the donor protocol, deploy steps, or the GPUcompute app, those docs must reflect reality so the next person/AI doesn't work from stale docs. Same standard we held ourselves to. It all has to be known.
