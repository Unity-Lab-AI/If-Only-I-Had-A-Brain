/**
 * remote-brain.js — WebSocket Client for Server-Side Brain
 *
 * Drop-in replacement for UnityBrain. Instead of running the
 * equations locally, connects to a brain server via WebSocket
 * and relays state + sensory input.
 *
 * app.js auto-detects: if server is available → RemoteBrain.
 * If not → local UnityBrain. Same API, different source.
 *
 * The visualizers, sandbox, voice, chat — all work the same.
 * They just receive state from the server instead of local math.
 *
 * NOTE: even on the server-brain path, we still instantiate a REAL
 * local InnerVoice. The server handles the N-neuron simulation but
 * the language cortex runs client-side so Unity's persona self-image
 * (docs/Ultimate Unity.txt) is loaded into the browser dictionary via
 * the same pure-equation learnSentence() pipeline used by local brain.
 */

import { InnerVoice } from './inner-voice.js';
import { VisualCortex } from './visual-cortex.js';
// T13.7.6 — RemoteBrain needs a real local NeuronCluster cortex so the
// brain-3d commentary popups (and any other local-only generate path)
// can run the T13 brain-driven emission loop. Without this, every local
// generate() call returns '' because T13.7 deleted the slot-prior
// fallback and requires opts.cortexCluster.
import { NeuronCluster } from './cluster.js';

class EventEmitter {
  constructor() { this._listeners = {}; }
  on(event, fn) { if (!this._listeners[event]) this._listeners[event] = []; this._listeners[event].push(fn); return this; }
  off(event, fn) { const a = this._listeners[event]; if (a) this._listeners[event] = a.filter(f => f !== fn); return this; }
  emit(event, data) { const a = this._listeners[event]; if (a) for (let i = 0; i < a.length; i++) a[i](data); }
}

export class RemoteBrain extends EventEmitter {
  /**
   * @param {string} serverUrl — WebSocket URL (e.g., 'ws://localhost:7525')
   */
  constructor(serverUrl) {
    super();
    this._serverUrl = serverUrl;
    this._ws = null;
    this._connected = false;
    // Per-session id assigned by server in the `welcome` message.
    // Ephemeral — changes every reconnect.
    this._userId = null;
    // T6 2026-04-13 — stable per-user id that survives reconnects,
    // persisted in localStorage as `unity_user_id`. Generated lazily
    // on first text send so a returning user's episodes can be
    // recalled under the same id next session. This is what scopes
    // private episodic memory — the server filters the SQLite
    // episodes table by this id so Alice never gets recall hits
    // from Bob's conversation.
    this._stableUserId = null;
    this.running = false;

    // Mirror state from server
    this.state = {
      spikes: null, voltages: null, spikeCount: 0,
      clusters: {}, cortex: null, hippocampus: null,
      amygdala: null, basalGanglia: null, cerebellum: null,
      hypothalamus: null, mystery: null, oscillations: null,
      psi: 0, time: 0, reward: 0, drugState: 'sober',
      totalNeurons: 1000, motor: null, memory: null,
      innerVoice: null, connectedUsers: 0,
    };

    // Dummy subsystems for API compatibility
    this.motor = { selectedAction: 'idle', confidence: 0, isSpeaking: false, _interruptFlag: false,
      interrupt() { this._interruptFlag = true; },
      wasInterrupted() { return this._interruptFlag; },
      getState() { return { selectedAction: this.selectedAction, confidence: this.confidence }; },
    };
    this.auditoryCortex = {
      isActive() { return false; },
      setMotorOutput() {},
      clearMotorOutput() {},
      checkForInterruption() { return true; },
      getState() { return {}; },
    };
    // T4.9 — real local VisualCortex instance so the Eye widget's
    // iris actually tracks gaze from live V1 edge + salience
    // computation. Previously this was a stub plain-object with
    // static gazeX:0.5/gazeY:0.5 which is why the iris sat frozen
    // on the user's eyes. The server still runs its own vision
    // processing in parallel (for commentary generation), but the
    // Eye widget on the client reads from this local instance.
    this.visualCortex = new VisualCortex();
    this.sensory = { _cameraStream: null };
    // REAL local InnerVoice so loadPersona works and the memory tab shows
    // dictionary / bigram / usage-type stats from the actual persona file.
    // app.js fetches docs/Ultimate Unity.txt and calls loadPersona() on this.
    this.innerVoice = new InnerVoice();

    // T13.7.6 — local cortex cluster purely for the language emission
    // loop. The actual brain sim runs server-side and reaches us via
    // websocket state messages. This cluster is for local-only
    // languageCortex.generate calls (brain-3d commentary popups,
    // /think debug, welcome speech).
    // Browser-side fallback cortex at 1500 neurons (smaller than the
    // server's 2000 because the browser is more resource-constrained).
    // 1500 neurons × 15% connectivity = ~340K synapses, deep enough
    // for measurable Hebbian basins. Hebbian-trained on persona corpus
    // when trainPersonaHebbian is called below. Exposed via
    // this.clusters.cortex. (Server tier runs the full EMBED_DIM=300
    // GloVe pipeline; the browser fallback uses a smaller groupSize so
    // the same embedding dim tiles into fewer neurons.)
    const langCortexSize = 1500;
    this._localCortex = new NeuronCluster('cortex', langCortexSize, {
      tonicDrive: 14,
      noiseAmplitude: 7,
      connectivity: 0.15,
      excitatoryRatio: 0.85,
      learningRate: 0.002,
    });
    this._langStart = Math.floor(langCortexSize / 2);
    this.clusters = { cortex: this._localCortex };

    this._connect();
  }

  /**
   * T13.7.6 — Hebbian-train the local cortex cluster on persona corpus
   * so the local generate() path (commentary popups etc) reads from a
   * Unity-voice-shaped attractor landscape instead of random noise.
   * Delegates through the local InnerVoice → LanguageCortex →
   * cluster.learnSentenceHebbian chain. Idempotent — only runs once
   * per RemoteBrain instance per persona text.
   */
  trainPersonaHebbian(text) {
    if (!text || this._hebbianTrained) return;
    if (!this.innerVoice || !this._localCortex) return;
    try {
      // T13.7.8 — pass langStart + stronger lr + injectStrength so the
      // Hebbian pass actually shapes the bigger 1500-neuron cluster.
      this.innerVoice.trainPersonaHebbian(this._localCortex, text, {
        lr: 0.012,
        langStart: this._langStart,
        injectStrength: 0.8,
      });
      this._hebbianTrained = true;
    } catch (err) {
      console.warn('[RemoteBrain] persona Hebbian training failed:', err.message);
    }
  }

  _connect() {
    try {
      this._ws = new WebSocket(this._serverUrl);

      this._ws.onopen = () => {
        this._connected = true;
        console.log(`[RemoteBrain] Connected to ${this._serverUrl}`);
      };

      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch {}
      };

      this._ws.onclose = () => {
        this._connected = false;
        console.log('[RemoteBrain] Disconnected — reconnecting in 3s...');
        setTimeout(() => this._connect(), 3000);
      };

      this._ws.onerror = () => {
        // Will trigger onclose
      };
    } catch {
      console.warn('[RemoteBrain] Connection failed');
      setTimeout(() => this._connect(), 5000);
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        this._userId = msg.id;
        if (msg.state) this._applyState(msg.state);
        console.log(`[RemoteBrain] Welcome — user ${this._userId}, ${msg.state?.connectedUsers ?? '?'} users online`);
        break;

      case 'state':
        this._applyState(msg.state);
        this.emit('stateUpdate', this.state);
        break;

      case 'response':
        this.emit('response', { text: msg.text, action: msg.action });
        break;

      case 'silent':
        // Server dropped the response on purpose — pre-K Unity's motor
        // region can't commit a stable letter sequence, or the language
        // subsystem isn't booted, or the motor attractor couldn't settle
        // on this input. Forward the reason + detail + minGrade to the
        // chat panel so it renders a ghost bubble instead of ghosting
        // the user. Shape: { reason, detail, minGrade }.
        this.emit('silent', {
          reason: msg.reason || 'unknown',
          detail: msg.detail || '',
          minGrade: msg.minGrade || null,
        });
        break;

      case 'build':
        // Server wants to inject a component
        this.emit('build', msg.component);
        break;

      case 'speak':
        this.emit('speak', msg.text);
        break;

      case 'image':
        this.emit('image', msg.url);
        break;

      case 'innerThought':
        // iter25-E.6 — server-side inner voice broadcast (iter25-E.3).
        // Operator (2026-05-06): "the pop ups in her Brain fire with
        // her real actual knowldedge to that point as her real internal
        // voice in the moment". Server fires cortexCluster.emitWordDirect
        // every ~3s using its TRAINED weights and broadcasts the result.
        // Listeners (3D brain popups, chat-panel ghost, debug overlay)
        // hook this event to render Unity's real live thoughts instead
        // of the decorative browser-side innerVoice.
        this.emit('innerThought', {
          word: msg.word || '',
          subject: msg.subject || 'all',
          sentence: msg.sentence || msg.word || '',
          ts: msg.ts || Date.now(),
          capability: msg.capability || null,
        });
        break;

      case 'error':
        console.warn('[RemoteBrain] Server error:', msg.message);
        break;
    }
  }

  _applyState(serverState) {
    if (!serverState) return;
    // Map server state to local state format
    this.state.psi = serverState.psi ?? this.state.psi;
    this.state.time = serverState.time ?? this.state.time;
    this.state.reward = serverState.reward ?? this.state.reward;
    this.state.drugState = serverState.drugState ?? this.state.drugState;
    this.state.spikeCount = serverState.totalSpikes ?? this.state.spikeCount;
    this.state.totalNeurons = serverState.totalNeurons ?? this.state.totalNeurons;
    if (serverState.scale) this.state.scale = serverState.scale;
    if (serverState.totalSpikes !== undefined) this.state.totalSpikes = serverState.totalSpikes;
    if (serverState.time !== undefined) this.state.time = serverState.time;
    if (serverState.frameCount !== undefined) this.state.frameCount = serverState.frameCount;
    this.state.connectedUsers = serverState.connectedUsers ?? 0;

    if (serverState.clusters) this.state.clusters = serverState.clusters;
    if (serverState.motor) {
      this.state.motor = serverState.motor;
      this.motor.selectedAction = serverState.motor.selectedAction;
      this.motor.confidence = serverState.motor.confidence;
    }

    // Derive amygdala from server state
    this.state.amygdala = {
      arousal: serverState.arousal ?? 0.5,
      valence: serverState.valence ?? 0,
      fear: serverState.fear ?? 0,
    };

    this.state.oscillations = {
      coherence: serverState.coherence ?? 0.5,
      bandPower: serverState.bandPower || {},
    };

    if (serverState.innerVoice) this.state.innerVoice = serverState.innerVoice;
    if (serverState.memory) this.state.memory = serverState.memory;
    if (serverState.sharedMood) this.state.sharedMood = serverState.sharedMood;
    if (serverState.perf) this.state.perf = serverState.perf;
    if (serverState.growth) this.state.growth = serverState.growth;
    // T18.3.b — forward grade state (per-subject map + minGrade + canSpeak)
    // so the HUD can render Unity's lowest passing grade as a persistent
    // visible element instead of forcing the user to type /curriculum status.
    if (serverState.grades) this.state.grades = serverState.grades;
    if (serverState.minGrade) this.state.minGrade = serverState.minGrade;
    if (typeof serverState.canSpeak === 'boolean') this.state.canSpeak = serverState.canSpeak;

    // Synthesize spike array for 3D visualization.
    // Server runs millions of neurons — render shows proportional sample.
    // AMPLIFY firing rates for visual impact (2% biological rate → 15-30% visual rate).
    if (serverState.clusters) {
      // Dynamic ratios from ACTUAL server cluster sizes — not hardcoded
      const names = ['cortex', 'hippocampus', 'amygdala', 'basalGanglia', 'cerebellum', 'hypothalamus', 'mystery'];
      const totalSize = names.reduce((s, n) => s + (serverState.clusters[n]?.size || 0), 0) || 1;
      const ratios = names.map(n => (serverState.clusters[n]?.size || 0) / totalSize);
      const renderTotal = this.state.spikes?.length || 20000;
      const spikes = new Uint8Array(renderTotal);
      let offset = 0;

      for (let c = 0; c < names.length; c++) {
        const clusterRenderSize = Math.round(ratios[c] * renderTotal);
        const cluster = serverState.clusters[names[c]];

        // Firing rate normalized — all clusters render at equal visual intensity
        const rawRate = cluster ? (cluster.spikeCount || 0) / (cluster.size || 1) : 0;
        const emaRate = cluster ? (cluster.firingRate || 0) / (cluster.size || 1) : 0;
        // Scale multiplier by cluster size ratio so big clusters aren't dimmer
        const sizeRatio = (cluster?.size || 1) / (totalSize / names.length); // >1 for big clusters
        const amplify = 15 + sizeRatio * 5; // bigger cluster → bigger multiplier
        const visualRate = Math.min(0.5, rawRate * amplify + emaRate * amplify * 0.7);

        for (let i = 0; i < clusterRenderSize && offset + i < renderTotal; i++) {
          spikes[offset + i] = Math.random() < visualRate ? 1 : 0;
        }
        offset += clusterRenderSize;
      }
      this.state.spikes = spikes;
    }
  }

  // ── Public API (same as UnityBrain) ──────────────────────────

  getState() { return this.state; }

  start() { this.running = true; }
  stop() { this.running = false; }

  receiveSensoryInput(type, data) {
    if (!this._connected || !this._ws) return;
    this._ws.send(JSON.stringify({ type, [type]: data }));
  }

  async processAndRespond(text) {
    if (!this._connected || !this._ws) {
      return { text: 'Brain server disconnected.', action: 'respond_text' };
    }

    // T6 2026-04-13 — lazy-init the stable userId on first text send.
    // Persisted in localStorage so returning users keep the same id
    // across sessions and can recall their own episodes. Server uses
    // this to filter SQLite episode storage + recall by user, so one
    // user never gets recall hits from another user's past text.
    // crypto.randomUUID() is supported in all modern browsers; guard
    // the ls access for SSR / worker contexts just in case.
    if (!this._stableUserId) {
      try {
        if (typeof localStorage !== 'undefined') {
          let saved = localStorage.getItem('unity_user_id');
          if (!saved) {
            saved = (typeof crypto !== 'undefined' && crypto.randomUUID)
              ? crypto.randomUUID()
              : 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
            localStorage.setItem('unity_user_id', saved);
          }
          this._stableUserId = saved;
        }
      } catch { /* localStorage unavailable — fall through with null */ }
    }

    // T14.25 — stamp the last-text time so the visual cortex RAF
    // driver's setAttentionState call sees a small secondsSinceInput
    // and locks attention toward the user's face for the next ~10s.
    this._lastTextSendTime = Date.now();

    this._ws.send(JSON.stringify({
      type: 'text',
      text,
      userId: this._stableUserId || undefined,
    }));

    // T14.22.5 — attach handler BEFORE awaiting the Promise resolve
    // so a fast server response that races the ws.send can't fire
    // its 'response' event before the listener is registered.
    return new Promise((resolve) => {
      let resolved = false;
      const handler = ({ text, action }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        this.off('response', handler);
        resolve({ text, action });
      };
      this.on('response', handler);
      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.off('response', handler);
        resolve({ text: 'Brain is thinking...', action: 'respond_text' });
      }, 30000);
    });
  }

  connectLanguage() {} // handled by server
  connectVoice(v) { this._voice = v; }
  connectImageGen() {} // handled by server
  connectMicrophone() {}

  /**
   * T4.9 — real camera wiring so the local VisualCortex processes
   * frames and drives the Eye widget's iris tracking. Mirrors
   * UnityBrain.connectCamera(): creates a video element sourced
   * from the MediaStream, waits a tick for the first frame, then
   * hands the element to VisualCortex.init() which starts the
   * 60×45 V1 edge + saccade + salience loop.
   */
  connectCamera(stream, videoElement) {
    if (!stream) return;
    try {
      let vid = videoElement;
      if (!vid) {
        vid = document.createElement('video');
        vid.autoplay = true;
        vid.playsInline = true;
        vid.muted = true;
        vid.srcObject = stream;
        vid.style.display = 'none';
        document.body.appendChild(vid);
      }
      this.sensory._cameraStream = stream;
      this.sensory._videoElement = vid;
      // Wait for the first frame before initializing visual cortex —
      // same 500ms delay the local-brain path uses.
      setTimeout(() => {
        if (this.visualCortex && typeof this.visualCortex.init === 'function') {
          this.visualCortex.init(vid);
          console.log('[RemoteBrain] Visual cortex connected to camera');

          // T14.23.5 — self-driving processFrame RAF loop.
          //
          // RemoteBrain has no tick loop (the main brain runs server-
          // side), so nothing was calling visualCortex.processFrame()
          // on the client side. VisualCortex.init() starts the video
          // element but the V1 edge + salience + saccade compute only
          // runs when processFrame() is called externally. Without a
          // driver, gazeX/gazeY stayed at their default 0.5/0.5 and
          // the Eye widget's iris rendered frozen in the center.
          //
          // Fix: kick off a requestAnimationFrame loop that calls
          // processFrame() every frame as long as the visual cortex
          // is active. The loop self-cancels when the cortex goes
          // inactive (disconnect or destroy). ~60 Hz frame rate is
          // overkill — visualCortex.processFrame internally gates
          // real compute work via its own describeInterval and V1
          // update cadence — but RAF is the simplest way to stay in
          // sync with the display's vsync.
          // T14.25 — drive setAttentionState from live RemoteBrain
          // state so the visual cortex's top-down attention lock
          // engages when the user is actively talking to Unity.
          // Without this, _attentionLock stays at 0 and the face-
          // tracking saccade's center prior stays weak, so the iris
          // wanders to whatever high-salience background edge wins
          // the raw competition. setAttentionState only needs two
          // numbers (current arousal, seconds since last input),
          // both of which we can read from local state + lastTextTime.
          const tick = () => {
            if (!this.visualCortex || !this.visualCortex.isActive()) return;
            try {
              const arousal = this.state?.amygdala?.arousal ?? 0.5;
              const now = Date.now();
              const lastInput = this._lastTextSendTime || 0;
              const secondsSinceInput = lastInput > 0 ? (now - lastInput) / 1000 : 9999;
              if (typeof this.visualCortex.setAttentionState === 'function') {
                this.visualCortex.setAttentionState({ arousal, secondsSinceInput });
              }
              this.visualCortex.processFrame();
            }
            catch (err) { console.warn('[RemoteBrain] visualCortex.processFrame threw:', err?.message || err); }
            this._visionRafId = requestAnimationFrame(tick);
          };
          this._visionRafId = requestAnimationFrame(tick);
        }
      }, 500);
    } catch (err) {
      console.warn('[RemoteBrain] connectCamera failed:', err.message);
    }
  }

  giveReward(amount) {
    if (this._connected && this._ws) {
      this._ws.send(JSON.stringify({ type: 'reward', amount }));
    }
  }

  saveBrainState() {} // server handles persistence
  loadSavedState() { return false; }
  exportBrain() { return null; }

  isConnected() { return this._connected; }
  isRemote() { return true; }
}

/**
 * Auto-detect whether a brain server is running.
 * Returns the RemoteBrain if connected, null if not.
 *
 * @param {string} url — WebSocket URL to probe
 * @param {number} timeout — ms to wait
 * @returns {Promise<RemoteBrain|null>}
 */
export async function detectRemoteBrain(url = 'ws://localhost:7525') {
  // R14 — default probe URL moved off port 8080 (which collides with
  // llama.cpp, LocalAI, and every other service that claims 8080).
  // Unity's brain-server now binds to 7525 by default.
  //
  // Hostname gate: only probe ws://localhost:7525 when the page is actually
  // served from localhost/127.0.0.1/file://. On GitHub Pages (or any other
  // public origin) there is no server — skip the probe, return null, let
  // app.js fall through to the local fallback UnityBrain.
  //
  // Without this gate, visiting the Pages URL from a dev box with brain-server
  // running would connect to ws://localhost:7525 (Chrome allows loopback from
  // https secure-context) and the Pages UI would display the dev box's
  // auto-scaled neuron count (which grows with available VRAM). It also prevents
  // every stranger's browser from silently poking their own loopback on page load.
  if (typeof location !== 'undefined') {
    const host = location.hostname;
    const isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '' ||
      location.protocol === 'file:';
    if (!isLocal) return null;
  }
  return new Promise((resolve) => {
    try {
      // T14.22.4 — timeout raised 3s → 10s. Server-side boot can take
      // longer than 3 seconds at biological scale because the brain
      // constructor allocates Float64Array spike buffers proportional
      // to TOTAL_NEURONS (at Gee's 677M scale, 7 spike arrays totalling
      // ~678 MB of zero-fill). Those allocations plus the module-level
      // import chain (dynamic imports for dictionary/language-cortex/
      // embeddings/cluster/curriculum) can push past 3 seconds even
      // on fast hardware. Bumping to 10s so the landing page actually
      // connects to the server instead of falling back to the tiny
      // 6700-neuron local brain.
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        resolve(null);
      }, 10000);

      ws.onopen = () => {
        clearTimeout(timer);
        ws.close();
        console.log(`[RemoteBrain] Server detected at ${url}`);
        resolve(new RemoteBrain(url));
      };

      ws.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}
