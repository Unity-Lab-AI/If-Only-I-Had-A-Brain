# Unity brain — pre-alpha deploy hand-off (PA.4.7)

> Operator deploy steps. These artifacts make the deploy a near-one-command
> install. Nothing here has been applied to any box — they're config files to
> review + install.

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
   redeploy is MANUAL** (the pages key is rrsync-locked to `/var/www/pages`):
   `cd $BACKEND_DIR && git pull && (cd server && npm ci --omit=dev) && sudo systemctl restart unity-brain`.

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
