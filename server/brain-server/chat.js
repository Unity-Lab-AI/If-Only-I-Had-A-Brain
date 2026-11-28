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
// ⚠ `execFile`, NOT `execSync`. The synchronous form was the main loop's single
// biggest blocker (one spawn per second; see `_updatePerfStats`). There is now
// no synchronous child-process call anywhere in this file and there must not be
// one again — a spawn on the brain's thread stops her thinking while it runs.
const { execFile } = require('child_process');
// AGEPIN.1 — the ONE grade ladder + age map. `_selfImageAge` used to carry
// its own copy keyed on `'K'`, a string the curriculum never emits.
const { GRADE_AGE, normalizeGradeKey } = require('./state.js');

const SERVER_CHAT_MIXIN = {
  // Every draw this mixin makes is one of HER choices — what she draws, which
  // memory surfaces, whether she speaks up — so each rides a named stream of
  // her seeded generator (js/brain/brain-rng.js), saved with her weights. The
  // module loads in `_initLanguageSubsystem`, before any lane here can run; a
  // draw that arrives earlier than that is a boot-order bug and throws loudly
  // rather than quietly drawing from an unseeded source.
  _rand(site) {
    if (!this._rngMod || typeof this._rngMod.brainRandom !== 'function') {
      throw new Error(`[rng] draw "${site}" before her generator loaded`);
    }
    return this._rngMod.brainRandom(site);
  },

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
   * A LAP RING PER LANE, because the chat one is not shareable.
   *
   * ⛔ THIS EXISTS BECAUSE THE ALTERNATIVE ALREADY COST A FILED SUSPICION.
   * `_chatStamp` writes to single fields on this object, and four lanes reach
   * the generation path that stamps it — the chat reply, the inner voice twice,
   * and the dream sentence. They were all writing into the reply's ring, which
   * is how a 42,913 ms continuation appeared on a question-shaped reply whose
   * guard had correctly forced the continuation count to zero. Somebody then
   * spent real effort suspecting a guard that was working.
   *
   * ⛔ THE ROW THAT ASKED FOR THIS SAID EXPLICITLY: DO NOT FIX IT BY WIDENING
   * THE CHAT RING AGAIN. So the chat lane is untouched — `_chatStamp` keeps its
   * own fields and ChatPin's output is byte-identical — and every OTHER lane
   * gets its own entry here, keyed by lane name. Two rings that cannot collide,
   * rather than one ring with a discipline about who may write to it.
   *
   * ⚠ BOUNDED BY CONSTRUCTION. A lane keeps only its slowest stage and its most
   * recent one; nothing accumulates per call. An instrument that grows with
   * traffic is one that eventually has to be turned off, and this project has
   * already retired two panels for exactly that.
   */
  _laneStamp(lane, stage) {
    if (!lane || lane === 'chat') return;   // the chat lane owns _chatStamp; never both
    const now = Date.now();
    if (!this._laneLaps) this._laneLaps = {};
    const L = this._laneLaps[lane] || (this._laneLaps[lane] = { stage: null, at: 0, maxMs: 0, maxStage: null, lastMs: null });
    if (L.stage && L.at) {
      const held = now - L.at;
      L.lastMs = held;
      L.lastStage = L.stage;
      if (held > L.maxMs) { L.maxMs = held; L.maxStage = L.stage; }
    }
    L.stage = stage || null;
    L.at = now;
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
    // ✍ WRITING practice rides the SAME serialized walk lane as drawing
    // practice, for the same reason: it is bookkeeping, and the human never
    // waits on her practising. One bounded self-critique pass per job.
    if (job && job.kind === 'write-practice' && job.text) {
      try { await this._practiceWriting(job.text); } catch (e) { if (!this._writePracticeErrLogged) { this._writePracticeErrLogged = true; console.warn(`[Writing] practice failed: ${e?.message || e}`); } }
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
          // DRAWNCOUNT — the increment moved INTO _drawOwnCreation (the birth
          // of every piece): counting only this drain lane read "0 drawn"
          // while the mind's-eye tick published artwork all day.
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
          // ⭐ CRYSTAL — 192 -> 512. This call site was pinning the imagined field
          // to 192px while `imagineFromState`'s own default had already been
          // raised to 512, so the ceiling work never reached the mind's eye: an
          // explicit argument beats a raised default every time. The plane is
          // built in the mind-space worker, not on the event loop.
          rec = await this.mindSpace.imagineFromState(emb, {
            maxSide: 512, text: imgPrompt,
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

  // ⭐ ONE CONVERSATION TURN AT A TIME. What she LEARNS from anyone is hers to
  // use with everyone; what is LIVE in the moment belongs to the person in
  // front of her. The per-turn state (`_lastUserInputText`, the question flag,
  // the speaker band, the injected words) is one copy on one brain, so two
  // people's turns running at once crossed it: one person's words could steer
  // the reply another person got. Turns now queue; each runs whole.
  processAndRespond(text, userId, opts) {
    const run = () => this._processAndRespondOne(text, userId, opts);
    const p = (this._chatTurnTail || Promise.resolve()).then(run, run);
    this._chatTurnTail = p.catch(() => {});
    return p;
  },

  // Entering someone's conversation: when the speaker changes, the previous
  // person's live input is cleared from her language state and THIS person's
  // own recent exchange is brought back, so she continues the conversation
  // with them — never someone else's moment.
  _enterConversation(userId) {
    if (this._convActiveUser === userId) return;
    const cl = this.cortexCluster;
    const cur = this.curriculum;
    try {
      if (cl) { cl._lastUserInputText = null; cl._lastUserInputEmbedding = null; }
      this._questionPending = false;
      this._whoNow = null;   // the next person's name (if they gave one) is set by _personTurn
      if (cl && cl.regions && cl.regions.sem && cl.externalCurrent) {
        const r = cl.regions.sem;
        cl.externalCurrent.fill(0, r.start, r.end);
      }
      if (cur && typeof cur._clearSpikes === 'function') cur._clearSpikes(['sem', 'fineType']);
      const mine = (this._conversations && this._conversations[userId]) || [];
      const recent = mine.slice(-4);
      const _se = this.sharedEmbeddings;
      if (cl && typeof cl.injectEmbeddingToRegion === 'function' && _se
          && typeof _se.getSentenceEmbedding === 'function') {
        for (let i = 0; i < recent.length; i++) {
          const emb = _se.getSentenceEmbedding(String(recent[i].text || ''));
          // Older lines fainter; the newest of their exchange strongest.
          if (emb && emb.length) cl.injectEmbeddingToRegion('sem', emb, 0.08 * Math.pow(0.7, recent.length - 1 - i));
        }
      }
      this._convSwitches = (this._convSwitches | 0) + 1;
    } catch (e) {
      if (!this._convSwitchWarned) { this._convSwitchWarned = true; console.warn(`[Chat] conversation switch: ${e && e.message}`); }
    }
    this._convActiveUser = userId;
  },

  // The people she talks to: userId → { name }, from what each person told her
  // about themselves. Persisted (server/people.json, experience data —
  // gitignored and deploy-excluded like her other memories).
  _peoplePath() { return require('path').join(__dirname, '..', 'people.json'); },
  _people() {
    if (this._peopleMap) return this._peopleMap;
    this._peopleMap = new Map();
    try {
      const raw = JSON.parse(require('fs').readFileSync(this._peoplePath(), 'utf8'));
      for (const [k, v] of Object.entries(raw || {})) this._peopleMap.set(k, v);
    } catch { /* first person she has met */ }
    return this._peopleMap;
  },
  _personTurn(userId, text) {
    if (userId == null) return;
    const id = String(userId);
    const people = this._people();
    const raw = String(text || '');
    // A name, from the person's own introduction: "my name is X", "call me X",
    // or "i'm X" / "i am X" only when X is written capitalized (so "i'm tired"
    // is never a name).
    let m = /\b(?:my name is|my name's|call me)\s+([A-Za-z][A-Za-z'-]{1,23})\b/i.exec(raw)
      || /\b[Ii](?:'m|’m| am)\s+([A-Z][a-z'-]{1,23})\b/.exec(raw);
    // A word WordNet knows ONLY as a non-noun ("tired", "happy") is a state,
    // not a name — even capitalized.
    if (m) {
      try {
        const T = require('../drawable-taxonomy.js');
        if (typeof T.knownOnlyNonNoun === 'function' && T.knownOnlyNonNoun(m[1].toLowerCase())) m = null;
      } catch { /* no taxonomy → trust the introduction */ }
    }
    if (m) {
      const name = m[1].toLowerCase();
      const prev = people.get(id);
      if (!prev || prev.name !== name) {
        people.set(id, { ...(prev || {}), name, since: (prev && prev.since) || Date.now() });
        try { require('fs').writeFileSync(this._peoplePath(), JSON.stringify(Object.fromEntries(people), null, 2)); } catch { /* memory stays in RAM */ }
      }
    }
    const who = people.get(id);
    const cur = this.curriculum, cl = this.cortexCluster;
    if (!who || !who.name || !cur || !cl || !cl.regions || !cl.regions.fineType) return;
    try {
      const C = cur.constructor;
      if (Number.isInteger(C.SPEAKER_WHO_BAND)) cur._writeRelationTag(cl, cl.regions.fineType, C.SPEAKER_WHO_BAND, true);
      if (typeof cur._dictionaryPatternFor === 'function' && typeof cl.injectEmbeddingToRegion === 'function') {
        const p = cur._dictionaryPatternFor(who.name);
        if (p && p.length) cl.injectEmbeddingToRegion('sem', p, 0.2);
      }
      this._whoNow = who.name;
    } catch { /* a reply never fails on who */ }
  },

  async _processAndRespondOne(text, userId, opts) {
    this._enterConversation(userId);
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

  // Light one speaker band on her relation region ('other' = someone is
  // talking to her, 'self' = she is talking), clearing the previous state, on
  // the CPU copy and the card alike — the same writer the lessons use.
  _speakerState(who) {
    const cur = this.curriculum, cl = this.cortexCluster;
    const region = cl && cl.regions && cl.regions.fineType;
    if (!cur || !region || typeof cur._writeRelationTag !== 'function') return;
    const C = cur.constructor;
    const band = who === 'self' ? C.SPEAKER_SELF_BAND : C.SPEAKER_OTHER_BAND;
    try {
      if (typeof cur._clearSpikes === 'function') cur._clearSpikes(['fineType']);
      cur._writeRelationTag(cl, region, band, true);
      // THE QUESTION STATE — while a person's question waits for her answer,
      // "I was asked" stays lit with whoever is speaking: on their turn, and on
      // her turn while she answers (the state her answers were taught in).
      if (this._questionPending && Number.isInteger(C.QUESTION_ASKED_BAND)) {
        cur._writeRelationTag(cl, region, C.QUESTION_ASKED_BAND, true);
      }
      // WHO she is talking to stays lit on her turn too (band 46), so her reply
      // is made to that person.
      if (this._whoNow && Number.isInteger(C.SPEAKER_WHO_BAND)) {
        cur._writeRelationTag(cl, region, C.SPEAKER_WHO_BAND, true);
      }
      this._speakerNow = who;
    } catch (e) { if (!this._speakerWarned) { this._speakerWarned = true; console.warn(`[Chat] speaker-state write failed: ${e && e.message}`); } }
  },

  async _processAndRespondInner(text, userId) {
    // CHAT-STAGE EYES (2026-08-18) — the lag monitor prints _chatStage when
    // a loop pin lands during chat, so the next freeze names its organ.
    this._chatStamp('entry');
    // Inject text into brain
    this.injectText(text);
    this._lastInputTime = Date.now();
    // A question asks her something: the question state is on until she answers.
    this._questionPending = !!(text && /\?\s*$/.test(String(text).trim())
      || (this.curriculum && typeof this.curriculum._isQuestionLike === 'function' && this.curriculum._isQuestionLike(text)));
    // WHO IS TALKING — someone else is speaking to her: the "other speaker"
    // band lights with their words, exactly as it did while she learned to
    // listen (CONV-HEARD trains with the same band).
    this._speakerState('other');
    // WHO — this person, not "someone": the name they gave her (learned from
    // their own words, kept for them alone) rides band 46 with their words,
    // the state CONV-WHO bound to how she answers a particular person.
    this._personTurn(userId, text);

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
      // ── DRAWCTX (ruled 2026-08-20) — "DRAW" MEANS *HER HAND*, NOT A GENERATOR ────
      //
      // The rule: when she is told to "draw", she draws the topic, thing, place
      // or person in context in the user's message — and the deepest form of
      // the complaint about filtered photos was right here: `VISUAL` matched the word
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
          // ⛔ NOT pushed into her thought chain any more. A render prompt —
          // with a code-written style tail ("vibrant saturated color, crisp
          // sharp focus…") — is not something she thought, and it sat in the
          // chain as if it were: five weeks of "poison apple, cherry, product…"
          // steering her imagination, saved and restored every boot.
        } catch { /* learning-loop push non-fatal */ }
        // ⛔ LOOKQUEUE.1 (2026-08-26) — CLAIM THE IMAGE PIPE FOR THE HUMAN.
        //
        // The client builds this image URL itself (PROMPT ONLY, by design) and
        // fetches Pollinations from the SAME PUBLIC IP as this server — so the
        // background reference-look lane and the operator's own image request
        // are competing for one anonymous quota, and the background errand was
        // winning. Reported behaviour: chat image generation does not error out
        // and will eventually produce the image.
        //
        // Stamping the window HERE is what makes that possible: this is the
        // exact instant the intent becomes real, and it is server-side, so the
        // look lane can see it even though the fetch itself happens in the
        // browser. ⚠ A TIME window rather than a lock, deliberately — the
        // client's fetch is out of this process's sight, so there is nothing to
        // release; a lock with no releaser is a lane that never reopens.
        this._imageLanePriorityUntil = Date.now()
          + (Number(process.env.DREAM_CHAT_IMAGE_PRIORITY_MS) || 45000);
        // ⛔ CHATPREEMPT.1 — the stamp alone was not enough, and this is why
        // "(image generation failed)" survived the priority window.
        //
        // The stamp stops the NEXT look. A reference fetch already running
        // holds the single anonymous slot for up to 60s, and the browser fires
        // its image request the moment this returns — so the two collided on
        // one anonymous quota and one of them got a 429. Aborting the in-flight
        // look here frees the pipe in milliseconds.
        //
        // ⚠ Best-effort by construction: it is a no-op when nothing is in
        // flight (the common case), and a failure to preempt must never turn a
        // chat turn into an error — the worst case is the old behaviour.
        try {
          if (typeof this._vmPreemptLookForChat === 'function') this._vmPreemptLookForChat();
        } catch { /* never let lane management break a reply */ }
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
    // Past-notes rule: pair words MUST be already-vocab-trained —
    // we filter to /^[a-z']+$/ K-grade-style words AND verify each
    // appears in the dictionary _words map before binding. Unknown
    // words (typos, rare vocabulary) are skipped so chat input never
    // lands Hebbian writes on phantom-word noise basins.
    try {
      this._chatStamp('pair-enqueue');
      if (this.cortexCluster
          && this.curriculum
          && typeof this.curriculum._teachAssociationPairs === 'function'
          && typeof text === 'string'
          && text.length > 0) {
        const words = text.toLowerCase()
          .replace(/[.!?,;:'"()]/g, ' ')
          .split(/\s+/)
          .filter(t => /^[a-z]+$/.test(t) && t.length >= 1 && t.length <= 20);
        const dictWords = this.cortexCluster.dictionary?._words;
        const filtered = words.filter(t => !dictWords || dictWords.has(t));
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
          // ── OWNWORDS.1 (2026-08-25) — SHE REFUSES IN HER OWN WORDS NOW ─────
          //
          // This branch used to `return { text: pickRejection(reason) }` — one
          // of 30 hand-written lines from `server/drug-rejections.js`, returned
          // as HER REPLY and returned BEFORE the language cortex ever ran. Of
          // every LLM-shaped artifact in this tree that was the worst kind:
          // not a dormant file, but authored text presented to the operator as
          // something Unity said. A hardcoded sentence in her mouth is further
          // from "she speaks from her own weights" than any unused GPT-2 file.
          //
          // ⛔ THE DECISION IS KEPT AND IS NOT THE PROBLEM. Whether she accepts
          // is real state — grade lock, persona exclusion, physical strain,
          // tolerance — computed by the scheduler from her actual condition.
          // That stays exactly as it was. What changes is that the DECISION no
          // longer carries prewritten WORDS with it.
          //
          // So: mark the refusal as state, inject the refusal concept so her
          // sem lands in the right place, and FALL THROUGH to the same
          // language-cortex path the accept branch already uses. She answers
          // from her weights. If those weights cannot yet produce a refusal she
          // says little or nothing — which is honest, and is a training signal
          // we can read, rather than a library covering for her.
          this._lastDrugRefusal = { substance: offer.substance, reason: decision.reason, ts: Date.now() };
          this._drugRefusalCount = (this._drugRefusalCount || 0) + 1;
          try { this.injectText('no i do not want that not right now'); } catch { /* injection is best-effort */ }
        } else {
          // Accepted — fire the ingest event (no dose override; default
          // to 1.0 via scheduler.ingest).
          this.drugScheduler.ingest(offer.substance);
        }
        // BOTH branches now fall through to the language cortex, so the
        // acknowledgement AND the refusal are equally hers.
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
    // AGENCY — someone else just acted. An outcome that follows is THEIRS,
    // which is what separates gratitude from pride and anger from shame.
    this._lastActor = 'other';
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
    // DONOR-FREEZE GUARD (ruled 2026-07-14, confirmed root cause) — at
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
    // ── CAPABILITY BEFORE COMPOSITION (2026-10-18) — the SAME test the inner
    // voice already runs first (`_shouldEmitInnerThought`), in the same order.
    // A brain with zero bucketed words, zero passed cells and zero active
    // subGrades has no word it can emit, and the silence gate further down
    // says exactly that — AFTER a full reply pass. Measured on "hi" to a
    // 40-minute-old fresh walk: `reply pass 14021ms`, 13,986 of them in
    // `generate:primary(3cand)`, with the watchdog reporting the main loop
    // STALLED 5.4 s inside it and the donor attached — the brain's own line
    // says any stage over ~1 s is the shape that makes a donor miss pings.
    // The answer to the visitor is identical (the honest `pre_training`
    // silence); it just costs nothing now. Same primitive as the gate below,
    // so the two cannot disagree; re-arms by itself the moment she buckets
    // her first word. Counted and announced once, never a silent disable.
    const _preCap = (this.cortexCluster && typeof this.cortexCluster.getTrainedCapability === 'function')
      ? this.cortexCluster.getTrainedCapability() : null;
    const _preFresh = !!(_preCap && (_preCap.wordsBucketed | 0) === 0
      && (_preCap.passedCellCount | 0) === 0
      && (_preCap.subGradesActive | 0) === 0);
    if (_preFresh) {
      this._chatFreshSkips = (this._chatFreshSkips || 0) + 1;
      if (!this._chatFreshSkipNoted) {
        this._chatFreshSkipNoted = true;
        console.log('[Chat] 🔇 reply composition HELD — she has no word she can emit yet (wordsBucketed=0, passedCells=0, subGrades=0). The honest silence is sent without the 14 s reply pass that used to find that out. Re-arms by itself when the first word is bucketed.');
      }
    } else if (this._chatFreshSkipNoted && !this._chatFreshResumedNoted) {
      this._chatFreshResumedNoted = true;
      console.log(`[Chat] 🔊 reply composition RESUMED — first word(s) bucketed (${_preCap ? _preCap.wordsBucketed : '?'} words, ${_preCap ? _preCap.passedCellCount : '?'} cells passed). ${this._chatFreshSkips || 0} turn(s) were answered with the held silence.`);
    }
    // CHAT ASKS THROUGH THE EXAM'S LANE. The battery answered "what letter
    // comes after a?" with "b" while the same question in chat produced
    // off-target vocabulary, because the probe reconstructs the teach
    // geometry (dual-tile sem injection + template tag) and reads the
    // trained pathway for the question class, while compose samples a sem
    // state the walk is writing into concurrently. Question-like input now
    // runs the probe FIRST — the same `_studentTestProbe` the gate battery
    // uses, read-only on weights, hard-bounded — and only falls to the
    // compose lane when the probe has nothing confident. Gated on the same
    // CPU-safety condition as generation: the probe ticks the cortex, so a
    // huge cortex with the GPU proxy down must skip it for the same reason
    // compose is skipped.
    let qaPath = null;
    // Question-shaped input, computed once — gates the qa-probe AND tells the
    // compose lane to skip its continuation clauses (a factual ask does not
    // want two extra composed sentences appended; that was 50 of a measured
    // 94 s reply pass).
    const _questionShaped = !!(text && this.curriculum
      && typeof this.curriculum._isQuestionLike === 'function'
      && this.curriculum._isQuestionLike(text));
    if (!_cpuTickUnsafe && !_preFresh && _questionShaped && this.curriculum
        && typeof this.curriculum.answerChatQuestion === 'function') {
      try {
        this._chatStamp('qa-probe');
        // The budget defaults to the wrapper's input-scaled figure (45 s floor
        // — the battery's own per-question budget — +1 s/word past eight,
        // capped 90 s). The env flag, when set, overrides flat.
        const _envQProbeMs = Number(process.env.DREAM_CHAT_QPROBE_TIMEOUT_MS);
        const qa = await this.curriculum.answerChatQuestion(text,
          _envQProbeMs > 0 ? { timeoutMs: _envQProbeMs } : {});
        if (qa && qa.answer) {
          qaPath = qa.path;
          // Render-boundary only (capitalization + terminal punctuation via
          // the same renderer every emission uses) — the WORDS are hers,
          // read from her trained pathways by the probe.
          try {
            const _mod = this.drugScheduler ? this.drugScheduler.speechModulation() : null;
            response = (this.languageCortex && typeof this.languageCortex._renderSentence === 'function')
              ? (this.languageCortex._renderSentence(qa.answer.split(/\s+/), 'statement', _mod) || qa.answer)
              : qa.answer;
          } catch { response = qa.answer; }
          try {
            const _c = this.cortexCluster;
            if (_c && typeof _c.pushEmission === 'function') {
              _c.pushEmission({ source: 'chat', text: qa.answer, ts: Date.now() });
            }
            if (_c) _c._emissionLockedUntil = Date.now() + 6000;
          } catch { /* bus push best-effort — the reply itself stands */ }
          try { console.log(`[Chat] ❓ question answered via the ${qaPath} lane: "${qa.answer}" (score ${typeof qa.score === 'number' ? qa.score.toFixed(2) : '?'}, ${qa.ticks ?? '?'} ticks)`); } catch { /* nf */ }
        }
      } catch { /* the question lane is best-effort — compose runs exactly as before */ }
    }
    if (_cpuTickUnsafe) {
      try { process.stdout.write(`[Brain] chat generation SKIPPED — cortex ${_cortexNeurons.toLocaleString()} > ${_ivMaxNeurons.toLocaleString()} AND GPU proxy not ready (donor mid-reconnect); a CPU cortex tick would freeze the loop ~57s/word and trip the donor's 150s idle watchdog. Honest silence until the donor re-syncs.\n`); } catch { /* non-fatal */ }
      // response stays '' → the honest-silence handler below fires (motor_unstable).
    } else if (!response && !_preFresh) {
      try {
        // CHAT.3 (2026-07-16) — open the chat-priority window: while the reply
        // is composing, the teach firehose (pattern lane + hebbian batch flush)
        // yields the WS + donor queue to the emission dispatches (see gpu.js
        // _chatPriorityActive). 60s ceiling = a stuck generate can't starve
        // teach forever; cleared in finally the moment the reply lands.
        this._chatPriorityUntil = Date.now() + 60_000;
        this._chatStamp('generate');
        // Her turn: the "she is speaking" band replaces the listener band, the
        // state CONV-SAID trained her replies in.
        this._speakerState('self');
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
            // DONOR-DROP FIX (ruled 2026-07-16) — while the curriculum is walking,
            // compose reranking drops to ONE candidate (see language-cortex):
            // 3 full emissions per reply (~39s) stacked on teach + a weights save
            // starved the event loop 47s → donor socket EPIPE → donor dead.
            curriculumBusy: !!this._curriculumInProgress,
            // ⭐ THE CHAT LANE DECLARES ITSELF, because the lap ring it writes to is
            // ONE ring per brain and four lanes reach the same generation code. The
            // inner voice and the dream sentence were stamping their continuation
            // times into this reply's laps, which is how a 42,913 ms continuation
            // appeared on a question-shaped reply whose guard had correctly set the
            // continuation count to zero. Only this call site is a reply to a person.
            lapLane: 'chat',
            // Question-shaped input: compose answers in ONE sentence — the
            // continuation clauses are for conversation, not factual asks.
            questionInput: _questionShaped,
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
        // The question has been answered; it stops being "what she was asked".
        // Left set, every later inner thought read it as its own question.
        if (this.cortexCluster) this.cortexCluster._lastUserInputText = null;
        this._questionPending = false;
      } catch (err) {
        if (this.cortexCluster) this.cortexCluster._lastUserInputText = null;
        this._questionPending = false;
        this._chatPriorityUntil = 0;   // CHAT.3 — close the priority window on failure too
        console.error('[Brain] languageCortex.generate threw:', err.message);
        console.error(err.stack);
        // ⛔ LOOPCHAT.2 (2026-08-26) — THIS RETURNED BARE EMPTY TEXT, AND THE
        // TRANSPORT DROPS THAT ON THE FLOOR.
        //
        // `brain-server.js` sends the reply `if (result.text)`, with an
        // `else if (result.silent)` that forwards a reason to the client. A
        // THROW here satisfied neither branch, so the user got **total dead
        // air** — no bubble, no note, no error — and the only trace was this
        // console line, which at walk speed scrolls out of the ring in minutes.
        //
        // ⛔ Three distinct outcomes existed and only two were distinguishable
        // from the chat window: she answered, she chose silence and said why,
        // or **her reply lane crashed and looked exactly like nothing
        // happened.** A crash must never be quieter than a deliberate silence.
        return {
          text: '',
          action: 'respond_text',
          silent: true,
          silentReason: 'reply_error',
          silentDetail: `Her reply pass threw before composing: ${err && err.message ? err.message : String(err)}. This is a FAULT, not her choosing not to speak — the message reached her and the lane broke. Server log has the stack.`,
        };
      }
      this._chatPriorityUntil = 0;   // CHAT.3 — reply composed; teach lane reopens immediately
    }

    this._chatStamp('respond');
    // A one-letter probe answer ("b" to a letter-sequence question) is a real
    // reply, not silence — the qa-probe lane already applied its own
    // acceptance rule, so its answers bypass the length floor.
    if (!response || (response.length < 2 && !qaPath)) {
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

      // ── THE MEMORY GAP, DERIVED RATHER THAN LEFT BLANK ──────────────────
      //
      // This is the point the whole `deriveMemoryGap` feature was built for and
      // never reached: she HAS training, and this specific input produced no
      // stable sequence. Before this, the only two outcomes were a trained
      // answer or nothing — no path between them — so a concept just outside
      // her training made her go blank instead of reasoning from what she knows,
      // which is not how a mind behaves.
      //
      // ⛔ A FRESH BRAIN NEVER DERIVES. Interpolating against adjacent trained
      // weights needs adjacent trained weights; on a zero-training brain it
      // would be inventing, which is the one thing this lane must not do.
      //
      // ⛔ THE EPISODIC COMMIT RIDES ALONG AND IS NOT A FOLLOW-UP. The cache
      // behind the consistency contract is in-memory, so without the commit she
      // would re-derive after every restart and contradict herself while the
      // code claimed she could not. Passing `commit` here is what makes the
      // contract true rather than asserted.
      //
      // ⚠ IT STAYS HEDGED. A derived answer is surfaced as thinking-aloud, never
      // as something she was taught — `silent:false` with `derived:true` so the
      // transport and the page can both tell the difference.
      // ⛔ Not while the card is reconnecting: the derive composes by ticking the
      // cortex, and with the GPU proxy down that ran on the CPU — measured
      // `respond:derive-gap=19743ms` on the main thread, producing a looped
      // non-answer. The same safety rule already skips generation above.
      if (!isFresh && !_cpuTickUnsafe && this.cortexCluster && typeof this.cortexCluster.deriveMemoryGap === 'function') {
        this._chatStamp('respond:derive-gap');
        try {
          const gap = await this.cortexCluster.deriveMemoryGap(text, {
            curriculumBusy: !!this._curriculumInProgress,
            commit: (concept, answer) => {
              if (typeof this.storeEpisode === 'function') this.storeEpisode(userId, 'derived-memory', concept, answer);
            },
          });
          if (gap && gap.derived && gap.answer) {
            this._derivedGapCount = (this._derivedGapCount || 0) + 1;
            try {
              process.stdout.write(`[Brain] ~ derived-gap (concept=${gap.concept}) persisted=${gap.persisted} "${gap.answer}"\n`);
            } catch { /* nf */ }
            return {
              text: gap.answer,
              action: 'respond_text',
              silent: false,
              derived: true,
              hedge: !!gap.hedge,
              // ⚠ Surfaced, not hidden: a reader must be able to tell an answer
              // she reasoned to from one she was taught, and a derivation that
              // did not persist from one that did.
              derivedDetail: `No trained answer for this input, so she reasoned from adjacent trained weights and is thinking aloud rather than recalling. ${gap.persisted ? 'Stored, so the same gap gives the same answer next time.' : 'NOT stored — the same gap may answer differently after a restart.'}`,
              minGrade,
              trainedCap,
            };
          }
          // A refusal is not a failure and is logged as itself — the gate
          // protecting boundary canon only proves it works by saying so.
          if (gap && gap.refused) {
            try { process.stdout.write(`[Brain] ~ derived-gap REFUSED (${gap.reason})\n`); } catch { /* nf */ }
          }
        } catch { /* derivation must never break the reply path */ }
      }

      // THE NOTICE READS THE LIVE WALK (2026-10-18). This line told the
      // operator to "Start the curriculum (start.bat)" while the walk had been
      // running for forty minutes on `ela/kindergarten` — a fresh brain with a
      // walk in progress and a fresh brain with no walk are different states,
      // and a notice that cannot tell them apart sends a reader to press a
      // button that wipes the training it is describing.
      let _walkLine = 'No walk is running — start the curriculum (start.bat) and watch her abilities build live.';
      try {
        const _cur = this.curriculum;
        const _st = (_cur && typeof _cur.getCurriculumStatus === 'function') ? _cur.getCurriculumStatus() : null;
        const _cell = _st && (_st.currentCellKey
          || ((_st.currentSubject && _st.currentGrade) ? `${_st.currentSubject}/${_st.currentGrade}` : null));
        if (_cell) {
          const _ph = (_st.cellPhasesTotal | 0) > 0 ? ` (phase ${_st.cellPhasesStarted | 0}/${_st.cellPhasesTotal | 0})` : '';
          _walkLine = `The walk is RUNNING — ${_cell} is ${_st.cellStatus || 'in progress'}${_ph}. She speaks once her first cell passes; there is nothing to press.`;
        } else if (this._curriculumInProgress) {
          _walkLine = 'The walk is RUNNING (pre-cell setup). She speaks once her first cell passes; there is nothing to press.';
        }
      } catch { /* the notice must never break the reply — the no-walk line stands */ }
      return {
        text: '',
        action: 'respond_text',
        silent: true,
        silentReason: isFresh ? 'pre_training' : 'motor_unstable',
        silentDetail: isFresh
          ? `Unity is brand new — zero words bucketed, zero cells passed, all subGrades 'fresh'. Her motor region has no letter→motor or sem→word_motor wiring yet. ${_walkLine}`
          : `Motor region didn't commit a stable letter sequence for this input. Live trained capability: ${trainedCap.wordsBucketed} words bucketed across ${trainedCap.bucketSubjects} subjects, ${trainedCap.passedCellCount} cells passed, ${trainedCap.subGradesActive} subGrades active. The intent signal may have been too weak for this specific input — try rephrasing.`,
        minGrade,
        trainedCap,
      };
    }

    // Store the exchange in per-user conversation history + episodic memory
    this._conversations[userId].push({ role: 'assistant', text: response, time: this.time });
    // AGENCY — SHE acted, but only if she actually said something. Silence is
    // not an act, and she has never yet spoken, so moods that need her own
    // doing (pride, shame) stay unreachable until she does — correctly: no one
    // is proud of something they have never done.
    if (typeof response === 'string' && response.trim()) this._lastActor = 'self';
    // ⛔ `this.reward += 0.1` stood here: she was rewarded for SPEAKING,
    // whatever she said and however it landed. That is why reward read positive
    // in 200 of 200 samples, and it made every reply feel good by construction.
    // Reward now comes from outcomes — contact and how things went — through
    // the appraisal in the derived-state tick, never from the act of talking.
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
    // ── ENDO.6 / INTRO.2 — a REAL turn just happened, and two systems need
    // to know: the SON nucleus reads affiliative contact to release oxytocin
    // (bonding chemistry is what makes "am I loved" a felt question rather
    // than a rhetorical one), and the introspective drive reads it to decide
    // whether an outward, relational gap is even available.
    //
    // ⚠ Stamped HERE because this is the point a turn is genuinely complete.
    // Without it both readers sit permanently blind: oxytocin would never
    // fire and no gap could ever be relational — a finished feature switched
    // off by a missing producer, which is the exact defect class this
    // codebase keeps paying for.
    this._lastChatAtMs = Date.now();
    // Contact is per PERSON. Without this she could not be attached to anyone
    // in particular, so losing a specific person could never feel different
    // from being alone — and missing someone is not the same as solitude.
    if (this._contactByUser && userId != null) {
      const _c = this._contactByUser.get(userId) || { lastAt: 0, bond: 0, expected: 0 };
      _c.lastAt = this._lastChatAtMs;
      this._contactByUser.set(userId, _c);
    }

    const _ep = this.storeEpisode(userId, 'interaction', text, response);
    if (_ep && _ep.id && !_ep.merged && text) {
      if (!Array.isArray(this._salienceQueue)) this._salienceQueue = [];
      this._salienceQueue.push({ episodeId: _ep.id, text: String(text).slice(0, 200) });
      while (this._salienceQueue.length > 64) this._salienceQueue.shift();  // bounded, drop-oldest
    }
    this._chatStamp('respond:curiosity');

    // A QUESTION OF HERS DOES NOT WAIT FOR EVER. A line that comes long after
    // she asked is not its answer (`DREAM_QUESTION_ANSWER_WINDOW_MS`, five
    // minutes): the question is let go, and a word she was asking the meaning
    // of goes back among the words she has yet to ask about.
    if (this._pendingQuestionConcept) {
      const _win = Number((typeof process !== 'undefined' && process.env && process.env.DREAM_QUESTION_ANSWER_WINDOW_MS) || 300000);
      if (_win > 0 && Date.now() - (Number(this._pendingQuestionAt) || 0) > _win) {
        const _stale = this._pendingQuestionConcept;
        this._pendingQuestionConcept = null;
        if (this._pendingQuestionIsNewWord === true) {
          if (!Array.isArray(this._wordsToAskAbout)) this._wordsToAskAbout = [];
          if (!this._wordsToAskAbout.includes(_stale)) this._wordsToAskAbout.push(_stale);
        }
        this._pendingQuestionIsNewWord = false;
        const _st = this._newWordStats; if (_st) _st.questionsExpired = (_st.questionsExpired || 0) + 1;
      }
    }

    // WORDS SHE WAS JUST GIVEN AND DOES NOT KNOW — noticed here, after the
    // reply is on its way, and taken in on the lane that teaches between teach
    // calls. Skipped when this line is the ANSWER to a question she asked: its
    // words are the meaning she was told, handled just below.
    if (!this._pendingQuestionConcept) {
      try { this._noticeNewWords(text); } catch { /* noticing a word must never break a reply */ }
    }

    // ── INTRO.2 — THE OUTWARD LANE. A relational gap needs a turn, so it is
    // armed here, right after one completes: the NEXT reply carries it.
    //
    // ⛔ Arming does not write a question. It sets the same gap record the
    // curiosity path consumes, so the words come from her trained
    // interrogative transitions or she says nothing — and only the OUTWARD
    // lane is taken, because rumination belongs on the inner voice and
    // pushing it here is what would make her talk to herself in your face.
    try {
      if (typeof this.armIntrospectiveAsk === 'function') this.armIntrospectiveAsk('outward');
    } catch { /* introspection must never break a reply */ }

    // Curiosity FOLLOW-UP — if Unity ASKED a question last tick
    // (_pendingQuestionConcept set by _maybeAskCuriousQuestion), this user
    // message is the ANSWER. Bind the answer words to the gap concept so she
    // LEARNS it (Hebbian, definition channel) + store the Q→A as an episode,
    // then clear the pending flag. Closes the ask → answer → incorporate loop
    // so she follows up on what she asked, like a real curious entity.
    if (this._pendingQuestionConcept && typeof text === 'string' && text.trim()) {
      const concept = this._pendingQuestionConcept;
      this._pendingQuestionConcept = null;
      try {
        const curric = this.cortexCluster && this.cortexCluster._curriculum;
        // the words of the answer, whole: punctuation around a word is dropped
        // ("screws." is "screws"), a word with letters outside a–z is left out
        const answerWords = this._plainWords(text).filter((w) => w.length >= 2 && w !== concept).slice(0, 8);
        // SHE ASKED WHAT A WORD MEANS AND THIS IS THE ANSWER — it goes through
        // the one door for a new word, told: the answer's words become what
        // the word means to her, weighed first (`Curriculum._meetNewWord`).
        const _askedAboutNewWord = this._pendingQuestionIsNewWord === true;
        this._pendingQuestionIsNewWord = false;
        if (_askedAboutNewWord) {
          this._queueNewWord(concept, { told: answerWords });
        } else
        if (curric && typeof curric._teachAssociationPairs === 'function' && answerWords.length > 0) {
          const pairs = answerWords.map(t => [concept, t]);
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
        // ── INQUIRE (ruled 2026-08-20) — SHE FOLLOWS UP ON THE ANSWER ──────────────
        //
        // The requirement: she must be inquisitive — always asking questions, and
        // following up on the answers to them. Until now the loop ENDED here: she
        // asked, you answered, the answer was bound, and the pending concept was
        // cleared. One question, no curiosity.
        //
        // Now the answer's own content picks the next question, which is what makes it
        // a FOLLOW-UP rather than a second unrelated question: a content word from
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
            const next = answerWords.find(t => t !== concept && !this._inquireChain.includes(t) && t.length > 2);
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
    // ⛔⛔ THIS GAUGE READ A HARD 100 ON A BRAIN USING 1.08 CORES OF 16 (2026-10-19).
    //   Measured side by side: the OS said the process burned 108% of ONE core —
    //   6.7% of a 16-core box — while `perf.cpuPercent` sat at exactly 100 and
    //   never moved across polls minutes apart, with spikesLifetime climbing the
    //   whole time so the data was demonstrably fresh.
    //
    // ⭐ THE ARITHMETIC IS NOT THE BUG. The block below was lifted verbatim into a
    //   standalone harness, run against a worker burning one core, and reported
    //   **6** — correct, every sample. So the fault is in the INPUTS as they are
    //   in this process, not in the expression, and the honest move is to publish
    //   the inputs instead of guessing which one is wrong. A pinned 100 is now
    //   self-describing: `cpuSampleMs` over `cpuWindowMs` says whether the CPU
    //   delta is too large (a baseline that stopped advancing) or the window too
    //   small, and `cpuPercentRaw` shows how far past the clamp it actually went.
    //   ⚠ `Math.min(100, …)` is exactly what made this unreadable — a clamp turns
    //   every impossible value into the same plausible one.
    const cpuUsage = process.cpuUsage(this._lastCpuUsage || undefined);
    const cpuTimeMs = (cpuUsage.user + cpuUsage.system) / 1000; // microseconds → ms
    const elapsed = this._lastPerfTime ? (Date.now() - this._lastPerfTime) : 1000;
    this._lastPerfTime = Date.now();
    // Guard the divisor: os.cpus() can return an empty array, and `x / 0` is
    // Infinity, which this clamp would render as a perfectly ordinary 100.
    const cpuCores = Math.max(1, (os.cpus() || []).length);
    const cpuPercentRaw = cpuTimeMs / (elapsed * cpuCores) * 100;
    const cpuPercent = Math.min(100, Math.round(cpuPercentRaw));
    // ⚠ ONE assignment, not two. The line above this used to be a second,
    //   immediately-overwritten `this._lastCpuUsage = process.cpuUsage()` — dead,
    //   and dead code next to a misbehaving reading is a false lead.
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
      // ⛔⛔ THIS WAS `execSync` AND IT WAS THE SINGLE BIGGEST EVENT-LOOP BLOCKER
      //   IN THE PROCESS — one synchronous child-process spawn PER SECOND, on
      //   the main thread, to fill two dashboard fields.
      //
      // ⭐ HOW IT HID: a thread parked in a blocking syscall is NOT COMPUTING,
      //   so the brain's own 45-second sampler billed it as `(idle) 83.1%` while
      //   `[EventLoop] ⛔ STARVED` reported the loop late 53.3s out of 60 and
      //   `perf.cpuPercent` sat at an honest 1%. Three readings that look like
      //   they disagree and do not — the profile named the culprit outright
      //   (`spawnSync @ child_process:1105`, 3.0% of samples) and nobody had
      //   read it. A Windows process spawn costs 100–500 ms; at once a second
      //   that is most of a second of dead loop in every second.
      //
      // ⚠ AND IT COST A DONOR. `gpu_register` arrives as a WebSocket frame, and
      //   a loop that cannot reach its I/O phase cannot service one — which is
      //   the `[WS] connection … while donors=0` line that had the brain sitting
      //   at "No GPU — brain paused" with a healthy card attached.
      //
      // ⭐ NOW ASYNCHRONOUS AND FIRE-AND-FORGET. The poll is kicked off and the
      //   function returns immediately; whatever the LAST completed sample said
      //   is what gets published this tick. The dashboard is a second stale at
      //   worst, which is invisible, and the loop never waits for a subprocess.
      // ⛔ `_gpuVramPollInFlight` is the whole safety: without it a slow
      //   nvidia-smi would stack one spawn per second until the box dies.
      try {
        this._lastGpuVramPoll = Date.now();
        if (!this._gpuVramPollInFlight) {
          this._gpuVramPollInFlight = true;
          execFile('nvidia-smi',
            ['--query-gpu=memory.used,utilization.gpu', '--format=csv,noheader,nounits'],
            { timeout: 4000 },
            (err, stdout) => {
              this._gpuVramPollInFlight = false;
              if (err) {
                if (!this._gpuVramFailWarned) {
                  this._gpuVramFailWarned = true;
                  this._gpuVramQueryWorking = false;
                  const fl = String(err && err.message ? err.message : err).split('\n')[0].slice(0, 200);
                  console.warn(`[Brain] nvidia-smi GPU query unavailable on this system (${fl}) — dashboard will show VRAM/util as unavailable rather than a made-up number.`);
                }
                return;
              }
              // Output format: "1853, 14" — memory in MB, then util %.
              const parts = String(stdout || '').trim().split(',').map((s) => s.trim());
              const memParsed = parseInt(parts[0], 10);
              const utilParsed = parseInt(parts[1], 10);
              if (Number.isFinite(memParsed) && memParsed >= 0) this._cachedGpuVramUsedMB = memParsed;
              if (Number.isFinite(utilParsed) && utilParsed >= 0 && utilParsed <= 100) this._cachedGpuUtilPercent = utilParsed;
            });
        }
        // Publish the newest COMPLETED sample. Never blocks on the one in flight.
        gpuVramUsedMB = this._cachedGpuVramUsedMB ?? 0;
        gpuUtilPercent = this._cachedGpuUtilPercent ?? 0;
      } catch (err) {
        this._gpuVramPollInFlight = false;
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
      // The three numbers that make a pinned cpuPercent explain itself. Cheap,
      // and the only reason the 2026-10-19 reading needed an OS-level
      // measurement beside it to be disproved at all.
      cpuPercentRaw: Math.round(cpuPercentRaw * 10) / 10,
      cpuSampleMs: Math.round(cpuTimeMs),
      cpuWindowMs: Math.round(elapsed),
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
      // ⭐ WHY `gpuHits` CAN READ 0 ON A PERFECTLY HEALTHY CARD. `_gpuHits++`
      // lives only in the MAIN TICK's compute_batch loop. During a walk the
      // WALK HEARTBEAT is the path that runs, and it has its own loop — so
      // `gpuHits: 0` beside a donor doing thousands of batches is the normal
      // mid-walk reading, not a dead GPU. This counter is that second loop.
      //
      // ⛔ IT LIVES HERE, NEXT TO ITS SIBLING, BECAUSE I FIRST PUT IT IN THE
      // WRONG OBJECT. The first cut added it beside a DIFFERENT `gpuHits` —
      // the one inside the `profiling` block, next to `uplink` and
      // `gateProbes` — so `perf.walkTickAcks` published `undefined` while
      // reading, in source, exactly like a correct fix. `s.perf` is
      // `this._perfStats`, assembled HERE. **Caught by reading the live field
      // off the box rather than trusting the diff** — the same
      // producer/consumer mismatch this session has been fixing all day,
      // committed by me while fixing it.
      walkTickAcks: this._walkTickAcks || 0,
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
    // deployed box) — the mind's eye is a part and process of her thinking and
    // should never be blank. Now she free-wheels every ~8s even mid-teach
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
        // FROZENCHAIN — what she is thinking NOW, not a weeks-old restored line.
        const texts = this._currentThoughts();
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
            // AUDIT FIX (ruled 2026-07-16 "make sure weve been doing everything
            // correct"): this branch used _practiceDrawFromMemory → white-ink
            // traceLineArt strokes = the LAST leftover white-pencil publisher
            // ("NO MORE PENCIL ART"). Now it draws via _drawConcept — the field
            // default: her beautiful COLOURED recreation + dazzle label.
            if (typeof this._drawConcept === 'function' && this._rand('imagine-draw-concept') < 0.35) {
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
      // real thing. This turns "talk to her about a thing → she imagines that
      // thing" into truth (after the first generate). Gated hard so it's
      // curiosity, not spam: concrete-noun head only, not already seen, cooldown,
      // low probability, never mid-teach-perturbing (broadcast only).
      // DRAW-ENGINE (ruled 2026-07-15) — NON-BLOCKING GROUND + DRAW. Grounding a
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
      // DRAW-ENGINE (ruled 2026-07-15) — she DRAWS the concept she couldn't re-see.
      // Recall a grounded field C, else LOOK IT UP (definition-driven reference,
      // perceived headlessly into a field C), then TRACE it into her hand's
      // strokes + her goth palette. No shape-per-word stamp, no stage machine, no
      // rain/house furniture — the FORM comes from an image she actually looked
      // at. _drawConcept returns null when she can nothing to ground (never seen,
      // no reference) → honest no-drawing, and the de-novo mood field renders below.
      // IMAGINATIVE DRAWING — open-ended, from her own head: she must be able to
      // IMAGINE as well, drawing things she has not seen, open-ended and
      // dynamically unbounded. Fired DETACHED/background (it may fetch parts, so
      // awaiting would freeze the viewer) on a fraction of ticks — regular enough to
      // actually SEE (the old grounded-only + 15% version never fired: starved), but
      // reference drawings stay primary. It composes drawable nouns from her stream
      // of thought and publishes its own canvas:imagine frame when ready.
      // 0.18 → 0.45 (2026-11-24, operator: "i need to see more of her imaginative
      // creations from cratcfh knowing what she knows and has seen like new secens
      // and versions of things"). Each one is a detached background compose, so a
      // higher rate costs worker time, never the tick.
      if (typeof this._imagineAndDraw === 'function' && this._rand('imagine-and-draw') < (Number(process.env.DREAM_IMAGINE_DRAW_PROB) || 0.45)) {
        this._imagineAndDraw().catch(() => { /* background imagine best-effort */ });
      }
      // ⛔ "No thought to recall from" IS a miss too. This block used to need
      // `_recallMissed`, which is set only when a thought existed and recall
      // failed — so on a FRESH walk (no thoughts yet: her inner voice cannot
      // emit before word_motor fires) it never ran, and her eyes never
      // started: measured on a freshstart, 54 minutes with 0 looks, 0
      // drawings, `ownArt.lookups` never even created. The picker below already
      // handles an empty thought (its acquisition rank looks at words she has
      // been TAUGHT but never seen) — it was simply never asked.
      if (!rec && (_recallMissed || !_seedText) && typeof this._drawConcept === 'function') {
        // LOOK UP → DRAW, in the background (ruled 2026-07-15: "she shall draw more
        // often"). Detached from the tick (never holds `_imagineInFlight`, so the
        // slow fetch can't freeze the viewer — that was the earlier bug). It fetches
        // the reference (self-publishes the `lookup:` frame as she SEES it) and then
        // DRAWS the very thing she looked up (`canvas:draw:` frame) — 1:1, the
        // reference then her own traced version. Its per-concept cooldown / gap /
        // in-flight guards keep it to ~one real look-up + draw per 15s.
        // ⛔ EYEPIN.1/.2 (2026-08-25) — THIS BLOCK USED `_seedText` DIRECTLY FOR
        // BOTH THE LOOK-UP AND THE DRAW, AND `_seedText` IS THE TAIL OF
        // `_innerThoughtChain`. A chain that stops advancing therefore pinned
        // the whole lane to ONE WORD forever.
        //
        // Measured on the live box: 8 of 8 sampled frames were `church`, in
        // three different styles, while `emitDiagnostic` read `no-best-word`
        // with `sampleCount 0` at an age of 1.07s — i.e. emission was failing
        // on every tick, so no new thought ever reached the chain.
        //
        // ⭐ Every anti-repetition mechanism already here sits DOWNSTREAM of
        // that seed: the 70/30 recombination above rotates an older thought
        // into the FIELD, and the style picker zero-weights the last style —
        // neither can change the SUBJECT. That is why the lane looked healthy
        // (383/383 drawn, every error counter 0) while repeating itself: it
        // was faithfully redrawing a stalled thought.
        //
        // ⛔ And it starved her acquisition at the same time: handing the same
        // word to `_lookUpAndDraw` every tick meant it hit its own 6h
        // per-concept cooldown forever — `attempts: 1` for an entire boot
        // against `alreadyKnown: 368`. She learned no new sights because she
        // only ever asked about one.
        //
        // ⭐ Fixed at the CHOKEPOINT rather than here: `_pickEyeSubject()` is
        // the single owner of "what is she looking at", and it returns the
        // acquisition decision with it. ⚠ This is a ROTATION POLICY, not a
        // fallback — there is one subject chooser, always consulted, and no
        // degraded second path. Her thought still wins whenever it is moving.
        const _pick = await this._pickEyeSubject(_seedText);
        if (_pick && _pick.word) {
          // The look-up rides the CHOSEN subject. When the pick is an
          // acquisition (`_pick.lookup`), this is a concept she has never
          // seen, so the fetch is real work rather than a cooldown no-op.
          if (_pick.lookup && typeof this._lookUpAndDraw === 'function') {
            this._lookUpAndDraw(_pick.word).catch(() => { /* background look-up + draw best-effort */ });
          }
          // DRAW NOW from what she has ALREADY grounded (recall / provisional) —
          // never a fetch (allowFetch:false), so the tick stays microsecond-fast
          // and the viewer cycles every ~6-8s instead of stalling on the network.
          // ⚠ Drawability was already checked inside the picker; re-testing here
          // would be a second async taxonomy hop per tick for no new information.
          try {
            const drawn = await this._drawConcept(_pick.word, { allowFetch: false });
            if (drawn && drawn.rec) {
              rec = drawn.rec;
              _seedSource = drawn.source || drawn.label;
              this._eyeNoteDrawn(_pick);
            }
          } catch { /* draw best-effort */ }
        }
        // FAVORITE fallback (ruled 2026-07-15) — the current thought couldn't ground
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
            // EYEPOOL — every memory she holds, not just the resident few
            // hundred; and nothing she showed in her last few looks.
            const _eyeRecentSet = new Set(Array.isArray(this._eyeRecent) ? this._eyeRecent : []);
            const _favAll = this._vmAllKeys();
            const _favKeys = _favAll.filter(k => !_eyeRecentSet.has(k)).length ? _favAll.filter(k => !_eyeRecentSet.has(k)) : _favAll;
            // ── VMUSE.5 — THE RELATION IS FINALLY CONSUMED ───────────────────
            // The stated model: art concepts are stored alongside text concepts,
            // and the brain's consciousness interjects. Both halves are true in the code: art
            // percepts bind through the SAME channels as text (ARTWEIGHT writes
            // tag 35 / 13 when she draws, VMRELATE the same when she sees), into
            // the same sem region — so a concept she has SEEN and a concept she
            // has READ live in one space and one relation read covers both.
            //
            // ⛔ Until now nothing consumed the reader. The draw plan set
            // `s.relationTag` and NOTHING IN THE TREE EVER READ IT — the same
            // write-only-counter shape as `_relTagWrites`, one level up.
            //
            // What it does here: when she reaches into memory for something to
            // interject about, prefer a concept whose relation she actually
            // KNOWS. A confident band means she has learned what KIND of thing
            // it is, not merely that it exists — so it is the better thing to
            // surface and think about.
            //
            // ⚠ This is a PREFERENCE over candidates she was already willing to
            // pick, never a filter: nothing is excluded, and if no candidate has
            // a confident relation the loop below behaves exactly as before.
            // ⚠ And it does NOT touch what she DRAWS — subjects are still never
            // added, removed or reordered on the strength of a band, which was
            // the standing constraint. It changes what she REACHES FOR.
            // ⚠ Costs nothing today and nothing later: `_confidentRelationFor`
            // is cached per word and returns null while the bands are still
            // separating (currently ~3% of the gate), so this is inert until
            // she has genuinely learned the relations — which is the correct
            // behaviour, not a disabled feature.
            // ⛔ PER-TICK, not the cumulative counter. Keying the first-try bias
            // off `_eyeRelationPicks` would make it true forever after the first
            // success, so every later tick would take _favKeys[0] whether or not
            // this tick actually reordered anything — pinning the eye to one
            // concept. That is EYEPIN exactly, and it is already in the ledger.
            let _relOrdered = false;
            try {
              const _cur = this.curriculum;
              if (_cur && typeof _cur._confidentRelationFor === 'function' && _favKeys.length > 1) {
                const _known = [];
                // Bounded scan — this runs on the mind's-eye tick, so it samples
                // rather than walking a store that can hold tens of thousands.
                const _scan = Math.min(_favKeys.length, 24);
                // ⏱ TIME-BOUNDED: an uncached read is a full CPU propagate (~50
                // ms), and 24 of them per tick were 26.7% of the main thread
                // while teaching (2026-11-24), starving the card. Cached reads
                // stay free; new reads stop once this tick has spent its share.
                const _relT0 = Date.now();
                const _relBudgetMs = Number(process.env.DREAM_EYE_REL_BUDGET_MS) > 0 ? Number(process.env.DREAM_EYE_REL_BUDGET_MS) : 8;
                for (let _i = 0; _i < _scan && (Date.now() - _relT0) < _relBudgetMs; _i++) {
                  const _k = _favKeys[Math.floor(this._rand('eye-favourite-pick') * _favKeys.length)];
                  if (_cur._confidentRelationFor(_k)) _known.push(_k);
                }
                if (_known.length) {
                  // Put the relation-known ones first; the rest still follow, so
                  // the candidate pool is reordered and never shrunk.
                  const _knownSet = new Set(_known);
                  _favKeys.sort((a, b) => (_knownSet.has(b) ? 1 : 0) - (_knownSet.has(a) ? 1 : 0));
                  _relOrdered = true;
                  this._eyeRelationPicks = (this._eyeRelationPicks || 0) + 1;
                }
              }
            } catch { /* non-fatal — a relation read must never break the eye */ }
            for (let _ft = 0; _ft < 4 && !rec; _ft++) {
              // Bias the first try toward the front of the (possibly relation-
              // ordered) list; later tries stay random so rotation is preserved.
              const _fav = (_ft === 0 && _relOrdered)
                ? _favKeys[0]
                : _favKeys[Math.floor(this._rand('eye-favourite-pick') * _favKeys.length)];
              if (typeof this._conceptIsDrawable === 'function' && !(await this._conceptIsDrawable(_fav))) continue;
              const drawnFav = await this._drawConcept(_fav, { allowFetch: false });
              if (drawnFav && drawnFav.rec) { rec = drawnFav.rec; _seedSource = 'draw:fav:' + _fav; }
            }
          } catch { /* favorite best-effort — de-novo field below (view-only, not published) */ }
        }
      }
      if (!rec) {
        // ⭐ CRYSTAL — 192 -> 512, same reason as the chat imagery site: an
        // explicit 192 here overrode the raised default, so her inner-voice
        // field rendered at a fraction of what the engine was willing to give.
        rec = await this.mindSpace.imagineFromState(_seed, {
          maxSide: 512, text: _seedText,
          mood: { arousal: this.arousal, valence: this.valence },
          priority: 0.25, value: 0.4,
        });
        // SEE.5 — PERCEPT-ANCHORED IMPRESSION. The pure de-novo field hashes
        // her semantic state into wavelet band energies — deterministic but
        // structurally NON-representational: no word→appearance mapping exists
        // in that path, so it can never converge to a picture on its own.
        // Anchor it instead: find the stored SEEN percept whose concept is
        // nearest (GloVe cosine) to the thought's content words and morph the
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
              const _iKeys = this._vmAllKeys();   // EYEPOOL — all of her memories
              const _iPOOL = 60;
              const _iSample = _iKeys.length <= _iPOOL ? _iKeys : Array.from({ length: _iPOOL }, () => _iKeys[Math.floor(this._rand('eye-imagined-sample') * _iKeys.length)]);
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
  // GROUNDED-ONLY VIEWER (ruled 2026-07-15) — the de-novo thought-blend / sem-state
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
      // BLOBSTORE — recall frames carry STORE recs whose payload is resident
      // binary; the viewer's wire format stays base64, so convert at the door.
      const wireRec = (typeof this._recJsonSafe === 'function') ? this._recJsonSafe(rec) : rec;
      // EYEMORPH — ONE IMAGE CHANGES INTO THE NEXT, AND THE VIEWER SEES ALL OF IT.
      //
      // The server-side step loop below morphed only when two fields shared
      // exact dimensions (almost never, now that a canvas takes its subject's
      // aspect), and its four steps lived ~320 ms each on a page that polls
      // every 6 s — so the in-between fields were computed and never seen, and
      // every change read as a jump.
      //
      // Now the ENGINE brings the previous field to the new field's geometry
      // (reconstruct → resample → perceive, exact W×H) and ships it as `from`
      // beside the new one. The page then runs the engine's own `morphField`
      // between them — coefficient-space union-lerp, the same function, the
      // same codec — and reconstructs every step through the inverse
      // transform. One payload carries the whole change, so no poll can miss it.
      const prevShown = this._lastEyeWireRec || null;
      let fromWire = null;
      if (prevShown && prevShown.channels && process.env.DREAM_EYE_TRANSITION_MS !== '0') {
        if (this._eyeRecsCompatible(prevShown, wireRec)) fromWire = prevShown;
      }
      const finalJson = JSON.stringify({ type: 'mindsEye', rec: wireRec, from: fromWire, terms: rec.equation_count || 0, source, at: now });
      if (!fromWire && prevShown && prevShown.channels && process.env.DREAM_EYE_TRANSITION_MS !== '0') {
        // Different geometry: the engine aligns the old field to the new one,
        // then republishes the SAME frame (same `at`) with its `from` — unless a
        // newer frame has taken the eye in the meantime.
        const seqAt = (this._eyePubSeq | 0) + 1;
        (async () => {
          const aligned = await this._fieldAt(prevShown, wireRec.width, wireRec.height);
          if (!aligned || (this._eyePubSeq | 0) !== seqAt) return;
          const alignedWire = (typeof this._recJsonSafe === 'function') ? this._recJsonSafe(aligned) : aligned;
          if (!this._eyeRecsCompatible(alignedWire, wireRec)) return;
          this._mindsEyeJson = JSON.stringify({ type: 'mindsEye', rec: wireRec, from: alignedWire, terms: rec.equation_count || 0, source, at: now });
        })().catch(() => { /* no morph this time — the frame itself is already up */ });
      }
      // The tracker follows what is SHOWN, and the sequence lets the aligned
      // `from` (above) know whether a newer frame has taken the eye since.
      // DREAM_EYE_TRANSITION_MS=0 sends no `from`, i.e. the instant swap.
      this._lastEyeWireRec = wireRec;
      this._eyePubSeq = (this._eyePubSeq | 0) + 1;
      this._mindsEyeJson = finalJson;
    } catch { /* non-fatal */ }
    if (this.clients && this.clients.size > 0) {
      const payload = JSON.stringify({ type: 'imagine', terms: rec.equation_count || 0, source, ts: now });
      for (const [ws] of this.clients) {
        if (ws.readyState === ws.OPEN) { try { ws.send(payload); } catch { /* non-fatal */ } }
      }
    }
  },

  // MINDMOTION.2/.3 — viewer-only frame swap: the CURRENTLY DISPLAYED image,
  // with none of _publishMindsEyeFrame's memory side effects (no ring push,
  // no _lastImagineRec, no WS ping). Used by the drawing-process frames and
  // the field transitions — display physics, never memories.
  _publishEyeTransient(rec, source) {
    if (!rec) return;
    try {
      const wireRec = (typeof this._recJsonSafe === 'function') ? this._recJsonSafe(rec) : rec;
      this._lastEyeWireRec = wireRec;   // the morph tracker follows what is SHOWN
      this._eyePubSeq = (this._eyePubSeq | 0) + 1;
      this._mindsEyeJson = JSON.stringify({ type: 'mindsEye', rec: wireRec, terms: rec.equation_count || 0, source, at: Date.now() });
    } catch { /* non-fatal */ }
  },

  // MINDMOTION.3 — two wire recs can morph only when they describe the same
  // field geometry; anything else falls back to the instant swap honestly.
  _eyeRecsCompatible(a, b) {
    try {
      return !!(a && b && a.channels && b.channels
        && a.model === b.model && a.colorspace === b.colorspace
        && a.width === b.width && a.height === b.height
        && a.pad_w === b.pad_w && a.pad_h === b.pad_h
        && Object.keys(a.channels).length && Object.keys(b.channels).length);
    } catch { return false; }
  },

  // (The server-side MINDMOTION.3 step loop that lived here is gone: it
  // published four coefficient-lerp frames ~320 ms apart to a page that polls
  // every 6 s, so nobody ever saw them, and a lerp is a double exposure. The
  // change now runs on the page from `from` → `rec` via the engine's
  // `fieldChange`.)

  // LOOK UP → DRAW (ruled 2026-07-15: "she shall draw more often!!!! ... twn -
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
    // that traces to garbage vector scatter — the basic scattered vector
    // drawings had to stop. Non-drawable → don't fetch, don't draw; the tick shows a grounded
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
    // lookup in 1ms (reported as her look-ups no longer appearing). The hold window
    // also suppresses the tick's random favorite draw (see _publishMindsEyeFrame).
    const HOLD = Number(process.env.DREAM_LOOKUP_HOLD_MS) || 4500;
    this._lookupHoldUntil = Date.now() + HOLD;
    await new Promise(r => setTimeout(r, HOLD));
    if (typeof this._drawConcept !== 'function') return;
    let drawn = null;
    try { drawn = await this._drawConcept(concept, { allowFetch: false }); } catch { drawn = null; }
    if (drawn && drawn.rec) {
      this._publishMindsEyeFrame(drawn.rec, drawn.source || drawn.label);
      // REMEMBER-IN-RELATION — she should remember what she looks up and what she
      // draws IN RELATION to each other, the way a person does. Bind her DRAWING to the concept alongside
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
    // MINDMOTION.1 — phrases key by head word, matching _vmHeadWord's own rule.
    const key = ((/\s/.test(String(concept || '')) && typeof this._vmHeadWord === 'function') ? (this._vmHeadWord(concept) || '') : '')
      || (typeof this._vmContentWords === 'function' ? (this._vmContentWords(concept)[0] || '') : String(concept || '').toLowerCase().split(/\s+/)[0]) || '';
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

  // TU.29.13 GROUNDING LOOPS — REMOVED (ruled 2026-07-15). _conceptImageryLoop
  // (browser-broadcast a generate so a feeder could harvest it back) and the
  // stage-0 _scribbleStrokes neuron-doodle are superseded by the DRAW-ENGINE:
  // grounding now runs HEADLESS via _fetchReferenceAndGround (no browser), and
  // she draws real traced form via _drawConcept, not a neuron constellation.

  // ── DRAW-ENGINE (ruled 2026-07-15) — SHE DRAWS WHAT SHE LOOKED AT ──────────────────────────────
  // The creativity engine that IS her mind — NOT a menu of shapes she's allowed
  // to draw. She draws any concept dynamically: recall the field C of a thing she
  // has SEEN (grounded), or LOOK IT UP (definition-driven Pollinations reference,
  // perceived headlessly into a field C), then TRACE that field into her hand's
  // strokes (traceField) and stylize the trace in her goth palette. No shape is
  // assigned to a word; the FORM comes from an image she actually looked at. If
  // she can ground nothing (never seen it, no reference), she draws NOTHING for it
  // yet — honest, like she stays silent on words she can't say — never a fake shape.
  /**
   * EYEPIN.1/.2 — THE SINGLE OWNER OF "WHAT IS SHE LOOKING AT".
   *
   * Returns `{ word, lookup, why }` or null. `lookup` is the acquisition
   * decision travelling WITH the subject, because the two questions were
   * previously answered in different places against different words, which is
   * how the look-up lane ended up permanently pointed at a cooldown.
   *
   * Priority, in order, and the reason each rank exists:
   *
   *   1. ACQUISITION — a word she has been TAUGHT but has never SEEN. This is
   *      the rank that makes look-ups real work instead of cooldown no-ops. It
   *      is FIRST, and gated, rather than last and unreachable: it fires when
   *      her thought is pinned, and every `_EYE_ACQUIRE_EVERY`th pick even when
   *      she is perfectly healthy, so she keeps learning new sights during a
   *      normal walk instead of only when something has already gone wrong.
   *   2. HER THOUGHT, while it is actually moving. She should draw what she is
   *      thinking about — that is the point of the lane. It only loses priority
   *      once it demonstrably stops advancing.
   *   3. RECALL — something she HAS grounded and has not drawn recently.
   *
   * ⚠ The rank ORDER is load-bearing and was wrong on the first cut: with
   * acquisition below the thought rank, an early `return` meant 12 consecutive
   * healthy ticks produced ZERO acquisitions while this comment claimed
   * otherwise. Harness `A healthy thought` exists to hold that line.
   *
   * ⚠ NOT a fallback chain in the banned sense: there is one chooser, always
   * consulted, and every rank produces the same kind of answer at full
   * capability. Nothing here degrades behaviour when a rank is unavailable —
   * it simply is not the best available subject this tick.
   *
   * ⛔ The recent-subject ring is what actually kills the repeat. Ranks alone
   * would not: a pinned thought would still win rank 1 forever. The ring is
   * checked at EVERY rank, so no path can return a subject she just drew.
   */
  async _pickEyeSubject(seedText) {
    // How many consecutive ticks the same thought must persist before it stops
    // being treated as "what she is thinking about" and starts being treated as
    // a stuck pointer. 2 is deliberate: one repeat is normal dwell, and the
    // observed failure held ONE word across an entire boot, so the bar does not
    // need to be high to separate the two cases.
    const _EYE_PIN_TICKS = 2;
    // One acquisition every N picks even when nothing is wrong.
    const _EYE_ACQUIRE_EVERY = 4;
    // How many of her most recent subjects are barred from being re-picked.
    // ⚠ ONE OWNER: the ring's cap IS the window, so the picker and the recorder
    // cannot disagree. Sized against her small early concept store (21 grounded
    // on the box that exposed this) so the bar can never exclude everything she
    // knows and leave her with no subject at all.
    if (typeof this._eyeRecentMax !== 'number') this._eyeRecentMax = 5;

    const _word = (typeof seedText === 'string') ? seedText.trim().toLowerCase() : '';
    if (!Array.isArray(this._eyeRecent)) this._eyeRecent = [];
    if (!this._eyeStats) {
      this._eyeStats = {
        picks: 0, fromThought: 0, fromAcquisition: 0, fromRecall: 0, none: 0,
        pinTicks: 0, maxPinTicks: 0, rotations: 0,
        lastSubject: null, lastWhy: null, lastAt: 0,
      };
    }
    const st = this._eyeStats;
    st.picks++;

    // ── PIN DETECTION. Counts CONSECUTIVE ticks on one thought. ⚠ Tracked even
    // when the thought is empty: "she is thinking nothing, repeatedly" is the
    // same stuck-pointer condition and must not read as healthy variety.
    // ⚠ The comparison uses a SENTINEL for the empty thought rather than the
    // empty string, because `'' && ...` is falsy and would have reset the
    // counter every tick — reading "she keeps changing her mind" when the truth
    // is "she is thinking nothing, over and over". That is the same stuck
    // pointer and must not render as healthy variety.
    //
    // ⛔ The sentinel is a READABLE, GREPPABLE literal, and it is spelled out
    // for a reason: the first version of this line shipped a raw NUL byte
    // (`'\0empty'`). It worked — no real word collides with it — but a NUL in
    // source makes the whole file read as BINARY to `grep`, which then stops
    // reporting matches in it *silently*. A search that comes back clean
    // because the tool gave up is worse than one that errors. No control
    // characters in sentinels.
    const _seedKey = _word || '__eye_no_thought__';
    if (_seedKey === this._eyeLastSeed) st.pinTicks++;
    else st.pinTicks = 0;
    this._eyeLastSeed = _seedKey;
    if (st.pinTicks > st.maxPinTicks) st.maxPinTicks = st.pinTicks;

    // ⭐ NOT STUCK — UNLESS IT IS THE TOPIC. She moves on from what she just
    // looked at (the recent ring), except for what the CONVERSATION keeps coming
    // back to: a word people have said to her at least twice in their last few
    // messages is the topic, and she may keep looking at it while it is.
    const _topic = this._conversationTopicWords();
    const _recent = (w) => this._eyeRecent.indexOf(w) !== -1 && !_topic.has(w);
    // ⚠ Judged on the HEAD of the phrase. The taxonomy answers about a LEMMA,
    // and a modifier+subject phrase is not one — asking about the whole phrase returns
    // unknown and would refuse every multi-word subject, re-creating the
    // one-word-only limit by the back door. A modified subject is drawable because
    // APPLE is.
    const _drawable = async (w) => {
      if (typeof this._conceptIsDrawable !== 'function') return true;
      let probe = w;
      if (/\s/.test(String(w || '')) && typeof this._vmHeadWord === 'function') {
        try { probe = this._vmHeadWord(w) || w; } catch { probe = w; }
      }
      try { return await this._conceptIsDrawable(probe); } catch { return false; }
    };

    // ── RANK 1 — ACQUISITION: taught but never seen.
    //
    // ⛔ THIS RANK IS FIRST, AND THE HARNESS IS WHY. It began below the thought
    // rank, which returns early — so across 12 ticks of a HEALTHY moving
    // thought it fired ZERO times, because the periodic check was never
    // reached. The comment above already promised acquisition "even when her
    // thought is healthy" while the code could only ever acquire once
    // something was wrong. **Ordering silently made the guarantee unreachable.**
    //
    // It runs when EITHER condition holds:
    //   • the thought is pinned — she has nothing new to look at, so go learn
    //     something rather than redraw a stalled pointer; or
    //   • every `_EYE_ACQUIRE_EVERY`th pick regardless of health — so she works
    //     THROUGH the vocabulary she has been taught during a normal walk,
    //     instead of only ever seeing whatever words her thought happened to
    //     land on. That difference is what "actual do lookups" means here.
    const _wantAcquire = (st.pinTicks >= _EYE_PIN_TICKS) || (st.picks % _EYE_ACQUIRE_EVERY === 0);
    if (_wantAcquire) {
      const unseen = await this._pickUnseenTaughtWord(_recent, _drawable);
      if (unseen) {
        st.fromAcquisition++;
        return { word: unseen, lookup: true, why: 'acquire' };
      }
    }

    // ── RANK 2 — HER THOUGHT, if it is moving and she has not just drawn it.
    // ⚠ `lookup: true` — a thought word she has never seen is itself worth
    // looking up; the per-concept cooldown makes a repeat cheap.
    // A subject is a single word: whitespace or sentence punctuation means
    // the seed is a phrase, and a phrase is not a thing she can look at.
    // A SUBJECT PHRASE, not a single word. ⛔ The first cut of this guard
    // required one word, which stopped the leaked generator prompt but also
    // made every modifier+subject phrase impossible — a subject that can
    // never be more than one word is not a real subject.
    //
    // The real distinction is PHRASE vs PROMPT. A subject is short and natural:
    // a few words, no commas, no clause punctuation. A generation prompt is
    // comma-separated and style-laden, which is exactly what leaked in
    // (a comma-separated string of a subject followed by unrelated nouns and
    // a train of generator style directives). Commas and length separate the
    // two without naming a single style word — ⚠ no word list, per the law.
    const _isSubjectPhrase = (w) => {
      if (!w) return false;
      if (w.length > 48) return false;                 // a prompt runs long
      if (/[,;:!?"()]/.test(w)) return false;          // list/clause punctuation = prompt
      const parts = w.split(/\s+/).filter(Boolean);
      // 8 admits a subject carrying a prepositional tail — a real subject WITH its
      // relation, which is the whole point. A prompt is excluded by its commas
      // and by the 48-char cap regardless of how many words it has.
      if (parts.length === 0 || parts.length > 8) return false;
      return parts.every(p => /^[a-z][a-z'-]*$/i.test(p));        // plain words only
    };
    if (_word && !_isSubjectPhrase(_word)) st.seedNotConcept = (st.seedNotConcept | 0) + 1;
    // MINDMOTION.1 — a human imagines PHRASES, not bare nouns ("she is still
    // only looking up single words at a time"). When the seed is one word,
    // mine HER OWN recent thought stream for the word she actually thought
    // right before it: if that neighbor is an adjective by the live
    // dictionary's own part-of-speech (no word list), the subject becomes the
    // modifier+head phrase — "black cat", not "cat". Everything downstream
    // already speaks phrase: the drawability probe judges the head, the
    // reference prompt carries the whole phrase, the store keys by head word.
    // Best-effort: any miss leaves the bare word standing.
    let _subject = _word;
    try {
      if (_word && !/\s/.test(_word) && Array.isArray(this._innerThoughtChain)) {
        const _now = this._currentThoughts();   // FROZENCHAIN — this session's thoughts
        for (let i = _now.length - 1; i >= 0; i--) {
          const s = String(_now[i] || '').toLowerCase();
          if (!s || s.indexOf(_word) === -1) continue;
          const toks = s.split(/[^a-z'-]+/).filter(Boolean);
          const at = toks.indexOf(_word);
          const mod = at > 0 ? toks[at - 1] : '';
          if (mod && mod !== _word && mod.length > 2 && this._wordIsAdjective(mod)) {
            _subject = `${mod} ${_word}`;
            st.phrases = (st.phrases | 0) + 1;
          }
          break;   // only her most recent thought containing the word counts
        }
      }
    } catch { /* phrase composition best-effort — the bare word stands */ }
    if (_word && _isSubjectPhrase(_subject)
        && st.pinTicks < _EYE_PIN_TICKS && !_recent(_subject) && await _drawable(_subject)) {
      st.fromThought++;
      return { word: _subject, lookup: true, why: _subject === _word ? 'thought' : 'thought-phrase' };
    }
    if (_word && st.pinTicks >= _EYE_PIN_TICKS) st.rotations++;

    // ── RANK 3 — RECALL: grounded already, not drawn recently. No fetch is
    // requested for this rank; she is revisiting, not learning.
    try {
      const store = this._visualMemory;
      if (store && store.size > 0) {
        const keys = this._vmAllKeys();   // EYEPOOL — all of her memories, not the resident few
        // Bounded random probing rather than a full shuffle — the store is
        // allowed to reach 25,000 entries (DREAM_VM_CAP) and this runs on the
        // imagine tick, which must stay microseconds.
        for (let t = 0; t < 8; t++) {
          const k = keys[Math.floor(this._rand('eye-recall-pick') * keys.length)];
          if (typeof k !== 'string' || _recent(k)) continue;
          if (!(await _drawable(k))) continue;
          st.fromRecall++;
          return { word: k, lookup: false, why: 'recall' };
        }
      }
    } catch { /* store unreadable — she simply has no recall subject this tick */ }

    st.none++;
    return null;
  },

  // The words the conversation keeps coming back to: content words that appear
  // at least twice across the last 4 things each person said to her. Cached
  // for 10 s (this runs on the imagine tick).
  _conversationTopicWords() {
    const now = Date.now();
    if (this._topicCache && now - this._topicCache.at < 10000) return this._topicCache.set;
    const counts = new Map();
    try {
      for (const msgs of Object.values(this._conversations || {})) {
        if (!Array.isArray(msgs)) continue;
        const said = msgs.filter(m => m && m.role === 'user' && typeof m.text === 'string').slice(-4);
        for (const m of said) {
          const words = (typeof this._vmContentWords === 'function') ? this._vmContentWords(m.text) : [];
          for (const w of new Set(words)) counts.set(w, (counts.get(w) || 0) + 1);
        }
      }
    } catch { /* no conversation — no topic */ }
    const set = new Set([...counts].filter(([, n]) => n >= 2).map(([w]) => w));
    this._topicCache = { at: now, set };
    return set;
  },

  // MINDMOTION.1 — is this word an adjective, by the live dictionary's own
  // part-of-speech evidence (cache-only read, no network on the tick). NOT a
  // word list: the dictionary answers, or the word is not treated as a
  // modifier. Handles both entry shapes the definition service returns.
  _wordIsAdjective(w) {
    try {
      const c = this.cortexCluster;
      if (!c || typeof c.lookupDefinitionsSync !== 'function') return false;
      const defs = c.lookupDefinitionsSync(w);   // cache-only full entries with partOfSpeech
      return Array.isArray(defs) && defs.some(d => d && d.partOfSpeech === 'adjective');
    } catch { return false; }
  },

  /**
   * EYEPIN.2 — a word she has been TAUGHT but has never SEEN.
   *
   * ⭐ This is what turns the look-up lane back into acquisition. The pool is
   * `cluster._definitionTaughtWords` — words she genuinely holds a definition
   * for — so she can only ever go looking at something she already has a
   * concept of, never a random string.
   *
   * ⚠ NOT a word list. Membership is earned by having been taught, and
   * drawability is decided by the live taxonomy gate, exactly as everywhere
   * else. Nothing here enumerates subjects by hand.
   */
  async _pickUnseenTaughtWord(isRecent, isDrawable) {
    const cluster = this.cortexCluster;
    const taught = cluster && cluster._definitionTaughtWords;
    if (!(taught instanceof Set) || taught.size === 0) return null;
    const store = this._visualMemory;
    // Cache the array form and refresh it only when the taught set grows —
    // this runs every imagine tick and the set reaches tens of thousands.
    if (!this._eyeTaughtCache || this._eyeTaughtCacheSize !== taught.size) {
      // ⭐ RELEVANT, NOT RANDOM — NEWEST FIRST. The set keeps the order she was
      // taught in, so walking it from the front sent her to look at whatever
      // she learned first, long ago. Reversed, the words she is learning RIGHT
      // NOW come first: she looks at what her lessons are about. The recent
      // ring (`isRecent`) and the "already seen" skip keep it from looping.
      this._eyeTaughtCache = Array.from(taught).filter(w => typeof w === 'string' && w.length > 1).reverse();
      this._eyeTaughtCacheSize = taught.size;
      // Restart at the newest whenever the vocabulary grows.
      this._eyeTaughtCursor = 0;
    }
    const pool = this._eyeTaughtCache;
    if (pool.length === 0) return null;
    // Bounded scan per tick — the cursor makes progress even when this tick
    // finds nothing, so a long run of already-seen words cannot stall her.
    const SCAN = 24;
    for (let i = 0; i < SCAN; i++) {
      const w = pool[this._eyeTaughtCursor % pool.length];
      this._eyeTaughtCursor = (this._eyeTaughtCursor + 1) % pool.length;
      if (isRecent(w)) continue;
      // ⚠ UNSEEN is the whole point — a confirmed store entry means she already
      // knows what it looks like, and asking again is the cooldown no-op this
      // fix exists to remove.
      try {
        const known = (typeof this._vmPeek === 'function') ? this._vmPeek(w) : null;
        if (known && known.conf && known.rec) continue;
      } catch { /* store unreadable — treat as unseen and let the look-up decide */ }
      if (!(await isDrawable(w))) continue;
      return w;
    }
    return null;
  },

  /** EYEPIN.1 — record what actually reached the eye, so the ring bars repeats. */
  _eyeNoteDrawn(pick) {
    if (!pick || !pick.word) return;
    if (!Array.isArray(this._eyeRecent)) this._eyeRecent = [];
    this._eyeRecent.push(pick.word);
    // ⚠ ONE OWNER — the same `_eyeRecentMax` the picker reads. Two literals
    // that "must agree" is how a bar silently stops barring anything.
    const _max = (typeof this._eyeRecentMax === 'number') ? this._eyeRecentMax : 5;
    while (this._eyeRecent.length > _max) this._eyeRecent.shift();
    if (this._eyeStats) {
      this._eyeStats.lastSubject = pick.word;
      this._eyeStats.lastWhy = pick.why || null;
      this._eyeStats.lastAt = Date.now();
    }
  },

  async _drawConcept(concept, opts = {}) {
    if (!this.mindSpace || typeof this.mindSpace.traceLineArt !== 'function'
        || typeof this.mindSpace.sketch !== 'function') return null;
    const seed = String(concept || '').trim();
    if (!seed) return null;
    // MINDMOTION.1 — a PHRASE keys by its HEAD word ("black cat" → cat), the
    // same rule the visual store itself uses (_vmHeadWord); the old first-
    // content-word key would have filed "black cat" under "black".
    const key = ((/\s/.test(seed) && typeof this._vmHeadWord === 'function') ? (this._vmHeadWord(seed) || '') : '')
      || (typeof this._vmContentWords === 'function' ? (this._vmContentWords(seed)[0] || '') : seed.toLowerCase().split(/\s+/)[0]) || '';
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

    // 4) STYLE — she is NOT limited to one way of drawing, and not subject to
    //    limits on how or what she draws. She varies her artistic style, STABLE
    //    per subject (a name-hash picks it, so re-drawing a thing stays consistent)
    //    across an extensible repertoire — more styles can join this list, no cap:
    //      • lineart   — clean single-ink contour sketch (her hand)
    //      • field     — a DETAILED posterized field render (her high-fidelity mode)
    // COLORFILL DROPPED (ruled 2026-07-15: "stop doing her basic vector crayon
    // drawings they are terrible"). The flat-colour-block style read as crude crayon
    // vectors; her TRACE (line-art) + detailed FIELD render + imagination are the
    // ideal. The traceColorFill primitive stays available (opts.style) but is out of
    // her auto-rotation.
    const side = (typeof this._drawCanvasSide === 'function') ? this._drawCanvasSide() : 96;
    // FIELD is her DEFAULT — the beautiful, detailed, COLORED recreation of what she
    // sees (ruled 2026-07-15: "WTF happened to her beautiful reacreations of seen
    // things! ... its all just white pencil drawlings on green the shit i told you
    // to get rid of originally"). The white-pencil line-art is NO LONGER auto-picked
    // for a single concept — it's a fallback only if the field render can't build,
    // and it's what imagination composition uses (strokes can't overlap as images).
    // Caller may still force a style via opts.style.
    // OWNART (ruled 2026-08-20) — HER OWN VERSION IS NOW THE DEFAULT for every
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
      // ⛔⛔ NO FALL-THROUGH TO A TRACE. When she could not build her own piece
      // (an abstract word, nothing seen yet), this used to fall through to the
      // line-art style — a pale chalk-ink TRACE of the reference picture — and
      // that is the "white pen trace" judged live again and again. Nothing she
      // can build means nothing is drawn; the trace styles run only when a
      // caller or `DREAM_DRAW_STYLE` asks for them by name.
      return null;
    }

    // FIELD style returns a FINISHED drawn rec (no tracing/sketch) — the detailed
    // "immaculate" mode: a posterized full-res render of the reference in her own
    // rendering. Falls through to line-art ONLY if it can't render.
    if (style === 'field' && typeof this.mindSpace.stylizeField === 'function') {
      let fr = null;
      const labelStrokes = this._labelStrokes(key);   // she writes the word on the field render too
      try { fr = await this.mindSpace.stylizeField(rec, { traceSide: Math.max(160, Math.min(side, 256)), bands: 7, labelStrokes }); } catch { fr = null; }   // ONE PROCESS - async (donor GPU when capable)
      // Same flat-field refusal as the imagined lane below — this is the OTHER
      // `stylizeField` publish path and carries the identical risk: a uniform
      // field here would paint her eye solid green with a `canvas:draw:` label
      // instead of a `canvas:imagine:` one. Fixing only the lane that happened
      // to be caught is how the free-VRAM gate ended up on the minority caller.
      if (fr && typeof this._recDetail === 'function'
          && this._recDetail(fr) < (Number(process.env.DREAM_REF_MIN_DETAIL) || 200)) {
        try {
          const _st = (typeof this._imageEngine === 'function') ? this._imageEngine() : null;
          if (_st) _st.flatRenders = (_st.flatRenders | 0) + 1;
        } catch { /* best-effort counter */ }
        fr = null;   // fall through to line-art rather than publish a flat frame
      }
      if (fr) { this._lastSketchLabel = 'canvas:draw:' + key; return { rec: fr, label: this._lastSketchLabel, source: 'canvas:draw:' + key, from: source || ('draw:' + key), style }; }
    }

    // ZERO DUMBING (ruled 2026-07-15: "rip out BOTH gates ... always max detail, new
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

    // 5) CAPTION — the WORD of what she drew, stamped from a fixed 5x7 bitmap
    //    font (light legible ink on dark paper; NO wobble — wobble dumbs her down).
    //
    // ⛔⛔ THIS IS A CAPTION AND NOT HER HANDWRITING, AND THIS COMMENT USED TO
    // CLAIM OTHERWISE. It read *"in her own CLEAN trained hand"*, which asserted
    // a capability she does not have: `_labelStrokes` rendered the concept key
    // through the 5x7 bitmap (since deleted), so the letterforms were a constant and
    // identical whether she is at pre-K or PhD. **She has never spelled anything**
    // — she is not taught letters as shapes, and there is no vocabulary check on
    // this path at all.
    //
    // ⚠ THE CLAIM IS WHAT MADE IT A MYSTERY. Perfectly-spelled words on a pre-K
    // drawing read as an unexplained capability rather than as a label, which is
    // exactly the question that had to be investigated to get back to this line.
    // ⭐ Making the sentence TRUE — letters acquired as schemas like every other
    // shape — is real curriculum work and is filed as its own item. When that
    // ships, this comment changes back because it will have become a description.
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

  // ── OWNART (ruled 2026-08-20) — SHE DRAWS HER OWN VERSION, NOT A FILTERED PHOTO ──
  //
  // The governing requirement: she must not copy a reference and add filters to
  // it and call that drawing. She attempts completely NEW creations, trying to
  // render similar KINDS of images in her own style, layout and appearance —
  // never applying layers and filters to a fetched image and calling it a
  // drawing. She creates her own entirely unique versions, learning from what
  // she has SEEN and from what she understands of the word through its
  // definition and its appearance.
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

  /**
   * ARTWEIGHT — what she MADE moves her weights.
   *
   * Called once per completed piece, from the single point every draw lane
   * flows through. Two bindings, on two channels, because they are two
   * different facts:
   *
   *   • STRUCTURE (tag 35, the attach channel) — subject <-> the part words
   *     she actually built it from, both directions. Drawing a thing forces
   *     attention onto each piece of it, and that is what strengthens the
   *     structure; a person who draws a thing knows its parts better after.
   *   • COMPOSITION (tag 13, the sequence channel) — when a piece holds more
   *     than one subject, those subjects bind to each other and to the place
   *     they were set in, because she composed them together.
   *
   * ⚠ Only what she DREW. `contributed` is the set that actually put marks on
   * the canvas — a subject that failed to build is not in it, and must not be
   * learned as though it had been. Teaching from the plan rather than the
   * result would bind things she never managed to draw.
   */
  _queueArtWeightTeach(contributed, plan) {
    const st = this._artWeight || (this._artWeight = {
      pieces: 0, queued: 0, pairs: 0, skippedBusy: 0, skippedEmpty: 0, skippedRate: 0, lastAt: 0,
    });
    if (!Array.isArray(contributed) || contributed.length === 0) { st.skippedEmpty++; return 0; }
    st.pieces++;
    if (!Array.isArray(this._chatTeachJobQueue)) this._chatTeachJobQueue = [];

    // ── ARTHOG.1 — AN AGGREGATE RATE LIMIT, because nothing bounded one ─────
    //
    // MEASURED on a live 8.64-hour `ela/kindergarten` cell: of 3,536
    // `_teachAssociationPairs` calls, ~3,518 came from THIS lane and ~18 from
    // the ELA curriculum, and that method consumed 2.71 of the 8.64 hours. She
    // was drawing a piece every ~10 seconds and every finished piece queued
    // pairs onto `_chatTeachJobQueue`, which drains on the WALK lane. So the
    // curriculum cell was teaching around eighteen association-pair calls in
    // 8.6 hours while art taught three and a half thousand.
    //
    // ⛔ THE GAP WAS THAT THE ONLY EXISTING PACING IS PER-CONCEPT. The draw
    // lane has a 30-minute per-CONCEPT cooldown, which sounds like a rate limit
    // and is not one: she has thousands of concepts, so the AGGREGATE rate it
    // permits is unbounded. `MAX_QUEUE` is a depth cap, not a rate cap — it
    // only refuses while the queue is already full, and a queue that drains
    // promptly never blocks anything.
    //
    // ⚠ This bounds the TEACH cost, not the DRAW rate. She still draws as often
    // as before; she just does not fire weight updates from every single piece.
    // Rate-limiting the drawing itself would be a bigger change to a different
    // lane, and the measured 2.71 hours is here.
    //
    // ⚠ A refused piece is DROPPED, not deferred — the same thing `skippedBusy`
    // has always done on this path, so it is not a new class of loss. At the
    // observed draw rate she still banks ~60 pieces an hour, which is ~30× the
    // curriculum's own association-pair rate.
    //
    // ⚠ RE-PRICE: not required, and stated rather than assumed. This ADDS a
    // bound; it removes and weakens nothing. `corpus × reps × scale × visits`
    // is untouched, and the walk gets shorter rather than longer.
    //
    // ESCAPE HATCH, and every case was checked rather than trusted:
    //   unset        → NaN >= 0 is false → 60000 (the default)
    //   =0           → 0 >= 0 is true    → 0, limit OFF, exact prior behaviour
    //   =30000       → 30000             → a 30s gap
    //   =nonsense    → NaN >= 0 is false → 60000, the safe default
    const _rawGap = Number(process.env.DREAM_ART_WEIGHT_MIN_GAP_MS);
    const MIN_GAP_MS = _rawGap >= 0 ? _rawGap : 60000;
    if (MIN_GAP_MS > 0 && st.lastAt && (Date.now() - st.lastAt) < MIN_GAP_MS) {
      st.skippedRate++;
      return 0;
    }

    const MAX_QUEUE = Number(process.env.DREAM_ART_WEIGHT_MAX_QUEUE) || 24;
    if (this._chatTeachJobQueue.length >= MAX_QUEUE) { st.skippedBusy++; return 0; }
    const MAX_PAIRS = Number(process.env.DREAM_ART_WEIGHT_MAX_PAIRS) || 24;
    const REPS = Number(process.env.DREAM_ART_WEIGHT_REPS) || 4;

    const clean = (w) => String(w || '').toLowerCase().replace(/[^a-z']/g, '');
    const subjects = [];
    for (const s of contributed) {
      const w = clean(s && s.word);
      if (w.length >= 2 && !subjects.includes(w)) subjects.push(w);
    }
    if (subjects.length === 0) { st.skippedEmpty++; return 0; }

    // STRUCTURE — subject <-> the parts she drew it from.
    const structure = [];
    for (const s of contributed) {
      const w = clean(s && s.word);
      if (w.length < 2) continue;
      const parts = (s && s.schema && Array.isArray(s.schema.parts)) ? s.schema.parts : [];
      for (const p of parts) {
        if (structure.length + 2 > MAX_PAIRS) break;
        const pw = clean(p && (p.name || p.kind || p.type || p));
        if (pw.length < 2 || pw === w) continue;
        structure.push([w, pw], [pw, w]);
      }
    }

    // COMPOSITION — the subjects of one piece, and the place they were set in.
    const composition = [];
    const place = clean(plan && plan.place && (plan.place.word || plan.place.w));
    for (let i = 0; i < subjects.length; i++) {
      if (place && place !== subjects[i] && composition.length + 2 <= MAX_PAIRS) {
        composition.push([subjects[i], place], [place, subjects[i]]);
      }
      for (let j = i + 1; j < subjects.length; j++) {
        if (composition.length + 2 > MAX_PAIRS) break;
        composition.push([subjects[i], subjects[j]], [subjects[j], subjects[i]]);
      }
    }

    if (structure.length === 0 && composition.length === 0) { st.skippedEmpty++; return 0; }
    if (structure.length > 0) {
      this._chatTeachJobQueue.push({
        pairs: structure,
        opts: { reps: REPS, label: 'ARTWEIGHT-STRUCTURE', relationTagId: 35 },
      });
      st.queued++; st.pairs += structure.length;
    }
    if (composition.length > 0) {
      this._chatTeachJobQueue.push({
        pairs: composition,
        opts: { reps: REPS, label: 'ARTWEIGHT-COMPOSITION', relationTagId: 13 },
      });
      st.queued++; st.pairs += composition.length;
    }
    st.lastAt = Date.now();
    return structure.length + composition.length;
  },

  async _drawOwnCreation(text, opts = {}) {
    if (!this.mindSpace || typeof this.mindSpace.sketch !== 'function') return null;
    const plan = await this._drawPlanFromMessage(text, opts);
    if (!plan || !plan.subjects.length) return null;

    // ⭐ VMUSE.5.C — SHE CONSULTS WHAT SHE HAS LEARNED ABOUT THE SUBJECT.
    //
    // The relation channels are written by VMRELATE (what she looked at) and
    // ARTWEIGHT (what she drew). Reading them back HERE closes that loop: the
    // subject's dominant relation is recorded on the plan, so the piece is
    // informed by what she actually knows about the thing rather than by the
    // schema alone.
    //
    // ⚠ Everything goes through the ONE gate, so a band that has not separated
    // yet returns null and this simply does not fire — which is the correct
    // behaviour early in a walk, not a failure. ⚠ And it only ANNOTATES: no
    // subject is added, removed or reordered on the strength of a relation,
    // because a wrong band must never be able to change what she draws.
    try {
      const cur = this.curriculum;
      if (cur && typeof cur._confidentRelationFor === 'function') {
        for (const s of plan.subjects) {
          const w = (typeof s === 'string') ? s : (s && s.word);
          if (!w) continue;
          const rel = cur._confidentRelationFor(w);
          if (rel && typeof s === 'object') s.relationTag = rel.tag;
        }
      }
    } catch { /* non-fatal — a drawing never fails on a relation read */ }

    // Per-attempt seed: the words + her live mood + the attempt counter. Same words
    // on a different day (or a different mood) compose differently — that is her
    // having a style rather than a cache.
    this._ownArtAttempt = (this._ownArtAttempt || 0) + 1;
    const seedStr = plan.subjects.map(s => s.word).join('|')
      + '|' + Math.round((this.arousal ?? 0.5) * 7)
      + '|' + Math.round((this.valence ?? 0.5) * 7)
      + '|' + this._ownArtAttempt
      + '|' + this._semSignature();   // her cortex's state at this moment decides the piece
    const rnd = this._ownArtRng(seedStr);
    // ARTSTYLE — one style per artwork, mood-weighted, never her last one.
    // The whole piece (ground, every subject, label ink) rides the same hand.
    // ARTLEARN — the subjects' human-accepted styles weight the pick.
    const _fusedPiece = plan.subjects.some(s => s && s.fused);
    const artStyle = (typeof this._artStylePick === 'function') ? this._artStylePick(rnd, plan.subjects.map(s => s.word), { painted: _fusedPiece }) : null;

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
    // LABELTRUTH (2026-08-21) — reported: a word that drew nothing was appearing
    // on the label of a drawing it had not contributed to. Only subjects that actually CONTRIBUTE strokes ride the
    // label/log; a schema-less, definition-less word used to draw NOTHING yet
    // still wear the artwork's name.
    const contributed = [];
    for (let i = 0; i < plan.subjects.length; i++) {
      const s = plan.subjects[i];
      // FORMBANK — the drawn form is a per-attempt PICK from the concept's
      // banked variants (verdict-weighted), possibly recolored from another
      // look or the definition — never automatically the merged average.
      // DRAWCOPY — the form is what she IMAGINES of it in this piece (her field
      // fused with the others in it and with her own state), rebuilt into a new
      // pose and proportion. Without any field of it, she rebuilds a form she
      // has banked. Never the remembered trace pasted as it was seen.
      try {
        let base = this._formPick(s.word, rnd) || s.schema;
        // the version of it this piece needs — what her mind is on (see _formForNeed)
        if (!s.fused) { const need = await this._formForNeed(s.word, base, rnd); if (need) base = need; }
        // ⛔ THE PICKED FORM'S OWN BUILD FIRST. This read `_skeletonFor(word)`
        // first — the concept's LATEST look — so whichever form was picked (or
        // blended) above, she built from the same skeleton every time: the
        // photocopy. The picked form's skeleton wins; the look's is the fallback.
        const sk = (base && base.skeleton && base.skeleton.mask) ? base.skeleton
          : (await this._skeletonFor(s.word) || (base && base.skeleton) || null);
        if (base && sk) {
          // INVENTION — her current thought picks another thing she knows the
          // build of, and that thing's limbs graft onto this one.
          let built = sk;
          // She grafts only from what she is THINKING ABOUT: the things named
          // in her current thoughts (and the other subjects of this piece),
          // never her whole memory. ⛔ The first version ranked her readout
          // against every one of ~2,000 memories and grafted whenever any of
          // them beat the subject — which is nearly always, so every live piece
          // carried limbs from reef / heel / ammunition / beach. Then, among
          // those candidates, only when her readout sits closer to one of them
          // than to the subject.
          const inMind = new Set(plan.subjects.map(x => x.word).filter(w => w !== s.word));
          try {
            const recent = this._currentThoughts().slice(-3).join(' ');
            const toks = (typeof this._vmContentWords === 'function') ? this._vmContentWords(recent) : [];
            for (const t of toks) if (t && t !== s.word) inMind.add(t);
          } catch { /* no thoughts to graft from */ }
          const cands = [...inMind];
          const ranked = (cands.length ? this._thoughtRank(cands.concat([s.word])) : null) || [];
          // ⛔ Never onto a FUSED idea: its parts are already joined in the one
          // picture she imagined, and a graft from a passing thought stuck a
          // grey mass onto the subject (judged on a render).
          const thoughtElsewhere = !s.fused && ranked.length > 1 && ranked[0] !== s.word;
          if (thoughtElsewhere) {
            for (const w of ranked.slice(0, ranked.indexOf(s.word)).slice(0, 4)) {
              const dsk = await this._skeletonFor(w);
              if (dsk) { built = this._graftSkeleton(built, dsk, rnd); if (built.grafted) { built.graftedFrom = w; break; } }
            }
          }
          s.schema = { ...base, skeleton: this._poseSkeleton(built, rnd) };
        }
      } catch { /* the plan's schema stands */ }
      const b0 = layout[i];
      const box = {
        cx: Math.min(0.85, Math.max(0.15, b0.cx + (rnd() - 0.5) * 0.06)),
        cy: Math.min(0.85, Math.max(0.15, b0.cy + (rnd() - 0.5) * 0.04)),
        w: b0.w * (0.9 + rnd() * 0.2),
        h: b0.h * (0.9 + rnd() * 0.2),
      };
      boxes.push(box);
      // ⛔ SHADOWKILL — the grounding cast shadow is GONE. Judged and rejected:
      // a dark tinted oval sitting under everything she draws is not a shadow,
      // it looks bad, and it had to go.
      //
      // It was a `blob` at rgb(16,15,19) alpha 0.35 under every subject, and
      // that is exactly what it looked like — a flat tinted ellipse, not
      // light. ⚠ It had already been tuned once, when the doodle hand floated
      // it and the fix was to scale the footprint; the question that pass did
      // not ask is whether an ellipse reads as a shadow AT ALL at her stroke
      // fidelity. It does not, so the lane is deleted rather than tuned a
      // third time. Grounding still comes from the ground line, the tufts and
      // the floor bands in the backdrop, which are drawn, not tinted.
      const built = this._ownArtStrokesFromSchema(s.schema, box, rnd, s.word, artStyle);
      if (built.length > 0) contributed.push(s);
      for (const st of built) { if (!st.layer) st.layer = 'subject'; strokes.push(st); }
    }
    if (contributed.length === 0) return null;   // nothing real drew — no piece, no label
    // nothing she understood well enough → honest no-drawing. A painted body
    // (`layer`) is ONE stroke carrying the whole surface, so it counts on its
    // own — counting marks alone threw every smooth painting away.
    if (strokes.length < 4 && !strokes.some(s => s && s.type === 'layer')) return null;

    // PAINT.11 — HER REVISION PASS: step back, erase what hurts the picture.
    // Backdrop lines running through a subject get erased (occlusion — the
    // subject is in FRONT); near-duplicate strokes collapse.
    let revised = { strokes, erased: 0, deduped: 0 };
    try { revised = this._reviseComposition(strokes, boxes); } catch { /* revision best-effort — the unrevised piece still stands */ }
    const finalStrokes = revised.strokes;

    // The piece is CAPTIONED with what she drew — a fixed 5x7 bitmap font, not
    // her handwriting. This line used to say *"her existing trained glyphs"*;
    // there are no trained glyphs, and the letterforms are the same constant at
    // every grade. No wobble stays right for a different reason than it reads:
    // a caption should be legible, and faking an unsteady hand would dress a
    // label up as a skill.
    if (opts.label !== false) {
      try { for (const g of this._labelStrokes(plan.subjects[0].word)) finalStrokes.push(g); } catch { /* label best-effort */ }
    }

    // MINDMOTION.2 — SHE SHOWS HER WORK. The piece was always drawn stroke by
    // stroke internally and the viewer only ever saw the finished frame — the
    // process was invisible ("its like she is being nuetered in here
    // experimentation drawing not ever showing"). Two in-progress renders of
    // the REAL stroke list (35% and 70%) publish to the viewer only (transient
    // — never the ring, never a memory: an unfinished drawing is not something
    // she remembers, it is something she is doing). The final frame then
    // publishes through the normal lane and MINDMOTION.3 morphs from the last
    // progress frame — the whole birth reads continuously. DREAM_EYE_PROCESS=0
    // disables; short pieces (<24 strokes) skip — nothing to show.
    // ⭐ CRYSTAL — THE CANVAS TAKES THE SHAPE OF THE THING. Portrait for a tall
    // subject, landscape for a wide one, square only when that is genuinely the
    // shape — read from the stored record of the reference she actually SAW
    // (`rec.width`/`rec.height`), not guessed and not fixed. Every stroke is in
    // normalised coordinates, so nothing about the composition changes; the plane
    // simply stops cropping a tall subject and stops padding a wide one.
    // ⚠ Banded 0.25-4.0: a genuinely extreme reference (a 805x2480 multi-panel
    // plate is real, and its aspect is 0.32) still gets its shape, while a
    // degenerate record cannot produce a sliver canvas a stroke cannot land on.
    // ⚠ Falls back to square when the subject has no stored reference — an
    // unknown shape is not a licence to invent one.
    let _aspect = 1;
    try {
      const _vs = (typeof this._vmStore === 'function') ? this._vmStore() : null;
      const _primary = plan.subjects[0] && plan.subjects[0].word;
      const _e = (_vs && _primary) ? _vs.get(_primary) : null;
      const _rw = _e && _e.rec && Number(_e.rec.width), _rh = _e && _e.rec && Number(_e.rec.height);
      if (_rw > 0 && _rh > 0) _aspect = Math.min(4, Math.max(0.25, _rw / _rh));
    } catch { /* no reference on file — square, and say nothing false about it */ }
    // HER EYES SEE IT FIRST — the finished piece is rendered and judged BEFORE
    // anything (progress frames included) reaches the viewer, so a piece her
    // eye refuses is never shown. Single-subject pieces with a learned
    // silhouette are judged; a scene of several things is not (no one mask).
    let drawn = null;
    try {
      drawn = await this.mindSpace.sketch(finalStrokes, {
        maxSide: side,
        aspect: _aspect,
        mood: { arousal: this.arousal, valence: this.valence },
      });
    } catch { return null; }
    if (!drawn) return null;
    if (contributed.length === 1) {
      const _sk0 = contributed[0].schema && contributed[0].schema.skeleton;
      // A fully painted picture is drawn unposed (see `_constructFromMask`).
      const verdict = await this._eyeJudgesDrawing(drawn, contributed[0].word, _sk0 && !_sk0.scene && _sk0.posed);
      const ej = this._eyeJudge || (this._eyeJudge = { passed: 0, refused: 0, unjudged: 0, last: null });
      if (!verdict.judged) ej.unjudged++;
      else if (verdict.pass) ej.passed++;
      else {
        ej.refused++;
        ej.last = { word: contributed[0].word, at: Date.now(), ...verdict };
        // ⛔ A PIECE HER EYE DOUBTS IS STILL SHOWN. Hiding it cut her variety
        // down to the few shapes her eye already trusted, so the viewer saw the
        // same images again and again. The verdict is kept and she still
        // practises the subject; it just no longer blocks the piece.
        try { console.log(`[OwnArt] 👁 her eye doubts her "${contributed[0].word}" — ${verdict.why || `${verdict.beaten} of ${verdict.compared} other things she knows match its shape better (own ${verdict.ownScore})`}. Shown anyway; she practises it.`); } catch { /* nf */ }
        try { if (Array.isArray(this._mindsEyePreviewQueue)) this._mindsEyePreviewQueue.push({ kind: 'practice', word: contributed[0].word }); } catch { /* practice best-effort */ }
      }
      if (verdict.judged) ej.last = { word: contributed[0].word, at: Date.now(), ...verdict };
    }
    if (process.env.DREAM_EYE_PROCESS !== '0' && finalStrokes.length >= 24 && opts.progress !== false) {
      for (const frac of [0.35, 0.7]) {
        try {
          const part = finalStrokes.slice(0, Math.max(4, Math.floor(finalStrokes.length * frac)));
          // Same aspect as the final frame — a progress render that changed shape
          // mid-birth would read as a different drawing, and MINDMOTION.3 morphs
          // from the last progress frame, which requires the planes to agree.
          const partial = await this.mindSpace.sketch(part, { maxSide: side, aspect: _aspect, mood: { arousal: this.arousal, valence: this.valence } });
          if (partial) this._publishEyeTransient(partial, `draw:progress:${Math.round(frac * 100)}`);
          await new Promise(r => setTimeout(r, 450));
        } catch { break; /* process frames are best-effort — the piece itself still lands */ }
      }
    }
    // DRAWNCOUNT (2026-08-21) — reported as "0 drawn" on the board against 25+
    // seen. Count every born piece HERE, at the single
    // point all lanes flow through. The old counter lived in one drain lane
    // while the mind's-eye tick published art all day: 0 drawn, 56 attempts.
    this._ownArtDrawn = (this._ownArtDrawn | 0) + 1;
    // ⛔ ARTWEIGHT — MAKING ART USED TO CHANGE NOTHING IN HER BRAIN.
    //
    // Measured across the whole draw + practice span: ZERO weight-touching
    // calls. `_practiceDrawing` writes `e.skill` — params, cosine, session
    // count — into the visual STORE, and store state is not synapses. So she
    // could draw the same subject a hundred times and not one synapse moved.
    // The stated model: an image someone SEES and art they MAKE both have real
    // effects on all kinds of brain processes.
    //
    // ⭐ The act of drawing is now a bind, on the same drain VMRELATE uses:
    // the subject she drew binds to the PARTS she built it from, both ways.
    // That is what drawing a thing does to a person — it strengthens the
    // structure of the thing, because you had to attend to every piece of it
    // to put it down. And when she drew more than one subject in a scene,
    // those subjects bind to each other and to the place, because they were
    // composed together.
    //
    // ⚠ Bounded like every other drain job, and for the same measured reason
    // (an unbounded teach layer cost 70 min/cell once): a hard pair cap, low
    // reps, and it refuses when the drain is already deep.
    try {
      if (typeof this._queueArtWeightTeach === 'function') {
        this._queueArtWeightTeach(contributed, plan);
      }
    } catch { /* non-fatal — a drawing must never fail on its teach */ }
    // ARTSTYLE — the style rides the label so the viewer SHOWS her changing it up.
    const styleName = artStyle ? artStyle.name : 'poster';
    const label = 'canvas:own:' + contributed.map(s => s.word).join('+') + ':' + styleName;
    this._lastSketchLabel = label;
    // Each subject says how its form was MADE: built from its learned skeleton
    // (with any limbs grafted from what her thought was on, and the pose she
    // gave it) — or drawn from the definition.
    const known = contributed.map(s => {
      const sk = s.schema && s.schema.skeleton;
      if (!s.schema) return `${s.word}(no schema — drawn from definition only)`;
      if (!sk) return `${s.word}(no learned build — drawn from definition)`;
      const g = sk.grafted ? `, ${sk.grafted} limb(s) grafted from ${sk.graftedFrom}` : '';
      const p = sk.posed ? `, pose ×${sk.posed.sx}/${sk.posed.sy} turn ${sk.posed.rot} build ${sk.posed.thick}` : '';
      return `${s.word}(built from ${sk.bones.length} bones${g}${p})`;
    }).join(', ');
    try { console.log(`[OwnArt] ✍ HER OWN "${contributed.map(s => s.word).join(' + ')}"${plan.place ? ' in ' + plan.place.word : ''} in ${styleName.toUpperCase()} — ${finalStrokes.length} marks (revised: ${revised.erased} erased, ${revised.deduped} deduped), attempt #${this._ownArtAttempt}. Forms: ${known}.`); } catch { /* nf */ }
    // ⛔ `schemaSubjects` exists because `subjects` DROPS `s.schema` on the way
    // out, and the invention gate in `_drawImagined` was therefore counting
    // definition-only subjects as things she "knows". That is how a scene built
    // from ONE traced shape plus two dictionary colour recipes printed
    // "★ INVENTED … drawn from what she knows of each" — the words were true of
    // `poison(1 look, 25 parts)` and false of `apple(no schema)` and
    // `cherry(no schema)`, and the caller had no way to tell them apart.
    return { rec: drawn, label, source: label, from: 'own:' + contributed.map(s => s.word).join('+'), style: styleName, plan: { subjects: contributed.map(s => s.word), schemaSubjects: contributed.filter(s => s.schema && Array.isArray(s.schema.parts) && s.schema.parts.length).map(s => s.word), place: plan.place ? plan.place.word : null } };
  },

  // DRAWCTX (ruled 2026-08-20: *"when Unity is told to 'draw' she should draw the
  // topic, thing, place, person, in context in the message from the user"*).
  //
  // The old path took `_vmContentWords(seed)[0]` — the FIRST content word — so
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
    // A FUSED idea is ONE subject — the whole phrase is the thing she imagined,
    // never split back into the separate words it came from.
    if (opts.fusedKey) {
      const fk = String(opts.fusedKey);
      const schema = await this._ownArtSchemaFor(fk, { ...opts, allowFetch: false });
      return { subjects: [{ word: fk, schema, fused: true }], place: null, body: fk };
    }
    // PLACE cue — the prepositional tail names where the thing IS, which is context,
    // not another subject ("on a gravestone", "in the woods", "at school").
    let placeWord = null;
    const pm = body.match(/\b(?:on|in|at|under|inside|beside|near|by|over|behind|against)\s+(?:a|an|the)?\s*([a-z][a-z'-]{2,})/i);
    if (pm) placeWord = pm[1].toLowerCase();
    const words = (typeof this._vmContentWords === 'function') ? this._vmContentWords(body) : body.toLowerCase().split(/\s+/);
    const seen = new Set();
    const subjects = [];
    const MAX_SUBJ = Number(process.env.DREAM_OWNART_MAX_SUBJECTS) > 0 ? Number(process.env.DREAM_OWNART_MAX_SUBJECTS) : 3;
    for (const t of words) {
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
        const s = await this._learnShapeSchema(word, e.rec, opts.fusedKey === word ? { keyOverride: word } : {});
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
      // ARTZIG2 (2026-08-21) — traceBudget: how many remembered strokes this
      // hand redraws. The tracer hands back up to 260 strokes and the tail is
      // tiny jagged edge-follow FRAGMENTS from busy references; redrawing all
      // of them buried the subject in scratch (reproduced + judged on renders:
      // the doodle was a hairball, the watercolor colored garbage over pale
      // washes; the same subject with a clean trace was legible in every
      // hand). Structural strokes always draw; the rest fill the budget
      // longest-first. Line-art hands earn bigger budgets — a doodle is LOOSE.
      // BRUSHCULL (2026-08-22, operator judged the isolated brush swatches):
      // EVERY line-texture mass is DEAD — hatch, xhatch and the rebuilt
      // crayon scribble all rendered as criss-cross scratch the moment two
      // parts' stroke fields met at different angles (and were judged bad
      // even in isolation). Pencil SURVIVES as the hand the operator kept:
      // a pure graphite LINE style (mass 'none' — trace + outline carry the
      // read on bare paper, which also stops pencil backdrops painting
      // color masses, the PAINT.8 bare-paper intent). Crayon's whole
      // identity was the scribble stroke, so it leaves the roster with its
      // brush (STYLECULL precedent: pointillism + crosshatch).
      // ⛔ ARTGROW (2026-08-25) — THESE NUMBERS WERE A CAP ON HER ABILITY AND
      // THEY ARE NOT ANY MORE. The rule: stroke counts must not be tightly
      // limited — no artwork can be made in twenty strokes, and her capacity
      // should GROW as she learns art. The old budgets (doodle 22, watercolor 40)
      // were sized as a NOISE defence — and noise is no longer what they are
      // defending against: `_traceSurvivors` gates the jagged tracer fragments
      // at the source now, for the body AND the redraw, so a high budget adds
      // real remembered contour instead of scratch. What is left for these
      // numbers to express is CHARACTER — an ink drawing is spare, a graphite
      // one is busy — never a ceiling on how much of a drawing she can make.
      // The effective budget is this × the TRAINED `budgetMul` (up to 2.5×),
      // so her commitment grows with practice like the rest of her hand.
      { name: 'poster',      mass: 'fill',     ink: 'palette',  outlineW: 0.010, outlineA: 1.0, detailMul: 1.0, scale: 1.0,  traceBudget: 200 },
      { name: 'pencil',      mass: 'none',     ink: 'graphite', outlineW: 0.004, outlineA: 0.9, detailMul: 1.6, scale: 1.0,  traceBudget: 260 },
      { name: 'ink',         mass: 'none',     ink: 'mono',     outlineW: 0.013, outlineA: 1.0, detailMul: 0.4, scale: 1.0,  traceBudget: 160 },
      { name: 'watercolor',  mass: 'wash',     ink: 'palette',  outlineW: 0.006, outlineA: 0.5, detailMul: 0.5, scale: 1.0,  traceBudget: 170 },
      { name: 'doodle',      mass: 'fill',     ink: 'palette',  outlineW: 0.006, outlineA: 1.0, detailMul: 0.7, scale: 0.55, traceBudget: 110 },
    ];
  },
  _artStylePick(rnd, subjectWords, opts = {}) {
    // `opts.painted` — a fused idea is ABOUT its colour, substance or kind
    // (a quality or a substance joined to the subject), so it is drawn in a hand
    // that paints the body at full size. Judged on renders: the line-only hands
    // left a coloured subject colourless, and the small-scale hand left one a speck.
    const styles = opts.painted
      ? this._artStyles().filter(s => s.mass !== 'none' && s.scale >= 1)
      : this._artStyles();
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
          // one field, not the ~4–10 MB entry (this runs per subject word per piece)
          const st = typeof this._vmArtStyles === 'function' ? this._vmArtStyles(String(sw).toLowerCase()) : null;
          if (st) for (const [k, n] of Object.entries(st)) learned[k] = (learned[k] | 0) + (n | 0);
        }
      }
    } catch { /* no learned taste — mood weights stand alone */ }
    // Mood weights: high arousal favors bold (ink/poster/crayon), low valence
    // favors graphite moods (pencil), dreaminess favors soft (watercolor).
    // All styles always possible — weights, not gates. (STYLECULL: the
    // pointillism/crosshatch weights below are inert since those styles left
    // the roster; kept as name checks that simply never match.)
    const w = styles.map(s => {
      let wt = 1;
      if (arousal > 0.65 && (s.name === 'ink' || s.name === 'poster')) wt += 1.2;   // BRUSHCULL — crayon left the roster
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
  // A line colour that reads on her dark page: the most saturated colour given,
  // lifted only as far as it needs to; with no colour at all, a warm neutral
  // sketch tone — never the pale white pen.
  _readableInk(colors) {
    const pal = Array.isArray(colors) ? colors.filter((c) => Array.isArray(c) && c.length >= 3) : [];
    if (!pal.length) return [168, 150, 128];
    const sat = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
    const c = pal.slice().sort((a, b) => sat(b) - sat(a))[0];
    const L = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    const t = L >= 120 ? 0 : (120 - L) / Math.max(1, 255 - L);
    return c.map((v) => Math.round(v + (255 - v) * t));
  },

  // Ink for a style: graphite = warm grays, mono = near-black, palette = the
  // learned palette (via _ownArtInk) tinted by the definition color when known.
  _artInk(style, schema, strength, rnd, defColor) {
    if (style && style.ink === 'graphite') { const g = 70 + Math.round(rnd() * 70) + Math.round(strength * 40); return [g, g, Math.min(255, g + 6)]; }
    // mono = LIGHT ink — her paper is a dark sketchbook page, so black ink is
    // invisible on it (harness-caught: 0.1% coverage). A pale gel-pen line is
    // the ink look that actually reads on her canvas.
    // ⛔ But not when she has SEEN the thing: a single pale ink over every subject
    // was judged live as "white pen traces". With a learned palette the ink is
    // the subject's most saturated colour, lifted only as far as it needs to
    // read on the dark page; the pale gel pen stays only for an unseen subject.
    if (style && style.ink === 'mono') {
      const pal = (schema && Array.isArray(schema.palette)) ? schema.palette.filter((c) => Array.isArray(c) && c.length >= 3) : [];
      // ⛔ No pale gel pen for anything, seen or not — that fallback is the
      // "white pen trace" judged live five times. Seen colours first, then the
      // definition's colour, then a warm neutral sketch tone.
      return this._readableInk(pal.length ? pal : (Array.isArray(defColor) ? [defColor] : []));
    }
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
      // TRUE COLOUR — the seen colour is painted as seen. A 25% blend of her
      // neutral base ink greyed every hue toward pastel (judged live: "everything
      // has a fog to it or is in pastels of the true colors"). Her hand still
      // varies tone through the palette pick and the per-stroke jitter.
      const k = 1.0;
      ink = [Math.round(base[0] * (1 - k) + fam[0] * k), Math.round(base[1] * (1 - k) + fam[1] * k), Math.round(base[2] * (1 - k) + fam[2] * k)];
    }
    // A definition colour only steers a subject she has NOT seen; a seen colour wins.
    if (defColor && !fam) return [Math.round(ink[0] * 0.45 + defColor[0] * 0.55), Math.round(ink[1] * 0.45 + defColor[1] * 0.55), Math.round(ink[2] * 0.45 + defColor[2] * 0.55)];
    return ink;
  },
  // Mass treatments — every one built from the same primitives.
  _artMass(out, style, cx, cy, pw, ph, ang, rgb, rnd) {
    const m = style ? style.mass : 'fill';
    if (m === 'none') return;
    if (m === 'fill') { out.push({ type: 'blob', cx, cy, rx: pw * 0.55, ry: ph * 0.55, ang, rgb }); return; }
    if (m === 'wash') {
      // 3-4 overlapping translucent blobs IN THE TRUE COLOUR — the layers build
      // the colour up where they overlap. They used to be lightened (+45) and laid
      // at 30-45% over the dark page, which read as fog (judged live).
      const n = 3 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        out.push({ type: 'blob', cx: cx + (rnd() - 0.5) * pw * 0.25, cy: cy + (rnd() - 0.5) * ph * 0.25, rx: pw * (0.45 + rnd() * 0.2), ry: ph * (0.45 + rnd() * 0.2), ang: ang + (rnd() - 0.5) * 0.4, rgb: rgb.slice(), a: 0.55 + rnd() * 0.2 });
      }
      return;
    }
    // BRUSHCULL (2026-08-22) — the hatch, xhatch AND scribble treatments are
    // DELETED with their styles: the operator judged the isolated brush
    // swatches and marked every line-texture mass bad (single-part and
    // multi-part alike — the fields criss-crossed into X-scratch wherever
    // two parts' angles met, and read as scratch even alone). The mass
    // toolkit is fill / wash / none — paint, not weave. (The 'dots'
    // treatment died earlier with pointillism, STYLECULL.)
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
    // ⛔ DRAWCOPY — the place's remembered TRACE used to be laid here, faint and
    // full-canvas, behind everything: another reference's lines pasted under the
    // subjects. Deleted. The space above (horizon, vanishing point, sky, ground,
    // floor, texture) is generated, and the place's palette still colours it.
    for (const s of out) if (!s.layer) s.layer = 'backdrop';
    return out;
  },

  // ── PAINT.10 — THE GROUNDING SHADOW. The oldest trick in drawing: a squashed
  // dark ellipse where the subject meets the ground makes it STAND THERE
  // instead of floating. Light direction varies per attempt.
  // ⛔ `_groundShadow` REMOVED (SHADOWKILL, operator judgement on the live
  // renders). It returned one `blob` at rgb(16,15,19) alpha 0.35 beneath each
  // subject. Deleted rather than left unreferenced: a dead painter primitive
  // is an invitation to switch it back on, and the reason it went is that the
  // SHAPE was wrong, not its parameters.

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

  // ── FORMBANK (2026-08-21) — FORM GENERALIZATION: pick a FORM from the
  // concept's banked variants (each a distinct pose/look), then optionally
  // RECOLOR it from another look's palette or the definition's color — form
  // from one experience, colors from another: "look at an orange cat and a
  // black cat sitting, draw a brown cat standing". Accepted pieces (ARTLEARN)
  // bump the winning variant so her best forms lead.
  _formPick(word, rnd) {
    try {
      const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
      const e = store && store.get(String(word || '').toLowerCase());
      if (!e || !e.schema) return e && e.schema;
      const bank = Array.isArray(e.schemaBank) ? e.schemaBank : [];
      const candidates = [e.schema, ...bank.filter(b => b && Array.isArray(b.parts) && b.parts.length)];
      if (candidates.length === 0) return e.schema;
      // verdict-weighted pick: an accepted variant leads without monopolizing
      const w = candidates.map(c => 1 + Math.min(3, (c.wins | 0)));
      const total = w.reduce((a, b) => a + b, 0);
      let roll = rnd() * total;
      let idx = 0;
      for (let i = 0; i < candidates.length; i++) { roll -= w[i]; if (roll <= 0) { idx = i; break; } }
      let form = candidates[idx];
      // remember which form drew this word — an ARTLEARN accept credits it
      if (!this._lastFormPick) this._lastFormPick = new Map();
      this._lastFormPick.set(String(word || '').toLowerCase(), idx);
      // COLOR RECOMBINATION — 60% the form's own colors; 25% another look's
      // palette (when one exists); 15% the definition's color when known.
      const r = rnd();
      if (r < 0.25 && candidates.length > 1) {
        const other = candidates[(idx + 1 + Math.floor(rnd() * (candidates.length - 1))) % candidates.length];
        if (other && Array.isArray(other.palette) && other.palette.length) form = this._recolorSchema(form, other.palette);
      } else if (r < 0.40) {
        const attr = (typeof this._defDrawAttributes === 'function') ? this._defDrawAttributes(word) : null;
        if (attr && attr.colors && attr.colors.length) form = this._recolorSchema(form, attr.colors);
      }
      return form;
    } catch { return null; }
  },
  // ⭐ THE FORM THIS PIECE NEEDS — chosen by her eye, not by chance. With two or
  // more looks of a thing she can make many versions of it: each look as it
  // was, and blends of the picked look with each other one at several mixes.
  // Each candidate is painted small and read by her eye (`describe`), and the
  // one closest to what she is IMAGINING right now (the newest field in her
  // imagined ring, under 2 min old) wins; when she is imagining nothing fresh,
  // the one closest to her whole idea of the thing (the mean percept of every
  // look she holds). So the door she draws is the door her mind is on — new
  // when no door she saw fits, a seen one when it does. Bounded at
  // DREAM_FORM_NEED_TRIES (6) candidates. Null = nothing to choose between.
  async _formForNeed(word, base, rnd) {
    try {
      if (!this.mindSpace || typeof this.mindSpace.sketch !== 'function' || typeof this.mindSpace.describe !== 'function') return null;
      const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
      const e = store && store.get(String(word || '').toLowerCase());
      if (!e || !e.schema) return null;
      const looks = [e.schema, ...(Array.isArray(e.schemaBank) ? e.schemaBank : [])].filter(s => s && s.skeleton && s.skeleton.mask);
      if (looks.length < 2) return null;
      const first = (base && base.skeleton && base.skeleton.mask) ? base : looks[0];
      const cos = (a, b) => { let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : -1; };
      const read = async (schema) => {
        const strokes = this._ownArtStrokesFromSchema(schema, { cx: 0.5, cy: 0.5, w: 0.72, h: 0.72 }, this._ownArtRng('need|' + word), word, this._artStyles()[0]);
        if (!strokes || !strokes.length) return null;
        const rec = await this.mindSpace.sketch(strokes, { maxSide: 128 });
        const d = rec ? await this.mindSpace.describe(rec) : null;
        return d ? Array.from(d) : null;
      };
      // what she is imagining now, else her whole idea of the thing
      let target = null, why = 'idea';
      const ring = Array.isArray(this._imaginedFieldRing) ? this._imaginedFieldRing : [];
      const fresh = ring.length ? ring[ring.length - 1] : null;
      if (fresh && fresh.rec && Date.now() - (fresh.at || 0) < 120000) {
        const d = await this.mindSpace.describe(fresh.rec);
        if (d) { target = Array.from(d); why = 'imagining'; }
      }
      const TRIES = Number(process.env.DREAM_FORM_NEED_TRIES) > 0 ? Number(process.env.DREAM_FORM_NEED_TRIES) : 6;
      // Every look she holds is a candidate — real doors she saw, each one full
      // quality. ⛔ BLENDS ARE OFF BY DEFAULT (DREAM_FORM_BLEND=1 turns them on):
      // rendered and judged 2026-11-24 on two real door looks, the 0.35 blend
      // tore into a jagged L and the 0.65 one came out blotchy with frame
      // fragments — a look's silhouette carries pieces of its surroundings, so
      // morphing two of them breaks the shape. Shown only when they hold up.
      const cands = [{ schema: first, label: 'seen' }];
      for (const o of looks) {
        if (cands.length >= TRIES) break;
        if (o !== first) cands.push({ schema: o, label: 'seen' });
      }
      if (process.env.DREAM_FORM_BLEND === '1') {
        for (const o of looks.filter(s => s !== first)) {
          for (const t of [0.35, 0.65]) {
            if (cands.length >= TRIES * 2) break;
            const bl = this._blendSkeletons(first.skeleton, o.skeleton, t);
            if (bl) cands.push({ schema: { ...first, skeleton: bl }, label: `blend ${t}` });
          }
        }
      }
      if (cands.length < 2) return null;
      const reads = [];
      for (const c of cands) reads.push(await read(c.schema));
      if (!target) {
        // her whole idea of it: the mean of what each look reads as
        const ok = reads.filter(Boolean);
        if (!ok.length) return null;
        target = ok[0].map((_, i) => ok.reduce((s, r) => s + (r[i] || 0), 0) / ok.length);
      }
      let best = -1, bi = -1;
      reads.forEach((r, i) => { if (r) { const s = cos(r, target); if (s > best) { best = s; bi = i; } } });
      if (bi < 0) return null;
      const won = cands[bi];
      this._formNeed = { word: String(word || '').toLowerCase(), chose: won.label, against: why, of: cands.length, score: +best.toFixed(4), at: Date.now() };
      if (won.label !== 'seen') this._formBlends = (this._formBlends | 0) + 1;
      return won.schema;
    } catch { return null; }
  },

  // ⭐ A NEW ONE OF A THING SHE KNOWS — not a copy of any look. Two forms she
  // has seen are blended into one she never saw: each silhouette becomes a
  // signed distance field (inside < 0), both are mapped into one frame whose
  // proportions sit between the two, and the fields are mixed at `t` — a real
  // morph of the outline, not an overlay. Every inside cell takes the colour
  // she saw at that place in BOTH looks, mixed the same way. Painted as the
  // subject on her page (no scene — a scene belongs to one look and would tear
  // around a new outline). Null when either look cannot be read or the blend
  // would be a sliver; her eye still judges the finished piece.
  _blendSkeletons(A, B, t) {
    try {
      const zlib = require('zlib');
      const unpack = (m) => { const raw = Buffer.from(m.b64, 'base64'); return m.z ? zlib.inflateSync(raw) : raw; };
      const read = (S) => {
        if (!S || !S.mask || !S.mask.b64) return null;
        const W = S.mask.w, H = S.mask.h, bits = Buffer.from(S.mask.b64, 'base64');
        const on = (x, y) => {
          x = Math.round(x); y = Math.round(y);
          if (x < 0 || y < 0 || x >= W || y >= H) return 0;
          const i = y * W + x; return (bits[i >> 3] >> (i & 7)) & 1;
        };
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) return null;
        let col = null;
        if (S.truecolor && S.truecolor.b64) {
          const tb = unpack(S.truecolor), TW = S.truecolor.w, TH = S.truecolor.h;
          if (tb.length >= TW * TH * 3) col = (gx, gy) => {
            const sx = Math.max(0, Math.min(TW - 1, Math.floor((gx + 0.5) * TW / W))), sy = Math.max(0, Math.min(TH - 1, Math.floor((gy + 0.5) * TH / H)));
            const o = (sy * TW + sx) * 3; return [tb[o], tb[o + 1], tb[o + 2]];
          };
        }
        if (!col && S.colors && S.colors.b64) {
          const idx = unpack(S.colors), CW = S.colors.w || W, CH = S.colors.h || H, pal = S.colors.palette || [];
          col = (gx, gy) => {
            const cx = Math.max(0, Math.min(CW - 1, Math.floor((gx + 0.5) * CW / W))), cy = Math.max(0, Math.min(CH - 1, Math.floor((gy + 0.5) * CH / H)));
            return pal[idx[cy * CW + cx]] || null;
          };
        }
        return col ? { W, H, on, col, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
      };
      const a = read(A), b = read(B);
      if (!a || !b) return null;
      const W = a.W, H = a.H, N = W * H;
      // the new outline's frame: A's place and size, proportions between the two
      const asp = (1 - t) * (a.h / a.w) + t * (b.h / b.w);
      let ow = Math.sqrt((a.w * a.h) / asp), oh = ow * asp;
      const fit = Math.min(1, (W - 2) / ow, (H - 2) / oh); ow *= fit; oh *= fit;
      const ox0 = Math.max(0, Math.min(W - ow, a.x0 + a.w / 2 - ow / 2)), oy0 = Math.max(0, Math.min(H - oh, a.y0 + a.h / 2 - oh / 2));
      const occA = new Uint8Array(N), occB = new Uint8Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = (x + 0.5 - ox0) / ow, v = (y + 0.5 - oy0) / oh, i = y * W + x;
        occA[i] = a.on(a.x0 + u * a.w - 0.5, a.y0 + v * a.h - 0.5);
        occB[i] = b.on(b.x0 + u * b.w - 0.5, b.y0 + v * b.h - 0.5);
      }
      // two-pass chamfer distance to the nearest cell where `want` holds
      const dist = (occ, want) => {
        const d = new Float32Array(N), INF = 1e9, D2 = Math.SQRT2;
        for (let i = 0; i < N; i++) d[i] = occ[i] === want ? 0 : INF;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x; let v = d[i];
          if (x > 0) v = Math.min(v, d[i - 1] + 1);
          if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + D2); if (x < W - 1) v = Math.min(v, d[i - W + 1] + D2); }
          d[i] = v;
        }
        for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
          const i = y * W + x; let v = d[i];
          if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
          if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + D2); if (x > 0) v = Math.min(v, d[i + W - 1] + D2); }
          d[i] = v;
        }
        return d;
      };
      const sdf = (occ) => { const dOut = dist(occ, 1), dIn = dist(occ, 0), s = new Float32Array(N); for (let i = 0; i < N; i++) s[i] = occ[i] ? -dIn[i] : dOut[i]; return s; };
      const sa = sdf(occA), sb = sdf(occB);
      const bits = new Uint8Array(Math.ceil(N / 8)), idx = new Uint8Array(N).fill(255), tc = Buffer.alloc(N * 3);
      let inside = 0, mr = 0, mg = 0, mb = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if ((1 - t) * sa[i] + t * sb[i] >= 0) continue;
        const u = (x + 0.5 - ox0) / ow, v = (y + 0.5 - oy0) / oh;
        const ax = a.x0 + u * a.w - 0.5, ay = a.y0 + v * a.h - 0.5, bx = b.x0 + u * b.w - 0.5, by = b.y0 + v * b.h - 0.5;
        const ca = a.on(ax, ay) ? a.col(Math.round(ax), Math.round(ay)) : null;
        const cb = b.on(bx, by) ? b.col(Math.round(bx), Math.round(by)) : null;
        const c = (ca && cb) ? [0, 1, 2].map(k => ca[k] * (1 - t) + cb[k] * t) : (ca || cb);
        if (!c) continue;
        bits[i >> 3] |= 1 << (i & 7); idx[i] = 0; inside++;
        tc[i * 3] = Math.round(c[0]); tc[i * 3 + 1] = Math.round(c[1]); tc[i * 3 + 2] = Math.round(c[2]);
        mr += c[0]; mg += c[1]; mb += c[2];
      }
      if (inside < 0.25 * Math.min(a.w * a.h, b.w * b.h) * 0.5) return null;   // a sliver is not a new one of it
      return {
        ...A,
        aspect: +(ow / oh).toFixed(3),
        mask: { w: W, h: H, b64: Buffer.from(bits).toString('base64') },
        colors: { palette: [[Math.round(mr / inside), Math.round(mg / inside), Math.round(mb / inside)]], w: W, h: H, z: 1, b64: zlib.deflateSync(Buffer.from(idx)).toString('base64') },
        truecolor: { w: W, h: H, z: 1, b64: zlib.deflateSync(tc).toString('base64') },
        scene: null,
        blended: { t: +t.toFixed(2) },
      };
    } catch { return null; }
  },

  // Recolor a form with a new palette, PRESERVING its light/dark structure:
  // every part/stroke color maps to the palette entry closest in LUMINANCE,
  // so the form's shading survives while the hues become the new source's —
  // the equational version of "same cat, different coat".
  _recolorSchema(form, palette) {
    if (!form || !Array.isArray(palette) || !palette.length) return form;
    const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    const nearest = (c) => {
      let best = palette[0], bd = Infinity;
      for (const p of palette) { const d = Math.abs(lum(p) - lum(c)); if (d < bd) { bd = d; best = p; } }
      return [best[0], best[1], best[2]];
    };
    const out = { ...form, palette: palette.map(p => [p[0], p[1], p[2]]) };
    if (Array.isArray(form.parts)) out.parts = form.parts.map(p => Array.isArray(p.rgb) ? { ...p, rgb: nearest(p.rgb) } : { ...p });
    if (Array.isArray(form.traceRgb)) out.traceRgb = form.traceRgb.map(c => Array.isArray(c) ? nearest(c) : c);
    return out;
  },

  // ── SHE BUILDS WHAT SHE DRAWS; SHE DOES NOT REDRAW WHAT SHE SAW ────────────
  // Measured: every finished piece used to BE the banked trace of one
  // reference, redrawn stroke for stroke, and a scene was several such traces
  // over another reference's trace. Two replacements were tried and judged on
  // renders before this one: fusing her field with others' (a double
  // exposure) and building masses from the schema's part grid (a scatter of
  // ovals — the grid is a layout, not a body). What stands is the SKELETON
  // below: she learns how a thing is built, and constructs it in her own pose.

  // Bring a field to an exact W×H — reconstruct, resample, perceive again — so
  // her eye can change one picture into the next across different aspects.
  async _fieldAt(rec, W, H) {
    if (!rec || !this.mindSpace) return null;
    if (rec.width === W && rec.height === H) return rec;
    const img = await this.mindSpace.imagine(rec, 0);
    if (!img || !img.data || !img.width) return null;
    const sw = img.width, sh = img.height, src = img.data;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      const sy = Math.min(sh - 1, Math.floor((y + 0.5) * sh / H));
      for (let x = 0; x < W; x++) {
        const sx = Math.min(sw - 1, Math.floor((x + 0.5) * sw / W));
        const o = (y * W + x) * 4, s = (sy * sw + sx) * 4;
        data[o] = src[s]; data[o + 1] = src[s + 1]; data[o + 2] = src[s + 2]; data[o + 3] = 255;
      }
    }
    return await this.mindSpace.perceive({ width: W, height: H, data });
  },

  // ── THE BUILD OF A THING: ITS SKELETON ─────────────────────────────────────
  // What a person keeps after looking at a body is how it is BUILT: where the
  // limbs run and how thick each one is. This reads that off a reconstructed
  // field: the subject's mask (pixels that are not the backdrop), the distance
  // from every inside pixel to the edge, the mask thinned to one-pixel
  // centrelines, and those centrelines walked into BONES — polylines whose
  // every point carries the body's half-width there. Normalised to [0,1].
  _learnSkeleton(img) {
    if (!img || !img.data || !img.width) return null;
    const SW = img.width, SH = img.height, D = img.data;
    // 160 cells across: fine enough that a thin part (a chair leg) spans
    // several cells and survives the opening that strips 1-px backdrop lines
    // (judged on a render: at 96 the chair lost its legs).
    const G = 160, gw = SW >= SH ? G : Math.max(16, Math.round(G * SW / SH)), gh = SW >= SH ? Math.max(16, Math.round(G * SH / SW)) : G;
    const px = (gx, gy) => { const x = Math.min(SW - 1, Math.floor((gx + 0.5) * SW / gw)), y = Math.min(SH - 1, Math.floor((gy + 0.5) * SH / gh)); const o = (y * SW + x) * 4; return [D[o], D[o + 1], D[o + 2]]; };
    // ── THE SUBJECT, NOT "EVERYTHING THAT ISN'T ONE BACKDROP COLOUR" ──────────
    // Measured on her real looks: a single border median grabbed half of every
    // scene (a field, a sky, a plate) and the skeleton of that was 78–134
    // fragments. The backdrop is modelled instead as the COLOURS OF THE BORDER
    // — the ring just inside the frame (the reconstruction pads the outermost
    // pixels), clustered — and a pixel is backdrop when it is as close to one of
    // those colours as the border pixels themselves are (mean + 2 sd of their
    // own distances: the border's measured spread, not a number of mine).
    let ring = [];
    const ringSide = [];   // 0 top, 1 bottom, 2 left, 3 right (the nearest side)
    for (let y = 2; y < gh - 2; y++) for (let x = 2; x < gw - 2; x++) {
      if (x <= 4 || y <= 4 || x >= gw - 5 || y >= gh - 5) {
        ring.push(px(x, y));
        const dt = y, db = gh - 1 - y, dl = x, dr = gw - 1 - x, m = Math.min(dt, db, dl, dr);
        ringSide.push(m === dt ? 0 : m === db ? 1 : m === dl ? 2 : 3);
      }
    }
    const K = 6;
    let cent = Array.from({ length: K }, (_, k) => ring[Math.floor((k + 0.5) * ring.length / K)].slice());
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    // ⛔ TRUE HUES, NOT AVERAGES. A k-means centre is the MEAN of its members,
    // and a mean of several shades is greyer and paler than any of them — the
    // "pastel, foggy, grey-toned, not the right hues" judged live. Each centre
    // keeps its mean hue and lightness but gets back its members' average
    // chroma (how far a colour sits from grey), and the cluster count is
    // doubled (subject 12, scene 16) so fewer different colours are blended.
    const trueHue = (cents, members) => cents.map((c, k) => {
      const m = members[k];
      if (!m || !m.n) return c;
      const chr = (v) => Math.max(v[0], v[1], v[2]) - Math.min(v[0], v[1], v[2]);
      const want = m.chroma / m.n, have = chr(c);
      if (!(have > 0.5) || !(want > have)) return c;
      const L = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      const s = want / have;
      return c.map((v) => Math.max(0, Math.min(255, L + (v - L) * s)));
    });
    const kmeansTrue = (pixels, K) => {
      let cen = Array.from({ length: K }, (_, k) => pixels[Math.floor((k + 0.5) * pixels.length / K)].slice());
      let mem = null;
      for (let it = 0; it < 8; it++) {
        const sum = cen.map(() => [0, 0, 0, 0, 0]);
        for (const c of pixels) { let bi = 0, bd = Infinity; for (let k = 0; k < K; k++) { const d = d2(c, cen[k]); if (d < bd) { bd = d; bi = k; } } const s = sum[bi]; s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3]++; s[4] += Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]); }
        cen = cen.map((c, k) => sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c);
        mem = sum.map((s) => ({ n: s[3], chroma: s[4] }));
      }
      return trueHue(cen, mem);
    };
    const ringOwner = new Uint8Array(ring.length);
    for (let it = 0; it < 10; it++) {
      const sum = cent.map(() => [0, 0, 0, 0]);
      for (let r = 0; r < ring.length; r++) { const c = ring[r]; let bi = 0, bd = Infinity; for (let k = 0; k < K; k++) { const d = d2(c, cent[k]); if (d < bd) { bd = d; bi = k; } } ringOwner[r] = bi; const s = sum[bi]; s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3]++; }
      cent = cent.map((c, k) => sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c);
    }
    // ⛔ A BACKDROP SURROUNDS THE PICTURE; A SUBJECT CROSSING THE FRAME DOES
    // NOT. Judged on a render: a dark subject big enough to run off the left
    // and bottom put its own colour into the border, the border model learned
    // that colour as backdrop, and the subject was erased to a sliver (4,883 of
    // 25,600 cells survived, of a subject filling half the frame). A border colour counts as
    // backdrop only when its COLOUR FAMILY is present on at least THREE of the
    // four sides. ⚠ Families, not single colours: a gradient backdrop splits
    // into several shades, each on only one or two sides (measured), so judged
    // one at a time none of them qualified. The border colours are linked by
    // their nearest neighbours (a minimum spanning tree) and cut at the ONE
    // largest gap — the shades of a gradient stay one family, the colour of a
    // subject or a stand crossing the frame falls on the other side of the cut. "Present" on a side
    // = at least half the family's even share of that side's band.
    {
      const sideTot = [0, 0, 0, 0], per = Array.from({ length: K }, () => [0, 0, 0, 0]);
      for (let r = 0; r < ring.length; r++) { sideTot[ringSide[r]]++; per[ringOwner[r]][ringSide[r]]++; }
      // MST over the K colours (Prim), then cut its longest edge
      const inT = [0], edges = [];
      while (inT.length < K) {
        let ba = -1, bb = -1, bd = Infinity;
        for (const a of inT) for (let b = 0; b < K; b++) { if (inT.includes(b)) continue; const d = d2(cent[a], cent[b]); if (d < bd) { bd = d; ba = a; bb = b; } }
        if (bb < 0) break;
        inT.push(bb); edges.push([ba, bb, bd]);
      }
      let cutAt = -1, cutD = -1;
      for (let e = 0; e < edges.length; e++) if (edges[e][2] > cutD) { cutD = edges[e][2]; cutAt = e; }
      const fam = new Int8Array(K).fill(-1);
      const adj = Array.from({ length: K }, () => []);
      edges.forEach(([a, b], e) => { if (e !== cutAt) { adj[a].push(b); adj[b].push(a); } });
      let nf = 0;
      for (let k = 0; k < K; k++) { if (fam[k] >= 0) continue; const q = [k]; fam[k] = nf; while (q.length) { const a = q.pop(); for (const b of adj[a]) if (fam[b] < 0) { fam[b] = nf; q.push(b); } } nf++; }
      const keep = [];
      const famSides = [];
      for (let f = 0; f < nf; f++) {
        const members = [...Array(K).keys()].filter(k => fam[k] === f);
        let sides = 0;
        for (let s = 0; s < 4; s++) { let c = 0; for (const k of members) c += per[k][s]; if (sideTot[s] && c >= sideTot[s] * members.length / (2 * K)) sides++; }
        famSides.push(sides);
        if (sides >= 3) keep.push(...members);
      }
      if (keep.length && keep.length < K) {
        const ks = new Set(keep);
        ring = ring.filter((_, r) => ks.has(ringOwner[r]));
        cent = keep.map(k => cent[k]);
      }
    }
    const nearest = (c) => { let bd = Infinity; for (const k of cent) bd = Math.min(bd, d2(c, k)); return Math.sqrt(bd); };
    const rd = ring.map(nearest);
    const mu = rd.reduce((a, b) => a + b, 0) / rd.length;
    const sd = Math.sqrt(rd.reduce((a, b) => a + (b - mu) ** 2, 0) / rd.length);
    const tol = mu + 2 * sd;
    // A CAST SHADOW is the backdrop's own colour, only darker, and smooth: its
    // hue matches a border cluster (chromaticity within the border's own
    // spread), it is darker than that cluster, and its 3x3 neighbourhood has
    // no more texture than the border itself does. Textured subjects (an
    // elephant's skin) keep their pixels; the soft grey smear under them does
    // not. Judged on a render: floor shadows rode along under elephant and bear.
    const lumOf = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    const chroma = (c) => { const s = c[0] + c[1] + c[2] + 1e-6; return [c[0] / s, c[1] / s]; };
    const cc = cent.map(chroma), cl = cent.map(lumOf);
    const chromaDist = (c) => { const q = chroma(c); let bd = Infinity, bk = 0; for (let k = 0; k < cc.length; k++) { const d = Math.hypot(q[0] - cc[k][0], q[1] - cc[k][1]); if (d < bd) { bd = d; bk = k; } } return [bd, bk]; };
    const rcd = ring.map(c => chromaDist(c)[0]);
    const cmu = rcd.reduce((a, b) => a + b, 0) / rcd.length;
    const csd = Math.sqrt(rcd.reduce((a, b) => a + (b - cmu) ** 2, 0) / rcd.length);
    const ctol = cmu + 2 * csd;
    const localStd = (x, y) => { let s = 0, s2 = 0, n2 = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = Math.max(0, Math.min(gw - 1, x + dx)), Y = Math.max(0, Math.min(gh - 1, y + dy)); const l = lumOf(px(X, Y)); s += l; s2 += l * l; n2++; } const m = s / n2; return Math.sqrt(Math.max(0, s2 / n2 - m * m)); };
    const ringTex = [];   // the border's own texture, sampled
    // only where the border IS backdrop — a subject crossing the frame must not
    // lend the backdrop its texture either
    for (let y = 2; y < gh - 2; y += 3) for (let x = 2; x < gw - 2; x += 3) if ((x <= 4 || y <= 4 || x >= gw - 5 || y >= gh - 5) && nearest(px(x, y)) <= tol) ringTex.push(localStd(x, y));
    const tmu = ringTex.reduce((a, b) => a + b, 0) / Math.max(1, ringTex.length);
    const tsd = Math.sqrt(ringTex.reduce((a, b) => a + (b - tmu) ** 2, 0) / Math.max(1, ringTex.length));
    const ttol = tmu + 2 * tsd;
    let M = new Uint8Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const c = px(x, y);
      // backdrop = the border's colour AND its smoothness. Colour alone made
      // a dark, textured subject on a dark vignette into backdrop (judged: the
      // subject came out as scraps); a subject's surface is textured, a studio
      // backdrop is not.
      if (nearest(c) <= tol && localStd(x, y) <= ttol) continue;
      const [cd, ck] = chromaDist(c);
      if (cd <= ctol && lumOf(c) < cl[ck] && localStd(x, y) <= ttol) continue;   // its shadow
      M[y * gw + x] = 1;
    }
    // close small gaps (dilate then erode, 1 px), so one body is one region
    const morph = (src, grow) => { const o = new Uint8Array(src.length); for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { let v = grow ? 0 : 1; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; const s = (X >= 0 && Y >= 0 && X < gw && Y < gh) ? src[Y * gw + X] : 0; if (grow) v |= s; else v &= s; } o[y * gw + x] = v; } return o; };
    M = morph(morph(M, true), false);
    const Mclosed = M.slice();   // before the opening — thin parts still in it
    // ...then OPEN (erode then dilate, 1 px): thin structures — a backdrop
    // stand, a horizon line, a table edge — are a pixel or two wide and do not
    // survive it, while a body does. Judged on a render: the elephant's mask
    // carried the studio frame round it until this.
    M = morph(morph(M, false), true);
    // The subject is the region the look is ABOUT: large, and in the middle of
    // the frame — a reference is composed around its subject, while scenery
    // (a fence, a horizon, a table edge) runs off to the sides. Each connected
    // region scores its area weighted by how central its pixels are.
    const lab = new Int32Array(gw * gh).fill(-1);
    let best = -1, bestS = 0;
    const regionScore = new Map();
    const cxF = (gw - 1) / 2, cyF = (gh - 1) / 2, rMax = Math.hypot(cxF, cyF);
    for (let i0 = 0; i0 < M.length; i0++) {
      if (!M[i0] || lab[i0] >= 0) continue;
      const q = [i0]; lab[i0] = i0; let s = 0;
      while (q.length) { const i = q.pop(); const x = i % gw, y = (i / gw) | 0; s += 1 - Math.hypot(x - cxF, y - cyF) / rMax; for (const [X, Y] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue; const j = Y * gw + X; if (M[j] && lab[j] < 0) { lab[j] = i0; q.push(j); } } }
      regionScore.set(i0, s);
      if (s > bestS) { bestS = s; best = i0; }
    }
    if (best < 0) return null;
    // Backdrop NOT reachable from the frame edge without crossing region `r` —
    // what `r` encloses.
    const enclosedBy = (r) => {
      const reach = new Uint8Array(gw * gh);
      const fq = [];
      for (let x = 0; x < gw; x++) { fq.push(x, (gh - 1) * gw + x); }
      for (let y = 0; y < gh; y++) { fq.push(y * gw, y * gw + gw - 1); }
      while (fq.length) { const i = fq.pop(); if (reach[i] || lab[i] === r) continue; reach[i] = 1; const x = i % gw, y = (i / gw) | 0; if (x > 0) fq.push(i - 1); if (x < gw - 1) fq.push(i + 1); if (y > 0) fq.push(i - gw); if (y < gh - 1) fq.push(i + gw); }
      return reach;
    };
    // ⛔ A FRAME AROUND A THING IS NOT THE THING. Judged on a render: the
    // subject was painted inside a round frame — the frame's rim won the region
    // score, the hole-fill below swallowed the whole frame, she learned a disc
    // and drew an oval. A region that surrounds another whole object is a frame
    // (a plate, a hoop, a window): the subject is the best region INSIDE it.
    // ⚠ The test is that it surrounds ANOTHER WHOLE OBJECT — a separate region
    // standing inside it, cut off by backdrop. A body never does that: an eye
    // or a marking is not backdrop-coloured, so it joins the body's region. An
    // area comparison was tried first and missed a wide ring round the subject
    // (judged on a render: the ring out-weighed what it held).
    for (let hop = 0; hop < 3; hop++) {
      const reach = enclosedBy(best);
      const inner = new Map();
      const innerArea = new Map();
      for (let i = 0; i < M.length; i++) {
        if (lab[i] === best || reach[i] || lab[i] < 0) continue;
        inner.set(lab[i], regionScore.get(lab[i]) || 0);
        innerArea.set(lab[i], (innerArea.get(lab[i]) || 0) + 1);
      }
      // 20 cells — the same floor this function already uses for "a subject at all".
      for (const [r, a] of innerArea) if (a < 20) inner.delete(r);
      if (inner.size === 0) break;
      let nb2 = -1, ns = 0;
      for (const [r, s] of inner) if (s > ns) { ns = s; nb2 = r; }
      if (nb2 < 0) break;
      best = nb2;
    }
    for (let i = 0; i < M.length; i++) M[i] = lab[i] === best ? 1 : 0;
    // "At the frame" = inside the border band the backdrop model reads (the
    // reconstruction pads the outermost cells, so a stand ending there never
    // touches the literal last row — measured: a stand stopped three short).
    const onEdge = (i) => { const x = i % gw, y = (i / gw) | 0; return x <= 4 || y <= 4 || x >= gw - 5 || y >= gh - 5; };
    const N4 = (i) => { const x = i % gw, y = (i / gw) | 0, r = []; if (x > 0) r.push(i - 1); if (x < gw - 1) r.push(i + 1); if (y > 0) r.push(i - gw); if (y < gh - 1) r.push(i + gw); return r; };
    // ⛔ WHAT IT STANDS ON IS NOT IT. Judged on renders: a subject on a stand
    // or a base — the stand is joined to the subject, so the subject came out
    // with a block or a strip under it. A stand runs OFF the frame;
    // the subject is composed inside it. When the region reaches the frame
    // edge, it is shrunk until it falls apart at its narrowest joint; every
    // cell is then given to the nearest surviving piece (a race outward from
    // all of them at once — the joint is where they meet), and the pieces
    // that stay inside the frame are kept when they hold more of the body than
    // the pieces that run off it. A subject that IS the thing touching the
    // edge (one big animal cropped by the frame) does not fall apart, or its
    // inside part is the smaller, and stays whole.
    if ([...Array(M.length).keys()].some(i => M[i] && onEdge(i))) {
      let core = M.slice();
      let pieces = null;
      for (let k = 0; k < 40; k++) {
        const er = new Uint8Array(M.length);
        let any = 0;
        for (let i = 0; i < M.length; i++) if (core[i] && N4(i).length === 4 && N4(i).every(j => core[j])) { er[i] = 1; any++; }
        if (!any) break;
        core = er;
        // label the shrunk pieces
        const pl = new Int32Array(M.length).fill(-1);
        const info = [];
        for (let i0 = 0; i0 < M.length; i0++) {
          if (!core[i0] || pl[i0] >= 0) continue;
          const id = info.length, q = [i0]; pl[i0] = id; let edge = false, sz = 0;
          while (q.length) { const i = q.pop(); sz++; for (const j of N4(i)) if (core[j] && pl[j] < 0) { pl[j] = id; q.push(j); } }
          info.push({ edge, sz });
        }
        if (info.length >= 2) { pieces = { pl, info }; break; }
      }
      if (pieces) {
        // grow every piece back through the body at once
        const own = pieces.pl.slice();
        let front = [];
        for (let i = 0; i < M.length; i++) if (own[i] >= 0) front.push(i);
        while (front.length) { const nx = []; for (const i of front) for (const j of N4(i)) if (M[j] && own[j] < 0) { own[j] = own[i]; nx.push(j); } front = nx; }
        const touches = new Set(), size = new Map();
        for (let i = 0; i < M.length; i++) { if (own[i] < 0) continue; size.set(own[i], (size.get(own[i]) || 0) + 1); if (onEdge(i)) touches.add(own[i]); }
        // A piece running off the frame is a STAND when its colour is not the
        // subject's: measured against the subject piece's mean colour with the
        // same tolerance the backdrop test uses (the border's own spread). A
        // cropped body is the colour of the rest of it and stays. (Size was
        // tried first: a stand can be bigger than the subject on it, and it stayed.)
        // The SUBJECT piece is chosen the way the region was: area weighted by
        // how central it is. (A subject whose tail reaches the frame band still
        // wins over the stand under it — judged: measuring "inside vs off the
        // frame" alone threw the subject away with the stand.)
        const meanOf = new Map(), cScore = new Map();
        for (let i = 0; i < M.length; i++) {
          if (own[i] < 0) continue;
          const x = i % gw, y = (i / gw) | 0, c = px(x, y);
          const m = meanOf.get(own[i]) || [0, 0, 0, 0]; m[0] += c[0]; m[1] += c[1]; m[2] += c[2]; m[3]++; meanOf.set(own[i], m);
          cScore.set(own[i], (cScore.get(own[i]) || 0) + 1 - Math.hypot(x - cxF, y - cyF) / rMax);
        }
        let subj = -1, sBest = -1;
        for (const [id, s] of cScore) if (s > sBest) { sBest = s; subj = id; }
        const sm = meanOf.get(subj);
        if (sm) {
          const sc0 = [sm[0] / sm[3], sm[1] / sm[3], sm[2] / sm[3]];
          const drop = new Set();
          for (const id of touches) {
            if (id === subj) continue;
            const m = meanOf.get(id);
            if (m && Math.sqrt(d2([m[0] / m[3], m[1] / m[3], m[2] / m[3]], sc0)) > tol) drop.add(id);
          }
          if (drop.size) for (let i = 0; i < M.length; i++) if (M[i] && (own[i] < 0 || drop.has(own[i]))) M[i] = 0;
        }
      }
    }
    // ⛔ THIN PARTS COME BACK. The opening above strips 1-2 cell backdrop lines
    // — and with them every leg, ear, tail and beak (judged: everything looked
    // slightly melted). What the opening removed is given back where it is
    // JOINED to the body, except a run that leaves through the frame edge,
    // which is a backdrop line or a stand, not a limb.
    {
      const got = new Uint8Array(M.length);
      let front = [];
      for (let i = 0; i < M.length; i++) if (M[i]) front.push(i);
      while (front.length) { const nx = []; for (const i of front) for (const j of N4(i)) if (Mclosed[j] && !M[j] && !got[j]) { got[j] = 1; nx.push(j); } front = nx; }
      const seenG = new Uint8Array(M.length);
      for (let i0 = 0; i0 < M.length; i0++) {
        if (!got[i0] || seenG[i0]) continue;
        const comp = [], q = [i0]; seenG[i0] = 1; let leaves = false;
        while (q.length) { const i = q.pop(); comp.push(i); if (onEdge(i)) leaves = true; for (const j of N4(i)) if (got[j] && !seenG[j]) { seenG[j] = 1; q.push(j); } }
        if (!leaves) for (const i of comp) M[i] = 1;
      }
    }
    // Fill its holes — a pale belly, a window in a body — but only a hole
    // SMALLER than the body round it. A larger enclosed space is a gap the
    // thing surrounds (the inside of a ring, the space between a handle and
    // its cup), not part of its mass.
    let inCount = 0;
    {
      const outside = new Uint8Array(gw * gh);
      const fq = [];
      for (let x = 0; x < gw; x++) { fq.push(x, (gh - 1) * gw + x); }
      for (let y = 0; y < gh; y++) { fq.push(y * gw, y * gw + gw - 1); }
      while (fq.length) { const i = fq.pop(); if (outside[i] || M[i]) continue; outside[i] = 1; const x = i % gw, y = (i / gw) | 0; if (x > 0) fq.push(i - 1); if (x < gw - 1) fq.push(i + 1); if (y > 0) fq.push(i - gw); if (y < gh - 1) fq.push(i + gw); }
      let body = 0;
      for (let i = 0; i < M.length; i++) if (M[i]) body++;
      const seenHole = new Uint8Array(gw * gh);
      for (let i0 = 0; i0 < M.length; i0++) {
        if (M[i0] || outside[i0] || seenHole[i0]) continue;
        const comp = [], q = [i0]; seenHole[i0] = 1;
        while (q.length) { const i = q.pop(); comp.push(i); const x = i % gw, y = (i / gw) | 0; for (const j of [x > 0 ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, y > 0 ? i - gw : -1, y < gh - 1 ? i + gw : -1]) { if (j >= 0 && !M[j] && !outside[j] && !seenHole[j]) { seenHole[j] = 1; q.push(j); } } }
        if (comp.length < body) for (const i of comp) M[i] = 1;
      }
      for (let i = 0; i < M.length; i++) if (M[i]) inCount++;
    }
    // A "subject" that fills the frame is the scene itself — the look held no
    // one thing to draw. This is the evidence `skeleton: null` records.
    let touches = 0;
    if ([...Array(gw).keys()].some(x => M[x])) touches++;
    if ([...Array(gw).keys()].some(x => M[(gh - 1) * gw + x])) touches++;
    if ([...Array(gh).keys()].some(y => M[y * gw])) touches++;
    if ([...Array(gh).keys()].some(y => M[y * gw + gw - 1])) touches++;
    if (inCount < 20 || touches === 4) return null;
    const bg = cent[0].map(v => Math.round(v));
    // distance to the edge (two-pass chamfer)
    const DT = new Float32Array(gw * gh);
    for (let i = 0; i < DT.length; i++) DT[i] = M[i] ? 1e6 : 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; if (!M[i]) continue; if (x > 0) DT[i] = Math.min(DT[i], DT[i - 1] + 1); if (y > 0) DT[i] = Math.min(DT[i], DT[i - gw] + 1); if (x > 0 && y > 0) DT[i] = Math.min(DT[i], DT[i - gw - 1] + 1.414); if (x < gw - 1 && y > 0) DT[i] = Math.min(DT[i], DT[i - gw + 1] + 1.414); if (x === 0 || y === 0) DT[i] = Math.min(DT[i], 1); }
    for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) { const i = y * gw + x; if (!M[i]) continue; if (x < gw - 1) DT[i] = Math.min(DT[i], DT[i + 1] + 1); if (y < gh - 1) DT[i] = Math.min(DT[i], DT[i + gw] + 1); if (x < gw - 1 && y < gh - 1) DT[i] = Math.min(DT[i], DT[i + gw + 1] + 1.414); if (x > 0 && y < gh - 1) DT[i] = Math.min(DT[i], DT[i + gw - 1] + 1.414); if (x === gw - 1 || y === gh - 1) DT[i] = Math.min(DT[i], 1); }
    // thin to centrelines (Zhang-Suen)
    const S = M.slice();
    const at = (x, y) => (x >= 0 && y >= 0 && x < gw && y < gh) ? S[y * gw + x] : 0;
    for (let changed = true, guard = 0; changed && guard < 200; guard++) {
      changed = false;
      for (let pass = 0; pass < 2; pass++) {
        const kill = [];
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
          if (!S[y * gw + x]) continue;
          const n = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const B = n.reduce((a, b) => a + b, 0);
          if (B < 2 || B > 6) continue;
          let A = 0; for (let k = 0; k < 8; k++) if (!n[k] && n[(k + 1) % 8]) A++;
          if (A !== 1) continue;
          if (pass === 0 ? (n[0] * n[2] * n[4] || n[2] * n[4] * n[6]) : (n[0] * n[2] * n[6] || n[0] * n[4] * n[6])) continue;
          kill.push(y * gw + x);
        }
        for (const i of kill) S[i] = 0;
        if (kill.length) changed = true;
      }
    }
    // walk the centrelines into bones, splitting at junctions
    const nb = (i) => { const x = i % gw, y = (i / gw) | 0, r = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < gw && Y < gh && S[Y * gw + X]) r.push(Y * gw + X); } return r; };
    const deg = new Uint8Array(gw * gh);
    for (let i = 0; i < S.length; i++) if (S[i]) deg[i] = nb(i).length;
    const used = new Set();
    const key = (a, b) => a < b ? a + ':' + b : b + ':' + a;
    const bones = [];
    const starts = [];
    for (let i = 0; i < S.length; i++) if (S[i] && deg[i] !== 2) starts.push(i);
    for (let i = 0; i < S.length; i++) if (S[i] && deg[i] === 2) starts.push(i);   // closed loops last
    for (const s of starts) {
      for (const f of nb(s)) {
        if (used.has(key(s, f))) continue;
        const path = [s];
        let prev = s, cur = f;
        used.add(key(s, f));
        while (true) {
          path.push(cur);
          if (deg[cur] !== 2) break;
          const nx = nb(cur).find(q => q !== prev && !used.has(key(cur, q)));
          if (nx === undefined) break;
          used.add(key(cur, nx)); prev = cur; cur = nx;
        }
        if (path.length >= 3) bones.push(path);
      }
    }
    if (!bones.length) return null;
    // SPUR PRUNING — the standard skeleton clean-up. A branch with a FREE end
    // that is shorter than the body is thick where it joins lies inside the
    // body: it is a wobble of the outline, not a limb. Removed, and repeated
    // while it keeps finding spurs (pruning one exposes the next).
    for (let pass = 0; pass < 6; pass++) {
      const endDeg = new Map();
      for (const b of bones) for (const e of [b[0], b[b.length - 1]]) endDeg.set(e, (endDeg.get(e) || 0) + 1);
      const keep = [];
      let dropped = 0;
      for (const b of bones) {
        const a = b[0], z = b[b.length - 1];
        const aFree = endDeg.get(a) === 1 && deg[a] <= 1, zFree = endDeg.get(z) === 1 && deg[z] <= 1;
        if (aFree !== zFree && bones.length > 1) {
          const joint = aFree ? z : a;
          if (b.length < DT[joint] * 1.5) { dropped++; continue; }
        }
        keep.push(b);
      }
      bones.length = 0; bones.push(...keep);
      if (!dropped) break;
    }
    // sample a colour along each bone; normalise; drop specks
    const out = [];
    let maxR = 0;
    for (const b of bones) for (const i of b) maxR = Math.max(maxR, DT[i]);
    for (const b of bones) {
      const step = Math.max(1, Math.floor(b.length / 24));
      const pts = [];
      let r = 0, g = 0, bl = 0;
      for (let k = 0; k < b.length; k += step) {
        const i = b[k], x = i % gw, y = (i / gw) | 0;
        pts.push([+((x + 0.5) / gw).toFixed(4), +((y + 0.5) / gh).toFixed(4), +(DT[i] / Math.max(gw, gh)).toFixed(4)]);
        const c = px(x, y); r += c[0]; g += c[1]; bl += c[2];
      }
      const last = b[b.length - 1];
      pts.push([+(((last % gw) + 0.5) / gw).toFixed(4), +((((last / gw) | 0) + 0.5) / gh).toFixed(4), +(DT[last] / Math.max(gw, gh)).toFixed(4)]);
      const n = Math.ceil(b.length / step);
      if (b.length < 4 && Math.max(...b.map(i => DT[i])) < maxR * 0.3) continue;
      out.push({ pts, rgb: [Math.round(r / n), Math.round(g / n), Math.round(bl / n)] });
    }
    // The subject's MASK travels with the skeleton (1 bit per cell, base64):
    // it is what her eye compares a finished drawing's shape against.
    const bits = new Uint8Array(Math.ceil(M.length / 8));
    for (let i = 0; i < M.length; i++) if (M[i]) bits[i >> 3] |= 1 << (i & 7);
    // WHERE ITS COLOURS SIT — the subject's pixels clustered into a few colours
    // (k-means, k = 6), and which colour each cell of the body is. What
    // recognition rides on is the silhouette and the layout of its colours,
    // and this is that, learned from the look — not its photographic lines.
    const subj = [];
    for (let i = 0; i < M.length; i++) if (M[i]) subj.push(px(i % gw, (i / gw) | 0));
    const PK = Math.min(12, subj.length);
    const pal = kmeansTrue(subj, PK);
    // ⛔ THE COLOUR LAYOUT IS KEPT AT 3x THE SHAPE GRID. At 160 cells across a
    // 1,024-px canvas every learned cell covered ~6 px and the painting read as
    // fog (judged on renders: too soft to read detail). The shape
    // work stays on the 160 grid (its thresholds are in those cells); WHERE
    // THE COLOURS SIT is kept at 480, deflate-compressed — a few-colour index
    // map compresses ~10x, so her memory does not balloon. The subject's edge
    // at the finer grid follows the 160 mask bilinearly, so it is smooth, not
    // a 3-cell staircase. 255 = not the subject.
    const R = 3, HW = gw * R, HH = gh * R;
    const pxH = (hx, hy) => { const x = Math.min(SW - 1, Math.floor((hx + 0.5) * SW / HW)), y = Math.min(SH - 1, Math.floor((hy + 0.5) * SH / HH)); const o = (y * SW + x) * 4; return [D[o], D[o + 1], D[o + 2]]; };
    const mAt = (x, y) => (x >= 0 && y >= 0 && x < gw && y < gh && M[y * gw + x]) ? 1 : 0;
    const inSubj = (hx, hy) => {
      const gx = (hx + 0.5) / R - 0.5, gy = (hy + 0.5) / R - 0.5;
      const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      return ((mAt(x0, y0) * (1 - fx) + mAt(x0 + 1, y0) * fx) * (1 - fy) + (mAt(x0, y0 + 1) * (1 - fx) + mAt(x0 + 1, y0 + 1) * fx) * fy) >= 0.5;
    };
    const idx = new Uint8Array(HW * HH).fill(255);
    for (let hy = 0; hy < HH; hy++) for (let hx = 0; hx < HW; hx++) {
      if (!inSubj(hx, hy)) continue;
      const c = pxH(hx, hy);
      let bi = 0, bd = Infinity; for (let k = 0; k < PK; k++) { const d = d2(c, pal[k]); if (d < bd) { bd = d; bi = k; } }
      idx[hy * HW + hx] = bi;
    }
    const zlib = require('zlib');
    // THE WHOLE PICTURE'S COLOUR LAYOUT — the same abstraction for everything
    // around the subject (backdrop, ground, what it stands on, its shadow), so
    // she can paint the scene she imagined instead of cutting the thing out of
    // it. Cutting was judged to wreck every drawing: torn-off shadows floating
    // as clouds, half-kept ledges and posts, bodies chopped where the cut went
    // wrong. k = 8 over the whole frame.
    const all = [];
    for (let i = 0; i < M.length; i++) if (!M[i]) all.push(px(i % gw, (i / gw) | 0));
    let scene = null;
    if (all.length >= 8) {
      const SK = Math.min(16, all.length);
      const sp = kmeansTrue(all, SK);
      const sidx = new Uint8Array(HW * HH);
      for (let hy = 0; hy < HH; hy++) for (let hx = 0; hx < HW; hx++) {
        const c = pxH(hx, hy);
        let bi = 0, bd = Infinity; for (let k = 0; k < SK; k++) { const d = d2(c, sp[k]); if (d < bd) { bd = d; bi = k; } }
        sidx[hy * HW + hx] = bi;
      }
      scene = { palette: sp.map(c => c.map(v => Math.round(v))), w: HW, h: HH, z: 1, b64: zlib.deflateSync(Buffer.from(sidx)).toString('base64') };
    }
    // ⭐ THE COLOURS SHE ACTUALLY SAW, everywhere in the picture, at the shape
    // grid. The few-colour palettes above snap every smooth shadow and gradient
    // into flat bands ("like a Looney Tunes closing scene" — judged live); with
    // the real colour per cell, painted back with smooth interpolation, a
    // shadow stays a shadow. ~3 bytes a cell, deflated.
    // ⛔ NO CAP. The picture she saw is kept at its own full resolution — every
    // pixel's colour — so light, shade and texture come back as she saw them.
    // (A 96-cell cap was written here first and struck: "dont dumb her down".)
    const TW = SW, TH = SH;
    const tcBuf = Buffer.alloc(TW * TH * 3);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const sx = Math.min(SW - 1, Math.floor((x + 0.5) * SW / TW)), sy = Math.min(SH - 1, Math.floor((y + 0.5) * SH / TH));
      const so = (sy * SW + sx) * 4, o = (y * TW + x) * 3;
      tcBuf[o] = D[so]; tcBuf[o + 1] = D[so + 1]; tcBuf[o + 2] = D[so + 2];
    }
    return out.length ? {
      bones: out, aspect: +(gw / gh).toFixed(3), bg,
      truecolor: { w: TW, h: TH, z: 1, b64: zlib.deflateSync(tcBuf).toString('base64') },
      mask: { w: gw, h: gh, b64: Buffer.from(bits).toString('base64') },
      colors: { palette: pal.map(c => c.map(v => Math.round(v))), w: HW, h: HH, z: 1, b64: zlib.deflateSync(Buffer.from(idx)).toString('base64') },
      scene,
    } : null;
  },

  // ── SHE PAINTS WHAT SHE SAW, FROM WHAT SHE LEARNED OF IT ──────────────────
  // Judged on her real looks: volumes built round bones lose the outline that
  // makes a thing recognisable (a clean rooster came out a grey lump). What
  // carries recognition is the SILHOUETTE and WHERE ITS COLOURS SIT — both
  // learned from the look (`skeleton.mask`, `skeleton.colors`). She paints the
  // body cell by cell in the colour she saw there, in soft overlapping strokes,
  // then draws her own outline round the silhouette's edge. The pose (stretch,
  // turn) is the one her state gave the skeleton. No photographic line is drawn.
  _constructFromMask(skel, box, rnd, style, skill) {
    const out = [];
    if (!skel || !skel.mask || !skel.colors) return out;
    const W = skel.mask.w, H = skel.mask.h;
    const bits = Buffer.from(skel.mask.b64, 'base64');
    // The colour layout may be finer than the shape grid (and compressed).
    const unpack = (m) => { const raw = Buffer.from(m.b64, 'base64'); return m.z ? require('zlib').inflateSync(raw) : raw; };
    const idx = unpack(skel.colors);
    const CW = skel.colors.w || W, CH = skel.colors.h || H;
    const pal = skel.colors.palette || [];
    // The real colours she saw (shapes learned before this have none — they
    // paint from the palette as before). Sampled bilinearly, so a shadow or a
    // gradient comes back smooth, never as flat bands.
    let tc = null;
    if (skel.truecolor && skel.truecolor.b64) {
      try {
        const tb = unpack(skel.truecolor), TW = skel.truecolor.w, TH = skel.truecolor.h;
        if (tb.length >= TW * TH * 3) {
          tc = (x, y, LW, LH) => {
            const gx = Math.max(0, Math.min(TW - 1, (x + 0.5) * TW / LW - 0.5)), gy = Math.max(0, Math.min(TH - 1, (y + 0.5) * TH / LH - 0.5));
            const xa = Math.floor(gx), ya = Math.floor(gy), xb = Math.min(TW - 1, xa + 1), yb = Math.min(TH - 1, ya + 1), fx = gx - xa, fy = gy - ya;
            const at = (xx, yy, ch) => tb[(yy * TW + xx) * 3 + ch];
            return [0, 1, 2].map((ch) => (at(xa, ya, ch) * (1 - fx) + at(xb, ya, ch) * fx) * (1 - fy) + (at(xa, yb, ch) * (1 - fx) + at(xb, yb, ch) * fx) * fy);
          };
        }
      } catch { tc = null; }
    }
    const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && ((bits[(y * W + x) >> 3] >> ((y * W + x) & 7)) & 1);
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (!n) return out;
    const fw = x1 - x0 + 1, fh = y1 - y0 + 1;
    // ⭐ THE WHOLE PICTURE, NOT A CUT-OUT. When she holds the colour layout of
    // everything around the subject (`skel.scene`), she paints the picture she
    // imagined edge to edge — backdrop, ground, shadow — and the subject on
    // top, on the canvas the picture's own shape. Cutting the subject out was
    // judged to wreck the drawings (torn-off shadows, half-kept stands, bodies
    // chopped where the cut went wrong). The scene is painted unposed:
    // stretching or turning a whole frame would tear its corners open.
    // ⛔ PENCIL AND INK ARE DRAWINGS, NOT OUTLINES. Styles with no colour mass
    // used to skip the scene and the body and draw only the silhouette's edge —
    // judged live as "two blob pencil shapes". They now paint the same picture
    // as a VALUE study: every cell its real lightness (graphite), or that
    // lightness pushed to strong darks and lights with a smooth curve (ink).
    const mono = style.mass === 'none' ? (style.ink === 'mono' ? 'ink' : 'graphite') : null;
    const full = !!(skel.scene && skel.scene.b64);
    const sc = full ? 1 : Math.min(box.w / fw, box.h / fh);
    const cxM = full ? W / 2 : (x0 + x1 + 1) / 2, cyM = full ? H / 2 : (y0 + y1 + 1) / 2;
    const p = full ? { sx: 1, sy: 1, rot: 0 } : (skel.posed || { sx: 1, sy: 1, rot: 0 });
    const cr = Math.cos(p.rot || 0), sr = Math.sin(p.rot || 0);
    const T = full
      ? (x, y) => [x / W, y / H]
      : (x, y) => { const u = (x - cxM) * sc * (p.sx || 1), v = (y - cyM) * sc * (p.sy || 1); return [box.cx + u * cr - v * sr, box.cy + u * sr + v * cr]; };
    const fillA = (skill && skill.fillA) || 0.92;
    // One painted surface from a colour-index grid: indices settled by a 3x3
    // majority (twice), colours blended over a 3x3 inside the region, sampled
    // by the canvas smoothly with an antialiased edge.
    const paint = (inside, ids, palette, inv, bbox, a, W, H) => {
      let id2 = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) id2[i] = ids[i];
      // One count buffer for the whole pass, cleared per pixel. It used to be a
      // fresh array for EVERY pixel of every pass — hundreds of thousands of
      // allocations per drawing, which put her painting and the collector at a
      // third of the main thread while the cards waited for lessons.
      const cnt = new Uint16Array(Math.max(1, palette.length));
      for (let pass = 0; pass < 2; pass++) {
        const nx = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x;
          nx[i] = id2[i];
          if (!inside(x, y)) continue;
          cnt.fill(0);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!inside(x + dx, y + dy)) continue;
            const k = id2[(y + dy) * W + x + dx];
            if (k < cnt.length) cnt[k]++;
          }
          let bk = id2[i], bc = -1;
          for (let k = 0; k < cnt.length; k++) if (cnt[k] > bc) { bc = cnt[k]; bk = k; }
          nx[i] = bk;
        }
        id2 = nx;
      }
      const rgb = new Float32Array(W * H * 3), alpha = new Float32Array(W * H);
      // ⛔ Each cell is painted ITS OWN colour. It used to be the mean of its
      // 3×3 neighbours' colours, which blended every boundary between two hues
      // into a greyer third one — the fog over every drawing. The majority pass
      // above already cleans stray cells; the colours stay true.
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!inside(x, y)) continue;
        const i = y * W + x;
        let c = tc ? tc(x, y, W, H) : palette[id2[i]];
        if (!c) continue;
        // her practised hand: colour strength and value spread, around the
        // cell's own lightness (1.0 = exactly what she saw)
        const _ch = (skill && skill.chroma) || 1, _ct = (skill && skill.contrast) || 1;
        if (_ch !== 1 || _ct !== 1) {
          const L = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
          const L2 = 128 + (L - 128) * _ct;
          c = [0, 1, 2].map((k) => Math.max(0, Math.min(255, L2 + (c[k] - L) * _ch)));
        }
        if (mono) {
          let g = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
          if (mono === 'ink') g = 255 / (1 + Math.exp(-(g - 128) / 26));
          c = [g, g, g];
        }
        alpha[i] = 1;
        rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2];
      }
      // One decimal by arithmetic — `toFixed` built and re-parsed a string for
      // every channel of every cell (measured: this line + `paint` = 26% of the
      // main thread while the card waited for lessons). Same values (≥ 0).
      out.push({ type: 'layer', gw: W, gh: H, rgb: Array.from(rgb, v => Math.round(v * 10) / 10), alpha: Array.from(alpha), inv, bbox, a });
    };
    if (full) {
      // the scene first, everywhere the subject is not (the subject goes on top)
      const sIdx = unpack(skel.scene);
      const SW2 = skel.scene.w || W, SH2 = skel.scene.h || H;
      const everywhere = (x, y) => x >= 0 && y >= 0 && x < SW2 && y < SH2;
      paint(everywhere, sIdx, skel.scene.palette || [], [SW2, 0, 0, 0, SH2, 0], [0, 0, 1, 1], 1, SW2, SH2);
    }
    // ⛔ THE BODY WAS SAND. It was painted as one round dab per cell — a few
    // thousand jittered marks — and the cell colour was the NEAREST of six
    // learned colours, one of which is always the shadows and edges, so dark
    // dabs were strewn through every body (judged on renders: grainy, like
    // sand). Now:
    //   • each cell's colour index is SETTLED by its neighbourhood (a 3x3
    //     majority, twice) — a lone dark cell in a red body is an edge or a
    //     glint, not the body's colour;
    //   • the colours are then blended across neighbours inside the body;
    //   • and the whole body goes down as ONE painted surface the canvas
    //     samples smoothly, with an antialiased edge (`layer`).
    // It is still her abstraction — six learned colours and where they sit —
    // only laid down the way a brush would, not as grains.
    {
      // Inverse of T: canvas point → grid coordinate (the layer samples by it).
      let inv;
      if (full) inv = [W, 0, 0, 0, H, 0];
      else {
        const ksx = sc * (p.sx || 1), ksy = sc * (p.sy || 1);
        inv = [cr / ksx, sr / ksx, 0, -sr / ksy, cr / ksy, 0];
        inv[2] = cxM - (inv[0] * box.cx + inv[1] * box.cy);
        inv[5] = cyM - (inv[3] * box.cx + inv[4] * box.cy);
      }
      // canvas-space bounds of the body, for the canvas to scan only that
      let bx0 = 1, by0 = 1, bx1 = 0, by1 = 0;
      for (const [gx, gy] of [[x0, y0], [x1 + 1, y0], [x0, y1 + 1], [x1 + 1, y1 + 1]]) { const [X, Y] = T(gx, gy); bx0 = Math.min(bx0, X); bx1 = Math.max(bx1, X); by0 = Math.min(by0, Y); by1 = Math.max(by1, Y); }
      // the layer is sampled on the colour grid, which may be finer than the shape grid
      const fx = CW / W, fy = CH / H;
      const invC = [inv[0] * fx, inv[1] * fx, inv[2] * fx, inv[3] * fy, inv[4] * fy, inv[5] * fy];
      const inSubj = (CW === W && CH === H) ? on : (x, y) => x >= 0 && y >= 0 && x < CW && y < CH && idx[y * CW + x] !== 255;
      paint(inSubj, idx, pal, invC, [bx0 - 0.01, by0 - 0.01, bx1 + 0.01, by1 + 0.01], style.mass === 'wash' ? 0.88 * fillA : 1, CW, CH);   // a wash that covers — at 0.6 the dark page greyed every hue
    }
    // HER OUTLINE — the silhouette's edge traced as a CONTOUR (marching
    // squares on the mask) and rounded (two Chaikin passes), not a run of
    // cell-to-cell steps (judged: the outline read as pixel stairs).
    let lum = 0, ln = 0; for (const c of pal) { lum += 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; ln++; }
    // With a painted body the outline contrasts the BODY; with no body painted
    // it sits on bare paper, which is dark, so it must be light — judged on a
    // render: a dark outline on dark paper was an invisible drawing.
    // ⛔ NO WHITE PEN. The outline over a dark or absent fill was a fixed pale
    // [232,228,236] — judged live, again, as "white pen traces". It now wears the
    // subject's own most saturated colour, lifted only as far as it needs to read
    // on her dark page; dark ink over a bright fill as before.
    // A value drawing's line is the graphite itself — dark, never a pale pen.
    const ink = mono ? [30, 30, 34] : ((ln && lum / ln > 120) ? [28, 24, 32] : this._readableInk(pal));
    const lw = style.outlineW > 0 ? Math.min(style.outlineW, 0.007) * ((skill && skill.traceW) || 1) : undefined;
    // In a fully painted picture the subject is set off by its own colours
    // against the scene — an outline round it would make it a sticker.
    for (const loop of (full ? [] : this._maskContours(on, W, H))) {
      if (loop.length < 6) continue;
      let pts = loop;
      for (let k = 0; k < 2; k++) {
        const sm = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          sm.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
        }
        pts = sm;
      }
      const cpts = pts.map(q => T(q[0], q[1]));
      cpts.push(cpts[0]);
      out.push({ type: 'poly', pts: cpts, rgb: ink, w: lw, a: style.outlineA || 1 });
    }
    return out;
  },

  // The closed edge loops of a binary grid, in grid coordinates (cell corners
  // at integers), by marching squares — the standard way to turn a mask into
  // smooth-able contours. `on(x, y)` reads the grid.
  _maskContours(on, W, H) {
    const v = (x, y) => (on(x, y) ? 1 : 0);
    // edge points sit at cell-centre midpoints; key by doubled coordinates
    const segs = new Map();
    const K = (x2, y2) => x2 + ',' + y2;
    const add = (a, b) => { (segs.get(K(a[0], a[1])) || segs.set(K(a[0], a[1]), []).get(K(a[0], a[1]))).push(b); };
    for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
      const c = v(x, y) | (v(x + 1, y) << 1) | (v(x + 1, y + 1) << 2) | (v(x, y + 1) << 3);
      if (c === 0 || c === 15) continue;
      // midpoints of the square's four sides (doubled coords, centres at 2x+1)
      const T2 = [2 * x + 2, 2 * y + 1], R2 = [2 * x + 3, 2 * y + 2], B2 = [2 * x + 2, 2 * y + 3], L2 = [2 * x + 1, 2 * y + 2];
      const table = {
        1: [[L2, T2]], 2: [[T2, R2]], 3: [[L2, R2]], 4: [[R2, B2]], 5: [[L2, T2], [R2, B2]], 6: [[T2, B2]], 7: [[L2, B2]],
        8: [[B2, L2]], 9: [[B2, T2]], 10: [[T2, R2], [B2, L2]], 11: [[B2, R2]], 12: [[R2, L2]], 13: [[R2, T2]], 14: [[T2, L2]],
      };
      for (const [a, b] of table[c]) { add(a, b); add(b, a); }
    }
    const used = new Set();
    const loops = [];
    for (const [k0] of segs) {
      if (used.has(k0)) continue;
      const loop = [];
      let cur = k0, prev = null;
      for (let guard = 0; guard < 200000; guard++) {
        used.add(cur);
        const [cx2, cy2] = cur.split(',').map(Number);
        loop.push([cx2 / 2, cy2 / 2]);
        const nexts = (segs.get(cur) || []).map(q => K(q[0], q[1])).filter(q => q !== prev && !used.has(q));
        if (!nexts.length) break;
        prev = cur; cur = nexts[0];
      }
      if (loop.length >= 3) loops.push(loop);
    }
    return loops;
  },

  // ── HER EYES SEE WHAT SHE DRAWS ─────────────────────────────────────────
  // A finished piece is looked at by the same eye that learned the thing: it
  // is reconstructed, the same subject-finder reads its silhouette, and that
  // silhouette is compared (overlap / union, each fitted to its own frame)
  // with the one she learned for the subject — and with the ones she learned
  // for other things she knows. The piece passes only when its own subject
  // is the BEST match. A rank among her memories, not a cutoff of mine.
  // A memory as the eye compares it: its silhouette reduced to an N×N grid and
  // its percept `p` — read as two JSON fields (never the ~4–10 MB entry), the
  // small grid cached per key and dropped when the entry is rewritten.
  _vmJudgeView(key, N) {
    if (!this._vmJudgeCache) this._vmJudgeCache = new Map();
    const ck = key;
    const hit = this._vmJudgeCache.get(ck);
    if (hit !== undefined && (hit === null || hit.N === N)) return hit;
    let out = null;
    try {
      const store = this._vmStore();
      let mask = null, p = null;
      if (Map.prototype.has.call(store, key)) {
        const e = Map.prototype.get.call(store, key);
        mask = e && e.schema && e.schema.skeleton && e.schema.skeleton.mask;
        p = e && e.p;
      } else {
        const db = this._vmDb();
        const r = db ? db.prepare("SELECT json_extract(entry, '$.schema.skeleton.mask') AS mask, json_extract(entry, '$.p') AS p FROM concepts WHERE key = ?").get(key) : null;
        if (r) {
          if (typeof r.mask === 'string') { try { mask = JSON.parse(r.mask); } catch { mask = null; } }
          if (typeof r.p === 'string') { try { p = JSON.parse(r.p); } catch { p = null; } }
        }
      }
      if (mask || p) out = { N, grid: mask ? this._maskGrid(mask, N) : null, p: Array.isArray(p) || ArrayBuffer.isView(p) ? p : null };
    } catch { out = null; }
    this._vmJudgeCache.set(ck, out);
    if (this._vmJudgeCache.size > 4096) this._vmJudgeCache.delete(this._vmJudgeCache.keys().next().value);
    return out;
  },
  _maskGrid(mask, N) {
    const W = mask.w, H = mask.h, bits = Buffer.from(mask.b64, 'base64');
    const on = (x, y) => (bits[(y * W + x) >> 3] >> ((y * W + x) & 7)) & 1;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) return null;
    const g = new Uint8Array(N * N), s = Math.max(x1 - x0 + 1, y1 - y0 + 1);
    const ox = x0 - (s - (x1 - x0 + 1)) / 2, oy = y0 - (s - (y1 - y0 + 1)) / 2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = Math.floor(ox + (i + 0.5) * s / N), y = Math.floor(oy + (j + 0.5) * s / N);
      if (x >= 0 && y >= 0 && x < W && y < H && on(x, y)) g[j * N + i] = 1;
    }
    return g;
  },
  _maskIoU(a, b) { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; } return u ? i / u : 0; },
  // The learned silhouette in the POSE she drew it in (stretch + turn about
  // its centre), so her eye compares like with like. Without it every
  // deliberate pose read as a wrong shape (judged: all eight good drawings of
  // one run refused).
  _poseMask(mask, posed) {
    if (!mask || !posed) return mask;
    const W = mask.w, H = mask.h, bits = Buffer.from(mask.b64, 'base64');
    const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && ((bits[(y * W + x) >> 3] >> ((y * W + x) & 7)) & 1);
    const sx = posed.sx || 1, sy = posed.sy || 1, cr = Math.cos(posed.rot || 0), sr = Math.sin(posed.rot || 0);
    const cx = W / 2, cy = H / 2;
    const out = new Uint8Array(Math.ceil(W * H / 8));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const X = x + 0.5 - cx, Y = y + 0.5 - cy;
      const u = (X * cr + Y * sr) / sx, v = (-X * sr + Y * cr) / sy;
      if (on(Math.floor(u + cx), Math.floor(v + cy))) out[(y * W + x) >> 3] |= 1 << ((y * W + x) & 7);
    }
    return { w: W, h: H, b64: Buffer.from(out).toString('base64') };
  },
  async _eyeJudgesDrawing(drawnRec, word, posed) {
    try {
      // The mask alone (one JSON field read in SQLite), not the ~10 MB entry.
      const learned = this._poseMask(typeof this._vmSkeletonMask === 'function' ? this._vmSkeletonMask(word) : null, posed);
      if (!learned) return { judged: false };
      const img = await this.mindSpace.imagine(drawnRec, 0);
      const seenInDrawing = this._learnSkeleton(img);
      if (!seenInDrawing || !seenInDrawing.mask) return { judged: true, pass: false, why: 'her eye finds no single shape in it' };
      const N = 32, mine = this._maskGrid(seenInDrawing.mask, N), own = this._maskGrid(learned, N);
      // She may draw the thing facing the other way — her pose can mirror it.
      const flip = (g) => { const o = new Uint8Array(g.length); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) o[y * N + x] = g[y * N + (N - 1 - x)]; return o; };
      const ownScore = Math.max(this._maskIoU(mine, own), this._maskIoU(flip(mine), own));
      // ⛔ RECOGNITION, NOT A YARDSTICK. An "oval score" — the drawing had to
      // beat a plain oval of the thing's frame — was built here and REMOVED
      // the same day on the operator's word: comparing a drawing to a shape
      // that has nothing to do with the thing measures nothing, and it refused
      // good drawings while passing bad ones. What her eye actually does is
      // RECOGNISE: does the drawing look more like the thing she imagined than
      // like anything else she remembers? Two readings, both ranks among her
      // own memories, no number of mine:
      //   • SHAPE — the silhouette her eye finds in the drawing, against every
      //     learned silhouette;
      //   • SIGHT — her percept of the whole drawing (field C, the same
      //     description she keeps of everything she sees), against the
      //     percepts of everything she holds.
      // A drawing another memory beats on either is not yet the thing.
      const cos = (a, b) => { if (!a || !b) return 0; let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0; };
      let dp = null;
      try { const _d = await this.mindSpace.describe(drawnRec); if (_d) dp = Array.from(_d); } catch { dp = null; }
      // ⛔ EACH MEMORY AS ITS 32×32 SILHOUETTE GRID + PERCEPT, NOT ITS ENTRY.
      // This loop `get()`-loaded up to 48 whole entries (each ~4–10 MB of JSON,
      // her drawing inside it) synchronously on the main thread — the profile's
      // largest stall behind her thoughts. `_vmJudgeView` reads only the mask
      // and percept fields, caches the small grid per key, and the loop yields
      // between keys so it can never hold the loop.
      const _ownView = this._vmJudgeView(word, N);
      const ownSight = (dp && _ownView && _ownView.p) ? cos(dp, _ownView.p) : null;
      let beaten = 0, compared = 0, sightBeaten = 0, sightCompared = 0;
      let _y = 0;
      for (const k of this._vmAllKeys()) {
        if (k === word || compared >= 48) continue;
        if ((++_y % 4) === 0) await new Promise((r) => setImmediate(r));
        const o = this._vmJudgeView(k, N);
        if (!o) continue;
        if (o.grid) {
          compared++;
          if (Math.max(this._maskIoU(mine, o.grid), this._maskIoU(flip(mine), o.grid)) > ownScore) beaten++;
        }
        if (ownSight != null && o.p) {
          sightCompared++;
          if (cos(dp, o.p) > ownSight) sightBeaten++;
        }
      }
      // ⛔ THE SIGHT RANK REPORTS, IT DOES NOT DECIDE. Raw percepts of any two
      // pictures score ~1.00 against each other (measured), so which memory
      // edges ahead is decided by noise — on the first live freshstart her eye
      // refused 65 drawings and passed 6, every refusal "more like N other
      // sight(s)". The silhouette rank is a real measurement and carries the
      // verdict; the sight rank stays published for when a discriminating
      // percept exists.
      const pass = beaten === 0;
      return {
        judged: true, pass, ownScore: +ownScore.toFixed(3), compared, beaten,
        ownSight: ownSight == null ? null : +ownSight.toFixed(4), sightCompared, sightBeaten,
        why: pass ? undefined : `her eye finds it more like ${beaten ? beaten + ' other shape(s)' : ''}${beaten && sightBeaten ? ' and ' : ''}${sightBeaten ? sightBeaten + ' other sight(s)' : ''} she remembers than the ${word}`,
      };
    } catch (err) { return { judged: false, error: err && err.message }; }
  },

  // She BUILDS the figure: a tapered volume around every bone (each point's
  // width is the width she learned there), filled in the bone's colour, then
  // her own outline around the union of those volumes. Nothing from the
  // reference's lines is drawn.
  _constructFromSkeleton(skel, box, rnd, style, skill) {
    const out = [];
    if (!skel || !Array.isArray(skel.bones) || !skel.bones.length) return out;
    const jit = () => (rnd() - 0.5) * ((skill && skill.jitter) || 0.006);
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const b of skel.bones) for (const p of b.pts) { x0 = Math.min(x0, p[0] - p[2]); x1 = Math.max(x1, p[0] + p[2]); y0 = Math.min(y0, p[1] - p[2]); y1 = Math.max(y1, p[1] + p[2]); }
    const fw = Math.max(1e-3, x1 - x0), fh = Math.max(1e-3, y1 - y0);
    const sc = Math.min(box.w / fw, box.h / fh);
    const mx = (x) => box.cx + (x - (x0 + fw / 2)) * sc, my = (y) => box.cy + (y - (y0 + fh / 2)) * sc;
    // each bone → a closed volume polygon (left offsets out, right offsets back)
    const vols = [];
    const volW = (skill && skill.volW) || 1;
    for (const b of skel.bones) {
      const P = b.pts.map(p => [mx(p[0]), my(p[1]), Math.max(0.004, p[2] * sc * volW)]);
      if (P.length < 2) continue;
      const L = [], R = [];
      for (let k = 0; k < P.length; k++) {
        const a = P[Math.max(0, k - 1)], c = P[Math.min(P.length - 1, k + 1)];
        let tx = c[0] - a[0], ty = c[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const r = P[k][2];
        L.push([P[k][0] - ty * r, P[k][1] + tx * r]); R.push([P[k][0] + ty * r, P[k][1] - tx * r]);
      }
      // round caps at both ends
      const cap = (p, dirx, diry, from) => { const pts = []; const base = Math.atan2(diry, dirx); for (let k = 1; k < 6; k++) { const t = base + from + (k / 6) * Math.PI; pts.push([p[0] + Math.cos(t) * p[2], p[1] + Math.sin(t) * p[2]]); } return pts; };
      const e = P[P.length - 1], e0 = P[P.length - 2], s = P[0], s1 = P[1];
      const poly = L.concat(cap(e, e[0] - e0[0], e[1] - e0[1], -Math.PI / 2), R.reverse(), cap(s, s[0] - s1[0], s[1] - s1[1], -Math.PI / 2));
      vols.push({ poly, rgb: b.rgb });
    }
    const inPoly = (x, y, pl) => { let ins = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const xi = pl[i][0], yi = pl[i][1], xj = pl[j][0], yj = pl[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi)) ins = !ins; } return ins; };
    const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    const paints = style.mass !== 'none';
    let bodyLum = 60;
    if (paints) { let s = 0; for (const v of vols) s += lum(v.rgb); bodyLum = s / Math.max(1, vols.length); }
    const fillA = (skill && skill.fillA) || 0.92;
    const shade = Math.max(0, (skill && skill.detailMul) || 1);
    if (paints) {
      for (const v of vols) out.push({ type: 'fill', pts: v.poly.map(p => [p[0] + jit(), p[1] + jit()]), rgb: v.rgb, a: style.mass === 'wash' ? 0.88 * fillA : fillA });
      // SHADING — the half of each volume away from the light (lower-right)
      // goes a little darker, by as much as her trained shading skill commits.
      if (shade > 0.05) {
        for (const v of vols) {
          let cx = 0, cy = 0; for (const p of v.poly) { cx += p[0]; cy += p[1]; } cx /= v.poly.length; cy /= v.poly.length;
          const sh = v.poly.map(p => [cx + (p[0] - cx) * 0.8 + 0.008, cy + (p[1] - cy) * 0.8 + 0.01]);
          out.push({ type: 'fill', pts: sh, rgb: v.rgb.map(c => Math.round(c * 0.72)), a: Math.min(0.6, 0.22 * shade) });
        }
      }
    }
    // ⛔ No white pen here either: over dark or absent fills the outline wears the
    // subject's own colour (lifted to read), not a fixed pale [232,228,236].
    const lineInk = bodyLum > 120 ? [28, 24, 32] : this._readableInk(vols.map((v) => v && v.rgb));
    const lw = style.outlineW > 0 ? Math.min(style.outlineW, 0.007) * ((skill && skill.traceW) || 1) : undefined;
    for (let i = 0; i < vols.length; i++) {
      let run = [];
      const flush = () => { if (run.length >= 2) out.push({ type: 'poly', pts: run, rgb: lineInk, w: lw, a: style.outlineA || 1 }); run = []; };
      const pl = vols[i].poly;
      for (let k = 0; k <= pl.length; k++) {
        const p = pl[k % pl.length];
        let covered = false;
        for (let j = 0; j < vols.length && !covered; j++) if (j !== i && inPoly(p[0], p[1], vols[j].poly)) covered = true;
        if (covered) flush(); else run.push([p[0] + jit(), p[1] + jit()]);
      }
      flush();
    }
    // A line-only hand (no mass) used to draw every outline in one pale ink —
    // judged live as "white pen tracings". Each outline now wears the colour
    // she saw on that part of the thing, lifted until it reads on her dark
    // sketchbook paper (a dark colour is mixed toward white, hue kept).
    if (!paints) {
      for (const s of out) {
        if (s.type !== 'poly' || s.rgb !== lineInk) continue;
        const vi = vols.findIndex((v) => v.poly.some((p) => Math.hypot(p[0] - s.pts[0][0], p[1] - s.pts[0][1]) < 0.02));
        const c = (vi >= 0 && Array.isArray(vols[vi].rgb)) ? vols[vi].rgb : null;
        if (!c) continue;
        const L = lum(c);
        const t = L >= 120 ? 0 : (120 - L) / Math.max(1, 255 - L);
        s.rgb = c.map((v) => Math.round(v + (255 - v) * t));
      }
    }
    return out;
  },

  // WHAT SHE IS THINKING NOW — the thought chain's entries from THIS waking
  // session. The chain is saved and restored (her narrative survives a
  // restart), but a thought from weeks ago is not what she is thinking about:
  // read as "current", a chain she could not yet advance (pre-speech) pinned
  // her imagination to the same three words on every boot. Untimestamped
  // entries are excluded too — they were render prompts, not thoughts.
  _currentThoughts() {
    const chain = Array.isArray(this._innerThoughtChain) ? this._innerThoughtChain : [];
    const since = Number(this._startedAt) || 0;
    return chain
      .filter(e => e && typeof e === 'object' && Number(e.ts) >= since)
      .map(e => String(e.sentence || '').trim())
      .filter(Boolean);
  },

  // Her cortex's signature at this moment — the live semantic-region spike
  // pattern folded to an integer. Seeding a piece from this means her state
  // decides it: the same words in a different state are a different drawing.
  _semSignature() {
    try {
      const cl = this.cortexCluster, sem = cl && cl.regions && cl.regions.sem, sp = cl && cl.lastSpikes;
      if (!sem || !sp) return 0;
      let h = 2166136261 >>> 0;
      for (let i = sem.start; i < sem.end; i++) if (sp[i]) { h ^= (i - sem.start); h = Math.imul(h, 16777619) >>> 0; }
      return h;
    } catch { return 0; }
  },

  // Which of the things she knows is her mind on right now? The cosine between
  // her semantic readout (produced by her trained weights) and each word's
  // embedding — highest first. Her thought, not a dice roll, picks partners.
  _thoughtRank(words) {
    try {
      const cl = this.cortexCluster, emb = this.sharedEmbeddings;
      // No readout = no thought to rank by — say so (null), never pretend an
      // unsorted list is an ordering her cortex produced.
      if (!cl || !emb || typeof cl.getSemanticReadout !== 'function' || typeof emb.getEmbedding !== 'function') return null;
      const r = cl.getSemanticReadout(emb);
      if (!r || !r.length) return null;
      const cos = (a, b) => { let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / (Math.sqrt(na * nb) || 1); };
      return words.map(w => ({ w, c: cos(r, emb.getEmbedding(w) || []) })).sort((a, b) => b.c - a.c).map(x => x.w);
    } catch { return null; }
  },

  // The skeleton of a subject she has seen: from its schema, or read now off
  // the field she holds (schemas banked before skeletons existed).
  async _skeletonFor(word) {
    const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
    const e = store && store.get(word);
    if (!e) return null;
    if (e.schema && e.schema.skeleton) return e.schema.skeleton;
    if (e.schema && e.schema.skeleton === null) return null;   // already looked: no subject in it
    if (!e.rec || !this.mindSpace) return null;
    const img = await this.mindSpace.imagine(e.rec, 0);
    const sk = this._learnSkeleton(img);
    // Recorded either way: a skeleton, or `null` = "this look held no subject",
    // which is the evidence the drawability judge reads.
    if (e.schema) { e.schema.skeleton = sk || null; try { this._vmMarkDirty(word, false); } catch { /* persists next time */ } }
    return sk;
  },

  // INVENTION — graft limbs from another thing she knows onto this one, at the
  // joints where this one's limbs attach, scaled to the limb they replace.
  _graftSkeleton(skel, donor, rnd) {
    if (!skel || !donor || !Array.isArray(skel.bones) || !Array.isArray(donor.bones)) return skel;
    const len = (b) => { let s = 0; for (let i = 1; i < b.pts.length; i++) s += Math.hypot(b.pts[i][0] - b.pts[i - 1][0], b.pts[i][1] - b.pts[i - 1][1]); return s; };
    const joinedAt = (bones, bi, p) => bones.some((o, oi) => oi !== bi && o.pts.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.035));
    const limbs = (bones) => bones.map((b, bi) => {
      const s = joinedAt(bones, bi, b.pts[0]), e = joinedAt(bones, bi, b.pts[b.pts.length - 1]);
      return (s !== e) ? { bi, rootAtEnd: e } : null;
    }).filter(Boolean);
    const mine = limbs(skel.bones), theirs = limbs(donor.bones);
    if (!mine.length || !theirs.length) return skel;
    const bones = skel.bones.map(b => ({ ...b, pts: b.pts.map(p => p.slice()) }));
    const n = Math.min(mine.length, 1 + Math.floor(rnd() * 2));
    const grafted = [];
    for (let g = 0; g < n; g++) {
      const m = mine[Math.floor(rnd() * mine.length)], t = theirs[Math.floor(rnd() * theirs.length)];
      const mb = skel.bones[m.bi], tb = donor.bones[t.bi];
      const mPts = m.rootAtEnd ? mb.pts.slice().reverse() : mb.pts;   // root first
      const tPts = t.rootAtEnd ? tb.pts.slice().reverse() : tb.pts;
      const k = len({ pts: mPts }) / Math.max(1e-3, len({ pts: tPts }));
      const root = mPts[0], troot = tPts[0];
      bones[m.bi] = { pts: tPts.map(p => [+(root[0] + (p[0] - troot[0]) * k).toFixed(4), +(root[1] + (p[1] - troot[1]) * k).toFixed(4), +(p[2] * k).toFixed(4)]), rgb: tb.rgb };
      grafted.push(m.bi);
    }
    return { ...skel, bones, grafted: grafted.length };
  },

  // Pose a skeleton: bend every bone through a smooth field, turn and stretch
  // the whole figure, and let each limb swing a little about where it joins.
  _poseSkeleton(skel, rnd) {
    if (!skel || !Array.isArray(skel.bones)) return skel;
    let cx = 0, cy = 0, n = 0;
    for (const b of skel.bones) for (const p of b.pts) { cx += p[0]; cy += p[1]; n++; }
    cx /= n; cy /= n;
    const sx = 0.85 + 0.3 * rnd(), sy = 0.85 + 0.3 * rnd(), rot = (rnd() - 0.5) * 0.4;
    const thick = 0.8 + 0.45 * rnd();
    const cr = Math.cos(rot), sr = Math.sin(rot);
    // A bone with exactly ONE end joined to the rest of the body is a limb: it
    // swings about that joint, so it stays attached. A bone joined at both ends
    // (the trunk) or at neither does not swing.
    const near = (p, other) => other.pts.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.035);
    const bones = skel.bones.map((b, bi) => {
      const s0 = b.pts[0], s1 = b.pts[b.pts.length - 1];
      const startJoined = skel.bones.some((o2, oi) => oi !== bi && near(s0, o2));
      const endJoined = skel.bones.some((o2, oi) => oi !== bi && near(s1, o2));
      const isLimb = startJoined !== endJoined;
      const swing = isLimb ? (rnd() - 0.5) * 0.7 : 0, cs = Math.cos(swing), ss = Math.sin(swing);
      const o = isLimb && endJoined ? s1 : s0;
      return { ...b, pts: b.pts.map(p => {
        let u = p[0] - o[0], v = p[1] - o[1];
        const u2 = u * cs - v * ss, v2 = u * ss + v * cs;
        let X = (o[0] + u2 - cx) * sx, Y = (o[1] + v2 - cy) * sy;
        const rx = X * cr - Y * sr, ry = X * sr + Y * cr;
        return [+(cx + rx).toFixed(4), +(cy + ry).toFixed(4), +(p[2] * thick).toFixed(4)];
      }) };
    });
    return { ...skel, bones, posed: { sx: +sx.toFixed(2), sy: +sy.toFixed(2), rot: +rot.toFixed(2), thick: +thick.toFixed(2) } };
  },

  // ── PAINT.5 — HER TRAINED TECHNIQUE. The hand has tunable parameters; practice
  // (below) nudges them per concept and keeps only what measurably improves the
  // resemblance of her drawing to her remembered percept. Defaults are exactly
  // the constants the hand used before practice existed — a concept she has
  // never practiced draws identically to yesterday.
  _skillDefaults() {
    // ARTGROW (2026-08-25) — stroke counts must not be tightly limited, since no
    // artwork can be made in twenty strokes, and her capacity should GROW as she
    // learns art. `budgetMul` is the sixth TRAINABLE param: how much
    // of her remembered trace this hand commits to the page. It is her DRAWING
    // ABILITY, so it belongs in the practice loop with the rest of the hand,
    // not frozen in a style constant. Starts at 1.0 (the untrained hand already
    // draws a real drawing) and the practice loop can take it to 2.5×, at which
    // point she is redrawing essentially everything she remembers.
    // DRAWCOPY — the construction's own skills, trained the same way: `volW`
    // (how wide she builds each volume against the width she learned), `fillA`
    // (how solidly she paints it), `traceW` now weights her OUTLINE, and
    // `detailMul` sets how much shading she puts inside each volume.
    // `chroma` (how strongly she lays the colour she saw) and `contrast` (how
    // far apart her lights and darks sit) are the two the painted build reads
    // on every cell — the knobs practice can actually move on a painted piece.
    return { jitter: 0.006, underA: 0.55, traceW: 1.0, keepP: 0.85, detailMul: 1.0, budgetMul: 1.0, volW: 1.0, fillA: 0.92, chroma: 1.0, contrast: 1.0 };
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
    // ⛔ A `transition:` frame is a morph INTO one of her pieces, and it is on
    //   screen for a real share of the time. Matching the raw label refused it
    //   on its prefix alone, so the buttons were greyed out while her drawing
    //   was visibly forming. The verdict belongs to the piece being morphed to.
    // ⛔ And `canvas:imagine:` was missing outright — her own inventions were
    //   the one kind of artwork that could not be judged at all. Measured over
    //   ten consecutive live frames: the buttons armed on roughly 1 in 5.
    const src = String(sourceLabel || '').replace(/^transition:/, '');
    const m = src.match(/^(?:canvas:own:|canvas:imagine:|canvas:draw:|draw:fav:|lookup:)(.+)$/);
    if (!m) return { ok: false, why: 'not a judgeable frame' };
    // canvas:own and canvas:imagine labels are "<words>:<style>" — the style
    // rides after the colon, and an accept credits that hand for each subject.
    const segs = m[1].split(':');
    const words = segs[0].split('+').map(w => w.trim().toLowerCase()).filter(w => w && w.length > 1).slice(0, 3);
    const styleName = ((src.startsWith('canvas:own:') || src.startsWith('canvas:imagine:')) && segs.length > 1) ? String(segs[segs.length - 1]).toLowerCase() : null;
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
          // ARTLEARN (2026-08-21) — the requirement: she LEARNS from her drawing.
          // an ACCEPT teaches her which HAND works for this subject: the
          // winning style banks a per-concept preference the style picker
          // reads, and her current technique params are marked validated.
          if (verdict === 'accept' && styleName) {
            a.styles = a.styles || {};
            a.styles[styleName] = (a.styles[styleName] | 0) + 1;
            if (e.skill) e.skill.validated = (e.skill.validated | 0) + 1;
          }
          // FORMBANK — an accept credits the FORM that drew the piece, so her
          // best variants of this subject lead future picks.
          if (verdict === 'accept' && this._lastFormPick && this._lastFormPick.has(w)) {
            const fi = this._lastFormPick.get(w) | 0;
            const cands = [e.schema, ...(Array.isArray(e.schemaBank) ? e.schemaBank : [])];
            if (cands[fi]) cands[fi].wins = (cands[fi].wins | 0) + 1;
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
        // REJECTGONE (2026-08-21) — reported: rejected drawings kept being
        // displayed after being marked for redraw. The WHOLE memory of the word dies, not
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
  /**
   * ✍ WRITING PRACTICE — the trained skill on top of the strokes.
   *
   * The letter-shape pass gave her the letterforms: she looks at each printed character,
   * traces it herself, and banks that trace. **Having a trace is not the same as
   * writing well**, and nothing turned one into the other — which is why the
   * complaint was that she is not "writing her letters and words" even with all
   * 94 shapes banked.
   *
   * ⭐ ONE LOOP COVERS THE WHOLE LADDER, because the reference and the attempt
   * are both just text. The printed form comes from `glyphStrokes(text)` — the
   * letter in the world — and her attempt comes from `handwrittenStrokes(text)`,
   * composed from the traces she made herself. So a single letter, a digit, a
   * word and a sentence all practise through the identical path, and the ladder
   * the row asks for (letters → numbers → words → sentences) is a matter of what
   * you pass in, not four separate mechanisms.
   *
   * The scoring is the same shape as `_practiceDrawing`: render, PERCEIVE her own
   * output, score cosine against the perceived reference, and keep only the
   * nudges that measurably improve resemblance.
   *
   * ⛔ SHE CAN ONLY PRACTISE WHAT SHE HAS LEARNED. `handwrittenStrokes` skips a
   * character whose trace she has not banked, so a word she cannot yet write
   * scores against a partial attempt — and if she can write none of it, this
   * refuses rather than training against an empty page.
   */
  async _practiceWriting(text) {
    // ⛔⛔ EIGHT SILENT DECLINES, ONE INDISTINGUISHABLE OUTCOME — until 2026-10-29.
    // Every early exit below returned a bare `null`, and `writingPractice` in
    // state stayed `null` until the FIRST SUCCESSFUL session. So a boot that
    // drained 62 queued practice jobs and declined every one read exactly like
    // a boot that never drained any: `writingPractice: null`, `sessions: 0`. The
    // operator asked why her handwriting never improves and this lane could not
    // say whether it had ever run. Same shape as the Life gate's five decline
    // conditions printing "no reason recorded".
    //
    // Now every exit NAMES itself. Two of the names are NOT faults and are
    // worded so a reader does not treat them as one: `gap-cooldown` is pacing
    // (30 min per key by design), and `not-learned-yet` is the honest early
    // state before WRITEWARM has banked that glyph. The rest are real.
    const _st = this._writePracticeStats || (this._writePracticeStats = { sessions: 0, attempts: 0, declines: {} });
    if (!_st.declines) _st.declines = {};
    _st.attempts = (_st.attempts | 0) + 1;
    _st.lastAttemptAt = Date.now();
    const _decline = (why) => { _st.declines[why] = (_st.declines[why] | 0) + 1; _st.lastDecline = why; _st.lastDeclineAt = Date.now(); return null; };
    if (!this.mindSpace || typeof this.mindSpace.sketch !== 'function'
      || typeof this.mindSpace.describe !== 'function'
      || typeof this.mindSpace.glyphStrokes !== 'function'
      || typeof this.handwrittenStrokes !== 'function') return _decline('no-methods');
    const key = String(text || '').trim();
    if (!key) return _decline('no-text');
    const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
    if (!store) return _decline('no-store');
    const skillKey = `writing:${key.toLowerCase()}`;
    const prev = store.get(skillKey) || null;
    const GAP = Number(process.env.DREAM_WRITE_PRACTICE_GAP_MS) >= 0
      ? Number(process.env.DREAM_WRITE_PRACTICE_GAP_MS) : 1800000;
    if (prev && prev.at && (Date.now() - prev.at) < GAP) return _decline('gap-cooldown');
    const ITERS = Number(process.env.DREAM_WRITE_PRACTICE_ITERS) > 0
      ? Number(process.env.DREAM_WRITE_PRACTICE_ITERS) : 5;
    const cos = (a, b) => {
      let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      return (na && nb) ? d / Math.sqrt(na * nb) : -1;
    };
    const BOX = { x: 0.08, y: 0.30, size: 0.34 };
    // ⭐ THE REFERENCE IS THE PRINTED FORM, PERCEIVED — not the glyph table
    // itself. She is scored on whether her writing LOOKS like the writing she
    // was shown, through the same eyes she sees everything else with.
    let refP = prev && Array.isArray(prev.refP) && prev.refP.length ? prev.refP : null;
    try {
      if (!refP) {
        // ⛔ `real: true` — THE PRACTICE REFERENCE MUST BE THE REAL LETTERFORM.
        // This is the line that set her ceiling: scored against the 5x7 bitmap,
        // practice could only make her reproduce a three-pixel 'r' more exactly.
        // With a real outline as the reference the ceiling is the typeface. If no
        // typeface loaded there is nothing honest to score against, so no session.
        const rs = this.mindSpace.glyphStrokes(key, { x: BOX.x, y: BOX.y, size: BOX.size, bold: true, rgb: [235, 233, 238], real: true });
        if (!rs || !rs.length) return _decline('no-printed-strokes');   // no real typeface loaded this boot
        const rrec = await this.mindSpace.sketch(rs, { maxSide: 256 });
        if (!rrec) return _decline('ref-sketch-null');
        const rd = await this.mindSpace.describe(rrec);
        if (!rd) return _decline('ref-describe-null');
        refP = Array.from(rd);
      }
    } catch { return _decline('ref-threw'); }
    const score = async (params) => {
      const hw = this.handwrittenStrokes(key, {
        x: BOX.x, y: BOX.y, size: BOX.size, rgb: [232, 230, 236],
        weight: params.weight, slant: params.slant, commit: params.commit,
      });
      if (!hw || !hw.strokes || !hw.strokes.length) return { s: -1, wrote: 0, skipped: hw ? hw.skipped : 0 };
      const rec = await this.mindSpace.sketch(hw.strokes, { maxSide: 256 });
      if (!rec) return { s: -1, wrote: hw.wrote, skipped: hw.skipped };
      const d = await this.mindSpace.describe(rec);
      return { s: d ? cos(Array.from(d), refP) : -1, wrote: hw.wrote, skipped: hw.skipped };
    };
    // ⚠ No wobble, no skill floor — see the note on the composer. Every range
    // here is a property real handwriting has, and each can only move if it
    // measurably improves resemblance to the printed form.
    const RANGES = {
      weight: [0.5, 2.2, 0.15],
      slant: [-0.25, 0.25, 0.04],
      commit: [0.72, 1.0, 0.04],
    };
    const params = {
      weight: 1, slant: 0, commit: 1,
      ...((prev && prev.params) || {}),
    };
    const sessions = (prev && prev.sessions) || 0;
    let first;
    try { first = await score(params); } catch { return _decline('score-threw'); }
    if (!first || first.s < 0) return _decline('no-score');          // her hand sketched/described to nothing
    if (!first.wrote) return _decline('not-learned-yet');            // honest early state — WRITEWARM has not banked these glyphs yet
    let best = first.s;
    const base = best;
    const keys = Object.keys(RANGES);
    const prnd = (typeof this._ownArtRng === 'function')
      ? this._ownArtRng(`write|${skillKey}|${sessions}`)
      : (() => { let s = sessions + 1; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
    let kept = 0;
    for (let i = 0; i < ITERS; i++) {
      const k = keys[Math.floor(prnd() * keys.length) % keys.length];
      const [lo, hi, step] = RANGES[k];
      const cand = { ...params, [k]: Math.min(hi, Math.max(lo, params[k] + (prnd() < 0.5 ? -1 : 1) * step)) };
      if (cand[k] === params[k]) continue;
      let r;
      try { r = await score(cand); } catch { continue; }
      if (r && r.s > best + 1e-4) { best = r.s; params[k] = cand[k]; kept++; }
    }
    const entry = {
      params, cos: +best.toFixed(4), sessions: sessions + 1, at: Date.now(),
      refP, wrote: first.wrote, skipped: first.skipped, text: key,
    };
    try { store.set(skillKey, entry); } catch { /* the session still counted in state */ }
    // ⚠ MUTATE, DO NOT REPLACE. `_st` is this same object and carries the
    // attempt/decline counters; assigning a fresh literal here (as this used to)
    // would wipe every decline the moment the first session succeeded, and the
    // page would read "1 session" over 61 silent refusals.
    Object.assign(_st, {
      sessions: (_st.sessions | 0) + 1,
      lastText: key, lastBase: +base.toFixed(4), lastBest: +best.toFixed(4),
      lastKept: kept, wrote: first.wrote, skipped: first.skipped, at: Date.now(),
    });
    try {
      console.log(`[Writing] ✍ PRACTICE "${key}" session ${sessions + 1}: resemblance ${base.toFixed(4)} → ${best.toFixed(4)} (${kept}/${ITERS} nudges kept) · wrote ${first.wrote} char(s), skipped ${first.skipped} she has not learned`);
    } catch { /* nf */ }
    return { text: key, base, best, kept, wrote: first.wrote, skipped: first.skipped };
  },

  async _practiceDrawing(word) {
    if (!this.mindSpace || typeof this.mindSpace.sketch !== 'function' || typeof this.mindSpace.describe !== 'function') return null;
    const key = String(word || '').toLowerCase().trim();
    if (!key) return null;
    const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
    const e = store && store.get(key);
    // practice needs both halves of the judgment: her memory of the shape
    // (schema with the trace) and her memory of the look (the percept vector)
    if (!e || !e.schema || !Array.isArray(e.schema.trace) || e.schema.trace.length < 10 || !Array.isArray(e.p) || !e.p.length) return null;
    // DRAWCOPY — she practises the way she now draws: from the skeleton.
    if (!e.schema.skeleton) { try { await this._skeletonFor(key); } catch { /* the old hand is practised instead */ } }
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
      // ARTGROW — her stroke commitment is TRAINED like every other part of the
      // hand. The score is cosine against her banked percept of the real thing,
      // so "more strokes" only survives a session when it actually made the
      // drawing resemble the subject more — which is the honest way for an
      // ability to grow rather than being handed to her as a constant.
      budgetMul: [0.6, 2.5, 0.25],
      // DRAWCOPY — the skills of building a figure from its skeleton.
      volW:      [0.6, 1.5, 0.08],
      fillA:     [0.5, 1.0, 0.06],
      chroma:    [0.7, 1.5, 0.08],
      contrast:  [0.75, 1.35, 0.06],
    };
    const params = { ...this._skillDefaults(), ...(e.skill && e.skill.params) };
    const sessions = (e.skill && e.skill.sessions) || 0;
    let best;
    try { best = await score(params); } catch { return null; }
    if (best < 0) return null;
    const base = best;
    // ⛔ ONLY THE KNOBS THIS HAND READS. A painted build (silhouette + colour
    // layout) reads `chroma` and `contrast` on every cell; the other knobs
    // belong to the older stroke hands and cannot change one pixel of it — so
    // every session nudged them and kept nothing (0 of 5, session after session).
    const _painted = !!(e.schema.skeleton && e.schema.skeleton.mask && e.schema.skeleton.colors);
    const keys = _painted ? ['chroma', 'contrast'] : Object.keys(RANGES);
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

  // ── ARTZIG2.2 (2026-08-25) — THE FRAGMENT GATE, AS ONE OWNER.
  //
  // ⛔ The gate existed and was applied in exactly ONE place: the layer that
  // DRAWS remembered strokes. The layer that decides the BODY read the RAW
  // trace, so the convex hull was fitted to every jagged tracer fragment —
  // i.e. to the bounding box of the noise scatter, not to the subject. Judged
  // on real renders: the body came out a RECTANGULAR SLAB in both hands, and
  // on the pale watercolor wash the part-colour blobs sitting on that slab
  // read as the "coloured garbage" the complaint names.
  //
  // So ARTZIG2 suppressed the fragments' INK while keeping their SHAPE. The
  // survivors are computed once here and consumed by both layers — the hull
  // and the redraw — because "which strokes are real?" is one question and it
  // had two different answers.
  //
  // The rule itself is unchanged (short AND jagged = tracer noise; whiskers
  // are short but straight, an ear is one clean turn — both pass).
  _traceSurvivors(schema, fx) {
    const tN = (Array.isArray(schema.trace) ? schema.trace.length : 0);
    if (tN === 0) return [];
    const diag = Math.hypot(Math.max(1e-3, fx.w), Math.max(1e-3, fx.h));
    const keep = [];
    for (let ti = 0; ti < tN; ti++) {
      const tp = schema.trace[ti];
      if (!Array.isArray(tp) || tp.length < 2) continue;
      let L = 0, turns = 0, nTurn = 0;
      for (let i = 1; i < tp.length; i++) {
        L += Math.hypot(tp[i][0] - tp[i - 1][0], tp[i][1] - tp[i - 1][1]);
        if (i >= 2) {
          const a1 = Math.atan2(tp[i - 1][1] - tp[i - 2][1], tp[i - 1][0] - tp[i - 2][0]);
          const a2 = Math.atan2(tp[i][1] - tp[i - 1][1], tp[i][0] - tp[i - 1][0]);
          let da = Math.abs(a2 - a1); if (da > Math.PI) da = 2 * Math.PI - da;
          turns += da; nTurn++;
        }
      }
      if (L < diag * 0.025 && nTurn > 0 && (turns / nTurn) > 1.22) continue;   // tracer noise
      keep.push(ti);
    }
    return keep;
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
    // DRAWCOPY — with a skeleton she CONSTRUCTS the figure from its build; the
    // remembered trace below is never redrawn when she knows how the thing is
    // built. The trace path stays only for a schema with no readable build.
    if (schema && schema.skeleton && Array.isArray(schema.skeleton.bones) && schema.skeleton.bones.length) {
      // painted from the learned silhouette + colour layout when the look
      // carried them; the bone-volume build only for a skeleton learned before
      // those existed
      const built = (schema.skeleton.mask && schema.skeleton.colors)
        ? this._constructFromMask(schema.skeleton, box, rnd, style, skill)
        : this._constructFromSkeleton(schema.skeleton, box, rnd, style, skill);
      if (built.length) return built;
    }
    // No shape she has learned from looking → NOTHING. ⛔ The definition recipe
    // (`_defDrivenStrokes`: colour words → round colour masses) is no longer
    // reached: on a fresh store it was what painted "apple" as bright circles
    // (operator, 2026-11-23: "using birght circles to represent them that is
    // totally off"). A thing she has not looked at is not drawn until she has.
    // The trace-redraw layers further down are not reached either.
    return out;
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
    // ARTZIG2.2 — computed ONCE, before anything reads the trace, so the body
    // and the redraw agree about which strokes are real.
    const _traceKeep = this._traceSurvivors(schema, fx);
    const defAttr = this._defDrawAttributes ? this._defDrawAttributes(word) : null;
    const defColor = defAttr && defAttr.colors && defAttr.colors[0];
    // A definition colour only steers a subject she has not SEEN — mixing it 55%
    // into seen colours shifted every true hue (part of the "pastel" judgement).
    const _seenPal = !!(schema && Array.isArray(schema.palette) && schema.palette.length);
    const mixDef = (rgb) => (defColor && !_seenPal) ? [Math.round(rgb[0] * 0.45 + defColor[0] * 0.55), Math.round(rgb[1] * 0.45 + defColor[1] * 0.55), Math.round(rgb[2] * 0.45 + defColor[2] * 0.55)] : rgb;
    // ── LAYER 1: MASS — SILHOUETTE-FIRST (PAINT.6). The live judged test showed
    // part-cell blobs render as "a column of circles": the grid is a LAYOUT,
    // not a shape. But the schema HOLDS the shape — the traced silhouette —
    // so when a closed (or near-closed) outline exists, THE BODY IS THAT
    // POLYGON, filled in the style's treatment with the subject's own colors.
    // The form on the page is then the form she actually saw. Part-cell
    // masses only run as the fallback when no silhouette was captured.
    let silhouette = null;
    let _bodyInkUsed = null;   // ARTZIG2 — the ink the underpaint actually used
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
        // ⛔ ARTZIG2.2 — SURVIVORS, not the raw trace. Fitting the hull to every
        // jagged fragment fitted it to the bounding box of the tracer's noise
        // scatter, which is why the body rendered as a rectangular slab in
        // both judged hands. Same survivor set the redraw layer uses.
        const src = (_traceKeep.length >= 10)
          ? _traceKeep.map(ti => ({ pts: schema.trace[ti] }))
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
      // ARTZIG2 — remember the ink the underpaint ACTUALLY used, so the trace
      // layer's contrast decision reads the real body instead of re-rolling a
      // random palette pick (the mismatch lightened strokes over a light body
      // — garish pale strands, judged on the doodle render).
      _bodyInkUsed = bodyInk;
      // PAINT.7 — when the full trace will carry the read, the body fill is an
      // UNDERPAINT (translucent) so the drawing reads as lines-over-wash, not a
      // solid slab with lines lost inside it.
      const hasTrace = Array.isArray(schema.trace) && schema.trace.length >= 10;
      if (style.mass === 'fill') {
        out.push({ type: 'fill', pts: sPts, rgb: bodyInk, a: hasTrace ? skill.underA : 1 });
      } else if (style.mass === 'wash') {
        out.push({ type: 'fill', pts: sPts, rgb: [Math.min(255, bodyInk[0] + 35), Math.min(255, bodyInk[1] + 35), Math.min(255, bodyInk[2] + 35)], a: 0.4 });
        out.push({ type: 'fill', pts: sPts.map(pp => [pp[0] + (rnd() - 0.5) * 0.02, pp[1] + (rnd() - 0.5) * 0.02]), rgb: bodyInk, a: 0.3 });
      }
      // BRUSHCULL — the per-part texture branch (hatch/xhatch/scribble in
      // each part's own color) is GONE with the texture masses themselves:
      // neighboring parts' stroke fields criss-crossed into X-scratch, the
      // operator's standing complaint. mass 'none' styles read underpaint-
      // less: trace + outline on bare paper.
      // COLORART — COLOR LAYERS + DEPTH: when the schema carries per-part
      // sampled colors (where the colors GO), every part paints a mass in ITS
      // OWN color over the underpaint — the regional color layers a real
      // image has, the light and dark in the right places. Falls back to the
      // old 3-part single-ink shading for pre-color schemas.
      if (style.mass === 'fill' || style.mass === 'wash') {
        const colored = schema.parts.filter(p => Array.isArray(p.rgb) && !p.bg);   // BGPART — backdrop-colored cells paint no mass
        // ⛔ ARTZIG2.2 — COLOUR LAYERS BELONG INSIDE THE SUBJECT. The part grid
        // is a LAYOUT over the whole reference frame, so cells near the subject's
        // edge placed their blobs (offset up to ±35% of the cell) OUTSIDE the
        // silhouette — judged on the re-render as pastel dots floating off the
        // body, which is the other half of the "coloured garbage" complaint.
        // `p.bg` already drops cells whose colour came from the backdrop; this
        // drops cells that are simply not on the thing. Even-odd ray cast
        // against the silhouette the body was just filled with.
        const _inSil = (x, y) => {
          let inside = false;
          for (let i = 0, j = sPts.length - 1; i < sPts.length; j = i++) {
            const xi = sPts[i][0], yi = sPts[i][1], xj = sPts[j][0], yj = sPts[j][1];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
          }
          return inside;
        };
        if (colored.length) {
          // each part = THREE offset soft blobs at low alpha, not one crisp
          // ellipse — a single blob per cell rendered as an obvious column of
          // circles (judged live, the very artifact this layer replaces)
          for (const p of colored) {
            const cx = mapX(p.cx), cy = mapY(p.cy);
            if (!_inSil(cx, cy)) continue;   // ARTZIG2.2 — not on the subject
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
        // ARTZIG2 — same real-underpaint read as the per-stroke contrast below.
        const bodyProbe = _bodyInkUsed || this._artInk(style, schema, 0.6, rnd, defColor);
        const lum = 0.299 * bodyProbe[0] + 0.587 * bodyProbe[1] + 0.114 * bodyProbe[2];
        traceInk = lum > 120 ? [30, 26, 34] : this._readableInk(schema && schema.palette);   // never the pale white pen
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
      // ARTZIG2 (2026-08-21) — FRAGMENT GATE + STYLE TRACE BUDGET. The trace's
      // tail is tiny jagged edge-follow fragments from busy references;
      // redrawn as-is they buried the subject in zigzag scratch (reproduced +
      // judged: a 200-fragment tail turned the doodle into a hairball and the
      // watercolor into colored garbage, while the same subject with a clean
      // trace read fine in every hand). Two rules, applied to NON-structural
      // strokes only (the long structural third always draws — it IS the read):
      //  1. a stroke that is both SHORT (< 2.5% of the frame diagonal) and
      //     JAGGED (mean turn > ~70°/vertex) is tracer noise, never a feature —
      //     dropped. Whiskers (short, straight) and ears (one clean turn) pass.
      //  2. the style's traceBudget caps how many strokes this hand redraws,
      //     longest-first — a doodle is loose by definition.
      // The gate judges EVERY stroke — a fragment sitting inside the "longest
      // 30%" of a fragment-bloated trace is still a fragment (first render of
      // this fix leaked exactly that way: 30% of 220 strokes force-drew 46
      // fragments and the doodle stayed a hairball). Structural = the first
      // slice of the SURVIVORS, capped absolute.
      // ARTZIG2.2 — the SAME survivor set the body was fitted to. This loop
      // used to recompute the identical rule here, which is how the hull came
      // to disagree with the redraw: one copy was applied, the other was not
      // written at all. One owner, `_traceSurvivors`, consulted twice.
      const _keepIdx = _traceKeep;
      // budget: structural survivors always; the rest longest-first (the trace
      // is length-sorted DESC at learn time, so kept order IS longest-first).
      // ⛔ ARTZIG2.2 — THE BUDGET IS AUTHORITATIVE. This was:
      //     _structN = min(40, max(10, ceil(keep * 0.3)))
      //     _budget  = max(_structN, style.traceBudget)
      // i.e. the structural count was a FLOOR on the budget, so a hand could
      // never draw fewer strokes than 30% of the survivors — and the two
      // smallest budgets are exactly the two hands in this complaint. On a
      // clean trace of ~120 survivors the floor is 36, so the doodle's
      // declared budget of 22 was silently raised to 36 and *"a doodle is
      // LOOSE"* stopped being true. Worse, when the floor met or exceeded the
      // budget the two sets became IDENTICAL — every drawn stroke counted as
      // structural, which force-drew all of them (killing the PAINT.12
      // per-attempt subset) and gave every one of them the aggressive
      // contrast value-shift meant for the structural read alone.
      // Structural is a FRACTION OF the budget now, so the declared number
      // means what it says and both tiers survive at every budget.
      // ARTGROW — the style's character × her TRAINED commitment. A practiced
      // hand reaches every stroke she remembers; an untrained one still draws a
      // real drawing. No hard ceiling: when the effective budget exceeds the
      // survivor count, she simply draws all of it.
      const _budget = Math.max(24, Math.round(((style.traceBudget | 0) || 160) * (skill.budgetMul || 1)));
      const _structN = Math.max(6, Math.ceil(_budget * 0.4));
      const _drawSet = new Set(_keepIdx.slice(0, _budget));
      const _structSet = new Set(_keepIdx.slice(0, _structN));
      // COLORLINE (2026-08-21) — reported: she was still outlining in white
      // when the outline should carry the colours of the thing it is drawn
      // from. EVERY stroke wears its sampled real color, the
      // mono exception included. The read is protected by shifting VALUE, not
      // by abandoning hue: a structural stroke keeps its own color but goes
      // darker on a light body / lighter on a dark one, so the outline is the
      // image's color AND still separates from the underpaint (the mushy-
      // outline failure that created the old white ink stays fixed).
      const useRealC = Array.isArray(schema.traceRgb) && schema.traceRgb.length;
      let bodyLum = 60;   // no underpaint = her dark paper
      if (style.mass === 'fill' || style.mass === 'wash') {
        // ARTZIG2 — read the ink the underpaint ACTUALLY used; re-rolling a
        // random palette pick here mismatched the real body and lightened
        // strokes over a light underpaint (garish pale strands, judged live).
        const bp = _bodyInkUsed || this._artInk(style, schema, 0.6, rnd, defColor);
        bodyLum = 0.299 * bp[0] + 0.587 * bp[1] + 0.114 * bp[2];
      }
      const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
      for (let ti = 0; ti < tN; ti++) {
        const tp = schema.trace[ti];
        if (!Array.isArray(tp) || tp.length < 2) continue;
        if (!_drawSet.has(ti)) continue;   // ARTZIG2 — fragment gate + budget
        if (!_structSet.has(ti) && rnd() > skill.keepP) continue;
        // SCENERY FILTER — the hull decontamination never covered the TRACE:
        // frame-spanning strokes (a backdrop edge, a table line) drew as big
        // bars straight through her subject (judged on the color-line render).
        // Same rule as the hull: a stroke spanning most of the frame in one
        // axis while staying flat in the other is scenery, not the subject.
        {
          let mnx = 1, mny = 1, mxx = 0, mxy = 0;
          for (const pp of tp) { mnx = Math.min(mnx, pp[0]); mxx = Math.max(mxx, pp[0]); mny = Math.min(mny, pp[1]); mxy = Math.max(mxy, pp[1]); }
          const wSpan = mxx - mnx, hSpan = mxy - mny;
          if ((wSpan > 0.7 && hSpan < 0.08) || (hSpan > 0.7 && wSpan < 0.08)) continue;
        }
        const pts = tp.map(pp => [mapX(pp[0]) + jit(), mapY(pp[1]) + jit()]);
        let ink = traceInk;
        const rc = useRealC ? schema.traceRgb[ti] : null;
        if (Array.isArray(rc)) {
          if (_structSet.has(ti)) {
            // hue his, contrast hers: value-shift the stroke's own color away
            // from the body it sits on. ARTZIG2 — the lighten side LERPS
            // toward white (hue-preserving); the old ×1.6+46 pushed orange
            // strokes to YELLOW (channel clipping distorts hue — judged as
            // garish yellow webbing on the doodle render).
            ink = bodyLum > 120
              ? [clamp255(rc[0] * 0.45), clamp255(rc[1] * 0.45), clamp255(rc[2] * 0.45)]
              : [clamp255(rc[0] + (255 - rc[0]) * 0.55), clamp255(rc[1] + (255 - rc[1]) * 0.55), clamp255(rc[2] + (255 - rc[2]) * 0.55)];
          } else {
            ink = [clamp255(rc[0] * 0.75), clamp255(rc[1] * 0.75), clamp255(rc[2] * 0.75)];
          }
        }
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
    // NEONKILL (2026-08-21) — reported: neon pink was being used for an animal
    // that is nothing like it; colours must be matched correctly rather than
    // defaulting to one hot tint. When the definition names NO color, the body is a
    // NEUTRAL sketch tone: an honest "I don't know its colors yet". Her pink
    // is identity ink for labels and accents, never a claim about a subject's
    // color. The real palette takes over the moment she LOOKS at the thing.
    const body = attr.colors[0] || [142, 132, 118];
    const dark = [Math.round(body[0] * 0.55), Math.round(body[1] * 0.55), Math.round(body[2] * 0.55)];
    const green = [70, 150, 60];
    // Sometimes she draws MORE THAN ONE — a plural ask means several of the subject.
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

  // IMAGINATIVE DRAWING — she must be able to IMAGINE as well, drawing things
  // she has not seen, open-ended and dynamically unbounded. She draws from her OWN
  // HEAD by COMPOSING drawable concepts into one invented scene (a dragon AND a
  // castle; a thing that has no single reference). OPEN-ENDED: each part is grounded
  // recall → provisional → LOOK IT UP (fetch a reference she's never seen), so she
  // can imagine + draw combinations she has NOT literally seen — infinite, dynamic,
  // sourced from her stream of thought (see _imagineAndDraw). Assembles real traced
  // parts — NOT field-morphing (blending two percepts = the banned noise). Only
  // DRAWABLE (noun) parts. Needs ≥2 or it declines (honest — no fake combination).
  // SLOW (may fetch) → always call DETACHED (background), never awaited in the tick.
  // IMAGINATION = A GENUINELY NEW IMAGE (ruled 2026-07-16: "chicken and sand are
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
  //
  // ⛔⛔ SUPERSEDED 2026-10-20 — THAT DESIGN MADE HER "IMAGINATION" A RECREATION.
  //   Sending "a and b together in one unified scene" to the image engine and
  //   redrawing the result means every `canvas:imagine:` frame was a copy of a
  //   picture SOMETHING ELSE made — the opposite of what the label promised,
  //   and the viewer's legend called it "pure imagination". The same fetch is
  //   also the lane that published uniform fields as solid green walls.
  //   The operator's requirement now: she draws "things she's never seen
  //   before based off experience".
  // ⭐ So the lane composes from what she has LEARNED instead: the combination
  //   goes through `_drawOwnCreation`, which redraws every subject stroke by
  //   stroke from its own shape schema and composes them into ONE scene —
  //   shared backdrop, ground shadows, occlusion — in a hand she picks by mood.
  //   No reference is fetched and no prior image is placed anywhere, so this is
  //   NOT the 2026-07-16 collage either: that pasted earlier pictures' fields
  //   into regions; this draws every subject anew.
  // ⚠ An invention needs at least TWO subjects she has a schema for. When only
  //   one of them can be drawn, what she made is an ordinary drawing of a thing
  //   she has seen, and it keeps the `canvas:own:` label that says exactly that
  //   — a label must never claim invention for a recreation.
  // ⛔⛔ AND THAT WAS STILL A COLLAGE (superseded 2026-11-23). Drawing each
  //   subject from its own schema into its own box puts her old drawings side
  //   by side — judged a collage of single images labelled as something new.
  //   Two things placed next to each other are two things.
  // ⭐ INVENTION IS FUSION. Her thought supplies the ingredients; the ideas
  //   JOIN into ONE new thing — a quality onto a subject, a substance with it,
  //   a place around it, or a kind of it (one noun naming a kind of another).
  //   HOW two words join is read from
  //   WordNet's own categories (`fuseRole`), never from a list, so every
  //   combination her thinking produces has a form.
  //   Then the whole chain a person has: her IMAGE CORTEX paints the idea as
  //   ONE picture (her own renderer); her EYE accepts it only if two
  //   independent paintings agree (it is a coherent thing, not noise); she
  //   LEARNS its silhouette and colours under its own name, never over the
  //   plain subject; her HAND draws it from that learned shape; and her eye
  //   judges the drawing against it before anyone sees it.
  // ⚠ Paced by the same look lane as every other look (one in the pipe, the
  //   30 s gap, the VRAM gate, chat priority). A look that is skipped is an
  //   honest decline; an idea she has already learned draws with no look.
  async _drawImagined(concepts) {
    if (!this.mindSpace || typeof this.mindSpace.sketch !== 'function') return null;
    const _ist = (typeof this._imageEngine === 'function') ? this._imageEngine() : null;
    let tax = null;
    try { tax = this._drawTaxonomy || (this._drawTaxonomy = require('../drawable-taxonomy.js')); } catch { tax = null; }
    if (!tax || typeof tax.fuseRole !== 'function') return null;
    const words = [];
    for (const c of (Array.isArray(concepts) ? concepts : [])) {
      const w = (typeof this._vmContentWords === 'function' ? (this._vmContentWords(c)[0] || '') : String(c || '').toLowerCase());
      if (w && !words.includes(w)) words.push(w);
    }
    // HEAD — the thing the new picture is OF. A THING (animal, object,
    // person, plant…) heads before a substance, a substance before a place: a
    // thing found in a place is a kind of that thing, never the place. A word
    // that DESCRIBES (a colour, a state) is never the head — it joins one.
    // Within one role the LATER word heads — English compounds are head-final.
    let head = '';
    for (const want of ['kind', 'stuff', 'place']) {
      for (const w of [...words].reverse()) {
        if (tax.fuseRole(w) !== want || tax.drawableVerdict(w) !== 'concrete') continue;
        if (typeof this._conceptIsDrawable === 'function' && !(await this._conceptIsDrawable(w))) continue;
        head = w; break;
      }
      if (head) break;
    }
    if (!head) { if (_ist) _ist.inventionsDeclined = (_ist.inventionsDeclined | 0) + 1; return null; }
    // INGREDIENTS — every other word that can join it, with the way it joins.
    const quality = [], kind = [], place = [], stuff = [];
    for (const w of words) {
      if (w === head || head.startsWith(w) || w.startsWith(head)) continue;
      const role = tax.fuseRole(w);
      // A thing, place or substance joins only if it is itself something she
      // could draw — the same gate the head passes (it cross-examines grammar,
      // which is what refuses "must", a modal verb WordNet files as a noun).
      if ((role === 'kind' || role === 'place' || role === 'stuff') && typeof this._conceptIsDrawable === 'function') {
        let ok = false;
        try { ok = await this._conceptIsDrawable(w); } catch { ok = false; }
        if (!ok) continue;
      }
      if (role === 'quality') quality.push(w);
      else if (role === 'kind') kind.push(w);
      else if (role === 'place') place.push(w);
      else if (role === 'stuff') stuff.push(w);
    }
    // Her own choice of which ingredients to use and how many (1 or 2), drawn
    // from her seeded generator so it is reproducible from her saved state.
    const r = (tag) => this._rand('fuse-' + tag);
    const pick = (arr) => arr.length ? arr[Math.floor(r('pick') * arr.length) % arr.length] : null;
    const pre = [];
    let tail = '';
    const q = pick(quality); if (q) pre.push(q);
    // A place or substance word can sit BEFORE the subject as a kind of it or
    // AROUND it as where / with — her generator picks, so the same ingredients
    // fuse differently.
    const k = pick(kind.concat(place, stuff).filter(w => !pre.includes(w)));
    if (k && (pre.length === 0 || r('second') < 0.5)) {
      // ⛔ A THING IN FRONT OF A THING IS A MASH-UP unless English has that
      // word ("fire truck", "sea lion", "birdhouse" — WordNet lemmas). "ant
      // bunny", "chicken ant", "penguin lion" were what this made. A place or a
      // substance that cannot lead goes AROUND the subject ("lion in a field"),
      // which is always a real scene; a kind that cannot lead is dropped.
      const _leads = typeof tax.knownCompound === 'function' && tax.knownCompound(`${k} ${head}`);
      const _canTail = place.includes(k) || stuff.includes(k);
      if (_canTail && (!_leads || r('tail') < 0.5)) tail = (place.includes(k) ? ' in ' : ' with ') + k;
      else if (_leads) pre.push(k);
    }
    if (!tail && pre.length < 2) {
      const t2 = pick(place.concat(stuff).filter(w => !pre.includes(w)));
      if (t2 && r('third') < 0.5) tail = (place.includes(t2) ? ' in ' : ' with ') + t2;
    }
    if (pre.length === 0 && !tail) { if (_ist) _ist.inventionsDeclined = (_ist.inventionsDeclined | 0) + 1; return null; }
    const idea = (pre.join(' ') + ' ' + head + tail).trim();
    this._lastFusedIdea = { idea, head, at: Date.now() };
    // IMAGE CORTEX + EYE — one new picture of the idea, accepted only on agreement.
    const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
    const held = store && store.get(idea);
    if (!(held && held.rec) && typeof this._fetchReferenceAndGround === 'function') {
      let rec = null;
      // A relation (in / with) is painted as a scene — the study framing would
      // erase the place or the substance; a quality or a kind keeps the study
      // framing, which is what her eye learns a single silhouette from.
      // A quality or kind keeps the study framing but names its HEAD instead
      // of "object, centered": measured on six pinned seeds, "centered" put the
      // subject inside a painted circle in one of six, and naming the head
      // ("of the whole <head>") in none — a framed disc is what her eye then learns.
      let promptOverride;
      try {
        const { EYE_STYLE } = require('./eye-style.js');
        promptOverride = tail
          ? `${idea}, ${EYE_STYLE.fuseScene}`
          : `${idea}, ${EYE_STYLE.photoPerson} of the whole ${head}${EYE_STYLE.refTail}`;
      } catch { promptOverride = undefined; }
      // ⚠ A "does the picture hold every thing in the idea" check was built
      // and REMOVED the same day: her percept is one whole-picture vector, raw
      // percepts of any two pictures scored ~1.00, and centred on a small
      // memory they swung to -1.00 — it refused five of six correct pictures.
      // Telling that a picture contains BOTH things of an idea needs her to
      // recognise parts within a picture, which she cannot yet; that is an
      // open board item, not something to fake here.
      try { rec = await this._fetchReferenceAndGround(idea, { keyOverride: idea, lookTwice: true, promptOverride }); } catch { rec = null; }
      if (!rec) { if (_ist) _ist.inventionsDeclined = (_ist.inventionsDeclined | 0) + 1; return null; }
      // She looks at what she imagined for a beat before drawing it.
      const HOLD = Number(process.env.DREAM_LOOKUP_HOLD_MS) || 4500;
      this._lookupHoldUntil = Date.now() + HOLD;
      await new Promise(res => setTimeout(res, HOLD));
    }
    // HAND — she draws the ONE new thing from the shape she learned of it.
    let made = null;
    try { made = await this._drawOwnCreation(idea, { fusedKey: idea, allowFetch: false }); } catch { made = null; }
    if (!made || !made.rec) { if (_ist) _ist.inventionsDeclined = (_ist.inventionsDeclined | 0) + 1; return null; }
    const comboKey = idea.replace(/\s+/g, '+');
    const drew = [idea];
    const drawn = made.rec;
    // ⛔⛔ A FLAT FIELD IS NOT A PICTURE, AND PUBLISHING ONE PAINTS HER EYE SOLID
    //   GREEN. Measured 2026-10-20 on the live brain: every `canvas:imagine:`
    //   frame carried FOUR non-zero coefficients out of a 500/150/150 keep
    //   budget, all four at the same quantized magnitude — one DC term plus
    //   padding artefacts, i.e. a UNIFORM field. Reconstructed through the real
    //   transform it is rgb(0,135,0) across 100% of 65,536 pixels, because
    //   neutral chroma in this codec is 0.5 and a DC near 0.3 reads as a full
    //   negative chroma shift: R and B clamp to zero and only green survives.
    //   ⭐ Nothing downstream is at fault — the same `stylizeField` fed a real
    //   field returns ~9,700 non-zero coefficients, and every CPU-rendered
    //   frame (`mindspace-sketch`) measured rich while every one of these
    //   (`mindspace-donor`) measured flat. The INPUT was blank.
    // ⚠ The gate is the one this file already trusts everywhere else
    //   (`DREAM_REF_MIN_DETAIL`, the "a blank plate is not a look" floor) —
    //   applied here to the OUTPUT, which was the one publish path that never
    //   checked. A decline is already this function's documented behaviour for
    //   every other failure: "Can't ground → honest decline (null), never a
    //   collage, never a fake." A green wall is a fake.
    if (typeof this._recDetail === 'function') {
      const _detail = this._recDetail(drawn);
      if (_detail < (Number(process.env.DREAM_REF_MIN_DETAIL) || 200)) {
        try {
          const _st = (typeof this._imageEngine === 'function') ? this._imageEngine() : null;
          if (_st) _st.flatImagines = (_st.flatImagines | 0) + 1;
        } catch { /* counter is best-effort; the refusal is not */ }
        if (!this._flatImagineLogAt || Date.now() - this._flatImagineLogAt > 60000) {
          this._flatImagineLogAt = Date.now();
          console.log(`[MindSpace] imagined field for "${comboKey}" came back FLAT (${_detail} live coefficients, floor ${Number(process.env.DREAM_REF_MIN_DETAIL) || 200}) — refusing to publish a uniform frame. Her eye keeps the last real picture.`);
        }
        return null;   // honest decline — never a green wall
      }
    }
    // Same "<subjects>:<style>" shape as `canvas:own:`, so the viewer can name
    // the hand and an accept credits it — but the PREFIX says invention.
    if (_ist) _ist.inventions = (_ist.inventions | 0) + 1;
    const styleName = made.style || 'poster';
    this._lastSketchLabel = 'canvas:imagine:' + comboKey + ':' + styleName;
    try { console.log(`[OwnArt] ★ INVENTED "${idea}" in ${String(styleName).toUpperCase()} — one new thing fused from her thoughts, imagined as one picture, learned, and drawn by her own hand.`); } catch { /* nf */ }
    return { ...made, rec: drawn, label: this._lastSketchLabel, source: this._lastSketchLabel, imagined: true };
  },

  // Fire an imaginative drawing from her STREAM OF THOUGHT — open-ended + dynamic to
  // infinity, by ruling. Candidate concepts are the drawable nouns across her current +
  // recent inner-thoughts (an infinite, ever-changing source — "what a person might
  // want to draw" = what she's turning over in her head), NOT a fixed list. Picks a
  // couple, composes them via _drawImagined (which look-up-grounds parts she hasn't
  // seen), and publishes the canvas:imagine frame. DETACHED from the tick (it may
  // fetch) so it never freezes the viewer; guarded so parts don't storm the fetcher.
  // ⛔⛔ THE THOUGHT CHAIN ALONE IS NOT "AN INFINITE, EVER-CHANGING SOURCE" —
  // ⛔⛔ IT IS FROZEN FOR THE WHOLE PRE-SPEECH PERIOD, WHICH IS MOST OF THE WALK.
  //
  // Measured 2026-10-29 on a live resume boot: 13 of 13 inventions were THE SAME
  // THREE WORDS, permuted — `poison + apple + cherry` ×7, `cherry + poison +
  // apple` ×3, `apple + cherry + poison` ×3. The operator saw it as "stuck on
  // it... no creativity, no exercising of logic", and he was reading the
  // mechanism correctly.
  //
  // CAUSE: `_innerThoughtChain` gains entries from exactly three writers — her
  // own inner-voice emission, operator chat input, and image prompts. Her inner
  // voice cannot emit until `word_motor` fires, and on that boot
  // `wordMotorEverFired` was 0 with `emitAttempts` 0. So the chain could not
  // advance from her own thinking, and `_imagineRotate` below was rotating the
  // start of a FIXED list. ⭐ The permutations are the signature: a rotation
  // working perfectly on a frozen input.
  //
  // ⚠ And it SURVIVES A RESTART, so it does not self-clear: the chain is saved
  // (brain-server.js, `innerThoughtChain`) and restored on any resume whose sem
  // region is the same size — which a same-budget Savestart always is.
  //
  // FIX — and deliberately NOT a fallback (there is no "if the chain is empty"
  // branch here; a fallback would make her creativity silently change shape
  // depending on whether she had spoken). The candidate pool is simply DEFINED
  // correctly: what she is turning over in her head is her recent thoughts AND
  // THE SHAPES SHE HAS LEARNED TO DRAW. The second half is the part that was
  // missing, and it is the half that always moves — she banks a new schema every
  // time she looks something up, 27+ of them inside five minutes on that boot
  // against the chain's three words.
  //
  // ⭐ It also fixes the OTHER half of what he reported ("just red and black orbs
  // of different number"): a word with no schema falls to the definition-recipe
  // path, which draws colour masses rather than forms. Every concept sourced
  // here has `schema.parts`, so by construction the subjects have real traced
  // shapes instead of dictionary colours.
  //
  // ⚠ Map order IS recency — the evictor (visual-memory.js) takes
  // `store.keys().next().value` as the OLDEST, so the tail is the newest. No
  // timestamp field is needed and none is invented.
  //
  // ⛔ THE SCAN IS BOUNDED BECAUSE THE STORE IS LAZY. Only ~2k of up to 25,000
  // entries are resident; `get()` on a cold key loads it from sqlite. Walking
  // every key to test for a schema would pull the whole store into RAM one row
  // at a time, on a tick. The newest `DREAM_IMAGINE_POOL_SCAN` keys are both the
  // cheap ones and the right ones.
  //
  // RE-PRICE (no gate is removed or weakened — `_conceptIsDrawable`, the ≥2
  // requirement, the in-flight guard and every per-concept cooldown all stand):
  // the imagine TICK RATE is unchanged, so this adds no throughput cost. Fetches
  // should DROP, because she now proposes words she already holds schemas for
  // instead of words from a sentence she may never have seen.
  async _imagineAndDraw() {
    if (typeof this._drawImagined !== 'function') return;
    // FROZENCHAIN — this session's thoughts only (see `_currentThoughts`).
    const chain = Array.isArray(this._innerThoughtChain) ? this._innerThoughtChain : [];
    const texts = this._currentThoughts();
    const pool = texts.slice(-4).join(' ');
    const toks = (typeof this._vmContentWords === 'function') ? this._vmContentWords(pool) : [];
    const cand = [];
    for (const t of toks) if (t && !cand.includes(t)) cand.push(t);
    // The shapes she has learned, newest first — the half of her mental contents
    // that keeps moving while she cannot yet speak.
    const SCAN = Number(process.env.DREAM_IMAGINE_POOL_SCAN) > 0 ? Number(process.env.DREAM_IMAGINE_POOL_SCAN) : 48;
    const KEEP = Number(process.env.DREAM_IMAGINE_POOL_KEEP) > 0 ? Number(process.env.DREAM_IMAGINE_POOL_KEEP) : 24;
    let learnedAdded = 0;
    try {
      const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
      if (store && typeof store.keys === 'function') {
        // EYEPOOL — half the scan is her newest shapes, half is drawn from
        // EVERYTHING she holds, so old memories come back into her imagination
        // instead of the pool being only ever the newest two dozen.
        const all = this._vmAllKeys();
        const keys = [];
        for (let j = 0; j < SCAN / 2 && j < all.length; j++) keys.push(all[Math.floor(this._rand('imagine-pool-sample') * all.length)]);
        for (let j = Math.max(0, all.length - SCAN / 2); j < all.length; j++) keys.push(all[j]);
        for (let i = keys.length - 1, scanned = 0; i >= 0 && scanned < SCAN && learnedAdded < KEEP; i--, scanned++) {
          const k = keys[i];
          if (!k || cand.includes(k)) continue;
          // A PEEK, not a load: only "has a learned schema?" is asked here, and a
          // cold `get()` parsed the whole ~4–10 MB entry on the main thread per
          // key — the measured loop stalls behind every inner thought.
          // a row's first peek (before its meta is written) is one SQLite JSON
          // read (~25 ms on a 4 MB entry) — yield so a cold scan never pins
          if ((scanned % 4) === 3) await new Promise((r) => setImmediate(r));
          const pk = (typeof this._vmPeek === 'function') ? this._vmPeek(k) : null;
          if (!(pk && pk.parts > 0)) continue;
          cand.push(k);
          learnedAdded++;
        }
      }
    } catch { /* the pool must never break the tick — her thoughts alone still compose */ }
    // A frozen chain is now a READABLE state rather than something only visible
    // in the artwork — which is how this was found, by the operator looking at
    // her pictures. Published at `ownArt.imaginePool`.
    //
    // ⚠ The age is derived from the chain's own entries rather than from a new
    // stamp, because TWO of the four push sites push a bare STRING and two push
    // `{sentence, seedSource, ts}` — so a timestamp exists for her own thoughts
    // and for operator input, and does NOT exist for the image-prompt pushes.
    // `chainNewestTs: 0` therefore means "no timestamped entry", NEVER "the
    // chain is new". Inventing a single stamp would have required editing all
    // four sites, and a missing one would have read as a frozen chain.
    let newestTs = 0;
    for (const e of chain) {
      if (e && typeof e === 'object' && Number(e.ts) > newestTs) newestTs = Number(e.ts);
    }
    this._imaginePool = {
      fromThoughts: cand.length - learnedAdded,
      fromLearnedShapes: learnedAdded,
      chainDepth: texts.length,
      chainNewestTs: newestTs,
      chainAgeMs: newestTs ? (Date.now() - newestTs) : null,
      at: Date.now(),
    };
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

  // DYNAMIC LABEL STYLE (ruled 2026-07-16: "wheres all the different fonts and styles
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
    // ALTERNATE LETTERFORMS (ruled 2026-07-16: "yes alternat leter forms") — the
    // letter SHAPE itself varies too: block / serif / dots / bubble / tall / wide
    // (styles of her own hand; the printed teacher is a real typeface, and the
    // 5x7 grid this line once contrasted against no longer exists).
    const FONTS = ['block', 'serif', 'dots', 'bubble', 'tall', 'wide'];
    // PLACEMENT (ruled 2026-07-16: "in differnt places on the image to fit so its
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
    // ⚠ The guard no longer asks for `glyphStrokes` — this function stopped
    // calling it. A leftover guard on a dependency that is gone reads as if the
    // dependency still matters, and would silently disable her handwriting on
    // any build where the glyph lane were removed.
    if (!key) return [];

    // ── HER OWN HAND FIRST, AND IT IS NOT A STYLE CHOICE ────────────────────
    //
    // Every letter she has actually LEARNED — looked at as a printed shape,
    // traced, and banked under `letter:<ch>` — is written from her own trace.
    // This is what turns the comment above from a correction back into a
    // description: when she has the alphabet, the words on her drawings really
    // are in her hand.
    //
    // ⛔ NO MIXING AND NO SUBSTITUTION. If she can write the whole label from
    // learned letters, she writes it. If she cannot write ANY of it, nothing is
    // written — the caption is simply absent, which is the honest state for a
    // mind that has not been taught to write yet. A partial word is refused too:
    // stamping the missing letters from the font would put a perfect glyph she
    // has never learned next to one she has, and that is exactly the lie this
    // whole thread started with.
    //
    // ⛔⛔ THE TYPESET CAPTION IS GONE, AND THERE IS NO SWITCH TO BRING IT BACK.
    // The instruction: gut the old automatic text layer entirely — it printed
    // into her mind's eye. It was the mechanism that put perfectly-spelled words on
    // a pre-K drawing and made the code claim a hand she did not have. An env
    // opt-in was written and then removed on that instruction: a flag that
    // restores the lie is still the lie, one boot away.
    //
    // What is left is only her own hand. `glyphStrokes` survives ELSEWHERE and
    // for one purpose — rendering the PRINTED letter she looks at in order to
    // learn its shape. That is the letter in the world, not a caption.
    if (typeof this.handwrittenStrokes !== 'function') return [];
    try {
      const st = (typeof this._labelStyle === 'function') ? this._labelStyle(key)
        : { size: 0.075, anchor: 'bottom-center' };
      const size = Math.max(0.032, st.size || 0.075);
      const MARGIN = 0.04;
      // Measured first so the anchor can be applied to HER width — her letters
      // have individual widths, so the word's extent is not a function of its
      // character count the way a monospaced stamp's was.
      const probe = this.handwrittenStrokes(String(key).slice(0, 14), { size, x: 0, y: 0 });
      if (!probe || probe.wrote === 0 || probe.skipped > 0) {
        // ⚠ Counted, never silent. A caption that is absent because she cannot
        // yet write those letters is a FACT about her training, and a reader has
        // to be able to tell it from a rendering failure. A PARTIAL word is
        // refused too: stamping the letters she lacks would put a glyph she
        // never learned beside one she did, which is the original defect exactly.
        this._labelHand = { wrote: probe ? probe.wrote : 0, skipped: probe ? probe.skipped : 0, refused: true, at: Date.now() };
        return [];
      }
      const wordW = probe.width || 0;
      const wordH = size * 1.05;
      let x, y;
      switch (st.anchor) {
        case 'top-left':     x = MARGIN; y = MARGIN + 0.015; break;
        case 'top-right':    x = 1 - MARGIN - wordW; y = MARGIN + 0.015; break;
        case 'top-center':   x = 0.5 - wordW / 2; y = MARGIN + 0.015; break;
        case 'bottom-left':  x = MARGIN; y = 1 - MARGIN - wordH; break;
        case 'bottom-right': x = 1 - MARGIN - wordW; y = 1 - MARGIN - wordH; break;
        default:             x = 0.5 - wordW / 2; y = 1 - MARGIN - wordH; break;
      }
      x = Math.max(0.012, Math.min(x, Math.max(0.012, 1 - MARGIN - wordW)));
      const hand = this.handwrittenStrokes(String(key).slice(0, 14), { size, x, y, rgb: (st.colors && st.colors[0]) || [226, 224, 230] });
      this._labelHand = { wrote: hand.wrote, skipped: hand.skipped, at: Date.now() };
      return hand.strokes;
    } catch {
      // ⛔ Nothing rather than a font. A failure here means no caption, which is
      // honest; falling back to typeset text would resurrect the exact claim
      // this whole change exists to remove.
      return [];
    }
  },

  // ⛔⛔ THE TYPESET CAPTION BUILDER IS DELETED, NOT PARKED. It computed a
  // monospaced layout and returned `glyphStrokes(label, …)` — the auto-text that
  // printed a perfect word on her mind's eye. The instruction was to gut the old
  // automatic text layer. It is not kept behind a flag and it is not kept as
  // a renamed tombstone: today already produced the lesson that a reader for a
  // record nobody creates is a dead branch wearing the look of a feature, and a
  // caption path nobody calls would be the same thing with a worse failure mode.
  // The layout logic it owned — auto-fit and anchored placement — lives on in
  // `_labelStrokes` and in `handwrittenStrokes`, measured against HER letter
  // widths instead of a fixed advance per character.
  // (the 28-line typeset layout that stood here is gone — see above)

  // _stylizeStrokes — REMOVED (ruled 2026-07-15). It recolored EACH traced stroke a
  // hash-random goth warm/cool hue — that per-stroke rainbow WAS the "jumbled pile
  // of multicolored yarn". Superseded: traceLineArt draws ONE coherent chalk ink,
  // traceColorFill fills from the real image colours. No per-stroke recolor.

  // DRAW.2 SCHEMA STAMP — REMOVED (ruled 2026-07-15). The developmental
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

  // DRAW.5 _drawPracticeBump — RETIRED (ruled 2026-07-16 audit): its only caller was
  // the retired white-ink practice loop; the layout-hash it fed died with the old
  // schema composer. No-vestigial.

  // DRAW.8 — full-resolution canvas, always (the old grade-gated 96..512 ladder
  // was ripped out per the zero-dumbing directive).
  _drawCanvasSide() {
    // ZERO DUMBING (ruled 2026-07-15: "rip out BOTH gates ... K quality == PhD
    // quality, zero intentional limits"). NO grade cap on canvas resolution — every
    // drawing renders at the full canvas regardless of grade. Her drawing quality is
    // her FULL capability, not gated by how far she's walked. (env override for a
    // smaller box if ever needed.)
    //
    // ⭐ CRYSTAL — 512 -> 1024. The comment above called 512 "the sketch ceiling"
    // and it stopped being one: the ceiling is MAX_LINE (2048), and 512 was a
    // stale default nobody re-priced after her schemas started keeping her FULL
    // VECTOR TRACE (up to ~260 strokes with fine contours). Cramming that trace
    // into 512² is where the fine detail died. RE-PRICED on a 260-stroke canvas
    // before changing it — 512²: 452 ms / 277,790 coefficients / 1,085 KB;
    // 1024²: 1,378 ms / 620,295 / 2,424 KB; 2048²: 4,878 ms / 1,295,291 / 5,075 KB.
    // 1024 buys 2× the linear detail for 3× worker time, and `sketch` is PROXIED
    // to the mind-space worker so that time is never an event-loop block.
    return Number(process.env.DREAM_DRAW_CANVAS) || 1024;
  },

  // Is this a DRAWABLE concept? DYNAMIC — works for ANY word including never-seen
  // ones, NO hardcoded word list (ruled 2026-07-15: "it has to be dynamic for never
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
    const w = (typeof this._vmContentWords === 'function') ? (this._vmContentWords(word)[0] || '') : String(word || '').toLowerCase().trim();
    if (!w || w.length < 2) return false;
    // ARTJUDGE 🚫 — the operator taught her this word is not a drawing
    // subject; that verdict outranks every other judge.
    try { if (this._artBanSet().has(w)) return false; } catch { /* ban set best-effort */ }
    // A DRAWING SUBJECT IS A REAL WORD — a dictionary must know it. Wikipedia
    // and Urban Dictionary answer for names, places and typos, so she was
    // drawing strings that are not words ("alquife").
    if (!require('../definition-service.js').isRealWord(w)) return false;
    // HER OWN EXPERIENCE OUTRANKS THE DICTIONARY. When she has LOOKED at this
    // word and the look held no subject — nothing her eye could find a body
    // in, so no skeleton was learned — that is what the word turned out to be
    // for her, whatever a lexicon says about its rarest sense. `skeleton ===
    // null` is that recorded verdict; an absent field (a schema banked before
    // skeletons existed) is no evidence either way.
    try {
      // A peek (the row's few-byte meta), never a full load of the entry.
      const pk = (typeof this._vmPeek === 'function') ? this._vmPeek(w) : null;
      if (pk && pk.skel === -1) return false;
    } catch { /* store unreadable — the other judges stand */ }
    // STYLEBLEED (2026-08-29) — reported: one recurring full-screen neon-green
    // reference kept being looked up and then tainted every image it was
    // combined with. SELF-CONTAMINATION guard, by PROVENANCE not
    // opinion: a subject whose content words ALL come from her own
    // code-authored style vocabulary ("color", "crisp", "saturated"...) is her
    // prompt talking to itself, not a thought — WordNet honestly calls those
    // words concrete (a crisp is a potato chip) so the taxonomy cannot catch
    // them. The set derives from the SAME eye-style.js strings the prompt
    // builders consume, so the guard and the tails can never drift apart. A
    // phrase with any non-style word ("crisp apple") passes on its own merits.
    try {
      const styleSet = require('./eye-style.js').styleWords();
      const toks = String(word || '').toLowerCase().split(/[^a-z'-]+/).filter(t => t.length > 2);
      if (toks.length && toks.every(t => styleSet.has(t))) return false;
    } catch { /* provenance guard best-effort */ }
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
      // A word English uses as something OTHER than a thing ("no", "want",
      // "first", "here", "well") is not a subject, whatever one rare noun sense
      // says — those were looked up, rendered as studio jewellery, and drawn
      // as orbs. Judged by WordNet's own per-part-of-speech corpus counts.
      if (typeof this._drawTaxonomy.otherPosLeads === 'function' && this._drawTaxonomy.otherPosLeads(w)) return false;
      // what the word MOSTLY means must be a thing ("second" = time, "south" =
      // a direction, "way" = a manner), not merely one rare sense of it
      if (typeof this._drawTaxonomy.primaryIsThing === 'function' && this._drawTaxonomy.primaryIsThing(w) === false) return false;
      // a word English uses mostly to DESCRIBE ("white", "round", "second") is a
      // quality, not a subject — real corpus usage per part of speech
      if (typeof this._drawTaxonomy.describerLeads === 'function' && this._drawTaxonomy.describerLeads(w)) return false;
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
          // a dictionary lists a word's main use FIRST: an unattested noun whose
          // entry leads with another part of speech ("must" → verb) is that
          if (xdefs.length && String(xdefs[0].partOfSpeech || '').toLowerCase() !== 'noun') return false;
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
      const pk = (typeof this._vmPeek === 'function') ? this._vmPeek(w) : null;
      if (pk && pk.parts > 0) return true;
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
  // (ruled 2026-07-16 audit). The practice loop rendered the memory as WHITE-INK
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
    if (this._rand('spontaneous-image') > 0.15) return;   // rare even when eligible
    this._lastSpontaneousImgAt = now;
    // ⛔⛔ NO FALLBACKS (2026-09-02) — THE SUBJECT NOW COMES FROM WHAT SHE WAS
    // ACTUALLY THINKING, not from a random draw.
    //
    // This used to read `_sampleCurrentVocab()`: a uniform random pick out of
    // her whole trained vocabulary. The comment directly below it — kept, and
    // still right — says a spontaneous image is HER URGE about HER OWN THOUGHT
    // and that a canned subject is "a script wearing her name". A random word
    // from a word list is exactly that; the guard was being fed the very thing
    // it was written to refuse, so the tick manufactured an urge whenever she
    // had none.
    //
    // The emission bus is the single source of truth for what she has been
    // saying and thinking, and it carries timestamps. A spontaneous image now
    // rides a RECENT emission of her own — image-generation entries excluded so
    // she cannot loop on her own prompts — and if she has not said or thought
    // anything inside the window, there is no urge and no image.
    let concept = '';
    try {
      const _c = this.cortexCluster;
      const _recent = (_c && typeof _c.getRecentEmissions === 'function') ? _c.getRecentEmissions(8) : [];
      for (const e of _recent) {
        if (!e || typeof e.text !== 'string') continue;
        if (typeof e.source === 'string' && e.source.startsWith('image-gen')) continue;
        if (typeof e.ts === 'number' && (now - e.ts) > GAP) continue;   // stale thought is not an urge
        const _w = e.text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
        if (_w.length > 0) { concept = _w[_w.length - 1]; break; }
      }
    } catch { /* nf */ }
    // TU.29.7 — she composes this prompt too (concept + her associations + her
    // mood), instead of the retired canned template.
    // NO FALLBACK SUBJECT (operator law) — a spontaneous image is HER urge
    // about HER OWN thought. Nothing recent in her own voice = she has nothing
    // to say = no image this tick. A canned subject — goth aesthetic, shapes,
    // anything — is a script wearing her name, not her thought.
    if (!concept) return;
    const prompt = this._composeImagePrompt(concept);
    if (this.clients && this.clients.size > 0) {
      const payload = JSON.stringify({ type: 'generate_image', prompt, spontaneous: true, seed: 'drive', ts: now });
      for (const [ws] of this.clients) { if (ws.readyState === ws.OPEN) { try { ws.send(payload); } catch { /* nf */ } } }
    }
    // SPEAK.6b learning loop — she remembers the image she chose to make.
    try {
      const _c = this.cortexCluster;
      if (_c && typeof _c.pushEmission === 'function') _c.pushEmission({ source: 'image-gen-spontaneous', text: prompt, ts: now });
      // (Not pushed into her thought chain: a render prompt is not a thought.)
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
    // WORDSALAD.1g — KEEP THE DIGITS. This sanitizer used to be `[^a-zA-Z' -]`,
    // which deleted every number and every comma from the request: "3 black cats"
    // became "black cats" and "1920s speakeasy" became "s speakeasy". The damage
    // was already known — the selfie path is routed AROUND this whole function
    // because it ate the literal "25 year old" out of her self-portrait identity
    // (see the note at the _detectImageRequest call site) — but working around it
    // for one caller left every other image request silently losing its numbers.
    // Fixed at the source: digits carry counts, years, ages and sizes, and the
    // comma is the prompt language's own separator. The class stays a strict
    // allow-list (no injection surface); it simply stops throwing away meaning.
    const base = String(request || '').replace(/[^a-zA-Z0-9' \-,.]/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = base ? [base] : [];
    try {
      const cluster = this.cortexCluster;
      const emb = this.sharedEmbeddings;
      if (cluster && emb && typeof emb.getEmbedding === 'function') {
        // her trained pool — the same gather as _sampleCurrentVocab.
        // GOTCHA.8 (2026-08-27): read the UNIFIED `wordBucketWords` array. The
        // per-subject `wordBucketWords_<subj>` fields have had zero writers
        // since the WMB unify (2026-07-14), so the old loop gathered an empty
        // pool on every current brain and this whole enrichment silently fell
        // through to the definition-set fallback below.
        const pool = [];
        if (Array.isArray(cluster.wordBucketWords)) {
          for (const w of cluster.wordBucketWords) if (typeof w === 'string' && w.length > 1) pool.push(w);
        }
        if (pool.length === 0 && cluster._definitionTaughtWords instanceof Set) {
          for (const w of cluster._definitionTaughtWords) if (typeof w === 'string' && w.length > 1) pool.push(w);
        }
        const reqWords = base.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 2).slice(0, 3);
        if (pool.length > 0 && reqWords.length > 0) {
          const cos = (a, b) => {
            let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
            for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
            const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0;
          };
          // bounded scoring pool so cost stays O(POOL·dim) at any vocab size
          const POOL = 300;
          const sample = pool.length <= POOL ? pool : Array.from({ length: POOL }, () => pool[Math.floor(this._rand('image-prompt-sample') * pool.length)]);
          const picked = new Set(reqWords);
          for (const tok of reqWords) {
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
    // live-affect style tail — equational readout of her state, not cognition.
    // MOODPOP (2026-08-21) — judged and rejected: the mood words were making
    // every image dark and foggy. The look should match her actual character —
    // chaotic and vivid — rather than laying the goth register on so heavily
    // that thousands of images come out dark-tinted and hazy. The old
    // vocabulary ("dark moody"/"eerie"/"hazy surreal")
    // fired fog on nearly every image because her baseline valence sits low.
    // Same state readout, NEW WORDS: crisp, saturated, electric — her chaos is
    // neon-on-black energy, never fog. Every branch keeps "crisp"/"clean"
    // steering so no mood can smear the picture.
    try {
      // STYLEBLEED — the strings live in eye-style.js (byte-identical; the ONE
      // owner the drawability gate derives its provenance set from).
      const { EYE_STYLE } = require('./eye-style.js');
      const style = [EYE_STYLE.moodBase];
      const arousal = (typeof this.arousal === 'number') ? this.arousal : 0.4;
      const valence = (typeof this.valence === 'number') ? this.valence : 0;
      const fear = (typeof this.fear === 'number') ? this.fear : 0;
      if (valence < 0.15) style.push(EYE_STYLE.moodDark);   // dark mood = punchy blacks, not fog
      else style.push(EYE_STYLE.moodBright);
      if (arousal > 0.7) style.push(EYE_STYLE.moodEnergy);
      if (fear > 0.5) style.push(EYE_STYLE.moodFear);
      try { if (typeof this._drugStateLabel === 'function' && this._drugStateLabel() !== 'sober') style.push(EYE_STYLE.moodHigh); } catch { /* sober default */ }
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
    // ⛔ AGEPIN.1 — the local AGE map here was keyed on `'K'`, which the
    // curriculum never emits, so `AGE['kindergarten']` was undefined and the
    // `|| 25` tail fired. Combined with `_computeMinGrade()` returning
    // `'phd'` for the same reason, a five-year-old Unity pictured herself as
    // twenty-five. Now reads the ONE shared map.
    //
    // ⚠ The `|| 25` tail is retained deliberately and is NOT the bug: an
    // absent grade genuinely means no curriculum state (stub / persona
    // default), and the 25-year-old is the correct end-state answer there.
    // The bug was reaching that tail while a real grade existed.
    return GRADE_AGE[normalizeGradeKey(g)] || 25;
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
    // show-me-object routing: a bare "show me <thing>!" is a visual ask even without
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
      // WORDSALAD.1b — AGE-WRONG GARMENTS, not just nudity. The strip above only
      // ever removed EXPOSURE words, so a request naming fishnets, a corset or a
      // leather mini skirt passed straight through onto a six-year-old's
      // self-portrait. The age rule: no adult garments at kindergarten age —
      // those pieces belong to later grades. Adult garments are
      // removed below 18; the mature-but-covered teen pieces are allowed from 14.
      const ADULT_GARMENT_RE = /\b(fishnets?|corsets?|bustiers?|tube top|leather (?:skirt|dress|pants|outfit|corset)|garter|stockings|heels|stilettos|micro ?skirt|crop top)\b/g;
      const TEEN_GARMENT_RE = /\b(mini ?skirt|choker|ripped (?:jeans|tights)|combat boots|band tee)\b/g;
      if (age < 18) {
        scene = scene.replace(EXPLICIT_RE, ' ').replace(ADULT_GARMENT_RE, ' ');
        if (age < 14) scene = scene.replace(TEEN_GARMENT_RE, ' ');
        // Dangling-filler cleanup. Widened for WORDSALAD.1b: removing a GARMENT
        // (rather than an exposure word) strands articles as well as connectors
        // — "in a leather skirt" was left as "in a" — so the trailing run of
        // connectors, wear-verbs, articles and prepositions is dropped as a
        // chain, not one word.
        scene = scene
          // a wear-verb orphaned by the strip and now sitting in front of a
          // place/preposition ("wearing fishnets at the mall" → "wearing at the
          // mall") reads as broken English to the generator; drop the verb.
          .replace(/\b(wearing|wear|dressed)\b\s+(?=(at|in|on|with|near|by|outside|inside)\b)/g, ' ')
          // same shape one level up: the garment's own preposition + article are
          // stranded when the garment goes ("in a band tee at a concert" →
          // "in a at a concert"). Drop the orphaned pair, keep the real clause.
          .replace(/\b(in|with|on|wearing)\s+(a|an|the)\b\s+(?=(at|in|on|with|near|by|outside|inside)\b)/g, ' ')
          .replace(/\b(and|or|wearing|wear|dressed|in|with|on|at|a|an|the)\b(?=\s*(\b(and|or|in|with|on|at|a|an|the)\b\s*)*$)/g, ' ')
          .replace(/[\s,]+/g, ' ').trim();
      }
      const noun = age < 13 ? 'goth girl' : (age < 18 ? 'goth teen girl' : 'goth woman');
      const CORE = age + ' year old ' + noun + ', black hair with hot pink streaks, sharp features, intense dark eyes';
      // a real girl doesn't live in ONE outfit — when the ask doesn't name her
      // wear, she picks from her own goth wardrobe (varied per request, all
      // canonically her). The old single fixed OUTFIT string made every
      // self-image wear the same black leather forever.
      //
      // WORDSALAD.1b — BANDED BY AGE. This used to be ONE flat list of eight
      // adult outfits picked with a bare `Math.random()`, applied at every age:
      // at grade 1, where `_selfImageAge()` correctly returns 6, every
      // self-portrait had a 1-in-8 chance each of fishnets, a corset dress, a
      // crop top or leather. The age system was already right — only this list
      // was ungated. Operator's ladder: "normal school girl look till highschool
      // ... fishnets and tube tops are later".
      //
      // She is goth-LEANING as a child (black, monsters, Halloween) and goth-
      // IDENTIFYING as a teen, which is the same progression her Tier 3 anchors
      // now follow — taste first, identity claim later, adult style at 18.
      const WARDROBE_CHILD = [
        'black t-shirt and jeans, purple sneakers',
        'black hoodie and leggings, scuffed sneakers',
        'plaid school skirt, dark tights and a cardigan',
        'black long sleeve shirt with a cartoon bat, jeans',
        'dark purple dress with black leggings',
        'school uniform with a black backpack',
        'striped black and grey sweater, jeans',
      ];
      const WARDROBE_TEEN = [
        'black band tee and ripped jeans',
        'oversized black hoodie and dark jeans',
        'plaid skirt with black tights and combat boots',
        'black long sleeve and a choker, dark jeans',
        'black flannel over a band tee, boots',
        'dark grey sweater dress and black tights',
      ];
      const WARDROBE_ADULT = [
        'black leather outfit, pink undertones',
        'black band tee and ripped jeans',
        'black lace top and a choker',
        'oversized black hoodie and fishnets',
        'black corset dress and combat boots',
        'black crop top and plaid mini skirt',
        'black velvet dress and silver jewelry',
      ];
      const WARDROBE = age < 14 ? WARDROBE_CHILD : (age < 18 ? WARDROBE_TEEN : WARDROBE_ADULT);
      // MOODPOP — the CORE noun already carries her identity; the tail only
      // steers image quality: crisp + rich color, never smeared, no aesthetic
      // doubling (the aesthetic term is not to be added a second time)
      const TAIL = require('./eye-style.js').EYE_STYLE.chatTail;   // STYLEBLEED — one owner
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
      const outfit = hasWear ? '' : ', ' + WARDROBE[Math.floor(this._rand('self-image-wardrobe') * WARDROBE.length)];
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
      console.log('[Brain] 💤 inner-voice paused — dream window in progress (no inner thoughts while she sleeps; dream-phenomenology continues on its own lane).');
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

    // ── INTRO.2 — THE INWARD LANE. Rumination needs no listener, so this is
    // where an inward gap surfaces: the inner voice, which is already the
    // lane for thinking at herself.
    //
    // ⛔ Arming does NOT produce a question. It sets the same gap record the
    // curiosity path already consumes, so the words come from her trained
    // interrogative transitions through `questionMode` — or she stays
    // silent, exactly as before. Nothing here templates a sentence.
    //
    // ⚠ Only the INWARD lane is taken here. An outward gap is relational and
    // needs a turn; surfacing it on the inner voice would produce something
    // that talks to itself in your face, which is the precise failure
    // INTRO.2 exists to prevent.
    try {
      if (typeof this.armIntrospectiveAsk === 'function') this.armIntrospectiveAsk('inward');
    } catch { /* introspection must never break the inner voice */ }

    // Dream-window branch (114.19fd): gate already passed; fire showcase but
    // skip real generation so consolidation + K_VOCAB Hebbian have CPU
    // priority during the dream window. Showcase samples already-learned
    // vocabulary so popups + log keep streaming Unity's actual learned
    // state through the 15-40 min K_VOCAB background-trickle (iter25-M.7).
    if (this._operatorSleepRequested) {
      // ⛔ NO STAND-IN THOUGHTS (operator: "NO FALLBACKS"). A GloVe-assembled
      // vocab sample used to be shown here as her inner voice while she slept.
      // It was never her thinking. Asleep, the inner voice is quiet.
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
    // during any reconnect window (ruled 2026-07-14 root-cause fix).
    const _gpuProxyLive = !!(this.cortexCluster && this.cortexCluster._gpuProxyReady === true);
    // ── GPUGEN (2026-08-25) — HER INNER VOICE IS ON BY DEFAULT NOW ───────────
    //
    // This used to require an EXPLICIT opt-in as its final term
    // (`DREAM_INNERVOICE_GPU_GEN === '1' || _readFanoutProven`), and nobody
    // ever set either — so at biological scale the compose path was permanently
    // skipped and every inner thought fell through to the GloVe vocab showcase.
    // That showcase is not a thought (see OWNWORDS.3), which means she has
    // effectively had no inner voice at scale at all.
    //
    // ⛔ THE SAFETY TERMS ARE UNTOUCHED AND THEY ARE THE REAL GUARD. The reason
    // this gate exists is that one compose word-tick CPU-propagates the main
    // cortex (~57s/word at 460M neurons) and a 156s freeze trips the donor's
    // 150s idle timeout. `_donorsPresent` and `_gpuProxyLive` are what prevent
    // that — and `_gpuProxyLive` specifically covers the reconnect window where
    // a donor is counted but its re-upload has not finished. An env flag was
    // never the thing keeping the loop safe; it was just an extra lock on a
    // door that was already bolted.
    //
    // Operator decision 2026-08-25: enable, then verify on the live box.
    // `DREAM_INNERVOICE_GPU_GEN=0` remains the kill switch.
    const _gpuGenAvailable = process.env.DREAM_INNERVOICE_GPU_GEN !== '0'
      && _donorsPresent
      && _gpuProxyLive;
    if (_gpuGenAvailable && _cortexNeurons > _innerVoiceMaxNeurons && !this._gpuGenLoggedOnce) {
      this._gpuGenLoggedOnce = true;
      try { process.stdout.write(`[Brain] 🧠 inner-voice GPU generation ENABLED — ${this._communityDonorCount} donor(s) + DF.7 fan-out; real composeSentence runs on donor GPUs (cap ${_innerVoiceMaxNeurons.toLocaleString()} bypassed for cortex ${_cortexNeurons.toLocaleString()}).\n`); } catch { /* non-fatal */ }
    }
    if (!_gpuGenAvailable && _cortexNeurons > _innerVoiceMaxNeurons && process.env.DREAM_INNERVOICE_FORCE_CPU !== '1') {
      // ⛔⛔ NO STAND-IN THOUGHTS (operator, 2026-11-25: "NO FUCKING FALLBACK").
      // This branch used to show a GloVe-assembled vocab sample ("theater moved
      // until") as her inner voice whenever her real compose could not run —
      // every reconnect window after every press. It was never her thinking.
      // Now: while the card cannot carry her compose, the inner voice is quiet,
      // and says so once in the log.
      this._innerVoiceHeldCount = (this._innerVoiceHeldCount || 0) + 1;
      if (!this._innerVoiceHeldNotedAt || (now - this._innerVoiceHeldNotedAt) > 60000) {
        this._innerVoiceHeldNotedAt = now;
        try { process.stdout.write(`[Brain] 🧠 inner voice quiet — her compose needs the card (donors=${this._communityDonorCount || 0}, proxyLive=${_gpuProxyLive}); no stand-in is shown. ${this._innerVoiceHeldCount} quiet tick(s) since boot.\n`); } catch { /* nf */ }
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

      // ── INNERTHINK — a CONCEPT-SEEDED thought reads TRAINED pathways
      // instead of free compose. Free composition is her weakest production
      // (gate: PROD 18% / STUDENT 2.6% vs READ 88-100%), which is why the
      // popups read as word salad; but a definition she holds and an
      // association she has bound are things she genuinely KNOWS today —
      // the same class of trained-weight read that fixed the chat question
      // lane. Only the k-vocab-recent seed slot routes here (1 of 7 in the
      // rotation), per-concept cooldown inside, and a trained-read tick
      // REPLACES the compose tick — never runs in addition to it. Every
      // other seed class falls through to think() untouched: free compose
      // keeps being exercised and grows with the walk.
      if (seed && seed.source === 'k-vocab-recent' && seed.word) {
        try {
          const tt = await this._trainedConceptThought(seed.word);
          if (tt && tt.text) {
            this._lastInnerThoughtEmittedAt = now;
            try { process.stdout.write(`[Brain] 🧠 inner-thought (${tt.kind}: "${seed.word}") "${tt.text}"\n`); } catch { /* non-fatal */ }
            // These are reads of her own weights — unlike the GloVe showcase
            // (OWNWORDS.3), they ARE hers, so they feed the bus and the chain.
            const _c = this.cortexCluster;
            if (_c && typeof _c.pushEmission === 'function') {
              try { _c.pushEmission({ source: 'inner-voice', text: tt.text, ts: now, intent: seed.word }); } catch { /* push non-fatal */ }
            }
            if (!Array.isArray(this._innerThoughtChain)) this._innerThoughtChain = [];
            this._innerThoughtChain.push({ sentence: tt.text, seedSource: tt.kind, ts: now });
            while (this._innerThoughtChain.length > 8) this._innerThoughtChain.shift();
            if (this.clients && this.clients.size > 0) {
              const payload = JSON.stringify({
                type: 'innerThought',
                word: tt.text.split(/\s+/)[0] || '',
                sentence: tt.text,
                seed: 'trained-read',
                seedLabel: `${tt.kind} of "${seed.word}" — read from her trained weights`,
                ts: now,
              });
              for (const [ws] of this.clients) {
                if (ws.readyState === ws.OPEN) { try { ws.send(payload); } catch { /* non-fatal */ } }
              }
            }
            return;
          }
        } catch { /* trained read is best-effort — free compose below runs as before */ }
      }

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
        // ⛔⛔ NO STAND-IN (operator 2026-11-25: "NO FUCKING FALLBACK"). This
        // used to fill an empty compose with a sampled-vocabulary "showcase" so
        // the popups never went quiet — which is exactly why her inner voice read
        // as three random words: whenever she produced nothing, a sample spoke
        // for her. An empty compose is now an empty thought, and the SILENT line
        // above says why.
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
    // GOTCHA.8 (2026-08-27) — read the UNIFIED `wordBucketWords` array.
    // The per-subject `wordBucketWords_<subj>` fields this used to loop have
    // had zero writers since the WMB unify (2026-07-14), so on every current
    // brain the showcase pool was empty and this function lived off its
    // SEED-phase definition fallback below — permanently, not just pre-cell.
    const candidates = [];
    if (Array.isArray(cluster.wordBucketWords)) {
      for (const w of cluster.wordBucketWords) {
        if (typeof w === 'string' && w.length > 0) candidates.push(w);
      }
    }
    if (candidates.length > 0) {
      return candidates[Math.floor(this._rand('thought-candidate-pick') * candidates.length)];
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
      return arr[Math.floor(this._rand('thought-candidate-pick') * arr.length)];
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
    // GOTCHA.8 (2026-08-27) — read the UNIFIED `wordBucketWords` array (the
    // per-subject fields have had zero writers since the WMB unify; the old
    // loop gathered nothing on every current brain, leaving this permanently
    // on its definition fallback).
    const candidates = [];
    if (Array.isArray(cluster.wordBucketWords)) {
      for (const w of cluster.wordBucketWords) {
        if (typeof w === 'string' && w.length > 0) candidates.push(w);
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
      return candidates[Math.floor(this._rand('thought-candidate-pick') * candidates.length)];
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
    const lengthPick = this._rand('thought-length');
    const wordCount = lengthPick < 0.5 ? 2 : (lengthPick < 0.85 ? 3 : 4);
    const seed = candidates[Math.floor(this._rand('thought-candidate-pick') * candidates.length)];
    const phrase = [seed];
    const picked = new Set(phrase);
    const emb = this.sharedEmbeddings;
    if (emb && typeof emb.getEmbedding === 'function' && candidates.length > wordCount) {
      const POOL = 200;
      const pool = [];
      for (let i = 0; i < Math.min(POOL, candidates.length); i++) {
        pool.push(candidates[Math.floor(this._rand('thought-candidate-pick') * candidates.length)]);
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
        const pick = scored[Math.floor(this._rand('thought-candidate-pick') * Math.min(3, scored.length))];
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
    // ⛔⛔ CAPABILITY BEFORE RHYTHM — THE GATE KNEW *WHEN* SHE SHOULD THINK AND
    // NEVER ASKED WHETHER SHE *COULD*.
    //
    // Measured on the box during a fresh walk: `inner-voice think() took 6082ms
    // / 6391ms / 5782ms / 6274ms / 6556ms`, firing roughly every 8 seconds, each
    // one lining up with an `[EventLoop] BLOCKED ~3000ms` — and the line beside
    // it read `🧠 inner-thought SILENT — wordsBucketed=0, bucketSubjects=0,
    // passedCells=0`. She was spending most of the wall clock in `generateAsync`
    // to discover, every time, that she has no word she can emit.
    //
    // ⭐ IT IS PROVABLE THAT NOTHING CAN COME OUT, which is why this is a
    // capability check and not a fallback. Both output paths need bucketed
    // words: matrix generation reads the word-motor buckets, and the
    // never-silent showcase samples those same buckets — the showcase's own
    // comment says so ("When no training has landed yet (truly fresh brain),
    // still silent — sampling returns null, showcase-broadcast skips"). With
    // zero words, zero passed cells and zero active subGrades, the entire path
    // is a guaranteed no-op that costs seconds of the teach loop.
    //
    // ⚠ SAME TEST THE CHAT SILENCE-GATE ALREADY USES (`isFresh`), through the
    // same primitive, so the two lanes cannot drift into disagreeing about
    // whether she can speak. `getTrainedCapability()` is documented as "All
    // numbers — no probing, no GPU dispatches … safe to call on every chat turn
    // / popup tick / heartbeat", so the pre-check costs ~6 lookups against the
    // ~6 seconds it avoids.
    //
    // ⛔ NOT A SILENT DISABLE. It announces itself once when it starts skipping
    // and once when it resumes, counts what it skipped, and re-arms
    // automatically the instant she buckets her first word — a training feature
    // that turns itself off quietly is the exact thing this ledger keeps paying
    // for.
    try {
      const _cap = (this.cortexCluster && typeof this.cortexCluster.getTrainedCapability === 'function')
        ? this.cortexCluster.getTrainedCapability() : null;
      if (_cap && (_cap.wordsBucketed | 0) === 0
        && (_cap.passedCellCount | 0) === 0
        && (_cap.subGradesActive | 0) === 0) {
        this._innerVoiceMuteSkips = (this._innerVoiceMuteSkips || 0) + 1;
        if (!this._innerVoiceMutedNoWords) {
          this._innerVoiceMutedNoWords = true;
          console.log('[Brain] 🔇 inner-voice HELD — she has no word she can emit yet (wordsBucketed=0, passedCells=0, subGrades=0), and both the matrix path and the vocabulary showcase need one. Each attempt was costing seconds of the teach loop to produce silence. It re-arms by itself the moment the first word is bucketed.');
        }
        return false;
      }
      if (this._innerVoiceMutedNoWords) {
        this._innerVoiceMutedNoWords = false;
        console.log(`[Brain] 🔊 inner-voice RESUMED — first word(s) bucketed (${_cap ? _cap.wordsBucketed : '?'} words, ${_cap ? _cap.passedCellCount : '?'} cells passed). ${this._innerVoiceMuteSkips || 0} attempt(s) were held while she had nothing to say.`);
      }
    } catch { /* a capability read must never take the inner voice down */ }

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

    return this._rand('inner-thought-emit') < p;
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
    // A WORD SHE MET AND HAS NOTHING FOR comes first: she wonders about that
    // word, by name. Otherwise she wonders now and then about something she
    // only half holds — base curiosity ~12%, lifted by arousal.
    const waiting = (Array.isArray(this._wordsToAskAbout) && this._wordsToAskAbout.length) ? this._wordsToAskAbout[0] : null;
    if (!waiting) {
      const drive = 0.12 + 0.18 * Math.max(0, Math.min(1, this.arousal ?? 0.5));
      if (this._rand('curious-question') > drive) return false;
    }
    const concept = waiting || this._pickEpistemicGap();
    if (!concept) return false;
    let composed = null;
    // She speaks of it in the feeling of not knowing — the feeling the
    // questions in her own reading were taught in. `unsure` rides in each
    // state the line is spoken from; nothing is switched on the cluster.
    try {
      composed = await cluster.composeSentence(concept, {
        questionMode: true,
        unsure: true,
        intentConcept: concept,
        coherenceCandidates: this._curriculumInProgress ? 1 : 2,   // donor-drop fix — rerank is idle-only
        ...this._affectDecoder(),   // temperature + topK from live affect/chemical state
      });
    } catch { composed = null; }
    const sentence = composed && composed.sentence ? composed.sentence.trim() : '';
    if (!sentence) {
      // Nothing came: she does not ask this time, and the word goes to the
      // back so one word cannot hold the others up.
      if (waiting) { this._wordsToAskAbout.shift(); this._wordsToAskAbout.push(waiting); const st = this._newWordStats; if (st) st.askFailed = (st.askFailed || 0) + 1; }
      return false;
    }
    if (waiting) this._wordsToAskAbout.shift();
    this._pendingQuestionIsNewWord = !!waiting;
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
   * Queue a word she met and does not know, to be taken in on the lane that
   * teaches between teach calls (`kind: 'newWord'` → `Curriculum._meetNewWord`).
   * `opts.told` — the words of an answer, when someone told her what it means.
   * Bounded with the queue it rides; a word already waiting is not queued twice.
   */
  _queueNewWord(word, opts) {
    const w = typeof word === 'string' ? word.toLowerCase().replace(/[^a-z']/g, '') : '';
    if (!w || w.length < 2) return false;
    if (!Array.isArray(this._chatTeachJobQueue)) this._chatTeachJobQueue = [];
    const q = this._chatTeachJobQueue;
    if (q.some((j) => j && j.kind === 'newWord' && j.word === w && !(opts && opts.told))) return false;
    const st = this._newWordStats || (this._newWordStats = { met: 0, lookedUp: 0, asked: 0, toAsk: 0, noAnswer: 0, last: null });
    // The lane is shared with her other chat-time lessons. A full lane turns
    // THIS word away (she will meet it again) — it does not push out a lesson
    // of another kind that was already waiting.
    if (q.length >= 32) { st.laneFull = (st.laneFull || 0) + 1; return false; }
    q.push({ kind: 'newWord', word: w, opts: opts || {} });
    st.queued = (st.queued || 0) + 1;
    return true;
  },

  /**
   * Notice the words of something said to her that she does not hold, and
   * queue each to be taken in. At most a few a line, so one long message does
   * not fill the lane.
   */
  _noticeNewWords(text) {
    const cur = this.curriculum;
    if (!cur || typeof cur._holdsWord !== 'function' || typeof text !== 'string') return 0;
    const seen = new Set(); let n = 0;
    for (const w of this._plainWords(text)) {
      if (w.length < 2 || seen.has(w)) continue;
      seen.add(w);
      if (cur._holdsWord(w)) continue;
      // a word she already judged to be of another language is not looked at again
      const _refused = this.cortexCluster && this.cortexCluster._wordsRefused;
      if (_refused instanceof Map && _refused.has(w)) continue;
      if (this._queueNewWord(w)) n++;
      if (n >= 4) break;
    }
    return n;
  },

  /**
   * Everything she holds about words she took in herself, in the shape it is
   * saved in beside her weights. Without the last three a word she kept but
   * was never told the meaning of comes back from a restart looking known,
   * and is never asked about again.
   *   newWordsTakenIn      [word, how, when, doubted]
   *   wordsMeaningUnknown  words she holds without a meaning
   *   newWordsHeld         words she holds on purpose (so she can say them)
   *   wordsToAskAbout      words waiting to be asked about, in order
   */
  _newWordStateForSave() {
    const cortex = this.cortexCluster || {};
    return {
      newWordsTakenIn: cortex._newWordsTakenIn instanceof Map
        ? Array.from(cortex._newWordsTakenIn, ([w, v]) => [w, v && v.how, v && v.at, !!(v && v.doubted)]) : [],
      wordsMeaningUnknown: cortex._wordsMeaningUnknown instanceof Set ? Array.from(cortex._wordsMeaningUnknown) : [],
      newWordsHeld: cortex._newWordsHeld instanceof Set ? Array.from(cortex._newWordsHeld) : [],
      wordsToAskAbout: Array.isArray(this._wordsToAskAbout) ? this._wordsToAskAbout.slice(0, 16) : [],
    };
  },

  /** Put back what `_newWordStateForSave` wrote. A file from before any of it was saved leaves that part as it is. */
  _newWordStateRestore(saved) {
    const cortex = this.cortexCluster;
    if (!cortex || !saved) return;
    if (Array.isArray(saved.newWordsTakenIn)) {
      const m = new Map();
      for (const e of saved.newWordsTakenIn) {
        if (!Array.isArray(e) || typeof e[0] !== 'string') continue;
        const v = { how: typeof e[1] === 'string' ? e[1] : 'looked up', at: Number(e[2]) || Date.now() };
        if (e[3] === true) v.doubted = true;
        m.set(e[0], v);
      }
      cortex._newWordsTakenIn = m;
    }
    const strs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x) : null);
    const unk = strs(saved.wordsMeaningUnknown); if (unk) cortex._wordsMeaningUnknown = new Set(unk);
    const held = strs(saved.newWordsHeld); if (held) cortex._newWordsHeld = new Set(held);
    const ask = strs(saved.wordsToAskAbout); if (ask) this._wordsToAskAbout = ask.slice(0, 16);
  },

  /**
   * The words of a line, each whole: split where there is space, the
   * punctuation around a word dropped, lower case. A word that has any
   * character left that is not a–z or an apostrophe is LEFT OUT whole — a word
   * written with letters outside English is not cut into pieces that look like
   * words (and a number, a link, an address is not a word).
   */
  _plainWords(text) {
    const out = [];
    for (const raw of String(text || '').toLowerCase().split(/\s+/)) {
      const w = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (w && /^[a-z']+$/.test(w)) out.push(w.replace(/^'+|'+$/g, ''));
      else if (w && /[^\x00-\x7f]/.test(w)) { const st = this._newWordStats; if (st) st.notEnglishSeen = (st.notEnglishSeen || 0) + 1; }
    }
    return out.filter(Boolean);
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
      const idx = recentStart + Math.floor(this._rand('epistemic-gap-pick') * Math.max(1, arr.length - recentStart));
      const word = arr[Math.min(idx, arr.length - 1)];
      if (typeof word === 'string' && word.length > 1) return word;
    }
    return null;
  },

  /**
   * INNERTHINK — one trained-pathway read about a concept she was taught.
   * Two forms, 50/50, both emitting only HER words:
   *   • definition-bound thought — `_emitDefinition` composes from the
   *     definition she holds via her own word_motor reads. ⚠ Called with
   *     `teach: false`: its inline Hebbian bind is walk-lane-legal from the
   *     gate but would be a CONCURRENT TEACHER from this tick.
   *   • association recall — inject the concept into sem, settle, one
   *     `emitWordDirectDonor` read: one word she has genuinely bound to it.
   * Returns { text, kind } or null (nothing confident → the caller's free
   * compose runs as before). Per-concept cooldown so their rotation stays
   * varied; `_currentGateSubject` saved/nulled/restored — it is set at gate
   * start and never cleared, so outside a gate it is stale and would
   * mis-scope the word_motor band of the read.
   */
  async _trainedConceptThought(word) {
    const c = this.cortexCluster;
    const w = String(word || '').toLowerCase().trim();
    if (!c || !w) return null;
    if (!this._conceptThoughtAt) this._conceptThoughtAt = new Map();
    const GAP = Number(process.env.DREAM_THOUGHT_CONCEPT_GAP_MS) >= 0
      ? Number(process.env.DREAM_THOUGHT_CONCEPT_GAP_MS) : 600000;
    if ((Date.now() - (this._conceptThoughtAt.get(w) || 0)) < GAP) return null;
    if (this._conceptThoughtAt.size > 512) this._conceptThoughtAt.clear();   // bounded, cheap reset
    const curric = this.curriculum;
    const savedGateSubject = curric ? curric._currentGateSubject : null;
    if (curric) curric._currentGateSubject = null;
    try {
      if (this._rand('concept-thought-define') < 0.5 && curric && typeof curric._emitDefinition === 'function') {
        try {
          const t = await curric._emitDefinition(w, { teach: false, timeoutMs: 3000 });
          const text = t ? String(t).trim() : '';
          if (text) {
            this._conceptThoughtAt.set(w, Date.now());
            return { text, kind: 'definition-bound thought' };
          }
        } catch { /* fall through to the recall read */ }
      }
      if (typeof c.emitWordDirectDonor === 'function'
          && this.sharedEmbeddings && typeof this.sharedEmbeddings.getEmbedding === 'function') {
        try {
          const emb = this.sharedEmbeddings.getEmbedding(w);
          if (emb && emb.length && typeof c.injectEmbeddingToRegion === 'function') {
            c.injectEmbeddingToRegion('sem', emb, 0.5);
            for (let t = 0; t < 3; t++) { try { await c.stepAwait(0.001); } catch { break; } }
          }
          const r = (await c.emitWordDirectDonor({})) || '';
          const lw = String(r).toLowerCase().trim();
          if (lw && lw !== w) {
            this._conceptThoughtAt.set(w, Date.now());
            return { text: lw, kind: 'association recall' };
          }
        } catch { /* nothing confident this tick */ }
      }
      return null;
    } finally {
      if (curric) curric._currentGateSubject = savedGateSubject;
    }
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
      let seedWord = null;   // INNERTHINK — the concept word rides the seed so the trained-read lane can use it
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
            const k = keys[Math.floor(this._rand('inner-seed-pick') * keys.length)];
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
            const idx = recentStart + Math.floor(this._rand('inner-seed-pick') * (arr.length - recentStart));
            const word = arr[idx];
            if (typeof word === 'string' && word.length > 0) {
              label = `thinking about ${word}`;
              pattern = this._computeServerCortexPattern(label);
              seedWord = word;   // INNERTHINK — carried on the seed
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
      if (pattern) return { pattern, source, label, word: seedWord };
    }
    // All four sources empty (truly fresh brain, no episodes, no anchors,
    // no learning context). Return null pattern so generateAsync falls
    // through to baseline cortex state. Genuine silence is OK here.
    return { pattern: null, source: 'baseline', label: 'baseline cortex state' };
  },

  // ── ONE PROCESS, the last mile — HER VOICE FROM HER PROCESS ──────────────
  // (ruled 2026-07-17: "what the fuck, she still drops the doner connection
  // every time she speaks" + "its all gpu now right? voice, minds eye and the
  // brain! one unified system".) Listener browsers used to synthesize every
  // reply themselves (per-visitor onnxruntime worker) — on the operator's
  // machine that shared silicon with the compute donor, and one stale cached
  // tab could grab WebGPU and kill the donation whenever she spoke. Now the
  // reply's voice is synthesized by HER process — the voice worker thread
  // (`VoiceSynthProxy` → unity-voice-v2 on loopback) — and the viewer
  // receives her field-A equations (a few KB) to reconstruct + play.
  // Fire-and-forget: the text reply already shipped; a failed synth = a
  // silently text-only reply, never a delayed one.
  async _voiceLane(ws, text) {
    try {
      if (!text || typeof text !== 'string' || !ws || ws.readyState !== 1) return;
      // ONE synthesizer (2026-10-18): the donor `voiceSynth` dispatch is gone
      // with piper — a donor carries no voice model any more and answers that
      // op `retired`, so asking it only bought a 60 s wait before the real
      // lane. Her voice is the v2 worker on her own machine, every time.
      if (!this._voiceSynth) {
        const { VoiceSynthProxy } = require('./voice-synth.js');
        this._voiceSynth = new VoiceSynthProxy();
      }
      const feel = this._voiceFeel(text);
      const out = await this._voiceSynth.synthesizeRec(text, feel);
      if (out && out.rec && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'voice', text, rec: out.rec, sampleRate: out.sampleRate || out.rec.sampleRate || 24000,
          feel: { emotion: feel.emotion, intensity: feel.intensity, speechAct: feel.speechAct },
        }));
      }
    } catch { /* voice is best-effort — the text reply already landed */ }
  },

  // ── HOW SHE SOUNDS — read from HER STATE, never from the words ────────────
  // unity-voice-v2 takes {emotion, intensity, speech_act}. The EMOTION and the
  // INTENSITY come from what her body is doing at the moment she speaks:
  //
  //   amygdala   this.valence (reward − fear, blended), this.arousal (the
  //              settled attractor, EMA'd, clamped [0.3, 1]), this.fear (a
  //              sigmoid — 0.5 is its zero, not its floor)
  //   endocrine  this.endocrine.speechModulation() — the ten chemicals'
  //              deviations already projected onto speech axes (warmth,
  //              speechRate, emotionalOverflow, pauses …). ⛔ That method is
  //              documented as THE ONLY way endocrine state reaches her voice,
  //              and this is where it reaches it.
  //   cortex     prediction error against its own 32-tick history — surprise
  //              is a SELF-RELATIVE quantity, the way Ψ is read as deviation
  //              from its own recent average and never as an absolute.
  //
  // ⛔ No word-list classifier anywhere in here. A table deciding she sounds
  // "frustrated" because the sentence contains a certain word would be the
  // banned shape and a lie besides — her chemistry is computed every tick and
  // is the ground truth. The SPEECH ACT is the one thing read off the text,
  // and only off the FORM she herself produced: her terminator, the shared
  // WH-frame parser (`NeuronCluster.extractIntentConcept`, the single source
  // chat and curriculum both use), and WordNet attestation for whether her
  // first word leads as a verb (her imperative form). No word list there
  // either.
  //
  // Every constant below is derived in docs/THRESHOLD-DERIVATION.md
  // (§"Voice feel"), not picked. `intensity` is a STRENGTH in [0, 1]; the
  // worker places it inside the model's own trained window for that
  // (emotion, act), read from voice-meta.json — so nothing here knows or
  // hardcodes 0.25 / 0.85, and a retrain widens the range by itself.
  _voiceFeel(text) {
    // ⛔⛔ THE TWO VALENCE CONSTANTS BELOW WERE DERIVED FROM A BROKEN CEILING,
    // AND THE SOURCE THEY WERE DERIVED FROM NO LONGER EXISTS.
    //
    // Both were computed against a `valence` that was a hardcoded ±0.1 step on
    // reward's sign plus a ±0.01 dice roll — the constant has been deleted and
    // the amygdala attractor is the sole writer now. So: there is no longer a
    // "±0.008 noise floor", because the injected randomness that produced it is
    // gone; and the old ceiling of 0.296 cannot be reached or even approached by
    // the same route.
    //
    // ⚠ This is the consumer-breakage the valence work was warned about, and it
    // is a FOURTH consumer that the filing listed nowhere — it named the
    // amygdala input, the plasticity term and the blend weight. Her VOICE reads
    // valence too. Left unexamined, `VALENCE_FULL = 0.3` against a signal whose
    // ceiling moved to 1.0 would have pinned her delivery at full strength for
    // any moderate feeling.
    //
    // DEADBAND: kept at 0.03 on purpose rather than re-derived. Its justifying
    // noise floor is gone, so the number no longer means what its old comment
    // said — but the readout's sensitivity grew ~7×, which makes a fixed 0.03 a
    // SMALLER fraction of the usable range than before, so keeping it can only
    // reject more noise and never suppress more signal. That is the safe
    // direction while the real distribution is unmeasured.
    // One band shared with her named mood, so what she sounds like and what
    // she is said to feel can never land on opposite sides of neutral.
    const VALENCE_DEADBAND = Number.isFinite(this._moodNeutralBand) ? this._moodNeutralBand : 0.03;   // ⚠ derivation VOID (see above) — conservative until re-derived
    const AROUSAL_HIGH = 0.4;        // of the headroom ABOVE her baseline (0.9 → 1.0): +0.04 absolute
    const AROUSAL_LOW = -0.3;        // of the room BELOW it (0.9 → 0.3): −0.18 absolute
    const SURPRISE_HIGH = 0.5;       // prediction error 50% above its own 32-tick mean
    const SURPRISE_MILD = 0.2;       // 20% above — novelty she notices without startling
    const FEAR_CONCERN = 0.6;        // sigmoid zero 0.5 + 0.1 (the margin the arousal EMA cannot cross on noise)
    const WARMTH_MIN = 0.15;         // = oxytocin deviation 0.30 × its warmth weight 0.50 (a real release, not a flicker)
    const RATE_STRESS = 0.2;         // speechRate: adrenaline 0.45×dev — dev ≥ 0.44 (a SAM-axis event, not drift)
    // VALENCE_FULL: re-derived by the SAME method as before — the formula's own
    // ceiling — which is the only part of the old derivation worth keeping.
    // `valence ← valence·0.8 + amyOut.valence·0.2` is an EMA, so its steady
    // state equals its input, and `amyOut.valence = reward − fear` is a
    // difference of two sigmoids, each in (0, 1). The reachable bound is
    // therefore |valence| → 1, and the aggression multiplier is explicitly
    // clamped to the same [-1, 1]. Ceiling 1.0, not 0.296.
    //
    // ⚠ This is the ALGEBRAIC ceiling, not her measured range, and the
    // difference matters: the harness fixed point sits near |valence| 0.05, so
    // on this normaliser valence will drive her voice only weakly at first.
    // That is the deliberate direction of error — under-expression is
    // recoverable, every utterance pinned at maximum intensity is not — and
    // `intensity` takes the MAX across drivers, so arousal, surprise and fear
    // still carry her delivery meanwhile. The practical normaliser needs her
    // post-fix valence distribution, which requires a boot, and inventing it
    // from pre-fix samples would be fitting a constant to a signal that was
    // ~91% dice roll.
    const VALENCE_FULL = 1.0;        // the formula's own ceiling, re-derived; ⚠ practical normaliser owed on measured data

    const now = Date.now();
    const p = this.persona || {};
    const base = Number.isFinite(p.arousalBaseline) ? p.arousalBaseline : 0.9;
    const ar = Number.isFinite(this.arousal) ? this.arousal : base;
    // Excursion from HER baseline, normalised to the room on each side so
    // "high" means the same thing whether the persona floor is 0.9 or 0.5.
    const aN = ar >= base
      ? (ar - base) / Math.max(1e-6, 1 - base)
      : (ar - base) / Math.max(1e-6, base - 0.3);
    // Her voice carries her MOOD, not this tick's flicker: a person still
    // sounds hurt a few minutes after being hurt. The lingering valence is the
    // same quantity her mood is named from, so the voice and the named mood
    // cannot disagree about whether she feels good or bad.
    const val = (this.mood && Number.isFinite(this.mood.valence))
      ? this.mood.valence
      : (Number.isFinite(this.valence) ? this.valence : 0);
    const fear = Number.isFinite(this.fear) ? this.fear : 0.5;

    const cc = this.cortexCluster;
    let surprise = 0;
    if (cc && Number.isFinite(cc._lastPredictionError)
        && Array.isArray(cc._predictionErrorHistory) && cc._predictionErrorHistory.length >= 8) {
      const h = cc._predictionErrorHistory;
      let s = 0; for (const x of h) s += x;
      const mean = s / h.length;
      surprise = mean > 1e-9 ? (cc._lastPredictionError / mean) - 1 : 0;
    }

    let mod = null;
    try {
      mod = (this.endocrine && typeof this.endocrine.speechModulation === 'function')
        ? this.endocrine.speechModulation(now) : null;
    } catch { mod = null; }
    const warmth = mod && Number.isFinite(mod.warmth) ? mod.warmth : 0;
    const overflow = mod && Number.isFinite(mod.emotionalOverflow) ? mod.emotionalOverflow : 0;
    const rate = mod && Number.isFinite(mod.speechRate) ? mod.speechRate : 0;

    const pos = val > VALENCE_DEADBAND;
    const neg = val < -VALENCE_DEADBAND;
    let emotion;
    if (surprise >= SURPRISE_HIGH && aN >= 0) emotion = 'surprised';
    else if (neg && (aN >= AROUSAL_HIGH || rate >= RATE_STRESS)) emotion = 'frustrated';
    else if (neg && fear >= FEAR_CONCERN) emotion = 'concerned';
    else if (neg && aN <= AROUSAL_LOW) emotion = 'sad';
    // Negative at mid arousal: emotional overflow (cortisol up / serotonin
    // down) is the sad reading; without it the negative is a worry.
    else if (neg) emotion = overflow > 0 ? 'sad' : 'concerned';
    else if (pos && aN >= AROUSAL_HIGH) emotion = 'excited';
    else if (warmth >= WARMTH_MIN && aN < AROUSAL_HIGH) emotion = 'warm';
    else if (pos && surprise >= SURPRISE_MILD) emotion = 'amused';
    else if (pos) emotion = 'happy';
    else if (fear >= FEAR_CONCERN) emotion = 'concerned';
    else emotion = 'neutral';
    // ⛔ NEVER A FEELING NAMED AGAINST ITS OWN SIGN. Each voiced emotion
    // declares the valence it requires; if a branch above ever lands on one
    // that contradicts her mood, she is voiced neutral rather than wrong. The
    // tree is ordered to make this unreachable today — this line is what keeps
    // it unreachable after the next person edits the tree.
    const _EMO_SIGN = { happy: +1, excited: +1, amused: +1, warm: +1, frustrated: -1, sad: -1, concerned: -1 };
    const _need = _EMO_SIGN[emotion];
    if (_need !== undefined && ((_need > 0 && neg) || (_need < 0 && pos))) emotion = 'neutral';

    // Strength = the strongest normalised driver. `neutral` is trained at
    // exactly 0.00, so it sends 0 — anything else would be a 422.
    const intensity = emotion === 'neutral' ? 0 : Math.max(0, Math.min(1, Math.max(
      Math.abs(val) / VALENCE_FULL,
      Math.abs(aN),
      Math.min(1, Math.max(0, surprise)),
      Math.min(1, warmth / (2 * WARMTH_MIN + 0.2)),   // 0.5 = one full oxytocin release
      Math.abs(fear - 0.5) * 2,
    )));

    // The act, from the FORM she produced.
    const t = String(text).trim();
    const last = t.slice(-1);
    let speechAct = 'statement';
    if (last === '?') {
      const ic = (cc && cc.constructor && typeof cc.constructor.extractIntentConcept === 'function')
        ? cc.constructor.extractIntentConcept(t) : null;
      speechAct = (ic && ic !== 'truth') ? 'wh_question' : 'yes_no_question';
    } else if (last === '!') {
      speechAct = 'exclamation';
    } else {
      const first = (t.match(/^[A-Za-z']+/) || [''])[0];
      let imperative = false;
      if (first) {
        try {
          const tax = this._drawTaxonomy || (this._drawTaxonomy = require('../drawable-taxonomy.js'));
          imperative = typeof tax.verbLeads === 'function' && tax.verbLeads(first);
        } catch { imperative = false; }
      }
      if (imperative) speechAct = 'instruction';
      // Soothing is bonding chemistry at or below her resting arousal, said
      // to someone, without a negative valence underneath it.
      else if (warmth >= WARMTH_MIN && aN <= 0 && !neg) speechAct = 'reassurance';
      // `aside` is the inner voice's register, and the inner voice is not
      // voiced — so it is unreachable from here BY DESIGN, not by omission.
    }

    const feel = {
      emotion, intensity: +intensity.toFixed(3), speechAct, at: now,
      drivers: {
        valence: +val.toFixed(3), arousal: +ar.toFixed(3), arousalExcursion: +aN.toFixed(3),
        fear: +fear.toFixed(3), surprise: +surprise.toFixed(3),
        warmth: +warmth.toFixed(3), speechRate: +rate.toFixed(3), emotionalOverflow: +overflow.toFixed(3),
        endocrine: !!mod,
      },
    };
    this._lastVoiceFeel = feel;
    if (!this._voiceFeelCounts) this._voiceFeelCounts = Object.create(null);
    this._voiceFeelCounts[`${emotion}/${speechAct}`] = (this._voiceFeelCounts[`${emotion}/${speechAct}`] | 0) + 1;
    return feel;
  },
};

module.exports = { SERVER_CHAT_MIXIN };
