---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
# ⛔ This page went stale once in the most dangerous way: it documented six
# endpoints with NO MENTION of the WIPE interlock, so the next operator would hit
# the refusal and assume a bug. Its sources are the files that decide what those
# endpoints actually do.
status: draft
sources:
  - server/brain-ctl.js
  - deploy/unity-brain-ctl.service
  - deploy/brain-ctl-helper.sh
  - deploy/sudoers.d/unity-brain-ctl
verified-scope: |
  CHECKED 2026-08-27 (DOCPROV.4) — the endpoint enumeration HOLDS, EXACTLY.
  The only moved source is server/brain-ctl.js, and the endpoint list is this
  page's load-bearing claim, so it was diffed against the code's own dispatch:
    - POST table (brain-ctl.js:937-945) serves 8: /start /stop /restart /kick
      /reset /savererun /update /update-savestart
    - GET routes serve 3: /health (also /), /status, /logs
    - Total 11 served verbs — matching the 11 documented here, with no
      omissions and no extras.
  ⚠ TWO FALSE POSITIVES OF MINE, caught before writing them down. A string
  grep for "'/<verb>'" in brain-ctl.js reported two undocumented endpoints:
    · '/shutdown' — an OUTBOUND call brain-ctl makes TO the brain, not a verb
      it serves.
    · '/c' — literally `cmd.exe /c`, a Windows shell flag (:133), not an
      endpoint at all.
  ⛔ String presence in a file is not the same as a served route. The dispatch
  TABLE is the source of truth, and that distinction is the whole finding.
  NOT CHECKED — do not read this page as authority on:
    - the WIPE INTERLOCK behaviour. The refusal path is documented here and was
      NOT exercised — the page's own rule is "never probe the wiping verbs
      against a live box to watch them refuse", and that rule was honoured.
    - the systemd unit, the helper script or the sudoers rule. All three are
      listed sources, NONE of them moved, and none were read this pass.
    - the "needs the brain up?" column per endpoint.
    - the bootstrap-backend / bootstrap-deployed narratives.
last-verified: "074aa591 2026-08-27"
---

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

---

## 🎛 BRAIN CONTROL PLANE (`unity-brain-ctl`) — start/stop/restart from the web, no shell

**The problem it removes.** Every power control used to live *inside* `brain-server.js`
(`/shutdown`, `/restart`, `/savererun`, `/update`). A control plane hosted by the thing it
controls has one unavoidable dead zone: **a stopped brain cannot serve its own start button.**
On 2026-08-25 a mis-click halted the brain and the box sat at 502 until someone with SSH ran
one command. `unity-brain-ctl` is a separate, tiny, always-up service that holds those
controls instead — including **`start`**, the one verb the brain could never offer for itself.

### Components

| file | installs to | role |
|---|---|---|
| `server/brain-ctl.js` | runs from `/opt/unity-brain` | the service. Zero deps, node builtins only, never imports brain code. |
| `deploy/unity-brain-ctl.service` | `/etc/systemd/system/` | always-up unit. `Restart=always`, `StartLimitIntervalSec=0`, 256M cap. |
| `deploy/brain-ctl-helper.sh` | `/usr/local/sbin/brain-ctl-helper` | the ONLY root-capable surface. Closed verb set, hardcoded unit name. |
| `deploy/sudoers.d/unity-brain-ctl` | `/etc/sudoers.d/unity-brain-ctl` | narrow NOPASSWD for that one helper path. |
| `deploy/nginx-unity-brain-ctl.conf` | `/etc/nginx/snippets/` | `/ctl/` admin lane + brain-offline JSON fallbacks. |

### Install (one time, ~2 minutes, brain keeps running throughout)

```bash
cd /opt/unity-brain

# 1. privileged helper + its narrow sudoers rule
sudo install -o root -g root -m 755 deploy/brain-ctl-helper.sh /usr/local/sbin/brain-ctl-helper
sudo install -o root -g root -m 440 deploy/sudoers.d/unity-brain-ctl /etc/sudoers.d/unity-brain-ctl
sudo visudo -cf /etc/sudoers.d/unity-brain-ctl     # MUST print "parsed OK" — a bad
                                                    # sudoers file can lock out sudo

# 2. the service
sudo cp deploy/unity-brain-ctl.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now unity-brain-ctl
curl -s http://127.0.0.1:7526/ctl/status | head -20      # expect phase/brainOnline

# 3. nginx lanes (validate BEFORE reloading — a broken config would take the
#    static site down too, which is the opposite of the goal)
sudo install -o root -g root -m 644 deploy/nginx-unity-brain-ctl.conf \
     /etc/nginx/snippets/unity-brain-ctl.conf
# then, INSIDE the brain vhost's server{} block, add:
#     include snippets/unity-brain-ctl.conf;
# and DELETE the vhost's now-duplicated `location = /public-state.json` and
# `location = /minds-eye.json` blocks — the snippet supersedes them with
# offline-tolerant versions. Duplicate locations make `nginx -t` fail.
sudo nginx -t && sudo systemctl reload nginx
```

### Verify the whole point

```bash
# from a machine with shell:
curl -s http://127.0.0.1:7526/ctl/status | grep -E 'phase|human'
# stop the brain THROUGH the control plane, confirm the site survives:
curl -s -X POST http://127.0.0.1:7526/ctl/stop
curl -s -o /dev/null -w 'site:%{http_code}\n' https://unityailab.com/          # want 200
curl -s https://unityailab.com/public-state.json | head -c 200                 # want brainOffline:true
# then bring it back the way Gee would — from the dashboard, or:
curl -s -X POST http://127.0.0.1:7526/ctl/start
```

### What the operator sees

The dashboard grows a **Brain Power** panel (top of page) fed by `/ctl/status`, showing one of
six honest phases and offering only the actions that make sense for each:

| phase | meaning | offered |
|---|---|---|
| `online` | serving | Restart, Stop, Force Restart |
| `booting` | process up, port not bound yet (loading ~5.4 GB — normal for minutes) | Restart, Stop, Force Restart |
| `halted` | deliberately stopped (exit 42); systemd will NOT revive it | **Start** |
| `offline` | not running | **Start** |
| `failed` | crashed / OOM-killed | **Start**, Restart |
| `unmanaged` | something serves :7525 but the unit is inactive (hand-started) | Force Restart |

`booting` vs `online` is a real distinction the old UI could not make: the brain binds its port
only *after* loading weights, so "systemd says active" and "actually serving" are different
facts, and conflating them is why a healthy boot used to look like a failure.

### All endpoints

| endpoint | what it does | needs the brain up? |
|---|---|---|
| `GET  /ctl/status` | phase + unit state + uptime. Never 502s. | no |
| `GET  /ctl/logs?n=N` | recent journal lines — readable exactly when the brain is down | no |
| `GET  /ctl/health` | liveness of ctl itself | no |
| `POST /ctl/start` | start a stopped brain, then reload the proxy. **The recovery verb.** | no |
| `POST /ctl/stop` | graceful halt (brain force-saves first) | no |
| `POST /ctl/restart` | savestart; escalates to a process restart if wedged | no |
| `POST /ctl/kick` | hard restart for a wedged brain (no graceful save) | no |
| `POST /ctl/update-savestart` | deploy latest code, **RESUME** training | no |
| `POST /ctl/update` | deploy latest code + **FRESH WALK (wipes weights)** | no |
| `POST /ctl/reset` | **wipe to a fresh brain** (identity-core preserved) | no |
| `POST /ctl/savererun` | keep weights, re-walk the curriculum on top | **YES** |

`savererun` is the one verb that genuinely cannot work with the brain down — it rewrites grade
pointers inside the *loaded* weights. It refuses and says to press Start first, and the dashboard
disables it in that phase with the reason in the tooltip.

### 🛑 The two WIPING verbs require an explicit token

`POST /ctl/update` (fresh-walk) and `POST /ctl/reset` **destroy all trained weights**. They
refuse unless the request carries the confirmation token:

```bash
# refused — this is deliberate
curl -s -X POST http://127.0.0.1:7526/ctl/reset
#  {"ok":false,"refused":true,"needsConfirm":"WIPE", ...}

# actually does it
curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"confirm":"WIPE"}' http://127.0.0.1:7526/ctl/reset
# ...or, for a shell: ?confirm=WIPE
```

**Why:** on 2026-08-26 a bare `POST /ctl/update` sent as a *probe* (expecting a "no deploy script
here" refusal) ran a real fresh-walk deploy and wiped the live brain. The dashboard already asked
for confirmation; the endpoint did not, so anything able to issue an HTTP request could wipe
months of training. See the INCIDENT entry in `REDEPLOY-NOTES.md`.

`/ctl/update-savestart` deliberately needs **no** token — friction on the safe path is what
pushes people toward the dangerous one. In the dashboard, both wiping buttons make you *type*
`WIPE`.

**⚠ Never probe the wiping verbs against a live box to watch them refuse.** Assert that in the
harness (`scripts/test-brain-ctl.mjs` covers it); a box configured differently from your
assumption is exactly how this went wrong.

### Behaviour worth knowing

- **Stop is graceful first.** ctl asks the brain's own `/shutdown` so it force-saves weights and
  writes the resume marker, waits for the port to close, and only then issues `systemctl stop`.
  If the brain never answered, the response says so — training since the last checkpoint may be lost.
- **Start reloads the proxy afterwards.** Once the brain binds its port, ctl runs
  `nginx -t && systemctl reload nginx` so the upstream lanes are re-established cleanly and no
  stale 502 lingers. It is a **reload, not a restart** — the static site never goes down.
  A reload failure is reported but does not mask a successful start.
- **One action at a time.** Concurrent power actions return `409`. Two overlapping start/stop
  cycles against a process mid-weight-save is how checkpoints get corrupted.
- **The site never depends on it.** `/public-state.json` and `/minds-eye.json` degrade to a 200
  JSON body carrying `brainOffline: true` and a human sentence, so the frontend says
  "brain offline" instead of parse-erroring on a 502 HTML page (or, on the lab vhost,
  SPA-swallowing the request and parsing `index.html` as JSON).

### Security shape

`brain-ctl` binds **loopback only**; all external access is through nginx's Basic-auth `/ctl/`
lane, exactly like `/admin/`. Privilege is exercised only via `execFile` (no shell) against a
**hardcoded allowlist** of argv, and the root helper *independently* re-validates and hardcodes
the unit name — so neither a bug in the service nor a leaky sudoers wildcard can retarget
`systemctl` at Forgejo or sshd on this shared box.

### Re-verify it on a REAL box (the acceptance check)

```bash
bash deploy/verify-ctlplane.sh              # full cycle — STOPS AND STARTS THE BRAIN
bash deploy/verify-ctlplane.sh --read-only  # no state change; auth + interlock only
```

24 checks. It proves the three promises by actually causing an outage: the site
stays up (4 paths), the public lanes report `brainOffline:true` instead of 502,
and the brain starts again with the proxy reloaded — then asserts training
**resumed** and that no `FORCE-FRESH` fired.

Safe by construction: graceful stop (weights force-saved + resume marker), it
**never** touches `/ctl/update` or `/ctl/reset`, and an `EXIT` trap starts the
brain again even if a check fails midway. Expect 2-4 minutes, mostly the brain
reloading ~5.4 GB.

### Tests

```bash
node scripts/test-brain-ctl.mjs          # 52 — HTTP contract, graceful-stop ordering,
                                         #      409 concurrency, helper refusals, and the
                                         #      WIPE-token interlock (incl. that a WRONG
                                         #      token is not accepted)
node scripts/test-brain-power-ui.mjs     # 22 — real Chromium: Start works with the brain
                                         #      DOWN; savererun correctly disabled when down
node scripts/test-brain-offline-pages.mjs # 10 — visitor pages (index / compute / minds-eye)
                                         #      say "brain offline", against the exact body
                                         #      nginx returns
```

Both run against a mock brain and a mock helper, so they are safe on any machine and touch no
real systemd unit.
