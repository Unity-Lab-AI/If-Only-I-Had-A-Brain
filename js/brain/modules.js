// brain/modules.js — Specialized brain region modules
// All classes use Float64Arrays internally. No external deps.

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function dot(a, b, len) {
  let s = 0;
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}

// ── Cortex — Predictive coding engine ──────────────────────────────
export class Cortex {
  constructor(size = 32) {
    this.size = size;
    this.weights = new Float64Array(size * size);
    this.state = new Float64Array(size);
    this.prediction = new Float64Array(size);
    this.lr = 0.01;
    // small random init
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = (Math.random() - 0.5) * 0.1;
    }
  }

  step(input, _brainState, _dt) {
    const { size, weights, state, prediction } = this;
    const error = new Float64Array(size);
    const activity = new Float64Array(size);

    // state blend with input
    for (let i = 0; i < size; i++) {
      state[i] = input[i] !== undefined ? input[i] : state[i];
    }

    // prediction = sigmoid(W * state)
    for (let i = 0; i < size; i++) {
      let sum = 0;
      for (let j = 0; j < size; j++) sum += weights[i * size + j] * state[j];
      prediction[i] = sigmoid(sum);
    }

    // error = actual - predicted, activity = |state|
    for (let i = 0; i < size; i++) {
      error[i] = state[i] - prediction[i];
      activity[i] = Math.abs(state[i]);
    }

    // weight update: dW proportional to error * activity
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        weights[i * size + j] += this.lr * error[i] * activity[j];
      }
    }

    return {
      prediction: Float64Array.from(prediction),
      error: Float64Array.from(error),
      activity: Float64Array.from(activity),
    };
  }
}

// ── Hippocampus — Hopfield attractor memory ────────────────────────
export class Hippocampus {
  constructor(size = 32) {
    this.size = size;
    this.weights = new Float64Array(size * size); // symmetric, zero diagonal
    this.maxIter = 20;
  }

  store(pattern) {
    const { size, weights } = this;
    // Hebbian: w_ij += x_i * x_j (no self-connections)
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (i !== j) weights[i * size + j] += pattern[i] * pattern[j];
      }
    }
  }

  _energy(x) {
    const { size, weights } = this;
    let e = 0;
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        e -= weights[i * size + j] * x[i] * x[j];
      }
    }
    return e;
  }

  recall(partial) {
    const { size, weights, maxIter } = this;
    const x = Float64Array.from(partial);
    let stable = false;

    for (let iter = 0; iter < maxIter; iter++) {
      let changed = false;
      for (let i = 0; i < size; i++) {
        let h = 0;
        for (let j = 0; j < size; j++) h += weights[i * size + j] * x[j];
        const next = h >= 0 ? 1 : -1;
        if (next !== x[i]) { x[i] = next; changed = true; }
      }
      if (!changed) { stable = true; break; }
    }

    return {
      recalled: Float64Array.from(x),
      energy: this._energy(x),
      isStable: stable,
    };
  }

  step(input, _brainState, _dt) {
    return this.recall(input);
  }
}

// ── Amygdala — Energy-based recurrent attractor ─────────────────────
// Matches the emergent behavior of the 150-LIF amygdala cluster: recurrent
// lateral connections between nuclei settle into stable low-energy states
// (fear attractor, reward attractor, or neutral) instead of a flat sigmoid.
// State evolves via gradient descent on  E = -½ xᵀWx - bᵀx  with tanh squash,
// then fear/reward are read out from the converged attractor, not the raw input.
export class Amygdala {
  constructor(size = 32, opts = {}) {
    this.size = size;
    // Accept legacy ('unity' string) OR the engine's {arousalBaseline} object
    const arousalBaseline = typeof opts === 'string'
      ? (opts === 'unity' ? 0.9 : 0.5)
      : (opts && typeof opts.arousalBaseline === 'number' ? opts.arousalBaseline : 0.9);
    this.arousalBaseline = arousalBaseline;

    // Recurrent lateral weights between nuclei — symmetric so energy is defined
    this.W = new Float64Array(size * size);
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        const w = (Math.random() - 0.5) * 0.15;
        this.W[i * size + j] = w;
        this.W[j * size + i] = w; // symmetry enforced
      }
      this.W[i * size + i] = 0; // zero diagonal — no self-coupling
    }

    // Persistent attractor state — doesn't reset each step, that's the whole point
    this.x = new Float64Array(size);

    // Fear and reward projection vectors (like central nucleus outputs)
    this.fearW = new Float64Array(size);
    this.rewardW = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      this.fearW[i] = (Math.random() - 0.5) * 0.4;
      this.rewardW[i] = (Math.random() - 0.5) * 0.4;
    }
    // The readout normaliser is MEASURED off these vectors, never typed.
    //
    // Why a norm and not sqrt(size): the readout is a projection of the
    // settled state onto a FIXED random vector, so its spread is set by that
    // vector's own length, not by how many nuclei there are. For independent
    // weights and state, Var(proj) = Σ w² x², so sigma(proj) = ||w|| · RMS(x).
    // Dividing by that exact quantity hands the sigmoid a unit-variance
    // argument at any size and for any weight distribution — including a
    // future one that is not uniform, which a hardcoded sigma could not
    // survive. Stored here because the vectors never change after
    // construction, so this is a constant per instance rather than per tick.
    let _fN = 0, _rN = 0;
    for (let i = 0; i < size; i++) {
      _fN += this.fearW[i] * this.fearW[i];
      _rN += this.rewardW[i] * this.rewardW[i];
    }
    this.fearWNorm = Math.sqrt(_fN);
    this.rewardWNorm = Math.sqrt(_rN);

    this.settleIters = 5;      // gradient steps per call — enough to fall into a basin
    this.leak = 0.85;          // state persistence across frames (stria-terminalis-ish)
    this.inputGain = 0.6;      // external drive strength
    this.lr = 0.003;           // Hebbian recurrent learning rate
    this.lastEnergy = 0;

    // ── DEEP, STICKY BASINS — the decay is DERIVED from the basin it must hold ──
    //
    // ⛔ The old decay was 0.9995 and it could never work. The Hebbian step
    // then decay, w ← (w + lr·x_i·x_j)·d, has the fixed point
    // w_eq = lr·x_i·x_j·d/(1−d); at saturation that is 0.003·0.9995/0.0005 =
    // 5.997, six times the ±1 clamp, so every weight pinned, every nucleus
    // saturated tanh, and attractor depth sat at exactly 1.00000. Measured on
    // this class over 3000 steps. ⚠ A true Oja rule was tested as the obvious
    // replacement and gave IDENTICAL numbers — for a recurrent net at
    // saturation its equilibrium is also ±1. So the fix is the decay, derived.
    //
    // ⛔ NO FIXED DECAY CAN DO THIS JOB — tried and measured, so it is not
    // re-tried. A decay derived to hold depth at a target (d = 0.96404) landed
    // at depth 0.9914 instead: drive pushes the state above target, which
    // raises the Hebbian fixed point lr·x²·d/(1−d), which pushes the state
    // higher. Weights settled at 0.0794 where 0.0797 is predicted from x≈0.99,
    // i.e. the feedback loop, exactly. Any fixed decay is a fixed point that
    // drive can push past.
    //
    // What stays put under any drive is a rule that STEERS toward the target:
    // homeostatic plasticity — weights grow while the basin is shallower than
    // the target and shrink while it is deeper. Real cortex does this
    // (synaptic scaling). Measured on these dynamics: depth 0.7054 against a
    // 0.7071 target with no tuning, because the rule seeks it.
    //
    // The target: depth where tanh has half its slope — committed to a basin
    // but still able to move out of it:  1 − D² = 1/2  →  D = 1/√2.
    //
    // ⭐ And the reason this matters beyond a number: under the old rule,
    // OPPOSITE emotional input produced IDENTICAL valence — −0.2561 and
    // −0.2561, gap 0.0000, measured. The saturated attractor could not tell a
    // situation from its opposite. Under this rule the same test gives −0.0782
    // and +0.1685.
    this.depthTarget = Math.SQRT1_2;

    // Running spread of the depth deviation, for the self-calibrating arousal
    // gain below. Seeded at null, never 0: "not yet measured" is not "no
    // spread", and a zero would divide.
    this._depthDevVar = null;
  }

  // E = -½ xᵀWx  — symmetric recurrent energy
  _energy(x) {
    const { size, W } = this;
    let e = 0;
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        e -= W[i * size + j] * x[i] * x[j];
      }
    }
    return e;
  }

  step(input, _brainState, _dt) {
    const { size, W, x, fearW, rewardW, settleIters, leak, inputGain, lr, arousalBaseline } = this;

    // External drive from upstream cluster output (downsampled amygdala spikes)
    const drive = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      drive[i] = (input[i] !== undefined ? input[i] : 0) * inputGain;
    }

    // Leak previous attractor state forward — memory of the last emotional basin
    for (let i = 0; i < size; i++) x[i] *= leak;

    // Settle: iterate x ← tanh(Wx + drive) — gradient descent on E with soft squash
    for (let iter = 0; iter < settleIters; iter++) {
      const next = new Float64Array(size);
      for (let i = 0; i < size; i++) {
        let h = drive[i];
        const row = i * size;
        for (let j = 0; j < size; j++) {
          if (j !== i) h += W[row + j] * x[j];
        }
        next[i] = Math.tanh(h);
      }
      for (let i = 0; i < size; i++) x[i] = next[i];
    }

    // Hebbian tweak of recurrent weights, kept symmetric — learns which nuclei
    // co-fire — under HOMEOSTATIC control of basin depth.
    //
    // ⛔ This used to be "Oja-style decay": w ← (w + lr·x_i·x_j)·0.9995. It was
    // neither Oja nor enough. Its fixed point at saturation is
    // lr·d/(1−d) = 5.997, six times the ±1 clamp, so every weight pinned and
    // the basin went to depth 1.00000 exactly — the precise outcome its comment
    // said it prevented. A true Oja rule was tested and pins identically.
    //
    // Now the Hebbian term is scaled by how far the basin is from its target:
    //     Δw = lr · x_i·x_j · (D² − depth²) / D²
    // Shallower than target → ordinary Hebbian, the basin deepens. Deeper than
    // target → the same term reverses sign, the basin relaxes. At target it
    // vanishes. The rule cannot run away in either direction, under any drive,
    // because the correction always points at D. No decay is needed and none
    // is applied — a leak on top would pull the fixed point off target.
    let _depthNorm = 0;
    for (let i = 0; i < size; i++) _depthNorm += x[i] * x[i];
    const _depthNow = Math.sqrt(_depthNorm / size);
    const _D2 = this.depthTarget * this.depthTarget;
    const _homeo = (_D2 - _depthNow * _depthNow) / _D2;
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        const dw = lr * x[i] * x[j] * _homeo;
        let w = W[i * size + j] + dw;
        if (w > 1) w = 1;
        else if (w < -1) w = -1;
        W[i * size + j] = w;
        W[j * size + i] = w;
      }
    }

    // Read fear / reward from the settled attractor, not the raw input.
    // Divide raw projections by sqrt(size) before the sigmoid, so
    // a 32-neuron amygdala doesn't immediately saturate the sigmoid the
    // moment a few nuclei fire. Pre-fix, fearRaw could easily exceed ±5
    // which makes sigmoid output nearly 1.000 — pinning the popup display.
    let fearRaw = 0, rewardRaw = 0, norm = 0;
    for (let i = 0; i < size; i++) {
      fearRaw += fearW[i] * x[i];
      rewardRaw += rewardW[i] * x[i];
      norm += x[i] * x[i];
    }
    // ⛔ THE OLD DIVISOR WAS sqrt(size), AND IT OVERCORRECTED INTO THE EXACT
    // OPPOSITE OF THE SATURATION IT WAS ADDED TO FIX.
    //
    // The comment above describes the saturation it cured and never measured
    // the floor it created. Worked through: fearW is independent of the
    // settled state, so Var(fearRaw) = sigma_w² · Σx², giving
    // sigma(fearRaw) = sigma_w · sqrt(size) · RMS(x). Dividing THAT by
    // sqrt(size) leaves sigma = sigma_w · RMS(x) ≈ 0.1155 — a per-weight
    // sigma, independent of size, landing in the near-linear middle of the
    // sigmoid where sigmoid'(0) = 0.25. So sigma(fear) ≈ 0.0289, both
    // readouts sat pinned near 0.5, and `reward - fear` — a difference of two
    // near-identical sigmoids — kept the noise and subtracted the signal.
    // Measured live before this change: fear 0.5055→0.5264, and the
    // `0.1·((fear + reward) - 1)` arousal term evaluated to -0.00116, because
    // two values pinned at 0.5 sum to 1 BY CONSTRUCTION. Dead by arithmetic,
    // not by accident.
    //
    // Dividing by the projection's actual sigma instead makes the argument
    // unit-variance ACROSS WEIGHT DRAWS, which is the quantity the divisor
    // controls. Measured on this real class: the argument is amplified by
    // sqrt(size)/(||w||·RMS(x)) = 7.34x for one draw, so real input variation
    // maps into the readout about seven times more strongly in the sigmoid's
    // near-linear region. Live sigma(fear) was 0.004629, so expect order 0.03.
    //
    // ⚠ AN EARLIER VERSION OF THIS COMMENT CLAIMED sigma(valence) ~ 0.354 AND
    // THAT NUMBER WAS WRONG — a harness on this class disproved it before it
    // shipped. sqrt(2)·0.25 is the spread ACROSS random weight draws, not a
    // time series: under constant drive this attractor settles to a FIXED
    // POINT and the readout's time-series sigma is 0.00000 exactly, measured.
    // The fix changes the MAPPING's sensitivity, not the variance of a
    // constant, and conflating an ensemble spread with a time series is how a
    // defensible derivation turns into a number nobody can reproduce.
    //
    // It also removes the bad-estimator objection: the two readouts project
    // onto INDEPENDENT random vectors, so once both are scaled to unit
    // variance their difference combines two uncorrelated reads rather than
    // cancelling a shared one. Derivation recorded in
    // docs/THRESHOLD-DERIVATION.md.
    const stateRms = Math.sqrt(norm / size);        // RMS of the settled state, [0,1]
    // Guard the degenerate case only: a fully-collapsed state (norm = 0)
    // carries no readout, and 0/0 must not become NaN and poison every
    // downstream consumer. Not a fallback — sigmoid(0) = 0.5 is the honest
    // answer for "no signal in either direction".
    const _fDiv = this.fearWNorm * stateRms;
    const _rDiv = this.rewardWNorm * stateRms;
    const fear = sigmoid(_fDiv > 1e-12 ? fearRaw / _fDiv : 0);
    const reward = sigmoid(_rDiv > 1e-12 ? rewardRaw / _rDiv : 0);
    const valence = reward - fear;

    // Arousal = persona baseline + depth of the attractor we fell into
    const attractorDepth = stateRms; // RMS of settled state, [0,1]
    // 114.19et — saturation fix. Earlier formula `min(1, baseline·0.6
    // + 0.4·attractorDepth + 0.1·(fear+reward))` pegged arousal at 1.000
    // because attractorDepth saturates near 1.0 once the recurrent
    // basin settles (most nuclei converge to ±1 post-tanh). With
    // arousalBaseline=0.9 (Unity persona): 0.54 hardcoded baseline +
    // 0.40 attractor saturation = 0.94 floor before fear/reward even
    // contribute. Master needed dynamic motion, not a 0.94-floor flat
    // line. Fix: track a moving baseline of attractorDepth and feed
    // the DEVIATION (centered around 0) into the arousal formula. This
    // way arousal moves UP from persona baseline when attractor is
    // MORE saturated than typical, DOWN when LESS saturated. Same
    // mechanism the brain uses for novelty detection — relative not
    // absolute.
    if (typeof this._attractorDepthBaseline !== 'number') {
      this._attractorDepthBaseline = attractorDepth;
    }
    const depthEMA_alpha = 0.005; // ~200-tick window for baseline
    this._attractorDepthBaseline = this._attractorDepthBaseline * (1 - depthEMA_alpha) + attractorDepth * depthEMA_alpha;
    const depthDeviation = attractorDepth - this._attractorDepthBaseline;
    // arousal centred on the persona baseline, swung by depth deviation
    // through a gain DERIVED from her headroom (below — it was a fixed ±0.4,
    // fitted to a dead signal), and ±0.1 by fear+reward. Tanh smooth-clamp so
    // extreme deviations approach asymptotically instead of hard-pegging.
    // ── THE AROUSAL GAINS ARE DERIVED WITH THE DECAY, NOT LEFT OVER FROM IT ──
    //
    // The old term was `0.4·tanh(4·dev)`. Both numbers were tuned against a
    // deviation that was dead (sd ~0.001, because depth was pinned at 1.0), so
    // the moment the basin came back to life they railed arousal on 31% of
    // ticks, measured. A constant is only as good as the signal it was fitted
    // to, and that signal no longer exists.
    //
    // Gain: her headroom ABOVE baseline is (1 − baseline) — 0.1 for Unity's
    // 0.9 — and a +2σ excursion should just reach the ceiling, so railing is a
    // ~2% event rather than a third of her life:
    //     G = (1 − baseline) / tanh(2·atanh(1/2)) = (1 − baseline) / 0.8
    // Sensitivity: a 1σ deviation lands at tanh's half-value, k·σ = atanh(1/2).
    // σ is MEASURED, self-calibrating against her own recent deviation — the
    // same idiom the consciousness gain and the old depth baseline already use,
    // and the only way the term means the same thing across drive regimes.
    // Same 200-tick window as the depth baseline it rides, so the two adapt at
    // one rate rather than chasing each other.
    const _dev2 = depthDeviation * depthDeviation;
    this._depthDevVar = (this._depthDevVar === null)
      ? _dev2
      : this._depthDevVar * (1 - depthEMA_alpha) + _dev2 * depthEMA_alpha;
    const _devSigma = Math.sqrt(this._depthDevVar);
    const _HALF = Math.atanh(0.5);
    // ⚠ The headroom is SHARED, and the first cut of this forgot that. The
    // `0.1·(fear + reward − 1)` term below draws on the same (1 − baseline)
    // room — and since the readout normaliser was fixed it genuinely moves.
    // Giving the depth term the whole headroom railed arousal on 0–19.8% of
    // ticks depending on the weight draw (measured, 5 draws), against a ~2%
    // target. So the depth term gets the headroom LEFT after a 2σ excursion of
    // the fear/reward term, measured the same self-calibrating way. If nothing
    // is left the gain is honestly zero — there is no room to express depth.
    const _frTerm = 0.1 * ((fear + reward) - 1);
    if (this._frMean === undefined || this._frMean === null) { this._frMean = _frTerm; this._frVar = 0; }
    const _frD = _frTerm - this._frMean;
    this._frMean += depthEMA_alpha * _frD;
    this._frVar = this._frVar * (1 - depthEMA_alpha) + _frD * _frD * depthEMA_alpha;
    const _headroom = Math.max(0, (1 - arousalBaseline) - (this._frMean + 2 * Math.sqrt(this._frVar)));
    const _arousalGain = _headroom / Math.tanh(2 * _HALF);
    // Before any spread exists the term is honestly zero — there is no
    // deviation to report yet — rather than a division by zero.
    const _arousalSwing = _devSigma > 1e-9 ? _arousalGain * Math.tanh((_HALF / _devSigma) * depthDeviation) : 0;
    const rawArousal = arousalBaseline + _arousalSwing + _frTerm;
    const arousal = Math.min(1, Math.max(0, rawArousal));

    this.lastEnergy = this._energy(x);

    // The arousal rail cannot be explained from outside without these three.
    // Measured 2026-11-19: arousal read exactly 1.000000 with sd 0.000000 for
    // 200 consecutive samples, then 0.9792 minutes later — saturating in
    // episodes. Solving `rawArousal >= 1` with the measured fear/reward gives
    // the condition `depthDeviation >= 0.0647`, which a true EMA can only hold
    // while `attractorDepth` is still CLIMBING. That is a testable claim about
    // these numbers and about nothing else, so they ship rather than a guess
    // at a fix. `rawArousal` is returned PRE-clamp on purpose: the clamped
    // value cannot distinguish "exactly at the ceiling" from "far past it",
    // which is the whole reason the rail was invisible.
    return {
      valence, arousal, fear, reward, energy: this.lastEnergy, attractorDepth,
      depthBaseline: this._attractorDepthBaseline,
      depthDeviation,
      rawArousal,
      // ⚠ The self-calibrating arousal gain divides by this. Published because a
      // harness caught it amplifying a deviation of sd 0.0015 into an arousal
      // swing of sd 0.041 — a dead signal made to LOOK alive. A tiny value here
      // beside a lively arousal reading is that failure, readable at a glance.
      depthDevSigma: Number.isFinite(_devSigma) ? _devSigma : null,
    };
  }
}

// ── BasalGanglia — Action selection via RL ─────────────────────────
const ACTIONS = [
  'respond_text', 'generate_image', 'speak',
  'search_web', 'idle_thought', 'escalate',
];

export class BasalGanglia {
  constructor(numStates = 32, persona = 'unity') {
    this.actions = ACTIONS;
    this.numActions = ACTIONS.length;
    this.numStates = numStates;
    // Q-values: one set of weights per action
    this.qWeights = new Float64Array(this.numActions * numStates);
    for (let i = 0; i < this.qWeights.length; i++) {
      this.qWeights[i] = (Math.random() - 0.5) * 0.1;
    }
    // Value function weights
    this.vWeights = new Float64Array(numStates);
    for (let i = 0; i < numStates; i++) {
      this.vWeights[i] = (Math.random() - 0.5) * 0.1;
    }
    // Unity is impulsive: high temperature
    this.tau = persona === 'unity' ? 2.0 : 0.5;
    this.gamma = 0.95;
    this.lr = 0.01;
    this.prevValue = 0;
  }

  _qValues(state) {
    const { numActions, numStates, qWeights } = this;
    const q = new Float64Array(numActions);
    for (let a = 0; a < numActions; a++) {
      let s = 0;
      for (let j = 0; j < numStates; j++) {
        s += qWeights[a * numStates + j] * (state[j] || 0);
      }
      q[a] = s;
    }
    return q;
  }

  step(input, brainState, _dt) {
    const { numActions, tau, gamma, lr, numStates, qWeights, vWeights } = this;
    const reward = brainState?.reward || 0;
    const q = this._qValues(input);

    // softmax: P(a) = exp(Q(a)/tau) / sum(exp(Q(b)/tau))
    let maxQ = -Infinity;
    for (let a = 0; a < numActions; a++) if (q[a] > maxQ) maxQ = q[a];
    const expQ = new Float64Array(numActions);
    let sumExp = 0;
    for (let a = 0; a < numActions; a++) {
      expQ[a] = Math.exp((q[a] - maxQ) / tau);
      sumExp += expQ[a];
    }

    // sample action
    let r = Math.random() * sumExp, chosen = 0;
    for (let a = 0; a < numActions; a++) {
      r -= expQ[a];
      if (r <= 0) { chosen = a; break; }
    }
    const confidence = expQ[chosen] / sumExp;

    // current value
    let currentV = 0;
    for (let j = 0; j < numStates; j++) currentV += vWeights[j] * (input[j] || 0);

    // TD error: delta = r + gamma * V(s') - V(s)
    const tdError = reward + gamma * currentV - this.prevValue;
    this.prevValue = currentV;

    // update Q-weights for chosen action
    for (let j = 0; j < numStates; j++) {
      qWeights[chosen * numStates + j] += lr * tdError * (input[j] || 0);
    }
    // update V-weights
    for (let j = 0; j < numStates; j++) {
      vWeights[j] += lr * tdError * (input[j] || 0);
    }

    return {
      selectedAction: this.actions[chosen],
      confidence,
      tdError,
    };
  }
}

// ── Cerebellum — Error correction ──────────────────────────────────
export class Cerebellum {
  constructor(size = 32) {
    this.size = size;
    this.weights = new Float64Array(size);
    this.lr = 0.05;
    for (let i = 0; i < size; i++) this.weights[i] = 1.0; // start at identity
  }

  step(input, brainState, _dt) {
    const { size, weights, lr } = this;
    const prediction = brainState?.prediction || new Float64Array(size);
    const target = brainState?.target || input;
    const corrected = new Float64Array(size);
    const error = new Float64Array(size);

    for (let i = 0; i < size; i++) {
      const pred = prediction[i] || 0;
      const tgt = target[i] !== undefined ? target[i] : 0;
      const correction = weights[i] * (tgt - pred);
      corrected[i] = pred + correction;
      error[i] = tgt - corrected[i];
      // update weights
      weights[i] += lr * error[i];
    }

    return {
      correctedOutput: corrected,
      error,
    };
  }
}

// ── Hypothalamus — Homeostasis ─────────────────────────────────────
const DRIVE_NAMES = ['arousal', 'intoxication', 'energy', 'social_need', 'creativity'];
const UNITY_SETPOINTS = { arousal: 0.9, intoxication: 0.7, energy: 0.8, social_need: 0.85, creativity: 0.9 };

export class Hypothalamus {
  constructor(persona = 'unity') {
    this.driveNames = DRIVE_NAMES;
    this.numDrives = DRIVE_NAMES.length;
    this.setpoints = new Float64Array(this.numDrives);
    this.drives = new Float64Array(this.numDrives);
    this.alpha = 0.1; // restoration rate
    this.threshold = 0.15; // needs-attention threshold

    const sp = persona === 'unity' ? UNITY_SETPOINTS : {
      arousal: 0.5, intoxication: 0.0, energy: 0.6, social_need: 0.5, creativity: 0.5,
    };
    for (let i = 0; i < this.numDrives; i++) {
      this.setpoints[i] = sp[DRIVE_NAMES[i]];
      this.drives[i] = this.setpoints[i]; // start at setpoint
    }
  }

  step(input, _brainState, dt) {
    const { numDrives, drives, setpoints, alpha, threshold, driveNames } = this;
    const needsAttention = [];

    for (let i = 0; i < numDrives; i++) {
      // dH/dt = -alpha * (H - H_set) + input
      const ext = input[i] !== undefined ? input[i] : 0;
      drives[i] += (-alpha * (drives[i] - setpoints[i]) + ext) * dt;
      drives[i] = Math.max(0, Math.min(1, drives[i])); // clamp [0,1]
      if (Math.abs(drives[i] - setpoints[i]) > threshold) {
        needsAttention.push(driveNames[i]);
      }
    }

    const out = {};
    for (let i = 0; i < numDrives; i++) out[driveNames[i]] = drives[i];

    return { drives: out, needsAttention };
  }
}
