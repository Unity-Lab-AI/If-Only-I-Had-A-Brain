// Cluster Hebbian mixin — extracted from cluster.js per the per-module
// split (see js/brain/cluster/README.md). Attached to NeuronCluster.prototype
// via Object.assign at cluster.js entry-point bottom.
//
// Methods in this mixin:
//   _crossRegionHebbian(lr, opts)     — cross-projection Hebbian iterator with
//                                       per-projection kScales build (P2.3)
//   initGpu()                          — GPU upload of all cross-projections +
//                                       intra-synapses matrix for fast-path
//   intraSynapsesHebbian(pre, post, lr) — intra-cluster recurrent Hebbian
//                                          (Oja rule, GPU shadow dispatch)
//   intraSynapsesBcm(pre, post, lr, α) — optional BCM sliding-threshold pass
//   _crossRegionAntiHebbian(lr, opts) — contrastive depression across
//                                       cross-projections (anti-Hebbian)
//   intraSynapsesAntiHebbian(pre, post, lr) — contrastive depression on the
//                                              intra-cluster recurrent matrix
//
// All methods reference cluster state via `this.` — fully prototype-chain
// compatible. They access this.crossProjections, this.synapses,
// this._gpuProxy, this._sparsePool, this.regions, this.lastSpikes etc.

// GPUVERB.2 (2026-08-21) — range compression for the hebbian_ranges GPU verb
// (donor v0.3.18+). Teach patterns are group-tiled writes, so their active
// sets collapse to a handful of [start, len] runs — the ~60-byte frame the
// donor expands back into the IDENTICAL index sets. Both helpers return null
// when the pattern won't compress (too many runs / too many total indices):
// null = the caller keeps its full CPU pass, because the donor's own expander
// SILENTLY SKIPS oversized ranges (2M cap per range and per side) and a
// truncated pattern trained on the GPU is wrong math with no loud failure —
// refusing to dispatch is the only honest move past the cap.
// ⭐ `SHADOWCOST.5` — THE RUN CAP WAS OURS, NOT THE DONOR'S.
//
// The live counter that `SHADOWCOST.1` woke up reported `rangesNullPost` on
// 24.2% of intra calls, and every one of those became a FULL CPU pass — 176
// full passes against 109 sampled shadows, i.e. most of the CPU time in the
// heaviest op was NOT the shadow cadence at all. So the cap got read against
// the donor's own source instead of assumed.
//
// `Work::HebbianRanges` in donor-app/src/donor.rs expands ranges with:
//     if len == 0 || len > 2_000_000 || v.len() + len > 2_000_000 { continue; }
// That is a cap on TOTAL EXPANDED INDICES and on any single range. There is no
// cap on the NUMBER of ranges — `pre_ranges: Vec<[u32; 2]>` is an unbounded Vec.
// ⛔⛔ THE SENTENCE DIRECTLY ABOVE IS FALSE, AND IT COST NINE DAYS OF SILENT
//   TRAINING LOSS. It is kept, struck, because the ERROR is the reusable part.
//   `donor.rs` bounds this verb at TWO sites that bound DIFFERENT things:
//     donor.rs:912  (the EXECUTOR)        — total expanded indices <= 2_000_000
//     donor.rs:1249 (the MESSAGE HANDLER) — reps <= 1000
//                                         && pre_ranges.len()  <= 16
//                                         && post_ranges.len() <= 16
//   Only the executor was read. The Vec TYPE is unbounded; the ACCEPTANCE PATH
//   is not, and over 16 ranges the `if` simply does not push the work — no ack,
//   because this verb is fire-and-forget, so nothing anywhere reports a failure.
//   ⭐ And the contract was never in doubt: the build entry written the day this
//   opcode shipped records it verbatim — "donor.rs decode with defensive caps
//   (reps <=1000, <=16 ranges, <=2M expansion)". Re-deriving a peer contract
//   from one code site instead of reading the ledger is what put "no cap at all"
//   into five documents at once.
//   ⛔ WHY IT WAS SILENT ON THIS SIDE TOO: `gpuSparseHebbianRanges` returns true
//   when the frame LEAVES THE SOCKET, the caller stores that in `_gpuCarried`,
//   and the shadow rule below then runs the CPU pass only every 5th call. So an
//   oversized frame is dropped by the donor AND skipped by the CPU — four of
//   every five of those Oja updates landed nowhere. The comment at the dispatch
//   site said "nothing is ever dropped"; it was wrong for every pattern > 16.
// So `RANGE_MAX_TOTAL` mirrors a real donor limit and must stay exactly where it
// is (past it the donor SILENTLY SKIPS ranges and trains truncated math with no
// loud failure — the reason refusing to dispatch is the only honest move). 512
// runs was a wire-size judgement with nothing on the other side enforcing it.
//
// RE-PRICE before raising it, MEASURED not estimated: a full frame carrying
// 8,192 runs on BOTH sides serialises to 208.1 KB = 5.46 ms of wire at the
// measured 39 MB/s donor uplink (512 runs = 13.1 KB / 0.34 ms), and it replaces
// a CPU pass measured at 123.8 ms (cpuMs 35,288 over 285 passes) that also
// spends the event loop's backlog on every chunk yield. 23x cheaper. Donor
// work is unchanged either way because the expanded index count is still capped
// at 2M. Raising this cannot corrupt math and cannot cost more than it saves;
// worst case it changes nothing, which is what it does if the refusals turn out
// to be empty patterns rather than scattered ones — `rangeFailReason` below is
// what tells the two apart, and it is now recorded rather than reasoned about.
// ⚠ `typeof` guard, not `process?.env` — optional chaining does NOT shield an
//   UNDECLARED identifier, and this module is bundled for the browser where
//   `process` does not exist at all: `process?.env` would throw ReferenceError
//   at module load and take the whole bundle with it.
// ⭐ `SHADOWCOST.7` — 8,192 → 65,536, and this time the cap is a READ, not a
//   judgement, because `SHADOWCOST.6` made the telemetry report true run counts
//   instead of saturating. Live at 9.1 min on the 8,192 build:
//     rangesRunsOkMax  8,037  — the largest ACCEPTED pattern, crowding the cap
//     rangesRunsMax   51,330  — the true run count of the worst refusal
//     cpuFull 30 passes = 24,181 ms   vs   cpuShadow 160 passes = 2,850 ms
//   A refusal pass costs 806 ms against a shadow's 17.8 ms — 45x — because
//   refusals land on exactly the large scattered patterns that are expensive to
//   walk. Those 30 passes are 24.2 s of the 27.0 s of total CPU in the walk's
//   heaviest op, so clearing them takes `cpuMs` from 4.94% of the boot to ~0.5%.
//
//   RE-PRICE, measured on the live worst case rather than estimated: the actual
//   51,330-run pattern serialises both sides to 1.01 MB = 27 ms at the measured
//   39 MB/s uplink, replacing an 806 ms CPU pass — 30x cheaper. (The theoretical
//   ceiling, a full 65,536 runs of 8-digit indices, is ~2.1 MB = ~54 ms; real
//   patterns come in under it because their indices are smaller.) They fire
//   3.3 times a minute, so the added uplink is ~0.12 MB/s against 39.
//   65,536 clears the observed 51,330 worst case with headroom. The binding
//   constraint is WIRE BYTES (~16 per range, both sides), so if patterns grow
//   again, recompute from `rangesRunsMax` rather than doubling on instinct.
//   ⛔ `RANGE_MAX_TOTAL` is NOT touched and must not be: it mirrors the donor's
//   real 2M expansion limit, and two refusals in that same window were already
//   `rangesFail_total` — those are correct refusals and have to stay refused.
// ⛔ `READBACKEYE.3` (2026-08-30) — 65,536 → 16. THIS IS NOT A TUNING CHOICE.
//   16 is the donor's own acceptance limit (donor.rs:1249). Every value above it
//   ships frames the donor discards in silence while this side records them as
//   GPU-carried, which skips the CPU pass 4 times in 5. Matching the peer's
//   contract is the only setting under which "nothing is ever dropped" is true.
//   ⭐ `DREAM_RANGE_MAX_RUNS` still overrides, and that is the upgrade path: when
//   a donor ships a raised handler cap, set this to match THAT donor's number.
//   Do not raise it to buy speed — above 16 the speed is bought with her weights.
//
//   RE-PRICE, stated with its own uncertainty because the honest answer is a
//   RANGE and the instrument that would narrow it does not exist yet:
//     - live at 115.6 min, the ranges path is `gpu` 6,278 against `boundGpu`
//       60,524, so it is 9.4% of intra dispatches; the bound path is untouched
//       by this (different opcode, no range-count guard).
//     - mean full CPU pass = cpuFullMs 1,576,315 / cpuFull 7,128 = 221.1 ms.
//     - WORST case (no pattern compresses to <=16 runs): all 6,278 become full
//       CPU passes, +1,388 s on a 6,936 s boot = +20% of wall clock, taking
//       cpuMs from 23.9% to ~43.9%. In that world we were ALSO losing 4/5 of
//       every one of those updates, so the 20% is a bill, not a regression.
//     - BEST case (every accepted pattern already fits in 16 runs): zero change
//       to cost and nothing was ever lost.
//   ⚠ WHICH ONE IS TRUE IS UNKNOWN, and `rangesRunsOkMax` cannot say — it is a
//   MAX, and a max cannot price a cap (the third time that has bitten in this
//   file). The bucket counter added below is what answers it on the next press;
//   until then no claim is made about how much was lost. Correctness first: we
//   do not trade her training for wall clock while the number is unknown.
const RANGE_MAX_RUNS = Math.max(1, (typeof process !== 'undefined' && process.env && +process.env.DREAM_RANGE_MAX_RUNS) || 16);
const RANGE_MAX_TOTAL = 2_000_000;
// Why the LAST range-compression refusal happened. Module-scoped because the
// caller reads it on the very next line — the helpers return null either way and
// a signature change would touch every call site to carry one diagnostic word.
const rangeFail = { reason: null, runs: 0, total: 0 };
function denseActiveRanges(arr) {
  rangeFail.reason = null; rangeFail.runs = 0; rangeFail.total = 0;
  const out = [];
  let total = 0;
  let runStart = -1;
  const n = arr.length;
  for (let i = 0; i < n; i++) {
    if (arr[i]) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      const len = i - runStart;
      total += len;
      if (out.length >= RANGE_MAX_RUNS) {
        // SHADOWCOST.6 — same reason as indexRanges: finish the scan counting
        // runs only, so the recorded number is the TRUE one and not the cap.
        // This loop was already walking the full dense array; the remainder is
        // the cheap part of a call that is about to pay a full CPU Oja pass.
        rangeFail.reason = 'runs';
        let runs = out.length + 1;
        let inRun = false;
        for (let k = i + 1; k < n; k++) {
          if (arr[k]) { if (!inRun) { runs++; inRun = true; } total++; }
          else inRun = false;
        }
        rangeFail.runs = runs; rangeFail.total = total;
        return null;
      }
      if (total > RANGE_MAX_TOTAL) { rangeFail.reason = 'total'; rangeFail.runs = out.length; rangeFail.total = total; return null; }
      out.push([runStart, len]);
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    const len = n - runStart;
    total += len;
    if (out.length >= RANGE_MAX_RUNS) { rangeFail.reason = 'runs'; rangeFail.runs = out.length; rangeFail.total = total; return null; }
    if (total > RANGE_MAX_TOTAL) { rangeFail.reason = 'total'; rangeFail.runs = out.length; rangeFail.total = total; return null; }
    out.push([runStart, len]);
  }
  rangeFail.runs = out.length; rangeFail.total = total;
  if (!out.length) { rangeFail.reason = 'empty'; return null; }
  return out;
}
function indexRanges(sortedIdx) {
  rangeFail.reason = null; rangeFail.runs = 0; rangeFail.total = 0;
  // `empty` and `runs` are the two refusals that look identical from the caller
  // and cost wildly different amounts: an empty pattern makes the "full CPU
  // pass" a no-op, while a scattered one makes it the most expensive thing in
  // the walk. Naming them is the difference between knowing there is a problem
  // and knowing there is nothing to fix.
  if (!sortedIdx || !sortedIdx.length) { rangeFail.reason = 'empty'; return null; }
  rangeFail.total = sortedIdx.length;
  if (sortedIdx.length > RANGE_MAX_TOTAL) { rangeFail.reason = 'total'; return null; }
  const out = [];
  let runStart = sortedIdx[0];
  let prev = sortedIdx[0];
  for (let i = 1; i < sortedIdx.length; i++) {
    const v = sortedIdx[i];
    if (v === prev + 1) { prev = v; continue; }
    if (out.length >= RANGE_MAX_RUNS) {
      // ⭐ `SHADOWCOST.6` — COUNT PAST THE CAP BEFORE REFUSING. Returning here
      //   records `runs = RANGE_MAX_RUNS` on every refusal, so the telemetry
      //   saturates at the cap and reports "at least this many" forever — which
      //   answers "did the raise help?" with the one number that cannot answer
      //   it. Finish counting runs WITHOUT building them (no push, no
      //   allocation) so the true run count is recorded and the next cap choice
      //   is a read. The caller is about to spend >100 ms on a full CPU pass;
      //   walking the remaining indices costs microseconds by comparison.
      rangeFail.reason = 'runs';
      // +2, not +1: `out` holds the COMPLETED runs, the run [runStart..prev] has
      // not been pushed yet, and `v` opens another. Counting only one of those
      // two under-reports by exactly one on every refusal.
      let runs = out.length + 2;
      let p = v;
      for (let k = i + 1; k < sortedIdx.length; k++) {
        const w = sortedIdx[k];
        if (w !== p + 1) runs++;
        p = w;
      }
      rangeFail.runs = runs;
      return null;
    }
    out.push([runStart, prev - runStart + 1]);
    runStart = v; prev = v;
  }
  if (out.length >= RANGE_MAX_RUNS) { rangeFail.reason = 'runs'; rangeFail.runs = out.length + 1; return null; }
  out.push([runStart, prev - runStart + 1]);
  rangeFail.runs = out.length;
  return out;
}
export { denseActiveRanges, indexRanges, rangeFail, RANGE_MAX_RUNS, RANGE_MAX_TOTAL };

export const CLUSTER_HEBBIAN_MIXIN = {
  /**
   * MAY THIS BRAIN TEACH RIGHT NOW? (2026-08-14)
   *
   * One predicate, asked by every teach entry point, answering the question
   * the compute layer actually cares about: is this brain's declared substrate
   * present. For a GPU-required brain that is `_gpuProxyReady` - the WEIGHTS
   * ARE UPLOADED - not merely "a socket is open". Those are different
   * questions, and confusing them is what let a connected-but-not-yet-uploaded
   * donor pass the walk gate while the math still landed on the host CPU.
   *
   * Returns false instead of waiting, so a chat reply with no donor simply
   * does not LEARN rather than hanging. Pausing the WALK is the curriculum
   * gate's job; refusing the MATH is this one's. Both enforce the same rule,
   * and this one is the law: nothing downstream can teach around it.
   */
  _teachSubstrateReady(who) {
    if (!this.requireGpuSubstrate) return true;   // browser brain: CPU IS its substrate
    // ALIVE, not uploaded-once (2026-08-15). `_gpuProxyReady` is written false
    // in exactly one place - the constructor - and true when initGpu's upload
    // completes. NOTHING clears it when the donor dies, so after a donor kill
    // it kept answering "substrate ready" and teaching continued against a
    // corpse (caught live: donor killed, GPU-needed popup showing, teach events
    // still climbing). The substrate is ready only while the weights are
    // uploaded AND the socket carrying them is open.
    const _sockLive = !!(this._brain && this._brain._gpuClient && this._brain._gpuClient.readyState === 1);
    if (this._gpuProxyReady === true && _sockLive) {
      if (this._substrateDownSince) {
        console.log(`[Cluster ${this.name}] compute substrate BACK after ${((Date.now() - this._substrateDownSince) / 1000).toFixed(0)}s (${this._substrateRefusals | 0} teach calls refused while it was gone) - teaching resumes.`);
        this._substrateDownSince = null;
        this._substrateRefusals = 0;
      }
      return true;
    }
    if (!this._substrateDownSince) {
      this._substrateDownSince = Date.now();
      this._substrateRefusals = 0;
      console.warn(`[Cluster ${this.name}] NO COMPUTE SUBSTRATE - teach REFUSED (first refusal from ${who}). Weights are not uploaded to a donor GPU, and this brain has no CPU teach path: training does not happen without a donor, by design.`);
    }
    this._substrateRefusals = (this._substrateRefusals | 0) + 1;
    return false;
  },

  async _crossRegionHebbian(lr, opts = {}) {
    if (!this.crossProjections) return;
    if (!this._teachSubstrateReady('_crossRegionHebbian')) return;
    // One-shot diagnostic — fires only the FIRST time this method is
    // called after cluster init. Reports which path every projection
    // is taking so a hang in the first Phase 1 iter has attributable
    // provenance instead of silent stdout.
    if (!this._crossRegionHebbianDiagLogged) {
      this._crossRegionHebbianDiagLogged = true;
      try {
        const gpuReady = !!this._gpuProxyReady;
        const hasProxy = !!(this._gpuProxy && this._gpuProxy.hebbianBound);
        const poolReady = !!(this._sparsePool && this._sparsePool.ready);
        const paths = [];
        for (const [name, proj] of Object.entries(this.crossProjections)) {
          const gpuFast = !!(proj._gpuBound && gpuReady && hasProxy);
          const cpuAlive = !!(proj.values && proj.colIdx && proj.rowPtr);
          paths.push(`${name}:${gpuFast ? 'GPU-fast' : (cpuAlive ? 'CPU' : 'NULL')}`);
        }
        console.log(`[Cluster ${this.name}] _crossRegionHebbian first-call diag — gpuReady=${gpuReady} proxy=${hasProxy} pool=${poolReady} · paths: ${paths.join(' ')}`);
      } catch { /* non-fatal */ }
    }
    // opts.skipCpuWhitelist — when true, skip the sync CPU Hebbian on
    // probe-critical projections (letter_to_phon + letter_to_motor).
    // Curriculum teach loops set this for all reps except the final
    // rep so the CPU arrays only get their expensive update once per
    // phase. GPU fire-and-forget Hebbian still runs every rep so GPU
    // weights stay current for runtime propagation. Probes run AFTER
    // teach and read CPU arrays populated by the final-rep CPU pass.
    // Cuts ~80% of CPU Hebbian wall-clock during teach (main
    // bottleneck at 301K cortex scale where letter_to_phon + letter_to_motor
    // are ~14.9 M nnz each and hebbianUpdate iterates all nnz per call).
    // Caller can skip via explicit opts OR by setting the cluster-level
    // flag `_teachIntermediateRep` (toggled by teach loops for all reps
    // except the final one). Either gate skips the sync CPU whitelist.
    const skipCpuWhitelist = opts.skipCpuWhitelist === true || this._teachIntermediateRep === true;
    // iter22-D — projection whitelist scoping. Operator caught
    // (verbatim 2026-05-05): TALK 26/26 → 0/10 in Math-K because
    // _teachQABinding's sem(question)+motor(answer-letter) write fired
    // _crossRegionHebbian which iterates ALL projections, including
    // letter_to_motor where the LETTER region was silent (zero in
    // lastSpikes). Oja's `Δw = η·post·(pre - post·w)` with pre=0 →
    // `Δw = -η·post²·w` decays letter_to_motor weights wherever motor
    // fired the answer-letter. Across 1000+ Q-A pairs × 12 reps that
    // crushes letter→motor identity that the alphabet-naming phase
    // had carved cleanly. opts.projectionsWhitelist (Set or Array of
    // projection names) restricts the iterator so unrelated projections
    // don't get spurious decay. Callers that train sem→motor pass
    // {projectionsWhitelist: ['sem_to_motor', 'sem_to_word_motor']}
    // so letter_to_motor / letter_to_phon / visual_to_letter etc. stay
    // untouched.
    const wl = opts.projectionsWhitelist;
    const whitelistSet = wl
      ? (wl instanceof Set ? wl : new Set(wl))
      : null;
    // TW S1 — PER-CALL spike-scan cache. The projection loop below asked
    // `regionSpikesActive` for src+dst on every projection — up to 32 full
    // region scans per call over the same ~8 unique regions (each scan is
    // O(region len) + a vec.fill over up to hundreds of thousands of rows).
    // Spikes do not change between projections within one call's intent, so
    // scan each unique region ONCE per call and reuse. A snapshot-at-entry is
    // also SAFER than the old mid-loop rescans: the chunked Oja awaits between
    // slices, and a concurrent path re-filling the shared scratch mid-loop was
    // exactly the hazard _ojaUpdateChunked's snapshot comment documents.
    // 12M cut round 3 — CROSS-CALL scan reuse. When the caller guarantees the
    // spike patterns are unchanged across consecutive calls (the letters-major
    // teach loop: write each letter's patterns ONCE, then rep the Hebbian), it
    // passes `opts.spkCacheStamp`. The scan map is reused only while (a) the
    // word matches AND (b) the cluster's regionSpikesActive GENERATION counter
    // is exactly where we left it — any foreign scan (chat teach, emission,
    // another phase) refills the shared per-region scratch and would clobber
    // our references, so it invalidates the cache and we rescan. Without a
    // word: per-call cache, exactly the old TW S1 behavior.
    let _spkCache;
    const _spkTok = opts.spkCacheStamp;
    if (_spkTok !== undefined
        && this._spkTokCache
        && this._spkTokCache.word === _spkTok
        && this._spkTokCache.gen === (this._regionScratchGen | 0)) {
      _spkCache = this._spkTokCache.map;
    } else {
      _spkCache = new Map();
      this._spkTokCache = (_spkTok !== undefined) ? { word: _spkTok, map: _spkCache, gen: -1 } : null;
    }
    const _spk = (regionName) => {
      let e = _spkCache.get(regionName);
      if (!e) {
        e = this.regionSpikesActive(regionName);
        _spkCache.set(regionName, e);
        // Stamp validity AT FILL TIME (not end-of-call): the next same-word
        // call reuses the map iff the generation still equals the counter
        // after our LAST fill — a foreign scan during any of this call's
        // awaits advances the counter and forces a rescan. (A foreign scan
        // landing BETWEEN two of our fills is the same in-call exposure the
        // per-call cache always had — not widened by reuse.)
        if (this._spkTokCache && this._spkTokCache.map === _spkCache) {
          this._spkTokCache.gen = this._regionScratchGen | 0;
        }
      }
      return e;
    };
    for (const [name, proj] of Object.entries(this.crossProjections)) {
      if (whitelistSet && !whitelistSet.has(name)) continue;
      const idx = name.indexOf('_to_');
      if (idx < 0) continue;
      const src = name.slice(0, idx);
      const dst = name.slice(idx + 4);
      if (!this.regions[src] || !this.regions[dst]) continue;

      // ─── sem→motor saturation prevention (Option B, Gee 2026-06-27) ───
      // The motor-emission cross-projections collapse under Hebbian over-
      // strengthening: sem→motor meanCos pins > 0.7 (saturated) because one
      // dominant basin races to wMax faster than the contrastive anti-Hebbian
      // + top-K prune + row-normalize can re-separate it. Full diagnosis:
      // docs/SPONGE-SEM-MOTOR-SATURATION-HANDOFF.md.
      //
      // This is the ONE chokepoint where the learning rate reaches BOTH the
      // GPU-resident weights (hebbianBound dispatch below) and the CPU shadow
      // (ojaUpdate) — the CPU-side prevention pipeline alone is a no-op at
      // biological scale because it operates on a stale CPU shadow. Damping
      // the LR on the emission projections specifically slows the march to
      // wMax so basin separation holds. Scoped to sem_to_motor +
      // sem_to_word_motor only — letter_to_phon / letter_to_motor /
      // motor_to_sem (comprehension) are untouched.
      //
      // DREAM_SM_LR_SCALE overrides the 0.5 default; 1.0 = old behavior
      // (no damping). Cached once per cluster; logged loudly on first use so
      // the [SatHealth] watcher can correlate the walk's meanCos with it.
      if (this._smLrScale === undefined) {
        let _v = NaN;
        try { _v = parseFloat(typeof process !== 'undefined' && process?.env?.DREAM_SM_LR_SCALE); } catch { _v = NaN; }
        this._smLrScale = (Number.isFinite(_v) && _v >= 0) ? _v : 0.5;
        if (this._smLrScale !== 1) {
          console.log(`[Cluster ${this.name}] sem→motor LR damping ACTIVE — sem_to_motor + sem_to_word_motor Hebbian LR ×${this._smLrScale} (saturation prevention; DREAM_SM_LR_SCALE=1.0 disables). Watch [SatHealth] meanCos across the walk.`);
        }
      }
      const _isMotorEmissionProj = (name === 'sem_to_motor' || name === 'sem_to_word_motor');
      const lrEff = _isMotorEmissionProj ? lr * this._smLrScale : lr;

      // Build the K-scales bundle ONCE per-projection per-call. Passes
      // K.4 hub-mask + K.7 gamma-scale + K.9 per-layer plasticity through
      // to every downstream ojaUpdate path (GPU-bound CPU shadow, sparse-
      // pool, no-pool). This is the P2.3 plumbing path: previously
      // _crossRegionHebbian called ojaUpdate with bare (pre, post, lr)
      // arguments so the biological-scale K.4/K.7/K.9 modulation was
      // SILENT on all _teachHebbian-routed teach phases (which is the
      // dominant teach path — every _teachAssociationPairs call,
      // _teachHebbian call, structure-teach pass etc. goes through here).
      // With kScales plumbed, K-microstructure plasticity gradients
      // shape every Hebbian update from this method, not just the
      // direct curriculum.js ojaUpdate sites that already passed
      // kScales explicitly.
      //
      // Caller can override via opts.kScalesOverride (e.g. calibration
      // probes that want a fixed K profile). Otherwise builds via the
      // cluster's standard builder which reads layerId/hubMask/gammaScale.
      const kScalesForProj = (opts.kScalesOverride !== undefined)
        ? opts.kScalesOverride
        : (typeof this.buildKScalesForProjection === 'function'
            ? this.buildKScalesForProjection(src, dst)
            : null);
      const ojaOpts = kScalesForProj ? { kScales: kScalesForProj } : undefined;

      // T18.17 — GPU-bound fast path. When the projection has been
      // rebound to main-cortex slices (T17.7 Phase C.1) AND the GPU
      // proxy is ready, skip the CPU sparse-pool Hebbian entirely.
      // Probes read directly from GPU via readbackLetterBuckets /
      // readback_currents (see cluster.js:1687-1688 for the canonical
      // GPU-aware probe check on sem_to_motor). The CPU shadow was
      // kept for probe compat but is pure overhead at biological
      // scale — heartbeat telemetry exposed the cost: Phase 1 ran at
      // 0.40 iter/s = ~2.5s per letter, entirely bottlenecked by
      // `await
      // this._sparsePool.hebbianUpdate(proj, preF, postF, lr)` across
      // 14 projections totaling ~650M nnz of CPU sparse Hebbian work
      // per letter. GPU dispatch is fire-and-forget microseconds; the
      // CPU shadow was serializing the teach loop 100-250× slower than
      // necessary. Skipping when GPU-bound brings iteration velocity
      // to the GPU-dispatch-only ceiling (~50-100 iter/s at biological
      // scale through T18.8 batched dispatch). Phase 1 goes from 13
      // minutes to 3-6 seconds at 312 iters.
      if (proj._gpuBound && this._gpuProxyReady && this._gpuProxy && this._gpuProxy.hebbianBound) {
        // T18.31 — WHITELIST CPU Hebbian to only the 2 probe-critical
        // projections. T18.30 ran sync CPU Hebbian on ALL 14 bound
        // projections which destroyed teach velocity (30-100× slower:
        // _teachPhonemeBlending dropped from 25-40 words/s to 0.3-1.1
        // words/s). But the pure-GPU fast path left CPU weights stale
        // for projections the gate probe reads
        // via CPU SparseMatrix.propagate() → 0.000 motor activations →
        // gate fail.

        // Surgical fix: run sync CPU Hebbian ONLY on the projections
        // the gate probe actually reads. For ELA-K gate:
        //   - `letter_to_phon` (READ probe)
        //   - `letter_to_motor` (TALK probe)
        // The other 12 cross-projections stay GPU-only fast path.
        // 2 projections × ~100-200ms = 200-400ms per _teachHebbian call
        // vs T18.30's 14 × ~200ms = ~3s. ~7× faster than T18.30, still
        // produces correct probe reads on the 2 critical projections.

        // If other subjects (science/math/social/art/life K) need
        // different probe projections, we extend the whitelist per
        // subject. Currently focused on unblocking ELA-K gate.
        try {
          this._gpuProxy.hebbianBound(`${this.name}_${name}`, lrEff);
        } catch { /* non-fatal */ }
        // Whitelist of probe-critical projection names (unprefixed key,
        // i.e. without the cluster-name prefix). Matches what
        // _gateElaKReal reads via cluster.crossProjections[...].propagate.
        const PROBE_CRITICAL = this._probeCriticalProjectionsSet ||= new Set([
          'letter_to_phon',
          'letter_to_motor',
        ]);
        if (PROBE_CRITICAL.has(name) && !skipCpuWhitelist) {
          // Sampling mode — on the FINAL rep of a teach phase we need
          // the CPU arrays up-to-date for probes, but running the full
          // CPU Hebbian on every call at 14.9 M nnz costs 2-3 w/s wall-
          // clock. Caller (teach loop) can set
          // `cluster._teachFinalRepSampleEveryN = 5` to sample every
          // 5th whitelist call. GPU fire-and-forget still runs every
          // call, so GPU weights are fully current; CPU arrays see
          // 20% of the updates — enough to keep probes within tolerance
          // given prior 9 reps of GPU-only training left the CPU arrays
          // stale anyway. ~5× final-rep speedup.
          const sampleN = this._teachFinalRepSampleEveryN | 0;
          if (sampleN > 1) {
            this._whitelistSampleCounter = (this._whitelistSampleCounter || 0) + 1;
            if (this._whitelistSampleCounter % sampleN !== 0) {
              continue; // skip THIS call, GPU already dispatched above
            }
          }
          // ACTIVE-ROW ITERATION. `postF` is a dense vector over a region
          // that is millions of rows wide at biological scale, but only a
          // few thousand of them fired. ojaUpdate's `if (!y) continue`
          // still has to VISIT every row to learn that — so the outer scan
          // costs O(region size) while the real work is O(firing), and at
          // 1.5M rows that skip-scan IS the multi-second synchronous block
          // that starves donor handshakes and the dashboard mid-teach.
          //
          // Passing `activeRows` makes the loop O(firing) and is
          // BIT-IDENTICAL: under Oja a post=0 row updates by
          // lr·0·x − lr·0²·w = 0, so a skipped row and a visited-then-
          // skipped row leave the same weights. Same reasoning and same
          // mechanism the direct pair-reinforce path already uses.
          const preS = _spk(src);
          const postS = _spk(dst);
          const preF = preS.vec;
          const postF = postS.vec;
          const activeRows = postS.active;
          // #37 step 2 — chunk this sync CPU Oja by row-range with event-loop
          // yields. It's the dominant teach-path blocker at 306M: even on the
          // GPU-bound fast path we still run the probe-critical CPU Oja so the
          // gate probe can read CPU arrays, and the dst region is millions of
          // rows — one pass blocks the loop for seconds and stalls the /ws
          // donor/chat handshake mid-teach. Row-independent math → slicing is
          // identical; we just `await` a macrotask between slices so the loop
          // drains HTTP/WS work. GPU fire-and-forget already ran above, so GPU
          // weights stay current regardless.
          await this._ojaUpdateChunked(
            proj, preF, postF, lrEff,
            // `projName` rides the options bag purely so the slow-Oja warning
            // can name what it just spent seconds on — `ASSOCBOUND.2`.
            ojaOpts ? { ...ojaOpts, activeRows, projName: name } : { activeRows, projName: name },
          );
        }
        continue;
      }

      // Null-CSR guard — when T24.a selective-free has nulled this
      // projection's CPU arrays AND the GPU fast path wasn't hit above
      // (e.g. `_gpuProxyReady === false` because compute.html is gone
      // OR `proj._gpuBound === false` because the bind step missed),
      // CPU Hebbian would crash on null `values[k]` access OR the
      // worker pool would hang trying to transfer null typed-arrays.
      // Both failure modes freeze the teach loop with no log. Skip the
      // projection with a one-shot warn instead — GPU weights are
      // already fire-and-forget updated above when possible, and the
      // Hebbian signal for this specific projection just doesn't land
      // this iter. Better a weak Hebbian than a frozen event loop.
      // GPU-REQUIRED BRAIN: no CPU teach path exists here (2026-08-14).
      // Reaching this point means the projection is not GPU-BOUND even though
      // the substrate is ready - it was uploaded standalone rather than bound
      // into the cortex spike buffer. That is still a GPU-resident matrix, so
      // it goes to the proxy's UNBOUND entry point. What it must never do is
      // fall through to the CPU Oja below: that branch is what let a
      // disconnected donor keep "training" on the host CPU.
      if (this.requireGpuSubstrate) {
        if (this._gpuProxy && this._gpuProxy.hebbian) {
          const preU = _spk(src);
          const postU = _spk(dst);
          try { this._gpuProxy.hebbian(`${this.name}_${name}`, preU.vec, postU.vec, lrEff); }
          catch { /* non-fatal - batched plasticity queue backpressured */ }
        } else if (!this._unboundNoProxyWarned) {
          this._unboundNoProxyWarned = true;
          console.error(`[Cluster ${this.name}] CRITICAL - ${name} is not GPU-bound and the proxy exposes no unbound hebbian entry point, so this projection is NOT being trained. It is deliberately NOT computed on the CPU: this brain's substrate is the GPU.`);
        }
        continue;
      }

      if (!proj.values || !proj.colIdx || !proj.rowPtr) {
        if (!proj._nullCsrHebbianWarned) {
          proj._nullCsrHebbianWarned = true;
          console.warn(`[Cluster ${this.name}] Hebbian skip on ${name} — CPU CSR null AND GPU fast path unavailable (gpuBound=${!!proj._gpuBound} gpuProxyReady=${!!this._gpuProxyReady}). Check compute.html client or PROBE_CRITICAL_CPU_CSR whitelist.`);
        }
        continue;
      }
      // Same active-row iteration as the GPU-bound branch above: walk the
      // firing rows instead of scanning the whole region to skip them.
      const preS2 = _spk(src);
      const postS2 = _spk(dst);
      const preF = preS2.vec;
      const postF = postS2.vec;
      const activeRows2 = postS2.active;
      // CPU Hebbian OOM fix — route through worker pool when
      // available. AWAIT the pool job so
      // pending cross-projection Hebbians don't pile up in semi-space
      // (14 projections × ~3 MB pre/postF buffers × hundreds of teach
      // iterations = GB-scale semi-space exhaustion). Same root cause
      // + same fix shape as intraSynapsesHebbian — caller (teach
      // loops) awaits, iteration rate throttles to the worker pool's
      // drain rate, only ~15 jobs live in memory at a time.

      // T18.17 — this path now only runs for NON-GPU-bound projections
      // (standalone browser-only mode, or pre-rebind window during
      // initial boot). At biological scale all cross-projections are
      // GPU-bound post T17.7 Phase C.1 rebind so this path is cold.
      // #112.4 — CHUNK the non-GPU-bound CPU Oja. This path runs when cross-
      // projections AREN'T GPU-bound — at biological scale that's the donor-
      // upload-FAILED case (the all-night "2/17 uploaded, 15 fell to CPU" loop):
      // 15 projections × a full sync ojaUpdate over millions of dst rows = the
      // residual ~5s [EventLoop] BLOCK during teach. _ojaUpdateChunked slices it
      // + yields between slices (row-independent math = identical result), so a
      // /ws donor/chat handshake gets an event-loop slot even on the CPU path.
      const ojaOpts2 = ojaOpts
        ? { ...ojaOpts, activeRows: activeRows2, projName: name }
        : { activeRows: activeRows2, projName: name };
      if (this._sparsePool && this._sparsePool.ready) {
        try {
          await this._sparsePool.hebbianUpdate(proj, preF, postF, lrEff);
        } catch {
          await this._ojaUpdateChunked(proj, preF, postF, lrEff, ojaOpts2);
        }
      } else {
        await this._ojaUpdateChunked(proj, preF, postF, lrEff, ojaOpts2);
      }
      // T17.3.d — fire-and-forget GPU Hebbian fallback for standalone
      // (non-bound) projections. Bandwidth cost: srcSize + dstSize u32s.
      if (this._gpuProxyReady && this._gpuProxy && this._gpuProxy.hebbian) {
        try {
          this._gpuProxy.hebbian(`${this.name}_${name}`, preF, postF, lrEff);
        } catch { /* non-fatal — CPU path already updated */ }
      }
    }
  },

  // #37/#112.4 + TIME-SLICED — chunked CPU Oja. The old fixed 250k-row slice
  // had scale-dependent COST: at 306M a single "slice" ran seconds, so the
  // event loop starved between yields (the 5s BLOCKED cadence — dashboard
  // freezes, /ws stalls — that appeared with the full-size deploy; at 40M
  // the same slice was ~300ms and nobody noticed). Slices now adapt by
  // TIME: each synchronous slice is measured and the row-chunk halves
  // (floor 16k) past 60ms / doubles (cap 512k) under 15ms, converging every
  // projection to ~30ms slices at ANY scale. Identical math (rows are
  // independent); a slice that still exceeds 2s warns with the projection
  // name so the next freeze names its culprit. Below one chunk it stays a
  // single synchronous pass (no yield overhead).
  async _ojaUpdateChunked(proj, preF, postF, lr, ojaOpts) {
    const rows = proj.rows | 0;
    if (!this._ojaChunkRows) this._ojaChunkRows = 65536;

    // ACTIVE-ROW FAST PATH. When the caller supplied the firing rows, the
    // work is O(firing) — typically a few thousand — not O(rows). The
    // row-RANGE slicing below cannot be reused here: it slices by row INDEX,
    // and an active list is a sparse SET of indices, not a contiguous span.
    // Slicing [0,65536) against an active list holding index 900,000 would
    // silently drop every update outside the first chunk.
    //
    // TICK-GAP FIX (2026-08-14) — but "O(firing), therefore don't yield" was
    // the wrong conclusion. Less work in ONE unbroken synchronous call still
    // pins the single-threaded loop for the whole duration, and this process
    // is single-threaded: while it runs, the donor's compute_batch reply sits
    // unprocessed, /ws handshakes stall, and the dashboard freezes. Measured
    // live: stepTimeMs 5526 with the donor answering in ~45ms and
    // eventLoopDelay p50 20ms / MAX 7315ms — the tick is not waiting on the
    // GPU, it is waiting for this thread. (The prior comment's own escape
    // hatch — a >250ms warn saying "this is real work, not a skip-scan" —
    // conceded the block while accepting it; real work blocks the loop
    // exactly as hard as wasted work does.)
    //
    // So slice the ACTIVE LIST itself (not row ranges) and yield a macrotask
    // between slices. Total work is unchanged — every active row is visited
    // exactly once — and the math is bit-identical because rows are
    // independent under Oja. Same adaptive ~30ms time-slicing as the
    // row-range loop below, with its own chunk state (active-list slices and
    // row-range slices have very different per-unit costs).
    const activeRows = ojaOpts && ojaOpts.activeRows;
    if (activeRows) {
      const n = activeRows.length | 0;
      // Small sets stay a single synchronous pass — below this the yield
      // overhead costs more than the block it would break up.
      const ACTIVE_SLICE_MIN = 2048;
      if (n <= ACTIVE_SLICE_MIN) {
        const _t0 = Date.now();
        proj.ojaUpdate(preF, postF, lr, ojaOpts);
        const _dt = Date.now() - _t0;
        if (_dt > 250) {
          console.warn(`[Cluster ${this.name}] Oja over ${n.toLocaleString()} ACTIVE rows took ${_dt}ms (proj=${(ojaOpts && ojaOpts.projName) || '?'} nnz=${proj.nnz ?? '?'}) — under the ${ACTIVE_SLICE_MIN}-row slice floor so it ran unsliced; if it repeats, this projection's fan-out is the cost.`);
        }
        return;
      }
      // SNAPSHOT the indices. `regionSpikesActive` hands back a SHARED scratch
      // array that its next call clears and refills — and we are about to
      // await between slices, so a concurrent teach/emission path calling it
      // for the same region would reset the list mid-loop and corrupt the
      // remaining slices. Copying a few thousand ints once is free next to
      // the Oja work it guards.
      const rowsList = Array.prototype.slice.call(activeRows);
      const total = rowsList.length;
      if (!this._ojaActiveChunk) this._ojaActiveChunk = 8192;
      const yieldMacro = (typeof setImmediate === 'function')
        ? () => new Promise((r) => setImmediate(r))
        : () => new Promise((r) => setTimeout(r, 0));
      const _tStart = Date.now();
      for (let i = 0; i < total; ) {
        const chunk = this._ojaActiveChunk;
        const j = Math.min(i + chunk, total);
        const t0 = Date.now();
        proj.ojaUpdate(preF, postF, lr, { ...(ojaOpts || {}), activeRows: rowsList.slice(i, j) });
        const dt = Date.now() - t0;
        i = j;
        if (dt > 60 && chunk > 1024) this._ojaActiveChunk = Math.max(1024, chunk >> 1);
        else if (dt < 15 && chunk < 65536) this._ojaActiveChunk = chunk << 1;
        // Yield ONLY between slices — a trailing hop after the final slice
        // protects nothing and pays the loop's full backlog (measured live:
        // ~340ms/hop at eventLoopLagMs 758 — the hop WAS the per-call cost).
        // _hopProf counts + times every hop so the backlog is a field read.
        if (i < total) { const _h0 = Date.now(); await yieldMacro(); const _hp = this._hopProf || (this._hopProf = { n: 0, ms: 0 }); _hp.n++; _hp.ms += Date.now() - _h0; }
      }
      const _tot = Date.now() - _tStart;
      if (_tot > 2000) {
        // ⭐ `ASSOCBOUND.2` — THE PROJECTION IS NAMED. This line reported the
        //   row count and the nnz but never WHICH projection, so a live read
        //   could measure the cost exactly (358k-439k active rows, nnz 452.5M,
        //   2.3-8.0s a pass) and still not say where it lands. Every candidate
        //   region's reported firing rate x its size missed 400k, so the answer
        //   was not derivable from the published state either — it needed this
        //   one word. Passed through `ojaOpts` so no call site changes.
        console.warn(`[Cluster ${this.name}] Oja over ${total.toLocaleString()} ACTIVE rows took ${_tot}ms WALL (proj=${(ojaOpts && ojaOpts.projName) || '?'} nnz=${proj.nnz ?? '?'}) — but SLICED at ~${this._ojaActiveChunk} rows with event-loop yields, so the tick/donor/ws kept getting slots. Wall time here is real work, not a loop pin.`);
      }
      return;
    }
    // SINGLE-PASS only for genuinely small matrices — a FIXED threshold, NOT
    // the adaptive slice size (which ratchets up on fast small projections and
    // would then single-pass a large matrix unsliced = the 2-9s teach blocks).
    if (rows <= 65536) {
      const _t0 = Date.now();
      proj.ojaUpdate(preF, postF, lr, ojaOpts);
      const _dt = Date.now() - _t0;
      if (_dt > 2000) console.warn(`[Cluster ${this.name}] SLOW single-pass Oja: ${_dt}ms for ${rows.toLocaleString()} rows (nnz=${proj.nnz ?? '?'}) — under the chunk threshold so it never sliced; this matrix is a loop-pin culprit.`);
      return;
    }
    const yieldMacro = (typeof setImmediate === 'function')
      ? () => new Promise((r) => setImmediate(r))
      : () => new Promise((r) => setTimeout(r, 0));
    for (let rs = 0; rs < rows; ) {
      const chunk = this._ojaChunkRows;
      const re = Math.min(rs + chunk, rows);
      const t0 = Date.now();
      proj.ojaUpdate(preF, postF, lr, { ...(ojaOpts || {}), rowStart: rs, rowEnd: re });
      const dt = Date.now() - t0;
      rs = re;
      if (dt > 60 && chunk > 16384) this._ojaChunkRows = Math.max(16384, chunk >> 1);
      else if (dt < 15 && chunk < 65536) this._ojaChunkRows = chunk << 1;
      if (dt > 2000) console.warn(`[Cluster ${this.name}] SLOW Hebbian slice: ${dt}ms for ${chunk.toLocaleString()} rows (nnz-dense projection) — chunk auto-halved; if this repeats, this projection is the freeze culprit.`);
      if (rs < rows) { const _h0 = Date.now(); await yieldMacro(); const _hp = this._hopProf || (this._hopProf = { n: 0, ms: 0 }); _hp.n++; _hp.ms += Date.now() - _h0; }
    }
  },

  // TIME-SLICED — chunked bare-Hebbian write (the predictive-error delta
  // rule in _teachPredictiveError). Same adaptive slicing + shared chunk
  // state as _ojaUpdateChunked; row-independent so identical math. Fires
  // once per pair over the full intra matrix — unsliced it stacked into
  // ~20s stalls on multi-pair seed words (e.g. "minus").
  async _hebbianUpdateChunked(mat, preF, postF, lr) {
    const rows = mat.rows | 0;
    if (!this._ojaChunkRows) this._ojaChunkRows = 65536;
    if (rows <= 65536) { mat.hebbianUpdate(preF, postF, lr); return; }
    const yieldMacro = (typeof setImmediate === 'function')
      ? () => new Promise((r) => setImmediate(r))
      : () => new Promise((r) => setTimeout(r, 0));
    for (let rs = 0; rs < rows; ) {
      const chunk = this._ojaChunkRows;
      const re = Math.min(rs + chunk, rows);
      const t0 = Date.now();
      mat.hebbianUpdate(preF, postF, lr, { rowStart: rs, rowEnd: re });
      const dt = Date.now() - t0;
      rs = re;
      if (dt > 60 && chunk > 16384) this._ojaChunkRows = Math.max(16384, chunk >> 1);
      else if (dt < 15 && chunk < 65536) this._ojaChunkRows = chunk << 1;
      if (rs < rows) { const _h0 = Date.now(); await yieldMacro(); const _hp = this._hopProf || (this._hopProf = { n: 0, ms: 0 }); _hp.n++; _hp.ms += Date.now() - _h0; }
    }
  },

  // #37 + TIME-SLICED — chunked CPU anti-Hebbian; same adaptive ~30ms
  // slicing as _ojaUpdateChunked (shared chunk-size state so both paths
  // converge together). Identical math; row-independent.
  async _antiHebbianChunked(mat, preF, postF, lr, opts) {
    const rows = mat.rows | 0;
    if (!this._ojaChunkRows) this._ojaChunkRows = 65536;
    // TW S2 — ACTIVE-ROW fast path, mirroring _ojaUpdateChunked's (see its
    // comment block for the full rationale: O(firing) not O(rows), snapshot
    // against the shared scratch, slice the LIST not row ranges, yield
    // between slices). antiHebbianUpdate is post-gated, so skipped rows are
    // exact no-ops — bit-identical to the full scan.
    const activeRows = opts && opts.activeRows;
    if (activeRows) {
      const n = activeRows.length | 0;
      const ACTIVE_SLICE_MIN = 2048;
      if (n <= ACTIVE_SLICE_MIN) {
        mat.antiHebbianUpdate(preF, postF, lr, { activeRows });
        return;
      }
      const rowsList = Array.prototype.slice.call(activeRows);
      const total = rowsList.length;
      if (!this._ojaActiveChunk) this._ojaActiveChunk = 8192;
      const yieldMacroA = (typeof setImmediate === 'function')
        ? () => new Promise((r) => setImmediate(r))
        : () => new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < total; ) {
        const chunk = this._ojaActiveChunk;
        const j = Math.min(i + chunk, total);
        const t0 = Date.now();
        mat.antiHebbianUpdate(preF, postF, lr, { activeRows: rowsList.slice(i, j) });
        const dt = Date.now() - t0;
        i = j;
        if (dt > 60 && chunk > 1024) this._ojaActiveChunk = Math.max(1024, chunk >> 1);
        else if (dt < 15 && chunk < 65536) this._ojaActiveChunk = chunk << 1;
        // Yield ONLY between slices (see _ojaUpdateChunked) — the lateral-
        // inhibition path's single-slice calls paid one wasted ~340ms hop
        // here per call; measured as the ENTIRE 344ms/call antiMs stage.
        if (i < total) { const _h0 = Date.now(); await yieldMacroA(); const _hp = this._hopProf || (this._hopProf = { n: 0, ms: 0 }); _hp.n++; _hp.ms += Date.now() - _h0; }
      }
      return;
    }
    // SINGLE-PASS only for genuinely small matrices (fixed threshold, see
    // _ojaUpdateChunked) — a large matrix must never single-pass unsliced.
    if (rows <= 65536) {
      const _t0 = Date.now();
      mat.antiHebbianUpdate(preF, postF, lr);
      const _dt = Date.now() - _t0;
      if (_dt > 2000) console.warn(`[Cluster ${this.name}] SLOW single-pass anti-Hebbian: ${_dt}ms for ${rows.toLocaleString()} rows (nnz=${mat.nnz ?? '?'}) — under the chunk threshold so it never sliced; this matrix is a loop-pin culprit.`);
      return;
    }
    const yieldMacro = (typeof setImmediate === 'function')
      ? () => new Promise((r) => setImmediate(r))
      : () => new Promise((r) => setTimeout(r, 0));
    for (let rs = 0; rs < rows; ) {
      const chunk = this._ojaChunkRows;
      const re = Math.min(rs + chunk, rows);
      const t0 = Date.now();
      mat.antiHebbianUpdate(preF, postF, lr, { rowStart: rs, rowEnd: re });
      const dt = Date.now() - t0;
      rs = re;
      if (dt > 60 && chunk > 16384) this._ojaChunkRows = Math.max(16384, chunk >> 1);
      else if (dt < 15 && chunk < 65536) this._ojaChunkRows = chunk << 1;
      if (dt > 2000) console.warn(`[Cluster ${this.name}] SLOW anti-Hebbian slice: ${dt}ms for ${chunk.toLocaleString()} rows — chunk auto-halved; repeated hits name this matrix as the freeze culprit.`);
      if (rs < rows) { const _h0 = Date.now(); await yieldMacro(); const _hp = this._hopProf || (this._hopProf = { n: 0, ms: 0 }); _hp.n++; _hp.ms += Date.now() - _h0; }
    }
  },

  /**
   * T17.3.d — Upload all cross-projections to GPU via the proxy. Once
   * complete, sets `_gpuProxyReady = true` so subsequent
   * `_crossRegionHebbian` calls dispatch to GPU alongside the CPU
   * shadow updates. The `_propagateCrossRegions` hot-path wiring
   * follows in T17.3.e — currents readback requires async/await
   * cascade through cluster.step which is a larger refactor.
   *
   * Cluster must be fully constructed (cross-projections initialized)
   * before calling this. Safe to call after construction but before
   * any curriculum teach.
   */
  async initGpu() {
    if (!this._gpuProxy || !this._gpuProxy.upload) return false;
    // NOT READY DURING A (RE-)UPLOAD (2026-08-15). This method is also the
    // re-arm path after a donor swap, and the stale `true` from the PREVIOUS
    // donor otherwise lets teach dispatch against matrices the new donor does
    // not hold yet. Cleared here; the assignment at the end of this method is
    // the ONLY place it returns to true, and only when every matrix uploaded.
    this._gpuProxyReady = false;
    const targets = [];
    // T17.3.e — intra-cluster synapse matrix uploaded alongside
    // cross-projections. Hebbian updates during curriculum teach call
    // `intraSynapsesHebbian(pre, post, lr)` which dispatches GPU
    // fire-and-forget alongside the CPU synapses.hebbianUpdate. Puts
    // the intra-cluster matrix on GPU so it's ready for propagate
    // dispatch once the async cascade is wired through cluster.step.
    if (this.synapses) {
      // GINTRA (2026-08-16) — bind the intra matrix to the donor-side
      // `langCortex` PSEUDO-CLUSTER (server mode only: the binding hint
      // exists). The pseudo-cluster carries the langCortex's STANDALONE spike
      // space (gpu_init'd by the server; populated by the teach-frame twins),
      // so `hebbian_bound` trains the intra GPU-RESIDENT at ~30 bytes/op —
      // the cure for the 3.8s/call CPU intra pass at the 12M cortex (the
      // 25-teach/min pair-phase crawl). Browser/standalone stays unbound.
      const _intraBinding = (this._gpuBindingHint && this.size > 0)
        ? { srcCluster: 'langCortex', srcRegion: { start: 0, end: this.size },
            dstCluster: 'langCortex', dstRegion: { start: 0, end: this.size } }
        : null;
      targets.push({ key: `${this.name}_intraSynapses`, name: 'intraSynapses', proj: this.synapses, binding: _intraBinding });
    }
    // T18.6.b — cross-projections upload with cluster-binding metadata
    // from the start. The `binding` describes WHERE in the destination
    // main-brain cluster (when one exists) the cross-projection reads
    // pre-spikes and writes post-currents. For the standalone cortex
    // language cluster the binding targets the main cortex's first-N
    // sub-slice of each named region (layout must stay in sync with
    // `server/brain-server.js:_ensureCortexCrossProjectionsBound` which
    // is the fallback rebind path for persisted-but-unbound matrices).
    // `gpuBindingHint` is populated by the server wrapper when the
    // cluster lives inside a larger bound cortex; browser-only clients
    // leave it unset and the uploads stay standalone (smaller scale
    // where standalone overhead is negligible). Intra-synapses always
    // ship standalone — it runs on its own pre/post buffers, not
    // bound into another cluster's spike buffer.
    if (this.crossProjections) {
      const hint = this._gpuBindingHint || null;
      for (const name of Object.keys(this.crossProjections)) {
        const key = `${this.name}_${name}`;
        let binding = null;
        if (hint && typeof hint.resolve === 'function') {
          try { binding = hint.resolve(name, this.crossProjections[name]); }
          catch { binding = null; }
        }
        targets.push({ key, name, proj: this.crossProjections[name], binding });
      }
    }
    let uploaded = 0;
    let boundCount = 0;
    for (const { key, name: projName, proj, binding } of targets) {
      // FREED-CSR GUARD — after T18.22 the CPU arrays of bound projections
      // are nulled (GPU authoritative). On a RE-ARM after a donor drop those
      // weights died with the old donor's VRAM and the CPU has nothing real
      // to upload — attempting would install an EMPTY projection over the
      // fresh donor (silent pathway wipe). Skip + scream instead; the
      // GPU-readback persistence follow-up is the real cure.
      if (!proj || !proj.values || !proj.rowPtr || !proj.colIdx) {
        console.error(`[Cluster ${this.name}] CRITICAL — ${key} CPU CSR is FREED (GPU-authoritative weights died with the previous donor). NOT uploading an empty matrix over the new donor. This projection restarts from its last DISK state on next boot; mid-run learning since the free is lost until GPU-readback persistence ships.`);
        continue;
      }
      try {
        const matrix = {
          rows: proj.rows,
          cols: proj.cols,
          nnz: proj.nnz,
          values: proj.values,
          colIdx: proj.colIdx,
          rowPtr: proj.rowPtr,
        };
        // #112.3 — per-matrix retry. A flaky donor used to time out on ONE
        // matrix and the whole upload declared PARTIAL (e.g. 2/17) → CPU
        // fallback for the other 15 → the all-night CPU-grind loop that never
        // left kindergarten. Retry each matrix up to 3× (the shorter per-attempt
        // timeout in gpuSparseUpload makes this fast) before giving up to CPU.
        // A transient drop recovers; a truly-gone donor fails fast and the next
        // reconnect re-arms.
        let ack = null;
        for (let _try = 1; _try <= 3; _try++) {
          ack = await this._gpuProxy.upload(key, matrix, binding);
          if (ack && ack.ok) break;
          if (_try < 3) console.warn(`[Cluster ${this.name}] GPU upload ${projName || key} attempt ${_try}/3 failed (${ack ? 'ack not-ok' : 'null / timeout'}) — retrying`);
        }
        if (ack && ack.ok) {
          uploaded++;
          if (binding) {
            boundCount++;
            // Mark the CPU-side projection so cluster._crossRegionHebbian
            // routes GPU dispatch through the bound path (no per-call
            // pre/post array transfer) — same semantics as the Phase
            // C.1 rebind leaves them in.
            proj._gpuBound = true;

            // T18.22 — FREE CPU-side CSR arrays after bound upload.
            // For bound projections, GPU is authoritative: T18.17's
            // fast path in _crossRegionHebbian dispatches hebbianBound
            // fire-and-forget (reading spike patterns directly from
            // main-cortex spike buffer at bound region offsets, no
            // CPU reads of proj.values). Probes at biological scale
            // route through GPU readback (readbackLetterBuckets etc.)
            // per the canonical sem_to_motor._gpuBound check at
            // cluster.js:1687-1688. No code path reads proj.values /
            // proj.colIdx / proj.rowPtr for a bound projection after
            // this point.

            // At cortexCluster scale (14 cross-projections × ~50M nnz
            // avg × 12 bytes/nnz CSR = ~8 GB of CPU-side external
            // memory), freeing these arrays drops V8 external-memory
            // pressure from ~9.5 GB to ~1 GB (just intra-synapses
            // which is non-bound + cluster.lastSpikes). V8 GC stops
            // thrashing; semi-space commits succeed; teach runs.

            // Repeated OOM at `_teachLetterCaseBinding` START even
            // after a 1 GB semi-space bump. V8 was under external-
            // memory pressure from 9+ GB of permanently-held cluster
            // state; Mark-Compact cycles couldn't reduce external
            // count regardless of semi-space size because references
            // were live. Freeing the unused CPU copies eliminates
            // the pressure at the source.

            // Safety: non-bound fallback path in _crossRegionHebbian
            // (browser-only standalone mode) still runs with its own
            // CPU arrays because hint.resolve returns null for those
            // and the freeing branch doesn't execute.
            const _freedValuesBytes = proj.values ? proj.values.byteLength : 0;
            const _freedColIdxBytes = proj.colIdx ? proj.colIdx.byteLength : 0;
            const _freedRowPtrBytes = proj.rowPtr ? proj.rowPtr.byteLength : 0;
            const _freedMB = ((_freedValuesBytes + _freedColIdxBytes + _freedRowPtrBytes) / (1024 * 1024)).toFixed(1);
            if (!this._t1822TotalFreedBytes) this._t1822TotalFreedBytes = 0;
            // Probe-critical whitelist — these projections are read via
            // CPU SparseMatrix.propagate() during gate probes, so their
            // CPU CSR must stay live. Everything else is GPU-bound +
            // the SparseMatrix.propagate null-CSR guard returns a zero
            // vector for stale reads, so accidental CPU reads on freed
            // projections yield empty results instead of crashing.

            // Memory impact: at 301K cortex scale, 14 cross-projections
            // averaging 75M nnz × 12 bytes CSR = ~13 GB external. The
            // whitelist keeps ~3 of the 14 (letter_to_phon,
            // letter_to_motor, sem_to_motor) plus intra-synapses (not
            // processed in this loop) — drops external from ~14.5 GB
            // to ~3-4 GB, clearing the V8 external-memory pressure
            // that caused the DYN-PROD event-loop freeze.
            const PROBE_CRITICAL_CPU_CSR = new Set([
              'letter_to_phon',   // READ probe reads phon via CPU propagate
              'letter_to_motor',  // TALK probe + DYN-PROD letter fallback
              'sem_to_motor',     // DYN-PROD primary path + separation probe
              // GINTRA — the intra matrix is now GPU-BOUND (langCortex pseudo-
              // cluster) which routes it through this free branch for the first
              // time. Its CPU CSR must NEVER free: checkpoints serialize it
              // (brain-weights.bin section 'cortex.synapses'), the final-rep
              // shadow trains it, and emission's intra propagate reads it.
              'intraSynapses',
              // Reverted: widening the whitelist added ~2 GB CPU CSR
              // back per extra projection and re-triggered the 14 GB
              // external-memory V8 GC stall that T24.a fixed. READ
              // probes that want letter_to_sem now route through the
              // GPU proxy fallback — `SparseMatrix.propagate` on a
              // freed CSR returns a zero vector via the null-CSR
              // guard, so probe scoring stays correct-shape even when
              // the CPU array is gone.
            ]);
            // Whitelist is keyed by UNPREFIXED projection name
            // (letter_to_phon etc.) — not the cluster-prefixed upload
            // key (cortex_letter_to_phon). Prior check against `key`
            // ALWAYS failed because the `${this.name}_` prefix never
            // matches the whitelist entries, so every CPU CSR got
            // freed — including the 3 that READ/TALK/DYN-PROD probes
            // need. Preflight then reported `G-` for every projection
            // and Phase 1's PROBE_CRITICAL Hebbian hit null rowPtr →
            // frozen Phase 1 at iter 0 letter 'a' right after the
            // _crossRegionHebbian first-call diag.
            // PRESSURE GATE — the free exists for the multi-GB dense-scale
            // case (V8 external-memory OOM). At current sparsity the whole
            // cross-projection set is ~100-200MB, and freeing it is all cost:
            // checkpoints SKIP freed matrices (GPU readback not wired), so a
            // donor drop loses those pathways' mid-run learning and the re-arm
            // has nothing real to upload. Free ONLY when this projection's CSR
            // actually threatens memory (default >=512MB, DREAM_CSR_FREE_MIN_MB);
            // below that, keep it resident — saves stay complete, donor churn
            // stays lossless, re-arms upload truth. The values-only GPU
            // readback frame remains the queued cure for the dense-scale case.
            const _freeMinBytes = (Number(process.env.DREAM_CSR_FREE_MIN_MB) > 0
              ? Number(process.env.DREAM_CSR_FREE_MIN_MB) : 512) * 1048576;
            const _projBytes = _freedValuesBytes + _freedColIdxBytes + _freedRowPtrBytes;
            if (_projBytes < _freeMinBytes) {
              console.log(`[CPU-CSR-free] keeping ${key} resident (${_freedMB}MB < ${Math.round(_freeMinBytes / 1048576)}MB pressure gate) — checkpoints stay complete, donor churn stays lossless.`);
            } else if (PROBE_CRITICAL_CPU_CSR.has(projName)) {
              // NOT NEGOTIABLE, and the reason is bigger than the probes
              // (investigated 2026-08-18 after the live line showed 4165.6MB
              // held for cortex_intraSynapses — the single largest tenant on a
              // 31GB box). Freeing it cannot be traded for RAM today because
              // CHECKPOINTS SKIP FREED MATRICES: GPU values-readback is not
              // wired, so a freed intra matrix simply stops being saved, and
              // the intra matrix is the LARGEST section of her checkpoint.
              // Trading 4.1GB of RAM for silently unsaved intra weights is
              // strictly worse than paying the RAM.
              //
              // AND THE DEEPER REASON (Gee, 2026-08-18): "This woundnt work tho
              // becasueu of ransom or user controlled drop outs, right?" — right,
              // and this is the argument that actually settles it. A values-only
              // donor readback was drafted here as "the real cure"; it is not.
              // The donor is a VOLUNTEER GPU in a browser tab that can vanish
              // mid-tick with no notice. Freeing this array makes that tab the
              // SOLE CUSTODIAN of her intra weights, so a readback-on-demand save
              // requires the donor to still be alive at save time — and if it
              // dies first, every bit of learning since the last save dies with
              // it. That converts a memory cost into a DURABILITY cost, which is
              // the one cost this system cannot pay.
              //
              // So this is not a stopgap awaiting a donor feature. The CPU-side
              // copy is the AUTHORITATIVE MASTER and the donor is an accelerator,
              // not the system of record. The box is the only machine we control.
              // The one variant that would survive the objection is PERIODIC
              // streaming readback (chunks straight to disk, never holding all
              // 2.88GB at once) — and even that still loses the delta since the
              // last pull on a drop, so it only makes sense once weights are
              // replicated across several donors (DF.7 data-parallel). At one
              // live donor there is no redundancy to lean on. Do not free this.
              console.log(`[CPU-CSR-free] keeping probe-critical ${key} CPU arrays resident (${_freedMB}MB) — needed for READ/TALK/DYN-PROD gate probes AND for checkpoint completeness (freed matrices are skipped by the save; freeing this would silently stop persisting the largest section of her brain).`);
            } else {
              // Free the CPU CSR. `SparseMatrix.propagate` has a
              // null-CSR guard that returns a zero vector for any stale
              // read, so code paths that accidentally hit a freed
              // matrix get empty-but-correct-shape output instead of
              // "Cannot read properties of null" crashes.
              proj.values = null;
              proj.colIdx = null;
              proj.rowPtr = null;
              this._t1822TotalFreedBytes += _freedValuesBytes + _freedColIdxBytes + _freedRowPtrBytes;
              console.log(`[CPU-CSR-free] freed ${key} CPU arrays: ${(_freedValuesBytes/1024/1024).toFixed(1)}MB values + ${(_freedColIdxBytes/1024/1024).toFixed(1)}MB colIdx + ${(_freedRowPtrBytes/1024/1024).toFixed(1)}MB rowPtr = ${_freedMB}MB · cumulative freed ${(this._t1822TotalFreedBytes/1024/1024).toFixed(1)}MB.`);
            }
          }
        } else {
          console.warn(`[Cluster ${this.name}] GPU upload failed for ${key}:`, ack && ack.error);
        }
      } catch (err) {
        console.warn(`[Cluster ${this.name}] GPU upload exception for ${key}:`, err && err.message);
      }
    }
    this._gpuProxyReady = uploaded === targets.length;
    const boundTag = boundCount > 0 ? ` (${boundCount} cluster-bound at upload — standalone VRAM overhead skipped)` : '';
    console.log(`[Cluster ${this.name}] GPU proxy ready: ${uploaded}/${targets.length} matrices uploaded${boundTag} (${this._gpuProxyReady ? 'FULL — intra-synapses + all cross-projections on GPU' : 'PARTIAL — falling back to CPU for failed matrices'})`);

    // T18.23 — force V8 GC after T18.22 frees to actually reclaim the
    // external memory. `proj.values = null` unrefs the typed array from
    // the SparseMatrix instance but V8 can't reclaim until the next
    // scheduled GC cycle — and the loop's local `matrix = {values: proj.values,...}`
    // held the refs alive until the iteration ends. Forcing gc() here
    // after all 15 iterations are done guarantees reclamation before
    // the curriculum teach loop starts pressuring V8.

    // Requires Node launched with `--expose-gc` (added to start.bat in
    // T18.23). If `global.gc` is unavailable (some browser embedding
    // or Node launched without the flag), log a warning and continue —
    // V8 will eventually GC on its own schedule.

    // Heap stats logged before + after forced GC so the operator can visually
    // confirm external memory drops by the expected ~9 GB. If the drop
    // doesn't happen, T18.22's null-assignments aren't reclaiming (some
    // retainer is still referencing the typed arrays), and we need to
    // dig deeper via --heapsnapshot-signal=SIGUSR2.
    // REMOVED forced global.gc() from boot-time diagnostic. Runtime
    // evidence showed V8 already auto-gc'd between the null-
    // assignments and this log (external memory was 2.5 GB at log
    // time, ~7 GB less than expected — V8 reclaimed on its
    // own). The explicit gc() reclaimed 0 MB because there was nothing
    // left to reclaim. More importantly, forcing gc() when V8 is
    // already near semi-space commit limits can TRIGGER OOM mid-gc
    // (Mark-Compact needs to stage objects in semi-space; if semi-space
    // can't grow, gc crashes with "Committing semi space failed"). The
    // original intent — let the operator see V8 memory state post-upload — is
    // preserved via memoryUsage() read WITHOUT gc. If retainer issues
    // exist, they show up in the external number without triggering
    // a risky forced gc.
    if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
      try {
        const mem = process.memoryUsage();
        const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
        const extMB = ((mem.external || 0) / 1024 / 1024).toFixed(1);
        const abMB = ((mem.arrayBuffers || 0) / 1024 / 1024).toFixed(1);
        console.log(`[Cluster] Post-upload V8 memory: heapUsed=${heapMB}MB external=${extMB}MB arrayBuffers=${abMB}MB (selective free nulled ~${((this._t1822TotalFreedBytes || 0)/1024/1024).toFixed(1)}MB of CPU CSR arrays — V8 auto-reclaims on its own schedule; explicit gc() removed because prior attempts triggered OOM mid-gc).`);
      } catch (err) {
        console.warn(`[Cluster] memory-log diagnostic failed:`, err && err.message);
      }
    }

    return this._gpuProxyReady;
  },

  /**
   * T17.3.e — intra-cluster Hebbian wrapper. Applies the update on
   * CPU (authoritative) AND fires GPU fire-and-forget shadow when
   * proxy ready. Curriculum teach uses this instead of calling
   * `cluster.synapses.hebbianUpdate` directly so intra-cluster
   * weights stay in sync between CPU and GPU.
   */
  async intraSynapsesHebbian(pre, post, lr) {
    if (!this.synapses) return;
    if (!this._teachSubstrateReady('intraSynapsesHebbian')) return;
    // GINTRA (2026-08-16, Gee: "Do it correctly so that it fucking runs fast
    // ... no cutting shit") — the intra matrix is GPU-BOUND to the donor's
    // langCortex pseudo-cluster whose spike space the teach-frame TWINS keep
    // current. Dispatch the bound Hebbian EVERY call (full training mass on
    // the substrate, ~30 bytes/op through the SAME stale-guarded type-5 lane
    // as every cross-projection) and run the CPU shadow on the FINAL rep,
    // sampled — the exact law every bound cross-projection already ships
    // with (the shadow exists for checkpoints + CPU probes; the GPU is the
    // running brain). This is the cure for the measured 3.8s/call CPU intra
    // pass at 12M (the 25-teach/min pair-phase crawl vs the 1300+ band).
    // SAFETY GATES: (a) identity check — the pseudo spike space mirrors
    // cluster.lastSpikes ONLY, so callers passing custom pre/post vectors
    // (_teachHebbianAsymmetric etc.) NEVER take the GPU path; (b) no
    // binding / no proxy / no pseudo-cluster → the CPU path below runs
    // every call exactly as before (negotiation, not fallback).
    if (pre === this.lastSpikes && post === this.lastSpikes
        && this.synapses._gpuBound && this._gpuProxyReady
        && this._gpuProxy && this._gpuProxy.hebbianBound
        && this._brain && this._brain._langPseudoInit === true) {
      try { this._gpuProxy.hebbianBound(`${this.name}_intraSynapses`, lr); } catch { /* non-fatal */ }
      // ⭐ `SHADOWCOST.1` — count THIS branch too. `_intraOjaStats` is created at
      //   the ranges branch below, and a call that leaves through either early
      //   return here never reaches it — so a board reading only the ranges
      //   counters would under-report GPU-carried work and make the CPU share
      //   look larger than it is. Keys are read with `|| 0` at every bump so
      //   whichever branch initialises the object first, both still tally.
      const _sB = this._intraOjaStats || (this._intraOjaStats = { gpu: 0, cpuFull: 0, cpuShadow: 0, boundGpu: 0, boundNoShadow: 0 });
      _sB.boundGpu = (_sB.boundGpu || 0) + 1;
      if (this._teachIntermediateRep === true) { _sB.boundNoShadow = (_sB.boundNoShadow || 0) + 1; return; }   // GPU carried it; the shadow catches up on the final rep
      // TIME-BASED SHADOW CADENCE (2026-08-17). The every-Nth-call sampler
      // scaled shadow cost WITH the call rate: at the 12M cortex one CPU
      // shadow pass costs ~3.9s over 360M nnz, so every-5th pinned the
      // per-call average at ~800ms (measured live) — a hard ~75 teach/min
      // ceiling on the pair phases against the 1300-1500 band, and the
      // faster the walk ran the MORE 3.9s passes it paid. The shadow's
      // purpose (checkpoints + CPU probes read an approximately current
      // matrix) is served by wall-clock recency, not call counts: run at
      // most one shadow pass per gap window per direction, first call
      // after boot always shadows. GPU training mass above is untouched —
      // every rep still dispatches.
      const _sampleN = this._teachFinalRepSampleEveryN | 0;
      if (_sampleN > 1) {
        const _nowSh = Date.now();
        const _gapSh = (this._intraShadowMinGapMs | 0) > 0 ? (this._intraShadowMinGapMs | 0) : 30000;
        if (_nowSh - (this._lastIntraShadowMs || 0) < _gapSh) { _sB.boundNoShadow = (_sB.boundNoShadow || 0) + 1; return; }
        this._lastIntraShadowMs = _nowSh;
      }
    }
    // T17.2 — parallelize CPU Hebbian across worker pool when available.
    // Same row-range partitioning pattern as sparse matmul (disjoint
    // row-ranges, no write collisions on values buffer). Falls through
    // to synchronous single-thread update if pool unavailable.

    // Method is NOW async/awaitable. Caller (curriculum teach loops)
    // must `await` it.

    // BIOLOGICAL SCALE BYPASS. At cluster.size
    // > 10M the worker pool's `SparseMatmulPool.hebbianUpdate` becomes
    // net-HARMFUL rather than net-beneficial. The worker pool path
    // (server/worker-pool.js:236-239) allocates per call:

    //   Float32Array.from(preSpikes)   — 428 MB (107M × 4)
    //   Float32Array.from(postSpikes)  — 428 MB
    //   new SharedArrayBuffer(preByteLen) + set()  — 428 MB SAB
    //   new SharedArrayBuffer(postByteLen) + set() — 428 MB SAB
    //   TOTAL PEAK ~1.7 GB per call

    // These external-memory allocations happen BEFORE the actual
    // compute work starts and release only after the Promise resolves.
    // At Phase 2 rate (300 intra-synapses Hebbian calls × ~700 ms each
    // = 214s) that's 2.4 GB/sec of external-memory allocation rate.
    // V8 external memory tracking can't free SharedArrayBuffer fast
    // enough → semi-space commit failures → "Committing semi space
    // failed" → Node OOM. The ELA-K run hit this cascade twice in a
    // row: Phase 2 completed cleanly at 214s, then
    // `_teachLetterCaseBinding`'s first iteration tipped V8 over the
    // external-memory ceiling → FATAL ERROR. Removing the GPU shadow
    // (T18.18.a) didn't fix it because the CPU worker-pool path was
    // the actual allocator, not the GPU dispatch.

    // The synchronous `synapses.hebbianUpdate(pre, post, lr)` path
    // does a single row-sparse iteration over the CSR arrays with
    // ZERO new allocations — the input `pre`/`post` arrays and the
    // `matrix.values`/`colIdx`/`rowPtr` arrays are all the only
    // touch surface. At 107M cortex with 15K spikes in pre/post (only
    // letter region fires in Phase 2), the inner loop only enters for
    // ~15K rows × ~6 avg nnz = ~90K multiply-adds per call. Expected
    // wall time: 100-300 ms per call single-thread, vs ~700 ms per
    // call through the worker pool once you account for allocation
    // overhead. Phase 2 300 calls: ~30-90s single-thread vs 214s pool.
    // Net win + OOM elimination.

    // T18.25 — threshold LOWERED from 10M to 100K because cortexCluster
    // at biological scale auto-scales to ~301K (not 107M as T18.19
    // originally assumed). At 301K the worker-pool path still allocates
    // ~7 MB external per call (Float32Array.from(Uint8Array) = 1.2 MB +
    // new SharedArrayBuffer(1.2MB) + repeat for post = 4.8 MB
    // transient + steady-state holding via worker thread refs). 300
    // Phase 2 calls × ~7 MB = 2.1 GB external allocation churn — enough
    // to keep V8 under pressure through Phase 2's whole run (explains
    // the 3.39→1.63 iter/s deceleration pattern). Sync path allocates
    // ZERO external memory (pure CSR iteration over existing arrays).
    // At 301K with only letter region firing (~15K spikes), sync compute
    // is ~100-300ms single-thread; worker-pool is ~500ms with alloc
    // overhead. Sync wins anyway. Browser-scale (<100K) keeps worker
    // pool since compute cost dominates and external alloc is tiny.
    const BIOLOGICAL_SCALE_SYNC_THRESHOLD = 100_000;
    const atBioScale = (this.size | 0) > BIOLOGICAL_SCALE_SYNC_THRESHOLD;

    if (atBioScale) {
      // Biological scale — sync-math path, zero external-memory allocation.
      // Oja's rule here: self-normalizing Hebbian with decorrelating
      // decay so repeated intra-cluster associations don't all pile
      // into the same recurrent columns.
      // #37 — CHUNK the intra-synapse Oja the same way _crossRegionHebbian
      // chunks its cross-projection Oja. This was the RESIDUAL [EventLoop]
      // BLOCKED 300–3900ms stamped phase=_teachHebbian / _teachHebbianAsymmetric:
      // the recurrent intra matrix is millions of rows at biological scale and
      // one synchronous ojaUpdate froze the loop for seconds, starving donor
      // compute frames + /ws handshakes + pongs mid-teach (low aggregate Gn/s,
      // donor RTT spikes, heartbeat false-reaps → gpuShadowDirty churn). The
      // row loop is row-independent so slicing + yielding a macrotask between
      // slices produces an IDENTICAL result while letting HTTP/WS work get an
      // event-loop slot. Below the chunk threshold _ojaUpdateChunked runs a
      // single synchronous pass (no yield overhead).
      //
      // TW S2 — ACTIVE-ROW iteration for the intra matrix too. This call ran
      // the row-RANGE chunk walk over ALL rows (~1.5M at the grown cortex,
      // ~23 chunk slices + macrotask yields per call, fired per pair per rep)
      // even though ojaUpdate has had an O(active) fast path since the WMB
      // fix — it just never received activeRows from here. One typed scan of
      // `post` (a few ms) builds the firing list; skipped rows are y=0 under
      // Oja so the result is BIT-IDENTICAL.
      const _act = [];
      for (let _i = 0; _i < post.length; _i++) { if (post[_i]) _act.push(_i); }
      // GPUVERB.2 (2026-08-21) — the intra pass joins the GPU. T18.18 removed
      // the old dispatch because gpuSparseHebbian densified pre/post into
      // ~856MB frames; hebbian_ranges (donor v0.3.18) ships the SAME index
      // sets as a handful of [start,len] runs (~60 bytes) — teach patterns
      // are group-tiled writes, so they compress; a pattern that doesn't
      // compress (null ranges) keeps the full CPU pass because the donor's
      // expander silently skips oversized ranges and truncated-pattern math
      // is wrong with no loud failure. When the GPU carries, the CPU shadow
      // runs every 5th call (the emission lanes' trained-equivalent posture);
      // when it can't, the CPU pass runs in full — nothing is ever dropped.
      let _gpuCarried = false;
      // ⭐ `SHADOWCOST.1` — RECORD WHY, not just whether. `cpuFull` and
      //   `cpuShadow` differ by a factor of five in cost, and the total stage ms
      //   is the SAME number under either reading (few expensive full passes vs
      //   many cheap sampled ones), so the stage timer alone cannot tell them
      //   apart — an attribution was derived from it that this counter has to
      //   settle. The discriminator is whether the spike pattern COMPRESSED into
      //   ranges: teach writes are group-tiled and should, a scattered pattern
      //   cannot, and the difference decides who runs the heaviest op in the walk.
      const _sPre = this._intraOjaStats || (this._intraOjaStats = { gpu: 0, cpuFull: 0, cpuShadow: 0, boundGpu: 0, boundNoShadow: 0 });
      _sPre.activeSum = (_sPre.activeSum || 0) + _act.length;
      _sPre.calls = (_sPre.calls || 0) + 1;
      if (this._gpuProxyReady && this._gpuProxy && typeof this._gpuProxy.hebbianRanges === 'function') {
        try {
          const _postRanges = indexRanges(_act);
          const _preRanges = _postRanges ? denseActiveRanges(pre) : null;
          if (!_postRanges) {
            _sPre.rangesNullPost = (_sPre.rangesNullPost || 0) + 1;
            // ⭐ `SHADOWCOST.5` — WHICH refusal, and how far over. `empty` costs
            //   nothing (the "full CPU pass" is a no-op on a zero active set);
            //   `runs` is the expensive one and is the only one a bigger cap can
            //   fix; `total` is the donor's real 2M limit and must stay refused.
            //   `runsMax` says how far past the cap the worst pattern went, so
            //   the next cap choice is a read rather than a guess.
            const _r = rangeFail.reason || 'unknown';
            _sPre[`rangesFail_${_r}`] = (_sPre[`rangesFail_${_r}`] || 0) + 1;
            if (rangeFail.runs > (_sPre.rangesRunsMax || 0)) _sPre.rangesRunsMax = rangeFail.runs;
            // ⭐ `REBINDWAIT.2` — A MAX CANNOT PRICE A CAP, and this is the second
            //   time that has bitten. `rangesRunsMax` climbed 51,330 → 362,859 →
            //   1,088,767 in three presses, and at ~1.09M runs a frame is ~34.8 MB
            //   ≈ 893 ms of wire against a CPU pass measured at 886 ms — dead
            //   break-even, so "raise the cap to the max" is NOT automatically
            //   right. What decides it is the DISTRIBUTION: if most refusals sit
            //   just past the cap, a small raise captures them cheaply; if they
            //   cluster near the max, ranges are the wrong carrier and the answer
            //   is a different verb, not a bigger number. Sum + buckets, so the
            //   next choice is a read.
            _sPre.rangesRunsSum = (_sPre.rangesRunsSum || 0) + rangeFail.runs;
            // ⛔ `READBACKEYE.3` — BUCKETS MUST BE ABSOLUTE, NOT CAP-RELATIVE.
            //   These were `RANGE_MAX_RUNS * 2/4/16`, so every bucket silently
            //   changed meaning whenever the cap moved — `le2x` meant "≤131,072"
            //   at a 65,536 cap and "≤32" at 16, and two boots' numbers could
            //   not be compared or added. A bucket whose boundary is a variable
            //   is an instrument that lies by construction. Fixed edges now, so
            //   the distribution is the same measurement across every cap change
            //   and directly answers "what would a donor cap of N buy us?".
            const _b = rangeFail.runs <= 16 ? 'le16'
              : rangeFail.runs <= 64 ? 'le64'
                : rangeFail.runs <= 256 ? 'le256'
                  : rangeFail.runs <= 1024 ? 'le1k'
                    : rangeFail.runs <= 8192 ? 'le8k'
                      : rangeFail.runs <= 65536 ? 'le64k' : 'gt64k';
            _sPre[`rangesRunsBucket_${_b}`] = (_sPre[`rangesRunsBucket_${_b}`] || 0) + 1;
          } else if (!_preRanges) {
            _sPre.rangesNullPre = (_sPre.rangesNullPre || 0) + 1;
            const _r = rangeFail.reason || 'unknown';
            _sPre[`rangesFailPre_${_r}`] = (_sPre[`rangesFailPre_${_r}`] || 0) + 1;
          } else {
            // ⭐ `READBACKEYE.3` — THE ACCEPTED SIDE NEEDS A DISTRIBUTION TOO, and
            //   its absence is why the blast radius of the 16-range drop could
            //   not be stated. `rangesRunsOkMax` alone answers "how big did one
            //   get?"; what decides whether a donor cap raise is worth a release
            //   is how many, and how big, ACROSS the population.
            //   ⚠ Measured on `.length` of the arrays actually shipped, not on
            //   `rangeFail.runs` — that field holds whichever helper ran LAST
            //   (the pre side here), while the donor checks BOTH sides
            //   independently. The quantity that decides acceptance is the max
            //   of the two, so that is the quantity recorded.
            const _okRuns = Math.max(_preRanges.length, _postRanges.length);
            if (_okRuns > (_sPre.rangesRunsOkMax || 0)) _sPre.rangesRunsOkMax = _okRuns;
            _sPre.rangesOk = (_sPre.rangesOk || 0) + 1;
            _sPre.rangesRunsOkSum = (_sPre.rangesRunsOkSum || 0) + _okRuns;
          }
          if (_preRanges && _postRanges) {
            _gpuCarried = this._gpuProxy.hebbianRanges(`${this.name}_intraSynapses`, lr, 1, _preRanges, _postRanges) === true;
          }
        } catch { _gpuCarried = false; _sPre.rangesThrew = (_sPre.rangesThrew || 0) + 1; }
      }
      this._intraOjaShadowCounter = (this._intraOjaShadowCounter | 0) + 1;
      const _s = _sPre;
      if (_gpuCarried) _s.gpu = (_s.gpu || 0) + 1;
      if (!_gpuCarried || (this._intraOjaShadowCounter % 5 === 0)) {
        if (_gpuCarried) _s.cpuShadow = (_s.cpuShadow || 0) + 1; else _s.cpuFull = (_s.cpuFull || 0) + 1;
        // ⚠ Named because this is the PRIME SUSPECT for the slow-Oja line, and
        //   it was indistinguishable from a cross-projection in the log. The
        //   intra matrix is the biggest thing in the cluster — `stageProfile`
        //   put `hebbian.intra` at 8.57 h of a 18.9 h run — and its non-zero
        //   count is the right order for the 452.5M the warning reports.
        // ⭐ `SHADOWCOST.1` — TIME the CPU pass, don't make the reader divide.
        //   `hebbian.intraMs` is the whole stage; attributing it to the shadow
        //   meant dividing by the hardcoded cadence and trusting the arithmetic.
        //   `cpuMs` is the shadow's own wall cost, so "what would widening the
        //   cadence buy?" becomes a subtraction on the board.
        const _shadow0 = Date.now();
        await this._ojaUpdateChunked(this.synapses, pre, post, lr, { activeRows: _act, projName: 'intraSynapses' });
        const _cpuDt = Date.now() - _shadow0;
        _s.cpuMs = (_s.cpuMs || 0) + _cpuDt;
        // ⭐ `SHADOWCOST.5` — SPLIT THE TWO CPU COSTS. `cpuMs` alone cannot say
        //   whether the CPU time is the sampled shadow (a checkpoint-fidelity
        //   choice, and a trade to widen) or a full pass the GPU refused to
        //   carry (pure waste, and free to remove). Aiming a fix at the wrong
        //   half is exactly what the aggregate invited once already.
        if (_gpuCarried) _s.cpuShadowMs = (_s.cpuShadowMs || 0) + _cpuDt;
        else _s.cpuFullMs = (_s.cpuFullMs || 0) + _cpuDt;
      }
    } else if (this._sparsePool && this._sparsePool.ready) {
      try {
        // Pool path keeps bare Hebbian (external worker RPC doesn't
        // expose ojaUpdate). Browser-only scale is below the overlap
        // threshold where Oja's decorrelation matters, so the shadow
        // stays acceptable.
        await this._sparsePool.hebbianUpdate(this.synapses, pre, post, lr);
      } catch {
        // Pool failed — fall back to synchronous Oja so the update
        // still happens with the correct plasticity rule.
        this.synapses.ojaUpdate(pre, post, lr);
      }
    } else {
      this.synapses.ojaUpdate(pre, post, lr);
    }
    // T18.18 — GPU SHADOW DISPATCH REMOVED. Pre-T18.18 this block fired
    // `this._gpuProxy.hebbian(key, pre, post, lr)` fire-and-forget as a
    // GPU shadow update. At biological scale intra-synapses is STANDALONE
    // (per initGpu: "Intra-synapses always ship standalone — it runs on
    // its own pre/post buffers, not bound into another cluster's spike
    // buffer"). The server's `gpuSparseHebbian` does:

    //   const pre  = Uint32Array.from(preSpikes);   // 107M × 4 = 428 MB
    //   const post = Uint32Array.from(postSpikes);  // 428 MB
    //   Buffer.concat([hdr, lenPre, preBuf, lenPost, postBuf]);  // 856 MB

    // ~1.7 GB transient allocation PER CALL, held until _sparseSendBinary
    // finishes WebSocket transmission. Fire-and-forget means no await
    // gates the caller; Buffer references stack in V8 semi-space. At
    // Phase 2 rate (300 calls × 1.7 GB = 510 GB attempted transfer over
    // 214s) the localhost WebSocket ceiling (~1.2 GB/sec) drains only
    // ~256 GB → queue stays half-full. When _teachLetterCaseBinding
    // fires 624 more iterations, V8 semi-space exhausts → "Committing
    // semi space failed" → Node OOM. Meanwhile compute.html's WebSocket
    // back-pressure chokes the GPU device → device.lost fires. the operator
    // 2026-04-19 cascade #5 (after T18.10/11/14 closed the prior four).

    // Removing the GPU shadow is SAFE because:
    //  (a) CPU worker-pool path above is already authoritative (T17.2
    //      / T17.7 comment block). All teach-phase reads of intra-
    //      synapses weights go through `cluster.synapses.propagate`
    //      (CPU CSR), never the GPU shadow.
    //  (b) Probes at biological scale use direct-pattern probe pattern
    //      reading CPU synapses. No probe reads GPU intra-synapses
    //      weights.
    //  (c) Tick-loop GPU propagate on intra-synapses uses the GPU
    //      weights from initGpu upload and will miss weight updates
    //      during teach. Acceptable — direct-pattern Hebbian writes
    //      `cluster.lastSpikes` directly (bypassing Rulkov dynamics), so
    //      teach doesn't depend on tick-loop accuracy. If live-chat
    //      quality later suffers, a periodic batched CPU→GPU sync can
    //      be added as T18.19 (deferred until measured).

    // Cross-projection Hebbian (T18.17 GPU-bound fast path) is NOT
    // affected — those run through T18.8 batched dispatch in bound mode
    // shipping ~50 bytes per op (no pre/post bulk data).
  },

  /**
   * BCM sliding-threshold update on the intra-cluster synapse matrix.
   * Requires a per-neuron firing-rate target θ; on first call, lazy-
   * inits `_bcmTheta` to a Float32Array of size `this.size` populated
   * at 0.05 (prior to biological calibration). Every call:
   *
   *   1. Low-pass θ against the current post-spike vector:
   *        θ[i] ← (1−α)·θ[i] + α·y[i]²
   *   2. Apply the BCM delta:
   *        Δw[i,j] = lr × y[i] × (y[i] − θ[i]) × x[j]
   *
   * `α` defaults to 0.01 (slow drift — matches biological sliding-
   * threshold timescales of ~100-1000 teach events). Opt-in via
   * `cluster._bcmEnabled = true`. Silent no-op when disabled so the
   * teach path stays Oja-only by default. Ship-and-monitor: operator
   * can flip the flag in a session to test whether BCM improves Oja's
   * sep-probe numbers, without risking a default-on change to every
   * localhost run.
   */
  intraSynapsesBcm(pre, post, lr, alpha = 0.01) {
    if (!this._bcmEnabled) return;
    if (!this.synapses || typeof this.synapses.bcmUpdate !== 'function') return;
    if (!this._bcmTheta || this._bcmTheta.length !== this.size) {
      this._bcmTheta = new Float32Array(this.size);
      this._bcmTheta.fill(0.05);
    }
    const theta = this._bcmTheta;
    const oneMinusAlpha = 1 - alpha;
    // Sparse theta update — only touch entries where post fired this
    // call. At biological scale with typical ~1-5% firing fraction,
    // this is ~15-75K ops per call instead of a full-size 1.5M sweep.
    for (let i = 0; i < this.size; i++) {
      const y = post[i];
      if (y) {
        theta[i] = oneMinusAlpha * theta[i] + alpha * y * y;
      } else {
        // Tiny decay on silent neurons so θ drifts toward zero for
        // neurons that stop firing entirely. Without this θ would
        // stay pinned at its last-firing value forever.
        theta[i] = oneMinusAlpha * theta[i];
      }
    }
    this.synapses.bcmUpdate(pre, post, theta, lr);
  },

  /**
   * Anti-Hebbian update on every cross-region projection. GPU dispatch
   * only — at biological scale sem_to_motor's CPU CSR is selectively
   * freed so the CPU anti-Hebbian can't land on cross-projections.
   * Routes through the batched plasticity queue with a NEGATIVE lr,
   * which the PLASTICITY_SHADER branches on to apply pure co-active
   * decrement instead of Oja's self-normalizing update. Silent no-op
   * when the GPU proxy is unavailable — in that case contrastive
   * push-pull rides intra-cluster recurrent matrix only.
   */
  async _crossRegionAntiHebbian(lr, opts = {}) {
    if (!this.crossProjections) return;
    if (!this._gpuProxyReady || !this._gpuProxy || typeof this._gpuProxy.antiHebbianBound !== 'function') return;
    const absLr = Math.abs(lr);
    // opts.projectionsWhitelist scopes anti-Hebbian dispatch the same
    // way _crossRegionHebbian does. Contrastive anti-pair training
    // (negative samples in _teachAssociationPairs / _teachQABinding)
    // would otherwise fire anti-Hebbian on all 16 projections per
    // sample, decaying letter_to_motor / phon_to_letter on top of
    // the positive-pair fan-out.
    const wl = opts.projectionsWhitelist;
    const whitelistSet = wl
      ? (wl instanceof Set ? wl : new Set(wl))
      : null;
    for (const name of Object.keys(this.crossProjections)) {
      if (whitelistSet && !whitelistSet.has(name)) continue;
      const proj = this.crossProjections[name];
      if (!proj || !proj._gpuBound) {
        // Mirror the null-CSR / unbound one-shot warn pattern from
        // _crossRegionHebbian so debugging anti-Hebbian no-fires has
        // a discoverable log line instead of silent skip.
        if (proj && (!proj.values || !proj.colIdx || !proj.rowPtr) && !proj._nullCsrAntiHebbianWarned) {
          proj._nullCsrAntiHebbianWarned = true;
          console.warn(`[Cluster ${this.name}] Anti-Hebbian skip on ${name} — CPU CSR null AND not GPU-bound (gpuBound=${!!proj._gpuBound} gpuProxyReady=${!!this._gpuProxyReady}).`);
        }
        continue;
      }
      try {
        this._gpuProxy.antiHebbianBound(`${this.name}_${name}`, absLr);
      } catch { /* non-fatal — GPU proxy batch backpressured */ }
    }
  },

  /**
   * Anti-Hebbian update on the intra-cluster synapse matrix. Depresses
   * co-active (pre=1, post=1) weights so sampled-wrong pairs push apart
   * instead of superposing. Used by the push-pull contrastive teach path:
   * caller fires the positive-pair Oja update first, then invokes this
   * method with a sampled WRONG post-pattern to repel it from the
   * pre-pattern in weight space.
   *
   * Sync at biological scale (matches `intraSynapsesHebbian`'s bio-path
   * branch) — zero external-memory allocation, single CSR walk. `lr`
   * here is always POSITIVE; the method handles the sign internally.
   */
  async intraSynapsesAntiHebbian(pre, post, lr, opts = {}) {
    if (!this.synapses) return;
    if (!this._teachSubstrateReady('intraSynapsesAntiHebbian')) return;
    if (typeof this.synapses.antiHebbianUpdate !== 'function') return;
    // GINTRA — same GPU-bound law as intraSynapsesHebbian: NEGATIVE lr on the
    // bound op routes to the plasticity anti branch (the exact sign-selection
    // the sem_to_motor contrastive pass already uses in production). Identity
    // check keeps custom-vector callers on the CPU path; the shadow's
    // final-rep/sampled cadence matches the positive pass.
    if (pre === this.lastSpikes && post === this.lastSpikes
        && this.synapses._gpuBound && this._gpuProxyReady
        && this._gpuProxy && this._gpuProxy.hebbianBound
        && this._brain && this._brain._langPseudoInit === true) {
      try { this._gpuProxy.hebbianBound(`${this.name}_intraSynapses`, -Math.abs(lr)); } catch { /* non-fatal */ }
      if (this._teachIntermediateRep === true) return;
      // TIME-BASED SHADOW CADENCE (2026-08-17) — same law as the positive
      // pass above; per-direction timestamp so a busy positive lane can't
      // starve the anti shadow (they write opposite signs into the same
      // matrix and probes read both effects).
      const _sampleN = this._teachFinalRepSampleEveryN | 0;
      if (_sampleN > 1) {
        const _nowSh = Date.now();
        const _gapSh = (this._intraShadowMinGapMs | 0) > 0 ? (this._intraShadowMinGapMs | 0) : 30000;
        if (_nowSh - (this._lastIntraAntiShadowMs || 0) < _gapSh) return;
        this._lastIntraAntiShadowMs = _nowSh;
      }
    }
    const BIOLOGICAL_SCALE_SYNC_THRESHOLD = 100_000;
    const atBioScale = (this.size | 0) > BIOLOGICAL_SCALE_SYNC_THRESHOLD;
    if (atBioScale) {
      // #37 — CHUNK the intra-synapse anti-Hebbian like the Oja path above so
      // the contrastive push-pull pass doesn't block the event loop at
      // biological scale (same residual [EventLoop] BLOCKED cause).
      // TW S2 — active-row iteration (see intraSynapsesHebbian): one typed
      // scan of `post` replaces the full row-range walk; antiHebbianUpdate is
      // post-gated so skipped rows are exact no-ops — bit-identical.
      // CALLER-SUPPLIED ACTIVES (2026-08-17). At the 12M cortex this scan
      // itself became the cost: ~360ms of full-cluster walk per call to find
      // a few thousand actives the caller often SET by index moments earlier
      // (measured live: _teachLateralInhibition at 364ms/call, once per pair
      // per rep — a pair-phase band-blocker). When the caller passes its
      // active indices the scan is skipped; the update is identical either
      // way (the same rows, the same math). Callers that don't know their
      // actives keep the scan exactly as before.
      const _act = Array.isArray(opts.activeRows) ? opts.activeRows : (() => {
        const a = [];
        for (let _i = 0; _i < post.length; _i++) { if (post[_i]) a.push(_i); }
        return a;
      })();
      await this._antiHebbianChunked(this.synapses, pre, post, lr, { activeRows: _act });
    } else if (this._sparsePool && this._sparsePool.ready && typeof this._sparsePool.antiHebbianUpdate === 'function') {
      try {
        await this._sparsePool.antiHebbianUpdate(this.synapses, pre, post, lr);
      } catch {
        this.synapses.antiHebbianUpdate(pre, post, lr);
      }
    } else {
      this.synapses.antiHebbianUpdate(pre, post, lr);
    }
    // No GPU shadow dispatch — intra-synapses GPU plasticity uses the
    // positive Oja path only. Biological scale reads intra-synapses
    // weights via CPU CSR for probes so the CPU anti-Hebbian update is
    // what counts for contrastive push-pull.
  },
};
