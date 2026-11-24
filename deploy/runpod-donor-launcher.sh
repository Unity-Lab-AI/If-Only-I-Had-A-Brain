#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# runpod-donor-launcher.sh — the supervisor a RunPod donor pod runs as its
# container command. Keeps a donor binary on the newest published release,
# forever, without anyone logging in.
#
# ⛔ THIS IS NOT RUN FROM THE REPO. RunPod stores the container command on the
# POD ITSELF (the `args` field), and `args` is NOT mutable via the API — only
# name / image / disk / ports / env are. So this file is the SOURCE OF TRUTH to
# paste in when a donor pod is next CREATED or RECREATED. Keeping it in the repo
# means the next pod does not inherit the flaws below by copy-paste, which is
# exactly how the live pod ended up three releases behind.
#
# ── WHY THIS EXISTS (2026-08-25) ─────────────────────────────────────────────
# The live pod `cl5i7k9gkge3hx` was found running donor v0.3.26 while v0.3.29
# had been published for two days. Nothing was broken — v0.3.26 clears the
# `>= 3026` gate that masked bound plasticity (SPRS type 13) requires — but it
# was missing SPARSEACK (v0.3.27), the donor-side bucket-mean reduction and
# GPUVERB.3 (v0.3.28), and LOOPBACK/SOLOCARD (v0.3.29).
#
# The cause was not a broken updater. The old supervisor re-resolved the release
# URL once per loop iteration, and the loop only turns over when the donor
# PROCESS EXITS. Pod uptime was 3.55 days with no donor exit, so it never
# re-checked. "Self-updating" was true on reconnect and false in steady state.
#
# TWO FIXES over the old command:
#
#   1. NO STALE PIN. The old script carried
#        PIN=.../donor-v0.3.26/unity-donor-linux-x86_64
#      and fell back to it whenever the release API did not answer. That is a
#      silent DOWNGRADE: one API hiccup and the pod installs an old binary and
#      keeps it. Here, an unreachable API means KEEP WHAT IS ALREADY ON DISK,
#      and only a pod with no binary at all waits and retries. A fallback should
#      never be able to move you backwards.
#
#   2. UPGRADE WHILE RUNNING. A watchdog re-checks the release tag every 5
#      minutes and, if a newer one appears, stops the donor BY PID so the
#      supervisor loop reinstalls. That closes the steady-state gap: the pod now
#      picks up a release within ~5 minutes instead of waiting for a disconnect.
#
# ⚠ THE PID DETAIL IS LOAD-BEARING. The obvious version of the watchdog is
# `pkill -f unity-donor` — and it is WRONG here. `pkill -f` matches full command
# lines, and the supervisor's own command line contains the string
# "unity-donor", so it would kill the very loop that is supposed to restart the
# donor. The pod would go dark until someone noticed. Kill by captured PID.
#
# ── THIRD FIX (2026-09-08): SUPERVISE THE CONNECTION, NOT THE PROCESS ─────────
# Both fixes above watch the donor's LIVENESS. Neither can see the failure that
# has now happened twice:
#
#   2026-08-26  the pod sat at 0% GPU / 0% CPU for 24.9 HOURS
#   2026-09-08  the donor process was alive, on the CORRECT release, with the
#               brain's WS lane handshaking cleanly — and not connected. The
#               brain read `donorCount 0` and `meanVoltageSource
#               no-gpu-donor-attached`, and because the walk is donor-gated she
#               sat at frames 0 / spikes 0 / psi 0 for 53 minutes.
#
# ⛔ THE SUPERVISOR COULD NOT SEE EITHER ONE. `wait $DP` returns when the process
# EXITS and `kill -0 $DP` asks only whether it EXISTS. A donor that is alive and
# donating and a donor that is alive and wedged are identical to both. **The
# thing this pod is paid for is the connection, and nothing was watching it.**
#
# So the watchdog now also asks the BRAIN whether this donor is actually
# attached, and kills it by PID — into the same reinstall-and-relaunch path the
# upgrade watchdog already uses — after `DONOR_MAX_MISS` consecutive misses.
#
# ⚠⚠ IT REQUIRES THE BRAIN TO ANSWER BEFORE IT COUNTS A MISS, and that condition
# is the whole design. A brain that is DOWN is not evidence that the donor is
# wedged — reconnecting to nothing fixes nothing, and the documented normal state
# for a donor whose brain is down is to sit in its reconnect loop. So an
# unreachable or unparseable state endpoint scores NO strike. Same discipline as
# the deploy's LFS stall watchdog: two conditions, because one of them alone
# describes a different situation with a different remedy.
#
# ⚠ IDENTITY IS BY GPU MODEL, because that is what is actually published.
# `donors[].name` in the public state is the GPU ("NVIDIA A40"), NOT `DONOR_NAME`
# (which is the leaderboard handle and appears nowhere in that array). Two pods
# with the same model are therefore indistinguishable here — a false NEGATIVE,
# which leaves a wedged donor running rather than killing a working one. That is
# the safe direction and it is chosen deliberately.
#
# Env consumed (set on the pod, unchanged from the existing deployment):
#   DONOR_GPUS  (default all) · DONOR_UTIL (default all) · DONOR_NAME
# Env added by the third fix, all optional:
#   BRAIN_URL       (default the public site) — where to ask about attachment
#   DONOR_MAX_MISS  (default 3) — consecutive answered-but-absent checks before
#                   a relaunch. At the watchdog's 300s cadence that is ~15 min,
#                   and the first check is 300s after launch, so a slow initial
#                   registration can never trigger it.
#   DONOR_CONN_WATCH=0 disables the connection check entirely.
# ─────────────────────────────────────────────────────────────────────────────
set -x
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null 2>&1
apt-get install -y --no-install-recommends curl ca-certificates libssl3 >/dev/null 2>&1
nvidia-smi || echo NO_NVIDIA_SMI

# GitHub Releases on the public mirror (2026-10-18) — the Forgejo lane built to a
# box that no longer exists. Same JSON shape for what this greps: the asset's
# browser_download_url ends in the binary name and the tag_name is donor-vX.Y.Z.
API=https://api.github.com/repos/Unity-Lab-AI/If-Only-I-Had-A-Brain/releases/latest
BIN=/usr/local/bin/unity-donor

latest_url() { curl -fsSL -m 60 -H 'User-Agent: unity-runpod-donor' "$API" | grep -oE "https://[A-Za-z0-9._/-]+unity-donor-linux-x86_64" | head -1; }
latest_tag() { curl -fsSL -m 60 -H 'User-Agent: unity-runpod-donor' "$API" | grep -oE "donor-v[0-9]+[.][0-9]+[.][0-9]+" | head -1; }

# The brain is on the operator's own machine. Its donor lane is the Cloudflare
# tunnel host `brain.theunitybrain.com` (the binary's compiled-in PROD_SERVER is
# its /ws), and that same tunnel forwards /public-state.json — so the watchdog
# asks the host the donor is actually connected through. ⚠ It used to ask the
# Tailscale Funnel address, which the donor lane left on 2026-10-19 (capped at
# 0.16 MB/s); asking a different front door than the one the donor uses could
# score a working donor "absent" whenever the two disagree.
BRAIN_URL="${BRAIN_URL:-https://brain.theunitybrain.com}"
DONOR_MAX_MISS="${DONOR_MAX_MISS:-3}"
# The GPU model this pod actually has — the only identity the brain publishes for
# an attached donor. Resolved once; if nvidia-smi cannot answer, the connection
# check falls back to "is ANY donor attached", which still catches the total
# outage that has now happened twice.
MYGPU="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | sed 's/[[:space:]]*$//')"
echo DONOR_SELF_GPU="${MYGPU:-<unknown>}"

# Ask the brain whether we are attached.
#   0 = attached · 1 = the brain answered and we are NOT there · 2 = no answer
# ⛔ 1 and 2 MUST stay distinct. Only 1 is evidence about the DONOR; 2 is
# evidence about the BRAIN, and killing the donor over a brain outage would turn
# a wait into a restart loop that burns the pod against nothing.
donor_attached() {
  local body
  body="$(curl -fsS -m 20 "${BRAIN_URL}/public-state.json" 2>/dev/null)" || return 2
  [ -n "$body" ] || return 2
  # A body that carries no donor pool at all is an answer we cannot read - treat
  # it as "no answer" rather than as absence, or a changed payload shape becomes
  # a kill loop.
  printf '%s' "$body" | grep -q '"donorCount"' || return 2
  if [ -n "$MYGPU" ]; then
    printf '%s' "$body" | grep -q "\"name\":\"${MYGPU}\"" && return 0
  else
    printf '%s' "$body" | grep -qE '"donorCount":[1-9]' && return 0
  fi
  return 1
}

# ── HER IMAGE LANE ON THIS POD (donor 0.3.48) ────────────────────────────────
# The same renderer she runs at home (`server/image-render.py`, port 5124) with
# the SAME checkpoint, so a picture does not depend on which card drew it. The
# model comes from the model host, not from the operator's upload, and is taken
# only if its SHA-256 matches the file at home byte for byte:
#   Realistic_Vision_V5.1_fp16-no-ema.safetensors · 2,132,625,894 B
#   sha256 99a75a901f4fec732056930a89fa34cf360f6f72d75ce5bf333ddf82adf8dd2a
# Runs in the background and never blocks the donor; the donor re-checks the
# renderer every minute and offers the lane the moment it answers.
# DONOR_IMAGE=0 skips it.
if [ "${DONOR_IMAGE:-1}" != "0" ]; then
  ( IMG=/opt/unity-image
    CKPT="$IMG/models/image/realistic-vision-v51.safetensors"
    CKPT_URL="https://huggingface.co/SG161222/Realistic_Vision_V5.1_noVAE/resolve/main/Realistic_Vision_V5.1_fp16-no-ema.safetensors"
    CKPT_SHA=99a75a901f4fec732056930a89fa34cf360f6f72d75ce5bf333ddf82adf8dd2a
    RENDER_URL="https://raw.githubusercontent.com/Unity-Lab-AI/If-Only-I-Had-A-Brain/main/server/image-render.py"
    mkdir -p "$IMG/models/image" "$IMG/server"
    curl -fsSL -m 120 -o "$IMG/server/image-render.py" "$RENDER_URL" || { echo IMAGE_LANE_NO_RENDERER_SCRIPT; exit 0; }
    if [ ! -f "$CKPT" ] || [ "$(sha256sum "$CKPT" | cut -c1-64)" != "$CKPT_SHA" ]; then
      echo IMAGE_LANE_FETCHING_MODEL
      curl -fsSL -m 3600 -o "$CKPT.part" "$CKPT_URL" || { echo IMAGE_LANE_MODEL_DOWNLOAD_FAILED; exit 0; }
      if [ "$(sha256sum "$CKPT.part" | cut -c1-64)" != "$CKPT_SHA" ]; then echo IMAGE_LANE_MODEL_HASH_MISMATCH refusing; rm -f "$CKPT.part"; exit 0; fi
      mv -f "$CKPT.part" "$CKPT"
    fi
    # ubuntu:24.04 ships no Python and its system pip refuses installs
    # (PEP 668), so the renderer gets its own venv.
    command -v python3 >/dev/null 2>&1 && python3 -c "import venv" 2>/dev/null \
      || apt-get install -y --no-install-recommends python3 python3-venv >/dev/null 2>&1 \
      || { echo IMAGE_LANE_NO_PYTHON; exit 0; }
    [ -x "$IMG/venv/bin/python" ] || python3 -m venv "$IMG/venv" || { echo IMAGE_LANE_NO_VENV; exit 0; }
    PY="$IMG/venv/bin/python"
    "$PY" -c "import torch, diffusers, transformers, accelerate, safetensors" 2>/dev/null \
      || "$PY" -m pip install -q torch diffusers transformers accelerate safetensors \
      || { echo IMAGE_LANE_PIP_FAILED; exit 0; }
    echo IMAGE_LANE_READY starting_renderer_on_5124
    while true; do "$PY" "$IMG/server/image-render.py" --port 5124 --checkpoint "$CKPT"; echo IMAGE_LANE_RENDERER_EXITED restarting_in_20s; sleep 20; done
  ) &
fi

while true; do
  U=$(latest_url); T=$(latest_tag)
  if [ -n "$U" ]; then
    echo DONOR_RESOLVED url=$U tag=$T
    # download to a side path first so a truncated transfer cannot leave a
    # half-written binary in place of a working one
    curl -fsSL -m 900 -o $BIN.new "$U" && chmod +x $BIN.new && mv -f $BIN.new $BIN
  elif [ -x $BIN ]; then
    echo DONOR_API_UNREACHABLE keeping_existing_binary_never_downgrading
  else
    echo DONOR_API_UNREACHABLE_and_no_binary retry_30s; sleep 30; continue
  fi

  echo ===VERSION===; $BIN --version 2>&1 | head -2
  echo ===LIST_GPUS===; $BIN --list-gpus
  echo ===LAUNCH=== tag=$T

  $BIN --headless --gpus "${DONOR_GPUS:-all}" --utilization "${DONOR_UTIL:-all}" --name "${DONOR_NAME}" &
  DP=$!

  # upgrade + CONNECTION watchdog — see the PID note and the third-fix note in
  # the header. The first sleep is also the registration grace period: nothing is
  # checked until the donor has had 300s to attach.
  ( MISS=0
    while sleep 300; do
      kill -0 $DP 2>/dev/null || break
      NT=$(latest_tag)
      if [ -n "$NT" ] && [ "$NT" != "$T" ]; then
        echo DONOR_UPGRADE_AVAILABLE new=$NT running=$T stopping_donor_to_upgrade
        kill $DP 2>/dev/null
        break
      fi
      [ "${DONOR_CONN_WATCH:-1}" = "1" ] || continue
      donor_attached; RC=$?
      if [ "$RC" = "0" ]; then
        # ⭐ Reset on every confirmed attachment, so only CONSECUTIVE misses
        # count. A single blip during a brain restart must not accumulate
        # toward a kill across an otherwise healthy hour.
        [ "$MISS" -gt 0 ] && echo DONOR_CONN_OK_AFTER_MISSES misses_cleared=$MISS
        MISS=0
      elif [ "$RC" = "2" ]; then
        # The brain did not answer. That is a fact about the BRAIN. No strike.
        echo DONOR_CONN_BRAIN_UNREACHABLE no_strike_counted misses=$MISS
      else
        MISS=$((MISS+1))
        echo DONOR_CONN_MISS $MISS/$DONOR_MAX_MISS brain_answered_and_we_are_not_attached gpu="${MYGPU:-<unknown>}"
        if [ "$MISS" -ge "$DONOR_MAX_MISS" ]; then
          echo DONOR_WEDGED_RELAUNCHING alive_but_not_donating_for $MISS checks — killing by PID so the supervisor reinstalls and relaunches
          kill $DP 2>/dev/null
          break
        fi
      fi
    done ) &
  WD=$!

  wait $DP
  kill $WD 2>/dev/null
  echo donor_exited_restarting_in_20s; sleep 20
done
