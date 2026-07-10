/**
 * VoiceIO — Browser-based voice input/output for Unity.
 *
 * Listening:  Web Speech API (SpeechRecognition)
 * Speaking:   Pollinations TTS API with Web SpeechSynthesis fallback
 *
 * No external dependencies.
 */

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

    // --- init recognition if available ---
    this._initRecognition();
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
