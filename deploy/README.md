# Unity brain — pre-alpha deploy hand-off (PA.4.7)

> For **Red** (server/DevOps) when back from vacation. These artifacts make the
> deploy a near-one-command install. Nothing here has been applied to any box —
> they're config files to review + install.

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
the **public** WS lane (compute-only). **Gee** connects over the **admin** lane,
which nginx gates with **Forgejo `auth_request`** and stamps with a trusted
`X-UAL-User` header — that's how Gee is "master" without racing to connect
(PA.4.2). The brain validates/quarantines bad donor results (PA.4.5) and only
honors compute-protocol messages from registered pool donors (PA.4.6).

## Install (Red)

1. **Backend service**
   ```bash
   sudo cp deploy/unity-brain.service /etc/systemd/system/
   # edit User / WorkingDirectory / paths + (optional) NODE_OPTIONS heap
   sudo systemctl daemon-reload && sudo systemctl enable --now unity-brain
   journalctl -u unity-brain -f
   ```
   Ships with `UAL_PROXY_AUTH=1`, `BRAIN_BIND=127.0.0.1`, `DREAM_NO_AUTO_GPU=1`.

2. **nginx vhost** — merge `deploy/nginx-unity-brain.conf` into the wildcard
   `*.git.unityailab.com` setup. Wire `/_forgejo_auth` to the lab's Forgejo-backed
   auth (oauth2-proxy `/oauth2/auth` or a Forgejo session check) returning 2xx +
   `X-Forwarded-User` for authenticated lab members. The vhost already strips any
   client-supplied `X-UAL-User` (anti-spoof).

3. **Frontend** — the Forgejo Actions `deploy.yml` deploys it on push to `main`
   using the existing org secrets `PAGES_DEPLOY_KEY` / `PAGES_DEPLOY_HOST` /
   `PAGES_DEPLOY_USER`. No new secrets.

## ⚠ Required frontend wiring (code follow-on, flagged)

`compute.html` currently hardcodes `ws://localhost:7525` (local dev). For the
deployed donor page it must connect to the **public** lane
`wss://<subdomain>.git.unityailab.com/ws`, and the admin UI to `/admin/ws`.
This is a small frontend change (derive the WS URL from `window.location` when
not on localhost) — tracked as a PA.4.7 code follow-on; can land before the
frontend deploy.

## Open decisions (Gee)

- **Subdomain** — defaults to `if-only-i-had-a-brain.git.unityailab.com`
  (lowercased repo name). Rename the repo for a cleaner subdomain.
- **Chat policy** — admin-only (Gee) vs public viewers may chat with Unity.
  `'text'` is currently ungated server-side pending this call (PA.4.6 note).
- **Scale** — Path A (replication + failover); brain size is community-compute
  milestone-gated (PA.4.8). Milestone VRAM thresholds are placeholders to tune
  against real donor hardware.

## Sanity checklist

- [ ] `unity-brain.service` running, `journalctl` shows clean boot
- [ ] nginx vhost live, `/_forgejo_auth` returns 2xx for a logged-in lab member
- [ ] public `wss://.../ws` reaches the backend; a donor `compute.html` registers
- [ ] admin `wss://.../admin/ws` carries `X-UAL-User` → Gee gets `mode=admin`
- [ ] client-supplied `X-UAL-User` is stripped (spoof attempt → viewer, not admin)
- [ ] frontend deployed via Actions; donor page connects to the public lane
