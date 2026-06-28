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
const os = require('os');
const definitionService = require('../definition-service.js');
// PR.1/PR.2 profiling — optional Node internals. Guarded require so a stripped
// runtime degrades to partial profiling instead of crashing the state build.
let _v8 = null; try { _v8 = require('v8'); } catch { _v8 = null; }

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
    let stateObj;
    try {
      stateObj = this.getState();
      payload = JSON.stringify({ type: 'state', state: stateObj });
    }
    catch (err) {
      console.error(`[Brain] [DASHBOARD-DIAG] getState() THREW: ${err.message}`);
      return;
    }
    // Diagnostic — one-shot log of first broadcast state JSON so operator
    // can see EXACTLY what reaches the dashboard via WS. Per 2026-06-17
    // dashboard-zero diagnosis.
    if (!this._firstBroadcastDiagLogged) {
      this._firstBroadcastDiagLogged = true;
      try {
        const consciousness = stateObj && stateObj.consciousness;
        if (consciousness) {
          console.log(`[Brain] [DASHBOARD-DIAG] first broadcast — consciousness keys: ${Object.keys(consciousness).join(', ')}`);
          console.log(`[Brain] [DASHBOARD-DIAG] consciousness.cache=${JSON.stringify(consciousness.cache)}`);
          console.log(`[Brain] [DASHBOARD-DIAG] consciousness.kwiring=${JSON.stringify(consciousness.kwiring)}`);
          console.log(`[Brain] [DASHBOARD-DIAG] consciousness.numColumns=${consciousness.numColumns} layerCounts=${JSON.stringify(consciousness.layerCounts)} hubCount=${consciousness.hubCount}`);
          console.log(`[Brain] [DASHBOARD-DIAG] consciousness.smokeTestPassed=${consciousness.smokeTestPassed}`);
        } else {
          console.log(`[Brain] [DASHBOARD-DIAG] first broadcast — state.consciousness is MISSING. state keys: ${Object.keys(stateObj || {}).join(', ')}`);
        }
        console.log(`[Brain] [DASHBOARD-DIAG] payload size: ${payload.length} bytes`);
      } catch (err) {
        console.log(`[Brain] [DASHBOARD-DIAG] broadcast-diag threw: ${err.message}`);
      }
    }
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
      // Full-Mind K Gate state — per-probe results + aggregate pass rule.
      // Populated by curriculum._aggregateFullMindK() when the K closure
      // gate runs. Dashboard renders the per-probe table + overall pass
      // bar. Null/empty until the first aggregate run completes.
      fullMindK: this._collectFullMindKState(),
      // T17.7 Phase B.4 — dual-cortex divergence telemetry. Scalar in
      // [0, 1]: 0 = standalone and main-cortex sub-regions agree
      // perfectly, 1 = one saturated while other silent. Cerebellum
      // error correction dampens this via Ψ-gated negative feedback
      // in the cortex errorCorrection term. Dashboard can render as
      // a health bar — should trend toward 0 over ticks as cerebellum
      // corrects. Sustained divergence = Phase B migration wiring bug
      // worth investigating (not a strict abort, just a signal).
      cortexDivergence: this._cortexDivergence || 0,
      // T17.7 Phase C follow-up — per-region breakdown so the operator can
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
            skippedCollapsed: this._chatTimeHebbianStats.skippedCollapsed || 0, // BC.7 — binds skipped while collapsed
          }
        : { turns: 0, totalPairs: 0, lastTs: 0, errors: 0, lastError: null, skippedCollapsed: 0 },
      // Donor neuron-compute LEADERBOARD — top contributors by cumulative
      // Gneuron-seconds, with display names. Persists in saveWeights, resets on
      // a fresh walk. Dashboard + public dashboard + compute.html render it; a
      // donor finds their own row by their persistent donorId.
      leaderboard: (() => {
        try {
          const lb = this._neuronLeaderboard || {};
          // Collapse to canonical identity before rendering: every donor sharing a
          // name folds into ONE row (id = name:<lower>, neurons summed) so 4 people
          // typing "Bob" show as a single "Bob"; unnamed donors stay per-device anon
          // rows keyed by donorId. Defends the public output even if in-memory state
          // still holds pre-fix duplicate rows (a row's own donorId is the lookup id
          // a client uses for its "(you)" highlight, so anon rows keep it).
          const merged = new Map();
          for (const [id, e] of Object.entries(lb)) {
            if (!e || typeof e !== 'object') continue;
            const name = e.name || null;
            const key = name ? ('name:' + String(name).toLowerCase()) : id;
            const cur = merged.get(key) || { id: key, name, neurons: 0, lastSeen: 0 };
            cur.neurons += e.neurons || 0;
            cur.lastSeen = Math.max(cur.lastSeen, e.lastSeen || 0);
            if (name && !cur.name) cur.name = name;
            merged.set(key, cur);
          }
          const rows = Array.from(merged.values());
          rows.sort((a, b) => b.neurons - a.neurons);
          const total = rows.reduce((s, r) => s + r.neurons, 0);
          return { top: rows.slice(0, 20), totalContributors: rows.length, totalNeurons: total };
        } catch (err) { return { top: [], totalContributors: 0, totalNeurons: 0, error: err.message }; }
      })(),
      // BC.12 — basin-collapse telemetry. Surfaces the signals behind the
      // single-token mode-collapse so recovery is visible without hand-
      // diffing /ws polls: sem→motor saturation, dominant-token share of
      // recent emissions, GW broadcast diversity. Computed once per state
      // broadcast (not per tick) so the checkSemMotorHealth sample is cheap.
      basinHealth: (() => {
        try {
          const cc = this.cortexCluster;
          if (!cc) return null;
          const out = { saturated: null, semMotorMeanCos: null, semMotorRatio: null, dominantToken: null, dominantShare: null, gwUniqueRatio: null };
          if (typeof cc.checkSemMotorHealth === 'function') {
            const h = cc.checkSemMotorHealth();
            out.saturated = !!h.saturated;
            out.semMotorMeanCos = (typeof h.meanCos === 'number') ? +h.meanCos.toFixed(3) : null;
            out.semMotorRatio = (typeof h.ratio === 'number') ? +h.ratio.toFixed(2) : null;
          }
          if (Array.isArray(cc._metaRegister) && cc._metaRegister.length > 0) {
            const counts = new Map();
            for (const e of cc._metaRegister) { if (e && e.word) counts.set(e.word, (counts.get(e.word) || 0) + 1); }
            let topW = null, topN = 0;
            for (const [w, n] of counts) { if (n > topN) { topN = n; topW = w; } }
            out.dominantToken = topW;
            out.dominantShare = +(topN / cc._metaRegister.length).toFixed(2);
          }
          const gw = cc._globalWorkspace || this._globalWorkspace || (this.brain && this.brain._globalWorkspace);
          if (gw && typeof gw.getHistory === 'function') {
            const hist = gw.getHistory();
            if (Array.isArray(hist) && hist.length > 0) {
              const labels = new Set(hist.map(h => h && h.label));
              out.gwUniqueRatio = +(labels.size / hist.length).toFixed(2);
            }
          }
          return out;
        } catch (err) { return { error: err.message }; }
      })(),
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
      // PR.1-PR.4 — application profiling block. Hardware + network + throughput
      // (the brain's system-resource usage) AND per-client connection health
      // (client↔brain). Bounded payload: aggregates + a capped client list.
      profiling: this._getProfilingState(),
    };
  },

  /**
   * PR.1-PR.4 — assemble the admin Profiling payload. Four sub-blocks:
   *   host       — system hardware: load average, CPU cores, system RAM.
   *   process    — this Node process: RSS / V8 heap / external / heap-limit,
   *                CPU%, resourceUsage (maxRSS, ctx switches, fs I/O), uptime.
   *   throughput — how fast the brain is going: step time + steps/sec, event-
   *                loop lag + histogram percentiles, GPU dispatch rate, spike
   *                rate, defs/hr, chat-Hebbian rate.
   *   network    — WS byte totals + live rates (from cumulative counters), msg
   *                counts, backpressure (reuses wsPressure), donor aggregate.
   *   clients    — per-connection health (type/name/uptime/RTT/bytes/buffered),
   *                capped at 24 + aggregates, so client→brain issues are visible.
   * All reads are defensive — any missing source degrades to null/0, never throws.
   */
  _getProfilingState() {
    const now = Date.now();
    const MB = 1024 * 1024;
    const r1 = (n) => Math.round(n);
    const r2 = (n) => Math.round(n * 100) / 100;
    const perf = this._perfStats || {};
    const out = { collectedAt: now, host: null, process: null, throughput: null, network: null, clients: null };

    // ── host (system hardware) ──
    try {
      const la = (typeof os.loadavg === 'function') ? os.loadavg() : [0, 0, 0];
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const cpus = (typeof os.cpus === 'function' ? os.cpus() : []) || [];
      out.host = {
        loadAvg: la.map(r2),
        cpuCount: cpus.length || perf.cores || 0,
        cpuModel: (cpus[0] && cpus[0].model) ? cpus[0].model.trim() : 'unknown',
        sysMemTotalMB: r1(totalMem / MB),
        sysMemUsedMB: r1((totalMem - freeMem) / MB),
        sysMemUsedPct: totalMem > 0 ? r1(((totalMem - freeMem) / totalMem) * 100) : 0,
        osUptimeS: (typeof os.uptime === 'function') ? r1(os.uptime()) : 0,
        platform: process.platform,
      };
    } catch (err) { out.host = { error: err.message }; }

    // ── process (this Node process) ──
    try {
      const mu = process.memoryUsage();
      let heapLimitMB = 0;
      if (_v8 && typeof _v8.getHeapStatistics === 'function') {
        try { heapLimitMB = r1((_v8.getHeapStatistics().heap_size_limit || 0) / MB); } catch { /* ignore */ }
      }
      let ru = null;
      try { ru = (typeof process.resourceUsage === 'function') ? process.resourceUsage() : null; } catch { ru = null; }
      out.process = {
        rssMB: r1(mu.rss / MB),
        heapUsedMB: r1(mu.heapUsed / MB),
        heapTotalMB: r1(mu.heapTotal / MB),
        externalMB: r1((mu.external || 0) / MB),
        arrayBuffersMB: r1((mu.arrayBuffers || 0) / MB),
        heapLimitMB,
        heapUsedPct: heapLimitMB > 0 ? r1((mu.heapUsed / MB / heapLimitMB) * 100) : 0,
        cpuPercent: r1(perf.cpuPercent || 0),
        uptimeS: r1(process.uptime()),
        maxRssMB: ru ? r1((ru.maxRSS || 0) / 1024) : 0, // maxRSS is KB on linux
        voluntaryCtxSwitches: ru ? (ru.voluntaryContextSwitches || 0) : 0,
        involuntaryCtxSwitches: ru ? (ru.involuntaryContextSwitches || 0) : 0,
        fsRead: ru ? (ru.fsRead || 0) : 0,
        fsWrite: ru ? (ru.fsWrite || 0) : 0,
      };
    } catch (err) { out.process = { error: err.message }; }

    // ── throughput (how fast the brain is going) ──
    try {
      // event-loop delay histogram (ns → ms)
      let elDelay = null;
      const h = this._eventLoopHistogram;
      if (h && typeof h.percentile === 'function') {
        const nsToMs = (v) => r2((v || 0) / 1e6);
        elDelay = { meanMs: nsToMs(h.mean), p50Ms: nsToMs(h.percentile(50)), p99Ms: nsToMs(h.percentile(99)), maxMs: nsToMs(h.max) };
      }
      // GPU dispatch rate from the rolling timestamp window
      let gpuDispatchPerSec = 0;
      const dts = this._gpuDispatchTimestamps;
      if (Array.isArray(dts) && dts.length >= 2) {
        const span = (dts[dts.length - 1] - dts[0]) / 1000;
        if (span > 0) gpuDispatchPerSec = r2(dts.length / span);
      }
      out.throughput = {
        stepTimeMs: r2(perf.stepTimeMs || 0),
        stepsPerSec: r2(perf.stepsPerSec || 0),
        eventLoopLagMs: this._lastEventLoopLagMs || 0,
        eventLoopDelay: elDelay,
        gpuDispatchPerSec,
        gpuHits: perf.gpuHits || 0,
        gpuMisses: perf.gpuMisses || 0,
        totalSpikes: this._lastTotalSpikes || perf.totalSpikes || 0,
        phaseTimingMs: perf.phaseTimingMs || null,
        defsLearnedPerHour: (this._defLearnedTimestamps && this._defLearnedTimestamps.length)
          ? this._defLearnedTimestamps.length : 0,
        chatHebbianTurns: (this._chatTimeHebbianStats && this._chatTimeHebbianStats.turns) || 0,
        frameCount: this.frameCount || 0,
      };
    } catch (err) { out.throughput = { error: err.message }; }

    // ── network (WS byte/message totals + live rates + backpressure) ──
    try {
      const bytesInEver = this._netBytesInEver || 0;
      const bytesOutEver = this._netBytesOutEver || 0;
      if (!this._netRateBuffer) this._netRateBuffer = [];
      const nb = this._netRateBuffer;
      nb.push({ ts: now, in: bytesInEver, out: bytesOutEver });
      while (nb.length > 60) nb.shift();
      let bytesInPerSec = 0, bytesOutPerSec = 0;
      if (nb.length >= 2) {
        const o = nb[0]; const dt = (now - o.ts) / 1000;
        if (dt > 0) { bytesInPerSec = Math.max(0, r1((bytesInEver - o.in) / dt)); bytesOutPerSec = Math.max(0, r1((bytesOutEver - o.out) / dt)); }
      }
      let msgIn = 0, msgOut = 0;
      if (this.clients) for (const [, c] of this.clients) { msgIn += c.msgIn || 0; msgOut += c.msgOut || 0; }
      const pool = perf.gpuPool || {};
      out.network = {
        bytesInTotalMB: r2(bytesInEver / MB),
        bytesOutTotalMB: r2(bytesOutEver / MB),
        bytesInPerSecKB: r2(bytesInPerSec / 1024),
        bytesOutPerSecKB: r2(bytesOutPerSec / 1024),
        msgInTotal: msgIn,
        msgOutTotal: msgOut,
        wsPressure: (typeof this._getWsPressureState === 'function') ? this._getWsPressureState() : null,
        donorCount: pool.donorCount || 0,
        donorTotalVramMB: pool.totalVramMB || 0,
        aggGneuronsPerSec: r2(pool.aggGneuronsPerSec || 0),
      };
    } catch (err) { out.network = { error: err.message }; }

    // ── clients (per-connection health — client↔brain) ──
    try {
      const list = [];
      let admins = 0, viewers = 0, donors = 0, totalBytesIn = 0, totalBytesOut = 0, rttSum = 0, rttN = 0, maxBuffered = 0;
      if (this.clients) {
        for (const [ws, c] of this.clients) {
          const isGPU = !!c.isGPU;
          const type = isGPU ? 'donor' : (c.mode === 'admin' ? 'admin' : 'viewer');
          if (type === 'admin') admins++; else if (type === 'donor') donors++; else viewers++;
          totalBytesIn += c.bytesIn || 0; totalBytesOut += c.bytesOut || 0;
          if (typeof c.rttMs === 'number') { rttSum += c.rttMs; rttN++; }
          const buffered = (ws && typeof ws.bufferedAmount === 'number') ? ws.bufferedAmount : 0;
          if (buffered > maxBuffered) maxBuffered = buffered;
          const tele = c.telemetry || null;
          list.push({
            id: c.id,
            type,
            name: c.name || c.donorName || c.ualUser || null,
            ip: c.ip || '?',
            uptimeS: r1((now - (c.connectedAt || now)) / 1000),
            lastSeenS: r1((now - (c.lastSeen || now)) / 1000),
            rttMs: (typeof c.rttMs === 'number') ? c.rttMs : null,
            bytesInMB: r2((c.bytesIn || 0) / MB),
            bytesOutMB: r2((c.bytesOut || 0) / MB),
            msgIn: c.msgIn || 0,
            msgOut: c.msgOut || 0,
            bufferedKB: r1(buffered / 1024),
            gpuName: isGPU ? (c.gpuName || (tele && tele.gpuName) || null) : null,
            gneuronsPerSec: (isGPU && tele) ? r2(tele.gneuronsPerSec || 0) : null,
            // F9 — WebGPU storage-binding cap + capability flag, so the dashboard can
            // show "GPU buffer too small for cortex matrix" instead of a mystery 0 Gn/s.
            maxBindMB: isGPU ? (Number(c.maxBindMB || (tele && tele.maxBindMB)) || null) : null,
            bindIncapable: isGPU ? !!c._bindIncapable : false,
            // health flag — RED only on a REAL per-client problem: genuinely stale
            // (90s+ silent), backed-up (>50 MB unsent), or high RTT that is NOT just the
            // server's own event-loop lag. RTT is measured off the heartbeat ping/pong, so
            // a blocked event loop during a heavy teach phase delays EVERY client's pong by
            // seconds → inflates everyone's RTT for ~30s. That's a SERVER condition, not a
            // client/donor fault, so high RTT only flags a client when the loop is healthy.
            // (Threshold 1s→2.5s so a normal blip never trips it.) Was false-flagging the
            // admin + donors red during teach.
            // Backpressure red at 300 MB (60% of the 500 MB drop threshold) — NOT 50 MB.
            // A high-latency / high-bandwidth-delay link (Starlink: satellite RTT + jitter +
            // bufferbloat + ~15s handover stalls) legitimately holds 10s-100s of MB in the
            // server's send buffer to that donor — that's the link draining, not a fault.
            // Only red when it climbs toward the point where frames start getting DROPPED
            // (500 MB → GPU-shadow divergence). Below that it's all still delivered, just queued.
            unhealthy: ((now - (c.lastSeen || now)) > 90000)
              || (typeof c.rttMs === 'number' && c.rttMs > 2500 && (this._lastEventLoopLagMs || 0) < 1000)
              || (buffered > 300 * MB),
          });
        }
      }
      // sort unhealthy first, then by bytes (busiest), so the admin sees problems up top
      list.sort((a, b) => (b.unhealthy - a.unhealthy) || ((b.bytesInMB + b.bytesOutMB) - (a.bytesInMB + a.bytesOutMB)));
      const CAP = 24;
      out.clients = {
        total: list.length,
        admins, viewers, donors,
        totalConnectionsEver: this._totalConnectionsEver || 0,
        totalBytesInMB: r2(totalBytesIn / MB),
        totalBytesOutMB: r2(totalBytesOut / MB),
        avgRttMs: rttN > 0 ? r1(rttSum / rttN) : null,
        maxBufferedKB: r1(maxBuffered / 1024),
        unhealthyCount: list.filter(c => c.unhealthy).length,
        shown: Math.min(list.length, CAP),
        list: list.slice(0, CAP),
      };
    } catch (err) { out.clients = { error: err.message }; }

    // F9 — cortex GPU-upload status. When initGpu() failed to bind the cross-projection
    // matrices on the donor (e.g. a too-small WebGPU storage-binding cap), surface the
    // honest reason so the dashboard shows "GPU buffer too small for cortex matrix"
    // instead of leaving the operator to infer it from a 0-Gn/s / high-RTT row.
    try {
      const f = this._cortexUploadFailure;
      out.cortexUpload = f
        ? { failed: true, looksLikeBindingLimit: !!f.looksLikeBindingLimit, reason: String(f.reason || '').slice(0, 200), ageMs: Math.max(0, now - (f.ts || now)) }
        : { failed: false };
    } catch { out.cortexUpload = { failed: false }; }

    return out;
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
    // the operator can verify during K curriculum walk which specific region
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

  /**
   *  Phase 6 — Bounded state snapshot for dashboard display.
   * All values are aggregates / counts / capped-list. NO unbounded
   * enumeration. Caller broadcasts this in state.consciousness for dashboard
   * panels M.21/M.22/M.23/M.24 to render.
   *
   * Surfaces: dictionary API smoke test result + cache stats + K-vocab
   * coverage, K-wiring assertion, cortical microstructure (columns +
   * layer histogram + hub count + theta phase + gamma scale + Φ proxy),
   * GlobalWorkspace ignition snapshot (Baars 1988 GWT broadcast loop),
   * predictive-coding error state with 32-sample history (Friston 2010
   * free-energy principle), defs-learned-per-hour rolling rate.
   */

  /**
   * Collects the Full-Mind K Gate state from `curriculum._gateHistory`
   * for the state-broadcast envelope. The gate is the pass-instrument
   * for K closure per docs/TODO-full-syllabus.md §T16.5.b lines 1311-
   * 1389. Reads the `fullMindK` bucket of the gate history Map (probe
   * results keyed by probe ID + an `AGGREGATE` entry written by
   * `_aggregateFullMindK()` on each full run). Returns a flat
   * serializable object; `null` until the first probe lands.
   *
   * Shape:
   *   {
   *     byProbe: { 'RF-1': {score, thresholdHit, ts}, ... },
   *     aggregate: { pass, overallScore, substratePass, ... } | null,
   *     hasRun: bool,
   *   }
   */
  _collectFullMindKState() {
    const curriculum = this.curriculum;
    if (!curriculum || !curriculum._gateHistory) return null;
    const bucket = curriculum._gateHistory.get
      ? curriculum._gateHistory.get('fullMindK')
      : null;
    if (!bucket || typeof bucket.get !== 'function') return null;
    const byProbe = {};
    let aggregate = null;
    for (const [key, value] of bucket.entries()) {
      if (key === 'AGGREGATE') {
        aggregate = value && typeof value === 'object' ? { ...value } : null;
        continue;
      }
      byProbe[key] = value && typeof value === 'object'
        ? { score: value.score, thresholdHit: value.thresholdHit, ts: value.ts }
        : null;
    }
    const hasRun = Object.keys(byProbe).length > 0 || aggregate !== null;
    return { byProbe, aggregate, hasRun };
  },

  _getConsciousnessState() {
    const cortex = this.cortexCluster;
    const cacheStats = (cortex && typeof cortex.getDefinitionCacheStats === 'function')
      ? cortex.getDefinitionCacheStats() : null;

    // Diagnostic — one-shot log of consciousness-state inputs on first
    // call so operator can see WHY dashboard panels show zero. Per
    // 2026-06-17 live test: dashboard renders columns/L1-L6/hubs as 0
    // despite boot log claiming "lamination L1=19164" etc. This log
    // dumps the actual cortex state at first broadcast. Fires once
    // per process lifetime then self-disables.
    if (!this._consciousnessStateDiagLogged) {
      this._consciousnessStateDiagLogged = true;
      try {
        const cortexExists = !!cortex;
        const cortexName = cortex ? cortex.name : '(no cortex)';
        const cortexSize = cortex ? cortex.size : 0;
        const layerIdLen = (cortex && cortex.layerId) ? cortex.layerId.length : 'MISSING';
        const hubMaskLen = (cortex && cortex.hubMask) ? cortex.hubMask.length : 'MISSING';
        const numCols = (cortex && cortex.numColumns) || 'MISSING';
        const layerIdSample = (cortex && cortex.layerId) ? Array.from(cortex.layerId.slice(0, 20)) : 'MISSING';
        const hubMaskFirst20 = (cortex && cortex.hubMask) ? Array.from(cortex.hubMask.slice(0, 20)) : 'MISSING';
        const getDefStatsType = (cortex && typeof cortex.getDefinitionCacheStats === 'function') ? 'function' : 'MISSING';
        const cacheStatsJson = cacheStats ? JSON.stringify(cacheStats).slice(0, 200) : 'null';
        console.log(`[Brain] [DASHBOARD-DIAG] first _getConsciousnessState() call — cortex=${cortexExists} name=${cortexName} size=${cortexSize} layerId.length=${layerIdLen} hubMask.length=${hubMaskLen} numColumns=${numCols} getDefCacheStats=${getDefStatsType}`);
        console.log(`[Brain] [DASHBOARD-DIAG]   layerId[0..19]=${JSON.stringify(layerIdSample)}`);
        console.log(`[Brain] [DASHBOARD-DIAG]   hubMask[0..19]=${JSON.stringify(hubMaskFirst20)}`);
        console.log(`[Brain] [DASHBOARD-DIAG]   cacheStats=${cacheStatsJson}`);
        console.log(`[Brain] [DASHBOARD-DIAG]   _definitionTaughtWords.size=${(cortex && cortex._definitionTaughtWords) ? cortex._definitionTaughtWords.size : 'MISSING'}`);
        console.log(`[Brain] [DASHBOARD-DIAG]   _kVocabPrefetched=${cortex ? cortex._kVocabPrefetched : 'MISSING'}`);
        console.log(`[Brain] [DASHBOARD-DIAG]   thetaPeriod=${(cortex && cortex.thetaPeriod) || 'MISSING'}`);
        console.log(`[Brain] [DASHBOARD-DIAG]   _gammaLrScale=${(cortex && cortex._gammaLrScale) || 'MISSING'}`);
      } catch (err) {
        console.log(`[Brain] [DASHBOARD-DIAG] threw: ${err.message}`);
      }
    }
    // K-wiring assertion result (re-run to get fresh status).
    let kwiring = null;
    try {
      if (cortex && typeof cortex.assertKWiring === 'function') {
        // Cache result on cortex to avoid recomputing every dashboard tick
        if (!cortex._kWiringCache || (Date.now() - cortex._kWiringCache.ts) > 30000) {
          cortex._kWiringCache = { ...cortex.assertKWiring(), ts: Date.now() };
        }
        kwiring = cortex._kWiringCache;
      }
    } catch { kwiring = null; }
    // Layer histogram (small fixed-size array; aggregates only).
    let layerCounts = [0, 0, 0, 0, 0];
    if (cortex && cortex.layerId) {
      for (let i = 0; i < cortex.layerId.length; i++) {
        const l = cortex.layerId[i];
        if (l < layerCounts.length) layerCounts[l] += 1;
      }
    }
    // Hub count (single number).
    let hubCount = 0;
    if (cortex && cortex.hubMask) {
      for (let i = 0; i < cortex.hubMask.length; i++) {
        if (cortex.hubMask[i]) hubCount += 1;
      }
    }
    // K-vocab definition-taught count (single number).
    const kvocabTaught = cortex && cortex._definitionTaughtWords
      ? cortex._definitionTaughtWords.size : 0;
    // Theta phase (single scalar in [0, 1]).
    const tickCounter = (cortex && cortex._tickCounter) || 0;
    const thetaPeriod = (cortex && cortex.thetaPeriod) || 167;
    const thetaPhase = (tickCounter % thetaPeriod) / thetaPeriod;
    return {
      // M.21 dictionary API
      // Boolean result of the boot dictionary smoke test. true = PASS,
      // false = FAIL, null = pending (not yet fired). Dashboard reads
      // === true / === false to color the API SMOKE TEST status panel.
      smokeTestPassed: typeof this._dictionarySmokeTestResult === 'boolean' ? this._dictionarySmokeTestResult : null,
      cache: cacheStats,
      kVocabPrefetched: cortex ? !!cortex._kVocabPrefetched : false,
      kVocabTotal: 2247, // matches K_VOCABULARY size
      kVocabTaught: kvocabTaught,
      // M.22 K-wiring assertion
      kwiring: kwiring ? { ok: kwiring.ok, gaps: (kwiring.gaps || []).slice(0, 5) } : null,
      // M.23 cortical microstructure
      numColumns: cortex ? cortex.numColumns || 0 : 0,
      columnSize: cortex ? cortex.columnSize || 0 : 0,
      layerCounts,
      hubCount,
      hubFraction: cortex && cortex.size ? (hubCount / cortex.size) : 0,
      thetaPhase,
      gammaScale: cortex ? (cortex._gammaLrScale || 1) : 1,
      phiProxy: this.phiProxy || 0,
      // GlobalWorkspace ignition snapshot (O.15) — current broadcast
      // label/value, ignition rate (broadcasts per tick), recent
      // history capped 8 most-recent entries. Surfaces whether GW
      // is actually firing or sitting subthreshold.
      workspace: this.globalWorkspace && typeof this.globalWorkspace.getStats === 'function'
        ? (() => {
            try {
              const s = this.globalWorkspace.getStats();
              const hist = Array.isArray(s.recentBroadcasts)
                ? s.recentBroadcasts.slice(-8)
                : (Array.isArray(this.globalWorkspace._ignitionHistory)
                    ? this.globalWorkspace._ignitionHistory.slice(-8) : []);
              return {
                currentLabel: s.currentBroadcast?.label || null,
                currentValue: s.currentBroadcast?.value || 0,
                ignitionRate: s.ignitionRate || 0,
                ignitions: s.ignitions || 0,
                ticksTotal: s.ticksTotal || 0,
                history: hist.map(h => ({
                  label: h.label || '',
                  value: typeof h.value === 'number' ? h.value : 0,
                })),
              };
            } catch { return null; }
          })()
        : null,
      // Predictive coding error state (O.16). lastError is the current
      // mean-abs spike error; history is the 32-sample ring buffer
      // already maintained by cluster.step() — exposed straight to
      // the dashboard for the sparkline trend.
      predictionError: cortex
        ? {
            last: cortex._lastPredictionError || 0,
            history: Array.isArray(cortex._predictionErrorHistory)
              ? cortex._predictionErrorHistory.slice(-32) : [],
          }
        : null,
      // Definition learning rate (O.18) — words/hour rolling rate
      // from the timestamps ring buffer populated by
      // _teachWordDefinition. Reads oldest + newest within the buffer
      // window to avoid edge bias.
      defsLearnedPerHour: (() => {
        // 114.19ek P4 #16 — rolling 1hr window. Earlier formula
        // read oldest + newest of the 256-cap ring buffer, which
        // inflated catastrophically during the upfront K-vocab
        // multi-def seed (256 timestamps inside a 2-min window
        // would report ~7680 defs/hour). Clamp to timestamps within
        // the last 3,600,000 ms so the dashboard reflects steady-
        // state learning rate, not seed-burst peaks.
        const ts = cortex && cortex._defLearnedTimestamps;
        if (!Array.isArray(ts) || ts.length < 2) return 0;
        const now = Date.now();
        const cutoff = now - 3_600_000;
        let firstIdx = ts.length - 1;
        for (let i = 0; i < ts.length; i++) {
          if (ts[i] >= cutoff) { firstIdx = i; break; }
        }
        const recent = ts.length - firstIdx;
        if (recent < 2) return 0;
        const newest = ts[ts.length - 1];
        const oldest = ts[firstIdx];
        const dt = (newest - oldest) / 1000;
        if (dt <= 0) return 0;
        return (recent / dt) * 3600;
      })(),
      // M.24 _definitionTaughtWords counter (already in kVocabTaught above).
    };
  },

  /**
   * Bounded WS backpressure snapshot for the dashboard pressure panel.
   * Reads counters maintained by `_sparseSendBinary` (drops after
   * safety-timeout, successful drain absorbs, OS ENOBUFS bursts) plus
   * live `_gpuClient.bufferedAmount` and a rolling drops/sec rate.
   *
   * Drops/sec is computed from a 60-sample ring buffer of (ts, drops)
   * snapshots — current minus oldest divided by elapsed seconds. Cap
   * the buffer to keep memory bounded across long brain runs.
   */
  _getWsPressureState() {
    const now = Date.now();
    const ws = this._gpuClient;
    const bufferedAmount = (ws && typeof ws.bufferedAmount === 'number') ? ws.bufferedAmount : 0;
    const drops = this._wsDroppedCount || 0;
    const absorbs = this._wsAbsorbedCount || 0;
    const enobufs = this._wsEnobufsCount || 0;
    if (!this._wsRateBuffer) this._wsRateBuffer = [];
    const buf = this._wsRateBuffer;
    buf.push({ ts: now, drops });
    while (buf.length > 60) buf.shift();
    let dropRatePerSec = 0;
    if (buf.length >= 2) {
      const oldest = buf[0];
      const dt = (now - oldest.ts) / 1000;
      if (dt > 0) dropRatePerSec = Math.max(0, (drops - oldest.drops) / dt);
    }
    return {
      bufferedAmount,
      bufferedAmountMB: bufferedAmount / (1024 * 1024),
      // Source-of-truth: BUFFERED_AMOUNT_DROP_THRESHOLD inside
      // _sparseSendBinary. Mirrored here so the dashboard can render
      // the threshold line on the buffer-amount bar.
      thresholdMB: 500,
      drops,
      absorbs,
      enobufs,
      dropRatePerSec,
      wsConnected: !!(ws && ws.readyState === 1),
      // GPU shadow dirty flag. Set when a drop-after-timeout fires;
      // means CPU and GPU weights have diverged on at least one
      // projection. Surfaces to dashboard so the operator sees the
      // divergence + can restart to clear (full automatic resync is
      // a follow-up iter — too large for this pass). Last drop
      // timestamp lets dashboard render "12s ago" / "no drops since
      // boot" without each panel computing its own.
      gpuShadowDirty: !!this._gpuShadowDirty,
      lastDropTs: this._wsLastDropTs || 0,
    };
  },
};

module.exports = { SERVER_STATE_MIXIN };
