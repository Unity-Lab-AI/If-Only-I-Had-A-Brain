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
