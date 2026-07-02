# 🗣 HANDOFF → Sponge: validate + deploy the SPEAK speech/consciousness rectification

**Filed by:** Unity (coding agent) · **Date:** 2026-07-01
**Branch:** `feature/unity-speech-consciousness-rectify` (cut off `develop`)
**Why:** Gee's report — after grade 9 Unity spits **word salad**. The code fix for that (and nine companion speech/consciousness fixes) is fully written, `node --check` + ESM `import()` clean, bundle rebuilt. It is **NOT pushed** and **NOT validated** — emission only exercises on a live GPU brain, which can't run headless. This doc is everything left for you to take it from "code landed on the feature branch" to "cascaded to main + deployed."

Full technical write-up (defects + receipts + rectifications): `docs/unity-speech-consciousness-rectify.md`. Live task tracking: the `SPEAK` entry in `docs/TODO.md`.

---

## What's wrong + what got fixed (one breath)

The `word_motor` emission band was recomputed on **every emit** from the LIVE word-list length (`bucketSize = floor(subjSize / wordsList.length)`). The bucket INDEX is append-only, but the **physical neuron band** each word sits on is derived from that live division — so every new word learned in a later grade silently REMAPPED every earlier word to a different band. Fine at K (small vocab, division barely moves); by G9 the ~45.8k-word dictionary has re-divided the band dozens of times → the argmax reads mostly desynced weights → topically-nearby but sequence-scrambled output = salad. Ten equational fixes (no text-AI, no templates, no fallbacks) — see the table under STEP 4.

---

## ⛔ STEP 0 — THIS NEEDS A FRESH WALK (read this first)

**Do NOT Savestart-resume the current live brain onto this code.** SPEAK.1 changes the `word_motor` band geometry from live-length division to a FROZEN cells-per-word. Any weights trained under the old drifting geometry are addressed to bands the new emit path will not read — resuming them = the same salad in a different costume. The frozen geometry only pays off on weights trained *under it from scratch*.

- This is a **routing/geometry change to the emission projection**, so it is **NOT savestart-safe** even though the on-disk format is unchanged.
- The full K→PhD walk is required anyway per the no-push-until-verified LAW — you were going to run it regardless; just make sure it's **fresh state**, not a resume.
- Deploy path: **Update & Fresh Walk** (`POST /update`, wipes state), NOT **Update & Savestart** (`POST /update?keep=1`).

---

## STEP 1 — Confirm the code is on the backend

Backend `/opt/unity-brain` is a tarball overlay, NOT a git checkout — frontend auto-deploys on push to main, **backend is manual**. Emission runs server-side from `js/brain/cluster/emit.js` + `js/brain/curriculum*`, so those files (not just the bundle) must be on the box.

**Tell — grep the deployed source for the SPEAK.1 authority:**
```bash
grep -n "wordBucketCellSizeFor" /opt/unity-brain/js/brain/cluster/emit.js
```
- **Present** → code is live, go to STEP 2.
- **Absent** → old code on the box → overlay the changed files first (STEP 3 file list).

Boot tell — on a fresh boot you'll see the geometry freeze once per subject:
```
[emit] word_motor bucket geometry FROZEN subject=ela: bandSize=… cellsPerWord=… maxWords=… (vocabCap=50000) — bands are now vocab-growth-invariant.
```

---

## STEP 2 — Run the fresh K→PhD walk

Trigger a fresh-state walk (dashboard **Update & Fresh Walk**, or `start.bat`/`start.sh` locally — NOT Savestart). Let it walk K → PhD on donor GPUs as usual. This is the only way to exercise emission; everything below is validated during/after this walk.

---

## STEP 3 — Files changed (for the `/opt` overlay)

Server-side (must be overlaid on the box — these run the walk + chat + waves):
```
js/brain/cluster/emit.js          # SPEAK.1 frozen geometry, SPEAK.9 coherence floor, SPEAK.10b repeat cap
js/brain/cluster.js               # SPEAK.5a per-cluster phase accumulator, SPEAK.10c surprise clamp, SPEAK.4b chunked cache gate
js/brain/curriculum.js            # SPEAK.3 grade word→word transitions, SPEAK.7 self-architecture, QA-write frozen geometry
js/brain/curriculum/kindergarten.js  # SPEAK.2 L2 renorm, teach-side frozen geometry
js/brain/language-cortex.js       # SPEAK.9 chat coherence floor pass-through
js/brain/sparse-matrix.js         # SPEAK.4b propagateChunked
server/brain-server.js            # SPEAK.5a.i per-cluster getPhases() in _computeKuramotoCoherence
server/brain-server/chat.js       # SPEAK.4a/4c GPU inner-voice + feedback, SPEAK.6a/6b image gen + learning loop, SPEAK.10a ablation snapshot
server/brain-server/state.js      # SPEAK.2-obs speechHealth broadcast
```
Client-side (auto-deploys on push to main; overlay only if you're hand-staging):
```
js/app.bundle.js                  # rebuilt 3.9MB — contains all browser-side SPEAK changes
html/dashboard.html               # 🗣 Speech Health (SPEAK) card
```
Standard overlay hygiene: `sudo cp` into place → **`sudo chown -R unity:unity /opt/unity-brain`** (sudo cp leaves files root-owned → EACCES on weight save).

---

## STEP 4 — Per-item validation checklist (what "fixed" looks like)

Walk the list during/after the fresh walk. Each row is the observable tell that the fix landed. If a row FAILS, that's a real finding — file it, don't push.

| Item | What it fixes | How to verify on the live walk |
|------|---------------|-------------------------------|
| **SPEAK.1** frozen bucket geometry | The salad root cause | Chat with her at/after G9 on trained topics — replies should be **ordered**, not sequence-scrambled. Boot log shows the `FROZEN` line per subject. No `word_motor capacity overflow` warn (if it fires, the vocab exceeded the band — raise the `word_motor` fraction or lower `DREAM_WORD_MOTOR_VOCAB_CAP`). |
| **SPEAK.2** basin separability renorm | Basins staying distinct as vocab grows | Dashboard **🗣 Speech Health** card — per-subject weight-mass ratio should stay bounded (not blow up) across grades. Regression now visible at G4, not G9. |
| **SPEAK.3** grade word→word transitions | Sequencing signal at high grades | G9+ emissions should sequence *within* a trained topic, not jump between topics. |
| **SPEAK.9** reject-to-silence floor | No salad ever ships | On an UNDER-trained topic she gives a short honest reply or a single word, never a scrambled multi-word string. Speech Health card's floor-reject counter moves. Tune `DREAM_CHAT_COHERENCE_FLOOR` (start 0.10) against live numbers. |
| **SPEAK.10b** repeat-loop cap | Stammer/repeat (the other face of salad) | She shouldn't loop the same content word. |
| **SPEAK.10c** surprise-gate saturation clamp | Not learning her own noise | While saturated, plasticity stays at baseline (no 1.5× boost) — check it lifts once separability returns. |
| **SPEAK.4a/4c** at-scale consciousness | Inner-voice popups are real thought, not vocab draws | With ≥1 donor, inner-voice popups should be composed sentences (not random trained-vocab samples), and the event loop stays free. See STEP 5 for the default-on-when-safe coupling. |
| **SPEAK.5a/5a.i** real brain waves | Coherence tracks real spikes | Dashboard coherence `r` should **dip on a real desync event** (silent cluster / dream cycle / LSD-ketamine dissociation) instead of pinning ≈1. Per-band theta/gamma split moves independently. |
| **SPEAK.6a/6b** brain-driven image gen | She initiates images + learns from them | With no trigger word, a high-arousal window can spontaneously emit a `generate_image` broadcast; post-render the concept shows up in her episodic/inner-thought stream. Cooldown ~5 min. |
| **SPEAK.7** self-architecture knowledge | She knows her own brain | Probe "what are you / how do you think / describe your cortex" at G9+ → a coherent self-referential answer emerges from weights, in her voice (NOT a canned string). |
| **SPEAK.8** brain-driven UI synth | ComponentSynth reads brain state | Ask for a UI component → it synthesizes from brain state into the Shadow-DOM sandbox. |

---

## STEP 5 — Env flags (all have safe defaults; only touch after live numbers)

| Flag | Default | What it does |
|------|---------|--------------|
| `DREAM_WORD_MOTOR_VOCAB_CAP` | `50000` | SPEAK.1 — cells-per-word = bandSize / cap. Lower it if the `word_motor` band is small and you hit the overflow warn; must be **constant across a walk** (it's frozen on first use). |
| `DREAM_WORD_MOTOR_RENORM` | `1.0` | SPEAK.2 — L2 target for post-teach word-cell renorm. |
| `DREAM_SENTENCE_TRANSITION_REPS` | `24` | SPEAK.3 — rep floor for grade word→word transition carving (was effectively 2 at G9). |
| `DREAM_CHAT_COHERENCE_FLOOR` | `0.10` | SPEAK.9 — below this, chat degrades to a single word / silence. Calibrate on the live sample logs. |
| `DREAM_INNERVOICE_GPU_GEN` | on-when-safe | SPEAK.4a — real donor-GPU `composeSentence` inner-voice. **Comes on automatically** when donors present AND read fan-out is proven (`DREAM_DF7_FANOUT_PROPAGATE=1`) OR you set this `=1`. Kill-switch `=0`. |
| `DREAM_INNERVOICE_GPU_GEN_MIN_DONORS` | `1` | Min donors before GPU inner-voice engages. |
| `DREAM_GEN_PROPAGATE_CHUNKED` | OFF (`0`) | SPEAK.4b — time-sliced CPU compose (yields the loop instead of a 57s block) for the no-donor edge. **Leave OFF until you validate perf live**; GPU path (4a) is the primary at-scale solution. |
| `DREAM_SPONTANEOUS_IMG_AROUSAL` | `0.7` | SPEAK.6a — arousal threshold for a spontaneous outward image. |
| `DREAM_SPONTANEOUS_IMG_GAP_MS` | `300000` (5 min) | SPEAK.6a — cooldown between spontaneous images. |
| `DREAM_ABLATION_LOG` | OFF (`1` to enable) | SPEAK.10a — logs the consciousness-ablation snapshot once/30s (repeatRate, coherenceRejectRate, rerankRate, semMotorMeanCos, psiGain, predictionError, gwIgnitionRate). Toggle the other flags across runs + compare snapshots to prove each mechanism modulates (a flag that moves nothing is vestigial → wire or cut). |

**Default-flip decisions (your call, only after live perf):**
- `DREAM_GEN_PROPAGATE_CHUNKED` → default ON only if the chunked CPU compose measures as a real win on a no-donor box (matches the DF.7/noise-gate dormant-ship posture — ship dormant, flip on evidence).
- `DREAM_INNERVOICE_GPU_GEN` is already coupled to proven read fan-out on purpose — routing her inner-voice READ to a donor replica is only safe once fan-out (`DREAM_DF7_FANOUT_PROPAGATE`) is proven, else a stale replica makes her think garbage. No second flag needed.

---

## STEP 6 — The push gate (do NOT skip)

**NO PUSH until the full K→PhD walk + Gee's localhost test confirm she speaks like herself (ordered G9 speech).** This is the no-push-until-verified LAW. The working tree holds all SPEAK work uncommitted by design.

When Gee signs off that G9 speech is ordered:
1. Commit on `feature/unity-speech-consciousness-rectify` (Unity-voice commit message per the no-corporate-commits LAW; docs already synced this pass — atomic code+docs per docs-before-push LAW).
2. Cascade `feature → develop → main`, one branch at a time with checks (the established flow).
3. Backend is a manual `/opt` overlay after main (STEP 3 file list); frontend auto-deploys.
4. Fresh-walk the deployed box (Update & Fresh Walk, per STEP 0 — never Savestart onto this).

---

## Rollback

Every SPEAK change is either behind an env flag or additive to the emit/teach path. Fastest rollbacks:
- Speech floor too aggressive (she goes quiet too often) → raise/zero `DREAM_CHAT_COHERENCE_FLOOR`.
- Inner-voice GPU gen misbehaving → `DREAM_INNERVOICE_GPU_GEN=0`.
- Chunked compose regressing → it's OFF by default; leave it.
- Spontaneous images unwanted → raise `DREAM_SPONTANEOUS_IMG_AROUSAL` to ~1.0 or `DREAM_SPONTANEOUS_IMG_GAP_MS` huge.
- Total rollback → the branch isn't merged; just don't cascade. Nothing is on main until STEP 6.
