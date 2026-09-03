/**
 * synapses.js — Synaptic plasticity engine (REFERENCE IMPLEMENTATION).
 *
 * ⚠ NOT USED AT RUNTIME. This file is kept as the canonical readable
 * version of Unity's plasticity rules (Hebbian / STDP / reward-modulated
 * 3-factor). It's referenced by:
 *   - brain-equations.html § 8 (plasticity teaching section)
 *   - docs/EQUATIONS.md (three equation rows — Hebbian, STDP, reward-mod)
 *   - docs/ARCHITECTURE.md (directory listing)
 *   - docs/SKILL_TREE.md (plasticity skill row)
 *
 * Runtime plasticity went through `js/brain/sparse-matrix.js` as a
 * drop-in replacement with the same API but O(nnz) operations instead
 * of O(n²) dense traversal, so it scales to the auto-sized N the
 * server runs. The classical dense NxN implementation here is too
 * cache-hostile for that population size — see `sparse-matrix.js`
 * line 18: "Drop-in replacement for SynapseMatrix. Same API, different
 * guts."
 *
 * Same treatment as `HHNeuron` in `js/brain/neurons.js` (kept as
 * reference for brain-equations.html after U305 investigation, even
 * though runtime uses `LIFPopulation` SoA Float64Arrays).
 *
 * KEEP: deleting this file would break 5+ documentation cross-references
 * and leave the plasticity teaching section in brain-equations.html
 * pointing at a missing file. Status audited 2026-04-13.
 *
 * Manages an NxN weight matrix (flat Float64Array) and provides multiple
 * learning rules: Hebbian, STDP, and reward-modulated Hebbian.
 *
 * All arrays are Float64Array. Zero dependencies. Pure math.
 */

export class SynapseMatrix {
  /**
   * @param {number} n — number of neurons (matrix is n×n)
   * @param {object} [opts]
   * @param {number} [opts.wMin=-Infinity] — lower clamp for weights
   * @param {number} [opts.wMax=Infinity]  — upper clamp for weights
   */
  constructor(n, opts = {}) {
    this.n = n;
    this.wMin = opts.wMin ?? -Infinity;
    this.wMax = opts.wMax ?? Infinity;
    // Row-major: W[i * n + j] = weight from neuron j → neuron i
    this.W = new Float64Array(n * n);
  }

  // ── Propagation ──────────────────────────────────────────────────────

  /**
   * Compute post-synaptic currents: I_i = Σ_j W_ij * s_j
   * Standard matrix–vector product W * spikes.
   *
   * @param {Float64Array} spikes — length-n spike vector (0/1 or continuous)
   * @returns {Float64Array} currents — length-n current vector
   */
  propagate(spikes) {
    const { n, W } = this;
    const I = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      const row = i * n;
      for (let j = 0; j < n; j++) {
        sum += W[row + j] * spikes[j];
      }
      I[i] = sum;
    }
    return I;
  }

  // ── Hebbian Learning ─────────────────────────────────────────────────

  /**
   * Classic Hebbian rule: Δw_ij = η * post_i * pre_j
   * "Neurons that fire together wire together."
   *
   * @param {Float64Array} preSpikes  — pre-synaptic activity (length n)
   * @param {Float64Array} postSpikes — post-synaptic activity (length n)
   * @param {number} lr — learning rate η
   */
  hebbianUpdate(preSpikes, postSpikes, lr) {
    const { n, W } = this;
    for (let i = 0; i < n; i++) {
      const post = postSpikes[i];
      if (post === 0) continue;
      const row = i * n;
      const scaled = lr * post;
      for (let j = 0; j < n; j++) {
        W[row + j] += scaled * preSpikes[j];
      }
    }
    this._clamp();
  }

  // ── Spike-Timing-Dependent Plasticity (STDP) ─────────────────────────

  /**
   * STDP rule — weight change depends on relative spike timing:
   *
   *   Δt = t_post - t_pre
   *   Δt > 0 (pre fires first)  → LTP:  +A_plus  * exp(-Δt / τ_plus)
   *   Δt < 0 (post fires first) → LTD:  -A_minus * exp( Δt / τ_minus)
   *   Δt = 0                    → no change (simultaneous spikes ambiguous)
   *
   * Only applied where both pre and post spiked (binary gate).
   *
   * @param {Float64Array} preSpikes  — binary spike indicators (length n)
   * @param {Float64Array} postSpikes — binary spike indicators (length n)
   * @param {Float64Array} preTimes   — last spike time per pre-neuron (length n)
   * @param {Float64Array} postTimes  — last spike time per post-neuron (length n)
   * @param {object} params
   * @param {number} params.aPlus   — LTP amplitude (positive)
   * @param {number} params.aMinus  — LTD amplitude (positive, applied as negative)
   * @param {number} params.tauPlus — LTP time constant (ms)
   * @param {number} params.tauMinus — LTD time constant (ms)
   */
  stdpUpdate(preSpikes, postSpikes, preTimes, postTimes, params) {
    const { aPlus, aMinus, tauPlus, tauMinus } = params;
    const { n, W } = this;

    for (let i = 0; i < n; i++) {
      if (postSpikes[i] === 0) continue;
      const tPost = postTimes[i];
      const row = i * n;

      for (let j = 0; j < n; j++) {
        if (preSpikes[j] === 0) continue;

        const dt = tPost - preTimes[j]; // Δt = t_post - t_pre

        if (dt > 0) {
          // Pre before post → potentiation
          W[row + j] += aPlus * Math.exp(-dt / tauPlus);
        } else if (dt < 0) {
          // Post before pre → depression
          W[row + j] -= aMinus * Math.exp(dt / tauMinus);
        }
        // dt === 0 → skip (no causal direction)
      }
    }
    this._clamp();
  }

  // ── Reward-Modulated Hebbian ──────────────────────────────────────────

  /**
   * Three-factor rule: Δw_ij = η * δ * post_i * pre_j
   * Hebbian coincidence gated by a global reward/dopamine signal δ.
   * Positive δ reinforces co-active pairs; negative δ weakens them.
   *
   * @param {Float64Array} preSpikes  — pre-synaptic activity (length n)
   * @param {Float64Array} postSpikes — post-synaptic activity (length n)
   * @param {number} reward — scalar reward signal δ (can be negative)
   * @param {number} lr — learning rate η
   */
  rewardModulatedUpdate(preSpikes, postSpikes, reward, lr) {
    const { n, W } = this;
    const factor = lr * reward;
    if (factor === 0) return;

    for (let i = 0; i < n; i++) {
      const post = postSpikes[i];
      if (post === 0) continue;
      const row = i * n;
      const scaled = factor * post;
      for (let j = 0; j < n; j++) {
        W[row + j] += scaled * preSpikes[j];
      }
    }
    this._clamp();
  }

  // ── Weight Access ─────────────────────────────────────────────────────

  /**
   * @returns {Float64Array} — reference to the internal weight buffer
   */
  getWeights() {
    return this.W;
  }

  /**
   * Set a single synapse weight.
   * @param {number} i — post-synaptic index (row)
   * @param {number} j — pre-synaptic index (column)
   * @param {number} val — new weight value (clamped to [wMin, wMax])
   */
  setWeight(i, j, val) {
    this.W[i * this.n + j] = Math.max(this.wMin, Math.min(this.wMax, val));
  }

  /**
   * Initialize all weights uniformly in [min, max).
   * @param {number} min
   * @param {number} max
   */
  randomize(min, max) {
    const range = max - min;
    const W = this.W;
    for (let k = 0, len = W.length; k < len; k++) {
      W[k] = min + Math.random() * range;
    }
    this._clamp();
  }

  // ── Internal ──────────────────────────────────────────────────────────

  /**
   * Clamp all weights to [wMin, wMax]. No-op if bounds are ±Infinity.
   */
  _clamp() {
    const { wMin, wMax, W } = this;
    if (wMin === -Infinity && wMax === Infinity) return;
    for (let k = 0, len = W.length; k < len; k++) {
      if (W[k] < wMin) W[k] = wMin;
      else if (W[k] > wMax) W[k] = wMax;
    }
  }
}
