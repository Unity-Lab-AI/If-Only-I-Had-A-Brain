@echo off
REM Launcher lives in windows\ — cd up one level so the rest of the script
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
REM   1. Graceful HTTP shutdown via POST /shutdown — node receives the
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
    echo   WARNING: port 7525 still held - force-killing ALL node.exe processes.
    taskkill /f /im node.exe >nul 2>&1
    ping -n 2 127.0.0.1 >nul
    netstat -ano | findstr :7525 | findstr LISTENING >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo   ERROR: port 7525 STILL held. Manual intervention needed.
        echo   Run as Admin: taskkill /f /im node.exe
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
echo   on next boot and the server would skip the auto-launch — operator
echo   ends up with no visible compute.html).
REM Kill Chrome processes that have UnityBrain-WebGPU-Profile
REM in their command line. PowerShell + Get-CimInstance is the modern
REM replacement for the deprecated WMIC. Only kills Chrome processes
REM attached to OUR isolated profile — operator's regular Chrome stays
REM alive.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^chrome\.exe$|^msedge\.exe$' -and $_.CommandLine -like '*UnityBrain-WebGPU-Profile*' } | ForEach-Object { Write-Host '   killing Chrome PID' $_.ProcessId; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" 2>nul

echo.
echo   Brain server stopped.
echo   Remember to close any browser tabs on http://localhost:7525 -
echo   compute.html keeps the WebGPU loop running even without the
echo   server, which is what keeps your GPU fans spinning.
echo.
pause
