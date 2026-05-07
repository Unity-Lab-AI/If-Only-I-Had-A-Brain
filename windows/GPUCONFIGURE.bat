@echo off
REM Launcher lives in windows\ — cd up one level so the rest of the script
REM resolves paths from the project root (corpora\, server\, js\, etc.)
REM exactly the way it did when this file used to live in the root.
cd /d "%~dp0.."
title Unity Brain Server - Resource Configuration
echo.
echo   ===========================================
echo    Unity Brain Server - GPU / Resource Config
echo   ===========================================
echo.
echo   One-shot admin tool:
echo     - detects your hardware (GPU, VRAM, RAM, CPU)
echo     - shows resource tier presets from "minimum laptop"
echo       all the way to supercomputer / quantum research tiers
echo     - writes server/resource-config.json
echo     - every future start.bat run respects it
echo.

:: Make sure node is available
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] node is not in PATH. Install Node.js first.
    pause
    exit /b 1
)

:: Make sure server deps are installed (configure.js only needs stdlib,
:: but the brain-server shares this folder and may need them at runtime)
cd /d "%~dp0..\server"
if not exist "node_modules" (
    echo   Installing server dependencies first...
    call npm install
    echo.
)

:: Kill anything stale on the configure port (7526)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :7526 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

cd /d "%~dp0..\"
echo   Launching configuration UI at http://127.0.0.1:7526
echo   Your browser should open automatically.
echo.
echo   Ctrl+C in this window to cancel without saving.
echo.

:: Run the one-shot config server. Exits when the user clicks EXIT in
:: the UI, or when Ctrl+C is pressed here. The browser window stays
:: open with a "configuration tool exited" message.
node server\configure.js

echo.
echo   Configuration tool closed.
echo   Current config file: server\resource-config.json
if exist "server\resource-config.json" (
    echo.
    echo   --- saved config ---
    type "server\resource-config.json"
    echo.
    echo   --------------------
)
echo.
echo   Run start.bat to boot the brain server with this configuration.
echo.
pause
