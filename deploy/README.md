# Unity brain — deploy hand-off (PA.4.7, amended 2026-08-20)

> ⚠ **THIS IS LIVE NOW. The line below said "Nothing here has been applied to any box" — that has been false for months.** The brain runs on the lab box and is driven **entirely from the dashboard buttons** (Update & Savestart / Update & Fresh Walk / Reset), with `deploy/self-update.sh` doing the git-archive overlay + `systemctl restart`. Treat everything below as a description of the installed system, not a proposal.
>
> **Two things about this directory you must know before touching a deploy:**
>
> 1. **`self-update.sh`'s `--delete` exclude list is load-bearing.** It overlays code with `rsync -a --delete`, so **anything the server writes under `__dirname` that is NOT on that list gets destroyed on every Update.** Six files were being wiped that way until 2026-08-20 — including `lang-geometry.json`, the language-cortex geometry pin, which is why the pin protections were dead on arrival and the vocabulary ceiling could silently re-derive on every deploy. **Rule: anything the server writes under `__dirname` belongs in that list, or a deploy eats it.**
> 2. **A `#` comment inside that command would break the deploy.** The `rsync` invocation is one backslash-continued command; a comment line inside it makes the shell comment out every remaining `--exclude` **plus the source and destination**. Comments go ABOVE the command — there is a NOTE FOR EDITORS in the file saying so. Verify any edit with `bash -n` and by checking the arg count.
>
> Operator deploy steps. These artifacts make the deploy a near-one-command
> install.

## ⛔ THREE FACTS THAT DECIDE WHETHER YOU CAN BELIEVE A DEPLOY

Read these before diagnosing anything. Each one has already cost real hours.

**1. The frontend and the backend deploy on DIFFERENT triggers, and the page can be current while the server is old.** `deploy.yml` rsyncs the **frontend** on every push to `main`. The node process **only restarts on a dashboard press.** So a freshly-deployed page can be talking to a server running code from many commits ago — a running server was found on `7ce77189` while `main` sat **15+ commits ahead**. ⚠ *"But I just pushed the fix"* is not evidence that the fix is running. Check what the server is actually on.

**2. An Actions-token push NEVER triggers another workflow.** This is a GitHub/Forgejo rule, not a bug, and it silently broke the donor release lane: `donor-release.yml` pushed a site-link bump using the Actions token and assumed that would fire `deploy.yml`. It never did. **The download page served the previous version for hours while the tag, the release, the assets and the pod's own `--version` were all correct and all agreed with each other** — a perfectly consistent set of green signals with the one user-visible surface stale. The release job now rsyncs the frontend itself. ⚠ Any workflow that depends on another workflow being triggered by its own push is already broken.

**3. Deploys happen through the DASHBOARD BUTTONS, not by hand.** Update & Savestart (keep weights) or the rare Update & Fresh Walk. No manual SSH, no nginx edits, no hand-patching the box. Fixes ship as code on `main` and land on a press. ⚠ **Redeploying is not free** — it kills the PRIMARY donor and costs a full matrix re-upload, so *"the donor needs fixing"* should be tested before it is acted on. Once, saying so plainly was the correct fix and a redeploy would have been pure loss.

## Topology

The brain is **NOT** a pure-static site. It's:

1. **Static frontend** — donor page (`compute.html`) + chat/dashboard UI. Served
   by nginx from the pages web root. Deployed by `.forgejo/workflows/deploy.yml`
   (push to `main` → SSH rsync, same mechanism as `weird.git.unityailab.com`).
2. **Persistent stateful backend** — `server/brain-server.js`, an always-on
   service holding the weights + memory and orchestrating the donated-GPU pool.
   Runs as systemd (`unity-brain.service`), binds `127.0.0.1`, reverse-proxied
   over WSS by nginx (`nginx-unity-brain.conf`).

Donors (remote browsers running `compute.html`) bring the GPUs and connect over
the **public** WS lane (compute-only). The **operator** connects over the **admin**
lane, which nginx gates with auth and stamps with a trusted `X-UAL-User` header —
that's how the operator is identified (first authed connection = locked master).
The brain validates/quarantines bad donor results and only honors compute-protocol
messages from registered pool donors.

> **Box reality (lab host):** `:443` is owned by an `ssl_preread` stream split, so
> the brain vhost listens on `127.0.0.1:8444 ssl proxy_protocol` (wildcard cert,
> `absolute_redirect off`) and is proxy-only — the static frontend stays on the
> existing wildcard-pages vhost. There is **no oauth2-proxy/Forgejo auth_request**
> on the box yet, so the admin lane is gated with **nginx HTTP Basic auth**
> (`$remote_user` → `X-UAL-User`); swap to Forgejo/oauth2-proxy later with zero
> backend change. Backend auto-redeploy is **not** possible via the pages-deploy
> key (rrsync-locked to `/var/www/pages`), so **backend redeploy is manual**.

## Install (operator)

0. **Prereqs on the host** — **Node 18+ installed on the HOST** (the runner's
   Docker node does not count; the systemd service runs on the host) + a C
   toolchain (`build-essential` + `python3`) in case `better-sqlite3` has no
   prebuilt binary for the host Node ABI.

0. **Donor pod command** — `deploy/runpod-donor-launcher.sh` is the container
   command a RunPod donor pod runs. ⛔ **It is not executed from this repo.**
   RunPod stores the command on the POD (`args`), and `args` is **not mutable
   via the API** — only name / image / disk / ports / env are. So this file is
   the source of truth to PASTE IN when a donor pod is created or recreated.
   It lives here so the next pod does not inherit the old flaws by copy-paste,
   which is exactly how the live pod ended up three releases behind
   (running v0.3.26 while v0.3.29 had been published for two days).
   Two things it fixes over the command currently on the live pod:
   **no stale pin** (an unreachable release API keeps the binary already on
   disk instead of silently downgrading to a hardcoded old version) and an
   **upgrade watchdog** that re-checks every 5 min and restarts the donor by
   PID, so a new release is picked up in steady state and not only after a
   disconnect. ⚠ Kill by PID, never `pkill -f unity-donor` — the supervisor's
   own command line contains that string and would kill itself.

1. **Backend service** — `deploy/bootstrap-backend.sh` does steps 1–6 (service
   user, code sync, `npm ci`, optional GloVe, unattended auto-advance seed,
   systemd unit, sudoers). It **prints** the nginx steps by default (does NOT
   auto-touch nginx — safe on the SNI-split box):
   ```bash
   sudo BACKEND_DIR=/opt/unity-brain SERVICE_USER=unity \
        DEPLOY_USER=<shell user that may restart the service> \
        DOMAIN=if-only-i-had-a-brain.git.unityailab.com \
        bash deploy/bootstrap-backend.sh
   ```
   The unit ships with `UAL_PROXY_AUTH=1`, `BRAIN_BIND=127.0.0.1`,
   `DREAM_NO_AUTO_GPU=1`, `DREAM_KEEP_STATE=1`, `Restart=always`.

2. **nginx (hand-graft — do NOT add a `:443` vhost on the lab host)** — using
   `deploy/nginx-unity-brain.conf` as the reference, add a
   `listen 127.0.0.1:8444 ssl proxy_protocol;` server for the subdomain (wildcard
   cert, `absolute_redirect off`) carrying ONLY the `/ws` (public donor) +
   `/admin/ws` + `/admin/` (Basic-auth) location blocks. Create the operator
   login: `sudo htpasswd -c /etc/nginx/unity-admin.htpasswd <operator>`. The
   vhost strips any client-supplied `X-UAL-User` (anti-spoof) and sets it to
   `$remote_user` on the authed admin lane. Static stays on the wildcard-pages vhost.

3. **Frontend** — already auto-deploys on push to `main` via the Forgejo Actions
   `deploy.yml` (existing org secrets `PAGES_DEPLOY_KEY/HOST/USER`). **Backend
   redeploy is MANUAL.** `$BACKEND_DIR` is rsync/bootstrap-deployed, NOT a git
   checkout (no `.git`), so don't `git pull` there — overlay a fresh tree from a
   clone, which preserves untracked runtime state (weights, identity-core,
   definition-cache, operator-identity):
   ```bash
   # from a clone of the repo on the box:
   git archive HEAD | sudo tar -x -C "$BACKEND_DIR"
   ( cd "$BACKEND_DIR/server" && sudo -u <SERVICE_USER> npm ci --omit=dev )
   # if deploy/unity-brain.service changed, re-install it + daemon-reload:
   sudo cp "$BACKEND_DIR/deploy/unity-brain.service" /etc/systemd/system/ && sudo systemctl daemon-reload
   sudo systemctl restart unity-brain
   ```

## Frontend WS wiring — DONE

`compute.html`, `dashboard.html`, `index.html`, and `remote-brain.js` already
derive the WS URL from the origin: local dev → `ws://localhost:7525`, deployed →
`wss://<host>/ws` (public donor) / `wss://<host>/admin/ws` (admin). No code
follow-on needed.

## Open decisions (operator)

- **Subdomain** — defaults to `if-only-i-had-a-brain.git.unityailab.com`
  (lowercased repo name). Rename the repo for a cleaner subdomain.
- **Chat policy** — admin-only (operator) vs public viewers may chat with Unity.
  `'text'` is currently ungated server-side pending this call (PA.4.6 note).
- **Scale** — Path A (replication + failover); brain size is community-compute
  milestone-gated (PA.4.8). Milestone VRAM thresholds are placeholders to tune
  against real donor hardware.

## Sanity checklist

- [ ] Node 18+ on the HOST; `better-sqlite3` installed (prebuilt or built)
- [ ] `unity-brain.service` running, `journalctl -u unity-brain -f` shows clean boot
- [ ] `:8444 proxy_protocol` vhost live (NOT a second `:443`); static still served by the pages vhost
- [ ] public `wss://<host>/ws` reaches the backend; a donor `html/compute.html` registers
- [ ] admin Basic-auth set (`htpasswd`); visiting `https://<host>/admin/milestone` prompts + returns 2xx
- [ ] admin `wss://<host>/admin/ws` carries `X-UAL-User=$remote_user` → operator gets `mode=admin` (first authed = master)
- [ ] client-supplied `X-UAL-User` is stripped (spoof attempt → viewer, not admin)
- [ ] frontend already deployed via Actions; backend redeploy is the manual `git pull && npm ci && systemctl restart`
