#!/bin/bash
# Launcher lives in linux/ — cd up one level so the rest of the script
# resolves paths from the project root (corpora/, server/, js/, etc.)
# exactly the way it did when this file used to live in the root.
cd "$(dirname "$0")/.." || exit 1
# Unity Brain Server (SAVE-STATE RESUME) — Linux/macOS parity with
# Savestart.bat. FORCE-preserves brain state from disk regardless of
# code-hash change since last run. Operator uses this when continuing
# a long curriculum run from a previous boot's checkpoint.
#
# DREAM_FORCE_CLEAR is explicitly REJECTED — Savestart is resume-only.
# If you need a wipe, use start.sh /fresh.

echo ""
echo "  =============================="
echo "    Unity Brain Server"
echo "    SAVE-STATE RESUME MODE"
echo "  =============================="
echo ""
echo "  [Savestart] preserving brain state unconditionally."
echo "  [Savestart] boot will hydrate from server/brain-weights*.json"
echo "  [Savestart] + conversations.json + episodic-memory.db."
echo ""

# Optional env flags — see start.sh header for full list.
# DREAM_DEFINITION_CACHE_FILE=path.json especially relevant for Savestart
# (persistent dictionary cache survives restart → no ~1 min re-warm).

# Node 18+ required (built-in globalThis.fetch for dictionary API).
NODE_VERSION=$(node -v 2>/dev/null | sed -e 's/^v//' -e 's/\..*//')
if [ -z "$NODE_VERSION" ]; then
    echo "  WARNING: node not found in PATH. Install Node ≥18 from https://nodejs.org"
    exit 1
fi
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "  WARNING: Node v${NODE_VERSION}.x detected. Dictionary API requires Node ≥18."
    echo "  Brain still boots; definitions degrade to no-op."
    echo ""
fi


# FORCE preserve-state. Overrides autoClearStaleState() regardless of
# code-hash change since last run. DREAM_FORCE_CLEAR explicitly rejected.
export DREAM_KEEP_STATE=1
unset DREAM_FORCE_CLEAR

if [[ "$1" == "/fresh" || "$1" == "/clear" || "$1" == "--fresh" || "$1" == "--clear" ]]; then
    echo "  [!] $1 rejected — use start.sh /fresh for a wipe."
    echo "      Savestart.sh is save-resume only."
    exit 1
fi

DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Step 1/7: kill any prior listener
echo "[Savestart] step 1/7: killing any prior listener on port 7525..."
lsof -ti:7525 2>/dev/null | xargs kill -9 2>/dev/null
echo ""

# Step 2/7: enter server folder
echo "[Savestart] step 2/7: entering server folder..."
cd "$DIR/server" || { echo "  ERROR: server/ folder missing"; exit 1; }
echo ""

# Step 3/7: check npm dependencies
echo "[Savestart] step 3/7: checking npm dependencies..."
if [ ! -d "node_modules" ]; then
    echo "  Installing server dependencies (first run, ~30s)..."
    if ! npm install; then
        echo ""
        echo "  ============================================================"
        echo "  ERROR: npm install failed in server folder."
        echo "  Make sure Node.js is installed: https://nodejs.org"
        echo "  ============================================================"
        echo ""
        exit 1
    fi
fi
echo "  node_modules present."
echo ""

# Step 4/7: check esbuild
echo "[Savestart] step 4/7: checking esbuild..."
if [ ! -d "node_modules/esbuild" ]; then
    echo "  Installing esbuild for bundle build..."
    if ! npm install esbuild --save-dev; then
        echo ""
        echo "  ============================================================"
        echo "  ERROR: esbuild install failed."
        echo "  ============================================================"
        echo ""
        exit 1
    fi
fi
echo "  esbuild present."
echo ""

# Step 5/7: check GloVe 6B.300d substrate
# Savestart hydrates from save state. If corpora/ was wiped since the
# save was produced, we STILL need GloVe so the semantic substrate
# matches what the saved weights learned against. Falling back to
# subword on a GloVe-trained save would corrupt semantic probes.
echo "[Savestart] step 5/7: checking GloVe 6B.300d substrate..."
if [ ! -f "$DIR/corpora/glove.6B.300d.txt" ]; then
    echo "  GloVe 6B.300d not found - downloading (~823 MB zip, one-time, 5-15 min)..."
    echo "  Source: https://nlp.stanford.edu/data/glove.6B.zip"
    mkdir -p "$DIR/corpora"
    cd "$DIR/corpora" || exit 1
    if curl -L --fail --show-error --progress-bar --max-time 1800 -o glove.6B.zip https://nlp.stanford.edu/data/glove.6B.zip; then
        if unzip -o glove.6B.zip glove.6B.300d.txt 2>/dev/null || \
           tar -xf glove.6B.zip glove.6B.300d.txt 2>/dev/null; then
            rm glove.6B.zip
            echo "  GloVe 6B.300d installed at corpora/glove.6B.300d.txt."
        else
            echo ""
            echo "  ============================================================"
            echo "  WARNING: GloVe extract failed (no unzip or tar)."
            echo "    macOS: tar + unzip ship by default"
            echo "    Debian/Ubuntu: apt install unzip"
            echo "    Alpine: apk add unzip"
            echo "  Continuing with subword fallback — semantic probes may drift."
            echo "  ============================================================"
            echo ""
        fi
    else
        echo ""
        echo "  ============================================================"
        echo "  WARNING: GloVe download failed. Saved weights learned against"
        echo "  GloVe + booting under subword will drift semantic probes."
        echo "  Recommend exiting + re-running once internet is available."
        echo "  ============================================================"
        echo ""
    fi
    cd "$DIR/server" || exit 1
fi
echo "  GloVe substrate present."
echo ""

# Step 6/7: rebuild js/app.bundle.js
echo "[Savestart] step 6/7: rebuilding js/app.bundle.js..."
if npm run build; then
    echo "  Bundle built — browser will load fresh code."
else
    echo ""
    echo "  ============================================================"
    echo "  ERROR: esbuild bundle build failed."
    echo "  See the esbuild output above for the cause."
    echo "  The browser will run STALE code from the previous bundle."
    echo "  ============================================================"
    echo ""
fi
echo ""

# Step 7/7: launch brain server with SAVE-STATE RESUME (DREAM_KEEP_STATE=1)
echo "[Savestart] step 7/7: launching brain server (SAVE-STATE RESUME, DREAM_KEEP_STATE=1)..."
echo "  server log: $DIR/server/server.log"

# Reset log on each Savestart run.
if [ -f server.log ]; then rm server.log; fi

# Launch with full V8 flags. DREAM_KEEP_STATE=1 already exported above.
node --max-old-space-size=65536 --max-semi-space-size=1024 --expose-gc brain-server.js > server.log 2>&1 &
SERVER_PID=$!
sleep 2

# Auto-open landing + dashboard. Save-state resume boot benefits especially —
# operator can confirm what loaded from disk before committing to a long
# curriculum run.
echo "  Opening landing page + dashboard..."
if command -v open &>/dev/null; then
    open http://localhost:7525
    open http://localhost:7525/dashboard.html
elif command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:7525 &>/dev/null
    xdg-open http://localhost:7525/dashboard.html &>/dev/null
fi

echo ""
echo "  Landing:     http://localhost:7525"
echo "  Dashboard:   http://localhost:7525/dashboard.html (auto-opened)"
echo "  GPU compute: http://localhost:7525/compute.html (auto-launched by server)"
echo "  Log file:    $DIR/server/server.log (always on disk)"
echo "  Tail live:   tail -F $DIR/server/server.log"
echo ""
echo "  NOTE: brain runs ONLY on GPU. compute.html MUST stay open."
echo "  To STOP cleanly: stop.sh (or Ctrl+C this launcher then kill PID $SERVER_PID)"
echo "  Also close http://localhost:7525 browser tabs — compute.html"
echo "  keeps WebGPU running even without the server."
echo ""

wait $SERVER_PID
