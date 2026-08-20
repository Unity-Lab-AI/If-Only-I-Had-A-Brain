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

  // UTILIZATION instrumentation (operator ask: is the ~1.5%/tick firing
  // healthy sparse coding or dead volume?). Two server-honest measures with
  // NO donor changes: (1) LIFETIME UNIQUE-FIRED coverage over the CPU-owned
  // language cortex (lastSpikes OR'd into a persistent bitset — at
  // biological scale the GPU owns main-brain spikes as counts only, so
  // main-brain bitsets await a donor-side follow-up); (2) WEIGHT-MASS
  // RECRUITMENT over the authoritative CPU CSR master — fraction of
  // post-neuron rows carrying any synapse mass, per tracked projection
  // (covers the cortex bands server-side). Per-tick spikeRate answers
  // "how sparse right now"; these answer "does the volume EVER participate".
  _updateLangEverFired() {
    const c = this.cortexCluster;
    const ls = c && c.lastSpikes;
    if (!ls || !ls.length) return;
    const now = Date.now();
    if (this._lcEverFiredAt && (now - this._lcEverFiredAt) < 5000) return;
    this._lcEverFiredAt = now;
    if (!this._lcEverFired || this._lcEverFired.length !== ls.length) {
      this._lcEverFired = new Uint8Array(ls.length);
      this._lcEverFiredCount = 0;
      this._lcEverFiredSince = now;
    }
    const ef = this._lcEverFired;
    let added = 0;
    for (let i = 0; i < ls.length; i++) {
      if (ls[i] && !ef[i]) { ef[i] = 1; added++; }
    }
    this._lcEverFiredCount = (this._lcEverFiredCount || 0) + added;
  },

  _getUtilizationState() {
    try {
      const out = { langEverFired: null, weightRecruitment: null };
      const c = this.cortexCluster;
      const now = Date.now();
      if (this._lcEverFired && c && c.regions) {
        // 12M BROADCAST STALL FIX (2026-08-16, Gee: "1/5 the time its fucking
        // stalled") — this per-region bitset walk is O(cortex × region overlap)
        // ≈ ~14M byte-reads at the 12M cortex (regions + sem/word_motor
        // sub-bands re-walk their parents' spans), and it ran UNTHROTTLED on
        // every getState() — which the broadcast loop calls at 10fps. ~50ms ×
        // 10/s ≈ 500ms of loop block per second = the metronome "BLOCKED
        // ~520ms" lines at ~25% loop occupancy, invisible at 1.5M (walk ~6ms)
        // and exposed by the 8× growth. The bitset SOURCE only advances every
        // 5s (_updateLangEverFired's throttle), so recomputing the breakdown
        // faster than that measured nothing new. Cache the regions walk on the
        // same 5s cadence; total/pct stay live O(1) off the maintained counter.
        if (!this._lueRegions || !this._lueRegionsAt || (now - this._lueRegionsAt) >= 5000) {
          this._lueRegionsAt = now;
          const regions = {};
          for (const [rn, r] of Object.entries(c.regions)) {
            let n = 0;
            for (let i = r.start; i < r.end && i < this._lcEverFired.length; i++) n += this._lcEverFired[i];
            regions[rn] = { size: r.end - r.start, everFired: n, pct: +((n / Math.max(1, r.end - r.start)) * 100).toFixed(2) };
          }
          this._lueRegions = regions;
        }
        out.langEverFired = {
          total: this._lcEverFiredCount || 0,
          size: this._lcEverFired.length,
          pct: +(((this._lcEverFiredCount || 0) / Math.max(1, this._lcEverFired.length)) * 100).toFixed(2),
          sinceMs: this._lcEverFiredSince || null,
          regions: this._lueRegions,
        };
      }
      // Throttled CSR row-recruitment scan (rowPtr diff — O(rows)/matrix,
      // every 5min). Registry entries whose CSR was freed post-upload skip.
      if (!this._wrAt || (now - this._wrAt) > 300000) {
        this._wrAt = now;
        const reg = this._replicaMatrixRegistry;
        const byMatrix = {};
        if (reg && reg.size) {
          for (const [name, e] of reg) {
            const m = e && e.matrix;
            const rp = m && m.rowPtr;
            if (!rp || rp.length < 2) continue;
            let rec = 0;
            for (let i = 0; i + 1 < rp.length; i++) if (rp[i + 1] > rp[i]) rec++;
            byMatrix[name] = { rows: rp.length - 1, recruitedRows: rec, pct: +(((rec) / Math.max(1, rp.length - 1)) * 100).toFixed(2) };
          }
        }
        this._weightRecruitment = { at: now, matrices: byMatrix };
      }
      out.weightRecruitment = this._weightRecruitment || null;
      // ACT.2 — VERDICT: design sparsity vs dead mass. ACT.1 (above) MEASURES —
      // langEverFired coverage on the dense language cortex + per-matrix weight
      // recruitment (rowPtr diff = rows that ever received a Hebbian update, the
      // CPU-authoritative dead-mass signal that needs NO GPU readback). ACT.2
      // turns that raw data into an explicit verdict OVER A TRAINING WINDOW so the
      // operator gets an ANSWER, not just numbers. A small ring samples on the
      // recruitment cadence (5min) and tracks the coverage trend: climbing/high =
      // healthy sparse coding (neurons ARE working); flat-and-low recruitment =
      // suspected dead mass → hands the specific offender to ACT.3.
      try {
        const langPct = out.langEverFired ? out.langEverFired.pct : null;
        let recruitPct = null;
        if (out.weightRecruitment && out.weightRecruitment.matrices) {
          const ms = Object.values(out.weightRecruitment.matrices);
          if (ms.length) recruitPct = +(ms.reduce((a, m) => a + (m.pct || 0), 0) / ms.length).toFixed(2);
        }
        if (!this._utilHistory) this._utilHistory = [];
        const lastSample = this._utilHistory[this._utilHistory.length - 1];
        if (!lastSample || (now - lastSample.ts) > 300000) {
          this._utilHistory.push({ ts: now, langPct, recruitPct });
          while (this._utilHistory.length > 16) this._utilHistory.shift();
        }
        const first = this._utilHistory[0];
        const last = this._utilHistory[this._utilHistory.length - 1];
        const coverageTrend = (first && last && first.langPct != null && last.langPct != null)
          ? +(last.langPct - first.langPct).toFixed(2) : 0;
        let status = 'measuring';
        let reason = 'collecting samples over the training window';
        if (this._utilHistory.length >= 2) {
          const hiCoverage = (langPct ?? 0) >= 50 || (recruitPct ?? 0) >= 50;
          const growing = coverageTrend > 0.5;
          const stuckLow = (recruitPct ?? 0) < 10 && coverageTrend <= 0.1;
          if (hiCoverage || growing) {
            status = 'healthy';
            reason = growing
              ? `coverage climbing +${coverageTrend}% over ${this._utilHistory.length} samples — sparse coding is recruiting, not dead mass`
              : `high coverage (lang ${langPct}% / recruit ${recruitPct}%) — neurons are working (design sparsity)`;
          } else if (stuckLow) {
            status = 'review';
            reason = `recruitment stuck ${recruitPct}% + coverage flat (${coverageTrend}%) over the window — possible dead mass; investigate injection spread / fanout (ACT.3)`;
          } else {
            status = 'nominal';
            reason = `coverage lang ${langPct}% / recruit ${recruitPct}%, trend ${coverageTrend >= 0 ? '+' : ''}${coverageTrend}% — within normal sparse-coding range`;
          }
        }
        out.verdict = { status, reason, langPct, recruitPct, coverageTrend, samples: this._utilHistory.length };
      } catch { out.verdict = null; }
      return out;
    } catch {
      return { langEverFired: null, weightRecruitment: null };
    }
  },

  getState() {
    // SECTION LAP TIMERS (2026-08-17). bcast.getStateMs measured this build
    // at 312→262ms/call even after the region-walk + memoryStats caches —
    // the remainder resisted read-based bisection TWICE, so every section
    // is now timed (cumulative ms per named section, published under
    // wsPressure.bcast.sections) and the burner is named by a field read,
    // never re-theorized. The lap helper costs one Date.now() pair per
    // section per call.
    const _gsAcc = this._gsSections || (this._gsSections = {});
    const _lap = (name, fn) => {
      const _t0 = Date.now();
      try { return fn(); } finally { _gsAcc[name] = (_gsAcc[name] || 0) + (Date.now() - _t0); }
    };
    _lap('everFired', () => this._updateLangEverFired());
    const clusterStates = {};
    const _gsClustersT0 = Date.now();
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
      // CPU-FALLBACK WALK CACHED 5s (2026-08-17). Native donors never send
      // per-region spike counts, so gpuFresh is false for the whole walk at
      // biological scale and this fallback walked ~14M+ cells across every
      // region + sub-band span ON EVERY getState — the largest measured
      // share of bcast.getStateMs 312ms/call (~36% of wall at the ~1/s
      // broadcast cadence), and the backlog that taxed every teach-chain
      // yield. lastSpikes only changes on teach pattern writes; a 5s-fresh
      // count is indistinguishable on the 3D brain's sub-volume shading.
      // Same cadence-of-the-source law as the langEverFired regions cache.
      let cpuCounts = null;
      if (!gpuFresh && ls) {
        const _lrNow = Date.now();
        if (!this._langRegionCountsAt || (_lrNow - this._langRegionCountsAt) >= 5000) {
          this._langRegionCountsAt = _lrNow;
          const counts = {};
          for (const [regName, region] of Object.entries(this.cortexCluster.regions)) {
            let n = 0;
            for (let i = region.start; i < region.end && i < ls.length; i++) {
              if (ls[i]) n++;
            }
            counts[regName] = n;
          }
          this._langRegionCounts = counts;
        }
        cpuCounts = this._langRegionCounts || null;
      }
      for (const [regName, region] of Object.entries(this.cortexCluster.regions)) {
        const size = region.end - region.start;
        let spikeCount = 0;
        if (gpuFresh && typeof gpuRS[regName] === 'number') {
          spikeCount = gpuRS[regName] | 0;
        } else if (cpuCounts && typeof cpuCounts[regName] === 'number') {
          spikeCount = cpuCounts[regName] | 0;
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

    _gsAcc.clusters = (_gsAcc.clusters || 0) + (Date.now() - _gsClustersT0);

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
      // Deploy identity — proves WHICH code the running boot is actually
      // executing (the "did the deploy even land?" signal). Populated once at
      // boot from server/deployed-build.json (written by deploy/self-update.sh
      // from the exact cloned tree), or git rev-parse on a dev box, or
      // version.js FULL as last resort. Surfaces on /public-state.json + the
      // dashboard header so a glance / one curl tells you what's live.
      build: this._deployBuild || null,
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
      // CANSPEAK.4 — `canSpeak` IS GONE AND IT IS NOT COMING BACK. It was
      // `_computeMinGrade() !== 'pre-K'` — pure grade arithmetic over the
      // per-subject map — and the comment that used to sit here claimed it
      // "is true once the motor region has been trained", which no line of
      // code ever supported. It was read as a muteness flag and reported as
      // one for hours while she was talking on the brain page. The value is
      // kept under the name of the thing it actually computes; the question
      // it was mistaken for is answered by `voice` below, off real evidence.
      grades: this.cortexCluster?.grades ? { ...this.cortexCluster.grades } : null,
      minGrade: this._computeMinGrade(),
      minGradeCleared: this._computeMinGrade() !== 'pre-K',
      // OWNART OBSERVABILITY (2026-08-20) — the board must be able to answer "is she
      // drawing her OWN version, or rendering a reference?" without reading the
      // console. Counts of work that landed, never a flag saying the feature exists:
      // `drawn` only increments after a composition is published, `schemas` is how
      // many concepts she has abstracted a shape from (the thing that makes a drawing
      // hers), and `lastLabel` distinguishes `canvas:own:` from `canvas:draw:`. Every
      // read is defensive — a missing store degrades to 0, never throws.
      ownArt: (() => {
        let schemas = 0, seen = 0;
        try {
          const store = (typeof this._vmStore === 'function') ? this._vmStore() : null;
          if (store) {
            seen = store.size;
            for (const e of store.values()) if (e && e.schema && Array.isArray(e.schema.parts) && e.schema.parts.length) schemas++;
          }
        } catch { /* store unreadable — report zeros rather than throwing the state build */ }
        return {
          drawn: this._ownArtDrawn | 0,
          attempts: this._ownArtAttempt | 0,
          queued: Array.isArray(this._mindsEyePreviewQueue) ? this._mindsEyePreviewQueue.length : 0,
          dropped: this._mindsEyePreviewDropped | 0,
          previewsDrained: this._mindsEyePreviewsDrained | 0,
          schemas,                    // concepts whose SHAPE she has abstracted
          seenConcepts: seen,         // concepts she holds a field C for
          lastLabel: this._lastSketchLabel || null,
          style: (typeof process !== 'undefined' && process.env && process.env.DREAM_DRAW_STYLE) || 'own',
        };
      })(),
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
      // growth CACHED 5s (2026-08-17) — this block ran a sync SQLite
      // COUNT(*) + a full-conversations walk + an all-words key-array
      // build on EVERY getState; all three grow with her life. Same
      // human-cadence law as the memoryStats cache. uptime/frames stay
      // live (cheap scalars).
      growth: _lap('growth', () => {
        const _gNow = Date.now();
        if (!this._growthCache || (_gNow - (this._growthCacheAt || 0)) >= 5000) {
          this._growthCacheAt = _gNow;
          this._growthCache = {
            totalWords: Object.keys(this._wordFreq || {}).length,
            totalInteractions: Object.values(this._conversations || {}).reduce((s, c) => s + c.length, 0),
            totalEpisodes: this._db ? this.getEpisodeCount() : 0,
          };
        }
        return {
          ...this._growthCache,
          uptime: (Date.now() - (this._startedAt || Date.now())) / 1000,
          totalFrames: this.frameCount,
        };
      }),
      // iter15-mem — unified 5-tier memory snapshot for dashboard +
      // 3D brain memory tab. Tier 1 (Episodic SQLite) + Tier 2
      // (Schematic) + Tier 3 (Identity-bound) + ConsolidationEngine
      // + Working memory all in one payload. Operator verbatim:
      // "shall be one unified system of the brain for memory not
      // some side processes".
      memoryStats: _lap('memoryStats', () => this._getMemoryStats()),
      //Phase 6 — Display/Visibility snapshot for dashboard.
      // Bounded payload: aggregates only, no per-neuron / per-column
      // enumeration, no unbounded lists. Counts + small fixed-size
      // arrays only (gaps capped at 5, etc).
      consciousness: _lap('consciousness', () => this._getConsciousnessState()),
      // WS backpressure metrics for the GPU client. Reads
      // _gpuClient.bufferedAmount + drop/absorb/enobufs counters +
      // a rolling drops/sec rate so operator can see whether the
      // BLOCK-not-DROP path is keeping Hebbian updates intact.
      wsPressure: _lap('wsPressure', () => this._getWsPressureState()),
      utilization: _lap('utilization', () => this._getUtilizationState()),
      // CANSPEAK.8 — THE FIELDS THAT ACTUALLY ANSWER "CAN SHE SPEAK", in one
      // place, so no status line has to infer it from a grade gate again.
      // Placed AFTER `utilization` deliberately: the word_motor region counts
      // come off the bitset walk that lap refreshes, so reading them earlier
      // in this literal would serve a snapshot up to 5s older than the rest.
      //
      //   wordMotor*      the emission substrate. `everFired: 0` means not one
      //                   bucket has fired SINCE BOOT. It does NOT mean the
      //                   weights are gone — a since-boot counter is not a
      //                   capability, and reading it as one is what nearly
      //                   triggered an unnecessary fresh walk (WORDEMIT).
      //   matrixDrivenPct how much of her speech comes from her OWN trained
      //                   weights vs the dictionary-cosine oracle. Same
      //                   counters `curriculum.emissionSource` publishes, read
      //                   straight off the cluster so this block carries no
      //                   ordering dependency on the curriculum lap.
      //   emitRejection   WHY the last emission was refused AND HOW OLD that
      //                   sample is, because a 3-minute-stale rejection was
      //                   once quoted as live proof she was reaching for words.
      //
      // The verdict is derived from evidence that is PRESENT. It never reports
      // health from the absence of a recorded failure (the SYNCEMPTY lesson).
      voice: _lap('voice', () => {
        try {
          const cc = this.cortexCluster;
          const wm = (this._lueRegions && this._lueRegions.word_motor) || null;
          const oracleHits = (cc && cc._oracleHits) | 0;
          const matrixHits = (cc && cc._matrixHits) | 0;
          const emissions = oracleHits + matrixHits;
          const matrixDrivenPct = emissions > 0
            ? Math.round((matrixHits / emissions) * 100) : null;
          const rej = cc && cc._lastEmitRejection;
          const everFired = wm ? (wm.everFired | 0) : null;
          let status = 'unmeasured';
          let reason = 'nothing has attempted an emission since boot — this is'
            + ' NOT a claim that she cannot speak, only that no sample exists';
          if (emissions > 0) {
            if (everFired > 0 && matrixDrivenPct >= 50) {
              status = 'matrix-driven';
              reason = `${matrixDrivenPct}% of ${emissions} emissions came from`
                + ` her own trained weights; ${everFired} word_motor buckets`
                + ' have fired';
            } else if (everFired > 0) {
              status = 'oracle-carried';
              reason = `only ${matrixDrivenPct}% of ${emissions} emissions are`
                + ` matrix-driven — the dictionary oracle is doing most of the`
                + ` talking (${everFired} buckets have fired)`;
            } else {
              status = 'oracle-only';
              reason = `${emissions} emissions with ZERO word_motor buckets`
                + ' fired since boot — every word came from the oracle, not'
                + ' from the emission band';
            }
          }
          return {
            wordMotorSize: wm ? (wm.size | 0) : null,
            wordMotorEverFired: everFired,
            wordMotorPct: wm ? wm.pct : null,
            oracleHits,
            matrixHits,
            matrixDrivenPct,
            emitRejection: rej
              ? {
                  reason: rej.reason || 'unknown',
                  ageMs: Math.max(0, Date.now() - (rej.ts || Date.now())),
                }
              : null,
            verdict: { status, reason },
          };
        } catch (err) { return { error: err.message }; }
      }),
      // #112.9d — student-battery progress (i/N) so the dashboard shows the
      // K-STUDENT battery advancing (question i of N + label) instead of a
      // silent stall. Set per-question in _runStudentBattery (curriculum.js),
      // cleared to null on battery finish.
      batteryProgress: (this.cortexCluster && this.cortexCluster._batteryProgress) || null,
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
      brainEvents: _lap('brainEvents', () => this._recentBrainEvents()),
      // Current training-subject snapshot for the dashboard "Current
      // Training" card. Null fields when no cell is active. Sourced
      // from the curriculum's per-cell + per-subject counters so the
      // dashboard's subject/grade/progress display and the curriculum
      // teach path can never drift out of sync — ONE cortex, ONE
      // curriculum object, ONE dashboard read.
      curriculum: _lap('curriculum', () => (this.curriculum && typeof this.curriculum.getCurriculumStatus === 'function'
        ? this.curriculum.getCurriculumStatus()
        : null)),
      // Audit A.1 — P6.6 compositional-emergence telemetry surfaced.
      // Was previously write-only inside cluster/telemetry.js. Reports
      // verbatim/novel/partial classification rates + max-novelty
      // sample + firstNovelMsAfterBoot. Dashboard panel reads this.
      compositionalEmergence: _lap('compositional', () => ((this.cortexCluster && typeof this.cortexCluster.getCompositionalStats === 'function')
        ? (() => { try { return this.cortexCluster.getCompositionalStats(); } catch (err) { return { error: err.message }; } })()
        : null)),
      // Audit A.2 — P6.7 word-creation tip-of-tongue candidates. Top-10
      // by frequency, minCount=3. Dashboard renders a panel showing the
      // emergent compounds the rejection-loop is observing.
      wordCreationCandidates: _lap('wordCreation', () => ((this.cortexCluster && typeof this.cortexCluster.getWordCreationCandidates === 'function')
        ? (() => { try { return this.cortexCluster.getWordCreationCandidates({ limit: 10, minCount: 3 }); } catch (err) { return { error: err.message }; } })()
        : null)),
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
      leaderboard: _lap('leaderboard', () => {
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
      }),
      // BC.12 — basin-collapse telemetry. Surfaces the signals behind the
      // single-token mode-collapse so recovery is visible without hand-
      // diffing /ws polls: sem→motor saturation, dominant-token share of
      // recent emissions, GW broadcast diversity. Computed once per state
      // broadcast (not per tick) so the checkSemMotorHealth sample is cheap.
      basinHealth: _lap('basinHealth', () => {
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
      }),
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
      // Community-compute + auto-scale telemetry for the admin panel. The panel
      // reads payload.community.*; without this key in the PERIODIC broadcast it
      // showed 0 donors / 0 VRAM / 0 replicas between /autoscale POSTs. Same data
      // the GET /autoscale route returns (now a shared method).
      community: this._getCommunityState(),
    };
  },

  /**
   * Community-compute + auto-scale snapshot — the admin "Community Compute &
   * Auto-Scale" panel reads these. Underlying counters (_communityDonorCount /
   * _communityComputeMB) are recomputed on donor register + disconnect via
   * _recomputeCommunityCompute(). Shared by GET /autoscale and the periodic WS
   * broadcast so the two can never drift. Defensive: any missing field / thrown
   * read degrades to safe zeros so it can NEVER crash the hot broadcast path.
   */
  _getCommunityState() {
    try {
      return {
        communityComputeMB: this._communityComputeMB || 0,
        // ASCALE — smallest donor's EFFECTIVE committed VRAM. For data-parallel each donor holds
        // the FULL replica, so this (not the sum above) is the real upper bound on brain SIZE.
        minDonorMB: this._communityMinDonorMB || 0,
        // Min-donor sizing rework: the SIZE driver = max(operator baseline,
        // smallest committed donor) and the neuron capacity it can hold.
        sizeDriverMB: this._communitySizeDriverMB || 0,
        capacityNeurons: this._communityCapacityNeurons || 0,
        donorCount: this._communityDonorCount || 0,
        currentTier: this._communityTier || 0,        // raw — what the pool qualifies for
        upgradeTier: this._communityUpgradeTier || 0, // buffered — what would trigger a resize
        runningTier: this._communityTierRunning || 0, // what the brain is actually sized at
        pendingTier: this._communityTierPending == null ? null : this._communityTierPending,
        pendingSinceMs: this._communityTierPendingSince || null,
        runningFloorMB: this._runningFloorMB || 0,     // VRAM the running tier needs
        computeInsufficient: !!this._computeInsufficient,
        downPendingTier: this._communityDownTierPending == null ? null : this._communityDownTierPending,
        downPendingSinceMs: this._communityDownTierPendingSince || null,
        replicaCount: (typeof this._livePoolDonors === 'function')
          ? Math.max(0, this._livePoolDonors().length - 1) : 0,
        lastRebroadcastMs: this._lastReplicaRebroadcastMs || null,
        // RESYNCDUTY — publish what the sweep COST and when the next one is eligible.
        // The 60s-interval/11.5-minute-sweep runaway had to be reconstructed from a
        // console ring because the dashboard only ever showed the completion timestamp,
        // which looks identical whether the duty cycle is 5% or 100%.
        lastRebroadcastDurationMs: this._lastRebroadcastDurationMs || null,
        nextRebroadcastEligibleInMs: (this._lastRebroadcastDurationMs && this._lastReplicaRebroadcastMs)
          ? Math.max(0, (this._lastRebroadcastDurationMs
              * (Number(process.env.DREAM_DF7_REBROADCAST_DUTY) > 0 ? Number(process.env.DREAM_DF7_REBROADCAST_DUTY) : 3))
              - (Date.now() - this._lastReplicaRebroadcastMs))
          : null,
      };
    } catch {
      return {
        communityComputeMB: 0, minDonorMB: 0, sizeDriverMB: 0, capacityNeurons: 0, donorCount: 0, currentTier: 0, upgradeTier: 0,
        runningTier: 0, pendingTier: null, pendingSinceMs: null, runningFloorMB: 0,
        computeInsufficient: false, downPendingTier: null, downPendingSinceMs: null,
        replicaCount: 0, lastRebroadcastMs: null,
        lastRebroadcastDurationMs: null, nextRebroadcastEligibleInMs: null,
      };
    }
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
      // ── PAUSE-AWARE STALL DETECTION (2026-08-14) ──
      // D.3 put this check INSIDE `_gpuBatch`, which the tick never calls
      // while the main loop is paused — so it reported `batchStall: null`
      // while spikes sat frozen. Blind in exactly the case it existed for.
      // It lives here now, in the state builder, which always runs.
      //
      // And it splits two states that were indistinguishable from outside
      // and cost a wrong diagnosis (spikes frozen was read as "her neurons
      // stopped firing" when it was a designed pause):
      //   batchPaused — EXPECTED. The main tick deliberately returns early
      //     while the cortex owns the GPU for a cell's gate probe
      //     (brain-server.js `_probeGateActive`) or while the canonical
      //     sparse upload runs. Frozen spikes here are CORRECT.
      //   batchStall  — UNEXPLAINED. A donor is connected, nothing is
      //     paused, and completions have stopped anyway. This is the only
      //     one that means something is wrong.
      let _batchPaused = null;
      let _batchStall = null;
      try {
        const _donorLive = !!(this._gpuClient && this._gpuClient.readyState === 1);
        const _sinceOkMs = this._lastBatchOkMs ? (now - this._lastBatchOkMs) : 0;
        const _pauseReason = this._cortexUploadInFlight
          ? 'canonical-upload (donor ACKs own the message loop until it settles)'
          : (this.cortexCluster && this.cortexCluster._probeGateActive)
            ? 'probe-gate (cortex owns the GPU exclusively for this cell)'
            : null;
        if (_pauseReason) {
          _batchPaused = {
            reason: _pauseReason,
            sinceLastBatchMs: _sinceOkMs,
            cell: (this.cortexCluster && this.cortexCluster._currentCellKey) || null,
            expected: true,
          };
          // EM.4 — the ALWAYS-RUNS stale-clear. _gpuBatch's own clear can't
          // fire while the probe gate holds the tick (it isn't called), so a
          // batchStall object written just before the gate opened survived the
          // whole cell in `state.perf`, contradicting this pause-aware pair.
          if (this._perfStats && this._perfStats.batchStall) this._perfStats.batchStall = null;
          // PAUSE-END ANCHOR (2026-08-16, the 709s false alarm). Both stall
          // watchdogs measured from `_lastBatchOkMs` alone, so the FIRST check
          // after a long designed pause (the 12-min canonical upload) saw the
          // pre-pause anchor with the pause flag already cleared and screamed
          // ⛔ COMPUTE STALL before the first post-pause batch could complete.
          // This always-runs branch stamps the pause as it happens; both stall
          // checks measure from max(lastBatchOk, pauseSeen).
          this._designedPauseSeenMs = now;
        } else if (_donorLive && this._lastBatchOkMs
                   && (now - Math.max(this._lastBatchOkMs, this._designedPauseSeenMs || 0)) > 30000) {
          _batchStall = {
            stalledMs: _sinceOkMs,
            lastOkAt: this._lastBatchOkMs,
            donorBufferedMB: r1(((this._gpuClient.bufferedAmount || 0) / 1048576)),
            expected: false,
          };
        }
      } catch { /* telemetry must never break a broadcast */ }
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
        // TICK-GAP + SILENT-STALL (2026-08-14) — `batchTiming` is the
        // compute_batch send->reply stopwatch (round-trip, donor compute,
        // unaccounted remainder); `batchStall` is non-null ONLY when
        // completions have stopped while a donor is connected. The
        // 2026-08-14 freeze (spikes stuck for minutes, gpuHits frozen,
        // gpuMisses 0) was invisible precisely because neither existed.
        batchTiming: perf.batchTiming || null,
        batchPaused: _batchPaused,
        batchStall: _batchStall,
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

    // ── RAMHEAD — HOST-RAM HEADROOM, ON THE BOARD ──
    // RAMHEAD handed the brain the Forgejo reserve's slack (1.93x the neurons),
    // so "how close is this box to lock-up" stopped being a background question
    // and became the number that decides whether the growth was safe. The
    // checkpoint guard already DEFERS a save under pressure, but a protection
    // that fires silently is one nobody trusts — and this whole day has been
    // about boards that could not answer "is it working?". Free MB, the floor
    // it is measured against, and how many checkpoints have actually been
    // deferred, so the guard is visibly idle rather than merely assumed idle.
    try {
      const _os = require('os');
      const _freeMB = Math.floor(_os.freemem() / 1048576);
      const _totalMB = Math.floor(_os.totalmem() / 1048576);
      const _floor = process.env.DREAM_SAVE_MIN_FREE_MB !== undefined
        ? Number(process.env.DREAM_SAVE_MIN_FREE_MB) : 3072;
      out.hostRam = {
        freeMB: _freeMB,
        totalMB: _totalMB,
        usedPct: _totalMB > 0 ? Math.round(100 * (_totalMB - _freeMB) / _totalMB) : null,
        saveFloorMB: Number.isFinite(_floor) ? _floor : null,
        // headroom ABOVE the floor — the number that says how much margin the
        // guard is actually holding, which a raw free-MB reading cannot.
        headroomAboveFloorMB: Number.isFinite(_floor) ? (_freeMB - _floor) : null,
        underFloor: Number.isFinite(_floor) && _floor > 0 ? _freeMB < _floor : false,
        checkpointsDeferred: Number(this._ramGuardSkips) || 0,
        lastDeferAtFreeMB: (this._ramGuardLastFreeMB != null) ? this._ramGuardLastFreeMB : null,
        lastDeferAgoSec: this._ramGuardLastAt ? Math.round((now - this._ramGuardLastAt) / 1000) : null,
      };
    } catch (err) { out.hostRam = { error: err.message }; }

    // ── clients (per-connection health — client↔brain) ──
    try {
      const list = [];
      let admins = 0, viewers = 0, donors = 0, totalBytesIn = 0, totalBytesOut = 0, rttSum = 0, rttN = 0, maxBuffered = 0;
      // SYNCPARTIAL.7 / PARTMIRROR.4 — the DENOMINATORS. `df7HeldMatrices: 1`
      // and `21 compute batches · 0 teach ops` are both TRUE readings that look
      // like faults until you know they are 1-of-17 and 2-of-8. Work eligibility
      // is per-matrix (teach) and per-cluster (compute), so a row without its
      // denominator cannot answer "is it working?" — which is the whole family
      // of bug this batch closes.
      const _matrixTotal = (this._replicaMatrixRegistry && this._replicaMatrixRegistry.size) || 0;
      const _clusterTotal = (this.clusters && Object.keys(this.clusters).length) || 0;
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
          // MIRRORID.5 — `gneuronsPerSec` IS A PERSISTENT DONOR-SIDE FIELD.
          // donor.rs:655 writes it only when a batch COMPLETES and it keeps its
          // last value forever, so a card that has stopped computing entirely
          // keeps displaying the rate it earned minutes ago. That is worse than
          // showing 0: it hid the negative-batchId bug (every mirrored batch
          // silently dropped, no donor ever computed) for HOURS, because the
          // only honest 0 on the board belonged to the one card that had never
          // been primary. A rate with no freshness is not a measurement.
          //
          // `stepsComputed` is the exact fix. Both donor backends increment it
          // ONLY on batch completion and never decrease within a session
          // (donor.rs:655 `s.steps_computed += _neurons * _substeps`,
          // compute.html:1501/1547), so its delta is proof-of-work — no
          // value-collision guessing like watching the float rate for change.
          // Sampled here, in the state builder, on the same pattern the net /
          // ws rate buffers already use.
          const _steps = (tele && Number(tele.stepsComputed)) || 0;
          if (isGPU) {
            if (c._stepsSeen === undefined) { c._stepsSeen = _steps; c._stepsAdvancedAt = _steps > 0 ? now : null; }
            else if (_steps > c._stepsSeen) { c._stepsSeen = _steps; c._stepsAdvancedAt = now; }
          }
          const _advancedAgoSec = (isGPU && c._stepsAdvancedAt)
            ? Math.round((now - c._stepsAdvancedAt) / 1000) : null;
          // 30s: comfortably longer than the ~5s telemetry cadence, short enough
          // that a stalled card is visible before anyone asks about it. A donor
          // that has NEVER advanced reads idle from the start — honestly, since
          // it has genuinely computed nothing.
          const _computeIdle = isGPU
            ? (_advancedAgoSec === null || _advancedAgoSec > 30) : null;
          // PARTMIRROR.4 — coverage is deliberate, not a fault. A 5.6GB card is
          // gpu_init'ed for the subset of clusters it fits, so its rate is
          // PROPORTIONALLY smaller because it is stepping less brain. Without
          // the fraction on screen the board reads that as a broken card.
          const _cov = (isGPU && c.clusterCoverage instanceof Set)
            ? Array.from(c.clusterCoverage) : null;
          const _isPrimary = isGPU && ws === this._gpuClient;
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
            // v0.3.13 — the donor's announced binary version + whether the server
            // selected BINARY teach frames for it. Without these two fields the
            // BT.8 verification was guesswork: the lane symptoms said JSON but
            // nothing in the payload could say WHICH binary had registered.
            donorAppVersion: isGPU ? (c.donorAppVersion || null) : null,
            binaryTeach: isGPU ? !!(this._binTeachWs === ws && this._binTeachOk === true) : null,
            gneuronsPerSec: (isGPU && tele) ? r2(tele.gneuronsPerSec || 0) : null,
            // The rate above is a LAST-EARNED value, not a live one. These three
            // say whether it still means anything. Read them together or not at
            // all: `computeIdle: true` beside a healthy-looking Gn/s means the
            // card banked that number and then stopped.
            computeSteps: isGPU ? _steps : null,
            computeAdvancedAgoSec: _advancedAgoSec,
            computeIdle: _computeIdle,
            // TEACHMIRROR — THE OTHER LANE, and during the walk it is the ONLY
            // lane. `computeSteps` / `gneuronsPerSec` advance solely on
            // compute_batch completion; the curriculum sends Hebbian/propagate
            // frames instead, so a card teaching flat out reports zero on both
            // and `computeIdle` goes true. Live cost: an A6000 holding all 17
            // matrices and taking teach frames continuously rendered as
            // `idle (last 0Gn/s)`, and the row was read as a dead card.
            //
            // Counted server-side in `_sparseSendBinary` (we send the frames, so
            // the count is exact and needs no donor build). Read the two lanes
            // TOGETHER: compute-idle + teach-active = teaching, which is the
            // normal state of a walking brain, not a fault.
            teachOps: isGPU ? (Number(c.teachOps) || 0) : null,
            teachAdvancedAgoSec: (isGPU && c.teachOpsAt)
              ? Math.round((now - c.teachOpsAt) / 1000) : null,
            // One field the board can render without having to reason about the
            // pair. 30s matches the compute-lane staleness window above.
            workState: !isGPU ? null : (
              (c.teachOpsAt && (now - c.teachOpsAt) <= 30000) ? 'teaching'
                : (_computeIdle === false ? 'computing'
                  : ((Number(c.teachOps) || 0) > 0 || _steps > 0) ? 'idle' : 'no work yet')
            ),
            // F9 — WebGPU storage-binding cap + capability flag, so the dashboard can
            // show "GPU buffer too small for cortex matrix" instead of a mystery 0 Gn/s.
            maxBindMB: isGPU ? (Number(c.maxBindMB || (tele && tele.maxBindMB)) || null) : null,
            // ── PRIMARYFLOOR (2026-08-20) — "NEEDS X, CARD HAS Y", ON THE ROW ──
            //
            // Cost of not having this: a whole afternoon. An RTX 3090 was put in
            // as the donor, showed `bind 23.6GB`, `7/7 cl`, healthy telemetry and
            // a 30.1 Gn/s rate — and the walk silently never started, because
            // `brain-server.js:9361` refuses PRIMARY to any donor that cannot
            // hold the FULL running brain, and the matrices only ever upload to
            // the PRIMARY. The card joined as a replica, no primary existed, and
            // every visible field said fine. The brain KNEW the answer the whole
            // time and logged it exactly once, at register:
            //   "donor VRAM cannot hold the FULL running brain (needs ~25619MB)
            //    — NOT eligible for PRIMARY; joins as a (partial) replica."
            // 25,619 needed vs 24,124 held — short by 1.5GB.
            //
            // `runningFloorMB` was already published, but buried in the COMMUNITY
            // block, nowhere near the donor whose VRAM it disqualifies. A number
            // is only an instrument when it sits next to the thing it judges. So
            // the floor, the verdict and the SHORTFALL travel with the row —
            // `primaryShortfallMB` is the one that turns "why is nothing
            // happening" into "buy 1.5GB more card".
            //
            // Mirrors the server's own arithmetic (donatedMB cap when set, else
            // full card) so the row cannot disagree with the decision it reports.
            primaryFloorMB: isGPU ? (Number(this._runningFloorMB) || null) : null,
            primaryEligible: !isGPU ? null : (() => {
              const _floor = Number(this._runningFloorMB) || 0;
              const _vram = Number(c.gpuVramMB) || 0;
              const _held = (Number(c.donatedMB) > 0)
                ? (_vram > 0 ? Math.min(Number(c.donatedMB), _vram) : Number(c.donatedMB))
                : _vram;
              if (!(_floor > 0) || !(_held > 0)) return null;   // unknown, not "eligible"
              return _held >= _floor;
            })(),
            primaryShortfallMB: !isGPU ? null : (() => {
              const _floor = Number(this._runningFloorMB) || 0;
              const _vram = Number(c.gpuVramMB) || 0;
              const _held = (Number(c.donatedMB) > 0)
                ? (_vram > 0 ? Math.min(Number(c.donatedMB), _vram) : Number(c.donatedMB))
                : _vram;
              if (!(_floor > 0) || !(_held > 0) || _held >= _floor) return null;
              return _floor - _held;
            })(),
            bindIncapable: isGPU ? !!c._bindIncapable : false,
            // DF.7 SYNCGATE — has this donor's replica weight-sync PROVENLY completed?
            // A non-primary donor is only admitted to the work pool (and only allowed to
            // serve propagate reads) once this is true, because before the gate a donor
            // that joined mid-teach was handed Hebbian batches for matrices it did not
            // hold — the honest cause of a 0 Gn/s row. `primary` distinguishes "IS the
            // master, nothing to sync" from "replica still waiting for its weights", so
            // the Clients table can say which one a quiet card actually is.
            df7Primary: _isPrimary,
            // DONORKILL.2 — WHAT BREAKS IF YOU KILL THIS ONE. A pod list, the
            // Clients table and the leaderboard all showed a card without
            // showing it was THE master holding her weights; a spend-kill on a
            // primary took the walk to 0 teach/min, and the reasoning offered
            // BEFORE that irreversible press was wrong (`replicaCount: 0` was
            // read as "contributed nothing" when it meant "this card IS the
            // master"). The consequence now travels with the row, so it is
            // surfaced before the press instead of explained after it.
            pauseIfKilled: !isGPU ? null : (_isPrimary
              ? 'PRIMARY — this card is the master. Killing it pauses the walk'
                + ' (no compute substrate) until another donor is promoted and'
                + ' re-uploaded.'
              : 'replica — killing it drops its share of work; the walk'
                + ' continues on the primary.'),
            df7Synced: isGPU ? (_isPrimary ? true : !!c._df7Synced) : false,
            df7SyncedMatrices: isGPU ? (Number(c._df7SyncedMatrices) || 0) : 0,
            // INCREMENTAL — how many matrices this donor actually HOLDS right now. Work
            // eligibility is per-matrix, so this is the honest "how much can it do yet"
            // number; df7Synced only says whether a full pass has finished.
            df7HeldMatrices: isGPU ? ((c.heldMatrices instanceof Set) ? c.heldMatrices.size : 0) : 0,
            // The denominator that turns "holds 1" into "holds 1/17". A sync
            // once logged `1 matrices pushed` and `a FULL brain replica` ON THE
            // SAME LINE; a later one announced a full replica off `0/0`. A
            // fraction cannot tell that lie.
            df7TotalMatrices: isGPU ? _matrixTotal : null,
            df7SyncedAgoSec: (isGPU && c._df7SyncedAt) ? Math.round((Date.now() - c._df7SyncedAt) / 1000) : null,
            // Cluster coverage — how much brain this card is actually stepping.
            // null coverage = full-coverage donor (every cluster).
            clusterCoverage: _cov,
            clusterCoverageCount: isGPU ? (_cov ? _cov.length : _clusterTotal) : null,
            clusterTotal: isGPU ? _clusterTotal : null,
            // FLAP — platform/backend telemetry so a red / 0-Gn/s donor's OS, compute backend,
            // driver, and compute-capability are visible in the Clients table instead of
            // reverse-engineered from logs (native donor reports these; browser donor → null).
            osPlatform: isGPU ? ((c.osPlatform || (tele && tele.osPlatform)) || null) : null,
            engineBackend: isGPU ? ((c.engineBackend || (tele && tele.engineBackend)) || null) : null,
            driverVersion: isGPU ? ((c.driverVersion || (tele && tele.driverVersion)) || null) : null,
            computeCapability: isGPU ? ((c.computeCapability || (tele && tele.computeCapability)) || null) : null,
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
            // BUSY-DONOR forgiveness (2026-07-09) — a donor whose send buffer
            // is DRAINED (<8MB) and which is actively computing
            // (gneuronsPerSec > 0) answers the heartbeat late because its
            // browser tab's MAIN THREAD is grinding GPU work — the WS pong is
            // serviced by that same busy thread. A hard-working solo donor
            // showed a permanent 3-5s RTT and a permanently RED row even after
            // the 64MB-parked-socket bug was fixed and its buffer sat at ZERO.
            // Busy ≠ broken: skip the RTT clause for such a donor; a genuinely
            // stale (90s+ silent) or backed-up (>300MB) one still flags.
            unhealthy: (() => {
              const busyDonor = isGPU && buffered < 8 * MB && ((tele && tele.gneuronsPerSec) || 0) > 0;
              return ((now - (c.lastSeen || now)) > 90000)
                || (typeof c.rttMs === 'number' && c.rttMs > 2500 && (this._lastEventLoopLagMs || 0) < 1000 && !busyDonor)
                || (buffered > 300 * MB);
            })(),
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
    // Layer histogram + hub count — CACHED ONCE (2026-08-17). These two
    // loops walked layerId (12M) + hubMask (12M) on EVERY call — 24M reads
    // ≈ the ENTIRE 245ms/call the getState section lap timers measured on
    // 'consciousness' (94% of the broadcast build, ~36% of wall-clock, the
    // event-loop backlog that taxed every teach yield). Both arrays are
    // STATIC after construction: lamination is assigned once and hubs are
    // deterministic-hash-seeded precisely so they persist — the counts can
    // never change while the process lives. Recompute only if the cortex
    // is regrown (size or array identity changes).
    let layerCounts = [0, 0, 0, 0, 0];
    let hubCount = 0;
    if (cortex && (cortex.layerId || cortex.hubMask)) {
      const cc = this._corticalCountsCache;
      if (cc && cc.layerIdRef === cortex.layerId && cc.hubMaskRef === cortex.hubMask) {
        layerCounts = cc.layerCounts;
        hubCount = cc.hubCount;
      } else {
        if (cortex.layerId) {
          for (let i = 0; i < cortex.layerId.length; i++) {
            const l = cortex.layerId[i];
            if (l < layerCounts.length) layerCounts[l] += 1;
          }
        }
        if (cortex.hubMask) {
          for (let i = 0; i < cortex.hubMask.length; i++) {
            if (cortex.hubMask[i]) hubCount += 1;
          }
        }
        this._corticalCountsCache = {
          layerIdRef: cortex.layerId || null,
          hubMaskRef: cortex.hubMask || null,
          layerCounts,
          hubCount,
        };
      }
    }
    // Definition-taught count (single number). The taught-set spans EVERY
    // grade's learned words — journey-wide by construction.
    const kvocabTaught = cortex && cortex._definitionTaughtWords
      ? cortex._definitionTaughtWords.size : 0;
    // FULL-JOURNEY DENOMINATOR (2026-08-17). The old hardcoded 2247 was
    // K's list size, but the numerator above already counted all grades —
    // the pair lied the moment the walk crossed a grade boundary (taught
    // once read 2,287 against "2,247 total"). Warm the real total once
    // (async — the state getter is sync); publish null until it lands so
    // the dashboard shows "still computing" instead of an invented number.
    // The real figure: 19 grade lists, 49,921 words summed, 18,017 unique
    // (the AoA bands overlap by design; a word taught once is taught).
    if (!this._defVocabJourneyWarm) {
      this._defVocabJourneyWarm = true;
      import('../../js/brain/grade-vocabulary.js')
        .then((m) => m.fullJourneyVocabularyStats())
        .then((s) => { this._defVocabJourneyTotal = s && s.unique ? s.unique : null; })
        .catch(() => { this._defVocabJourneyWarm = false; });   // retry on next state read
    }
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
      // Full K→PhD journey total (unique words across all 19 grade lists);
      // null until the one-time async warm completes — never an invented
      // stand-in number.
      kVocabTotal: this._defVocabJourneyTotal || null,
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
      // SPEAK.2/9-obs — speech-pipeline health. Per-subject word_motor basin
      // separability (weight-mass distribution: uniform = separable; from the
      // SPEAK.2 renorm probe) + frozen cellSize (SPEAK.1) + the reject-to-silence
      // coherence-floor stats (SPEAK.9) + best-of-N rerank stats. Lets separability
      // regression show at G4 instead of surfacing as G9 word salad.
      speechHealth: (() => {
        try {
          const subj = ['ela', 'math', 'sci', 'soc', 'art', 'life'];
          const sep = {};
          for (const sj of subj) {
            const mx = cortex && cortex[`wordMotorWeightMaxAbs_${sj}`];
            const mn = cortex && cortex[`wordMotorWeightMeanAbs_${sj}`];
            if (typeof mx === 'number' || typeof mn === 'number') {
              sep[sj] = {
                maxAbs: Number((mx || 0).toFixed(4)),
                meanAbs: Number((mn || 0).toFixed(4)),
                ratio: (mn > 0) ? Number((mx / mn).toFixed(2)) : 0,
                cellSize: (cortex && cortex[`wordBucketCellSize_${sj}`]) || 0,
              };
            }
          }
          const cf = cortex && cortex._coherenceFloorStats;
          const rr = cortex && cortex._coherenceRerankStats;
          return {
            separability: sep,
            coherenceFloor: cf ? { total: cf.total || 0, rejected: cf.rejected || 0, rejectRate: cf.total ? Number((cf.rejected / cf.total).toFixed(3)) : 0 } : null,
            rerank: rr ? { calls: rr.calls || 0, reranked: rr.reranked || 0 } : null,
          };
        } catch { return null; }
      })(),
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
      // TU.25.A — teach-Hebbian ops shed at the soft cap (fire-and-forget
      // frames dropped instantly under saturation instead of stacking the
      // buffer; CPU authoritative, shadow re-converges via auto-resync).
      sheds: this._wsShedCount || 0,
      // TU.28.2 — per-stream saturation attribution. patternSheds counts
      // teach-pattern JSON frames (write_spike_slice / write_current_slice /
      // clear_spike_region) dropped by the TU.28.1 gate — the stream that
      // previously had NO guard and grew the buffer to GB scale. mirrorSheds
      // counts replica-mirror frames skipped at a saturated replica socket.
      // Split out from `sheds` (hebbian ops) so the dashboard/public-state
      // shows WHICH stream is saturating at a glance.
      patternSheds: this._wsPatternShedCount || 0,
      // GPU-ONLY CONSEQUENCE (2026-08-15). A shed pattern frame is no longer
      // free: the bound-Hebbian dispatch reads its pre/post out of the very
      // buffer these frames write, so a shed marks the lane stale and the
      // dependent Hebbian is SUPPRESSED rather than fired on the previous
      // iteration pattern. This counter is the teaching that cost us - it
      // belongs on screen, not in a rate-limited console line.
      hebbianSuppressedStale: this._hebbianSuppressedStale || 0,
      patternLaneStale: !!this._patternLaneStale,
      mirrorSheds: this._wsMirrorShedCount || 0,
      dropRatePerSec,
      wsConnected: !!(ws && ws.readyState === 1),
      // GPU shadow dirty flag — read from cortexCluster._gpuShadowDirty,
      // the SINGLE flag the gpu_init re-confirm handler + /resync path
      // actually clear. The old read was a brain-level `_gpuShadowDirty`
      // that shed/drop paths set but NO code path ever cleared, so the
      // dashboard DIRTY banner latched ON after the first shed and the
      // manual Re-sync button appeared dead even when the re-upload
      // completed. Now DIRTY truthfully flips clean the moment the donor
      // re-confirms cortex gpu_init after a resync. Last drop timestamp
      // lets dashboard render "12s ago" / "no drops since boot" without
      // each panel computing its own.
      gpuShadowDirty: !!(this.cortexCluster && this.cortexCluster._gpuShadowDirty),
      lastDropTs: this._wsLastDropTs || 0,
      // RH.3r (v0.3.15) — per-frame-type outbound teach telemetry: frames +
      // bytes per SPRS type (t3 hebbian arrays, t7 spike writes, t8 current
      // writes, t9 clears, t12 repeats) plus the bytes repeat compression
      // avoided shipping. The wire river's composition is READ here now,
      // never again inferred from average message sizes.
      teachOutByType: this._teachOutByType || null,
      teachOutBytesSaved: this._teachOutBytesSaved || 0,
      repeatTeach: !!this._repeatTeachOk,
      // Broadcast pipeline profile (2026-08-17) — 10fps loop cost split
      // (state build vs stringify+send) so the event-loop backlog that
      // taxes every teach-chain yield is decomposed from the field.
      // + sections: cumulative ms per getState section (the lap timers) —
      // the per-call remainder is named here, never re-theorized.
      bcast: (this._bcastProf || this._gsSections)
        ? { ...(this._bcastProf || {}), sections: this._gsSections || null }
        : null,
    };
  },
};

module.exports = { SERVER_STATE_MIXIN };
