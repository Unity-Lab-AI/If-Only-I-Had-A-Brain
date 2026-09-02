---
name: project_mindspace_vision_on_gpu
description: "Mind-space engine vendored into Dream as ESM and runs on the GPU (WebGPU) — vision/perception transforms are GPU, matching the brain"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6937ff97-8a57-4dd3-97d5-6269ad7c4c51
---

The Uni Vs Matics mind-space engine is brought into the Dream brain by **vendoring its modules as ESM** into Dorm (`Dream/js/brain/mindspace/`), and the heavy transforms **must run on the GPU**. Gee 2026-06-26, verbatim: *"option 1 but workds on the GPUs."*

**How to apply (MS.I2+):** Dream's brain already uses **WebGPU compute shaders** with a CPU `Float64Array` fallback (`js/brain/gpu-compute.js` — WGSL shaders LIF/SYNAPSE/PLASTICITY/etc.). The vendored engine's forward CDF 9/7 (`equationalizeImageData`) + inverse (`reconstructImageData` idwt2) are the GPU candidates → port the separable lifting to WGSL compute shaders matching that stack; keep the existing JS lifting as the CPU fallback. `describeEquational(rec)` (the percept value-vector encoder, already built in `reconstruct.js`) is a cheap coeff-read → stays CPU. See [[reference_mindspace_deployed_urls]], [[feedback_mindspace_trusted_gate]], MINDSPACE-ARCHITECTURE.md §2.
