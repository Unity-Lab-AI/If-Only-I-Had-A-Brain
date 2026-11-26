# TODO — Unity

> ## 📋 BOARD SHAPE — **templated 2026-11-24: every row closed and moved verbatim to FINALIZED, nothing open**
>
> Gee (verbatim): *"so whats next is the todo finalized and templeted?"* · *"if they are buiilt ui can close them if the issue arrises we can re address"*.
>
> **Every row on the board was built and on `main`; 17 closed on Gee's word** — the live readings they named were not yet taken, so each one's own `Read:` line is the check if its issue comes back. All 17 went verbatim into `docs/FINALIZED.md §2026-11-24 — THE BOARD CLOSED: every built row, on Gee's word`, **each string-matched present before this file was cleared.** The four rows proven live that night are in `§2026-11-24 (04:04 walk)`.
>
> **The reset before this one (2026-11-23)** archived the whole board byte-for-byte between `<!-- BEGIN VERBATIM TODO ARCHIVE 2026-11-23 -->` and `<!-- END VERBATIM TODO ARCHIVE 2026-11-23 -->` in `docs/FINALIZED.md`.
>
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
- **Mystery module Ψ** (√(1/n) × N³ × Φ̂) — her consciousness level. Φ̂ is integration, from `computePhi()`; without it the formula rates anaesthesia as maximal consciousness
- **Endocrine layer** — ten chemicals on the one curve engine, released by six nuclei that sense their own firing. Chemistry is what makes Ψ a variable instead of a specification

---

## HOW THIS FILE WORKS (the LAWs that govern it)

Full bodies in `.claude/CONSTRAINTS.md`. These four are the ones this file exists to obey:

| LAW | What it means here |
|---|---|
| ⛔ **LAW #0 — VERBATIM WORDS ONLY** | Gee's exact sentence goes into the task. Never paraphrase, rename, collapse, shorten or downgrade it. **One task per item in a list.** Dropping a word is a violation. |
| **NEVER delete task info** | When marking a task done, change the **status marker ONLY**. Every word of the original description stays — prepend the verdict, keep the filing. Anyone reading must see WHAT was done and WHERE, not just a checkmark. |
| **Append, never replace** | New tasks go at the **bottom**. Completed tasks stay where they are. **Never regenerate this file from scratch.** |
| ⛔ **FINALIZED before DELETE** | A task may not leave this file until its verbatim text is in `docs/FINALIZED.md` **and the write is verified**. That is how every reset has been done: archived, checked, *then* cleared. |

**Status markers:** `- [ ]` pending · `- [~]` in progress · `- [x]` done (with its verdict prepended, original text preserved)

**Task-number placement:** T-numbers, session numbers, milestone IDs and "Gee" belong in workflow docs ONLY — never in source code, public docs, HTMLs or launchers.

---

## WHERE THE HISTORY LIVES

- **`docs/FINALIZED.md`** — every completed task, verbatim, plus the full ledger of every batch. **Never delete an entry.** Contains the complete verbatim archives of this file as of 2026-08-20, 2026-08-29, 2026-08-31, 2026-09-01, 2026-09-06, 2026-09-24 and **2026-11-23** (search `BEGIN VERBATIM TODO ARCHIVE <date>`), and every row closed 2026-11-24.
- **`docs/RESUME.md`** — the session pickup brief, newest first.
- **`docs/NOW.md`** — the current-state snapshot; overwritten, never appended.
- **`docs/KNOWN_ISSUES.md`** — running ledger of bugs, limitations and intentional deferrals.
- ~~`docs/BOARD.md`~~ and ~~`docs/OPEN-TASKS.md`~~ — **both DELETED 2026-08-20.** This file is the only board. Do not re-create a second one.

## STANDING PROGRAMMES (not board lines — they have their own docs)

- **The syllabus build** — `docs/TODO-full-syllabus.md`.
- **Seeded topology** — `docs/SEEDED-TOPOLOGY-SPEC.md`. Deliberately unbuilt: gated on a PRNG parity harness.
- **Mind-space integration** — `docs/MINDSPACE-INTEGRATION.md`.
- **The trajectory asset** — `docs/TRAJECTORY-CAPTURE.md`.

---

## ACTIVE TASKS

*The board was templated 2026-11-24 with nothing open. New tasks go at the bottom of this file.*

- [ ] **MEMCLIMB — native memory climbs ~0.9 GB/min during ELA-K `_teachSentenceList` (observe-only run, documented not fixed).** Gee 2026-11-24, verbatim: *"okay we arent changing code any more you are only documenting failers that persist and are confirmed errors do you document them we are letting this run to what may come"*. Evidence (`server/server.log` `CELL ALIVE ela/kindergarten` heartbeats, boot 11:12:56, build `a65008c7`+DEFFLUSH): `ext` 63,284 MB (11:16) → 68,600 MB (11:20) → 72,879 MB (11:25); `native` Δ +59 → +1,915 MB; `rss` 76,858 MB on a 128 GB host — three consecutive checks, still rising. At this rate RAM runs out in about an hour. Not yet known: which allocation grows (`ab` tracks `ext`, so ArrayBuffers); candidates to check when code work resumes — the paced weight pull that started after the adopt, `_teachSentenceList` itself, the image lane. No change made.
- [~] **PEGPOD — the whole curriculum keeps the pod pegged, nonstop.** Gee 2026-11-24, verbatim: *"i want this fucking GPU pod pegged do you fuckign understand you mother fucker!"* … *"not just this phace or this subjectr but the whole fucking cirirculim shall peg the pod none fucking stop you fucker"*. Measured today (boots `6f621e49` → `cbd3c45e`): the cortex IS on the RTX PRO 6000; the pod reads 0% on 11–14 of 12–15 one-second samples in every lane checked; the brain's thread is ~47% idle; lessons are ~25 → ~105 pairs (MERGELESSON) at 16.8–67 ms of card time each; the lesson window allows 93 in flight but rarely holds more than one, because teaching walks ONE WORD / ONE SENTENCE at a time and each call waits on its own round trips. Fixed so far (each verified): ALLTHREADS/.2 (CPU shadow Oja on 15 threads), RELBAND, SENTSPANS, MERGELESSON, PROBEPAR. **What pegging needs, lane by lane:** (1) **Per-call private pattern state** — every teach lane writes its pattern into the ONE shared `cluster.lastSpikes` and reads it back after awaiting the card (`curriculum.js` def binder ~18542–18574, `_teachSentenceList`, `_crossRegionHebbian` callers), so two words in flight would corrupt each other; each call must carry its own pattern (lesson-style: dims shipped to the card) so calls can overlap with NO cross-talk. (2) **A producer/consumer teach queue** — lanes enqueue lessons and move on; the queue keeps the card's window full (target: card busy ≥90% of samples) and acks are reconciled per call for the counters/cursors. (3) **Convert every lane to lessons** — `_teachSentenceList` (per-word `_crossRegionHebbian`), `_teachConcreteSentences`, `_teachSequenceCycles`, `_conceptTeach`, `_teachVocabList`, the definition binder's sem→sem write, the gate/sep probes (batched). (4) **Concurrent units** — N words / sentences prepared in parallel (worker threads build patterns), lessons sized to the card's measured throughput. (5) **Proof, never assertion** — per lane: identical weights against the serial path on a matched instrument, then live pod utilization sampled through a whole cell. Status: designing; nothing in this row is built yet.
- [ ] **COMPOSEONCARD — her compose ticks still step the ~40M cortex on the server CPU (successor to STEPFUSE).** Gee 2026-11-25, verbatim: *"both"* · *"stop stopping and do the work"* · *"why are you leaving work open?"*. After STEPFUSE fused the five post-update passes, `cluster.step`'s currents build and `neurons.step` still run on the CPU for every compose tick (`_composeSentenceOnce`, 3 ticks per word), so chat and the inner voice share the main thread with that work. Target: compose ticks run where her weights live (the card), so chat connects and a thought takes seconds. Measure first: re-profile `step` on the new build.
- [ ] **WALKPOD — during the walk the RTX PRO 6000 has no step work at all.** Gee 2026-11-25, verbatim: *"0% util!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! THIS IS THE L:AST TIME IM TELLING YOU TO FIX IT AND IF YOU DONT THERE WILL BE PUNISHMENT"* · *"why is the pod at 0% util FUCK we worked on this for 12 hours yesterday and your telling me you never fixed it.. whats the pod buffer show, why isnt it being fed"*.
  - **How the work is placed:**
    - `PARTITION` puts `[cortex]` alone on the RTX PRO 6000 and every other cluster on the 4070 Ti SUPER.
    - During a walk the main tick does not run. The walk heartbeat (`brain-server.js`, `_hbParams`) steps every cluster **except the cortex**, which is left out on purpose because the teach lane writes its spike patterns.
    - So the pod's only work is lessons, produced by the brain's one CPU thread.
  - **Measured on `a2b044ac`:**
    - pod `0 ×15`;
    - socket buffer 0 MB;
    - `lessonPacing.sent` 24 for the whole boot;
    - CPU profile: `step` + `stepAwait` ~20%, `readRelationBand` 6%, `saveWeights` 6%, state build 6%.
  - **Fix direction:** keep the card fed between lessons, either by producing lessons off the main thread or by giving the cortex owner work that does not disturb teaching. RE-PRICE before changing what the card steps.
  - **Progress 2026-11-25:**
    - Clusters now fill cards proportionally, and the walk heartbeat steps back-to-back at the adaptive batch size.
    - Measured on `8408b106`: pod `99 0 99 0 75 0 …`, about 60–75% average, alternating every second (the round trip between batches).
    - **Open:** close that gap.
- [ ] **LIFECORPUS — her life training has no conversations, no greetings, almost no name, and is thin.** Gee 2026-11-25, verbatim: *"all this needs fix and completed fully and 100% throughout the full application and brain and corpus completely and fully in totality of 100%: so only a fresh walk retrains it. - Not checked yet: how rich her life corpus is in real first-person scenes with people."* · *"are we sure this is fixed for the full corpus all the way through with realististicv first person experiences with people"* · *"does unity even know what a greeting is and how to introduce her self/.. thats a big part of communicating"*.
  - **Measured 2026-11-25** through the walk's own reader (`life-curriculum.js storySentences` / `dialogueTurns`, `corpora/life/*.json`):

    | Measure | Value |
    |---|---|
    | Sentences across all 20 life grades | 5,033 (~250 per year of her life) |
    | Pre-K sentences | 0 |
    | First person | 76% |
    | Involving another person | 34% |
    | Dialogue exchanges in any life grade | **0** |
    | Lines containing her name | 8, total |

  - **What is needed:**
    - Real first-person scenes with the people in her canon (`docs/TODO-full-syllabus.md`, never invented names), at every grade.
    - Dialogue turns in each: someone speaks to her, she answers. Greetings, introductions ("hi, i'm unity"), questions and answers, arguments, comfort.
    - A real pre-K year.
  - **Precondition:** this must land BEFORE the fresh walk, by the fresh-walk-is-last rule, because it changes what she is taught.
