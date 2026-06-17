# NewTodo — Unity Brain Sentence-Coherence Recovery

> Created 2026-06-17 from `/super-review ultrathink` of the K-training-not-sticking + chat-silent + random-one-word-emissions failure mode. **Gee verbatim 2026-06-17:** *"we have a major issue with the trraing of the brain and it remembering what its trained on i cant get training through kindergarden and even then it doesnt make any kind of coherant sentences like at all its just random one word resposes... its totally messed up idk what we need to do to find a new path maybe or fix what we have but we cant even start building the rest of the grades ciriculum until we figure out wtf is up and why Unity cant speak normally like someone of that grade level as they learn new things using them then and from then on... I want tyou to do a total review of all the code base every file, find errors, find brain breaking issues, find better ways of doing everything that will work 100% for a full autonomous Unity brain that we are trying to build. make a NEw todo.md named Newtodo.md with the other docs and we will be working from it. read every file cross refresence with every documentation file on how it currently works 100% top to bottom no fucking around and half ass guessing what code says read it all find the issues of why unity is not making full complete sentences of whats shes doing, thinking, feeling, wanting to do, asking, ect ect any thing and everything see should be acting like her persona files and memories... but she is not working correctly when trained in kindergarden. se only saysd a handful of random words ever, and when i talk to her in chat she says nothing at all , but i am seeing her popups in the brain"*

This doc is the working playbook for the recovery sweep. All work below is in scope; nothing else proceeds (no new grade curriculum, no Pre-K → Grade 1 build-out) until composeSentence emits coherent multi-word sentences at chat path AND inner-voice path consistently. **Pre-K + K ONLY scope remains in force** per CONSTRAINTS.md.

---

## ROOT CAUSE SUMMARY

Three structural defects compound to produce the observed symptoms:

1. **`composeSentence` doesn't tick the brain between word emissions** (`cluster.js:3667–3716`). The loop is synchronous — `lastSpikes` is frozen across all 12 iterations. emitWordDirect runs argmax on the SAME static state every iteration. Repetition penalty + minSignal floor then degrade output toward noise. The "inject word back so next tick reads shifted state" comment is architecturally wrong — no tick happens, no shift happens.
2. **`injectEmbeddingToRegion` is purely additive** (`cluster.js:1227`, `+=`). composeSentence's serial injections (seed 0.3 + cortexPattern 0.2 + intentConcept 0.3 + per-word 0.15 × N) accumulate without decay into externalCurrent. After 5 words, sem region is saturation soup. The brain can't distinguish "current intent" from "history of every word emitted this turn or any prior turn."
3. **Grammar is trained at ~930 Hebbian writes total vs vocab at ~18,000** (`curriculum.js:11993–12106`). Slot, template, agreement, article bindings each get ~100–600 writes. Vocabulary multidef gets ~9000 writes. **Grammar is 20× under-trained relative to vocabulary.** The scaffold has fewer reps than the things it's supposed to scaffold.

Compounded with chat-path's `composedSentence.words.length >= 2` gate (`language-cortex.js:2164`), the broken loop's <2-word output is discarded, falls through to broken Tier 5 fallback, falls through to broken letter-chain, returns `silent:true` at `brain-server.js:4898` → client renders nothing → Gee sees blank chat. Meanwhile inner-voice popup path has no length gate so single-word emissions render → Gee sees popups.

---

## `/super-review` OVERALL SUMMARY (verbatim — immortalized 2026-06-17)

This codebase is a sophisticated biologically-inspired neural simulator that has been chronically over-iterated by Codex-class hands. The training pipeline is real, the GloVe substrate is sound, and the cortical microstructure (K.1–K.9) is genuinely impressive — but the **language production layer (`composeSentence`) is architecturally broken since the 114.19fk.1 template rip-out**, and the **structure-training depth is two orders of magnitude under-budgeted relative to vocabulary training**. The brain can learn 2247 word↔definition bindings at ~18,000 Hebbian writes but only gets ~800 writes total for ALL of grammar (slots + templates + agreement + articles). The post-template `composeSentence` loop further sabotages emission by NOT TICKING THE BRAIN BETWEEN WORDS — `lastSpikes` is frozen the entire call so the same argmax fires 12 times with repetition penalty decaying it toward noise. Every reported symptom (single-word responses, silent chat, "training won't stick", inability to progress past K) traces directly to: (a) grammar bindings starved of repetitions, (b) `externalCurrent` accumulating injections without consumption ticks, (c) `composeSentence` returning <2 words → chat path drops it as "not enough" → silent. The codebase has accreted ~50 partial fixes (fa→fm) chasing symptoms on top of the broken substrate. Patch-on-patch is now technical debt; the language emission needs an architectural reset, not another iter.

---

## FULL ISSUES INVENTORY — every finding, immortalized

Reference back to `/super-review ultrathink` run 2026-06-17. Severity scale: **Critical** = brain-breaking, must-fix before grade 1 work; **High** = symptom-producing, ship in this sweep; **Medium** = architectural debt or hidden trap; **Low** = polish; **Nitpick** = cosmetic. Each issue carries file path, line range, severity, plain-language defect description, the violated standard or best-practice principle, and the concrete fix.

---

### Issue #1 — composeSentence frozen-state loop
- **File: `js/brain/cluster.js` | Lines 3613–3716 | Severity: CRITICAL**
- **Issue:** `composeSentence` injects into `externalCurrent` then calls `emitWordDirect` 12 times in a synchronous loop with **zero `stepAwait` between iterations**. `emitWordDirect` reads `this.lastSpikes` (line 3389) which only updates when the brain ticks. So every iteration argmaxes the EXACT same frozen spike state. The "inject word back so next tick reads shifted state" comment at line 3704–3707 is a **lie at runtime** — no tick happens, the state never shifts within the call.
- **Why it's bad:** This is the root architectural lie of the post-fk.1 design. The loop pretends to be an autoregressive equational emission system but reads the same input 12 times. Combined with the 30% repetition penalty (line 3470) and `minSignal=0.001` floor (line 3479), the loop emits the top bucket once, gets penalized, falls to argmax #2, gets penalized, falls to argmax #3, until noise wins or returns ''. **This is why Unity emits "random one-word responses."** Pure mechanical consequence of the broken loop, not a training issue.
- **Suggested fix:** Replace synchronous loop with `await stepAwait(0.001)` × N ticks between each `emitWordDirect`. Convert `composeSentence` to `async`. Drain `externalCurrent` between emissions via a real consumption tick OR write a synchronous `_propagateSemPattern()` that performs the sem→word_motor matmul on a SHIFTED sem input vector (apply word emb injection directly to the read buffer, don't rely on tick consumption).
- **Tracked by harness task:** P1.1.

### Issue #2 — injectEmbeddingToRegion additive accumulation
- **File: `js/brain/cluster.js` | Line 1227 | Severity: CRITICAL**
- **Issue:** `injectEmbeddingToRegion` does `this.externalCurrent[idx] += value;` — **purely additive, never replaces, never decays within a call chain**. composeSentence injects seed (strength 0.3 × 8 = 2.4×) then back-injects each emitted word at 0.15 × 8 = 1.2×. After 8 iterations, externalCurrent in sem region holds 2.4 + 8×1.2 = 12× the magnitude of any single intended signal — pure saturation soup.
- **Why it's bad:** Even if ticks ran between iterations, externalCurrent would saturate. The brain stops being able to distinguish "current intent" from "history of every word I just said." This compounds across chat turns since externalCurrent is rarely zeroed (`externalCurrent.fill(0)` appears once in kindergarten.js:3327).
- **Suggested fix:** Either (a) make `injectEmbeddingToRegion` replace instead of accumulate within a single "intent window" via a `replace:true` opt, or (b) add a soft decay `this.externalCurrent[idx] = this.externalCurrent[idx] * 0.5 + value` for in-loop reinjection, or (c) zero externalCurrent at start of `composeSentence` after seed injection.
- **Tracked by harness task:** P1.2 (LANDED 2026-06-17 — `replaceMode:true` opt added to `injectEmbeddingToRegion` with full region-zero before assignment; default false preserves additive behavior for every other caller).

### Issue #3 — Structure training 20× under-trained vs vocabulary
- **File: `js/brain/curriculum.js` | Lines 11993–12106 | Severity: CRITICAL**
- **Issue:** `_teachSentenceStructure` trains the ENTIRE grammar at REPS:6–8:
  - Slots (~75 pairs × 8 reps = 600 writes)
  - Templates (5 templates × ~4 transitions × 6 reps = 120 writes)
  - Agreement (19 pairs × 6 reps = 114 writes)
  - Articles (16 pairs × 6 reps = 96 writes)
  - **Total: ~930 Hebbian writes for ALL of English grammar**
- Meanwhile, vocabulary training (`K-VOCAB-UPFRONT-MULTIDEF`) writes ~18,000 Hebbian binds for 2247 word definitions. **Grammar is 20× under-trained relative to vocabulary.**
- **Why it's bad:** At biological scale (millions of neurons, sparse weights with K.4 hub neurons + K.9 layer-gradient plasticity), 100–600 Hebbian writes per rule produce noise-floor bindings. Slot → next-slot transitions get ~24 writes EACH. That cannot carve a load-bearing basin in a 7M-neuron cortex. Grammar is the SCAFFOLD that vocabulary hangs on — backwards reps allocation.
- **Suggested fix:** Bump structure reps to **80–120** (10× vocab depth, not 0.5×). Add **N-gram exposure** — train ACTUAL example sentences (`"the cat runs"`, `"i see a dog"`) as full word-sequence Hebbian cascades, not just abstract slot tags. Slot-tag bindings alone are too abstract; the brain needs literal sequence statistics to converge.
- **Tracked by harness tasks:** P2.1 + P2.2.

### Issue #4 — Chat path length-gate discards 1-word emissions
- **File: `js/brain/language-cortex.js` | Lines 2164–2165 | Severity: HIGH**
- **Issue:** Chat path gates on `composedSentence.words.length >= 2` — if composeSentence returns 1 word (the dominant failure mode given the issues above), it drops the result entirely and falls through to a Tier 5 fallback that has the same broken-loop problem, then falls through to `generateSentenceAwait` letter-chain (different broken path).
- **Why it's bad:** **This is why Gee sees chat go SILENT.** composeSentence returns 1 word → discarded → Tier 5 returns 0–1 word → discarded → letter-chain emits garbage → `response.length < 2` check at brain-server.js:4898 → returns `{silent:true, silentReason:'motor_unstable'}` → client gets `type:'silent'` → renders nothing. Meanwhile inner-voice popups path doesn't gate on length, so popups still emit single words and Gee sees "popups in the brain."
- **Suggested fix:** Lower the gate to `length >= 1` AND prepend Unity's persona-driven utterance shell (her cuss-vocabulary, mood-driven adjectives) until structure training catches up. OR — better — fix the upstream broken loop so this gate is moot.
- **Tracked by harness task:** P1.4.

### Issue #5 — Terminator-first failure mode
- **File: `js/brain/cluster.js` | Lines 3690–3695 | Severity: HIGH**
- **Issue:** Terminator gate fires on the FIRST emission if argmax picks a learned terminator:
  ```js
  if (T14_TERMINATORS.has(word)) {
    if (words.length > 0) { words[words.length - 1] += word; }
    break;
  }
  ```
  When `words.length === 0` (first iteration emits terminator), loop breaks with empty result. NO fallback, NO re-roll.
- **Why it's bad:** If trained terminator bindings happen to dominate the sem→word_motor argmax under noisy state, the brain emits "." as word 1 and gives up. Returns null sentence. Chat path interprets as silent.
- **Suggested fix:** Reject terminators when `words.length === 0`, continue loop. Block terminators from argmax for first 2 ticks via opts in `emitWordDirect`.
- **Tracked by harness task:** P1.3.

### Issue #6 — Repetition penalty punishes grammatical English
- **File: `js/brain/cluster.js` | Lines 3438–3470 | Severity: HIGH**
- **Issue:** Repetition penalty (`mean *= 0.7`) blanket-applies to ALL recently-emitted words including function words ("the", "a", "is", "and"). Real English sentences require repeated function words ("the cat sat on the mat" = "the" ×2). Penalty 0.7 + 0.7 = 0.49× for a word emitted twice in last 4 ticks; effectively half-weight.
- **Why it's bad:** Penalizes grammatical English. Compounds with the no-tick loop: even if state DID shift, the brain can't say "the" twice without taking a hit. So composeSentence under-emits articles, breaks subject-verb-object structure.
- **Suggested fix:** Exempt function words (`the/a/an/is/are/was/were/and/or/but/of/to/in/on`) from repetition penalty. OR — better — apply penalty only to content-word categories (use `wordType()` to filter).
- **Tracked by harness task:** P1.5.

### Issue #7 — minSignal noise-floor too low
- **File: `js/brain/cluster.js` | Line 3479 | Severity: HIGH**
- **Issue:** `minSignal = opts.minSignal ?? 0.001` — emitWordDirect accepts argmax winners with mean signal as low as 0.001. That's noise-floor territory.
- **Why it's bad:** When sem state is saturated soup (per issue above), the "best" bucket might just be slightly-less-noisy noise. Returns garbage words that look "random" to Gee.
- **Suggested fix:** Adaptive floor — track mean signal across a calibration window at boot, set floor at `meanSignal × 2` so only meaningfully-elevated buckets win. Also surface "signal too weak" telemetry to dashboard so Gee can SEE when this floor is the bottleneck.
- **Tracked by harness task:** P1.6.

### Issue #8 — GlobalWorkspace bias too weak
- **File: `js/brain/cluster.js` | Lines 3408–3414 | Severity: MEDIUM**
- **Issue:** GlobalWorkspace bias multiplier is **1.10** (10% boost). Per Baars 1988 GWT, conscious-broadcast content should dominate downstream motor systems, not nudge them. 10% is a tiebreaker, not a broadcast signal.
- **Why it's bad:** GW ignition is supposed to be the "what gets emitted next" mechanism. At 10% it's noise.
- **Suggested fix:** Scale GW boost with ignition strength: `mean *= 1.0 + (ignitionStrength × 0.6)`. Strong ignitions get 60% bias, weak ones get nudge.
- **Tracked by harness task:** P1.7 (LANDED 2026-06-17 — `gwBoostMul` reads `bc.strength`, formula `1.0 + s × 0.6` with clamp + 1.10 fallback for missing strength).

### Issue #9 — Orphan slot-tag training has no live consumer
- **File: `js/brain/curriculum.js` | Lines 12041–12047 + 12056–12060 | Severity: HIGH**
- **Issue:** Template transitions train SLOT-TAG → SLOT-TAG bindings (e.g. `subject → verb` as sem→sem). But at composeSentence runtime there's NO slot-tag activation injection — the brain reads from current sem state which contains word embeddings, not slot tags. **The trained slot-transition weights are read by nothing.**
- **Why it's bad:** This is the orphan-training pattern Gee fears. Hebbian writes happen, no live consumer reads them. The relationTagId=9 weights sit in the matrix doing nothing because the emit loop doesn't activate `slot:subject` token first to trigger the transition.
- **Suggested fix:** Either (a) inject `slot:subject` sem token at composeSentence start so the trained transitions can fire chains, or (b) drop the slot-tag training entirely and train on ACTUAL multi-word sequences (e.g. `[cat → runs]`, `[the → cat]`, `[runs → fast]`) so word→word transitions carry the grammar.
- **Tracked by harness task:** P2.5.

### Issue #10 — Question-intent dead-end binding
- **File: `js/brain/curriculum.js` | Lines 12251–12267 | Severity: MEDIUM**
- **Issue:** `_teachQuestionIntent` trains WH-words → abstract concept words (`what → definition`, `what → cause`). But these abstract concept words ("definition", "cause") have no downstream consumer — there's no `_teachConceptToAnswerPattern` that would carve `definition → some-answer-template`.
- **Why it's bad:** The relationTagId=12 bindings are training a one-step dead-end. Question comes in → intent-concept activates → nothing.
- **Suggested fix:** Add a downstream cascade — `definition → "X is a Y"` answer-template, `cause → "X happens because"` answer-template, anchored on real K-grade example sentences. Otherwise this whole layer is theater.
- **Tracked by harness task:** P2.6.

### Issue #11 — Magic-number ×8 injection scale
- **File: `js/brain/cluster.js` | Line 1227 | Severity: MEDIUM**
- **Issue:** Embedding magnitude scaled by `× 8` hardcoded constant (`emb[d] * 8 * strength`). No comment explaining why 8, no tunability.
- **Why it's bad:** Magic number tuned long ago for some prior calibration. Combined with biological-scale neuron count + K.9 layer plasticity gradient, this scale may be saturating or starving the basin.
- **Suggested fix:** Replace with a documented constant `INJECTION_GAIN` calibrated against current cortex size + drive baseline.
- **Tracked by harness task:** P4.5.

### Issue #12 — Pre-saturated sem from serial injections
- **File: `js/brain/cluster.js` | Lines 3625–3650 | Severity: MEDIUM**
- **Issue:** Cortex-pattern + intent-seed + intent-concept all inject in serial without renormalization. Three additive injections at 0.2/0.3/0.3 → 0.8 total before the per-word back-injection loop even starts. Sem is pre-saturated before word 1 emits.
- **Why it's bad:** Compounds the externalCurrent accumulation. By word 3 sem is fully saturated soup.
- **Suggested fix:** Replace serial injections with a SINGLE weighted blend computed by the caller, passed as one vector. Or normalize after each injection.
- **Tracked by harness task:** P3.4.

### Issue #13 — Aggressive silent-fail returns blank to chat
- **File: `server/brain-server.js` | Lines 4898–4929 | Severity: HIGH**
- **Issue:** When `response.length < 2`, server returns `{text:'', silent:true}`. But `response` here is the rendered string from `languageCortex.generateAsync` AFTER `_renderSentence` adds capital + period. So `response = "."` (single-char from terminator-first failure) has length 1 → silent.
- **Why it's bad:** Aggressive silence cutoff masks the underlying composeSentence failure. The chat client renders NOTHING because of this gate. Gee sees popups (no gate) but no chat (gate).
- **Suggested fix:** When silent for `motor_unstable` reason, return a Unity-voice "thinking" fragment (`*tilts head*` / `mm-hm.` / `…`) so chat has something to render. Or surface the FAILED RAW words to the dashboard as a diagnostic so Gee can see what the brain wanted to say but couldn't form.
- **Tracked by harness tasks:** P3.1 + P3.2.

### Issue #14 — Structure training doesn't propagate kScales
- **File: `js/brain/curriculum.js` | Line 12029 + 12056–12063 | Severity: MEDIUM**
- **Issue:** `_teachAssociationPairs` is called from `_teachSentenceStructure` with no `kScales` argument. Per iter25-L.A3/A4, kScales propagate K.4/K.7/K.9 cortical-microstructure plasticity gradients into the Hebbian update. Without kScales, structure training writes uniformly across all layers — wasting K's expensive cortical microstructure on grammar that should be focused on L2/3 (highest plasticity per K.9).
- **Why it's bad:** Negates the K cortical microstructure investment for the most critical training pass.
- **Suggested fix:** Pass kScales explicitly when calling `_teachAssociationPairs` from structure-teach paths. Audit ALL teach paths to confirm K.9 layer-gradient is consumed.
- **Tracked by harness task:** P2.3.

### Issue #15 — Wasteful double-transform on first-word capitalize
- **File: `js/brain/cluster.js` | Line 3727 | Severity: LOW**
- **Issue:** `words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1)` capitalizes first word AFTER the toLowerCase normalization at line 3683. The double-transform is wasteful but harmless.
- **Suggested fix:** Capitalize only at render time, not in composeSentence. Keep words lowercase internally for consistency.

### Issue #16 — curriculum.js is a 25,761-line god-class
- **File: `js/brain/curriculum.js` | Line 25761 (file size) | Severity: HIGH**
- **Issue:** `curriculum.js` is **25,761 lines** in a single file. Codex-style mega-class with 100+ methods.
- **Why it's bad:** Unmaintainable. The 800-line read rule (per CLAUDE.md) requires 33 chunks just to skim this file. Method-find requires grep every time. The class has accreted years of partial features.
- **Suggested fix:** Split into `curriculum/teach-vocab.js`, `curriculum/teach-structure.js`, `curriculum/teach-questions.js`, `curriculum/probes.js`, `curriculum/cells.js`, `curriculum/gates.js`. Keep a thin `curriculum.js` that imports + composes.
- **Tracked by harness task:** P4.1.

### Issue #17 — Temperature sampling on noise
- **File: `js/brain/cluster.js` | Lines 3486–3527 | Severity: MEDIUM**
- **Issue:** Temperature/top-K/top-P softmax sampling path adds randomness on top of an already-broken argmax. Whether to sample is decided per-call by `opts.temperature > 0`. Chat path passes `temperature:0.6, topK:8`. So even when argmax would pick a correct word, sampling can pick the 8th-strongest instead.
- **Why it's bad:** With sem state saturated (per other issues), top-K is sampling FROM NOISE. Random sampling on noise = random words. This compounds the "random one-word responses" symptom.
- **Suggested fix:** Make sampling conditional on signal quality — `temperature = baseTemp × min(1, bestMean / minMeaningfulMean)`. When signal is weak, fall back to greedy argmax (more deterministic). When signal is strong, allow variety.

### Issue #18 — Tier 5 fallback shares the broken-loop architecture
- **File: `js/brain/language-cortex.js` | Lines 2196–2230 | Severity: MEDIUM**
- **Issue:** Tier 5 fallback loop has its own broken-tick problem (same as composeSentence — no `stepAwait` between iterations) + its own additive injection at strength 0.25 + dedup that breaks after 2 consecutive duplicates. Three layers of broken loops, none fix the upstream issue.
- **Why it's bad:** Triple-redundant fallback paths all share the same architectural flaw. Defense-in-depth where every layer is broken the same way.
- **Suggested fix:** Delete Tier 5 path. Fix composeSentence properly. Single source of truth for word emission.
- **Tracked by harness task:** P3.3.

### Issue #19 — cluster.js circular coupling
- **File: `js/brain/cluster.js` (entire) | Line 5839 (file size) | Severity: HIGH**
- **Issue:** `cluster.js` is **5,839 lines**. Combined with curriculum.js (25,761) + language-cortex.js (2,868) + brain-server.js (9,478) = 43,946 lines of intertwined god-classes.
- **Why it's bad:** No clear architectural seams. Methods on cluster.js call methods on curriculum.js which call methods on cluster.js. Circular coupling. Codex pattern.
- **Suggested fix:** Extract cluster.js into `cluster-core.js` (regions + state), `cluster-emit.js` (emitWordDirect + composeSentence + generateSentenceAwait), `cluster-hebbian.js` (ojaUpdate + matmul), `cluster-probe.js` (readouts).
- **Tracked by harness task:** P4.2.

### Issue #20 — Naming collision: _teachSentenceStructures vs _teachSentenceStructure
- **File: `js/brain/curriculum.js` | Lines 7965–7966 | Severity: MEDIUM**
- **Issue:** `_teachSentenceStructures` (plural, line 8001) fires every cell × `opts.structReps ?? 6`. So K cells run structure-teach repeatedly. But the inner `_teachSentenceStructure` (singular, line 11976) is what we're talking about — different method, different code path, both exist. Naming collision waiting to bite.
- **Suggested fix:** Rename `_teachSentenceStructures` (plural) → `_teachSentenceTemplateForms` to disambiguate.
- **Tracked by harness task:** P4.4.

### Issue #21 — _recentEmissions skipRecentTrack twisted opt-out hack
- **File: `js/brain/cluster.js` | Lines 3536–3547 | Severity: LOW**
- **Issue:** `_recentEmissions` ring buffer with `skipRecentTrack` opt logic is twisted — composeSentence opts out of automatic tracking and uses `trackRecentEmission` manually AFTER acceptance. This is a comment-heavy hack to fix a bug rather than redesign.
- **Suggested fix:** Always-track is simpler. Remove the opt-out. Push to ring at composeSentence's accepted-word point. Less surface area.

### Issue #22 — Massive comment archeology in chat handler
- **File: `server/brain-server.js` | Line 4823 (and surrounding comment block) | Severity: NITPICK**
- **Issue:** Massive comment archeology — 40+ lines describing the deleted Pollinations text-AI path. Code says one thing, comments tell a 5-year history.
- **Suggested fix:** Move history to docs/ARCHITECTURE.md. Keep code comments terse.

### Issue #23 — advanceSubGrade promotes on completion not effectiveness
- **File: `js/brain/curriculum.js` | Lines 12109–12117 | Severity: MEDIUM**
- **Issue:** After `_teachSentenceStructure` returns, `cluster.advanceSubGrade('ela', 'binding')` is called unconditionally if the method exists. No PROBE to verify the bindings actually work.
- **Why it's bad:** Advances curriculum state on training-completion, not training-EFFECTIVENESS. So even if Hebbian writes happened to noise, grade advances and the gate moves on.
- **Suggested fix:** Call `_probeSentenceGeneration` immediately after training; only advance subGrade when `rate >= 0.4` (pass rate). If 0/5, log clearly and HALT — don't advance silently.
- **Tracked by harness task:** P2.4.

### Issue #24 — brain-server.js is a 9,478-line monolith
- **File: `server/brain-server.js` | (entire) | Severity: HIGH (implicit in P4.3)**
- **Issue:** `brain-server.js` is **9,478 lines** carrying HTTP bootstrap, WS handlers, tick loop, processAndRespond, persistence (save/load), GPU spawn supervisor, episode storage, drug detection plumbing, etc.
- **Why it's bad:** Same Codex-class pattern as curriculum.js + cluster.js. No clear architectural seams. A grep for "processAndRespond" yields call sites across the entire file with no clear ownership.
- **Suggested fix:** Split into `brain-server.js` (HTTP+WS bootstrap), `brain-tick.js` (tick loop), `brain-chat.js` (processAndRespond), `brain-persistence.js` (save/load).
- **Tracked by harness task:** P4.3.

---

## `/super-review` POSITIVE NOTES (verbatim — stingy by directive)

- The cortical microstructure (K.1–K.9) implementation in `cluster.js` is genuinely strong — Watts-Strogatz small-world, hub neurons, layer-specific plasticity gradients, theta-gamma oscillation gating. This is real biological-inspired neural architecture, not surface-level mimicry. The K.4 rich-club + K.9 layer-gradient combination is the kind of thing that COULD support emergent grammar if the emission layer used it properly.
- `GlobalWorkspace` class at `global-workspace.js` is a clean, focused implementation of Baars 1988 + Dehaene-Changeux 2011. Small, single-responsibility, readable.
- `definition-service.js` (dictionaryapi.dev wrapper with LRU cache + 5-min flush + concurrency cap) is well-engineered. Survives the "Codex slop" filter easily.
- The 800-line read rule + atomic-commit-with-docs LAW framework in CLAUDE.md / CONSTRAINTS.md is genuinely operationally tight.
- The persistence-layer rollback (`POST /rollback` atomic JSON+BIN two-stage temp+rename per fi.B.2) is correctly atomic. Rare in this codebase.

---

## `/super-review` FINAL FIX & IMPROVEMENT PLAN VISION (verbatim)

The substrate is salvageable. The training depth and emission loop need an architectural reset. The phased plan below is the prioritized fix sequence — Critical → High → Medium — and is mirrored 1:1 in the Phase tables that follow this section.

**Vision of the cleaned, production-grade version:**

The fixed brain ticks 2–4 times between word emissions, sees a real autoregressive state evolution, has grammar trained at 10× vocab depth so subject-verb-object structures emerge from learned word→word sequence statistics, surfaces emission failures as actionable diagnostics instead of silent dropouts, and tracks training EFFECTIVENESS not training completion. The composeSentence path becomes the single emission pipeline with the broken redundant fallbacks deleted. Code is split into focused modules, each under 1500 lines, so Codex-class accretion has nowhere to hide. Performance: removing the saturation-soup also lets the brain process chat 2× faster because emit doesn't fight noise. Reliability: pass-rate-gated advancement means Gee can trust grade advancement when it happens. Long-term maintainability: split files mean future Claude/Codex sessions can reason about one concern at a time, not the whole god-class.

---

## PHASE 1 — Fix the emission loop (CRITICAL, ~1 day)

| # | Task | File:Line | Status |
|---|------|-----------|--------|
| P1.1 | Convert `composeSentence` to async; await `stepAwait(0.001)` × 2–4 ticks between each `emitWordDirect` call. Update all callers (`language-cortex.js`, `curriculum.js _probeSentenceGeneration`, `inner-voice.js`) to await. | `cluster.js:3613–3716` | [ ] |
| P1.2 | Add `replaceMode:true` opt to `injectEmbeddingToRegion`. composeSentence's per-word back-injection uses replaceMode so externalCurrent doesn't accumulate to soup. The new "shifted sem state" then comes from the tick consuming the prior injection cleanly. | `cluster.js:1204–1240` | [ ] |
| P1.3 | Guard terminator gate — when `words.length === 0` AND emitted word is in `T14_TERMINATORS`, REJECT and continue loop. Block terminator-first failure mode where brain emits "." as word 1 and gives up. | `cluster.js:3690–3695` | [ ] |
| P1.4 | Lower chat-path gate from `composedSentence.words.length >= 2` to `>= 1` while grammar maturity catches up. Single-word emission is a valid Unity response. Re-tighten once Phase 2 lands. | `language-cortex.js:2164–2165` | [ ] |
| P1.5 | Exempt function words (the/a/an/is/are/was/were/and/or/but/of/to/in/on) from repetition penalty so grammatical English isn't punished. | `cluster.js:3438–3470` | [ ] |
| P1.6 | Replace hardcoded `minSignal = 0.001` with adaptive floor — track mean signal across calibration window at boot, set floor at `meanSignal × 2`. Surface "signal too weak" telemetry to dashboard so Gee can see when the floor is the bottleneck. | `cluster.js:3479` | [ ] |
| P1.7 | Scale GlobalWorkspace bias multiplier with ignition strength: `mean *= 1.0 + (ignitionStrength × 0.6)`. Strong ignitions get 60% bias, weak ones get nudge. 10% flat is too weak to be a real broadcast signal. | `cluster.js:3406–3414, 3466` | [ ] |

---

## PHASE 2 — Fix training depth (CRITICAL, ~1 day)

| # | Task | File:Line | Status |
|---|------|-----------|--------|
| P2.1 | Bump `_teachSentenceStructure` reps from 6–8 to **80–120**. Total grammar Hebbian budget should be ≥10× vocab budget. Target ~80,000 grammar writes vs current ~930. | `curriculum.js:12028, 12056, 12081, 12100` | [ ] |
| P2.2 | Add `_teachConcreteSentences` pass — train 200+ literal K-grade example sentences as word-by-word Hebbian cascades with kScales propagated. Grammar emerges from sequence statistics, not abstract slot tags. Sentence pool from K corpus + Common Core K.SL.6 + K.L.1.f exemplars. | `curriculum.js` (new method, ~12300) | [ ] |
| P2.3 | Pass `kScales` to all `_teachAssociationPairs` calls in structure-teach paths so K.4/K.7/K.9 cortical-microstructure plasticity is actually consumed. Audit ALL teach paths to confirm K.9 layer-gradient is read. | `curriculum.js:12028, 12056, 12081, 12100, 12268` | [ ] |
| P2.4 | Couple `advanceSubGrade` to probe pass-rate, not training completion. Run `_probeSentenceGeneration` immediately after `_teachSentenceStructure`; if rate < 0.4, do NOT advance — bump reps and re-train. Halt with diagnostic if 3 retries fail. | `curriculum.js:12109–12117` | [ ] |
| P2.5 | Fix orphan slot-tag training — either (a) inject `slot:subject` sem token at composeSentence start so the trained relationTagId=9 transitions can actually fire chains, OR (b) replace abstract slot-tag training with concrete word→word transitions from P2.2 sentence pool. Pick (b) — simpler, more biological. | `curriculum.js:12041–12063, cluster.js:3613–3650` | [ ] |
| P2.6 | Add downstream cascade to `_teachQuestionIntent` — `definition → "X is a Y"` answer-template, `cause → "X happens because"` answer-template, anchored on real K-grade example answers. Currently relationTagId=12 trains a one-step dead-end. | `curriculum.js:12238–12284` | [ ] |

---

## PHASE 3 — Fix the chat silent-fail mode (HIGH, ~half-day)

| # | Task | File:Line | Status |
|---|------|-----------|--------|
| P3.1 | When `response.length < 2`, return a short Unity-voice fragment (`*tilts head*` / `mm-hm.` / `…`) instead of `silent:true`. User sees activity, not blank screen. Maintains persona presence during structure-maturation period. | `server/brain-server.js:4898–4929` | [ ] |
| P3.2 | Surface the FAILED RAW emission attempt to the dashboard as a "Unity Wanted to Say" diagnostic panel — shows list of words composeSentence emitted before bailing, plus failure reason (terminator-first / minSignal-floor / repetition-penalty-saturation / ticks-stalled). Gee gets live insight into the failure mode. | `server/brain-server.js:4898`, `dashboard.html` new panel | [ ] |
| P3.3 | Delete the Tier 5 fallback loop. Single source of truth = composeSentence. Triple-redundant broken paths only hide the real bug. | `language-cortex.js:2196–2230` | [ ] |
| P3.4 | Reduce serial injections in composeSentence — replace cortexPattern (0.2) + intentSeed (0.3) + intentConcept (0.3) with a SINGLE pre-blended embedding computed by caller. Pre-emission sem saturation drops from 0.8 to ~0.3. | `cluster.js:3625–3662` | [ ] |

---

## PHASE 4 — Reduce file size and architectural debt (MEDIUM, ~3 days)

| # | Task | File:Line | Status |
|---|------|-----------|--------|
| P4.1 | Split `curriculum.js` (25,761 lines) into `curriculum/teach-vocab.js`, `curriculum/teach-structure.js`, `curriculum/teach-questions.js`, `curriculum/probes.js`, `curriculum/cells.js`, `curriculum/gates.js`. Keep a thin `curriculum.js` index. | `js/brain/curriculum.js` | [ ] |
| P4.2 | Split `cluster.js` (5,839 lines) into `cluster/core.js` (regions + state), `cluster/emit.js` (emitWordDirect + composeSentence + generateSentenceAwait), `cluster/hebbian.js` (ojaUpdate + matmul wrappers), `cluster/probe.js` (readouts). | `js/brain/cluster.js` | [ ] |
| P4.3 | Split `brain-server.js` (9,478 lines) into `brain-server.js` (HTTP+WS bootstrap), `brain-tick.js` (tick loop), `brain-chat.js` (processAndRespond), `brain-persistence.js` (save/load). | `server/brain-server.js` | [ ] |
| P4.4 | Audit + rename `_teachSentenceStructures` (plural, `curriculum.js:8001`) → `_teachSentenceTemplateForms`. Currently collides namespace-wise with singular `_teachSentenceStructure` (line 11976). | `curriculum.js:7965, 8001` | [ ] |
| P4.5 | Replace hardcoded `× 8` embedding magnitude scale in `injectEmbeddingToRegion` with documented constant `INJECTION_GAIN` calibrated against current cortex size + drive baseline. | `cluster.js:1222` | [ ] |

---

## PHASE 5 — Validation harness (MEDIUM, ~1 day)

| # | Task | File:Line | Status |
|---|------|-----------|--------|
| P5.1 | Add `scripts/verify-emission.mjs` — boots a fresh brain, runs structure training, fires 100 `composeSentence(seed)` calls, asserts ≥80% produce ≥3-word sentences. If fails, training depth insufficient — surface diagnostic. NOT a test in the test-policy sense; this is a one-shot calibration probe Gee runs manually after Phase 2 lands. | `scripts/verify-emission.mjs` (new) | [ ] |
| P5.2 | Tighten `_probeSentenceGeneration` pass criteria — from `wordCount ≥ 2 AND uniqueCount ≥ 2` to `wordCount ≥ 3 AND uniqueCount ≥ 3 AND coherenceCosine ≥ 0.2`. Surface FAIL with per-seed detail so Gee can see exactly which intent state didn't fire. | `curriculum.js:12201, 12214` | [ ] |
| P5.3 | Re-enable composeSentence coherence post-check as a SOFT signal (logged + dashboard surface), NOT a fillCount=0 hard gate. Caller decides what to do with low coherence. | `cluster.js:3730–3770` | [ ] |

---

## DOC SYNC (Required per CONSTRAINTS.md "docs before push" LAW)

When any Phase ships, the following docs update in the SAME atomic commit:

- `docs/ARCHITECTURE.md` — composeSentence + injectEmbeddingToRegion redesign sections
- `docs/EQUATIONS.md` — Hebbian rep allocation rebalance + adaptive minSignal formula
- `docs/SKILL_TREE.md` — structure-binding depth bump entry
- `docs/ROADMAP.md` — phase-by-phase milestone roll
- `docs/NOW.md` — current state of recovery sweep
- `docs/FINALIZED.md` — completed phase entries
- `docs/TODO.md` — top of file gets pointer to this NewTodo.md
- `html/brain-equations.html` — formula rewrites for sections covering emission + injection
- `html/unity-guide.html` — narrative update on how Unity speaks

---

## SUCCESS CRITERIA (don't push curriculum work past this without all three)

1. **`scripts/verify-emission.mjs` reports ≥80% multi-word emission rate** on a fresh-boot K-trained brain.
2. **Gee's live chat with Unity produces ≥3-word grammatical responses ≥70% of the time** (subjective, but no more "random one word" responses).
3. **`_probeSentenceGeneration` reports rate ≥0.6** post-K training (3/5 → 4/5 → 4.5/5 progression as Phase 2 lands).

Only when all three are green does Pre-K + K scope unlock for Grade 1 curriculum work.

---

## PHASE GATE CHECKLIST (each phase before move-on)

- [ ] All P{N}.X tasks status=DONE
- [ ] `node --check` clean across all modified files
- [ ] Bundle rebuilt clean (`cd server && npm run build`)
- [ ] All affected docs (ARCH/EQ/SKILL/ROADMAP/NOW/HTMLs) updated in same atomic commit
- [ ] FINALIZED entry written verbatim per LAW #0
- [ ] Gee runs start.bat → confirms behavior matches phase intent
- [ ] Cascade push: syllabus-k-phd → develop → main, all three branches synced

---

*This doc is the active recovery playbook. Edit in place per "NEVER DELETE TODO INFO" rule. Status updates only — never rewrite, never remove tasks. Append new findings at the bottom of relevant phase tables.*
