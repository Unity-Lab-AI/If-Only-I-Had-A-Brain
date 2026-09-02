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

// ── AGEPIN.1 — ONE grade ladder and ONE age map, shared. ─────────────────
//
// These were copied into five places (`curriculum.js` canonical,
// `drug-scheduler.js` documented local copy, `_computeMinGrade` here,
// `_selfImageAge` in chat.js, `TIER3_GRADE_ORDER`/`TIER3_GRADE_AGE` in
// hippocampal-schema.js) and the copies DISAGREED about the kindergarten
// key — two said `'K'`, which the curriculum never emits. That is not a
// typo class of bug, it is a duplication class of bug: the copies drifted
// because nothing forced them to agree. Defined once here and consumed by
// both server-side readers.
//
// Mirrors `GRADE_ORDER` in js/brain/curriculum.js. Same convention (and
// same hazard) as the local copy in drug-scheduler.js — the server cannot
// statically import a js/brain ESM module at this point in boot. If the
// canonical order changes there, change it here too.
const GRADE_LADDER = [
  'pre-K', 'kindergarten',
  'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6',
  'grade7', 'grade8', 'grade9', 'grade10', 'grade11', 'grade12',
  'college1', 'college2', 'college3', 'college4', 'grad', 'phd',
];

// The age she IS at each grade. Single source for both her stated age and
// her rendered age, so the two can never disagree.
const GRADE_AGE = {
  'pre-K': 4, 'kindergarten': 5,
  grade1: 6, grade2: 7, grade3: 8, grade4: 9, grade5: 10, grade6: 11,
  grade7: 12, grade8: 13, grade9: 14, grade10: 15, grade11: 16, grade12: 17,
  college1: 18, college2: 19, college3: 20, college4: 21, grad: 23, phd: 25,
};

// `'K'` is accepted as a LEGACY ALIAS for grade state persisted before the
// rename. It normalises an old input onto the one ladder — it is not a
// second key with independent meaning, and nothing new should emit it.
function normalizeGradeKey(g) {
  const s = String(g || '');
  return s === 'K' ? 'kindergarten' : s;
}

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
    // ⛔ AGEPIN.1 — THIS SEARCHED FOR `'K'`, A STRING THE CURRICULUM NEVER
    // PRODUCES, AND SO RETURNED `'phd'` THROUGHOUT KINDERGARTEN.
    //
    // The canonical ladder (js/brain/curriculum.js GRADE_ORDER) is
    // ['pre-K', 'kindergarten', 'grade1', …] and that is what lands in
    // `cluster.grades`. The old array here said `'K'`, so
    // `indexOf('kindergarten')` returned −1, the `iG >= 0` guard skipped
    // that subject, and with every subject at kindergarten the seed
    // `lo = 'phd'` was never displaced. Nothing failed loudly: the function
    // returned a valid-looking grade that was simply the wrong one, which
    // then flowed into `_selfImageAge()` and made a five-year-old picture
    // herself as twenty-five — the exact outcome the age-gate law exists to
    // prevent.
    //
    // Now uses the canonical strings, with `'K'` accepted as a LEGACY ALIAS
    // for grade state saved before the rename. The alias normalises an old
    // input to the one truth; it is not a second ladder.
    const order = GRADE_LADDER;
    let lo = 'phd';
    for (const raw of Object.values(this.cortexCluster.grades)) {
      const g = normalizeGradeKey(raw);
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
          // EVERFIRED.2 — SAY WHAT THIS MEASURES, because a bare `0%` beside a
          // region name is read as "never used" and this instrument is not
          // entitled to that claim. `_updateLangEverFired` POLLS lastSpikes on
          // a 5s throttle and ORs into a bitset; it is not an event hook, so
          // anything written and cleared between two polls is invisible to it
          // permanently. Regions whose activity is transient by construction —
          // fineType carries relation tags that are written, bound and cleared
          // within a single pair — can therefore read 0 while being written
          // thousands of times. ⚠ The converse does NOT hold and must not be
          // inferred: a 0 here is not proof of health either. It is a floor on
          // observed coverage and nothing more.
          method: 'poll',
          pollIntervalMs: 5000,
          measures: 'fraction of cells observed non-zero in lastSpikes at a'
            + ' 5s sample since boot — a LOWER BOUND on participation, not a'
            + ' capability claim. Transient writes between samples are missed;'
            + ' 0% means "never sampled active", never "never used".',
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
        //
        // DORMANT.3 (2026-08-25) — THIS READ NAMED THE WRONG FIELD, so all seven
        // clusters reported `null` forever for a number that is computed on
        // every tick. The cluster sets `this.lastMeanVoltage` (cluster.js:3988,
        // `vSum / size`) and exposes it as `meanVoltage` only inside its own
        // snapshot object; the live instance has no `meanVoltage` property, so
        // the typeof test never passed. `lastMeanVoltage` is read first now,
        // with the old name kept as a fallback for any caller that hands us a
        // snapshot rather than the cluster itself.
        //
        // ⛔⛔ GOTCHA.3 (2026-08-27) — DORMANT.3 FIXED THE NAME AND THE VALUE IS
        // STILL NULL, because the sentence above ("a number that is computed on
        // every tick") IS FALSE AT BIOLOGICAL SCALE. Measured on the live brain:
        // all seven clusters `null` at 3.6h uptime while training. There are
        // three producers and, for a NATIVE-donor brain, all three are dead:
        //
        //   1. CPU  — `lastMeanVoltage` is written ONLY at cluster.js:4131,
        //      inside `step()`. `stepAwait` refuses above 2M ("At biological
        //      scale a CPU step is FORBIDDEN") and four raw-step sites carry the
        //      same `size > 2000000` return. The GPU steps the brain instead, so
        //      this writer never runs for the big clusters.
        //   2. BROWSER donor — IMPLEMENTED and working: compute.html does a
        //      once-per-tick GPU atomic reduction (`readbackVoltageMean`) and
        //      puts it on `perCluster[name].meanVoltage`.
        //   3. NATIVE donor — NEVER SENT. donor-app/src/donor.rs builds
        //      `PerClusterResult { …, mean_voltage: None }` hardcoded, and
        //      protocol.rs's `skip_serializing_if = "Option::is_none"` then omits
        //      the key entirely, so brain-server's `typeof entry.meanVoltage ===
        //      'number'` guard is never true and `clusters[name].meanVoltage` is
        //      never assigned.
        //
        // ⭐ So the honest repair here is NOT to invent a number — it is to stop
        // publishing a bare `null` that cannot say why it is null. A reader
        // cannot distinguish "not sampled yet", "this donor does not report it",
        // and "broken" from a null, and that indistinguishability is the whole
        // defect class this file keeps paying for. `meanVoltageSource` names the
        // producer that supplied the value, or the reason there isn't one.
        // Implementing the native-donor reduction is a donor-release job and is
        // tracked separately as GOTCHA.3b — it is NOT done here.
        meanVoltage: typeof cluster.lastMeanVoltage === 'number'
          ? cluster.lastMeanVoltage
          : (typeof cluster.meanVoltage === 'number' ? cluster.meanVoltage : null),
        meanVoltageSource: typeof cluster.lastMeanVoltage === 'number'
          ? 'cpu-step'
          : (typeof cluster.meanVoltage === 'number'
            ? 'gpu-donor-readback'
            : (this._gpuConnected
              ? 'unreported-by-this-donor (native donor sends mean_voltage: None — GOTCHA.3b)'
              : 'no-gpu-donor-attached')),
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
      // PSITEACH.1 — which lane fed Ψ this tick: step-lane spikes and the
      // measured teach-lane activity term (TEACHCREDIT Gops/s, normalized).
      // Ψ = 0.000 with teachGopsPerSec > 0 is the blind-instrument shape this
      // field exists to make impossible to misread.
      psiInputs: this.psiInputs || null,
      // PSITEACH.2 — the walk heartbeat (non-cortex step batches dispatched
      // while the curriculum holds the probe gate). null = never armed.
      walkTick: this._walkTickStats || null,
      // FIREKNOB — the firing-rate controller: measured fired-% (last / ema),
      // the DREAM_FIRING_TARGET_PCT it aims at, and the bounded drive scale it
      // reached. A scale sitting at 0.25 or 10 means the target is out of the
      // drive knob's reach — a report, not a hidden clamp. null = disabled or
      // no answered batch yet.
      firing: (this._fireCtl && this._firingTargetPct && this._firingTargetPct() > 0) ? {
        pct: +this._fireCtl.pct.toFixed(3),
        ema: this._fireCtl.ema == null ? null : +this._fireCtl.ema.toFixed(3),
        targetPct: this._firingTargetPct(),
        driveScale: +this._fireCtl.scale.toFixed(3),
        samples: this._fireCtl.samples,
      } : null,
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
          // ⛔ EYEPIN.3 — WHAT SHE IS LOOKING AT, AND WHY. Shipped in the same
          // commit as the picker, because the defect it reports was invisible
          // to every existing counter: the lane read 383/383 drawn with every
          // error field 0 while repeating ONE subject, and the only way to
          // catch it was polling the snapshot eight times by hand.
          //
          // `pinTicks` is the instrument that matters — consecutive imagine
          // ticks on one thought. It climbing without bound means her thought
          // chain has stalled, which is a finding about EMISSION, not about
          // art. `maxPinTicks` banks the worst run so a board read late still
          // sees it. `recentSubjects` proves variety directly rather than
          // asking anyone to trust a count.
          eye: this._eyeStats ? {
            picks: this._eyeStats.picks | 0,
            fromThought: this._eyeStats.fromThought | 0,
            fromAcquisition: this._eyeStats.fromAcquisition | 0,
            fromRecall: this._eyeStats.fromRecall | 0,
            none: this._eyeStats.none | 0,
            pinTicks: this._eyeStats.pinTicks | 0,
            maxPinTicks: this._eyeStats.maxPinTicks | 0,
            rotations: this._eyeStats.rotations | 0,
            lastSubject: this._eyeStats.lastSubject || null,
            lastWhy: this._eyeStats.lastWhy || null,
            lastAgeMs: this._eyeStats.lastAt ? (Date.now() - this._eyeStats.lastAt) : null,
            recentSubjects: Array.isArray(this._eyeRecent) ? this._eyeRecent.slice() : [],
            taughtPool: this._eyeTaughtCacheSize | 0,
            taughtCursor: this._eyeTaughtCursor | 0,
          } : null,   // null = the picker has not run yet, NOT "no pin"
          lastLabel: this._lastSketchLabel || null,
          style: (typeof process !== 'undefined' && process.env && process.env.DREAM_DRAW_STYLE) || 'own',
          // ARTSTYLE — the hand she used on her latest piece; rotates every artwork.
          lastArtStyle: this._lastArtStyle || null,
          // PAINT.5 — the practice loop's ledger: sessions run, the last word
          // practiced, and the base→best resemblance of that session. `null`
          // means she has never practiced (not "the feature is off").
          practice: this._practiceStats || null,
          // ARTJUDGE — the viewer's accept/reject/ban verdicts on her drawings,
          // plus how many words the operator has taught her never to draw.
          feedback: this._artFeedbackStats || null,
          // FORMBANK — banked form variants across all concepts (the raw
          // material of "draw a brown one standing").
          formVariants: (() => { try { let n = 0; for (const e2 of (this._vmStore && this._vmStore().values()) || []) if (e2 && Array.isArray(e2.schemaBank)) n += e2.schemaBank.length; return n; } catch { return 0; } })(),
          notDrawableWords: (() => { try { return this._artBanSet().size; } catch { return 0; } })(),
          // LOOKEYES.1 — the look lane's own ledger: every stage a look-up can
          // die at, counted, plus the last error WITH ITS AGE. Built because the
          // lane starved for ~10h (2 grounds against a ~60-look budget) with
          // zero remotely-visible evidence — every failure path was silent.
          lookups: this._vmLookStats || null,
          // WAVESEE.4 — is she READING the precomputed wavelet fields, or
          // silently re-transforming every figure? One number cannot answer
          // that, so the counters are separate BY REASON:
          //   hit       a field was read and became a percept — the fast path
          //   miss      no field for that figure (about a fifth never made one:
          //             dead URLs, non-Wikimedia SVGs, GIFs) — NOT an error
          //   stub      an LFS POINTER instead of a field. `git lfs pull` never
          //             ran, so the store looks populated and perceives nothing.
          //             ⛔ THIS IS A DELIVERY FAILURE AND MUST NOT READ AS A MISS.
          //   malformed present, parsed, and carrying no rec.channels
          // `enabled:false` means the directory is absent — she is on the live
          // path everywhere, which is correct but ~64 CPU-hours more expensive.
          fields: (() => {
            try { return require('../figure-field-store.js').fieldStoreStats(); }
            catch { return null; }
          })(),
          // VMRELATE — what the phrase-teach lane actually spent. Published
          // because an unbounded teach layer cost 70 minutes per cell once
          // already: `skippedBusy` climbing means the bound is doing its job,
          // and `pairs` climbing without `queued` climbing would mean it is
          // not. null = the lane has not run, never "it ran and did nothing".
          relate: this._vmRelate || null,
          // ARTWEIGHT — what MAKING art spent on her weights. Before this
          // existed the whole draw + practice span had zero weight-touching
          // calls, so `pieces` climbing while `pairs` stays flat would mean
          // the lane has gone quiet again. null = never ran.
          artWeight: this._artWeight || null,
          // VMUSE.5.B — WHAT SHE IS READING BACK, published BEFORE the other
          // lanes lean on it. ⚠ The bands started writing this walk, so a high
          // `flat` count early is CORRECT, not a fault — it is the gate
          // refusing to act on channels that have not separated yet. The
          // number to watch is `confident` climbing over time; if it never
          // does, the consumers are inert and this row says so instead of
          // letting them look active. null = the reader has never been asked.
          relationUse: (this.curriculum && this.curriculum._relUse) ? {
            asks: this.curriculum._relUse.asks | 0,
            confident: this.curriculum._relUse.confident | 0,
            flat: this.curriculum._relUse.flat | 0,
            unreadable: this.curriculum._relUse.unreadable | 0,
            cached: this.curriculum._relUse.cached | 0,
            recent: (this.curriculum._relUse.recent || []).slice(0, 6),
            byTag: this.curriculum._relUse.byTag || {},
            // RELWRITE.1 — `flat` alone could not say WHY, and the note above
            // ("a high flat count early is CORRECT") is only true in one of the
            // two cases it covers. Bands carrying mass but not yet separated
            // means wait. Bands carrying ZERO means the relation never reached
            // the matrix, and waiting for that is waiting forever. These split
            // the bucket, and `lastRead` carries the raw shape behind the last
            // flat verdict so the claim can be checked rather than believed.
            flatWithMass: this.curriculum._relUse.flatWithMass | 0,
            flatNoMass: this.curriculum._relUse.flatNoMass | 0,
            lastRead: this.curriculum._relUse.lastRead || null,
            // RELWRITE.1 — THE WRITE SIDE. `_relTagWrites` was incremented at
            // curriculum.js and read by nothing in the entire tree; without it
            // no amount of staring at the read side can establish whether any
            // tag was ever written. `byTag` here is the write breakdown (do not
            // confuse it with `byTag` above, which is the READ breakdown) — a
            // tag present in writes and absent from reads is the six-band bug's
            // exact signature, and it went undetected because neither half was
            // published. `refused` counts tags rejected for not fitting.
            // RELSEP.1 — THE TREND, not just the verdict. `confident: 0` is
            // true for a walk that will never separate AND for one about to,
            // and `VMUSE.5.D` is gated on exactly that difference. `progress`
            // is the best ratio seen as a fraction of the gate, so one
            // snapshot answers "is it getting closer?".
            bestMarginRatio: this.curriculum._relUse.bestMarginRatio || 0,
            bestMarginWord: this.curriculum._relUse.bestMarginWord || null,
            lastMarginRatio: this.curriculum._relUse.lastMarginRatio || 0,
            marginProgress: this.curriculum._relUse.marginProgress || 0,
            marginGate: this.curriculum._relUse.marginGate || 0,
            tagWrites: (this.curriculum._relTagWrites | 0),
            tagWritesByTag: this.curriculum._relTagWritesByTag || {},
            tagWritesRefused: (this.curriculum._relTagRefused | 0),
            // VMUSE.5 — how many times a relation actually CHANGED something.
            // The reader existed for a day with every consumer annotate-only,
            // and `s.relationTag` was written and never read. A consumer that
            // cannot be counted is indistinguishable from one that was never
            // wired, which is the whole family of defects this batch is about.
            // Expected to sit at 0 until the bands separate — that is the gate
            // doing its job, not a dead lane.
            consumedByEye: (this._eyeRelationPicks | 0),
          } : null,
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
          // ⛔ `lastInteractionAt` ADDED 2026-09-01 — the dashboard's conversation
          // panel read `state.lastMessageAt`, which NOTHING has ever published,
          // so it rendered "—" permanently. That is indistinguishable from "she
          // has never been spoken to", which is a lie an instrument tells
          // silently — the `meanVoltage` shape (computed every tick, read under
          // a different name, null forever).
          // ⭐ The data existed all along: every conversation entry carries a
          // `time` (chat.js:658 and :913 both push `{ role, text, time }`), so
          // the newest one across all users IS the answer and needed only to be
          // surfaced under a name someone reads.
          let _lastAt = 0;
          for (const c of Object.values(this._conversations || {})) {
            const last = c && c.length ? c[c.length - 1] : null;
            if (last && typeof last.time === 'number' && last.time > _lastAt) _lastAt = last.time;
          }
          this._growthCache = {
            totalWords: Object.keys(this._wordFreq || {}).length,
            totalInteractions: Object.values(this._conversations || {}).reduce((s, c) => s + c.length, 0),
            totalEpisodes: this._db ? this.getEpisodeCount() : 0,
            lastInteractionAt: _lastAt || null,
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
      // ⭐ LETTERREAD — why she could not answer a letter question, and whether
      // the letter matrix is WIRED or merely UNTRAINED.
      //
      // Filed after "what letter comes after D" answered motor-unstable: the
      // parse was proven clean and the probe proven to complete in 4.6 s, and
      // then the trail went cold, because `_letterSequenceRead` returned a bare
      // null for five structurally different reasons. Diagnosing that by
      // INFERENCE is exactly how this project has shipped a confidently-wrong
      // mechanism before, so the decline now names its blocker and the matrix
      // publishes its own structure.
      //
      // ⛔ `wired` vs `trained` is the load-bearing pair: `ojaUpdate` adjusts
      // existing CSR entries and cannot create them, so an UNWIRED letter can
      // never learn a successor at any rep count, while an UNTRAINED one is a
      // curriculum question. Reporting them as one number is what let three
      // quarters of all words sit unable to emit (cluster.js:1204-1222).
      // CURRICULUM COVERAGE — the boot-computed reachability report. Answers
      // "is every cell the walk runs actually fed?", which is a different and
      // strictly harder question than "how deep is each corpus file" — the
      // latter passed for a year while 268,481 words sat in cells the walk
      // never reaches and 71 cells ran with no lane at all.
      // ⚠ A cached object read, NOT a recomputation: the sweep runs once at
      // boot (see brain-server.js) because the state payload is assembled at
      // 10fps and a per-push filesystem walk would ride the loop the donor and
      // WS pump share.
      curriculumCoverage: _lap('curriculumCoverage', () => this._curriculumCoverage || null),
      // ⭐ Which exam words the corpus does not contain ANYWHERE — computed once
      // at boot from the SAME module the CLI auditor uses, so the page and the
      // command line cannot disagree. Until 2026-09-02 this answer existed only
      // in a terminal.
      // ⚠ `available:false` carries its own reason and is published as-is: a
      // sweep that could not run must not render as a sweep that found nothing.
      examVocabSweep: _lap('examVocabSweep', () => this._examVocabSweep || null),
      // ⭐ THE FIGURE QUEUE — how many of the corpus's illustrations she has
      // actually seen, and how many are still owed. ⛔ `held` is reported apart
      // from `seen` on purpose: collapsing them would make a resumed run look
      // productive, and `failed` is reported at all so a picture that can never
      // be fetched is visible rather than quietly missing.
      figureQueue: _lap('figureQueue', () => (this._figureQueue ? this._figureQueue.stats() : null)),
      // TEACHVIEW — exactly what she is being taught, right now.
      // ⛔ Before this existed there was NO channel anywhere carrying the text
      // she learns: `_teachSentenceList` (23 call sites) had no log, no publish
      // and no emit, which is why a 931-page curriculum went a year unnoticed.
      // ⭐ COUNTS ARE COMPLETE — never sampled — while the FEED is a bounded
      // ring for human reading. Both facts are shipped so the pane can never be
      // mistaken for the whole.
      // ⚠ The ring is sliced HERE rather than sent whole: the payload is built
      // at 10fps and shipping 400 rows per push would put the feed's weight on
      // the loop the donor socket and WS pump share. The client keeps its own
      // history from the sequence numbers.
      teachView: _lap('teachView', () => {
        const cur = this.curriculum;
        const tv = cur && cur._teachView;
        if (!tv) return null;
        const since = Number(this._teachViewSince) || 0;
        const fresh = tv.ring.filter((r) => r.n > since);
        const SEND = 24;
        const slice = fresh.slice(-SEND);
        return {
          total: tv.total,
          seq: tv.ringSeq,
          startedAt: tv.startedAt,
          lastAt: tv.lastAt,
          ageMs: tv.lastAt ? (Date.now() - tv.lastAt) : null,
          byLane: tv.byLane,
          bySource: tv.bySource,
          cells: Object.keys(tv.byCell).length,
          byCell: tv.byCell,
          flags: tv.flags,
          feed: slice,
          feedDropped: Math.max(0, fresh.length - slice.length),
          ringCap: 400,
        };
      }),
      letterRead: _lap('letterRead', () => {
        try {
          const cur = this.curriculum;
          if (!cur) return null;
          const last = cur._letterReadLast || null;
          const ord = cur._letterOrdinalLast || null;
          const health = (typeof cur._letterMatrixHealth === 'function')
            ? cur._letterMatrixHealth() : null;
          if (!last && !ord && !health) return null;
          return {
            last: last ? {
              letter: last.letter, dir: last.dir, reason: last.reason,
              answer: last.answer ?? null, ageMs: Date.now() - last.at,
            } : null,
            ordinal: ord ? {
              position: ord.position, reason: ord.reason,
              answer: ord.answer ?? null, ageMs: Date.now() - ord.at,
            } : null,
            matrix: health,
          };
        } catch { return null; }
      }),
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
          // VOICELIE.1 — REFUSALS ARE EVIDENCE OF AN ATTEMPT.
          //
          // This verdict used to derive its status from `emissions` alone,
          // which counts only ACCEPTED words. A cluster reaching for a word
          // every tick and being refused every tick therefore published
          // "nothing has attempted an emission since boot" — while the record
          // of the most recent refusal was read four lines above and published
          // in the very same object. Measured live at `no-best-word`, age 20s.
          //
          // That is the SYNCEMPTY lesson running backwards: not health inferred
          // from a missing failure, but ABSENCE inferred from a missing
          // success. The two states it conflated call for opposite responses —
          // "no sample yet, wait" versus "she is trying and cannot", and only
          // the second is a problem. `unmeasured` is now reserved for the case
          // where there is genuinely neither a success nor a refusal on record.
          const attempts = (cc && cc._emitAttempts) | 0;
          const rejects = (cc && cc._emitRejects) | 0;
          const rejectsByReason = (cc && cc._emitRejectsByReason)
            ? Object.assign(Object.create(null), cc._emitRejectsByReason) : null;
          let status = 'unmeasured';
          let reason = 'no emission has been attempted since boot — neither an'
            + ' accepted word nor a refusal is on record. This is NOT a claim'
            + ' that she cannot speak, only that no sample exists';
          if (emissions === 0 && (rejects > 0 || rej)) {
            // Named for what it is. She IS reaching; the reach is being refused.
            status = 'attempting-refused';
            const top = rejectsByReason
              ? Object.entries(rejectsByReason).sort((a, b) => b[1] - a[1])[0] : null;
            const ageS = rej && rej.ts ? Math.round((Date.now() - rej.ts) / 1000) : null;
            reason = `${rejects || 'at least 1'} emission attempt(s) refused and`
              + ` ZERO accepted since boot — she is reaching for words and not`
              + ` clearing the gate.`
              + (top ? ` Dominant cause: ${top[0]} (${top[1]}×).` : '')
              + (rej ? ` Most recent: ${rej.reason || 'unknown'}` : '')
              + (ageS !== null ? ` ${ageS}s ago.` : '');
          }
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
          // BUCKETPUB.1 — PUBLISH THE ONE FIELD THAT SETTLES "why no-best-word?".
          // `getTrainedCapability()` (js/brain/cluster.js:2470) already computes
          // `wordsBucketed` and `bucketSubjects` on every call and NOTHING
          // forwarded them, so the board could not answer the question two open
          // board items both hinge on:
          //   · GOTCHA.8 names this exact read as its discriminating test —
          //     `bucketSubjects === 1` means the unified array carries
          //     everything and the five per-subject `wordBucketWords_<subject>`
          //     reads contribute nothing.
          //   · EMITZERO.1 needs to tell "no candidate exists yet" (nothing
          //     bucketed) apart from "a winner was rejected by a floor".
          //     `emitDiagnostic.bestMean` reads 0 and `separability.cellSize`
          //     reads 0 — both consistent with an EMPTY bucket set, because
          //     `wordBucketCellSizeFor()` caches lazily and so reads 0 until
          //     something actually needs the geometry. `wordsBucketed` is what
          //     distinguishes them, and it was the one number not on screen.
          // ⚠ null, never 0, when the capability scan is unavailable — a zero
          // here would read as "nothing bucketed" and that is the very claim
          // this field exists to establish.
          const bucketCap = (cc && typeof cc.getTrainedCapability === 'function')
            ? (() => { try { return cc.getTrainedCapability(); } catch { return null; } })()
            : null;
          return {
            wordMotorSize: wm ? (wm.size | 0) : null,
            wordMotorEverFired: everFired,
            wordMotorPct: wm ? wm.pct : null,
            wordsBucketed: bucketCap && typeof bucketCap.wordsBucketed === 'number'
              ? bucketCap.wordsBucketed : null,
            bucketSubjects: bucketCap && typeof bucketCap.bucketSubjects === 'number'
              ? bucketCap.bucketSubjects : null,
            oracleHits,
            matrixHits,
            matrixDrivenPct,
            // GATEPURE — how many times the dictionary oracle was REFUSED
            // inside a gate probe. ⭐ This is the number that explains a pass-
            // rate drop: it is exactly how often the dictionary would have
            // answered for her on a test. A rising count beside falling
            // scores is the truth arriving, not a regression.
            oracleRefusedInGate: (cc && cc._oracleRefusedInGate) | 0,
            // VOICELIE.1 — the DENOMINATOR. `emitRejection` below is a single
            // last-value: it can say what went wrong most recently but never
            // how often, and "one stray refusal" and "refused continuously for
            // forty minutes" are opposite situations that it renders
            // identically. These three answer how often, and by which cause.
            emitAttempts: attempts,
            emitRejects: rejects,
            emitRejectsByReason: rejectsByReason,
            emitRejection: rej
              ? {
                  reason: rej.reason || 'unknown',
                  ageMs: Math.max(0, Date.now() - (rej.ts || Date.now())),
                }
              : null,
            // WORDSALAD.3 — the inquisitive drive, as a measurable event rather
            // than a claim. `gaps` counts the moments she reached for a word and
            // could not hold it above the signal floor; `asks` counts how many
            // of those turned into a real emitted question instead of silence.
            // A large gap count with zero asks means the interrogative weights
            // are not trained yet — which is a training fact worth seeing, not a
            // bug to hide. Gate and probe lanes never ask by design, so this
            // counts conversation only.
            // OWNWORDS.2 — how much of her speech is actually HERS.
            // ⛔ FIELD MEANING CORRECTED 2026-09-02: `retrieved` used to be
            // described as counting dictionary-cosine retrieval "only legal on
            // an untrained cortex now". There is no cortex where it is legal —
            // the retrieval lane was deleted for EVERY brain in every state on
            // 2026-09-01. The counter is kept deliberately as a permanent-zero
            // REGRESSION DETECTOR: any value other than 0 means a retrieval path
            // has come back, and it is visible instead of silent.
            // `honestSilence` counts the times her matrix produced nothing and
            // she was allowed to say nothing — the number that used to be hidden
            // because something else spoke in exactly those moments.
            words: {
              retrieved: (() => { try { return (this.cortexCluster?.innerVoice?.languageCortex?._dictRetrievalCount) | 0; } catch { return 0; } })(),
              honestSilence: (() => { try { return (this.cortexCluster?.innerVoice?.languageCortex?._honestSilenceCount) | 0; } catch { return 0; } })(),
            },
            curiosity: {
              gaps: (cc && cc._curiosityGapCount) | 0,
              asks: (cc && cc._curiosityAskCount) | 0,
              lastAsk: (cc && cc._lastCuriosityAsk)
                ? {
                    word: cc._lastCuriosityAsk.word,
                    text: String(cc._lastCuriosityAsk.text || '').slice(0, 120),
                    ageMs: Math.max(0, Date.now() - (cc._lastCuriosityAsk.ts || Date.now())),
                  }
                : null,
            },
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
      // single-word mode-collapse so recovery is visible without hand-
      // diffing /ws polls: sem→motor saturation, dominant-word share of
      // recent emissions, GW broadcast diversity. Computed once per state
      // broadcast (not per tick) so the checkSemMotorHealth sample is cheap.
      basinHealth: _lap('basinHealth', () => {
        try {
          const cc = this.cortexCluster;
          if (!cc) return null;
          const out = { saturated: null, semMotorMeanCos: null, semMotorRatio: null, dominantWord: null, dominantShare: null, gwUniqueRatio: null };
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
            out.dominantWord = topW;
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
  // ── DEFRATE.1 (2026-08-25, found by reading the board minutes after the
  // press) — ONE owner for "definitions learned per hour".
  //
  // ⛔ There were two consumers and only one was right. `_getConsciousnessState`
  // read `cortex._defLearnedTimestamps` and computed a real rolling rate;
  // `_getProfilingState` read **`this._defLearnedTimestamps`** — the BRAIN, not
  // the cortex — and the producer (`curriculum.js`, `cluster._defLearnedTimestamps`)
  // writes the CLUSTER. Nothing has ever written the brain-level field, so that
  // one could only ever report 0. Caught live: the console was teaching
  // definitions continuously while `profiling.throughput.defsLearnedPerHour`
  // read `0`. Same shape as `meanVoltage` and `separability` — a consumer
  // naming an owner that does not hold the value.
  //
  // ⚠ And it was not a RATE either: it returned `.length` of a ring capped at
  // 256, labelled "PerHour". Two defects on one line — a wrong owner and a
  // count wearing a rate's name.
  _defsLearnedPerHour() {
    const ts = this.cortexCluster && this.cortexCluster._defLearnedTimestamps;
    if (!Array.isArray(ts) || ts.length < 2) return 0;
    const now = Date.now();
    // Clamp to the last hour: the 256-entry ring fills in ~2 min during the
    // upfront definition seed, and reading oldest-to-newest across the whole
    // ring reported ~7,680/hr off a burst (the 114.19ek finding).
    const cutoff = now - 3_600_000;
    let firstIdx = ts.length - 1;
    for (let i = 0; i < ts.length; i++) {
      if (ts[i] >= cutoff) { firstIdx = i; break; }
    }
    const recent = ts.length - firstIdx;
    if (recent < 2) return 0;
    const dt = (ts[ts.length - 1] - ts[firstIdx]) / 1000;
    if (dt <= 0) return 0;
    return (recent / dt) * 3600;
  },

  _getProfilingState() {
    const now = Date.now();
    // ONESHOT.1 — see the note on `throughput.uplink`. `null` means the profile
    // has not run yet (it fires once at +150s), never "the loop is fine".
    const _cpuProfile = (this._cpuProfile && Array.isArray(this._cpuProfile.top))
      ? { at: this._cpuProfile.at, ageMs: Math.max(0, now - this._cpuProfile.at),
          sampledMs: this._cpuProfile.sampledMs, top: this._cpuProfile.top.slice(0, 14) }
      : null;
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
        // ⛔ LOOPMAX.1 — `max` WAS CUMULATIVE SINCE BOOT AND COULD ONLY GO UP.
        //
        // Caught because it read 18,505.3ms IDENTICALLY across two readings
        // while `serviced` went 52% -> 91%, lag 320ms -> 21ms and late/min
        // 29,048 -> 5,561. Everything else moved and it did not: that is the
        // tell. It was the BOOT pinning the loop to load ~5.4GB of weights,
        // and it sat there advertising a live 18-second stall on a brain
        // running at 26ms lag. It also contradicted the row beside it — the
        // freeze watchdog warns at 5,000ms, so 18.5s is 3.7x the bar, yet
        // `loop freezes` read `none`. Two fields on one card, both cannot be
        // right.
        //
        // ⭐ The histogram now ROLLS: it is reset after each read, so mean /
        // p50 / p99 / max all describe the window since the previous
        // broadcast — a number that can fall as well as rise.
        //
        // ⚠ The all-time peak is NOT discarded, it is BANKED and RENAMED.
        // Losing the worst stall the process ever saw would be its own
        // dishonesty; the fix is to stop it wearing the name of a live
        // reading. `sinceBootMaxMs` says exactly what it is.
        const _live = { meanMs: nsToMs(h.mean), p50Ms: nsToMs(h.percentile(50)), p99Ms: nsToMs(h.percentile(99)), maxMs: nsToMs(h.max) };
        if (_live.maxMs > (this._elDelayAllTimeMaxMs || 0)) this._elDelayAllTimeMaxMs = _live.maxMs;
        elDelay = {
          ..._live,
          sinceBootMaxMs: this._elDelayAllTimeMaxMs || 0,
          windowMs: Date.now() - (this._elDelayWindowStart || (this._elDelayWindowStart = Date.now())),
        };
        // Reset AFTER reading so the next window starts clean. ⚠ Guarded:
        // a Node build without `reset()` keeps the old cumulative behaviour
        // rather than throwing inside the state build — but then `windowMs`
        // grows without bound, which is the honest signal that it did not roll.
        try { if (typeof h.reset === 'function') { h.reset(); this._elDelayWindowStart = Date.now(); } } catch { /* keep cumulative */ }
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
        // LOOPSTARVE (2026-08-23) — the field the instant lag reading cannot
        // give you. `lateMsPerMin` is total loop lateness per minute and
        // `servicePct` the share of wall-clock actually serviced. Measured
        // live: 25-28s time-to-first-byte on a route that returns a cached
        // string, while eventLoopLagMs, the freeze watchdog and the
        // teach-chunk counter all read healthy — because each individual
        // stall was under every threshold and there were thousands of them.
        loopStarve: {
          lateMsPerMin: (this._loopStarve && this._loopStarve.lastLateMs) | 0,
          servicePct: this._loopStarve && typeof this._loopStarve.lastPct === 'number'
            ? this._loopStarve.lastPct : null,
        },
        // GPUTEACH step-0 — the bound-Hebbian TEACH LANE, every stage counted
        // so "0 teach/min" can never lie again: enqueued (ops asked), flushed
        // frames/ops (ops that actually left), capFlushes (mid-slab forced
        // flushes that used to be SILENT DROPS), suppressedStale (pattern-lane
        // refusals), rangesSent (the batched range verb).
        boundHebbian: {
          enqueued: this._boundHebbianEnqueued | 0,
          flushedFrames: this._boundHebbianFlushedFrames | 0,
          flushedOps: this._boundHebbianFlushedOps | 0,
          capFlushes: this._boundHebbianCapFlushes | 0,
          suppressedStale: this._hebbianSuppressedStale | 0,
          rangesSent: this._hebbianRangesSent | 0,
          maskedSent: this._hebbianMaskedSent | 0,
        },
        // PROPBOUND.2 — the BOUND-PROPAGATE lane, split by which protocol it
        // actually took. `emptyMirror` is the fallback-to-CPU count and is the
        // number RHYTHM3S.1 needs: it is EXPECTED between teach writes (an idle
        // cortex has no resident pattern and refusing is correct) and becomes a
        // finding only when it stays high DURING a teach era — a comparison the
        // board can only make once the number exists. ⛔ `noMirrorObject` is
        // split out because a MISSING mirror is a wiring fault and would
        // otherwise hide behind the empty case, which is normal and constant.
        boundPropagate: this._boundPropStats
          ? {
              native: this._boundPropStats.native | 0,
              emptyMirror: this._boundPropStats.emptyMirror | 0,
              noMirrorObject: this._boundPropStats.noMirrorObject | 0,
              browserEmptyPre: this._boundPropStats.browserEmptyPre | 0,
              lastEmptyName: this._boundPropStats.lastEmptyName || null,
              lastEmptyAgeMs: this._boundPropStats.lastEmptyAt
                ? Math.max(0, Date.now() - this._boundPropStats.lastEmptyAt) : null,
            }
          : null,
        // ⛔ ONESHOT.1 — ONE-SHOT MEASUREMENTS, AS FIELDS RATHER THAN LINES.
        // Both of these existed ONLY in a console line, and both were missed
        // for the same reason: the ring caps at 500 lines and the walk fills it
        // in seconds (measured at ~55 lines/sec once SCALEWALK made definitions
        // ~40× faster — a 500-line ring became a NINE SECOND window). A number
        // you had to be watching for is not something this board can answer
        // with later, which is the whole job of the board.
        //   uplink   — a small RING, because the rate is not uniform: a 2.79GB
        //              matrix averages lower than a 48MB one, so the size
        //              travels with every entry and cannot be read apart.
        //   cpuProfile — the RHYTHM3S self-profile's ranked self-time table,
        //              which is how "what is eating the loop?" gets answered by
        //              the VM instead of by inference.
        uplink: Array.isArray(this._uplinkStats) && this._uplinkStats.length
          ? this._uplinkStats.slice(-8) : null,
        // GATEGPU — gate probes relocated to the donor: gpu = graded on the
        // card, refused = lane busy/no donor (CPU graded instead), nullAck =
        // dispatch sent but no currents came back (CPU graded instead).
        gateProbes: {
          gpu: this._gateProbeGpu | 0,
          refused: this._gateProbeRefused | 0,
          nullAck: this._gateProbeNullAck | 0,
        },
        // LOOPNAME.8 — freeze episodes as counted by the WATCHDOG THREAD, not by
        // the loop. `eventLoopDelay.maxMs` above is a since-boot high-water mark
        // from `perf_hooks` with no count and no recency: one 58s reading tells
        // you neither how many times it happened nor whether it was at boot. The
        // watchdog's numbers come from a thread that is still running during a
        // stall, so they exist even for a freeze the main loop never reported.
        // Reads straight out of the shared buffer — no message port, so this is
        // still truthful in a state snapshot built right after a recovery.
        loopFreeze: (() => {
          try {
            const s = this._loopWatchdogSlots;
            if (!s) return null;   // watchdog failed to start; say so by absence
            return { episodes: Number(Atomics.load(s, 2)), worstMs: Number(Atomics.load(s, 3)) };
          } catch { return null; }
        })(),
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
        // DEFRATE.1 — was `this._defLearnedTimestamps.length`: the wrong owner
        // (brain, never written) AND a count wearing a rate's name.
        defsLearnedPerHour: this._defsLearnedPerHour(),
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
      // ONESHOT.1 — the self-profile's ranked table, published so "what is
      // eating the loop?" survives the console ring.
      out.cpuProfile = _cpuProfile;
      // PROFREARM.1 — the FIRST sample, kept so early-vs-steady is comparable.
      // ⚠ The first one is taken at +150s, which is NOT "the walk settled": the
      // canonical upload is often still running and every row is being
      // normalised for the first time. Read it as the boot picture, and read
      // `cpuProfile` (the latest) for how she actually runs.
      out.cpuProfileFirst = (this._cpuProfileFirst && Array.isArray(this._cpuProfileFirst.top))
        ? { at: this._cpuProfileFirst.at, sampledMs: this._cpuProfileFirst.sampledMs,
            top: this._cpuProfileFirst.top.slice(0, 6) }
        : null;
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

    // ⭐ `READBACKEYE.1` — THE CHECKPOINT READBACK, MADE READABLE.
    // `SHADOWCOST.3` gave the donor a `readback_matrix_values` opcode so the
    // checkpoint finally holds the weights the GPU trained, and then published
    // NOTHING about whether it runs. On an hourly cadence the console line is
    // gone long before anyone asks (the ring serves the newest 500 of 2,000),
    // so with parity reading DRIFTING the one question that mattered — did the
    // hourly pull fire? — could not be answered from outside the box at all.
    // ⚠ `lastOkAgeMs` is the load-bearing field, not `lastOkAt`. MIRRORID.5's
    // rule: a persistent field with no freshness beside it gets quoted long
    // after it stopped being true, so the age travels WITH the value and a
    // never-run readback reads `null`, never a reassuring zero.
    try {
      const ok = this._lastReadbackOk || null;
      const bad = this._lastReadbackRefusal || null;
      const st = this._readbackStats || null;
      const gapMs = Number.isFinite(+process.env.DREAM_READBACK_MIN_GAP_MS)
        ? Math.max(0, +process.env.DREAM_READBACK_MIN_GAP_MS) : 3_600_000;
      out.readback = {
        // null (not 0) until one has actually completed — "never run" and
        // "ran just now" must not share a rendering.
        lastOkAgeMs: ok && ok.at ? Math.max(0, now - ok.at) : null,
        lastOkSecs: ok ? r2(ok.secs) : null,
        lastOkMB: ok ? r1(ok.bytes / 1048576) : null,
        lastOkMatrices: ok ? (ok.matrices | 0) : null,
        lastOkTrigger: ok ? String(ok.reason || '').slice(0, 60) : null,
        okCount: st ? (st.ok | 0) : 0,
        secsMax: st && st.secsMax ? r2(st.secsMax) : null,
        // The last NON-ROUTINE refusal, with its age — a stale reason with no
        // age is exactly the field CANSPEAK.8 had to be rebuilt to stop
        // reporting a months-old rejection as the current state.
        lastRefusal: bad ? String(bad.reason || '').slice(0, 120) : null,
        lastRefusalAgeMs: bad && bad.at ? Math.max(0, now - bad.at) : null,
        // Every reason counted, routine ones included, so "11 gap refusals per
        // hour" reads as the healthy cadence it is instead of looking like a
        // fault beside a single scary lastRefusal string.
        refusals: st && st.refusals ? { ...st.refusals } : {},
        gapMs,
        // ⛔ The verdict is DERIVED, never a stored flag: a flag set at boot
        // survives the thing it described. `overdue` is the field that says the
        // cadence has stopped without anyone having to do the subtraction.
        overdue: ok && ok.at ? (now - ok.at) > (gapMs * 2) : null,
      };
    } catch (err) { out.readback = { error: err.message }; }

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
      // ⚠ Φ CAN PIN AT ITS FLOOR AND `phiProxy` ALONE CANNOT SAY SO.
      // computePhi() is binary entropy of the spiking PROPORTION: it peaks
      // at p=0.5 and collapses as firing gets sparse, and H(0.01)=0.081 is
      // below the 0.1 floor Ψ applies. A pinned Φ reads as a healthy 0.1
      // forever. These two fields are what let the board answer "is Φ
      // actually modulating anything?" as a READ instead of an inference.
      //   phiState: 'live' | 'floored' | 'error' | 'unmeasured'
      phiRaw: (typeof this.phiRaw === 'number') ? this.phiRaw : null,
      phiState: this.phiState || 'unmeasured',
      // PHISCALE.1 — the ADAPTIVE reference Φ̂ is divided by, and the resulting
      // normalised value. Published together so the chain is legible as
      // raw → ref → normalised; a normaliser that only lived in the function
      // computing it would be a hidden number deciding a headline quantity.
      // ⚠ `phiScaleRef` climbing while `phiNorm` stays near 1.0 means the scale
      // is chasing her, not measuring her — worth seeing.
      phiScaleRef: (typeof this.phiScaleRef === 'number') ? this.phiScaleRef : null,
      phiNorm: (typeof this.phiNorm === 'number') ? this.phiNorm : null,
      // ── ENDO — the endocrine layer + the glands that drive it.
      // Rendered BY NAME, so every field below needs its row; a field with
      // no row ships dark no matter how correct it is.
      // ⛔ `null` here means the layer is ABSENT, which is a different claim
      // from "present and resting". Resting reports chemicals with real
      // levels; absent reports nothing at all.
      endocrine: this._endocrineSnapshot ? {
        chemicals: this._endocrineSnapshot.chemicals,
        chronicLoad: this._endocrineSnapshot.chronicLoad,
        stress: this._endocrineSnapshot.stress,
        // ⛔ BOARDPARITY.1 — THESE THREE WERE PRODUCED, READ BY THE PANEL, AND
        // NEVER FORWARDED. The same producer/consumer name failure as
        // `meanVoltage`, and it did not read as an empty row: the renderer
        // defaults `allostatic` to `{}`, so the load row rendered a healthy
        // `0.000/0.6 (restore α 0.0000)` for the one quantity that says whether
        // adversity is accumulating — a reassuring zero for a live number. The
        // cycle row was gated on the field's presence and so never drew at all
        // (phase, cycles elapsed, and the progesterone-withdrawal derivative
        // all invisible), and `puberty` rendered the literal `? (age ?)` with
        // its amber `unknown` branch unreachable — the branch that exists
        // specifically so an unread age cannot read as childhood.
        puberty: this._endocrineSnapshot.puberty,
        cycle: this._endocrineSnapshot.cycle,
        allostatic: this._endocrineSnapshot.allostatic,
        scheduledCount: this._endocrineSnapshot.scheduledCount,
        contributions: this._endocrineSnapshot.contributions,
        counters: this._endocrineSnapshot.counters,
        // Whether the NUCLEI were consulted this tick. Distinguishes "the
        // glands were quiet" from "the glands were never asked".
        glandsConsulted: this._endocrineSnapshot.glandsConsulted === true,
        glands: this._endocrineSnapshot.glands || null,
        nuclei: (this.glands && typeof this.glands.snapshot === 'function')
          ? this.glands.snapshot().nuclei : null,
        lastError: this._endocrineErr || null,
      } : null,
      // ── INTRO — the introspective drive, rendered BY NAME.
      // ⛔ `criteria` is the honest half: INTRO.10 demanded falsifiable
      // measures agreed BEFORE the build, and these are them — kinds
      // actually produced, repeats counted, the inward/outward split as
      // observed counts. A drive that has produced nothing reads
      // `unmeasured` on every one of them rather than a reassuring zero.
      introspection: (this.introspection && typeof this.introspection.snapshot === 'function')
        ? (() => {
            const s = this.introspection.snapshot();
            return {
              live: s.live,
              counters: s.counters,
              // Whether the rumination BOUND is currently holding her back —
              // visible, so "rumination is bounded" is a field read.
              rumination: s.rumination,
              criteria: s.criteria,
              lastArmed: this._lastIntrospectiveGap || null,
              // ⛔ Whether the SOURCE has anything in it. A starved source
              // must name itself — otherwise "no questions" reads as "she
              // just is not introspective right now" when the truth is that
              // nothing can reach her. That is the exact way the first cut
              // of this feature would have hidden.
              source: this._introEpisodeStats || { candidates: 0, state: 'unmeasured', at: null },
              lastError: this._introspectionErr || null,
            };
          })()
        : null,
      // SPEAK.2/9-obs — speech-pipeline health. Per-subject word_motor basin
      // separability (weight-mass distribution: uniform = separable; from the
      // SPEAK.2 renorm probe) + frozen cellSize (SPEAK.1) + the reject-to-silence
      // coherence-floor stats (SPEAK.9) + best-of-N rerank stats. Lets separability
      // regression show at G4 instead of surfacing as G9 word salad.
      speechHealth: (() => {
        try {
          // ── DORMANT.4 (2026-08-25) — SEPARABILITY HAD NO PRODUCER AT ALL ────
          //
          // This block read `cortex.wordMotorWeightMaxAbs_<subject>` for six
          // per-subject bands. **Nothing anywhere writes those fields** — not a
          // rename, a consumer with no producer — so `separability` has always
          // serialised as `{}`. That matters more than an empty dashboard cell:
          // this is the ONLY instrument that measures the emission margin
          // directly, i.e. the exact quantity the whole word-salad diagnosis
          // turns on, and `voice.emitRejection: "below-signal-floor"` is a
          // margin symptom we have been reasoning about without ever measuring.
          //
          // The six per-subject bands are also gone: WMB UNIFY collapsed them
          // into ONE global `word_motor` band with one bucket per word. So it
          // is computed here, from the unified matrix, as a real number.
          //
          // ⛔ SAMPLED AND CACHED ON PURPOSE. This runs on the 10fps broadcast
          // build; a full scan of a 720k-row matrix on that path is exactly the
          // kind of unpriced per-tick cost that produced the loop-starvation
          // work. 4,096 evenly-strided values, recomputed at most every 5s.
          const subj = ['ela', 'math', 'sci', 'soc', 'art', 'life'];
          const sep = {};
          const _now = Date.now();
          if (!this._sepCache || (_now - this._sepCache.ts) > 5000) {
            let unified = null;
            try {
              const xp = cortex && cortex.crossProjections;
              const mx = xp && (xp.sem_to_word_motor || xp.sem_to_motor);
              if (mx && mx.values && mx.values.length > 0) {
                const v = mx.values;
                const SAMPLE = 4096;
                const stride = Math.max(1, Math.floor(v.length / SAMPLE));
                let maxAbs = 0, sumAbs = 0, n = 0, nz = 0;
                for (let i = 0; i < v.length; i += stride) {
                  const a = Math.abs(v[i]);
                  if (a > maxAbs) maxAbs = a;
                  sumAbs += a; n++;
                  if (a > 1e-9) nz++;
                }
                const meanAbs = n > 0 ? sumAbs / n : 0;
                unified = {
                  maxAbs: Number(maxAbs.toFixed(4)),
                  meanAbs: Number(meanAbs.toFixed(4)),
                  // The margin number. A LOW ratio means every word bucket
                  // carries similar mass — nothing stands out, the argmax is
                  // deciding on noise, and that is word salad measured rather
                  // than inferred. A high ratio means real discrimination.
                  ratio: meanAbs > 0 ? Number((maxAbs / meanAbs).toFixed(2)) : 0,
                  nonZeroPct: n > 0 ? Number((100 * nz / n).toFixed(1)) : 0,
                  sampled: n,
                  cellSize: (cortex && cortex.wordBucketCellSize_unified) || 0,
                };
              }
            } catch { unified = null; }
            this._sepCache = { ts: _now, unified };
          }
          if (this._sepCache && this._sepCache.unified) sep.unified = this._sepCache.unified;
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
      // DEFRATE.1 — the 114.19ek rolling-1hr computation now lives in ONE
      // place (`_defsLearnedPerHour`) and both consumers call it. This copy
      // was the CORRECT one; the profiling copy read the wrong owner and could
      // only ever report 0, which is precisely what two divergent copies of a
      // "simple" derivation buy you.
      defsLearnedPerHour: this._defsLearnedPerHour(),
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

module.exports = { SERVER_STATE_MIXIN, GRADE_LADDER, GRADE_AGE, normalizeGradeKey };
