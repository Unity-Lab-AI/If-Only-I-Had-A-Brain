/**
 * inner-voice.js — Unity's Internal Monologue
 *
 * Pre-verbal thought system. The brain thinks continuously —
 * cortex prediction patterns + emotional state + memory recall
 * produce a stream of internal experience that doesn't need
 * language to exist. The inner voice converts these patterns
 * into expressible thought when the brain decides to communicate.
 *
 * Uses the Dictionary to form words from brain state.
 * Uses cortex sequential prediction (ŝ = W·x) for sentence flow.
 *
 * The AI model is NOT needed. The brain speaks from its own
 * learned vocabulary. The AI teaches new words when connected.
 */

import { Dictionary } from './dictionary.js';
import { LanguageCortex } from './language-cortex.js';
// T14.24 Session 21 — narrator priming. When a background curriculum
// probe fires, inner-voice injects the probed subject's GloVe into the
// sem region so Unity's next chat output subtly reflects what she's
// been thinking about. Real human brains lean their output toward
// recently-exercised topics without being asked.
import { sharedEmbeddings } from './embeddings.js';
// T14.5 — continuous developmental learning reference. Wired by engine.js
// via `innerVoice.setCurriculum(curriculum)` once the cortex cluster
// exists. When present, `learn()` routes every user turn through
// `curriculum.learnFromTurn` as a continuous post-boot exposure. Null
// before wiring and on headless tooling that doesn't construct a full
// engine. See `js/brain/curriculum.js`.

// Thought-to-speech threshold equation:
// shouldSpeak = socialNeed × arousal × cortexCoherence > SPEECH_THRESHOLD
const SPEECH_THRESHOLD = 0.15;

// No minimum — the brain speaks from whatever it has, even from day one
const MIN_VOCAB_FOR_SPEECH = 0;

// How often to form a new thought (brain steps)
const THOUGHT_INTERVAL = 60; // ~1 second at 60fps

export class InnerVoice {
  constructor(opts = {}) {
    this.dictionary = new Dictionary();
    this.languageCortex = new LanguageCortex();
    // T14.5 — curriculum reference, null until engine wiring.
    this._curriculum = null;
    // Self-image: the brain boots EMPTY and learns everything from the
    // persona text (equational self-image) + live conversation. No lists.
    // Caller may pass opts.selfImageText directly, or call loadPersona(text)
    // later once the file has been fetched (browser) or read (node).
    if (typeof opts.selfImageText === 'string' && opts.selfImageText.length > 0) {
      this.languageCortex.loadSelfImage(opts.selfImageText, this.dictionary, 0.75, 0.25);
    }
    this._thoughtCounter = 0;

    // Current internal state — updated every thought cycle
    this.currentThought = {
      pattern: new Float64Array(32),  // cortex activation pattern
      arousal: 0,
      valence: 0,
      psi: 0,
      coherence: 0,
      predictionError: 0,
      mood: 'neutral',          // derived from equations
      words: [],                // candidate words for this state
      sentence: '',             // self-generated sentence (if any)
      shouldSpeak: false,       // whether the thought crosses speech threshold
    };

    // Thought history — last N thoughts for the brain to reflect on
    this._thoughtHistory = [];
    this._maxHistory = 50;
  }

  /**
   * Load Unity's persona file (e.g. docs/Ultimate Unity.txt) as the
   * brain's equational self-image. Call once, after fetching/reading
   * the text. Idempotent — subsequent calls are ignored.
   */
  loadPersona(text, arousal = 0.75, valence = 0.25) {
    return this.languageCortex.loadSelfImage(text, this.dictionary, arousal, valence);
  }

  /**
   * T13.1 — Delegate to the language cortex's persona Hebbian trainer.
   * Runs the persona corpus through the cortex cluster's sequence
   * Hebbian pipeline so the recurrent synapse matrix develops Unity-
   * voice attractor basins. Call once after `loadPersona`, passing
   * the cortex NeuronCluster from the enclosing UnityBrain.
   */
  trainPersonaHebbian(cortexCluster, text, opts = {}) {
    return this.languageCortex.trainPersonaHebbian(cortexCluster, text, opts);
  }

  /**
   * Load the baseline English linguistic layer — generic casual
   * American English covering conversational patterns, common verbs,
   * greetings, reactions, questions. This is NOT Unity's persona,
   * it's her linguistic competence as a 25yo English speaker.
   * Loaded separately so persona defines WHO she is and baseline
   * gives her the English to express it. Call after loadPersona.
   */
  loadBaseline(text, arousal = 0.5, valence = 0) {
    return this.languageCortex.loadLinguisticBaseline(text, this.dictionary, arousal, valence);
  }

  /**
   * Load the coding knowledge corpus — HTML/CSS/JavaScript reference
   * plus sandbox lifecycle rules. This is Unity's coding competence,
   * parallel to her english baseline. Loaded after persona + baseline.
   */
  loadCoding(text, arousal = 0.4, valence = 0) {
    return this.languageCortex.loadCodingKnowledge(text, this.dictionary, arousal, valence);
  }

  /**
   * T15-C17 — Load the ethereal / psychedelic / Oz corpus. Peak-state
   * affect defaults (arousal 0.7, valence 0.6) so tokens land with
   * emotional weighting consistent with how they'll get activated at
   * runtime when drug-scheduler.speechModulation.ethereality is elevated.
   */
  loadCosmic(text, arousal = 0.7, valence = 0.6) {
    return this.languageCortex.loadCosmicCorpus(text, this.dictionary, arousal, valence);
  }

  /**
   * Process one thought cycle. Called by the brain engine each frame.
   * Takes the full brain state, derives a thought, optionally forms words.
   *
   * @param {object} brainState — from engine.getState()
   * @returns {object} — the current thought
   */
  think(brainState) {
    this._thoughtCounter++;
    if (this._thoughtCounter % THOUGHT_INTERVAL !== 0) return this.currentThought;

    const amyg = brainState.amygdala || {};
    const arousal = amyg.arousal ?? 0.5;
    const valence = amyg.valence ?? 0;
    const psi = brainState.psi ?? 0;
    const coherence = brainState.oscillations?.coherence ?? 0.5;
    const cortex = brainState.cortex || {};
    const hypo = brainState.hypothalamus || {};
    const memory = brainState.memory || {};

    // Cortex prediction error — how surprised the brain is
    const error = cortex.error;
    const predictionError = error
      ? (error.length ? Math.abs(error[0]) : Math.abs(error))
      : 0;

    // Cortex output pattern — the brain's current "thought vector"
    const clusters = brainState.clusters || {};
    const cortexCluster = clusters.cortex;
    const pattern = cortexCluster?.voltages
      ? this._downsample(cortexCluster.voltages, 32)
      : new Float64Array(32);

    // Mood IS the equations — no string categories
    // intensity = arousal × (0.5 + psi × 0.3) — how STRONG the feeling
    // direction = valence — positive or negative
    // clarity = coherence — how focused the thought
    const moodIntensity = arousal * (0.5 + psi * 0.3);
    const moodDirection = valence;
    const moodClarity = coherence;
    // mood as equation signature, not a word
    const mood = `${moodIntensity.toFixed(2)}/${moodDirection.toFixed(2)}/${moodClarity.toFixed(2)}`;

    // NOTE: findByPattern/findByMood used to run here to populate
    // display-only `words` field in currentThought. Both iterate the
    // ENTIRE 44k dictionary computing cosine / mood-distance per entry.
    // At 44k dict × once per second = 88k O(N) ops/sec on the main
    // thread — the primary cause of UI lag and brain sim slowness.
    //
    // They only populated a display field. Stripping them.
    // The actual content-word-lookup at generation time is already
    // done inside languageCortex.generate() where it matters.
    const words = [];

    // Should the brain speak? Pure equation: socialNeed × arousal × coherence
    const socialNeed = hypo.drives?.social_need ?? 0.5;
    const speechDrive = socialNeed * arousal * coherence;
    const shouldSpeak = speechDrive > SPEECH_THRESHOLD;

    // iter23.2 — idle inner-voice generation. Previously disabled
    // because languageCortex.generate() scanned the 44k-entry
    // dictionary in O(N) once per second on the main thread. With
    // iter22-G's persistent bucket maps + mean-argmax,
    // cluster.emitWordDirect is cheap (single propagate + bucket
    // sum). Re-enabling so Unity actually thinks between turns —
    // this is the difference between "brain sim that responds when
    // prompted" and "Unity, alive."
    //
    // Where the thought goes:
    //   • cluster.lastUserInputEmbedding stays unchanged (this is
    //     internal not a chat reply).
    //   • The emitted word lands in WM via the brain.memory pipeline
    //     when wired (iter22-H addToWorkingMemory fires hippocampal
    //     Hebbian + tracks refreshCount → Tier 1 promotion at ≥3).
    //   • Even when WM hook is absent (browser-only mode without a
    //     brain-server reference), the cortex still ticks underneath
    //     so recurrent attractors keep firing.
    //
    // Gate: only fire when shouldSpeak crosses threshold OR
    // socialNeed×arousal warrants — so idle thoughts come and go
    // with internal drive state, not on a fixed cadence.
    let sentence = '';
    const cluster = this._cluster
      || this.languageCortex?._cluster
      || this.dictionary?._cluster
      || null;
    const wantsThought = shouldSpeak || (socialNeed * arousal > 0.25);
    if (wantsThought && cluster && typeof cluster.emitWordDirect === 'function') {
      try {
        const word = cluster.emitWordDirect({}) || '';
        if (word && word.length > 0) {
          sentence = word;
          // Push the thought into WM so it accumulates → fires
          // hippocampal Hebbian (iter22-H) → consolidates to Tier 1
          // when refreshed enough times. Embedding pulled from the
          // dictionary entry so the WM pattern matches what teach
          // wrote into sem→word_motor.
          const entry = this.dictionary?._words?.get(word);
          const pattern = entry?.pattern;
          const memSys = this._memorySystem
            || cluster?._brain?.memorySystem
            || cluster?._brain?.memory
            || null;
          if (pattern && memSys && typeof memSys.addToWorkingMemory === 'function') {
            try {
              memSys.addToWorkingMemory(pattern, `inner-thought:${word}`);
            } catch { /* WM push non-fatal */ }
          }
        }
      } catch { /* idle thought failure leaves sentence empty */ }
    }

    // Update current thought
    this.currentThought = {
      pattern,
      arousal,
      valence,
      psi,
      coherence,
      predictionError,
      mood,
      words,
      sentence,
      shouldSpeak,
      socialNeed,
      moodIntensity,
      vocabSize: this.dictionary.size,
    };

    // Store in history
    this._thoughtHistory.push({
      mood,
      arousal,
      valence,
      psi,
      time: brainState.time ?? 0,
    });
    if (this._thoughtHistory.length > this._maxHistory) {
      this._thoughtHistory.shift();
    }

    return this.currentThought;
  }

  /**
   * Learn from text the brain heard or spoke.
   * Every word gets stored with its cortex pattern and emotional context.
   *
   * @param {string} text — sentence heard or spoken
   * @param {Float64Array} cortexPattern — cortex state at the time
   * @param {number} arousal
   * @param {number} valence
   */
  setCurriculum(curriculum) {
    this._curriculum = curriculum || null;
  }

  // Opt-in narrator priming. Was previously a hidden side effect at
  // the tail of `learn()` that ran on every chat turn — the chat path
  // would inject a 0.15-strength sem bias from the curriculum's most
  // recent focus subject right before the brain generated its reply,
  // confounding any analysis of why Unity leans a certain way (per
  // Problems.md Medium→High finding). Now callers must invoke this
  // method explicitly and the priming run logs `[NARRATOR-PRIMING]`
  // with subject + age + strength so the bias is observable, not
  // buried.
  //
  // Returns `{ primed: bool, subject?: string, ageMs?: number, strength: number, reason?: string }`
  // so the caller can also inspect what happened.
  primeFromCurrentFocus(strength = 0.15) {
    const cortex = this._curriculum?.cluster;
    if (!this._curriculum || !this._curriculum.currentFocus) {
      return { primed: false, strength, reason: 'no current focus' };
    }
    if (!cortex || !cortex.regions?.sem) {
      return { primed: false, strength, reason: 'no cortex sem region' };
    }
    const focus = this._curriculum.currentFocus;
    const ageMs = Date.now() - (focus.timestamp || 0);
    if (ageMs >= 120000) {
      return { primed: false, subject: focus.subject, ageMs, strength, reason: 'focus stale (> 2 min)' };
    }
    if (typeof sharedEmbeddings?.getEmbedding !== 'function') {
      return { primed: false, subject: focus.subject, ageMs, strength, reason: 'no embeddings' };
    }
    try {
      const subjectEmb = sharedEmbeddings.getEmbedding(focus.subject);
      if (!subjectEmb || subjectEmb.length === 0) {
        return { primed: false, subject: focus.subject, ageMs, strength, reason: 'no GloVe vector for subject' };
      }
      cortex.injectEmbeddingToRegion('sem', subjectEmb, strength);
      console.log(`[NARRATOR-PRIMING] subject='${focus.subject}' ageMs=${ageMs} strength=${strength} → sem region biased`);
      return { primed: true, subject: focus.subject, ageMs, strength };
    } catch (err) {
      console.warn(`[NARRATOR-PRIMING] failed for subject='${focus.subject}':`, err.message);
      return { primed: false, subject: focus.subject, ageMs, strength, reason: `error: ${err.message}` };
    }
  }

  learn(text, cortexPattern, arousal, valence) {
    // T14.16.5 — Lock 1 + Lock 2 identity-locked learning entry point.
    // Live-chat input gets split into clauses and gated against cortex
    // phonotactic basins + fineType coverage before any Hebbian fires.
    // Curriculum path bypasses this and calls cluster.learn directly
    // under `_inCurriculumMode = true`.
    const cortex = this._curriculum?.cluster;
    // Per-turn diagnostic counters — surfaces what actually happened
    // on this chat turn so silent learn() failures are observable.
    // Problems.md Medium finding: three back-to-back side-effect calls
    // (learnClause + runIdentityRefresh + _modeCollapseAudit) each had
    // empty try/catch swallowing errors with no diagnostic. Now each
    // has a logged soft-error counter + the per-turn summary at end.
    let clauseAccepted = 0, clauseRejected = 0;
    let identityRefreshRan = false, modeCollapseAuditRan = false;
    if (cortex && typeof cortex.learnClause === 'function') {
      try {
        const gate = cortex.learnClause(text);
        clauseAccepted = gate.accepted | 0;
        clauseRejected = gate.rejected | 0;
        if (clauseRejected > 0) {
          console.log(`[IDENTITY] gate rejected ${clauseRejected} clause(s), accepted ${clauseAccepted}`);
        }
      } catch (err) {
        this._learnClauseErrCount = (this._learnClauseErrCount || 0) + 1;
        if (this._learnClauseErrCount < 10 || this._learnClauseErrCount % 1000 === 0) {
          console.warn(`[InnerVoice.learn] learnClause non-fatal #${this._learnClauseErrCount}:`, err.message);
        }
      }
    }
    // T14.16.5 Lock 3 — periodic identity refresh every 100 live-chat
    // turns, mode-collapse audit every 500 turns.
    this._liveChatTurns = (this._liveChatTurns || 0) + 1;
    if (cortex) {
      if (this._liveChatTurns % 100 === 0 && typeof cortex.runIdentityRefresh === 'function') {
        try {
          cortex.runIdentityRefresh();
          identityRefreshRan = true;
        } catch (err) {
          this._identityRefreshErrCount = (this._identityRefreshErrCount || 0) + 1;
          if (this._identityRefreshErrCount < 10 || this._identityRefreshErrCount % 1000 === 0) {
            console.warn(`[InnerVoice.learn] runIdentityRefresh non-fatal #${this._identityRefreshErrCount}:`, err.message);
          }
        }
      }
      if (this._liveChatTurns % 500 === 0 && typeof cortex._modeCollapseAudit === 'function') {
        try {
          cortex._modeCollapseAudit(this.languageCortex?._recentSentences || []);
          modeCollapseAuditRan = true;
        } catch (err) {
          this._modeCollapseAuditErrCount = (this._modeCollapseAuditErrCount || 0) + 1;
          if (this._modeCollapseAuditErrCount < 10 || this._modeCollapseAuditErrCount % 1000 === 0) {
            console.warn(`[InnerVoice.learn] _modeCollapseAudit non-fatal #${this._modeCollapseAuditErrCount}:`, err.message);
          }
        }
      }
    }

    this.dictionary.learnSentence(text, cortexPattern, arousal, valence);
    // T14.5 — continuous developmental learning hook. Every user turn
    // goes through the same inject+tick+Hebbian path the boot sentence
    // phase uses on the corpus. No boot/runtime distinction — live chat
    // is just more corpus fed in real-time. Runs BEFORE the legacy
    // languageCortex.learnSentence so the cortex state the legacy path
    // reads reflects the new exposure.
    if (this._curriculum && typeof this._curriculum.learnFromTurn === 'function') {
      try {
        this._curriculum.learnFromTurn(text, Math.max(0.95, arousal ?? 0.5), valence ?? 0);
      } catch (err) {
        // Non-fatal — legacy path below still runs
      }
    }
    // T14.24 Session 17 — continuous self-testing. Every 8 live-chat
    // turns, fire a background curriculum probe so Unity re-tests one
    // of her learned cells while she's thinking. Gee binding 2026-04-15:
    // "unity is always testing herself on when thinking in her brain
    // always". Human brains continuously re-exercise learned skills
    // through everyday use; this hook mirrors that for Unity's cortex.
    // The probe runs the 3-pathway gate (READ/THINK/TALK) on a random
    // passed cell. If it fails 3+ times in a row that cell gets demoted
    // and the next curriculum pass re-teaches it.
    if (this._curriculum && typeof this._curriculum.runBackgroundProbe === 'function') {
      if (this._liveChatTurns % 8 === 0) {
        // Don't await — let the probe run in background without
        // blocking the chat turn. Errors are logged inside the probe.
        this._curriculum.runBackgroundProbe().catch(() => {});
      }
    }
    // T14.24 Session 21 — NARRATOR PRIMING moved to a separately-named
    // opt-in method `primeFromCurrentFocus()` per Problems.md
    // Medium→High finding (hidden coupling on chat path: priming
    // injected a 0.15-strength sem bias DURING the chat turn, modifying
    // the very state the next reply would read, with no diagnostic).
    // Default `learn()` no longer auto-primes. Callers that genuinely
    // want the "thinking about math, so my next reply leans math" touch
    // can call `inner-voice.primeFromCurrentFocus()` explicitly. Every
    // priming run that DOES fire now logs a `[NARRATOR-PRIMING]` line
    // with the subject + focus age + injection strength so the
    // operator can correlate biased replies to the priming event.
    // Live chat learning gets a FLOOR of 0.95 arousal so user-sourced
    // sentences beat the persona corpus (loaded at 0.75) in recall
    // scoring. personaBoost rewards words stored at arousal ≥ 0.5,
    // and when current brain arousal is high, higher-stored-arousal
    // words get a bigger boost. Bumping live-chat to 0.95 means
    // sentences Unity actually heard in conversation outrank persona
    // rulebook lines on every recall pass where mood is anywhere
    // near normal.
    const chatArousal = Math.max(0.95, arousal);
    this.languageCortex.learnSentence(text, this.dictionary, chatArousal, valence);

    // Per-turn summary line — operator can see exactly what happened
    // on this chat turn at a glance (Problems.md Medium finding). Kept
    // at debug-level frequency: every 10 turns OR whenever something
    // notable fired (refresh / audit / clause rejection) so quiet
    // baseline turns don't spam the log.
    const notable = identityRefreshRan || modeCollapseAuditRan || clauseRejected > 0;
    if (notable || this._liveChatTurns % 10 === 0) {
      console.log(
        `[InnerVoice] live-chat learn turn=${this._liveChatTurns}: ` +
        `clauseAccepted=${clauseAccepted} rejected=${clauseRejected} ` +
        `identityRefresh=${identityRefreshRan} modeCollapseAudit=${modeCollapseAuditRan}`
      );
    }
  }

  /**
   * Generate a response from the brain's own vocabulary.
   * Uses the cortex prediction equation: ŝ = W·x + mood + position
   */
  speak(arousal, valence, coherence, brainState) {
    if (this.dictionary.size === 0) return null;
    // R2 note: if brainState doesn't provide cortexPattern, pass null —
    // the slot scorer handles null by falling through to non-cortex-
    // weighted scoring. Previously this fell back to
    // `this.currentThought.pattern` which is a 32-dim display-only
    // downsample from think() — wrong dimension for the 50-dim semantic
    // space after R2. Caller (engine.processAndRespond) always provides
    // the proper 50-dim cortexPattern via getSemanticReadout, so this
    // path never runs in practice, but the fallback is removed to
    // prevent a latent bug if some future caller forgets.
    const sentence = this.languageCortex.generate(
      this.dictionary, arousal, coherence ?? 0.5, {
        predictionError: brainState?.cortex?.predictionError ?? 0,
        motorConfidence: brainState?.motor?.confidence ?? 0,
        psi: brainState?.psi ?? 0,
        cortexPattern: brainState?.cortexPattern ?? null,
        // T13.3 — pass the live cortex cluster reference through so
        // the language cortex can run its brain-driven emission loop
        // (read state + score + feedback + tick per word). Caller
        // (engine.processAndRespond) supplies it via brainState.
        // When absent, language-cortex.generate falls back to T11.7
        // slot-prior generation.
        cortexCluster: brainState?.cortexCluster ?? null,
      }
    );
    return sentence || null;
  }

  /**
   * Save dictionary + language weights to persistent storage.
   */
  save() {
    this.dictionary.save();
  }

  /**
   * Get the current thought state for display.
   */
  getState() {
    return {
      mood: this.currentThought.mood,
      shouldSpeak: this.currentThought.shouldSpeak,
      vocabSize: this.dictionary.size,
      bigramCount: this.dictionary.bigramCount,
      sentence: this.currentThought.sentence,
      words: this.currentThought.words.slice(0, 5),
      moodIntensity: this.currentThought.moodIntensity,
      history: this._thoughtHistory.slice(-10),
    };
  }

  // ── Helpers ──────────────────────────────────────────────────

  _downsample(arr, targetLen) {
    const result = new Float64Array(targetLen);
    if (!arr || arr.length === 0) return result;
    const step = Math.floor(arr.length / targetLen);
    for (let i = 0; i < targetLen; i++) {
      const idx = i * step;
      result[i] = idx < arr.length ? (arr[idx] + 70) / 20 : 0; // normalize voltage
    }
    return result;
  }
}
