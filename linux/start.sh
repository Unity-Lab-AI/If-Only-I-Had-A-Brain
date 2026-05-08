#!/bin/bash
# Launcher lives in linux/ — cd up one level so the rest of the script
# resolves paths from the project root (corpora/, server/, js/, etc.)
# exactly the way it did when this file used to live in the root.
cd "$(dirname "$0")/.." || exit 1
# Unity Brain Server launcher — Linux/macOS parity with start.bat.
# All structural features matched: /fresh flag, 7 numbered steps,
# server.log redirect+reset, --max-semi-space-size=1024 + --expose-gc,
# dashboard auto-open, server auto-spawns compute.html (NOT opened here),
# error handling on npm / esbuild / bundle, stop guidance.

echo ""
echo "  =============================="
echo "    Unity Brain Server"
echo "  =============================="
echo ""

# Optional env flags (defaults are correct for most users):
#   DREAM_FORCE_CLEAR=1            — wipe brain state on boot (or /fresh flag)
#   DREAM_KEEP_STATE=1             — preserve state regardless of code-hash (or use Savestart.sh)
#   DREAM_MAX_GRADE=phd            — unset Pre-K + K cap (operator override only)
#   DREAM_DEFINITION_CACHE_FILE=   — path/to/cache.json for persistent disk
#                                    cache of dictionary definitions (~1 min
#                                    cold-start saving on restart). Default
#                                    is in-memory only (no disk persistence).
#   DREAM_SMALL_WORLD=0            — opt OUT of small-world intra-cluster
#                                    topology (defaults ON, biological-cortex
#                                    Watts-Strogatz hybrid).
#   DREAM_MICROCOLUMNS=0           — opt OUT of microcolumn substructure.
#   DREAM_LAMINATION=0             — opt OUT of six-layer cortical lamination.
#   DREAM_HUBS=0                   — opt OUT of hub neurons + rich-club.
#   DREAM_THETA_GAMMA=0            — opt OUT of theta/gamma oscillations.
#   DREAM_GW_IGNITION=0.45         — GlobalWorkspace ignition threshold
#                                    in (0, 1). Default 0.45. Lower =
#                                    more frequent ignitions (diffuse
#                                    consciousness); higher = stricter.
#
# NOTE: brain makes outbound calls to dictionaryapi.dev for live word
# definitions. Firewall / offline → definitions silently fail but brain
# still boots + curriculum still runs (just without definition Hebbian
# binding for unknown words).

# Node 18+ required (built-in globalThis.fetch for dictionary API).
NODE_VERSION=$(node -v 2>/dev/null | sed -e 's/^v//' -e 's/\..*//')
if [ -z "$NODE_VERSION" ]; then
    echo "  WARNING: node not found in PATH. Install Node ≥18 from https://nodejs.org"
    exit 1
fi
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "  WARNING: Node v${NODE_VERSION}.x detected. Dictionary API requires"
    echo "  Node ≥18 for built-in fetch. Definitions will degrade to no-op + warning."
    echo "  Brain still boots. Upgrade for full feature: https://nodejs.org"
    echo ""
fi

# start.sh is DESTRUCTIVE per the iter14-D launcher contract: every boot
# WIPES brain-weights + episodic memory + schemas + conversations via the
# brain-server's autoClearStaleState(). Tier 3 identity-core.json is
# preserved. Use Savestart.sh to RESUME from saved training instead.
#
# Bypass flags (skip the Y/N confirmation gate below):
#   start.sh /fresh / /clear / --fresh / --clear  — explicit wipe, bypasses gate
#   start.sh -y / --yes                           — bypass gate (CI / scripted path)
#   DREAM_FORCE_CLEAR=1                           — env var bypass (CI / scripted path)
if [[ "$1" == "/fresh" || "$1" == "/clear" || "$1" == "--fresh" || "$1" == "--clear" \
   || "$1" == "-y" || "$1" == "--yes" || "$1" == "/yes" ]]; then
    export DREAM_FORCE_CLEAR=1
    echo "  [!] DREAM_FORCE_CLEAR=1 — will clear brain state on boot."
    echo ""
fi

if [ -z "$DREAM_FORCE_CLEAR" ]; then
    # ────────────────────────────────────────────────────────────────
    # Y/N CONFIRMATION GATE (Gee 2026-05-08 LAW — irreversible-loss warning)
    # ────────────────────────────────────────────────────────────────
    # Without this gate, accidentally running start.sh (or running it by
    # reflex after a CLI restart) silently destroys hours of training.
    # The gate forces explicit confirmation before the destructive wipe fires.
    echo ""
    echo "  ============================================================"
    if [ -t 0 ] && [ -t 1 ]; then
        # Terminal supports ANSI — emit red bold for the WARNING banner.
        printf '  \033[1;31m[WARNING] start.sh is DESTRUCTIVE — it WIPES training state.\033[0m\n'
    else
        echo "  [WARNING] start.sh is DESTRUCTIVE — it WIPES training state."
    fi
    echo "  ============================================================"
    echo ""
    echo "  This boot will DELETE the following from server/:"
    echo "    - brain-weights.json + v0-v4 rotation"
    echo "    - brain-weights.bin (typically 100-200 MB of trained weights)"
    echo "    - conversations.json"
    echo "    - episodic-memory.db*"
    echo "    - schemas.json"
    echo ""
    echo "  Preserved (Tier 3 auto-clear protected):"
    echo "    - identity-core.json"
    echo ""
    echo "  THIS IS IRREVERSIBLE."
    echo ""
    echo "  To RESUME from saved training instead, run Savestart.sh — it sets"
    echo "  DREAM_KEEP_STATE=1 and never wipes."
    echo ""
    # 30s timeout, default = N (don't wipe). `read -t 30 -r -p` is bash builtin.
    if read -t 30 -r -p "  Are you sure you want to WIPE all training and boot fresh? (y/N): " confirm; then
        :
    else
        confirm=""
    fi
    case "$confirm" in
        y|Y|yes|YES)
            echo ""
            echo "  Confirmed — proceeding with WIPE + boot."
            echo ""
            ;;
        *)
            echo ""
            echo "  Aborted. No state was modified. Run Savestart.sh to resume training."
            echo ""
            exit 0
            ;;
    esac
fi

DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Step 1/7: kill any prior listener on port 7525
echo "[start] step 1/7: killing any prior listener on port 7525..."
lsof -ti:7525 2>/dev/null | xargs kill -9 2>/dev/null
echo ""

# Step 2/7: enter server folder
echo "[start] step 2/7: entering server folder..."
cd "$DIR/server" || { echo "  ERROR: server/ folder missing"; exit 1; }
echo ""

# Step 3/7: check npm dependencies
echo "[start] step 3/7: checking npm dependencies..."
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
echo "[start] step 4/7: checking esbuild..."
if [ ! -d "node_modules/esbuild" ]; then
    echo "  Installing esbuild for bundle build..."
    if ! npm install esbuild --save-dev; then
        echo ""
        echo "  ============================================================"
        echo "  ERROR: esbuild install failed."
        echo "  Try manually:"
        echo "    cd server"
        echo "    npm install esbuild --save-dev"
        echo "  ============================================================"
        echo ""
        exit 1
    fi
fi
echo "  esbuild present."
echo ""

# Step 5/7: check GloVe 6B.300d substrate
echo "[start] step 5/7: checking GloVe 6B.300d substrate..."
# Make sure GloVe 6B.300d is present for Unity's semantic substrate.
# Without it, language cortex falls back to fastText-style subword hash
# embeddings which don't cluster rhyming/semantic neighbors — production
# probes at K+ grades struggle. Download is idempotent: skipped if the
# file already exists; soft-fails to subword fallback if the download or
# extract errors so the brain still boots.
if [ ! -f "$DIR/corpora/glove.6B.300d.txt" ]; then
    echo "  GloVe 6B.300d not found - downloading (~823 MB zip, one-time, 5-15 min)..."
    echo "  Source: https://nlp.stanford.edu/data/glove.6B.zip"
    mkdir -p "$DIR/corpora"
    cd "$DIR/corpora" || exit 1
    # --progress-bar gives a simple [====] progress line that doesn't use
    # carriage-return animation (cleaner in non-TTY logs).
    if curl -L --fail --show-error --progress-bar --max-time 1800 -o glove.6B.zip https://nlp.stanford.edu/data/glove.6B.zip; then
        # Extract just glove.6B.300d.txt — skips 50d/100d/200d variants
        # (~1 GB of disk saved). Try unzip first, fall back to tar.
        if unzip -o glove.6B.zip glove.6B.300d.txt 2>/dev/null || \
           tar -xf glove.6B.zip glove.6B.300d.txt 2>/dev/null; then
            rm glove.6B.zip
            echo "  GloVe 6B.300d installed at corpora/glove.6B.300d.txt."
        else
            echo ""
            echo "  ============================================================"
            echo "  WARNING: GloVe extract failed (no unzip or tar). Install one and retry."
            echo "    macOS: tar + unzip ship by default"
            echo "    Debian/Ubuntu: apt install unzip"
            echo "    Alpine: apk add unzip"
            echo "  Continuing with subword fallback for now."
            echo "  ============================================================"
            echo ""
        fi
    else
        echo ""
        echo "  ============================================================"
        echo "  WARNING: GloVe download failed (network / curl missing / Stanford"
        echo "  NLP unreachable). Continuing with built-in fastText-style subword"
        echo "  embeddings fallback. Re-run start.sh when internet is available"
        echo "  to retry — the download is idempotent."
        echo "  ============================================================"
        echo ""
    fi
    cd "$DIR/server" || exit 1
fi
echo "  GloVe substrate present."
echo ""

# Step 6/7: rebuild js/app.bundle.js
echo "[start] step 6/7: rebuilding js/app.bundle.js..."
# The browser loads js/app.bundle.js, NOT live source. Bundle is gitignored
# so every code change requires a rebuild. Using `npm run build` for parity
# with start.bat — previously Linux/Mac used inline `npx esbuild 2>/dev/null`
# which swallowed errors and could silently run stale code.
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

# Step 7/7: launch brain server with full V8 flags + log redirect.
#
# --max-old-space-size=65536 = 64 GB V8 heap ceiling. Language cortex
# weights live in JS-owned typed arrays; auto-scale derives neuron
# count from os.freemem() and v8.getHeapStatistics().heap_size_limit,
# so a bigger heap = bigger language cortex.
#
# --max-semi-space-size=1024 = 1 GB semi-space (V8 new-generation
# region). Default 16 MB causes Mark-Compact failures during sustained
# external-memory allocation rates (worker-pool SAB + curriculum
# Float64Array + Buffer pool) — "Committing semi space failed.
# Allocation failed - JavaScript heap out of memory" → FATAL. Bumping
# semi-space to 1 GB gives V8 ~64× more breathing room.
#
# --expose-gc lets cluster.initGpu() call global.gc() after CPU CSR
# free to force V8 to reclaim ~8 GB of external memory immediately
# instead of waiting for the next scheduled Mark-Compact cycle.
#
# Brain-server stdout/stderr is redirected to server/server.log so
# operators can review log without burning watchdog tokens, and Claude
# can read it on demand via Read or Grep tools.
echo "[start] step 7/7: launching brain server (GPU EXCLUSIVE)..."
echo "  server log: $DIR/server/server.log"

# Reset log on each start.sh run — matches start.bat's `del server.log`.
if [ -f server.log ]; then rm server.log; fi

# Launch brain server in background with output redirect.
node --max-old-space-size=65536 --max-semi-space-size=1024 --expose-gc brain-server.js > server.log 2>&1 &
SERVER_PID=$!
sleep 2

# Open landing page + dashboard alongside (matches start.bat — dashboard
# milestone panel visible from boot).
# compute.html is NOT opened here — server auto-launches it via
# brain-server.js _spawnGpuClient() once HTTP listener is up. Keeps
# `node brain-server.js` and start.sh both one-command entry points.
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
echo "  Watch for these boot banners in server.log:"
echo "    ✓ [Cluster cortex] cortical wiring verified ..."
echo "    ✓ [Brain] dictionary API ready — \"test\" → \"...\""
echo "    📚 [Brain] K-VOCAB-PREFETCH DONE — N new definitions cached"
echo ""
echo "  NOTE: brain runs ONLY on GPU. compute.html MUST stay open."
echo "  To STOP cleanly: stop.sh (or Ctrl+C this launcher then kill PID $SERVER_PID)"
echo "  Also close http://localhost:7525 browser tabs — compute.html"
echo "  keeps WebGPU running even without the server."
echo ""

# Wait for server (Ctrl+C kills the wait; server keeps running until
# OS sends signal to PID).
wait $SERVER_PID
