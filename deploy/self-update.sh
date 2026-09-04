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

# ⛔⛔ EVERY COUNT AND SIZE IN THIS SCRIPT GOES THROUGH THESE THREE, AND THAT IS
# THE WHOLE POINT — THE SCRIPT DIED SILENTLY IN PRODUCTION FOR WANT OF THEM.
#
# 2026-09-04, on the box: the data-repo clone failed, so the books gate ran to
# report it — and the gate's own first line was
#
#   _have="$(find "$CORPORA_DIR/academic" -name '*.json' 2>/dev/null | wc -l …)"
#
# With `set -euo pipefail` and `$CORPORA_DIR/academic` missing, `find` exits
# non-zero, `pipefail` propagates it out of the pipeline, the ASSIGNMENT fails,
# and `set -e` terminates the script — **before the FATAL line it was about to
# print.** The press simply stopped, logging nothing after the clone warning.
# Reproduced locally, exactly: exit 1, and the message never printed.
#
# ⭐ Not restarting was the correct outcome. Telling nobody why was not: a gate
# whose entire job is to refuse loudly instead became the quietest failure in
# the script, and it did it at the one moment anyone was watching.
#
# ⛔ THERE WERE EIGHT SITES OF THIS SHAPE, not one. Only the books gate had
# fired; the other seven were the same bug waiting on a missing directory or a
# `du` that cannot stat. They are all routed through here so a future count
# cannot reintroduce it — a `|| true` sprinkled on the one that bit us would
# have left seven.
#
# ⚠ These NEVER fail and never return empty. An unknown count reads 0 and an
# unknown size reads `?`, which is the honest answer and a safe one to compare.
# ⛔⛔ EVERY GATE ABORT GOES THROUGH HERE, AND IT DISARMS THE WIPE ON THE WAY OUT.
#
# The gates used to say *"ABORTING before .force-fresh is written, so the trained
# weights are untouched"* — and that was FALSE. The `/update` handler writes
# `.force-fresh` BEFORE it spawns this script ("ARMED in the server dir
# (handler-side; survives any restart path)"), so by the time any gate runs the
# flag is already on disk. A gate cannot abort "before" something that already
# happened.
#
# ⛔ THE CONSEQUENCE WAS A LANDMINE. A refused deploy left the wipe armed for the
# NEXT restart from any cause at all — a Restart press, systemd, an OOM, a
# reboot — and `brain-server.js` only clears a stale flag in `/savererun`,
# deliberately not in `/restart`. So a press that correctly refused to run still
# armed a weight-wipe that would fire later, for an unrelated reason, with
# nobody connecting the two.
#
# ⭐ If the deploy is not proceeding, the fresh-walk intent it was armed for is
# not happening either. The next press re-arms it; nothing is lost by disarming
# a press that already failed.
_abort() {
  local _ff="${BACKEND_DIR}/server/.force-fresh"
  if [ -f "$_ff" ]; then
    if rm -f "$_ff" 2>/dev/null; then
      log "DISARMED .force-fresh — this deploy is not restarting her, so the pending weight-wipe is cleared. It was armed by the /update handler before this script started; leaving it would wipe the weights at the next restart from ANY cause, long after this press."
    else
      log "⛔ WARN — could NOT remove ${_ff}. A weight-wipe is still armed and will fire at the next restart from any cause. Do not restart until it is cleared."
    fi
  fi
  exit 1
}
_count() { local n; n="$( { find "$@" 2>/dev/null || true; } | wc -l | tr -d ' ' )" || n=0; printf '%s' "${n:-0}"; }
_size()  { local s; s="$( { du -sh "$1" 2>/dev/null || true; } | cut -f1 )" || s='?'; printf '%s' "${s:-?}"; }
# ⚠ THE REDIRECTION IS INSIDE THE SILENCED GROUP, not on `wc`. `wc -c < missing`
# fails when the SHELL opens the file, before wc runs, so `wc … 2>/dev/null`
# cannot suppress it and the deploy log gains a bare "No such file or directory"
# with no context. The value was already correct; this stops the noise.
_bytes() { local n; n="$( { wc -c < "$1"; } 2>/dev/null || true )" || n=0; printf '%s' "${n:-0}"; }

log "START — overlay ${GIT_BRANCH} from ${GIT_REMOTE} -> ${BACKEND_DIR}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Fetch the latest as a shallow clean tree (overlay source — the backend dir
# itself stays .git-less).
if ! git clone --depth 1 --branch "$GIT_BRANCH" "$GIT_REMOTE" "$TMP/src" >> "$LOG" 2>&1; then
  log "FATAL — git clone of the CODE repo failed; aborting (service NOT restarted)."
  _abort
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
  --exclude 'knob-defaults.json' \
  --exclude 'server/knob-defaults.json' \
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
  --exclude 'corpora/glove.6B.*' \
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

# ── THE DATA REPO IS ON THIS MACHINE ──────────────────────────────────────────
#
# ⭐⭐ `git.unityailab.com` IS THIS BOX. Both `deploy/REDEPLOY-NOTES.md` ("shares
# the host with Forgejo") and `deploy/README.md` ("sshd on this shared box") say
# so, and it was the operator who pointed it out after a long chase down the
# wrong path. **The SSH clone above loops back to the same machine**, which is
# why it needs a credential at all — and why it does not have to.
#
# ⛔ WHAT THIS FIXES: on 2026-09-04 the box could not clone the data repo. The
# `unity-box self-update (read-only)` deploy key is scoped to the CODE repo and
# was created 2026-06-28 — two months before ONEREPO introduced a second repo.
# It is not broken; it was never asked to do this. Reading the repository off
# local disk needs no credential at all.
#
# ⚠ WHAT IT DOES AND DOES NOT GET, STATED PLAINLY:
#   • the CORPUS — plain git blobs → arrives ✓
#   • GloVe — a plain blob since it came off LFS today → arrives ✓
#   • the wavelet FIELDS — git-LFS, which resolves over HTTP and NOT over a
#     filesystem path → stays as pointers ✗
# Those first two are the ones that stop the walk. A missing field is non-fatal
# by design and always was: she transforms that figure live instead. So this
# lands a correct walk, and the field cache reattaches later.
#
# ⚠ The path is DISCOVERED, not assumed — Forgejo/Gitea have used several repo
# roots across versions and packagings, and guessing one and reporting failure
# would be worse than the SSH path we already have. Every candidate is tested
# with `git rev-parse`, so a directory that exists but is not a repository, or
# is not readable by the service user, is rejected rather than half-used.
# `UAL_DATA_LOCAL_PATH` overrides the search outright.
_local_data=''
# ⭐⭐ SEARCH, DO NOT JUST GUESS. The first cut of this probed eight hardcoded
# paths, found nothing on the live box, and reported "not found on local disk" —
# which was true of my guesses and told us nothing about the machine. Forgejo's
# repository root is configurable and moves between packagings, so the fixed
# list is tried first (fast, no I/O storm) and then an actual BOUNDED search
# runs. `-print -quit` stops at the first hit, so this costs one directory walk
# and not a full filesystem scan.
_search_local_repo() {
  local root p
  for root in /var/lib /home /data /srv /opt /mnt /var/opt; do
    [ -d "$root" ] || continue
    p="$( { find "$root" -maxdepth 6 -type d -name 'brainwaves.git' -print -quit 2>/dev/null || true; } )"
    if [ -n "$p" ] && git -C "$p" rev-parse --git-dir >/dev/null 2>&1; then printf '%s' "$p"; return 0; fi
  done
  return 1
}
for _cand in \
  "${UAL_DATA_LOCAL_PATH:-}" \
  /var/lib/forgejo/repositories/unityailab/brainwaves.git \
  /var/lib/gitea/data/repositories/unityailab/brainwaves.git \
  /var/lib/gitea/repositories/unityailab/brainwaves.git \
  /home/git/gitea-repositories/unityailab/brainwaves.git \
  /home/forgejo/forgejo-repositories/unityailab/brainwaves.git \
  /data/git/repositories/unityailab/brainwaves.git \
  /data/gitea/repositories/unityailab/brainwaves.git ; do
  [ -n "$_cand" ] || continue
  if git -C "$_cand" rev-parse --git-dir >/dev/null 2>&1; then _local_data="$_cand"; break; fi
done
if [ -z "$_local_data" ]; then
  log "data repo not at any known path — searching the filesystem for it (bounded, first hit wins)…"
  _local_data="$(_search_local_repo || true)"
fi
if [ -n "$_local_data" ]; then
  log "data repo found ON THIS BOX at ${_local_data} — cloning from local disk instead of over SSH. No credential is involved, and the corpus and embedding table are plain blobs so they arrive in full."
  DATA_REMOTE="$_local_data"
else
  log "data repo not found on local disk (known paths AND a bounded search) — using ${DATA_REMOTE} over SSH, which needs the box's deploy key to be authorised on that repo."
fi

# ── FORGEJO'S LFS STORE, FOR THE WAVELET FIELDS ───────────────────────────────
#
# ⭐⭐ THE FIELDS ARE ALREADY ON THIS MACHINE. Forgejo runs on this box, so its
# LFS objects — all 114 GB of them — are sitting on local disk. The brain cannot
# reach them through the GIT protocol because the deploy key is scoped to the
# code repo, and `git lfs` speaks HTTP so a filesystem clone leaves pointers.
# **But a file copy needs no credential at all.**
#
# Operator, when I offered a route that dropped them: *"we need to be able to use
# the fields or wtf!"* and *"we are still using the wavelets"*. He is right, and
# this is how they arrive without another permission chase.
#
# HOW IT WORKS: a local clone gives us every field's LFS POINTER, and a pointer
# contains the object's `oid sha256:…`. Forgejo stores each object at
# `<store>/<oid[0:2]>/<oid[2:4]>/<oid>`. So the OID in the pointer is the
# filename on disk — we copy it into place ourselves and skip LFS entirely.
#
# ⚠ `--reflink=auto` so a filesystem that supports copy-on-write (btrfs/xfs)
# costs no extra space, and one that does not falls back to a real copy. A
# HARDLINK would be free everywhere and is deliberately NOT used: it would make
# the brain's field files the SAME inode as Forgejo's LFS objects, so anything
# that ever truncated or rewrote one would silently corrupt the data repo's
# store. Not worth the disk saving.
#
# ⚠ THIS MAY SIMPLY NOT BE READABLE. Forgejo's data directory is conventionally
# `git:git` and mode 0700, and the brain runs as its own service user. If that is
# the case here this reports it and the fields stay absent — which is non-fatal
# and always was. It says so rather than implying the fields were fetched.
_search_lfs_store() {
  local root p
  # Derived from the repo location first — the store is a sibling of the
  # repository root far more often than it is anywhere else.
  for p in \
    "${UAL_LFS_STORE:-}" \
    "${_local_data%/repositories/*}/lfs" \
    "${_local_data%/repositories/*}/data/lfs" \
    /var/lib/forgejo/data/lfs /var/lib/forgejo/lfs \
    /var/lib/gitea/data/lfs /var/lib/gitea/lfs \
    /data/gitea/lfs /data/forgejo/lfs ; do
    [ -n "$p" ] || continue
    if [ -d "$p" ] && [ -r "$p" ]; then printf '%s' "$p"; return 0; fi
  done
  for root in /var/lib /data /srv /opt /home; do
    [ -d "$root" ] || continue
    p="$( { find "$root" -maxdepth 5 -type d -name lfs -print -quit 2>/dev/null || true; } )"
    if [ -n "$p" ] && [ -r "$p" ]; then printf '%s' "$p"; return 0; fi
  done
  return 1
}
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
# ⛔⛔ git-lfs IS NOT A PRECONDITION FOR THE BOOKS, AND GATING THEM ON IT WAS A
# BRICK WAITING TO HAPPEN. `BrainWaves/.gitattributes` LFS-tracks exactly two
# patterns — `*.field.json` and (historically) the GloVe table. EVERY corpus JSON
# is a plain git blob and arrives with an ordinary checkout. This block used to
# skip ENTIRELY when git-lfs was absent, which threw away the half that needs no
# LFS at all and then walked straight into the books gate below.
#
# ⚠ NOTHING ON THIS BOX PROVISIONS git-lfs. `deploy/bootstrap-backend.sh` has no
# install line for it, and this block has never run on the deployed box — it
# landed after the last deploy. Its presence is UNVERIFIED, so the design rule is
# that its absence must cost the FIELDS (non-fatal, live-transform covers them)
# and never the BOOKS or the embeddings (fatal).
_have_lfs=0
if command -v git-lfs >/dev/null 2>&1 || git lfs version >/dev/null 2>&1; then _have_lfs=1; fi
if [ "${UAL_SKIP_FIELDS:-0}" = "1" ]; then
  log "data sync SKIPPED ENTIRELY (UAL_SKIP_FIELDS=1) — using whatever books and fields are already on the box. NOTE: this skips the BOOKS too; use UAL_FIELDS=0 if you only meant to skip the 114 GB of field blobs."
else
  FTMP="$(mktemp -d)"
  if [ "$_have_lfs" != "1" ]; then
    # ⛔ NOT A SKIP. The clone still runs and the books still land; only the LFS
    # payloads are unavailable, and every one of those is non-fatal by design.
    log "WARN — git-lfs is NOT installed on this box. The BOOKS are plain git blobs and are pulled anyway; only the wavelet field blobs are unavailable, and a missing field is transformed live. Install git-lfs to enable the field cache."
    _want_fields=0
  fi
  if [ "$_want_fields" = "1" ]; then
    log "data sync — pulling books + wavelet fields from ${DATA_REMOTE} (overwrites in place)"
  else
    log "data sync — pulling BOOKS ONLY from ${DATA_REMOTE}. Field blobs are skipped; she will transform each figure live, which is slower per figure and costs no download."
  fi
  # ⛔⛔ THE CLAIM THAT USED TO BE HERE WAS FALSE, AND IT WAS MEASURED FALSE
  # 2026-09-04. It read: *"`git lfs pull` IS THE 114 GB, NOT THE CLONE. The clone
  # is `--filter=blob:none` and therefore cheap whatever is in the repo…
  # Restricting it with `-I` is what actually saves the download."*
  #
  # `--filter=blob:none` makes the *git* blobs lazy. It does NOTHING about LFS,
  # which is a SEPARATE mechanism: the `filter.lfs` smudge filter runs during
  # CHECKOUT and downloads every LFS payload before `git lfs pull` is ever
  # reached. Rehearsed against the live repo with the exact clone command below:
  # 10 GB on disk and climbing, **1,099 fields already at full size (one 75.8 MB),
  # zero pointers** — and `git lfs pull` had not been called at all.
  #
  # ⭐ So `UAL_FIELDS=0` did not save the download it is named for. Verified the
  # way this project's own LAW requires an escape hatch to be verified — by
  # RUNNING it — and it was the `DREAM_PHASE_BUDGET_MS=0` shape again: a lever
  # documented as doing one thing and measurably doing another.
  #
  # `GIT_LFS_SKIP_SMUDGE=1` on the clone is what makes the claim true. The
  # checkout then writes pointers, and `_lfs_pull` below becomes the one place
  # that decides what is actually fetched — which is what every comment in this
  # block has always assumed.
  #
  # ⚠ THE FLOOR IS NOT ZERO. GloVe is a plain 1.04 GB blob now (deliberately —
  # see the .gitattributes note in the data repo), so it rides the checkout
  # either way. `UAL_FIELDS=0` costs ~1.4 GB, not nothing.
  # ⛔⛔ THIS FUNCTION'S EXIT STATUS DECIDES WHETHER THE BOOKS ARE RSYNCED, so on a
  # box with no git-lfs it MUST succeed rather than fail. `git lfs pull` there
  # exits non-zero ("git: 'lfs' is not a git command"), which would take the whole
  # data sync down its failure branch and lose the corpus — over a payload that is
  # optional by design and already declared non-fatal twenty lines above.
  # ⛔⛔ THE LFS PULL RUNS INSIDE THE BRAIN'S CGROUP AND CAN STARVE HER TO DEATH.
  # 2026-09-04, live on the box: this `git lfs pull` had been running 22 MINUTES
  # and had read 2.07 TB while writing ZERO bytes — a pathological re-read loop,
  # not slow progress (sampled /proc/<pid>/io 20s apart: read_bytes +45 GB,
  # write_bytes flat at 0). Because brain-server.js spawns this script, the pull
  # lives in unity-brain.service's cgroup and shares its MemoryHigh=20G budget, so
  # the kernel throttled the WHOLE cgroup — including node:
  #     [EventLoop] ⛔ STARVED — the loop was late 80.3s out of the last 82s (2% serviced)
  #     [LoopWatchdog] ✓ main loop RECOVERED after 61761ms (episode 30, worst 253005ms)
  # ⭐ THE TRAP: the unit stayed `active`, port 7525 stayed LISTENING, and
  # /ctl/status still said "Brain is online and serving" — while curl on
  # /public-state.json timed out at 20s. That is how "the brain won't connect at
  # all" and "systemd says it's fine" were both true at once. /ctl/status checks
  # that the port is OPEN, not that it ANSWERS.
  # Killing the pull dropped the box from 24G to 15G instantly and the site
  # returned to sub-second. So: BOUND IT. `timeout` caps the wall clock, and the
  # fields are non-fatal by design (return 0), so a cap costs pointers, never a
  # press. Override with UAL_LFS_TIMEOUT (e.g. 0 to disable, or '2h' on a box that
  # genuinely needs the full ~114 GB hydrate).
  _LFS_TIMEOUT="${UAL_LFS_TIMEOUT:-45m}"
  _lfs_pull() {
    if [ "$_have_lfs" != "1" ]; then
      log "field blobs stay as pointers — no git-lfs on this box. The books are already checked out by the clone and are completely unaffected."
      return 0
    fi
    # `timeout` may be absent on a minimal box; degrade to an unbounded pull
    # rather than failing, but SAY SO, because the hazard above is then live.
    _to=''
    if [ "$_LFS_TIMEOUT" != "0" ] && command -v timeout >/dev/null 2>&1; then
      _to="timeout --signal=TERM --kill-after=60s $_LFS_TIMEOUT"
    elif [ "$_LFS_TIMEOUT" != "0" ]; then
      log "WARN — no \`timeout\` binary, so \`git lfs pull\` runs UNBOUNDED. It shares the brain's cgroup memory budget; if it wedges it can starve her event loop while systemd still reports her healthy. Watch with: pgrep -fa git-lfs"
    fi
    # ⛔ `|| _lfs_rc=$?` IS LOAD-BEARING under `set -e`. A bare failing subshell
    # here would abort the whole press before the 124 branch below could turn a
    # deliberate timeout into the non-fatal outcome the fields are supposed to
    # have. The original one-liner was safe only because it was the function's
    # last command evaluated in an `if` condition; adding code after it removes
    # that protection.
    _lfs_rc=0
    if [ "$_want_fields" = "1" ]; then
      ( cd "$FTMP/bw" && $_to git lfs pull >> "$LOG" 2>&1 ) || _lfs_rc=$?
    else
      ( cd "$FTMP/bw" && $_to git lfs pull -I 'corpora/**' >> "$LOG" 2>&1 ) || _lfs_rc=$?
    fi
    # 124 = timeout fired. Name it, because "lfs pull failed" after 45 silent
    # minutes is the least useful sentence a no-shell operator could receive.
    if [ "$_lfs_rc" = "124" ] || [ "$_lfs_rc" = "137" ]; then
      log "WARN — \`git lfs pull\` EXCEEDED ${_LFS_TIMEOUT} and was killed on purpose. ⭐ THIS IS A GUARD, NOT A BUG: the pull runs in the brain's cgroup, and on 2026-09-04 a wedged one (2.07 TB read, 0 bytes written) throttled her event loop to 2% serviced while systemd and /ctl/status both still called her healthy. Fields stay as POINTERS (non-fatal by design — she transforms the figure live); THE BOOKS ARE UNAFFECTED. Raise with UAL_LFS_TIMEOUT=2h if the box really needs the full hydrate."
      return 0
    fi
    return "$_lfs_rc"
  }
  # ⛔⛔ THE CLONE GATES THE BOOKS; THE LFS PULL GATES ONLY THE FIELDS.
  # These were ONE condition — `if git clone … && _lfs_pull; then` — which made
  # the corpus hostage to the field payload. ANY lfs failure (a missing object on
  # the server, a dropped connection, a full disk) skipped the books rsync as
  # well and dropped straight through to the books gate, aborting a press over a
  # payload this block's own comment calls non-fatal four paragraphs above.
  # ⭐ The dependency graph is: clone ⟹ books. lfs pull ⟹ fields. Nothing else.
  # ⚠ `GIT_LFS_SKIP_SMUDGE=1` IS LOAD-BEARING, NOT TIDINESS — see the measurement
  # above. Without it the checkout fetches every LFS payload and `_lfs_pull`
  # decides nothing.
  # ⛔⛔ THE CLONE'S OWN ERROR REACHES THE OPERATOR NOW, AND IT DID NOT BEFORE.
  # This line used to send stderr to `>> "$LOG" 2>&1` — the file on the box —
  # while only the `log()` helper tees to stdout and therefore into the admin
  # console ring. So on 2026-09-04 the press reported exactly this and nothing
  # more: *"WARN — the data-repo CLONE failed"*. Git had said WHY, in one line,
  # into a file nobody with a dashboard can read, on a box with no shell.
  # ⭐ The output is captured and the tail of it goes into the WARN itself. A
  # failure whose reason is unreadable costs a whole diagnosis cycle — this one
  # cost the press.
  _clone_out=''
  if _clone_out="$(GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --branch main --filter=blob:none "$DATA_REMOTE" "$FTMP/bw" 2>&1)"; then
    printf '%s\n' "$_clone_out" >> "$LOG" 2>/dev/null || true
    mkdir -p "$FIELDS_DIR" "$CORPORA_DIR"
    # THE BOOKS FIRST — this is the half the walk cannot run without.
    # --delete so a cell removed upstream disappears here too; this directory is
    # OURS and holds nothing the server writes, so a full mirror is honest.
    if [ -d "$FTMP/bw/corpora" ] && rsync -a --delete "$FTMP/bw/corpora/" "$CORPORA_DIR/" >> "$LOG" 2>&1; then
      _ccount="$(_count "$CORPORA_DIR" -name '*.json')"
      _csize="$(_size "$CORPORA_DIR")"
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
    # ⛔ THE PULL RUNS HERE, AFTER THE BOOKS ARE ALREADY ON DISK, so a failure
    # costs exactly what it should and nothing more. Its own log line has to say
    # that out loud — a bare "lfs pull failed" beside an aborted press is what
    # sends someone hunting the corpus for a problem that was never in it.
    if ! _lfs_pull; then
      _fkept="$(_count "$FIELDS_DIR" \( -name '*.field.json' -o -name '*.field.json.gz' \))"
      log "WARN — git lfs pull FAILED or was unavailable. ${_fkept} fields already on the box are LEFT UNTOUCHED. ⭐ THE BOOKS ABOVE ARE UNAFFECTED — they are plain git blobs and landed with the clone. This does not block the press."
      # ⭐⭐ THE FIELDS STILL ARRIVE, FROM FORGEJO'S OWN STORE ON THIS DISK.
      # This is the whole point of the block above: LFS speaks HTTP and we have
      # no credential, but the objects are local files named by their OID and the
      # pointers we just checked out carry those OIDs.
      _lfs_store="$(_search_lfs_store || true)"
      if [ -z "$_lfs_store" ]; then
        log "WARN — could not find (or read) Forgejo's LFS object store on this box, so the field payloads cannot be hydrated from disk either. Every figure without a field is transformed live. ⚠ If Forgejo's data directory is mode 0700 and owned by another user, this is a PERMISSIONS result, not an absence — say so rather than assuming the fields are gone."
      elif [ ! -d "$FTMP/bw/fields" ]; then
        log "WARN — the clone has no fields/ directory; nothing to hydrate."
      else
        log "fields — hydrating from Forgejo's local LFS store at ${_lfs_store}. No credential, no network: each pointer names its object and the object is a file on this disk."
        _fh=0; _fm=0; _fs=0
        while IFS= read -r _ptr; do
          _rel="${_ptr#"$FTMP/bw/fields/"}"
          _dst="${FIELDS_DIR}/${_rel}"
          # Already hydrated at full size? leave it.
          if [ -f "$_dst" ] && [ "$(_bytes "$_dst")" -gt 400 ]; then _fs=$((_fs+1)); continue; fi
          _oid="$( { grep -m1 -oE 'oid sha256:[0-9a-f]{64}' "$_ptr" 2>/dev/null || true; } | cut -d: -f2 )"
          if [ -z "$_oid" ]; then _fm=$((_fm+1)); continue; fi
          _obj="${_lfs_store}/${_oid:0:2}/${_oid:2:2}/${_oid}"
          if [ -f "$_obj" ]; then
            mkdir -p "$(dirname "$_dst")" 2>/dev/null || true
            if cp --reflink=auto -f "$_obj" "$_dst" 2>/dev/null || cp -f "$_obj" "$_dst" 2>/dev/null; then
              _fh=$((_fh+1))
            else _fm=$((_fm+1)); fi
          else _fm=$((_fm+1)); fi
        done <<EOF
$( { find "$FTMP/bw/fields" -name '*.field.json' -type f 2>/dev/null || true; } )
EOF
        log "fields — hydrated ${_fh} from the local store, ${_fs} already present, ${_fm} unresolved. ⚠ The unresolved ones are transformed live; that is the documented non-fatal path and not a failed press."
      fi
    elif [ "$_want_fields" != "1" ]; then
      _fkept="$(_count "$FIELDS_DIR" \( -name '*.field.json' -o -name '*.field.json.gz' \))"
      # ⚠ THE REASON IS NAMED. "UAL_FIELDS=0" and "this box has no git-lfs" are
      # different facts with different fixes, and a log line that reports the
      # operator's own switch when the real cause is a missing tool sends whoever
      # reads it looking in the wrong place.
      if [ "$_have_lfs" != "1" ]; then
        log "field sync SKIPPED — no git-lfs on this box, so the source tree holds POINTER STUBS, not fields. ${_fkept} fields already on the box are LEFT UNTOUCHED (mirroring stubs over them would destroy the store); every figure without one is transformed live."
      else
        log "field sync SKIPPED (UAL_FIELDS=0) — ${_fkept} fields already on the box are LEFT UNTOUCHED; every figure without one is transformed live."
      fi
    elif rsync -a --delete "$FTMP/bw/fields/" "$FIELDS_DIR/" >> "$LOG" 2>&1; then
      # ⚠ BOTH ENCODINGS COUNTED. Fields are written gzipped now, and a glob
      # anchored to the old name reported a healthy sync as zero fields — the
      # instrument saying nothing is there while everything is.
      _fcount="$(_count "$FIELDS_DIR" \( -name '*.field.json' -o -name '*.field.json.gz' \))"
      _fsize="$(_size "$FIELDS_DIR")"
      log "field sync OK — ${_fcount} wavelet fields (${_fsize}) at ${FIELDS_DIR}; she reads these instead of re-transforming."
    else
      log "WARN — field rsync failed; keeping whatever was already on disk (live transform covers the rest)."
    fi
  else
    printf '%s\n' "$_clone_out" >> "$LOG" 2>/dev/null || true
    # The tail, flattened to one line so it survives the console ring intact.
    _clone_why="$(printf '%s' "$_clone_out" | tr '\n' ' ' | tail -c 500 || true)"
    log "WARN — the data-repo CLONE failed (not the lfs pull, which is reported separately above when it is the problem); keeping whatever books and fields are already on disk. GIT SAID: ${_clone_why:-(no output captured)}"
    log "WARN — if that reads as auth / permission denied / repository not found, then the box's deploy key is NOT authorised on ${DATA_REMOTE}. The code repo and the data repo are SEPARATE Forgejo repos, and nothing in deploy/bootstrap-backend.sh grants the second one — a key that clones the code repo does not imply access to this one. Add the box's deploy key to the data repo (read access is enough) and press again."
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
  # ⛔ THIS EXACT LINE KILLED THE PRESS ON 2026-09-04 — see the _count comment at
  # the top of this file. It is the reason all three helpers exist.
  _have="$(_count "$CORPORA_DIR/academic" -name '*.json')"
  if [ "${_have:-0}" -lt 1 ]; then
    log "FATAL — no corpus on the box (${CORPORA_DIR}/academic is empty or missing) and the data sync did not provide one. ABORTING: the service keeps running the old code, the trained weights are untouched, and the pending wipe is disarmed below. Fix the data repo pull (${DATA_REMOTE}) and press again."
    _abort
  fi
  log "corpus: sync did not run, but ${_have} academic cells are already on the box — continuing with those."
fi

# ⛔⛔ THE EMBEDDINGS GATE. The books gate above counts `corpora/academic/*.json`
# and NOTHING else, so a box with a full library and no GloVe table sails through
# it and gets restarted into a boot that cannot complete — `brain-server.js`
# answers a failed `loadPreTrained()` with "Boot STOPS here by design (NO
# FALLBACKS)", and with `Restart=always` in the unit that is a crash loop, not an
# error message. A gate standing in front of an irreversible press has to refuse
# EVERY certain-crash it can already see, not one of them.
#
# ⛔ AND A POINTER STUB IS A REAL FILE. If GloVe is ever LFS-tracked again and
# this box has no git-lfs, `corpora/glove.6B.300d.txt` exists, is readable, and is
# 135 bytes of pointer text — an existence check calls that healthy and the boot
# dies on it anyway. Both the size and the first line are checked, because they
# catch different failures: a stub, and a transfer that stopped halfway.
#
# ⚠ IT ABORTS BEFORE `.force-fresh` IS WRITTEN, exactly like the books gate — so a
# refusal here can never cost the trained weights.
_GLOVE="${CORPORA_DIR}/glove.6B.300d.txt"
_GLOVE_MIN_BYTES="${UAL_GLOVE_MIN_BYTES:-100000000}"

# ── SELF-PROVISION THE EMBEDDING TABLE ────────────────────────────────────────
#
# ⛔⛔ WHY THIS EXISTS: on 2026-09-04 the box could not clone the data repo, and
# because GloVe lived ONLY there, a boot-fatal file was hostage to a credential
# nobody had ever provisioned. The brain then came up with a dead language
# subsystem. **The one file whose absence stops the boot should not depend on a
# private repo when it has a public canonical source.**
#
# ⭐ AND THE CODE ALREADY NAMED THAT SOURCE. `js/brain/embeddings.js` throws with
# *"download glove.6B.300d.txt from https://nlp.stanford.edu/data/glove.6B.zip"*.
# The error message told an operator exactly what to do and the deploy could not
# do it itself. This closes that gap.
#
# ⚠ THIS IS PROVISIONING, NOT A CAPABILITY FALLBACK. It fetches the SAME table
# from its upstream publisher — identical vectors, no degraded substitute. The
# NO-FALLBACKS law is about refusing a lesser capability (hash vectors instead of
# semantic ones); a second download URL for a byte-identical artefact is not that.
#
# ⚠ Runs ONLY when the table is missing or short, so a healthy box pays nothing.
# Both mirrors verified reachable and unauthenticated on 2026-09-04 (862,182,613
# bytes, `content-type: application/zip`).
_glove_now="$(_bytes "$_GLOVE")"
if [ "${_glove_now:-0}" -lt "$_GLOVE_MIN_BYTES" ] && [ "${UAL_GLOVE_FETCH:-1}" = "1" ]; then
  log "embeddings — GloVe is missing or short (${_glove_now} bytes). Fetching it from its public source; this is the file the boot cannot start without."
  if ! command -v unzip >/dev/null 2>&1; then
    # ⛔ SAID PLAINLY RATHER THAN FAILING VAGUELY. The gate below still refuses,
    # so this cannot restart her into a dead boot — but the reason is named here.
    log "WARN — cannot self-provision GloVe: 'unzip' is not installed on this box and both published mirrors ship a .zip. Install unzip, or place glove.6B.300d.txt at ${_GLOVE} by hand."
  else
    _gtmp="$(mktemp -d)"
    _got=0
    for _gurl in "https://nlp.stanford.edu/data/glove.6B.zip" \
                 "https://huggingface.co/stanfordnlp/glove/resolve/main/glove.6B.zip"; do
      log "embeddings — downloading ${_gurl} (~862 MB) …"
      if curl -fsSL --retry 2 --retry-delay 5 -m 3600 -o "$_gtmp/glove.zip" "$_gurl" >> "$LOG" 2>&1; then
        # -j flattens, and naming the member extracts ONLY the 300d table rather
        # than the 50/100/200d ones we would immediately throw away.
        if unzip -o -j "$_gtmp/glove.zip" 'glove.6B.300d.txt' -d "$_gtmp" >> "$LOG" 2>&1; then
          _gsz="$(_bytes "$_gtmp/glove.6B.300d.txt")"
          # ⛔ VERIFIED BEFORE IT IS TRUSTED — size AND shape. A truncated
          # download and a wrong file both produce a real file, and the boot
          # would read either one and die. The first line of a real table is a
          # word followed by 300 floats.
          _gcols="$(head -n 1 "$_gtmp/glove.6B.300d.txt" 2>/dev/null | wc -w | tr -d ' ' || true)"
          if [ "${_gsz:-0}" -ge "$_GLOVE_MIN_BYTES" ] && [ "${_gcols:-0}" = "301" ]; then
            mkdir -p "$CORPORA_DIR"
            if mv -f "$_gtmp/glove.6B.300d.txt" "$_GLOVE" >> "$LOG" 2>&1; then
              log "embeddings — GloVe PROVISIONED from ${_gurl} (${_gsz} bytes, first row has 300 dimensions). The boot's hardest precondition is now satisfied without the data repo."
              _got=1
            else
              log "WARN — could not move the extracted table into ${_GLOVE}."
            fi
          else
            log "WARN — the downloaded table failed verification (${_gsz} bytes, first row ${_gcols} fields against an expected 301). Discarding it rather than leaving a file the boot would die on."
          fi
        else
          log "WARN — unzip could not extract glove.6B.300d.txt from ${_gurl}."
        fi
      else
        log "WARN — download failed from ${_gurl}."
      fi
      [ "$_got" = "1" ] && break
    done
    rm -rf "$_gtmp"
    [ "$_got" = "1" ] || log "WARN — every GloVe source failed. The gate below will refuse the restart and say so, rather than booting her without embeddings."
  fi
fi

if [ ! -f "$_GLOVE" ]; then
  log "FATAL — the GloVe embedding table is MISSING at ${_GLOVE}. The boot reads it before anything else and stops hard without it (NO FALLBACKS), so restarting now would produce a crash loop rather than a walk. ABORTING: the service keeps running, the trained weights are untouched, and the pending wipe is disarmed below. Fix the data repo pull (${DATA_REMOTE}) and press again."
  _abort
fi
_gbytes="$(_bytes "$_GLOVE")"
if [ "${_gbytes:-0}" -lt "$_GLOVE_MIN_BYTES" ]; then
  if head -c 40 "$_GLOVE" 2>/dev/null | grep -q 'git-lfs'; then
    log "FATAL — ${_GLOVE} is a GIT-LFS POINTER STUB (${_gbytes} bytes), not the embedding table. It is a real file, so nothing else would have noticed; the boot would read it, fail to parse a single vector, and stop by design. Install git-lfs on this box or un-LFS that file in ${DATA_REMOTE}. ABORTING before .force-fresh — weights untouched."
  else
    log "FATAL — ${_GLOVE} is only ${_gbytes} bytes against a ${_GLOVE_MIN_BYTES}-byte floor; the real table is about 1.04 GB. This is a truncated or partial transfer, and the boot stops hard on it. ABORTING — weights untouched, pending wipe disarmed below."
  fi
  _abort
fi
log "embeddings OK — GloVe present at ${_GLOVE} (${_gbytes} bytes); the boot's hardest precondition is satisfied."

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
