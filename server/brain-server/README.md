# `server/brain-server/` — per-concern split of brain-server.js

Per the per-concern split directive — break the 9,555-line brain-server.js into focused modules attached to `ServerBrain.prototype` via `Object.assign` mixin pattern (same approach as `js/brain/curriculum/` per-grade split + `js/brain/cluster/` per-module split).

## Target layout (per-concern files)

```
server/brain-server/
  ├── README.md         (this file)
  ├── gpu.js            (GPU sparse comms — 20 methods, 1073 lines)
  ├── state.js          (state broadcast / dashboard feed — deferred bite)
  ├── memory.js         (episodic DB + persistence — deferred bite)
  └── chat.js           (processAndRespond + chat-time learning — deferred bite)
```

## Mixin pattern

Each per-concern file follows this shape:

```js
// server/brain-server/gpu.js
export const SERVER_GPU_MIXIN = {
  async _gpuStep(clusterName) { /* ... */ },
  async _gpuBatch(substeps, params) { /* ... */ },
  // ... 18 more GPU methods
};
```

The main `server/brain-server.js` imports each module after defining the `ServerBrain` class and attaches via Object.assign:

```js
// server/brain-server.js (entry point, bottom)
import { SERVER_GPU_MIXIN } from './brain-server/gpu.js';
Object.assign(ServerBrain.prototype, SERVER_GPU_MIXIN);
```

## What stays on `ServerBrain.prototype` in brain-server.js

- **Constructor + init** — `constructor`, `_initLanguageSubsystem`
- **Lifecycle** — `start()`, `stop()`
- **Core tick loop** — `_updateDerivedState`, `_computeKuramotoCoherence`, `_driveDrugScheduler`
- **Chat path** — `processAndRespond`, `injectText` (until P4.3.d chat bite)
- **Region utilities** — `_regionFraction`, `_mirrorCortexRegions`, `_regionsFor`
- **Misc** — drug state helpers, dictionary smoke test, mood snapshot, perf stats

## Extraction protocol

Same as the cluster.js per-module split:

1. Identify coherent contiguous method block
2. Verify methods reference state via `this.` (mixin-compatible)
3. Use deterministic Node migration script in `.git/` to extract → convert class-method form to object-literal form → insert into mixin module
4. Replace block in brain-server.js with marker comment
5. Add `Object.assign(ServerBrain.prototype, MIXIN)` at brain-server.js entry-point bottom
6. Rebuild bundle is NOT needed (server-side only, runs in Node)
7. Atomic-commit code + docs

## Current status (2026-06-17)

- P4.3.a gpu.js extracted (20 methods, 1073 lines — sparse-protocol comms, hebbian dispatch, propagate, slice writes, readback, ensure-bound)
- P4.3.b state.js, P4.3.c memory.js, P4.3.d chat.js deferred to future bites

Each bite ships as a single atomic commit. Behaviour identical post-mixin-attach — methods accessible via `brain.X()` exactly as before.


## Post-ship audit close (2026-06-17)

The `/super-review ultrathink` audit closed in a single atomic commit. Per-dir impact:

- **A-track (telemetry visibility):** `getCompositionalStats()`, `getWordCreationCandidates()`, `_chatTimeHebbianStats`, `_dreamRecombinationStats` all surfaced via `getState()` → dashboard panels.
- **B-track (math grounding):** `docs/THRESHOLD-DERIVATION.md` ships. Two-axis novelty metric (compositional + vocab). Dream-recomb joint criteria (audit B.7).
- **D-track (discipline):** `LAW.MIXIN-ORDER` codified in `.claude/CONSTRAINTS.md`. `kScales` memoization in `cluster.js`. `initCompositionalTelemetry` denominator reset on re-init.
- **E-track (half-shipped close):** P6.7 word-creation promotion mechanism (relationTagId=32). Dream-recomb consolidated samples ring (cap 20). Partial-vs-novel stratification.
- **H-track (live-test breakage):** Boot diagnostics + spawn-failure surfacing + auto-size wiring assertion + HTML-entry-points doc + smoke/parity scripts.

See `docs/NewTodo.md § POST-SHIP AUDIT` for the full 42-task list + `docs/ARCHITECTURE.md` post-audit section for cross-module summary. Threshold math: `docs/THRESHOLD-DERIVATION.md`. HTML contracts: `docs/HTML-ENTRY-POINTS.md`. Mixin discipline: `.claude/CONSTRAINTS.md § LAW.MIXIN-ORDER`.

## Live-test follow-up (2026-06-17, session 114.19fp — I.1-I.20)

15-fix atomic envelope + 5 follow-up bugs shipped post-audit during operator-driven K-curriculum live test. Per-concern impact on this directory:

- **gpu.js**:
  - **I.17 dispatch counter** — `_recordGpuDispatch()` helper added; hooked into `_sparseSend` (JSON path) + `_sparseSendBinary` (high-volume binary path covering `_teachHebbian` + `_teachAssociationPairs` dispatches). 30-second timestamp ring buffer with lazy 5000-entry soft-cap. `gpuDispatchTotal` cumulative counter exposed via perfStats as hidden diagnostic (not in main dashboard display).
- **chat.js** (heaviest impact):
  - **I.19 require('child_process') import** — **root cause** of all three previous GPU% bugs (I.1 showed 0%, I.17 showed `util: N/A`, I.18 showed static 50%). Single missing import meant every `execSync('nvidia-smi ...')` since I.1 threw ReferenceError silently caught by try/catch. Added `const { execSync } = require('child_process')` at top of file — unbreaks ALL GPU polling.
  - **I.18 + I.20 GPU panel rebuild** — `_updatePerfStats` queries `memory.used,utilization.gpu` in single combined nvidia-smi call. Exposes `gpuVramUsedMB`, `gpuUtilPercent`, `gpuVramQueryWorking` boolean. Dashboard renders VRAM% as big number + util% as small inline label. NO fake fallback — `gpuVramQueryWorking=false` triggers honest "unavailable" label, never a hallucinated number.
  - **I.3 + I.9 inner-thought fallbacks** — `_sampleCurrentVocab` + `_sampleCurrentSentence` fall back to `cluster._definitionTaughtWords` Set when `wordBucketWords_<subject>` empty (SEED phase). `_pickInnerThoughtSeed` rotation expanded from 5 → 7 sources adding `k-vocab-recent` + `cell-progress` so Unity isn't silent during pre-cell + early-K-cell.
  - **I.1 + I.17 hidden diagnostic remnants** — dispatch-rate computation moved to hidden field; nvidia-smi VRAM polling at 1Hz cadence with `_lastGpuVramPoll` timestamp gate.
- **brain-server.js entry**:
  - **I.6 gate-probe WS banner** — broadcasts `{type:'gateProbe', state:'start'|'end', cellId, durationMs, ts}` from the curriculum-gate-active branch. Dashboard creates floating banner with live duration tick + green-check dismissal.
  - **I.15 `autoClearStaleState` module-load gate** — wrapped in `if (require.main === module)` check. Module loads (syntax-check, REPL inspection, future tooling) NO-OP for the wipe; only actual `node server/brain-server.js` entry-point boots execute the wipe per iter14-D contract. **Codifies the LAW added after the 22:16 PT incident** where a `node -e "require('./server/brain-server.js')"` syntax check triggered the top-level wipe and lost operator's K-curriculum training session.

State broadcast path unchanged — `state.js:318` `perf: this._perfStats` continues to flow all GPU/CPU/memory metrics through `getState()` to the dashboard. See `docs/NewTodo.md § I-track` for full per-fix detail + closure status (all 20 ✅ SHIPPED).
