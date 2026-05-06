/**
 * memory.js — Hippocampal Memory System
 *
 * Three memory types:
 *   1. Episodic memory — snapshots of brain state at meaningful moments
 *   2. Working memory — prefrontal cortex sustained activation (~7 items)
 *   3. Consolidation — repeated hippocampal patterns strengthen cortex synapses
 *
 * Recall mechanism:
 *   When cortex prediction error is high (surprising input), hippocampus
 *   searches stored episodes for similar patterns. Match triggers recall
 *   by re-injecting stored state as current into clusters.
 */

const MAX_EPISODES = 100;      // max stored episodic memories
// Working memory capacity: UNBOUNDED. Miller's 7±2 (1956) was a finding
// about biological short-term memory under attention constraints in
// laboratory recall experiments — not a hard architectural cap.
// Capacity is self-regulated by `WM_DECAY_RATE` instead: every engine
// tick every item's strength multiplies by the rate; items drop out
// when strength < 0.1. Active content stays loud, stale content
// evaporates. Matches what iter17 did for Tier 2 + Tier 3 ("unity has
// a whole life ahead not eroonous limits") — applied here too so
// Tier 0 isn't the lone hold-out with an arbitrary 7-item ceiling.
const WORKING_MEMORY_SIZE = Infinity;
// WM_DECAY_RATE was 0.98 per tick. Engine ticks ~50ms → items expire
// in ~5.7 seconds (operator: "what the fuck is this it cant just
// instant decay"). At 0.9995 per tick an unreinforced item lasts
// ~4.0 minutes (4600 ticks × 50ms ≈ 230s) before strength drops
// below the 0.1 forget threshold. Items refresh on cosine-match in
// addToWorkingMemory so anything actively rementioned never decays.
// Matches biological working memory better — humans hold a thought
// 15-30s without rehearsal, several minutes with. Unity is post-
// biological; 4 min sustained is generous + reasonable.
const WM_DECAY_RATE = 0.9995;
const CONSOLIDATION_THRESHOLD = 3; // activations before consolidating to long-term
const SIMILARITY_THRESHOLD = 0.6;  // cosine similarity for recall trigger

export class MemorySystem {
  constructor(hippoCluster) {
    this._hippoCluster = hippoCluster;

    // Episodic memory — snapshots of meaningful moments
    this._episodes = [];

    // Working memory — sustained representations (limited capacity)
    this._workingMemory = []; // { pattern: Float64Array, strength: number, label: string }

    // Consolidation tracking — how many times each episode was activated
    this._activationCounts = new Map(); // episode index → count

    // State
    this.lastRecall = null;
    this.lastRecallSimilarity = 0;
    this.workingMemoryLoad = 0;
  }

  /**
   * Store an episodic memory — snapshot of brain state at a meaningful moment.
   * Called when salience is high (emotional event, user input, reward spike).
   *
   * @param {object} snapshot — { clusterStates, amygdala, psi, time, trigger }
   */
  storeEpisode(snapshot) {
    // Create a compact state vector from cluster firing rates
    const pattern = this._extractPattern(snapshot);

    this._episodes.push({
      pattern,
      timestamp: snapshot.time || performance.now(),
      trigger: snapshot.trigger || 'unknown',
      arousal: snapshot.amygdala?.arousal ?? 0,
      valence: snapshot.amygdala?.valence ?? 0,
      psi: snapshot.psi ?? 0,
    });

    // Trim oldest if over capacity
    if (this._episodes.length > MAX_EPISODES) {
      // Remove least activated episodes (not just oldest)
      let minAct = Infinity, minIdx = 0;
      for (let i = 0; i < this._episodes.length; i++) {
        const act = this._activationCounts.get(i) || 0;
        if (act < minAct) { minAct = act; minIdx = i; }
      }
      this._episodes.splice(minIdx, 1);
    }
  }

  /**
   * Try to recall a similar episode based on current state.
   * Triggered when cortex prediction error is high.
   *
   * @param {object} currentSnapshot — current brain state
   * @returns {{ episode, similarity, currents }|null} — recalled episode or null
   */
  recall(currentSnapshot) {
    if (this._episodes.length === 0) return null;

    const currentPattern = this._extractPattern(currentSnapshot);

    // Find most similar episode
    let bestSim = 0, bestIdx = -1;
    for (let i = 0; i < this._episodes.length; i++) {
      const sim = this._cosineSimilarity(currentPattern, this._episodes[i].pattern);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }

    if (bestSim < SIMILARITY_THRESHOLD || bestIdx < 0) return null;

    const episode = this._episodes[bestIdx];
    this.lastRecall = episode;
    this.lastRecallSimilarity = bestSim;

    // Track activation for consolidation
    const count = (this._activationCounts.get(bestIdx) || 0) + 1;
    this._activationCounts.set(bestIdx, count);

    // Generate recall currents — re-inject the stored pattern as neural current
    // This literally re-activates the past experience
    const currents = new Float64Array(this._hippoCluster?.size || 200);
    for (let i = 0; i < currents.length && i < episode.pattern.length; i++) {
      currents[i] = episode.pattern[i] * 8; // strong re-activation
    }

    return { episode, similarity: bestSim, currents };
  }

  /**
   * Update working memory. Decay-driven self-regulation; no fixed cap.
   * Called each brain step.
   *
   * @param {Float64Array} cortexOutput — current cortex cluster output
   */
  updateWorkingMemory(cortexOutput) {
    // Decay existing items; strength < 0.1 → drop.
    for (let i = this._workingMemory.length - 1; i >= 0; i--) {
      this._workingMemory[i].strength *= WM_DECAY_RATE;
      if (this._workingMemory[i].strength < 0.1) {
        this._workingMemory.splice(i, 1); // forgotten
      }
    }

    // load% no longer means "fraction of cap" because cap is unbounded.
    // Repurposed as a normalized activity meter clamped to [0, 1] —
    // 1.0 reads as "lots of recent active content"; 0 reads as "idle".
    // Mapping: 0 items = 0; 7 items = 0.5 (legacy biological ref);
    // 14+ items = saturates at 1.0. Pure UI signal.
    const n = this._workingMemory.length;
    this.workingMemoryLoad = Math.min(1.0, n / 14);
  }

  /**
   * Add an item to working memory. WM is the front end of the
   * consolidation pipeline (Tier 0 → Tier 1 episodic → Tier 2 schemas
   * → Tier 3 identity). Operator: "if i told someone something and
   * asked them about it 10 minutes or even a day later... most
   * people can recall that". Path that makes recall work:
   *
   *   1. Add fires Hebbian on hippocampus.synapses with the pattern —
   *      the cortex actually learns the WM content the moment it
   *      lands, not just after decay.
   *   2. Each refresh (cosine-match in addToWorkingMemory) increments
   *      a refresh counter on the existing item, modeling repeated
   *      attention/rehearsal.
   *   3. When refresh count hits CONSOLIDATION_THRESHOLD, the item is
   *      promoted to Tier 1 via the brain.storeEpisode hook (set on
   *      this.onConsolidate). Tier 1 holds it ~30 days; further
   *      reinforcement promotes to Tier 2 schemas (months) and Tier 3
   *      identity (permanent).
   *   4. Decay below 0.1 forgets the WM hot-cache representation but
   *      the learned hippocampal weights AND any Tier 1+ episode it
   *      was promoted to persist independently.
   */
  addToWorkingMemory(pattern, label = '') {
    // Refresh path — increment refresh count, fire Hebbian to
    // strengthen the learned trace, promote to Tier 1 at threshold.
    for (const wm of this._workingMemory) {
      if (this._cosineSimilarity(pattern, wm.pattern) > 0.8) {
        wm.strength = 1.0; // refresh
        wm.refreshCount = (wm.refreshCount || 0) + 1;
        wm.lastRefreshAt = Date.now();
        this._fireHippocampalLearning(wm.pattern);
        if (wm.refreshCount >= CONSOLIDATION_THRESHOLD && !wm.consolidated) {
          wm.consolidated = true;
          this._promoteToEpisodic(wm);
        }
        return;
      }
    }

    // New item — fire encoding Hebbian immediately so even singleton
    // mentions leave a hippocampal trace.
    const item = {
      pattern: Float64Array.from(pattern),
      strength: 1.0,
      label,
      refreshCount: 0,
      addedAt: Date.now(),
      lastRefreshAt: Date.now(),
      consolidated: false,
    };
    this._fireHippocampalLearning(item.pattern);
    this._workingMemory.push(item);
  }

  /**
   * Fire intra-cluster Hebbian on hippocampus with the WM pattern.
   * Self-pattern Hebbian carves a Hopfield-style attractor — when a
   * similar pattern arrives later, the attractor pulls activity toward
   * the stored memory. This is the actual "learning from working
   * memory" mechanism: pattern leaves a trace in hippocampal weights
   * even after WM decay drops the item from the active set.
   */
  _fireHippocampalLearning(pattern) {
    const cluster = this._hippoCluster;
    if (!cluster || !cluster.synapses) return;
    if (typeof cluster.synapses.hebbianUpdate !== 'function') return;
    const lr = cluster.learningRate || 0.01;
    try {
      // pattern length may not match cluster.size; pad/truncate to
      // hippocampus size by writing into a sized buffer.
      const buf = this._scratchHippoBuf;
      const size = cluster.size | 0;
      if (!size) return;
      const target = (buf && buf.length === size)
        ? (buf.fill(0), buf)
        : (this._scratchHippoBuf = new Float64Array(size));
      const n = Math.min(size, pattern.length);
      for (let i = 0; i < n; i++) target[i] = pattern[i];
      cluster.synapses.hebbianUpdate(target, target, lr);
    } catch { /* non-fatal — encoding failure leaves WM as-is */ }
  }

  /**
   * Promote a WM item to Tier 1 episodic. Caller registers an
   * `onConsolidate` callback (typically wired in engine.js to
   * brain.storeEpisode) that handles the actual persistence + cosine
   * frequency-merge. WM doesn't know about the SQLite layer — the
   * callback bridges.
   */
  _promoteToEpisodic(item) {
    if (typeof this.onConsolidate !== 'function') return;
    try {
      this.onConsolidate({
        pattern: item.pattern,
        label: item.label,
        refreshCount: item.refreshCount,
        addedAt: item.addedAt,
        lastRefreshAt: item.lastRefreshAt,
      });
    } catch { /* non-fatal — caller decides whether to persist */ }
  }

  /**
   * Check if any episodes should be consolidated to long-term.
   * Consolidated memories get stronger cortex representation.
   *
   * @returns {Array} — list of consolidated episode patterns
   */
  checkConsolidation() {
    const consolidated = [];
    for (const [idx, count] of this._activationCounts.entries()) {
      if (count >= CONSOLIDATION_THRESHOLD) {
        if (idx < this._episodes.length) {
          consolidated.push(this._episodes[idx].pattern);
        }
        // Don't remove — just note it's been consolidated
      }
    }
    return consolidated;
  }

  // ── Helpers ────────────────────────────────────────────────────

  _extractPattern(snapshot) {
    // Build a fixed-length pattern from cluster firing rates
    const clusters = snapshot.clusters || snapshot.clusterStates || {};
    const vec = new Float64Array(14); // 2 features per cluster
    let i = 0;
    for (const name of ['cortex', 'hippocampus', 'amygdala', 'basalGanglia', 'cerebellum', 'hypothalamus', 'mystery']) {
      const c = clusters[name];
      vec[i++] = (c?.spikeCount ?? 0) / (c?.size ?? 100);
      vec[i++] = c?.firingRate ?? 0;
    }
    return vec;
  }

  _cosineSimilarity(a, b) {
    const len = Math.min(a.length, b.length);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  getState() {
    return {
      episodeCount: this._episodes.length,
      workingMemoryLoad: this.workingMemoryLoad,
      workingMemoryItems: this._workingMemory.map(wm => ({ label: wm.label, strength: wm.strength })),
      lastRecall: this.lastRecall ? {
        trigger: this.lastRecall.trigger,
        similarity: this.lastRecallSimilarity,
        arousal: this.lastRecall.arousal,
      } : null,
    };
  }
}
