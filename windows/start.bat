@echo off
REM Launcher lives in windows\ — cd up one level so the rest of the script
REM resolves paths from the project root (corpora\, server\, js\, etc.)
REM exactly the way it did when this file used to live in the root.
cd /d "%~dp0.."
title Unity Brain Server
echo.
echo   ==============================
echo     Unity Brain Server
echo   ==============================
echo.

REM Optional env flags:
REM   DREAM_FORCE_CLEAR=1            wipe brain state on boot (or /fresh)
REM   DREAM_KEEP_STATE=1             preserve state (or use Savestart.bat)
REM   DREAM_MAX_GRADE=phd            unset Pre-K + K cap
REM   DREAM_DEFINITION_CACHE_FILE=   path to JSON for persistent dictionary
REM                                  cache (skips ~1 min cold-start re-warm
REM                                  on restart). Default in-memory only.
REM   DREAM_SMALL_WORLD=0            opt OUT of small-world topology
REM   DREAM_MICROCOLUMNS=0           opt OUT of cortical microcolumns
REM   DREAM_LAMINATION=0             opt OUT of six-layer lamination
REM   DREAM_HUBS=0                   opt OUT of hub neurons
REM   DREAM_THETA_GAMMA=0            opt OUT of theta/gamma oscillations
REM   DREAM_GW_IGNITION=0.45         GlobalWorkspace ignition threshold
REM                                  in (0, 1). Default 0.45. Lower =
REM                                  more frequent ignitions (diffuse
REM                                  consciousness); higher = stricter
REM
REM Brain calls dictionaryapi.dev outbound for live word definitions.
REM Firewall / offline → definitions silently fail; brain still boots.

REM Node 18+ required (built-in globalThis.fetch for dictionary API).
for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_RAW=%%v
if "%NODE_RAW%"=="" (
    echo   WARNING: node not found in PATH. Install Node ^>=18 from https://nodejs.org
    pause
    exit /b 1
)
REM Strip leading 'v' and split on '.' to get major version.
set NODE_RAW=%NODE_RAW:v=%
for /f "tokens=1 delims=." %%m in ("%NODE_RAW%") do set NODE_MAJOR=%%m
if %NODE_MAJOR% LSS 18 (
    echo   WARNING: Node v%NODE_RAW% detected. Dictionary API requires Node ^>=18.
    echo   Brain still boots; definitions degrade to no-op.
    echo.
)

REM start.bat is DESTRUCTIVE per the iter14-D launcher contract: every
REM boot WIPES brain-weights + episodic memory + schemas + conversations
REM via the brain-server's autoClearStaleState(). Tier 3 identity-core.json
REM is preserved. Use Savestart.bat to RESUME from saved training instead.
REM
REM Bypass flags (skip the Y/N confirmation gate below):
REM   start.bat /fresh        — explicit wipe, bypasses gate
REM   start.bat /clear        — alias for /fresh
REM   start.bat -y / /yes     — bypass gate (CI / scripted path)
REM   DREAM_FORCE_CLEAR=1     — env var bypass (CI / scripted path)
if /i "%1"=="/fresh" set DREAM_FORCE_CLEAR=1
if /i "%1"=="/clear" set DREAM_FORCE_CLEAR=1
if /i "%1"=="-y"     set DREAM_FORCE_CLEAR=1
if /i "%1"=="--yes"  set DREAM_FORCE_CLEAR=1
if /i "%1"=="/yes"   set DREAM_FORCE_CLEAR=1

if defined DREAM_FORCE_CLEAR (
    echo   [!] DREAM_FORCE_CLEAR=1 — will clear brain state on boot.
    echo.
    goto skip_confirm_gate
)

REM ────────────────────────────────────────────────────────────────
REM Y/N CONFIRMATION GATE (Gee 2026-05-08 LAW — irreversible-loss warning)
REM ────────────────────────────────────────────────────────────────
REM Without this gate, accidentally double-clicking start.bat (or running
REM it by reflex after a CLI restart) silently destroys hours of training.
REM The gate forces explicit confirmation before the destructive wipe fires.
echo.
echo   ============================================================
echo   [WARNING] start.bat is DESTRUCTIVE — it WIPES training state.
echo   ============================================================
echo.
echo   This boot will DELETE the following from server\:
echo     - brain-weights.json + v0-v4 rotation
echo     - brain-weights.bin (typically 100-200 MB of trained weights)
echo     - conversations.json
echo     - episodic-memory.db*
echo     - schemas.json
echo.
echo   Preserved (Tier 3 auto-clear protected):
echo     - identity-core.json
echo.
echo   THIS IS IRREVERSIBLE.
echo.
echo   To RESUME from saved training instead, close this window and
echo   run Savestart.bat — it sets DREAM_KEEP_STATE=1 and never wipes.
echo.
choice /C YN /D N /T 30 /M "Are you sure you want to WIPE all training and boot fresh"
if errorlevel 2 (
    echo.
    echo   Aborted. No state was modified. Run Savestart.bat to resume training.
    echo.
    pause
    exit /b 0
)
echo.
echo   Confirmed — proceeding with WIPE + boot.
echo.
:skip_confirm_gate

REM Step checkpoints so operators always see progress. Prior reports of
REM "invisible translucent terminal with just the title tab" stemmed from
REM silent-output phases (port-kill redirected >nul 2>&1, npm/esbuild
REM presence checks that goto-skip on success). Each major phase now
REM emits a visible banner so if a hang ever recurs, the last printed
REM step identifies where.

echo [start] step 1/7: killing any prior listener on port 7525...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :7525 ^| findstr LISTENING') do (
    echo   [start] taskkill /F /PID %%a
    taskkill /f /pid %%a
)
echo.

echo [start] step 2/7: entering server folder...
cd /d "%~dp0..\server"
echo.

echo [start] step 3/7: checking npm dependencies...
if exist node_modules goto npm_done
echo   Installing server dependencies (first run, ~30s)...
call npm install
if errorlevel 1 goto err_npm
:npm_done
echo   node_modules present.
echo.

echo [start] step 4/7: checking esbuild...
if exist node_modules\esbuild goto esbuild_done
echo   Installing esbuild for bundle build...
call npm install esbuild --save-dev
if errorlevel 1 goto err_esbuild_install
:esbuild_done
echo   esbuild present.
echo.

echo [start] step 5/7: checking GloVe 6B.300d substrate...
REM Make sure GloVe 6B.300d is present for Unity's semantic substrate.
REM Without it, language cortex falls back to fastText-style subword hash
REM embeddings which don't cluster rhyming/semantic neighbors - production
REM probes at K+ grades struggle. Download is idempotent: skipped if the
REM file already exists; soft-fails to subword fallback if the download or
REM extract errors so the brain still boots.
if exist "%~dp0..\corpora\glove.6B.300d.txt" goto glove_done
echo   GloVe 6B.300d not found - downloading (~823 MB zip, one-time, 5-15 min)...
echo   Source: https://nlp.stanford.edu/data/glove.6B.zip
if not exist "%~dp0..\corpora" mkdir "%~dp0..\corpora"
pushd "%~dp0..\corpora"
REM --progress-bar gives a simple [====] progress line that doesn't use
REM carriage-return animation. Without --progress-bar, curl's default
REM progress table uses \r to overwrite lines, which corrupts CMD's
REM subsequent "if errorlevel" line parse (seen as "'rrorlevel' is not
REM recognized" from exactly this bug). Also using %ERRORLEVEL%
REM explicit check (more robust than bare "if errorlevel 1" against
REM prior curl progress state).
curl -L --fail --show-error --progress-bar --max-time 1800 -o glove.6B.zip https://nlp.stanford.edu/data/glove.6B.zip
if %ERRORLEVEL% NEQ 0 (
    popd
    goto err_glove_download
)
echo   Extracting glove.6B.300d.txt (~990 MB from zip)...
tar -xf glove.6B.zip glove.6B.300d.txt
if %ERRORLEVEL% NEQ 0 (
    popd
    goto err_glove_extract
)
del glove.6B.zip
popd
echo   GloVe 6B.300d installed at corpora\glove.6B.300d.txt.
:glove_done
echo   GloVe substrate present.
echo.

echo [start] step 6/7: rebuilding js/app.bundle.js...
REM Build the JS bundle. The browser loads js/app.bundle.js, NOT live source.
REM Bundle is gitignored so every code change requires a rebuild.
call npm run build
if errorlevel 1 goto err_bundle
echo   Bundle built - browser will load fresh code.
echo.

REM Start brain server in background, wait, open the landing page tab.
REM --max-old-space-size=65536 = 64 GB V8 heap ceiling. Language
REM cortex is CPU-side for now (GPU port in progress) and its sparse
REM synapse + cross-projection weights live in JS-owned typed arrays.
REM The auto-scale logic in brain-server.js derives its neuron count
REM from os.freemem() and v8.getHeapStatistics().heap_size_limit, so
REM a bigger heap ceiling = bigger language cortex size. On a 128 GB
REM RAM box this lets the language cluster reach ~7-8 M neurons before
REM hitting the 50%-of-free-RAM constraint. Set even higher (128 GB
REM box could run 96 GB) if needed. Zero hardcoded cluster-size cap.
REM
REM compute.html is NOT opened here — the server auto-launches it
REM via brain-server.js `_spawnGpuClient()` once the HTTP listener
REM is up. This keeps `node brain-server.js` and `start.bat` both
REM one-command entry points; no duplicate tabs, no stale log
REM telling the operator to open compute.html manually.
REM --max-semi-space-size=1024 (1 GB semi-space per V8 new-generation
REM region). Default Node semi-space is 16 MB, which at biological scale
REM Phase 2 sustains external-memory allocation rates (worker-pool SAB +
REM curriculum Float64Array + Buffer pool) high enough that V8 can't
REM commit semi-space growth during Mark-Compact cycles → "Committing
REM semi space failed. Allocation failed - JavaScript heap out of
REM memory" → FATAL. Bumping semi-space to 1 GB gives V8 ~64× more
REM breathing room; Mark-Compact can run cleanly under sustained
REM external-memory allocation rates of ~10 GB/sec for short bursts.
REM Combined with --max-old-space-size=65536 (64 GB) V8 has ~66 GB
REM of headroom, well below a typical 128 GB physical RAM ceiling.
REM --expose-gc lets cluster.initGpu() call global.gc() after the CPU
REM CSR free block to force V8 to reclaim the ~8 GB of external memory
REM immediately (instead of waiting for the next scheduled Mark-Compact
REM cycle). Without --expose-gc the null-assignments unref the typed
REM arrays but V8 can take seconds to minutes to GC them — long enough
REM for Phase 2 external-memory pressure to build and OOM before the
REM reclaim lands. Forced gc() after all uploads guarantees the 8 GB
REM is gone before curriculum teach starts. Heap-stats logging before +
REM after the forced gc() lets operators visually confirm the reclaim.
REM Brain-server stdout/stderr is redirected to server\server.log so
REM operators can tail heartbeat + brain info even if this launcher
REM terminal goes invisible (Windows Terminal + conhost rendering
REM glitches leave child-process output blind when the parent window
REM can't paint). A SECOND PowerShell window is spawned that tails the
REM log with Get-Content -Wait — a separate process, separate
REM rendering, so even if THIS cmd window is translucent/blank the log
REM window still paints. Fallback path: if the PowerShell tail window
REM also breaks, server.log is on disk at server\server.log and any
REM terminal can read it.
REM Force UTF-8 end-to-end on the PowerShell tail window. Node writes
REM UTF-8 bytes to server.log (emoji + em-dash + box-drawing chars in
REM curriculum heartbeats). PowerShell 5.1's Get-Content without an
REM explicit -Encoding defaults to the system code page (Windows-1252
REM on US Windows), which decodes UTF-8 E2 95 90 (═) as â• mojibake.
REM Plus the PowerShell console's OutputEncoding must be UTF-8 or even
REM a correctly-decoded emoji won't render right when re-emitted.
REM Setting both [Console]::OutputEncoding + Get-Content -Encoding UTF8
REM renders the log window cleanly.
echo [start] step 7/7: launching brain server + log tail window (GPU EXCLUSIVE)...
echo   server log: %~dp0..\server\server.log
if exist server.log del server.log
start /b "" cmd /c "node --max-old-space-size=65536 --max-semi-space-size=1024 --expose-gc brain-server.js > server.log 2>&1"
ping -n 2 127.0.0.1 >nul
start "Unity Brain Log Tail" powershell -NoExit -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; Get-Content -Path '%~dp0..\server\server.log' -Wait -Tail 200 -Encoding UTF8"
ping -n 2 127.0.0.1 >nul
start "" http://localhost:7525
REM Dashboard auto-opens alongside the landing page so the milestone panel
REM (curriculum state, save-resume vs fresh-boot, passed cells, operator
REM signoffs) is visible from the first moment the brain is up.
start "" http://localhost:7525/dashboard.html
echo.
echo   Landing:     http://localhost:7525
echo   Dashboard:   http://localhost:7525/dashboard.html (auto-opened)
echo   GPU compute: http://localhost:7525/compute.html (auto-launched by server)
echo   Log tail:    separate PowerShell window "Unity Brain Log Tail"
echo   Log file:    %~dp0..\server\server.log (always on disk)
echo.
echo   Watch for these boot banners in server.log:
echo     [Cluster cortex] cortical wiring verified ...
echo     [Brain] dictionary API ready — "test" -^> "..."
echo     [Brain] K-VOCAB-PREFETCH DONE — N new definitions cached
echo.
echo   NOTE: brain runs ONLY on GPU. compute.html MUST stay open.
echo   To STOP the brain cleanly: run stop.bat (Ctrl+C in this launcher
echo   or the tail window does NOT reach the detached node process -
echo   stop.bat sends HTTP /shutdown, then taskkill on port 7525 if
echo   needed, then verifies the port is free).
echo   Also close the http://localhost:7525 browser tabs - compute.html
echo   keeps WebGPU running even without the server.
echo.

REM Keep this launcher window open for additional manual commands.
cmd /k
goto :eof

:err_npm
echo.
echo   ============================================================
echo   ERROR: npm install failed in server folder.
echo   Make sure Node.js is installed: https://nodejs.org
echo   ============================================================
echo.
pause
exit /b 1

:err_esbuild_install
echo.
echo   ============================================================
echo   ERROR: esbuild install failed.
echo   Try manually:
echo     cd server
echo     npm install esbuild --save-dev
echo   ============================================================
echo.
pause
exit /b 1

:err_bundle
echo.
echo   ============================================================
echo   ERROR: esbuild bundle build failed.
echo   See the esbuild output above for the cause.
echo   The browser will run STALE code from the previous bundle.
echo   ============================================================
echo.
pause
exit /b 1

:err_glove_download
echo.
echo   ============================================================
echo   WARNING: GloVe download failed (network, curl missing, or
echo   Stanford NLP server unreachable). Continuing with built-in
echo   fastText-style subword embeddings fallback.
echo.
echo   Unity still runs, but semantic production probes (rhyming,
echo   synonym clustering, categorical grouping) will have weaker
echo   substrate. Re-run start.bat when internet is available to
echo   retry the download - it's idempotent.
echo.
echo   Manual install: download glove.6B.zip from
echo     https://nlp.stanford.edu/data/glove.6B.zip
echo   extract glove.6B.300d.txt into the corpora\ folder.
echo   ============================================================
echo.
goto glove_done

:err_glove_extract
echo.
echo   ============================================================
echo   WARNING: GloVe extract failed (tar missing or zip corrupt).
echo   tar ships with Windows 10 build 17063+ - if it's missing
echo   either upgrade Windows or extract glove.6B.300d.txt manually
echo   from corpora\glove.6B.zip using any unzip tool.
echo   Continuing with subword fallback for now.
echo   ============================================================
echo.
goto glove_done
