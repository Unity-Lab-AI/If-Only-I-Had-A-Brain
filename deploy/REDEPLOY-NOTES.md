# REDEPLOY NOTES — for the box Claude / server admin

> Living handoff for redeploying `unity-brain` on the box after a backend change lands on `main`.
> The box is `/opt/unity-brain` (rsync-deployed — **no `.git`**), systemd unit `unity-brain`,
> shares the host with Forgejo. Brain state is preserved across restarts (`DREAM_KEEP_STATE=1`).

---

## What auto-deploys vs what needs YOU

- **Frontend (static)** — `index.html`, `html/*.html`, `js/*` (incl. the esbuild bundle `js/app.bundle.js`), `corpora/*` served to browsers — **auto-deploys** on push to `main` via `.forgejo/workflows/deploy.yml` (rsync to `/var/www/pages`). **You do nothing.**
- **Backend (Node)** — `server/**` — **NOT auto-deployed** (the pages deploy key is rrsync-locked to `/var/www/pages`). **You redeploy it manually** with the overlay below.

So: a change touching only `js/` + `html/` + `index.html` → just push to main, done. A change touching `server/**` → push to main **and** run the redeploy below.

---

## 2026-06-21 — live-bring-up fix cluster (#29–#33)

**Backend files changed (need redeploy):**
- `server/brain-server.js` — #32 cortex-upload failure surfaced to admin dashboard (no more silent CPU limp); #33 donor-socket ping/pong heartbeat (evicts half-open primaries so failover fires); #30 `gpu_telemetry` message handler; **#31 sparse-upload TIME-FALLBACK gate** — the cross-projection upload now fires on `compute_batch warmup>=20` **OR** `>=20s` since clusters confirmed, so a teach-heavy deploy that never warms the main loop still uploads the matrices (the real cause of "0 sparse matrices uploaded"; the unsafe-webgpu flag was a red herring — buffers are ~200MB, far under the 2GB cap).
- `server/brain-server/chat.js` — #30 `perf.gpuPool` donor-fleet aggregation + `perf.cortexUploadFailure` field in `_updatePerfStats`.
- `js/brain/consolidation-engine.js` — **#35 consolidation event-loop fix** (this is a server-side module despite the `js/` path — NOT in the browser bundle). At 306M the CPU replay `synapses.hebbianUpdate()` is a synchronous pass over hundreds of millions of nnz that blocks Node's event loop 30s–400s and stalls the `/ws` donor handshake (the `DREAM_CONSOLIDATION_MAX_MS` deadline can't preempt synchronous work). Fix: an nnz-size guard skips the pathological CPU replay above `DREAM_CONSOLIDATION_MAX_REPLAY_NNZ` (default 5,000,000) — GPU teach owns real Hebbian at that scale, cheap schema bookkeeping still runs — plus a hard `DREAM_CONSOLIDATION_DISABLE=1` off-switch.

**New env knobs (optional, set in the systemd unit's `Environment=` lines, comments on their OWN line):**
- `DREAM_CONSOLIDATION_MAX_REPLAY_NNZ=5000000` — skip CPU replay above this nnz (the default; `0` disables the guard / restores old always-CPU-replay behavior).
- `DREAM_CONSOLIDATION_DISABLE=1` — skip consolidation passes entirely (hard kill-switch; preferred over shrinking the brain via `DREAM_BRAIN_BUDGET_MB`).

With the #35 code fix deployed, **no env knob is required** — the default 5M guard stops the event-loop block at full brain size. The knobs are there only if you want to tune or fully disable.

### 2026-06-21 (later) — #36 Path B instrumentation + completion (keep brain FULL size — Gee: scales infinitely with donor GPUs)

Gee chose Path B over shrinking: the event loop must stay responsive at ANY brain size. This batch adds the **measure-first instrument** so we chunk the PROVEN blocker, not a guess:

- `server/brain-server.js` — **event-loop lag monitor**: a 1s sampler logs `[EventLoop] BLOCKED <ms>ms — … context: phase=… donors=… consolidationInFlight=… innerVoiceInFlight=… replicaSyncing=…` whenever a synchronous span stalls the loop (and thus the `/ws` handshake). Also surfaced to the dashboard as `perf.eventLoopLagMs`. Tunable via `DREAM_LOOP_LAG_WARN_MS` (default 250).
- `server/brain-server/chat.js` — wraps the inner-voice think tick with an `innerVoiceInFlight` flag + a slow-tick log, so the lag monitor can name it.
- `js/brain/consolidation-engine.js` — completes #35: the big `preSem` `Float64Array(cluster.size)` alloc is now ALSO skipped (not just the `hebbianUpdate`) above the nnz cap.

**👉 What we need back from you after this redeploy:** with a donor connected, watch the server console for `[EventLoop] BLOCKED` lines and **report the duration + which context flag is true** (e.g. `innerVoiceInFlight=true` vs `replicaSyncing=1` vs `phase=<x>`). That names the dominant synchronous blocker so the next batch chunks exactly that span — Path B is iterative and measurement-driven. (Consolidation can stay `DREAM_CONSOLIDATION_DISABLE=1` for now; the lag monitor will show the OTHER blocker that persists with it off.)

**Frontend files changed (auto-deploy, no action):**
- `js/brain/remote-brain.js` + rebuilt `js/app.bundle.js` — #29 public visitors connect to the public `/ws` lane (see the real scaling neuron count, not the 7k fallback).
- `html/compute.html` — #30 donor sends its own telemetry + shows "YOUR GPU".
- `html/dashboard.html` — #30 GPU card shows the donor pool + #32 upload-failure red banner.

**No systemd unit change in this cluster** → no `daemon-reload` needed, just restart.

### 2026-06-21 (later still) — #36 step 2 LANDED: inner-voice tick was the dominant blocker

The box measurement came back: with consolidation disabled, the dominant `[EventLoop] BLOCKED` spans were **56–119s** and lined up 1:1 with `[Brain] inner-voice think() took 57110ms`. So the inner-voice cortex tick is the blocker (NOT consolidation, donor-upload, or replica sync). **A GPU donor does NOT help** — verified live that `think()` still took 58s with `donors=1`; the generation path runs on the server CPU regardless of donors. Fix landed:

**Backend file changed (NEEDS REDEPLOY):**
- `server/brain-server/chat.js` — `_innerVoiceTick` now bounds the heavy `innerVoice.think()` → `languageCortex.generateAsync()` path (which drives `cluster.step()`/`emitWordDirect()` = synchronous main-cortex propagation on the host CPU CSR shadow) by **cortex neuron count**. At ~61M cortex neurons one tick blocked the loop ~57s, stalling the `/ws` handshake so donors couldn't connect. Now, when the MAIN cortex (`clusters.cortex.size` — 61M at scale; `cortexCluster` itself is the dense ~323K language cortex) exceeds `DREAM_INNERVOICE_MAX_NEURONS` (default 2,000,000), the tick emits the cheap trained-vocab showcase instead (`_sampleCurrentSentence({allowCompose:false})` — pure bucket sample, never `composeSentence`'s brain-ticks), keeping popups alive AND the loop free for donors to connect + compute. Mirrors the #35 nnz-guard idiom; brain stays FULL size. Small brains (cortex ≤ threshold) still do full equational generation.

**New env knobs (optional, comment on their OWN line in the unit):**
- `DREAM_INNERVOICE_MAX_NEURONS=2000000` — above this cortex neuron count, the inner-voice tick uses the cheap showcase instead of the loop-blocking CPU generation (the default; raise it only if the cortex tick becomes loop-safe, e.g. genuinely GPU-dispatched).
- `DREAM_INNERVOICE_FORCE_CPU=1` — force full CPU inner-voice generation regardless of cortex size (small local brains, or once generation is GPU-dispatched). Default off.

**No systemd unit change** → no `daemon-reload`, just the overlay + restart below. (`DREAM_CONSOLIDATION_DISABLE=1` can stay set; this fix is independent of consolidation.)

### Copy-paste redeploy (run on the box, from a fresh clone of the repo)

```bash
# 1. Pull the latest main into a working clone (NOT /opt/unity-brain — that has no .git)
cd ~/unity-brain-src 2>/dev/null || git clone git@git.unityailab.com:UnityAILab/If-Only-I-Had-A-Brain.git ~/unity-brain-src && cd ~/unity-brain-src
git fetch origin && git checkout main && git pull --ff-only

# 2. Overlay the tracked tree onto the live dir (preserves untracked runtime
#    state: brain-weights.bin, episodic-memory.db, *.json caches, identity-core.json)
git archive HEAD | sudo tar -x -C /opt/unity-brain

# 3. Restart (state preserved via DREAM_KEEP_STATE=1; no unit change → no daemon-reload)
sudo systemctl restart unity-brain

# 4. Confirm it came back up
sleep 3 && sudo systemctl status unity-brain --no-pager | head -20
```

If a future change DOES edit `deploy/unity-brain.service`, add `sudo cp deploy/unity-brain.service /etc/systemd/system/ && sudo systemctl daemon-reload` before the restart. (Reminder: systemd has **no inline comments** — comments on their own line only, or the directive is silently ignored.)

### Verify after restart (read-only, off-box is fine)

```bash
H="https://if-only-i-had-a-brain.git.unityailab.com"; AUTH="Gee:<password>"
# donor pool + replica telemetry
curl -sS -m15 -u "$AUTH" "$H/admin/autoscale" | grep -oE '"donorCount":[0-9]+|"replicaCount":[0-9]+|"communityComputeMB":[0-9]+'
```

Then on the admin dashboard, with a donor connected:
- **GPU card** should show **DONOR GPUs: N** (pooled VRAM + per-donor throughput) instead of the old `none / 0MB`.
- The Server Console should show `Sparse language-cortex upload starting — trigger=...` within ~20s of a donor connecting (either `compute_batch warm` or `TIME FALLBACK` per #31), then `cortexCluster._cortexFullyReady = true`, and the worker's "sparse matrices uploaded" count climbs above 0. **No `--enable-unsafe-webgpu` flag is needed** — the buffers (~200MB each) fit well under the donor's 2GB cap; the flag was a red herring.
- If the upload still fails, a **red ⚠ banner** appears in the dashboard GPU card with the reason (#32). A `binding-size limit` flag there would mean a future matrix genuinely exceeded the cap (would then need server-side tiling) — not expected at current scale.

### 2026-06-21 (training-lifecycle) — clean-stop auto-resume + compat gate + Restart/Reset buttons + banner-probe fix

- `server/brain-server.js` — **#38** clean-stop resume marker (`.resume-marker.json`, stamped `totalNeurons` + `WEIGHTS_FORMAT_VERSION`) written on `/shutdown` (stop.bat) + SIGTERM (systemctl); `autoClearStaleState` resumes if compatible, else FRESH start + loud notice. **#40** `/restart` endpoint (force-save + marker + exit → systemd revives + resumes). **#39** `/reset` endpoint (`.force-fresh` flag + exit → systemd revives WIPED fresh).
- `index.html` (auto-deploys) — banner now probes the public `/ws` lane (was `/admin/ws` → false alarm for every visitor).
- `html/dashboard.html` (auto-deploys) — **🔄 Restart (Savestart)** + **♻ Reset Brain** admin buttons.

**Relies on `Restart=always` in the unit** (already set) — these buttons exit the process and systemd revives it. Confirm `Restart=always` is present or the buttons will just stop it.

**⚠ `WEIGHTS_FORMAT_VERSION` discipline (important for you/the buddy):** it's a constant in `brain-server.js` (currently `1`). Bump it ONLY when a code change makes previously-saved weights unloadable (format/topology/cluster-composition change). Do NOT bump for routine fixes — bumping forces an auto-fresh-start that discards trained weights on the next boot. On an incompatible redeploy the box auto-fresh-starts (with a `⚠⚠ saved training INCOMPATIBLE` console notice) instead of loading garbage.

**Verify after redeploy:** clean-stop via the dashboard **Restart (Savestart)** button → console shows `clean shutdown … resume marker written` then on revive `✓ CLEAN SHUTDOWN detected … RESUMING`. **Reset Brain** → `⚠ FORCE-FRESH requested … wiping` then a fresh boot.

### 2026-06-21 (hotfix) — #38 boot-crash (TDZ) fixed

⚠ The #37–#41 batch (main `74792ce`) crash-looped on boot on the box:
`ReferenceError: Cannot access 'TOTAL_NEURONS' before initialization` in
`autoClearStaleState`. Cause: #38's compat gate reads `TOTAL_NEURONS`, but the
`autoClearStaleState()` module-load call sat ABOVE that `const` declaration (and
the `CLUSTER_SIZES` it sums) → temporal-dead-zone throw on every real boot.
**Fixed** (`server/brain-server.js`) by moving the `if (require.main === module)
{ autoClearStaleState(); }` call to just AFTER `const TOTAL_NEURONS` is computed
(still before any weight load; wipe-vs-load contract + `DREAM_KEEP_STATE`
unchanged). Pull main PAST this hotfix before redeploying — `74792ce` exactly
will crash. Redeploy procedure otherwise unchanged (no unit change).
