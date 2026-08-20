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
- ~~`docs/BOARD.md`~~ and ~~`docs/OPEN-TASKS.md`~~ — **both DELETED 2026-08-20.** They were parallel views of this file, and a second list of the same tasks is a second thing to keep true; both drifted, and a stale list that looks authoritative is worse than no list. Their full contents are archived **verbatim** in `docs/FINALIZED.md` (search `BEGIN VERBATIM BOARD ARCHIVE` / `BEGIN VERBATIM OPEN-TASKS ARCHIVE`). **This file is the only board. Do not re-create a second one.**
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

## OPEN ISSUES — filed 2026-08-20 (found during the session, not yet fixed)

> Gee (verbatim): *"fix the issues you found"* → *"never mind write the issues to the todo, quickly, no horse shit fucking around"*

- [ ] **TZSTAMP.3** `tsLabel` (server, `humanTime`) is **always America/Denver** because the process TZ is pinned; the dashboard's own 11 stamps render **browser-local**. Identical from Denver, divergent from anywhere else. Fix = add `timeZone: 'America/Denver'` to the dashboard formatters so the two can never disagree. `TZSTAMP.1`'s documented choice was "the admin's own system time", so this is a deliberate reversal and needs Gee's word — he has since said "it denver time".
- [ ] **SCRIPTKILL.6** `.claude/hooks/session-start-env-dump.cjs`'s hygiene report scans **`scripts/` only**. The real patcher hoard was in gitignored **`.scratch/`** (152 files, 44 of them `patch-*`/`fix-*`/`todo-*` editors). Fix = scan `.scratch/` too. Recorded as a known blind spot in `deploy/HOOK-FIXES.md`; the file itself is unversioned (`.claude/` is LAW-excluded, `ual-workflow` is off-limits), so the fix must be applied live AND written into that record.
- [ ] **SUBSTEPS.6** Residual flap in the **72–79** substep band under sustained teach-rate variation. Bounded, safe, self-correcting, and far better than the pre-fix collapse to the floor — but not settled. Candidate: lengthen `_adaptCooldown` past 2 windows, or require two consecutive starvation windows before shrinking.
- [ ] **RUNPOD.17** The **Linux** `v0.3.25` binary from CI has **never been executed**. I verified the de-dup on the Windows build only (`Detected 2 → Detected 1`). Reasoning says it is a no-op on a CUDA-only Linux host (`enumerate_adapters(PRIMARY)` returns zero, so the early return hands back the same empty list) — **but reasoning is not running, and RUNPOD.16 itself was found BY running the binary, not reading it.** Read the pod's `===LIST_GPUS===` on its next natural restart.
- [ ] **LOOPNAME.8** The **separate diagnostic process/thread is NOT built.** `LOOPNAME.7`'s breadcrumb makes a freeze forensically legible *after the fact*; it gives no live eyes *during* one. Every diagnostic channel still rides the event loop under investigation.
- [ ] **LANGRAM.10** The new unconditional `LANGRAM.9 GEOMETRY VERDICT` line has **not been observed on a real boot yet** — it ships in `05ab1951`+, and the box booted on `f66986d1`. Read it on the next restart; it names which of (pin / weights / override / live bounds) decided the vocabulary ceiling. **`349,155` in that line means stop.**
- [ ] **WALKPROG.1** `cellsPassed` was still `None` an hour into the walk while `subPhases` climbed normally. Expected for a fresh K walk at 425M, but unverified — if it is still `None` after several hours, the cell-completion path needs looking at, not the teach path.
