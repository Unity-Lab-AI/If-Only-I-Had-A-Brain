# Developmental trajectory — the capture spec

> **What this is.** `GRANT.3` names the highest-value asset this project can produce: *"the documented developmental trajectory (vocab size, gate pass rates, emission quality, basin separation, grade by grade)"*, because it converts "impressive engineering" into **a scientific instrument producing data nobody else can produce**.
>
> **What this file is NOT.** It is not a trajectory. It is the **capture spec**: every field, where it already exists in the live state payload, and the sampling rule. Written this way on purpose — the walk restarted from zero cells today, so any curve published now would be fabricated, and a made-up trajectory is worse than no trajectory for exactly the audience this is aimed at.
>
> **Everything below is already emitted by the running brain.** No new instrumentation is required — that is the point. The work is *recording* it, and the recorder is defined here.

---

## Why the capture rule matters more than the plot

Three failure modes have already been paid for in this project, and all three are capture problems rather than plotting problems:

1. **A field that is a lifetime total sampled as a rate.** `SUBSTEPS.3` shipped with `_adaptTeachOps` seeded to `0` against a lifetime counter, making the first sample `(everything so far) / window` — an unbeatable baseline that silently pinned a controller. **Any counter below marked `cumulative` must be differenced against the previous sample, never divided by the window on first read.**
2. **A rate with no freshness.** `MIRRORID.5`: `gneuronsPerSec` is persistent donor-side and keeps its last value forever, so a dead card displays the rate it earned minutes ago. **Every rate needs its `*AdvancedAgoSec` companion captured alongside it or it is not a measurement.**
3. **A number without its denominator.** `PARTMIRROR.4` / `SYNCPARTIAL.7`: `df7HeldMatrices: 1` reads as a fault until you know it is `1/17`. **Capture denominators in the same row, never derive them later.**

A trajectory built without those three rules would be a plot of artefacts.

---

## Fields, and where each one already lives

All paths are relative to `state` in `GET /public-state.json`.

### Grade / progress axis (the x-axis)

| field | path | kind | note |
|---|---|---|---|
| subject | `curriculum.activeSubject` | label | one of the 5 subjects |
| grade | `curriculum.activeGrade` | label | `kindergarten` … `phd` |
| cells passed | `curriculum.cellsPassed` | cumulative | the honest progress counter |
| phases done / total | `curriculum.cellPhasesCompleted` / `.cellPhasesTotal` | ratio | **capture both** (rule 3) |
| sub-phases | `curriculum.cellSubPhases` | cumulative | within-phase progress |
| active phase + age | `curriculum.activePhase.name` / `.elapsedMs` | point | `GATEPHASE.1` made gates visible here; before it they read `null`, i.e. identical to a hang |

### Vocabulary size

| field | path | kind |
|---|---|---|
| K-vocab prefetched / total / taught | `consciousness.kVocabPrefetched` / `.kVocabTotal` / `.kVocabTaught` | ratio |
| definitions learned per hour | `consciousness.defsLearnedPerHour` | rate |

⚠ **Quote 18,017, not 60,000.** `SCALEAUDIT.3` established that the journey corpus is **18,017 unique words** measured (`fullJourneyVocabularyStats()`); the 60,000 figure is a headroom estimate for the boot assertion and has been mistaken for a target before.

### Gate pass rates

| field | path | kind |
|---|---|---|
| per-cell pass/fail | `curriculum.passedCells` (array) | set |
| phase pass record | `curriculum.passedPhases` (array) | set |
| exam-bank sizes | `[Curriculum] Held-out sanitize` boot line | log |

**Capture rule:** a gate's verdict is its RETURN VALUE, and gates are wrapped `TRACKED_NO_SKIP` (`GATEPHASE.1`) precisely so they never get skipped-and-return-`undefined`. A trajectory row for a cell is only valid once that cell appears in `passedCells` **or** a fail is logged — "phase completed" is not "gate passed".

### Emission quality — the hardest axis, and the one with the most traps

| field | path | kind | trap |
|---|---|---|---|
| word_motor ever fired | `voice.wordMotorEverFired` | bool | **the evidence field.** `CANSPEAK.4/.8` renamed a pure grade-arithmetic flag that was wearing a capability name |
| matrix-driven % | `voice.matrixDrivenPct` | rate | `null` until there are emissions — do not coerce to 0 |
| matrix hits | `voice.matrixHits` | cumulative | difference it (rule 1) |
| last emit rejection + age | `voice` block | point | **capture the AGE** — a rejection reason without its age is unreadable |
| inner-voice thoughts | `consciousness.workspace`, `predictionError` | series | Φ proxy + prediction error |

### Basin separation

| field | path | kind |
|---|---|---|
| Φ proxy | `consciousness.phiProxy` | point |
| prediction error | `consciousness.predictionError` | series (32-bar ring) |
| workspace ignition | `consciousness.workspace` | point |
| per-cluster firing rate | `clusters.<name>.firingRate` | rate |
| cortical microstructure | `consciousness.numColumns` / `.hubCount` / `.layerCounts` | static per boot |

### Machine context — required for any published figure to be reproducible

| field | path | why |
|---|---|---|
| build sha | `build.short` / `.sha` / `.deployedAt` | which code produced the row |
| total neurons | sum of `clusters.*.size` | **changed 320,678,816 → 425,436,550 today**; a trajectory spanning a geometry change must say so |
| langCortex size | `clusters.langCortex.size` | the vocabulary ceiling |
| donor + primary | `profiling.clients.list[].gpuName` / `.df7Primary` / `.primaryFloorMB` | `PRIMARYFLOOR`: a donor below the floor takes NO matrices, so rows captured then are not comparable |
| substeps | `perf.batchTiming.substeps` | throughput context |
| host RAM | `profiling.hostRam.freeMB` / `.usedPct` | `RAMHEAD` |

---

## Sampling rule

- **Cadence:** one row per **phase change** (from `curriculum.activePhase.name`), plus one row on every `cellsPassed` increment. Phase changes are seconds-to-minutes, so this is a few hundred rows per grade — enough to plot, small enough to keep forever.
- **Storage:** append-only JSONL, one JSON object per row, `at` as ISO-8601. **Rotate by BYTES, keep whole LINES** — `SCRIPTKILL.2` shipped with a lines-cap and a bytes-trigger, a gate that read correct and enforced nothing.
- **Never interpolate across a geometry change.** A fresh walk or a tier change makes rows either side non-comparable. Start a new series and record the build sha.
- **Never publish a cumulative counter as a rate** without differencing it against the previous row (rule 1).

## Publication target

`GRANT.3` also names **arXiv (cs.NE / q-bio.NC)** for a citable artifact. The theory half already exists in `docs/THEORY-PAPER.md` (including §8.6 *The agent basin*); this spec is the empirical half's contract. **The paper needs one complete K→PhD walk on a single build with no geometry change mid-run** — which is precisely why the capture rule above forbids stitching across one.
