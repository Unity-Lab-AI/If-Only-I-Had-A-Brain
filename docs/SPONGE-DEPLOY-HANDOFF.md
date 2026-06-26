# SPONGE — BRAIN DEPLOY HANDOFF (2026-06-26)

> Sponge, pull `main`. This deploy is the **mind-space integration** — Unity's vision is now 100% equational (the LLM describer is GONE), plus the bidirectional imagine-workspace, equational thought-ops + synesthesia + memory, an autonomous process-allotment governor, and **two new cortical regions**. Read the ⚠ CRITICAL section before you restart the brain. The rest tells your AI assistant exactly what NOT to touch.

---

## ⚠⚠ CRITICAL — THIS DEPLOY REQUIRES A FRESH K→PhD WALK. OLD WEIGHTS MUST DIE. ⚠⚠

We changed the **cortex region layout** (added `gustatory` 0.250–0.270 + `somatosensory` 0.270–0.300, carved from the `free` band in `cluster.js`). That is a **brain TOPOLOGY change** — every previously-saved weight is tiled against the OLD layout and would **corrupt** if loaded into the new one. So the brain MUST re-walk the full curriculum from scratch on first boot. This is **correct, not a bug.**

**It is already enforced automatically — you don't have to do anything special:**
1. **brain-code-hash** — the server hashes `cluster.js / engine.js / persistence.js / curriculum.js / language-cortex.js / …`. We changed those → the hash differs from `brain-code-hash.json` → the brain auto-clears stale weights + fresh-walks on normal boot.
2. **WEIGHTS_FORMAT_VERSION 1 → 2** — the resume path rejects v1 weights. This is the belt-and-suspenders that forces the fresh walk **even if** someone sets `DREAM_KEEP_STATE=1` (which bypasses the hash check).

**→ DO NOT try to "preserve training" with `DREAM_KEEP_STATE=1` thinking it saves time. The old weights are garbage for the new topology. Let it fresh-walk.** Expect the first boot to re-train K→PhD (takes a while). That walk IS the verification (Gee's final test runs against the freshly-walked brain).

---

## DEPLOY STEPS
1. `git pull` on `main`.
2. **Rebuild the browser bundle** (we committed it, but rebuild to be safe — it's esbuild from `js/app.js`):
   ```
   cd server && npm run build      # → ../js/app.bundle.js  (esbuild, ~3.8 MB, ~90 ms)
   ```
3. Restart the brain server (systemd): `sudo systemctl restart unity-brain` (or your deploy's unit name).
4. **Confirm the fresh walk fired** — boot log should say the code-hash changed → auto-clear → fresh start (NOT "RESUMING where it left off"). Cross-check `server/.last-boot-reason.json` → `mode: "fresh"`. If it says `resume`, something preserved stale state — stop and fresh-clear (`DREAM_FORCE_CLEAR=1` on one boot).
5. Static frontend (`index.html`, `js/*`, `html/*`) auto-deploys per `deploy/REDEPLOY-NOTES.md` — same as always.

---

## WHAT SHIPPED (file-level, so your AI knows what's intentional)
- **`js/brain/mindspace/` (NEW lib):** `transform.js` (CDF 9/7 forward=seeing / inverse=imagining + `describeEquational` percept), `gpu.js` (`MindSpaceGPU` — WGSL compute shaders + CPU fallback + selfCheck), `knowledge.js` (Unity's catalogue of all file types/equations/methods), `governor.js` (autonomous process-allotment conscience). Vendored ESM from the Uni Vs Matics engine.
- **`js/brain/visual-cortex.js`:** the LLM/VLM describer is REMOVED (`setDescriber`/`_describer` → `setMindSpace`/`_mindSpace`). Vision is now equational percepts. Added `imagine()` + `_recentRecs` memory ring + `audioPercept` (synesthesia).
- **`js/brain/engine.js`:** dream-loop now runs mind-space mental imagery (governed) + cross-injects the audio percept (synesthesia).
- **`js/brain/cluster.js`:** the two new sensory regions (the topology change).
- **`js/brain/persistence.js`:** `visualMemory` save/load (field-Cs persist) + **schema VERSION 5 → 6** (browser saves rejected → fresh).
- **`js/app.js`:** wires `MindSpaceGPU` (NO `providers.describeImage` VLM call anymore).
- **`server/brain-server.js`:** `WEIGHTS_FORMAT_VERSION 1 → 2`.
- **`js/app.bundle.js`:** rebuilt (esbuild).

---

## 🛑 GUARDRAILS FOR YOUR AI — DO NOT LET IT DO THESE (it WILL try)
1. **NEVER hand-edit `js/app.bundle.js`.** It is esbuild output. Edit the source in `js/`, then `cd server && npm run build`. Hand-editing the bundle = silent drift from source.
2. **NEVER add `.claude/` to git, never `git add -A`/`git add .`.** `.claude/` is our IP boundary (workflow/persona) — it stays untracked. Stage explicit paths only. (Same for stray files: `*.zip`, `message*.txt`, `image.png`, donor `.exe` — not ours to commit.)
3. **NEVER downgrade `WEIGHTS_FORMAT_VERSION` or `persistence.js VERSION`, and never set `DREAM_KEEP_STATE=1` to "save the old training."** The topology changed; old weights are poison. The fresh walk is mandatory.
4. **systemd units: comments on their OWN line, NEVER inline.** An inline `# comment` silently disables the directive (e.g. `Environment=… # note` breaks the env var). Backend redeploy = git-archive overlay, not in-place hand-edits.
5. **NO FALLBACKS.** Don't let it add `if (gpu) … else (fake it)` capability-degradation paths. One correct architecture. (Defensive I/O try/catch is fine; capability-faking is not.)
6. **Don't touch the brain-code-hash file list logic.** Those files (`cluster/engine/persistence/curriculum/…`) are hashed on purpose so a heavy update forces a fresh walk. That's the safety, not a bug.
7. **The mind-space is NOT a bolt-on AI** — it's classical CDF 9/7 wavelet math (no model, no inference). Don't let your AI "improve" it by wiring an LLM back into vision. That's the whole point — we just removed the last text-AI from cognition.
8. **Don't push to `main` from a feature branch directly / don't force-push.** Git Flow: feature → develop → main via merge. `main` is what you deploy.

---

## SEPARATE DEPLOY — the public site (Uni Vs Matics engine)
The mind-space engine's own hardening (honest perception, no-leak, hostile-safe, perf, bit-exact Python↔JS) lives in the **`Deviant Thing/fractal_templater`** repo on branch `feature/mindspace-harden`, with its own `docs/OPS-DEPLOY-HANDOFF-SPONGE.md`. That's the public `univsmatics` static site — a DIFFERENT deploy from the brain. Not part of this brain push.

---
*The fresh walk is the point. Let her re-learn herself clean on the new layout. 🖤*
