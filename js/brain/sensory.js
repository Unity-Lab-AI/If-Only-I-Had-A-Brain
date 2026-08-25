/**
 * sensory.js — Sensory Input Pipeline
 *
 * ALL input to the brain enters here. Text, audio, video frames.
 * Each input type maps to a specific cortex region with biologically
 * inspired organization:
 *
 * Cortex layout (300 neurons):
 *   0-49:    Auditory cortex (tonotopic — low freq→low neuron)
 *   50-149:  Visual cortex (retinotopic — 10x10 grid)
 *   150-299: Language area / Wernicke's (text comprehension)
 *
 * No external dependencies. Pure neural current generation.
 */

import { sharedEmbeddings } from './embeddings.js';

const CORTEX_SIZE = 300;
const AUDITORY_START = 0;
const AUDITORY_END = 50;
const VISUAL_START = 50;
const VISUAL_END = 150;
const LANGUAGE_START = 150;
const LANGUAGE_END = 300;

// Visual grid dimensions within visual cortex region
const VIS_COLS = 10;
const VIS_ROWS = 10;

export class SensoryProcessor {
  constructor() {
    // Semantic embeddings — shared singleton (R2 of brain-refactor-full-control).
    // Before R2 sensory had its own instance, language-cortex had none — input
    // semantic grounding was disconnected from output. Now ALL modules share
    // one embedding table so online refinements from conversation flow into
    // generation-time slot scoring.
    this._embeddings = sharedEmbeddings;
    this._embeddingsLoading = this._embeddings.loadPreTrained().catch(() => 0);

    // Pending inputs — brain reads and clears each step
    this._textQueue = [];
    this._audioSpectrum = null;    // Uint8Array from Web Audio analyser
    this._videoFrame = null;       // ImageData or brightness grid
    this._videoCanvas = null;
    this._videoCtx = null;
    this._videoElement = null;

    // Processed current buffers (injected into clusters each brain step)
    this.cortexCurrent = new Float64Array(CORTEX_SIZE);
    this.hippoCurrent = new Float64Array(200);  // hippocampus size
    this.amygdalaCurrent = new Float64Array(150); // amygdala size
    this.bgCurrent = new Float64Array(150);     // basal ganglia — 6 channels × 25 neurons

    // Semantic → motor mapping weights (LEARNABLE via reward)
    // These weights determine how strongly each semantic category excites each BG channel.
    // They start with reasonable priors and get shaped by reward signals over time.
    // BG channels: 0-24=respond_text, 25-49=generate_image, 50-74=speak, 75-99=build_ui, 100-124=listen, 125-149=idle
    this._semanticWeights = {
      respond:  new Float64Array(150), // text response channel weights
      image:    new Float64Array(150), // image generation channel weights
      speak:    new Float64Array(150), // vocalization channel weights
      build:    new Float64Array(150), // UI building channel weights
      listen:   new Float64Array(150), // listen/wait channel weights
      idle:     new Float64Array(150), // idle channel weights
    };
    this._initSemanticWeights();

    // Audio analyser reference
    this._analyser = null;
    this._audioData = null;

    // Vision state
    this._lastFrameTime = 0;
    this._frameInterval = 200; // capture every 200ms (5fps for vision)
    this._cameraStream = null;

    // Salience tracking — how "important" current input is
    this.salience = 0;
    this._prevSalience = 0;
  }

  _initSemanticWeights() {
    // Initialize with biological priors — the brain starts knowing roughly
    // what kinds of input should lead to what kinds of action.
    // These get refined through reward-modulated learning.
    const w = this._semanticWeights;

    // respond_text channel (0-24) — default for most conversational input
    for (let i = 0; i < 25; i++) w.respond[i] = 0.6 + Math.random() * 0.2;

    // generate_image channel (25-49) — visual/creative content
    for (let i = 25; i < 50; i++) w.image[i] = 0.5 + Math.random() * 0.2;

    // speak channel (50-74) — idle vocalization
    for (let i = 50; i < 75; i++) w.speak[i] = 0.2 + Math.random() * 0.1;

    // build_ui channel (75-99) — construction/tool requests
    for (let i = 75; i < 100; i++) w.build[i] = 0.5 + Math.random() * 0.2;

    // listen channel (100-124) — questions directed at user
    for (let i = 100; i < 125; i++) w.listen[i] = 0.3 + Math.random() * 0.1;

    // idle channel (125-149) — low arousal, nothing happening
    for (let i = 125; i < 150; i++) w.idle[i] = 0.4 + Math.random() * 0.1;
  }

  /**
   * Reinforce semantic→motor mapping based on reward.
   * Called by the brain engine when an action succeeds or fails.
   * This is how the BG LEARNS which input patterns lead to which actions.
   *
   * @param {string} action — which action succeeded/failed
   * @param {number} reward — positive = reinforce, negative = weaken
   */
  reinforceSemanticMapping(action, reward) {
    const channelMap = { respond_text: 'respond', generate_image: 'image', speak: 'speak', build_ui: 'build', listen: 'listen', idle: 'idle' };
    const key = channelMap[action];
    if (!key || !this._semanticWeights[key]) return;
    const w = this._semanticWeights[key];
    const lr = 0.01; // learning rate
    for (let i = 0; i < 150; i++) {
      w[i] = Math.max(0, Math.min(2, w[i] + lr * reward * (this.bgCurrent[i] > 0 ? 1 : 0)));
    }
  }

  /**
   * Set the AI provider. No longer used for classification —
   * semantic routing now handled by embeddings + learned BG weights.
   * Kept for backward compatibility.
   */
  setAIProvider(provider) {
    this._aiProvider = provider;
  }

  /**
   * Route text semantically through embedding→BG pathway.
   * The sentence embedding activates BG channels based on learned semantic weights.
   * No external AI call — routing is computed from the equations.
   *
   * The cortex→BG projection weights learn through reward which patterns
   * lead to which actions. With real embeddings, similar requests activate
   * similar cortex patterns, making the projections generalize.
   */
  _semanticRoute(text) {
    if (!this._embeddings._loaded) return;

    const sentenceEmbed = this._embeddings.getSentenceEmbedding(text);
    const w = this._semanticWeights;

    // Compute similarity between sentence embedding and each channel's learned vector
    // The semantic weights encode what KIND of input each BG channel responds to
    const channelKeys = ['respond', 'image', 'speak', 'build', 'listen', 'idle'];
    for (let ch = 0; ch < 6; ch++) {
      const channelWeights = w[channelKeys[ch]];
      let activation = 0;

      // Weight each embedding dimension by the channel's learned sensitivity
      for (let d = 0; d < 50 && d < 25; d++) {
        const bgIdx = ch * 25 + d;
        activation += sentenceEmbed[d] * (channelWeights[bgIdx] || 0.5);
      }

      // Inject proportional current into this BG channel
      const start = ch * 25;
      for (let i = start; i < start + 25; i++) {
        this.bgCurrent[i] += Math.max(0, activation) * 8.0;
      }
    }
  }

  // ── Setup ──────────────────────────────────────────────────────

  /**
   * Connect microphone audio analyser for continuous auditory input.
   */
  setAudioAnalyser(analyser) {
    this._analyser = analyser;
    this._audioData = new Uint8Array(analyser.frequencyBinCount);
  }

  /**
   * Connect camera stream for visual input.
   */
  setCameraStream(stream) {
    this._cameraStream = stream;
    this._videoElement = document.createElement('video');
    this._videoElement.srcObject = stream;
    this._videoElement.setAttribute('playsinline', '');
    this._videoElement.muted = true;
    this._videoElement.style.display = 'none';
    document.body.appendChild(this._videoElement);
    this._videoElement.play();

    this._videoCanvas = document.createElement('canvas');
    this._videoCanvas.width = VIS_COLS;
    this._videoCanvas.height = VIS_ROWS;
    this._videoCtx = this._videoCanvas.getContext('2d', { willReadFrequently: true });
  }

  // ── Input Methods (called by app.js / voice handler) ──────────

  /**
   * Receive text input (from voice transcription or typed).
   * Queued and processed on next brain step.
   */
  receiveText(text) {
    this._textQueue.push(text);
  }

  // ── Processing (called by brain engine each step) ─────────────

  /**
   * Process all pending sensory input and generate neural currents.
   * Called once per brain step by engine.js.
   * Returns current buffers for injection into clusters.
   */
  process() {
    // Decay previous currents (sensory adaptation)
    for (let i = 0; i < CORTEX_SIZE; i++) this.cortexCurrent[i] *= 0.85;
    for (let i = 0; i < 200; i++) this.hippoCurrent[i] *= 0.9;
    for (let i = 0; i < 150; i++) this.amygdalaCurrent[i] *= 0.9;
    for (let i = 0; i < 150; i++) this.bgCurrent[i] *= 0.85;

    this._prevSalience = this.salience;
    this.salience = 0;

    // Process each modality
    this._processAudio();
    this._processVision();
    this._processText();

    return {
      cortex: this.cortexCurrent,
      hippocampus: this.hippoCurrent,
      amygdala: this.amygdalaCurrent,
      basalGanglia: this.bgCurrent,
      salience: this.salience,
      salienceChange: this.salience - this._prevSalience,
    };
  }

  // ── Auditory Cortex ───────────────────────────────────────────
  // Tonotopic organization: low frequencies → low neuron indices
  // Speech frequencies (300-3000Hz) get cortical magnification

  _processAudio() {
    if (!this._analyser || !this._audioData) return;

    this._analyser.getByteFrequencyData(this._audioData);
    const specLen = this._audioData.length;
    const neuronCount = AUDITORY_END - AUDITORY_START; // 50 neurons

    // Map frequency bins to auditory cortex neurons
    // More bins per neuron for speech frequencies (cortical magnification)
    let totalEnergy = 0;
    for (let n = 0; n < neuronCount; n++) {
      // Non-linear mapping: more resolution in speech range (bins 5-40 out of 128)
      const t = n / neuronCount;
      // Emphasize 300-3000Hz region (roughly bins 5-40 for 44.1kHz sample rate)
      const binStart = Math.floor(t * t * specLen * 0.8); // quadratic = more low-freq bins
      const binEnd = Math.min(specLen, binStart + Math.max(1, Math.floor(specLen / neuronCount)));

      let sum = 0;
      for (let b = binStart; b < binEnd; b++) {
        sum += this._audioData[b];
      }
      const avg = sum / (binEnd - binStart) / 255; // normalize 0-1

      // Convert to neural current (need ~15+ to reach LIF threshold)
      const current = avg * 20; // loud sounds = strong current
      this.cortexCurrent[AUDITORY_START + n] += current;
      totalEnergy += avg;
    }

    // Salience from audio — sudden loud sounds are salient
    this.salience += totalEnergy / neuronCount;

    // Loud audio also excites amygdala (startle response)
    const avgEnergy = totalEnergy / neuronCount;
    if (avgEnergy > 0.3) {
      for (let i = 0; i < 20; i++) {
        this.amygdalaCurrent[i] += avgEnergy * 8;
      }
    }
  }

  // ── Visual Cortex ─────────────────────────────────────────────
  // Retinotopic organization: pixel grid → neuron grid
  // V1 responds to brightness changes (edge-like)

  _processVision() {
    if (!this._videoElement || !this._videoCtx) return;

    const now = performance.now();
    if (now - this._lastFrameTime < this._frameInterval) return;
    this._lastFrameTime = now;

    // Capture frame at low resolution (10x10)
    this._videoCtx.drawImage(this._videoElement, 0, 0, VIS_COLS, VIS_ROWS);
    const imageData = this._videoCtx.getImageData(0, 0, VIS_COLS, VIS_ROWS);
    const pixels = imageData.data;

    let totalBrightness = 0;
    let totalChange = 0;

    for (let y = 0; y < VIS_ROWS; y++) {
      for (let x = 0; x < VIS_COLS; x++) {
        const pixIdx = (y * VIS_COLS + x) * 4;
        const r = pixels[pixIdx];
        const g = pixels[pixIdx + 1];
        const b = pixels[pixIdx + 2];
        const brightness = (r + g + b) / (3 * 255); // 0-1

        const neuronIdx = VISUAL_START + y * VIS_COLS + x;

        // V1-like response: responds to brightness AND changes
        const prevCurrent = this.cortexCurrent[neuronIdx];
        const newCurrent = brightness * 12; // scale to neural current
        const change = Math.abs(newCurrent - prevCurrent);

        // Edge detection: neurons fire more for brightness changes (temporal contrast)
        this.cortexCurrent[neuronIdx] = newCurrent + change * 5;

        totalBrightness += brightness;
        totalChange += change;
      }
    }

    // Visual salience — high contrast / movement is salient
    this.salience += totalChange / (VIS_COLS * VIS_ROWS) * 2;
  }

  // ── Language Processing (Wernicke's Area) ─────────────────────
  // Text hashed into language cortex region with semantic structure

  _processText() {
    if (this._textQueue.length === 0) return;

    // Process all queued text
    while (this._textQueue.length > 0) {
      const text = this._textQueue.shift();
      this._processTextInput(text);
    }
  }

  _processTextInput(text) {
    const languageSize = LANGUAGE_END - LANGUAGE_START; // 150 neurons

    // Semantic embedding path — real word vectors into Wernicke's area
    if (this._embeddings._loaded) {
      // Map sentence embedding to cortex neurons
      const sentenceEmbed = this._embeddings.getSentenceEmbedding(text);
      const cortexCurrents = this._embeddings.mapToCortex(sentenceEmbed, CORTEX_SIZE, LANGUAGE_START);
      for (let i = LANGUAGE_START; i < LANGUAGE_END; i++) {
        this.cortexCurrent[i] += cortexCurrents[i];
      }

      // Also process individual words for finer-grained activation
      const words = text.toLowerCase().replace(/[^a-z' -]/g, '').split(/\s+/).filter(w => w.length >= 2);
      for (const word of words) {
        const wordEmbed = this._embeddings.getEmbedding(word);
        // Each word gets a lighter activation on top of sentence embedding
        for (let d = 0; d < 50 && d < languageSize; d++) {
          const idx = LANGUAGE_START + d * Math.floor(languageSize / 50);
          if (idx < LANGUAGE_END) {
            this.cortexCurrent[idx] += wordEmbed[d] * 3.0;
          }
        }
      }

      // Learn from context — refine embeddings online
      for (let i = 0; i < words.length; i++) {
        // Context = surrounding words
        const contextWords = words.filter((_, j) => j !== i).slice(0, 5);
        if (contextWords.length > 0) {
          // ⛔ DIMENSION BUG, FIXED 2026-08-25. This built the context vector
          // at a hardcoded 50 dimensions while embeddings are EMBED_DIM = 300.
          // `refineFromContext` iterates all 300, so `contextEmbedding[i]` for
          // i >= 50 read `undefined` off a Float32Array(50); `undefined - x`
          // is NaN, and `delta[i] += lr * NaN` is NaN.
          //
          // Reproduced exactly: **250 of 300 dimensions became NaN**, and the
          // refinement map is PERSISTED — so the poison was durable, and
          // `getEmbedding` adds the delta then normalises, which turns the
          // whole vector NaN rather than just the damaged tail.
          //
          // ⚠ Browser-brain only — `sensory.js` is imported by
          // `js/brain/engine.js`, which only `js/app.js` loads. The deployed
          // server never runs this path, so no trained state on the box was
          // affected. Same blast radius as the dead vision subscriber.
          //
          // ⭐ The wider point for the learned-geometry work: this is the ONLY
          // call site of `refineFromContext` in the entire tree. The machinery
          // for "geometry she learns herself" already exists — it has simply
          // never run anywhere that matters, and where it did run it produced
          // NaN.
          // ⚠ The dimension is DERIVED FROM A REAL VECTOR, not from a
          // constant. A hardcoded number here is precisely what broke: this
          // was written when the embedding dim genuinely WAS 50, and when it
          // was lifted to 300 this call site was not updated. Reading the
          // length off an actual embedding cannot go stale that way.
          const probe = this._embeddings.getEmbedding(contextWords[0]);
          const dim = (probe && probe.length) || 0;
          if (!dim) continue;   // no usable vector — refine nothing rather than refine noise
          const contextEmbed = new Float32Array(dim);
          for (const cw of contextWords) {
            const ce = this._embeddings.getEmbedding(cw);
            const n = Math.min(dim, ce.length);
            for (let d = 0; d < n; d++) contextEmbed[d] += ce[d] / contextWords.length;
          }
          this._embeddings.refineFromContext(words[i], contextEmbed, 0.005);
        }
      }
    } else {
      // Fallback: Hash text into language area — each character activates specific neurons
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        const neuronIdx = LANGUAGE_START + ((code * 31 + i * 7) % languageSize);
        this.cortexCurrent[neuronIdx] += 8.0;
        if (neuronIdx > LANGUAGE_START) this.cortexCurrent[neuronIdx - 1] += 3.0;
        if (neuronIdx < LANGUAGE_END - 1) this.cortexCurrent[neuronIdx + 1] += 3.0;
      }
    }

    // Text also goes to hippocampus for memory formation
    // Use sentence embedding for semantic memory when available
    if (this._embeddings._loaded) {
      const sentenceEmbed = this._embeddings.getSentenceEmbedding(text);
      for (let i = 0; i < 200; i++) {
        const embedIdx = i % 50;
        this.hippoCurrent[i] += sentenceEmbed[embedIdx] * 5.0;
      }
    } else {
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        const hippoIdx = (code * 13 + i * 11) % 200;
        this.hippoCurrent[hippoIdx] += 5.0;
      }
    }

    // Social input excites amygdala (someone is talking to us)
    for (let i = 0; i < 30; i++) {
      this.amygdalaCurrent[i] += 4.0;
    }

    // Text input is always salient
    this.salience += 0.5 + text.length * 0.01;

    // ── SEMANTIC → BASAL GANGLIA ──
    // Text → cortex (Wernicke's) → cortex→BG projection (LEARNED weights) → BG channels.
    // The projection weights ARE the dictionary: ΔW = η · δ · cortex · BG
    // Shaped by reward-modulated Hebbian plasticity over time.
    //
    // BOOTSTRAP: until the projection weights have learned enough, the AI model
    // classifies intent and injects current directly. This is Broca's area
    // short-circuiting the slow learning pathway — like how a child first
    // imitates before internalizing. The classification weakens as projections
    // strengthen. Eventually the brain routes semantics purely through
    // cortex→BG neural dynamics.
    this._semanticRoute(text);

    // Default respond bias (most inputs are conversational)
    for (let i = 0; i < 25; i++) this.bgCurrent[i] += 3.0;

    // Emotional response handled by cortex→amygdala projection weights.
    // All text gets a small amygdala bump (social input = someone talking).
    // The projection learns emotional patterns through reward.
    for (let i = 0; i < 15; i++) this.amygdalaCurrent[i] += 3.0;
  }

  // ── Accessors ─────────────────────────────────────────────────

  hasCamera() { return this._cameraStream !== null; }
  hasAudio() { return this._analyser !== null; }

  destroy() {
    if (this._videoElement) this._videoElement.remove();
    if (this._cameraStream) this._cameraStream.getTracks().forEach(t => t.stop());
  }
}
