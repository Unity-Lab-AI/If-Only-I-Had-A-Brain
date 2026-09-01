---
name: deploy
description: Deploy a Unity AI Lab project to the lab pages infra when pushing to main. Codifies the lab-wide deploy mechanism — Forgejo Actions SSH-rsync to the wildcard nginx pages host (*.git.unityailab.com, per-repo subdomain = lowercased repo name) using the existing org secrets PAGES_DEPLOY_KEY/HOST/USER. Handles BOTH project shapes: pure-static sites (rsync repo/dist → web root, nothing runs server-side) and stateful backends (persistent systemd service + nginx WSS reverse-proxy + Forgejo auth_request injecting X-UAL-User for the admin route, public route compute/read-only). Auto-sets-up in the moment from the project's .claude/project-config.json `deploy` block (interviews + writes the block on first run). MUST fire when a team member runs /deploy, when the post-push deploy-prompt hook nudges after a push to main, or when the user asks to "deploy", "ship it live", "set up the pages deploy", or "put this on the lab site".
---

# /deploy — Unity AI Lab pages deploy (static + stateful-backend)

> **This skill codifies the lab-wide deploy mechanism so every UAL project deploys the same proven way.** It is invoked two ways:
>   1. **Reactively** — the `post-tool-deploy-prompt` hook fires after a successful `git push` to `main` and nudges Claude to ASK the team member "deploy this live now?". If yes → run this protocol.
>   2. **Explicitly** — the team member runs `/deploy` (or asks to ship it live).
>
> It is **idempotent + in-the-moment**: it reads the project's `.claude/project-config.json` `deploy` block and sets everything up from there; if the block is missing it interviews the team member once, writes the block, then proceeds.

---

## THE LAB DEPLOY MECHANISM (canonical — learned from the lab pages setup)

The Unity AI Lab self-hosts on **Forgejo at `git.unityailab.com`**. Pages deploy works like this:

- **Front = nginx.** A wildcard cert + wildcard vhost already match `*.git.unityailab.com`. A repo deployed to web-root `~/<repo>/` is served live at `https://<repo-lowercased>.git.unityailab.com` automatically — no per-repo vhost needed.
- **Deploy = Forgejo Actions → SSH rsync.** A `.forgejo/workflows/deploy.yml` triggers on push to `main` (+ `workflow_dispatch`), and rsyncs the built site over SSH to the pages web root.
- **Secrets already exist at the org/repo level** (do NOT regenerate — reuse):
  - `PAGES_DEPLOY_KEY` — base64-encoded SSH private key
  - `PAGES_DEPLOY_HOST` — the pages box host
  - `PAGES_DEPLOY_USER` — the deploy user
- Reference precedents: `UnityAILab/Website` (`build.yml` "Deploy to nginx") + the static game deploy at `weird.git.unityailab.com`.

There are **two project shapes**, and the deploy differs:

### Shape A — PURE STATIC (no server-side process)
Vanilla HTML/JS/CSS or a build that emits a static `dist/`. Nothing runs on the server — any backend (Ollama, etc.) runs on the visitor's own machine, or there is no backend. **This is the simple, fully-codified path.** rsync the site to the web root; nginx serves it. Done.

### Shape B — STATEFUL BACKEND (a persistent server process)
A central always-on Node/Python service that holds state (DB, weights, sessions) and the static frontend talks to it over **WSS**. The pages mechanism alone is NOT enough — it only serves static files. Shape B additionally needs (server/DevOps work, loop in **Red**):
1. the backend running as a **persistent systemd service** on a lab box,
2. an **nginx vhost reverse-proxying WSS** → `127.0.0.1:<port>` (with `Upgrade`/`Connection` headers),
3. **Forgejo auth on the admin route** via `auth_request` / `oauth2-proxy` that injects a trusted identity header (`X-UAL-User`) AFTER authenticating against Forgejo, and **strips any client-supplied copy on every route**. The backend trusts that header only on the loopback hop (from the proxy) and treats it as admin; the public/donor route carries no header and is compute/read-only.

> Shape B is greenfield in the lab — there is no copy-paste vhost yet. This skill GENERATES the systemd unit + nginx vhost + auth_request stanza as files for Red to review/install; it does NOT silently mutate a production box.

---

## ACTIVATION PROTOCOL

### 0. Confirm intent + git state
- If invoked by the hook nudge: ASK the team member plainly — *"You just pushed to `main`. Deploy `<repo>` live to `https://<repo-lowercased>.git.unityailab.com` now?"* Proceed only on yes.
- Confirm the current branch is `main` (the deploy trigger) or that the team member wants `workflow_dispatch`.
- Confirm the repo's remote is on `git.unityailab.com` (lab Forgejo). If not, STOP — this skill is lab-pages-specific.

### 1. Load (or build) the deploy config
Read `.claude/project-config.json`. If a `deploy` block exists, use it. Otherwise **interview once** (capture answers VERBATIM per LAW #0) and write the block:

```jsonc
"deploy": {
  "enabled": true,
  "shape": "static",                 // "static" | "backend"
  "subdomain": "<repo-lowercased>",  // <subdomain>.git.unityailab.com
  "build": "",                       // "" for pure-static; else e.g. "npm ci && npm run build"
  "publishDir": ".",                 // "." for repo-root static; else "dist"/"public"/"_site"/"build"
  "excludes": [".git", ".forgejo", ".gitea", "docs", "*.md"],
  "backend": {                       // present only when shape == "backend"
    "service": "<repo>-server",      // systemd unit name
    "entry": "server/brain-server.js",
    "port": 0,                       // localhost port the proxy forwards to
    "wssPath": "/ws",                // path nginx upgrades to WSS
    "auth": "forgejo-proxy",         // admin route via Forgejo auth_request → X-UAL-User
    "adminHeader": "X-UAL-User",
    "host": ""                       // which lab box runs the persistent service (ask Red)
  }
}
```

Interview questions (only the ones not already answered):
1. **Shape** — pure static, or a persistent backend?
2. **Build** — pure static (no build), or a build command + publish dir?
3. **Subdomain** — default `<repo-lowercased>`; override?
4. (backend only) **Which lab box** runs the always-on service, and what **port**? (defer to Red if unknown — write `host: ""` and flag it.)

### 2. Generate the deploy workflow (both shapes)
Write `.forgejo/workflows/deploy.yml` from the canonical template below, substituting `build`/`publishDir`/`excludes` from the config. This is the STATIC-frontend deploy and is sufficient on its own for Shape A.

### 3. (Shape B only) Generate the backend infra files for Red
Write, into a `deploy/` dir at repo root (NOT auto-applied to any box):
- `deploy/<service>.service` — the systemd unit (runs the entry under the deploy user, `Restart=always`, env incl. `UAL_PROXY_AUTH=1` + `BRAIN_BIND=127.0.0.1`).
- `deploy/nginx-<subdomain>.conf` — the vhost: static root for the frontend + a `location <wssPath>` that `proxy_pass` to `127.0.0.1:<port>` with `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`, an `auth_request` admin location that authenticates against Forgejo and sets `X-UAL-User`, and **`proxy_set_header X-UAL-User ""` on the public route** (strip client spoofing).
- `deploy/README.md` — hand-off notes for Red (what to install where, which box, the secrets).

### 4. Commit + push (docs-before-push LAW)
Stage the generated files + any doc updates in ONE atomic commit on the current feature/work branch. The `pre-tool-public-repo-guard` hook already protects `.claude/` — respect it. Do NOT push `.claude/` to a non-lab/non-private remote.

### 5. Trigger + verify
- Push to `main` triggers the workflow; or run it via `workflow_dispatch`.
- Surface the Forgejo Actions run status. On success, confirm the live URL `https://<subdomain>.git.unityailab.com` responds.
- (Shape B) remind that the systemd unit + nginx vhost must be installed on the box by Red before the WSS backend answers — generating the files ≠ them being live.

---

## CANONICAL deploy.yml TEMPLATE

```yaml
# <PROJECT> — pages auto-deploy. Mirrors the lab-wide pages mechanism
# (UnityAILab/Website build.yml "Deploy to nginx"): every push to main rsyncs
# the static site over SSH to the pages web root, served live at
# https://<subdomain>.git.unityailab.com (wildcard cert + wildcard nginx vhost).
# Requires org/repo Actions secrets: PAGES_DEPLOY_KEY (base64 SSH key) ·
# PAGES_DEPLOY_HOST · PAGES_DEPLOY_USER.
name: deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # PURE STATIC: omit this step (publishDir = repo root).
      # WITH BUILD: uncomment + set the real build command.
      # - name: Build
      #   run: |
      #     npm ci
      #     npm run build

      - name: Deploy to the pages web root (SSH rsync)
        env:
          KEY: ${{ secrets.PAGES_DEPLOY_KEY }}
          HOST: ${{ secrets.PAGES_DEPLOY_HOST }}
          USER: ${{ secrets.PAGES_DEPLOY_USER }}
        run: |
          mkdir -p ~/.ssh && chmod 700 ~/.ssh
          printf '%s' "$KEY" | base64 -d > ~/.ssh/deploy && chmod 600 ~/.ssh/deploy
          REPO="$(echo "${{ github.event.repository.name }}" | tr 'A-Z' 'a-z')"
          # publishDir: "." for pure-static repo root, or "dist"/"public"/etc.
          rsync -az --delete \
            --exclude='.git' --exclude='.forgejo' --exclude='.gitea' \
            --exclude='docs' --exclude='*.md' \
            -e "ssh -i ~/.ssh/deploy -o StrictHostKeyChecking=accept-new" \
            ./ "${USER}@${HOST}:${REPO}/"
```

---

## NOTES
- **Reuse the org secrets — never regenerate** `PAGES_DEPLOY_KEY/HOST/USER`.
- **Subdomain = lowercased repo name** (hostnames are case-insensitive); rename the repo if a cleaner subdomain is wanted.
- **Static is the simple, fully-codified path.** Backend (Shape B) generates files for Red and is not silently applied to production.
- The deploy-prompt is a *nudge*, never automatic — a team member always confirms before anything ships.
- LAW #0: capture interview answers verbatim into the `deploy` config + any workflow doc.
