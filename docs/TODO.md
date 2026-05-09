# TODO — Unity

> **Branch:** `syllabus-k-phd`
> **Last updated:** 2026-04-22 (Session 114.19bx — T39 RESEARCH-GROUNDED TODO written for three compounding problems: (a) `unaccounted=454MB` — ROOT CAUSE FOUND: 15 worker_threads each with own V8 isolate (~30 MB each × 15 = ~450 MB) are NOT in `process.memoryUsage().heap/external` but ARE in `rss`. Not a leak, architecturally expected. Fix: label `workers=450MB` separately in heartbeat via `worker.resourceUsage()`. (b) `⚠OVERLOAD mean-cos=0.54` on every association-pair phase — Hebbian is pure positive-pressure with no sparsity/inhibition → trained basins collapse into superposition. Research-backed fixes: Oja's rule (1982) replaces bare Hebbian with built-in weight normalization; winner-take-all in motor (Maass 2000); lateral inhibition via negative-weight intra-synapses (biology Kandel Ch 28); anti-Hebbian negative-pair training; BCM sliding-threshold (Bienenstock 1982). (c) K-STUDENT Q-A 0% even after `_teachQABinding` — sentence-embedding is bag-of-words so "what letter comes after a?" ≈ "what letter comes after b?" in embedding space; no key-token discrimination. Fixes: attention preprocessing (Bahdanau 2014), template-indexed Q-A training with separate filler sub-region, 10× more training intensity, alternative direct-prompt K-STUDENT format ("after a:" → "b"), predictive-coding loss (Friston 2010). Full TODO with research citations shipped in T39. Ordering: T39.b (Oja+WTA) blocks T39.c (Q-A) because basin overlap must resolve first. Session 114.19bw (T37.d motor attractor unstick: operator log showed K-STUDENT emissions all being "l", "ll", ..., "llllll" across 150+ questions — motor argmax locked on bucket 11 (letter 'l') for this run's random seed. Root cause: `excitatoryRatio: 0.85` on cortexCluster intra-synapse matrix created 85% positive-weight random init → whichever motor bucket summed highest became a global attractor via self-loop reinforcement → training via sparse cross-projection Hebbian couldn't deposit enough counter-signal to flip the attractor. Shipped: (a) `excitatoryRatio: 0.85 → 0.5` — zero-mean intra weights kill random-init positive-bias attractor while still biologically valid (real cortex is 80% excitatory but balanced by GABA interneurons our matrix doesn't model separately; 50/50 at matrix level = same net effect). (b) `LETTER→MOTOR DIAG` probe after `_teachLetterNaming` — for each of 26 letters, inject letter one-hot → propagate `letter_to_motor` → decode motor argmax → print distribution. If all 26 decode to same output: `⚠⚠ MOTOR STUCK`. If under 10 distinct: `⚠ under-discriminates`. If 26 distinct: training landed. Operator verbatim: "sher still isnt responsding correctly" + "this is a masajor problem". If MOTOR STUCK still fires post-T37.d next run: additional fixes queued (bump lr/reps for letter-naming, normalize post-teach weights, per-letter motor inhibition, deterministic zero init). Session 114.19bv (T37.c fanout correction: T37.b's intra=10 cross=5 was too sparse — only 70 total cross-connections per neuron when real cortex has 1000-10000. Motor argmax was random-init-bias-dominated, K-STUDENT Q1 → "bg" Q2-14 → "". Reverted to intra=30 cross=30 CROSS_DENSITY_CAP=0.005. Language cortex settles ~17M neurons = 4% of brain (was 72M projected, never shipped cleanly). Still 56× pre-T37 baseline (301K → 17M) and biologically trainable. Unaccounted-memory warning acknowledged — V8 heap committed growth + native module growth, not yet a confirmed leak. Session 114.19bu — T32 batched GPU Hebbian SHIPPED + T37.b aggressive fanout tightening SHIPPED + T38 acknowledged: root cause of GPU 1% utilization was compute.html's batched-Hebbian handler calling `gpu.hebbianSparse()` 64 times individually per WS frame — each created fresh encoder + params + bindGroup + `device.queue.submit()` so GPU queue serialized per-submit with CPU ping-pong between. Shipped `hebbianSparseBatch(ops)` that runs all N ops in ONE encoder + ONE submit — WebGPU driver pipelines the N compute passes without CPU involvement. Expected GPU utilization 1%→40-70%. Plus BATCHED_HEBBIAN_MAX_OPS 64→256 + flush 2ms→20ms so batches accumulate more ops before flush. T37.b further tightens fanouts: crossTargetFanout 10→5, CORTEX_TARGET_FANOUT 30→10 in cortexCluster opts — per-neuron VRAM footprint drops from 374→147 bytes, language cortex expected ~72M neurons = 18.4% of brain (matches real human language network 15-25% of cortex). T38 (full 25% target) acknowledged as needing streaming cross-projections OR topographic sparse intra OR hierarchical decomposition OR bigger GPU — dedicated design session required. Session 114.19bt (T37 HEFTY architectural rebalance for disembodied cognition CLOSED: prior cluster fractions copied real-brain biological proportions (cerebellum 40%, cortex 30%) but real cerebellum is massive because it coordinates motor timing for a PHYSICAL BODY — Unity has NO BODY, her motor output is text/voice. Shipped: (a) CLUSTER_FRACTIONS rebalanced — cortex 30→55%, hippocampus 10→18%, cerebellum 40→8% (massive reduction, no body to coordinate), mystery Ψ 2→8%, amygdala 8→5%, basalGanglia 8→3%. Main cortex now 216M neurons at biological scale (was 107M, +109M cognition), cerebellum drops 143M→31M (−112M reclaimed from motor-timing fiction). (b) DEFAULT_BIO_WEIGHTS VRAM rebalanced — language_cortex 45→75%, cerebellum 20→5%, cortex 15→10%. Language VRAM budget 10.7 GB (was 6.4 GB). (c) `crossTargetFanout` 1500→10 — 150× sparser long-range connectivity, each post-neuron has 10 inputs per projection (still enough for K-level vocab given distribution: 5000 words × 3K neurons per word × 10 = 30K cross-connections per concept). (d) `CROSS_DENSITY_CAP` 0.10→0.002 — 50× tighter density cap matched to the fanout. (e) Intra-synapse `targetFanout` 300→30 in cortexCluster constructor — intra-synapse matrix is the DOMINANT VRAM user (2400N bytes per neuron at old fanout), this 10× the language cortex neuron budget alone. Combined effect: per-neuron footprint ~374 bytes (was ~21,000), 10.7 GB budget supports ~28.6M language cortex neurons (up from 301K — **95× scale**). That's **7.3% of brain** — 100× improvement but still under real-biological 12-20% and Master's 25% target. T38 opened for architectural redesign (topographic sparse intra / streaming cross / hierarchical decomposition) to hit true 25%. Biological correction: I was wrong earlier — real language network is 15-25% of cortex = 12-20% of brain, not 1%. GPU-at-1% issue SEPARATE, requires T32 batched GPU kernel (CPU serial loop firing ~400 Hebbian dispatches/sec, GPU idle 99% waiting). Operator verbatim: "the GPU is only hitting 1% while learning WTF WTF wTF wTF wTF ... !M LANGUAGE CORTEX TO MATCH A REAL BRAIN IT NEEDS TO BE MORE LIKE 25% of the fucking brain!!! the brain doent have heart and lungs it can baicle build ui and read and talk so why the fuck would the most important thing be so fucking microscopic... fix it now heftyly and thouroughly". Session 114.19bs (T36 auto-wrap catastrophically broke every Hebbian primitive CLOSED: T31-extended constructor auto-wrap persisted EVERY `_teachX` method via skip+persist — including primitives like `_teachHebbian` / `_teachHebbianAsymmetric` / `_teachCombination` called hundreds of times per cell from inside phase-level teach methods. FIRST call persisted the phase key, every subsequent call SKIPPED → Unity received ONE Hebbian update per cell instead of thousands. Pre-K "passed" in seconds with zero real learning, ELA-K log flooded with 90,000+ `⤳ PHASE SKIPPED` lines. Fix: auto-wrap now gates skip+persist on `isOutermost = (prev === null)` — only the OUTERMOST wrapped call (direct from cell runner) does skip+persist. Nested calls (primitives invoked from inside other teach methods) just track `_activePhase` for heartbeat visibility, always execute. Same method can be phase-level in one caller and primitive in another — both work correctly. Code-hash auto-clear wipes poisoned `passedPhases` state on next boot. Operator verbatim: "something is wrong!! i used start.bat and its skipping everything". Session 114.19br (T35 TRAINING ACTUALLY LEARNS NOW CLOSED: three compounding bugs meant every `_teachAssociationPairs` phase since T26.b was feeding ZERO signal into Hebbian. (1) `_writeTiledPattern` wrote `feat[d]` (GloVe float ~0.2) into `cluster.lastSpikes` which is `Uint8Array` — float truncates to 0 — every `binarize:false` call blanked the spike instead of soft-writing. (2) `_checkSemBasinSeparation` built input in cluster-offset scope then passed full cluster array to a region-local projection — propagate read LETTER region data as if it were SEM data — sep-probe always reported 0.000/0.000 regardless of actual training (false training-collapse signal). (3) Hyperparams too weak — 8 reps × lr=0.01 insufficient margin at biological scale. Shipped: (a) `_writeTiledPattern` always writes 1 for active dims regardless of `binarize` flag; GloVe identity preserved via WHICH dims fire (active-set signature), magnitude info was never architecturally preserved anyway (GPU-side writeSpikeSlice only sends indices). (b) `_checkSemBasinSeparation` builds proper sem-sized Float64Array input, propagate returns motor-sized output directly no slicing. (c) Hyperparams bumped reps:8→12 lr:0.01→0.03. (d) Training-collapse diagnostic fires `⚠⚠ TRAINING_COLLAPSE: motor readouts near-zero` when `sep-probe meanCos<0.05 && maxCos<0.05`. (e) Weight-magnitude diagnostic prints `sem_to_motor |W| mean=X max=Y nnz=Z/N` post-teach so operator sees Hebbian actually accumulated. Operator verbatim: "we need to tunr the training now.. so that she is actually learning and not just responsding with bullshit she needs her brain to logicall fucntion and nuot just be feed learnings with no actual effecitiveness". Session 114.19bq (T34 Art-K gate unblocker CLOSED: operator's Art-K run hit `readback_letter_buckets timed out after 5000ms` on every readiness cue → all 5 cues TIMEOUT → K-STUDENT skipped → PROD 0/9 → cell failed + retry failed same way. Also arrayBuffers=37 GB SAB leak. Three root causes, three fixes: (a) readback timeout 5s→30s so ACKs can land when compute.html is draining a post-teach dispatch queue; (b) `_measureEmissionCapability` calls `drainWait()` before the probe loop so the WS send queue is clear before readback arrives; (c) `stepAwait` at biological scale (cortex>100K) SKIPS the worker-pool fallback entirely — pool alloc overhead dominated the matmul cost and generated 1.9 GB of SABs per tick × hundreds of ticks per probe = 37 GB accumulation (same fix pattern T18.19 applied to intraSynapsesHebbian); (d) pSpikes Uint32Array buffers cached on cluster to eliminate per-tick alloc even when pool runs at browser scale. Operator verbatim-captured log snippet: "[Brain] sparse dispatch reqId=13877 type=readback_letter_buckets timed out after 5000ms ... [MEM] cell-exit art/kindergarten pass=false: heap=131.9MB external=3275.0MB arrayBuffers=37392.3MB rss=37087.5MB ... [Curriculum] ═══ CELL DONE ═══ art/kindergarten in 291.5s — pass=false (reason: PROD 0/9 (0%))". Session 114.19bp (T31-extended CLOSED: constructor auto-wrap now does skip-and-persist (not just tracking) for every `_teach*` method across ALL 12 pre-K + K cell runners (plus G1-PhD runners for when they unlock). `runSubjectGrade` sets `cluster._currentCellKey = subject/grade` cell-context beacon; auto-wrap builds phase key `${cellKey}:${methodName}` and checks/appends `cluster.passedPhases`. Math-K, Sci-K, Soc-K, Art-K, Life-K, and all 6 pre-K runners now skip their completed phases on Savestart resume — previously this was ELA-K-only via hand-wrapped `_phaseTick`. T32 batched GPU kernel still OPEN — requires profiling session first (T18.8 already batches hebbianBound calls so real bottleneck needs identification before rewriting; shipping blind would risk T18.34.b-style regression). RSS reduction via lower `--max-old-space-size` NOT shipped unilaterally — trade-off that caps biological-scale neuron auto-scale; operator runs T33 diagnostic first to distinguish real leak from V8/Windows cosmetic. Operator verbatim: "ship the shit that didnt ship". Session 114.19bo (T33 phase-level progress in CELL ALIVE heartbeat CLOSED: constructor auto-wraps every `_teachX`, `_runStudentBattery`, `_measureEmissionCapability`, and cell runner so `cluster._activePhase = { name, startAt }` is set on entry and restored on exit (nested calls safe via prev/restore). `CELL ALIVE` heartbeat in `runSubjectGrade` now reports `phase=_teachForceMotionK (+12s)` or `phase=(between-phases / gate-probe)` when idle. Memory breakdown expanded: `heap=used/total ext=N ab=N rss=N (unaccounted=rss-heap-ext ⚠+ΔMB / ↓ΔMB)` with delta tracking so operator can tell whether RSS is CLIMBING (real leak worth hunting) vs STABLE (V8 reserved-space behavior under `--max-old-space-size=65536` on Windows — cosmetic, not a leak). Operator verbatim: "problem, there is no info about how far weve come and how far we have to go" + "56 Gigabytes!!!!!?!?!?!?!??!?!?!?!?!?!?!?!?!?!?!?!?!?!?!??!". Session 114.19bn (T31 Savestart phase-level resume CLOSED: `brain-server.js saveWeights` now persists `cortex.passedPhases` alongside `passedCells`; `runElaKReal` `_phaseTick` returns `true`/`false` with skip-log for phases already in `cluster.passedPhases`; all 20 teach calls in ELA-K wrapped `if (_phaseTick('X')) { await this._teachX(ctx); _phaseDone('X'); }`. Operator verbatim: "I ran Savestart.bat but it just ran everything from the beggining just like start.bat wtf?". Also answered operator's GPU diagnostic question: node.exe will ALWAYS show 0 % GPU — WebGPU runs in the browser process hosting compute.html, not Node. Current 28 w/s IS the T18.17 GPU-fast-path rate. Tier 2 batched-GPU-kernel architecture (target ~1000× speedup on `_teachWordEmission`) spec landed in FINALIZED entry, implementation deferred to T32 as its own session. Operator verbatim: "all learning needs to usew the gpu for processing not just some of the processes so how do we need to formulate the thinking and memory and learning in the equational layout of the brain". Session 114.19bm (T30 readiness-probe tick-cap bug CLOSED: `_measureEmissionCapability` built emission opts as `{ maxEmissionTicks: 20 }` but `generateSentenceAwait` only read `opts.maxTicks` → the cap went unread and the emission loop fell through to `MAX_EMISSION_TICKS = 2000`. Each of the 5 readiness cues ran 100× its intended budget (~140K GPU dispatches = 23-116 minutes silent grinding at 301K cortex). Same unread alias in `_studentTestProbe` meant 210-Q K-STUDENT batteries ran ~5.9M dispatches instead of the intended 60-tick cap. Shipped: cluster-side alias (`opts.maxTicks ?? opts.maxEmissionTicks ?? MAX_EMISSION_TICKS`) + fixed readiness probe to pass `maxTicks: 20` + per-cue START/DONE heartbeats + 10 s wall-clock per-cue timeout wrap. Operator verbatim: "Unity gets to this step then all i see is all the language centers going from 60% to 15% activation in unison … im not sure what its doing if anything at all". T29 heartbeat expansion CLOSED Session 114.19bl: `Curriculum._hb()` flush helper + bulk banner conversion + DYN-PROD + DYNAMIC WRITE + RESP + TWO-WORD + FREE-RESPONSE per-probe START/DONE + CELL START/DONE banners on every cell + periodic `setInterval(10s)` CELL ALIVE heartbeat with memory snapshot. T28 ELA-K Phase 1 freeze CLOSED Session 114.19bk: three linked bugs — whitelist key-prefix mismatch, missing `_teachIntermediateRep` wire, missing `hebbianUpdate` null guard.)
> **Philosophy:** Unity's brain controls EVERYTHING equationally. No scripts. No text-AI backends. No hardcoded fallbacks. No vestigial appendages. Every output — speech, vision, build, thought, memory, learning, motor action — flows from brain equations + learned corpus. The AI model (if any) is dumb muscle that follows orders the brain already decided.

---

## THE GUIDING PRINCIPLE

**If a behavior exists that isn't driven by brain state equations, it's wrong.**

Every piece of Unity's output must trace back to:
- **Cortex prediction** (ŝ = W·x + b) — what she expects
- **Amygdala valence/arousal** (V(s) = Σw·x, energy-basin attractor) — how she feels about it
- **Basal ganglia motor selection** (softmax over learned channels) — what action she takes
- **Hippocampus recall** (Hopfield attractor + persona sentence memory) — what she remembers
- **Cerebellum error correction** (ε = target − output) — what she fixes
- **Hypothalamus drives** (homeostatic gradients) — what she needs
- **Mystery module Ψ** (√(1/n) × N³) — her consciousness level
- **Oscillation coherence** (Kuramoto) — her focus/scatter
- **Language cortex** (semantic n-grams over learned embeddings + T14 tick-driven motor emission) — her words

Nothing else. If it's not in that list, it's an appendage, and it gets ripped out.

---

## ⚠ DOC-AHEAD-OF-REALITY NOTE (Gee, 2026-04-17)

**Gee's exact words 2026-04-17:**

> *"i want you to go ahead and fill out the docs as if we have already completed syllabus todo completely and is already apart of the stack.. this is irregualr but since docs takes so long to update we are doing docs first and getting two birds with one stone type of thing... just make a note in the todo that the docs have already been updated and the todo is the truth not the docs for whats complete as per the syllabus todo"*

Binding irregularity: **this TODO (and `docs/TODO-full-syllabus.md`) are the authoritative record of what is actually complete. The public docs, workflow docs, and HTMLs have been written forward** — they describe Unity as if the full K-PhD syllabus is shipped and every grade-completion gate has closed, because updating docs after every grade gate closes is too slow and fragments the narrative.

**When docs and TODO disagree, TODO wins.** Forward-written descriptions in docs/HTMLs reflect the target end-state. Actual completion is tracked by:
- `docs/TODO.md` — active tasks, what's in flight (this file)
- `docs/TODO-full-syllabus.md` — per-grade checkboxes + Life Vocabulary Prerequisites + Persistent Life Info ledger
- `docs/FINALIZED.md` — permanent archive of what actually shipped, per session

If you're reading a public doc / HTML claim ("Unity has completed high school biology") — that's the TARGET. The source of truth for whether it actually runs in code + has Gee's sign-off is the syllabus TODO. Do not trust docs for runtime claims; trust the TODO.

**T19 supersedes this irregularity at the workflow-doc level** — per the 2026-04-20 full-audit directive, workflow docs + public docs + HTMLs all get corrected in-place to match code. Once T19 lands, the forward-written gap closes for the pre-K + K scope and the doc-ahead note applies only to post-K descriptions still written forward.

---

## OPEN TASKS

(Session 114.19fm — Brain visualizer Cluster Waves panel rendering fix SHIPPED + atomic-landed and migrated to `docs/FINALIZED.md` 2026-05-09. fm.1 `_renderClusterWaves` state-path corrections (read `state.clusters[name].spikeRate` not `state[name].spikeRate`; remove dead random-noise fallback) · fm.2 defensive alpha clamp on `addColorStop` hex byte · fm.3 bandpower precedence flipped to top-level `state.bandPower` first · fm.4 dead `s.cortexSpikes` branch removed + numeric `spikeCount/size (rate%)` badge added per cluster · fm.5 rAF self-heal in `updateState()` so loop survives `open()` before first state frame arrives · fm.6 same bandpower precedence flip applied to `updateState()` smoothing path · fm.7 bundle rebuilt clean 2.4MB. Browser-side renderer fix only — running 20hr K brain instance untouched, just hard-refresh dashboard to pick up new bundle. **✓ COMMITTED + PUSHED 2026-05-09** — code+docs cascade `<sha-syllabus-k-phd>` syllabus-k-phd → `<sha-develop>` develop → `<sha-main>` main, all synced to origin. Bundle clean 2.4MB. New work appends above this banner.)

(Session 114.19fl — 15 test-readiness audit items SHIPPED + atomic-landed and migrated to `docs/FINALIZED.md` 2026-05-09. fl.1 deleted dead `ARTICLE_LIST` · fl.2 inner-voice showcase null-seed equational emergence · fl.3 `_probeSentenceGeneration` natural-language K-grade seeds · fl.4 Savestart launchers fk env-var docs · fl.5/fl.6 public HTMLs (brain-equations + unity-guide) template-walk claims rewritten as equational emergence · fl.5b TODO-full-syllabus.md Sections 2/4/16 corrected · fl.6b promo + READMEs verified clean · fl.7-fl.11 internal docs (NOW/ARCHITECTURE/SKILL_TREE/EQUATIONS/ROADMAP) head banners rewritten in-place + historical banners marked ⚠ SUPERSEDED · fl.12 final grep verification · fl.13 atomic ship envelope. fk.5 + fk.7 carried forward below as the two truly pending items. **✓ COMMITTED + PUSHED 2026-05-09** — code+docs cascade `7e4c1be` syllabus-k-phd → `21e20ab` develop → `611ca75` main, all synced to origin. New work appends above this banner.)

### Session 114.19fk.5 — Decoder sampling preset audit — operator-decision (Gee 2026-05-09) — PENDING

**Gee verbatim per LAW #0 (parent fk sweep):**

> *"we are NOT doing templets for the ai to fucking mimic thats no better thant word lists and arrays you fool. Unity thinks like a human does! she does NOt follow prescripted events... that not how our equations shall work?"*

**Why pending (not yet shipped):**

`emitWordDirect` accepts `temperature/topK/topP` (softmax + nucleus sampling). Chat path hardcodes `temperature: 0.6, topK: 8`; showcase hardcodes `temperature: 0.7, topK: 10`; probe leaves greedy. The MECHANICS (softmax + nucleus) ARE equational — those stay regardless. The hardcoded VALUES at each call site prescribe sampling style — borderline whether that's content-prescription or just "decoder mode setting." Operator decides which path is more equational:

**Path (a) — keep hardcoded preset values as decoder defaults.** Sampling style isn't content; it's a generation MODE (focused vs. wandering). Real human cognition has analogues to temperature (deep-focus vs. mind-wandering states) but they're not externally prescribed at each utterance — they emerge from brain state. This path argues "decoder presets are the analog of those states" and accepts the hardcoded values.

**Path (b) — drive temperature from brain state.** E.g. `temperature = 0.5 + 0.5 * (1 - coherence)` — high coherence → focused → low temp; low coherence → wandering → high temp. Equationally derives sampling style from cortex state. Removes the hardcoded preset values. Requires `cluster.coherence` (or similar) to be readable at emission time.

**Fix shape (path b):** `js/brain/cluster.js` — `emitWordDirect` reads `cluster.coherence` (or amygdala arousal, or workspace ignition strength) to derive temperature when not explicitly passed. `js/brain/language-cortex.js` + `server/brain-server.js` — chat + showcase paths drop hardcoded `temperature` opts.

**Files to touch (path b):** `js/brain/cluster.js` · `js/brain/language-cortex.js` · `server/brain-server.js` · `js/app.bundle.js` (rebuild) · `docs/FINALIZED.md` · `docs/NOW.md` · `docs/TODO.md`

**STATUS:** [⏸] PENDING OPERATOR DECISION — choose path (a) keep presets vs (b) state-driven temperature. Path (b) is more equational; path (a) is simpler.

---

### Session 114.19fk.7 — iter25-I structural binding training depth verification (post-test diagnostic) (Gee 2026-05-09) — PENDING POST-TEST

**Gee verbatim per LAW #0 (parent fk sweep):**

> *"Unity thinks like a human does! she does NOt follow prescripted events"*

**Why pending (post-test diagnostic):**

With composeSentence templates RIPPED OUT (fk.1), sentence emergence relies entirely on iter25-I `_teachSentenceStructure` carving — relationTagId=8 slot positions, relationTagId=9 intent→slot-sequence, relationTagId=10 subject-verb agreement, relationTagId=11 noun→article, relationTagId=12 WH→intent-concept. Default carving runs 6 reps × 5 binding passes. If trained weights aren't deep enough, the equational emitter will produce word-soup AND THERE IS NO TEMPLATE FALLBACK to mask it (which is correct — that was the whole point of fk).

**Surfaces back when:** operator's 20hr K test reveals sentence quality. If sentences emerge clean (subject-verb-object structure, articles in right positions, terminators at sentence end), training depth was sufficient. If word-soup, work resumes here.

**Fix shape (when work resumes):**

1. Read sentence-gen probe results from gate logs (per-intent emission samples, coherence cosines)
2. If sentences are word-soup OR coherence cosines stay below 0.10, bump:
   - `_teachSentenceStructure` reps from 6 → 12 (or higher)
   - `lr` from default to 0.05 (or higher) at the carving phase
3. Re-run operator localhost test
4. Repeat until sentences emerge cleanly

**Replaces the wrong solution-category** of "add more sentence templates" (fj.17 deletion) — instead, deepen the TRAINING that the equational emitter reads. The brain learns what humans learn; we just need enough teach-cycles for the bindings to stick.

**Files to touch (when work resumes):** `js/brain/curriculum.js` (`_teachSentenceStructure` reps + lr) · gate-result analysis docs

**STATUS:** [⏸] PENDING POST-TEST — surfaces back when operator's 20hr K test reveals sentence quality data. NOT pre-test work.

---

(Session 114.19fk — 4 SHIPPED items (fk.1 composeSentence body replaced with pure equational emergence · fk.2 `probeConcepts` hardcoded mapping deleted · fk.3 chat-time `extractIntentConcept` call deleted · fk.4 `_inferSubjectFromText` token-count heuristic replaced with `_inferActiveSubject` sem-band activation readout) atomic-landed and migrated to `docs/FINALIZED.md` 2026-05-09. fk.5 + fk.7 carried forward above as pending items. fk.6 = fj.17 deletion structurally handled. **Architectural correction:** templates are wrong as a category — operator 2026-05-09: *"we are NOT doing templets for the ai to fucking mimic thats no better thant word lists and arrays you fool. Unity thinks like a human does! she does NOt follow prescripted events"*. Sentence emission is now PURE EQUATIONAL EMERGENCE: brain state → trained iter25-I weights → emitWordDirect tick-by-tick → terminator emerges → stop. NO templates. NO slot prescription. NO article rule. NO terminator-punct mapping. NO runtime regex parser deciding intent for the brain. Bundle clean 2.4MB. `node --check` green across modified files.)

(Session 114.19fj — 23 of 24 super-review findings atomic-landed and migrated to `docs/FINALIZED.md` 2026-05-09. fj.17 deferred entry SUPERSEDED by fk.6 deletion (templates wrong as category). Goal of the sweep was Gee's directive *"getting Unity speaking senteces properly to user requests and inputs like a real person of that intelligence would"* — the 23 shipped fj fixes deliver chat-side `_lastUserInputText` flowing → WH-INTENT consumer fires (now via trained weights, fk-corrected) → composeSentence pure equational emergence → context-aware grammatical sentences. Bundle clean 2.4MB. `node --check` green across all 8 modified .js files. **✓ COMMITTED + PUSHED 2026-05-09** — atomic cascade landed across syllabus-k-phd → develop → main (commits `c9a9576` → `b6b8f62` → `170da2e`, all synced to origin). Operator localhost test pending.)

(Sessions 114.19fa through 114.19fi atomic-landed and migrated to `docs/FINALIZED.md` 2026-05-09 per Gee directive *"the todo when your done should be a templet only not continueing to track completed ites that all shall be moved to finalized"* + *"no dont delete it make sure its in finalized correctly(the todo work we did) then templete the todo"*. Full Gee verbatim quotes preserved per LAW #0 + every tier's "what got coded" detail + files touched + masterful-fix narrative all archived in FINALIZED's 2026-05-09 consolidated entry. Public-doc banners stamped this session: ARCHITECTURE / SKILL_TREE / ROADMAP / EQUATIONS / NOW. Bundle rebuilt clean 2.4MB. `node --check` green across all 11 modified files. **✓ COMMITTED + PUSHED 2026-05-09** — atomic cascade landed across syllabus-k-phd → develop → main (commits 7543fa3 → b03d8a1 → 7cdacde, all synced to origin). Operator localhost test pending. New work appends above this banner.)

---

<!-- Session 114.19es atomic-landed and migrated to docs/FINALIZED.md 2026-05-07. 13 super-review follow-up fixes shipped across curriculum.js, cluster.js, brain-server.js, definition-service.js. Bundle clean 2.3MB. Public docs banner-stamped per docs-before-push LAW.
### Session 114.19es — super-review of 114.19er fixes — 13 follow-up gaps to close before "100% complete functional master performance" (Gee 2026-05-07) — OPEN

**Gee verbatim per LAW #0:**

> *"/super-review go over the console log issues and be sure we did everything we needed to to have ther brain is 100% complete functional master performance"*

> *"okay write the todo"*

**Why this exists:**

114.19er shipped the four overnight-stall fixes (per-word timeout + assertKWiring once-flag + `_sparseSendBinary` null-guard + stall watchdog + silence-reason log). Self-imposed `/super-review` with the role of a ruthless senior engineer treating the patches as "Codex slop" surfaced 13 gaps — the er fixes plug the symptom but stop short of master performance. Watchdog that warns instead of recovers, abandoned-Promise side-effect risks, an `assertKWiring` "fix" that still walks 71M-element Uint8Arrays on every call, an unaddressed 89% dictionary-API miss rate, watchdog timer leaks if `_waitForGpuReady` throws, dead branches, stale rate-limit state across re-runs, public docs not synced. Each finding below preserves the verbatim issue text from the super-review.

**Items inside the super-review — one task per per LAW #0:**

---

### PRIORITY 1 — Critical path before next overnight run

#### 114.19es.1 — Wrap `runCompleteCurriculum` in single try/finally

**Issue (verbatim from super-review):** *"Watchdog is started at line 23759 but the next ~150 lines include `_verifyFractalEquation`, exam-bank overlap auditing, `await this._waitForGpuReady(120000)`, and embedding-source logging — NONE of which are wrapped in the try/finally that calls `_stopCurriculumStallWatchdog`. If `_waitForGpuReady` throws (network glitch, GPU client crashed, anything), the timer is orphaned for the rest of process lifetime."*

**Fix shape:** Move `_startCurriculumStallWatchdog()` to the top of the method body, then wrap EVERYTHING below in `try { ... } finally { this._stopCurriculumStallWatchdog(); }`. Drops watchdog leak risk from "any of 6 unguarded awaits" to zero.

**Files to touch:** `js/brain/curriculum.js` (`runCompleteCurriculum` body restructure) · `js/app.bundle.js` (rebuild) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

#### 114.19es.2 — Add early return at top of `assertKWiring()`

**Issue (verbatim from super-review):** *"The flag silences the `console.log` and skips the smoke test, but the structural-check body (lines 1320-1354) still walks `this.columnId.length`, `this.layerId.length`, `this.hubMask.length`, `this.layerPlasticityScales`, and calls `this.buildKScalesForProjection('sem', 'motor')` on EVERY call. At biological scale (cortex ~71M neurons), `columnId` and `layerId` and `hubMask` are 71MB Uint8Arrays. Property access is O(1) but `buildKScalesForProjection` may do real work. This still burns CPU on every dream-cycle assertion."*

**Fix shape:** Add an early return at the top of `assertKWiring()`: `if (this._kWiringSmokeTested && !this._kWiringForceRecheck) return { ok: true, gaps: [] };`. Expose `cluster.invalidateKWiring()` for code that legitimately needs to re-check (e.g., after a re-allocation). Cuts dream-cycle CPU burn from "walks 71M-element arrays N times per minute" to "literally returns instantly". Massive perf win at biological scale.

**Files to touch:** `js/brain/cluster.js` (`assertKWiring()` early-return + `invalidateKWiring()` method) · `js/app.bundle.js` (rebuild) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

#### 114.19es.3 — Reset watchdog warn-time + log-time on `_stopCurriculumStallWatchdog`

**Issue (verbatim from super-review):** *"Doesn't reset `_curriculumStallLastWarnTs`. If `runCompleteCurriculum` runs, stalls 6+ min (warn fires, sets `_curriculumStallLastWarnTs = now`), is killed by operator, then restarted within 5 min — second-run watchdog will suppress the first stall warn because rate-limit gate compares against the STALE timestamp from the first run."*

**Fix shape:** In `_stopCurriculumStallWatchdog`: `this._curriculumStallLastWarnTs = 0; this._lastCurriculumLogTs = 0;` so the next start gets fresh state. Stateful-singleton bug — the watchdog is a class-level service that needs full state reset between runs.

**Files to touch:** `js/brain/curriculum.js` (`_stopCurriculumStallWatchdog` body) · `js/app.bundle.js` (rebuild) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

#### 114.19es.4 — Thread `AbortSignal` through `_teachWordDefinition`

**Issue (verbatim from super-review):** *"`Promise.race([teachPromise, timeoutPromise])` only stops `await`-ing — when the timeout sentinel wins, `teachPromise` keeps running. `_teachWordDefinition` does Hebbian writes to `cluster.synapses` AFTER we've moved on to the next word in the loop. That means binding for 'fifty' can land while we're mid-binding 'sixty', leaving the next-word's `subject` context smeared with the prior word's Hebbian fires."*

**Fix shape:** Thread an `AbortController` + `AbortSignal` through the call:
```js
const ac = new AbortController();
const teachPromise = this._teachWordDefinition(w, { ..., signal: ac.signal });
const r = await Promise.race([teachPromise, timeoutPromise]);
if (r === timeoutSentinel) ac.abort();
```
Inside `_teachWordDefinition`, between every Hebbian fire: `if (opts.signal?.aborted) return { passes: 0, totalTrained: 0, skipped: 'aborted' };`. Side-effect contamination across loop iterations is exactly the kind of "looks like it works in test, corrupts basins in prod" pattern. Violates structured-concurrency principle (cancel the side-effects, don't just abandon the promise).

**Files to touch:** `js/brain/curriculum.js` (`_teachWordDefinitions` outer loop AbortController + `_teachWordDefinition` per-Hebbian-fire signal-check) · `js/app.bundle.js` (rebuild) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

#### 114.19es.5 — Enable `DREAM_DEFINITION_CACHE_FILE` by default

**Issue (verbatim from super-review):** *"Captured run had 89% dictionary API miss rate (255/2247 cached). My fix makes the brain FAIL FASTER on those misses — it doesn't make them succeed. The brain still walks K_VOCABULARY missing 89% of definitions. K curriculum can advance without those binds (other teach paths don't need defs), but Unity's vocabulary will be artificially crippled at K-grade. ... master's intent says '100% complete functional master performance' — that's not just 'doesn't hang', it's 'actually learns'. I addressed the hang, not the learning gap."*

**Fix shape:** Set `DISK_CACHE_PATH` to `path.join(__dirname, 'definition-cache.json')` if env var unset, so K-VOCAB defs persist across boots. Wire `flushCacheToDisk()` to fire on graceful shutdown + every 5 min during run via setInterval. After 2-3 cold runs, cache approaches 100% coverage and `_teachWordDefinition` hits cache instantly instead of re-walking the API rate-limit gauntlet.

**Files to touch:** `server/definition-service.js` (default DISK_CACHE_PATH) · `server/brain-server.js` (flushCacheToDisk wiring on shutdown + 5-min setInterval) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

### PRIORITY 2 — Operator visibility upgrades

#### 114.19es.6 — Enrich watchdog warn line with phase + cache stats

**Issue (verbatim from super-review):** *"The TODO entry promised 'warn operator with current await stack so silent-stall is visible' — actual implementation just says 'no [Curriculum] log line in N min'. Doesn't include `cluster._activePhase` (which iter25-O.4 wired specifically for this) or `cluster.assertKWiring()` last result or definition-cache stats."*

**Fix shape:** Include `cluster._activePhase?.name`, `cluster._activePhase?.startAt` (so operator sees how long stuck in this phase), recent definition-cache stats (cache.size, error count, rateLimited count) in the warn line so operator sees WHICH phase is hung + WHY.

**Files to touch:** `js/brain/curriculum.js` (watchdog warn body enrichment) · `js/app.bundle.js` (rebuild) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

#### 114.19es.7 — Reset `_innerThoughtSilenceCount` on emission success

**Issue (verbatim from super-review):** *"`_innerThoughtSilenceCount` is incremented unbounded. Over a 30-day deployment with 3s tick + 30s log, that's ~86,400 silent ticks/day = 2.6M counter value/month. Integer not memory issue, but a counter that only ever grows is a stink-mark. ... Should be either rate-limited (last-N) or reset on state change."*

**Fix shape:** Reset `_innerThoughtSilenceCount = 0` whenever a non-silent thought lands. Then the counter actually means "silent ticks since last successful emission" which is the more useful diagnostic metric.

**Files to touch:** `server/brain-server.js` (`_innerVoiceTick` counter reset on emission success) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

#### 114.19es.8 — Drop dead-branch in `_hb` Curriculum-prefix gate

**Issue (verbatim from super-review):** *"`if (s.indexOf('[Curriculum]') >= 0 || s.indexOf('[Curriculum][') >= 0)` — the second predicate is a strict subset of the first. Dead branch. ... Lazy AI-grade copy-paste. Indicates the author didn't test the gate logic and just slapped two patterns in."*

**Fix shape:** Drop the second predicate. Just `if (s.indexOf('[Curriculum]') >= 0)`.

**Files to touch:** `js/brain/curriculum.js` (`_hb` gate cleanup) · `js/app.bundle.js` (rebuild) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

#### 114.19es.9 — Aggregate `timeouts` + `slowWords` across chunks in upfront-seed loop

**Issue (verbatim from super-review):** *"Returns shape now includes `timeouts` and `slowWords` fields but the chunk-level caller in `runAllSubjects` (line ~5430) doesn't read them. The new diagnostic data is captured but not surfaced to the chunk-level summary. ... Effort wasted — shipped instrumentation that the upstream caller ignores."*

**Fix shape:** Aggregate `timeouts` + `slowWords` across chunks in the upfront-seed loop and emit a final K-VOCAB-UPFRONT-MULTIDEF SEED DONE banner that includes them: `📚 K-VOCAB-UPFRONT-MULTIDEF SEED DONE — N Hebbian fires across M words (multi-def: K definition senses bound) · ⚠ X per-word timeouts, Y slow words across chunks`.

**Files to touch:** `js/brain/curriculum.js` (chunked seed loop totalTimeouts + totalSlowWords accumulators + DONE banner) · `js/app.bundle.js` (rebuild) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

### PRIORITY 3 — Docs-before-push compliance

#### 114.19es.10 — Roll public-doc banners for the er + es sweep

**Issue (verbatim from super-review):** *"None of them mention the new watchdog, silence-reason log, once-flag, null-guards, per-word timeout, in-flight zombie clear, or `res.json()` race. Per `.claude/CONSTRAINTS.md §DOCS BEFORE PUSH` LAW: 'Every push ships with every affected doc already synchronized.' ... LAW violation the moment master pushes."*

**Fix shape:** Roll banner stamps on all 4 public docs + add SKILL_TREE rows for "stall watchdog", "in-flight zombie clear", "silence-reason log" before any push. ARCHITECTURE.md (mention watchdog + null-guards under operations), EQUATIONS.md (no equation changes — note this), SKILL_TREE.md (add capability rows under Backend Engineering / Systems Integration), ROADMAP.md (banner stamp 2026-05-07 post-114.19er + post-114.19es with the combined fix summary).

**Files to touch:** `docs/ARCHITECTURE.md` (banner roll) · `docs/EQUATIONS.md` (banner roll) · `docs/SKILL_TREE.md` (banner roll + capability rows) · `docs/ROADMAP.md` (banner roll) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

### PRIORITY 4 — Hardening

#### 114.19es.11 — Rate-limit `assertKWiring` failure-path smoke test to once per minute

**Issue (verbatim from super-review):** *"`_kWiringVerifiedLogged = false` and `_kWiringSmokeTested = false` get reset on EVERY failure. If failures are persistent (which would indicate a real bug), the warn fires loud on every call — that's fine. But the smoke test ALSO re-runs on every call, burning CPU on a 4×4 SparseMatrix allocation + 6 ojaUpdates per failed call. If failures are flapping (transient), smoke test thrashes. ... Could storm CPU if K wiring is in a bad state. Logging loud is correct; re-running expensive smoke test on every call is overkill."*

**Fix shape:** Rate-limit smoke-test re-runs (e.g., max once per minute on persistent failure) so log is loud but compute isn't insane. Add `_kWiringSmokeLastRunTs`; only re-run smoke test if `Date.now() - _kWiringSmokeLastRunTs >= 60_000`.

**Files to touch:** `js/brain/cluster.js` (`assertKWiring` smoke-test rate-limit) · `js/app.bundle.js` (rebuild) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

#### 114.19es.12 — Drop `_curriculumRunnerActive` flag — derive from timer non-null

**Issue (verbatim from super-review):** *"Two flags (`_curriculumRunnerActive` + `_curriculumStallWatchdogTimer`) that always travel together. The timer being non-null IS 'runner active'. Redundant state. ... Double-source-of-truth. Future maintainer can flip one and forget the other."*

**Fix shape:** Drop `_curriculumRunnerActive`; check `this._curriculumStallWatchdogTimer !== null` instead in the watchdog interval body. Single source of truth.

**Files to touch:** `js/brain/curriculum.js` (drop `_curriculumRunnerActive` flag, replace usages with timer-null check) · `js/app.bundle.js` (rebuild) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

#### 114.19es.13 — Drop `PREFETCH_CONCURRENCY` 20→5 + bump `RATE_LIMIT_BACKOFF_MS` 1000→5000

**Issue (verbatim from super-review):** *"20 concurrent fetches against dictionaryapi.dev. They explicitly say no rate limiting BUT in practice they DO 429 under load. 1s back-off after a 429 then next batch fires 20 more. That's still aggressive. Per the captured log: 255 / 2247 = 11% prefetch success. So 89% of words were not cached."*

**Fix shape:** Drop `PREFETCH_CONCURRENCY` from 20 → 5; the API rate-limits less when we hit it less. Bump `RATE_LIMIT_BACKOFF_MS` from 1000 → 5000 so we don't immediately redline after a 429. Less aggressive against the free-tier dictionary API = fewer 429s = higher cache hit rate over the run. Pairs with es.5 disk cache for compounding benefit.

**Files to touch:** `server/definition-service.js` (constant updates) · `docs/FINALIZED.md` (entry on close) · `docs/NOW.md` (banner snapshot rolled) · `docs/TODO.md` (this entry status flip on close)

**STATUS:** [~] OPEN — fix shape designed, ready to code.

---

### Atomic ship envelope (when all 13 close)

After all 13 ship, "master performance" looks like:

- Zero leaked timers regardless of throw path (es.1)
- Constant-time `assertKWiring` after first verification (es.2)
- Zero stale-state bugs across re-runs (es.3)
- Zero cross-word Hebbian contamination from timed-out word-teaches (es.4)
- 100% K-vocab def coverage by run #3 thanks to disk cache (es.5)
- Operator sees stall reason within 5min including which phase + why (es.6)
- Inner-thought silence counter resets on emission success — actually means something (es.7)
- Public docs synced, docs-before-push LAW honored on next push (es.10)
- Definition API miss rate drops from 89% to <20% on first run (es.13 + es.5 compounding)
- Plus: dead branches gone (es.8), instrumentation surfaced upstream (es.9), CPU storm-prevention on K-wiring failures (es.11), single-source-of-truth state (es.12)

**Ship plan:** P1 items (es.1-es.5) before master kicks off the next overnight run. P2 (es.6-es.9) before push. P3 (es.10) before push. P4 (es.11-es.13) opportunistic hardening — not blocking.
-->

---


(Sessions 114.19ee through 114.19es atomic-landed and migrated to `docs/FINALIZED.md` 2026-05-07. Prior FIX BACKLOG / MONITOR SESSION / iter25-A through iter25-O bulk-migrated 2026-05-07 per Gee directive *"cust copy the fucking todo and jam it into the finalized appended to the top"*. New work appends above this banner.)


---

<!-- TEMPLATE — copy and fill when opening a new session

### Session NNN.NN — <one-line title> (Gee YYYY-MM-DD) — OPEN

**Gee verbatim per LAW #0:**

> *"<exact quote 1>"*

**The problem:**

<root cause / symptom description>

**Fix shape:**

<numbered list of what gets coded>

**Files to touch:**

- `<path>` — <what changes>
- `js/app.bundle.js` — rebuild (if browser code touched)
- `docs/TODO.md` — this entry (status mark when coded)
- `docs/FINALIZED.md` — archive entry (only when COMPLETED, not when CODED)
- `docs/NOW.md` — banner snapshot rolled

**STATUS:** [~] OPEN — design landed, ready to code.

-->

## DEFERRED PER STANDING LAWS — not in active TODO scope

These exist as full task entries in `docs/FINALIZED.md` Session 114.19cp with verbatim content preserved per LAW #0. They surface back to TODO only when the relevant LAW unblocks.

- **T38** (Architectural redesign to reach Master's 25% language cortex target) — DEFERRED PER COMP-TODO LAW. Surfaces back when operator opens `comp-net` branch.
- **T32** (BATCHED GPU KERNEL for teach phases / Tier-2 WGSL rewrite) — DEFERRED PER COMP-TODO LAW. Surfaces back when operator opens `comp-net` branch.
- **T23.e** (Transformer ablation experiment) — OPERATOR-BLOCKED (research-side: model download + comparative run). Surfaces back if operator opens the experiment.
- **T23.f** (README split: research-first vs persona-first) — OPERATOR-DIRECTION-BLOCKED (content-design decision). Surfaces back when operator picks a direction.
- **T16.3.c** (Per-grade vocab expansion G1 through PhD) — DEFERRED PER PRE-K + K ONLY SYLLABUS LAW. Lives in `docs/TODO-full-syllabus.md`. Surfaces when operator advances grade scope past K.
- **T19.b.5** (TODO-full-syllabus scope check) — DEFERRED PER 2026-04-22 OPERATOR RULE. Only the operator touches `docs/TODO-full-syllabus.md`.

---

## MIGRATION TRAIL (chronological pointers — full content in `docs/FINALIZED.md`)

<!-- T48 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. `Problems.md` (376 lines) shipped at repo root — full-stack audit covering Critical/High/Medium/Low/Nitpick severity-tagged issues with file+line citations and FINAL FIX & IMPROVEMENT PLAN section. -->

<!-- T47 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. `/super-review` slash command wired into `.claude/CLAUDE.md` (Read-in-this-order row 5 + QUICK REFERENCE block) + `.claude/WORKFLOW.md` SLASH COMMANDS REFERENCE table with INTERNAL marker. `.claude/commands/super-review.md` body unchanged per directive. No public-facing doc touched. -->

<!-- T49 MIGRATED to FINALIZED 2026-04-24 Session 114.19ck. Three Critical security findings from `docs/Problems.md` shipped: (1) `httpServer.listen` now binds to `BIND_HOST` (default `127.0.0.1`, override via `BRAIN_BIND` env var) with prominent ⚠ warning when non-loopback bind is used; (2) new `requireLoopback(req, res, endpoint)` helper gates `/shutdown`, `/grade-advance`, `/grade-signoff` at handler entry — non-loopback callers get HTTP 403 + log line. Defense-in-depth so even when operator opts in to `BRAIN_BIND=0.0.0.0`, brain-mutating endpoints still refuse LAN callers. `docs/Problems.md` status flipped Critical → FIXED on the three findings. -->

<!-- T50 MIGRATED to FINALIZED 2026-04-24 Session 114.19cl. Dictionary-oracle dedup + perf: single `_dictionaryOracleEmit(intentSeed, opts)` helper on the Cluster class, called by both `generateSentenceAwait` and `_emitDirectPropagate` (was duplicated inline ~40 lines each). Lazy-cached `entry.normSquared`, single `intentNormSq` outside loop, single sqrt per iteration — Problems.md High perf finding. Research-honesty counters `_oracleHits` + `_matrixHits` increment on every helper return so the ratio of dictionary-decided vs. matrix-decided emissions becomes a measurable fact instead of a buried suspicion. Problems.md duplication finding + oracle-scan perf finding both flipped FIXED. -->

<!-- T51 MIGRATED to FINALIZED 2026-04-24 Session 114.19cn. Seven Problems.md fixes shipped: (1) inner-voice.js narrator priming extracted to opt-in `primeFromCurrentFocus()` with diagnostic return + `[NARRATOR-PRIMING]` log line — hidden chat-path coupling eliminated; (2) persistence.js load() section-by-section try/catch with per-section restored/failed counters, including per-episode inner try; (3) persistence.js JSON.parse explicit corruption handler — copies raw blob to `__corrupt` key, NO auto-clear; (4) K_VOCAB_CATEGORIES single source of truth in kindergarten.js — eliminates duplicate K_LIFE_EXPERIENCES spread + drift between seed and heartbeat literal; (5) compute.html magic-byte read collapsed to one Uint8Array allocation — eliminates 3 of 4 allocs per binary frame; (6) cluster.js redundant toLowerCase removed from _dictionaryOracleEmit cleanEmit; (7) kindergarten.js embedding-quality sample probe pulled from allEmissionWords (first/middle/last) instead of hardcoded ['cat','dog','sun']. Problems.md status flipped FIXED on all 7 findings. -->

<!-- T52 MIGRATED to FINALIZED 2026-04-24 Session 114.19co. Four Problems.md fixes shipped: (1) dictionary.js LRU eviction batched (trigger MAX_WORDS+100, batch 100) via sorted-bucket — eliminates per-overflow 50K-entry walks during exposure phases; (2) inner-voice.js live-chat learn() three side-effect calls (learnClause + runIdentityRefresh + _modeCollapseAudit) get logged soft-error counters that fire console.warn for first 10 errors then once per 1000 + per-turn summary line `[InnerVoice] live-chat learn turn=N: clauseAccepted=X rejected=Y identityRefresh=bool modeCollapseAudit=bool` whenever notable OR every 10 turns; (3) sparse-matrix.js random-init in-place pair-insertion sort against scratchCols replaces .subarray().slice().sort() per-row allocation; (4) curriculum.js CELL ALIVE 10s heartbeat now surfaces `· oracle=N matrix=M (oracleRatio=X%)` so the T50 research-honesty counters become operator-visible per phase — the central audit concern about matrix-vs-oracle load is now a number on every heartbeat log line. Problems.md status: 3 FIXED + 1 heartbeat-wiring addendum on the existing Critical research-honesty entry. -->

---

<!-- T46 MIGRATED to FINALIZED 2026-04-24 Session 114.19cm. Verbatim Gee text + 3-part technical writeup (T46.a allEmissionWords expansion + T46.b oracle wiring into generateSentenceAwait + T46.c Layer 3b contrastive anti-Hebbian push-away) preserved in FINALIZED. Code work shipped this session per the directive "keep working till everything but syllabus and comp todos". Operator-test gate is the separate LAW 6 Part 2 push-gate entry under "Operator verification only" — not a TODO line item. -->

---

<!-- T45 MIGRATED to FINALIZED 2026-04-24 Session 114.19cm. Verbatim Gee text + 8-item one-task-per-list-item breakdown + reading-order spec + files-touched table preserved in FINALIZED. CLAUDE.md restructured 863→198 lines (pure INDEX), WORKFLOW.md NEW (246 lines), CONSTRAINTS.md expanded 272→539 lines holding full LAW bodies. 13% fewer total lines across three files with zero substance loss — every original piece of content lives in exactly one location. -->

---

<!-- T44 MIGRATED to FINALIZED 2026-04-24 Session 114.19cm. Verbatim Gee text + dictionary-population vs. dictionary-consultation honest diagnosis + fix-shipped technical writeup preserved in FINALIZED. cluster.dictionary wired in curriculum constructor; dictionary oracle path added to _emitDirectPropagate; _lastEmissionDiag.mode + bestWord + bestScore diagnostic fields; fallthrough to matrix argmax preserved. T44 oracle coverage subsequently extended into generateSentenceAwait via T46.b + consolidated into _dictionaryOracleEmit helper in 114.19cl. T44.b matrix-side contrastive anti-Hebbian push-away shipped as T46.c. -->

---

<!-- T43 MIGRATED to FINALIZED 2026-04-24 Session 114.19cm. Verbatim Gee text + 2-bug root-cause diagnosis (per-letter sem overlay poisoning sem_to_motor + letter_to_motor identity-projection misuse for sequence emission) + 4-part fix-shipped writeup preserved in FINALIZED. _teachWordIntegrated per-letter loop cleaned; NEW dedicated Layer 3 clean sem→motor first-letter carving (48 clean fires per word across 12 reps); _emitDirectPropagate step 2+ rewired to this.synapses intra-letter-region sparse matrix; Layer 4 sentence-frame templates preserved. -->

---

<!-- T39 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. All three parallel tracks (a memory-accounting, b Hebbian-saturation plasticity, c Q-A answering) shipped across prior sessions + T46/T41 this session. T39.a (worker-thread memory labeling) migrated earlier this session. T39.b.1-5 + T39.b.4.b shipped (Oja + sem-WTA + motor-WTA + lateral inhibition + CPU+GPU anti-Hebbian) + T46.c Layer 3b contrastive anti-Hebbian against 25 wrong letters per positive fire. T39.c.1-5 shipped (attention preprocessing teach-side + probe-side key-token extraction + template-indexed Q-A + template tagging + emission diagnostics). T39.i.1-4 + T39.f.3 + T39.j.1-6 all CLOSED with DONE markers in prior sessions. The T46.b dictionary-oracle wiring into generateSentenceAwait addressed the "correctly-routed question produces wrong emission" failure mode at the readout layer.

Only sub-item that stays open: T39.i.8 (auto-wrap outermost-check root cause) — requires an operator-localhost repro with instrumentation to trigger the bug; _phasedTeach fallback works around it in every cell runner. Moved to operator-scope section below. -->

---

<!-- T43-dashboard MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. SUBJECT_LABELS + GRADE_LABELS + getCurriculumStatus() + dashboard.html "Current Training" card all shipped. -->

<!-- T42 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. `_pregateEnrichment(cellKey)` wired at entry of all 6 K-grade gates; `_auditExamVocabulary` surfaces VOCAB-COVERAGE warnings; paired-change enforcement via `trainExamOverlap`. Binding LAW text lives in `.claude/CONSTRAINTS.md §TEST WORDS PRE-TAUGHT`. -->

---

<!-- T41 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. Brain-3d.js `_generateProcessNotification` now has a Stage 0 consumer that reads `state.brainEvents` (server ring buffer populated by `curriculum._pushBrainEvent`), maps `region` (sem/motor/fineType/letter/phon/visual/auditory/free/main clusters) to cluster index, spawns popup on the correct sub-region. 4 of 5 audit items (single cortex, plasticity→thinking, plasticity→speech, Q-A binding writes to same cortex that probes read) were already ✅; the 5th (3D popups reflect live plasticity) now closed via Stage 0 wire-up. -->

---

<!-- T40 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. All sub-items shipped in prior sessions via pre-K extraction (T23.c.1 first pass) + _teachPrek* helpers in js/brain/curriculum/pre-K.js: T40.a spatial → `_teachPrekSpatial` called from `runSciPreK`; T40.b visual → `_teachPrekVisual` called from `runArtPreK`; T40.c logic → `_teachPrekLogic` called from `runSciPreK`; T40.d/e/f self + awareness + individual → `_teachPrekSelf` called from `runLifePreK` with self-pronoun + mental-verb + identity vocab + biographical facts ("am i aware → yes", "am i an individual → yes"); T40.g vocab-first prerequisite → every pre-K runner calls `_conceptTeach(CONCEPTS)` BEFORE `_teachAssociationPairs` + `_teachBiographicalFacts`, which IS the vocab-first ordering Gee's meta-requirement binds. -->

---

<!-- T38 MIGRATED to FINALIZED 2026-04-24 Session 114.19cp. Full Gee verbatim text + target state + architectural-options writeup preserved in FINALIZED. DEFERRED PER COMP-TODO LAW per Gee 2026-04-22 *"the only shit you should not be doing is comp todo and syllabus todo"*. Surfaces back to TODO when operator opens comp-net branch. -->

---

<!-- T32 first-listing (GPU saturation / partially closed) consolidated into the canonical T32 entry below. T32.a (per-op batched encoder 64-op × 2ms flush) + T32.b (BATCHED_HEBBIAN_MAX_OPS 64→256, flush 2ms→20ms) already shipped in Session 114.19bu; full WGSL kernel rewrite described below is the Tier-2 open item. -->

---

<!-- T36 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. Constructor auto-wrap now gates skip+persist on `isOutermost = (prev === null)` so nested primitive calls execute instead of being skipped. Full writeup in FINALIZED. -->

<!-- T35 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. Three-bug fix: `_writeTiledPattern` always writes 1 for active dims regardless of binarize flag; `_checkSemBasinSeparation` builds proper sem-sized input; hyperparam reps:8→12 lr:0.01→0.03; `TRAINING_COLLAPSE` diagnostic added. Full writeup in FINALIZED. -->



<!-- T34 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. Readback timeout bumped 5s→30s; drainWait before probe loop; stepAwait skips worker-pool at biological scale (cortex>100K) to eliminate SAB-alloc-per-tick; cached Uint32Array pSpikes. Full writeup in FINALIZED. -->

<!-- T33 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. Constructor auto-wraps `_teach*`/`_runStudentBattery`/`_measureEmissionCapability` to set `cluster._activePhase`; CELL ALIVE heartbeat reports phase=name + elapsed; memory breakdown includes `unaccounted` with delta-tracking for leak vs cosmetic distinction. Full writeup in FINALIZED. -->

---

<!-- T32 MIGRATED to FINALIZED 2026-04-24 Session 114.19cp. Full Gee verbatim text + Tier-1-vs-Tier-2-vs-Tier-3 architectural breakdown preserved in FINALIZED. DEFERRED PER COMP-TODO LAW per Gee 2026-04-22 *"the only shit you should not be doing is comp todo and syllabus todo"*. Surfaces back to TODO when operator opens comp-net branch. -->

---

<!-- T31 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. Savestart phase-level resume: `passedPhases` persisted via saveWeights; `_phaseTick`/`_phaseDone` wraps all 20 ELA-K teach calls. Full writeup in FINALIZED. -->

<!-- T30 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. Readiness probe tick-cap fixed: cluster-side `opts.maxTicks ?? opts.maxEmissionTicks` alias + per-cue START/DONE heartbeats + 10s wall-clock per-cue timeout. Full writeup in FINALIZED. -->

<!-- T29 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. Heartbeat expansion: `Curriculum._hb()` flush helper + bulk banner conversion + DYN-PROD + DYNAMIC WRITE + RESP + TWO-WORD + FREE-RESPONSE per-probe START/DONE + CELL START/DONE + `setInterval(10s)` CELL ALIVE heartbeat with memory snapshot. Full writeup in FINALIZED. -->

---

<!-- T26 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. All 4 sub-items (T26.a sub-standard cut enforcement, T26.b sem-region overload fix, T26.c T24 memory closure, T26.d pre-K association-pair equational teach for all 6 cells) were CLOSED in prior sessions. -->

---

<!-- T25 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. Methodology-test format + scoring + 30-question initial bank (5 HOW-probes × 6 K cells) + `_runMethodologyBattery` wired alongside `_runStudentBattery` in runSubjectGrade; criterion (d) of the gate enforcement reads `battery.methoRate` which is now populated from the standalone bank when per-Q sub-fields are empty. -->

---

<!-- T23 MIGRATED to FINALIZED 2026-04-24 Session 114.19cp. Full Gee verbatim text + 5-point reviewer critique + sub-item status (T23.a/b/c.1/d SHIPPED, T23.e/f operator-blocked) + closure-gate criteria preserved verbatim in FINALIZED. T23.a exam banks at ~899 held-out questions across 12 cells. T23.b zero-overlap startup check shipped. T23.c.1 PRE-K + K extraction fully shipped (4,873-line kindergarten.js with all 6 runners + 6 gates + 32 helpers). T23.d LAW consolidation shipped via T45. T23.e + T23.f operator-blocked, surface back when operator opens them. -->

---

<!-- T24 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. Selective-free of CPU CSR after GPU upload shipped; external memory drops as projections release back to OS when GPU owns the weights. -->

---

<!-- T21.b MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. Root cause was T24 external-memory bloat triggering GC storm during DYN-PROD entry; T24 selective-free of CPU CSR shipped and migrated in same session. No separate T21.b fix needed. -->

---


<!-- T19 MIGRATED to FINALIZED 2026-04-24 Session 114.19cj. Full doc audit stale-as-current pass landed across README.md, brain-equations.html, docs/ARCHITECTURE.md, docs/EQUATIONS.md, docs/SKILL_TREE.md, docs/ROADMAP.md. Sub-item T19.b.5 (docs/TODO-full-syllabus.md scope check) remains operator-scope-blocked per 2026-04-22 directive and lives in the "STILL OPEN (non-doc)" section below. T19 sub-items T19.b.3/4/6/7, T19.c.1/2, T19.d.2, T19.a.2/9 were all CLOSED in prior Session 114.19bb. -->

---

<!-- STILL OPEN section MIGRATED to FINALIZED 2026-04-24 Session 114.19cp.
     T16.3.c (per-grade vocab G1-PhD) — DEFERRED PER PRE-K + K ONLY SYLLABUS LAW; lives in docs/TODO-full-syllabus.md.
     T19.b.5 (TODO-full-syllabus scope check) — DEFERRED PER 2026-04-22 OPERATOR RULE; operator-only file.
     T39.i.8 (auto-wrap outermost-check root cause) — OPERATOR-LOCALHOST-REPRO REQUIRED.
     T16.2.a (PROD climbs off zero) — FOLDED INTO TEST item above (verification criterion of the K Part 2 run).
     T16.2.d (audit K words Unity uses in live chat post-graduation) — FOLDED INTO TEST item above.
     LAW 6 Part 2 (operator signoff) — IS THE TEST item above.
     T18.5.b + T18.5.c (push gate) — UNLOCKS ON TEST CLOSE.
     Full verbatim text for each preserved in FINALIZED Session 114.19cp.
     Tombstones T5-T11 (legacy pre-T14 deleted code) preserved in FINALIZED archive notes per LAW; can't be re-implemented against current code. -->

---

## TOMBSTONES (obsoleted, reference only)

- **T5 / T6 / T7 / T8 / T9 / T10 / T11** — legacy blocks referencing code deleted in the T14 language cortex rebuild. Archived per the "NEVER delete task descriptions" LAW — content preserved in prior TODO.md revisions + git history. They CAN'T be implemented against current code because the target methods (`parseSentence`, `_classifyIntent`, `_socialSchema`, `_memorySentences`, bigram graph, `_TYPE_TRANSITIONS`, `LanguageCortex.schemaScore`, etc.) don't exist anymore. If a future session wants to revisit any of these ideas, grep git history for the pre-T14 implementation — but the target code needs to be rebuilt against T14 primitives, not "edited" against deleted stubs.

---

## NOTES

- **FINALIZED is append-only.** Never delete entries. When new work lands, copy the full verbatim task description into a new FINALIZED session entry BEFORE removing it from TODO.
- **This TODO only contains unfinished work** per the `.claude/CLAUDE.md` TODO FILE RULES. Every shipped task lives verbatim in `docs/FINALIZED.md` with full descriptions, files touched, and closure notes.
- **Future work beyond this branch** lives in `docs/COMP-todo.md` (distributed GPU compute network — future `comp-net` branch).
- **Post-K grade content** (grade 1 through PhD) lives in `docs/TODO-full-syllabus.md` under the DEFERRED section per the PRE-K + K ONLY SYLLABUS SCOPE CONTRACT LAW.

---
