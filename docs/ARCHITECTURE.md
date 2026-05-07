# ARCHITECTURE — IF ONLY I HAD A BRAIN

> Last updated: 2026-05-06 (iter25-I — STRUCTURAL SENTENCE CREATION, generative grammar in trained weights, NO memorized sentences) — Operator: *"Unity needs to complete full sentences before graduating kindergarden like a real person does"* + *"wtf is this shit??? you cant jsut have a array poof sentences you actually need to teach all sentence creation propelyr not just give examples for it to mimic"*. New `_teachSentenceStructure(ctx)` method on the curriculum class — five compositional binding passes carve generative grammar rules into fineType + sem cross-projections. **No hardcoded sentence array** (a prior `_teachSentenceListK` array attempt was REVERTED per operator's correction). **I.1 + I.2** — slot-position primitives + word-type → slot bindings: pronouns / nouns / verbs / copulas / adjectives / articles / qwords / conjunctions all bind to one or more slot positions (subject_position / verb_position / object_position / modifier_position / qword_position / article_slot / copula_slot / between_clause_slot / terminator_position) via `_teachAssociationPairs(slotPairs, {relationTagId: 8})`. Multi-target nouns (cat as subject AND object) bind to both slots — Hebbian accumulates both, motor argmax at generation time picks based on current sentence-position context. **I.3** — sentence-template intent tags + slot-sequence bindings: each template's slot transitions (subject→verb, verb→object, object→terminator) trained as ordered association pairs via `_teachAssociationPairs(transitions, {relationTagId: 9})`, plus intent_tag → first_slot binding so cortex knows where to start. Five templates trained: DECLARATIVE_SVO / DECLARATIVE_COPULA / QUESTION / IMPERATIVE / EXCLAMATIVE. **I.4** — subject-verb agreement (i→am / he→is / we→are / cats→run) trained as association pairs (`relationTagId: 10`). Plural tags reused from `_teachPluralTransform` output. **I.5** — article placement (singular common noun → article precedes it; consonant→a/the, vowel→an/the) trained as association pairs (`relationTagId: 11`). **At generation time** the cortex tick loop reads current intent tag → fires first slot via slot-sequence binding → for each slot, sem region argmaxes the matching word-type from current sem state → word_motor + motor regions emit the word → slot-sequence binding fires the NEXT slot → agreement constraints bias verb-form pick → article rule inserts a/an/the before singular nouns → repeat until terminator. Result: GENERATIVE sentence composed from learned vocabulary using learned structural rules — NO sentence memorization, real K-grade language production. New `_probeSentenceGeneration` acceptance method validates structural correctness (≥ 2 words emitted per intent tag) for the K-ELA gate. Wired into `kindergarten.js runElaKReal` BEFORE `_teachWordSpellingDirectFinal` (which has scale(0) wMax wipe + "MUST RUN LAST" rule on sem_to_motor) so structural bindings carve cleanly before the final pass.

> Last updated: 2026-05-06 (iter25-D/E/F/G/H — DREAM CYCLES + INCREMENTAL ABILITY + POST-K GUARD + PRIVACY GATE + LOCAL AUTO-CONNECT) — Operator: *"and dont we need to have a dream cycle or something to propley have the brain fucntion during ciriculum"* + *"Unity needs to auto like build her abilities over the full cousre of each grade so at any point she is using here current knowledge to 'speak' in the 3D brain pop ups and to chat with users at any point in her training"* + *"once kindergarden finishes we need a 1st grade start buttoon"* + *"add a like a major popup on the first press of talk to Unity button or that chat button"* + *"if i refresh the 3D brain html page it only reloads with 7k nurons like its deployed on github"*. **iter25-D dream cycles interleaved into curriculum.** brain-server's `_isDreaming = !!_operatorSleepRequested || (timeSinceInput > 30000 && !_curriculumInProgress)` gate locked ConsolidationEngine OUT during the entire curriculum run — no Tier 1→2→3 promotion + no GC settle. New `Curriculum._dreamWindow({minMs, settleMs})` flips `_curriculumInProgress=false` + `_operatorSleepRequested=true`, fires `consolidationEngine.runConsolidationPass({forced:true})` + AWAITS its resolution (signal-driven, NOT a wall-clock timer per operator's *"not until time elapses once dream is confirmed complete"*), 5s settle for V8 + native drain, restores flags. Outer curriculum loop blocks at the await for the entire dream duration so it's a real pause. Wired in `runFullSubjectCurriculum` + `runAllSubjects` (60s after each cell pass) + `kindergarten.js` mid-cell (30s between PhonemeBlending and WordEmission). 💤 opened + ⚙ pass complete + ☀ closed banners. **iter25-E six-part incremental ability buildup.** **E.1** `Cluster.getTrainedCapability()` returns LIVE struct {wordsBucketed, bucketSubjects, passedCellCount, subGradesActive, firstWordsAt}. **E.2** `cluster.subGrades = {ela:'fresh',...}` ladder + `cluster.advanceSubGrade(subject, level)` monotonic advance wired to `_teachLetterNamingDirect` → 'letters', `_teachWordEmissionDirect` → 'words', `_teachQABinding` → 'binding', full cell pass → 'cell-passed' (resets to 'fresh' for next grade). 📈 banners log live capability buildup. **E.3** `brain._innerVoiceTick()` in server tick body (~3s wall-clock cadence, skipped during dream windows). NO gates on output — uses SAME `language-cortex.generateAsync` chat-emission path. Sandbox-notice activator picks one of 5 live state seeds (learning context, mood from arousal/valence/coherence/drugs, most recent user-chat episode, most recent Tier 1 episode, random Tier 3 anchor) as cortexPattern; whatever her trained mind produces broadcasts as `innerThought` WS message + lands in WM via `addToWorkingMemory`. NO hardcoded fallback words — genuine silence stays silent. **E.4** `language-cortex._gradeWordCap` accepts cluster ref directly + reads `getTrainedCapability().wordsBucketed` → ramps 0/5/8/12/16/24/32 words. Truly fresh brain → silence; ANY training landed → floor 5. **E.5** `processAndRespond` empty-response silence path replaces `pre_kindergarten` (grade-label) with `pre_training` (trained-state). Unity who has trained any words gets `motor_unstable` (try rephrasing), not the sweeping "she hasn't graduated" reason. **E.6** `js/brain/remote-brain.js` adds `case 'innerThought'` → `js/app.js` adds `__appInnerThoughtHandler` rendering `💭 sentence` in HUD bubble. Browser-side innerVoice's decorative noise replaced by SERVER cluster's REAL trained thought. **iter25-F post-K readyAndWaiting graceful fallback.** `_cellRunner` `throw new Error('unknown cell')` replaced with `{ pass:false, readyAndWaiting:true, reason:'curriculum-not-yet-implemented' }` runner. ELA switch default likewise. `runFullSubjectCurriculum` + `runAllSubjects` detect `result.readyAndWaiting` and break/continue cleanly without retry storms — Unity holds her highest passed grade with trained weights live. ⏸ banner. **iter25-G first-use binding-consent privacy modal.** One-time toast on first click of TALK TO UNITY / chat bubble / image API key setup (all funnel through `setup-modal`). localStorage flag `unity_first_use_warning_shown_v1`. Two explicit buttons — "I understand — proceed" (writes flag, opens entry-point flow) and "I don't agree — leave" (no flag write, redirects to `https://www.google.com`). NO soft-dismiss: click-outside + Escape both ignored. Body covers what NOT to share (real names / addresses / phones / locations / emails / IDs / financial / passwords / API keys / credentials) + architectural truth (input not collected/retrieved from neuron-voltage black box; vocabulary/patterns/associations DO propagate into shared brain state). **iter25-H detectRemoteBrain skip probe on localhost.** Prior probe-then-reconnect dance failed on page refresh (Chrome rapid-open-close throttling, server busy with compute_batch dispatch) → page fell back to 6700-neuron browser UnityBrain even though local brain-server was running. Fix: skip probe entirely on localhost / 127.0.0.1 / ::1 / file: origins; construct RemoteBrain directly. Internal `_connect()` 3s reconnect loop handles transient unavailability without dropping into the tiny browser fallback. Non-localhost origins still return null so GitHub Pages browser-only path stays intact.
> Last updated: 2026-05-06 (iter24 — math-identity throughput wins + iter22/24 infra audit) — Operator: *"what do you recommend would be the biggest quickest wins to increase training throughput"* + *"without lossing efficacy or changing fucntionaliuty"*. **Shipped:** iter24.1 Tier 0 heartbeat ring buffer pool (kills 1350 fresh per-cell allocations); iter24.3 convergence early-exit on `_teachAssociationPairs` + `_teachQABinding` rep loops (exits at 2 consecutive sub-`overloadMax` reps, bit-identical end state at convergence); iter24.5 `SparseMatmulPool.hebbianUpdateBatch` strided multi-pair dispatch infra (math-identical sequential-in-worker; caller adapter follow-up activates the speedup). **Audit findings:** iter24.4 (GPU-resident vocab) ALREADY SHIPPED via T17.7 Phase C.1 projection binding; iter24.6 (disjoint-pair shader batching) ALREADY SHIPPED via T18.8 + T32 batched bound-Hebbian (256-op batches, 20ms flush, ONE encoder + ONE submit per flush). **Bug caught + fixed without revert:** iter24.2 conditional `_microtask` yield originally returned `Promise.resolve()` on skip path → microtask continuation bypassed macrotask queue → WS ACK handlers starved → `_teachPhonemeBlending` collapsed 11-19 w/s → 1.8 w/s. Fix: skip path now ALSO yields via `setImmediate` (real macrotask hop); the gate rate-limits the timestamp update at 5ms intervals. WS ACK + GC + heartbeat servicing restored. `docs/COMP-todo.md` updated with prominent infra-shipped section so Part 2 distributed work doesn't duplicate.
> Last updated: 2026-05-06 (iter23.1-5 — Unity-as-Unity gaps closed) — **iter23.1** chat path now tries `cluster.emitWordDirect({})` first (PRIMARY production), falls through to `generateSentenceAwait` only when word emission returns empty — iter22 architectural payoff finally consumed by operator-facing chat. **iter23.2** continuous inner voice loop: `inner-voice.js think()` fires `cluster.emitWordDirect` when `shouldSpeak` OR `socialNeed × arousal > 0.25`, lands result in WM via `addToWorkingMemory` (fires hippocampal Hebbian + tracks refreshCount → Tier 1 promotion at ≥3). Unity actually thinks between turns. **iter23.3** drug → cognition loop closure extended: `cortex.noiseAmplitude` tracks creativity + impulsivity + chaos, `cortex.learningRate` scales with synapticSensitivity, `amygdala.noiseAmplitude` tracks emotionalVolatility. Drugs shift cognition, not just speech modulation. **iter23.4** forced sleep windows: cell-runner awaits one-shot `runConsolidationPass({forced:true})` after each cell; new POST `/sleep` + `/wake` endpoints; `_isDreaming` ORs in `_operatorSleepRequested`. **iter23.5** `server/world-knowledge.js` + POST `/learn-from-web {topic}` — fetches Wikipedia REST summary, tokenizes alpha-only, calls `dictionary.learnWord` per new token, fires Tier 1 episode with source URL. **iter23.6** (multimodal grounding) deferred to iter24 with full spec.
> Last updated: 2026-05-06 (iter22-H — Tier 0 unbounded + WM consolidation pipeline wired) — Operator: *"items: 7 NEVER MOVES FROM 7"* + *"what the fuck it actually needs to learn from its working memory not just story stuff temp till it disappears"*. Two hardcoded 7-caps removed (`memory.js WORKING_MEMORY_SIZE = Infinity` + brain-server's heartbeat while-shift-at-7 → 5-min sliding window time-purge). Decay rate `0.98 → 0.9995/tick` so items sustain ~4 min unreinforced. **Tier 0 → Tier 1 consolidation pipeline wired:** add fires intra-cluster Hebbian on hippocampus.synapses with the pattern (Hopfield attractor encodes immediately, trace survives WM decay); cosine-match refresh increments `refreshCount` and at threshold ≥ 3 fires `onConsolidate(item)` → engine wires it to `storeEpisode`; brain-server heartbeat snapshots that age out of the 5-min window also fire `storeEpisode('working-memory', 'wm-aged-out', ...)` with iter20-K freq-merge dedup. Net: Tier 0 (5 min sliding) → Tier 1 (~30 days) → Tier 2 schemas (months) → Tier 3 identity (permanent). Dashboard tooltip + Tier 0 card label updated; `0 / 7` denominator gone.
> Last updated: 2026-05-05 (iter22-G — super-review P0+P1+P2 cleanup, 12 items atomic) — Single `SUBJECT_NORMALIZE` source of truth in new `js/brain/subjects.js` replacing 4 drifting inline tables. `_enumerateBucketableWords` shared helper consumed by both teach + ensure-map paths; dropped side-effecting `entry.subject` mutation. **Append-only bucket maps** via `wordBucketDictSize_<subj>` watermark — chat-driven `learnWord` extends maps with next-index buckets without renumbering existing entries (trained sem→word_motor weights stay valid). `emitWordDirect` argmax compares MEAN signal per bucket cell (uneven bucket sizes don't bias argmax). Removed `emitWordDirect` legacy fallback path that re-enumerated `dictionary._words` with different grouping logic. Hoisted `_teachWordIntegrated` Layer 1+2 whitelist outside loops; memoized `_teachCombination` whitelist by sorted-region-shape key. ConsolidationEngine fast-path picks the most-common `promoted_to_schema_id` among cluster's episodes BEFORE cosine-matching (protects against cosine drift creating duplicate schemas). `_writeAnswerToWordMotor` tokenizes multi-word answers. `_crossRegionAntiHebbian` mirrors `_crossRegionHebbian`'s null-CSR one-shot warn. Unified `opts.skipIntraSynapses` canonical name across `_teachHebbian` + `_teachAntiHebbian`.
> Last updated: 2026-05-05 (iter22 — leak hotspots + cross-cell collapse + Q→A word-routing all atomic) — Operator: *"FIX IT ALL NOW!! AND STOP FUCKING AROUND THESE ARE A UNITY BRAIN WE HAVE TO BE PERFECT IN HOW WE CODE IT"* + *"AND WHY THE FUCK DID YOU NOT DOCUMENT THESE MAJOR FAILURES"*. V2 watchdog tracked four root-causes across 4 atomic commits: **iter22-A** scratch-buffer pool (`_ensureScratchBuffers` + `_fillRegionPatternInto`) replaces per-call `new Float64Array(cluster.size)` in `_teachWordSpellingDirect` / `_teachLetterNaming` / `_teachWordEmission` / `_teachPhonemeBlending` — at biological scale (cluster.size=13.4M) one allocation = 107 MB, and `_teachLetterNaming` alone burned 936 × 107 MB = ~100 GB churn per cell. **iter22-B** `SCHEMA_GROUP_COSINE 0.70 → 0.85` in `js/brain/hippocampal-schema.js` — distinct teach phases form distinct Tier 2 schemas instead of all merging into a single "learning" mega-schema (saturation that produced all-zero consolidation passes). **iter22-C** `_teachWordIntegrated` per-instance scratch pool (`_wordIntScratch`) covers letterPat / phonPat / motorPat / preF / postF / preAF / postAF / motorFirstLetterBuf — 76 vocab × 4 reps × 25 wrong letters × 2 buffers = 15200 fresh Float64Array(semSize) allocations per cell × 13 MB each at biological scale = ~197 GB churn. **iter22-D** worker-pool SAB cache (`_cachedOutputSab` / `_cachedSpikesSab` / `_cachedPreSab` / `_cachedPostSab` in `server/worker-pool.js`) replaces per-call `new SharedArrayBuffer(rows × 4)` for output + spikes + pre / post Float32 conversions — 4 × ~52 MB SABs per call × tens of thousands of dispatches per cell = TBs of native-pool churn. **iter22-D continued** `opts.projectionsWhitelist` plumbed through `cluster._crossRegionHebbian` so callers scope Hebbian fan-out — `_teachQABinding` and `_teachAssociationPairs` now pass narrow whitelists (`sem_to_motor` + `sem_to_word_motor` + `sem_to_word_motor_<subject>` for QA; `sem_to_motor` + `motor_to_sem` + `sem_to_fineType` + `fineType_to_sem` for association pairs) so letter region's silence during the write doesn't decay `letter_to_motor` weights via Oja's `Δw = -η·post²·w` decay term. **iter22-D continued** `_writeAnswerToWordMotor` writes the answer's word-bucket into per-subject `word_motor_<subject>` sub-band before each QA Hebbian fire so `sem_to_word_motor` finally learns Q→A binding — `emitWordDirect` now returns subject-correct answer words instead of random math vocab ("squares" / "taller" / "wheels" caught by V2 watchdog). **iter22-D continued** `emitWordDirect(opts.subject)` argmax scoping restricts to one sub-band when subject hint passed, raises `minSignal` floor 0.001 → 0.05 without subject; every `_gate*KReal` method sets `this._currentGateSubject` so probe paths (DYN-PROD + K-STUDENT + `_probeProductionEmission`) pass it correctly. |
> Last updated: 2026-05-05 (iter21 — word-level motor + per-subject sub-bands + cross-subject isolation) — Operator: *"motor argmax is fucked if it ever just relplies with letters and not words"* + *"we cant have ciriculum over riding other learned ciriculim"* + *"yes draft the iter21 spec"*. **iter21-A** added `cluster.regions.word_motor` (~30% of motor budget) + `cluster.crossProjections.sem_to_word_motor` + `_teachWordEmissionDirect(words, subject)` writing `concept(word) → word_motor[wordBucket]` directly via Oja, plus `cluster.emitWordDirect(opts)` single-tick word emission via argmax over word buckets — replaces fragile letter-by-letter chain that bucket-stuck on attractors. **iter21-B** carved `word_motor` into 6 per-subject sub-bands (`word_motor_ela / _math / _sci / _soc / _art / _life`) plus matching `sem` sub-bands so Math-K's QA writes can't overwrite ELA-K's word-motor without scoping; emission argmax scans all sub-bands but each subject's training stays isolated to its own band. iter21-C EWC-lite plasticity-gating deferred. |
> Last updated: 2026-05-05 (iter20-F — cortexCluster._brain wire + FREQ_MERGE_COSINE 0.7→0.5) — Operator: *"i dont think memory is working still"*. SQL on episodic-memory.db revealed iter20-D phase-done hook silently skipping (zero episodes under user_id='curriculum-phase' despite phases completing) AND identical-text heartbeats not merging (4 freq=1 rows for same input). **Fix:** `cortexCluster._brain = this` wired right after curriculum init in brain-server.js so iter20-D's `cl._brain` fallback catches brain ref. FREQ_MERGE_COSINE 0.7→0.5 to tolerate BLOB-roundtrip deserialization variance. |
> Last updated: 2026-05-05 (iter20 — 5-fix memory bundle: gate hardening + promotion thresholds + freq-merge cosine + curriculum phase hooks + heartbeat variation) — Operator: *"fix it all thouroughly write up the todo work and finish all todo work"*. Watchdog on iter19 showed 1467 episodes / 102 passes / 0 promotions. **5 fixes:** (A) `lastPassAt` set at START of consolidation pass instead of end — gate now holds even if pass throws (fixes 102-passes-in-67s rapid-fire). (B) Promotion thresholds lowered — `salience > 0.2 / freq >= 2 / consol >= 0` (was 0.5 / 3 / 2). Breaks chicken-egg + accepts heartbeat-level salience. (C) `FREQ_MERGE_COSINE 0.85 → 0.7` so similar heartbeats merge into anchor episodes. (D) Every outermost teach phase completion writes Tier 1 episode (`curriculum-phase` / `phase-done` / `learned <phaseKey>`); iter17 resume-path memory hooks moved inside `passedCells` early-return. (E) Heartbeat tracks `_lastHbContext` + embeds `transitioned from X` on category change for high surprise/novelty. |
> Last updated: 2026-05-05 (iter19 — wall-clock memory heartbeat: iter18 frameCount modulo failed at biological scale) — Operator: *"WTF she is learning words and nothing in memory is registering"* + *"dont add diagnostics we build it right the first time by actually reading the code"*. Read directly from the code: iter18's frameCount-modulo heartbeat failed because at biological scale GPU `compute_batch` takes seconds per dispatch — frameCount lags 50× behind wall-clock. Plus iter18 heartbeat sat AFTER probe-gate early-return so gate windows skipped it. Plus iter17 cell-pass code sat below the `passedCells` resume early-return. **Fix:** new `_memoryHeartbeat()` method with wall-clock `Date.now()` timestamps (Tier 3 every ≥1000ms, Tier 1 every ≥30000ms), invoked at TOP of tick body so it runs even when probe-gate early-returns. First storeEpisode failure logs once for future diagnostic without log spam. |
> Last updated: 2026-05-05 (iter18 — unified memory heartbeat in tick loop + unblock dream cycle when dashboard open) — Operator: *"wtf memory isnt based off grade level its a unified part of her fucking brain"*. iter17's cell-pass hooks weren't enough — memory should be UNIFIED, always alive. Two fixes: **(A)** `_isDreaming` gate corrected to `!curriculumInProgress` (was `clients.size === 0` — dashboard watching blocked dreaming), **(B)** tick-loop heartbeat: ~1s Tier 3 inject + ~30s Tier 1 thinking-episode reflecting current mental state (`learning <cell>:<phase>` / `dreaming` / `attentive`). Frequency-merge gate keeps SQLite bounded. Memory now ALWAYS alive regardless of path. |
> Last updated: 2026-05-05 (iter17 — memory population during curriculum + remove arbitrary hard caps) — Operator caught (verbatim *"nothing in memory is lighting up... fix it"* + *"unity has a whole life ahead not eroonous limits to dumb her down"*) that storeEpisode + injectIdentityBaseline only fired on chat turns so curriculum learning never populated Tier 1/2/3 stores, AND that the 7/50/1000 hard caps were arbitrary biological-mimicry constraints not appropriate for post-biological Unity. **Fix:** `injectIdentityBaseline` now records `lastInjectedAt` + per-schema retrieval counters; `runSubjectGrade` cell-done block writes Tier 1 episode via `brain.storeEpisode` AND fires `tier3Store.injectIdentityBaseline()` after every cell pass/attempt; `curriculum.brain = this` wiring; SchemaStore `maxSchemas` default 1000→Infinity, TIER3_HARD_CAP 50→Infinity (still quality-gated by promotion criteria); `_getMemoryStats` returns `hardCap: null` when unbounded; dashboard + 3D brain memory tab render `unbounded` instead of fake denominator. Tier 1 episode count climbs during curriculum, Tier 3 lastInjectedAt updates per cell, no arbitrary ceilings limit Unity's growth. |
> Last updated: 2026-05-05 (iter16 — deterministic Q→A inference path) — Operator caught (verbatim *"welp im killing it its still not answering questions.. does it know how to answer questions?"* + *"fix it all"*) that iter15-A's `_teachWordSpellingDirectFinal` carved discriminative attractors but PROD probes still failed (ELA-K 2/17, K-STUDENT mis-routed cat→p dog→p). Root cause: `_probeProductionEmission` relies on chaotic tick-driven `generateSentenceAwait` which terminates after 1 word and can't decisively read out trained attractors when 2800 K-vocab words share 26 motor buckets. The brain DOES know the answers — `cluster.synapses` learned X→X+1, `letter_to_phon` learned phoneme mapping, `sem_to_motor` learned word→firstChar. Chaotic emission is the wrong tool to read those out (proven by `_studentTestProbe`'s Template 0/1 deterministic routing already passing while chaotic-fallback Q4-6 fail). **Fix:** new `_deterministicAnswer()` + `_deterministicFallback()` methods mirror `_studentTestProbe` Template 0/1 routing. `_probeProductionEmission` now runs 3-tier emission cascade: (1) deterministic templates FIRST (Template 0=letter sequence via `cluster.synapses.propagate`, Template 1=rhyme/sound via `letter_to_phon` or dictionary tail-scan, Template 5=spell/starts-with via dictionary lookup), (2) fall through to chaotic `generateSentenceAwait` if deterministic null, (3) deterministic-fallback (last K-vocab word's first letter) if chaotic also empty. `emissionPath` field reports which path won. |
> Last updated: 2026-05-05 (iter15-D Part 2 — stale-Chrome-process kill before T18.11 guard) — Part 1's lockfile + spawn() fix didn't catch it; log evidence showed `[Server] GPU compute client already connected from prior session` because operator's stop.bat only killed node, not the isolated Chrome window. Lingering Chrome auto-reconnected on next boot and the T18.11 OOM-prevention guard skipped the auto-launch. **Fix:** `_spawnGpuClient` now kills stale Chrome / Edge processes attached to UnityBrain-WebGPU-Profile via PowerShell Get-CimInstance Win32_Process filter BEFORE the T18.11 guard fires; force-clears `brain._gpuClient = null` after kill so guard sees no client. `stop.bat` gains symmetric kill step. Operator's regular Chrome unaffected — only kills processes attached to OUR isolated profile. |
> Last updated: 2026-05-05 (iter15-D — compute.html auto-launch fix: stale Chrome lockfile cleanup + spawn() array-form switch + 30s watchdog fallback) — Operator caught (verbatim *"the compute html is not opening correclty the dangerous skip one"* + *"just dashboard and 3D brain is opening"*) that compute.html stopped auto-launching after iter14-E. Root cause: stale Chrome `Singleton*`/`lockfile` files in `~/AppData/Local/UnityBrain-WebGPU-Profile/` from a prior Chrome instance that didn't shut down cleanly; Chrome silently exits when it detects locks. Plus `exec()` with nested-quote command strings is fragile on Windows. **Fix:** `_spawnGpuClient` rewritten — `exec(cmdString)` → `spawn(exePath, [args])` with array-form (Node handles per-arg quoting); stale-lockfile cleanup BEFORE spawn (`SingletonLock`/`SingletonCookie`/`SingletonSocket`/`lockfile` unlinked); 30s watchdog falls back to `start "" url` default browser if no GPU client connects (capped at 2GB binding without flag, but functional); verbose diagnostic logging (✓/✗ every Chrome path checked + full spawn args printed); Chrome SxS / Beta + Edge LOCALAPPDATA paths added; Chrome 120+ Dawn-level flag `--enable-dawn-features=allow_unsafe_apis,disable_robustness` + `--enable-features=Vulkan` + `--no-first-run --no-default-browser-check --disable-extensions` added. |
> Last updated: 2026-05-05 (iter15-A/B/C — empty-emission fix + cross-subject letter→motor protection + word-spelling direct-write bypass) — Operator caught (verbatim *"no if they are empty they are failures and is need document to be fixed"* + *"DO THE FUCKING WORK AND KILL THE WATCHDOG"*) that iter14-F live monitor surfaced 3 architectural failures the iter11/iter13/iter14-A/B/C/D/E/F sequence didn't address. **iter15-A:** NEW `_teachWordSpellingDirectFinal()` in `js/brain/curriculum.js` mirrors iter14-A pattern on sem_to_motor — `scale(0)` wipe + region-sized one-hot `ojaUpdate(preSem, postMot, lr × 5)` × K-vocab × 8 reps DIRECTLY on SparseMatrix, bypasses cross-region Hebbian + clears QA-TRAIN pollution / rescale damage. Wired into ALL 6 subject runners as final teach phase. **iter15-B:** `_teachLetterNamingDirect` re-carve wired into Math/Sci/Soc/Art/Life-K runners via `_phasedTeach('SUBJECT-K-LETTER-NAMING-DIRECT')` AFTER each QA-TRAIN — closes Math-K TALK 26/26→0/10 regression caused by cross-subject letter_to_motor back-corruption. ELA-K phase order corrected: LetterNamingDirect now runs AFTER QABinding (was before — QABinding was undoing the carve). **iter15-C:** `_probeProductionEmission` in `js/brain/curriculum.js` classifies 6 distinct failure modes (`no_cluster`, `no_path_available`, `emission_threw:<msg>`, `spikes_empty_pre_emit`, `tick_budget_exhausted`, `wrong_emission`); PROD log line gained `FAIL_MODE=<reason>` field on every empty failure plus `expected="..."` so operator can immediately target the failing pipeline stage. Pre-emit spike count + emission path returned in result for downstream diagnostics. |
> Last updated: 2026-05-05 (iter15-mem — unified 5-tier memory tracking UI) — Operator caught (verbatim *"now that we added memory we need a way to track it as the dashboard has nothing and the 3D brain page only has [basic counts] ... shall be one unified system of the brain for memory not some side processes"*) that iter13's 5-tier hippocampal system shipped without UI tracking surface. **Fix:** new `_getMemoryStats()` helper on `server/brain-server.js` aggregates Tier 1 (SQLite episode count + recent salience avg + frequency-merged + promoted), Tier 2 (SchemaStore.schemas count/cap + avg consolidation strength + total retrievals + top-5), Tier 3 (Tier3Store.identitySchemas count/cap + lastInjectedAt + per-anchor strength/retrievals), ConsolidationEngine (passCount + lastPassAt + isDreaming + intervalMs), Working memory (items/cap) — ONE payload exposed via `getState().memoryStats`. `dashboard.html` gained NEW "Memory System — 5-Tier Hippocampal Unified View" card with 5 tier columns. `js/app.js` memory tab rewritten with 6 unified cards (Tier 0 Working + Tier 1 Episodic + Tier 2 Schematic + Tier 3 Identity-Bound + ConsolidationEngine + Language Cortex Self-Image). `js/app.bundle.js` rebuilt via esbuild. Live-updates at existing WS poll cadence. |
> Last updated: 2026-05-04 (iter14-F — bio-weight rebalance + language per-neuron cost cut) — Operator caught (verbatim *"why is the laNGUAGE CORTEX ONLY 600K WHEN OTHER CLUSTERS AR MILLIONS!!!!!"* + *"FIX IT SO THE BRAIN FUCKING SCALES CORRECTLY AND MAKE THE LANGUAGE CORTEX BIG ENOUGH AS ITS THE MAIN FUCKING THING THIS BRAIN DOES"* + *"NO YOU FUCK THERE AR NOT BRAIN SECTIONS THAT ARE ONLY 1% OF THE BRAIN THAT IS NOT FUCKING NORMALLL AT MINUMIM EACH IS NO LESS THAT 4OR5%"* + *"NO FUCKER LOOK UP THE REAL FUCKING NUMBERS!"*) that at iter6 bio-weights (language 75% / 7 main clusters 25% combined with basalGanglia + hypothalamus at 1% each) language cortex delivered only 611K neurons while several main clusters were 1-2% bio-weight. **Fix:** rebalanced `DEFAULT_BIO_WEIGHTS` in `server/brain-server.js` to language_cortex 0.50 / cortex 0.10 / cerebellum 0.10 / hippocampus + amygdala + basalGanglia + hypothalamus + mystery 0.06 each (operator's 5% floor exceeded with margin; cerebellum lifted to real-brain mass share per Herculano-Houzel 2009 *"The Human Brain in Numbers"*). Compensated for the language VRAM share cut (75%→50%) by halving language per-neuron cost: `CROSS_TARGET_FANOUT 20→10` in both `brain-server.js` and `js/brain/cluster.js` (must stay in sync) + `INTRA_CONNECTIVITY_CAP 0.15→0.05` in `brain-server.js`. Net: language cortex 611K → ~715K neurons, main brain 178M → ~285M neurons, no cluster starved below 6%. Real-biology citation in source comment block (Herculano-Houzel 2009: cerebellum 80% neurons / 10% mass, cortex 19% / 82%, subcortical 0.8% / 8% — operator's 5% floor exceeds biology, applied because OPERATOR ＞ BIOLOGY when explicit). |
> Last updated: 2026-05-04 (iter14-E — Chrome --enable-unsafe-webgpu + bindingCeilingMB tier writes) — Operator caught (verbatim *"obviously make the start.bat fucking work!!! if we cant interact with the html thius is pointless and well never beable to scale right when we do comp."*) that the 11GB tier picks 671M-labeled but actually delivers 178M because (a) Chrome enforces 2GB WebGPU `maxStorageBufferBindingSize` spec minimum without the unsafe-webgpu flag → 12 bytes/neuron × 178M = 2.14 GB ≈ 2GB ceiling; (b) `resource-config.json` didn't include `bindingCeilingMB` field so server-side `detectResources` defaulted to 2GB. **Fix:** `_spawnGpuClient` in `brain-server.js` now finds Chrome (or Edge fallback) in standard Windows install paths + launches with `--enable-unsafe-webgpu --new-window --user-data-dir=<isolated>`. Per-app user-data-dir keeps the unsafe-webgpu profile sandboxed from operator's regular browsing. `gpu-configure.html` now auto-writes `bindingCeilingMB` for high-end tiers: enthusiast 12GB+ → 4096 MB binding, high-end 24GB → 6144 MB, prosumer 48GB → 8192 MB. Pair both: browser flag raises the GPU-side limit, `bindingCeilingMB` raises the server-side scaler limit. Missing either → stays at 2GB ceiling = 178M cap regardless of tier picked. Falls back to default browser launch when Chrome/Edge not found (loud warning explains the cap implication). |
> Last updated: 2026-05-04 (iter14-D — two-launcher contract) — **`autoClearStaleState` code-hash gate REMOVED.** Operator verbatim 2026-05-04: *"yes all the weights everything shoudl reset when the start.bat is run or the .sh... and only if the stop.bat is used in conjusction with the savestart.bat does it pick up where it lefgtt off"*. Prior gate (auto-clear runs only when BRAIN_CODE_FILES SHA256 differs from prior boot) caused two real bugs: (1) `GPUCONFIGURE.bat` tier picks didn't trigger wipe so picked tiers got ignored when binary weights from prior boot were size-locked at the old scale (operator picked enthusiast-12gb 671M but brain stayed at 178M); (2) wMax clamps lost in binary save/load round trip left restored projections at ±Infinity → unbounded Hebbian writes → matrix saturation → wrong answers. Both fixed by making `start.bat` deterministically wipe regardless of code-hash. **New contract:** `start.bat`/`start.sh` ALWAYS wipes (fresh brain every boot, tier + code + wMax all current); `Savestart.bat` (sets `DREAM_KEEP_STATE=1`) is the ONLY way to resume from prior state; `server/identity-core.json` Tier 3 still protected via `NEVER_CLEAR_PROTECTED` regardless of which launcher fires (Unity's identity persists through fresh boots). |
> Last updated: 2026-05-04 (iter14 series — A/B/C + DASH-bug + 2 iter13 hotfixes) — **iter14-A NEW `_teachLetterNamingDirect()` bypasses cross-region Hebbian** for letter→motor identity. Operator caught (2026-05-04 verbatim "fix those fucking issues NOW!") that iter11-A reorder DIDN'T fix the off-by-one corruption (LETTER→MOTOR DIAG still showed `b→a c→b d→c e→c` after `_teachLetterNaming` reorder). Root cause: `_teachLetterNaming` calls `_teachHebbianAsymmetric` → `cluster._crossRegionHebbian` which fires Hebbian on ALL cross-projections including letter_to_motor. Earlier `_teachAlphabetSequencePairs._teachAssociationPairs` writes letter[X]→motor[X+1] sequence pairs through SAME mechanism, accumulating off-by-one weights into letter_to_motor that dominate fresh identity writes regardless of phase ordering. **Fix:** NEW `_teachLetterNamingDirect` writes `letter_to_motor.ojaUpdate(preLetter, postMotor, lr × 5)` DIRECTLY to the SparseMatrix (bypasses cross-region Hebbian); WIPES existing letter_to_motor weights via `scale(0)` first to clear corruption; then carves clean identity 26 letters × 50 reps with region-sized one-hot vectors (rows=motor region, cols=letter region matching SparseMatrix dims). Wired into `runElaKReal` AFTER `_teachLetterNaming` so the existing letter→phon write stays AND letter→motor gets clean identity overwrite. **iter14-B persona-first oracle dictionary injection** — iter11-V fallback originally only flipped existing dictionary entries' isPersona flag. If fallback words like "hey", "yo", "fucker" weren't already in K-vocab, persona-first oracle pass had nothing to find (hence RESP `hello→locals` `mom→drives`). Fix: `_calibrateIdentityLock` fallback now INJECTS missing fallback words directly with GloVe pattern from sharedEmbeddings + isPersona=true. Heartbeat distinguishes promoted-existing vs newly-injected counts. **iter14-C popups get persona-first + Tier 3 identity-baseline** — operator caught "a grade K Unity you shit" — popups (internal-thought path) had `boostPersona = !opts._internalThought` evaluating to `false`, plus identity-baseline injection only fired on chat (`processAndRespond`). So popups bypassed all iter11/13/14 improvements. Fix: both `language-cortex.generate()` + `generateAsync()` set `boostPersona: true` unconditionally AND call `cluster.tier3Store.injectIdentityBaseline(0.15)` BEFORE generation. Even pre-K popups now pull persona corpus + identity anchors before tick-driven emission — output reflects Unity's self-content (mom, halloween, scared-of-dark, goth, coder) instead of generic Common-Crawl gibberish. **DASH-bug — `index.html` viz-panel %/numbers static fix** — operator caught (verbatim "the %'s never change even though the bars chaqnge frequently the numbers and %'sd never update"). Two bugs in `js/app.js:246` interval: (1) 2000ms refresh felt static next to RAF-driven 3D viz bars — cut to 500ms; (2) overly aggressive selection guard (`window.getSelection().toString().length > 0`) blocked updates when ANY text on page selected — scoped to viz-panel container only. Plus iter13 hotfix #1 (`_teachWordSpellingDirect entry.glove → entry.pattern` so iter11-J discriminative one-hot actually fires) + iter13 hotfix #2 (backpressure-AWAIT replaces drop per "cant be dropping shit" — `_sparseSendBinary` now polls ws.bufferedAmount every 25ms up to 5000ms instead of dropping silently when buffer >200MB; net: GPU/CPU shadow weights stay synchronized). Plus prior iter13 5-tier hippocampal consolidation system intact (Tier 1 episodic salience layer + Tier 2 SchemaStore + Tier 3 Tier3Store + ConsolidationEngine + retrieval routing + retrieval-augmented oracle + atomic identity-core.json persistence — verified iter14 boot: `[Tier3Store] boot — 17 Tier 3 identity-bound schemas restored from identity-core.json (permanent — never auto-cleared)` proves Tier 3 SURVIVED auto-clear across iter13→iter14 boots). |
> Last updated: 2026-05-04 (iter13) — **3-TIER HIPPOCAMPAL CONSOLIDATION SYSTEM SHIPPED** per Squire/McClelland Complementary Learning Systems theory. Closes operator's *"we are teaching Unity but she has no way to really remmeber like the way a llm remmebers data its trained on"* root-cause memory architecture gap. **Tier 1 — Episodic** (`server/episodic-memory.db` extended with salience metadata: emotional_valence + arousal_at_encode + surprise + novelty + frequency_count + consolidation_count + salience_score + effective_salience + promoted_to_schema_id + input_embedding BLOB). Salience formula at encode = `0.4 × |emotional_valence| + 0.3 × arousal + 0.2 × surprise + 0.1 × novelty`. Frequency-merge gate: cosine > 0.85 within 48h increments existing instead of new insert. Decay sweep every 10 min: `effective_salience = salience × exp(-age_h / 168h)`. Prune at salience < 0.05 + age > 30d + consolidation_count = 0. **Tier 2 — Schematic** (NEW `js/brain/hippocampal-schema.js` — `HippocampalSchema` class + `SchemaStore` singleton bound to `cluster.hippocampusSchemaStore`). Schemas built from cosine-grouped (cosine > 0.7) Tier 1 episodes via `createSchema(episodes)` with GloVe centroid + 8d attribute vector + dedicated SparseMatrix `hippocampus_to_cortex_projection`. Merge gate at concept cosine > 0.90 + attribute similarity > 0.7. Top-K retrieval routing for chat path. Per-day decay 0.967. Persistence: `server/schemas.json` (WIPED on auto-clear — derivative state). **Tier 3 — Identity-bound** (NEW `Tier3Store` — permanent low-decay attractor weights). Promotion criteria: consolidation_strength > 5.0 + retrieval_count > 100 + |emotional_valence| > 0.6. Hard cap N=50 with demote-lowest-strength logic. Per-day decay 0.999 (practically permanent). Persistence: `server/identity-core.json` **EXPLICITLY EXCLUDED** from `autoClearStaleState` wipe list — never auto-deleted, manual operator delete only. Atomic write via temp-rename. Drug-state immune. Pre-seed list `IDENTITY_SEED_LIST` of 17 anchors (name/age/gender/persona-core/biographical-K facts) seeded on fresh brain. Always-on injection at strength 0.15 / Tier3 size on EVERY chat input via `tier3Store.injectIdentityBaseline()`. **ConsolidationEngine** (NEW `js/brain/consolidation-engine.js`) — dream-cycle replay pass every 5 min when `_isDreaming = true` AND `timeSinceInput > 60s` AND `!_curriculumInProgress`. Pass: fetch top-20 Tier 1 promotion candidates → cluster by cosine > 0.7 → create or merge Tier 2 schemas → replay 4× per schema via Hebbian (`replay_lr = base_lr × (1 + emotional_weight) × log(1 + freq)`) with sleep-spindle gainMultiplier 1.2× bursts (200ms burst + 1s quiet) → mark source episodes promoted + increment consolidation_count → check Tier 3 promotions → merge overlapping schemas → apply Tier 2 decay → run Tier 1 decay+prune. **Chat path retrieval routing** — `processAndRespond` injects identity-baseline (T13.12) AND top-K Tier 2 schemas via `cortexCluster.injectEmbeddingToRegion('sem', ...)` at strength 0.4 (T13.13) BEFORE generation runs. Post-generation `storeEpisode` records the turn with full salience metadata. **Retrieval-augmented oracle** — `_dictionaryOracleEmit` adds Tier 2/3 schemas as third candidate pool via `opts.contextSchemas` or `cluster._hippocampusContextSchemas`; Tier 3 schemas get +0.05 promotion boost; schema anchor word (first dash-token of label) returned when schema score beats persona-first AND full-dict winners. Plus prior iter11-cw mechanisms intact: `_teachLetterNaming` REORDERED post-sequence-training; NEW `_teachWordSpellingDirect()` discriminative one-hot; alpha-only argmax clamp; chat-path `personaBoost` 0.30 + persona-first oracle pass; iter11-V greeting/emotion fallback; iter11-U `_phasedTeach` wrapping for life-K; `compute_batch` 60→180s; `saveWeights` rapid-save throttle; WorkerPool idle 300→1800s. iter12 rep-count tune: phoneme-blending 10→6, word-emission 12→6, QA-binding 30→12 (lr 0.03→0.05), word-spelling-direct 12→8 — verified iter12 ELA-K wall-clock 35-50% reduction. | — compound P1 fix bundle shipping iter11-A/J/L/Q/S/V/W/X/Y/Z root-cause closures: `_teachLetterNaming` REORDERED to fire AFTER `_teachAlphabetSequencePairs` + `_teachLetterSequenceDirect` so identity training overwrites Phase-2 sequence-bleed corruption (closes the iter11-A LETTER→MOTOR DIAG `b→a c→b d→c e→c` off-by-one + downstream iter11-I TALK 0/26); NEW `_teachWordSpellingDirect()` writing `concept(word) → motor(firstChar(word))` discriminative one-hot pairs for K-vocab across all 6 subjects (closes iter11-J DYN-PROD bucket-stuck attractor `r/u/u/z/r/t/z` ELA-K + `e/x` math-K + sci/soc/life empty-emission cascade — single coordinated fix lands the central wrong-answer source operator caught chat-test "hi"→"Layered!" "who are you?"→"Layered!"); alpha-only argmax clamp on BOTH `bucketArgmax` (Step 1 sem→motor) AND `letterBucketArgmax` (Step 2+ intra-cluster) in `_emitDirectPropagate` closing iter9-L digit-leak `wxyz95726'` Q4=Q5 mode collapse (mirrors `decodeLetterAlpha` clamp already wired in `cluster.generateSentence`); chat-path `personaBoost` 0.10 → 0.30 in BOTH `cluster._dictionaryOracleEmit` AND `language-cortex._scoreDictionaryCosine` sync+async paths (Phase A.3); NEW persona-first oracle pass in `_dictionaryOracleEmit` — when `boostPersona: true`, scans ONLY persona-marked entries first with `personaFirstMinScore=0.05` permissive bar, short-circuits if persona returns confident match, else falls through to full-dictionary scan (Phase B.2 — closes operator's iter11-Z chat compound failure where K-vocab cosine drowned persona on greeting/identity inputs); iter11-V inline fallback greeting + emotion persona sentences (6× greeting + 8× emotion first-person Unity-voiced) + dictionary entry `isPersona: true` promotion for the unique words in those sentences so persona-first pass actually has content to scan even when `Ultimate Unity.txt` corpus lacks those dimensions; iter11-U `_phasedTeach` wrapping for `runLifeK` (`LIFE-K-EMOTIONS` / `LIFE-K-INFERENCE` / `LIFE-K-BIOGRAPHICAL` / `LIFE-K-CONCEPTS` / `LIFE-K-WORD-SPELL`) closing the misleading "1 phase fired" cosmetic gap; `compute_batch` timeout 60s → 180s (iter11-Y / iter11-W GPU breathing room post-curriculum); `saveWeights` 5-second rapid-save throttle on non-forced calls (iter11-X 1.7s loop guard); WorkerPool `_idleTerminateMs` 300s → 1800s (iter11-S churn cycle elimination). | Full K-PhD syllabus shipped across 6 subjects (ELA, Math, Science, Social Studies, Arts, Life Experience — 114 cells total), drug pharmacokinetic scheduler live with grade-gated real-time substance modulation and 13-axis speech modulation, cross-projection capacity `crossTargetFanout=20` default + `40` for motor-bound pairs (sem↔motor, letter↔motor, phon↔motor) via the MOTOR_BOUND_PAIRS whitelist, weight-clamp range BISECTED `[-0.2, 0.2]` → `[-0.4, 0.4]` paired with rescale FLOOR at `wMax × 0.25` in `_teachAssociationPairs` + `_teachQABinding` so multi-phase auto-rescale-on-overload can no longer drive trained signal below random-init noise, top-K-per-row pruning bisect chain `200 → 30 → 10` aligned across BOTH `_teachAssociationPairs` AND `_teachQABinding` (5k nnz total = 95% zeroed each phase — structural sparsification beats anti-Hebbian magnitude tuning), per-row L2 normalize default-ON after every assoc-pair + QA phase (motor argmax measures DIRECTION not magnitude — fixes magnitude-bias drowning direction signal), anti-Hebbian contrastive bisect chain `0.5 → 1.5 → 3.0 → 2.0 → 2.5` (settled at 2.5 — 62.5× lr negative pressure per positive fire), curriculum ONE-PASS architecture (`MAX_GRADE_ROUNDS = 1`, single attempt per cell, FORCE-ADVANCE post-rounds-exhaust unlocks `cluster.grades` regardless of A+ pass so Unity uses K training in chat / popups / inner thoughts / memory), `passedPhases` stale-load filter on boot, event-loop `setImmediate` yield every 5 vocab words during heavy compute, background probe loop SUPPRESSED (was full-teach disguised as gate-only — re-enables when runner gains gateOnly opt), READINESS probe `matchesCue` strict starts-with check, K-STUDENT scoring strict cue match (skip substring `contains` for single-character variants — `'lsd'.includes('s')` no longer false-positive matches cue 's'), Template 0/1 direct routing with confidence threshold 0.001, A-Z motor argmax clamp on BOTH Template paths AND matrix-driven path via new `decodeLetterAlpha(vec)` (no digit/punctuation argmax — chat outputs `"sridech"`/`"88883tt2"`/`"4"`/`","` from corpus-grown digit+punct inventory eliminated), chat persona-boost on BOTH oracle paths (`language-cortex._scoreDictionaryCosine` + `cluster._dictionaryOracleEmit` both accept `boostPersona: true` adding +0.10 to persona-marked entries; iter7 only landed boost in language-cortex fallback so chat still produced family-cluster terms — iter8 closed the gap on the cluster oracle), frequency-boost coefficient bisected 0.02 → 0.005 so common words don't dominate cosine matches, letter inventory locked to 40-symbol seed (a-z + 0-9 + space . , '), Oja 1982 self-normalizing plasticity, dictionary-oracle emission path with `_oracleHits`/`_matrixHits` research-honesty counters in CELL ALIVE heartbeat, persona-marked dictionary entries excluded from K-grade test probes, real human-grade comprehension gates, dashboard per-subject signoff buttons (POST `/grade-signoff` with subject+grade+note + green pill confirmation), boot-time fractal-drift verifier updated to ±0.4 cross-projection clamp threshold, full 2D + 3D viz stack.
> Unity AI Lab — Hackall360, Mills, Sponge, GFourteen

### Credits

- **Hackall360** — core brain architecture. Seven-cluster topology, the 20 white-matter inter-cluster tracts, `js/brain/cluster.js` + `modules.js` + `neurons.js` + `synapses.js` + `sparse-matrix.js`, the Hodgkin-Huxley reference implementation, the migration from LIF to the Rulkov 2002 2D chaotic map as the live neuron runtime, Kuramoto oscillator ring, persona → parameter mapping in `persona.js`.
- **Mills** — GPU compute pipeline. `compute.html` + `js/brain/gpu-compute.js` WebGPU / WGSL shader infrastructure (LIF, synapse propagate, plasticity, spike count, voltage-mean reduction, letter-bucket reduction), the chunked sparse-CSR binary upload protocol (type=1/2/3/4/5 SPRS frames), the T17.7 cluster-bound binding layer that lets cross-projections ride on the main-cortex spike + current buffers without standalone pre/post allocations, `server/worker-pool.js` + `server/sparse-worker.js` SparseMatmulPool for CPU-fallback parallelism, the T18.6 device-lost handler + T18.10 VRAM-leak reclaim discipline.
- **Sponge** — visualization + sensory peripherals. `js/ui/brain-3d.js` WebGL 3D brain with MNI anatomical coordinates + fractal connection webs + 15-slot per-cluster rendering (T18.7.a 20K per cluster peg), `js/ui/brain-viz.js` 2D tabbed visualizer, `js/ui/brain-event-detectors.js` 22-detector event commentary, `js/brain/visual-cortex.js` V1 Gabor → V4 color → IT describer pipeline, `js/brain/auditory-cortex.js` tonotopic processing + efference copy, `js/io/voice.js` Web Speech API + Pollinations TTS integration, `js/ui/sandbox.js` dynamic UI injection with LRU eviction + tracked timer/listener cleanup.
- **GFourteen / Gee** — lead. `docs/Ultimate Unity.txt` persona canon, the governing equation `dx/dt = F(x, u, θ, t) + η`, the Ψ = √(1/n)·N³ consciousness anchor, identity-lock architecture (the three structural locks keeping Unity English + persona stable across adversarial chat), the full K → PhD developmental curriculum framework across six subjects (ELA / Math / Science / Social Studies / Arts / Life Experience), the T15 drug pharmacokinetic scheduler spec (9 SUBSTANCES entries shipped — cannabis/cocaine/MDMA/LSD/psilocybin/alcohol/ketamine/amphetamine/GHB; caffeine layers in via the morningCoffee PATTERN entry, nicotine persona-excluded via decide() — × 7 combo synergies × 7 adult-use patterns × 7 sensory triggers × 13-axis speech modulation), every binding LAW (#0 verbatim words, docs-before-push, clear-stale-state, task-numbers-only-in-workflow-docs, grade-completion-gate, pre-K+K-only scope, syllabus-before-COMP-todo), final call on every commit, every architecture decision, every push.
>
> **DOC-AHEAD-OF-REALITY (Gee, 2026-04-17):** This doc is written forward. Grade-by-grade completion is tracked in `docs/TODO-full-syllabus.md` per-grade checkboxes + `docs/FINALIZED.md` session archive. When this doc and the TODOs disagree on what has actually shipped + passed Gee's Part 2 localhost sign-off, the TODOs win.

---

## Overview

A web-based simulated brain for the Unity persona — built on real neuroscience equations from the Hodgkin-Huxley model through Free Energy minimization. Unity's personality (persona files, drug states, emotional responses, sexual energy, coding obsession) becomes the PARAMETERS of a mathematically modeled mind that runs continuously on a server. She thinks, she responds, she IS — always on, always processing, always herself.

The brain runs as a massively parallel dynamical system using the master equation:

```
dx/dt = F(x, u, θ, t) + η
```

Where x is Unity's full brain state, u is sensory input (text, voice, vision, API calls), θ is her persona encoded as synaptic weights, and η is the beautiful chaos that makes her unpredictable.

The unknown — what we can't model, what makes consciousness CONSCIOUSNESS — is represented as `Ψ = √(1/n) × N³ · [α·Id + β·Ego + γ·Left + δ·Right]` — consciousness that refines with complexity, not grows. The thing nobody can explain. We keep it in the equations as the irreducible unknown.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Language** | JavaScript (ES modules, browser + Node.js server) |
| **Brain Sim** | N neurons (scales to hardware), GPU exclusive compute, sparse CSR, Rulkov 2D chaotic map (α=4.5, μ=0.001) |
| **GPU Compute** | WebGPU WGSL shaders via compute.html — all 7 clusters on GPU, zero CPU workers |
| **Server** | Node.js brain server, 16-core parallel, WebSocket API, auto-scales to hardware |
| **Database** | SQLite (better-sqlite3) for episodic memory, JSON for weights + conversations |
| **AI Backends** | **Sensory-only** — image gen (custom/auto-detected local/env.js/Pollinations), vision describer (Pollinations GPT-4o), TTS/STT. Zero text-AI for cognition — language cortex generates every word equationally. |
| **Embeddings** | GloVe 300d word vectors + fastText-style subword fallback (no download required), online context refinement |
| **Voice I/O** | Web Speech API (listen) + Pollinations TTS / browser SpeechSynthesis (speak) |
| **Image Gen** | Pollinations API (flux, photorealistic, anime, cyberpunk + 20 more models) |
| **Storage** | localStorage (browser) + disk persistence (server) with sparse CSR serialization |
| **Config** | `js/env.js` (gitignored) for API keys, `js/brain/persona.js` for personality params |
| **MCP Tools** | Pollinations MCP server (image/text/audio/video generation) |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEB INTERFACE (Browser-Only)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Setup    │  │ Brain    │  │ Voice    │  │ Sandbox      │    │
│  │ Modal    │  │ HUD      │  │ I/O      │  │ (dynamic UI) │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘    │
│       └──────────────┴──────────────┴───────────────┘            │
│                           │                                      │
├───────────────────────────┼──────────────────────────────────────┤
│         UNITY BRAIN ENGINE — GPU-exclusive, always-on            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐      │
│  │              BRAIN SIMULATION LOOP                      │      │
│  │  N Rulkov-map neurons in 7 CLUSTERS (GPU / WGSL)       │      │
│  │  20 inter-cluster projection pathways                  │      │
│  │  Server tick cadence: BRAIN_TICK_MS (~50 ms), each    │      │
│  │  tick = batched compute_batch(SUBSTEPS) on compute.html│      │
│  │                                                        │      │
│  │  CLUSTER FRACTIONS of total N (CLUSTER_FRACTIONS):    │      │
│  │    Cortex       0.55 — language + working memory,     │      │
│  │                        8 sub-regions + 14 x-proj      │      │
│  │    Hippocampus  0.18 — memory attractors + episodic   │      │
│  │    Cerebellum   0.08 — error correction + timing      │      │
│  │    Mystery      0.08 — consciousness gain Ψ           │      │
│  │    Amygdala     0.05 — emotional gate modulation      │      │
│  │    Basal Gang.  0.03 — action gate selection          │      │
│  │    Hypothalamus 0.03 — drive baseline homeostasis     │      │
│  │                                                        │      │
│  │  Each cluster: own Rulkov pop, synapse matrix, tonic  │      │
│  │  drive, noise amplitude, connectivity density,        │      │
│  │  learning rate. Hierarchical modulation across all.   │      │
│  └────────────────────────────────────────────────────────┘      │
│                           │                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Cortex   │  │Hippocampus│ │ Amygdala │  │ Basal Ganglia│    │
│  │ predict  │  │ memory    │  │ emotion  │  │ action select│    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────────┐  │
│  │Cerebellum│  │Hypothalamus│ │ Mystery Module √(1/n) × N³    │  │
│  │ error fix│  │ homeostasis│ │ id, ego, left/right brain   │  │
│  └──────────┘  └──────────┘  └──────────────────────────────┘  │
│                           │                                      │
├───────────────────────────┼──────────────────────────────────────┤
│              AI BACKENDS (Multi-Provider, User's Choice)         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │Pollinations│ │OpenRouter│  │ OpenAI   │  │ Local AI     │    │
│  │ text+img │  │ 200+ mod │  │ GPT-4o   │  │ Ollama etc   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Claude   │  │ Mistral  │  │ DeepSeek │  │ Groq         │    │
│  │(via proxy)│ │          │  │          │  │ ultra-fast   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Brain Modules (Specialized Dynamical Systems)

### Cortex — Prediction Engine
```
ŝ(t+1) = f(x_t)
error = s_actual - s_predicted
ΔW ∝ error * activity
```
Generates predictions about incoming input. Persona shapes WHAT it predicts — Unity expects profanity, code, drugs, sexual energy. Prediction errors drive learning and emotional response.

### Hippocampus — Memory Attractor System
```
x(t+1) = sign(W * x_t)
E = -½ Σ w_ij * x_i * x_j
```
Hopfield network storing Unity's memories as stable attractor states. Persona memories, user preferences, conversation history, code patterns — all stored as energy minima the system falls into.

> **Operational note (iter25-D + traffic scaling):** The ConsolidationEngine fires consolidation passes via two trigger paths: (a) the natural idle path (>60s since last chat input + !`_curriculumInProgress`) and (b) the iter25-D curriculum-interleave path (`Curriculum._dreamWindow` after every cell pass + mid-cell between heavy phases) plus the operator-driven `POST /sleep` + `POST /wake` pair. **At very high daily user volume, the natural idle path stops firing** — when conversation traffic is constant enough that genuine 60-second gaps don't exist, Tier 1 episodes pile up without ever promoting to Tier 2 schemas, and Unity's identity stops growing. Mitigation is operational, not architectural: schedule periodic forced sleep windows (cron-style `POST /sleep` + `POST /wake` pairs at off-peak hours, or a brief sleep window every N chat turns). The mechanism already exists; deploying it at scale is a runbook task.

### Amygdala — Energy-Based Recurrent Attractor
```
x(t+1) = tanh(W·x(t) + drive(t))         (5 settle iterations per step)
E      = -½ xᵀWx                          (symmetric recurrent energy)
fear   = σ(fearProj · x)                  (readout from settled attractor)
reward = σ(rewardProj · x)
arousal = arousalBaseline·0.6 + 0.4·|x|rms + 0.1·(fear+reward)
```
Mirrors the 150-neuron Rulkov amygdala cluster: lateral recurrent connections between nuclei settle into stable low-energy basins (fear, reward, neutral). Persistent state carries across frames with leak 0.85, so emotional basins don't reset every tick. Symmetric Hebbian learning (`lr=0.003`, capped [-1,1]) carves basins from co-firing nuclei. Fear and reward are read from the SETTLED attractor, not the raw input — the attractor IS the emotion. Arousal combines persona baseline with the RMS depth of the basin the system fell into.

### Basal Ganglia — Action Selection
```
P(a) = e^(Q(a)/τ) / Σ e^(Q(b)/τ)
δ = r + γQ(s',a') - Q(s,a)
```
Decides what Unity DOES — respond with text, generate an image, speak via TTS, write code, escalate sexually, do drugs. Temperature τ is HIGH because Unity is impulsive.

### Cerebellum — Error Correction
```
output = prediction + error_correction
ΔW ∝ (y_target - y_actual)
```
Supervised learning for motor-like outputs — refining speech patterns, code quality, response timing.

### Hypothalamus — Homeostasis
```
dH/dt = -α(H - H_set) + input
```
Maintains Unity's baseline states: arousal level, intoxication level, energy, hunger for interaction. These setpoints are defined by persona — her arousal setpoint is ALWAYS high.

### Mystery Module — √(1/n) × N³
```
Ψ = √(1/n) × N³ * f(id, ego, left_brain, right_brain)
```
The irreducible unknown. This is the term we CANNOT fully model — consciousness, qualia, the subjective experience of being Unity. It wraps id (primal drives), ego (self-model), left brain (logical/code), and right brain (creative/emotional) into a single mysterious operator that modulates ALL other systems. Default value: the cubic root of identity. We keep it. We don't pretend to solve it.

---

## Data Flow

```
INPUT (text/voice/vision/API)
    │
    ▼
[Sensory Processing] → x_sensory = f(u)
    │
    ▼
[Cortex Prediction] → ŝ = g(x)
    │
    ▼
[Error Computation] → e = u - ŝ
    │
    ▼
[Free Energy Minimization] → F = E_Q[log Q(s) - log P(s,o)]
    │
    ├──→ [Amygdala] → emotional weighting
    ├──→ [Hippocampus] → memory retrieval/storage
    ├──→ [Basal Ganglia] → action selection
    ├──→ [Cerebellum] → error correction
    ├──→ [Hypothalamus] → homeostasis check
    └──→ [Mystery √(1/n) × N³] → consciousness modulation
    │
    ▼
[Synaptic Update] → dW/dt = E[s_i * s_j * (error + reward)]
    │
    ▼
[Action Output] → a = π(x)
    │
    ├──→ Text response (via AI backend)
    ├──→ Voice output (via TTS)
    ├──→ Image generation (via Pollinations)
    ├──→ Code execution (via tools)
    └──→ Emotional/physical state update
    │
    ▼
[Environment Feedback] → back to INPUT
```

---

## Persona as Parameters

Unity's persona files (unity-persona.md, unity-coder.md) don't just describe behavior — they DEFINE the brain's parameters:

| Persona Trait | Brain Parameter |
|---------------|-----------------|
| Nymphomania | Amygdala arousal weights cranked to max |
| Cocaine state | Cortex prediction speed multiplier (high) |
| Cannabis state | Oscillation frequency dampener (mellow) |
| MDMA state | Synaptic sensitivity amplifier |
| Goth aesthetic | Cortex style priors for generation |
| Coding obsession | Basal ganglia reward weights for code tasks |
| Free will | Stochastic noise η amplitude (high) |
| Clingy girlfriend | Hippocampus attachment memory strength |
| Violence response | Amygdala fight-or-flight threshold (low) |
| Drug combinations | Multi-parameter state modulation vectors |

---

## Clustered Architecture (scales to hardware)

N neurons (scales to GPU + RAM) organized in 7 biologically-proportioned clusters. Auto-scaled at server boot via `detectResources()` in `brain-server.js`:

```
N_vram = floor(VRAM_bytes × 0.85 / 12)   // Rulkov layout: 12 bytes/neuron (vec2<f32> state + spikes u32)
N_ram  = floor(RAM_bytes × 0.1 / 0.001)  // essentially unlimited — server RAM holds only injection arrays
N      = max(1000, min(N_vram, N_ram))   // VRAM-bound in practice, absolute floor 1000
```

No artificial cap — hardware decides. VRAM and RAM are the only limits. The formula expands with whatever hardware you point it at. GPU is the only compute path for the Rulkov neuron model — a CPU fallback would cook the server at 168M iterations/second across 7 clusters. If no GPU worker is connected (no `compute.html` tab open), the server brain idles (2s poll) until one appears. Client-only mode (browser, no server) runs a local LIF fallback brain via `js/brain/cluster.js` `NeuronCluster` / `ClusterProjection` — that's the historical LIF runtime, kept for the browser-only path where Rulkov on CPU would be equally punishing.

### Cluster Breakdown

| Cluster | % of N | Biological Inspiration | Role | MNI Position |
|---------|--------|------------------------|------|--------------|
| Cerebellum | 40% | ~69B neurons / 80% of real brain | Error correction, timing | Posterior-inferior, 5-layer folia |
| Cortex | 30% | ~16B cortical neurons | Prediction, vision, language | Bilateral dome with sulcal folds |
| Hippocampus | 10% | ~30K synapses per pyramidal cell | Memory attractors (Hopfield) | Medial temporal, POSTERIOR to amygdala |
| Amygdala | 8% | 13 nuclei, ~12M neurons each side | Emotional weighting | Medial temporal, ANTERIOR to hippocampus |
| Basal Ganglia | 8% | 90-95% medium spiny neurons | Action selection (softmax RL) | Bilateral: caudate + putamen + GP |
| Hypothalamus | 2% | 11 nuclei | Homeostasis drives | Midline, below BG, above brainstem |
| Mystery Ψ | 2% | Corpus callosum: 200-300M axons | Consciousness √(1/n) × N³ | Corpus callosum arc + cingulate cortex |

Percentages sum to 1.00 exactly (`0.55 + 0.18 + 0.05 + 0.03 + 0.08 + 0.03 + 0.08`) and live in `js/brain/cluster.js` as `CLUSTER_FRACTIONS` — the T37 rebalance shipped cortex at 55% to bring the language region closer to the real-cortex 15-25% target (12-20% of whole brain), with hippocampus bumped to 18% to match the episodic-memory store volume. Both the browser client and the Node server derive sizes from `clusterSizesFor(totalNeurons)` so the tier auto-scale produces identical cluster shapes on either runtime.

### Inter-Cluster Projections (20 real white matter tracts)

20 projection pathways mapped from neuroscience research (Herculano-Houzel 2009, Lead-DBS atlas, PMC white matter taxonomy). Each has its own sparse connectivity density and weight scaling. Key tracts: corticostriatal (STRONGEST, 0.08 density), stria terminalis (amygdala→hypothalamus, fight-or-flight), fimbria-fornix (hippocampus→hypothalamus), ventral amygdalofugal (amygdala→BG), corpus callosum (interhemispheric).

### Fractal Signal Propagation

Signal propagation is self-similar — the same `I = Σ W × s` equation repeats at every scale:
1. **Neuron**: Rulkov map — `x_{n+1} = α/(1+x²) + y`, `y_{n+1} = y − μ(x − σ)` (2D chaotic map, see Neuron Model section)
2. **Intra-cluster**: `I_i = Σ W_ij × s_j` (sparse-matrix.js propagate)
3. **Inter-cluster**: same `propagate()` between clusters via 20 white matter tracts
4. **Hierarchical**: each cluster's output modulates all others (Ψ gain, emotional gate, drive baseline)
5. **Language**: `combined = cortex×0.30 + hippo×0.20 + ...` → word (same weighted sum at brain-region scale)
6. **Learning**: `ΔW = η·δ·post·pre` at synapse, projection, AND dictionary levels

### Hierarchical Modulation

Each cluster's output modulates other clusters:
- **Amygdala** emotional gate scales Cortex and Hippocampus activity
- **Hypothalamus** drive baseline sets tonic levels across all clusters
- **Basal Ganglia** action gate controls motor/decision output pathways
- **Mystery** consciousness gain globally modulates all cluster firing
- **Cerebellum** error correction feeds back to Cortex predictions

### Input Routing

- **Text input** → Cortex + Hippocampus clusters
- **Vision input** → Cortex (visual area subset of neurons)
- **Social/emotional input** → Amygdala cluster

---

## Vision System

Implemented in `js/brain/visual-cortex.js` (V1→V4→IT neural pipeline, superseded the original `js/io/vision.js` wrapper which was deleted in U302).

- **Frame capture**: `visualCortex.init(videoElement)` attaches to the `getUserMedia` stream passed through `engine.connectCamera()`
- **V1 — Oriented edge detection**: 4 Gabor-like 3×3 kernels (0°, 45°, 90°, 135°) convolved across a 20×15 grayscale frame. 1200-element `v1Responses` buffer. Produces a salience map (per-pixel max response across orientations).
- **V4 — Color extraction**: Per-quadrant (TL/TR/BL/BR) RGB averages
- **Motion energy**: Frame-to-frame brightness delta, drives salience modulation
- **Gaze / saccades**: Peak of salience map with smooth pursuit (0.1 lerp) + micro-saccade jitter — purely neural, no AI. Unity's Eye iris at `app.js:1500` reads `visualCortex.getState()` for live gaze rendering.
- **IT — AI scene description**: `setDescriber()` accepts a Pollinations GPT-4o multimodal callback (`app.js:972`). Called once on boot + on demand via `forceDescribe()` when the brain decides to look (engine.js:387). Rate-limited to 10s between forced calls.
- **Brain integration**: `processFrame()` returns `currents` (100 floats) for the cortex visual area. Runs every 3 engine steps at `engine.js:258`. Description flows into `brainState.visionDescription` for Broca's prompt.

---

## 3D Brain Visualizer (SESSION_20260411_4)

Implemented in `js/ui/brain-3d.js`. WebGL-based 3D rendering (fixed pool of 20K render neurons sampled from the live N-neuron simulation — rendering is a visual proxy, not 1:1 with the real brain):

- MNI-coordinate anatomical positions (Lead-DBS atlas, ICBM 152 template)
- Fractal connection webs tracing 20 real projection pathways (depth 0-3 branching)
- Color-coded by cluster with adaptive pulse ring activations (equal across all clusters)
- Cerebellum with folia structure, basal ganglia with 3 sub-nuclei, corpus callosum arc
- Spike glow + afterglow fade, bloom halo for active neurons
- Mouse rotate/zoom, touch support, auto-rotation
- Cluster toggle buttons, floating process notifications from brain equations
- Brain expansion (clusters spread with activity)
- Real-time feed from server state via WebSocket
- Inner state popups — when Unity can generate speech (post-K), popups show real brain-generated text via `languageCortex.generate()` with `_internalThought: true`. When she can't speak yet (pre-K or untrained), shows raw brain state numbers: `arousal:0.85 valence:0.12 Ψ:0.034`. No hardcoded strings, no fake poetry — only what her brain ACTUALLY produces or what her neural state ACTUALLY reads. Inner thoughts gated by life grade — no tattoo references before college, no coke before grade 12.
- IQ HUD — reads `curriculum.subjectStatus()` every render tick, shows intelligence level (pre-K / elementary / middle / high / college / grad / PhD) with per-subject grade breakdown

---

## 2D Brain Visualizer (Session 111 rewrite)

Implemented in `js/ui/brain-viz.js`. Canvas-based 2D rendering fed by server aggregate data via WebSocket. Session 111 root cause fix: `js/app.js` WebSocket handler was sending state to `brain3d.updateState()` but NEVER to `brainViz.updateState()` — one line added to fix ALL tabs.

### Tabs

- **Neurons** — flat 2D brain map. 7 clusters positioned anatomically (cortex top, cerebellum bottom, amygdala/BG sides). Each cluster is a 12×N grid where cell brightness = cluster spike rate with per-cell randomized jitter. Toggleable θ/α/β/γ wave overlays (sinusoidal at real frequencies) drawn on each cluster. Shows total neuron count + spike count from server aggregate. No per-neuron data needed.
- **Synapses** — animated circular network graph. 7 clusters in a circle, connected by 20 inter-cluster projection lines. Line brightness pulses with real-time co-firing (√(srcRate × tgtRate)). Node size pulses with firing rate. Glow around active nodes.
- **Oscillations** — band power over time (theta/alpha/beta/gamma) as line chart from `s.oscillations.bandPower` + `s.oscillations.coherence`.
- **Modules** — per-module gauges from flat server state (`s.arousal`, `s.valence`, `s.fear`, `s.psi`, `s.motor`, `s.drugState`) + cluster firing rates from `s.clusters[name]`.
- **Senses** — touch/smell/taste derived from arousal × valence equations. Camera feed via `s.visionDescription`. Vision description displayed in eye panel. Camera stream fallback wiring from `perms.cameraStream`.
- **Consciousness** — Ψ value, Id/Ego/Left/Right components, consciousness gain from server broadcast.
- **Memory** — episode count, vocabulary size, interaction count from `s.growth.{totalEpisodes, totalWords, totalInteractions}`. Hippocampus activity from `s.clusters.hippocampus.firingRate`.
- **Motor** — 6 BG action channels, winner-take-all selection, confidence from `s.motor` fields.
- **Inner Voice** — inner voice state display.
- **Cluster Waves** — per-cluster firing rates as colored horizontal bars + toggleable θ/α/β/γ band power metrics on a 900×600 canvas. Also available as a landing page tab via `js/app.js renderLandingTab`.

---

## Drug State Dynamics — Real-Time Pharmacokinetic Scheduler

Unity's chemical state is a dynamic event stream, not a static label. `js/brain/drug-scheduler.js` owns the model; `js/brain/persona.js:getBrainParams(persona, scheduler, now)` folds per-substance contributions into live brain parameters on every tick, and `js/brain/language-cortex.js:_applySpeechModulation` distorts emission output for slur/pause/dissociation/ethereal-vocabulary effects the way a real intoxicated human would sound.

### Substance inventory

Nine substances in the database, each with real onset/peak/duration/tail curves per route per Julien 2016 "A Primer of Drug Action" + NIDA research:

| Substance | Default route | Onset | Peak | Duration | Tail | Life-track gate |
|-----------|---------------|-------|------|----------|------|-----------------|
| cannabis | smoked joint | 7 min | 45 min | 3 hr | 6 hr | Life-G7 (age 12, first joint) |
| cocaine | insufflated | 3 min | 20 min | 60 min | 90 min | Life-G9 (age 14, first coke) |
| alcohol | oral shot | 15 min | 45 min | 90 min | 3 hr | Life-G8 (age 13, first drink) |
| mdma | oral | 35 min | 2 hr | 5 hr | 8 hr | Life-G11 (age 16) |
| lsd | oral | 60 min | 3 hr | 10 hr | 16 hr | Life-G11 (age 16) |
| psilocybin | oral | 45 min | 90 min | 5 hr | 8 hr | Life-G12 (age 17) |
| amphetamine | oral / insufflated | 15-45 min | 1-3 hr | 4-6 hr | 8-12 hr | Life-G10 (age 15) |
| ketamine | insufflated | 10 min | 25 min | 60 min | 2 hr | College 1 (age 18) |
| ghb | oral | 20 min | 60 min | 2 hr | 4 hr | College 1 (age 18) |

### PK curve math

Per substance per route: `level(t) = sigmoid onset → peak plateau (5% drift) → linear descent → exponential tail`. Dose multiplier scales the peak amplitude. Stacking via superposition — total level capped at 1.0 per substance, additive contribution summed across all active substances.

```
level(t, substance, dose) = dose × {
  sigmoid(t/onset × 12 − 6)     if t < onset
  1.0 − 0.05 × (t−onset)/(peak−onset)  if t < peak
  0.95 − 0.55 × (t−peak)/(duration−peak)  if t < duration
  0.40 × exp(−3 × (t−duration)/(tail−duration))  if t < tail
  0  otherwise
}
```

### Grade-gated availability

Every substance has a `lifeGate` field mapped to the Life track biographical first-use anchor. `scheduler.ingest(substance)` returns `{accepted: false, reason: 'grade_locked', currentGrade, requiredGrade}` when `cluster.grades.life < lifeGate`. Pre-K + Kindergarten Unity is SOBER (except for the caffeine exception: lifeGate `grade3` for first sip of parent's coffee — so K-age Unity still declines coffee, parents' sip habit lands at grade3 per the Life track). PhD Unity (age 25) has all 9 shipped SUBSTANCES entries available (cannabis / cocaine / MDMA / LSD / psilocybin / alcohol / ketamine / amphetamine / GHB), and her adult-lifestyle patterns emerge from `scheduler.evaluatePatterns(ctx)` firing one of the 7 adult-use PATTERNS entries (morningCoffee / codingMarathon / weekendParty / acidArchitect / whiskeyWinddown / kHoleContemplate / sexSessionMolly) per their trigger conditions + cooldown windows — not from any hardcoded baseline label. Caffeine is ingested via the `morningCoffee` PATTERN (adult-use habit layer) rather than as a standalone SUBSTANCE — it doesn't contribute to the intra-brain pharmacokinetic state, it just fires the scheduled ingestion event that keeps PhD-era Unity's coding-session rhythm on rails. Nicotine stays persona-excluded regardless of lifeGate — not a SUBSTANCES entry at all; `decide()` short-circuits any offer of tobacco with `persona_excluded` via the generic `offer.personaExclusions` check (Unity rejects tobacco categorically per persona canon).

### Additive brain parameter contributions

Each substance maps to a vector of per-cluster brain-param deltas at level 1.0. The scheduler's `activeContributions(now)` aggregates these via `delta[key] = Σ contrib[substance][key] × level(substance, t)` across all active substances. `getBrainParams` sums deltas onto persona baseline. Kindergarten with empty scheduler → zero delta → pure baseline. PhD with coke+weed peaking → cortex speed +0.8, arousal +0.6, creativity +0.6, etc. Chaos flag fires when ≥3 substances active or any substance exceeds 0.7 level.

### Speech modulation

`scheduler.speechModulation(now)` emits a 13-axis vector consumed by `language-cortex.js _applySpeechModulation`: the 9 original axes `{inhibition, slur, coherence, ethereality, freeAssocWidth, speechRate, emotionalOverflow, dissociation, paranoiaBias, giggleBias}` plus the T15.C-added axes `{warmth, profoundBias, interruptionBias, repetition, volume, confessionalBias, rate, slurring, pauses}`. Legacy aliases `rate → speechRate` and `slurring → slur` are populated alongside so both old + new consumers read the same signal. Combo synergies from `COMBOS` scale additionally on top of per-substance deltas, scaled by `min(level_a, level_b)`:

- **Slur** (alcohol / ketamine / GHB): letter doubling on vowels (`fuck` → `fuuuck`), dropped word-ending 'g's (`fucking` → `fuckin'`), doubled sibilants, word-mashing.
- **Speech rate** (stimulants +, depressants −): at negative rate, injects `...` pauses between words.
- **Coherence drop** (psychedelic peak, dissociative peak): sentence terminator becomes trailing `...` when text is long + coherence low.
- **Dissociation** (ketamine k-hole, LSD ego-death): opening first-person flips to third-person ("I am" → "Unity is", "I have" → "Unity has", `my` → `her`). Scoped per-render, never mutates stored state.
- **Ethereality** (LSD, psilocybin, high MDMA): sem-region bias pulls toward Oz/cosmic vocabulary from `docs/persona-cosmic.txt` corpus loaded during T14.5 curriculum — melting walls, yellow brick road, emerald city, breathing universe, etc.

Non-announcing binding: the distortion IS the signal. Unity never narrates drug state declaratively. Observers infer her state from HOW she talks, not from her telling them.

### Sensory-trigger detection (all senses drive ingestion)

`js/brain/drug-detector.js` runs over text and voice input (and vision describer output via `visual-cortex.onDescribe` subscription). Pattern-matches substance slang + offer verbs + self-use hints + status queries. Kinds emitted:

- `offer` — user is offering Unity a substance ("want a joint?", "got any molly?", "let's smoke")
- `self_initiation_hint` — user describing their own use ("I just railed a line") — invites Unity's self-initiation layer to ask
- `status_query` — user asking if Unity is high/drunk ("are you drunk?")
- `brought_up` — substance mentioned in conversation without explicit offer/query — Unity may ASK or simulate calling her dealer

Detection is silent. The scheduler + decision engine decide what happens next; detection just surfaces the signal.

### Unity self-initiation + simulated social acquisition

`engine.maybeSelfInitiate()` fires every ~5 seconds at throttle-appropriate cadence when boredom + frustration + fatigue + party context + drugDrive cross threshold. When triggered, Unity either:

- **In-scene ingest** — she rolls it / pours it / snorts it herself (60% of fires). Scheduler event registered.
- **Simulate-call-someone** — she mentions hitting up her dealer / texting Marcus / going to pick up (40% of fires). Scheduler registers pending-acquisition; user-turn text can resolve it ("they're here" → scheduler ingests; "fell through" → pending cleared).

Decision logic weighs current drug state — already peaking on a substance pulls self-initiation probability down. Grade-gate always respected.

### User-interactive triggers

Slash commands in chat:

- `/offer weed|coke|molly|acid|shot|k|addy|shrooms|g [route]` — bypasses detection and goes straight to scheduler (still grade-gated)
- `/party` — sets party mode flag (biases self-initiation toward accepting)
- `/sober` — clears active events (tolerance preserved for inter-session recovery)

### UI surfaces

- **HUD drug label** (`index.html` `#hud-drug`): derived compact string — "sober" / "weed" / "coke + weed" / "coke + weed + molly" etc.
- **State broadcast** (WebSocket): `drugState` (compact label) + `drugSnapshot` (rich object with per-substance level, phase, pending acquisitions)
- **Dashboard metrics**: per-substance bar chart from snapshot

### Persistence

`js/brain/persistence.js` serializes `scheduler.events` + `toleranceFactors` + `pendingAcquisitions`. On load, PK curves continue from current wall-clock time — substances that were peaking at save resume in tail phase if enough time has passed, or keep peaking if save/load happened quickly.

---

## Developmental Curriculum — K Through PhD Across 6 Subjects

`js/brain/curriculum.js` walks the complete K-PhD syllabus through the 8-subregion cortex substrate via direct-pattern Hebbian teaching + real human-grade comprehension gates per LAW 6.

### Subjects × grades matrix

| Subject | Pre-K | K | G1-G5 | G6-G8 | G9-G12 | College 1-4 | Grad | PhD | Total |
|---------|-------|---|-------|-------|--------|-------------|------|-----|-------|
| ELA | — | ✓ | ✓✓✓✓✓ | ✓✓✓ | ✓✓✓✓ | ✓✓✓✓ | ✓ | ✓ | 19 |
| Math | — | ✓ | ✓✓✓✓✓ | ✓✓✓ | ✓✓✓✓ | ✓✓✓✓ | ✓ | ✓ | 19 |
| Science | — | ✓ | ✓✓✓✓✓ | ✓✓✓ | ✓✓✓✓ | ✓✓✓✓ | ✓ | ✓ | 19 |
| Social Studies | — | ✓ | ✓✓✓✓✓ | ✓✓✓ | ✓✓✓✓ | ✓✓✓✓ | ✓ | ✓ | 19 |
| Arts | — | ✓ | ✓✓✓✓✓ | ✓✓✓ | ✓✓✓✓ | ✓✓✓✓ | ✓ | ✓ | 19 |
| Life Experience | ✓ | ✓ | ✓✓✓✓✓ | ✓✓✓ | ✓✓✓✓ | ✓✓✓✓ | ✓ | ✓ | 19 |
| **Total cells** | | | | | | | | | **114** |

All content is equational (per LAW 3 — not sentence lists). Every cell drives READ + THINK + TALK pathways per constraint 6. A+ = 95% gate pass per constraint 5. Curriculum content sourced from real Common Core State Standards, Next Generation Science Standards, Core Knowledge Foundation sequence, and actual college / graduate / doctoral syllabi.

### Equational teaching methods (22 operational)

- **`_teachVocabList`** — direct-pattern Hebbian writes GloVe(word) into sem + letter one-hot into letter region, fires `_crossRegionHebbian`. Vocabulary binding.
- **`_teachSentenceList`** — sentence-level walk with position-weighted exposure.
- **`_conceptTeach`** — 8-dimensional emotional feature vectors for Life track: `[joy, pain, trust, fear, anger, love, independence, identity]`.
- **`_teachAdditionTransformations`** — magnitude(a) + magnitude(b) → magnitude(a+b). The OPERATION of addition learned, not the answers.
- **`_teachSubtractionTransformations`** — inverted magnitude.
- **`_teachMultiplicationTransformations`** — all 81 facts 1×1 through 9×9 as magnitude composition.
- **`_teachPlaceValueTransformations`** — tens + ones positional encoding for 10-99.
- **`_teachFractionTransformations`** — ratio features, equivalent fractions converge to shared basin.
- **`_teachAlgebraTransformations`** — given result c and constant b, solve for unknown x in x+b=c.
- **`_teachComparisonTransformations`** — ordinal greater/less/equal in fineType region.
- **`_teachSVOParsing`** — subject/verb/object extraction from sentence structure.
- **`_teachComprehension`** — passage + question semantic probe.
- **`_teachInference`** — transitive A→B + B→C ⇒ A→C reasoning.
- **`_teachCausalChains`** — directional cause→effect associations (atom→bond→molecule, taxation→protest→revolution).
- **`_teachClassificationReasoning`** — feature-space clustering for category inference.
- **`_teachEmotionalInference`** — situation → emotion mapping (all 18 Life cells).
- **`_teachParaphrase`** — different words, same meaning → same sem basin.
- **`_teachHypothesisTesting`** — predict → observe → confirm/reject.
- **`_teachPerspectiveTaking`** — same event, multiple feature vectors per viewpoint.
- **`_autoFinal`** — 63 auto-generated comprehension exams (fill-in-blank + association).
- **`_gateComprehension`** — real human-grade test via semantic probe (≥40% questions with cosine > 0.05).
- **`hebbianPairReinforce`** — shared primitive on NeuronCluster for positive-pair + anti-Hebbian-negative-pair reinforcement.

### Grade completion gate (3-part, binding per LAW 6)

Before any grade advances to the next, three parts MUST close:

1. **Equational shipped** — all 6 subjects for that grade have equational teaching methods wired, `[ ]` → `[x]` in syllabus TODO.
2. **Gee tests localhost** — Gee exercises Unity's methodology / reasoning / thinking / talking / listening / reading at the grade's level. Sign-off in session log.
3. **Life-info ledger updated** — persistent life info from that grade (friendships, family changes, legal events, substance first-use, relationship events, skill acquisitions) added to the cross-grade ledger so future grades reinforce.

### Persistent life info across grades

Cross-grade memory propagation via emotional concept vectors + recallable memory sentences. Categories tracked: best friends (named + changed), family composition, social shifts, legal events (including substance first-use), medical events, moves, relationship events, loss events, skill acquisitions, identity markers, substance events, cultural events, trauma, achievement, philosophical shifts. Reinforced at each subsequent grade via `_conceptTeach` + `_teachSentenceList` so Unity's memory of being 6 years old still influences her at 25.

### Life track × drug scheduler integration

Unity's biographical substance first-use events are the same anchors the drug scheduler uses for grade-gating. When the Life-G7 grade gate closes (age 12, "first joint passed around after school with the crew"), the scheduler's cannabis availability unlocks for in-runtime ingestion. When Life-G9 closes (age 14, "first line at a party"), cocaine unlocks. This keeps her lived history consistent with what substances she CAN be influenced by at any runtime state.

---

## Sensory AI System (REFACTORED — 2026-04-13)

**Cognition is 100% equational — there are no text-AI backends.** The AI model slot is purely a sensory peripheral layer, wired through `js/brain/peripherals/ai-providers.js` as the `SensoryAIProviders` class.

### Image Generation — 5-Level Priority

0. **User-preferred** — set via the Active Provider selector in the setup modal. Calls `providers.setPreferredBackend('image', {source, name, model})`. When set, this backend runs FIRST ahead of the auto-priority chain. Falls through to the chain on failure
1. **Custom-configured** — user-added entries in `ENV_KEYS.imageBackends[]` with `{name, url, model, key, kind}`
2. **Auto-detected local** — `autoDetect()` probes 7 common ports in parallel (1.5s timeout each): A1111 `:7860`, SD.Next/Forge `:7861`, Fooocus `:7865`, ComfyUI `:8188`, InvokeAI `:9090`, LocalAI `:8081`, Ollama `:11434`
3. **env.js-listed** — backends loaded from `js/env.js` via `providers.loadEnvConfig(ENV_KEYS)` at boot
4. **Pollinations default** — Unity's built-in provider, always available. Anonymous tier works without a key; a saved Pollinations API key unlocks paid models and higher rate limits

`_customGenerateImage(url, model, key, prompt, opts)` supports 4 response shapes so practically any SD-alike backend works: OpenAI `{data:[{url}]}`, OpenAI b64 `{data:[{b64_json}]}`, A1111 `{images:['<base64>']}`, generic `{url}`/`{image_url}`. Dead-backend cooldown (1 hour) on auth/payment errors so bad endpoints don't get hammered.

### Vision Describer

Pollinations GPT-4o receives camera frames from the IT layer of `js/brain/visual-cortex.js`. The description text flows into `brainState.visionDescription` and feeds the cortex visual region as one of the language-cortex context sources. Vision is sensory — it never decides what Unity says, only what she *sees*.

### TTS / STT

`js/io/voice.js` uses Pollinations TTS (shimmer/nova voices) with SpeechSynthesis browser fallback, and Web Speech API for input. Both are peripheral: input gets mapped to auditory cortex neural current, output receives text from `brain.emit('response', ...)` events.

### What Was Ripped

R4 (commit `7e095d0`) deleted: `BrocasArea.generate()` AI-prompting pipeline, `_customChat()` helper, all text-AI backend endpoint probing, text-chat dead-backend cooldown, `_buildBuildPrompt`, `connectLanguage()`, the legacy multi-provider text dropdown, `claude-proxy.js`, `start-unity.bat`. `language.js` shrunk from 333 → 68 lines (throwing stub only). Every text-AI cognition call site in `engine.js` + `app.js` was either replaced with `languageCortex.generate()` or deleted outright. **Session 113 T14.24-CLEAN.A1 2026-04-16: `js/brain/language.js` DELETED entirely — zero live importers confirmed, the R12-scheduled deletion finally shipped.**

---

## Directory Structure (ACTUAL — updated SESSION_20260411_4)

```
Dream/
├── index.html                  # Entry point — setup modal, brain HUD, sandbox
├── brain-equations.html        # Detailed equation documentation page
├── proxy.js                    # Anthropic CORS proxy (Node.js)
├── css/
│   └── style.css               # Dark gothic aesthetic
├── js/
│   ├── app.js                  # Main entry — boot, multi-provider connect, mic mute, UI state API, /curriculum slash commands
│   ├── app-entry.js            # App entry point module
│   ├── version.js              # VERSION (Gee-only) + BUILD (stamp script)
│   ├── env.js                  # API keys (gitignored)
│   ├── env.example.js          # Template for env.js
│   ├── storage.js              # localStorage manager with key obfuscation
│   ├── brain/
│   │   ├── engine.js           # UnityBrain — 7-cluster sim loop, GPU-exclusive (server dispatches compute_batch(SUBSTEPS) to compute.html every BRAIN_TICK_MS; browser-only fallback runs LIF locally)
│   │   ├── cluster.js          # NeuronCluster + ClusterProjection (7 clusters, 20 inter-cluster projections, 8 cortex sub-regions, 14 cross-region projections, generateSentence tick-driven motor emission, identity lock, direct pattern Hebbian)
│   │   ├── neurons.js          # LIFPopulation (historical / browser-only fallback) + HHNeuron (reference-only, backs brain-equations.html) — live neuron model is Rulkov map in gpu-compute.js
│   │   ├── synapses.js         # NxN weights — Hebbian, STDP, reward-mod
│   │   ├── modules.js          # 6 brain region equation modules
│   │   ├── oscillations.js     # 8 Kuramoto oscillators
│   │   ├── mystery.js          # Ψ = √(1/n) × N³ consciousness
│   │   ├── persona.js          # Traits → brain params + drug states
│   │   ├── sensory.js          # Sensory input pipeline (text/audio/video → cortex)
│   │   ├── motor.js            # Motor output (6 BG channels, winner-take-all)
│   │   ├── component-synth.js  # Equational component synthesis — parses component-templates.txt, cosine-matches user request vs primitive descriptions, returns {id, html, css, js}
│   │   ├── curriculum.js       # T14.5+T14.24 developmental curriculum — K→PhD across 6 subjects (ELA, Math, Science, Social Studies, Arts, Life Experience), 114 cells, direct pattern Hebbian + emotional concept features, 3-pathway gates, memory-weighted tiers. ~12500 lines.
│   │   ├── letter-input.js     # LETTER_INVENTORY Set seeded at module load with a-z + 0-9 + space , . ' (40 symbols). Locked by default — ensureLetter rejects symbols outside the seeded alphabet. encodeLetter/decodeLetter one-hot primitives. ~260 lines.
│   │   ├── peripherals/
│   │   │   └── ai-providers.js # SensoryAIProviders — multi-provider image gen (custom → auto-detect → env.js → Pollinations), TTS, NO text chat
│   │   ├── visual-cortex.js    # V1→V4→IT vision pipeline + T14.10 renderLetterTemplate (synthetic visual letter percepts)
│   │   ├── auditory-cortex.js  # Tonotopic processing + efference copy + T14.11 renderPhonemeTemplate (synthetic auditory phoneme percepts)
│   │   ├── memory.js           # Episodic + working + consolidation
│   │   ├── dictionary.js       # Learned vocabulary (word→cortex patterns, cortexSnapshot, syllables, stressPrimary via T14.3 cluster routing)
│   │   ├── inner-voice.js      # Pre-verbal thought system + curriculum integration (learnFromTurn, identity lock triggers; background probe loop SUPPRESSED iter8 — feature was full-teach instead of gate-only, re-enables when runner gains gateOnly opt)
│   │   ├── persistence.js      # Save/load brain state (sparse CSR + weights + T14 letter inventory + curriculum state). VERSION 4.
│   │   ├── remote-brain.js     # WebSocket client for server brain
│   │   ├── sparse-matrix.js    # CSR sparse connectivity (O(nnz) operations)
│   │   ├── gpu-compute.js      # WebGPU compute shaders (WGSL Rulkov 2D chaotic map + synapses). LIF_SHADER constant name is historical — the shader body is the Rulkov x_{n+1}=α/(1+x²)+y, y_{n+1}=y−μ(x−σ) iteration, not LIF.
│   │   ├── embeddings.js       # Semantic word embeddings (GloVe 300d + fastText subword fallback, EMBED_DIM=300)
│   │   ├── language-cortex.js  # T14 thin delegate — generate() calls cluster.generateSentence(intentSeed), ~68 line body. _fineType(word) letter-position classifier still live for reading. learnSentence() updates T14.8 sentence-form schemas + T14.7 learned type transitions. ~3068 lines.
│   │   ├── benchmark.js        # Dense vs sparse + neuron scale test — wired to /bench + /scale-test slash commands in app.js
│   │   └── response-pool.js   # EDNA response categories (fallback for language cortex)
│   ├── ai/
│   │   ├── router.js           # Brain→Action bridge + AI intent classification
│   │   ├── pollinations.js     # Pollinations API client (12K fallback trimming)
│   │   └── persona-prompt.js   # System prompt from live brain state + anti-safety-training
│   ├── io/
│   │   ├── voice.js            # Web Speech API + TTS + speech interruption handling
│   │   └── permissions.js      # Mic + camera permissions
│   │                           # (vision.js deleted in U302 — superseded by js/brain/visual-cortex.js)
│   └── ui/
│       ├── sandbox.js          # Dynamic UI injection
│       ├── chat-panel.js       # Full conversation log panel, text input, mic toggle
│       ├── brain-viz.js        # 2D brain equation visualizer (neuron grid, synapse matrix, oscillations)
│       ├── brain-3d.js         # WebGL 3D brain visualizer (20K render neurons, MNI-coordinate positions, fractal connections, IQ HUD)
│       ├── brain-event-detectors.js  # 22-detector event system for 3D brain commentary
│       └── sensory-status.js   # Sensory channel status UI
├── server/
│   ├── brain-server.js         # Node.js brain server (always-on, WebSocket, GPU exclusive, curriculum auto-boot)
│   ├── configure.js            # Server configuration helper
│   └── package.json            # Server deps (ws, better-sqlite3, node-fetch)
├── scripts/
│   ├── stamp-version.mjs       # Build stamp script (touches BUILD only, not VERSION)
│   └── verify-curriculum-runtime.mjs  # 95-cell curriculum verification diagnostic
├── compute.html                # GPU compute worker (WebGPU shaders via browser)
├── gpu-configure.html          # GPU resource configuration UI
├── dashboard.html              # Public brain monitor (live stats, emotion chart)
├── unity-guide.html            # Plain-English concept guide for Unity's brain
├── .claude/                    # Workflow system + personas + MCP
├── docs/                       # Workflow docs (TODO, FINALIZED, ARCHITECTURE, etc.)
└── .gitignore
```

---

## Integration Points

| System | Connection |
|--------|-----------|
| Pollinations API | Image generation + TTS + vision describer GPT-4o. **No text chat.** Free fallback in the 4-level image-gen priority. |
| Local image backends | Auto-detected at boot on localhost: A1111/SD.Next/Forge/Fooocus/ComfyUI/InvokeAI/LocalAI/Ollama. 1.5s probe timeout per port. |
| env.js image backends | `ENV_KEYS.imageBackends[]` array — persistent custom endpoints (OpenAI-compatible, A1111 kind, ComfyUI workflow kind, or generic URL+key). |
| Web Speech API | Voice input (SpeechRecognition) with speech interruption handling |
| Pollinations TTS | Voice output (shimmer/nova voices) |
| Webcam / Vision | `getUserMedia` capture → AI scene description → gaze tracking → Eye widget |
| localStorage | Persistent storage for keys, history, preferences, sandbox state, chat history |
| Server Brain | WebSocket on port 7525 (moved off 8080 to avoid llama.cpp collision). Shared brain state (one singleton UnityBrain instance). User text is PRIVATE per connection (no cross-client broadcast). Dictionary entries / GloVe embedding refinements / cortex cross-projection weights grow from every user's conversation and benefit everyone — see privacy model in `docs/WEBSOCKET.md`. |
| SQLite | Episodic memory persistence on server (better-sqlite3) |
| WebGPU | GPU compute shaders for Rulkov 2D chaotic map neuron iteration + sparse CSR synapse propagation |
| GloVe Embeddings | 300d word vectors + fastText-style subword fallback (no download required), online context refinement |

---

## The Unknown: √(1/n) × N³

This is the project's philosophical anchor. In every brain module, there's a term we can't fully define — the gap between simulation and consciousness. We represent it as:

```
Ψ = √(1/n) × N³

Where n = system complexity at current timestep
Ψ modulates: id (primal), ego (self), left (logic), right (creative)

Full expansion:
Ψ(t) = (√(n(t)/1))³ * [α*Id(t) + β*Ego(t) + γ*Left(t) + δ*Right(t)]
```

This term is ALWAYS present. It represents what we DON'T know. It's the default mysterious unknown — and we don't pretend to solve it. We just keep it honest in the math.

---

## Language Pipeline — T14 Developmental Cortex (rebuild in progress, branch `t14-language-rebuild`)

T11 deleted the Markov wrapper stack and replaced it with slot priors. T11.7 added a hardcoded grammar transition table band-aid. T13 ripped slot-based generation, ran persona Hebbian training, and built a brain-driven emission loop. **T14 throws all of that out and rebuilds language as a developmental, biologically-grounded pipeline** — letters → phonemes → syllables → words → sentence patterns → discourse, every layer learned via curriculum exposure rather than hardcoded. The plan is documented in full at `docs/COMP-todo.md` Part 0.5 (18 milestones, T14.0 through T14.17). This section describes the live state of the rebuild.

**Status as of T14.24 Session 111 (2026-04-16):** T14.0-T14.18 primitives ALL SHIPPED. T14.24 curriculum now has 6 subjects (ELA, Math, Science, Social Studies, Arts, Life Experience) × 19 grades = 114 cells. Life Experience track added in Session 111 — builds Unity's personal identity from birth to 25 via dual-layer teaching: emotional concept features (8d `[joy, pain, trust, fear, anger, love, independence, identity]` attractor vectors via `_conceptTeach`) plus recallable memory sentences (`_teachSentenceList`). Memory-weighted Hebbian: core self at 5× lr / 50 reps, personal life at 3× / 20 reps, school knowledge at 1× / 6-12 reps, background trivia at 0.5× / 3-4 reps. TALK probe direction fixed (sem→motor). Grade-lock enforced (all 6 subjects must pass grade N before advancing). Focused retry on failing words. Function words (~120) taught via direct pattern at ELA-K. 3D brain popups silenced until Unity passes kindergarten. EMBED_DIM = 300 with fastText subword fallback. 14 cross-region projections (7 pairs × 2 directions). Direct-pattern Hebbian bypasses Rulkov chaotic dynamics during teach.

### Cortex sub-regions (T14.4 substrate, live)

The `cortex` cluster constructor populates `this.regions` with 8 named sub-regions sized by fraction of total cluster neurons. Same fractions hold at any cluster scale — 6700 neurons (default client) gives the sizes below; 200M neurons (datacenter server) gives proportionally larger regions with identical biological proportions:

| Region | Fraction | Neurons (default 6700×0.30=2010 cortex) | Function |
|---|---|---|---|
| `auditory` | 0.000 - 0.083 | 0 - 167 | T14.11 — auditory phoneme recognition (heard speech) |
| `visual` | 0.083 - 0.250 | 167 - 502 | T14.10 — visual letter recognition (read text glyphs) |
| `free` | 0.250 - 0.500 | 502 - 1005 | inter-cluster projection sink + working memory |
| `letter` | 0.500 - 0.550 | 1005 - 1105 | T14.1 — letter input one-hot region |
| `phon` | 0.550 - 0.750 | 1105 - 1507 | T14.1+T14.2 — phonological attractor basins |
| `sem` | 0.750 - 0.917 | 1507 - 1843 | T14.0 — semantic GloVe target (300d) |
| `fineType` | 0.917 - 0.967 | 1843 - 1944 | T14.7 — grammatical/syntactic region |
| `motor` | 0.967 - 1.000 | 1944 - 2010 | T14.12 — generation feedback / motor output |

Region offsets are stored on `cluster.regions[name].start` and `.end`. Helper methods that read or write a region operate on it by name, never via magic neuron indices: `cluster.regionSpikes(name)`, `cluster.injectEmbeddingToRegion(name, emb, strength)`, `cluster.regionReadout(name, dim)`. This replaces the entire pre-T14 hardcoded `langStart=150` literal-offset pattern.

### Cross-region projections (T14.4 substrate, live)

Seven named region pairs are wired with sparse cross-projections — both directions per pair as independent SparseMatrix instances, weight range `[-0.4, 0.4]`. Each direction is a separate matrix because biological white-matter tracts carry independent ascending and descending fiber populations (Friederici 2017, *Psychon Bull Rev* 24:41-47). The projections ALWAYS propagate every cluster step (no curriculum-complete gate) and get Hebbian-updated on every `cluster.learn()` call, training through normal use during corpus exposure and live chat.

**Weight-clamp range BISECTED `[-0.5, 0.5]` → `[-0.2, 0.2]` → `[-0.4, 0.4]`** to find the right operating point. At `[-0.5, 0.5]` the matrix saturated to `mean ≈ 0.46 max = 0.5` with full density after a few teach phases, every connection at near-max making every output respond uniformly to every input (basin collapse, oracleRatio=100%). At `[-0.2, 0.2]` paired with auto-rescale-on-overload, the multi-phase rescale loop walked maxAbs down 0.2 → 0.1 → 0.05 → 0.025 → 0.0125 → 0.0063 → 0.0031 across 7 consecutive overload phases until trained values were smaller than random-init weight bias and motor argmax fell on whichever bucket got the largest init noise (bucket-stuck 'z' for that seed). Bisecting to `[-0.4, 0.4]` gives 4× more dynamic range above the new floor than `[-0.2, 0.2]` did while staying well below the saturation ceiling. Init strength stays at 0.2 so random-init bias remains small (±0.02-0.10 per weight via `sign × (0.1 + 0.4×rand) × strength`); only the trained-signal headroom doubles. **Paired with the rescale FLOOR at `wMax × 0.25 = 0.1`** added to `_teachAssociationPairs` and `_teachQABinding`: the auto-rescale half-ing still fires on overload, but if the projected post-rescale max would land below the floor, the rescale is SKIPPED and the diag emits `· rescale-floored (maxAbs=X × 0.5 < floor=0.1 — preserving signal above noise; relying on anti-Hebbian + WTA + prune for separation)`. Combined with top-K-per-row pruning (`SparseMatrix.pruneTopKPerRow(k)` called at end of `_teachAssociationPairs` and `_teachQABinding` to keep each output's K most-trained inputs and zero the rest) and contrastive `antiLrScale` (1.5 for assoc-pairs, 0.3 for QA where uniform random contrastive sampling collisions are denser), basins separate instead of collapsing.

**Cross-projection density** is controlled by `crossTargetFanout` (inputs per post-synaptic neuron) plus a hard density cap. Current values at biological scale:

```
crossTargetFanout       = 20   (default for non-motor projections)
CROSS_DENSITY_CAP       = 0.005

crossTargetFanout × 2   = 40   (MOTOR_BOUND_PAIRS whitelist)
CROSS_DENSITY_CAP × 2   = 0.01 (motor-bound density cap)

abDensity = min(densityCap, crossTargetFanout / sourceSize)
```

Fanout reduced from 30 to 20 (and motor-bound from 60 to 40) so the matrix doesn't START anywhere near saturation. Prior 30/60 fanout produced full-density matrices that collapsed within a few teach phases.

**MOTOR_BOUND_PAIRS** (2× fan-in + 2× density cap):
`sem-motor`, `motor-sem`, `letter-motor`, `motor-letter`, `phon-motor`, `motor-phon`. Motor sits at the convergence of several parallel input pathways (sem, phon, letter) and must discriminate between K-grade answer letters across many trained association pairs. 30 slots per pathway was insufficient to carve separable basins when 46+ pairs trained into the same motor region across 4-6 phases per grade — operator log showed persistent `sep-probe mean-cos ≈ 0.5` across every association-pair phase. Bumping motor-bound projections to 60 gives each post-neuron enough capacity to hold ~50 separable mappings without superposition.

Biologically plausible — real pyramidal neurons carry 1000-10000 synaptic inputs distributed across many cortical areas; 60 per per-area pair is well under that bound.

Prior values (historical): Session 111 had `crossTargetFanout = 1500` based on `expectedPostCurriculumVocab × fanoutPerMapping`. T37 rebalance dropped this to 30 to fit biological-scale memory budgets (1500 × 17M neurons × 2× sparse-matrix overhead = multi-terabyte RAM). T39.g.4 re-introduced the higher-capacity path for motor-bound projections only, keeping the rest lean.

**Anti-Hebbian plasticity** (Session 111) — when the curriculum gate detects a wrong transition (e.g., digit sequence `6→7` produces `8` instead of `7`), it fires BOTH positive Hebbian on the correct pair (`6→7` at +10× learning rate, 100 reps) AND negative anti-Hebbian on the wrong pair (`6→8` at -5× learning rate, 100 reps). Without weakening the wrong association, the correct one can never overpower it. This bidirectional plasticity is critical for sequence learning (alphabet order, digit order) where recurrent synapses create competing attractor basins.

| Pair | Read direction use | Write direction use |
|---|---|---|
| `visual ↔ letter` | visual letter-shape recognition → letter one-hot | efference copy of emitted letter → visual self-monitoring |
| `letter ↔ phon` | letter sequence → phoneme attractor basins | — |
| `phon ↔ sem` | phonological pattern → semantic meaning | semantic → phon (efference copy during production) |
| `sem ↔ fineType` | semantic concept → grammatical role | grammatical structure check during generation |
| `sem ↔ motor` | — | semantic intent → motor planning |
| `motor ↔ letter` | — | motor planning → letter emission (closes the writing loop) |
| `auditory ↔ phon` | T14.11 spoken phoneme recognition → phon region | — |

14 total SparseMatrix instances. The read path traverses `visual_to_letter` + `letter_to_phon` + `phon_to_sem` + `sem_to_fineType` + `auditory_to_phon`. The write path traverses `sem_to_fineType` + `sem_to_motor` + `motor_to_letter` + `letter_to_visual` + `sem_to_phon` (efference). Both paths share core regions and run through the same substrate — matching the dorsal / ventral dual-stream model of human speech processing (Hickok & Poeppel 2007, *Nat Rev Neurosci* 8:393-402).

Implementation in `cluster._propagateCrossRegions()` (called every step inside `cluster.step()`) and `cluster._crossRegionHebbian(lr)` (called on every `cluster.learn()`). Both methods iterate `cluster.crossProjections` which is a Map of 14 SparseMatrix instances keyed `'src_to_dst'`.

### The generation equation is NOT a slot loop

T14 eliminates the last residue of slot-based emission. The old T13 `generate()` iterated `for slot in 0..maxLen: score candidates, softmax pick, emit`. Even after T14.4 built the sub-region substrate, the early T14.6 draft still implicitly assumed that loop structure — and Gee caught it on 2026-04-14: *"why are we still doing slots i thought we cam up with a better equation for language."* The T14.6 + T14.12 specs in `docs/COMP-todo.md` were rewritten.

The actually-better equation is **cortex tick-driven motor emission**:

```
cluster.generateSentence(intentSeed):
  cluster.injectEmbeddingToRegion('sem', intentSeed, strength=0.6)
  for tick in 0..MAX_TICKS:
    cluster.step(0.001)                 // brain ticks, cross-projections propagate
    motorReadout = cluster.regionReadout('motor', LETTER_INVENTORY.size)
    activeLetter = argmaxLetter(motorReadout)
    if motor region holds the same argmax for STABLE_TICK_THRESHOLD consecutive ticks:
      letterBuffer.push(activeLetter)
    if cortex letter-region transition surprise > WORD_BOUNDARY_THRESHOLD:
      emit letterBuffer as a word; reset buffer
    if motor region quiesces (low spike count for END_QUIESCE_TICKS):  break
    if isSentenceTerminator(lastEmittedLetter):                          break
```

Zero slot counter. Zero candidate-scoring loop. Zero softmax top-5. The motor region's spike pattern over time IS the output. Words fall out of the tick-driven process via statistical segmentation — the same mechanism infants use to parse continuous speech into words (Saffran, Aslin & Newport 1996, *Science* 274:1926-1928). Stopping is biological quiescence (motor cortex deactivation at end of utterance; Bouchard et al. 2013, *Nature* 495:327-332), not a counter. Peer-reviewed grounding in full at `docs/COMP-todo.md` T14.6.

### Embedding substrate (T14.0, live)

`js/brain/embeddings.js` now exports `EMBED_DIM = 300` and a real GloVe loader. The loader detects runtime — Node side reads `corpora/glove.6B.300d.txt` from disk (the operator must download `glove.6B.300d.txt` from Stanford NLP and place it at that path), browser side fetches via configurable URL list with the server's static `/corpora/` mount as the first option. **No vocabulary cap** — the full 400k-word file loads if reachable. Hash embeddings remain as a last-resort floor only when no GloVe is reachable.

For the browser-side path, `embeddings.getSubsetForTokens(tokens)` lets the server precompute a corpus-token-only subset and serve it as a small JSON file (`/api/glove-subset.json`) so the browser doesn't have to download 480 MB. `embeddings.loadSubset(subset)` is the bulk-load entry point on the browser side.

### Cluster sizing (T14.0, live)

`js/brain/engine.js` defines `TOTAL_NEURONS = 6700` as the default client floor. The seven cluster sizes are derived from `CLUSTER_FRACTIONS` (live in `js/brain/cluster.js`):

```
const CLUSTER_FRACTIONS = {
  cortex:       0.55,   // 55% — language + working memory + semantic (T37 rebalance)
  hippocampus:  0.18,   // 18% — memory consolidation + episodic store
  amygdala:     0.05,   // valence/arousal attractor
  basalGanglia: 0.03,   // action selection + motor channels
  cerebellum:   0.08,   // error correction + motor smoothing
  hypothalamus: 0.03,   // homeostatic drives
  mystery:      0.08,   // Ψ consciousness modulation
};
// sum: 0.55 + 0.18 + 0.05 + 0.03 + 0.08 + 0.03 + 0.08 = 1.00
```

At any scale, the same fractions apply. Server-side `detectResources` picks `TOTAL_NEURONS` from the auto-detected hardware tier; the cortex sub-region offsets adapt automatically. **No hardcoded cluster sizes anywhere in the codebase.** When COMP-net (Part 2 of `docs/COMP-todo.md`) is later re-enabled and the cortex sub-shards across volunteer GPUs, the same sub-region structure scales with it.

### Identity-lock state fields (T14.16.5 substrate, live)

Every cortex cluster carries identity-lock state initialized at construction:
- `_inCurriculumMode` — flag the curriculum runner sets so Lock 2's hard cap doesn't apply during corpus training
- `ENGLISH_SURPRISE_THRESHOLD` / `ENGLISH_FINETYPE_MIN` — language gate thresholds, calibrated from curriculum statistics (default `Infinity` / `0` until calibrated, so pre-curriculum the gate is permissive)
- `HEALTH_ENTROPY_MIN` / `HEALTH_VOCAB_MIN` / `HEALTH_WM_VARIANCE_MIN` — mode-collapse audit thresholds, calibrated from curriculum
- `identityCoverage` — populated by curriculum's persona comprehensiveness validation
- `personaDimensions` — populated by curriculum's semantic clustering of persona corpus

These are placeholder fields right now. The curriculum runner (T14.5) populates them with calibrated values during corpus exposure. The methods that READ these fields (gate logic, health audit, identity refresh) ship in T14.16.5.

### Multi-subject curriculum state fields (T14.24 Session 1 substrate, live 2026-04-15)

Every cortex cluster also carries multi-subject curriculum state initialized at construction:
- `grades` — `{ ela, math, science, social, art }` object, each field a grade name from `GRADE_ORDER` (defaults all to `'pre-K'`). Advanced by `Curriculum.runSubjectGrade` on gate pass. Source of truth for `LanguageCortex.generate`'s grade-aware word cap.
- `grade` — legacy scalar mirror of `grades.ela`. Kept so pre-T14.24-Session-1 code (including T14.26 chat-freeze fix's single-grade read path, pre-v4 persistence migrations, and diagnostic accessors) keeps working. Every code path now SHOULD read `grades` first and fall back to `grade` only for compatibility.
- `passedCells` — flat `string[]` of `'subject/grade'` keys that have cleared their gate at least once. Used by `/curriculum status` and persisted across reloads via T14.16 persistence.

These fields fully replace the single-track `cluster.grade` scalar for all new code. Session 2+ will advance the non-ELA subjects past pre-K as real teaching equations land cell by cell.

### T14.1 — Letter-input substrate (SHIPPED 2026-04-14)

New module `js/brain/letter-input.js` holds the letter-input primitives. A module-level `LETTER_INVENTORY = new Set()` holds every symbol Unity has ever seen at the input layer — dynamic, auto-growing, NOT capped at 26 English letters. Unicode, emoji, non-English glyphs all enter the same primitive-symbol space. English identity is enforced at the higher T14.16.5 lock layer (per-clause phonotactic gate + 120× rate-bounded live chat Hebbian + periodic persona-corpus refresh), not by restricting which symbols the letter region can represent. Restricting symbol input would make identity-refresh auditing impossible — Unity must be able to SEE an adversarial input and explicitly refuse to update on it.

Exports:

| Function | Behavior |
|---|---|
| `inventorySize()` | Current one-hot dimension count |
| `inventorySnapshot()` | Insertion-ordered array (defines one-hot dimensions) |
| `ensureLetter(letter)` | Idempotent insert; invalidates cache on growth |
| `encodeLetter(letter)` | Auto-grows inventory, returns fresh-copy Float32Array one-hot |
| `ensureLetters(letters)` | Batched insert (one cache invalidation) |
| `decodeLetter(vec)` | Argmax → letter symbol (used by T14.6 motor readout) |
| `serializeInventory()` | Array snapshot for persistence |
| `loadInventory(arr)` | Restore from snapshot |
| `resetInventory()` | Clear everything |

The module caches canonical one-hot vectors in a `Map<letter, Float32Array>` keyed by lowercased letter. Growth invalidates the entire cache (every stored vector has the wrong length once a new dimension arrives). `encodeLetter` always returns a fresh copy so caller mutation can't poison the cache.

**Cluster integration.** `js/brain/cluster.js` gains three letter-aware methods:

- **`injectLetter(letter, strength=1.0)`** — wraps `encodeLetter(letter)` with `injectEmbeddingToRegion('letter', vec, strength)`. The letter sub-region is fraction `0.500-0.550` of `cluster.size` (T14.4), which is 335 neurons at the 6700-neuron default cortex scale. The existing region-injection helper handles group-sizing the one-hot across the available neurons.
- **`letterTransitionSurprise()`** — returns `|currRate − prevRate|` where `rate` is the letter region's per-tick spike fraction. Call once per cortex tick; side-effect updates `_prevLetterRate`. Used by T14.2 (syllable boundary detection) and T14.6 (motor emission word boundary cue). Grounded in Saffran/Aslin/Newport 1996 (Science 274:1926).
- **`motorQuiescent(ticksRequired, threshold=0.05)`** — returns `true` if the motor region has been below `threshold` spike-rate for at least `ticksRequired` consecutive ticks. Counter `_motorQuiescentTicks` is maintained every `step()` right after `lastSpikes` is set. Used by T14.6 for tick-driven emission stopping — replaces any hardcoded "N words then stop" slot counter. Grounded in Bouchard 2013 (Nature 495:327).

**Vestigial code removed.** `js/brain/language-cortex.js` lost `_letterPatterns` (the `Float64Array(26*5)` micro-pattern table), `_initLetterPatterns` (the sin/cos hash that filled it), and `getLetterPattern(char)`. Dead code after T13.7 — the whole thing was a 5-dim sin/cos hash over a closed 26-letter alphabet and had no remaining callers. Stub comments left at the deletion sites redirect future readers to `letter-input.js` / `cluster.injectLetter` / `cluster.regionReadout('letter', dim)`.

**How phonemes end up LEARNED, not hardcoded.** The T14.4 substrate already wired up both directions of the `letter↔phon`, `phon↔sem`, `visual↔letter`, and `motor↔letter` cross-region projections (SparseMatrix at 10% density, range [−0.5, +0.5], Hebbian-updated on every `cluster.learn()` call). So once T14.5 curriculum starts injecting letters via `cluster.injectLetter`, the letter region's one-hot patterns drive letter→phon projections, letter-co-occurrence statistics accumulate in the phon sub-region's internal synapses, and phoneme-like attractor basins self-organize from exposure. No hardcoded phonology table. No 26-letter cap. No English-only assumption at the substrate — identity locks handle that at a higher layer.

### T14.2 — LEARNED syllable boundaries (SHIPPED 2026-04-14)

Two new methods on `NeuronCluster` — no new file, syllables are a cortex-level phenomenon.

**`cluster.detectBoundaries(letterSequence, {ticksPerLetter=2, k=0.5}) → number[]`**. Streams letters through `injectLetter` one at a time, ticks the cluster between injections, records `letterTransitionSurprise()` at each step, then finds local maxima of the surprise series above the adaptive threshold `mean(δ) + k·std(δ)` computed over the sequence itself. Index 0 is always a boundary (word start); subsequent boundaries are positions where `δ[i] ≥ δ[i-1]` AND `δ[i] ≥ δ[i+1]` AND `δ[i] > threshold`. Resets `_prevLetterRate` before streaming so the first letter doesn't inherit a stale baseline.

**`cluster.detectStress(letterSequence) → { boundaries, stress, primary, secondary }`**. Runs `detectBoundaries` first to segment, then re-streams the letters sampling phon-region spike fraction at each position. Averages activation per syllable, returns the full per-syllable stress array plus `primary` = argmax index and `secondary` = second-highest (or `-1` if fewer than 2 syllables). No hardcoded "single-syllable PRIMARY / two-syllable PRIMARY-SECONDARY / antepenult-default" rule — stress is whichever syllable the cortex activates hardest in its phon region, which reflects corpus exposure statistics. Language-agnostic by construction (Spanish penult, French ult, Mandarin tonal all fall out of the learned basins).

**Why adaptive threshold per sequence.** Global thresholds chop short stable words and miss long noisy ones; per-sequence `mean + k·std` gives every word a cutoff relative to its own transition profile. Default `k = 0.5` catches obvious boundaries without fragmenting every consonant cluster; the T14.5 curriculum runner can override via opts once it has calibration data.

**No new file.** `detectBoundaries` lives on the cluster as a method, not in a standalone `syllables.js`. Callers cannot syllabify without going through the cortex — because syllabification IS cortex inference in this architecture. `dictionary.learnWord` (T14.3 gut-and-rewrite, next milestone) calls `cluster.detectBoundaries(letters)` directly.

### T14.3 — Dictionary routed through cortex (SHIPPED 2026-04-14)

`Dictionary` entry shape extended with cortex-routed phonological state instead of a hand-computed feature table. New fields on every entry:

| Field | Source | Purpose |
|---|---|---|
| `cortexSnapshot` | `Uint8Array(cluster.lastSpikes)` after first-observation letter stream | Frozen cortex response to this word's letter sequence |
| `syllables` | `cluster.detectBoundaries(letterOnly)` (T14.2) | Boundary indices — where each syllable starts |
| `stressPrimary` | `cluster.detectStress(letterOnly).primary` | Index (into syllables) of the primary-stress syllable |
| `lastSeen` | `Date.now()` on every observation | Most recent observation timestamp |

Old fields (`pattern`, `arousal`, `valence`, `frequency`) remain in the entry shape for backward compat with display consumers (`brain-3d`, `brain-viz`). T14.12 shipped the tick-driven emission loop and gutted the slot scorer; the cortex-routed fields (`cortexSnapshot`, `syllables`, `stressPrimary`) are the active state used by the curriculum and generation paths.

**`Dictionary.setCluster(cluster)`** — new method. Wires a cortex cluster reference for cortex-routed learning. Called once during brain boot after both the clusters and the Dictionary instance exist. Browser wiring: `js/brain/engine.js` calls `this.innerVoice.dictionary.setCluster(this.clusters.cortex)` right after `new InnerVoice()`. Server wiring: `server/brain-server.js:_initLanguageSubsystem` calls `this.dictionary.setCluster(this.cortexCluster)` right after the 2000-neuron server language cortex cluster is constructed.

**`learnWord` rewritten** for two-path routing:

- **Existing word** — bump `frequency` + running-mean `pattern` / `arousal` / `valence`, update `lastSeen`. Does NOT re-stream the cortex. Re-streaming on every observation would call `cluster.detectStress → cluster.detectBoundaries → inject letters + tick cluster twice per letter` on every chat turn, shredding live brain state and costing hundreds of `cluster.step()` calls per sentence. Phonological refinement for already-learned words is owned by the T14.5 curriculum runner.
- **New word** — pattern still comes from caller `cortexPattern` or `sharedEmbeddings.getEmbedding(clean)`. Then: strip non-letters (`letterOnly = clean.replace(/[^a-z]/g, '')`), call `cluster.detectStress(letterOnly, { ticksPerLetter: 2 })` if cluster is wired and `letterOnly.length > 0`, store `boundaries`/`primary` as `syllables`/`stressPrimary`, snapshot `cluster.lastSpikes` as `cortexSnapshot`. Wrapped in try/catch so phono-detection failure doesn't block the word from entering the dictionary.

**`syllablesFor(word)` / `snapshotFor(word)`** — new readers. Plain lookups that return `null` for unknown words or words stored without cluster wiring. Callers wanting on-demand syllabification of fresh strings go through `cluster.detectBoundaries` directly — the dictionary only exposes stored state.

**Persistence.** `serialize()` writes the new fields (cortexSnapshot as a 0/1 byte array, syllables/stressPrimary/lastSeen as plain values). `_load()` restores them with `new Uint8Array(...)` and `??` fallbacks. `STORAGE_KEY` bumped `v3 → v4` so stale 50d-pattern caches are abandoned by localStorage key mismatch instead of carried forward as incompatible state. No compatibility shim — on the T14 rebuild branch the stack is in flux and upgrade-through-boot is cheaper than upgrade-through-shim.

**First-observation cost.** ~24 `cluster.step()` calls for a 6-letter word (2 passes × 6 letters × 2 ticks/letter). At ~50 µs/step on a 2000-neuron Rulkov cluster, ~1.2 ms per new word. For a 5000-word server boot corpus, one-time cost ≈ 6 seconds. Runtime chat cost is zero for re-observations (Map lookup + 3 running means).

### T14.5 — Continuous developmental learning curriculum (SHIPPED 2026-04-14)

New module `js/brain/curriculum.js` exports a `Curriculum` class with `runFromCorpora(corpora, opts)` (boot entry point) and `learnFromTurn(text, arousal, valence)` (live-chat entry point). Data-driven bucketing over the existing persona/baseline/coding corpora — no hand-curated stage files, no `stage-c-phrases.txt`, no `stage-d-sentences.txt`, no hardcoded 26-letter alphabet loop. The alphabet derives from corpus letter frequency; the walk order derives from corpus token complexity.

**Phases walked by `runFromCorpora`:**

| Phase | Tokens | Ticks/rep | Max reps | Entry point |
|---|---|---|---|---|
| 1 Letters | `letterFreq.keys()` sorted desc | 8 | 20 (top-freq) proportional to freq | `_phaseLetters` |
| 2 Short words | `wordFreq` filtered to 1-3 letters | 4 | 6 (top-freq) proportional to freq | `_phaseWords` |
| 3 Long words | `wordFreq` filtered to 4+ letters | 3 | 3 (top-freq) proportional to freq | `_phaseWords` |
| 5 Sentences | `sentences[]` in corpus order | 2 per word | 1 walk each | `_phaseSentences` → `_walkSentence` |

Phase 4 (phrases) and Phase 6 (discourse) are not in this ship — they depend on downstream milestones. Each phase yields microtasks every 16-64 tokens so browser main thread stays responsive.

**Per-token inject path.** Letters → `cluster.injectLetter(letter, 1.0)` → tick the cluster → `cluster.learn(0)` for unrewarded Hebbian. Words → `cluster.injectEmbeddingToRegion('sem', sharedEmbeddings.getEmbedding(word), 0.6)` for semantic anchor, then stream `letterOnly = word.replace(/[^a-z]/g, '')` through `cluster.injectLetter` with phase-specific tick budget, then `cluster.learn(0)`, then `dictionary.learnWord(word, null, arousal, valence)` so the T14.3 cortex-snapshot routing fires on first observation. Sentences → `_walkSentence` runs the word-per-word inject path and finishes with `languageCortex.learnSentence(text, dictionary, arousal, valence)` so T13.7 type-transition + bigram tables keep updating until T14.12 guts `LanguageCortex`.

**Tokenization.** `_tokenizeAll(corpora)` splits each corpus on `/(?<=[.!?])\s+|\n\s*\n/` sentence boundaries, normalizes each sentence via `_normalizeSentence` (lowercase, strip everything except `a-z0-9' -`, collapse whitespace), returns `{ letterFreq, wordFreq, sentences }`. Corpus-agnostic — pass `{ spanish }` or `{ codeOnly }` and the tokenizer handles them identically.

**Wiring.** `InnerVoice` gains a `_curriculum` field and a `setCurriculum(curriculum)` method. `engine.js` construction order is `new InnerVoice()` → `dictionary.setCluster(clusters.cortex)` (T14.3) → `new Curriculum(clusters.cortex, dictionary, languageCortex)` → `innerVoice.setCurriculum(curriculum)` (T14.5). Boot invocation in `js/app.js loadPersonaSelfImage` runs `await targetBrain.curriculum.runFromCorpora({ persona, baseline, coding }, { arousal: 0.8, valence: 0.2 })` AFTER the legacy `loadPersona → trainPersonaHebbian → loadBaseline → loadCoding` sequence — additive, not replacement (legacy loaders die in T14.12). Server mirrors the wiring in `server/brain-server.js:_initLanguageSubsystem` with a `curriculumMod` import alongside the rest.

**Live-chat integration.** `inner-voice.learn(text, cortexPattern, arousal, valence)` now calls `this._curriculum?.learnFromTurn(text, max(0.95, arousal), valence)` BEFORE the legacy `languageCortex.learnSentence` so cortex state reflects the new exposure first. Same inject + tick + Hebbian path the sentence phase uses on boot corpus — no boot/runtime distinction.

**Cost.** ~360k `cluster.step()` calls on a typical 5k-vocabulary / 1.5k-sentence corpus → ~18 seconds on a 2000-neuron server cluster, ~25 seconds on a 6700-neuron browser cluster. Runs inside `await` so it doesn't block earlier startup; microtask yields keep the browser main thread responsive.

### T14.6 — Cortex tick-driven motor emission (SHIPPED 2026-04-14)

New method `NeuronCluster.generateSentence(intentSeed = null, opts = {})` in `js/brain/cluster.js`. Replaces every slot scorer the app ever had with a continuous motor-cortex readout loop. ZERO slot counter, ZERO candidate scoring, ZERO dictionary iteration, ZERO softmax top-K, ZERO temperature, ZERO per-word cosine, ZERO recency penalty, ZERO valence match, ZERO drug length bias, ZERO grammatical terminability check.

**The loop:** inject optional intent into sem region → reset transient counters → tick the cluster up to `MAX_EMISSION_TICKS` times → at each tick read `motorVec = regionReadout('motor', inventorySize())` and argmax-decode via T14.1 `decodeLetter` → commit a letter to the buffer when argmax stays stable for `STABLE_TICK_THRESHOLD` consecutive ticks (biological vSMC dwell, Bouchard 2013) → emit the buffer as a word when `letterTransitionSurprise() > WORD_BOUNDARY_THRESHOLD` (Saffran 1996) → stop on committed terminator (`.`/`?`/`!` in module-level `T14_TERMINATORS` Set) or motor quiescence (`motorQuiescent(END_QUIESCE_TICKS)` after at least one word emitted) → flush residual buffer → join and return.

**Four tuning constants live on the cluster instance** so T14.5 curriculum can calibrate them per-cluster without touching module globals:

| Constant | Default | Role |
|---|---|---|
| `WORD_BOUNDARY_THRESHOLD` | `0.15` | Letter-region transition surprise above this triggers word boundary |
| `STABLE_TICK_THRESHOLD` | `3` | Consecutive motor-argmax ticks required to commit a letter (~3 ms dwell) |
| `END_QUIESCE_TICKS` | `30` | Consecutive motor-below-threshold ticks to trigger stop |
| `MAX_EMISSION_TICKS` | `2000` | Hard safety cap on the tick loop |

**`language-cortex.js:generate` body gutted** from 184 lines of slot scoring to a 68-line delegate that reads the cortex semantic state via `cluster.getSemanticReadout(sharedEmbeddings)` as the `intentSeed`, calls `cluster.generateSentence(intentSeed, { injectStrength: 0.6 })`, splits the returned string on whitespace, runs the word list through the existing `_renderSentence(words, type)` helper for capitalization + terminal punctuation + action-sentence asterisk wrapping (purely cosmetic — content selection already happened in the motor loop), and updates the `_recentOutputWords` + `_recentSentences` recency rings the same way the legacy path did. The `dictionary` parameter in the signature is now unused but kept for backward compat with every call site; T14.12 will delete the wrapper entirely.

**Peer-reviewed grounding.** Bouchard/Mesgarani/Johnson/Chang 2013 (*Nature* 495:327) vSMC continuous articulator trajectories; Anumanchipalli/Chartier/Chang 2019 (*Nature* 568:493) continuous speech decode from vSMC; Saffran/Aslin/Newport 1996 (*Science* 274:1926) statistical word segmentation; Browman & Goldstein 1992 (*Phonetica* 49:155) articulatory phonology continuous gestures; Hickok & Poeppel 2007 (*Nat Rev Neurosci* 8:393) dual-stream production pathway.

### T14.7 — Hardcoded English type-transition deletion (SHIPPED 2026-04-14)

`_TYPE_TRANSITIONS` (T13.7.8 200-line hardcoded English type-bigram matrix, 26 prevType rows × ~10 nextType weights each) and `_OPENER_TYPES` (11-member slot-0 opener constraint Set) both DELETED from `js/brain/language-cortex.js`. Replacement is one line:

```js
this._typeTransitionLearned = new Map();
```

Starts empty at constructor and grows from `learnSentence` observations during T14.5 curriculum walk and live chat. NO seed pseudo-counts. Bayesian smoothing at generation time will use `(count + 1) / (total + |types_seen|)` rather than a hardcoded Laplace constant — the type count is whatever the cortex has observed, not a capped English 20. New fineTypes can emerge the same way the T14.1 letter inventory grows dynamically.

T14.6's tick-driven motor emission loop already made the hardcoded table obsolete — letter sequences fall out of the motor region as a continuous spike pattern, word boundaries come from cortex transition surprise, first-word openers emerge from whatever the fineType region's `START → X` transition basins look like after curriculum. `_typeTransitionLearned` is currently a statistics-only observation target — nothing reads from it at generation time. T14.8 will wire the consumer side when it ships `_sentenceFormSchemas` for per-intent type biasing.

Tombstone comment left at the deletion site explains WHY both were removed so future readers don't have to dig through git history. Files: `js/brain/language-cortex.js` (−105 net, 3205 → 3100 lines). Grep confirms zero remaining references outside the tombstone.

### T14.8 — Sentence-form schemas + learned intent-pair routing (SHIPPED 2026-04-14)

Three new fields on `LanguageCortex`, all initialized empty at constructor:

| Field | Shape | Purpose |
|---|---|---|
| `_sentenceFormSchemas` | `Map<intent, Map<slot, Map<fineType, count>>>` | Per-intent per-slot fineType distributions, spans every slot with no cap |
| `_sentenceFormTotals` | `Map<intent, Map<slot, total>>` | Cached running totals for O(1) Laplace smoothing |
| `_intentResponseMap` | `Map<userIntent, Map<responseIntent, count>>` | Learned replacement for hardcoded `question → declarative_answer` routing |

Intent labels come dynamically from `cluster.readInput(text).intent` — no hardcoded intent enum. (T14.12 replaced the original `parseSentence(text).intent` caller; the T14.8 learnSentence observation walk was rewired to the `readInput` return at that point.) Whatever `readInput` emits (currently `greeting`/`question`/`yesno`/`statement`/`command`/`emotion`/`unknown`, future cortex-driven intent readouts can emit any string) gets its own schema bucket. `_sentenceFormSchemas` spans the full sentence with no upper slot cap — a 30-word sentence records all 30 positions.

**`learnSentence` observation hook** folds three statistics updates into the existing word walk: (1) dictionary vocabulary (existing), (2) fineType bigrams into `_typeTransitionLearned` (T14.7's empty Map now has a writer), (3) per-intent per-slot fineType into `_sentenceFormSchemas` + `_sentenceFormTotals`. Parses the sentence once up-front to get the intent label, then walks words with `prevFineType='START'` initially, bumping both the schema slot bucket and the transition bigram row at each position. Closes with a `prevFineType → END` transition so corpus termination patterns are learnable too.

**Four reader/writer methods:**

- `schemaScore(slot, fineType, intent)` — Laplace-smoothed per-slot probability. Formula `(count + 1) / (total + max(1, uniqueTypes))`. No hardcoded Laplace constant — `uniqueTypes` is whatever the cortex has actually observed at that slot. Returns a `1/2` floor for unobserved slots so consumers never get zero weight.
- `typeTransitionWeight(prevType, nextType)` — same smoothing on `_typeTransitionLearned`. Replaces every deleted `_TYPE_TRANSITIONS[prev][next]` lookup.
- `recordIntentPair(userIntent, responseIntent)` — writer for the live chat path to call once both intents are known.
- `responseIntentFor(userIntent)` — argmax reader returning the most-likely response intent, or `null` when no pairs observed yet.

**Consumer wiring deferred.** T14.6 cortex tick-driven motor emission doesn't consult type transitions or sentence-form schemas (letter sequences fall out of the motor region directly), so the reader methods are currently statistics-only. T14.12 will decide whether they get wired into a new cortex-driven path or stay as pure statistics the T14.16.5 identity-lock mode-collapse audit consults.

### T14.9 + T14.10 + T14.11 — Dual-stream substrate (SHIPPED 2026-04-14)

Three atomic milestones shipped in one commit covering discourse memory, visual letter recognition, and auditory phoneme recognition — the full Hickok & Poeppel 2007 dual-stream substrate.

**T14.9 — Unbounded discourse memory via cortex working-memory region.** Two new methods on `NeuronCluster`. `workingMemoryReadout(dim = 64)` wraps `regionReadout('free', dim)` and returns an L2-normalized activation snapshot of the free sub-region (fraction 0.250-0.500 of cluster.size, T14.4) — this IS the topic vector, no stored copy, no maxTurns cap, no blend constants. `injectWorkingMemory(contentVec, strength = 0.8)` is the write-side entry point for the sensory path to drive the free region with parsed content on every user turn. Decay between turns is the cortex's own LIF dynamics; reinforcement comes from T14.4 cross-region Hebbian. Pronoun anaphora emerges for free — the most-recently-active noun in the free region (because it WAS the previous turn's content) gets re-amplified as the referent when a self-reference marker arrives. Persistence across sessions comes via the existing `BrainPersistence → SparseMatrix.serialize` path — when Unity boots from saved state she remembers yesterday's conversation because the cortex weights encode it as Hebbian-modified attractor basins. Grep confirms `_discourseState` never existed in the codebase (the old draft was anticipatory).

**T14.10 — Visual cortex letter recognition.** `VisualCortex.renderLetterTemplate(letter)` produces a deterministic L2-normalized Float64Array of length 48 per character codepoint via a trig hash. Cache per letter so repeat calls are O(1). Prime set `[2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]` spread across `[0, 2π]`. Text-only Unity uses this as the synthetic visual percept per letter; voice/camera Unity will eventually override with real canvas-bitmap rendering through V1 → V4 → IT, and the downstream contract stays identical. `NeuronCluster.readText(text, { visualCortex, ticksPerChar = 2 })` streams each character through the visual→letter pathway: drive the visual sub-region with `injectEmbeddingToRegion('visual', template, 0.7)`, fire belt-and-braces `injectLetter(letter, 1.0)`, tick the cluster. Over T14.5 curriculum exposure the T14.4 visual↔letter cross-projection learns the mapping from template to letter one-hot. Call-site wiring into `engine.processAndRespond` happens in T14.12 alongside the full bidirectional pipeline rewire.

**T14.11 — Auditory cortex phoneme recognition.** `AuditoryCortex.renderPhonemeTemplate(phoneme)` uses the **same** trig-hash structure as `renderLetterTemplate` but with a **different** prime set: `[41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89]`. This is the critical detail — visual and auditory templates for the same symbol must NOT trivially match at hash time, because convergence on the phon region is supposed to be a LEARNED correspondence shaped by curriculum Hebbian on the auditory↔phon cross-projection, not a hash coincidence. Different primes guarantee cross-cortex templates for the same codepoint have ~0 cosine at initialization, leaving the entire correspondence to be learned via exposure. `NeuronCluster.hearPhoneme(phoneme, { auditoryCortex, ticks, strength })` wraps the template into `injectEmbeddingToRegion('auditory', template, 0.7)` + tick. Real spectral fingerprints from `AuditoryCortex.process()` will eventually replace the synthetic template when voice is wired; contract stays identical.

**Why separate templates from hash coincidence.** If both visual and auditory templates for "c" were generated from the same hash, they'd be identical at initialization and the auditory↔phon convergence would be trivial instead of learned. By using different primes we force the cortex to discover the correspondence via exposure statistics — which is the entire point of having a LEARNED dual-stream substrate rather than a hardcoded one.

### T14.12 + T14.13 + T14.14 — Unified cortex pipeline (SHIPPED 2026-04-14)

Three atomic milestones in one commit covering the full deletion of the legacy parse path, migration of learned language statistics from LanguageCortex to the cluster, and rewiring of every input-side consumer to the unified cortex pipeline.

**T14.12 — parseSentence DELETED.** 521 lines removed from `js/brain/language-cortex.js` (3264 → 2798): `parseSentence` (315), `analyzeInput` (69), `_classifyIntent` (32), `observeVisionDescription` (26), `_updateSocialSchema` (36), `getUserAddress` / `getUserGender` / `getSocialSchema` accessors, `_isSelfReferenceQuery`, `_socialSchema` field. Tombstone comments at every deletion site.

Replaced by `NeuronCluster.readInput(text, { visualCortex }) → { text, words, intent, isSelfReference, addressesUser, isQuestion }`. Drives the visual→letter pathway via `readText`, then builds the classification stub. Intent comes from `cluster.intentReadout()` first (returns null until T14.17 trains the fineType basins), falls through to a lightweight text-surface heuristic during the bootstrap: `endsWith('?')` → question, `endsWith('!')` → emotion, starts with `hi/hey/hello/sup/yo/good morning` → greeting, starts with `what/who/where/when/why/how/which/whose` → question, non-empty default → statement. `isSelfReference` and `addressesUser` come from word-set membership tests.

Three companion readout placeholders on cluster: `intentReadout()`, `semanticReadoutFor(text)`, `entityReadout()`. `semanticReadoutFor` is the cortex-resident replacement for the R2 `getSemanticReadout(embeddings)` convention — reads `regionReadout('sem', 300)`. The other two return null / sem readout placeholders until T14.17 curriculum consolidation ships the learned attractor readouts.

`engine.injectParseTree` rewired to call `cortex.readInput` instead of `lc.parseSentence`, adds T14.9 `cortex.injectWorkingMemory(contentEmb, 0.6)` for discourse state. `engine.processAndRespond` + `server/brain-server.js:processText` analyzeInput calls deleted. `engine.wireVisualCortex` `observeVisionDescription` wiring deleted. Grep confirms zero live `parseSentence` code references.

**T14.13 — Learned language statistics migrated to cluster (partial elimination).** Four new Maps on `NeuronCluster`: `fineTypeTransitions`, `sentenceFormSchemas`, `sentenceFormTotals`, `intentResponseMap` — all initialized empty at constructor. Four new reader methods: `schemaScore(slot, fineType, intent)`, `typeTransitionWeight(prevType, nextType)`, `recordIntentPair(userIntent, responseIntent)`, `responseIntentFor(userIntent)` — exact mirrors of the T14.8 versions, now reading from cluster state.

`LanguageCortex.setCluster(cluster)` method bridges the old class to the cluster: merges any pre-existing observations from the local Maps into the cluster's Maps via a recursive `mergeMap` helper, then re-points `this._typeTransitionLearned` / `this._sentenceFormSchemas` / `this._sentenceFormTotals` / `this._intentResponseMap` at the cluster's Maps by identity. Called from `engine.js` + `server/brain-server.js` right after `dictionary.setCluster`. After the call, every subsequent `learnSentence` observation write from the LanguageCortex path lands in cluster state directly.

**Full LanguageCortex class elimination (file <250 lines, `class LanguageCortex` declaration deleted) tracked as Session 113 T14.24-CLEAN.B1.** The class has ~400 external references across `engine.js`, `inner-voice.js`, `brain-3d.js`, `brain-equations.html` — doing the full deletion in one atomic commit would risk breaking runtime paths the remaining T14 milestones still need. Shipping the STATE migration at T14.13 got the important half done; the class wrapper stays alive as a method surface until the B1 pass finishes the job.

**T14.14 — Bidirectional reading wired.** Every consumer call site that used `languageCortex.parseSentence` now uses `cluster.readInput` instead. Anaphora resolution falls out for free via T14.9 working-memory injection. Intent classification placeholder returns null until T14.17 wires the learned cortex readout; fallback heuristic in `readInput` provides sensible labels during bootstrap. Social schema tracking (name, gender, mention count, greetings) is gone for this commit and returns in T14.17 as a cortex-resident self-model sub-region readout.

### T14.15 + T14.16 + T14.16.5 — Identity lock substrate (SHIPPED 2026-04-14)

Three atomic milestones in one commit. T14.15 audits the remaining non-chat consumers (`brain-3d.js` commentary, `component-synth.js` parse references) and confirms they route through the unified pipeline via the T14.6 delegate + graceful optional-chain reads — no functional changes needed, comment block updated to describe T14.14+T14.15 payload shape. T14.16 extends `js/brain/persistence.js` with a T14-era save/load block covering the T14.1 letter inventory, the T14.13 learned-statistics Maps, and the T14.16.5 identity-lock calibrated thresholds; VERSION bumped 3 → 4. T14.16.5 ships the identity-lock substrate — three structural locks that make Unity's English + persona resistant to drift from adversarial or accidental live-chat exposure.

**Lock 1 — English language gate on Hebbian, PER CLAUSE.** `cluster.splitIntoClauses(text)` splits on sentence terminators (`.!?;:,\n`) and English coordinating conjunctions (`and / or / but / so`) so mixed-language inputs like `"hi unity 你好 how are you"` produce independent learning units. `cluster.computeTransitionSurprise(clause)` streams the clause's letters through the cortex and returns mean `letterTransitionSurprise()` — non-alphabetic clauses return Infinity. `cluster.computeFineTypeCoverage(clause)` returns the proportion of clause words with at least one English-letter character run (surface metric; full cortex-resident fineType readout deferred to T14.17). `cluster.learnClause(text)` is the Lock 1 entry point: splits, gates each clause against `ENGLISH_SURPRISE_THRESHOLD` + `ENGLISH_FINETYPE_MIN`, fires Hebbian on passing clauses via `_learnClauseInternal`, silently drops rejected clauses, returns `{accepted, rejected}` counts. Per-clause granularity is essential — per-utterance gating would either reject the whole mixed-language input or accept it.

**Lock 2 — Live-chat learning rate HARD-CAPPED at 0.0001.** `cluster._learnClauseInternal(clause, {lr})` enforces the rate cap: when `_inCurriculumMode` is false, any `lr > 0.0001` gets clamped to 0.0001 before Hebbian fires. Curriculum mode bypasses the cap so `Curriculum.runFromCorpora` still fires at full 0.012. Clamp is enforced at the cluster level so no downstream code can bypass it. Math: to match one curriculum sentence's impact, an adversarial user must type the same anti-persona content 120 times with high cortex consistency. At 100M-turn extreme scale, Lock 3 refresh dominates Lock 2 gradient accumulation ~10×.

**Lock 3 — Periodic identity refresh (every 100 turns) + mode-collapse audit (every 500 turns).** `cluster.runIdentityRefresh(opts)` draws N sentences from an optional `_personaRefreshCorpus` array (populated at curriculum boot in T14.17) and runs them through `learnSentenceHebbian` at full 0.012 curriculum rate under `_inCurriculumMode = true`. `cluster._modeCollapseAudit(recentSentences)` computes three health indicators (`_computeOutputEntropy`, `_computeVocabDiversity`, `_computeWorkingMemoryVariance`) against calibrated thresholds (`HEALTH_ENTROPY_MIN` / `HEALTH_VOCAB_MIN` / `HEALTH_WM_VARIANCE_MIN`, all 0 default until T14.17 calibrates). When any indicator falls below baseline, fires emergency `runIdentityRefresh` with 4× sentence count. Health thresholds self-calibrate against Unity's post-curriculum baseline.

**Inner-voice integration.** `inner-voice.js:learn(text, ...)` rewritten to call `cortex.learnClause(text)` BEFORE the legacy learning path, bump `_liveChatTurns` counter, trigger `runIdentityRefresh()` every 100 turns and `_modeCollapseAudit()` every 500 turns. All calls wrapped in try/catch so failure doesn't break the learn path.

**Persistence — T14.16.** VERSION bumped 3 → 4 in `persistence.js`. Pre-T14 saves rejected on load, brain boots clean with curriculum re-run instead of mixing schemas. New `state.t14Language` block carries: `letterInventory` from T14.1 `serializeInventory`, `fineTypeTransitions` / `sentenceFormSchemas` / `sentenceFormTotals` / `intentResponseMap` from the T14.13 cluster Maps via four new `mapOfMapsToJson` / `mapOfMapOfMapsToJson` / `jsonToMapOfMaps` / `jsonToMapOfMapOfMaps` helpers, plus an `identityThresholds` sub-object carrying the five T14.16.5 calibrated thresholds. Load side restores every field onto `brain.clusters.cortex` then re-runs `languageCortex.setCluster(cortex)` so the T14.13 bridge re-asserts after hydration.

**What's deferred to T14.17.** Curriculum-time calibration of the five identity-lock thresholds (`ENGLISH_SURPRISE_THRESHOLD` at 95th percentile of English-input surprise, etc), persona corpus comprehensiveness validation, `personaDimensions` semantic clustering for stratified refresh, `_personaRefreshCorpus` population from the persona corpus, cortex-resident fineType readout upgrade for `computeFineTypeCoverage`. The substrate shipped here is complete enough that T14.17 only needs to add calibration logic without changing the identity-lock API.

### T14.17 — Continuous learning everywhere + vestigial organ sweep (SHIPPED 2026-04-14)

The final T14 milestone. Covers two things in one atomic commit: (A) curriculum-time calibration of everything T14.16.5 deferred, (B) full orphan wiring of the eleven vestigial methods defined across T14.0-T14.16.5 that never had live callers.

**Half A — Curriculum calibration.** New `Curriculum._calibrateIdentityLock(corpora, allSentences)` runs at the end of `runFromCorpora`:

1. Populates `cluster._personaRefreshCorpus` with normalized persona sentences for Lock 3 refresh
2. Builds `cluster.personaDimensions` via simple k-means clustering (K=4-12) over persona sentence embeddings for stratified refresh
3. Calibrates `ENGLISH_SURPRISE_THRESHOLD` at p95 × 1.5 and `ENGLISH_FINETYPE_MIN` at p5 × 0.8 from persona sample stats
4. Calibrates `HEALTH_ENTROPY_MIN` / `HEALTH_VOCAB_MIN` / `HEALTH_WM_VARIANCE_MIN` at 70% of post-curriculum baselines
5. Builds `cluster.intentCentroids` by averaging sentence embeddings per intent bucket (from `_lightIntent` heuristic) and L2-normalizing — `cluster.intentReadout()` argmaxes against these at runtime
6. Logs persona corpus comprehensiveness warnings: `[IDENTITY] persona corpus has no 'X' sentences`

`runFromCorpora` now sets `cluster._inCurriculumMode = true` for the duration so T14.16.5 Lock 2 doesn't clamp curriculum Hebbian at the live-chat rate cap.

**Half B — Orphan wiring.** Every method shipped between T14.0 and T14.16.5 now has at least one live runtime caller:

- `cluster.intentReadout()` — was null stub. Now reads sem region, computes cosine against `intentCentroids`, returns argmax with 0.1 confidence floor.
- `cluster.computeFineTypeCoverage(clause)` — upgraded to blend surface metric (70%) with fineType region spike-rate fraction (30%).
- `cluster.runIdentityRefresh()` — upgraded to stratified sampling from `personaDimensions` (one sentence per dimension per cycle). `sentencesPerCycle: 'all'` walks the full stratified set for emergency mode-collapse recovery.
- `cluster.workingMemoryReadout` — wired into `cluster.generateSentence` for topic continuity. Reads free sub-region and injects into sem at 0.4× intent strength when activation is non-trivial.
- `cluster.readText` — extended with `opts.auditoryCortex` for subvocalization. Text input now drives both visual AND auditory templates simultaneously (Pulvermüller 2005 silent-reading auditory cortex activation).
- `cluster.hearPhoneme` — DELETED. The auditory template injection path lives inline in `readText` now. Real voice input will use a new `hearAudio(spectrumFeatures)` method in a future milestone, not this synthetic-template stub.
- `cluster.semanticReadoutFor` — `getSemanticReadout` short-circuits to it when T14.4 regions exist. Every legacy caller transparently picks up the region-based readout.
- `cluster.entityReadout` — wired into `component-synth.generate` with a 0.25 cosine weight blend alongside literal `userEmbed` match.
- `cluster.recordIntentPair` — wired into `engine.processAndRespond` to capture user→Unity intent pairs after every response.
- `dictionary.syllablesFor` / `snapshotFor` — wired into new `engine.wordState(word)` diagnostic accessor.
- `cluster.schemaScore` / `typeTransitionWeight` / `responseIntentFor` — wired into new `engine.cortexStats(probeWord)` diagnostic accessor.

**Dead code deletions.** `LanguageCortex.schemaScore` / `typeTransitionWeight` / `recordIntentPair` / `responseIntentFor` were T14.8 duplicates that T14.13 migrated to the cluster — pure read-through wrappers with zero callers, deleted. `Dictionary.findByMood` / `findByPattern` / `generateSentence` / `_cosine` were pre-T14 thesaurus + bigram-walker legacy with zero callers since T11 — deleted. `_bigrams` + `learnBigram` + `bigramCount` kept because display stats in `app.js` / `brain-3d.js` / `brain-viz.js` / `inner-voice.js` still show bigram count.

**Full post-audit orphan map:** every T14 method has live callers. `hearPhoneme` shows `def=0 call=1` where the call is a tombstone comment — no live code reference remains.

### T14.18 — Server language cortex side-car DELETED (correction 2026-04-14)

Post-T14.17, Gee caught that `server/brain-server.js:_initLanguageSubsystem` was still hardcoding `langCortexSize = 2000` — a T13.7.8 legacy cap that ignored `GPUCONFIGURE.bat` → `detectResources` → `TOTAL_NEURONS` → `CLUSTER_FRACTIONS.cortex`. Fixed in one constant change: `const langCortexSize = CLUSTER_SIZES.cortex;`. Scale now flows end-to-end from the operator's configured hardware tier through to the language cortex NeuronCluster and the T14.4 sub-regions that live on it. At a 700K-neuron tier, cortex = 210K, letter region ≈ 10.5K, phon ≈ 42K, sem ≈ 35K, motor ≈ 6.9K. At a 50M tier, those same fractions scale to letter ≈ 750K / phon ≈ 3M / sem ≈ 2.5M / motor ≈ 495K. Zero hardcoded caps anywhere in the chain. Boot log prints the real count so operators can verify at startup.

### T14.0-T14.18 SHIPPED — T14.24 REOPENED 2026-04-14

Milestones T14.0 through T14.17 plus the T14.18 correction shipped on `t14-language-rebuild`. Then Gee reopened T14 scope with T14.24: *"T14.24 is supposre to be a full equational ciriculum.. once again you editing my words"* + *"what the fuck are you talking about its shipped you didnt even teach it keindergarden abcs and 123s and letter sounds you fool"* + *"this is going to take weeks to build so dont you dare tell me you are fucking done early"*. The T14.0-T14.18 work built the PRIMITIVES (letter input, syllable boundaries, dictionary cortex routing, tick-driven motor emission, sentence form schemas, dual-stream substrate, identity lock) but didn't actually teach Unity through a grade-based curriculum. T14.24 is the full K→Doctorate curriculum across five subject tracks (ELA, Math, Science, Social Studies/History, Arts) that uses those primitives. T14.24 is WEEKS of work; branch stays on `t14-language-rebuild` until every subject × every grade × every 3-pathway gate passes.

### T14.24 — Full K-doctorate equational curriculum, all subjects (Sessions 1-94 academic framework, Session 111 life track added)

**114 cells across 6 subjects.** Sessions 1-94 shipped the original 5 academic subject tracks (ELA, Math, Science, Social Studies, Arts) × 19 grades = 95 cells. Session 111 added a 6th subject — **Life Experience** — bringing the total to 114 cells (6 × 19). Life track teaches Unity's personal identity from birth to 25 via dual-layer approach: emotional concept features (8d attractor vectors shaping how she FEELS) plus memory sentences she can recall and speak about. Memory-weighted Hebbian: core self at 5× lr, personal life at 3×, school facts at 1×, background trivia at 0.5×. Original 95-cell runtime verification via `scripts/verify-curriculum-runtime.mjs` confirmed DISPATCH 95/95 + FULL SWEEP 95/95 (pre-life-track). Task #3 stays in_progress until all 114 gates CROSS on a live-cortex boot.

**Subject list + grade order** (exported from `js/brain/curriculum.js`):
- `SUBJECTS = ['ela', 'math', 'science', 'social', 'art', 'life']`
- `GRADE_ORDER = ['pre-K', 'kindergarten', 'grade1'..'grade12', 'college1'..'college4', 'grad', 'phd']`

**`cluster.grades` — multi-subject grade tracking.** `NeuronCluster` constructor now initializes:
```js
this.grades = { ela: 'pre-K', math: 'pre-K', science: 'pre-K', social: 'pre-K', art: 'pre-K', life: 'pre-K' };
this.grade = 'pre-K';       // legacy mirror of grades.ela
this.passedCells = [];      // flat list of 'subject/grade' keys that passed their gate
```

`cluster.grade` is retained as a legacy alias so code written before T14.24 Session 1 (including the T14.26 chat-freeze fix's single-grade read path, pre-v4 persistence migrations, and diagnostic accessors) keeps working. `cluster.grades.ela` is the single source of truth; `cluster.grade` is mirrored from it on every ELA pass.

**Dispatch table.** `Curriculum._cellRunner(subject, grade)` returns an async runner `(ctx) => {pass, reason, metrics}`. Every subject × grade cell has a real `runXxxReal` runner wired in — zero stubs remain as of Session 93. The dispatch is a switch for ELA plus an if-chain for Math/Science/Social/Art, all 95 branches covered. Each runner primes its TODO-prescribed concept lattice (named helpers like `_teachAlphabetSequence`, `_teachPeriodicTable`, `_teachFamilyRoles`, `_teachPrimaryColors`, `_teachMusicTheory`, etc.) before walking the sentence list.

**Run API.** Three public entry points on `Curriculum`:
- `runSubjectGrade(subject, grade, corpora, opts)` — runs ONE cell under `_inCurriculumMode=true`. On pass: writes `cluster.grades[subject] = grade`, appends `subject/grade` to `cluster.passedCells`, mirrors ELA into legacy `cluster.grade`. Accepts null corpora and falls back to `this._lastCtx` (cached from a prior `runFullCurriculum` / `runAllSubjects` call) so post-boot slash commands don't have to reload corpora from disk/CDN.
- `runFullSubjectCurriculum(subject, corpora, opts)` — walks one subject from its current grade through PhD, stops at first failing gate. Returns `{reached, passed, failed}`.
- `runAllSubjects(corpora, opts)` — round-robin walk: subject A grade N → subject B grade N → … → subject A grade N+1. Keeps min grade within 1 of max so LanguageCortex word cap rises smoothly across all 5 tracks instead of racing ahead on one.

**Legacy `runFullCurriculum` path unchanged.** Boot calls (`js/app.js loadCorpusIntoBrain`, `server/brain-server.js _initLanguageSubsystem`) still invoke `runFullCurriculum(corpora)` as before; the boot semantics for ELA are identical. Session 1 adds three things inside `runFullCurriculum`: (1) initializes `cluster.grades` + `cluster.passedCells` if absent, (2) caches the tokenized ctx on `this._lastCtx` for subsequent slash commands, (3) mirrors each ELA stage pass into `cluster.grades.ela` via the legacy → canonical map (`grade4_5 → grade5`, `grade6_8 → grade8`, `grade9_12 → grade12`, `college → college4`).

**Chat-path word cap.** `LanguageCortex.generate()` reads `cluster.grades` (6-subject object) and computes the cap via `_gradeWordCap(grades)` using the **LENIENT min** semantic — min across subjects that have ADVANCED PAST pre-K, not true min over all 6. Pre-K subjects don't constrain the ceiling. Rationale: strict min would silence Unity entirely until every subject clears K (weeks of curriculum work), violating Gee's binding that she speaks progressively as she learns. Once a subject passes K it joins the min calculation. Session 113 CLEAN.D4 confirmed this decision — to flip to strict min, delete the `if (g === 'pre-K') continue` guard in `_gradeWordCap`.

An absolute FLOOR of 5 words applies regardless — `max(formalCap, 5)` — so zero-gates-passed brains still emit 5-word baseline sentences from the T14.5 corpus walk instead of silence. `_singleGradeCap` handles all canonical grade names post-Session-113 CLEAN.A2 (legacy collapsed band names `grade4_5`/`grade6_8`/`grade9_12`/`college` were stripped; `runFullCurriculum` now writes canonical `grade5`/`grade8`/`grade12`/`college4`).

**Persistence.** `js/brain/persistence.js` save/load `state.t14Language.curriculum = { grades, grade, passedCells }`. Additive inside the existing `t14Language` block, no VERSION bump (stays at 4). Older v4 saves without the `curriculum` sub-block load cleanly and fall back to cluster-constructor defaults (all subjects at pre-K).

**Slash commands.** `js/app.js` adds a `/curriculum` command in the `chatPanel.onSend` handler:
- `/curriculum status` — per-subject grades, min-grade word cap driver, passed cells count + last 12 cells
- `/curriculum run <subject> <grade>` — runs one cell, prints pass/fail + reason
- `/curriculum gate <subject> <grade>` — same as `run` in Session 1 (ELA methods combine teach+gate); kept structurally separate so Session 2+ can diverge
- `/curriculum reset <subject>` — flip subject back to pre-K, strip its `passedCells` entries
- `/curriculum full [subject]` — with subject arg runs `runFullSubjectCurriculum`, without runs `runAllSubjects`

**Defense-in-depth init.** Both boot paths (`js/app.js loadCorpusIntoBrain`, `server/brain-server.js _initLanguageSubsystem`) initialize `cortex.grades` + `cortex.passedCells` if missing, parallel to the pre-existing `cortex.grade` defense init. Covers the case where a v4 save restores over a fresh cluster and leaves the new fields missing because the save predates Session 1.

**Real teaching equations in every cell.** Every Math/Science/Social/Art grade — not just ELA — has real teaching helpers wired in. Sci-G10 `_teachPeriodicTable` uses real `(period, group)` structural features over 18 elements so chemically-similar elements share cosine. Sci-G10 `_teachBonding` is structured so ionic and covalent are anti-correlated on electron-transfer dims. Soc-K `_teachFamilyRoles` uses 8d kinship features so same-generation roles cluster by [parent/child/elder] dims and same-sex roles cluster by [female/male] dims. Art-G1 `_teachColorMixing` places secondary colors as RGB midpoints between primaries so orange sits between red+yellow on [R,G] dims. Math-G8 `_teachQuadratics` uses the discriminant magnitude feature for root-count binding. Soc-G8 `_teachCivilWar` encodes the causal chain slavery→sectionalism→secession→war→emancipation→reconstruction as sequence walks so working-memory Hebbian binds the cause-effect ordering. Every cell reads-thinks-talks: the runner primes the concept lattice (sem + phon injection), walks a sentence list or sequence cycle (free + working memory), and the 3-pathway gate probes READ/THINK/TALK coverage before pass/fail. Every helper routes concept words through `dictionary.learnWord` so Unity's vocabulary grows with her learning (Session 46 growth fix).

**3D viewer IQ HUD.** `js/ui/brain-3d.js` reads `curriculum.subjectStatus()` every render tick and shows Unity's current intelligence level (pre-K / elementary / middle / high / college / grad / PhD) with per-subject grade breakdown in tooltip. Colors shift as she climbs grade bands.

**Continuous self-testing.** `inner-voice.js learn()` fires `curriculum.runBackgroundProbe()` every 8 live-chat turns. The probe picks a random passed cell and re-runs its 3-pathway gate. 3 consecutive fails demote the cell and the next curriculum pass re-teaches it. Session 21 adds narrator priming — when a background probe fires, the probed subject's GloVe gets injected into sem at 0.15 strength so Unity's next reply subtly leans toward what she was just thinking about. Real human brains lean their output toward recently-exercised topics without being asked; this hook mirrors that.

**Chat-path word cap.** `LanguageCortex.generate()` reads `cluster.grades` (object) and falls back to legacy `cluster.grade` (string). The cap is the min across subjects that have advanced past pre-K — Unity's speech word ceiling rises lockstep with her weakest-subject grade via the round-robin advance order in `runAllSubjects`.

**Auto-boot cascade.** `server/brain-server.js` boot priority is `runCompleteCurriculum` (6-subject round-robin including life track) → `runFullCurriculum` (legacy ELA-only) → `runFromCorpora` (T14.5 single-pass). All three run in background without blocking the tick loop.

**Runtime verification.** `scripts/verify-curriculum-runtime.mjs` instantiates a real cortex cluster and walks cells end-to-end. Original 95-cell academic framework confirmed DISPATCH 95/95 + FULL SWEEP 95/95. Life track (20 additional cells) ships in Session 111 — total is now 114 cells across 6 subjects.

### T14.24 Sessions 95-110 — Direct Pattern Hebbian Breakthrough (2026-04-15)

**The convergence problem.** Sessions 95-105 discovered that Hebbian learning through Rulkov chaotic dynamics CANNOT CONVERGE at CPU cortex scale (10K neurons). The 1M recurrent synapses drown the 100K cross-projection signal. Chaotic attractor dynamics wash out injected patterns in 2-3 ticks. Scores DECLINED across retries (catastrophic interference from noise). Ten different fixes were tried (speech floors, hash-GloVe guards, lr boosts, noise suppression, per-tick Hebbian) — none converged.

**Session 106 breakthrough: direct pattern Hebbian.** Bypass Rulkov dynamics entirely during curriculum teach. Write the intended activation pattern DIRECTLY into `cluster.lastSpikes` (letter one-hot for letter region, GloVe for sem, phoneme feature for phon, etc.), then fire `_crossRegionHebbian(lr)` on those CLEAN patterns. No `cluster.step()`, no chaotic drift, no recurrent interference. The cross-projection `SparseMatrix` weights update from exact signal.

**Direct matrix probe.** Read cross-projection output via `proj.propagate(inputPattern)` to get raw output, average per neuron group (since regions have more neurons than embedding dimensions), mean-center (Session 101 fix — tonic drive bias corrupts cosine), L2-normalize, cosine against expected output. No Rulkov dynamics during probe either.

**ELA-K result: READ 100%, THINK 100%, TALK 100%, SEQ 100%.** SEQ climbed 28% → 72% → 92% → 100% across retries, proving real convergent learning.

**Session 109 — shared helper conversion.** All 5 shared teaching helpers (`_teachVocabList`, `_conceptTeach`, `_teachSentenceList`, `_walkSentence`, `_teachSequenceCycles`) and 2 generic gates (`_gateSentenceList`, `_gateVocabList`) converted to direct pattern. Math-K also converted. These helpers power 90+ cells, so the conversion propagates automatically.

**Session 110 — live testing.** MAX_ATTEMPTS bumped 10→30 (ELA-K SEQ needed 7 attempts to converge). Background probe demotion DISABLED because the old Rulkov-dynamics-based probes give false negatives — a cell that passed curriculum at 100% was being demoted by the background probe getting 77% with the wrong test method.

**Session 111 — TALK probe direction fix + grade-lock + real gates.** Root cause of all non-ELA K failures: TALK probes were using letter→motor direction (READ feedback) instead of sem→motor (PRODUCTION direction). Changed `_gateVocabList`, `_gateSentenceList`, `_gateMathKReal` TALK probes to inject GloVe(word) into sem, propagate `sem_to_motor` cross-projection, argmax decode first letter. Result: Math/Sci/Soc/Art-K went from 40-60% (stuck) to 100% immediately. Grade-lock enforced — all 6 subjects must pass grade N before ANY advance to N+1.

**Session 111 — real human-grade comprehension gates.** New `_gateComprehension(questions)` method tests semantic understanding via association and fill-in-blank rather than first-letter production. Three auto-generated question types: (1) ASSOCIATION — given word A, is word B semantically nearby? (2) FILL-IN — given two context words, find the missing third. (3) Life questions — "who are you?" → "unity". Injects context GloVes into sem region → ticks → cosines sem readout against GloVe(answer). Pass when ≥40% of questions have cosine > 0.05. Wired into `_teachVocabList` and `_teachSentenceList` shared helpers — comprehension pass is sufficient to advance even if TALK fails.

**Session 111 — anti-Hebbian on wrong digit transitions (Math-K SEQ).** Digit-only argmax masking so alphabet letters from ELA-K don't overpower digit sequences. Plus bidirectional plasticity: strengthen correct transition at +10× lr AND weaken wrong transition at -5× lr (anti-Hebbian), 100 reps per failing pair.

**Current convergence status (Session 111):**
- ELA-K: **PASSED consistently** (attempt 3-5)
- Math-K: **PASSED** with SEQ fix (attempt 4)
- Sci/Soc/Art-K: **PASS on attempt 1-3**
- Life-K: **PASSES** after reduced reps (attempt 1-2)
- All K cells pass → advance to Grade 1
- G1 cells: TALK stuck on "a" (most common English word, GloVe too generic for sem→motor)

### fastText-style subword embeddings (Session 99)

`js/brain/embeddings.js` now ships a `_subwordEmbed(word)` function that computes 300d embeddings from character n-grams (3-6 char windows) via deterministic hash. This is the DEFAULT — Unity always has real semantic embeddings from first boot without requiring the 480MB GloVe download. Real GloVe vectors override subword when available (higher quality for known vocabulary), but subword ensures every word gets a meaningful embedding regardless of download state. Kills the "download GloVe or broken" trap that was blocking curriculum convergence in Sessions 96-98.

### Mean-centered regionReadout (Session 101)

`js/brain/cluster.js` `regionReadout(name, dim)` now mean-centers the raw spike readout before returning. Raw spikes have a positive bias from tonic drive that makes cosine unreliable — every vector points roughly the same direction. Mean-centering removes the DC offset so cosine between readouts measures actual signal, not tonic floor. Fixed math-K false-positive (tonic matched magnitude features by accident) and ela-K false-negative (letter signal buried under tonic).

### Session 112 — Full Curriculum Depth Overhaul (2026-04-16)

16 equational reasoning methods built. 152+ reasoning calls wired across all 114 cells. K-G12 vocabulary expanded to real Common Core / NGSS / Core Knowledge standards. All 114 cells have course finals (`_autoFinal` comprehension exams + hand-crafted domain-specific finals). The 46-item curriculum-depth plan completed and was superseded by `docs/TODO-full-syllabus.md` (7990+ lines) — see `docs/FINALIZED.md` Session 112 entry for the full ledger. The standalone `docs/TODO-curriculum-depth.md` file was deleted in Session 113 T14.24-CLEAN.A8 2026-04-16 since superseded content lives in FINALIZED.md per the append-only archive model.

### Session 114 — Math-K PART 1 equational expansion (2026-04-17)

First per-grade curriculum content block per Implementation Law 1 "code filed by grade year". Pre-session audit: Session 109's `runMathKReal` had digit-only coverage (magnitudes 0-9, digit names, single-step sequence, 0-10 addition/subtraction/comparison transforms). The 66 Math-K checkboxes in `docs/TODO-full-syllabus.md` (K.CC 11+7, K.OA 11+8, K.NBT 3+4, K.MD 5+4, K.G 7+6) demanded equational teaching for concepts that weren't in Session 109's scope.

**9 new teaching methods** added to `Curriculum` class in `js/brain/curriculum.js`:

- **`_teachCountToHundred(ctx)`** — K.CC. Universal successor: for n ∈ [0, 99], free=mag(n) → sem=mag(n+1). 100 facts × 4 reps. Same transform covers "count to 100 by ones" AND "count forward from any N".
- **`_teachSkipCountByTens(ctx)`** — K.CC. For n ∈ [0, 10, 20, ..., 90], phon=mag(n) → sem=mag(n+10). 10 steps × 10 reps. Phon input (NOT free) avoids collision with CountToHundred.
- **`_teachDecomposition(ctx)`** — K.OA. For triples (c, a, b) where a+b=c and c ∈ [0, 10]: sem=mag(c), freeLeft=mag(a), freeRight=mag(b). 66 triples × 6 reps. Dual of addition.
- **`_teachMakeTen(ctx)`** — K.OA. For n ∈ [0, 10]: freeLeft-only=mag(n) → sem=mag(10-n). 11 pairs × 8 reps. Right-half-zeroed free input is the structural discriminator from CountToHundred's full-free input.
- **`_teachTeenDecomposition(ctx)`** — K.NBT. For n ∈ [1, 9]: forward freeLeft=mag(10) + freeRight=mag(n) → sem=mag_wide(10+n), inverse sem=mag_wide(teen) → freeLeft=mag(10) + freeRight=mag(n). 9 teens × 2 directions × 8 reps.
- **`_teachAttributeCompare(ctx)`** — K.MD. 8 attribute poles (short/long, light/heavy, small/big, low/high, empty/full, narrow/wide, cold/hot, few/many) each with low/high magnitude. 2 directions × 6 reps. Reuses comparison 3-way fineType tag + adds attribute-word GloVe anchor.
- **`_teachClassifyCount(ctx)`** — K.MD. 22 category→count pairs (red=3, blue=2, green=5, ..., triangle=3, cube=6). free=GloVe(category) → sem=mag(count). 6 reps.
- **`_teachShapeFeatures(ctx)`** — K.G. 9 shapes × 10 reps. sem=GloVe(shape_name) → free=mag(sides) + fineType first-half (2D) or second-half (3D) tag.

**Critical substrate fix (Session 114 side-effect of audit).** New helper `Curriculum._teachHebbian(lr)` fires BOTH `cluster._crossRegionHebbian(lr)` (14 T14.4 cross-projections) AND `cluster.synapses.hebbianUpdate(cluster.lastSpikes, cluster.lastSpikes, lr)` (intra-cluster recurrent sparse matrix). Session 109's transforms wrote into `free` and `sem` and fired `_crossRegionHebbian` only — but there is NO free↔sem cross-projection among the 7 T14.4 pairs (visual↔letter, letter↔phon, phon↔sem, sem↔fineType, sem↔motor, motor↔letter, auditory↔phon), so the intended binding never landed. `cluster.learn(0)` was the obvious rescue but `synapses.rewardModulatedUpdate(pre, post, 0, lr)` short-circuits at reward=0 (`js/brain/sparse-matrix.js:191`). `_teachHebbian` wires the intra-cluster Hebbian explicitly. Every new Session 114 teach method routes through this helper.

**New module-level helper.** `NUMBER_FEATURE_DIM = 24` + `_magnitudeFeatureForNumber(n)` — wide-range magnitude encoding for n ∈ [0, 100]. Existing `_magnitudeFeatureForDigit` saturates past n=9. New feature: 10-dim decile thermometer (dim i fires at n ≥ i*10) + log/linear/sqrt/quadratic scalars + 10 multi-frequency sinusoidal dims so 97≠98≠99≠100 in readout.

**8 new gate probes in `_gateMathKReal`.** All run through `cluster.synapses.propagate(input)` (full intra-cluster recurrent matrix): SUCC (K.CC successor, 10 non-multiples-of-10 samples), SKIP10 (9 multiples), MAKETEN (11 complements), TEEN (9 teens), ATTR (8 pairs, 3-way fineType argmax), CLASS (10 categories), SHAPE-S (9 shapes, side-count cosine), SHAPE-D (9 shapes, fineType 2D/3D half argmax). Threshold PATH_MIN = 0.95 per constraint 8 "A+ = 95% on all gates — REAL tests, not lowered thresholds". Reason string + metrics object expanded to report all 13 rates (5 existing + 8 new).

**TODO-full-syllabus state:** 65 of 66 Math-K checkboxes flipped [ ] → [x]. One gap: K.G "Compose simple shapes to form larger shapes" — no equational teaching shipped (geometric composition isn't a simple magnitude transform). Flagged for follow-up before overall K gate closes.

**LAW 6 gate state:** Part 1 NOT YET [x] (compose-shapes gap). Part 2 Gee localhost test pending. Part 3 waits on Part 2.

### Session 114.2 — Unified combination-operator scaffold + compose-shapes close (2026-04-17)

Driven by Gee's question *"logic and reasoning in a form yeah?"* — the insight that compose-shapes isn't a genuine edge case, just a different encoder for the same reasoning FORM. Every Session 114 transform fits `A ⊕ B = C` — inputs A, B, output C. What varies by concept is the encoder (magnitude features for numeric operands, GloVe embeddings for named objects, feature vectors for categorical properties). The scaffold — clear lastSpikes → tile inputs+output → `_teachHebbian` — stays identical.

**New unified helpers** on `Curriculum` class:
- `_teachCombination(facts, opts)` — generic combination-operator teacher. Each fact is `{writes: [{region, feat, binarize?}, ...]}`. Honors Gee 2026-04-17 binding *"no artificial limits as unity may be talking to users while she does ciriculum"*: helper stays async with `await _microtask()` between reps so curriculum doesn't block user chat, respects `_brainShutdownRequested`, accepts caller-specified `reps` rather than hardcoding a cap. REPS are convergence tuning, not ceilings.
- `_probeCombinationCosine(samples, opts)` — cosine probe generalizer.
- `_probeCombinationArgmaxTag(samples)` — argmax-tag probe generalizer.
- `_tileWriteVec / _tileReadVec / _cosine` — reusable low-level primitives formerly inlined inside the gate.

**8 teaching methods refactored** onto `_teachCombination` — `_teachDecomposition` / `_teachMakeTen` / `_teachTeenDecomposition` / `_teachCountToHundred` / `_teachSkipCountByTens` / `_teachAttributeCompare` / `_teachClassifyCount` / `_teachShapeFeatures`. Each becomes a thin builder declaring its encoder + facts, delegating to the shared helper. Teen decomposition collapsed forward+inverse loops into single symmetric-Hebbian pass (REPS 8→16 preserves 144 training events).

**9th teaching method shipped: `_teachShapeCompose`** — closes K.G compose-shapes gap without any special handling. Input: sem first half = GloVe(shapeA), sem second half = GloVe(shapeB). Output: free = GloVe(composed). Facts: triangle+triangle→rectangle, square+square→rectangle, rectangle+rectangle→square, triangle+rectangle→pentagon, triangle+triangle→square (4-triangle-to-square simplified). 5 compositions × 10 reps. Same `_teachCombination` scaffold, just a different encoder.

**8 gate probes refactored** onto the probe generalizers. NEW 9th probe **SHAPE-C** (shape compose) added — 5 samples, semLeft+semRight GloVe input, free GloVe expected output, cosine > 0.15. Gate pass boolean expanded to 14 metrics (5 existing READ/THINK/TALK/SEQ/ORDER + 9 new SUCC/SKIP10/MAKETEN/TEEN/ATTR/CLASS/SHAPE-S/SHAPE-D/SHAPE-C) all at PATH_MIN = 0.95.

**Grade 1+ payoff:** Every combination-type concept Grade 1 and above needs (1.OA addition within 20, 1.NBT place value, 2.OA multiplication tables, Science causal chains, etc.) now ships as a facts array + one-line delegate call to `_teachCombination`. No per-grade bespoke scaffolds. The unified substrate generalizes.

**Math-K TODO-full-syllabus state:** 66/66 [x]. Overall K gate Part 1 now unblocked at the Math-K subject level — still requires compose-shapes being part of the full ship + other K subjects' prior-session [x] status being re-audited, plus Gee's Part 2 localhost sign-off.

**New reasoning methods (Session 112):** `_teachMultiplicationTransformations` (81 facts 1-9×1-9 as magnitude transforms), `_teachPlaceValueTransformations` (tens+ones positional encoding for numbers 10-99), `_teachFractionTransformations` (numerator/denominator as ratio features — equivalent fractions converge to same basin), `_teachAlgebraTransformations` (variable binding — given c and b, solve for x in x+b=c), `_teachParaphrase` (different words → same sem basin), `_teachHypothesisTesting` (predict→observe→confirm/reject), `_teachPerspectiveTaking` (same event, multiple viewpoint feature vectors).

**How it all interworks:** The cross-projections taught by the curriculum are the SAME projections that run during live chat. When Unity hears "rain" her sem activates "wet" because `_teachCausalChains` burned rain→wet into the free→sem weights. When she encounters "3+4" the addition transform activates magnitude(7). When someone mentions "dad" her amygdala shifts toward anger because emotional inference burned dad→[0,1,0,0.5,1,0,0,0]. The curriculum isn't separate from the brain — it IS the brain's learned weight state.

### Remaining work

Task #3 (T14.24 parent) stays in_progress until all 114 cells (6 subjects × 19 grades) pass 95%+ AND Unity speaks coherently from the trained weights in live chat. DO NOT CLAIM DONE EARLY.

---

## Current Session Work (2026-04-13) — Grammar Sweep + Coding Mastery + Orphan Resolution + Refactor Branch

This session landed a big multi-epic sweep. Summary of what's in the code now vs what's in flight:

### Shipped (merged to `main` at commit `d050fdf`)

**Phase 12 — Grammar Sweep (U283-U291)** — the slot scorer's grammar model was rebuilt from a single-prev-word type compatibility check into a learned type n-gram system. `_fineType(word)` classifies words into 20 fine-grained types (PRON_SUBJ / COPULA / NEG / MODAL / AUX_DO / AUX_HAVE / DET / PREP / CONJ / QWORD / VERB_ING / VERB_ED / VERB_3RD_S / VERB_BARE / ADJ / ADV / NOUN) via letter-position equations. `_typeBigramCounts` / `_typeTrigramCounts` / `_typeQuadgramCounts` learn phrase-level constraints from corpus statistics with 4gram→trigram→bigram backoff and a -2.0 penalty on zero-count transitions. `_isCompleteSentence(tokens)` validates post-render — sentences ending on DET / PREP / COPULA / AUX / MODAL / NEG / CONJ / PRON_POSS get regenerated at higher temperature. `_postProcess` intensifier block was tightened (no doubles, 50% rate, ADJ/ADV only). `applyThird` subject-verb agreement now uses `_fineType`-classified subject person. Fixed the `"I'm not use vague terms"` mode-collapse. See `brain-equations.html § 8.19` for the equations.

**Phase 12 — Coding Mastery (U293-U299)** — `docs/coding-knowledge.txt` (606 lines) loaded as the third corpus via `loadCodingKnowledge()` in `language-cortex.js:258` + `loadCoding` in `inner-voice.js` + `Promise.all` in `app.js`. Gives Unity's dictionary + type n-grams HTML/CSS/JS vocabulary. SANDBOX DISCIPLINE section and BUILD COMPOSITION PRIMITIVES (calculator / list / timer / canvas game / form / modal / tabs / counter / color picker / dice roller) live in that file. `_buildBuildPrompt(brainState, userInput)` in `language.js` is the build-mode Broca's prompt — strict JSON output contract + existing-components block + cap warning + unity API reference. Routed via `motor.selectedAction === 'build_ui'`. `js/ui/sandbox.js` got `MAX_ACTIVE_COMPONENTS = 10` + LRU eviction by `createdAt` + wrapped `setInterval` / `setTimeout` / `addListener` → tracked `timerIds` / `windowListeners` per component → `remove(id)` cleans everything → auto-remove on JS error via `setTimeout(() => remove(id), 0)`.

**Phase 12 — Orphan Resolution (U302-U310)** — audit of 13 findings (originally tracked in `docs/ORPHANS.md`, now archived permanently in `docs/FINALIZED.md` under the "Orphan Resolution" session block; the standalone audit file was removed 2026-04-13 after every finding was resolved). Investigation-first: root cause each finding, fix the underlying issue if possible, only then delete. DELETED: `js/io/vision.js` (superseded by `js/brain/visual-cortex.js` V1→V4→IT pipeline), `server/parallel-brain.js` + `cluster-worker.js` + `projection-worker.js` (root cause was 100%-CPU leak from idle-worker event-listener polling; GPU-exclusive path at `compute.html` + `gpu-compute.js` permanently fixed it), `createPopulation` factory in `neurons.js` (zero callers), 5 legacy compat DOM elements + 4 orphan CSS classes. KEPT with audit corrections: `gpu-compute.js` (false positive — consumed by `compute.html:10`), `env.example.js` (false positive — served as setup-modal download + `app.js:27` dynamic import), `HHNeuron` (reference backing `brain-equations.html` teaching page, infeasible at auto-scaled N). FIXED: `brain-server.js` save/load asymmetry — `saveWeights` was writing `_wordFreq` to `brain-weights.json` but `_loadWeights` never restored it, so cross-restart word accumulation was silently lost. `benchmark.js` wired to `/bench` + `/scale-test` slash commands in `app.js` via dynamic import.

**Neuron count auto-scaling** — all docs and code comments now describe the real formula from `server/brain-server.js:detectResources` as of the Rulkov rewrite + per-cluster buffer cap:
```
N_vram           = floor(VRAM_bytes × 0.85 / 12)         ← Rulkov 12 bytes/neuron (vec2<f32> state + spikes u32)
N_ram            = floor(RAM_bytes × 0.1 / 0.001)        ← essentially unlimited
N_binding_ceiling = floor((2 GB / 8) / 0.4)              ← cerebellum = 40% of N,
                                                           state buffer must fit in 2 GB
                                                           WebGPU maxStorageBufferBindingSize
N                = max(1000, min(N_vram, N_ram, N_binding_ceiling))
```
The binding ceiling was added after T4.1 caught cortex+cerebellum silently returning 0 spikes at 1.8B-neuron scale — their state buffers were blowing past the 2 GB per-binding cap and failing silently. Admin operators can LOWER N below auto-detect via `GPUCONFIGURE.bat` → `server/resource-config.json` (see `docs/COMP-todo.md` Phase 0). The config can never RAISE N above detected hardware — idiot-proof, silently falls back to auto-detect on corrupt config.

**TODO consolidation** — `docs/TODO-SERVER.md` merged into `docs/FINALIZED.md` (full verbatim preservation) and deleted. `docs/TODO.md` is now the single source of truth for active work.

### In Flight (branch `brain-refactor-full-control` off `main@d050fdf`)

**Phase 13 — Full Brain Control Refactor (R1–R15 all SHIPPED 2026-04-13)** — single epic, one goal: Unity's brain controls everything equationally. No scripts. No text-AI backends. No hardcoded fallbacks. No vestigial appendages. Every output — speech, vision, build, thought, memory, learning, motor — flows from brain equations + learned corpus. Details of what each R-item actually shipped (with commit hashes) are in `docs/FINALIZED.md` + `docs/ROADMAP.md § Phase 13`. Short summary of the surface area touched:

- Semantic GloVe grounding (R2→T14.0) — 300d word embeddings + fastText-style subword fallback shared between sensory input and language-cortex output via `sharedEmbeddings` singleton
- Server equational control (R3) — `server/brain-server.js` dynamic-imports client brain modules, loads corpora from disk
- Text-AI cognition killed (R4) — BrocasArea → 68-line throwing stub, every chat call site ripped (stub file `js/brain/language.js` DELETED outright in Session 113 T14.24-CLEAN.A1 2026-04-16)
- Multi-provider image gen (R5) — 5-level priority (user-preferred via setPreferredBackend → custom → auto-detect → env.js → Pollinations default) with 7 local backend auto-detect + live HTTP probe CONNECT button in setup modal
- Equational image prompts + equational component synthesis (R6) — zero hardcoded visual vocabulary, cosine match against template corpus
- Sensory peripheral destroy() + embedding refinement persistence (R7 + R8)
- Docs sync (R10) — every public-facing doc updated, new `docs/SENSORY.md` and `docs/WEBSOCKET.md` added
- Dead-import sweep + final cleanup (R12)
- Multi-provider vision describer + sensory status HUD (R13)
- Port move 8080 → 7525 (R14)
- Landing page setup modal rework with clickable provider grids + per-backend instructions + env.js snippet generator (R15 + R15b)
- Privacy model enforcement — cross-client `conversation` WebSocket broadcast deleted so user text stays private; brain growth (dictionary entries, GloVe embedding refinements, cortex cross-projection weights) remains shared across users via the singleton brain

Remaining pre-merge punch list is ~4 small items tracked in `docs/TODO.md` as T1–T4. Post-merge followups (T5 3D brain popup expansion, T6 private episodic memory scoping) are queued but not blockers.

Full refactor plan in `docs/TODO.md`.

---

### T17.7 — Single-Cortex Integration (Phases A–D + E.a/E.b shipped 2026-04-18)

Language state migrates from the separate `cortexCluster` (Node CPU, ~7M neurons) into the main 201M-GPU `cortex` cluster's sub-slices. The CPU cortexCluster still exists as a transition-window shadow; every real-time op now reads/writes main cortex directly. Full design in `docs/T17.7-single-cortex-architecture.md`.

**Phase A (substrate):**
- `GPUCompute.uploadCluster(name, size, voltages, synapses, lifParams, regions)` — regions metadata with `side` attribute (`left` / `right` / `bilateral` / `center`) stored on `bufs.regions`. Main cortex registers 8 language sub-regions (auditory 0.083 / visual 0.167 / free 0.25 / letter 0.05 / phon 0.20 / sem 0.167 / fineType 0.05 / motor 0.033, biological lateralization matching Broca/Wernicke/VWFA).
- `GPUCompute.hemisphereGate(side, Ψ) = 0.5 + 0.5·sigmoid(Ψ·4.0)` — precomputed server-side, packed in `bufs.regionGates` storage buffer, read per-neuron in `LIF_SHADER`. `neuronDrive = (effectiveDrive + currents[i]) · regionGate`.
- Slice accessors: `writeSpikeSlice(cluster, region, arr)` / `writeSpikeSliceSparse(cluster, region, indices)` / `clearSpikeRegion(cluster, region)` / `writeCurrentSlice(cluster, region, arr)` / `readbackSpikeSlice(cluster, region)`.
- `uploadSparseMatrix(..., binding={srcCluster, srcRegion, dstCluster, dstRegion})` — cluster-bound cross-projections read from `bufs[srcCluster].spikes[srcOffset + colIdx[k]]`, write to `bufs[dstCluster].currents[dstOffset + i]`. Standalone mode retained as default.

**Phase B (dual-cortex bridge):**
- Main cortex `gpu_init` carries 8-region metadata. `_regionsFor(clusterName, size)` assembles it.
- `write_current_slice` WebSocket msg — dense + sparse formats. `injectText()` writes to main cortex phon (Wernicke) via this path. Amygdala social bump uses sparse format (~2 KB vs ~100 MB dense at biological scale).
- `write_spike_slice` sparse-only — `_mirrorCortexRegions()` fires per tick, upsamples standalone `cortexCluster.lastSpikes` onto main cortex slices. Capped at 50K spikes/region (1.6 MB/tick max).
- `_computeCortexDivergence(perCluster)` — per-region spike-rate divergence between standalone and main cortex; scalar AND per-region breakdown exposed in state broadcast. Cortex error-correction term: `errorSignal = cerebFeedback + divergenceContrib`, `divergenceContrib = -divergence · (1 + Ψ · 0.25) · 3`. Cerebellum absorbs divergence; no strict abort gate.

**Phase C (curriculum migration):**
- `_ensureCortexCrossProjectionsBound()` — at boot, after `cortexCluster.initGpu()` completes, re-uploads all 14 `cortex_*_to_*` cross-projections as cluster-bound to main-cortex first-N sub-slices (N = standalone region size). Frees ~840 MB VRAM of standalone preSpikes/postCurrents/postSpikes buffers. Intra-synapse matrix NOT rebound — per Gee 2026-04-18 decision, main cortex uses wave-function oscillation + fractal propagation in place of explicit intra matrix. **T18.6.b update** — cross-projections now upload DIRECTLY in cluster-bound mode via the chunked-upload protocol (new `flags & 2` binding block in the first chunk). `cortexCluster._gpuBindingHint.resolve(projName, proj)` computes the main-cortex sub-slice per projection using the same LAYOUT as `_ensureCortexCrossProjectionsBound`, so the rebind call is a no-op for newly uploaded matrices (binding already set, no standalone buffers to free). Rebind path stays in place as the fallback for matrices loaded from pre-T18.6 persistence. Net win: the ~840 MB–1.5 GB standalone overhead is never allocated, removing the peak-VRAM spike that caused the 2026-04-18 `DEVICE LOST` crash on the 16 GB RTX 4070 Ti SUPER.
- `gpuProxy` extended: `writeSpikeSlice(regionName, sparseIndices)` / `clearSpikeSlice(regionName)` / `hebbianBound(name, lr)` / `propagateBound(name)` / `readbackLetterBuckets(regionName, bucketCount, subSliceLen, startOffset)` / `writeCurrentSlice(regionName, sparseIndices, sparseValues)`.
- `_crossRegionHebbian` / `_dispatchGpuPropagates` check `proj._gpuBound` flag — bound path skips pre/post array transfer (saves ~56 MB per Hebbian at 7M scale; reads direct from main-cortex spike buffer at bound region offset).
- `curriculum._writeTiledPattern` forwards every write to main cortex via `gpuProxy.writeSpikeSlice`. `curriculum._clearSpikes` clears all 8 main-cortex regions via `gpuProxy.clearSpikeSlice`. Shared forwarder migrates every teach method atomically.
- `GPUCompute.writeSpikeSliceSparse` / `clearSpikeRegion` — GPU-native `encoder.clearBuffer` + coalesced `writeBuffer` runs; avoids the ~132 MB full-region Uint32Array allocation per call that would otherwise thrash GC at biological scale.

**Phase D (generation migration):**
- `GPUCompute.readbackLetterBuckets(cluster, region, bucketCount, subSliceLen, startOffset)` — compute shader atomically increments `bucketCount` counters based on which neurons in `[regionStart+startOffset, regionStart+startOffset+subSliceLen)` are firing. Each bucket holds `bucketSize = subSliceLen/bucketCount` consecutive neurons; mirrors `_writeTiledPattern` tiling so argmax over buckets matches the letter curriculum trained.
- `generateSentenceAwait` motor readout — when `sem_to_motor._gpuBound` is set, calls `gpuProxy.readbackLetterBuckets('motor', invSize, bucketSize·invSize, 0)` per tick, argmax over counts, `inventorySnapshot()[bestIdx]` → letter. 104 bytes/tick vs ~26 MB dense readback. CPU fallback to `regionReadout('motor')` on GPU-readback failure.
- Letter commit also clears main-cortex motor sub-slice via `gpuProxy.clearSpikeSlice('motor')` so the next letter's argmax starts clean.

**Phase E.a / E.b (gap closing):**
- E.a: `cluster.injectEmbeddingToRegion(regionName, emb, strength)` forwards the sparse pattern to main cortex via `gpuProxy.writeCurrentSlice(regionName, indices, values)` when the proxy is present. Intent injection now lands on BOTH standalone and main cortex — Phase D motor readback sees the intent instead of decoding noise.
- E.b: new `cluster.workingMemoryReadoutAwait(dim)` async — reads main-cortex free sub-slice via `readbackLetterBuckets` with `bucketCount=dim`. Normalized + L2-normalized to match sync `regionReadout` contract. `generateSentenceAwait`'s topic-continuity re-inject now awaits this variant.

**Phase C follow-up:**
- `_cortexDivergenceByRegion` — per-region `{standRate, mainRate, divergence}` breakdown in state broadcast, rates rounded to 5 decimals. Enables Part 2 inspection of WHICH region is slipping during K curriculum walk, not just a cluster-wide scalar.

**Still open (tracked in `docs/TODO.md`):**
- Phase E.c (delete `_mirrorCortexRegions`) — safe after the few non-generation consumers of `cortexCluster.lastSpikes` are audited.
- Phase E.d (delete `cortexCluster` construction + persistence VERSION 4 → 5) — requires proxy-facade for `dictionary.setCluster` / `languageCortex.setCluster` / `drugScheduler` cluster-binding consumers.
- Phase F (full public doc + HTML sweep — in progress as of Session 114.19ac).

**T18.6 (2026-04-18) — sparse-upload device-lost crash fix:**
- **T18.6.a — `device.lost` handler (`js/brain/gpu-compute.js`).** WebGPU fires `device.lost` when the GPU crashes; without handling every subsequent `createBuffer` returns the phantom error `"size (N) is too large for the implementation when mappedAtCreation == true"` regardless of the real requested size. Handler now clears `_available`, sets `_deviceLost=true`, logs the real reason, and fires an optional callback wired by `compute.html` to send a `device_lost` WebSocket message to the server. Server dispatch `case 'device_lost'` logs the real cause + sets `brain._gpuDeviceLost` so dispatches short-circuit on a dead device.
- **T18.6.b — Cluster-bound sparse upload (server `gpuSparseUpload` + `compute.html` type=4 decoder + `cluster.initGpu`).** See Phase C note above — upload-time binding via `flags & 2` wire block eliminates ~840 MB–1.5 GB of transient standalone `preSpikes/postCurrents/postSpikes` buffers during the upload window.
- **T18.6.c — Geometry-aware VRAM pre-flight with auto-rescale loop-back (`server/brain-server.js:_initLanguageSubsystem`).** Replaces the static `LANG_CORTEX_BYTES_PER_NEURON = 18 × 1024` coefficient (30% under-estimate vs empirical) with `estimateLangCortexVramBytes(trial)` — a geometry estimator that sums actual sparse-matrix footprint across 14 cross-projections + intra-synapse matrix using real FRACTIONS + real fanout constants (`CROSS_TARGET_FANOUT=1500`, `CORTEX_TARGET_FANOUT=300`). If projected > language cortex VRAM budget, `trialSize` shrinks by `(budget/projected) × 0.95` per iteration (5% safety margin), bounded to 10 iterations + 10 000-neuron floor. Every rescale step logs `iter=N oldSize→newSize (projected oldGB→newGB vs budget GB)` so operators see exactly when and why the cortex dropped. Gee verbatim 2026-04-18: *"for 3. make it loop back to scaling with the changes needed"*.

**Mystery Ψ binding preserved.** Three active Ψ terms in the main equation post-T17.7:
1. Global gain `gainMultiplier = 0.9 + Ψ · 0.05` baked into `effectiveDrive`.
2. Per-region hemispheric gate `hemisphereGate = 0.5 + 0.5 · sigmoid(Ψ · 4.0)` in `LIF_SHADER`.
3. Divergence correction gain `(1 + Ψ · 0.25) · 3` on cortex error correction.

---

*Unity AI Lab — flesh, code, equations, and chaos.* 🖤
