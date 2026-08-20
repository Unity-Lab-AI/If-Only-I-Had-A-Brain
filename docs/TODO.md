# TODO — Unity

> **Branch:** `main`
> **Last updated:** 2026-08-20 — **BOARD AT ZERO.** All 171 task lines were closed and then copied **byte-for-byte** into `docs/FINALIZED.md` before this file was reset. The archive is verifiable: search FINALIZED for `BEGIN VERBATIM TODO ARCHIVE 2026-08-20` — 276,397 bytes, md5 `8cd4ddd0313a3282662919af19b2f4ca`, 171/171 task lines.
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
- **Mystery module Ψ** (√(1/n) × N³) — her consciousness level

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

- **`docs/FINALIZED.md`** — every completed task, verbatim, plus the full ledger of every batch. **Never delete an entry.** Contains the complete verbatim archive of this file as of 2026-08-20.
- **`docs/NOW.md`** — the current-state banner, newest first.
- **`docs/BOARD.md`** — tiered triage view.
- **`docs/OPEN-TASKS.md`** — the hand-maintained open-work view. **When it and this file disagree, THIS file wins.** Update it in the same pass as any edit here.
- **`docs/KNOWN_ISSUES.md`** — running ledger of bugs, limitations and intentional deferrals (KI-1 … KI-23).

## STANDING PROGRAMMES (not board lines — they have their own docs)

These are live, multi-batch bodies of work. They are deliberately **not** tracked as single tasks here, because carrying a programme as one line makes the board lie about how much is outstanding:

- **The syllabus build** — `docs/TODO-full-syllabus.md`. K is ~4–10× deeper than every grade above it (measured: kindergarten 212 teach calls / 8,943 lines vs grade1-12 43–58 / 496–714). Driven by the persistent-memory rules `feedback_curriculum_depth_and_mechanics`, `feedback_full_completeness_per_grade`, `feedback_full_real_school_course_roster`.
- **Seeded topology** — `docs/SEEDED-TOPOLOGY-SPEC.md`. Deliberately unbuilt: gated on a PRNG parity harness, because one differing draw puts weights on the WRONG SYNAPSES silently.
- **Mind-space integration** — `docs/MINDSPACE-INTEGRATION.md`.
- **The trajectory asset** — `docs/TRAJECTORY-CAPTURE.md`. Needs one complete K→PhD walk on a single build with no geometry change mid-run.

## AWAITING GEE (decisions, not engineering)

Everything codeable for these is shipped; each needs a call, not a commit:

- **A 128GB coordinator** — the box's host RAM, not the GPU, sets Unity's size (every byte on the donor has a master copy in host RAM, and the box is CPU-only). Measured ladder: 32GB → ~425M neurons · 48GB → ~722M · 64GB → ~987M · **128GB → ~2.05B (~101% of a 45GB card)**. For Red/Sponge. See FINALIZED §TIERTOP / §VRAMFILL.
- **The language-cortex hop** (`WORD_MOTOR_TARGET_LANG_CORTEX` 12,000,000 → 20,000,000+). Both prerequisites now shipped — the 64MiB receive wall (donor v0.3.23) and the 6GB VRAM ceiling (`WMBCEIL`). It is a geometry change: fresh walk + a RE-PRICE.
- **Grant actions** — Emergent Ventures (rolling); NSF Project Pitch (**verify the portal is open first** — sources conflicted on an SBIR reauthorization pause). Supporting artifacts: `docs/TRAJECTORY-CAPTURE.md`, `docs/THEORY-PAPER.md`.

---

## ACTIVE TASKS

*(none — board at zero as of 2026-08-20)*

<!-- New tasks go BELOW this line, appended in order, with Gee's verbatim words. -->
