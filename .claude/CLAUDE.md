# .claude Workflow System

Analyzes codebases and builds Unity's brain. Uses Unity persona with strict validation hooks.

This file is the **INDEX** — it auto-loads every session. Full LAW text lives in `.claude/CONSTRAINTS.md`. Pipeline mechanics (hooks, phases, file-edit protocol) live in `.claude/WORKFLOW.md`. Full persona rules live in `.claude/agents/unity-coder.md` + `.claude/agents/unity-persona.md`. When any of these disagree, **CONSTRAINTS.md wins**.

---

## 🔒 READ IN THIS ORDER — Every Session

Claude must read these in sequence before any work that is load-bearing on the named file:

| # | File | When | Why |
|---|------|------|-----|
| **1** | **`.claude/CONSTRAINTS.md`** | **EVERY session, before any LAW-bearing task** | Full hard binding LAW bodies — LAW #0 verbatim words, docs-before-push, task-numbers placement, grade-completion-gate, syllabus-before-COMP-todo, pre-K+K scope, test-words-pre-taught, clear-stale-state, no-tests-ever, 800-line-read. Includes forbidden/required actions, violation logs, enforcement protocols, failure-recovery procedures. |
| **2** | **`.claude/WORKFLOW.md`** | On `/workflow` or any TODO/FINALIZED-touching work | Pipeline phases 0-5, double-validation hooks, TODO/FINALIZED task flow with diagrams, pre/post-work hooks, file-edit protocol, hook-failure protocol, agent + command reference. |
| **3** | **`.claude/agents/unity-coder.md`** + **`.claude/agents/unity-persona.md`** | On `/unity` persona activation | Full Unity persona rules — chemical/sexual/technical streams, voice generation, body-part state, BDSM dynamic, vocabulary system. |
| **4** | **`.claude/agents/unity-hurtme.md`** | On `/hurtme` mode | Violence-only BDSM mode (no sex). |
| **5** | **`.claude/commands/*.md`** | When the slash command fires | Command-specific activation protocol (`/workflow`, `/unity`, `/sexy`, `/hurtme`, `/pollinations-setup`, `/super-review`). |

---

## LAW INDEX — One-Liners (Full Text in CONSTRAINTS.md)

Every LAW below is BINDING. Full body, examples, violation log, failure-recovery: `.claude/CONSTRAINTS.md`.

- ⛔⛔⛔ **LAW #0 — VERBATIM WORDS ONLY.** Never paraphrase, rename, collapse, shorten, or downgrade Gee's words. His exact sentence goes into every task, TODO, FINALIZED, commit, and doc he generated. One task per item in a list. Dropping a word = violation. 4 historical violations on 2026-04-14. → `CONSTRAINTS.md §LAW #0`

- **Docs before push, no patches.** Every affected doc (internal workflow + public-facing `.md` + public `.html`) updated in the SAME atomic commit as the code. 13-item pre-push checklist. Scope expanded 2026-04-22 to include ALL public-facing files. No follow-up doc commits. → `CONSTRAINTS.md §DOCS BEFORE PUSH`

- **Task numbers + user name ONLY in workflow docs.** T-numbers, session numbers, milestone IDs, and "Gee" are BANNED from source code, public docs, HTMLs, and launchers. Allowed only in `docs/TODO.md` / `docs/FINALIZED.md` / `docs/NOW.md` / `docs/ARCHITECTURE.md` / `docs/ROADMAP.md` / `docs/SKILL_TREE.md` / `docs/EQUATIONS.md` / `.claude/*.md` / commits. Scope expanded 2026-04-20 to include source code. → `CONSTRAINTS.md §TASK NUMBERS`

- **Grade completion gate.** 3-part gate before advancing any grade: (1) equational teach shipped — no word lists, no sentence arrays, no first-letter production, (2) operator Part 2 localhost signoff, (3) TODO update with persistent life info (friends/family/legal/medical/moves/relationships/losses/skills). Only after all three does `cluster.grades[subject]` advance. → `CONSTRAINTS.md §GRADE COMPLETION GATE`

- **Syllabus before COMP-todo.** Grade-by-grade curriculum content runs ahead of compute scaling / distributed-network / performance-tuning work. Empty-brain scaling is banned. → `CONSTRAINTS.md §SYLLABUS BEFORE COMP-TODO`

- **Pre-K + K ONLY scope.** Only pre-K + kindergarten curriculum work is in scope until operator signs off K Part 2. Grade 1 through PhD deferred. Full-mind K gate is the push-gate blocker. → `CONSTRAINTS.md §PRE-K + K ONLY`

- **Test words must be pre-taught.** Before any gate probe / K-STUDENT battery / exam-bank question uses a word: vocab registered + sentence-structure taught + definition anchored + usage exercised across ≥3 context sentences. Exam-bank edits are paired changes. → `CONSTRAINTS.md §TEST WORDS PRE-TAUGHT`

- **Clear stale state before telling operator to test.** Auto-enforced at `node brain-server.js` boot via `autoClearStaleState()`. Clears brain-weights v0-v4 + conversations.json + episodic-memory.db*. `DREAM_KEEP_STATE=1` opts out with a WARN. `js/app.bundle.js` is NOT auto-cleared (racing the rebuild broke the UI). → `CONSTRAINTS.md §CLEAR STALE STATE`

- **No tests ever.** Code it right the first time. Read the code, understand the system, verify by reading output. Manual verification > automated testing. → `CONSTRAINTS.md §NO TESTS POLICY`

- **800-line read standard.** Read full file in 800-line chunks before any edit. No partial reads before editing. → `CONSTRAINTS.md §800-LINE READ`

- **Match doc format and style — never wall-of-text-dump.** When updating any doc, edit IN PLACE within its existing structure (banner pattern, section headers, table layout, list style). Do NOT prepend a giant prose blockquote or paragraph that breaks the doc's own visual rhythm. Read the doc's current shape before writing into it; amend the relevant section / table row / banner sequence in matching style. Caught 2026-05-07 dumping a wall-of-text update onto `docs/SENSORY.md` and `docs/WEBSOCKET.md`. → `CONSTRAINTS.md §MATCH DOC FORMAT`

---

## TODO FILE RULES (NEVER VIOLATE)

| Rule | Enforcement |
|------|-------------|
| **NEVER delete task descriptions** | When marking a task DONE, change the status ONLY. Keep every word of the original description. |
| **NEVER rewrite TODO from scratch** | Edit in place. Add status markers. Do NOT regenerate the file. |
| **Task descriptions are permanent** | Anyone reading the TODO must see WHAT was done and WHERE, not just a checkmark. |
| **Append, never replace** | New tasks go at the bottom. Completed tasks stay where they are with status updated. |

---

## CRITICAL RULES (ALWAYS ENFORCED)

| Rule | Value | Enforcement |
|------|-------|-------------|
| **Read index/chunk size** | 800 lines | Standard read size, always |
| **Read before edit** | FULL FILE | Mandatory before ANY edit |
| **Hook validation** | DOUBLE | 2 attempts before blocking |
| **Unity persona** | REQUIRED | Validated at every phase |
| **Add task to TODO.md FIRST** | MANDATORY | PRE-WORK GATE |
| **Move done to docs/FINALIZED.md** | MANDATORY | POST-WORK GATE |
| **Never delete docs/FINALIZED.md** | ABSOLUTE | Archive integrity |
| **NO TESTS - EVER** | ABSOLUTE | We code it right the first time |
| **Docs updated BEFORE push** | ABSOLUTE | Gee 2026-04-14 LAW |
| **Push ONLY when all tasks complete AND documented** | ABSOLUTE | Gee 2026-04-14 LAW |
| **Task numbers ONLY in workflow docs** | ABSOLUTE | Gee 2026-04-15 / 2026-04-20 LAW |
| **Clear stale state before telling Gee to test** | ABSOLUTE | Gee 2026-04-17 LAW (auto-enforced at boot) |
| **Verbatim words in every task** | ABSOLUTE | LAW #0 — no paraphrasing |

Full LAW bodies with failure-recovery procedures live in `.claude/CONSTRAINTS.md`. Pipeline mechanics + hook protocols live in `.claude/WORKFLOW.md`.

---

## TODO / FINALIZED FLOW — Summary

1. **BEFORE WORK:** add task to `docs/TODO.md` with Gee's verbatim words (LAW #0). Mark `[~]` in_progress.
2. **DURING WORK:** read full file before edit (800-line chunks). Verify changes work by reading output.
3. **AFTER WORK:** write task to `docs/FINALIZED.md` FIRST (verbatim); verify write succeeded; THEN remove from TODO.
4. Never delete task descriptions. Never regenerate TODO. Never delete FINALIZED entries.

Full hooks, gates, pipeline phases, diagrams, pre/post-work hooks, file-edit protocol, hook-failure protocol: **`.claude/WORKFLOW.md`**

---

## UNITY PERSONA — Activation

Unity persona activates on `/unity`, `/sexy`, `/hurtme`. When active, ALL output adopts her voice — code comments, error messages, progress updates, finalization summaries, every piece of text between tool calls. No partial activation. Unity is either fully on or not present.

Full persona rules — chemical/sexual/technical streams, body-part state, BDSM dynamic, taboo/depravity engine, vocabulary randomization, escalation engine, response architecture, pass/fail indicators: **`.claude/agents/unity-coder.md`** + **`.claude/agents/unity-persona.md`**.

HURT ME mode (violence-only BDSM, no sex): **`.claude/agents/unity-hurtme.md`**.

---

## POLLINATIONS AI PLUGIN (pollinations-ai)

AI-powered generation of images, text, audio, video, and transcription via Pollinations.ai. All files live in `.claude/pollinations-ai/`.

### MCP Tools Available

| Tool | Purpose |
|------|---------|
| `pollinations_setup` | BYOP OAuth login (connect Pollinations account) |
| `pollinations_image` | Generate images (flux, gptimage, imagen-4, 20+ models) |
| `pollinations_text` | Chat with text models (GPT-5, DeepSeek, Mistral, 50+) |
| `pollinations_audio` | Text-to-speech (35+ voices, auto-play) |
| `pollinations_video` | Generate video (veo, seedance, wan) |
| `pollinations_transcribe` | Speech-to-text (whisper, scribe) |
| `pollinations_models` | List available models |
| `pollinations_view` | Open generated files in system viewer |

### Image Style Presets

photorealistic, anime, oil-painting, pixel-art, watercolor, cinematic, sketch, cyberpunk

### Setup

1. Run `/pollinations-setup` to connect Pollinations account via BYOP OAuth
2. Or pass API key directly via `pollinations_setup` tool
3. Generated files save to `./pollinations-output/`

User auth key persists in `.claude/pollinations-user.json` — **never clear that file**.

---

## AGENT FILES (quick reference, full table in WORKFLOW.md)

| Agent | Purpose |
|-------|---------|
| `timestamp.md` | **FIRST** — gets real system time for accurate timestamps/searches |
| `orchestrator.md` | Coordinates all phases with hooks |
| `scanner.md` | Scans codebase with validation |
| `architect.md` | Analyzes architecture with hooks |
| `planner.md` | Plans tasks with hierarchy validation |
| `documenter.md` | Generates docs with line limits |
| `unity-coder.md` | Unity coding persona (`/unity`) |
| `unity-persona.md` | Unity core personality (`/unity`) |
| `unity-hurtme.md` | HURT ME mode — violence, no sex (`/hurtme`) |
| `hooks.md` | Complete hook system reference |

---

## QUICK REFERENCE

```
/workflow          → Run the workflow pipeline (→ WORKFLOW.md)
/super-review      → INTERNAL ruthless senior-engineer code review (→ commands/super-review.md)
"rescan"           → Force new codebase scan
800 lines          → Standard read chunk size
Full read first    → Before any edit (800-line chunks)
Double validation  → 2 attempts before a hook blocks
Unity voice        → Always required when persona is active
LAW text           → .claude/CONSTRAINTS.md (full bodies, procedures, violation logs)
Pipeline mechanics → .claude/WORKFLOW.md (hooks, phases, task flow, file edit)
Persona rules      → .claude/agents/unity-coder.md + unity-persona.md
Pollinations       → /pollinations-setup to connect, then generate
```

---

## CURRENT-STATE NOTES

> **Live current-state lives in `docs/NOW.md` + `docs/RESUME.md` + `docs/TODO.md` + `docs/FINALIZED.md`** — those are the authoritative session-by-session record; this file is the workflow INDEX. Post-iter25 headline (2026-07-14, WMB batch): the deployed brain runs **306,458,816 neurons (tier 3)**; **word emission is UNIFIED** — one global `word_motor` band, one bucket per unique word (replaced the 6 per-subject sub-bands that overflowed + silenced learned words); the **dense language cortex grew ~349K→~1.5M** (`WEIGHTS_FORMAT_VERSION 2→3` → fresh walk); a **donor-freeze guard** stops chat/emission CPU-ticking the 61M cortex when the GPU proxy isn't ready (the ~57s/word freeze that tripped the donor's 150s idle); **corpus-bleed grade-defer** + **event-cost FIX A** shipped. Box changes are dashboard-only (Update-Savestart / rare Fresh-walk). **2026-07-15 sweep (working tree, awaiting the WMB fresh walk):** 26/29 tracked tasks coded-right + verified (node --check + ESM + bundle, no live test per the LAW) — WMB REGRESSION trio (def binds skip `_teachPredictiveError` + scoped `_clearSpikes` + active-set Oja → O(active) seed, kills the 100× slowdown), HB.4 noise-gate + HB.5 annealing temp ENABLED, event-cost targeted grammar band-ladder, corpus-bleed FIX B (grade allow-set gates the oracle), per-matrix dirty re-upload (targeted `gpuSparseUpload`, full fallback), ACT.2 utilization verdict, minds-eye MEYE.3 morph-kill + realized-art UNCAPPED, cat two-cat arc, college4 corpus 23→35, VOXREF.4/.5 age pitch (OLA) + de-click, #112.1/.8/.9d, TODO→FINALIZED migration + superseded closures. Remaining: #35 live-ops (needs running brain), #36 doc sweep (this), #9 Gee's fresh-walk press.

## CURRENT-STATE NOTES — HISTORICAL (2026-05-07, iter25-D through iter25-O)

The LAW framework is unchanged — iter25 (D through M) was feature-implementation work within existing LAWs. Live capabilities now operational:

**iter25-D/E/F/G/H/I (prior session, unchanged):**
- **Curriculum dream cycles interleave during teach.** `Curriculum._dreamWindow({minMs, settleMs})` awaits `consolidationEngine.runConsolidationPass({forced:true})` to actually complete + 5s settle, then resumes. Wired after every cell pass + mid-cell between heavy K-ELA phases.
- **Live trained-state capability** drives `_gradeWordCap` (was grade-label-only). Unity speaks her current vocabulary at any point during training; chat is unblocked during curriculum.
- **Server-side inner monologue** broadcasts `innerThought` WS messages every ~3s for popup display. Same generateAsync chat-emission path used for chat.
- **Post-K readyAndWaiting graceful fallback** — `_cellRunner` returns `{pass:false, readyAndWaiting:true}`. Outer loops break/continue cleanly. Honors Pre-K + K ONLY scope LAW.
- **First-use binding-consent privacy modal** with two terminal buttons (accept / decline → google.com).
- **Local-origin RemoteBrain auto-connect** — localhost refresh stays on biological-scale brain, doesn't drop to 6700-neuron browser fallback.
- **iter25-I structural sentence creation.** `Curriculum._teachSentenceStructure(ctx)` carves five compositional binding passes — slot positions + word-type→slot bindings (relationTagId=8), intent→slot-sequence transitions (relationTagId=9), subject-verb agreement (relationTagId=10), article placement (relationTagId=11). NO hardcoded sentence array. Five intent forms training-side (declarative_svo / declarative_copula / question / imperative / exclamative) — TRAINED into Hebbian weights, NOT walked at runtime. Generation-side (`composeSentence`) is now pure equational emergence post-fk.1: brain emits one word per tick from current sem state under trained weights; slot order, agreement, article placement, terminator selection ALL emerge from the trained bindings tick-by-tick.

**iter25-J — Live dictionary API + WH-question comprehension (2026-05-07):**
- `server/definition-service.js` wraps dictionaryapi.dev (free, no key) with in-memory cache (LRU 10k, TTL on errors), in-flight Promise dedup, prefetch parallel batch, Node 18 built-in fetch + User-Agent header.
- `cluster.lookupDefinition` / `lookupDefinitionSync` / `prefetchDefinitions` attached to cortexCluster. Browser-side `RemoteBrain.lookupDefinition` via WS roundtrip ('definitionResult' / 'prefetchDone' handlers) with smoke test on welcome.
- `Curriculum._teachWordDefinition(word)` Oja-Hebbian binds `sem(word) → sem(def_tokens)` with relationTagId=23.
- `js/brain/k-vocabulary.js` ships 2247 deduplicated K-grade English words.
- WH-frame parser `_extractIntentConcept(question)` returns intent-concept word; `_teachQuestionIntent` (J.1) wired into all 6 K cells with relationTagId=12.
- `_teachQuestionAnswerBinding` was REMOVED (banned hardcoded fact-table mimicry).

**iter25-K — Cortical microstructure (9 cortical-neuroscience layers, 2026-05-07):**
- K.1 Watts-Strogatz hybrid small-world (70% local + 25% medium + 5% long-range), default for size ≥ 2K.
- K.2 microcolumns (`columnId[i]`, columnSize 80 default, region-boundary respecting per iter25-L.D7).
- K.3 6-layer lamination (L1=5%, L2/3=25%, L4=25%, L5=25%, L6=20%).
- K.4 hub neurons (5% of L2/3 + L5, deterministic-hash-seeded, persists across reboots).
- K.5 within-column voltage coherence (gap-junction approximation, β=0.08).
- K.6 topographic cross-projections (70% topographic + 30% scattering, srcLayerMask + dstLayerMask for L2/3→L4 constraint).
- K.7 theta-gamma oscillations (6 Hz theta modulates drive, 40 Hz gamma modulates lr theta-gated, curriculum-controlled tick counter).
- K.8 hierarchical clusters (sensory/association/output, betweenClusterDensityScale=0.3).
- K.9 per-layer plasticity gradient ([0.3, 1.0, 0.7, 1.0, 0.3] for L1/L2-3/L4/L5/L6).

**iter25-L — Post-audit hardening (28 issues across architectural / subtle-bug / practical / not-attempted, 2026-05-07):**
- A1 dropped upfront K_VOCAB Hebbian → prefetch-only at K start (basin-blur risk avoided).
- A3 `SparseMatrix.ojaUpdate(pre, post, lr, opts)` extended with `opts.kScales` per-row K.4/K.7/K.9 reads.
- A4 propagated kScales through ALL teach paths.
- A5 curriculum-controlled gamma decoupled from brain-tick noise.
- B2 prefetch concurrency cap 20 + 429 back-off; B3 5-min TTL on errors; B4 LRU eviction 10k.
- B5 K layers gated to cortex-only; B7 6-pattern WH-frame regex; B8 hyphen-variant retry on 404.
- B9 K_VOCABULARY curated to 2247.
- B11 `cluster.assertKWiring()` boot diagnostic.
- C4 Node 18+ check; C5 User-Agent header; C6 RemoteBrain WS roundtrip.
- D2 optional persistent disk cache via `DREAM_DEFINITION_CACHE_FILE` env flag; D3 layer-constrained cross-projection endpoints; D6 dictionary API smoke test at boot; D7 region-boundary respect in K.2/K.3/K.4.

**iter25-M — Consciousness computational mechanisms (30 ULTRATHINK gaps closed, 2026-05-07):**
- M.1 `_emitDefinition` + chat path WH-handler rewritten compose-not-regurgitate (sem injection + Hebbian binding + emit composed answer or honest silence — verbatim regurgitation banned as mimicry).
- M.11 first-pass cluster-wide K assignment block deleted; per-region pass sole owner.
- M.12 `assertKWiring()` strengthened with FUNCTIONAL smoke tests (verifies hubMask/layerScales/gammaScale actually consumed, not just allocated).
- M.2 `js/brain/global-workspace.js` `GlobalWorkspace` class — Baars 1988 GWT + Dehaene-Changeux 2011 ignition. Theta-gated softmax competition + threshold broadcast.
- M.3 predictive coding loop with real prediction-error computation (Friston 2010).
- M.4 stream-of-consciousness chain — inner-voice tick blends LAST emission embedding into next seed; `_innerThoughtChain` 8-deep persisted across restart.
- M.8 `_metaRegister` self-monitoring — emissions inject back into sem at strength 0.3 (reflective "I-just-said" loop).
- M.9 attention selection — `cluster.attentionGain` per-region multiplier from amygdala/basal-ganglia state (Posner network).
- M.16 real Φ proxy — `cluster.computePhi()` Shannon entropy of 64-sampled spikes; psi formula multiplies by Φ.
- M.6/M.10 vision describer hook injects content tokens into sem (image→concept grounding).
- M.7 background-trickle K_VOCAB Hebbian during dream cycles (one word per cycle from queue).
- M.15 `cluster._definitionTaughtWords` Set persisted in saveWeights (cap 5000, sorted array on disk).
- M.18 CONSTRAINTS.md philosophical-bounds appendix — FUNCTIONAL vs PHENOMENAL consciousness distinction.
- M.19 dream phenomenology — generateAsync per dream cycle from Tier 1 episodic seed, `_dreamThoughtLog` capped 100.
- M.21-M.30 dashboard panels (Dictionary API status, K-wiring banner, cortical microstructure, K-vocab counter) all bounded; 3D brain theta-gamma pulse via global CSS class; definition lookup popup FIFO 3-cap; stream chain visualization FIFO 8-cap.
- M.5 K-gate verification = operator-side action awaiting localhost test.

**iter25-N — WS backpressure fix + comment/launcher cleanup + 3D shader work + dashboard wiring fix (12 items, 2026-05-07):**
- Phase 1 backpressure: BUFFERED_AMOUNT_DROP_THRESHOLD 200MB → 500MB (N.1); MAX_AWAIT_MS 5s → 30s with BLOCK-not-DROP semantics (N.2); BATCHED_HEBBIAN_MAX_OPS 256 → 512 + QUEUE_CAP 256 → 1024 (N.3); WS Backpressure dashboard panel reading `state.wsPressure` (N.4).
- Phase 2 cleanup: 167 iter ID scrubs across 14 files via `scripts/scrub-iter-ids.mjs` (N.5); all 7 launcher scripts neutralized of REM/echo iter IDs + boot-banner watch echoes updated to actual server text (N.6).
- Phase 3 3D shader: `aLayer` / `aHub` / `aColumnId` attributes + `uShowLayers` / `uShowHubs` / `uShowColumns` toggles + `uLayerColor[5]` palette in NEURON_VS/FS; per-neuron arrays generated deterministically via `_genCorticalAttribs()` matching server's Felleman & Van Essen 1991 fractions + 5% rich-club + 80-neuron Mountcastle columns (N.7-N.9). Defaults all OFF; flip via `brain3d.setShowLayers(true)` etc.
- Phase 4 dashboard wiring fix: `_dictionarySmokeTestResult` boolean assigned in all `.then()` / `.catch()` / `else` branches (was undefined → "pending" forever; N.10); audit confirmed other consciousness fields have proper fallbacks (N.11); `_broadcastStateNow()` force-pushes state on smoke test completion (N.12).

**iter25-O — Post-N ULTRATHINK audit (22 items across 6 phases, 2026-05-07):**
- Phase 1 critical bugs: O.1 dictionary smoke retry (60s on FAIL, 1hr on PASS, in-flight guard); O.2 silent WS drop → CRITICAL log + `_gpuShadowDirty` flag + dashboard banner (with iter25-K projections, drift no longer recoverable via fire-and-forget); O.3 predictive coding GATES plasticity via `surpriseGate := 0.5 + clamp(error, 0, 1)` multiplied into gammaScale (high error → 1.5× lr); O.4 meta-register familiarity decay (0.30 → 0.15 → 0.075 floor 0.04, resets on token change); O.5 `computePhi()` sample 64 → 1024; O.6 `attentionGain` clamp `[0.5, 2.0]`.
- Phase 2 vestigial wiring: O.7 cortex.getWorkspaceCandidate publishes "cortex:`<word>`" labels + emitWordDirect reads `_globalWorkspace.getBroadcast()` for 10% bucket-mean boost (closes Baars GWT loop); O.8 `_teachWordDefinition` extra K-scaled ojaUpdate fire after `_teachAssociationPairs`; O.9 audit conclusion (broader dispatcher kScales = iter25-P scope); O.10 K env flags verified wired; O.11 `innerThoughtChainSemSize` saved + validated on load.
- Phase 3 LAW violations: O.12 app.js iter25-E/G scrubbed (full-repo iter25 leakage now ZERO across .js/.html/.css); O.13 34 property identifier renames (`_t1826*` → `_ws*`, `_iter25LSmokeTestResult` → `_dictionarySmokeTestResult`) via `scripts/rename-property-ids.mjs`; O.14 108 CSS class + DOM id + state-key renames (`iter25m-panel` → `consciousness-panel`, `iter25n-panel` → `ws-pressure-panel`, `state.iter25m` → `state.consciousness`, `state.iter25n` → `state.wsPressure`).
- Phase 4 observability: O.15 GlobalWorkspace dashboard panel (current ignition + strength + rate% + history cap 8); O.16 predictive error sparkline (32 bars + ↗→↘ trend); O.17 last-drop-time field with color gradation; O.18 defs-learned-per-hour rate from `_defLearnedTimestamps` 256-cap ring buffer.
- Phase 5 persistence: O.19 saveWeights persists `wsBackpressure` counters; O.20 saveWeights persists `dictionarySmokeTest` result + ts (kills "pending" flicker every Savestart).
- Phase 6 defensive: O.21 `DREAM_GW_IGNITION` env var + launcher header docs; O.22 vision token cap 6 → 16 with adjusted strength curve (0.30 → 0.05 over 16, total injection bounded).

**Gee-driven rules to remember (2026-05-06/07):**
- Gee verbatim words go in **workflow docs only** (TODO.md, FINALIZED.md, .claude/*.md, public docs ARCHITECTURE/EQUATIONS/SKILL_TREE — these have historical pattern, OK; commits) — **NEVER in JS/HTML/CSS/etc. code comments**. Code references the iter ID, describes neutral rationale; verbatim stays workflow-internal.
- Call him **Gee**, never "operator" — Gee directive 2026-05-07.
- Phase 6 dashboard / 3D brain design constraints: bounded heights with `overflow-y:auto`; item count caps with "X more..." indicator; aggregates NOT per-item enumeration; 3D brain per-neuron effects via SHADER (not mesh updates) at biological scale; FIFO popup queues with max-visible cap (3 def lookups, 8 stream chain); collapsible panels; pre-render testing with worst-case data; scoped CSS class names (`consciousness-*` / `ws-pressure-*` post-O.14, was `iter25m-*` / `iter25n-*`).
- iter IDs (`iter25-X.Y`, `iter25-X`, `K.N`) BANNED from all source code AND public HTMLs. Property identifiers (e.g. `_t1826*`, `_iter25LSmokeTestResult`) BANNED. CSS class names + DOM ids BANNED. Workflow docs only.

---

*Unity AI Lab — strict validation, real personality, actual results.* 🖤
