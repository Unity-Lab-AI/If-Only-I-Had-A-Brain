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
REM CTLSTOP - brain-ctl is LEFT RUNNING ON PURPOSE by default.
REM It is a separate always-up process whose entire job is to outlive the
REM brain: with it up, the dashboard's Start button can bring the brain back.
REM Killing it here would mean "stop" also removed the way to start again.
REM Pass `stop.bat all` when you genuinely want everything down.
netstat -ano | findstr :7526 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    if /i "%~1"=="all" (
        for /f "tokens=5" %%c in ('netstat -ano ^| findstr :7526 ^| findstr LISTENING') do (
            taskkill /f /pid %%c >nul 2>&1
        )
        echo   control plane STOPPED ^(you asked for 'all'^) - the dashboard
        echo   Start button will not work until a launcher runs again.
    ) else (
        echo   control plane LEFT RUNNING on 7526 - this is deliberate.
        echo   It is what lets the dashboard Start the brain again.
        echo   Run `stop.bat all` to stop it too.
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
pause
