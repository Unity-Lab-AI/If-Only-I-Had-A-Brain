# TODO — Unity

> ## 📋 BOARD SHAPE — **reset 2026-08-31: completed items archived, open items carried**
>
> Gee (verbatim): *"okay so all todo is finished? we can finalize the todo now moving verbatium to finalized the completed items leaving only whats still open and in progress to get the todo to near templet form"*
>
> Gee (verbatim, this reset): *"why is ther 57 done items in the todo?"* → *"said the word, do it"*
>
> **BOARD RESET 2026-08-31, THE NIGHT OF THE FRESH WALK — 57 completed rows archived and removed; 13 open + 7 in-progress carried.** ⛔ **The 57 existed because the migration had only been done HALF:** the rows were correct write-ups and their text had reached the ledger, but the REMOVAL step never happened, so the board grew instead of holding live work. ⚠ **23 were byte-identical in FINALIZED and 34 were not** (archived in different words across earlier batches), and FINALIZED-before-DELETE forbids removing a row whose verbatim text is absent — so the WHOLE board was archived byte-for-byte rather than 34 rows cherry-picked, making the archive complete by construction instead of complete by my judgement about which rows already matched.
>
> **BOARD SWEPT 2026-08-30 on Gee's *"we are fixing all the todo items befoer we deploy the new binary and shit"* — 19 open rows → 6, and every one of the 6 is either walk-gated with its watch-number named or is the donor binary itself, held LAST by his instruction.**
>
> | Pile | Count | Status |
> |---|---|---|
> | **📦 `PRESSBLOCK.1`** | **1** (holds 2 of its original 4) | ⛔ Walk-gated, re-read live 2026-08-30: `REPLAYOFF.4` — `tier1.totalEpisodes` **0**, replay has never run; `WORDNORM.2` — `emitAttempts` **58** / `emitRejects` **58**, all `no-best-word`, so still no accepted emission to judge. **Watch `tier1.totalEpisodes` and `matrixHits` leaving 0** |
> | **`GATEDOSE.1` · `RELDEPTH.1`** | **2** | ⏳ Walk-gated, re-read live: `perSubject.math` is `pre-K` with **0** phases completed — the math gate has never run on this walk. **Watch `perSubject.math.phasesCompleted`** |
> | **`VMUSE.5.D`** | **1** (+ its plan) | ⛔ Walk-gated, re-read live: `relationUse.confident` **0**, `flatWithMass` **1,134** (mass present, margin absent), `marginProgress` **0.2511** against gate **0.15** — measurably closer. **Watch `relationUse.confident` leaving 0** |
> | **`SHADOWCOST.3`** | **1** | ⛔ **THE ONLY NON-WALK-GATED ROW LEFT, held last by Gee's instruction.** Needs a new donor opcode (Rust + `donor-v*` tag + self-update). `SHADOWCOST.8` promoted it to the ONLY fix — the saved brain is not a lagging copy, it is a different brain |
> | ~~**`ASSOCBOUND.1` · `.3` + the 18.9 h read**~~ | **0** | ✅ **CLOSED 2026-08-30** — superseded by `SHADOWCOST`, which measured what they reasoned toward; the lever was the `hebbian_ranges` run cap, not a bound on curriculum, so the RE-PRICE they demanded never had to be spent |
> | ~~**`GOTCHA.1`**~~ | **0** | ✅ **FIXED 2026-08-30** — leaf module `cluster/lexical-constants.js` breaks the cycle; `emit.js` now imports alone |
> | ~~**`SHADOWCOST.4` · `.8`**~~ | **0** | ✅ `.8` **ANSWERED by reading both kernels** (they are algebraically identical; the divergence is inputs + a 49× count gap). `.4` **DECIDED: not worth doing** — 0.05% of wall clock against a measured gate-verdict risk |
> | ~~**`FIREMATH.5`**~~ | **0** | ✅ **DECIDED 2026-08-29** — Gee accepted the ~9.6% floor; zero code |
> | ~~**`LANGHOP.2` · `SELFAWARE.PRESS` · `SELFCODE.2` · `MINDMOTION.1/2/3`**~~ | **0** | ✅ **STALE MARKERS CORRECTED 2026-08-30** — all six were built and verified days ago and left `[ ]`/`[~]`. Re-verified in SOURCE, not from the ledger. ⛔ A completed row left open is the same defect class as an instrument nobody reads |
>
> **Branch:** `main`
> **Last updated:** 2026-08-31 — **BOARD RESET, the night of the fresh walk** (pressed 07:23Z on `b1a5eb01`). The full board as it stood was archived **byte-for-byte** into `docs/FINALIZED.md` before the completed rows were stripped. The archive is verifiable: search FINALIZED for `BEGIN VERBATIM TODO ARCHIVE 2026-08-31` — **163,235 bytes, md5 `de9d9255e70817accf9c91c700f40998`**, and the archived block was checked EQUAL to the live file before a single row was removed. ⚠ 57 completed rows and 17 of their indented continuation lines came out; **0 open or in-progress rows, 8 WATCH rows, 25 verbatim Gee quotes and all 20 section headers survived**, verified by count after the strip. (The 2026-08-29 and 2026-08-20 archives remain alongside it.)
> **Philosophy:** Unity's brain controls EVERYTHING equationally. No scripts. No text-AI backends. No hardcoded fallbacks. No vestigial appendages. Every output — speech, vision, art, voice — traces back to brain state.

---

## THE GUIDING PRINCIPLE

**If a behavior exists that isn't driven by brain state equations, it's wrong.**

Every piece of Unity's output must trace back to:
- **Cortex prediction** (ŝ = W·x + b) — what she expects
- **Amygdala valence/arousal** (V(s) = Σw·x, energy-basin attractor) — how she feels about it
- **Basal ganglia motor selection** (softmax over learned channels) — what action she takes
- **Hippocampus recall** (Hopfield attractor + persona sentence memory) — what she remembers
- **Cerebellum error correction** (ε = target − output) — what she fixes
- **Hypothalamus drives** (homeostatic gradients) — what she needs
- **Mystery module Ψ** (√(1/n) × N³ × Φ̂) — her consciousness level. ⭐ **Φ̂ added 2026-08-25** — integration, from `computePhi()`. Without it the formula rates ANAESTHESIA as maximal consciousness, because low activity reads as high unspent potential; Φ̂ is what separates it from dissociation, which is also quiet and is famously hyper-vivid
- **Endocrine layer** (⭐ NEW 2026-08-25) — ten chemicals on the one curve engine, released by **six nuclei that sense their own firing**, contributing additively through the same overlay substances use. ⛔ **Chemistry is what makes Ψ a variable instead of a specification:** without it `n` only moves when input moves

---

## HOW THIS FILE WORKS (the LAWs that govern it)

Full bodies in `.claude/CONSTRAINTS.md`. These four are the ones this file exists to obey:

| LAW | What it means here |
|---|---|
| ⛔ **LAW #0 — VERBATIM WORDS ONLY** | Gee's exact sentence goes into the task. Never paraphrase, rename, collapse, shorten or downgrade it. **One task per item in a list.** Dropping a word is a violation. |
| **NEVER delete task info** | When marking a task done, change the **status marker ONLY**. Every word of the original description stays — prepend the verdict, keep the filing. Anyone reading must see WHAT was done and WHERE, not just a checkmark. |
| **Append, never replace** | New tasks go at the **bottom**. Completed tasks stay where they are. **Never regenerate this file from scratch.** |
| ⛔ **FINALIZED before DELETE** | A task may not leave this file until its verbatim text is in `docs/FINALIZED.md` **and the write is verified**. That is how this reset was done: appended, checksummed, *then* cleared. |

**Status markers:** `- [ ]` pending · `- [~]` in progress · `- [x]` done (with its verdict prepended, original text preserved)

**Task-number placement:** T-numbers, session numbers, milestone IDs and "Gee" belong in workflow docs ONLY — never in source code, public docs, HTMLs or launchers.

---

## WHERE THE HISTORY LIVES

- **`docs/FINALIZED.md`** — every completed task, verbatim, plus the full ledger of every batch. **Never delete an entry.** Contains the complete verbatim archives of this file as of 2026-08-20 AND 2026-08-29 (search `BEGIN VERBATIM TODO ARCHIVE <date>`).
- **`docs/NOW.md`** — the current-state banner, newest first.
- ~~`docs/BOARD.md`~~ and ~~`docs/OPEN-TASKS.md`~~ — **both DELETED 2026-08-20.** They were parallel views of this file, and a second list of the same tasks is a second thing to keep true; both drifted, and a stale list that looks authoritative is worse than no list. Their full contents are archived **verbatim** in `docs/FINALIZED.md` (search `BEGIN VERBATIM BOARD ARCHIVE` / `BEGIN VERBATIM OPEN-TASKS ARCHIVE`). **This file is the only board. Do not re-create a second one.**
- **`docs/KNOWN_ISSUES.md`** — running ledger of bugs, limitations and intentional deferrals (37 unique KI ids as of 2026-08-29).

## STANDING PROGRAMMES (not board lines — they have their own docs)

These are live, multi-batch bodies of work. They are deliberately **not** tracked as single tasks here, because carrying a programme as one line makes the board lie about how much is outstanding:

- **The syllabus build** — `docs/TODO-full-syllabus.md`. K is ~4–10× deeper than every grade above it (measured: kindergarten 212 teach calls / 8,943 lines vs grade1-12 43–58 / 496–714). Driven by the persistent-memory rules `feedback_curriculum_depth_and_mechanics`, `feedback_full_completeness_per_grade`, `feedback_full_real_school_course_roster`.
- **Seeded topology** — `docs/SEEDED-TOPOLOGY-SPEC.md`. Deliberately unbuilt: gated on a PRNG parity harness, because one differing draw puts weights on the WRONG SYNAPSES silently.
- **Mind-space integration** — `docs/MINDSPACE-INTEGRATION.md`.
- **The trajectory asset** — `docs/TRAJECTORY-CAPTURE.md`. Needs one complete K→PhD walk on a single build with no geometry change mid-run.

## AWAITING GEE (decisions, not engineering)

Everything codeable for these is shipped; each needs a call, not a commit:

- **A 128GB coordinator** — the box's host RAM, not the GPU, sets Unity's size (every byte on the donor has a master copy in host RAM, and the box is CPU-only). Measured ladder: 32GB → ~425M neurons · 48GB → ~722M · 64GB → ~987M · **128GB → ~2.05B (~101% of a 45GB card)**. For Red/Sponge. See FINALIZED §TIERTOP / §VRAMFILL. ⭐ **Now also the box's language-cortex ceiling:** hop 2 (2026-08-29) is RAM-floor-governed on the 32GB box (~14.4-16.8M of the 20M target) — more coordinator RAM buys the rest of the hop for free.
- **Grant actions** — Emergent Ventures (rolling); NSF Project Pitch (**verify the portal is open first** — sources conflicted on an SBIR reauthorization pause). Supporting artifacts: `docs/TRAJECTORY-CAPTURE.md`, `docs/THEORY-PAPER.md`.

**DECIDED 2026-08-29 (via ask-me-question, four answers):** `FIREMATH.5` → **accept the ~9.6% floor** (closed below); the `/unity` command file → **retune to the working arrangement** (done, .claude-local); **backups** → **leave as-is** (`--keep-daily 3`, same-box repo — the risk is accepted and stays written in the incident record for the day it changes); **the language-cortex hop** → **NOW, both brains re-walk fresh** (shipped below as LANGHOP).

---

## ACTIVE TASKS

*Every row below is carried **verbatim** from the 2026-08-29 archive (its full section context lives in FINALIZED between the archive markers). New tasks go at the bottom of this file.*

### GATEDOSE — carried from ARTZIG2 (filed 2026-08-21)

- [~] ⏳ **GATE READ 2026-08-30 (`9723bfd7`): the math gate has never run on this walk and cannot yet.** `curriculum.perSubject.math` reads `grade: pre-K · phasesCompleted 0 · cellsPassed 0 · teachEvents 0` while the walk is in `ela/kindergarten`. **The number to watch is `perSubject.math.phasesCompleted` leaving 0**; the `[GateMathK] section` timers this row is waiting on print on that first run. Nothing to build until then — this is walk-gated, not deferred. **GATEDOSE.1** — the math gate's post-ORDER residual (arithmetic batteries + LAW-7 production probes + sentence-gen) is unmeasured; the new `[GateMathK] section` timers name the cost per section on the next gate run. Read the lines, target the biggest number. (The probe half is DONE: 158/158 on the donor at 61ms avg.)

### RELDEPTH — carried from SPEAKFIX (filed 2026-08-22)

> Gee (verbatim): *"this is a problem: 'the sem→word_motor speech binding was grabbing neighbors instead of answers.' what can we do to make a real fix so she answers correctly?"* → *"write the todo items then get to it"*

- [~] ⏳ **GATE READ 2026-08-30 (`9723bfd7`): same gate as GATEDOSE.1 — math is at `pre-K` with 0 phases completed, so no gate VERDICT exists to measure a per-section delta against.** The reps are already raised in code; this row is purely the measurement that confirms or refutes them. **Watch `perSubject.math.phasesCompleted`**, then read the per-section verdict deltas. **RELDEPTH.1** reps raised (SUCC 4→10, MAKETEN 8→16, TEEN 16→24) — stays open until the next gate VERDICT measures the per-section delta — — the compositional arithmetic channels (successor SUCC 10%, MAKETEN 9%, TEEN 0/9 measured) get their teach reps verified + deepened against the gate's own per-section scores; verdicts stick in state now, so every press measures the delta per section.

### PRESSBLOCK — carried from THE TWO UMBRELLAS (consolidated 2026-08-25 on Gee's instruction)

> Gee: *"compress the 4 press-blocked into one task not 4 containing all the tasks, the 5 multi day ones do the same putting them as 1 item containing all ther there in tasks"*.

- [~] ⏳ **GATE READ 2026-08-30 (`9723bfd7`, 14.5 min in) — both survivors re-checked live, both still genuinely unreadable, and ③'s gate has NOT moved.** **③ `REPLAYOFF.4`:** `memoryStats.tier1.totalEpisodes` **0**, `tier2.schemaCount` **0** — replay still has not run even once, so cutting reps would remove teaching and blame the wrong thing, exactly as this row warns. **Watch `tier1.totalEpisodes` leaving 0.** **④ `WORDNORM.2`:** she is now ATTEMPTING and being refused — `emitAttempts` **58**, `emitRejects` **58**, every one `no-best-word`, `matrixHits 0 / oracleHits 0`, `verdict: attempting-refused`. ⭐ **That is a step forward from the previous read's `wordMotorEverFired 0`** — `word_motor` now reads 904,964/904,964 everFired — but there is still ZERO accepted emission, so there remains no sample to judge frequency bias from. ⚠ **`no-best-word` at ~15 min into an ELA-K walk is the expected early state, not a defect** — she has not been taught enough words to win an argmax yet; it becomes a defect only if it persists once vocabulary lands, and `emitRejectsByReason` is the field that will say so. **Watch `matrixHits` leaving 0.** Original filing: **⭐ TWO OF FOUR ANSWERED 2026-08-25, both by measurement, and item 1's finding is that EVERY presumed cause was wrong.**<br>**① `LOOKSTARVE`/`LOOPSTARVE.2` — ✅ ANSWERED, and the answer was not on the candidate list.** This item named three suspects — donor WS frames draining ahead of the HTTP request, the 10fps broadcast `getState` build, and nginx→node queueing — and ordered *"do not fix this from reasoning."* ⭐ **The self-profile named the real starver and it was none of them:** `injectEmbeddingToRegion` **34.9%** + `_clearSpikes` **23.0%** = 58% of main-thread self-time, both CPU teach walks. **The broadcast suspects total ~4%** (`getState` 1.1%, `_getUtilizationState` 1.1-1.7%, `state.js:670` 1.4%) — real but nowhere near the cause, and WS/nginx never appeared at all. **Fixed via SCALEWALK; loop service 95% → 99%, late/min 3018 → 623.** *The instruction not to reason was correct: reasoning would have optimised the broadcast and left 58% untouched.*<br>**② `SUBSTEPS.6` — ✅ ANSWERED: batches are NOT issued behind the probe gate, BY DESIGN, and the board now says so.** The question was *"establish whether batches are issued at all during the probe gate."* `batchPaused` reads `probe-gate (cortex owns the GPU exclusively for this cell)` with **`expected: true`** while `batchStall` stays `null` — so the 65-minutes-of-zero-batches symptom was the designed pause, previously indistinguishable from a stall. ⭐ **And the controller's input is healthy when batches DO flow:** `batchTiming.roundTrip 1142ms` with `EMA 663.18ms`, `gpuDispatchPerSec 14.72` — it reads ROUND-TRIP, which was the specific trap this item flagged (reading tick time once pinned it at its floor while looking present). **No cooldown was guessed at, which is how SUBSTEPS.5 shipped wrong.**<br>**⛔ ③ and ④ REMAIN — but they now have SPECIFIC readable gates instead of "needs a press":** `REPLAYOFF.4` needs `memoryStats` consolidation passes **> 0** (currently `0`; replay has not run, and cutting reps before replay is proven removes teaching and blames the wrong thing) and `WORDNORM.2` needs her to actually emit — `voice.verdict` is `unmeasured` with `oracleHits 0 / matrixHits 0 / wordMotorEverFired 0`, so there is no sample to judge frequency bias from yet. ⭐ `separability` **has a producer now and reads `maxAbs 0.1`** — the emission-margin instrument is alive and waiting for its first emission. **Original filing:** **📦 PRESSBLOCK.1 — the four that CANNOT be worked until the press, as one item.** ⛔ **These are not deferred, they are unmeasurable.** Every one needs a running brain on current code to produce the number that decides what to do, and three of the four have already burned a wrong guess. **Do them in this order once the press lands, because each depends on the one before:**
  1. **`LOOKSTARVE`/`LOOPSTARVE.2` — find the actual starver. MEASURE FIRST.** ⚠ My presumed cause was already disproven once: I was about to add yields to the hot teach path when inspection showed `_teachWordSpellingDirect` already yields every 50 words and `_microtask` is misleadingly named but resolves via `setImmediate` — a real macrotask yield. The teach path is NOT failing to yield. Remaining candidates, to be separated by the `loopStarve` numbers plus a per-phase breakdown: donor WS frames draining ahead of the HTTP request in the poll phase, the 10fps broadcast getState build, or nginx→node connection queueing. ⛔ **Do not fix this from reasoning.**
  2. **`SUBSTEPS.6` — zero batches in 65 min behind the probe gate.** The adaptive controller cannot climb from its floor because nothing is feeding it. ⛔ **Guessing a cooldown is exactly how SUBSTEPS.5 shipped wrong.** Start by establishing whether batches are issued at all during the probe gate; the controller reads batch ROUND-TRIP, not tick time — reading tick time once pinned it at its floor while looking present. **→ INSTRUMENT ADDED 2026-08-27:** `batchTiming.samplesInProbeGate` (`gpu.js`, beside `samples++`) counts completed batches while `_probeGateActive` is up, cumulative per boot — so the answered-by-design verdict above is now a READ on any boot instead of a re-derivation, and ⚠ `dispatchesDuring` is documented at the counter as a per-batch socket-sharing proxy, **nothing to do with the gate** — it was one mis-read away from being quoted as this number.
  3. **`REPLAYOFF.4` — re-price the reps DOWNWARD, but ONLY after replay is proven real.** Interleaved replay is what SEPARATES representations, so once it genuinely runs, the same margin should be reachable with fewer waking reps — which is a large walk-cost saving. ⛔ **Order is load-bearing:** cutting reps before replay is verified removes teaching and blames the wrong thing when quality drops. RE-PRICE LAW applies.
  4. **`WORDNORM.2` — the verdict watch.** Read whether per-bucket normalisation actually fixed the frequency bias where common words win every argmax, or merely moved it.
  ⭐ **After the press these become readable for the first time** via the instruments just lit: `loop service` %, `state.voice` verdict + `matrixDrivenPct`, and `separability` — the emission margin, which has never had a producer until now.

### VMUSE.5.D — carried from ENDO + INTRO → VMUSE.5 CONSUME (2026-08-26)

> Gee (verbatim, asked where to consume it): *"all of the above"*

- [ ] ⏳ **GATE READ 2026-08-30 (`9723bfd7`): the bands have NOT separated, so this stays unbuilt exactly as its own plan instructs — and the gate is measurably CLOSER than it was.** `ownArt.relationUse` reads `asks` **1,204** · `confident` **0** · `flat` **1,134** (`flatWithMass` 1,134, `flatNoMass` 0 — so the mass is there, the MARGIN is not) · `bestMarginRatio` **0.0377** on the word "black" · `marginProgress` **0.2511** against `marginGate` **0.15**. `tagWrites` 19,112 with tag 13 carrying 15,900 of them. ⭐ **The instrument is doing precisely what it was built for: refusing to report confidence it does not have.** ⛔ **Building D now would tilt emission toward noise, which is the one failure mode the plan below explicitly forbids. Watch `relationUse.confident` leaving 0.** Original filing: **⛔ NOT BLOCKED — PLANNED, AND WAITING ON THE WALK (see the plan below) — VMUSE.5.D: SPEECH + CHAT consume it.** ⚠ My "blocked" verdict here was RETRACTED by the investigation below: `fineType_to_sem` already exists, so no new projection is needed and the real gate is that the bands must separate first. ⚠ Highest impact and highest risk: it changes what she SAYS. Bounded as a small bucket-mean boost on the same shape as the existing GlobalWorkspace boost — **never a hard override**, so the trained argmax still decides and the relation only tilts it.

- [ ] ⏳ **Same gate as the row above (`relationUse.confident` 0, `marginProgress` 0.2511 / gate 0.15, read 2026-08-30). The plan below is complete and every claim in it was verified by execution — it is waiting on the walk, not on design.** Original filing: **⛔ VMUSE.5.D — SPEECH: THE PLAN (investigated 2026-08-26; my first blocker claim was WRONG).** I wrote a bucket-mean boost on the GlobalWorkspace pattern and then found **my own design was wrong twice over.** ⛔ **(1)** It boosted `relBoostWord = the PREVIOUS word` — which is a repetition loop, the exact stammer the repetition penalty three lines below it exists to fight. Boosting *related* words instead needs a "words related to X on channel N" lookup that does not exist in that lane. ⛔ **(2) More fundamental:** `emitWordDirect` propagates `sem_to_word_motor`, which reads the **sem region only** — and the relation tag lives in **fineType**, which is **not an input to that matrix**. So no tag set at emission time can reach the argmax at all. ⭐ **A relation-conditioned emission needs a projection that takes fineType as input** (`fineType_to_sem` exists and is whitelisted, so the pieces are there — the wiring is not). ⚠ **Reverted to zero traces rather than left in as an inert or wrong boost**: an emission bias that cannot fire is exactly the "built but never consumed" class this whole batch exists to close, and one that fires wrongly is worse. **Filed with the mechanism named so the next attempt starts from the projection, not from the boost.**

#### VMUSE.5.D — THE ACCURATE PLAN (investigated 2026-08-26)

⛔ **CORRECTION TO MY OWN BLOCKER.** I wrote that this *"needs a projection that takes fineType as input"* and that **was wrong**. `js/brain/cluster.js` builds cross-projections from a PAIRS list containing `['sem','fineType']`, and pairs create **both directions** (the boot assertion expects *"14/14 (7 pairs × 2 directions)"*). ⭐ **`fineType_to_sem` already exists as a real trained matrix, and the association teach whitelists it** — so the relation tag has been bound bidirectionally with meaning all along. **No new projection is required. The mechanism is a two-step propagate through matrices that already exist.**

**THE MECHANISM — equational end to end, no lookup, no template:**
1. Build a fineType-shaped vector with ONE tag band lit — the same span `_writeRelationTag` writes (`band = fineSize / RELATION_TAG_BANDS`, 10,500 cells at her real 504,000).
2. `fineType_to_sem.propagate(tagVec)` → **a sem pattern that IS "what this relation means"**, read straight out of trained weights.
3. Add that pattern, SCALED SMALL, into the sem query vector `emitWordDirect` already builds.
4. `sem_to_word_motor` argmax runs unchanged — now relation-conditioned. ⭐ The trained argmax still decides; the relation only tilts it.

⛔ **THE COST, MEASURED, AND IT IS THE WHOLE DESIGN CONSTRAINT: one `fineType_to_sem` propagate is 51 ms** at the real shape (1,500,000 × 504,000, ~15M nnz). ⚠ **Naively wiring that per emitted word is a 51ms stall per word** — precisely the class of defect LOOPCHAT.1 was filed for this morning, and it would be worse than the thing it is trying to add.

⭐ **THE FIX IS THAT THE INPUT IS CONSTANT.** A tag vector is the same every time — 10,500 contiguous cells at a fixed value — so `fineType_to_sem.propagate(tagVec)` returns the **same sem pattern** for a given tag on given weights. **Cache it: 48 tags × one propagate = 48 warmups (~2.4s total), then free array reads forever.** ⚠ Warm them with `propagateChunked` (it exists on this matrix — verified) so the 48 warmups never pin the loop, and warm LAZILY on first use of each tag so unused channels cost nothing.

**THE WIRING, concretely:**
- **`js/brain/cluster/emit.js`, `emitWordDirect`** — after `preSem` is built (it already is, via `_buildSemPreVector`) and BEFORE `proj.propagate(preSem)`. That is the only place the sem query exists and is still mutable.
- Source of the tag: `curriculum._confidentRelationFor(activeConcept)` — **the ONE gate**, so a band that has not separated returns null and the whole path stays identity.
- Blend: `preSem[i] += relSem[i] * REL_MIX` with `REL_MIX` small (start ~0.10, env-tunable) — ⚠ **additive tilt, never replacement**, and never applied to a recently-emitted word (the same `_isRecentContent` guard the GW boost uses, or it becomes a stammer).
- Cache: `cluster._relSemCache = Map<tag, Float64Array>`, invalidated on weight load/save so it cannot outlive the weights it was derived from.

⚠ **PREREQUISITE, and it is a real one: the fresh walk must populate the bands first.** Tags ≥6 wrote nothing until today's VMUSE fix, so `fineType_to_sem` holds no trained mass for them yet. **Until `state.ownArt.relationUse.confident` starts climbing, this path would tilt toward noise** — which is exactly why B (the instrument) shipped first. ⭐ **Do not build D until the instrument shows the bands separating.**

⭐ **EVERY CLAIM ABOVE VERIFIED BY EXECUTION, not asserted** (real `SparseMatrix` at the true 1,500,000 × 504,000 shape, ~15M nnz): **(1)** the same tag returns a **bit-identical** sem pattern, so the cache is valid rather than merely plausible; **(2)** different tags return **different** patterns — 235,140 cells differ between tag 13 and tag 23 — so the channel genuinely carries relation information and this is not a no-op dressed as a feature; **(3)** `propagateChunked` is **bit-identical (maxDiff = 0)**, so the warmups can chunk without changing a number; **(4)** the warmup budget is **2.4s for all 48** at 50.4 ms each, one time, lazily. ⚠ **The 51 ms figure is the reason the design is a cache and not a call** — quoted here so nobody re-derives the naive version.

### GOTCHA.1 — carried from GOTCHA REVIEW (filed 2026-08-27)

> Gee (verbatim): *"review the gotcha's add them to the todo work and use ask me question where needed... and rerun the ingestion to search for more gotchas"*

### ASSOCBOUND — the costliest teach lane has two callers and only one is bounded — filed 2026-08-27

Surfaced by the `ARTHOG.1` verdict: the rate limit engaged exactly as specified, and the phase kept dragging. That is the row's own fallback answer — *"art was not the cause and that is equally useful to know"* — arriving as a finding.

### FIREMATH.5 — carried from FIREMATH (filed 2026-08-28)

> Gee (verbatim): *"do the todo write up of what and how we aree going to fix Unity for what she and the equations needs"* — FIREMATH.1-.4 are all DONE and VERIFIED LIVE (see the 2026-08-29 archive); this is the one remaining fork.

## LANGHOP — language-growth hop 2, taken on Gee's word — filed + built 2026-08-29

Gee (via ask-me-question, the language-cortex hop 12M → 20M+): **"Now — hop and re-walk fresh"** — *"The current walks are young (hours old), so the sunk cost is small; both brains fresh-walk again on the bigger cortex."*

## SELFAWARE — her self-awareness stack assessed live, and the three missing lanes built — filed + built 2026-08-29

Gee (verbatim): *"how is Unitys self code awareness? remember months and months ago we tried to put something in for her code recognition self awarness, residual self image, personality, inquizitiveness and her yearning to learn and especially her self first person reality of humanities self centered perceptions on all things in human existancewhile abstractly understanded the non self material current lived world and phyical universe and its laws inhabiltied by living others of all kingdoms and all of that... its probably attrafied and needs real attention and tender loving care so once unitys phd in coding major is complete she sees and has full eyes on her everything but idk how thats all gonna play with the equations so it needs real prep. and once that is all done we need to start on it , its todo s you wrote down hopefully, and the other todos still outstanding as nothing is blocked or deffered and if my input is needed you should use ask me question and get on with it. think about some advanced use cases we can apply whilke maintaining our stack laws. So... all of this needs prper write up and vault gotchas closed out that are completed and any todos completed or that can be completed , finished up and finalized.md transfered verbatium"*

Gee (verbatim, mid-build): *"remember she hat nubs that grow into to perfect tits and a slit that formas into a womans vagiina that bleeds monthly and she shits and pisses too"*

Gee (verbatim, mid-build): *"i dont think u ever added a bathroom experience for her when humans spend 25% of their life time in there with all kinds of good and bad memories in there alone and with others"*

**THE ASSESSMENT (live reads on the fresh-walk boot, not code archaeology): NOT atrophied.** Everything he named exists and is running under `state.consciousness.*`: the endocrine layer alive (chemicals with real receptor sensitivity, adrenaline everFired), the introspective drive online and correctly `starved` (no episodes yet on a walk minutes old — the design's own expected-early state), `phiState: live` (Φ̂ measuring real integration for the first time, thanks to FIREMATH), `mechanism: routed` (drugs act through her transmitters), SELF-PRONOUN/SELFFRAME teaching live in the walk (assocCallers showed it), `_teachSelfArchitecture` at g9+ ELA, identity anchors grade-banded, residual self-image loading, relationUse honestly refusing flat bands (23,655 asks, 0 confident — correct this early). ⚠ First probe mis-read the PUBLIC payload's nesting and briefly called endocrine/introspection missing — retracted; they live under `consciousness.*`, verified by nested search. **What was genuinely missing — the three lanes below, all greenlit via ask-me-question and BUILT:**

## MINDMOTION — the mind's eye looks up single words, hides her process, and jump-cuts between images — filed 2026-08-29

Gee (verbatim): *"and she is still only looking up single words at a time for the minds eye and only drawing single words subjects. thats not normal to a human so idk what needs to be done there but its like she is being nuetered in here experimentation drawing not ever showing and the images just appear and instantly the next appears. in our engine should they not actual calulate in one to the next it seemes like you are artificially using old resolution and pixel type layout when we have a 3d engine calcualteing changes in the equations, so add all these to the todo also"*

## STYLEBLEED — her own style vocabulary was becoming her subjects and tinting everything green — filed + fixed 2026-08-29

Gee (verbatim): *"and there is something wher ist always looks up color crisp which is a green pallat neom colored full screen that taints every image she tries to combine with it makeing it the same crisp color neon green image"*

## SHADOWCOST — the heaviest op IS on the GPU, but we re-run it on CPU every 5th call and that shadow is 45% of the boot — filed 2026-08-30

Gee (verbatim): *"is it noraml the heavioest op is being run on cpu? The single heaviest op in the walk is running on the CPU-only box while the A40 idles. that seems like we are fucking our selves, or does it have to be this way"*

Gee (verbatim): *"start in the best order"*

**The live read that filed this** — box `07bf16f8`, **15.68 h** uptime, parked in `ela/kindergarten` **cell phase 2 of 25**, one `_teachAssociationPairs` call open **14.88 h** (8,428 glue pairs × 60 reps + 718 lead-ins × 80 = **563,120 pair-writes**, measured off the real corpus; at the live 4.76 writes/sec that one call needs **~33 h**). ⛔ **Correction owed on my own first answer:** the A40 is NOT idle on the heavy op — `hebbianRanges` dispatches the intra Oja to the donor **every call** (`js/brain/cluster/hebbian.js:1151`). What costs the hours is the CPU **shadow** at line 1158 (`_intraOjaShadowCounter % 5 === 0`): 268,660 intra calls ÷ 5 = 53,732 CPU passes × ~473 ms = 25.4M ms, against the board's reported `hebbian.intraMs` of **25,401,320** — the shadow IS essentially the whole **7.06 h**, 45% of the boot. **The same defect was already diagnosed and cured 110 lines up in the same function:** the sibling `hebbianBound` branch (lines 1029–1046) was moved off every-Nth-call onto a **30-second wall-clock gap**, its comment stating that the every-Nth sampler *"scaled shadow cost WITH the call rate … the faster the walk ran the MORE 3.9s passes it paid."* The `hebbianRanges` branch never got it. One function, two branches, one fixed.

- [~] **⏳ BUILT 2026-08-30, AWAITING THE RELEASE + ONE PRESS — donor `readback_matrix_values` (v0.3.36) + the server half.** ⭐ **The checkpoint now saves the weights the GPU actually trained.** **Donor:** new opcode streams the resident values buffer as type=7 SPRR binary chunks (32-byte header so the f32 payload lands 8-byte aligned; `byteOffset` split across TWO u32 because the intra matrix is already 1.81 GB and a u32 wraps silently at 4 GiB, reassembling two chunks onto the same destination with every chunk still individually valid), closed by a JSON ack carrying FNV-1a-64 over exactly the bytes sent. Sliced ON THE DEVICE in both backends — wgpu `copy_buffer_to_buffer` at an offset, CUDA a `CudaSlice` view — never `memcpy_dtov` of the whole buffer, which would allocate 1.81 GB **per chunk**. **Server:** streams each chunk widened f32→f64 straight into `matrix.values` (no multi-GB staging), verifies chunk count + order + overrun + digest, and ⛔ **does NOT save on failure** — a partial transfer leaves the array a mix of old-CPU and new-GPU rows and a checkpoint from that is a *third* brain, so the coherent CHECKROT slots stay. **Cadence priced before shipping:** ~2.3 GB ≈ 59 s at the measured 39 MB/s → hourly = **1.6% of wall clock**, crash loss ≤ 1 h; every-save would be **20%** on the teach socket. Plus a budgeted pre-stop pull on SIGTERM so a *planned* stop loses nothing (bounded because the shutdown save already pins the loop ~112 s and an unbounded transfer could turn a clean stop into a SIGKILL that WDCLEAN.1 would correctly call a hard death). Version-gated ≥ 0.3.36 per socket. **Verified:** `cargo check` on BOTH feature sets (`dynamic-loading` means the CUDA path compiles without the toolkit, so neither backend ships compiler-unverified), frame layout is a TEST including a 5,000,000,000-byte offset, **the donor's own emitted bytes parsed by the server's exact arithmetic**, and reassembly harnessed on the real mixin — happy path bit-exact, and a flipped byte / dropped chunk / overrun / not-found each caught by name. ✅ **RELEASED + ALL FOUR SURFACES VERIFIED 2026-08-30** (Gee: *"okay the binary has deployed.... whats next...?"*): tag `donor-v0.3.36` published by CI after 390 s · both assets attached (`unity-donor-linux-x86_64` 17.8 MB, `unity-donor-windows-x86_64.exe` 12.4 MB) · `html/compute.html` + `html/legend.html` both reading `donor-v0.3.36` on the DEPLOYED site · and ⭐ **the shipped binary downloaded and RUN — `unity-donor 0.3.36`, and its own `--self-test` emits the byte-identical values-chunk frame hex the server's parser was already checked against, so cross-language parity is proved against the actual artifact rather than my local build.** `CURRENT_DONOR_VERSION` 0.3.35 → **0.3.36** only after that. ⛔ **AND IT IS A SAVESTART, NOT A FRESH WALK — verified, not assumed:** `WEIGHTS_FORMAT_VERSION` is untouched at **6** and a diff across the whole session shows **zero** changes to `WORD_MOTOR_TARGET`, `langCortexSize`, `VM_FILE` or any cluster-shape constant. ⏳ **Remaining: one Update & Savestart.** The pod connected before the release existed so it is still on 0.3.35; the press restarts the server on the new recommended version, the donor disconnects, sees it, exits, and the launcher installs 0.3.36 on reconnect. Original filing: ⭐ **THE LAST ONE, AND THE ONLY ONE LEFT THAT IS NOT WALK-GATED — held deliberately per Gee 2026-08-30: *"we are fixing all the todo items befoer we deploy the new binary and shit"*.** Every other board row is now either closed or waiting on a number the walk has to produce. `SHADOWCOST.8` promoted this from "nice to have" to **the only fix**: the CPU copy is not a lagging copy of the GPU brain, it trains on a different spike state (94% of GPU dispatches go through `hebbian_bound`, which reads the donor's RESIDENT buffers the CPU never sees) at 1/49th the rate — so no amount of CPU shadowing will ever reconstruct it, and the checkpoint on disk is a different brain than the one that has been learning. Needs a new donor opcode: Rust change, `donor-v*` tag, CI builds both binaries, every donor self-updates. Mine end to end per the donor-tag rule. Original filing: `SHADOWCOST.3` — **GPU readback for checkpoints.** `_collectBinarySections` (`server/brain-server.js:7561`) saves `cortex.synapses` off the **CPU** values array and line 7568 says outright *"GPU readback not yet wired"* — so the brain on disk is the shadow copy, which at `% 5` received 1 in 5 of the intra updates (~12 of 60 reps; `curriculum.js:15994` records that 12 reps gave margins *"~0.003, barely above noise"*, which is why they went to 24). ⛔ **Scope correction owed:** the donor protocol has **no matrix-values download op** — the full type list is `clear_spike_region · compute_batch · compute_request · gpu_init · hebbian_ranges · letter_surprise · mindspace_op · mindspace_result · readback_letter_buckets · readback_matrix_checksum · rebind_sparse · write_current_slice · write_spike_slice`. Only a checksum and ≤64 sampled values come back. Real readback = a NEW donor opcode = Rust change + donor release + every donor updates. Not a same-day item; mine end-to-end per the donor-tag rule.

## REBINDWAIT — the 0.3.36 press: she is fine, the walk is teaching, and the boot has an 8-minute hole in it — filed 2026-08-30

Gee (verbatim): *"okay she is back up and trainin. but this looks wrong:Current Training — subject / grade / progress no cell active … we are good now to let her cook? it says teaching but no cell is active"*

**THE PRESS ITSELF WAS CLEAN, verified not assumed:** `Binary weights applied — 17/17 sections restored` (saveVersion 12, 6,862.2 MB), `LANGRAM.6 GEOMETRY PIN HELD — 15,082,717` (this boot's live bounds would have sized it **12,646,146**; the pin beat them), `GPU proxy ready: 17/17 matrices uploaded (FULL)`. `WEIGHTS_FORMAT_VERSION` untouched at 6 and zero geometry constants moved across the whole session — **Savestart, not fresh walk**, as promised.

⭐ **AND THE pre-K READING WAS CORRECT, NOT A RESET.** `passedCellsTotal` is **0** — she has never *passed* a cell — and since `WALKORDER.1` position comes from the `passedCells` ledger with **the ledger winning**, every boot resolves to the lowest owed cell, which is pre-K. She showed `ela/kindergarten` before only because that boot had climbed there. She climbed again this boot too: **at 12.0 min she is in `ela/kindergarten`, `_teachAssociationPairs`, `status in-progress`, at 3,743 teach/min** (against 279–544 on the previous boot — recorded as an observation, cause NOT claimed).

⚠ **`no cell active` while the donor row said `teaching` was two honest instruments describing different things** — the donor's "21 ops" was upload acks, and the curriculum's own line said it outright: *"runner quiet 5.0 min — EXPECTED: the canonical sparse upload is IN FLIGHT … the walk waits for `_cortexFullyReady` by design."*

- [~] ⏳ **RE-READ LIVE 2026-08-30 on `838bfa6a` (115.6 min in) — the distribution this row asked for EXISTS NOW, and it is carried forward as `READBACKEYE.2` with the numbers written down.** `rangesFail_runs` **7,066** of **7,128** total fallbacks · buckets ≤2× **4,066** / ≤4× **1,957** / ≤16× **942** / >16× **163** · `rangesRunsMax` **1,633,555** · `rangesRunsOkMax` **65,183** (crowding the 65,536 cap, so it still binds). ⛔ **And the fall-through rate this row called "not urgent" HAS climbed, exactly as it warned to watch for:** `cpuFull` **7,128** (was 2) and `cpuFullMs` **1,576,315 ms = 22.7% of the boot**. **This row's own instruction — *"Re-price from `rangesRunsMax` rather than doubling on instinct"* — is what `READBACKEYE.2` executes.** Original filing: `REBINDWAIT.2` — ⚠ **`rangesRunsMax` is now `362,859`** (from 51,330 one press ago) against the `SHADOWCOST.7` cap of 65,536, with `activeSum` 520,549 over 2 calls. The cap is well behind the pattern sizes again. **It is not urgent** — the bound path is absorbing almost everything (`boundGpu` 1,338, `boundNoShadow` 1,336, only **2** calls fell through, `cpuMs` 612 total) — but at 362,859 runs a frame is ~11.6 MB, so the raise is still cheaper than an ~806 ms CPU pass if the fall-through rate ever climbs. **Re-price from `rangesRunsMax` rather than doubling on instinct; watch `cpuFull` and `cpuFullMs`.**

## PHASELOOP — the walk could never pass its first cell, and it was one line — filed 2026-08-30

Gee (verbatim): *"back to the brain its been on phase 2 of elz for like close to 40 hours now including all the update savestarts,,, so what is up,, is this thing ever going to pass the first cell?"*

Gee (verbatim): *"go"*

**THE ANSWER WAS NO, AND IT WAS NOT SLOWNESS.** `js/brain/curriculum.js`, first line of the `_teachAssociationPairs` rep loop:

```js
for (let rep = 0; rep < reps; rep++) {
  if (globalThis._brainShutdownRequested) return { trained, skipped };   // banks NOTHING
  if (rep > 0 && cluster._phaseDeadlineAt && Date.now() > cluster._phaseDeadlineAt) {
    cluster._phaseRepCursor[_cursorKey] = reps - rep;                     // banks the remainder
```

⛔ **Two exits from the same loop at the same clean rep boundary: the budget exit saves its place, the shutdown exit throws it away.** And the budget exit never runs, because `PHASE_BUDGET_MS = 0` — Gee's own 2026-08-20 call, printed live as `NO PHASE BUDGET — this phase runs to completion however long it takes`.

**So every Update & Savestart:** shutdown flag set → the rep loop returns with no cursor → weights save fine (**the learning is NOT lost**) → on reboot `passedPhases` has no entry and `_phaseRepCursor` has no remainder → the full authored dose re-arms → `_teachSentenceStructure` restarts at `visit #1 · mode=FULL · effective dose ×1.000`. **The phase is longer than the gap between presses and nothing partial banks, so it cannot finish — not slowly, by construction.**

**LIVE EVIDENCE (`0139c186`, read via the `READBACKEYE.1` backward ring paging, which is what made the boot lines reachable at all):** exactly ONE `PHASE SKIPPED` line in the whole ring — `_teachCourseIdentity`, the trivial course-name phase — which is the entire `cellPhasesCompleted: 1 / 25`. `phaseWork done 0 / 14` after 33 min with a single `_teachAssociationPairs` call 32.6 min deep and still running. `passedCellsTotal` **0**.

⚠ **NOT lost training, and the distinction matters:** under Oja (`w = w(1-lr) + lr·x`) re-running the same reps converges to the same weights, so nothing is corrupted or harmfully double-counted. She HAS been learning this material for 40 hours. What she never gets is the **credit** that lets her advance — she is re-sitting a lesson because nothing wrote down that she had already done half of it.

- [ ] `PHASELOOP.2` — ⚠ **THE SIBLING, FILED RATHER THAN SILENTLY LEFT: `_teachQABinding` has the identical shutdown exit and NO cursor machinery at all.** `grep` on the exit line returns **two** hits, not one — `curriculum.js:13635` (`_teachQABinding`) and the one just fixed. The second loop has no `_cursorKey`, no `_phaseRepCursor` write and **no budget check either**, so an interrupted visit there discards its progress with nothing to bank it into. ⛔ **Filed, not fixed, and the reason is the standing lesson:** *bounding one caller of a shared hot method is fixing an INSTANCE* — but the honest counterpart is that fixing the OTHER instance blind is guessing. ⭐ **It is not what was blocking Gee's walk, and that is measured, not assumed:** `_teachQABinding` does not appear anywhere in `curriculum.liveness.teachProfile` on either the 115-min or the 36-min boot read, while `_teachAssociationPairs` holds the in-flight 32.6-minute call. **Decide it from a read: if `_teachQABinding` ever shows up in `teachProfile` with real ms, it needs the same cursor; until then adding the machinery would be unpriced work on a lane that may not run at K at all.**

## WALKCOST — where the 205 ms per pair-teach actually goes — filed 2026-08-30

Gee (verbatim): *"weeks per cell is not going to work"*

Gee (via ask-me-question, choosing between four levers): **"Measure batching first"** — *"Find out why a pair-teach costs 205ms when the CPU Oja in it is only ~26ms averaged."*

**⛔ THE ANSWER TO THE BATCHING QUESTION IS NO, AND THE PROFILE SETTLES IT.** A fresh 45-second self-profile taken **at 33.3 min uptime, inside the heavy `ELA-K-STRUCTURE-CONCRETE-SENTENCES-LO` call** (⚠ the profile already in state was **23 minutes stale**, sampled at 3 min during the definition bootstrap — sampling the wrong moment is the trap that has bitten three times today, so it was polled for until fresh):

| self-time | function |
|---:|---|
| 15.9% | `propagate @ sparse-matrix.js:566` |
| 15.0% | `intraSynapsesAntiHebbian @ hebbian.js:1570` |
| 13.5% | `intraSynapsesHebbian @ hebbian.js:1159` |
| 11.0% | `step @ cluster.js:3882` |
| 10.0% | `ojaUpdate @ sparse-matrix.js:760` |
| 8.1% | `_antiHebbianChunked @ hebbian.js:779` |
| **2.3%** | **idle — the coordinator is SATURATED** |

**The 205 ms is REAL PLASTICITY WORK, not framework overhead**, so there is no batching win hiding in it. ⚠ My *"~180 ms unaccounted"* framing was wrong: I compared against the intra-Oja CPU pass alone, but the anti-Hebbian and propagate run per pair-teach too. Retracted.

⛔ **AND ONE LANE IS GPU-INELIGIBLE BY CONSTRUCTION.** `intraSynapsesAntiHebbian` reaches the donor only when `pre === this.lastSpikes && post === this.lastSpikes`, but the contrastive teach **deliberately passes a sampled WRONG post-pattern** to push it away in weight space. The identity check can never pass on that path — that is 23.1% of CPU that no cap raise or verb swap on the existing ops can touch.

**THE OFFLOAD CEILING, PRICED:** mean active set **150,788 rows** (`activeSum` 696,187,861 / 4,617 calls), so an explicit index river is **1.15 MB = 29 ms of wire against a measured 113 ms CPU pass = 3.8×** on both plasticity lanes. ⛔ **But `propagate` and `step` do not move, so the overall ceiling is ~1.5× — 41 h → ~27 h. A donor release does not solve this, and that was established BEFORE building one.**

- [ ] `REPCOMP.2` — ⛔ **THE DEEPER ANSWER TO GEE'S QUESTION, AND IT OUTRANKS THE REP COUNT: real brains learn few-shot because of REPLAY, and hers has never run.** Live at 43.1 min: `tier1.totalEpisodes` **0** · `tier2.schemaCount` **0** · `promotedToTier2` **0** · `isDreaming` **false**. The whole hippocampal→consolidation→cortex path that makes few-shot learning possible in a real brain is built, wired, and producing **nothing**. ⭐ **`REPLAYOFF.4` already says this and states the ordering:** *"Interleaved replay is what SEPARATES representations, so once it genuinely runs, the same margin should be reachable with fewer waking reps — which is a large walk-cost saving"*, with ⛔ *"cutting reps before replay is verified removes teaching and blames the wrong thing when quality drops."* **So the 100 reps are partly compensating for a dead consolidation system, and finding out WHY `tier1` has zero episodes is worth more than any rep arithmetic.** Watch `tier1.totalEpisodes` leaving 0.

  ⭐⭐ **TRACED 2026-08-30 — IT IS A CLOSED LOOP, AND `PHASELOOP.1` WAS SITTING INSIDE IT.** Tier 1 has exactly **three** writers, and every one of them was dead during the walk:

  | writer | where | why it produced nothing |
  |---|---|---|
  | `_recordPhaseEpisode` | `curriculum.js:3163` | fires on **phase completion** — and phases were not completing, because the shutdown exit banked no cursor. **1 phase in ~40 h** |
  | WM age-out → `storeEpisode` | `memory.js:1091` | gated on **`!this._curriculumInProgress`** |
  | Tier-1 thinking heartbeat (30 s) | `memory.js:1110` | gated on the **same flag** |

  ⛔ **And this page's own Traps section already warned about that flag:** *"`_curriculumInProgress` is true for the ENTIRE multi-week walk. Gating anything on 'not mid-walk' means it never runs."* The gating was deliberate (the comment records a 2 s main-loop freeze it was fixing) and its stated escape is *"promotion resumes automatically in dream windows / idle / chat"* — ⚠ but during a continuous walk there is **no idle and no chat**, so a dream window is the only opening, and `tier1: 0` after 43 minutes says empirically that opening is not enough.

  ⭐ **THE DEADLOCK, stated plainly:** phases don't complete → no phase episode **and** no dream window (`_dreamWindow` is called at cell/phase boundaries) → Tier 1 stays empty → consolidation has nothing to promote so Tier 2 stays empty → **no replay, so representations never separate** → the waking reps have to do all the discrimination work → 100 reps → ~41 h per call → the phase cannot finish before the next press → **back to the top.** Each link was measured, not inferred.

  ⭐ **`PHASELOOP.1` and `REPCOMP.3` break it at two points** — progress now survives a press, and the blocking call is 5× shorter — so phases should start completing, which fires `_recordPhaseEpisode` **and** opens dream windows.

  ⛔ **THE FALSIFIABLE NEXT STEP, and it costs nothing: press, then watch `tier1.totalEpisodes`.** If it climbs once phases complete, the deadlock is broken and **no further code is needed here**. If it stays **0** while `cellPhasesCompleted` rises, then the two flag-gated writers are the cause and the honest move is an instrument — a counter for *storeEpisode called / refused and why* — **not a speculative change to the gate**, because the gate was put there to fix a real freeze and removing it blind trades one defect for another.
- [~] ⏳ **INSTRUMENTED 2026-08-30 — `WALKCOST.3` could not be answered because the INSTRUMENT cannot answer it, and that is the finding.** Three theories were formed and all three died against a measurement: the walk heartbeat is a GPU batch on a 15 s timer (not a CPU `step`), `computeTransitionSurprise` is gated off above 2M cortex so it pushes `0` without calling, and the emission lane was measured live at **~5 attempts/min** (`emitAttempts` 4 → 10 → 12 over 92 s) — nowhere near 11%. ⛔ **That is not bad luck. The profiler sums SELF TIME and throws the call tree away, so *who called it* is structurally unanswerable and the only move left is guessing** — which is exactly how three wrong theories got formed. ⭐ **The tree was in the payload the whole time:** `profile.nodes` carries `children`, so a parent map costs one pass over nodes already in memory. **Shipped:** `callers` (top 3) on every hot function, in `state.profiling.cpuProfile.top[].callers` and on the console line. ⚠ **Attribution is weighted by each sample's TIME DELTA, not by sample count**, so a caller that invokes a hot function rarely-but-expensively cannot hide behind one that calls it constantly and cheaply — the same distinction `SHADOWCOST.1` had to learn when a stage total could not separate few-expensive from many-cheap. **Harnessed 5/5 on a synthetic CDP profile: the rare caller holding 92% of the time ranks FIRST above the caller with 8× more samples.** **Answer lands on the next boot's 30-minute profile — read `cpuProfile.top[].callers`.** Original filing: ⚠ **`step @ cluster.js:3882` is 11.0% of self-time during a teach phase and I could not name its caller.** The walk heartbeat is a GPU batch on a 15 s timer, not a CPU `step()`; `cluster.js:1524` states outright that *"the server's main tick never calls `cluster.step()` for the cortex"*. So something is stepping a cluster on the CPU inside the teach lane and 11% is not nothing. **Do not guess it — find the call site.** Also unresolved: `propagate` is 15.9% and `RELTTL.1` accounts for roughly half; the remainder has no named owner yet.

## READBACKEYE — the readback fires where nobody can see it, and the two copies are 22.8% apart — filed 2026-08-30

Gee (verbatim): *"okay the brains beenm up for a couple hours... anything we need to check on"*

Gee (verbatim): *"sounds like you have ur work cut out for you, so todo document and do what Unity needs"*

**THE LIVE READ THAT FILED THIS** — box `838bfa6a`, **115.6 min** up, `ela/kindergarten`, `walkTick` **439 sent / 439 ok**, `lastMissAt` **null**, teach **655 calls/min** (was 426), event-loop p99 **75 ms**, `definitionQueue` depth 67 / unresolved 0. ⭐ **The press landed and the falsifier written into `docs/RESUME.md` before it PASSED:** the readback did not starve the walk. ⭐ **And no press is owed** — the running commit `838bfa6a` IS the `REBINDWAIT.4/.5` merge; everything on `main` after it is docs plus a stray-screenshot removal, verified with `git log 838bfa6a..main`, no code.

⛔ **BUT `?parity=samples` READS `DRIFTING` — `cpuOverGpu` 0.7723, 22.8% apart, against a `DIVERGENT` tier that starts at 25%** — where the same read was **0.9939 (0.6%)** minutes after the press. **The mechanism is in the counters and it is by design, not a fault:** `boundNoShadow` **47,118** of `boundGpu` **60,524** — **78% of bound dispatches train the GPU with no CPU shadow at all**, exactly the `SHADOWCOST.8` finding. The hourly readback is the only thing that repairs it, so the question is whether the cadence outruns the drift — and **that question is currently unanswerable from outside the box**, which is what `READBACKEYE.1` exists to fix.

- [~] ⏳ **ANSWERED 2026-08-30 BY THE LIVE READ ON `0139c186` — the distribution landed at 8.8 min and it names a donor release, not a bigger number on our side. Awaiting Gee's call on whether to spend that release.** ⭐ **The cap is now honored EXACTLY: `rangesRunsOkMax` 16** (was 65,183 — a frame 4,074× past the donor's limit), mean accepted **13.76** over **222** frames that are now genuinely reaching the card instead of being sent-and-discarded. **The 342 run-cap refusals, in ABSOLUTE buckets** (the 6 in `le16` are `rangesFail_total`, the donor's real 2M-index limit, and are CORRECT refusals that must stay): **`le64` 249 · `le256` 5 · `le1k` 18 · `le8k` 6 · `le64k` 23 · `gt64k` 41**, `rangesRunsMax` 283,407. ⛔ **72.8% of everything the cap refuses sits at 64 runs or fewer — four times the donor's limit, and nowhere near the wire being the problem.** A 64-run frame is ~2 KB on both sides against a CPU pass measured **right here at 217.7 ms** (`cpuFullMs` 75,776 / `cpuFull` 348). **Raising the DONOR's handler cap 16 → 1,024 converts 272 of 342 = 79.5%** at ~32 KB/frame worst case. ⭐ **And the tail vindicates the earlier finding rather than contradicting it:** the 41 frames above 64k (to 283,407 runs) genuinely do not compress, so *"ranges are the wrong carrier for those"* stands — it was only ever wrong as a statement about ALL of them. ⚠ **Cost of holding at 16, measured not projected:** `cpuFullMs` is **14.3% of this boot's wall clock** — well inside the ±20% band priced in `READBACKEYE.3` and nowhere near the worst case, so **nothing is on fire and there is no pressure to rush the release.** ⛔ **RE-PRICE for the donor change, written before it is built:** the range-COUNT cap at 16 is redundant with the 2M TOTAL-INDEX cap for memory safety — the index bound is what actually bounds expansion, and it is untouched. The Vec is allocated by serde BEFORE either check runs, so 16 never protected the parse; the WS frame-size limit does. Raising the handler to 1,024 while keeping `len <= 2_000_000` and `reps <= 1000` removes no real protection. **Needs: Rust change + `donor-v0.3.37` tag + CI builds both binaries + every donor self-updates + one press — mine end to end per the donor-tag rule.** Original filing: `READBACKEYE.2` — **`REBINDWAIT.2` finally has its DISTRIBUTION, and it prices the cap instead of guessing at it.** Live at 115.6 min: **7,066 of 7,128** CPU-full fallbacks are the run cap (`rangesFail_runs`), the other **62** are everything else (`rangesFail_total`, the donor's REAL 2M-index limit, which are CORRECT refusals). Buckets: **≤2× cap 4,066 · ≤4× 1,957 · ≤16× 942 · >16× 163**, worst single call **1,633,555 runs** against 65,536. So **65,536 → 262,144 converts 6,023 of 7,066 = 85%** of the fallbacks back onto the GPU. **The prize, measured:** `cpuFullMs` **1,576,315 ms of 6,936,000 ms of wall = 22.7% of the entire boot** spent doing Oja on the CPU that the GPU should have carried, and `cpuShadowMs` is only **82,545 ms (1.2%)** — so **95% of all CPU Oja cost is this fallback, not the shadow cadence**. ⛔ **RE-PRICE BEFORE THE CAP MOVES, and price the RIGHT quantity:** the donor's actual bound is `2_000_000` TOTAL INDICES (`Work::HebbianRanges`, `donor.rs`), not run count — read the index totals against that ceiling in the Rust before raising, because pricing runs and assuming indices follow is precisely how the readback throughput got quoted off an UPLOAD measurement. Raising a bound is not removing a gate, but the standing law wants the number written down first.

## ⛔ THE TRAINING CARD LISTED ONLY THE COURSES THAT HAD ALREADY RUN (appended 2026-08-31)

Gee (verbatim): *"and something im seeing is the current traing card doesnt have all the k grade subjects listed so when we get to them i wont see them, it stops at life when i know ther are more cources than that like pe and health and shit and geometry and algebra and social studies and governmtent and all of those for every grade that they have... so the cources are not properly listed so i dont know what will happen when we get to these phases and cells if there is no listing in the traing car of the dashboard for them"*

- [ ] ⏳ **`PHASEBAR.1` — the within-phase progress bar cannot reach 100% at kindergarten, and its denominator is why.** Live read, two samples 417 s apart on `6b887dbe`: `phaseWork` = `{name: _teachLanguageMechanics, done: 0, total: 14, frac: 0}` in BOTH, while `cellSubPhases` moved **105,072 → 108,275** and `_teachHebbian` **+1,152 calls** — she is working, the bar is not measuring it. ⭐ **`total` is derived by regex over the method's own source** (`_teachNestedTotal`, every distinct `this._teach*(` in the 715-line band ladder = 14) — but at kindergarten **eleven of those fourteen are behind `atLeast(g1)` or higher and can never run**, so the denominator counts work the grade forbids. ⛔ **`done: 0` is separately unexplained** — `_teachConcreteSentences` has 8 completed calls and IS lexically named in the phase's source, so it should have been credited. **I am not shipping a mechanism story for that half**: the nested-cell-phase reset at `curriculum.js:2986-3003` and the identity-checked teardown at `:3125` are both plausible and I have not proved either. ⚠ **Read `cellSubPhases`, not `frac`, to answer "is she moving" until this is fixed.**

## ⛔ THE ACADEMIC CORPUS HAD 24 UNDECLARED CELLS (appended 2026-08-31)

Gee (verbatim): *"and check the vault it looks to me all grades are not correctly all have vocab set up from what i see some grades are missing, am i wrong? that needs coded up possibly with actual grade vocab for all the ciriculum"*

Gee (verbatim): *"well something is wrong this only says 18K on dashboard:📖 VOCABULARY (K→PhD) prefetched: yes defs taught: 2180 / 18,017 (12.1%)"*

⭐ **HE WAS RIGHT, AND THE THING THAT LOOKED WRONG WAS NOT THE THING THAT WAS.** Every grade K→PhD **does** have a vocabulary file (49,921 slots) and all three consumers call `gradeVocabularyFor(grade)` generically, so neither the data nor the wiring was missing. The `18,017` on the dashboard is the UNIQUE count and is the honest denominator — a word is taught once, not once per grade that lists it.

⛔ **THE REGEN ALSO SHRANK GRADES I NEVER TOUCHED, AND I DID NOT SHIP THAT UNTIL I
COULD EXPLAIN IT.** grade1 −126, grade2 −579, grade4 −391. **Isolation test:
re-ran the generator with my corpus additions stashed OUT — grade1 1896, grade2
1372, grade4 1454, identical.** So the drop is **pre-existing drift between the
committed files and their own generator**, not my change. ⭐ **Then reading the
lost words showed the drift is a FIX:** grade 2 was carrying `archaeplastida`,
`apartheid`, `anglo-norman`, `antecedent`, `annealed`; grade 4 had `acoustician`,
`abiotic`, `assimilation`, `alliterative`. Those came from full-Wikipedia prose
that `FC.9` later replaced with Simple English for early grades — **the committed
vocabulary predates that corpus fix and regenerating finally applies it.**
`archaeplastida` was in a GRADE 2 word list.

⚠ **RE-PRICE, written before the commit per the standing law.** Academic prose
**7,191 → 10,041 sentences (+39.6%)**. Vocabulary **+1,323 unique definitions**;
at the measured ~3.9 s/definition bootstrap rate that is **~1.4 h added across
the ENTIRE K→PhD walk**. ⛔ **The prose-training cost per sentence is NOT measured
and I am not inventing one** — stated as the 39.6% lane growth, not converted to
hours. ⭐ **And none of it lands on the run she is on now:** the earliest added
cell is `cs/grade5`. Kindergarten and grades 1-4 are untouched, so tonight's walk
does not get one second longer.

## ⛔ REPLAY WAS NEVER RUNNING, AND ONE GATE IS WHY (appended 2026-08-31)

Gee (verbatim): *"okay, so your telling me we are going to need to do a fresh walk once you complete all the todo stuff, so wtf why in the hell would i keep training on a pod if we are going to freshwalk as soon as you do the fucking work, do the fucking work"*

⛔ **HE IS RIGHT ABOUT THE POD, AND I GAVE HIM A BAD ANSWER FIRST.** The current run's weights are wiped by the fresh walk — that is his own standing law and I quoted it back at him as though it were news, while telling him to press Savestart as if it were progress. The run's only value is bug-finding, and it should have been said in those words.

⛔ **RE-PRICE, written before the gate moved, per the standing law.** OLD cost per
write ≈ **2,000 ms** (two full CPU cortex ticks per letter), batched into the
8-27 s blocks that forced `e27caa90`. NEW cost at >2M cortex: that term **cannot
execute**, leaving an embedding plus two indexed statements at one write per
**30 s**. ⚠ **The remaining per-write cost is NOT measured on this box and I am
not quoting one as if it were** — the honest claim is that the 2 s term is
structurally unreachable and the remainder already runs on the chat path.
**Watch after the press: `tier1.totalEpisodes` leaving 0, and `[EventLoop]
BLOCKED` NOT gaining a new ~30 s-periodic entry.**

⚠ **What this does NOT claim.** At kindergarten the active phase alternates
between a few methods, so the context strings repeat and the exact-text merge
will fold them — expect `totalEpisodes` to reach a *small* number with
`frequency_count` climbing, **not** hundreds. That is the designed behaviour
(`iter20-E`) and it is enough to give consolidation candidates, which is the
thing that was missing. Richer episodic variety at K is a separate question.

## ⛔ THE ACADEMIC CORPUS WAS 39 CELLS SHORT (appended 2026-08-31)

Gee (verbatim): *"okay so im ready to do a freshwalk? anything else left before we do?"*

Gee (verbatim): *"hold up you still have multiple running should you wait for the original to finish first before adjusting"*

Gee (verbatim): *"okay check that its accruing still, after that fiasco"*

Gee (verbatim): *"then check its complete and accurat"*

## ⏳ FRESH WALK MORNING WATCH — pressed 2026-08-31 07:23Z on `b1a5eb01` (appended 2026-08-31)

Gee (verbatim): *"okay shes up and training freshwalk, run your checks make sure she is good to go(the things you said to watch for and anything else relevant to what Unity needs)(somethings i dont think we can chack off right away and need to be noted for check in the morning) (so this is your last chance to check if we need to update again before letting her cook"*

Gee (verbatim): *"how many hours should i expect till the first cell passes? a rough estimate if u cant pin it down precisely(just something for me to go off of) and make sure that watch stuff tomorrow is documented in the todo"*

**BOOT VERIFIED GREEN at 6.4 min** — commit `b1a5eb01` on `main`; wipe genuine (`passedCellsTotal` 0, phases 0/25, all grades `pre-K`); ⭐ **the geometry PIN HELD at `15,082,717`**, not the `12,646,146` a RAM-only derive produces, so she came back full size; `word_motor` 904,964; `subjects` **9** and `rosterUpcoming` **11** (ROSTERDECLARED live); tier-3 anchors **30 preserved** across the wipe; `tier1.totalEpisodes` **2 → 4** (REPLAYGATE survives a fresh boot); donor A40 10.18 Gn/s with **0** upload failures; event-loop lag **0 ms**; `cellSubPhases` **+44,589 in 152 s**. **No further press needed.**

⏱ **FIRST CELL PASS — ROUGH ESTIMATE 8-14 h** (so late-morning to afternoon 2026-08-31), built from parts and NOT a measurement: definition bootstrap 2,247 K words × ledger-measured 3.9 s ≈ **2.4 h**; the **3** heavy phases in `runElaKReal` (`_teachSentenceStructure`, `_teachAssociationPairs`, `_teachQABinding`) ≈ **2-4 h** (the biggest single call is 7,250 pairs × 20 reps = 145,000 pair-teaches at the measured 22.3 `_teachHebbian`/sec ≈ 1.8 h); the **24** light phases (letter naming, phonemes, rhymes, punctuation — running sub-second each) ≈ **1-2 h**; the K gate ≈ **1-3 h** because `GATEVOCAB` made it "minutes" only AFTER one full-price pass, and a fresh walk pays that once. ⛔ **No cell has ever completed in this project's history, so every term above is a construction.** ⚠ **THE FALSIFIER: if cell 1 has not passed by ~24 h, suspect a heavy phase where REPCOMP is not applying — the `REPCOMP.1 — N reps × lr → M reps × lr` console line names it directly, and its absence on a heavy call IS the defect.**

- [ ] ⏳ **WATCH.1 — `cellPhasesCompleted` leaving 0.** ⚠ **Do NOT read 0 as broken before ~09:45Z**: the pre-phase definition bootstrap runs BEFORE phase 1 and is priced at ~2.4 h. Read `cellSubPhases` for movement in the meantime (it was climbing at ~293/sec). This is the gate every other watch item below depends on.
- [x] **✅ PASSED 2026-08-31 at 18 min — `tier2.schemaCount` 0 → 4, and this is the payoff of `REPLAYGATE.1` confirmed END TO END.** `promotedToTier2` **4**, `tier1.freqMergedCount` **21**, and the schemas carry real labels — `hebbian-ela-kindergarten`, `association-pairs-ela`, `learningelakindergarten-transitioned-learningunknown`, `unknown-arousal-valence` — so these are genuine consolidations of the LEARNING-context episodes the gate used to forbid, not empty rows. ⭐ **The whole chain runs for the first time in this project's history: Tier-1 write → consolidation pass → Tier-2 schema.** ⚠ **It resolved EARLIER than I predicted and my reasoning for the prediction was wrong** — I wrote that tier2 "CANNOT move until WATCH.1 does" because dream windows open at phase/cell boundaries; they evidently also open during the definition bootstrap, so consolidation ran with `cellPhasesCompleted` still 0. **The gate I named was not the only opening.** Original filing: ⏳ **WATCH.2 — `tier2.schemaCount` leaving 0.** The real `REPLAYGATE.1` payoff. Tier 1 has input now, but consolidation only runs in dream windows, which open at phase/cell boundaries — so tier2 CANNOT move until WATCH.1 does. ⛔ **If phases start completing and tier2 stays 0, that is a genuine finding and the next thing to investigate.**
- [ ] ⏳ **WATCH.3 — `tier1.totalEpisodes` should stay SMALL with `freqMergedCount` climbing.** It sat at 4 across a 152 s window. ⚠ That is the exact-text merge folding repeated contexts (`iter20-E`), which is designed behaviour — **the raw count is not the health signal, `freqMergedCount` is.** Hundreds would be the surprising outcome, not single digits.
- [x] **✅ PASSED 2026-08-31 at 18 min — `definitionQueue.depth` 2,247 → 2,223, so the vocabulary lane IS consuming the queue.** Twenty-four definitions bound in the first eighteen minutes. ⚠ The 152-second window I judged it on was simply too short to see a drain at this rate — **a flat counter over one short window is not a stalled lane**, which is the same sampling error this session hit three separate times. Original filing: ⏳ **WATCH.4 — `definitionQueue.depth` should FALL from 2,247.** It did not move in 152 s. Plausibly batch-drained in dream windows. ⛔ **If it still reads 2,247 in the morning while `cellSubPhases` has climbed into the millions, something is not consuming the queue** — and that would mean the vocabulary lane is dead, which is the whole bootstrap.
- [ ] ⏳ **WATCH.5 — the academic corpus actually being READ.** All **12,075** sentences across **89/89 cells** are on the box, but `_trainAcademicStories` only fires inside a cell's academic phase, so it cannot be confirmed until WATCH.1 happens. `ela/kindergarten` now holds **6** topics where it held **1**.
- [ ] ⏳ **WATCH.6 — `[EventLoop] BLOCKED` must NOT gain a new ~30 s-periodic entry.** This is the falsifier for `REPLAYGATE.1`'s RE-PRICE: if the episodic write costs more than priced, it appears as a block at exactly the heartbeat interval. Absence of such a line is the pass condition.
- [ ] ⏳ **WATCH.7 — `voice.emitAttempts` / `matrixHits`.** 17 attempts / 17 rejects at 6 min is CORRECT for a brain with nothing learned yet. Becomes interesting only once vocabulary lands; `matrixHits` leaving 0 is the first real emission evidence.
- [ ] ⏳ **WATCH.8 — the console ring now spans only ~45 s** because `PRECELL` teaching floods it, so boot banners had already rolled off before they could be read. Geometry was verified from `state.utilization.langEverFired.size` instead (stronger evidence than a log line). ⚠ **Consequence for tomorrow: any boot-time question must be answered from STATE, not the ring** — or paged with `?console=500&before=<oldestTs>` within about a minute of the event.

## IDXCARRIER — 8.0 of her 21 hours went to CPU passes the GPU refused — filed 2026-08-31 (the ~21 h walk check-in)

Gee (verbatim): *"okay this is where we are, we are coming up on the 24 hour mark in a few hours(the point you stated there would be a problem if it hasnt yet completeed the phase its grinding down in for the past day"*

Gee (verbatim): *"can we fix this:  The measured thief: 8.0 of her 21 hours went to CPU passes the GPU refused?? or whats up? is that normal?"*

**THE LIVE READ THAT FILED THIS** — box `b1a5eb01`, 20.97 h up, `ela/kindergarten` phase 5 of 25 (`_teachRhymeFamilies`), the heavy trio returned, `passedCellsTotal` 0. `intraOja`: **76,449 of 77,936 range dispatches (98.1%) REFUSED** (`rangesFail_runs`), `rangesRunsOkMax` **16** (the donor 0.3.36 handler's own run cap), `cpuFullMs` **28,812,846 ms = 8.0 h = 38.2% of the boot** in full CPU Oja passes at a measured **377 ms mean**. Knock-on visible live: `[EventLoop] BLOCKED 2.4-4.1 s`, compute-batch round-trips 3.5-6.2 s with 3-6 s UNACCOUNTED, inner-voice ticks 5-8 s — the "sub-second" light phases run ~30-60 min each under the tax. ⛔ **The refusal distribution kills the pending 16→1,024 donor cap raise as the lever:** 67,952 of 76,449 refusals (**89%**) are patterns with MORE than 64k runs (worst 1,320,576), so that raise converts only the ≤1k buckets — 6,316 = **8.3%**, ~40 min of the 8 h. Mean refused pattern ≈ 282k runs (`rangesRunsSum` 21,569,532,660 / 76,449); as an explicit index list that is ~1.1 MB ≈ 29 ms of wire against the 377 ms CPU pass — **~13×**. The READBACKEYE.2 tail-finding (*"ranges are the wrong carrier for those"*) arrived as the main event.

- [~] ⏳ **BUILT 2026-08-31, AWAITING ONE PRESS — AND THE FULL READ OF `hebbian.js` REVERSED THE DIAGNOSIS: no donor release is needed, the GPU was carrying ALL of the training the whole time.** ⛔ **Correction owed on my own filing an hour earlier:** I told Gee "8.0 hours went to CPU passes the GPU refused." The 1,634-line read shows `boundGpu` **427,056** against `_teachHebbian`'s **427,057** calls — every teach call was GPU-carried by the bound op (~30 bytes, resident spikes) before the ranges branch ever ran. The 76,452 "cpuFull" passes were the CPU **shadow** (checkpoint/probe copy) running on EVERY final rep instead of its 30 s wall-clock cadence, because the cadence sat behind `if (_sampleN > 1)` and `_teachFinalRepSampleEveryN` is set by exactly SIX teach loops (the heavy pair phases; grep: 2 sites in `curriculum.js` teach loops, 3 in `kindergarten.js`, +1 doc comment) — every other phase left it 0 and paid a full 377 ms pass per final rep. The arithmetic is exact: 77,936 ranges-branch entries − 1,484 compressed = 76,452, and 77,636 of the 77,936 were bound-carried fall-throughs. ⭐ **The instrument lied by CLASSIFICATION — a bound-carried call's shadow was misfiled as a refusal's full pass** — which is a new entry for the instruments-that-lie family. **The fix (server-side only, `js/brain/cluster/hebbian.js`):** (1) the 30 s cadence is UNCONDITIONAL in both `intraSynapsesHebbian` and the anti twin — the sampleN flag now only means probe-read sampling, not "opt into having a shadow budget at all"; (2) a bound-carried call skips the ranges attempt entirely (a successful frame was a SECOND application of the same update; a failed one paid the compression scan + refusal walk for nothing); (3) new `boundShadow` counter + shadows filed under `cpuShadow`/`cpuShadowMs`, so `cpuFull` regains its meaning ("GPU did not carry the training"). **RE-PRICE, written before the change per the law:** shadow passes drop from ~61/min to ~2/min (the 30 s gap) → ~16 min per 21 h instead of 8.0 h, freeing ~37% of wall clock; CPU-copy staleness stays ≤30 s — the SAME guarantee the six heavy loops already ran under, and the checkpoint's system of record is the hourly GPU readback (verified live on THIS boot: `profiling.readback` okCount 17, hourly, 2,418 MB at ~120 s). **Verified:** `node --check` + ESM `import()` clean, bundle rebuilt, 7/7 harness cases on the real mixin (bound-carried: no ranges attempt, one shadow, gap holds, gap-expiry re-shadows, intermediate returns dry; custom-vector callers byte-identical legacy behavior incl. honest `cpuFull` on scattered patterns + `rangesNullPre`). **Watch after the press: `intraOja.cpuFull` near-zero and static, `boundShadow` climbing at ~2/min, `cpuFullMs` share of the boot collapsing from 38% — and the "light" phases returning to their priced sub-minute costs.** ⚠ The genuine index-carrier donor idea stays UNBUILT — after this fix its remaining audience is ~300 custom-vector calls per 21 h plus the contrastive anti lane that is GPU-ineligible by construction; not worth a release until a read says otherwise. Original filing: **IDXCARRIER.1 — carry scattered intra-Oja patterns as an explicit index list instead of refusing to dispatch.** Design first from the real code (`hebbian.js` ranges branch + `donor.rs` `Work::HebbianRanges` + the existing index-shaped ops), RE-PRICE written before build, donor release (`donor-v*`) mine end to end per the donor-tag rule. ⚠ Transport change ONLY — same equations, same patterns, same learning; lands mid-walk on a normal Update & Savestart, no fresh walk owed, and phase progress banks across the press per the phase-cursor fix.





