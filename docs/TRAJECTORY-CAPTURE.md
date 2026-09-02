---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
status: draft
sources:
  - js/brain/curriculum.js
  - server/brain-server/state.js
verified-scope: |
  CHECKED 2026-08-27 — every documented state path looked up key-by-key in the
  LIVE GET /public-state.json (local build 2673d14c, booted 04:22Z):
    - CORRECTED (5 nonexistent paths): curriculum.activeSubject ->
      currentSubject, activeGrade -> currentGrade, cellsPassed ->
      passedCellsTotal, and passedCells / passedPhases have NO published
      equivalent (they exist on the cluster, they are not in the payload).
    - CORRECTED: "5 subjects" -> 6; totalNeurons is published top-level and
      must not be re-derived by summing clusters.*.size; the quoted neuron
      figures were stale (the count is derived at boot from free host RAM).
    - FOUND present-and-undocumented: curriculum.lastGateVerdict,
      curriculum.examTranscript, curriculum.cellPhasesStarted.
    - VERIFIED PRESENT: cellPhasesCompleted/Started/Total, cellSubPhases,
      activePhase.name+.elapsedMs, all consciousness.* and voice.* fields
      listed, build.short/.sha/.deployedAt, perf.batchTiming.substeps,
      clusters.<name>.size+.firingRate, profiling.hostRam, profiling.clients.
    - ⛔ SIXTH BAD PATH, caught in a SECOND pass and NOT by the first:
      clusters.langCortex.size is UNDEFINED - there is no langCortex cluster,
      the language cortex is 25 separate lang_* clusters. ⚠ My first pass
      listed this row as verified because I checked the PATTERN
      clusters.<name>.size against `cortex` and generalised. VERIFYING A
      PATTERN IS NOT VERIFYING AN INSTANCE - and that over-reach is exactly
      what this method is supposed to replace, so it is recorded not buried.
  NOT CHECKED — do not read this page as authority on:
    - whether curriculum.subjects listing 6 while the roster is 9 courses is
      by design or under-reporting. Named as an open question, NOT resolved.
    - profiling.clients.list[] per-donor field names (.gpuName / .df7Primary /
      .primaryFloorMB) - the list was empty at read time, so the row shapes
      could not be confirmed. Absence of a donor is not absence of a field.
    - the three capture RULES at the top (cumulative/freshness/denominator) -
      these are methodology, verified only as still-consistent, not re-derived.
    - the sampling cadence, rotation and arXiv publication sections.
  ⚠ ONE FIELD-SHAPE CAVEAT: the live brain predates this session's server
  fixes, so a field ADDED after 2673d14c would read absent here and that
  would NOT mean the doc is wrong. Every correction above is a path the doc
  names that the payload contradicts, not a path the payload merely lacks.
  ⭐ SELF-DRIFT, restamped 2026-08-27 — and this one ADDS a field to capture.
  The moved source is server/brain-server/state.js (BUCKETPUB.1), which now
  publishes `voice.wordsBucketed` and `voice.bucketSubjects`. Both belong in the
  "Emission quality" table above: wordsBucketed is the field that distinguishes
  "no candidate exists yet" from "a winner was rejected by a floor", which is
  exactly the trap that section warns about. ⚠ Capture them as CUMULATIVE
  (difference per rule 1) and expect `null`, not 0, before the capability scan
  is available — a 0 there would read as "nothing bucketed", the very claim the
  field exists to establish.
  ⭐ RESTAMPED 2026-08-29 — both sources moved again (curriculum.js: SUBJRETIRE
  subjectsOwedAt retirement + PSITEACH walk heartbeat + FIREKNOB; state.js:
  PSITEACH/FIREKNOB adding psiInputs / walkTick / firing). All ADDITIVE against
  this page: every documented path re-checked in CURRENT code — currentSubject,
  currentGrade, passedCellsTotal, cellPhases*, lastGateVerdict, examTranscript,
  perSubject, subjects all still published (curriculum.js getState block,
  ~:3766-3792). ⚠ One leftover fixed: the SAMPLING RULE still said
  "cellsPassed increment" — the exact undefined path this page corrects. ⚠ Note
  `subjects` is DYNAMIC (canon-ordered perSubject keys, ROSTERROWS) — the
  6-subject read above is a young-walk snapshot, and SUBJRETIRE now retires
  college-only tracks from the walk roster; the §"6 vs 9" open question stands.
last-verified: "cd465955 2026-08-29"
---

# Developmental trajectory — the capture spec

> **What this is.** `GRANT.3` names the highest-value asset this project can produce: *"the documented developmental trajectory (vocab size, gate pass rates, emission quality, basin separation, grade by grade)"*, because it converts "impressive engineering" into **a scientific instrument producing data nobody else can produce**.
>
> **What this file is NOT.** It is not a trajectory. It is the **capture spec**: every field, where it already exists in the live state payload, and the sampling rule. Written this way on purpose — the walk restarted from zero cells today, so any curve published now would be fabricated, and a made-up trajectory is worse than no trajectory for exactly the audience this is aimed at.
>
> **Everything below is already emitted by the running brain.** No new instrumentation is required — that is the point. The work is *recording* it, and the recorder is defined here.
>
> **Re-verified 2026-08-27 (DOCPROV.4, 7 of 22 — both sources had moved).** ⭐ **Every documented path was looked up in the LIVE `/public-state.json`, key by key. Most held. Five did not exist.** ⛔ **`curriculum.activeSubject`, `curriculum.activeGrade`, `curriculum.cellsPassed`, `curriculum.passedCells` and `curriculum.passedPhases` are all UNDEFINED** — the real names are `currentSubject`, `currentGrade`, `passedCellsTotal`, and for the last two there is **no published equivalent at all**. ⛔ **In a capture spec that is not a typo: it is a recorder writing `undefined` into the x-axis of a curve that then looks captured and is empty** — the same fabricated-trajectory outcome the header warns against, arriving through the front door. ⛔ **Worst of all, the spec's OWN validity rule depended on one of the missing fields** (*"a row is only valid once that cell appears in `passedCells`"*), so the correctness criterion was unimplementable and would have failed silently in whichever direction it was coded. ⭐ **Two present-and-undocumented fields found while checking: `curriculum.lastGateVerdict` and `curriculum.examTranscript`** — the actual gate-outcome carriers this page needed. ⚠ Also corrected: **six subjects, not five**; `totalNeurons` is published directly and must not be re-derived by summing clusters; and the neuron figures quoted here were stale because **the count is derived at boot from free host RAM** (459,775,607 this boot). ⭐ **VERIFIED PRESENT, so nobody re-checks:** `cellPhasesCompleted`/`.cellPhasesStarted`/`.cellPhasesTotal`, `cellSubPhases`, `activePhase.name`+`.elapsedMs` (shape confirmed), every `consciousness.*` field listed, every `voice.*` field listed, `build.short`/`.sha`/`.deployedAt`, `perf.batchTiming.substeps` (54), `clusters.<name>.size`+`.firingRate`, `profiling.hostRam.*`, `profiling.clients.list`.

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

⛔ **CORRECTED 2026-08-27 — THREE OF THESE SIX PATHS DID NOT EXIST.** Read off the live payload, key by key. ⭐ **In a capture spec a wrong path is not a typo — it is a recorder that logs `undefined` for the x-axis and a trajectory that looks captured and is empty.** That is the same fabricated-curve outcome this file was written to prevent.

| field | path | kind | note |
|---|---|---|---|
| subject | **`curriculum.currentSubject`** | label | ⛔ was `activeSubject` — **undefined**. ⚠ And **six** subjects, not five: `curriculum.subjects` reads `["ela","math","science","social","art","life"]` |
| grade | **`curriculum.currentGrade`** | label | ⛔ was `activeGrade` — **undefined**. `kindergarten` … `phd`. Companions worth capturing: `currentGradeLabel`, `currentGradeShort`, `currentCourseName` |
| cells passed | **`curriculum.passedCellsTotal`** | cumulative | ⛔ was `cellsPassed` — **undefined**. The honest progress counter; read **0** live |
| phases done / started / total | `curriculum.cellPhasesCompleted` / **`.cellPhasesStarted`** / `.cellPhasesTotal` | ratio | ✅ all present. **capture all three** (rule 3) — `cellPhasesStarted` was missing from this table and it is the field `WALKPROG.1` was closed on |
| sub-phases | `curriculum.cellSubPhases` | cumulative | ✅ present |
| active phase + age | `curriculum.activePhase.name` / `.elapsedMs` | point | ✅ present, exact shape confirmed live: `{"name":"_teachHebbian","elapsedMs":70}`. `GATEPHASE.1` made gates visible here; before it they read `null`, i.e. identical to a hang |

⚠ **Open question, deliberately NOT resolved here:** `curriculum.subjects` lists **6**, while the course roster is **9** (`pe` / `music` / `health` are real courses — `WALKORDER.1` was filed precisely because they had no entry in `cluster.grades` and defaulted to `pre-K` forever). **Whether `subjects` is the core set by design or is under-reporting is a separate question** and guessing it here would repeat that bug's own cause.

### Vocabulary size

| field | path | kind |
|---|---|---|
| K-vocab prefetched / total / taught | `consciousness.kVocabPrefetched` / `.kVocabTotal` / `.kVocabTaught` | ratio |
| definitions learned per hour | `consciousness.defsLearnedPerHour` | rate |

⚠ **Quote 18,017, not 60,000.** `SCALEAUDIT.3` established that the journey corpus is **18,017 unique words** measured (`fullJourneyVocabularyStats()`); the 60,000 figure is a headroom estimate for the boot assertion and has been mistaken for a target before.

### Gate pass rates

⛔ **CORRECTED 2026-08-27 — AND THIS IS THE DEEPEST ERROR ON THE PAGE.** Both documented arrays are **absent from `/public-state.json`**, and the capture rule below was written to depend on one of them.

| field | path | kind |
|---|---|---|
| cells passed (total) | **`curriculum.passedCellsTotal`** | cumulative — ⛔ `curriculum.passedCells` is **UNDEFINED** in the public payload |
| per-subject progress | **`curriculum.perSubject`** / **`curriculum.subjects`** | ⚠ these are what the payload actually exposes; **not** verified as a per-cell pass/fail set |
| last gate verdict | **`curriculum.lastGateVerdict`** | point — ⭐ **present and undocumented until now.** This is the field carrying an actual gate outcome |
| exam transcript | **`curriculum.examTranscript`** | series — ⭐ also present and undocumented |
| phase pass record | ⛔ **`curriculum.passedPhases` is UNDEFINED in the public payload** | — use `cellPhasesCompleted` / `.cellPhasesStarted` / `.cellPhasesTotal` |
| exam-bank sizes | `[Curriculum] Held-out eval check` boot line | log — ⛔ **the sanitize line alone no longer explains the total.** A bank can now GROW at boot as well as shrink: a derived set is merged before the check runs, so the size is `authored − removed + injected`. The eval line carries `removed at source load` **and** `injected from generated sets` for exactly that reason; a recorder reading only the sanitize line cannot tell a grown bank from a doubled one |

⛔ **The old capture rule was UNIMPLEMENTABLE AS WRITTEN.** It said: *"A trajectory row for a cell is only valid once that cell appears in `passedCells` or a fail is logged."* **`passedCells` is not in the payload the rest of this file tells the recorder to read** — so the spec's own correctness criterion referenced a field the recorder cannot see. ⭐ **A recorder built strictly to this page would have validated every row against `undefined`, and `undefined` is falsy — so either every row is rejected or, if the check was written the other way, every row passes unchecked. Both are silent.**

**Capture rule (corrected):** a gate's verdict is its RETURN VALUE, and gates are wrapped `TRACKED_NO_SKIP` (`GATEPHASE.1`) precisely so they never get skipped-and-return-`undefined`. **A trajectory row for a cell is only valid once `passedCellsTotal` INCREMENTS** (difference it per rule 1 — it is cumulative) **or `lastGateVerdict` records a fail.** "phase completed" is still not "gate passed". ⚠ `passedCells` / `passedPhases` **do exist on the cluster** as the authoritative ledger `WALKORDER.1` made position read from — they are simply **not published**, so a capture spec must not name them as sources. **If the recorder needs the ledger itself, that is a new field to publish, not a path to write down.**

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
| total neurons | **`totalNeurons` (top-level)** | ⛔ **CORRECTED: do not sum `clusters.*.size` — the payload publishes `totalNeurons` directly** (read **459,775,607** live, local build `2673d14c`, booted `04:22Z`). Deriving a number the payload already states is how the two disagree. ⚠ **The stale figures this row used to quote — *"changed 320,678,816 → 425,436,550 today"* — are exactly why the count must never be written as a constant:** it is **DERIVED AT BOOT from free host RAM**, so the same code has booted at 425,436,550, 411,216,550 and 459,775,607. **Quote it with the boot that produced it.** A trajectory spanning a geometry change must say so |
| langCortex size | ⛔ **`clusters.langCortex.size` IS UNDEFINED — there is no `langCortex` cluster.** The language cortex is published as **25 separate `lang_*` clusters**: `lang_auditory`, `lang_visual`, `lang_gustatory`, `lang_somatosensory`, `lang_free`, `lang_letter`, `lang_phon`, `lang_sem` (+ 6 `lang_sem_*`), `lang_fineType`, `lang_motor`, `lang_word_motor` (+ 6 `lang_word_motor_*`). **Sum the `lang_*` sizes, or name the specific band you mean.** | the vocabulary ceiling. ⚠ **CAUGHT 2026-08-27 IN A SECOND PASS — this was the SIXTH bad path on this page and my first pass marked it "verified".** I checked the *pattern* `clusters.<name>.size` against `cortex` and generalised, which is the same over-reach the enumerate-and-diff method is supposed to replace. **Verifying a pattern is not verifying an instance.** |
| donor + primary | `profiling.clients.list[].gpuName` / `.df7Primary` / `.primaryFloorMB` | `PRIMARYFLOOR`: a donor below the floor takes NO matrices, so rows captured then are not comparable |
| substeps | `perf.batchTiming.substeps` | throughput context |
| host RAM | `profiling.hostRam.freeMB` / `.usedPct` | `RAMHEAD` |

---

## Sampling rule

- **Cadence:** one row per **phase change** (from `curriculum.activePhase.name`), plus one row on every `passedCellsTotal` increment (⛔ this line said `cellsPassed` until 2026-08-29 — the very path the corrections above establish is UNDEFINED; the sampling rule itself was still carrying it). Phase changes are seconds-to-minutes, so this is a few hundred rows per grade — enough to plot, small enough to keep forever.
- **Storage:** append-only JSONL, one JSON object per row, `at` as ISO-8601. **Rotate by BYTES, keep whole LINES** — `SCRIPTKILL.2` shipped with a lines-cap and a bytes-trigger, a gate that read correct and enforced nothing.
- **Never interpolate across a geometry change.** A fresh walk or a tier change makes rows either side non-comparable. Start a new series and record the build sha.
- **Never publish a cumulative counter as a rate** without differencing it against the previous row (rule 1).

## Publication target

`GRANT.3` also names **arXiv (cs.NE / q-bio.NC)** for a citable artifact. The theory half already exists in `docs/THEORY-PAPER.md` (including §8.6 *The agent basin*); this spec is the empirical half's contract. **The paper needs one complete K→PhD walk on a single build with no geometry change mid-run** — which is precisely why the capture rule above forbids stitching across one.
