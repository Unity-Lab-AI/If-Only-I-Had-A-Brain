# TODO — Unity

> ## 📋 BOARD SHAPE — **templated 2026-11-28: every row closed and archived, one first-start read open**
>
> Gee (verbatim): *"dont start her agian until everything is finalized.md and todo is templeted  as all would and shall be completed"* · *"so, is the todo back to templet yet?"* · and, asked with options, ***"Template now, start her, then read the five"*.**
>
> **All 63 rows were closed before this file was cleared** — 0 open, 63 closed, **137,210 bytes, md5 `97cc80bc0702cc0d340e7e4f3b1ce50b`** — and the whole board is archived **byte-for-byte** in `docs/FINALIZED-ARCHIVE-TODO-2026-11-28.md`, verified **EQUAL** (same bytes, same md5) and audited by string match (63 rows found, 63 distinct tags, 0 missing) before one row was removed. The ledger entry is `docs/FINALIZED.md §2026-11-28 — THE BOARD CLOSED AND TEMPLATED`, which also records **why** the bulk archive is a byte-exact sibling file rather than pasted inline.
>
> **Five of those rows closed as *built, live read owed*** — their close conditions need a witness only a running brain produces, so every one of those checks is consolidated into the single row below rather than left scattered.
>
> **The 2026-11-26 template** closed its rows into `docs/FINALIZED.md`. **The 2026-11-24 template** closed 17 rows into `§2026-11-24 — THE BOARD CLOSED`. **The 2026-11-23 reset** archived the board byte-for-byte between `<!-- BEGIN VERBATIM TODO ARCHIVE 2026-11-23 -->` markers.
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
| **NEVER delete task info** | When marking a task done, change the **status marker ONLY**. Every word of the original description stays — prepend the verdict, keep the filing. Anyone reading must see WHAT was done and WHERE, not just a checkmark. ⚠ And a finished row left at `- [ ]` is the same defect: on 2026-11-28 a row sat unmarked with its full verdict already inside it, found by COUNTING open rows, not by remembering. |
| **Append, never replace** | New tasks go at the **bottom**. Completed tasks stay where they are. **Never regenerate this file from scratch.** |
| ⛔ **FINALIZED before DELETE** | A task may not leave this file until its verbatim text is in `docs/FINALIZED.md` **and the write is verified**. That is how every reset has been done: archived, checked, *then* cleared. |

**Status markers:** `- [ ]` pending · `- [~]` in progress · `- [x]` done (with its verdict prepended, original text preserved)

**Task-number placement:** T-numbers, session numbers, milestone IDs and "Gee" belong in workflow docs ONLY — never in source code, public docs, HTMLs or launchers. ⚠ Fourteen source sites breached this on 2026-11-28 and were scrubbed; a grep for his name across `js/` and `server/` must return nothing.

---

## WHERE THE HISTORY LIVES

- **`docs/FINALIZED.md`** — every completed task, verbatim, plus the full ledger of every batch. **Never delete an entry.** Contains the complete verbatim archives of this file as of 2026-08-20, 2026-08-29, 2026-08-31, 2026-09-01, 2026-09-06, 2026-09-24 and **2026-11-23** (search `BEGIN VERBATIM TODO ARCHIVE <date>`), every row closed 2026-11-24, every row closed 2026-11-26, and the **2026-11-28** close whose byte-exact board copy is `docs/FINALIZED-ARCHIVE-TODO-2026-11-28.md`.
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

## ⚠ ONE CONFIGURATION FACT THAT VOIDS MEASUREMENTS — check it before believing any instrument

Her **word-cell code** — one code for a word across every lane — turns on only when `size − SPEECH_LAYOUT.G >= 10000`, and `SPEECH_LAYOUT.G` is **391,524**. So the line is a **401,524**-cell cortex. A 400,000-cell probe sits **1,524 cells** under it, runs with the word-cell code OFF, and silently measures a different brain. That cost a whole verdict on 2026-11-28. **Every instrument must print its cortex size, its margin and `wordCellCode`, and refuse to report when the code is off.**

---

## ACTIVE TASKS

- [ ] **FIRSTSTART.1 — the five reads that need a running brain, consolidated.** Filed 2026-11-28 when five rows closed as *built, live read owed* on Gee's call (*"Template now, start her, then read the five"*). Everything below is BUILT, and measured off-brain wherever a measurement was possible; each line is the one thing that can only be seen while she runs, with the reading that says it worked and the reading that says it did not.

  | Look for | It reached her | It did not |
  |---|---|---|
  | **A section pass with no loop pin** — the one cause behind the 90–107 s freezes was the episode write's salience term running two full CPU cortex propagates per letter, now refused by price | `checkpoint saved after passing …` with **no `MAIN LOOP STALLED`** behind it, and a `computeTransitionSurprise REFUSED … prices at …ms against a 2,000ms budget` line at most once a minute | another 90–107 s pin at a section pass — then the gap holds something else as well, and the stage tag on the live watchdog line names it |
  | **A reply that is a reply** — the old question probe is off her cortex and the episode write is priced | a `[ChatPin]` line whose every stage is under ~1 s, **no `qa-probe` stage at all**, no donor drop | `respond:store-episode` or `respond:curiosity` still in the tens of seconds |
  | **A sentence gate with no stall** — the gate's read check went from 5,253 ms a word to 72 ms | a sentence gate completing with no `MAIN LOOP STALLED` and the site answering throughout | a loop stall inside `_teachSentenceList` |
  | **Her speech, on the page** — the gates' TALK lines, a reworded question, `boundHebbian.suppressedStale` against `laneRecoveries`, and the **pop-ups in a real browser** (her own composed lines, never a written shape) | TALK at or near 10/10 on taught lists · a reworded question answered · pop-up text that is a sentence of hers, at most one per 25 s, and nothing when nothing happened | TALK 0/10 after a naming lesson · the same phrasing twice · any pop-up that reads like a template with a value dropped in |
  | **Every connected card teaching** — her main matrix is sliced across all cards by default | **both** cards reporting teach ops, with lesson speed measured before and after | one card teaching while the other idles. ⚠ Needs a second card attached; when she last ran only his RTX 4070 Ti SUPER was there (8/8 clusters), so this has never had the hardware to prove itself |

  **Closes on:** each of those five read on a running brain, with its number written into this row — then this row goes to the ledger the same way the 63 before it did.

  ⭐ **READ 1 — the boot (2026-11-28, 14:24).** Her weights pair was **incoherent twice, for two DIFFERENT reasons**, and both were caught before she was allowed to learn on them. ① The live pair had metadata from 13:05 against synapses from 12:54 — the 13:05 stop was a process-level kill mid-freeze, so her ledger claimed lessons her synapses never received. The newest **coherent** pair (v2, bin written 23 s after its json) was swapped in and verified before the press. ② Her boot then flagged a **second** cause the first fix does not touch: a leftover `brain-weights.bin.tmp` **newer** than the real file — `349,502,940` bytes against `3,846,253,872`, about **9 % of a complete save**, the partial write the same kill interrupted. It did not affect her restore (all 16 sections queued from the real file) and it is deleted. ⛔ **THE INSTRUMENT DEFECT WORTH KEEPING:** that warning fires on **two distinct causes** — a json newer than its bin, and a `.tmp` newer than its bin — but prints **one** FIX (*"copy the newest COHERENT checkpoint pair … over the live one"*), which only addresses the first. **Following the boot's own advice exactly would have left the warning firing on every future start**, and an alarm that cannot be cleared by its own instructions is how a real one stops being read. The fix text should name both causes, or the check should say which one it hit.
  ⭐⭐ **READ 3 — A REPLY WHILE SHE TEACHES: CLEAN, 81 ms (2026-11-28, 14:3x).** Asked through her own door under exactly the condition that broke this morning — a question put to her mid-walk. `SENT` at 1,638 ms, her answer at **1,719 ms: 81 milliseconds**, against **115,537 ms** for the same question this morning. **No `[ChatPin]` line at all** — that line exists to report a pin, so its absence is the cleanest result available — **0 donor drops** on the boot (this morning the same question reaped her card at 122 s unheard), and no loop stall behind it. Her answer was **honest silence** with her capability stated in the payload (`motor_unstable` · 1,966 words bucketed · 0 cells passed), which is correct for a brain that has passed no cells, not a failure to answer. ⛔ **THE LIMIT, STATED: this does NOT yet prove the priced refusal.** Because she answered with silence, that reply very likely never reached the episode write, and the refusal has printed **0** lines so far — **0 means unexercised, not working.** The refusal's proof is read 1: at a section pass the phase-episode write calls the same function. **So read 3 closes "her reply path is fast and does not pin"; it does not close "the freeze cause is dead".**
  ⭐ **READ 4 (part) — HER INNER VOICE COMPOSES A SENTENCE, on a running brain for the first time.** `🧠 inner-thought (seed=cell-progress) "Mom said help."` — a short, well-formed line, seeded from her own cell progress. **This morning her thoughts were "~12 unrelated words drawn from the same small set"**, which is the exact defect the speech readout was built to end, and this is the first time the fix has been seen outside an instrument. ⚠ One line is not the read, and the next lines proved the point — **her thoughts are MIXED, and I quoted the good one first.** Of 6 inner thoughts on this boot: `"Mom said help."` is a clean line, and `"Sister sister sister equation."` is a three-fold repetition with a word that does not belong. **That is consistent with what was already on record** (*"three of twelve are still fragments"*), so it is the known rough edge rather than a regression — but a single good sentence is not evidence the lane is fixed, and it would have read as one if I had stopped at the first quote. The rest of this row's speech item (the gates' TALK lines, a reworded question, the pop-ups in a browser) is still owed, and **0 gates have run** on this boot.
  ⭐⭐⭐ **READ 1 — THE FREEZE CAUSE IS DEAD, PROVEN BY ARITHMETIC ON HER OWN COUNTERS (2026-11-28, 14:30).** Her published state reads **`tier1.totalEpisodes: 18`** (freqMerged 3, promotedToTier2 8, tier2 schemas 4). **`storeEpisode` is the only writer of a tier-1 episode, so all 18 went through the exact path that cost 73,959 ms this morning.** Total stall time across the whole boot is **145,854 ms**, of which **109,298 ms is the weights restore** — leaving **36,556 ms** across five teach-time pins (6,712 · 8,685 · 7,165 · 7,491 · 6,503). **Eighteen writes on the old path could not fit inside 36.6 seconds; at this morning's measured cost they alone would have been ~22 minutes of pins.** The old path is not running. **0 donor drops**, where one reply did it this morning.
  ⛔⛔ **AND I HAD THE WRONG READ CRITERION — caught before it was reported as a failure.** I was watching for a `computeTransitionSurprise REFUSED` line and reporting "**0 refusals**" tick after tick as though the fix were unproven. **That line is printed INSIDE the function, and the fix means the episode write never calls the function at all** — it increments `_surpriseUnmeasured` silently instead. So zero is the CORRECT and EXPECTED reading from that path, and watching for it was the same mis-paired-measure error that voided two instruments earlier today: **I was waiting on evidence my own change makes unreachable.** The evidence that exists is the episode count against the stall budget, above. ⚠ A consequence worth fixing later: `_surpriseUnmeasured` is not published in her state, so "unmeasured" is still a silence from outside — the counter should ride the state payload.
  ⚠ **Still owed on this read, and not claimed:** the exact scenario the row names — *a section pass with no loop pin* — has not happened yet (**0 section passes**). The mechanism is proven; the named moment is not yet witnessed.
  ⚠ **THE STALL PROFILE SO FAR, and what it does and does not say.** Five stalls: the boot restore at **109,298 ms** (the 3.85 GB apply, named and not counted against the fix), then four teach-time pins of **6,712 · 8,685 · 7,165 · 7,491 ms** during `_teachAssociationPairs` / `_teachSelfFramed`, with banked maxima naming `gate:probe-gpu` at up to **20,664 ms** (against **44,676 ms** this morning). **0 donor drops.** ⛔ **This is NOT the freeze read.** The 90–107 s class fired *after a section pass*, she has had **0 section passes**, and the priced refusal has printed **0** lines — unexercised. Multi-second teach pins are a different, pre-existing cost and must not be dressed up as either a pass or a failure of today's fix.
  ⚠ **Also seen and correctly NOT counted against the freeze fix:** a 5,007 ms stall at `phase="idle"`, `donors=0`, rss 1.4 GB, reported as **"no stage tag was set when this was written"** — that is the weights restore streaming 3.85 GB back in, not the post-section-pass cause. **The new breadcrumb saying "no tag" instead of printing a stale phase is what makes that distinction readable at all**; before today it would have named whatever phase the cell last entered, which is how seven freezes got misattributed this morning.

- [ ] **MINDPOP.2 — three authored sentence shapes per word, in her word lesson, awaiting Gee's ruling.** Found 2026-11-28 while attributing the chokepoint counter's 240 untagged writes (all 240 legitimately sentence embeddings). Her word lesson teaches `i see a <word>` · `the <word> is here` · `this is a <word>` — **written English entering her training.** The LAW bans hardcoded sentence arrays in lessons, and his ruling on the pop-ups was that her lines must come from her equations and not from written shapes. It is overridable (`opts.templates`) and may be deliberate as context for the sem→motor binding, so **it is his call and nothing has been changed.** **Closes on:** his decision — and if they go, the before/after on the lane that uses them.
