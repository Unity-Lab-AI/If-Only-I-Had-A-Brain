#!/bin/bash
# Launcher lives in linux/ — cd up one level so the rest of the script
# resolves paths from the project root (corpora/, server/, js/, etc.)
# exactly the way it did when this file used to live in the root.
cd "$(dirname "$0")/.." || exit 1
# Stop Unity Brain Server cleanly. Linux/macOS parity with stop.bat.
#
# Three stages, ordered best-to-worst so we exit as soon as the brain
# is dead:
#   1. Graceful HTTP shutdown via POST /shutdown — node receives the
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
    echo "  graceful shutdown request sent — waiting 3s for server to exit..."
    sleep 3
else
    echo "  graceful shutdown unreachable (server may already be dead)."
fi
echo ""

# Step 2/3: lsof+kill any PID still on port 7525
echo "[stop] step 2/3: killing any PID still listening on port 7525..."
PIDS=$(lsof -ti:7525 2>/dev/null)
if [ -z "$PIDS" ]; then
    echo "  port 7525 free — server already dead."
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
    echo "  WARNING: port 7525 still held — force-killing ALL node processes."
    pkill -9 -f "node" 2>/dev/null
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

echo "  Brain server stopped."
echo "  Remember to close any browser tabs on http://localhost:7525 —"
echo "  compute.html keeps the WebGPU loop running even without the"
echo "  server, which is what keeps your GPU fans spinning."
echo ""
