@echo off
REM tailscale-funnel.bat -- the PUBLIC route to the brain on this PC, via
REM Tailscale Funnel. The chosen path (operator, 2026-10-18: "yeah if you think
REM thats best or something else, sure") after the lab's domain went away.
REM
REM ---- WHY FUNNEL, AND NOT A CLOUDFLARE TUNNEL ------------------------------
REM A NAMED Cloudflare tunnel needs a DNS zone inside a Cloudflare account, and
REM the lab no longer has a domain (unityailab.com is a dead site; Forgejo is
REM moving). Funnel gives a STABLE hostname with no domain at all:
REM
REM     https://<machine>.<tailnet>.ts.net
REM
REM free, TLS issued and renewed for you, no router ports opened, home IP never
REM published. The same Tailscale install also gives a PRIVATE route to the
REM admin lane from your own devices, which is the clean answer to the
REM requireLoopback problem described below. deploy/cloudflared-unity-brain.yml
REM is kept for the day a domain exists; the route list is identical.
REM
REM ---- THE SHAPE -----------------------------------------------------------
REM     GitHub Pages (public site)
REM           |  https:// + wss://
REM           v
REM     <machine>.<tailnet>.ts.net     <- Tailscale edge, TLS terminated here
REM           |  outbound-only, NO open ports
REM           v
REM     127.0.0.1:7525                 <- the brain, still loopback-only
REM
REM The brain NEVER stops being loopback-only. tailscaled is the single process
REM allowed to address it. That is strictly safer than binding 0.0.0.0.
REM
REM ---- !! THE ROUTE LIST IS THE SECURITY CONTROL. READ BEFORE EDITING. -----
REM Tailscale Serve answers ONLY the paths configured below; anything else is a
REM 404 from tailscaled itself, so this is DEFAULT-DENY by construction. The
REM four paths are exactly the public read lanes the old nginx vhost forwarded
REM without auth (deploy/nginx-unity-brain.conf) plus /health, which the client
REM depends on and which nginx had never forwarded.
REM
REM !! PATH MATCHING IS PREFIX-BASED HERE, NOT ANCHORED REGEX. --set-path=/ws
REM    would also match /ws-anything. Checked 2026-10-18 against every route in
REM    server/brain-server.js: nothing sensitive shares a prefix with
REM    /health, /minds-eye.json, /public-state.json or /ws. If you ever add a
REM    brain route that starts with one of those four strings, re-check this.
REM
REM !! THE ADMIN LANE IS DELIBERATELY ABSENT. requireLoopback decides from
REM    req.socket.remoteAddress, and tailscaled forwards from 127.0.0.1 -- so
REM    every Funnel request would PASS the loopback test. nginx Basic auth used
REM    to supply the identity header; nothing does now. Exposed as-is,
REM    POST /reset (wipes every trained weight) would be a public URL.
REM    Reach the admin lane PRIVATELY instead: from any device on your tailnet,
REM    http://<machine>:7525/dashboard.html -- Tailscale's own ACL is the gate
REM    and the public internet never sees it. Do NOT add admin paths below.
REM
REM ---- ONE-TIME SETUP ------------------------------------------------------
REM   1. Install Tailscale on this PC and sign in:   https://tailscale.com/download
REM   2. Enable Funnel for your tailnet ONCE in the admin console:
REM        https://login.tailscale.com/admin/acls  -> add to the policy:
REM        "nodeAttrs": [{ "target": ["autogroup:member"], "attr": ["funnel"] }]
REM   3. Run this file. It is idempotent -- re-running re-applies the same four
REM      routes and changes nothing else. Serve config PERSISTS across reboots.
REM   4. Copy the hostname it prints into js/brain-origin.js  BRAIN_ORIGIN,
REM      commit, push -- Pages redeploys and the site starts reaching her.
REM
REM ---- VERIFY -- AND DO NOT SKIP THE REFUSALS ------------------------------
REM   set H=https://<machine>.<tailnet>.ts.net
REM   curl -s -o NUL -w "%%{http_code}\n" %H%/public-state.json      want 200
REM   curl -s -o NUL -w "%%{http_code}\n" %H%/minds-eye.json         want 200
REM   curl -s -o NUL -w "%%{http_code}\n" %H%/health                 want 200
REM   curl -s -o NUL -w "%%{http_code}\n" %H%/admin/status           want 404
REM   curl -s -o NUL -w "%%{http_code}\n" -X POST %H%/reset          want 404
REM   curl -s -o NUL -w "%%{http_code}\n" %H%/ctl/status             want 404
REM A 200 from any of the last three means this file is not doing its job:
REM run `tailscale funnel reset` BEFORE investigating.

setlocal EnableDelayedExpansion
set "BRAIN=http://127.0.0.1:7525"

REM Double-clicked from Explorer, the window closes the instant this script
REM exits -- which is how "it just opens then closes" happens on a machine
REM without Tailscale. Detect that launch (cmd was started with /c for this
REM file) and hold the window at every exit so the message is readable.
REM !! A pure string test, no pipe: the usual `echo %cmdcmdline% | find` idiom
REM    HUNG in `find` when this file was started from a non-console shell
REM    (measured 2026-10-18 -- two runs parked on find.exe, nothing printed).
REM    Delayed expansion keeps the quotes inside %cmdcmdline% from breaking
REM    the comparison.
set "HOLD="
set "CL=!cmdcmdline!"
if not "!CL:/c=!"=="!CL!" set "HOLD=1"

REM The installer puts tailscale.exe under Program Files and does not always
REM refresh PATH for an already-open shell, so look there before giving up.
set "TS=tailscale"
where tailscale >nul 2>&1
if errorlevel 1 (
    if exist "%ProgramFiles%\Tailscale\tailscale.exe" (
        set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
    ) else (
        call :install || goto :fail
        set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
    )
)

REM Signed in? `tailscale status` exits non-zero while logged out or stopped.
REM `tailscale up` opens the browser sign-in and blocks until it completes.
"%TS%" status >nul 2>&1
if errorlevel 1 (
    echo [funnel] this PC is not signed in to a tailnet yet -- opening the sign-in...
    echo          Finish it in the browser window; this script continues on its own.
    "%TS%" up
    if errorlevel 1 (
        echo   [funnel] sign-in did not complete.
        goto :fail
    )
)

echo [funnel] applying the five public read lanes -^> %BRAIN%
REM --bg: persist in the background (survives this window and reboots).
REM --https=443: Funnel only permits 443, 8443 and 10000; 443 keeps the URL clean.
REM Each --set-path maps ONE public path prefix to the same path on the brain.
REM !! `funnel` (not `serve`) PER PATH. `tailscale funnel --bg --set-path=/x T`
REM    both registers the handler AND turns Funnel on for port 443, with no
REM    other route. The earlier form - five `serve` lines and then a bare
REM    `tailscale funnel --bg 443` - looked right and was the whole bug: a bare
REM    port argument means "expose LOCAL PORT 443 at /", so every run of this
REM    script silently added `/ -> 127.0.0.1:443` and made the allowlist
REM    default-allow (proved 2026-10-18 by stripping `/`, running each command
REM    alone, and counting; only that one recreated it).
"%TS%" funnel --bg --https=443 --set-path=/public-state.json %BRAIN%/public-state.json
"%TS%" funnel --bg --https=443 --set-path=/minds-eye.json    %BRAIN%/minds-eye.json
"%TS%" funnel --bg --https=443 --set-path=/health            %BRAIN%/health
REM /ws is the PUBLIC WebSocket lane -- chat AND the donor lane, since the donor
REM dials wss://host/ws (donor-app/src/config.rs:4). Serve proxies the HTTP
REM Upgrade; no extra flag needed.
REM !! The brain's WebSocketServer has NO path option (brain-server.js:12746,
REM    `{ server: httpServer, ... }`) -- it accepts an Upgrade on ANY path. So
REM    the "/ws only" restriction is enforced HERE, by what Funnel forwards,
REM    and not by the brain. That is the whole reason this route list is the
REM    security control and not a convenience: remove a line and nothing
REM    downstream catches it.
"%TS%" funnel --bg --https=443 --set-path=/ws                %BRAIN%/ws
REM /image/ serves pictures she ALREADY MADE from a bounded cache (chat lane).
REM A miss is a 404, never a render: nothing a visitor sends through this path
REM can reach the image engine on :5124, which stays loopback-only. Read-only,
REM so it belongs with the other three. Prefix-safe: no other brain route
REM begins with /image (checked 2026-10-18).
"%TS%" funnel --bg --https=443 --set-path=/image             %BRAIN%/image
if errorlevel 1 (
    echo   [funnel] FAILED. The usual cause is Funnel not enabled in your tailnet
    echo            policy -- see ONE-TIME SETUP step 2 above. Open
    echo            https://login.tailscale.com/admin/acls and add the nodeAttrs line,
    echo            then run this file again.
    goto :fail
)
REM !! The CLI WAITS the first time: "Funnel is not enabled on your tailnet.
REM    To enable, visit: https://login.tailscale.com/f/funnel?node=..." Open
REM    that link, press Enable, and the command finishes by itself. (A brand-
REM    new tailnet asks the same for Serve, at /f/serve, on the first line.)

REM !! NO ROOT ROUTE, EVER. A `/` entry proxies EVERY path that no line above
REM    claims -- it turns this default-deny list into default-allow. The five
REM    per-path lines above create none; this strips one left behind by any
REM    older run of this file (see the note above the lanes). `off` on a path
REM    that is not configured is a no-op.
"%TS%" serve --https=443 --set-path=/ off >nul 2>&1

echo.
echo [funnel] current serve + funnel configuration:
"%TS%" serve status
echo.
echo [funnel] your public brain origin is the https://...ts.net line above.
echo          Put it in js/brain-origin.js  BRAIN_ORIGIN  and push.
echo          THEN run the VERIFY block in this file's header -- all six lines.
if defined HOLD pause
endlocal
exit /b 0

:fail
echo.
echo [funnel] stopped. Read the lines above; nothing was changed on the tailnet.
if defined HOLD pause
endlocal
exit /b 1

REM ---- :install -- fetch and run Tailscale's own MSI ----------------------------
REM Official package server, stable channel, 64-bit. /quiet /norestart: no wizard.
REM !! msiexec /quiet from a NON-ELEVATED process does not ask for elevation --
REM    it fails with 1603 and never shows a prompt (measured here 2026-10-18 on
REM    the first double-click). So the installer is launched through
REM    PowerShell Start-Process -Verb RunAs, which is what makes Windows show
REM    the ONE UAC prompt -- answer Yes. -Wait -PassThru hands the real exit
REM    code back. A verbose log lands beside the MSI and its tail is printed on
REM    any failure, so a second 1603 names its own cause instead of a guess.
REM Exit 0 = installed; 3010 = installed, reboot pending (fine -- tailscaled is
REM already running); 1602 = the prompt was cancelled; anything else is printed.
:install
set "MSI=%TEMP%\tailscale-setup-latest-amd64.msi"
set "MSILOG=%TEMP%\tailscale-install.log"
echo [funnel] tailscale is not installed. Fetching the official installer...
curl -fsSL -o "%MSI%" https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi
if errorlevel 1 (
    echo   [funnel] download failed. Install by hand: https://tailscale.com/download
    exit /b 1
)
echo [funnel] installing -- answer YES to the Windows prompt...
REM The exit code comes back through a file: a `for /f` over a command that
REM itself contains quotes is where cmd silently splits the line.
set "MSIRC=%TEMP%\tailscale-install.rc"
del /q "%MSIRC%" >nul 2>&1
powershell -NoProfile -Command "try { $p = Start-Process msiexec.exe -ArgumentList ('/i \"%MSI%\" /quiet /norestart /l*v \"%MSILOG%\"') -Verb RunAs -Wait -PassThru; Set-Content -Path '%MSIRC%' -Value $p.ExitCode } catch { Set-Content -Path '%MSIRC%' -Value 1602 }"
set "RC="
if exist "%MSIRC%" set /p RC=<"%MSIRC%"
if not defined RC set "RC=1602"
if "%RC%"=="0" goto :installed
if "%RC%"=="3010" goto :installed
echo   [funnel] installer exited %RC%. 1602 = the prompt was cancelled or never answered;
echo            any other code: the last lines of the installer log follow.
if exist "%MSILOG%" powershell -NoProfile -Command "Get-Content -Tail 12 '%MSILOG%'"
echo            Log: %MSILOG%    Install by hand: https://tailscale.com/download
exit /b 1
:installed
if not exist "%ProgramFiles%\Tailscale\tailscale.exe" (
    echo   [funnel] installer reported success but tailscale.exe is not where it should be.
    exit /b 1
)
echo [funnel] installed.
exit /b 0
