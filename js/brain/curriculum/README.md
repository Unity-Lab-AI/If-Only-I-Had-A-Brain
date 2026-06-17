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
  ├── grade1.js                    (deferred — post-K scope contract)
  ├── grade2.js                    (deferred)
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
