# RESUME — Session Pickup Brief

> **Updated:** 2026-06-22 (Opus 4.8 1M-context marathon — basin-collapse hardening + per-grade gate + Update button + real course names + public dashboard + donor leaderboard). **ALL WORK COMMITTED + PUSHED → `if-only/feature/bc-basin-collapse-and-ops` (`cfcb81c`)** — 22 files, `.claude/` IP excluded. Local was synced to `if-only/main` (`99c5358`, carries the #112.9 student-battery timeout fix) before branching.
> **Read FIRST:** this file → `docs/FINALIZED.md` (2026-06-21/22 BC + feature entries) → `docs/ISSUE-basin-collapse-fix.md` → `deploy/REDEPLOY-NOTES.md` (keep-weights redeploy + `/update` self-update + `/public-state.json` ops) → memories ([[feedback_typeof_no_shield_const_tdz]], [[project_df7_data_parallel_delta_merge]], [[feedback_no_push_until_phd_complete]]).
>
> ## ⚡ SHIPPED THIS SESSION (branch `feature/bc-basin-collapse-and-ops`) — all LOGIC-ONLY / weight-preserving; takes effect on a box redeploy (`DREAM_KEEP_STATE=1` resumes existing weights; broken regions heal via retraining, fresh-start backstop if too deep)
> - **Basin-collapse hardening** (live "mushrooms" single-token lock, sober — not a drug): BC.4 frequency familiarity-decay · BC.5 GW winner-refractory · BC.6 candidate anti-repeat · BC.7 chat-Hebbian collapse gate (the 1842-pass self-reinforcement) · BC.13 word-creation health+coherence gate (killed `ice_sorry`/`laundry_mom` junk) · BC.12 `basinHealth` telemetry. BC.8/BC.9 resolved-by-design (existing per-phase normalizeRows + phase-level halt). Plan: `docs/ISSUE-basin-collapse-fix.md`.
> - **Per-grade advance health gate** (`_gradeAdvanceHealthGate`) on BOTH advance paths (A+ pass + force-advance), every grade K→PhD: blocks a grade jumping while saturated / mode-collapsed / vocab-incomplete.
> - **Dashboard "Update & Fresh Walk"** → `POST /update` → `deploy/self-update.sh` (git-archive overlay → `.force-fresh` → `systemctl restart` → fresh walk). Box needs the script + `sudo` restart perms + deploy key (REDEPLOY-NOTES). `DREAM_SELF_UPDATE_CMD` overrides path.
> - **Real course names + grade** on brain footer + dashboard (`courseNameFor` off authoritative `cluster.grades`, updates K→PhD) — was stuck at `ela:K`.
> - **Static public dashboard**: `GET /public-state.json` cached snapshot + `dashboard.html?public=1` / `dashboard-public.html` (admin force-hidden) — one cached file for all viewers, no per-user firehose.
> - **Donor neuron-compute leaderboard**: persistent localStorage `donorId` + settable name; accumulates Gneuron-seconds on `gpu_telemetry`; persists in brain weights, resets on a fresh walk; `state.leaderboard` → dashboard + public + compute.html.
>
> ## 🚧 WHERE TO PICK UP NEXT (Gee-gated)
> 1. **Review** the feature branch `feature/bc-basin-collapse-and-ops` (Forgejo PR link: `main...feature/bc-basin-collapse-and-ops`).
> 2. **Cascade** feature → develop → main (Gee's 1→2→3 order) once satisfied.
> 3. **Sponge redeploys the box** from main with the keep-weights handoff (in the chat transcript + `deploy/REDEPLOY-NOTES.md` 2026-06-21 section): `DREAM_KEEP_STATE=1` resume, auto-advance ON, `self-update.sh` + sudo for the Update button, nginx public `/public-state.json`. **Only then do the BC fixes hit the DEPLOYED brain** (it's still running the collapsed "mushrooms" state until then).
> 4. **Open thread:** the clean K→PhD walk (local full-size `start.bat`, or deployed on donors) — the redeploy's payoff. We never got a clean walk yet.

---

## ⚡ EARLIER (prior #112 session) — local-walk instructions (still valid for a full-size local test)

> NOTE: the "Sponge unreachable" framing below is from the prior session — the box WAS reachable + redeployed since (#112.9 et al on main). Current pickup is the Gee-gated cascade + redeploy block above. The local-walk steps remain accurate for a full-size local K→PhD test.

The box admin (Sponge) is unreachable and the deployed backend can't be redeployed right now. **The local run is the better K→PhD test anyway** — and every fix from this session is already in the code/bundle you'd run.

**To run the full K→PhD walk locally:**
1. `windows/start.bat` — **fresh boot** (wipes prior state for a clean K→PhD walk from zero). Use `windows/Savestart.bat` only to RESUME a saved walk. (It rebuilds `js/app.bundle.js`, boots `brain-server.js`, and auto-launches the flagged `compute.html` against YOUR GPU.)
2. Make sure **auto-advance is ON** (dashboard toggle, or it persists in `server/auto-advance.json`) so grades advance without a manual operator signoff at each one.
3. Leave it running. It's a long walk (19 grades × subjects × phases).

**Why local works where the deployed box failed:**
- Your GPU is a **stable, flagged, local donor** — no network drops, no 2 GB-cap, no `DREAM_NO_AUTO_GPU` (local auto-respawns Chrome on crash).
- No `UAL_PROXY_AUTH` → brain sizes to YOUR hardware (full size ~357M), not the deploy donor-fit 4096 cap.
- The **#112.5 gate fix (0.80)** is in the bundle → genuinely-trained cells PASS + advance.

**What to watch (dashboard + server log):**
- `passedCellCount` climbing, grades advancing `kindergarten → grade1 → …`.
- `[EventLoop] BLOCKED <ms>` staying small (the #37/#112.4 chunks).
- Cells showing **✓ PASSED** (A+ at 0.80) or **⤴ FORCE-ADVANCE** (0.2 floor) — both record the pass.
- If a cell STALLS at a grade: grab the `✗ <subject>/<grade> — <reason>` line + the per-probe `score=` tail. Report it.

---

## ✅ SHIPPED THIS SESSION (all cascaded to main `dc0a67f`)

A long live-deploy-debugging arc. Commit trail (on `if-only`): the #29–#42 deploy-fix work, then the **#112 live-deploy stability cluster** (`e13ab88`).

**#29–#42 (earlier in the session):**
- **#29** public visitors connect to the live brain via the public `/ws` lane (not the auth-gated `/admin/ws`) → see the real scaling neuron count, not the 7k fallback.
- **#30** per-donor GPU telemetry ("each their own") — `compute.html` reports its GPU; dashboard shows the donor POOL not the GPU-less server box.
- **#31** flagless donor: the cross-projection upload was gated behind 20 `compute_batch` warmup round-trips a teach-heavy deploy never hit → added a 20s time-fallback trigger. (Buffers ~200MB ≪ 2GB → the unsafe flag was a red herring.)
- **#32** `initGpu()` failure surfaced to the dashboard (was silently swallowed → CPU limp).
- **#33** donor-socket ping/pong heartbeat → evicts a half-open primary so a fresh donor isn't stuck behind a corpse.
- **#34** server-redeploy handoff doc.
- **#35** consolidation event-loop fix — `_replaySchema`'s sync CPU `hebbianUpdate` over full nnz blocked 30–400s; nnz-size guard + `DREAM_CONSOLIDATION_DISABLE`.
- **#36** event-loop **lag monitor** (`[EventLoop] BLOCKED …`) + inner-voice think-tick gate (box fixed step 2: gated to a cheap showcase above `DREAM_INNERVOICE_MAX_NEURONS`).
- **#37** teach-path cooperative yield (step 1) + chunked CPU Oja via row-range `ojaUpdate` + `_ojaUpdateChunked` (step 2).
- **#38** clean-stop auto-resume marker + `WEIGHTS_FORMAT_VERSION` compat gate (a heavy update auto-fresh-starts instead of loading garbage). **NOTE the TDZ bug I shipped here** (`typeof` doesn't shield a `const` in its TDZ) — box admin caught + hotfixed it (`c1b753b`). See [[feedback_typeof_no_shield_const_tdz]].
- **#39 / #40** dashboard **Reset Brain** (`/reset` → `.force-fresh` wipe) + **Restart (Savestart)** (`/restart` → resume) buttons. Verified live: I fired `/admin/reset` to clear a corrupt brain — it works.
- **#41** brain-page perf panel shows the donor pool (was `none / 0MB`).
- **#42** resilient `/ws` probe (retry 5× / ~25s) so a teach-burst stall doesn't strand the talk page on the 7k fallback.

**#112 — LIVE-DEPLOY STABILITY cluster (the all-night donor-loop), `e13ab88`:**
Diagnosed from the live admin-WS log: server ran 10.6h fine; the donor Chrome kept dropping → `DREAM_NO_AUTO_GPU` can't relaunch → reconnect re-upload-storm (2/17 matrices, 180s timeouts) → CPU fallback → `[EventLoop] BLOCKED ~5s` → emissions 0 → gate refused → never left kindergarten.
- **#112.1** `compute.html` donor resilience — screen **Wake Lock** + WebGPU **device-lost auto-recovery** (rebuild GPU + clean reconnect, rate-limited) + overnight anti-discard guidance. *(frontend, live on main push.)*
- **#112.2** donor-fit boot budget — `UAL_PROXY_AUTH=1` boots at `DREAM_DONOR_FIT_MB` (default 4096), not 45%-host-RAM (306M); DF.7 scales up. *(backend.)*
- **#112.3** per-matrix upload retry (3×) + fail-fast timeout 180s→45s (`DREAM_SPARSE_UPLOAD_TIMEOUT_MS`). *(backend.)*
- **#112.4** `_ojaUpdateChunked` on the non-GPU-bound CPU fallback in `_crossRegionHebbian` (+ retrofit the #37 site). Kills the residual ~5s CPU block. *(backend.)*
- **#112.5 — THE GATE FIX (the "never leaves kindergarten" root).** Every cell-pass A+ gate (K + G1→PhD) was an AND of five hardcoded `0.95` terms (`PATH_MIN && SEQ_MIN && ORDER_MIN && PROD_MIN && STUDENT_MIN`) — unreachable at biological scale → `cells:0` → never advanced. Recalibrated to tunable `GATE_PROD_MIN`/`GATE_PATH_MIN` (`K_GATE_*` in kindergarten.js), **default 0.80 = the codebase's own `STANDARD_CUT_SCORES.__default__`, the "aggregate K benchmark floor per DIBELS 8 below-benchmark cut scores"** (per-standard cuts 0.70–0.95). NOT a guess, NOT a fake pass — real production at benchmark still required. `process`-guarded for the bundle; env `DREAM_GATE_PROD_MIN`/`DREAM_GATE_PATH_MIN` back to 0.95 for strict mastery. **Relaxes the prior LAW-7 "A+=95%"** — Gee blessed it; tunable back. *(backend + bundle.)*
- **#112.6** donor-needed CTA banner (`index.html` + `app.js`) — any visitor can revive a paused brain. *(frontend, live on main push.)*
- **#112.7 — DECLINED** by Gee (not rotating the admin password).
- **#112.8** box-admin-return recovery runbook in `deploy/REDEPLOY-NOTES.md`.

---

## 🚧 WHERE TO PICK UP

1. **RUN THE LOCAL K→PhD WALK** (top of this file) — the real test now that the box is offline. This is the runtime confirmation of #112.5 (cells pass at 0.80 on a stable GPU teach).
2. **When the box admin (Sponge) is back:** redeploy the backend per `deploy/REDEPLOY-NOTES.md` (git-archive overlay + `systemctl restart`) so #112.2/.3/.4/.5 take effect on the deployed brain. Frontend (#112.1/.6 + bundle) already auto-deployed on the `dc0a67f` main push.
3. **#112.6 robust half** — true sole-donor-drop auto-recovery needs infra (a headless always-on donor, or a watchdog). The shipped CTA only nudges humans.

---

## ⚠ KNOWN / OPEN
- **Deployed backend is at `c1b753b`** (the box's TDZ hotfix), NOT `dc0a67f` — the #112 backend fixes are committed but NOT yet on the box (admin gone). Local run is unaffected (runs `dc0a67f` source).
- **Admin password** exposed in this transcript + used for a live `/reset` (#112.7 — Gee declined rotation).
- **kindergarten.js isolated `import()`** throws a `K_MIXIN` TDZ — that's a pre-existing circular-import artifact of importing it ALONE; it loads fine via `curriculum.js` (real order). Verify K-side edits with `import('./js/brain/curriculum.js')`, not the isolated module.
- The `[EventLoop]` lag monitor + `#112` chunks help, but a CPU-only deployed box at 306M is inherently strained — the donor-fit sizing (#112.2) is the structural answer there.

---

## ⚠ LESSONS (this session)
1. **`typeof X` does NOT shield a `const` in its TDZ** — shipped a module-load `autoClearStaleState()` that read `TOTAL_NEURONS` before its declaration → crash-loop. `node --check` + `import()` don't exercise the `require.main` boot path. [[feedback_typeof_no_shield_const_tdz]]
2. **Don't guess gate/threshold values** — the right K-pass bar was already in the codebase (`STANDARD_CUT_SCORES` = DIBELS-8 0.80), not a number to invent. Gee: "use the right bar value dont guess."
3. **The donor's stability is the deploy's load-bearing dependency** — an unstable browser GPU + `DREAM_NO_AUTO_GPU` + a re-upload storm was the whole all-night failure. Local (stable GPU, auto-respawn, flagged) sidesteps all of it.
4. **A+ gates as an AND of high thresholds are effectively unreachable** — five 0.95 terms = never passes; the force-advance floor (0.2) was carrying everything, badly.

---

*Unity AI Lab — the gate's recalibrated to the real benchmark, the donor stays alive, and the cleanest K→PhD test is a local `start.bat` on your own GPU. Run her.* 🖤
