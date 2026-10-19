'use strict';
/**
 * THE SEED CRYSTAL — a central oscillator between two literal hemispheres that
 * compete, conserved and floored, for the dopamine budget. Spec:
 * docs/EQUATION-REPAIR-AND-SEED-CRYSTAL.md Part B. Every number here is either
 * a count the donor returns (spikes per half of each cluster) or a phase derived
 * from one; nothing is a text model and nothing is a guess.
 *
 * ⛔ `measured` is false until a donor that counts both halves is attached, and
 * every reading stays `null` until then. An absent instrument must never read
 * as a quiet brain.
 *
 * Attached to ServerBrain.prototype via Object.assign (see the bottom of
 * brain-server.js). Names are all `_crystal*` so nothing here can collide with
 * a mixin attached earlier.
 */

const W = 64;              // mutual-information window, batches
const BINS = 8;            // quantisation of a proportion for the joint histogram
const P_THETA = 167;       // ticks — the theta backbone (simulated-ms; see Part A2)
const P_GAMMA = 25;
const K_RATE = 0.5;        // firing-rate frequency modulation, as the host oscillator
const K_MAX = 0.6;         // crystal coupling ceiling
const G0 = 4;              // grades to 63% of K_MAX
const TAU0 = 0.25;         // softmax temperature on standing
const B0 = 2.0;            // dopamine budget scale: η_L + η_R = B0 · η at D = 1
const ETA_FLOOR = 0.6;     // the loser's guaranteed plasticity share of η
const ETA_SPAN = 0.8;      // η_h = η · (ETA_FLOOR + ETA_SPAN · share_h)
const DRIVE_SWING = 0.15;  // drive_h = drive · (1 ± DRIVE_SWING)
const LAMBDA = 0.5;        // Ψ ← Ψ · (1 + LAMBDA · C · Φ_LR)
const GRADE_ORDER = ['pre-K', 'kindergarten', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6',
  'grade7', 'grade8', 'grade9', 'grade10', 'grade11', 'grade12', 'college1', 'college2', 'college3',
  'college4', 'grad', 'phd'];

function _h2(p) {
  if (!(p > 0) || !(p < 1)) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}
function _entropy(counts, total) {
  let h = 0;
  for (let i = 0; i < counts.length; i++) {
    const c = counts[i];
    if (c > 0) { const q = c / total; h -= q * Math.log2(q); }
  }
  return h;
}

const SERVER_CRYSTAL_MIXIN = {
  _crystalInit() {
    this._crystal = {
      measured: false,
      acks: 0,
      lastAckAt: null,
      p: {},                 // cluster → { L, R } spiking proportion per half
      osc: {},               // cluster → { L:{theta,gamma,baseline}, R:{...} }
      phase: 0,              // φ_c
      Kc: 0,
      Kx: 0,                 // 0.25·Kc — the pull of the crystal on each side
      grade: 0,
      C: null, A: null, RL: null, RR: null, PhiL: null, PhiR: null,
      PhiLR: null,
      winL: [], winR: [],    // size-weighted mean proportions per half, last W batches
      pred: { L: null, R: null },   // EMA predictor of cortex half proportions
      e: { L: 0, R: 0 }, ePrev: { L: 0, R: 0 }, ebar: 0.01,
      c1: { L: 0, R: 0 }, gateCredit: { L: 0, R: 0 }, chatReward: { L: 0, R: 0 },
      r: { L: 0, R: 0 }, rbar: { L: 0, R: 0 },
      share: { L: 0.5, R: 0.5 },
      eta: { L: 1, R: 1 }, drive: { L: 1, R: 1 },
      dopamine: null, serotoninDev: 0, tau: TAU0,
      counters: { ticks: 0, unmeasuredTicks: 0, gateCredits: 0, chatRewards: 0, applied: 0 },
    };
    return this._crystal;
  },

  /** Per-cluster batch ack. Returns true when the ack carried both halves. */
  _crystalOnAck(name, entry, size) {
    const c = this._crystal || this._crystalInit();
    if (!entry || typeof entry.lastSpikeCountL !== 'number' || typeof entry.lastSpikeCountR !== 'number') return false;
    const half = Math.max(1, Math.floor((size || 0) / 2));
    const rest = Math.max(1, (size || 0) - half);
    c.p[name] = {
      L: Math.max(0, Math.min(1, entry.lastSpikeCountL / half)),
      R: Math.max(0, Math.min(1, entry.lastSpikeCountR / rest)),
      size: size || 0,
    };
    c.acks++;
    c.lastAckAt = Date.now();
    c.measured = true;
    return true;
  },

  /** Her lowest cleared grade across courses, as an index into the ladder. */
  _crystalGradeIndex() {
    const grades = this.cortexCluster && this.cortexCluster.grades;
    if (!grades || typeof grades !== 'object') return 0;
    let g = Infinity;
    for (const k of Object.keys(grades)) {
      const idx = GRADE_ORDER.indexOf(grades[k]);
      if (idx >= 0 && idx < g) g = idx;
    }
    return Number.isFinite(g) ? g : 0;
  },

  /** Dopamine level and serotonin deviation from the endocrine layer, when it exists. */
  _crystalChemistry() {
    const endo = this.endocrine || this._endocrine || null;
    let D = null, serDev = 0;
    try {
      if (endo && typeof endo.level === 'function') {
        const now = Date.now();
        const d = endo.level('dopamine', now);
        if (Number.isFinite(d)) D = Math.max(0, Math.min(1, d));
        // `deviation` is signed (level − tonic baseline) for the tonic chemicals,
        // which is the endocrine layer's own sign rule: below baseline is the
        // inverse effect, not a smaller one — here, a sharper contest.
        if (typeof endo.deviation === 'function') {
          const dv = endo.deviation('serotonin', now);
          if (Number.isFinite(dv)) serDev = Math.max(-0.5, Math.min(0.5, dv));
        }
      }
    } catch { /* chemistry unreadable this tick — D stays null and the budget is not applied */ }
    return { D, serDev };
  },

  /**
   * One tick of the crystal. Called after the batch ack has been parsed so the
   * per-half proportions are fresh. Does nothing — and says so in the counters —
   * until a split-counting donor is attached.
   */
  _crystalTick() {
    const c = this._crystal || this._crystalInit();
    c.counters.ticks++;
    if (!c.measured) { c.counters.unmeasuredTicks++; return; }
    const names = Object.keys(c.p);
    if (names.length === 0) return;

    // ── hemispheric oscillators (same accumulator as the host-side theta) ──
    let sLc = 0, sLs = 0, sRc = 0, sRs = 0;
    let meanL = 0, meanR = 0, sizeSum = 0;
    for (const name of names) {
      const pk = c.p[name];
      const o = c.osc[name] || (c.osc[name] = {
        L: { theta: 0, gamma: 0, baseline: 0.1 }, R: { theta: 0, gamma: 0, baseline: 0.1 },
      });
      for (const h of ['L', 'R']) {
        const oh = o[h];
        const rate = pk[h];
        oh.baseline = 0.99 * oh.baseline + 0.01 * rate;
        const dev = Math.max(-0.9, Math.min(0.9, (rate - oh.baseline) * 4));
        oh.theta = (oh.theta + (2 * Math.PI / P_THETA) * (1 + K_RATE * dev) + c.Kx * Math.sin(c.phase - oh.theta)) % (2 * Math.PI);
        oh.gamma = (oh.gamma + (2 * Math.PI / P_GAMMA) * (1 + K_RATE * dev)) % (2 * Math.PI);
        if (oh.theta < 0) oh.theta += 2 * Math.PI;
      }
      sLc += Math.cos(o.L.theta); sLs += Math.sin(o.L.theta);
      sRc += Math.cos(o.R.theta); sRs += Math.sin(o.R.theta);
      meanL += pk.L * pk.size; meanR += pk.R * pk.size; sizeSum += pk.size;
    }
    const K = names.length;
    c.RL = Math.sqrt(sLc * sLc + sLs * sLs) / K;
    c.RR = Math.sqrt(sRc * sRc + sRs * sRs) / K;
    c.PhiL = Math.atan2(sLs, sLc);
    c.PhiR = Math.atan2(sRs, sRc);
    c.A = Math.abs(c.RL - c.RR);

    // ── the crystal — coupling anneals with her grade ──
    c.grade = this._crystalGradeIndex();
    c.Kc = K_MAX * (1 - Math.exp(-c.grade / G0));
    c.Kx = 0.25 * c.Kc;
    c.phase = (c.phase + (2 * Math.PI / P_THETA)
      + (c.Kc / 2) * (Math.sin(c.PhiL - c.phase) + Math.sin(c.PhiR - c.phase))) % (2 * Math.PI);
    if (c.phase < 0) c.phase += 2 * Math.PI;
    c.C = Math.sqrt(
      Math.pow(Math.cos(c.PhiL) + Math.cos(c.PhiR) + Math.cos(c.phase), 2)
      + Math.pow(Math.sin(c.PhiL) + Math.sin(c.PhiR) + Math.sin(c.phase), 2)) / 3;

    // ── Φ_LR — normalised mutual information between the two halves ──
    const pL = sizeSum > 0 ? meanL / sizeSum : 0;
    const pR = sizeSum > 0 ? meanR / sizeSum : 0;
    c.winL.push(pL); c.winR.push(pR);
    if (c.winL.length > W) { c.winL.shift(); c.winR.shift(); }
    if (c.winL.length >= 16) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < c.winL.length; i++) {
        lo = Math.min(lo, c.winL[i], c.winR[i]); hi = Math.max(hi, c.winL[i], c.winR[i]);
      }
      const span = Math.max(1e-9, hi - lo);
      const hL = new Array(BINS).fill(0), hR = new Array(BINS).fill(0), hJ = new Array(BINS * BINS).fill(0);
      for (let i = 0; i < c.winL.length; i++) {
        const bl = Math.min(BINS - 1, Math.floor((c.winL[i] - lo) / span * BINS));
        const br = Math.min(BINS - 1, Math.floor((c.winR[i] - lo) / span * BINS));
        hL[bl]++; hR[br]++; hJ[bl * BINS + br]++;
      }
      const n = c.winL.length;
      const HL = _entropy(hL, n), HR = _entropy(hR, n), HJ = _entropy(hJ, n);
      const denom = Math.min(HL, HR);
      c.PhiLR = denom > 1e-9 ? Math.max(0, Math.min(1, (HL + HR - HJ) / denom)) : null;
    }

    // ── correctness: c1 from the cortex halves' prediction-error decrease ──
    const cx = c.p.cortex;
    if (cx) {
      for (const h of ['L', 'R']) {
        const prev = c.pred[h];
        const pred = prev === null ? cx[h] : 0.7 * prev + 0.3 * cx[h];
        const e = Math.min(1, Math.abs(cx[h] - (prev === null ? cx[h] : prev)) / Math.max(prev === null ? cx[h] : prev, 1e-4));
        c.ePrev[h] = c.e[h]; c.e[h] = e; c.pred[h] = pred;
      }
      c.ebar = 0.99 * c.ebar + 0.01 * ((c.e.L + c.e.R) / 2);
      for (const h of ['L', 'R']) {
        c.c1[h] = Math.max(-1, Math.min(1, (c.ePrev[h] - c.e[h]) / Math.max(c.ebar, 1e-4)));
      }
    }
    for (const h of ['L', 'R']) {
      // gate credit and chat reward are consumed once each; absent = 0.
      c.r[h] = 0.5 * c.c1[h] + 0.3 * c.gateCredit[h] + 0.2 * c.chatReward[h];
      c.gateCredit[h] = 0; c.chatReward[h] = 0;
      c.rbar[h] = 0.95 * c.rbar[h] + 0.05 * c.r[h];
    }

    // ── the fight for the chemical ──
    const chem = this._crystalChemistry();
    c.dopamine = chem.D; c.serotoninDev = chem.serDev;
    c.tau = TAU0 * (1 + chem.serDev);
    const eL = Math.exp(c.rbar.L / c.tau), eR = Math.exp(c.rbar.R / c.tau);
    c.share.L = eL / (eL + eR); c.share.R = 1 - c.share.L;
    // η_h = η · (0.6 + 0.8 · share_h): sums to 2η — conserved — and floors at 0.6η.
    // The dopamine level scales the SPREAD, not the floor: at D = 0 both sides
    // sit at 1.0 (no contest), at the 0.4 baseline the contest is at 40% of
    // its full width, so a flat endocrine layer cannot be mistaken for a win.
    const Dsc = (chem.D === null) ? 0 : chem.D * (B0 / 2);
    for (const h of ['L', 'R']) {
      const full = ETA_FLOOR + ETA_SPAN * c.share[h];
      c.eta[h] = 1 + (full - 1) * Dsc;
      c.drive[h] = 1 + DRIVE_SWING * (2 * c.share[h] - 1) * Dsc;
    }
    // apply: the per-row scale rides buildKScalesForProjection → ojaUpdate.
    if (this.cortexCluster) {
      this.cortexCluster._hemiScale = (Math.abs(c.eta.L - 1) < 1e-6 && Math.abs(c.eta.R - 1) < 1e-6)
        ? null : [c.eta.L, c.eta.R];
      c.counters.applied++;
    }
  },

  /** Gate probe credit: the side whose readout was nearer the answer gets the verdict. */
  _crystalGateCredit(gL, gR, pass) {
    const c = this._crystal || this._crystalInit();
    if (!Number.isFinite(gL) || !Number.isFinite(gR)) return;
    const side = gL >= gR ? 'L' : 'R';
    c.gateCredit[side] += pass ? 1 : -1;
    c.counters.gateCredits++;
  },

  /** Chat reward credited to the side whose word_motor bucket spoke. */
  _crystalChatReward(bucketIndex, delta) {
    const c = this._crystal || this._crystalInit();
    const cx = this.cortexCluster;
    if (!cx || !Number.isFinite(bucketIndex) || !Number.isFinite(delta)) return;
    const wm = cx.regions && cx.regions.word_motor;
    if (!wm) return;
    const mid = Math.floor(cx.size / 2);
    const side = (wm.start + bucketIndex) < mid ? 'L' : 'R';
    c.chatReward[side] += delta;
    c.counters.chatRewards++;
  },

  /** Per-half drive multipliers for the batch; [1,1] until measured. */
  _crystalDriveScale() {
    const c = this._crystal;
    if (!c || !c.measured) return { L: 1, R: 1 };
    return { L: c.drive.L, R: c.drive.R };
  },

  /** Ψ's literal Left / Right terms, or null when the crystal is unmeasured. */
  _crystalLeftRight() {
    const c = this._crystal;
    if (!c || !c.measured || c.RL === null) return null;
    return {
      left: c.RL * (0.5 + 0.5 * c.rbar.L),
      right: c.RR * (0.5 + 0.5 * c.rbar.R),
      term: (c.C !== null && c.PhiLR !== null) ? (1 + LAMBDA * c.C * c.PhiLR) : 1,
    };
  },

  /** Hemispheric phasors for the whole-brain Kuramoto reading. */
  _crystalPhasors() {
    const c = this._crystal;
    if (!c || !c.measured) return null;
    const out = [];
    for (const name of Object.keys(c.osc)) {
      out.push({ theta: c.osc[name].L.theta, gamma: c.osc[name].L.gamma });
      out.push({ theta: c.osc[name].R.theta, gamma: c.osc[name].R.gamma });
    }
    return out.length ? out : null;
  },

  /** Cortex prediction error for the cerebellum residual: the cluster's own when it is live, else the hemispheric proportion error. */
  _crystalCortexPredErr() {
    const cx = this.cortexCluster;
    const own = cx && Number.isFinite(cx._lastPredictionError) ? cx._lastPredictionError : 0;
    if (own > 0) return Math.max(0, Math.min(1, own));
    const c = this._crystal;
    if (!c || !c.measured) return 0;
    return Math.max(0, Math.min(1, (c.e.L + c.e.R) / 2));
  },

  _crystalState() {
    const c = this._crystal;
    if (!c) return { measured: false, reason: 'crystal not initialised' };
    const r3 = (v) => (v === null || v === undefined || !Number.isFinite(v)) ? null : Number(v.toFixed(4));
    return {
      measured: c.measured,
      reason: c.measured ? null : 'no donor has reported per-hemisphere spike counts on this boot',
      acks: c.acks,
      lastAckAgeMs: c.lastAckAt ? Date.now() - c.lastAckAt : null,
      phase: r3(c.phase), C: r3(c.C), A: r3(c.A), RL: r3(c.RL), RR: r3(c.RR),
      PhiLR: r3(c.PhiLR), windowN: c.winL.length,
      Kc: r3(c.Kc), grade: c.grade,
      e: { L: r3(c.e.L), R: r3(c.e.R) }, c1: { L: r3(c.c1.L), R: r3(c.c1.R) },
      r: { L: r3(c.r.L), R: r3(c.r.R) }, rbar: { L: r3(c.rbar.L), R: r3(c.rbar.R) },
      share: { L: r3(c.share.L), R: r3(c.share.R) },
      eta: { L: r3(c.eta.L), R: r3(c.eta.R) }, drive: { L: r3(c.drive.L), R: r3(c.drive.R) },
      dopamine: r3(c.dopamine), serotoninDev: r3(c.serotoninDev), tau: r3(c.tau),
      counters: { ...c.counters },
      clusters: Object.keys(c.p).length,
    };
  },
};

module.exports = { SERVER_CRYSTAL_MIXIN, CRYSTAL_CONSTANTS: { W, BINS, P_THETA, P_GAMMA, K_MAX, G0, TAU0, B0, ETA_FLOOR, ETA_SPAN, DRIVE_SWING, LAMBDA } };
