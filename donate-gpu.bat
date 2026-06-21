@echo off
REM ============================================================
REM  Unity GPU Donation Launcher (deployed site)
REM  Opens compute.html in an ISOLATED Chrome profile with the
REM  unsafe-webgpu flag so the WebGPU buffer-binding ceiling is
REM  raised above the default 2048MB. At biological scale the
REM  cross-projection / intra-synapse sparse buffers exceed 2GB
REM  per binding; without this flag they fail to upload and the
REM  worker shows "0 sparse matrices uploaded" while the brain
REM  limps on the server CPU master copy.
REM
REM  Uses a SEPARATE --user-data-dir so it launches its own
REM  Chrome process (honoring the flag) WITHOUT touching your
REM  main browser. Leave the window open to keep donating.
REM ============================================================

set "URL=https://if-only-i-had-a-brain.git.unityailab.com/html/compute.html"
set "PROFILE=%TEMP%\unity-gpu"
set "FLAGS=--enable-unsafe-webgpu --enable-dawn-features=allow_unsafe_apis,disable_robustness --user-data-dir=%PROFILE%"

REM Locate chrome.exe across the usual install roots.
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not defined CHROME (
  echo Could not find chrome.exe in the usual locations.
  echo Edit this file and set CHROME= to your chrome.exe path.
  pause
  exit /b 1
)

echo Launching isolated GPU-donor Chrome...
echo   Chrome:  %CHROME%
echo   Profile: %PROFILE%
echo   URL:     %URL%
echo.
echo After it opens, the worker log should report a Max buffer
echo MUCH larger than 2048MB. Watch for "type4" SPRS frames and
echo the "sparse matrices uploaded" count climbing above 0.
echo.

start "" "%CHROME%" %FLAGS% "%URL%"
