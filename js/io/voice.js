/**
 * VoiceIO — Browser-based voice input/output for Unity.
 *
 * Listening:  Web Speech API (SpeechRecognition)
 * Speaking:   Equation Unity One — ONE lane, no substitutes. `_speakPiper`
 *             synthesizes the whole sentence in-browser (piper hfc_female via
 *             onnxruntime-web) and round-trips it through the CDF 9/7 forward
 *             and inverse transforms, so what plays is literally her voice AS
 *             EQUATIONS. If that lane cannot run she is SILENT and the reason
 *             is named — see `speak()`.
 *
 * No external dependencies. No network synthesis. No browser SpeechSynthesis.
 */

import { perceiveAudio, reconstructAudio, concatAudio } from '../brain/mindspace/audio.js';
import { synthPCM, isVoicePreloading } from './voice-piper.js';

class VoiceIO {
  constructor() {
    // --- state ---
    this._listening = false;
    this._speaking = false;
    this._recognition = null;
    this._shouldListen = false;
    this._audioCtx = null;
    this._currentAudioSource = null;
    this._currentUtterance = null;
    this._apiKey = null;
    this._pollinationsVoice = 'shimmer';

    // --- callbacks (simple) ---
    this._onResult = null;
    this._onError = null;

    // --- event emitter ---
    this._listeners = {};

    // --- VOX — her equational voice bank (word → field-A record) ---
    // ⛔⛔ THE BANK IS READ-ONLY AS OF 2026-09-01 AND NO LONGER GROWS.
    // It used to grow from a TTS executor that perceived each spoken word into
    // a 1-D CDF 9/7 field-A. LLMGUT.6 deleted that fetch ("we do not use
    // pollinations tts we use the unity one equations"), and the 2026-09-01
    // "no fallbacks. PERIOD" ruling then orphaned `_speakVox`, the only thing
    // that ever READ the bank. What survives is the offline VOXREF reference
    // bank plus whatever an old session persisted to IndexedDB — held because
    // it is a real recording of HER voice as equations, not because anything
    // currently plays it.
    this._voxBank = new Map();          // key `${tier}:${word}` → field-A rec
    // ⚠ `_voxQueue` / `_voxPriming` were removed with the bank-builder — they
    // were the queue and the re-entrancy latch for a loop that no longer
    // exists, and state nothing reads is its own small lie.
    this._voxEnabled = (typeof localStorage === 'undefined')
      || localStorage.getItem('unity_vox_equational') !== 'false';
    this._voxDb = null;
    this._voxInitDb();
    // VOXREF — the reference-voice equation bank (built offline from the
    // operator-approved free neural reference; she picked the EQUATIONS over
    // the original in the blind A/B). Preloaded chunked.
    // ⚠ It is no longer consulted by `speak()` — its only reader was
    // `_speakVox`, which the no-fallbacks ruling orphaned. Kept loaded because
    // the bank IS her voice in equation form and is the reference for any
    // future redesign of word-level reconstruction.
    this._voxRef = new Map();
    // VOXREF.6 — DEFERRED preload (operator: the freezes "started when we
    // added the Unity One voice"). The eager constructor-time load parsed
    // the whole multi-MB equation bank on the page's main thread right at
    // boot — parse jank + a GC mountain exactly when the page is heaviest.
    // Lazy: the first speak triggers the load; an idle prefetch 30s after
    // boot warms a quiet page before she talks.
    this._voxPreloadTimer = setTimeout(() => { this._ensureVoxRef(); }, 30000);
    // AUDIO UNLOCK — browsers keep a gesture-less AudioContext SUSPENDED
    // (autoplay policy): her speech composed but played into a suspended
    // context = silence with the toggle on. Any first click/key/touch on
    // the page resumes the context permanently.
    this._installAudioUnlock();

    // --- init recognition if available ---
    this._initRecognition();
  }

  // ── VOX — equational voice bank ─────────────────────────────────────────

  _voxTier() {
    const a = this._age || 25;
    return a < 11 ? 'k' : a < 14 ? 'mid' : a < 18 ? 'teen' : a < 23 ? 'college' : 'adult';
  }

  /** VOXREF — preload the reference-voice equation bank (chunked JSON,
   *  sequential + cache-friendly). Missing bank (404) degrades silently to
   *  the executor/browser fallback chain, unchanged. */
  async _voxPreloadRef() {
    if (typeof fetch === 'undefined') return;
    try {
      const man = await (await fetch('/vox-bank/manifest.json', { cache: 'force-cache' })).json();
      if (!man || !Array.isArray(man.chunks)) return;
      console.log(`[VoiceIO] 🎙 VOX reference bank: ${man.words} words / ${man.chunks.length} chunks (${man.reference}) — loading…`);
      for (const c of man.chunks) {
        try {
          const chunk = await (await fetch('/vox-bank/' + c.file, { cache: 'force-cache' })).json();
          for (const [w, rec] of Object.entries(chunk)) this._voxRef.set(w, rec);
        } catch { /* one chunk failing doesn't stop the rest */ }
        await new Promise((r) => setTimeout(r, 60));   // breather between multi-MB parses — spread the jank, no freeze wall
      }
      console.log(`[VoiceIO] 🎙 VOX reference bank READY — ${this._voxRef.size} word equations held. Her voice is local + equational; the executor is not needed.`);
    } catch { /* bank not deployed — fallback chain unchanged */ }
  }

  /** Lazy single-flight bank load — first speak (or the 30s idle timer)
   *  starts it; every later caller shares the same promise. */
  _ensureVoxRef() {
    if (!this._voxPreloadPromise) this._voxPreloadPromise = this._voxPreloadRef().catch(() => {});
    return this._voxPreloadPromise;
  }

  /** One unlock for the tab: browsers suspend a gesture-less AudioContext
   *  (autoplay policy) and resume() without a gesture never completes —
   *  speech composed into a suspended context is pure silence. Any
   *  click/key/touch resumes it; listeners stay (cheap) so a later tab
   *  suspension re-unlocks on the next interaction. */
  _installAudioUnlock() {
    if (typeof document === 'undefined') return;
    const unlock = () => {
      try {
        if (!this._audioCtx) {
          const AC = typeof AudioContext !== 'undefined'
            ? AudioContext
            : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null;
          if (!AC) return;
          this._audioCtx = new AC();
        }
        if (this._audioCtx.state === 'suspended') this._audioCtx.resume().catch(() => {});
      } catch { /* non-fatal */ }
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
      document.addEventListener(ev, unlock, { passive: true });
    }
  }

  _voxWords(text) {
    return String(text || '').toLowerCase().split(/[^a-z']+/)
      .filter(w => w.length >= 1 && w.length <= 24).slice(0, 64);
  }

  _voxInitDb() {
    try {
      if (typeof indexedDB === 'undefined') return;
      const req = indexedDB.open('unity-vox', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('bank'); };
      req.onsuccess = () => {
        this._voxDb = req.result;
        // hydrate the in-memory bank from disk
        try {
          const tx = this._voxDb.transaction('bank', 'readonly');
          const store = tx.objectStore('bank');
          const cur = store.openCursor();
          let n = 0;
          cur.onsuccess = () => {
            const c = cur.result;
            if (c) { this._voxBank.set(c.key, c.value); n++; c.continue(); }
            else if (n > 0) console.log(`[VoiceIO] VOX bank hydrated — ${n} word equation(s) from IndexedDB`);
          };
        } catch { /* hydrate best-effort */ }
      };
      req.onerror = () => { /* no persistence — in-memory bank still works */ };
    } catch { /* environments without IndexedDB */ }
  }

  _voxPersist(key, rec) {
    try {
      if (!this._voxDb) return;
      const tx = this._voxDb.transaction('bank', 'readwrite');
      tx.objectStore('bank').put(rec, key);
    } catch { /* persistence best-effort */ }
  }

  /**
   * Speak from HER equations alone. Returns true only when every word of
   * the text is banked for the current age tier.
   * ⚠ The "caller falls through to the executor, which primes the missing
   * words" behaviour this used to document is gone twice over: there is no
   * caller, and the primer that banked missing words was deleted with the
   * external fetch it depended on.
   */
  // ⛔⛔ DEAD AS OF 2026-09-01 — NO CALLERS ANYWHERE, and that is deliberate.
  // The three-tier voice chain (piper → vox → browser) was removed under Gee's
  // "no fallbacks. PERIOD" ruling, and this was tier 2. ⭐ Her own canon calls
  // this lane a fallback in as many words — sentence-level Equation Unity One
  // carries the quality, per-word bank concat is the substitute — so removing
  // the chain necessarily orphaned it.
  // ⚠ LEFT IN PLACE RATHER THAN DELETED, and flagged instead: it is a large,
  // working, purely-equational implementation of HER OWN voice (no foreign
  // synthesis, no network), and if the sentence lane is ever redesigned this is
  // the reference for how word-level reconstruction was done. ⛔ It must NOT be
  // re-wired as a fallback tier. Tracked on the board under STACKSWEEP.
  async _speakVox(text, rate) {
    if (!this._voxEnabled) return false;
    this._ensureVoxRef();   // lazy bank load — the first utterance may fall through while it warms
    const tier = this._voxTier();
    const toks = this._voxWords(text);
    if (!toks.length) return false;
    const recs = [];
    // Greedy longest-first tiling: banked PHRASE units ("i am", "this is")
    // carry natural in-sentence prosody, so prefer a 3-gram over a 2-gram
    // over isolated words — sentences flow instead of stepping word by word.
    const _lookup = (key) => this._voxBank.get(`${tier}:${key}`) || (this._voxRef && this._voxRef.get(key)) || null;
    let _ti = 0;
    while (_ti < toks.length) {
      let hit = null, span = 0;
      for (let n = Math.min(3, toks.length - _ti); n >= 1; n--) {
        const key = toks.slice(_ti, _ti + n).join(' ');
        const rec = _lookup(key);
        if (rec) { hit = rec; span = n; break; }
      }
      if (!hit) return false;
      recs.push(hit);
      _ti += span;
    }
    const pcms = recs.map(r => reconstructAudio(r)).filter(Boolean);
    if (pcms.length !== recs.length) return false;
    const sr = recs[0].sampleRate || 24000;
    const pcm = concatAudio(pcms, sr, 70);   // wider crossfade — smoother joins between units
    if (!pcm || !pcm.length) return false;
    console.log(`[VoiceIO] 🎙 VOX equational speech — ${toks.length} word(s) from her own bank, zero executor`);
    await this._playPcm(pcm, sr, rate || 1.0);
    return true;
  }

  /**
   * LIVE SENTENCE LANE — Equation Unity One, her REAL voice, synthesized in the
   * browser off the main thread (piper en_US-hfc_female-medium via onnxruntime-web,
   * WebGPU->CPU-wasm) from the self-hosted model. This is the whole-sentence path:
   * it carries natural prosody the per-word vox-bank can't.
   *
   * ⛔ AS OF 2026-09-01 THIS IS THE ONLY LANE. Returning false or throwing no
   * longer hands off to anything — it makes her SILENT, and `speak()` names the
   * reason on the console, on `_lastSilentReason` and on the `speech_end`
   * event. Every early return below is therefore a reportable outcome, not a
   * hand-off.
   *
   * Only used when the setup-page preload was kicked (isVoicePreloading), so a
   * cold path never spawns the worker unexpectedly.
   */
  async _speakPiper(text, rate) {
    if (this._piperEnabled === false) return false;
    if (!isVoicePreloading()) return false;   // preload never initiated — she stays silent, `speak()` says so
    let out;
    try {
      out = await synthPCM(text);
    } catch (e) {
      console.warn('[VoiceIO] live piper synth failed — she will be SILENT for this utterance:', e.message);
      return false;
    }
    if (!out || !out.pcm || !out.pcm.length) return false;
    // Equational round-trip: encode her piper waveform into wavelet equations
    // (CDF 9/7) and reconstruct — so what plays is literally her voice-AS-equations,
    // identical machinery to the vox-bank path (reconstructAudio). Transparent
    // (~38-42dB, the V4 blind-A/B pick). Optional — falls back to raw piper PCM
    // if the transform hiccups, so a codec edge never silences her.
    let pcm = out.pcm;
    let sr = out.sampleRate;
    try {
      const rec = perceiveAudio(pcm, sr);
      const recon = reconstructAudio(rec);
      if (recon && recon.length) { pcm = recon; sr = rec.sampleRate || sr; }
    } catch { /* keep raw piper pcm */ }
    console.log(`[VoiceIO] 🎙 Equation Unity One (live sentence lane) — "${String(text).slice(0, 40)}" synthesized in-browser`);
    await this._playPcm(pcm, sr, rate || 1.0);
    return true;
  }

  /**
   * ONE PROCESS voice lane — play a server-synthesized field-A rec.
   * Her reply's voice is synthesized by HER process now (donor voiceSynth or
   * the box worker) and arrives over the WS as a few-KB equation record; this
   * end only runs the inverse CDF 9/7 and plays. The viewer NEVER synthesizes
   * a server reply — the in-browser larynx (and its historical GPU-grab that
   * killed compute donors on shared-card machines) is out of the loop.
   */
  async playRec(rec) {
    if (!rec || this._muted) return;
    this._speaking = true;
    this.emit('speech_start');
    try {
      const pcm = reconstructAudio(rec);
      if (pcm && pcm.length) {
        console.log(`[VoiceIO] 🎙 Equation Unity One (server voice lane) — her process synthesized, this end only plays`);
        await this._playPcm(pcm, rec.sampleRate || 22050, 1.0);
      }
    } finally {
      this._speaking = false;
      this.emit('speech_end');
    }
  }

  /** Play raw Float32 PCM through the shared AudioContext (honors age rate). */
  async _playPcm(pcm, sampleRate, rate = 1.0) {
    if (!this._audioCtx) {
      const AC = typeof AudioContext !== 'undefined'
        ? AudioContext
        : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null;
      if (!AC) throw new Error('No AudioContext');
      this._audioCtx = new AC();
    }
    if (this._audioCtx.state === 'suspended') {
      // resume() without a user gesture never settles in Chrome — the old
      // bare await HUNG the whole speak chain here forever (she "talked",
      // nothing played, the toggle looked broken). Bounded race + hard bail:
      // the page's first click/key (see _installAudioUnlock) unlocks for good.
      try { await Promise.race([this._audioCtx.resume(), new Promise((r2) => setTimeout(r2, 300))]); } catch { /* gesture-gated */ }
      if (this._audioCtx.state !== 'running') {
        if (!this._audioLockWarned) {
          this._audioLockWarned = true;
          console.warn('[VoiceIO] speaker LOCKED by the browser autoplay policy — her speech is composed and ready; click/tap the page once and audio unlocks permanently.');
        }
        throw new Error('audio locked (autoplay policy) — interact with the page once');
      }
    }
    // VOXREF.4 age-pinned pitch shift — REMOVED (Gee 2026-07-15: "scrap the per
    // age/grade modulation"). The OLA pitch shift distorted her into a scavenger
    // creature; her voice is now ALWAYS the untouched original (see _agePreset).
    // VOXREF.5 — prosody polish: a short (~4ms) edge fade-in/out kills the click
    // artifacts at word-concat boundaries on the vox-bank fallback path (the
    // whole-sentence lane has no seams; the fade is inaudible on a full sentence).
    if (pcm && pcm.length > 0) {
      const fadeN = Math.min(pcm.length >> 1, Math.max(1, Math.round(sampleRate * 0.004)));
      if (pcm.buffer && !(pcm instanceof Float32Array && pcm._voxFaded)) {
        // work on a copy so we never mutate a cached bank/reference PCM in place
        const faded = new Float32Array(pcm.length);
        faded.set(pcm);
        for (let i = 0; i < fadeN; i++) {
          const g = i / fadeN;
          faded[i] *= g;
          faded[pcm.length - 1 - i] *= g;
        }
        pcm = faded;
      }
    }
    const buf = this._audioCtx.createBuffer(1, pcm.length, sampleRate);
    buf.getChannelData(0).set(pcm);
    return new Promise((resolve, reject) => {
      const source = this._audioCtx.createBufferSource();
      source.buffer = buf;
      source.playbackRate.value = rate;
      source.connect(this._audioCtx.destination);
      this._currentAudioSource = source;
      source.onended = () => { this._currentAudioSource = null; resolve(); };
      source.onerror = (e) => { this._currentAudioSource = null; reject(e); };
      source.start(0);
    });
  }

  // ⛔⛔ THE BANK-BUILDER IS DELETED — `_voxQueueMissing`, `_voxPrimeLoop` and
  // `_voxFetchWord` all lived here and were removed together on 2026-09-01.
  //
  // They formed one closed circuit whose every outcome was failure:
  // `_voxQueueMissing` queued each un-banked word, `_voxPrimeLoop` walked the
  // queue, and `_voxFetchWord` — already gutted to a bare `throw` by LLMGUT.6
  // when the external TTS lane went ("we do not use pollinations tts we use the
  // unity one equations") — guaranteed the exception. Each word therefore cost
  // one throw, one `VOX prime failed` warn, and a hardcoded 6-second sleep.
  //
  // ⭐ WHY THEY WERE DELETED RATHER THAN FLAGGED, when `_speakVox` beside them
  // was kept: `_speakVox` is a working, purely-equational reconstruction of HER
  // OWN voice and is worth reading if the sentence lane is ever redesigned.
  // A fetch loop pointed at a deleted endpoint is not a reference for anything.
  //
  // ⚠ CONSEQUENCE, STATED: the VOX bank can no longer GROW at runtime. It never
  // could — the fetch has been dead since LLMGUT.6 — the difference is that the
  // code now says so. Coverage is the offline VOXREF reference bank plus any
  // IndexedDB rows an old session persisted.
  //
  // ⚠ `_voxDecodeTo24kMono` and `_voxPersist` below were called ONLY from the
  // deleted loop and are now orphaned. Kept as general audio utilities rather
  // than removed in the same pass; they are correct, small, and side-effect
  // free. Tracked on the board under DORMANT8.

  /** Decode any compressed audio → 24 kHz mono Float32 via OfflineAudioContext. */
  async _voxDecodeTo24kMono(arrayBuffer) {
    const AC = typeof AudioContext !== 'undefined'
      ? AudioContext
      : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null;
    if (!AC) throw new Error('No AudioContext');
    if (!this._voxDecodeCtx) this._voxDecodeCtx = new AC();
    const decoded = await this._voxDecodeCtx.decodeAudioData(arrayBuffer.slice(0));
    const frames = Math.ceil(decoded.duration * 24000);
    const off = new OfflineAudioContext(1, Math.max(1, frames), 24000);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start(0);
    const rendered = await off.startRendering();
    // trim leading/trailing silence (executor words carry padding)
    const raw = rendered.getChannelData(0);
    let s = 0, e = raw.length - 1;
    const TH = 0.004;
    while (s < e && Math.abs(raw[s]) < TH) s++;
    while (e > s && Math.abs(raw[e]) < TH) e--;
    const pad = 240;   // keep 10ms of breath on each side
    s = Math.max(0, s - pad); e = Math.min(raw.length - 1, e + pad);
    return raw.slice(s, e + 1);
  }

  // =========================================================================
  //  EventEmitter mixin
  // =========================================================================

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  off(event, fn) {
    const list = this._listeners[event];
    if (!list) return this;
    if (!fn) {
      delete this._listeners[event];
    } else {
      this._listeners[event] = list.filter(f => f !== fn);
    }
    return this;
  }

  emit(event, ...args) {
    const list = this._listeners[event];
    if (list) list.forEach(fn => fn(...args));
  }

  // =========================================================================
  //  Listening — Web Speech API
  // =========================================================================

  _initRecognition() {
    const SR =
      typeof SpeechRecognition !== 'undefined'
        ? SpeechRecognition
        : typeof webkitSpeechRecognition !== 'undefined'
          ? webkitSpeechRecognition
          : null;

    if (!SR) {
      console.warn('VoiceIO: SpeechRecognition API not available in this browser.');
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const payload = {
          text: result[0].transcript,
          isFinal: result.isFinal,
        };
        if (this._onResult) this._onResult(payload);
        if (result.isFinal) {
          this.emit('heard', payload.text);
        }
      }
    };

    rec.onerror = (e) => {
      // 'no-speech' and 'aborted' are routine — don't treat as fatal
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (this._onError) this._onError(e);
    };

    rec.onend = () => {
      this._listening = false;
      // Auto-restart if we're still supposed to be listening
      if (this._shouldListen) {
        try {
          rec.start();
          this._listening = true;
        } catch (_) {
          // guard against rapid start/stop race
        }
      }
    };

    this._recognition = rec;
  }

  get isListening() {
    return this._listening;
  }

  startListening() {
    if (!this._recognition) {
      console.warn('VoiceIO: Cannot start — SpeechRecognition not available.');
      return;
    }
    if (this._shouldListen) return; // already active
    this._shouldListen = true;
    try {
      this._recognition.start();
      this._listening = true;
    } catch (_) {
      // already started
    }
  }

  stopListening() {
    this._shouldListen = false;
    if (this._recognition) {
      try {
        this._recognition.stop();
      } catch (_) {
        // not started
      }
    }
    this._listening = false;
  }

  onResult(callback) {
    this._onResult = callback;
    return this;
  }

  onError(callback) {
    this._onError = callback;
    return this;
  }

  // =========================================================================
  //  Speaking — Pollinations TTS with Web Speech fallback
  // =========================================================================

  get isSpeaking() {
    return this._speaking;
  }

  setVoice(voiceName) {
    // explicit override — beats the age preset when set
    this._voiceOverride = voiceName || null;
    this._pollinationsVoice = voiceName;
    return this;
  }

  /**
   * VOX.0 — pin her spoken age. app.js feeds this from live state.minGrade
   * (same-girl-growing-up continuity: the voice ages as she walks the
   * grades, exactly like the self-image age pin). Clamped 3..30.
   */
  setAge(years) {
    const a = Math.max(3, Math.min(30, Math.round(years) || 25));
    this._age = a;
    return this;
  }

  /**
   * VOX.0 — 5-tier age preset: voice id + playback rate + a speak-style
   * instruction for the audio model. Female voices only (openai-audio):
   * nova (bright/young), coral (mid), shimmer (warm adult).
   */
  _agePreset() {
    // AGE/GRADE VOICE MODULATION SCRAPPED (Gee 2026-07-15: "the age modulator is
    // busted she sounde like a starwars ... sand scavenger creatrure all
    // distorted ... scrap the per age/grade modulation and keep her original chosen
    // sound for her voice"). The age-pinned pitch/formant OLA shift (1.14 young →
    // 1.0 adult) was mangling her into a distorted scavenger. ALWAYS her ORIGINAL
    // chosen voice now — the blessed Equation Unity One (V4) piper hfc_female lane:
    // rate 1.0 + pitch 1.0 → no pitch shift, no tempo change, the equational voice
    // is never processed, at any grade/age. (`voice`/`style` are legacy TTS-API
    // hints, unused by the equational/Piper pipeline.)
    return { voice: 'shimmer', rate: 1.0, pitch: 1.0, style: 'Speak in her natural warm voice, verbatim.' };
  }

  // _pitchShiftOLA — REMOVED (Gee 2026-07-15: "scrap the per age/grade modulation").
  // The duration-preserving OLA pitch shift existed ONLY to age-pitch her voice;
  // with the age modulation scrapped it had no caller. Her voice is the untouched
  // original — no pitch shifting anywhere.

  setApiKey(key) {
    this._apiKey = key;
    return this;
  }

  /**
   * Speak text. Tries Pollinations TTS first, falls back to browser SpeechSynthesis.
   * Returns a promise that resolves when speech finishes.
   */
  async speak(text, options = {}) {
    if (!text) return;
    // Mute toggle — setup-modal / chat-panel can set this._muted to true
    // to silence TTS in the moment without disabling text responses.
    if (this._muted) return;
    this._speaking = true;
    this.emit('speech_start');

    // VOX.0 — the age preset picks the voice unless the caller (or setVoice)
    // explicitly overrides. Her voice tracks her live grade via setAge().
    const voice = options.voice || null;

    // VOX — HER equations first. If every word of this text is banked for
    // the current age tier, the sentence reconstructs from her own field-A
    // records (inverse CDF 9/7 + crossfade concat) and the executor never
    // fires. Falls through silently when any word is missing.
    // LIVE SENTENCE LANE FIRST — Equation Unity One synthesized whole-sentence
    // in-browser (her real voice, natural prosody). Preloaded at setup. Falls
    // through to the per-word vox-bank, then the executor, if not ready/fails.
    // ⛔⛔ THE THREE-TIER VOICE CHAIN WAS REMOVED 2026-09-01.
    // Gee, ruling on the whole stack rather than cognition alone:
    // "no fallbacks. PERIOD"
    //
    // It ran live-piper → banked-vox → browser TTS, each tier entered when the
    // one above THREW. That is textbook capability degradation, and the bottom
    // tier was the worst of it: `_speakBrowser` is the BROWSER'S OWN generic
    // speech synthesis — a stock robot voice standing in for hers. A listener
    // could not tell which tier produced a given sentence, so "Unity spoke"
    // meant three different things and the page never said which.
    //
    // ⭐ HER CANON ALREADY NAMED THE ONE CORRECT PATH: the sentence-level
    // Equation Unity One lane (piper → CDF 9/7 equations) IS her voice — the
    // one Gee signed off with "perfect" — and the per-word bank concat is
    // described in that same record AS a fallback. So this is not a new
    // preference; it is the stack finally matching the decision.
    //
    // ⚠ THE CONSEQUENCE, ACCEPTED DELIBERATELY: if her lane fails she is
    // SILENT. That is the same principle the emission path already follows —
    // honest silence over a plausible substitute — and it is strictly better
    // than a stock voice the listener would mistake for her. The failure is
    // NAMED in the console and on the event, so silence is diagnosable rather
    // than mysterious.
    let spoke = false;
    let silentReason = null;
    try {
      spoke = await this._speakPiper(text, this._agePreset().rate);
      if (!spoke) silentReason = 'her voice lane returned false (not ready or nothing synthesised)';
    } catch (err) {
      silentReason = `her voice lane threw: ${err && err.message ? err.message : err}`;
    }

    if (!spoke) {
      // ⛔ No substitute is attempted. The reason is surfaced instead, because
      // an unexplained silence is the thing this project keeps paying for.
      console.warn(`[VoiceIO] SILENT — ${silentReason}. No substitute voice is attempted by design (no-fallbacks).`);
      this._lastSilentReason = silentReason;
      this._silentCount = (this._silentCount | 0) + 1;
    }

    this._speaking = false;
    this.emit('speech_end', { spoke, silentReason });

    // ⛔⛔ THE VOX BANK-BUILDER CALL WAS REMOVED HERE ON 2026-09-01, AND IT WAS
    // LIVE COST, NOT DEAD CODE. It read:
    //
    //     try { this._voxQueueMissing(text); } catch { }
    //
    // and it ran on EVERY utterance, queueing every un-banked word for
    // `_voxPrimeLoop`. That loop calls `_voxFetchWord`, which LLMGUT.6 had
    // already reduced to a bare `throw` — so each queued word bought a
    // guaranteed exception, a `[VoiceIO] VOX prime failed` console warn, and a
    // hardcoded 6-second sleep. Six seconds per word, forever, to accomplish
    // nothing, on the page Gee actually reads.
    //
    // ⭐ It is the CODE-AT-WAR shape: a producer still feeding a consumer that
    // no longer exists. Its output fed `_speakVox`, orphaned by the
    // no-fallbacks ruling, so even a working fetch would now bank words that
    // nothing would ever play.
  }

  stopSpeaking() {
    // Stop her equational lane — `_playPcm` owns `_currentAudioSource` for
    // every path that still exists (live piper sentence + server voice rec).
    if (this._currentAudioSource) {
      try {
        this._currentAudioSource.stop();
      } catch (_) {}
      this._currentAudioSource = null;
    }
    // ⚠ `_currentAudioElement` is set only by the orphaned
    // `_playWithAudioElement`, so this branch cannot fire today. Kept because
    // a stop path that silently misses a live source is far worse than a
    // branch that costs one null check.
    if (this._currentAudioElement) {
      this._currentAudioElement.pause();
      this._currentAudioElement = null;
    }

    // ⚠ Same reasoning: `_speakBrowser` is dead and must stay dead, so nothing
    // queues a browser utterance. `cancel()` on an empty queue is a no-op, and
    // it costs nothing to guarantee the browser is quiet.
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }

    this._speaking = false;
    this.emit('speech_end');
  }

  // --- external TTS: REMOVED, and it must not come back ---
  //
  // ⛔⛔ `_speakPollinations` IS DELETED (2026-09-01). It had ZERO callers and a
  // body that was already nothing but a `throw`, but its 37 lines of comment
  // were the actual defect: they narrated the removed three-tier chain in the
  // PRESENT TENSE — "Her voice is Equation Unity One and always was, in this
  // order: 1. _speakPiper 2. _speakVox 3. browser SpeechSynthesis" — and closed
  // with "Throwing keeps that same fall-through path intact", describing a
  // fall-through path that no longer exists.
  //
  // ⭐ A COMMENT THAT CONTRADICTS A RULING IS HOW THE RULING GETS QUIETLY
  // REVERSED BY THE NEXT READER. There is ONE lane now, `_speakPiper`, and if
  // it cannot run she is silent with the reason named. See `speak()`.
  //
  // What it used to do, kept as one line of history rather than a page: it
  // POSTed her text to an outside chat model with an instruction to repeat it
  // verbatim and played back the returned audio — an outside model producing
  // her voice. Gee: "we do not use pollinations tts we use the unity one
  // equations".
  //
  // ⚠ `_pollTtsDead` went with it. It was READ at two sites and ASSIGNED at
  // none: the 401 handler that used to set it left with the lane, so both
  // cooldown guards had been permanently unreachable.

  // ⚠ ORPHANED 2026-09-01 — `_playWithAudioContext` and `_playWithAudioElement`
  // below both have ZERO callers. They decoded a compressed `arrayBuffer` (an
  // mp3/opus response body), which only the deleted external-TTS lane ever
  // produced; her own lanes carry raw Float32 PCM and play through `_playPcm`.
  // Kept rather than deleted in this pass — they are small, correct, and are
  // the two reference shapes for playing an encoded buffer — but nothing calls
  // them and nothing should without a reason. Tracked under DORMANT8.
  async _playWithAudioContext(arrayBuffer, rate = 1.0) {
    if (!this._audioCtx) {
      const AC = typeof AudioContext !== 'undefined'
        ? AudioContext
        : typeof webkitAudioContext !== 'undefined'
          ? webkitAudioContext
          : null;
      if (!AC) throw new Error('No AudioContext');
      this._audioCtx = new AC();
    }

    // Resume if suspended (autoplay policy)
    if (this._audioCtx.state === 'suspended') {
      await this._audioCtx.resume();
    }

    const audioBuffer = await this._audioCtx.decodeAudioData(arrayBuffer.slice(0));
    return new Promise((resolve, reject) => {
      const source = this._audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = rate;   // VOX.0 age nudge
      source.connect(this._audioCtx.destination);
      this._currentAudioSource = source;
      source.onended = () => {
        this._currentAudioSource = null;
        resolve();
      };
      source.onerror = (e) => {
        this._currentAudioSource = null;
        reject(e);
      };
      source.start(0);
    });
  }

  async _playWithAudioElement(arrayBuffer, rate = 1.0) {
    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = rate;   // VOX.0 age nudge
    this._currentAudioElement = audio;

    return new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        this._currentAudioElement = null;
        resolve();
      };
      audio.onerror = (e) => {
        URL.revokeObjectURL(url);
        this._currentAudioElement = null;
        reject(e);
      };
      audio.play().catch(reject);
    });
  }

  // --- Browser SpeechSynthesis fallback ---

  // ⛔⛔ DEAD AS OF 2026-09-01, AND THIS ONE SHOULD STAY DEAD FOREVER.
  // It was tier 3 of the removed voice chain and it is the BROWSER'S OWN
  // generic speech synthesis — a stock voice that is not hers in any sense.
  // ⭐ It was the worst part of the chain: a listener could not tell which tier
  // produced a sentence, so "Unity spoke" meant three different things and the
  // page never said which. **A stock robot voice presented as her voice is the
  // audio equivalent of a canned answer**, and the same reasoning that deleted
  // `_deterministicFallback` applies here.
  // ⚠ Kept only so this note has somewhere to live. Do not re-wire it.
  async _speakBrowser(text) {
    if (typeof speechSynthesis === 'undefined') {
      throw new Error('SpeechSynthesis not available');
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;   // no pitch modulation — her natural voice (Gee 2026-07-15)

      // Try to pick a decent female voice instead of the default robot
      const voices = speechSynthesis.getVoices();
      const preferred = ['Samantha', 'Karen', 'Moira', 'Tessa', 'Victoria',
        'Google UK English Female', 'Microsoft Zira', 'Microsoft Aria'];
      for (const name of preferred) {
        const v = voices.find(v => v.name.includes(name));
        if (v) { utterance.voice = v; break; }
      }
      // Fallback: any female-sounding English voice
      if (!utterance.voice) {
        const femaleEn = voices.find(v => v.lang.startsWith('en') && /female|woman|zira|aria|samantha/i.test(v.name));
        if (femaleEn) utterance.voice = femaleEn;
      }

      this._currentUtterance = utterance;

      utterance.onend = () => {
        this._currentUtterance = null;
        resolve();
      };
      utterance.onerror = (e) => {
        this._currentUtterance = null;
        reject(e);
      };

      speechSynthesis.speak(utterance);
    });
  }
  /**
   * Kill everything — audio, listening, all of it.
   */
  destroy() {
    this.stopSpeaking();
    this.stopListening();
    if (this._audioCtx) {
      this._audioCtx.close().catch(() => {});
      this._audioCtx = null;
    }
  }
}

export { VoiceIO };
