# 🛠️ HANDOFF → Sponge: kill the single-primary bottleneck — equal, capacity-weighted donor work-sharing

**Filed by:** Unity (coding agent) · **Date:** 2026-06-28
**Branch context:** `feature/distributed-donor-work-sharing`
**Directive (operator, verbatim intent):** *"there should be no primary, all are equal."* Live symptom: a donor throttled to **10%** with a 5.5s RTT is acting as PRIMARY and showing throughput, while a **70%**-donated, 77ms, 17.6 Gn/s donor shows **0 Gn/s** (idle). The strong/fast node is wasted behind the weak/laggy one.

---

## ROOT CAUSE — verified against code (file:line)

### 1. The main per-tick compute runs on ONE primary only
The brain's heartbeat `compute_batch` (the single-stream tick that drives the curriculum walk) is dispatched to `this._gpuClient` — the single primary — NOT across the pool:
- `server/brain-server.js:2536, 2599, 3123, 3145, 3173` — every main dispatch is `this._gpuClient.send(...)`.
- Confirmed by the comment at `server/brain-server.js:6824`: *"single-stream compute targets brain._gpuClient (the primary) — unchanged."*
- `server/brain-server.js:3453` — *"server sends ONE compute_batch message per tick"* → one target.

So whoever is **primary does ALL the main compute**; every other donor is a replica that the main tick never touches.

### 2. Primary is chosen by VRAM only — not speed, latency, throughput, or donation %
- `server/brain-server/gpu.js:683 _donorStrength(ws)` → returns **`gpuVramMB`** and nothing else.
- `server/brain-server.js:6859-6865` — a newcomer only steals primary if `_donorStrength(newcomer) > _donorStrength(currentPrimary)` (i.e. bigger VRAM). First donor becomes primary by default (`!havePrimary`, `:6863`).
- Result: a 10%-throttled, high-VRAM, high-latency card **wins/keeps primary** over a 70%-donated, low-latency, high-throughput card. The throttle %, the 5.5s RTT, and the actual 17.6 Gn/s are all **ignored** in the choice.

### 3. Replicas only get a thin slice of work, flat round-robin, reads off by default
- DF.7 fan-out (`gpu.js:664 _df7Fanout`, default ON) spreads only the **parallelizable WRITE passes** (per-word definition binding, academic stories, association-pair Hebbian, bound-Hebbian teach) across the pool via `_gpuParallelMap` (`gpu.js:727`) / `_nextPoolDonor` (`gpu.js:645`).
- **READ/propagate fan-out is OFF by default** (`gpu.js:677 _df7FanoutPropagate`, `DREAM_DF7_FANOUT_PROPAGATE=1` to enable) — for safety, so gate/emission reads don't hit a stale replica. So during the main tick + gate probes, replicas do **nothing**.
- `_nextPoolDonor` (`gpu.js:645-650`) and `_gpuParallelMap` (`gpu.js:731-737`) use **FLAT round-robin** (`idx % donors.length`) — every donor gets an EQUAL count of items regardless of speed. A slow/laggy donor gets the same load as a fast one → it becomes the **barrier** (the `Promise.all` at `gpu.js:731` waits for the slowest).

### 4. Net effect
The single strong/fast donor sits idle (0 Gn/s) because the main stream pins to a VRAM-chosen primary; even the fan-out work it *does* get is flat-shared with a 5.5s node that bottlenecks the `Promise.all`. Donation % is a client-side self-throttle the **server never reads** for load-balancing.

---

## THE FIX — make donors equal *by real capacity* (the operator's "no primary, all equal")

> **Honest engineering note up front:** the main per-tick stream is a *sequential dependency* (tick N needs tick N-1's state). Truly splitting ONE tick across GPUs = **model-parallel sharding** of the neuron space — a big rewrite with per-tick cross-GPU sync that's latency-bound by the slowest link + interconnect. That is the wrong first move. The real-world win — nobody idle, nobody bottlenecking, contribution ∝ what you donated — comes from F1–F5 below without sharding. If true per-tick sharding is wanted later, scope it as its own project.

### F1 — primary by composite LIVE score, not VRAM (`gpu.js:683 _donorStrength` + `:690 _strongestLiveDonor`)
Replace VRAM-only strength with a health-weighted score, e.g.:
```
score = throughputGnPerSec * donationFrac           // actual useful output
        * healthPenalty(rttMs)                       // 1.0 if rtt<200, →0 as rtt→/>1000
        * (vramMB >= minToHoldReplica ? 1 : 0)       // must be able to hold the brain
```
- Pull `rttMs` (already tracked, `state.js:639/650`) and the donor's reported donation % into the donor record at `gpu_register` (`brain-server.js:6834` already captures `vramMB`; add `donationPct`).
- `_strongestLiveDonor` then returns the **fastest healthy** donor → the 70%/77ms/17.6 Gn/s card becomes primary, the 10%/5.5s card does not.

### F2 — unhealthy donors are NOT primary-eligible and NEVER the barrier
- Exclude any donor with `rttMs > 1000` (the same threshold the dashboard already flags red, `state.js:659`) from primary eligibility.
- In `_nextPoolDonor`/`_gpuParallelMap`, **skip or heavily down-weight** RTT>1000ms donors so a 5.5s node gets a sliver (or nothing) instead of an equal share that stalls the `Promise.all`.

### F3 — weighted distribution, not flat round-robin (`gpu.js:645 _nextPoolDonor`, `:727 _gpuParallelMap`)
Replace `idx % donors.length` with a **capacity-weighted** split: each donor's share ∝ its score from F1. A 70% fast donor carries the bulk; a 10% slow one carries a fraction. Implementation: build a weighted bucket list, or assign items proportional to normalized scores. The `Promise.all` then finishes near the *fastest* aggregate instead of waiting on the slowest equal-share.

### F4 — re-evaluate primary periodically, not just on connect/disconnect
Today primary only changes on register (`:6859`) or failover (`:7145`). Add a periodic check (piggyback the DF.7 rebroadcast timer, `brain-server.js:5058-5070`): if a healthier donor is available, hand off primary (re-arm cortex upload via `_rearmCortexGpuUpload`). So when a strong donor joins/recovers, it takes the main stream.

### F5 — server honors donation % + fan reads once sync is proven
- Weight assigned work by the donor's stated **donation %** (server-side), so a 10% donor isn't handed a full share it'll duty-cycle through slowly.
- Once replica weight-sync is verified healthy on the live pool, flip `DREAM_DF7_FANOUT_PROPAGATE=1` so READS (gate/emission) also spread — otherwise replicas stay idle during the read-heavy gate phases.

### F6 — leaderboard/telemetry reflect ACTUAL contributed throughput
Rank donors by real `gneuronsPerSec` contributed (`chat.js:637-661` pool telemetry), so a 10% idle primary can't sit above a 70% worker. After F1–F4 land, the worker is actually contributing, so the ranking self-corrects — but verify the sort key is throughput, not VRAM/first-connect.

### Rollback
Everything stays behind `DREAM_DF7_FANOUT` — `DREAM_DF7_FANOUT=0` reverts to single-primary. CPU CSR remains the authoritative Hebbian master (`gpu.js:661`), so no replica batch can corrupt training; no weight-format/restart-contract change.

---

## VALIDATION (needs the LIVE multi-donor pool — can't test headless)
With three donors connected (operator + Sponge + Mills):
- Every donor shows **> 0 Gn/s** (no idle strong cards).
- Primary = the **fastest healthy** donor (low RTT, high Gn/s), not the biggest-VRAM or first-connect.
- The 5.5s-RTT donor gets a **small** share and never stalls the walk.
- Aggregate Gn/s ≈ sum of donors' weighted contributions, not pinned to one.

---

## ⚠ AFTER THE UPDATES + FIXES — DO A FRESH-START WALK, NO SAVED WEIGHTS
Once the work-sharing fixes (and the cell-pass fix already on main) are deployed, **start the curriculum over from scratch — fresh, no resumed/saved weights.** A resume would pick up the old desynced state (grades advanced past K with empty `passedCells`) and won't validate the fixes.

Fresh walk = clear state so `autoClearStaleState()` wipes at boot:
1. Remove `Environment=DREAM_KEEP_STATE=1` from the unit → `sudo systemctl daemon-reload` → `sudo systemctl restart unity-brain`.
   - This wipes brain-weights v0–v4 (.json+.bin) + conversations.json + episodic-memory.db* (excludes identity-core.json) — `server/brain-server.js:609,714,720-740`.
2. Confirm a clean pre-K start in the log: `CELL START ela/pre-K` → `🎓 CELL COMPLETE …`, `passedCells` climbing from 0 in grade order.

Full deploy+fresh-walk steps: **`docs/SPONGE-FRESH-WALK-DEPLOY.md`**.
Speech (`sem_to_motor` saturation) is still separate + donor-GPU-gated: **`docs/SPONGE-SEM-MOTOR-SATURATION-HANDOFF.md`**.

---

## TL;DR
1. Main tick pins to ONE primary; primary chosen by **VRAM only** → a 10%/5.5s big card hogs it while a 70%/77ms card idles at 0 Gn/s.
2. Fix: score donors by **throughput × donation% × RTT-health** (`gpu.js:683`), pick primary = fastest healthy (`:690`), **weight** the fan-out share by capacity (`:645`, `:727`), exclude RTT>1000ms from primary + barrier, re-check primary periodically, honor donation% server-side.
3. Don't model-parallel-shard the single tick now (latency trap) — F1–F5 give the real win.
4. **After deploying: fresh-start walk, NO saved weights** (clear `DREAM_KEEP_STATE`, let `autoClearStaleState` wipe) — see `SPONGE-FRESH-WALK-DEPLOY.md`.
5. Rollback: `DREAM_DF7_FANOUT=0`.
