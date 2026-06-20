# `js/brain/curriculum/` — per-grade + per-subject split

Per the 2026-04-22 operator directive: *"the cirriculkum was already suppose to have everything split per grade per files sytem did you not make a file system"* — this directory is the home for the split.

## Target layout (per-grade files)

One file per grade, with all six subjects' cell runners for that grade living in one place. Shared primitives (`_teachHebbian`, `_teachAssociationPairs`, `_teachCombination`, `_teachBiographicalFacts`, `_conceptTeach`, etc.) stay on the `Curriculum` class in `js/brain/curriculum.js` (the entry point) and each per-grade file attaches its cell runners via `Object.assign(Curriculum.prototype, {...})` mixin.

```
js/brain/curriculum/
  ├── README.md                    (this file)
  ├── pre-K.js                     (runElaPreK, runMathPreK, runSciPreK,
  │                                 runSocPreK, runArtPreK, runLifePreK +
  │                                 pre-K-specific helpers _teachPrekSpatial,
  │                                 _teachPrekVisual, _teachPrekLogic,
  │                                 _teachPrekSelf)
  ├── kindergarten.js              (runElaK, runMathK, runSciK, runSocK,
  │                                 runArtK, runLifeK + K-specific helpers)
  ├── grade1.js                    (runElaG1Real … + G1-specific helpers)
  ├── grade2.js … phd.js           (full K→PhD — every grade built)
  │   ...
  └── student-question-banks.js    (moved from js/brain/student-question-banks.js
                                   once import paths update — deferred to
                                   same session as the method extraction to
                                   keep the move atomic)
```

## Mixin pattern

Each per-grade file follows this shape:

```js
// js/brain/curriculum/pre-K.js
import { Curriculum } from '../curriculum.js';

Object.assign(Curriculum.prototype, {
  async runElaPreK(_ctx) { /* ... */ },
  async runMathPreK(_ctx) { /* ... */ },
  // ...
  async _teachPrekSpatial() { /* pre-K-specific helper */ },
  // ...
});
```

The main `js/brain/curriculum.js` imports each grade file after defining the `Curriculum` class:

```js
// js/brain/curriculum.js
export class Curriculum { /* base class + shared primitives */ }
import './curriculum/pre-K.js';       // attaches runElaPreK etc.
import './curriculum/kindergarten.js'; // attaches runElaK etc.
// grade1-phd stubbed or deferred
```

## Extraction protocol (when moving methods in a follow-up session)

1. Identify all methods defined on `Curriculum.prototype` that are ONLY invoked from pre-K cell runners (`_teachPrekSpatial` / `_teachPrekVisual` / `_teachPrekLogic` / `_teachPrekSelf`) — those move with the grade file.
2. Shared primitives (`_teachHebbian`, `_teachAssociationPairs`, `_teachCombination`, `_teachBiographicalFacts`, `_conceptTeach`, `_teachQABinding`, `_writeTiledPattern`, `_clearSpikes`, `_hb`, `_auditExamVocabulary`, `_pregateEnrichment`, `_teachExamTemplates`, etc.) stay on `Curriculum` class in the entry point.
3. Cell runners move to the grade file via mixin.
4. Gate methods (`_gateElaKReal`, `_gateMathKReal`, etc.) move to `kindergarten.js` (K-specific) or stay on class (shared).
5. After every method move: rebuild bundle, verify import chain, run a curriculum startup smoke test.

## Current status (2026-04-22)

Directory + scaffold README live. Per-grade file stubs exist with the mixin pattern ready. Method extraction from `js/brain/curriculum.js` (25 K lines) deferred to a dedicated session with test coverage pass — doing it live without coverage risks breaking the 23-session curriculum teach path the brain depends on. See `docs/TODO.md` T23.c.1 for the closure path.


## Post-ship audit close (2026-06-17)

The `/super-review ultrathink` audit closed in a single atomic commit. Per-dir impact:

- **A-track (telemetry visibility):** `getCompositionalStats()`, `getWordCreationCandidates()`, `_chatTimeHebbianStats`, `_dreamRecombinationStats` all surfaced via `getState()` → dashboard panels.
- **B-track (math grounding):** `docs/THRESHOLD-DERIVATION.md` ships. Two-axis novelty metric (compositional + vocab). Dream-recomb joint criteria (audit B.7).
- **D-track (discipline):** `LAW.MIXIN-ORDER` codified in `.claude/CONSTRAINTS.md`. `kScales` memoization in `cluster.js`. `initCompositionalTelemetry` denominator reset on re-init.
- **E-track (half-shipped close):** P6.7 word-creation promotion mechanism (relationTagId=32). Dream-recomb consolidated samples ring (cap 20). Partial-vs-novel stratification.
- **H-track (live-test breakage):** Boot diagnostics + spawn-failure surfacing + auto-size wiring assertion + HTML-entry-points doc + smoke/parity scripts.

See `docs/NewTodo.md § POST-SHIP AUDIT` for the full 42-task list + `docs/ARCHITECTURE.md` post-audit section for cross-module summary. Threshold math: `docs/THRESHOLD-DERIVATION.md`. HTML contracts: `docs/HTML-ENTRY-POINTS.md`. Mixin discipline: `.claude/CONSTRAINTS.md § LAW.MIXIN-ORDER`.

## Live-test follow-up (2026-06-17, session 114.19fp — I.1-I.20)

15-fix atomic envelope + 5 follow-up bugs shipped post-audit during operator-driven K-curriculum live test. Per-dir impact on curriculum-side code (lives in `js/brain/curriculum.js` — per-grade split deferred per T23.c.1):

- **I.2 K-VOCAB SEED 289-word retry path** — `_dreamWindow` per-word timeout bumped 3s → 20s + re-queue mechanism. Combined with warm `definition-cache.json` (preserved through I.15-LAW-strengthened auto-clear), next K-VOCAB-UPFRONT-MULTIDEF SEED phase completes in 30-60s vs the 11-12 min cold-cache run that produced the original 289-word gap.
- **I.8 consolidation duration cap** — `DREAM_CONSOLIDATION_MAX_MS` env (default 30s) + per-cluster deadline check + SEED-phase skip (consolidation skips entirely when `_currentMacroPhase` contains 'SEED' so SEED-phase GPU stays with curriculum). Log surfaces `⚠ DEADLINE-ABORT (DREAM_CONSOLIDATION_MAX_MS=Xms)` when cap fires.
- **I.10 slow-word histogram** — `_wordIntDurations` 256-cap ring buffer in `_teachWordIntegrated`, `⚠ slow word "X" took Yms` log on >30s threshold. Per-word elapsedMs also broadcast via I.11 Brain Events feed.
- **I.11 Brain Events broadcast for cell-level teach paths** — `_pushBrainEvent?.` START/DONE in `_teachWordIntegrated` (per-word with elapsed-ms) + `_teachVocabList` (START + every-5-words progress + DONE). Event-broadcast coverage now 12/12 teach paths (was 1/12 SEED-only).
- **I.12 `_currentCellSubPhases` counter** — increments on every wrapped teach call (outermost OR nested), resets on cell entry, exposed via `cellSubPhases` field in `getCurriculumStatus()` snapshot. Dashboard renderer prefers it when outermost counter is 0, tags label with ` sub-phases ` so operator can distinguish counter source.
- **I.14 HTTP event-loop yield** — explicit `await new Promise(r => setImmediate(r))` at `_teachHebbian` entry, throttled to every 50ms via `_lastHebbianYieldAt` timestamp. Eliminates 171s-stall main-thread saturation that starved HTTP request handlers during heavy Hebbian batches.
- **I.4 `workers=0MB(initializing)`** — replaced ambiguous `workers=?MB` placeholder in cell-alive heartbeat formatter.
- **I.5 `(active)` phase-elapsed floor** — phase-elapsed shows `(active)` when elapsed < 500ms instead of misleading `+0s`.

Curriculum entry point unchanged — fixes live as in-place edits within `js/brain/curriculum.js`. The per-grade file split (target layout in this README) still deferred to a dedicated session with test-coverage pass. See `docs/NewTodo.md § I-track` for full per-fix detail + closure status (all 20 ✅ SHIPPED).
