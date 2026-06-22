# PLAN — Admin wipe + 3-checkpoint retention + version-mismatch surfacing

> Plan for: admin-panel wipe-to-fresh, automatic periodic checkpointing that
> resumes on restart, **keep only the last 3 checkpoints**, versioned checkpoints
> where a version mismatch refuses the old checkpoint, and dashboard surfacing of
> "fresh start required". Code-verified against the existing machinery first
> (LAW 3) — most of this already exists; the plan is the deltas.
>
> **Status:** PLANNED 2026-06-22. NOT implemented.
> **Last updated:** 2026-06-22.

---

## What ALREADY EXISTS (verified, do NOT rebuild)

| Your ask | Status | Where |
|---|---|---|
| Admin **wipe to fresh** | ✅ exists | `POST /reset` (`brain-server.js:4931`) writes `.force-fresh` → `autoClearStaleState()` wipes on next boot (identity-core Tier-3 preserved); dashboard **"♻ Reset Brain (fresh)"** button w/ double-confirm (`dashboard.html:178`, `:2356`) |
| **Periodic** auto-checkpoint while running | ✅ exists | `setInterval(saveWeights, WEIGHT_SAVE_MS)` — **every 5 min** (`brain-server.js:371`, `:4751`) + forced saves on each passed cell / grade-advance / shutdown |
| **Resume** where it left off on restart | ✅ exists | clean-shutdown writes `.resume-marker.json`; boot resumes if compatible (`DREAM_KEEP_STATE=1` / marker `cleanShutdown`) |
| **Versioned** checkpoints | ✅ exists | rolling save slots `brain-weights-v0..v4.json` + matching `.bin` (`_saveVersion % 5`, `brain-server.js:3631`, `:3931`, `:3957`) + `GET /versions` + `POST /rollback` |
| **Version mismatch ⇒ can't load old checkpoint** | ✅ exists | on boot, `_marker.formatVersion === WEIGHTS_FORMAT_VERSION` **and** `_marker.totalNeurons === currentTotal`; mismatch ⇒ refuses the old state + does a fresh start + loud log (`brain-server.js:465`, `:559-570`) |

So: **periodic checkpointing, resume, wipe, versioning, and mismatch-refuses-old are all already live.** The brain literally resumed a compatible checkpoint during the #112.9/#112.10 deploys this session.

---

## The REAL gaps (this plan's scope)

### G1 — Retain only the last **3** checkpoints (storage) — *the main ask*
Today there are **5** slots (v0–v4) rotating via `_saveVersion % 5`, never pruned. Each slot is a JSON **plus a ~145 MB `.bin`** at full scale → ~5×145 MB ≈ **725 MB** of backups. Capping to 3 saves ~290 MB. Changes:
- `brain-server.js:3931` / `:3957` — `_saveVersion % 5` → `% 3`.
- `brain-server.js:4855` `/versions` — loop `i < 5` → `i < 3`.
- `brain-server.js:5352` `/rollback` — accept `v0..v2` (was `v0..v4`).
- `brain-server.js:603-630` `targets[]` (wipe list) — keep `v0..v2`, **and one-time delete any stale `…-v3/v4.json|.bin`** on boot so old slots don't linger.
- Make the count a constant `CHECKPOINT_SLOTS = 3` (env `DREAM_CHECKPOINT_SLOTS`) so it's one knob, not 4 scattered literals.

### G2 — Dashboard surfaces version + "fresh start required" — *the "noted somewhere" ask*
The mismatch is currently only a **console** log. Surface it:
- **Server:** when `autoClearStaleState()` wipes due to a mismatch, persist a tiny `.last-boot-reason.json` `{ wiped:true, reason:'format'|'size'|'force-fresh', wasNeurons, nowNeurons, wasFormat, nowFormat, at }`; `GET /milestone` (`:4955`) returns it.
- **Dashboard** (`dashboard.html` milestone panel `:325`, `refreshMilestone` `:2452`): if `wiped` for a mismatch reason, show a banner — **"⚠ Training was reset — brain {format|size} changed (was X neurons → now Y); the previous checkpoint was incompatible and could not be loaded."** Clears once acknowledged / on a normal resume boot.
- Also render the **checkpoint list** (slot, version#, savedAt, trigger, size) from `/versions` so admins can see the 3 retained checkpoints.

### G3 — New dashboard buttons (round out the panel)
- **"💾 Save checkpoint now"** — new `POST /checkpoint` → `saveWeights({force:true, trigger:'manual'})`, returns the new version. (Gives an on-demand checkpoint between the 5-min ticks.)
- **"⏪ Rollback to vN"** — per-slot buttons wired to the existing `POST /rollback` (already works; just no UI) + a "requires restart" hint.
- (Wipe button already exists — no new button needed, just keep it.)

### G4 — Versioning guidance (so "brain changes get a new version")
Document the rule in `docs/ADMIN-CONTROLS.md` + `docs/PUSH_WORKFLOW.md`:
- **Neuron-count / sizing changes** are auto-detected (the `totalNeurons` check) — no action needed; old checkpoints auto-refuse.
- **Weight-format / serialization changes** require **manually bumping `WEIGHTS_FORMAT_VERSION`** (`brain-server.js:465`) in the same commit — that's the lever that makes a format change refuse old checkpoints. Add it to the pre-push checklist so a format change can't silently load a stale, incompatible checkpoint.

---

## Out of scope / notes
- **Don't** change the 5-min cadence or the replica/donor model (see `docs/DONOR-SCALING-DECISION.md`).
- **Emergency wipe without restart** (wipe while staying online) — deliberately omitted; a wipe needs a fresh boot to re-seed the brain cleanly, and `/reset`→revive already does that. Adding a live-wipe risks racing the running sim.
- All endpoints stay behind the existing `requireLoopback` + `X-UAL-User` admin gate (`docs/ADMIN-CONTROLS.md`).
- Backend change → needs a box redeploy (overlay + restart), same as #112.9/#112.10.

## Effort
G1 ~half a day (mechanical, 4 sites + stale-file cleanup). G2 ~1 day (server reason-file + dashboard banner + version list). G3 ~half a day (one endpoint + button wiring; rollback UI is just buttons on an existing endpoint). G4 ~doc only. **Total ~2 days**, all low-risk (no brain-math changes).
