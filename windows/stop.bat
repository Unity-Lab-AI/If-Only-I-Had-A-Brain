@echo off
REM Launcher lives in windows\ -- cd up one level so the rest of the script
REM resolves paths from the project root (corpora\, server\, js\, etc.)
REM exactly the way it did when this file used to live in the root.
cd /d "%~dp0.."
title Stop Unity Brain Server
echo.
echo   ==============================
echo     Stop Unity Brain Server
echo   ==============================
echo.

REM Ctrl+C in the launcher terminal does NOT halt the brain server
REM because start.bat uses `start /b` which detaches node from the
REM launcher. This script gives operators a clean kill path.
REM
REM Three stages, ordered best-to-worst so we exit as soon as the brain
REM is dead:
REM   1. Graceful HTTP shutdown via POST /shutdown -- node receives the
REM      request, runs its SIGINT-equivalent cleanup (save weights,
REM      close sqlite, etc.), then process.exit(0).
REM   2. If HTTP shutdown doesn't respond within a few seconds, fall
REM      through to taskkill on any PID holding port 7525.
REM   3. If the port is still held after that, best-effort force-kill
REM      every node.exe process on the machine as a last resort (the
REM      operator's launcher window only ever has one node for the
REM      brain so this is safe on dedicated dev boxes).
REM
REM Then the CONTROL PLANE on 7526 is stopped as well - see CTLSTOP below for
REM why that is the default. `stop.bat keepctl` leaves it up.

echo [stop] step 1/3: requesting graceful shutdown via HTTP /shutdown...
curl -s -m 5 -X POST http://localhost:7525/shutdown > nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   graceful shutdown request sent - waiting 3s for server to exit...
    ping -n 4 127.0.0.1 >nul
)

echo.
echo [stop] step 2/3: killing any PID still listening on port 7525...
set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :7525 ^| findstr LISTENING') do (
    set FOUND=1
    echo   killing PID %%a
    taskkill /f /pid %%a >nul 2>&1
)
if "%FOUND%"=="0" (
    echo   port 7525 free - server already dead.
) else (
    ping -n 2 127.0.0.1 >nul
)

echo.
echo [stop] step 3/3: verifying port 7525 is free...
netstat -ano | findstr :7525 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    REM CTLSTOP - kill the PIDs HOLDING 7525, not every node.exe on the box.
    REM   1. `taskkill /f /im node.exe` is indiscriminate: it also kills the
    REM      control plane on 7526, and any unrelated node the operator is
    REM      running. Losing brain-ctl here is the worst of it, because it is
    REM      the thing that would let the dashboard START the brain again -
    REM      so the nuclear option quietly removed the recovery path.
    REM   2. Targeting the port kills exactly what is wedged and nothing else.
    echo   WARNING: port 7525 still held - killing the PIDs holding it.
    for /f "tokens=5" %%b in ('netstat -ano ^| findstr :7525 ^| findstr LISTENING') do (
        taskkill /f /pid %%b >nul 2>&1
    )
    ping -n 2 127.0.0.1 >nul
    netstat -ano | findstr :7525 | findstr LISTENING >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo   ERROR: port 7525 STILL held. Manual intervention needed.
        echo   Run as Admin: taskkill /f /im node.exe
        echo   ^(that kills EVERY node - including the control plane on 7526.^)
    ) else (
        echo   OK: port 7525 now free after force-kill.
    )
) else (
    echo   OK: port 7525 is free.
)

echo.
echo [stop] bonus step: closing Chrome processes attached to the isolated
echo   UnityBrain-WebGPU-Profile so subsequent start.bat boots clean
echo   (prior Chrome compute.html windows would otherwise auto-reconnect
echo   on next boot and the server would skip the auto-launch -- operator
echo   ends up with no visible compute.html).
REM Kill Chrome processes that have UnityBrain-WebGPU-Profile
REM in their command line. PowerShell + Get-CimInstance is the modern
REM replacement for the deprecated WMIC. Only kills Chrome processes
REM attached to OUR isolated profile -- operator's regular Chrome stays
REM alive.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^chrome\.exe$|^msedge\.exe$' -and $_.CommandLine -like '*UnityBrain-WebGPU-Profile*' } | ForEach-Object { Write-Host '   killing Chrome PID' $_.ProcessId; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" 2>nul

echo.
echo [stop] control plane (port 7526)...
REM CTLSTOP - brain-ctl IS STOPPED BY DEFAULT. Inverted from the original
REM "left running on purpose" behaviour on the operator's instruction, and it
REM fixes a real defect rather than only changing a preference:
REM
REM   1. brain-ctl exits QUIETLY on EADDRINUSE (brain-ctl.js, the already-
REM      running instance is the correct one on the box). So a launcher
REM      relaunch does NOT replace a running control plane - which means
REM      EVERY EDIT TO brain-ctl.js IS INERT until the old process is gone.
REM      That is the local twin of the box defect recorded in
REM      docs/BUTTON-AUDIT.md: self-update.sh restarts the brain and never the
REM      control plane, so control-plane fixes there can be months old.
REM   2. The original rationale was that killing it "removed the way to start
REM      again" - true ON THE BOX, where there is no shell and the dashboard
REM      is the only lever. It does NOT hold locally: the operator is sitting
REM      at the machine with start.bat and Savestart.bat in this very folder.
REM      The recovery path brain-ctl exists to provide is already in reach.
REM
REM Pass `stop.bat keepctl` for the old behaviour (leave it up) - kept because
REM it is the right choice when driving a local brain purely from the
REM dashboard. `stop.bat all` still means everything down.
REM !! AND IT MUST NOT DECAPITATE ITS OWN CALLER. brain-ctl uses THIS SCRIPT as
REM the stop primitive behind the dashboard's Stop button, so once stopping the
REM control plane became the default, a Stop press would kill the very process
REM serving the request: the HTTP response would never arrive (so a successful
REM stop reports as a failure) and the Start button would be gone with it -
REM which is precisely the original "left running on purpose" rationale.
REM   The two callers are distinguishable, so they are distinguished:
REM   UAL_CTL_NONINTERACTIVE=1 is set ONLY by brain-ctl's spawnLauncher.
REM   Launched by the control plane -> keep the control plane.
REM   Run by a human              -> stop everything, as instructed.
netstat -ano | findstr :7526 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    if defined UAL_CTL_NONINTERACTIVE (
        echo   control plane LEFT RUNNING on 7526 - this stop was launched BY
        echo   the control plane, and killing it would cut off the reply to the
        echo   press and remove the Start button. Run stop.bat yourself to
        echo   stop it too.
    ) else if /i "%~1"=="keepctl" (
        echo   control plane LEFT RUNNING on 7526 ^(you asked for 'keepctl'^).
        echo   It is what lets the dashboard Start the brain again - but a
        echo   launcher will NOT replace it, so edits to brain-ctl.js stay
        echo   inert until it is stopped.
    ) else (
        for /f "tokens=5" %%c in ('netstat -ano ^| findstr :7526 ^| findstr LISTENING') do (
            echo   killing control-plane PID %%c
            taskkill /f /pid %%c >nul 2>&1
        )
        ping -n 2 127.0.0.1 >nul
        REM BATCHERR - `if errorlevel N`, NOT `if %ERRORLEVEL% EQU N`. Inside a
        REM parenthesised block %ERRORLEVEL% is expanded when the block is
        REM PARSED, so it carries the value from before the netstat above ever
        REM ran and the branch is decided by a stale number. `if errorlevel` is
        REM evaluated at run time and is the only correct form here.
        REM errorlevel 0 = findstr matched = port STILL held.
        netstat -ano | findstr :7526 | findstr LISTENING >nul 2>&1
        if not errorlevel 1 (
            echo   WARNING: port 7526 STILL held - the next launcher will exit
            echo   quietly on EADDRINUSE and keep serving the OLD build.
        ) else (
            echo   control plane STOPPED - the next start.bat / Savestart.bat
            echo   starts a FRESH one, so brain-ctl.js changes take effect.
        )
    )
) else (
    echo   control plane not running.
)
echo.
echo   Brain server stopped.
echo   Remember to close any browser tabs on http://localhost:7525 -
echo   compute.html keeps the WebGPU loop running even without the
echo   server, which is what keeps your GPU fans spinning.
echo.
REM NOPAUSE - brain-ctl spawns this script when the dashboard's Stop button is
REM pressed, and it sets UAL_CTL_NONINTERACTIVE=1. Without this guard the
REM spawned window completed the stop and then sat on "Press any key to
REM continue" forever: one orphaned console per press, with nobody at a
REM keyboard because the press came from a browser. A human double-clicking
REM this file never sets the variable and still gets the pause.
if defined UAL_CTL_NONINTERACTIVE (
    echo   [non-interactive: launched by the control plane - closing]
) else (
    pause
)
