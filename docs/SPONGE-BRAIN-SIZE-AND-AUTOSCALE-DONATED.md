# 🛠️ HANDOFF → Sponge: brain stuck ~4GB + auto-scale uses MAX card VRAM, not DONATED amount (server)

**Filed by:** Unity (coding agent) · **Date:** 2026-06-28
**Branch:** `feature/community-compute-donor-count`
**Two server-side scaling bugs, same neighborhood.** Both are about how the brain decides its SIZE vs what donors actually contribute.

---

## ✅ RESOLVED 2026-06-28 (donor-app v0.3.4 + server)

- **ISSUE 1 — working as designed, documented.** The ~4GB cap is `DREAM_DONOR_FIT_MB=4096`, a deliberate donor-fit budget (so one modest donor holds a full data-parallel replica), NOT a WebGPU/binary limit. To go bigger: bump `DREAM_BRAIN_BUDGET_MB` on the unit (then every donor must hold it), or let the now-fixed auto-scale grow it. No code change.
- **ISSUE 2 — confirmed bug FIXED (3-part + caveat):**
  - **ASCALE.1** `donor-app` (`protocol.rs` + `donor.rs`) — `gpu_register` now sends `utilizationPct` (avg of per-GPU donation duty-cycles) + `donatedMB` (explicit `--memory` cap, 0 = unset).
  - **ASCALE.2** `server/brain-server.js` — captures `client.utilizationPct` (clamp 0–100, default 100) + `client.donatedMB` at register.
  - **ASCALE.3** `server/brain-server/gpu.js` `_recomputeCommunityCompute` — community total now sums **effective donated** capacity: `eff = donatedMB>0 ? min(donatedMB, fullVram) : fullVram × util/100`. Two 15GB cards at 60% → **18GB**, not 30GB → no false tier-up.
  - **ASCALE.4 (caveat honored)** — tracks `_communityMinDonorMB` (smallest donor's effective committed VRAM = the real data-parallel SIZE bound) and logs it in the milestone-candidate line + exposes it in `/autoscale` community state. The tiers still gate on the (now effective) sum; a full **size-tier(min-donor) vs throughput-tier(Σ Gn/s)** rewire remains the flagged architectural follow-up.
- Old donors (no `utilizationPct`) default to 100% → full-card counting (prior behavior); the fix engages once donors run v0.3.4.
- Followed by the standing **fresh walk, reset weights** below.

> ⛔ The original ISSUE 1 / ISSUE 2 write-ups below are retained for the record.

---

## ISSUE 1 — donor GPU set to 90% of 16GB but only ~3.9GB is used. Is a WebGPU limit leaking into the binary?
**No. It's a deliberate server-side budget, not a WebGPU/HTML/binary cap.**

- The brain boots to a **donor-fit budget of 4096MB** in deployed mode: `server/brain-server.js:391-393` → `_donorFitDefaultMB = Number(process.env.DREAM_DONOR_FIT_MB) > 0 ? … : 4096`, applied when `UAL_PROXY_AUTH === '1'` (`:388-396`).
- Then `brainBudgetMB = vramMB − osReserveMB = 4096 − 2048 = 2048MB` (`:408`, `osReserveMB` default 2048 at `:407`). That's the *"1024MB = 50% of 2048MB brain budget"* in your boot log. → ~51M neurons.
- **No `maxStorageBufferBindingSize` / `maxBufferSize` / 256MB / 2GB WebGPU constant touches this path.** The 4GB is `DREAM_DONOR_FIT_MB`, full stop.

**Why it's intentional (the #112.2 comment, `brain-server.js:380-390`):** DF.7 is **data-parallel** — every donor holds a **FULL brain replica**. Sizing the brain to your 16GB would force *every* donor to hold a 14GB replica + re-upload it on reconnect; a modest donor times out (2/17 matrices), falls to CPU → the all-night "never left kindergarten" failure. So it boots small enough for one modest donor and is *supposed* to grow via the DF.7 milestone tiers as the pool grows.

**So your 90%-of-16GB isn't capped — the brain is only ~4GB big, so that's all it fills.**

### To actually use the big cards (pick one)
- **Manual:** set `DREAM_DONOR_FIT_MB` (or `DREAM_BRAIN_BUDGET_MB`) bigger on the unit, e.g. `DREAM_BRAIN_BUDGET_MB=14336` → daemon-reload → restart. ⚠ Then EVERY donor must hold that replica — modest/Linux donors will fail to hold/re-upload it. Only do this if the whole pool is big cards.
- **Designed path:** let DF.7 auto-scale grow it as the pool crosses milestone tiers — **but see Issue 2, the gate is mis-counting.**
- **Architectural note (real):** for data-parallel replicas the brain SIZE is bounded by the **smallest** donor's committed VRAM (each holds the whole thing), NOT the community **sum**. The milestone tiers (`gpu.js:412-417`) gate SIZE on community **sum** — that's a throughput metric, not a size metric. A 357M-neuron tier needs EACH donor to hold 357M. Worth reconciling size-tiers (min-donor) vs throughput-tiers (sum).

---

## ISSUE 2 — auto-scale-up triggers on MAX card VRAM, not the DONATED amount that reaches the brain
**Confirmed bug.** Two 15GB cards trip a higher tier (~30GB community) even though they're each set to donate ~9GB (~18GB real).

### Root cause (file:line)
- `_recomputeCommunityCompute()` sums **full card VRAM**: `server/brain-server/gpu.js:400-401`:
  ```js
  const vram = (c && c.gpuVramMB) || 0;
  if (vram > 0) totalMB += vram;
  ```
  `gpuVramMB` is the **whole card**, captured at register: `brain-server.js:6860` → `client.gpuVramMB = Number(msg.vramMB) || 0`.
- The donor's actual donation is **`utilization_pct`** (a duty-cycle target, `donor-app/src/config.rs:32`, `cli.rs:35`, `compute.rs:672`) — and **it is NEVER sent in `gpu_register`.** The register message carries `vramMB`, `maxStorageBindingMB`, `gpuName`, `donorId`, `donorName` (`brain-server.js:6860-6885`) — **no donation/utilization field.** The server has zero knowledge of how much each donor actually gives.
- So the milestone gate (`gpu.js:412-441`, thresholds like tier 1 = `minCommunityMB: 24_000`) compares **raw card totals** against the gates → scales up on capacity the pool isn't actually contributing.

### Fix (3 parts)
1. **Donor reports its donated capacity** in `gpu_register`. At minimum send `utilizationPct` (already known donor-side: `config.rs:32`). Better: send an explicit **donated-VRAM cap** if the GUI exposes a VRAM slider (DA.x) — that's the size-relevant number. Edit `donor-app/src/donor.rs` register payload (~`:229`) to include `utilizationPct` (+ `donatedMB` if available).
2. **Server captures it** next to vramMB: `brain-server.js:6860` →
   ```js
   client.utilizationPct = Math.max(0, Math.min(100, Number(msg.utilizationPct) || 100)); // default 100 = full
   client.donatedMB = Number(msg.donatedMB) || 0; // explicit cap if the donor sends one
   ```
3. **Use effective donated capacity** in `_recomputeCommunityCompute` (`gpu.js:400-401`) for the tier decision:
   ```js
   const fullVram = (c && c.gpuVramMB) || 0;
   // effective = explicit donated cap if given, else full × utilization fraction
   const eff = (c && c.donatedMB > 0)
     ? Math.min(c.donatedMB, fullVram)
     : fullVram * (((c && c.utilizationPct) ?? 100) / 100);
   if (eff > 0) totalMB += eff;
   ```
   So two 15GB cards at 60% → 18GB community, not 30GB → no false tier-up.

   ⚠ **Caveat (ties to Issue 1):** `utilization_pct` is a **time duty-cycle** (throughput), not a VRAM commitment. A donor at 60% util still holds the FULL replica in VRAM. If the milestone tier is gating **brain SIZE** (can the pool HOLD tier N's neurons), the right number is **committed VRAM per donor** (and bounded by the MIN donor for data-parallel), not `vram × utilization`. If the tier is gating **throughput**, then `vram × utilization` (or better, live `gneuronsPerSec`) is right. Decide which the tiers mean and weight accordingly — don't conflate. Cleanest: size-tier on `min(committed donor VRAM)`, throughput-tier on `Σ gneuronsPerSec`.

### Verify
- Connect 2 donors throttled below a tier gate → community total reflects the **donated** sum, tier does NOT trip. Throttle up past the gate (held past the stability window) → it scales. `node --check` both files.

---

## After deploying EITHER fix — FRESH WALK, RESET WEIGHTS (standing rule, do NOT resume)
```
sudo systemctl edit --full unity-brain   # remove Environment=DREAM_KEEP_STATE=1
sudo systemctl daemon-reload && sudo systemctl restart unity-brain
```
`autoClearStaleState()` wipes brain-weights v0-v4 + conversations.json + episodic-memory.db* (keeps identity-core.json; `brain-server.js:609,714,720-740`). Confirm clean pre-K: `CELL START ela/pre-K` → `🎓 CELL COMPLETE`, `passedCells` climbing in grade order. Full steps: `docs/SPONGE-FRESH-WALK-DEPLOY.md`.

## TL;DR
1. **4GB cap = `DREAM_DONOR_FIT_MB=4096`** (`brain-server.js:391-393`), a deliberate donor-fit budget so one modest donor holds a full data-parallel replica — NOT a WebGPU/binary limit. Bump the env to go bigger (but then every donor must hold it), or fix the auto-scale to grow it.
2. **Auto-scale over-counts:** `_recomputeCommunityCompute` (`gpu.js:400-401`) sums **full card VRAM**; the donor's `utilization_pct` (`config.rs:32`) is never sent/captured. Send + capture it, weight community total by donated/effective capacity, and split SIZE-tier (min committed VRAM) from THROUGHPUT-tier (Σ Gn/s) for data-parallel correctness.
