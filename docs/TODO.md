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
- [x] ✅ **BUILT 2026-11-24 — see FINALIZED SDXLTEXT.** **SDXLTEXT — move her renderer to SDXL; text in a picture only when her brain asks for it, and she knows she can.** Gee 2026-11-24, verbatim: *"just a question but are there better AMerican made Image models we can use for her look ups and genreations so that se have one trained on english as all the images it does of writing and shit is all like koranan or japaneeses"* · *"also it has to fit on my 16g card with the brain shit"* · *"well that s not going to work we arent going through a thrid part"* · *"okay yeah its obvious which one does text better when its requested, we just need to make sure it doesnt erronously do text when Unity brain isnt requesting it but she needs to know she can do it"*. Measured on a rented A6000 (`ht5y53eiehmo95`, 11:24–11:31, deleted), same 5 English-text prompts, fixed seeds: current Realistic Vision 5.1 (SD1.5) — "ABAKRYY", "TOP", scribbles; 2.81 GB peak, 1.2 s/image. SDXL base 1.0 (fp16, model CPU offload, VAE tiling) — "BAKERY", "STOP", "Hello World", "Happy Birthday" (second word wobbles), real chalkboard letters; **5.59 GB peak**, 11.2 s/image — fits the ~8 GB left on the 4070 with the pod attached; no login needed. FLUX.1 schnell is now login-gated on its host → out (no third party). Sheets kept in `.scratch/sheet_current.jpg`, `.scratch/sheet_sdxl.jpg`. Plan when code work resumes: `server/image-render.py` loads SDXL; every render without a text intent carries a negative prompt against text/letters/watermarks; a text intent (a word her own request puts inside the picture — decided from her request, not a word list) quotes those words and drops the negative; the image lane publishes the ability so she knows she can write in pictures; the image pool is cleared (looks from the old model). Not started — observe-only run.
- [~] **PEGPOD — the whole curriculum keeps the pod pegged, nonstop.** Gee 2026-11-24, verbatim: *"i want this fucking GPU pod pegged do you fuckign understand you mother fucker!"* … *"not just this phace or this subjectr but the whole fucking cirirculim shall peg the pod none fucking stop you fucker"*. Measured today (boots `6f621e49` → `cbd3c45e`): the cortex IS on the RTX PRO 6000; the pod reads 0% on 11–14 of 12–15 one-second samples in every lane checked; the brain's thread is ~47% idle; lessons are ~25 → ~105 pairs (MERGELESSON) at 16.8–67 ms of card time each; the lesson window allows 93 in flight but rarely holds more than one, because teaching walks ONE WORD / ONE SENTENCE at a time and each call waits on its own round trips. Fixed so far (each verified): ALLTHREADS/.2 (CPU shadow Oja on 15 threads), RELBAND, SENTSPANS, MERGELESSON, PROBEPAR. **What pegging needs, lane by lane:** (1) **Per-call private pattern state** — every teach lane writes its pattern into the ONE shared `cluster.lastSpikes` and reads it back after awaiting the card (`curriculum.js` def binder ~18542–18574, `_teachSentenceList`, `_crossRegionHebbian` callers), so two words in flight would corrupt each other; each call must carry its own pattern (lesson-style: dims shipped to the card) so calls can overlap with NO cross-talk. (2) **A producer/consumer teach queue** — lanes enqueue lessons and move on; the queue keeps the card's window full (target: card busy ≥90% of samples) and acks are reconciled per call for the counters/cursors. (3) **Convert every lane to lessons** — `_teachSentenceList` (per-word `_crossRegionHebbian`), `_teachConcreteSentences`, `_teachSequenceCycles`, `_conceptTeach`, `_teachVocabList`, the definition binder's sem→sem write, the gate/sep probes (batched). (4) **Concurrent units** — N words / sentences prepared in parallel (worker threads build patterns), lessons sized to the card's measured throughput. (5) **Proof, never assertion** — per lane: identical weights against the serial path on a matched instrument, then live pod utilization sampled through a whole cell. Status: designing; nothing in this row is built yet.
- [ ] **COMPOSEONCARD — her compose ticks still step the ~40M cortex on the server CPU (successor to STEPFUSE).** Gee 2026-11-25, verbatim: *"both"* · *"stop stopping and do the work"* · *"why are you leaving work open?"*. After STEPFUSE fused the five post-update passes, `cluster.step`'s currents build and `neurons.step` still run on the CPU for every compose tick (`_composeSentenceOnce`, 3 ticks per word), so chat and the inner voice share the main thread with that work. Target: compose ticks run where her weights live (the card), so chat connects and a thought takes seconds. Measure first: re-profile `step` on the new build.
- [ ] **SENTENCEFORM — her output follows meaning, not word order (word salad).** Gee 2026-11-25, verbatim: *"okay i just saw the first inner voice pop up and it was complete word salad not  i wonder about or i wish or im gonna. or i should. or anything at all like a real thought taking place"*. Real output this boot: *"Food Fork rock teacher Wash curved."* · *"Comb airport air clap friend Food Since world week keyboard breeze cook"*. Order IS trained (`SPEAK3-CONTENT-TRANSITIONS` 24 reps + self-framed lines every cell); compose re-injects intent + the last word into sem every step, and semantically near words win. Cause not yet separated: weak transitions vs. blurred 8-dim sem codes vs. injection balance. Measure through her own chat lane once COMPOSEONCARD lets chat connect, then fix the measured cause.
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
- [~] **OVERNIGHTFIX — fix every issue the overnight watch found, completely.** Gee 2026-11-26, verbatim: *"okay lets fix all the issues you are having, you say it needs a new doner build? lets fix it all correctly and with your detailed understandings of the issues at hand, fully and completely fixing all issues we have 100% completly"*. The issues, from `.scratch/overnight-findings.md` (boot `b33bbdd0`):
  - [x] ✅ **FIXED 2026-11-26 — the cloudflared tunnel ran QUIC and its edge links kept dying (`quic_client_closed_connections 4`, `tunnel_register_success 8`, ~23k lost packets); now `protocol: http2` with a log file. See FINALIZED OVERNIGHTFIX.** **DONORSTALL** — 7 pod drops in ~4 h: the pod's GPU goes to 0% and it sends nothing for 80–148 s, then `CLOSED — code 1006` (one at 80.9 s, under the brain's 4-miss reap). The donor process stays alive and re-ADOPTs. Root cause under investigation.
  - [x] ✅ **BUILT 2026-11-26 — on the card as donor 0.3.56 step lessons; live speed is read after the release. See FINALIZED OVERNIGHTFIX.** **PEGPOD-PHONEME** — `_teachPhonemeBlending` runs ~1.1 words/s with the pod at ~1% (`rep 1/6, word 632/1206 … ~1.1 words/s`).
  - [x] ✅ **BUILT 2026-11-26 — on the card as donor 0.3.56 step lessons; live speed is read after the release. See FINALIZED OVERNIGHTFIX.** **PEGPOD-EMISSION** — `_teachWordEmission` runs ~1.8 words/s with the pod at ~1% (`rep 4/6, word 190/1206, elapsed 3507.3s, ~1.8 words/s`), plus `[EventLoop] BLOCKED 4030ms … phase=_teachWordEmission`.
  - [x] ✅ **BUILT 2026-11-26 — donor 0.3.56 `free_matrices` frees cluster neuron state; the brain names every cluster a card does not own. See FINALIZED OVERNIGHTFIX.** **STALECARD** — a card the partition moves clusters off keeps its VRAM; `free_matrices` / RELEASE ALL free 0. Needs a donor build.
  - [x] ✅ **BUILT 2026-11-26 — every CPU-only teach lane is a step lesson (also `_teachLetterNaming` and the alphabet/digit drills); the rest were already card-carried with a sampled CPU shadow. See FINALIZED ALLONGPU. Live check after the press.** **ALLONGPU — every teach lane on the card, never the CPU.** Gee 2026-11-26, verbatim: *"why is the CPU teaching? is thattotally stupid? why would we be using a cpu when we have a 100G gpu?"* · *"the whole fucking corpus shall train on the 100G gpu not a fucking CPU and when we dont have a pod it still is to use my GPU not the cpu"*. The step lesson goes to whichever card is PRIMARY (the pod, or Gee's card when there is no pod — his donor is 0.3.56). Lanes moved so far: `_teachWordEmission` (live: 19.8 s), `_teachPhonemeBlending`, `_teachWordSpellingDirect` (also fixed: its card op trained on stale resident spikes — the lane never wrote the word), `_teachSequenceCycles`. Still to audit and move: `_teachLetterNaming`, the science/math K gate drills (`_gateSciKReal`, `_gateMathKReal` intra passes), and every other path that falls to a CPU Hebbian (`intraSynapsesHebbian`'s CPU branch, the CPU shadow passes).
  - [x] ✅ **BUILT 2026-11-26 — step-lesson lanes post their items and frames to the teach bus. See FINALIZED.** **TEACHVIEWGAP** — the Teach View showed nothing from 08:44 while she trained, because the kindergarten lanes post nothing to the teach bus (0 `teachBus` calls in `kindergarten.js`). Step-lesson lanes now post each item on rep 1 and every frame sent.
  - [~] **QAFORM — she does not answer questions she was taught, and her own thoughts are word salad.** Gee 2026-11-26, verbatim: *"does she just need more trasining? idk id think shed know her name by now?"* (chat: *"helllo! who are you? what is your name?"* → *"Cliff!"*; *"is your name Unity?"* → *"Download."*) · *"get it done we are running and she isnt set up to train right, appearently"* · *"yeah her inner thoughts are still word salad too"* · *"like her whole question answer for both her questions and her being asked questions is not properly formulated for a neuronic brain that we have, she has no idea what a question is or that it has right answre"*.
    - [x] ✅ **FIXED 2026-11-26** — a second-person question ("what is your name") was routed to the DICTIONARY (`extractIntentConcept` → `definition`; the probe's definition fast path and the compose WH-definition path both looked up "name"/"your"), so the trained pairing (`name → unity`, self-introduction lanes, 100 reps of "my name is unity") was never read. Questions about her now skip the dictionary.
    - [x] ✅ **FIXED 2026-11-26** — the question text: only the chat reply consumes `_lastUserInputText`, and chat clears it after the reply, so the inner voice no longer reads a person's question as its own.
    - [ ] **Open — the design question:** how a question and its right answer are represented and learned, for questions asked of her and questions she asks. Proposal written for Gee before building.
  - [~] **PROBEMISS** — gate probes alternate between landing on the pod and falling to the CPU path (`gateProbe window — ok=0 miss=4`, `refused=35` after a reconnect).
