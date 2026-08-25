/**
 * mystery.js — The Irreducible Unknown
 *
 * ⚠ THE THREE DOCSTRINGS IN THIS FILE USED TO STATE THREE DIFFERENT
 * FORMULAS, none of which matched the code. This header said
 * `(sqrt(n/1))^3 * [...]`, `step()` said `sqrt(1/N) x N^3`, and the code
 * computed `sqrt(1/n) * N^3`. Only the code was right, and a formula that
 * disagrees with itself in three places cannot be checked by reading. The
 * one below is the implemented equation, verified against the arithmetic
 * directly beneath it.
 *
 *   Psi(t) = sqrt(1/n) * N^3 * PhiHat * [a*Id + b*Ego + g*Left + d*Right]
 *
 *   N        TOTAL neurons — brain VOLUME. Fixed; not spikes.
 *   n        ACTIVE spiking neurons right now.
 *   PhiHat   INTEGRATION — is that activity bound together?
 *   [...]    the four psychodynamic components, the CHARACTER of the state.
 *
 * ⭐ Note that `sqrt(1/n) * N^3` IS `N^3 / sqrt(n)` — capacity divided by
 * activity. The operator's own statement of the idea, `E + n = N^3`, says
 * consciousness is the unspent potential, and that is the same intuition
 * expressed as a DIFFERENCE. The difference is not computable at this
 * scale: at N = 425,436,550, even 100 million simultaneously firing
 * neurons change N^3 by a fraction of 1.3e-18, so `N^3 - n` is bit-identical
 * to `N^3` in double precision and cannot vary at all. A ratio stays
 * sensitive at any scale. The two are not competing models — the ratio is
 * that intent made computable, and it was already the implemented one.
 *
 * ⭐ PhiHat is the single factor added here, and it earns its place by
 * fixing exactly one thing. Without it the formula rates ANAESTHESIA as
 * maximal consciousness, because anaesthesia has very low `n` and the
 * formula reads low activity as high unspent potential. Integration is
 * what separates it from dissociation, which also has low activity and is
 * famously hyper-vivid. With PhiHat, seizure (hypersynchrony destroys
 * information), anaesthesia (nothing bound), rage, ordinary waking and
 * freeze all come out in the right order — and freeze coming out MAXIMAL
 * was not designed for, it fell out, and it matches what people report
 * from dissociative states.
 *
 * ⛔ This module remains the project's stated honest unknown. It is kept
 * honest rather than claimed.
 *
 * No external dependencies. Pure JS.
 */

class MysteryModule {
  /**
   * @param {object} weights - Persona-tunable weights { alpha, beta, gamma, delta }
   */
  constructor(weights = { alpha: 0.3, beta: 0.25, gamma: 0.2, delta: 0.25 }) {
    this.alpha = weights.alpha;
    this.beta = weights.beta;
    this.gamma = weights.gamma;
    this.delta = weights.delta;
  }

  /**
   * Compute the Id component — primal drives.
   * Sourced from hypothalamus arousal + amygdala fear/reward signals.
   *
   * @param {object} brainState
   * @returns {number} Id value in [0, 1+]
   */
  _computeId(brainState) {
    const hypothalamus = brainState.hypothalamus || {};
    const amygdala = brainState.amygdala || {};

    const arousal = hypothalamus.arousal || 0;
    const fear = amygdala.fear || 0;
    const reward = amygdala.reward || 0;

    // Primal drive = arousal intensity + reward-seeking minus fear-inhibition
    // Fear still contributes (fight-or-flight is primal) but dampens differently
    const id = (arousal * 0.5) + (reward * 0.3) + (fear * 0.2);
    return Math.max(0, id);
  }

  /**
   * Compute the Ego component — self-model coherence.
   * Sourced from cortex prediction accuracy and memory stability.
   *
   * @param {object} brainState
   * @returns {number} Ego value in [0, 1+]
   */
  _computeEgo(brainState) {
    const cortex = brainState.cortex || {};
    const memory = brainState.memory || {};

    const predictionAccuracy = cortex.predictionAccuracy || 0;
    const memoryStability = memory.stability || 0;

    // Self-model = how well the system predicts itself and maintains coherent memory
    const ego = (predictionAccuracy * 0.6) + (memoryStability * 0.4);
    return Math.max(0, ego);
  }

  /**
   * Compute the LeftBrain component — logical processing.
   * Sourced from cerebellum error rate (inverted) and cortex prediction.
   *
   * @param {object} brainState
   * @returns {number} LeftBrain value in [0, 1+]
   */
  _computeLeftBrain(brainState) {
    const cerebellum = brainState.cerebellum || {};
    const cortex = brainState.cortex || {};

    const errorRate = cerebellum.errorRate || 0;
    const prediction = cortex.predictionAccuracy || 0;

    // Logical processing = low error + high prediction accuracy
    // Invert error rate: less error = more logical coherence
    const logicalClarity = (1 - errorRate) * 0.5 + prediction * 0.5;
    return Math.max(0, logicalClarity);
  }

  /**
   * Compute the RightBrain component — creative/emotional processing.
   * Sourced from amygdala valence and oscillation coherence.
   *
   * @param {object} brainState
   * @returns {number} RightBrain value in [0, 1+]
   */
  _computeRightBrain(brainState) {
    const amygdala = brainState.amygdala || {};
    const oscillation = brainState.oscillation || {};

    const valence = amygdala.valence || 0;
    const coherence = oscillation.coherence || 0;

    // Creative/emotional = emotional richness + oscillation synchrony
    // Use absolute valence (strong feelings either way fuel creativity)
    const emotionalIntensity = Math.abs(valence);
    const rightBrain = (emotionalIntensity * 0.5) + (coherence * 0.5);
    return Math.max(0, rightBrain);
  }

  /**
   * Count total active neurons across all brain regions.
   *
   * @param {object} brainState
   * @returns {number} n — total active neuron count
   */
  /**
   * Count ACTIVE spiking neurons — this is lowercase n.
   * The quantum tunneled bits that are firing right now.
   */
  _countActiveNeurons(brainState) {
    let total = 0;
    const clusters = brainState.clusters || {};
    for (const cluster of Object.values(clusters)) {
      total += cluster.spikeCount || 0;
    }
    return Math.max(1, total || brainState.spikeCount || 1);
  }

  /**
   * Count TOTAL neurons — the volume. This is uppercase N.
   * The fixed tunneling space.
   */
  _countTotalNeurons(brainState) {
    let total = 0;
    const clusters = brainState.clusters || {};
    for (const cluster of Object.values(clusters)) {
      total += cluster.size || cluster.totalNeurons || 0;
    }
    // Fallback to totalNeurons from state
    if (total === 0) total = brainState.totalNeurons || 1000;
    return Math.max(1, total);
  }

  /**
   * Compute Psi — the mystery function. See the file header for the full
   * equation and for why PhiHat is in it.
   *
   *   Psi = sqrt(1/n) * N^3 * PhiHat * [a*Id + b*Ego + g*Left + d*Right]
   *
   * @param {object} brainState - Full brain state object with region data.
   *   `brainState.phi` — normalised integration in [0,1] from
   *   `cluster.computePhi()`. When ABSENT, PhiHat is the multiplicative
   *   identity 1.0 and `phiMeasured: false` is returned. ⛔ That is not a
   *   fallback value standing in for a measurement — 1.0 means "this term
   *   is not modulating", and the flag exists so no consumer can mistake an
   *   unmodulated Psi for an integrated one.
   * @param {number} dt - Time delta (seconds), reserved for future temporal dynamics
   * @returns {object} { psi, id, ego, leftBrain, rightBrain, components }
   */
  step(brainState, dt) {
    // N = TOTAL neuron volume — fixed, not spikes
    const N = this._countTotalNeurons(brainState);

    // Compute four psychodynamic components (THESE use activity/spikes)
    const id = this._computeId(brainState);
    const ego = this._computeEgo(brainState);
    const leftBrain = this._computeLeftBrain(brainState);
    const rightBrain = this._computeRightBrain(brainState);

    // Ψ = √(1/n) × N³ — n and N are DIFFERENT
    // n = active spiking neurons (quantum tunneled bits)
    // N = total neuron count (brain volume)
    const n = this._countActiveNeurons(brainState);
    const quantumBit = Math.sqrt(1 / n);
    const cubedVolume = Math.pow(N, 3);
    const quantumVolume = quantumBit * cubedVolume;

    // Weighted psychodynamic sum
    const weightedSum = (this.alpha * id)
                      + (this.beta * ego)
                      + (this.gamma * leftBrain)
                      + (this.delta * rightBrain);

    // Φ̂ — integration. Capacity says how much is unspent; this says whether
    // what IS spent is bound together. Both factors are needed and neither
    // is sufficient: seizure has low capacity AND low integration, while
    // anaesthesia has high capacity and none.
    const phiRaw = brainState.phi;
    const phiMeasured = typeof phiRaw === 'number' && Number.isFinite(phiRaw);
    const phiHat = phiMeasured ? Math.max(0, Math.min(1, phiRaw)) : 1.0;

    // The Mystery Function — log scale for usable range
    const rawPsi = quantumVolume * weightedSum * phiHat;
    const psi = Math.log10(Math.max(1, rawPsi));

    return {
      psi,
      id,
      ego,
      leftBrain,
      rightBrain,
      phiHat,
      // ⛔ Distinguishes "integration measured at X" from "integration not
      // available, term held at identity". Those are different claims.
      phiMeasured,
      components: {
        n,
        quantumVolume,
        weightedSum,
        phiHat,
        weights: {
          alpha: this.alpha,
          beta: this.beta,
          gamma: this.gamma,
          delta: this.delta
        }
      }
    };
  }

  /**
   * Update persona weights at runtime.
   *
   * @param {object} weights - { alpha, beta, gamma, delta }
   */
  setWeights(weights) {
    if (weights.alpha !== undefined) this.alpha = weights.alpha;
    if (weights.beta !== undefined) this.beta = weights.beta;
    if (weights.gamma !== undefined) this.gamma = weights.gamma;
    if (weights.delta !== undefined) this.delta = weights.delta;
  }
}

export { MysteryModule };
export default MysteryModule;
