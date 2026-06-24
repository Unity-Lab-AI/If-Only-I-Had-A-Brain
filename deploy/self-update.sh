#!/usr/bin/env bash
# deploy/self-update.sh — dashboard "Update & Fresh Walk" worker.
#
# Re-pulls the latest project code via a git-archive overlay (the backend
# deploy dir has NO .git — see deploy/REDEPLOY-NOTES.md), CLEARS the trained
# weights (force-fresh), and restarts the service so it boots the new code
# into a clean K→PhD walk.
#
# Invoked DETACHED by the brain-server `/update` endpoint (dashboard button).
# Runs independently of the node process; the `systemctl restart` at the end
# replaces the running server with the freshly-overlaid code. Because the
# restart happens AFTER the overlay completes, there is no old-code/new-code
# race.
#
# Env (all overridable; defaults match deploy/REDEPLOY-NOTES.md):
#   UAL_BACKEND_DIR  backend deploy dir   (default /opt/unity-brain)
#   UAL_GIT_REMOTE   git remote URL       (default git@git.unityailab.com:UnityAILab/If-Only-I-Had-A-Brain.git)
#   UAL_GIT_BRANCH   branch to pull       (default main)
#   UAL_SERVICE      systemd service name (default unity-brain)
#   UAL_KEEP_STATE   "1" = SAVESTART mode — overlay new code but DON'T write
#                    .force-fresh, so the restart RESUMES the saved weights
#                    (relies on DREAM_KEEP_STATE=1 in the unit). Anything else
#                    (default) = the original fresh-walk wipe.
#
# Requires on the box: git, rsync, and sudo rights to `systemctl restart`
# the service (or run as a user that can). The deploy key must be able to
# clone the remote.
set -euo pipefail

BACKEND_DIR="${UAL_BACKEND_DIR:-/opt/unity-brain}"
GIT_REMOTE="${UAL_GIT_REMOTE:-git@git.unityailab.com:UnityAILab/If-Only-I-Had-A-Brain.git}"
GIT_BRANCH="${UAL_GIT_BRANCH:-main}"
SERVICE="${UAL_SERVICE:-unity-brain}"
KEEP_STATE="${UAL_KEEP_STATE:-0}"
LOG="${BACKEND_DIR}/self-update.log"

log() { echo "[self-update] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG" 2>&1; }

log "START — overlay ${GIT_BRANCH} from ${GIT_REMOTE} -> ${BACKEND_DIR}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Fetch the latest as a shallow clean tree (overlay source — the backend dir
# itself stays .git-less).
if ! git clone --depth 1 --branch "$GIT_BRANCH" "$GIT_REMOTE" "$TMP/src" >> "$LOG" 2>&1; then
  log "FATAL — git clone failed; aborting (service NOT restarted, weights intact)."
  exit 1
fi

# Overlay code, PRESERVING runtime state + secrets + node_modules. --delete
# removes stale files EXCEPT the excluded runtime/secret paths.
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'server/.env' \
  --exclude 'brain-weights*' \
  --exclude 'server/brain-weights*' \
  --exclude 'schemas.json' \
  --exclude 'server/schemas.json' \
  --exclude 'identity-core.json' \
  --exclude 'server/identity-core.json' \
  --exclude 'episodic-memory.db*' \
  --exclude 'server/episodic-memory.db*' \
  --exclude 'conversations.json' \
  --exclude 'server/conversations.json' \
  --exclude 'autoscale-settings.json' \
  --exclude 'server/autoscale-settings.json' \
  --exclude 'auto-advance.json' \
  --exclude 'server/auto-advance.json' \
  --exclude 'definition-cache.json' \
  --exclude 'server/definition-cache.json' \
  --exclude 'pollinations-user.json' \
  --exclude 'user.json' \
  --exclude '.claude' \
  "$TMP/src/" "$BACKEND_DIR/" >> "$LOG" 2>&1 || { log "FATAL — rsync overlay failed; aborting."; exit 1; }

# Re-install deps if package.json changed (best-effort, non-fatal).
( cd "$BACKEND_DIR/server" && npm install --omit=dev >> "$LOG" 2>&1 ) || log "npm install skipped/failed (non-fatal)"

# SAVESTART vs FRESH WALK. In fresh-walk mode (default) we write .force-fresh
# so the brain-server's autoClearStaleState wipes trained state at boot
# (regardless of DREAM_KEEP_STATE / resume marker; identity-core Tier 3 kept).
# In savestart mode (UAL_KEEP_STATE=1) we DON'T write it — the restart then
# resumes the saved weights via the unit's DREAM_KEEP_STATE=1 (a heavy update
# that changed brain size/format still safely fresh-starts via the boot
# compat gate). This is the "deploy a fix without losing training" path.
if [ "$KEEP_STATE" = "1" ]; then
  log "savestart mode (UAL_KEEP_STATE=1) — NOT writing .force-fresh; restart will RESUME saved weights."
  log "overlay complete — restarting ${SERVICE} (savestart, weights preserved)"
else
  printf '{"requestedAt": %s000, "via": "dashboard /update self-update.sh"}\n' "$(date +%s)" > "$BACKEND_DIR/server/.force-fresh"
  log "fresh-walk mode — wrote .force-fresh; weights will be wiped on restart."
  log "overlay complete — restarting ${SERVICE} into a fresh walk"
fi

# Restart — new code + cleared weights boot; with auto-advance ON the walk
# starts itself. Prefer sudo; fall back to plain systemctl if already root.
if sudo -n systemctl restart "$SERVICE" >> "$LOG" 2>&1; then
  log "DONE — ${SERVICE} restarted via sudo"
elif systemctl restart "$SERVICE" >> "$LOG" 2>&1; then
  log "DONE — ${SERVICE} restarted"
else
  log "FATAL — could not restart ${SERVICE}; run: sudo systemctl restart ${SERVICE}"
  exit 1
fi
