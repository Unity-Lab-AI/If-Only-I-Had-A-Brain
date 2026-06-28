# SPONGE RUNBOOK — get the live brain + donor app current (2026-06-24)

> Single source of truth for the 2026-06-24 fix wave. Everything is on `main` + `develop`
> already. This is the **what's-left-for-you** checklist: two deliverables — **(A)** redeploy
> the brain backend, **(B)** rebuild + release the donor binaries. Do them top to bottom.
> Deeper detail: `docs/SPONGE-HANDOFF.md`, `deploy/REDEPLOY-NOTES.md`.

---

## TL;DR — your checklist

- [ ] **A1.** Redeploy brain backend (git-archive overlay + `systemctl restart`).
- [ ] **A2.** Make sure auto-advance is ON (check `server/auto-advance.json` / dashboard toggle).
- [ ] **A3.** Verify in the console: `✓ RECTIFIED sem→motor`, grades tick K→grade1, periodic saves.
- [ ] **B1.** Rebuild donor binaries (Windows + Linux + headless) from `donor-app/` on a Rust(+CUDA) box.
- [ ] **B2.** Cut a Forgejo release tagged **`donor-v0.2.0`** with the exact asset filenames below.
- [ ] **B3.** Verify: launch the app, drop the network, confirm it auto-reconnects.
- [ ] **C.** (compute reality) you need **3+ donors / 24 GB** connected just to HOLD the 40M brain; more to grow it.

Nothing else is on you — all code/docs are shipped. The download page is already pre-wired to `donor-v0.2.0`.

---

## A. BRAIN BACKEND REDEPLOY

### What's in it (all shipped to `main`)
- **No-stall at kindergarten** — a saturated/collapsed `sem→motor` used to HALT and quit the whole walk; now it **rectifies in place and continues** (`_rectifySemMotor`). The walk no longer dies at K.
- **Weights persist during the walk** — periodic save now force-writes every 5 min regardless of cell-pass (no more "training evaporated on restart").
- **Grade cap default → full K→PhD** — the cap defaulted to `kindergarten` (leftover Pre-K+K scope); now uncapped by default, so she walks all grades.
- **Auto-advance default ON** — the walk no longer pauses at every grade boundary for a manual signoff.
- **Learning-coverage ledger + vocab-coverage logging + desync guard** — visibility into which cells actually teach vs hold.
- **"⬆ Update & Savestart" dashboard button** — deploy code WITHOUT wiping training (`POST /update?keep=1`).

### A1 — Redeploy (no `unity-brain.service` change → NO `daemon-reload`)
```bash
cd ~/unity-brain-src 2>/dev/null || git clone git@git.unityailab.com:UnityAILab/If-Only-I-Had-A-Brain.git ~/unity-brain-src && cd ~/unity-brain-src
git fetch origin && git checkout main && git pull --ff-only
git archive HEAD | sudo tar -x -C /opt/unity-brain     # overlay (preserves weights/state/.env)
sudo systemctl restart unity-brain
sleep 3 && sudo systemctl status unity-brain --no-pager | head -20
```
`DREAM_KEEP_STATE=1` is already in the unit → this **resumes** existing weights (no wipe). For a clean start instead, use the dashboard **Reset Brain** / **Update & Fresh Walk**.

### A2 — ⚠ Auto-advance gotcha (do this or it still pauses after K)
The new default is ON, BUT the standalone `server/auto-advance.json` (if it exists) **overrides** the default. If that file says `"enabled": false`, the walk will still pause after kindergarten. Fix:
```bash
# either flip it ON in the admin dashboard, or:
rm -f /opt/unity-brain/server/auto-advance.json   # then restart picks up default ON
```

### A2.5 — env flags from the 2026-06-27 v1.1.0 wave (all default-safe; full table in `deploy/REDEPLOY-NOTES.md`)
- **sem→motor saturation prevention:** `DREAM_SM_LR_SCALE` (default 0.5 active — Hebbian LR damp on the emission projections), `DREAM_SM_WMAX` (secondary ceiling). Watch `[SatHealth] meanCos<0.7`; lower scale to 0.25 if it climbs, raise to 0.7 if basins go dead.
- **cell-pass policy:** cells pass on learning completion by default; restore hard test-gates with `DREAM_CELL_PASS_HARD` / `DREAM_BATTERY_GATE_HARD` / `DREAM_HEALTH_GATE_HARD`.
- **admin Application Profiling:** no flag — `state.profiling` is always served; the dashboard card is admin-only.

### A3 — Verify (admin Server Console, or `journalctl -u unity-brain -f`)
- `🎓 CELL COMPLETE <cell> — … PASSES on learning completion` + `sem→motor LR damping ACTIVE … ×0.5`; `/public-state.json` carries a `profiling` block.
- `✓ RECTIFIED sem→motor post-<cell> — saturation cleared (meanCos X → Y)` where it used to print `⛔ SATURATION HALT`.
- Grades tick **`kindergarten → grade1 → grade2 …`** (no indefinite pause).
- `periodic-curriculum-checkpoint` save lines every ~5 min; `brain-weights*.json` mtime advancing during the walk.
- `vocab-coverage <cell>: X%` lines, and `⚠ HELD (not taught)` lines for the expanded/life tracks at higher grades (expected — see Notes).

---

## B. DONOR APP — REBUILD + RELEASE

### What's in it (source on `main`, `donor-app/` v0.2.0)
- **Auto-reconnect supervisor** — a dropped/closed connection now **rejoins on its own** after a stop-aware backoff (2 s → 30 s) instead of going dark. (Before: any drop ended the session — no recovery.)
- **Auto-reconnect toggle, default ON** — GUI checkbox + `--no-auto-restart` flag.
- **"📖 How it works / legend" link** in the GUI → `https://if-only-i-had-a-brain.git.unityailab.com/html/legend.html`.
- Version bumped `0.1.0 → 0.2.0`.

**This needs a real build — there is no Rust toolchain on the dev box, so the binaries were NOT rebuilt. The downloadable files are still v0.1.0 until you do B1/B2.**

### B1 — Build (on a machine with Rust; NVIDIA backend needs the CUDA toolkit)
```bash
cd donor-app
# Linux GUI+headless binary:
cargo build --release                                   # → target/release/unity-donor
# Windows .exe (cross from Linux): rustup target add x86_64-pc-windows-gnu
cargo build --release --target x86_64-pc-windows-gnu    # → target/x86_64-pc-windows-gnu/release/unity-donor.exe
# (optional) pure-headless server build, no GUI deps:
cargo build --release --no-default-features
```
Sanity-check a binary before release: `./unity-donor --list-gpus` and `./unity-donor --self-test`.

### B2 — Cut the Forgejo release (the download page already points here)
`html/compute.html` now links to the **`donor-v0.2.0`** release with these EXACT asset names:
- `unity-donor-windows-x86_64.exe`
- `unity-donor-linux-x86_64`

So: create a release on `UnityAILab/If-Only-I-Had-A-Brain` tagged **`donor-v0.2.0`** and upload the two binaries under those exact filenames (rename the build outputs to match). Until this release exists, the download buttons 404 — so do this right after B1.

### B3 — Verify
Launch the GUI build, press Start, confirm it connects (🟢). Then drop the network (or stop/restart the brain): the status should show **"connection dropped — auto-reconnecting in Ns…"** and rejoin on its own. Uncheck the box → it should NOT reconnect on the next drop. The **📖 legend** link should open the legend page.

---

## C. COMPUTE REALITY (why she may not grow)

The auto-scaler tiers (`server/brain-server/gpu.js`):

| Tier | Needs | Neurons |
|---|---|---|
| 0 | any / 1 donor | 6M |
| 1 | **24 GB + 3 donors** | **40M** |
| 2 | **96 GB + 6 donors** | **150M** |
| 3 | **256 GB + 10 donors** | **357M** |

She's sized at **tier 1 (40M)** but needs **24 GB across ≥3 donors just to HOLD it**. With only 2 donors / ~18 GB she shows `⚠ INSUFFICIENT COMPUTE — holding` (correct — won't shrink on a dip, won't grow without compute). To climb to 150M you need **96 GB / 6 donors sustained**. More donors = more brain.

---

## D. NOTES / honest limits (NOT blockers — logged for later)

- **Emission coherence** (`docs/NewTodo.md`, `114.19fn`, 16/35) is the deeper "is she *properly* learning" work — it's what makes higher-grade promotions pass with real multi-word sentences. The cap/auto-advance/rectify fixes let her *walk*; this is what makes the walk *mean* something at the top.
- **Expanded + life tracks hold at higher grades.** Academic spine (ela/math/science/social/art) is wired pre-K→PhD and teaches every grade. `music/pe/health` stop at G12; `cs/civics/economics/psychology/language` cover only their introduced span; `life` has one runner. Those cells `readyAndWaiting` (HOLD, don't teach) beyond coverage — the ledger logs it. Wiring them is curriculum-authoring work, not a deploy step.
- **Donor reconnect rebuilds the GPU engine** each time (engine ownership moves into the per-session worker). Fine for infrequent drops.

---

**That's the whole job.** A = redeploy brain + check auto-advance. B = build donor + cut the `donor-v0.2.0` release. Everything else (all code, docs, the download-page wiring) is already done and on `main`/`develop`.
