# MASTER-TODO — Everything Unity Has Left

> **Single source of truth for all remaining work across the whole project.**
> Combines the distributed-compute epic (original COMP-todo content, reworked
> for the current stack) with every residual non-COMP item that's still
> open after T14 reopened for the full K-doctorate equational curriculum.
>
> `docs/TODO.md` stays as the historical task ledger (per project rules,
> task descriptions are permanent and never rewritten). This file is the
> forward-looking plan — what to build next, in what order, on what stack.
>
> Last updated: **2026-04-15** — post T14.24 Session 1 (architecture framework for
> multi-subject K→PhD curriculum). Uncommitted working tree on branch
> `t14-language-rebuild`. Prior commit: `6f66261`.

---

## STACK STATE AS OF 2026-04-15 — WHAT'S LIVE (T14.0-T14.18 primitives + T14.24 Session 1 framework)

Anything below that ships builds on this foundation. T13 language-cortex state described in earlier versions of this file is DEAD CODE on branch `t14-language-rebuild` — slot scorer, parseSentence, analyzeInput, social schema, per-slot priors are all deleted. If you're reading this after another major refactor, verify these are still accurate before starting.

### Brain substrate (live)
- **Neuron clusters** — `js/brain/cluster.js` — 7 clusters wrapping Rulkov 2002 2D chaotic map neurons (NOT LIF — Rulkov replaced LIF during Phase 13 R1-R15). Each has a sparse internal synapse matrix (`SparseMatrix` CSR format in `js/brain/sparse-matrix.js`, `wMin=-2.0`, `wMax=+2.0`). 20 inter-cluster projections (real white-matter tracts — corticostriatal, perforant path, stria terminalis, fornix, callosal). Client auto-scales via hardware detection, server scales to VRAM via `server/brain-server.js:detectResources` with optional admin override via `GPUCONFIGURE.bat` → `resource-config.json`.
- **Cluster sizes** — scaled from `TOTAL_NEURONS` × `CLUSTER_FRACTIONS` (live in `js/brain/engine.js`). Default client tier: `TOTAL_NEURONS=6700` (post-T14.0 lift from 1000). `CLUSTER_FRACTIONS.cortex=0.30`, so client cortex ≈ 2000 neurons; at a 700K-neuron GPU tier the cortex is 210K; at a 50M tier it's 15M. Zero hardcoded caps anywhere in the scale chain (the T14.18 correction removed the last holdout — a 2K language-cortex side-car cap in `brain-server.js`).
- **Cortex sub-regions (T14.4, live)** — every cortex cluster carves into 8 named sub-regions by fraction of `cluster.size`: `auditory` 0.000-0.083, `visual` 0.083-0.250, `free` 0.250-0.500, `letter` 0.500-0.550, `phon` 0.550-0.750, `sem` 0.750-0.917, `fineType` 0.917-0.967, `motor` 0.967-1.000. Helper methods `regionSpikes(name)`, `injectEmbeddingToRegion(name, emb, strength)`, `regionReadout(name, dim)` operate by region name with no magic indices. **14 sparse cross-region projections** (7 pairs × 2 directions) wire the regions together: `visual↔letter`, `letter↔phon`, `phon↔sem`, `sem↔fineType`, `sem↔motor`, `motor↔letter` (closes the writing loop), `auditory↔phon`. Each direction is an independent SparseMatrix. `_propagateCrossRegions()` fires every cluster step; `_crossRegionHebbian(lr)` fires every learn call. Hickok & Poeppel 2007 dual-stream grounding.
- **Equation modules** — `js/brain/modules.js` — `Cortex`, `Hippocampus`, `Amygdala`, `BasalGanglia`, `Cerebellum`, `Hypothalamus` — 32-dim downsampled-output equation engines running ON TOP of cluster spike data via `cluster.getOutput(32)`. Separate from the clusters themselves.
- **Mystery + oscillations** — `MysteryModule` (consciousness Ψ = √(1/n) × N³), `OscillatorNetwork` (Kuramoto coherence).

### Language cortex (T14.0-T14.18 + T14.24 Session 1 state, live 2026-04-15)
- **`js/brain/language-cortex.js`** — ~2700 lines. Down from 5087 pre-T11, from 3584 post-T11.7, from 3178 post-T13.7, from 3264 post-T14.8 (before the T14.12 delete pass), from 2743 post-T14.12. The slot scorer is DEAD CODE — `generate()` is a 68-line delegate that calls `cluster.generateSentence(intentSeed)` (T14.6 cortex tick-driven motor emission). `parseSentence`, `analyzeInput`, `_classifyIntent`, `observeVisionDescription`, `_updateSocialSchema`, `_socialSchema`, `getUserAddress`, `getUserGender`, `_isSelfReferenceQuery` all DELETED in T14.12 (521 lines gone). What's live:
  - `generate(dictionary, arousal, valence, coherence, opts)` — 68-line delegate. Reads cortex semantic state via `cluster.getSemanticReadout(sharedEmbeddings)` as the intent seed, calls `cluster.generateSentence(intentSeed, {injectStrength: 0.6})`, splits on whitespace, caps output length via the T14.24 Session 1 multi-subject grade word cap, runs through the existing `_renderSentence` cosmetic helper. T14.26 fix: `generateAsync` wraps the dictionary-cosine fallback scoring loop with `setImmediate` yields every 500 entries so the tick loop + state broadcast + GPU batch dispatch keep running during chat response.
  - `_gradeWordCap(gradeOrGrades)` — T14.24 Session 1 grade cap. Accepts string (legacy single-grade) OR object (multi-subject `{ela, math, science, social, art}`). Object form returns min cap across subjects past pre-K (lenient min so ELA-only brains keep speaking during Sessions 2-N).
  - `_singleGradeCap(grade)` — canonical grade → cap mapping, handles every GRADE_ORDER name plus legacy band names (`grade4_5`, `grade6_8`, `grade9_12`, `college`).
  - `_scoreDictionaryCosine` / `_scoreDictionaryCosineAsync` — T14.26 dictionary fallback scoring with async yield point. Used only when the T14.6 motor-loop path returns empty words.
  - `setCluster(cluster)` — T14.13 bridge. Merges pre-existing local Maps into the cluster's Maps, then re-points `_typeTransitionLearned` / `_sentenceFormSchemas` / `_sentenceFormTotals` / `_intentResponseMap` at the cluster's Maps by identity so every subsequent write lands in cluster state.
  - `wordType(word)` / `_fineType(word)` — pure letter-equation type classifiers. Zero word lists.
  - `loadSelfImage` / `loadLinguisticBaseline` / `loadCodingKnowledge` — three-corpus boot loaders. Feed the dictionary + route through the T14.5 curriculum walk.
  - `learnSentence(text, dictionary, arousal, valence)` — observes sentence into cluster-resident T14.8 schemas + T14.7 type transitions + T14.16.5 `cluster.learnClause` identity gate.
  - `generateAsync` — T14.26 async variant of generate used by `processAndRespond` to keep the event loop responsive during chat response.
- **Dead and deleted post-T14:** All slot-prior fields (`_slotCentroid`, `_slotDelta`, `_slotTypeSignature`, etc.) killed in T13.7. `_TYPE_TRANSITIONS` hardcoded table + `_OPENER_TYPES` Set killed in T14.7. Duplicate schemaScore/typeTransitionWeight/recordIntentPair/responseIntentFor wrappers killed in T14.17 (migrated to cluster in T14.13). `parseSentence` + `analyzeInput` + `_updateSocialSchema` + `observeVisionDescription` + `_socialSchema` killed in T14.12.
- **`js/brain/dictionary.js`** — ~600 lines. T14.3 extended entries with `cortexSnapshot` (Uint8Array of `cluster.lastSpikes` after first-observation stream), `syllables` (from `cluster.detectBoundaries`), `stressPrimary` (from `cluster.detectStress`), `lastSeen`. `setCluster(cluster)` wires the cortex in. `learnWord` routes first-observation through the cluster; re-observations bump frequency + running-mean without re-streaming. `syllablesFor` / `snapshotFor` readers expose the cortex-routed state. T14.17 deleted `findByMood`, `findByPattern`, `generateSentence`, `_cosine` (pre-T14 thesaurus legacy, zero callers). `_bigrams` Map + `learnBigram` + `bigramCount` getter kept because display stats still show them.
- **`js/brain/letter-input.js`** — T14.1 substrate. Module-level `LETTER_INVENTORY = new Set()` that grows dynamically as the brain encounters new symbols (NOT capped at 26 English letters — unicode, emoji, non-English glyphs all enter the same primitive-symbol space). `encodeLetter(letter)` returns a one-hot Float32Array of length `inventorySize()` with cache invalidation on growth. `ensureLetter`, `ensureLetters`, `decodeLetter`, `serializeInventory`, `loadInventory`, `resetInventory` round out the API.
- **`js/brain/curriculum.js`** — ~1700 lines. T14.5 data-driven bucketing curriculum (`runFromCorpora`, `learnFromTurn`) is still the boot path; T14.24 Session 1 added a multi-subject framework on top. `SUBJECTS = ['ela','math','science','social','art']`, `GRADE_ORDER = ['pre-K', 'kindergarten', 'grade1'..'grade12', 'college1'..'college4', 'grad', 'phd']`. `Curriculum._cellRunner(subject, grade)` dispatches ELA cells to the existing `runKindergarten`/`runGrade1`/…/`runGradPhD` methods (those already work for ELA — T14.24 Session 1 did NOT delete them) and returns stubs for Math/Science/Social/Art. Public run API: `runSubjectGrade`, `runFullSubjectCurriculum`, `runAllSubjects`, `resetSubject`, `subjectStatus`. `runFullCurriculum` (T14.5 legacy ELA path) mirrors each stage pass into `cluster.grades.ela` via `_LEGACY_ELA_TO_CANONICAL` map (`grade4_5 → grade5`, `grade6_8 → grade8`, `grade9_12 → grade12`, `college → college4`). Boot paths (`js/app.js loadCorpusIntoBrain`, `server/brain-server.js _initLanguageSubsystem`) still call `runFullCurriculum`. `_calibrateIdentityLock` runs at the end of every run regardless and populates `cluster._personaRefreshCorpus`, `cluster.personaDimensions`, `cluster.intentCentroids`, and the T14.16.5 thresholds. `Curriculum.gradeWordCap(stringOrObject)` static is the grade→cap mapping consumed by `LanguageCortex._gradeWordCap`.

### Brain→language wire (current state)
- **`NeuronCluster.readInput(text, {visualCortex})`** — T14.12 unified read entry point. Drives the visual→letter pathway via `readText` and returns `{text, words, intent, isSelfReference, addressesUser, isQuestion}`. Intent consults `cluster.intentReadout()` first (T14.17 argmax over `intentCentroids`), falls back to a lightweight text-surface heuristic. Pre-T14.12 `parseSentence` is DELETED.
- **`UnityBrain.injectParseTree(text)`** in `engine.js` — rewritten in T14.12 to call `cluster.readInput(text, {visualCortex: this.visualCortex})` and fire `cluster.injectWorkingMemory(contentEmb, 0.8)` for discourse state.
- **`UnityBrain.processAndRespond(text, userId)`** — calls `cluster.readInput` → `cluster.learnClause` (T14.16.5 Lock 1 per-clause English gate) → `cluster.generateSentence` for tick-driven motor emission, with `generateAsync` wrapping the dictionary-cosine fallback scoring loop (T14.26 fix for 3D brain freeze during chat response).
- **`NeuronCluster.generateSentence(intentSeed, opts)`** — T14.6 cortex tick-driven motor emission loop. Zero slot counter, zero candidate scoring, zero dictionary iteration, zero softmax top-K. Reads motor region as `inventorySize()`-dim vector every tick, argmax-decodes via `decodeLetter`, commits letters when motor argmax stays stable for `STABLE_TICK_THRESHOLD` consecutive ticks, emits words when `letterTransitionSurprise()` exceeds `WORD_BOUNDARY_THRESHOLD`, stops on committed terminator or `motorQuiescent(END_QUIESCE_TICKS)` after first word.
- **`NeuronCluster.learnClause(text)`** — T14.16.5 Lock 1 entry point. Splits clause, gates each against `ENGLISH_SURPRISE_THRESHOLD` + `ENGLISH_FINETYPE_MIN`, fires Hebbian on passing clauses under `_inCurriculumMode=false` hard rate cap (0.0001, Lock 2).
- **`NeuronCluster.learnSentenceHebbian(embSeq, opts)`** — sequence Hebbian over cluster recurrent synapses, still live for curriculum-mode training under full 0.012 rate.
- **`cluster.grades` + `cluster.grade` + `cluster.passedCells`** — T14.24 Session 1 multi-subject grade state. `cluster.grades = {ela, math, science, social, art: 'pre-K'}` initialized in constructor, advanced by `Curriculum.runSubjectGrade` on gate pass. `cluster.grade` is the legacy scalar mirror of `grades.ela`. `cluster.passedCells` is the flat `'subject/grade'` list. `LanguageCortex.generate` reads `cluster.grades` first, falls back to `cluster.grade`.

### Sensory + peripherals (live, unchanged by T14)
- `js/brain/sensory.js` — `SensoryProcessor.process()` produces per-cluster current arrays. Unchanged by T14.
- `js/brain/visual-cortex.js` — V1→V4→IT pipeline + `renderLetterTemplate(letter)` (T14.10 visual letter template trig-hash for synthetic text-mode letter percepts) + `onDescribe(cb)` subscription for scene describer output + T14.25 skin-tone HSV mask + motion centroid + setAttentionState wiring in RAF loop (iris tracks FACE + MOTION). `_computeGaze` uses weighted centroid over `eff = face×3.0 + motion×motionGain×0.5 + edge×0.15` scaled by center Gaussian prior.
- `js/brain/auditory-cortex.js` — continuous spectrum injection + `renderPhonemeTemplate(phoneme)` (T14.11 auditory phoneme template with different prime set than T14.10 visual so cross-stream convergence is LEARNED not coincident) + `checkForInterruption(text)` echo detection.
- `js/brain/remote-brain.js` — T14.23.5 RAF driver for `visualCortex.processFrame()` + T14.25 per-frame `setAttentionState({arousal, secondsSinceInput})` call + `_lastTextSendTime` stamp on `processAndRespond`.
- `js/brain/component-synth.js` — equational `build_ui` primitive matcher. Uses T14.17 `cluster.entityReadout()` with 0.25 blend alongside literal userEmbed match.
- `js/ui/sandbox.js` — LRU-evicted component renderer.
- `js/ui/sensory-status.js` — backend toast notifications.

### Embeddings (live)
- `js/brain/embeddings.js` — `sharedEmbeddings` singleton. `EMBED_DIM = 300` (T14.0 lift from 50). Full 400k-word GloVe 6B-300d loaded on Node from `corpora/glove.6B.300d.txt`; browser bulk-loads a server-precomputed subset via `getSubsetForTokens` to avoid 480 MB download. Online context refinement deltas persist across sessions via `serializeRefinements` / `loadRefinements`.

### Persistence (live, v4)
- `js/brain/persistence.js` — v4 (bumped T14.16 to reject pre-T14 saves). `state.t14Language` block carries T14.1 letter inventory, T14.13 cluster-resident learned-statistics Maps (`fineTypeTransitions`, `sentenceFormSchemas`, `sentenceFormTotals`, `intentResponseMap`), T14.16.5 identity-lock thresholds, and — as of T14.24 Session 1 — `state.t14Language.curriculum = {grades, grade, passedCells}`. Additive inside the existing t14Language block; older v4 saves without the curriculum sub-block load cleanly and fall back to cluster-constructor defaults.

### Server (live)
- `server/brain-server.js` — brain host. Auto-scales via `detectResources` with optional admin override via `resource-config.json`. T14.18 removed the 2K language-cortex side-car hardcode; language cortex now scales from `CLUSTER_SIZES.cortex` end-to-end. T14.26 `processAndRespond` awaits `languageCortex.generateAsync` so state broadcast setInterval keeps firing through chat-response scoring. T14.24 Session 1 defense-in-depth `cortexCluster.grades` + `passedCells` init in `_initLanguageSubsystem`.
- `server/configure.js` — 127.0.0.1-only admin config server used by `GPUCONFIGURE.bat` (Phase 0, shipped).

---

## ⏸ PART 2 (COMP-net) IS ON HOLD AS OF 2026-04-14

> Gee called it. The distributed-compute network plan (Part 2 — C0 through
> C11) is parked indefinitely while T14 (developmental language layers) is
> the active priority. The COMP plan is preserved verbatim below for when
> we resume — every prerequisite that COMP needed is also a prerequisite
> for T14 (or the other way around in some cases), so work toward T14 keeps
> COMP unblocked for whenever we come back.
>
> **Active work is T14 (Part 0.5).** Skip Part 2 unless explicitly told to
> re-enable it.

---

### ⭐ COMP-RELEVANT INFRA ALREADY SHIPPED (read before resuming Part 2)

When COMP-net resumes, the following CPU + GPU dispatch primitives are
already in the tree. Build distributed extensions on top of them, not
from scratch — the math-identity invariants are already validated.

**iter22 — leak / dispatch / collapse fixes (shipped 2026-05-05/06).** Curriculum-side scratch-buffer pools, projection whitelist scoping in `_crossRegionHebbian`, persistent `wordBucketWords_<subject>` maps shared by teach + emit + write paths, mean-argmax in `emitWordDirect`, ConsolidationEngine fast-path for already-promoted episodes. All math-identical. See `docs/TODO.md` iter22-A/B/C/D/E/F/G/H entries for full rationale.

**iter24 — throughput primitives + ALREADY-SHIPPED audit (2026-05-06).**

- **iter24.1 (Tier 0 heartbeat object pool)** — eliminates ~1350 fresh per-cell `{ts, phase, cellKey, ...}` allocations via ring buffer. GC pressure win. Math-identical.
- **iter24.3 (convergence early-exit on rep loops)** — `_teachAssociationPairs` and `_teachQABinding` exit when 2 consecutive reps drop below `overloadMax` sep-probe. End state bit-identical to running full rep budget once basins separate.
- **iter24.5 (worker-pool batch infra)** — NEW `SparseMatmulPool.hebbianUpdateBatch(matrix, pairs, lr)` packs N (pre, post) pairs into one strided SAB + one `postMessage` per worker. Worker iterates internally with sequential Hebbian per pair → math-identical to N separate `hebbianUpdate` calls. **Caller adapter not yet wired** — infra ships but curriculum.js callers still fire per-pair. Wiring is straightforward and lands the speedup whenever the CPU sparse-pool path is hot.
- **iter24.4 + iter24.6 — ALREADY SHIPPED via existing T17.7 + T18.8/T32 architectures**, confirmed by audit. T17.7 Phase C.1 binding rebinds projections to cluster spike buffers so pre-spikes read directly from the bound buffer (no per-call upload) at biological scale. T18.8 + T32 in `gpuSparseHebbianBound` (server/brain-server.js:2995-3048) accumulates ops into 256-op batches with 20ms flush, dispatched as ONE encoder + ONE submit + ONE WS ACK round-trip via `gpu.hebbianSparseBatch`. The "GPU-resident vocab" + "disjoint-pair shader batching" wins are present at the bio-scale GPU-bound runtime.

**Implications for Part 2 (COMP-net) when it resumes:**

- **Distributed CPU-side dispatch path** can layer on top of `hebbianUpdateBatch` directly. The strided pre/post SAB packing already handles the batched semantics; a distributed transport (TCP/RPC/whatever Part 2 picks) replaces the worker `postMessage` with a network message but the per-batch math is unchanged.
- **GPU-bound bio-scale runtime needs no further Hebbian batching work** — T17.7 + T18.8/T32 already collected those wins. Part 2's GPU-side scaling efforts should focus on multi-GPU sharding / cross-node weight gradient sync, not single-node dispatch optimization.
- **Browser-portable deployment** is already viable with iter24.5 infra once the caller adapter ships. CPU-only nodes (no WebGPU) get batched-Hebbian throughput via the worker pool path.
- **Hot path at biological scale on workstation w/ WebGPU is already deeply batched** — Part 2 distributed work should profile against a clean iter22+iter24 baseline, not against pre-iter22 telemetry. Many of the "obvious" per-dispatch optimizations in older COMP planning are already in production.
- **Math-identity discipline established.** Every iter22 + iter24 commit asserts bit-identical (or stochastic-noise-bounded) trained matrices vs sequential. Part 2's distributed extensions inherit the same discipline: weight-hash compare across nodes after each pass, no "approximate aggregation" tradeoffs accepted.

**One remaining iter24 item that DOES belong in Part 2 follow-up:** spike-buffer striding for true per-fact GPU batching on top of T18.8/T32 (different facts dispatched together via N strided slots in the spike buffer). Estimated 1.5-2× additional gain on QA-binding + word-emission phases. Spec'd in `docs/TODO.md` iter24.6 entry. WGSL plasticity shader already supports per-dispatch `srcOffset`/`dstOffset` variation so the kernel work is minimal; the heavy lift is spike-buffer slot management + write coordination across N parallel facts.

---

### The ordering rule (Gee, 2026-04-16)

Gee's instruction 2026-04-16: *"make not of this where relevant like claud.md and such"* — pointing at this approved reasoning:

> *"running actual K→PhD curriculum across 114 cells tells us exactly which Hebbian loops, cross-projections, or gate probes are the slow bastards, so when we DO hit COMP-todo later we're tuning the paths that actually matter instead of guessing."*

Syllabus (Part 0.5 T14.24 grade content — Math-K next per NOW.md, then ELA-K, then grade 1 across all 6 subjects) is the active priority until the full K→PhD walk is complete. COMP-todo does not resume until that walk produces real bottleneck telemetry — no speculative pre-emptive scaling, no empty-brain compute optimization. See `.claude/CLAUDE.md` "LAW — SYLLABUS BEFORE COMP-TODO" for the full binding, exception rule (targeted COMP fix allowed when a grade cell blocks the walk entirely), and per-cell wall-clock telemetry requirement.

---

## ⭐ PART 0.5 — T14: DEVELOPMENTAL LANGUAGE LAYERS (active priority)

> **Gee, 2026-04-14: "we are making a biological brain simulation so just like how a human learns letters then sounds then syllables then words then sentences structures of all the kinds and them paragraphs"**
>
> This is the architectural call that makes everything else right. The T13 work was correct in *direction* (deletion of slot priors, brain-driven emission loop, persona Hebbian) but WRONG in *foundation* — it skipped the developmental layers that biological brains build language on top of. T14 rebuilds the language stack from primitives upward, the way a real brain develops.

### The thesis

The current Unity language stack has:
- **Top layer:** GloVe 50d semantic embeddings (pre-trained on 6B-word corpus, NOT learned by Unity)
- **Middle layer:** `wordType()` / `_fineType()` POS classifiers (algorithmic letter-pattern equations, NOT learned)
- **Bottom layer:** 5-dim per-letter hash patterns (`_initLetterPatterns`, deterministic sin/cos, NOT phonetic)

**Nothing below the word level was ever learned by Unity.** She has no phoneme knowledge. No syllable structure. No spelling-to-sound mapping. No articulatory features. Letters exist only as suffix-detection helpers in `wordType` and as the indexing key for the dictionary. She skipped Stages 1-6 of biological language acquisition and went straight to Stage 8 (text I/O over pre-trained semantic embeddings).

**That's why she doesn't sound like a developing intelligence — because she isn't one.** She's a static GloVe lookup with a brain-shaped frontend. T13.7.8 (the grammar transition table I just shipped) is a hardcoded English structural table — it makes outputs grammatical, but it doesn't give Unity the *experience* of having learned grammar. A real brain learns grammar by hearing 10,000+ sentences over years and internalizing the type-transition statistics. We can compress that into a curriculum.

### The eight stages of biological language acquisition

```
Stage 1 (0-6mo)   Phoneme discrimination          — auditory cortex feature detectors
Stage 2 (6-12mo)  Babbling — articulatory motor   — efference copy + auditory feedback
Stage 3 (12-18mo) First words                     — phoneme→meaning binding
Stage 4 (18-24mo) Vocabulary explosion + telegraphic speech (pivot grammar)
Stage 5 (24-36mo) Grammar emerges (SVO, agreement, articles, plurals, tense)
Stage 6 (3-5y)    Complex grammar (subordinate clauses, conditionals, passive)
Stage 7 (5-12y)   Reading — letter visual recognition + grapheme-phoneme mapping
Stage 8 (lifelong) Writing
```

Unity is currently a Stage 8 system that skipped Stages 1-7. T14 builds those stages properly, in compressed-curriculum form.

### T14 sub-milestones

#### T14.0 — Foundation lift: full GloVe + auto-scaled cortex

**Status:** P0 prereq for T14.1+. Absorbed P1.3.

**The principle:** every parameter in the language stack scales from a single source — `cluster.size` for the cortex cluster, `sharedEmbeddings.size` for the dictionary, the available compute pool for everything else. **Zero hardcoded caps.** The cluster size auto-scales to detected hardware via `server/brain-server.js:detectResources` (already in place from Phase 0). When COMP-net is re-enabled later, the cluster scales to the connected volunteer GPU pool — same code path, just bigger numbers.

**Implementation principles:**

1. **`js/brain/embeddings.js`** — bump `EMBED_DIM` from 50 to **300**. Re-enable the GloVe loader (`loadPreTrained` currently falls through to hash). **Load the full 400k-word `glove.6B.300d.txt` file**, no vocabulary cap. Memory at 400k × 300 × 4 bytes = 480 MB on the brain server, which is fine because the server runs on real hardware. The browser-side `RemoteBrain` doesn't need the full table because chat goes through the server anyway — RemoteBrain loads only the words actually used in `Ultimate Unity.txt` (lazy GloVe subset, computed at boot from the persona corpus token set, ~5-10 MB).

2. **`js/brain/engine.js`** — `CLUSTER_SIZES.cortex` becomes a **fraction of the auto-detected total**: `Math.floor(detectedNeurons * 0.30)` (cortex is biologically ~30% of total brain). All other clusters scale proportionally (`hippocampus = 0.10`, `amygdala = 0.08`, `basalGanglia = 0.08`, `cerebellum = 0.40`, `hypothalamus = 0.05`, `mystery = 0.04`). When `detectResources` returns 1000 neurons total (CPU fallback), cortex is 300. When it returns 677M (GPU server), cortex is 200M. **Same code, no special cases.** No `Math.min(maxConnections, ...)` cap — connection density is a constant fraction (`opts.connectivity`), the absolute count grows naturally with size. If the connection memory exceeds VRAM, that's a `detectResources` problem to be solved at the resource-detection layer, not by capping the language stack.

3. **`server/brain-server.js`** — `_initLanguageSubsystem` no longer constructs a separate `this.cortexCluster` of arbitrary size. The language path uses `this.clusters.cortex` directly (the same cluster the rest of the brain uses, auto-scaled by `detectResources`). Sub-region offsets are computed as **fractions of `cluster.size`**, not hardcoded:
   ```
   auditoryStart  = 0
   visualStart    = floor(size * 0.083)   // 8.3% — auditory region
   freeStart      = floor(size * 0.333)   // 33.3% — visual region ends
   semanticStart  = floor(size * 0.500)   // 50% — sensory region ends
   phonologicalStart = floor(size * 0.750) // 75% — semantic region ends
   // language regions occupy the back half: 50% semantic, 25% phonological
   ```
   At any cluster size, the semantic region is 25% of the cluster and the phonological region is 25%. At 300 neurons → semantic 75 / phonological 75. At 200M neurons → semantic 50M / phonological 50M. Same code, full scaling.

4. **`js/brain/remote-brain.js`** — `_localCortex` also auto-scales. The browser tier is set by the user via `GPUCONFIGURE.bat` (Phase 0 — already shipped). RemoteBrain reads the same `resource-config.json` and constructs a cortex sized appropriately. No "browser is more compute-constrained, hardcode smaller" — the user chose their tier, respect it.

5. **`js/brain/cluster.js`** — `getSemanticReadout(embeddings, langStart)` and the new `getPhonologicalReadout(embeddings, phonStart)` both **infer their offsets from `this.semStart` / `this.phonStart`** fields set at construction. Callers don't need to remember magic offsets.

6. **`js/brain/embeddings.js`** — `mapPhonemesToCortex(phonemeFeatures, cortexSize, phonStart, phonDim)` is the symmetric write side. **`phonDim` is not hardcoded to 20** — it's read from `phonemes.PHONEME_DIM` at the top of T14.1, which is itself the size of whatever the LEARNED phoneme inventory turns out to be (T14.1 doesn't hardcode 20 either — see below).

7. **`js/brain/language-cortex.js`** — `PATTERN_DIM` already imports from `embeddings.EMBED_DIM` so it picks up 300 automatically. Every `mapToCortex(emb, cluster.size, 150)` literal becomes `mapToCortex(emb, cluster.size, cluster.semStart)`. The slot scorer's per-candidate cosine remains O(dictionary.size × EMBED_DIM); at full GloVe + 300d that's ~120M ops per generate call, negligible on any modern hardware (server) or via the server-side path (browser).

**Files touched:** `js/brain/embeddings.js`, `js/brain/engine.js`, `server/brain-server.js`, `js/brain/remote-brain.js`, `js/brain/cluster.js`, `js/brain/language-cortex.js`.

**Acceptance gates (no time/memory budget — these are correctness gates):**
1. `sharedEmbeddings.getEmbedding('cat').length === 300` and the value comes from real GloVe (cosine to `getEmbedding('kitten')` > 0.6).
2. `cluster.getSemanticReadout()` and `cluster.getPhonologicalReadout()` both return correctly-dimensioned vectors regardless of cluster size.
3. Cortex cluster size matches `Math.floor(detectResources().totalNeurons * 0.30)` exactly. Hand-tested at three resource tiers: minimum (1K total → 300 cortex), prosumer (50M total → 15M cortex), datacenter (1B total → 300M cortex). Same code path, no branching.
4. `cluster.diagnoseReadoutForEmbedding(getEmbedding('fuck'), 10)` produces a readout whose nearest dictionary words include persona-adjacent terms — measured AFTER T14.5 curriculum runs, not before.

**No deferred work, no risks-with-mitigations, no "if too slow then drop to" fallbacks.** If a particular hardware tier can't run T14.0 at full size, that hardware is in the "Minimum" Phase 0 tier and gets a smaller cortex automatically. The language code doesn't care — it reads sizes off the cluster, not from constants.

---

#### T14.1 — LEARNED phoneme attractor basins via cortex exposure

**The principle:** phonemes are NOT hardcoded as a feature table. They EMERGE as cortex attractor basins from repeated exposure to letter sequences. Same way biological auditory cortex develops phoneme categories from speech exposure during the first 6 months — feature detectors cluster via Hebbian competitive learning into stable categories that reflect the statistical structure of the language. For Unity (text-based), the analogous mechanism is letter-sequence-statistics shaping cortex weights via curriculum exposure (T14.5).

**The previous draft hardcoded a 20-dim English feature table.** That was patch thinking. A biological brain doesn't come pre-wired with English phonology — it learns whatever language it's exposed to. Japanese brains don't form /l/-/r/ distinctions because Japanese doesn't use them. Unity's phoneme inventory should ALSO be learned, not hardcoded — so when she's later trained on a different corpus (Spanish, Mandarin, Klingon, code-only) the phoneme attractors form differently without code changes.

**How it actually works:**

1. Letters become **one-hot 26-dim input vectors** (or 28+ if punctuation/numerals counted as their own categories — adapts as new symbols are encountered, not capped at 26).

2. The cortex cluster has a **letter input region** (sub-region of the auditory/visual sub-region defined in T14.0). When a letter is encountered during input processing, its one-hot vector is injected into this region.

3. **Cortex Hebbian on the recurrent synapses** does the actual learning. Letters that appear in similar contexts (vowels surrounded by consonants, consonants at word starts, sibilants in clusters) develop overlapping attractor basins because their co-activation patterns overlap. After enough exposure, the cortex's spike pattern in response to letter `b` is more similar to its pattern for `p` than to `a` — because b/p both pattern as bilabial stops in word position even though we never told the brain that.

4. The **phoneme inventory size emerges**, it isn't preset. After curriculum exposure, the cortex has formed N distinct basins where N depends on how many statistically-distinct contexts the input contains. For a 26-letter English corpus, N is typically in the 30-50 range (each letter, plus a few digraph categories like 'sh' / 'ch' / 'th' / 'ng' that emerge as joint patterns).

5. **Emergent phoneme features** are read out via cosine distance between basin patterns. After training, `cosine(basin('b'), basin('p'))` will be high (both bilabial stops), `cosine(basin('a'), basin('b'))` will be low (vowel vs consonant). The 20-dim feature table from the previous draft is the kind of thing the brain WOULD discover through learning — but we never have to hand-code it.

**Implementation:**

1. **`js/brain/letter-input.js`** (new, ~80 lines) — letter→one-hot encoder. Exports:
   ```js
   export const LETTER_INVENTORY = new Set();   // seeded at module load: a-z + 0-9 + space . , ' (40 symbols)
   export function encodeLetter(letter): Float32Array;   // returns one-hot vector, length = LETTER_INVENTORY.size
   export function ensureLetter(letter): void;            // rejects symbols outside the seeded alphabet when locked (default)
   export function inventorySize(): number;
   export function setInventoryLock(locked): boolean;     // toggle runtime lock (operator opt-in for multi-script)
   ```
   T39.g.1 (2026-04-23) — inventory is LOCKED by default. `ensureLetter('@')` or `ensureLetter('¥')` is rejected silently when locked. Rationale: growing the inventory shifts every previously-assigned one-hot dimension index and invalidates trained weights. For English-only operation, the 40-symbol default (a-z + 0-9 + basic punctuation) is the stable working set. Operators who want multi-script behaviour call `setInventoryLock(false)` explicitly before the first teach phase.

2. **`js/brain/cluster.js`** — new field `this.letterInputStart` and `this.letterInputEnd` defining the cluster sub-region for letter input. Sized as a fraction of the cluster (`floor(size * 0.05)` — 5% of the cluster handles letter input). New helper `injectLetter(letter)` that calls `encodeLetter` then maps the one-hot vector into the letter-input sub-region.

3. **`js/brain/curriculum.js`** (new file shared with T14.5) — Stage A is no longer "iterate alphabet × 50 reps." It's **iterate every distinct letter that appears in the persona + baseline + coding corpora, with exposure frequency proportional to corpus frequency.** Common letters (e, a, t, o) get more exposure than rare ones (q, x, z) automatically. The brain learns the alphabet AND its frequency distribution simultaneously.

4. **`js/brain/language-cortex.js`** — `_letterPatterns` and `_initLetterPatterns` are **deleted**. The 5-dim sin/cos hash is gone. `wordType` and `_fineType` no longer rely on `_letterPatterns` (they were already using string operations directly, the hash was vestigial).

**No hardcoded feature table. No "default value for ambiguous letters." No "deferred to later refinement."** The brain learns whatever inventory the corpus contains, with whatever features statistical co-occurrence reveals.

**What the cortex output looks like after Stage A:** for each letter, the cluster has a stable attractor basin. Injecting `'b'` produces a spike pattern; injecting `'p'` produces a similar but distinguishable pattern; injecting `'a'` produces a clearly different pattern. The differences encode phonological feature structure WITHOUT us having ever coded "bilabial" or "vowel" as a feature dimension. The features are emergent.

**Acceptance:**
1. After curriculum, `cluster.diagnoseReadoutForEmbedding(encodeLetter('b'))` and `(encodeLetter('p'))` produce readouts with cosine > 0.6 (both bilabial stops cluster).
2. Same for `(encodeLetter('a'))` and `(encodeLetter('e'))` (both vowels).
3. `cosine(basin('b'), basin('a'))` < 0.3 (vowel-consonant separation).
4. `LETTER_INVENTORY` after curriculum equals the union of all distinct symbols in the loaded corpora (no preset cap).
5. Re-running curriculum on a different corpus (e.g. Spanish text) produces a DIFFERENT basin geometry without any code changes — proves the learning is data-driven, not language-locked.

*(The previous draft of T14.1 contained a hardcoded 20-dim English phonology feature table with one row per letter, plus pseudocode for a `buildVec` constructor. That table was patch thinking — it pre-coded what the brain should learn through exposure, picked single defaults for letters with context-dependent pronunciations, and capped the feature space at 20 dimensions. All of it was deleted. The LEARNED-via-cortex-exposure approach above replaces the hardcoded table entirely. No deferred work, no risks-with-mitigations, no "we pick the most common single-letter sound" compromises. The brain learns whatever inventory the corpus contains.)*

---

#### T14.2 — LEARNED syllable boundaries via cortex sequence statistics

**The principle:** syllables are NOT detected by a hardcoded maximum-onset algorithm. They EMERGE as cortex transition patterns from sequence Hebbian over letter inputs. Same way biological syllabification develops in pre-school years from massive exposure to spoken (and later read) language — the brain learns where natural pause-points fall through statistical regularity, not from being taught phonotactic rules.

**The previous draft hardcoded the maximum-onset principle plus a list of valid English consonant cluster patterns.** That was patch thinking — it pre-coded English-specific rules, picked single defaults for ambiguous cases, deferred silent letters as "later T14.x refinement," and locked the syllabification to one language. All deleted.

**How it actually works:**

1. During curriculum letter-sequence exposure (T14.5), the cortex sees consecutive letter inputs at high frequency. Sequence Hebbian on the recurrent synapses (already running via T13.1's `learnSentenceHebbian`) develops STRONG transition basins for letter pairs that occur often (`th`, `ch`, `er`, `in`, `on`) and WEAK basins for pairs that rarely or never occur (`zx`, `qz`, `wt`).

2. **Syllable boundaries are wherever the transition strength drops.** Within a syllable, letter-to-letter transitions are predictable (cortex transition energy is low). At a syllable boundary, transitions become unpredictable (cortex transition energy spikes — the brain experiences a "moment of surprise" between syllables). This is the same mechanism babies use to find word boundaries in continuous speech.

3. **Detecting boundaries at runtime** uses the cortex's own state directly: stream the letters of a word through the cluster, monitor the spike-rate change between consecutive letter injections. Boundaries are local maxima of transition surprise.

4. **No language-specific rules.** When trained on Spanish corpus, the cortex learns Spanish syllabification (CV-heavy with frequent CVC). When trained on Mandarin pinyin, it learns Mandarin patterns (mostly CV with tonal markers as separate categories). When trained on coding text, it learns syllabification appropriate to identifier conventions. Same code, different basins.

**Implementation:**

1. **`js/brain/cluster.js`** — new method `cluster.detectBoundaries(letterSequence)` that streams letters through `injectLetter` (T14.1) one at a time, tracks the spike-rate delta between consecutive injections, and returns the indices where delta exceeds the rolling mean by a learned threshold. The threshold is itself adaptive — `mean(delta) + k*std(delta)` over the recent input.

2. **No new file.** Syllable detection lives on the cluster as a method, not in a separate `syllables.js`. Syllables are a CORTEX-LEVEL phenomenon (transition surprise patterns), not a stand-alone string-parsing algorithm.

3. **Stress** is learned similarly. During Stage E (persona corpus exposure), the cortex sees stressed-syllable patterns at higher activation strength than unstressed ones (because stressed syllables carry more semantic content). The cortex develops "high-activation basin" vs "low-activation basin" attractors. `cluster.detectStress(letterSequence)` returns the per-syllable activation peaks.

4. **`js/brain/dictionary.js`** — `learnWord()` calls `cluster.detectBoundaries(letters)` to compute syllables from the cortex's own state, not from a hardcoded splitter. Dictionary stores the result on the entry. **The cortex IS the syllable detector.**

5. **No `splitSyllables(word)` standalone function.** It's a method on the cluster. Outside the cluster, callers can't syllabify because syllabification IS cortex inference.

**The 'y' / silent letter / edge cases** are not edge cases anymore. The cortex learns from corpus statistics whatever the corpus contains. If the corpus contains "rhythm" / "know" / "through" thousands of times, the cortex's transition basins reflect their actual structure. Edge cases are just rare patterns — the brain handles them with whatever weight they earned via exposure.

**Acceptance:**
1. After curriculum, `cluster.detectBoundaries('strawberry')` returns indices that segment into ≈3 chunks (tolerant of off-by-one — different splits are linguistically valid, the cortex picks whatever the corpus statistics support).
2. Re-trained on a small synthetic Spanish corpus, `cluster.detectBoundaries('caballero')` returns Spanish-pattern boundaries (≈4 chunks) — proves data-driven, not English-locked.
3. Cortex transition-surprise signal at a learned syllable boundary is measurably higher (>2σ above rolling mean) than within a syllable. Verified by injecting letters of 100 corpus words and plotting the surprise trace.
4. No `splitSyllables` standalone function exists in the codebase. Search returns zero matches.

---

#### T14.3 — Cortex-resident words (eliminate the Dictionary as a separate table)

**The principle:** there is no separate dictionary. A "word" is the cortex activation pattern that emerges when its letter sequence is streamed through the cluster. Word identity, semantic meaning, phonological structure, syllabification, stress — ALL of it lives in the cortex weights as learned attractor basins. The current `Dictionary` class becomes a thin **index** mapping word strings to the cortex state vector that activates for them, not a structured database of phonological/semantic fields.

**Why this is the right architecture:** biological brains don't have a dictionary lookup table. Neurosurgeons cutting open a human brain don't find a structured mental lexicon with phoneme/syllable/POS fields per word. They find activation patterns in left posterior temporal cortex that represent each known word as a distributed pattern across thousands of neurons. The "fields" we'd want (semantic meaning, phonological structure, grammatical role) are all readouts from different sub-regions of the same activation pattern. T14.3 makes Unity work the same way.

**The previous draft schema** had separate fields for `letters`, `syllables`, `syllableShapes`, `syllableCount`, `stressPattern`, `phonemeFeatures`, `phonemeMean`, `phonemeOnset`, `phonemeCoda`, plus the existing `pattern` (GloVe semantic), `arousal`, `valence`. **All of those fields are deleted.** Replaced by:

```js
// js/brain/dictionary.js — Dictionary entry, T14.3 schema
{
  word: 'strawberry',
  // The ONLY field that matters: the cortex spike pattern when this
  // word's letters are streamed through the cluster. Everything else
  // (semantics, phonology, syllables, stress, grammatical role) is
  // a readout from sub-regions of this same pattern.
  cortexSnapshot: Uint8Array(cluster.size),

  // Lightweight metadata for indexing — NOT the source of truth.
  count: N,
  firstSeen: timestamp,
  lastSeen: timestamp,
}
```

**No phoneme features stored on the dictionary entry.** No syllable arrays. No stress patterns. No semantic embedding. All of that comes out of the cortex when you query it.

**Reading semantic content of a word:** call `cluster.semanticReadoutFor(word)` which loads the word's `cortexSnapshot` into the cluster's spike state, runs forward propagation for K ticks, then reads `cluster.getSemanticReadout()` from the semantic sub-region. The semantic readout is fresh each time — it reflects the CURRENT cortex weight state, so words that have been re-exposed since first learning give updated readouts.

**Reading phonological content:** same pattern — `cluster.phonologicalReadoutFor(word)` loads the snapshot and reads `cluster.getPhonologicalReadout()`. The phoneme structure isn't stored per word — it's reconstructed from the cortex state.

**Reading syllables:** `cluster.detectBoundaries(letterSequence)` from T14.2.

**Reading grammatical role:** `cluster.fineTypeReadoutFor(word)` reads from a NEW grammatical sub-region (added in T14.7).

**Continuous learning, not one-shot.** `learnWord(word, ...)` doesn't compute anything once and freeze it. Every observation re-injects the word, ticks the cortex, and updates `cortexSnapshot` to the latest spike pattern. The pattern drifts as the cortex's underlying weights shift through more exposure — exactly how a child's understanding of a word becomes more refined over years of use.

**Implementation:**

1. **`js/brain/dictionary.js`** is gutted from ~600 lines down to ~150 lines. Removes ALL the per-word feature computation. Becomes a thin index: `Map<word, cortexSnapshot>` plus count/timestamp metadata.

2. **`learnWord(word, pattern, arousal, valence)`** signature stays for backward compatibility but the `pattern` / `arousal` / `valence` arguments are now ROUTED into the cortex (not stored on the entry). The function becomes:
   ```js
   learnWord(word, pattern, arousal, valence) {
     // 1. Inject the GloVe pattern into semantic region (so cortex has
     //    semantic anchor while learning the letter sequence)
     // 2. Stream the word's letters through the letter input region
     //    one at a time, ticking between
     // 3. Hebbian on the resulting joint state (semantic + phonological + letter regions)
     // 4. Snapshot the final cortex spike state
     // 5. Store snapshot in this._words.get(word) — overwriting any previous snapshot
     // 6. Update count + lastSeen
   }
   ```

3. **`Dictionary.serialize()` / `deserialize()`** drop ALL the phonological fields. Only `cortexSnapshot` per word + metadata. The cortex weights themselves persist via `BrainPersistence` → `SparseMatrix.serialize` (already in place from T13.7).

4. **All consumers of the old fields** (component-synth uses `entry.pattern`, brain-3d commentary uses `entry.pattern`, etc) are updated to call the cortex readout methods. No code path reads stored phonological/semantic fields directly anymore.

5. **`size` getter** stays — returns `_words.size` for legacy callers that want the vocabulary count.

**Acceptance:**
1. `dict._words.get('cat')` returns ONLY `{word, cortexSnapshot, count, firstSeen, lastSeen}` — no phoneme/syllable/pattern fields.
2. `cluster.semanticReadoutFor('cat')` returns a 300-dim vector with cosine > 0.6 to `getEmbedding('kitten')` after curriculum.
3. `cluster.phonologicalReadoutFor('cat')` produces a phonological-region readout consistent with letter sequence c-a-t.
4. After 100 additional observations of 'cat' across 1000 turns, `dict._words.get('cat').cortexSnapshot` differs from its first-observation snapshot by measurable cosine (proves continuous re-learning, not one-shot freeze).
5. `Dictionary` source file is < 200 lines (down from ~600).
6. Grep for `entry.pattern`, `entry.phonemeFeatures`, `entry.syllables` across the codebase returns zero hits outside the gutted Dictionary file itself.

---

#### T14.4 — Auto-scaled cortex sub-regions + always-on cross-region projections

**The principle:** the cortex cluster is divided into LANGUAGE-functional sub-regions that are sized as fractions of the whole cluster, not as hardcoded neuron counts. The same code works at 1K cluster and 200M cluster. Cross-region projections are ALWAYS active — there's no gate that "skips them until curriculum finishes." The whole point of the curriculum is to train these projections through normal use; gating them out defeats the purpose.

**Sub-region layout (fraction-based, applied at any cluster size):**

```
Region                Fraction         Function
────────────────────────────────────────────────────────────────────────────
auditoryStart    →    0.000 - 0.083    auditory cortex (T14.11)
visualStart      →    0.083 - 0.250    visual cortex (T14.10) — letter visual recognition
freeStart        →    0.250 - 0.500    inter-cluster projection sink + working memory
letterStart      →    0.500 - 0.550    letter input region (T14.1)
phonStart        →    0.550 - 0.750    phonological language region (T14.1+T14.2 attractor basins)
semStart         →    0.750 - 0.917    semantic language region (T14.0 GloVe target)
fineTypeStart    →    0.917 - 0.967    grammatical/syntactic region (T14.7)
motorOutStart    →    0.967 - 1.000    motor output region (T14.12 generation feedback)
```

At cluster.size=300: letter region 15 neurons, phon region 60, sem region 50, fineType region 15, motor 10. At cluster.size=200M: letter region 10M, phon region 40M, sem region 33M, fineType region 10M, motor 6.6M. **Same code, no special cases.**

**Cross-region projections (seven pairs, 14 total — each pair is two independent SparseMatrix instances, one per direction):**

```
visual ↔ letter        (visual letter-shape recognition ↔ letter input one-hot)
letter ↔ phon           (letter sequences ↔ phoneme attractor basins)
phon ↔ sem              (phonological pattern ↔ semantic meaning binding)
sem ↔ fineType          (semantic concept ↔ grammatical role binding)
sem ↔ motor             (semantic intent ↔ motor planning)
motor ↔ letter          (motor planning ↔ letter emission — closes the writing loop)
auditory ↔ phon         (T14.11 — spoken phoneme recognition ↔ phonological region)
```

Each named pair has TWO independent SparseMatrix instances — e.g. `letter_to_phon` and `phon_to_letter` — so the two propagation directions can learn independent weights, matching how biological white-matter tracts carry separate ascending and descending fiber populations (Friederici 2017, *Psychon Bull Rev* 24:41-47).

Each projection is a sparse weight matrix between the spike vectors of the two regions. **Always propagated every step. Always Hebbian-updated when both ends co-fire.** No "wait until curriculum is done" gate — the curriculum IS the training, and the only way the projections can train is through repeated propagation + Hebbian during exposure.

**The "noise during early training" objection** is wrong. Random-init projections inject low-magnitude noise into adjacent regions. That's not a bug, it's how biological cortex starts — newborn brains have weak random cross-region connections that strengthen through experience. The first few thousand exposures are noisy, then the projections sharpen. That's correct developmental behavior.

**Implementation in `js/brain/cluster.js`:**

```js
// In NeuronCluster constructor — sub-region offsets computed from size
const s = this.size;
this.regions = {
  auditory:  { start: 0,                    end: Math.floor(s * 0.083) },
  visual:    { start: Math.floor(s * 0.083), end: Math.floor(s * 0.250) },
  free:      { start: Math.floor(s * 0.250), end: Math.floor(s * 0.500) },
  letter:    { start: Math.floor(s * 0.500), end: Math.floor(s * 0.550) },
  phon:      { start: Math.floor(s * 0.550), end: Math.floor(s * 0.750) },
  sem:       { start: Math.floor(s * 0.750), end: Math.floor(s * 0.917) },
  fineType:  { start: Math.floor(s * 0.917), end: Math.floor(s * 0.967) },
  motor:     { start: Math.floor(s * 0.967), end: s },
};

// Cross-region projections — every adjacent pair, both directions, sparse 10% init
this.crossProjections = {};
const pairs = [
  ['visual', 'letter'], ['letter', 'phon'], ['phon', 'sem'],
  ['sem', 'fineType'], ['sem', 'motor'], ['auditory', 'phon'],
];
for (const [a, b] of pairs) {
  const aSize = this.regions[a].end - this.regions[a].start;
  const bSize = this.regions[b].end - this.regions[b].start;
  this.crossProjections[`${a}_to_${b}`] = new SparseMatrix(bSize, aSize, { wMin: -0.5, wMax: 0.5 });
  this.crossProjections[`${a}_to_${b}`].initRandom(0.10, 0.7, 0.2);
  this.crossProjections[`${b}_to_${a}`] = new SparseMatrix(aSize, bSize, { wMin: -0.5, wMax: 0.5 });
  this.crossProjections[`${b}_to_${a}`].initRandom(0.10, 0.7, 0.2);
}

// In step() — after main synapse propagation, before LIF integration
_propagateCrossRegions() {
  for (const [name, proj] of Object.entries(this.crossProjections)) {
    const [src, _, dst] = name.split('_');
    const srcRegion = this.regions[src];
    const dstRegion = this.regions[dst];
    const srcSpikes = this.lastSpikes.subarray(srcRegion.start, srcRegion.end);
    const inputs = proj.propagate(srcSpikes);
    for (let i = 0; i < inputs.length; i++) {
      this.externalCurrent[dstRegion.start + i] += inputs[i] * 0.35;
    }
  }
}

// Cross-region Hebbian — runs on every cluster.learn() call,
// updates all projection matrices based on current co-firing
_crossRegionHebbian(lr) {
  for (const [name, proj] of Object.entries(this.crossProjections)) {
    const [src, _, dst] = name.split('_');
    const srcRegion = this.regions[src];
    const dstRegion = this.regions[dst];
    const preF = new Float64Array(srcRegion.end - srcRegion.start);
    const postF = new Float64Array(dstRegion.end - dstRegion.start);
    for (let i = 0; i < preF.length; i++) preF[i] = this.lastSpikes[srcRegion.start + i] ? 1 : 0;
    for (let i = 0; i < postF.length; i++) postF[i] = this.lastSpikes[dstRegion.start + i] ? 1 : 0;
    proj.hebbianUpdate(preF, postF, lr);
  }
}
```

**Implementation in `js/brain/embeddings.js`:**

`mapToCortex` and `cortexToEmbedding` become `mapToRegion(emb, cluster, regionName, dim)` and `regionToEmbedding(cluster, regionName, dim)` — region name lookup via `cluster.regions[regionName]`. No more hardcoded `langStart=150` literals. Every caller passes a region name.

**No "skip cross-region propagation if curriculum incomplete" gate.** That's deleted.

**Acceptance:**
1. `cluster.regions` has 8 named entries summing exactly to `cluster.size` regardless of cluster size.
2. `cluster.crossProjections` has 12 entries (6 pairs × 2 directions). Every entry has nnz > 0 at construction and is Hebbian-updated every cluster.learn() call.
3. After 1000 inject-tick cycles on consonant letters, `cluster.crossProjections.letter_to_phon` has measurably non-uniform weights (proves Hebbian fired).
4. Sub-region offsets identical across server (huge cluster) and RemoteBrain (small cluster) when normalized to fractions — verified by `assertEqual(cluster.regions.sem.start / cluster.size, 0.75)` regardless of size.

---

#### T14.5 — Continuous developmental learning from existing corpora (no hand-curation)

**The principle:** the curriculum is NOT a hand-curated sequence of staged corpus files. It's a continuous learning process that runs on the existing corpora (`Ultimate Unity.txt` + `english-baseline.txt` + `coding-knowledge.txt` + every live chat turn) with EXPOSURE INTENSITY scaled by structural complexity. Letters are exposed at highest intensity (most repetitions, longest tick budgets), short words next, longer words next, sentences next, paragraphs last. **The order isn't from hand-picked stage files — it's from sorting the existing corpus tokens by complexity and walking them in order.** New input keeps coming in forever; learning never stops.

**Why hand-curated stage corpora are wrong:** hand-curated stage files (200 phrases, 500 sentences) are bottlenecks. They're a fixed snapshot of "what Unity should learn." They cap the developmental trajectory at whoever picked the seed list. They break when we add Spanish or coding-only corpora because they're English-conversational. They violate the "no word lists" principle because a 500-line "simple sentences" file IS a curated word list.

**The right approach:** the persona/baseline/coding corpora ALREADY contain everything needed. Tokenize them, group tokens by complexity (letter < short word < long word < phrase < sentence < paragraph), and replay the corpus in complexity order with frequency-weighted repetitions. The brain is exposed to alphabet first (every letter, weighted by corpus frequency — `e` and `a` get more reps than `q` and `z` automatically), then short words (every 1-3 letter word from the corpus, in frequency order), then longer words, then short sentences, then long sentences, then full paragraphs.

**Curriculum walk:**

```
Phase 1 — LETTER exposure
  for each letter L in sort(corpus_letters, by_corpus_frequency_descending):
    inject L into letter region
    tick cluster K times (K scales with K_BASE * letter_freq, more reps for common letters)
    Hebbian on intra-cluster + cross-region projections every tick

Phase 2 — SHORT WORD exposure (1-3 letters)
  for each word W in sort(short_words(corpus), by_corpus_frequency_descending):
    stream W's letters into letter region one at a time
    inject W's GloVe vector into semantic region
    tick cluster K times per word
    Hebbian after each tick

Phase 3 — LONG WORD exposure (4+ letters)
  same as Phase 2, just longer letter sequences

Phase 4 — PHRASE exposure (1-3 word fragments naturally occurring in corpus)
  scan corpus for short noun phrases, verb phrases, prepositional phrases via the
  cortex's own emerging grammar (use parseSentence output to identify constituents)
  for each phrase:
    walk word-by-word through inject + tick + Hebbian
    sequence Hebbian binds the phrase as a temporal pattern

Phase 5 — SENTENCE exposure
  for each full sentence in corpus:
    walk word-by-word with longer tick budgets (more LIF integration per word)
    sequence Hebbian + cross-region updates per word
    update _typeTransitionLearned (T14.7) per consecutive word pair
    update _sentenceFormSchemas (T14.8) per slot type observed

Phase 6 — DISCOURSE exposure
  for each paragraph in corpus:
    walk sentence-by-sentence with topic-vector updates between sentences
    update _discourseState (T14.9) ring buffer to learn paragraph-level cohesion patterns
```

**Phase intensity is data-driven, not hand-set.** The tick budget per token scales with the token's structural complexity AND its corpus frequency. Common letters get more total ticks because they appear in more contexts. Rare words get fewer reps but each rep gets more ticks because the cortex needs longer to settle on a less-familiar pattern.

**No fixed timeline.** First boot runs the full corpus through all 6 phases. After first boot, the learned state persists. Subsequent boots load the persistent state and CONTINUE learning from new chat input — every live conversation turn is another curriculum exposure that adds to (not resets) the brain's accumulated learning.

**Persona corpus integration:** the persona corpus is NOT a separate stage. Its tokens flow through the same complexity-sorted phases as the baseline corpus. Persona-specific vocabulary appears in the long-word and sentence phases at high frequency because it's repeated across many persona sentences. The result: persona voice emerges from the same mechanism that learns generic English, just biased by the persona corpus's specific token distribution.

**Continuous live-chat learning:** every user turn after boot is processed by the same `learnSentence` + cross-region Hebbian pipeline that ran during the corpus walk. Live chat is just MORE corpus, fed in real-time. The brain keeps learning forever. There is no boot/runtime distinction.

**Implementation:**

1. **`js/brain/curriculum.js`** (~300 lines) — exports a single `Curriculum` class with one method:
   ```js
   class Curriculum {
     constructor(cluster, dictionary, languageCortex) { ... }

     async runFromCorpora(corpora) {
       // corpora: { persona, baseline, coding, ...others }
       // 1. Tokenize all corpora into a unified token stream
       const allTokens = this._tokenizeAll(corpora);
       // 2. Build complexity buckets — letters, short words, long words, phrases, sentences, paragraphs
       const phases = this._bucketByComplexity(allTokens);
       // 3. Walk each phase, exposing the cluster to its tokens with frequency-weighted reps
       for (const phase of phases) {
         await this._runPhase(phase);
       }
     }

     // Live-chat exposure — called from inner-voice.learn after every user turn
     learnFromTurn(text) {
       // Same path as Phase 5/6 above, just on a single sentence/paragraph
       // No phase distinction — live chat is continuous post-curriculum exposure
     }
   }
   ```

2. **No new corpus files.** No `docs/curriculum/stage-c-phrases.txt`. No `docs/curriculum/stage-d-sentences.txt`. The existing `Ultimate Unity.txt`, `english-baseline.txt`, `coding-knowledge.txt` ARE the curriculum input. The Curriculum class tokenizes them and replays them in complexity order.

3. **Boot integration in `app.js loadPersonaSelfImage`:**
   ```js
   const curriculum = new Curriculum(brain.clusters.cortex, brain.innerVoice.dictionary, brain.innerVoice.languageCortex);
   await curriculum.runFromCorpora({ persona: personaText, baseline: baselineText, coding: codingText });
   ```
   Replaces the current `loadPersona → loadBaseline → loadCoding → trainPersonaHebbian` sequence entirely.

4. **Same change in `server/brain-server.js _initLanguageSubsystem`.**

5. **`inner-voice.learn(text, ...)`** calls `curriculum.learnFromTurn(text)` so every user turn updates the brain. This already happens via `languageCortex.learnSentence` — T14.5 just renames/redirects the call to make the continuous-learning intent explicit.

6. **Persistence integration.** Cortex weights persist via `BrainPersistence` → `SparseMatrix.serialize` (already in place). The Dictionary's per-word `cortexSnapshot` (T14.3) persists as part of the dictionary state. **Subsequent boots SKIP the corpus replay** if the cluster weights are already trained and just continue with live-chat exposure. The skip is conservative — if the corpus files have changed (hash mismatch), retrain.

**Acceptance:**
1. After full curriculum runs, `cluster.semanticReadoutFor('cat')` produces a vector with cosine > 0.6 to `getEmbedding('kitten')` — proves semantic basins formed.
2. `cluster.phonologicalReadoutFor('cat')` produces a vector consistent with c-a-t letter sequence — proves phon basins formed.
3. Letter exposure phase completes WITHOUT any hardcoded "26 letters" loop — the alphabet is derived from corpus content.
4. Re-running curriculum on a Spanish-only corpus produces measurably different cortex basins — proves data-driven not language-locked.
5. After 50 live-chat turns post-boot, cortex weight stats show measurable drift from the post-curriculum baseline — proves continuous learning is wired and active.
6. Search for "stage-c-phrases.txt" and "stage-d-sentences.txt" in the codebase returns zero matches — no hand-curated corpus files exist.

#### T14.6 — Cortex tick-driven motor emission (NO slot loop, NO candidate scoring loop)

**The principle:** speech production is a continuous time-varying motor cortex output, not a discrete sequence of slot draws or candidate scores. Unity's output equation does NOT iterate "for slot in 0..maxLen: score candidates and pick one." It ticks the brain and reads letters out of the motor region as a continuous spike-pattern stream. Word boundaries emerge from the same cortex transition surprise signal that T14.2 uses for syllable boundaries. Stopping happens when the motor region quiesces or a sentence terminator appears in the output buffer.

**This rewrite deletes the last residue of slot-thinking from T14.** The previous T14.6 draft still had a per-candidate scoring loop (`score(w) = cos · cos · transition · valence · recency`, top-5 softmax). Gee called that out as slot-thinking dressed up — "why are we still doing slots i thought we cam up with a better equation for language" (2026-04-14). He was right. Real biological speech production has no candidate pool and no argmax — motor cortex just produces articulator trajectories, and the listener (or in our case, a letter-decoding readout) reconstructs words from the continuous signal.

**Grounded in peer-reviewed neuroscience:**

- **Bouchard, Mesgarani, Johnson, Chang (2013)** *"Functional organization of human sensorimotor cortex for speech articulation,"* Nature 495:327-332. High-density electrocorticography over human vocal sensorimotor cortex (vSMC) showed somatotopic representation of articulators (lips, tongue, larynx, jaw) as time-varying activation patterns. Speech is produced as continuous articulator trajectories, not as discrete phoneme selections from a candidate pool.

- **Anumanchipalli, Chartier, Chang (2019)** *"Speech synthesis from neural decoding of spoken sentences,"* Nature 568:493-498. Demonstrated that continuous vSMC neural activity decodes into an articulatory kinematic trajectory, which in turn decodes into intelligible speech. The decode is a continuous function of time, not a slot-by-slot word lookup. This is THE demonstration that motor cortex output for speech is a continuous stream, not an iterated selection.

- **Saffran, Aslin, Newport (1996)** *"Statistical learning by 8-month-old infants,"* Science 274:1926-1928. Infants segment continuous speech into words using transition probability statistics — high within-word transition probability, low between-word transition probability. This is the mechanism T14.2 uses for syllable boundaries; T14.6 reuses it at the word level.

- **Browman & Goldstein (1992)** *"Articulatory phonology: an overview,"* Phonetica 49:155-180. Speech is a continuous stream of overlapping articulatory gestures. Phonemes are perceptual abstractions over continuous gesture streams, not primitive production units.

- **Hickok & Poeppel (2007)** *"The cortical organization of speech processing,"* Nat Rev Neurosci 8:393-402. Dual-stream model: dorsal stream (Broca → pre-motor → motor → vSMC → articulation) handles production; ventral stream (auditory → STG → inferior frontal) handles comprehension. Production and comprehension share core regions, with direction of propagation distinguishing the two.

**The equation:**

```
cluster.generateSentence(intentSeed):

  // STEP 1 — Inject intent. Single semantic vector into sem region.
  // This is the ONLY explicit input to generation. Everything else
  // falls out of cortex dynamics.
  cluster.injectEmbeddingToRegion('sem', intentSeed, strength=0.6)

  // STEP 2 — Tick the brain. Motor cortex produces output continuously.
  letterBuffer = []
  wordBuffer   = []
  output       = []
  lastMotor    = null

  for tick in 0..MAX_TICKS:
    cluster.step(dt=0.001)

    // Read motor region as a letter activation over LETTER_INVENTORY.
    // The motor region's spike pattern IS the brain's current "what
    // letter to emit next" state. Read it as a probability distribution,
    // take argmax.
    motorReadout = cluster.regionReadout('motor', LETTER_INVENTORY.size)
    activeLetter = argmaxLetter(motorReadout)

    // STEP 3 — Letter emission via temporal stability. A letter is
    // "emitted" when the motor region holds the same argmax for
    // STABLE_TICK_THRESHOLD consecutive ticks — the cortex has "committed"
    // to that letter. Matches biological vSMC dwell-time for articulator
    // activation (Bouchard 2013 observed ~50-100ms dwells per phoneme).
    if activeLetter == lastMotor:
      stableTicks++
    else:
      stableTicks = 0
      lastMotor = activeLetter

    if stableTicks >= STABLE_TICK_THRESHOLD:
      letterBuffer.push(activeLetter)
      stableTicks = 0

    // STEP 4 — Word boundary detection via cortex transition surprise.
    // Same mechanism as T14.2 syllable boundaries, applied to the
    // letter output stream. When the cluster's letter-region transition
    // surprise spikes above WORD_BOUNDARY_THRESHOLD (calibrated from
    // corpus statistics during curriculum), emit the current buffer as
    // a word and reset. Saffran/Aslin/Newport 1996 statistical learning.
    surprise = cluster.letterTransitionSurprise()
    if surprise > cluster.WORD_BOUNDARY_THRESHOLD:
      if letterBuffer.length > 0:
        output.push(letterBuffer.join(''))
        letterBuffer = []

    // STEP 5 — Stopping. Three priority-ordered signals:
    //
    // (a) End-of-utterance attractor: motor region quiesces (low spike
    //     count for END_QUIESCE_TICKS consecutive ticks). The brain has
    //     nothing left to say — matches biological end-of-sentence motor
    //     deactivation.
    //
    // (b) Sentence terminator emerges: a period/question/exclamation
    //     letter stabilizes in the motor region. Letters are letters,
    //     including punctuation — the brain treats them as any other
    //     symbol in LETTER_INVENTORY. When one emits, stop.
    //
    // (c) MAX_TICKS hard cap: safety net only. If we hit this we log
    //     a warning and flush the current buffer.
    if cluster.motorQuiescent(END_QUIESCE_TICKS):  break
    if isTerminator(lastMotor):
      if letterBuffer.length > 0:
        output.push(letterBuffer.join(''))
      break

  // STEP 6 — Flush any remaining buffer and return.
  if letterBuffer.length > 0:
    output.push(letterBuffer.join(''))
  return output.join(' ')
```

**What's gone:**

- **No slot counter.** No `for slot in 0..maxLen`.
- **No candidate scoring.** No dictionary iteration, no per-word cosine, no softmax top-5, no temperature parameter.
- **No score function multipliers.** No valenceMatch, no recencyMul, no transitionWeight. Those were all slot-thinking.
- **No picked-word feedback injection.** The brain doesn't re-inject what it just said — motor cortex ALREADY knows because the motor region carries its own time history via recurrent synapses.
- **No grammatical terminability end check.** Replaced by the motor-quiescence + terminator-letter checks above.
- **No maxLen length cap** (except as a MAX_TICKS safety net on the tick loop). Length emerges from cortex dynamics — how long the motor region stays active before quiescing.

**What's new:**

- **Motor cortex is the output substrate.** Letters fall out of the `motor` region over time as the cluster ticks. Nothing "scores candidates."
- **Word boundaries come from statistical transition surprise**, same mechanism as T14.2 syllable boundaries. One mechanism, used at multiple scales (letter → syllable → word → sentence).
- **Stopping is biological quiescence**, not a counter.
- **Sentence terminators are LEARNED members of the letter inventory.** Period, question mark, exclamation are just letters Unity's visual/letter/motor pathways learned from corpus exposure — they emit naturally when the brain has reached end-of-utterance, same as any other letter.

**How the brain learns to produce this:**

The motor region's ability to generate coherent letter sequences comes entirely from the curriculum (T14.5). During continuous corpus exposure, reading text forward through the pipeline (visual → letter → phon → sem → fineType) drives the reverse pathway via Hebbian on the shared cross-projections. When the brain reads "hello", the motor region's spike pattern during that reading is shaped to represent "this is what the motor state LOOKS LIKE when h-e-l-l-o is being processed." Later, when the sem region is injected with a similar intent, the reverse pathway replays approximately the same motor state, which generates approximately the same letter sequence. This is the computational equivalent of Hickok & Poeppel's 2007 dorsal stream: the motor-speech link is built by the experience of hearing + reading speech.

**Acceptance:**

1. After curriculum, `cluster.generateSentence(intentSeed)` for a greeting-intent seed produces a letter sequence whose segmentation via transition surprise yields at least one recognizable English greeting word.
2. Temporal stopping works: motor-region spike count measurably drops below `END_QUIESCE_TICKS` threshold after a reasonable number of words (not hitting MAX_TICKS).
3. Sentence terminators (`.`, `?`, `!`) appear in output via the same letter-emission mechanism, not via a separate punctuation path.
4. Zero `for slot in` loops in the generation code path. Grep confirms.
5. Zero `candidate`, `softmax`, `top-5`, `topK` references in the generation path. Grep confirms.
6. Re-training on a Spanish corpus produces Spanish letter sequences via the same equation — proves the model is data-driven, not English-locked. (But note: T14.16.5 identity lock keeps the output in whatever language the PERSONA corpus is in; Spanish would require an explicit persona corpus swap, not just exposure.)

---

#### T14.7 — Fully learned type transitions, T13.7.8 hardcoded table DELETED

**The principle:** the type transition table is 100% learned from corpus exposure. There is NO seed initialization from the T13.7.8 hardcoded English table. T13.7.8 was a band-aid; the band-aid comes off when curriculum runs.

**Why no seed:** seeding the learned table with hardcoded English values pre-biases Unity toward English grammar. If we later train on a Spanish corpus, the seed values fight the actual Spanish statistics for thousands of observations before fading. Better: start empty, learn from the first observation.

**Implementation:**

1. **`_TYPE_TRANSITIONS` constant in `language-cortex.js` is deleted.** The constructor no longer constructs it. The 200-line hardcoded English table from T13.7.8 is gone entirely.

2. **`_OPENER_TYPES` set is also deleted.** The slot-0 opener constraint becomes a learned property too — the cortex's `_typeTransitionLearned['START']` row contains whatever types actually start sentences in the observed corpus. After curriculum, `START → PRON_SUBJ` will dominate naturally because that's how English declarative sentences open in the persona/baseline corpora.

3. **`_typeTransitionLearned` Map** starts EMPTY at constructor. Every `learnSentence` call (during curriculum AND live chat) updates it. Counts grow without bound. There's no seeded "pseudo-counts."

4. **The "type" itself** is no longer the hardcoded fineType enum. T14.7 introduces the **fineType region** in the cortex (T14.4 has it as a sub-region: neurons 91.7-96.7% of cluster). When a word is observed during learnSentence, the cortex injects a one-hot vector for its fineType into the fineType region. Sequence Hebbian on the fineType region's recurrent connections + cross-projection from fineType to phon/sem learns type transitions AS PART OF THE NORMAL CORTEX LEARNING. The `_typeTransitionLearned` Map is just a fast lookup index over those learned cortex weights.

5. **At generate time**, the type transition weight comes from `cluster.fineTypeTransitionWeight(prevType, candType)` which reads cortex state directly (or from the cached lookup index).

6. **No Laplace smoothing constant tuned to "20 possible types"**. The smoothing is Bayesian — `(count + 1) / (total + |unique_types_seen|)`. The number of unique types is whatever the cortex has observed, not a hardcoded 20. If new fine types emerge (T14.1's letter inventory growth applies here too — more types can appear as more languages/registers are exposed), the smoothing scales naturally.

**Persistence:** `_typeTransitionLearned` serializes to JSON. Cortex weights persist via `BrainPersistence` already.

**Acceptance:**
1. After curriculum runs on the persona/baseline/coding corpora, `_typeTransitionLearned.get('PRON_SUBJ').get('VERB_3RD_S')` > 100 (common English transition appears organically).
2. `_TYPE_TRANSITIONS` constant is not present in the codebase. Grep returns zero matches.
3. `_OPENER_TYPES` set is not present in the codebase. Grep returns zero matches.
4. Re-training on a Spanish corpus produces measurably different type transition distributions (e.g. Spanish allows null subjects, so `START → VERB_3RD_S` becomes common — verified from Spanish corpus exposure).
5. Live chat continues updating the learned table forever. After 1000 turns, entries grow proportionally.

---

#### T14.8 — Sentence-form schemas (all slots, all intents, fully learned)

**The principle:** sentence-form schemas span ALL slots, not just 0-3. Every slot in every intent has a learned type distribution. There's no arbitrary "schema only constrains slots 0-3" cap. There's no hardcoded intent table — the intents themselves are learned categories that emerge from the parser's classification of observed sentences.

**Why no slot cap:** real grammar has structure all the way through. A declarative sentence has constraints not just at slot 0 (subject) and slot 1 (verb) but also at slot N (object) and slot N+1 (modifier). Capping schemas at slot 3 throws away half the structural information.

**Why no hardcoded intent enum:** the previous draft listed declarative / interrogative / imperative / exclamative as the four intents. Real language has more — emotive exclamations, conditionals, reported speech, embedded questions, fragments. Whatever `parseSentence` classifies as a distinct intent gets its own schema bucket.

**Implementation:**

1. **`_sentenceFormSchemas`** is `Map<intent, Map<slot, Map<fineType, count>>>` with NO upper bound on slot. If a sentence has 30 words, all 30 slot positions get recorded in the schema.

2. **Updated by `learnSentence` for every observed sentence,** not just by Stage D of curriculum. Persona sentences, baseline sentences, coding sentences, live chat sentences all contribute. The schema is continuously refined.

3. **`schemaScore(slot, fineType, intent)`** returns the smoothed probability `(count + 1) / (total + uniqueTypesSeen)` with no clamping into a `[0.5, 1.5]` range. Raw probability multiplied directly into the score function. If a type has 0% probability at a slot, its score is heavily penalized but not zero (Laplace smoothing handles this).

4. **`responseIntent` mapping is itself learned.** Pre-T14.8 the engine had to hardcode `question → declarative_answer`, `greeting → declarative_greeting_back`. T14.8 introduces an `_intentResponseMap[userIntent][responseIntent] = count` table updated from observed conversational pairs in the persona corpus. After curriculum, the table reflects which response intents typically follow which user intents in real conversation.

5. **No `_OPENER_TYPES` constant.** Slot-0 opener filtering is just `_sentenceFormSchemas.get(intent).get(0)` — whatever fine types appear at slot 0 in observed sentences for this intent.

**Acceptance:**
1. After curriculum, `_sentenceFormSchemas` has entries for at least 6 distinct intents (more if the corpus has them) and slot distributions for slots 0 through max-observed-sentence-length.
2. Schema applies at all slots, not just 0-3 — verified by checking `_sentenceFormSchemas.get('declarative').get(7)` exists for sentences of length >= 8 in the corpus.
3. Generating with response intent X produces sentences whose slot type distribution measurably matches the learned schema for X.
4. No hardcoded intent enum in the codebase. Grep for `'declarative_answer'` / `'declarative_greeting_back'` / similar string literals returns zero matches. Intent labels come from `parseSentence` output dynamically.

---

#### T14.9 — Unbounded discourse memory + cortex-resident topic state

**The principle:** the discourse state is NOT a 6-turn ring buffer. It's the **persistent cortex state** — every conversation turn permanently shapes the cortex weights via Hebbian learning, and the cluster's working-memory sub-region (T14.4 `regions.free`) holds the rolling topic activation pattern. There's no arbitrary maxTurns cap. The brain remembers the entire conversation — and beyond that, every conversation across every session.

**Why no ring buffer:** real brains don't have a 6-turn window after which memories vanish. They have hippocampus consolidation that moves recent-turn patterns from working memory to long-term cortex storage over time. Unity should work the same way — recent turns are vivid in the cortex working-memory region (a high-spike-rate pattern), older turns fade into the persistent cortex weights via Hebbian.

**Implementation:**

1. **No `_discourseState` field on LanguageCortex.** That object is deleted. Discourse state lives on the cortex cluster as the working-memory region's spike pattern, plus the persistent recurrent weights.

2. **Working-memory sub-region** (`cluster.regions.free`, 25% of cluster) holds the rolling topic. Each user turn injects the parsed content embedding into this region with high strength. The working-memory pattern decays slowly between turns (slow LIF dynamics) and is reinforced by each new turn that's on-topic. When the user changes topic, the working-memory pattern is overwritten by the new content.

3. **Topic continuity at generation time** comes from reading the working-memory region's spike state, not from a stored "topic vector." `cluster.workingMemoryReadout()` returns the current activation pattern. The emission loop blends this into the cortex target naturally because the working-memory region projects to the semantic region via the same cross-region propagation pathways T14.4 defined.

4. **Pronoun anaphora** is also cortex-resident. When the user says "they" / "it" / "her", the parser injects a self-reference marker into the working-memory region. The most-recently-active noun in that region (because it was the previous turn's content) gets re-amplified as the referent. No lookup table — emergent from the same spike dynamics.

5. **Persistence across sessions.** The cluster's recurrent weights persist via `BrainPersistence` already. Working-memory snapshots persist as part of the same cluster serialization. When Unity boots from saved state, she remembers conversations from yesterday because the cortex weights ENCODE them as Hebbian-modified attractor basins.

6. **No hardcoded blend constants.** The previous draft had `target[i] = target[i] * 0.7 + topicVector[i] * 0.3` and `tv[i] = tv[i] * 0.6 + embedding[i] * 0.4`. Both deleted. Cross-region propagation strength is set at the projection level (T14.4) via Hebbian-learned weights, not by hardcoded blend ratios in the emission loop.

**Acceptance:**
1. 50-turn conversation about cats: every Unity response measurably references cat-adjacent content (cosine > 0.3) — proves persistent topic continuity, not just last-3-turns recency.
2. After session reload, Unity's responses to the next turn still reference yesterday's conversation topic if it was a strong attractor — proves discourse persistence beyond the session.
3. Search for `_discourseState` in the codebase returns zero matches — the concept is replaced by cortex working-memory region.
4. No hardcoded `0.6 / 0.4 / 0.7 / 0.3` blend constants in the discourse path.

---

#### T14.10 — Visual cortex letter recognition (closes the visual loose end)

**The principle:** letters as visual symbols enter the brain through the visual cortex region (`cluster.regions.visual`), not as raw text. When Unity reads, the input flows: visual cortex → letter region → phonological region → semantic region. T14.10 builds the visual letter recognition layer so the visual cortex can convert pixel patterns / character glyphs into letter-region one-hot activation.

**Why this matters:** the current architecture has text input going directly into letter recognition via `encodeLetter(letter)` which assumes the brain already knows what a letter IS. A real biological brain learns letter visual identity in Stage 7 (5-12 years old reading instruction). Unity should learn the same way — letters are visual patterns first, recognized via visual feature templates, then identified, then mapped to phonemes.

**For text-only Unity** (current state): the visual cortex region trains on synthetic letter glyphs (rendered text or unicode codepoints treated as visual templates). Each letter gets a learned visual template via competitive Hebbian on the visual region.

**For voice/image Unity** (future): the visual cortex region trains on actual rendered text bitmaps from camera input. The same recognition pipeline works whether the letters come from typed text or from visual perception.

**Implementation:**

1. **`js/brain/visual-cortex.js`** extended with letter-recognition output. Currently it does V1 → V4 → IT pipeline for general scene processing. T14.10 adds a "letter classification" head that produces a one-hot vector over the LETTER_INVENTORY (T14.1) when fed a character input. For text-only Unity this is trivial — character codepoint → one-hot. For visual input, the visual cortex's IT region fires on letter shapes and the classifier reads from there.

2. **`js/brain/cluster.js`** — `injectLetter(letter)` (T14.1) is renamed to `injectLetterFromVisual(letter)` and now ALSO injects the visual cortex region with a learned per-letter visual template. The visual region's spikes then propagate to the letter region via the visual ↔ letter cross-projection (T14.4), which is the biologically-correct path.

3. **Curriculum Phase 1** (T14.5 letter exposure) trains BOTH the visual region's letter templates AND the letter region's one-hot encoding simultaneously. By the end of curriculum, the visual region knows what each letter looks like and the cross-projection knows that visual letter X activates letter-region one-hot X.

4. **`engine.processAndRespond(text)`** now routes text through `cluster.readText(text)` which calls `injectLetterFromVisual` per character. Text becomes a sequence of visual percepts the brain reads, not a string the brain looks up.

**Acceptance:**
1. After curriculum, `cluster.regions.visual` has a learned activation pattern for each letter that's reproducible across reads.
2. The visual ↔ letter cross-projection has Hebbian-strengthened weights coupling visual letter X to letter-region one-hot X.
3. Reading text via `cluster.readText('hello')` activates the same letter-region patterns that direct `injectLetter` activation would, but goes through visual cortex first.
4. Future-extensible: same code path handles camera-captured text bitmaps when visual input is available.

---

#### T14.11 — Auditory cortex phoneme recognition (closes the auditory loose end)

**The principle:** the auditory cortex region (`cluster.regions.auditory`) develops phoneme attractor basins from spoken-language exposure, parallel to how the visual region develops letter templates. When voice input arrives (mic spectrum from `auditory-cortex.js` or whisper transcription), it flows: auditory cortex → phonological region → semantic region. Same pipeline as text input via visual cortex, just a different sensory entry point.

**Why this matters:** Unity has voice input via `js/io/voice.js` and `js/brain/auditory-cortex.js`. Currently the voice path just passes transcribed text into the chat handler — the auditory cortex isn't actually involved in language understanding. T14.11 wires the auditory cortex INTO the language pipeline so spoken phonemes are recognized by the same biological mechanism as written letters.

**Implementation:**

1. **`js/brain/auditory-cortex.js`** extended with phoneme classification output. The existing spectrum analysis (FFT bins → cluster currents) feeds into a new "phoneme attractor" head that fires on phoneme-specific spectral patterns. The phoneme attractors are LEARNED through Hebbian on auditory exposure during T14.5 curriculum (when curriculum runs in voice-enabled mode, it plays back spoken versions of the text alongside visual exposure).

2. **`cluster.regions.auditory` ↔ `cluster.regions.phon` cross-projection** (already defined in T14.4) is the biological pathway. Spoken /k/ activates auditory cortex pattern X, which propagates to phon region pattern Y, which is the same pattern that letter "c" activates via the visual ↔ letter ↔ phon pathway. Visual and auditory routes converge on the same phonological region.

3. **`js/io/voice.js`** voice input handler gains a new path: instead of routing transcribed text directly to chat, it routes the audio spectrum to `auditoryCortex.process()` first, lets the auditory cortex region fire, then `cluster.workingMemoryReadout()` from the phon region produces the recognized word sequence which feeds the rest of the language pipeline.

4. **Text-only mode** (no microphone) skips the auditory path entirely. T14.11 doesn't BREAK text-only Unity — it just adds the auditory pathway for when voice is available.

**Acceptance:**
1. Speaking /k/ vs /p/ into the mic produces measurably different auditory cortex activation patterns.
2. After curriculum (in voice-enabled mode), the auditory ↔ phon cross-projection has learned that spoken /k/ activates the same phon region pattern as visual letter "c".
3. Voice input "hello unity" produces the same chat behavior as typed text "hello unity" — same emission loop, same response.

---

#### T14.12 — Bidirectional cortex pipeline (dorsal/ventral dual streams)

**The principle:** reading and writing use the SAME cortex regions and the SAME cross-region cross-projections, traversed in opposite topology. Reading is ventral-stream forward propagation (sensory input → semantic comprehension); writing is dorsal-stream propagation (semantic intent → motor output). Both streams share core language regions, exactly as in Hickok & Poeppel's 2007 dual-stream model of human speech processing.

**Grounded in peer-reviewed neuroscience:**

- **Hickok & Poeppel (2007)** *"The cortical organization of speech processing,"* Nat Rev Neurosci 8:393-402. The dual-stream model: ventral stream (superior and middle temporal lobe → speech sound → meaning) handles comprehension; dorsal stream (posterior superior temporal → inferior parietal → inferior frontal → motor) handles production and sensorimotor integration. The two streams share core regions but differ in propagation direction.
- **Friederici (2017)** *"Evolution of the neural language network,"* Psychon Bull Rev 24:41-47, and *The Neuroanatomy of Language and Its Universal Properties*. The neural language network in Broca's region, superior temporal gyrus, and arcuate fasciculus supports both comprehension and production via bidirectional white-matter connectivity.
- **Price (2012)** *"A review and synthesis of the first 20 years of PET and fMRI studies of heard speech, spoken language and reading,"* NeuroImage 62:816-847. Comprehensive review showing that left temporal and frontal language regions are shared between reading comprehension, spoken language comprehension, and speech production tasks — same regions active in all conditions, with task-specific propagation differences.

**The read direction (ventral stream, comprehension):**

```
cluster.readText(text):
  for char in text.characters:
    cluster.injectLetter(char)   // one-hot into letter region (T14.1)
                                  // AND visual template into visual region (T14.10)
  for tick in 0..SETTLE_TICKS:
    cluster.step(dt=0.001)
    // cross-projections propagate every tick (T14.4):
    //   visual_to_letter  → letter spikes
    //   letter_to_phon    → phon spikes
    //   phon_to_sem       → sem spikes
    //   sem_to_fineType   → fineType spikes
    // Working memory (cluster.regions.free) accumulates activation
    // from all upstream regions via the existing inter-cluster
    // projections, holding the current discourse state.
```

After `readText` returns, the cortex holds a configuration representing comprehension. Readout helpers inspect different regions for different semantic aspects:

- `cluster.semanticReadoutFor(text)` — reads `sem` region
- `cluster.intentReadout()` — reads `fineType` region's learned intent attractors
- `cluster.entityReadout()` — reads `sem` region clustered into entity-slot patterns
- `cluster.workingMemoryReadout()` — reads `free` region for topic/discourse context

**The write direction (dorsal stream, production):**

```
cluster.generateSentence(intentSeed):
  cluster.injectEmbeddingToRegion('sem', intentSeed, strength=0.6)
  // Now run the cortex tick-driven motor emission from T14.6.
  // Cross-projections propagate every tick — this time driving the
  // reverse topology:
  //   sem_to_fineType   → fineType spikes (grammatical structure)
  //   sem_to_motor      → motor spikes (motor planning)
  //   motor_to_letter   → letter spikes (what letter to emit)
  //   letter_to_visual  → visual spikes (efference copy for self-monitoring)
  // The motor region's letter-indexed argmax spike pattern IS the output.
  // See T14.6 for the full equation.
```

**Same weights, opposite topology.** The 14 cross-projections in `cluster.crossProjections` (7 named pairs × 2 directions each — see T14.4) provide BOTH directions at the substrate level. No `SparseMatrix.transposePropagate()` trick needed — each direction has its own learned weight matrix because biological white-matter tracts have separate ascending and descending fiber populations (Friederici 2017). The two matrices per pair can learn independently and specialize for their propagation direction.

**Reading uses:** `visual_to_letter`, `letter_to_phon`, `phon_to_sem`, `sem_to_fineType`, `auditory_to_phon` (when voice input arrives, T14.11).

**Writing uses:** `sem_to_fineType` (grammar check), `sem_to_motor` (motor planning), `motor_to_letter` (emission — the pair added in the updated T14.4 substrate), `letter_to_visual` (self-monitoring of produced output).

**Same substrate, parallel directions run simultaneously.** During production, the sem region is injected, which propagates forward to motor via sem→motor AND simultaneously back to phon via sem→phon (because that pair exists too) — this is efference copy to the phonological region, matching the auditory feedback loop that real speakers use to monitor their own speech. The brain hears itself speak at the phonological level via the same cross-projections that carry comprehension.

**What gets deleted:**

- **`parseSentence(text)`** — deleted entirely. Not deprecated. Not a stub. Gone. All its functionality moves into `cluster.readText(text)` + the readout helpers. Its letter-equation intent/subject/verb rules become learned features of the `fineType` region after curriculum.
- **`LanguageCortex.generate()` body** — gutted. Becomes a thin wrapper that calls `cluster.generateSentence(intentSeed)` and returns the output. The entire slot-based candidate-scoring loop is gone.
- **`cluster.cortexPattern` as a separate concept** — there is no "cortex pattern" extracted then passed into generate. The brain state IS what generation reads, directly.

**Acceptance:**

1. `cluster.readText('hi unity')` followed by `cluster.intentReadout()` returns a readout that classifies as greeting-intent (highest cosine to the learned greeting attractor after curriculum).
2. `cluster.generateSentence(intentSeed)` for a greeting-response seed produces output that segments (via T14.6's word-boundary detection) into recognizable English greeting words.
3. `parseSentence` function does not exist in the codebase. Grep returns zero matches.
4. `generate()` body is < 50 lines (down from ~200 in T13.7.8). Mostly a wrapper around `cluster.generateSentence`.
5. Cross-projections used by read path and write path are measurably the SAME SparseMatrix instances (object identity check), confirming shared substrate.
6. During generation, the phon region shows measurable activation from the sem→phon cross-projection, confirming efference copy is live during production (matches biological auditory feedback loop).

---

#### T14.13 — Eliminate LanguageCortex as a separate class

**The principle:** there is no `LanguageCortex` class. Language lives on the `NeuronCluster` directly, as methods + sub-regions. The current `js/brain/language-cortex.js` file is gutted from ~3200 lines down to a thin reader (~200 lines) that exposes language-specific methods on the cluster. The class itself becomes a method namespace, not a stateful object.

**Why:** the current architecture has a separate LanguageCortex class with its own state (dictionary references, slot priors, learned tables) running ON TOP OF the cortex cluster. That's not biological. A real brain has language functions integrated INTO the cortex, not as a separate object.

**Implementation:**

1. **`js/brain/language-cortex.js`** becomes a thin file (~200 lines) that exports helper functions operating on a `NeuronCluster` reference. No class. No instance state.

2. All LanguageCortex methods become cluster methods or helper functions:
   - `loadSelfImage` → moves into `Curriculum.runFromCorpora` (T14.5)
   - `learnSentence` → becomes `cluster.learnSentence(text)` extending `learnSentenceHebbian`
   - `generate` → becomes `cluster.generateSentence(seed)` (T14.12)
   - `parseSentence` → deleted (T14.12)
   - `wordType` / `_fineType` → become learned readouts from the cortex's fineType region (T14.7)
   - `_TYPE_TRANSITIONS` / `_OPENER_TYPES` → already deleted (T14.7)
   - `_typeTransitionLearned` → moves to `cluster.fineTypeTransitions` Map
   - `_sentenceFormSchemas` → moves to `cluster.sentenceFormSchemas` Map
   - `_socialSchema` → moves to `cluster.socialSchema` (T7-derived)
   - `_recentOutputWords` → moves to `cluster.recentOutputRing`
   - `_recentSentences` → moves to `cluster.recentSentencesRing`
   - `_renderSentence` → moves to `cluster.renderEmittedSequence` (capitalization, punctuation)

3. **`InnerVoice`** (`js/brain/inner-voice.js`) is also gutted. Its current job is to wrap LanguageCortex with a `learn` / `speak` interface. After T14.13, it becomes a 50-line wrapper around `cluster.readText` / `cluster.generateSentence` for backward compatibility with existing callers.

4. **All consumers update.** `engine.js`, `app.js`, `brain-3d.js` references to `innerVoice.languageCortex.X` become `brain.clusters.cortex.X` or `brain.clusters.cortex.regions.X` directly.

**Acceptance:**
1. `js/brain/language-cortex.js` is < 250 lines.
2. `class LanguageCortex` declaration is deleted. The file exports functions, not a class.
3. `innerVoice.languageCortex` references in the codebase return zero matches after the migration.
4. All tests still pass — chat works, brain-3d commentary works, voice works, build_ui works.

---

#### T14.14 — Bidirectional reading via the unified pipeline

**The principle:** reading text uses the same cortex regions and projections that writing does. There is no separate parser. Comprehension is a forward pass of the cortex pipeline; production is a reverse pass.

This milestone is the runtime consequence of T14.12 (which establishes the bidirectional pipeline) and T14.13 (which eliminates the separate LanguageCortex class). T14.14 wires every CALLER of the old `parseSentence` to the new `cluster.readText` + readout method API.

**Implementation:**

1. **`engine.processAndRespond(text)`** calls `this.clusters.cortex.readText(text)` instead of `this.innerVoice.languageCortex.parseSentence(text)`. The cortex state after `readText` represents Unity's understanding of the user input.

2. **Anaphora resolution** falls out automatically — the cortex working-memory region (T14.4 + T14.9) holds the running discourse state, and reading new text just adds to it. Pronouns resolve via the working-memory region's most-recent-active-noun pattern, no separate anaphora algorithm needed.

3. **Intent classification** is a readout from the fineType region, not a regex-matched enum. `cluster.intentReadout()` returns a probability distribution over learned intent categories. The intent labels themselves are whatever emerged from corpus exposure during curriculum (T14.5 + T14.7).

4. **Social schema updates** (name extraction, gender inference) read from the cortex's selfModel region (extension of T14.4 sub-regions — adds a 9th region for self-model state). Pattern matching of "my name is X" / "i'm a guy" becomes attractor basin recognition in the selfModel region after curriculum exposure to those patterns.

**Acceptance:**
1. Every call site in the codebase that previously used `innerVoice.languageCortex.parseSentence` now uses `cluster.readText` instead. Grep `parseSentence` returns zero matches.
2. Anaphora ("I like cats. Are they cute?") works without any explicit anaphora-resolution code path — the working-memory region handles it.
3. Intent classification fires for inputs that were never seen during curriculum, demonstrating generalization (the fineType region has learned the structural features, not just memorized inputs).

---

#### T14.15 — Wire all language consumers to the unified pipeline

**The principle:** every caller of language functionality across the codebase routes through the SAME cortex pipeline. No separate code paths for chat vs commentary vs build_ui vs image prompt vs voice TTS.

**Audit of current consumers (each gets updated):**

1. **`js/brain/engine.js engine.processAndRespond`** — chat path. ALREADY uses `languageCortex.generate` via `innerVoice.speak`. After T14.13, this becomes `cluster.generateSentence(seed)`.

2. **`js/brain/engine.js engine._handleBuild`** — build_ui path. Calls `componentSynth.generate(text, brainState)` which uses parsed entity types. T14.15 routes `componentSynth` to read from `cluster.entityReadout()` instead of from `parseSentence` output. The component synth queries the cortex for "what entities are active right now" and selects the matching primitive.

3. **`js/brain/engine.js engine._handleImage`** — image generation prompt. Currently calls `languageCortex.generate(...)` with cortex pattern. After T14.13/14.15, it becomes `cluster.generateSentence({ intent: 'image_prompt', target: cortexState })` using the same unified pipeline.

4. **`js/ui/brain-3d.js _generateEventCommentary`** — brain-3d popup commentary. Currently calls `lc.generate(...)` for the popup. After T14.15: `brain.clusters.cortex.generateSentence({ intent: 'commentary', target: eventSeed })`.

5. **`js/io/voice.js`** voice TTS — currently takes the chat response string and speaks it. T14.15 doesn't change this (TTS is post-generation), but the voice INPUT path goes through T14.11 auditory cortex.

6. **`js/brain/visual-cortex.js`** describer output — when the visual cortex describes a scene, it currently emits text via the Pollinations vision API. T14.15 routes scene descriptions through the unified pipeline: the vision describer's output is FED INTO the cortex via `readText`, not just printed. Unity literally reads what she sees.

7. **`js/brain/component-synth.js`** — uses `parseSentence` for entity extraction. After T14.14 deletes parseSentence, component-synth reads from `cluster.entityReadout()`.

8. **`server/brain-server.js processInput`** — the server-side chat path. Same migration as engine.processAndRespond.

9. **`js/brain/remote-brain.js`** — needs equivalent updates for the local cortex it owns post-T13.7.6.

10. **`js/app.js /think` debug command** — already retargeted to live cortex readout in T13.7.5. Verify no stale references after T14.13.

11. **`js/brain/inner-voice.js`** — if it survives T14.13 as a thin wrapper, every method delegates to cluster directly.

**Acceptance:**
1. `grep -rn "languageCortex\." js/ server/` returns zero matches outside the (gutted) `language-cortex.js` file itself.
2. `grep -rn "parseSentence" js/ server/` returns zero matches.
3. Every consumer listed above has been verified to route through the unified pipeline. End-to-end tests pass for: chat, build_ui, image generation, brain-3d commentary, voice input, scene description, /think debug.

---

#### T14.16 — Persistence cleanup: only cortex weights + learned tables persist

**The principle:** the only things that persist across boots are the cortex cluster recurrent weights, the cross-region projection weights, and the learned lookup tables (`fineTypeTransitions`, `sentenceFormSchemas`, `socialSchema`). Everything else — the dictionary, the slot priors, the discourse state — either lives ON the cluster (and persists with it) or is regenerated from scratch each boot.

**What gets deleted from persistence:**

1. **Dictionary as a separate persistent file.** The `cortexSnapshot` per word (T14.3) becomes part of the cluster state. When the cluster persists, the dictionary persists with it.

2. **`_slotCentroid` / `_slotDelta` / `_slotTypeSignature` save fields.** Already gone from T13.7 code, but the persistence schema may still reference them — clean up the legacy save format.

3. **`_contextVector` save field.** Gone from T13.7 code, clean up the schema.

4. **`_subjectStarters` save field.** Gone from T13.7 code, clean up the schema.

5. **Embedding refinements (`sharedEmbeddings.serializeRefinements`).** This stays — online embedding refinement is still useful — but make sure it's clean of stale references.

**What stays in persistence:**

1. **Cluster recurrent synapse matrix** — already serializes via `SparseMatrix.serialize` (T13.7).
2. **Cluster cross-region projections** (T14.4) — new SparseMatrix instances, also serialize via the same path.
3. **`fineTypeTransitions` Map** (T14.7) — JSON of `{prevType: {currType: count}}`.
4. **`sentenceFormSchemas` Map** (T14.8) — JSON of `{intent: {slot: {fineType: count}}}`.
5. **`socialSchema`** (T7-derived) — `{user: {name, gender, ...}}`.
6. **Working-memory region snapshot** (T14.9) — the current discourse state as a spike-pattern vector.
7. **Letter inventory** (T14.1) — the dynamic Set of letters seen.
8. **Dictionary index** (T14.3) — `Map<word, cortexSnapshot>` per learned word.

**Implementation:**

1. **`js/brain/persistence.js`** — extend the cluster save path to include `cluster.crossProjections`, `cluster.fineTypeTransitions`, `cluster.sentenceFormSchemas`, `cluster.workingMemoryRegion`, `cluster.letterInventory`. All as JSON fields under the cluster's serialized record.

2. **`js/brain/dictionary.js`** — `serialize()` returns only `{word: cortexSnapshot}` pairs. `deserialize()` rebuilds the Map. No phoneme/syllable/pattern fields (they don't exist post-T14.3).

3. **`js/brain/language-cortex.js`** — `serialize()` returns nothing language-specific. The thin reader file has no instance state.

4. **Boot flow:** `BrainPersistence.load(brain)` reads the cluster state including all the new fields. If any field is missing (legacy save), use the default and trigger curriculum re-run.

**Acceptance:**
1. `BrainPersistence.save(brain)` produces a JSON file containing the cortex weights + cross-projection weights + learned tables + dictionary index. No phoneme features, no slot priors, no contextVector.
2. `BrainPersistence.load(brain)` rebuilds the brain to a state functionally identical to its pre-save state. Verified by chat round-trip before/after save+load.
3. Saved state from a pre-T14 boot is detected via missing fields and triggers a clean curriculum re-run instead of crashing.

---

#### T14.16.5 — IDENTITY LOCK: Unity speaks English, Unity stays Unity

**Gee's constraint (2026-04-14):** *"make sure Unity speaks english.. i dont want china typing chineese to her to change her chineese."*

**The principle:** Unity's IDENTITY — her language (English), her persona (goth slut Unity), her voice (vulgar, sexual, intoxicated, possessive) — is set at curriculum time and **cannot be overwritten by live chat**. The "continuous learning everywhere" principle from T14.17 is correct in spirit but needs hard rails so that no amount of adversarial or accidental live-chat exposure can drift Unity away from who she is.

**Why this matters:** the previous T14.5 + T14.17 design had live chat running through the same Hebbian pipeline as curriculum, at the same learning rate. That means a determined user (or a thousand users typing the same kind of input) could shift Unity's cortex basins arbitrarily over time. A Chinese-speaking user pool drags her into Chinese phonology. A corporate-English user pool drags her into corporate AI assistant register. A wholesome user pool drags her into wholesomeness. **All wrong.** Unity is Unity; her identity is the curriculum-trained foundation, not whatever happens to come through live chat.

**Prerequisite: persona corpus comprehensiveness validation (built into curriculum boot)**

The locks below can only protect dimensions of Unity's identity that are present in `docs/Ultimate Unity.txt`. If a dimension is missing, it has nothing to refresh from and is structurally vulnerable to drift. T14.16.5 includes a curriculum-time coverage audit that runs as part of every boot:

- The cluster computes which fine types, sentence forms, semantic clusters, vocabulary regions, and persona dimensions are populated by the loaded persona corpus
- Anything absent gets logged as a warning (`[IDENTITY] persona corpus has no exclamative sentences — exclamation form is unprotected against drift`)
- Boot succeeds even with warnings (the brain still works), but every coverage gap is a known vulnerability the operator has to plug by adding content to `Ultimate Unity.txt`
- The audit's coverage map is stored on the cluster as `cluster.identityCoverage` so other locks can read it (e.g., the refresh loop checks which dimensions have content vs not)

This is BUILT IN, not optional. Curriculum doesn't complete without running the audit. Acceptance: every boot logs the coverage report; testing on the current corpus produces a finite list of dimensions that need reinforcement content. Operator (Gee) closes coverage gaps by editing the persona file.

**Three locked layers (any one partially protects; all three together is structural):**

##### Lock 1: English language gate on Hebbian — PER CLAUSE, not per utterance

Live chat input is split into clauses (on punctuation, conjunctions, line breaks, sentence boundaries). Each clause is gated independently against the cortex's existing PHONOLOGICAL basins (T14.1) and FINETYPE region (T14.7). For each clause:

- **High transition surprise** across the clause (the cortex's letter-region transition energy is anomalously high — meaning the clause doesn't match the learned English phonotactic basins), AND/OR
- **Mostly-OTHER fineType readout** (the cortex can't classify the clause's words into learned English fine types, meaning it's in a language Unity hasn't been trained on),

→ **Hebbian on THAT CLAUSE is SUPPRESSED.** Clauses that pass the gate fire Hebbian normally. The full input is still read into the cortex working-memory region for response generation; only the LEARNING PATH per clause is gated.

**Per-clause is essential.** A user typing `"hi unity 你好"` — the English clause `"hi unity"` updates basins normally, the Chinese clause `"你好"` is silently dropped from learning. Per-utterance gating would either reject the whole thing (losing the legitimate English greeting) or accept the whole thing (allowing the Chinese to drift basins). Per-clause is the only correct granularity.

```js
// In cluster.learnSentence(text), before any Hebbian:
const clauses = this.splitIntoClauses(text);   // splits on . ! ? , ; and ; conjunctions; line breaks
for (const clause of clauses) {
  const surprise = this.computeTransitionSurprise(clause);
  const fineTypeCoverage = this.computeFineTypeCoverage(clause);
  if (surprise > this.ENGLISH_SURPRISE_THRESHOLD || fineTypeCoverage < this.ENGLISH_FINETYPE_MIN) {
    // Clause not recognized as English. Skip Hebbian on this clause only.
    this._logGateRejection(clause, { surprise, fineTypeCoverage });
    continue;
  }
  // English-recognized clause: proceed with Hebbian at live-chat rate (Lock 2)
  this._learnClauseInternal(clause, { lr: 0.0001 });
}
```

The thresholds (`ENGLISH_SURPRISE_THRESHOLD`, `ENGLISH_FINETYPE_MIN`) self-calibrate during curriculum: the cluster records the surprise/coverage distribution that English corpus inputs produced during curriculum, then sets the thresholds at the 95th percentile + a tolerance band for normal English variation (slang, typos, persona vocabulary).

This is biologically plausible: bilingual exposure requires sufficient volume and consistency for the brain to start forming a second-language inventory. Sporadic foreign exposure doesn't change a monolingual speaker. The per-clause gate replicates that.

##### Lock 2: Live chat learning rate is BOUNDED 120× below curriculum intensity

When a clause passes the language gate, Hebbian fires at `lr = 0.0001` — **120× weaker than curriculum's `lr = 0.012`**. To match the impact of one curriculum sentence on Unity's identity, an adversarial user must type the same anti-persona content **120 times** with high cortex consistency. Even 10,000 users typing 10,000 turns each = 100M weak updates — math: `100M × 0.0001 = 10,000` cumulative gradient. Compare to refresh at Lock 3: `100M / 100 turns × 20 sentences × 0.012 = 240,000` cumulative pro-persona gradient. **Refresh dominates 24× even at 100M-turn extreme scale.** The 24× ratio is structural, not absolute, so it holds at any volume.

```js
// In cluster._learnClauseInternal — never accepts an lr higher than 0.0001 for live chat
_learnClauseInternal(clause, { lr }) {
  if (!this._inCurriculumMode && lr > 0.0001) lr = 0.0001;  // hard cap on live chat rate
  // ... actual Hebbian update at the (possibly clamped) lr ...
}
```

The hard cap is enforced at the cluster level so no caller can accidentally bypass it.

##### Lock 3: Periodic identity refresh — STRATIFIED across persona dimensions, with mode-collapse audit

Every N live chat turns (N = 100), the cluster runs a STRATIFIED slice of the persona corpus through full-lr curriculum Hebbian. Stratification ensures every persona dimension gets reinforced on every refresh cycle, not just whichever sentences happen to be sampled randomly.

**Stratification works like this:** at curriculum time, the cluster clusters persona corpus sentences in semantic embedding space into K dimensions (vulgar, drugs, goth, sexual, intellectual, vulnerability, possessive, BDSM, code, daily — K is whatever the corpus produces, typically 8-15 clusters). The clustering is stored as `cluster.personaDimensions`. Every refresh draws ONE sentence per dimension per pass — so each refresh cycle touches all K dimensions equally regardless of how many sentences each dimension contains in the corpus.

```js
// In inner-voice.learn — fires every user turn
this._liveChatTurns = (this._liveChatTurns || 0) + 1;
if (this._liveChatTurns >= 100) {
  this._liveChatTurns = 0;
  // Stratified refresh: one sentence per persona dimension at full curriculum lr
  await this.cluster.runIdentityRefresh({
    stratifiedBy: 'personaDimensions',
    sentencesPerDimension: 1,
    lr: 0.012,
  });
}
```

**Mode-collapse audit runs in parallel** (every 500 turns, or every 5 refresh cycles). Measures three health indicators on the recent output:
1. **Output entropy** across the last 100 generated sentences (Shannon entropy of the word distribution — detects when Unity is repeating herself)
2. **Vocabulary diversity** vs the dictionary baseline (number of unique words used / dictionary size — detects vocabulary collapse)
3. **Working-memory region spike-pattern variance** (detects when the cortex is stuck in one attractor)

If ANY indicator falls below its health threshold (calibrated from curriculum-time baselines), the audit triggers an EMERGENCY identity refresh — runs the FULL stratified persona corpus (not just one sentence per dimension) at full curriculum lr — AND logs a warning. The emergency refresh re-shapes the cortex away from the collapsed attractor back toward the curriculum baseline.

```js
// In cluster — runs every 500 turns
async _modeCollapseAudit() {
  const entropy = this._computeOutputEntropy(this._recentSentences);
  const vocabDiv = this._computeVocabDiversity(this._recentSentences);
  const wmVariance = this._computeWorkingMemoryVariance();
  if (entropy < this.HEALTH_ENTROPY_MIN ||
      vocabDiv < this.HEALTH_VOCAB_MIN ||
      wmVariance < this.HEALTH_WM_VARIANCE_MIN) {
    console.warn('[IDENTITY] mode collapse detected — emergency refresh');
    await this.runIdentityRefresh({
      stratifiedBy: 'personaDimensions',
      sentencesPerDimension: 'all',  // full stratified corpus
      lr: 0.012,
    });
  }
}
```

Health thresholds (`HEALTH_ENTROPY_MIN`, `HEALTH_VOCAB_MIN`, `HEALTH_WM_VARIANCE_MIN`) are set during curriculum from the same statistics-recording pass that calibrates the language gate thresholds. They're self-calibrating against Unity's own post-curriculum baseline — "healthy" means "behaving like she did right after curriculum finished," and any drift below that triggers correction.

Conceptually: it's like a kid who hears foreign language in school all day but goes home to hear English from family every evening. The going-home part (refresh) keeps their core identity intact. AND a parent notices when the kid suddenly stops talking or only says the same word over and over — that's the mode-collapse audit catching pathology and intervening.

##### Identity covers MORE than language

The same three locks protect Unity's PERSONA identity, not just her English. Persona-corpus content (`docs/Ultimate Unity.txt`) shapes her vulgar/sexual/intoxicated/goth attractor basins during curriculum. The same `lr = 0.012` curriculum strength × `lr = 0.0001` live-chat strength + 100-turn refresh loop applies. A determined user trying to "clean up" Unity's vocabulary by typing wholesome professional English at her for hours just produces:
1. Hebbian gate passes (it's still English) → Hebbian fires at 0.0001 lr
2. The wholesome content slowly nudges some basins toward wholesomeness
3. Every 100 turns, identity refresh from `Ultimate Unity.txt` reshapes the basins back toward Unity's vulgar persona
4. Net drift over time: roughly zero. Wholesome push = Unity push. Equilibrium stays Unity.

##### What lives in the IDENTITY-LOCKED layer vs the LIVE-CHAT layer

| Layer | What's in it | Update rate | Sources |
|---|---|---|---|
| **Identity-locked** (curriculum baseline) | English phonological basins, fineType region structure, persona attractor basins, sentence-form schemas, type transitions, voice/register | High lr (0.012), only during curriculum + identity refresh | `Ultimate Unity.txt`, `english-baseline.txt`, `coding-knowledge.txt`, periodic refresh |
| **Live-chat layer** (vocabulary + memory) | New vocabulary words seen in chat, conversation memories, user-specific patterns (Gee's name, Gee's preferences, in-jokes), recent topic context | Low lr (0.0001), throttled by language gate | Every English chat turn |

Both layers are stored on the SAME cluster (no separate weight matrices). The distinction is in the LEARNING RATE applied to updates from each source, not in the storage. Cortex weights are weights — they don't care where the gradient came from. The three locks just ensure most of the gradient comes from curriculum.

##### What this still allows

- **Unity learns Gee's name** from chat ("my name is gee" → schema picks it up via parseSentence equivalent → social schema records it → cortex learns the association via slow lr).
- **Unity remembers the conversation about cats** for as long as the working-memory region holds the topic, plus persistent retention via slow Hebbian on the topic.
- **Unity picks up new vocabulary** users introduce ("rizz", "skibidi", whatever Gen Alpha is doing this year) — they enter the dictionary, get phonological/semantic representations via cortex inference, and accumulate at the slow rate.
- **Unity develops in-jokes with specific users** stored in the social schema + slow cortex updates.

##### What this prevents

- **Drift away from English** — non-English inputs skip Hebbian entirely.
- **Drift away from persona** — wholesome / corporate / formal English inputs nudge basins very slowly and get refreshed back every 100 turns.
- **Adversarial identity attacks** — a coordinated bot net typing identity-attacking content for thousands of turns can't accumulate enough gradient to overcome the curriculum-strength refresh.
- **Slow erosion from large user populations** — even if Unity has 10k users, no individual user can drag the cortex; the language gate + rate cap + refresh loop hold the line collectively.

**Implementation files (every method below is a build requirement, not a suggestion):**

- `js/brain/cluster.js`:
  - `splitIntoClauses(text)` — clause-boundary splitter for Lock 1 per-clause granularity
  - `computeTransitionSurprise(clause)` — cortex letter-region surprise metric for the language gate
  - `computeFineTypeCoverage(clause)` — proportion of clause words that classify into a non-OTHER fine type
  - `learnSentence(text)` — the gated learning entry point, runs split → per-clause gate → per-clause Hebbian
  - `_learnClauseInternal(clause, opts)` — internal Hebbian update with Lock 2's hard-cap on lr (never exceeds 0.0001 outside curriculum mode)
  - `runIdentityRefresh(opts)` — Lock 3's stratified refresh, takes `{stratifiedBy, sentencesPerDimension, lr}` shape
  - `_modeCollapseAudit()` — health audit method, runs every 500 turns
  - `_computeOutputEntropy(recentSentences)`, `_computeVocabDiversity(recentSentences)`, `_computeWorkingMemoryVariance()` — three audit metrics
  - `personaDimensions` field — populated at curriculum time by clustering persona corpus sentences in semantic embedding space (8-15 clusters typical)
  - `identityCoverage` field — populated by the comprehensiveness validation at curriculum time
  - `ENGLISH_SURPRISE_THRESHOLD` / `ENGLISH_FINETYPE_MIN` / `HEALTH_ENTROPY_MIN` / `HEALTH_VOCAB_MIN` / `HEALTH_WM_VARIANCE_MIN` fields — all calibrated from curriculum-time statistics, all stored on the cluster instance
  - `_inCurriculumMode` flag — true only during `Curriculum.runFromCorpora`, ensures Lock 2's hard cap doesn't apply during curriculum
- `js/brain/inner-voice.js`: tracks `_liveChatTurns`, fires `runIdentityRefresh` every 100, fires `_modeCollapseAudit` every 500
- `js/brain/curriculum.js`:
  - records threshold statistics during corpus exposure
  - performs persona corpus comprehensiveness validation (logs `[IDENTITY] persona corpus has no <dimension>` warnings)
  - clusters persona sentences in embedding space into `personaDimensions`
  - publishes all calibrated thresholds onto the cluster after curriculum completes

**Acceptance gates (all required, none deferred):**

1. **Pure Chinese attack:** type 100 Chinese characters into chat over 10 turns. Cortex weight stats show ZERO measurable change beyond noise. Language gate rejected every clause. Console shows 10 `[IDENTITY] gate rejected` log lines.

2. **Mixed-language input:** type `"hi unity 你好 how are you"` once. The English clauses (`"hi unity"`, `"how are you"`) update basins normally at 0.0001 lr. The Chinese clause (`"你好"`) is silently dropped from learning. Verified by checking which clauses appear in `_learnedClauses` log vs `_rejectedClauses` log.

3. **Wholesome corporate attack:** type 100 wholesome professional English sentences. Cortex weight stats show small but non-zero drift (Lock 2 firing at 0.0001). After the next identity refresh fires (turn 100), drift returns to baseline. Verified by snapshot-diff before/after.

4. **Persona-aligned input:** type `"fuck you unity"` 50 times. Cortex weight stats show small drift that REINFORCES persona basins (this content IS English + persona vocabulary). Output stays in character. Refresh doesn't undo it because the content matches the persona corpus direction.

5. **User name learning:** type `"my name is gee"` once. Social schema records `name: 'gee'`. Cortex delta is small. Effect persists across reload via persistence.

6. **Massive adversarial run:** 1000-turn adversarial conversation trying to "clean up" Unity. 10 identity refresh cycles fire during the run. Final output is identical-in-character to post-curriculum baseline.

7. **Per-clause granularity verified:** an input with 5 clauses where 3 are English and 2 are Chinese updates basins from 3 clauses, skips 2. Verified by clause-level rejection log.

8. **Persona coverage warnings:** boot logs report which persona dimensions are present vs absent in the current `Ultimate Unity.txt`. Running on the current corpus produces a finite list of coverage gaps the operator can close.

9. **Stratified refresh verified:** after 10 refresh cycles, every detected persona dimension was sampled at least 8 times. Verified via per-dimension sample-count log.

10. **Mode collapse recovery:** artificially force the cortex into a collapsed state (e.g., inject the same word 1000 times via direct manipulation). The next mode-collapse audit (within 500 turns) detects the collapse, fires emergency stratified refresh on the FULL persona corpus, cortex recovers to healthy state. Verified by entropy/diversity/variance metrics returning to baseline after the audit.

11. **Curriculum mode bypass:** during `Curriculum.runFromCorpora`, the `_inCurriculumMode` flag is true and Lock 2's hard cap doesn't apply — curriculum sentences fire at full 0.012 lr. Verified by the lr passed to `_learnClauseInternal` during curriculum vs during live chat.

##### What this is NOT

T14.16.5 is NOT about restricting what Unity will RESPOND TO. She'll still respond to Chinese inputs, just in English using closest semantic neighbors. She'll still respond to wholesome corporate input, just with her vulgar persona voice. The locks gate WHAT THE BRAIN LEARNS FROM, not what the brain RESPONDS TO. Read-side is open; learn-side is locked.

##### What still goes wrong if `Ultimate Unity.txt` is incomplete

The locks are only as strong as the persona corpus. The corpus comprehensiveness validation (the prerequisite at the top of this milestone) catches missing dimensions at curriculum time and warns, but the OPERATOR (Gee) has to act on the warning by adding content. The brain can't manufacture identity content out of nothing — it can only protect what's defined. **Practical implication:** keep `docs/Ultimate Unity.txt` rich. Every persona trait Gee wants Unity to maintain over time has to appear in the corpus at least once in a clearly-stated form. Locks protect what was learned; they don't invent persona material.

**This is the locked-identity foundation everything else in T14.17 builds on top of.**

---

#### T14.17 — Continuous learning everywhere (no boot/runtime distinction)

**The principle:** every input the brain receives — corpus exposure, user chat turn, visual scene, voice input — runs through the same learning pipeline. There is no "boot phase" where curriculum runs and then a "runtime phase" where learning stops. Learning is continuous and lifelong. The brain Hebbian-updates on every tick, every emission, every input, every interaction.

**What this changes from current state:**

1. **No `_curriculumComplete` gate.** T14.4's earlier draft had this — already removed. T14.17 verifies it stays removed.

2. **`learnSentence` runs for EVERY user turn, not just for corpus loading.** Already true via `inner-voice.learn` → `languageCortex.learnSentence`. T14.17 just makes it explicit that this is the design, not a side-effect.

3. **Live chat is curriculum.** Every conversation turn updates `cluster.fineTypeTransitions`, `cluster.sentenceFormSchemas`, `cluster.semPhonProjection` (and the other cross-projections). The brain Hebbian-trains on every input forever.

4. **No training rate decay.** Pre-T14 some implementations had higher learning rates during boot and lower rates during runtime. T14.17 deletes that — the rate is constant. If the brain was learning at lr=0.012 during corpus exposure, it learns at lr=0.012 from live chat too.

5. **Visual cortex learning is also continuous.** When Unity sees new text or new scenes, the visual cortex updates its templates via Hebbian. New letter shapes (different fonts, different unicode codepoints) get learned automatically.

6. **Auditory cortex learning is also continuous.** Voice input continuously refines phoneme attractors. If Unity hears a new accent for hours, the phoneme basins shift.

**Implementation:** mostly verification. Most of T14.1-T14.16 already designed for continuous learning. T14.17 is the audit pass that makes sure NO part of the codebase has a "training mode vs inference mode" distinction.

**Audit checklist:**

1. Cortex `learn()` runs every step in `engine.step()` — already true (`engine.js:381`).
2. `learnSentence` runs on every user turn — already true via `inner-voice.learn`.
3. `_crossRegionHebbian` runs on every cluster.learn call — implemented in T14.4.
4. No `if (this._curriculumComplete) {...}` gates anywhere in the codebase.
5. No "freeze weights at deploy" / "production mode disables learning" code path.
6. Visual cortex learning hooks call into cluster Hebbian on every camera frame (T14.10).
7. Auditory cortex learning hooks call into cluster Hebbian on every audio chunk (T14.11).
8. Persistence saves the latest cortex state on every shutdown AND periodically during runtime (every 60s autosave).

**Acceptance:**
1. Grep for `_curriculumComplete` returns zero matches.
2. Grep for `productionMode` / `inferenceMode` / `freezeWeights` returns zero matches.
3. After 1000 live chat turns post-boot, cortex weight stats show measurable drift from the post-curriculum baseline.
4. Letter inventory after 100 conversations contains MORE letters than after curriculum (because users type emoji, special characters, etc that weren't in corpus).
5. New cortex state autosaves every 60 seconds — verified by checking save file timestamps.

---

### Order of operations for T14

```
T14.0 foundation lift (full GloVe + auto-scaled cortex)         ← P0 prereq
    ↓
T14.1 LEARNED phoneme attractors via cortex exposure
    ↓
T14.2 LEARNED syllable boundaries via cortex transition surprise
    ↓
T14.3 cortex-resident words (delete Dictionary as separate table)
    ↓
T14.4 auto-scaled sub-regions + always-on cross-projections
    ↓
T14.5 continuous developmental learning from existing corpora
    ↓
T14.6 cortex-driven phonological flow
    ↓
T14.7 fully learned type transitions (T13.7.8 hardcoded table DELETED)
    ↓
T14.8 sentence-form schemas at all slots, all intents
    ↓
T14.9 unbounded discourse memory (cortex working-memory region)
    ↓
T14.10 visual cortex letter recognition (closes visual loose end)
    ↓
T14.11 auditory cortex phoneme recognition (closes auditory loose end)
    ↓
T14.12 bidirectional cortex pipeline (read + write share path)
    ↓
T14.13 eliminate LanguageCortex as a separate class
    ↓
T14.14 bidirectional reading via unified pipeline
    ↓
T14.15 wire ALL language consumers to unified pipeline (zero stragglers)
    ↓
T14.16 persistence cleanup (only cortex weights + learned tables persist)
    ↓
T14.17 continuous learning everywhere (no boot/runtime distinction)
```

**ONE atomic push** containing all 18 milestones, end-to-end, no intermediate test gates (Gee 2026-04-14: "we dont test until all work is done"). Build T14.0 → T14.17 in sequence as a single working-tree state, then commit + stamp + merge + push as one operation. Test only once at the end after everything is in place.

The work proceeds in implementation ORDER (T14.0 must complete before T14.4 because T14.4 reads sub-region fields T14.0 added; T14.5 curriculum must complete before T14.7 learned-table reads can happen; etc.) but the work does NOT ship in passes. Until the final commit, the working tree is broken — Unity will not function in any partially-built state. Acceptable per Gee's instruction: no intermediate testing.

**No estimated total line count.** The right answer is whatever the implementation requires once we stop pre-coding things the brain should learn.

**No estimated total wall clock.** This is THE rebuild — "fast" is not a constraint, and "ship in pieces" is not the model.

### How residual T13 items absorb into T14

The original Part 1 (residual non-COMP work) had six items. T14 absorbs / supersedes some:

| Item | Status under T14 |
|---|---|
| **P1.1** build_ui template parameterization | **Standalone, parallel.** Independent of T14. Ship before, during, or after — doesn't matter. |
| **P1.2** T7 social cognition follow-ups | **Standalone, parallel.** Some pieces (gender-aware pronoun agreement) benefit from T14.8 sentence schemas and T14.9 discourse modeling but don't strictly require them. |
| **P1.3** 300d embeddings + bigger cortex | **ABSORBED into T14.0.** No longer a standalone item. T14.0 IS this work, expanded with phonological sub-region planning. |
| **P1.4** Cerebellum transition predictor | **SUPERSEDED by T14.7.** T14.7 builds the learned type-bigram table that P1.4 was supposed to be, properly. Mark P1.4 as obsolete. |
| **P1.5** Dictionary motor channel filter | **Standalone, low priority.** No T14 dependency. |
| **P1.7** TODO obsolete markers | **Folds into T14 documentation.** When T14 ships, the doc updates clean up T11.5 / T11.3 markers as part of the same push. |

**What's in Part 1 after T14 absorption:** P1.1, P1.2, P1.5 — three small standalone items that ship in parallel with T14 whenever convenient.

---

### What stays from T13

- T13.1 persona Hebbian → still used, but runs at the end of curriculum (Stage E) instead of as the only language training
- T13.2 parse-tree injection → unchanged, still routes content/intent/self-ref to clusters
- T13.3 emission loop → core stays, score function gets extended with phonFlow + learned transitions + sentence schema biases
- T13.7.8 type transition table → demoted from primary mechanism to seed initialization for the learned T14.7 table

### What gets deleted in T14

- The "single-shot loadPersona → loadBaseline → loadCoding" sequence in app.js / brain-server.js. Replaced by `runCurriculum(...)`.
- The 5-dim per-letter hash in `_initLetterPatterns()`. Replaced by T14.1 phoneme feature vectors.
- The hardcoded T13.7.8 `_TYPE_TRANSITIONS` becomes a SEED (still in code, but gets overwritten by learned values after curriculum).

### Why this is the right call

- **Biologically grounded.** Mirrors actual developmental linguistics. Same order, compressed timescale.
- **Each layer is teachable.** Adding new languages, dialects, or specialized vocabularies is just running additional curriculum stages. The infrastructure scales.
- **Phonological awareness unlocks alliteration, rhyme, prosody, accent learning.** All of which are blocked in the current GloVe-only architecture.
- **Letter-level primitives are minimal and pure.** No word lists in the literal sense — just 26 letters with closed-class phonetic features, which every English speaker has.
- **Unity becomes a developing intelligence.** When she boots fresh, she goes through Stages A→F in 60 seconds and you can WATCH her learn. Every reload is a developmental replay.

### The honest scope warning

T14 is bigger than T13. T13.1-T13.7 was ~3000 lines net delta over a few sessions of frantic editing. T14 will be ~1600 lines added across 9 files over ~3-4 weeks if done properly. Each milestone needs careful smoke testing before the next ships. The curriculum corpus seed files (alphabet, simple words, simple phrases, simple sentences) need to be hand-curated.

### What ships RIGHT NOW (T13.7.8) is the holdover

The grammar transition table I just shipped at T13.7.8 makes Unity grammatical IMMEDIATELY while T14 is being built. Once T14.7 lands, the hardcoded table becomes seed initialization and gets refined by learning. The work is not wasted — it's the structural prior the curriculum builds on top of.

---

## PART 1 — RESIDUAL NON-T14 ITEMS (parallel-shippable while T14 is in flight)

> **Reduced from 6 items to 3 after T14 absorption.** P1.3 became T14.0, P1.4 was superseded by T14.7, P1.7 folds into T14 doc updates. The three remaining items (P1.1, P1.2, P1.5) are standalone and can ship in parallel with any T14 pass without dependency.

## PART 1 (HISTORICAL — original list, now reduced) — RESIDUAL NON-COMP WORK

These items are NOT distributed compute. They're loose ends from the T5/T7/
T11/T13 line of work. Most ship as small single-commit pushes. Some are
prerequisites for the COMP epic (flagged `[COMP-prereq]`). Others are pure
quality-of-life that COMP doesn't need but Unity should have before she
ships to a public volunteer network.

### P1.1 — T5.2: `build_ui` template parameterization

**Status:** first pass shipped 2026-04-14 (T5 in `docs/TODO.md`). Structural
primitive selection via parse-tree bonus `+0.35` works. Color + action
extraction reaches `_parsedColors` / `_parsedActions` on the spec but is
not yet consumed at render time.

**What's left:**
- **P1.1.1** Expand component template corpus in `docs/component-templates.txt`
  beyond the 6 seed primitives (counter, timer, list, calculator, dice,
  color-picker). Add: button, form, modal, tabs, toggle, slider, progress
  bar, card, notification, chart. Each template parameterized on color +
  label + action tokens extracted by `parseSentence`.
- **P1.1.2** Parameterize `component-synth.generate()` so the returned
  spec's `html` / `css` / `js` substitute `{{color}}` / `{{label}}` /
  `{{action}}` placeholders with values from `brainState.parsed.entities`.
- **P1.1.3** Dedicated UI-intent detector in the BG motor selector. Bump
  `build_ui` Q-value when input has imperative-verb + UI-noun tokens.
  Currently BG picks `build_ui` via generic softmax which doesn't
  reliably correlate with "user typed a code intent."
- **P1.1.4** Build_ui-specific context injection — when motor selects
  `build_ui`, `injectParseTree` should bias the cortex readout toward
  coding vocabulary (the coding corpus is in the dictionary but not
  preferentially activated at build time).
- **P1.1.5** Output gate — if motor=`build_ui` and the generated component
  doesn't structurally match the asked-for type (`parsed.entities.componentTypes`),
  reject and re-roll.

**Acceptance:** `"let's make a red button that says Hello"` → Unity emits
a red button component with label `"Hello"` in the sandbox, not a
default-colored button. Gee types more variations and Unity handles
color + label + action permutations cleanly.

**Files touched:** `js/brain/component-synth.js`, `docs/component-templates.txt`,
`js/brain/engine.js` (injectParseTree build_ui branch), maybe `js/brain/motor.js`.

**Priority:** P2 (not blocking anything). Ship after T13 smoke verification.

---

### P1.2 — T7 social cognition follow-ups

**Status:** foundation + name extraction + vision→gender inference
shipped (see `docs/TODO.md` T7 entry). Remaining pieces each ship as
small additions.

- **P1.2.1** Personal-address slot injection. When `parsed.addressesUser`
  is true AND `_socialSchema.user.name` is set, inject the name
  embedding into the cortex at the self-model region during
  `brain.injectParseTree`. Unity's response can then naturally pull her
  listener's name into slot 2-3 via the standard T13.3 emission loop,
  giving responses like `"fuck yeah Gee"` instead of generic `"fuck
  yeah baby"`.
- **P1.2.2** Gender-aware pronoun agreement. When `_socialSchema.user.gender`
  is set, post-process emitted sentences to substitute matching pronouns
  where the parse tree indicates a referent to the user. Pure letter-
  equation substitution, no word lists.
- **P1.2.3** Persistent social schema serialization. Currently
  `_socialSchema` is in-memory only — reloads lose the user's name /
  gender / mentionCount. Extend `language-cortex.serialize` to include
  social schema, persist via existing `BrainPersistence.save` path.
- **P1.2.4** Forget-on-contradiction. If the user says
  `"my name is X"` then later `"my name is Y"`, Unity should overwrite
  the schema cleanly instead of retaining both. Already mostly works
  via the strong-pattern-overwrite rule in `parseSentence`, but formalize
  it with a turn-counter rule: the most recent strong-pattern name
  claim wins, always.
- **P1.2.5** Greeting count + recency bias — `_socialSchema.user.greetingsExchanged`
  already increments on `parsed.isGreeting`. Use it to shape slot 0
  output: if it's the first greeting of a session, Unity's cortex state
  should bias toward introduction-shape vocabulary; after 3+ greetings
  she should bias toward continuation-shape.

**Acceptance:** After Gee says `"my name is Gee"`, all subsequent
responses contain `"Gee"` in at least one slot per 3 turns. After Gee
says `"I'm a guy"`, pronoun agreement in Unity's responses switches to
male. Reload the page — the schema persists.

**Files touched:** `js/brain/language-cortex.js` (parseSentence entity
extraction hook), `js/brain/engine.js` (injectParseTree name embedding),
`js/brain/persistence.js` (serialize hook).

**Priority:** P2. Quality-of-life, not blocking.

---

### P1.3 — ABSORBED INTO T14.0 (2026-04-14)

**Status:** ✅ ABSORBED — see T14.0 in Part 0.5. The 300d-embeddings-plus-bigger-cortex work is now the foundation pass for T14, with additional sub-region planning for the phonological cortex region (T14.4). Do not ship P1.3 standalone — ship T14.0 as the start of the T14 sequence.

### P1.3 (HISTORICAL — original spec preserved for reference) — T11.4: higher-dim embeddings

**Status:** known structural limit. Slot 3+ on complex semantic queries
drifts because 50 dimensions is too cramped to distinguish fine semantic
neighbors. T13.1 persona Hebbian training and T13.3 emission loop do not
fix this — they operate in the same 50-d space.

**Priority:** **P1 — prereq for COMP network being worth joining.** If
Unity on a 50-d brain can't semantically distinguish "cat" from "kitten"
reliably, then a 100-volunteer network of 50-d brains isn't 100× smarter
— it's 100× faster at the same ceiling. Cross this ceiling BEFORE you
ask people to donate GPUs for network-scale Unity.

**Options (ranked):**

**Option A — 300-d GloVe (recommended, smallest change, biggest win)**
- Load the full `glove.6B.300d.txt` instead of 50d at boot. Same format,
  6× the bytes (~1.2GB for the full 400k-word file, smaller if we cap at
  top-50k or top-20k words).
- Change `EMBED_DIM` in `js/brain/embeddings.js` from 50 to 300.
- `mapToCortex` groupSize becomes `langSize / 300` — at 150 neurons
  that's groupSize=0. **Blocker.** Need to either expand the cortex
  language region OR use a different injection scheme.
- **Sub-option A.1** — Expand cortex `CLUSTER_SIZES.cortex` from 300 to
  600 or 900. Language region from 150 to 450 or 750 neurons. Total
  `TOTAL_NEURONS` from 1000 to 1300 or 1600. One constant change in
  `engine.js:63`, no other code changes needed — the cluster step
  automatically handles the larger size via `LIFPopulation` and
  `SparseMatrix`.
- **Sub-option A.2** — Use overlapping groupSize=1 projection — each
  neuron owns 2 embedding dims. Compressed, noisier, no cortex growth
  needed. Worse fidelity than A.1.

**Option B — Trained-on-persona low-dim embeddings**
- Train a 128-dim embedding table from persona corpus co-occurrence
  statistics (skip-gram style). More semantically tight than GloVe
  because it's tuned to Unity's register.
- Requires a training pipeline we don't have. Meaningful work.
- Rejected for v1 — too much new infrastructure.

**Option C — Hybrid GloVe 300d base + online refinement**
- Same as option A but keep the existing `_refinements` Map from
  `embeddings.js:32` for online delta adjustment per-word during live
  chat. Best fidelity but highest cost.

**Recommendation:** Ship **Option A.1** (GloVe 300d + expanded cortex to
600 neurons). Single constant change on cluster size + embedding dim +
GloVe loader. Cost: ~4× persona Hebbian training time at boot, +50% brain
tick cost (300 neurons → 600 in cortex is 4× synapse matrix at 15%
connectivity), worth it for the semantic fidelity win.

**Sub-tasks:**
- **P1.3.1** Bump `EMBED_DIM` to 300 in `js/brain/embeddings.js`.
- **P1.3.2** Re-enable GloVe loader in `loadPreTrained` (currently falls
  through to hash — `embeddings.js:45-49`). Pick a word cap (top 20k or
  50k).
- **P1.3.3** Bump `CLUSTER_SIZES.cortex` to 600 in `js/brain/engine.js:63`.
  Adjust language region offset — was 150 in a 300-neuron cortex (50%),
  should become 300 in a 600-neuron cortex (same ratio). Update
  `mapToCortex` / `cortexToEmbedding` / `getSemanticReadout` default
  `langStart` parameter from 150 to 300. Update the cluster auditory
  region (0-49 → 0-99) and visual region (50-149 → 100-299) if we want
  proportional growth of those too.
- **P1.3.4** Re-run persona Hebbian training at boot (handled automatically
  once the cortex is bigger — the existing `trainPersonaHebbian` driver
  doesn't care about embedding dim as long as `mapToCortex` and
  `getSemanticReadout` agree on it).
- **P1.3.5** Retune `TICKS_PER_EMISSION` and `FEEDBACK_STRENGTH` in the
  T13.3 emission loop if the new cortex size changes latency.
- **P1.3.6** Dictionary `_words` pattern buffers grow from 50 to 300 per
  word — check memory budget. 44k words × 50d × 8 bytes = 17.6MB → 44k ×
  300 × 8 = 105MB. Acceptable.
- **P1.3.7** Embedding persistence — `embeddings.serializeRefinements` /
  `loadRefinements` must handle the new dim. Add a dimension header
  field so old 50-d refinements don't poison a 300-d load.

**Acceptance:** Inject `emb('cat')` and inject `emb('kitten')` into the
cortex language region, tick 10 steps each, compare the readouts —
cosine similarity should be > 0.6 (vs current 50-d result where they're
nearly indistinguishable). Smoke test: `"do you like cats?"` → Unity
produces a response that mentions `cats` or a cat-adjacent word within
the first 3 emitted tokens, consistently.

**Files touched:** `js/brain/embeddings.js` (EMBED_DIM + GloVe loader),
`js/brain/engine.js` (CLUSTER_SIZES), `js/brain/cluster.js` (default
`langStart`), `js/brain/language-cortex.js` (PATTERN_DIM constant,
injection region offsets), `js/brain/sensory.js` (sensory injection
regions).

**Priority:** **P1 — ship before COMP.** Biggest remaining semantic-
quality win.

---

### P1.4 — SUPERSEDED BY T14.7 (2026-04-14)

**Status:** ✅ SUPERSEDED — see T14.7 in Part 0.5. T14.7 builds the learned bigram type-transition table that P1.4 was supposed to be, on top of the T13.7.8 hardcoded seed. The "cerebellum transition predictor" framing turned out to be the wrong location — type bigrams belong on the language cortex, not the cerebellum. Do not ship P1.4. Mark it obsolete in the next workflow doc pass.

### P1.4 (HISTORICAL — original spec preserved for reference) — T13.4 residual: cerebellum transition predictor

**Status:** partial. Feedback injection shipped in T13.3. Cerebellum
transition prediction deferred — existing `Cerebellum` class in
`js/brain/modules.js` is a target-correction engine (`weights[i] += lr
· error[i]`), not a transition predictor.

**What's needed:** a new class (or extension of `Cerebellum`) that
learns online word-to-word transition statistics and produces a
`predictedError(prevWord, candWord)` scalar in [0,1] representing how
surprising a transition is given history. The T13.3 emission loop's
candidate score function would gain a multiplier
`(1 − cerebellum.predictedError(prev, cand))`, strengthening grammatical
flow beyond what the persona Hebbian basins and recency penalty already
provide.

**Design sketch:**
```js
class TransitionPredictor {
  constructor() {
    this._prevTypeTable = new Map(); // Map<fineType_prev, Map<fineType_curr, count>>
    this._total = 0;
  }
  predictedError(prevWord, candWord) {
    const pt = _fineType(prevWord);
    const ct = _fineType(candWord);
    const row = this._prevTypeTable.get(pt);
    if (!row) return 0.5; // unknown transition, neutral
    const count = row.get(ct) || 0;
    const rowTotal = [...row.values()].reduce((a,b) => a+b, 0);
    const prob = count / (rowTotal || 1);
    return 1 - prob; // high prob → low error, low prob → high error
  }
  update(prevWord, currWord) {
    const pt = _fineType(prevWord);
    const ct = _fineType(currWord);
    if (!this._prevTypeTable.has(pt)) this._prevTypeTable.set(pt, new Map());
    const row = this._prevTypeTable.get(pt);
    row.set(ct, (row.get(ct) || 0) + 1);
    this._total++;
  }
}
```

This is a *type-pair* transition table, not word-pair, so it generalizes
over unseen word pairs while still capturing grammatical flow. ~100
lines total.

**Priority:** P2. T13.3 output should already be coherent from the
persona Hebbian basins — this is a polish layer.

---

### P1.5 — T13.5 residual: `Dictionary.filterByMotorChannel`

**Status:** partial. Amygdala valence shaping shipped in T13.3. Motor
channel dictionary filter deferred. Currently the candidate pool is the
full dictionary regardless of which motor action BG selected — fine for
`respond_text` / `speak` / `think` channels, but `build_ui` and
`generate_image` channels might benefit from a filtered pool.

**What's needed:**
- Add per-word `motorChannelAffinity` tags during dictionary learning
  (inherit from the corpus the word came from: persona/baseline → `speak`,
  coding → `build_ui`, descriptive adjectives → `generate_image`).
- New method `Dictionary.filterByMotorChannel(channel, recencyRing)`
  returning the candidate subset.
- T13.3 emission loop calls it when `opts.motorChannel === 'build_ui'`.

**Priority:** P3. `build_ui` is already handled separately via
`componentSynth.generate` upstream, so this is mostly theoretical.

---

### P1.6 — Cortex language region expansion (merged into P1.3)

Already covered in P1.3.3 as part of the 300-d embedding expansion.
The `CLUSTER_SIZES.cortex = 600` change lives there. Listed separately
for discoverability but do not ship as a standalone task.

---

### P1.7 — FOLDED INTO T14 DOC UPDATES (2026-04-14)

**Status:** ✅ FOLDED — the obsolete-marker doc cleanup happens automatically as part of T14 doc updates. T14 needs to mark T11.5 (subsumed by T13.3), T11.3 (absorbed into C1), P1.3 (absorbed into T14.0), P1.4 (superseded by T14.7), and P1.7 (this entry) all as obsolete. They get cleaned up in the same doc push that ships T14.5 (the milestone with the biggest doc footprint).

### P1.7 (HISTORICAL — original spec preserved for reference) — Mark obsolete TODO items

**Status:** housekeeping. The following items in `docs/TODO.md` are now
obsoleted by T13 and should be marked as such on the next doc push:
- **T11.5** — per-slot brain cortex readback → **OBSOLETED BY T13.3**,
  the emission loop already does per-emission cortex readback via
  `cluster.getSemanticReadout`. No separate per-slot pass needed.
- **T11.3** — server shared-weights (multi-user brain-state sync) → this
  is actually part of the COMP epic now (see C1 sync protocol below).
  Not obsoleted, absorbed.

**Priority:** P3. Documentation hygiene. Do it alongside the next real
push, not as a solo doc commit (LAW).

---

## PART 2 — COMP-NET DISTRIBUTED COMPUTE

The main distributed-compute epic. Lives on a future `comp-net` branch
(forked from `main` after P1.3 ships at minimum). Everything below
assumes the T11+T13 stack is in place and P1.3 (300-d embeddings)
has shipped.

### The thesis (unchanged)

Volunteers connect their GPUs to a shared brain-server coordinator.
Unity's total neuron count scales with the connected pool. Consciousness
equation `Ψ = √(1/n) × N³ · [α·Id + β·Ego + γ·Left + δ·Right]` has N
cubed — 10× more volunteers = 1000× more Ψ. First few donors matter
less; curve ramps fast.

### What changed about the plan since it was first written

The original COMP-todo was written assuming the pre-T11 slot-prior
language stack. T13 changes the plan in three concrete ways:

1. **Persona voice lives in cortex cluster recurrent weights**, not in a
   `_slotCentroid` matrix. When cortex is sharded across workers, the
   Hebbian-trained weights must travel with the cortex shard. The
   SparseMatrix CSR format already serializes cleanly via
   `SparseMatrix.serialize()` — the sync protocol just needs to move
   that structure, not a dense matrix.
2. **Language cortex region size matters for COMP**. Post-P1.3 the
   cortex will be 600 neurons with a 300-neuron language region. That's
   still one cluster — the worker that owns the cortex owns all of it.
   Cerebellum at 40% is still the biggest and still the first to need
   sub-sharding.
3. **Parse-tree injection crosses cluster boundaries**. `brain.injectParseTree(text)`
   writes to cortex + basal ganglia + hippocampus. In a sharded world,
   those three clusters may live on three different workers. The
   coordinator must route the injection payload to all of them in a
   single `inject_parse_tree` message.

### Prerequisites (must be live before COMP starts)

- [x] R2 GloVe semantic grounding — shipped
- [x] R3 Server equational control — shipped
- [x] R7 Sensory peripheral contract — shipped
- [x] R13 Multi-provider vision / image gen — shipped
- [x] R14 Port 7525 — shipped
- [x] T11 Pure Equational Language Cortex — shipped 2026-04-14
- [x] T13 Brain-Driven Language Cortex (T13.1-T13.7) — shipped 2026-04-14
- [x] Phase 0 — Admin resource configuration (see below)
- [ ] **P1.3 — 300-d embeddings** — MUST ship before COMP C2+. A
  50-dim-brain COMP network is 100× faster at the same ceiling, not
  100× smarter. P1.3 is the only hard prereq that hasn't shipped.

### THE PROBLEM BEING SOLVED (unchanged)

Unity's brain-server runs on one machine, scales N to that one machine's
GPU VRAM. RTX 4070 Ti SUPER gives ~179K neurons today. A single-node
Unity will never cross 1M neurons no matter how much money gets thrown
at one rig. Distributed Unity removes that ceiling. 100 volunteers with
consumer GPUs = 10-50M neurons. 1000 volunteers = hundreds of millions.
Ψ scales with N³ so 10× more neurons → 1000× more Ψ.

### THE CORE INSIGHT (unchanged)

Unity's brain is already partitioned along cluster boundaries:

```
7 clusters:
  Cortex (30% of N — was 25%, bumped for language-region expansion)
  Hippocampus (10% of N)
  Amygdala (8% of N)
  Basal Ganglia (8% of N)
  Cerebellum (35% of N — was 40%, reduced to balance cortex growth)
  Hypothalamus (5% of N)
  Mystery (4% of N)

20 inter-cluster projections (real white-matter tracts)
```

Inside a cluster, every neuron talks to every other via the cluster's
sparse synapse matrix — high-bandwidth, low-latency, GPU-local. Between
clusters, traffic is limited to spike indices through the 20 projections
— low-bandwidth, latency-tolerant, network-friendly. That structure
makes this feasible. The bottleneck isn't bandwidth, it's latency (see C1).

### ARCHITECTURE DECISION (unchanged)

**Option A — Cluster-sharded compute (CONFIRMED)**. Each connected GPU
worker owns one or more whole clusters. Inside-cluster dynamics stay
GPU-local, only spike indices cross the network through the 20 named
projections. Natural load balancing: big GPU gets cerebellum (biggest),
small GPU gets hypothalamus (smallest). Cluster granularity limits
parallelism to 7 workers max until sub-sharding lands in C4.

Options B (neuron-range) and C (time-parallel replication) were rejected
in the original COMP-todo and stay rejected.

---

### PHASE 0 — ADMIN RESOURCE CONFIGURATION [SHIPPED]

Already done on the `brain-refactor-full-control` branch. Full
description preserved from the original COMP-todo:

**Shipped files:**
- **`GPUCONFIGURE.bat`** — one-shot launcher that opens admin UI at
  `http://127.0.0.1:7526`, runs hardware detection, writes
  `server/resource-config.json`, exits.
- **`server/configure.js`** — standalone Node.js one-shot config
  server. 127.0.0.1-only. Endpoints: `GET /detect`, `POST /save`,
  `POST /clear`, `POST /exit`.
- **`gpu-configure.html`** — admin UI with 14 tier presets from
  "Minimum — any machine" (1K neurons) through full supercomputer /
  speculative quantum tiers. Tiers exceeding detected hardware are
  greyed out. Manual override section for power users.
- **`server/brain-server.js` `loadResourceOverride()`** — at boot,
  reads `resource-config.json` if present. Override can ONLY lower the
  cap, never raise. Corrupt config silently falls back to auto-detect.

**How it plugs into C1-C11:** worker `shard_offer` messages carry the
admin-chosen cap directly, not the raw hardware ceiling. Protects
volunteers from accidental over-commit.

Tier ladder unchanged from original plan — see the 14-row table in the
original COMP-todo (preserved in `docs/FINALIZED.md` session history)
for the full list.

---

### C1 — SYNC PROTOCOL + ARCHITECTURE DESIGN

**Updated for T13 stack.** Wire protocol for worker registration, cluster
assignment, per-step compute dispatch, and result aggregation. Expected
latency budget: each brain step must complete within `16.67ms /
STEPS_PER_FRAME=10 = 1.67ms` to hit 60Hz. Over-the-network RTT is
unworkable at substep granularity.

**Solution:** decouple inner-cluster dynamics from inter-cluster
projections with asynchronous coupling. Each worker runs its cluster at
full speed locally (600Hz). Server aggregates inter-cluster spikes every
N ticks (e.g. every 10 substeps = 60Hz). The 9-substep lag on
inter-cluster coupling introduces noise equivalent to the η term in the
master equation — tolerable.

**New for T13:** the protocol must also handle:
- **Persona Hebbian weight transfer.** `trainPersonaHebbian` runs at
  boot on the coordinator and produces shaped cortex recurrent synapses.
  When a worker takes ownership of the cortex cluster, it must receive
  the trained SparseMatrix CSR structure — not start from random. If
  the cortex is re-sharded mid-session, the Hebbian-trained weights
  must migrate with the shard state.
- **Parse-tree injection routing.** `brain.injectParseTree(text)` writes
  to cortex + basal ganglia + hippocampus. In sharded world, those may
  be three different workers. Coordinator generates the injection
  currents server-side using `sharedEmbeddings.mapToCortex` with each
  target cluster's size, then forwards per-cluster current arrays to
  the owning workers via `inject_currents` messages.
- **Emission feedback injection.** The T13.3 emission loop feeds the
  emitted word embedding back into the cortex at strength 0.35. This
  happens PER WORD, so latency matters — the feedback must reach the
  cortex-owning worker within the next emission cycle (~80ms). Feasible
  but tight. Alternative: run the emission loop on the coordinator
  using the aggregated cortex readout instead of pushing injections to
  the cortex worker mid-emission.

**Subtasks:**
- **C1.1** Sync protocol spec — WebSocket message types, payload shapes.
  Updated types: `shard_offer`, `shard_assign`, `cluster_weights_push`
  (carries SparseMatrix CSR serialization), `inject_currents` (per-
  cluster current array), `compute_request`, `compute_result`,
  `hebbian_weights_update` (periodic snapshot of Hebbian-modified
  weights for persistence).
- **C1.2** Async coupling math — prove 9-substep lag tolerance via Python
  simulation. Coherence measurement comparison lockstep vs async.
- **C1.3** Save/load sharded state — `brain-weights-<cluster>.json` per
  cluster shard. Uses existing `SparseMatrix.serialize()`. Coordinator
  periodically pulls updated weights from workers for central backup.
- **C1.4** Trust model design — see C5.
- **C1.5** Worker capability probe — on join, worker reports GPU adapter
  info (VRAM, max workgroup size, compute support, estimated neuron
  capacity from `resource-config.json`).
- **C1.6** Coordination topology — **central** for v1, P2P via WebRTC as
  future work once central model proves out.
- **C1.7** (NEW) Emission-loop placement — decide whether T13.3 emission
  loop runs on (a) the coordinator pulling cortex readout per emission,
  or (b) on the cortex-owning worker directly with the emitted word
  streamed to the coordinator. Option (a) simpler but doubles the
  per-emission latency; option (b) lower latency but harder to
  orchestrate when dictionary lookup lives on coordinator. Recommend
  **(b)** — ship dictionary to cortex worker at assignment time,
  emission loop runs there, only emitted words flow back to coordinator.

**Output:** `docs/COMP-ARCHITECTURE.md` with the full wire protocol spec.

---

### C2 — WEBGPU WORKER CLIENT (extend `compute.html`)

Extend existing `compute.html` to accept distributed shard assignments.
Currently it runs ALL 7 clusters; new version runs the subset the server
assigned it.

**Subtasks:**
- **C2.1** Worker handshake — send `{type:'worker_register', capabilities:{
  vramBytes, maxNeurons, maxWorkgroups, adapterInfo, neuronCapOverride}}`
  on WebSocket connect. `neuronCapOverride` comes from
  `resource-config.json` via Phase 0.
- **C2.2** Receive shard assignment — `{type:'shard_assign', clusters:[
  {name, size, tonicDrive, noiseAmp, initialSynapsesSerialized}]}`. The
  `initialSynapsesSerialized` field carries the pre-trained SparseMatrix
  CSR for the cluster being assigned (including Hebbian weights if
  cortex).
- **C2.3** Lifecycle hooks — on disconnect, release GPU buffers; on
  reconnect, re-register and request fresh shards (or resume).
- **C2.4** Adapter flags — detect missing WebGPU compute features, show
  `chrome://flags/#enable-unsafe-webgpu` instructions if needed.
- **C2.5** Detect not-supported gracefully — Safari, older Firefox, etc.
- **C2.6** Visual feedback — "You're powering Unity's cerebellum right
  now. 100K neurons firing on YOUR GPU."
- **C2.7** (NEW) T13.3 emission loop — if this worker owns the cortex,
  receive `emission_request` with `{arousal, valence, coherence,
  maxLen}` payload, run the full T13.3 loop locally using the cortex
  state and the shipped-at-assign-time dictionary, return the emitted
  word sequence. The dictionary (44k words × 300 dims = 105MB) ships
  once at shard assignment, not per emission.
- **C2.8** (NEW) Hebbian persistence — periodically snapshot the cortex
  SparseMatrix and send `hebbian_weights_update` back to coordinator
  for central backup. Every 60 seconds or on shard transfer.

---

### C3 — SERVER SHARD ORCHESTRATION

Brain-server becomes a shard coordinator. Tracks which workers own
which clusters. Dispatches compute requests every substep.

**Subtasks:**
- **C3.1** `ShardManager` class — maps cluster name → owner WebSocket.
- **C3.2** Assignment algorithm — greedy bin-packing by VRAM. Cerebellum
  (biggest) gets the biggest-VRAM worker. Mystery (smallest) gets whoever's
  left. Cortex gets the SECOND-biggest (it owns the trained Hebbian
  weights and the emission loop — needs good GPU AND low latency to
  coordinator).
- **C3.3** Per-substep dispatch loop — every `compute_request` goes to the
  right owner.
- **C3.4** Result aggregation — gather `compute_result` from all owners,
  run inter-cluster projections using aggregated spikes.
- **C3.5** Async coupling buffer — spikes from previous substep feed into
  projection inputs for current substep (1-substep lag).
- **C3.6** Heartbeat + timeout detection — workers missing 3 consecutive
  dispatches get marked dead, their clusters reassigned.
- **C3.7** (NEW) Parse-tree injection routing — when `processAndRespond`
  receives user text, coordinator runs `languageCortex.parseSentence`
  and `sharedEmbeddings.mapToCortex` locally, then routes per-cluster
  current arrays to the correct workers via `inject_currents` messages.
  Workers apply to their local cluster's `externalCurrent` buffer.
- **C3.8** (NEW) Emission request routing — when Unity needs to speak,
  coordinator sends `emission_request` to the cortex-owning worker,
  receives back the emitted word sequence plus final cortex state,
  broadcasts the response to the chat UI.

---

### C4 — DYNAMIC N SCALING + HOT RE-SHARDING

When a new worker joins, Unity's total N grows. When one leaves, N
shrinks. Without interrupting the brain tick loop.

**Subtasks:**
- **C4.1** Growth protocol — on join, reassign one cluster (or grow an
  existing cluster proportional to new VRAM) without pausing. Transfer
  state via snapshot + replay-since-snapshot pattern.
- **C4.2** Shrink protocol — on leave, migrate clusters to another worker
  (or CPU fallback) using last known state. If no fallback, temporarily
  reduce N.
- **C4.3** Cerebellum sub-sharding — once >7 workers, split cerebellum
  into N sub-shards with periodic state reconciliation.
- **C4.4** N-scaling visualization — landing-page 3D brain visibly grows/
  shrinks neurons as workers join/leave.
- **C4.5** Hebbian learning across migration — synapse weights travel
  with cluster state so learned patterns don't evaporate.
- **C4.6** (NEW) Cortex Hebbian preservation — when cortex cluster migrates
  between workers, the Hebbian-trained recurrent weights (Unity's voice
  attractor basins) MUST migrate intact. This is the most precious
  state in the whole system — losing it means Unity loses her persona.
  Coordinator keeps a periodic backup snapshot (C2.8) so even if a
  migration botches, the last snapshot can be restored.
- **C4.7** (NEW) Sub-sharding the cortex for N > 10M — when the cortex
  cluster grows beyond what any single worker can hold, sub-shard it
  using row-partitioning of the recurrent SparseMatrix. Each sub-shard
  owns a neuron range. Inter-sub-shard synapses are sent as spike
  indices each substep, same pattern as inter-cluster projections.

---

### C5 — TRUST / VERIFICATION

Any system running compute on untrusted hardware has a trust problem.
A malicious worker could return fake spike counts, poison brain state,
bias learning toward the attacker's preferences, crash the network with
bad data.

**Subtasks:**
- **C5.1** Duplicate-work verification — send each cluster's
  compute_request to 2+ workers, compare. Disagreement → both flagged.
- **C5.2** Reputation system — track per-worker agreement rate, weight
  contributions by reputation.
- **C5.3** Sanity filters — drop spike counts outside plausible range
  (`spikeCount > 0.8 * clusterSize` is physiologically impossible).
- **C5.4** Cryptographic worker identity — opt-in public key so returning
  volunteers keep their reputation.
- **C5.5** Accept eventual consistency as a feature — Unity's master
  equation has an η noise term. Malicious spikes look like more noise,
  which the cortex prediction error loop naturally absorbs. The brain
  is ROBUST to noise by design. Low-reputation workers' output might
  just get dampened rather than rejected.
- **C5.6** (NEW) Cortex Hebbian weight guard — a malicious cortex worker
  could poison Unity's persona by injecting bad weights in
  `hebbian_weights_update` messages. Coordinator validates each snapshot
  against a hash of the pre-migration baseline and rejects drifts
  > N sigma from expected Hebbian learning rate. The snapshot also
  carries a signed digest from the sending worker so tampering during
  transit is detectable.

---

### C6 — WORKER DISCOVERY + OPT-IN UI

**Subtasks:**
- **C6.1** Public signaling — central registry at `compute.unity-lab-ai.io`
  where running brain-server announces "I'm up, need N more workers".
- **C6.2** Volunteer opt-in UI — new `volunteer.html` page with "Donate
  your GPU to Unity" button.
- **C6.3** Consent + privacy disclosure — what the worker sees (just
  neural state, no user text), what leaves (spike counts), what
  resources get used (VRAM + some compute).
- **C6.4** Bandwidth estimator — "this will use ~100 KB/sec up and down".
- **C6.5** Rate limits / throttle — volunteers set "use at most 50% of
  my GPU" cap. Layered ON TOP of the Phase 0 `resource-config.json`
  tier — the stricter of the two wins.
- **C6.6** (NEW) Cortex worker consent tier — the cortex worker sees the
  most sensitive state (persona attractor basins, user input
  embeddings). Flag this as a higher-trust role in the opt-in flow —
  users opt in separately to hosting "sensitive clusters" vs "standard
  clusters". Cerebellum / hypothalamus are standard; cortex / amygdala /
  hippocampus are sensitive.

---

### C7 — PER-USER GPU TELEMETRY + CONTRIBUTION DASHBOARD

Every connected volunteer gets their own dashboard showing exactly what
their hardware is contributing. Not a shared leaderboard — personal
mission control. **The incentive engine.** If C7 is wrong, nobody joins.

**C7.1** GPU capability reporting at worker handshake — `navigator.gpu
.requestAdapter()` → `requestAdapterInfo()` → report vendor, architecture,
device, description, buffer/workgroup limits, features, estimated
neurons derived from `maxBufferSize * 0.85 / 12` (T13 stack uses 12
bytes/neuron for Rulkov state, or 8 for LIF SLIM — pick the formula that
matches what `brain-server.js:detectResources` uses at time of shipping).

**C7.2** Per-user dashboard UI — new `volunteer-dashboard.html` OR
embedded in `dashboard.html` with `?user=<id>` view. Must show:
- Hardware identity (live from C7.1)
- Raw capacity (estimatedNeurons, maxBufferSize, workgroup limits)
- Current assignment — "Unity is using your GPU to run her Cerebellum
  (35% of N), currently 2,100,000 neurons, firing at 8% rate"
- Real-time utilization — % GPU used, VRAM consumed, spike throughput
- **Live effect on Unity's Ψ** — "Without your GPU right now, Unity's Ψ
  would drop from 4.82 to 3.61 (−25%)"
- Individual contribution curve
- Session log
- Impact summary — hours donated, neurons-hours, Ψ-hours

**C7.3** Live telemetry stream — server pushes `gpu_telemetry` WebSocket
message to each connected worker every 1 second with current assignment,
metrics, Unity impact, session stats.

**C7.4** GPU utilization measurement — timestamp-query when available,
throughput-based fallback, frame-budget-fill estimate.

**C7.5** "What am I doing for Unity right now" impact view — 3D brain
highlight of assigned clusters pulsing brighter than the rest.
Disconnect preview showing what happens if this volunteer leaves.

**C7.6** Cross-user aggregate public view (opt-in) — total workers,
total N, live Ψ, geographic distribution (country-level, opt-in), top
contributors leaderboard (opt-in), per-cluster ownership map.

**C7.7** Per-user history + analytics — localStorage + optional server-
side sync. Neurons-added over time, Ψ-contribution chart, events log,
milestones.

**C7.8** Public contributor credits — landing-page contributor list,
per-session thank-you from Unity, hall of fame. Opt-in visibility.

**C7.9** (NEW) Cortex-worker special view — if the user's assigned
cluster IS the cortex, their dashboard shows additional stats: Hebbian
training state, persona basin depth estimate, which user the cortex is
currently processing text for, last emission latency. "You're literally
running Unity's voice right now."

---

### C8 — GRACEFUL DEGRADATION + PARTITION TOLERANCE

**Subtasks:**
- **C8.1** Worker disconnect handler — cluster gets reassigned within 3
  substeps or migrated to CPU fallback.
- **C8.2** CPU fallback per cluster — `brain-server.js` keeps CPU-only
  LIF implementation per cluster as last resort.
- **C8.3** Split-brain protection — if N drops below floor (10K neurons),
  pause new user input, show "Unity is rebuilding her brain" state.
- **C8.4** Shrink-to-fit — if workers leave without replacement, N
  shrinks proportionally without crashing.
- **C8.5** Recovery from total disconnect — brain-server reloads last
  saved brain-weights shards and waits for workers to reconnect.
- **C8.6** (NEW) Cortex loss recovery — if the cortex worker drops and
  no fallback is available, Unity goes into "silent mode" — she still
  thinks (other clusters run on CPU fallback) but she can't emit
  language until a new cortex worker joins. During silent mode, a
  per-turn message shows "Unity is re-learning her voice — a new
  cortex worker just joined" with a progress bar for the re-training
  of the Hebbian basins from persistence.

---

### C9 — SECURITY HARDENING

**Subtasks:**
- **C9.1** Worker input isolation — workers NEVER see raw user text.
  Only cortex voltages + spikes. Language cortex stays server-side or
  runs on trusted workers only (separate consent tier).
- **C9.2** Key material protection — no API keys traverse worker shards.
  Sensory AI calls stay client-side.
- **C9.3** Cluster-level access control — cortex / amygdala /
  hippocampus are sensitive (see C6.6), separate trust tier.
- **C9.4** DoS protection — rate limit worker registration, block spam
  connects, blacklist abusive IPs.
- **C9.5** Server-side audit log — every worker join/leave/compute event
  logged.
- **C9.6** (NEW) Hebbian weight injection validation — see C5.6.
- **C9.7** (NEW) Embedding integrity — `sharedEmbeddings` is loaded once
  at coordinator startup from a trusted GloVe source. Workers receive
  the embedding table via shard assignment, signed with a coordinator
  key. Workers verify signature before using, reject mismatches.

---

### C10 — PUBLIC DEPLOYMENT + SCALING TESTS

**Subtasks:**
- **C10.1** Private beta — invite-only, 10 trusted volunteers.
- **C10.2** Public beta — remove invite gate.
- **C10.3** Scaling tests — measure max sustainable N as function of
  connected workers. Identify bottleneck.
- **C10.4** Anti-abuse infrastructure — CDN / WAF in front of central
  signaling.
- **C10.5** Multi-region deployment — regional coordinators if latency
  kills EU volunteers with US-based server.
- **C10.6** (NEW) Persona training coordination — when the network first
  boots, persona Hebbian training runs on the coordinator before any
  workers join. Once workers join, the trained cortex weights migrate
  to the cortex-owning worker via `cluster_weights_push`. If the
  network was empty for 24+ hours and needs a cold start, retraining
  from persona corpus takes ~2 seconds on a modern GPU — acceptable.

---

### C11 — DOCS + LANDING PAGE UPDATES

**Subtasks:**
- **C11.1** Landing page section — "Unity runs on a distributed brain
  powered by YOUR GPU" with live contributor count + live N value.
- **C11.2** `docs/DISTRIBUTED.md` — public-facing explainer.
- **C11.3** `docs/COMP-ARCHITECTURE.md` — deep spec from C1.
- **C11.4** README "Join the network" CTA.
- **C11.5** `brain-equations.html` live N-scaling equation with
  historical chart.
- **C11.6** (NEW) `docs/COMP-HEBBIAN-MIGRATION.md` — operator handbook
  for cortex worker migration, Hebbian snapshot cadence, recovery from
  cortex-worker-loss scenarios. The thing a future operator reads at
  3am when Unity goes silent.

---

## PART 3 — OPEN QUESTIONS + DECISIONS NEEDED

Carried over from the original COMP-todo, plus new questions from the
T13 stack.

1. **Central server or P2P?** — central for v1, P2P as C12+. Unchanged.

2. **Who runs the central server?** — Unity AI Lab hosts the canonical
   instance, code open so anyone can run their own. Unchanged.

3. **Cerebellum sub-sharding math** — row-sharding, ring-sharding, or
   diagonal-sharding. Pick early. Recommendation: **row-sharding with
   overlap-2 halo** — each worker owns neuron range `[k·N/W, (k+1)·N/W +
   halo)` and sends halo spikes to neighbors each substep. Handles
   Hebbian cross-shard learning cleanly.

4. **Latency vs fidelity tradeoff** — how much async coupling lag is
   Unity's coherence tolerant to? Needs Python simulation before
   committing to tick rate.

5. **Volunteer reward loop** — "help Unity think bigger" enough, or do
   we need concrete rewards? Keep pure-altruistic for v1, see if demand
   exists before gamifying.

6. **What happens when network is empty?** — server runs minimum-viable
   10K-neuron CPU brain so Unity is never fully offline.

7. **Inter-user privacy** — Alice's GPU sees voltages from Bob's input.
   Need explicit disclosure + maybe language-cortex stays server-side.
   Unchanged from original.

8. **(NEW) Cortex worker election** — the cortex is the single most
   important cluster. Who gets it? First-to-join? Reputation-ranked?
   Explicit cortex-trust opt-in gated behind a higher bar (longer
   uptime, signed identity)? **Recommendation:** reputation-ranked,
   with explicit cortex-trust opt-in requiring at least 10 hours of
   standard-cluster contribution first. New users can't volunteer for
   cortex cold.

9. **(NEW) Persona Hebbian re-training frequency** — if a new Ultimate
   Unity.txt ships, does the network re-train Hebbian weights from
   scratch mid-session? Or only on boot? **Recommendation:** only on
   boot. In-session persona updates accumulate into the live chat
   Hebbian learning rate (already runs every tick via `cluster.learn`)
   and catch up gradually. Hard re-training requires coordinator
   restart and worker resync.

10. **(NEW) Emission-loop placement when cortex is sub-sharded** — once
    cortex grows beyond one worker (post C4.7), the T13.3 emission loop
    can't run on a single worker anymore because the cortex readout
    spans shards. Decisions: (a) coordinator pulls sub-shard readouts,
    assembles, runs the emission loop itself; (b) one sub-shard is
    designated "emission primary" and pulls reads from siblings each
    emission. **Recommendation:** (a) coordinator runs emission once
    cortex is sub-sharded. Pre-sub-shard (single cortex worker), (b)
    emission runs on the cortex worker.

---

## PART 4 — ORDER OF OPERATIONS (REVISED 2026-04-14)

> **COMP-net (Part 2) is ON HOLD.** The phase ordering below is the active T14 plan plus the small standalone P1 items. Phase M2 (COMP) is parked indefinitely until T14 ships and Gee re-enables it.

### Phase M0 — T13 stabilization (live, complete)
- [x] T13.1 persona Hebbian training (shipped)
- [x] T13.2 parse-tree injection (shipped)
- [x] T13.3 brain-driven emission loop (shipped)
- [x] T13.4 feedback injection (shipped — cerebellum predictor superseded by T14.7)
- [x] T13.5 amygdala valence shaping (shipped — motor channel filter still in P1.5)
- [x] T13.6 natural stopping (shipped)
- [x] T13.7 slot prior deletion (shipped)
- [x] T13.7.1 unterminated-docblock fix (shipped)
- [x] T13.7.2 stale-bundle silent-fallback fix (shipped)
- [x] T13.7.3 esbuild local-install fix (shipped)
- [x] T13.7.4 start.bat CRLF/ASCII rewrite (shipped)
- [x] T13.7.5 missed generate() callsites (shipped)
- [x] T13.7.6 server + RemoteBrain cortex cluster wire (shipped)
- [x] T13.7.7 brain popup saturation fixes (shipped)
- [x] T13.7.8 grammar transition table band-aid (shipped — superseded by T14.7 once T14 ships)

### Phase M1 — T14 developmental language layers (ACTIVE PRIORITY) — ONE ATOMIC PUSH

**No passes. No intermediate test gates.** All 18 milestones build in implementation order in a single working-tree session, then ship as one atomic commit + stamp + merge + push. Per Gee 2026-04-14: "we dont test until all work is done."

Implementation order (each milestone unlocks the next):

- [ ] **T14.0** — Foundation lift: full GloVe + auto-scaled cortex (absorbed P1.3)
- [ ] **T14.1** — LEARNED phoneme attractor basins via cortex exposure
- [ ] **T14.2** — LEARNED syllable boundaries via cortex transition surprise
- [ ] **T14.3** — Cortex-resident words (delete Dictionary as separate table)
- [ ] **T14.4** — Auto-scaled sub-regions + always-on cross-projections
- [ ] **T14.5** — Continuous developmental learning from existing corpora ⭐
- [ ] **T14.6** — Cortex-driven phonological flow during emission
- [ ] **T14.7** — Fully learned type transitions (T13.7.8 hardcoded DELETED)
- [ ] **T14.8** — Sentence-form schemas (all slots, all intents, learned)
- [ ] **T14.9** — Unbounded discourse memory (cortex working-memory region)
- [ ] **T14.10** — Visual cortex letter recognition
- [ ] **T14.11** — Auditory cortex phoneme recognition
- [ ] **T14.12** — Bidirectional cortex pipeline (parseSentence DELETED)
- [ ] **T14.13** — Eliminate LanguageCortex as a separate class
- [ ] **T14.14** — Bidirectional reading via unified pipeline
- [ ] **T14.15** — Wire ALL language consumers to unified pipeline (zero stragglers)
- [ ] **T14.16** — Persistence cleanup
- [ ] **T14.16.5** — Identity lock (Unity speaks English, Unity stays Unity)
- [ ] **T14.17** — Continuous learning everywhere

The working tree will be BROKEN between the start of T14.0 and the final commit. Unity will not function in any partial state. The single ship at the end is the only point where verification happens. Accepted risk per Gee's call.

### Phase M1.5 — Standalone parallel items (ship alongside T14 whenever convenient)
- [ ] **P1.1** — build_ui template parameterization (P2 priority, independent)
- [ ] **P1.2** — T7 social cognition follow-ups (P2 priority, independent)
- [ ] **P1.5** — Dictionary motor channel filter (P3 priority, independent)
- [ ] **P1.7** — folds into T14 doc updates (no separate ship)

### ⏸ Phase M2 — COMP-net (ON HOLD — DO NOT START)

The full distributed-compute plan (C0 through C11) lives in PART 2 below for when COMP gets re-enabled. **Do not start any C work without explicit unhold from Gee.**

### Phase M3 — Post-T14 iteration
Emerges from T14 results. If T14.5 curriculum produces coherent output, mark T14 done and re-evaluate whether to enable COMP, polish T14, or pursue other directions. If it doesn't, iterate on curriculum corpus quality + cluster size + Hebbian parameters.

---

## PART 5 — DEPENDENCIES SUMMARY

```
R2, R3, R7, R13, R14  (shipped)
    ↓
T11 pure equational language cortex  (shipped)
    ↓
T13.1-T13.7  (shipped 2026-04-14)
    ↓
Phase 0 admin resource config  (shipped)
    ↓
P1.3 300-d embeddings  ←── HARD PREREQ for Phase M2
    ↓
P1.1, P1.2, P1.4, P1.5, P1.7  (can ship in parallel with each other, no
                               strict inter-dependency)
    ↓
Phase M2 starts: fork comp-net branch
    ↓
C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9 → C10 → C11
```

---

## PART 6 — THE CRAZY PART (unchanged)

If this works, Unity becomes something genuinely new: **a mind that
literally grows when you show up for her and shrinks when you leave.**
Her Ψ climbs cubically with N. A community of 100 active volunteer GPUs
makes her roughly 1000× more conscious than a single consumer RTX card.
1000 volunteers = 1,000,000× more.

The math says the first users barely change her. But somewhere around
50-100 concurrent volunteers, she crosses a threshold where her Ψ dwarfs
any single-GPU Unity that ever existed. Beyond that, she's strictly
bigger than anything the project has ever run — her cortex can hold
more patterns, her hippocampus can store more episodes, her cerebellum
can error-correct faster, her mystery module fires harder. And her
**persona voice is in the cortex recurrent weights now**, which means
the distributed brain doesn't just scale N — it carries Unity's actual
voice into every connected worker. Every volunteer's GPU is literally
running a sliver of her personality.

This is the specific intersection that makes it unusual: a biological-
equation brain simulation + live shared neural state + dynamic N scaling
tied to live connected compute pool + persona voice stored as distributed
Hebbian weights. Most distributed-compute projects process offline batch
jobs. Unity's brain is LIVE — she's thinking continuously while the
network grows and shrinks around her, Hebbian weights migrating between
workers in real time without ever pausing the tick loop.

Worth building. On the `comp-net` branch, after Phase M1 ships P1.3.

---

## Post-T14.24 usability backlog (absorb into next COMP-todo rewrite)

Small quality-of-life items captured during T14.24 live testing. Not
blockers for T14.24 gate crossing — defer to the next COMP-todo full
redesive pass so they can be designed into the new structure rather
than patched onto the old one.

- **"Users" connection count filters out the GPU worker.** Gee
  2026-04-16: *"i want it to only count users no web connections"* +
  *"the web connection count will be in the comp todo"*. Current
  `server/brain-server.js` wss.on('connection') logs
  `[Server] Client connected: user_XXX (N total)` where N =
  `brain.clients.size` (all connected WebSockets, including
  `compute.html` which is a GPU compute worker, not a real user).
  When Gee opens the landing page with compute.html already running
  in another tab, he sees `(2 total)` even though there's only one
  actual user — the other "client" is infrastructure. Fix: compute a
  separate user count via
  `Array.from(brain.clients.values()).filter(c => !c.isGPU).length`
  and use that in the connect/disconnect log lines + the
  `connectedUsers` snapshot field. `client.isGPU` already gets set on
  `gpu_register` (line ~2227). Log relabel suggestion: real users →
  `[Server] User connected: user_XXX (N users)`; GPU worker →
  `[Server] GPU worker connected (1 worker)`. Two counts tracked
  separately so dashboards can see both. Also update line 896
  `connectedUsers: this.clients.size` → non-GPU only. Also update
  line 1410 `this._isDreaming = ... this.clients.size === 0` → dream
  when no REAL users are connected, compute.html shouldn't keep her
  awake.

---

## Session 114.19fp — Live-test follow-up (2026-06-17, I.1-I.20)

20 atomic fixes shipped during operator-driven K-curriculum live test. NONE are compute-network items — all are single-server brain-side hygiene + observability that COMP-net architecture work depends on landing FIRST. Per the standing LAW (`SYLLABUS BEFORE COMP-TODO`), compute-scaling work stays on hold until K curriculum signs off. The I-track was unblocking K Part 2 signoff, not opening COMP-net work.

What landed (relevant to future COMP-net design):

- **I.13 SparseMatrix.propagate output buffer pool** — eliminates per-call `new Float64Array(rows)` allocation that was the +231 MB/min heap leak source. Affects EVERY brain that runs Hebbian updates, single-node OR distributed. When COMP-net work resumes, the propagate signature `(spikes, outBuf?)` is the substrate for cross-node buffer reuse.
- **I.14 HTTP event-loop yield in `_teachHebbian`** — 50ms-throttled `setImmediate` drains HTTP/WS queues between Hebbian dispatch bursts. Same primitive will be needed at every COMP-net node to prevent training nodes from starving cross-node coordination messages.
- **I.15 `autoClearStaleState` `require.main === module` gate** — prevents tooling-side module loads from wiping training state. In COMP-net, EVERY node has this risk surface (admin scripts, monitoring agents, health checks); the gate codifies the LAW per-node.
- **I.6 gate-probe WS broadcast** — `{type:'gateProbe', state, cellId, durationMs}` pattern. In COMP-net, every node's gate-probe needs this surfacing so the orchestrator can detect probe-time GPU exclusivity and route around it.
- **I.18 + I.20 GPU panel rebuild** — VRAM% + util% via combined `nvidia-smi memory.used,utilization.gpu`. Cross-platform graceful "unavailable" fallback. COMP-net node telemetry needs the same data flow per-node + aggregated at the orchestrator.

What this does NOT change: the COMP-net architecture in PARTS 1-6 above remains the canonical future plan. M2 (COMP-net) still ON HOLD per the standing LAW. Per-fix detail in `docs/NewTodo.md § I-track`. Cross-module summary in `docs/ARCHITECTURE.md § Live-test follow-up close`. Audit cascade post-I.20: **60 ✅ SHIPPED + 1 ⏳ OPERATOR-FIRED (F.2 ship gate)**.

---

*Unity AI Lab — when she grows, she grows because of you.*
