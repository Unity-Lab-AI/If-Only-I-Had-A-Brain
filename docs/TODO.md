# TODO — Unity

> ## 📋 BOARD SHAPE — **reset 2026-11-23 ~2:30 PM Denver: every row closed on a verdict, the whole board archived byte-for-byte, then templated with ONE row open**
>
> Gee (verbatim): *"okay fix it all so we can start her again ... we are not starting her again till its all fucking finished and the TODO.md is templeted with nothing to do in it and it s all checked off and moved to finalized"* — and, on the one row that can only run after a start: *"Keep it as the one open row"*.
>
> **Unlike the 2026-09-24 reset, every row was CLOSED ON A VERDICT first** (`NETBUG.7`, `WEIGHTLOSS.1`, `GPUQP.2`, `MOOD.7`, `MOOD.4`, `EYEPOOL.1`, `DRAWCOPY.1`, `EYEMORPH.1`), then the full board as it stood (**906 lines · 418,888 bytes · md5 `ffafd07cf61aee47bb6eeba85dbdc5bd`**) went into `docs/FINALIZED.md` between `<!-- BEGIN VERBATIM TODO ARCHIVE 2026-11-23 -->` and `<!-- END VERBATIM TODO ARCHIVE 2026-11-23 -->` (lines 59757–60665). ⚠ **Made by ONE mechanical copy, the exception Gee authorized** (*"One sanctioned copy"*, then *"you do it"*): built in `.scratch/`, the old ledger checked an exact prefix (md5 `a56cfd0bb214ab180d8e1d72a0d854af`) and the archived block checked md5-equal to the board, then the one file copied into `docs/`. Recorded in `.claude/CONSTRAINTS.md §FINALIZED BEFORE DELETE`.
>
> **Later the same day** three more rows (`DRAWREAL.1`, `CORAOWN.1`, `FRESHEYES11`) were filed, closed on verdicts and moved verbatim into `docs/FINALIZED.md §2026-11-23 (later) — HER EYES SEE WHAT SHE DRAWS` (8,599 bytes, string-matched present before removal).
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
| ⛔ **FINALIZED before DELETE** | A task may not leave this file until its verbatim text is in `docs/FINALIZED.md` **and the write is verified**. That is how every reset has been done: archived, checksummed, *then* cleared. |

**Status markers:** `- [ ]` pending · `- [~]` in progress · `- [x]` done (with its verdict prepended, original text preserved)

**Task-number placement:** T-numbers, session numbers, milestone IDs and "Gee" belong in workflow docs ONLY — never in source code, public docs, HTMLs or launchers.

---

## WHERE THE HISTORY LIVES

- **`docs/FINALIZED.md`** — every completed task, verbatim, plus the full ledger of every batch. **Never delete an entry.** Contains the complete verbatim archives of this file as of 2026-08-20, 2026-08-29, 2026-08-31, 2026-09-01, 2026-09-06, 2026-09-24 and **2026-11-23** (search `BEGIN VERBATIM TODO ARCHIVE <date>`).
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

*The board was templated 2026-11-23. New tasks go at the bottom of this file.*

- [~] `WALKWATCH.1` — ⏳ **UPDATED 2026-11-23 (later) — ONE MORE READ: HER EYE.** (5) `state.ownArt.eyeJudge` — passed / refused / unjudged and the last verdict with its age; `[OwnArt] 👁 her eye REFUSED …` lines name what was refused and why. ⚠ The eye is LENIENT while she knows few things (with 9 to compare against it passed a bad cat), so early passes are weak evidence; refusals are strong. Her visual store starts EMPTY this boot (v11), and her looks come from this project's own renderer (`server/image-render.py`, port 5124) — an `[eyes] starting her image renderer` launcher line and `ownArt.lookups.grounded` climbing are the first proof. ⏳ **UPDATED 2026-11-23 — KEPT OPEN BY RULING AS THE ONE ROW THAT RUNS AFTER THE START** (Gee chose *"Keep it as the one open row"* when the board was templated). Besides the four milestones below, this boot it also reads the batch that shipped with it: (1) `[Brain] RNG —` boot line names her seed (restored or fresh); (2) `state.donorCheckpoint.saves >= 1` within 10 min of the cortex upload, with a 0.3.42 donor — the live proof `WEIGHTLOSS.1` closed without; (3) `[OwnArt] ✍ HER OWN … built from N bones` on her drawings, never the trace redraw; (4) the mind's-eye page changes picture to picture (melt → flow → resolve) instead of cutting. **THE MONITOR, ARMED ON A 60-SECOND WAKE-UP AND READING THE FOUR MILESTONES HE NAMED IN HIS OWN ORDER.** Each milestone has a field that proves it rather than a log line that suggests it, because every instrument on this board that lied did so by reading healthy while dead:
  ```
    1  "as she starts up"           7525 /health 200 · state.totalNeurons quoted WITH its boot
                                    (~264M expected from DREAM_BRAIN_BUDGET_MB=8000 — the estimate is
                                    NOT the reading; the boot's own number is)
                                    community.runningFloorMB ~9,451 · ports 7526/5123/5124 answering
    2  "donor connects"             gpuConnected true · pool names the 4070 Ti SUPER · 17/17 matrices
                                    uploaded · donor row with NO red cell · drops 0
                                    ⚠ the donor does NOT auto-connect — `DONORSTART.1`: its window sits on
                                    "Idle — press Start"; `auto_restart:true` is reconnect-on-drop, not auto-start
    3  "she starts drawing"         ownArt.lookups.grounded climbing · ownArt.imageEngine present (counted
                                    and published NOWHERE until 2026-10-19 — its first appearance is itself
                                    a reading) · ownArt.lookups.vramTight climbing with ZERO `blocked 154s`
                                    ⛔ vramUnreadable climbing INSTEAD means the free-VRAM gate is failing
                                    open and protecting nothing
    4  "after 1st gate starts       cellStatus in-progress · state.gateReadings.probe changing kind every
       training"                    few minutes (stale > 2 min reads "not advancing") · the first row in
                                    state.gateReadings.cells with comprehension / vocab / production counts
  ```
  **Standing reads taken on every tick regardless of milestone, because each one has burned this project before:** `spikesLifetime` sampled TWICE a minute apart (⛔ `SERVING STATE IS NOT DOING WORK` — a brain once ran 53 minutes at `spikes 0` while `/health` answered instantly, and `totalSpikes` is instantaneous and FALLS on a healthy brain); `perf.cpuSampleMs` against `perf.cpuWindowMs` — **this boot is what answers `CPUGAUGE.1`**, whose cause is unproven and whose next boot was named as the test; `grep -c readback server/server.log` within the first 30 minutes — **`WEIGHTLOSS.1` records that the hourly readback had NEVER ONCE FIRED on this box**, so a `SHADOWCOST.3 checkpoint refresh` line is the first evidence the 30-minute bound is real rather than theoretical; `[EventLoop] STARVED` / `BLOCKED` lines against `LOOPBLOCK.1`'s fix (the per-second `nvidia-smi` is off the main thread now, so a return of 12%-serviced naming `spawnSync` would be a regression); and a WER/dump check for `unity-donor-windows-x86_64.exe` — **`NETBUG.7` armed LocalDumps and its cause stays unknown until the abort happens again with them in place**, while `NETBUG.10`'s hang class is proven by the process SURVIVING the socket drop.
  ⛔ **NO HEADLESS BROWSER GOES NEAR HER WHILE A NATIVE DONOR IS ATTACHED** — the standing rule from `NETBUG.7`/`NETBUG.9`: headless Chrome has WebGPU, registers as a ~2 GB donor, and `NETBUG.9` is the row about a 2 GB tab taking PRIMARY from the 16 GB card holding the brain. Every read on this row is `curl` against the loopback snapshot, never a page.
  ⚠ **An unchanged reading is a reading.** A tick that finds her still down reports *still down* and says so plainly; it does not infer a boot from the absence of one.
