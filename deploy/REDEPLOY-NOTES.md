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

### 2026-06-21 (BC + features batch) — basin-collapse hardening + Update button + public dashboard + leaderboard

All weight-preserving / logic-only — **no neuron-count change, no `WEIGHTS_FORMAT_VERSION` bump**, so a redeploy with the box's existing `DREAM_KEEP_STATE=1` **resumes the current weights** (no wipe). Backend files changed (NEED REDEPLOY): `js/brain/curriculum.js` · `js/brain/cluster.js` · `js/brain/cluster/telemetry.js` · `js/brain/global-workspace.js` · `server/brain-server.js` · `server/brain-server/chat.js` · `server/brain-server/state.js`. Frontend (auto-deploy): `html/dashboard.html` · `html/dashboard-public.html` (new) · `html/compute.html` · `js/app.bundle.js`. New file: `deploy/self-update.sh`.

- **Basin-collapse hardening** (the live single-token "mushrooms" lock) + a per-grade advance health gate (blocks any grade advancing while sem→motor saturated / emission mode-collapsed / vocab-incomplete). Full detail: `docs/ISSUE-basin-collapse-fix.md`. Env (optional, own-line comments): `DREAM_BC_EMISSION_DOM_MAX` (0.45) · `DREAM_BC_VOCAB_MIN` (0.85) · `DREAM_BC_COMPOUND_COH_MIN` (0.2).
- **Dashboard "Update & Fresh Walk"** button → `POST /update` → spawns `deploy/self-update.sh` (git-archive overlay of latest code → `.force-fresh` → `systemctl restart` → fresh walk). **Box setup:** `deploy/self-update.sh` ships in the repo; it needs `git`+`rsync`, the deploy key able to clone the remote, and **`sudo -n systemctl restart unity-brain` permitted** for the service user. Env: `UAL_BACKEND_DIR` (`/opt/unity-brain`) · `UAL_GIT_REMOTE` · `UAL_GIT_BRANCH` (`main`) · `UAL_SERVICE` (`unity-brain`) · `DREAM_SELF_UPDATE_CMD` (override script path). Runs privileged shell — review before enabling.
- **Static public dashboard**: `GET /public-state.json` (one cached snapshot, refreshed on the broadcast cadence) + `html/dashboard.html?public=1` / `html/dashboard-public.html` (admin controls force-hidden). **nginx:** serve/proxy `/public-state.json` PUBLICLY (no auth) — it's the same data the public `/ws` lane sends; a short `proxy_cache` (2–3s) makes 1000 viewers cost ~one backend hit per window. compute.html's leaderboard panel also fetches it.
- **Donor neuron-compute leaderboard** — persists in the brain weights (`neuronLeaderboard` in saveWeights), resets on a fresh walk; donors keep a persistent `donorId` (localStorage) + settable name.

**No systemd unit change** for the BC/feature code → overlay + restart. (Add the `UAL_*` / `DREAM_SELF_UPDATE_CMD` env + the sudo rule only if you want the dashboard Update button live.)

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

### 2026-06-21 (box-admin-return RECOVERY RUNBOOK — #112 live-deploy stability)

Context: the brain trained all night but the DONOR (Chrome compute.html) kept dropping → `DREAM_NO_AUTO_GPU=1` can't relaunch → reconnect re-upload-storm (2/17 matrices, 180s timeouts) → CPU fallback → `[EventLoop] BLOCKED ~5s` → never passed the K gate → never advanced grade. The #112 fix set is committed on `main`; FRONTEND pieces auto-deploy via the pages CI, BACKEND pieces need a redeploy.

**Files in the #112 set:**
- `html/compute.html`, `index.html`, `js/app.js` (+bundle) — #112.1 donor WakeLock + device-lost auto-recovery + anti-discard guidance; #112.6 donor-needed CTA banner. (frontend — auto-deploys)
- `js/brain/cluster/hebbian.js`, `js/brain/sparse-matrix.js` — #112.3 per-matrix upload retry; #112.4 chunked CPU-fallback Oja (`_ojaUpdateChunked`). (backend — needs redeploy)
- `server/brain-server/gpu.js` — #112.3 fail-fast upload timeout (180s→45s, `DREAM_SPARSE_UPLOAD_TIMEOUT_MS`). (backend)
- `server/brain-server.js` — #112.2 donor-fit boot budget in `UAL_PROXY_AUTH=1` mode (`DREAM_DONOR_FIT_MB` default 4096). (backend)

**Redeploy** = the standard git-archive overlay + unit restart at the top of this file (no unit change → no daemon-reload).

**New env knobs (optional; comments on their OWN line in the unit):**
- `DREAM_DONOR_FIT_MB=4096` — deployed boot brain budget (donor-fit). Raise once donors reliably hold more.
- `DREAM_SPARSE_UPLOAD_TIMEOUT_MS=45000` — per-matrix upload timeout before retry.
- `DREAM_BRAIN_BUDGET_MB` — hard override of the brain budget (wins over donor-fit).
- `DREAM_GATE_PROD_MIN=0.80` / `DREAM_GATE_PATH_MIN=0.80` — #112.5 A+ cell-pass gate bar (production / read-path). Default 0.80 = the DIBELS-8 aggregate K benchmark floor (`STANDARD_CUT_SCORES.__default__`); raise toward 0.95 for strict mastery. Lowering the A+ gate from the old unreachable 0.95 is what lets a genuinely-trained cell PASS + advance grade.

**Emergency wipe (brain stuck on corrupt state, keeps identity-core):** delete the weight/episodic/schema/conversation state files from the backend dir (the `brain-weights*.json` + `brain-weights*.bin` + `episodic-memory.db*` + `schemas.json` + `conversations.json` files; leave `identity-core.json`), then restart the unit — it revives clean. No shell needed: the dashboard ♻ Reset Brain button → `/reset` does the same via the `.force-fresh` flag.

**#112 items that still need the box admin:**
- #112.5 — confirm the kindergarten gate PASSES once a STABLE flagged donor trains on GPU. Thresholds are already relaxed; do NOT lower them to fake a pass — if it still fails after a clean GPU teach, capture which probe + margin from the log.
- #112.6 (robust half) — true sole-donor-drop auto-recovery needs infra (headless always-on donor, or watchdog). The shipped CTA only nudges humans to reconnect.
- #112.7 — admin password rotation: DECLINED by Gee (not changing it). No action; noted that the credential is exposed in the work transcript.
- Confirm `Restart=always` is in the unit (the dashboard Stop/Restart/Reset buttons rely on it).

### 2026-06-23 — kindergarten-stall + weight-save fix + "Update & Savestart" button

**Two things in this batch:**

**(1) The never-gets-past-kindergarten + weights-don't-save fix.** When `sem→motor` saturated (basin-collapse / single-token output), `Curriculum.runAllSubjects` hit a `SATURATION HALT` that **`return`ed out of the whole walk** (asked for a fresh boot) — the walk quit mid-K and never advanced. And the 5-min periodic save is gated off during a walk (`_curriculumInProgress`), so weights only persisted on a cell-pass → a walk that halted before any pass never hit disk → reboot wiped it.

- `js/brain/curriculum.js` — **server-side module despite the `js/` path** (like `consolidation-engine.js`): new `_rectifySemMotor()` CORRECTS a collapsed `cortexCluster.crossProjections['sem_to_motor']` in place (weight-decay `×DREAM_BC_RECTIFY_DECAY` + `normalizeRows(DREAM_BC_RECTIFY_NORM)` + clears stale meanCos/emission history + `_gpuShadowDirty`). The `SATURATION HALT` no longer `return`s — it rectifies, force-checkpoints, and CONTINUES. `sem_to_motor` is on the dense ~323K language cortex (CPU-resident CSR), so it reaches it at full scale. **(backend — needs redeploy)**
- `server/brain-server.js` — periodic save now force-writes through the curriculum guard during a walk (`{force:true, trigger:'periodic-curriculum-checkpoint'}`), so weights persist every 5 min regardless of cell-pass. **(backend — needs redeploy)**
- Env knobs (optional, own-line in the unit): `DREAM_BC_RECTIFY_DECAY=0.5` · `DREAM_BC_RECTIFY_NORM=0.6`. No knob required.

**(2) New dashboard button "⬆ Update & Savestart (keep weights)".** Same git-archive-overlay self-update as "Update & Fresh Walk" but it RESUMES the saved weights instead of wiping — deploy a fix WITHOUT losing training.

- `html/dashboard.html` — new `btn-update-savestart` + `wireUpdateSavestart()` → `POST /update?keep=1`. **(frontend — auto-deploys)**
- `server/brain-server.js` — `/update` now reads `?keep=1` (or `?mode=savestart`) and spawns the script with `UAL_KEEP_STATE=1`. Default (no query) = the original fresh-walk. **(backend — needs redeploy)**
- `deploy/self-update.sh` — `UAL_KEEP_STATE=1` SKIPS the `.force-fresh` write; the restart then resumes weights. **(deploy script — ships in overlay)**

**✅ No one-time box change needed for savestart-resume.** The unit ALREADY sets `Environment=DREAM_KEEP_STATE=1` (this file, above), so `autoClearStaleState` resumes on any restart that doesn't write `.force-fresh`. The savestart path simply omits `.force-fresh`. (If a heavy update changes brain size/format, the boot compat gate fresh-starts safely + says so.)

**Bootstrap reality (answers "do I need Sponge?"):** after this batch is deployed ONCE, Gee can self-serve routine code updates from the dashboard — **Update & Savestart** (keep training) or **Update & Fresh Walk** (wipe) — no Sponge. The ONLY things that still need box-admin: the FIRST deploy of this batch (the existing Update button or a manual overlay), any `deploy/unity-brain.service` change (needs `daemon-reload`), and the one-time button prerequisites (deploy key can clone, `sudo -n systemctl restart unity-brain` permitted, `Restart=always`). Redeploy = the standard git-archive overlay + restart at the top of this file.

**Verify after redeploy:** console shows `✓ RECTIFIED sem→motor` where it used to print `⛔ SATURATION HALT`; walk crosses K→grade1; `periodic-curriculum-checkpoint` saves every ~5 min. Click **Update & Savestart** → `self-update.log` shows `savestart mode … NOT writing .force-fresh` and the boot logs `DREAM_KEEP_STATE=1 … KEEPING prior state` (not a wipe).

---

## 2026-06-27 — v1.1.0 + tier3 wave cascade: new env flags + cell-pass + sem→motor + profiling

Two backend waves landed on `main` (tag `v1.1.0`, then the `feature/tier3-identity-seed-repair` cascade merge). Both are **backend + frontend** → standard git-archive overlay redeploy + `systemctl restart` (the SIGTERM handler force-saves weights + writes the resume marker, so a `DREAM_KEEP_STATE=1` restart **resumes** — no wipe). For a clean re-train use **Update & Fresh Walk** / `.force-fresh` (unconditional wipe; preserves `identity-core.json`).

**NEW env flags this wave (all default-safe — set NONE for the intended behavior):**

| Flag | Default | Effect |
|------|---------|--------|
| `DREAM_SM_LR_SCALE` | `0.5` (active) | sem→motor Hebbian LR multiplier (saturation prevention, `cluster/hebbian.js`). `1.0` = old behavior. Lower (`0.25`) if `[SatHealth] meanCos` still climbs past 0.7 on a fresh walk; raise (`0.7`) if basins go dead / TALK→0. |
| `DREAM_SM_WMAX` | unset (=0.4) | tighter weight ceiling for `sem_to_motor`+`sem_to_word_motor` only. Secondary saturation lever; try `0.25` if LR damping alone doesn't clear meanCos. |
| `DREAM_CELL_PASS_HARD` | unset (OFF) | restore old gate (probe/battery/health correctness decides cell pass). Default OFF = cells pass on learning completion. |
| `DREAM_BATTERY_GATE_HARD` | unset (OFF) | restore student-battery hard-block on cell pass. (Supersedes the older `DREAM_BATTERY_GATE_ADVISORY` opt-in — advisory is now the default.) |
| `DREAM_HEALTH_GATE_HARD` | unset (OFF) | restore per-grade health-gate hard-block on cell pass. |

The unit currently sets `DREAM_BATTERY_GATE_ADVISORY=1` — now redundant (advisory is default) but harmless; leave it.

**Console signals the wave landed:** `[Curriculum] 🎓 CELL COMPLETE … PASSES on learning completion`; `[Cluster cortex] sem→motor LR damping ACTIVE … ×0.5`; `/public-state.json` includes a `profiling` block (host/process/throughput/network/clients). Admin dashboard shows the **Application Profiling** card. Plus the tier3-wave signals: `[Tier3Store] seeded N missing identity anchor(s)`, `[MindSpace] server equational mind-space ready (CPU reference path)`.

**Per-file overlay used for the v1.1.0 backend (when not git-archiving the whole tree):** `server/brain-server.js`, `server/brain-server/state.js`, `server/brain-server/gpu.js`, `js/brain/cluster.js`, `js/brain/cluster/hebbian.js`, `js/brain/curriculum.js`, `html/dashboard.html` → `/opt/unity-brain/…`, `chown unity:unity`, `node --check`, restart. Backups land in `/opt/unity-brain/_release-backup-*` (rollback: `cp -a` back + restart).

---

## 2026-06-27 — PUBDASH-DONOR-UX: public-dashboard auth fix + donor light theme/headless + memory nits

Branch `feature/public-dashboard-donor-ux-fixes` (commit `3991a86`), pushed to BOTH `if-only` (git.unityailab) + `github` (Unity-Lab-AI backup). **⚠ CASCADE SPLIT (Gee 2026-06-27): cascaded feature→develop→main on `github` ONLY (the cloud backup mirror) — `if-only` (git.unityailab, the box's deploy source) STILL has ONLY the feature branch; its `develop`/`main` remain at `v1.2.0` (`9f824a3`).** ⇒ The box pulls from `if-only/main`, which does NOT have this batch yet, so **deploy it by checking out the FEATURE BRANCH on if-only** (`git checkout feature/public-dashboard-donor-ux-fixes`) before the git-archive overlay — do NOT wait for an `if-only` main cascade, that's deliberately not done. (github main is ahead only as a backup; it is NOT a deploy source.) All weight-preserving — **no neuron-count change, no `WEIGHTS_FORMAT_VERSION` bump** → `DREAM_KEEP_STATE=1` restart RESUMES weights, no wipe, no fresh walk. No systemd unit change → no `daemon-reload`. No new env knobs.

**Frontend (auto-deploys on push to main; live only after the cascade):**
- `html/dashboard.html` — **PD.1**: public viewers no longer get an admin login prompt. `dashboard-public.html` redirects to `dashboard.html?public=1`; `refreshMilestone()` + its 5 s `setInterval` polled `/admin/milestone` UNCONDITIONALLY → `401` + Forgejo Basic-auth prompt for every public visitor. Now gated behind `!PUBLIC_MODE` (the milestone/save panel is `.admin-only` anyway). **PD.4b**: `pass interval` render hardened (`Number(cons.intervalMs) || 300000`) so it can never blank — the blank you may have seen on the live site is a STALE deployed bundle; current code shows `5 min`.
- `js/app.bundle.js` (rebuilt 3.9 MB) — carries the Tier 3 dedup into the browser fallback brain.

**Backend (NEEDS the git-archive overlay + `systemctl restart unity-brain`):**
- `js/brain/hippocampal-schema.js` — **server-side module despite the `js/` path** (like `consolidation-engine.js` / `curriculum.js`). **PD.4c**: `Tier3Store.promote()` now dedups by LABEL (was `schema.id`-only → duplicate identity anchors + double identity-baseline injection for that concept, e.g. `play-tag-games · play-tag-games`), plus a new `dedupeByLabel()` cleanup method.
- `server/brain-server.js` — calls `tier3Store.dedupeByLabel()` at boot AFTER load + seed (collapses any persisted dups).
- `js/brain/consolidation-engine.js` — comment-only (stale `0.7` → `0.85` to match `SCHEMA_GROUP_COSINE`). No behavior change; rides the overlay.

**Donor app — MUST be rebuilt + redistributed (NOT auto-deploy, NOT in the overlay; it's Rust):**
- `donor-app/src/gui.rs` — **PD.2**: dark theme → OS light/white, high-contrast (near-black text, slate secondary, deep-violet accent, amber-700 warnings). Was grey-on-white, unreadable.
- `donor-app/src/main.rs` — **PD.3**: `#![cfg_attr(all(windows, feature = "gui"), windows_subsystem = "windows")]` → the GUI build opens with NO console window on Windows; the pure-headless `--no-default-features` CLI build keeps its console for server/RunPod stdout.
- **Rebuild + replace the distributed binary:** `cd donor-app && cargo build --release --features gui --target x86_64-pc-windows-gnu` (or native on a Windows box) → replace `unity-donor-windows-x86_64.exe`. ⚠ The dev box has NO Rust toolchain, so the source is fixed but the binary is NOT — it WON'T show the light theme / no-console until rebuilt. **Verify the rebuilt exe:** light/white readable window + NO black console window behind it.

### Redeploy

Standard git-archive overlay + restart at the TOP of this file — but **`git checkout feature/public-dashboard-donor-ux-fixes` first** if deploying before the cascade (else `main` doesn't have it yet). No unit change → no `daemon-reload`.

**Verify after redeploy:**
- Public dashboard (`…/html/dashboard-public.html` or `…/html/dashboard.html?public=1`) loads with NO login prompt and NO `401 /admin/milestone` in the browser console.
- Boot log may show `[Tier3Store] dedupeByLabel — removed N duplicate anchor(s)` — EXPECTED + weight-preserving (folds strength into the keeper); the next save persists the deduped `identity-core.json`. The Tier 3 anchor list no longer shows repeats.
- Memory panel `pass interval` reads `5 min` (never blank).

### Standing asks from Gee (do these too)
1. Run the SAME full doc sweep for YOUR box/deploy/donor/GPU-compute work we aren't aware of — any server-side change you made gets its docs synced the same way, in the same commit as the code.
2. Make sure Unity can properly USE Pollinations on the deploy — when a user asks for an image she must actually generate one. Image-gen is CLIENT-side Pollinations (the deployed browser builds the `gen.pollinations.ai` URL from her intent); verify the deployed client reaches it + renders (debug the browser, not the server).
3. systemd reminder: NO inline comments — comments on their OWN line, or the directive is silently ignored.

---

## 2026-06-28 — DDW: distributed donor work-sharing (ALL donors compute + ALL on the leaderboard)

✅ ON `main` `d32f932` (BOTH git.unityailab AND github) — cascaded feature→develop→main. **Deploy by pulling `main`** (the standard overlay below); do NOT check out a feature branch. Carries the PUBDASH batch too (public-dashboard auth + memory nits). Backend files: `server/brain-server/gpu.js` + `server/brain-server.js`. Weight-preserving — NO neuron-count / `WEIGHTS_FORMAT_VERSION` change. **No client/HTML/bundle change.**

**What it does + the read/write split (IMPORTANT):**
- **WRITES (teach Hebbian batch) fan out by DEFAULT** (`DREAM_DF7_FANOUT`, default ON; kill-switch `=0`). This is the bulk of teach GPU work → every donor computes + earns leaderboard credit. Safe: CPU CSR is the authoritative Hebbian master, the GPU op is a fire-and-forget shadow, and the periodic re-broadcast re-converges drift — a batch on any replica CANNOT corrupt training.
- **READS (forward propagate: gate probes, student battery, emission) DO NOT fan by default** — gated behind `DREAM_DF7_FANOUT_PROPAGATE` (default OFF). A read drives a curriculum DECISION, so routing it to a replica with stale/incomplete weights returns a wrong answer the gate acts on → spurious cell-fail / stalled walk. **Only enable `DREAM_DF7_FANOUT_PROPAGATE=1` AFTER you confirm replica weight-sync completes cleanly** (see the upload-timeout caveat below).

**⚠ GATING CAVEAT — replica sync is currently UNRELIABLE on this box:** the live log shows EVERY donor matrix upload timing out at 45s (`sparse chunked upload … timed out after 45000ms`) + a 72-second `[EventLoop] BLOCKED`. Until that event-loop block is bounded so WS upload frames get airtime, replicas may never hold current weights — so leave `DREAM_DF7_FANOUT_PROPAGATE` OFF, and even the teach-Hebbian fan-out's benefit is limited until sync is healthy. This is the next real perf task.

**New env knobs (optional, own-line comment in the unit):**
- `DREAM_DF7_FANOUT_PROPAGATE=1` — also fan READS across replicas. DEFAULT OFF. Turn on only after replica sync is proven clean.
- `DREAM_DF7_REBROADCAST_MS` — replica weight re-converge interval. Default 60 s when `DREAM_DF7_FANOUT≠0`, else 10 min.

**Redeploy** = standard git-archive overlay of `main` + `systemctl restart unity-brain` (top of this file). DDW is on `main`, so once the box can restart, the dashboard Update & Fresh Walk does the whole thing.

**⛔ WHY THE BUTTON DIDN'T WORK (Gee 2026-06-28):** the dashboard Update button fired `self-update.sh` but the service never restarted (uptime never reset). Root cause: `sudo -n systemctl restart unity-brain` is NOT granted for the service user, so the overlay lands but the bounce fails, and a stuck "already updating" flag then locks the button out. **FIX = grant the sudo rule + confirm `Restart=always`** (see the standalone Sponge deploy brief Gee pasted you). Until that grant exists, the dashboard cannot self-deploy.

**LIVE VALIDATION (after a real restart):** Profiling → Clients — BOTH donors' Gn/s > 0 (TheREV off zero) + BOTH on the leaderboard; a curriculum cell still PASSES its gate. Rollback: `DREAM_DF7_FANOUT=0`.
