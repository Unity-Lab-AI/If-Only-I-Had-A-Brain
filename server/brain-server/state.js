// ServerBrain state-broadcast mixin — extracted from brain-server.js per
// the per-concern split (see server/brain-server/README.md). Attached
// to ServerBrain.prototype via Object.assign at brain-server.js entry-
// point bottom.
//
// Methods in this mixin (8 total) — full state-broadcast surface for
// dashboard / WS clients + dictionary smoke-test + event-ring:
//   _broadcastStateNow()                         — force-push state payload
//                                                  to every connected WS
//                                                  client immediately
//   _runDictionarySmokeTest()                    — fire one-shot
//                                                  dictionaryapi.dev probe
//                                                  with PASS/FAIL update
//   _scheduleSmokeTestRetry()                    — periodic retry (60s on
//                                                  FAIL, 1hr on PASS) with
//                                                  in-flight guard
//   _computeMinGrade()                           — minimum grade across
//                                                  all subjects (gate read)
//   getState()                                   — assemble the full state
//                                                  payload (Φ, Ψ, mood,
//                                                  curriculum, GW broadcast,
//                                                  ws-pressure, emit
//                                                  diagnostic, etc.)
//   pushBrainEvent(type, region, label, detail)  — append to brain-event
//                                                  ring with TTL
//   _recentBrainEvents()                         — filter brain-event ring
//                                                  to entries newer than
//                                                  the TTL window for
//                                                  popup-rendering
//   _computeCortexDivergence(perCluster)         — divergence-from-baseline
//                                                  per-cluster for the
//                                                  dashboard's cortex
//                                                  divergence panel
//
// All methods reference brain state via `this.` — fully prototype-chain
// compatible.

// Module-level requires. Pre-fix the P4.3.b extraction did not bring
// these along — the mixin relied on the parent brain-server.js scope.
// Caught by operator 2026-06-17 live test boot crash cascade.
const path = require('path');
const fs = require('fs');
const definitionService = require('../definition-service.js');

const SERVER_STATE_MIXIN = {
  /**
   * Get full brain state for broadcasting.
   */

  /**
   * Force-push the full state payload to every connected client RIGHT
   * NOW instead of waiting for the next periodic broadcast tick. Used
   * by event handlers (e.g. dictionary smoke test completion) that
   * need to land a value on dashboards immediately so panels never
   * flash a stale placeholder during the inter-tick window.
   *
   * Mirrors the periodic broadcaster's send shape so dashboard render
   * code is unchanged.
   */
  _broadcastStateNow() {
    if (!this.clients || this.clients.size === 0) return;
    let payload;
    try { payload = JSON.stringify({ type: 'state', state: this.getState() }); }
    catch { return; }
    for (const [ws] of this.clients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(payload); } catch {}
      }
    }
  },

  /**
   * Fire one dictionary API smoke test and update
   * `_dictionarySmokeTestResult` on completion. Fire-and-forget — caller
   * doesn't await. Force-broadcasts state on result so the dashboard
   * panel doesn't sit on a stale value until the next periodic tick.
   * Guarded by `_smokeTestInFlight` so periodic retries don't stack
   * concurrent fetches if a previous one is slow.
   */
  _runDictionarySmokeTest() {
    if (this._smokeTestInFlight) return;
    this._smokeTestInFlight = true;
    try {
      if (definitionService._hasFetch && definitionService._hasFetch()) {
        definitionService.getDefinition('test', { timeoutMs: 4000 }).then(def => {
          const ok = !!(def && typeof def === 'string' && def.length > 0);
          this._dictionarySmokeTestResult = ok;
          this._dictionarySmokeTestTs = Date.now();
          if (ok) {
            console.log(`[Brain] dictionary API ready — "test" → "${def.slice(0, 80)}${def.length > 80 ? '...' : ''}"`);
          } else {
            console.warn(`[Brain] dictionary API check failed — getDefinition('test') returned ${def === null ? 'null' : typeof def}. Definition lookups will degrade.`);
          }
          try { this._broadcastStateNow(); } catch {}
        }).catch(err => {
          this._dictionarySmokeTestResult = false;
          this._dictionarySmokeTestTs = Date.now();
          console.warn(`[Brain] dictionary API check threw: ${err?.message || err}`);
          try { this._broadcastStateNow(); } catch {}
        }).finally(() => {
          this._smokeTestInFlight = false;
        });
      } else {
        this._dictionarySmokeTestResult = false;
        this._smokeTestInFlight = false;
        console.warn(`[Brain] dictionary API unavailable — globalThis.fetch missing. Upgrade Node ≥18 for live dictionary.`);
      }
    } catch (err) {
      this._dictionarySmokeTestResult = false;
      this._smokeTestInFlight = false;
      console.warn(`[Brain] dictionary API setup threw: ${err?.message || err}`);
    }
  },

  /**
   * Schedule periodic smoke test re-runs. Sleeps 60s while the last
   * result is FAIL so transient DNS/network failures recover quickly;
   * sleeps 1hr while last result is PASS so upstream-goes-down mid-run
   * is still caught without spamming dictionaryapi.dev. Re-arms after
   * each fire so the loop runs forever.
   */
  _scheduleSmokeTestRetry() {
    const delay = this._dictionarySmokeTestResult === true
      ? 60 * 60 * 1000   // 1hr while passing
      : 60 * 1000;       // 60s while failing or still pending
    this._smokeTestRetryTimer = setTimeout(() => {
      this._runDictionarySmokeTest();
      // Re-arm regardless of in-flight — _runDictionarySmokeTest
      // self-guards. Re-evaluate delay on next tick based on the
      // updated result.
      this._scheduleSmokeTestRetry();
    }, delay);
    // Don't keep the event loop alive just for this timer — if the
    // server is shutting down we want to exit cleanly.
    if (this._smokeTestRetryTimer && typeof this._smokeTestRetryTimer.unref === 'function') {
      this._smokeTestRetryTimer.unref();
    }
  },

  /**
   * T18.3.b — Compute Unity's lowest passing grade across all subjects.
   * Returns a string from the grade ladder (pre-K → K → grade1..12 →
   * college1..4 → grad → phd) or 'unknown' if the cortex cluster isn't
   * initialized yet. Reused by `getState()` (HUD broadcast) and the
   * silent-response path (so the client knows which grade is gating
   * her speech).
   */
  _computeMinGrade() {
    if (!this.cortexCluster || !this.cortexCluster.grades) return 'unknown';
    const order = ['pre-K','K','grade1','grade2','grade3','grade4','grade5','grade6','grade7','grade8','grade9','grade10','grade11','grade12','college1','college2','college3','college4','grad','phd'];
    let lo = 'phd';
    for (const g of Object.values(this.cortexCluster.grades)) {
      const iLo = order.indexOf(lo);
      const iG  = order.indexOf(g);
      if (iG >= 0 && (iLo < 0 || iG < iLo)) lo = g;
    }
    return lo;
  },

  getState() {
    const clusterStates = {};
    for (const [name, cluster] of Object.entries(this.clusters)) {
      const size = cluster.size || 1;
      const spikeCount = cluster.spikeCount | 0;
      // Dashboard + 3D brain expect firingRate AND spikeRate as a
      // ratio in [0, 1] — spikeCount/size. Server previously put raw
      // count-per-substep EMA into `firingRate` which showed as huge
      // numbers that rounded to "0%" after the dashboard's Math.round
      // (count × 100) overflowed the expected 0-100 band. Surface
      // both field names (spikeRate canonical, firingRate alias) so
      // old clients reading either name get the correct ratio.
      const spikeRate = Math.min(1, Math.max(0, spikeCount / size));
      clusterStates[name] = {
        size,
        spikeCount,
        spikeRate,
        firingRate: spikeRate,
        // T18.4.c — GPU voltage-mean telemetry (Rulkov x, averaged across
        // every neuron in the cluster via GPU atomic reduction). Undefined
        // on first few ticks until compute.html reports it back.
        meanVoltage: typeof cluster.meanVoltage === 'number' ? cluster.meanVoltage : null,
      };
    }
    // Emit language cortex sub-region activity as pseudo-clusters
    // (keys: lang_motor, lang_phon, lang_sem, lang_letter, lang_visual,
    // lang_auditory, lang_fineType, lang_free) so the 3D brain can render
    // Broca's, Wernicke's, angular gyrus, VWFA, V1, Heschl's, temporal pole,
    // and PFC as filled-in sub-volumes between the existing 7 regions.

    // At biological scale the GPU owns cortex spike state — the CPU
    // `cortexCluster.lastSpikes` Uint8Array stays zero. Prefer the
    // GPU-reported per-region counts captured by `_computeCortex-
    // Divergence` from each compute_batch result. Fall back to CPU
    // shadow only when the GPU readback hasn't arrived yet
    // (first few ticks after boot).
    if (this.cortexCluster && this.cortexCluster.regions) {
      const gpuRS = this._lastCortexRegionSpikes;
      const gpuFresh = gpuRS && this._lastCortexRegionSpikesAt
        && (Date.now() - this._lastCortexRegionSpikesAt) < 5000;
      const ls = this.cortexCluster.lastSpikes;
      for (const [regName, region] of Object.entries(this.cortexCluster.regions)) {
        const size = region.end - region.start;
        let spikeCount = 0;
        if (gpuFresh && typeof gpuRS[regName] === 'number') {
          spikeCount = gpuRS[regName] | 0;
        } else if (ls) {
          for (let i = region.start; i < region.end && i < ls.length; i++) {
            if (ls[i]) spikeCount++;
          }
        }
        const spikeRate = Math.min(1, Math.max(0, spikeCount / Math.max(1, size)));
        clusterStates[`lang_${regName}`] = {
          size,
          spikeCount,
          spikeRate,
          firingRate: spikeRate,
        };
      }
    }

    // Derive band power from INSTANT spike rates (not slow EMA)
    const cortexRate = this.clusters.cortex.spikeCount / (this.CLUSTER_SIZES.cortex || 1);
    const hippoRate = this.clusters.hippocampus.spikeCount / (this.CLUSTER_SIZES.hippocampus || 1);
    const amygRate = this.clusters.amygdala.spikeCount / (this.CLUSTER_SIZES.amygdala || 1);
    const bgRate = this.clusters.basalGanglia.spikeCount / (this.CLUSTER_SIZES.basalGanglia || 1);
    const cerebRate = this.clusters.cerebellum.spikeCount / (this.CLUSTER_SIZES.cerebellum || 1);
    const hypoRate = this.clusters.hypothalamus.spikeCount / (this.CLUSTER_SIZES.hypothalamus || 1);
    const bandPower = {
      gamma: (cortexRate + amygRate) * 50,              // fast cortical + emotional
      beta:  (bgRate + cortexRate) * 30,                // motor planning + attention
      alpha: this.coherence * 3 + (1 - this.arousal) * 2, // relaxed coherence
      theta: (hippoRate + hypoRate) * 40 + (this._isDreaming ? 3 : 0), // memory + dreaming
    };

    return {
      time: (Date.now() - (this._startedAt || Date.now())) / 1000, // wall clock uptime in seconds
      simTime: this.time,  // simulation dt accumulation
      frameCount: this.frameCount,
      totalSpikes: this.totalSpikes,
      spikeCount: this.totalSpikes,
      arousal: this.arousal,
      valence: this.valence,
      fear: this.fear,
      psi: this.psi,
      coherence: this.coherence,
      coherenceTheta: this.coherenceTheta,
      coherenceGamma: this.coherenceGamma,
      reward: this.reward,
      drugState: this._drugStateLabel(),
      drugSnapshot: this._drugSnapshot(),
      bandPower,
      clusters: clusterStates,
      motor: {
        selectedAction: this.motorAction,
        confidence: this.motorConfidence,
        channelRates: Array.from(this.motorChannels),
      },
      // T18.3.b — persistent grade state on every broadcast so the HUD
      // can show "Unity is at pre-K" without the user typing
      // /curriculum status. `grades` is the per-subject map; `minGrade`
      // is the lowest passing grade (what caps Unity's speech ceiling).
      // `canSpeak` is true once the motor region has been trained — the
      // letter→motor direct-pattern Hebbian at kindergarten ELA is what
      // flips this from false to true.
      grades: this.cortexCluster?.grades ? { ...this.cortexCluster.grades } : null,
      minGrade: this._computeMinGrade(),
      canSpeak: this._computeMinGrade() !== 'pre-K',
      // T17.7 Phase B.4 — dual-cortex divergence telemetry. Scalar in
      // [0, 1]: 0 = standalone and main-cortex sub-regions agree
      // perfectly, 1 = one saturated while other silent. Cerebellum
      // error correction dampens this via Ψ-gated negative feedback
      // in the cortex errorCorrection term. Dashboard can render as
      // a health bar — should trend toward 0 over ticks as cerebellum
      // corrects. Sustained divergence = Phase B migration wiring bug
      // worth investigating (not a strict abort, just a signal).
      cortexDivergence: this._cortexDivergence || 0,
      // T17.7 Phase C follow-up — per-region breakdown so Gee can
      // inspect WHERE cortex state is diverging during K curriculum
      // walk. Map<regionName, {standRate, mainRate, divergence}>
      // with rates in [0, 1] (spike fraction per region). Empty when
      // GPU regionSpikes readback is absent (e.g. pre-GPU warmup).
      cortexDivergenceByRegion: this._cortexDivergenceByRegion || {},
      connectedUsers: this.clients.size,
      isDreaming: this._isDreaming || false,
      totalNeurons: this.TOTAL_NEURONS,
      scale: this.SCALE + 'x',
      // Shared emotion — everyone sees Unity's mood
      sharedMood: this._getSharedMood(),
      // Live performance stats
      perf: this._perfStats,
      // Brain growth metrics
      growth: {
        totalWords: Object.keys(this._wordFreq || {}).length,
        totalInteractions: Object.values(this._conversations || {}).reduce((s, c) => s + c.length, 0),
        totalEpisodes: this._db ? this.getEpisodeCount() : 0,
        uptime: (Date.now() - (this._startedAt || Date.now())) / 1000,
        totalFrames: this.frameCount,
      },
      // iter15-mem — unified 5-tier memory snapshot for dashboard +
      // 3D brain memory tab. Tier 1 (Episodic SQLite) + Tier 2
      // (Schematic) + Tier 3 (Identity-bound) + ConsolidationEngine
      // + Working memory all in one payload. Operator verbatim:
      // "shall be one unified system of the brain for memory not
      // some side processes".
      memoryStats: this._getMemoryStats(),
      //Phase 6 — Display/Visibility snapshot for dashboard.
      // Bounded payload: aggregates only, no per-neuron / per-column
      // enumeration, no unbounded lists. Counts + small fixed-size
      // arrays only (gaps capped at 5, etc).
      consciousness: this._getConsciousnessState(),
      // WS backpressure metrics for the GPU client. Reads
      // _gpuClient.bufferedAmount + drop/absorb/enobufs counters +
      // a rolling drops/sec rate so operator can see whether the
      // BLOCK-not-DROP path is keeping Hebbian updates intact.
      wsPressure: this._getWsPressureState(),
      // Failed-emission diagnostic — surfaces `cortexCluster._lastEmitRejection`
      // (set by emitWordDirect when bestMean falls below the adaptive
      // signal floor OR no candidate word emerged) so the dashboard
      // can show WHY the brain went silent instead of leaving the chat
      // path return blank with no traceable cause. Pairs with the
      // adaptive-floor + EMA telemetry the same emit path tracks.
      emitDiagnostic: (this.cortexCluster && this.cortexCluster._lastEmitRejection)
        ? {
            reason: this.cortexCluster._lastEmitRejection.reason || 'unknown',
            bestMean: this.cortexCluster._lastEmitRejection.bestMean || 0,
            floor: this.cortexCluster._lastEmitRejection.floor || 0,
            ema: this.cortexCluster._lastEmitRejection.ema || 0,
            ts: this.cortexCluster._lastEmitRejection.ts || 0,
            ageMs: Math.max(0, Date.now() - (this.cortexCluster._lastEmitRejection.ts || Date.now())),
            signalEMA: this.cortexCluster._emitSignalEMA || 0,
            signalFloor: this.cortexCluster._emitSignalFloor || 0,
            sampleCount: this.cortexCluster._emitSignalSampleCount || 0,
          }
        : null,
      // Live brain-event stream — plasticity fires, curriculum phases,
      // drug events, template classifications, everything the cortex
      // is DOING in the current window. Each entry carries
      // {seq, ts, type, region, label, detail}. Dashboard filters to
      // events newer than `_brainEventTTL` for popup rendering. The
      // seq field lets the dashboard dedupe across poll intervals.
      brainEvents: this._recentBrainEvents(),
      // Current training-subject snapshot for the dashboard "Current
      // Training" card. Null fields when no cell is active. Sourced
      // from the curriculum's per-cell + per-subject counters so the
      // dashboard's subject/grade/progress display and the curriculum
      // teach path can never drift out of sync — ONE cortex, ONE
      // curriculum object, ONE dashboard read.
      curriculum: this.curriculum && typeof this.curriculum.getCurriculumStatus === 'function'
        ? this.curriculum.getCurriculumStatus()
        : null,
      // Audit A.1 — P6.6 compositional-emergence telemetry surfaced.
      // Was previously write-only inside cluster/telemetry.js. Reports
      // verbatim/novel/partial classification rates + max-novelty
      // sample + firstNovelMsAfterBoot. Dashboard panel reads this.
      compositionalEmergence: (this.cortexCluster && typeof this.cortexCluster.getCompositionalStats === 'function')
        ? (() => { try { return this.cortexCluster.getCompositionalStats(); } catch (err) { return { error: err.message }; } })()
        : null,
      // Audit A.2 — P6.7 word-creation tip-of-tongue candidates. Top-10
      // by frequency, minCount=3. Dashboard renders a panel showing the
      // emergent compounds the rejection-loop is observing.
      wordCreationCandidates: (this.cortexCluster && typeof this.cortexCluster.getWordCreationCandidates === 'function')
        ? (() => { try { return this.cortexCluster.getWordCreationCandidates({ limit: 10, minCount: 3 }); } catch (err) { return { error: err.message }; } })()
        : null,
      // Audit A.3 — P6.3 chat-time deep Hebbian counters. turns +
      // totalPairs + lastTs + errors (post-A.4 the silent-swallow
      // catch increments these counters instead of dropping the error).
      chatTimeHebbianStats: this._chatTimeHebbianStats
        ? {
            turns: this._chatTimeHebbianStats.turns || 0,
            totalPairs: this._chatTimeHebbianStats.totalPairs || 0,
            lastTs: this._chatTimeHebbianStats.lastTs || 0,
            errors: this._chatTimeHebbianStats.errors || 0,
            lastError: this._chatTimeHebbianStats.lastError || null,
          }
        : { turns: 0, totalPairs: 0, lastTs: 0, errors: 0, lastError: null },
      // Audit A.3 — P6.4 dream-recombination consolidation counters.
      // Per audit E.4 the curriculum-side _dreamRecombinationStats also
      // exposes a `consolidatedSamples` ring (cap 20) for operator audit.
      dreamRecombinationStats: (this.curriculum && this.curriculum._dreamRecombinationStats)
        ? {
            totalDreamed: this.curriculum._dreamRecombinationStats.totalDreamed || 0,
            novelConsolidated: this.curriculum._dreamRecombinationStats.novelConsolidated || 0,
            lastTs: this.curriculum._dreamRecombinationStats.lastTs || 0,
            consolidatedSamples: Array.isArray(this.curriculum._dreamRecombinationStats.consolidatedSamples)
              ? this.curriculum._dreamRecombinationStats.consolidatedSamples.slice(-20)
              : [],
          }
        : { totalDreamed: 0, novelConsolidated: 0, lastTs: 0, consolidatedSamples: [] },
    };
  },

  /**
   * Append a brain event to the ring buffer. Oldest events drop off
   * once the buffer fills. Callers supply:
   *   - type: short identifier ('plasticity', 'teach', 'gate', 'drug')
   *   - region: cortex sub-region the event anchors to ('motor', 'sem',
   *     'fineType', 'intra', or a cluster name). Dashboard uses this
   *     to place the popup on the correct part of the 3D brain.
   *   - label: short human-readable description (≤ 40 chars ideal)
   *   - detail: optional structured payload for operator debugging
   */
  pushBrainEvent(type, region, label, detail) {
    if (!this._brainEvents) return;
    this._brainEventSeq += 1;
    this._brainEvents.push({
      seq: this._brainEventSeq,
      ts: Date.now(),
      type: String(type || 'event'),
      region: region ? String(region) : null,
      label: String(label || ''),
      detail: detail || null,
    });
    if (this._brainEvents.length > this._brainEventCap) {
      this._brainEvents.splice(0, this._brainEvents.length - this._brainEventCap);
    }
  },

  _recentBrainEvents() {
    if (!this._brainEvents || this._brainEvents.length === 0) return [];
    const cutoff = Date.now() - this._brainEventTTL;
    // Only return events still inside the TTL window — older entries
    // stay in the buffer for history but aren't live anymore.
    return this._brainEvents.filter(e => e.ts >= cutoff);
  },

  /**
   * Inject text input as cortex current (Wernicke's area).
   */
  /**
   * Update derived brain state after parallel step.
   * Arousal, valence, Ψ, coherence, motor — computed from cluster results.
   */
  /**
   * Offload one cluster's LIF computation to the GPU client.
   * Returns a promise that resolves when the GPU sends results back.
   */
  /**
   * Offload cluster LIF to GPU client via WebSocket.
   *
   * KEY DESIGN: GPU maintains its OWN voltage state. Server does NOT
   * send 1.28M floats every step. Server sends only:
   *   - init: full voltages (once, on first dispatch per cluster)
   *   - step: tonicDrive + noiseAmp (two numbers, not arrays)
   * GPU sends back: sparse spike indices only (~25K ints, not 1.28M)
   *
   * This cuts WebSocket traffic from ~10MB/step to ~100KB/step.
   */
  /**
   * T17.7 Phase B.4 — compute divergence between standalone
   * cortexCluster sub-region spike counts and main-cortex GPU
   * sub-region readback spike counts. Feeds divergence into the
   * cortex cluster's errorCorrection term via the cerebellum's
   * existing negative-feedback path.
   *
   * Just like left-right hemisphere gating, the brain doesn't
   * "error" — the brain has a center dedicated to error correction.
   * The brain
   * corrects mismatches biologically; we reuse its existing
   * cerebellum-driven correction rather than adding a strict
   * migration-abort gate on top.
   *
   * Ψ-modulated correction gain per the T17.7 architecture plan:
   *   cerebellumCorrectionGain = base · (1 + Ψ · k_Ψ)
   * Low Ψ → correction stays weak, tolerates divergence (fragmented
   * processing state). High Ψ → correction scales up, dampens
   * divergence hard (integrated global-workspace state). Mystery Ψ
   * woven into the equation per 'main equation mystery cant not have
   * it involved'.
   *
   * Stores divergence scalar on this._cortexDivergence so
   * getState broadcasts it as telemetry. Cerebellum error signal
   * augmentation happens in _updateDerivedState via the cached value.
   */
  _computeCortexDivergence(perCluster) {
    const cortexEntry = perCluster.cortex;
    // Capture GPU-reported per-region spike counts so getState can
    // surface them on `lang_*` pseudo-clusters. At biological scale
    // the CPU `cortexCluster.lastSpikes` shadow stays zero (GPU owns
    // the state) — without this capture the 3D brain viz shows
    // 0/N (0.00%) for every cortex sub-region even though the GPU
    // is actively firing millions of spikes across them.
    if (cortexEntry && cortexEntry.regionSpikes) {
      this._lastCortexRegionSpikes = cortexEntry.regionSpikes;
      this._lastCortexRegionSpikesAt = Date.now();
    }
    if (!cortexEntry || !cortexEntry.regionSpikes) {
      this._cortexDivergence = 0;
      this._cortexDivergenceByRegion = {};
      return;
    }
    if (!this.cortexCluster || !this.cortexCluster.regions || !this.cortexCluster.lastSpikes) {
      this._cortexDivergence = 0;
      this._cortexDivergenceByRegion = {};
      return;
    }
    const stand = this.cortexCluster;
    let totalDiff = 0;
    let totalSize = 0;
    // T17.7 Phase C follow-up — per-region divergence breakdown so
    // Gee can verify during K curriculum walk which specific region
    // drifted (letter vs phon vs sem vs motor). Without per-region
    // visibility, a cluster-wide scalar like 0.03 doesn't tell us
    // whether sem is dead-on but motor is drifting, or vice versa.
    // The breakdown surfaces where the equation is slipping.
    const perRegion = {};
    for (const [regName, mainSpikes] of Object.entries(cortexEntry.regionSpikes)) {
      const standReg = stand.regions[regName];
      if (!standReg) continue;
      // Count standalone spikes in this region.
      let standSpikes = 0;
      for (let i = standReg.start; i < standReg.end && i < stand.lastSpikes.length; i++) {
        if (stand.lastSpikes[i]) standSpikes++;
      }
      // Normalize both to firing rates (spike fraction) so different
      // slice sizes compare fairly — absolute counts would always show
      // divergence just from size differences between standalone and
      // main-cortex regions.
      const standLen = standReg.end - standReg.start;
      const mainLen = Math.floor(this.CLUSTER_SIZES.cortex * this._regionFraction(regName));
      const standRate = standLen > 0 ? standSpikes / standLen : 0;
      const mainRate = mainLen > 0 ? mainSpikes / mainLen : 0;
      const diff = Math.abs(standRate - mainRate);
      perRegion[regName] = {
        standRate: +standRate.toFixed(5),
        mainRate: +mainRate.toFixed(5),
        divergence: +diff.toFixed(5),
      };
      totalDiff += diff * mainLen;
      totalSize += mainLen;
    }
    // Divergence = weighted-mean absolute rate difference across regions.
    // Ranges [0, 1] — 0 = perfect match, 1 = one is saturated and
    // other is silent. Biologically-grounded: this IS the signal a
    // real cerebellum would see when cortex prediction diverges from
    // ground truth sensory input.
    this._cortexDivergence = totalSize > 0 ? totalDiff / totalSize : 0;
    this._cortexDivergenceByRegion = perRegion;
  },
};

module.exports = { SERVER_STATE_MIXIN };
