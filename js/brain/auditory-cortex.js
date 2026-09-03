/**
 * auditory-cortex.js — Tonotopic auditory processing
 *
 * Maps raw audio spectrum from Web Audio API to neural current
 * in the cortex auditory region (neurons 0-49).
 *
 * Organization:
 *   Tonotopic: low frequencies → low neuron indices
 *   Cortical magnification: speech frequencies (300-3000Hz) get
 *   more neurons than the same bandwidth at other frequencies
 *
 * The auditory cortex processes CONTINUOUSLY — not just when the
 * user is speaking. Unity HEARS ambient sound as neural activity.
 *
 * Amygdala arousal modulates gain:
 *   High arousal = hypersensitive hearing
 *   Low arousal = Unity isn't really listening
 */

const AUDITORY_NEURONS = 50;

export class AuditoryCortex {
  constructor() {
    this._analyser = null;
    this._audioData = null;
    this._active = false;

    // Output current for cortex auditory region
    this.currents = new Float64Array(AUDITORY_NEURONS);

    // Frequency band energies (for monitoring/display)
    this.bandEnergy = {
      subBass: 0,    // 20-60Hz
      bass: 0,       // 60-250Hz
      lowMid: 0,     // 250-500Hz
      mid: 0,        // 500-2000Hz (speech fundamental)
      highMid: 0,    // 2000-4000Hz (speech consonants)
      presence: 0,   // 4000-6000Hz
      brilliance: 0, // 6000-20000Hz
    };

    // Total energy and speech energy (for speech detection)
    this.totalEnergy = 0;
    this.speechEnergy = 0;
    this.isSpeechDetected = false;
    this._speechThreshold = 0.15;

    // Gain modulation from amygdala
    this.gain = 1.0;

    // Echo detection — auditory cortex compares incoming speech
    // against motor cortex output (what we're currently saying).
    // If they match, it's self-produced speech (efference copy).
    // If they don't match, it's external speech — interrupt.
    this._motorOutput = '';  // what Unity is currently saying
    this.isEcho = false;     // true = heard speech matches our own output
    this.isExternalSpeech = false; // true = someone else is talking

    // Per-phoneme auditory attractor templates.
    // Parallel to the visual letter templates: each unique phoneme
    // symbol the brain hears gets a deterministic trig-hash signature
    // the cortex auditory sub-region receives on every exposure. For
    // voice-capable Unity, the spectrum bins from `process()` will
    // eventually replace this synthetic template with real per-phoneme
    // spectral fingerprints, but the downstream contract
    // (`cluster.injectEmbeddingToRegion('auditory', template, ...)`)
    // stays identical — only the template source changes.
    this._phonemeTemplateCache = new Map();
    this._phonemeTemplateDim = 48;
  }

  /**
   * Render a deterministic auditory template for a phoneme.
   *
   * Text-only Unity doesn't have mic input rendering spoken phonemes,
   * so the auditory template has to come from somewhere. This method
   * generates a stable L2-normalized Float64Array from the phoneme
   * symbol's codepoint via a trig hash that's seeded differently from
   * the visual letter hash — the visual and auditory sub-regions
   * converge on the phon region via the cross-projections, and
   * they have to arrive from uncorrelated starting points so curriculum
   * Hebbian can shape their convergence as a learned correspondence
   * rather than a trivial identity mapping.
   *
   * Called from `cluster.readText` (text-path subvocalization — silent
   * reading activates auditory cortex via covert articulation per
   * Pulvermüller 2005 Nat Rev Neurosci 6:576) or from the voice-input
   * pathway once that is wired) to drive the cortex auditory region
   * before downstream propagation to phon region. Over curriculum
   * exposure the auditory↔phon cross-projection learns that spoken /k/
   * activates the same phon basin as visual letter "c" — the dual-stream
   * convergence from Hickok & Poeppel 2007.
   *
   * @param {string} phoneme — symbol for the phoneme (e.g. 'a', 'k', '/ʃ/')
   * @returns {Float64Array} — L2-normalized template of length _phonemeTemplateDim
   */
  renderPhonemeTemplate(phoneme) {
    if (!phoneme || typeof phoneme !== 'string' || phoneme.length === 0) {
      return new Float64Array(this._phonemeTemplateDim);
    }
    const key = phoneme.toLowerCase();
    const cached = this._phonemeTemplateCache.get(key);
    if (cached) return cached;
    const cp = key.codePointAt(0) || 0;
    const out = new Float64Array(this._phonemeTemplateDim);
    // Auditory prime seeds — DIFFERENT from the visual cortex's
    // primes so visual/auditory templates for the same symbol do NOT
    // trivially match. Convergence on phon region is a LEARNED
    // correspondence, not a hash coincidence.
    const PRIMES = [41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89];
    for (let i = 0; i < this._phonemeTemplateDim; i++) {
      const p = PRIMES[i % PRIMES.length];
      const phase = (i * 0.23) + 0.59;
      out[i] = Math.sin(cp * 0.5236 * p + phase)
             + Math.cos(cp * 0.8660 * p + phase * 3);
    }
    let norm = 0;
    for (let i = 0; i < out.length; i++) norm += out[i] * out[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    this._phonemeTemplateCache.set(key, out);
    return out;
  }

  /**
   * Set what the motor cortex is currently outputting (Unity's speech).
   * Used for efference copy — comparing self-produced vs external sound.
   * This is how the real auditory system works: the brain predicts what
   * it will hear from its own voice and suppresses that signal.
   */
  setMotorOutput(text) {
    this._motorOutput = text;
  }

  clearMotorOutput() {
    this._motorOutput = '';
    this.isEcho = false;
  }

  /**
   * Check if heard text is echo of our own speech or external input.
   * Returns true if the user is actually talking (not echo).
   */
  checkForInterruption(heardText) {
    if (!this._motorOutput) {
      // Not speaking — any input is real
      this.isEcho = false;
      this.isExternalSpeech = true;
      return true;
    }

    const heard = heardText.toLowerCase().trim();
    const ours = this._motorOutput.toLowerCase();
    const words = heard.split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return false;

    const matchCount = words.filter(w => ours.includes(w)).length;
    const matchRatio = matchCount / words.length;

    this.isEcho = matchRatio > 0.5;
    this.isExternalSpeech = !this.isEcho;
    return this.isExternalSpeech;
  }

  /**
   * R7 — unified sensory peripheral interface.
   *
   * Auditory cortex follows the same contract as visual cortex:
   *   init(stream)  — attach to an AnalyserNode from Web Audio API
   *   process(dt)   — one tick, returns Float64Array of cortex currents
   *   destroy()     — release analyser reference for GC
   *
   * The Web Audio API analyser node is created in app.js from the
   * mic MediaStream. The cortex only needs the analyser handle to
   * sample frequency bins; lifecycle of the MediaStream is owned by
   * the caller (app.js).
   */
  init(analyser) {
    this._analyser = analyser;
    this._audioData = new Uint8Array(analyser.frequencyBinCount);
    this._active = true;
  }

  /**
   * R7 — unified destroy hook. Drops the analyser reference and
   * clears the frequency buffer. Safe to call multiple times.
   * The MediaStream that backed the analyser is owned by app.js
   * and stays alive for the mic muting path.
   */
  destroy() {
    this._active = false;
    this._analyser = null;
    this._audioData = null;
    this._motorOutput = null;
    this._heardBuffer = [];
  }

  /**
   * Set gain from amygdala arousal — high arousal = sensitive hearing.
   */
  setGain(arousal) {
    // arousal 0-1 → gain 0.3-2.0
    this.gain = 0.3 + arousal * 1.7;
  }

  /**
   * Process one frame of audio input.
   * Returns currents for cortex auditory region.
   *
   * @returns {Float64Array} — 50-element current array for cortex neurons 0-49
   */
  process() {
    // Decay previous currents
    for (let i = 0; i < AUDITORY_NEURONS; i++) {
      this.currents[i] *= 0.7;
    }

    if (!this._active || !this._analyser) return this.currents;

    this._analyser.getByteFrequencyData(this._audioData);
    const binCount = this._audioData.length;
    const sampleRate = this._analyser.context?.sampleRate || 44100;
    const binHz = sampleRate / (this._analyser.fftSize || 2048);

    // Map frequency bins to neurons with tonotopic organization
    // Speech frequencies (250-4000Hz) get cortical magnification
    let totalE = 0, speechE = 0;

    // Reset band energies
    for (const k in this.bandEnergy) this.bandEnergy[k] = 0;

    for (let bin = 0; bin < binCount; bin++) {
      const freq = bin * binHz;
      const amplitude = this._audioData[bin] / 255; // 0-1

      // Classify into frequency bands
      if (freq < 60) this.bandEnergy.subBass += amplitude;
      else if (freq < 250) this.bandEnergy.bass += amplitude;
      else if (freq < 500) this.bandEnergy.lowMid += amplitude;
      else if (freq < 2000) { this.bandEnergy.mid += amplitude; speechE += amplitude; }
      else if (freq < 4000) { this.bandEnergy.highMid += amplitude; speechE += amplitude; }
      else if (freq < 6000) this.bandEnergy.presence += amplitude;
      else this.bandEnergy.brilliance += amplitude;

      totalE += amplitude;

      // Map to neuron index — cortical magnification for speech
      let neuronIdx;
      if (freq < 250) {
        // Low freq: neurons 0-9 (10 neurons for 0-250Hz)
        neuronIdx = Math.floor((freq / 250) * 10);
      } else if (freq < 4000) {
        // Speech range: neurons 10-39 (30 neurons for 250-4000Hz — magnified!)
        neuronIdx = 10 + Math.floor(((freq - 250) / 3750) * 30);
      } else {
        // High freq: neurons 40-49 (10 neurons for 4000-20000Hz)
        neuronIdx = 40 + Math.floor(((freq - 4000) / 16000) * 10);
      }
      neuronIdx = Math.max(0, Math.min(AUDITORY_NEURONS - 1, neuronIdx));

      // Add to current with gain modulation
      this.currents[neuronIdx] += amplitude * 15 * this.gain;
    }

    this.totalEnergy = totalE / binCount;
    this.speechEnergy = speechE / Math.max(1, binCount * 0.3); // normalize to speech bin count
    this.isSpeechDetected = this.speechEnergy > this._speechThreshold;

    return this.currents;
  }

  isActive() { return this._active; }

  /**
   * T1 2026-04-13 — return the Web Audio AnalyserNode this cortex
   * is attached to, so viz panels can read frequency data without
   * keeping a separate handle to the raw MediaStream + running
   * their own analyser graph. Single source of truth: whoever
   * wants to render the frequency spectrum reads through
   * AuditoryCortex.
   */
  getAnalyser() { return this._analyser || null; }

  getState() {
    return {
      totalEnergy: this.totalEnergy,
      speechEnergy: this.speechEnergy,
      isSpeechDetected: this.isSpeechDetected,
      gain: this.gain,
      bandEnergy: { ...this.bandEnergy },
    };
  }
}
