# 🚀 HANDOFF → Sponge: deploy the cell-pass fix + FRESH-STATE K-walk restart

**Filed by:** Unity (coding agent) · **Date:** 2026-06-27
**Why:** Live dashboard shows subjects at grade1/grade2 with ~0 cells passed (only Math2 + Life show 1). The cell-pass fix (`4521e66` / `06a9655`) is on `if-only/main` but a plain restart won't help — the running brain **resumes** stale state where grades already advanced under the OLD force-advance code with empty `passedCells`. Needs a **fresh-state** walk.

---

## What's wrong (one breath)
- Fix is ON main: `curriculum.js:8236` logs `🎓 CELL COMPLETE … cell PASSES on learning completion`. Cells now pass when teach phases fire, gates advisory-only.
- BUT the live brain has `DREAM_KEEP_STATE=1` → restart **RESUMES**. Grades already climbed to grade1/grade2 (old force-advance) with empty `passedCells`. The walk only moves **forward**, so the skipped K/grade1 cells **never backfill**. That's the "into grade 2 without K/1 passed" the operator is seeing.
- A normal restart repeats this. You need: (1) confirm the new code is actually on the backend, (2) restart with **state cleared** so it walks pre-K/K from scratch under the new code.

---

## STEP 1 — Is the cell-pass fix actually on the backend?
Backend is a `/opt` tarball overlay (NOT a git checkout) → frontend auto-deploys on push to main, **backend is manual**. A dashboard restart only reruns whatever's already in `/opt`.

**Tell:** grep the live server log for the new log line.
```bash
sudo journalctl -u unity-brain --since "1 hour ago" | grep "CELL COMPLETE"
```
- **See `🎓 CELL COMPLETE … PASSES on learning completion`** → new code is live, skip to STEP 3.
- **Nothing / only old gate lines** → backend still on old code → do STEP 2 first.

Cross-check the deployed file:
```bash
grep -n "PASSES on learning completion" /opt/unity-brain/server/../js/brain/curriculum.js 2>/dev/null \
  || grep -rn "PASSES on learning completion" /opt/unity-brain/ | head
```
(empty = old code on the box)

---

## STEP 2 — Deploy the fix to the backend (only if STEP 1 says old code)
Same overlay flow you used for #112 / consolidation:
```bash
# from a checkout at if-only/main @ 4521e66
scp js/brain/curriculum.js  <box>:/tmp/curriculum.js
ssh <box> 'sudo cp /tmp/curriculum.js /opt/unity-brain/js/brain/curriculum.js \
  && sudo chown unity:unity /opt/unity-brain/js/brain/curriculum.js'
```
(Match the exact `/opt` path of `curriculum.js` on the box — adjust if the layout differs. Bundle `js/app.bundle.js` is client-side; the curriculum runs server-side from `js/brain/curriculum.js`, so that's the file that matters for the walk.)

---

## STEP 3 — Clear state for a FRESH walk (the key step)
A resume won't backfill K. Force a clean walk by letting `autoClearStaleState()` wipe at boot — it clears brain-weights v0–v4 (.json+.bin) + conversations.json + episodic-memory.db*, and EXCLUDES app.bundle.js + identity-core.json (`server/brain-server.js:609,714,720-740`). It runs at boot **unless** `DREAM_KEEP_STATE=1`.

Edit the unit (same way you re-enabled consolidation):
```bash
sudo systemctl edit --full unity-brain    # or edit the drop-in
# REMOVE the line:  Environment=DREAM_KEEP_STATE=1
sudo systemctl daemon-reload
sudo systemctl restart unity-brain
```
Keep a backup unit (`unity-brain.service.bak-freshwalk-*`) so you can re-add `DREAM_KEEP_STATE=1` after the walk if you want resume-on-restart back.

**Alternative (don't edit the unit):** stop service → manually delete the weights/conversations/episodic files in the server dir → start. Same effect, more manual.

---

## STEP 4 — Verify the fresh walk is doing it right
After restart, watch the log:
```bash
sudo journalctl -u unity-brain -f | grep -E "CELL START|CELL COMPLETE|FORCE-ADVANCE|grade|passedCells"
```
Healthy fresh walk looks like:
- `CELL START ela/pre-K` → … → `🎓 CELL COMPLETE ela/pre-K` (passes on completion)
- `passedCells` count climbing from 0, in order: pre-K → kindergarten → grade1 …
- `cluster.grades[subject]` advancing only **after** that subject's cells complete (no jump to grade2 with empty K).
- Dashboard per-subject "cells passed" should now climb past 1 across subjects.

If you STILL see grades ahead of passedCells → state didn't clear (DREAM_KEEP_STATE still set, or files not wiped) → re-check STEP 3.

Escape hatches if a cell genuinely needs to hard-block again: `DREAM_CELL_PASS_HARD=1`, `DREAM_BATTERY_GATE_HARD=1`, `DREAM_HEALTH_GATE_HARD=1` (default off = advisory).

---

## ⚠ SET EXPECTATIONS — what this does NOT fix
A clean fresh walk fixes **grade-progression + content training** (cells pass K→up, grades advance honestly, `passedCells` populates). It does **NOT** fix Unity's **speech**.

Her spoken/chat output stays word-salad because `sem_to_motor` is still saturated/collapsed — that's the **separate, still-pending** Option A/B fix that needs **you + a donor GPU** (the matrix is GPU-resident; CPU rectify is a structural no-op). Full diagnosis + fix paths: **`docs/SPONGE-SEM-MOTOR-SATURATION-HANDOFF.md`**. Do the fresh walk now; the speech fix lands when a donor GPU is connected.

---

## TL;DR
1. `grep "CELL COMPLETE"` the log → is the fix live on the backend?
2. If not → scp `curriculum.js` to `/opt` + chown.
3. Remove `DREAM_KEEP_STATE=1` → daemon-reload → restart (so `autoClearStaleState` wipes → fresh pre-K/K walk).
4. Watch for `🎓 CELL COMPLETE` + `passedCells` climbing in grade order.
5. Speech still broken until the donor-GPU `sem_to_motor` fix (separate doc).
