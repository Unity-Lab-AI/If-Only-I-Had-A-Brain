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
  // REPLY-PIN EYES (2026-08-18) — a reply pinned the loop 87s on a 3-char
  // message and 174s on a 31-char one (pin start == message arrival, to the
  // second, both times), starving the donor dead. ONE BLOCKED line of 174s
  // means 174s with ZERO yields: a single synchronous stretch inside the
  // reply path. The old single _chatStage stamp could not name it — it was
  // never cleared (so any later pin inherited a stale 'respond') and the
  // lag monitor suppressed the tag past 120s (so the FATAL pin, being longer,
  // printed no tag at all). This wrapper fixes both: per-sub-stage laps, a
  // split line whenever a pass exceeds 2s, and the stage cleared on every
  // exit path including throws.
  _chatStamp(stage) {
    const now = Date.now();
    if (this._chatStage && this._chatStageT0) {
      if (!Array.isArray(this._chatLaps)) this._chatLaps = [];
      this._chatLaps.push(`${this._chatStage}=${now - this._chatStageT0}ms`);
    }
    // LOOPMAX.8 (2026-08-20) — BANK THE OUTGOING STAGE. Same race teachStage
    // v1 lost: the lag monitor is a 1000ms setInterval that reports after the
    // loop frees, and the reply path resumes first — so a 174s pin could be
    // tagged with whatever stage happened to be current 40ms later. The laps
    // above only print on the ChatPin line (reply pass > 2s); the BLOCKED line
    // gets nothing from them. Banking the held duration against the OUTGOING
    // stage name cannot be raced away, and a small chatStageMax on a long
    // block is the equally-decisive negative: the pin was not inside any
    // marked chat stage. Reset by the reporter so each block reports its own.
    if (this._chatStage && this._chatStageAt) {
      const held = now - this._chatStageAt;
      if (held > (this._chatStageMaxMs || 0)) {
        this._chatStageMaxMs = held;
        this._chatStageMaxName = this._chatStage;
      }
    }
    this._chatStage = stage || null;
    this._chatStageT0 = now;
    this._chatStageAt = now;
  },

  /**
   * SURPRISECPU.2 — the mind's-eye image preview, drained OFF the reply path.
   *
   * Moved verbatim out of `_processAndRespondInner`'s img-detect stage, where it
   * measured 4,925ms inline. The curriculum's compute-substrate gate calls this
   * one job per teach-call boundary, serialized into the walk's own chain — the
   * same lane the chat pairs, the chat-teach jobs and the salience walk ride,
   * and for the same reason: a single teacher, and the human never waits on
   * bookkeeping.
   *
   * Returns true when a preview was produced (for the caller's telemetry).
   * Everything inside is best-effort; a failure loses a preview, never a reply.
   */
  async _drainMindsEyePreview() {
    if (!Array.isArray(this._mindsEyePreviewQueue) || this._mindsEyePreviewQueue.length === 0) return false;
    const job = this._mindsEyePreviewQueue.shift();
    // PAINT.5 — a queued PRACTICE session: one bounded self-critique pass
    // (~ITERS sketch+perceive cycles at 256px) on this same serialized walk
    // lane. The human never waits on her practicing.
    if (job && job.kind === 'practice' && job.word) {
      try { await this._practiceDrawing(job.word); } catch (e) { if (!this._practiceErrLogged) { this._practiceErrLogged = true; console.warn(`[OwnArt] practice failed: ${e?.message || e}`); } }
      return false;
    }
    // ARTJUDGE — a REJECT verdict's relearn chain, on this same serialized
    // lane: re-read the dictionary definition (live fetch on a cache miss),
    // fetch a FRESH reference (force = the 6h cooldown is bypassed — a human
    // said the old one produced a bad drawing), which banks a new shape
    // schema, then queue the REDRAW so a new attempt lands on the page.
    if (job && job.kind === 'relearn' && job.word) {
      try {
        if (this.cortexCluster && typeof this.cortexCluster.lookupDefinition === 'function') {
          try { await this.cortexCluster.lookupDefinition(job.word); } catch { /* definition re-read best-effort */ }
        }
        if (typeof this._fetchReferenceAndGround === 'function') {
          await this._fetchReferenceAndGround(job.word, { force: true });
        }
      } catch (e) {
        if (!this._relearnErrLogged) { this._relearnErrLogged = true; console.warn(`[OwnArt] relearn failed for "${job.word}": ${e?.message || e}`); }
      }
      this._mindsEyePreviewQueue.push({ kind: 'own', text: job.word });
      return false;
    }
    // DRAWCTX — an OWN-ART job: she composes her own drawing of what the message
    // named, here on the walk lane, and publishes it to the mind's eye. Separate
    // branch from the preview because there is no prompt and no reference involved:
    // the whole point is that nothing from a generator reaches the canvas.
    if (job && job.kind === 'own' && job.text) {
      try {
        const made = await this._drawOwnCreation(job.text);
        if (made && made.rec) {
          const now = Date.now();
          this._lastGroundedEyeAt = now;
          this._mindsEyeJson = JSON.stringify({
            type: 'mindsEye', rec: made.rec, terms: made.rec.equation_count || 0,
            source: made.source, at: now,
          });
          // Tell the viewers something new is on her page.
          try {
            if (this.clients && this.clients.size > 0) {
              const p = JSON.stringify({ type: 'imagine', terms: made.rec.equation_count || 0, source: made.source, ts: now });
              for (const [ws] of this.clients) { if (ws.readyState === 1) { try { ws.send(p); } catch { /* nf */ } } }
            }
          } catch { /* publish best-effort */ }
          // She remembers making it — the drawing rides the emission bus so the
          // dream cycle can consolidate "I drew this" as an episode.
          try {
            const _c = this.cortexCluster;
            if (_c && typeof _c.pushEmission === 'function') {
              _c.pushEmission({ source: 'own-art', text: (made.plan && made.plan.subjects ? made.plan.subjects.join(' ') : 'drawing'), ts: now });
            }
          } catch { /* non-fatal */ }
          this._ownArtDrawn = (this._ownArtDrawn || 0) + 1;
          // PAINT.5 — drawing IS the trigger to practice: each subject she just
          // drew gets one queued practice session (the loop itself gates on the
          // per-concept cooldown + schema/percept presence, so this is cheap to
          // over-ask). Queued, not inline — one bounded job per drain tick.
          try {
            if (made.plan && Array.isArray(made.plan.subjects)) {
              for (const w of made.plan.subjects) this._mindsEyePreviewQueue.push({ kind: 'practice', word: w });
            }
          } catch { /* practice enqueue best-effort */ }
          return true;
        }
        try { process.stdout.write(`[OwnArt] nothing drawable understood in "${String(job.text).slice(0, 60)}" — honest no-drawing rather than a fake shape.\n`); } catch { /* nf */ }
      } catch (e) {
        if (!this._ownArtErrLogged) { this._ownArtErrLogged = true; console.warn(`[OwnArt] own-art drain failed: ${e?.message || e}`); }
      }
      return false;
    }
    const imgPrompt = job && job.prompt;
    if (!imgPrompt) return false;
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
          rec = await this.mindSpace.imagineFromState(emb, {
            maxSide: 192, text: imgPrompt,
            mood: { arousal: this.arousal, valence: this.valence },
            priority: 0.4, value: 0.6,
          });
        }
        if (rec) {
          const percept = await this.mindSpace.describe(rec);
          if (percept && this.cortexCluster && typeof this.cortexCluster.injectEmbeddingToRegion === 'function') {
            this.cortexCluster.injectEmbeddingToRegion('sem', percept, 0.12);
          }
          // show what she pictured on the public Mind's-Eye viewer
          this._lastGroundedEyeAt = Date.now();   // SEE.6 — previews are grounded frames
          this._mindsEyeJson = JSON.stringify({
            type: 'mindsEye', rec, terms: rec.equation_count || 0,
            source: 'image-preview', at: Date.now(),
          });
          this._mindsEyePreviewsDrained = (this._mindsEyePreviewsDrained || 0) + 1;
          return true;
        }
      }
    } catch (e) {
      if (!this._mindsEyePreviewErrLogged) {
        this._mindsEyePreviewErrLogged = true;
        console.warn(`[Brain] mind's-eye preview drain failed: ${e?.message || e}`);
      }
    }
    return false;
  },

  async processAndRespond(text, userId) {
    const _rpT0 = Date.now();
    this._chatLaps = [];
    this._chatStageT0 = _rpT0;
    try {
      return await this._processAndRespondInner(text, userId);
    } finally {
      this._chatStamp(null);
      const _rpMs = Date.now() - _rpT0;
      if (_rpMs > 2000) {
        console.warn(`[ChatPin] reply pass ${_rpMs}ms — ${(this._chatLaps || []).join(' · ')} (any stage over ~1s is a loop pin: the donor misses pings and dies).`);
      }
      this._chatLaps = [];
    }
  },

  async _processAndRespondInner(text, userId) {
    // CHAT-STAGE EYES (2026-08-18) — the lag monitor prints _chatStage when
    // a loop pin lands during chat, so the next freeze names its organ.
    this._chatStamp('entry');
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
      this._chatStamp('img-detect');
      // ── DRAWCTX (Gee 2026-08-20) — "DRAW" MEANS *HER HAND*, NOT A GENERATOR ────
      //
      // Gee: *"when Unity is told to 'draw' she should draw the topic, thing, place,
      // person, in context in the message from the user"* — and the deepest form of
      // his complaint about filtered photos was right here: `VISUAL` matched the word
      // `draw`, so "draw me a <subject> on a <place>" was routed to Pollinations and the
      // returned PHOTO was presented as her drawing. Her hand was never involved.
      //
      // A DRAW verb now goes to `_drawOwnCreation`, which composes her own marks from
      // the shape schemas she has learned (see OWNART) for EVERY drawable noun in the
      // message plus the place named in it. A picture/photo/image/generate ask still
      // goes to the generator — that is a different thing and it is honest about it.
      //
      // It rides the WALK LANE, not the reply path: today's SURPRISECPU.2 measured an
      // inline mind's-eye preview at 4,925ms, and a full composition is heavier. She
      // answers in words immediately and her drawing lands on the mind's eye a beat
      // later — the same discipline as every other piece of chat-time work.
      if (this._detectDrawRequest(text)) {
        try {
          if (!Array.isArray(this._mindsEyePreviewQueue)) this._mindsEyePreviewQueue = [];
          this._mindsEyePreviewQueue.push({ kind: 'own', text: String(text).slice(0, 400), at: Date.now() });
          while (this._mindsEyePreviewQueue.length > 8) {
            this._mindsEyePreviewQueue.shift();
            this._mindsEyePreviewDropped = (this._mindsEyePreviewDropped || 0) + 1;
          }
          try { process.stdout.write(`[OwnArt] 🖐 draw asked — queued HER OWN composition of "${String(text).slice(0, 80)}" (walk lane; the reply is not held for it).\n`); } catch { /* nf */ }
        } catch { /* queueing must never break the reply */ }
      }
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
        // SURPRISECPU.2 (2026-08-20) — OFF THE REPLY PATH. This block used to
        // run INLINE here and the split convicted it: `img-detect=4,925ms` on a
        // live pass. Two awaits (mind-space imagine + describe) on the reply
        // path means the human waits five seconds for a preview of an image the
        // client renders anyway, and — the part that actually kills things —
        // the event loop is held for that whole stretch, so donor keepalives
        // starve exactly like the 143s salience monster and the concurrent
        // teach did. Identical remedy, third time: the work is ENQUEUED and the
        // walk drains it at a teach-call boundary (see _drainMindsEyePreview +
        // the curriculum gate). She still sees what she made and the viewer
        // still updates — a beat later, off the critical path. Bounded at 8,
        // drop-oldest, and the drop is counted.
        try {
          if (!Array.isArray(this._mindsEyePreviewQueue)) this._mindsEyePreviewQueue = [];
          this._mindsEyePreviewQueue.push({ prompt: imgPrompt, at: Date.now() });
          while (this._mindsEyePreviewQueue.length > 8) {
            this._mindsEyePreviewQueue.shift();
            this._mindsEyePreviewDropped = (this._mindsEyePreviewDropped || 0) + 1;
          }
        } catch { /* queueing a preview must never block the image */ }
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
      this._chatStamp('pair-enqueue');
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
            // ONE TEACHER AT A TIME (2026-08-18). This used to fire
            // _teachAssociationPairs fire-and-forget ("no await so chat
            // latency isn't blocked") — which launched a SECOND teach chain
            // CONCURRENTLY with the walk's own running teach call on the
            // same cluster, the same scratch buffers, the same single
            // thread. At the 12M cortex the walk's heavy phases run
            // minutes per call, so the two chains interleaved into 40s+
            // unbroken loop pins: the state endpoint froze, donor
            // keepalives starved, and the donor dropped — every time the
            // operator spoke to her mid-walk (reproduced live twice; the
            // freeze's giant BLOCKED line + this turn's counters convicted
            // the concurrency, not the message). Chat pairs now ENQUEUE;
            // the walk drains the queue at its own teach-call boundaries
            // (awaited, serialized — see _awaitComputeSubstrate), so her
            // chat learning still lands within seconds with ZERO
            // concurrent teaching. reps=1 semantics, relationTagId=30
            // channel, and the A.4 error accounting all preserved at the
            // drain site. Queue bounded: oldest pairs drop past 512 (the
            // dropped count is visible in stats).
            if (!Array.isArray(this._chatPairTeachQueue)) this._chatPairTeachQueue = [];
            for (const pr of pairs) this._chatPairTeachQueue.push(pr);
            while (this._chatPairTeachQueue.length > 512) {
              this._chatPairTeachQueue.shift();
              this._chatTimeHebbianStats.droppedOldest = (this._chatTimeHebbianStats.droppedOldest || 0) + 1;
            }
            this._chatTimeHebbianStats.turns++;
            this._chatTimeHebbianStats.totalPairs += pairs.length;
            this._chatTimeHebbianStats.lastTs = Date.now();
            this._chatTimeHebbianStats.queued = this._chatPairTeachQueue.length;
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
    this._chatStamp('turn-history');
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
    this._chatStamp('identity-inject');
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
    this._chatStamp('schema-retrieve');
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
    // DONOR-FREEZE GUARD (Gee 2026-07-14, confirmed root cause) — at
    // biological scale generateAsync ticks the 61M cortex per word, and when
    // the GPU proxy isn't ready (donor mid-reconnect) `cluster.stepAwait`
    // falls back to a SYNCHRONOUS CPU step ~57s/WORD (cluster.js ~3697). A few
    // words = a 150+s loop freeze — which is exactly what exceeded the donor's
    // 150s idle watchdog and dropped it (the reconnect-churn root cause: a chat
    // message landing during a reconnect froze the box 156s). So NEVER CPU-tick
    // the huge cortex: if cortex > DREAM_INNERVOICE_MAX_NEURONS AND the GPU
    // proxy isn't live, SKIP generation and fall through to the honest-silence
    // handler below — she goes briefly quiet during a ~25s reconnect instead of
    // freezing the box + knocking the donor off. Mirrors the #36 inner-voice
    // gate but keyed on the LIVE `_gpuProxyReady` (the flag the #36 env-only
    // gate omits, which let a still-counted mid-reconnect donor slip through).
    // Zero behavior change when the donor is connected (_gpuProxyReady === true).
    // DREAM_INNERVOICE_FORCE_CPU=1 opts back into the CPU tick (small/local brains).
    const _cortexNeurons = (this.clusters && this.clusters.cortex && this.clusters.cortex.size) || 0;
    const _ivMaxNeurons = Number(process.env.DREAM_INNERVOICE_MAX_NEURONS) || 2000000;
    const _gpuReadyForGen = !!(this.cortexCluster && this.cortexCluster._gpuProxyReady === true);
    const _cpuTickUnsafe = _cortexNeurons > _ivMaxNeurons
      && !_gpuReadyForGen
      && process.env.DREAM_INNERVOICE_FORCE_CPU !== '1';

    let response = '';
    if (_cpuTickUnsafe) {
      try { process.stdout.write(`[Brain] chat generation SKIPPED — cortex ${_cortexNeurons.toLocaleString()} > ${_ivMaxNeurons.toLocaleString()} AND GPU proxy not ready (donor mid-reconnect); a CPU cortex tick would freeze the loop ~57s/word and trip the donor's 150s idle watchdog. Honest silence until the donor re-syncs.\n`); } catch { /* non-fatal */ }
      // response stays '' → the honest-silence handler below fires (motor_unstable).
    } else {
      try {
        // CHAT.3 (2026-07-16) — open the chat-priority window: while the reply
        // is composing, the teach firehose (pattern lane + hebbian batch flush)
        // yields the WS + donor queue to the emission dispatches (see gpu.js
        // _chatPriorityActive). 60s ceiling = a stuck generate can't starve
        // teach forever; cleared in finally the moment the reply lands.
        this._chatPriorityUntil = Date.now() + 60_000;
        this._chatStamp('generate');
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
            // DONOR-DROP FIX (Gee 2026-07-16) — while the curriculum is walking,
            // compose reranking drops to ONE candidate (see language-cortex):
            // 3 full emissions per reply (~39s) stacked on teach + a weights save
            // starved the event loop 47s → donor socket EPIPE → donor dead.
            curriculumBusy: !!this._curriculumInProgress,
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
        this._chatPriorityUntil = 0;   // CHAT.3 — close the priority window on failure too
        console.error('[Brain] languageCortex.generate threw:', err.message);
        console.error(err.stack);
        return { text: '', action: 'respond_text' };
      }
      this._chatPriorityUntil = 0;   // CHAT.3 — reply composed; teach lane reopens immediately
    }

    this._chatStamp('respond');
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
      // FIRSTPIN.1 — the silence path gets its own stamp. It reads
      // `getTrainedCapability()` (a live scan of buckets + passed cells), so
      // an honest-silence reply is NOT a free exit and must not be charged
      // to the generic `respond` stage.
      this._chatStamp('respond:silence-gate');
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
    this._chatStamp('respond:learn-words');
    this._learnWords(response);
    this._chatStamp('respond:store-episode');
    // SALIENCE OFF THE REPLY PATH (2026-08-18). Two measured failures taught
    // this: computing the surprise term inline cost 142,989ms on CPU (donor
    // dead), and moving it to the GPU inline still cost 190,620ms because 48
    // sequential round-trips queue behind a donor saturated with teach traffic.
    // The lesson is not "which processor" — it is that the human must NEVER
    // wait on memory bookkeeping worth 0.2 of a consolidation score. The
    // episode stores NOW; the letter walk is queued and drains serialized into
    // the walk's own chain (see curriculum _awaitComputeSubstrate), which also
    // keeps it from mutating cortex spike state underneath a running teach.
    const _ep = this.storeEpisode(userId, 'interaction', text, response);
    if (_ep && _ep.id && !_ep.merged && text) {
      if (!Array.isArray(this._salienceQueue)) this._salienceQueue = [];
      this._salienceQueue.push({ episodeId: _ep.id, text: String(text).slice(0, 200) });
      while (this._salienceQueue.length > 64) this._salienceQueue.shift();  // bounded, drop-oldest
    }
    this._chatStamp('respond:curiosity');

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
          // ONE TEACHER AT A TIME, HERE TOO (2026-08-20). This awaited
          // _teachAssociationPairs INLINE — 8 pairs x 12 reps on the
          // definition channel, on the reply path, on the same cluster and
          // scratch buffers the walk is teaching into. It is the identical
          // concurrent-teach crime the chat-pair queue was built to kill,
          // surviving in a branch that only fires when she asked a question
          // last tick (which is why rounds 4-5 never caught it: the branch
          // did not run). It ENQUEUES now, and the walk's drain teaches it
          // serialized at a teach-call boundary.
          //
          // A JOB queue, not the tag-30 pair queue: that drain trains
          // reps=1 / relationTagId=30, and folding these in would silently
          // demote a 12-rep definition binding to a 1-rep chat-time one.
          // The job carries its own opts so the definition channel is
          // preserved exactly as it was. Bounded at 32 jobs, drop-oldest,
          // and the drop is counted — no silent loss.
          if (!Array.isArray(this._chatTeachJobQueue)) this._chatTeachJobQueue = [];
          this._chatTeachJobQueue.push({
            pairs,
            opts: { reps: 12, label: 'CURIOSITY-FOLLOWUP-ANSWER', relationTagId: 23 },
          });
          if (!this._chatTimeHebbianStats) {
            this._chatTimeHebbianStats = { turns: 0, totalPairs: 0, lastTs: 0, errors: 0, lastError: null, lastWarnTs: 0 };
          }
          while (this._chatTeachJobQueue.length > 32) {
            this._chatTeachJobQueue.shift();
            this._chatTimeHebbianStats.jobsDroppedOldest = (this._chatTimeHebbianStats.jobsDroppedOldest || 0) + 1;
          }
          this._chatTimeHebbianStats.jobsQueued = this._chatTeachJobQueue.length;
          this._chatTimeHebbianStats.jobsEnqueued = (this._chatTimeHebbianStats.jobsEnqueued || 0) + 1;
        }
        // ── INQUIRE (Gee 2026-08-20) — SHE FOLLOWS UP ON THE ANSWER ──────────────
        //
        // Gee: *"we need to make Unity inquisitive alweays asking questions and follow
        // ups to the answers to those questions."* Until now the loop ENDED here: she
        // asked, you answered, the answer was bound, and the pending concept was
        // cleared. One question, no curiosity.
        //
        // Now the answer's own content picks the next question, which is what makes it
        // a FOLLOW-UP rather than a second unrelated question: a content token from
        // what YOU said becomes the concept she asks about next, and it is armed as the
        // pending question so the same answer→bind→follow-up machinery runs again.
        //
        // BOUNDED, because "always asking" must not become an interrogation: depth cap
        // (default 3), and the chain resets when it ends or when nothing in the answer
        // is new to her. `_inquireDepth` is the counter; `_inquireChain` is what she has
        // already asked about this chain, so she cannot loop on the same word.
        try {
          const MAXD = Number(process.env.DREAM_INQUIRE_DEPTH) > 0 ? Number(process.env.DREAM_INQUIRE_DEPTH) : 3;
          this._inquireDepth = (this._inquireDepth || 0) + 1;
          if (!Array.isArray(this._inquireChain)) this._inquireChain = [];
          this._inquireChain.push(concept);
          while (this._inquireChain.length > 8) this._inquireChain.shift();
          if (this._inquireDepth < MAXD) {
            // A content word from the ANSWER she has not already chased this chain.
            const next = answerTokens.find(t => t !== concept && !this._inquireChain.includes(t) && t.length > 2);
            if (next) {
              this._pendingQuestionConcept = next;
              this._inquireFollowUpOf = concept;
              try { process.stdout.write(`[Inquire] follow-up armed: she answered about "${concept}" and now wonders about "${next}" (depth ${this._inquireDepth}/${MAXD}).\n`); } catch { /* nf */ }
              // Train the follow-up as SELF-THOUGHT too, so asking becomes a habit in
              // her weights and not a scripted behaviour: the question path
              // concept → wondering → next-concept binds on the definition channel via
              // the same job queue, off the reply path.
              if (Array.isArray(this._chatTeachJobQueue)) {
                this._chatTeachJobQueue.push({
                  pairs: [[concept, next], ['i', next], ['myself', next]],
                  opts: { reps: 6, label: 'INQUIRE-FOLLOWUP', relationTagId: 23 },
                });
              }
            } else {
              this._inquireDepth = 0; this._inquireChain = [];
            }
          } else {
            this._inquireDepth = 0; this._inquireChain = [];
            try { process.stdout.write(`[Inquire] chain complete at depth ${MAXD} — she stops asking and keeps what she learned.\n`); } catch { /* nf */ }
          }
        } catch { /* the follow-up must never break the answer bind */ }
        this.storeEpisode('curiosity', 'answer-learned', concept, text);
      } catch (e) {
        if (!this._followupErrLogged) { this._followupErrLogged = true; console.warn(`[Brain] curiosity follow-up bind failed: ${e?.message || e}`); }
      }
    }

    // 114.19fi.B.5 — push chat-turn pair to rolling history (cap 16).
    // Multi-turn coherence: next call's processAndRespond reads prior
    // 2 user inputs and injects their embeddings into sem.
    this._chatStamp('respond:history-push');
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
    // FIRSTPIN.1 — the tail is its own stamp. Everything from here to the
    // return used to be charged to `respond:history-push`, so a slow
    // JSON.parse of a long emission or a slow route decision would have
    // been reported as history bookkeeping. Now the split names it.
    this._chatStamp('respond:route-return');
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
  async _imagineTick(now) {
    if (!this.mindSpace || typeof this.mindSpace.imagineFromState !== 'function') return;
    // Reentrancy guard - engine ops run async in the mind-space worker now;
    // a slow daydream must not stack a second one behind it.
    if (this._imagineInFlight) return;
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
    this._imagineInFlight = true;
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
        _seed = (semR && typeof this.cortexCluster.lastSpikes.slice === 'function')
          ? this.cortexCluster.lastSpikes.slice(semR.start, semR.end)
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
            // re-seeing it (a recall-hit has a 35% chance of becoming a DRAWING
            // OF THE MEMORY, so her sketchbook includes learned imagery).
            // AUDIT FIX (Gee 2026-07-16 "make sure weve been doing everything
            // correct"): this branch used _practiceDrawFromMemory → white-ink
            // traceLineArt strokes = the LAST leftover white-pencil publisher
            // ("NO MORE PENCIL ART"). Now it draws via _drawConcept — the field
            // default: her beautiful COLOURED recreation + dazzle label.
            if (typeof this._drawConcept === 'function' && Math.random() < 0.35) {
              try {
                const _mConcept = (hit.matched && hit.matched[0]) || null;
                const practiced = _mConcept ? await this._drawConcept(_mConcept, { allowFetch: false }) : null;
                if (practiced && practiced.rec) { rec = practiced.rec; _seedSource = practiced.source || practiced.label; }
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
      // DRAW-ENGINE (Gee 2026-07-15) — NON-BLOCKING GROUND + DRAW. Grounding a
      // never-seen concept needs a network fetch (slow: up to 25s). AWAITING that
      // fetch inside the tick froze the mind's-eye on the last grounded frame for
      // MINUTES ("stuck on recall: taxi for 10+ minutes") — the in-flight fetch
      // held `_imagineInFlight` the entire time so every new tick bailed at the
      // reentrancy guard. FIX: the reference look-up is now FIRE-AND-FORGET (it
      // grounds the concept in the background and publishes its OWN `lookup:` frame
      // when it lands — visual-memory.js), and `_drawConcept` is called
      // `allowFetch:false` so it draws ONLY from already-grounded memory (recall /
      // provisional) = microsecond-fast, the viewer cycles every ~6-8s. No
      // double-fetch collision (the earlier bug) because the fire-and-forget is now
      // the SOLE fetcher — `_drawConcept` never fetches. Its per-concept cooldown /
      // gap / in-flight guards stop any fetch storm. Reference shows as `lookup:`,
      // her trace as `canvas:draw:`.
      // TU.29.13 BUILD B — ACTIVE SKETCH. Some idle daydreams aren't a recalled
      // percept OR a mood wash — she picks up the pencil and DRAWS her active
      // mind: her most-active sem neurons become nodes, connected in activation
      // order by vectors (a constellation/graph of what's lit right now). This
      // is the mind's eye as a tool she USES — making lines + vectors on the
      // equational canvas — not just a passive readout. Fires on a fraction of
      // recall-miss ticks (she doodles when there's nothing to re-see), never
      // when a real memory recalled.
      // DRAW-ENGINE (Gee 2026-07-15) — she DRAWS the concept she couldn't re-see.
      // Recall a grounded field C, else LOOK IT UP (definition-driven reference,
      // perceived headlessly into a field C), then TRACE it into her hand's
      // strokes + her goth palette. No shape-per-word stamp, no stage machine, no
      // rain/house furniture — the FORM comes from an image she actually looked
      // at. _drawConcept returns null when she can nothing to ground (never seen,
      // no reference) → honest no-drawing, and the de-novo mood field renders below.
      // IMAGINATIVE DRAWING — open-ended, from her own head (Gee: "she needs to
      // imagine too and draw things not always what she sees ... open ended
      // dynamically to infinity"). Fired DETACHED/background (it may fetch parts, so
      // awaiting would freeze the viewer) on a fraction of ticks — regular enough to
      // actually SEE (the old grounded-only + 15% version never fired: starved), but
      // reference drawings stay primary. It composes drawable nouns from her stream
      // of thought and publishes its own canvas:imagine frame when ready.
      if (typeof this._imagineAndDraw === 'function' && Math.random() < (Number(process.env.DREAM_IMAGINE_DRAW_PROB) || 0.18)) {
        this._imagineAndDraw().catch(() => { /* background imagine best-effort */ });
      }
      if (!rec && _recallMissed && typeof this._drawConcept === 'function') {
        // LOOK UP → DRAW, in the background (Gee 2026-07-15: "she shall draw more
        // often"). Detached from the tick (never holds `_imagineInFlight`, so the
        // slow fetch can't freeze the viewer — that was the earlier bug). It fetches
        // the reference (self-publishes the `lookup:` frame as she SEES it) and then
        // DRAWS the very thing she looked up (`canvas:draw:` frame) — 1:1, the
        // reference then her own traced version. Its per-concept cooldown / gap /
        // in-flight guards keep it to ~one real look-up + draw per 15s.
        if (typeof this._lookUpAndDraw === 'function') {
          this._lookUpAndDraw(_seedText).catch(() => { /* background look-up + draw best-effort */ });
        }
        // DRAW NOW from what she has ALREADY grounded (recall / provisional) — never
        // a fetch (allowFetch:false), so the tick stays microsecond-fast and the
        // viewer cycles every ~6-8s instead of stalling on the network round-trip.
        // Only for a DRAWABLE concept — an OBJECT/noun (abstract thought-words trace
        // to garbage scatter → skip to the favorite below). Dynamic POS gate.
        if (typeof this._conceptIsDrawable !== 'function' || await this._conceptIsDrawable(_seedText)) {
          try {
            const drawn = await this._drawConcept(_seedText, { allowFetch: false });
            if (drawn && drawn.rec) { rec = drawn.rec; _seedSource = drawn.source || drawn.label; }
          } catch { /* draw best-effort */ }
        }
        // FAVORITE fallback (Gee 2026-07-15) — the current thought couldn't ground
        // (never seen + no reference yet), but she can still DRAW a concept she HAS
        // grounded so the mind's-eye shows a REAL picture instead of falling to the
        // de-novo texture. Pick a random grounded concept; no fetch (draw from what
        // she's already seen). This is what keeps the viewer full of her drawings.
        if (!rec && this._visualMemory && this._visualMemory.size > 0) {
          try {
            // DRAWGATE — the favorite must pass the same thing/person/place/animal
            // gate as everything else: the store can hold abstract keys (thought
            // words banked as lookup frames), and drawing one traces to garbage.
            // A few random tries, each gated; none pass → no favorite this tick.
            const _favKeys = Array.from(this._visualMemory.keys());
            for (let _ft = 0; _ft < 4 && !rec; _ft++) {
              const _fav = _favKeys[Math.floor(Math.random() * _favKeys.length)];
              if (typeof this._conceptIsDrawable === 'function' && !(await this._conceptIsDrawable(_fav))) continue;
              const drawnFav = await this._drawConcept(_fav, { allowFetch: false });
              if (drawnFav && drawnFav.rec) { rec = drawnFav.rec; _seedSource = 'draw:fav:' + _fav; }
            }
          } catch { /* favorite best-effort — de-novo field below (view-only, not published) */ }
        }
      }
      if (!rec) {
        rec = await this.mindSpace.imagineFromState(_seed, {
          maxSide: 192, text: _seedText,
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
                // IMPRESSION = the nearest SEEN percept AS-IS (operator directive:
                // no morphing memories — a memory faded with the non-representational
                // de-novo field is two images blended, i.e. static). Abstract
                // thoughts re-see the closest real thing her eyes have grounded;
                // the pure mood field stands when nothing near has been seen.
                // Confirmed memories only (generator-noise gate).
                if (_iMem && _iMem.rec && _iMem.conf !== false
                    && (typeof this._recDetail !== 'function' || this._recDetail(_iMem.rec) >= 150)) {
                  rec = _iMem.rec;
                  _seedSource = 'impression:' + _iBestTok + '~' + _iBest;
                }
              }
            }
          }
        } catch { /* impression anchor best-effort — the pure field stands */ }
      }
      if (!rec) return;
      const percept = await this.mindSpace.describe(rec);
      // inject the imagined percept into the cortex sem region at LOW strength —
      // a faint mental image, never strong enough to override real input.
      // VIEW-ONLY mid-teach: skip the sem re-injection while curriculum is
      // writing Hebbian so imagination never perturbs the walk's patterns;
      // the viewer snapshot + memory ring below still update.
      if (!_midTeach && percept && typeof this.cortexCluster.injectEmbeddingToRegion === 'function') {
        try { this.cortexCluster.injectEmbeddingToRegion('sem', percept, 0.08); } catch { /* non-fatal */ }
      }
      // Publish the imagined frame to the shared mind's-eye viewer + dashboard.
      // Grounded-only (a de-novo thought-blend / sem-state texture never takes the
      // screen), + persists the rec to the imagined-field ring. Shared with
      // _lookUpAndDraw so the tick and the background look-up→draw publish
      // identically (see _publishMindsEyeFrame).
      this._publishMindsEyeFrame(rec, _seedSource, now);
    } catch { /* imagination is best-effort — never fatal to the tick */ }
    finally { this._imagineInFlight = false; }
  },

  // Shared mind's-eye publish (used by _imagineTick + _lookUpAndDraw). Stamps
  // _lastImagineRec, pushes the rec into the bounded imagined-field ring
  // (UVM-INT.4 — serialized by saveWeights so imagery survives reboot), and
  // caches the SINGLE current field C as the public snapshot the read-only viewer
  // polls (GET /minds-eye.json → reconstructs client-side; one compute, N viewers
  // free) + pings the dashboard indicator over WS.
  // GROUNDED-ONLY VIEWER (Gee 2026-07-15) — the de-novo thought-blend / sem-state
  // field is a raw-semantic-state mood TEXTURE (the "solid-color line-vector
  // neuron-map blob" — no detail, not a drawing). It must NEVER be the public
  // image: publish ONLY grounded frames (recall / draw / lookup / impression /
  // seen). A non-grounded tick simply doesn't publish, so the last real drawing
  // holds. DREAM_EYE_SHOW_THOUGHT=1 restores the old texture-on-viewer.
  _publishMindsEyeFrame(rec, source, now) {
    if (!rec) return;
    if (typeof now !== 'number') now = Date.now();
    // LOOKUP HOLD (pacing) — while she is "studying" a freshly looked-up reference
    // (its `lookup:` frame is live for _lookupHoldUntil), don't let the imagine
    // tick's RANDOM favorite draw shove it off the viewer. She looks, THEN draws
    // (her own `canvas:draw:` publishes after the hold expires). Only the random
    // favorite is held back — the concept's own drawing always shows.
    if (this._lookupHoldUntil && now < this._lookupHoldUntil && typeof source === 'string' && source.startsWith('draw:fav:')) return;
    this._lastImagineRec = { terms: rec.equation_count || 0, source, at: now };
    if (!Array.isArray(this._imaginedFieldRing)) this._imaginedFieldRing = [];
    this._imaginedFieldRing.push({ rec, at: now });
    while (this._imaginedFieldRing.length > 8) this._imaginedFieldRing.shift();
    const _groundedEye = source !== 'thought-blend' && source !== 'sem-state';
    if (_groundedEye) this._lastGroundedEyeAt = now;
    const _publishEye = _groundedEye || process.env.DREAM_EYE_SHOW_THOUGHT === '1';
    if (!_publishEye) return;
    try {
      this._mindsEyeJson = JSON.stringify({ type: 'mindsEye', rec, terms: rec.equation_count || 0, source, at: now });
    } catch { /* non-fatal */ }
    if (this.clients && this.clients.size > 0) {
      const payload = JSON.stringify({ type: 'imagine', terms: rec.equation_count || 0, source, ts: now });
      for (const [ws] of this.clients) {
        if (ws.readyState === ws.OPEN) { try { ws.send(payload); } catch { /* non-fatal */ } }
      }
    }
  },

  // LOOK UP → DRAW (Gee 2026-07-15: "she shall draw more often!!!! ... twn -
  // twenty lookups in a row and not one single drawing has been attempted").
  // Runs DETACHED from the imagine tick (never touches _imagineInFlight) so the
  // slow Pollinations fetch can never freeze the viewer. She fetches the
  // reference — which self-publishes its `lookup:` frame as she SEES it — then
  // immediately DRAWS the concept she just looked up (the fetch grounded it
  // provisionally, so _drawConcept step-2 finds it with allowFetch:false; no
  // re-fetch, no double-fetch collision) and publishes that `canvas:draw:` frame.
  // Result: every real look-up becomes a drawing of the SAME concept, 1:1.
  async _lookUpAndDraw(concept) {
    if (typeof this._fetchReferenceAndGround !== 'function') return;
    // DRAWABILITY GATE (dynamic POS) — only look up + draw concepts that are OBJECTS
    // (nouns). An abstract/function word ("nicknamed", "because") fetches a reference
    // that traces to garbage vector scatter (Gee: "stop her basic vector ...
    // drawings"). Non-drawable → don't fetch, don't draw; the tick shows a grounded
    // favorite instead. Gated at the source (the fetch path), so non-nouns never get
    // grounded in the first place.
    if (typeof this._conceptIsDrawable === 'function' && !(await this._conceptIsDrawable(concept))) {
      // LOOKEYES.1 — a silent gate is a suspect forever; a counted one is a field read.
      try { if (typeof this._vmLook === 'function') this._vmLook().notDrawable++; } catch { /* nf */ }
      return;
    }
    let grounded = null;
    try { grounded = await this._fetchReferenceAndGround(concept); } catch { grounded = null; }
    if (!grounded) return;   // cooldown / gap / fetch-fail / blank ref → nothing new to draw
    // HOLD — she LOOKS at the reference (its `lookup:` frame is live) for a beat
    // before she draws it: the viewer shows what she SEES, then what she MAKES,
    // paced like a person studying then sketching — not the draw clobbering the
    // lookup in 1ms (Gee: "im not seeing her lookups any more"). The hold window
    // also suppresses the tick's random favorite draw (see _publishMindsEyeFrame).
    const HOLD = Number(process.env.DREAM_LOOKUP_HOLD_MS) || 4500;
    this._lookupHoldUntil = Date.now() + HOLD;
    await new Promise(r => setTimeout(r, HOLD));
    if (typeof this._drawConcept !== 'function') return;
    let drawn = null;
    try { drawn = await this._drawConcept(concept, { allowFetch: false }); } catch { drawn = null; }
    if (drawn && drawn.rec) {
      this._publishMindsEyeFrame(drawn.rec, drawn.source || drawn.label);
      // REMEMBER-IN-RELATION (Gee: "she should be remembering what she looks up and
      // draws in relation like real") — bind her DRAWING to the concept alongside
      // the reference, so recall surfaces both what she saw + what she made, and it
      // sharpens with practice (best-resemblance kept).
      try { await this._rememberDrawing(concept, drawn.rec); } catch { /* remember best-effort */ }
    }
  },

  // Bind her drawing to the concept's visual-memory entry, IN RELATION to the
  // reference she looked up. `e.rec` stays the pristine reference (recall re-sees
  // that); `e.drawing` is HER rendition; `e.drawResemblance` is how close her
  // drawing came to the reference (cosine of their percepts), so repeated draws
  // KEEP THE BEST — practice makes the remembered drawing better over time, like a
  // real sketchbook. `_drawSkill` tracks the per-concept resemblance ceiling.
  async _rememberDrawing(concept, drawnRec) {
    if (!drawnRec || typeof this._vmStore !== 'function') return;
    const key = (typeof this._vmContentTokens === 'function' ? (this._vmContentTokens(concept)[0] || '') : String(concept || '').toLowerCase().split(/\s+/)[0]) || '';
    if (!key) return;
    const store = this._vmStore();
    const e = store.get(key);
    if (!e) return;   // no reference bound → nothing to relate the drawing to
    let resemblance = 0;
    try {
      const dp = (this.mindSpace && typeof this.mindSpace.describe === 'function') ? await this.mindSpace.describe(drawnRec) : null;
      if (dp && e.p && e.p.length) {
        const a = Array.from(dp), b = e.p; let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
        const dn = Math.sqrt(na) * Math.sqrt(nb); resemblance = dn > 0 ? d / dn : 0;
      }
    } catch { /* resemblance best-effort */ }
    // keep the BEST rendition (practice improves it); first drawing always stored
    if (!e.drawing || resemblance >= (e.drawResemblance || 0)) {
      e.drawing = drawnRec;
      e.drawResemblance = resemblance;
      e.drawnAt = Date.now();
      store.delete(key); store.set(key, e);   // touch → LRU freshen
      if (!(this._drawSkill instanceof Map)) this._drawSkill = new Map();
      this._drawSkill.set(key, Math.max(this._drawSkill.get(key) || 0, resemblance));
      if (typeof this._vmSaveSoon === 'function') this._vmSaveSoon();
    }
  },

  // TU.29.13 GROUNDING LOOPS — REMOVED (Gee 2026-07-15). _conceptImageryLoop
  // (browser-broadcast a generate so a feeder could harvest it back) and the
  // stage-0 _scribbleStrokes neuron-doodle are superseded by the DRAW-ENGINE:
  // grounding now runs HEADLESS via _fetchReferenceAndGround (no browser), and
  // she draws real traced form via _drawConcept, not a neuron constellation.

  // ── DRAW-ENGINE (Gee 2026-07-15) — SHE DRAWS WHAT SHE LOOKED AT ──────────────────────────────
  // The creativity engine that IS her mind — NOT a menu of shapes she's allowed
  // to draw. She draws any concept dynamically: recall the field C of a thing she
  // has SEEN (grounded), or LOOK IT UP (definition-driven Pollinations reference,
  // perceived headlessly into a field C), then TRACE that field into her hand's
  // strokes (traceField) and stylize the trace in her goth palette. No shape is
  // assigned to a word; the FORM comes from an image she actually looked at. If
  // she can ground nothing (never seen it, no reference), she draws NOTHING for it
  // yet — honest, like she stays silent on words she can't say — never a fake shape.
  async _drawConcept(concept, opts = {}) {
    if (!this.mindSpace || typeof this.mindSpace.traceLineArt !== 'function'
        || typeof this.mindSpace.sketch !== 'function') return null;
    const seed = String(concept || '').trim();
    if (!seed) return null;
    const key = (typeof this._vmContentTokens === 'function' ? (this._vmContentTokens(seed)[0] || '') : seed.toLowerCase().split(/\s+/)[0]) || '';
    if (!key) return null;

    // 1) RECALL — a confirmed grounded field C she has seen before (cooled).
    let rec = null, source = null;
    try {
      const hit = (typeof this._recallVisualMemory === 'function') ? this._recallVisualMemory(seed) : null;
      if (hit && hit.rec) { rec = hit.rec; source = 'recall:' + (hit.matched || [key]).join('+'); }
    } catch { /* recall best-effort */ }

    // 2) PROVISIONAL — a reference she looked up once but hasn't confirmed. Recall
    //    skips conf:false entries (they stay out of grounded sem), but she can
    //    still DRAW from one look — that's exactly reference-not-fact.
    if (!rec) {
      try {
        const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
        const e = store && store.get(key);
        if (e && e.rec && (typeof this._recDetail !== 'function' || this._recDetail(e.rec) >= 200)) { rec = e.rec; source = 'ref:' + key; }
      } catch { /* store peek best-effort */ }
    }

    // 3) LOOK IT UP — never seen it: fetch a definition-driven reference, perceive
    //    it into a field C headlessly, ground it provisionally, draw from it.
    if (!rec && typeof this._fetchReferenceAndGround === 'function' && opts.allowFetch !== false) {
      try { const fetched = await this._fetchReferenceAndGround(seed); if (fetched) { rec = fetched; source = 'lookup:' + key; } } catch { /* fetch best-effort */ }
    }

    if (!rec) return null;   // nothing grounded to draw from → honest no-drawing (never a fake shape)

    // 4) STYLE — she is NOT limited to one way of drawing (Gee: "not subject to
    //    limits on how or what she draws"). She varies her artistic style, STABLE
    //    per subject (a name-hash picks it, so re-drawing a thing stays consistent)
    //    across an extensible repertoire — more styles can join this list, no cap:
    //      • lineart   — clean single-ink contour sketch (her hand)
    //      • field     — a DETAILED posterized field render (her high-fidelity mode)
    // COLORFILL DROPPED (Gee 2026-07-15: "stop doing her basic vector crayon
    // drawings they are terrible"). The flat-colour-block style read as crude crayon
    // vectors; her TRACE (line-art) + detailed FIELD render + imagination are the
    // ideal. The traceColorFill primitive stays available (opts.style) but is out of
    // her auto-rotation.
    const side = (typeof this._drawCanvasSide === 'function') ? this._drawCanvasSide() : 96;
    // FIELD is her DEFAULT — the beautiful, detailed, COLORED recreation of what she
    // sees (Gee 2026-07-15: "WTF happened to her beautiful reacreations of seen
    // things! ... its all just white pencil drawlings on green the shit i told you
    // to get rid of originally"). The white-pencil line-art is NO LONGER auto-picked
    // for a single concept — it's a fallback only if the field render can't build,
    // and it's what imagination composition uses (strokes can't overlap as images).
    // Caller may still force a style via opts.style.
    // OWNART (Gee 2026-08-20) — HER OWN VERSION IS NOW THE DEFAULT for every
    // internal draw call too (practice, favourites, spontaneous art), not just the
    // chat ask. `field` and `lineart` remain reachable via `opts.style` because they
    // are still useful for SHOWING WHAT SHE SAW — they are just not a drawing, and
    // nothing calls them a drawing any more. `DREAM_DRAW_STYLE` can pin the old
    // behaviour on a box if it is ever needed for comparison.
    const style = (typeof opts.style === 'string')
      ? opts.style
      : (process.env.DREAM_DRAW_STYLE || 'own');
    if (style === 'own') {
      const own = await this._drawOwnCreation(seed, { ...opts, label: opts.label });
      if (own) return own;
      // She could not build a schema for anything in it — fall through to the
      // reference-render styles rather than returning nothing, and the label says
      // plainly which one it was (`canvas:draw:` = a render of what she saw).
    }

    // FIELD style returns a FINISHED drawn rec (no tracing/sketch) — the detailed
    // "immaculate" mode: a posterized full-res render of the reference in her own
    // rendering. Falls through to line-art ONLY if it can't render.
    if (style === 'field' && typeof this.mindSpace.stylizeField === 'function') {
      let fr = null;
      const labelStrokes = this._labelStrokes(key);   // she writes the word on the field render too
      try { fr = await this.mindSpace.stylizeField(rec, { traceSide: Math.max(160, Math.min(side, 256)), bands: 7, labelStrokes }); } catch { fr = null; }   // ONE PROCESS - async (donor GPU when capable)
      if (fr) { this._lastSketchLabel = 'canvas:draw:' + key; return { rec: fr, label: this._lastSketchLabel, source: 'canvas:draw:' + key, from: source || ('draw:' + key), style }; }
    }

    // ZERO DUMBING (Gee 2026-07-15: "rip out BOTH gates ... always max detail, new
    // concept = mastered concept, K quality == PhD quality, zero intentional
    // limits"). Every drawing is her FULL capability — NO per-concept skill floor,
    // NO grade cap. Max-detail trace params, constant: a never-seen concept draws as
    // finely as a practiced one. `_drawSkill` / `_rememberDrawing` still keep her
    // BEST rendition (remember-in-relation) but NEVER gate detail — improvement is
    // best-kept + a growing reference library, never a coarse first attempt.
    // STROKE styles — build strokes, then sketch() rasterizes them onto her paper.
    const traceSide = Math.max(128, Math.min(Math.round(side * 0.5), 224));
    const maxStrokes = Math.max(80, Math.min(Math.round(side / 2.5), 220));
    const edgeThresh = 0.15;
    const minLenFrac = 0.06;
    let strokes = null;
    try {
      if (style === 'colorfill' && typeof this.mindSpace.traceColorFill === 'function') {
        const fills = this.mindSpace.traceColorFill(rec, { traceSide: Math.min(traceSide, 96), cells: 34 }) || [];
        const outline = (await this.mindSpace.traceLineArt(rec, { traceSide, maxStrokes, edgeThresh: edgeThresh + 0.02, minLenFrac: minLenFrac + 0.02, simplify: 1.0, ink: [24, 22, 28] })) || [];
        strokes = fills.concat(outline);   // flat colour under, dark ink outline on top
      } else {
        // lineart (default): ONE coherent chalk ink — no per-stroke recolor (the old
        // _stylizeStrokes random-hue was the "multicolored yarn").
        strokes = await this.mindSpace.traceLineArt(rec, { traceSide, maxStrokes, edgeThresh, minLenFrac, simplify: 1.0, ink: [228, 226, 230] });   // ONE PROCESS - async
      }
    } catch { return null; }
    if (!strokes || !strokes.length) return null;

    // 5) HAND — she writes the WORD of what she drew, in her own CLEAN trained hand
    //    (light legible ink on dark paper; NO wobble — wobble dumbs her down).
    try { for (const g of this._labelStrokes(key)) strokes.push(g); } catch { /* label best-effort */ }

    let drawn = null;
    try { drawn = await this.mindSpace.sketch(strokes, { maxSide: side, mood: { arousal: this.arousal, valence: this.valence } }); } catch { return null; }
    if (!drawn) return null;
    this._lastSketchLabel = 'canvas:draw:' + key;
    // The RETURNED rec is her DRAWING, labeled canvas:draw: — the reference it came
    // from (recall/ref/lookup) published itself separately, so the viewer shows the
    // reference she saw THEN her drawing of it, distinctly.
    return { rec: drawn, label: this._lastSketchLabel, source: 'canvas:draw:' + key, from: source || ('draw:' + key), style };
  },

  // ── OWNART (Gee 2026-08-20) — SHE DRAWS HER OWN VERSION, NOT A FILTERED PHOTO ──
  //
  // Gee, verbatim: *"she needs to not just copy it completely only to add filters to
  // them and say she drew them, instead she will attemp completely new creations
  // trying to replicate similar types of images but in ther own unique style outlay
  // and apperance, NOT JUST APPLY LAYERS AND FILTERS to a pollinations image and
  // calling it a draw... Unity needs to create new and her owen versions xcompletely
  // unique learning from what shes seen and understands via dictionary and
  // apperances of the word"*.
  //
  // HE IS RIGHT ABOUT THE OLD PATH. `_drawConcept`'s default style was `field` →
  // `stylizeField(rec)`, a 7-band posterize of the perceived reference; the
  // alternative was `traceLineArt(rec)`, an edge-trace of the same frame. Both are
  // transforms OF a downloaded image, published as `canvas:draw:<word>`. That is a
  // filter, not a drawing, and no amount of palette choice changes it.
  //
  // THIS path never touches the reference's field C at render time. The ONLY thing
  // that crosses from looking to drawing is the SHAPE SCHEMA (`_learnShapeSchema`):
  // ≤9 coarse part cells with {cx, cy, w, h, ang, weight}, an aspect ratio, and a
  // colour family — a few dozen numbers, ~1-2% of the reference's information. She
  // then CONSTRUCTS marks from that understanding: her own stroke counts, her own
  // arcs, her own palette, her own layout, varied per attempt by a seeded RNG so two
  // drawings of the same word are genuinely different attempts rather than one cached
  // output. Copying is not merely discouraged here, it is IMPOSSIBLE — the pixels are
  // not in scope.
  //
  // What makes it a LIKENESS rather than noise is the same thing that makes a human
  // sketch one: layout knowledge (mass low-centre, limbs at the bottom, head upper),
  // proportion, and the definition's part-words contributing their own schemas.
  //
  // Variation is STYLE, never tremor — no hand-wobble, no child-mimicry, no skill
  // floor (that law stands: her grade shows in what she KNOWS, never in an applied
  // filter that degrades her hand).
  // DRAWCTX — is this an ask for HER HAND? The DRAW verbs mean she makes marks
  // (draw / sketch / doodle / illustrate / paint-by-hand). The GENERATOR words
  // (picture / photo / image / render / generate) mean she asks Pollinations for a
  // picture, which is a different act and stays honest about being one. "Paint" is
  // hers — a painter uses a hand. Input classification only: verbs from the user's
  // own message, no model, no keyword table of subjects.
  _detectDrawRequest(text) {
    const t = String(text || '').toLowerCase();
    if (!t) return false;
    if (!/\b(draw|drawing|sketch|sketching|doodle|doodling|illustrate|paint|painting)\b/.test(t)) return false;
    // "send me a drawing of a photo" style asks still count — the verb is hers.
    // But a pure generator ask that merely mentions the word (e.g. "generate a
    // painting-style photo") should stay with the generator.
    if (/\b(generate|render)\b/.test(t) && !/\b(draw|sketch|doodle|illustrate)\b/.test(t)) return false;
    return true;
  },

  async _drawOwnCreation(text, opts = {}) {
    if (!this.mindSpace || typeof this.mindSpace.sketch !== 'function') return null;
    const plan = await this._drawPlanFromMessage(text, opts);
    if (!plan || !plan.subjects.length) return null;

    // Per-attempt seed: the words + her live mood + the attempt counter. Same words
    // on a different day (or a different mood) compose differently — that is her
    // having a style rather than a cache.
    this._ownArtAttempt = (this._ownArtAttempt || 0) + 1;
    const seedStr = plan.subjects.map(s => s.word).join('|')
      + '|' + Math.round((this.arousal ?? 0.5) * 7)
      + '|' + Math.round((this.valence ?? 0.5) * 7)
      + '|' + this._ownArtAttempt;
    const rnd = this._ownArtRng(seedStr);
    // ARTSTYLE — one style per artwork, mood-weighted, never her last one.
    // The whole piece (ground, every subject, label ink) rides the same hand.
    // ARTLEARN — the subjects' human-accepted styles weight the pick.
    const artStyle = (typeof this._artStylePick === 'function') ? this._artStylePick(rnd, plan.subjects.map(s => s.word)) : null;

    const side = Number(process.env.DREAM_OWNART_CANVAS) > 0
      ? Number(process.env.DREAM_OWNART_CANVAS)
      : ((typeof this._drawCanvasSide === 'function') ? this._drawCanvasSide() : 512);

    const strokes = [];
    // BACKDROP (PAINT.8) — the place is a full SCENE behind the subjects, not a
    // ground line with tufts. Same law as the subjects: looked-at places redraw
    // her remembered trace; known-but-unseen places paint from the definition.
    if (plan.place) {
      for (const st of this._backdropStrokes(plan.place, artStyle, rnd)) strokes.push(st);
    }
    // SUBJECTS — main one centred and largest; companions flank it, smaller.
    // PAINT.12 — placement/scale WOBBLE per attempt: the composition itself
    // shifts a little between pieces, on top of the mirror + stroke-subset
    // variation inside the subject builder.
    const layout = this._ownArtLayout(plan.subjects.length, rnd);
    const boxes = [];
    for (let i = 0; i < plan.subjects.length; i++) {
      const s = plan.subjects[i];
      const b0 = layout[i];
      const box = {
        cx: Math.min(0.85, Math.max(0.15, b0.cx + (rnd() - 0.5) * 0.06)),
        cy: Math.min(0.85, Math.max(0.15, b0.cy + (rnd() - 0.5) * 0.04)),
        w: b0.w * (0.9 + rnd() * 0.2),
        h: b0.h * (0.9 + rnd() * 0.2),
      };
      boxes.push(box);
      // PAINT.10 — grounding shadow FIRST (under the subject), so it stands
      // on the ground instead of floating. The shadow rides the STYLE-SCALED
      // footprint (a doodle draws small inside its box; judged live — the
      // shadow floated below the feet on the raw box).
      const ss = artStyle && Number.isFinite(artStyle.scale) ? artStyle.scale : 1;
      strokes.push(this._groundShadow({ cx: box.cx, cy: box.cy, w: box.w * ss, h: box.h * ss }, rnd));
      const built = this._ownArtStrokesFromSchema(s.schema, box, rnd, s.word, artStyle);
      for (const st of built) { if (!st.layer) st.layer = 'subject'; strokes.push(st); }
    }
    if (strokes.length < 4) return null;   // nothing she understood well enough → honest no-drawing

    // PAINT.11 — HER REVISION PASS: step back, erase what hurts the picture.
    // Backdrop lines running through a subject get erased (occlusion — the
    // subject is in FRONT); near-duplicate strokes collapse.
    let revised = { strokes, erased: 0, deduped: 0 };
    try { revised = this._reviseComposition(strokes, boxes); } catch { /* revision best-effort — the unrevised piece still stands */ }
    const finalStrokes = revised.strokes;

    // Her hand writes what she drew (her existing trained glyphs, no wobble).
    if (opts.label !== false) {
      try { for (const g of this._labelStrokes(plan.subjects[0].word)) finalStrokes.push(g); } catch { /* label best-effort */ }
    }

    let drawn = null;
    try {
      drawn = await this.mindSpace.sketch(finalStrokes, {
        maxSide: side,
        mood: { arousal: this.arousal, valence: this.valence },
      });
    } catch { return null; }
    if (!drawn) return null;
    // ARTSTYLE — the style rides the label so the viewer SHOWS her changing it up.
    const styleName = artStyle ? artStyle.name : 'poster';
    const label = 'canvas:own:' + plan.subjects.map(s => s.word).join('+') + ':' + styleName;
    this._lastSketchLabel = label;
    const known = plan.subjects.map(s => `${s.word}(${s.schema ? (s.schema.looks || 1) + ' look' + ((s.schema.looks || 1) === 1 ? '' : 's') + ', ' + s.schema.parts.length + ' parts' : 'no schema — drawn from definition only'})`).join(', ');
    try { console.log(`[OwnArt] ✍ HER OWN "${plan.subjects.map(s => s.word).join(' + ')}"${plan.place ? ' in ' + plan.place.word : ''} in ${styleName.toUpperCase()} — ${finalStrokes.length} marks (revised: ${revised.erased} erased, ${revised.deduped} deduped), attempt #${this._ownArtAttempt}. Learned from: ${known}. No reference pixels used.`); } catch { /* nf */ }
    return { rec: drawn, label, source: label, from: 'own:' + plan.subjects.map(s => s.word).join('+'), style: styleName, plan: { subjects: plan.subjects.map(s => s.word), place: plan.place ? plan.place.word : null } };
  },

  // DRAWCTX (Gee 2026-08-20: *"when Unity is told to 'draw' she should draw the
  // topic, thing, place, person, in context in the message from the user"*).
  //
  // The old path took `_vmContentTokens(seed)[0]` — the FIRST content word — so
  // "draw a <modifier> <subject> sitting on a <place>" drew whatever the modifier
  // resolved to and threw the rest away. This reads the WHOLE message: every
  // drawable noun in order, the PLACE if one is named, and the modifiers that
  // belong to each. Drawability is the existing dictionary POS check (`noun` sense
  // required), so it stays her own learned dictionary — no text model, no keyword
  // table.
  async _drawPlanFromMessage(text, opts = {}) {
    const raw = String(text || '');
    if (!raw.trim()) return null;
    // Strip the command framing but KEEP the subject and its context.
    const body = raw
      .replace(/^[\s,]*(hey|yo|ok|okay|unity|can you|could you|would you|will you|please|pls)\b/gi, ' ')
      .replace(/\b(a picture of|an image of|a photo of|a drawing of|a painting of|picture of|image of|photo of|pic of|drawing of|painting of)\b/gi, ' ')
      .replace(/\b(draw|sketch|paint|render|illustrate|generate|create|make|show me|give me|for me)\b/gi, ' ')
      .replace(/[\s,]+/g, ' ')
      .trim();
    if (!body) return null;
    // PLACE cue — the prepositional tail names where the thing IS, which is context,
    // not another subject ("on a gravestone", "in the woods", "at school").
    let placeWord = null;
    const pm = body.match(/\b(?:on|in|at|under|inside|beside|near|by|over|behind|against)\s+(?:a|an|the)?\s*([a-z][a-z'-]{2,})/i);
    if (pm) placeWord = pm[1].toLowerCase();
    const tokens = (typeof this._vmContentTokens === 'function') ? this._vmContentTokens(body) : body.toLowerCase().split(/\s+/);
    const seen = new Set();
    const subjects = [];
    const MAX_SUBJ = Number(process.env.DREAM_OWNART_MAX_SUBJECTS) > 0 ? Number(process.env.DREAM_OWNART_MAX_SUBJECTS) : 3;
    for (const t of tokens) {
      if (seen.has(t) || t === placeWord) continue;
      seen.add(t);
      let drawable = true;
      try { if (typeof this._conceptIsDrawable === 'function') drawable = await this._conceptIsDrawable(t); } catch { drawable = false; }   // DRAWGATE — a gate error refuses; scribbling at an unverified word never is honest
      if (!drawable) continue;
      const schema = await this._ownArtSchemaFor(t, opts);
      subjects.push({ word: t, schema });
      if (subjects.length >= MAX_SUBJ) break;
    }
    if (subjects.length === 0) return null;
    let place = null;
    if (placeWord) {
      const ps = await this._ownArtSchemaFor(placeWord, { ...opts, allowFetch: false });   // a place need not cost a look-up
      place = { word: placeWord, schema: ps };
    }
    return { subjects, place, body };
  },

  // The schema she will draw FROM: what she already learned, else learn one from a
  // percept she already holds, else (optionally) one look-up. Never returns pixels.
  async _ownArtSchemaFor(word, opts = {}) {
    try {
      const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
      const e = store && store.get(word);
      if (e && e.schema && Array.isArray(e.schema.parts) && e.schema.parts.length) return e.schema;
      // She HAS seen it but never abstracted it — learn the schema now, from the
      // percept she already holds (no fetch, no pollen).
      if (e && e.rec && typeof this._learnShapeSchema === 'function') {
        const s = await this._learnShapeSchema(word, e.rec);
        if (s) return s;
      }
      // Never seen it: one definition-driven look, then abstract THAT and throw the
      // frame away. The look-up is how she learns an appearance; it is not the canvas.
      if (opts.allowFetch !== false && typeof this._fetchReferenceAndGround === 'function') {
        const rec = await this._fetchReferenceAndGround(word);
        if (rec && typeof this._learnShapeSchema === 'function') return await this._learnShapeSchema(word, rec);
      }
    } catch { /* schema best-effort — a subject with no schema still draws from its definition */ }
    return null;
  },

  // Deterministic small RNG (xorshift32) seeded from a string. Same seed → same
  // drawing; the seed carries her mood + attempt number, so her hand VARIES without
  // being random noise.
  _ownArtRng(seedStr) {
    let h = 2166136261 >>> 0;
    const s = String(seedStr || 'unity');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    let x = (h || 123456789) >>> 0;
    return function next() {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  },

  // Where each subject sits on her page. One subject = centred and big; two = side by
  // side; three = a triangle. Her composition, not the reference's framing.
  _ownArtLayout(n, rnd) {
    const j = () => 0.03 * (rnd() - 0.5);
    if (n <= 1) return [{ cx: 0.5 + j(), cy: 0.52 + j(), w: 0.62, h: 0.62 }];
    if (n === 2) return [
      { cx: 0.34 + j(), cy: 0.54 + j(), w: 0.42, h: 0.50 },
      { cx: 0.70 + j(), cy: 0.52 + j(), w: 0.38, h: 0.46 },
    ];
    return [
      { cx: 0.36 + j(), cy: 0.58 + j(), w: 0.38, h: 0.44 },
      { cx: 0.68 + j(), cy: 0.60 + j(), w: 0.32, h: 0.38 },
      { cx: 0.52 + j(), cy: 0.32 + j(), w: 0.30, h: 0.32 },
    ];
  },

  // HER INK. Starts from her own register (goth: near-black lines, bone-white and a
  // pink accent) and leans a little toward the learned colour family so a lemon is
  // yellow-ish and a raven is not. The lean is deliberately partial — the thing's
  // colour is knowledge, the rendering is hers.
  _ownArtInk(schema, strength, rnd) {
    const base = [
      [228, 226, 230],   // bone
      [36, 34, 40],       // near-black
      [214, 88, 140],     // her pink
    ][Math.floor(rnd() * 3) % 3];
    const fam = (schema && Array.isArray(schema.palette) && schema.palette.length)
      ? schema.palette[Math.floor(rnd() * schema.palette.length) % schema.palette.length]
      : null;
    if (!fam) return base;
    const k = Math.max(0, Math.min(1, strength ?? 0.5)) * 0.6;   // never more than 60% the learned colour
    return [
      Math.round(base[0] * (1 - k) + fam[0] * k),
      Math.round(base[1] * (1 - k) + fam[1] * k),
      Math.round(base[2] * (1 - k) + fam[2] * k),
    ];
  },

  // CONSTRUCT the marks for one subject inside its box. This is the actual drawing:
  // every stroke is generated from the schema's numbers, never sampled from an image.
  // A part with more weight gets more marks (that is where the thing's mass is), and
  // each mark is an ARC she draws across the part rather than a traced contour.
  // ── ARTSTYLE (2026-08-21) — THE STYLE ENGINE. She has one TOOLKIT but was
  // painting in one STYLE. Each named style below is a parameterization of the
  // same primitives (mass treatment, outline weight, ink mode, detail density,
  // alpha) — her knowledge of the subject is identical across all of them; the
  // HAND changes. The picker is mood-weighted and NEVER repeats her last style,
  // so consecutive pieces come out visibly different — pencil one time, a
  // watercolor wash the next, ink, dots, crayon scribble, a loose doodle.
  _artStyles() {
    return [
      // mass: how the body of the thing goes down; ink: color source; outlineW/alpha; detailMul; scale
      { name: 'poster',      mass: 'fill',     ink: 'palette',  outlineW: 0.010, outlineA: 1.0, detailMul: 1.0, scale: 1.0 },
      { name: 'pencil',      mass: 'hatch',    ink: 'graphite', outlineW: 0.004, outlineA: 0.9, detailMul: 1.6, scale: 1.0 },
      { name: 'ink',         mass: 'none',     ink: 'mono',     outlineW: 0.013, outlineA: 1.0, detailMul: 0.4, scale: 1.0 },
      { name: 'watercolor',  mass: 'wash',     ink: 'palette',  outlineW: 0.006, outlineA: 0.5, detailMul: 0.5, scale: 1.0 },
      { name: 'pointillism', mass: 'dots',     ink: 'palette',  outlineW: 0,     outlineA: 0.4, detailMul: 0.2, scale: 1.0 },
      { name: 'crosshatch',  mass: 'xhatch',   ink: 'graphite', outlineW: 0.006, outlineA: 0.9, detailMul: 0.8, scale: 1.0 },
      { name: 'crayon',      mass: 'scribble', ink: 'palette',  outlineW: 0.012, outlineA: 0.9, detailMul: 0.6, scale: 1.0 },
      { name: 'doodle',      mass: 'fill',     ink: 'palette',  outlineW: 0.006, outlineA: 1.0, detailMul: 0.7, scale: 0.55 },
    ];
  },
  _artStylePick(rnd, subjectWords) {
    const styles = this._artStyles();
    const arousal = (typeof this.arousal === 'number') ? this.arousal : 0.5;
    const valence = (typeof this.valence === 'number') ? this.valence : 0;
    // ARTLEARN — her LEARNED taste for these subjects: every human-accepted
    // drawing banked its style per concept, and those verdicts weight the
    // rotation for that subject from then on. Learning from her drawing —
    // the critic's accepts become her style preferences.
    const learned = {};
    try {
      if (Array.isArray(subjectWords) && subjectWords.length && typeof this._vmStore === 'function') {
        const store = this._vmStore();
        for (const sw of subjectWords) {
          const e = store && store.get(String(sw).toLowerCase());
          const st = e && e.art && e.art.styles;
          if (st) for (const [k, n] of Object.entries(st)) learned[k] = (learned[k] | 0) + (n | 0);
        }
      }
    } catch { /* no learned taste — mood weights stand alone */ }
    // Mood weights: high arousal favors bold (ink/poster/crayon), low valence
    // favors graphite moods (pencil/crosshatch), dreaminess favors soft
    // (watercolor/pointillism). All styles always possible — weights, not gates.
    const w = styles.map(s => {
      let wt = 1;
      if (arousal > 0.65 && (s.name === 'ink' || s.name === 'poster' || s.name === 'crayon')) wt += 1.2;
      if (valence < -0.1 && (s.name === 'pencil' || s.name === 'crosshatch')) wt += 1.2;
      if (arousal < 0.45 && (s.name === 'watercolor' || s.name === 'pointillism')) wt += 1.2;
      // COLORART — color-mass hands lead the rotation: the judged complaint
      // was monotone line-only pieces, so the styles that PAINT (fill/wash)
      // weigh double and mass-less line styles stay the occasional change-up.
      if (s.mass === 'fill' || s.mass === 'wash') wt *= 2;
      else if (s.mass === 'none') wt *= 0.5;
      if (learned[s.name]) wt *= 1 + Math.min(3, learned[s.name]);   // accepted hands lead for this subject
      if (this._lastArtStyle === s.name) wt = 0;   // she always changes it up
      return wt;
    });
    const total = w.reduce((a2, b2) => a2 + b2, 0) || 1;
    let roll = rnd() * total;
    let pick = styles[0];
    for (let i = 0; i < styles.length; i++) { roll -= w[i]; if (roll <= 0) { pick = styles[i]; break; } }
    this._lastArtStyle = pick.name;
    return pick;
  },
  // Ink for a style: graphite = warm grays, mono = near-black, palette = the
  // learned palette (via _ownArtInk) tinted by the definition color when known.
  _artInk(style, schema, strength, rnd, defColor) {
    if (style && style.ink === 'graphite') { const g = 70 + Math.round(rnd() * 70) + Math.round(strength * 40); return [g, g, Math.min(255, g + 6)]; }
    // mono = LIGHT ink — her paper is a dark sketchbook page, so black ink is
    // invisible on it (harness-caught: 0.1% coverage). A pale gel-pen line is
    // the ink look that actually reads on her canvas.
    if (style && style.ink === 'mono') { const g = 205 + Math.round(rnd() * 40); return [g, g, Math.min(255, g + 8)]; }
    // PAINT.6 — THE SUBJECT'S COLOR DOMINATES. The live judged test rendered a
    // gray/cream subject HOT PINK because _ownArtInk caps the learned palette at
    // strength×0.6 (typically 15-30%) against base inks that include her pink.
    // For subject paint, the LEARNED color family leads at 75%; her hand keeps
    // a 25% tint. Her goth identity lives in the paper, the ink accents and the
    // style choice — not in repainting every subject pink.
    const fam = (schema && Array.isArray(schema.palette) && schema.palette.length)
      ? schema.palette[Math.floor(rnd() * schema.palette.length) % schema.palette.length]
      : null;
    // NEONKILL — no learned palette and no definition color = a NEUTRAL sketch
    // tone, never her pink tint on the subject's own body (operator: neon-pink
    // on a subject whose real colors she has simply not looked up yet).
    const base = (fam || defColor) ? this._ownArtInk(null, strength, rnd)
      : [142 + Math.round(rnd() * 24), 132 + Math.round(rnd() * 20), 118 + Math.round(rnd() * 18)];
    let ink = base;
    if (fam) {
      const k = 0.75;
      ink = [Math.round(base[0] * (1 - k) + fam[0] * k), Math.round(base[1] * (1 - k) + fam[1] * k), Math.round(base[2] * (1 - k) + fam[2] * k)];
    }
    if (defColor) return [Math.round(ink[0] * 0.45 + defColor[0] * 0.55), Math.round(ink[1] * 0.45 + defColor[1] * 0.55), Math.round(ink[2] * 0.45 + defColor[2] * 0.55)];
    return ink;
  },
  // Mass treatments — every one built from the same primitives.
  _artMass(out, style, cx, cy, pw, ph, ang, rgb, rnd) {
    const m = style ? style.mass : 'fill';
    if (m === 'none') return;
    if (m === 'fill') { out.push({ type: 'blob', cx, cy, rx: pw * 0.55, ry: ph * 0.55, ang, rgb }); return; }
    if (m === 'wash') {
      // 2-3 overlapping translucent blobs, lightened — paint that mixes with the paper
      const n = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const lt = [Math.min(255, rgb[0] + 45), Math.min(255, rgb[1] + 45), Math.min(255, rgb[2] + 45)];
        out.push({ type: 'blob', cx: cx + (rnd() - 0.5) * pw * 0.25, cy: cy + (rnd() - 0.5) * ph * 0.25, rx: pw * (0.45 + rnd() * 0.2), ry: ph * (0.45 + rnd() * 0.2), ang: ang + (rnd() - 0.5) * 0.4, rgb: lt, a: 0.30 + rnd() * 0.15 });
      }
      return;
    }
    if (m === 'hatch' || m === 'xhatch') {
      const passes = m === 'xhatch' ? [ang, ang + Math.PI / 2.2] : [ang];
      for (const pa of passes) {
        const n = Math.max(3, Math.round(Math.max(pw, ph) * 30));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n - 0.5;
          const ox = -Math.sin(pa) * t * ph, oy = Math.cos(pa) * t * pw;
          const len = Math.max(pw, ph) * (0.7 + rnd() * 0.3);
          out.push({ type: 'line', x0: cx + ox - Math.cos(pa) * len * 0.5, y0: cy + oy - Math.sin(pa) * len * 0.5, x1: cx + ox + Math.cos(pa) * len * 0.5, y1: cy + oy + Math.sin(pa) * len * 0.5, rgb, a: 0.65 });
        }
      }
      return;
    }
    if (m === 'dots') {
      const n = Math.max(12, Math.round(pw * ph * 2600));
      for (let i = 0; i < n; i++) {
        const a2 = rnd() * Math.PI * 2, rr = Math.sqrt(rnd());
        out.push({ type: 'point', x: cx + Math.cos(a2) * rr * pw * 0.5, y: cy + Math.sin(a2) * rr * ph * 0.5, r: 1, rgb: [Math.max(0, rgb[0] + Math.round((rnd() - 0.5) * 50)), Math.max(0, rgb[1] + Math.round((rnd() - 0.5) * 50)), Math.max(0, rgb[2] + Math.round((rnd() - 0.5) * 50))] });
      }
      return;
    }
    if (m === 'scribble') {
      // one continuous waxy zigzag filling the part — crayon pressure via alpha
      const n = Math.max(6, Math.round(ph * 46));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n - 0.5;
        pts.push([cx + (i % 2 === 0 ? -1 : 1) * pw * (0.42 + rnd() * 0.1), cy + t * ph]);
      }
      out.push({ type: 'poly', pts, rgb, w: 0.006, a: 0.85 });
      return;
    }
  },

  // ── PAINT.8 (2026-08-21) — THE BACKDROP LAYER. Any background, three tiers,
  // mirroring the subject pipeline exactly: (1) a place she has LOOKED AT
  // paints as a horizon wash in the place's real palette plus her remembered
  // trace of it, faint and full-canvas, behind everything; (2) a place she only
  // KNOWS paints as sky/ground washes tinted by the definition's color words;
  // (3) both keep the humble ground line + tufts so a subject always stands on
  // something. Alpha does the depth: the scene sits back, the subject pops.
  _backdropStrokes(place, style, rnd) {
    const out = [];
    if (!style) style = this._artStyles()[0];
    const ps = place && place.schema;
    // ── PAINT.9 — SCENE SPACE. A real painter sets the SPACE first: a horizon,
    // a vanishing point, and (indoors) the wall/floor junction with floor lines
    // converging in perspective. Both vary per attempt — the same place drawn
    // twice sits in a slightly different space, like a person choosing a view.
    const g = 0.62 + 0.14 * rnd();                       // horizon / wall-floor junction
    const vpx = 0.35 + 0.3 * rnd();                      // vanishing point x on the horizon
    const defAttr = this._defDrawAttributes ? this._defDrawAttributes(place && place.word) : null;
    const defC = defAttr && defAttr.colors && defAttr.colors[0];
    const pal = (ps && Array.isArray(ps.palette) && ps.palette.length) ? ps.palette : null;
    // interior? — by word class or by the definition naming a room/indoor space
    const pw = String((place && place.word) || '').toLowerCase();
    const INTERIOR = /^(room|kitchen|bedroom|bathroom|office|hall|hallway|classroom|library|attic|basement|garage|studio|interior)$/.test(pw)
      || (() => { try { const cx2 = this.cortexCluster; const d = cx2 && typeof cx2.lookupDefinitionSync === 'function' ? cx2.lookupDefinitionSync(pw) : null; return !!(d && /\b(room|indoor|interior|inside a building|of a house)\b/i.test(d)); } catch { return false; } })();
    const paintsMass = style.mass !== 'none';   // pencil-class styles keep bare paper
    const skyC = pal ? pal[Math.min(1, pal.length - 1)] : (defC ? [Math.min(255, defC[0] + 60), Math.min(255, defC[1] + 60), Math.min(255, defC[2] + 60)] : [96, 104, 120]);
    const gndC = pal ? pal[0] : (defC || [88, 84, 76]);
    const dark = (c, k) => [Math.max(0, Math.round(c[0] * k)), Math.max(0, Math.round(c[1] * k)), Math.max(0, Math.round(c[2] * k))];
    if (paintsMass) {
      if (INTERIOR) {
        // WALLS above the junction, FLOOR painted below — the floor gets two
        // value bands (near = lighter, far = darker) so the plane reads.
        out.push({ type: 'fill', pts: [[0, 0], [1, 0], [1, g], [0, g]], rgb: skyC, a: 0.35 });
        out.push({ type: 'fill', pts: [[0, g], [1, g], [1, 1], [0, 1]], rgb: dark(gndC, 0.85), a: 0.45 });
        out.push({ type: 'fill', pts: [[0, (g + 1) / 2], [1, (g + 1) / 2], [1, 1], [0, 1]], rgb: gndC, a: 0.3 });
      } else {
        // EXTERIOR: full sky in two graded bands (deeper up top), full ground
        // in two graded bands (darker toward the horizon = distance).
        out.push({ type: 'fill', pts: [[0, 0], [1, 0], [1, g * 0.55], [0, g * 0.55]], rgb: dark(skyC, 0.8), a: 0.35 });
        out.push({ type: 'fill', pts: [[0, g * 0.55], [1, g * 0.55], [1, g], [0, g]], rgb: skyC, a: 0.35 });
        out.push({ type: 'fill', pts: [[0, g], [1, g], [1, (g + 1) / 2], [0, (g + 1) / 2]], rgb: dark(gndC, 0.8), a: 0.35 });
        out.push({ type: 'fill', pts: [[0, (g + 1) / 2], [1, (g + 1) / 2], [1, 1], [0, 1]], rgb: gndC, a: 0.4 });
      }
    }
    // wall/floor junction (interior) or horizon line (exterior)
    out.push({ type: 'line', x0: 0.02, y0: g, x1: 0.98, y1: g + (INTERIOR ? 0 : 0.015 * (rnd() - 0.5)), rgb: this._ownArtInk(ps, 0.55, rnd), a: 0.75 });
    if (INTERIOR) {
      // perspective floor lines converging on the vanishing point + a corner
      const nfl = 4 + Math.floor(rnd() * 3);
      for (let i = 0; i <= nfl; i++) {
        const xb = i / nfl;   // where the line meets the bottom edge
        out.push({ type: 'line', x0: xb, y0: 1, x1: vpx, y1: g, rgb: this._ownArtInk(ps, 0.4, rnd), a: 0.45 });
      }
      const cornerX = rnd() < 0.5 ? 0.12 + rnd() * 0.1 : 0.78 + rnd() * 0.1;
      out.push({ type: 'line', x0: cornerX, y0: 0.04, x1: cornerX, y1: g, rgb: this._ownArtInk(ps, 0.5, rnd), a: 0.6 });
    } else {
      // PAINT.9 — depth-graded ground texture: strokes shrink and crowd toward
      // the horizon (perspective), lean toward the vanishing point.
      const tufts = 10 + Math.floor(rnd() * 8);
      for (let i = 0; i < tufts; i++) {
        const y = g + rnd() * (1 - g);
        const depth = (y - g) / Math.max(1e-3, 1 - g);   // 0 at horizon → 1 near
        const x = 0.05 + rnd() * 0.9;
        const hh = (0.008 + 0.05 * depth) * (0.7 + 0.6 * rnd());
        const lean = (vpx - x) * 0.05 * (1 - depth);
        out.push({ type: 'line', x0: x, y0: y, x1: x + lean, y1: y - hh, rgb: this._ownArtInk(ps, 0.45, rnd), a: 0.5 + 0.3 * depth });
      }
    }
    // her remembered trace of the place, faint, full-canvas — the scene's read.
    // COLORART — scenery strokes render in the colors the place really had
    // there (per-stroke sampled), so a backdrop reads as a colored scene
    // instead of monotone squiggles all over the page (judged live).
    if (ps && Array.isArray(ps.trace) && ps.trace.length >= 10) {
      const ink = this._artInk(style, ps, 0.5, rnd, null);
      const jit = () => (rnd() - 0.5) * 0.006;
      const hasC = Array.isArray(ps.traceRgb) && ps.traceRgb.length;
      for (let i = 0; i < ps.trace.length; i++) {
        const tp = ps.trace[i];
        if (!Array.isArray(tp) || tp.length < 2) continue;
        const rc = hasC ? ps.traceRgb[i] : null;
        out.push({ type: 'poly', pts: tp.map(pp => [pp[0] + jit(), pp[1] + jit()]), rgb: Array.isArray(rc) ? rc : ink, a: 0.35, layer: 'backdrop' });
      }
    }
    for (const s of out) if (!s.layer) s.layer = 'backdrop';
    return out;
  },

  // ── PAINT.10 — THE GROUNDING SHADOW. The oldest trick in drawing: a squashed
  // dark ellipse where the subject meets the ground makes it STAND THERE
  // instead of floating. Light direction varies per attempt.
  _groundShadow(box, rnd) {
    const lightX = (rnd() - 0.5) * 0.5;
    return {
      type: 'blob',
      cx: box.cx + lightX * box.w * 0.15,
      cy: box.cy + box.h * 0.44,
      rx: box.w * (0.34 + rnd() * 0.08),
      ry: box.h * 0.05,
      ang: 0,
      rgb: [16, 15, 19],
      a: 0.35,
      layer: 'backdrop',
    };
  },

  // ── PAINT.11 — THE ERASER (her revision pass). A painter doesn't only add —
  // she steps back and REMOVES what hurts the picture. Two revisions, both
  // spatial understanding rather than decoration: (1) OCCLUSION — backdrop
  // lines must not run THROUGH a subject, so every backdrop stroke is split
  // and the segments inside any subject's box are erased (the subject is in
  // FRONT of the scene); (2) DE-CLUTTER — near-duplicate strokes (same span,
  // same place) collapse to one.
  _reviseComposition(strokes, subjectBoxes) {
    const inside = (x, y) => {
      for (const b of subjectBoxes) {
        if (Math.abs(x - b.cx) < b.w * 0.45 && Math.abs(y - b.cy) < b.h * 0.48) return true;
      }
      return false;
    };
    const out = [];
    const seen = new Set();
    let erased = 0, deduped = 0;
    for (const s of strokes) {
      if (!s) continue;
      if (s.layer === 'backdrop' && subjectBoxes.length) {
        if (s.type === 'line') {
          if (inside((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2)) { erased++; continue; }
        } else if (s.type === 'poly' && Array.isArray(s.pts)) {
          // split the polyline at subject boundaries; keep the outside runs
          let run = [];
          let kept = false;
          for (const pp of s.pts) {
            if (inside(pp[0], pp[1])) {
              if (run.length >= 2) { out.push({ ...s, pts: run }); kept = true; }
              if (run.length) erased++;
              run = [];
            } else run.push(pp);
          }
          if (run.length >= 2) { out.push({ ...s, pts: run }); kept = true; }
          else if (run.length && !kept) erased++;
          continue;
        }
        // fills stay — the subject paints over them, they ARE the space
      }
      // de-clutter: two strokes with the same coarse signature collapse to one
      if (s.type === 'poly' && Array.isArray(s.pts) && s.pts.length >= 2) {
        const a2 = s.pts[0], b2 = s.pts[s.pts.length - 1];
        const key = s.layer + '|' + Math.round(a2[0] * 40) + ',' + Math.round(a2[1] * 40) + '-' + Math.round(b2[0] * 40) + ',' + Math.round(b2[1] * 40) + '|' + s.pts.length;
        if (seen.has(key)) { deduped++; continue; }
        seen.add(key);
      }
      out.push(s);
    }
    return { strokes: out, erased, deduped };
  },

  // ── PAINT.5 — HER TRAINED TECHNIQUE. The hand has tunable parameters; practice
  // (below) nudges them per concept and keeps only what measurably improves the
  // resemblance of her drawing to her remembered percept. Defaults are exactly
  // the constants the hand used before practice existed — a concept she has
  // never practiced draws identically to yesterday.
  _skillDefaults() {
    return { jitter: 0.006, underA: 0.55, traceW: 1.0, keepP: 0.85, detailMul: 1.0 };
  },
  _skillFor(word) {
    const d = this._skillDefaults();
    try {
      const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
      const e = store && word ? store.get(String(word).toLowerCase()) : null;
      if (e && e.skill && e.skill.params) return { ...d, ...e.skill.params };
    } catch { /* defaults are the untrained hand */ }
    return d;
  },

  // ── ARTJUDGE (2026-08-21) — HUMAN CRITIQUE ON THE MIND'S EYE. The viewer
  // page carries ACCEPT / REJECT buttons: accept marks the drawing GOOD and
  // the verdict is held per concept; reject means it is bad and the concept is
  // RE-LOOKED-UP (fresh reference, cooldown force-bypassed), the dictionary
  // definition re-read, and the word REDRAWN — a fresh attempt lands on the
  // page. Verdicts persist on the visual-store entry (`e.art`), so she holds
  // quality information about her own drawings alongside the shapes.
  // The operator-taught NOT-DRAWABLE set: words judged "bad word, do not use
  // again — a non-drawable image" from the viewer's 🚫 button. This is HER
  // LEARNED experience data (per-word verdicts, like schemas), not a code
  // word list: it starts empty and only a human press adds to it. Persisted in
  // its own file so it survives fresh walks — an operator verdict is not
  // training state.
  _artBanSet() {
    if (this._artBans) return this._artBans;
    this._artBans = new Set();
    try {
      const fs = require('fs'); const path = require('path');
      const f = path.join(__dirname, '..', 'art-notdrawable.json');
      if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (Array.isArray(j)) for (const w of j) this._artBans.add(String(w)); }
    } catch { /* empty set — bans re-teachable */ }
    return this._artBans;
  },
  _artBanSave() {
    try {
      const fs = require('fs'); const path = require('path');
      fs.writeFileSync(path.join(__dirname, '..', 'art-notdrawable.json'), JSON.stringify([...this._artBanSet()].sort(), null, 1));
    } catch (e) { console.warn(`[OwnArt] not-drawable set save failed: ${e?.message || e}`); }
  },

  // REJECTGONE — swap the current mind's-eye frame for an honest note when it
  // names any of the given words (the rejected/banned picture must not keep
  // sitting on screen while its replacement is in flight).
  _artClearEyeIfShowing(words, note) {
    try {
      if (!this._mindsEyeJson) return;
      const cur = JSON.parse(this._mindsEyeJson);
      const src = String((cur && cur.source) || '').toLowerCase();
      if (words.some(w => src.includes(w))) {
        this._mindsEyeJson = JSON.stringify({ type: 'mindsEye', rec: null, terms: 0, at: Date.now(), note });
      }
    } catch { /* display swap best-effort */ }
  },

  _artFeedback(verdict, sourceLabel) {
    if (verdict !== 'accept' && verdict !== 'reject' && verdict !== 'ban') return { ok: false, why: 'bad verdict' };
    const now = Date.now();
    // global pacing — a button, not a firehose
    if (this._artFbAt && (now - this._artFbAt) < 1500) return { ok: false, why: 'too fast' };
    this._artFbAt = now;
    // parse the concept words out of the frame's source label
    const src = String(sourceLabel || '');
    const m = src.match(/^(?:canvas:own:|canvas:draw:|draw:fav:|lookup:)(.+)$/);
    if (!m) return { ok: false, why: 'not a judgeable frame' };
    // canvas:own labels are "<words>:<style>" — the style rides after the colon
    const segs = m[1].split(':');
    const words = segs[0].split('+').map(w => w.trim().toLowerCase()).filter(w => w && w.length > 1).slice(0, 3);
    const styleName = (src.startsWith('canvas:own:') && segs.length > 1) ? String(segs[segs.length - 1]).toLowerCase() : null;
    if (!words.length) return { ok: false, why: 'no concept in label' };
    const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
    const relearned = [];
    // 🚫 BAN — the word itself is a bad subject ("a bad word to not use
    // again, ie a none drawanble image"): remembered forever, gate consults
    // it first, her imagery of it dropped, never relearned or redrawn.
    if (verdict === 'ban') {
      const bans = this._artBanSet();
      for (const w of words) {
        bans.add(w);
        try { if (store && store.has(w)) store.delete(w); } catch { /* imagery drop best-effort */ }
      }
      this._artBanSave();
      this._artFeedbackStats = {
        accepts: (this._artFeedbackStats && this._artFeedbackStats.accepts) | 0,
        rejects: (this._artFeedbackStats && this._artFeedbackStats.rejects) | 0,
        bans: ((this._artFeedbackStats && this._artFeedbackStats.bans) | 0) + 1,
        lastWords: words, lastVerdict: 'ban', at: now,
      };
      try {
        const _c = this.cortexCluster;
        if (_c && typeof _c.pushEmission === 'function') _c.pushEmission({ source: 'art-feedback', text: words.join(' and ') + ' is not something to draw', ts: now });
      } catch { /* emission best-effort */ }
      try { console.log(`[OwnArt] 🚫 NOT DRAWABLE: "${words.join('+')}" — banned from her subjects (${bans.size} total), imagery dropped.`); } catch { /* nf */ }
      // REJECTGONE — a banned word's frame leaves the screen immediately too
      this._artClearEyeIfShowing(words, `she will never draw ${words.join(' + ')} again`);
      return { ok: true, verdict: 'ban', words };
    }
    for (const w of words) {
      // the verdict is held on the concept's visual-store entry
      try {
        const e = store && store.get(w);
        if (e) {
          const a = e.art || { up: 0, down: 0 };
          if (verdict === 'accept') a.up = (a.up | 0) + 1; else a.down = (a.down | 0) + 1;
          a.lastVerdict = verdict; a.at = now;
          // ARTLEARN (2026-08-21, operator: "and learn from her drawing") —
          // an ACCEPT teaches her which HAND works for this subject: the
          // winning style banks a per-concept preference the style picker
          // reads, and her current technique params are marked validated.
          if (verdict === 'accept' && styleName) {
            a.styles = a.styles || {};
            a.styles[styleName] = (a.styles[styleName] | 0) + 1;
            if (e.skill) e.skill.validated = (e.skill.validated | 0) + 1;
          }
          e.art = a;
          store.set(w, e);   // re-set → the sqlite store marks it dirty
        }
      } catch { /* verdict bookkeeping best-effort */ }
      // ARTLEARN — an accepted subject is worth practicing MORE: queue a
      // session (the loop's own cooldown/schema gates make over-asking free),
      // so human approval turns into technique reinforcement.
      if (verdict === 'accept') {
        try {
          if (!Array.isArray(this._mindsEyePreviewQueue)) this._mindsEyePreviewQueue = [];
          this._mindsEyePreviewQueue.push({ kind: 'practice', word: w });
        } catch { /* practice queue best-effort */ }
      }
      if (verdict === 'reject') {
        // per-concept relearn pacing — reject-spam must not burn look-ups
        const GAPR = Number(process.env.DREAM_ART_RELEARN_GAP_MS) >= 0 ? Number(process.env.DREAM_ART_RELEARN_GAP_MS) : 600000;
        if (!this._artRelearnAt) this._artRelearnAt = new Map();
        if ((now - (this._artRelearnAt.get(w) || 0)) < GAPR) continue;
        this._artRelearnAt.set(w, now);
        // REJECTGONE (2026-08-21, operator: "she keeps displaying her drawings
        // even tho i marked redraw") — the WHOLE memory of the word dies, not
        // just the schema: the stored look (rec/percept) survived the first
        // build and the recall/favorite lanes kept re-displaying the rejected
        // imagery while the relearn was still in flight. A rejected look is a
        // bad look — the forced fresh reference rebuilds the entry from zero.
        try { if (store && store.has(w)) store.delete(w); } catch { /* entry drop best-effort */ }
        try {
          if (!Array.isArray(this._mindsEyePreviewQueue)) this._mindsEyePreviewQueue = [];
          this._mindsEyePreviewQueue.push({ kind: 'relearn', word: w });
          relearned.push(w);
        } catch { /* queue best-effort */ }
      }
    }
    // REJECTGONE — if the frame on screen right now names a rejected word,
    // clear it IMMEDIATELY to an honest in-progress note instead of letting
    // the rejected picture sit there while the fresh look-up runs. Cleared on
    // EVERY reject (even a relearn-paced repeat press) — the display must
    // always obey the verdict even when the expensive look doesn't re-fire.
    if (verdict === 'reject') {
      this._artClearEyeIfShowing(words, `she tossed her ${words.join(' + ')} — fresh look-up, definition re-read and redraw on the way…`);
    }
    this._artFeedbackStats = {
      accepts: ((this._artFeedbackStats && this._artFeedbackStats.accepts) | 0) + (verdict === 'accept' ? 1 : 0),
      rejects: ((this._artFeedbackStats && this._artFeedbackStats.rejects) | 0) + (verdict === 'reject' ? 1 : 0),
      bans: (this._artFeedbackStats && this._artFeedbackStats.bans) | 0,
      lastWords: words, lastVerdict: verdict, at: now,
    };
    // she KNOWS — the verdict rides the emission bus into her episodes
    try {
      const _c = this.cortexCluster;
      if (_c && typeof _c.pushEmission === 'function') {
        _c.pushEmission({ source: 'art-feedback', text: (verdict === 'accept' ? 'they liked my drawing of ' : 'they did not like my drawing of ') + words.join(' and '), ts: now });
      }
    } catch { /* emission best-effort */ }
    try { console.log(`[OwnArt] 🖤 ${verdict.toUpperCase()} on "${words.join('+')}"${relearned.length ? ` — relearning: ${relearned.join(', ')} (fresh look + dictionary + redraw queued)` : verdict === 'accept' ? ' — held as a good one' : ' (relearn paced — recently relearned)'}`); } catch { /* nf */ }
    return { ok: true, verdict, words, relearn: relearned };
  },

  // ── PAINT.5 — THE PRACTICE LOOP. Fully equational self-critique, the same
  // noisy-oracle math as visual confirmation: she draws the subject with her
  // current technique, PERCEIVES her own drawing (describe → percept vector),
  // and scores it against the percept she banked when she LOOKED at the real
  // thing (cosine). Then she nudges one technique parameter at a time, redraws
  // the SAME composition (fixed seed — only the technique varies), re-perceives,
  // and keeps the nudge only if the resemblance measurably improved. Nothing is
  // copied and no generator is involved: her eye judges her hand, per concept,
  // and the skill persists in the visual store. Runs on the walk lane only —
  // never on the reply path.
  async _practiceDrawing(word) {
    if (!this.mindSpace || typeof this.mindSpace.sketch !== 'function' || typeof this.mindSpace.describe !== 'function') return null;
    const key = String(word || '').toLowerCase().trim();
    if (!key) return null;
    const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
    const e = store && store.get(key);
    // practice needs both halves of the judgment: her memory of the shape
    // (schema with the trace) and her memory of the look (the percept vector)
    if (!e || !e.schema || !Array.isArray(e.schema.trace) || e.schema.trace.length < 10 || !Array.isArray(e.p) || !e.p.length) return null;
    const GAP = Number(process.env.DREAM_PRACTICE_GAP_MS) >= 0 ? Number(process.env.DREAM_PRACTICE_GAP_MS) : 1800000;
    if (e.skill && e.skill.at && (Date.now() - e.skill.at) < GAP) return null;   // she practiced this recently
    const ITERS = Number(process.env.DREAM_PRACTICE_ITERS) > 0 ? Number(process.env.DREAM_PRACTICE_ITERS) : 5;
    const cos = (a, b) => { let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0; };
    // fixed neutral setup: poster (fill + trace — the most information-dense
    // hand), centered box, FIXED seed, no mood tint, no backdrop, no label —
    // the score measures TECHNIQUE, not composition or mood.
    const style = this._artStyles()[0];
    const box = { cx: 0.5, cy: 0.5, w: 0.72, h: 0.72 };
    const score = async (params) => {
      const rnd = this._ownArtRng('practice|' + key);
      const strokes = this._ownArtStrokesFromSchema(e.schema, box, rnd, key, style, params);
      const rec = await this.mindSpace.sketch(strokes, { maxSide: 256 });
      if (!rec) return -1;
      const d = await this.mindSpace.describe(rec);
      return d ? cos(Array.from(d), e.p) : -1;
    };
    const RANGES = {
      jitter:    [0.002, 0.012, 0.002],
      underA:    [0.35, 0.85, 0.06],
      traceW:    [0.7, 1.4, 0.12],
      keepP:     [0.75, 0.97, 0.04],
      detailMul: [0.5, 1.5, 0.2],
    };
    const params = { ...this._skillDefaults(), ...(e.skill && e.skill.params) };
    const sessions = (e.skill && e.skill.sessions) || 0;
    let best;
    try { best = await score(params); } catch { return null; }
    if (best < 0) return null;
    const base = best;
    const keys = Object.keys(RANGES);
    const prnd = this._ownArtRng('nudge|' + key + '|' + sessions);   // deterministic per session, different every session
    let kept = 0;
    for (let i = 0; i < ITERS; i++) {
      const k = keys[Math.floor(prnd() * keys.length) % keys.length];
      const [lo, hi, step] = RANGES[k];
      const cand = { ...params, [k]: Math.min(hi, Math.max(lo, params[k] + (prnd() < 0.5 ? -1 : 1) * step)) };
      if (cand[k] === params[k]) continue;   // already at the range wall in that direction
      let s;
      try { s = await score(cand); } catch { continue; }
      if (s > best + 1e-4) { best = s; params[k] = cand[k]; kept++; }
    }
    e.skill = { params, cos: +best.toFixed(4), sessions: sessions + 1, at: Date.now() };
    try { store.set(key, e); } catch { /* persist best-effort — the session still counted in state */ }
    this._practiceStats = {
      sessions: ((this._practiceStats && this._practiceStats.sessions) || 0) + 1,
      lastWord: key, lastBase: +base.toFixed(4), lastBest: +best.toFixed(4), lastKept: kept, at: Date.now(),
    };
    try { console.log(`[OwnArt] 🎨 PRACTICE "${key}" session ${sessions + 1}: resemblance ${base.toFixed(4)} → ${best.toFixed(4)} (${kept} of ${ITERS} nudges kept)${kept ? ' — technique improved and saved' : ' — no nudge beat her current hand'}`); } catch { /* nf */ }
    return { word: key, base, best, kept };
  },

  _ownArtStrokesFromSchema(schema, box, rnd, word, style, skillOverride) {
    const out = [];
    const put = (pts, rgb) => out.push({ type: 'poly', pts, rgb });
    // ARTSTYLE — no style handed in (legacy caller) → poster, the pre-style behavior.
    if (!style) style = this._artStyles()[0];
    // PAINT.5 — the practiced hand: per-concept technique params (or a practice
    // candidate when the practice loop itself is scoring a nudge).
    const skill = skillOverride || this._skillFor(word);
    if (style.scale !== 1) box = { cx: box.cx, cy: box.cy, w: box.w * style.scale, h: box.h * style.scale };
    // NO SCHEMA — she has never seen it. DRAW FROM THE DEFINITION (the form,
    // fill color and attached parts come straight out of what the word MEANS —
    // any definition she has been taught is a drawing recipe), or DON'T DRAW.
    // SCRATCHKILL (2026-08-21, operator law after three strikes): the letter-
    // shape guess is DEAD — post-press with the fresh empty store it filled
    // the mind's eye with "white lines that dont decern anything… random
    // purple and pink where ever the lines make an enclosure… random circles
    // and parrallel lines like notebook paper". An honest no-drawing (the
    // caller falls to a grounded favorite or a mood wash) beats a scribble
    // that claims to be the thing.
    if (!schema || !Array.isArray(schema.parts) || schema.parts.length === 0) {
      if (typeof this._defDrivenStrokes === 'function') {
        try {
          const defArt = this._defDrivenStrokes(word, box, rnd, style);
          if (defArt && defArt.length) return defArt;
        } catch { /* definition drawing best-effort — no-drawing below */ }
      }
      return out;   // empty — honest no-drawing, never a letter-shape scribble
    }
    // WITH A SCHEMA — PAINT.3 (2026-08-21): she paints in LAYERS the way a
    // person does — big filled masses first, then the contours she traced from
    // real references, then detail marks — using the rasterizer's FULL toolkit
    // (blob fill, polygon fill, line weight) that the old construction never
    // picked up; loose unweighted arcs alone read as scatter, never as the
    // thing. The definition supplies what the palette can't: a definition
    // naming a color tints the masses correctly even before her palette settles.
    const fx = schema.frame && schema.frame.w ? schema.frame : { x: 0, y: 0, w: 1, h: 1 };
    // PAINT.12 — NEVER THE SAME DRAWING TWICE. Same memory, different piece:
    // half her attempts MIRROR the pose, and (below) she draws a different
    // random subset of her remembered strokes each time — the longest 30%
    // always (the read), the rest sampled. With the style rotation and the
    // hand jitter, two asks for the same subject give two different artworks
    // from one understanding — which is what an artist is.
    const mirror = rnd() < 0.5;
    const mAng = (a2) => (mirror ? -a2 : a2);
    const mapX = (x) => { let u = (x - fx.x) / Math.max(1e-3, fx.w); if (mirror) u = 1 - u; return box.cx + (u - 0.5) * box.w; };
    const mapY = (y) => box.cy + (((y - fx.y) / Math.max(1e-3, fx.h)) - 0.5) * box.h;
    const defAttr = this._defDrawAttributes ? this._defDrawAttributes(word) : null;
    const defColor = defAttr && defAttr.colors && defAttr.colors[0];
    const mixDef = (rgb) => defColor ? [Math.round(rgb[0] * 0.45 + defColor[0] * 0.55), Math.round(rgb[1] * 0.45 + defColor[1] * 0.55), Math.round(rgb[2] * 0.45 + defColor[2] * 0.55)] : rgb;
    // ── LAYER 1: MASS — SILHOUETTE-FIRST (PAINT.6). The live judged test showed
    // part-cell blobs render as "a column of circles": the grid is a LAYOUT,
    // not a shape. But the schema HOLDS the shape — the traced silhouette —
    // so when a closed (or near-closed) outline exists, THE BODY IS THAT
    // POLYGON, filled in the style's treatment with the subject's own colors.
    // The form on the page is then the form she actually saw. Part-cell
    // masses only run as the fallback when no silhouette was captured.
    let silhouette = null;
    if (Array.isArray(schema.outlines) && schema.outlines.length) {
      // biggest closed outline by traced length when one exists…
      const closed = schema.outlines.filter(o => o && o.closed && Array.isArray(o.pts) && o.pts.length >= 3);
      silhouette = closed.sort((a2, b2) => (b2.len || 0) - (a2.len || 0))[0] || null;
      // …but the tracer usually hands back OPEN edge fragments (live judged test:
      // closed: 0 of 8), and force-closing one edge makes a degenerate sliver
      // that fills nothing. When nothing closes, the body is the CONVEX HULL of
      // every point she traced — a real closed polygon around the subject.
      // Concavities (a neck dip) are lost to the hull, but the interior contour
      // lines drawn on top carve those back visually.
      if (!silhouette) {
        const all = [];
        // PAINT.7 — hull DECONTAMINATION: the first hull swallowed backdrop
        // edges and rendered as a trapezoid (live-judged). Points hugging the
        // frame border, and strokes that span most of the frame in one axis
        // (the ground line, backdrop gradients), are scenery — not the subject.
        const src = (Array.isArray(schema.trace) && schema.trace.length >= 10)
          ? schema.trace.map(pts => ({ pts }))
          : schema.outlines;
        for (const o of src) {
          if (!o || !Array.isArray(o.pts)) continue;
          let mnx = 1, mny = 1, mxx = 0, mxy = 0;
          for (const pp of o.pts) { mnx = Math.min(mnx, pp[0]); mxx = Math.max(mxx, pp[0]); mny = Math.min(mny, pp[1]); mxy = Math.max(mxy, pp[1]); }
          const wSpan = mxx - mnx, hSpan = mxy - mny;
          if ((wSpan > 0.7 && hSpan < 0.08) || (hSpan > 0.7 && wSpan < 0.08)) continue;   // frame-spanning line = scenery
          for (const pp of o.pts) {
            if (pp[0] < 0.03 || pp[0] > 0.97 || pp[1] < 0.03 || pp[1] > 0.97) continue;   // border-hugging = scenery
            all.push(pp);
          }
        }
        if (all.length >= 3) {
          // Andrew monotone chain
          const pts = all.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
          const cross = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
          const lower = [];
          for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
          const upper = [];
          for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
          const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
          if (hull.length >= 3) silhouette = { pts: hull, closed: true, len: 0, hull: true };
        }
      }
    }
    if (silhouette) {
      const sPts = silhouette.pts.map(pp => [mapX(pp[0]), mapY(pp[1])]);
      // silhouette bounds drive non-fill mass treatments (hatch/dots/scribble)
      let sx0 = 1, sy0 = 1, sx1 = 0, sy1 = 0;
      for (const pp of sPts) { sx0 = Math.min(sx0, pp[0]); sx1 = Math.max(sx1, pp[0]); sy0 = Math.min(sy0, pp[1]); sy1 = Math.max(sy1, pp[1]); }
      const bodyInk = mixDef(this._artInk(style, schema, 0.6, rnd, defColor));
      // PAINT.7 — when the full trace will carry the read, the body fill is an
      // UNDERPAINT (translucent) so the drawing reads as lines-over-wash, not a
      // solid slab with lines lost inside it.
      const hasTrace = Array.isArray(schema.trace) && schema.trace.length >= 10;
      if (style.mass === 'fill') {
        out.push({ type: 'fill', pts: sPts, rgb: bodyInk, a: hasTrace ? skill.underA : 1 });
      } else if (style.mass === 'wash') {
        out.push({ type: 'fill', pts: sPts, rgb: [Math.min(255, bodyInk[0] + 35), Math.min(255, bodyInk[1] + 35), Math.min(255, bodyInk[2] + 35)], a: 0.4 });
        out.push({ type: 'fill', pts: sPts.map(pp => [pp[0] + (rnd() - 0.5) * 0.02, pp[1] + (rnd() - 0.5) * 0.02]), rgb: bodyInk, a: 0.3 });
      } else if (style.mass !== 'none') {
        // COLORART — textured styles (hatch/dots/xhatch/scribble) mass PER
        // PART in the part's own sampled color when the schema carries them:
        // small correctly-placed colored texture instead of one giant body-box
        // hatch (the whole-bbox scribble read as bars across the piece).
        const coloredNF = schema.parts.filter(p => Array.isArray(p.rgb));
        if (coloredNF.length) {
          for (const p of coloredNF) {
            const cx = mapX(p.cx), cy = mapY(p.cy);
            const pw = Math.max(0.02, p.w / Math.max(1e-3, fx.w) * box.w);
            const ph = Math.max(0.02, p.h / Math.max(1e-3, fx.h) * box.h);
            this._artMass(out, style, cx, cy, pw, ph, mAng(p.ang), p.rgb, rnd);
          }
        } else {
          this._artMass(out, style, (sx0 + sx1) / 2, (sy0 + sy1) / 2, (sx1 - sx0), (sy1 - sy0), 0.3, bodyInk, rnd);
        }
      }
      // COLORART — COLOR LAYERS + DEPTH: when the schema carries per-part
      // sampled colors (where the colors GO), every part paints a mass in ITS
      // OWN color over the underpaint — the regional color layers a real
      // image has, the light and dark in the right places. Falls back to the
      // old 3-part single-ink shading for pre-color schemas.
      if (style.mass === 'fill' || style.mass === 'wash') {
        const colored = schema.parts.filter(p => Array.isArray(p.rgb));
        if (colored.length) {
          // each part = THREE offset soft blobs at low alpha, not one crisp
          // ellipse — a single blob per cell rendered as an obvious column of
          // circles (judged live, the very artifact this layer replaces)
          for (const p of colored) {
            const cx = mapX(p.cx), cy = mapY(p.cy);
            const pw = Math.max(0.02, p.w / Math.max(1e-3, fx.w) * box.w);
            const ph = Math.max(0.02, p.h / Math.max(1e-3, fx.h) * box.h);
            for (let bi = 0; bi < 3; bi++) {
              out.push({
                type: 'blob',
                cx: cx + (rnd() - 0.5) * pw * 0.35, cy: cy + (rnd() - 0.5) * ph * 0.35,
                rx: pw * (0.38 + rnd() * 0.22), ry: ph * (0.34 + rnd() * 0.2),
                ang: mAng(p.ang) + (rnd() - 0.5) * 0.5, rgb: p.rgb,
                a: 0.16 + Math.min(0.12, p.weight),
              });
            }
          }
        }
        // (the old darkened-ink shading blobs for colorless schemas are GONE —
        // judged live as "weird circles… in random places"; a pre-color schema
        // now reads underpaint + trace, clean)
      }
    } else {
      // no silhouette captured — the part-cell masses remain the honest fallback
      for (const p of schema.parts.slice(0, 12)) {
        const cx = mapX(p.cx), cy = mapY(p.cy);
        const pw = Math.max(0.02, p.w / Math.max(1e-3, fx.w) * box.w);
        const ph = Math.max(0.02, p.h / Math.max(1e-3, fx.h) * box.h);
        this._artMass(out, style, cx, cy, pw * 1.1, ph * 1.1, mAng(p.ang), mixDef(this._artInk(style, schema, 0.25 + 0.35 * p.weight, rnd, defColor)), rnd);
      }
    }
    // ── LAYER 2: THE READ — PAINT.7. When the schema carries her full vector
    // trace, SHE REDRAWS IT: every remembered stroke in her current ink, at her
    // current scale, with her hand's per-attempt jitter. This is the layer that
    // makes the piece READ as the subject — the fragments/hull alone rendered
    // as "a gray trapezoid with squiggles" (live-judged). Falls back to the
    // 8-contour layer for schemas learned before the trace existed.
    if (Array.isArray(schema.trace) && schema.trace.length >= 10) {
      const jit = () => (rnd() - 0.5) * skill.jitter;
      // PAINT.7 — CONTRAST-ADAPTIVE trace ink on filled styles: palette-gray
      // lines over a palette-gray underpaint vanished (live-judged on the
      // poster piece). Over an underpaint, the trace goes dark on a bright body
      // and pale on a dark one; line styles keep their own ink.
      let traceInk = this._artInk(style, schema, 0.9, rnd, null);
      if (style.mass === 'fill' || style.mass === 'wash') {
        const bodyProbe = this._artInk(style, schema, 0.6, rnd, defColor);
        const lum = 0.299 * bodyProbe[0] + 0.587 * bodyProbe[1] + 0.114 * bodyProbe[2];
        traceInk = lum > 120 ? [30, 26, 34] : [226, 222, 230];
      }
      const tw = style.outlineW > 0 ? Math.min(style.outlineW, 0.006) * skill.traceW : undefined;
      // PAINT.12 — per-attempt STROKE SUBSET: the trace is length-sorted at
      // learn time, so the first ~30% are the long structural reads — those
      // ALWAYS draw. Every shorter stroke draws with p=0.85, a different hand
      // each attempt. Same memory, different piece.
      // COLORART — each stroke redraws in the color the real thing HAD there
      // (per-stroke sampled at learn time), slightly deepened so the contour
      // still reads over its own color layer. Mono ink (her one deliberate
      // monochrome hand) and pre-color schemas keep the single-ink line.
      const tN = schema.trace.length;
      const structural = Math.max(10, Math.ceil(tN * 0.3));
      const useRealC = style.ink !== 'mono' && Array.isArray(schema.traceRgb) && schema.traceRgb.length;
      for (let ti = 0; ti < tN; ti++) {
        const tp = schema.trace[ti];
        if (!Array.isArray(tp) || tp.length < 2) continue;
        if (ti >= structural && rnd() > skill.keepP) continue;
        const pts = tp.map(pp => [mapX(pp[0]) + jit(), mapY(pp[1]) + jit()]);
        // the STRUCTURAL strokes keep the contrast ink — the read must never
        // sink into its own color layer (judged live: the outline went mushy
        // when everything wore real colors); the detail TAIL wears the real
        // colors, which is where the fine-contour color lives anyway.
        let ink = traceInk;
        const rc = (useRealC && ti >= structural) ? schema.traceRgb[ti] : null;
        if (Array.isArray(rc)) ink = [Math.round(rc[0] * 0.75), Math.round(rc[1] * 0.75), Math.round(rc[2] * 0.75)];
        out.push({ type: 'poly', pts, rgb: ink, w: tw, a: style.outlineA });
      }
    } else if (Array.isArray(schema.outlines)) {
      const fillClosed = style.mass === 'fill' || style.mass === 'wash';
      for (const o of schema.outlines) {
        if (!o || !Array.isArray(o.pts) || o.pts.length < 3) continue;
        const pts = o.pts.map(pp => [mapX(pp[0]), mapY(pp[1])]);
        if (o.closed && fillClosed) {
          out.push({ type: 'fill', pts, rgb: mixDef(this._artInk(style, schema, 0.5, rnd, defColor)), a: style.mass === 'wash' ? 0.4 : 1 });
        }
        if (style.outlineW > 0) {
          out.push({ type: 'poly', pts: o.closed ? pts.concat([pts[0]]) : pts, rgb: this._artInk(style, schema, 0.85, rnd, null), w: style.outlineW, a: style.outlineA });
        } else if (style.outlineA > 0) {
          out.push({ type: 'poly', pts: o.closed ? pts.concat([pts[0]]) : pts, rgb: this._artInk(style, schema, 0.6, rnd, null), a: style.outlineA });
        }
      }
    }
    // ── LAYER 3: DETAIL — her hand's arcs on the heaviest parts, density set
    // by the style (a pencil piece hatches busily; ink stays spare).
    // COLORART — with a full trace carrying the read, the random arcs are
    // CLUTTER for EVERY style (judged live: "weird line like shadowing in
    // random places that is not part of the image"). The trace IS the detail
    // now; this layer survives only for trace-less schemas.
    const _skipDetail = Array.isArray(schema.trace) && schema.trace.length >= 10;
    for (const p of _skipDetail ? [] : schema.parts.slice(0, 8)) {
      const cx = mapX(p.cx), cy = mapY(p.cy);
      const pw = Math.max(0.02, p.w / Math.max(1e-3, fx.w) * box.w);
      const ph = Math.max(0.02, p.h / Math.max(1e-3, fx.h) * box.h);
      const marks = Math.round((1 + Math.round(p.weight * 18)) * (style.detailMul ?? 1) * skill.detailMul);
      for (let m = 0; m < marks; m++) {
        const ang = mAng(p.ang) + (rnd() - 0.5) * 0.25;
        const len = (0.6 + 0.4 * rnd()) * Math.max(pw, ph);
        const bow = (rnd() - 0.5) * 0.3 * Math.min(pw, ph);
        const ox = (rnd() - 0.5) * pw * 0.3, oy = (rnd() - 0.5) * ph * 0.3;
        const ax = cx + ox - Math.cos(ang) * len * 0.5, ay = cy + oy - Math.sin(ang) * len * 0.5;
        const bx = cx + ox + Math.cos(ang) * len * 0.5, by = cy + oy + Math.sin(ang) * len * 0.5;
        const mx = (ax + bx) / 2 - Math.sin(ang) * bow, my = (ay + by) / 2 + Math.cos(ang) * bow;
        out.push({ type: 'poly', pts: [[ax, ay], [mx, my], [bx, by]], rgb: this._artInk(style, schema, 0.55 + 0.3 * p.weight, rnd, null), a: style.ink === 'graphite' ? 0.8 : 1 });
      }
    }
    return out;
  },

  // ── PAINT.4 (2026-08-21) — DEFINITION-DRIVEN DRAWING, fully word-generic.
  // A definition IS a drawing recipe: its shape words say the form, its color
  // words say the fill, its part words say what to attach — for ANY word whose
  // definition she holds (multi-def, Hebbian-bound since the dictionary
  // integration). One generic attribute table over trained knowledge — the same
  // architecture as the phoneme tables driving her speech, no text-AI anywhere,
  // and nothing here is specific to any particular word.
  _defDrawAttributes(word) {
    const w = String(word || '').toLowerCase().trim();
    if (!w) return null;
    let text = '';
    try {
      const cx = this.cortexCluster;
      const d = (cx && typeof cx.lookupDefinitionSync === 'function') ? cx.lookupDefinitionSync(w) : null;
      if (d && typeof d === 'string') text = d.toLowerCase();
    } catch { /* no definition cached — attributes come back empty, caller falls through */ }
    if (!text) return null;
    const COLORS = {
      red: [205, 55, 45], green: [70, 150, 60], blue: [60, 90, 200], yellow: [230, 200, 60],
      orange: [235, 140, 40], purple: [140, 70, 180], pink: [235, 130, 170], brown: [130, 85, 50],
      black: [35, 32, 38], white: [235, 232, 238], gray: [130, 128, 135], grey: [130, 128, 135],
      gold: [212, 175, 55], golden: [212, 175, 55], silver: [180, 180, 190], tan: [190, 160, 120],
    };
    const colors = [];
    for (const [name, rgb] of Object.entries(COLORS)) if (new RegExp(`\\b${name}\\b`).test(text)) colors.push(rgb);
    const has = (re) => re.test(text);
    const shape =
      has(/\b(round|rounded|circular|spherical|globular|ball)\b/) ? 'round'
      : has(/\b(oval|egg-shaped|ovoid)\b/) ? 'oval'
      : has(/\b(long|elongated|slender|cylindrical)\b/) ? 'long'
      : has(/\b(flat|thin)\b/) ? 'flat'
      : has(/\b(square|rectangular|box)\b/) ? 'square'
      : has(/\b(pointed|conical|triangular)\b/) ? 'pointed'
      : null;
    const parts = [];
    if (has(/\b(stem|stalk)\b/)) parts.push('stem');
    if (has(/\b(leaf|leaves)\b/)) parts.push('leaves');
    if (has(/\b(legs?)\b/)) parts.push('legs');
    if (has(/\b(tail)\b/)) parts.push('tail');
    if (has(/\b(wings?)\b/)) parts.push('wings');
    if (has(/\b(ears?)\b/)) parts.push('ears');
    if (has(/\b(handle)\b/)) parts.push('handle');
    if (has(/\b(petals?|flower)\b/)) parts.push('petals');
    return (colors.length || shape || parts.length) ? { colors, shape, parts } : null;
  },
  _defDrivenStrokes(word, box, rnd, style) {
    const attr = this._defDrawAttributes ? this._defDrawAttributes(word) : null;
    if (!attr || (!attr.shape && !attr.colors.length)) return null;
    if (!style) style = this._artStyles()[0];
    const out = [];
    // NEONKILL (2026-08-21, operator: "she is using neon pink to draw a
    // leopaard... she needs to match colors up correctly not just use nothing
    // but hot pink neon") — when the definition names NO color, the body is a
    // NEUTRAL sketch tone: an honest "I don't know its colors yet". Her pink
    // is identity ink for labels and accents, never a claim about a subject's
    // color. The real palette takes over the moment she LOOKS at the thing.
    const body = attr.colors[0] || [142, 132, 118];
    const dark = [Math.round(body[0] * 0.55), Math.round(body[1] * 0.55), Math.round(body[2] * 0.55)];
    const green = [70, 150, 60];
    // Sometimes she draws MORE THAN ONE (Gee: "or draw multiple tomotoes").
    const count = rnd() < 0.3 ? 2 + Math.floor(rnd() * 2) : 1;
    for (let i = 0; i < count; i++) {
      const scale = count === 1 ? 1 : 0.55 + 0.15 * rnd();
      const cx = count === 1 ? box.cx : box.cx + (i - (count - 1) / 2) * box.w * 0.42;
      const cy = count === 1 ? box.cy : box.cy + (rnd() - 0.5) * box.h * 0.15;
      let rx = box.w * 0.32 * scale, ry = box.h * 0.3 * scale, ang = 0;
      if (attr.shape === 'oval') ry *= 1.25;
      else if (attr.shape === 'long') { rx *= 1.5; ry *= 0.45; ang = (rnd() - 0.5) * 0.4; }
      else if (attr.shape === 'flat') { rx *= 1.3; ry *= 0.3; }
      if (attr.shape === 'square') {
        const pts = [[cx - rx, cy - ry], [cx + rx, cy - ry], [cx + rx, cy + ry], [cx - rx, cy + ry]];
        out.push({ type: 'fill', pts, rgb: body });
        out.push({ type: 'poly', pts: pts.concat([pts[0]]), rgb: dark, w: 0.01 });
      } else if (attr.shape === 'pointed') {
        const pts = [[cx, cy - ry], [cx + rx, cy + ry], [cx - rx, cy + ry]];
        out.push({ type: 'fill', pts, rgb: body });
        out.push({ type: 'poly', pts: pts.concat([pts[0]]), rgb: dark, w: 0.01 });
      } else {
        // round / oval / long / color-only default: the mass in the current
        // style (a filled circle in poster, a wash in watercolor, hatching in
        // pencil), then the outline — the definition recipe, styled.
        this._artMass(out, style, cx, cy, rx * 2, ry * 2, ang, body, rnd);
        const ring = []; for (let t = 0; t <= 20; t++) { const a = (t / 20) * Math.PI * 2; ring.push([cx + Math.cos(a + ang) * rx, cy + Math.sin(a + ang) * ry]); }
        out.push({ type: 'poly', pts: ring, rgb: style.ink === 'graphite' || style.ink === 'mono' ? this._artInk(style, null, 0.8, rnd, null) : dark, w: Math.max(0.005, style.outlineW || 0.008), a: style.outlineA });
      }
      // "...and put a stem on it" — attach the parts the definition names.
      for (const p of attr.parts) {
        if (p === 'stem') {
          out.push({ type: 'poly', pts: [[cx, cy - ry], [cx + rx * 0.06, cy - ry - box.h * 0.09 * scale]], rgb: green, w: 0.012 });
        } else if (p === 'leaves' || p === 'petals') {
          const n = p === 'petals' ? 6 : 3;
          for (let k = 0; k < n; k++) {
            const a = p === 'petals' ? (k / n) * Math.PI * 2 : -Math.PI / 2 + (k - 1) * 0.6;
            out.push({ type: 'blob', cx: cx + Math.cos(a) * rx * (p === 'petals' ? 1.15 : 0.35), cy: (p === 'petals' ? cy : cy - ry) + Math.sin(a) * ry * (p === 'petals' ? 1.15 : 0.35), rx: rx * 0.22, ry: ry * 0.12, ang: a, rgb: p === 'petals' ? (attr.colors[1] || body) : green });
          }
        } else if (p === 'legs') {
          for (let k = 0; k < 4; k++) out.push({ type: 'poly', pts: [[cx - rx * 0.6 + k * rx * 0.4, cy + ry * 0.8], [cx - rx * 0.6 + k * rx * 0.4, cy + ry * 0.8 + box.h * 0.14 * scale]], rgb: dark, w: 0.012 });
        } else if (p === 'tail') {
          out.push({ type: 'poly', pts: [[cx + rx * 0.9, cy], [cx + rx * 1.3, cy - ry * 0.6], [cx + rx * 1.5, cy - ry * 1.1]], rgb: dark, w: 0.01 });
        } else if (p === 'ears') {
          for (const s of [-1, 1]) out.push({ type: 'fill', pts: [[cx + s * rx * 0.5, cy - ry * 0.85], [cx + s * rx * 0.85, cy - ry * 1.45], [cx + s * rx * 0.2, cy - ry * 1.05]], rgb: body });
        } else if (p === 'wings') {
          for (const s of [-1, 1]) out.push({ type: 'blob', cx: cx + s * rx * 1.1, cy, rx: rx * 0.55, ry: ry * 0.3, ang: s * 0.5, rgb: dark });
        } else if (p === 'handle') {
          const arc = []; for (let t = 0; t <= 10; t++) { const a = Math.PI * (t / 10); arc.push([cx + rx * 1.05 + Math.cos(a) * rx * 0.3, cy - Math.sin(a) * ry * 0.5]); }
          out.push({ type: 'poly', pts: arc, rgb: dark, w: 0.01 });
        }
      }
    }
    return out;
  },

  // IMAGINATIVE DRAWING (Gee: "she needs to imagine too and draw things not always
  // what she sees ... open ended dynamically to infinity") — she draws from her OWN
  // HEAD by COMPOSING drawable concepts into one invented scene (a dragon AND a
  // castle; a thing that has no single reference). OPEN-ENDED: each part is grounded
  // recall → provisional → LOOK IT UP (fetch a reference she's never seen), so she
  // can imagine + draw combinations she has NOT literally seen — infinite, dynamic,
  // sourced from her stream of thought (see _imagineAndDraw). Assembles real traced
  // parts — NOT field-morphing (blending two percepts = the banned noise). Only
  // DRAWABLE (noun) parts. Needs ≥2 or it declines (honest — no fake combination).
  // SLOW (may fetch) → always call DETACHED (background), never awaited in the tick.
  // IMAGINATION = A GENUINELY NEW IMAGE (Gee 2026-07-16: "chicken and sand are
  // jsut ... two older pics put cookie cutter like into one image... this is
  // wrong.. instead of correctly makeing new images"). The old composeFields
  // collage pasted each part's field into its own region — copy-paste by
  // construction. Now she imagines the COMBINATION AS ONE SCENE: her thought
  // picks the concepts (the creativity is HERS), the sensory executor renders
  // ONE unified reference of the combined concept ("chicken and sand together,
  // one scene"), she perceives it, grounds it under the combo's OWN key ("a+b" —
  // never polluting the single concepts' memories), and field-renders HER
  // recreation with a dazzle label. Exactly the DRAW-ENGINE law, applied to a
  // concept that exists only in her head. Can't ground → honest decline (null),
  // never a collage, never a fake.
  async _drawImagined(concepts) {
    if (!this.mindSpace || typeof this.mindSpace.stylizeField !== 'function') return null;
    const keys = [];
    for (const c of (Array.isArray(concepts) ? concepts : [])) {
      if (keys.length >= 3) break;
      const key = (typeof this._vmContentTokens === 'function' ? (this._vmContentTokens(c)[0] || '') : String(c || '').toLowerCase());
      if (!key || keys.includes(key)) continue;
      if (typeof this._conceptIsDrawable === 'function' && !(await this._conceptIsDrawable(key))) continue;   // only DRAWABLE (noun) concepts
      keys.push(key);
    }
    if (keys.length < 2) return null;   // need ≥2 concepts to invent a combination
    const comboKey = keys.join('+');
    // already imagined this combo? (grounded under its own key, 6h cooldown applies)
    let rec = null;
    try {
      const e = (typeof this._vmStore === 'function') ? this._vmStore().get(comboKey) : null;
      if (e && e.rec && (typeof this._recDetail !== 'function' || this._recDetail(e.rec) >= 200)) rec = e.rec;
    } catch { /* store peek best-effort */ }
    if (!rec && typeof this._fetchReferenceAndGround === 'function') {
      const phrase = keys.join(' and ');
      // Same realistic steer as _referenceImagePrompt (Gee 2026-07-17: "too many
      // kittens puppies and funky characters" — "illustration" pulled the
      // generator cutesy/cartoon; her imagined scenes ground TRUE-TO-LIFE too).
      // POSITIVE terms ONLY (a model attends to the nouns — "no cartoon" paints one).
      const prompt = `${phrase} together in one unified scene, realistic photograph, true to life, natural lighting, full color, richly detailed, plain uncluttered background`;
      try { rec = await this._fetchReferenceAndGround(comboKey, { keyOverride: comboKey, promptOverride: prompt }); } catch { rec = null; }
    }
    if (!rec) return null;   // cooldown / fetch-fail / blank → honest decline
    const side = (typeof this._drawCanvasSide === 'function') ? this._drawCanvasSide() : 96;
    let labelStrokes = [];
    try { labelStrokes = this._labelStrokes(comboKey); } catch { /* nf */ }
    let drawn = null;
    try { drawn = await this.mindSpace.stylizeField(rec, { traceSide: Math.max(160, Math.min(side, 256)), bands: 7, labelStrokes }); } catch { return null; }   // ONE PROCESS - async
    if (!drawn) return null;
    this._lastSketchLabel = 'canvas:imagine:' + comboKey;
    return { rec: drawn, label: this._lastSketchLabel, source: 'canvas:imagine:' + comboKey, imagined: true };
  },

  // Fire an imaginative drawing from her STREAM OF THOUGHT — open-ended + dynamic to
  // infinity (Gee). Candidate concepts are the drawable nouns across her current +
  // recent inner-thoughts (an infinite, ever-changing source — "what a person might
  // want to draw" = what she's turning over in her head), NOT a fixed list. Picks a
  // couple, composes them via _drawImagined (which look-up-grounds parts she hasn't
  // seen), and publishes the canvas:imagine frame. DETACHED from the tick (it may
  // fetch) so it never freezes the viewer; guarded so parts don't storm the fetcher.
  async _imagineAndDraw() {
    if (typeof this._drawImagined !== 'function') return;
    const chain = Array.isArray(this._innerThoughtChain) ? this._innerThoughtChain : [];
    const texts = chain.map(e => (typeof e === 'string' ? e : (e && e.sentence) || '')).filter(t => t && t.trim());
    const pool = texts.slice(-4).join(' ');
    const toks = (typeof this._vmContentTokens === 'function') ? this._vmContentTokens(pool) : [];
    const cand = [];
    for (const t of toks) if (t && !cand.includes(t)) cand.push(t);
    if (cand.length < 2) return;   // need ≥2 concepts to invent a combination
    // rotate the starting point so successive imaginings recombine different ideas
    this._imagineRotate = ((this._imagineRotate || 0) + 1) % cand.length;
    const pick = cand.slice(this._imagineRotate).concat(cand.slice(0, this._imagineRotate)).slice(0, 4);
    let imagined = null;
    try { imagined = await this._drawImagined(pick); } catch { imagined = null; }
    if (imagined && imagined.rec && typeof this._publishMindsEyeFrame === 'function') {
      this._publishMindsEyeFrame(imagined.rec, imagined.source);
    }
  },

  // DYNAMIC LABEL STYLE (Gee 2026-07-16: "wheres all the different fonts and styles
  // and colors bond underline dazzle and pizzaz into infinity") — she writes the
  // word in a DIFFERENT style every drawing, open-ended, NO fixed set: vibrant
  // per-letter colours via hue rotation (infinite palette), optional bold / italic
  // slant / underline / drop-shadow. Deterministic per (concept, rotation) so it's
  // varied yet not random-noise. NO wobble (clean hand) — this is typographic
  // FLAIR, not degradation.
  _labelStyle(key) {
    const hash = (s) => { let h = 5381; const t = String(s); for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return h; };
    this._labelRotate = ((this._labelRotate || 0) + 1) >>> 0;
    const seed = (hash(key) + this._labelRotate * 2654435761) >>> 0;
    // HSL→RGB (vibrant): s,l in 0..1, h in deg → [r,g,b] 0..255
    const hsl = (h, s, l) => { h = (((h % 360) + 360) % 360) / 360; const a = s * Math.min(l, 1 - l); const f = (n) => { const k = (n + h * 12) % 12; return Math.max(0, Math.min(255, Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))))))); }; return [f(0), f(8), f(4)]; };
    const baseHue = seed % 360, mode = seed % 4;
    let colors;
    if (mode === 0) colors = Array.from({ length: 7 }, (_, i) => hsl(baseHue + i * 44, 0.9, 0.62));          // DAZZLE rainbow (per-letter cycle)
    else if (mode === 1) { const h2 = baseHue + 70 + (seed % 130); colors = Array.from({ length: 6 }, (_, i) => hsl(baseHue + (h2 - baseHue) * (i / 5), 0.82, 0.6)); }  // two-tone gradient
    else if (mode === 2) colors = [hsl(baseHue, 0.92, 0.6)];                                                 // single vibrant hue
    else colors = [hsl(45, 0.9, 0.62), hsl(35, 0.95, 0.55), hsl(50, 0.85, 0.66)];                            // gold shimmer
    // ALTERNATE LETTERFORMS (Gee 2026-07-16: "yes alternat leter forms") — the
    // letter SHAPE itself varies too: block / serif / dots / bubble / tall / wide
    // (rendered differently from the one FONT5X7 grid in glyphStrokes).
    const FONTS = ['block', 'serif', 'dots', 'bubble', 'tall', 'wide'];
    // PLACEMENT (Gee 2026-07-16: "in differnt places on the image to fit so its
    // not always a banner at the bottom") — seeded anchor around the page.
    const ANCHORS = ['bottom-center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center'];
    return {
      colors,
      font: FONTS[(seed >> 9) % FONTS.length],
      anchor: ANCHORS[(seed >> 11) % ANCHORS.length],
      bold: ((seed >> 3) & 1) === 0,
      slant: ((seed >> 4) % 3 === 0) ? (0.13 + (seed % 7) * 0.012) : 0,
      underline: ((seed >> 6) & 1) === 0,
      // silhouette ALWAYS (dark backing — "sillouetted"); highlight chip seeded
      // ~1/3 (a dark hue-tinted band behind the word — "highlighted").
      silhouette: [16, 14, 20],
      highlight: ((seed >> 7) % 3 === 0) ? hsl(baseHue, 0.45, 0.14) : null,
      size: 0.075 + ((seed >> 8) % 4) * 0.008,
    };
  },

  // She writes the WORD of what she drew on almost every image, BUILT INTO the image
  // (the strokes are rasterized into the drawn field C — sketch()/stylizeField/
  // composeFields all bake them in — never a separate overlay layer). Clean trained
  // hand + dynamic dazzle style (see _labelStyle). Returns styled glyph strokes.
  _labelStrokes(key) {
    if (!key || !this.mindSpace || typeof this.mindSpace.glyphStrokes !== 'function') return [];
    // FULL WORD, AUTO-FIT (Gee 2026-07-16: "the last few letters of longer words
    // are always being cut off") — no more 10-char slice: the glyph size SHRINKS
    // so the whole word always fits the available width. Never truncated.
    const label = String(key).slice(0, 14);
    const st = (typeof this._labelStyle === 'function') ? this._labelStyle(key) : { colors: [[222, 220, 226]], size: 0.075, anchor: 'bottom-center', silhouette: [16, 14, 20] };
    const wideK = st.font === 'wide' ? 1.35 : st.font === 'tall' ? 0.8 : 1;
    const advPerChar = (5 / 7) * wideK * 1.35;   // glyph advance per char, in units of `size` (mirrors glyphStrokes)
    const MARGIN = 0.04;
    const availW = 1 - 2 * MARGIN - (st.slant ? 0.05 : 0);
    let size = st.size;
    if (label.length * advPerChar * size > availW) size = availW / (label.length * advPerChar);
    size = Math.max(0.032, size);
    const wordW = label.length * advPerChar * size;
    const ghK = st.font === 'tall' ? 1.3 : 1;
    const wordH = size * ghK * (st.underline ? 1.2 : 1.05);
    // VARIED PLACEMENT — anchor from the style seed, not a fixed bottom banner.
    let x, y;
    switch (st.anchor) {
      case 'top-left':     x = MARGIN; y = MARGIN + 0.015; break;
      case 'top-right':    x = 1 - MARGIN - wordW; y = MARGIN + 0.015; break;
      case 'top-center':   x = 0.5 - wordW / 2; y = MARGIN + 0.015; break;
      case 'bottom-left':  x = MARGIN; y = 1 - MARGIN - wordH; break;
      case 'bottom-right': x = 1 - MARGIN - wordW; y = 1 - MARGIN - wordH; break;
      default:             x = 0.5 - wordW / 2; y = 1 - MARGIN - wordH; break;   // bottom-center
    }
    x = Math.max(0.012, Math.min(x, 1 - MARGIN - wordW));
    return this.mindSpace.glyphStrokes(label, { x, y, size, font: st.font, colors: st.colors, bold: st.bold, slant: st.slant, underline: st.underline, silhouette: st.silhouette, highlight: st.highlight }) || [];
  },

  // _stylizeStrokes — REMOVED (Gee 2026-07-15). It recolored EACH traced stroke a
  // hash-random goth warm/cool hue — that per-stroke rainbow WAS the "jumbled pile
  // of multicolored yarn". Superseded: traceLineArt draws ONE coherent chalk ink,
  // traceColorFill fills from the real image colours. No per-stroke recolor.

  // DRAW.2 SCHEMA STAMP — REMOVED (Gee 2026-07-15). The developmental
  // shape composer (_sketchFromState) mapped each word to one of 12 fixed
  // schemas (house/rain/tree/flower/sun/moon/heart/monster/…) wrapped in a
  // hardcoded scene template (ground line + mood sky + context furniture).
  // That IS shape-per-word — "a 12 sided weird looking shape has nothing to
  // do with a random word" — and the valence-cliff sky (valence<0.1 → rain)
  // + house context furniture made every image the same. Superseded by the
  // creativity engine _drawConcept above: she RECALLS or LOOKS UP a real
  // reference of the concept, perceives it into a field C, and TRACES it —
  // the form comes from an image she looked at, never a table. No stages,
  // no allow-list, no furniture.

  // DRAW.5 _drawPracticeBump — RETIRED (Gee 2026-07-16 audit): its only caller was
  // the retired white-ink practice loop; the layout-hash it fed died with the old
  // schema composer. No-vestigial.

  // DRAW.8 — full-resolution canvas, always (the old grade-gated 96..512 ladder
  // was ripped out per the zero-dumbing directive).
  _drawCanvasSide() {
    // ZERO DUMBING (Gee 2026-07-15: "rip out BOTH gates ... K quality == PhD
    // quality, zero intentional limits"). NO grade cap on canvas resolution — every
    // drawing renders at the full canvas (512, the sketch ceiling) regardless of
    // grade. Her drawing quality is her FULL capability, not gated by how far she's
    // walked. (env override for a smaller box if ever needed.)
    return Number(process.env.DREAM_DRAW_CANVAS) || 512;
  },

  // Is this a DRAWABLE concept? DYNAMIC — works for ANY word including never-seen
  // ones, NO hardcoded word list (Gee 2026-07-15: "it has to be dynamic for never
  // seen words"). A drawable concept denotes a physical OBJECT = a NOUN. She reads
  // the part-of-speech from the SAME dictionary she queries for every definition
  // (dictionaryapi.dev via the definition service, cached). A word whose senses are
  // only verb / adverb / conjunction / pronoun / preposition ("nicknamed",
  // "because", "however") names an action or relation, not a thing — tracing its
  // reference gives the vector-scatter garbage, so don't draw it (→ she draws a
  // grounded favorite instead). This was the empirical finding: drawability can NOT
  // be read from the reference image (coherence, plain-bg fraction, and cross-seed
  // stability all fail to separate concrete from abstract) — it is SEMANTIC (POS).
  // Dictionary miss → permissive (draw it; genuinely-unknown words are rare).
  // DRAWGATE (2026-08-21) — a word is drawable ONLY when it is a THING, PERSON,
  // PLACE, or ANIMAL, per the operator's law. The old gate was any-noun-sense,
  // which waved through numbers, speech sounds, qualities and events — all of
  // which trace to garbage scatter because there is no picture of them to
  // ground. Evidence-based from HER OWN definitions (the same trained
  // dictionary every other recipe reads — no text-AI, no per-word list):
  //   1. a banked shape schema = she has SEEN it → drawable, no lookup needed;
  //   2. otherwise a noun sense must carry CONCRETE evidence (creature / plant /
  //      object / place / material / body-part markers) and not open as an
  //      ABSTRACT head-noun (quality / act / number / sound / feeling / ...);
  //   3. no dictionary entry, or no concrete noun sense → NOT drawable.
  // The default flipped permissive→strict on purpose: refusing to draw an
  // abstraction is honest; scribbling letter-shapes at it never is.
  async _conceptIsDrawable(word) {
    const w = (typeof this._vmContentTokens === 'function') ? (this._vmContentTokens(word)[0] || '') : String(word || '').toLowerCase().trim();
    if (!w || w.length < 2) return false;
    // ARTJUDGE 🚫 — the operator taught her this word is not a drawing
    // subject; that verdict outranks every other judge.
    try { if (this._artBanSet().has(w)) return false; } catch { /* ban set best-effort */ }
    // THE TAXONOMY IS THE JUDGE — no word lists anywhere (operator law,
    // 2026-08-21: lists cannot cover the real world). WordNet's lexicographer
    // categories file every English noun sense at build time:
    //   'concrete' → some sense is a thing/person/place/animal → DRAWABLE.
    //   'abstract' → WordNet knows the word and NO sense is one → REFUSED.
    //     (Numbers file under quantity, sounds under communication/event,
    //      qualities under attribute, function words are simply absent.)
    //   'unknown'  → not in WordNet (new words, slang, proper nouns) → judge
    //     by the word's DICTIONARY DEFINITION below, which is fetched live on
    //     a cache miss — so brand-new words she has never been trained on are
    //     judged the moment they arrive.
    try {
      if (!this._drawTaxonomy) this._drawTaxonomy = require('../drawable-taxonomy.js');
      const v = this._drawTaxonomy.drawableVerdict(w);
      if (v === 'concrete') {
        // an UNATTESTED grant (the noun reading never occurs in tagged
        // corpora) is cross-examined by the dictionary's own grammar tags —
        // "or" is granted only by an unattested heraldry sense, and its
        // dictionary entry declares conjunction
        if (!this._drawTaxonomy.unattestedNoun(w)) return true;
        let xdefs = null;
        if (this.cortexCluster && typeof this.cortexCluster.lookupDefinitionFull === 'function') {
          try { xdefs = await this.cortexCluster.lookupDefinitionFull(w); } catch { xdefs = null; }
        }
        if (Array.isArray(xdefs)) {
          for (const d of xdefs) {
            const pos = String(d.partOfSpeech || '').toLowerCase();
            if (pos === 'conjunction' || pos === 'preposition' || pos === 'pronoun' || pos === 'interjection' || pos === 'determiner' || pos === 'article' || pos === 'particle' || pos === 'numeral') return false;
          }
        }
        return true;
      }
      if (v === 'abstract') return false;
    } catch { /* taxonomy unavailable — the definition evidence stands alone */ }
    // A word WordNet knows ONLY as adjective/verb/adverb is not a thing —
    // curated verdict; keeps crowd-dictionary slang noun senses from making
    // qualities drawable ("strange" carries one slang noun entry).
    try { if (this._drawTaxonomy && this._drawTaxonomy.knownOnlyNonNoun(w)) return false; } catch { /* fall through */ }
    let defs = null;
    if (this.cortexCluster && typeof this.cortexCluster.lookupDefinitionFull === 'function') {
      try { defs = await this.cortexCluster.lookupDefinitionFull(w); } catch { defs = null; }
    }
    if (Array.isArray(defs) && defs.length > 0) {
      // the dictionary's OWN grammar declaration: a word carrying a
      // function-word or numeral part-of-speech tag is grammar, not a thing
      for (const d of defs) {
        const pos = String(d.partOfSpeech || '').toLowerCase();
        if (pos === 'conjunction' || pos === 'preposition' || pos === 'pronoun' || pos === 'interjection' || pos === 'determiner' || pos === 'article' || pos === 'particle' || pos === 'numeral') return false;
      }
      return this._defsSayConcrete(defs);
    }
    // No taxonomy entry and no definition — her banked shape is the only
    // witness left: she LOOKED at something real under this word once.
    try {
      const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
      const e = store && store.get(w);
      if (e && e.schema && Array.isArray(e.schema.parts) && e.schema.parts.length) return true;
    } catch { /* store unreadable — strict default below */ }
    return false;
  },
  // The evidence test for words the TAXONOMY does not know (new words, slang,
  // proper nouns): dictionary definitions are GENUS-FIRST ("a large feline
  // that hunts…"), so take the definition's HEAD CLAUSE — pure grammar, split
  // before the differentia — and ask the TAXONOMY about each head word.
  // "floofdoodle: a small fluffy dog kept as a pet" → head "a small fluffy
  // dog…" → "dog" files under noun.animal → drawable. No marker lists, no
  // abstract/concrete regexes: the same taxonomy judges the genus words.
  // ANY noun sense with a concrete genus qualifies (multi-def law).
  _defsSayConcrete(defs) {
    let tax = null;
    try { tax = this._drawTaxonomy || (this._drawTaxonomy = require('../drawable-taxonomy.js')); } catch { return false; }
    if (!tax || typeof tax.drawableVerdict !== 'function') return false;
    // the head clause: the genus phrase before the differentia begins (grammar
    // structure of a dictionary definition, not subject knowledge)
    const headOf = (t) => String(t).split(/[,;:.()]| that | which | who | whom | whose | used | for | with | having | characterized | typically | especially | such as /i)[0].slice(0, 90);
    for (const d of defs) {
      if (String(d.partOfSpeech || '').toLowerCase() !== 'noun') continue;
      const text = String(d.definition || '').trim();
      if (!text) continue;
      const words = headOf(text).toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(x => x.length > 2).slice(0, 6);
      for (const gw of words) {
        if (tax.drawableVerdict(gw) === 'concrete') return true;
      }
    }
    return false;
  },

  // DRAW.7 _practiceDrawFromMemory + DRAW.4 _drawFromMemoryStrokes — RETIRED
  // (Gee 2026-07-16 audit). The practice loop rendered the memory as WHITE-INK
  // traceLineArt strokes and published them as canvas:memory: — the last leftover
  // white-pencil publisher after "NO MORE PENCIL ART". The recall-hit draw branch
  // now goes through _drawConcept (field default = her beautiful COLOURED
  // recreation + dazzle label). _drawSkill / remember-in-relation bookkeeping
  // lives on in _rememberDrawing (the look-up→draw path); nothing else called
  // these, so they're gone per the no-vestigial law.

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
    this._imagineTick(now).catch(() => { /* imagination best-effort */ });
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
      // Dream windows must NEVER tick the cortex: this branch exists to give
      // consolidation + K_VOCAB Hebbian CPU priority, but the default sample
      // path was compose-ALLOWED — at biological scale one composeSentence
      // word-tick synchronously propagates the main cortex ~57s on the host
      // CPU (donors do not help; see the #36 Path B gate below), so a single
      // dream-window showcase could pin the event loop for minutes and starve
      // donors + dashboards mid-dream. Cheap trained-vocab pick only here.
      const showcaseSentence = await this._sampleCurrentSentence({ allowCompose: false });
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
    // The GPU proxy must be LIVE, not just donor-counted — a donor mid-reconnect
    // is still counted (`_communityDonorCount>=1`) but `cluster._gpuProxyReady`
    // is false until its full re-upload completes, and `stepAwait` CPU-ticks
    // (~57s/word) while it's false. Without this term the env-only gate passed
    // during a reconnect and generation CPU-ticked → the 156s freeze that trips
    // the donor's 150s idle. Requiring _gpuProxyReady forces the cheap showcase
    // during any reconnect window (Gee 2026-07-14 root-cause fix).
    const _gpuProxyLive = !!(this.cortexCluster && this.cortexCluster._gpuProxyReady === true);
    const _gpuGenAvailable = process.env.DREAM_INNERVOICE_GPU_GEN !== '0'
      && _donorsPresent
      && _gpuProxyLive
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
            curriculumBusy: !!this._curriculumInProgress,   // donor-drop fix — 1 compose candidate mid-walk
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
        coherenceCandidates: this._curriculumInProgress ? 1 : 2,   // donor-drop fix — rerank is idle-only
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

  // ── ONE PROCESS, the last mile — HER VOICE FROM HER PROCESS ──────────────
  // (Gee 2026-07-17: "what the fuck, she still drops the doner connection
  // every time she speaks" + "its all gpu now right? voice, minds eye and the
  // brain! one unified system".) Listener browsers used to synthesize every
  // reply themselves (per-visitor onnxruntime worker) — on the operator's
  // machine that shared silicon with the compute donor, and one stale cached
  // tab could grab WebGPU and kill the donation whenever she spoke. Now the
  // reply's voice is synthesized by HER process — a voiceSynth-capable donor
  // when connected (browser donors carry it; the native binary gains it with
  // its ort port), the box worker thread otherwise — and the viewer receives
  // her field-A equations (a few KB) to reconstruct + play. Fire-and-forget:
  // the text reply already shipped; a failed synth = a silently text-only
  // reply, never a delayed one.
  async _voiceLane(ws, text) {
    try {
      if (!text || typeof text !== 'string' || !ws || ws.readyState !== 1) return;
      let out = null;
      if (typeof this._mindspaceDonorCapable === 'function' && this._mindspaceDonorCapable('voiceSynth')) {
        // 60s: a donor's FIRST synth may pay the one-time model fetch/cache.
        const r = await this.gpuMindspaceOp('voiceSynth', { text }, 60_000);
        if (r && r.rec) out = { rec: r.rec, sampleRate: r.sampleRate || r.rec.sampleRate };
      }
      if (!out) {
        if (!this._voiceSynth) {
          const { VoiceSynthProxy } = require('./voice-synth.js');
          this._voiceSynth = new VoiceSynthProxy();
        }
        out = await this._voiceSynth.synthesizeRec(text);
      }
      if (out && out.rec && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'voice', text, rec: out.rec, sampleRate: out.sampleRate || out.rec.sampleRate || 22050 }));
      }
    } catch { /* voice is best-effort — the text reply already landed */ }
  },
};

module.exports = { SERVER_CHAT_MIXIN };
