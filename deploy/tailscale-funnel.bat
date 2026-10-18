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

setlocal
set "BRAIN=http://127.0.0.1:7525"

where tailscale >nul 2>&1
if errorlevel 1 (
    echo   [funnel] tailscale is not on PATH. Install it first:
    echo            https://tailscale.com/download
    exit /b 1
)

echo [funnel] applying the four public read lanes -^> %BRAIN%
REM --bg: persist in the background (survives this window and reboots).
REM --https=443: Funnel only permits 443, 8443 and 10000; 443 keeps the URL clean.
REM Each --set-path maps ONE public path prefix to the same path on the brain.
tailscale serve --bg --https=443 --set-path=/public-state.json %BRAIN%/public-state.json
tailscale serve --bg --https=443 --set-path=/minds-eye.json    %BRAIN%/minds-eye.json
tailscale serve --bg --https=443 --set-path=/health            %BRAIN%/health
REM /ws is the PUBLIC WebSocket lane -- chat AND the donor lane, since the donor
REM dials wss://host/ws (donor-app/src/config.rs:4). Serve proxies the HTTP
REM Upgrade; no extra flag needed.
REM !! The brain's WebSocketServer has NO path option (brain-server.js:12746,
REM    `{ server: httpServer, ... }`) -- it accepts an Upgrade on ANY path. So
REM    the "/ws only" restriction is enforced HERE, by what Funnel forwards,
REM    and not by the brain. That is the whole reason this route list is the
REM    security control and not a convenience: remove a line and nothing
REM    downstream catches it.
tailscale serve --bg --https=443 --set-path=/ws                %BRAIN%/ws
REM /image/ serves pictures she ALREADY MADE from a bounded cache (chat lane).
REM A miss is a 404, never a render: nothing a visitor sends through this path
REM can reach the image engine on :5124, which stays loopback-only. Read-only,
REM so it belongs with the other three. Prefix-safe: no other brain route
REM begins with /image (checked 2026-10-18).
tailscale serve --bg --https=443 --set-path=/image             %BRAIN%/image

echo [funnel] opening port 443 to the public internet (Funnel)...
tailscale funnel --bg 443
if errorlevel 1 (
    echo   [funnel] FAILED. The usual cause is Funnel not enabled in your tailnet
    echo            policy -- see ONE-TIME SETUP step 2 above.
    exit /b 1
)

echo.
echo [funnel] current serve + funnel configuration:
tailscale serve status
echo.
echo [funnel] your public brain origin is the https://...ts.net line above.
echo          Put it in js/brain-origin.js  BRAIN_ORIGIN  and push.
echo          THEN run the VERIFY block in this file's header -- all six lines.
endlocal
