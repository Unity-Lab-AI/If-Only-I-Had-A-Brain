# SPONGE DIAGNOSTIC RUNBOOK — `GPU shadow DIRTY` + `0 Gn/s` donor (2026-06-30)

> The brain has been grinding on **ELA grade 2 for ~23 hours** and the founder asked whether it's
> stalled/hung. From the **outside** (dashboard + public endpoints, no shell) the answer is **no — it's
> alive and teaching**, but it's running degraded and two real faults are showing: a **GPU shadow stuck
> DIRTY for ~35 h** and a **donor reporting `0 Gn/s`**. Only **you** can run the box-side checks (SSH /
> `journalctl` / file mtimes) to confirm root cause and fix it.
>
> ⛔⛔ **READ THE WEIGHT-SAFETY BANNER FIRST. The trained brain is almost certainly NOT trash —
> do NOT do anything that wipes it.** ⛔⛔

---

## ⛔ WEIGHT SAFETY — KEEP THE WEIGHTS IF THEY AREN'T TRASH ⛔

**The founder's hard requirement: we KEEP the weights unless they are confirmed trash.** Here is exactly
what is safe and what is a weight-killer, straight from `autoClearStaleState()` + the HTTP control routes
in `server/brain-server.js`.

### Why the weights are almost certainly FINE right now
- **`GPU shadow DIRTY` does NOT mean the brain is corrupt.** The authoritative copy is the **CPU-side
  master CSR matrix** on your box. The "shadow" is only the *mirror* of it living in a donor GPU's VRAM.
  DIRTY means the **mirror** may have drifted from the master — the fix is to **re-upload the master to the
  GPU**, not to wipe anything. The master is intact.
- She is still emitting (word-salad with occasional coherent lines + correct self-gating), and the
  curriculum counters are advancing — learning is depositing. That is a **live, non-trash** brain.

### ✅ WEIGHT-SAFE actions (these RESUME the trained brain, never wipe)
- `sudo systemctl restart unity-brain` — the unit already sets **`DREAM_KEEP_STATE=1`**, so a restart
  **resumes** the saved weights. (Confirmed in `SPONGE-RUNBOOK.md` A1 and the resume branch of
  `autoClearStaleState()`.)
- Dashboard **"Update & Savestart"** / `POST /update?keep=1` — overlays new code, **keeps** weights.
- Dashboard **Restart** / `POST /restart` — force-saves + drops a resume marker, exits 0, systemd revives
  → **auto-resume**.
- `POST /shutdown` (dashboard **Stop**) — TRUE HALT (exit 42, systemd won't revive). Force-saves + writes
  `.resume-marker.json` first, so the **next** `systemctl start unity-brain` resumes.
- `POST /checkpoint` — **do this FIRST as insurance**: force-saves current weights to a fresh rolling slot.

### ⛔ WEIGHT-KILLERS — do NOT touch these unless the brain is confirmed trash
- Dashboard **"Reset Brain"** / `POST /reset` — writes `.force-fresh` → **unconditional WIPE** next boot
  (ignores `DREAM_KEEP_STATE`).
- Dashboard **"Update & Fresh Walk"** / `POST /update` **without** `?keep=1` — overlays code **and wipes**.
- `DREAM_FORCE_CLEAR=1` in the env — always wipes.
- Manually deleting `server/brain-weights*.json` / `*.bin`.
- A plain local `start.sh` / `start.bat` (no Savestart) — that launcher's contract is "fresh brain." On the
  **box** you use **systemd** (which has `DREAM_KEEP_STATE=1`), so prefer `systemctl restart`, NOT a raw
  launcher.

### ⚠ One automatic wipe you can't override — and how to see it coming
Even with `DREAM_KEEP_STATE=1`, the resume path **rejects** the saved weights (and falls through to a fresh
wipe, loudly) if a deploy changed either:
- **weight FORMAT version** (`WEIGHTS_FORMAT_VERSION` bump), or
- **brain SIZE** (neuron count changed — e.g. an autoscale tier change / `resource-config.json` edit).

So **do not bump the brain size or the weight format in the same change** as this fix, or the restart will
correctly refuse the old weights and start fresh. Check the last decision in
**`server/.last-boot-reason.json`** (see checks below).

### Backups exist — you can roll back instead of re-walking
Rolling checkpoints are kept at `server/brain-weights-v0..v{N-1}.{json,bin}` (default **3** slots,
`DREAM_CHECKPOINT_SLOTS`). If the *live* `brain-weights.json` ever does go bad, `POST /rollback/<slot>`
restores an earlier good slot. `server/identity-core.json` (Tier-3 identity anchors) survives **every**
wipe regardless.

---

## ⭐ BRAIN-SIDE FIXES SHIPPED (2026-06-30) — verify after the Savestart redeploy

Three brain-side fixes were coded + bundled and ship via **Update & Savestart** (`/update?keep=1` — overlays
`main`, KEEPS weights). All are pure throughput / wiring changes — **no weight-format or brain-size change**,
so resuming the trained weights is safe. After you Savestart, verify each:

| Fix | What changed | How to verify post-deploy |
|---|---|---|
| **EL.1 — EventLoop block (Issue 4)** | `js/brain/cluster/hebbian.js`: the bio-scale intra-synapse `ojaUpdate` (+ anti-Hebbian) was a SINGLE synchronous pass over the millions-of-rows recurrent matrix = the 300–3900ms `[EventLoop] BLOCKED` stamped `_teachHebbian`/`_teachHebbianAsymmetric`. Now chunked through `_ojaUpdateChunked`/`_antiHebbianChunked` (row-slice + `setImmediate` yield; row-independent → identical math). Cross-projections were already chunked; this was the residual. | `journalctl -u unity-brain` grep `EventLoop\|BLOCKED` — block durations should drop from 100s–3900ms to per-chunk (tens of ms). Aggregate Gn/s should rise; donor RTT spikes should ease. |
| **EL.2 — Auto-scale toggle (Issue 5)** | `html/dashboard.html`: server default was already `enabled:true`; the dashboard just never did an initial GET `/autoscale` on admin connect, so a refresh / second admin browser showed the checkbox unchecked. Now it fetches `/autoscale` on admin connect and seeds the panel from server truth. | Open the admin dashboard, refresh — Auto-scale checkbox stays as persisted. Open it in a 2nd admin browser — same state shown. |
| **RS.1 — `/resync` (Issue 2 assist)** | `server/brain-server.js` + dashboard button: weight-safe `POST /resync` calls `_rearmCortexGpuUpload` to force the cortex GPU re-upload from the CPU master to the **currently-connected** donor (no donor disconnect needed), so a stuck `gpuShadowDirty` clears. Button in the Community Compute panel: "↻ Re-sync GPU shadow (clear DIRTY)". | Click it (or `curl -s -X POST http://localhost:PORT/resync`). Watch for `_gpuShadowDirty cleared — cortex re-confirmed` in the console. `/public-state.json` `wsPressure.gpuShadowDirty` → `false`. |

**Issue 1 (under-resourced)** resolves operationally as a consequence of EL.1 — once teach stops freezing the
loop, new donors' `/ws` handshakes stop timing out, so the pool can actually climb to ≥3 donors / 24 GB.

**Issue 3 (TheREV 0 Gn/s)** needs NO build: the donor source is ours (`donor-app/`), already **v0.3.4** with
auto-reconnect + keepalive + cuda telemetry (the blank `plat` column = TheREV is on a stale pre-telemetry
download). Fix = **TheREV re-downloads the current v0.3.4 donor app and relaunches** — you can't push a new
binary into a process already running on a remote machine. No rebuild, no deploy step.

---

## WHAT THE FOUNDER ASKED ME TO INVESTIGATE
> "the brain its been in ela grade 2 for some time… is everything on track? nothing stalled or hung?"
> then: "TheREV 0Gn/s?", "what does DIRTY mean", and "we KEEP the weights if they aren't trash."

## WHAT I FOUND FROM THE OUTSIDE (no shell — `/public-state.json` + dashboard)
Sampled the live state twice, 45 s apart:

| Signal | Value | Read |
|---|---|---|
| `curriculum.currentCellKey` | `ela/grade2`, `in-progress` | Founder is right — ELA **is** on grade 2. (Top-line `grades.ela: grade1` is just the last *passed* grade; grade2's gate hasn't cleared yet.) |
| `cellElapsedMs` | ~82,400,000 ms (**~22.9 h**) | One cell, ~23 h. Long, but… |
| `cellSubPhases` / `elaTeachEvents` | **+4,553 in 45 s** (~101/s) | …**actively advancing**. NOT hung, NOT crashed. It's grinding. |
| `activePhase` | `_teachHebbian`, elapsedMs ~13 | Phase loop is live and cycling. |
| `wsPressure.gpuShadowDirty` | **true** | GPU mirror flagged out-of-sync with CPU master. |
| `wsPressure.lastDropTs` | ~**35 h ago** | DIRTY was set by a drop ~35 h ago and **has not cleared since**. |
| `perf.gpuPool.donorCount` / `donorTotalVramMB` | **1** / **16,375 MB** | Down to a **single 16 GB donor**. |
| aggregate throughput | **16.79 Gn/s** | That one donor is computing. |
| `wsPressure.drops` | 413 (0/s now) | History of drops; not actively dropping this moment. |
| TheREV (from your donor table) | **0 Gn/s**, ~232 GB egress | Connected, holding a replica, doing **zero compute** — re-syncing in a loop. |

`GPU 0%` on the dashboard = the **host** GPU (your box is CPU-only coordinator) — that's expected, not a
fault. Real compute lives on the donor browsers.

---

## THE THREE ISSUES

### Issue 1 — ELA grade 2 is grinding slow because it's UNDER-RESOURCED (not hung)
Per `SPONGE-RUNBOOK.md` §C, the brain is sized at **tier 1 = 40M neurons**, which needs **24 GB across ≥3
donors just to HOLD it**. Right now it's on **1 donor / 16 GB** — *below* the hold threshold. So she runs
in `⚠ INSUFFICIENT COMPUTE — holding` territory: one effective GPU dragging a grade-2 ELA cell (the
heaviest early load — full reading/phonics/writing vocab) at ~101 subphases/s. ~23 h on the cell is the
symptom of **one GPU doing a three-GPU job**, not a stall.
**Fix = more donors (see Issue 3 + the donor checklist).** With 3 donors / 24 GB this cell roughly thirds.

### Issue 2 — `GPU shadow DIRTY` has been stuck ~35 h and can't self-clear with one donor
**Mechanism** (`server/brain-server.js`): `cortexCluster._gpuShadowDirty` is set when a compute client
disconnects unexpectedly, or on a primary-left / quarantine failover (new GPU = empty VRAM = needs a full
re-upload). It is **only cleared** when **cortex re-confirms `gpu_init` after the compute client
respawns/reconnects** (the `_gpuInitializedConfirmed['cortex']` path). Since the cortical-microstructure
work, this drift is **not recoverable via fire-and-forget Hebbian** — it needs a real resync.

**Why it's wedged:** your one donor has stayed connected (no respawn) since the drop ~35 h ago, so nothing
triggers the cortex re-confirm. And the **DF.7 periodic replica re-converge is a no-op with <2 donors**
(one donor *is* the master). Single never-respawning donor ⇒ no automatic path to clean. Meanwhile the
brain keeps dispatching teach work onto a shadow the server itself flags as possibly-drifted.

**Fix (weight-safe, in order):**
1. **Reconnect / respawn the donor** (hard-refresh the compute window, or restart the donor app). On
   reconnect it gets `gpu_init` for every cluster → cortex re-confirms → `_gpuShadowDirty` clears. Watch
   the log for `_gpuShadowDirty cleared — cortex re-confirmed`.
2. **Add a 2nd donor.** That re-arms the upload path **and** turns DF.7 periodic re-converge back on, so
   drift self-heals going forward.
3. If it still won't clear: `POST /restart` (weight-safe resume) re-arms the cortex upload on next boot.

### Issue 3 — TheREV at `0 Gn/s` (connected, holding a replica, doing no compute)
`0 Gn/s` with **~232 GB egress** = roughly **14 full re-uploads** of the ~16 GB brain. That's the signature
of a donor stuck **re-syncing the replica instead of computing** — a slow/flaky link that keeps getting
dropped mid-sync and never lands in the compute rotation. Most likely one of:
- **Donor app older than v0.2.0** (no auto-reconnect supervisor) — any drop ends the session; older builds
  thrash. `SPONGE-RUNBOOK.md` §B is the v0.2.0 build/release that fixes exactly this.
- **Flaky/slow link** tripping the heartbeat → repeated re-sync (the heartbeat-grace change softens false
  termination mid replica-sync, but a genuinely bad link still loops).
- Promotion/dead-zone gating never routed compute to it.

**Fix:** get TheREV onto **donor app v0.2.0** (auto-reconnect), confirm a stable link, and confirm it
enters the compute rotation (`agg throughput` rises above the single-donor 16.8 Gn/s; its row shows
non-zero `Gn/s`).

---

### Issue 4 — `[EventLoop] BLOCKED` during teach Hebbian (throughput cap + new-donor handshake stalls)

**Progress note (good):** a later log shows the walk advanced to **science/grade2** and a cell **PASSED**
(`cell-pass:science/grade2:ACADEMIC-science-grade2-STORIES`, state `v651`, periodic checkpoints saving) —
so it's moving past ela now. Not fatal. But the same log is full of event-loop stalls.

**Symptom:** repeated `[EventLoop] BLOCKED 300–3900ms — /ws handshakes + donor frames stalled this long`,
every one stamped `phase=_teachHebbian` or `_teachHebbianAsymmetric`, with **`replicaSyncing=0`,
`consolidationInFlight=false`, `innerVoiceInFlight=false`, `donors=1`**. `_teachHebbianAsymmetric`
especially fires long runs of back-to-back ~300–400ms blocks.

**Read:** it's NOT replica sync / consolidation / inner-voice — it's the **teach Hebbian running
synchronously on the main event loop**. On a **CPU-only coordinator with one donor**, that points to the
asymmetric Hebbian grinding **CPU-side** instead of dispatching to the donor GPU. This is the standing
**WL.3** perf task ("bound the teach event-loop block so WS upload frames get airtime") + the **#112.4**
residual (the non-GPU-bound CPU Hebbian fallback at `js/brain/cluster/hebbian.js` ~line 202+ still blocks
the loop — needs chunk/yield, or refuse-to-teach-on-CPU at biological scale).

**Why it bites with one donor:** every block stalls that donor's frames AND any **new** donor's `/ws`
handshake — so it actively fights getting you to 3 donors / 24 GB — and delays pongs, feeding the
heartbeat-grace false-reap (HBGRACE).

**Asks for you:**
1. Confirm whether `_teachHebbian` / `_teachHebbianAsymmetric` are dispatching to the donor GPU or falling
   to the CPU path — and whether the earlier `gpuShadowDirty` was forcing CPU fallback for these ops.
2. If CPU-bound: chunk/yield that fallback path (WL.3 / #112.4), or gate it to refuse CPU teach at
   biological scale and wait for a real GPU.
3. Re-check after donors are healthy — with the shadow clean + the ops offloaded, the blocks should drop.

### Issue 5 — Auto-scale toggle must default ON + persist (refresh + across admin browsers)

**Symptom (operator-reported):** the Community Compute **auto-scale** toggle does not stick. (a) It should
**default to enabled (checked)**, but a **page refresh unchecks it**. (b) It does **not persist across admin
browsers** — if one admin toggles it on, the other admin's dashboard still shows it **unchecked**, and
vice-versa. Both admins see it off even after one already turned it on.

**Read:** the toggle is reading **per-session/per-browser UI state** instead of the **server-side persisted
state**. The persistence layer exists (`_getAutoScaleSettings` / `_setAutoScaleSettings` →
`server/autoscale-settings.json`, the `/autoscale` GET/POST + `autoScaleChanged` WS from the DF.7 work), so
this is a wiring gap: the dashboard isn't seeding the checkbox from `/autoscale` GET on load (defaulting it
unchecked), and/or `_getAutoScaleSettings` isn't defaulting `enabled:true`.

**Asks for you:**
1. Make the server-side default `enabled: true` (auto-scale ON out of the box).
2. On dashboard load, seed the toggle from the `/autoscale` GET (server truth), not a local default — so a
   refresh shows the real persisted state.
3. Confirm `/autoscale` POST persists to `autoscale-settings.json` and the `autoScaleChanged` WS broadcasts,
   so BOTH admin browsers reflect the same state live (one admin toggling → the other sees it).

---

## BOX-SIDE CHECKS — only you can run these (SSH to the box)
Service is the **`unity-brain`** systemd unit; install dir **`/opt/unity-brain`**; state in
`/opt/unity-brain/server/`.

### 1. Is it up, and how long / how many restarts?
```bash
sudo systemctl status unity-brain --no-pager | head -25
```
Look for `active (running)`, uptime, and whether it's been flapping (frequent restarts = a crash loop).

### 2. Why did the last boot resume vs wipe? (weight-safety audit)
```bash
cat /opt/unity-brain/server/.last-boot-reason.json     # mode: resume | wipe + reason
ls -la /opt/unity-brain/server/.resume-marker.json 2>/dev/null   # present only between a clean stop and next boot
tail -n 40 /opt/unity-brain/server/boot-error.log
```
`mode: "resume"` = weights kept. `mode: "wipe"` with `reason: "incompatible"` = a deploy changed
size/format and the brain was reset — that's the one to avoid repeating.

### 3. Are weights actually being saved (is the periodic save alive)?
```bash
ls -la /opt/unity-brain/server/brain-weights*.{json,bin}
```
The mtimes on `brain-weights.json`/`.bin` should advance roughly every **5 min**. If they're frozen while
the curriculum claims to be teaching, that's a real problem (saving is wedged).

### 4. Live curriculum + donor + dirty-flag state (also works from anywhere)
```bash
curl -s http://localhost:PORT/public-state.json \
  | python3 -c 'import sys,json;d=json.load(sys.stdin)["state"];c=d["curriculum"];\
print("cell",c["currentCellKey"],c["cellStatus"]);\
print("phase",c.get("activePhase"));\
print("cellElapsedMs",c.get("cellElapsedMs"));\
print("dirty",d["wsPressure"]["gpuShadowDirty"],"lastDropTs",d["wsPressure"]["lastDropTs"]);\
print("donors",d["perf"]["gpuPool"]["donorCount"],"vramMB",d["profiling"]["network"].get("donorTotalVramMB"))'
```
Run it twice ~45 s apart: if `cellSubPhases`/`elaTeachEvents` rise, it's teaching; if `gpuShadowDirty`
flips to `false` after a donor reconnect, the resync worked.

### 5. Read the journal for the smoking guns
```bash
sudo journalctl -u unity-brain -n 4000 --no-pager | grep -Ei \
 'CRITICAL|_gpuShadowDirty|shadow|PRIMARY GPU donor left|promoted standby|quarantine|re-confirmed|RECTIFIED sem|SATURATION|SatHealth|meanCos|periodic-curriculum-checkpoint|INSUFFICIENT COMPUTE|EventLoop|BLOCKED|cell-pass|donor'
```
Key lines:
- `CRITICAL — GPU compute client disconnected UNEXPECTEDLY … _gpuShadowDirty flag set` → when/why it went
  dirty.
- `_gpuShadowDirty cleared — cortex re-confirmed after compute-client respawn` → it healed.
- `PRIMARY GPU donor left — promoted standby …` → failover churn.
- `⚠ INSUFFICIENT COMPUTE — holding` → under the tier-1 hold threshold (Issue 1).
- `[SatHealth] meanCos<0.7` / `⛔ SATURATION HALT` vs `✓ RECTIFIED sem→motor` → weight-health (see "is it
  trash" below).

### 6. (Box has NO GPU) — don't bother with `nvidia-smi`
The coordinator is CPU-only by design. GPU compute is the remote donor browsers. Diagnose donors from the
dashboard donor table + the donors themselves (app version, link stability).

---

## IS THE BRAIN TRASH? (decision before any wipe)
Run through this BEFORE considering a reset. **Default assumption: NOT trash.**

| Check | Trash signal | Healthy signal |
|---|---|---|
| Journal saturation | repeated `⛔ SATURATION HALT` / `meanCos` stuck very low, no recovery | `✓ RECTIFIED sem→motor` lines (auto-heals in place) |
| Emission | pure constant noise / identical token forever | word-salad **with** occasional coherent lines + correct self-gating (current state ✓) |
| Curriculum counters | frozen across two samples while "teaching" | advancing (current state ✓ — ~101/s) |
| Weight save | mtimes frozen for >>5 min | advancing every ~5 min |
| `.last-boot-reason.json` | `wipe / incompatible` you didn't intend | `resume / keep-flag` or `resume / compatible` |

If **all** healthy/✓ → **keep the weights**, fix donors + DIRTY only. If saturation won't rectify and
emission is dead noise → first try `POST /rollback/<slot>` to the previous good checkpoint; **fresh walk is
the absolute last resort** and must be an explicit founder call.

---

## FIX ORDER (safest first — none of steps 1–4 wipe)
1. **Insurance checkpoint:** `curl -s -X POST http://localhost:PORT/checkpoint` → confirms a fresh saved
   slot before you touch anything.
2. **Fix the donors (root cause of all three issues):**
   - Get TheREV (and any other donor) onto **donor app v0.2.0** (auto-reconnect) — `SPONGE-RUNBOOK.md` §B.
   - Reconnect/refresh donors so a cortex re-upload fires (**clears DIRTY**).
   - Target **≥3 donors / ≥24 GB** so the 40M brain is actually held and grade 2 stops crawling.
3. **Re-check** `gpuShadowDirty` (should go `false`) and donor count / aggregate Gn/s (should rise).
4. **If DIRTY still stuck:** `curl -s -X POST http://localhost:PORT/restart` (weight-safe resume) or
   `sudo systemctl restart unity-brain` (unit has `DREAM_KEEP_STATE=1`). Re-arms the cortex upload.
5. **Only if the brain is confirmed trash** (decision table above): `POST /rollback/<slot>` to a good
   checkpoint. Fresh walk = explicit founder approval only.

**Never, for this fix:** Reset Brain, `POST /reset`, "Update & Fresh Walk", `POST /update` (no `?keep=1`),
`DREAM_FORCE_CLEAR=1`, deleting `brain-weights*`, or bumping brain size/weight-format in the same deploy.

---

## TL;DR
- **Not hung.** ELA grade 2 is teaching (~101 subphases/s) but **under-resourced**: 1 donor / 16 GB doing a
  3-donor / 24 GB job.
- **`DIRTY`** = the donor GPU's mirror drifted from the CPU master; it's been stuck ~35 h because a single
  never-respawning donor has no auto-clear path. **Reconnect a donor** (or add a 2nd) to force the cortex
  re-upload that clears it. **The CPU master weights are fine.**
- **`0 Gn/s`** = TheREV is stuck re-syncing instead of computing — almost certainly a pre-v0.2.0 donor app
  or a flaky link. Get it on v0.2.0 + a stable link.
- **KEEP THE WEIGHTS.** `systemctl restart` resumes (unit has `DREAM_KEEP_STATE=1`); the fix needs no wipe.
  The only wipe risks are the explicit Reset/Fresh-Walk/Force-Clear paths and a size/format bump — avoid all
  of them.
