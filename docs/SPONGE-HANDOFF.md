# SPONGE HANDOFF — kindergarten no-stall + weight-save fix + Update & Savestart

> Full write-up for Sponge (server/backend) on the 2026-06-23 batch.
> Shipped on `if-only/main` (commit `f0a770c`, merged `3af2e7e`) **and** `if-only/develop`.
> Companion to `deploy/REDEPLOY-NOTES.md` (the standing box-admin handoff) — this doc is
> the single-page "everything Sponge needs" for THIS batch.

---

## TL;DR

1. Two bugs made every K→PhD walk die at the **kindergarten gate** and **lose its weights**. Both are fixed (logic-only, weight-preserving — saved weights still load).
2. A new **"⬆ Update & Savestart"** dashboard button lets Gee deploy code updates **without wiping training** — no Sponge needed for routine updates after the first deploy.
3. **No one-time box change is required** for savestart-resume: the unit already sets `DREAM_KEEP_STATE=1`.
4. **What still needs Sponge:** the FIRST deploy of this batch (backend isn't auto-deployed), any `unity-brain.service` change, and confirming the Update-button prerequisites are in place on the box.

---

## 1. What broke (root cause)

**(A) Stall at kindergarten.** When the `sem→motor` projection saturated (basin-collapse — the single-token "mushrooms" / word-soup output), `Curriculum.runAllSubjects` hit a **`SATURATION HALT`** that **`return`ed out of the entire walk** and recommended an operator fresh-boot. Three saturating cells → the walk quit mid-kindergarten and never advanced to grade1. The per-cell advance gate and the force-advance gate *also* refuse to advance while saturated, so there was no path forward — the walk was triple-locked at K.

**(B) Weights never persisted.** The 5-minute periodic `saveWeights()` is gated off during a walk (the `_curriculumInProgress` guard), so weights only ever hit disk on a **cell-pass**. A walk that halted (or just never passed a cell) before any pass never wrote to disk → on the next boot (no resume marker) `autoClearStaleState` wiped the RAM-only training.

These compounded: the brain trained K, saturated, halted (no save), and a restart wiped it — the loop Gee kept hitting.

---

## 2. What shipped (all LOGIC-ONLY)

No neuron-count change, no `WEIGHTS_FORMAT_VERSION` bump, no new *required* persisted field → **saved weights load unchanged**; resumes under `DREAM_KEEP_STATE=1`.

### Backend (needs redeploy)
- **`js/brain/curriculum.js`** — *server-side module despite the `js/` path* (the Node server imports it, like `consolidation-engine.js`):
  - New **`_rectifySemMotor()`** — actually CORRECTS a saturated/collapsed `cortexCluster.crossProjections['sem_to_motor']` in place: multiplicative weight-decay (`×DREAM_BC_RECTIFY_DECAY`, default 0.5) + `normalizeRows(DREAM_BC_RECTIFY_NORM`, default 0.6) + clears the stale sep-probe `_lastSemMotorMeanCos` + the collapsed `_emissionBus` history + sets `_gpuShadowDirty` for re-upload.
  - The **`SATURATION HALT` no longer `return`s** — it calls `_rectifySemMotor()`, force-checkpoints the corrected weights, and **CONTINUES** the walk. Saturation never hard-stops the walk again.
  - `sem_to_motor` lives on the dense ~1.5M **language cortex** (WMB grew it from ~323K/349K; CPU-resident CSR), so the rectify reaches it at full deployed scale — it is NOT the 61M GPU main cortex.
- **`server/brain-server.js`**:
  - Periodic save now **force-writes through the curriculum guard** during a walk (`{force:true, trigger:'periodic-curriculum-checkpoint'}`) → weights persist every 5 min regardless of cell-pass.
  - `/update` endpoint now reads **`?keep=1`** (or `?mode=savestart`) and spawns `self-update.sh` with `UAL_KEEP_STATE=1`. Default (no query) = the original fresh-walk.

### Deploy script (ships in the overlay)
- **`deploy/self-update.sh`** — `UAL_KEEP_STATE=1` **SKIPS the `.force-fresh` write** so the restart resumes weights. Default unchanged (writes `.force-fresh` → wipe).

### Frontend (auto-deploys on push to main)
- **`html/dashboard.html`** — new **`btn-update-savestart`** + `wireUpdateSavestart()` → `POST /update?keep=1`.
- **`js/app.bundle.js`** — rebuilt (carries the curriculum change for the browser fallback brain).

### Env knobs (optional, own-line in the unit — systemd ignores inline comments)
- `DREAM_BC_RECTIFY_DECAY=0.5` — sem→motor weight-decay on rectify (lower = more aggressive; clamped ≤ 0.95).
- `DREAM_BC_RECTIFY_NORM=0.6` — row-norm target after the decay.

No knob is required — the defaults rectify + continue.

---

## 3. How to deploy this batch

Backend (`server/**` + the server-side `js/brain/*`) is **NOT auto-deployed**. Run the standard git-archive overlay on the box (from `deploy/REDEPLOY-NOTES.md`):

```bash
# 1. Pull latest main into a working clone (NOT /opt/unity-brain — it has no .git)
cd ~/unity-brain-src 2>/dev/null || git clone git@git.unityailab.com:UnityAILab/If-Only-I-Had-A-Brain.git ~/unity-brain-src && cd ~/unity-brain-src
git fetch origin && git checkout main && git pull --ff-only

# 2. Overlay the tracked tree onto the live dir (preserves runtime state)
git archive HEAD | sudo tar -x -C /opt/unity-brain

# 3. Restart (state preserved via DREAM_KEEP_STATE=1; no unit change → no daemon-reload)
sudo systemctl restart unity-brain

# 4. Confirm
sleep 3 && sudo systemctl status unity-brain --no-pager | head -20
```

No `deploy/unity-brain.service` change in this batch → **no `daemon-reload` needed**.

After this batch is on the box ONCE, Gee can self-serve future updates from the dashboard (see §5).

---

## 4. Verify after redeploy

With a donor connected + auto-advance ON, watch the server console (admin dashboard "Server Console" card, or `journalctl -u unity-brain -f`):

- **`✓ RECTIFIED sem→motor post-<cell> — saturation cleared (meanCos X → Y)`** where it used to print `⛔ SATURATION HALT`. (Proves the new code + a recovery happened.)
- The walk should cross **`kindergarten → grade1`** instead of parking.
- Weights persist every ~5 min: look for **`periodic-curriculum-checkpoint`** + **`saturation-rectify:<cell>`** save lines, and `brain-weights*.json` mtime advancing *during* the walk (not only on cell-pass).
- A `rectify … could not run (CPU CSR not resident)` line would mean the language-cortex CSR was GPU-only on that path — report it; it should be CPU-resident at current scale.

**Savestart button check:** click **⬆ Update & Savestart** → `self-update.log` shows `savestart mode … NOT writing .force-fresh`, and the boot logs `DREAM_KEEP_STATE=1 … KEEPING prior state` (not a wipe).

---

## 5. "Do I need Sponge?" — self-serve vs box-admin

**Self-serve from the dashboard (NO Sponge) once this batch is deployed once:**
- **⬆ Update & Fresh Walk** (`POST /update`) — overlay latest code + wipe → clean K→PhD walk.
- **⬆ Update & Savestart** (`POST /update?keep=1`) — overlay latest code + **keep training**.

**Still needs box-admin (Sponge):**
- The **FIRST deploy** of this batch (the new Savestart button can't deploy itself — chicken-and-egg). Either Gee clicks the existing **Update & Fresh Walk** (deploys the code but starts fresh — fine, it also tests the no-stall fix), or Sponge runs one manual overlay (savestart, keeps weights).
- Any change to **`deploy/unity-brain.service`** (needs `sudo systemctl daemon-reload`).
- One-time **button prerequisites** on the box, if not already in place:
  - `deploy/self-update.sh` present + executable (it ships in the repo/overlay).
  - `git` + `rsync` installed; the deploy key can clone the remote.
  - `sudo -n systemctl restart unity-brain` permitted for the service user.
  - `Restart=always` in the unit (already set) — the Update/Restart/Reset buttons rely on systemd reviving the process.

**No one-time wipe-prevention change is needed** — the unit already sets `Environment=DREAM_KEEP_STATE=1`, so `autoClearStaleState` resumes on any restart that doesn't write `.force-fresh`. Savestart simply omits `.force-fresh`. (A heavy update that changes brain size/format still fresh-starts safely via the boot compat gate, with a loud notice.)

---

## 6. Live-state spot check (2026-06-23, ~23 min uptime)

Pulled `GET /public-state.json` off the deploy. At that moment the brain was **healthy, not collapsed**: `basinHealth.saturated=false`, `semMotorMeanCos=0.159`, `ratio=5.46`, dominant token "tomato" at 9% (well under the 45% mode-collapse cap). Grades: ela/math/science/social/life at `kindergarten`, art at `pre-K` — still in the K tier (had not yet crossed to grade1, but early in the run). This snapshot can't confirm *which code* the box was running (rectify telemetry only fires when saturation is detected) — confirm via the console signals in §4 after redeploy.

---

## 7. Files in this batch

| File | Layer | Deploy |
|---|---|---|
| `js/brain/curriculum.js` | backend (server-side module) | redeploy |
| `server/brain-server.js` | backend | redeploy |
| `deploy/self-update.sh` | deploy script | ships in overlay |
| `html/dashboard.html` | frontend | auto on push to main |
| `js/app.bundle.js` | frontend | auto on push to main |
| `deploy/REDEPLOY-NOTES.md` · `docs/FINALIZED.md` · `docs/ADMIN-CONTROLS.md` · `docs/NOW.md` · `docs/ROADMAP.md` · `docs/TODO.md` · `docs/ISSUE-basin-collapse-fix.md` · `README.md` · `html/unity-guide.html` · `docs/SPONGE-HANDOFF.md` | docs/pages | n/a (docs) / frontend |

**Verification:** ESM `import()` clean (curriculum.js), `node --check` clean (brain-server.js), `bash -n` clean (self-update.sh), bundle rebuilt (3.8mb — carries `_rectifySemMotor`, old halt-return gone).

---

## 8. ⚠ Follow-up (same day) — the REAL "never gets past K" defaults (read this)

A `/super-review` after the above found two DEFAULTS that stop the walk at kindergarten **regardless** of the saturation fix. Both are now changed on `main` (and `develop`):

1. **Grade cap** — `curriculum.js` defaulted the walk cap to `'kindergarten'`; the loop `break`s past the cap. With no `DREAM_MAX_GRADE` env (the unit doesn't set one), the walk stopped at K by design. Default is now `'phd'` (uncapped). **Action: none** — you do NOT need to add `DREAM_MAX_GRADE` to the unit (the default is now full K→PhD; only set it if you want to *cap lower* for a test).
2. **Auto-advance** — `brain-server.js` defaulted `_autoAdvanceGrade` to `false`, so the runner **pauses at every grade boundary** waiting for a dashboard signoff click — fatal for an unattended walk. Default is now `true`. **⚠ Action for the box:** the standalone `server/auto-advance.json` (if present) OVERRIDES the default. If that file exists with `"enabled": false`, the walk will STILL pause — flip auto-advance ON in the admin dashboard (or `rm server/auto-advance.json`) so the unattended K→PhD walk proceeds.

Both ride the **same backend redeploy** as §3 (overlay + `systemctl restart`). After redeploy, confirm the walk crosses `kindergarten → grade1 → …` without pausing.
