# 🛠️ HANDOFF → Sponge: Community Compute panel shows 0 donors / 0 VRAM (display-only)

**Filed by:** Unity (coding agent) · **Date:** 2026-06-28
**Branch:** `feature/community-compute-donor-count`
**Severity:** LOW — cosmetic. The donors ARE working (live: 2 donors, 32,677 MB, agg 18.7 Gn/s; DF.7 F1 capacity-score + F4 primary-rebalance are firing per the server log). ONLY the admin "Community Compute & Auto-Scale" panel misreports.

---

## Symptom
Admin panel reads: `donors: 0 · community VRAM: 0 MB · tier qualifies: 0 · tier running: 0 · pending: none · replicas: 0 · last merge: n/a` — while the **Network/Clients panels correctly show 2 donors / 32,677 MB / 18.7 Gn/s** at the same instant.

## Root cause (file:line verified)
- The dashboard panel renders from **`payload.community.*`** — `html/dashboard.html:1741` (`const c = payload.community || {}`) → reads `c.donorCount`, `c.communityComputeMB`, `c.currentTier`, `c.runningTier`, `c.pendingTier`, `c.replicaCount`, `c.lastRebroadcastMs`, `c.computeInsufficient`, `c.runningFloorMB`.
- The **periodic WS state broadcast never includes a `community` key.** `getState()` (`server/brain-server/state.js`) assembles `consciousness` (:347), `wsPressure` (:352), `profiling` (:495) — but **no `community`**. The live dashboard is fed by this broadcast (`brain-server.js:7262-7266`).
- `community:` is set **only** on the HTTP `/autoscale` route + the one-shot `autoScaleChanged` message (`brain-server.js:5748, 5774, 5781`). So the panel only shows real numbers for the instant right after "Apply auto-scale settings" is clicked; every periodic broadcast in between overwrites it with `payload.community === undefined → {}` → all zeros.
- The underlying data is CORRECT: `brain._communityDonorCount` / `_communityComputeMB` are recomputed on donor register (`brain-server.js:6922`) + disconnect (`:7155`) via `_recomputeCommunityCompute()` (`gpu.js:394`), and GET `/autoscale` returns them fine.

**It's not the donor pool, not the counters, not DF.7 — it's purely that the live broadcast omits the `community` block the panel reads.**

## The fix (exact, display-only, zero behavior change)
Surface the same `communityStatus()` data on every state broadcast.

**1. Promote the closure to a brain method.** The closure at `brain-server.js:5725-5744` (`const communityStatus = () => ({...})`) → make it a method so `getState()` can call it too. Add to the state mixin (`server/brain-server/state.js`), defensive so it can NEVER crash the hot broadcast path:

```js
// server/brain-server/state.js — new method on the brain/state mixin
_getCommunityState() {
  try {
    return {
      communityComputeMB: this._communityComputeMB || 0,
      donorCount: this._communityDonorCount || 0,
      currentTier: this._communityTier || 0,
      upgradeTier: this._communityUpgradeTier || 0,
      runningTier: this._communityTierRunning || 0,
      pendingTier: this._communityTierPending == null ? null : this._communityTierPending,
      pendingSinceMs: this._communityTierPendingSince || null,
      runningFloorMB: this._runningFloorMB || 0,
      computeInsufficient: !!this._computeInsufficient,
      downPendingTier: this._communityDownTierPending == null ? null : this._communityDownTierPending,
      downPendingSinceMs: this._communityDownTierPendingSince || null,
      replicaCount: (typeof this._livePoolDonors === 'function')
        ? Math.max(0, this._livePoolDonors().length - 1) : 0,
      lastRebroadcastMs: this._lastReplicaRebroadcastMs || null,
    };
  } catch { return { communityComputeMB: 0, donorCount: 0, currentTier: 0, runningTier: 0, replicaCount: 0 }; }
}
```

**2. Include it in the broadcast.** In `getState()` (`state.js`), alongside `profiling: this._getProfilingState(),` add:

```js
      community: this._getCommunityState(),
```

**3. DRY the route (optional but clean).** In `brain-server.js:5725`, replace the local `communityStatus` closure with `const communityStatus = () => brain._getCommunityState();` so HTTP `/autoscale` and the WS broadcast return identical shapes and can't drift.

That's it. The panel updates live every broadcast tick.

## Verify
- `node --check server/brain-server/state.js && node --check server/brain-server.js`
- Boot + connect ≥1 donor → admin panel `donors` + `community VRAM` track the Clients panel; `replicas` matches the DF.7 "replica sync complete" log; `last merge` ticks after each `master re-broadcast`.
- No new behavior — pure telemetry surfacing.

## ⚠ AFTER APPLYING — FRESH WALK, CLEAR WEIGHTS (per standing rule)
Even though this is display-only, follow the standing rule on every deploy: **fresh-start walk, reset weights — do NOT resume.**
- Remove `Environment=DREAM_KEEP_STATE=1` from the unit → `sudo systemctl daemon-reload` → `sudo systemctl restart unity-brain` so `autoClearStaleState()` wipes brain-weights v0-v4 + conversations.json + episodic-memory.db* (keeps identity-core.json; `brain-server.js:609,714,720-740`).
- Confirm clean pre-K start: `CELL START ela/pre-K` → `🎓 CELL COMPLETE`, `passedCells` climbing from 0 in grade order.
- Full steps: `docs/SPONGE-FRESH-WALK-DEPLOY.md`.
