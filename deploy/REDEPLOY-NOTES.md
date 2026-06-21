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
- `server/brain-server.js` — #32 cortex-upload failure surfaced to admin dashboard (no more silent CPU limp); #33 donor-socket ping/pong heartbeat (evicts half-open primaries so failover fires); #30 `gpu_telemetry` message handler.
- `server/brain-server/chat.js` — #30 `perf.gpuPool` donor-fleet aggregation + `perf.cortexUploadFailure` field in `_updatePerfStats`.

**Frontend files changed (auto-deploy, no action):**
- `js/brain/remote-brain.js` + rebuilt `js/app.bundle.js` — #29 public visitors connect to the public `/ws` lane (see the real scaling neuron count, not the 7k fallback).
- `html/compute.html` — #30 donor sends its own telemetry + shows "YOUR GPU".
- `html/dashboard.html` — #30 GPU card shows the donor pool + #32 upload-failure red banner.

**No systemd unit change in this cluster** → no `daemon-reload` needed, just restart.

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
- If the cross-projection upload fails, a **red ⚠ banner** appears in that card with the reason — if it says **"binding-size limit"**, that's the signal the flagless-donor work (#31) needs server-side matrix tiling (or the donor needs `--enable-unsafe-webgpu`). If it says `_cortexFullyReady = true` in the Server Console with no banner, the upload succeeded.
