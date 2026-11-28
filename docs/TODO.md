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

- [ ] **MINDPOP.2 — three authored sentence shapes per word, in her word lesson, awaiting Gee's ruling.** Found 2026-11-28 while attributing the chokepoint counter's 240 untagged writes (all 240 legitimately sentence embeddings). Her word lesson teaches `i see a <word>` · `the <word> is here` · `this is a <word>` — **written English entering her training.** The LAW bans hardcoded sentence arrays in lessons, and his ruling on the pop-ups was that her lines must come from her equations and not from written shapes. It is overridable (`opts.templates`) and may be deliberate as context for the sem→motor binding, so **it is his call and nothing has been changed.** **Closes on:** his decision — and if they go, the before/after on the lane that uses them.
