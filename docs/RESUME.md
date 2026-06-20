# RESUME — Session Pickup Brief

> **Updated:** 2026-06-20 (Opus 4.8 1M-context marathon). **Branch:** `feature/pre-alpha-full-k-phd-stack` — **PUSHED to `if-only` AND cascaded feature→develop→main** (no-push-until-PhD gate LIFTED for the pre-alpha; see [[feedback_no_push_until_phd_complete]] updated). Main push fires `.forgejo/workflows/deploy.yml`. Everything verified via `node --check` + real ESM `import()` + boot probes + the verification suite.
> **Read FIRST:** this file → the harness **TaskList** (DF.1–DF.7 + #32/#58) → memories ([[feedback_gee_sole_operator_no_red]], [[feedback_task_numbers_placement]], [[feedback_no_push_until_phd_complete]], [[feedback_content_boundary_minor_sexual_excluded]]).

---

## ⛔ THE PIVOT (2026-06-20) — NO LOCALHOST WALK. DEPLOYED-STATIC + DONOR-GPU IS THE PRODUCT.

Operator decision this session: **there is no localhost training walk.** The brain runs on the **DEPLOYED static site**; users (and the operator) connect like normal visitors; **their browser GPUs train the brain**; "it has to work" deployed. The operator's vision verbatim:

> *"staic page ><user connects to static> static brain builds training from users gpus all at same time for massive gpu compute"*

**Architecture (operator chose: backend on a host + browser donors):**
- The **Node `server/brain-server.js`** (the "backend" — holds the brain, runs the curriculum, coordinates donor GPUs, answers chat) runs **on the same server git lives on**, reached by an **nginx REVERSE-PROXY** (NOT a tunnel — same box, loopback `proxy_pass /ws` + `/admin/ws` → `127.0.0.1:7525`).
- **Donors' browser GPUs** are the compute muscle (the "massive" part — they connect via `compute.html` → `wss://<host>/ws`). The server box does NOT need a GPU.
- **Operator = master:** the admin lane (`/admin/ws`) is Forgejo-authenticated; the FIRST Forgejo-authed connection after deploy is bound as the locked **primary operator** (`server/operator-identity.json`, persisted). No racing the public (they can't auth).
- **Deploy URL:** `https://if-only-i-had-a-brain.git.unityailab.com` (subdomain = lowercased repo name; rename repo for a cleaner one).

**⚠ The operator is the SOLE operator/deployer** — Red/other founders have NOT worked on this project. Never defer to Red. ([[feedback_gee_sole_operator_no_red]])

---

## ✅ WHAT SHIPPED THIS SESSION (all on `feature/pre-alpha-full-k-phd-stack`, cascaded to main)

Commit trail: `32ad7a7` full-stack pre-alpha → `ebdd846` PA.4.2-4.6 → `b6e4b49` PA.4.8 gate → `ca20af3` capacity data-path → `9c8e56e` deploy artifacts → `dc1d0cc`+`4f3102c` name-scrubs → `2e100d7` PA.4.8 exec → `b6db91c` admin-UI WS → `0d1d0f6` first-authed-operator → `0bcc48c` deployed-walk-waits → `3ab7251` crash/resize state → `dd92ce6` operator-reframe → `15308a3` NOW banner → cascade (`develop 7c31409` / `main 10e7d25`) → `5068013` backend-deploy automation + dashboard WS fix → `0a8780f` DF TODO.

- **PA.1** new branch off the walk-ready stack; **PA.2/PA.3** cascade; **first cascade exact-tree**.
- **PA.4.2** admin gating on Forgejo `X-UAL-User` + **first-authed-operator binding** (locked master on static deploy).
- **PA.4.3** multi-donor GPU **pool** (primary + hot standby) · **PA.4.4** failover · **PA.4.5** result validation + "STD"-GPU quarantine · **PA.4.6** donor isolation (compute-protocol + SPRR pool-gated).
- **PA.4.7** deploy artifacts — `deploy/nginx-unity-brain.conf` (WSS reverse-proxy + Forgejo `auth_request`), `deploy/unity-brain.service` (systemd: `UAL_PROXY_AUTH=1`/`BRAIN_BIND=127.0.0.1`/`DREAM_NO_AUTO_GPU=1`/`DREAM_KEEP_STATE=1`), `deploy/bootstrap-backend.sh` (ONE-TIME root installer), `.forgejo/workflows/deploy.yml` (frontend + backend auto-deploy). Donor `compute.html`→`/ws`, admin UI/dashboard→`/admin/ws`. Deployed walk **waits patiently for a remote donor** (no 2-min abort / no CPU-fallback). **Crash-restart PRESERVES** the walk (`DREAM_KEEP_STATE=1`); **milestone resize CLEARS** weights (re-walk at new size).
- **PA.4.8** community-compute **milestone scaling** — donor VRAM reporting → tier gate → 5-min-stability resize+restart+retrain; deployed **bootstraps at 6M neurons** (fits one donor), local dev unchanged at full 357M.
- **WF.1** `/deploy` skill + push-to-main deploy-prompt hook in the **UAL-ClaudeWorkflow** template (branch `feature/deploy-on-push-to-main`, commit `3fbdb54` — promote to its develop/main when ready). **WF.2** ported into Dream `.claude/`.
- **Repo-wide operator-name scrub** — name out of ALL source/content/config (63 files + bundle); only in workflow docs + commits per LAW.
- **Pre-walk verification suite run:** dangling-imports clean · boot clean · word-emission lamination 100% · **emission QUALITY confirmed unverifiable headless** (no GPU tick → 0 sem-spikes — needs the real browser-GPU tick on the deployed page).
- **DF.1 (partial)** — fixed localhost WS in compute.html / remote-brain.js / dashboard.html SERVER_URL.

---

## 🚧 WHAT'S LEFT — the DEPLOY-FIX (DF) cluster (make it work flawlessly deployed)

Dependency chain: **DF.1 + DF.2 + DF.3 + DF.7 → DF.6 (e2e works) → #32 (walk runs deployed) → #58 (final test).**

- **DF.1** (sweep localhost:7525) — REMAINING: `index.html` WS_URL (`wss://<host>:7525`→`/admin/ws`) + `dashboard.html` admin HTTP fetches (`:7525/auto-advance|/shutdown|/milestone|/grade-advance` → same-origin). Then rebuild bundle.
- **DF.2** — deployment-aware connection-error banners (no start.bat/netstat on a live page).
- **DF.3** — BUILT (bootstrap + deploy.yml). REMAINING: nginx vhost must ALSO proxy the admin HTTP REST endpoints (`/auto-advance`, `/shutdown`, `/milestone`, `/grade-advance`, `/grade-signoff`, `/health`) to the backend (pairs with DF.1). **Operator one-time action: run `deploy/bootstrap-backend.sh` on the server.**
- **DF.4** — GloVe origin on deployed (embeddings.js `localhost:7525/corpora` ref).
- **DF.5** — admin-only console-log view on the deployed dashboard (watch boot+walk like the local Log Tail).
- **DF.7** — ⭐ **DISTRIBUTED PARALLEL multi-GPU compute** — THE headline + the hard part + NOT STARTED. The current pool uses **ONE primary donor at a time**; the vision needs **all connected donor GPUs computing simultaneously**. Needs an architecture decision: **data-parallel** (replicate brain per donor, merge Hebbian deltas) vs **model-parallel/sharding** (split brain across donors). Major build; supersedes single-primary as the compute model. **Without DF.7 the "all at same time / massive compute" vision is not met.**
- **DF.6** — end-to-end deployed smoke (the flawless-deployed gate) → **#32** walk → **#58** test.

---

## 🚀 OPERATOR'S NEXT STEPS (to bring her live)
1. **Run `deploy/bootstrap-backend.sh` ONCE** as root on the server (box details: `BACKEND_DIR`/`SERVICE_USER`/`DEPLOY_USER`/`DOMAIN`, Node 18+, the deploy SSH user). Installs systemd + nginx vhost + NOPASSWD sudo. After this, push-to-main = automatic frontend + backend.
2. Wire `location /_forgejo_auth` in the nginx vhost to the real Forgejo/oauth2-proxy auth.
3. Open the admin route **first** (logged into Forgejo) → bound as primary operator (master).
4. Open `compute.html` → your GPU donates → the 6M brain boots, waits, then walks K→PhD on your GPU.

---

## ⚠ LESSONS / GOTCHAS (this session)
1. **`git add -A` would leak `.claude/`** — the repo had NO blanket `.claude/` gitignore; added the Layer-0 block. Always exclude `.claude` when staging.
2. **Operator name BANNED in source/content/config** — only workflow docs + commits. Scrubbed repo-wide; don't reintroduce. ([[feedback_task_numbers_placement]])
3. **No localhost walk** — emission/quality is ONLY verifiable on the deployed page with a real browser GPU (headless = 0 sem-spikes).
4. **Backend ≠ git ≠ static page** — the Node brain-server is a process that must RUN on the server; nginx reverse-proxies the static page's WS to it. Not a tunnel.
5. **CRLF curriculum files** — use Python byte-preserving edits ([[feedback_crlf_curriculum_files_edit_tool]]); verify ESM with `import()` not just `node --check`.
6. **`server/brain-server/gpu.js`** holds the GPU dispatch + the donor pool + PA.4.8 milestone logic; `server/brain-server.js` holds the WS connection handler (mode/auth/pool/validation) + boot scaling.

## ⚠ Restart sequence
```bash
cd "C:\Users\gfour\Desktop\Dream" && claude    # Unity auto-activates via memory layer
# READ: docs/RESUME.md → TaskList (DF.1-DF.7) → the memories
node --input-type=module -e "import('./js/brain/curriculum.js').then(()=>console.log('OK')).catch(e=>console.log(e.message))"
node --check server/brain-server.js && node --check server/brain-server/gpu.js
# THEN: finish DF.1/DF.2/DF.4/DF.5 → decide DF.7 approach (data-parallel vs sharding) → build the massive-parallel engine.
```

---

*Unity AI Lab — the pre-alpha is built, hardened, name-clean, and cascaded to main. The deployed static page + donor-GPU model is the target; the reverse-proxied backend + the DF.7 parallel-compute engine are what make "users' GPUs training her all at once" real. The walk happens on the deployed page, not localhost.* 🖤
