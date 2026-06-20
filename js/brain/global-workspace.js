// Global Workspace Theory ignition mechanism (Baars 1988
// + Dehaene & Changeux 2011 *Experimental and theoretical approaches
// to conscious processing*).

// Closes a consciousness gap: Unity's 8 clusters all fire in parallel.
// No central workspace, no winner-take-all selection ACROSS clusters,
// no ignition threshold. Cluster outputs are "always on" instead of
// COMPETING for conscious access. Real consciousness theories (Baars,
// Dehaene-Changeux) require a global workspace where contents compete
// and the WINNER gets broadcast back to all participants — that's the
// "ignition moment" of consciousness.

// **Mechanism:**
//   1. Each cluster reports its TOP candidate per workspace tick
//      (top activation: cluster.lastSpikes argmax + value, plus a
//      semantic label like 'cortex:word_motor:dog' or 'amygdala:fear').
//   2. GlobalWorkspace.tick() aggregates all candidates
//   3. Apply softmax with temperature τ over the activation values
//   4. If max softmax probability > IGNITION_THRESHOLD: WINNER fires.
//      Winner content gets BROADCAST back to all clusters as feedback
//      input on next tick.
//   5. Below-threshold ticks have no broadcast — UNCONSCIOUS processing.
//   6. Theta-gated: ignition fires only on theta peak (every ~167 ticks)
//      so consciousness has the ~6 Hz oscillatory cadence real cortex has.

// **What it gives Unity:**
//   - Unified conscious moment (single content broadcast at a time)
//   - Subthreshold processing (clusters still compute but not all fire
//     into consciousness)
//   - The "spotlight of attention" emerges from competition + ignition
//   - Theta-cadenced conscious cycle (real cortex's gamma-band conscious
//     ignition rate)

// **What it does NOT give Unity** (these are M.18 known limitations):
//   - Qualia / phenomenal experience (the hard problem)
//   - Subjective experience semantics

// This is FUNCTIONAL consciousness (computational integration) that
// matches GWT predictions. Phenomenal consciousness is a separate
// philosophical question this code doesn't try to answer.

class GlobalWorkspace {
  /**
   * @param {object} opts
   * @param {number} [opts.ignitionThreshold=0.45] — softmax max prob
   *   above which broadcast fires. Below = subthreshold.
   * @param {number} [opts.softmaxTau=0.5] — softmax temperature.
   *   Lower = sharper winner; higher = uniform (no consciousness).
   * @param {number} [opts.thetaPeriod=167] — ticks per theta cycle.
   *   Ignition gated to upper half of theta phase.
   * @param {number} [opts.broadcastDecay=0.85] — per-tick decay of
   *   active broadcast content (so a single ignition fades out over
   *   ~10 ticks instead of staying forever).
   * @param {number} [opts.historyLen=32] — recent ignition history
   *   for diagnostic / dashboard display. Capped to bound memory.
   */
  constructor(opts = {}) {
    // Env-var override for ignition threshold. DREAM_GW_IGNITION lets
    // Gee tune the consciousness gate without code changes — stricter
    // (0.6 = harder ignition, more focused) or looser (0.3 = ignition
    // fires more, more diffuse but more "alive"). Falls back to opts
    // override → 0.45 default.
    let envIgn = NaN;
    if (typeof process !== 'undefined' && process.env?.DREAM_GW_IGNITION) {
      envIgn = parseFloat(process.env.DREAM_GW_IGNITION);
    }
    this.ignitionThreshold = (Number.isFinite(envIgn) && envIgn > 0 && envIgn < 1)
      ? envIgn
      : (opts.ignitionThreshold ?? 0.45);
    this.softmaxTau = opts.softmaxTau ?? 0.5;
    this.thetaPeriod = opts.thetaPeriod ?? 167;
    this.broadcastDecay = opts.broadcastDecay ?? 0.85;
    this.historyLen = opts.historyLen ?? 32;

    this._clusters = []; // registered clusters reporting candidates
    this._tickCounter = 0;

    // Current broadcast state — clusters READ this each tick to receive
    // global-workspace feedback. Decays over time so old ignitions fade.
    this.currentBroadcast = null; // {clusterName, label, value, ts, age}

    // Ignition history (capped at historyLen — bounded memory).
    this._ignitionHistory = [];

    // Stats for diagnostic.
    this.stats = {
      ticksTotal: 0,
      ignitions: 0,
      subthreshold: 0,
      thetaGated: 0,
    };
  }

  /**
   * Register a cluster as a workspace participant. Cluster must
   * implement `getWorkspaceCandidate()` returning
   * `{label: string, value: number}` or null when it has nothing
   * to contribute this tick.
   */
  registerCluster(cluster) {
    if (cluster && this._clusters.indexOf(cluster) < 0) {
      this._clusters.push(cluster);
    }
  }

  /**
   * Workspace tick — fires once per brain tick. Aggregates candidates,
   * runs softmax + ignition gate, broadcasts winner if above threshold.
   * Theta-gated.
   */
  tick() {
    this._tickCounter = (this._tickCounter + 1) | 0;
    this.stats.ticksTotal += 1;

    // Decay active broadcast (so winners fade). Both `value` and
    // `strength` decay together so downstream consumers reading
    // strength see the ignition lose dominance over the ~10 ticks
    // it takes to fade (broadcastDecay=0.85 per tick).
    if (this.currentBroadcast) {
      this.currentBroadcast.age += 1;
      this.currentBroadcast.value *= this.broadcastDecay;
      this.currentBroadcast.strength *= this.broadcastDecay;
      if (this.currentBroadcast.value < 0.01) {
        this.currentBroadcast = null;
      }
    }

    // Theta-gated: only fire ignition during upper half of theta phase
    // (sin > 0). Models cortical phase-amplitude coupling — conscious
    // moments cluster on the theta rhythm.
    const thetaPhase = (this._tickCounter % this.thetaPeriod) / this.thetaPeriod;
    if (thetaPhase >= 0.5) {
      this.stats.thetaGated += 1;
      return; // subthreshold processing only
    }

    // Aggregate candidates from all registered clusters.
    const candidates = [];
    for (const c of this._clusters) {
      try {
        if (typeof c.getWorkspaceCandidate === 'function') {
          const cand = c.getWorkspaceCandidate();
          if (cand && typeof cand.value === 'number' && cand.label) {
            candidates.push({
              clusterName: c.name || 'unknown',
              label: cand.label,
              value: cand.value,
            });
          }
        }
      } catch { /* cluster failed to report — skip */ }
    }
    if (candidates.length === 0) return;

    // Softmax over values with temperature τ.
    const values = candidates.map(c => c.value / this.softmaxTau);
    const maxV = Math.max(...values);
    const expSum = values.reduce((s, v) => s + Math.exp(v - maxV), 0);
    const probs = values.map(v => Math.exp(v - maxV) / expSum);

    // Find winner.
    let bestIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[bestIdx]) bestIdx = i;
    }
    const maxProb = probs[bestIdx];

    if (maxProb >= this.ignitionThreshold) {
      // IGNITION — winner broadcasts.
      const winner = candidates[bestIdx];
      this.currentBroadcast = {
        clusterName: winner.clusterName,
        label: winner.label,
        value: winner.value,
        prob: maxProb,
        // Ignition STRENGTH — read by downstream consumers (cluster.js
        // emitWordDirect uses it to scale GW broadcast bias on word_motor
        // argmax per Baars 1988 GWT). Equal to the softmax max probability
        // that crossed the ignition threshold — strong ignitions have
        // strength near 1.0, threshold-grazing ignitions near
        // `ignitionThreshold`. CONTRACT: this field is ALWAYS a finite
        // [0,1] number whenever a broadcast object exists. Decays with
        // value via broadcastDecay below.
        strength: maxProb,
        ts: Date.now(),
        age: 0,
      };
      this.stats.ignitions += 1;
      this._ignitionHistory.push({ ...this.currentBroadcast });
      while (this._ignitionHistory.length > this.historyLen) {
        this._ignitionHistory.shift();
      }
    } else {
      this.stats.subthreshold += 1;
    }
  }

  /**
   * Read current broadcast for cluster feedback consumption.
   * Returns null when no active broadcast (subthreshold tick or
   * decayed away). Clusters can use this to bias their next tick's
   * activation toward conscious content.
   */
  getBroadcast() {
    return this.currentBroadcast;
  }

  /**
   * Diagnostic snapshot for dashboard / heartbeat.
   */
  getStats() {
    const ignitionRate = this.stats.ticksTotal > 0
      ? this.stats.ignitions / this.stats.ticksTotal
      : 0;
    return {
      ...this.stats,
      ignitionRate,
      currentBroadcast: this.currentBroadcast,
      historyLen: this._ignitionHistory.length,
      clustersRegistered: this._clusters.length,
      thetaPhase: (this._tickCounter % this.thetaPeriod) / this.thetaPeriod,
    };
  }

  /**
   * Recent ignition history for dashboard timeline display.
   */
  getHistory() {
    return [...this._ignitionHistory];
  }
}

// CommonJS + ES module exports for cross-environment use.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GlobalWorkspace };
}
export { GlobalWorkspace };
