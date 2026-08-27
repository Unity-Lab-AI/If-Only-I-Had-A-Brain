# `js/brain/cluster/` — per-module split of cluster.js

Per the per-module split directive — break the (then) 6,374-line cluster.js god-class into focused modules attached to `NeuronCluster.prototype`
<!-- Drift check 2026-08-20: cluster.js is now 4,728 lines — it SHRANK by ~1,650, which is the split doing exactly what it was for. The 6,374 above is the pre-split baseline and is kept so the reduction stays legible. -->
<!-- Drift check 2026-08-27 (GOTCHA.4): cluster.js measured 4,984 lines (`wc -l`) BEFORE this same batch added the GOTCHA.5 comment block, and 5,011 after it. Both numbers are given deliberately: quoting one without the edit that moved it is how the 2026-08-20 figure came to look current for a week. Mixin sizes, unchanged by this batch, all `wc -l`: emit 2,653 · hebbian 1,373 · telemetry 331 · attention 268 · probe 67. -->
<!-- ⚠ A LINE COUNT IS A READING, NOT A PROPERTY. It goes stale on the next comment edit — including this one. Quote it with the commit or the change that produced it, exactly as `state.totalNeurons` must be quoted with its boot. -->
<!-- ⚠ COUNTING CONVENTION, stated because it produced a real off-by-one: these are `wc -l` (newline count). A `split('\n')` length is ONE HIGHER on any file ending in a newline, and that difference put 4,985 into the wiki for this file. If a count here disagrees with another doc by exactly 1, this is why. -->
 via `Object.assign` mixin pattern (same approach as `js/brain/curriculum/` per-grade split).

## Target layout (per-module files)

```
js/brain/cluster/
  ├── README.md         (this file)
  ├── telemetry.js      (emission tracking + compositional telemetry +
  │                      word-creation candidate gate + recent-emission ring)
  ├── emit.js           (composeSentence, emitWordDirect,
  │                      generateSentenceAwait, _emitDirectPropagate,
  │                      _dictionaryOracleEmit — deferred to next bite)
  ├── hebbian.js        (_crossRegionHebbian, intraSynapsesHebbian,
  │                      intraSynapsesBcm, anti-Hebbian variants —
  │                      deferred to later bite)
  ├── probe.js          (computePhi, getTrainedCapability,
  │                      diagnoseReadoutForEmbedding, working-memory
  │                      readout — deferred to later bite)
  └── attention.js      (attentionReset, attentionPush, attentionRead,
                         getAttentionState — thalamic relay over the
                         emission context window)
```

## `attention.js` — the thalamic relay

Not an extraction from cluster.js; a new capability. `emit.js` calls it
from the compose loop when the caller passes `attention: true`, so it
attaches LAST in the entry-point assign block to mirror that dependency
direction (emit → attention). Default-off, no neurons, no topology change,
no weight-format bump. Full rationale and measurements: `js/brain/ATTENTION.md`.

## Mixin pattern

Each per-module file follows this shape:

```js
// js/brain/cluster/telemetry.js
export const CLUSTER_TELEMETRY_MIXIN = {
  trackRecentEmission(word) { /* ... */ },
  initCompositionalTelemetry(corpus) { /* ... */ },
  classifyCompositionalEmission(sentence) { /* ... */ },
  _recordWordCreationCandidate(top1, top2, floor) { /* ... */ },
  getWordCreationCandidates(opts = {}) { /* ... */ },
  getCompositionalStats() { /* ... */ },
};
```

The main `js/brain/cluster.js` imports each module after defining the `NeuronCluster` class and attaches via Object.assign:

```js
// js/brain/cluster.js (entry point, bottom)
import { CLUSTER_TELEMETRY_MIXIN } from './cluster/telemetry.js';
Object.assign(NeuronCluster.prototype, CLUSTER_TELEMETRY_MIXIN);
```

## What stays on `NeuronCluster.prototype` in cluster.js

- **Core operations** — constructor, regions setup, step(), stepAwait(), learn()
- **Region accessors** — regionSpikes(), regionReadout()
- **Injection primitives** — injectEmbeddingToRegion(), injectLetter(), injectCurrent(), injectWorkingMemory()
- **K-microstructure infrastructure** — assertKWiring(), invalidateKWiring(), buildKScalesForProjection(), _genCorticalAttribs()
- **State persistence** — getState(), loadWeights() (when present)
- **Shared substrate** — synapses, crossProjections, gpuProxy wiring, propagate cascade

## Extraction protocol

Same as `js/brain/curriculum/` per-grade split:

1. Identify a coherent contiguous method block (low entanglement with rest of class)
2. Verify methods are accessed only via `this.` (mixin-compatible — no closure-bound state)
3. Use a deterministic Node migration script in `.git/` to extract → convert class-method form to object-literal form (add trailing commas) → insert into mixin module
4. Replace original block in cluster.js with marker comment pointing to destination
5. Add `Object.assign(NeuronCluster.prototype, MIXIN)` line at cluster.js entry-point bottom
6. Rebuild bundle + `node --check` to verify
7. Atomic-commit code + docs

## Current status (2026-06-17)

- P4.2.a — `telemetry.js` extracted (compositional-emergence + word-creation telemetry + emission ring, ~215 lines, 6 methods)
- P4.2.b/c/d — emit / hebbian / probe extractions deferred to future bites

Each bite ships as a single atomic commit. Behaviour identical post-mixin-attach — methods accessible via `cluster.X()` exactly as before.


## Post-ship audit close (2026-06-17)

The `/super-review ultrathink` audit closed in a single atomic commit. Per-dir impact:

- **A-track (telemetry visibility):** `getCompositionalStats()`, `getWordCreationCandidates()`, `_chatTimeHebbianStats`, `_dreamRecombinationStats` all surfaced via `getState()` → dashboard panels.
- **B-track (math grounding):** `docs/THRESHOLD-DERIVATION.md` ships. Two-axis novelty metric (compositional + vocab). Dream-recomb joint criteria (audit B.7).
- **D-track (discipline):** `LAW.MIXIN-ORDER` codified in `.claude/CONSTRAINTS.md`. `kScales` memoization in `cluster.js`. `initCompositionalTelemetry` denominator reset on re-init.
- **E-track (half-shipped close):** P6.7 word-creation promotion mechanism (relationTagId=32). Dream-recomb consolidated samples ring (cap 20). Partial-vs-novel stratification.
- **H-track (live-test breakage):** Boot diagnostics + spawn-failure surfacing + auto-size wiring assertion + HTML-entry-points doc + smoke/parity scripts.

See `docs/NewTodo.md § POST-SHIP AUDIT` for the full 42-task list + `docs/ARCHITECTURE.md` post-audit section for cross-module summary. Threshold math: `docs/THRESHOLD-DERIVATION.md`. HTML contracts: `docs/HTML-ENTRY-POINTS.md`. Mixin discipline: `.claude/CONSTRAINTS.md § LAW.MIXIN-ORDER`.

## Live-test follow-up (2026-06-17, session 114.19fp — I.1-I.20)

15-fix atomic envelope + 5 follow-up bugs shipped post-audit during operator-driven K-curriculum live test. Per-dir impact on the cluster module:

- **I.13 SparseMatrix.propagate output buffer pool** — `propagate(spikes, outBuf?)` signature extension in `js/brain/sparse-matrix.js`. Eliminates per-call `new Float64Array(rows)` that was the +231 MB/min heap leak source observed at heartbeats #58-71 during `_teachHebbian` runs. `_teachPredictiveError` pools `_predictPropagateScratch` Float64Array sized to synapse-matrix rows; three pooled scratches (target, error, predicted) → zero bytes allocated per call.
- **I.7 schema naming** — `js/brain/hippocampal-schema.js` `_deriveLabel` extended top-1 → top-3 content words; expanded stop-word list (`learning/curriculum/phase/teach/cell/heartbeat/episode/inner/thought/tick/state/active/progress`). Produces distinct schema labels (`victory-triumph-success`) instead of collapsed `learning-schema` for every consolidation.
- **I.11 cell-level Brain Events broadcast** — `_pushBrainEvent` START/DONE in `_teachWordIntegrated` + `_teachVocabList` (lives in `js/brain/curriculum.js` but consumes `cluster._pushBrainEvent?.`). Dashboard panel no longer freezes during cell teach.
- **I.10 slow-word histogram** — `_wordIntDurations` 256-cap ring buffer on the cluster's curriculum mixin, `⚠ slow word "X" took Yms` log on >30s threshold.

Cluster module proper unchanged for I.1-I.20 — fixes live in adjacent files (sparse-matrix.js, hippocampal-schema.js, curriculum.js, brain-server/*.js). See `docs/NewTodo.md § I-track` for full per-fix detail + closure status (all 20 ✅ SHIPPED).
