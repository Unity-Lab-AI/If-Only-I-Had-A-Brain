---
name: reference_deploy_server_specs
description: "The backend deploy box (Sponge's server) — CPU-only Xeon-E, 32GB RAM, no GPU; it's the coordinator, donors are the compute."
metadata: 
  node_type: memory
  type: reference
  originSessionId: b3a4501d-3771-4900-9c0f-b8aed5d85d71
---

Backend/coordinator server for the deployed brain (git + brain-server + nginx pages), confirmed by Sponge 2026-06-27:

- **Host:** `ns1008282.ip-135-148-100.us` (SYS-3)
- **CPU:** Intel Xeon-E 2288G — 8 cores / 16 threads, 3.7→5.0 GHz
- **RAM:** 32 GB ECC 2666 MHz
- **OS:** Debian 13 (Trixie)
- **Disk:** 2×960 GB NVMe, soft RAID
- **GPU:** NONE — CPU-only box

**Why this matters (architecture-constraining):**
- The box is the **coordinator**, NOT a compute node. It holds the authoritative CPU CSR master brain in RAM and hands all heavy matmuls to **donor browser GPUs** (the DF.7 data-parallel-replica design — see [[project_df7_data_parallel_delta_merge]]).
- **32 GB RAM is the hard ceiling on master neuron count** (~24-26 GB usable after Debian+Forgejo+nginx). The auto-scale tier ladder must respect THIS box's RAM, not just donor VRAM.
- **Zero donors = zero (fast) compute** — no local GPU fallback. `minDonorsFloor` + dead-zone gating are survival-critical, not nice-to-haves.
- The `DREAM_INNERVOICE_MAX_NEURONS` inner-voice CPU-tick gate (`server/brain-server/chat.js`) is **mandatory** here: without it `think()` blocks the Node event loop ~57s/tick at biological scale on this no-GPU 16-thread box and stalls the `/ws` handshake so donors can't connect.

Related deploy URLs: [[reference_mindspace_deployed_urls]].
