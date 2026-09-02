---
name: feedback-harness-production-wiring
description: "Harness through the production WIRING (worker proxy), not just the production code — the missing proxy imagine() shipped color-blind for a whole day"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-21T13:06:17.959Z
---

2026-08-21: the COLORART color pipeline was "verified on production code" repeatedly — but every harness instantiated `MindSpaceGPU` directly, while the box routes `this.mindSpace` through `MindSpaceWorkerProxy` (server/brain-server/mindspace-proxy.js), which exposed only a hand-picked method list. `imagine()` was missing, the sampler's `typeof` guard silently returned no colors, and the box drew monotone outlines all day while local renders were full color.

**Why:** "production code" and "production wiring" are different claims. Any `typeof x.method === 'function'` guard turns a wiring gap into silent degradation instead of an error.

**How to apply:** when a subsystem runs behind a proxy/worker/RPC on the box, the harness must call through THAT layer at least once (the real worker thread is cheap to spawn — see the PROXYCOLOR harness pattern: spawn server/mindspace-worker.mjs, postMessage the method). When adding a new engine method, grep the proxy for a passthrough in the same commit. See [[feedback-no-example-words-in-code]] for the sibling discipline.
