/**
 * oscillations.js — Kuramoto model for neural synchronization.
 *
 * N coupled phase oscillators with natural frequencies and coupling matrix.
 * Computes order parameter (synchronization measure) and band power distribution.
 *
 * dθ_i/dt = ω_i + Σ_j K_ij * sin(θ_j - θ_i)
 *
 * No external dependencies. Pure ES module. Float64 everything.
 */

import { brainStream } from './brain-rng.js';

const TWO_PI = 2 * Math.PI;

// Initial phases come from her own seeded stream, restarted on every boot, so
// the same seed starts her oscillators in the same place. A reset while she
// runs draws from a persisted stream.
const _phaseInit = brainStream('oscillator-phase-init', { fromStart: true });
const _phaseReset = brainStream('oscillator-phase-reset');

// Frequency band ranges (Hz)
const BANDS = {
  theta: { lo: 4, hi: 8 },
  alpha: { lo: 8, hi: 13 },
  beta:  { lo: 13, hi: 30 },
  gamma: { lo: 30, hi: 100 },
};

export class OscillatorNetwork {
  /**
   * @param {number} n — number of oscillators
   * @param {object} [opts]
   * @param {number} [opts.freqMin=4]   — minimum natural frequency (Hz)
   * @param {number} [opts.freqMax=80]  — maximum natural frequency (Hz)
   */
  constructor(n, opts = {}) {
    this.n = n;
    const freqMin = opts.freqMin ?? 4;
    const freqMax = opts.freqMax ?? 80;

    // Natural frequencies ω_i (rad/s) — distributed across bands
    this.omega = new Float64Array(n);
    // Phases θ_i (rad) — start random in [0, 2π)
    this.phases = new Float64Array(n);
    // Frequency in Hz for band classification
    this.freqHz = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      // spread frequencies across the range
      const hz = freqMin + (freqMax - freqMin) * (i / (n - 1 || 1));
      this.freqHz[i] = hz;
      this.omega[i] = TWO_PI * hz;           // convert Hz to rad/s
      this.phases[i] = _phaseInit() * TWO_PI; // random initial phase
    }

    // scratch buffer for phase derivatives
    this._dtheta = new Float64Array(n);
  }

  /**
   * Advance all oscillators by dt seconds using the Kuramoto model.
   *
   * dθ_i/dt = ω_i + Σ_j K_ij * sin(θ_j - θ_i)
   *
   * @param {number} dt — time step in seconds
   * @param {Float64Array|null} couplingMatrix — flat n×n row-major coupling K_ij.
   *   If null, oscillators run independently (no coupling).
   */
  step(dt, couplingMatrix) {
    const { n, omega, phases, _dtheta } = this;

    for (let i = 0; i < n; i++) {
      let coupling = 0;

      if (couplingMatrix) {
        const row = i * n;
        for (let j = 0; j < n; j++) {
          coupling += couplingMatrix[row + j] * Math.sin(phases[j] - phases[i]);
        }
      }

      _dtheta[i] = omega[i] + coupling;
    }

    // Forward Euler integration + wrap to [0, 2π)
    for (let i = 0; i < n; i++) {
      phases[i] += dt * _dtheta[i];
      // fast modulo — avoid negative phases
      phases[i] = phases[i] % TWO_PI;
      if (phases[i] < 0) phases[i] += TWO_PI;
    }
  }

  /**
   * @returns {Float64Array} — current phases (reference, not copy)
   */
  getPhases() {
    return this.phases;
  }

  /**
   * Compute the Kuramoto order parameter:
   *
   *   r = |1/N * Σ_j e^(i*θ_j)|
   *
   * r ∈ [0, 1]. r=1 means perfect synchrony, r≈0 means incoherent.
   *
   * @returns {number} order parameter r
   */
  getCoherence() {
    const { n, phases } = this;
    let realSum = 0;
    let imagSum = 0;

    for (let j = 0; j < n; j++) {
      realSum += Math.cos(phases[j]);
      imagSum += Math.sin(phases[j]);
    }

    realSum /= n;
    imagSum /= n;

    return Math.sqrt(realSum * realSum + imagSum * imagSum);
  }

  /**
   * Compute power in each frequency band based on oscillator amplitudes.
   *
   * For each band, power = fraction of oscillators whose natural frequency
   * falls within that band, weighted by their instantaneous amplitude
   * (approximated as |sin(θ)|, representing current oscillatory output).
   *
   * @returns {{ theta: number, alpha: number, beta: number, gamma: number }}
   */
  getBandPower() {
    const { n, freqHz, phases } = this;
    const power = { theta: 0, alpha: 0, beta: 0, gamma: 0 };
    const counts = { theta: 0, alpha: 0, beta: 0, gamma: 0 };

    for (let i = 0; i < n; i++) {
      const hz = freqHz[i];
      const amplitude = Math.abs(Math.sin(phases[i])); // instantaneous output

      for (const band in BANDS) {
        if (hz >= BANDS[band].lo && hz < BANDS[band].hi) {
          power[band] += amplitude;
          counts[band]++;
          break;
        }
      }
    }

    // Normalize: average amplitude per band (0 if no oscillators in that band)
    for (const band in power) {
      power[band] = counts[band] > 0 ? power[band] / counts[band] : 0;
    }

    return power;
  }

  /**
   * Set natural frequency for a specific oscillator.
   * @param {number} i — oscillator index
   * @param {number} hz — new frequency in Hz
   */
  setFrequency(i, hz) {
    this.freqHz[i] = hz;
    this.omega[i] = TWO_PI * hz;
  }

  /**
   * Reset all phases to random values.
   */
  resetPhases() {
    for (let i = 0; i < this.n; i++) {
      this.phases[i] = _phaseReset() * TWO_PI;
    }
  }
}
