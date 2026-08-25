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
# Env consumed (set on the pod, unchanged from the existing deployment):
#   DONOR_GPUS  (default all) · DONOR_UTIL (default all) · DONOR_NAME
# ─────────────────────────────────────────────────────────────────────────────
set -x
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null 2>&1
apt-get install -y --no-install-recommends curl ca-certificates libssl3 >/dev/null 2>&1
nvidia-smi || echo NO_NVIDIA_SMI

API=https://git.unityailab.com/api/v1/repos/UnityAILab/If-Only-I-Had-A-Brain/releases/latest
BIN=/usr/local/bin/unity-donor

latest_url() { curl -fsSL -m 60 "$API" | grep -oE "https://[A-Za-z0-9._/-]+unity-donor-linux-x86_64" | head -1; }
latest_tag() { curl -fsSL -m 60 "$API" | grep -oE "donor-v[0-9]+[.][0-9]+[.][0-9]+" | head -1; }

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

  # upgrade watchdog — see the PID note in the header
  ( while sleep 300; do
      kill -0 $DP 2>/dev/null || break
      NT=$(latest_tag)
      if [ -n "$NT" ] && [ "$NT" != "$T" ]; then
        echo DONOR_UPGRADE_AVAILABLE new=$NT running=$T stopping_donor_to_upgrade
        kill $DP 2>/dev/null
        break
      fi
    done ) &
  WD=$!

  wait $DP
  kill $WD 2>/dev/null
  echo donor_exited_restarting_in_20s; sleep 20
done
