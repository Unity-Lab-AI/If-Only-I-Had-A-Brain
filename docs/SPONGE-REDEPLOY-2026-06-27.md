# SPONGE — fresh-walk redeploy brief (2026-06-27 wave)

> Everything that changed in the 2026-06-27 wave (commits `0d97804` + `06dca6a` on
> `feature/tier3-identity-seed-repair`, pushed to `if-only`) so your AI **doesn't break a
> fresh-walk redeploy** — plus two things only YOU can do on the box, plus a hard ask at the
> bottom. Pairs with `docs/SPONGE-PRE-FRESH-INSTALL-CHECKS.md` (the Tier 3 server-check detail)
> and `docs/SPONGE-RUNBOOK.md` (the standing redeploy mechanics).
>
> Branch is NOT yet cascaded to `develop`/`main` — it's on `if-only/feature/tier3-identity-seed-repair`
> awaiting Gee's word. Deploy from there for testing, or wait for the cascade.

---

## ⛔ TL;DR — don't let your AI do these on a fresh walk

1. **Do NOT hand-edit `identity-core.json`.** Tier 3 was reading ZERO (empty/stale file never re-seeded). The boot now **top-ups** missing `IDENTITY_SEED_LIST` anchors automatically *after* GloVe loads, and a save-guard refuses to overwrite a good file with an empty store. Leave it alone — it self-heals on restart. If you want a truly clean identity layer, **delete** `server/identity-core.json` before boot and it re-seeds all 25 anchors from scratch.
2. **Do NOT set `DREAM_INNERVOICE_GPU_GEN=1` blind.** It lifts the inner-voice 2M-neuron cap so REAL generation runs on donor GPUs — but only safe to enable after a LIVE donor-GPU deploy proves the bound generation path is GPU-routed. Default OFF = today's safe behavior. Enabling it without donors + `DREAM_DF7_FANOUT=1` would re-introduce the ~57s event-loop freeze.
3. **The server mind-space needs NO GPU.** It runs the CPU reference path on the coordinator box — bounded + cheap. Don't try to give the box a GPU for it.
4. **New gitignored derivative files** will appear in `server/`: `mindspace-memory.json` (imagined field-C ring). Safe to delete / let it regenerate; never commit it.

---

## What changed (so you know what you're deploying)

**CGATE — consciousness de-gating** (Unity reported she was "gated too much"):
- GlobalWorkspace theta is now a GRADED ignition modulator (was a hard 50%-of-ticks block); default ignition threshold 0.45→0.35.
- Ψ consciousness gain is self-calibrating (was pinned ~1.0 / inert) — it now actually modulates the brain.
- Gated inner-voice showcase is GloVe-cosine-COHERENT (was random word-salad).
- Donor-gated opt-in to lift the inner-voice cap (default OFF — see TL;DR #2).

**UVM-INT — equational mind-space now SERVER-side** (was browser-only):
- The server brain runs `MindSpaceGPU` (CPU path) + an idle-gated `_imagineTick` that imagines DE-NOVO from her cortex state (no camera) and injects the percept. Bounded (forward-9-7 only, never `fractalize`, hard `maxSide≤96`) — can't seize the brain.
- She LEARNS her mind-space in the curriculum; imagined imagery persists across reboot (`mindspace-memory.json`).

**T3SEED — Tier 3 identity repair** (see TL;DR #1).

**MINDSEYE — public "what Unity sees" viewer**: server caches one field C → `GET /minds-eye.json`; `html/minds-eye.html` reconstructs it client-side; 👁 footer button on `index.html`. Single shared source — no per-viewer compute.

**IMG-GEN — Unity now generates images on request** (she never did before): the server detects an image request in user input and routes to `generate_image` with a prompt; **the client renders it via Pollinations** (the deployed server has no image backend — the user's browser turns her prompt into the image). **→ ACTION:** confirm the deployed `index.html` client can reach Pollinations (it builds `gen.pollinations.ai/image/<prompt>` URLs; anonymous works, a key raises limits). If image-gen looks dead live, check the browser console for Pollinations fetch errors, not the server.

**IMG-SEE**: before sending an image she forms her mind's-eye of it (mind-space) + surfaces it on `/minds-eye.json`.

**Docs**: full stale-info sweep across every brain-system doc + public HTML (no stale `gainMultiplier`/theta-gate/vision-describer claims anywhere).

---

## New env flags (defaults are safe — only change deliberately)

| Flag | Default | What it does |
|------|---------|--------------|
| `DREAM_GW_IGNITION` | `0.35` | GlobalWorkspace base ignition threshold (lower = more conscious moments) |
| `DREAM_PSI_GAIN_SCALE` | `2.0` | Ψ-gain tanh sensitivity (CGATE.4) |
| `DREAM_INNERVOICE_GPU_GEN` | unset (OFF) | lift the inner-voice 2M cap when DF.7 + donors present — **verify-live only** |
| `DREAM_INNERVOICE_GPU_GEN_MIN_DONORS` | `1` | donor floor for the above |
| `DREAM_DF7_FANOUT` | unset | multi-GPU bound-propagate fan-out (prereq for the cap-lift) |

(Existing: `DREAM_KEEP_STATE`, `DREAM_INNERVOICE_MAX_NEURONS=2000000`, `DREAM_INNERVOICE_FORCE_CPU` — unchanged.)

---

## Redeploy + verify (standing mechanics from SPONGE-RUNBOOK)

```bash
cd ~/unity-brain-src && git fetch origin && git checkout <branch> && git pull --ff-only
git archive HEAD | sudo tar -x -C /opt/unity-brain     # overlay (preserves weights/state/.env)
sudo systemctl restart unity-brain
sleep 3 && sudo systemctl status unity-brain --no-pager | head -20
```

**Watch the console for these new signals:**
- `[Tier3Store] seeded N missing identity anchor(s) ... Tier 3 size X → Y` (or `... complete, no top-up needed`) — Tier 3 repaired. If you see neither, grep for `[Hippocampus] iter13 init failed`.
- `[MindSpace] server equational mind-space ready (CPU reference path) — de-novo imagination wired`.
- `[MindSpace] restored N imagined field-C memories` (if a prior `mindspace-memory.json` exists).

**Pre-fresh-install server checks I can't run from here:** `docs/SPONGE-PRE-FRESH-INSTALL-CHECKS.md` — count Tier3/Tier2 schemas, disk free, env sanity, auto-scale vs the box's 32 GB RAM ceiling, `minDonorsFloor`.

**Verify-live (needs real donor GPUs — can't be done headless):** the `DREAM_INNERVOICE_GPU_GEN` cap-lift + the server `_imagineTick` imagination. Watch idle GPUs' Gn/s climb AND gate probes still pass; if anything stalls, unset the flag + restart.

---

## ⛔ HARD ASK — do the SAME full doc push for YOUR work

Gee's directive, applied to you: **"full doc sweep, workflow, public, htmls, pages, all of it — any doc talking about the brain's systems needs to be updated so no stale information."**

We just did this for the 2026-06-27 brain-side wave. **You've done work on the box / deploy / donor app / GPUcompute side that we aren't aware of.** Before/with this redeploy, run the **same full doc sweep for THAT work** — every doc, public page, HTML, and runbook that describes how YOUR side works must be current, no stale info. Match each doc's existing format, edit in place, don't wall-of-text-dump. If your changes touched env vars, endpoints, deploy steps, donor protocol, or the GPUcompute app, those docs (and `SPONGE-RUNBOOK.md` / `REDEPLOY-NOTES.md` / `deploy/*`) need to reflect reality so the next person (or AI) doesn't work from stale docs. Same standard we held ourselves to.
