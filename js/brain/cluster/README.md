# `js/brain/cluster/` — per-module split of cluster.js

Per the per-module split directive — break the 6,374-line cluster.js god-class into focused modules attached to `NeuronCluster.prototype` via `Object.assign` mixin pattern (same approach as `js/brain/curriculum/` per-grade split).

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
  └── probe.js          (computePhi, getTrainedCapability,
                         diagnoseReadoutForEmbedding, working-memory
                         readout — deferred to later bite)
```

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
