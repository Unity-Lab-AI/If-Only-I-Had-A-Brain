---
name: project_df7_data_parallel_delta_merge
description: DF.7 massive-parallel compute architecture — Gee chose data-parallel replica + Hebbian-delta merge over sharding
metadata: 
  node_type: memory
  type: project
  originSessionId: 942805ab-02fc-4f52-a2a7-252f4006322e
---

Gee 2026-06-20 chose **data-parallel + Hebbian-delta merge** for DF.7 (the "all donor GPUs training at the same time" engine), over model-parallel sharding and hybrid shard+batch.

**The chosen architecture:** each donor GPU holds a FULL brain replica + trains on a different slice of the curriculum/experience stream; the server periodically (every N ticks, NOT per-tick) merges their Hebbian weight-deltas into the shared master, then re-broadcasts the merged master to all donors.

**Why (the reasoning that won):** the deployed bootstrap brain is ~6M neurons → FITS in one donor's VRAM (replicas are viable). Donors talk over browser WebSocket = high latency + can drop anytime → per-tick cross-GPU exchange (sharding) is brutal at 10Hz and fragile. Data-parallel scales near-linearly with donor count, tolerates disconnects (lose a replica, not the brain), and works WITH WS latency by merging every N ticks. Trade-off accepted: replicas drift between merges → need a delta-reconcile pass.

**Build context:** current model uses ONE primary donor at a time (PA.4.3 pool: primary computes, standbys idle) in `server/brain-server/gpu.js` (SERVER_GPU_MIXIN — `_gpuStep`/`_gpuBatch`/`_sparseSend`/`_sparseSendBinary` target `this._gpuClient`). DF.7 supersedes single-primary as the compute model. Pairs with [[feedback_no_fallbacks_law]] (single correct architecture). DF.6 e2e deployed-smoke is blocked on DF.7 + the operator's one-time `deploy/bootstrap-backend.sh`.

**Gee clarification 1 (2026-06-20):** the critical-mass auto-relearn must be gated WITH A BUFFER (dead-zone) + admin-controllable — *"controllable in admin with toggle and setting sliders for dead zone of available compute so that it doesnt try to relearn the second it hits a gate of available users compute connected so that any one person disconnecting doesnt downgrade the brains fucntioning"*. BUILT: `_getAutoScaleSettings`/`_setAutoScaleSettings` (enabled toggle + bufferPct dead-zone + stabilityMin + minDonorsFloor, persisted to `server/autoscale-settings.json`); `_recomputeCommunityCompute` applies buffered upgrade-tier hysteresis + is strictly up-only (down-protection: a donor leaving never downgrades a running brain, only cancels a not-yet-fired pending upgrade); `_maybeExecuteMilestoneResize` honors the toggle + configurable hold window. Admin REST `/autoscale` GET/POST + `autoScaleChanged` WS broadcast + dashboard admin panel (toggle + 2 sliders + live donor/VRAM/tier telemetry).

**Gee clarification 2 (2026-06-20):** it's NOT just training — *"when Unity thinks and speaks and builds ui and generates images all of it is controlled by the compute of users"*. ALL runtime cognition runs on donor compute, every tick. ARCHITECTURE REALITY to hold honest: data-parallel replicas scale CONCURRENT/throughput work (many users, parallel training passes, image-gen) and give redundancy — but a SINGLE sequential cognition stream (one user's live think→speak) can't be split across GPUs without sharding (which Gee rejected for latency). So "all donor compute powers everything" = true for throughput/concurrency/training, with one live thought-stream running on one replica at a time. The FULL engine (every donor a full brain replica; tick loop + emission made replica-aware; concurrent cognition + training distributed; periodic Hebbian-delta merge) is a major multi-stage build that can ONLY be validated on deployed real donor GPUs (DF.6) — built the gating controls + the pool fan-out FOUNDATION (`_livePoolDonors`/`_nextPoolDonor`/`_gpuParallelMap` + target-parameterized `_sparseSend`) so far.
