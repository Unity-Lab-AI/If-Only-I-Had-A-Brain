#!/bin/bash
# Launcher lives in linux/ -- cd up one level so the rest of the script
# resolves paths from the project root (corpora/, server/, js/, etc.)
# exactly the way it did when this file used to live in the root.
cd "$(dirname "$0")/.." || exit 1
# Stop Unity Brain Server cleanly. Linux/macOS parity with stop.bat.
#
# Three stages, ordered best-to-worst so we exit as soon as the brain
# is dead:
#   1. Graceful HTTP shutdown via POST /shutdown -- node receives the
#      request, runs its SIGINT-equivalent cleanup (save weights,
#      close sqlite, etc.), then process.exit(0).
#   2. If HTTP shutdown doesn't respond within a few seconds, fall
#      through to lsof+kill on any PID holding port 7525.
#   3. If the port is still held after that, best-effort force-kill
#      every node process on the machine as a last resort.

echo ""
echo "  =============================="
echo "    Stop Unity Brain Server"
echo "  =============================="
echo ""

# Step 1/3: graceful HTTP shutdown
echo "[stop] step 1/3: requesting graceful shutdown via HTTP /shutdown..."
if curl -s -m 5 -X POST http://localhost:7525/shutdown > /dev/null 2>&1; then
    echo "  graceful shutdown request sent -- waiting 3s for server to exit..."
    sleep 3
else
    echo "  graceful shutdown unreachable (server may already be dead)."
fi
echo ""

# Step 2/3: lsof+kill any PID still on port 7525
echo "[stop] step 2/3: killing any PID still listening on port 7525..."
PIDS=$(lsof -ti:7525 2>/dev/null)
if [ -z "$PIDS" ]; then
    echo "  port 7525 free -- server already dead."
else
    for pid in $PIDS; do
        echo "  killing PID $pid"
        kill -9 "$pid" 2>/dev/null
    done
    sleep 1
fi
echo ""

# Step 3/3: verify port 7525 is free
echo "[stop] step 3/3: verifying port 7525 is free..."
if lsof -ti:7525 > /dev/null 2>&1; then
    # CTLSTOP — kill what HOLDS 7525, not every node on the machine.
    #   `pkill -9 -f node` is indiscriminate: it also kills the control plane on
    #   7526 and any unrelated node the operator has running. Losing brain-ctl
    #   here is the worst of it, because it is the thing that would let the
    #   dashboard START the brain again — so the nuclear option quietly removed
    #   the recovery path. Targeting the port kills exactly what is wedged.
    echo "  WARNING: port 7525 still held -- killing the PIDs holding it."
    for pid in $(lsof -ti:7525 2>/dev/null); do kill -9 "$pid" 2>/dev/null; done
    sleep 1
    if lsof -ti:7525 > /dev/null 2>&1; then
        echo "  ERROR: port 7525 STILL held. Manual intervention needed."
        echo "  Run: pkill -9 -f node"
    else
        echo "  OK: port 7525 now free after force-kill."
    fi
else
    echo "  OK: port 7525 is free."
fi
echo ""

# Bonus: kill any Chrome/Chromium processes attached to our isolated
# UnityBrain-WebGPU-Profile so subsequent start.sh boots clean.
# Mirrors stop.bat's Chrome-isolated-profile cleanup.
echo "[stop] bonus step: closing browser processes attached to UnityBrain-WebGPU-Profile..."
# pgrep with -a returns the full command line; filter by profile path.
if command -v pgrep > /dev/null 2>&1; then
    PROFILE_PIDS=$(pgrep -af "UnityBrain-WebGPU-Profile" 2>/dev/null | awk '{print $1}')
    if [ -n "$PROFILE_PIDS" ]; then
        for pid in $PROFILE_PIDS; do
            echo "  killing browser PID $pid"
            kill -9 "$pid" 2>/dev/null
        done
    fi
fi
echo ""

# CTLSTOP — brain-ctl IS STOPPED BY DEFAULT. Inverted from the original
# "left running on purpose" behaviour on the operator's instruction, and it
# fixes a real defect rather than only changing a preference:
#
#   1. brain-ctl exits QUIETLY on EADDRINUSE (correct on the box, where the
#      already-running instance is the good one). So a launcher relaunch does
#      NOT replace a running control plane — meaning EVERY EDIT TO
#      brain-ctl.js IS INERT until the old process is gone. That is the local
#      twin of the box defect in docs/BUTTON-AUDIT.md: self-update.sh restarts
#      the brain and never the control plane.
#   2. The original rationale — killing it "removed the way to start again" —
#      is true ON THE BOX, where there is no shell and the dashboard is the
#      only lever. It does NOT hold locally: the operator is at the machine
#      with start.sh and Savestart.sh in this very folder.
#
# Pass `./stop.sh keepctl` for the old behaviour (leave it up), kept because it
# is right when driving a local brain purely from the dashboard. `./stop.sh all`
# still means everything down.
#
# ⛔⛔ AND IT MUST NOT DECAPITATE ITS OWN CALLER. brain-ctl uses THIS SCRIPT as
# the stop primitive behind the dashboard's Stop button, so once stopping the
# control plane became the default, a Stop press would kill the very process
# serving the request: the HTTP reply would never arrive (a successful stop
# reporting as a failure) and the Start button would go with it — which is
# exactly the original "left running on purpose" rationale.
#   The two callers are distinguishable, so they are distinguished:
#   UAL_CTL_NONINTERACTIVE=1 is set ONLY by brain-ctl's spawnLauncher.
#   Launched by the control plane -> keep the control plane.
#   Run by a human                -> stop everything, as instructed.
echo "[stop] control plane (port 7526)..."
if lsof -ti:7526 > /dev/null 2>&1; then
    if [ -n "${UAL_CTL_NONINTERACTIVE:-}" ]; then
        echo "  control plane LEFT RUNNING on 7526 — this stop was launched BY"
        echo "  the control plane, and killing it would cut off the reply to the"
        echo "  press and remove the Start button. Run ./stop.sh yourself to"
        echo "  stop it too."
    elif [ "${1:-}" = "keepctl" ]; then
        echo "  control plane LEFT RUNNING on 7526 (you asked for 'keepctl')."
        echo "  It is what lets the dashboard Start the brain again — but a"
        echo "  launcher will NOT replace it, so edits to brain-ctl.js stay"
        echo "  inert until it is stopped."
    else
        for pid in $(lsof -ti:7526 2>/dev/null); do
            echo "  killing control-plane PID $pid"
            kill -9 "$pid" 2>/dev/null
        done
        sleep 1
        if lsof -ti:7526 > /dev/null 2>&1; then
            echo "  WARNING: port 7526 STILL held — the next launcher will exit"
            echo "  quietly on EADDRINUSE and keep serving the OLD build."
        else
            echo "  control plane STOPPED — the next start.sh / Savestart.sh"
            echo "  starts a FRESH one, so brain-ctl.js changes take effect."
        fi
    fi
else
    echo "  control plane not running."
fi
echo ""

echo "  Brain server stopped."
echo "  Remember to close any browser tabs on http://localhost:7525 --"
echo "  compute.html keeps the WebGPU loop running even without the"
echo "  server, which is what keeps your GPU fans spinning."
echo ""
