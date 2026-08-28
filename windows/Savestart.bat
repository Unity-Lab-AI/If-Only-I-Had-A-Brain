@echo off
REM Launcher lives in windows\ -- cd up one level so the rest of the script
REM resolves paths from the project root (corpora\, server\, js\, etc.)
REM exactly the way it did when this file used to live in the root.
cd /d "%~dp0.."
title Unity Brain Server (SAVE-STATE RESUME)
echo.
echo   ==============================
echo     Unity Brain Server
echo     SAVE-STATE RESUME MODE
echo   ==============================
echo.
echo   [Savestart] preserving brain state unconditionally.
echo   [Savestart] boot will hydrate from server\brain-weights*.json
echo   [Savestart] + conversations.json + episodic-memory.db.
echo.

REM Optional env flags -- see start.bat header for full list. Most-relevant
REM Savestart-side flags:
REM
REM !! TOPOLOGY ON A RESUME (2026-08-25). This entry point HOLDS the intra-
REM synapse wiring recorded in server/brain-topology.json. That is the whole
REM point of the pin: weights trained under one topology do not describe the
REM other, so a resume must never flip it. A FRESH WALK (start.bat) is what
REM re-decides -- and it now chooses TOPOGRAPHIC. If you resume a brain that
REM was built random-global you stay random-global, and the boot line says so.
REM DREAM_TOPOGRAPHIC=0/1 overrides, but on a resume that is a deliberate act
REM with the same consequence as a geometry change: the trained matrices no
REM longer match the wiring, and a fresh walk is the honest next step.
REM
REM Also inherited from start.bat and ON by default since 2026-08-25:
REM   DREAM_INNERVOICE_GPU_GEN     -- her inner voice at biological scale
REM                                   (=0 kills it)
REM   DREAM_GEN_PROPAGATE_CHUNKED  -- yielding CPU propagate (=0 opts out)
REM The WORD-SPELL-FINAL sem->motor wipe does NOT run on a resume by design --
REM only on a fresh walk, where the weights are already being cleared.
REM DREAM_DEFINITION_CACHE_FILE=path.json -- persistent dictionary cache survives
REM                                          restart → no ~1 min re-warm.
REM DREAM_COHERENCE_MIN=0.15 -- composeSentence cosine coherence floor (env-tunable).
REM DREAM_SAT_MEANCOS=0.7    -- saturation halt: mean-cos > X.
REM DREAM_SAT_MEANABS=0.6    -- saturation halt: meanAbs > X*wMax.
REM DREAM_SAT_RATIO=1.5      -- saturation halt: max/mean ratio < X.
REM DREAM_SAT_SAMPLE=1000    -- weight-distribution sample size for sat check.
REM First-N reads of each tunable log calibration data so operator can tune
REM from real run history. See start.bat header for full descriptions.

REM Node 18+ required (built-in globalThis.fetch for dictionary API).
for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_RAW=%%v
if "%NODE_RAW%"=="" (
    echo   WARNING: node not found in PATH. Install Node ^>=18 from https://nodejs.org
    pause
    exit /b 1
)
set NODE_RAW=%NODE_RAW:v=%
for /f "tokens=1 delims=." %%m in ("%NODE_RAW%") do set NODE_MAJOR=%%m
if %NODE_MAJOR% LSS 18 (
    echo   WARNING: Node v%NODE_RAW% detected. Dictionary API requires Node ^>=18.
    echo   Brain still boots; definitions degrade to no-op.
    echo.
)


REM FORCE preserve-state. Overrides autoClearStaleState() regardless of
REM code-hash change since last run. DREAM_FORCE_CLEAR is explicitly
REM rejected in this script -- this entry point is for resume only.
set DREAM_KEEP_STATE=1
set DREAM_FORCE_CLEAR=

REM ── DONORDEFAULT (2026-08-23) — SAVESTART GETS THE SAME NATIVE-DONOR
REM DEFAULT AS start.bat. The first pass of this fix only touched start.bat
REM and start.sh, so resuming through Savestart still auto-launched the
REM isolated Chrome compute.html donor and re-spawned it when closed —
REM operator hit it immediately: "i savestart.bat ran it and the compute html
REM doner opened auto like, i thought we fixed that". Two entry points, one
REM behaviour: fix the launcher family, not the launcher you happened to run.
REM /browser restores the browser donor; an explicit DREAM_NO_AUTO_GPU wins.
if /i "%1"=="/browser" set DREAM_WANT_BROWSER_GPU=1
if /i "%2"=="/browser" set DREAM_WANT_BROWSER_GPU=1
if not defined DREAM_NO_AUTO_GPU (
    if defined DREAM_WANT_BROWSER_GPU (
        echo   [gpu] /browser -- auto-launching the isolated Chrome compute.html donor.
    ) else (
        set DREAM_NO_AUTO_GPU=1
        echo   [gpu] native-donor mode: no browser auto-launch, no respawn loop.
        echo         Attach compute with:  donor-app\target\release\unity-donor.exe --local
        echo         Want the old browser donor instead?  Savestart.bat /browser
    )
)
if /i "%1"=="/fresh" (
    echo   [!] /fresh rejected -- use start.bat /fresh for a wipe.
    echo       Savestart.bat is save-resume only.
    pause
    exit /b 1
)
if /i "%1"=="/clear" (
    echo   [!] /clear rejected -- use start.bat /clear for a wipe.
    echo       Savestart.bat is save-resume only.
    pause
    exit /b 1
)

echo [Savestart] step 1/7: killing any prior listener on port 7525...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :7525 ^| findstr LISTENING') do (
    echo   [Savestart] taskkill /F /PID %%a
    taskkill /f /pid %%a
)
echo.

echo [Savestart] step 2/7: entering server folder...
cd /d "%~dp0..\server"
echo.

echo [Savestart] step 3/7: checking npm dependencies...
if exist node_modules goto npm_done
echo   Installing server dependencies (first run, ~30s)...
call npm install
if errorlevel 1 goto err_npm
:npm_done
echo   node_modules present.
echo.

echo [Savestart] step 4/7: checking esbuild...
if exist node_modules\esbuild goto esbuild_done
echo   Installing esbuild for bundle build...
call npm install esbuild --save-dev
if errorlevel 1 goto err_esbuild_install
:esbuild_done
echo   esbuild present.
echo.

echo [Savestart] step 5/7: checking GloVe 6B.300d substrate...
REM GloVe presence check -- Savestart hydrates from save state, but if the
REM corpora folder was wiped since the save was produced, we STILL need to
REM download GloVe so the semantic substrate matches what the saved weights
REM learned against. Falling back to subword on a GloVe-trained save would
REM corrupt semantic probes. Download if missing (same logic as start.bat).
if exist "%~dp0..\corpora\glove.6B.300d.txt" goto glove_done
echo   GloVe 6B.300d not found - downloading (~823 MB zip, one-time, 5-15 min)...
echo   Source: https://nlp.stanford.edu/data/glove.6B.zip
if not exist "%~dp0..\corpora" mkdir "%~dp0..\corpora"
pushd "%~dp0..\corpora"
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

echo [Savestart] step 6/7: rebuilding js/app.bundle.js...
call npm run build
if errorlevel 1 goto err_bundle
echo   Bundle built - browser will load fresh code.
echo.

REM stdout/stderr redirected to server\server.log + spawn a separate
REM PowerShell tail window so heartbeat + brain info paint in a fresh
REM process even if THIS launcher terminal goes invisible (Windows
REM Terminal / conhost rendering glitches).
REM Force UTF-8 end-to-end on the tail window. Node writes UTF-8 to
REM server.log (emoji + em-dash + box-drawing chars). PowerShell 5.1's
REM Get-Content without -Encoding decodes as system code page (CP1252
REM US) and turns ═══ into â•â•â• mojibake in the log window. Set the
REM console OutputEncoding to UTF-8 AND pass -Encoding UTF8 to
REM Get-Content so the bytes are both decoded AND rendered as UTF-8
REM end-to-end.
echo [Savestart] step 7/7: launching brain server + log tail (SAVE-STATE RESUME, DREAM_KEEP_STATE=1)...
echo   server log: %~dp0..\server\server.log
if exist server.log del server.log
REM LOCALCTL - control plane first (separate always-up process on 7526, which
REM is what lets the Start button work while the brain is DOWN). Already
REM running = exits 0 quietly, so re-launching never stacks instances.
REM CTLWINDOW (2026-08-28) - was `start /b`, which parents brain-ctl to THIS
REM console: closing an old launcher window silently killed the control plane,
REM port 7526 went dark, and the dashboard fell back to the legacy button row.
REM Its own minimized window survives launcher-window closes; log APPENDS.
start "unity-brain-ctl (leave running)" /min cmd /c "node brain-ctl.js >> brain-ctl.log 2>&1"
start /b "" cmd /c "node --max-old-space-size=65536 --max-semi-space-size=1024 --expose-gc brain-server.js > server.log 2>&1"
ping -n 2 127.0.0.1 >nul
start "Unity Brain Log Tail" powershell -NoExit -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; Get-Content -Path '%~dp0..\server\server.log' -Wait -Tail 200 -Encoding UTF8"
ping -n 2 127.0.0.1 >nul
start "" http://localhost:7525
REM Dashboard auto-opens alongside the landing page so the milestone panel
REM (curriculum state, save-resume vs fresh-boot, passed cells, operator
REM signoffs) is visible from the first moment the brain is up. Save-state
REM resume boot especially benefits -- the operator can confirm what loaded
REM from disk before committing to a long curriculum run.
start "" http://localhost:7525/dashboard.html
echo.
echo   Landing:     http://localhost:7525
echo   Dashboard:   http://localhost:7525/dashboard.html (auto-opened)
echo   GPU compute: http://localhost:7525/compute.html (auto-launched by server)
echo   Log tail:    separate PowerShell window "Unity Brain Log Tail"
echo   Log file:    %~dp0..\server\server.log (always on disk)
echo.
echo   NOTE: brain runs ONLY on GPU. compute.html MUST stay open.
echo   To STOP the brain cleanly: run stop.bat (Ctrl+C in this launcher
echo   or the tail window does NOT reach the detached node process -
echo   stop.bat sends HTTP /shutdown, then taskkill on port 7525 if
echo   needed, then verifies the port is free).
echo   Also close the http://localhost:7525 browser tabs - compute.html
echo   keeps WebGPU running even without the server.
echo.

REM Keep this launcher window open for manual commands.
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
echo   Unity still runs, but if her saved weights were learned
echo   against GloVe and we're now booting under subword, semantic
echo   probes will drift. Recommend exiting and re-running once
echo   internet is available - download is idempotent.
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
