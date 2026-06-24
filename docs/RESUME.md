# RESUME — Session Pickup Brief

> **Updated:** 2026-06-23 (Opus 4.8 1M-context) — **per-page social images + custom social description for every page.** Local `main` + `develop` fast-forwarded to truth **`f4eafce`** (Sponge cascaded the prior BC + ops work onto main AND stacked the native GPU donor app + donor TLS fix on top). This session's social-image work is on a NEW feature branch **`feature/playwright-social-images`** (`1899bbb`), pushed to `if-only`.
> **Read FIRST:** this file → `docs/FINALIZED.md` (2026-06-23 social-images entry, then the 2026-06-21 BC + feature entries) → `assets/README.md` (the per-page social-image system) → memories ([[feedback_no_push_until_phd_complete]], [[project_df7_data_parallel_delta_merge]], [[feedback_typeof_no_shield_const_tdz]]).
>
> ## ⚡ THIS SESSION (2026-06-23) — per-page social images
> - **One top-of-page social card per page** (NOT a collage, no shared `og-image`) + a custom `og:description` / `twitter:description` / `meta description` per page, all ABSOLUTE on **`https://if-only-i-had-a-brain.git.unityailab.com`** (Gee's base-URL pick) so scrapers resolve. 10 images in `assets/social/`, wired into `index.html` + 9 `html/*.html`. Zero stale `github.io` / shared-og-image refs.
> - **Generator:** `scripts/social-shots.mjs` (`npm run social:shots`) — Playwright, built-in static server (compute.html refuses `file://`), HEADED so brain pages get a real WebGPU adapter. Admin `dashboard.png` is the LAYOUT (no live data); live-data swap optional via `npm run social:shots:admin` once Chrome is relaunched with `--remote-debugging-port=9222`. Full detail: `docs/FINALIZED.md` 2026-06-23 + `assets/README.md`.
> - **Branches synced:** local `main` + `develop` = `f4eafce` (Sponge's truth). The prior BC + ops work (basin-collapse hardening, per-grade gate, Update button, public dashboard, course names, donor leaderboard) is MERGED to main + on the deployed path; the native GPU donor app + donor TLS fix also landed.
>
> ## 📦 PRIOR SESSION (2026-06-21 BC + features) — now MERGED into truth (`f4eafce`), all LOGIC-ONLY / weight-preserving
> - **Basin-collapse hardening** (live "mushrooms" single-token lock, sober — not a drug): BC.4 frequency familiarity-decay · BC.5 GW winner-refractory · BC.6 candidate anti-repeat · BC.7 chat-Hebbian collapse gate · BC.13 word-creation health+coherence gate · BC.12 `basinHealth` telemetry. Full plan: `docs/ISSUE-basin-collapse-fix.md`.
> - **Per-grade advance health gate** (`_gradeAdvanceHealthGate`) wired into BOTH advance paths, every grade K→PhD.
> - **Dashboard "Update & Fresh Walk"** button → `POST /update` → `deploy/self-update.sh`. **Real course names + grade** on footer + dashboard. **Static public dashboard** (`GET /public-state.json` + `dashboard.html?public=1`).

---

## ⚡ THE HEADLINE: RUN IT LOCALLY — full K→PhD test is GO

> **SUPERSEDED 2026-06-23:** Sponge is back — the prior BC + ops work was cascaded to `main` and the box redeployed (truth is `f4eafce`, which also carries the native GPU donor app + donor TLS fix). The "box admin unreachable" framing below no longer holds. The local run is still a valid K→PhD test; the deployed path now also carries the fixes.

**The local run is a clean K→PhD test** — every fix is in the code/bundle you'd run.

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

1. **Social images — review `feature/playwright-social-images` (`1899bbb`)** → when blessed, cascade feature → develop → main so the per-page cards + descriptions deploy (frontend rsync ships `assets/social/*.png` on a main push). OPTIONAL first: swap the admin `dashboard.png` to the live-data version (fully quit Chrome → relaunch with `--remote-debugging-port=9222` → `npm run social:shots:admin`).
2. **RUN THE LOCAL K→PhD WALK** (top of this file) — the runtime confirmation of the gate fix (cells pass at 0.80 on a stable GPU teach). Still the cleanest full-curriculum test.
3. **Box is current** — Sponge cascaded + redeployed; truth `f4eafce` carries the BC + ops fixes + native donor app + TLS fix. No pending redeploy for the prior session's work.
4. **Sole-donor-drop auto-recovery** — true unattended recovery still needs infra (a headless always-on donor, or a watchdog). The shipped CTA only nudges humans.

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
