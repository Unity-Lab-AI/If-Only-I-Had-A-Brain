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
#   UAL_DEPLOY_USER  identity sent as X-UAL-User on the no-sudo loopback
#                    /restart fallback (default "self-update"). Deployed boxes
#                    run UAL_PROXY_AUTH=1, so requireLoopback() rejects a
#                    header-less loopback POST — the fallback MUST vouch an
#                    identity or it 403s and the restart silently never fires.
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
BRAIN_PORT="${UAL_BRAIN_PORT:-7525}"
DEPLOY_AUTH_USER="${UAL_DEPLOY_USER:-self-update}"
LOG="${BACKEND_DIR}/self-update.log"

# WL.4 — tee to BOTH the file AND stdout. The brain-server spawns this with piped
# stdio and console.log's each line into the admin Server Console ring, so a dashboard
# operator watches the deploy live instead of needing shell to read this file.
log() { echo "[self-update] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG"; }

log "START — overlay ${GIT_BRANCH} from ${GIT_REMOTE} -> ${BACKEND_DIR}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Fetch the latest as a shallow clean tree (overlay source — the backend dir
# itself stays .git-less).
if ! git clone --depth 1 --branch "$GIT_BRANCH" "$GIT_REMOTE" "$TMP/src" >> "$LOG" 2>&1; then
  log "FATAL — git clone failed; aborting (service NOT restarted, weights intact)."
  exit 1
fi

# Capture the DEPLOY IDENTITY from the exact tree we just cloned. This is the
# authoritative "which code is about to run" stamp — written into the backend
# AFTER the overlay so the freshly-booted server reads it and surfaces it on
# /public-state.json + the dashboard header. Independent of the version.js
# BUILD stamp (which is push-time and can go stale), so it never lies about
# what actually deployed.
DEPLOYED_SHA="$(git -C "$TMP/src" rev-parse HEAD 2>/dev/null || echo unknown)"
DEPLOYED_SHORT="$(git -C "$TMP/src" rev-parse --short=8 HEAD 2>/dev/null || echo unknown)"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "deploy identity: ${DEPLOYED_SHORT} (${GIT_BRANCH}) sha=${DEPLOYED_SHA}"

# ── STATEWIPE (2026-08-20) — SIX runtime files were being DELETED by --delete on
# every single Update, and not one of them was even mentioned in this script.
# Found by auditing every `path.join(__dirname, '...')` the server writes
# against this exclude list, after LANGRAM's geometry pin could not be verified
# on the box no matter how many times it was written.
#
# `lang-geometry.json` is the worst of them: it IS the LANGRAM.6 geometry pin,
# and LANGRAM.7's fresh-walk floor stands on it. Deleting it every deploy meant
# the pin could never survive to be honoured, leaving the language cortex free
# to be re-derived from `os.freemem()` on each update — the precise failure
# those two items exist to prevent. Both shipped the day this was found and
# both were dead on arrival because of this list.
#
# `.resume-marker.json` is the second: it is where the walk resumes, so an
# Update & SAVESTART kept the weights and threw away the pointer into them.
# `operator-identity.json` and `resource-config.json` are operator-owned config
# that exists ONLY on the box (neither is tracked), so a deploy silently
# reverted them. `brain-code-hash.json` feeds stale-state detection, and
# `.last-boot-reason.json` is the boot-reason history the diagnostics read.
#
# All six are RUNTIME STATE, not code — exactly what this exclude list is for.
#
# `.loop-freeze.json` joined the list with LOOPNAME.8. It is the watchdog
# thread's artifact, and its whole value is surviving the event it records: a
# `state: STALLED` file still sitting there after a reboot is the proof that the
# previous process never came back. A deploy deleting it would erase exactly the
# evidence of the freeze that prompted the deploy.
#
# THE RULE: anything the server writes under `__dirname` belongs in this list,
# or a deploy eats it — and that includes files written by its worker threads.
# NOTE FOR EDITORS: this comment lives ABOVE the command on
# purpose. A `#` line inside the backslash continuation would make the shell
# comment out every remaining `--exclude` AND the source/dest arguments.
#
# Overlay code, PRESERVING runtime state + secrets + node_modules. --delete
# removes stale files EXCEPT the excluded runtime/secret paths.
#   ⚠ community-tier.json is LOAD-BEARING state: the DF.7 milestone gate writes
#   it when the community tier resizes the brain, and the boot-scaler reads it
#   to size the brain to the saved weights. Deleting it makes the next boot
#   size to the RAM-safe base instead → size mismatch vs the resume marker →
#   autoClearStaleState WIPES the trained weights on an otherwise-safe
#   savestart (exactly what happened 2026-07-08 00:49; weights restored from
#   the pre-deploy backup). Any file the boot-scaler or resume gate reads MUST
#   be excluded here.
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
  --exclude 'community-tier.json' \
  --exclude 'server/community-tier.json' \
  --exclude 'auto-advance.json' \
  --exclude 'server/auto-advance.json' \
  --exclude 'definition-cache.json' \
  --exclude 'server/definition-cache.json' \
  --exclude 'mindspace-memory*.json' \
  --exclude 'server/mindspace-memory.json' \
  --exclude 'visual-memory*.json' \
  --exclude 'server/visual-memory*.json' \
  --exclude 'visual-memory*.db*' \
  --exclude 'server/visual-memory*.db*' \
  --exclude 'art-notdrawable.json' \
  --exclude 'server/art-notdrawable.json' \
  --exclude 'pollinations-admin.json' \
  --exclude 'server/pollinations-admin.json' \
  --exclude 'pollinations-user.json' \
  --exclude 'user.json' \
  --exclude 'deployed-build.json' \
  --exclude 'server/deployed-build.json' \
  --exclude 'lang-geometry.json' \
  --exclude 'server/lang-geometry.json' \
  --exclude '.resume-marker.json' \
  --exclude 'server/.resume-marker.json' \
  --exclude 'operator-identity.json' \
  --exclude 'server/operator-identity.json' \
  --exclude 'resource-config.json' \
  --exclude 'server/resource-config.json' \
  --exclude 'brain-code-hash.json' \
  --exclude 'server/brain-code-hash.json' \
  --exclude '.last-boot-reason.json' \
  --exclude 'server/.last-boot-reason.json' \
  --exclude '.last-breadcrumb.json' \
  --exclude 'server/.last-breadcrumb.json' \
  --exclude '.loop-freeze.json' \
  --exclude 'server/.loop-freeze.json' \
  --exclude '.claude' \
  "$TMP/src/" "$BACKEND_DIR/" >> "$LOG" 2>&1 || { log "FATAL — rsync overlay failed; aborting."; exit 1; }

# Stamp the deploy identity into the backend (AFTER overlay so --delete can't
# nuke it; excluded above so a partial future deploy leaves the last-good stamp).
printf '{"sha":"%s","short":"%s","branch":"%s","deployedAt":"%s"}\n' \
  "$DEPLOYED_SHA" "$DEPLOYED_SHORT" "$GIT_BRANCH" "$DEPLOYED_AT" \
  > "$BACKEND_DIR/server/deployed-build.json" 2>>"$LOG" \
  && log "wrote server/deployed-build.json — server will surface ${DEPLOYED_SHORT} on /public-state.json + dashboard." \
  || log "WARN — could not write deployed-build.json (non-fatal; server falls back to git/unknown)."

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

# TU.30 — pin the CURRENT brain PID before attempting any restart. The /update handler
# sets the shutdown flag BEFORE spawning this script, and /restart treats that flag as
# "already restarting" and silently NO-OPS — the interlock that made every dashboard
# Update press overlay the code but never actually restart the process (uptime just
# kept climbing on the old code). With the PID pinned we can VERIFY the exit landed
# and escalate to a direct same-user SIGTERM (no sudo; the SIGTERM handler force-saves
# + drops the resume marker, systemd Restart=always revives the overlaid code).
BRAIN_PID="$(pgrep -of 'node.*brain-server\.js' 2>/dev/null || true)"
if sudo -n systemctl restart "$SERVICE" >> "$LOG" 2>&1; then
  log "DONE — ${SERVICE} restarted via sudo"
elif systemctl restart "$SERVICE" >> "$LOG" 2>&1; then
  log "DONE — ${SERVICE} restarted"
elif curl -fsS -m 120 -X POST -H "X-UAL-User: ${DEPLOY_AUTH_USER}" "http://127.0.0.1:${BRAIN_PORT}/restart" >> "$LOG" 2>&1; then
  # WL.4 — NO-SUDO fallback. If neither systemctl restart worked (the service runs
  # under NoNewPrivileges, so a script SPAWNED by the brain-server can't escalate
  # via sudo even with a sudoers grant), trigger the loopback /restart endpoint:
  # the server force-saves + process.exit's, and systemd Restart=always revives the
  # freshly overlaid code. Requires Restart=always in the unit + the server
  # reachable on loopback. This is what makes the dashboard Update button self-serve
  # WITHOUT any sudoers setup.
  #   ⚠ The X-UAL-User header is REQUIRED: deployed boxes run UAL_PROXY_AUTH=1, so
  #   requireLoopback() gates /restart on a proxy-vouched identity. A header-less
  #   loopback POST returns 403 — the restart would silently never fire and the box
  #   would keep running the OLD code after a successful overlay (the exact reason
  #   the dashboard Update buttons appeared to "do nothing" pre-2026-07-06). nginx
  #   strips client-supplied X-UAL-User only on the PUBLIC path; this is a direct
  #   loopback call (nginx not in the path), so the header sails through the gate.
  log "DONE — restart triggered via loopback POST /restart (X-UAL-User=${DEPLOY_AUTH_USER}; process.exit → systemd Restart=always revives the overlaid code; NO sudo needed)."
else
  if [ -n "$BRAIN_PID" ]; then
    # All three direct restart paths failed (typical cause: the brain's event
    # loop is pinned for 40-60s at biological scale and even a patient loopback
    # curl can time out). Do NOT abort — the TU.30 PID escalation below owns
    # this case: SIGTERM the pinned PID directly (same user, no sudo; the
    # handler force-saves + systemd Restart=always revives the overlaid code).
    log "WARN — sudo/systemctl/loopback restart all failed; falling through to the PID escalation (SIGTERM $BRAIN_PID) below."
  else
    log "FATAL — could not restart ${SERVICE}: all paths failed AND no brain PID found to escalate on. Fix ONE of: (1) grant the service user 'sudo -n systemctl restart ${SERVICE}' AND drop NoNewPrivileges, or (2) ensure the server is reachable on 127.0.0.1:${BRAIN_PORT} with Restart=always + a non-empty X-UAL-User (UAL_DEPLOY_USER). Manual: sudo systemctl restart ${SERVICE}"
    exit 1
  fi
fi

# TU.30 — VERIFY the restart actually landed. If the pinned PID is still alive after a
# grace window, the /restart endpoint swallowed the request ("already restarting" no-op
# from the /update shutdown-flag interlock) — escalate: SIGTERM the pinned PID directly.
# PID-pinned so a systemd-revived NEW process can never be mistakenly killed.
if [ -n "$BRAIN_PID" ]; then
  sleep 8
  if kill -0 "$BRAIN_PID" 2>/dev/null; then
    log "restart did NOT land — PID $BRAIN_PID still alive (the /update shutdown-flag interlock swallows the /restart POST). Escalating: kill -TERM $BRAIN_PID (same-user, no sudo; SIGTERM handler force-saves + drops the resume marker; systemd Restart=always revives the overlaid code)."
    kill -TERM "$BRAIN_PID" 2>/dev/null || log "kill -TERM failed (process may have exited between checks)"
    sleep 6
    if kill -0 "$BRAIN_PID" 2>/dev/null; then
      log "PID $BRAIN_PID STILL alive after SIGTERM — final escalation: kill -KILL (weights were checkpointed continuously; boot resume relies on the last periodic save)."
      kill -KILL "$BRAIN_PID" 2>/dev/null || true
    fi
  else
    log "restart verified — PID $BRAIN_PID exited; systemd revives the overlaid code."
  fi
fi
