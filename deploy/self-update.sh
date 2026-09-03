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
  --exclude 'fields' \
  --exclude 'corpora' \
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

# ── THE DATA REPO — ONE SOURCE FOR THE BOOKS *AND* THE WAVELET FIELDS ─────────
#
# Operator, twice: *"we will jsut put all the wavlets in the main brain repo
# wher they belong so when update freshwalk is read it will pull it all properly
# and run it and she can see the wavelts and train on them"*, then — after
# finding the corpus and the fields living in two different repos — *"we need to
# makes suure there is only one repo with all the corpus and fields, PERIOD!
# Then when it auto downloads it to the server when pressing update freshwalk
# the server then trains Unity on it as the books and information that trains
# her via pgase cell grade course ciriculim corpus.... directly"*.
#
# He has NO server access — only the dashboard buttons — so this is the ONLY
# place the fetch can live.
#
# ⛔ WHAT WAS WRONG: the press pulled the BOOKS out of the code repo (`corpora/`
# rode the shallow clone) and the FIELDS out of this one. Two repos fed one
# brain, through two clone paths, with two ways to go stale — and they already
# had: the data repo's corpus mirror predated both the deepening pass and the
# topic-list expansion. `corpora` is now on the code-clone EXCLUDE list above and
# comes from here instead, so there is exactly one source of truth for what she
# reads.
#
# ⛔ AND THE CODE REPO COULD NEVER HAVE BEEN THAT SOURCE. `If-Only-I-Had-A-Brain`
# pushes to a PUBLIC GitHub remote; the fields are hundreds of GB of Git LFS and
# cannot go there. `corpora/glove.6B.300d.txt` proves the same point from the
# other side — it is GITIGNORED in the code repo and LFS-tracked here, so before
# this change a press delivered no embeddings at all and the box had to be fed by
# hand. One Forgejo-only data repo fixes both.
#
# ⛔⛔ `git clone --depth 1` IS NOT LFS-AWARE. `*.field.json` is an LFS filter,
# so without `git lfs pull` every file on disk is a ~130-byte POINTER STUB —
# a real file, so a naive existence check reports a healthy cache while she
# perceives nothing. `server/figure-field-store.js` refuses stubs and counts
# them separately for exactly this reason; this side must still fetch properly.
#
# ⚠ `fields` AND `corpora` are both on the rsync --delete EXCLUDE list above, or
# the next press would delete everything this step just downloaded.
#
# ⛔⛔ THE FIELDS ARE NON-FATAL AND THE BOOKS ARE NOT, AND THAT ASYMMETRY IS THE
# WHOLE SAFETY OF THIS BLOCK. A missing field costs a live fetch + transform,
# which is the behaviour that shipped before any of this existed. A missing
# CORPUS means she boots with nothing to read and walks a curriculum of empty
# cells — so if this step cannot leave books on the box, the deploy ABORTS
# rather than restarting her into an empty library. It aborts BEFORE .force-fresh
# is written, so a failed data sync can never cost the trained weights either.
DATA_REMOTE="${UAL_FIELDS_REMOTE:-git@git.unityailab.com:UnityAILab/BrainWaves.git}"
FIELDS_DIR="${UAL_FIELDS_DIR:-$BACKEND_DIR/fields}"
CORPORA_DIR="${UAL_CORPORA_DIR:-$BACKEND_DIR/corpora}"
_corpus_ok=0
# ⛔⛔ THE TWO HALVES OF THIS SYNC ARE NOT THE SAME SIZE AND MUST NOT SHARE A
# SWITCH. The books are ~400 MB and the walk CANNOT RUN without them; the fields
# are ~114 GB today and are explicitly non-fatal — a missing field means she
# transforms that figure live, which is the correct path and always was.
#
# `UAL_SKIP_FIELDS` is named for the fields and gates the WHOLE block, so setting
# it to skip a 114 GB download also silently skips the books. It is kept for
# compatibility and still means "skip everything", but the honest lever is below.
#
# `UAL_FIELDS=0` pulls the books and SKIPS THE FIELD BLOBS — a press that costs
# minutes instead of hours, at the price of live-transforming figures during the
# walk. Default stays 1 so nothing changes for a box that wants them.
_want_fields="${UAL_FIELDS:-1}"
if [ "${UAL_SKIP_FIELDS:-0}" = "1" ]; then
  log "data sync SKIPPED ENTIRELY (UAL_SKIP_FIELDS=1) — using whatever books and fields are already on the box. NOTE: this skips the BOOKS too; use UAL_FIELDS=0 if you only meant to skip the 114 GB of field blobs."
elif ! command -v git-lfs >/dev/null 2>&1 && ! git lfs version >/dev/null 2>&1; then
  log "WARN — git-lfs NOT INSTALLED on this box. Skipping the data sync rather than filling the disk with pointer stubs. Install git-lfs to enable it."
else
  FTMP="$(mktemp -d)"
  if [ "$_want_fields" = "1" ]; then
    log "data sync — pulling books + wavelet fields from ${DATA_REMOTE} (overwrites in place)"
  else
    log "data sync — pulling BOOKS ONLY from ${DATA_REMOTE} (UAL_FIELDS=0). Field blobs are skipped; she will transform each figure live, which is slower per figure and costs no download."
  fi
  # ⛔ `git lfs pull` IS THE 114 GB, NOT THE CLONE. The clone is
  # `--filter=blob:none` and therefore cheap whatever is in the repo; it is the
  # LFS fetch that pulls the field payloads. Restricting it with `-I` is what
  # actually saves the download — skipping the rsync afterwards would still have
  # paid for every byte.
  _lfs_pull() {
    if [ "$_want_fields" = "1" ]; then ( cd "$FTMP/bw" && git lfs pull >> "$LOG" 2>&1 );
    else ( cd "$FTMP/bw" && git lfs pull -I 'corpora/**' >> "$LOG" 2>&1 ); fi
  }
  if git clone --depth 1 --branch main --filter=blob:none "$DATA_REMOTE" "$FTMP/bw" >> "$LOG" 2>&1 \
     && _lfs_pull; then
    mkdir -p "$FIELDS_DIR" "$CORPORA_DIR"
    # THE BOOKS FIRST — this is the half the walk cannot run without.
    # --delete so a cell removed upstream disappears here too; this directory is
    # OURS and holds nothing the server writes, so a full mirror is honest.
    if [ -d "$FTMP/bw/corpora" ] && rsync -a --delete "$FTMP/bw/corpora/" "$CORPORA_DIR/" >> "$LOG" 2>&1; then
      _ccount="$(find "$CORPORA_DIR" -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
      _csize="$(du -sh "$CORPORA_DIR" 2>/dev/null | cut -f1)"
      log "corpus sync OK — ${_ccount} corpus files (${_csize}) at ${CORPORA_DIR}; this is what she is taught from."
      _corpus_ok=1
    else
      log "WARN — corpus rsync failed or the data repo has no corpora/; falling back to whatever is already on the box."
    fi
    # THE FIELDS SECOND — her precomputed view of every picture. Non-fatal.
    # ⛔ NO `--delete` WHEN THE FIELDS WERE NOT FETCHED. With UAL_FIELDS=0 the
    # source directory is a tree of un-smudged pointers or absent entirely, and a
    # mirroring rsync would DELETE every field already on the box — turning "skip
    # a download" into "destroy the store". The skip path does not rsync at all.
    if [ "$_want_fields" != "1" ]; then
      _fkept="$(find "$FIELDS_DIR" \( -name '*.field.json' -o -name '*.field.json.gz' \) 2>/dev/null | wc -l | tr -d ' ')"
      log "field sync SKIPPED (UAL_FIELDS=0) — ${_fkept} fields already on the box are LEFT UNTOUCHED; every figure without one is transformed live."
    elif rsync -a --delete "$FTMP/bw/fields/" "$FIELDS_DIR/" >> "$LOG" 2>&1; then
      # ⚠ BOTH ENCODINGS COUNTED. Fields are written gzipped now, and a glob
      # anchored to the old name reported a healthy sync as zero fields — the
      # instrument saying nothing is there while everything is.
      _fcount="$(find "$FIELDS_DIR" \( -name '*.field.json' -o -name '*.field.json.gz' \) 2>/dev/null | wc -l | tr -d ' ')"
      _fsize="$(du -sh "$FIELDS_DIR" 2>/dev/null | cut -f1)"
      log "field sync OK — ${_fcount} wavelet fields (${_fsize}) at ${FIELDS_DIR}; she reads these instead of re-transforming."
    else
      log "WARN — field rsync failed; keeping whatever was already on disk (live transform covers the rest)."
    fi
  else
    log "WARN — data clone/lfs-pull failed; keeping whatever books and fields are already on disk."
  fi
  rm -rf "$FTMP"
fi

# ⛔ THE BOOKS GATE. Whether the sync ran, was skipped, or failed, the one thing
# that must be true before a restart is that there ARE books on the box. A press
# that leaves her with an empty corpus produces a walk of empty cells and reports
# it as a successful deploy — the exact "instrument says fine while nothing is
# there" failure this project keeps paying for. Checked against the directory the
# server actually reads, not against the exit code of the step above.
if [ "$_corpus_ok" != "1" ]; then
  _have="$(find "$CORPORA_DIR/academic" -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${_have:-0}" -lt 1 ]; then
    log "FATAL — no corpus on the box (${CORPORA_DIR}/academic is empty or missing) and the data sync did not provide one. ABORTING before .force-fresh is written, so the trained weights are untouched and the service keeps running the old code. Fix the data repo pull (${DATA_REMOTE}) and press again."
    exit 1
  fi
  log "corpus: sync did not run, but ${_have} academic cells are already on the box — continuing with those."
fi

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
