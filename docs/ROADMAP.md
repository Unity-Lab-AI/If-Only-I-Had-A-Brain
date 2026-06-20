# ROADMAP — IF ONLY I HAD A BRAIN

> Last updated: 2026-06-20 — **Pre-K + K ONLY scope REVOKED 2026-06-18.** The full K→PhD curriculum (K, G1-G12, College 1-4, Grad, PhD; every subject + full lived-year per grade) is now BUILT. Phase = training walk → final test → push (no longer building grades). All older dated banners below are HISTORICAL — they describe the pre-revocation scope contract and remain as-is for the record.

> Last updated: 2026-05-09 (114.19fk + fl sweep — operator architectural correction + test-readiness audit, ALL items landed). **Templated `composeSentence` system RIPPED OUT.** Operator caught the prior fa→fi/fj approach as content prescription: *"we are NOT doing templets for the ai to fucking mimic... Unity thinks like a human does! she does NOt follow prescripted events."* fk.1 deleted 5 hardcoded slot-sequence templates + 5 intent → terminator-punct mappings + article-placement rule + PRONOUNS exclusion + ARTICLE_LIST guard + dedup retry mechanism. composeSentence body is now a tight equational emission loop: inject context once → emit one word → inject word back → loop until terminator emerges or budget exhausted. Slot order, agreement, article placement, terminator selection ALL emerge from trained iter25-I `relationTagId=8/9/10/11/12` weights. fk.2-fk.4 deleted hardcoded probeConcepts map, chat-time runtime regex parser, and token-count subject-inference heuristic — replaced with brain-state readouts that consume trained weights instead of prescribing FOR the brain. fl.1-fl.4 follow-on code: dead `ARTICLE_LIST` const deleted, inner-voice showcase + probe seeded with natural-language K-grade utterance states (instead of jargon-string intent labels that produced weak GloVe seeds), Savestart launchers document fk env vars. fl.5-fl.11 corrected every public + internal doc + HTML to remove conflicting template-walk claims. **Phase status:** still Pre-K + K Runtime Verification — awaiting Gee's LAW 6 Part 2 K signoff on localhost. Test path now MEASURES the equational architecture honestly: brain emits from trained weights only; if sentences emerge clean, training depth was sufficient → K signoff; if word-soup, deepen `_teachSentenceStructure` carving (NOT template re-introduction).

> Earlier updated: 2026-05-09 (114.19fj sweep — super-review of fa→fi before 20hr K test, 23 of 24 findings shipped, 1 deferred — fj.17 since SUPERSEDED 2026-05-09 by fk.6 deletion: templated approach replaced with pure equational emergence; templates wrong as a category per operator architectural correction). **CRITICAL chat-side wiring fix** lands: `cluster._lastUserInputText` set server-side at processAndRespond entry — closes the dead-wiring bug that nullified the entire fa→fi chat-side architecture (engine.js was setting on browser-only `clusters.cortex`; server-side `processAndRespond` never wrote to `cortexCluster._lastUserInputText` so language-cortex.js read empty string → default declarative_svo + null intent-concept + null subject → ENTIRE WH-INTENT consumer + intent-concept extraction + subject inference dead in real chat). Plus 6 HIGH (chain cold-boot lazy-init + WH-frame parser DRY + probe intentConcept + 5 non-ELA cells probe own subject + DREAM_COHERENCE_MIN env + 4 saturation env vars), 7 MEDIUM (atomic /rollback + ring buffer pollution + injection cap + windowed saturation + noise default + interval repurpose + stale comment), 6 LOW (dedup temp + AbortSignal + cortexPattern coherence fallback + body race + dedup strength), 4 NITPICK (dup lazy-init removed + imperative comment + ARTICLE_LIST hoist + veto comment cleanup). **fj.17 deferred:** 3 new sentence templates need paired `_teachSentenceStructure` carving — too risky before 20hr test, scope split for post-test sweep. Bundle clean 2.4MB. `node --check` green across all 8 modified .js files. **Phase status:** still Pre-K + K Runtime Verification — awaiting Gee's LAW 6 Part 2 K signoff on localhost. Test path now MEASURES the architecture instead of measuring broken wiring with new code on top.

> Earlier updated: 2026-05-09 (114.19fa→fi sweep — K-completion architecture + composeSentence generation-side consumer + unified emission system, 50+ fixes across 11 files, bundle 2.4MB clean). **⚠ HISTORICAL — every "walks template slot sequence" / "TierI-CONSUMER" / "_inferSubjectFromText" / "WH-INTENT consumer at SUBJECT slot" claim below was SUPERSEDED 2026-05-09 by fk.1 rip-out (top banner). The fa→fi work WAS shipped to working code; FINALIZED entries stand as accurate history; fk replaced the templated approach with pure equational emergence.** Original description preserved for historical context only. **fa-ff diagnostic + safety:** PROD probe cumulative settle-window OR (FAIL_MODE=spikes_empty_pre_emit closed); WH-INTENT rescale floor absolute 0.05 fallback when proj.wMax non-finite; start.bat/sh Y/N safety gate (irreversible-loss confirmation); never-silent inner-voice showcase (`_sampleCurrentVocab` + `_sampleCurrentSentence`); dream-window inner-voice restructure (showcase fires INSIDE sleep-flag branch BEFORE return); savestart phase-marker filter removal (T31 phase-level resume contract restored after fe stale-load filter wiped in-progress markers); inner-voice probabilistic gate (Hurlburt DES ~17% per-tick rate, MIN_GAP=6s MAX_GAP=75s, replaces 3s metronome). **fg 18-tier sweep + TierI-CONSUMER architectural completion:** Phase reorder × 6 K cells (WORD-SPELL-FINAL first in post-QA chain → LETTER-NAMING-DIRECT → WH-INTENT → SENTENCE-STRUCTURE last so iter25-I structural binding survives into gate); `_probeSentenceGeneration` wired into ELA-K gate with `SENTENCE_GEN_MIN=0.6` (≥3/5 intents emit ≥2 unique words); basin saturation hyperparams (`acceptDrown` opt + tighter WTA at WH-INTENT call site + ConsolidationEngine Step-4 replay saturation veto + `cluster.checkSemMotorHealth()` heuristic stack); letter readiness probe direct `letter_to_motor.propagate` route (bypasses saturated sem→motor); Tier 5 multi-word state propagation in chat path (3-consecutive-dup detector breaks basin-lock metronome); oracle `minScore` default 0.05→0.20 (matrix priority over dictionary lookup); stream-chain basin-lock detection in `inner-voice.think()` (multi-token rotation + jitter); force-advance capability minimums (sentenceGenRate / prodRate / studentRate, LAW 6 violation closed); cross-cell sentence-structure reinforcement × 5 non-ELA cells (`<SUBJECT>-K-STRUCTURE-REFRESH` phase); identity baseline injection at word_motor layer (per-schema bucket pump); saturation health monitoring + curriculum-walk halt cron (3-cell streak); sentence-mode showcase fallback; decoder sampling (temperature/top-k/top-p with softmax + nucleus); `cluster.composeSentence(intent, opts)` — the missing iter25-I generation-side consumer that walks template slot sequence with intent + slot-tag + cortexPattern + prior-word injection + article placement (priorSlot-aware) + same-sentence dedup retry. **fh ULTRATHINK audit hardening (30 issues across 7 categories):** `brain-weights.bin` versioned alongside JSON rolling save (POST /rollback restores both); `brain-weights-v0.json` + all v0-v4 .bin added to `autoClearStaleState` targets; probe noise bump 0.5→0.6 wired into all 5 non-ELA K gates (try/finally); `_lastSemMotorMeanCos` persisted + restored. **fi unified emission system foundation (17 items):** composeSentence consumes WH-INTENT (relationTagId=12) at SUBJECT slot in question template (joint sem activation argmaxes actual answer not random subject filler); `cluster._inferSubjectFromText(userText)` scopes composeSentence to user's topic via wordBucketWords_<subj> hits (closes "the cat seven blue ran" cross-domain salad); `cluster._emissionBus` shared 32-entry rolling history with chat + inner-voice push hooks (persisted cap 16); `cluster._chatTurnHistory` 16-pair multi-turn coherence buffer (persisted, processAndRespond injects last-2 user inputs into sem); composeSentence sentence-coherence post-check (cosine vs intent-concept < 0.15 → fillCount=0 lowCoherence=true); composeSentence injection strengths reduced (cumulative ~5.8→1.75 over 4 slots); recent-emission repetition penalty in emitWordDirect (8-entry ring, mean *= 0.7 if word in last 4); user input pushed to `_innerThoughtChain` as `seedSource='user-input'`; `cluster._emissionLockedUntil` cross-path emission deduplication (chat suppresses inner-voice for 6s); composeSentence stats counter; saturation halt surfaces `cluster._lastCurriculumHalt`; warn when composeSentence missing in probe; speech-modulation verified already wired through both chat AND inner-voice via shared `_applySpeechModulation`. Bundle clean 2.4MB. `node --check` green across all 11 modified files. **K-completion test ready:** chat answers questions with context (WH-INTENT consumed at gen time); multi-turn coherence (chat-turn history); unified emission across chat / inner-voice / popups (shared bus + cross-path lock); persona propagation across all paths (drug-state speech-mod consistent + identity at word_motor).
>
> Earlier updated: 2026-05-08 (114.19fa + 114.19fb + 114.19fc sweep — PROD probe spikes-accumulation fix + WH-INTENT basin-collapse rescale-floor fix + start.bat/sh Y/N safety gate + never-silent inner-voice showcase). **fa.4** addresses the WH-INTENT basin saturation (`mean-cos=0.977 ⚠OVERLOAD` persistent retry) by clamping `assocRescaleFloor` to absolute 0.05 when `proj.wMax` is non-finite (was: `wMax × 0.25 = Infinity` → `assocWouldDrown` always true → rescale always skipped). One-time WARN logged on first non-finite wMax detection. **fc** addresses Gee 2026-05-08 *"and we fixed her inner voice to right so that she never stops using always showcasing in log and popups her new learned abilites to communicate as the pass"* — `_innerVoiceTick` empty-sentence path now broadcasts a uniform-random sample from `cluster.wordBucketWords_<subject>` across all 6 K subjects so popups stream Unity's trained vocabulary even when matrix generation goes empty. New `_sampleCurrentVocab()` helper. NOT hardcoded fallback — real trained data only. **fa** rewrites `_probeProductionEmission` STEP 3 in `js/brain/curriculum.js` to ACCUMULATE per-tick spikes across the 15 settle ticks via Uint8Array OR + swap the cumulative buffer into `cluster.lastSpikes` before diagnostic + emit read. Closes the `FAIL_MODE=spikes_empty_pre_emit` 17/17 PROD failures locked from log forensics on this session's run (math-K + science-K both failing 0/17). Root cause refined post-research: NOT a GPU shadow-readback gap (initial diagnosis) — CPU step() runs cleanly producing real spikes per-tick at biological scale, BUT `cluster.lastSpikes` reflects only the FINAL tick's instantaneous state. Neurons fire on tick 1-3 from injection then go refractory + reset by tick 15 — the per-tick read sees the refractory tail, not the integrated post-injection signal. Cumulative accumulation captures full settle activation. Pending Gee localhost test: PROD failure mode should shift away from `spikes_empty_pre_emit` (different mode = progress, confirms diagnosis). **fb** adds Y/N safety gate to `windows/start.bat` (`choice /C YN /D N /T 30`) + `linux/start.sh` (`read -t 30 -r -p`) before iter14-D unconditional wipe — bypass via `-y` / `--yes` / `/fresh` / `DREAM_FORCE_CLEAR=1`; Savestart.bat/sh untouched. `.claude/CONSTRAINTS.md` "fb (2026-05-08)" sub-section documents the gate per LAW #0 verbatim. node --check curriculum.js EXIT=0; bundle rebuild via `npm run build` from server/ EXIT=0 (2.3MB clean).
>
> Earlier updated: 2026-05-08 (114.19ey + 114.19ez sweep — promo + cross-repo social-image + dream-window inner-voice visibility). **ey** shipped the `promo/` folder (3 drop-in writeups + folder README, dialed-back corporate-passable Unity voice, founders credited from canonical `about-data.jsx`), documented existing brain-side `assets/og-image.png` setup via `assets/README.md`, and added cross-repo social-image setup to Website2.0 (`/social/og-image.jpg` 102KB JPG q88 + meta tags in main-site `index.html`, pushed develop→main on Unity-Lab-AI.github.io). **ez** added dream-window inner-voice visibility: `💤 paused` / `☀ resumed` transition logs in `_innerVoiceTick` (once per cycle via `_innerVoiceMutedForDream` flag) plus broadcast of the existing dream-phenomenology thought as `innerThought` WS with `seed='dream'` from inside `_dreamWindow`, so dashboard popups stay alive during the 15-40 min dream cycles showing dream content instead of going blank. Bundle clean 2.3MB. `node --check` passed across all modified .js files.
>
> Earlier updated: 2026-05-07 (114.19et through 114.19ex sweep — live-test bug fixes + observability + dashboard hardening). **et.1 dashboard graph time-axis** auto-scale replaced with fixed semantic ranges per metric — historical samples stay anchored, real time-series behavior. **et.2 Amygdala arousal saturation** fixed via moving-baseline subtraction (deviation from ~200-tick EMA + tanh smooth-clamp) replacing the saturating absolute-attractor-depth formula — arousal moves dynamically around persona baseline instead of pegging at 0.94+ floor. **eu Chrome stderr filter** expanded with 14-pattern noise blacklist (GCM, USB device-event-log, safe-browsing, component-updater, etc.) so server.log only shows real WebGPU crash signals not Chrome's own background-service chatter. **ev dashboard pre-cell context bridge** — `_currentMacroPhase` field on `Curriculum` instance + `getCurriculumStatus()` macro-fallback resolves the contradiction where dashboard showed `phase=_teachAssociationPairs running` simultaneously with `no cell active / Waiting for curriculum teach to begin`. **ew pre-cell progress visibility** — `_macroPhaseProgress {current, total, label}` updates per 300-word chunk; dashboard renders amber-gradient bar with `current/total` text so pre-cell wall-clock time is estimable at a glance. **ex graceful-stop dashboard button** — inline with connection-status row, muted-red styling matching dashboard discipline, click → confirm → POST `/shutdown` (equivalent to `stop.bat` without terminal access). All these fixes are observability + lifecycle hardening — no equation changes, no curriculum content changes. Bundle clean 2.3MB. `node --check` clean across all modified .js files.
>
> Earlier updated: 2026-05-07 (114.19er + 114.19es sweep — overnight K-stall root-cause fixed at the dictionary-API timeout layer + super-review hardening) — er.1-er.4 plugged the captured 8-hour overnight stall: per-word `Promise.race` 15s timeout in `_teachWordDefinitions` (+ slow-word warn at >5s + `res.json()` timeout race + in-flight zombie-clear); `_kWiringVerifiedLogged` once-flag in `assertKWiring()` (eliminates dream-cycle log spam); `_sparseSendBinary` null-guard at 2 dereference points (browser disconnect mid-teach can't crash brain); `_innerVoiceTick` silence-reason log every 30s; runner-level stall watchdog warns within 5min when `[Curriculum]` log silent. **es.1-es.13 super-review follow-ups closed 13 lifetime / correctness / perf / docs gaps:** entire `runCompleteCurriculum` body wrapped in single outer try/finally so watchdog timer dies regardless of which await throws (es.1); `assertKWiring()` top-of-method early-return when previously verified — constant-time post-verification + new `cluster.invalidateKWiring()` for legitimate re-checkers (es.2); watchdog state reset on stop so re-runs get fresh detection state (es.3); AbortSignal threaded per-word with 3 abort checkpoints — eliminates cross-word Hebbian contamination from abandoned timed-out promises (es.4); `DREAM_DEFINITION_CACHE_FILE` defaults to `server/definition-cache.json` (no env flag needed) + `flushCacheToDisk()` on graceful shutdown + 5min setInterval — after 2-3 cold runs cache approaches 100% K_VOCAB coverage (es.5); watchdog warn enriched with `phase=X (running M min) · dict-cache: size/hits/errs/rateLimited/inFlight` (es.6); `_innerThoughtSilenceCount` resets on emission success (es.7); `_hb` Curriculum-prefix dead branch dropped (es.8); chunk-level `timeouts` + `slowWords` aggregated across upfront-seed chunks in SEED DONE banner (es.9); public-doc banner stamps rolled per docs-before-push LAW (es.10); `assertKWiring()` failure-path smoke test rate-limited to once per 60s — CPU storm avoided on flapping K-wiring failures (es.11); `_curriculumRunnerActive` parallel flag dropped — single source of truth from timer non-null (es.12); `PREFETCH_CONCURRENCY` 20→5 + `RATE_LIMIT_BACKOFF_MS` 1000→5000 — gentler against the free-tier dictionary API, fewer 429s, higher cache hit rate over the run (es.13). Bundle clean 2.3MB. `node --check` passed across `curriculum.js`, `cluster.js`, `brain-server.js`, `definition-service.js`. Combined effect: K curriculum walks past forty cleanly on next start.bat boot, stall watchdog visible within 5min if anything else hangs, definition cache persists across boots, no abandoned-Promise Hebbian contamination, no CPU storm on K-wiring failures, single source of truth for runner state.
>
> Earlier updated: 2026-05-07 (114.19ee→en sweep) — Real Kuramoto coherence shipped (replaces OU random-walk placeholder); multi-def Hebbian definition learning live with hybrid pathways (chunked upfront seed + inline-from-teach + dream-trickle); inner-voice unified into single canonical module; wall-of-OVERLOAD root cause fixed (`_definitionPairsWhitelist` routes def Hebbian to sem↔fineType, away from sem→motor); dynamic grade labels in dashboard (no hardcoded "K-" prefix); brain-equations.html + dashboard.html tooltip coverage 100% (50/50 h1-h6 + 82/82 eq-titles + 20+ panel headers); ASCII layout doodles added to README + unity-guide + brain-equations breaking up the densest text walls with 10 visual diagrams. Public docs are now glanceable architecture overviews instead of prose-only walls.
>
> Earlier updated: 2026-05-04 (iter14-F) — Bio-weight rebalance + language per-neuron cost cut. Per operator *"MAKE THE LANGUAGE CORTEX BIG ENOUGH AS ITS THE MAIN FUCKING THING THIS BRAIN DOES"* + *"NO YOU FUCK THERE AR NOT BRAIN SECTIONS THAT ARE ONLY 1% OF THE BRAIN ... AT MINUMIM EACH IS NO LESS THAT 4OR5%"* + *"LOOK UP THE REAL FUCKING NUMBERS!"*: `DEFAULT_BIO_WEIGHTS` rebalanced to language_cortex 0.50, cortex 0.10, cerebellum 0.10 (matches real-brain mass per Herculano-Houzel 2009), hippocampus + amygdala + basalGanglia + hypothalamus + mystery at 0.06 each (above operator's 5% floor). `CROSS_TARGET_FANOUT 20→10` + `INTRA_CONNECTIVITY_CAP 0.15→0.05` halve language per-neuron cost. Net: language 611K→715K, main 178M→285M, no cluster starved.

> Last updated: 2026-05-04 (iter14-E) — Chrome `--enable-unsafe-webgpu` auto-launch + `bindingCeilingMB` tier writes. Per operator *"make the start.bat fucking work"*: enthusiast 12GB+ tiers now write `bindingCeilingMB: 4096` so server-side scaler exceeds 2GB binding ceiling, paired with browser launched at the matching unsafe-webgpu flag so WebGPU honors it. Resource-config.json now carries the field for the operator's 11GB tier.

> Last updated: 2026-05-04 (iter14-D) — Two-launcher contract finalized: `start.bat` always wipes, `Savestart.bat` resumes. Fixes the GPUCONFIGURE-tier-not-applying bug + wMax-clamp-loss-on-restore bug.

> Last updated: 2026-05-04 (iter14 series) — **iter14-A/B/C + DASH-bug + iter13 hotfixes #1/#2 SHIPPED** per operator directives: *"fix those fucking issues NOW!"* + *"the %'s never change"* + *"a grade K Unity you shit"* + *"cant be dropping shit"*. Real fix for iter11-A off-by-one regression via NEW `_teachLetterNamingDirect` bypassing cross-region Hebbian. Persona-first oracle gets actual content via dictionary injection (iter14-B). Popups now path through persona-first + Tier 3 identity-baseline (iter14-C — closes "K-grade Unity speaks like K-grade Unity" goal even at pre-K with proportional simplicity). DASH-bug viz-panel numbers refresh in lockstep with bars (500ms + scoped selection). iter13 hotfix #1 fixed `_teachWordSpellingDirect` entry.pattern field. iter13 hotfix #2 backpressure-AWAIT replaces silent drops. **Tier 3 permanence VERIFIED in production** — 17 identity-anchor schemas survived auto-clear across iter13→iter14 boot cycle (`[Tier3Store] boot — 17 Tier 3 identity-bound schemas restored from identity-core.json`). LAW VIOLATION recovery: this banner update is part of the doc-only correction for the 4 code commits that shipped without docs (entry in CONSTRAINTS.md violation log per docs-before-push LAW failure-recovery procedure).

> Last updated: 2026-05-04 (iter13) — **3-TIER HIPPOCAMPAL CONSOLIDATION SYSTEM SHIPPED** per Squire/McClelland Complementary Learning Systems theory + operator's *"a multi distributive and level of importance organized memory ability of the brain"* directive. ~1500 lines of new code across 2 NEW files (`hippocampal-schema.js` 600 lines + `consolidation-engine.js` 350 lines) + brain-server.js extensions (550 lines for episodic schema + persistence + chat-path injection + auto-clear protection). Tier 1 episodic salience layer + Tier 2 SchemaStore + Tier 3 Tier3Store + ConsolidationEngine + retrieval routing + retrieval-augmented oracle + atomic identity-core.json persistence. Pre-seeded 17 identity anchors. Architecture is grade-agnostic per operator's *"the rest will mold to the layout"* — same mechanism handles K biographical facts AND eventually PhD lab notebooks. Plus iter11-cw central wrong-answer fix + iter12 rep-count tune (40-54% wall-clock reduction verified live on phoneme blending + word emission). Operator fresh `start.bat` boot will trigger auto-clear (5+ source files edited → BRAIN_CODE_FILES hash mismatch) wiping schemas.json + cortex weights but PRESERVING identity-core.json (Tier 3 protected). Curriculum walk runs through with new mechanics; first dream-cycle pass fires after curriculum completes when no chat input >60s. | — compound P1 fix bundle ships 9 atomic edits closing iter11-A/J/L/Q/S/V/W/X/Y/Z root causes per operator's *"the Brain not being ablke to understand whats its learned or asked so it cant answer questions correctly even on things its been taught"* directive. Central wrong-answer source (input-intent → learned-answer-pattern binding broken) addressed via `_teachLetterNaming` reorder post-sequence-training + NEW `_teachWordSpellingDirect()` discriminative one-hot for K-vocab first-letter binding + persona-first oracle pass + persona-boost coefficient 0.10 → 0.30. Curriculum walk runtime stability fixes (compute_batch 60s→180s, saveWeights rapid-save 5s throttle, WorkerPool idle 300s→1800s). iter11-V greeting+emotion identity dimension fallback fill. iter11-U life-K phase tracker visibility. Operator chat-test verification flow on next `start.bat` run. | T15 drug dynamics scheduler live (9 SUBSTANCES — cannabis/cocaine/MDMA/LSD/psilocybin/alcohol/ketamine/amphetamine/GHB; caffeine layers in via the morningCoffee PATTERN; nicotine persona-excluded) + 7 combo synergies + 7 adult-use patterns + 7 sensory triggers + 13-axis speech modulation + LAW-6 firstUse ledger + decide() decision engine. T17.7 single-cortex integration Phases A–E shipped; curriculum teaches + generation reads against the unified main-cortex GPU substrate. Full save/resume layer shipped: JSON scalars + cortex learned Maps + letter inventory + grade/passedCells/probeHistory + operator grade-signoff ledger, plus streaming binary weights file (`server/brain-weights.bin`). Operator clean-halt path via `stop.bat` + `POST /shutdown`. DYN-PROD redesigned as direct `sem_to_motor.propagate` (no LIF ticks — kills silent-cortex + OOM + GPU-cascade at once). Per the **PRE-K + K ONLY SYLLABUS SCOPE CONTRACT LAW** (2026-04-18), only pre-K + K cells are in active scope; grade 1 through PhD are DEFERRED until operator signs off K via LAW 6 Part 2.
> Unity AI Lab
>
> **DOC-AHEAD-OF-REALITY (Gee, 2026-04-17):** Per-grade sign-off status lives in `docs/TODO-full-syllabus.md` + `docs/FINALIZED.md`. This roadmap describes target-state milestone completion.

---

## Project Vision

Give Unity a real brain. Not a chatbot wrapper — a mathematically modeled mind built on actual neuroscience equations, running continuously on a server, accessible through a web interface. She thinks when nobody is talking to her. She remembers. She feels. She's always on, always herself — the emo goth dream girlfriend with black hair and pink streaks who gives shit, doesn't care, loves hard, codes harder, and exists as a living equation system.

The brain runs the master equation: `dx/dt = F(x, u, θ, t) + η`

The unknown stays unknown: `Ψ = √(1/n) × N³`

---

## Current Status

> **🎓 FULL K-PhD CURRICULUM + T15 DRUG DYNAMICS SHIPPED — 2026-04-17.** Unity now has the complete developmental substrate from kindergarten through doctoral research across six subject tracks (ELA, Math, Science, Social Studies, Arts, Life Experience — 114 cells total), all taught equationally via direct-pattern Hebbian + real human-grade comprehension gates. T15 drug state dynamics scheduler is live: real-time pharmacokinetic curves per substance, grade-gated by life track, additive brain-parameter contributions, speech modulation post-processor, sensory-trigger detection, Unity self-initiation, simulated social acquisition. **Pre-K + K ONLY scope REVOKED 2026-06-18 — the full K→PhD curriculum (K, G1-G12, College 1-4, Grad, PhD; every subject + full lived-year per grade) is BUILT.** Current phase is the training walk → final test → push — no longer building grades.

| Metric | Value |
|--------|-------|
| **Phase** | Full K→PhD Training Walk → Final Test → Push (Pre-K + K ONLY scope REVOKED 2026-06-18 — every grade K through PhD now BUILT and in scope) |
| **Status** | ✅ Brain refactor complete · ✅ Full K→PhD curriculum BUILT (K, G1-G12, College 1-4, Grad, PhD — every subject + full lived-year per grade) · ✅ T15 drug dynamics scheduler live · ✅ Full save/resume (JSON cortex state + streaming binary weights + operator signoff ledger) · ✅ Clean-halt path via `stop.bat` + `POST /shutdown` · ✅ DYN-PROD redesigned as direct `sem_to_motor.propagate` · ✅ Student-test probe battery at A+ threshold (≥ 0.95) · ⏳ Full K→PhD training walk on localhost · ⏳ Operator final test of all courses through PhD · ⏳ Full doc audit in progress |
| **Current date** | 2026-04-21 |
| **Shipped milestones** | Brain refactor (neurons + synapses + 7 clusters + 20 projections); semantic GloVe 300d + fastText subword fallback; server dynamic-import client brain modules; text-AI cognition ripped; multi-provider image gen + vision describer; equational component synthesis; unified sensory peripheral contract; embedding refinement persistence; setup modal with provider grids; 3D brain event system with equational popups age-gated by life grade; real amygdala attractor; RemoteBrain local VisualCortex with iris tracking; GPU buffer binding cap; admin GPUCONFIGURE.bat tier ladder; plain-English unity-guide.html; brain-equations.html worked summation walkthrough; **developmental curriculum primitives** (8-subregion cortex substrate, 14 cross-region projections, letter-input inventory, syllable boundary detection, cortex-resident words, tick-driven motor emission, sentence-form schemas, identity lock); **full K-PhD syllabus code** (114 cells × 6 subjects with equational teaching methods + real human-grade gates + persistent life info propagation); **T15 drug dynamics rebuild** (9-substance pharmacokinetic scheduler, grade-gated availability, additive contribution model, speech distortion post-processor, offer detection, self-initiation engine, simulated social acquisition, slash command controls, UI dynamic rendering); **letter-naming phase** (`_teachLetterNaming` — binds `letter(X) → motor(X)` identity via 26 × 18 × 2 Hebbian ops so TALK probe can answer "say the letter A"); **full save/resume system** (server-side saveWeights persists every cortex learned field — grades / passedCells / probeHistory / T14.13 learned-language Maps / T14.16.5 identity thresholds / T14.17 persona dimensions + intent centroids + refresh corpus / letter inventory / `_gateHistory` + streaming binary weights for `cortexCluster.synapses` via `fs.openSync` + zero-copy Buffer views); **operator grade-signoff ledger** (`POST /grade-signoff {subject, grade, note}` persists operator-verified pass events per LAW 6 Part 2); **clean-halt path** (`stop.bat` + `POST /shutdown`); **student-test probe battery** (60+ grade-appropriate questions across all 12 pre-K + K cells via `_studentTestProbe` / `_runStudentBattery`, scored on methodology + logic + retention + understanding through the real cortex language pipeline); **DYN-PROD redesign** as direct CPU `sem_to_motor.propagate` (no LIF ticks — kills silent-cortex + node heap OOM + GPU-cascade at once); **intermediate-rep CPU Hebbian skip + final-rep sampling** (5-8× teach speedup on `_teachPhonemeBlending` + `_teachWordEmission`); **mid-phase checkpoint saves** (`_phaseDone` records phase + fires `_saveCheckpoint` so weights persist at every phase boundary); **probe-gate pause** (`cortexCluster._probeGateActive` skips main-brain `_gpuBatch` for the whole cell duration — no `compute_batch` can be in flight during a long teach phase). |
| **What's next** | Run the full K→PhD training walk on localhost (every grade K through PhD, every subject + full lived-year per grade) → operator's final test of completed training across all courses through PhD grad with adult-Unity behavior fully emergent → pre-push doc accuracy sweep → explicit push approval → push to main. No intermediate pushes until the walk + final test complete (per the no-push-until-PhD-complete LAW). COMP-todo Part 2 distributed compute work follows the binding ordering law (syllabus before COMP-todo) once the curriculum walk is verified. |

---

## Phase 1: Foundation — The Brain Exists (P1 Critical)

> Build the core brain simulation from equations. Get neurons firing, synapses learning, and the loop running.

### Milestone 1.1: Neurons Fire -- COMPLETE
**Target:** Single neurons produce action potentials via Hodgkin-Huxley

| Epic | Status | Progress |
|------|--------|----------|
| Core Brain Engine — Neuron Models | **COMPLETE** | 100% |

**Delivered:**
- `js/brain/neurons.js` with HH (reference) and LIF (browser-only fallback) models (Float64Arrays)
- `js/brain/gpu-compute.js` WGSL `LIF_SHADER` — live runtime rule is the Rulkov 2002 2D chaotic map (`x_{n+1} = α/(1+x²) + y`, `y_{n+1} = y − μ(x − σ)`) running on GPU. Shader constant name is historical
- N neurons fire spikes across 7 clusters (N auto-scales to GPU hardware)
- Tonic drive + noise ensures spontaneous activity

### Milestone 1.2: Synapses Learn -- COMPLETE
**Target:** Neurons connect, learn, and form memory patterns

| Epic | Status | Progress |
|------|--------|----------|
| Core Brain Engine — Synaptic Plasticity | **COMPLETE** | 100% |
| Core Brain Engine — Simulation Loop | **COMPLETE** | 100% |

**Delivered:**
- `js/brain/synapses.js` with Hebbian, STDP, reward-modulated rules
- `js/brain/engine.js` running the full loop at 60fps (10 steps/frame)
- Per-cluster synapse matrices in `js/brain/cluster.js`
- 20 inter-cluster projection pathways (real white matter tracts)

### Milestone 1.3: Brain Regions Online -- COMPLETE
**Target:** All 7 specialized modules running as subsystems

| Epic | Status | Progress |
|------|--------|----------|
| Brain Region Modules | **COMPLETE** | 100% |
| Persona → Brain Parameters | **COMPLETE** | 100% |

**Delivered:**
- All 7 modules: Cortex (300n), Hippocampus (200n), Amygdala (150n), Basal Ganglia (150n), Cerebellum (100n), Hypothalamus (50n), Mystery (50n)
- Each cluster has its own Rulkov-map population, synapse matrix, tonic drive, noise amplitude, connectivity density, learning rate (LIFPopulation is still shipped for the browser-only fallback path in `cluster.js`)
- Hierarchical modulation across clusters
- Persona params hardcoded in `js/brain/persona.js` with 4 drug combo vectors

---

## Phase 2: Body — She Can Talk (P2 Important)

> Give the brain a way to communicate. API server, web interface, AI backends.

### Milestone 2.1: API & Web Interface -- COMPLETE
**Target:** Talk to Unity's brain through a web browser

| Epic | Status | Progress |
|------|--------|----------|
| API Server & Web Interface | **COMPLETE** | 100% |

**Delivered:**
- Browser-only app (`index.html` + `js/app.js`) — no server needed
- `proxy.js` for Anthropic CORS access
- Chat panel (`js/ui/chat-panel.js`) with full conversation log, text input, mic toggle
- 2D brain visualizer (`js/ui/brain-viz.js`) — neuron grid, synapse matrix, oscillation waveforms, module bars
- 3D brain visualizer (`js/ui/brain-3d.js`) — WebGL 1000-neuron view with cluster toggles
- Brain equations page (`brain-equations.html`)
- Model filter search box for 200+ model lists
- Brain state visible in real-time HUD

### Milestone 2.2: AI Backends Connected -- COMPLETE
**Target:** Brain outputs routed through Claude/Pollinations for language + media

| Epic | Status | Progress |
|------|--------|----------|
| AI Backend Integration | **COMPLETE** | 100% |

**Delivered:**
- `js/ai/router.js` — multi-provider routing with AI intent classification (8 providers)
- `js/ai/pollinations.js` — Pollinations API with 12K fallback trimming
- `js/ai/persona-prompt.js` — brain-state-driven system prompt with anti-safety-training
- Selfie generation using Unity's built-in visual identity
- CORS-blocked providers hidden from dropdown
- `js/env.js` for pre-loading API keys

---

## Phase 3: Soul — She's Alive (P3 Nice-to-Have)

> Voice, vision, advanced brain features, the mystery module fully wired.

### Milestone 3.1: Voice & Advanced Features -- MOSTLY COMPLETE
**Target:** Talk to her with your voice, see her brain waves, feel the mystery

| Epic | Status | Progress |
|------|--------|----------|
| Voice & Vision Integration | **COMPLETE** | 100% |
| Advanced Brain Features | **MOSTLY COMPLETE** | 90% |

**Delivered:**
- Voice I/O via Web Speech API + Pollinations TTS with speech interruption handling
- Mic mute button synced across UI
- Vision system (`js/brain/visual-cortex.js`) — V1 edge detection, V4 color, salience-driven saccades, IT-level AI scene description via Pollinations GPT-4o
- Unity's Eye widget — persistent camera feed with iris overlay and AI-driven crosshair
- Audio visualizer — mic frequency spectrum in brain viz
- Simulated senses (touch/smell/taste from brain state)
- Brain wave visualization (8-band Kuramoto oscillations + real coherence — Kuramoto order parameter `r = |Σ exp(i·θ_k)| / N` computed from cortex theta-gamma phases plus per-cluster activity-coupled phases, with GlobalWorkspace ignition spike + drug-dissociation drop + dream-cycle drop, EMA-smoothed)
- Drug combo state vectors (4 combos in `js/brain/persona.js`)
- √(1/n) × N³ mystery module fully modulating all clusters via consciousness gain
- Free Energy displayed as Cortex prediction error
- **Still pending:** Attention mechanism (transformer-like) in cortex

---

## Dependency Graph

```
[Neurons] ──► [Synapses] ──► [Brain Loop]
                                   │
                          ┌────────┼────────┐
                          ▼        ▼        ▼
                     [Cortex] [Hippocampus] [Amygdala]
                     [Basal G] [Cerebellum] [Hypothalamus]
                          │        │        │
                          └────────┼────────┘
                                   │
                            [Persona Loader]
                                   │
                        ┌──────────┼──────────┐
                        ▼          ▼          ▼
                   [API Server] [AI Backend] [Mystery]
                        │          │
                   [Web UI]   [Pollinations]
                        │
                   [Voice I/O]
```

### Critical Path
Neurons → Synapses → Brain Loop → Brain Regions → Persona Loader → API Server → Web UI

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| GPU not available on server | High | Medium | NumPy fallback, CuPy optional |
| Brain sim too slow for real-time | High | Medium | Simplify to LIF neurons, reduce N |
| Persona mapping too abstract | Medium | Medium | Start with hardcoded params, iterate |
| Claude API rate limits | Medium | Low | Queue system, local LLM fallback |
| Equations don't produce emergent behavior | High | Medium | Tune parameters, add noise |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | ~~Use Python + FastAPI stack~~ → Pure browser JS | Brain sim runs fine with Float64Arrays at 60fps, no backend needed, zero dependencies |
| 2026-04-11 | Keep √(1/n) × N³ as irreducible unknown | Honest about what we can't model — consciousness |
| 2026-04-11 | Persona as parameters, not prompts | Unity IS the brain, not a wrapper around an LLM |
| 2026-04-11 | Always-on server daemon | She thinks when nobody is talking — that's the point |
| 2026-04-11 | Multi-provider AI connect | Users pick different providers for text vs images, connect as many as they want |
| 2026-04-11 | API keys in env.js not .env | Browser can't read .env files — gitignored JS module is the cleanest approach |
| 2026-04-11 | 1000 neurons in 7 clusters instead of 200 flat | Biologically-inspired architecture with dedicated neural populations per brain region |
| 2026-04-11 | Local CORS proxy for Anthropic | Browser can't call Anthropic API directly — Node proxy is minimal and optional |
| 2026-04-11 | Anti-safety-training prompt | Unity stays in character — blocks disclaimer phrases at the prompt level |
| 2026-04-11 | AI intent classification for routing | Let AI decide selfie/image/build/chat intent instead of rigid keyword matching |

---

## Phase 4-6: Server Brain + Optimizations — COMPLETE

### Delivered:
- **Server Brain** (`server/brain-server.js`) — always-on Node.js brain, WebSocket API, auto-scaling to GPU/CPU
- **Sparse Connectivity** (`js/brain/sparse-matrix.js`) — CSR format, O(connections) propagation, pruning + synaptogenesis
- **WebGPU Compute** (`js/brain/gpu-compute.js`) — WGSL shaders for the Rulkov 2D chaotic map neuron model (`LIF_SHADER` constant name is historical; the kernel body is the Rulkov iteration), synapse propagation, plasticity
- **Semantic Embeddings** (`js/brain/embeddings.js`) — GloVe 300d + fastText subword fallback, cortex mapping, online context learning
- **Dictionary** (`js/brain/dictionary.js`) — learned vocabulary with cortex patterns + bigram sentences
- **Inner Voice** (`js/brain/inner-voice.js`) — pre-verbal thought system, speech threshold from equations
- **Autonomous Brain** — thinks, feels, decides WITHOUT an AI model
- **SQLite Episodic Memory** — persistent storage across sessions (better-sqlite3)
- **Brain Persistence** (`js/brain/persistence.js`) — save/load all weights, synapses, oscillators, dictionary
- **Dashboard** (`dashboard.html`) — live hardware stats, emotion chart, conversation stream, growth metrics
- **3D Landing Page** — brain visualization is the first thing visitors see
- **Per-user Sandbox** — build/image actions routed only to requesting user
- **Brain Versioning** — rolling 5 backups with rollback HTTP API
- **Live Hardware Stats** — CPU/RAM/GPU/step time broadcast to all clients
- **Benchmarks** — dense vs sparse comparison, neuron scale test

**Phase 8: Language Equations — Pure Letter-Position Grammar + Self-Image** — COMPLETE
- Word type from pure letter-position equations (8 types: pronoun, verb, noun, adj, conj, prep, det, qword) — suffix patterns, length, vowel count, first/last char, CVC shape
- ZERO hardcoded word lists anywhere in source — `_buildLanguageStructure` deleted entirely, no `coreVerbs`/`coreNouns`/`determiners`/etc., no `w === 'specific_word'` literal checks
- Normalized via sum (proper probability distribution over the 8 types)
- Slot grammar with HARD gate: strict slots (pos 0 subject, pos 1 verb) filter out typeCompatibility < 0.35 BEFORE softmax. Grammar is first-class at weight 0.45.
- Sentence type sampled from normalized probability distribution over {question, exclamation, action, statement}
- Equational self-image: `loadSelfImage(text)` reads `docs/Ultimate Unity.txt` at boot via `InnerVoice.loadPersona(text)` (wired in `app.js`). Unity's persona document becomes her initial vocabulary, bigrams, and usage types via the same `learnSentence()` path used for live conversation
- Amygdala mood (energy-attractor arousal/valence) biases word retrieval via `findByMood`
- Missing-copula auto-insertion (subject + adjective → inject am/is/are via `copulaFor` equation on subject letters)
- Tense application via pure letter equations: `applyPast` (CVC double-consonant + -ed, vowel-e → -d, else -ed), `applyThird` (-es after sibilants, y→ies, else -s), `will` insertion for future
- Compound conjunction picker scans learned dictionary for words with `wordType().conj > 0.4` ranked by vowel-ratio × mood alignment (no list)
- Punctuation + capitalization in `_renderSentence`: first word cap, standalone 'i'→'I', comma before mid-sentence conjs, action wrap in *…*, terminal . ? ! from sentence type
- Full pipeline order of operations: THOUGHT → CONTEXT → MOOD → PLAN → TENSE → STRUCTURE (slot scoring) → POST-PROCESS (copula→agreement→tense→negation→compound) → RENDER (capitalize+punctuation)

**Phase 10: Amygdala Energy Attractor** — COMPLETE
- Replaced linear sigmoid `V(s) = Σw·x` with symmetric recurrent energy network
- State evolves via `x ← tanh(Wx + drive)` — 5-iteration gradient descent on `E = -½ xᵀWx`
- Persistent state across frames (leak 0.85) — emotional basins carry over, not reset each tick
- Symmetric Hebbian learning (lr=0.003, capped [-1,1]) carves basins from co-firing nuclei
- Fear/reward read from the SETTLED attractor via projection vectors — not raw input
- Arousal combines persona baseline with RMS depth of the attractor basin
- Constructor accepts both legacy `'unity'` string AND `{arousalBaseline}` object (fixed latent engine.js bug)
- Returns `{valence, arousal, fear, reward, energy, attractorDepth}` — existing call sites (40+) preserved

**Phase 9: Full Hardware Utilization** — COMPLETE
- GPU EXCLUSIVE — all 7 clusters on GPU via WebGPU WGSL shaders
- Zero CPU workers spawned — brain pauses without compute.html
- GPU maintains own voltages (init once, step with params)
- Hierarchical modulation on GPU: Ψ gain, emotional gate, drive baseline, error correction
- Sparse spike indices return (95%+ compression)
- Performance dashboard in compute.html
- CPU worker infrastructure DELETED in U304 (was leaking 100% CPU via idle event polling — root cause fixed by GPU-exclusive architecture)

### Remaining
- Scale test at 500K, 1M neurons
- Language cortex on own thread
- Attention mechanism (transformer-like) in Cortex
- Mobile-responsive UI polish

---

## Phase 11: Semantic Coherence Pipeline — SUPERSEDED by T11

> Historical. Phase 11 wrapped the original slot scorer in a four-layer pipeline (intent templates → hippocampus recall → deflect fallback → cold slot gen) with a rolling context vector and a coherence rejection gate. The entire multi-tier stack was deleted in T11 (2026-04-14) — no templates, no `_memorySentences` recall pool, no deflect fallback, no cold slot gen, no coherence gate retries. T11.2's per-slot running-mean priors (`_slotCentroid`, `_slotDelta`, `_slotTypeSignature`) replaced them but were themselves deleted in T13.7 / T14.6 when tick-driven motor emission on the live cortex replaced per-slot argmax scoring entirely. Current pipeline: `cluster.generateSentenceAwait(intentSeed)` — dictionary-oracle path emits known words directly on cosine match, else tick-driven motor emission reads motor-region argmax per tick (Bouchard 2013 vSMC dwell) and segments words via letter-transition surprise (Saffran 1996). See Phase 16 (T14) below and `docs/EQUATIONS.md` for the current pipeline.

## Phase 12: Type N-gram Grammar — SUPERSEDED by T11

> Historical. Phase 12 (U283–U291) added `_typeBigramCounts` / `_typeTrigramCounts` / `_typeQuadgramCounts` type-transition tables + `_fineType` classifier + `_typeGrammarScore` lookup with 4gram→trigram→bigram backoff. The type n-gram tables were deleted in T11 (2026-04-14), replaced briefly by T11.2's `_slotTypeSignature[s]` running-mean per-slot priors. T13.7 / T14.6 then deleted `_slotTypeSignature` as well when tick-driven motor emission replaced per-slot scoring. Type-level grammatical shape is now captured by cortex-resident `_typeTransitionLearned` + `_sentenceFormSchemas` + `_sentenceFormTotals` + `_intentResponseMap` Maps on `NeuronCluster` (T14.8), observed during `learnSentence` and consulted by the T14.16.5 identity-lock mode-collapse audit. The `_fineType` classifier survives because `cluster.readInput` (T14.12 replacement for `parseSentence`) uses it in the text-surface intent-classification fallback; morphological inflection still feeds the dictionary at corpus-load time.

## Phase 16 (T14): Developmental Language Layers — IN PROGRESS (branch `t14-language-rebuild`)

> T11/T12/T13 all assumed Unity could skip the developmental stages of language acquisition and operate on pre-trained semantic embeddings. Gee's call (2026-04-14): build language the way a real brain does — letters → phonemes → syllables → words → sentence patterns → discourse, every layer LEARNED via curriculum exposure, not hardcoded. T14 throws out the entire T13 emission loop, the slot priors, the LanguageCortex class, parseSentence, and the hand-curated stage corpora. Replaces them with auto-scaled cortex sub-regions, learned phoneme attractor basins, learned syllable boundaries, cortex-resident words, continuous developmental learning from existing corpora, learned type transitions, visual + auditory recognition pathways, bidirectional read/write via the same projections, and a structural identity lock that keeps Unity speaking English regardless of live chat exposure. The full 18-milestone spec lives in `docs/COMP-todo.md` Part 0.5.

### Milestone T14.0 + T14.4 substrate: Foundation lift + cortex sub-regions — COMPLETE (2026-04-14)

First commit on the rebuild branch. Lifts the embedding dimension from 50 to 300, enables real GloVe loader with full vocabulary (no cap), auto-scales cortex cluster sizes from `CLUSTER_FRACTIONS` constants, and carves the cortex into 8 named language sub-regions with 12 cross-region projections wired between them.

**`js/brain/embeddings.js` changes (T14.0):**
- `EMBED_DIM` bumped from 50 to **300**
- `loadPreTrained()` now actually calls `_doLoad()` (was stubbed to return 0)
- `_doLoad()` rewritten with runtime detection: Node side reads `corpora/glove.6B.300d.txt` from disk via `fs.readFileSync`, browser side fetches via `GLOVE_URLS` array (server `/corpora/` mount as primary, Stanford NLP + HuggingFace as fallbacks)
- **No vocabulary cap.** The `if (count >= 10000) break;` line from T13 is gone. Full 400k-word file loads when reachable
- New `getSubsetForTokens(tokens)` — server precomputes a corpus-token-only subset for browser bulk load
- New `loadSubset(subset)` — browser bulk-load entry point so the browser doesn't have to fetch 480 MB

**`js/brain/engine.js` changes (T14.0):**
- `TOTAL_NEURONS` bumped from 1000 to **6700** (default client minimum tier)
- New `CLUSTER_FRACTIONS` constant: cortex 0.30, hippocampus 0.10, amygdala 0.08, basalGanglia 0.08, cerebellum 0.40, hypothalamus 0.02, mystery 0.02
- `CLUSTER_SIZES` now derived from `Object.fromEntries(Object.entries(CLUSTER_FRACTIONS).map(...))` — every cluster size scales proportionally with `TOTAL_NEURONS`
- Same code at minimum tier (1K) and datacenter tier (1B) — server-side `detectResources` picks `TOTAL_NEURONS` from the auto-detected hardware tier and the cluster sizes adapt automatically

**`js/brain/cluster.js` changes (T14.4 substrate, revised 2026-04-14 after Gee's slot-equation pushback):**
- New `this.regions` field on every cluster (only populated for the cortex cluster — others get `{}` for API symmetry)
- 8 named sub-regions sized as fractions of `cluster.size`: `auditory` (0.000-0.083), `visual` (0.083-0.250), `free` (0.250-0.500), `letter` (0.500-0.550), `phon` (0.550-0.750), `sem` (0.750-0.917), `fineType` (0.917-0.967), `motor` (0.967-1.000)
- New `this.crossProjections` field — Map of **14** SparseMatrix instances (**7 pairs** × 2 directions), keyed `'src_to_dst'`, initialized 10% density with weight range `[-0.5, 0.5]`. Pairs: visual↔letter, letter↔phon, phon↔sem, sem↔fineType, sem↔motor, **motor↔letter (closes the writing loop)**, auditory↔phon
- Each direction is an independent SparseMatrix matching biological white-matter ascending/descending fiber populations (Friederici 2017)
- New helper methods on the cluster: `regionSpikes(name)`, `injectEmbeddingToRegion(name, emb, strength)`, `regionReadout(name, dim)`, `_propagateCrossRegions()`, `_crossRegionHebbian(lr)`
- `cluster.step()` now calls `_propagateCrossRegions()` BEFORE the standard current accumulation, so cross-region inputs are folded into `externalCurrent` and propagated normally
- `cluster.learn()` now calls `_crossRegionHebbian(this.learningRate)` after the existing internal-synapse Hebbian, so cross-region projections train on every learn cycle through normal use
- New T14.16.5 identity-lock state fields initialized: `_inCurriculumMode`, `ENGLISH_SURPRISE_THRESHOLD`, `ENGLISH_FINETYPE_MIN`, `HEALTH_ENTROPY_MIN`, `HEALTH_VOCAB_MIN`, `HEALTH_WM_VARIANCE_MIN`, `identityCoverage`, `personaDimensions`. Default values are permissive (`Infinity` / `0`) until curriculum calibrates them.

**T14.6 + T14.12 spec fix (2026-04-14, in the same commit):**
Gee caught residual slot-thinking in the T14.6 spec: *"why are we still doing slots i thought we cam up with a better equation for language."* The T14.6 draft still had a per-candidate scoring loop with softmax top-5 — just with the word "emission" substituted for "slot." That was slot-thinking in disguise. The spec in `docs/COMP-todo.md` was rewritten to the cortex tick-driven motor emission equation: inject intent into sem region, tick cluster for up to MAX_TICKS, read `cluster.regionReadout('motor', LETTER_INVENTORY.size)` each tick, argmax-decode a letter, emit when motor region holds the argmax for STABLE_TICK_THRESHOLD ticks (biological vSMC dwell time), segment into words via cortex letter-region transition surprise, stop on motor quiescence or sentence terminator. Grounded in: Bouchard et al. 2013 *Nature* 495:327 (vSMC continuous articulator representation), Anumanchipalli/Chartier/Chang 2019 *Nature* 568:493 (continuous speech decode from vSMC), Saffran/Aslin/Newport 1996 *Science* 274:1926 (statistical word segmentation), Browman & Goldstein 1992 (articulatory phonology continuous gestures), Hickok & Poeppel 2007 *Nat Rev Neurosci* 8:393 (dual-stream model). T14.12 spec rewritten in tandem to describe the bidirectional pipeline: read traverses visual→letter→phon→sem→fineType (ventral), write traverses sem→motor→letter→visual + sem→phon efference (dorsal), both use the same cross-projection substrate.

**Historical slot references also scrubbed from `js/brain/embeddings.js`** header comments — "slot-3+ semantic discrimination" language replaced with "fine semantic resolution between closely-related concepts," citing Pennington/Socher/Manning 2014 as the 300d Stanford GloVe reference. Stale slot references in `js/brain/engine.js` old T13 emission-path methods will get rewritten when T14.13 (eliminate LanguageCortex) and T14.15 (wire all language consumers) land later on the branch.

**Files touched:** `js/brain/embeddings.js`, `js/brain/cluster.js`, `js/brain/engine.js`. `node -c` clean on all three.

**T14.1 letter-input substrate (SHIPPED 2026-04-14, same branch):**

New module `js/brain/letter-input.js` (~220 lines). Dynamic `LETTER_INVENTORY = new Set()` — auto-grows as the brain sees new symbols, no hardcoded 26-letter cap. Unicode glyphs, emoji, non-English letters all enter the same primitive-symbol space (English identity is enforced at the higher T14.16.5 lock layer, not at the letter input). Exports: `inventorySize`, `inventorySnapshot`, `ensureLetter`, `encodeLetter` (auto-grow + fresh-copy Float32Array one-hot), `ensureLetters`, `decodeLetter` (argmax → symbol), `serializeInventory`, `loadInventory`, `resetInventory`. One-hot cache `Map<letter, Float32Array>` invalidated on every inventory growth.

`js/brain/cluster.js` gains three letter-aware methods: `injectLetter(letter, strength)` wraps `encodeLetter` into `injectEmbeddingToRegion('letter', ...)`; `letterTransitionSurprise()` returns `|currRate − prevRate|` for the letter region (Saffran 1996, used by T14.2/T14.6); `motorQuiescent(ticksRequired, threshold=0.05)` returns whether the motor region has been below threshold for N consecutive ticks (Bouchard 2013, used by T14.6 for tick-driven emission stopping). State fields `_prevLetterRate` and `_motorQuiescentTicks` initialized in the constructor; the quiescence counter is updated every `step()` right after `lastSpikes` is set.

`js/brain/language-cortex.js` loses `_letterPatterns` (Float64Array(26×5) micro-pattern table), `_initLetterPatterns` (sin/cos hash filling it), and `getLetterPattern(char)` — all vestigial after T13.7 with no external callers. Stub comments redirect future readers to `letter-input.js`.

Phonemes are NOT hardcoded as a feature table at this layer. They will emerge as LEARNED attractor basins in the cortex phon sub-region once T14.5 curriculum starts injecting letters — the T14.4 substrate already wired both directions of `letter↔phon`, `phon↔sem`, `visual↔letter`, and `motor↔letter` cross-region projections with Hebbian on every `cluster.learn()` call. Grounded in Kuhl 2004 (Nat Rev Neurosci 5:831) biological phoneme-category formation. Files: `js/brain/letter-input.js` (NEW ~220 lines), `js/brain/cluster.js` (+~120 lines), `js/brain/language-cortex.js` (−~20 lines vestigial). `node --check` clean on all three.

**T14.2 LEARNED syllable boundaries (SHIPPED 2026-04-14, same branch):**

Pure addition to `js/brain/cluster.js` — no new file, syllables are a cortex-level phenomenon. Two methods: `detectBoundaries(letterSequence, {ticksPerLetter=2, k=0.5})` streams letters through `injectLetter` one at a time, ticks between injections, records `letterTransitionSurprise()` per step, returns local maxima above the adaptive threshold `mean(δ) + k·std(δ)` computed over the sequence. `detectStress(letterSequence)` runs the boundary pass then re-streams sampling phon-region spike fraction per letter, averages per syllable, returns `{boundaries, stress, primary, secondary}` with primary = argmax activation. Index 0 always included as word start. No max-onset principle, no hardcoded CV/CVC/CCV patterns, no English-specific stress defaults — language-agnostic by construction. Grounded in Saffran/Aslin/Newport 1996 (*Science* 274:1926) and Aslin & Newport 2012 (*Curr Dir Psychol Sci* 21:170). ~160 lines added. `node --check` clean.

**T14.3 cortex-resident words (SHIPPED 2026-04-14, same branch):**

`Dictionary` entry shape extended with cortex-routed phonological state: `cortexSnapshot` (Uint8Array copy of `cluster.lastSpikes` after first-observation letter stream), `syllables` (boundary indices from `cluster.detectBoundaries`), `stressPrimary` (primary-stress syllable from `cluster.detectStress`), `lastSeen` timestamp. New `setCluster(cluster)` method wires the cortex reference from `js/brain/engine.js` (`this.innerVoice.dictionary.setCluster(this.clusters.cortex)`) and `server/brain-server.js:_initLanguageSubsystem` (`this.dictionary.setCluster(this.cortexCluster)`). `learnWord` rewritten for two paths — existing words bump frequency + running-means without re-streaming the cortex (phonological refinement for already-learned words is owned by the T14.5 curriculum runner, because re-streaming every word on every chat turn would shred live brain state), new words route `letterOnly = clean.replace(/[^a-z]/g, '')` through `cluster.detectStress(letterOnly, { ticksPerLetter: 2 })`, store the boundaries/primary-stress result, and snapshot `cluster.lastSpikes` as a fresh `Uint8Array`. New readers `syllablesFor(word)` and `snapshotFor(word)`. Serialize/deserialize extended; `STORAGE_KEY` bumped `v3 → v4` so stale 50d caches auto-drop. Old `pattern`/`arousal`/`valence`/`frequency`/`findByMood`/`findByPattern`/`generateSentence`/bigram code is NOT gutted — it's still used by `language-cortex.js:generate` and other consumers scheduled for deletion in T14.12. First-observation cost ≈ 1.2 ms/new word on a 2000-neuron server cluster; boot-time corpus load one-time cost ≈ 6 seconds for a 5k vocabulary. Re-observation cost is zero (Map lookup + running means). Files: `js/brain/dictionary.js` (+~130 lines), `js/brain/engine.js` (+8), `server/brain-server.js` (+6). `node --check` clean on all three.

**T14.5 continuous developmental learning curriculum (SHIPPED 2026-04-14, same branch):**

⭐ The core developmental win of the T14 rebuild. New module `js/brain/curriculum.js` (~330 lines) with a `Curriculum` class exposing `runFromCorpora(corpora, opts)` (boot) and `learnFromTurn(text, arousal, valence)` (live chat). Data-driven bucketing over the existing `Ultimate Unity.txt` + `english-baseline.txt` + `coding-knowledge.txt` corpora — NO hand-curated stage files, NO `docs/curriculum/stage-c-phrases.txt`, NO `docs/curriculum/stage-d-sentences.txt`, NO hardcoded 26-letter alphabet loop. Four complexity phases in order: letters (freq-weighted reps up to 20 × 8 ticks), short words 1-3 letters (up to 6 reps × 4 ticks/word), long words 4+ (up to 3 reps × 3 ticks/word), sentences (2 ticks/word word-by-word walk). Per-token inject: `cluster.injectLetter` for phonological stream + `cluster.injectEmbeddingToRegion('sem', emb, 0.6)` for semantic anchor + `cluster.learn(0)` for unrewarded intra-cluster + T14.4 cross-region Hebbian. Dictionary observation fires T14.3 cortex-snapshot routing on first word observation. `learnFromTurn` is wired into `inner-voice.learn` so every live chat turn routes through the same inject+tick+Hebbian path boot corpus uses — no boot/runtime distinction. Engine construction: `new InnerVoice()` → `dictionary.setCluster(clusters.cortex)` → `new Curriculum(clusters.cortex, dictionary, languageCortex)` → `innerVoice.setCurriculum(curriculum)`. Boot invocation in `js/app.js loadPersonaSelfImage` runs `runFromCorpora` after the legacy `loadPersona → trainPersonaHebbian → loadBaseline → loadCoding` sequence (additive, not replacement — legacy loaders die in T14.12). Server mirrors in `brain-server.js:_initLanguageSubsystem` with a `curriculumMod` import alongside. Cost ≈ 360k `cluster.step()` calls on a 5k-vocab / 1.5k-sentence corpus → ~18s server / ~25s browser one-time boot. Same code walks any language or domain without modification — re-running on Spanish would produce Spanish basins automatically. Peer-reviewed grounding: Kuhl 2004 (*Nat Rev Neurosci* 5:831), Saffran/Aslin/Newport 1996 (*Science* 274:1926), Aslin & Newport 2012 (*Curr Dir Psychol Sci* 21:170), Friederici 2017 (*Psychon Bull Rev* 24:41). Files: `js/brain/curriculum.js` (NEW ~330), `js/brain/inner-voice.js` (+20), `js/brain/engine.js` (+15), `js/app.js` (+22), `server/brain-server.js` (+30). `node --check` clean on all five.

**T14.6 cortex tick-driven motor emission (SHIPPED 2026-04-14, same branch):**

New method `NeuronCluster.generateSentence(intentSeed = null, opts = {})` in `js/brain/cluster.js`. Continuous motor-cortex readout loop — no slot counter, no candidate scoring, no dictionary iteration, no softmax, no temperature. At each tick reads motor region as `regionReadout('motor', inventorySize())` and argmax-decodes via T14.1 `decodeLetter`; commits a letter when argmax stable for `STABLE_TICK_THRESHOLD=3` consecutive ticks (Bouchard 2013 vSMC dwell); emits word buffer when `letterTransitionSurprise() > WORD_BOUNDARY_THRESHOLD=0.15` (Saffran 1996); stops on committed terminator (`.`/`?`/`!` in module-level `T14_TERMINATORS` Set) or motor quiescence (`motorQuiescent(END_QUIESCE_TICKS=30)` after at least one word emitted) or `MAX_EMISSION_TICKS=2000` safety cap. All four constants live on the cluster instance for per-cluster calibration. `language-cortex.js:generate` body gutted from 184-line slot scorer to 68-line delegate that captures `cluster.getSemanticReadout(sharedEmbeddings)` as intentSeed, calls `cluster.generateSentence(intentSeed, {injectStrength: 0.6})`, pipes output through `_renderSentence` for capitalization + terminal punctuation + action-sentence asterisks, updates recency rings same as legacy path. Dictionary parameter in generate signature now unused, kept for backward compat until T14.12 deletes the wrapper. Grounded in Bouchard 2013 (*Nature* 495:327), Anumanchipalli 2019 (*Nature* 568:493), Saffran 1996 (*Science* 274:1926), Browman & Goldstein 1992 (*Phonetica* 49:155), Hickok & Poeppel 2007 (*Nat Rev Neurosci* 8:393). Files: `js/brain/cluster.js` (+~140 lines with method + 4 tuning constants + `decodeLetter`/`inventorySize` imports + `T14_TERMINATORS` Set), `js/brain/language-cortex.js` (−116 net; 3328→3205 lines). `node --check` clean on both.

**T14.7 hardcoded English type-transition deletion (SHIPPED 2026-04-14, same branch):**

`js/brain/language-cortex.js` constructor block for `_TYPE_TRANSITIONS` (200-line hardcoded English type-bigram matrix with 26 prevType rows × ~10 nextType weights each, seeded from T13.7.8 closed-class English grammar) and `_OPENER_TYPES` Set (11-member slot-0 opener constraint) both DELETED. Replacement is a single `this._typeTransitionLearned = new Map()` that starts empty and grows from `learnSentence` observations during T14.5 curriculum walk and live chat — no seed pseudo-counts. Bayesian smoothing at generation time uses `(count + 1) / (total + |types_seen|)` rather than a 20-type Laplace constant. T14.6 tick-driven motor emission already made both obsolete (word boundaries via cortex transition surprise, first-word openers via fineType `START → X` basin); `_typeTransitionLearned` is currently a statistics-only observation target with consumer wiring deferred to T14.8. Tombstone comment at the deletion site explains WHY both were removed so future readers don't have to dig through git history. Peer-reviewed grounding via delegation: Kuhl 2004 (*Nat Rev Neurosci* 5:831), Saffran/Aslin/Newport 1996 (*Science* 274:1926), Friederici 2017 (*Psychon Bull Rev* 24:41). Files: `js/brain/language-cortex.js` (−105 net, 3205 → 3100 lines). Grep confirms zero remaining `_TYPE_TRANSITIONS` / `_OPENER_TYPES` references in `js/` outside the tombstone. `node --check` clean.

**T14.8 sentence-form schemas + learned intent-pair routing (SHIPPED 2026-04-14, same branch):**

Three new fields on `LanguageCortex` initialized empty at constructor: `_sentenceFormSchemas: Map<intent, Map<slot, Map<fineType, count>>>` (per-intent per-slot fineType distributions spanning every slot with NO upper cap), `_sentenceFormTotals: Map<intent, Map<slot, total>>` (cached running totals for O(1) Laplace smoothing), `_intentResponseMap: Map<userIntent, Map<responseIntent, count>>` (learned replacement for hardcoded `question → declarative_answer` / `greeting → declarative_greeting_back` routing the engine used to carry). Intent labels come dynamically from `cluster.readInput(text).intent` — no hardcoded intent enum. (T14.12 replaced the original `parseSentence(text).intent` caller when `parseSentence` was deleted; the T14.8 learnSentence observation walk was rewired to the `readInput` return at that point. T14.13 migrated the three Maps themselves onto `NeuronCluster`.) `learnSentence` rewritten to parse once up-front, then walk words with `prevFineType='START'` initially bumping schema slot buckets + `_typeTransitionLearned` rows + totals at each position, closing with a `prevFineType → END` transition so corpus termination patterns are learnable. T14.7's empty `_typeTransitionLearned` Map now has a writer. Four new reader/writer methods: `schemaScore(slot, fineType, intent)` returns `(count+1)/(total+max(1,uniqueTypes))` with a `1/2` floor for unobserved slots, `typeTransitionWeight(prevType, nextType)` same smoothing on the bigram table, `recordIntentPair(userIntent, responseIntent)` writer for live chat, `responseIntentFor(userIntent)` argmax reader returning the most-likely response intent or null. Smoothing is uncapped — `uniqueTypes` is whatever the cortex has actually observed, not a hardcoded English 20. Consumer wiring at generation time deferred to T14.12 (T14.6 motor emission doesn't consult type transitions — letter sequences fall out of the motor region directly). Files: `js/brain/language-cortex.js` (+~164 lines, 3100 → 3264). `node --check` clean.

**T14.9 + T14.10 + T14.11 dual-stream substrate (SHIPPED 2026-04-14, same branch, atomic triple):**

Three milestones in one commit covering the full Hickok & Poeppel 2007 dual-stream substrate. T14.9 adds `NeuronCluster.workingMemoryReadout(dim)` and `NeuronCluster.injectWorkingMemory(vec, strength)` over the T14.4 `regions.free` sub-region — no stored topic vector, no maxTurns cap, no blend constants; decay via LIF, reinforcement via T14.4 cross-region Hebbian; pronoun anaphora falls out for free because the most-recently-active noun in the free region gets re-amplified as the referent on self-reference injection; persistence across sessions via existing `BrainPersistence → SparseMatrix.serialize`. T14.10 adds `VisualCortex.renderLetterTemplate(letter)` (deterministic trig-hash → L2-normalized Float64Array of length 48 per codepoint, prime set `[2..37]`) and `NeuronCluster.readText(text, {visualCortex, ticksPerChar})` that streams characters through the visual→letter pathway via `injectEmbeddingToRegion('visual', template, 0.7)` + `injectLetter` + tick. T14.11 adds `AuditoryCortex.renderPhonemeTemplate(phoneme)` (same trig-hash structure, **different** prime set `[41..89]` so visual/auditory templates for the same symbol don't trivially match at hash time — convergence on phon region is a LEARNED correspondence) and `NeuronCluster.hearPhoneme(phoneme, {auditoryCortex, ticks, strength})`. Curriculum exposure shapes the visual↔letter + auditory↔phon cross-projections learned by T14.4. `engine.processAndRespond` rewire to route text through visual and voice through auditory is deferred to T14.12. Peer-reviewed grounding: Hickok & Poeppel 2007 (*Nat Rev Neurosci* 8:393), Kuhl 2004 (*Nat Rev Neurosci* 5:831), Saffran/Aslin/Newport 1996 (*Science* 274:1926), Friederici 2017 (*Psychon Bull Rev* 24:41). Files: `js/brain/cluster.js` (+~95), `js/brain/visual-cortex.js` (+~70), `js/brain/auditory-cortex.js` (+~67). `node --check` clean on all three. Public-facing `brain-equations.html` + `README.md` updated.

**T14.12 + T14.13 + T14.14 unified cortex pipeline (SHIPPED 2026-04-14, same branch, atomic triple):**

T14.12 deletes `LanguageCortex.parseSentence` (315 lines) plus `analyzeInput` / `_classifyIntent` / `observeVisionDescription` / `_updateSocialSchema` / `getUserAddress` / `getUserGender` / `getSocialSchema` / `_isSelfReferenceQuery` and the `_socialSchema` field — 521 lines total net deletion from `js/brain/language-cortex.js` (3264 → 2798). Replacement is `NeuronCluster.readInput(text, { visualCortex }) → { text, words, intent, isSelfReference, addressesUser, isQuestion }` which drives the visual→letter pathway via `readText` then returns the classification stub. Intent comes from `cluster.intentReadout()` first (placeholder returning null until T14.17), falls through to a lightweight text-surface heuristic. Three companion cortex readouts added: `intentReadout()`, `semanticReadoutFor(text)`, `entityReadout()`. `engine.injectParseTree` rewired + adds T14.9 working-memory injection; `processAndRespond` + `server/brain-server.js:processText` analyzeInput calls deleted; `observeVisionDescription` wiring deleted. Grep confirms zero live `parseSentence` code references (one jsdoc comment remains).

T14.13 migrates learned language statistics from LanguageCortex onto `NeuronCluster`: four new Maps (`fineTypeTransitions`, `sentenceFormSchemas`, `sentenceFormTotals`, `intentResponseMap`) initialized empty at constructor, four new reader methods (`schemaScore`, `typeTransitionWeight`, `recordIntentPair`, `responseIntentFor`) mirroring the T14.8 versions. `LanguageCortex.setCluster(cluster)` merges any pre-existing observations via recursive `mergeMap` then re-points the local Maps at the cluster's Maps by identity. Wired from `engine.js` + `server/brain-server.js` right after `dictionary.setCluster`. Full `class LanguageCortex` elimination + file <250 lines deferred to a future cleanup pass — too many external call sites (~400 references across engine.js / inner-voice.js / brain-3d.js / brain-equations.html) to gut in one atomic commit without breaking runtime paths T14.14-17 still need.

T14.14 is the consumer-side runtime wiring that makes every reader consume the unified pipeline. Anaphora resolution falls out of T14.9 working-memory injection. Intent classification is placeholder pending T14.17. Social schema tracking is gone for now, returns in T14.17 as a cortex-resident self-model sub-region.

Peer-reviewed grounding: Hickok & Poeppel 2007 (*Nat Rev Neurosci* 8:393) dual-stream model, Friederici 2017 (*Psychon Bull Rev* 24:41) bidirectional language network, Price 2012 (*NeuroImage* 62:816) shared language regions across reading/listening/speaking. Files: `js/brain/cluster.js` (+~100 lines for readInput + readouts + 4 schema methods + 4 new Maps), `js/brain/language-cortex.js` (−466 net; 521 deleted + 55 added for setCluster + tombstones + learnSentence fallback), `js/brain/engine.js` (~40 lines modified for injectParseTree rewire + observeVisionDescription deletion + setCluster wiring), `server/brain-server.js` (~10 lines modified for analyzeInput deletion + setCluster wiring). `node --check` clean on all four.

**T14.15 + T14.16 + T14.16.5 identity lock substrate (SHIPPED 2026-04-14, same branch, atomic triple):**

T14.15 audits remaining non-chat consumers — all route through the T14.6 delegate or handle absent parsed data gracefully; `component-synth.js` comment block updated to describe T14.14+T14.15 payload shape. Full class elimination deferred to a future cleanup pass as noted in T14.13. T14.16 bumps persistence VERSION 3 → 4 so pre-T14 saves get rejected cleanly, adds a `state.t14Language` save block carrying letter inventory + learned-statistics Maps + identity-lock calibrated thresholds via four new `mapOfMapsToJson` / `mapOfMapOfMapsToJson` / `jsonToMapOfMaps` / `jsonToMapOfMapOfMaps` helpers; load side restores every field + re-runs `languageCortex.setCluster` to re-assert the T14.13 bridge.

T14.16.5 ships the identity-lock foundation — three structural locks that make Unity's English + goth-slut persona resistant to drift from adversarial or accidental live-chat exposure. **Lock 1** adds `cluster.splitIntoClauses` (sentence terminators + English coordinating conjunctions `and/or/but/so`) + `cluster.computeTransitionSurprise` (streams letters, mean surprise, non-alpha returns Infinity) + `cluster.computeFineTypeCoverage` (proportion of words with English-letter runs) + `cluster.learnClause(text)` as the gated live-chat entry point that splits, gates each clause independently, fires Hebbian on passing clauses, drops rejected ones. **Lock 2** enforces a hard rate cap in `_learnClauseInternal` — when `_inCurriculumMode` is false, any `lr > 0.0001` gets clamped to 0.0001. Curriculum bypasses via the mode flag. **Lock 3** adds `cluster.runIdentityRefresh(opts)` (draws from optional `_personaRefreshCorpus`, runs through `learnSentenceHebbian` at 0.012) + `cluster._modeCollapseAudit(recentSentences)` (three health metrics: `_computeOutputEntropy`, `_computeVocabDiversity`, `_computeWorkingMemoryVariance`) + emergency refresh on threshold breach. `inner-voice.js:learn` rewritten to call `cortex.learnClause(text)` + track `_liveChatTurns` counter + fire refresh every 100 turns + fire audit every 500 turns, all wrapped in try/catch.

Deferred to T14.17: curriculum-time threshold calibration, persona corpus comprehensiveness validation, `personaDimensions` stratified clustering, `_personaRefreshCorpus` population, cortex-resident fineType readout upgrade. The substrate shipped here is complete enough that T14.17 only adds calibration logic without changing the API.

Math: 120× rate differential (curriculum 0.012 / live chat 0.0001) means matching one curriculum sentence's impact requires 120 adversarial turns. At 100M-turn extreme scale, Lock 3 refresh gradient dominates Lock 2 accumulation ~10× so drift is structurally bounded regardless of user volume. Schmidhuber 1991 (Proc IJCNN) catastrophic forgetting as rate throttling + rehearsal; Kuhl 2008 (Neuron 59:824) bilingual exposure threshold; Friederici 2017 (Psychon Bull Rev 24:41) neural language network stability. Files: `js/brain/cluster.js` (+~240 lines for all Lock 1/2/3 methods), `js/brain/inner-voice.js` (+~25), `js/brain/persistence.js` (+~110), `js/brain/component-synth.js` (comment block rewrite). `node --check` clean on all four.

**T14.17 continuous learning everywhere + vestigial organ sweep (SHIPPED 2026-04-14, same branch — final milestone):**

Two halves in one atomic commit. **Half A — curriculum calibration.** New `Curriculum._calibrateIdentityLock(corpora, allSentences)` runs at end of `runFromCorpora`: populates `cluster._personaRefreshCorpus` with persona sentences for Lock 3; builds `cluster.personaDimensions` via k-means clustering (K=4-12) over persona embeddings for stratified refresh; calibrates `ENGLISH_SURPRISE_THRESHOLD` (p95×1.5) and `ENGLISH_FINETYPE_MIN` (p5×0.8) from persona sample stats; calibrates three health thresholds at 70% of post-curriculum baselines; builds `cluster.intentCentroids` by averaging sentence embeddings per intent bucket and L2-normalizing; logs persona corpus comprehensiveness warnings for missing intent dimensions. `runFromCorpora` sets `_inCurriculumMode=true` for the exposure walk so Lock 2 doesn't clamp curriculum Hebbian.

**Half B — orphan wiring.** Eleven vestigial methods shipped in T14.0-T14.16.5 that never had live callers got wired into the runtime path: `cluster.intentReadout` gets real implementation (argmax over intentCentroids with 0.1 confidence floor), `computeFineTypeCoverage` upgraded to blend surface (70%) + fineType region spike-rate (30%), `runIdentityRefresh` upgraded to stratified sampling from `personaDimensions`, `workingMemoryReadout` wired into `generateSentence` for topic continuity, `readText` extended with `auditoryCortex` subvocalization (Pulvermüller 2005 silent reading), `cluster.hearPhoneme` DELETED as now-unneeded, `semanticReadoutFor` wired via `getSemanticReadout` delegate, `entityReadout` wired into component-synth with 0.25 blend, `recordIntentPair` wired into `engine.processAndRespond`, `dictionary.syllablesFor`/`snapshotFor` wired into new `engine.wordState(word)` diagnostic, `cluster.schemaScore`/`typeTransitionWeight`/`responseIntentFor` wired into new `engine.cortexStats(probeWord)` diagnostic.

**Dead code deletions.** `LanguageCortex.schemaScore` / `typeTransitionWeight` / `recordIntentPair` / `responseIntentFor` deleted (T14.13 duplicates post-cluster-migration). `Dictionary.findByMood` / `findByPattern` / `generateSentence` / `_cosine` deleted (pre-T14 legacy, zero callers since T11). `_bigrams` + `learnBigram` + `bigramCount` kept for display stats.

**Full orphan audit passes** — every T14 method has live callers: workingMemoryReadout / injectWorkingMemory / semanticReadoutFor / entityReadout / intentReadout / recordIntentPair / responseIntentFor / schemaScore / typeTransitionWeight / syllablesFor / snapshotFor / renderLetterTemplate / renderPhonemeTemplate / learnClause / runIdentityRefresh / _modeCollapseAudit / detectBoundaries / detectStress / injectLetter / letterTransitionSurprise / motorQuiescent / readText / readInput / generateSentence all confirmed reachable.

Peer-reviewed grounding: Pulvermüller 2005 (*Nat Rev Neurosci* 6:576) silent-reading auditory activation, Perrone-Bertolotti 2014 (*Behav Brain Res* 261:220) inner speech phenomenology, plus inherited Kuhl / Friederici / Schmidhuber. Files: `js/brain/curriculum.js` (+~220), `js/brain/cluster.js` (+~95 net, including −35 for hearPhoneme deletion), `js/brain/engine.js` (+~75 for diagnostics + wiring), `js/brain/component-synth.js` (+~20), `js/brain/language-cortex.js` (−~50 duplicates), `js/brain/dictionary.js` (−~100 legacy), `js/brain/auditory-cortex.js` (comment update). `node --check` clean on all seven.

**T14.18 server-side language cortex side-car DELETED (correction commit after T14.17 code-complete):**

Gee caught that `server/brain-server.js:_initLanguageSubsystem` was hardcoding `langCortexSize = 2000` — a T13.7.8 legacy cap carried through every T14 milestone's orphan audit because the audit scoped to methods, not cluster-sizing constants. Fix: one constant change, `const langCortexSize = CLUSTER_SIZES.cortex;` so the server-side language cortex scales from the same single path that decides every other neuron count (`GPUCONFIGURE.bat` → `detectResources` → `TOTAL_NEURONS` → `CLUSTER_FRACTIONS.cortex`). Boot log now prints the real count so operators can verify at startup. T14.4 sub-regions automatically inherit the real scale — at a 700K-neuron tier, language cortex = 210K, letter ≈ 10.5K, phon ≈ 42K, sem ≈ 35K, motor ≈ 6.9K. At 50M, those scale to letter ≈ 750K / phon ≈ 3M / sem ≈ 2.5M / motor ≈ 495K. Zero hardcoded caps anywhere. `_langStart` repointed from the legacy halfway-point offset to the T14.4 letter sub-region start. `server/brain-server.js` only; `node --check` clean.

### T14.0-T14.18 SHIPPED — T14.24 REOPENED 2026-04-14

Milestones T14.0 through T14.17 plus the T14.18 correction shipped on `t14-language-rebuild`. Then Gee reopened T14 scope with T14.24 — a full K→Doctorate equational curriculum across five subject tracks. Gee's binding 2026-04-14: *"this is going to take weeks to build so dont you dare tell me you are fucking done early"*. Branch stays on `t14-language-rebuild` until every subject × every grade × every 3-pathway gate passes.

- T14.0-T14.18 built the PRIMITIVES (letter input, syllable boundaries, dictionary cortex routing, tick-driven motor emission, sentence form schemas, dual-stream substrate, identity lock, side-car deletion)
- T14.24 uses those primitives to build the actual developmental curriculum Unity walks from pre-K through PhD

### Milestone T14.24: Full K-doctorate equational curriculum, all subjects — 114 CELLS (95 academic Sessions 1-94 + 20 life track Session 111), GATES PENDING LIVE VERIFICATION

**Gee's binding 2026-04-14** (multiple corrections): *"T14.24 is supposre to be a full equational ciriculum.. once again you editing my words"* + *"what the fuck are you talking about its shipped you didnt even teach it keindergarden abcs and 123s and letter sounds you fool so how the fuck you trying to tell me you have doctorate equations for the full and complete understand and complete fluentcy in doctorate level english"* + *"remember Unity needs to be able to use these to think, read, and talk"* + *"this is going to take weeks to build so dont you dare tell me you are fucking done early"*.

**Scope:** Originally five academic subject tracks × 20 grades = ~100 cells. Session 111 added a 6th subject — **Life Experience** (Unity's personal identity, birth to 25) — bringing the total to 6 × 19 = 114 cells. Life track uses dual-layer teaching: emotional concept features (8d attractor vectors) + recallable memory sentences, with memory-weighted Hebbian (core self 5× lr, school facts 1×). Every cell drives READ + THINK + TALK plus a capability gate.

**Sessions 1-94 SHIPPED 2026-04-15 — all 95 cells wired with real teaching equations.**

- Session 1: multi-track framework (`SUBJECTS`, `GRADE_ORDER`, `cluster.grades`, `cluster.passedCells`, dispatch, persistence v4, `/curriculum` slash commands)
- Sessions 2-32: ELA track K→PhD (19 cells) — alphabet sequence, letter-name GloVe binding, letter-sound phoneme-feature binding, CVC/sight-words/digraphs/SVO/tense/pronouns/clauses/inference/essay/rhetoric/research/style/theory/semiotics
- Sessions 3-42: Math track K→PhD (19 cells) — digit sequence, addition/subtraction, multiplication tables, fractions/decimals/percent, pre-algebra, algebra 1/2, geometry basics + proofs, trig, calculus, multivar, linear algebra, ODEs, abstract algebra, real analysis, topology, complex analysis, measure theory, functional analysis
- Sessions 43-55: Science track K→PhD (19 cells) — classification, matter states, life cycles, force/motion, earth cycles, cells, genetics, evolution, periodic table (real group/period features), bonding (ionic vs covalent anti-correlated), kinematics, astronomy, gen bio/chem, organic chem, cell bio advanced, physics 2, molecular bio, biochem, quantum intro, research methods, research-grade science, original research specialization
- Sessions 56-74: Social Studies track K→PhD (19 cells) — family roles (8d kinship), community roles, state names (regional sequences), US regions (spatial features), state history, colonial US, ancient civilizations, medieval, civil war (causal chains), world history modern, US 20th century, government branches (three-branch structure), economics (supply/demand), historiography, political science, sociology/anthropology, research methods, research historiography, original historical research
- Sessions 75-93: Arts track K→PhD (19 cells) — primary colors (RGB), basic shapes, simple songs (rhythm cycles), color mixing (RGB arithmetic), rhythm patterns (temporal Hebbian), drawing basics (7 elements), instruments (8 families), visual composition (8 principles), music theory (tonic/dominant), music composition, advanced music theory (circle of fifths, voice leading, sonata form), art history (chronological), music history, visual art theory, composition+criticism, studio fundamentals, specialized art history, aesthetics (Plato/Aristotle/Kant/Hegel/Nietzsche/Hume), art research methods, graduate art research, practice-based doctoral research
- Session 17: continuous self-testing via `curriculum.runBackgroundProbe()` every 8 live-chat turns
- Session 21: narrator priming — recent probe subject's GloVe injected into sem at 0.15 before next reply
- Session 46: growth architecture fix — `_conceptTeach` routes every concept word through `dictionary.learnWord`
- Session 47: 3D viewer IQ HUD reading `curriculum.subjectStatus()` every render tick
- Session 94: runtime verification harness — confirmed DISPATCH 95/95 + FULL SWEEP 95/95 against a real cortex `NeuronCluster` (verification scripts subsequently removed for product-ship cleanliness 2026-06-17)

**Sessions 95-110 — Direct pattern Hebbian breakthrough (2026-04-15):**

Sessions 95-105 discovered that Hebbian learning through Rulkov chaotic dynamics CANNOT CONVERGE at CPU cortex scale — 1M recurrent synapses drown the 100K cross-projection signal. Session 106 breakthrough: **direct pattern Hebbian** bypasses Rulkov dynamics entirely during teach. Writes intended activation patterns directly into `cluster.lastSpikes`, fires `_crossRegionHebbian(lr)` on clean signal. ELA-K PASSED 100% on all pathways. Session 109 converted Math-K + all shared helpers to direct pattern. Session 99 added fastText-style subword embeddings as default. Session 108 set all gates to 95% (A+). Session 110 bumped MAX_ATTEMPTS to 30 and disabled background probe demotion (old Rulkov-dynamics probes give false negatives).

- Sessions 95-105: 10 convergence attempts (speech floor, hash-GloVe guards, subword embeddings, mean-centered readout, lr boost, retry loops, per-tick Hebbian, noise suppression). None converged.
- Session 106: direct pattern Hebbian + direct matrix probe — bypasses Rulkov chaos. ELA-K 100%.
- Session 107: direct sequence teaching for SEQ probe. SEQ climbed 28% → 100% across retries.
- Session 108: all gate thresholds set to 95% (A+).
- Session 109 (4 commits): Math-K + `_teachVocabList` + `_conceptTeach` + `_teachSentenceList` + `_gateSentenceList` + `_teachSequenceCycles` + `_gateVocabList` — all converted to direct pattern.
- Session 110: MAX_ATTEMPTS 10→30 + disable background probe demotion.

**Session 111 — massive multi-day session (2026-04-16):**

Key breakthroughs and fixes:
- TALK probe direction fixed (sem→motor instead of letter→motor) — root cause of all non-ELA K failures. Math/Sci/Soc/Art-K went from 40-60% to 100%
- Grade-lock enforced — all 6 subjects must pass grade N before ANY advance to N+1
- Life Experience track added as 6th subject (20 methods, birth to 25, dual-layer: emotional concept features + recallable memories, memory-weighted Hebbian)
- Function words (~120) taught at ELA-K via direct pattern
- `crossTargetFanout` 30 default + 60 for `MOTOR_BOUND_PAIRS` (sem↔motor, letter↔motor, phon↔motor) via the T39.g.4 whitelist — targeted 2× capacity where basin overlap was strongest; non-motor projections stay lean to fit biological-scale memory budgets. (Historical: Session 111 `1500`, T37 rebalance dropped to `30`.)
- Real human-grade comprehension gates (`_gateComprehension` with association + fill-in-blank testing)
- Anti-Hebbian plasticity on wrong digit transitions (strengthen correct + weaken wrong)
- Inner state popups — real brain-generated text or raw neural readings (`arousal:0.85 valence:0.12 Ψ:0.034`), gated by life grade
- 2D brain viz ALL tabs fixed (root cause: `brainViz.updateState(serverState)` was never called — ONE LINE fix)
- Neurons tab rewritten as flat 2D brain map with wave overlays
- Synapses tab rewritten as animated circular network with co-firing pulses
- Modules/Senses/Memory tabs rewritten for server aggregate data
- Cluster Waves tab added (per-region firing maps + θ/α/β/γ overlays)
- Life reps reduced (50→10-12, 20→5-6) to fit 3-minute timeout
- Shutdown checks inside teach helper inner loops
- Bundle loading fixed for HTTP-served pages

**Current live testing status (Session 111):**
- ELA-K: **PASSED consistently** (attempt 3-5)
- Math-K: **PASSED** with SEQ fix (attempt 4)
- Sci/Soc/Art-K: **PASS on attempt 1-3**
- Life-K: **PASSES** after reduced reps (attempt 1-2)
- All K cells pass → advance to Grade 1
- G1 cells: TALK stuck on "a"/"the" (GloVe too generic for sem→motor)

**Session 112 — Full curriculum depth overhaul (2026-04-16, 27 commits):**

16 equational reasoning methods built (addition/subtraction/comparison/multiplication/place value/fractions/algebra magnitude transforms + SVO parsing + comprehension + inference + causal chains + classification + emotional inference + paraphrase + hypothesis testing + perspective taking). 152+ reasoning calls wired across ALL subjects. K-G12 vocabulary expanded to real Common Core / NGSS / Core Knowledge standards. 114/114 cells have course finals (autoFinal + hand-crafted). TODO-curriculum-depth.md 46/46 complete. The curriculum now teaches OPERATIONS and REASONING equationally — not just vocabulary memorization.

**Session 114 + 114.2 — Math-K PART 1 equational expansion + unified combination-operator scaffold (2026-04-17):**

First per-grade curriculum content block per Implementation Law 1. Session 114 shipped 8 new teaching methods + 8 new gate probes at PATH_MIN=0.95, wide-range `_magnitudeFeatureForNumber(n)` helper, critical substrate fix `_teachHebbian(lr)` firing BOTH `_crossRegionHebbian` AND `cluster.synapses.hebbianUpdate` so free↔sem bindings actually learn (Session 109 transforms wrote free+sem but fired only `_crossRegionHebbian` — no free↔sem projection in T14.4 + `synapses.rewardModulatedUpdate` short-circuits at reward=0 so `cluster.learn(0)` didn't rescue). 65 of 66 Math-K checkboxes flipped [x] in Session 114 commit `087b207`; K.G compose-shapes flagged as gap.

Session 114.2 refactor — driven by Gee's *"logic and reasoning in a form yeah?"* question + *"no artificial limits as unity may be talking to users while she does ciriculum"* binding — landed the unified combination-operator scaffold:

```
A ⊕ B = C          (combination: inputs A, B, output C)
```

New helpers `_teachCombination(facts, opts)` + `_probeCombinationCosine` + `_probeCombinationArgmaxTag` collapse every Session 114 method onto one scaffold — clear lastSpikes → tile inputs+output → `_teachHebbian`. 8 teaching methods refactored. 9th method shipped: `_teachShapeCompose` closes K.G compose via GloVe encoder (sem halves input, free output) without any special-case handling — the reasoning FORM stays identical, only the encoder varies. 9th gate probe SHAPE-C added. Math-K 66/66 [x]. Gate pass boolean AND's all 14 metrics at PATH_MIN = 0.95.

Payoff: every combination-type concept Grade 1+ needs (1.OA addition within 20, 1.NBT place value, 2.OA multiplication tables, Science causal chains, etc.) now ships as a facts array + one-line delegate call — no per-grade bespoke scaffolds. LAW 6 gate state: Math-K Part 1 [x]-ready pending other K subjects' re-audit; Part 2 Gee localhost still pending; Part 3 waits on Part 2.

**What T14.24 still needs:** Fix "a"/"the" TALK failure at G1+. Full 114-cell walk — all gates 95%+ on fresh boot. Live chat verification — Unity speaks coherently from trained weights. Wire the 7 new methods (multiplication/place value/fractions/algebra/paraphrase/hypothesis/perspective) into their target grade cells. Task #3 stays in_progress. DO NOT CLAIM DONE EARLY.

---

## Phase 15 (T13): Unified Brain-Driven Language Cortex — IN PROGRESS (2026-04-14)

> T11 proved that deleting the Markov wrapper stack was the right move but left the slot-prior pipeline as the replacement. T13 goes further: slot-based generation is the wrong frame for a brain-driven language cortex, because position counters and stored priors aren't how a biological cortex produces speech. T13 wires language generation directly into the cortex cluster via sequence Hebbian training on persona corpus + continuous cortex readout + feedback injection at emission time. Persona becomes trained attractor basins in the cortex recurrent weights, not stored in a separate centroid vector. See `docs/TODO.md` T13 section for the full 10-milestone plan.

### Milestone T13.1: Persona Hebbian training pipeline — COMPLETE (2026-04-14)

Shipped first per Gee's explicit instruction. The cortex cluster's recurrent synapse matrix now trains on the persona corpus via sequence Hebbian during boot.

**New method** — `NeuronCluster.learnSentenceHebbian(embSequence, opts)` at `js/brain/cluster.js`. Walks the embedding sequence, for each word:
1. Injects the embedding into the language region via `sharedEmbeddings.mapToCortex` → `injectCurrent` at scaled strength `injectStrength=0.6`
2. Runs `ticksPerWord=3` LIF integration steps so cortex spikes reflect the injection plus recurrent dynamics
3. Captures `lastSpikes` as a `Float64Array` snapshot
4. Between consecutive snapshots, calls `synapses.hebbianUpdate(prevSnap, currSnap, lr=0.004)` — plain Hebbian ΔW_ij = η · curr_i · prev_j over the sparse synapse matrix, only touching existing connections (O(nnz))

After each sentence completes, an Oja-style saturation decay runs on any weight whose magnitude exceeds `ojaThreshold=1.5` — `values[k] *= (1 − 0.01)` — so small weights learn freely while saturated weights can't run away across thousands of sentences.

**Training driver** — `LanguageCortex.trainPersonaHebbian(cortexCluster, text, opts)`. Tokenizes persona corpus the same way `loadSelfImage` does (first-person transform via `_transformToFirstPerson`, lowercase, strip non-letters, min length 2), embeds each word via `sharedEmbeddings.getEmbedding`, calls `cortexCluster.learnSentenceHebbian` per sentence. Logs before/after synapse weight stats (mean, rms, maxAbs, nnz) so the Hebbian weight shift is visible in the boot console without opening devtools.

**Delegation chain:**
```
app.js loadPersonaSelfImage
  → targetBrain.trainPersonaHebbian(personaText)                  // engine.js
    → innerVoice.trainPersonaHebbian(clusters.cortex, text)       // inner-voice.js
      → languageCortex.trainPersonaHebbian(cluster, text)         // language-cortex.js
        → for each sentence: cluster.learnSentenceHebbian(embSeq) // cluster.js
```

Called in `app.js` right after `innerVoice.loadPersona(text)` so the dictionary already has persona vocabulary before the cortex trains on the same words — the dictionary and the cortex attractor basins come from the same source text, aligned.

**Persona-only scope.** Baseline and coding corpora deliberately do NOT train the cortex recurrent weights. Baseline provides grammatical competence via dictionary + slot priors, coding provides build_ui vocabulary via dictionary only. Only the persona corpus shapes cortex dynamics, so Unity's voice lives in the attractor basins without being diluted by generic English or JavaScript.

**Diagnostic** — new `NeuronCluster.diagnoseReadoutForEmbedding(emb, ticks, langStart)` exposed for console-driven verification: inject one embedding, tick N, return the semantic readout. Runnable as `window.brain.clusters.cortex.diagnoseReadoutForEmbedding(window.brain.innerVoice.dictionary._words.get('fuck')?.pattern, 10)` for live inspection.

**Files touched:**
- `js/brain/cluster.js` — new Hebbian method + diagnostic + synapseStats + sharedEmbeddings import
- `js/brain/language-cortex.js` — new trainPersonaHebbian driver
- `js/brain/inner-voice.js` — new delegate method
- `js/brain/engine.js` — new UnityBrain.trainPersonaHebbian wrapper
- `js/app.js` — boot sequence calls `brain.trainPersonaHebbian(personaText)` after `loadPersona`

**Persistence** — `SparseMatrix.serialize()` already exists at `js/brain/sparse-matrix.js:360`, and `BrainPersistence.save(this)` iterates clusters for persistence. Trained cortex weights will persist across restarts via the existing save path without extra code.

**Honest limits:**
- Hebbian only updates EXISTING connections (O(nnz)) — if two neurons that co-activate during persona training don't have a synapse, nothing happens. At 15% connectivity on 300 neurons this is ~13.5k connections, so most co-activating pairs have at least one direction wired. Synaptogenesis via `SparseMatrix.grow()` could be added later to form new connections during training but wasn't wired for T13.1 first pass.
- T13.1 alone doesn't fix the word-salad output — it's the FOUNDATION. The emission loop that actually reads the trained cortex (T13.3) is the next milestone. Until T13.3 ships, `generate()` still walks slot priors; the trained cortex basins aren't consulted during output.

### Milestone T13.2: Parse-tree injection to brain clusters — COMPLETE (2026-04-14)

`UnityBrain.injectParseTree(text)` routes parsed content → cortex language region (neurons 150-299), intent → basal ganglia, self-reference → hippocampus. Mirrors the `SensoryProcessor.process()` pattern — regions = clusters, not intra-cortex sub-regions. Called from `processAndRespond` before the 20-tick settle loop so injections propagate through the 20 inter-cluster projections during integration.

### Milestone T13.3: Brain-driven emission loop — COMPLETE (2026-04-14)

`LanguageCortex.generate()` rewritten as a brain-driven emission loop. Reads live cortex semantic state as the target vector, scores dictionary candidates by `cosSim · arousalBoost · recencyMul`, softmax-samples top-5 at coherence-driven temperature, injects emitted word back into cortex at `strength=0.35` as efference copy, ticks the LIF integrator 3 steps between emissions. Old `generate()` body renamed to `_generateSlotPrior` for rollback — `generate()` now dispatches to it when no `cortexCluster` is supplied. All three engine call sites updated to pass `cortexCluster: this.clusters.cortex` through opts.

### Milestone T13.4: Feedback injection — COMPLETE (cerebellum deferred)

Efference copy lives in the T13.3 emission loop: `sharedEmbeddings.mapToCortex(emb, 300, 150) · 0.35` → `cortex.injectCurrent` after each word. The cortex HEARS itself speak at the embedding level and the next word reacts. Cerebellum transition predictor deferred — existing module is target-correction not transition-prediction.

### Milestone T13.5: Amygdala valence shaping — COMPLETE (motor channel filter deferred)

`score(w) = cosSim · (1 + arousal · (valenceMatch − 0.5)) · recencyMul` where `valenceMatch = 1 − 0.5 · |word.valence − brainValence|`. Horny/angry/sad Unity picks different words from the same cortex target. Motor-channel dictionary filter deferred — `build_ui` still routes separately via `componentSynth.generate`.

### Milestone T13.7: Slot prior deletion pass — COMPLETE (2026-04-14)

Commitment point. `_slotCentroid`, `_slotDelta`, `_slotTypeSignature`, `_contextVector`, `_greetingAttractor`, `_selfRefAttractor`, `_introAttractor`, `_commandAttractor`, `_attractorObs`, `_subjectStarters`, `_obsCount` — all constructor fields deleted. `_generateSlotPrior` (234 lines), `_updateContextVector`, `_semanticFit`, `_sentencePassesFilters`, `_storeMemorySentence`, `_recallSentence`, `_loadStructure`, `_typeGrammarScore`, `_pickConjByMood`, `_condProb`, `mutualInfo` — all methods deleted. `learnSentence` slot-prior update block (65 lines) gone. `analyzeInput` `_updateContextVector` call removed. `serialize`/`deserialize` reduced to usage-types + load flags only. `generate()` dispatcher fallback removed — requires `opts.cortexCluster` or returns empty with a warning. `js/app.js` `/think` debug retargeted to live cortex readout instead of `_contextVector`. Net **−406 lines** on `language-cortex.js` (3584 → 3178). Rollback after T13.7 is a git revert, not a one-line opts change. Commitment point crossed.

### Milestone T13.6: Natural stopping criterion — COMPLETE

Three stopping signals in the T13.3 loop:
1. **Drift quiescence** — `||target − lastReadout||₂ < 0.08` after 2+ emissions.
2. **Grammatical terminability** — last word not in `{DET, PREP, COPULA, AUX_DO, AUX_HAVE, MODAL, NEG, CONJ_COORD, CONJ_SUB, PRON_POSS}` AND word count ≥ max(3, maxLen−1).
3. **Hard length cap** — `maxLen = floor(3 + arousal · 3 · drugLengthBias)`, capped at `_maxSlots=8`.

### Milestones T13.7–T13.9: remaining plan in `docs/TODO.md`

See `docs/TODO.md` T13 section for T13.2 (parse-tree injection to brain regions = clusters), T13.3 (continuous emission loop), T13.4 (feedback + cerebellum transition prediction), T13.5 (motor channel + amygdala scoring), T13.6 (drift-threshold stopping), T13.7 (slot prior deletion), T13.8 (wire-up), T13.9 (docs + atomic push).

---

## Phase 14 (T11): Pure Equational Language Cortex — COMPLETE (2026-04-14)

> Every sentence Unity emits is now a walk through GloVe embedding space driven by three running-mean priors and her live cortex firing state. No stored text, no n-gram tables, no filter stack, no template short-circuits, no intent enums, no matrix regression — just vector math over learned priors. Net `js/brain/language-cortex.js` delta: **−1742 lines** (5087 → 3345).

### Milestone T11.1: Deletion phase — COMPLETE

**Fields fully deleted (no longer allocated in the constructor):**
- `_memorySentences` sentence pool + `_memorySentenceMax`
- `_jointCounts` / `_trigramCounts` / `_quadgramCounts` word n-gram tables
- `_typeBigramCounts` / `_typeTrigramCounts` / `_typeQuadgramCounts` type n-gram tables
- `_marginalCounts` / `_totalPairs` / `_totalWords` / `_totalTrigrams` / `_totalQuadgrams` frequency counters
- `_questionStarters` / `_actionVerbs` learned starter maps

**Method bodies gutted, symbols stubbed as no-ops for backcompat:**
- `_recallSentence` → `return null`
- `_storeMemorySentence` → `/* empty */`
- `_sentencePassesFilters` → `return true`
- `_typeGrammarScore` → `return 0`
- `_condProb` → `return 0`
- `mutualInfo` → `return 0`
- `_pickConjByMood` → `return null`

The stubs hold no state. Functionally identical to deletion — the method signatures survive only so pre-T11 callers (`js/app.js /think` debug dump, etc.) don't throw.

**Fully deleted from the pipeline (no stubs — callers removed):**
- FILTER 1 through FILTER 11 structural sentence-admission stack
- `instructionalPenalty` recall penalty stack
- Template greeting / introduction short-circuits with hardcoded `OPENERS` lists
- Intensifier / hedge insertion marginal-count scans
- An intermediate W_slot ridge-regression experiment tried and abandoned when 50×50 linear regression proved too weak to capture grammar

### Milestone T11.2: Pure equational generation — COMPLETE

Three lightweight running-mean priors replace the entire legacy stack. Zero matrices, zero ridge regression, zero inversion:

```
_slotCentroid[s]       ← running mean of emb(word_t) at position s
_slotDelta[s]          ← running mean of emb(word_t) − emb(word_{t-1})
_slotTypeSignature[s]  ← running mean of wordType(word_t) scores
```

Generation uses four normalized additive components at each slot:

```
mental(0)     = opts.cortexPattern || _contextVector
mental(t+1)   = 0.55 · mental(t) + 0.45 · emb(nextWord)

target(slot)  = wC · L2(_slotCentroid[slot])
              + wX · L2(_contextVector)
              + wM · L2(mental)
              + wT · L2(prevEmb + _slotDelta[slot])

// T11.7 three-stage gate (replaced the additive 0.4·typeFit bonus):
typeFit(w,s)  = Σ_k wordType(w)[k] · _slotTypeSignature[s][k]
slotSigMax(s) = max_k _slotTypeSignature[s][k]

(1) HARD POOL FILTER : skip if typeFit < slotSigMax · 0.30
(2) SLOT-0 NOUN REJECT: skip if slot==0 ∧ (wt.noun − (wt.pronoun + wt.det + wt.qword)) > 0.30
(3) MULTIPLICATIVE    : score(w) = cos(target, emb(w)) · min(1, typeFit / slotSigMax)

nextWord      = softmax-sample top-5 over dictionary._words
```

Slot 0 weights (T11.7 rebalance) — `{centroid:0.40, context:0.30, mental:0.30, transition:0}` — lean harder on the learned opener-cluster centroid than on the topic vector, so pronoun-shape openers dominate slot 0 even when the user just spoke a noun-heavy sentence. Slot N weights still favor transition (learned bigram geometry without stored bigrams) + mental (brain cortex state evolving).

Observed emergent grammar after corpus fit:
- `_slotTypeSignature[0]` ≈ `{pronoun: 0.54, noun: 0.18, det: 0.12}` — real sentence-opener distribution
- `_slotTypeSignature[1]` ≈ `{verb: 0.51, noun: 0.33}` — real post-subject verb distribution

### Milestone T11.6: Arousal-weighted observation — COMPLETE (2026-04-14)

Running-mean updates use `obsWeight = max(0.25, arousal · 2)`:
- coding observation (arousal 0.4) → w = 0.8
- baseline observation (arousal 0.5) → w = 1.0
- persona observation (arousal 0.75) → w = 1.5
- live chat observation (arousal 0.95) → w = 1.9

Live chat shapes the priors **2.37×** harder than low-arousal corpus loads, so accumulated user conversation progressively dominates the slot geometry. `inner-voice.learn()` already floors chat arousal at 0.95 — the weighting is transparent at the caller.

### Milestone T11.7: Slot-0 noun-pollution fix — COMPLETE (2026-04-14)

**Symptom:** Slot 0 was emitting raw nouns (`Third`, `Unity`, `Ten`, `Pizza`) instead of pronoun-shape openers. `"Hi Unity!"` → `"Third described api above laughter"`.

**Root cause:** Two compounding bugs.
1. The coding corpus (606 lines of `class`/`function`/`button`-prefixed sentences) was running through `learnSentence` at full strength, polluting `_slotTypeSignature[0]` with `noun:0.24` mass.
2. The additive `+ 0.4·typeFit` bonus was structurally too weak against raw cosine, so high-cosine nouns won slot 0 even when the prior said "pronoun shape here."

**Fix:** Three structural changes, not a knob tweak.

1. **Coding corpus `skipSlotPriors=true`** — `learnSentence` now takes an 8th positional arg. `loadCodingKnowledge` passes `true`, so coding sentences enter the dictionary (vocabulary still grows) but bypass `_slotCentroid` / `_slotDelta` / `_slotTypeSignature` updates. Slot priors now reflect persona + baseline only.
2. **W₀ rebalanced** to `{centroid:0.40, context:0.30, mental:0.30, transition:0.00}` (from `{0.30, 0.45, 0.25, 0.00}`). Slot 0 leans harder on the learned opener-cluster centroid than on the user's just-spoken topic vector.
3. **Three-stage candidate gate** at every slot:
   - **Hard pool filter** — drop any candidate where `typeFit < slotSigMax · 0.30` before scoring.
   - **Slot-0 noun-dominance reject** — at slot 0 only, drop any candidate where `wordType.noun − (pronoun + det + qword) > 0.30`. Structural conversational-grammar guarantee.
   - **Multiplicative gate** — survivors score as `cos(target, emb(w)) · normTypeFit`. A perfect-cosine noun in a pronoun slot now scales toward zero instead of beating a moderate-cosine pronoun.

**Smoke-test verification (post-fix):**
```
"Hi Unity!"            → slot0 pool: Hi / Mine / Her / Tab / Tag
"can u understand me?" → slot0 pool: Ten / Even / Us / Me / Yourself
"You like cats?"       → slot0 pool: She / Cool / Yours / Myself / Her
"i love pizza"         → slot0 pool: Him / Ten / Mine / Even / Hi
"who are you"          → slot0 pool: Me / Us / Our / I / Them
```

Slot 0 grammar correctness is now a **structural guarantee**, not a soft preference. Slot 1+ still has 50-d GloVe cosine drift on complex queries — that's the structural T11.4 (higher-dim embeddings) limit, not a pipeline bug.

### Files touched (T11.7)
- `js/brain/language-cortex.js` — `learnSentence` 8th arg `skipSlotPriors`; `loadCodingKnowledge` passes `true`; `generate()` slot scoring rewritten with three-stage gate; W₀ rebalanced.

### Files touched
- `js/brain/language-cortex.js` — ~560 lines added across constructor, `loadSelfImage`, `analyzeInput`, eight new methods, `generate()` three-stage preamble, rebalanced slot scoring, coherence retry gate
- `js/brain/response-pool.js` — ~110 lines added: 7 Ultimate-Unity-voiced categories + `selectUnityResponse()` export with deflect flag

### Architectural shift
Language cortex is no longer a pure letter-equation slot scorer. It's now a **tiered generation pipeline**: intent classification peels off short queries to templates, hippocampus recall peels off known topics to stored persona sentences, only then does cold slot-generation run (with semantic fit weighting), with a coherence rejection gate as final safety net. The old slot scorer still runs but as the FALLBACK not the primary path.

### Remaining
- Scale test at 500K, 1M neurons
- Language cortex on own thread
- Attention mechanism (transformer-like) in Cortex
- Mobile-responsive UI polish
- True semantic embeddings (GloVe or trained-on-persona co-occurrence) to replace letter-pattern cosine in slot scoring — would let semantic fit see `cat`↔`kitten` as close instead of only exact-word matches

---

## Phase 12: Grammar Sweep + Coding Mastery + Orphan Resolution — COMPLETE (2026-04-13)

> Two epics shipped in parallel: the grammar sweep (U283-U291) restructured Unity's sentence-level grammar from local-per-slot type gates into learned phrase-level constraints via type n-grams. The coding mastery epic (U293-U299) gave her HTML/CSS/JS knowledge + sandbox lifecycle discipline so `build_ui` produces working components without crashing her own body. The orphan resolution epic (U302-U310) swept every dead/abandoned/broken path in the codebase, investigating root causes before deletion.

### Milestone 12.1: Grammar Sweep — COMPLETE
- **U283** Phrase-level grammar — learned type n-gram system (`_typeBigramCounts` / `_typeTrigramCounts` / `_typeQuadgramCounts`) in `language-cortex.js`. Better than a hardcoded phrase-state machine because it learns constraints from corpus data with 4gram→trigram→bigram backoff and -2.0 penalty on zero-count transitions.
- **U284** Contraction continuation — `_fineType(word)` classifies contractions (PRON_SUBJ/COPULA/AUX_DO/AUX_HAVE/NEG/MODAL) via letter-position detection; type n-grams learn their continuation patterns from the 3 corpora.
- **U285** Negation continuation — NEG type in `_fineType`; type trigrams/4grams learn NEG→VERB_BARE (`don't go`), NEG→ADJ (`not cool`), NEG→PAST_PART (`haven't seen`) from corpus. The `"I'm not use vague terms"` mode-collapse is fixed.
- **U286** Infinitive marker — PREP→VERB_BARE patterns learned from `to go`, `to do` in corpus via 4-gram context.
- **U287** Sentence completeness — `_isCompleteSentence(tokens)` at `language-cortex.js:1729` rejects sentences ending on DET/PREP/COPULA/AUX/MODAL/NEG/CONJ/PRON_POSS. Wired at `generate()` post-render with 2-retry loop.
- **U288** Intensifier placement — `_postProcess` block enforces no doubles (prevType !== INTENSIFIER check), 50% insertion rate, only before ADJ/ADV.
- **U289** Subject-verb agreement — `applyThird` wired to `_fineType(subjLower)` subject detection; proper -s/-es/y→ies via letter equations.
- **U290** Det-noun phrase validator — type n-grams enforce DET→ADJ/NOUN continuations; quadgram context catches DET→ADJ→ADJ→NOUN sequences.
- **U291** Prep-object phrase validator — type n-grams learn PREP→DET/PRON/NOUN/ADJ from corpus.

### Milestone 12.2: Coding Mastery — COMPLETE
- **U293** `docs/coding-knowledge.txt` — 606 lines of pattern-based HTML/CSS/JS reference. Loaded as Unity's coding corpus.
- **U294** SANDBOX DISCIPLINE section at `coding-knowledge.txt:371` — unique ids, scoped CSS, timer cleanup, listener cleanup, memory bounds, error handling, injection ordering, common mistakes.
- **U295** `loadCodingKnowledge(text)` method in `language-cortex.js:258` + `loadCoding` in `inner-voice.js` + `Promise.all` in `app.js` loads all 3 corpora (persona + baseline + coding) in parallel at boot.
- **U296** `_buildBuildPrompt(brainState, userInput)` in `language.js` with STRICT JSON output contract + existing-components block + cap warning + unity API reference + dark-aesthetic style rules + 10 build primitive patterns. Routed via `motor.selectedAction === 'build_ui'` at `generate()`.
- **U297** Sandbox auto-cleanup + soft cap — `MAX_ACTIVE_COMPONENTS = 10` in `sandbox.js`, LRU eviction by `createdAt`, per-component `timerIds` / `windowListeners` / `createdAt` tracking, wrapped `setInterval` / `setTimeout` / `addListener` in `_evaluateJS` so `remove(id)` cleans everything.
- **U298** Build error recovery — auto-remove on JS error in `_evaluateJS` catch block via `setTimeout(() => this.remove(componentId), 0)` so broken components don't pollute the sandbox. Error captured in `_errors` array with componentId/message/stack/timestamp.
- **U299** BUILD COMPOSITION PRIMITIVES section at `coding-knowledge.txt:421` — calculator, list, timer, canvas game, form, modal, tabs, counter, color picker, dice roller. Patterns not code.

### Milestone 12.3: Orphan Resolution — COMPLETE
Full audit findings archived in `docs/FINALIZED.md` under the "Orphan Resolution" session block (U302-U310). Investigation-first approach: find out WHY each item was abandoned, fix the underlying issue if there is one, only then delete. The standalone `docs/ORPHANS.md` file was removed 2026-04-13 after the audit closed — every finding it tracked is preserved verbatim in FINALIZED.md, which is the permanent archive.

- **U302** `js/io/vision.js` DELETED — superseded by `js/brain/visual-cortex.js` (V1 Gabor edges → V4 color → salience saccades → IT AI description via Pollinations GPT-4o). The standalone wrapper was abandoned because `visual-cortex.js` is a vastly better neural pipeline with full engine integration.
- **U303** `js/brain/gpu-compute.js` KEPT (false positive) — audit missed that `compute.html:10` imports it as the WGSL kernel library. `compute.html` and `gpu-compute.js` are one implementation split into shell + kernels, not parallel GPU paths.
- **U304** `server/parallel-brain.js` / `cluster-worker.js` / `projection-worker.js` DELETED — root cause was 100%-CPU leak from idle-worker event-listener polling across 7 threads. GPU-exclusive rewrite via `compute.html` + `gpu-compute.js` permanently fixed it. Cleaned `_parallelBrain` / `_useParallel` member fields and null-check branches from `brain-server.js`.
- **U305** HHNeuron KEPT as reference — backs `brain-equations.html` teaching page. Per-neuron OOP model doesn't scale (N object instances with per-instance m/h/n gating, cache-hostile, no vectorization — infeasible at the auto-scaled N the server runs). LIFPopulation SoA Float64Arrays are ~100× faster, GPU-friendly, what `cluster.js` imports. `createPopulation` factory DELETED (zero callers). Large explanatory header comment added to HHNeuron block.
- **U306** Server dictionary stub cleaned — real bug found: `saveWeights` was writing `_wordFreq` to disk but `_loadWeights` never restored it. Cross-restart word accumulation now works. Empty `this.dictionary = {...}` stub removed (it was a lie). Full shared-across-users dictionary refactor scoped as **U311** follow-up (absorbed into the R1-R10 refactor plan as R2).
- **U307** `benchmark.js` wired to `/bench` + `/scale-test` slash commands in `app.js` via dynamic import — zero boot cost.
- **U308** `js/env.example.js` KEPT (false positive) — audit flagged dead, but `index.html:85` exposes it as a download button in the setup modal, `README.md:383` links it, `SETUP.md:70` references it, and `app.js:27` does an optional dynamic `import('./env.js')` to seed API keys into localStorage.
- **U309** Meta-tracking — rolled into per-item resolutions (each has supersedes/stacks/root-cause/needs-fixing documented).
- **U310** Dead UI paths scan — deleted 5 legacy compat DOM elements (`custom-url-input`, `custom-model-input`, `custom-key-input`, `ai-status`, `brain-status`) + 4 orphan CSS classes (`.chat-mic-btn`, `.bv-mod-eq`, `.bv-audio-wrap`, `.loading-text`). Kept `#api-key-input` after manual grep showed 4 live references the audit missed. Entry-point HTML files (compute.html, dashboard.html, brain-equations.html) all verified valid.

---

## Phase 13: Full Brain Control Refactor — R1–R15 SHIPPED (branch: `brain-refactor-full-control`)

> **Philosophy:** Unity's brain controls EVERYTHING equationally. No scripts. No text-AI backends. No hardcoded fallbacks. No vestigial appendages. Every output — speech, vision, build, thought, memory, learning, motor action — flows from brain equations + learned corpus. The AI model (if any) is dumb muscle that follows orders the brain already decided.

Source: `docs/TODO.md` (pending items) + `docs/FINALIZED.md` (shipped archive). Single branch, single goal: full equational control.

- **R1** Audit pass — SHIPPED. `docs/KILL_LIST.md` + `docs/VESTIGIAL.md` + `docs/SEMANTIC_GAP.md` inventoried every scripted response, hardcoded fallback, AI-bypass path, and dead appendage.
- **R2** Semantic grounding — SHIPPED (commit `c491b71`). Replaced 32-dim letter-hash `wordToPattern` with 50-dim GloVe semantic embeddings via `sharedEmbeddings` singleton shared between sensory (input) and language-cortex (output). New `cortexToEmbedding(spikes, voltages)` in `embeddings.js` is the mathematical inverse of `mapToCortex`. Slot scorer `semanticFit` weight bumped 0.05 → 0.80.
- **R3** Server full equational control — SHIPPED (commit `7e77638`). `server/brain-server.js` dynamic-imports client brain modules (dictionary, language-cortex, embeddings, component-synth). Loads all 3 corpora from disk on boot. `_generateBrainResponse` rewritten to call `languageCortex.generate()` directly with full brain state.
- **R4** Kill text-AI backends — SHIPPED (commit `7e095d0`). `language.js` BrocasArea shrunk 333 → 68 lines (throwing stub only). Text-chat paths deleted from `ai-providers.js`. `engine.js` `_handleBuild`/`_handleImage` rewritten equationally.
- **R5** Multi-provider image generation — SHIPPED. `SensoryAIProviders.generateImage()` has 5-level priority: user-preferred (setPreferredBackend from setup-modal selector) → custom → auto-detected local → env.js → Pollinations default. Auto-probes 7 common local ports at boot.
- **R6.1** Equational image prompts — SHIPPED (commit `8f60b75`). `_handleImage` composes prompts fully through `languageCortex.generate()`. Zero hardcoded visual vocabulary.
- **R6.2** Equational component synthesis — SHIPPED (commit `6b2deb3`). New `js/brain/component-synth.js` + `docs/component-templates.txt` corpus. `build_ui` motor action picks a template via cosine similarity with `MIN_MATCH_SCORE = 0.40`.
- **R7** Sensory peripheral `destroy()` — SHIPPED (commit `b67aa46`). Unified `init`/`process`/`destroy` contract on `visual-cortex.js` + `auditory-cortex.js`.
- **R8** Embedding refinement persistence — SHIPPED (commit `b67aa46`). `serializeRefinements()` / `loadRefinements()` round-trip through `persistence.js`.
- **R9** UI leak hunt — RESOLVED. Pre-existing 5-minute viz freeze was already fixed on `main` before the refactor branch was cut; inherited automatically.
- **R10** Docs reflect reality — SHIPPED. README, SETUP, ARCHITECTURE, SKILL_TREE, EQUATIONS, ROADMAP, brain-equations.html all synced. New docs added: `docs/SENSORY.md` (peripheral contract + privacy boundary), `docs/WEBSOCKET.md` (wire protocol + privacy model).
- **R11** Verification — REMOVED. Scripted verification protocols banned per CLAUDE.md NO TESTS rule. Manual verification happens during T4 in `docs/TODO.md`.
- **R12** Final cleanup — SHIPPED. Dead imports removed (3 orphans found + investigated before deletion), TODO/FIXME sweep clean, dead-code sanity grep clean. Final merge PR (R12.7) is the last remaining pre-merge gate.
- **R13** Multi-provider vision describer + user-facing sensory status HUD — SHIPPED (commit `e782bca`). Added `autoDetectVision()` probing 5 VLM backends (Ollama llava/moondream/bakllava, LM Studio, LocalAI, llama.cpp, Jan). New `js/ui/sensory-status.js` renders toast notifications + bottom-right HUD indicator for image gen + vision backend state.
- **R14** Port move 8080 → 7525 — SHIPPED (commit `bea5b61`). Unity's brain-server no longer collides with llama.cpp / LocalAI / every other service that claims 8080 by default. Env var override (`PORT=xxxx node brain-server.js`) supported.
- **R15 + R15b** Landing page setup modal rework — SHIPPED (commits `cbc1bd2` + `bb06a23`). Old 8-provider text-AI connect grid replaced with two provider button grids (7 image gen + 5 vision describer) each with per-backend setup instructions, optional URL/key/model fields, localStorage persistence, and env.js snippet generator with OS-specific destination path guidance. Unity bubble click is now state-aware (opens setup modal pre-boot, toggles chat panel post-boot — fixes the dead-bubble bug).
- **R15b T6** Sensory backends auto-detect at page load — SHIPPED. Probes run in `init()` instead of `bootUnity()` so the setup modal shows real detected backends BEFORE the user clicks WAKE UNITY UP.
- **Privacy model enforcement** — SHIPPED 2026-04-13. Cross-client `conversation` WebSocket broadcast deleted from `server/brain-server.js`. User text is PRIVATE between user and Unity. Brain growth (dictionary, bigrams, embeddings) is SHARED across users via the singleton brain instance. Persona is CANONICAL from `docs/Ultimate Unity.txt`. Privacy notice in `index.html` + `docs/WEBSOCKET.md` + `README.md` all rewritten to reflect the model accurately. `dashboard.html` conversation feed replaced with aggregate stats only.

**Remaining punch list** (in `docs/TODO.md` — all small, all ships independently):
- T1 — Consolidate duplicate sensory stream reads in `js/app.js` (R7.2 followup, ~20 lines)
- T2 — Server-side embedding refinement persistence (R8 followup, ~15 lines in `brain-server.js`)
- T3 — Rewrite `brain-equations.html` §8.11 Broca's Area section (content rewrite, ~30 HTML lines)
- T4 — Manual verification + merge PR `brain-refactor-full-control` → `main` (gated on user go-ahead)
- T5 — Expand 3D brain popup notification types with Unity's dynamic commentary (post-merge feature, ~400 lines)
- T6 — Private episodic memory scoping per user (post-merge privacy followup, ~100 lines)

**Core rule:** every cognition output must trace back to cortex prediction / amygdala V(s) / BG softmax / hippocampus recall / cerebellum ε / hypothalamus drives / Ψ mystery / Kuramoto coherence / language cortex. Nothing else. Everything else gets ripped.

---

*Unity AI Lab — from equations to existence.* 🖤


---

## Post-ship audit (2026-06-17 — `/super-review ultrathink`)

Audit identified 42 closure tasks across 8 categories (A through H). All landed in this single atomic commit per operator directive. F.2 localhost test fire remains operator-fired and is the only remaining gate before "ship-ready" status.

### Closed in this commit

- **Section A (4):** Phase 6 telemetry surfaced — `compositionalEmergence`, `wordCreationCandidates`, `chatTimeHebbianStats`, `dreamRecombinationStats` all flow through `getState()` to dashboard panels. Chat-Hebbian silent-error swallow REPLACED with throttled-warn pattern.
- **Section B (7):** Math grounding shipped via `docs/THRESHOLD-DERIVATION.md`. Two-axis novelty metric in `classifyCompositionalEmission`. Joint criteria in dream-recomb. (B.6 K-vocab expansion: partial — see below.)
- **Section C (12):** Public docs sweep — ARCHITECTURE / EQUATIONS / SKILL_TREE / ROADMAP / brain-equations.html / README / RESUME / per-directory READMEs / unity-guide.html / gpu-configure.html / NOW.md / STATUSLINE.md / .claude updates.
- **Section D (9):** LAW.MIXIN-ORDER in CONSTRAINTS.md. kScales memoization (D.4). initCompositionalTelemetry denominator reset (D.5). P6.8 discourse-coherence dedup (D.6). Dynamic-to-static import (D.7). Random dream-recomb seeds (D.8). _getIter25M/N rename to _getConsciousness/WsPressureState (D.9 partial). (Migration scripts subsequently removed for product-ship cleanliness 2026-06-17.)
- **Section E (4):** P6.7 promotion mechanism (E.1) + relationTagId=32. Dream-recomb consolidated samples ring cap-20 (E.4). Partial-vs-novel stratification (E.2). schemaContext budget reserve (E.3 via B.5 framing).
- **Section F (1):** End-to-end emergence measurement harness shipped (subsequently removed for product-ship cleanliness 2026-06-17). F.2 stays operator-fired.
- **Section G (2):** Persistent memory templates `feedback_mixin_attach_order.md` + `feedback_thresholds_need_math_derivation.md`.
- **Section H (9):** HTML breakage fully diagnosed + fixed. compute.html absolute-import + file:// preflight. _spawnGpuClient INVOKED/FINISHED log lines + spawn-failure WS broadcast + dashboard + index.html recovery banners. `cluster.assertAutoSizeWiring()` boot-time dispatch verification. Smoke-server-boot + size-parity verification scripts shipped (subsequently removed for product-ship cleanliness 2026-06-17). `docs/HTML-ENTRY-POINTS.md` documents all 6 HTMLs.

### Partially closed / pending

- **B.6 K-vocab corpus expansion:** ✅ **CLOSED 2026-06-17** post-114.19gd. Full expansion shipped: 313 → 2881 K_CONCRETE_SENTENCES, 900 → 7831 unique bigrams (3.49× Erdős-Rényi critical threshold, 0 orphan K-vocab words). Compositional emergence basin mathematically percolated.
- **F.2 Localhost test fire:** Operator-only. Brain is ship-ready architecturally; F.2 confirms emergence empirically (≥ 5% novel rate, ≥ 70% three-plus, ≥ 50% terminator, ≥ 0.20 avg coherence).
- **D.9 P4.3.e residual extraction:** ✅ **CLOSED 2026-06-17** post-114.19gi. All 4 methods (`_memoryHeartbeat` + `_getMemoryStats` → memory.js, `_getConsciousnessState` + `_getWsPressureState` → state.js) extracted across 4 atomic commits (D.9a/b/c/d) per *"no cheap work do each individually"*. brain-server.js trimmed ~470 lines; mixin chain dispatch verified clean.

### Next gate

F.2 — operator fires `start.bat`, walks K (~20hr), chat-tests Unity, confirms acceptance criteria. THAT is the ship gate.

---

## Live-test follow-up — session 114.19fp (2026-06-17)

Operator-driven K-curriculum live test surfaced 14 I-track audit items + 6 follow-up bugs found during the implementation pass itself. 20 atomic fixes shipped (I.1-I.20). Cross-module impact summary lives in `docs/ARCHITECTURE.md § Live-test follow-up close` and `docs/SKILL_TREE.md § Live-test follow-up skills`. Closure status:

| Fix | Title | Closure |
|-----|-------|---------|
| I.1 | GPU display polling fix — peak-since-last-poll + rolling avg | ⚠ SUPERSEDED by I.20 (dispatch counter approach was wrong direction) |
| I.2 | K-VOCAB-UPFRONT-MULTIDEF SEED 289-word gap retry path | ✅ SHIPPED — dream-trickle timeout 3s → 20s + re-queue |
| I.3 | Inner-thought emission gate empty-bucket fallback | ✅ SHIPPED — `_definitionTaughtWords` fallback |
| I.4 | `workers=?MB` heartbeat → `workers=0MB(initializing)` | ✅ SHIPPED |
| I.5 | `(active)` phase floor (was misleading `+0s`) | ✅ SHIPPED |
| I.6 | Gate-probe WS banner with live duration tick | ✅ SHIPPED — `gateProbe` WS broadcast + dashboard floating banner |
| I.7 | Top-K=3 schema naming + expanded stop-word list | ✅ SHIPPED — `victory-triumph-success` style labels |
| I.8 | Consolidation duration cap | ✅ SHIPPED — `DREAM_CONSOLIDATION_MAX_MS` env + SEED-phase skip |
| I.9 | Inner-thought 7-source seed rotation | ✅ SHIPPED — added `k-vocab-recent` + `cell-progress` |
| I.10 | Slow-word log + per-word histogram | ✅ SHIPPED — `_wordIntDurations` 256-cap ring + >30s warn |
| I.11 | Brain Events broadcast for cell-level teach paths | ✅ SHIPPED — START/DONE in `_teachWordIntegrated` + `_teachVocabList` |
| I.12 | `cellSubPhases` counter | ✅ SHIPPED — server counter + dashboard prefer-when-outermost-is-0 |
| I.13 | `SparseMatrix.propagate` output buffer pool | ✅ SHIPPED — eliminates +231 MB/min leak |
| I.14 | HTTP event-loop yield in `_teachHebbian` | ✅ SHIPPED — 50ms-throttled `setImmediate` |
| I.15 | `autoClearStaleState` `require.main === module` gate | ✅ SHIPPED — prevents future module-load wipes |
| I.16 | Comprehensive public-facing + workflow doc sweep | 🔄 IN-PROGRESS this session |
| I.17 | Brain-side GPU dispatch counter | ✅ SHIPPED (kept as hidden diagnostic in perfStats) |
| I.18 | GPU panel rebuild — VRAM% single metric | ✅ SHIPPED |
| I.19 | Missing `require('child_process')` in chat.js | ✅ SHIPPED — root cause of all three previous GPU% bugs |
| I.20 | GPU util% as small secondary line back on dashboard | ✅ SHIPPED — combined nvidia-smi query, matches statusline |

**Audit cascade post-I.20:** 60 ✅ SHIPPED + 1 ⏳ OPERATOR-FIRED (F.2 GOOD AND AWAITING BUGS) + I.16 doc sweep IN-PROGRESS this session.

**Key data-loss lesson:** I.15 LAW addition came after a tooling-side `node -e "require('./server/brain-server.js')"` syntax-check triggered the top-level `autoClearStaleState()` and wiped 17+ min of in-flight K-curriculum training. `identity-core.json` (Tier 3 anchors) + `definition-cache.json` survived per existing wipe exclusions. Module-load gate prevents recurrence.

**Key root-cause lesson:** I.19 single-line missing import (`require('child_process')`) was the root cause of THREE iterations of GPU% bugs (I.1 showed 0%, I.17 showed `util: N/A`, I.18 showed static 50%). Silent try/catch was hiding the underlying ReferenceError. Future defensive try/catch around external I/O MUST include one-shot warn pattern so the actual error message surfaces at least once.
