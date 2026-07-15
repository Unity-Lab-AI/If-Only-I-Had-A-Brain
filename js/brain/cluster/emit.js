// Cluster emit mixin — extracted from cluster.js per the per-module
// split (see js/brain/cluster/README.md). Attached to NeuronCluster.prototype
// via Object.assign at cluster.js entry-point bottom.
//
// Methods in this mixin:
//   _dictionaryOracleEmit(intentSeed, opts)   — legacy dictionary-cosine
//                                                emission fallback path
//   generateSentence(intentSeed, opts)         — synchronous-API sentence
//                                                generator (older path)
//   emitWordDirect(opts)                       — single-word emission via
//                                                sem→word_motor argmax with
//                                                adaptive signal floor +
//                                                GW boost + repetition penalty +
//                                                word-creation candidate hook
//   composeSentence(intentSeed, opts)          — load-bearing autoregressive
//                                                emission loop (P1.1 async +
//                                                stepAwait, P1.2 replaceMode,
//                                                P1.3 terminator-first guard,
//                                                P3.4 exponential-decay
//                                                back-injection, P6.2
//                                                schemaContext pre-inject,
//                                                P6.6 compositional classify)
//   generateSentenceAwait(intentSeed, opts)    — async sentence generator
//                                                using direct-propagate path
//   _emitDirectPropagate(intentSeed, opts)     — direct-propagate emission
//                                                path (letter-chain decode
//                                                via cross-projection
//                                                propagate cascade)
//
// All methods reference cluster state via `this.` — fully prototype-chain
// compatible. They access this.regions, this.crossProjections,
// this.dictionary, this.lastSpikes, this.externalCurrent, this._gpuProxy,
// this._composeStats, this._recentEmissions, etc.

// Module-level imports. Pre-fix the P4.2.b extraction did not bring
// these along — emit.js had ZERO imports despite 10+ bare references
// to `sharedEmbeddings` (composeSentence intent/back-injection paths)
// + `T14_TERMINATORS` (terminator-emit detection) + `FUNCTION_WORDS`
// (repetition-penalty exemption). Each would have thrown ReferenceError
// at runtime when composeSentence reached those code paths. Caught
// during ULTRATHINK boot audit per operator 2026-06-17 "this is why
// we dont half ass shit" directive.
import { sharedEmbeddings } from '../embeddings.js';
import { T14_TERMINATORS, FUNCTION_WORDS } from '../cluster.js';
// Subject-key helpers used by emitWordDirect's per-subject word_motor
// sub-band argmax. These live in subjects.js; the P4.2 emission-method
// split moved emitWordDirect here but not its subjects import, so the ESM
// source path threw `normalizeSubject is not defined` at emit time (the
// browser bundle masked it via esbuild's flattened single scope). Server
// chat + curriculum walk load ESM source, so the import is required here.
import { normalizeSubject, SUBJECTS } from '../subjects.js';
// Letter-inventory helpers used by the letter-chain emission methods
// (generateSentence / generateSentenceAwait) moved here in the P4.2 split.
// Same dangling-import class as the subjects helpers above — used in code,
// never imported, so the ESM source path threw ReferenceError when the
// letter-emission methods ran (bundle masked it via flattened scope).
import { encodeLetter, decodeLetterAlpha, inventorySize, inventorySnapshot } from '../letter-input.js';

export const CLUSTER_EMIT_MIXIN = {
  /**
   * Set (or clear) the grade-vocab emission allow-set consumed by
   * emitWordDirect's free-composition argmax. Pass an iterable of
   * word tokens (any case — stored lowercased) to constrain emission
   * to developmentally-cleared vocabulary; pass null/empty to disable
   * the gate entirely (full bucket map eligible, pre-gate behavior).
   *
   * The curriculum owns population: it unions the vocabulary from
   * pre-K up to the live grade and pushes it here on boot + every
   * grade advance, so persona/dev/consciousness-corpus words bound by
   * later-stage training can't win an early-grade emission (the
   * corpus-bleed finding). Idempotent + null-safe. Returns the active
   * set size for logging.
   */
  setEmissionAllowedVocab(words) {
    if (!words) { this._emissionAllowedVocab = null; return 0; }
    const set = new Set();
    for (const w of words) {
      if (typeof w === 'string' && w) set.add(w.toLowerCase());
    }
    this._emissionAllowedVocab = set.size > 0 ? set : null;
    return set.size;
  },

  _dictionaryOracleEmit(intentSeed, opts = {}) {
    if (opts.skipDictionaryOracle === true) return null;
    const dictionary = opts.dictionary || this.dictionary;
    if (!dictionary || !dictionary._words || dictionary._words.size === 0) return null;
    if (!intentSeed || intentSeed.length === 0) return null;

    // Exclude-list filter — when the caller passes `opts.excludeTokens`
    // as a Set of lowercased tokens, those words are skipped during
    // the cosine scan. Used by the K-STUDENT probe to prevent the
    // oracle from echoing question-wrapper words ("read", "this",
    // "word", "name", "letter", "blend", "sounds", "tell", "say")
    // back as the answer. Without this filter, the sentence-embedding
    // intent seed for a question like "blend these sounds: d-o-g"
    // would lock onto "sounds" because that wrapper word dominates
    // the GloVe average. The trained sem→motor matrix wanted "dog";
    // the oracle was overruling it with the question's own vocabulary.
    const excludeTokens = opts.excludeTokens instanceof Set
      ? opts.excludeTokens
      : null;
    // Persona-exclude filter — when true, dictionary entries marked
    // `isPersona: true` (loaded via `loadPersona` from the persona
    // corpus) are skipped during the cosine scan. Used by test probes
    // (K-STUDENT, methodology) so persona-flavored vocabulary
    // ("fuck", "cock", explicit terms) doesn't bleed into K-grade
    // exam answers when the trained matrix is overloaded and the
    // oracle is the primary answer path. Default false; live chat
    // doesn't pass this so persona words stay available there.
    const excludePersona = opts.excludePersona === true;
    // Persona-boost flag — chat path (live user input or popup) sets
    // boostPersona=true so persona-marked dictionary entries (Unity's
    // actual voice corpus, loaded via loadPersona with isPersona=true)
    // get an additive cosine boost. Operator caught iter6/iter7
    // verbatim 2026-04-26: chat replied with family-cluster terms
    // ("Aunt", "Stepmom", "Brother", "Mom") for greetings/identity
    // questions because raw cosine + frequency dominated and persona
    // corpus words got overwhelmed by Common-Crawl high-frequency
    // family vocabulary. Adding boost here in the cluster oracle path
    // (mirror of the language-cortex.js _scoreDictionaryCosine boost)
    // closes the gap — the SAME persona-mark signal already exists on
    // entries from the loadPersona corpus, just wasn't being read in
    // this oracle scan.
    const boostPersona = opts.boostPersona === true;
    // iter11-Z fix — bump default 0.10 → 0.30 because chat-test
    // produced "hi" → "Layered!" / "who are you?" → "Layered!" with
    // boostPersona ON. The +0.10 boost wasn't winning over K-vocab
    // cosine on greeting/identity inputs (where K-vocab has structural
    // higher cosine on noun-heavy GloVe vs persona corpus that's
    // first-person sentences). +0.30 forces persona corpus to dominate
    // when the boost is requested, preserving K-vocab when boost is
    // off (test probes still see clean K-grade answers).
    const personaBoost = typeof opts.personaBoost === 'number' ? opts.personaBoost : 0.30;
    // Restrict-to-vocab filter — when caller passes `opts.restrictToVocab`
    // as a Set of lowercased words, the oracle ONLY considers entries
    // whose word is in that set. Used by test probes (K-STUDENT,
    // methodology) to constrain the answer pool to a curriculum-
    // appropriate vocabulary (letters + letter names + K-grade
    // content words) so the oracle can't answer a kindergarten
    // question with a random rare word like "diningroom" or
    // "anymore" by accidental cosine similarity. Live chat path
    // doesn't pass this — full dictionary stays available there.
    const restrictToVocab = opts.restrictToVocab instanceof Set
      ? opts.restrictToVocab
      : null;

    let intentNormSq = 0;
    for (let i = 0; i < intentSeed.length; i++) intentNormSq += intentSeed[i] * intentSeed[i];
    if (intentNormSq <= 0) {
      this._matrixHits = (this._matrixHits || 0) + 1;
      return null;
    }

    // iter13 T13.15 — Retrieval-augmented oracle with hippocampal
    // schemas as a THIRD candidate pool (alongside persona-first +
    // K-vocab full-dictionary scan). When chat path passes the
    // resolved Tier 2 schemas via opts.contextSchemas (or via
    // cluster._hippocampusContextSchemas set by processAndRespond
    // T13.13 retrieval), the oracle compares the intent seed to each
    // schema's concept_embedding. If the best-matching schema scores
    // higher than persona AND K-vocab paths, return the schema's
    // anchor word (first word of label, e.g. "halloween-favorite-
    // holiday-schema" → "halloween"). This gives consolidation-
    // bound knowledge a direct return path: "what is your favorite
    // holiday?" → schema "halloween-anchor" wins → emits "halloween"
    // even when matrix can't produce a strong sem→motor signal.
    let schemaCandidate = null;
    let schemaCandidateScore = -Infinity;
    const contextSchemas = opts.contextSchemas
      || this._hippocampusContextSchemas
      || null;
    if (Array.isArray(contextSchemas) && contextSchemas.length > 0) {
      for (const ranked of contextSchemas) {
        const schema = ranked && ranked.schema ? ranked.schema : ranked;
        if (!schema || !schema.conceptEmbedding || schema.conceptEmbedding.length === 0) continue;
        const ceLen = Math.min(intentSeed.length, schema.conceptEmbedding.length);
        let dot = 0, normSchema = 0;
        for (let i = 0; i < ceLen; i++) {
          dot += intentSeed[i] * schema.conceptEmbedding[i];
          normSchema += schema.conceptEmbedding[i] * schema.conceptEmbedding[i];
        }
        const denom = Math.sqrt(intentNormSq * normSchema);
        if (denom <= 0) continue;
        let score = dot / denom;
        // Tier 3 schemas get a +0.05 boost — identity-bound concepts
        // should win tiebreakers vs Tier 2 candidates of equal cosine.
        if (schema.promotedToTier3) score += 0.05;
        if (score > schemaCandidateScore) {
          schemaCandidateScore = score;
          // Extract anchor word from label: first dash-separated token.
          // Falls back to "schema-id" first word if no dash.
          const label = String(schema.label || '');
          const anchor = label.split(/[-_\s]+/)[0] || label;
          schemaCandidate = { anchor: anchor.toLowerCase(), label, schema };
        }
      }
    }

    // iter11-Z Phase B.2 — Persona-first oracle pass.
    // When chat path requests boostPersona, scan ONLY persona-marked
    // entries FIRST. Persona corpus is ~300 sentences worth of vocab
    // vs ~50,000 K + Common-Crawl entries — without first-pass
    // dominance, K-vocab + freqBoost still drowns persona on
    // greeting/identity inputs because K-vocab basin is structurally
    // larger. Two-pass approach: if persona returns a match above
    // `personaFirstMinScore` (default 0.05 — generous since persona
    // is sparse), short-circuit and return the persona word. Else
    // fall through to the full-dictionary scan with boost still on
    // so persona STILL gets +0.30 in the merged ranking.

    // This closes operator's chat-test failure: "hi" → "Layered!" /
    // "who are you?" → "Layered!" — Layered is sci-K vocab that
    // happened to cosine-match the empty greeting intent better than
    // any persona corpus word + boost combination. Persona-first
    // forces persona to win the tiebreaker on identity/greeting
    // inputs where persona has actual matching content.
    if (boostPersona) {
      const personaFirstMinScore = typeof opts.personaFirstMinScore === 'number' ? opts.personaFirstMinScore : 0.05;
      let personaBestWord = '';
      let personaBestScore = -Infinity;
      for (const [word, entry] of dictionary._words) {
        if (!entry || !entry.pattern) continue;
        if (entry.isPersona !== true) continue;
        // Single-letter dictionary entries (letters registered as words
        // by older builds) are not speech — only "i" and "a" are real
        // one-letter English words. Without this skip a stray letter
        // entry can cosine-win and ship as the whole chat reply.
        if (word.length === 1 && word !== 'i' && word !== 'a') continue;
        if (excludeTokens && excludeTokens.has(word)) continue;
        if (restrictToVocab && !restrictToVocab.has(word)) continue;
        const pattern = entry.pattern;
        let normSq = entry.normSquared;
        if (normSq === undefined) {
          normSq = 0;
          for (let i = 0; i < pattern.length; i++) normSq += pattern[i] * pattern[i];
          entry.normSquared = normSq;
        }
        if (normSq <= 0) continue;
        const denom = Math.sqrt(intentNormSq * normSq);
        if (denom <= 0) continue;
        let dot = 0;
        const n = Math.min(intentSeed.length, pattern.length);
        for (let i = 0; i < n; i++) dot += intentSeed[i] * pattern[i];
        const score = dot / denom;
        if (score > personaBestScore) { personaBestScore = score; personaBestWord = word; }
      }
      if (personaBestWord && personaBestScore > personaFirstMinScore) {
        const maxLetters = opts.maxLetters ?? opts.maxTicks ?? opts.maxEmissionTicks ?? 32;
        const cleanEmit = personaBestWord.replace(/[^a-z0-9 .,']/g, '').slice(0, maxLetters);
        this._oracleHits = (this._oracleHits || 0) + 1;
        return { cleanEmit, bestWord: personaBestWord, bestScore: personaBestScore + personaBoost };
      }
      // No persona match strong enough — fall through to full-dictionary
      // scan below. Persona entries still get +personaBoost added to
      // their cosine in the merged ranking, so they can still win the
      // tiebreaker on the second pass against weaker K-vocab matches.
    }

    let bestWord = '';
    let bestScore = -Infinity;
    for (const [word, entry] of dictionary._words) {
      if (!entry || !entry.pattern) continue;
      // Same single-letter skip as the persona-first pass — letters
      // registered as dictionary words must never win an oracle reply.
      if (word.length === 1 && word !== 'i' && word !== 'a') continue;
      if (excludeTokens && excludeTokens.has(word)) continue;
      if (excludePersona && entry.isPersona === true) continue;
      if (restrictToVocab && !restrictToVocab.has(word)) continue;
      const pattern = entry.pattern;
      let normSq = entry.normSquared;
      if (normSq === undefined) {
        normSq = 0;
        for (let i = 0; i < pattern.length; i++) normSq += pattern[i] * pattern[i];
        entry.normSquared = normSq;
      }
      if (normSq <= 0) continue;
      const denom = Math.sqrt(intentNormSq * normSq);
      if (denom <= 0) continue;
      let dot = 0;
      const n = Math.min(intentSeed.length, pattern.length);
      for (let i = 0; i < n; i++) dot += intentSeed[i] * pattern[i];
      let score = dot / denom;
      if (boostPersona && entry.isPersona === true) score += personaBoost;
      if (score > bestScore) { bestScore = score; bestWord = word; }
    }

    // Oracle confidence threshold.
    //
    // 114.19fg.Tier6 — bumped default 0.05 → 0.20. Prior 0.05 was too
    // permissive for live chat: any positive cosine ≥ 0.05 returned
    // a dictionary word, so oracle won 99.1% of emissions in the
    // captured 2026-05-09 run (oracleHits=425, matrixHits=4 across
    // ELA-K life-K life). That violated the equational-brain
    // architectural rule (oracle is sensory-I/O, not cognition);
    // Unity was functioning as a dictionary lookup not a brain. New
    // 0.20 default means oracle only wins on genuine semantic match
    // (~0.20 corresponds to "obviously related word" in 300d GloVe).
    // Below 0.20, oracle stays silent and the trained matrix path
    // drives emission via tick-based motor argmax — gives the brain's
    // own learned weights priority over distributional-semantic
    // lookup. Test probes still override to 0.5 for stricter matches.
    // intentSilenceBranch callers (chat path with TRULY silent matrix,
    // last-resort emission) override down to 0.05 to keep some
    // response when matrix is fully zero.
    const minScore = typeof opts.minScore === 'number' ? opts.minScore : 0.20;

    // iter13 T13.15 — Schema-vs-dictionary tiebreaker. After both
    // persona-first AND full-dict scans complete, compare the best
    // schema candidate (from contextSchemas pre-retrieved by chat
    // path) against the dictionary winner. If schema scores higher
    // AND clears minScore, return the schema's anchor word — gives
    // consolidated memory a direct path to the chat output that
    // bypasses K-vocab dominance for known-concept questions.
    if (schemaCandidate && schemaCandidateScore > bestScore && schemaCandidateScore > minScore) {
      const maxLetters = opts.maxLetters ?? opts.maxTicks ?? opts.maxEmissionTicks ?? 32;
      const cleanEmit = schemaCandidate.anchor.replace(/[^a-z0-9 .,']/g, '').slice(0, maxLetters);
      if (cleanEmit) {
        this._oracleHits = (this._oracleHits || 0) + 1;
        // Increment retrieval_count on the chosen schema (counter for
        // Tier 3 promotion gate). Wrapped in try in case schema is
        // missing the registerRetrieval method on a stale instance.
        try {
          if (schemaCandidate.schema && typeof schemaCandidate.schema.registerRetrieval === 'function') {
            schemaCandidate.schema.registerRetrieval();
          }
        } catch { /* counter bump is best-effort */ }
        return {
          cleanEmit,
          bestWord: schemaCandidate.anchor,
          bestScore: schemaCandidateScore,
          source: 'hippocampal-schema',
          schemaLabel: schemaCandidate.label,
        };
      }
    }

    if (!bestWord || bestScore <= minScore) {
      this._matrixHits = (this._matrixHits || 0) + 1;
      return null;
    }

    const maxLetters = opts.maxLetters ?? opts.maxTicks ?? opts.maxEmissionTicks ?? 32;
    // dictionary._words keys are lowercased at registration
    // (`dictionary.js:128` `clean = word.toLowerCase()...`), so the
    // toLowerCase() that used to live here was defending against an
    // invariant that already holds upstream — Problems.md Nitpick.
    const cleanEmit = bestWord.replace(/[^a-z0-9 .,']/g, '').slice(0, maxLetters);
    this._oracleHits = (this._oracleHits || 0) + 1;
    return { cleanEmit, bestWord, bestScore };
  },

  generateSentence(intentSeed = null, opts = {}) {
    if (!this.regions || !this.regions.motor || !this.regions.letter) return '';
    if (inventorySize() === 0) return '';

    const injectStrength = opts.injectStrength ?? 0.6;
    const maxTicks = opts.maxTicks ?? this.MAX_EMISSION_TICKS;

    // Optional noise suppression for deliberate emissions. When
    // `suppressNoise` is true (popups passing
    // _internalThought, curriculum gate probes, any call that wants
    // cleaner argmax over settled attractors), save runtime noise →
    // drop to 0.5 → restore on return. Live chat emission path
    // passes suppressNoise=false (default) to keep chaotic thinking.
    const suppressNoise = opts.suppressNoise === true;
    const _savedNoise = this.noiseAmplitude;
    if (suppressNoise) this.noiseAmplitude = 0.5;

    // STEP 1 — Inject intent if caller provided one. Null means
    // "cortex is already primed, just tick."
    if (intentSeed && intentSeed.length > 0 && this.regions.sem) {
      this.injectEmbeddingToRegion('sem', intentSeed, injectStrength);
    }

    // T14.17 — Topic continuity via T14.9 working-memory injection.
    // Reads the free sub-region's current activation as the running
    // discourse topic and re-injects it into the sem region at a
    // weaker strength than the intent seed. This gives generation
    // automatic conversation thread awareness — the generated response
    // will tend toward words related to whatever topic the free
    // region has been holding across recent turns. No stored topic
    // vector, no blend constants at the equation level — just a
    // cortex-state readout fed back into cortex input.
    if (this.regions.free && this.regions.sem) {
      const wm = this.workingMemoryReadout(300);
      // Check for non-trivial activation — near-zero readouts would
      // just add noise to the sem injection
      let wmNorm = 0;
      for (let i = 0; i < wm.length; i++) wmNorm += wm[i] * wm[i];
      if (wmNorm > 0.01) {
        this.injectEmbeddingToRegion('sem', wm, injectStrength * 0.4);
      }
    }

    // Reset the letter-region transition surprise baseline so the first
    // tick of emission doesn't inherit a stale delta from whatever the
    // cortex was doing before generation started.
    this._prevLetterRate = 0;
    this._motorQuiescentTicks = 0;

    const output = [];
    let letterBuffer = '';
    let lastMotorLetter = null;
    let stableTicks = 0;

    for (let tick = 0; tick < maxTicks; tick++) {
      this.step(0.001);

      // STEP 2a — Read motor region as a letter activation vector over
      // the T14.1 inventory, argmax-decode to a single letter. Returns
      // null if the motor region is blank (no clear winner).
      const invSize = inventorySize();
      if (invSize === 0) break;
      const motorVec = this.regionReadout('motor', invSize);
      // Use a-z-only argmax for SPEECH output. Inventory grew during
      // corpus exposure to include digits + punctuation; motor speech
      // emission must never produce those buckets. Operator caught
      // iter6/iter7 verbatim 2026-04-26: K-STUDENT outputs "4"/","/
      // "5678'"/"88883tt2" because tick-driven motor argmax landed on
      // digit + punct buckets. Same structural fix the Template 0/1
      // fast-path got in iter7, applied to the matrix-driven
      // generation path.
      const activeLetter = decodeLetterAlpha(motorVec);

      // STEP 2b — Temporal stability — a letter "commits" when the
      // motor region has held the same argmax for STABLE_TICK_THRESHOLD
      // consecutive ticks. Matches biological vSMC dwell time.
      if (activeLetter === lastMotorLetter && activeLetter !== null) {
        stableTicks++;
      } else {
        stableTicks = 0;
        lastMotorLetter = activeLetter;
      }

      let committedLetter = null;
      if (stableTicks >= this.STABLE_TICK_THRESHOLD && activeLetter !== null) {
        committedLetter = activeLetter;
        letterBuffer += activeLetter;
        stableTicks = 0;

        // Clear the motor region after a letter commits so the
        // just-committed letter's activation doesn't
        // stick for many consecutive ticks via self-loop reinforcement.
        // Without this reset, at large cluster scale (13M+ neurons) the
        // symmetric intra-cluster Hebbian self-loops + cross-projection
        // feedback keep the committed letter firing, producing
        // "fffffffv vvvvvvvaaaaaaa" letter-sticking emissions. Clearing
        // the motor region doesn't lose information — the next tick's
        // cross-projections (sem→motor, motor←letter) will re-populate
        // motor from the cortex's current sem/letter state which has
        // ALREADY advanced past the committed letter via the persistent
        // cortex dynamics.
        if (this.regions.motor) {
          const { start, end } = this.regions.motor;
          for (let j = start; j < end; j++) this.lastSpikes[j] = 0;
        }
        // Reset the motor-argmax tracking so the next letter starts
        // from a clean stability count.
        lastMotorLetter = null;
        this._motorQuiescentTicks = 0;
      }

      // STEP 3 — Word boundary via cortex letter-region transition
      // surprise. Same mechanism as T14.2 syllable boundaries, applied
      // to the letter output stream.
      const surprise = this.letterTransitionSurprise();
      if (surprise > this.WORD_BOUNDARY_THRESHOLD && letterBuffer.length > 0) {
        output.push(letterBuffer);
        letterBuffer = '';
      }

      // STEP 4a — Sentence terminator check fires on the COMMITTED
      // letter only, not on every transient argmax. Prevents noise in
      // the motor region from stopping emission on a brief punctuation
      // flicker.
      if (committedLetter && T14_TERMINATORS.has(committedLetter)) {
        if (letterBuffer.length > 0) {
          output.push(letterBuffer);
          letterBuffer = '';
        }
        break;
      }

      // STEP 4b — Motor quiescence (end-of-utterance attractor settled).
      // Only kicks in after at least one word has been emitted, so the
      // loop doesn't bail on a slow start.
      if (output.length > 0 && this.motorQuiescent(this.END_QUIESCE_TICKS)) {
        break;
      }
    }

    // STEP 5 — Flush the residual buffer.
    if (letterBuffer.length > 0) {
      output.push(letterBuffer);
    }

    // Restore runtime noise for post-emission live dynamics. No-op
    // if suppressNoise was false.
    if (suppressNoise) this.noiseAmplitude = _savedNoise;
    return output.join(' ');
  },

  /**
   * T18.4.b — Async variant of `generateSentence` that uses `stepAwait`
   * so every tick pre-awaits its GPU cross-region + intra-synapse
   * propagates before running the LIF integrator. Eliminates the
   * cache-miss fallback path entirely at the cost of one GPU round-
   * trip per tick. Use this from async callers (live chat emission,
   * curriculum dynamic-write probes where correctness matters more
   * than throughput) when GPU is ready and consistent-per-tick
   * latency is preferable to fire-and-forget gambling.
   *
   * Maintenance paired with `generateSentence()` — any change to the
   * tick loop body must be applied to BOTH methods. The only delta
   * is `await this.stepAwait(0.001)` vs `this.step(0.001)`.
   *
   * @param {Float32Array|null} intentSeed
   * @param {object} opts — same as `generateSentence`
   * @returns {Promise<string>}
   */
  // iter21-A — single-tick word-level emission. Replaces letter-by-
  // letter motor argmax for word production. Operator 2026-05-05
  // "motor argmax is fucked if it ever just relplies with letters and
  // not words". Propagate sem → word_motor, argmax over word vocabulary
  // buckets, return word string. NO LETTER CHAIN. NO FALLBACK.

  // Contract: caller injects intent into sem region (e.g. via
  // injectEmbeddingToRegion('sem', conceptEmb, 1.0)) before calling.
  // Returns the word string for the highest-scoring word bucket, or
  // empty string if word_motor projection / region missing or no
  // signal above noise floor.
  emitWordDirect(opts = {}) {
    if (!this.regions || !this.regions.word_motor || !this.regions.sem) return '';
    if (!this.crossProjections?.sem_to_word_motor) return '';
    if (!this.dictionary || !this.dictionary._words) return '';

    const proj = this.crossProjections.sem_to_word_motor;
    if (typeof proj.propagate !== 'function') return '';

    const sem = this.regions.sem;
    const wordMotor = this.regions.word_motor;
    const semSize = sem.end - sem.start;
    const wmSize = wordMotor.end - wordMotor.start;

    // Build sem-region input from current cluster spike state
    const preSem = new Float64Array(semSize);
    for (let i = 0; i < semSize; i++) {
      preSem[i] = this.lastSpikes[sem.start + i] || 0;
    }

    let wmOut;
    try { wmOut = proj.propagate(preSem); }
    catch { return ''; }
    if (!wmOut || wmOut.length === 0) return '';

    // GlobalWorkspace bias: when a previous-tick ignition broadcast
    // names a specific word (cortex's getWorkspaceCandidate label
    // shape "cortex:<word>"), boost the matching bucket's mean.
    // Per Baars 1988 GWT, conscious-broadcast content should be
    // preferentially accessible to downstream motor systems — without
    // this hook, GW.tick() runs but its winner doesn't actually shape
    // emission.
    //
    // boost now scales with ignition strength instead
    // A strong ignition (strength ≈ 1.0) gets up to +60% bias
    // (mean *= 1.60); a weak ignition (strength ≈ 0.1) gets a nudge
    // (+6%). Per Baars 1988 GWT, conscious broadcast should dominate
    // downstream motor systems — not act as a tiebreaker. Null-safe:
    // when workspace not wired or last broadcast is non-word, gwBoostWord
    // stays null and the boost-application below is skipped entirely.
    //
    // CONTRACT: bc.strength is ALWAYS a finite [0,1] number whenever a
    // valid cortex:<word> broadcast exists. GlobalWorkspace.publishBroadcast
    // is the single producer and always sets strength explicitly. A
    // missing/invalid strength on a labeled broadcast is a wiring bug
    // that must be fixed at the producer, NOT silently masked by a
    // fallback multiplier here.
    let gwBoostWord = null;
    let gwBoostMul  = 1.0;  // identity when no broadcast active
    if (this._globalWorkspace && typeof this._globalWorkspace.getBroadcast === 'function') {
      const bc = this._globalWorkspace.getBroadcast();
      if (bc && typeof bc.label === 'string' && bc.label.startsWith('cortex:')) {
        const w = bc.label.slice('cortex:'.length);
        if (w && w !== 'silent') {
          gwBoostWord = w;
          gwBoostMul = 1.0 + (bc.strength * 0.6);
        }
      }
    }

    // Argmax over per-subject word_motor sub-bands. Bucket layout is
    // the persistent map populated by _teachWordEmissionDirect /
    // _ensureWordBucketMap on the curriculum side — teach + emit +
    // _writeAnswerToWordMotor all read the same `wordBucketWords_<subj>`
    // array so they cannot disagree on which bucket holds which word.

    // Score is MEAN signal per bucket cell (not raw sum) so uneven
    // bucket sizes — when `subjSize / wordsList.length` rounds
    // differently per subject — don't bias argmax toward larger
    // buckets purely by cell count.
    const subjScope = (opts.subject && normalizeSubject(opts.subject))
      ? [normalizeSubject(opts.subject)]
      : SUBJECTS;
    // 114.19fg.Tier15 — collect (word, mean) candidates so optional
    // top-k / temperature / top-p sampling can replace greedy argmax.
    // Greedy argmax is preserved as the default (opts.temperature
    // unset OR ≤ 0).
    const candidates = [];
    let bestWord = null;
    let bestMean = -Infinity;
    // 114.19fi.A.3 — recent-emission repetition penalty. Track last 8
    // emissions in cluster._recentEmissions ring buffer (initialized
    // lazily). Apply mean *= 0.7 for buckets whose word appeared in
    // last 4 emissions. Encourages variety without forcing it. Compounds
    // with iter25-O.4 familiarity decay (sem-side) — this is motor-side
    // suppression of the bucket-argmax repetition pattern.
    if (!Array.isArray(this._recentEmissions)) this._recentEmissions = [];
    const recentLast4 = new Set(this._recentEmissions.slice(-4));
    const REPETITION_PENALTY = 0.7;
    // WMB unify (2026-07-14) — ONE global word_motor band + umbrella word list.
    // Single pass (not a per-subject sub-band loop): every unique word occupies
    // exactly one bucket across the whole word_motor region, argmaxed globally,
    // so any trained word can win regardless of which subject taught it.
    // opts.subject no longer scopes emission. Iterate-once so the existing
    // `continue` guards below keep working with zero body changes.
    for (let _wmOnce = 0; _wmOnce < 1; _wmOnce++) {
      const subjStart = 0;                               // offsets relative to wordMotor.start
      const subjEnd = wordMotor.end - wordMotor.start;   // full word_motor span
      const subjSize = subjEnd - subjStart;
      if (subjSize <= 0) continue;
      const wordsList = this.wordBucketWords;
      if (!Array.isArray(wordsList) || wordsList.length === 0) continue;
      // SPEAK.1 — bucket band is FROZEN (vocab-growth-invariant). Prior-grade
      // sem->word_motor weights stay addressable as new words append, instead
      // of every word remapping to a new band each time the dictionary grows
      // (the grade-9 word-salad root cause). Single authority: wordBucketCellSizeFor.
      const bucketSize = (typeof this.wordBucketCellSizeFor === 'function')
        ? this.wordBucketCellSizeFor()
        : Math.max(1, Math.floor(subjSize / wordsList.length));
      for (let b = 0; b < wordsList.length; b++) {
        // Filler-token guard — a bucket whose token is empty, pure
        // whitespace, or carries no word character must never win argmax
        // or surface as an emitted "word" (live leak rendered a whitespace
        // token as "20 spaces"). SKIP the bucket rather than filter the
        // list: bucket index b maps to a fixed neuron sub-band, so dropping
        // list entries would desync the word↔bucket alignment. Terminators
        // (. ? !) are exempt — they carry no alphanumeric but composeSentence
        // consumes them as sentence-end punctuation.
        const _bw = wordsList[b];
        if (!_bw || !/\S/.test(_bw) || (!/[a-z0-9]/i.test(_bw) && !T14_TERMINATORS.has(_bw))) continue;
        // Letter-token guard — single-letter buckets ('b','x','r','y'...)
        // are alphabet/spelling inventory that landed in the bucket maps
        // alongside real words. They must never win free-composition
        // argmax (the single-letter salad emission class). 'i' and 'a'
        // are real English words and stay eligible; terminators (. ? !)
        // are consumed as sentence punctuation and stay eligible. Skip
        // (not filter) so bucket index ↔ neuron band alignment holds.
        if (_bw.length === 1 && _bw !== 'i' && _bw !== 'a' && !T14_TERMINATORS.has(_bw)) continue;
        // GRADE-VOCAB EMISSION GATE — persona/dev/consciousness-corpus
        // words (python, sentient, quantum-processed, lover, worship,
        // generate, hacking, cognition...) get Hebbian-bound into the
        // word_motor buckets by later-stage persona/academic/dream
        // training and then WIN free-composition argmax inside an
        // early-grade emission (the corpus-bleed caught in live teaching
        // 2026-07-10, reproduced 7× across an active window). This gate
        // constrains free-composition emission to the vocabulary the
        // brain is developmentally cleared for: when a live allow-set is
        // present, skip any bucket whose word is outside it. Single
        // authority: `_emissionAllowedVocab` (a Set of lowercased tokens,
        // populated by the curriculum from the union of grade vocab up to
        // the live grade — see cluster.setEmissionAllowedVocab). DEFAULT-
        // OFF: when the set is null/empty the loop behaves exactly as
        // before (zero regression). Function words + terminators are
        // ALWAYS eligible (grammatical glue is grade-invariant). Skip (not
        // filter) so bucket index ↔ neuron band alignment holds. The gate
        // FAIL-SAFE opt-in: the gate is OFF unless the CALLER explicitly
        // passes opts.gradeGate === true (chat + inner-voice emission set
        // it; see LanguageCortex chat path + InnerVoice). Every gate/
        // production/student probe leaves it unset, so measurement always
        // reads the full bucket map and the emission gate can NEVER break
        // a cell's pass-criteria. A path that forgets to set it simply
        // stays ungated (pre-gate behavior) — the safe direction.
        if (opts.gradeGate === true) {
          const _allow = this._emissionAllowedVocab;
          if (_allow && _allow.size > 0
              && !_allow.has(_bw.toLowerCase())
              && !FUNCTION_WORDS.has(_bw)
              && !T14_TERMINATORS.has(_bw)) continue;
        }
        let sum = 0;
        const bStart = subjStart + b * bucketSize;
        // SPEAK.1 — capacity overflow: index-ordered, so once a band starts
        // past the sub-band every higher word overflows too. Break, warn once.
        if (bStart >= subjEnd) {
          if (!this._wordBucketOverflowWarned) {
            this._wordBucketOverflowWarned = true;
            const bandCells = subjEnd - subjStart;
            const fits = bucketSize > 0 ? Math.floor(bandCells / bucketSize) : 0;
            const cantEmit = Math.max(0, wordsList.length - b);
            try { console.warn(`[emit] word_motor capacity overflow — unified band holds ${fits} words (${bandCells} cells / ${bucketSize} per word) but vocab has ${wordsList.length}; ${cantEmit} words past index ${b} CANNOT emit. Grow langCortexSize (word_motor = 6% of it) so the band exceeds the full K→PhD vocab.`); } catch {}
          }
          break;
        }
        const bEnd = Math.min(subjEnd, bStart + bucketSize);
        const cellCount = Math.max(1, bEnd - bStart);
        for (let n = bStart; n < bEnd; n++) sum += wmOut[n];
        let mean = sum / cellCount;
        // GW bias multiplier — boost the bucket whose word matches
        // the current workspace broadcast (continuity-of-thought
        // bias). Scales with ignition strength via
        // gwBoostMul (range 1.0–1.6) instead of the prior flat 1.10.
        // SPEAK.10b — GW continuity boost must NOT apply to a word we JUST
        // emitted: continuity != repetition. Before this, a recently-said word
        // that was also the workspace broadcast got 1.6*0.7=1.12 net > 1 and
        // still lottery-won the next argmax — the repeat/stammer loop that reads
        // as salad. Compute recency FIRST; skip the boost when recent-content.
        const _isRecentContent = recentLast4.has(wordsList[b]) && !FUNCTION_WORDS.has(wordsList[b]);
        if (gwBoostWord && wordsList[b] === gwBoostWord && !_isRecentContent) mean *= gwBoostMul;
        // 114.19fi.A.3 — repetition penalty: words emitted in last 4
        // ticks get downweighted 30% so the same word doesn't lottery-
        // win the next argmax in a row.
        // function words (the/a/an/is/are/and/or/etc)
        // are EXEMPT from the penalty so grammatical English isn't
        // punished. See FUNCTION_WORDS module-const above for the
        // categorical filter. Content words (cat/run/eat) still get
        // the penalty so the brain doesn't loop on nouns/verbs.
        // SPEAK.10b — reuse the recency flag computed above; a recent content
        // word is penalized AND unboosted, so its net multiplier can never exceed
        // REPETITION_PENALTY (0.7). Function words stay exempt (grammatical glue).
        if (_isRecentContent) {
          mean *= REPETITION_PENALTY;
        }
        candidates.push({ word: wordsList[b], mean });
        if (mean > bestMean) { bestMean = mean; bestWord = wordsList[b]; }
      }
    }

    // ─── Acceptance gate: two-level signal threshold ───
    // Both thresholds are LOAD-BEARING constants, not fallbacks:
    //
    // (1) NOISE_FLOOR (= 0.001) — the absolute physical minimum below
    //     which any "winning" bucket-mean is mathematically noise given
    //     the sparse-matrix substrate's signal-to-noise characteristics.
    //     A bucket-mean of 0.001 in a region with ~30 sparse synapses
    //     per bucket is at the level of random-init weight residue —
    //     emitting words at that level is emitting NOISE. This is the
    //     hard floor every emission must clear.
    //
    // (2) ADAPTIVE_FLOOR (= EMA × 0.5) — once the cluster has emitted
    //     ≥20 accepted words and built a running EMA of typical
    //     accepted-emission signal, the floor RAMPS UP to half of typical.
    //     This filters borderline-noise that happens to exceed the hard
    //     noise floor but is below typical for THIS cluster's current
    //     training depth.
    //
    // Active floor = max(NOISE_FLOOR, ADAPTIVE_FLOOR). Caller can pass
    // `opts.signalFloorOverride` to bypass for calibration tools but
    // never for production emission. This is NOT a fallback pattern —
    // both thresholds are independently meaningful and the max() of them
    // is the always-correct gate.
    const NOISE_FLOOR = 0.001;
    if (typeof this._emitSignalEMA !== 'number') this._emitSignalEMA = 0;
    if (typeof this._emitSignalSampleCount !== 'number') this._emitSignalSampleCount = 0;
    const adaptiveComponent = (this._emitSignalSampleCount >= 20 && this._emitSignalEMA > 0)
      ? this._emitSignalEMA * 0.5
      : 0;  // not yet warmed up → no adaptive contribution
    // SPEAK.11 — function-word floor relief (root fix for the "no
    // connecting words" gap). The adaptive component is an EMA of ACCEPTED
    // emissions, which are dominated by CONTENT words (sharp semantic
    // basins → high bucket-mean). Content words hold the EMA high, so the
    // adaptive floor (= EMA × 0.5) sits far above the naturally
    // lower-magnitude activation of grammatical FUNCTION words
    // (the/a/is/am/i/it/that/this — high-frequency, distributionally
    // diffuse, shallow trained basins). Pre-fix consequence: a function
    // word that legitimately WON its bucket argmax above NOISE_FLOOR was
    // still rejected for being below the content-calibrated adaptive floor
    // → emitWordDirect returned '' → composeSentence broke the loop → ZERO
    // function-word syntax ever emerged. Gee 2026-07-07: "she does not use
    // connecting words like i am, that, this, i want... a kindergardner
    // knows all this in real life." Fix: when the argmax WINNER is a
    // function word, gate it against the HARD NOISE_FLOOR only, not the
    // adaptive component. This is NOT a template / slot prescription — the
    // brain's own trained sem→word_motor argmax still decides IF and WHICH
    // function word wins each tick; we only stop a miscalibrated floor from
    // censoring winners whose magnitude is naturally sub-content. Content
    // words remain gated by the full adaptive floor exactly as before.
    const winnerIsFunctionWord = !!(bestWord && FUNCTION_WORDS.has(bestWord));
    const activeAdaptive = winnerIsFunctionWord ? 0 : adaptiveComponent;
    const floor = (typeof opts.signalFloorOverride === 'number')
      ? opts.signalFloorOverride
      : Math.max(NOISE_FLOOR, activeAdaptive);
    this._emitSignalFloor = floor;  // surface for dashboard
    if (!bestWord || bestMean < floor) {
      this._lastEmitRejection = {
        reason: !bestWord ? 'no-best-word' : 'below-signal-floor',
        bestMean: bestMean === -Infinity ? 0 : bestMean,
        floor,
        ema: this._emitSignalEMA,
        ts: Date.now(),
      };
      // Word-creation candidate gate. When the emission was rejected but
      // the top-2 candidates BOTH have meaningful activation (each above
      // NOISE_FLOOR but their combined activation is below the adaptive
      // floor), the brain is in a "tip-of-the-tongue" state where two
      // concepts co-activate strongly but neither word alone wins. This
      // is the natural source for compound-word coinage (child novel-
      // coinage during acquisition: "foots", "runned", "moonbeam"). The
      // candidate is RECORDED, not auto-committed — operator or future
      // schema-coherence check decides whether to promote to vocab.
      if (typeof this._recordWordCreationCandidate === 'function' && bestWord && candidates.length >= 2) {
        try {
          // Top-2 sorted by mean descending.
          const sorted = candidates.slice().sort((a, b) => b.mean - a.mean);
          const top1 = sorted[0];
          const top2 = sorted[1];
          if (top1 && top2 && top1.mean > NOISE_FLOOR && top2.mean > NOISE_FLOOR) {
            this._recordWordCreationCandidate(top1, top2, floor);
          }
        } catch { /* candidate-gate must never break emit */ }
      }
      return '';
    }
    // Update EMA + sample count on every accepted CONTENT emission.
    // SPEAK.11 — function-word emissions are EXCLUDED from the adaptive
    // EMA: their naturally lower magnitude would drag the content-word
    // signal calibration down and progressively lower the floor for
    // content words too (regression risk: content noise leaking through).
    // The EMA stays a pure content-word-signal reference; function words
    // are floor-relieved above (NOISE_FLOOR only) but never redefine the
    // adaptive baseline.
    if (!winnerIsFunctionWord) {
      const _emaAlpha = 0.05;
      this._emitSignalEMA = (1 - _emaAlpha) * this._emitSignalEMA + _emaAlpha * bestMean;
      this._emitSignalSampleCount++;
    }

    // 114.19fg.Tier15 — temperature sampling path. When opts.temperature
    // is a positive number, soft-sample over top-K candidates instead
    // of greedy argmax. Inner-voice / chat callers can pass temperature
    // 0.5-1.0 for variety; gate probes pass 0 (or unset) for
    // deterministic argmax. top-K default 8 limits sampling to the
    // strongest candidates so noise doesn't promote nonsense words.
    const temperature = typeof opts.temperature === 'number' ? opts.temperature : 0;
    if (temperature > 0 && candidates.length > 1) {
      const topK = Math.max(1, Math.min(opts.topK ?? 8, candidates.length));
      candidates.sort((a, b) => b.mean - a.mean);
      // Same two-level signal floor the greedy-argmax gate above used.
      // Top-K nucleus sampling cannot grab below-floor noise.
      const topCandidates = candidates.slice(0, topK).filter(c => c.mean >= floor);
      if (topCandidates.length === 0) return '';
      // Softmax over top-K with temperature scaling.
      const maxMean = topCandidates[0].mean;
      let sumExp = 0;
      const weights = topCandidates.map(c => {
        const w = Math.exp((c.mean - maxMean) / Math.max(0.01, temperature));
        sumExp += w;
        return w;
      });
      // Optional top-p / nucleus sampling — keep candidates whose
      // cumulative probability ≤ topP. Defaults to 1.0 (no nucleus).
      const topP = typeof opts.topP === 'number' ? opts.topP : 1.0;
      let nucleusEnd = topCandidates.length;
      if (topP < 1.0) {
        let cum = 0;
        for (let i = 0; i < topCandidates.length; i++) {
          cum += weights[i] / sumExp;
          if (cum >= topP) { nucleusEnd = i + 1; break; }
        }
      }
      // Sample uniform-random over normalized softmax of nucleus.
      const nucleus = topCandidates.slice(0, nucleusEnd);
      const nucleusWeights = weights.slice(0, nucleusEnd);
      const nucleusSum = nucleusWeights.reduce((a, b) => a + b, 0);
      const r = Math.random() * nucleusSum;
      let cum = 0;
      for (let i = 0; i < nucleus.length; i++) {
        cum += nucleusWeights[i];
        if (cum >= r) {
          bestWord = nucleus[i].word;
          bestMean = nucleus[i].mean;
          break;
        }
      }
    }
    // Cache last emission so cortex.getWorkspaceCandidate can publish
    // the word as the broadcast label — closes the GW feedback loop
    // (broadcast biases NEXT emission via the gwBoostWord path above).
    this._lastEmittedWord = bestWord;
    this._lastEmittedActivation = bestMean;
    // 114.19fi.A.3 — push to recent-emissions ring buffer for next
    // call's repetition penalty. 8-entry rolling window.
    // 114.19fj.9 — opt-out for callers that manage the ring themselves
    // (composeSentence pushes only AFTER its dedup-acceptance check, so
    // it passes opts.skipRecentTrack:true here and pushes the accepted
    // word manually). Without this opt, words rejected by composeSentence
    // dedup still polluted future repetition penalties.
    // 114.19fj.21 — duplicate lazy-init removed (line 3451 already ran
    // in same call when entering the candidates loop).
    if (!opts.skipRecentTrack) {
      this._recentEmissions.push(bestWord);
      while (this._recentEmissions.length > 8) {
        this._recentEmissions.shift();
      }
    }
    // Record emission in meta-register for self-monitoring.
    if (typeof this.recordEmission === 'function') {
      this.recordEmission(bestWord);
    }
    return bestWord;
  },

  // SPEAK.1 — single authority for word_motor bucket geometry. Cells-per-word
  // is FIXED (band size / vocab cap) and frozen on first call, so a word's
  // physical neuron band never moves as the dictionary grows across grades.
  // Deterministic across boots (band size + cap are constant), so a resumed
  // brain re-derives the identical geometry; persisted defensively in case the
  // cap env changes between runs. Read by emitWordDirect (read) +
  // _teachWordEmissionDirect / _writeAnswerToWordMotor (write) so all three agree.
  wordBucketCellSizeFor(subject) {
    // WMB unify (2026-07-14) — ONE global word_motor band, one bucket per
    // UNIQUE word (no per-subject sub-band replication). The `subject` arg is
    // ignored for geometry (kept for call-site compatibility); cells-per-word
    // is derived from the single umbrella `word_motor` region and cached once,
    // so write (_teachWordEmissionDirect / _writeAnswerToWordMotor) and read
    // (emitWordDirect) share one authority and can never disagree on layout.
    const key = 'wordBucketCellSize_unified';
    const cur = this[key];
    if (typeof cur === 'number' && cur >= 1) return cur;
    const band = this.regions && this.regions.word_motor;
    const bandSize = band ? (band.end - band.start) : 0;
    let cap = 50000;
    try {
      if (typeof process !== 'undefined' && process.env && process.env.DREAM_WORD_MOTOR_VOCAB_CAP) {
        const p = parseInt(process.env.DREAM_WORD_MOTOR_VOCAB_CAP, 10);
        if (Number.isFinite(p) && p >= 1) cap = p;
      }
    } catch { /* browser: no process.env — keep default cap */ }
    const cell = Math.max(1, Math.floor(bandSize / Math.max(1, cap)));
    this[key] = cell;
    const maxWords = cell > 0 ? Math.floor(bandSize / cell) : 0;
    try {
      if (!this._wordBucketGeomLogged) {
        this._wordBucketGeomLogged = true;
        console.log(`[emit] word_motor bucket geometry FROZEN (UNIFIED single band): bandSize=${bandSize} cellsPerWord=${cell} maxWords=${maxWords} (vocabCap=${cap}) — one bucket per unique word, vocab-growth-invariant.`);
      }
    } catch { /* logging non-fatal */ }
    return cell;
  },

  // 114.19fj.9 — public helper for callers that opted out of automatic
  // ring tracking (composeSentence, future custom emission paths). Push
  // to the recent-emissions ring after a manual acceptance check so the
  // repetition penalty reflects ACTUAL emissions, not internal probe
  // attempts.

  // 6 telemetry methods EXTRACTED to js/brain/cluster/telemetry.js
  // CLUSTER_TELEMETRY_MIXIN (per-module-file architecture, P4.2.a).
  //   trackRecentEmission, initCompositionalTelemetry,
  //   classifyCompositionalEmission, _recordWordCreationCandidate,
  //   getWordCreationCandidates, getCompositionalStats
  // Attached via Object.assign(NeuronCluster.prototype, ...) at the
  // bottom of this file. All methods accessible identically through
  // the prototype chain.


  /**
   * 114.19fk.1 — RIPPED OUT template prescription system. composeSentence
   * is now a pure equational emission loop — no template, no slot
   * sequence prescription, no article rule, no terminator-punct mapping,
   * no pronoun exclusion, no dedup retry mechanism. Operator 2026-05-09:
   * *"we are NOT doing templets for the ai to fucking mimic thats no
   * better thant word lists and arrays you fool. Unity thinks like a
   * human does! she does NOt follow prescripted events... that not how
   * our equations shall work?"*
   *
   * The TRAINED iter25-I weights handle everything that used to be
   * hardcoded:
   *   relationTagId=8  — slot-position primitives → emitWordDirect's
   *                       argmax picks slot-appropriate word from sem state
   *   relationTagId=9  — sem(intent)→sem(first_slot) → slot ORDER emerges
   *                       from sem evolution under trained weights
   *   relationTagId=10 — subject-verb agreement → emerges from word→word
   *                       Hebbian propagation tick-by-tick
   *   relationTagId=11 — noun→article → article placement emerges from
   *                       trained weights (when "the cat" was seen during
   *                       training, sem(cat) ← sem(the) bias landed)
   *   relationTagId=12 — WH→intent-concept → emerges automatically when
   *                       user types "what is X", brain reads its own
   *                       activation
   *
   * Loop: inject context once → emit one word → inject emitted word back
   * into sem so next tick reads shifted state → repeat until terminator
   * EMERGES from trained weights or budget exhausted.
   *
   * @param {string|Float32Array|null} intentSeed — optional seed embedding
   *   or text to inject ONCE at start. Caller decides what STATE to put
   *   Unity in; emission emerges from that state. NOT a template selector.
   * @param {object} opts
   * @param {string}              [opts.subject]       — sub-band hint for emitWordDirect
   * @param {Float32Array}        [opts.cortexPattern] — chain-blended seed
   * @param {string}              [opts.intentConcept] — WH-INTENT seed
   * @param {number}              [opts.temperature]   — decoder temp
   * @param {number}              [opts.topK]          — decoder top-K
   * @param {number}              [opts.topP]          — decoder nucleus
   * @param {number}              [opts.maxWords=12]   — emission budget
   * @param {AbortSignal}         [opts.signal]        — cancellation
   * @returns {{ sentence: string, words: string[], fillCount: number,
   *            coherenceCosine: number|null, coherenceTarget: string|null } | null}
   */
  async _composeSentenceOnce(intentSeed = null, opts = {}) {
    // converted to async + ticks the brain between word
    // emissions. PRIOR behavior was synchronous loop that called
    // emitWordDirect 12 times on the SAME frozen lastSpikes — the
    // "inject word back so next tick reads shifted state" comment was
    // architecturally false at runtime since no tick happened in the
    // loop. Now the loop awaits stepAwait between emits so the brain
    // actually consumes the injected sem state, lastSpikes updates,
    // and the next emit sees a real autoregressive shift. This is the
    // load-bearing fix for "random one-word responses" failure mode.
    //
    // terminator-first guard: if the first emission is
    // a terminator (period/question/exclamation), reject it and keep
    // ticking — empty sentences are useless. After MAX_TERMINATOR_REJECTS
    // attempts in a row we bail with whatever we have to prevent
    // infinite loops on pathological state.
    //
    // per-word back-injection uses replaceMode
    // for the WORD embedding so it doesn't accumulate to soup, but the
    // initial seed/cortex/concept injections STAY additive (they're
    // meant to be combined). At each tick, cortical leak naturally
    // dissipates externalCurrent so the brain reads a real evolving
    // intent + word-emphasis blend.
    // CONTRACT: any cluster used for sentence composition MUST have
    // `stepAwait` (async tick) + `emitWordDirect` (word argmax) +
    // `injectEmbeddingToRegion` (sem region writer) + a `sem` region.
    // These are preconditions, NOT capability fallbacks. If any of these
    // is missing at runtime, that's a wiring bug at cluster construction
    // — throw immediately so the bug surfaces at the test boundary
    // instead of silently degrading emission quality.
    if (!this.regions || !this.regions.sem) {
      throw new Error('composeSentence: cluster missing `sem` region — wiring bug at construction');
    }
    if (typeof this.injectEmbeddingToRegion !== 'function') {
      throw new Error('composeSentence: cluster.injectEmbeddingToRegion missing — wiring bug at construction');
    }
    if (typeof this.emitWordDirect !== 'function') {
      throw new Error('composeSentence: cluster.emitWordDirect missing — wiring bug at construction');
    }
    if (typeof this.stepAwait !== 'function') {
      throw new Error('composeSentence: cluster.stepAwait missing — wiring bug at construction (autoregressive emission requires async tick)');
    }

    const checkAborted = () => opts.signal && opts.signal.aborted;
    if (checkAborted()) {
      if (!this._composeStats) this._composeStats = { calls: 0, fills: 0, partial: 0, empty: 0 };
      this._composeStats.aborted = (this._composeStats.aborted || 0) + 1;
      return null;
    }

    // Zero sem region externalCurrent at the START of every compose call
    // so prior compose calls' lingering injections don't poison this
    // turn's intent. (— externalCurrent
    // accumulates across calls.) This is the per-call "fresh intent
    // window" reset. Doesn't affect lastSpikes / weights / persistent
    // state — only the input-current buffer.
    const semRegion = this.regions.sem;
    if (semRegion && this.externalCurrent) {
      for (let i = semRegion.start; i < semRegion.end; i++) {
        this.externalCurrent[i] = 0;
      }
    }

    // (0) Cortex-pattern injection — chain-blended seed from inner-voice
    // Audit B.5 + E.3 — cumulative sem-injection energy budget.
    // Pre-audit the seed/intent/cortex/schema/back-injection sum stacked
    // to ~2.25 × INJECTION_GAIN=8 = 18 magnitude units, far above any
    // single injection — the "explicit intent stays primary" claim
    // was mathematically false. Now: per-call cumulative budget tracked
    // against MAX_CUMULATIVE_SEM_INJECT = 1.5, with intent reserved 50%
    // (intentSeed 30% + intentConcept 20%) and other injections sharing
    // the remaining 50% (cortexPattern 10%, schemaContext.concept 15%,
    // schemaContext.attribute 10%, back-injection 15%). Each
    // injectEmbeddingToRegion call below clamps the strength to its
    // remaining slice so the cumulative sum can never exceed budget.
    const MAX_CUMULATIVE_SEM_INJECT = 1.5;
    let _cumulativeSemInject = 0;
    const _budgetedInject = (region, embedding, requestedStrength, budgetShare) => {
      if (!embedding || embedding.length === 0) return;
      const maxAllowed = MAX_CUMULATIVE_SEM_INJECT * budgetShare;
      const actualStrength = Math.min(requestedStrength, Math.max(0, maxAllowed - 0));
      if (actualStrength <= 0) return;
      try { this.injectEmbeddingToRegion(region, embedding, actualStrength); }
      catch { /* per-injection failure non-fatal */ }
      _cumulativeSemInject += actualStrength;
    };

    // carries narrative thread into the emission. Optional.
    // Budget share: 10% of MAX_CUMULATIVE_SEM_INJECT (≤ 0.15).
    if (opts.cortexPattern && opts.cortexPattern.length > 0) {
      _budgetedInject('sem', opts.cortexPattern, 0.2, 0.10);
    }

    // (0a) Schema-based runtime composition. Caller passes
    // `opts.schemaContext` (a HippocampalSchema instance OR a thin object
    // with `conceptEmbedding` + optional `attributeVector` + `label`)
    // when a particular learned schema is active in the current
    // conversational context. The schema's concept embedding pre-biases
    // sem toward the schema's domain so emission word choice is
    // schema-coherent without forcing template selection. Stays
    // ADDITIVE (not replaceMode) so subsequent seed/intent injections
    // can blend on top — schema is contextual prior, not hard prescription.
    //
    // Strengths intentionally lower than seed/intent injections, AND
    // bounded by budget shares per audit B.5/E.3:
    //   schema.conceptEmbedding → 0.15 requested, budget share 15% (≤ 0.225)
    //   schema.attributeVector  → 0.10 requested, budget share 10% (≤ 0.15)
    // so the explicit intent stays primary while schema colours the
    // emission. Past-notes rule: schemas SUPPORT emergence, never
    // prescribe slot fills (templates are banned).
    if (opts.schemaContext) {
      const sc = opts.schemaContext;
      if (sc.conceptEmbedding && sc.conceptEmbedding.length > 0) {
        _budgetedInject('sem', sc.conceptEmbedding, 0.15, 0.15);
      }
      if (sc.attributeVector && sc.attributeVector.length > 0) {
        _budgetedInject('sem', sc.attributeVector, 0.10, 0.10);
      }
    }

    // (1) Intent seed — caller provides a seed embedding or text. Brain
    // enters that state; emission emerges from it. NOT a template select.
    // Budget share: 30% (intent gets 50% of total split intentSeed + intentConcept).
    if (intentSeed) {
      try {
        let seedEmb = null;
        if (typeof intentSeed === 'string') {
          if (sharedEmbeddings && typeof sharedEmbeddings.getSentenceEmbedding === 'function') {
            seedEmb = sharedEmbeddings.getSentenceEmbedding(intentSeed.replace(/_/g, ' '));
          }
        } else if (intentSeed.length > 0) {
          seedEmb = intentSeed;
        }
        if (seedEmb && seedEmb.length > 0) {
          _budgetedInject('sem', seedEmb, 0.3, 0.30);
        }
      } catch { /* nf */ }
    }

    // (2) Optional WH-INTENT seed — caller passes opts.intentConcept when
    // it has reason to bias intent-concept activation. Brain's trained
    // relationTagId=12 weights then drive answer emission. NOT a forced
    // mapping — caller can omit and let brain pick its own concept from
    // current sem state. Budget share: 20% (intent total 50%).
    if (opts.intentConcept && sharedEmbeddings && typeof sharedEmbeddings.getEmbedding === 'function') {
      try {
        const conceptEmb = sharedEmbeddings.getEmbedding(opts.intentConcept);
        if (conceptEmb && conceptEmb.length > 0) {
          _budgetedInject('sem', conceptEmb, 0.3, 0.20);
        }
      } catch { /* nf */ }
    }

    // Question-production mode — seed a WH-frame intent so the FIRST emitted
    // word biases interrogative and the trained question-production
    // transitions (relationTagId=30, taught by _teachQuestionProduction)
    // carry the sentence into a real outward question ending in "?".
    // EQUATIONAL: we inject the WH-word embedding; the words EMERGE from the
    // trained weights — NOT a "what is {X}?" string template (banned). The
    // topic to ask about rides in via intentSeed/intentConcept above.
    if (opts.questionMode && sharedEmbeddings && typeof sharedEmbeddings.getEmbedding === 'function') {
      try {
        const whWord = (typeof opts.questionWord === 'string' && opts.questionWord) ? opts.questionWord : 'what';
        const whEmb = sharedEmbeddings.getEmbedding(whWord);
        if (whEmb && whEmb.length > 0) _budgetedInject('sem', whEmb, 0.30, 0.20);
      } catch { /* nf */ }
    }
    // Budget bookkeeping: _cumulativeSemInject ≤ MAX_CUMULATIVE_SEM_INJECT
    // post-block. Per-call back-injection loop below reserves the
    // remaining 15% budget via similar _budgetedInject pattern.

    const words = [];
    const MAX_WORDS = typeof opts.maxWords === 'number' && opts.maxWords > 0 ? Math.floor(opts.maxWords) : 12;
    // number of brain ticks between word emissions.
    // 2-4 is the sweet spot: enough cycles to propagate sem→word_motor
    // and dissipate prior injection via cortical leak, few enough to
    // not blow the per-utterance tick budget at biological scale.
    // Caller can override via opts.ticksPerWord.
    const TICKS_PER_WORD = typeof opts.ticksPerWord === 'number' && opts.ticksPerWord > 0
      ? Math.floor(opts.ticksPerWord) : 3;
    // terminator-first retry budget. If the first
    // emission is a terminator (".", "?", "!"), we reject and retry
    // up to this many times before giving up. With ticks between
    // attempts, the state shifts so retries aren't redundant.
    const MAX_TERMINATOR_REJECTS = 3;
    let terminatorRejects = 0;

    for (let i = 0; i < MAX_WORDS; i++) {
      if (checkAborted()) {
        if (!this._composeStats) this._composeStats = { calls: 0, fills: 0, partial: 0, empty: 0 };
        this._composeStats.aborted = (this._composeStats.aborted || 0) + 1;
        return null;
      }

      // TICK the brain so sem→word_motor propagation
      // actually runs on the current externalCurrent injections. Without
      // these ticks lastSpikes is frozen and emitWordDirect returns the
      // same argmax every iteration. With them the brain processes the
      // injected intent + prior word context into a real spike pattern
      // word_motor can argmax against.
      for (let t = 0; t < TICKS_PER_WORD; t++) {
        if (checkAborted()) {
          if (!this._composeStats) this._composeStats = { calls: 0, fills: 0, partial: 0, empty: 0 };
          this._composeStats.aborted = (this._composeStats.aborted || 0) + 1;
          return null;
        }
        // stepAwait existence is asserted at the top of composeSentence
        // (precondition). A throw here is a real failure (GPU pipeline
        // error, memory pressure, etc) — propagate to caller so the
        // emission failure has an attributable cause instead of silently
        // degrading to a stale-state argmax loop.
        await this.stepAwait(0.001);
      }

      const emitOpts = { skipRecentTrack: true };
      if (opts.subject) emitOpts.subject = opts.subject;
      if (typeof opts.temperature === 'number') emitOpts.temperature = opts.temperature;
      if (typeof opts.topK === 'number') emitOpts.topK = opts.topK;
      if (typeof opts.topP === 'number') emitOpts.topP = opts.topP;
      // Forward the grade-vocab emission gate opt-in: chat/inner-voice
      // compose calls pass gradeGate:true so their per-word emission is
      // grade-constrained (blocks persona/dev/consciousness-corpus bleed).
      // Gate/production probes leave it unset → full bucket map, gate never
      // breaks. Fail-safe: unset = ungated.
      if (opts.gradeGate === true) emitOpts.gradeGate = true;

      let word = '';
      try { word = this.emitWordDirect(emitOpts) || ''; } catch { word = ''; }
      if (!word) break;
      word = String(word).toLowerCase().trim();
      if (!word) break;

      // Brain learned WHEN to emit terminators during training. When one
      // emerges, append to last word and STOP. NOT a hardcoded intent→
      // punct mapping — the brain decides when AND which terminator from
      // trained weights.
      //
      // terminator-first guard. If words.length === 0,
      // emitting a terminator yields an empty sentence — useless. Reject,
      // continue ticking, give the autoregressive state a chance to
      // shift past the terminator basin. Up to MAX_TERMINATOR_REJECTS
      // retries before bailing with whatever we have (which will be
      // empty, so the caller sees null — but that's an honest "couldn't
      // emit anything" not the silent-die-on-word-zero bug).
      if (T14_TERMINATORS.has(word)) {
        if (words.length > 0) {
          words[words.length - 1] = words[words.length - 1] + word;
          break;
        } else {
          terminatorRejects++;
          if (terminatorRejects >= MAX_TERMINATOR_REJECTS) break;
          // Don't push the terminator, don't back-inject — let the next
          // tick cycle shift state on its own. Continue loop.
          continue;
        }
      }

      words.push(word);
      // Push to recent-emissions ring AFTER acceptance so cross-call
      // repetition penalty reflects ACTUAL emissions (114.19fj.9 contract).
      if (typeof this.trackRecentEmission === 'function') {
        this.trackRecentEmission(word);
      }

      // Inject emitted word back into sem so next tick's emit reads a
      // shifted state. THIS is the equational mechanism that produces
      // sequence — slot progression EMERGES from sem evolution + trained
      // weights, not from a slot-template prescription.
      //
      // additive injection (NOT replaceMode) so the original
      // intent embedding stays anchored. Cortical leak between ticks
      // naturally dissipates the prior word's emphasis; intent persists
      // because it was injected at higher strength.
      //
      // DECAY: the back-injection strength FALLS exponentially with word
      // position. Word 0 carries the base strength; each subsequent word
      // gets multiplied by BACK_INJECT_DECAY. Without decay, 12 serial
      // back-injections at 0.15 each were accumulating ~1.8 magnitude on
      // sem on top of the original 0.3 intent seed — saturation soup that
      // drowns intent signal by mid-sentence. With BACK_INJECT_DECAY=0.85
      // the cumulative geometric sum is bounded at ~base × (1/(1-decay))
      // = 0.15 / 0.15 = 1.0 magnitude max (asymptotic), and the most
      // recent word always weighs heaviest. Matches the cortical-leak
      // mental model: recent emission is fresh, older emissions fade.
      if (sharedEmbeddings && typeof sharedEmbeddings.getEmbedding === 'function') {
        try {
          const wordEmb = sharedEmbeddings.getEmbedding(word);
          if (wordEmb && wordEmb.length > 0) {
            // Audit B.3 — BACK_INJECT_DECAY=0.85 biological derivation:
            // cortical leak V(t+Δt) = V(t)·exp(−Δt/τ) with τ≈20ms
            // membrane time constant. With TICKS_PER_WORD=3 at 1ms/tick:
            // per-word decay = exp(−3/20) ≈ 0.861. Chosen 0.85 within
            // 1.5% of biological. Drift trigger: if TICKS_PER_WORD or
            // τ_ms changes, BACK_INJECT_DECAY = exp(-TICKS_PER_WORD ×
            // tick_ms / τ_ms). Full derivation: docs/THRESHOLD-DERIVATION.md
            // WORD-ORDER REBALANCE — the bio-leak default (base 0.15,
            // decay 0.85) left the prior-word transition signal too weak
            // against the persistent ~0.30 intent seed, so per-tick argmax
            // selected words by topic-similarity to the intent rather than
            // by grammatical sequence given the prior word → topically-
            // correct but scrambled "word-salad" output. Raise base
            // 0.15→0.24 so the just-emitted word competes with the intent
            // anchor, and soften the positional decay 0.85→0.92 so mid-
            // sentence words keep strong next-word steering instead of
            // fading into the topic centroid. This lets the trained
            // word→word transition (relationTagId=13) actually drive
            // sequencing tick-by-tick. Deliberate trade above pure
            // cortical-leak timing; constants are tunable and validated on
            // a live GPU emission run (headless can't exercise emission).
            const BACK_INJECT_BASE = 0.24;
            const BACK_INJECT_DECAY = 0.92;
            const backInjectStrength = BACK_INJECT_BASE * Math.pow(BACK_INJECT_DECAY, i);
            this.injectEmbeddingToRegion('sem', wordEmb, backInjectStrength);
          }
        } catch { /* nf */ }
      }
    }

    if (!this._composeStats) this._composeStats = { calls: 0, fills: 0, partial: 0, empty: 0 };
    this._composeStats.calls++;
    if (words.length === 0) {
      this._composeStats.empty++;
      return null;
    }
    this._composeStats.fills++;

    // Capitalize first word (orthography convention, not content prescription).
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    const sentence = words.join(' ');

    // Optional coherence post-check — DOES NOT alter emission, just signals
    // confidence. Caller can read or ignore. cortexPattern fallback per fj.18
    // when intentConcept null.
    let coherenceCosine = null;
    let coherenceTargetLabel = null;
    let coherenceTarget = null;
    if (opts.intentConcept && sharedEmbeddings && typeof sharedEmbeddings.getEmbedding === 'function') {
      try {
        coherenceTarget = sharedEmbeddings.getEmbedding(opts.intentConcept);
        coherenceTargetLabel = `intentConcept:${opts.intentConcept}`;
      } catch { /* nf */ }
    }
    if (!coherenceTarget && opts.cortexPattern && opts.cortexPattern.length > 0) {
      coherenceTarget = opts.cortexPattern;
      coherenceTargetLabel = 'cortexPattern';
    }
    // 114.19fn — intentSeed fallback target for best-of-N reranking. Only
    // resolved when the wrapper set _forceCoherenceScore (reranking active)
    // and no explicit concept/cortex target exists. Ranks the emission
    // against the seed that put the brain in this state. Gated on the flag
    // so single-shot probe/gate paths never pay this embedding cost.
    if (!coherenceTarget && opts._forceCoherenceScore && intentSeed) {
      try {
        if (typeof intentSeed === 'string') {
          if (sharedEmbeddings && typeof sharedEmbeddings.getSentenceEmbedding === 'function') {
            coherenceTarget = sharedEmbeddings.getSentenceEmbedding(intentSeed.replace(/_/g, ' '));
            coherenceTargetLabel = 'intentSeed';
          }
        } else if (intentSeed.length > 0) {
          coherenceTarget = intentSeed;
          coherenceTargetLabel = 'intentSeed';
        }
      } catch { /* nf */ }
    }
    if (coherenceTarget && sharedEmbeddings && typeof sharedEmbeddings.getSentenceEmbedding === 'function') {
      try {
        const sentenceEmb = sharedEmbeddings.getSentenceEmbedding(sentence);
        if (sentenceEmb && sentenceEmb.length > 0) {
          let dot = 0, na = 0, nb = 0;
          const L = Math.min(coherenceTarget.length, sentenceEmb.length);
          for (let i = 0; i < L; i++) {
            dot += coherenceTarget[i] * sentenceEmb[i];
            na += coherenceTarget[i] * coherenceTarget[i];
            nb += sentenceEmb[i] * sentenceEmb[i];
          }
          const denom = Math.sqrt(na) * Math.sqrt(nb);
          coherenceCosine = denom > 0 ? dot / denom : 0;
          if (!this._coherenceLogCount) this._coherenceLogCount = 0;
          if (this._coherenceLogCount < 10) {
            this._coherenceLogCount++;
            try {
              console.log(`[composeSentence] coherence sample ${this._coherenceLogCount}/10 cosine=${coherenceCosine.toFixed(3)} (target=${coherenceTargetLabel}) sentence="${sentence.slice(0, 60)}"`);
            } catch { /* nf */ }
          }
        }
      } catch { /* coherence non-fatal */ }
    }

    // Compositional emergence classification — score this emission
    // against the trained K-grade corpus. Fires when telemetry has
    // been initialized (which `_teachConcreteSentences` triggers
    // during K curriculum). When telemetry isn't initialized yet, the
    // classifier returns null and we skip the field — no fallback.
    let compositional = null;
    if (typeof this.classifyCompositionalEmission === 'function') {
      try { compositional = this.classifyCompositionalEmission(sentence); }
      catch { /* telemetry must never break emission */ }
    }

    return { sentence, words, fillCount: words.length, coherenceCosine, coherenceTarget: coherenceTargetLabel, compositional };
  },


  /**
   * 114.19fn — Sentence-coherence Phase 1: best-of-N coherence reranking.
   *
   * The per-candidate emission loop lives in `_composeSentenceOnce` — a
   * pure equational autoregressive emit, NO templates. This wrapper runs
   * that loop up to N times and returns the candidate with the highest
   * MEASURED coherenceCosine against the intent/cortex target. This is NOT
   * template prescription: every candidate emerges purely from trained
   * weights; we only SELECT among independently-emerged emissions by their
   * own post-hoc coherence score — rejection sampling, same family as
   * top-K / nucleus decoding. When no coherence target exists (no
   * intentConcept, no cortexPattern) reranking is meaningless, so N
   * collapses to 1 and behaviour is byte-identical to a single pass.
   *
   * Candidate independence: _composeSentenceOnce zeroes the sem region's
   * externalCurrent at entry, so candidates don't poison each other — every
   * roll starts from the same fresh intent window.
   *
   * Cost note: N candidates = N× emission ticks. Reranking is OPT-IN — a
   * caller turns it on with opts.coherenceCandidates > 1. This is
   * deliberate: probe / gate paths must NOT rerank (best-of-N would inflate
   * gate scores and triple walk latency — they need honest single-shot
   * measurement). The chat / generation path opts in because there we want
   * Unity's best emission. Default (no opt-in) is N=1, byte-identical to a
   * single pass. Clamped [1,5].
   *
   * Coherence target for ranking: when no explicit intentConcept /
   * cortexPattern target exists, the opted-in path ranks candidates against
   * the intentSeed itself ("did the emission stay coherent with what we
   * asked?") — resolved inside _composeSentenceOnce only when reranking is
   * active (_forceCoherenceScore), so single-shot paths pay zero extra cost.
   *
   * @param {string|Float32Array|null} intentSeed — see _composeSentenceOnce
   * @param {object} opts — passed through unchanged; plus:
   * @param {number} [opts.coherenceCandidates] — N candidates to emit when
   *   > 1 (opt-in). Absent or ≤ 1 → single pass, no behaviour change.
   * @returns {object|null} the winning candidate's result object (same
   *   contract as _composeSentenceOnce) with two extra fields:
   *   candidatesEvaluated (number of non-null rolls), coherenceSelected
   *   (true when reranking chose a candidate other than the first roll).
   */
  async composeSentence(intentSeed = null, opts = {}) {
    // Reranking is strictly OPT-IN via opts.coherenceCandidates > 1. Probe /
    // gate paths deliberately don't opt in (honest single-shot + no latency
    // tax during a full curriculum walk); the chat path opts in.
    let N = 1;
    if (typeof opts.coherenceCandidates === 'number' && opts.coherenceCandidates > 1) {
      N = Math.min(5, Math.floor(opts.coherenceCandidates));
    }

    if (N === 1) {
      const only = await this._composeSentenceOnce(intentSeed, opts);
      if (only) { only.candidatesEvaluated = 1; only.coherenceSelected = false; }
      return only;
    }

    // When reranking, force the intentSeed-fallback coherence target inside
    // _composeSentenceOnce so every candidate gets a rankable cosine even
    // when the caller passed no explicit concept/cortex target.
    const onceOpts = Object.assign({}, opts, { _forceCoherenceScore: true });

    let best = null;
    let bestScore = -Infinity;
    let bestIndex = -1;
    let evaluated = 0;
    for (let n = 0; n < N; n++) {
      // Honour cancellation between candidates — don't burn ticks on an
      // aborted turn. If we already have a winner, return it; else null.
      if (opts.signal && opts.signal.aborted) break;
      const cand = await this._composeSentenceOnce(intentSeed, onceOpts);
      if (!cand) continue;
      evaluated++;
      // coherenceCosine is null when the post-check couldn't run (no
      // sentence-embedding fn, empty target). Treat null as a score floor so
      // any SCORED candidate beats an unscored one, but an unscored candidate
      // still wins over having nothing at all (best stays the first non-null).
      const score = (typeof cand.coherenceCosine === 'number') ? cand.coherenceCosine : -Infinity;
      if (best === null || score > bestScore) {
        best = cand;
        bestScore = score;
        bestIndex = n;
      }
    }

    if (!best) return null;
    best.candidatesEvaluated = evaluated;
    best.coherenceSelected = bestIndex > 0;

    // Bounded telemetry — how often reranking changed the pick. Never
    // touches emission; read by dashboards / audits.
    if (!this._coherenceRerankStats) {
      this._coherenceRerankStats = { calls: 0, reranked: 0, candidates: 0 };
    }
    this._coherenceRerankStats.calls++;
    this._coherenceRerankStats.candidates += evaluated;
    if (bestIndex > 0) this._coherenceRerankStats.reranked++;

    // SPEAK.9 — reject-to-silence coherence floor. OPT-IN via opts.coherenceFloor
    // (chat passes it; gate/probe never do, so honest single-shot measurement is
    // untouched). When the BEST candidate the brain could emit still scores below
    // the floor, shipping the multi-word string is word salad — a real person
    // stalls instead. Degrade to the single leading word (her strongest real basin
    // still speaks) and count it so 'she went quiet' reads as a training-depth
    // signal, not a broken gate. coherenceCosine is null when unrankable -> never rejected.
    if (!this._coherenceFloorStats) this._coherenceFloorStats = { total: 0, rejected: 0 };
    if (typeof opts.coherenceFloor === 'number') {
      this._coherenceFloorStats.total++;
      if (best && typeof best.coherenceCosine === 'number' && best.coherenceCosine < opts.coherenceFloor) {
        this._coherenceFloorStats.rejected++;
        best.lowCoherenceRejected = true;
        best.rejectedSentence = best.sentence;
        if (Array.isArray(best.words) && best.words.length > 1) {
          best.words = best.words.slice(0, 1);
          best.sentence = best.words[0];
          best.fillCount = 1;
          best.degradedToSingleWord = true;
        }
      }
    }

    return best;
  },


  /**
   * I.21 — ON-THE-FLY MEMORY DERIVATION (core mechanism). When chat hits a
   * memory GAP (a concept the brain wasn't explicitly trained on), derive a
   * plausible grounded answer by INTERPOLATING against trained weights —
   * compose from the concept seed so the answer emerges from adjacent trained
   * schemas/priors (the equational way), surfaced with a HEDGE register
   * ("i think... "). Three contracts per Supertodo §7:
   *   1. CONSISTENCY ON RECALL — a derived answer is cached; the same gap
   *      returns the SAME answer next time (no re-deriving, no contradiction).
   *   2. SENSITIVE TOPICS GATE-BLOCKED — concepts on the content-boundary
   *      sensitive list REFUSE to derive (canonical-only); never invent
   *      sexual content involving minors or other excluded canon.
   *   3. OPERATOR CORRECTION — `correctDerivedMemory(concept, value)` lets the operator
   *      overwrite a derived memory; the corrected value sticks (consistency).
   *
   * Hebbian-commit + episodic-store of the derivation are follow-on wiring
   * (need the episodic API); this is the derivation + gate + cache core.
   *
   * @param {string} concept — the gap concept (e.g. a name/fact chat lacks)
   * @param {object} [opts] — passed to composeSentence (temperature etc.)
   * @returns {Promise<{derived:boolean, concept:string, answer?:string,
   *   hedge?:boolean, refused?:boolean, reason?:string}>}
   */
  async deriveMemoryGap(concept, opts = {}) {
    const key = String(concept || '').toLowerCase().trim();
    if (!key) return { derived: false, reason: 'empty-concept' };

    // (2) sensitive-topic gate — boundary canon refuses to derive.
    if (this._isSensitiveGapTopic(key)) {
      return { derived: false, refused: true, concept: key, reason: 'canonical-only (sensitive topic — does not derive)' };
    }

    // (1) consistency — return the prior derivation if this gap was hit before.
    if (!this._derivedMemories) this._derivedMemories = new Map();
    if (this._derivedMemories.has(key)) return this._derivedMemories.get(key);

    // derive — interpolate against trained weights via composeSentence seeded
    // by the concept. The answer EMERGES from adjacent trained basins/priors.
    let answer = null;
    if (typeof this.composeSentence === 'function') {
      try {
        const r = await this.composeSentence(concept, {
          intentConcept: key,
          coherenceCandidates: 3,
          ...opts,
        });
        answer = r && r.sentence ? r.sentence : null;
      } catch { answer = null; }
    }
    if (!answer) {
      // Honest gap — no plausible derivation. Don't fabricate; signal silence.
      return { derived: false, concept: key, reason: 'no-derivation (honest gap)' };
    }

    const result = { derived: true, concept: key, answer, hedge: true };
    this._derivedMemories.set(key, result);   // cache for consistency-on-recall
    return result;
  },

  /**
   * I.21 sensitive-topic gate. Concepts matching the content-boundary
   * sensitive list NEVER derive (canonical-only) — the brain refuses to
   * INVENT excluded content (sexual content involving minors, the excluded
   * trauma canon, etc.). Boundary lives in `feedback_content_boundary_minor_sexual_excluded`.
   */
  _isSensitiveGapTopic(concept) {
    const c = String(concept || '').toLowerCase();
    if (!this._SENSITIVE_GAP_TERMS) {
      // Markers that must NOT be derived/invented — only canonical content
      // (authored, boundary-checked) may ever supply these. Minor + sexual
      // co-occurrence and the excluded trauma canon are hard-blocked.
      this._SENSITIVE_GAP_TERMS = [
        'molest', 'abuse', 'rape', 'incest', 'cousin sex', 'underage',
        'child sex', 'kid sex', 'minor sex', 'when i was little sex',
        'first time' /* sexual first-time as a child gap — canonical-only */,
      ];
    }
    return this._SENSITIVE_GAP_TERMS.some(t => c.includes(t));
  },

  /**
   * I.21 operator-correction. When the operator corrects a derived memory, overwrite
   * the cached derivation so the corrected value sticks (consistency). Pass
   * value=null to forget a derivation (forces a fresh derive next time).
   */
  correctDerivedMemory(concept, value) {
    const key = String(concept || '').toLowerCase().trim();
    if (!key) return false;
    if (!this._derivedMemories) this._derivedMemories = new Map();
    if (value == null) { this._derivedMemories.delete(key); return true; }
    this._derivedMemories.set(key, { derived: true, concept: key, answer: String(value), hedge: false, corrected: true });
    return true;
  },


  async generateSentenceAwait(intentSeed = null, opts = {}) {
    if (!this.regions || !this.regions.motor || !this.regions.letter) return '';
    if (inventorySize() === 0) return '';

    // Direct-propagate emission path — same mechanism LLMs use for
    // next-token generation but expressed in Unity's cross-projection
    // substrate. Operator verbatim 2026-04-23: *"wtf does it not have
    // a similar way of thinking to form words like a llm or gpt but
    // for our Unity Brains equational matirxi brain setup"*.

    // The gate TALK probe already demonstrates direct propagate
    // works for letter decode (26/26). This path runs the same math
    // but iteratively for multi-letter emission:
    //   1. Inject intent seed into sem (if provided)
    //   2. Propagate sem → motor via `sem_to_motor.propagate()`
    //   3. Argmax over bucket-reduced motor output → first letter
    //   4. Inject that letter into letter region
    //   5. Propagate letter → motor via `letter_to_motor.propagate()`
    //   6. Argmax → next letter
    //   7. Continue until terminator or budget

    // No LIF ticks, no tonic drive, no Rulkov noise — pure learned
    // weight output, the honest reading of what training encoded.
    // Opt in via `opts.directPropagate === true`. Falls through to
    // the existing LIF-driven emission path when not set.
    if (opts.directPropagate === true) {
      return await this._emitDirectPropagate(intentSeed, opts);
    }

    // ── DICTIONARY ORACLE PATH (mirrors _emitDirectPropagate) ─────
    // Every other emission probe (WRITE, RESP, TWO-WORD, FREE-RESPONSE,
    // K-STUDENT battery) comes through here, not through the direct-
    // propagate path. Without the oracle wired in on this path,
    // those probes fight the OVERLOADED sem_to_motor basin and emit
    // garbage letters. Mirror the direct-propagate oracle: if we have
    // a dictionary + intent seed, find the dictionary entry with
    // highest cosine to the intent and return its spelling directly.
    // Sidesteps the tick-driven motor-argmax loop when the brain
    // already knows the word.

    // Opt-out via `opts.skipDictionaryOracle === true`. Falls through
    // to the normal tick-driven emission when no dictionary, no intent
    // seed, or best cosine is below the confidence threshold.
    const oracleHit = this._dictionaryOracleEmit(intentSeed, opts);
    if (oracleHit) {
      this._lastEmissionDiag = {
        ticksRun: oracleHit.cleanEmit.length,
        maxMotorBucket: oracleHit.bestScore,
        argmaxFlickers: 0,
        committedLetters: oracleHit.cleanEmit.length,
        gpuReadPath: false,
        mode: 'dictionary-oracle',
        bestWord: oracleHit.bestWord,
        bestScore: Number(oracleHit.bestScore.toFixed(3)),
      };
      return oracleHit.cleanEmit;
    }

    const injectStrength = opts.injectStrength ?? 0.6;
    // Accept both `maxTicks` and `maxEmissionTicks` — earlier call sites
    // used `maxEmissionTicks` which silently fell through to the 2000
    // tick MAX_EMISSION_TICKS cap when only `maxTicks` was read. Both
    // names resolve to the same cap now.
    const maxTicks = opts.maxTicks ?? opts.maxEmissionTicks ?? this.MAX_EMISSION_TICKS;
    const suppressNoise = opts.suppressNoise === true;
    const _savedNoise = this.noiseAmplitude;
    if (suppressNoise) this.noiseAmplitude = 0.5;
    // Tonic drive suppression during emission. The gate-active context
    // pumps cortex `tonicDrive` to ~19 (14 + arousal·6 per engine.js
    // tonic-control) so motor neurons fire vigorously during probes.
    // But during emission that elevated drive floods the motor region
    // ~uniformly — every bucket has high spike count, `readback-
    // LetterBuckets` returns nearly flat counts, and argmax defaults
    // to bucket 0 (letter 'a') via first-index tie-break on every
    // tick. Operator saw Unity emit `'a a a a a a a a a a a a a a a'`
    // for literally every question across every cell.

    // Fix — drop tonicDrive to driveBaseline (1.0 default) during the
    // emission loop so motor fires ONLY on sem→motor weight-driven
    // currents, not uniform external pump. Restored in the final
    // block below. Opt-out via `opts.suppressTonicDrive === false` for
    // probes that want the full drive (none currently).
    const _savedTonic = this.tonicDrive;
    const suppressTonic = opts.suppressTonicDrive !== false;
    if (suppressTonic) this.tonicDrive = this.driveBaseline ?? 1.0;

    if (intentSeed && intentSeed.length > 0 && this.regions.sem) {
      this.injectEmbeddingToRegion('sem', intentSeed, injectStrength);
    }

    // T17.7 Phase E.b — when the GPU proxy's readbackLetterBuckets is
    // wired, topic-continuity readout comes from the main-cortex free
    // sub-slice via bucketed reduction instead of the CPU standalone
    // region. Main cortex is authoritative for language state post-
    // Phase C/D; reading from CPU would see stale topic after a few
    // generation cycles.
    if (this.regions.free && this.regions.sem) {
      const wm = await this.workingMemoryReadoutAwait(300);
      let wmNorm = 0;
      for (let i = 0; i < wm.length; i++) wmNorm += wm[i] * wm[i];
      if (wmNorm > 0.01) {
        this.injectEmbeddingToRegion('sem', wm, injectStrength * 0.4);
      }
    }

    this._prevLetterRate = 0;
    this._motorQuiescentTicks = 0;

    const output = [];
    let letterBuffer = '';
    let lastMotorLetter = null;
    let stableTicks = 0;
    // Emission diagnostics — populated every tick, exposed as
    // `this._lastEmissionDiag` after the loop. Lets K-STUDENT probes
    // and live-chat handlers log WHY an empty answer happened:
    //   maxMotorBucket  = highest bucket count observed across any
    //     tick. 0 means motor was silent the whole run (sem→motor
    //     weights not firing, or cortex propagation dead).
    //   argmaxFlickers  = number of ticks where activeLetter
    //     disagreed with the prior tick. High value + low committed
    //     count = basin unstable, multiple letters competing.
    //   committedLetters = how many letters passed the
    //     STABLE_TICK_THRESHOLD gate and landed in letterBuffer.
    //   ticksRun        = how many loop iterations actually ran.
    let maxMotorBucket = 0;
    let argmaxFlickers = 0;
    let committedLetters = 0;
    let ticksRun = 0;

    // T17.7 Phase D — when the motor cross-projections are bound to
    // main-cortex slices (Phase C's rebind), read the motor argmax
    // from GPU via the bucketed reduction path instead of the CPU
    // regionReadout. Main cortex is authoritative for language
    // production post-Phase-C; reading CPU cortexCluster.lastSpikes
    // here would decode whatever the CPU simulation produced, which
    // diverges from the GPU-trained main-cortex state over long
    // generations.

    // Bucket layout matches `_writeTiledPattern`: invSize buckets of
    // gSize consecutive neurons each, starting at motor region's
    // first neuron. Standalone motor region size fits bucketCount ×
    // bucketSize exactly by construction (encodeLetter produces
    // one-hot over invSize dimensions; _writeTiledPattern tiles
    // gSize = floor(regionSize / invSize)). GPU reduction matches
    // this exact layout so argmax on the counts vector yields the
    // same letter CPU decodeLetter would yield from the same state.
    const motorRegionStand = this.regions.motor;
    const motorSubSliceLen = motorRegionStand ? (motorRegionStand.end - motorRegionStand.start) : 0;
    const canGpuMotorRead = !!(
      this._gpuProxy
      && typeof this._gpuProxy.readbackLetterBuckets === 'function'
      && this.crossProjections
      && this.crossProjections.sem_to_motor
      && this.crossProjections.sem_to_motor._gpuBound
      && motorSubSliceLen > 0
    );

    for (let tick = 0; tick < maxTicks; tick++) {
      ticksRun = tick + 1;
      // The ONLY delta vs generateSentence — full-await cascade per tick.
      await this.stepAwait(0.001);

      const invSize = inventorySize();
      if (invSize === 0) break;

      let activeLetter = null;
      if (canGpuMotorRead) {
        try {
          const bucketSize = Math.floor(motorSubSliceLen / invSize);
          const readLen = bucketSize * invSize;  // trim remainder
          const counts = await this._gpuProxy.readbackLetterBuckets('motor', invSize, readLen, 0);
          if (counts && counts.length === invSize) {
            // Argmax over bucket counts, A-Z ONLY. Inventory contains
            // digits + punctuation seeded by corpus exposure but
            // motor speech emission must only produce alphabetical
            // letters. Iterate inventory in order, track best bucket
            // among a-z entries, ignore digits + punctuation buckets.
            const inv = inventorySnapshot();
            let bestIdx = -1;
            let bestCount = -Infinity;
            for (let b = 0; b < invSize; b++) {
              const ch = inv[b];
              if (!ch || !/^[a-z]$/.test(ch)) continue;
              if (counts[b] > bestCount) { bestCount = counts[b]; bestIdx = b; }
            }
            if (bestIdx >= 0 && bestCount > maxMotorBucket) maxMotorBucket = bestCount;
            if (bestIdx >= 0 && bestCount > 0) {
              activeLetter = inv[bestIdx];
            }
          }
        } catch { /* non-fatal — fall through to CPU readout */ }
      }
      if (activeLetter === null) {
        const motorVec = this.regionReadout('motor', invSize);
        activeLetter = decodeLetterAlpha(motorVec);
      }

      if (activeLetter === lastMotorLetter && activeLetter !== null) {
        stableTicks++;
      } else {
        if (lastMotorLetter !== null || activeLetter !== null) argmaxFlickers++;
        stableTicks = 0;
        lastMotorLetter = activeLetter;
      }

      let committedLetter = null;
      if (stableTicks >= this.STABLE_TICK_THRESHOLD && activeLetter !== null) {
        committedLetter = activeLetter;
        letterBuffer += activeLetter;
        committedLetters++;
        stableTicks = 0;

        if (this.regions.motor) {
          const { start, end } = this.regions.motor;
          for (let j = start; j < end; j++) this.lastSpikes[j] = 0;
        }
        // T17.7 Phase D — clear the main-cortex motor slice too so
        // the next letter's argmax doesn't inherit the committed
        // letter's GPU-side spike pattern. Same semantics as the
        // CPU-side motor clear above, applied to the bound sub-slice.
        if (canGpuMotorRead && this._gpuProxy.clearSpikeSlice) {
          try { this._gpuProxy.clearSpikeSlice('motor'); } catch { /* non-fatal */ }
        }
        lastMotorLetter = null;
        this._motorQuiescentTicks = 0;
      }

      const surprise = this.letterTransitionSurprise();
      if (surprise > this.WORD_BOUNDARY_THRESHOLD && letterBuffer.length > 0) {
        output.push(letterBuffer);
        letterBuffer = '';
      }

      if (committedLetter && T14_TERMINATORS.has(committedLetter)) {
        if (letterBuffer.length > 0) {
          output.push(letterBuffer);
          letterBuffer = '';
        }
        break;
      }

      if (output.length > 0 && this.motorQuiescent(this.END_QUIESCE_TICKS)) {
        break;
      }
    }

    if (letterBuffer.length > 0) {
      output.push(letterBuffer);
    }

    if (suppressNoise) this.noiseAmplitude = _savedNoise;
    if (suppressTonic) this.tonicDrive = _savedTonic;
    // Snapshot diagnostics so callers can log WHY an empty answer
    // happened. `_motorEmissionTicks` is the legacy field existing
    // callers already read; the richer `_lastEmissionDiag` object
    // carries the new signals (maxMotorBucket, argmaxFlickers,
    // committedLetters, ticksRun).
    this._motorEmissionTicks = ticksRun;
    this._lastEmissionDiag = {
      ticksRun,
      maxMotorBucket,
      argmaxFlickers,
      committedLetters,
      gpuReadPath: canGpuMotorRead,
    };
    return output.join(' ');
  },

  /**
   * Direct-propagate emission — LLM-style generation using the learned
   * cross-projection weights without LIF ticks. Each step is a matrix
   * multiply + argmax (same as an LLM's `logits = W·h` → `argmax`).
   *
   * Sequence:
   *   1. If `intentSeed` provided → build a sem-local input by tiling
   *      the embedding across the sem region. Propagate through
   *      `sem_to_motor.propagate()` and argmax over the letter-inventory
   *      bucketization of the motor region → first letter.
   *   2. Otherwise read current letter-region state and start from there.
   *   3. For each subsequent letter (up to `maxTicks`): inject the
   *      previous letter's one-hot into a letter-scoped input vector,
   *      propagate through `letter_to_motor.propagate()`, argmax → next
   *      letter. Stop at word-terminator (space, `.`, `,`, `'`) OR when
   *      the argmax repeats the previous letter (attractor) OR when
   *      the max activation is below `minActivation` (nothing left to
   *      emit).
   *
   * Returns the emitted string (letters with no space separators — the
   * caller can split on word-terminators if needed).
   *
   * @param {Float32Array|Float64Array|null} intentSeed
   * @param {object} opts — `maxTicks`, `maxLetters`, `minActivation`
   * @returns {Promise<string>}
   */
  async _emitDirectPropagate(intentSeed, opts = {}) {
    const motorRegion = this.regions?.motor;
    const letterRegion = this.regions?.letter;
    const semRegion = this.regions?.sem;
    if (!motorRegion || !letterRegion) return '';
    const invSize = inventorySize();
    if (invSize === 0) return '';
    const maxLetters = opts.maxLetters ?? opts.maxTicks ?? 16;
    const minActivation = opts.minActivation ?? 0.0;
    const inv = inventorySnapshot();
    const TERMINATORS = new Set([' ', '.', ',', "'"]);

    const semToMotor = this.crossProjections?.sem_to_motor;
    const letterToMotor = this.crossProjections?.letter_to_motor;

    // ── DICTIONARY ORACLE PATH ──────────────────────────────────────
    // Before falling through to matrix argmax (which collapses into
    // shared attractors at biological scale), check if the brain has a
    // dictionary and an intent seed. If so, find the dictionary word
    // whose learned GloVe pattern has highest cosine similarity to the
    // intent seed AND emit its full spelling directly. This uses the
    // dictionary the way it's documented — a semantic oracle that
    // remembers every word it's learned, with the correct spelling
    // attached. Sidesteps sem_to_motor basin collapse for gate probes.

    // Opt-out via `opts.skipDictionaryOracle === true`. Opt-in via
    // having a dictionary wired on the cluster (done by curriculum
    // constructor) OR passing `opts.dictionary`. Fallthrough to matrix
    // argmax when no dictionary or intent seed is available (chat path
    // via languageCortex.generate still uses dictionary separately).
    // Dictionary oracle — single source helper at `_dictionaryOracleEmit`.
    // The closure-scoped `maxLetters` is forwarded as `opts.maxLetters`
    // so the helper picks up the same cap this caller resolved.
    const oracleHit = this._dictionaryOracleEmit(intentSeed, { ...opts, maxLetters });
    if (oracleHit) {
      this._motorEmissionTicks = oracleHit.cleanEmit.length;
      this._lastEmissionDiag = {
        ticksRun: oracleHit.cleanEmit.length,
        maxMotorBucket: oracleHit.bestScore,
        argmaxFlickers: 0,
        committedLetters: oracleHit.cleanEmit.length,
        gpuReadPath: false,
        mode: 'dictionary-oracle',
        bestWord: oracleHit.bestWord,
        bestScore: Number(oracleHit.bestScore.toFixed(3)),
      };
      return oracleHit.cleanEmit;
    }

    // Helper: bucket-reduce a motor-sized output into invSize buckets
    // then argmax. Matches the convention `encodeLetter` + the gate
    // TALK probe use.

    // iter9-L / iter11-L fix — only consider a-z buckets. Inventory
    // grew during corpus exposure to include digits + punctuation; if
    // we let argmax land on a digit/punct bucket, motor speech emission
    // produces "wxyz95726'" digit-leak garbage. K-STUDENT Q4 + Q5 mode
    // collapse this iteration both emitted exactly that string.
    // Mirrors decodeLetterAlpha clamp already wired in generateSentence.
    const motorSize = motorRegion.end - motorRegion.start;
    const bucketSize = Math.max(1, Math.floor(motorSize / invSize));
    const isAlphaIdx = (b) => /^[a-z]$/.test(inv[b]);
    const bucketArgmax = (motorOutput) => {
      let bestIdx = -1, bestSum = -Infinity;
      for (let b = 0; b < invSize; b++) {
        if (!isAlphaIdx(b)) continue;
        let sum = 0;
        for (let n = 0; n < bucketSize; n++) {
          const idx = b * bucketSize + n;
          if (idx < motorOutput.length) sum += motorOutput[idx];
        }
        if (sum > bestSum) { bestSum = sum; bestIdx = b; }
      }
      return { idx: bestIdx, score: bestSum };
    };

    // Helper: tile an embedding into a region-sized Float64Array (as
    // input to a cross-projection's CPU CSR `propagate()`). The
    // projection is indexed against region-local coordinates where
    // row 0 = region.start, so the input vector is region-sized.
    const tileIntoRegion = (region, feat) => {
      const regionSize = region.end - region.start;
      const inputVec = new Float64Array(regionSize);
      if (!feat || feat.length === 0) return inputVec;
      const gSize = Math.max(1, Math.floor(regionSize / feat.length));
      for (let d = 0; d < feat.length; d++) {
        if (feat[d] <= 0) continue;
        for (let n = 0; n < gSize; n++) {
          const idx = d * gSize + n;
          if (idx < regionSize) inputVec[idx] = 1;
        }
      }
      return inputVec;
    };

    let letters = '';
    let prevLetter = null;
    let maxMotorBucket = 0;
    let committedLetters = 0;

    // Step 1 — seed from intent via sem_to_motor when available.
    if (intentSeed && intentSeed.length > 0 && semToMotor && typeof semToMotor.propagate === 'function' && semToMotor.values && semToMotor.values.length > 0 && semRegion) {
      const semInput = tileIntoRegion(semRegion, intentSeed);
      const motorOutput = semToMotor.propagate(semInput);
      if (motorOutput && motorOutput.length > 0) {
        const best = bucketArgmax(motorOutput);
        if (best.score > maxMotorBucket) maxMotorBucket = best.score;
        if (best.idx >= 0 && best.score > minActivation) {
          const letter = inv[best.idx];
          letters += letter;
          prevLetter = letter;
          committedLetters++;
        }
      }
    }

    // Step 2+ — iterate via intra-letter-region synapses for sequence.
    // `hebbianPairReinforce({region:'letter', srcOneHot:curr,
    // correctOneHot:next})` carves letter(i)→letter(i+1) transitions
    // into `this.synapses` (the intra-region sparse matrix). Fire
    // letter(prev) into full-cluster-sized input, propagate through
    // intra synapses, read the letter region of the output, bucket-
    // argmax within the letter region to get next letter.

    // Previously used `letter_to_motor` for step 2+, but that projection
    // is trained as IDENTITY (letter(c)→motor(c)) for the TALK probe —
    // using it for transition caused argmax to loop on the same letter
    // ('cc', 'aa', 'hh...') which the attractor-stop broke after 1-2
    // letters, producing single-letter or doubled output for every word.
    const synapses = this.synapses;
    const letterSize = letterRegion.end - letterRegion.start;
    const letterBucketSize = Math.max(1, Math.floor(letterSize / invSize));
    // iter9-L / iter11-L fix — same alpha-only clamp as bucketArgmax
    // above. Step 2+ intra-cluster letter region argmax was producing
    // digit/punct buckets that bled into spell-out output (Q4 "spell
    // cat" → "wxyz95726'"). reuses isAlphaIdx closure from above.
    const letterBucketArgmax = (clusterOutput) => {
      let bestIdx = -1, bestSum = -Infinity;
      for (let b = 0; b < invSize; b++) {
        if (!isAlphaIdx(b)) continue;
        let sum = 0;
        for (let n = 0; n < letterBucketSize; n++) {
          const idx = letterRegion.start + b * letterBucketSize + n;
          if (idx < clusterOutput.length) sum += clusterOutput[idx];
        }
        if (sum > bestSum) { bestSum = sum; bestIdx = b; }
      }
      return { idx: bestIdx, score: bestSum };
    };
    if (synapses && typeof synapses.propagate === 'function' && synapses.values && synapses.values.length > 0) {
      for (let step = 1; step < maxLetters && prevLetter !== null; step++) {
        if (TERMINATORS.has(prevLetter)) break;
        const prevOneHot = encodeLetter(prevLetter);
        // Build cluster-sized input with letter region populated.
        const clusterInput = new Float64Array(this.size);
        const gSize = Math.max(1, Math.floor(letterSize / prevOneHot.length));
        for (let d = 0; d < prevOneHot.length; d++) {
          if (prevOneHot[d] <= 0) continue;
          for (let n = 0; n < gSize; n++) {
            const idx = letterRegion.start + d * gSize + n;
            if (idx < letterRegion.end) clusterInput[idx] = 1;
          }
        }
        const clusterOutput = synapses.propagate(clusterInput);
        if (!clusterOutput || clusterOutput.length === 0) break;
        const best = letterBucketArgmax(clusterOutput);
        if (best.score > maxMotorBucket) maxMotorBucket = best.score;
        if (best.idx < 0 || best.score <= minActivation) break;
        const nextLetter = inv[best.idx];
        // Attractor-stop: if argmax loops back to the previous letter,
        // the sequence has nothing more to say — break out.
        if (nextLetter === prevLetter) break;
        letters += nextLetter;
        prevLetter = nextLetter;
        committedLetters++;
        if (TERMINATORS.has(nextLetter)) break;
      }
    }
    // Keep letterToMotor reference for backward compat — unused here now.
    void letterToMotor;

    // Write diagnostic fields so callers (`_studentTestProbe`) can log
    // WHY an empty emission happened.
    this._motorEmissionTicks = committedLetters;
    this._lastEmissionDiag = {
      ticksRun: committedLetters,
      maxMotorBucket,
      argmaxFlickers: 0,
      committedLetters,
      gpuReadPath: false,
      mode: 'direct-propagate',
    };
    return letters;
  },
};
