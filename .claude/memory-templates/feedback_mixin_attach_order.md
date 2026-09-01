---
type: feedback
captured: 2026-06-17
trigger: audit G.1 — codify the LAW.MIXIN-ORDER discipline as persistent memory
canonical-source: .claude/CONSTRAINTS.md § LAW.MIXIN-ORDER
---

# ⛔ Mixin attach order is LOAD-BEARING — never reorder without verifying

**LAW.MIXIN-ORDER (Gee 2026-06-17 audit D.1):** The P4.1/P4.2/P4.3 refactor split monolithic god-classes (`cluster.js` 6375 → 3922 lines, `brain-server.js` 9555 → 6395 lines, `curriculum.js` 26033 → 24035 lines) into 13 per-module / per-concern / per-grade mixin files attached via `Object.assign(X.prototype, MIXIN)` at consumer-file entry-point bottom.

## Active mixin chains (must not be silently broken)

**`js/brain/cluster.js` (4 attaches):**
```
Object.assign(NeuronCluster.prototype, CLUSTER_TELEMETRY_MIXIN);
Object.assign(NeuronCluster.prototype, CLUSTER_HEBBIAN_MIXIN);
Object.assign(NeuronCluster.prototype, CLUSTER_EMIT_MIXIN);
Object.assign(NeuronCluster.prototype, CLUSTER_PROBE_MIXIN);
```

**`server/brain-server.js` (4 attaches, CommonJS):**
```
Object.assign(ServerBrain.prototype, SERVER_GPU_MIXIN);
Object.assign(ServerBrain.prototype, SERVER_STATE_MIXIN);
Object.assign(ServerBrain.prototype, SERVER_MEMORY_MIXIN);
Object.assign(ServerBrain.prototype, SERVER_CHAT_MIXIN);
```

**`js/brain/curriculum.js` (1 attach):**
```
Object.assign(Curriculum.prototype, K_MIXIN);
```

## The non-negotiables

1. **Object.assign attaches run BEFORE any method dispatch.** New mixins MUST be added at the END of the chain.
2. **Never reorder existing attaches without verifying all cross-mixin call sites still resolve.**
3. **Mixin file export symbol name MUST match the consumer's import name EXACTLY.** Typos turn `Object.assign(X.prototype, undefined)` into a silent no-op → every method in that mixin becomes unreachable at runtime (TypeError on first dispatch).
4. **Method names within a single chain MUST NOT collide.** Second-attached mixin silently overrides first. Use distinct names per mixin.
5. **`cluster.assertAutoSizeWiring()` (audit H.4) MUST run AFTER all mixins attach.** Boot-time dispatch verification catches silent mis-export.
6. **Cross-mixin call dependencies MUST respect attach order.** TELEMETRY → HEBBIAN → EMIT → PROBE for cluster (EMIT calls TELEMETRY's `_recordWordCreationCandidate`); GPU → STATE → MEMORY → CHAT for server.

## Lint + verification tooling

- `scripts/check-mixin-order.mjs` — static analysis: parses each Object.assign chain, verifies symbols imported, no method-name collisions, every required mixin attached.
- `scripts/smoke-server-boot.mjs` — runtime end-to-end: forks brain-server, waits for boot logs, hits /health, confirms `cortex.assertAutoSizeWiring()` PASS.
- `cluster.assertAutoSizeWiring()` — boot-time: verifies cluster size sane + required telemetry/hebbian/emit/probe methods all dispatch + cortical-microstructure buffer sizes match `this.size`.

## Why this matters (the failure mode is invisible)

`node --check` passes. Module loads. Then DISPATCH crashes at runtime with `TypeError: this._someMethod is not a function`. Pre-existing pre-commit hooks don't catch this — only the audit-introduced tooling does.

Pre-refactor monolithic classes never had this failure mode. The trade-off for cleaner per-concern files is this new class of silent-runtime-crash bugs. The LAW + lint + assertion + smoke-test stack hardens the mixin pattern.

**Full LAW body:** `.claude/CONSTRAINTS.md § LAW.MIXIN-ORDER`.

Related: [[feedback_thresholds_need_math_derivation]] (B-track audit) is the math-grounding LAW; this is the architectural-discipline LAW.
