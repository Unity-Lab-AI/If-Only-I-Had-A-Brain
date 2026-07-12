/**
 * VoiceIO — Browser-based voice input/output for Unity.
 *
 * Listening:  Web Speech API (SpeechRecognition)
 * Speaking:   Pollinations TTS API with Web SpeechSynthesis fallback
 *
 * No external dependencies.
 */

import { perceiveAudio, reconstructAudio, concatAudio } from '../brain/mindspace/audio.js';

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
    // The TTS executor is the BANK-BUILDER: each word it speaks gets
    // perceived ONCE into a 1-D CDF 9/7 field-A and banked; sentences
    // whose words are all banked speak from HER equations with zero
    // executor involvement. The bank grows like her visual memory did.
    this._voxBank = new Map();          // key `${tier}:${word}` → field-A rec
    this._voxQueue = [];                // words awaiting bank-build
    this._voxPriming = false;
    this._voxEnabled = (typeof localStorage === 'undefined')
      || localStorage.getItem('unity_vox_equational') !== 'false';
    this._voxDb = null;
    this._voxInitDb();
    // VOXREF — the reference-voice equation bank (built offline from the
    // operator-approved free neural reference; she picked the EQUATIONS over
    // the original in the blind A/B). Preloaded chunked; speak() falls back
    // to these when a tier entry is missing — pure equational voice from
    // word one, no executor, no API key.
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

  _voxTokens(text) {
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
   * the text is banked for the current age tier — the caller falls through
   * to the executor otherwise (which then primes the missing words).
   */
  async _speakVox(text, rate) {
    if (!this._voxEnabled) return false;
    this._ensureVoxRef();   // lazy bank load — the first utterance may fall through while it warms
    const tier = this._voxTier();
    const toks = this._voxTokens(text);
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

  /** Queue every un-banked word of the text for background bank-building. */
  _voxQueueMissing(text) {
    if (!this._voxEnabled) return;
    const tier = this._voxTier();
    for (const w of this._voxTokens(text)) {
      if (this._voxRef && this._voxRef.has(w)) continue;   // reference bank covers it
      const key = `${tier}:${w}`;
      if (!this._voxBank.has(key) && !this._voxQueue.includes(key)) {
        this._voxQueue.push(key);
      }
    }
    if (this._voxQueue.length && !this._voxPriming) this._voxPrimeLoop();
  }

  /**
   * Background bank-builder — one executor call per word, rate-limited,
   * paused while she is speaking. Each word is fetched IN ISOLATION (no
   * alignment problem), decoded, resampled to 24 kHz mono, perceived into
   * a field-A record and banked + persisted. Stops on executor cooldown.
   */
  async _voxPrimeLoop() {
    this._voxPriming = true;
    try {
      while (this._voxQueue.length) {
        if (this._speaking) { await new Promise(r => setTimeout(r, 2000)); continue; }
        if (this._pollTtsDead && Date.now() - this._pollTtsDead < 3600000) break;
        const key = this._voxQueue.shift();
        const word = key.slice(key.indexOf(':') + 1);
        try {
          const ab = await this._voxFetchWord(word);
          const pcm = await this._voxDecodeTo24kMono(ab);
          if (pcm && pcm.length) {
            const rec = perceiveAudio(pcm, 24000);
            if (rec) {
              this._voxBank.set(key, rec);
              this._voxPersist(key, rec);
              console.log(`[VoiceIO] 🎙 VOX banked "${word}" (${rec.equation_count} terms) — ${this._voxBank.size} word equations held`);
            }
          }
        } catch (err) {
          // one bad word never kills the loop; cooldown check above ends it
          console.warn(`[VoiceIO] VOX prime failed for "${word}": ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 6000));   // gentle on the executor
      }
    } finally {
      this._voxPriming = false;
    }
  }

  /** Fetch ONE isolated word from the executor (same wire shape as speech). */
  async _voxFetchWord(word) {
    const preset = this._agePreset();
    const headers = { 'Content-Type': 'application/json' };
    if (this._apiKey) headers['Authorization'] = `Bearer ${this._apiKey}`;
    const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'openai-audio',
        modalities: ['text', 'audio'],
        audio: { voice: this._voiceOverride || preset.voice, format: 'mp3' },
        messages: [
          { role: 'system', content: preset.style + ' Say ONLY the single word the user gives you, naturally, nothing else.' },
          { role: 'user', content: word },
        ],
      }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 402 || res.status === 403) this._pollTtsDead = Date.now();
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const b64 = data?.choices?.[0]?.message?.audio?.data;
    if (!b64) throw new Error('no audio data');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

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
    const a = this._age || 25;
    if (a < 11)  return { voice: 'nova',    rate: 1.08, style: `You are a ${a}-year-old girl. Speak in the natural bright voice of a ${a}-year-old girl.` };
    if (a < 14)  return { voice: 'nova',    rate: 1.04, style: `You are a ${a}-year-old girl. Speak in the natural voice of a ${a}-year-old girl.` };
    if (a < 18)  return { voice: 'coral',   rate: 1.02, style: `You are a ${a}-year-old teenage girl. Speak in the natural voice of a ${a}-year-old teenage girl.` };
    if (a < 23)  return { voice: 'shimmer', rate: 1.0,  style: `You are a ${a}-year-old young woman. Speak in the natural voice of a ${a}-year-old young woman.` };
    return       { voice: 'shimmer', rate: 0.98, style: `You are a ${a}-year-old woman. Speak in the natural warm voice of a ${a}-year-old woman.` };
  }

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
    try {
      if (await this._speakVox(text, this._agePreset().rate)) {
        this._speaking = false;
        this.emit('speech_end');
        return;
      }
    } catch (err) {
      console.warn('[VoiceIO] VOX equational path failed, executor fallback:', err.message);
    }

    // Try Pollinations TTS — retry once on 5xx errors before falling
    // back. 401/402/403 (handled by _speakPollinations dead-backend
    // marking) short-circuits silently to the browser fallback after
    // the first failure so TTS doesn't re-spam the console per
    // utterance.
    let spoke = false;
    for (let attempt = 0; attempt < 2 && !spoke; attempt++) {
      try {
        await this._speakPollinations(text, voice);
        spoke = true;
      } catch (err) {
        const msg = err.message || '';
        // Dead-backend cooldown — skip retry + logging
        if (msg.includes('dead (cooldown)')) break;
        // 5xx — brief retry
        if (attempt === 0 && /HTTP 5\d\d/.test(msg)) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        // Other errors get a single warn, no retry
        if (attempt === 0) {
          console.warn(`[VoiceIO] Pollinations TTS failed: ${msg} — browser fallback`);
        }
        break;
      }
    }

    if (!spoke) {
      try {
        await this._speakBrowser(text);
      } catch (fallbackErr) {
        console.warn('VoiceIO: All TTS methods failed.', fallbackErr);
      }
    }

    this._speaking = false;
    this.emit('speech_end');

    // VOX — whatever just went through the executor becomes bank-building
    // work: every un-banked word gets fetched in isolation, perceived into
    // a field-A equation and banked. Next time these words are all hers.
    try { this._voxQueueMissing(text); } catch { /* priming best-effort */ }
  }

  stopSpeaking() {
    // Stop Pollinations audio
    if (this._currentAudioSource) {
      try {
        this._currentAudioSource.stop();
      } catch (_) {}
      this._currentAudioSource = null;
    }
    if (this._currentAudioElement) {
      this._currentAudioElement.pause();
      this._currentAudioElement = null;
    }

    // Stop browser TTS
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }

    this._speaking = false;
    this.emit('speech_end');
  }

  // --- Pollinations TTS ---

  async _speakPollinations(text, voice) {
    // T4.13 — dead-backend short-circuit. Pollinations TTS returns
    // 401 Unauthorized when anonymous tier isn't allowed. Each
    // response Unity speaks was previously triggering a fresh fetch
    // + 401 + console error + retry + 401 + console error + fallback
    // log + warn log — 4+ console lines per utterance. Now a single
    // 401 marks the endpoint dead for the cooldown period and every
    // subsequent call throws a silent "dead" error that falls
    // straight to the browser SpeechSynthesis fallback with zero
    // console noise.
    if (this._pollTtsDead && Date.now() - this._pollTtsDead < 3600000) {
      throw new Error('Pollinations TTS dead (cooldown)');
    }

    // VOX.0 — Pollinations retired the /v1/audio/speech lane for openai-audio
    // (the endpoint now answers: 'Model "openai-audio" is a text model and
    // cannot be used on the audio endpoint. Use the text endpoint instead.').
    // TTS rides the CHAT endpoint with audio output modalities (the
    // gpt-4o-audio pattern): the model SPEAKS the user text verbatim, styled
    // by the age instruction so her voice tracks her live grade, and returns
    // base64 audio in choices[0].message.audio.data.
    const preset = this._agePreset();
    const url = 'https://gen.pollinations.ai/v1/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (this._apiKey) {
      headers['Authorization'] = `Bearer ${this._apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'openai-audio',
        modalities: ['text', 'audio'],
        audio: { voice: voice || this._voiceOverride || preset.voice, format: 'mp3' },
        messages: [
          { role: 'system', content: preset.style + ' Repeat the user text EXACTLY, verbatim, word for word. Do not add, remove, or change anything.' },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!response.ok) {
      // Auth/payment failures → mark dead for 1 hour cooldown
      if (response.status === 401 || response.status === 402 || response.status === 403) {
        this._pollTtsDead = Date.now();
        console.warn(`[VoiceIO] Pollinations TTS ${response.status} — disabled for 1h, using browser SpeechSynthesis. Paste a Pollinations API key in Settings to re-enable.`);
      }
      throw new Error(`Pollinations TTS HTTP ${response.status}`);
    }

    const data = await response.json().catch(() => null);
    const b64 = data?.choices?.[0]?.message?.audio?.data;
    if (!b64) throw new Error('Pollinations TTS returned no audio data');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const arrayBuffer = bytes.buffer;

    // Try AudioContext first, fall back to HTML5 Audio — both honor the
    // age preset's playback rate (a light pitch/tempo nudge on top of the
    // voice + style so K-Unity reads younger than PhD-Unity).
    try {
      await this._playWithAudioContext(arrayBuffer.slice(0), preset.rate);
    } catch (_) {
      await this._playWithAudioElement(arrayBuffer, preset.rate);
    }
  }

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

  async _speakBrowser(text) {
    if (typeof speechSynthesis === 'undefined') {
      throw new Error('SpeechSynthesis not available');
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.1;

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
