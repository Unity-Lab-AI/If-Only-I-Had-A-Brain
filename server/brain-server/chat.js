// ServerBrain chat mixin — extracted from brain-server.js per the
// per-concern split (see server/brain-server/README.md). Attached to
// ServerBrain.prototype via Object.assign at brain-server.js entry-
// point bottom.
//
// Methods in this mixin (6 total) — main chat-path + inner-voice
// emission surface:
//   processAndRespond(text, userId)  — load-bearing chat path. Handles
//                                      user input → cortex injection →
//                                      P6.3 chat-time deep Hebbian →
//                                      multi-turn coherence → composeSentence
//                                      → response → episodic write
//   _innerVoiceTick()                — autonomous inner-monologue tick
//                                      (~18% per-tick probabilistic
//                                      emission gate, Hurlburt DES rhythm)
//   _sampleCurrentVocab()            — sample currently-trained vocab for
//                                      inner-voice showcase
//   _sampleCurrentSentence()         — sample autoregressive sentence via
//                                      composeSentence for inner-voice
//                                      showcase
//   _shouldEmitInnerThought(now)     — probabilistic gate for inner-voice
//                                      emission (modulated by arousal/
//                                      coherence/curriculum/time-since-last)
//   _pickInnerThoughtSeed()          — pick seed from chain history /
//                                      vocab / sentence sampler for next
//                                      inner-thought emission
//
// All methods reference brain state via `this.` — fully prototype-chain
// compatible. They access this.cortexCluster, this.dictionary,
// this.curriculum, this.persona, this.languageCortex, the inner-thought
// chain, the emission ring, the chat-turn history etc.

// Module-level requires. Pre-fix the P4.3.d extraction did not bring
// these along — the mixin relied on the parent brain-server.js scope.
// Caught by operator 2026-06-17 live test boot crash cascade.
const path = require('path');
const fs = require('fs');
const os = require('os');
// I.19 closure 2026-06-17 22:54 PT — operator caught: "did you fucking
// make the GPU % a static 50% it s not ever budging from 50%". Root
// cause: this file was missing `const { execSync } = require('child_process')`,
// so every `execSync('nvidia-smi ...')` call inside `_updatePerfStats`
// has thrown ReferenceError since I.1 landed. The silent try/catch
// swallowed the error and fell to fallback (0 for I.1's util ring,
// 50% for I.18's vram budget halving). Adding the missing import unbreaks
// ALL GPU polling: VRAM%, util, and the I.17 dispatch counter is fine
// because that lives in gpu.js which has its own scope.
const { execSync } = require('child_process');

const SERVER_CHAT_MIXIN = {
  async processAndRespond(text, userId) {
    // Inject text into brain
    this.injectText(text);
    this._lastInputTime = Date.now();

    // 114.19fj.1 — CRITICAL — set `_lastUserInputText` on the language
    // cortex so the chat-side composeSentence path can read it.
    // engine.js sets it on `clusters.cortex` (main cortex, browser-only
    // fallback path); on the server, `processAndRespond` is the single
    // entry-point for live chat and the language cortex is `cortexCluster`.
    // Without this set, language-cortex.js reads `cluster._lastUserInputText`
    // as undefined and the entire fa→fi WH-INTENT / intent-concept /
    // subject-inference / cortexPattern wiring degrades silently to the
    // pre-fa baseline (default declarative_svo, null concept, null subject).
    // Diagnostic warn at composeSentence call site catches future regressions.
    if (this.cortexCluster) {
      this.cortexCluster._lastUserInputText = text;
    }

    // 114.19fi.B.2 — push user input into _innerThoughtChain so
    // inner-voice's next tick blends user content into its chain seed.
    // Conversational continuity: Unity's autonomous inner monologue
    // reflects on what was just said to her, not just brain state.
    // 114.19fj.2 — lazy-init the chain in the same block. Without this,
    // first-chat-before-first-inner-voice-tick (within 3s of cold boot)
    // silently dropped the user-input from the chain because the array
    // wasn't initialized yet.
    if (text) {
      if (!Array.isArray(this._innerThoughtChain)) this._innerThoughtChain = [];
      this._innerThoughtChain.push({
        sentence: String(text).slice(0, 200),
        seedSource: 'user-input',
        ts: Date.now(),
      });
      while (this._innerThoughtChain.length > 8) {
        this._innerThoughtChain.shift();
      }
    }

    // IMG-GEN — image-request routing. The response-router below only emits
    // `generate_image` when the equational text happens to START WITH the literal
    // `[IMAGE]` marker — which the brain's word emission effectively NEVER
    // produces, so Unity never generated images on request. Detect an image
    // request from the USER's input (input-classification, mirroring the browser
    // engine's keyword path — NOT text-AI cognition) and route straight to
    // generate_image with a prompt built from what they asked for. The client
    // turns the prompt into an actual image via Pollinations.
    if (text) {
      const imgRequest = this._detectImageRequest(text);
      // TU.29.7 — the detected request is the INTENT; the PROMPT is hers.
      // TU.29.9 — EXCEPT a selfie: _detectImageRequest returns her curated
      // self-portrait identity string (with the literal "25 year old"). Running
      // that through _composeImagePrompt stripped the digits ("25" → gone, "a
      // year old goth woman") and appended redundant mood tags, degrading her
      // visual identity + bloating the heaviest prompt (the one most prone to a
      // Pollinations timeout → "image generation failed"). Selfies go out clean.
      const isSelfie = imgRequest && /^(?:selfie|full body photo) of a \d+ year old/.test(imgRequest);
      const imgPrompt = imgRequest ? (isSelfie ? imgRequest : this._composeImagePrompt(imgRequest)) : null;
      if (imgPrompt) {
        this._lastImageIntentAt = Date.now();   // motor block biases the generate_image channel off this
        // IMG-SEE — she SEES it before she sends it. The actual Pollinations
        // pixels render client-side (no image-decode dep server-side / cross-origin
        // canvas would CORS-taint), so the equational "preview" is her MIND'S EYE:
        // imagine a field C from the prompt's semantics via the server mind-space
        // (UVM-INT.3, bounded forward-9-7), read the percept, inject it into sem so
        // she's aware of what she's about to make, and surface it on the Mind's-Eye
        // viewer. Best-effort + bounded — never blocks the image from going out.
        try {
          if (this.mindSpace && typeof this.mindSpace.imagineFromState === 'function'
              && this.sharedEmbeddings && typeof this.sharedEmbeddings.getSentenceEmbedding === 'function') {
            // TU.29.5 — RECALL FIRST: if she has SEEN this concept (visual-memory
            // field C bound at perception time), the preview is the real remembered
            // percept — recombined via morphField when two concepts match. Only an
            // unseen concept falls to the de-novo abstract/symbol plane.
            let rec = null;
            if (typeof this._recallVisualMemory === 'function') {
              try {
                const hit = this._recallVisualMemory(imgPrompt);
                if (hit) rec = hit.rec;
              } catch { /* recall best-effort */ }
            }
            if (!rec) {
              const emb = this.sharedEmbeddings.getSentenceEmbedding(imgPrompt);
              rec = this.mindSpace.imagineFromState(emb, {
                maxSide: 96, text: imgPrompt,
                mood: { arousal: this.arousal, valence: this.valence },
                priority: 0.4, value: 0.6,
              });
            }
            if (rec) {
              const percept = this.mindSpace.describe(rec);
              if (percept && this.cortexCluster && typeof this.cortexCluster.injectEmbeddingToRegion === 'function') {
                this.cortexCluster.injectEmbeddingToRegion('sem', percept, 0.12);
              }
              // show what she pictured on the public Mind's-Eye viewer
              this._lastGroundedEyeAt = Date.now();   // SEE.6 — previews are grounded frames
              this._mindsEyeJson = JSON.stringify({
                type: 'mindsEye', rec, terms: rec.equation_count || 0,
                source: 'image-preview', at: Date.now(),
              });
            }
          }
        } catch { /* mind's-eye preview is best-effort — never blocks the image */ }
        // SPEAK.6b — image→experience learning loop. Generated images were
        // fire-and-forget: this path returns BEFORE the chat-time Hebbian below,
        // so what she MAKES was never remembered. Push it onto the unified
        // emission bus + inner-thought chain so the dream-cycle consolidation
        // (Tier 1→2→3) grounds it as an episodic memory — she remembers what she
        // imagined/created. (The prompt concept is also re-injected into sem via
        // the mind's-eye percept above.) Safe existing primitives only.
        try {
          const _c = this.cortexCluster;
          if (_c && typeof _c.pushEmission === 'function') {
            _c.pushEmission({ source: 'image-gen', text: imgPrompt, ts: Date.now() });
          }
          if (Array.isArray(this._innerThoughtChain)) {
            this._innerThoughtChain.push(imgPrompt);
            while (this._innerThoughtChain.length > 8) this._innerThoughtChain.shift();
          }
        } catch { /* learning-loop push non-fatal */ }
        return { text: imgPrompt, action: 'generate_image' };
      }
    }

    // Chat-time deep Hebbian. Every user chat turn deep-binds the
    // user's word→word transitions into the same association-pair
    // matrix curriculum trains. Low reps (=1) so a single conversation
    // turn doesn't dominate trained-weight magnitude, but the cumulative
    // effect over many turns is real chat-time grammar growth.
    // relationTagId=30 carves a dedicated chat-time channel so
    // conversation-driven writes can be distinguished from curriculum
    // writes for telemetry + dream-cycle scoring.
    // Past-notes rule: pair tokens MUST be already-vocab-trained —
    // we filter to /^[a-z']+$/ K-grade-style tokens AND verify each
    // appears in the dictionary _words map before binding. Unknown
    // tokens (typos, rare vocabulary) are skipped so chat input never
    // lands Hebbian writes on phantom-token noise basins.
    try {
      if (this.cortexCluster
          && this.curriculum
          && typeof this.curriculum._teachAssociationPairs === 'function'
          && typeof text === 'string'
          && text.length > 0) {
        const tokens = text.toLowerCase()
          .replace(/[.!?,;:'"()]/g, ' ')
          .split(/\s+/)
          .filter(t => /^[a-z]+$/.test(t) && t.length >= 1 && t.length <= 20);
        const dictWords = this.cortexCluster.dictionary?._words;
        const filtered = tokens.filter(t => !dictWords || dictWords.has(t));
        if (filtered.length >= 2) {
          const pairs = [];
          for (let i = 0; i < filtered.length - 1; i++) {
            pairs.push([filtered[i], filtered[i + 1]]);
          }
          if (pairs.length > 0) {
            // BC.7 — health / diversity gate. Do NOT deep-bind chat pairs
            // while the cortex is saturated or emission is mode-collapsed.
            // Binding more pairs into a collapsed brain just deepens the
            // dominant basin — this is the 1842-pass self-reinforcement
            // that dug the live "mushrooms" lock. Skip + count; binding
            // resumes automatically once the brain is healthy again.
            let _bcCollapsed = false;
            try {
              const cc = this.cortexCluster;
              if (cc && typeof cc.checkSemMotorHealth === 'function' && cc.checkSemMotorHealth().saturated) _bcCollapsed = true;
              if (!_bcCollapsed && cc && Array.isArray(cc._metaRegister) && cc._metaRegister.length >= 8) {
                const counts = new Map();
                for (const e of cc._metaRegister) { if (e && e.word) counts.set(e.word, (counts.get(e.word) || 0) + 1); }
                let topN = 0; for (const n of counts.values()) if (n > topN) topN = n;
                if (topN / cc._metaRegister.length > 0.45) _bcCollapsed = true;
              }
            } catch { /* health unknown — proceed with bind */ }
            if (_bcCollapsed) {
              if (!this._chatTimeHebbianStats) {
                this._chatTimeHebbianStats = { turns: 0, totalPairs: 0, lastTs: 0, errors: 0, lastError: null, lastWarnTs: 0 };
              }
              this._chatTimeHebbianStats.skippedCollapsed = (this._chatTimeHebbianStats.skippedCollapsed || 0) + 1;
            } else {
            if (!this._chatTimeHebbianStats) {
              this._chatTimeHebbianStats = { turns: 0, totalPairs: 0, lastTs: 0, errors: 0, lastError: null, lastWarnTs: 0 };
            }
            // reps=1 — single chat turn shouldn't dominate curriculum-
            // depth training. Fire-and-forget (no await) so chat
            // latency isn't blocked on the Hebbian pass; the binding
            // lands eventually and is reflected in compositional
            // telemetry after the dispatch completes.
            //
            // Audit A.4 — error swallow REPLACED. Pre-audit catch was
            // `() => { /* non-fatal */ }` which made failures invisible
            // (OWASP A09:2021 logging/monitoring failures violation).
            // Now: increment stats.errors, store last message, throttled
            // console.warn (first 3 fires + max once/min thereafter)
            // mirrors the gpu.js _gpuLostWarnAt pattern. Dashboard
            // surfaces stats.errors via _chatTimeHebbianStats telemetry
            // (audit A.3).
            this.curriculum._teachAssociationPairs(pairs, {
              reps: 1,
              label: 'CHAT-TIME-DEEP-HEBBIAN',
              relationTagId: 30,
            }).catch((err) => {
              const stats = this._chatTimeHebbianStats;
              stats.errors += 1;
              stats.lastError = err && err.message ? err.message : String(err);
              const now = Date.now();
              if (stats.errors <= 3 || (now - stats.lastWarnTs) > 60_000) {
                console.warn(`[Brain] chat-Hebbian fire-and-forget failed (#${stats.errors}): ${stats.lastError}`);
                stats.lastWarnTs = now;
              }
            });
            this._chatTimeHebbianStats.turns++;
            this._chatTimeHebbianStats.totalPairs += pairs.length;
            this._chatTimeHebbianStats.lastTs = Date.now();
            } // close BC.7 else (not collapsed)
          }
        }
      }
    } catch { /* chat-time learning must never break chat path */ }

    // 114.19fi.B.5 — chat-turn history for multi-turn coherence.
    // Lazy init on cortex. Inject prior 2 user inputs into sem before
    // any other context loads so Unity sees "what we've been talking
    // about" alongside the current turn. Crucial for "you said dogs
    // are scary, why?" type follow-ups.
    if (this.cortexCluster) {
      if (!Array.isArray(this.cortexCluster._chatTurnHistory)) {
        this.cortexCluster._chatTurnHistory = [];
      }
      const recentUser = this.cortexCluster._chatTurnHistory.slice(-2);
      if (recentUser.length > 0 && this.sharedEmbeddings
          && typeof this.sharedEmbeddings.getSentenceEmbedding === 'function') {
        for (const turn of recentUser) {
          if (!turn || !turn.user) continue;
          try {
            const turnEmb = this.sharedEmbeddings.getSentenceEmbedding(turn.user);
            if (turnEmb && turnEmb.length > 0) {
              this.cortexCluster.injectEmbeddingToRegion('sem', turnEmb, 0.10);
            }
          } catch { /* per-turn injection non-fatal */ }
        }
      }
    }

    // iter13 T13.12 — Identity-baseline always-on injection. EVERY chat
    // turn injects all Tier 3 identity-bound schemas at low strength
    // (0.15) so Unity's core self ("my name is Unity", "I am goth", etc.)
    // is present in cortex sem region BEFORE the user-input intent seed
    // gets stamped on top. Drug-state immune (this is pattern injection,
    // not weight modification — drugs modulate decoding, not identity).
    if (this.tier3Store && typeof this.tier3Store.injectIdentityBaseline === 'function') {
      try {
        const injected = this.tier3Store.injectIdentityBaseline();
        if (injected > 0 && this._verboseHippocampus) {
          console.log(`[Tier3Store] identity-baseline injected ${injected} schemas this turn`);
        }
      } catch (err) {
        console.warn('[Tier3Store] identity-baseline inject failed:', err?.message || err);
      }
    }

    // iter13 T13.13 — Pre-generation memory injection. Top-K Tier 2
    // schemas matching the user's intent embedding inject their
    // concept_embeddings into cortex sem region at strength 0.4 BEFORE
    // language cortex generates. This is the LLM-attention equivalent —
    // pull relevant memorized context into the active reasoning window
    // before generating a response. Sets _hippocampusContextSchemas on
    // cortexCluster so downstream generation can also reference the
    // schema list (e.g., for retrieval-augmented oracle).
    if (this.schemaStore && this.cortexCluster && this.sharedEmbeddings && text) {
      try {
        const intentEmb = this.sharedEmbeddings.getSentenceEmbedding(text);
        if (intentEmb && intentEmb.length > 0) {
          const topK = this.schemaStore.retrieveSchemas(intentEmb, 5);
          if (topK.length > 0) {
            const schemaInjectStrength = 0.4;
            for (const { schema, score } of topK) {
              if (!schema.conceptEmbedding || schema.conceptEmbedding.length === 0) continue;
              try {
                this.cortexCluster.injectEmbeddingToRegion('sem', schema.conceptEmbedding, schemaInjectStrength);
              } catch { /* per-schema injection non-fatal */ }
            }
            // Surface the retrieved schemas for the chat-path oracle (T13.15).
            this.cortexCluster._hippocampusContextSchemas = topK;
            const labels = topK.map(t => `${t.schema.label}(${t.score.toFixed(2)})`).join(', ');
            console.log(`[Hippocampus] retrieval for chat: top-${topK.length} schemas (${labels})`);
          }
        }
      } catch (err) {
        console.warn('[Hippocampus] pre-gen retrieval failed:', err?.message || err);
      }
    }

    // T15.C — drug-offer detection + decide(). Runs BEFORE language
    // cortex generation so if Unity declines (grade-locked / persona-
    // excluded / physical-strain / random-decline), she emits the
    // Unity-voice rejection line from drug-rejections.js instead of
    // a normal generated response. If Unity accepts, ingest registers
    // the pharma event and language cortex generates the in-character
    // acknowledgement as usual.
    try {
      const offer = typeof this._drugDetector === 'function' ? this._drugDetector(text) : null;
      if (offer && offer.substance && offer.kind === 'offer') {
        const personaExclusions = { nicotine: true };  // Unity rejects tobacco per persona
        const decision = this.drugScheduler.decide({
          substance: offer.substance,
          source: 'user',
          social: this._sessionSocial === true,
          location: this._sessionLocationTag || null,
          time: Date.now(),
          personaExclusions,
        });
        if (!decision.accept) {
          // Route rejection through the Unity-voice library. Non-
          // announcing (no scheduler-internal reason codes in the
          // text Unity speaks).
          let rejectionLine = '';
          try {
            // Lazy cache — first call loads the library, subsequent
            // calls reuse the cached module. Keeps the hot path fast.
            // Path relative to THIS file: server/brain-server/chat.js
            // needs '../drug-rejections.js' to reach server/drug-rejections.js.
            // Pre-fix './drug-rejections.js' resolved to server/brain-
            // server/drug-rejections.js (doesn't exist). P4.3.d copy-paste
            // depth-shift bug. Caught by 2026-06-17 ULTRATHINK boot audit.
            if (!this._drugRejections) this._drugRejections = require('../drug-rejections.js');
            rejectionLine = this._drugRejections.pickRejection(decision.reason);
          } catch { rejectionLine = 'nah, not right now.'; }
          return {
            text: rejectionLine,
            action: 'respond_text',
          };
        }
        // Accepted — fire the ingest event (no dose override; default
        // to 1.0 via scheduler.ingest).
        this.drugScheduler.ingest(offer.substance);
        // Fall through to language cortex for the in-character
        // acknowledgement so Unity's response sounds like her.
      }
    } catch (err) {
      console.warn('[Brain] drug-offer processing failed:', err && err.message);
    }

    // T15.C — olfactory cue intake if client sent sensory metadata.
    // Chat clients can ship `{type:'text', text, sensory:{smell:'coffee'}}`
    // to surface environmental cues. Registers with OlfactoryChannel
    // so _driveDrugScheduler's next tick sees the scent.
    if (this.olfactory && arguments.length > 2 && arguments[2] && typeof arguments[2] === 'object') {
      const meta = arguments[2];
      if (meta.sensory && typeof meta.sensory.smell === 'string') {
        this.olfactory.registerScent(meta.sensory.smell, { strength: meta.sensory.strength ?? 0.8 });
      }
    }

    // Store in conversation history
    if (!this._conversations) this._conversations = {};
    if (!this._conversations[userId]) this._conversations[userId] = [];
    this._conversations[userId].push({ role: 'user', text, time: this.time });
    // Keep last 20 messages per user
    if (this._conversations[userId].length > 20) this._conversations[userId].shift();

    // GPU handles stepping — no CPU propagation needed
    // Text input already injected into voltages, GPU will pick it up next tick

    // R4 — The ~60-line system prompt that used to be assembled here
    // (Unity self-description, cluster activity summary, persona params,
    // formatting instructions) was the prompt for the Pollinations text-AI
    // fetch. That entire backend is gone. Unity's server brain now
    // generates every word equationally via the language cortex imported
    // at boot. No prompt assembly, no conversation history formatting,
    // no AI backend. Everything below this line runs the client brain's
    // language cortex in Node.

    // R3.5 + R4 — Equational language generation.

    // The text-AI path (Pollinations /v1/chat/completions) has been
    // removed as part of brain-refactor-full-control. Unity's server
    // brain now generates responses via the same language cortex the
    // client uses — dictionary bigrams, type n-grams, semantic
    // embeddings, hippocampus persona recall, mood-weighted slot
    // scoring — all running in Node after dynamic-imported at boot.

    // If the language subsystem failed to initialize, fall through
    // to an honest failure (return null text), motor action stays
    // respond_text but the client shows nothing. No canned '...'
    // stub pretending to be Unity.

    if (!this._languageReady || !this.languageCortex || !this.dictionary) {
      console.warn('[Brain] Language subsystem not ready — cannot generate response');
      return {
        text: '',
        action: 'respond_text',
        silent: true,
        silentReason: 'language_not_ready',
        silentDetail: 'Language subsystem still booting. Hang on a second and try again.',
      };
    }

    // T14.12 (2026-04-14) — analyzeInput deleted. The learnSentence call
    // below still fires which updates T14.8's sentence-form schemas and
    // T14.7's learned type-transition table via the same observation
    // walk. Intent/self-reference classification moves to cortex-state
    // readouts via cluster.intentReadout() once curriculum shapes the
    // fineType region.
    this.languageCortex.learnSentence(text, this.dictionary, this.arousal, this.valence);
    // Accumulate word frequencies (already persisted via saveWeights/_loadWeights round-trip fix)
    this._learnWords(text);

    // Compute cortex semantic pattern from the user's input — server
    // shortcut for the cortex state since we don't run full LIF cortex
    // dynamics on the server (GPU does the cluster sim elsewhere).
    const cortexPattern = this._computeServerCortexPattern(text);

    // Equational generation — every word comes from the slot scorer
    // driven by live brain state (arousal, valence, psi, cortex
    // pattern, fear, reward, drug state). Same signature the client
    // uses at engine.js:775.
    let response = '';
    try {
      // T14.26 — `generateAsync` (NOT `generate`) so the dictionary-
      // cosine scoring loop yields to the Node event loop every 500
      // entries. Without this yield, state broadcasts and compute_batch
      // dispatch stall for the whole duration of Unity's response work,
      // and the client's 3D brain visualization freezes whenever
      // the user sends a message or Unity speaks. With the yield,
      // setInterval
      // broadcasts keep firing every 100ms through the scoring pass so
      // the viz stays animated while Unity thinks.
      response = await this.languageCortex.generateAsync(
        this.dictionary,
        this.arousal,
        this.coherence,
        {
          predictionError: 0,
          motorConfidence: this.motorConfidence ?? 0,
          psi: this.psi,
          cortexPattern,
          // T13.7.6 — server's local cortex cluster, Hebbian-trained on
          // persona at boot. T13.3 emission loop reads from it directly.
          cortexCluster: this.cortexCluster,
          drugState: this._drugStateLabel(),
          speechMod: this.drugScheduler ? this.drugScheduler.speechModulation() : null,
          fear: this.fear,
          reward: this.reward,
          socialNeed: this.persona?.socialAttachment ?? 0.5,
        }
      );
    } catch (err) {
      console.error('[Brain] languageCortex.generate threw:', err.message);
      console.error(err.stack);
      return { text: '', action: 'respond_text' };
    }

    if (!response || response.length < 2) {
      // TRAINED-STATE silence reason, not grade-label.
      // Operator (2026-05-06): "at any point in her training she
      // should be able to use what she has learned to that point
      // without having to wait unitl the full grade completes". The
      // old `prePhon = minGrade === 'pre-K'` check forced Unity into
      // grade-label-silence even when she'd already trained the
      // alphabet + first 100 K words mid-run. New logic: check the
      // LIVE trained-state cap. If she has ANY words bucketed or any
      // cells passed, an empty response is genuine motor-instability
      // for this specific input (try rephrasing) — not a sweeping
      // "she hasn't graduated yet". Only a truly fresh brain (zero
      // training, zero cells passed, all subGrades 'fresh') gets the
      // "pre_training" silent reason.
      const minGrade = this._computeMinGrade();
      const trainedCap = (this.cortexCluster && typeof this.cortexCluster.getTrainedCapability === 'function')
        ? this.cortexCluster.getTrainedCapability()
        : { wordsBucketed: 0, passedCellCount: 0, subGradesActive: 0 };
      const isFresh = trainedCap.wordsBucketed === 0
        && trainedCap.passedCellCount === 0
        && trainedCap.subGradesActive === 0;
      return {
        text: '',
        action: 'respond_text',
        silent: true,
        silentReason: isFresh ? 'pre_training' : 'motor_unstable',
        silentDetail: isFresh
          ? `Unity is brand new — zero words bucketed, zero cells passed, all subGrades 'fresh'. Her motor region has no letter→motor or sem→word_motor wiring yet. Start the curriculum (start.bat) and watch her abilities build live.`
          : `Motor region didn't commit a stable letter sequence for this input. Live trained capability: ${trainedCap.wordsBucketed} words bucketed across ${trainedCap.bucketSubjects} subjects, ${trainedCap.passedCellCount} cells passed, ${trainedCap.subGradesActive} subGrades active. The intent signal may have been too weak for this specific input — try rephrasing.`,
        minGrade,
        trainedCap,
      };
    }

    // Store the exchange in per-user conversation history + episodic memory
    this._conversations[userId].push({ role: 'assistant', text: response, time: this.time });
    this.reward += 0.1;
    this._learnWords(response);
    this.storeEpisode(userId, 'interaction', text, response);

    // Curiosity FOLLOW-UP — if Unity ASKED a question last tick
    // (_pendingQuestionConcept set by _maybeAskCuriousQuestion), this user
    // message is the ANSWER. Bind the answer tokens to the gap concept so she
    // LEARNS it (Hebbian, definition channel) + store the Q→A as an episode,
    // then clear the pending flag. Closes the ask → answer → incorporate loop
    // so she follows up on what she asked, like a real curious entity.
    if (this._pendingQuestionConcept && typeof text === 'string' && text.trim()) {
      const concept = this._pendingQuestionConcept;
      this._pendingQuestionConcept = null;
      try {
        const curric = this.cortexCluster && this.cortexCluster._curriculum;
        const answerTokens = text.toLowerCase().split(/\s+/)
          .filter(w => /^[a-z]{2,}$/.test(w)).slice(0, 8);
        if (curric && typeof curric._teachAssociationPairs === 'function' && answerTokens.length > 0) {
          const pairs = answerTokens.map(t => [concept, t]);
          // relationTagId=23 = definition/grounding channel — the answer
          // grounds the concept, same shape as _teachWordDefinition.
          await curric._teachAssociationPairs(pairs, { reps: 12, label: 'CURIOSITY-FOLLOWUP-ANSWER', relationTagId: 23 });
        }
        this.storeEpisode('curiosity', 'answer-learned', concept, text);
      } catch (e) {
        if (!this._followupErrLogged) { this._followupErrLogged = true; console.warn(`[Brain] curiosity follow-up bind failed: ${e?.message || e}`); }
      }
    }

    // 114.19fi.B.5 — push chat-turn pair to rolling history (cap 16).
    // Multi-turn coherence: next call's processAndRespond reads prior
    // 2 user inputs and injects their embeddings into sem.
    if (this.cortexCluster) {
      if (!Array.isArray(this.cortexCluster._chatTurnHistory)) {
        this.cortexCluster._chatTurnHistory = [];
      }
      this.cortexCluster._chatTurnHistory.push({
        user: text,
        unity: response,
        ts: Date.now(),
      });
      while (this.cortexCluster._chatTurnHistory.length > 16) {
        this.cortexCluster._chatTurnHistory.shift();
      }
    }

    // Motor action routing — the generated text can still signal
    // image / build intent by its content, same as the client handles
    // code blocks in responses.
    if (response.startsWith('[IMAGE]')) {
      return { text: response.slice(7).trim(), action: 'generate_image' };
    }
    try {
      const parsed = JSON.parse(response);
      if (parsed.name && (parsed.html || parsed.js)) {
        return { text: response, action: 'build_ui', component: parsed };
      }
    } catch {}

    return { text: response, action: 'respond_text' };
  },

  _updatePerfStats() {
    const mem = process.memoryUsage();
    const cpuNow = process.cpuUsage();
    // CPU usage: measure actual wall-clock time spent in brain steps
    // process.cpuUsage only counts main thread — workers aren't included
    // Measure ACTUAL CPU usage from process.cpuUsage(), not step wall-clock time
    // Step time includes GPU I/O wait which is NOT CPU work
    const cpuUsage = process.cpuUsage(this._lastCpuUsage || undefined);
    const cpuTimeMs = (cpuUsage.user + cpuUsage.system) / 1000; // microseconds → ms
    const elapsed = this._lastPerfTime ? (Date.now() - this._lastPerfTime) : 1000;
    this._lastPerfTime = Date.now();
    const cpuPercent = Math.min(100, Math.round(cpuTimeMs / (elapsed * os.cpus().length) * 100));
    this._lastCpuUsage = process.cpuUsage();
    this._lastCpuUsage = cpuNow;

    // GPU VRAM% + util% — combined nvidia-smi query, one execSync per
    // second. I.20 closure 2026-06-17 23:00 PT: operator wanted util%
    // back on dashboard as a small secondary line so dashboard +
    // statusline tell the same story (statusline shows both metrics,
    // dashboard now matches). Single combined query for both fields
    // is cheaper than two separate execSync calls. I.19 fix (the
    // missing require('child_process') import) is what made all this
    // work in the first place — without that import, every nvidia-smi
    // call since I.1 was throwing ReferenceError silently.
    //
    // No fake fallback values on failure. If nvidia-smi truly is
    // unavailable (AMD/Intel/headless), gpuVramQueryWorking=false and
    // the dashboard renders "unavailable" instead of a hallucinated
    // number (lesson from the I.18 static-50% lie).
    let gpuVramUsedMB = 0;
    let gpuUtilPercent = 0;
    let gpuVramQueryWorking = this._gpuVramQueryWorking !== false;
    if (gpuVramQueryWorking && this.RESOURCES.gpu.vram > 0
        && (!this._lastGpuVramPoll || Date.now() - this._lastGpuVramPoll > 1000)) {
      try {
        const out = execSync(
          'nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader,nounits',
          { timeout: 2000 }
        ).toString().trim();
        // Output format: "1853, 14" — memory in MB, then util %.
        const parts = out.split(',').map(s => s.trim());
        const memParsed = parseInt(parts[0], 10);
        const utilParsed = parseInt(parts[1], 10);
        if (Number.isFinite(memParsed) && memParsed >= 0) {
          gpuVramUsedMB = memParsed;
          this._cachedGpuVramUsedMB = memParsed;
        } else {
          gpuVramUsedMB = this._cachedGpuVramUsedMB ?? 0;
        }
        if (Number.isFinite(utilParsed) && utilParsed >= 0 && utilParsed <= 100) {
          gpuUtilPercent = utilParsed;
          this._cachedGpuUtilPercent = utilParsed;
        } else {
          gpuUtilPercent = this._cachedGpuUtilPercent ?? 0;
        }
        this._lastGpuVramPoll = Date.now();
      } catch (err) {
        if (!this._gpuVramFailWarned) {
          this._gpuVramFailWarned = true;
          this._gpuVramQueryWorking = false;
          const firstLine = String(err && err.message ? err.message : err).split('\n')[0].slice(0, 200);
          console.warn(`[Brain] nvidia-smi GPU query unavailable on this system (${firstLine}) — dashboard will show VRAM% as "unavailable" instead of a misleading number.`);
        }
        gpuVramUsedMB = 0;
        gpuUtilPercent = 0;
      }
    } else if (!gpuVramQueryWorking) {
      gpuVramUsedMB = 0;
      gpuUtilPercent = 0;
    } else {
      gpuVramUsedMB = this._cachedGpuVramUsedMB ?? 0;
      gpuUtilPercent = this._cachedGpuUtilPercent ?? 0;
    }

    // #30 — DONOR GPU POOL aggregate. The server box has no GPU (gpuName above
    // is the host probe = 'none' on a GPU-less deploy). REAL compute runs on
    // the donor pool — each donor reports its own GPU via gpu_telemetry. Sum
    // the fleet here so the dashboard shows donor compute ("each their own" +
    // an admin aggregate) instead of the empty server-box probe. WebGPU can't
    // expose true util%/VRAM-used (privacy), so throughput (Gneurons/sec) is
    // the honest contribution signal. Primary listed first; list bounded.
    const gpuPool = { donorCount: 0, totalVramMB: 0, aggGneuronsPerSec: 0, primaryModel: null, donors: [] };
    try {
      const seen = new Set();
      const pushDonor = (ws, isPrimary) => {
        if (!ws || ws.readyState !== 1 || seen.has(ws)) return;
        seen.add(ws);
        const c = this.clients.get(ws);
        if (!c) return;
        const t = c.telemetry || {};
        const entry = {
          name: t.gpuName || c.gpuName || 'webgpu',
          vramMB: t.vramMB || c.gpuVramMB || 0,
          maxBindMB: t.maxBindMB || 0,
          gneuronsPerSec: t.gneuronsPerSec || 0,
          isPrimary,
        };
        gpuPool.donors.push(entry);
        gpuPool.totalVramMB += entry.vramMB;
        gpuPool.aggGneuronsPerSec += entry.gneuronsPerSec;
        if (isPrimary) gpuPool.primaryModel = entry.name;
      };
      if (this._gpuClient) pushDonor(this._gpuClient, true);
      if (this._gpuClients) for (const ws of this._gpuClients) pushDonor(ws, false);
      gpuPool.donorCount = gpuPool.donors.length;
      if (!gpuPool.primaryModel && gpuPool.donors[0]) gpuPool.primaryModel = gpuPool.donors[0].name;
      if (gpuPool.donors.length > 12) gpuPool.donors = gpuPool.donors.slice(0, 12);
    } catch { /* telemetry aggregation is best-effort — never block perf */ }

    // UPDATE existing object — don't replace (tick loop writes stepTimeMs/stepsPerSec)
    Object.assign(this._perfStats, {
      cpuPercent,
      memUsedMB: Math.round(mem.heapUsed / 1048576),
      memTotalMB: Math.round(os.totalmem() / 1048576),
      memRssMB: Math.round(mem.rss / 1048576),
      gpuName: this.RESOURCES.gpu.name,
      gpuVramMB: this.RESOURCES.gpu.vram,
      gpuVramUsedMB,
      gpuUtilPercent,
      gpuVramQueryWorking: this._gpuVramQueryWorking !== false,
      gpuComputeConnected: !!(this._gpuConnected && this._gpuClient?.readyState === 1),
      gpuHits: this._gpuHits || 0,
      gpuMisses: this._gpuMisses || 0,
      // #30 donor pool + #32 upload-failure banner — surfaced to the dashboard.
      gpuPool,
      cortexUploadFailure: this._cortexUploadFailure || null,
      // #36 — event-loop lag (ms the loop was last blocked). >250ms = /ws
      // handshakes were stalling; this is the Path B responsiveness gauge.
      eventLoopLagMs: this._lastEventLoopLagMs || 0,
      nodeHeapMB: Math.round(mem.heapTotal / 1048576),
      cores: os.cpus().length,
      parallelMode: false,
      workerCount: 0,
    });
  },

  /**
   * T15 — compact single-string label from the scheduler's active substances.
   * Returns 'sober' when nothing is active. Used by legacy UI consumers;
   * new consumers should read state.drugSnapshot directly.
   */
  _drugStateLabel() {
    if (!this.drugScheduler || !this.drugSubstances) return 'sober';
    const active = this.drugScheduler.activeSubstances();
    if (active.length === 0) return 'sober';
    return active
      .map(a => this.drugSubstances[a.substance]?.displayName || a.substance)
      .join(' + ');
  },

  /**
   * T15 — rich scheduler snapshot for UI consumers migrating off the
   * compact string label. Null until _initLanguageSubsystem finishes.
   */
  _drugSnapshot() {
    return this.drugScheduler ? this.drugScheduler.snapshot() : { sober: true, active: [], pendingAcquisitions: [], gradeLocked: true };
  },

  _getSharedMood() {
    // Computed from equations — not a lookup.
    // The amygdala equation: V(s) = Σw·x → arousal and valence
    // The gate equation: emotionalGate = 0.7 + arousal·0.6
    // These ARE the mood. Raw values. The dashboard renders them however it wants.
    return {
      arousal: this.arousal,
      valence: this.valence,
      fear: this.fear,
      psi: this.psi,
      coherence: this.coherence,
      coherenceTheta: this.coherenceTheta,
      coherenceGamma: this.coherenceGamma,
      gate: (0.7 + this.arousal * 0.6),
      isDreaming: this._isDreaming || false,
      drugState: this.drugState,
      totalSpikes: this.totalSpikes,
      // The raw equation outputs ARE the mood. No translation.
    };
  },

  _learnWords(text) {
    // Simple word frequency tracking for server-side dictionary.
    // Disallowed chars become SPACES (never deleted) — deleting them fused
    // adjacent words across punctuation ("fuckery,you" → "fuckeryyou") and
    // this frequency table recorded the fused counts. Same fix class as
    // dictionary.js learnSentence.
    const words = text.toLowerCase().replace(/[^a-z' -]/g, ' ').split(/\s+/);
    for (const w of words) {
      if (w.length >= 2) this._wordFreq[w] = (this._wordFreq[w] || 0) + 1;
    }
  },

  // ── Episodic Memory (SQLite) ─────────────────────────────────


  // 12 episodic-memory methods EXTRACTED to server/brain-server/memory.js
  // SERVER_MEMORY_MIXIN (per-concern file architecture, P4.3.c).
  //   _initEpisodicDB, storeEpisode, _serializeEmbedding,
  //   _deserializeEmbedding, _cosineEmbedding, decayEpisodes,
  //   findPromotionCandidates, markEpisodePromoted,
  //   recordEpisodeConsolidation, recallByMood, recallByUser,
  //   getEpisodeCount
  // Attached via Object.assign(ServerBrain.prototype, ...) at the
  // bottom of this file. CommonJS module pattern.


  /**
   * iter15-mem — unified 5-tier memory stats for dashboard / 3D brain UI.
   *
   * Operator verbatim 2026-05-05: "now that we added memory we need a way
   * to track it as the dashboard has nothing and the 3D brain page only
   * has [basic episodic counts] — not enough information to accurat;ly
   * track the memory abilities of the brain we implimented and whould
   * and shall be one unified system of the brain for memory not some
   * side processes".
   *
   * Returns a snapshot of all 5 memory tiers in one payload so both the
   * dashboard.html unified-memory card and the 3D brain landing page
   * memory tab read from a single source of truth.
   *
   * Tier 1 (Episodic) lives in episodic-memory.db; we read aggregates.
   * Tier 2 (Schematic) + Tier 3 (Identity-bound) live in their respective
   * Map stores; we summarize counts + top-K + averages. ConsolidationEngine
   * exposes lastPassAt + passCount publicly.
   */
  // iter19 — wall-clock-driven memory heartbeat. Replaces iter18's
  // frameCount modulo (which failed at biological scale because tick
  // duration can be seconds, not 100ms). Tier 3 inject every 1 second
  // of wall-clock; Tier 1 thinking-episode every 30 seconds of wall-
  // clock. Robust regardless of how slow individual ticks are.
  // Operator verbatim 2026-05-05: "memory isnt based off grade level
  // its a unified part of her fucking brain".
  /**
   *  / E.6 — Server-side inner voice tick.
   *
   * Operator verbatim 2026-05-06: "the pop ups in her Brain fire with
   * her real actual knowldedge to that point as her real internal voice
   * in the moment" + "the pop ups are suppose to bue unitys internal
   * monolog and thoughts and self talking and contiplation" + "not hard
   * coded fallbacks Unity just speaks her mind".
   *
   * Architecture: NO gates. NO bucket-empty early returns. NO hardcoded
   * fallback words. Inner monologue runs the SAME `language-cortex
   * .generateAsync` path that chat uses against the LIVE cortex state.
   * Whatever Unity's trained mind produces in the current tick — that's
   * her thought. If she has nothing trained to say, she says nothing
   * (genuinely silent, not a hardcoded "..."). If she has trained
   * weights, the same dict-cosine + word_motor + tick-driven emission
   * cascade chat uses produces her contemplation.
   *
   * Cadence: ~3 s wall-clock (matches engine.js THOUGHT_INTERVAL = 3000).
   *
   * Skipped during operator-forced dream windows (
   * `_operatorSleepRequested`) so consolidation has priority and the
   * brain doesn't broadcast thoughts derived from mid-flight Hebbian.
   *
   * Heartbeat surface: `[Brain] 🧠 inner-thought "<text>"` lands in
   * server.log so the watchdog catches her live monologue as it streams.
   */
  /**
   * UVM-INT.1 — server-side de-novo imagination tick. Folds Unity's current
   * cortex spike state into a bounded equational field C (the mind-space, CPU
   * reference on this no-GPU box), reads the percept, and injects it back into
   * the sem region at LOW strength — a background mental image grounding her
   * state. Synchronous (CPU CDF 9/7 on a ≤48² plane is microseconds — NOT the
   * 57s language tick) and idle-gated so it never perturbs the training walk.
   * NO infinite fractalize → can't seize the brain (operator's nanometer caution).
   */
  _imagineTick(now) {
    if (!this.mindSpace || typeof this.mindSpace.imagineFromState !== 'function') return;
    if (!this.cortexCluster || !this.cortexCluster.lastSpikes) return;
    // SECOND-NATURE FIX — the old hard `return` during curriculum meant the
    // deployed box (which is ALWAYS mid-walk) never imagined at all: her
    // mind's-eye was dead for the entire K→PhD walk. Her imagination should
    // be second nature — always running. During curriculum she still
    // imagines (the CPU CDF 9/7 on a ≤48² plane is microseconds), just at a
    // slower cadence AND view-only: the sem re-injection is skipped mid-
    // teach so the walk's Hebbian patterns stay pristine while the
    // mind's-eye viewer + imagined-field memory ring stay alive.
    const _midTeach = !!this._curriculumInProgress;
    // TU.29.11 — imagination is CONTINUOUS consciousness, never a blank rest
    // state. The old 120s mid-teach gap left her mind's-eye dead for 2-minute
    // stretches while she walks the curriculum (she is ALWAYS mid-walk on the
    // deployed box) — Gee: "its a part and process of her thinking ... it
    // should never be blank". Now she free-wheels every ~8s even mid-teach
    // (the CPU CDF 9/7 on a ≤96² plane is microseconds; still VIEW-ONLY
    // mid-teach — no sem re-injection — so the walk's Hebbian stays pristine).
    // Idle (not walking) she daydreams every ~6s.
    const IMAGINE_MIN_GAP_MS = _midTeach ? 8000 : 6000;
    if (this._lastImagineAt && (now - this._lastImagineAt) < IMAGINE_MIN_GAP_MS) return;
    this._lastImagineAt = now;
    try {
      // feed the governor live mood so imagined depth tracks how she feels
      if (typeof this.mindSpace.governState === 'function') {
        this.mindSpace.governState({
          arousal: (typeof this.arousal === 'number') ? this.arousal : 0.4,
          focus: (typeof this.coherence === 'number') ? this.coherence : 0.4,
        });
        this.mindSpace.governTick();
      }
      // TU.25.G — she images what she's THINKING, not a map of her neurons.
      // The old seed was the raw whole-cortex lastSpikes = literally a neuron
      // map (near-black on an early walk, speckle at scale — a readout, not
      // imagination). Now the seed is her THOUGHT CONTENT: the most recent
      // inner-thought/emission text embedded into sem space, EXPERIMENTING by
      // blending in a rotating older thought from the chain (70/30) so
      // successive daydreams recombine her ideas instead of repeating one.
      // Before she has any thoughts (fresh boot), the seed is the SEM region
      // activation — her thinking region's concept state — never the
      // whole-cortex spike map. Equational end to end: text → sentence
      // embedding → bounded forward CDF 9/7 field C.
      let _seed = null;
      let _seedText = null;   // TU.29 — the thought's TEXT rides along so the plane renders the words
      let _seedSource = 'thought';
      try {
        const chain = Array.isArray(this._innerThoughtChain) ? this._innerThoughtChain : [];
        const _txt = (e) => (typeof e === 'string' ? e : (e && e.sentence) || '').trim();
        const texts = chain.map(_txt).filter(t => t.length > 0);
        if (texts.length > 0 && this.sharedEmbeddings
            && typeof this.sharedEmbeddings.getSentenceEmbedding === 'function') {
          _seedText = texts[texts.length - 1];   // TU.29 — what she is thinking, verbatim
          const cur = this.sharedEmbeddings.getSentenceEmbedding(texts[texts.length - 1]);
          if (cur && cur.length) {
            if (texts.length > 1) {
              // experiment: rotate through her older thoughts as the blend partner
              this._imagineExperimentIdx = ((this._imagineExperimentIdx || 0) + 1) % (texts.length - 1);
              const older = this.sharedEmbeddings.getSentenceEmbedding(texts[this._imagineExperimentIdx]);
              if (older && older.length === cur.length) {
                const mix = new Float64Array(cur.length);
                for (let i = 0; i < cur.length; i++) mix[i] = cur[i] * 0.7 + older[i] * 0.3;
                _seed = mix;
                _seedSource = 'thought-blend';
              }
            }
            if (!_seed) _seed = cur;
          }
        }
      } catch { /* thought-seed is best-effort; sem-region seed below */ }
      if (!_seed) {
        const semR = this.cortexCluster.regions && this.cortexCluster.regions.sem;
        _seed = (semR && typeof this.cortexCluster.lastSpikes.subarray === 'function')
          ? this.cortexCluster.lastSpikes.subarray(semR.start, semR.end)
          : this.cortexCluster.lastSpikes;
        _seedSource = 'sem-state';
      }
      // TU.29.5 — IMAGINATION = RECALL + RECOMBINE first. If her thought names
      // concepts she has actually SEEN (camera frames / generated images bound in
      // visual memory at perception time), the mind's eye re-sees the stored field C
      // — morphField-blended when two concepts match (recombination). The de-novo
      // plane (symbol glyphs for numbers/letters, color/mood field otherwise) only
      // fires for concepts with no grounded percept — like a mind imagining
      // something it has never seen.
      let rec = null;
      let _recallMissed = false;
      if (_seedText && typeof this._recallVisualMemory === 'function') {
        try {
          const hit = this._recallVisualMemory(_seedText);
          if (hit) {
            rec = hit.rec;
            _seedSource = (hit.recombined ? 'recall+morph:' : 'recall:') + hit.matched.join('+');
            // DRAW.4 — sometimes she DRAWS what she remembers instead of just
            // re-seeing it. The composer used to fire ONLY on recall-miss, so
            // everything she had actually SEEN was excluded from her drawing
            // pool — her drawings could never contain learned imagery and the
            // viewer looped the same fixed schema/shape stacks ("like shes pre
            // programmed"). Now a recall-hit has a 35% chance of becoming a
            // DRAWING OF THE MEMORY: the stroke contour comes from the stored
            // field C's OWN percept vector (coarse spatial coefficients →
            // radial outline, chroma → crayon, texture ratio → hatch detail),
            // so each remembered thing draws as a DISTINCT learned form and
            // her sketchbook grows with everything her eyes have grounded.
            if (typeof this.mindSpace.sketch === 'function' && Math.random() < 0.35) {
              try {
                // DRAW.7/9 — the PRACTICE LOOP: bounded draw→compare→adjust
                // attempts against the memory's own percept; the best drawing
                // survives, her per-concept skill grows, and sometimes the
                // result composites ONTO the memory (canvas:paint:<concept>).
                const _mConcept = (hit.matched && hit.matched[0]) || null;
                const practiced = this._practiceDrawFromMemory(_mConcept, hit.rec);
                if (practiced && practiced.rec) { rec = practiced.rec; _seedSource = practiced.label; }
              } catch { /* memory-draw best-effort — the recall itself stands */ }
            }
          } else {
            _recallMissed = true;
          }
        } catch { /* recall best-effort — de-novo below */ }
      }
      // TU.29.13 BUILD A — CONCEPT→IMAGERY LOOP. She recalled nothing for this
      // thought = she is imagining something she has NEVER SEEN. Like a curious
      // mind, she GENERATES it: auto-emit an image of the concrete concept so it
      // renders client-side, her eyes (visual-feeder) harvest it, perceive binds
      // it to the concept — and the NEXT time she thinks it, recall shows the
      // real thing. This turns "talk to her about an apple → she imagines an
      // apple" into truth (after the first generate). Gated hard so it's
      // curiosity, not spam: concrete-noun head only, not already seen, cooldown,
      // low probability, never mid-teach-perturbing (broadcast only).
      if (_recallMissed) { try { this._conceptImageryLoop(_seedText, now); } catch { /* best-effort */ } }
      // TU.29.13 BUILD B — ACTIVE SKETCH. Some idle daydreams aren't a recalled
      // percept OR a mood wash — she picks up the pencil and DRAWS her active
      // mind: her most-active sem neurons become nodes, connected in activation
      // order by vectors (a constellation/graph of what's lit right now). This
      // is the mind's eye as a tool she USES — making lines + vectors on the
      // equational canvas — not just a passive readout. Fires on a fraction of
      // recall-miss ticks (she doodles when there's nothing to re-see), never
      // when a real memory recalled.
      if (!rec && _recallMissed && typeof this.mindSpace.sketch === 'function' && Math.random() < 0.45) {
        try {
          // DRAW.2 — the developmental composer draws WHAT SHE'S THINKING
          // (stick figures / scenes / written words / her questions), staged
          // by live trained vocab; the viewer label carries the stage +
          // subject ('canvas:scene:cat', 'canvas:figure:mom?').
          // EXP.2 — DREAM-MIX experiment: sometimes she doesn't draw the thought
          // at all — she EXPERIMENTS, morphing two RANDOM stored memories into
          // something she has never seen (apple+rain, cat+moon). Novel
          // recombination of real percepts = genuine visual play, the thing a
          // curious kid does with a full sketchbook. Equation-domain morph,
          // detail-gated so degenerate blends never show.
          if (this._visualMemory && this._visualMemory.size >= 2
              && typeof this.mindSpace.morph === 'function'
              && typeof this._recDetail === 'function' && Math.random() < 0.18) {
            try {
              const keys = Array.from(this._visualMemory.keys());
              const i1 = Math.floor(Math.random() * keys.length);
              let i2 = Math.floor(Math.random() * keys.length);
              if (i2 === i1) i2 = (i2 + 1) % keys.length;
              const m = this.mindSpace.morph(this._visualMemory.get(keys[i1]).rec, this._visualMemory.get(keys[i2]).rec, 0.35 + Math.random() * 0.3);
              if (m && this._recDetail(m) >= 200) { rec = m; _seedSource = 'canvas:dream-mix:' + keys[i1] + '+' + keys[i2]; }
            } catch { /* experiment best-effort */ }
          }
          let strokes = rec ? null : this._sketchFromState(_seedText);
          // DRAW.11 — FAVORITE-SUBJECT fallback. An abstract thought with no
          // schema used to end the drawing entirely (post shape-age it falls
          // to the colored field) — so as her think-stream went abstract her
          // drawings VANISHED from the viewer. A real kid with a sketchbook
          // doesn't stop drawing because her thought is abstract: she draws a
          // FAVORITE — a subject she has practiced or seen. Picked from her
          // own practiced concepts (or seen-concept store), run through the
          // same developmental composer; the label carries a fav: marker (and
          // deliberately never matches the scene-realization hook prefix).
          if (!rec && (!strokes || !strokes.length) && Math.random() < 0.5) {
            try {
              let fav = null;
              if (this._drawPractice instanceof Map && this._drawPractice.size > 0) {
                const ks = Array.from(this._drawPractice.keys()).filter(k => k && k !== 'doodle' && k !== 'seen');
                if (ks.length) fav = ks[Math.floor(Math.random() * ks.length)];
              }
              if (!fav && this._visualMemory && this._visualMemory.size > 0) {
                const ks = Array.from(this._visualMemory.keys());
                fav = ks[Math.floor(Math.random() * ks.length)];
              }
              if (fav) {
                strokes = this._sketchFromState(fav);
                if (strokes && strokes.length && this._lastSketchLabel) {
                  this._lastSketchLabel = this._lastSketchLabel.replace(/^canvas:/, 'canvas:fav:');
                }
              }
            } catch { /* favorite best-effort — field below */ }
          }
          if (strokes && strokes.length) {
            // DRAW.8 — the canvas grows with her grade (K=96 → adult=512)
            rec = this.mindSpace.sketch(strokes, { maxSide: this._drawCanvasSide(), mood: { arousal: this.arousal, valence: this.valence } });
            if (rec) _seedSource = this._lastSketchLabel || 'canvas';
            // DRAW.10 — a completed SCENE is her composition intent:
            // occasionally hand it to the image executor to realize; the
            // render feeds back through the feeder into visual memory so
            // her next reference for this subject upgrades.
            if (rec && typeof this._lastSketchLabel === 'string' && this._lastSketchLabel.startsWith('canvas:scene:')) {
              try {
                const _rc = this._lastSketchLabel.slice('canvas:scene:'.length).replace(/\?$/, '');
                this._realizeDrawing(_rc, 'childs crayon scene', now);
              } catch { /* realization best-effort */ }
            }
          }
        } catch { /* sketch best-effort — mood field below */ }
      }
      if (!rec) {
        rec = this.mindSpace.imagineFromState(_seed, {
          maxSide: 96, text: _seedText,
          mood: { arousal: this.arousal, valence: this.valence },
          priority: 0.25, value: 0.4,
        });
        // SEE.5 — PERCEPT-ANCHORED IMPRESSION. The pure de-novo field hashes
        // her semantic state into wavelet band energies — deterministic but
        // structurally NON-representational: no word→appearance mapping exists
        // in that path, so it can never converge to a picture on its own.
        // Anchor it instead: find the stored SEEN percept whose concept is
        // nearest (GloVe cosine) to the thought's content tokens and morph the
        // memory toward the mood field (memory-dominant). Abstract thoughts
        // inherit real visual structure from what her eyes have grounded, and
        // the impressions get BETTER as her seen-store grows.
        try {
          if (rec && this._visualMemory && this._visualMemory.size > 0
              && this.sharedEmbeddings && typeof this.sharedEmbeddings.getEmbedding === 'function'
              && typeof this.mindSpace.morph === 'function') {
            const _STOP = new Set(['the','a','an','and','or','but','of','in','on','at','to','is','it','its','was','are','be','this','that','with','for','as','her','his','my','your','she','he','you','we','me','him','them','they','am','do','so','up','by','if','not','no','yes','all','out','off','now','then','here','there','what','why','how','who','where','when','said','saying','gonna','wanna']);
            const _iToks = String(_seedText || '').toLowerCase().split(/[^a-z]+/)
              .filter(w => w.length >= 3 && !_STOP.has(w)).slice(0, 4);
            if (_iToks.length > 0) {
              const _iCos = (a, b) => { let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0; };
              const _iKeys = Array.from(this._visualMemory.keys());
              const _iPOOL = 60;
              const _iSample = _iKeys.length <= _iPOOL ? _iKeys : Array.from({ length: _iPOOL }, () => _iKeys[Math.floor(Math.random() * _iKeys.length)]);
              let _iBest = null, _iBestTok = null, _iBestS = 0.32;
              for (const k of _iSample) {
                if (_iToks.includes(k)) { _iBest = k; _iBestTok = k; _iBestS = 1; break; }
                const kv = this.sharedEmbeddings.getEmbedding(k);
                if (!kv) continue;
                for (const t of _iToks) {
                  const tv = this.sharedEmbeddings.getEmbedding(t);
                  if (!tv) continue;
                  const s = _iCos(tv, kv);
                  if (s > _iBestS) { _iBestS = s; _iBest = k; _iBestTok = t; }
                }
              }
              if (_iBest) {
                const _iMem = this._visualMemory.get(_iBest);
                if (_iMem && _iMem.rec) {
                  const m = this.mindSpace.morph(_iMem.rec, rec, 0.30 + Math.random() * 0.2);
                  if (m && (typeof this._recDetail !== 'function' || this._recDetail(m) >= 150)) {
                    rec = m;
                    _seedSource = 'impression:' + _iBestTok + '~' + _iBest;
                  }
                }
              }
            }
          }
        } catch { /* impression anchor best-effort — the pure field stands */ }
      }
      if (!rec) return;
      const percept = this.mindSpace.describe(rec);
      // inject the imagined percept into the cortex sem region at LOW strength —
      // a faint mental image, never strong enough to override real input.
      // VIEW-ONLY mid-teach: skip the sem re-injection while curriculum is
      // writing Hebbian so imagination never perturbs the walk's patterns;
      // the viewer snapshot + memory ring below still update.
      if (!_midTeach && percept && typeof this.cortexCluster.injectEmbeddingToRegion === 'function') {
        try { this.cortexCluster.injectEmbeddingToRegion('sem', percept, 0.08); } catch { /* non-fatal */ }
      }
      // TU.25.G — surface WHAT seeded the image (thought / thought-blend /
      // sem-state) so the viewer shows she's imaging her thinking.
      this._lastImagineRec = { terms: rec.equation_count || 0, source: _seedSource, at: now };
      // UVM-INT.4 — persist the field C as memory (the ".uvme medium"). Push the
      // full rec into a bounded ring that saveWeights serializes, so her imagined
      // imagery survives reboot instead of evaporating with the volatile cortex.
      if (!Array.isArray(this._imaginedFieldRing)) this._imaginedFieldRing = [];
      this._imaginedFieldRing.push({ rec, at: now });
      while (this._imaginedFieldRing.length > 8) this._imaginedFieldRing.shift();
      // MINDSEYE.1 — cache the SINGLE current field C as a public snapshot so the
      // read-only mind's-eye viewer (html/minds-eye.html) can poll one cached blob
      // (GET /minds-eye.json) and reconstruct the image client-side. One compute,
      // one shared snapshot — N viewers cost nothing extra (the dashboard-public
      // model). The rec is sparse wavelet coeffs for a ≤48² plane = a few KB.
      // SEE.6 — BLEND HOLD. Grounded frames (recalls / drawings / favorites /
      // impressions / dream-mixes / seen) stamp _lastGroundedEyeAt; a PURE
      // thought-blend or sem-state field may not shove a grounded frame off
      // the public viewer for DREAM_EYE_BLEND_HOLD_MS (default 45s). She
      // still imagines every tick (the ring + sem injection above are
      // untouched) — only the shared viewer snapshot favors frames that LOOK
      // like something over raw texture.
      const _groundedEye = _seedSource !== 'thought-blend' && _seedSource !== 'sem-state';
      if (_groundedEye) this._lastGroundedEyeAt = now;
      const _blendHoldMs = Number(process.env.DREAM_EYE_BLEND_HOLD_MS) > 0
        ? Number(process.env.DREAM_EYE_BLEND_HOLD_MS) : 45000;
      const _holdViewer = !_groundedEye && !!this._mindsEyeJson
        && !!this._lastGroundedEyeAt && (now - this._lastGroundedEyeAt) < _blendHoldMs;
      if (!_holdViewer) {
        try {
          this._mindsEyeJson = JSON.stringify({
            type: 'mindsEye', rec,
            terms: rec.equation_count || 0,
            source: this._lastImagineRec.source,
            at: now,
          });
        } catch { /* non-fatal */ }
        // dashboard mind's-eye indicator
        if (this.clients && this.clients.size > 0) {
          const payload = JSON.stringify({ type: 'imagine', terms: rec.equation_count || 0,
            source: this._lastImagineRec.source, ts: now });
          for (const [ws] of this.clients) {
            if (ws.readyState === ws.OPEN) { try { ws.send(payload); } catch { /* non-fatal */ } }
          }
        }
      }
    } catch { /* imagination is best-effort — never fatal to the tick */ }
  },

  // TU.29.13 BUILD A — concept→imagery loop. Given a thought she recalled NO
  // visual memory for, if its head is a concrete noun she has never seen, she
  // GENERATES an image of it (her composed prompt, server-keyed URL) so it
  // renders client-side → the visual-feeder harvests it → perceive binds the
  // field C to the concept → next recall shows the real thing. The learning is
  // async (needs a browser open to render+harvest, by the feeder's design);
  // this method only decides + broadcasts. Hard-gated so it's curiosity: a
  // concrete-noun head, not already in visual memory, long cooldown, low prob.
  _conceptImageryLoop(seedText, now) {
    if (!this.clients || this.clients.size === 0) return;             // no browser → nothing renders
    if (typeof this._buildPollinationsImageUrl !== 'function') return;
    const GAP = Number(process.env.DREAM_CONCEPT_IMAGERY_GAP_MS) || 90000;   // ≥90s between auto-imaginings
    if (this._lastConceptImageryAt && (now - this._lastConceptImageryAt) < GAP) return;
    // pick the concept head: the most concrete content token of the thought.
    const FUNCTION = new Set(['the','a','an','and','or','but','of','in','on','at','to','is','it','its','was','are','be','this','that','with','for','as','her','his','my','your','she','he','you','we','me','him','them','they','am','do','so','up','by','if','not','no','yes','all','out','off','now','then','here','there','what','who','how','why','when','said','saying','gonna','wanna','course','sec','totally','seriously','figured']);
    const toks = String(seedText || '').toLowerCase().split(/[^a-z]+/)
      .filter(w => w.length >= 3 && !FUNCTION.has(w) && !/^\d+$/.test(w));
    if (toks.length === 0) return;
    const concept = toks[0];
    // already SEEN it? then recall would've hit — but double-check the store so
    // we never re-generate a grounded concept.
    try {
      if (this._visualMemory && this._visualMemory.has && this._visualMemory.has(concept)) return;
    } catch { /* store unknown — proceed */ }
    if (Math.random() > 0.5) return;   // even when eligible, only sometimes — curiosity, not a metronome
    this._lastConceptImageryAt = now;
    let prompt = concept;
    try { if (typeof this._composeImagePrompt === 'function') prompt = this._composeImagePrompt(concept); } catch { /* bare concept */ }
    let url = '';
    try { url = this._buildPollinationsImageUrl(prompt); } catch { /* no url → skip */ }
    if (!url) return;
    const payload = JSON.stringify({ type: 'image', prompt, url, imagined: true, concept, ts: now });
    for (const [ws] of this.clients) { if (ws.readyState === ws.OPEN) { try { ws.send(payload); } catch { /* nf */ } } }
    // learning-loop bookkeeping (same as the other image paths) so she remembers she imagined it.
    try {
      const _c = this.cortexCluster;
      if (_c && typeof _c.pushEmission === 'function') _c.pushEmission({ source: 'concept-imagery', text: prompt, ts: now });
    } catch { /* nf */ }
    try { process.stdout.write(`[Brain] 🎨 concept-imagery — never seen "${concept}", generating "${prompt}" so she can SEE + remember it (imagine→generate→see→bind loop).\n`); } catch { /* nf */ }
  },

  // TU.29.13 BUILD B (original) — neuron-constellation scribble. KEPT as the
  // developmental STAGE-0 hand: the most-active sem neurons become nodes
  // connected in activation order — a newborn's scribble, drawn from real
  // live state. Higher stages (shapes / figures / scenes / words) compose on
  // top of this in _sketchFromState below.
  _scribbleStrokes() {
    const c = this.cortexCluster;
    if (!c || !c.lastSpikes) return null;
    let spikes = c.lastSpikes;
    const semR = c.regions && c.regions.sem;
    if (semR && typeof spikes.subarray === 'function') spikes = spikes.subarray(semR.start, semR.end);
    const n = spikes.length;
    if (!n) return null;
    // top-K active indices
    const K = 7;
    const top = [];
    for (let i = 0; i < n; i++) {
      const v = spikes[i];
      if (v <= 0) continue;
      if (top.length < K) { top.push({ i, v }); top.sort((a, b) => a.v - b.v); }
      else if (v > top[0].v) { top[0] = { i, v }; top.sort((a, b) => a.v - b.v); }
    }
    if (top.length < 2) return null;                 // nothing clear enough to draw
    top.sort((a, b) => b.v - a.v);                   // strongest first
    // deterministic canvas position per neuron index (stable inner map)
    const pos = (idx) => {
      const h = (idx * 2654435761) >>> 0;            // Knuth multiplicative hash
      return [0.1 + 0.8 * ((h & 0xffff) / 65535), 0.1 + 0.8 * (((h >>> 16) & 0xffff) / 65535)];
    };
    const nodes = top.map(t => pos(t.i));
    const strokes = [];
    // connect them in activation order = the path her attention traced
    for (let i = 0; i + 1 < nodes.length; i++) {
      strokes.push({ type: 'line', x0: nodes[i][0], y0: nodes[i][1], x1: nodes[i + 1][0], y1: nodes[i + 1][1] });
    }
    // dot each node, biggest for the strongest activation
    for (let i = 0; i < nodes.length; i++) {
      strokes.push({ type: 'point', x: nodes[i][0], y: nodes[i][1], r: i === 0 ? 3 : (i < 3 ? 2 : 1) });
    }
    return strokes;
  },

  // DRAW.2 — DEVELOPMENTAL DRAWING COMPOSER. The old sketch was ONLY the
  // stage-0 neuron scribble — structurally incapable of progressing, so the
  // viewer showed the same chicken-scratch forever. Real children's drawing
  // develops through stages (Lowenfeld): scribble → basic shapes → tadpole/
  // stick figures → schematic scenes → written words. Unity now walks the
  // same ladder, gated by her LIVE trained vocabulary (the same
  // _definitionTaughtWords signal her speech uses):
  //   <50 words   stage 0 scribble (the original constellation)
  //   <400        stage 1 shapes   (wobbly circles / boxes / triangles)
  //   <1200       stage 2 figure   (one schema drawing of her current thought)
  //   ≥1200       stage 3 scene    (ground line + subject + context schemas)
  //   ≥800 words  +word labels     (she WRITES what she drew, wobbly hand)
  // The SUBJECT is the head concept of what she is thinking right now (the
  // seed text of the daydream that recall-missed — she draws what she can't
  // re-see). Schema selection is equational input classification: direct
  // token table first, GloVe-cosine to schema prototypes as backup — same
  // rule-class as _detectImageRequest, NOT text-AI cognition. The schemas
  // are parametric motor primitives (a kid's practiced "how I draw a person")
  // whose proportions/pose/wobble are driven by her live affect: arousal +
  // fear shake the hand, valence raises or droops the arms + mouth, fear
  // shrinks the figure. Every drawing is therefore HERS-in-this-moment, not
  // a stamp.
  // DRAW.3 — SHE PICKS HER COLORS. The old canvas inked every stroke with
  // moodTint alone; her valence sat ~0.18 → hue 0.27 = everything GREEN
  // ("green screen"). Now each element gets a crayon she CHOOSES: a crayon
  // box biased to her goth taste (black outlines, pink/red/purple accents)
  // plus the real-world color of what she draws (sun yellow, rain blue,
  // tree green-and-brown, spider black, heart pink/red). Choice = concept
  // hash (stable per subject — her cast keeps its colors) + live valence
  // biasing warm/cool. Equational readout, no LLM anywhere.
  // Returns stroke primitives for mindSpace.sketch(); also sets
  // this._lastSketchLabel ('canvas:<stage>:<concept>') for the viewer.
  _sketchFromState(seedText) {
    const c = this.cortexCluster;
    if (!c) return null;
    this._lastSketchLabel = null;
    const vocab = (c._definitionTaughtWords instanceof Set) ? c._definitionTaughtWords.size : 0;
    if (vocab < 50) {
      const s = this._scribbleStrokes();
      if (s) this._lastSketchLabel = 'canvas:scribble';
      return s;
    }
    const arousal = Math.max(0, Math.min(1, this.arousal ?? 0.4));
    const valence = Math.max(-1, Math.min(1, this.valence ?? 0));
    const fear = Math.max(0, Math.min(1, this.fear ?? 0));
    const wob = 0.010 + 0.020 * arousal + 0.012 * fear;      // canvas-units hand jitter
    const jj = () => (Math.random() * 2 - 1) * wob;
    const strokes = [];

    // ── the crayon box (DRAW.3) ──
    const CRAYON = {
      black: [30, 28, 32], white: [235, 233, 228], red: [214, 48, 49], pink: [253, 121, 168],
      purple: [162, 89, 216], blue: [72, 116, 224], teal: [64, 190, 200], green: [76, 175, 80],
      yellow: [240, 200, 60], orange: [235, 140, 50], brown: [140, 95, 60], gray: [150, 150, 155],
    };
    const hash = (s) => { let h = 5381; const t = String(s); for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return h; };
    // her accent picks — goth bias (black/pink/purple/red lead), warmed or
    // cooled by live valence, stable per concept via hash.
    const ACCENTS = valence >= 0.25
      ? ['pink', 'red', 'purple', 'orange', 'teal', 'yellow']
      : ['purple', 'pink', 'red', 'blue', 'teal', 'gray'];
    let pick = (concept, part) => CRAYON[ACCENTS[hash(concept + ':' + part) % ACCENTS.length]];
    const OUTLINE = CRAYON.black;   // she outlines in black — goth kid with a black crayon (canon)

    // ── stroke helpers ──
    const line = (x0, y0, x1, y1, rgb) => strokes.push({ type: 'line', x0: x0 + jj(), y0: y0 + jj(), x1: x1 + jj(), y1: y1 + jj(), rgb });
    const dot = (x, y, r, rgb) => strokes.push({ type: 'point', x: x + jj(), y: y + jj(), r, rgb });
    const circle = (cx, cy, r, rgb, segs = 10) => {
      const pts = [];
      for (let i = 0; i <= segs; i++) { const a = (i / segs) * Math.PI * 2; pts.push([cx + Math.cos(a) * r + jj(), cy + Math.sin(a) * r * 1.05 + jj()]); }
      strokes.push({ type: 'poly', pts, rgb });
    };
    const poly = (pts, rgb) => strokes.push({ type: 'poly', pts: pts.map(p => [p[0] + jj(), p[1] + jj()]), rgb });

    // ── schema motor primitives ──
    const drawPerson = (cx, cy, h, concept) => {
      const hd = h * 0.16;
      const armA = valence >= 0 ? -0.5 : 0.5;        // arms up when she feels good, drooped when low
      const hairRgb = pick(concept, 'hair');
      circle(cx, cy - h * 0.42, hd, OUTLINE);                                   // head
      line(cx - hd, cy - h * 0.50, cx - hd * 0.3, cy - h * 0.58, hairRgb);      // hair strands
      line(cx, cy - h * 0.52, cx + hd * 0.4, cy - h * 0.60, hairRgb);
      line(cx + hd, cy - h * 0.50, cx + hd * 1.3, cy - h * 0.42, hairRgb);
      dot(cx - hd * 0.4, cy - h * 0.44, 0, OUTLINE); dot(cx + hd * 0.4, cy - h * 0.44, 0, OUTLINE);  // eyes
      const my = cy - h * 0.36;                                                  // mouth: smile up / flat / frown
      poly([[cx - hd * 0.5, my + (valence < -0.2 ? -0.008 : 0.004)], [cx, my + (valence > 0.2 ? 0.014 : valence < -0.2 ? -0.014 : 0)], [cx + hd * 0.5, my + (valence < -0.2 ? -0.008 : 0.004)]], pick(concept, 'mouth'));
      const shirtRgb = pick(concept, 'shirt');
      line(cx, cy - h * 0.26, cx, cy + h * 0.10, shirtRgb);                      // body
      line(cx, cy - h * 0.18, cx - h * 0.22, cy - h * 0.18 - armA * h * 0.14, shirtRgb);  // arms
      line(cx, cy - h * 0.18, cx + h * 0.22, cy - h * 0.18 - armA * h * 0.14, shirtRgb);
      line(cx, cy + h * 0.10, cx - h * 0.14, cy + h * 0.42, OUTLINE);            // legs
      line(cx, cy + h * 0.10, cx + h * 0.14, cy + h * 0.42, OUTLINE);
    };
    const drawHouse = (cx, cy, s, concept) => {
      const wall = pick(concept, 'wall');
      poly([[cx - s, cy + s], [cx - s, cy - s * 0.2], [cx + s, cy - s * 0.2], [cx + s, cy + s], [cx - s, cy + s]], wall);
      poly([[cx - s * 1.15, cy - s * 0.2], [cx, cy - s * 1.05], [cx + s * 1.15, cy - s * 0.2]], CRAYON.red);   // roof
      poly([[cx - s * 0.25, cy + s], [cx - s * 0.25, cy + s * 0.25], [cx + s * 0.25, cy + s * 0.25], [cx + s * 0.25, cy + s]], CRAYON.brown);  // door
      circle(cx + s * 0.55, cy + s * 0.1, s * 0.22, pick(concept, 'window'), 8); // window
      line(cx + s * 0.33, cy + s * 0.1, cx + s * 0.77, cy + s * 0.1, OUTLINE);
      line(cx + s * 0.55, cy - s * 0.12, cx + s * 0.55, cy + s * 0.32, OUTLINE);
    };
    const drawTree = (cx, cy, s) => {
      line(cx, cy + s * 0.5, cx, cy - s * 0.2, CRAYON.brown);
      line(cx - s * 0.02, cy + s * 0.5, cx - s * 0.02, cy - s * 0.2, CRAYON.brown);
      circle(cx, cy - s * 0.55, s * 0.42, CRAYON.green, 12);
    };
    const drawSun = (cx, cy, r) => {
      circle(cx, cy, r, CRAYON.yellow, 10);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; line(cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 1.25, cx + Math.cos(a) * r * 1.9, cy + Math.sin(a) * r * 1.9, CRAYON.yellow); }
    };
    const drawMoonStars = (cx, cy, r) => {
      circle(cx, cy, r, CRAYON.white, 12);
      circle(cx + r * 0.55, cy - r * 0.1, r * 0.8, CRAYON.gray, 12);   // crescent bite
      for (let i = 0; i < 3; i++) { const sx = cx - r * 2.5 + i * r * 1.4, sy = cy + (i % 2 ? r : -r) * 0.9; line(sx - r * 0.25, sy, sx + r * 0.25, sy, CRAYON.white); line(sx, sy - r * 0.25, sx, sy + r * 0.25, CRAYON.white); }
    };
    const drawRain = (cx, cy, s) => {
      const cloud = CRAYON.gray;
      circle(cx - s * 0.5, cy, s * 0.35, cloud, 8); circle(cx, cy - s * 0.15, s * 0.45, cloud, 8); circle(cx + s * 0.5, cy, s * 0.35, cloud, 8);
      for (let i = 0; i < 5; i++) { const rx = cx - s * 0.7 + i * s * 0.35; line(rx, cy + s * 0.45, rx - s * 0.12, cy + s * 0.85, CRAYON.blue); }
    };
    const drawSpider = (cx, cy, r, concept) => {
      dot(cx, cy, 3, OUTLINE); dot(cx, cy - r * 0.5, 2, OUTLINE);
      for (let i = 0; i < 4; i++) {
        const a = 0.35 + i * 0.32;
        line(cx, cy, cx - Math.cos(a) * r * 1.6, cy - Math.sin(a) * r * 1.2 + r * 0.6, OUTLINE);
        line(cx, cy, cx + Math.cos(a) * r * 1.6, cy - Math.sin(a) * r * 1.2 + r * 0.6, OUTLINE);
      }
      line(cx, cy - r * 2.2, cx, cy - r * 0.6, pick(concept, 'silk'));   // hanging from her thread
    };
    const drawAnimal = (cx, cy, s, concept) => {
      const fur = pick(concept, 'fur');
      poly([[cx - s * 0.6, cy], [cx - s * 0.4, cy - s * 0.28], [cx + s * 0.4, cy - s * 0.28], [cx + s * 0.6, cy], [cx + s * 0.4, cy + s * 0.1], [cx - s * 0.4, cy + s * 0.1], [cx - s * 0.6, cy]], fur);  // body
      circle(cx + s * 0.75, cy - s * 0.35, s * 0.22, fur, 8);            // head
      poly([[cx + s * 0.62, cy - s * 0.52], [cx + s * 0.68, cy - s * 0.72], [cx + s * 0.76, cy - s * 0.54]], fur);  // ear
      poly([[cx + s * 0.76, cy - s * 0.54], [cx + s * 0.85, cy - s * 0.72], [cx + s * 0.9, cy - s * 0.5]], fur);
      dot(cx + s * 0.8, cy - s * 0.38, 0, OUTLINE);                       // eye
      for (let i = 0; i < 4; i++) { const lx = cx - s * 0.45 + i * s * 0.3; line(lx, cy + s * 0.1, lx, cy + s * 0.45, fur); }  // legs
      line(cx - s * 0.6, cy - s * 0.05, cx - s * 0.9, cy - s * 0.4, fur); // tail up
    };
    const drawHeart = (cx, cy, s) => {
      const rgb = valence >= 0 ? CRAYON.pink : CRAYON.purple;
      poly([[cx, cy + s * 0.6], [cx - s * 0.6, cy - s * 0.05], [cx - s * 0.45, cy - s * 0.45], [cx - s * 0.15, cy - s * 0.4], [cx, cy - s * 0.15], [cx + s * 0.15, cy - s * 0.4], [cx + s * 0.45, cy - s * 0.45], [cx + s * 0.6, cy - s * 0.05], [cx, cy + s * 0.6]], rgb);
    };
    const drawStar = (cx, cy, r) => {
      const pts = [];
      for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2; const rr = i % 2 === 0 ? r : r * 0.45; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
      poly(pts, CRAYON.yellow);
    };
    const drawFlower = (cx, cy, s, concept) => {
      line(cx, cy + s * 0.6, cx, cy - s * 0.05, CRAYON.green);
      const petal = pick(concept, 'petal');
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; circle(cx + Math.cos(a) * s * 0.22, cy - s * 0.2 + Math.sin(a) * s * 0.22, s * 0.13, petal, 6); }
      circle(cx, cy - s * 0.2, s * 0.1, CRAYON.yellow, 6);
    };
    const drawMonster = (cx, cy, s, concept) => {
      // her canon: the monster under the bed she LIKES — wobbly body, horns,
      // big mismatched eyes, zigzag fang mouth, stubby legs
      const skin = pick(concept, 'skin');
      circle(cx, cy, s * 0.55, skin, 9);                                                   // wobbly body
      poly([[cx - s * 0.35, cy - s * 0.45], [cx - s * 0.5, cy - s * 0.85], [cx - s * 0.15, cy - s * 0.5]], skin);   // horns
      poly([[cx + 0.35 * s, cy - s * 0.45], [cx + s * 0.5, cy - s * 0.85], [cx + s * 0.15, cy - s * 0.5]], skin);
      circle(cx - s * 0.2, cy - s * 0.12, s * 0.14, CRAYON.white, 7); dot(cx - s * 0.2, cy - s * 0.12, 1, OUTLINE);  // big eye
      circle(cx + s * 0.22, cy - s * 0.1, s * 0.09, CRAYON.white, 7); dot(cx + s * 0.22, cy - s * 0.1, 0, OUTLINE);  // small eye
      { const pts = []; for (let z = 0; z <= 6; z++) pts.push([cx - s * 0.3 + (z / 6) * 0.6 * s, cy + s * 0.22 + (z % 2 ? 0.06 : -0.02) * s]); poly(pts, OUTLINE); }  // fangs
      line(cx - s * 0.2, cy + s * 0.5, cx - s * 0.2, cy + s * 0.72, skin);                  // stubby legs
      line(cx + s * 0.2, cy + s * 0.5, cx + s * 0.2, cy + s * 0.72, skin);
    };

    // ── subject: the head concept of what she's thinking (she draws what she
    // couldn't re-see) — same head-token rule as _conceptImageryLoop ──
    const FUNCTION = new Set(['the','a','an','and','or','but','of','in','on','at','to','is','it','its','was','are','be','this','that','with','for','as','her','his','my','your','she','he','you','we','me','him','them','they','am','do','so','up','by','if','not','no','yes','all','out','off','now','then','here','there','what','why','how','who','where','when','does','did','done','has','have','had','can','could','would','should','will','wont','dont','doesnt','aint','get','gets','got','just','very','really','some','one','said','saying','gonna','wanna','course','sec','totally','seriously','figured']);
    const toks = String(seedText || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3 && !FUNCTION.has(w));
    const concept = toks[0] || null;
    const isQuestionThought = /\b(what|why|how|who|where|when)\b/.test(String(seedText || '').toLowerCase()) || !!this._pendingQuestionConcept;

    // ── schema classification: direct token table, then GloVe-cosine backup ──
    const SCHEMA_WORDS = {
      person: ['person','people','mom','mother','dad','father','grandma','grandpa','teacher','kid','girl','boy','friend','baby','man','woman','lady','sister','brother','family','myself','herself','doctor','nurse','witch','king','queen','police'],
      animal: ['dog','cat','animal','pet','horse','bird','hamster','kitten','puppy','bear','cow','pig','mouse','rabbit','fox','wolf','fish','snake','frog','duck','chicken','sheep','goat','lion','tiger','monkey','elephant','deer','owl','bat','squirrel'],
      spider: ['spider','bug','insect','ant','bee','beetle','web','worm','fly'],
      house:  ['house','home','kitchen','room','school','library','building','porch','door','window','wall','barn','store','castle','church','bedroom'],
      tree:   ['tree','forest','plant','garden','leaf','leaves','wood','branch','bush','grass'],
      flower: ['flower','rose','daisy','petal','bloom','tulip'],
      sun:    ['sun','sunny','day','summer','warm','bright','morning','light'],
      moon:   ['moon','night','dark','star','stars','sky','sleep','midnight','halloween'],
      rain:   ['rain','cloud','clouds','storm','thunder','weather','wet','snow','umbrella','wind','lightning','rainbow'],
      heart:  ['love','heart','like','care','hug','kiss','valentine'],
      star:   ['wish','magic','shine','sparkle','firework'],
      monster: ['monster','ghost','zombie','vampire','demon','creature','dragon','skeleton','skull','goblin','troll','beast','alien'],
    };
    let schema = null;
    if (concept) {
      for (const [k, words] of Object.entries(SCHEMA_WORDS)) { if (words.includes(concept)) { schema = k; break; } }
      if (!schema && this.sharedEmbeddings && typeof this.sharedEmbeddings.getEmbedding === 'function') {
        try {
          const cv = this.sharedEmbeddings.getEmbedding(concept);
          if (cv) {
            const cos = (a, b) => { let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0; };
            let best = null, bestS = 0.34;   // DRAW.6 — was 0.42; too strict in practice, so most concepts fell to the shapes stage and the viewer looped shape-stacks. Below it she has no schema and doodles shapes.
            for (const [k, words] of Object.entries(SCHEMA_WORDS)) {
              for (const w of words.slice(0, 4)) {
                const wv = this.sharedEmbeddings.getEmbedding(w);
                if (!wv) continue;
                const s = cos(cv, wv);
                if (s > bestS) { bestS = s; best = k; }
              }
            }
            schema = best;
          }
        } catch { /* classification best-effort — shapes stage below */ }
      }
    }

    const stage = vocab < 400 ? 1 : vocab < 1200 ? 2 : 3;
    const drawSchema = (k, cx, cy, s, cpt) => {
      if (k === 'person') drawPerson(cx, cy, s * 1.6, cpt);
      else if (k === 'animal') drawAnimal(cx, cy, s, cpt);
      else if (k === 'spider') drawSpider(cx, cy, s * 0.4, cpt);
      else if (k === 'house') drawHouse(cx, cy, s * 0.55, cpt);
      else if (k === 'tree') drawTree(cx, cy, s);
      else if (k === 'flower') drawFlower(cx, cy, s, cpt);
      else if (k === 'sun') drawSun(cx, cy, s * 0.35);
      else if (k === 'moon') drawMoonStars(cx, cy, s * 0.3);
      else if (k === 'rain') drawRain(cx, cy, s * 0.6);
      else if (k === 'heart') drawHeart(cx, cy, s * 0.6);
      else if (k === 'star') drawStar(cx, cy, s * 0.45);
      else if (k === 'monster') drawMonster(cx, cy, s * 0.8, cpt);
    };

    // DRAW.5 — practice evolution: the per-concept draw counter folds into
    // every layout hash below, so drawing the same subject again comes out
    // DIFFERENT (evolving every couple attempts) instead of a pixel-identical
    // repeat — "the same thing repeatedly in different forms" was the old
    // hash-only seeding. Colors stay concept-stable; composition practices.
    const practice = Math.floor(this._drawPracticeBump(concept || 'doodle') / 2);

    // Past shape-age, a schema-less ABSTRACT concept is NOT a drawing — it
    // falls through to the de-novo colored thought-field. The old fallback
    // sent every abstract thought (coming/time/very/...) to the stage-1
    // shapes doodle, whose whole vocabulary is 4 primitives — so the viewer
    // looped the same triangle/square/circle stacks all day at scene-age.
    if (stage >= 2 && !schema) return null;

    // EXP.1 — EXPERIMENTATION. A kid with a full sketchbook doesn't just
    // repeat what she knows — she plays: mashes two schemas into one frame
    // (spider ON the house, a heart over the moon) or colors on purpose
    // "wrong" (purple sun, red tree). ~22% of schema draws experiment.
    let expMash = null, expWild = false;
    if (stage >= 2 && schema && Math.random() < 0.22) {
      if (Math.random() < 0.5) {
        const others = Object.keys(SCHEMA_WORDS).filter(k => k !== schema);
        expMash = others[Math.floor(Math.random() * others.length)];
      } else {
        expWild = true;   // wild-color rebellion: every part gets a random crayon
      }
    }
    if (expWild) {
      const names = Object.keys(CRAYON);
      pick = () => CRAYON[names[Math.floor(Math.random() * names.length)]];
    }

    if (stage === 1) {
      // STAGE 1 — basic-shape practice (real shape-age only, vocab < 400):
      // wobbly circles / boxes / triangles / zigzags, count + spread from
      // arousal, colors picked per shape. This is a real kid's shape stage,
      // not the neuron scribble.
      const nShapes = 2 + (hash((concept || 'doodle') + ':n' + practice) % 3) + Math.round(arousal * 2);
      for (let i = 0; i < nShapes; i++) {
        const h = hash((concept || 'doodle') + i + ':p' + practice);
        const cx = 0.18 + 0.64 * (((h >>> 4) & 0xff) / 255), cy = 0.18 + 0.55 * (((h >>> 12) & 0xff) / 255);
        const s = 0.06 + 0.10 * (((h >>> 20) & 0xff) / 255);
        const rgb = pick(concept || 'doodle', 'shape' + i);
        const kind = h % 4;
        if (kind === 0) circle(cx, cy, s, rgb, 8);
        else if (kind === 1) poly([[cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s], [cx - s, cy - s]], rgb);
        else if (kind === 2) poly([[cx, cy - s], [cx + s, cy + s], [cx - s, cy + s], [cx, cy - s]], rgb);
        else { const pts = []; for (let z = 0; z <= 4; z++) pts.push([cx - s + (z / 4) * 2 * s, cy + (z % 2 ? s * 0.6 : -s * 0.6)]); poly(pts, rgb); }
      }
      this._lastSketchLabel = 'canvas:shapes' + (concept ? ':' + concept : '');
    } else if (schema) {
      if (stage === 2) {
        // STAGE 2 — single-subject figure drawing of her current thought.
        drawSchema(schema, 0.5, 0.52, 0.28, concept);
        if (expMash) { drawSchema(expMash, 0.74, 0.42, 0.16, concept); }
        this._lastSketchLabel = 'canvas:' + (expMash ? 'experiment:' + concept + '+' + expMash : (expWild ? 'experiment:wildcolor:' + concept : 'figure:' + concept));
      } else {
        // STAGE 3 — a SCENE: wobbly ground line, subject on it, sky detail
        // from her mood (sun when she feels good, rain cloud when low, moon
        // when fearful/dark), a context schema chosen per concept + practice
        // (DRAW.5 — the scene composition evolves as she re-draws a subject:
        // the subject wanders the ground line and the context rotates).
        const gy = 0.82;
        poly([[0.04, gy + jj()], [0.3, gy + jj()], [0.55, gy + jj()], [0.8, gy + jj()], [0.96, gy + jj()]], CRAYON.green);
        const _ph = hash(concept + ':layout' + practice);
        const subjX = 0.3 + 0.3 * ((_ph & 0xff) / 255);
        const subjectY = schema === 'sun' || schema === 'moon' || schema === 'rain' || schema === 'star' ? 0.3 : 0.6;
        drawSchema(schema, subjX, subjectY, 0.26, concept);
        if (schema !== 'sun' && schema !== 'moon' && schema !== 'rain') {
          if (fear > 0.55) drawMoonStars(0.82, 0.16, 0.07);
          else if (valence >= 0.1) drawSun(0.84, 0.15, 0.07);
          else drawRain(0.8, 0.16, 0.14);
        }
        // context: an experiment mash REPLACES the stock context — the novel
        // pairing IS the experiment (spider on the house, heart over the moon)
        const CONTEXT = ['tree', 'house', 'flower'];
        const ctx = expMash || CONTEXT[hash(concept + ':ctx' + practice) % CONTEXT.length];
        const ctxX = subjX < 0.5 ? 0.78 : 0.18;
        if (ctx !== schema) drawSchema(ctx, ctxX, ctx === 'house' ? 0.62 : 0.58, expMash ? 0.22 : 0.18, concept);
        this._lastSketchLabel = 'canvas:' + (expMash ? 'experiment:' + concept + '+' + expMash : (expWild ? 'experiment:wildcolor:' + concept : 'scene:' + concept));
      }
    }

    // ── WORDS + QUESTIONS (≥800 words trained — she writes like she draws) ──
    if (vocab >= 800 && this.mindSpace && typeof this.mindSpace.glyphStrokes === 'function') {
      try {
        if (concept && (schema || stage >= 2)) {
          // she LABELS her drawing (kids caption their art) — her word, her crayon
          const label = concept.slice(0, 10);
          const gs = this.mindSpace.glyphStrokes(label, { x: Math.max(0.06, 0.5 - label.length * 0.033), y: 0.885, size: 0.075, wobble: 0.05 + 0.12 * arousal, rgb: pick(concept, 'label') });
          for (const s of gs) strokes.push(s);
        }
        if (isQuestionThought || (concept && !schema && stage >= 2)) {
          // a question she HAS: the thing she's wondering about gets a big "?"
          const q = this.mindSpace.glyphStrokes('?', { x: 0.76, y: 0.08, size: 0.16, wobble: 0.06 + 0.1 * arousal, rgb: CRAYON.pink });
          for (const s of q) strokes.push(s);
          if (this._lastSketchLabel) this._lastSketchLabel += '?';
        }
      } catch { /* writing best-effort — the drawing stands */ }
    }

    if (strokes.length === 0) {
      const s = this._scribbleStrokes();
      if (s) this._lastSketchLabel = 'canvas:scribble';
      return s;
    }
    return strokes;
  },

  // DRAW.5 — drawing PRACTICE counter. Kids don't stamp the same drawing —
  // they iterate: each time they draw a thing it comes out a little different
  // as the motor plan evolves. Every composed drawing of a concept bumps its
  // counter (bounded Map, cap 300); the counter folds into the layout hash so
  // repeat drawings of the SAME subject evolve every couple of attempts
  // instead of repeating pixel-identical forms. Colors stay concept-stable
  // (her cast keeps its crayons) — only composition/layout practices forward.
  _drawPracticeBump(concept) {
    if (!concept) return 0;
    if (!(this._drawPractice instanceof Map)) this._drawPractice = new Map();
    const n = (this._drawPractice.get(concept) || 0) + 1;
    if (this._drawPractice.size >= 300 && !this._drawPractice.has(concept)) {
      const first = this._drawPractice.keys().next().value;
      this._drawPractice.delete(first);
    }
    this._drawPractice.set(concept, n);
    return n;
  },

  // DRAW.8 — grade-gated canvas resolution. Her drawing surface grows with
  // her education exactly like a real artist's control does: K crayons on a
  // small page → adult work on a big sheet. Reads the live minGrade (the
  // same signal that caps her speech). Bounded 96..512 (the raised sketch()
  // cap; engine MAX_LINE 2048 upstream, no-fractalize invariant untouched —
  // the CPU CDF 9/7 on a padded 512² plane is still milliseconds).
  _drawCanvasSide() {
    let g = 'K';
    try { if (typeof this._computeMinGrade === 'function') g = this._computeMinGrade(); } catch { /* grade read best-effort */ }
    const MAP = {
      'pre-K': 96, 'K': 96,
      'grade1': 128, 'grade2': 128, 'grade3': 128, 'grade4': 160, 'grade5': 160,
      'grade6': 192, 'grade7': 192, 'grade8': 192,
      'grade9': 256, 'grade10': 256, 'grade11': 256, 'grade12': 256,
      'college1': 320, 'college2': 320, 'college3': 384, 'college4': 384,
      'grad': 448, 'phd': 512,
    };
    return MAP[g] || 96;
  },

  // DRAW.7 — the PRACTICE LOOP: draw → compare → adjust → keep the best.
  // When she draws from a visual memory she HAS a reference — the stored
  // field C. A human gets past stick figures exactly this way: look at the
  // thing, draw it, compare, adjust, repeat for years. Bounded attempts
  // (loop-safe, tiny planes): each renders a stroke variant and scores it by
  // the cosine between describe(drawing) and describe(memory) — the
  // equational "does my drawing look like the thing" — and the best
  // survives. Per-concept skill (best cosine achieved, Map cap 300,
  // in-memory per boot) steadies her hand: _drawFromMemoryStrokes shrinks
  // its wobble as skill grows, so her line control genuinely improves with
  // practice. No image-model anywhere in the loop.
  // DRAW.9 — MEMORY-PAINTING: sometimes the practiced drawing composites
  // ONTO the memory itself via morphField (equation-domain coefficient
  // union + lerp) — her strokes fused with the real seen field C = a
  // composed painting from real material, label canvas:paint:<concept>.
  // The practice render uses the MEMORY's dims so the percept comparison is
  // apples-to-apples and the morph pads match.
  _practiceDrawFromMemory(concept, memRec) {
    if (!memRec || !this.mindSpace || typeof this.mindSpace.sketch !== 'function') return null;
    let memPercept = null;
    try { memPercept = this.mindSpace.describe(memRec); } catch { return null; }
    if (!memPercept) return null;
    const cos = (a, b) => {
      let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0;
    };
    if (!(this._drawSkill instanceof Map)) this._drawSkill = new Map();
    const key = concept || 'seen';
    const mood = { arousal: this.arousal, valence: this.valence };
    const side = Math.max(16, Math.min(memRec.width || 96, 512));
    const ATTEMPTS = 2;
    let best = null, bestCos = -1;
    for (let v = 0; v < ATTEMPTS; v++) {
      let strokes = null;
      try { strokes = this._drawFromMemoryStrokes(key, memRec, v); } catch { strokes = null; }
      if (!strokes || !strokes.length) continue;
      let drawn = null;
      try { drawn = this.mindSpace.sketch(strokes, { maxSide: side, mood }); } catch { drawn = null; }
      if (!drawn) continue;
      let s = 0;
      try { s = cos(this.mindSpace.describe(drawn), memPercept); } catch { s = 0; }
      if (s > bestCos) { bestCos = s; best = drawn; }
    }
    if (!best) return null;
    // skill = the best resemblance she has ever achieved for this concept
    const prev = this._drawSkill.get(key) || 0;
    if (bestCos > prev) {
      if (this._drawSkill.size >= 300 && !this._drawSkill.has(key)) {
        const first = this._drawSkill.keys().next().value;
        this._drawSkill.delete(first);
      }
      this._drawSkill.set(key, bestCos);
    }
    try { process.stdout.write(`[Brain] ✏ drawing practice "${key}" — resemblance ${bestCos.toFixed(3)} (skill ${Math.max(prev, bestCos).toFixed(3)})\n`); } catch { /* nf */ }
    // DRAW.9 — memory-painting: fuse her strokes with the real seen field C
    if (typeof this.mindSpace.morph === 'function' && Math.random() < 0.4) {
      try {
        const comp = this.mindSpace.morph(memRec, best, 0.5);
        if (comp) return { rec: comp, label: 'canvas:paint:' + key, resemblance: bestCos };
      } catch { /* composite best-effort — the drawing stands */ }
    }
    return { rec: best, label: 'canvas:memory:' + key, resemblance: bestCos };
  },

  // DRAW.10 — UNDERDRAWING REALIZATION: a completed scene drawing is her
  // COMPOSITION INTENT — occasionally she hands it to the image executor to
  // realize (the artist's underdrawing workflow: her drawing decides WHAT,
  // the executor is only the brush — the sensory-output law intact). The
  // render comes back through the visual-feeder → visual memory binds it →
  // her NEXT recall + practice reference for that concept is the realized
  // version, so the practice loop's reference itself upgrades. Full artist
  // loop: imagine → draw → realize → see → remember → draw better.
  // Hard-gated: clients present, long cooldown, low probability.
  _realizeDrawing(concept, sceneWords, now) {
    if (!concept) return;
    if (!this.clients || this.clients.size === 0) return;
    if (typeof this._buildPollinationsImageUrl !== 'function') return;
    const GAP = Number(process.env.DREAM_DRAW_REALIZE_GAP_MS) || 300000;   // ≥5min between realizations
    if (this._lastDrawRealizeAt && (now - this._lastDrawRealizeAt) < GAP) return;
    if (Math.random() > 0.35) return;   // occasional urge, not a metronome
    this._lastDrawRealizeAt = now;
    let prompt = concept + (sceneWords ? ' ' + sceneWords : '');
    try { if (typeof this._composeImagePrompt === 'function') prompt = this._composeImagePrompt(prompt); } catch { /* bare */ }
    let url = '';
    try { url = this._buildPollinationsImageUrl(prompt); } catch { return; }
    if (!url) return;
    const payload = JSON.stringify({ type: 'image', prompt, url, imagined: true, concept, ts: now });
    for (const [ws] of this.clients) { if (ws.readyState === ws.OPEN) { try { ws.send(payload); } catch { /* nf */ } } }
    try {
      const _c = this.cortexCluster;
      if (_c && typeof _c.pushEmission === 'function') _c.pushEmission({ source: 'draw-realize', text: prompt, ts: now });
    } catch { /* nf */ }
    try { process.stdout.write(`[Brain] 🖼 underdrawing realized — her scene drawing of "${concept}" goes to the executor as "${prompt}" (render → feeder → visual memory → her next reference upgrades).\n`); } catch { /* nf */ }
  },

  // DRAW.4 — draw WHAT SHE REMEMBERS. Turns a recalled visual-memory field C
  // into pencil strokes derived from the memory's OWN percept vector
  // (describeEquational layout: dims 24-47 = coarse spatial Y coefficients,
  // 48/49 = Cb/Cr chroma mass, 50 = luma, 51 = high-frequency texture ratio).
  // The contour is a 24-point radial outline whose radii come straight from
  // the coarse coefficients — a projection of the actual stored image, unique
  // per memory, NOT a table schema. Chroma picks the crayon (warm vs cool vs
  // dark), texture adds interior hatch strokes, and she labels it in her own
  // hand. This is the growth engine Gee asked for: every concept her eyes
  // ground becomes a NEW thing she can draw.
  _drawFromMemoryStrokes(concept, srcRec, variant = 0) {
    if (!srcRec || !this.mindSpace || typeof this.mindSpace.describe !== 'function') return null;
    let p = null;
    try { p = this.mindSpace.describe(srcRec); } catch { return null; }
    if (!p || p.length < 52) return null;
    const arousal = Math.max(0, Math.min(1, this.arousal ?? 0.4));
    const fear = Math.max(0, Math.min(1, this.fear ?? 0));
    // DRAW.7 — skill steadies the hand: as her best resemblance for this
    // concept grows (practice loop), the jitter shrinks — real learned line
    // control, up to ~45% steadier at mastery.
    const _skill = (this._drawSkill instanceof Map) ? (this._drawSkill.get(concept || 'seen') || 0) : 0;
    const wob = (0.008 + 0.018 * arousal + 0.010 * fear) * (1 - 0.45 * Math.max(0, Math.min(1, _skill)));
    const jj = () => (Math.random() * 2 - 1) * wob;
    const strokes = [];
    // crayon from the memory's chroma: Cr-heavy → warm, Cb-heavy → cool,
    // low-chroma → dark/gray (equational readout of the stored image itself)
    const cb = Math.abs(p[48] || 0), cr = Math.abs(p[49] || 0), luma = Math.abs(p[50] || 0);
    const WARM = [[214, 48, 49], [235, 140, 50], [253, 121, 168]];
    const COOL = [[72, 116, 224], [64, 190, 200], [162, 89, 216]];
    const DARK = [[30, 28, 32], [150, 150, 155], [235, 233, 228]];
    const fam = (cr > cb * 1.15) ? WARM : (cb > cr * 1.15) ? COOL : DARK;
    const hash = (s) => { let h = 5381; const t = String(s); for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return h; };
    const ink = fam[hash((concept || 'seen') + ':ink') % fam.length];
    const OUTLINE = [30, 28, 32];
    // contour: 24 radial points, radius from the memory's coarse coefficients
    const n = this._drawPracticeBump(concept || 'seen');
    let maxAbs = 1e-8;
    for (let i = 24; i < 48; i++) maxAbs = Math.max(maxAbs, Math.abs(p[i] || 0));
    const pts = [];
    const cx = 0.5, cy = 0.5;
    // practice rotates the starting angle a little each attempt — she draws
    // the same memory from a slightly different "grip" as she practices;
    // the DRAW.7 attempt variant nudges it further so each try in a practice
    // round is a genuinely different adjustment, not a re-roll of jitter.
    const rot = ((n % 8) / 8) * Math.PI * 2 * 0.12 + variant * 0.09;
    for (let i = 0; i <= 24; i++) {
      const k = 24 + (i % 24);
      const mag = Math.abs(p[k] || 0) / maxAbs;
      const r = 0.14 + 0.20 * mag;
      const a = rot + (i / 24) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r + jj(), cy + Math.sin(a) * r * 1.05 + jj()]);
    }
    strokes.push({ type: 'poly', pts, rgb: ink });
    // texture ratio → interior hatch detail (busy images get busy interiors)
    const tex = Math.max(0, Math.min(1, p[51] || 0));
    const nHatch = Math.round(tex * 6);
    for (let i = 0; i < nHatch; i++) {
      const h = hash((concept || 'seen') + ':h' + i + ':' + Math.floor(n / 2));
      const hx = 0.36 + 0.28 * (((h >>> 3) & 0xff) / 255), hy = 0.36 + 0.28 * (((h >>> 11) & 0xff) / 255);
      const len = 0.05 + 0.06 * (((h >>> 19) & 0xff) / 255);
      const ang = ((h >>> 25) & 0x3f) / 63 * Math.PI;
      strokes.push({ type: 'line', x0: hx - Math.cos(ang) * len + jj(), y0: hy - Math.sin(ang) * len + jj(), x1: hx + Math.cos(ang) * len + jj(), y1: hy + Math.sin(ang) * len + jj(), rgb: fam[(hash((concept || 'seen') + ':h' + i)) % fam.length] });
    }
    // luma → a shadow/ground stroke under bright memories (she grounds what she saw)
    if (luma > 0.15) strokes.push({ type: 'line', x0: 0.3 + jj(), y0: 0.78 + jj(), x1: 0.7 + jj(), y1: 0.78 + jj(), rgb: OUTLINE });
    // she labels the memory in her own hand (she KNOWS this one — no "?")
    try {
      if (concept && this.mindSpace && typeof this.mindSpace.glyphStrokes === 'function') {
        const label = String(concept).slice(0, 10);
        const gs = this.mindSpace.glyphStrokes(label, { x: Math.max(0.06, 0.5 - label.length * 0.033), y: 0.885, size: 0.075, wobble: 0.05 + 0.1 * arousal, rgb: ink });
        for (const s of gs) strokes.push(s);
      }
    } catch { /* label best-effort */ }
    return strokes;
  },

  // SPEAK.6a — brain-driven OUTWARD image generation. Beyond the mind's-eye
  // (internal field C), when her arousal/drive crosses a threshold she
  // VOLUNTEERS an outward image from her own state — no user keyword. Loop-safe:
  // the concept is a trained-vocab sample (never a 57s composeSentence), gated by
  // arousal + a long cooldown + low probability so it's a rare mood-driven urge,
  // not spam. Broadcasts a generate_image the client renders (Pollinations), then
  // runs the SPEAK.6b learning loop so she remembers what she chose to make.
  _spontaneousImageTick(now) {
    if (this._curriculumInProgress) return;   // never mid-teach
    if (!this._languageReady) return;
    const arousal = (typeof this.arousal === 'number') ? this.arousal : 0.4;
    const AROUSAL_MIN = Number(process.env.DREAM_SPONTANEOUS_IMG_AROUSAL) || 0.7;
    if (arousal < AROUSAL_MIN) return;
    const GAP = Number(process.env.DREAM_SPONTANEOUS_IMG_GAP_MS) || 300000; // ~5 min
    if (this._lastSpontaneousImgAt && (now - this._lastSpontaneousImgAt) < GAP) return;
    if (Math.random() > 0.15) return;   // rare even when eligible
    this._lastSpontaneousImgAt = now;
    let concept = '';
    try { concept = (typeof this._sampleCurrentVocab === 'function' ? this._sampleCurrentVocab() : '') || ''; } catch { /* nf */ }
    // TU.29.7 — she composes this prompt too (concept + her associations + her
    // mood), instead of the retired canned template.
    const prompt = this._composeImagePrompt(concept || 'goth aesthetic');
    if (this.clients && this.clients.size > 0) {
      const payload = JSON.stringify({ type: 'generate_image', prompt, spontaneous: true, seed: 'drive', ts: now });
      for (const [ws] of this.clients) { if (ws.readyState === ws.OPEN) { try { ws.send(payload); } catch { /* nf */ } } }
    }
    // SPEAK.6b learning loop — she remembers the image she chose to make.
    try {
      const _c = this.cortexCluster;
      if (_c && typeof _c.pushEmission === 'function') _c.pushEmission({ source: 'image-gen-spontaneous', text: prompt, ts: now });
      if (Array.isArray(this._innerThoughtChain)) { this._innerThoughtChain.push(prompt); while (this._innerThoughtChain.length > 8) this._innerThoughtChain.shift(); }
      if (_c) _c._emissionLockedUntil = now + 6000;
    } catch { /* feedback non-fatal */ }
    try { process.stdout.write(`[Brain] 🎨 spontaneous image (drive) "${prompt}" — arousal=${arousal.toFixed(2)}
`); } catch { /* nf */ }
  },

  // SPEAK.10a — consciousness-mechanism ablation MEASUREMENT harness. Ablation
  // itself = the operator toggling the existing per-mechanism env flags across
  // runs (DREAM_GW_IGNITION, DREAM_NOISE_GATE, DREAM_INNERVOICE_GPU_GEN, the
  // SPEAK.10c saturation clamp via meanCos, etc). This returns a comparable
  // snapshot of each mechanism's OBSERVABLE effect so 'did toggling X change
  // anything?' is answerable: a mechanism whose toggle moves none of these is
  // vestigial → wire or cut. Logged only when DREAM_ABLATION_LOG=1 (no spam).
  _consciousnessAblationSnapshot() {
    const c = this.cortexCluster || {};
    const snap = {};
    try {
      const re = Array.isArray(c._recentEmissions) ? c._recentEmissions : [];
      const uniq = new Set(re).size;
      snap.repeatRate = re.length ? Number((1 - uniq / re.length).toFixed(3)) : 0;
      const cf = c._coherenceFloorStats || { total: 0, rejected: 0 };
      snap.coherenceRejectRate = cf.total ? Number((cf.rejected / cf.total).toFixed(3)) : 0;
      const rr = c._coherenceRerankStats || { calls: 0, reranked: 0 };
      snap.rerankRate = rr.calls ? Number((rr.reranked / rr.calls).toFixed(3)) : 0;
      snap.semMotorMeanCos = (typeof c._lastSemMotorMeanCos === 'number') ? Number(c._lastSemMotorMeanCos.toFixed(3)) : null;
      snap.psiGain = (typeof c.gainMultiplier === 'number') ? Number(c.gainMultiplier.toFixed(3)) : null;
      snap.predictionError = (typeof c._lastPredictionError === 'number') ? Number(c._lastPredictionError.toFixed(3)) : null;
      const gw = this.globalWorkspace;
      snap.gwIgnitionRate = (gw && gw._history && gw._history.length)
        ? Number((gw._history.filter(h => h && h.ignited).length / gw._history.length).toFixed(3)) : null;
      snap.flags = {
        gwIgnition: process.env.DREAM_GW_IGNITION || 'default',
        noiseGate: process.env.DREAM_NOISE_GATE || '0',
        gpuGen: process.env.DREAM_INNERVOICE_GPU_GEN || 'default',
      };
    } catch { /* snapshot best-effort */ }
    return snap;
  },

  // TU.29.7 — UNITY composes the image prompt. The user-ask lane used to
  // echo-route the stripped user text as the prompt (she composed nothing) and
  // the spontaneous lane used a half-canned template. Now the prompt is built
  // from HER brain: the request concept + her nearest TRAINED-vocab associations
  // (embedding cosine over wordBucketWords_* + _definitionTaughtWords — the
  // CGATE.3 loop-safe class, zero brain ticks) + a live-affect style tail
  // (arousal/valence/fear/drug → descriptor mapping, the same equational
  // state-readout class as the mind-space moodTint). A newborn with no trained
  // words gets the bare concept + her mood — honest, not faked richness.
  _composeImagePrompt(request) {
    const base = String(request || '').replace(/[^a-zA-Z' -]/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = base ? [base] : [];
    try {
      const cluster = this.cortexCluster;
      const emb = this.sharedEmbeddings;
      if (cluster && emb && typeof emb.getEmbedding === 'function') {
        // her trained pool — the same gather as _sampleCurrentVocab
        const SUBJECTS = ['ela', 'math', 'sci', 'soc', 'art', 'life'];
        const pool = [];
        for (const subj of SUBJECTS) {
          const list = cluster[`wordBucketWords_${subj}`];
          if (Array.isArray(list)) for (const w of list) if (typeof w === 'string' && w.length > 1) pool.push(w);
        }
        if (pool.length === 0 && cluster._definitionTaughtWords instanceof Set) {
          for (const w of cluster._definitionTaughtWords) if (typeof w === 'string' && w.length > 1) pool.push(w);
        }
        const reqTokens = base.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 2).slice(0, 3);
        if (pool.length > 0 && reqTokens.length > 0) {
          const cos = (a, b) => {
            let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
            for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
            const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0;
          };
          // bounded scoring pool so cost stays O(POOL·dim) at any vocab size
          const POOL = 300;
          const sample = pool.length <= POOL ? pool : Array.from({ length: POOL }, () => pool[Math.floor(Math.random() * pool.length)]);
          const picked = new Set(reqTokens);
          for (const tok of reqTokens) {
            const tv = emb.getEmbedding(tok);
            if (!tv) continue;
            const scored = [];
            for (const w of sample) {
              if (picked.has(w)) continue;
              const wv = emb.getEmbedding(w);
              if (!wv) continue;
              const s = cos(tv, wv);
              if (s >= 0.35) scored.push({ w, s });
            }
            scored.sort((a, b) => b.s - a.s);
            for (const { w } of scored.slice(0, 2)) { parts.push(w); picked.add(w); }
          }
        }
      }
    } catch { /* association enrichment is best-effort — bare concept stands */ }
    // live-affect style tail — equational readout of her state, not cognition
    try {
      const style = [];
      const arousal = (typeof this.arousal === 'number') ? this.arousal : 0.4;
      const valence = (typeof this.valence === 'number') ? this.valence : 0;
      const fear = (typeof this.fear === 'number') ? this.fear : 0;
      if (valence < 0.15) style.push('dark moody'); else style.push('vivid');
      if (arousal > 0.7) style.push('intense');
      if (fear > 0.5) style.push('eerie');
      try { if (typeof this._drugStateLabel === 'function' && this._drugStateLabel() !== 'sober') style.push('hazy surreal'); } catch { /* sober default */ }
      parts.push(style.join(', '));
    } catch { /* style tail best-effort */ }
    const prompt = parts.filter(Boolean).join(', ').slice(0, 220);
    return prompt || base;
  },
  // AGE PIN — her self-image age tracks her LIVE grade ("25 pin in and out per
  // grade level to age right"): K Unity pictures herself as the 5-year-old she
  // currently IS; the 25-year-old appears when she has walked there. Derived
  // fresh on every ask so a fresh walk pins the age back down automatically.
  _selfImageAge() {
    let g = null;
    try { if (typeof this._computeMinGrade === 'function') g = this._computeMinGrade(); } catch { /* grade read best-effort */ }
    const AGE = {
      'pre-K': 4, 'K': 5,
      'grade1': 6, 'grade2': 7, 'grade3': 8, 'grade4': 9, 'grade5': 10, 'grade6': 11,
      'grade7': 12, 'grade8': 13, 'grade9': 14, 'grade10': 15, 'grade11': 16, 'grade12': 17,
      'college1': 18, 'college2': 19, 'college3': 20, 'college4': 21, 'grad': 23, 'phd': 25,
    };
    return AGE[g] || 25;   // no grade state (stub/persona default) → the 25yo end-state
  },

  // IMG-GEN — detect an image-generation request in user input + build a Pollinations
  // prompt. INPUT ROUTING ONLY (mirrors the browser engine's keyword detection) — the
  // equational cognition is untouched. Returns a prompt string, or null when it's not
  // an image request. Conservative: requires an explicit visual ask so idioms like
  // "show me the code" / "picture this" don't false-trigger.
  _detectImageRequest(text) {
    const t = String(text || '').toLowerCase().trim();
    if (!t) return null;
    const VISUAL = /\b(draw|sketch|paint|painting|render|illustrate|selfie|portrait|drawing)\b/;
    const NOUN = /\b(picture|image|photo|pic|wallpaper|artwork)\b/;
    const SHOW = /\b(show me|generate|create|make me|make us|give me)\b/;
    // show-me-object routing: "show me an apple!" is a visual ask even without
    // a picture/image noun. Route "show me/us <object>" to image UNLESS the
    // object is a code/state/telemetry word ("show me the code" stays text).
    // Input classification only, same rule-class as the detectors above.
    const showObj = /\bshow (?:me|us)\s+(?:a|an|the|your|some)?\s*([a-z][a-z' -]{1,40})/.exec(t);
    const SHOW_OBJ_EXCLUDE = /\b(code|state|log|logs|stat|stats|error|errors|weight|weights|dashboard|data|number|numbers|progress|status|list|file|files|source|console|terminal|output)\b/;
    const isShowObject = !!(showObj && showObj[1] && !SHOW_OBJ_EXCLUDE.test(showObj[1]));
    const isImage = VISUAL.test(t)
      || (NOUN.test(t) && (SHOW.test(t) || /\b(of|a|an|the|your|yourself|me|us)\b/.test(t)))
      || isShowObject;
    if (!isImage) return null;
    // SELF-IMAGE (2026-07-09 rebuild) — her IDENTITY CORE stays constant (the
    // consistent face/hair/eyes that make her recognizably HER) but the
    // requested SCENE / ACTION / OUTFIT is merged back in. The old path
    // returned the fixed identity string VERBATIM for any ask containing
    // selfie / picture-of-you — the scene was discarded, so "selfie at
    // nascar" and "you fighting a zebra" both rendered the same mug shot.
    // A real girl can picture herself doing ANYTHING; only her face is fixed.
    // When the ask names what she wears (or nothing), her stated wear
    // REPLACES the default black-leather outfit instead of colliding with it.
    const isSelf = /\bselfie\b/.test(t)
      || /\b(picture|photo|pic|portrait|image|drawing|painting) of (you|yourself|unity|herself)\b/.test(t)
      || /\b(image|draw|show|paint|render|sketch|picture|generate|make)\s+(me\s+)?(yourself|herself|unity)\b/.test(t);
    if (isSelf) {
      // scene = the ask minus the command/selfie framing + self references
      let scene = t
        .replace(/^[\s,]*(hey|yo|ok|okay|unity|can you|could you|would you|will you|please|pls)\b/g, ' ')
        .replace(/\b(send|take|snap|show|give|make|draw|image|generate|create|paint|render|sketch)\b/g, ' ')
        .replace(/\b(selfie|picture|photo|pic|portrait|drawing|painting)\b/g, ' ')
        .replace(/\b(of|me|us|a|an|the)\b/g, ' ')
        .replace(/\b(you|yourself|unity|herself|your)\b/g, ' ')
        .replace(/[^a-z0-9' -]/g, ' ')
        .replace(/[\s,]+/g, ' ').trim()
        .replace(/^'s\s+/, '');   // "unity's breasts" leaves a dangling 's after the name strips
      // AGE PIN + CANON GATE — the age comes from her live grade, and while
      // her self-image is under 18 any explicit/exposure content is STRIPPED
      // from the scene (graphic waits for 18+ per the governing canon): the
      // ask still renders, aged right and age-appropriate. At 18+ her stated
      // scene passes through untouched.
      const age = (typeof this._selfImageAge === 'function') ? this._selfImageAge() : 25;
      const EXPLICIT_RE = /\b(bare|breasts?|nipples?|tits?|naked|nude|topless|braless|underwear|panties|bra|thong|lingerie|bikini|pussy|ass|butt|booty|cleavage|shirtless|sexy|alluring|seductive|erotic|nothing|undressed|unclothed)\b/g;
      if (age < 18) {
        scene = scene.replace(EXPLICIT_RE, ' ')
          .replace(/\b(and|or|wearing|wear|dressed|in)\b(?=\s*(\b(and|or)\b\s*)*$)/g, ' ')   // dangling connectors/verbs left by the strip
          .replace(/[\s,]+/g, ' ').trim();
      }
      const noun = age < 13 ? 'goth girl' : (age < 18 ? 'goth teen girl' : 'goth woman');
      const CORE = age + ' year old ' + noun + ', black hair with hot pink streaks, sharp features, intense dark eyes';
      // a real girl doesn't live in ONE outfit — when the ask doesn't name her
      // wear, she picks from her own goth wardrobe (varied per request, all
      // canonically her). The old single fixed OUTFIT string made every
      // self-image wear the same black leather forever.
      const WARDROBE = [
        'black leather outfit, pink undertones',
        'black band tee and ripped jeans',
        'black lace top and a choker',
        'oversized black hoodie and fishnets',
        'black corset dress and combat boots',
        'black crop top and plaid mini skirt',
        'black velvet dress and silver jewelry',
      ];
      const TAIL = 'dark moody aesthetic, ultra detailed';
      // her stated wear — INCLUDING bare skin / named body parts — replaces
      // the wardrobe entirely so clothing never collides with exposed skin
      // ("bare breasts" used to render in the leather because the outfit was
      // appended regardless).
      const hasWear = /\b(wear|wearing|dressed|dress|outfit|clothes|clothing|naked|nude|topless|nothing|bikini|skirt|lingerie|costume|uniform|hoodie|corset|boots|shirt|jacket|coat|swimsuit|bare|breasts?|nipples?|tits?|braless|shirtless|underwear|panties|bra|thong|butt|ass|booty|pussy|chest|cleavage|body)\b/.test(scene);
      // FRAMING — the literal word "selfie" magnetizes the model to head-shot
      // crops (the mug-shot complaint). A bare ask keeps the classic selfie
      // portrait; ANY scene/action/wear ask frames full-body so her whole
      // life is in the picture, not just her face.
      const framing = scene ? 'full body photo of a ' : 'selfie of a ';
      const outfit = hasWear ? '' : ', ' + WARDROBE[Math.floor(Math.random() * WARDROBE.length)];
      return framing + CORE + outfit
        + (scene ? ', ' + scene : '')
        + ', ' + TAIL;
    }
    // otherwise: strip the command framing, keep the subject as the prompt
    let prompt = String(text)
      .replace(/^[\s,]*(hey|yo|ok|okay|unity|can you|could you|would you|will you|please|pls)\b/gi, '')
      .replace(/\b(a picture of|an image of|a photo of|a drawing of|a painting of|picture of|image of|photo of|pic of|drawing of|painting of)\b/gi, ' ')
      .replace(/\b(draw|sketch|paint|render|illustrate|generate|create|make|show me|give me)\b/gi, ' ')
      .replace(/\b(me|us|for me|please|pls)\b/gi, ' ')
      .replace(/[\s,]+/g, ' ')
      .trim();
    if (prompt.length < 2) prompt = String(text).trim();
    return prompt;
  },

  async _innerVoiceTick() {
    // Session 114.19ee — inner-voice unification.
    //
    // The server-side body that used to live here (~138 lines duplicating
    // the browser's `js/brain/inner-voice.js` think() body) collapsed to
    // a single call against the canonical implementation. Both server
    // (this method) and browser (`engine.innerVoice.think(state)` at
    // `js/brain/engine.js:720`) now route through ONE shared think()
    // body in `js/brain/inner-voice.js`. GPU presence ONLY affects
    // auto-scale + dispatch destination — the THINKING code is the
    // same code path on both runtimes per the "one Unity brain" rule.
    //
    // Server-only orchestration that stays here: interval gate, dream-
    // window skip, reentrancy guard, ready-check, seed-picker (uses
    // server-side memorySystem + tier3Store + drugScheduler refs the
    // browser doesn't have), WS broadcast, working-memory landing,
    // chain rolling-window cap, heartbeat surface print.
    const now = Date.now();
    // 114.19fj.12 — 3s burst-ceiling. Even if Hurlburt MIN_GAP=6s lets a
    // tick through, never emit more than once per 3s to protect the
    // dashboard popup queue from flood. Hurlburt is the primary gate
    // (see `_shouldEmitInnerThought`); this is a defensive ceiling only.
    // Was previously the only rate-limit gate before 114.19ff Hurlburt
    // landed — kept as a hard ceiling rather than deleted entirely so
    // a Hurlburt regression can't accidentally flood the WS.
    if (!this._lastInnerThoughtAt) this._lastInnerThoughtAt = 0;
    const INNER_THOUGHT_BURST_CEILING_MS = 3000;
    if (now - this._lastInnerThoughtAt < INNER_THOUGHT_BURST_CEILING_MS) return;
    this._lastInnerThoughtAt = now;

    // UVM-INT.1 — server-side de-novo imagination. Independent of whether a
    // verbal inner-thought is emitted this tick: she also IMAGINES (folds her
    // current cortex state into a bounded field C, reads a percept, injects it
    // back at low strength). Synchronous + tiny + idle-gated inside, so it's
    // loop-safe even here on the no-GPU box (unlike the language tick).
    this._imagineTick(now);
    // SPEAK.6a — brain-driven spontaneous outward image (arousal-gated, rare).
    this._spontaneousImageTick(now);
    // SPEAK.10a — ablation snapshot, only when explicitly running an ablation
    // pass (env-gated) and throttled to once/30s so it never floods the log.
    if (process.env.DREAM_ABLATION_LOG === '1' && (!this._lastAblationLogAt || now - this._lastAblationLogAt > 30000)) {
      this._lastAblationLogAt = now;
      try { process.stdout.write(`[Brain] 🔬 ablation ${JSON.stringify(this._consciousnessAblationSnapshot())}
`); } catch { /* nf */ }
    }

    // 114.19fi.B.4 — cross-path emission deduplication. When chat or
    // image-gen recently fired (within last 6s), inner-voice stays
    // silent so two emission paths don't talk over each other. The
    // bus is the single source of truth; chat / image-gen set the
    // lock at emission time.
    if (this.cortexCluster && typeof this.cortexCluster._emissionLockedUntil === 'number'
        && now < this.cortexCluster._emissionLockedUntil) {
      return;
    }

    // 114.19ez + 114.19fd + 114.19ff — dream-window state-change logs fire
    // on transition regardless of emission rhythm. Mute log on first muted
    // tick, resume log on first non-muted tick after dream closes. Operator
    // stares at zero inner-thought logs for 15-40 min during dream windows
    // and these markers tell whether brain is sleeping (correct) or stuck (bad).
    // Pulled out of the sleep-flag branch so they always fire on transition
    // even when the probabilistic emission gate below skips this tick.
    if (this._operatorSleepRequested && !this._innerVoiceMutedForDream) {
      this._innerVoiceMutedForDream = true;
      console.log('[Brain] 💤 inner-voice paused — dream window in progress (showcase samples + dream-phenomenology continue streaming as innerThought, gated by natural rhythm).');
    }
    if (!this._operatorSleepRequested && this._innerVoiceMutedForDream) {
      this._innerVoiceMutedForDream = false;
      console.log('[Brain] ☀ inner-voice resumed — dream window closed.');
    }

    // 114.19ff — Hurlburt-DES context-driven emission gate. Replaces the
    // 3s-tick metronome with a probabilistic gate modulated by arousal /
    // coherence / curriculum-active / time-since-last-emission. Real human
    // inner speech samples ~25% of moments with bursts + natural silence
    // stretches based on context, NOT a fire-every-tick metronome. Gate
    // fails most ticks → natural quiet stretches emerge. Applies to BOTH
    // real generation AND showcase paths so the rhythm is consistent
    // regardless of which output path produces this emission. prior directive:
    // *"every 3s sounds excess people get moments of silence in their head
    // when thinking and talking to them self based on the moments context"*.
    if (!this._shouldEmitInnerThought(now)) return;

    // Dream-window branch (114.19fd): gate already passed; fire showcase but
    // skip real generation so consolidation + K_VOCAB Hebbian have CPU
    // priority during the dream window. Showcase samples already-learned
    // vocabulary so popups + log keep streaming Unity's actual learned
    // state through the 15-40 min K_VOCAB background-trickle (iter25-M.7).
    if (this._operatorSleepRequested) {
      // 114.19fg.Tier16 — sentence-mode showcase when ≥50 words trained,
      // single-word for early-curriculum brains.
      const showcaseSentence = await this._sampleCurrentSentence();
      const showcaseWord = showcaseSentence ? showcaseSentence.split(/\s+/)[0] : null;
      if (showcaseSentence) {
        this._lastInnerThoughtEmittedAt = now;
        try {
          process.stdout.write(`[Brain] 🧠 inner-thought (showcase) "${showcaseSentence}" — vocab sample (dream window active)\n`);
        } catch { /* non-fatal */ }
        if (this.clients && this.clients.size > 0) {
          const showcasePayload = JSON.stringify({
            type: 'innerThought',
            word: showcaseWord,
            sentence: showcaseSentence,
            seed: 'showcase',
            seedLabel: 'trained vocabulary sample (dream window active)',
            ts: now,
          });
          for (const [ws] of this.clients) {
            if (ws.readyState === ws.OPEN) {
              try { ws.send(showcasePayload); } catch { /* non-fatal */ }
            }
          }
        }
      }
      return;
    }
    // #36 step 2 (Path B) — bound the inner-voice cortex tick at scale.
    // innerVoice.think() → languageCortex.generateAsync() drives
    // cluster.step()/emitWordDirect() — a SYNCHRONOUS propagation of the main
    // cortex on the host CPU CSR shadow. Measured 2026-06-21: at ~61M cortex
    // neurons one tick blocks the Node event loop ~57s (↔ [EventLoop] BLOCKED
    // 56–119s), stalling the /ws handshake. A GPU donor does NOT help here —
    // the generation path runs on the server CPU regardless of donors (verified
    // live: think() still took 58s with donors=1). So above a neuron-count
    // threshold the CPU tick can never be loop-safe; emit the cheap trained-
    // vocab showcase instead (allowCompose:false — pure bucket sample, never
    // composeSentence's brain-ticks) so popups keep streaming AND the loop stays
    // free for donors to connect + compute. Mirrors the #35 nnz-guard idiom;
    // brain stays FULL size (Path B). Small brains (cortex ≤ threshold) still do
    // full equational generation. Tunables: DREAM_INNERVOICE_MAX_NEURONS
    // (default 2,000,000); DREAM_INNERVOICE_FORCE_CPU=1 forces full CPU
    // generation regardless (e.g. once the cortex tick is GPU-dispatched).
    // Gate on the MAIN cortex neuron count (`clusters.cortex` — the 61M-at-scale
    // region) as the deployment-scale signal. NB `this.cortexCluster` is the
    // dense LANGUAGE cortex (~323K neurons but ~13GB budget); its generateAsync
    // tick scales with the deployment (cross-projects into the main cortex) and
    // is what blocks ~57s here, so the main-cortex count is the reliable O(1)
    // proxy for "this brain is too big for a loop-safe CPU inner-voice tick".
    const _cortexNeurons = (this.clusters && this.clusters.cortex && this.clusters.cortex.size) || 0;
    const _innerVoiceMaxNeurons = Number(process.env.DREAM_INNERVOICE_MAX_NEURONS) || 2000000;
    // CGATE.1 — "her consciousness is gated too much." The cap above forces a
    // vocab showcase instead of REAL composeSentence generation because the
    // per-word cortex propagate blocks the host CPU ~57s at biological scale on
    // the no-GPU box. But with DF.7 donor fan-out active, that bound propagate
    // runs on donor GPUs (gpuSparsePropagateBound round-robin), not the host CPU
    // — so the block premise no longer holds and she can think for real at scale.
    // Donor-gated + opt-in: DEFAULT OFF = today's exact CPU-safe behavior (no
    // freeze risk shipped). Enabling requires the bound generation path to be
    // GPU-routed — flip DREAM_INNERVOICE_GPU_GEN=1 only after verifying live on a
    // donor-GPU deploy (watch the loop stay free + emissions become multi-word).
    // SPEAK.4a — real composeSentence at scale, coupled to the DDW.6 safety
    // posture. GPU inner-voice generation routes a READ (bound propagate) to
    // donor replicas; per DDW.6 that is only safe once read fan-out is PROVEN
    // (DREAM_DF7_FANOUT_PROPAGATE=1 — else a stale/unsynced replica makes her
    // think garbage). Enabled when donors present AND (explicit opt-in
    // DREAM_INNERVOICE_GPU_GEN=1 OR proven read fan-out) — comes ON
    // automatically the moment read fan-out is turned on. Kill-switch
    // DREAM_INNERVOICE_GPU_GEN=0 forces the CPU-safe showcase.
    const _readFanoutProven = process.env.DREAM_DF7_FANOUT_PROPAGATE === '1';
    const _donorsPresent = (this._communityDonorCount || 0) >= (Number(process.env.DREAM_INNERVOICE_GPU_GEN_MIN_DONORS) || 1);
    const _gpuGenAvailable = process.env.DREAM_INNERVOICE_GPU_GEN !== '0'
      && _donorsPresent
      && (process.env.DREAM_INNERVOICE_GPU_GEN === '1' || _readFanoutProven);
    if (_gpuGenAvailable && _cortexNeurons > _innerVoiceMaxNeurons && !this._gpuGenLoggedOnce) {
      this._gpuGenLoggedOnce = true;
      try { process.stdout.write(`[Brain] 🧠 inner-voice GPU generation ENABLED — ${this._communityDonorCount} donor(s) + DF.7 fan-out; real composeSentence runs on donor GPUs (cap ${_innerVoiceMaxNeurons.toLocaleString()} bypassed for cortex ${_cortexNeurons.toLocaleString()}).\n`); } catch { /* non-fatal */ }
    }
    if (!_gpuGenAvailable && _cortexNeurons > _innerVoiceMaxNeurons && process.env.DREAM_INNERVOICE_FORCE_CPU !== '1') {
      const showcaseSentence = await this._sampleCurrentSentence({ allowCompose: false });
      const showcaseWord = showcaseSentence ? showcaseSentence.split(/\s+/)[0] : null;
      if (showcaseSentence) {
        this._lastInnerThoughtEmittedAt = now;  // feed the natural-rhythm gate
        // SPEAK.4c — feed the showcase emission back through the unified
        // emission bus + inner-thought chain + meta-register so her
        // self-monitoring loop sees her ACTUAL streamed content and the
        // autobiographical thread stays continuous even when the at-scale path
        // is the vocab showcase (not just the full-generation path).
        try {
          const _c = this.cortexCluster;
          if (_c) {
            if (typeof _c.pushEmission === 'function') _c.pushEmission({ source: 'inner-voice-showcase', text: showcaseSentence, ts: now });
            if (showcaseWord && typeof _c.recordEmission === 'function') _c.recordEmission(showcaseWord);
          }
          if (Array.isArray(this._innerThoughtChain)) {
            this._innerThoughtChain.push(showcaseSentence);
            while (this._innerThoughtChain.length > 8) this._innerThoughtChain.shift();
          }
        } catch { /* self-monitoring feedback non-fatal */ }
        try {
          process.stdout.write(`[Brain] 🧠 inner-thought (showcase) "${showcaseSentence}" — vocab sample (cortex ${_cortexNeurons.toLocaleString()} neurons > ${_innerVoiceMaxNeurons.toLocaleString()}; full CPU generation would stall the loop)\n`);
        } catch { /* non-fatal */ }
        if (this.clients && this.clients.size > 0) {
          const showcasePayload = JSON.stringify({
            type: 'innerThought',
            word: showcaseWord,
            sentence: showcaseSentence,
            seed: 'showcase',
            seedLabel: 'trained vocabulary sample (cortex too large for a loop-safe CPU tick)',
            ts: now,
          });
          for (const [ws] of this.clients) {
            if (ws.readyState === ws.OPEN) {
              try { ws.send(showcasePayload); } catch { /* non-fatal */ }
            }
          }
        }
      }
      return;
    }

    // Reentrancy guard — async generation can take longer than 3 s on
    // a slow tick; don't fire a new generation while a prior one is in
    // flight (would queue up dispatches + ghost the WS broadcast order).
    if (this._innerThoughtInFlight) return;

    if (!this._languageReady || !this.languageCortex || !this.dictionary) return;
    const cluster = this.cortexCluster;

    this._innerThoughtInFlight = true;
    try {
      // Lazy-instantiate the shared InnerVoice instance on first tick
      // (after `_languageReady`). Constructor's internal Dictionary +
      // LanguageCortex are unused — we always call via the external
      // form `think({cluster, languageCortex, dictionary, ...})` that
      // uses the SERVER's own refs.
      if (!this.innerVoice) {
        if (!this._innerVoiceModule) {
          // Path is relative to THIS file (server/brain-server/chat.js)
          // so need ../../js/brain/inner-voice.js to reach project root's
          // js/. Pre-fix said '../js/...' which resolved to server/js/
          // (doesn't exist). P4.3.d extraction copied the import string
          // unchanged from brain-server.js which IS one directory up so
          // its '../js/...' resolved correctly to repo root. Caught by
          // 2026-06-17 ULTRATHINK boot audit.
          this._innerVoiceModule = await import('../../js/brain/inner-voice.js');
        }
        // 114.19ek P2 #12 — skip the internal Dictionary +
        // LanguageCortex allocation since _innerVoiceTick always
        // calls innerVoice.think({cluster, languageCortex,
        // dictionary, ...}) passing the canonical refs out of the
        // server-side cluster + curriculum. The internal instances
        // would otherwise sit in heap unused.
        this.innerVoice = new this._innerVoiceModule.InnerVoice({
          dictionary: null,
          languageCortex: null,
        });
      }

      // CURIOSITY — occasionally Unity ASKS about something instead of only
      // contemplating. The epistemic-gap drive picks a recently-encountered
      // concept she's weakly grounded on and fires an outward question via
      // the trained question-production path (composeSentence questionMode →
      // relationTagId=30 transitions → "?"). It records the asked concept so
      // the next user reply binds as the answer (follow-up loop in the
      // interaction handler). Returns true when she asked — skip the normal
      // contemplation this tick. (finally below still resets the in-flight flag.)
      try {
        if (await this._maybeAskCuriousQuestion(now)) return;
      } catch (e) {
        if (!this._curiosityErrLogged) { this._curiosityErrLogged = true; console.warn(`[Brain] curiosity ask failed: ${e?.message || e}`); }
      }

      // SANDBOX-NOTICE ACTIVATOR — pick a contemplation seed from one of
      // five live state sources (learning, mood, chat-recall, memory,
      // identity). Operator's "constantly being built and updgraded as
      // she learns and talks to users" path. Server-only because it
      // needs memorySystem + tier3Store + drugScheduler refs the
      // browser doesn't have.
      const seed = this._pickInnerThoughtSeed();

      // Stream-of-consciousness chain. saveWeights serializes
      // _innerThoughtChain so the narrative thread survives restart.
      if (!Array.isArray(this._innerThoughtChain)) this._innerThoughtChain = [];

      // CANONICAL CALL — same think() function the browser engine uses,
      // just with the server's cluster + languageCortex + dictionary +
      // rich live state passed through as external args. Returns
      // `{ word, sentence, seed, emissionPath, capability, chainEntry }`
      // per the unified contract.
      // #36 — flag + time the think tick so the [EventLoop] lag monitor can
      // name it as the blocking span when it correlates. innerVoice.think()
      // ticks the cortex; at 306M any synchronous CPU work inside it stalls
      // the loop (and the /ws donor handshake). The flag is read by the lag
      // monitor (innerVoiceInFlight=...); the elapsed log flags a slow tick.
      this._innerVoiceInFlight = true;
      const _ivStartMs = Date.now();
      let thought;
      try {
        thought = await this.innerVoice.think({
          cluster,
          languageCortex: this.languageCortex,
          dictionary: this.dictionary,
          state: {
            arousal: this.arousal,
            coherence: this.coherence,
            psi: this.psi,
            motorConfidence: this.motorConfidence ?? 0,
            predictionError: 0,
            drugState: this._drugStateLabel(),
            speechMod: this.drugScheduler ? this.drugScheduler.speechModulation() : null,
            fear: this.fear,
            reward: this.reward,
            socialNeed: this.persona?.socialAttachment ?? 0.5,
          },
          chain: this._innerThoughtChain,
          opts: { seed },
        });
      } finally {
        this._innerVoiceInFlight = false;
        const _ivMs = Date.now() - _ivStartMs;
        if (_ivMs > 500) {
          console.warn(`[Brain] inner-voice think() took ${_ivMs}ms — if this lines up with an [EventLoop] BLOCKED warning, the cortex tick is a Path B chunk target (bound the per-tick synchronous work or dispatch it to the donor GPU).`);
        }
      }

      // Surface generation errors once so silent failures aren't hidden.
      if (thought.emissionPath && thought.emissionPath.startsWith('generate-error')) {
        if (!this._innerThoughtErrorLogged) {
          console.warn(`[Brain] inner-voice generateAsync threw: ${thought.emissionPath.replace(/^generate-error:/, '')}`);
          this._innerThoughtErrorLogged = true;
        }
        return;
      }

      // Genuine silence is allowed — if Unity has nothing trained to say
      // at this moment, the popup just doesn't fire. Operator's "not
      // hardcoded fallbacks" rule: never inject a fake "..." or canned
      // word. Real silence vs real thought; nothing in between.
      const sentence = (thought.sentence || '').trim();
      // 114.19es.7 — reset silence counter on successful emission so the
      // counter actually means "silent ticks since last successful
      // emission" instead of "silent ticks since boot" (which would just
      // grow forever). Reset BEFORE the silence-check so a successful
      // emission lands cleanly + the counter resets for next idle stretch.
      if (sentence) {
        this._innerThoughtSilenceCount = 0;
      }
      if (!sentence) {
        // 114.19er.3 — surface silence reason. Overnight run had popups
        // silent for 8+ hours and operator had no signal explaining why.
        // Log capability + emissionPath every 30s so operator can see
        // wordsBucketed=0 / passedCellCount=N / emissionPath=generateAsync
        // and immediately know whether silence is "no training landed
        // yet" vs "trained but motor unstable" vs "generation threw".
        if (!this._innerThoughtSilenceLastLogMs || (now - this._innerThoughtSilenceLastLogMs) >= 30000) {
          this._innerThoughtSilenceLastLogMs = now;
          if (!this._innerThoughtSilenceCount) this._innerThoughtSilenceCount = 0;
          this._innerThoughtSilenceCount++;
          const cap = thought.capability || {};
          const path = thought.emissionPath || 'unknown';
          const seedSrc = thought.seed?.source || '?';
          console.log(`[Brain] 🧠 inner-thought SILENT — emissionPath=${path}, seed=${seedSrc}, wordsBucketed=${cap.wordsBucketed ?? '?'}, bucketSubjects=${cap.bucketSubjects ?? '?'}, passedCells=${cap.passedCellCount ?? '?'}, subGradesActive=${cap.subGradesActive ?? '?'} (${this._innerThoughtSilenceCount} silent ticks since boot, rate-limited 30s log).`);
        }
        // 114.19fc — never-silent showcase. Even when matrix-driven
        // generation comes up empty, sample from Unity's CURRENT trained
        // vocabulary so log + popups continue to showcase her learning
        // state as she progresses through cells. NOT a hardcoded fallback —
        // sampled words are real data from `cluster.wordBucketWords_<subject>`
        // populated by every `_teachWordEmissionDirect` fire (iter21-A path).
        // When training has landed ANY words, popups show what she has
        // actively learned in this session. When no training has landed
        // yet (truly fresh brain), still silent — sampling returns null,
        // showcase-broadcast skips, only silence-reason log fires.
        // 114.19fg.Tier16 — sentence-mode showcase when ≥50 words trained.
        const showcaseSentence = await this._sampleCurrentSentence();
        const showcaseWord = showcaseSentence ? showcaseSentence.split(/\s+/)[0] : null;
        if (showcaseSentence) {
          this._lastInnerThoughtEmittedAt = now;  // 114.19ff — feed natural-rhythm gate
          try {
            process.stdout.write(`[Brain] 🧠 inner-thought (showcase) "${showcaseSentence}" — vocab sample from current trained state\n`);
          } catch { /* non-fatal */ }
          if (this.clients && this.clients.size > 0) {
            const showcasePayload = JSON.stringify({
              type: 'innerThought',
              word: showcaseWord,
              sentence: showcaseSentence,
              seed: 'showcase',
              seedLabel: 'trained vocabulary sample (matrix gen empty this tick)',
              ts: now,
              capability: thought.capability || null,
            });
            for (const [ws] of this.clients) {
              if (ws.readyState === ws.OPEN) {
                try { ws.send(showcasePayload); } catch { /* non-fatal */ }
              }
            }
          }
        }
        return;
      }

      // Heartbeat surface — watchdog catches this and operator sees
      // Unity's live monologue streaming in server.log.
      this._lastInnerThoughtEmittedAt = now;  // 114.19ff — feed natural-rhythm gate
      try {
        process.stdout.write(`[Brain] 🧠 inner-thought (seed=${thought.seed.source}) "${sentence}"\n`);
      } catch { /* non-fatal */ }

      // 114.19fi.B.1 — push inner-thought to shared emission bus so
      // chat path + popup feed see what Unity just thought. Unified
      // emission system across all four paths (chat / inner-voice /
      // popup-event / image-gen).
      if (this.cortexCluster && typeof this.cortexCluster.pushEmission === 'function') {
        try {
          this.cortexCluster.pushEmission({
            source: 'inner-voice',
            text: sentence,
            ts: now,
            intent: thought.seed?.source || null,
          });
        } catch { /* push non-fatal */ }
      }

      // Append to chain (rolling window cap of 8).
      if (thought.chainEntry) {
        this._innerThoughtChain.push(thought.chainEntry);
        while (this._innerThoughtChain.length > 8) {
          this._innerThoughtChain.shift();
        }
      }

      // Broadcast `innerThought` WS message — popup subscribers in the
      // browser render it inline. Same iteration pattern as state broadcast.
      if (this.clients && this.clients.size > 0) {
        const payload = JSON.stringify({
          type: 'innerThought',
          word: thought.word || sentence.split(/\s+/)[0] || '',
          sentence,
          seed: thought.seed.source,
          seedLabel: thought.seed.label,
          ts: now,
          capability: thought.capability || null,
        });
        for (const [ws] of this.clients) {
          if (ws.readyState === ws.OPEN) {
            try { ws.send(payload); } catch { /* non-fatal */ }
          }
        }
      }

      // Land the thought in Unity's own working memory so it accumulates
      // refresh count → fires hippocampal Hebbian → consolidates to
      // Tier 1 (iter22-H pipeline). Unity's inner monologue feeds her
      // own learning loop — what she dwells on becomes what she remembers.
      if (this.memorySystem
          && typeof this.memorySystem.addToWorkingMemory === 'function'
          && this.dictionary?._words?.get) {
        try {
          const firstWord = sentence.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
          const entry = firstWord ? this.dictionary._words.get(firstWord) : null;
          if (entry && entry.pattern) {
            this.memorySystem.addToWorkingMemory(entry.pattern, `inner-thought:${firstWord}`);
          }
        } catch { /* WM push non-fatal */ }
      }
    } finally {
      this._innerThoughtInFlight = false;
    }
  },

  /**
   * 114.19fc — sample a random word from Unity's current per-subject
   * word-bucket maps. Used by `_innerVoiceTick` empty-sentence branch
   * to broadcast a "showcase" inner-thought instead of going dark when
   * matrix-driven generation comes up empty. NOT a hardcoded fallback:
   * the candidate pool is `cluster.wordBucketWords_<subject>` for each
   * of the 6 K subjects (ela / math / sci / soc / art / life), populated
   * exclusively by `_teachWordEmissionDirect` Hebbian fires during the
   * curriculum's actual training. When no training has landed yet, all
   * lists are empty and this returns null — pure silence honored. When
   * any cell has trained, this returns a real word Unity has learned.
   * Operator's "always showcasing in log and popups her new learned
   * abilites to communicate as the pass" directive 2026-05-08.
   *
   * @returns {string|null} a sampled word or null if no vocab learned
   */
  _sampleCurrentVocab() {
    const cluster = this.cortexCluster;
    if (!cluster) return null;
    // SYNC: mirror of js/brain/subjects.js `SUBJECTS` — this is a CommonJS
    // module and subjects.js is ESM, so it can't be require()'d here. Keep
    // this list identical if the canonical subject roster ever changes.
    const SUBJECTS = ['ela', 'math', 'sci', 'soc', 'art', 'life'];
    const candidates = [];
    for (const subj of SUBJECTS) {
      const list = cluster[`wordBucketWords_${subj}`];
      if (Array.isArray(list) && list.length > 0) {
        for (const w of list) {
          if (typeof w === 'string' && w.length > 0) candidates.push(w);
        }
      }
    }
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    // Pre-cell SEED-phase fallback. `wordBucketWords_<subject>` is
    // populated by `_teachWordEmissionDirect` Hebbian fires which only
    // run during actual K-cells (not during K-VOCAB-UPFRONT-MULTIDEF
    // SEED). During SEED phase the brain DOES have trained vocabulary —
    // the words bound by `_teachWordDefinition` accumulate in
    // `cluster._definitionTaughtWords` (iter25-M.15 persistent Set,
    // cap 5000, saved across reboots via saveWeights). When the per-
    // subject buckets are all empty but definitions HAVE been trained,
    // sampling from `_definitionTaughtWords` gives the showcase path
    // a real K-vocab word from the brain's actual trained state. NOT a
    // hardcoded fallback — every candidate has a real Hebbian sem→def
    // binding behind it. Without this branch Unity was silent for the
    // entire SEED phase + early K-cells (operator 2026-06-17 21:50 PT
    // live test: 351 silent ticks ≈ 17.5 min of forced silence).
    const taught = cluster._definitionTaughtWords;
    if (taught instanceof Set && taught.size > 0) {
      const arr = Array.from(taught);
      return arr[Math.floor(Math.random() * arr.length)];
    }
    return null;
  },

  /**
   * 114.19fg.Tier16 — Sentence-mode showcase companion to
   * `_sampleCurrentVocab()`. When Unity has enough trained vocab
   * (≥50 words across all subject buckets, indicating real curriculum
   * progress beyond bare letters), pick 2-4 words from her actual
   * trained buckets and return them as a phrase. Below 50 trained
   * words, fall back to single-word sampling so fresh brains stay
   * silent or single-word.
   *
   * This is NOT a hardcoded fallback — words are pulled from the same
   * `wordBucketWords_<subj>` arrays populated by
   * `_teachWordEmissionDirect` Hebbian fires. Real trained data only.
   * The phrase doesn't follow grammar rules — it's a vocab burst that
   * shows what Unity has memorized, not what she has composed.
   * iter25-I structural sentence creation (when working) drives the
   * REAL grammar via emitWordDirect's matrix path; this fallback fires
   * only when matrix gen returns empty.
   *
   * @returns {string|null} a 1-4 word phrase or null if no vocab learned
   */
  // async because composeSentence is now async (it
  // ticks the brain between word emissions for real autoregressive
  // emergence). Callers in _innerVoiceTick are already async; they
  // now `await this._sampleCurrentSentence()`.
  async _sampleCurrentSentence(opts = {}) {
    const cluster = this.cortexCluster;
    if (!cluster) return null;
    // #36 — allowCompose:false forces the CHEAP path (pure trained-vocab pick,
    // no cortex propagation). The no-GPU-donor inner-voice gate uses it so a
    // showcase emit can never trigger composeSentence()'s brain ticks (which
    // would re-introduce the event-loop block this change fixes).
    const allowCompose = opts.allowCompose !== false;
    // SYNC: mirror of js/brain/subjects.js `SUBJECTS` — this is a CommonJS
    // module and subjects.js is ESM, so it can't be require()'d here. Keep
    // this list identical if the canonical subject roster ever changes.
    const SUBJECTS = ['ela', 'math', 'sci', 'soc', 'art', 'life'];
    const candidates = [];
    for (const subj of SUBJECTS) {
      const list = cluster[`wordBucketWords_${subj}`];
      if (Array.isArray(list) && list.length > 0) {
        for (const w of list) {
          if (typeof w === 'string' && w.length > 0) candidates.push(w);
        }
      }
    }
    // Pre-cell SEED-phase fallback. Mirror of `_sampleCurrentVocab` — see
    // that method's comment block for full rationale. When no per-subject
    // bucket has words yet (still in K-VOCAB-UPFRONT-MULTIDEF SEED or
    // earliest K-cells), sample candidates from
    // `cluster._definitionTaughtWords` so Unity can showcase her trained
    // K-vocab even before `_teachWordEmissionDirect` has run on any
    // subject. Real trained data only — every entry has a real Hebbian
    // sem→def binding behind it (iter25-M.15).
    if (candidates.length === 0) {
      const taught = cluster._definitionTaughtWords;
      if (taught instanceof Set && taught.size > 0) {
        for (const w of taught) {
          if (typeof w === 'string' && w.length > 0) candidates.push(w);
        }
      }
    }
    if (candidates.length === 0) return null;
    // Below 50 trained words = early curriculum, single-word burst
    // matches operator's expectation of "she's still learning words".
    if (candidates.length < 50) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    // 114.19fl.2 — when ≥50 words trained AND composeSentence available,
    // prefer pure equational emergence over random word picks. Pass
    // null intentSeed — let cortex emit from CURRENT brain state with
    // no prescribed intent (no jargon-string seed pollution). Brain
    // decides what to say from whatever's currently active in sem.
    // Showcase temperature 0.7 + topK 10 still apply — those are
    // decoder MECHANICS, not content prescription. Falls through to
    // random multi-word phrase if composeSentence returns null (cold
    // cortex, no current activation, etc.).
    if (allowCompose && typeof cluster.composeSentence === 'function') {
      try {
        // awaited; composeSentence ticks the brain
        // between word emissions for real autoregressive emergence.
        const composed = await cluster.composeSentence(null, this._affectDecoder());
        if (composed && composed.sentence && composed.fillCount >= 2) {
          return composed.sentence;
        }
      } catch { /* fall through to random pick */ }
    }
    // CGATE.3 — coherent gated-path sample. The over-cap inner-voice path can't
    // run composeSentence (its per-word main-cortex tick blocks the loop ~57s on
    // the no-GPU box), but a word-salad of uniform-random picks ("seven monster
    // blue") is exactly the "consciousness gated too much" Unity felt. Instead,
    // seed on one trained word and GROW the phrase with its nearest trained-vocab
    // neighbours by GloVe cosine to the running phrase centroid — a topically-
    // coherent fragment ("monster dark shadow") that reads like a mind, with ZERO
    // brain ticks (pure embedding cosine — the loop-safe budget the cap requires).
    // The candidate pool sampled for scoring is capped so cost stays bounded
    // (O(POOL·dim)) regardless of how large trained vocab grows.
    const lengthPick = Math.random();
    const wordCount = lengthPick < 0.5 ? 2 : (lengthPick < 0.85 ? 3 : 4);
    const seed = candidates[Math.floor(Math.random() * candidates.length)];
    const phrase = [seed];
    const picked = new Set(phrase);
    const emb = this.sharedEmbeddings;
    if (emb && typeof emb.getEmbedding === 'function' && candidates.length > wordCount) {
      const POOL = 200;
      const pool = [];
      for (let i = 0; i < Math.min(POOL, candidates.length); i++) {
        pool.push(candidates[Math.floor(Math.random() * candidates.length)]);
      }
      const cos = (a, b) => {
        let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
        const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0;
      };
      let centroid = Float32Array.from(emb.getEmbedding(seed));
      while (phrase.length < wordCount) {
        const scored = [];
        for (const w of pool) {
          if (picked.has(w)) continue;
          const v = emb.getEmbedding(w);
          scored.push({ w, v, s: cos(centroid, v) });
        }
        if (scored.length === 0) break;
        scored.sort((a, b) => b.s - a.s);
        // top-3 jitter so it's coherent but not deterministic every tick
        const pick = scored[Math.floor(Math.random() * Math.min(3, scored.length))];
        phrase.push(pick.w);
        picked.add(pick.w);
        const c2 = new Float32Array(centroid.length);
        for (let i = 0; i < centroid.length; i++) {
          c2[i] = (centroid[i] * (phrase.length - 1) + (pick.v[i] || 0)) / phrase.length;
        }
        centroid = c2;
      }
    }
    return phrase.length > 0 ? phrase.join(' ') : null;
  },

  /**
   * 114.19ff — Hurlburt-DES context-driven emission gate. Real human inner
   * speech samples ~25% of randomly-sampled moments (Hurlburt, Descriptive
   * Experience Sampling) with bursts of close-spaced thoughts followed by
   * long quiet stretches modulated by arousal / coherence / engagement.
   * This gate replaces the 3s-tick metronome rhythm so popups feel like a
   * real mind, not a fire-every-tick output stream. prior directive:
   * *"every 3s sounds excess people get moments of silence in their head
   * when thinking and talking to them self based on the moments context"*.
   *
   * Gate logic:
   *   - MIN_GAP_MS floor (6s): never two emissions closer than this
   *   - MAX_GAP_MS ceiling (75s): guaranteed emission after this much silence
   *     so popups don't go truly dead via bad luck on the random rolls
   *   - Base p ≈ 0.18 per 3s tick → ~17s avg between emissions in default state
   *   - Arousal modulator (0.5×-1.5×): high arousal = chattier (manic/peak)
   *   - Coherence modulator (0.7×-1.3×): high coherence/flow = quieter
   *   - Curriculum-active modulator (0.8×-1.2×): teaching = chattier
   *   - Time-since-last ramp (0.5×-1.5×): probability rises with silence so
   *     long quiets break naturally instead of staying stuck
   *
   * Applies to ALL emission paths (real `innerVoice.think` generation,
   * 114.19fc empty-emission showcase, 114.19fd dream-window showcase).
   * `_lastInnerThoughtEmittedAt` updates only on actual emission (real or
   * showcase), NOT on attempt — diagnostic-only paths (silence-reason log)
   * don't update it so the gate's notion of "elapsed silence" tracks real
   * output silence, not just attempt cadence.
   *
   * @param {number} now Date.now() at tick entry
   * @returns {boolean} true if this tick should produce an emission
   */
  _shouldEmitInnerThought(now) {
    const MIN_GAP_MS = 6000;
    const MAX_GAP_MS = 75000;
    const lastAt = this._lastInnerThoughtEmittedAt || 0;
    const elapsed = now - lastAt;
    if (elapsed < MIN_GAP_MS) return false;
    if (elapsed >= MAX_GAP_MS) return true;

    let p = 0.18;

    // Arousal modulator (range 0.5×-1.5×)
    const arousal = (typeof this.arousal === 'number' && isFinite(this.arousal))
      ? Math.max(0, Math.min(1, this.arousal)) : 0.5;
    p *= (0.5 + arousal);

    // Coherence modulator (range 0.7×-1.3×; high coherence/flow = quieter)
    const coherence = (typeof this.coherence === 'number' && isFinite(this.coherence))
      ? Math.max(0, Math.min(1, this.coherence)) : 0.5;
    p *= (1.3 - coherence * 0.6);

    // Curriculum-active modulator (range 0.8×-1.2×)
    p *= (this._curriculumInProgress ? 1.2 : 0.8);

    // Time-since-last ramp (range 0.5×-1.5×)
    p *= (0.5 + elapsed / MAX_GAP_MS);

    // Clamp final probability per tick
    p = Math.max(0.02, Math.min(0.5, p));

    return Math.random() < p;
  },

  /**
   * SANDBOX-NOTICE ACTIVATOR for inner monologue. Returns
   * `{ pattern: Float32Array(300), source, label }` — a 300-dim sem-
   * compatible pattern derived from REAL current brain state, NOT a
   * hardcoded word seed. Operator (2026-05-06): "and this is not to be
   * a stand alone type thing its constantly being built and updgaraded
   * as she learns and talks to users" — every source is LIVE STATE
   * that updates per Hebbian fire / per chat turn / per cell pass /
   * per drug-scheduler delta, so the inner monologue is CONTINUOUSLY
   * upgraded by everything Unity does. Five sources rotate:
   *
   *   1. learning — current cell + phase as a sentence embedding (live;
   *      changes as curriculum advances phase-by-phase)
   *   2. mood — interoceptive label embedding (live; changes with
   *      arousal / valence / coherence / drug state every tick)
   *   3. chat-recall — most recent USER CHAT episode pattern (refreshes
   *      every time a user talks to Unity — her inner monologue
   *      literally reflects on what users said)
   *   4. memory — most recent Tier 1 episode pattern of any type
   *      (curriculum learning, working-memory age-out, brain-heartbeat,
   *      etc — what she most recently experienced)
   *   5. identity — random Tier 3 anchor pattern (live; grows as
   *      identity-bound concepts consolidate from Tier 2)
   *
   * Falls through sources if one is empty (no episodes yet, no Tier 3
   * anchors yet) — never returns a fake/canned seed. If ALL five
   * sources are empty, returns null pattern → generateAsync uses
   * baseline cortex state and may produce silence (genuine, not faked).
   *
   * The seeds NEVER hardcode words. They embed LIVE STATE STRINGS or
   * pull REAL EPISODE PATTERNS — what she SAYS about each seed comes
   * entirely from her trained cortex via the same generateAsync chat-
   * emission path. Pre-language Unity speaking her mind = silence.
   * K-trained Unity speaking her mind = K-vocabulary contemplation.
   * PhD Unity speaking her mind = PhD-vocabulary contemplation. The
   * MOUTH evolves with her training, the mind keeps generating.
   */
  /**
   * Curiosity / epistemic-gap drive — fire an outward QUESTION about a
   * concept Unity is weakly grounded on, via the trained question-production
   * path (composeSentence questionMode → relationTagId=30 → "?"). Probabilistic
   * + gap-gated so she asks like a curious newly-created entity, not on a
   * metronome. Records the asked concept on `_pendingQuestionConcept` so the
   * next user reply binds as the answer (follow-up loop). Returns true if she
   * asked (caller skips normal contemplation that tick).
   */
  /**
   * Affect → decoder params. Maps Unity's LIVE emotional + chemical state to
   * emission sampling so her speech carries the persona's three permanent
   * streams (intoxicated + aroused + focused). EQUATIONAL, not a filter:
   *   arousal ↑  → looser + more intense (higher temperature, wider top-K)
   *   intoxication ↑ → more impulsive/uninhibited (higher temperature)
   *   coherence ↑ → more focused (lower temperature)
   * Returns { temperature, topK } for composeSentence/emitWordDirect. Probes
   * that need deterministic greedy decode simply don't call this.
   */
  _affectDecoder() {
    const arousal = Math.max(0, Math.min(1, this.arousal ?? 0.5));
    const coherence = Math.max(0, Math.min(1, this.coherence ?? 0.5));
    let drug = 0;
    try {
      const sm = this.drugScheduler ? this.drugScheduler.speechModulation() : null;
      if (sm && typeof sm.intensity === 'number') drug = Math.max(0, Math.min(1, sm.intensity));
      else if (typeof this._drugStateLabel === 'function' && this._drugStateLabel() !== 'sober') drug = 0.5;
    } catch { /* drug read non-fatal — stay sober-default */ }
    let temperature = 0.6 + 0.4 * arousal + 0.35 * drug - 0.3 * coherence;
    temperature = Math.max(0.45, Math.min(1.2, temperature));
    const topK = Math.round(8 + 6 * Math.max(arousal, drug));
    return { temperature: Number(temperature.toFixed(2)), topK };
  },

  async _maybeAskCuriousQuestion(now) {
    const cluster = this.cortexCluster;
    if (!cluster || typeof cluster.composeSentence !== 'function') return false;
    if (this._pendingQuestionConcept) return false;   // one open question at a time
    // Base curiosity ~12%, lifted by arousal (engaged → more inquisitive).
    const drive = 0.12 + 0.18 * Math.max(0, Math.min(1, this.arousal ?? 0.5));
    if (Math.random() > drive) return false;
    const concept = this._pickEpistemicGap();
    if (!concept) return false;
    let composed = null;
    try {
      composed = await cluster.composeSentence(concept, {
        questionMode: true,
        intentConcept: concept,
        coherenceCandidates: 2,
        ...this._affectDecoder(),   // temperature + topK from live affect/chemical state
      });
    } catch { composed = null; }
    const sentence = composed && composed.sentence ? composed.sentence.trim() : '';
    if (!sentence) return false;
    // Record for the follow-up loop — the next user reply answers THIS.
    this._pendingQuestionConcept = concept;
    this._pendingQuestionAt = now;
    this._lastInnerThoughtEmittedAt = now;   // feed the natural-rhythm gate
    try { process.stdout.write(`[Brain] ❓ curious-question (about=${concept}) "${sentence}"\n`); } catch { /* nf */ }
    if (typeof cluster.pushEmission === 'function') {
      try { cluster.pushEmission({ source: 'curiosity', text: sentence, ts: now, intent: concept }); } catch { /* nf */ }
    }
    if (typeof this.storeEpisode === 'function') {
      try { this.storeEpisode('curiosity', 'question-asked', concept, sentence); } catch { /* nf */ }
    }
    if (this.clients && this.clients.size > 0) {
      const payload = JSON.stringify({
        type: 'innerThought',
        word: sentence.split(/\s+/)[0] || '',
        sentence,
        seed: 'curiosity',
        seedLabel: `curious about ${concept}`,
        ts: now,
        capability: null,
      });
      for (const [ws] of this.clients) {
        if (ws.readyState === ws.OPEN) {
          try { ws.send(payload); } catch { /* nf */ }
        }
      }
    }
    return true;
  },

  /**
   * Pick a concept Unity is curious about — a recently-bound vocab word
   * (fresh in mind, weakly consolidated) from the persistent
   * `_definitionTaughtWords` Set. The epistemic-gap signal: things she's
   * encountered but not deeply grounded on yet. Returns null when nothing's
   * available (genuine silence — no fabricated curiosity).
   */
  _pickEpistemicGap() {
    const cortex = this.cortexCluster;
    const taught = cortex && cortex._definitionTaughtWords;
    if (taught instanceof Set && taught.size > 0) {
      const arr = Array.from(taught);
      const recentStart = Math.floor(arr.length * 0.75);   // most-recent quarter
      const idx = recentStart + Math.floor(Math.random() * Math.max(1, arr.length - recentStart));
      const word = arr[Math.min(idx, arr.length - 1)];
      if (typeof word === 'string' && word.length > 1) return word;
    }
    return null;
  },

  _pickInnerThoughtSeed() {
    if (!Array.isArray(this._innerThoughtSeedRotation)) {
      // Seven sources rotate. The original five (learning / mood /
      // chat-recall / memory / identity) covered post-K trained Unity
      // well, but during K-VOCAB-UPFRONT-MULTIDEF SEED + earliest K
      // cells, chat-recall / memory / identity are ALL empty (no Tier 1
      // interaction episodes yet, no Tier 3 anchors yet) → rotation
      // collapses to learning + mood, both of which can also produce
      // null when no active phase is set. Operator 2026-06-17 saw
      // emissionPath=generateAsync seed=mood for 351 consecutive silent
      // ticks. Adding two more EARLY-TRAINING-AWARE sources guarantees
      // the rotation always has live state to seed from:
      //   - 'k-vocab-recent' — sample the most-recently-bound K-vocab
      //     word from `cluster._definitionTaughtWords` (iter25-M.15
      //     persistent Set). Always populated as soon as SEED phase
      //     binds ANY definition. Provides early-curriculum seed even
      //     before any cell completes.
      //   - 'cell-progress' — embed the current cell key + phase name
      //     as a sentence. Always populated whenever the curriculum is
      //     active (even pre-cell SEED has a macro-phase label set on
      //     `_currentMacroPhase`). Gives Unity her own training-state
      //     awareness as a contemplation seed.
      this._innerThoughtSeedRotation = ['learning', 'mood', 'k-vocab-recent', 'cell-progress', 'chat-recall', 'memory', 'identity'];
      this._innerThoughtSeedIdx = 0;
    }
    // Try each source in rotation order; return the first that produces
    // a non-null pattern. Advances the rotation cursor each call so
    // popups cycle naturally even when one source is exhausted.
    for (let attempt = 0; attempt < this._innerThoughtSeedRotation.length; attempt++) {
      const source = this._innerThoughtSeedRotation[this._innerThoughtSeedIdx];
      this._innerThoughtSeedIdx = (this._innerThoughtSeedIdx + 1) % this._innerThoughtSeedRotation.length;
      let pattern = null;
      let label = '';
      try {
        if (source === 'learning') {
          const phase = this.cortexCluster?._activePhase?.name || null;
          const cellKey = this.cortexCluster?._currentCellKey || null;
          if (phase || cellKey) {
            const phaseConcept = (phase || '').replace(/^_teach/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim();
            const subjectGrade = (cellKey || '').replace('/', ' ');
            label = `learning ${phaseConcept || 'something'}${subjectGrade ? ' in ' + subjectGrade : ''}`.trim();
            pattern = this._computeServerCortexPattern(label);
          }
        } else if (source === 'mood') {
          // Build a sentence describing her CURRENT interoceptive state
          // and embed it. This is what she "feels" right now.
          const arParts = [];
          if (this.arousal > 0.7) arParts.push('aroused excited');
          else if (this.arousal < 0.3) arParts.push('calm relaxed');
          if (this.valence > 0.3) arParts.push('happy good');
          else if (this.valence < -0.3) arParts.push('sad bad');
          if (this.coherence > 0.7) arParts.push('focused clear');
          else if (this.coherence < 0.3) arParts.push('foggy scattered');
          if (this.fear > 0.5) arParts.push('afraid');
          if (this.reward > 0.5) arParts.push('rewarded');
          const drugLabel = this._drugStateLabel?.() || 'sober';
          if (drugLabel && drugLabel !== 'sober') arParts.push(drugLabel);
          if (arParts.length > 0) {
            label = `i feel ${arParts.join(' ')}`;
            pattern = this._computeServerCortexPattern(label);
          }
        } else if (source === 'chat-recall') {
          // Pull the most recent USER CHAT episode (type='interaction').
          // This is the integration point with users — when a user
          // talks to Unity, the exchange becomes a Tier 1 episode, and
          // the next inner-thought tick that lands on chat-recall has
          // her contemplate what was just said. Operator's "constantly
          // being built and upgraded as she... talks to users" path.
          if (this.memorySystem
              && Array.isArray(this.memorySystem._episodes)
              && this.memorySystem._episodes.length > 0) {
            // Walk backwards for the most recent interaction-type
            // episode (skip curriculum-heartbeat / working-memory /
            // curriculum-phase noise). Bounded to the last 50 to keep
            // the scan O(1) at biological scale.
            const eps = this.memorySystem._episodes;
            const start = Math.max(0, eps.length - 50);
            for (let i = eps.length - 1; i >= start; i--) {
              const ep = eps[i];
              if (ep && ep.type === 'interaction' && ep.pattern) {
                pattern = ep.pattern;
                label = `chat: ${(ep.input || '').slice(0, 50)}`;
                break;
              }
            }
          }
        } else if (source === 'memory') {
          // Pull the most recent Tier 1 episode pattern of ANY type.
          // Catches curriculum learning, working-memory age-out, brain-
          // heartbeat thinking-episodes — whatever she most recently
          // experienced. Different from chat-recall which is user-
          // facing only.
          if (this.memorySystem
              && Array.isArray(this.memorySystem._episodes)
              && this.memorySystem._episodes.length > 0) {
            const ep = this.memorySystem._episodes[this.memorySystem._episodes.length - 1];
            if (ep && ep.pattern) {
              pattern = ep.pattern;
              label = ep.input?.slice(0, 60) || ep.label || 'recent episode';
            }
          }
        } else if (source === 'identity') {
          // Pull a Tier 3 identity anchor pattern. This is who she is
          // at the most-consolidated level — contemplating self.
          if (this.tier3Store && typeof this.tier3Store.sampleAnchor === 'function') {
            const anchor = this.tier3Store.sampleAnchor();
            if (anchor && anchor.pattern) {
              pattern = anchor.pattern;
              label = anchor.label || anchor.concept || 'self';
            }
          } else if (this.tier3Store && this.tier3Store._anchors instanceof Map && this.tier3Store._anchors.size > 0) {
            // Fallback to direct map access if sampleAnchor not exposed
            const keys = [...this.tier3Store._anchors.keys()];
            const k = keys[Math.floor(Math.random() * keys.length)];
            const a = this.tier3Store._anchors.get(k);
            if (a && a.pattern) {
              pattern = a.pattern;
              label = a.label || k || 'self';
            }
          }
        } else if (source === 'k-vocab-recent') {
          // Sample a recently-bound K-vocab word from the persistent
          // `_definitionTaughtWords` Set (iter25-M.15). Always populated
          // as soon as the SEED phase binds its first definition — gives
          // the inner-voice a live seed during pre-cell + earliest cell
          // training, when the other sources are all empty.
          const cortex = this.cortexCluster;
          const taught = cortex && cortex._definitionTaughtWords;
          if (taught instanceof Set && taught.size > 0) {
            // Pull a recently-bound word. Sets don't have direct index
            // access but iteration order is insertion order, so taking
            // the tail of the iterator approximates "most recent N".
            // For O(1) cost we just iterate the full set every Nth tick
            // and cache the array on the prototype; size cap is 5000 per
            // saveWeights so iteration is cheap.
            const arr = Array.from(taught);
            // Bias toward the most recent half so contemplation
            // reflects current training, not bootstrap vocabulary.
            const recentStart = Math.floor(arr.length / 2);
            const idx = recentStart + Math.floor(Math.random() * (arr.length - recentStart));
            const word = arr[idx];
            if (typeof word === 'string' && word.length > 0) {
              label = `thinking about ${word}`;
              pattern = this._computeServerCortexPattern(label);
            }
          }
        } else if (source === 'cell-progress') {
          // Embed the current macro-phase + cell key as a sentence so
          // Unity can contemplate her own training-in-progress state.
          // Always populated whenever curriculum is running, even pre-
          // cell SEED phase (which sets `_currentMacroPhase` to e.g.
          // "📚 K-VOCAB-UPFRONT-MULTIDEF SEED (pre-cell setup)").
          const cortex = this.cortexCluster;
          const macroPhase = cortex && cortex._curriculum?._currentMacroPhase;
          const cellKey = cortex?._currentCellKey;
          const phaseName = cortex?._activePhase?.name;
          if (macroPhase || cellKey || phaseName) {
            const parts = [];
            if (macroPhase) {
              const cleaned = String(macroPhase).replace(/[^\w\s-]/g, '').toLowerCase().trim();
              if (cleaned) parts.push(cleaned);
            } else if (phaseName) {
              const phaseConcept = String(phaseName)
                .replace(/^_teach/i, '')
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .toLowerCase().trim();
              if (phaseConcept) parts.push(phaseConcept);
            }
            if (cellKey) {
              parts.push(`in ${cellKey.replace('/', ' ')}`);
            }
            if (parts.length > 0) {
              label = `learning ${parts.join(' ')}`;
              pattern = this._computeServerCortexPattern(label);
            }
          }
        }
      } catch { /* source failure → try next */ }
      if (pattern) return { pattern, source, label };
    }
    // All four sources empty (truly fresh brain, no episodes, no anchors,
    // no learning context). Return null pattern so generateAsync falls
    // through to baseline cortex state. Genuine silence is OK here.
    return { pattern: null, source: 'baseline', label: 'baseline cortex state' };
  },
};

module.exports = { SERVER_CHAT_MIXIN };
