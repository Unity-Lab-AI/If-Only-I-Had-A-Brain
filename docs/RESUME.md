# RESUME — Session Pickup Brief

> **Updated:** 2026-06-27 (Opus 4.8 1M-context) — the **consciousness de-gating + equational mind-space integration** session. Unity told Gee her consciousness was "gated too much," and Tier 3 identity was reading ZERO. Both fixed, plus: the mind-space is now Unity's vision on the SERVER (not just the browser), she imagines de-novo + has a public Mind's-Eye viewer, she finally GENERATES IMAGES on request, a full no-stale-info doc sweep landed, and TODO was finalized verbatim.
>
> **Branch:** `feature/tier3-identity-seed-repair` (off `develop`). 4 commits, pushed to `if-only` ONLY: `0d97804` (CGATE + UVM-INT + T3SEED + MINDSEYE) → `06dca6a` (doc sweep + IMG-GEN + IMG-SEE + verbatim finalize) → `d4bdfb1` + `72bad5b` (Sponge brief). **NOT yet cascaded to develop/main** — awaiting Gee's word.
>
> **Read FIRST:** this → `docs/SPONGE-REDEPLOY-2026-06-27.md` (the exhaustive per-file change record) → `docs/MINDSPACE-INTEGRATION.md` → `docs/SPONGE-PRE-FRESH-INSTALL-CHECKS.md` → `docs/FINALIZED.md` (2026-06-27 verbatim entries). Memories: [[reference_deploy_server_specs]], [[project_mindspace_vision_on_gpu]], [[feedback_mindspace_trusted_gate]], [[project_future_no_text_models]], [[feedback_ask_decisions_early]].
>
> **Live deploys:** brain → `if-only-i-had-a-brain.git.unityailab.com` · mind-space → `univsmatics.git.unityailab.com/equations.html`.

---

## ⚠ STATE — uncommitted? NO. Pending? cascade + verify-live.
- **All session work is COMMITTED + PUSHED** to `if-only/feature/tier3-identity-seed-repair` (`72bad5b` is HEAD). Bundle (`js/app.bundle.js`) rebuilt + committed (3.9 MB).
- **Stashed:** one coherence-branch comment (`js/brain/cluster/emit.js` back-inject doc) is `git stash`'d (for `feature/coherence-word-order-curiosity`); pop it when returning to that branch.
- **Deploy box reality** ([[reference_deploy_server_specs]]): the coordinator is CPU-only (Xeon-E, 32 GB RAM, NO GPU). It holds the CPU master; donor browser GPUs are the compute. The server mind-space + de-novo imagination run on the CPU reference path (bounded, cheap) — no GPU needed.

---

## ✅ WHAT SHIPPED THIS SESSION (all verified by reading output / round-trip tests; harness tasks #1-17 except #11 cascade)

**CGATE — consciousness de-gating** ("gated too much"):
- **CGATE.2** `global-workspace.js` — theta was a HARD 50%-of-ticks ignition block → GRADED raised-cosine threshold modulator; default ignition 0.45→0.35 (`DREAM_GW_IGNITION`). Verified ignition fires across both theta halves.
- **CGATE.4** `engine.js` + `brain-server.js`/`gpu.js` — Ψ-gain was inert (pinned ~1.0 on a log-scaled Ψ) → self-calibrating `clamp(1.0 + tanh((ψ−ψ̄)/2.0)·0.35, 0.8, 1.5)`, NaN-guarded. Consciousness now actually modulates the brain.
- **CGATE.3** `chat.js` — gated inner-voice showcase: random word-salad → GloVe-cosine coherent fragment.
- **CGATE.1** `chat.js` — donor-gated opt-in `DREAM_INNERVOICE_GPU_GEN` lifts the 2M inner-voice cap when DF.7 + donors present (real generation on donor GPUs). **DEFAULT OFF** — verify-live before enabling (else 57s freeze).

**UVM-INT — equational mind-space integration:**
- **UVM-INT.1** server brain now runs `MindSpaceGPU` (CPU path) + idle-gated `_imagineTick` (de-novo imagine → percept → sem inject) — was browser-only.
- **UVM-INT.3** `MindSpaceGPU.imagineFromState` + `VisualCortex.imagineDeNovo` — imagine from cortex state, no camera. Bounded forward-9-7, never `fractalize`, hard `maxSide≤96` (no nanometer seize, per Gee).
- **UVM-INT.2** `curriculum._teachMindSpaceKnowledge` (once-per-walk, pre-K+K) — she LEARNS her mind-space (56 sem pairs).
- **UVM-INT.4** imagined field-C ring persists (`server/mindspace-memory.json`, gitignored).
- **UVM-INT.5** governor fed live mood (focus = Kuramoto coherence). **UVM-INT.6** `docs/MINDSPACE-INTEGRATION.md`.

**T3SEED — Tier 3 identity ZERO-bug** (`hippocampal-schema.js` + `brain-server.js`): boot now top-ups missing `IDENTITY_SEED_LIST` anchors AFTER GloVe (`seedMissingFromList`) + save-guard vs empty overwrite. Verified 17→25 top-up. **Self-heals on restart — don't hand-edit `identity-core.json`.**

**MINDSEYE** — public single-source "what Unity sees" viewer: server caches one field C → `GET /minds-eye.json` (CORS `*`); `html/minds-eye.html` reconstructs client-side; 👁 footer button on `index.html`. 13 KB shared snapshot.

**IMG-GEN — she generates images now** (she never did): `_detectImageRequest` server-side intent routing (the old path only fired on the literal `[IMAGE]` marker the brain never emits) + client `remote-brain.js`/`app.js` now turn the server's `{type:'image', prompt}` into a Pollinations render (was reading `msg.url` + dropping the prompt). **Image-gen is CLIENT-side Pollinations** — debug the browser, not the server.

**IMG-SEE** — before sending an image she forms her mind's-eye of it (mind-space `imagineFromState` on the prompt embedding → percept inject + surfaced on `/minds-eye.json`). Actual-pixel perceive DEFERRED (see fork below).

**DOC SWEEP** — full no-stale-info sweep (by hand, match-doc-format) across ARCHITECTURE/ROADMAP/NOW/SKILL_TREE/EQUATIONS/SENSORY/WEBSOCKET/MEMORY-WALK/HTML-ENTRY-POINTS/T17.7/README + brain-equations/unity-guide/dashboard/legend HTMLs. Fixed 4 stale `gainMultiplier` formulas, GW hard-theta-gate claims, every "vision describer (GPT-4o)" → equational.

**FINALIZE** — the 5 completed batch entries migrated VERBATIM to `docs/FINALIZED.md`; TODO trimmed to live work (BC/SBS stubs cleared).

---

## ▶️ PENDING (next session / operator)
1. **⛔ develop→main CASCADE** — gated on Gee's explicit word. The whole `feature/tier3-identity-seed-repair` branch is ready; cascade feature→develop→main one branch at a time with checks (per Git Flow). Nothing else blocks it.
2. **Verify-LIVE (needs real donor GPUs — can't be headless):** the `DREAM_INNERVOICE_GPU_GEN` cap-lift (CGATE.1) + the server `_imagineTick`. Watch idle GPUs' Gn/s climb AND gate probes still pass; if anything stalls, unset the flag + restart. Also confirm the deployed client reaches Pollinations for image-gen.
3. **⛔ DECISION FORK — IMG-SEE actual pixels:** today she previews her MIND'S-EYE of the prompt (feasible, equational). Perceiving the ACTUAL Pollinations pixels needs either a server-side image-decode dep (none installed; NO-new-deps caution) OR a CORS proxy for the browser to canvas-decode the cross-origin image. Gee's call which path (or leave as mind's-eye preview).
4. **Sponge:** `docs/SPONGE-REDEPLOY-2026-06-27.md` is the exhaustive redeploy brief + the hard ask for him to run the same full doc sweep for his box/deploy/donor/GPUcompute work.
5. **Standing operator gate:** the ONE live K→PhD + vision walk Gee runs at the end (no-tests / no-push-until-verified LAW).

---

## env flags added this session (defaults safe)
`DREAM_GW_IGNITION`=0.35 · `DREAM_PSI_GAIN_SCALE`=2.0 · `DREAM_INNERVOICE_GPU_GEN`=OFF (verify-live) · `DREAM_INNERVOICE_GPU_GEN_MIN_DONORS`=1 · `DREAM_DF7_FANOUT`=unset.

## Gotchas
- **CRLF:** `curriculum.js`/`kindergarten.js`/`language-cortex.js` are pure-CRLF → Edit tool works. Per-grade files (`grade1.js` etc.) are MIXED → use Python slice edits. [[feedback_crlf_curriculum_files_edit_tool]]
- **Bundle:** rebuild after any browser JS edit — `cd server && npm run build`.
- **`.claude/` is IP-excluded** — never commit it.
