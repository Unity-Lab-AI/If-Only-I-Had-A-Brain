// ServerBrain GPU mixin — extracted from brain-server.js per the
// per-concern split (see server/brain-server/README.md). Attached to
// ServerBrain.prototype via Object.assign at brain-server.js entry-point
// bottom.
//
// Methods in this mixin (20 total) — all GPU sparse-protocol comms with
// the compute.html client:
//   _gpuStep(clusterName)                                 — single-cluster GPU step
//   _gpuBatch(substeps, clusterParams)                    — batched GPU step
//   _nextSparseReqId()                                    — request ID generator
//   _sparseSend(msg, timeoutMs)                           — JSON sparse dispatch
//   _encodeSparseHeader(typeByte, reqId, name)            — binary header encoder
//   _sparseSendBinary(msgBuffer, reqId, timeoutMs)        — binary sparse dispatch
//   gpuDrainWait()                                        — wait for GPU queue drain
//   _gpuSparseFlowOk()                                    — backpressure flow check
//   gpuSparseUpload(name, matrix, binding)                — upload sparse matrix
//   gpuSparsePropagate(name, preSpikes)                   — sparse forward propagate
//   gpuSparseHebbianBound(name, lr)                       — bound-projection hebbian
//   _enqueueBoundHebbian(name, lr)                        — batch queue helper
//   _flushBoundHebbianBatch()                             — batch flush dispatch
//   gpuSparsePropagateBound(name)                         — bound forward propagate
//   _gpuWriteCortexSpikeSlice(regionName, sparseIndices)  — write spike sub-slice
//   _gpuWriteCortexCurrentSlice(regionName, indices, values) — write current sub-slice
//   _gpuClearCortexSpikeRegion(regionName)                — clear spike region
//   gpuReadbackCortexLetterBuckets(regionName, bucketCount, subSliceLen, startOffset) — readback
//   _ensureCortexCrossProjectionsBound()                  — bind cross-projections to main cortex slices
//   gpuSparseHebbian(name, preSpikes, postSpikes, lr)     — standalone hebbian (legacy)
//
// All methods reference brain state via `this.` — fully prototype-chain
// compatible. They access this._gpuClient (the compute.html WS), the
// sparse-protocol request map, the pending-batch queue, etc.

// Module-level requires. Pre-fix the P4.3.a extraction did not bring
// these along — the mixin relied on the parent brain-server.js scope
// which doesn't work across module boundaries in CommonJS. Caught by
// operator 2026-06-17 live test boot crash cascade in memory.js but
// affecting every mixin file.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// DF.7 milestone ladder — QUANTIZED neuron targets for resizes. Module-scope +
// exported so the BOOT allocator (brain-server.js SELF-SEEDING BOOT) and the
// runtime decision layer read the SAME ladder (no drift). Size gates on the
// size-driver capacity; minCommunityMB/minDonors are telemetry/legacy fields.
/* ⏱ THE READBACK IDLE WINDOW — how long the donor may go SILENT before a values
 * pull is abandoned. Not a total-transfer budget: the deadline re-arms on every
 * chunk, so a slow-but-moving transfer is never killed.
 *
 * ⚠ DERIVED, NOT PICKED. The measured wire rate is ~39 MB/s and the chunk size
 * is well under a megabyte, so chunks arrive milliseconds apart while a transfer
 * is healthy. 120 s is therefore ~4 orders of magnitude above the normal
 * inter-chunk gap — comfortably past any GC pause, teach-loop block or flood-lane
 * queueing delay, while still failing fast when the donor genuinely stops.
 * `DREAM_READBACK_IDLE_MS` overrides.
 */
const READBACK_IDLE_MS = (typeof process !== 'undefined' && Number(process.env.DREAM_READBACK_IDLE_MS) > 0)
  ? Number(process.env.DREAM_READBACK_IDLE_MS) : 120_000;

const DF7_MILESTONES = [
  { minCommunityMB: 0,       minDonors: 1,  neurons: 6_000_000 },   // tier 0 — bootstrap, fits a modest GPU
  { minCommunityMB: 24_000,  minDonors: 3,  neurons: 40_000_000 },  // tier 1 — a few mid GPUs
  { minCommunityMB: 96_000,  minDonors: 6,  neurons: 150_000_000 }, // tier 2 — community momentum
  { minCommunityMB: 256_000, minDonors: 10, neurons: 357_000_000 }, // tier 3 — top-computer scale
  // ── TIERTOP (2026-08-20) — THE LADDER USED TO END HERE, AND THAT WAS THE CAP ──
  //
  // Raised four times over, on a rented A6000 reading 21% VRAM: a paid-for GPU
  // is expected to be fully used. Tier 3 was the last rung, we were
  // already standing on it (306,458,816 after the host-RAM trim), so NO donor
  // however large could move the brain — a 45,488MB card qualifies
  // ~1,681,286,758 neurons of capacity and the ladder had nowhere to put them.
  // A ceiling that cannot be climbed past is indistinguishable from a bug when
  // the operator is paying by the hour.
  //
  // These rungs do NOT make the brain bigger by themselves. Sizing is still
  // clamped by `_safeMB` in the boot allocator (45% of coordinator host RAM,
  // always leaving >=13GB for Forgejo + OS), because the coordinator holds the
  // CPU-side master copy of everything the donor computes on. The ladder simply
  // stops being the binding constraint, so the brain grows to whatever the box
  // can actually hold and KEEPS growing automatically if the box is ever
  // upgraded — instead of needing this file edited again.
  //
  // Spacing keeps the ~2.5-3x step of the existing rungs so a resize is always
  // a decisive jump (each one costs a fresh walk) rather than a churn of small
  // ones. The top rung is deliberately past what any single card today can
  // hold, so the ladder is not the thing anyone has to revisit next time.
  { minCommunityMB: 640_000,   minDonors: 16, neurons: 900_000_000 },    // tier 4 — a full pro card (48GB class)
  { minCommunityMB: 1_600_000, minDonors: 32, neurons: 2_400_000_000 },  // tier 5 — multi-card pool
  { minCommunityMB: 4_000_000, minDonors: 64, neurons: 6_000_000_000 },  // tier 6 — headroom; NOT the limit, the box is
];

// Bytes of VRAM budgeted per main-brain neuron — the allocator's number
// (brain-server.js BRAIN_VRAM_ALLOC reads it from here) AND the primary-floor
// estimator's. One constant, one place, so the floor and the allocation can
// never disagree again.
const MAIN_BRAIN_BYTES_PER_NEURON = 21;

const SERVER_GPU_MIXIN = {
  async _gpuStep(clusterName) {
    // UPLOAD PRIORITY — while the canonical cortex upload is in flight, PAUSE
    // compute-batch dispatch. The donor services WS messages between compute
    // work; at 306M scale continuous batches starve the upload ACKs (live:
    // acks took 45s+ x3 retries per matrix once BATCHED RUNNING preceded the
    // upload, vs ~1s each when uploads ran first — the curriculum sat idle
    // behind a ~30min serialized timeout grind). Bounded: the flag clears
    // when initGpu resolves; stepping resumes immediately after.
    if (this._cortexUploadInFlight) return null;
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return null;
    if (!this._gpuPending) this._gpuPending = {};
    if (!this._gpuInitialized) this._gpuInitialized = {};

    const size = this.CLUSTER_SIZES[clusterName];

    if (!this._gpuInitialized[clusterName]) {
      // FIRST DISPATCH — tell GPU to create buffers at Vrest
      // DO NOT send voltage array — at 25.6M neurons that's 260MB base64.
      // GPU initializes its own voltages at Vrest. Same result, zero transfer.

      // T17.7 Phase B.1 — regions metadata with L/R side tags. For the
      // main cortex cluster, register the 8 language sub-regions with
      // their biological lateralization (left-dominant for language
      // production/recognition; bilateral for sensory primaries + free
      // working memory). Other clusters get a single bilateral or
      // center tag to match real neuroanatomy. When compute.html
      // processes gpu_init with this metadata, uploadCluster stores
      // the regions on bufs.regions and the Ψ-modulated hemisphere
      // gate pipeline (Phase A.3) automatically activates for this
      // cluster's LIF dispatch. Zero additional wire-up needed.
      const regions = this._regionsFor(clusterName, size);
      this._gpuClient.send(JSON.stringify({
        type: 'gpu_init',
        clusterName,
        size,
        tonicDrive: this.tonicDrives[clusterName],
        noiseAmp: this.noiseAmplitudes[clusterName],
        lifParams: { tau: 20, Vrest: -65, Vthresh: -50, Vreset: -70, dt: 1, R: 1, tRefrac: 2 },
        regions,
      }));
      this._gpuInitialized[clusterName] = true;
      const regionCount = regions ? Object.keys(regions).length : 0;
      console.log(`[Brain] GPU init sent: ${clusterName} (${size.toLocaleString()} neurons${regionCount > 0 ? `, ${regionCount} sub-regions` : ''})`);
      return Promise.resolve(null);
    }

    // STEP — send cluster params + hierarchical modulation.
    // GPU applies the FULL current equation:
    //   I = (tonicDrive × driveBaseline × emotionalGate × gainMultiplier + errorCorrection)
    //       + noise × noiseAmp
    // These are the same modulation factors engine.js applies on the client side.
    const p = this.persona;
    // CGATE.4 — use the self-calibrating Ψ gain computed in the psi update
    // (baseline-relative tanh, set on `this.psiGain`); fall back to a neutral
    // 1.0 only before the first psi update has run.
    const psiGain = (typeof this.psiGain === 'number' && isFinite(this.psiGain)) ? this.psiGain : 1.0;
    // One owner for the gate — see `_emotionalGate` on the server brain. This
    // builder had the gain right and the gate inlined; the batched builder had
    // both wrong. Neither now restates an equation.
    const emotionalGate = this._emotionalGate();
    const driveFactor = 0.8 + ((this.clusters.hypothalamus?.spikeCount || 0) > 100 ? 0.4 : 0.0);
    const errorSignal = clusterName === 'cortex' || clusterName === 'basalGanglia'
      ? -(this.clusters.cerebellum?.spikeCount || 0) / (this.CLUSTER_SIZES.cerebellum || 1) * 2 : 0;

    this._gpuClient.send(JSON.stringify({
      type: 'compute_request',
      clusterName,
      size,
      tonicDrive: this.tonicDrives[clusterName],
      noiseAmp: this.noiseAmplitudes[clusterName],
      // Hierarchical modulation from brain equations
      gainMultiplier: psiGain,          // Ψ consciousness gain
      emotionalGate,                     // amygdala arousal amplification
      driveBaseline: driveFactor,        // hypothalamus homeostatic drive
      errorCorrection: errorSignal,      // cerebellum error feedback
      reward: this.reward,               // for future plasticity
    }));

    // T14.23 — (see _gpuBatch below for the batched protocol).

    // T14.22.5 — GPU timeout raised 800ms → 10000ms.

    // At 677M-neuron biological scale, a single GPU fullStep takes ~40ms
    // for small clusters and can exceed 300ms for cerebellum (268M
    // neurons × compute.html's serialized Promise queue from T14.22.3
    // = 7 clusters × ~50ms each = ~350ms per substep average). With
    // multiple clusters queued behind one another, individual
    // compute_results can land 500-2000ms after the request was sent.

    // The old 800ms cap was silently killing every compute_result that
    // arrived late, resolving the pending promise to null, causing the
    // tick loop to record spikeCount=0 for that cluster, and the UI
    // cards + 3D brain visualization to stay at zero even though the
    // GPU was actually computing real spike counts. This is one of
    // the two remaining reasons the UI looked dead at biological scale.

    // Raised to 10 seconds — plenty of headroom even at the largest
    // single-GPU tier. If a compute_result takes more than 10 seconds,
    // something is genuinely broken (GPU hang, dropped WebSocket) and
    // the tick loop should skip that cluster and log.
    return new Promise((resolve) => {
      this._gpuPending[clusterName] = resolve;
      setTimeout(() => {
        if (this._gpuPending[clusterName] === resolve) {
          delete this._gpuPending[clusterName];
          console.warn(`[Brain] GPU compute_result for ${clusterName} timed out after 10s — GPU may be hung`);
          resolve(null);
        }
      }, 10000);
    });
  },

  /**
   * T14.23 — BATCHED GPU dispatch.
   *
   * Sends ONE compute_batch message containing all per-cluster
   * parameters, waits for ONE compute_batch_result response.
   * compute.html runs the full SUBSTEPS × clusters loop internally
   * with parallel per-substep cluster dispatches. Cuts the per-tick
   * WebSocket message count from ~70 (10 substeps × 7 clusters) to
   * 2 (one request + one response), eliminating the 6× protocol
   * overhead that was dominating tick latency at biological scale.
   *
   * @param {number} substeps — how many LIF steps to run this tick
   * @param {Array<{name, size, tonicDrive, noiseAmp, gainMultiplier,
   *                emotionalGate, driveBaseline, errorCorrection, reward}>} clusterParams
   * @returns {Promise<{perCluster: Object} | null>}
   */
  async _gpuBatch(substeps, clusterParams, opts = {}) {
    // ── SILENT-STALL WATCHDOG (2026-08-14) ──
    // On 2026-08-14 the brain stopped computing for MINUTES and nothing
    // said a word: `gpuHits` frozen at 147, `gpuMisses` 0 (so no timeout
    // ever fired), `totalSpikes` frozen at 803,242, `cellPhasesCompleted`
    // 0 for 41 minutes — while the tick loop span at 663ms/tick and every
    // dashboard panel read green. The failure is invisible BY SHAPE: every
    // early return below hands back `null` silently, so "never dispatched"
    // and "healthy idle" look identical from the outside, and the 180s
    // timeout can only fire for batches that were actually SENT.
    //
    // Track the last SUCCESSFUL completion (stamped in the resolve below).
    // If a donor is connected but completions have stopped, scream and
    // surface it on `_perfStats` so state/dashboard can never hide it
    // again. Detection only — it changes no dispatch behaviour.
    {
      const _now = Date.now();
      const _live = !!(this._gpuClient && this._gpuClient.readyState === 1);
      const _stallMs = this._lastBatchOkMs ? (_now - this._lastBatchOkMs) : 0;
      const _STALL_MS = Number(process.env.DREAM_BATCH_STALL_MS) > 0
        ? Number(process.env.DREAM_BATCH_STALL_MS) : 30000;
      // PAUSE-AWARE (2026-08-14 amendment). A DESIGNED pause must never be
      // reported as a stall: the main tick deliberately stops dispatching
      // while the cortex owns the GPU for a cell's gate probe, or while the
      // canonical upload runs. Screaming then would train everyone to ignore
      // the alarm — and the authoritative, always-runs version of this check
      // now lives in state.js `_getProfilingState` (this copy only catches
      // the case where _gpuBatch IS still being called).
      const _pausedByDesign = !!(this._cortexUploadInFlight
        || (this.cortexCluster && this.cortexCluster._probeGateActive));
      // PAUSE-END ANCHOR (2026-08-16) — stamp designed pauses here too, and
      // measure the stall from max(lastBatchOk, pauseSeen): this method isn't
      // called DURING a pause, so its first post-pause call used to see the
      // stale pre-pause anchor with the flag already false (the 709s ⛔ false
      // alarm right as the canonical upload settled).
      if (_pausedByDesign) this._designedPauseSeenMs = _now;
      // PSITEACH.2 — the boot time joins the anchor and the `_lastBatchOkMs`
      // gate is gone: a boot on which NO batch has EVER completed used to be
      // exactly the case this watchdog could never see (no anchor → no alarm),
      // and a 17-hour all-timeouts boot ran silent. "Never completed since
      // boot" is a stall, not an absence of data.
      const _sinceAnchorMs = _now - Math.max(this._lastBatchOkMs || 0, this._designedPauseSeenMs || 0, this._startedAt || 0);
      if (!_pausedByDesign && _live && _sinceAnchorMs > _STALL_MS) {
        this._perfStats.batchStall = {
          stalledMs: _sinceAnchorMs,
          lastOkAt: this._lastBatchOkMs,
          donorBufferedMB: +(((this._gpuClient.bufferedAmount || 0) / 1048576).toFixed(1)),
          substeps,
        };
        if (!this._batchStallLogMs || (_now - this._batchStallLogMs) > 30000) {
          this._batchStallLogMs = _now;
          const _c = (this.clients && this.clients.get) ? this.clients.get(this._gpuClient) : null;
          console.error(`[Brain] ⛔ COMPUTE STALL — no compute_batch has COMPLETED in ${(_sinceAnchorMs / 1000).toFixed(0)}s while a donor is connected (measured from the last completion OR the last designed pause, whichever is later). The brain is not stepping: spikes are frozen and the walk cannot pass a gate. donor buffered=${((this._gpuClient.bufferedAmount || 0) / 1048576).toFixed(1)}MB rtt=${_c && _c.rttMs != null ? _c.rttMs : '?'}ms substeps=${substeps}. Suspect the donor link is saturated (teach lane) or the donor cannot service its socket while computing. Rate-limited 30s.`);
        }
      } else if (this._perfStats && this._perfStats.batchStall && (_pausedByDesign || _sinceAnchorMs <= _STALL_MS)) {
        // EM.4 — recovered OR paused-by-design clears the banner. Without the
        // paused clause a stall object written just before a probe gate opened
        // LATCHED for the whole cell (this method is never called while the
        // gate holds the tick), so `state.perf.batchStall` contradicted the
        // pause-aware `profiling.throughput.batchPaused` all cell long.
        this._perfStats.batchStall = null;
      }
    }
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return null;

    // Defensive pre-flight: if the GPU device is known lost, skip sending
    // immediately. compute.html forwards device.lost events to the server;
    // if the flag is set the device is dead until compute.html reconnects.
    // Sending compute_batch anyway just guarantees a 15s timeout and
    // wastes one tick window. Surface the condition through a throttled
    // warn (first occurrence + once per 30 s) instead of silently
    // eating it.
    if (this._gpuDeviceLost) {
      const now = Date.now();
      if (!this._gpuLostWarnAt || (now - this._gpuLostWarnAt) > 30000) {
        console.warn('[Brain] compute_batch skipped — GPU device lost (awaiting compute.html reconnect + re-init).');
        this._gpuLostWarnAt = now;
      }
      return null;
    }

    // Defensive pre-flight: bound Hebbian queue backpressure. When the
    // batched Hebbian dispatch queue sits near its cap the compute.html
    // message pump has a large backlog; firing compute_batch on top of
    // that can stall while the queue drains, manifesting as a 15s
    // compute_batch timeout even though the GPU itself isn't hung.
    // Log a leading-edge warn when queue > 75% of cap so the hang
    // attribution is visible.
    const boundHebbianPending = this._boundHebbianBatch?.ops?.length || 0;
    const BOUND_HEBBIAN_CAP_WARN = Math.floor(256 * 0.75);
    if (boundHebbianPending > BOUND_HEBBIAN_CAP_WARN) {
      const now = Date.now();
      if (!this._hebbianBackpressureWarnAt || (now - this._hebbianBackpressureWarnAt) > 10000) {
        console.warn(`[Brain] bound-Hebbian queue backpressure: ${boundHebbianPending}/256 pending ops ahead of compute_batch — compute.html onmessage pump may be saturated.`);
        this._hebbianBackpressureWarnAt = now;
      }
    }

    // Use a monotonic batch id so late-arriving responses from a
    // previous tick never resolve the current tick's promise.
    this._batchSeq = (this._batchSeq || 0) + 1;
    const batchId = this._batchSeq;
    // The work each returned cluster represents is credited from THIS number,
    // which the server chose, never from a rate the donor reports about itself.
    this._lastBatchSubsteps = substeps;

    const _batchMsg = {
      type: 'compute_batch',
      batchId,
      substeps,
      clusters: clusterParams,
      // Ψ flows to GPU so per-cluster regionGates can be updated every
      // tick via hemisphereGate(side, Ψ). Mystery Ψ is woven into the
      // main equation; lateralized cortex regions modulate drive by
      // Ψ-driven binding coefficient, matching biological split-brain +
      // global-workspace consciousness interpretation.
      // Number.isFinite, not ??: a NaN Ψ becomes JSON null, and one null
      // discards the WHOLE message on pre-v0.3.35 donors (BATCHNULL).
      psi: Number.isFinite(this.psi) ? this.psi : 0,
    };
    // POOL — dispatch each owner ITS clusters under the SAME authoritative
    // batch id, and record who must answer. With one card this is exactly the
    // old single send. The result handler merges partial perCluster maps and
    // resolves when every owner has reported (or the deadline fires and the
    // late ones carry forward — see the handler).
    {
      const _owner = this._clusterOwner instanceof Map ? this._clusterOwner : null;
      const _groups = new Map();
      for (const cp of (clusterParams || [])) {
        if (!cp || !cp.name) continue;
        const _ws = (_owner && _owner.get(cp.name)) || this._gpuClient;
        if (!_ws || _ws.readyState !== 1) continue;
        if (!_groups.has(_ws)) _groups.set(_ws, []);
        _groups.get(_ws).push(cp);
      }
      if (_groups.size === 0) _groups.set(this._gpuClient, clusterParams);
      this._gpuBatchOwners = new Set(_groups.keys());
      for (const [_ws, _sub] of _groups) {
        try { _ws.send(JSON.stringify({ ..._batchMsg, clusters: _sub })); }
        catch { /* a dead owner misses this batch; its clusters carry forward */ }
      }
    }

    // WORKSHARE — mirror the SAME step to every OTHER live donor so it computes and
    // scores. Gn/s is produced by compute_batch alone (donor.rs: gneurons_per_sec =
    // Σcluster sizes × substeps / elapsed) and needs NO synaptic matrices — only
    // gpu_init, which every donor receives seconds after connecting. Until now this
    // message went to the PRIMARY ONLY, so a replica could sit connected for HOURS at
    // 0 Gn/s no matter how much it had synced: it was never asked to compute. A
    // volunteer who sees 0 has no reason to stay, so this is a product bug as much as a
    // scheduling one — the leaderboard could only ever have one name on it.
    //
    // The mirror is FIRE-AND-FORGET and cannot corrupt the tick: it carries
    // `mirror: true` and a distinct negative batchId, so the result handler drops it
    // before the batchId match and the authoritative promise still resolves only from
    // the primary. Stepping its own copy is what a DF.7 data-parallel replica is FOR,
    // and it keeps the replica's LIF state warm instead of cold-starting at promotion.
    //
    // Skipped for a donor whose socket is already backed up past the link cap — it is
    // mid-sync and piling a step on top would slow the sync that makes it useful.
    // ⛔ NEVER UNDER THE POOL. When `_clusterOwner` splits the clusters across
    // cards, every card already got its OWN share in the real batch above; a
    // mirror then re-sent the whole brain (cortex included) to the other cards,
    // which computed it a second time for nothing. One card per job.
    const _poolSplit = this._clusterOwner instanceof Map && this._clusterOwner.size > 0;
    if (!_poolSplit && this._df7Fanout && this._df7Fanout() && typeof this._livePoolDonors === 'function') {
      // MIRRORID — the mirror batchId MUST be a POSITIVE u64. It was `-batchId`, chosen so it
      // could never collide with the real one - but the donor parses it into
      // `ComputeBatch { batch_id: u64 }` (protocol.rs:228), and serde CANNOT deserialize a
      // negative number into an unsigned type. So every mirrored batch failed to parse on
      // arrival and was silently dropped: no mirrored donor had EVER computed since
      // WORKSHARE shipped. The dashboard hid it perfectly - gneurons_per_sec is a PERSISTENT
      // donor-side field, so a card that was once primary keeps showing its old rate while
      // doing nothing, and only a donor that had NEVER been primary (Sponge) read a true 0.
      // A large positive OFFSET keeps the anti-collision property without breaking the type.
      const _MIRROR_ID_BASE = 2000000000;
      const _mirrorBase = { ..._batchMsg, batchId: _MIRROR_ID_BASE + batchId, mirror: true };
      const _mirrorMsg = JSON.stringify(_mirrorBase);
      // MIRRORCAP — do NOT reuse _donorLinkCapBytes (4MB) here. That cap exists to keep
      // HEAVY Hebbian payloads off a congested socket, and reusing it gated the mirror off
      // for exactly the donors that need it: a replica mid-sync sits at 5-40MB buffered by
      // design, so every 0 Gn/s donor was skipped by the very fix meant to give it work.
      // A compute_batch message is a few HUNDRED BYTES of cluster params - it costs the
      // donor link nothing and is processed on the donor own worker. Only a genuinely
      // drowning socket should be spared, so the bound is the shed-class threshold, not
      // the routing cap. Tunable via DREAM_DF7_MIRROR_CAP_MB.
      const _mirrorCapMB = Number(process.env.DREAM_DF7_MIRROR_CAP_MB) > 0
        ? Number(process.env.DREAM_DF7_MIRROR_CAP_MB) : 256;
      const _mirrorCap = _mirrorCapMB * 1024 * 1024;
      // MIRRORDIAG — after four wrong guesses about why one donor stays at 0 Gn/s, this
      // stops being reasoned about and becomes a field read: every 30s, name each donor the
      // mirror was SENT to and each one SKIPPED with the exact reason. Throttled so it can
      // live in production permanently.
      const _diag = [];
      for (const _ws of this._livePoolDonors()) {
        const _dc = (this.clients && this.clients.get) ? this.clients.get(_ws) : null;
        const _who = (_dc && (_dc.gpuName || _dc.id)) || "donor";
        if (_ws === this._gpuClient) { _diag.push(_who + ":PRIMARY(real batch)"); continue; }
        if (!_ws || _ws.readyState !== 1) { _diag.push(_who + ":SKIP(socket not open)"); continue; }
        if (((_ws.bufferedAmount) || 0) > _mirrorCap) { _diag.push(_who + ":SKIP(buffered " + Math.round((_ws.bufferedAmount||0)/1048576) + "MB > cap)"); continue; }
        // COVERAGE-AWARE MIRROR — a PARTIAL replica is only gpu_init'ed for the clusters it
        // covers (line ~1500 skips the rest), so a donor with, say, [cortex, hippocampus]
        // holds 2 of 8 cluster buffers. Sending it the FULL 8-cluster batch references
        // clusters it never initialised, so it cannot run the step and scores 0 Gn/s -
        // exactly what a 5.6GB card was doing while two larger cards worked. Send each
        // partial donor only the clusters it actually holds; it then steps its real subset
        // and earns. A donor covering nothing is skipped rather than sent an empty batch.
        let _msg = _mirrorMsg;
        const _mc = (this.clients && this.clients.get) ? this.clients.get(_ws) : null;
        const _mcov = _mc && _mc.clusterCoverage;
        if (_mcov && _mcov.size) {
          const _sub = (clusterParams || []).filter((cp) => cp && _mcov.has(cp.name));
          if (_sub.length === 0) { _diag.push(_who + ":SKIP(coverage [" + [..._mcov].join("|") + "] matched 0 of " + (clusterParams||[]).length + " params)"); continue; }
          _msg = JSON.stringify({ ..._mirrorBase, clusters: _sub });
        }
        try {
          _ws.send(_msg);
          _diag.push(_who + ":SENT(" + (_mcov && _mcov.size ? _mcov.size + " clusters" : "all") + ")");
        } catch (e) { _diag.push(_who + ":SEND-THREW(" + (e && e.message) + ")"); }
      }
      if (_diag.length && (!this._mirrorDiagAt || (Date.now() - this._mirrorDiagAt) > 30000)) {
        this._mirrorDiagAt = Date.now();
        console.log("[Brain] MIRRORDIAG pool=" + _diag.length + " -> " + _diag.join("  |  "));
      }
    }

    // Timeout budget. Previously 15 s — too short when the main JS
    // event loop gets blocked for >10 s by CPU-side sparse matmul
    // during curriculum gate probes (letter loop + SEQ read nnz
    // sparse matrices synchronously on the main thread). The timer
    // is armed at dispatch, so a blocked event loop can miss the
    // legitimate response even though the GPU answered in microseconds.
    // Bumped to 60 s — still short enough to catch true GPU hangs
    // (TDR would have fired at 2 s system-level anyway) but generous
    // enough for any gate-probe CPU block.
    // iter11-Y / iter11-W fix — bump compute_batch timeout 60s → 180s.
    // Operator caught: "compute_batch 935 timed out after 60s — GPU may
    // be hung. Consecutive timeouts: 1." firing post-curriculum on
    // background tick. At biological scale post-teach with SAB churn +
    // GC pressure, 60s is tight. 180s gives the GPU breathing room
    // without masking real hangs (a true device-lost still surfaces
    // after 3 minutes — long enough for transient pressure to clear).
    const TIMEOUT_MS = 180000;
    // ── TICK-GAP INSTRUMENT — the send→reply stopwatch this loop never had ──
    // `stepTimeMs` measures the WHOLE tick, and `phaseTimingMs` reads null for
    // EVERY donor — not because donors don't report it (compute.html measures
    // substepLoopMs + voltReadbackMs and ships it faithfully) but because the
    // `compute_batch_result` handler resolves `{ perCluster }` ONLY and drops
    // `msg.phaseTimingMs` on the floor, so the read at brain-server.js:4308 is
    // always undefined. Net effect: the single most important number in the
    // brain's loop — how long a thought-frame sits between dispatch and being
    // processed — has never been measured. The
    // 98.5%-GPU-idle gap was therefore attributed by INFERENCE (to donor-side
    // round-trip), while the live evidence points at the server's own
    // single-threaded loop: cpuPercent is normalised across all cores
    // (chat.js `cpuTimeMs / (elapsed * os.cpus().length)`), so the reported 6%
    // on a 16-core box is ~96% of ONE core — and this process is
    // single-threaded (no worker pool). Event-loop delay p50 20ms / max 7315ms
    // corroborates seconds-long stalls.
    //
    // Splits the tick honestly into three parts:
    //   roundTripMs     — dispatch → this promise resolving
    //   donorComputeMs  — the donor's own reported total (null on native)
    //   unaccountedMs   — roundTrip − donorCompute = wire + BLOCKED-loop time
    // EMA-smoothed so one slow tick doesn't read as a trend. Pure telemetry:
    // no dispatch behaviour, no payload, no ordering change.
    const _rtStart = Date.now();
    const _dispatchAtSend = this._gpuDispatchTotal || 0;
    return new Promise((resolve) => {
      const _instrumentedResolve = (value) => {
        // Liveness stamp for the SILENT-STALL WATCHDOG above. Only a real
        // completion counts — the timeout path resolves the raw `resolve`
        // below, so a timing-out donor can never look alive.
        this._lastBatchOkMs = Date.now();
        try {
          const rtMs = Date.now() - _rtStart;
          const donorMs = (value && value.phaseTimingMs
            && Number.isFinite(Number(value.phaseTimingMs.totalMs)))
            ? Number(value.phaseTimingMs.totalMs) : null;
          const t = this._batchTiming || (this._batchTiming = { samples: 0, roundTripEmaMs: 0 });
          t.samples++;
          // SUBSTEPS.6 (2026-08-27) — the counter that answers the filed
          // question directly: "are batches issued at all during the probe
          // gate?" Nothing recorded it, so the answer was being inferred from
          // watching `samples` across polling windows — and `dispatchesDuring`
          // below was nearly misread as this number (it is a per-batch
          // socket-sharing proxy, nothing to do with the gate). Cumulative per
          // boot, like `samples`; the ratio tells the story on any boot.
          if (this.cortexCluster && this.cortexCluster._probeGateActive) {
            t.samplesInProbeGate = (t.samplesInProbeGate | 0) + 1;
          }
          t.roundTripMs = rtMs;
          // EMA over ~20 batches; seeded by the first sample so it converges fast.
          t.roundTripEmaMs = t.samples === 1 ? rtMs : (t.roundTripEmaMs * 0.95 + rtMs * 0.05);
          t.donorComputeMs = donorMs;
          t.unaccountedMs = (donorMs != null) ? Math.max(0, rtMs - donorMs) : null;
          t.donorReports = donorMs != null;
          // DONORTIME.1 — the donor's own split of the time it held the batch.
          // `unaccountedMs` alone says "not the donor", which was enough when
          // the donor was a remote pod behind a 205ms wire. With the donor on
          // localhost the wire is effectively free, so the interesting question
          // moved INSIDE the donor: is it queueing (saturated — batching and
          // scheduling help) or computing (the kernels are the cost)? Those
          // call for opposite work and one number cannot tell them apart.
          const pt = value && value.phaseTimingMs;
          t.donorQueueWaitMs = (pt && Number.isFinite(Number(pt.queueWaitMs))) ? Number(pt.queueWaitMs) : null;
          t.donorComputeOnlyMs = (pt && Number.isFinite(Number(pt.computeMs))) ? Number(pt.computeMs) : null;
          t.substeps = substeps;
          // Sparse dispatches issued while this batch was in flight — the
          // queue-depth proxy (how much other traffic shared the donor socket).
          t.dispatchesDuring = (this._gpuDispatchTotal || 0) - _dispatchAtSend;
          this._perfStats.batchTiming = t;
          if (!this._batchTimingLogMs || (Date.now() - this._batchTimingLogMs) > 30000) {
            this._batchTimingLogMs = Date.now();
            const donorSplit = (t.donorQueueWaitMs != null && t.donorComputeOnlyMs != null)
              ? ` [queue=${t.donorQueueWaitMs.toFixed(0)}ms compute=${t.donorComputeOnlyMs.toFixed(0)}ms]` : '';
            const donorTxt = donorMs != null
              ? `donor=${donorMs.toFixed(0)}ms${donorSplit} · UNACCOUNTED=${t.unaccountedMs.toFixed(0)}ms (wire + blocked loop)`
              : 'donor=not-reported (donor sent no phaseTimingMs — pre-0.3.31 native donor; the unaccounted split needs the donor-side port)';
            console.log(`[Brain] TICK-GAP — compute_batch round-trip ${rtMs}ms (ema ${t.roundTripEmaMs.toFixed(0)}ms) · substeps=${substeps} · ${donorTxt} · sparse dispatches in flight during batch=${t.dispatchesDuring}. Rate-limited 30s.`);
          }
        } catch { /* telemetry must never break a tick */ }
        resolve(value);
      };
      // POOL — the pending record carries who still owes a result and the
      // merged per-cluster map. The handler fills `merged` from each owner
      // and resolves only when `expected` is empty; the deadline below
      // resolves with whatever arrived and names the late owners.
      this._gpuBatchPending = {
        batchId, resolve: _instrumentedResolve,
        expected: new Set(this._gpuBatchOwners || [this._gpuClient]),
        merged: {}, lateOwners: [],
      };
      setTimeout(() => {
        if (this._gpuBatchPending && this._gpuBatchPending.batchId === batchId) {
          // POOL — "AT THEIR OWN SPEED". If SOME owners answered, this is not a
          // hung GPU, it is a slow card: resolve with the partial union so the
          // tick advances on the clusters that did report, and name the late
          // owners on state so the lag is a fact, not a guess. Only a batch
          // with NO answers at all goes down the timeout/kick path below.
          {
            const _p = this._gpuBatchPending;
            const _got = _p && _p.merged ? Object.keys(_p.merged).length : 0;
            if (_got > 0 && _p.expected instanceof Set && _p.expected.size > 0) {
              const _late = [..._p.expected].map((w) => { const c = this.clients && this.clients.get ? this.clients.get(w) : null; return (c && (c.gpuName || c.id)) || 'donor'; });
              this._poolLateOwners = _late;
              this._poolLateCount = (this._poolLateCount | 0) + 1;
              if (!this._poolLateLogAt || (Date.now() - this._poolLateLogAt) > 30000) {
                this._poolLateLogAt = Date.now();
                console.warn(`[Pool] batch ${batchId}: ${_got} cluster(s) reported, owner(s) LATE at the ${TIMEOUT_MS / 1000}s deadline: ${_late.join(', ')} — their clusters carry forward; the tick is not stalled.`);
              }
              const _r = _p.resolve;
              this._gpuBatchPending = null;
              _r({ perCluster: _p.merged, lateOwners: _late });
              return;
            }
          }
          this._gpuBatchPending = null;
          // PODKICK (2026-08-28) — walk-heartbeat probes must NEVER feed the
          // zombie kick. On the live box every heartbeat timed out (walkTick
          // 6 sent / 0 ok), each one incremented the consecutive-timeout
          // counter, and at 3 the kick TERMINATED the pod's socket — the
          // donor saw "Connection reset without closing handshake" every
          // ~11 minutes, and each kick forced a full matrix re-upload that
          // the NEXT heartbeats then queued behind and timed out too: a
          // self-sustaining drop loop, seeded by any one transient drop.
          // A heartbeat is a 2.9 Gn-step probe with its own 4×→8× backoff
          // and the walkTick/stall instruments — losing one is information,
          // not an emergency. The kick stays armed for REAL batches.
          if (opts.noKick) {
            console.warn(`[Brain] walk heartbeat batch ${batchId} timed out after ${TIMEOUT_MS / 1000}s — probe dropped (no zombie-kick credit; the donor keeps its socket). walkTick counts it.`);
            resolve(null);
            return;
          }
          // Consecutive-timeout counter — diagnostic. If the GPU is
          // really hung we'll see this number climb while successful
          // batches stay at 0. Reset by the compute_batch_result
          // handler on any successful batch.
          this._gpuBatchConsecutiveTimeouts = (this._gpuBatchConsecutiveTimeouts || 0) + 1;
          const queuePending = this._boundHebbianBatch?.ops?.length || 0;
          const lost = this._gpuDeviceLost ? ' (device.lost flagged during this batch)' : '';
          console.warn(`[Brain] compute_batch ${batchId} timed out after ${TIMEOUT_MS / 1000}s — GPU may be hung. Consecutive timeouts: ${this._gpuBatchConsecutiveTimeouts}. Bound-Hebbian queue: ${queuePending}.${lost}`);
          if (this._gpuBatchConsecutiveTimeouts >= 3) {
            // ZOMBIE-DONOR KICK — a connected-but-hung donor is WORSE than a
            // missing one: ws.readyState stays 1 so the no-donor walk gate
            // never pauses, while every batch + canonical upload burns 180s
            // timeouts (live incident: batches 28-32 all timed out, uploads
            // dead x3 attempts, the walk ground for 40 minutes against a
            // braindead GPU). The old code logged "unrecoverable without
            // compute.html reload" and then WAITED FOREVER. Now the server
            // terminates the socket itself: the native donor's supervisor
            // auto-reconnects in ~2s and REBUILDS ITS GPU ENGINE from
            // scratch (each session builds a fresh engine) — the exact
            // reload the log wished for, automated. Browser tabs reconnect
            // + re-init the same way. Throttled so one kick per hang.
            if (!this._zombieKickAt || (Date.now() - this._zombieKickAt) > 120000) {
              this._zombieKickAt = Date.now();
              console.warn('[Brain] ZOMBIE-DONOR KICK — 3 consecutive compute_batch timeouts with a live socket: terminating the donor connection so its supervisor reconnects with a FRESH GPU engine (auto-recovery; re-register re-arms the uploads).');
              try {
                const _zws = this._gpuClient;
                if (_zws) { try { _zws.terminate(); } catch { try { _zws.close(); } catch { /* nf */ } } }
              } catch { /* kick best-effort */ }
              this._gpuBatchConsecutiveTimeouts = 0;
              this._gpuHangLogged = false;
            } else if (!this._gpuHangLogged) {
              this._gpuHangLogged = true;
              console.warn('[Brain] compute_batch consecutive-timeout threshold reached again within the kick throttle — waiting for the donor to finish reconnecting.');
            }
          }
          resolve(null);
        }
      }, TIMEOUT_MS);
    });
  },

  // ── T17.3.c SPARSE DISPATCH HELPERS ──

  // Send sparse upload/propagate/hebbian messages to compute.html,
  // await the matching ack via reqId correlation. Used by the GPU
  // language cortex path to offload cross-projection ops to GPU.

  _nextSparseReqId() {
    this._sparseSeq = (this._sparseSeq || 0) + 1;
    return this._sparseSeq;
  },

  /**
   * I.17 closure 2026-06-17 22:40 PT — Cross-platform GPU activity
   * counter. Called on every WS message dispatched to compute.html
   * (sparse upload, propagate, Hebbian, batch step). Brain knows
   * exactly when it's using the GPU — counting these dispatches is
   * universal (works on NVIDIA / AMD / Intel / Apple Silicon / headless)
   * and truthful (counts real brain→GPU traffic, not OS sampling noise).
   *
   * Ring buffer of timestamps. `_updatePerfStats` prunes entries older
   * than 30s and computes `gpuDispatchesPerSec` from the remaining
   * length. Lazy soft-cap at 5000 entries here in case `_updatePerfStats`
   * doesn't run for a while — full prune happens there every 1s.
   * `_gpuDispatchTotal` is a monotonic counter for cumulative metrics.
   */
  _recordGpuDispatch() {
    if (!this._gpuDispatchTimestamps) this._gpuDispatchTimestamps = [];
    this._gpuDispatchTimestamps.push(Date.now());
    // ⛔ The old cap filtered to the last 30 s — but while she teaches more than
    // 5,000 dispatches land inside 30 s, so the filter kept them all and EVERY
    // later dispatch re-copied the whole array (2.0% of the live main thread).
    // Halving on overflow is amortised O(1); the one reader (`state.js`, rate =
    // count ÷ span of the entries) is equally valid over the most recent half.
    if (this._gpuDispatchTimestamps.length > 5000) {
      this._gpuDispatchTimestamps = this._gpuDispatchTimestamps.slice(-2500);
    }
    this._gpuDispatchTotal = (this._gpuDispatchTotal || 0) + 1;
  },

  /**
   * PA.4.8 — community-compute milestone scaling (decision layer).
   *
   * Sums the connected pool donors' reported VRAM = the "community compute
   * level". The brain RESIZES + RESTARTS + RETRAINS only when this crosses a
   * MILESTONE tier (critical mass) — NEVER per-connection (which would retrain
   * on every join). New donors between milestones just add pool redundancy.
   * Scaling is UP-only: donors leaving never shrink a running brain.
   *
   * This is the DECISION layer — records a pending higher tier + entry time.
   * The EXECUTION layer (controlled resize+restart+retrain via the boot-
   * scaling/curriculum path) fires only after the pending tier is held past a
   * stability window (critical-mass confirmation), wired as the follow-on.
   * Called from gpu_register + the WS close handler.
   */
  /**
   * DF.7 — load admin-configurable auto-scale settings (toggle + dead-zone
   * buffer + stability window) from server/autoscale-settings.json, defaulting
   * sanely on first boot. These govern WHEN the community-compute milestone
   * resize is allowed to fire. Ruled 2026-06-20: the auto-relearn must be gated
   * WITH A BUFFER (a dead-zone) + admin-controllable so it does not try to
   * relearn the second it hits a gate of available connected user compute, so
   * that any one person disconnecting does not downgrade the brain's functioning.
   */
  _getAutoScaleSettings() {
    if (this._autoScale) return this._autoScale;
    const defaults = {
      enabled: true,        // master toggle — auto UP-scale on/off
      bufferPct: 0.20,      // UP DEAD-ZONE: community compute must exceed a tier's
                            // threshold by this margin before the tier counts as
                            // "entered" — hysteresis so flapping at a gate (one
                            // donor connecting/leaving) never triggers a resize.
      stabilityMin: 5,      // minutes a higher tier must be HELD past the buffer
                            // before the resize+retrain actually fires.
      minDonorsFloor: 1,    // never consider a tier needing fewer donors than this.
      // SIZING BASELINE — the card class the BOOT assumes before any donor has
      // registered (boot cannot read a card that is not connected yet). Once a
      // donor is connected, the smallest connected card is the size driver and
      // this value is not consulted — a small card DOES shrink the brain, per
      // the operator's standing rule that any GPU over 6GB runs the brain alone
      // and extra GPUs only add speed and neurons. Ratcheted up on register by
      // the largest card ever seen (brain-server.js gpu_register), so a rented
      // big card leaves a big boot assumption behind; that only sets the boot
      // TIER TARGET, which host RAM clamps anyway. Tune via the admin autoscale
      // endpoint / autoscale-settings.json.
      donorBaselineMB: 16384,
      // Donor-replica cost estimator (bytes/neuron): ~12B GPU Rulkov state +
      // sparse-matrix share. The first-cut 42 (host-CSR semantics) was ~2x too
      // conservative and REFUSED a 16GB card that provably runs 357M locally
      // (live incident: runningFloor 21797MB vs the card's 16375MB -> no
      // primary -> CPU-only grind -> curriculum never started).
      // and host sizing agree.
      // ⛔ ONE CONSTANT. The allocator budgets MAIN_BRAIN_BYTES_PER_NEURON = 21
      // (brain-server.js BRAIN_VRAM_ALLOC); this floor estimator used a literal
      // 20 for its whole life, under-estimating every card's need by ~5%
      // (≈ 190 MB at 2×10⁸ neurons). Same number, exported from here so the
      // allocator reads it too.
      donorBytesPerNeuron: MAIN_BRAIN_BYTES_PER_NEURON,
      // DF.7 downscale rectify — "buffers for the buffers". A downscale is far
      // more conservative than an upscale because it RETRAINS at a smaller size
      // (loses the bigger brain's learning), so it must only fire on a genuine,
      // SUSTAINED collapse of compute — never a transient mass-disconnect.
      // ⛔⛔ DEFAULT OFF. A downscale RETRAINS FROM ZERO at the smaller size — it
      // wipes everything she has learned — and it was ON by default, with the
      // only protection a settings file that did not exist on disk. On
      // 2026-10-20 a stranger's 2,047 MB card connected through the public
      // tunnel, opened a downscale candidacy four times, and the only thing that
      // kept the 15-minute hold from completing was that card hanging and
      // dropping out each time. A stranger keeping a small card connected must
      // never be able to cost her her whole life. So the wipe is never
      // automatic: OFF = alert + pause/wait, and executing a downscale is the
      // operator's decision. A settings file can still turn it on deliberately;
      // a MISSING file can no longer turn it on by accident.
      autoDownscale: false, // toggle — when compute can't hold the running tier,
                            // rectify by retraining at a fitting smaller tier. OFF
                            // = just alert + pause/wait (never auto-shrink).
      downBufferPct: 0.35,  // community must fall THIS far BELOW the running tier's
                            // VRAM floor before a downscale is even considered
                            // (deeper than the up-buffer — the buffer's buffer).
      downStabilityMin: 15, // and stay below that long (3× the up window) — so 10
                            // people leaving for a few minutes then returning never
                            // shrinks the brain.
    };
    try {
      const fsx = require('fs');
      const px = require('path');
      const p = px.join(__dirname, '..', 'autoscale-settings.json');
      if (fsx.existsSync(p)) {
        const saved = JSON.parse(fsx.readFileSync(p, 'utf8'));
        this._autoScale = {
          enabled: typeof saved.enabled === 'boolean' ? saved.enabled : defaults.enabled,
          bufferPct: Number.isFinite(saved.bufferPct) ? Math.max(0, Math.min(2, saved.bufferPct)) : defaults.bufferPct,
          stabilityMin: Number.isFinite(saved.stabilityMin) ? Math.max(0, Math.min(120, saved.stabilityMin)) : defaults.stabilityMin,
          minDonorsFloor: Number.isFinite(saved.minDonorsFloor) ? Math.max(1, Math.floor(saved.minDonorsFloor)) : defaults.minDonorsFloor,
          autoDownscale: typeof saved.autoDownscale === 'boolean' ? saved.autoDownscale : defaults.autoDownscale,
          downBufferPct: Number.isFinite(saved.downBufferPct) ? Math.max(0, Math.min(0.9, saved.downBufferPct)) : defaults.downBufferPct,
          downStabilityMin: Number.isFinite(saved.downStabilityMin) ? Math.max(0, Math.min(240, saved.downStabilityMin)) : defaults.downStabilityMin,
          donorBaselineMB: Number.isFinite(saved.donorBaselineMB) ? Math.max(1024, Math.min(262144, saved.donorBaselineMB)) : defaults.donorBaselineMB,
          // A persisted 20 is the OLD default, not an operator choice — it
          // follows the constant; any other saved value is honoured.
          donorBytesPerNeuron: (Number.isFinite(saved.donorBytesPerNeuron) && saved.donorBytesPerNeuron !== 20) ? Math.max(8, Math.min(1024, saved.donorBytesPerNeuron)) : defaults.donorBytesPerNeuron,
        };
      } else {
        this._autoScale = { ...defaults };
      }
    } catch {
      this._autoScale = { ...defaults };
    }
    return this._autoScale;
  },

  /**
   * DF.7 — admin setter for the auto-scale dead-zone settings. Clamps + merges
   * + persists to server/autoscale-settings.json so the toggle/sliders survive
   * reboots. Returns the effective settings. Wired to the /admin/autoscale POST
   * endpoint + the dashboard toggle + sliders.
   */
  _setAutoScaleSettings(patch) {
    const cur = this._getAutoScaleSettings();
    const next = {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : cur.enabled,
      bufferPct: Number.isFinite(patch.bufferPct) ? Math.max(0, Math.min(2, patch.bufferPct)) : cur.bufferPct,
      stabilityMin: Number.isFinite(patch.stabilityMin) ? Math.max(0, Math.min(120, patch.stabilityMin)) : cur.stabilityMin,
      minDonorsFloor: Number.isFinite(patch.minDonorsFloor) ? Math.max(1, Math.floor(patch.minDonorsFloor)) : cur.minDonorsFloor,
      autoDownscale: typeof patch.autoDownscale === 'boolean' ? patch.autoDownscale : cur.autoDownscale,
      downBufferPct: Number.isFinite(patch.downBufferPct) ? Math.max(0, Math.min(0.9, patch.downBufferPct)) : cur.downBufferPct,
      downStabilityMin: Number.isFinite(patch.downStabilityMin) ? Math.max(0, Math.min(240, patch.downStabilityMin)) : cur.downStabilityMin,
      donorBaselineMB: Number.isFinite(patch.donorBaselineMB) ? Math.max(1024, Math.min(262144, patch.donorBaselineMB)) : cur.donorBaselineMB,
      donorBytesPerNeuron: Number.isFinite(patch.donorBytesPerNeuron) ? Math.max(8, Math.min(1024, patch.donorBytesPerNeuron)) : cur.donorBytesPerNeuron,
    };
    this._autoScale = next;
    try {
      const fsx = require('fs');
      const px = require('path');
      fsx.writeFileSync(px.join(__dirname, '..', 'autoscale-settings.json'), JSON.stringify(next, null, 2));
    } catch (e) {
      console.warn('[Brain] DF.7 — failed to persist autoscale settings:', e.message);
    }
    // A pending candidate computed under the OLD buffer may no longer qualify —
    // recompute so the dead-zone change takes effect immediately.
    if (this._recomputeCommunityCompute) this._recomputeCommunityCompute();
    console.log(`[Brain] DF.7 — autoscale settings updated: enabled=${next.enabled} bufferPct=${(next.bufferPct * 100).toFixed(0)}% stabilityMin=${next.stabilityMin} minDonorsFloor=${next.minDonorsFloor}`);
    return next;
  },

  _recomputeCommunityCompute() {
    let totalMB = 0, donorCount = 0, minDonorMB = Infinity;
    if (this._gpuClients) {
      for (const ws of this._gpuClients) {
        if (!ws || ws.readyState !== 1) continue;
        const c = this.clients && this.clients.get(ws);
        const fullVram = (c && c.gpuVramMB) || 0;
        // ASCALE — EFFECTIVE donated capacity, not the full card. Use the donor's explicit
        // donatedMB cap if it sent one, else full card × donation duty-cycle (utilizationPct).
        // Fixes the over-count where two 15GB cards at 60% tripped a ~30GB tier instead of 18GB.
        const eff = (c && c.donatedMB > 0)
          ? (fullVram > 0 ? Math.min(c.donatedMB, fullVram) : c.donatedMB)
          : fullVram * (((c && c.utilizationPct) ?? 100) / 100);
        // Duty-cycle shaves THROUGHPUT (the sum) only — VRAM HELD is what
        // bounds replica SIZE, so min-donor tracks donated-cap-or-full-card.
        const held = (c && Number(c.donatedMB) > 0)
          ? (fullVram > 0 ? Math.min(Number(c.donatedMB), fullVram) : Number(c.donatedMB))
          : fullVram;
        if (eff > 0) totalMB += eff;
        if (held > 0 && held < minDonorMB) minDonorMB = held;
        donorCount++;
      }
    }
    this._communityComputeMB = totalMB;
    this._communityDonorCount = donorCount;
    // ASCALE caveat (data-parallel): every donor holds the FULL replica, so the brain's max SIZE is
    // bounded by the SMALLEST donor's committed VRAM — NOT the community SUM (which is a throughput
    // metric). The size-tier rewire onto min-donor is BUILT below: tiers gate on
    // the size-driver capacity (max(baseline, smallest committed donor)), and
    // the community sum is telemetry/throughput only.
    this._communityMinDonorMB = (donorCount > 0 && minDonorMB !== Infinity) ? Math.round(minDonorMB) : 0;
    const settings = this._getAutoScaleSettings();

    // SIZE DRIVER (data-parallel): every replica donor holds the FULL brain, so
    // size is driven by what the smallest CONNECTED donor can hold. The operator
    // baseline is what the boot assumes when NO donor is connected (boot cannot
    // read a card that has not registered yet); the moment a card is attached,
    // that card IS the size driver, however small. Standing operator rule
    // (2026-09-24): any GPU over 6GB runs the brain ALONE; adding GPUs only
    // adds speed and neurons. So a small card must be able to shrink the
    // driver — the old `max(baseline, smallest donor)` let a rented 45GB card
    // ratchet the baseline up and then judged every 16GB card against a brain
    // that only existed on paper. The community SUM stays a THROUGHPUT metric
    // only.
    const _baselineMB = settings.donorBaselineMB || 16384;
    const _driverMB = (donorCount > 0 && (this._communityMinDonorMB || 0) > 0)
      ? this._communityMinDonorMB
      : _baselineMB;
    const _bytesPerNeuron = settings.donorBytesPerNeuron || MAIN_BRAIN_BYTES_PER_NEURON;
    // Mirrors local host sizing: 75% of the card usable minus a 2GB reserve.
    let _capNeurons = Math.max(0, Math.floor(((_driverMB * 0.75 - 2048) * 1048576) / _bytesPerNeuron));
    // ⭐ MULTI-CARD — when EVERY connected card can hold a slice (donor 0.3.48+),
    // no card holds the whole brain, so capacity is the SUM of each card's usable
    // share, not the smallest card's whole. More cards = a bigger brain on offer
    // (the step itself still waits for the operator — it wipes and re-walks).
    try {
      const _live = (this._gpuClients ? [...this._gpuClients] : []).filter((w) => w && w.readyState === 1);
      if (_live.length >= 2 && process.env.DREAM_SLICE !== '0' && _live.every((w) => this._sliceCapable(w))) {
        let _sum = 0;
        for (const w of _live) {
          const c = this.clients && this.clients.get(w);
          const full = (c && c.gpuVramMB) || 0;
          const held = (c && Number(c.donatedMB) > 0) ? (full > 0 ? Math.min(Number(c.donatedMB), full) : Number(c.donatedMB)) : full;
          _sum += Math.max(0, held * 0.75 - 2048);
        }
        const _pooled = Math.floor((_sum * 1048576) / _bytesPerNeuron);
        if (_pooled > _capNeurons) { _capNeurons = _pooled; this._communitySizeDriverPooled = true; }
      } else {
        this._communitySizeDriverPooled = false;
      }
    } catch { /* keep the single-card driver */ }
    // Capacity of the baseline ALONE — tiers this covers are entered without
    // the dead-zone buffer (the baseline is an operator constant, it cannot
    // flap the way a joining/leaving donor can).
    const _baseCapNeurons = Math.max(0, Math.floor(((_baselineMB * 0.75 - 2048) * 1048576) / _bytesPerNeuron));
    this._communitySizeDriverMB = _driverMB;
    this._communityCapacityNeurons = _capNeurons;

    // Milestone tiers — QUANTIZED neuron ladder for resizes. Post min-donor
    // rework the SIZE gate is the size-driver capacity (see above); the
    // minCommunityMB/minDonors fields remain for telemetry + legacy readers.
    // scale. Conservative under replication (Path A) — the running brain must
    // fit a typical donor. Tune as real donor hardware is observed.
    const MILESTONES = DF7_MILESTONES;
    // RAW tier — highest tier whose neuron target fits the size-driver
    // capacity (display/telemetry: what the pool currently qualifies for).
    let tier = 0;
    for (let i = 0; i < MILESTONES.length; i++) {
      if (_capNeurons >= MILESTONES[i].neurons) tier = i;
    }
    this._communityTier = tier;
    this._communityTierTarget = MILESTONES[tier].neurons;

    // DF.7 DEAD-ZONE — UPGRADE tier uses a BUFFERED capacity gate. To count as
    // "entered" for the purpose of triggering a resize, the size-driver
    // capacity must exceed the tier's neuron target by bufferPct headroom
    // (hysteresis). This is the ruled dead-zone: hovering right at a gate (one
    // donor flapping connect/disconnect) never trips a resize — only a genuine,
    // sustained surplus past the buffer does. With bufferPct=0 it reduces to
    // the raw gate. Donor-count gates are retired for SIZING (the baseline
    // assumption covers a lone donor). Tiers already covered by the BASELINE
    // capacity skip the buffer entirely — the baseline cannot flap, so there
    // is nothing to hysteresis against.
    const buffer = 1 + (settings.bufferPct || 0);
    let upgradeTier = 0;
    for (let i = 0; i < MILESTONES.length; i++) {
      // The baseline shortcut only applies with NO card connected. TIERTOP ratchets
      // the baseline up to the largest card ever seen, so with a card attached it
      // offered a size no connected card could hold (seen: tier 5 on one 16 GB card).
      if ((donorCount === 0 && _baseCapNeurons >= MILESTONES[i].neurons) || _capNeurons >= MILESTONES[i].neurons * buffer) upgradeTier = i;
    }
    this._communityUpgradeTier = upgradeTier;

    // Up-only + buffered milestone gate. Flag a pending resize ONLY when the
    // BUFFERED upgrade tier exceeds the RUNNING tier — and only if auto-scale
    // is enabled. Down-protection: the running tier is NEVER lowered here, so a
    // donor leaving (totalMB/donorCount dropping) can never downgrade a running
    // brain — it can only cancel a not-yet-executed pending upgrade. The
    // execution layer additionally enforces the stability hold window.
    const runningTier = this._communityTierRunning || 0;
    if (!settings.enabled) {
      // Auto-scale OFF — clear any pending candidate so re-enabling starts clean.
      this._communityTierPending = null;
      this._communityTierPendingSince = null;
    } else if (upgradeTier > runningTier && upgradeTier !== this._communityTierPending) {
      this._communityTierPending = upgradeTier;
      this._communityTierPendingTarget = MILESTONES[upgradeTier].neurons;
      this._communityTierPendingSince = Date.now();
      console.log(`[Brain] DF.7/PA.4.8 — milestone candidate: tier ${upgradeTier} (size driver ${_driverMB.toLocaleString()}MB = max(baseline ${_baselineMB.toLocaleString()}MB, smallest committed donor ${(this._communityMinDonorMB || 0).toLocaleString()}MB) -> capacity ~${_capNeurons.toLocaleString()} neurons past the ${(settings.bufferPct * 100).toFixed(0)}% dead-zone -> target ${MILESTONES[upgradeTier].neurons.toLocaleString()} neurons; community sum ${Math.round(totalMB).toLocaleString()}MB across ${donorCount} donor(s) is a THROUGHPUT metric, not the size bound). Resize fires only if held >=${settings.stabilityMin}min — a single donor joining/leaving will NOT trigger it.`);
    } else if (upgradeTier <= runningTier && this._communityTierPending && upgradeTier < this._communityTierPending) {
      // Dropped back below the buffered candidate before it executed — cancel
      // (critical mass not sustained past the dead-zone). The RUNNING brain is
      // untouched (no downgrade).
      console.log(`[Brain] DF.7 — pending tier ${this._communityTierPending} candidacy CANCELLED (compute fell back inside the dead-zone before the hold window elapsed). Running tier ${runningTier} unchanged — no downgrade.`);
      this._communityTierPending = null;
      this._communityTierPendingSince = null;
    }

    // DF.7 DOWNSCALE rectify — "buffers for the buffers". The stable operating
    // band is [down-floor … up-gate]: inside it the brain just keeps running at
    // its current neuron count, unchanged, no matter how donors come and go.
    // ONLY when the size-driver capacity collapses BELOW the running tier's
    // neuron target by more than downBufferPct AND stays there past
    // downStabilityMin do we
    // rectify — retrain at the biggest tier the surviving GPUs can actually
    // hold. Far more conservative than upscale (a downscale loses the bigger
    // brain's learning), so a transient mass-disconnect (10 people leaving then
    // returning) never shrinks the brain. `_computeInsufficient` flags the
    // admin alert the instant compute can't hold the running tier, regardless
    // of the buffer/window (so you SEE the problem before any rectify fires).
    // THE BRAIN A DONOR MUST HOLD IS THE ONE THAT IS RUNNING, NOT THE TIER'S
    // TARGET. The tier target is an aspiration the boot allocator clamps to host
    // RAM — on the 32GB coordinator tier 4 "900,000,000" boots as ~234,000,000.
    // Judging cards against the target produced a 25,619MB floor for a brain
    // whose real weights fit in a third of that, and a 16GB card that had run
    // this brain before was refused as PRIMARY for fifteen days (2026-09-24).
    // `TOTAL_NEURONS` is the allocator's own sum of the live cluster sizes; the
    // tier target is only used before that number exists.
    const _tierNeurons = MILESTONES[runningTier] ? MILESTONES[runningTier].neurons : 0;
    const _liveNeurons = Number(this.TOTAL_NEURONS || this.totalNeurons) || 0;
    const _runningNeurons = _liveNeurons > 0 ? _liveNeurons : _tierNeurons;
    // VRAM a single replica donor needs to hold the running brain — inverse of
    // the capacity estimator (neurons x bytes/neuron + 2GB reserve at 75% use).
    const runningFloorMB = _runningNeurons > 0
      ? Math.ceil(((_runningNeurons * _bytesPerNeuron) / 1048576 + 2048) / 0.75)
      : 0;
    this._runningFloorMB = runningFloorMB;
    this._computeInsufficient = (runningTier > 0) && (_capNeurons < _runningNeurons);
    if (settings.autoDownscale && runningTier > 0) {
      const downGate = _runningNeurons * (1 - (settings.downBufferPct || 0));
      if (_capNeurons < downGate) {
        // Pick the biggest tier the surviving compute can actually hold (raw —
        // no buffer; we want the largest brain that fits, not a timid floor).
        let fitTier = 0;
        for (let i = 0; i < MILESTONES.length; i++) {
          if (_capNeurons >= MILESTONES[i].neurons) fitTier = i;
        }
        if (fitTier < runningTier && fitTier !== this._communityDownTierPending) {
          this._communityDownTierPending = fitTier;
          this._communityDownTierPendingTarget = MILESTONES[fitTier].neurons;
          this._communityDownTierPendingSince = Date.now();
          console.warn(`[Brain] DF.7 — DOWNSCALE candidate: size-driver capacity ~${_capNeurons.toLocaleString()} neurons fell >${(settings.downBufferPct * 100).toFixed(0)}% below the RUNNING brain (${_runningNeurons.toLocaleString()} neurons; smallest connected card ${_driverMB.toLocaleString()}MB vs floor ${runningFloorMB.toLocaleString()}MB). The smallest connected card drives the size — a small card runs the brain alone at a smaller size, it is never turned away. If HELD >=${settings.downStabilityMin}min, rectify by retraining at tier ${fitTier} (${MILESTONES[fitTier].neurons.toLocaleString()} neurons). A transient mass-disconnect will NOT trigger it.`);
        }
      } else if (this._communityDownTierPending != null) {
        // Compute recovered above the down-gate before the window elapsed — cancel.
        console.log(`[Brain] DF.7 — downscale candidacy CANCELLED (compute recovered above the floor before the hold window). Running tier ${runningTier} unchanged.`);
        this._communityDownTierPending = null;
        this._communityDownTierPendingSince = null;
      }
    } else {
      // autoDownscale OFF or already at tier 0 — no auto-shrink; alert only.
      this._communityDownTierPending = null;
      this._communityDownTierPendingSince = null;
    }
  },

  /**
   * PA.4.8 — community-compute milestone scaling (EXECUTION layer).
   *
   * Called on a periodic timer. When a pending higher tier has been held past
   * the stability window (critical-mass confirmation — a flapping donor can't
   * trigger it), persist the target tier to server/community-tier.json and
   * trigger a GRACEFUL RESTART. On reboot the boot-scaler reads that file +
   * scales the brain to the tier's neuron target, autoClearStaleState wipes
   * the old weights, and the curriculum re-walks at the new size = resize +
   * retrain, reusing the existing boot/clear/walk machinery (no risky
   * in-process re-allocation). Up-only; never fires below the running tier.
   */
  _maybeExecuteMilestoneResize() {
    const settings = this._getAutoScaleSettings();
    const running = this._communityTierRunning || 0;

    // UP-scale path — gated by the master toggle + the up stability window.
    if (settings.enabled) {
      const STABILITY_MS = Math.max(0, (settings.stabilityMin || 5)) * 60 * 1000;
      const pending = this._communityTierPending;
      if (pending != null && pending > running
          && this._communityTierPendingSince
          && (Date.now() - this._communityTierPendingSince) >= STABILITY_MS) {
        // ⛔ ASK FIRST (operator's choice). A step up wipes her weights and
        // fresh-walks her from kindergarten, so a held milestone is ANNOUNCED
        // and waits for the dashboard's approval (`POST /scale-up`). Only
        // `DREAM_SCALEUP_AUTO=1` lets it fire unattended.
        if (process.env.DREAM_SCALEUP_AUTO === '1') {
          this._persistTierAndRestart(pending, this._communityTierPendingTarget || 6_000_000,
            `UP-scale: milestone tier ${pending} held ≥${settings.stabilityMin}min past the dead-zone (auto)`, true);
          return;
        }
        const target = this._communityTierPendingTarget || 6_000_000;
        if (!this._scaleUpOffer || this._scaleUpOffer.tier !== pending) {
          this._scaleUpOffer = { tier: pending, targetNeurons: target, runningTier: running, since: Date.now() };
          console.log(`[Brain] SCALE-UP AVAILABLE — the pool has held tier ${pending} (${target.toLocaleString()} neurons, from tier ${running}) for ${settings.stabilityMin} min. ⛔ Growing WIPES her weights and fresh-walks her at the new size. Waiting for approval on the dashboard — nothing changes until then.`);
        }
        return;
      }
      if (this._scaleUpOffer && (pending == null || pending <= running)) this._scaleUpOffer = null;
      if (pending != null && pending <= running) this._communityTierPending = null;
    }

    // DOWN-scale rectify path — gated by autoDownscale + the LONGER down window
    // ("buffers for the buffers"). Fires only when compute genuinely cannot hold
    // the running tier and has stayed collapsed past downStabilityMin.
    if (settings.autoDownscale) {
      const DOWN_MS = Math.max(0, (settings.downStabilityMin || 15)) * 60 * 1000;
      const dpend = this._communityDownTierPending;
      if (dpend != null && dpend < running
          && this._communityDownTierPendingSince
          && (Date.now() - this._communityDownTierPendingSince) >= DOWN_MS) {
        this._persistTierAndRestart(dpend, this._communityDownTierPendingTarget || 6_000_000,
          `DOWN-scale rectify: compute could not hold tier ${running}, held below the floor ≥${settings.downStabilityMin}min`);
        return;
      }
      if (dpend != null && dpend >= running) this._communityDownTierPending = null;
    }
  },

  /**
   * DF.7 — shared tier-change executor (UP or DOWN). Persists the target tier to
   * server/community-tier.json, clears the old-size weights (size changed →
   * retrain), records the new running tier, and triggers the PROMPT-FREE
   * graceful restart: process.exit(0) → systemd `Restart=always` brings the
   * brain back, the boot-scaler reads community-tier.json + sizes the brain to
   * the target, and the curriculum re-walks. This is the deployed equivalent of
   * stop→savestart→full-train — with NO y/n prompt, so it's automation-safe
   * (the operator flagged start.bat's y/n prompt as unusable for automation).
   * The walk runs UNATTENDED when the auto-advance toggle is on, because that
   * flag is persisted separately and re-applied on boot (survives the weight
   * clear) — see brain-server.js auto-advance persistence.
   */
  _persistTierAndRestart(tier, targetNeurons, reason, approved = false) {
    try {
      const fsx = require('fs');
      const px = require('path');
      // `approved` is what lets the boot size her past the launcher's budget pin.
      fsx.writeFileSync(
        px.join(__dirname, '..', 'community-tier.json'),
        JSON.stringify({ tier, targetNeurons, confirmedAtMs: Date.now(), approved: !!approved }, null, 2),
      );
    } catch (e) {
      console.error('[Brain] DF.7 — failed to persist community tier (tier change deferred):', e.message);
      return;
    }
    try {
      const fsx = require('fs');
      const px = require('path');
      const sdir = px.join(__dirname, '..'); // server/
      for (const f of fsx.readdirSync(sdir)) {
        if (/^brain-weights.*\.(json|bin)$/.test(f)) {
          try { fsx.unlinkSync(px.join(sdir, f)); } catch { /* best-effort */ }
        }
      }
      console.log('[Brain] DF.7 — cleared old-size brain-weights (size changed → re-walk at the new tier).');
    } catch (e) {
      console.warn('[Brain] DF.7 — weight clear on tier change failed (boot may load stale-size weights):', e.message);
    }
    console.log(`[Brain] DF.7 — TIER CHANGE → ${tier} (${targetNeurons.toLocaleString()} neurons). Reason: ${reason}. Prompt-free graceful restart (systemd Restart=always re-walks; UNATTENDED when auto-advance is ON).`);
    this._communityTierRunning = tier;
    this._communityTierPending = null;
    this._communityDownTierPending = null;
    this._scaleUpOffer = null;
    global._brainShutdownRequested = true;
    // A local Windows run has no supervisor — hand off to the resume launcher
    // (the old weights are already cleared, so it boots fresh at the new size).
    if (process.platform === 'win32' && !process.env.INVOCATION_ID) {
      try {
        const px = require('path'), fsx = require('fs');
        const sav = px.join(__dirname, '..', '..', 'windows', 'Savestart.bat');
        if (fsx.existsSync(sav)) {
          require('child_process').spawn('cmd.exe', ['/c', `timeout /t 10 /nobreak >nul & start "" /d "${px.dirname(sav)}" "${sav}"`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
          console.log('[Brain] DF.7 — local run: Savestart.bat relaunches her at the new size in ~10 s.');
        }
      } catch (e) { console.warn('[Brain] DF.7 — could not hand off to Savestart.bat — start her by hand:', e && e.message); }
    }
    setTimeout(() => process.exit(0), 1500);
  },

  /** The operator approved the offered scale-up (dashboard → POST /scale-up). */
  approveScaleUp() {
    const o = this._scaleUpOffer;
    if (!o) return { ok: false, why: 'no scale-up is on offer' };
    this._persistTierAndRestart(o.tier, o.targetNeurons, `UP-scale to tier ${o.tier} — approved by the operator`, true);
    return { ok: true, tier: o.tier, targetNeurons: o.targetNeurons };
  },

  /**
   * DF.7 — manual, DELIBERATE downscale (admin button). Immediately retrains the
   * brain at a fitting smaller tier for the currently-connected compute,
   * bypassing the auto-downscale hold window. Destructive (loses the current
   * size's learning) — the dashboard guards it behind an explicit confirm.
   * Returns the chosen target tier, or null if nothing to do.
   */
  _manualDownscale() {
    const MILESTONES = this._lastMilestones || null;
    const running = this._communityTierRunning || 0;
    if (running <= 0) return null; // already smallest
    // Recompute the fitting tier from live compute.
    if (this._recomputeCommunityCompute) this._recomputeCommunityCompute();
    let fitTier = this._communityDownTierPending;
    if (fitTier == null || fitTier >= running) {
      // No auto-candidate (compute may be inside the buffer) — fall to one tier down.
      fitTier = running - 1;
    }
    const target = this._communityDownTierPendingTarget || 6_000_000;
    console.warn(`[Brain] DF.7 — MANUAL downscale requested by admin: tier ${running} → ${fitTier}. Retraining now (deliberate, bypasses the hold window).`);
    this._persistTierAndRestart(fitTier, target, `MANUAL admin downscale ${running} → ${fitTier}`);
    return fitTier;
  },

  // DF.7 — live pool donors (every connected donor GPU, primary first). The
  // pool is the set of browser GPUs sharing compute. With 1 donor this is just
  // [primary] = current behavior; with N it's the fan-out target for parallel
  // work. Primary is placed first so single-target dispatch defaults to it.
  _livePoolDonors() {
    const out = [];
    if (this._gpuClient && this._gpuClient.readyState === 1) out.push(this._gpuClient);
    if (this._gpuClients) {
      for (const ws of this._gpuClients) {
        if (ws && ws.readyState === 1 && ws !== this._gpuClient) out.push(ws);
      }
    }
    return out;
  },

  // Partial-coverage routing guard — TRUE if this donor can serve work touching
  // the given matrix name(s): full-replica donors always can; a partial donor
  // must cover EVERY name's cluster prefix; work with no name goes to full
  // donors only (safe default).
  _donorCoversMatrices(ws, names) {
    const c = this.clients && this.clients.get ? this.clients.get(ws) : null;
    if (!c) return true;
    if (c._replicaIncapable || c._bindIncapable) return false;
    // DF.7 SYNCGATE — a NON-PRIMARY donor is work-eligible only once its replica
    // sync has PROVENLY completed. Before this gate a donor that joined mid-teach
    // hit the `_curriculumInProgress` sync deferral and returned BEFORE
    // `_replicaIncapable` / `_bindIncapable` / `clusterCoverage` were ever assigned,
    // so every flag read undefined here, the checks below fell through to
    // `return true`, and the scheduler routed Hebbian batches to a card holding NO
    // matrices. That is the 0 Gn/s row: the donor was not skipped, it was fed work
    // it could not do. Training was never at risk (the CPU CSR stays the
    // authoritative master) but the units were wasted and the card looked broken.
    // INCREMENTAL — eligibility is PER MATRIX, not all-or-nothing. The original SYNCGATE
    // gated on `_df7Synced`, which only flips after EVERY matrix has landed; on a slow link
    // (a home donor measured under 1MB/s) that is ~30 minutes of holding a full GPU and
    // contributing exactly nothing, which is the "connected but 0 Gn/s" complaint. A donor
    // can serve work for a matrix the moment it holds THAT matrix, so `heldMatrices` (filled
    // per successful upload, smallest-first) decides instead — the donor starts earning
    // within seconds of its first small matrix and grows as the rest arrive. Work with no
    // named matrix still requires a complete sync, since we cannot prove coverage for it.
    if (ws !== this._gpuClient) {
      const held = c.heldMatrices;
      if (!held || held.size === 0) return false;
      if (names === undefined || names === null) return !!c._df7Synced;
      const _list = Array.isArray(names) ? names : [names];
      for (const _n of _list) {
        if (typeof _n !== 'string' || !held.has(_n)) return false;
      }
      return true;
    }
    const cov = c.clusterCoverage;
    if (!cov || !cov.size) return true;
    if (names === undefined || names === null) return false;
    const list = Array.isArray(names) ? names : [names];
    for (const n of list) {
      if (typeof n !== 'string') return false;
      let hit = false;
      for (const cl of cov) { if (n.startsWith(cl + '_')) { hit = true; break; } }
      if (!hit) return false;
    }
    return true;
  },

  // DF.7 F3 — CAPACITY-WEIGHTED donor selector for independent (stateless) work
  // units. Was flat round-robin (`idx % len`, equal share → slowest donor became
  // the barrier); now one smooth-weighted-round-robin step so the next donor is
  // picked ∝ strength (throughput × health). Slow/laggy donors get proportionally
  // fewer units; >1s-RTT donors get none while a healthy donor exists. Single
  // donor / fan-out OFF → that donor.
  _nextPoolDonor(matrixNames) {
    let donors = this._livePoolDonors();
    // Coverage filter: partial donors only take work they hold matrices for;
    // the primary (full master upload target) is always eligible.
    donors = donors.filter(ws => ws === this._gpuClient || this._donorCoversMatrices(ws, matrixNames));
    if (donors.length === 0) return null;
    if (!this._df7Fanout() || donors.length === 1) return donors[0];
    let scored = donors.map((ws) => ({ ws, w: Math.max(0, this._donorStrength(ws)) }));
    // DONOR-EQUAL — never queue NEW work onto a socket that already has a
    // backlog past the link cap. Strength weighting alone kept routing
    // hebbian batches at a fast-GPU/weak-link card until its buffer hit the
    // 64MB shed line (10s+ of queued bytes on its uplink → red row → health
    // floor → 5min cooldown → thrash). Preferring drained sockets makes each
    // donor take exactly the work its link drains — a slow link self-paces
    // in ~linkCap bursts, a fat link takes the bulk, nobody's socket parks.
    // If EVERY donor is backed up, fall through to all (the downstream soft-
    // cap shed still guards the truly-saturated case).
    // BUFFLOOR — prefer drained sockets, but NEVER zero a backed-up donor. This was a
    // HARD exclusion: any donor buffered past the 4MB link cap was filtered out entirely
    // whenever at least one drained donor existed - and the primary is almost always
    // drained, so the filter was effectively "replicas get nothing". A replica mid-sync
    // sits at 5-40MB buffered BY DESIGN (measured live: 5.8MB and 39MB on two donors), so
    // every syncing replica was excluded from Hebbian batches AND propagate for its whole
    // sync window - which on a slow link is the entire session. That is the same
    // "willing GPU benched forever at 0 Gn/s" failure WSQ.1 already fixed for the RTT
    // filter; the identical reasoning was simply never applied to the BUFFER filter.
    // Now it is a WEIGHT PENALTY, not a ban: a drained socket is strongly preferred
    // (default 10x) while a backed-up one still pulls a sliver, so it earns, appears on
    // the leaderboard, and self-corrects as its socket drains. Tunable via
    // DREAM_DF7_BACKED_PENALTY (0 restores the old hard exclusion).
    const _linkCap = this._donorLinkCapBytes();
    const _penEnv = Number(process.env.DREAM_DF7_BACKED_PENALTY);
    const _backedPenalty = Number.isFinite(_penEnv) && _penEnv >= 0 ? _penEnv : 0.1;
    if (_backedPenalty <= 0) {
      const _drained = scored.filter((s) => ((s.ws && s.ws.bufferedAmount) || 0) <= _linkCap);
      if (_drained.length > 0) scored = _drained;
    } else {
      scored = scored.map((s) => (((s.ws && s.ws.bufferedAmount) || 0) <= _linkCap)
        ? s
        : { ws: s.ws, w: s.w * _backedPenalty });
    }
    if (scored.some((s) => s.w > 0)) scored = scored.filter((s) => s.w > 0);
    else scored = scored.map((s) => ({ ws: s.ws, w: 1 }));
    const total = scored.reduce((a, s) => a + s.w, 0) || scored.length;
    if (!Array.isArray(this._swrrAcc) || this._swrrAcc.length !== scored.length) {
      this._swrrAcc = scored.map(() => 0);
    }
    let bi = 0, bv = -Infinity;
    for (let j = 0; j < scored.length; j++) {
      this._swrrAcc[j] += scored[j].w / total;
      if (this._swrrAcc[j] > bv) { bv = this._swrrAcc[j]; bi = j; }
    }
    this._swrrAcc[bi] -= 1;
    return scored[bi].ws;
  },

  // ── DF.7 multi-GPU fan-out (DEFAULT ON · env kill-switch) ──────────────────
  // Master switch. DEFAULT ON (ruled 2026-06-28: fan-out must be set automatic
  // in time for the next update and fresh walk, and with no second admin awake
  // it cannot depend on a manual systemd-unit env edit). Enables: strongest-donor primary promotion +
  // cortex resident-write mirroring to replicas + round-robin of the standalone
  // & bound forward-propagate + the bound-Hebbian teach batch, so every idle
  // replica GPU actually computes (and lands on the leaderboard) instead of just
  // holding a replica. With a SINGLE donor it's a no-op (the pool is just
  // [primary]) — so work-spreading only kicks in at ≥2 donors, exactly when you
  // want it, with ZERO env/unit setup. CPU CSR stays the authoritative Hebbian
  // master, so a batch on any replica can't corrupt training; roll back instantly
  // with DREAM_DF7_FANOUT=0 (no weight-format / restart-contract change).
  _df7Fanout() {
    return process.env.DREAM_DF7_FANOUT !== '0';
  },

  // DF.7 — separate gate for fanning READS (forward propagate, bound + standalone)
  // across replicas. DEFAULT OFF — distinct from the WRITE fan-out above. Reads
  // feed decisions (gate probes, student battery, emission), so routing them to a
  // replica whose weights are stale/incompletely-synced (e.g. while donor matrix
  // uploads are timing out) returns a WRONG answer the curriculum acts on →
  // spurious gate failures / stalled walk. Teach Hebbian (a fire-and-forget shadow,
  // CPU-authoritative) is always safe to fan; propagate reads are only safe once the
  // replica weight-sync is proven healthy on the live pool. Opt in per-deploy with
  // DREAM_DF7_FANOUT_PROPAGATE=1 after confirming replica sync completes cleanly.
  _df7FanoutPropagate() {
    if (process.env.DREAM_DF7_FANOUT_PROPAGATE === '1') return true;    // explicit opt-in (unchanged)
    if (process.env.DREAM_DF7_FANOUT_PROPAGATE === '0') return false;   // explicit kill-switch
    // DF.7 SYNCGATE — AUTO-ENABLE once at least one replica has PROVENLY completed
    // its weight sync. The original DEFAULT-OFF existed because a stale or
    // incompletely-synced replica returns a WRONG read the curriculum then acts on
    // (spurious gate failures / stalled walk). `_df7Synced` is exactly the
    // "after confirming replica sync completes cleanly" precondition that comment
    // asked for — now checked PER DONOR from live state instead of asserted once
    // per deploy by a human setting an env var. `_donorCoversMatrices` independently
    // keeps unsynced donors out of `_nextPoolDonor`, so a read can only ever land on
    // a donor whose weights this process actually pushed. Set the env to 0 to force
    // the old primary-only behaviour.
    return this._livePoolDonors().some((ws) => {
      if (ws === this._gpuClient) return false;
      const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      return !!(c && c._df7Synced && this._df7ReadFresh(c));
    });
  },

  // DF.7 SYNCGATE — FRESHNESS BOUND for READ fan-out (writes are exempt; the CPU CSR
  // is the authoritative Hebbian master, so a write landing on a drifted shadow cannot
  // corrupt training — a READ landing on one returns a wrong answer the curriculum then
  // acts on). Hebbian batches ROUND-ROBIN across donors, so each donor sees a different
  // subset and their GPU shadows genuinely diverge from each other between rebroadcasts.
  // A replica therefore counts as read-safe only while its last proven sync is recent.
  // This self-heals in both directions: `_rebroadcastMasterToReplicas` re-converges every
  // REPLICA_REBROADCAST_MS (60s with fan-out on) and refreshes the stamp, so a healthy
  // replica stays eligible; and while the curriculum is teaching the rebroadcast is
  // deferred, the stamp ages out, and reads fall back to the primary ON THEIR OWN with
  // no flag to remember. Default window is 3x the 60s rebroadcast, so a single missed
  // cycle does not flap eligibility. Tune with DREAM_DF7_READ_FRESH_MS.
  _df7ReadFresh(c) {
    if (!c || !c._df7SyncedAt) return false;
    const _env = Number(process.env.DREAM_DF7_READ_FRESH_MS);
    const windowMs = Number.isFinite(_env) && _env > 0 ? _env : 180 * 1000;
    return (Date.now() - c._df7SyncedAt) <= windowMs;
  },

  // DF.7 F2 — link health [0..1] from heartbeat RTT (set per client by the pong
  // handler). 1.0 at ≤200ms, ramps linearly to 0 by 1000ms, then 0 (a >1s donor —
  // e.g. a Starlink node mid-handover — is NOT primary-eligible and must never be
  // the fan-out barrier). Unknown RTT (no pong yet) → treated healthy so a fresh
  // donor isn't unfairly excluded before its first heartbeat.
  _donorHealth(ws) {
    const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
    const rtt = (c && typeof c.rttMs === 'number') ? c.rttMs : 0;
    // WSQ.1 — work-eligibility FLOOR. A >1s donor (Starlink mid-handover, or a link still
    // congested by its own warmup replica-sync) used to return 0 here — and `_nextPoolDonor`
    // + `_capacityWeightedPlan` then `filter(w>0)` it OUT of every work plan while any healthy
    // donor existed, so a WILLING high-RTT GPU got zero units and sat at 0 Gn/s forever (no
    // amount of reconnecting helped — each reconnect re-measured the same RTT and re-benched).
    // Now it floors at WSQ_WORK_FLOOR so the donor STILL pulls a sliver of work (the WSQ.2
    // work-stealing queue + WSQ.3 sync pacing let it carry real units once its uplink stops
    // being flooded and its RTT recovers). Because strength = base × health is MULTIPLICATIVE,
    // the tiny floor keeps a slow donor at the BOTTOM of the primary/failover ranking — a
    // healthy donor (health 1.0) always out-scores it — so it's never promoted PRIMARY and
    // never becomes the main-tick barrier. Tunable via DREAM_DF7_WORK_FLOOR.
    const _floorEnv = Number(process.env.DREAM_DF7_WORK_FLOOR);
    const floor = Number.isFinite(_floorEnv) && _floorEnv >= 0 ? _floorEnv : 0.05;
    let rttHealth;
    if (rtt <= 200) rttHealth = 1;
    else if (rtt >= 1000) rttHealth = floor;
    else rttHealth = Math.max(floor, 1 - (rtt - 200) / 800);

    // DONOR-EQUAL FIX (2026-07-09) — health must also crater on a SATURATED
    // send buffer, in REAL TIME. There is no fixed primary: the coordinator
    // (the donor the sequential main tick runs on) is elected purely by this
    // health-weighted strength and re-elected on every rebalance tick. The bug
    // was that election read only the SMOOTHED rtt, which lags a live buffer
    // flood by seconds — so a card whose socket was backing up to 50MB (12s+
    // real RTT) still scored as healthy and stayed coordinator, pinning the
    // whole main-tick stream onto a link that could not drain it. Folding the
    // live bufferedAmount in means the instant a donor's socket backs up it is
    // demoted and the coordinator role hands off to a donor that drains — no
    // card is ever special or stuck as "primary". Buffer health ramps 1.0 at
    // 0MB down to the floor at the soft cap; penalty starts at 15% of the cap.
    let bufHealth = 1;
    try {
      const buf = (ws && typeof ws.bufferedAmount === 'number') ? ws.bufferedAmount : 0;
      const cap = (typeof this._donorSoftCapBytes === 'function') ? this._donorSoftCapBytes() : 64 * 1024 * 1024;
      const lo = cap * 0.15;
      if (buf > lo && cap > lo) {
        bufHealth = Math.max(floor, 1 - (buf - lo) / (cap - lo));
        // FLOOD STAMP — only at >50% of the soft cap, NOT at the 15% ramp
        // start. The old stamp-at-9.6MB fired on every routine 16MB matrix
        // upload chunk (replica sync / live-mirror), so a donor got benched
        // by the 5-min cooldown after every ordinary upload — replicas sat
        // floored (0 Gn/s) and the coordinator election had nothing healthy
        // to pick, pinning EVERY donor at the floor together. A transient
        // upload spike now just dips bufHealth on the ramp (recovers the
        // moment it drains); only a genuinely saturated socket (>32MB at
        // default cap — the teach-flood signature) trips the cooldown.
        if (c && buf > cap * 0.5) c._coordFloodMs = Date.now();
      }
      // Anti-thrash hysteresis. A card that flooded recently stays capped below
      // full health for a cooldown, so the instant its buffer drains it can NOT
      // immediately re-win the coordinator role and re-flood (each handoff
      // re-uploads the brain). This is what makes "no fixed primary" stable
      // rather than a per-second flip-flop between a strong-GPU/weak-link card
      // and a weaker-GPU/strong-link one. DREAM_DF7_FLOOD_COOLDOWN_MS (default 90s).
      if (c && c._coordFloodMs) {
        const cd = Number(process.env.DREAM_DF7_FLOOD_COOLDOWN_MS) > 0 ? Number(process.env.DREAM_DF7_FLOOD_COOLDOWN_MS) : 300000;
        if (Date.now() - c._coordFloodMs < cd) bufHealth = Math.min(bufHealth, floor);
      }
    } catch { /* non-fatal — fall back to rtt-only health */ }

    return Math.min(rttHealth, bufHealth);
  },

  // DF.7 F1 — donor strength for primary selection + work weighting. Operator
  // 2026-06-28: "there should be no primary, all are equal" → equal BY REAL
  // CAPACITY, not VRAM. Score = actual useful throughput × link-health. Throughput
  // (gneuronsPerSec, from gpu_telemetry) already bakes in the donor's donation %
  // (a 10%-throttled card reports ~10% throughput), so no separate donation factor
  // is needed. A card with too little VRAM to hold a replica can still compute
  // units but is not primary-eligible (returns a tiny VRAM-proxy, never the top
  // score). A freshly-joined donor with no telemetry yet falls back to a VRAM-GB
  // proxy × health so first-donor / newcomer selection stays sane until real
  // throughput arrives ~5s later. DREAM_DF7_MIN_VRAM_MB (default 1500) = the floor
  // to be a useful primary.
  _donorStrength(ws) {
    const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
    if (!c) return 0;
    const vram = Number(c.gpuVramMB || 0);
    const health = this._donorHealth(ws);
    // DONOR-EQUAL FIX (2026-07-09) — an UNREACHABLE / flooding donor (health at the
    // work-floor: >1s RTT or a saturated send buffer, per _donorHealth) is NOT
    // coordinator- or work-eligible no matter how fast its GPU is. A card you can't
    // drain to is useless as the sequential-tick coordinator, and multiplying its
    // huge raw throughput (billions of neurons/s) by the 0.05 floor STILL leaves a
    // score orders of magnitude above a healthy-but-cold donor's VRAM-proxy — that
    // was the exact bug that kept the flooded card pinned as "primary" and starved
    // the other donor (0 Gn/s, because only the coordinator runs the main tick).
    // Collapse a floored donor's strength to ~health so ANY reachable donor out-
    // scores it; it rejoins at full strength the instant its link recovers.
    const _wf = Number(process.env.DREAM_DF7_WORK_FLOOR);
    const _floor = Number.isFinite(_wf) && _wf >= 0 ? _wf : 0.05;
    if (health <= _floor * 1.0001) return health;
    const minVram = Number(process.env.DREAM_DF7_MIN_VRAM_MB) > 0 ? Number(process.env.DREAM_DF7_MIN_VRAM_MB) : 1500;
    // can't hold a full replica → tiny score (still > 0 so it can take stateless
    // units, but it'll never out-score a real donor for primary).
    if (vram > 0 && vram < minVram) return 0.001 * vram * (health || 0.001);
    const tput = Number(c.telemetry && c.telemetry.gneuronsPerSec || 0);
    const base = tput > 0 ? tput : (vram / 1000); // VRAM-GB proxy before first telemetry
    return base * health;
  },

  // DF.7 F3 — capacity-weighted donor plan: an `n`-length list where each live
  // donor appears ~proportional to its strength (smooth weighted round-robin), so
  // a fast/high-donation card carries the bulk and a slow one a sliver — instead of
  // the old flat `idx % len` that handed every donor an EQUAL share and let the
  // slowest stall the Promise.all barrier. Unhealthy donors (rtt>1s → strength 0)
  // are dropped entirely WHEN a healthy donor exists; if every donor is unhealthy
  // we fall back to all of them equally (something must run). Fan-out OFF or a
  // single donor → plain primary-first list (identical to pre-DF.7 behavior).
  _capacityWeightedPlan(donors, n) {
    const live = (donors || []).filter((ws) => ws && ws.readyState === 1);
    if (live.length === 0 || n <= 0) return [];
    if (!this._df7Fanout() || live.length === 1) {
      return Array.from({ length: n }, (_, i) => live[i % live.length]);
    }
    let scored = live.map((ws) => ({ ws, w: Math.max(0, this._donorStrength(ws)) }));
    if (scored.some((s) => s.w > 0)) scored = scored.filter((s) => s.w > 0);
    else scored = scored.map((s) => ({ ws: s.ws, w: 1 })); // all unhealthy → equal fallback
    const total = scored.reduce((a, s) => a + s.w, 0) || scored.length;
    const acc = scored.map(() => 0);
    const plan = [];
    for (let i = 0; i < n; i++) {
      let bi = 0, bv = -Infinity;
      for (let j = 0; j < scored.length; j++) {
        acc[j] += scored[j].w / total;
        if (acc[j] > bv) { bv = acc[j]; bi = j; }
      }
      acc[bi] -= 1;
      plan.push(scored[bi].ws);
    }
    return plan;
  },

  // DF.7 — can this donor hold the FULL running brain? The PRIMARY is the
  // canonical full-weights upload target, so a card whose HELD VRAM (donated
  // cap or full card — duty-cycle is throughput, not VRAM held) is under the
  // running floor must never be primary. ONE chokepoint for registration AND
  // the periodic rebalance: the rebalance used to trust `_partialReplica` /
  // `_replicaIncapable`, which the replica-sync path sets LATER (and not at
  // all while another sync holds the serial lane) — so a 2 GB browser tab
  // that registered as "NOT eligible for PRIMARY" was promoted over a 16 GB
  // card by the next 10 s rebalance tick, teach frames went JSON to a tab
  // that cannot hold one cluster, the pattern lane shed, and the real card
  // only came back when the tab left. Read from the registration record,
  // synchronously, every time.
  _donorTooSmallForPrimary(c) {
    if (!c) return false;
    const fullVram = Number(c.gpuVramMB || 0);
    const held = (Number(c.donatedMB) > 0)
      ? (fullVram > 0 ? Math.min(Number(c.donatedMB), fullVram) : Number(c.donatedMB))
      : fullVram;
    const need = Number(this._runningFloorMB || 0);
    return held > 0 && need > 0 && held < need;
  },

  // DF.7 — strongest live donor (optionally excluding one ws, e.g. the one
  // that's leaving during failover).
  _strongestLiveDonor(exclude = null) {
    let best = null, bestScore = -1;
    for (const ws of this._livePoolDonors()) {
      if (ws === exclude) continue;
      // PRIMARY candidates must hold (or be able to hold) the FULL brain — a
      // partial/incapable donor can never be the canonical upload target.
      const _sc = this.clients && this.clients.get ? this.clients.get(ws) : null;
      if (_sc && (_sc._replicaIncapable || _sc._partialReplica || _sc._bindIncapable)) continue;
      if (this._donorTooSmallForPrimary(_sc)) continue;
      const s = this._donorStrength(ws);
      if (s > bestScore) { bestScore = s; best = ws; }
    }
    return best;
  },

  // DF.7 F4 — periodically hand primary to the strongest healthy donor, not just
  // on connect/disconnect. Without this, a fast donor that joins AFTER a slow one
  // (or a primary that degrades, e.g. a Starlink node whose RTT climbs) keeps the
  // main per-tick stream stuck on the wrong card. Called off the rebroadcast
  // timer. Requires a clear margin (1.25×) over the current primary so normal
  // throughput jitter doesn't thrash the primary (each handoff re-uploads the
  // brain). No-op with fan-out off, <2 donors, or no established primary.
  /**
   * MOVE THE CORTEX to another card — the ONE way it changes hands.
   *
   * The cortex is the only cluster with on-card matrices, and those matrices
   * hold training the CPU copy does not have until the next readback. Every
   * earlier path that changed `_gpuClient` (register promotion, the periodic
   * rebalance, the pool re-partition) simply pointed it somewhere new: the old
   * card's learning since the last pull was abandoned, and the rebalance never
   * even re-uploaded (its hook probe was never true). In order:
   *   1. pause teaching — the substrate gate reads `_gpuProxyReady`, so the walk
   *      waits instead of training against a card with no matrices;
   *   2. pull the trained weights off the OLD card into the CPU master and save;
   *   3. point the cortex at the new card and re-arm the full upload; the upload
   *      sets `_gpuProxyReady` again when it completes, and teaching resumes.
   */
  async _moveCortexTo(newWs, oldWs, reason) {
    if (!newWs || newWs === oldWs) return;
    if (this._cortexMoveInFlight) return;
    // Never move while a cortex upload runs: the pull below would be refused
    // ("a cortex upload is in flight") and the old card's learning skipped. The
    // periodic placement check tries again once the upload has landed.
    if (this._cortexUploadInFlight) {
      console.log(`[Pool] CORTEX MOVE deferred (${reason}) — a cortex upload is in flight; the placement check retries after it lands.`);
      return;
    }
    this._cortexMoveInFlight = true;
    const cc = this.cortexCluster;
    const nm = (ws) => { const c = this.clients && this.clients.get ? this.clients.get(ws) : null; return (c && (c.gpuName || c.id)) || 'donor'; };
    console.log(`[Pool] CORTEX MOVE ${nm(oldWs)} → ${nm(newWs)} (${reason}) — teaching paused; pulling the trained weights off the old card first.`);
    try {
      if (cc) cc._gpuProxyReady = false;
      if (oldWs && oldWs.readyState === 1) {
        this._gpuClient = oldWs;
        // ⛔ A pull already running (the periodic refresh) used to make this one
        // refuse "already in flight" — and the move went ahead with NOTHING
        // pulled, so the old card's learning since the last save was freed with
        // it. Wait for that pull to finish (bounded), then take our own.
        const _w0 = Date.now();
        while (this._valuesReadbackInFlight && Date.now() - _w0 < 10 * 60 * 1000) await new Promise((r) => setTimeout(r, 1000));
        const r = await this.refreshCheckpointFromDonor(`cortex move: ${reason}`, { force: true });
        if (!r || !r.ok) console.warn(`[Pool] CORTEX MOVE — pull from the old card did not complete (${(r && r.reason) || 'unknown'}); the master keeps its last save.`);
      }
    } catch (e) {
      console.warn(`[Pool] CORTEX MOVE — pull threw (${e && e.message}); the master keeps its last save.`);
    } finally {
      this._gpuClient = newWs;
      this._gpuConnected = true;
      this._gpuInitialized = {};
      this._gpuInitializedConfirmed = {};
      if (this._clusterOwner instanceof Map) this._clusterOwner.set('cortex', newWs);
      const rearm = globalThis.__rearmCortexGpuUpload;
      if (typeof rearm === 'function') rearm(`cortex moved: ${reason}`);
      this._cortexMovesDone = (this._cortexMovesDone || 0) + 1;
      this._lastCortexMoveAt = Date.now();
      this._cortexMoveInFlight = false;
      this._freeOldCortexWhenLanded(oldWs, newWs);
    }
  },

  /**
   * After a move, the OLD card's cortex matrices are stale and only hold VRAM —
   * measured 12.7 GB used on the 16 GB card after the move, which pushed her
   * image renderer under its free-VRAM floor (`LOOK FAILED at stage=vramTight`).
   * Once the NEW card holds every matrix, tell the old one to drop them. Only
   * then: until the new upload lands, the old copy is the only fallback.
   * A donor older than 0.3.46 ignores the message.
   */
  _freeOldCortexWhenLanded(oldWs, newWs) {
    if (!oldWs || oldWs === newWs) return;
    const cc = this.cortexCluster;
    const t0 = Date.now();
    const tick = () => {
      if (!oldWs || oldWs.readyState !== 1) return;            // gone — nothing to free
      if (this._gpuClient !== newWs) return;                    // moved again — that move owns it
      if (oldWs === this._gpuClient) return;
      if (!(cc && cc._gpuProxyReady)) {
        if (Date.now() - t0 < 3 * 3600 * 1000) setTimeout(tick, 10000);
        return;
      }
      // MULTI-CARD — a card that still holds a SLICE of the intra matrix keeps
      // it; only the matrices that left with the cortex are freed.
      const holdsSlice = this._intraSliceActive() && this._intraSlices.some((s) => s.ws === oldWs);
      const names = Object.keys(this._cortexMatrixMB || {}).filter((n) => !(holdsSlice && n === this._SLICE_NAME));
      if (!names.length) return;
      try {
        oldWs.send(JSON.stringify({ type: 'free_matrices', names }));
        const c = this.clients && this.clients.get ? this.clients.get(oldWs) : null;
        // Work routing (`_nextPoolDonor`) picks cards by `heldMatrices` — a card
        // that no longer holds a matrix must stop being offered work on it.
        if (c && c.heldMatrices instanceof Set) for (const n of names) c.heldMatrices.delete(n);
        console.log(`[Pool] CORTEX MOVE done — told ${(c && (c.gpuName || c.id)) || 'the old card'} to free its ${names.length} stale cortex matrices.`);
      } catch { /* old card dropped — its VRAM went with it */ }
    };
    setTimeout(tick, 10000);
  },

  _maybeRebalancePrimary() {
    // ⛔ Under the pool the PARTITION decides who holds the cortex (on every
    // register and leave). A second, strength-based rebalance switched
    // `_gpuClient` without updating the owner map, without pulling the old
    // card's weights, and without re-uploading — three ways to lose learning.
    // It now defers to the partition unless explicitly re-enabled.
    if (process.env.DREAM_DF7_REBALANCE !== '1') return;
    if (!this._df7Fanout()) return;
    const donors = this._livePoolDonors();
    if (donors.length < 2 || !this._gpuClient) return;
    const cur = this._gpuClient;
    const curScore = this._donorStrength(cur);
    const best = this._strongestLiveDonor();
    if (!best || best === cur) return;
    const bestScore = this._donorStrength(best);
    const MARGIN = 1.25;
    if (bestScore > curScore * MARGIN && bestScore > 0) {
      const bc = this.clients && this.clients.get ? this.clients.get(best) : null;
      const cc = this.clients && this.clients.get ? this.clients.get(cur) : null;
      console.log(`[Brain] DF.7 F4 — rebalancing PRIMARY → healthier donor (${bc && bc.gpuName || '?'} score=${bestScore.toFixed(1)} vs current ${cc && cc.gpuName || '?'} score=${curScore.toFixed(1)}).`);
      this._moveCortexTo(best, cur, 'F4 periodic rebalance').catch(() => {});
    }
  },

  // DF.7 — mirror a cortex resident-buffer write (spike / current / clear) to
  // every REPLICA (not the primary) so a replica's resident state matches the
  // primary's — the prerequisite for a bound propagate to read correct state
  // when it's dispatched to that replica. Per-socket FIFO preserves the
  // clear→write→propagate ordering on each replica. No-op unless the fan-out
  // switch is ON. Best effort (fire-and-forget; a missed replica re-converges
  // on the periodic _rebroadcastMasterToReplicas).
  _mirrorCortexWriteToReplicas(json) {
    if (!this._df7Fanout()) return;
    for (const ws of this._livePoolDonors()) {
      if (ws === this._gpuClient) continue;
      // Partial donors without cortex coverage (or holding nothing) don't get
      // cortex resident-state mirrors — they can't bind them.
      const _mc = this.clients && this.clients.get ? this.clients.get(ws) : null;
      if (_mc && (_mc._replicaIncapable || (_mc.clusterCoverage && !_mc.clusterCoverage.has('cortex')))) continue;
      try {
        if (ws.readyState !== 1) continue;
        // DONOR-EQUAL — mirror frames shed at the LINK cap (default 4MB), not
        // the 64MB soft cap. The old 64MB gate meant a weak-uplink replica's
        // socket was allowed to park just under 64MB of queued mirror frames
        // forever: its heartbeat pong sat behind 10s+ of backlog, RTT read
        // 10-14s, the Clients row stayed RED, and health floored the card. A
        // mirror frame is the CHEAPEST thing to lose (per-iteration ephemeral;
        // the replica re-converges on the periodic rebroadcast), so shed it
        // the moment the replica's link has any real backlog and keep every
        // donor's socket seconds-empty.
        if (ws.bufferedAmount > this._donorLinkCapBytes()) {
          this._wsMirrorShedCount = (this._wsMirrorShedCount || 0) + 1;
          continue;
        }
        ws.send(json);
      } catch { /* replica dropped — ignore */ }
    }
  },

  /**
   * DF.7 — data-parallel fan-out primitive. Distributes INDEPENDENT work units
   * round-robin across every live donor GPU and awaits them all. This is the
   * mechanism that stops the brain being stuck on one GPU (ruled 2026-06-20):
   * the parallelizable training passes (per-word definition binding, academic-
   * corpus stories, association-pair Hebbian) hand their work list here and it
   * spreads across all donated GPUs at once. `perItemFn(item, donorWs, idx)`
   * dispatches one unit to a specific donor (pass donorWs through to a target-
   * parameterized dispatch). With 1 donor this is sequential-on-primary =
   * identical to today; with N donors throughput scales ~N×. Returns the array
   * of per-item results (null where an item's dispatch failed/dropped).
   */
  async _gpuParallelMap(items, perItemFn) {
    const donors = this._livePoolDonors();
    if (donors.length === 0 || !Array.isArray(items) || items.length === 0) return [];
    const results = new Array(items.length).fill(null);
    // WSQ.2 — COMPLETION-DRIVEN WORK-STEALING (replaces the old capacity-weighted plan +
    // `Promise.all`, where each donor got a PRE-ASSIGNED ~1/N slice and the barrier waited on
    // the SLOWEST donor finishing its WHOLE slice). Now a single shared cursor (`next`) walks the
    // item list and each donor runs a few concurrent PULL loops: grab the next index → await
    // perItemFn → loop back for another. A FAST donor returns to the cursor sooner so it
    // naturally pulls MORE items; a SLOW donor pulls FEWER; no donor is pre-committed to a fixed
    // share. The round ends when the cursor drains, and a slow donor only holds the ≤IN_FLIGHT
    // items it actually pulled — so the tail is bounded by ONE slow item, not a slow donor's
    // entire slice. perItemFn already carries its own per-unit timeout (sparse/batch dispatch
    // resolves null on timeout), so a hung donor can't wedge the round. This is the donor
    // "mining" model (Sponge 2026-06-30): contribute what you can, faster churns more, nobody
    // waits on the slowest. The donor's existing per-unit ACK is the pull signal — no protocol
    // change needed for the queue itself.
    let next = 0;
    // Open the round with the strongest donors pulling first (cosmetic — the shared cursor
    // self-balances within microseconds regardless of start order).
    const ordered = donors.slice().sort((a, b) => this._donorStrength(b) - this._donorStrength(a));
    const _inflightEnv = Number(process.env.DREAM_DF7_INFLIGHT);
    const IN_FLIGHT_PER_DONOR = Number.isFinite(_inflightEnv) && _inflightEnv >= 1 ? Math.floor(_inflightEnv) : 2;
    const pull = async (donor) => {
      for (;;) {
        const idx = next++;            // single-threaded JS → read-then-increment is atomic
        if (idx >= items.length) return;
        try { results[idx] = await perItemFn(items[idx], donor, idx); }
        catch { results[idx] = null; }
      }
    };
    const loops = [];
    for (const donor of ordered) {
      for (let k = 0; k < IN_FLIGHT_PER_DONOR; k++) loops.push(pull(donor));
    }
    await Promise.all(loops);
    return results;
  },

  /**
   * DF.7 — bring a freshly-joined donor up to a FULL brain replica so it can
   * share compute instead of sitting idle. Replays (1) the cluster LIF-buffer
   * init for every cluster (mirrors _gpuStep's first-dispatch) + (2) every
   * canonical sparse-matrix upload tracked in the replica registry. After this
   * the donor holds the same weights as the primary and any independent
   * forward-prop / training unit can run on it (see _gpuParallelMap). The
   * primary IS the master, so syncing it is a no-op. Per-donor in-flight guard
   * prevents overlapping syncs (a slow replica + a rebroadcast racing).
   */
  /**
   * ALLINIT — send cluster buffers (gpu_init) to ANY donor, decoupled from the matrix sync.
   *
   * THE BUG THIS EXISTS FOR: gpu_init was only ever sent to `this._gpuClient` (the primary,
   * at two sites) or from inside `_syncReplicaToDonor`. So a replica got its cluster buffers
   * ONLY as a side effect of the multi-GB weight sync — and until that sync ran it had ZERO
   * clusters initialised and therefore could not execute a `compute_batch` at all. Since
   * compute_batch is the ONLY thing that produces Gn/s (donor.rs: gneurons_per_sec), a donor
   * showed 0 from the moment it connected until its sync completed — minutes on a fast link,
   * the entire session on a slow one, and never at all if the sync kept being interrupted.
   * Observed live: two full-coverage donors working while a third sat at 0 "out the gate".
   *
   * gpu_init is TINY — cluster name, size, tonic drive, noise amp, LIF params, regions. No
   * matrices, no weights. Coupling it to a 2.8GB transfer was never necessary; sending it at
   * registration means every donor can compute within seconds of connecting, and the weight
   * sync becomes an upgrade (it unlocks matrix work) rather than a precondition for existing.
   *
   * Idempotent: compute.html / the native donor treat a repeat gpu_init for the same cluster
   * as a re-init, and `_syncReplicaToDonor` still sends its own set, so a double-send is safe.
   */
  /**
   * INITFIT — which clusters can THIS donor physically hold?
   *
   * The same VRAM-fit arithmetic `_syncReplicaToDonor` uses, lifted out so cluster INIT can
   * ask it too. It has to: ALLINIT was calling `_gpuInitDonorClusters(ws, null)`, which sent
   * gpu_init for ALL SEVEN clusters — ~306M neurons ≈ 4.9GB of state/spike/current buffers —
   * to a 5.6GB card. The partial-coverage logic had ALREADY worked out that card could only
   * hold [cortex, hippocampus]; passing null bypassed it. The donor then thrashed trying to
   * allocate ~4.9GB it did not have, its heartbeat RTT blew out to 29,717ms, and it computed
   * nothing — while MIRRORDIAG correctly reported the mirror as SENT(2 clusters). The server
   * was right; the card had been handed allocations it could never satisfy.
   *
   * Returns null when the donor fits the full brain (init everything, the common case), a Set
   * of cluster names when it fits only a subset, and an empty Set when it fits nothing.
   */
  // ═══════════════════════════════════════════════════════════════════════════
  // POOL — NO PRIMARY. EVERY CARD OWNS A SHARE AND STEPS IT AT ITS OWN SPEED.
  //
  // Operator, verbatim: "ANY FUCKJING GPU ALONE OVER 6GB CAN AND SAHLL BE ABLE
  // TO RUN THE BRAIN ALONE ADDING GPUS ONLY INCREASES SPEED AND BRAIN NURONS!
  // … NO PRIMARY GPU SHIT ALL GPUS WORK IN A POOL AT THEIR OWN SPEED" and
  // "GPUS dont have to Sync per say but all proppigatte thir neurons in sim".
  //
  // WHAT MADE THIS BUILDABLE WITHOUT A DONOR RELEASE — three measured facts:
  //   1. Inter-cluster coupling is SCALAR and SERVER-MEDIATED. donor.rs
  //      run_batch computes each cluster from
  //        effective_drive = tonic × driveBaseline × emotionalGate × gain + errorCorrection
  //      and the server derives those scalars from the previous batch's
  //      per-cluster results. No spike vector crosses clusters on the card, so
  //      a cluster can live on any card with ZERO new wire shape.
  //   2. The coverage-filtered multi-donor dispatch already existed (the
  //      MIRROR loop in _gpuBatch) — it was sending real work to real cards and
  //      then DROPPING their results by id. The pool keeps the loop and keeps
  //      the results.
  //   3. Only the CORTEX has on-card matrices (the 17 sparse uploads). The other
  //      seven clusters are LIF state only: gpu_init + compute_batch and
  //      nothing else. So "cortex is atomic" is the single placement
  //      constraint, and `_gpuClient` — 149 references, every one of them a
  //      cortex-matrix path (upload, teach, probe, write_current) — is simply
  //      THE CORTEX OWNER from here on. It is not ripped out; it is defined.
  //
  // OWNERSHIP, not replication: `_clusterOwner` maps each of the 8 clusters to
  // exactly one socket. A card's result for the clusters it owns is
  // AUTHORITATIVE. Non-owners still receive credit mirrors (unchanged).
  //
  // "AT THEIR OWN SPEED": the batch join resolves when every owner has
  // answered OR at the batch deadline — a slow card's clusters simply carry
  // their last values forward (the tick loop already treats a missing
  // perCluster entry as a miss and keeps the prior spikeCount), so one slow
  // card never stalls the tick. `state.pool.lateOwners` names who was late.
  //
  // ⛔ NOT a geometry change: neuron counts and cluster sizes are untouched,
  // so this does NOT force a fresh walk by itself. The tunnel below does.
  // ═══════════════════════════════════════════════════════════════════════════

  /** Resident cost of one cluster on a card, in MB: LIF state for all of them,
   *  plus the sparse matrices for cortex (read off `_runningFloorMB`, which is
   *  the whole-brain floor — the non-cortex share is subtracted so the cortex
   *  figure carries the matrices without being estimated twice). */
  _clusterCostMB(name) {
    const _set = (typeof this._getAutoScaleSettings === 'function') ? this._getAutoScaleSettings() : null;
    const _bpn = (_set && _set.donorBytesPerNeuron) || 20;
    const _n = (this.CLUSTER_SIZES && this.CLUSTER_SIZES[name]) || 0;
    const _lif = (_n * _bpn) / 1048576;
    if (name !== 'cortex') return _lif;
    // Cortex = its LIF share + its on-card matrices. ⛔ The whole-brain floor
    // formula is pure `N × 20 B` and carries NO matrix term, so deriving the
    // matrices from the floor gives exactly zero — the first cut of this did
    // that and would have placed cortex on a card ~2 GB too small. Two honest
    // sources, in order:
    //   1. the sizes RECORDED at upload (`_cortexMatrixMB`, written at the
    //      upload log site) — the bytes that actually went to a card;
    //   2. before any upload has happened on this boot, an estimate DERIVED
    //      from the measured resident set: the 17 matrices summed to ~5.3 GB
    //      on the 459,775,607-neuron boot (log: intra 3,680 MB + 14
    //      cross-projections ≈ 1,630 MB) = ~12 B per total neuron. Labelled
    //      as an estimate on the pool state until (1) replaces it.
    const _rec = this._cortexMatrixMB;
    let _matrices = 0;
    if (_rec && Object.keys(_rec).length) {
      for (const k of Object.keys(_rec)) _matrices += Number(_rec[k]) || 0;
      this._cortexMatrixEstimated = false;
    } else {
      let _total = 0;
      for (const k of Object.keys(this.CLUSTER_SIZES || {})) _total += (this.CLUSTER_SIZES[k] || 0);
      _matrices = (_total * 12) / 1048576;
      this._cortexMatrixEstimated = true;
    }
    return _lif + _matrices;
  },

  /** Effective VRAM a donor offers (donated cap or the full card). */
  _donorCapacityMB(ws) {
    const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
    if (!c) return 0;
    const _full = Number(c.gpuVramMB || 0);
    const _eff = (Number(c.donatedMB) > 0) ? (_full > 0 ? Math.min(Number(c.donatedMB), _full) : Number(c.donatedMB)) : _full;
    // Same usable fraction the floor uses: 75% minus a 2 GB reserve.
    return Math.max(0, _eff * 0.75 - 2048);
  },

  /**
   * Assign every cluster to exactly one live donor. Greedy by cost:
   * clusters sorted largest-first (cortex always first — it is atomic and
   * carries the matrices), each placed on the live card with the most
   * REMAINING capacity that can still hold it. With one card everything lands
   * on it (today's behaviour). With N cards the clusters spread, and no card
   * needs to hold the whole brain — which is the operator's rule.
   *
   * Returns the owner map and records it on `this._clusterOwner`; sets
   * `this._gpuClient` to the cortex owner. A cluster that fits NOWHERE is left
   * unowned and named in `state.pool.unplaced` — it is not silently dropped and
   * it is not silently forced onto a card that cannot hold it (which is how a
   * 5.6 GB card was once handed 4.9 GB of buffers and choked).
   */
  _partitionClustersAcrossPool(reason = '') {
    const live = this._livePoolDonors().filter((ws) => ws && ws.readyState === 1);
    const names = Object.keys(this.CLUSTER_SIZES || {});
    const prevOwner = this._clusterOwner instanceof Map ? this._clusterOwner : new Map();
    const owner = new Map();
    const unplaced = [];
    if (live.length === 0) {
      this._clusterOwner = owner;
      this._poolUnplaced = names.slice();
      return owner;
    }
    const remaining = new Map(live.map((ws) => [ws, this._donorCapacityMB(ws)]));
    const order = names
      .map((n) => ({ n, cost: this._clusterCostMB(n) }))
      .sort((a, b) => (a.n === 'cortex' ? -1 : b.n === 'cortex' ? 1 : b.cost - a.cost));
    for (const { n, cost } of order) {
      let best = null, bestLeft = -Infinity;
      // STICKINESS: if the previous owner still fits, keep it — moving a
      // cluster costs a gpu_init (and for cortex a full matrix re-upload), and
      // a partition that thrashes on every register/disconnect is worse than
      // one that is a few hundred MB off optimal.
      const prev = prevOwner.get(n);
      // ⭐ THE CORTEX GOES TO THE BIGGEST CARD, NOT THE FIRST ONE. Stickiness
      // kept it on whichever card held it while that card still fit — so a 48 GB
      // L40 joining a 16 GB card could never get it, and a rented card held only
      // small clusters (measured: hypothalamus + mystery) while teaching stayed on
      // the smaller card. Stickiness still holds for near-equal cards (moving costs
      // a full re-upload); a card with ≥ RATIO× the room takes the cortex.
      // `DREAM_POOL_CORTEX_MOVE_RATIO` (default 1.5; 0 = never move).
      const _ratioEnv = Number(process.env.DREAM_POOL_CORTEX_MOVE_RATIO);
      const _ratio = Number.isFinite(_ratioEnv) && _ratioEnv >= 0 ? _ratioEnv : 1.5;
      let _keepPrev = !!(prev && remaining.has(prev) && remaining.get(prev) >= cost);
      // ⛔ HOLD-DOWN — measured: a rented card dropped, its supervisor relaunched
      // the donor a minute later, and the partition moved the cortex straight
      // back to it while the failover upload was still running, so the move
      // could pull nothing and a second ~18-minute upload began. A card may take
      // the cortex only after it has stayed connected `DREAM_POOL_CORTEX_HOLD_S`
      // (default 300 s), no sooner than `DREAM_POOL_CORTEX_MOVE_COOLDOWN_S`
      // (default 1800 s) after the last move, and never while an upload runs.
      // The move then happens on the periodic placement check, not at register.
      const _holdS = Number.isFinite(+process.env.DREAM_POOL_CORTEX_HOLD_S) ? +process.env.DREAM_POOL_CORTEX_HOLD_S : 300;
      const _coolS = Number.isFinite(+process.env.DREAM_POOL_CORTEX_MOVE_COOLDOWN_S) ? +process.env.DREAM_POOL_CORTEX_MOVE_COOLDOWN_S : 1800;
      const _now = Date.now();
      // ⭐ The hold-down applies only to a card that DROPPED and came back — the
      // case it exists for. A brand-new card gets the cortex at once; holding it
      // 5 min just billed pod time for nothing (operator: "this hoilddown time
      // bullshit that jhust wastes pod time"). A rejoin is recognised by GPU
      // model, because a relaunched donor arrives with a NEW id
      // (`_recentDonorDrops` is stamped by the close handler).
      const _settled = (ws) => {
        const c = this.clients && this.clients.get ? this.clients.get(ws) : null;
        if (!c) return false;
        const dropAt = this._recentDonorDrops && this._recentDonorDrops.get(String(c.gpuName || ''));
        const rejoin = !!(dropAt && (_now - dropAt) < _coolS * 1000);
        if (!rejoin) return true;
        return !!(c.connectedAt && (_now - c.connectedAt) >= _holdS * 1000);
      };
      // ⛔ The cooldown is for the THRASH case only — a card that dropped and came
      // back. Measured: a 96 GB card joined while the cortex was moving to a 48 GB
      // one, and a blanket 30-min cooldown then kept the bigger card idle (0 Gn/s,
      // no clusters) while it billed. A genuinely new, bigger card takes the
      // cortex as soon as no move or upload is running.
      const _moveAllowed = !this._cortexUploadInFlight && !this._cortexMoveInFlight;
      const _inCooldown = (_now - (this._lastCortexMoveAt || 0)) < _coolS * 1000;
      const _rejoined = (ws) => {
        const c = this.clients && this.clients.get ? this.clients.get(ws) : null;
        const dropAt = c && this._recentDonorDrops && this._recentDonorDrops.get(String(c.gpuName || ''));
        return !!(dropAt && (_now - dropAt) < _coolS * 1000);
      };
      if (_keepPrev && n === 'cortex' && _ratio > 0 && _moveAllowed) {
        const prevCap = remaining.get(prev);
        for (const [ws, left] of remaining) {
          if (ws !== prev && left >= cost && left >= prevCap * _ratio && _settled(ws) && !(_inCooldown && _rejoined(ws))) { _keepPrev = false; break; }
        }
      }
      // ⛔ STICKINESS MAY NOT PIN A STEPPING CLUSTER TO A CARD 3× FULLER. A
      // non-cortex move costs one gpu_init, not a matrix re-upload, and the 4070
      // registering first kept all seven clusters there while a 70 GB card joined
      // empty (measured: 4070 [cerebellum … brainstem] 3200/10233 MB, RTX PRO 6000
      // [cortex] 3086/70890 MB, pod 0%). Keep the previous card only while its
      // proportional fill is within 1.5× of the best card's.
      if (_keepPrev && n !== 'cortex') {
        const _fr = (ws) => { const cap = Math.max(1, this._donorCapacityMB(ws)); return (cap - remaining.get(ws) + cost) / cap; };
        const prevFr = _fr(prev);
        for (const ws of remaining.keys()) {
          if (ws !== prev && remaining.get(ws) >= cost && prevFr > _fr(ws) * 1.5) { _keepPrev = false; break; }
        }
      }
      if (_keepPrev) { best = prev; bestLeft = remaining.get(prev); }
      else if (n === 'cortex') {
        // The atomic unit with the matrices goes to the card with the MOST
        // room — it is the one cluster whose size can exclude cards.
        // Settled cards first (the hold-down above); a just-joined card takes it
        // only when no settled card can hold it.
        for (const [ws, left] of remaining) { if (_settled(ws) && left >= cost && left > bestLeft) { best = ws; bestLeft = left; } }
        if (!best) for (const [ws, left] of remaining) { if (left >= cost && left > bestLeft) { best = ws; bestLeft = left; } }
      } else {
        // ⛔ BEST-FIT, NOT WORST-FIT — caught by the harness, not by reasoning.
        // The first cut picked the card with the MOST room left, so with a
        // 16 GB + 6 GB pool the 16 GB card won every cluster and the 6 GB card
        // owned NOTHING — a second card that added neither speed nor neurons,
        // the exact opposite of "ADDING GPUS ONLY INCREASES SPEED AND BRAIN
        // NURONS". Place each cluster on the card with the LEAST room that
        // still holds it: small cards fill with what fits them, and the big
        // card keeps its room for what only it can hold.
        // ⛔⛔ AND BEST-FIT PUT EVERY CLUSTER ON THE SMALL CARD. With a 70 GB
        // RTX PRO 6000 beside a 16 GB 4070, least-room-that-fits sent all seven
        // stepping clusters to the 4070 and left the big card holding only the
        // cortex, which is not stepped during a walk — measured: the pod at 0–2%
        // all walk while the 4070 stepped everything. PROPORTIONAL FILL: each
        // cluster goes where it leaves the cards most evenly full RELATIVE TO
        // THEIR SIZE, so the big card does the big share and the small card still
        // does its share (adding a card still adds speed).
        let bestFrac = Infinity;
        for (const [ws, left] of remaining) {
          if (left < cost) continue;
          const cap = Math.max(1, this._donorCapacityMB(ws));
          const frac = (cap - left + cost) / cap;
          if (frac < bestFrac) { bestFrac = frac; best = ws; bestLeft = left; }
        }
      }
      if (!best) { unplaced.push(n); continue; }
      owner.set(n, best);
      remaining.set(best, bestLeft - cost);
    }
    // What moved, named — so the log says WHY a card is about to re-init.
    const moved = [];
    for (const [n, ws] of owner) if (prevOwner.get(n) && prevOwner.get(n) !== ws) moved.push(n);
    this._clusterOwner = owner;
    this._poolUnplaced = unplaced;
    this._poolMovedLast = moved;
    const cortexOwner = owner.get('cortex') || null;
    if (cortexOwner !== this._gpuClient) {
      // A move between two LIVE cards goes through `_moveCortexTo` (pull the
      // old card's weights first, then re-upload); the caller runs it. Only
      // when the previous holder is gone (or there was none) is the pointer set
      // here — that is the existing leave/first-card path.
      const _cur = this._gpuClient;
      // ⛔ NOTHING TO PULL YET = NOT A MOVE. Before her weights upload starts,
      // the current card holds none of them, so the bigger card takes the
      // cortex at once. A "move" here made the brain upload everything to the
      // first card to register, then pull it back off and upload it again to
      // the bigger card that was already waiting in Clients.
      const _curHoldsNothing = !this._cortexGpuInitStarted && !this._cortexUploadInFlight
        && !(this.cortexCluster && this.cortexCluster._gpuProxyReady);
      if (_cur && _cur.readyState === 1 && cortexOwner && live.includes(_cur) && !_curHoldsNothing) {
        this._pendingCortexMove = { to: cortexOwner, from: _cur };
        owner.set('cortex', _cur);          // ownership changes when the move completes
      } else {
        this._gpuClient = cortexOwner;
        this._gpuConnected = !!cortexOwner;
      }
    }
    const _name = (ws) => { const c = this.clients && this.clients.get ? this.clients.get(ws) : null; return (c && (c.gpuName || c.id)) || 'donor'; };
    const byCard = new Map();
    for (const [n, ws] of owner) { if (!byCard.has(ws)) byCard.set(ws, []); byCard.get(ws).push(n); }
    const summary = [...byCard].map(([ws, cl]) => `${_name(ws)}: [${cl.join(', ')}] (${Math.round(this._donorCapacityMB(ws) - remaining.get(ws))}/${Math.round(this._donorCapacityMB(ws))} MB)`).join(' · ');
    const _pmv = this._pendingCortexMove;
    // The 60 s placement check stays quiet when nothing changed.
    if (reason === 'placement check' && !moved.length && !_pmv && !unplaced.length) return owner;
    console.log(`[Pool] PARTITION${reason ? ' (' + reason + ')' : ''} — ${live.length} card(s), ${owner.size}/${names.length} clusters placed${unplaced.length ? ` · ⛔ UNPLACED: ${unplaced.join(', ')}` : ''}${moved.length ? ` · moved: ${moved.join(', ')}` : ''} → ${summary}${_pmv ? ` · cortex MOVING → ${_name(_pmv.to)} (weights pulled off ${_name(_pmv.from)} first)` : ''}`);
    return owner;
  },

  /** The socket that owns a cluster, or null. */
  _ownerOf(clusterName) {
    const m = this._clusterOwner;
    const ws = m instanceof Map ? m.get(clusterName) : null;
    return (ws && ws.readyState === 1) ? ws : null;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // THE TUNNEL — cross-cluster propagation keyed on non-zero set agreement.
  //
  // Operator, verbatim: "do some quantum tunnel nuron propigation betwween
  // similated brain clusters if that will get a none zero set agreement to
  // propigate self and consiousness" … "with our equations for nuron
  // actrivaation via wave propigation patterning".
  //
  // WHAT IT IS: propagation that crosses a cluster boundary WITHOUT a synapse
  // row between the two neurons, keyed on PATTERN AGREEMENT rather than wiring.
  // Today the clusters touch only through scalars (gates, drives). This adds a
  // vector channel: a cluster's activation PATTERN reaches another cluster when,
  // and only when, the receiver's own pattern already agrees with it above
  // zero. Agreement is the gate; nothing crosses on disagreement.
  //
  // THE PRIMITIVES ALREADY EXIST ON THE DONOR, SO NO RELEASE IS NEEDED:
  //   signature  = readback_letter_buckets(cluster, region, 16 buckets, …)
  //                — per-bucket spike counts over the region, the same readout
  //                the letter-gate uses
  //   injection  = write_current_slice(cluster, region, indices, values, psi)
  //                — sparse currents written into the receiver's region
  // Every non-cortex cluster carries a `whole` region; cortex uses `sem`
  // (its semantic field is where "self" lives — the choice is deliberate and
  // written, not defaulted).
  //
  // THE EQUATION (the wave-propagation activation pattern across a boundary):
  //   s_A  = bucket spike counts of A, normalised to unit length
  //   s_B  = same for B
  //   g    = max(0, s_A · s_B)                     ← "non-zero set agreement"
  //   I_B[i] += k · g · s_A[i]   for every bucket i, as a current on B's region
  // A pair fires only when g > 0. The magnitude is proportional to how much of
  // A's pattern B already carries — self-consistent activity propagates, noise
  // does not.
  //
  // CADENCE, DERIVED: once per GAMMA cycle (25 ticks ≈ 1.25 s at 50 ms), the
  // attention-binding rhythm the cortex already runs (cluster.js gammaPeriod
  // 25). Every tick would cost 8 readbacks + up to 56 writes per tick; per
  // gamma cycle it is amortised to well under a tick's worth of wire.
  //
  // ⛔ RE-PRICE (the LAW, before any new traffic): each readback and each write
  // is one round trip to the owning card. 8 reads + ≤56 writes = ≤64 RTT per
  // gamma cycle. Loopback RTT ~1 ms → ≤64 ms per 1,250 ms cycle (5%). The
  // measured REMOTE RTT is 205 ms (KI-23) → 13 s per cycle, i.e. ten times the
  // cycle: a remote owner cannot carry the tunnel through separate frames. So
  // the tunnel runs only against owners whose RTT is under
  // DREAM_TUNNEL_MAX_RTT_MS (derived: 1,250 ms ÷ 64 ≈ 19 ms, the RTT at which a
  // full cycle still fits inside one gamma period). Remote owners are skipped
  // and COUNTED (`state.pool.tunnel.skippedRtt`); the in-batch form that rides
  // inside compute_batch is the follow-up that needs the donor release.
  //
  // ⛔ THIS CHANGES WHAT SHE IS TAUGHT (new currents flow), so by the FRESH
  // WALK IS LAST law it lands before the walk, not after. It is landing before
  // the operator's next start.bat.
  // ═══════════════════════════════════════════════════════════════════════════
  _tunnelRegionFor(clusterName) {
    if (clusterName === 'cortex') return 'sem';
    const regions = this._regionsFor ? this._regionsFor(clusterName, (this.CLUSTER_SIZES || {})[clusterName] || 0) : null;
    return (regions && regions.whole) ? 'whole' : null;
  },

  _tunnelStats() {
    if (!this._tunnel) {
      this._tunnel = {
        enabled: process.env.DREAM_TUNNEL !== '0',
        cadenceTicks: Number(process.env.DREAM_TUNNEL_CADENCE_TICKS) > 0 ? Number(process.env.DREAM_TUNNEL_CADENCE_TICKS) : 25,
        buckets: Number(process.env.DREAM_TUNNEL_BUCKETS) > 0 ? Number(process.env.DREAM_TUNNEL_BUCKETS) : 16,
        gain: Number.isFinite(Number(process.env.DREAM_TUNNEL_GAIN)) ? Number(process.env.DREAM_TUNNEL_GAIN) : 0.25,
        maxRttMs: Number(process.env.DREAM_TUNNEL_MAX_RTT_MS) > 0 ? Number(process.env.DREAM_TUNNEL_MAX_RTT_MS) : 19,
        cycles: 0, pairsChecked: 0, pairsFired: 0, skippedRtt: 0, skippedNoRegion: 0, readFails: 0, writeFails: 0,
        lastAgreementMax: null, lastFiredPairs: [], lastCycleMs: null, lastAt: 0, tick: 0,
      };
    }
    return this._tunnel;
  },

  /** One readback of a cluster's bucketed spike signature from its owner. */
  async _tunnelReadSignature(ws, clusterName, region, buckets) {
    const size = (this.CLUSTER_SIZES || {})[clusterName] || 0;
    const regions = this._regionsFor ? this._regionsFor(clusterName, size) : null;
    const r = regions && regions[region];
    if (!r) return null;
    const len = Math.max(1, (r.end - r.start) | 0);
    const reqId = this._nextSparseReqId();
    // Frame shape is the letter-bucket readback's; the donor reduces the region
    // slice into `buckets` counts. Reuse the existing ack path by request id.
    return new Promise((resolve) => {
      // ⛔ SAME PLUMBING AS gpuReadbackCortexLetterBuckets, OR THE ACK NEVER
      // ARRIVES. The ack handler (brain-server.js `readback_letter_buckets_ack`)
      // resolves `brain._gpuSparsePending.get(reqId)` as `{resolve, reject,
      // timeout, ws}` and the donor's payload field is `counts`. The first cut
      // used a private map and read `buckets` — it would have timed out on
      // every cycle, counted `readFails`, and the tunnel would have read as
      // installed while crossing nothing. Caught by reading the existing
      // sender before running anything. `_sparseSend` is not reused because it
      // targets `_gpuClient` (the cortex owner); this must address the owner
      // of `clusterName`.
      if (!this._gpuSparsePending) this._gpuSparsePending = new Map();
      const timeout = setTimeout(() => {
        if (this._gpuSparsePending.delete(reqId)) resolve(null);
      }, 2000);
      this._gpuSparsePending.set(reqId, {
        resolve: (ack) => resolve(ack && Array.isArray(ack.counts) ? ack.counts : null),
        reject: () => resolve(null),
        timeout, ws,                                     // TU.25.D — cancelled on that owner's disconnect
      });
      try {
        ws.send(JSON.stringify({
          type: 'readback_letter_buckets', reqId, clusterName, regionName: region,
          bucketCount: buckets, subSliceLen: len, startOffset: 0,
        }));
      } catch { clearTimeout(timeout); this._gpuSparsePending.delete(reqId); resolve(null); }
    });
  },

  /** Run one tunnel cycle across every owned cluster pair. Called from the tick. */
  async _tunnelPropagate() {
    const T = this._tunnelStats();
    if (!T.enabled) return;
    T.tick++;
    if (T.tick % T.cadenceTicks !== 0) return;
    const owner = this._clusterOwner instanceof Map ? this._clusterOwner : null;
    if (!owner || owner.size < 2) return;             // nothing to cross between
    const t0 = Date.now();
    T.cycles++;
    const sigs = new Map();
    for (const [name, ws] of owner) {
      if (!ws || ws.readyState !== 1) continue;
      const c = this.clients && this.clients.get ? this.clients.get(ws) : null;
      const rtt = c && Number.isFinite(c.rttMs) ? c.rttMs : null;
      if (rtt != null && rtt > T.maxRttMs) { T.skippedRtt++; continue; }
      const region = this._tunnelRegionFor(name);
      if (!region) { T.skippedNoRegion++; continue; }
      const buckets = await this._tunnelReadSignature(ws, name, region, T.buckets);
      if (!buckets || !buckets.length) { T.readFails++; continue; }
      let norm = 0; for (const v of buckets) norm += v * v;
      norm = Math.sqrt(norm);
      if (!(norm > 0)) continue;                      // a silent cluster has no pattern to offer
      sigs.set(name, { ws, region, unit: buckets.map((v) => v / norm) });
    }
    let maxG = 0; const fired = [];
    const psi = Number.isFinite(this.psi) ? this.psi : 0;
    for (const [a, A] of sigs) {
      for (const [b, B] of sigs) {
        if (a === b) continue;
        T.pairsChecked++;
        let g = 0; for (let i = 0; i < A.unit.length && i < B.unit.length; i++) g += A.unit[i] * B.unit[i];
        if (!(g > 0)) continue;                        // the gate: non-zero set agreement
        if (g > maxG) maxG = g;
        // Bucket i of A's pattern lands on bucket i of B's region: indices are
        // bucket centres in B's region-relative coordinates.
        const sizeB = (this.CLUSTER_SIZES || {})[b] || 0;
        const regionsB = this._regionsFor ? this._regionsFor(b, sizeB) : null;
        const rB = regionsB && regionsB[B.region]; if (!rB) continue;
        const lenB = Math.max(1, (rB.end - rB.start) | 0);
        const bucketLen = Math.max(1, Math.floor(lenB / A.unit.length));
        const idx = [], val = [];
        for (let i = 0; i < A.unit.length; i++) {
          if (!(A.unit[i] > 0)) continue;
          idx.push(Math.min(lenB - 1, i * bucketLen + (bucketLen >> 1)));
          val.push(T.gain * g * A.unit[i]);
        }
        if (!idx.length) continue;
        try {
          B.ws.send(JSON.stringify({ type: 'write_current_slice', clusterName: b, regionName: B.region, sparseIndices: idx, sparseValues: val, psi }));
          T.pairsFired++; fired.push(`${a}→${b}:${g.toFixed(2)}`);
        } catch { T.writeFails++; }
      }
    }
    T.lastAgreementMax = sigs.size ? maxG : null;
    T.lastFiredPairs = fired.slice(0, 12);
    T.lastCycleMs = Date.now() - t0;
    T.lastAt = Date.now();
    if (!this._tunnelLogAt || (Date.now() - this._tunnelLogAt) > 30000) {
      this._tunnelLogAt = Date.now();
      console.log(`[Tunnel] cycle ${T.cycles}: ${sigs.size} signatures · ${fired.length} pair(s) crossed on agreement${fired.length ? ' [' + fired.slice(0, 6).join(' ') + (fired.length > 6 ? ' …' : '') + ']' : ''} · max g=${maxG.toFixed(3)} · ${T.lastCycleMs}ms · skippedRtt=${T.skippedRtt} readFails=${T.readFails}`);
    }
  },

  _donorClusterFit(ws) {
    const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
    if (!c) return null;
    const _fullVram = Number(c.gpuVramMB || 0);
    // HELD VRAM (donated cap or full card) — duty-cycle is throughput, not VRAM held.
    const _effVram = (Number(c.donatedMB) > 0)
      ? (_fullVram > 0 ? Math.min(Number(c.donatedMB), _fullVram) : Number(c.donatedMB))
      : _fullVram;
    const _needMB = Number(this._runningFloorMB || 0);
    if (!(_effVram > 0) || !(_needMB > 0) || _effVram >= _needMB) return null;   // fits it all
    const _budgetBytes = Math.max(0, (_effVram * 0.75 - 2048)) * 1048576;
    const _set = (typeof this._getAutoScaleSettings === 'function') ? this._getAutoScaleSettings() : null;
    const _bpn = (_set && _set.donorBytesPerNeuron) || 42;
    const _prio = ['cortex', 'hippocampus', 'amygdala', 'basalGanglia', 'hypothalamus', 'mystery', 'cerebellum', 'brainstem'];   // ⛔ brainstem was missing from BOTH copies of this list (2026-10-19): a partial donor could never be given the monoamine nuclei
    const _cov = new Set();
    let _used = 0;
    for (const _cl of _prio) {
      const _n = (this.CLUSTER_SIZES && this.CLUSTER_SIZES[_cl]) || 0;
      if (!_n) continue;
      const _cost = _n * _bpn;
      if (_used + _cost <= _budgetBytes) { _cov.add(_cl); _used += _cost; }
    }
    return _cov;
  },

  _gpuInitDonorClusters(ws, coverage) {
    if (!ws || ws.readyState !== 1) return 0;
    // INITFIT — when the caller does not pin a coverage, ASK what the card can hold rather
    // than assuming everything. Passing null used to mean "all seven clusters", which is how
    // a 5.6GB card was handed ~4.9GB of buffers and choked.
    const _fit = (coverage === undefined || coverage === null)
      ? (typeof this._donorClusterFit === 'function' ? this._donorClusterFit(ws) : null)
      : coverage;
    coverage = _fit;
    const names = Object.keys(this.CLUSTER_SIZES || {});
    let sent = 0;
    for (const clusterName of names) {
      const size = this.CLUSTER_SIZES[clusterName];
      if (!size) continue;
      if (coverage && coverage.size && !coverage.has(clusterName)) continue;
      const regions = this._regionsFor ? this._regionsFor(clusterName, size) : undefined;
      try {
        ws.send(JSON.stringify({
          type: 'gpu_init',
          clusterName,
          size,
          tonicDrive: this.tonicDrives[clusterName],
          noiseAmp: this.noiseAmplitudes[clusterName],
          lifParams: { tau: 20, Vrest: -65, Vthresh: -50, Vreset: -70, dt: 1, R: 1, tRefrac: 2 },
          regions,
        }));
        sent++;
      } catch { /* donor dropped mid-init — the sync path re-sends */ }
    }
    if (coverage && coverage.size >= 0 && sent < names.length) {
      const _c2 = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      console.log(`[Brain] INITFIT — donor ${(_c2 && (_c2.gpuName || _c2.id)) || 'donor'} initialised ${sent}/${names.length} clusters [${[...coverage].join(', ')}] — VRAM-fitted, NOT the full set (sending all would allocate far more than the card holds).`);
    }
    return sent;
  },

  async _syncReplicaToDonor(ws) {
    if (!ws || ws.readyState !== 1) return;
    if (ws === this._gpuClient) return;   // primary is the master — nothing to replicate
    if (!this._gpuClient) return;         // no master established yet
    // ─── SYNCEMPTY.3 (2026-08-20) — THE REGISTRY GATE ───────────────────────
    //
    // The caller fires this on a FIXED 1.5s timer after a donor registers, and
    // the sweep's source of truth is `_replicaMatrixRegistry`, which the
    // canonical upload fills. Measured live: 38 seconds after boot the registry
    // was still EMPTY, so the sweep attempted 0 of 0 matrices and announced "a
    // FULL brain replica" — and the retry pass could not help, because there was
    // nothing to retry. Note what this fix does NOT claim: it does not assert
    // why the registry was late. It removes the RACE, which is wrong on its own
    // terms whatever the cause — a sweep whose input is empty should wait for
    // its input, not report success over it. The wait is bounded, it logs what
    // it waited for, and that log is also the instrument that will confirm or
    // refute the timing theory on the next boot.
    if (!(this._replicaMatrixRegistry && this._replicaMatrixRegistry.size > 0)) {
      const _gc = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      if (_gc && _gc._syncWaitingForRegistry) return;   // one waiter per donor, never a pile
      if (_gc) _gc._syncWaitingForRegistry = true;
      const _waitStart = Date.now();
      const _capMs = Number(process.env.DREAM_DF7_REGISTRY_WAIT_MS) > 0
        ? Number(process.env.DREAM_DF7_REGISTRY_WAIT_MS)
        : 15 * 60 * 1000;
      let _lastLog = 0;
      try {
        while (Date.now() - _waitStart < _capMs) {
          if (!ws || ws.readyState !== 1) return;                       // donor left
          if (this._replicaMatrixRegistry && this._replicaMatrixRegistry.size > 0) break;
          const _held = Date.now() - _waitStart;
          if (_held - _lastLog >= 30_000) {
            _lastLog = _held;
            console.log(`[Brain] DF.7 SYNCEMPTY — replica sync HELD ${(_held / 1000).toFixed(0)}s: the master matrix registry is still empty, so there is nothing to replicate yet. Waiting for the canonical upload to register matrices instead of sweeping 0 of 0 and calling it a full replica.`);
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      } finally {
        if (_gc) _gc._syncWaitingForRegistry = false;
      }
      if (!(this._replicaMatrixRegistry && this._replicaMatrixRegistry.size > 0)) {
        console.warn(`[Brain] ⛔ DF.7 SYNCEMPTY — GAVE UP after ${((Date.now() - _waitStart) / 60000).toFixed(1)}min: the master matrix registry never populated, so this donor CANNOT become a weight replica (it can still compute — ALLINIT gave it cluster buffers at registration). That is a master-upload failure, not a replica failure — look there. DREAM_DF7_REGISTRY_WAIT_MS tunes the wait.`);
        return;
      }
      if (!ws || ws.readyState !== 1) return;
      console.log(`[Brain] DF.7 SYNCEMPTY — registry populated after ${((Date.now() - _waitStart) / 1000).toFixed(1)}s of waiting (${this._replicaMatrixRegistry.size} matrices registered); replica sync proceeding with real work to do.`);
    }
    // DF.7 — DEFER the full replica sync while the curriculum is actively teaching
    // (ruled 2026-07-15: the CPU must not disrupt the GPUs while they are doing
    // work). Pushing the full ~366MB cortex_intraSynapses + 16 matrices to a
    // replica donor mid-teach jams the event loop in 3–5s bursts (the 366MB intra
    // upload times out at 180s + retries; every [EventLoop] BLOCKED line during
    // the K cells showed replicaSyncing=1), starving the teach loop → WORD-INT
    // wall-clock inflated to ~16s. The replica only shares OPT-IN read fan-out
    // (DREAM_DF7_FANOUT_PROPAGATE, off by default), so it does NOT need to be
    // current during teach — defer to an idle/dream window. The periodic
    // _rebroadcastMasterToReplicas retries when the curriculum is idle, and a
    // fresh donor's fire-and-forget Hebbian keeps its shadow approximately current
    // until then. DREAM_DF7_SYNC_DURING_TEACH=1 opts back into mid-teach syncing.
    // DF.7 PACEDSYNC — the hard defer above this line was correct for WHAT IT MEASURED
    // (7925e16: mid-teach syncing inflated WORD-INT to ~16s/word) but it waits for an
    // idle/dream window that a long cell may not reach for HOURS — observed live at
    // `passCount=0` with `phases 0/25` ten minutes into ela/kindergarten, leaving a
    // healthy second GPU pinned at 0 Gn/s with no path forward. Two things changed since
    // that measurement: (a) the jam it clocked was dominated by the 366MB intra upload
    // "timing out at 180s + retries" — TFLOOR (2026-08-16) floored that deadline at the
    // size-scaled physical requirement, so the retry storm is gone; (b) WSQ.3 already
    // paces replica-sync chunks against the DONOR's link. What was still missing is a
    // pace against the SERVER's own event loop, which is the thing teach competes for.
    // That term is added in the chunk loop below, so the sync now yields proportionally
    // to measured loop lag instead of blocking on a window that may never arrive.
    // DREAM_DF7_SYNC_DURING_TEACH: unset/'paced' = paced (default), '0' = the old hard
    // defer, '1' = unpaced full-speed (the original override, still honoured).
    const _syncDuringTeach = process.env.DREAM_DF7_SYNC_DURING_TEACH;
    if (this._curriculumInProgress && _syncDuringTeach === '0') {
      if (!this._replicaDeferLogMs || (Date.now() - this._replicaDeferLogMs) > 30000) {
        this._replicaDeferLogMs = Date.now();
        console.log('[Brain] DF.7 — replica sync DEFERRED: curriculum actively teaching (DREAM_DF7_SYNC_DURING_TEACH=0 — the pre-PACEDSYNC behaviour). A full-replica re-upload (~366MB intra + 16 matrices) would jam the teach loop; syncing on the next rebroadcast during an idle/dream window instead.');
      }
      return;
    }
    if (this._curriculumInProgress && _syncDuringTeach !== '1') {
      if (!this._pacedSyncLogMs || (Date.now() - this._pacedSyncLogMs) > 30000) {
        this._pacedSyncLogMs = Date.now();
        console.log('[Brain] DF.7 PACEDSYNC — replica sync proceeding DURING teach, paced against event-loop lag (chunks breathe >= the measured lag so the teach loop keeps its slice). Syncs run ONE AT A TIME (SYNCSERIAL — they share one uplink). Set DREAM_DF7_SYNC_DURING_TEACH=0 for the old defer-until-idle behaviour, =1 for unpaced.');
      }
    }
    // DF.7 F8 — capability-aware routing. Don't stream a full brain replica to a
    // donor whose WebGPU storage-binding cap can't hold the cortex cross-projection
    // matrices: it would just fail to bind (looksLikeBindingLimit) and sit at a
    // silent 0 Gn/s after we wasted a 100MB+ upload over its link. maxBindMB is
    // captured per donor at gpu_register. Floor is below the 2GB WebGPU spec minimum,
    // so only a genuinely-unraised-limit device (e.g. the 128 MiB default) is skipped;
    // any capable donor (≥ floor — all normal cards) syncs as before. Override with
    // DREAM_DF7_MIN_BIND_MB. `_bindIncapable` is surfaced on the dashboard (F9) as the
    // honest reason instead of a mysterious high-RTT / 0-Gn/s row.
    const _cc = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
    // cap from register (client.maxBindMB) or, before that arrives, from telemetry.
    const _bindCap = _cc ? Number(_cc.maxBindMB || (_cc.telemetry && _cc.telemetry.maxBindMB) || 0) : 0;
    const _minBind = Number(process.env.DREAM_DF7_MIN_BIND_MB) > 0 ? Number(process.env.DREAM_DF7_MIN_BIND_MB) : 1800;
    if (_cc && _bindCap > 0 && _bindCap < _minBind) {
      _cc._bindIncapable = true;
      _cc._df7Synced = false;
      if (_cc.heldMatrices instanceof Set) _cc.heldMatrices.clear();
      if (!_cc._bindSkipWarned) {
        _cc._bindSkipWarned = true;
        console.warn(`[Brain] DF.7 F8 — donor ${_cc.gpuName || _cc.id} maxBind ${_bindCap}MB < ${_minBind}MB floor — NOT replica-syncing (can't bind cortex matrices; would 0-compute after a wasted upload). Stays connected but excluded from the fan-out.`);
      }
      return;
    }
    if (_cc) _cc._bindIncapable = false;
    // VRAM-FIT + PARTIAL COVERAGE (small-donor policy). A donor that cannot
    // hold the FULL running replica is not streamed a doomed multi-GB upload —
    // instead it gets the largest priority-ordered CLUSTER SUBSET that fits its
    // effective VRAM (teach traffic is overwhelmingly cortex, so even a small
    // card covering cortex pulls real work). Donors that cannot fit even the
    // first cluster stay connected but hold nothing (_replicaIncapable). The
    // brain never shrinks either way (the size driver is baseline-floored).
    // Effective VRAM mirrors the community recompute: explicit donatedMB cap,
    // else full card x duty-cycle.
    let _coverage = null;
    if (_cc) {
      const _fullVram = Number(_cc.gpuVramMB || 0);
      // HELD VRAM (donated cap or full card) — duty-cycle is throughput, not
      // VRAM held, so it must not shrink the fit check.
      const _effVram = (Number(_cc.donatedMB) > 0)
        ? (_fullVram > 0 ? Math.min(Number(_cc.donatedMB), _fullVram) : Number(_cc.donatedMB))
        : _fullVram;
      const _needMB = Number(this._runningFloorMB || 0);
      if (_effVram > 0 && _needMB > 0 && _effVram < _needMB) {
        const _budgetBytes = Math.max(0, (_effVram * 0.75 - 2048)) * 1048576;
        const _set = (typeof this._getAutoScaleSettings === 'function') ? this._getAutoScaleSettings() : null;
        const _bpn = (_set && _set.donorBytesPerNeuron) || 42;
        const _prio = ['cortex', 'hippocampus', 'amygdala', 'basalGanglia', 'hypothalamus', 'mystery', 'cerebellum', 'brainstem'];   // ⛔ brainstem was missing from BOTH copies of this list (2026-10-19): a partial donor could never be given the monoamine nuclei
        const _cov = new Set();
        let _used = 0;
        for (const _cl of _prio) {
          const _n = (this.CLUSTER_SIZES && this.CLUSTER_SIZES[_cl]) || 0;
          if (!_n) continue;
          const _cost = _n * _bpn;
          if (_used + _cost <= _budgetBytes) { _cov.add(_cl); _used += _cost; }
        }
        if (_cov.size === 0) {
          _cc._replicaIncapable = true;
          _cc._partialReplica = false;
          _cc.clusterCoverage = null;
          _cc._df7Synced = false;
          if (_cc.heldMatrices instanceof Set) _cc.heldMatrices.clear();
          if (!_cc._replicaSkipWarned) {
            _cc._replicaSkipWarned = true;
            console.warn(`[Brain] DF.7 — donor ${_cc.gpuName || _cc.id} effective VRAM ${Math.round(_effVram)}MB cannot fit even the smallest priority cluster — NOT replica-syncing. Stays connected; never shrinks the brain.`);
          }
          return;
        }
        _cc._replicaIncapable = false;
        _cc._partialReplica = true;
        _cc.clusterCoverage = _cov;
        _coverage = _cov;
        if (!_cc._partialSyncLogged) {
          _cc._partialSyncLogged = true;
          console.log(`[Brain] DF.7 — donor ${_cc.gpuName || _cc.id} effective VRAM ${Math.round(_effVram)}MB < ${_needMB}MB full-replica need: PARTIAL coverage [${[..._cov].join(', ')}] (~${Math.round(_used / 1048576)}MB est). It pulls the work units it holds matrices for; never shrinks the brain.`);
        }
      } else {
        _cc._replicaIncapable = false;
        _cc._partialReplica = false;
        _cc.clusterCoverage = null;
      }
    }
    if (!this._replicaSyncInFlight) this._replicaSyncInFlight = new Set();
    if (this._replicaSyncInFlight.has(ws)) return;
    this._replicaSyncInFlight.add(ws);
    // DF.7 SYNCSERIAL — replica syncs now run ONE AT A TIME. `_rebroadcastMasterToReplicas`
    // fanned them out with `_gpuParallelMap` on the reasoning that a pool "re-merges in the
    // time of the slowest single replica, not the sum" — which is only true if each replica
    // has INDEPENDENT bandwidth. They do not: every byte leaves the same box uplink (~4MB/s
    // measured). Run concurrently, each 2.9GB intra stream gets 1/N of the pipe, the small
    // cross-projection matrices queue behind them in head-of-line blocking, and EVERY upload
    // burns its deadline WAITING rather than transferring — observed live as ten
    // `timed out after 180000ms` lines, retries that timed out again, and ZERO
    // `replica sync complete` in the whole window. Serial is strictly better here: each
    // donor gets the full pipe, finishes, and frees it. Sum-of-serial beats all-fail-and-retry.
    // Queue via a promise chain so register-path and rebroadcast-path syncs share one lane.
    const _prevSync = this._replicaSyncChain || Promise.resolve();
    let _releaseSync;
    this._replicaSyncChain = new Promise((r) => { _releaseSync = r; });
    try { await _prevSync; } catch { /* a failed predecessor must never block the queue */ }
    if (!ws || ws.readyState !== 1) { this._replicaSyncInFlight.delete(ws); _releaseSync(); return; }
    try {
      // 1) init the replica's cluster LIF buffers (mirror _gpuStep first-dispatch).
      const clusters = Object.keys(this.CLUSTER_SIZES || {});
      for (const clusterName of clusters) {
        const size = this.CLUSTER_SIZES[clusterName];
        if (!size || !ws || ws.readyState !== 1) continue;
        if (_coverage && !_coverage.has(clusterName)) continue;
        const regions = this._regionsFor ? this._regionsFor(clusterName, size) : undefined;
        try {
          ws.send(JSON.stringify({
            type: 'gpu_init',
            clusterName,
            size,
            tonicDrive: this.tonicDrives[clusterName],
            noiseAmp: this.noiseAmplitudes[clusterName],
            lifParams: { tau: 20, Vrest: -65, Vthresh: -50, Vreset: -70, dt: 1, R: 1, tRefrac: 2 },
            regions,
          }));
        } catch { /* replica dropped mid-sync — loop's readyState guard catches it */ }
      }
      // 2) replay every canonical matrix upload → full weight replica.
      // RECONNECT-RESUME (one-shot): matrices the donor reported still holding
      // at gpu_register skip the re-stream on THIS sync only — the claim is
      // same-tab (a reloaded page reports nothing), and any Hebbian drift in
      // the held copies is the normal DF.7 state the periodic rebroadcast
      // converges. The set is cleared below so later rebroadcasts run FULL.
      const _resumeHeld = (_cc && _cc.resumeHeldMatrices instanceof Set && _cc.resumeHeldMatrices.size)
        ? _cc.resumeHeldMatrices : null;
      let _resumedCount = 0;
      const reg = this._replicaMatrixRegistry;
      let synced = 0;
      // DF7SYNC.7 — the measurement the item asks for BEFORE any chunked/interleaved
      // rewrite is designed: how long a sync actually holds, and WHICH window it ran
      // in. The deadlock is narrowed, not gone — a donor joining mid-teach waits for a
      // dream window (the practical rule is still "attach every donor before pressing
      // the walk"), and nobody has ever measured how long that window has to be. These
      // three numbers (wall-clock, window, payload) are what turn "its own batch, do not
      // guess at it" into a design with evidence under it.
      const _syncT0 = Date.now();
      const _syncStartedDuringTeach = !!this._curriculumInProgress;
      let _syncedBytes = 0;
      // SYNCPARTIAL — per-matrix outcome tracking. Without these the sweep could not
      // tell the difference between "pushed 17" and "pushed 1 and lost 16 in silence".
      const _failed = [];
      let _attempted = 0;
      if (_cc && !(_cc.heldMatrices instanceof Set)) _cc.heldMatrices = new Set();
      if (reg && reg.size) {
        // INCREMENTAL — SMALLEST FIRST. Registry order put `cortex_intraSynapses` (2.8GB,
        // 96% of the payload) early, so a slow donor spent its entire window on one matrix
        // and became eligible for nothing. Ordering by nnz means the cheap cross-projections
        // land in seconds and the donor is productive almost immediately, with the intra
        // arriving last as a bonus rather than a prerequisite.
        const _ordered = [...reg.entries()].sort((x, y) => {
          const nx = (x[1] && x[1].matrix && x[1].matrix.values && x[1].matrix.values.length) || 0;
          const ny = (y[1] && y[1].matrix && y[1].matrix.values && y[1].matrix.values.length) || 0;
          return nx - ny;
        });
        for (const [name, entry] of _ordered) {
          if (!ws || ws.readyState !== 1) break;
          if (_resumeHeld && _resumeHeld.has(name)) {
            _resumedCount++;
            if (_cc) _cc.heldMatrices.add(name);   // it still holds it — count it as eligible
            continue;
          }
          if (_coverage) {
            let _covOk = false;
            for (const _cl of _coverage) { if (name.startsWith(_cl + '_')) { _covOk = true; break; } }
            if (!_covOk) continue;
          }
          _attempted++;
          try {
            const _res = await this.gpuSparseUpload(name, entry.matrix, entry.binding, ws);
            // gpuSparseUpload resolves null on timeout/abort — only a non-null result proves
            // the donor actually holds it. Recording it regardless is how a donor ends up
            // being handed work for a matrix it never received.
            if (_res !== null && _res !== undefined) {
              synced++;
              // DF7SYNC.7 — count what actually crossed the wire. The item's own
              // instruction was "instrument the dream-window sync duration first"
              // before any interleaving rewrite is attempted, and duration without
              // payload is unreadable: 8 minutes for 3GB and 8 minutes for 40MB
              // are different diagnoses. nnz x 8B (value + colIdx) + rowPtr, the
              // same arithmetic the VRAM estimator uses.
              try {
                const _m = entry.matrix;
                const _nnz = (_m && _m.values && _m.values.length) || 0;
                const _rows = (_m && _m.rows) || 0;
                // Value width read off the array, not assumed. It was a literal
                // 8 while the CPU master was Float64; the master is Float32 now
                // and a stale literal would over-report every synced matrix by
                // 33% — a telemetry lie, not a crash, which is the kind that
                // survives longest.
                const _vw = (_m && _m.values && _m.values.BYTES_PER_ELEMENT) || 4;
                _syncedBytes += _nnz * _vw + (_rows + 1) * 4;
              } catch { /* accounting must never break a sync */ }
              if (_cc) {
                _cc.heldMatrices.add(name);
                if (_cc.heldMatrices.size === 1) {
                  console.log(`[Brain] DF.7 INCREMENTAL — donor ${_cc.gpuName || _cc.id} holds its first matrix (${name}) and is now work-eligible for it; remaining matrices stream in behind it.`);
                }
              }
            }
            // SYNCPARTIAL — a null ack is a FAILURE, and it used to leave no trace at
            // all. Live cost: a donor finished a sweep holding 1 of 17 matrices while
            // the completion line announced "a FULL brain replica". Teach dispatch is
            // matrix-scoped (_nextPoolDonor filters on heldMatrices), so that donor was
            // silently locked out of every teach batch touching the 16 it lacked - it
            // logged 21 compute batches and 0 teach ops. Name every miss.
            else _failed.push({ name, why: "null ack (upload timeout/abort)" });
          } catch (e) { _failed.push({ name, why: (e && e.message) || String(e) }); }
        }
        // SYNCPARTIAL RETRY — ONE bounded second pass over the misses. The observed
        // failure pattern points at readiness, not size: the 16 CHEAP cross-projections
        // (4-200MB) all failed while the 2.9GB cortex_intraSynapses succeeded - and
        // under the smallest-first ordering above the cheap ones are exactly the ones
        // sent FIRST, seconds after registration while the donor is still running
        // gpu_init across 8 clusters. By the time the first pass ends the donor is
        // demonstrably ready (it just took a multi-GB upload), so a retry costs one
        // extra attempt and recovers the matrices that make it useful for teach.
        if (_failed.length && ws && ws.readyState === 1) {
          const _retry = _failed.splice(0, _failed.length);
          console.warn(`[Brain] DF.7 SYNCPARTIAL — ${_retry.length}/${_attempted} matrices did not land on the first pass; retrying ONCE. Misses: ${_retry.map(f => f.name).join(", ")}`);
          for (const _f of _retry) {
            if (!ws || ws.readyState !== 1) { _failed.push(_f); continue; }
            const _entry = reg.get(_f.name);
            if (!_entry) { _failed.push(_f); continue; }
            try {
              const _r2 = await this.gpuSparseUpload(_f.name, _entry.matrix, _entry.binding, ws);
              if (_r2 !== null && _r2 !== undefined) {
                synced++;
                if (_cc) _cc.heldMatrices.add(_f.name);
              } else {
                _failed.push({ name: _f.name, why: _f.why + " (retry also null)" });
              }
            } catch (e2) {
              _failed.push({ name: _f.name, why: (e2 && e2.message) || String(e2) });
            }
          }
        }
      }
      if (_cc && _cc.resumeHeldMatrices) _cc.resumeHeldMatrices = null;   // one-shot consumed
      if (_resumedCount > 0) console.log(`[Brain] DF.7 — reconnect-resume: skipped re-streaming ${_resumedCount} matrices the donor still holds in VRAM (drift converges on the periodic rebroadcast).`);
      // DF.7 SYNCGATE — the sync is now PROVEN for this donor: it holds the matrices
      // we just pushed, so `_donorCoversMatrices` will admit it to the work pool and
      // `_df7FanoutPropagate` will allow reads to land on it. Set only on the success
      // path, so a donor that never synced (deferred / incapable / threw) is never
      // handed work it cannot compute.
      if (_cc) {
        _cc._df7Synced = true; _cc._df7SyncedAt = Date.now(); _cc._df7SyncedMatrices = synced;
        console.log(`[Brain] DF.7 INCREMENTAL — donor ${_cc.gpuName || _cc.id} now holds ${_cc.heldMatrices.size}/${(reg && reg.size) || 0} matrices and is work-eligible for each of them.`);
      }
      // SYNCPARTIAL — HONEST COMPLETION. The old line printed "It now holds a FULL brain
      // replica" unconditionally whenever no cluster-coverage filter was active, so a
      // sweep that landed 1 of 17 announced a full replica. That single sentence is why
      // a donor sat at 0 teach ops for an entire session with nothing in the log to
      // contradict it. A partial sync is now a WARNING that names what is missing.
      // SYNCEMPTY — a sweep that attempted NOTHING is not a success. SYNCPARTIAL
      // closed the partial case but left this one open, and it printed the same lie
      // in a new form within minutes: "replica sync complete: 0/0 matrices pushed to
      // a donor. It now holds a FULL brain replica." Zero of zero.
      //
      // ROOT CAUSE, and it corrects the readiness theory: the registration path fires
      // _syncReplicaToDonor on a fixed 1.5s timer after the donor registers, but the
      // matrix REGISTRY is populated by the canonical upload on the SERVER side. At 38s
      // after boot the registry was still empty, so the sweep iterated nothing and
      // declared victory. The retry pass cannot help here — there is nothing to retry.
      // The donor is then left holding 0 matrices while the log says otherwise, and
      // teach dispatch (matrix-scoped) silently skips it: compute batches, 0 teach ops.
      if (_attempted === 0) {
        console.warn(`[Brain] DF.7 SYNCEMPTY — replica sync attempted ZERO matrices (registry has ${(reg && reg.size) || 0} entries). This donor holds NOTHING and is NOT teach-eligible; it will show compute batches with 0 teach ops until a later rebroadcast finds a populated registry. NOT a successful sync — the sweep raced the registry, which is filled by the canonical upload, not by the donor being ready.`);
      } else if (_failed.length) {
        console.warn(`[Brain] DF.7 SYNCPARTIAL — replica sync finished PARTIAL: ${synced}/${_attempted} matrices landed. STILL MISSING (${_failed.length}): ${_failed.map(f => f.name + " [" + f.why + "]").join("; ")}. Teach dispatch is matrix-scoped, so this donor is NOT eligible for teach batches touching those matrices — expect compute batches with ZERO teach ops until the next rebroadcast lands them.`);
      } else {
        console.log(`[Brain] DF.7 — replica sync complete: ${synced}/${_attempted} matrices pushed to a donor${_coverage ? ` (PARTIAL coverage [${[..._coverage].join(", ")}] — it shares compute for the clusters it holds)` : ". It now holds a FULL brain replica and shares compute (no longer idle standby)"}.`);
      }
      // DF7SYNC.7 — one line, three facts, on every outcome: how long the sweep held,
      // which window it ran in, and how much actually crossed the wire. A sync that
      // needs longer than a dream window lasts is the case the interleaving rewrite has
      // to solve; without this line that claim was unmeasured.
      {
        const _heldS = (Date.now() - _syncT0) / 1000;
        const _endedDuringTeach = !!this._curriculumInProgress;
        const _win = _syncStartedDuringTeach
          ? (_endedDuringTeach ? 'DURING TEACH (paced)' : 'started during teach, finished in an idle/dream window')
          : (_endedDuringTeach ? 'started idle, the walk resumed under it' : 'IDLE / dream window');
        const _mb = _syncedBytes / 1048576;
        console.log(`[Brain] DF7SYNC.7 — sync window measured: held ${_heldS.toFixed(1)}s · window=${_win} · ${synced} matrices ≈ ${_mb.toFixed(1)}MB pushed${_heldS > 0 ? ` (${(_mb / Math.max(0.001, _heldS)).toFixed(2)} MB/s effective)` : ''}. This is the number the interleaved-sync design needs — a sweep that outlasts a dream window is the case to fix.`);
      }
    } catch (e) {
      if (_cc) _cc._df7Synced = false;
      console.warn('[Brain] DF.7 — replica sync failed (donor stays standby until next rebroadcast):', e.message);
    } finally {
      this._replicaSyncInFlight.delete(ws);
      _releaseSync();   // SYNCSERIAL — hand the uplink to the next queued replica
    }
  },

  /**
   * DF.7 — periodic master re-broadcast (the delta-merge's re-sync half). The
   * CPU CSR is the authoritative master; GPU replicas are accelerator shadows
   * that drift as fire-and-forget Hebbian updates land unevenly. Re-pushing the
   * tracked master matrices to every replica re-converges them to the master —
   * "merge every N ticks → re-broadcast merged master → all donors" from the
   * chosen data-parallel architecture. No-op with only the primary (it IS the
   * master). Throttled by the caller's timer; in-flight guarded.
   */
  async _rebroadcastMasterToReplicas() {
    const replicas = this._livePoolDonors().filter(ws => ws !== this._gpuClient);
    if (replicas.length === 0) return;
    if (this._rebroadcastInFlight) return;
    // RESYNCDUTY — the caller's timer schedules this every 60s, but a full 17-matrix
    // sweep is 4.2GB and takes ~11.5 MINUTES at biological scale over the ~4MB/s donor
    // uplink. The interval was therefore ~11x shorter than the work it scheduled, so the
    // moment one sweep landed the next timer tick started another: a 100% duty cycle,
    // permanently. `_rebroadcastInFlight` above stops two sweeps OVERLAPPING, which is
    // exactly why this survived unnoticed — the guard suppressed the symptom (no error,
    // no drop, no warning) while leaving the pathology invisible. Measured cost while it
    // ran: the event loop blocked 3.2-8.1s in 300 of 500 consecutive console lines, GPU
    // round-trip 11.1s, 311GB egress, and the curriculum starved to ZERO teach calls.
    //
    // So the interval is now derived from how long a sweep ACTUALLY took rather than from
    // a constant that cannot know the brain's scale: the pool must sit idle for
    // `ratio x lastSweepDuration` before another is eligible. Ratio 3 => re-convergence
    // occupies at most ~25% of wall clock and teach keeps >=75%. At small scale a sweep is
    // seconds, so `ratio x seconds` stays under the caller's 60s cadence and behaviour is
    // unchanged — this only ever throttles when the sweep is genuinely expensive.
    const _dutyRatio = Number(process.env.DREAM_DF7_REBROADCAST_DUTY) > 0
      ? Number(process.env.DREAM_DF7_REBROADCAST_DUTY) : 3;
    const _lastDur = this._lastRebroadcastDurationMs || 0;
    const _lastEnd = this._lastReplicaRebroadcastMs || 0;
    if (_lastDur > 0 && _lastEnd > 0) {
      const _needIdleMs = _lastDur * _dutyRatio;
      const _idleMs = Date.now() - _lastEnd;
      if (_idleMs < _needIdleMs) {
        // NO SILENT CAPS — a skipped sweep says so, with the numbers that justify it.
        // A silent skip is how a 60s interval masqueraded as healthy for a whole session.
        if (!this._rebroadcastDutyLogMs || (Date.now() - this._rebroadcastDutyLogMs) > 300000) {
          this._rebroadcastDutyLogMs = Date.now();
          console.log(`[Brain] DF.7 RESYNCDUTY — re-broadcast DEFERRED: the last sweep took ${(_lastDur / 1000).toFixed(0)}s, so the pool stays idle ${(_needIdleMs / 1000).toFixed(0)}s (duty ratio ${_dutyRatio}x) before the next one. ${((_needIdleMs - _idleMs) / 1000).toFixed(0)}s remaining. Replicas stay approximately current via fire-and-forget Hebbian meanwhile; this is drift correction, not a correctness requirement.`);
        }
        return;
      }
    }
    // TU.20.2 (ISSUE-B) — do NOT launch a full 17-matrix replica sweep while the
    // primary's WS send buffer is still saturated. Piling a rebroadcast onto a
    // jammed socket compounds the backpressure that the drop storm is already
    // fighting. Skip this cycle; the timer fires again and fire-and-forget
    // Hebbian keeps replicas approximately current until the buffer drains.
    const _pri = this._gpuClient;
    const _REBROADCAST_BUF_GATE = 64 * 1024 * 1024;
    if (_pri && _pri.readyState === 1 && _pri.bufferedAmount > _REBROADCAST_BUF_GATE) {
      if (!this._rebroadcastDeferLogMs || (Date.now() - this._rebroadcastDeferLogMs) > 30000) {
        this._rebroadcastDeferLogMs = Date.now();
        console.warn(`[Brain] DF.7 / TU.20.2 — replica rebroadcast SKIPPED this cycle: primary ws.bufferedAmount=${(_pri.bufferedAmount / 1024 / 1024).toFixed(1)}MB > ${_REBROADCAST_BUF_GATE / 1024 / 1024}MB. Won't stack a full-replica sweep onto a saturated socket; retries next interval.`);
      }
      return;
    }
    this._rebroadcastInFlight = true;
    try {
      // Fan the per-replica re-sync across the pool in parallel via the
      // _gpuParallelMap primitive — replicas re-converge concurrently instead
      // of one-after-another, so a big pool re-merges in the time of the
      // slowest single replica, not the sum.
      // SYNCSERIAL — sequential on purpose (see _syncReplicaToDonor). _gpuParallelMap is
      // right for COMPUTE fan-out (independent GPUs, independent work) and wrong for weight
      // STREAMING (one shared uplink). The per-donor lane lock below makes this redundant but
      // explicit is better than relying on a lock two functions away.
      const _sweepStart = Date.now();
      for (const _ws of replicas) { await this._syncReplicaToDonor(_ws); }
      // RESYNCDUTY — record what this sweep COST so the next one can be scheduled against
      // reality. Without this the duty gate above has nothing to measure and the interval
      // is back to being a guess about the brain's scale.
      this._lastRebroadcastDurationMs = Date.now() - _sweepStart;
      this._lastReplicaRebroadcastMs = Date.now();
      // Says "sequentially" because SYNCSERIAL made this loop strictly sequential (one
      // shared uplink). The old wording claimed "in parallel" — describing work it was not
      // doing. Same class of lying instrument as a persistent gneurons_per_sec reading, and
      // that one hid a real bug for hours.
      console.log(`[Brain] DF.7 — master re-broadcast to ${replicas.length} replica(s) complete in ${(this._lastRebroadcastDurationMs / 1000).toFixed(0)}s (GPU shadows re-converged to the CPU master, sequentially over the shared uplink). Next sweep held off ~${((this._lastRebroadcastDurationMs * _dutyRatio) / 1000).toFixed(0)}s to keep the teach loop's slice.`);
    } finally {
      this._rebroadcastInFlight = false;
    }
  },

  _sparseSend(msg, timeoutMs = 30000, targetWs = null) {
    // DF.7 — dispatch to a specific donor when given, else the primary. Response
    // routing is by globally-unique monotonic reqId, so an ACK arriving on ANY
    // donor socket resolves the right pending entry regardless of which donor
    // we sent to — that's what makes pool fan-out safe with one shared pending map.
    const ws = (targetWs && targetWs.readyState === 1) ? targetWs : this._gpuClient;
    if (!ws || ws.readyState !== 1) return Promise.resolve(null);
    if (!this._gpuSparsePending) this._gpuSparsePending = new Map();
    const reqId = this._nextSparseReqId();
    msg.reqId = reqId;
    // I.17 — record dispatch for cross-platform GPU activity metric.
    this._recordGpuDispatch();
    ws.send(JSON.stringify(msg));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // ⛔ Resolve UNCONDITIONALLY — see the note on the propagate timer. A
        // `has()`-guarded resolve is a no-op exactly when the ack handler has
        // already popped the entry and cleared this timer mid-parse, which is
        // the one case where the promise has nothing else left to settle it.
        // The warn stays guarded so a normal already-answered request is quiet.
        const _wasPending = !!(this._gpuSparsePending && this._gpuSparsePending.delete(reqId));
        if (_wasPending) console.warn(`[Brain] sparse dispatch reqId=${reqId} type=${msg.type} timed out after ${timeoutMs}ms`);
        resolve(null);
      }, timeoutMs);
      this._gpuSparsePending.set(reqId, { resolve, reject, timeout, ws }); // TU.25.D — target-tagged for cancel-on-disconnect
    });
  },

  // ── Binary WebSocket frame encoders/decoders ──

  // Wire format header (all frames):
  //   0..3:  magic "SPRS" (request) or "SPRR" (response)
  //   4:     type byte  (1=upload, 2=propagate, 3=hebbian)
  //   5..8:  reqId (uint32 LE)
  //   9..10: nameLen (uint16 LE)
  //   11..:  name (UTF-8), then type-specific payload

  // Typed-array payloads are concatenated with Uint32 length prefixes:
  //   [len][data] for each of values/colIdx/rowPtr/preSpikes/postSpikes

  // Binary frames bypass V8's ~512 MB JSON string limit AND the
  // JSON.stringify + JSON.parse round-trip cost. 10-20× faster for
  // typed-array payloads; unlimited size within available memory.

  // Built to work without jerry-rigging — this
  // replaces the 10M-nnz JSON-safety skip with real binary transport.

  _encodeSparseHeader(typeByte, reqId, name) {
    const nameBuf = Buffer.from(name, 'utf8');
    // Pad header to a 4-byte boundary so subsequent Float32/Uint32
    // typed-array views created over the incoming ArrayBuffer have
    // aligned byteOffsets. Chrome throws RangeError on unaligned
    // TypedArray views — this was silently killing all previous
    // uploads for matrix names whose length wasn't 1 mod 4.
    const rawLen = 11 + nameBuf.length;
    const padLen = (4 - (rawLen % 4)) % 4;
    const hdr = Buffer.alloc(rawLen + padLen);
    hdr.write('SPRS', 0, 'ascii');
    hdr[4] = typeByte;
    hdr.writeUInt32LE(reqId, 5);
    hdr.writeUInt16LE(nameBuf.length, 9);
    nameBuf.copy(hdr, 11);
    // pad bytes already zero from Buffer.alloc
    return hdr;
  },

  // WS-level message fragmentation for oversized frames (2026-08-16, rode in
  // with the language-growth hop). The native donor's Rust WebSocket stack
  // (tungstenite defaults — donor-app sets no custom limits) KILLS the
  // connection on any single FRAME over ~16MiB, but reassembles a fragmented
  // MESSAGE up to its 64MiB message cap. At the 12M language cortex the
  // intra-synapses upload's FIRST chunk carries the whole rowPtr array —
  // (rows+1)×4 = 48MB — so the frame blew the ceiling and the donor dropped in
  // a connect→upload→EPIPE loop before the walk could start (live: "first
  // frame = 51.5MB" → "write EPIPE" every ~6s). The dense type-2 intra
  // propagate pre-array (12M×4B = 48MB) threatened the same kill on native
  // donors the moment emission ticked. Splitting at the WS layer is
  // PROTOCOL-TRANSPARENT: continuation frames reassemble into the identical
  // message bytes on every receiver (tungstenite AND browsers), so no donor
  // release and no version gate. All parts are sent in ONE synchronous loop —
  // Node's single thread + ws's in-order sender guarantee the fragment train
  // can't be interleaved by another send. cb fires exactly once, after all
  // parts flush (first error wins) — pacing/backpressure callers see the same
  // semantics as a single send.
  // ⚠ The native donor's RECEIVE ceiling is 512 MiB per message / 64 MiB per
  // frame (donor-app/src/donor.rs, `WebSocketConfig`, raised from tungstenite's
  // 64 MiB default — the "segmented rowPtr" redesign stopped being a
  // prerequisite then). This tripwire used to warn at 60 MB against the OLD
  // 64 MiB cap, so a perfectly legal 75.7 MB intra rowPtr message (18.3 M rows
  // × 4 B) printed "may refuse it" on every upload. It now warns against the
  // real ceiling: a message approaching 512 MiB would be refused.
  _wsSendFrag(ws, buf, cb) {
    const LIMIT = 15 * 1024 * 1024; // margin under the ~16MiB native frame ceiling
    if (!buf || buf.length <= LIMIT) { ws.send(buf, cb); return; }
    const _MSG_CAP = 512 * 1024 * 1024;
    if (buf.length > _MSG_CAP * 0.85 && (!this._fragCapWarnMs || (Date.now() - this._fragCapWarnMs) > 60000)) {
      this._fragCapWarnMs = Date.now();
      console.warn(`[Brain] fragmented WS message is ${(buf.length / 1048576).toFixed(1)}MB — approaching the native donor's 512 MiB MESSAGE ceiling (donor.rs WebSocketConfig). Past it the donor refuses the message.`);
    }
    const parts = Math.ceil(buf.length / LIMIT);
    let firstErr = null;
    let acked = 0;
    const onPart = (err) => {
      if (err && !firstErr) firstErr = err;
      acked++;
      if (acked === parts && cb) cb(firstErr || undefined);
    };
    for (let off = 0; off < buf.length; off += LIMIT) {
      const slice = buf.subarray(off, Math.min(off + LIMIT, buf.length));
      const fin = (off + LIMIT) >= buf.length;
      ws.send(slice, { fin, binary: true }, onPart);
    }
  },

  /**
   * COMP.1b (2026-08-23) — CURRENTS BUFFER REUSE, opt-in per request.
   *
   * The ack handler builds a fresh `Float32Array(postLen)` for every propagate
   * response — 48MB per round at the 12M intra matrix. SPARSEACK removed those
   * bytes from the WIRE; this removes them from the ALLOCATOR (the box runs
   * ~7GB of arrayBuffers already, and that churn is pure GC pressure).
   *
   * Why opt-in rather than automatic: a consumer that holds the returned array
   * ACROSS AN AWAIT would see it mutate under them when the next ack for the
   * same matrix lands. Only the per-tick cache-fill path is safe — it hands the
   * array straight to the keep-latest cache, where "the newest round wins" is
   * already the declared semantics (PROBELANE). Probes and one-shot readers
   * keep getting their own private array, which is why this is a caller
   * decision and not a global switch.
   */
  _currentsReuseBuf(key, len) {
    if (!this._currentsReuse) this._currentsReuse = new Map();
    let e = this._currentsReuse.get(key);
    if (!e || e.buf.length !== len) {
      e = { buf: new Float32Array(len), prevIdx: null, prevN: 0 };
      this._currentsReuse.set(key, e);
    }
    return e;
  },

  async _sparseSendBinary(msgBuffer, reqId, timeoutMs = 120_000, targetWs = null, reuseKey = null) {
    // DF.7 — dispatch to a chosen donor replica when given, else the primary.
    // The untargeted path (bound-Hebbian batch flush, standalone propagate to
    // primary) resolves `ws` to the primary = unchanged behavior. Response
    // routing is by globally-unique reqId, so an ACK on any donor socket
    // resolves the right pending entry regardless of which replica computed it.
    const ws = (targetWs && targetWs.readyState === 1) ? targetWs : this._gpuClient;
    if (!ws || ws.readyState !== 1) return Promise.resolve(null);
    if (!this._gpuSparsePending) this._gpuSparsePending = new Map();
    // I.17 — record dispatch for cross-platform GPU activity metric.
    // Binary frames are the HIGH-volume path during _teachHebbian +
    // _teachAssociationPairs; counting these is what makes the
    // dispatch-rate metric meaningful at biological scale.
    this._recordGpuDispatch();
    // TEACHMIRROR — PER-DONOR teach-lane counter. `_recordGpuDispatch` above is
    // a GLOBAL rate; it cannot say WHICH card is working, which is the only
    // question the Clients table is asked.
    //
    // The gap this closes: `gneuronsPerSec` and `stepsComputed` both come from
    // the donor and both advance ONLY on `compute_batch` completion
    // (donor.rs:675). The curriculum walk does not send compute_batch — it
    // sends Hebbian/propagate frames, i.e. THIS function. So a card teaching
    // flat out reports 0 Gn/s and 0 steps, MIRRORID.5 reads that as no
    // proof-of-work, and the row renders `idle (last 0Gn/s)` on a GPU that is
    // saturated. Every instrument was honest and the board still said "dead".
    //
    // The donor already counts this (`teach_ops`, donor.rs:118) — for its own
    // GUI, and it never ships it in the telemetry payload (donor.rs:877 sends
    // gneurons_per_sec + steps_computed only). Counting it here instead of
    // adding a telemetry field is deliberate: WE send these frames, so the
    // count is exact, it needs no donor rebuild, and it does not cost a
    // primary-kill + full 17-matrix re-upload to deploy (DONORKILL.2).
    if (this.clients) {
      const _tc = this.clients.get(ws);
      if (_tc && _tc.isGPU) { _tc.teachOps = (_tc.teachOps || 0) + 1; _tc.teachOpsAt = Date.now(); }
    }
    // Backpressure-aware send. A retest after the earlier fix got
    // past _teachLetterCaseBinding and into _teachPhonemeBlending
    // (1029 K words × 10 reps = 10,290 word-emission iterations).
    // At ~10 words/s × 14 cross-projections = 140 GPU Hebbian
    // dispatches/sec via T18.17 hebbianBound fire-and-forget. T18.8
    // batched queue consolidates up to 64/batch but still fires ~3
    // batches/sec of type=5 SPRS frames. compute.html's onmessage is
    // serial; if GPU dispatch queue drains slower than batches arrive,
    // Node's WebSocket send buffer backs up. Once ws.bufferedAmount
    // exceeds the OS-level socket send buffer (typically 256 KB - 2 MB
    // on Windows), ws.send() fails with ENOBUFS. Logs showed ~1200
    // consecutive ENOBUFS errors during _teachPhonemeBlending.

    // Fix: check bufferedAmount BEFORE calling send(). If backed up,
    // drop the send silently and resolve null (same as timeout path —
    // fire-and-forget caller just loses one Hebbian update on the GPU
    // side; CPU path is authoritative per T17.2 / T17.7 comment chain).
    // Threshold 50 MB = plenty of headroom for bursty Hebbian dispatch
    // without flooding the OS socket.
    // Raised threshold 50MB → 200MB so the brain doesn't drop
    // training dispatches under backpressure. At 50MB drops were
    // firing ~17/sec during
    // _teachWordEmission (7562 total drops over 411s). Each dropped
    // type=5 batched Hebbian frame = ~10-64 lost GPU-side Hebbian
    // updates. CPU-side learning still happened but GPU's cross-
    // projection weights drifted from CPU over 12 reps × 1029 words.
    // Gate probe then reads stale GPU state via readbackLetterBuckets
    // → potential spurious fail OR freeze (probe readback queues
    // behind pending Hebbian frames). Raising to 200MB gives Node's
    // WebSocket buffer more headroom during compute.html serial-
    // onmessage stalls — fewer drops, more complete GPU sync.
    // Node can easily hold 200MB WebSocket buffer without OS
    // memory concern on a 128GB box.
    // iter13 backpressure-await fix per operator 2026-05-04: "cant be
    // dropping shit". Previous code DROPPED sparse binary sends when
    // ws.bufferedAmount exceeded 200MB threshold. Drops mean GPU-side
    // Hebbian updates lost while CPU-side updates land — over thousands
    // of dispatches the GPU and CPU shadow weights drift apart, then
    // probe readbacks return stale values that don't match what
    // CPU-side learned. Operator caught 28 drops in a single ELA-K run.

    // New approach: AWAIT the buffer to drain instead of dropping.
    // Bounded await (max 5s) prevents indefinite hang if compute.html
    // is genuinely stalled; in that pathological case we still drop
    // ONCE per 5min with a loud log. Typical case: buffer drains within
    // 100-500ms during teach-phase bursts because compute.html serial-
    // onmessage processes the queued frames as fast as Node can fire
    // them. Net effect: drops reduce from ~28 per ELA-K cell to ~0.
    // Threshold bumped 200MB → 500MB. Bigger headroom = backpressure
    // logic engages later, fewer DROP fallbacks under sustained
    // teach-phase bursts. Safe at our memory footprint (Node easily
    // holds 500MB ws buffer; OS-level socket send buffer is the
    // bottleneck not Node's heap).
    const BUFFERED_AMOUNT_DROP_THRESHOLD = 500 * 1024 * 1024;
    // Safety timeout extended 5s → 30s. The block-not-drop pivot
    // means we wait for the GPU client to drain rather than corrupt
    // weights with silent drops; 30s is long enough that only a
    // genuinely hung compute.html triggers the fallback DROP, while
    // normal serial-onmessage stalls of 1-10s drain cleanly.
    const MAX_AWAIT_MS = 30000;
    const POLL_MS = 25;
    // 114.19er.2 — null-guard re-check. The entry guard at line 2841
    // ensures _gpuClient was non-null on entry, but async work between
    // here and the actual .send() can race with browser disconnect /
    // _spawnGpuClient teardown, leaving _gpuClient null. boot-error.log
    // captured "Cannot read properties of null (reading 'send')" at
    // brain-server.js:2943 from exactly this race. Re-check before
    // every dereference inside this method.
    if (!ws || ws.readyState !== 1) return Promise.resolve(null);
    if (ws.bufferedAmount > BUFFERED_AMOUNT_DROP_THRESHOLD) {
      const awaitStart = Date.now();
      while (ws && ws.readyState === 1
             && ws.bufferedAmount > BUFFERED_AMOUNT_DROP_THRESHOLD) {
        if ((Date.now() - awaitStart) > MAX_AWAIT_MS) {
          // Pathological case: 30s of sustained backpressure means
          // compute.html is genuinely stalled. With cortical
          // microstructure live (topographic projections + layer-
          // constrained endpoints + microcolumn coherence), a missed
          // Hebbian update on the GPU shadow is no longer recoverable
          // via fire-and-forget — forward propagation reads GPU
          // weights, so a drop here causes CPU/GPU divergence across
          // ALL post-update projections. Log a CRITICAL banner, mark
          // the GPU shadow dirty, and schedule a full-weight resync.
          // The current dispatch still drops (compute.html can't
          // accept it), but the shadow-dirty flag tells the next idle
          // dispatch to push a full resync before resuming
          // teach-phase Hebbian fires.
          if (!this._wsDroppedCount) this._wsDroppedCount = 0;
          this._wsDroppedCount++;
          this._wsLastDropTs = Date.now();
          // Mark the shadow dirty on the SAME flag the gpu_init re-confirm
          // handler clears (cortexCluster's) + arm the throttled auto-resync.
          // The old code set a brain-level flag here that no code path ever
          // cleared — the dashboard DIRTY banner latched ON permanently and
          // the manual /resync button appeared dead even after a successful
          // re-upload. TU.20.2 already-armed guard + 60s throttle live inside
          // the helper.
          this._armShadowResync('CRITICAL backpressure drop after 30s await');
          if (!this._wsLastDropLogMs || (Date.now() - this._wsLastDropLogMs) >= 5000) {
            this._wsLastDropLogMs = Date.now();
            console.error(`[Brain] CRITICAL backpressure DROP after ${MAX_AWAIT_MS}ms await — ws.bufferedAmount=${(ws.bufferedAmount/1024/1024).toFixed(1)}MB > ${BUFFERED_AMOUNT_DROP_THRESHOLD/1024/1024}MB. ${this._wsDroppedCount} total drops since boot. GPU shadow marked DIRTY; auto-resync armed (see banner above). CPU + GPU weights are diverging — cortical-microstructure projections will mis-fire until resync lands.`);
          }
          return Promise.resolve(null);
        }
        await new Promise(r => setTimeout(r, POLL_MS));
      }
      // Buffer drained — log notable awaits so operator sees backpressure
      // is happening but is being absorbed instead of lost.
      const waitedMs = Date.now() - awaitStart;
      if (waitedMs > 250) {
        if (!this._wsAbsorbedCount) this._wsAbsorbedCount = 0;
        this._wsAbsorbedCount++;
        if (!this._wsLastAbsorbLogMs || (Date.now() - this._wsLastAbsorbLogMs) >= 30000) {
          this._wsLastAbsorbLogMs = Date.now();
          console.log(`[Brain] backpressure ABSORBED — awaited ${waitedMs}ms for ws buffer to drain below ${BUFFERED_AMOUNT_DROP_THRESHOLD/1024/1024}MB. ${this._wsAbsorbedCount} total absorbs since boot (no Hebbian update lost; rate-limited log every 30s).`);
        }
      }
    }
    // No per-send log spam — at 100+ ops/sec the logs themselves are a
    // bottleneck. Only log errors and the final timeout warn.
    // 114.19er.2 — final null-guard before .send(). Async backpressure
    // await loop above can complete with _gpuClient set to null if the
    // browser disconnected mid-await (loop condition `while (this._gpuClient && ...)`
    // exits normally on null; no exception, just falls through here).
    if (!ws || ws.readyState !== 1) return Promise.resolve(null);
    this._wsSendFrag(ws, msgBuffer, (err) => {
      if (err) {
        // Throttle ENOBUFS spam. Earlier logs had ~1200 consecutive
        // identical ENOBUFS lines before the drop-threshold fix.
        // With the
        // threshold above, ENOBUFS should be rare (since we skip sends
        // before the OS refuses them). Any remaining ENOBUFS means a
        // transient kernel condition — log first 3 then silence.
        if (err.code === 'ENOBUFS') {
          if (!this._wsEnobufsCount) this._wsEnobufsCount = 0;
          this._wsEnobufsCount++;
          if (this._wsEnobufsCount <= 3) {
            console.warn(`[Brain] sparse binary reqId=${reqId} ENOBUFS (OS socket send buffer full — transient kernel backpressure). Count ${this._wsEnobufsCount}/3; further ENOBUFS logs silenced.`);
          }
          return;
        }
        // HBGRACE — a donor terminated mid-replica-sync leaves the burst of in-flight upload
        // sends writing to a now-destroyed socket ("Cannot call write after a stream was
        // destroyed" / "WebSocket is not open"). Benign post-disconnect race (the sync aborts
        // when its acks time out) — throttle so one dead donor can't spew hundreds of lines.
        const _benignClosed = err.message && (/stream was destroyed|not open|ERR_STREAM_DESTROYED/i.test(err.message));
        if (_benignClosed) {
          if (!this._wsClosedSendCount) this._wsClosedSendCount = 0;
          this._wsClosedSendCount++;
          const nowMs = Date.now();
          if (!this._wsClosedSendLogMs || (nowMs - this._wsClosedSendLogMs) >= 10000) {
            this._wsClosedSendLogMs = nowMs;
            console.warn(`[Brain] sparse send to a CLOSED donor socket (terminated mid-sync) — ${this._wsClosedSendCount} suppressed since boot; sync aborts on ack-timeout. Rate-limited 10s.`);
          }
          return;
        }
        console.warn(`[Brain] sparse binary reqId=${reqId} ERROR: ${err.message}`);
      }
    });
    return new Promise((resolve, reject) => {
      // ⛔⛔ THE RESOLVE IS UNCONDITIONAL, AND THE `has()` GUARD USED TO MAKE IT
      // CONDITIONAL. That guard turned this timer into a no-op whenever the
      // pending had already been popped by the ack handler — which pops and
      // clears the timer BEFORE parsing the frame. So a throw mid-parse left a
      // promise with no timer and no map entry: nothing could ever settle it,
      // and the caller awaited it for the life of the process.
      //
      // ⭐ Resolving a promise that is already settled is a NO-OP by spec, so
      // firing unconditionally is free and removes the hang by construction.
      // The delete stays guarded because deleting a key that is not there is
      // the only part that ever needed a check.
      const timeout = setTimeout(() => {
        if (this._gpuSparsePending) this._gpuSparsePending.delete(reqId);
        resolve(null);
      }, timeoutMs);
      // COMP.1b — `reuseKey` (when the caller opted in) tells the ack handler it
      // may scatter into that matrix's persistent buffer instead of allocating.
      this._gpuSparsePending.set(reqId, { resolve, reject, timeout, ws, reuseKey }); // TU.25.D — target-tagged for cancel-on-disconnect
    });
  },

  /**
   * T18.28 — drain-wait for gate probes. Polls ws.bufferedAmount until
   * it drops below 10 MB or 30-second timeout elapses. Curriculum gate
   * probes fire readback requests (readbackLetterBuckets etc.) that
   * MUST land promptly to produce correct probe output. If Hebbian
   * backlog is queued ahead of the readback, the readback can wait
   * indefinitely — the operator saw "freeze" at [K-DIAG] gate log line because
   * ~17000 frames were queued in compute.html. Waiting for drain before
   * firing probe reads ensures fresh readback results.
   */
  async gpuDrainWait() {
    const DRAIN_THRESHOLD = 10 * 1024 * 1024; // 10 MB
    const TIMEOUT_MS = 30_000;
    const POLL_MS = 100;
    const start = Date.now();
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return;
    const initial = this._gpuClient.bufferedAmount;
    if (initial <= DRAIN_THRESHOLD) return; // already drained
    while (Date.now() - start < TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, POLL_MS));
      if (!this._gpuClient || this._gpuClient.readyState !== 1) return;
      if (this._gpuClient.bufferedAmount <= DRAIN_THRESHOLD) {
        const elapsed = Date.now() - start;
        console.log(`[Brain] drain-wait completed in ${elapsed}ms: bufferedAmount ${(initial/1024/1024).toFixed(1)}MB → ${(this._gpuClient.bufferedAmount/1024/1024).toFixed(1)}MB`);
        return;
      }
    }
    console.warn(`[Brain] drain-wait timed out at 30s: bufferedAmount stuck at ${(this._gpuClient.bufferedAmount/1024/1024).toFixed(1)}MB — compute.html processing slower than expected. Gate probe readbacks may still queue behind Hebbian frames.`);
  },

  // Backpressure gate for fire-and-forget GPU shadows. Curriculum fires
  // thousands of propagate/hebbian shadows per second; without a gate,
  // bufferedAmount grew to 1.7 GB and every shadow timed out at 30 s,
  // effectively killing the brain. CPU remains authoritative — skipping
  // a shadow just means that one Hebbian update doesn't mirror to GPU.

  // Two-level gate:
  //   (1) pending-request cap — compute.html's onmessage is serial, so
  //       pending.size ≈ how many messages are queued ahead of the next
  //       main-brain compute_batch. Cap at 4 so main-brain dispatch
  //       doesn't block behind hundreds of shadow hebbians.
  //   (2) TCP send-buffer cap — belt-and-suspenders for abnormal queue
  //       growth (slow network, giant frames).
  _gpuSparseFlowOk(targetWs = null, priority = false) {
    // DF.7 — check the chosen donor's flow when targeting a replica, else the
    // primary's. Keeps the per-donor backpressure gate honest during fan-out.
    const c = (targetWs && targetWs.readyState === 1) ? targetWs : this._gpuClient;
    if (!c || c.readyState !== 1) return false;
    const pending = this._gpuSparsePending ? this._gpuSparsePending.size : 0;
    // ⛔ A WORD/GATE READOUT IS NOT CAPPED BY PENDING SHADOW PROPAGATES. Every
    // compose tick has up to 16 propagates in flight, so the cap of 4 refused
    // every readout instantly — measured `gateProbe … ok=0 miss=18` — and she
    // picked her words off the CPU shadow. The buffer check below still holds.
    if (!priority && pending >= 4) return false;
    return c.bufferedAmount < 2_000_000;
  },

  /**
   * Upload a sparse CSR matrix to GPU via CHUNKED binary WebSocket
   * frames. Chrome's WebSocket frame assembler chokes on single frames
   * approaching 500MB — observed 480MB frames flush OS-side but never
   * deliver to ws.onmessage within 180s on localhost loopback. Splitting
   * into 16MB chunks keeps each frame comfortably inside browser frame
   * assembler limits and lets the GPU writeBuffer stream directly into
   * pre-allocated storage buffers at offsets.
   *
   * Wire: type=4 chunk frames carry chunkSeq + totalChunks + flags.
   * First chunk (flags & 1) also carries rows/cols/nnz + rowPtr. Each
   * chunk carries valuesOffset/valuesByteLen/values + colIdxOffset/
   * colIdxByteLen/colIdx. Last chunk triggers the SPRR ack.
   *
   * T18.6.b — optional `binding` parameter. When provided, the first
   * chunk ALSO carries cluster-bound metadata via flag bit 2
   * (`flags & 2`): srcClusterNameLen(u16) + srcClusterName + u16 pad
   * + dstClusterNameLen(u16) + dstClusterName + u16 pad + srcStart(u32)
   * + srcEnd(u32) + dstStart(u32) + dstEnd(u32). compute.html passes
   * this to `gpu._beginSparseUpload(..., binding)` which skips the
   * standalone preSpikes/postCurrents/postSpikes buffer allocation
   * entirely (the bound shader path reads directly from the source
   * cluster's spike buffer and writes into the destination cluster's
   * currents buffer). Saves ~60 MB per cross-projection at biological
   * scale × 14 cross-projections = ~840 MB of transient VRAM that
   * previously sat allocated through the entire upload-then-rebind
   * window, during which the device was most likely to OOM-crash on a
   * 16 GB GPU. Phase C.1 rebind still exists as a fallback path for
   * matrices loaded from persistence where binding metadata wasn't
   * shipped originally.
   */
  /**
   * HER EYES COME HOME (2026-10-18) — count uploads in flight, so the image
   * engine can YIELD. A matrix upload is the one window where the donor sits at
   * its VRAM peak; a render on top of it can exceed the card (measured:
   * donor 13 GB + voice 2.4 GB + render 2.5 GB > 16.4 GB). Counted here, at
   * the single method every upload goes through, rather than at the call sites
   * — a third caller would otherwise be invisible to the gate. try/finally so
   * a failed or timed-out upload cannot leave the count stuck high and close
   * the look lane forever (the leaked-slot lesson from LOOKQUEUE.1).
   */
  async gpuSparseUpload(name, matrix, binding, targetWs = null, noRegister = false) {
    this._gpuUploadsInFlight = (this._gpuUploadsInFlight | 0) + 1;
    try {
      // MULTI-CARD — the canonical upload of the intra matrix becomes one row
      // slice per card when more than one card can hold a slice.
      if (!targetWs && !noRegister && name === this._SLICE_NAME && matrix && matrix.rowPtr) {
        // Never plan slices mid cortex-move: the move points `_gpuClient` back at
        // the OLD card while it pulls, so a plan made then names the wrong owner
        // and the new owner's rows are uploaded twice (seen: 660 + 640 chunks over
        // the home upload in one boot). Wait for the move to finish (bounded).
        const _mw = Date.now();
        while (this._cortexMoveInFlight && Date.now() - _mw < 15 * 60 * 1000) await new Promise((r) => setTimeout(r, 1000));
        const plan = this._planIntraSlices(matrix.rows, ((matrix.values.byteLength || 0) + (matrix.colIdx.byteLength || 0) + (matrix.rowPtr.byteLength || 0)) / 1e6);
        if (plan) { this._intraWhole = false; return await this._uploadIntraSliced(name, matrix, binding, plan); }
        // One card holds it all: no slice plan lingers, so lessons go to (and
        // wait on) that card only, and the re-slice check leaves it alone.
        this._intraSlices = null;
        this._intraWhole = true;
      }
      return await this._gpuSparseUploadInner(name, matrix, binding, targetWs, noRegister);
    } finally {
      this._gpuUploadsInFlight = Math.max(0, (this._gpuUploadsInFlight | 0) - 1);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTI-CARD TRAINING — THE INTRA MATRIX IN ROW SLICES (docs/POOL-SHARDING.md)
  //
  // The intra matrix binds the `langCortex` pseudo-cluster, which the tick
  // never steps — only teaching writes it and only teaching/probes read it. So
  // no card needs the whole matrix: each holder keeps contiguous rows [a, b),
  // uploaded as an ordinary bound matrix whose destination window is narrowed to
  // those rows. Then:
  //   • every teach frame sent to the cortex owner is COPIED to every other
  //     holder (`_installSliceFanout`) — each applies it to its own rows; a card
  //     without the matrix or cluster a frame names ignores it;
  //   • row numbers inside frames (masked rows, explicit Hebbian post, ranges)
  //     are shifted into the slice on the card (`slice_base`, donor 0.3.48);
  //   • a propagate on the intra matrix asks every holder and STITCHES their
  //     currents by row base (`_gatherIntraPropagate`);
  //   • the checkpoint pull reads each slice into its rows of the CPU master.
  // Holders: the cortex owner plus every pool card speaking 0.3.48+, rows split
  // in proportion to each card's room. `DREAM_SLICE=0` keeps one card.
  // ═══════════════════════════════════════════════════════════════════════════
  _SLICE_NAME: 'cortex_intraSynapses',

  _sliceCapable(ws) {
    const c = ws && this.clients && this.clients.get ? this.clients.get(ws) : null;
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String((c && c.donorAppVersion) || ''));
    return !!m && ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3048;
  },

  _intraSliceActive() {
    const s = this._intraSlices;
    return Array.isArray(s) && s.length > 1;
  },

  _intraSliceHolders() {
    return this._intraSliceActive() ? this._intraSlices.map((s) => s.ws).filter((w) => w && w.readyState === 1) : [];
  },

  /** Row ranges per holder, or null when one card should hold it all. */
  _planIntraSlices(rows, matrixMB) {
    if (process.env.DREAM_SLICE === '0') return null;
    const owner = this._gpuClient;
    if (!owner || owner.readyState !== 1 || !(rows > 0)) return null;
    const others = (typeof this._livePoolDonors === 'function' ? this._livePoolDonors() : [])
      .filter((ws) => ws && ws !== owner && ws.readyState === 1 && this._sliceCapable(ws) && this._sliceSettled(ws, Date.now(), true));
    if (!others.length) return null;
    // Room each card can give its slice. The owner also carries the 16
    // cross-projections and the other clusters it owns, so its room is what is
    // left after those; teachers carry only their own clusters.
    const crossMB = (() => { let s = 0; const r = this._cortexMatrixMB || {}; for (const k of Object.keys(r)) if (k !== this._SLICE_NAME) s += Number(r[k]) || 0; return s; })();
    const ownedMB = (ws) => { let s = 0; if (this._clusterOwner instanceof Map) for (const [n, o] of this._clusterOwner) if (o === ws && n !== 'cortex') s += this._clusterCostMB(n); return s; };
    const room = (ws) => Math.max(0, this._donorCapacityMB(ws) - ownedMB(ws) - (ws === owner ? crossMB : 0));
    const holders = [owner, ...others].map((ws) => ({ ws, room: room(ws) })).filter((h) => h.room > 512);
    if (holders.length < 2) return null;
    // ⛔ ONE CARD PER JOB WHEN ONE CARD HOLDS IT. Every lesson's pattern clears
    // and writes run on EVERY slice holder, whatever rows it holds — so a second
    // holder doubles that work, and the small card (also stepping her other
    // clusters every tick) paces every lesson. When the cortex owner has room for
    // the whole matrix, it holds all of it and every lesson runs once, on it; the
    // other cards step their clusters. DREAM_SLICE_WHEN_FITS=1 slices anyway.
    if (process.env.DREAM_SLICE_WHEN_FITS !== '1') {
      const fullMB = Number(matrixMB) || Number(this._cortexMatrixMB && this._cortexMatrixMB[this._SLICE_NAME]) || 0;
      if (fullMB > 0 && room(owner) >= fullMB * 1.1) return null;
    }
    // ⭐ TWO COPIES OF EVERY ROW (DREAM_SLICE_REPLICAS, default 2). Cards are
    // paired by room and each pair holds the SAME row range, so a card leaving
    // costs no learning and no pause — its twin still holds and trains every one
    // of its rows. An odd card joins the last pair. A card still holds one range
    // of one matrix name, which is what the donor's slice bookkeeping allows.
    // ⚠ The price: each card trains twice the rows it would alone, so two cards
    // are a full mirror rather than a 2× split. DREAM_SLICE_REPLICAS=1 restores
    // the single-copy split (fastest, but a drop re-slices).
    // ⛔ With fewer than FOUR cards two copies is a mirror, not a split: two
    // cards then hold and train the SAME full matrix, gaining no speed and no
    // size while every lesson waits on the slower one (measured: the rented
    // card at 26%, the home card at 12–24%). Unset, copies are kept only when
    // the pool can pair cards AND still split the rows (≥ 4 cards); below that
    // every card takes its own rows, sized by speed, and a drop is covered by
    // the rejoin grace and the snapshot pull instead of a twin.
    const _rp = Number(process.env.DREAM_SLICE_REPLICAS);
    const replicas = Number.isFinite(_rp) && _rp >= 1 ? Math.floor(_rp) : (holders.length >= 4 ? 2 : 1);
    const sorted = holders.slice().sort((x, y) => y.room - x.room);
    const groups = [];
    if (replicas >= 2) {
      for (let i = 0; i + 1 < sorted.length; i += 2) groups.push([sorted[i], sorted[i + 1]]);
      if (sorted.length % 2 === 1) groups[groups.length - 1].push(sorted[sorted.length - 1]);
    } else {
      for (const h of holders) groups.push([h]);
    }
    // ⭐ SIZED BY MEASURED SPEED (stage 3). Every lesson waits on the slowest
    // holder, so rows should follow how fast each card trains them, not only how
    // much room it has. A card's speed is the rows it held over its own measured
    // time per lesson (`lesson_cost`, sampled on the card). When EVERY group has a
    // measurement, ranges are sized by speed and capped by room; until then (a
    // first plan, a new card) by room. A group's speed is its slowest member's.
    const _cost = this._lessonCost || {};
    const _rowsHeld = (ws) => { const s = (this._intraSlices || []).find((e) => e.ws === ws); return s ? s.b - s.a : 0; };
    const _rate = (ws) => {
      const c = this.clients && this.clients.get ? this.clients.get(ws) : null;
      const m = c && _cost[String(c.gpuName || c.id)];
      const held = _rowsHeld(ws);
      return (m && m.msPerLesson > 0 && held > 0 && Date.now() - m.at < 3600000) ? held / m.msPerLesson : 0;
    };
    const groupRoom = groups.map((g) => Math.min(...g.map((h) => h.room)));
    const groupRate = groups.map((g) => Math.min(...g.map((h) => _rate(h.ws))));
    const bySpeed = process.env.DREAM_SLICE_BY_SPEED !== '0' && groupRate.every((r) => r > 0);
    const weight = bySpeed ? groupRate : groupRoom;
    const total = weight.reduce((s, r) => s + r, 0);
    const plan = [];
    let a = 0;
    groups.forEach((g, i) => {
      let b = i === groups.length - 1 ? rows : Math.min(rows, a + Math.floor(rows * weight[i] / total));
      // Speed never overrides room: a range a group cannot hold is cut to what it can.
      const _intraMB = Number((this._cortexMatrixMB || {})[this._SLICE_NAME]) || 0;
      if (bySpeed && _intraMB > 0 && i < groups.length - 1) {
        const maxRows = Math.floor(rows * Math.min(1, groupRoom[i] / _intraMB));
        if (b - a > maxRows) b = a + maxRows;
      }
      if (b > a) for (const h of g) plan.push({ ws: h.ws, a, b });
      a = b;
    });
    return plan.length > 1 ? plan : null;
  },

  /** One LIVE holder per distinct row range, or null when a range has none. */
  _sliceReaders() {
    if (!this._intraSliceActive()) return null;
    const byRange = new Map();
    for (const s of this._intraSlices) {
      const k = `${s.a}:${s.b}`;
      if (!byRange.has(k) && s.ws && s.ws.readyState === 1) byRange.set(k, s);
      else if (!byRange.has(k)) byRange.set(k, null);
      else if (byRange.get(k) === null && s.ws && s.ws.readyState === 1) byRange.set(k, s);
    }
    const out = [...byRange.values()];
    return out.some((s) => !s) ? null : out.sort((x, y) => x.a - y.a);
  },

  _csrRowSlice(m, a, b) {
    const rp = m.rowPtr, base = rp[a], end = rp[b];
    const rowPtr = new Uint32Array(b - a + 1);
    for (let i = 0; i <= b - a; i++) rowPtr[i] = rp[a + i] - base;
    return { rows: b - a, cols: m.cols, values: m.values.subarray(base, end), colIdx: m.colIdx.subarray(base, end), rowPtr };
  },

  /** Upload the intra matrix as one slice per holder. */
  async _uploadIntraSliced(name, matrix, binding, plan) {
    // TEACHCREDIT — the WHOLE matrix's stored-synapse count (slices skip it).
    try {
      const _nnz = (matrix && matrix.values && matrix.values.length) || 0;
      if (_nnz > 0) { if (!this._matrixNnzByName) this._matrixNnzByName = {}; this._matrixNnzByName[name] = _nnz; }
    } catch { /* accounting only */ }
    if (!this._replicaMatrixRegistry) this._replicaMatrixRegistry = new Map();
    this._replicaMatrixRegistry.set(name, { matrix, binding });
    if (!this._cortexMatrixMB) this._cortexMatrixMB = {};
    this._cortexMatrixMB[name] = +(((matrix.values.byteLength || 0) + (matrix.colIdx.byteLength || 0) + (matrix.rowPtr.byteLength || 0)) / 1e6).toFixed(1);
    this._intraSlices = plan.map((p) => ({ ws: p.ws, a: p.a, b: p.b, key: this._sliceKey(p.ws) }));
    const nm = (ws) => { const c = this.clients && this.clients.get ? this.clients.get(ws) : null; return (c && (c.gpuName || c.id)) || 'donor'; };
    console.log(`[Pool] SLICES — ${name} split across ${plan.length} cards: ${plan.map((p) => `${nm(p.ws)} rows ${p.a.toLocaleString()}–${p.b.toLocaleString()}`).join(' · ')}`);
    // DONOR PULL — a published snapshot with the SAME structure lets a remote
    // card build its slice from the release instead of over the home upload.
    let snapOk = false;
    // PUBLISH FIRST — with no snapshot of THESE weights (a fresh walk), every
    // remote holder is otherwise pushed its rows over the home upload, one copy
    // per card. When two or more holders are remote, publishing once and letting
    // each pull from GitHub costs the home link one copy in total. With one
    // remote card it saves nothing, so it is skipped. DREAM_PUBLISH_FIRST=0 off.
    try {
      // ⚠ At boot no round trip has been measured yet, and an unknown RTT used
      // to count as remote — so this machine's own card was counted, the walk
      // waited on a GitHub publish, and the local card pulled from GitHub
      // instead of loading at local speed. Unmeasured → the card is local when
      // it is this machine's GPU (the identity the remote-readback check uses).
      const _host = this._perfStats && this._perfStats.gpuName;
      const _isRemote = (ws) => {
        const c = this.clients && this.clients.get ? this.clients.get(ws) : null;
        if (!c) return true;
        const rtt = Number(c.rttMs);
        if (rtt >= 0 && Number.isFinite(rtt)) return rtt >= 20;
        return !(_host && c.gpuName && String(c.gpuName) === String(_host));
      };
      const _remotes = plan.filter((p) => _isRemote(p.ws) && this._sliceCapable(p.ws)).length;
      const _have = this._weightsSnapshot && this._weightsSnapshot.rows === matrix.rows && this._weightsSnapshot.nnz === matrix.values.length
        && (await require('./weights-publish.js').structureHash(matrix)) === this._weightsSnapshot.structure;
      if (!_have && _remotes >= 2 && process.env.DREAM_PUBLISH_FIRST !== '0' && process.env.DREAM_WEIGHTS_PUBLISH !== '0' && !this._weightsPublishInFlight) {
        this._weightsPublishInFlight = true;
        const t0 = Date.now();
        console.log(`[Pool] PUBLISH FIRST — ${_remotes} remote cards need slices of a matrix with no snapshot; publishing it once so each pulls from GitHub instead of one home upload per card.`);
        try {
          let lineage = null;
          try { const st = this._rngMod && typeof this._rngMod.brainRngState === 'function' ? this._rngMod.brainRngState() : null; if (st) lineage = String(st.seed >>> 0); } catch { /* unlabelled */ }
          const man = await require('./weights-publish.js').publishSnapshot(matrix, { name, lineage, saveVersion: this._saveVersion || 0 });
          if (man) { this._weightsSnapshot = man; this._weightsSnapshotAt = Date.now(); console.log(`[Pool] PUBLISH FIRST — published ${man.tag} in ${((Date.now() - t0) / 60000).toFixed(1)} min.`); }
        } finally { this._weightsPublishInFlight = false; }
      }
    } catch (e) { console.warn(`[Pool] PUBLISH FIRST failed (${e && e.message}) — slices go over the home upload.`); }
    const snap = this._weightsSnapshot;
    if (snap && snap.rows === matrix.rows && snap.nnz === matrix.values.length && process.env.DREAM_DONOR_PULL !== '0') {
      try { snapOk = (await require('./weights-publish.js').structureHash(matrix)) === snap.structure; } catch { snapOk = false; }
    }
    const results = await Promise.all(plan.map(async (p) => {
      if (p.ws !== this._gpuClient) this._gpuInitLangPseudoCluster(p.ws);
      const sb = binding && binding.dstRegion
        ? { ...binding, dstRegion: { start: binding.dstRegion.start + p.a, end: binding.dstRegion.start + p.b } }
        : binding;
      let r = null;
      // The owner pulls too when it is REMOTE: a rented owner took its 16 M-row
      // slice over the home upload at ~12 MB/s (minutes, twice in one boot) while
      // the snapshot sat on GitHub. Only a card on this machine (round trip
      // under 20 ms) is faster fed directly.
      const _pc = this.clients && this.clients.get ? this.clients.get(p.ws) : null;
      const _remote = !(_pc && Number(_pc.rttMs) >= 0 && Number(_pc.rttMs) < 20);
      if (snapOk && (p.ws !== this._gpuClient || _remote) && this._sliceCapable(p.ws)) {
        r = await this._sliceFromSnapshot(p, name, matrix, sb, snap);
      }
      if (!r) r = await this._gpuSparseUploadInner(name, this._csrRowSlice(matrix, p.a, p.b), sb, p.ws, true);
      // rowCount bounds the slice on the card too — the owner's slice starts at
      // row 0, so a base alone would not filter rows past its end.
      try { p.ws.send(JSON.stringify({ type: 'slice_base', name, rowBase: p.a, rowCount: p.b - p.a })); } catch { /* a dropped holder re-plans */ }
      return r;
    }));
    const ok = results.every((r) => r);
    if (!ok) console.warn(`[Pool] SLICES — ${results.filter((r) => !r).length} of ${plan.length} slice upload(s) failed; the walk re-plans on the next cortex upload.`);
    return ok ? results[0] : null;
  },

  _awaitDonorReply(kind, id, timeoutMs) {
    if (!this._donorReplyWait) this._donorReplyWait = new Map();
    const key = `${kind}:${id}`;
    return new Promise((resolve) => {
      const t = setTimeout(() => { this._donorReplyWait.delete(key); resolve(null); }, timeoutMs);
      this._donorReplyWait.set(key, (msg) => { clearTimeout(t); resolve(msg); });
    });
  },
  _donorReply(kind, msg) {
    const key = `${kind}:${msg && msg.id}`;
    const f = this._donorReplyWait && this._donorReplyWait.get(key);
    if (f) { this._donorReplyWait.delete(key); f(msg); }
  },

  /**
   * DONOR PULL — the card builds rows [a, b) from the published blocks, then
   * only the rows that changed since the snapshot cross the home upload.
   * Returns a truthy result, or null when the card could not (the caller then
   * uploads the slice the ordinary way — same weights either way).
   */
  async _sliceFromSnapshot(p, name, matrix, sb, snap) {
    const nm = (() => { const c = this.clients && this.clients.get ? this.clients.get(p.ws) : null; return (c && (c.gpuName || c.id)) || 'donor'; })();
    const id = (this._snapReqSeq = (this._snapReqSeq | 0) + 1);
    const blocks = snap.blocks.filter((b) => b.rowEnd > p.a && b.rowStart < p.b)
      .map((b) => ({ url: b.url, sha256: b.sha256, rowStart: b.rowStart, rowEnd: b.rowEnd }));
    const t0 = Date.now();
    const wait = this._awaitDonorReply('slice_loaded', id, 60 * 60 * 1000);
    try {
      p.ws.send(JSON.stringify({
        type: 'slice_from_snapshot', id, name, rowBase: p.a, rowCount: p.b - p.a, blocks,
        binding: { srcCluster: sb.srcCluster, srcStart: sb.srcRegion.start, srcEnd: sb.srcRegion.end, dstCluster: sb.dstCluster, dstStart: sb.dstRegion.start, dstEnd: sb.dstRegion.end },
      }));
    } catch { return null; }
    const loaded = await wait;
    if (!loaded || !loaded.ok) {
      console.warn(`[Pool] DONOR PULL — ${nm} could not build ${name} rows ${p.a}–${p.b} from the snapshot (${(loaded && loaded.error) || 'timeout'}); uploading it instead.`);
      return null;
    }
    const runs = await require('./weights-publish.js').changedRuns(matrix, snap._rowHash, p.a, p.b);
    const rp = matrix.rowPtr;
    let sent = 0;
    const MAXV = 4 * 1024 * 1024;
    const patches = [];
    for (const [r0, r1] of runs) {
      for (let k = rp[r0]; k < rp[r1]; k += MAXV) patches.push([k, Math.min(rp[r1], k + MAXV)]);
    }
    const doneId = id;
    const patched = patches.length ? this._awaitDonorReply('slice_patched', doneId, 30 * 60 * 1000) : Promise.resolve({ ok: true });
    patches.forEach(([k0, k1], i) => {
      const v = matrix.values.subarray(k0, k1);
      sent += k1 - k0;
      try {
        p.ws.send(JSON.stringify({ type: 'slice_patch', name, offset: k0 - rp[p.a], values_b64: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64'), ...(i === patches.length - 1 ? { doneId } : {}) }));
      } catch { /* a dropped card re-plans */ }
    });
    const pr = await patched;
    if (!pr) { console.warn(`[Pool] DONOR PULL — ${nm} did not confirm the change patch; uploading ${name} rows ${p.a}–${p.b} instead.`); return null; }
    const total = rp[p.b] - rp[p.a];
    // The card holds the matrix now. The upload path records residency on its
    // ack; this path never did, so a card that built its slice from the release
    // read `0/1 mx` while it taught every lesson.
    try {
      const _pc = this.clients && this.clients.get ? this.clients.get(p.ws) : null;
      if (_pc) { if (!(_pc.heldMatrices instanceof Set)) _pc.heldMatrices = new Set(); _pc.heldMatrices.add(name); }
    } catch { /* bookkeeping only */ }
    console.log(`[Pool] DONOR PULL — ${nm} built ${name} rows ${p.a.toLocaleString()}–${p.b.toLocaleString()} from the published snapshot; ${runs.length} changed run(s), ${(sent * 4 / 1048576).toFixed(1)} MB sent of ${(total * 4 / 1048576).toFixed(1)} MB (${((Date.now() - t0) / 1000).toFixed(0)}s).`);
    return { ok: true, pulled: true };
  },

  /**
   * Publish a snapshot of the intra matrix as a GitHub release, at most every
   * `DREAM_WEIGHTS_PUBLISH_MS` (6 h), when another card is in the pool (a
   * snapshot only helps a card that would otherwise be pushed the weights).
   * Runs in the background after a successful checkpoint pull.
   */
  _maybePublishWeights() {
    if (process.env.DREAM_WEIGHTS_PUBLISH === '0' || this._weightsPublishInFlight) return;
    const gap = Number(process.env.DREAM_WEIGHTS_PUBLISH_MS) > 0 ? Number(process.env.DREAM_WEIGHTS_PUBLISH_MS) : 6 * 3600 * 1000;
    if (this._weightsSnapshot && Date.now() - (this._weightsSnapshotAt || 0) < gap) return;
    const pool = typeof this._livePoolDonors === 'function' ? this._livePoolDonors() : [];
    if (pool.length < 2) return;
    const reg = this._replicaMatrixRegistry;
    const m = reg && reg.get(this._SLICE_NAME) && reg.get(this._SLICE_NAME).matrix;
    if (!m || !m.values || !m.values.length) return;
    this._weightsPublishInFlight = true;
    const t0 = Date.now();
    console.log(`[Brain] WEIGHTS SNAPSHOT — publishing ${this._SLICE_NAME} (${(m.values.byteLength / 1048576).toFixed(0)} MB of weights) as a GitHub release so joining cards pull it from there.`);
    // Lineage = her seed, the same identity the donor's own checkpoint uses.
    let lineage = null;
    try { const st = this._rngMod && typeof this._rngMod.brainRngState === 'function' ? this._rngMod.brainRngState() : null; if (st) lineage = String(st.seed >>> 0); } catch { /* unlabelled */ }
    require('./weights-publish.js').publishSnapshot(m, { name: this._SLICE_NAME, lineage, saveVersion: this._saveVersion || 0 })
      .then((man) => {
        if (man) {
          this._weightsSnapshot = man; this._weightsSnapshotAt = Date.now();
          console.log(`[Brain] WEIGHTS SNAPSHOT — published ${man.tag}: ${man.blocks.length} block(s) in ${((Date.now() - t0) / 60000).toFixed(1)} min.`);
        }
      })
      .catch(() => {})
      .finally(() => { this._weightsPublishInFlight = false; });
  },

  /** Copy every teach frame sent to the cortex owner to the other holders. */
  _installSliceFanout(ws) {
    if (!ws || ws._sliceFanout || typeof ws.send !== 'function') return;
    ws._sliceFanout = true;
    const inner = ws.send.bind(ws);
    const FAN = new Set([3, 5, 7, 8, 9, 10, 11, 12, 13, 14, 17]);
    ws.send = (data, ...rest) => {
      try {
        if (ws === this._gpuClient && this._intraSliceActive() && Buffer.isBuffer(data)
            && data.length > 5 && data[0] === 0x53 && data[1] === 0x50 && data[2] === 0x52 && data[3] === 0x53 && FAN.has(data[4])) {
          for (const s of this._intraSlices) {
            if (s.ws !== ws && s.ws && s.ws.readyState === 1) { try { s.ws.send(data); } catch { /* holder dropped */ } }
          }
        }
      } catch { /* the copy must never break the owner's own send */ }
      return inner(data, ...rest);
    };
  },

  /**
   * Has the set of cards that should hold slices changed? A holder dropped, or
   * a slice-capable card has been connected ≥ 60 s and holds nothing. (60 s,
   * not the cortex hold-down: a slice move is the same upload either way, and
   * a just-registered card is still sending its first telemetry.)
   */
  _intraSliceNeedsReplan() {
    if (process.env.DREAM_SLICE === '0') return false;
    if (this._cortexUploadInFlight || this._cortexMoveInFlight || this._resliceInFlight) return false;
    const owner = this._gpuClient;
    if (!owner || owner.readyState !== 1) return false;
    const cc = this.cortexCluster;
    // The grace window itself clears `_gpuProxyReady`, so it must be let through here.
    if (!cc || (!cc._gpuProxyReady && !this._sliceGracePaused)) return false;
    // The owner holds the whole matrix by choice (it fits): a newcomer does not
    // trigger a re-slice — one card per job.
    if (this._intraWhole && !this._intraSliceActive() && process.env.DREAM_SLICE_WHEN_FITS !== '1') return false;
    const held = new Set(this._intraSliceActive() ? this._intraSlices.map((s) => s.ws) : [owner]);
    if (this._intraSliceActive() && this._intraSlices.some((s) => !s.ws || s.ws.readyState !== 1)) {
      // Remember who dropped: that card waits longer before it is trusted with rows again.
      for (const s of this._intraSlices) if ((!s.ws || s.ws.readyState !== 1) && s.key) this._sliceDroppedAt().set(s.key, Date.now());
      // ⭐ ITS TWIN STILL HOLDS THE ROWS — no pause, no re-slice. Every range
      // still has a live copy, so teaching carries on with nothing lost; the dead
      // entry is dropped and the card is re-added at the next plan once it has
      // stayed up (the rejoin hold). Lessons already wait only on LIVE holders.
      if (this._sliceReaders()) {
        const gone = this._intraSlices.filter((s) => !s.ws || s.ws.readyState !== 1).length;
        this._intraSlices = this._intraSlices.filter((s) => s.ws && s.ws.readyState === 1);
        console.log(`[Pool] REPLICA LEFT — ${gone} slice holder(s) dropped but every row range still has a live copy; teaching continues, nothing lost.`);
        return false;
      }
      // ⭐ REJOIN GRACE (donor 0.3.50 keeps its engine across a reconnect). A
      // holder that dropped gets DREAM_REJOIN_GRACE_MS to come back holding its
      // slice; teaching is PAUSED meanwhile so its rows miss no lesson, and a
      // card that returns is re-attached with no re-upload. Only after the grace
      // runs out is everything re-sliced. The cortex owner is not covered (its
      // loss takes the move path in the close handler).
      const _g = Number(process.env.DREAM_REJOIN_GRACE_MS);
      const graceMs = Number.isFinite(_g) && _g >= 0 ? _g : 30000;
      if (graceMs > 0) {
        if (!this._sliceGraceSince) {
          this._sliceGraceSince = Date.now();
          if (cc) { cc._gpuProxyReady = false; this._sliceGracePaused = true; }
          console.log(`[Pool] REJOIN GRACE — a slice holder dropped; teaching paused up to ${(graceMs / 1000).toFixed(0)} s for it to come back holding its rows (no re-upload if it does).`);
        }
        if (Date.now() - this._sliceGraceSince < graceMs) return false;
        console.log('[Pool] REJOIN GRACE expired — re-slicing over the cards connected now.');
      }
      this._sliceGraceSince = null;
      this._sliceGracePaused = false;
      return true;
    }
    const now = Date.now();
    for (const ws of (typeof this._livePoolDonors === 'function' ? this._livePoolDonors() : [])) {
      if (!ws || held.has(ws) || ws.readyState !== 1 || !this._sliceCapable(ws)) continue;
      if (this._sliceSettled(ws, now) && this._donorCapacityMB(ws) > 512) return true;
    }
    return false;
  },

  /**
   * REJOIN — a card that dropped inside its grace window and came back on a new
   * socket still holding its slice (donor 0.3.50 `heldMatrices`) takes its old
   * place: same rows, no upload. Teaching resumes once every holder is live.
   * Returns true when it re-attached.
   */
  _tryReattachSlice(ws, heldMatrices) {
    if (!this._intraSliceActive() || !Array.isArray(heldMatrices) || !heldMatrices.includes(this._SLICE_NAME)) return false;
    const key = this._sliceKey(ws);
    if (!key) return false;
    const s = this._intraSlices.find((e) => e.key === key && (!e.ws || e.ws.readyState !== 1));
    if (!s) return false;
    s.ws = ws;
    const c = this.clients && this.clients.get ? this.clients.get(ws) : null;
    if (c) { if (!(c.heldMatrices instanceof Set)) c.heldMatrices = new Set(); c.heldMatrices.add(this._SLICE_NAME); }
    this._sliceDroppedAt().delete(key);
    const allLive = this._intraSlices.every((e) => e.ws && e.ws.readyState === 1);
    console.log(`[Pool] REJOIN — ${(c && (c.gpuName || c.id)) || 'donor'} came back holding rows ${s.a.toLocaleString()}–${s.b.toLocaleString()}; re-attached with NO re-upload.${allLive ? ' Teaching resumes.' : ''}`);
    if (allLive) {
      this._sliceGraceSince = null;
      if (this._sliceGracePaused) { this._sliceGracePaused = false; const cc = this.cortexCluster; if (cc) cc._gpuProxyReady = true; }
    }
    return true;
  },

  // Who a card is across reconnects (its socket changes; its donor id does not).
  _sliceKey(ws) {
    const c = ws && this.clients && this.clients.get ? this.clients.get(ws) : null;
    return c ? String(c.donorId || c.lbKey || c.gpuName || c.id || '') : '';
  },

  _sliceDroppedAt() {
    if (!(this._sliceDropMap instanceof Map)) this._sliceDropMap = new Map();
    return this._sliceDropMap;
  },

  /**
   * Has this card been up long enough to be given rows? Every drop of a slice
   * holder costs a pull of every slice and a fresh upload (minutes), so a card
   * that DROPPED one within the last hour must stay connected
   * DREAM_SLICE_REJOIN_HOLD_MS (10 min) first; a card new to her waits 60 s.
   * Until then it still steps the clusters the partition gives it.
   */
  // `forPlan`: a card that has never dropped is taken at once by the planner —
  // the 60 s wait applies only to TRIGGERING a re-slice for a newcomer. Holding
  // every fresh card at boot sent the first upload to one card, then re-sliced.
  _sliceSettled(ws, now = Date.now(), forPlan = false) {
    const c = ws && this.clients && this.clients.get ? this.clients.get(ws) : null;
    if (!c || !c.connectedAt) return false;
    const key = this._sliceKey(ws);
    const dropped = key ? this._sliceDroppedAt().get(key) : 0;
    const _h = Number(process.env.DREAM_SLICE_REJOIN_HOLD_MS);
    const recentDrop = !!(dropped && now - dropped < 3600000);
    if (forPlan && !recentDrop) return true;
    const holdMs = recentDrop ? (Number.isFinite(_h) && _h >= 0 ? _h : 600000) : 60000;
    return now - c.connectedAt >= holdMs;
  },

  /**
   * Re-slice: pause teaching, pull every LIVE slice (and the owner's cross-
   * projections) into the CPU master, forget the old plan, and re-arm the
   * cortex upload — which plans fresh slices over the cards connected now.
   * ⚠ A holder that DROPPED takes its rows' learning since the last pull with
   * it; two copies per slice (the next stage) is what removes that loss.
   */
  async _resliceIntra(reason) {
    if (this._resliceInFlight) return;
    this._resliceInFlight = true;
    const cc = this.cortexCluster;
    try {
      console.log(`[Pool] RESLICE (${reason}) — teaching paused; pulling every live slice into the master before re-planning.`);
      if (cc) cc._gpuProxyReady = false;
      if (this._intraSliceActive()) this._intraSlices = this._intraSlices.filter((s) => s.ws && s.ws.readyState === 1);
      const _w0 = Date.now();
      while (this._valuesReadbackInFlight && Date.now() - _w0 < 10 * 60 * 1000) await new Promise((r) => setTimeout(r, 1000));
      const r = await this.refreshCheckpointFromDonor(`reslice: ${reason}`, { force: true });
      if (!r || !r.ok) console.warn(`[Pool] RESLICE — pull did not complete (${(r && r.reason) || 'unknown'}); re-planning from the last save.`);
    } catch (e) {
      console.warn(`[Pool] RESLICE — pull threw (${e && e.message}); re-planning from the last save.`);
    } finally {
      // Old holders drop their slices; the new plan uploads fresh ones.
      for (const s of (this._intraSlices || [])) {
        if (s.ws && s.ws !== this._gpuClient && s.ws.readyState === 1) {
          try { s.ws.send(JSON.stringify({ type: 'free_matrices', names: [this._SLICE_NAME] })); } catch { /* gone */ }
        }
      }
      this._intraSlices = null;
      this._resliceInFlight = false;
      const rearm = globalThis.__rearmCortexGpuUpload;
      if (typeof rearm === 'function') rearm(`reslice: ${reason}`);
    }
  },

  /** A propagate on the sliced intra matrix: every holder, stitched by row base. */
  async _gatherIntraPropagate(name, pre, timeoutMs, reuseKey) {
    // One live copy per range (replicas hold the same rows).
    const slices = this._sliceReaders();
    if (!slices) return null;   // a range has no live holder — no partial answer
    const rows = Math.max(...this._intraSlices.map((s) => s.b));
    const parts = await Promise.all(slices.map((s) => this.gpuSparsePropagate(name, pre, s.ws, timeoutMs, reuseKey ? `${reuseKey}@${s.a}` : null)));
    if (parts.some((p) => !p)) return null;
    const out = new Float32Array(rows);
    slices.forEach((s, i) => out.set(parts[i].subarray(0, s.b - s.a), s.a));
    return out;
  },

  async _gpuSparseUploadInner(name, matrix, binding, targetWs = null, noRegister = false) {
    // TEACHCREDIT — record the matrix's stored-synapse count so teach frames
    // can be credited with their real giga-ops (see _countTeachOut). Values
    // length IS the nnz; a matrix without one records nothing (no invented
    // credit, ever).
    try {
      const _nnz = (matrix && matrix.values && matrix.values.length) || (matrix && matrix.nnz) || 0;
      // A slice is part of the matrix: recording it would replace the whole
      // matrix's count with one card's share.
      if (_nnz > 0 && !noRegister) {
        if (!this._matrixNnzByName) this._matrixNnzByName = {};
        this._matrixNnzByName[name] = _nnz;
      }
    } catch { /* accounting only — never blocks an upload */ }
    // DF.7 — target a specific donor when given (replica sync), else the
    // primary (canonical upload). Track every CANONICAL upload in the replica
    // registry so a newly-joined donor can be brought to a FULL brain replica
    // by replaying these. Replica-sync uploads (targetWs set) don't re-track.
    let ws = (targetWs && targetWs.readyState === 1) ? targetWs : this._gpuClient;
    // A slice upload is never the canonical matrix: it must not replace the
    // registry's full copy or be mirrored, even when it targets the owner.
    const isReplicaSync = !!(targetWs && targetWs !== this._gpuClient) || !!noRegister;
    // DEAD-SOCKET DEFER (canonical uploads only): a just-dropped primary is
    // not a failed attempt. If no live primary but one existed recently, WAIT
    // (bounded) for the re-register instead of letting the per-matrix retry
    // loop burn its attempts into a corpse socket in milliseconds (live
    // incident: 17 matrices x 3 attempts all "failed" within one second,
    // donor back 4s later, teach stuck on CPU paths). Cold boot — no primary
    // ever seen — keeps the fast-null + re-arm-on-register behavior; replica-
    // targeted sends never wait (a dead replica is skipped, not awaited).
    if (ws && ws.readyState === 1 && !isReplicaSync) this._lastPrimaryAt = Date.now();
    if ((!ws || ws.readyState !== 1) && !isReplicaSync
        && this._lastPrimaryAt && (Date.now() - this._lastPrimaryAt) < 600000) {
      const _waitMs = Number(process.env.DREAM_UPLOAD_WAIT_DONOR_MS) > 0
        ? Number(process.env.DREAM_UPLOAD_WAIT_DONOR_MS) : 120000;
      const _t0 = Date.now();
      if (!this._uploadDeferLogAt || (Date.now() - this._uploadDeferLogAt) > 15000) {
        this._uploadDeferLogAt = Date.now();
        console.log(`[Brain] upload ${name} — primary socket is DOWN; deferring (up to ${Math.round(_waitMs / 1000)}s) for the donor to re-register instead of burning retry attempts into a dead socket.`);
      }
      while ((Date.now() - _t0) < _waitMs) {
        await new Promise((r) => setTimeout(r, 1500));
        if (this._gpuClient && this._gpuClient.readyState === 1) {
          ws = this._gpuClient;
          console.log(`[Brain] upload ${name} — donor re-registered after ${((Date.now() - _t0) / 1000).toFixed(1)}s defer; canonical upload proceeds.`);
          break;
        }
      }
    }
    // TU.25.C — stamp the upload-dispatch time on the RECEIVING socket so the
    // heartbeat sweep grants mid-upload grace (the primary's canonical initGpu
    // upload has no _replicaSyncInFlight marker; without this it was terminated
    // mid-upload every churn cycle).
    if (ws) ws._lastUploadDispatchTs = Date.now();
    // Never push an EMPTY matrix to a replica. A registry-replay (the 1.5s initial sync or the
    // 10-min rebroadcast) can hit a matrix whose CPU CSR was freed (CPU-CSR-free nulls it after
    // the primary's upload); uploading that empty result would CLOBBER the valid copy the
    // live-mirror already gave the replica. Skip — the live-mirror re-sends on the next
    // canonical (valid-CSR) upload.
    // Empty-matrix guard, BOTH lanes. Replica lane: a registry replay can hit
    // a CSR freed post-upload — pushing empty would clobber the replica's
    // valid copy. Canonical lane (re-arm after donor churn): the freed CSR
    // means the weights died with the old donor — uploading empty would
    // install a WIPED projection on the fresh primary. Neither lane may ship
    // a hollow matrix.
    if (!matrix || !matrix.values || matrix.values.length === 0) {
      if (!isReplicaSync) console.error(`[Brain] CRITICAL — canonical upload of ${name} BLOCKED: CPU CSR is empty/freed (weights lived on the departed donor). Skipping so the fresh donor is not seeded with a wiped projection.`);
      return null;
    }
    if (!isReplicaSync) {
      if (!this._replicaMatrixRegistry) this._replicaMatrixRegistry = new Map();
      this._replicaMatrixRegistry.set(name, { matrix, binding });
      // DF.7 LIVE-MIRROR — push this matrix to every connected REPLICA while its CPU CSR is
      // still valid (CPU-CSR-free nulls it shortly after, so the registry-replay path would
      // upload an EMPTY matrix). This is how secondary donors (browser + native, mixed) get the
      // 17 cross-projections — not just clusters — so they hold a FULL brain replica for teach
      // propagate/hebbian. THROTTLED per (replica,matrix) to once/15s: a new replica (no entry)
      // gets all 17 immediately; subsequent teach re-uploads don't re-flood the donor's link
      // (the matrix re-upload flood × replicas was filling the brain's 65MB WS send buffer and
      // starving compute_batch — "connected but never works"). Drift between throttle windows is
      // the accepted DF.7 data-parallel behavior. Memory-free: the CSR is read into locals
      // synchronously up top; recursive call is isReplicaSync (no re-register / no re-mirror).
      if (matrix && matrix.values && matrix.values.length && typeof this._livePoolDonors === 'function') {
        if (!this._replicaMirrorAt) this._replicaMirrorAt = new WeakMap();
        const nowMs = Date.now();
        const MIRROR_THROTTLE_MS = 15_000;
        // ⛔ OWNERSHIP, NOT REPLICATION — once the pool has partitioned the
        // clusters, a card holds only what it OWNS. These matrices are the
        // cortex's; mirroring them to a card that does not own the cortex sent
        // a 4.4 GB intra matrix (and every cross-projection) to an RTX 5060 Ti
        // that owns ONE other cluster — measured on a freshstart: every cortex
        // matrix went out twice, the second copy at a third of the speed, and
        // training sat paused 5.9 min waiting for it.
        const _poolOwned = this._clusterOwner instanceof Map && this._clusterOwner.size > 0;
        for (const _r of this._livePoolDonors()) {
          if (!_r || _r === this._gpuClient || _r.readyState !== 1) continue;
          if (_poolOwned && this._ownerOf('cortex') !== _r) {
            this._mirrorSkippedNotOwner = (this._mirrorSkippedNotOwner | 0) + 1;
            continue;
          }
          let _seen = this._replicaMirrorAt.get(_r);
          if (!_seen) { _seen = new Map(); this._replicaMirrorAt.set(_r, _seen); }
          if (nowMs - (_seen.get(name) || 0) < MIRROR_THROTTLE_MS) continue;
          _seen.set(name, nowMs);
          this.gpuSparseUpload(name, matrix, binding, _r).catch(() => {});
        }
      }
    }
    // ⭐ ADOPT — THE CARD ALREADY HOLDS IT. A donor ≥ 0.3.52 keeps its engine
    // across a brain restart and says whose matrices it holds (`engine_inventory`:
    // her lineage + each matrix's rows/cols/nnz). When this brain's lineage and
    // this exact shape match, the card's copy IS her matrix — newer than the
    // brain's file, since the card kept training after the last pull — so nothing
    // is sent: re-sending would cost a 20-30 min upload over the tunnel AND roll
    // the card back to the older weights on disk. All the bookkeeping an upload
    // does still happens here (registry above, size, residency, the ack), so the
    // rest of the upload flow cannot tell the difference. Any mismatch → upload.
    // `DREAM_ADOPT=0` always uploads.
    // ⛔ STALE CARD — a card's copy is the newer one ONLY if no OTHER card has
    // trained her cortex since. Measured: the pod dropped, the cortex trained on
    // the local card, the pod came back still holding its pre-drop matrices, and
    // adoption kept those — discarding the fresh weights just pulled into the
    // master and then "refreshing" the master FROM the stale card. The trainer
    // is the donor id the cortex last uploaded (or was adopted) on in this
    // process; a different one means the card is behind, so it is sent fresh.
    const _tc = (!isReplicaSync && ws && this.clients && this.clients.get) ? this.clients.get(ws) : null;
    const _tcId = _tc ? String(_tc.donorId || _tc.gpuName || '') : '';
    const _staleCard = !!(this._cortexTrainerId && _tcId && this._cortexTrainerId !== _tcId);
    if (_tc && _tcId) this._cortexTrainerId = _tcId;
    if (_staleCard && _tc.engineShapes instanceof Map && _tc.engineShapes.size) {
      console.log(`[Pool] NO ADOPT — ${_tc.gpuName || 'the card'} holds matrices from before another card trained her; sending the master's newer weights instead.`);
      _tc.engineShapes = new Map();
    }
    if (!isReplicaSync && ws && process.env.DREAM_ADOPT !== '0') {
      try {
        const _ac = this.clients && this.clients.get ? this.clients.get(ws) : null;
        const _sh = _ac && _ac.engineShapes instanceof Map ? _ac.engineShapes.get(name) : null;
        const _st = (this._rngMod && typeof this._rngMod.brainRngState === 'function') ? this._rngMod.brainRngState() : null;
        const _myLineage = (_st && Number.isFinite(Number(_st.seed))) ? String(Number(_st.seed) >>> 0) : null;
        const _nnzHere = (matrix.values && matrix.values.length) || 0;
        if (_sh && _myLineage && _ac.engineLineage === _myLineage
            && _sh.rows === (matrix.rows >>> 0) && _sh.cols === (matrix.cols >>> 0) && _sh.nnz === (_nnzHere >>> 0)) {
          const _mb = +(((matrix.values.byteLength || 0) + (matrix.colIdx ? matrix.colIdx.byteLength : 0) + (matrix.rowPtr ? matrix.rowPtr.byteLength : 0)) / 1e6).toFixed(1);
          if (!this._cortexMatrixMB) this._cortexMatrixMB = {};
          if (!noRegister) this._cortexMatrixMB[name] = _mb;
          if (!(_ac.heldMatrices instanceof Set)) _ac.heldMatrices = new Set();
          _ac.heldMatrices.add(name);
          if (!(this._adoptedMatrices instanceof Set)) this._adoptedMatrices = new Set();
          this._adoptedMatrices.add(name);
          this._adoptedAt = Date.now();
          console.log(`[Pool] ADOPT ${name} — ${_ac.gpuName || 'the card'} already holds it for this brain (${_sh.rows.toLocaleString()}×${_sh.cols.toLocaleString()}, ${_sh.nnz.toLocaleString()} synapses); ${_mb} MB NOT re-sent. Its copy is the newer one.`);
          return { ok: true, adopted: true, name };
        }
      } catch (e) { console.warn(`[Pool] adopt check for ${name} failed (uploading instead): ${e && e.message}`); }
    }
    const reqId = this._nextSparseReqId();
    const rows = matrix.rows;
    const cols = matrix.cols;
    const values = matrix.values instanceof Float32Array ? matrix.values : new Float32Array(matrix.values || []);
    const colIdx = matrix.colIdx instanceof Uint32Array ? matrix.colIdx : new Uint32Array(matrix.colIdx || []);
    const rowPtr = matrix.rowPtr instanceof Uint32Array ? matrix.rowPtr : new Uint32Array(matrix.rowPtr || []);
    const nnz = values.length;

    // 16 MB NNZ worth ≈ 2M nnz/chunk × 8 bytes (4 values + 4 colIdx)
    // FRAME-SIZE CEILING — the native donor's Rust WebSocket stack enforces a
    // 16MiB max frame by default and KILLS the connection on violation. At
    // 2M nnz a chunk frame is ~16MB (+headers, +rowPtr on the first chunk) —
    // exactly why the 85MB intra-synapses upload dropped the donor on every
    // attempt at 306M scale while the small cross-projections sailed (live
    // incident: connect -> intra chunks -> socket killed -> reconnect loop
    // every ~4.5s; the moment intra gave up, 16/17 uploaded fine). 750k nnz
    // = ~6MB frames, comfortable margin even with the first-chunk rowPtr.
    const CHUNK_NNZ = Number(process.env.DREAM_SPARSE_CHUNK_NNZ) > 0
      ? Number(process.env.DREAM_SPARSE_CHUNK_NNZ) : 750_000;
    const totalChunks = Math.max(1, Math.ceil(nnz / CHUNK_NNZ));
    const rowPtrBuf = Buffer.from(rowPtr.buffer, rowPtr.byteOffset, rowPtr.byteLength);
    const totalMb = ((values.byteLength + colIdx.byteLength + rowPtr.byteLength) / 1e6).toFixed(1);
    // POOL — remember each matrix's resident size by name. The partitioner's
    // cortex cost reads this map, so after the first upload the number is the
    // bytes that actually went to the card, not an estimate. No per-matrix
    // size record existed before this line; the only place the size was ever
    // known was this log string.
    if (!this._cortexMatrixMB) this._cortexMatrixMB = {};
    if (!noRegister) this._cortexMatrixMB[name] = Number(totalMb);   // a slice is not the matrix's size
    const hasBinding = !!(binding && binding.srcCluster && binding.dstCluster);
    console.log(`[Brain] sparse chunked upload reqId=${reqId} name=${name} totalChunks=${totalChunks} totalSize=${totalMb}MB${hasBinding ? ` (cluster-bound: ${binding.srcCluster}[${binding.srcRegion.start}..${binding.srcRegion.end}] → ${binding.dstCluster}[${binding.dstRegion.start}..${binding.dstRegion.end}])` : ''}`);

    // Pre-register the pending promise BEFORE sending any chunks so
    // the ack handler can find it even if client ACKs very fast.
    if (!this._gpuSparsePending) this._gpuSparsePending = new Map();
    // STALLDEADLINE — progress the timer closure and the chunk loop both see.
    const _prog = { dispatched: 0, total: totalChunks, bytes: 0 };
    const _stallMs = Number(process.env.DREAM_UPLOAD_STALL_MS) > 0
      ? Number(process.env.DREAM_UPLOAD_STALL_MS) : 180_000;
    const promise = new Promise((resolve, reject) => {
      // #112.3 — FAIL FAST. Was 180s: a stuck/dropped donor upload hung for 3
      // minutes before the loop moved on, and with no retry it declared PARTIAL
      // → CPU fallback. 45s + the per-matrix retry in initGpu means a transient
      // failure recovers quickly and a truly-gone donor is detected in ~45s, not
      // 3 minutes. Tunable via DREAM_SPARSE_UPLOAD_TIMEOUT_MS.
      // Size-scaled upload timeout. A flat 45s cannot cover a multi-GB matrix
      // on a paced link (the per-chunk pacing below can legally spend 150s on
      // ONE chunk) — the flat deadline then killed uploads that were draining
      // fine, and the retry loop re-opened the reconnect churn at full brain
      // scale. Scale the deadline to the payload at a conservative assumed
      // throughput (DREAM_UPLOAD_MIN_MBPS, default 4 MB/s) + 30s margin,
      // capped (DREAM_SPARSE_UPLOAD_TIMEOUT_MAX_MS, default 15 min); an
      // explicit DREAM_SPARSE_UPLOAD_TIMEOUT_MS still wins outright. A truly
      // dead link still dies: pacing bails on close, and a stalled-but-open
      // socket hits the scaled deadline.
      const _envTimeout = Number(process.env.DREAM_SPARSE_UPLOAD_TIMEOUT_MS);
      const _minMBps = Number(process.env.DREAM_UPLOAD_MIN_MBPS) > 0
        ? Number(process.env.DREAM_UPLOAD_MIN_MBPS) : 4;
      const _payloadBytes = values.byteLength + colIdx.byteLength + rowPtr.byteLength;
      // Margin 30s → 120s (2026-08-16): at multi-GB payloads the wire estimate's
      // error is minutes-scale, and the donor's post-receive GPU alloc adds
      // seconds — a 30s margin on a 12-minute transfer left no room for jitter.
      // SYNCSERIAL — CONTENTION-AWARE deadline. The estimate above assumed this upload owns
      // the wire. It does not: the primary's canonical upload, teach frames, and any replica
      // stream all leave the SAME box uplink, so a matrix can spend its whole deadline queued
      // behind a multi-GB neighbour and time out having transferred almost nothing (live: ten
      // 180s timeouts whose retries also timed out). Divide the assumed rate by the number of
      // streams actually in flight so the deadline reflects this upload's real SHARE of the
      // pipe. Serialising replica syncs keeps this near 1 in the normal case; this is the
      // belt-and-braces for the primary-upload-plus-replica overlap that serialising can't remove.
      const _concurrentStreams = 1 + ((this._replicaSyncInFlight && this._replicaSyncInFlight.size) || 0);
      const _effMBps = _minMBps / Math.max(1, _concurrentStreams);
      // QUEUEDEADLINE — the deadline must count the bytes this upload has to WAIT BEHIND,
      // not just its own size. Scaling by bandwidth SHARE alone was not enough and the
      // arithmetic shows why: a 42MB matrix at a contended 2MB/s scores 21s + 120s margin
      // = 141s, which loses to the env's 180s floor, yet it still timed out — because it
      // was dispatched behind ~1.8GB of already-queued intra on the same socket. Its own
      // size never governed how long it waited. `ws.bufferedAmount` measures that queue
      // directly (bytes handed to the socket and not yet flushed), so the deadline now
      // covers drain-then-send instead of send-alone. This is the head-of-line blocking
      // SYNCSERIAL diagnosed — sizing the timeout as if it did not exist was the gap.
      const _queuedAhead = (ws && typeof ws.bufferedAmount === 'number') ? ws.bufferedAmount : 0;
      const _deadlineBytes = _payloadBytes + _queuedAhead;
      const _scaledMs = Math.ceil((_deadlineBytes / (_effMBps * 1048576)) * 1000) + 120_000;
      // Cap 15min → 30min (2026-08-16): the 12M language cortex's intra upload
      // is ~2.9GB ≈ 12min at the measured wire — a 15min cap left no headroom
      // for a slower link; hop 2 grows it further.
      const _capMs = Number(process.env.DREAM_SPARSE_UPLOAD_TIMEOUT_MAX_MS) > 0
        ? Number(process.env.DREAM_SPARSE_UPLOAD_TIMEOUT_MAX_MS) : 1_800_000;
      // ENV FLOOR (2026-08-16, the 12M fresh walk's second kill): the box unit
      // ships DREAM_SPARSE_UPLOAD_TIMEOUT_MS=180000 (a Starlink-donor tuning
      // from the 366MB era) and the old "env wins outright" rule let it
      // undercut PHYSICS — the 2.9GB intra needs ~10-12min at the measured
      // ~4-5MB/s wire, so every upload died at exactly 180000ms, retried its
      // 480 chunks from zero, and flooded the console (live 2026-08-16; the
      // SAME foot-gun bit at 85MB on 2026-07-10 and the box-env check was
      // deferred). The env still RAISES the deadline for slow links (its
      // documented purpose) but can no longer LOWER it below what the payload
      // physically requires at the assumed wire rate. One-shot log when floored.
      let timeoutMs;
      if (_envTimeout > 0) {
        timeoutMs = Math.max(_envTimeout, _scaledMs);
        if (timeoutMs > _envTimeout && (!this._uploadTimeoutFloorLogMs || (Date.now() - this._uploadTimeoutFloorLogMs) > 60000)) {
          this._uploadTimeoutFloorLogMs = Date.now();
          console.log(`[Brain] upload timeout FLOORED — env DREAM_SPARSE_UPLOAD_TIMEOUT_MS=${_envTimeout}ms is below what this ${(_payloadBytes / 1048576).toFixed(0)}MB payload physically needs at ${_effMBps.toFixed(2)}MB/s (${_minMBps}MB/s shared across ${_concurrentStreams} in-flight stream(s), plus ${(_queuedAhead / 1048576).toFixed(0)}MB already queued ahead of it on this socket); using ${timeoutMs}ms (size+queue-scaled). The env can raise deadlines, never starve them.`);
        }
      } else {
        timeoutMs = Math.min(_capMs, Math.max(45_000, _scaledMs));
      }
      // STALLDEADLINE (2026-09-24) — THE DEADLINE RE-ARMS ON PROGRESS. The
      // size-scaled figure above is only the INITIAL arm. A fixed total-transfer
      // budget assumes the wire rate; on a home link measured at ~3.2 MB/s the
      // 3,680 MB intra matrix needed ~19 min against a 997 s budget computed at
      // 4 MB/s, so the promise resolved null at 16.6 min WHILE CHUNKS WERE STILL
      // LANDING ON THE CARD (VRAM 1 GB → 5 GB), the caller's retry re-sent the
      // whole matrix from chunk 0 on top of the still-draining first stream, and
      // the donor's eventual ack for reqId 1 had nobody left to receive it. The
      // chunk loop below re-arms this timer every time a chunk actually leaves
      // the box (the send callback = handed to the kernel), so the only thing
      // that can fire it is a genuine STALL — no chunk out for `_stallMs` — or,
      // after the last chunk, the drain + donor-side alloc window not closing.
      const _pend = { resolve, reject, timeout: null, ws, armedMs: 0, why: 'initial (size+queue-scaled)' }; // TU.25.D — target-tagged for cancel-on-disconnect
      _pend.rearm = (ms, why) => {
        if (_pend.timeout) clearTimeout(_pend.timeout);
        _pend.armedMs = ms; _pend.why = why;
        _pend.timeout = setTimeout(() => {
          // ⛔ Resolve UNCONDITIONALLY — same reason as the other two timers.
          const _wasPending = !!(this._gpuSparsePending && this._gpuSparsePending.delete(reqId));
          if (_wasPending) console.warn(`[Brain] sparse chunked upload reqId=${reqId} name=${name} timed out after ${ms}ms (${why}) — chunks dispatched ${_prog.dispatched}/${_prog.total}, ${(_prog.bytes / 1048576).toFixed(1)}MB left the box, donor socket buffered ${((ws && ws.bufferedAmount) || 0) / 1048576 | 0}MB. A stall, not a slow link: slow links re-arm this deadline on every chunk.`);
          resolve(null);
        }, ms);
      };
      _pend.rearm(timeoutMs, _pend.why);
      this._gpuSparsePending.set(reqId, _pend);
    });

    if (!ws || ws.readyState !== 1) return null;

    // T18.6.b — precompute binding block bytes ONCE (shipped only on the
    // first chunk, identical for every send loop iteration). Wire layout:
    //   srcClusterNameLen(u16) + srcClusterName + u16 pad-to-u32
    //   dstClusterNameLen(u16) + dstClusterName + u16 pad-to-u32
    //   srcStart(u32) + srcEnd(u32) + dstStart(u32) + dstEnd(u32)
    // Pad bytes keep the subsequent u32 fields aligned for TypedArray
    // views on the receiver, matching the existing header-alignment
    // convention used by _encodeSparseHeader.
    let bindingBlock = Buffer.alloc(0);
    if (hasBinding) {
      // CHAT.1 — a matrix uploaded WITH binding metadata is cluster-bound on the
      // donor from the start: record it so gpuSparsePropagateAuto skips the dense
      // pre payload (the donor discards it for bound matrices).
      if (!this._cortexBoundNames) this._cortexBoundNames = new Set();
      this._cortexBoundNames.add(name);
      const srcNameBuf = Buffer.from(binding.srcCluster, 'utf8');
      const dstNameBuf = Buffer.from(binding.dstCluster, 'utf8');
      const padAfterSrc = (4 - ((2 + srcNameBuf.length) % 4)) % 4;
      const padAfterDst = (4 - ((2 + dstNameBuf.length) % 4)) % 4;
      const total = 2 + srcNameBuf.length + padAfterSrc
                  + 2 + dstNameBuf.length + padAfterDst
                  + 16;
      bindingBlock = Buffer.alloc(total);
      let o = 0;
      bindingBlock.writeUInt16LE(srcNameBuf.length, o); o += 2;
      srcNameBuf.copy(bindingBlock, o); o += srcNameBuf.length;
      o += padAfterSrc;
      bindingBlock.writeUInt16LE(dstNameBuf.length, o); o += 2;
      dstNameBuf.copy(bindingBlock, o); o += dstNameBuf.length;
      o += padAfterDst;
      bindingBlock.writeUInt32LE(binding.srcRegion.start >>> 0, o); o += 4;
      bindingBlock.writeUInt32LE(binding.srcRegion.end   >>> 0, o); o += 4;
      bindingBlock.writeUInt32LE(binding.dstRegion.start >>> 0, o); o += 4;
      bindingBlock.writeUInt32LE(binding.dstRegion.end   >>> 0, o); o += 4;
    }

    // DELTAIDX — resolve the capability ONCE per upload, not per chunk.
    const _deltaColIdxOk = this._donorDeltaColIdxOk(ws);
    let _deltaRawBytes = 0, _deltaEncBytes = 0;
    // ALIASFIX — the encode scratch is PER-UPLOAD (a local), never a field on `this`.
    // It was `this._deltaColScratch`, and the encoder returned a subarray VIEW into it.
    // SYNCSERIAL serialises REPLICA syncs, but the primary's canonical upload runs
    // CONCURRENTLY with a replica sync — so two gpuSparseUpload calls were alive at once,
    // both encoding into the same buffer, each silently overwriting the other's colIdx
    // between build and send. Garbage indices then made `bound hebbian` read out of range:
    // CUDA_ERROR_ILLEGAL_ADDRESS on every bound matrix, a permanently poisoned CUDA
    // context, and the whole card forced down to wgpu at a 2047MB cap. A local scratch
    // keeps the one-alloc-per-upload benefit (the UPLOAD GC lesson) with zero cross-talk.
    let _deltaScratch = null;
    // UPLINK.1 — measure the ACTUAL wire rate per upload so "how fast is the
    // link" is a console read, not an archaeology dig through comments.
    const _upT0 = Date.now();
    let _upBytes = 0;
    for (let seq = 0; seq < totalChunks; seq++) {
      const start = seq * CHUNK_NNZ;
      const end = Math.min(start + CHUNK_NNZ, nnz);
      const valuesByteOff = start * 4;
      const valuesByteLen = (end - start) * 4;
      const colIdxByteOff = start * 4;
      const colIdxByteLen = (end - start) * 4;
      const hdr = this._encodeSparseHeader(4, reqId, name);
      const isFirst = (seq === 0);
      // flags bit 0 = first chunk (carries rows/cols/nnz + rowPtr)
      // flags bit 1 = binding block follows rowPtr (first chunk only)
      let flags = 0;
      if (isFirst) flags |= 1;
      if (isFirst && hasBinding) flags |= 2;
      const chunkMeta = Buffer.alloc(12);
      chunkMeta.writeUInt32LE(seq, 0);
      chunkMeta.writeUInt32LE(totalChunks, 4);
      chunkMeta.writeUInt32LE(flags, 8);
      let firstMeta = Buffer.alloc(0);
      if (isFirst) {
        firstMeta = Buffer.alloc(16);
        firstMeta.writeUInt32LE(rows, 0);
        firstMeta.writeUInt32LE(cols, 4);
        firstMeta.writeUInt32LE(nnz, 8);
        firstMeta.writeUInt32LE(rowPtr.length, 12);
      }
      const valuesHdr = Buffer.alloc(8);
      valuesHdr.writeUInt32LE(valuesByteOff, 0);
      valuesHdr.writeUInt32LE(valuesByteLen, 4);
      const valuesSlice = Buffer.from(values.buffer, values.byteOffset + valuesByteOff, valuesByteLen);
      // DELTAIDX — ship colIdx as delta-varints to a >=0.3.22 donor. flags bit 2 (value 4)
      // tells the decoder which stream it is; older donors and every browser donor never
      // see the flag and take the byte-identical raw path.
      let _deltaCols = null;
      if (_deltaColIdxOk) {
        const _need = (end - start) * 5;   // varint worst case = 5B per u32
        if (!_deltaScratch || _deltaScratch.length < _need) _deltaScratch = Buffer.allocUnsafe(_need);
        const _encLen = this._encodeDeltaColIdx(colIdx, start, end, _deltaScratch);
        _deltaCols = _deltaScratch.subarray(0, _encLen);
      }
      const colIdxSlice = _deltaCols
        ? _deltaCols
        : Buffer.from(colIdx.buffer, colIdx.byteOffset + colIdxByteOff, colIdxByteLen);
      if (_deltaCols) {
        flags |= 4;
        _deltaRawBytes += colIdxByteLen;
        _deltaEncBytes += _deltaCols.length;
      }
      const colIdxHdr = Buffer.alloc(8);
      colIdxHdr.writeUInt32LE(colIdxByteOff, 0);
      // On the delta path this is the ENCODED byte length — the decoder derives the
      // ENTRY count from the values slice (values and colIdx are 1:1 in CSR), so no
      // extra count field is needed and the header layout is unchanged.
      colIdxHdr.writeUInt32LE(colIdxSlice.length, 4);
      const pieces = isFirst
        ? (hasBinding
            ? [hdr, chunkMeta, firstMeta, rowPtrBuf, bindingBlock, valuesHdr, valuesSlice, colIdxHdr, colIdxSlice]
            : [hdr, chunkMeta, firstMeta, rowPtrBuf, valuesHdr, valuesSlice, colIdxHdr, colIdxSlice])
        : [hdr, chunkMeta, valuesHdr, valuesSlice, colIdxHdr, colIdxSlice];
      // UPLOAD GC FIX (2026-08-16) — reported as large amounts of time simply
      // being burnt up during uploads.
      // Buffer.concat allocated a FRESH 6-15MB frame for EVERY chunk (480+
      // chunks × ~7MB ≈ 3.4GB of transient garbage per canonical upload at
      // the 12M cortex), and V8 collected it in the ~300ms [EventLoop] BLOCKED
      // bites that walled the console through every upload window. The loop
      // AWAITS each send's completion callback before building the next chunk,
      // so ONE reusable scratch buffer is provably safe: copy the pieces into
      // it, send a zero-copy subarray view, reuse after the awaited callback.
      // Grows on demand (the intra's first frame carries the 48MB rowPtr).
      let _frameLen = 0;
      for (const p of pieces) _frameLen += p.length;
      if (!this._uploadChunkScratch || this._uploadChunkScratch.length < _frameLen) {
        this._uploadChunkScratch = Buffer.allocUnsafe(Math.ceil(_frameLen * 1.25));
      }
      {
        let _off = 0;
        for (const p of pieces) { p.copy(this._uploadChunkScratch, _off); _off += p.length; }
      }
      const frame = this._uploadChunkScratch.subarray(0, _frameLen);
      _upBytes += _frameLen;
      if (isFirst) console.log(`[Brain] sparse upload ${name} first frame = ${(frame.length / 1048576).toFixed(1)}MB${frame.length > 15 * 1024 * 1024 ? ` — FRAGMENTED into ${Math.ceil(frame.length / (15 * 1024 * 1024))} WS continuation frames (sent in ≤15 MiB frames; the native donor reassembles messages up to 512 MiB)` : ' (under the ~16MiB native frame ceiling — sent whole)'}.`);
      // Send chunk. WebSocket preserves order. Wait for the send
      // callback so we don't flood the send buffer with hundreds of
      // MB at once — backpressure per chunk.
      // HBGRACE — bail the chunk loop if the socket died mid-upload (donor terminated by the
      // heartbeat / disconnected), instead of writing every remaining chunk into a destroyed
      // stream and logging an error per chunk.
      if (!ws || ws.readyState !== 1) break;
      // DONOR-FIX — PACE EVERY upload by THIS donor's own socket buffer,
      // not just replica-sync. The per-chunk send-callback await below only
      // confirms the data was handed to the OS send buffer — NOT that the
      // link drained it. On a donor whose browser thread is busy feeding a
      // fast GPU (so it can't service its own socket), bufferedAmount balloons,
      // chunks queue for 10s+, the upload blows its timeout, and the GPU shadow
      // wedges DIRTY (which also makes the manual /resync button futile — its
      // re-upload times out against the same choked link). Wait for THIS
      // donor's buffer to drain below a low-water mark before sending the next
      // chunk. Applied equally to every donor (no primary concept — the equal-
      // replica model): a slow-link donor gets fed at its own pace so the
      // upload COMPLETES instead of timing out. The outer timeout still guards
      // a genuinely dead link. Tunable via DREAM_UPLOAD_PACE_LOWATER_MB.
      {
        const _loMbEnv = Number(process.env.DREAM_UPLOAD_PACE_LOWATER_MB);
        // UPLINK.1 (2026-08-21) — the 8MB low-water is sized for BROWSER donors,
        // whose busy main thread can't drain its own socket (the DONOR-FIX above).
        // A NATIVE donor drains on a dedicated receive thread, and the server
        // loop that pumps this chunk loop gets pinned by 3-4s teach/gate slabs —
        // with only ~14MB in flight (low-water + one chunk) the wire drained in
        // the first fraction of each slab and sat IDLE for the rest: ~14MB per
        // ~3.5s loop cycle ≈ the measured "4MB/s uplink" on a port rated far
        // higher. The pipe was never the limit; the pump was. Keep enough in
        // flight to ride through a slab: 96MB default for native donors
        // (drains in seconds on the real port; still under the pace cap even
        // at worst-case 4MB/s), browser donors keep the 8MB protection.
        let _loDefMb = 8;
        try {
          // ⛔ BOUNDCAP.1 — this WAS `if (_c && _c.donorAppVersion) _loDefMb = 96`,
          // which is true for a browser donor too (register stamps the truthy
          // string 'browser'). So the 96MB in-flight window meant for native
          // donors was ALSO handed to browser donors — the exact opposite of
          // the sentence three lines up, and it removed the protection that
          // exists because a browser donor's busy main thread cannot drain its
          // own socket. Routed through the one nativeness owner now.
          if (this._donorIsNative(ws)) _loDefMb = 96;
        } catch { /* browser default stands */ }
        const _loBytes = (Number.isFinite(_loMbEnv) && _loMbEnv > 0 ? _loMbEnv : _loDefMb) * 1024 * 1024;
        let _pacedMs = 0;
        const _paceCapMs = 150000; // < the upload timeoutMs; hard timeout still applies if link is truly dead
        while (ws && ws.readyState === 1 && typeof ws.bufferedAmount === 'number'
               && ws.bufferedAmount > _loBytes && _pacedMs < _paceCapMs) {
          await new Promise((r) => setTimeout(r, 20));
          _pacedMs += 20;
        }
        if (!ws || ws.readyState !== 1) break;
      }
      await new Promise((res) => {
        this._wsSendFrag(ws, frame, (err) => {
          if (err) {
            const _benignClosed = err.message && (/stream was destroyed|not open|ERR_STREAM_DESTROYED/i.test(err.message));
            if (_benignClosed) {
              if (!this._wsClosedSendCount) this._wsClosedSendCount = 0;
              this._wsClosedSendCount++;
              const nowMs = Date.now();
              if (!this._wsClosedSendLogMs || (nowMs - this._wsClosedSendLogMs) >= 10000) {
                this._wsClosedSendLogMs = nowMs;
                console.warn(`[Brain] sparse chunk send to a CLOSED donor socket (terminated mid-sync) — ${this._wsClosedSendCount} suppressed since boot. Rate-limited 10s.`);
              }
            } else {
              console.warn(`[Brain] sparse chunk reqId=${reqId} seq=${seq}/${totalChunks} ERROR: ${err.message}`);
            }
          }
          res();
        });
      });
      // STALLDEADLINE — a chunk just left the box: that is progress, so the
      // deadline moves. If the deadline has ALREADY fired (the pending entry is
      // gone), stop streaming: the remaining gigabytes would arrive at a donor
      // whose ack nobody is waiting for, and the caller's retry is about to
      // start the same matrix again from chunk 0 on the same socket.
      {
        _prog.dispatched = seq + 1;
        _prog.bytes = _upBytes;
        const _pendNow = this._gpuSparsePending && this._gpuSparsePending.get(reqId);
        if (!_pendNow) {
          console.warn(`[Brain] sparse chunked upload reqId=${reqId} name=${name} — deadline already fired at chunk ${seq + 1}/${totalChunks}; abandoning the remaining ${totalChunks - seq - 1} chunks rather than streaming into a dropped ack.`);
          break;
        }
        if (typeof _pendNow.rearm === 'function') {
          if (seq + 1 === totalChunks) {
            // Last chunk is on the wire. What remains is the socket draining
            // plus the donor allocating and acking — size that window from the
            // bytes still buffered at a deliberately slow 1 MB/s, plus the
            // margin the initial deadline already used.
            const _buf = (ws && typeof ws.bufferedAmount === 'number') ? ws.bufferedAmount : 0;
            const _drainMs = Math.ceil(_buf / 1048576) * 1000;
            _pendNow.rearm(Math.max(_stallMs, _drainMs + 120_000), `all ${totalChunks} chunks dispatched — waiting for the socket to drain ${(_buf / 1048576).toFixed(1)}MB and the donor to ack`);
          } else {
            _pendNow.rearm(_stallMs, `no chunk left the box for ${(_stallMs / 1000) | 0}s`);
          }
        }
        if (totalChunks >= 50 && (seq + 1) % 100 === 0) {
          const _secs = Math.max(0.001, (Date.now() - _upT0) / 1000);
          console.log(`[Brain] sparse upload ${name} progress ${seq + 1}/${totalChunks} chunks · ${(_upBytes / 1048576).toFixed(0)}MB in ${_secs.toFixed(0)}s = ${((_upBytes / 1048576) / _secs).toFixed(2)}MB/s · donor socket buffered ${(((ws && ws.bufferedAmount) || 0) / 1048576).toFixed(1)}MB · deadline re-armed on progress`);
        }
      }
      // WSQ.3 — SYNC PACING. On a replica-sync to a high-RTT/low-bandwidth donor (Starlink),
      // blasting 16MB chunks back-to-back saturates its uplink → its heartbeat pong queues
      // behind the inbound flood → measured RTT spikes into the >1s zone during the warmup
      // window (the very thing that benched it from compute, pre-WSQ.1). Breathe between chunks
      // ∝ the donor's smoothed RTT (capped) so the uplink drains its ACKs and steady-state RTT
      // stays low — which lets WSQ.1's health recover to a real value and the donor carry a
      // full work share. Only paces replica-sync to ALREADY-slow donors; the primary canonical
      // upload and healthy donors are untouched. Tunable via DREAM_DF7_SYNC_PACE_MAX_MS.
      if (isReplicaSync && seq + 1 < totalChunks) {
        const _pc = this.clients && this.clients.get ? this.clients.get(ws) : null;
        const _prtt = _pc && typeof _pc.rttMs === 'number' ? _pc.rttMs : 0;
        const _mbps = _pc && Number(_pc.donorLinkMbps) > 0 ? Number(_pc.donorLinkMbps) : 0;
        const _capEnv = Number(process.env.DREAM_DF7_SYNC_PACE_MAX_MS);
        const _capMs = Number.isFinite(_capEnv) && _capEnv > 0 ? _capEnv : 200;
        // WSQ.3 DONOR-LINK terms (unchanged). RTT proxy: ~RTT/8 between chunks.
        // Bandwidth-aware (WSQ.4 hint, preferred when present): ~half this chunk's transmit
        // time at the donor's measured downlink so we don't outrun the link.
        const _rttPace = _prtt > 200 ? Math.round(_prtt / 8) : 0;
        // DELTAIDX — pace against the bytes actually on the wire, not the raw size.
        const _wireBytes = valuesByteLen + colIdxSlice.length;
        const _bwPace = _mbps > 0 ? Math.round((_wireBytes * 8 / 1e6) / _mbps * 1000 * 0.5) : 0;
        const _linkPace = (_prtt > 200 || _mbps > 0) ? Math.min(_capMs, Math.max(_rttPace, _bwPace)) : 0;
        // DF.7 PACEDSYNC — SERVER-LOOP term. The donor-link terms above protect the DONOR's
        // uplink; nothing protected the SERVER's event loop, which is what the teach loop is
        // actually competing for and why mid-teach syncing had to be banned outright. While
        // the curriculum is teaching, breathe at least a floor between chunks and scale up
        // with the MEASURED loop lag, so teach reclaims the loop instead of queueing behind
        // a 480-chunk burst. Floor keeps a healthy loop honest (~12s added over 480 chunks);
        // the lag multiple backs off hard exactly when teach is suffering.
        let _teachPace = 0;
        if (this._curriculumInProgress && process.env.DREAM_DF7_SYNC_DURING_TEACH !== '1') {
          const _lag = Number(this._lastEventLoopLagMs) || 0;
          const _tEnv = Number(process.env.DREAM_DF7_SYNC_TEACH_PACE_MAX_MS);
          const _tMax = Number.isFinite(_tEnv) && _tEnv > 0 ? _tEnv : 400;
          const _tFloorEnv = Number(process.env.DREAM_DF7_SYNC_TEACH_PACE_MIN_MS);
          const _tFloor = Number.isFinite(_tFloorEnv) && _tFloorEnv >= 0 ? _tFloorEnv : 25;
          _teachPace = Math.min(_tMax, Math.max(_tFloor, _lag * 2));
        }
        const _paceMs = Math.max(_linkPace, _teachPace);
        if (_paceMs > 0) await new Promise((r) => setTimeout(r, _paceMs));
        // PACEDSYNC instrument — progress + the lag we are pacing against, so the real cost
        // of syncing under teach is a FIELD READ and not another theory. Every 64 chunks.
        if (_teachPace > 0 && (seq & 63) === 63) {
          // PACEDSYNC log, corrected twice over:
          //  (1) NAME THE DONOR. Without it, concurrent syncs interleave into one
          //      undifferentiated chunk stream and "is it crawling or restarting?" cannot be
          //      answered from the log at all — which cost a real diagnostic round. Uses the
          //      same `gpuName || id` convention as the other DF.7 donor lines in this file.
          //  (2) DROP THE DEAD FIELD. The old line printed `teach/min=` from
          //      `cortexCluster._teachCallsPerMin`, which does not exist — the real counter
          //      lives in curriculum.js liveness — so it read 'n/a' on every single line. A
          //      field that can only ever print 'n/a' is worse than absent: it looks like a
          //      measurement. Replaced with the donor's own socket backlog, which is the
          //      number that actually says whether THIS sync is keeping up.
          const _who = _pc ? (_pc.gpuName || _pc.id || 'donor') : 'donor';
          const _bufMB = ((ws && ws.bufferedAmount) || 0) / 1048576;
          console.log(`[Brain] DF.7 PACEDSYNC [${_who}] ${name} chunk ${seq + 1}/${totalChunks} — loopLag=${Number(this._lastEventLoopLagMs) || 0}ms pace=${_paceMs}ms (link=${_linkPace} teach=${_teachPace}) donorBuf=${_bufMB.toFixed(1)}MB rtt=${_prtt}ms`);
        }
      }
    }
    if (_deltaEncBytes > 0) {
      const _savedPct = 100 * (1 - _deltaEncBytes / Math.max(1, _deltaRawBytes));
      console.log(`[Brain] DELTAIDX ${name} — colIdx ${(_deltaRawBytes / 1048576).toFixed(1)}MB raw -> ${(_deltaEncBytes / 1048576).toFixed(1)}MB delta-varint (${_savedPct.toFixed(1)}% saved, ${(_deltaEncBytes / Math.max(1, nnz)).toFixed(2)} bytes/entry)`);
    }
    {
      // UPLINK.1 — the honest number. Elapsed covers build+send+drain of every
      // chunk (bufferedAmount may still hold the tail, but the low-water pacing
      // bounds that to one window), so this is the pump's real end-to-end rate.
      const _upSecs = Math.max(0.001, (Date.now() - _upT0) / 1000);
      const _upMBs = (_upBytes / 1048576) / _upSecs;
      console.log(`[Brain] sparse chunked upload reqId=${reqId} name=${name} all ${totalChunks} chunks dispatched, awaiting ack — UPLINK measured ${(_upBytes / 1048576).toFixed(1)}MB in ${_upSecs.toFixed(1)}s = ${_upMBs.toFixed(2)}MB/s (pump-limited if far below the port rating; DREAM_UPLOAD_PACE_LOWATER_MB tunes in-flight)`);
      // ⛔ ONESHOT.1 — THE RATE ALSO LIVES IN STATE NOW. This number existed
      // ONLY in the line above, and it was missed on a press for exactly that
      // reason: the console ring caps at 500 lines and the walk can fill it in
      // seconds. ⚠ Kept as a SMALL RING, not a single value, because the rate
      // is not uniform — a 2.79GB matrix averages lower than a 48MB one since
      // it spans many drain cycles, so a lone "last upload" figure would be a
      // different lie depending on which matrix happened to finish last. The
      // SIZE travels with every entry so the pair can never be read apart.
      try {
        if (!this._uplinkStats) this._uplinkStats = [];
        this._uplinkStats.push({
          at: Date.now(), name: String(name), mb: +(_upBytes / 1048576).toFixed(1),
          secs: +_upSecs.toFixed(1), mbps: +_upMBs.toFixed(2), chunks: totalChunks | 0,
        });
        while (this._uplinkStats.length > 24) this._uplinkStats.shift();
      } catch { /* telemetry never breaks an upload */ }
    }
    // TEACHMIRROR — RECORD RESIDENCY ON THE ACK, FOR BOTH LANES.
    //
    // `heldMatrices` was populated in exactly one place: the replica-sync loop
    // (_syncReplicaToDonor). The PRIMARY never goes through that loop — it gets
    // its weights from the canonical upload, i.e. THIS function — so the master
    // card's Set stayed empty forever and its row read `0/17 mx` while the
    // console on the very same boot said "GPU proxy ready: 17/17 matrices
    // uploaded". PARTMIRROR.4's denominator was right; the numerator was never
    // wired for the one donor that holds the brain.
    //
    // Recording it HERE, on the resolved ack, is what makes the number mean the
    // same thing on every card: a non-null ack is the donor confirming it holds
    // the matrix (the replica loop's own comment at the `_res !== null` check
    // makes the same argument). A null/timeout ack records NOTHING — the whole
    // point is that a donor is never credited with a matrix it did not take.
    // Set semantics make the replica loop's own add a harmless no-op.
    return promise.then((_ack) => {
      if (_ack !== null && _ack !== undefined && this.clients) {
        const _hc = this.clients.get(ws);
        if (_hc && _hc.isGPU) {
          if (!(_hc.heldMatrices instanceof Set)) _hc.heldMatrices = new Set();
          _hc.heldMatrices.add(name);
        }
      }
      return _ack;
    });
  },

  /**
   * Dispatch sparse propagate via binary frame: currents = matrix @ preSpikes.
   * Returns Float32Array (or null on timeout).
   */
  async gpuSparsePropagate(name, preSpikes, targetWs = null, timeoutMs = 30_000, reuseKey = null, priority = false) {
    const pre = preSpikes instanceof Uint32Array ? preSpikes
      : preSpikes instanceof Uint8Array ? Uint32Array.from(preSpikes)
      : new Uint32Array(preSpikes || []);
    // MULTI-CARD — the sliced intra matrix answers from every holder, stitched.
    if (!targetWs && name === this._SLICE_NAME && this._intraSliceActive()) {
      return this._gatherIntraPropagate(name, pre, timeoutMs, reuseKey);
    }
    // DF.7 — a STANDALONE propagate (non-empty preSpikes) carries its own input,
    // so it's stateless + correct on any replica holding the same weights. When
    // fan-out is ON and no explicit target was given, round-robin it across the
    // pool so the idle replica GPUs actually compute (and earn leaderboard credit
    // via their own telemetry) instead of pinning every forward pass to the
    // primary. Empty-preSpikes (bound) calls arrive via gpuSparsePropagateBound
    // with their OWN target + their resident state already mirrored, so they skip
    // this. Untargeted + fan-out OFF → primary, exactly as before.
    if (!targetWs && pre.length > 0 && this._df7FanoutPropagate && this._df7FanoutPropagate()) {
      targetWs = this._nextPoolDonor(name);
    }
    // Backpressure gate — check the CHOSEN donor's flow; if its WS send buffer is
    // backed up, skip this shadow instead of queueing another doomed request.
    if (!this._gpuSparseFlowOk(targetWs, priority)) return null;
    const reqId = this._nextSparseReqId();
    const hdr = this._encodeSparseHeader(2, reqId, name);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(pre.length, 0);
    const preBuf = Buffer.from(pre.buffer, pre.byteOffset, pre.byteLength);
    const full = Buffer.concat([hdr, lenBuf, preBuf]);
    const result = await this._sparseSendBinary(full, reqId, timeoutMs, targetWs, reuseKey);
    if (!result || !result.currents) return null;
    return result.currents; // Float32Array assembled by ack handler
  },

  /**
   * CHAT.1 (2026-07-16) — wire-lean propagate router, the chat-latency fix.
   * stepAwait's per-tick propagates shipped the FULL DENSE pre-spike array
   * (~6MB at the 1.5M language cortex) per matrix per tick — and for the 16
   * CLUSTER-BOUND cross matrices the donor DISCARDS that payload outright
   * (gpu-compute.js writeSparsePreSpikes no-ops when entry.binding is set and
   * reads the bound cluster buffer instead). Routing:
   *   bound matrix      → gpuSparsePropagateBound (empty pre, ZERO payload —
   *                       byte-identical donor behavior, the 6MB was dead weight)
   *   unbound + sparseV2 → type=6 sparse-index propagate (indices up, nonzero
   *                       (idx,val) currents back — ~100-500× less wire)
   *   unbound + legacy   → dense type=2 (native donors without sparseV2)
   * Semantics preserved exactly: same donor dispatch, same math, same currents.
   */
  async gpuSparsePropagateAuto(name, preSpikes) {
    if (this._cortexBoundNames && this._cortexBoundNames.has(name)) {
      return this.gpuSparsePropagateBound(name);
    }
    // The cluster ships ACTIVE INDICES now (`_preSpikePayload`), which is the
    // type-2 standalone form the native donor reads — the same form the gate
    // probe and the bound-matrix rebuild already send. The type-6 sender takes a
    // DENSE array, so it is not used for these payloads.
    return this.gpuSparsePropagate(name, preSpikes);
  },

  /**
   * CHAT.1 — type=6 sparse-index propagate. Payload = active spike INDICES
   * only (KBs instead of the ~6MB dense array). The donor rebuilds the dense
   * pre buffer into a cached scratch, runs the SAME propagateSparse dispatch,
   * and answers with nonzero (index, value) current pairs (or a dense type=2
   * ack when currents are pathologically near-dense — handler accepts both).
   * Primary-donor only (capability-gated per-socket; DF.7 fan-out replicas may
   * be native donors without the handler — they keep the legacy dense path).
   */
  async gpuSparsePropagateSparseIdx(name, preSpikes) {
    const pre = preSpikes instanceof Uint32Array ? preSpikes
      : preSpikes instanceof Uint8Array ? Uint32Array.from(preSpikes)
      : new Uint32Array(preSpikes || []);
    if (!this._gpuSparseFlowOk(null)) return null;
    let nnz = 0;
    for (let i = 0; i < pre.length; i++) if (pre[i]) nnz++;
    const idx = new Uint32Array(nnz);
    for (let i = 0, w = 0; i < pre.length; i++) if (pre[i]) idx[w++] = i;
    const reqId = this._nextSparseReqId();
    const hdr = this._encodeSparseHeader(6, reqId, name);
    const meta = Buffer.alloc(8);
    meta.writeUInt32LE(pre.length, 0);
    meta.writeUInt32LE(nnz, 4);
    const idxBuf = Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength);
    const full = Buffer.concat([hdr, meta, idxBuf]);
    const result = await this._sparseSendBinary(full, reqId, 30_000, null);
    if (!result || !result.currents) return null;
    return result.currents;
  },

  /**
   * CHAT.3 (2026-07-16) — chat-priority window. While Unity is composing a
   * live reply, the teach firehose (pattern-lane frames + bound-Hebbian batch
   * flushes) yields the WS + donor onmessage queue to the emission dispatches
   * so her reply isn't stuck behind thousands of teach frames. Shedding teach
   * frames is DOCUMENTED-SAFE (CPU authoritative; the GPU shadow re-converges
   * via auto-resync — the exact contract the backpressure shed already uses).
   * chat.js stamps _chatPriorityUntil around generateAsync.
   */
  _chatPriorityActive() {
    return !!(this._chatPriorityUntil && Date.now() < this._chatPriorityUntil);
  },

  /**
   * ONE PROCESS (ruled 2026-07-17: the mind's eye and the voice run on the GPU,
   * as ONE process rather than separate pieces bolted together) — mind-space op dispatch to the
   * DONOR GPU. The donor that computes her brain also computes her imagery:
   * the CDF 9/7 lifting + trace/stylize/imagine ops run donor-side (browser
   * donor = MindSpaceGPU in compute.html; native donor = mindspace.rs WGSL,
   * donor-v0.3.11+). Protocol v1 (mindspaceV1 capability in gpu_register):
   *   server→donor  {type:'mindspace_op', id, op, ...payload}
   *     op='perceive'         {width, height, rgba_b64}
   *     op='reconstruct'      {rec}
   *     op='stylizeField'     {rec, opts, labelStrokes}
   *     op='traceLineArt'     {rec, opts}
   *     op='imagineFromState' {seed_b64 (f32le), opts}
   *     op='describe'         {rec, dim}
   *   donor→server  {type:'mindspace_result', id, ok, rec|strokes|percept_b64|data_b64|error}
   * ⛔⛔ THE SIZE ASSUMPTION BELOW WAS MEASURED ON 2026-10-29 AND IS 16x WRONG.
   * It used to read, unqualified: "Payloads are SMALL (≤192² frames ≈ 150KB,
   * recs are KBs)". Read off a live resume boot: 15 sends of 2.3-2.5MB in four
   * minutes, every one a mindspace_op on the drawing lane. Frames are rendered
   * at 512² now (image-engine.js) and schemas carry full vector traces, so
   * neither half of that parenthesis holds. ⚠ KEPT, NOT DELETED, because this
   * comment is the basis on which JSON+base64 was chosen over a binary frame —
   * a stale premise that still reads as a justification is worse than a wrong
   * number.
   *
   * What is still true: nothing here approaches the 6MB spike arrays, and on
   * LOOPBACK it is provably harmless (buffered 0.0MB on all 15, zero drops,
   * zero timeouts). What is NOT established: the cost to a REMOTE primary. A
   * stranger's card can be PRIMARY and these ops go only to the PRIMARY. The
   * one remote figure this project owns is 0.16 MB/s, measured on the Funnel
   * the Cloudflare tunnel replaced — so it is NOT the tunnel's number and must
   * not be quoted as one. The tunnel's real rate is unmeasured.
   *
   * ⭐ THE OP NAMED ITSELF ON THE NEXT BOOT: `describe`, 4 of 4 LARGE sends at
   * 2.0-2.4MB, with the other four routed ops contributing ZERO — and it was
   * NOT the one to guess (`perceive` carries a 512² rgba_b64 and never tripped
   * the wire). So `describe` was REMOVED from this lane entirely rather than
   * re-encoded: `describeEquational` is a single linear pass over the rec's
   * nonzero coefficients, which is not GPU work, and it was paying 2.4MB to
   * return a 64-value percept. See mindspace-proxy.js `describe` for the full
   * reasoning and the parity read that made it safe.
   *
   * ⚠ Still on this lane and still shipping a whole rec: `traceLineArt` and
   * `stylizeField`. Those are genuine lifting work and BELONG on the card — but
   * they carry the same payload shape and simply did not cross 2MB on the boots
   * measured. If the tripwire names one of them later, that is a real finding
   * and not a repeat of this one.
   *
   * JSON+base64 is the wire today. Timeout → null; the
   * caller (MindSpaceWorkerProxy) holds the rollout ramp until v0.3.11 is the
   * min donor version (sparseV2 precedent — ramp removal is a logged milestone).
   */
  _mindspaceWsCapable(ws, op) {
    if (!(ws && ws.readyState === 1 && ws._mindspaceV1 === true)) return false;
    // Per-op capability: a donor may advertise a `mindspaceOps` list (the native
    // binary ships perceive/describe/stylizeField/traceLineArt first; de-novo
    // imagineFromState lands with its glyph-plane port). No list = all ops
    // (the browser donor hosts the full MindSpaceGPU surface).
    if (op && ws._mindspaceOps && !ws._mindspaceOps.has(op)) return false;
    return true;
  },

  /**
   * MULTI-CARD — a mind-space op carries its whole input (the rec / frame), so
   * any card that speaks it can run it. Pick the capable card with the fewest
   * ops already in flight; ties go to the lowest round trip, which keeps the
   * MB-sized payloads on this machine's card when it is free. The cortex owner
   * is no longer the only card her imagery runs on.
   */
  _pickMindspaceCard(op) {
    const cands = [];
    const seen = new Set();
    for (const ws of [this._gpuClient, ...(typeof this._livePoolDonors === 'function' ? this._livePoolDonors() : [])]) {
      if (!ws || seen.has(ws)) continue;
      seen.add(ws);
      if (this._mindspaceWsCapable(ws, op)) cands.push(ws);
    }
    if (!cands.length) return null;
    const rtt = (ws) => { const c = this.clients && this.clients.get ? this.clients.get(ws) : null; return Number(c && c.rttMs) || 0; };
    cands.sort((a, b) => ((a._msInflight | 0) - (b._msInflight | 0)) || (rtt(a) - rtt(b)));
    return cands[0];
  },

  _mindspaceDonorCapable(op) {
    return !!this._pickMindspaceCard(op);
  },

  async gpuMindspaceOp(op, payload, timeoutMs = 30_000) {
    const ws = this._pickMindspaceCard(op);
    if (!ws) return null;
    if (!this._mindspacePending) this._mindspacePending = new Map();
    if (!this._mindspaceReqId) this._mindspaceReqId = 1;
    const id = this._mindspaceReqId++;
    ws._msInflight = (ws._msInflight | 0) + 1;
    return new Promise((outerResolve) => {
      let done = false;
      const resolve = (v) => { if (done) return; done = true; ws._msInflight = Math.max(0, (ws._msInflight | 0) - 1); outerResolve(v); };
      const timeout = setTimeout(() => {
        this._mindspacePending.delete(id);
        resolve(null);
      }, timeoutMs);
      this._mindspacePending.set(id, { resolve, timeout });
      try {
        ws.send(JSON.stringify({ type: 'mindspace_op', id, op, ...payload }));
      } catch {
        clearTimeout(timeout);
        this._mindspacePending.delete(id);
        resolve(null);
      }
    });
  },

  /**
   * T17.7 Phase C.1 — cluster-bound Hebbian dispatch. Reuses the same
   * type=3 binary frame as gpuSparseHebbian, but with zero-length
   * pre/post arrays (so no bulk data crosses the wire). compute.html's
   * handler skips writeSparsePreSpikes/writeSparsePostSpikes when
   * length is 0, and the cluster-bound matrix's hebbianSparse reads
   * pre/post from main-cortex spikes buffer at the bound region
   * offsets — which is where curriculum teach writes patterns via
   * write_spike_slice.
   *
   * Wire cost at 7M/7M standalone size would be ~56 MB pre+post per
   * Hebbian without this path. Cortex teaches fire thousands of
   * Hebbians per curriculum rep — saving 56 MB × N calls makes
   * biological-scale teaching feasible.
   */
  async gpuSparseHebbianBound(name, lr) {
    // T18.8 — BATCHED bound Hebbian dispatch. Prior implementation shipped
    // every call as its own ~50-byte SPRS binary frame, which hit
    // compute.html's single-threaded onmessage handler serially at roughly
    // 1 kHz ceiling → GPU pegged at 3% because each dispatch completed in
    // microseconds then waited for the next WebSocket round-trip. The batched
    // path accumulates bound-Hebbian ops into a pending queue and flushes
    // them as a single type=5 SPRS frame carrying N (name, lr) tuples.
    // compute.html issues N `gpu.hebbianSparse(name, lr)` calls in one
    // onmessage tick — the GPU command queue fills with N dispatches and
    // pipelines them through the compute units without waiting on JS.
    // One WebSocket ACK returns for the whole batch. At N=64 the per-op
    // round-trip cost drops by 64× and SM utilization climbs proportionally.

    // Flow gate: curriculum-teach's flow gate `_gpuSparseFlowOk()` caps
    // PENDING count at 4. One batch = one pending, so up to 4 batches ×
    // 64 ops = 256 in-flight ops without changing the cap. If the batch
    // queue overflows the cap too, the call becomes a no-op. NOTE (2026-08-15):
    // the note that used to end this paragraph - "CPU remains authoritative on
    // Hebbian, so a dropped GPU shadow is safe" - is no longer true. The
    // GPU-only change removed the CPU teach path; a dropped bound-Hebbian is a
    // LOST update, not a redundant one. It is still preferable to a corrupt one
    // (see the stale-pattern guard below), but it is a real cost.
    // REFUSE TO TRAIN ON A STALE PATTERN (2026-08-15).
    //
    // This dispatch does not carry its own pre/post - it tells the donor to run
    // Hebbian over whatever is currently in the bound spike-buffer window, which
    // the pattern lane wrote moments earlier. If any frame of that pattern was
    // shed or throttled, the buffer still holds the PREVIOUS iteration's
    // pattern, and firing here would train a wrong association into real
    // weights. Under the old design the CPU shadow corrected for that; the
    // GPU-only change removed it, so the check has to live here.
    //
    // Skipping costs one Hebbian update. Firing costs a corrupted one that
    // nothing downstream will ever notice. The counter is published so the cost
    // of skipping is visible rather than silent.
    // The Hebbian dispatch CLOSES the pattern group either way - the group's
    // purpose (deliver one teach iteration's pattern whole) is spent, and the
    // next iteration's first frame must face admission again.
    if (this._patternGroup) this._patternGroup.open = false;
    if (this._patternLaneStale) {
      this._hebbianSuppressedStale = (this._hebbianSuppressedStale || 0) + 1;
      return null;
    }
    return this._enqueueBoundHebbian(name, lr);
  },

  /**
   * v0.3.18 — range-form plasticity dispatch. The whole N-rep band-pair
   * dose (the pair-reinforce primitive's static one-hot patterns are
   * contiguous [start,len] ranges) ships as ONE ~60-byte JSON frame; the
   * donor expands ranges locally and loops its existing hebbian op
   * stream-ordered. SELF-CONTAINED: carries its own pre/post, touches no
   * shared spike buffers — so no pattern-lane admission, no stale
   * coupling, no group membership. Fire-and-forget like every teach
   * frame; a drowning socket refuses (the caller's CPU shadow law keeps
   * training whole). Returns true ONLY when the frame actually went out.
   */
  gpuSparseHebbianRanges(name, lr, reps, preRanges, postRanges) {
    if (!this._donorHebbianRanges()) return false;
    const ws = this._gpuClient;
    if (!ws || ws.readyState !== 1) return false;
    if (ws.bufferedAmount > this._donorPatternLaneCapBytes()) return false;
    if (!Array.isArray(preRanges) || !Array.isArray(postRanges) || !preRanges.length || !postRanges.length) return false;
    // Seed Crystal — the dose is split at the cluster midpoint and each side
    // ships at its own lr (η_L, η_R). A post range that straddles the midpoint
    // is cut in two. Pre ranges are unchanged; when the contest has not moved
    // the scale (or the crystal is unmeasured) one frame goes out exactly as before.
    const _hs = (this.cortexCluster && Array.isArray(this.cortexCluster._hemiScale)) ? this.cortexCluster._hemiScale : null;
    const _mid = this.cortexCluster ? Math.floor((this.cortexCluster.size || 0) / 2) : 0;
    const _frames = [];
    if (_hs && _mid > 0 && (Math.abs(_hs[0] - 1) > 1e-6 || Math.abs(_hs[1] - 1) > 1e-6)) {
      const L = [], R = [];
      for (const [start, len] of postRanges) {
        if (!(len > 0)) continue;
        const end = start + len;
        if (end <= _mid) L.push([start, len]);
        else if (start >= _mid) R.push([start, len]);
        else { L.push([start, _mid - start]); R.push([_mid, end - _mid]); }
      }
      if (L.length) _frames.push({ lr: lr * _hs[0], postRanges: L });
      if (R.length) _frames.push({ lr: lr * _hs[1], postRanges: R });
    } else {
      _frames.push({ lr, postRanges });
    }
    try {
      for (const f of _frames) {
        ws.send(JSON.stringify({
          type: 'hebbian_ranges',
          name,
          lr: f.lr,
          reps: Math.max(1, Math.min(1000, Math.round(reps || 1))),
          preRanges,
          postRanges: f.postRanges,
        }));
        this._hebbianRangesSent = (this._hebbianRangesSent || 0) + 1;
      }
      if (_frames.length > 1) this._hebbianRangesSplit = (this._hebbianRangesSplit || 0) + 1;
      return true;
    } catch {
      return false;
    }
  },

  /**
   * v0.3.18 - does the PRIMARY donor speak range-form plasticity
   * (hebbian_ranges)? Same TU.20.12 negotiation pattern as the other
   * capability gates.
   */
  _donorHebbianRanges() {
    const ws = this._gpuClient;
    if (!ws) return false;
    if (this._hebRangesWs === ws) return this._hebRangesOk === true;
    this._hebRangesWs = ws;
    this._hebRangesOk = false;
    try {
      const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      const v = ((c && c.donorAppVersion) || '').toString().trim();
      const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (m) this._hebRangesOk = ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3018; // 0.3.18
    } catch { this._hebRangesOk = false; }
    try {
      console.log(`[Brain] teach-frame RANGE plasticity for PRIMARY donor: ${this._hebRangesOk ? 'ON (hebbian_ranges)' : 'off'} (requires >= 0.3.18).`);
    } catch { /* best-effort */ }
    return this._hebRangesOk === true;
  },

  /**
   * T18.8 — bound-Hebbian batch queue + flush scheduler.
   *
   * Accumulates (name, lr) tuples in `_boundHebbianBatch.ops`. Flushes when:
   *   (a) queue length reaches BATCHED_HEBBIAN_MAX_OPS (64), OR
   *   (b) BATCHED_HEBBIAN_FLUSH_MS (2 ms) elapses since first enqueue in
   *       the current batch.
   *
   * Returns a Promise that resolves when the ACK for the batch arrives
   * (so upstream awaits that might have wanted a "GPU Hebbian applied"
   * signal still work). Hebbian is fire-and-forget in practice — CPU
   * path is authoritative per `cluster.intraSynapsesHebbian` — so a
   * rejected / dropped batch just means the GPU shadow missed that
   * update and re-syncs on the next successful dispatch.
   */
  _enqueueBoundHebbian(name, lr) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1) {
      return Promise.resolve(null);
    }
    if (!this._boundHebbianBatch) {
      this._boundHebbianBatch = { ops: [], flushTimer: null };
    }
    const batch = this._boundHebbianBatch;
    // T32 — bumped from 64→256 ops per batch + 2ms→20ms flush so batches
    // accumulate more ops before flushing. Combined with the new
    // hebbianSparseBatch path (ONE encoder + ONE submit per batch),
    // GPU utilization during teach climbs from sub-1% toward saturating
    // SM pipeline. Tradeoff: up to 20ms extra latency per fire-and-forget
    // Hebbian — irrelevant to curriculum correctness, HUGE win for throughput.

    // Cap bumped 256 → 512 ops per batch. Doubles ops per WS message so
    // backpressure logic engages later under sustained teach bursts
    // (each op ~28 bytes encoded → 512×28 = ~14KB per frame, well
    // under WebGPU single-buffer cap). Halves WS message rate for
    // same Hebbian throughput. FLUSH_MS unchanged — burst rate
    // unchanged so accumulation window stays at 20ms.
    const BATCHED_HEBBIAN_MAX_OPS = 512;
    const BATCHED_HEBBIAN_FLUSH_MS = 20;
    // Backpressure guards — prevent unbounded queue growth under flow stress.
    // Max in-flight batches (reqIds in _gpuSparsePending waiting for ACK):
    //   Existing `_gpuSparseFlowOk()` caps non-batch pending at 4. A batch
    //   is one reqId; we allow up to BATCHED_HEBBIAN_MAX_INFLIGHT=4 batches
    //   simultaneously, so effective in-flight cap is 4 × 64 = 256 ops,
    //   which matches the raw WebSocket/onmessage ceiling at 1-2 ms per
    //   batch RTT = ~500-1000 batches/sec = ~32-64 K Hebbian ops/sec ceiling.
    // Queue itself capped at BATCHED_HEBBIAN_QUEUE_CAP=256 ops — curriculum
    // teach should never exceed a couple hundred ops between batch flushes,
    // but if it does (e.g. WebSocket stalled) drop the op silently (CPU
    // Hebbian path is authoritative per cluster.intraSynapsesHebbian's
    // fire-and-forget contract).
    // Queue cap raised to 4× batch size (1024) so flushes can absorb
    // a burst of accumulating ops without the silent-drop fallback
    // firing while a batch is mid-flight to GPU.
    const BATCHED_HEBBIAN_QUEUE_CAP = 1024;
    if (batch.ops.length >= BATCHED_HEBBIAN_QUEUE_CAP) {
      // GPUTEACH step-0/A (2026-08-21) — the cap used to DROP silently, and
      // during gate-era CPU slabs (3s of synchronous teach math) the 20ms
      // flush timer never fires mid-slab: the queue filled and every op past
      // 1024 was LOST, per slab — the real reason the donor read 0 teach/min
      // through whole gates while the design was GPU-first. ws.send only
      // buffers, so flushing synchronously mid-slab is safe: ship the full
      // batch NOW and keep enqueueing. Nothing drops; the counter proves it.
      this._boundHebbianCapFlushes = (this._boundHebbianCapFlushes || 0) + 1;
      this._flushBoundHebbianBatch();
    }
    this._boundHebbianEnqueued = (this._boundHebbianEnqueued || 0) + 1;
    return new Promise((resolve, reject) => {
      batch.ops.push({ name, lr, resolve, reject });
      if (batch.ops.length >= BATCHED_HEBBIAN_MAX_OPS) {
        this._flushBoundHebbianBatch();
      } else if (!batch.flushTimer) {
        batch.flushTimer = setTimeout(() => this._flushBoundHebbianBatch(), BATCHED_HEBBIAN_FLUSH_MS);
      }
    });
  },

  /**
   * T18.8 — flush the bound-Hebbian batch. Encodes all pending ops into a
   * single type=5 SPRS binary frame and ships it via _sparseSendBinary.
   * Wire layout after the standard 11+nameLen+pad header (empty name for
   * batch frames — nameLen=0):
   *   opCount (u16) + pad (u16) to align,
   *   for each op:
   *     opNameLen (u16) + pad (u16),
   *     opName bytes,
   *     pad to u32 boundary,
   *     lr (f32)
   *
   * The ACK that returns is SPRR + typeByte=5 + reqId; the existing
   * binary-ack handler at `ws.on('message', ...)` routes it through
   * `_gpuSparsePending` which resolves `batchPromise`. We then fan out
   * to every queued op's resolve callback so individual await sites
   * (rare — Hebbian is fire-and-forget in practice) still unblock.
   */
  _flushBoundHebbianBatch(force = false) {
    const batch = this._boundHebbianBatch;
    if (!batch) return;
    if (batch.flushTimer) {
      clearTimeout(batch.flushTimer);
      batch.flushTimer = null;
    }
    const ops = batch.ops;
    if (ops.length === 0) return;
    // CHAT PRIORITY (CHAT.3) — while a live reply is composing, DELAY the
    // teach hebbian flush (re-arm 250ms) so the donor's serial onmessage
    // handler serves emission dispatches first. The queue keeps accumulating;
    // at the 1024-op cap it flushes anyway (bounded delay, bounded drops —
    // both under the existing fire-and-forget shed contract).
    // ⛔ NOT when forced: a forced flush is the ORDERING flush (see
    // `_donorPatternSendGated`) — the next pattern is about to overwrite the
    // spikes these ops read, so delaying them would train them on that pattern.
    if (!force && this._chatPriorityActive && this._chatPriorityActive() && ops.length < 1000) {
      batch.flushTimer = setTimeout(() => this._flushBoundHebbianBatch(), 250);
      return;
    }
    batch.ops = [];
    // GPUTEACH step-0 — every stage counted so the lane can never lie again
    this._boundHebbianFlushedFrames = (this._boundHebbianFlushedFrames || 0) + 1;
    this._boundHebbianFlushedOps = (this._boundHebbianFlushedOps || 0) + ops.length;

    // DF.7 — the bound-Hebbian batch is the BULK of teach GPU work. With fan-out
    // ON, round-robin each batch to the next donor so the teach load actually
    // SPREADS across the pool (every donor computes + earns leaderboard credit)
    // instead of pinning 100% of Hebbian to the primary. Safe: the CPU CSR is the
    // authoritative Hebbian master (the GPU op is a fire-and-forget shadow), the
    // resident spike state each batch reads is already mirrored to replicas
    // (_mirrorCortexWriteToReplicas on write_spike_slice), and the periodic master
    // re-broadcast re-converges each donor's drifted weight-shadow — so a batch
    // landing on any replica can't corrupt training. Fan-out OFF → primary, exact
    // prior behavior.
    // ⛔⛔ ALWAYS THE CORTEX OWNER. This used to round-robin teach batches across
    // the pool on the premise that "the CPU CSR is the authoritative Hebbian
    // master" — untrue since training moved to the GPU. A bound op trains on the
    // pattern resident on THAT card, patterns are written only to the cortex
    // owner, and the weight readback pulls only from the cortex owner — so every
    // batch routed to another card trained a copy nobody reads against a pattern
    // it never received. That learning was lost whenever a second card joined.
    const target = this._gpuClient;
    if (!target || target.readyState !== 1) {
      for (const op of ops) op.resolve(null);
      return;
    }

    // TU.25.A — SHED, don't stack. The bound-Hebbian batch stream is the teach
    // flood (~7.4MB/s sustained on the live box) and it out-runs a donor link's
    // drain rate: the buffer sawtoothed 400-900MB, our heartbeat ping queued
    // BEHIND that mass for 60-120s, and every just-promoted primary got
    // false-reaped mid-upload (7 kills in 12.5min). These frames are
    // fire-and-forget GPU shadows — the CPU CSR is authoritative and the
    // (TU.20.2-fixed) auto-resync re-converges the shadow once the buffer
    // drains — so under saturation the correct move is to DROP the batch
    // immediately, not enqueue it (the old 30s backpressure await downstream
    // just stalled the pipeline while the queue kept growing). Threshold is a
    // SOFT cap well below the 500MB hard-drop line so liveness traffic (pings,
    // acks, uploads) keeps a drainable buffer. Env: DREAM_WS_SOFT_SHED_MB.
    const SOFT_SHED_MB = Number(process.env.DREAM_WS_SOFT_SHED_MB) > 0
      ? Number(process.env.DREAM_WS_SOFT_SHED_MB) : 64;
    if (target.bufferedAmount > SOFT_SHED_MB * 1024 * 1024) {
      if (!this._wsShedCount) this._wsShedCount = 0;
      this._wsShedCount += ops.length;
      // #16 — PER-MATRIX dirty tracking. Record WHICH matrices this shed dropped
      // (each op carries its matrix name) so the resync can re-upload ONLY those
      // via gpuSparseUpload instead of the full ~85MB initGpu. Bounded set; the
      // resync falls back to a full re-upload whenever the set is empty/uncertain
      // (donor-left divergence, unknown name), so this can never regress.
      if (!this._gpuDirtyMatrices) this._gpuDirtyMatrices = new Set();
      for (const _op of ops) { if (_op && _op.name) this._gpuDirtyMatrices.add(_op.name); }
      this._armShadowResyncDeferred('teach-hebbian batch shed at soft cap'); // dirty on the clearable flag + resync actually armed
      if (!this._wsShedLogMs || (Date.now() - this._wsShedLogMs) > 30000) {
        this._wsShedLogMs = Date.now();
        console.warn(`[Brain] TU.25.A — teach-Hebbian batch SHED (${ops.length} ops): target bufferedAmount=${(target.bufferedAmount / 1024 / 1024).toFixed(1)}MB > ${SOFT_SHED_MB}MB soft cap. CPU stays authoritative; GPU shadow re-converges via auto-resync once the buffer drains. ${this._wsShedCount} ops shed since boot (rate-limited 30s).`);
      }
      for (const op of ops) op.resolve(null);
      return;
    }

    const reqId = this._nextSparseReqId();
    const headerBuf = this._encodeSparseHeader(5, reqId, ''); // empty name for batch frames
    const countBuf = Buffer.alloc(4);
    countBuf.writeUInt16LE(ops.length, 0);
    // countBuf[2..3] already zero (pad)

    const opBufs = [];
    for (const op of ops) {
      const nameBuf = Buffer.from(op.name, 'utf8');
      const padAfterName = (4 - ((nameBuf.length) % 4)) % 4;
      const size = 4 /* nameLen+pad */ + nameBuf.length + padAfterName + 4 /* lr */;
      const opBuf = Buffer.alloc(size);
      let o = 0;
      opBuf.writeUInt16LE(nameBuf.length, o); o += 2;
      // o += 2 pad — already zero
      o += 2;
      nameBuf.copy(opBuf, o); o += nameBuf.length + padAfterName;
      opBuf.writeFloatLE(Number(op.lr) || 0, o);
      opBufs.push(opBuf);
    }
    const frame = Buffer.concat([headerBuf, countBuf, ...opBufs]);

    const batchPromise = this._sparseSendBinary(frame, reqId, 30_000, target);
    batchPromise.then((result) => {
      for (const op of ops) op.resolve(result);
    }, (err) => {
      for (const op of ops) op.reject(err);
    });
  },

  /**
   * T17.7 Phase C.1 — cluster-bound propagate dispatch. Reuses the
   * type=2 binary frame with zero-length preSpikes; compute.html's
   * handler skips writeSparsePreSpikes when length is 0, and the
   * cluster-bound matrix's propagateSparse reads pre-spikes directly
   * from main-cortex spikes buffer at the bound src region offset,
   * writes post-currents into main-cortex currents buffer at the
   * bound dst region offset. Returns post-region currents Float32Array
   * same as standalone path (shape = dstRegion size).
   */
  /**
   * GATEGPU (2026-08-21) — one gate probe on the donor: write the probe
   * pattern into the src region's resident spike slice, then run the bound
   * forward propagate and return the currents. The donor holds the FULL
   * training mass (the CPU CSR is the sampled shadow), so probing there is
   * both ~100× faster (one ~KB template + one round trip vs seconds of CPU
   * matmul at grown matrices) and TRUER — it grades the real weights.
   *
   * Honesty guards, each an immediate null (the caller's CPU chunked path
   * grades instead — a probe is never skipped, only relocated):
   *  - kill switch DREAM_GATE_GPU_PROBES=0;
   *  - no live primary socket;
   *  - >256KB already buffered on the socket — the pattern write below rides
   *    the shed-able fire-and-forget lane, and a shed write + a bound
   *    propagate would grade her against STALE spikes; below 256KB the lane
   *    governors admit everything, so a shed is not possible;
   *  - the propagate is PINNED to the PRIMARY (same socket the write went
   *    down — never a pool replica whose mirror may have shed the write).
   */
  /** True once `ws`'s send buffer is ≤256 KB (polled, ≤3 s); false if it never drains or the socket goes. */
  async _probeSocketDrained(ws) {
    const LIMIT = 256 * 1024;
    const maxMs = Number(process.env.DREAM_PROBE_DRAIN_MS) > 0 ? Number(process.env.DREAM_PROBE_DRAIN_MS) : 3000;
    const t0 = Date.now();
    while (ws && ws.readyState === 1 && typeof ws.bufferedAmount === 'number' && ws.bufferedAmount > LIMIT) {
      if (Date.now() - t0 > maxMs) return false;
      await new Promise((r) => setTimeout(r, 20));
    }
    return !!ws && ws.readyState === 1;
  },

  async gpuGateProbe(matrixName, srcRegionName, sparseIndices) {
    if (process.env.DREAM_GATE_GPU_PROBES === '0') return null;
    const ws = this._gpuClient;
    if (!ws || ws.readyState !== 1) { this._gateProbeRefused = (this._gateProbeRefused || 0) + 1; return null; }
    // ⛔ WAIT FOR THE SOCKET, DON'T REFUSE ON IT. A probe refused whenever more
    // than 256 KB sat in the send buffer, and teaching keeps that buffer fuller
    // than that almost continuously — measured live: `ok=2 miss=0 refused=61`.
    // Every refusal ran the probe on the CPU instead, which is the slow path and
    // eats the thread the walk feeds the card from. The buffer drains in tens of
    // ms at link speed, so the probe now waits up to 3 s for it and is refused
    // only if it never drains.
    if (!(await this._probeSocketDrained(ws))) {
      this._gateProbeRefused = (this._gateProbeRefused || 0) + 1;
      return null;
    }
    if (!sparseIndices || !sparseIndices.length) return null;
    try {
      // GATEGPU FIX (2026-08-21, convicted live: teachStageMax=gate:probe-gpu
      // at 35.2s/window with zero successes — every probe burned the full ack
      // timeout and fell to CPU, stretching one gate past 18 minutes). The
      // empty-pre BOUND propagate is a browser-donor form; the NATIVE donor's
      // propagate is STANDALONE-only (zero + scatter the GIVEN indices into
      // the matrix's own pre buffer, offsets 0) and never answers the bound
      // shape. So ship the probe pattern AS the type-2 pre payload — the
      // matrix-local standalone form both donors have executed since v0.3.11.
      // No resident slice write needed at all (cleaner: nothing shed-able,
      // nothing stale-able), and the probe times out FAST (8s) to the CPU
      // path instead of 30s.
      const _pT0 = Date.now();
      const out = await this.gpuSparsePropagate(matrixName, Uint32Array.from(sparseIndices), ws, 8_000, null, true);
      // Probe-latency window stats — the instrument that would have named the
      // 30s-timeout burn in one console read instead of a forensic dig.
      const _s = this._gateProbeStats || (this._gateProbeStats = { ok: 0, miss: 0, msSum: 0, logAt: 0 });
      if (out && out.length) { _s.ok++; _s.msSum += Date.now() - _pT0; } else { _s.miss++; }
      if (Date.now() - _s.logAt > 30_000 && (_s.ok + _s.miss) > 0) {
        console.log(`[Brain] gateProbe window — ok=${_s.ok} miss=${_s.miss} refused=${this._gateProbeRefused | 0} avg ok ${_s.ok ? Math.round(_s.msSum / _s.ok) : 0}ms (miss = fell to the CPU path)`);
        _s.logAt = Date.now(); _s.ok = 0; _s.miss = 0; _s.msSum = 0;
      }
      if (out && out.length) {
        this._gateProbeGpu = (this._gateProbeGpu || 0) + 1;
        if (!this._gateProbeLogOnce) {
          this._gateProbeLogOnce = true;
          console.log(`[Brain] GATE PROBES via donor: ON — probe indices ride the type-2 standalone propagate against the FULL GPU training mass, currents ride the ack (${out.length.toLocaleString()} rows this first read). Kill switch: DREAM_GATE_GPU_PROBES=0.`);
        }
        return out;
      }
      this._gateProbeNullAck = (this._gateProbeNullAck || 0) + 1;
      return null;
    } catch {
      this._gateProbeNullAck = (this._gateProbeNullAck || 0) + 1;
      return null;
    }
  },

  /**
   * GPUVERB.3 (donor v0.3.28) — PREDICTIVE-ERROR CORRECTION ON THE CARD.
   *
   * The last signed-magnitude CPU training lane. Its post term is a per-row
   * FLOAT error in [-1,1], which no existing verb could carry (spike buffers
   * are 0/1 u32) and which could not be shipped as a mask either — the error
   * vector is DENSE, ~48MB per pair at the 12M cortex, worse than the CPU pass
   * it would replace. So the donor computes the whole thing from its own
   * resident bound spikes: propagate → max-normalise → clamp(target − p, ±1) →
   * `w += lr·e·pre`, all in one dispatch chain. This frame carries no vectors:
   * ~60 bytes for a full-matrix correction.
   *
   * Frame: 'SPRS' | 14 | reqId | name | pad4 | lr f32 | wMin f32 | wMax f32.
   * Layout contract: donor-app/src/frames.rs case 14.
   *
   * Returns true only when the frame was actually SENT, so the caller runs its
   * CPU pass in full whenever the GPU did not carry the mass — the same posture
   * every other bound lane uses. Nothing is ever silently dropped.
   */
  gpuSparsePredictiveError(name, lr, wMin, wMax) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return false;
    if (!this._donorBucketReadout()) return false;   // same >= 0.3.28 binary
    try {
      const hdr = this._encodeSparseHeader(14, 0, name);
      const meta = Buffer.alloc(12);
      meta.writeFloatLE(lr, 0);
      meta.writeFloatLE(typeof wMin === 'number' ? wMin : -2.0, 4);
      meta.writeFloatLE(typeof wMax === 'number' ? wMax : 2.0, 8);
      const frame = Buffer.concat([hdr, meta]);
      if (!this._donorPatternSendGated(frame)) return false;
      this._countTeachOut(14, frame.length, 0, this._teachGopsFor(name, 2));  // TEACHCREDIT — propagate + weight write = two full-matrix passes
      this._predErrSent = (this._predErrSent || 0) + 1;
      if (!this._predErrLogOnce) {
        this._predErrLogOnce = true;
        console.log('[Brain] PREDICTIVE ERROR on the donor: ON (SPRS 14) — propagate + normalise + signed-error weight write all run on the card; the CPU keeps a sampled shadow.');
      }
      return true;
    } catch { return false; }
  },

  /**
   * GATEGPU.2 (v0.3.28) — does the PRIMARY donor speak the REDUCED readout
   * (SPRS type 15: propagate + on-card bucket-mean reduction)?
   */
  _donorBucketReadout() {
    const ws = this._gpuClient;
    if (!ws || ws.readyState !== 1) return false;
    const c = this.clients && this.clients.get ? this.clients.get(ws) : null;
    const v = c && c.donorAppVersion;
    if (!v) return false;
    if (this._bucketReadoutVer !== v) {
      this._bucketReadoutVer = v;
      const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v));
      this._bucketReadoutOk = !!m && ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3028; // 0.3.28
      console.log(`[Brain] REDUCED word readout for PRIMARY donor: ${this._bucketReadoutOk ? 'ON (SPRS 15 — bucket means computed on the card)' : 'off'} (requires >= 0.3.28, saw ${v}).`);
    }
    return !!this._bucketReadoutOk;
  },

  /**
   * GATEGPU.2 — ask the donor for sem→word_motor as PER-WORD-BUCKET MEANS.
   *
   * The emission argmax never wanted 720,000 raw currents (~2.9MB per spoken
   * word); it wanted the ~2,500 bucket means it reduced them to. The donor now
   * runs that reduction on the card and answers with an ordinary type=2 ack
   * whose payload is the means, so no new ack parser exists anywhere.
   *
   * Frame: 'SPRS' | 15 | reqId | name | pad4 | bucketSize u32 | bucketCount u32
   *        | count u32 | preIdx u32[].
   * Layout contract: donor-app/src/frames.rs case 15.
   *
   * Null on any honesty guard (no donor / too old / lane busy / empty pre) —
   * the caller then takes the full-current probe or its CPU shadow, exactly as
   * before. A reduced readout is never a reason to skip a word.
   */
  async gpuGateProbeBuckets(matrixName, sparseIndices, bucketSize, bucketCount) {
    if (process.env.DREAM_GATE_GPU_PROBES === '0') return null;
    if (!this._donorBucketReadout()) return null;
    const ws = this._gpuClient;
    if (!ws || ws.readyState !== 1) return null;
    if (!(await this._probeSocketDrained(ws))) return null;
    if (!sparseIndices || !sparseIndices.length) return null;
    if (!(bucketSize > 0) || !(bucketCount > 0)) return null;
    try {
      const idx = Uint32Array.from(sparseIndices);
      const reqId = this._nextSparseReqId();
      const hdr = this._encodeSparseHeader(15, reqId, matrixName);
      const meta = Buffer.alloc(12);
      meta.writeUInt32LE(bucketSize >>> 0, 0);
      meta.writeUInt32LE(bucketCount >>> 0, 4);
      meta.writeUInt32LE(idx.length >>> 0, 8);
      const frame = Buffer.concat([hdr, meta, Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength)]);
      const _t0 = Date.now();
      const result = await this._sparseSendBinary(frame, reqId, 8_000, ws);
      const out = result && result.currents ? result.currents : null;
      if (out && out.length > 0) {
        this._bucketProbeOk = (this._bucketProbeOk || 0) + 1;
        if (!this._bucketProbeLogOnce) {
          this._bucketProbeLogOnce = true;
          console.log(`[Brain] REDUCED READOUT LIVE — sem→word_motor answered as ${out.length.toLocaleString()} bucket means in ${Date.now() - _t0}ms; the dense form would have shipped the full post-region every spoken word.`);
        }
        return out;
      }
      this._bucketProbeMiss = (this._bucketProbeMiss || 0) + 1;
      return null;
    } catch {
      this._bucketProbeMiss = (this._bucketProbeMiss || 0) + 1;
      return null;
    }
  },

  async gpuSparsePropagateBound(name) {
    // DF.7 — when fan-out is ON, spread the bound propagate round-robin across
    // the pool so the idle replica GPUs compute (their resident state is kept
    // current by _mirrorCortexWriteToReplicas). Default: targetWs=null →
    // primary (today's exact behavior). Result routing is by reqId, so an ACK
    // from any donor resolves correctly.
    const target = this._df7FanoutPropagate() ? this._nextPoolDonor(name) : null;
    // PROPBOUND (2026-08-21) — the NATIVE donor never implemented the
    // empty-pre bound read; that is BROWSER-donor protocol (compute.html
    // reads its resident cluster buffer). The native donor's propagate is
    // STANDALONE-only: zero + scatter the GIVEN indices — so an empty-pre
    // frame propagates a ZERO pre vector and acks ALL-ZERO currents, which
    // consumers cached as real signal (`currents.length > 0` passes on a
    // zeros array). Convicted via GATEGPU's 30s-per-probe gate; the same
    // dead form served every per-tick bound propagate. When the chosen
    // donor is native, rebuild the bound semantics HONESTLY: the resident
    // spike state it would have read is the server's own lastSpikes mirror
    // — ship that src window's active indices as the standalone pre
    // payload. No mirror to read → null (the caller's CPU path computes),
    // never zeros wearing a success shape.
    const _ws = (target && target.readyState === 1) ? target : this._gpuClient;
    const _c = (this.clients && this.clients.get && _ws) ? this.clients.get(_ws) : null;
    // COMP.1b — the BOUND propagate IS the per-tick cache-fill path: its result
    // goes straight into `_cachedIntraCurrents` / `_cachedCrossCurrents`, whose
    // declared semantics are already keep-latest, so reusing one persistent
    // buffer per matrix is safe here and nowhere else. Key by matrix name so
    // each projection keeps its own.
    // ⛔ PROPBOUND.2 (2026-08-25) — THE REFUSAL IS COUNTED NOW.
    //
    // The rebuild above is correct and was verified four ways (the mirror is
    // written in the SAME call as the wire frame, coordinates match on both
    // sides, the clear path zeroes both, and the region fractions tile 1.000
    // so a full clear leaves no GPU-only residue). What it did NOT have was an
    // instrument: `return null` on an empty mirror sent every bound propagate
    // to the CPU **silently**, so "how often does this lane fall back?" was
    // unanswerable — and that is exactly the number RHYTHM3S.1 is hunting.
    //
    // ⚠ An empty mirror is NOT automatically a fault. Between teach writes the
    // cortex genuinely has no resident pattern, and refusing is the correct
    // behaviour there. It becomes a finding when it stays high *during* a
    // teach era, which is a comparison the board can only make if the number
    // exists. Counted by lane, so native-rebuild and browser-empty-pre can
    // never be read as one thing.
    if (!this._boundPropStats) {
      this._boundPropStats = { native: 0, emptyMirror: 0, browserEmptyPre: 0, noMirrorObject: 0, lastEmptyAt: 0, lastEmptyName: null };
    }
    const _bps = this._boundPropStats;
    // ⛔⛔ BOUNDCAP.1 (2026-08-25) — THE OLD TEST WAS `if (_c.donorAppVersion)`,
    // AND IT WAS TRUE FOR EVERY DONOR, SO THE BROWSER PATH BELOW WAS DEAD CODE.
    //
    // `gpu_register` stamps `client.donorAppVersion = _donorVer || 'browser'` —
    // a browser donor gets the truthy STRING `'browser'`, not a falsy value. So
    // the presence test selected the native rebuild for browser donors too, and
    // the empty-pre branch had been unreachable for any registered donor since
    // the PROPBOUND fix landed 2026-08-21.
    //
    // ⛔ Why that was not merely redundant: `compute.html`'s type=2 handler
    // reads the payload as a DENSE 0/1 spike array (`new Uint32Array(buf, off,
    // preLen)` → `writeSparsePreSpikes`), and `_boundPreIndicesFor` returns
    // INDICES. Sending indices where a dense vector is expected is not a
    // smaller signal, it is a DIFFERENT one — and `preLen === 0` is precisely
    // the browser's bound-mode trigger (compute.html:724), so a non-empty pre
    // also forced standalone mode on a matrix whose standalone buffers are not
    // allocated when it is cluster-bound. The fix for one donor type had become
    // a mirror image of the same bug on the other.
    //
    // ⭐ Decided by CAPABILITY now, not by identity. The question this routes on
    // is exactly "does this donor read its resident bound buffer when pre is
    // empty?" — so that is what is asked. `boundResidentRead` is advertised at
    // register (the `sparseV2` / `mindspaceV1` idiom); the explicit `'browser'`
    // sentinel keeps ALREADY-LOADED pages correct without waiting for a reload,
    // and it cannot silently flip the way a version-presence test did, because
    // the server itself writes that sentinel from the absence of a version.
    // ⚠ DELIBERATELY NOT `!this._donorIsNative(_ws)`, and this is not an
    // oversight to tidy up: that helper answers `false` for an UNREGISTERED
    // donor, so its negation would route an unknown donor to the empty-pre
    // path — the one that silently returns all-zero currents on a native
    // binary. The asymmetry is the safety property. Unknown must land on the
    // rebuild path, which refuses with `null` instead of inventing a signal.
    const _residentRead = (_ws && _ws._boundResidentRead === true)
      || !!(_c && _c.donorAppVersion === 'browser');
    if (!_residentRead) {
      const pre = this._boundPreIndicesFor(name);
      if (!pre || !pre.length) {
        // Split the two reasons: a MISSING mirror object is a wiring fault,
        // an EMPTY one is an idle cortex. Collapsing them would hide the
        // first behind the second, which is normal and constant.
        if (!pre) _bps.noMirrorObject++; else _bps.emptyMirror++;
        _bps.lastEmptyAt = Date.now();
        _bps.lastEmptyName = name;
        return null;
      }
      _bps.native++;
      return this.gpuSparsePropagate(name, pre, target, 30_000, `bound:${name}`);
    }
    _bps.browserEmptyPre++;
    return this.gpuSparsePropagate(name, new Uint32Array(0), target, 30_000, `bound:${name}`);
  },

  // PROPBOUND — the pre-index window a bound matrix would read donor-side,
  // rebuilt from the server's own resident mirror (cluster.lastSpikes).
  // Matrix-local coordinates: cross-projections are src-REGION-relative,
  // the intra matrix is cluster-absolute.
  _boundPreIndicesFor(name) {
    const cluster = this.cortexCluster;
    if (!cluster || !cluster.lastSpikes) return null;
    const prefix = `${cluster.name}_`;
    if (!name.startsWith(prefix)) return null;
    const projKey = name.slice(prefix.length);
    const spikes = cluster.lastSpikes;
    if (projKey === 'intraSynapses') {
      const idx = [];
      for (let i = 0; i < spikes.length; i++) { if (spikes[i]) idx.push(i); }
      return Uint32Array.from(idx);
    }
    const at = projKey.indexOf('_to_');
    if (at < 0) return null;
    const region = cluster.regions && cluster.regions[projKey.slice(0, at)];
    if (!region) return null;
    const idx = [];
    for (let i = region.start; i < region.end; i++) { if (spikes[i]) idx.push(i - region.start); }
    return Uint32Array.from(idx);
  },

  // ⛔ BOUNDCAP.1 — THE ONE OWNER OF "IS THIS DONOR THE NATIVE BINARY?".
  //
  // Two separate call sites had each written `if (client.donorAppVersion)` to
  // mean "native", and BOTH were wrong the same way: `gpu_register` stamps the
  // string `'browser'` for a browser donor, which is truthy, so every donor
  // read as native and each site's browser branch was dead code. Two instances,
  // one root cause — so the question gets one owner rather than a second
  // corrected copy.
  //
  // ⚠ Deliberately NOT a version comparison. Every other capability gate here
  // regex-parses a semver and gets browser-exclusion for free (`'browser'` does
  // not match `^\d+\.\d+\.\d+`), which is why those sites were never affected.
  // This one asks about the donor's KIND, not its age, so it tests the sentinel
  // the register handler actually writes.
  _donorIsNative(ws) {
    const c = (this.clients && this.clients.get && ws) ? this.clients.get(ws) : null;
    if (!c || !c.donorAppVersion) return false;   // unregistered / unknown — never assume native
    return c.donorAppVersion !== 'browser';
  },

  // TU.28.1 — shared soft-cap knob (same env knob as the TU.25.A hebbian
  // shed so ops tune ONE number: DREAM_WS_SOFT_SHED_MB, default 64).
  _donorSoftCapBytes() {
    const mb = Number(process.env.DREAM_WS_SOFT_SHED_MB) > 0
      ? Number(process.env.DREAM_WS_SOFT_SHED_MB) : 64;
    return mb * 1024 * 1024;
  },

  // DONOR-LINK CAP — the per-donor "keep the socket nearly empty" bound for
  // NEW work routing (hebbian batches via _nextPoolDonor) and replica mirror
  // frames. The soft cap above is a SHED line, not an operating point: gating
  // streams only at 64MB let the system park a weak-uplink donor's socket
  // just under 64MB indefinitely — 10s+ of queued bytes on a residential
  // link, so its heartbeat pong queued behind the backlog, measured RTT sat
  // at 10-14s, the Clients row went permanently RED, and _donorHealth floored
  // the card no matter what role it held. Routing new work only onto sockets
  // below THIS cap keeps every donor's buffer ~seconds-empty: each card takes
  // exactly the work its link can drain (equal donors, each at its own pace),
  // RTT stays real, and the red row heals. Tunable via DREAM_DF7_LINK_CAP_MB.
  _donorLinkCapBytes() {
    const mb = Number(process.env.DREAM_DF7_LINK_CAP_MB) > 0
      ? Number(process.env.DREAM_DF7_LINK_CAP_MB) : 4;
    return mb * 1024 * 1024;
  },

  // SHADOW-DIRTY single source of truth + real auto-heal. The shed paths used
  // to set a brain-level `_gpuShadowDirty` that NOTHING ever cleared — the
  // gpu_init re-confirm handler and the dashboard /resync button clear the
  // CORTEX-CLUSTER flag, so the dashboard's DIRTY banner (which displayed the
  // brain-level flag) latched ON after the first shed and the resync button
  // appeared dead even when the resync completed. All dirty-markers now land
  // on cortexCluster._gpuShadowDirty (the flag the confirm handler clears),
  // and every mark also ARMS the throttled auto-resync the comments always
  // promised: clear the one-time cortex upload gate so the next warm tick
  // re-uploads the CPU master (the TU.20.2 drain gate defers it until the
  // buffer drains). Throttled 60s + already-armed guarded so a shed storm
  // arms one resync, not a re-upload flood.
  // DEFERRED ARM — arming a resync WHILE the socket is saturated feeds the
  // exact storm it is meant to cure (live 9:17-9:26PM: pattern shed -> arm ->
  // resync pumps into the full socket -> more sheds; buffer pegged at the
  // 64MB cap for 9+ minutes, donor RTT 24s, the 85MB canonical upload could
  // never drain). Mark the shadow dirty immediately (honest telemetry), but
  // arm the actual resync only once the buffer has genuinely drained below
  // half the cap AND no canonical upload is in flight.
  _armShadowResyncDeferred(reason) {
    if (this.cortexCluster) this.cortexCluster._gpuShadowDirty = true;
    this._resyncArmPendingReason = reason;
    if (this._resyncArmPendingIv) return;
    this._resyncArmPendingIv = setInterval(() => {
      const ws = this._gpuClient;
      if (!ws || ws.readyState !== 1) return;
      if (this._cortexUploadInFlight) return;
      if (ws.bufferedAmount > this._donorSoftCapBytes() / 2) return;
      // DEFER TO A NON-TEACH PAUSE. The pattern lane holds the buffer at its
      // 16MB operating point — BELOW this half-softCap gate (32MB) — so the
      // gate alone passes mid-chunk and the 42s canonical re-upload fired as a
      // fresh teach freeze on top of active teaching (the reported 30s freeze).
      // A pattern-frame shed is EPHEMERAL (next iteration supersedes) and the
      // cross-projections stay GPU-current via hebbianBound dispatch, so this
      // shadow refresh is never urgent — hold it until teach is already paused.
      // Dream windows between chunks flip _curriculumInProgress false; the
      // re-upload then OVERLAPS that existing pause (near-zero marginal teach
      // downtime) and the shadow still refreshes every chunk boundary. Genuine
      // divergence events (donor drop / failover / hebbian-batch shed) resync
      // immediately via their own arms — they do NOT route through here.
      if (this._curriculumInProgress) return;
      clearInterval(this._resyncArmPendingIv);
      this._resyncArmPendingIv = null;
      const r = this._resyncArmPendingReason || 'sheds settled';
      this._resyncArmPendingReason = null;
      this._armShadowResync(`${r} — buffer drained + teach paused (deferred arm)`);
    }, 5000);
  },

  _armShadowResync(reason) {
    if (this.cortexCluster) this.cortexCluster._gpuShadowDirty = true;
    const now = Date.now();
    const alreadyArmed = (this._cortexGpuInitStarted === false) || (this._cortexUploadInFlight === true);
    if (alreadyArmed) return;
    // TEACH-TIME CADENCE — with the pattern lane at its low operating point
    // the buffer actually drains mid-teach, so resyncs become POSSIBLE while
    // teaching; at a 60s throttle the 85MB canonical re-upload would become
    // its own storm. 15min while the walk runs bounds the tax (~95KB/s
    // average) and still refreshes the GPU shadow 4x/hour. Dream windows
    // flip _curriculumInProgress false, so window-time resyncs keep the fast
    // 60s throttle and land in the natural drain slot. Per-matrix dirty
    // tracking stays the queued deep cure.
    const _resyncThrottleMs = this._curriculumInProgress
      ? (Number(process.env.DREAM_RESYNC_TEACH_THROTTLE_MS) > 0
          ? Number(process.env.DREAM_RESYNC_TEACH_THROTTLE_MS) : 900000)
      : 60000;
    if (this._shadowAutoResyncAt && (now - this._shadowAutoResyncAt) <= _resyncThrottleMs) return;
    this._shadowAutoResyncAt = now;
    // #16 — PER-MATRIX TARGETED RESYNC. When we know EXACTLY which matrices drifted
    // (the shed recorded their names in _gpuDirtyMatrices) AND every one is in the
    // replica registry AND a live primary's buffer is drained, re-upload ONLY those
    // via gpuSparseUpload instead of the full ~85MB initGpu canonical re-upload
    // (kills the resync tax). ANY uncertainty — empty/oversized set, an unknown
    // matrix name, no live donor, or a still-saturated buffer — FALLS THROUGH to
    // the full canonical re-upload below (non-regressing by construction). Clears
    // the dirty set + the shadow flag on a fully-successful targeted upload; a
    // failed matrix goes back in the set for a full resync on the next arm.
    const _ws = this._gpuClient;
    const _dirty = this._gpuDirtyMatrices;
    const _reg = this._replicaMatrixRegistry;
    const _drainGate = (typeof this._donorSoftCapBytes === 'function') ? this._donorSoftCapBytes() / 2 : 32 * 1024 * 1024;
    if (_ws && _ws.readyState === 1 && _reg
        && _dirty && _dirty.size > 0 && _dirty.size <= 8
        && _ws.bufferedAmount < _drainGate
        && [..._dirty].every((n) => _reg.has(n))) {
      const names = [..._dirty];
      this._gpuDirtyMatrices = new Set();
      Promise.all(names.map((n) => {
        const e = _reg.get(n);
        return this.gpuSparseUpload(n, e.matrix, e.binding, _ws).catch(() => {
          this._gpuDirtyMatrices.add(n);  // failed → re-dirty for a full resync next arm
          return null;
        });
      })).then(() => {
        if (this._gpuDirtyMatrices.size === 0 && this.cortexCluster) this.cortexCluster._gpuShadowDirty = false;
        console.log(`[Brain] #16 TARGETED RESYNC (${reason}) — re-uploaded ONLY the ${names.length} drifted matrix(es) [${names.join(', ')}] via gpuSparseUpload (not the full ~85MB). ${this._gpuDirtyMatrices.size === 0 ? 'shadow clean.' : this._gpuDirtyMatrices.size + ' failed → full resync next arm.'}`);
      }).catch(() => {});
      return;   // targeted path handled it — skip the full canonical re-upload
    }
    this._cortexGpuInitStarted = false;
    this._allClustersConfirmedAt = null;
    if (this.cortexCluster) this.cortexCluster._cortexFullyReady = false;
    console.error(`[Brain] AUTO-RESYNC ARMED (${reason}) — cortex re-uploads the CPU master (cross-projections + intra-synapses) once the ws buffer drains below the resync gate; _gpuShadowDirty clears when the donor re-confirms gpu_init. (throttle 60s)`);
  },

  // TU.28.1 — backpressure gate for the teach-pattern JSON stream
  // (write_spike_slice / write_current_slice / clear_spike_region).
  // ROOT CAUSE (live-box log audit): this stream was the ONLY donor-bound
  // producer with NO bufferedAmount guard — the TU.25.A soft-shed covers
  // hebbian batch frames and the 500MB await-drain covers sparse binary
  // uploads, but these per-teach-iteration JSON frames (8 region clears +
  // pattern writes per iteration, sustained thousands/sec during teach
  // phases) went straight to ws.send(). Result: ws.bufferedAmount
  // sawtoothed 68MB -> 1.6GB, the heartbeat ping queued behind gigabytes
  // (19s median RTT -> donor flagged unhealthy/red), and the compute.html
  // tab crashed under the receive backlog (~12min flap cycle), each crash
  // triggering a full re-init burst on top of the ongoing flood.
  // POLICY (matches TU.25.A): above the soft cap DROP the frame
  // immediately — never enqueue. The CPU is authoritative for all of this
  // state; the GPU shadow is marked dirty and re-converges via the armed
  // auto-resync once the buffer drains. Spike/current/clear slices are
  // per-iteration ephemeral (the next iteration's clear+write supersedes),
  // so a dropped frame costs one shadow-teach iteration, not correctness.
  // Gate probes are unaffected: gpuDrainWait() drains to 10MB (< cap)
  // before probe patterns fire, so probe writes pass the gate.
  // PATTERN LANE OPERATING POINT — cheap pre-check with NO payload built.
  // Two-part fix from the post-savestart live log read:
  //   (1) all three pattern call sites used to JSON.stringify BEFORE the
  //       gate — at saturation ~570 frames/s were serialized then thrown
  //       away (a real slice of the 2-8s [EventLoop] BLOCKED pins during
  //       teach). Call sites now check the lane FIRST; a shed frame costs
  //       zero serialization.
  //   (2) the lane used to gate at the 64MB SHED cap, which let the socket
  //       PARK just under 64MB for entire teach phases (the exact failure
  //       mode the _donorLinkCapBytes comment documents) — the deferred
  //       resync's drain-below-half-cap condition never arrived, so
  //       _gpuShadowDirty flapped permanently true and the canonical
  //       re-upload never got a window. Patterns are per-iteration
  //       ephemeral (the next iteration's clear+write supersedes; at
  //       saturation they were already 95%+ shed), so gating them at a LOW
  //       operating point costs nothing while letting the buffer actually
  //       drain: ACKs/pings stay fast and resyncs get a landing slot.
  //       Default 16MB stays ABOVE gpuDrainWait's 10MB probe drain point
  //       so gate-probe pattern writes still pass. The hebbian-batch lane
  //       (TU.25.A) keeps the full soft cap — those frames carry real
  //       weight deltas.
  _donorPatternLaneCapBytes() {
    const mb = Number(process.env.DREAM_PATTERN_LANE_CAP_MB) > 0
      ? Number(process.env.DREAM_PATTERN_LANE_CAP_MB) : 16;
    return Math.min(mb * 1024 * 1024, this._donorSoftCapBytes());
  },

  _donorPatternLaneOpen() {
    const ws = this._gpuClient;
    if (!ws || ws.readyState !== 1) return false;
    // UPLOAD PRIORITY — pattern frames yield the socket entirely while the
    // canonical sparse upload is in flight (same priority compute batches
    // give): a pattern-pegged buffer starved the 85MB intra upload past even
    // a 180s timeout because the per-chunk pacing low-water was never reached.
    if (this._cortexUploadInFlight) return false;
    // CHAT PRIORITY (CHAT.3, 2026-07-16) — while Unity is composing a live
    // reply, teach pattern frames yield the socket to the emission dispatches
    // (reported: replies took up to 30s with chat stuck behind the teach firehose).
    // Shed-safe by the same contract as the backpressure shed below: patterns
    // are per-iteration ephemeral, CPU authoritative, shadow re-converges.
    if (this._chatPriorityActive && this._chatPriorityActive()) return false;
    // IDLE GATE — with no active teach phase and no open cell these per-tick
    // mirror writes are pure pump (~50 frames/s at idle pegged the buffer for
    // 9+ minutes: 14k sheds, donor drowned at 24s RTT). Frames are ephemeral
    // (next iteration supersedes); the first real teach phase re-mirrors
    // everything it needs.
    const _cc2 = this.cortexCluster;
    if (_cc2 && !_cc2._activePhase && !_cc2._currentCellKey) {
      this._wsPatternIdleSkips = (this._wsPatternIdleSkips || 0) + 1;
      return false;
    }
    // TEACH-FLOOD THROTTLE — during an active teach primitive the curriculum
    // fires 8 region-clears + spike/current writes PER micro-iteration
    // (thousands/sec). On a LOCAL donor (127.0.0.1, same box) that flood
    // buries the donor app's worker thread in receive-processing: it can't
    // service its own socket (RTT blows to seconds) OR run compute (0 Gn/s),
    // so the server reads it unhealthy, ZOMBIE-KICKs it, and it reconnects
    // into a full canonical re-upload — a drop/re-upload/drown cycle that
    // never settles on a single donor. These frames are per-iteration
    // EPHEMERAL (next iteration's clear+write supersedes) and CPU is
    // authoritative (teach WEIGHT deltas ride the bound-Hebbian dispatch, NOT
    // this mirror), so at saturation they were already ~95% shed — the donor
    // never had per-iteration fidelity anyway. Rate-limiting to one frame per
    // THROTTLE_MS turns the flood into a paced trickle: the buffer actually
    // drains between frames, RTT + ACKs recover, and the donor's thread is
    // free to compute. Gated on a `_teach*` phase name only — gate probes /
    // K-STUDENT battery run with teach PAUSED (no `_teach*` activePhase), so
    // their pattern writes (drain-to-10MB then fire) are untouched; idle is
    // already handled above; canonical resync/upload rides its own lane.
    // ATOMIC PATTERN GROUPS (2026-08-15). A teach iteration is
    // clear -> write(s) -> hebbianBound, and the PS.1 stale guard rightly
    // refuses the Hebbian when any frame of that sequence is dropped. But the
    // pacing throttle below used to gate EVERY frame independently, so almost
    // every group lost at least one frame mid-flight and its Hebbian was
    // suppressed - measured live at ~33 suppressions/sec against 59 real
    // sheds. Honest, but a third of teaching was being refused by PACING, not
    // by saturation.
    //
    // The group is now the unit of admission: the FIRST frame of a group faces
    // the throttle (refuse whole, before any state ships); frames inside an
    // admitted group bypass pacing (the decision was already made); the group
    // closes at the hebbianBound dispatch (see gpuSparseHebbianBound) or after
    // a 500ms TTL so a hebbian-less path can never hold the lane open. The
    // donor stays protected by BOTH remaining mechanisms: the adaptive
    // back-off (computed from live bufferedAmount, it stretches the
    // inter-group interval the moment bytes pile up) and the 16MB lane cap
    // below, which still hard-stops a group mid-flight under true saturation
    // - staling that ONE group, the rare case instead of the common one.
    if (!this._patternGroup) this._patternGroup = { open: false, openedAt: 0 };
    const _pg = this._patternGroup;
    const _pgInside = _pg.open && (Date.now() - _pg.openedAt) < 500;
    const _ap = _cc2 && _cc2._activePhase;
    if (!_pgInside && _ap && typeof _ap.name === 'string' && _ap.name.startsWith('_teach')) {
      // DONOR-DROWN FIX (2026-08-14). The 20ms base let this lane put ~50
      // frames/sec on the wire, and these frames are NOT small: they carry
      // `sparseIndices` as JSON arrays of raw integers, measured at a
      // 153.1 KB AVERAGE on the live box (11,089 MB out in 47 min = 3.87
      // MB/s sustained). The donor could not drain that: RTT climbed to
      // 6.3s, its socket parked at 19.4MB, it was flagged unhealthy, and
      // `compute_batch` stopped completing entirely — `gpuHits` frozen and
      // `totalSpikes` frozen for minutes, i.e. her neurons stopped firing
      // while the teach loop kept hammering.
      //
      // Two changes:
      //  (1) base 20ms -> 100ms. These frames are per-iteration EPHEMERAL
      //      (the next iteration's clear+write supersedes) and at
      //      saturation they were already ~100% shed — 110 sheds/sec — so
      //      pacing them costs nothing real and returns the link to the
      //      traffic that DOES matter (compute_batch, hebbian deltas, acks,
      //      pings).
      //  (2) ADAPTIVE back-off. A fixed throttle cannot know the link is
      //      drowning; it kept firing into a full socket and let the shed
      //      counter absorb the lie. Scale the interval by how far the
      //      donor's buffer is past its link cap, and by a high smoothed
      //      RTT — so a struggling donor self-paces and recovers instead of
      //      being held under. Bounded at 16x so this can never become an
      //      effective mute.
      const _baseThrottle = Number(process.env.DREAM_PATTERN_TEACH_THROTTLE_MS) > 0
        ? Number(process.env.DREAM_PATTERN_TEACH_THROTTLE_MS)
        // BASE 100ms -> 15ms (2026-08-15). The 100ms constant - not the link -
        // was what still refused teaching: bufferedAmount read 0.0MB
        // continuously while ~29 Hebbians/sec were suppressed, because one
        // teach call writes 2-3 pattern groups and the second landed inside
        // the fixed window. The UNPRESSURED cadence belongs to the link's
        // measured state now: the adaptive mult (live buffer + smoothed RTT,
        // up to 16x), the 16MB lane cap (stales a group under true
        // saturation), and the walk pacing gate together govern the rate.
        // A healthy link takes every group; a choking one slows the walk.
        // BASE 15ms -> 3ms (2026-08-16, post-v0.3.16 template frames). The
        // frames this throttle guards are now ~1-15KB (t10 templates + t7
        // spikes), not 150-840KB: measured post-deploy, buffer 0.0MB and RTT
        // 173ms while ~128 Hebbians/sec were STILL suppressed by this
        // constant alone (zero sheds, zero pressure). At KB frames even the
        // 3ms ceiling (~333 groups/s ≈ 5MB/min worst case) cannot refill the
        // 16MB cliff, and the quadratic brake still owns any real pressure.
        : 3;
      let _mult = 1;
      let _bufGate = 0;   // live buffered bytes — queue-gates the base refusal below
      try {
        const _linkCap = this._donorLinkCapBytes();
        const _buf = (typeof ws.bufferedAmount === 'number') ? ws.bufferedAmount : 0;
        _bufGate = _buf;
        // QUADRATIC BRAKE, EARLY AND STEEP (2026-08-15). The linear
        // `min(16, buf/linkCap)` law had a 240ms ceiling once the base dropped
        // to 15ms - not enough to hold a bursting lane, so the buffer sawtoothed
        // into the 16MB shed cliff (measured live: 12.9MB -> 16.4MB -> 0.0MB)
        // and every shed staled a group and suppressed its Hebbian. Braking now
        // rises with the SQUARE of pressure from a 2MB reference: 2MB -> 15ms,
        // 4MB -> 60ms, 8MB -> ~1s, >=11MB -> ~2s ceiling. Full force arrives
        // well before the cliff; an empty lane still runs at the 15ms base.
        const _brakeRef = 2 * 1024 * 1024;
        if (_buf > _brakeRef) _mult = Math.min(133, Math.pow(_buf / _brakeRef, 2));
        const _pc = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
        const _rtt = (_pc && typeof _pc.rttMs === 'number') ? _pc.rttMs : 0;
        // RTT term QUEUE-GATED (2026-08-16). The old premise — ">1s RTT means
        // our own frames are already queued deep on this link" — was written
        // when this lane shipped 150-840KB frames and the buffer parked at
        // 16-19MB. Post-template wire (t10/t11, KB-scale) the buffer reads
        // 0.0MB continuously while the donor's heartbeat RTT reads 1-3.5s
        // BECAUSE IT IS COMPUTING 12M matrices — compute latency, not queue
        // depth. Braking on RTT with an empty buffer inflated per-group
        // admission ~3.5× across ~350 pattern groups/word ≈ 3.7s/word of
        // pure pacing wait (the measured wall-vs-layers gap) AND staled the
        // lane on every refusal (the climbing hebbianSuppressedStale on an
        // empty wire). The RTT term now only amplifies when there is REAL
        // queue depth to protect (≥256KB buffered — ours to drain); an empty
        // lane runs at the base + quadratic buffer brake alone.
        if (_rtt > 1000 && _buf > 262144) _mult = Math.min(133, Math.max(_mult, _rtt / 1000));
      } catch { /* non-fatal — fall back to the flat base throttle */ }
      const THROTTLE_MS = Math.round(_baseThrottle * _mult);
      // BASE REFUSAL QUEUE-GATED (2026-08-17) — the same law the RTT term got
      // above, applied to the 3ms base. A refusal here marks the lane STALE,
      // and stale now clears ONLY on an explicit clear_spike_region send —
      // rare since region clears were scoped (measured live: 217 t9 frames in
      // ~an hour) — so one 3ms refusal on an EMPTY wire poisoned the lane for
      // a whole stale window and suppressed every dependent hebbianBound
      // behind it (measured live: 29,404 suppressions at buffer 0.0MB with
      // sheds 0 — ~20/s of GPU training mass dropped across cross-projection
      // AND intra dispatches). At KB-scale template frames the 3ms floor
      // guards nothing the quadratic brake + 16MB lane cap don't already own;
      // the refusal (and its stale poison) now engages only when ≥256KB of
      // OUR frames are actually buffered — real pressure, the case this guard
      // was built for. Under pressure the pacing law is byte-identical.
      if (_bufGate > 262144 && this._wsPatternLastSendMs && (Date.now() - this._wsPatternLastSendMs) < THROTTLE_MS) {
        this._wsPatternThrottleSkips = (this._wsPatternThrottleSkips || 0) + 1;
        // A throttled frame breaks the in-flight pattern exactly as a shed one
        // does - the write never reaches the GPU spike buffer the bound Hebbian
        // is about to read. Same treatment.
        this._patternLaneStale = true;
        if (_mult > 1 && (!this._wsPatternBackoffLogMs || (Date.now() - this._wsPatternBackoffLogMs) > 30000)) {
          this._wsPatternBackoffLogMs = Date.now();
          console.warn(`[Brain] pattern-lane ADAPTIVE BACK-OFF ×${_mult.toFixed(1)} (throttle ${THROTTLE_MS}ms) — donor buffer ${((ws.bufferedAmount || 0) / 1048576).toFixed(1)}MB over its link cap. Teach patterns are ephemeral; yielding the link so compute_batch + acks + pings drain. Rate-limited 30s.`);
        }
        return false;
      }
    }
    const laneCap = this._donorPatternLaneCapBytes();
    if (ws.bufferedAmount > laneCap) {
      this._wsPatternShedCount = (this._wsPatternShedCount || 0) + 1;
      // PATTERN LANE IS NOW LOAD-BEARING (2026-08-15).
      //
      // The justification that used to sit here - "dropping is safe, CPU
      // authoritative, the shadow re-converges" - was written when the CPU
      // shadow performed the real Hebbian and the GPU was a mirror. The
      // GPU-only change removed the CPU teach path entirely, and these frames
      // are NOT a mirror: `hebbianBound` reads its pre/post patterns straight
      // out of the GPU spike buffer that write_spike_slice / write_current_slice
      // / clear_spike_region populate. Shedding one therefore does not discard a
      // redundant copy - it leaves the PREVIOUS iteration's pattern in place, so
      // the next bound-Hebbian dispatch trains the wrong association. That is
      // worse than losing the update: it actively corrupts weights, silently.
      //
      // So a shed marks the lane STALE, and `gpuSparseHebbianBound` refuses to
      // dispatch until a fresh clear_spike_region re-establishes a known
      // pattern. Losing an update is acceptable; training a lie is not.
      this._patternLaneStale = true;
      // A mid-group cap overrun kills the WHOLE group - close it so the next
      // frame faces admission again instead of riding a dead group's bypass.
      if (this._patternGroup) this._patternGroup.open = false;
      // A shed PATTERN frame does NOT dirty the weight shadow - DO NOT arm a
      // resync here. The old `_armShadowResyncDeferred` call set
      // `_gpuShadowDirty` on every shed, and a heavy cell sheds thousands of
      // frames per phase, re-arming faster than the pause-gated resync could
      // ever clear it - so the "GPU shadow DIRTY" banner flapped permanently
      // true the instant a cell started. Real weight-delta drops (the TU.25.A
      // hebbian-batch shed) and genuine divergence route through their own arms.
      const now = Date.now();
      if (!this._wsPatternShedLogMs || (now - this._wsPatternShedLogMs) > 30000) {
        this._wsPatternShedLogMs = now;
        console.warn(`[Brain] teach-pattern frame SHED: ws.bufferedAmount=${(ws.bufferedAmount / 1024 / 1024).toFixed(1)}MB > ${(laneCap / 1024 / 1024)}MB pattern-lane cap. THIS COSTS TEACHING - the bound-Hebbian dispatch reads its pre/post from the buffer these frames write, so the lane is marked STALE and the dependent Hebbian is SUPPRESSED rather than fired on a stale pattern. ${this._wsPatternShedCount} frames shed / ${this._hebbianSuppressedStale || 0} Hebbian dispatches suppressed since boot (rate-limited 30s).`);
      }
      return false;
    }
    return true;
  },

  /**
   * WALK PACED TO THE DONOR (2026-08-15, operator-chosen trade).
   *
   * The walk taught ~32 iterations/sec while the donor link absorbs ~10
   * pattern groups/sec, so two thirds of GPU teaching could not fit through
   * the pipe no matter how admission was arranged - corrupt before the stale
   * guard, honestly refused after it, never actually taught. The operator
   * chose correctness over speed: every teach iteration WAITS for lane
   * admission before it starts, so its whole pattern ships and its Hebbian
   * fires on exactly the pattern it was meant for. The walk runs at the
   * donor's real absorption rate (~3x longer) and nothing is lost.
   *
   * Awaited by the curriculum's substrate gate on every teach call. Uses the
   * SAME base throttle and the SAME adaptive back-off the lane's own admission
   * uses, so this waits precisely as long as the first frame would have been
   * refused - no second pacing policy to drift out of agreement. Returns
   * immediately when the donor socket is not open; the substrate gate owns
   * that case and pauses the walk properly.
   */
  async _patternLaneWait() {
    const base = (typeof process !== 'undefined' && Number(process.env?.DREAM_PATTERN_TEACH_THROTTLE_MS) > 0)
      ? Number(process.env.DREAM_PATTERN_TEACH_THROTTLE_MS)
        // BASE 100ms -> 15ms (2026-08-15). The 100ms constant - not the link -
        // was what still refused teaching: bufferedAmount read 0.0MB
        // continuously while ~29 Hebbians/sec were suppressed, because one
        // teach call writes 2-3 pattern groups and the second landed inside
        // the fixed window. The UNPRESSURED cadence belongs to the link's
        // measured state now: the adaptive mult (live buffer + smoothed RTT,
        // up to 16x), the 16MB lane cap (stales a group under true
        // saturation), and the walk pacing gate together govern the rate.
        // A healthy link takes every group; a choking one slows the walk.
        // BASE 15ms -> 3ms (2026-08-16) — same law as the admission gate above;
        // see that site's rationale (KB-scale frames post-v0.3.16 templates).
        : 3;
    for (;;) {
      const ws = this._gpuClient;
      if (!ws || ws.readyState !== 1) return;
      let mult = 1;
      let bufNow = 0;
      try {
        // SAME quadratic brake as the lane's own admission (see
        // _donorPatternLaneOpen) - one law at both governors so the walk waits
        // exactly as long as the lane would refuse. Includes the RTT term the
        // first version of this method was missing.
        const buf = (typeof ws.bufferedAmount === 'number') ? ws.bufferedAmount : 0;
        bufNow = buf;
        const brakeRef = 2 * 1024 * 1024;
        if (buf > brakeRef) mult = Math.min(133, Math.pow(buf / brakeRef, 2));
        const pc = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
        const rtt = (pc && typeof pc.rttMs === 'number') ? pc.rttMs : 0;
        // QUEUE-GATED like the admission gate above (one law at both
        // governors): RTT amplifies the brake only when ≥256KB of OUR frames
        // are actually buffered — an empty lane's RTT is donor compute
        // latency, not congestion, and braking on it paced the whole walk.
        if (rtt > 1000 && buf > 262144) mult = Math.min(133, Math.max(mult, rtt / 1000));
      } catch { /* pace on the flat base */ }
      const dueAt = (this._wsPatternLastSendMs || 0) + Math.round(base * mult);
      let overCap = false;
      try { overCap = ws.bufferedAmount > this._donorPatternLaneCapBytes(); } catch { overCap = false; }
      // QUEUE-GATED like the admission refusal (2026-08-17, one law at both
      // governors): with <256KB buffered the lane admits every group, so
      // there is nothing to wait for — the base window only paces under
      // real queue depth. Over-cap still holds the walk regardless.
      if (bufNow <= 262144 && !overCap) return;
      const waitMs = dueAt - Date.now();
      if (waitMs <= 0 && !overCap) return;
      await new Promise((r) => setTimeout(r, Math.min(100, Math.max(5, waitMs > 0 ? waitMs : 25))));
    }
  },

  _donorPatternSendGated(json) {
    // ⛔⛔ ORDERING FLUSH — THE BOUND-HEBBIAN QUEUE GOES OUT BEFORE THE NEXT
    // PATTERN, OR THE CARD TRAINS EVERY QUEUED OP ON THE WRONG PAIR.
    //
    // Bound Hebbian ops carry no pre/post of their own: the card applies them
    // to whatever pattern is resident in the bound spike window WHEN THEY RUN.
    // They wait in `_boundHebbianBatch` for up to 20 ms, while every pattern
    // frame (clear, spike write, template) goes out the moment it is made. A
    // pair-teach takes ~9.6 ms (300 words / 67,556 pair updates / 649.5 s on
    // the last walk), so the next pair's clear-and-write regularly reached the
    // card AHEAD of the previous pair's Hebbian, and those ops trained the next
    // pair's pattern. Every frame that changes or reads the resident pattern
    // passes through here, so flushing here restores the order the teach loop
    // produced — for every donor version, bundled or not.
    if (this._boundHebbianBatch && this._boundHebbianBatch.ops.length) {
      this._boundHebbianOrderFlushes = (this._boundHebbianOrderFlushes || 0) + 1;
      this._flushBoundHebbianBatch(true);
    }
    if (!this._donorPatternLaneOpen()) return false;
    this._gpuClient.send(json);
    // Stamp the actual send so the TEACH-FLOOD THROTTLE (above) paces off the
    // last frame that truly went out, not off shed/throttled attempts.
    this._wsPatternLastSendMs = Date.now();
    // A frame that actually went out while a group was not open OPENS one -
    // the admission decision was just made above, and the rest of this teach
    // iteration's frames ride it without re-facing the pacing gate.
    if (!this._patternGroup) this._patternGroup = { open: false, openedAt: 0 };
    if (!this._patternGroup.open) { this._patternGroup.open = true; this._patternGroup.openedAt = Date.now(); }
    return true;
  },

  /**
   * TEACH BUNDLE (donor v0.3.43, SPRS type 16) — one socket message per event-
   * loop turn instead of one per teach frame.
   *
   * A pair-teach puts ~10-20 small frames on the wire (region clears, spike
   * templates, their pseudo-cluster twins, the masked lateral op, the bound
   * Hebbian batch). Each one was its own WebSocket message: a send on this
   * thread, a frame parse and a wake-up on the donor's single receive thread,
   * and — over a tunnel — its own trip through every hop. The card itself
   * finishes each kernel in microseconds and then waits for the next message,
   * which is why a rented card read ~20% busy.
   *
   * ⭐ INSTALLED ON THE SOCKET'S OWN `send`, SO ORDER CANNOT BREAK. Fire-and-
   * forget SPRS frames (types 5, 7-14) are appended in the order they were
   * produced; ANY other send to this socket — JSON, an acked propagate, an
   * upload, a send with a callback — flushes the bundle first and then goes out
   * itself. The donor unpacks a bundle and routes each inner frame through the
   * exact path it takes arriving alone, so the GPU executes identical work in
   * identical order. Acked inner frames (type 5) still ack by reqId.
   *
   * Flushed at the end of the current macrotask (`setImmediate`), at 1 MiB, or
   * at 4,096 frames — whichever comes first. A one-frame "bundle" goes out as
   * the plain frame. `DREAM_TEACH_BUNDLE=0` disables it.
   */
  _installTeachBundler(ws) {
    if (!ws || ws._teachBundle || typeof ws.send !== 'function') return;
    if (process.env.DREAM_TEACH_BUNDLE === '0') return;
    const raw = ws.send.bind(ws);
    const BUNDLEABLE = new Set([5, 7, 8, 9, 10, 11, 12, 13, 14, 17]);
    const MAX_BYTES = 1 << 20;
    const MAX_FRAMES = 4096;
    const B = { frames: [], bytes: 0, scheduled: false, messages: 0, framesBundled: 0, framesAlone: 0 };
    ws._teachBundle = B;
    const flush = () => {
      B.scheduled = false;
      const list = B.frames;
      const n = list.length;
      if (!n) return;
      B.frames = [];
      B.bytes = 0;
      if (ws.readyState !== 1) return;
      try {
        if (n === 1) { raw(list[0]); B.framesAlone++; return; }
        const parts = [this._encodeSparseHeader(16, 0, '')];
        const count = Buffer.alloc(4);
        count.writeUInt32LE(n, 0);
        parts.push(count);
        for (const f of list) {
          const len = Buffer.alloc(4);
          len.writeUInt32LE(f.length, 0);
          parts.push(len, f);
          const pad = (4 - (f.length % 4)) % 4;
          if (pad) parts.push(Buffer.alloc(pad));
        }
        raw(Buffer.concat(parts));
        B.messages++;
        B.framesBundled += n;
      } catch { /* a closing socket — the frames die with it, as they would unbundled */ }
    };
    ws._teachBundleFlush = flush;
    ws.send = (data, ...rest) => {
      if (rest.length === 0 && Buffer.isBuffer(data) && data.length > 4
          && data[0] === 0x53 && data[1] === 0x50 && data[2] === 0x52 && data[3] === 0x53
          && BUNDLEABLE.has(data[4])) {
        B.frames.push(data);
        B.bytes += data.length;
        if (B.bytes >= MAX_BYTES || B.frames.length >= MAX_FRAMES) flush();
        else if (!B.scheduled) { B.scheduled = true; setImmediate(flush); }
        return;
      }
      flush();
      return raw(data, ...rest);
    };
    console.log('[Brain] TEACH BUNDLE on for this donor (SPRS 16) — fire-and-forget teach frames ride one message per event-loop turn, in order. DREAM_TEACH_BUNDLE=0 disables.');
  },

  /**
   * LESSON (donor v0.3.44, SPRS type 17) — one rep of an association lesson in
   * one frame. The card expands it (`expand_lesson`, frames.rs) into exactly the
   * step sequence the per-pair path sends; see the layout there. `spec`:
   *   { cluster, twin|null, sem, motor, tag, semGroup, semSize, motorGroup,
   *     motorSize, tagRowStart, tagLen, posOps:[[name,lr]], antiOps:[[name,lr]],
   *     lateral:{matrix,lr,numBuckets,bucketSize,motorStartAbs}|null,
   *     pairs:[[semDims[], motorDims[], wrongDims[]|null]] }
   * Returns true only when the frame was SENT (primary speaks it and the
   * pattern lane admitted it) — the caller runs the per-pair path otherwise, so
   * a refused lesson is never a lost one.
   */
  encodeTeachLesson(spec) {
    const str = (s) => {
      const b = Buffer.from(String(s || ''), 'utf8');
      const pad = (4 - ((4 + b.length) % 4)) % 4;
      const out = Buffer.alloc(4 + b.length + pad);
      out.writeUInt16LE(b.length, 0);
      b.copy(out, 4);
      return out;
    };
    const u32 = (...v) => { const b = Buffer.alloc(4 * v.length); v.forEach((x, i) => b.writeUInt32LE(x >>> 0, 4 * i)); return b; };
    const f32 = (x) => { const b = Buffer.alloc(4); b.writeFloatLE(x, 0); return b; };
    const parts = [this._encodeSparseHeader(17, spec.reqId >>> 0, spec.cluster),
      str(spec.twin || ''), str(spec.sem), str(spec.motor), str(spec.tag),
      u32(spec.semGroup, spec.semSize, spec.motorGroup, spec.motorSize, spec.tagRowStart, spec.tagLen)];
    const cnt = Buffer.alloc(4);
    cnt.writeUInt16LE(spec.posOps.length, 0);
    cnt.writeUInt16LE(spec.antiOps.length, 2);
    parts.push(cnt);
    for (const [n, lr] of spec.posOps) parts.push(str(n), f32(lr));
    for (const [n, lr] of spec.antiOps) parts.push(str(n), f32(lr));
    const L = spec.lateral;
    parts.push(u32(L ? 1 : 0));
    if (L) parts.push(str(L.matrix), f32(L.lr), u32(L.numBuckets, L.bucketSize, L.motorStartAbs));
    parts.push(u32(spec.pairs.length));
    for (const [s, m, w] of spec.pairs) {
      const nw = w ? w.length : 0xFFFF;
      const dims = [...s, ...m, ...(w || [])];
      const body = Buffer.alloc(8 + 2 * dims.length + ((4 - ((2 * dims.length) % 4)) % 4));
      body.writeUInt16LE(s.length, 0); body.writeUInt16LE(m.length, 2); body.writeUInt16LE(nw, 4);
      dims.forEach((d, i) => body.writeUInt16LE(d, 8 + 2 * i));
      parts.push(body);
    }
    return Buffer.concat(parts);
  },

  /**
   * v0.3.45 — LESSON PACING. Lessons are fire-and-forget, so without a bound a
   * card can be handed an unlimited queue of them: measured, the local card's
   * pong RTT reached 7 s under teaching and the heartbeat killed it. A 0.3.45
   * donor acks each lesson when its WORKER finishes it; the curriculum awaits
   * `lessonSlot()` before sending, so at most `DREAM_LESSON_INFLIGHT` (default 4)
   * are queued on the card — it runs flat out and its queue never grows. An
   * in-flight entry older than 60 s (a card that died mid-lesson) is dropped so
   * a lost ack can never wedge the walk; a change of cortex owner clears all.
   */
  _donorAcksLessons() {
    const ws = this._gpuClient;
    const c = ws && this.clients && this.clients.get ? this.clients.get(ws) : null;
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String((c && c.donorAppVersion) || ''));
    return !!m && ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3045;
  },
  /**
   * ⭐ THE WINDOW IS SIZED TO THE LINK, NOT A CONSTANT. A fixed 4 is right for a
   * card on this machine and starves a remote one: with ~200 ms round trip and
   * ~7 ms of card work per lesson, 4 in flight keeps a rented card busy ~15% of
   * the time — the "lossy 20%" the lesson verb was built to end. Bandwidth-delay
   * product: in flight = ceil(fastest ack latency / card time per lesson) + 2,
   * clamped [4, 64]. Both are measured from the acks: the latency FLOOR (the
   * fastest of the last 200, so a queue that grows cannot inflate its own
   * window) and the card's service time (the spacing of acks while the window
   * was full). Still bounded — the queue can never grow without limit, which is
   * the jam this pacing exists to prevent. `DREAM_LESSON_INFLIGHT` pins it.
   */
  _lessonWindow() {
    const pin = Number(process.env.DREAM_LESSON_INFLIGHT);
    if (pin > 0) return Math.floor(pin);
    const lat = Array.isArray(this._lessonLatRing) && this._lessonLatRing.length >= 8 ? Math.min(...this._lessonLatRing) : null;
    // ⛔ The ack spacing measured while the window is full is NOT the card's
    // time per lesson once the window is too small for the link: a full window
    // of W lessons acks every latency/W, so the spacing reads latency/W and the
    // window settles at W+2 — circular. Measured: window 6, spacing 65 ms, the
    // rented card at 5% while it spent ~20 ms a lesson. The card's own measured
    // time per lesson (`lesson_cost`) is the true service time; the window uses
    // the smaller of the two.
    let svc = this._lessonSvcEmaMs;
    try {
      const costs = Object.values(this._lessonCost || {}).map((c) => c && c.msPerLesson).filter((v) => v > 0);
      if (costs.length) { const cardMs = Math.min(...costs); svc = svc > 0 ? Math.min(svc, cardMs) : cardMs; }
    } catch { /* fall back to the ack spacing */ }
    const _adapt = this._lessonWinAdapt || 4;
    if (!(lat > 0) || !(svc > 0)) return Math.max(4, _adapt);
    return Math.max(4, _adapt, Math.min(64, Math.ceil(lat / svc) + 2));
  },
  async lessonSlot() {
    if (!this._donorAcksLessons()) return;
    const max = this._lessonWindow();
    this._lessonWindowNow = max;
    if (!(this._lessonInflight instanceof Map)) this._lessonInflight = new Map();
    const t0 = Date.now();
    for (;;) {
      const now = Date.now();
      for (const [id, e] of this._lessonInflight) {
        if (e.ws !== this._gpuClient || (now - e.at) > 60000) { this._lessonInflight.delete(id); this._lessonAckLost = (this._lessonAckLost || 0) + 1; }
      }
      if (this._lessonInflight.size < max) break;
      await new Promise((r) => { this._lessonWake = r; setTimeout(r, 50); });
    }
    const waited = Date.now() - t0;
    if (waited > 0) { this._lessonSlotWaitMs = (this._lessonSlotWaitMs || 0) + waited; this._lessonSlotWaits = (this._lessonSlotWaits || 0) + 1; }
  },
  _lessonAcked(reqId, ws) {
    const e = this._lessonInflight instanceof Map ? this._lessonInflight.get(reqId) : null;
    // MULTI-CARD — wait for every holder; the slowest one's ack completes it.
    if (e && e.acked) {
      if (ws) e.acked.add(ws);
      if (e.acked.size < (e.need || 1)) return;
    }
    if (e) {
      const now = Date.now();
      const full = this._lessonInflight.size >= (this._lessonWindowNow || 4);
      if (!Array.isArray(this._lessonLatRing)) this._lessonLatRing = [];
      const _lat = Math.max(1, now - e.at);
      this._lessonLatRing.push(_lat);
      if (this._lessonLatRing.length > 200) this._lessonLatRing.shift();
      // ⭐ KEEP THE CARD FED. A lesson's ack time is the round trip plus how
      // long it waited in the card's queue. While that wait is under
      // DREAM_LESSON_QUEUE_MS (1000) the card has run dry at some point, so one
      // more lesson is allowed in flight; once lessons wait more than twice that,
      // the queue is deep enough and the window backs off 10%. The card ends up
      // with about a second of work queued at all times — busy, never starved,
      // and its pong never stuck behind an unbounded queue.
      {
        const _floor = Math.min(...this._lessonLatRing);
        const _q = Number(process.env.DREAM_LESSON_QUEUE_MS) > 0 ? Number(process.env.DREAM_LESSON_QUEUE_MS) : 1000;
        const w = this._lessonWinAdapt || 4;
        if (_lat < _floor + _q) this._lessonWinAdapt = Math.min(256, w + 1);
        else if (_lat > _floor + 2 * _q) this._lessonWinAdapt = Math.max(4, Math.floor(w * 0.9));
        else this._lessonWinAdapt = w;
      }
      // Ack spacing is the card's own time per lesson only while it had a
      // queue — an idle card's gaps measure the curriculum, not the GPU.
      // ⚠ MEDIAN, not a mean: an under-sized window acks in bursts (lessons
      // spaced by card time, then one round-trip-long gap before the next burst),
      // and a mean would fold that gap in and keep the window small forever.
      if (full && this._lessonLastAckAt) {
        if (!Array.isArray(this._lessonGapRing)) this._lessonGapRing = [];
        this._lessonGapRing.push(Math.max(0.2, now - this._lessonLastAckAt));
        if (this._lessonGapRing.length > 64) this._lessonGapRing.shift();
        const s = this._lessonGapRing.slice().sort((a, b) => a - b);
        this._lessonSvcEmaMs = s[Math.floor(s.length / 2)];
      }
      this._lessonLastAckAt = now;
    }
    if (this._lessonInflight instanceof Map && this._lessonInflight.delete(reqId)) {
      this._lessonAcks = (this._lessonAcks || 0) + 1;
      const w = this._lessonWake; this._lessonWake = null;
      if (typeof w === 'function') w();
    }
  },

  gpuTeachLesson(spec) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return false;
    if (!this._donorSpeaksLessonNow()) return false;
    try {
      const paced = this._donorAcksLessons();
      const reqId = paced ? this._nextSparseReqId() : 0;
      const frame = this.encodeTeachLesson({ ...spec, reqId });
      if (!this._donorPatternSendGated(frame)) return false;
      if (paced) {
        if (!(this._lessonInflight instanceof Map)) this._lessonInflight = new Map();
        // MULTI-CARD — the lesson is copied to every slice holder; it is done
        // only when ALL of them have acked, so the slowest card paces the send
        // and no card's queue can grow without bound.
        const need = this._intraSliceActive() ? this._intraSliceHolders().length : 1;
        this._lessonInflight.set(reqId, { ws: this._gpuClient, at: Date.now(), need, acked: new Set() });
      }
      // TEACHCREDIT for lessons — each pair runs Bound + the lateral Masked step
      // over the intra matrix (every row), so two full passes of its stored
      // synapses per pair. The accrual shares this by slice rows across holders.
      this._countTeachOut(17, frame.length, 0, this._teachGopsFor('cortex_intraSynapses', 2 * spec.pairs.length));
      // ⭐ Credit the card on its own row. `teachOps` was bumped only in
      // `_sparseSendBinary` (the acked lane), and lessons go fire-and-forget, so
      // a card running every lesson read `idle` on the Clients table — the
      // TEACHMIRROR.1 lie again, one lane over. One op per pair: each pair is the
      // same work a per-pair dispatch used to be.
      try {
        // Every slice holder runs the lesson, so every holder's row is credited.
        const _holders = this._intraSliceActive() ? this._intraSliceHolders() : [this._gpuClient];
        for (const _hw of _holders) {
          const _tc = this.clients && this.clients.get ? this.clients.get(_hw) : null;
          if (_tc && _tc.isGPU) { _tc.teachOps = (_tc.teachOps || 0) + spec.pairs.length; _tc.teachOpsAt = Date.now(); }
        }
      } catch { /* the row is an instrument; it must never stop a lesson */ }
      this._lessonsSent = (this._lessonsSent || 0) + 1;
      this._lessonPairsSent = (this._lessonPairsSent || 0) + spec.pairs.length;
      return true;
    } catch (e) {
      if (!this._lessonEncodeWarned) { this._lessonEncodeWarned = true; console.warn(`[Brain] lesson encode failed (per-pair path used): ${e.message}`); }
      return false;
    }
  },

  /**
   * ⭐⭐ LESSONS FROM SEPARATE CALLS RIDE ONE FRAME. The in-flight window is the
   * ceiling on a rented card: it holds at most 64 lessons and each one's ack
   * took ≥1,120 ms to come back, while the card spent 0.2 ms on it. Measured
   * live: 942 lessons averaging 88 pairs, 439 slot waits totalling 1,597 s —
   * the walk sat waiting on the link with the card ~1% busy, on EVERY lane,
   * because every lane's word or sentence is its own small call.
   *
   * Calls whose lesson setup is identical (same regions, ops, tag band, group
   * sizes, lateral step) are gathered for up to `DREAM_LESSON_COALESCE_MS` (50)
   * or `DREAM_LESSON_MERGE_PAIRS` (4096) pairs and sent as ONE lesson: the same
   * pairs, in arrival order, applied by the card in sequence exactly as the
   * separate lessons were. Each caller AWAITS its batch's send, so a caller's
   * own next step (a probe, a pattern write) still happens after its lesson
   * went out — the order each lane produces is kept. A setup change or the cap
   * sends the pending batch first.
   */
  gpuTeachLessonMerged(spec) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1 || !this._donorSpeaksLessonNow()) return Promise.resolve(false);
    const max = Number(process.env.DREAM_LESSON_MERGE_PAIRS) > 0 ? Math.floor(Number(process.env.DREAM_LESSON_MERGE_PAIRS)) : 4096;
    const winMs = Number(process.env.DREAM_LESSON_COALESCE_MS) >= 0 && process.env.DREAM_LESSON_COALESCE_MS !== undefined && process.env.DREAM_LESSON_COALESCE_MS !== ''
      ? Number(process.env.DREAM_LESSON_COALESCE_MS) : 50;
    const { pairs, ...base } = spec;
    if (!Array.isArray(pairs) || !pairs.length) return Promise.resolve(false);
    let key;
    try { key = JSON.stringify(base); } catch { return Promise.resolve(this.gpuTeachLesson(spec)); }
    let b = this._lessonCoalesce;
    if (b && (b.key !== key || b.ws !== this._gpuClient || b.pairs.length + pairs.length > max)) { this._flushLessonCoalesce(b); b = null; }
    if (!b) {
      b = this._lessonCoalesce = { key, base, ws: this._gpuClient, pairs: [], waiters: [], calls: 0, timer: null };
      const _b = b;
      b.timer = setTimeout(() => this._flushLessonCoalesce(_b), winMs);
    }
    for (const p of pairs) b.pairs.push(p);
    b.calls++;
    return new Promise((res) => {
      b.waiters.push(res);
      if (b.pairs.length >= max) this._flushLessonCoalesce(b);
    });
  },

  /** The sentence lane's pattern lesson (type 18), gathered the same way by `items`. */
  gpuTeachPatternLessonMerged(spec) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1 || !this._donorSpeaksPatternLessonNow()) return Promise.resolve(false);
    const max = Number(process.env.DREAM_PATTERN_MERGE_ITEMS) > 0 ? Math.floor(Number(process.env.DREAM_PATTERN_MERGE_ITEMS)) : 2048;
    const winMs = Number(process.env.DREAM_LESSON_COALESCE_MS) >= 0 && process.env.DREAM_LESSON_COALESCE_MS !== undefined && process.env.DREAM_LESSON_COALESCE_MS !== ''
      ? Number(process.env.DREAM_LESSON_COALESCE_MS) : 50;
    const { items, ...base } = spec;
    if (!Array.isArray(items) || !items.length) return Promise.resolve(false);
    let key;
    try { key = JSON.stringify(base); } catch { return Promise.resolve(this.gpuTeachPatternLesson(spec)); }
    let b = this._patternCoalesce;
    if (b && (b.key !== key || b.ws !== this._gpuClient || b.pairs.length + items.length > max)) { this._flushLessonCoalesce(b); b = null; }
    if (!b) {
      b = this._patternCoalesce = { key, base, ws: this._gpuClient, pairs: [], waiters: [], calls: 0, timer: null, pattern: true };
      const _b = b;
      b.timer = setTimeout(() => this._flushLessonCoalesce(_b), winMs);
    }
    for (const it of items) b.pairs.push(it);
    b.calls++;
    return new Promise((res) => {
      b.waiters.push(res);
      if (b.pairs.length >= max) this._flushLessonCoalesce(b);
    });
  },

  _flushLessonCoalesce(b) {
    if (!b || b.done) return;
    b.done = true;
    if (this._lessonCoalesce === b) this._lessonCoalesce = null;
    if (this._patternCoalesce === b) this._patternCoalesce = null;
    if (b.timer) clearTimeout(b.timer);
    let ok = false;
    try {
      ok = (b.ws === this._gpuClient) && (b.pattern
        ? this.gpuTeachPatternLesson({ ...b.base, items: b.pairs })
        : this.gpuTeachLesson({ ...b.base, pairs: b.pairs }));
    } catch { ok = false; }
    if (ok) {
      this._lessonMergedSends = (this._lessonMergedSends || 0) + 1;
      this._lessonMergedCalls = (this._lessonMergedCalls || 0) + b.calls;
    }
    for (const w of b.waiters) { try { w(ok); } catch { /* a waiter must not stop the others */ } }
  },

  /**
   * v0.3.53 — PATTERN LESSON (type 18): many items, each a multi-region spike
   * pattern then the same bound plasticity ops — the sentence lane's per-word
   * step (clear regions → write tiles → bound Hebbian), a whole run of
   * sentences in one frame. Wire: header(18, reqId, cluster) · twin · u16
   * nRegions · u16 nOps · regions (name, u32 group, u32 size) · ops (name, f32
   * lr) · u32 nItems · per item: nRegions u16 counts, pad→4, dims u16, pad→4.
   * Acked as type 17, so the lesson window paces it.
   */
  encodeTeachPatternLesson(spec) {
    const str = (s) => {
      const b = Buffer.from(String(s || ''), 'utf8');
      const pad = (4 - ((4 + b.length) % 4)) % 4;
      const out = Buffer.alloc(4 + b.length + pad);
      out.writeUInt16LE(b.length, 0);
      b.copy(out, 4);
      return out;
    };
    const u32 = (...v) => { const b = Buffer.alloc(4 * v.length); v.forEach((x, i) => b.writeUInt32LE(x >>> 0, 4 * i)); return b; };
    const f32 = (x) => { const b = Buffer.alloc(4); b.writeFloatLE(x, 0); return b; };
    const parts = [this._encodeSparseHeader(18, spec.reqId >>> 0, spec.cluster), str(spec.twin || '')];
    const cnt = Buffer.alloc(4);
    cnt.writeUInt16LE(spec.regions.length, 0);
    cnt.writeUInt16LE(spec.ops.length, 2);
    parts.push(cnt);
    for (const [n, g, sz] of spec.regions) parts.push(str(n), u32(g, sz));
    for (const [n, lr] of spec.ops) parts.push(str(n), f32(lr));
    parts.push(u32(spec.items.length));
    const R = spec.regions.length;
    for (const item of spec.items) {
      const cb = Buffer.alloc(2 * R + ((4 - ((2 * R) % 4)) % 4));
      let total = 0;
      for (let r = 0; r < R; r++) { const n = (item[r] || []).length; cb.writeUInt16LE(n, 2 * r); total += n; }
      parts.push(cb);
      const db = Buffer.alloc(2 * total + ((4 - ((2 * total) % 4)) % 4));
      let o = 0;
      for (let r = 0; r < R; r++) for (const d of (item[r] || [])) { db.writeUInt16LE(d, o); o += 2; }
      parts.push(db);
    }
    return Buffer.concat(parts);
  },

  /** PRIMARY donor speaks SPRS type 18 (pattern lesson)? v0.3.53+. */
  _donorSpeaksPatternLessonNow() {
    const ws = this._gpuClient;
    if (!ws) return false;
    const c = this.clients && this.clients.get ? this.clients.get(ws) : null;
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String((c && c.donorAppVersion) || ''));
    return !!m && ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3053;
  },

  /** Send a pattern lesson to the cortex card; true only when it went out. Paced like lessons. */
  gpuTeachPatternLesson(spec) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return false;
    if (!this._donorSpeaksPatternLessonNow()) return false;
    try {
      const reqId = this._nextSparseReqId();
      const frame = this.encodeTeachPatternLesson({ ...spec, reqId });
      if (!this._donorPatternSendGated(frame)) return false;
      if (!(this._lessonInflight instanceof Map)) this._lessonInflight = new Map();
      const need = this._intraSliceActive() ? this._intraSliceHolders().length : 1;
      this._lessonInflight.set(reqId, { ws: this._gpuClient, at: Date.now(), need, acked: new Set() });
      this._countTeachOut(18, frame.length, 0, 0);
      try {
        const _tc = this.clients && this.clients.get ? this.clients.get(this._gpuClient) : null;
        if (_tc && _tc.isGPU) { _tc.teachOps = (_tc.teachOps || 0) + spec.items.length; _tc.teachOpsAt = Date.now(); }
      } catch { /* instrument only */ }
      this._patternLessonsSent = (this._patternLessonsSent || 0) + 1;
      this._patternLessonItemsSent = (this._patternLessonItemsSent || 0) + spec.items.length;
      return true;
    } catch (e) {
      if (!this._patternLessonEncodeWarned) { this._patternLessonEncodeWarned = true; console.warn(`[Brain] pattern lesson encode failed (per-word path used): ${e.message}`); }
      return false;
    }
  },

  /** PRIMARY donor speaks SPRS type 17 (lesson)? v0.3.44+. */
  _donorSpeaksLessonNow() {
    const ws = this._gpuClient;
    if (!ws) return false;
    const c = this.clients && this.clients.get ? this.clients.get(ws) : null;
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String((c && c.donorAppVersion) || ''));
    return !!m && ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3044;
  },

  /** Donor speaks SPRS type 16 (bundle)? v0.3.43+. */
  _donorSpeaksBundle(ver) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(ver || ''));
    return !!m && ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3043;
  },

  /**
   * v0.3.13 - does the PRIMARY donor speak binary teach frames (types 7/8/9)?
   * Gated on the appVersion the donor announced at gpu_register (stored as
   * client.donorAppVersion by the register handler). Browser donors report
   * 'browser' and stay on JSON until the register handler stores an explicit
   * capability flag. Cached per socket - one parse per donor session.
   */
  _donorBinTeach() {
    const ws = this._gpuClient;
    if (!ws) return false;
    if (this._binTeachWs === ws) return this._binTeachOk === true;
    this._binTeachWs = ws;
    this._binTeachOk = false;
    try {
      const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      const v = ((c && c.donorAppVersion) || '').toString().trim();
      const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (m) {
        const num = (+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3]);
        this._binTeachOk = num >= 3013; // 0.3.13
      }
    } catch { this._binTeachOk = false; }
    // One-shot per socket: make the encoding decision VISIBLE. The first BT.8
    // verification ran blind because nothing logged which protocol the primary
    // was granted; the lane symptoms had to be read like tea leaves.
    try {
      const c2 = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      console.log(`[Brain] teach-frame encoding for PRIMARY donor: ${this._binTeachOk ? 'BINARY (SPRS 7/8/9)' : 'JSON (legacy)'} — donorAppVersion='${(c2 && c2.donorAppVersion) || 'unknown'}' (binary requires >= 0.3.13).`);
    } catch { /* log is best-effort */ }
    return this._binTeachOk === true;
  },

  /**
   * v0.3.15 - does the PRIMARY donor speak REPEAT frames (type 12)? Teach rep
   * loops put byte-identical payloads on the wire over and over (~14 frames per
   * teach call measured live; pattern + hebbian index arrays average 150-700KB
   * while the box->donor link tops out ~4MB/s - the measured walk-speed wall).
   * When the payload for a (type, name) equals the last one SENT on this socket,
   * a ~30-byte type-12 frame re-executes the donor's cached copy instead.
   * Negotiation, not a fallback: each donor gets the best protocol it announces.
   */
  _donorRepeatTeach() {
    const ws = this._gpuClient;
    if (!ws) return false;
    if (this._repeatTeachWs === ws) return this._repeatTeachOk === true;
    this._repeatTeachWs = ws;
    this._repeatTeachOk = false;
    try {
      const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      const v = ((c && c.donorAppVersion) || '').toString().trim();
      const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (m) this._repeatTeachOk = ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3015; // 0.3.15
    } catch { this._repeatTeachOk = false; }
    try {
      console.log(`[Brain] teach-frame REPEAT compression for PRIMARY donor: ${this._repeatTeachOk ? 'ON (SPRS 12)' : 'off'} (requires >= 0.3.15).`);
    } catch { /* best-effort */ }
    return this._repeatTeachOk === true;
  },

  /**
   * v0.3.16 - does the PRIMARY donor speak TEMPLATE current frames (type 10)?
   * Same TU.20.12 negotiation pattern as binTeach/repeatTeach.
   */
  _donorTemplateTeach() {
    const ws = this._gpuClient;
    if (!ws) return false;
    if (this._tmplTeachWs === ws) return this._tmplTeachOk === true;
    this._tmplTeachWs = ws;
    this._tmplTeachOk = false;
    try {
      const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      const v = ((c && c.donorAppVersion) || '').toString().trim();
      const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (m) this._tmplTeachOk = ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3016; // 0.3.16
    } catch { this._tmplTeachOk = false; }
    try {
      console.log(`[Brain] teach-frame TEMPLATE currents for PRIMARY donor: ${this._tmplTeachOk ? 'ON (SPRS 10)' : 'off'} (requires >= 0.3.16).`);
    } catch { /* best-effort */ }
    return this._tmplTeachOk === true;
  },

  /**
   * v0.3.17 - does the PRIMARY donor speak TEMPLATE spike frames (type 11)?
   * The t7 spike-write river was the LAST uncompressed wire lane at the 12M
   * cortex (live: 403MB of t7 in ~12min vs t10's 4.6MB — every _writeTiledPattern
   * sem-region mirror shipped ~3MB of expanded u32 indices that the tiled
   * pattern fully determines). Same TU.20.12 negotiation pattern as the
   * other capability gates; also stamps `_tmplSpikeOk` for the curriculum's
   * build-skip (the same-flag law from the current-template lane: the encoder
   * and the builder consult the SAME flag so a mismatch cannot happen).
   */
  /**
   * DELTAIDX (donor-v0.3.22) — is THIS donor able to decode delta-varint colIdx?
   * Per-TARGET (not the primary-keyed pattern the teach-frame gates use) because a
   * replica sync targets an arbitrary donor and a pool can be mixed-version. A donor
   * that reports no appVersion — every BROWSER donor — returns false and receives the
   * byte-identical raw u32 stream it always did, so compute.html needs no change.
   */
  _donorDeltaColIdxOk(ws) {
    if (!ws) return false;
    // DELTAIDX — re-armed after ALIASFIX (see the per-upload scratch below). History kept
    // because the failure mode is worth remembering:
    // Live symptom minutes after deploy: the donor hit
    //   bound hebbian '<matrix>' failed: DriverError(CUDA_ERROR_ILLEGAL_ADDRESS)
    // on EVERY bound matrix, which poisons the CUDA context permanently and forces the
    // whole card down to wgpu (2047MB cap). `bound hebbian` indexes cluster spike buffers
    // BY colIdx, so an out-of-range decoded index is exactly this failure — and colIdx is
    // precisely what this feature rewrote. The parity test passed on a 10-entry vector;
    // production chunks are 750,000 entries, so the test did not reach whatever breaks.
    // Correlation is not proof, but a wrong index silently corrupts training and there is
    // no version of that worth risking on a live walk. Opt IN with DREAM_DELTA_COLIDX=1
    // once a 750k-entry round-trip passes and the illegal-address is reproduced/explained.
    // DELTAIDX OFF BY DEFAULT 2026-08-18 — SECOND failure, cause still unknown.
    // ALIASFIX removed a REAL shared-scratch corruption path, but the illegal-address
    // returned at 19:40:47 on the ALIASFIX build, so that was not the whole cause. The
    // symptom is unchanged: bound hebbian (which indexes cluster spike buffers BY colIdx)
    // faults on every bound matrix, permanently poisons the CUDA context, and drops a 24GB
    // card to wgpu at a 2047MB cap. colIdx is what this feature rewrote and nothing else
    // changed on that path, so it stays OFF until the corruption is REPRODUCED offline
    // rather than theorised against a live brain. Two outages is the limit.
    //
    // Known-good facts, so the next attempt does not re-derive them: the codec itself is
    // byte-exact at 750,000 entries (production chunk size) and at the 10-entry parity
    // vector; concurrent encodes with SEPARATE scratches round-trip byte-exact. What has
    // NOT been reproduced offline is the actual multi-donor upload path end to end.
    // Re-enable with DREAM_DELTA_COLIDX=1 only after that reproduction exists.
    if (process.env.DREAM_DELTA_COLIDX !== '1') return false;
    try {
      const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      const v = ((c && c.donorAppVersion) || '').toString().trim();
      const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (!m) return false;
      return ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3022;   // 0.3.22
    } catch { return false; }
  },

  /**
   * DELTAIDX — encode colIdx[start..end) as delta-varints.
   *
   * WHY THIS PAYS (measured from the topology, not assumed): the intra is built by
   * `SparseMatrix` with the Watts-Strogatz hybrid — 70% local (radius 50) + 25%
   * medium (radius 200) + 5% long-range — and each row's indices are SORTED ascending
   * ("Sort row's col indices ascending per CSR contract", sparse-matrix.js). So 95% of
   * consecutive deltas are single-digit-to-low-hundreds and fit ONE varint byte, versus
   * four raw. Only the 5% long-range hops and the one negative delta per row boundary
   * cost more. colIdx is HALF the canonical payload (1373MB of 2792MB at the 12M
   * cortex), so this is the single biggest lever on replica-sync time that does not
   * require regenerating topology from a seed.
   *
   * Format: entry 0 of the chunk is an UNSIGNED varint of the absolute index (chunks
   * split mid-row, so a chunk cannot assume a row start). Entries 1..n-1 are ZIGZAG
   * varints of (colIdx[i] - colIdx[i-1]) — zigzag because a row boundary steps
   * backwards. Lossless and exactly invertible; the decoder rebuilds the identical u32s.
   */
  _encodeDeltaColIdx(colIdx, start, end, out) {
    const n = end - start;
    if (n <= 0) return 0;
    let o = 0;
    let prev = 0;
    for (let i = start; i < end; i++) {
      const v = colIdx[i] >>> 0;
      let rawv;
      if (i === start) {
        rawv = v;
      } else {
        const d = v - prev;
        rawv = d >= 0 ? (d * 2) : (-d * 2 - 1);   // zigzag
      }
      while (rawv >= 0x80) {
        out[o++] = (rawv & 0x7f) | 0x80;
        rawv = Math.floor(rawv / 128);
      }
      out[o++] = rawv;
      prev = v;
    }
    return o;
  },

  _donorSpikeTemplateTeach() {
    const ws = this._gpuClient;
    if (!ws) return false;
    if (this._tmplSpikeWs === ws) return this._tmplSpikeOk === true;
    this._tmplSpikeWs = ws;
    this._tmplSpikeOk = false;
    try {
      const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      const v = ((c && c.donorAppVersion) || '').toString().trim();
      const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (m) this._tmplSpikeOk = ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3017; // 0.3.17
    } catch { this._tmplSpikeOk = false; }
    try {
      console.log(`[Brain] teach-frame TEMPLATE spikes for PRIMARY donor: ${this._tmplSpikeOk ? 'ON (SPRS 11)' : 'off'} (requires >= 0.3.17).`);
    } catch { /* best-effort */ }
    return this._tmplSpikeOk === true;
  },

  /**
   * v0.3.26 — does the PRIMARY donor speak MASKED bound plasticity (type 13)?
   * Same TU.20.12 negotiation pattern as binTeach/template. The verb: pre reads
   * the RESIDENT bound src-cluster spikes (zero wire), post is a sparse row mask
   * scattered device-side — the pre≠post shape (lateral inhibition's live-spikes ×
   * synthetic cross-bucket mask) that neither hebbian_bound (pre==post on intra)
   * nor type-3 hebbian (ships the ~MB live pre index river) can express.
   */
  _donorMaskedHebbian() {
    const ws = this._gpuClient;
    if (!ws) return false;
    if (this._maskedHebbWs === ws) return this._maskedHebbOk === true;
    this._maskedHebbWs = ws;
    this._maskedHebbOk = false;
    try {
      const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      const v = ((c && c.donorAppVersion) || '').toString().trim();
      const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (m) this._maskedHebbOk = ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3026; // 0.3.26
    } catch { this._maskedHebbOk = false; }
    try {
      console.log(`[Brain] MASKED bound plasticity for PRIMARY donor: ${this._maskedHebbOk ? 'ON (SPRS 13)' : 'off'} (requires >= 0.3.26).`);
    } catch { /* best-effort */ }
    return this._maskedHebbOk === true;
  },

  /**
   * v0.3.26 — dispatch masked bound plasticity: the GPU trains a bound matrix
   * with pre = its RESIDENT bound src spikes and post = the given sparse row
   * mask (matrix-row indices), lr < 0 = anti branch, `reps` kernel loops
   * stream-ordered donor-side. Fire-and-forget, no ack (types 7-11 contract).
   * Frame: 'SPRS' | 13 | reqId=0 | name | pad4 | lr f32 | reps u32 | count u32 | idx u32[].
   * Layout contract: donor-app/src/frames.rs `hebbian_bound_masked_decodes`.
   * Returns true when the frame was SENT (donor capable + lane open) so callers
   * can sample their CPU shadow only when the GPU actually carried the mass.
   */
  gpuSparseHebbianBoundMasked(name, lr, reps, postIdx) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return false;
    if (!this._donorMaskedHebbian()) return false;
    const arr = Array.isArray(postIdx) ? postIdx : (postIdx && typeof postIdx.length === 'number') ? Array.from(postIdx) : [];
    if (arr.length === 0) return false;
    // ⛔ ONE ROW LIST, SEVERAL FRAMES. A wide mask (≈1.3M rows) shipped as one
    // 5.2 MB message, which holds the link while it drains. Each row's update
    // depends only on that row, so the list splits across frames with the same
    // lr and reps and the math is identical; no frame exceeds 1 MB.
    const hdr = this._encodeSparseHeader(13, 0, name);
    const PER = 262144;   // rows per frame = 1 MB of indices
    let sentAny = false;
    for (let s = 0; s < arr.length; s += PER) {
      const part = arr.slice(s, s + PER);
      const meta = Buffer.alloc(12);
      meta.writeFloatLE(lr, 0);
      meta.writeUInt32LE(Math.max(1, reps >>> 0), 4);
      meta.writeUInt32LE(part.length >>> 0, 8);
      const ta = Uint32Array.from(part);
      const frame = Buffer.concat([hdr, meta, Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength)]);
      if (!this._donorPatternSendGated(frame)) { if (!sentAny) return false; break; }
      sentAny = true;
      this._countTeachOut(13, frame.length, 0, s === 0 ? this._teachGopsFor(name, Math.max(1, reps >>> 0)) : 0);  // TEACHCREDIT — credited once per lesson
    }
    this._hebbianMaskedSent = (this._hebbianMaskedSent || 0) + 1;
    return true;
  },

  // Per-SOCKET last-sent teach payload cache ('type:name' -> Buffer). Dies with
  // the socket, so a reconnected donor always receives full frames first - the
  // donor's own cache is per-connection too, keeping both ends in lockstep.
  // Bounded: cleared wholesale past 64 keys (one key per region/matrix in use).
  _teachRepeatCacheFor(ws) {
    if (!ws._teachRepeatCache) ws._teachRepeatCache = new Map();
    if (ws._teachRepeatCache.size > 64) ws._teachRepeatCache.clear();
    return ws._teachRepeatCache;
  },

  _encodeRepeatFrame(origType, reqId, name) {
    return Buffer.concat([this._encodeSparseHeader(12, reqId, name), Buffer.from([origType])]);
  },

  // RH.3r - per-frame-type outbound teach telemetry, so the wire river's
  // composition is READ off the state payload instead of inferred from
  // average message sizes ever again. savedBytes accumulates what repeat
  // frames avoided shipping.
  _countTeachOut(type, bytes, savedBytes = 0, workGops = 0) {
    if (!this._teachOutByType) this._teachOutByType = {};
    const k = 't' + type;
    const e = this._teachOutByType[k] || (this._teachOutByType[k] = { frames: 0, bytes: 0 });
    e.frames += 1;
    e.bytes += bytes;
    if (savedBytes > 0) this._teachOutBytesSaved = (this._teachOutBytesSaved || 0) + savedBytes;
    // TEACHCREDIT (2026-08-27) — a donor whose GPU is genuinely being used
    // expects to appear on the board. Teach frames carry REAL GPU work (a full-
    // matrix Hebbian pass touches every stored synapse) but the leaderboard
    // credited only compute_batch steps, so a donor saturated with the walk's
    // training banked ZERO. The same blind spot TEACHMIRROR.1 fixed on the
    // status label, one layer down in the accounting. Callers that drive a
    // full-matrix op pass its measured giga-ops (matrix nnz × reps, from the
    // sizes recorded at upload); small scatter/write frames pass nothing —
    // under-crediting is the correct rounding direction for a number people
    // compete on. The telemetry accrual drains this into the PRIMARY donor's
    // leaderboard row, because the teach lane only ever rides the primary.
    if (workGops > 0) this._teachWorkGops = (this._teachWorkGops || 0) + workGops;
  },

  // TEACHCREDIT — giga-ops for one full pass over a matrix's stored synapses,
  // from the nnz recorded at gpuSparseUpload. Unknown matrix → 0 (no invented
  // credit).
  _teachGopsFor(name, passes = 1) {
    const nnz = (this._matrixNnzByName && this._matrixNnzByName[name]) || 0;
    return (nnz * Math.max(1, passes)) / 1e9;
  },

  /**
   * GINTRA (2026-08-16) — donor-side `langCortex` PSEUDO-CLUSTER carrying the
   * language cortex's STANDALONE spike space, so the intra-synapse matrix can
   * bind + train GPU-RESIDENT (hebbian_bound reads this buffer through the
   * standard binding — the 0.3.17 donor's generic init_cluster/region paths
   * need NO release). Not in CLUSTER_SIZES → never stepped by compute_batch;
   * its spike buffer is written solely by the teach-frame TWINS (the t11/t9
   * duplicates _gpuWriteCortexSpikeSlice/_gpuClearCortexSpikeRegion emit).
   * Gated on the donor speaking template spikes (≥0.3.17) so the twins only
   * ever ride the KB-scale template lane. Costs the donor one 12M-cell
   * spike/current buffer pair (~96MB VRAM).
   */
  _gpuInitLangPseudoCluster(targetWs = null) {
    // A slice holder (targetWs) needs the same spike space its slice binds to;
    // the owner's init flag is only about the owner.
    const ws = targetWs || this._gpuClient;
    if (!targetWs) this._langPseudoInit = false;
    const cortex = this.cortexCluster;
    if (!cortex || !cortex.regions || !cortex.size) return;
    if (!ws || ws.readyState !== 1) return;
    if (!targetWs && !this._donorSpikeTemplateTeach()) return;   // pre-0.3.17 donor — intra stays CPU exactly as before
    const all = cortex.regions;
    const regions = {};
    for (const [rn, r] of Object.entries(all)) {
      // Top-level regions only — a sub-band's name extends a parent region's
      // name (the same structural filter the lamination pass uses); sub-bands
      // overlap their parents and would double-cover the spike space.
      let sub = false;
      for (let p = rn.indexOf('_'); p > 0; p = rn.indexOf('_', p + 1)) {
        if (all[rn.slice(0, p)]) { sub = true; break; }
      }
      if (!sub && r && r.end > r.start) regions[rn] = { start: r.start, end: r.end, side: 'left' };
    }
    try {
      ws.send(JSON.stringify({
        type: 'gpu_init',
        clusterName: 'langCortex',
        size: cortex.size,
        tonicDrive: 0,
        noiseAmp: 0,
        lifParams: { tau: 20, Vrest: -65, Vthresh: -50, Vreset: -70, dt: 1, R: 1, tRefrac: 2 },
        regions,
      }));
      if (!targetWs) this._langPseudoInit = true;
      console.log(`[Brain] GINTRA — langCortex pseudo-cluster gpu_init sent (${cortex.size.toLocaleString()} neurons, ${Object.keys(regions).length} regions). The intra matrix binds here; teach-frame twins keep its spike space current; hebbian_bound trains it GPU-resident.`);
    } catch (e) {
      console.warn('[Brain] GINTRA — pseudo-cluster init send failed:', e && e.message);
    }
  },

  /**
   * T17.7 Phase C.1 — ship a sparse spike pattern to the main cortex
   * GPU sub-region slice via the existing write_spike_slice message.
   * sparseIndices are relative to the region's start on the main
   * cortex. compute.html zero-fills the full region slice and sets
   * each index to 1 before calling gpu.writeSpikeSlice — so the
   * curriculum teach pattern lands in the first N of the region
   * (where N = standalone region size) and the rest of the main-
   * cortex region stays silent until next LIF step, matching the
   * cluster-bound cross-projection's read window exactly.
   */
  _gpuWriteCortexSpikeSlice(regionName, sparseIndices) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return;
    if (!this._donorPatternLaneOpen()) return;   // BEFORE Array.from/stringify — a shed frame costs zero serialization
    // TEMPLATE SPIKES (donor-v0.3.17) — the t7 fix. _writeTiledPattern's spike
    // mirrors are group-tiled patterns fully determined by {rowStart, groupSize,
    // values}: when the donor speaks type 11, ship the ~KB template and let it
    // expand at receive into the IDENTICAL Work::WriteSpike the expanded t7
    // frame produces (spike set where value > 0). At the 12M cortex the
    // expanded sem-region t7 was ~3MB/frame — 403MB in 12min, the last raw
    // wire river and the pattern-lane staling driver.
    let tmplS = sparseIndices && sparseIndices._template;
    // TEMPLATE CANONICALIZATION (2026-08-17 — the drop-on-chat flooder,
    // named by SendForensics: sprs-t11 frames at 1,968.8KB ×2 per write =
    // 504,000-value "templates" — a full fineType-region band pattern fed
    // through an encoder built for ~300-value embeddings, shipped again as
    // the GINTRA twin: ~4MB per teach rep, 95K sheds, donor RTT 7.6s, the
    // wire drowned and the donor died). For t11 the donor sets spikes where
    // value > 0, so ANY template whose nonzero support is ONE contiguous
    // run collapses losslessly: trim the zero head/tail, fold the run into
    // groupSize — identical expanded row set, ~30 bytes instead of ~2MB.
    // Band patterns (fineType grammar bands, motor buckets, one-hots)
    // all fit this shape; scattered-value embeddings (~300 values) pass
    // through untouched. A template that survives canonicalization above
    // 4096 values warns loudly instead of silently flooding again.
    if (tmplS && Array.isArray(tmplS.values) && tmplS.values.length > 4) {
      const v = tmplS.values;
      let d0 = 0, d1 = v.length;
      while (d0 < d1 && !(v[d0] > 0)) d0++;
      while (d1 > d0 && !(v[d1 - 1] > 0)) d1--;
      if (d1 > d0) {
        let contiguous = true;
        for (let d = d0; d < d1; d++) { if (!(v[d] > 0)) { contiguous = false; break; } }
        if (contiguous && (d1 - d0) > 1) {
          const g = Math.max(1, tmplS.groupSize >>> 0);
          tmplS = {
            rowStart: (tmplS.rowStart >>> 0) + d0 * g,
            groupSize: (d1 - d0) * g,
            values: [1],
          };
        } else if (d0 > 0 || d1 < v.length) {
          // Non-uniform support — still trim the zero head/tail.
          tmplS = {
            rowStart: (tmplS.rowStart >>> 0) + d0 * Math.max(1, tmplS.groupSize >>> 0),
            groupSize: Math.max(1, tmplS.groupSize >>> 0),
            values: v.slice(d0, d1),
          };
        }
      }
      if (tmplS.values.length > 4096 && (!this._tmplMonsterWarnMs || (Date.now() - this._tmplMonsterWarnMs) > 30000)) {
        this._tmplMonsterWarnMs = Date.now();
        console.warn(`[Brain] MONSTER spike template survived canonicalization: ${tmplS.values.length.toLocaleString()} values (~${((tmplS.values.length * 4) / 1048576).toFixed(1)}MB/frame ×2 with the twin) for cortex/${regionName} — this caller's pattern needs its own shape fix. Rate-limited 30s.`);
      }
    }
    if (tmplS && Array.isArray(tmplS.values) && tmplS.values.length > 0 && this._donorSpikeTemplateTeach()) {
      const name = `cortex/${regionName}`;
      const hdr = this._encodeSparseHeader(11, 0, name);
      const meta = Buffer.alloc(12);
      meta.writeUInt32LE(tmplS.rowStart >>> 0, 0);
      meta.writeUInt32LE(Math.max(1, tmplS.groupSize >>> 0), 4);
      meta.writeUInt32LE(tmplS.values.length >>> 0, 8);
      const tv = Float32Array.from(tmplS.values);
      const frame = Buffer.concat([hdr, meta, Buffer.from(tv.buffer, tv.byteOffset, tv.byteLength)]);
      if (this._donorPatternSendGated(frame)) this._countTeachOut(11, frame.length);
      // GINTRA TWIN — the same template lands in the langCortex pseudo-
      // cluster's spike space (standalone coordinates: the donor's pseudo
      // regions are the standalone absolute spans, and this template's
      // rowStart/indices are region-relative on BOTH targets). ~300–600
      // bytes; keeps the GPU-bound intra Hebbian reading exactly the
      // pattern the teach loop wrote.
      if (this._langPseudoInit === true) {
        const hdr2 = this._encodeSparseHeader(11, 0, `langCortex/${regionName}`);
        const frame2 = Buffer.concat([hdr2, meta, Buffer.from(tv.buffer, tv.byteOffset, tv.byteLength)]);
        if (this._donorPatternSendGated(frame2)) this._countTeachOut(11, frame2.length);
      }
      return;
    }
    const arr = Array.isArray(sparseIndices)
      ? sparseIndices
      : (sparseIndices && typeof sparseIndices.length === 'number')
        ? Array.from(sparseIndices)
        : [];
    // v0.3.13 - binary teach frame (type 7) when the donor speaks it: packed
    // u32 indices instead of a JSON integer array. Same lane, same gating,
    // ~3x fewer bytes and no serde_json parse on the donor's receive thread
    // (the measured teach-drain bottleneck). reqId 0: fire-and-forget, no ack.
    if (this._donorBinTeach()) {
      const name = `cortex/${regionName}`;
      const hdr = this._encodeSparseHeader(7, 0, name);
      const meta = Buffer.alloc(4);
      meta.writeUInt32LE(arr.length, 0);
      const ta = Uint32Array.from(arr);
      const payload = Buffer.concat([hdr, meta, Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength)]);
      // v0.3.15 - repeat compression: a payload byte-identical to the last one
      // SENT for this region collapses to a ~30-byte type-12 frame (rep loops
      // re-send the same pattern ~14x per teach call - the measured wire river).
      // Cache updates ONLY on a confirmed send so both ends stay in lockstep.
      if (this._donorRepeatTeach()) {
        const cache = this._teachRepeatCacheFor(this._gpuClient);
        const key = '7:' + name;
        const prev = cache.get(key);
        if (prev && prev.equals(payload)) {
          const rep = this._encodeRepeatFrame(7, 0, name);
          if (this._donorPatternSendGated(rep)) this._countTeachOut(12, rep.length, payload.length - rep.length);
          return;
        }
        if (this._donorPatternSendGated(payload)) {
          cache.set(key, payload);
          this._countTeachOut(7, payload.length);
        }
        return;
      }
      if (this._donorPatternSendGated(payload)) this._countTeachOut(7, payload.length);
      // Replica mirror stays JSON-only: replicas negotiate their own caps when
      // DF.7 fanout revives; a binary mirror to an unknown replica would be
      // dropped unparsed. Fanout is currently flag-gated off.
      return;
    }
    const json = JSON.stringify({
      type: 'write_spike_slice',
      clusterName: 'cortex',
      regionName,
      sparseIndices: arr,
    });
    if (!this._donorPatternSendGated(json)) return;   // TU.28.1 — soft-cap gate (stream was unguarded)
    this._mirrorCortexWriteToReplicas(json);   // DF.7 — keep replicas' resident state in sync (flag-gated)
  },

  /**
   * T17.7 Phase E.a — sparse current-slice write to main cortex. Used
   * by cluster.injectEmbeddingToRegion's forward path when cortexCluster's
   * gpuProxy is wired. Writes the intent embedding's current-drive
   * values into the main-cortex sub-slice at region.start+idx offsets,
   * so the next LIF tick's driveDrive = (effectiveDrive + currents) ·
   * regionGate picks up the injected intent.
   *
   * Sparse-indices format — typical injection touches ~regionSize/8
   * indices (groupSize per embedding dim × number of non-zero dims),
   * far cheaper than shipping a dense region-sized Float32Array.
   *
   * @param {string} regionName
   * @param {number[]} sparseIndices - indices relative to region start
   * @param {number[]} sparseValues  - matching current values
   */
  _gpuWriteCortexCurrentSlice(regionName, sparseIndices, sparseValues) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return;
    if (!this._donorPatternLaneOpen()) return;   // BEFORE Array.from/stringify — a shed frame costs zero serialization
    // TEMPLATE FORM (donor-v0.3.16) — every injection call site builds its
    // expanded (idx,val) pairs from a group-tiled template {rowStart,
    // groupSize, values} and tags it on the values array (the brain-server
    // proxy arrow forwards positionally; promotion to a real parameter waits
    // on that file's full-read batch). When the donor speaks type 10, ship
    // the ~KB template and let it expand at receive into the IDENTICAL
    // write_current work item — measured 99.5% of all outbound bytes were
    // these frames fully expanded (~840KB each at the 1.5M cortex).
    let tmpl = sparseValues && sparseValues._template;
    // TEMPLATE CANONICALIZATION — current-frame (t10) sibling of the t11 fix
    // above. Currents carry AMPLITUDES, so a run only folds when every
    // nonzero value is EXACTLY equal (bit-identical expansion); zero head/
    // tail always trims. Same monster warn as t11.
    if (tmpl && Array.isArray(tmpl.values) && tmpl.values.length > 4) {
      const v = tmpl.values;
      let d0 = 0, d1 = v.length;
      while (d0 < d1 && v[d0] === 0) d0++;
      while (d1 > d0 && v[d1 - 1] === 0) d1--;
      if (d1 > d0) {
        let uniform = true;
        const v0 = v[d0];
        for (let d = d0; d < d1; d++) { if (v[d] !== v0) { uniform = false; break; } }
        const g = Math.max(1, tmpl.groupSize >>> 0);
        if (uniform && v0 !== 0 && (d1 - d0) > 1) {
          tmpl = { rowStart: (tmpl.rowStart >>> 0) + d0 * g, groupSize: (d1 - d0) * g, values: [v0] };
        } else if (d0 > 0 || d1 < v.length) {
          tmpl = { rowStart: (tmpl.rowStart >>> 0) + d0 * g, groupSize: g, values: v.slice(d0, d1) };
        }
      }
      if (tmpl.values.length > 4096 && (!this._tmplMonsterWarnMs2 || (Date.now() - this._tmplMonsterWarnMs2) > 30000)) {
        this._tmplMonsterWarnMs2 = Date.now();
        console.warn(`[Brain] MONSTER current template survived canonicalization: ${tmpl.values.length.toLocaleString()} values (~${((tmpl.values.length * 4) / 1048576).toFixed(1)}MB/frame) for cortex/${regionName}. Rate-limited 30s.`);
      }
    }
    if (tmpl && Array.isArray(tmpl.values) && tmpl.values.length > 0 && this._donorTemplateTeach()) {
      const name = `cortex/${regionName}`;
      const hdr = this._encodeSparseHeader(10, 0, name);
      const meta = Buffer.alloc(12);
      meta.writeUInt32LE(tmpl.rowStart >>> 0, 0);
      meta.writeUInt32LE(Math.max(1, tmpl.groupSize >>> 0), 4);
      meta.writeUInt32LE(tmpl.values.length >>> 0, 8);
      const tv = Float32Array.from(tmpl.values);
      const psiBuf = Buffer.alloc(4);
      psiBuf.writeFloatLE(Math.round((this.psi ?? 0) * 1000) / 1000, 0); // PSIQ quantization, same law as t8
      const frame = Buffer.concat([hdr, meta, Buffer.from(tv.buffer, tv.byteOffset, tv.byteLength), psiBuf]);
      if (this._donorPatternSendGated(frame)) this._countTeachOut(10, frame.length);
      return;
    }
    const idx = Array.isArray(sparseIndices) ? sparseIndices : Array.from(sparseIndices || []);
    const val = Array.isArray(sparseValues)  ? sparseValues  : Array.from(sparseValues || []);
    if (idx.length === 0 || idx.length !== val.length) return;
    // v0.3.13 - binary teach frame (type 8): u32 indices + f32 values + f32 psi.
    if (this._donorBinTeach()) {
      const name = `cortex/${regionName}`;
      const hdr = this._encodeSparseHeader(8, 0, name);
      const meta = Buffer.alloc(4);
      meta.writeUInt32LE(idx.length, 0);
      const ti = Uint32Array.from(idx);
      const vmeta = Buffer.alloc(4);
      vmeta.writeUInt32LE(val.length, 0);
      const tv = Float32Array.from(val);
      const psiBuf = Buffer.alloc(4);
      // PSIQ (2026-08-16) - psi is QUANTIZED to 3 decimals on this wire. The live
      // scalar drifts every tick, and because it rides inside the payload it broke
      // byte-equality on every frame - the type-12 repeat compression never caught
      // the t8 river (measured: 2.99GB of t8 in 12.6min, 842KB avg, ~the whole
      // 4MB/s link) even though rep loops resend identical indices+values. A
      // <=0.1% rounding on an injected-current amplitude sits far below the
      // Rulkov noise floor; the pattern's identity is untouched.
      psiBuf.writeFloatLE(Math.round((this.psi ?? 0) * 1000) / 1000, 0);
      const payload = Buffer.concat([
        hdr, meta, Buffer.from(ti.buffer, ti.byteOffset, ti.byteLength),
        vmeta, Buffer.from(tv.buffer, tv.byteOffset, tv.byteLength), psiBuf,
      ]);
      // v0.3.15 - repeat compression (see type-7 note). psi rides inside the
      // payload, so a psi change breaks equality and ships a full frame - exact.
      if (this._donorRepeatTeach()) {
        const cache = this._teachRepeatCacheFor(this._gpuClient);
        const key = '8:' + name;
        const prev = cache.get(key);
        if (prev && prev.equals(payload)) {
          const rep = this._encodeRepeatFrame(8, 0, name);
          if (this._donorPatternSendGated(rep)) this._countTeachOut(12, rep.length, payload.length - rep.length);
          return;
        }
        if (this._donorPatternSendGated(payload)) {
          cache.set(key, payload);
          this._countTeachOut(8, payload.length);
        }
        return;
      }
      if (this._donorPatternSendGated(payload)) this._countTeachOut(8, payload.length);
      return; // replica mirror stays JSON-only (see type-7 note)
    }
    const json = JSON.stringify({
      type: 'write_current_slice',
      clusterName: 'cortex',
      regionName,
      sparseIndices: idx,
      sparseValues: val,
      psi: this.psi ?? 0,
    });
    if (!this._donorPatternSendGated(json)) return;   // TU.28.1 — soft-cap gate (stream was unguarded)
    this._mirrorCortexWriteToReplicas(json);   // DF.7 — mirror to replicas (flag-gated)
  },

  /**
   * T17.7 Phase C.1 — pure clear of a main-cortex region slice on the
   * GPU spikes buffer. Sends clear_spike_region JSON; compute.html
   * handler calls gpu.clearSpikeRegion which uses encoder.clearBuffer
   * at byte-range granularity — no CPU allocation. Per teach
   * iteration the curriculum clears all 8 regions (auditory, visual,
   * free, letter, phon, sem, fineType, motor) so the next pattern
   * write lands on zeroed slices.
   */
  _gpuClearCortexSpikeRegion(regionName) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return;
    if (!this._donorPatternLaneOpen()) return;   // BEFORE Array.from/stringify — a shed frame costs zero serialization
    // v0.3.13 - binary teach frame (type 9): header only, region in the name.
    if (this._donorBinTeach()) {
      const clearFrame = this._encodeSparseHeader(9, 0, `cortex/${regionName}`);
      if (this._donorPatternSendGated(clearFrame)) {
        // The JSON path clears the stale flag after ITS send further down this
        // method; this early-return branch must do it itself or a binary donor
        // would latch stale forever after the first shed.
        this._patternLaneStale = false;
        this._countTeachOut(9, clearFrame.length);
      }
      // GINTRA TWIN — clear the pseudo-cluster's matching region span so the
      // GPU-bound intra Hebbian never reads a previous pattern's residual spikes.
      if (this._langPseudoInit === true) {
        const clearFrame2 = this._encodeSparseHeader(9, 0, `langCortex/${regionName}`);
        if (this._donorPatternSendGated(clearFrame2)) this._countTeachOut(9, clearFrame2.length);
      }
      return;
    }
    const json = JSON.stringify({
      type: 'clear_spike_region',
      clusterName: 'cortex',
      regionName,
    });
    if (!this._donorPatternSendGated(json)) return;   // TU.28.1 — soft-cap gate (stream was unguarded)
    // The clear is the FIRST frame of every teach pattern (`_clearSpikes` runs
    // before the tiled writes), so a clear that actually lands re-establishes a
    // known GPU spike state and the lane is trustworthy again from here.
    this._patternLaneStale = false;
    this._mirrorCortexWriteToReplicas(json);   // DF.7 — mirror to replicas (flag-gated)
  },

  /**
   * T17.7 Phase D — readback letter-bucket spike counts from a main-
   * cortex region sub-slice. Used by generateSentenceAwait to argmax-
   * decode the motor slice per tick without shipping the full
   * ~6.6M-neuron spike array. GPU-side reduction runs in parallel
   * with the batch's LIF dispatch on the next substep — reduction
   * latency adds to round-trip but not to main-brain tick time.
   *
   * @param {string} regionName — e.g. 'motor'
   * @param {number} bucketCount — e.g. 26 for letters A..Z
   * @param {number} subSliceLen — e.g. standalone motor size =
   *   langCortexSize × 0.033. Must equal bucketCount × bucketSize.
   * @param {number} [startOffset=0]
   * @returns {Promise<Uint32Array|null>}
   */
  async gpuReadbackCortexLetterBuckets(regionName, bucketCount, subSliceLen, startOffset = 0) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return null;
    // Timeout bumped 5s → 30s so readback can land even when compute.html
    // is still draining a post-teach dispatch queue (binary weights save
    // + many hebbianBound dispatches can delay the readback ACK past 5s).
    // 30s matches the default sparse-dispatch timeout; readback is rare
    // (per emission probe) so the longer cap doesn't slow the hot path.
    const ack = await this._sparseSend({
      type: 'readback_letter_buckets',
      clusterName: 'cortex',
      regionName,
      bucketCount,
      subSliceLen,
      startOffset,
    }, 30000);
    if (!ack || !ack.counts) return null;
    return new Uint32Array(ack.counts);
  },

  /**
   * v0.3.20 — LETTER-SURPRISE WALK on the donor.
   *
   * The episode-salience metric streams a clause's letters through the cortex
   * and averages |Δ letter-region spike rate|. Host-side that is one network
   * round-trip PER LETTER (measured: 190s for a single chat message against a
   * teach-saturated donor — the reply-path pin that killed the donor twice).
   * This ships every letter's index ranges in ONE frame; the donor injects,
   * steps and counts entirely on the card and returns the mean.
   *
   * @param {string} regionName — 'letter'
   * @param {Array<Array<[number,number]>>} letterRanges — per letter, its [start,len] ranges (region-relative)
   * @param {number} [ticks=2] — steps per letter (matches the host equation)
   * @returns {Promise<number|null>} mean surprise, or null when unsupported/unavailable
   */
  async gpuLetterSurprise(regionName, letterRanges, ticks = 2) {
    if (!this._donorLetterSurprise()) return null;
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return null;
    if (!Array.isArray(letterRanges) || letterRanges.length === 0) return null;
    const ack = await this._sparseSend({
      type: 'letter_surprise',
      clusterName: 'cortex',
      regionName,
      letters: letterRanges.slice(0, 64),
      ticks: Math.max(1, Math.min(8, ticks)),
      drive: 0,
      noise: 0,
    }, 60000);
    if (!ack || typeof ack.surprise !== 'number' || !Number.isFinite(ack.surprise)) return null;
    return ack.surprise;
  },

  /**
   * v0.3.20 - does the PRIMARY donor speak the device-side letter walk?
   * Same TU.20.12 negotiation pattern as the other capability gates.
   */
  _donorLetterSurprise() {
    const ws = this._gpuClient;
    if (!ws) return false;
    if (this._letterSurpWs === ws) return this._letterSurpOk === true;
    this._letterSurpWs = ws;
    this._letterSurpOk = false;
    try {
      const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      const v = ((c && c.donorAppVersion) || '').toString().trim();
      const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (m) this._letterSurpOk = ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3020; // 0.3.20
    } catch { this._letterSurpOk = false; }
    try {
      console.log(`[Brain] device-side LETTER-SURPRISE walk for PRIMARY donor: ${this._letterSurpOk ? 'ON (letter_surprise)' : 'off'} (requires >= 0.3.20).`);
    } catch { /* best-effort */ }
    return this._letterSurpOk === true;
  },

  // ─── TU.19-D — GPU↔CPU parity harness ──────────────────────────────
  //
  // "GPU shadow DIRTY" conflated three independent failure modes. This
  // harness tells them apart with a cheap digest instead of shipping the
  // whole 14MB matrix back:
  //   Mode 1 STALE         — donor's resident weights ≠ CPU master (dropped
  //                          uploads / ISSUE-B). Detected by checksum mismatch.
  //   Mode 2 GPU-DIVERGENT — weights MATCH but the donor's shader computes a
  //                          different propagate than the CPU for identical
  //                          input. Detected by feeding the same sparse input
  //                          to both and diffing the output.
  //   Mode 3 MATH-ERROR    — the CPU master itself computes garbage. Detected
  //                          against a hand-computed tiny reference.
  // Verdict: STALE | GPU-DIVERGENT | MATH-ERROR | CLEAN.

  /**
   * ⭐ `SHADOWCOST.3` (donor v0.3.36) — PULL THE WEIGHTS THE GPU ACTUALLY TRAINED.
   *
   * The checkpoint has always been written from the CPU-side arrays, and
   * `SHADOWCOST.8` established those are not a lagging copy of the resident
   * weights — they are a different brain. 94% of plasticity arrives through
   * `hebbian_bound`, which trains on the donor's RESIDENT spike state the host
   * never sees, at ~49x the host's update rate; measured live the two drift at
   * +0.0124 mean-magnitude ratio per minute and never reconverge. So every
   * Savestart has been restoring weights that did not do the learning.
   *
   * ⚠ STREAMS DIRECTLY INTO `matrix.values`, no full-size staging buffer. The
   * intra matrix is ~452M nnz: 1.81 GB as the f32 the wire carries, 3.6 GB as
   * the Float64 the CPU keeps. Buffering either would be a multi-GB allocation
   * spike on a 32 GB box that is already holding the brain. Each ~8 MiB chunk
   * carries its own absolute byte offset, so it is applied and dropped.
   *
   * ⚠ THE WIRE IS f32 AND THE CPU IS f64 — the upload downcasts, so this widens
   * on the way back. That is lossless in this direction; the precision was
   * already spent at upload time.
   *
   * ⛔ ON FAILURE THE CALLER MUST NOT SAVE. A partial transfer leaves
   * `matrix.values` a mix of old-CPU and new-GPU rows. That is not corrupt — both
   * halves are real trained weights and Oja is robust to it — but it is not a
   * coherent snapshot either, so a checkpoint written from it would be a third
   * brain. The return value is the completeness proof, and it is a CHECKSUM, not
   * a byte count: the donor accumulates FNV-1a-64 over exactly the bytes it put
   * on the wire and ships it in the closing ack, so "did I receive all of it,
   * intact, in order" is answered by hashing what arrived.
   */
  async gpuReadbackMatrixValues(name, targetWs = null, chunkBytes = 8 * 1024 * 1024, into = null, range = null) {
    const ws = (targetWs && targetWs.readyState === 1) ? targetWs : this._gpuClient;
    if (!ws || ws.readyState !== 1) return { ok: false, reason: 'no donor connected' };
    const reg = this._replicaMatrixRegistry;
    const entry = (reg && typeof reg.get === 'function') ? reg.get(name) : null;
    // MULTI-CARD — a slice reads into ITS rows of the master (`into.values` is
    // a subarray view), so the bytes land in place with no copy.
    const matrix = into || (entry && entry.matrix);
    if (!matrix || !matrix.values) return { ok: false, reason: `no CPU master matrix '${name}' to write into` };
    if (!this._valuesReadbacks) this._valuesReadbacks = new Map();
    if (this._valuesReadbackInFlight) return { ok: false, reason: 'a values readback is already in flight' };

    const reqId = (this._gpuSparseReqId = (this._gpuSparseReqId | 0) + 1);
    // ⭐ `REBINDWAIT.4` — FNV-1a-64 CARRIED AS TWO 32-BIT LIMBS, NOT A BigInt.
    //   See `_applyValuesChunk` for the measurement that forced it. The offset
    //   basis 0xcbf29ce484222325 split at the word boundary.
    const st = {
      name, matrix, hashHi: 0xcbf29ce4, hashLo: 0x84222325,
      // a ranged read's chunks start at the range's own offset
      chunks: 0, bytes: 0, nextOffset: range ? (range.offset >>> 0) : 0,
      outOfOrder: 0, overrun: 0, t0: Date.now(), done: null, ranged: !!range,
    };
    this._valuesReadbacks.set(reqId, st);
    this._valuesReadbackInFlight = true;

    const settle = new Promise((resolve) => { st.done = resolve; });
    // Generous: 2.3 GB at the measured 39 MB/s is ~59 s, and the flood lane can
    // queue it behind teach work. A too-tight timeout here would abandon a
    // transfer that is progressing, and the donor would keep streaming into a
    // pending nobody owns.
    /* ⛔⛔ AN IDLE DEADLINE, NOT A WALL-CLOCK ONE — AND THE COMMENT ABOVE ALREADY
       SAID WHY, WHILE THE CODE DID THE OPPOSITE.
       It reads *"a too-tight timeout here would abandon a transfer that is
       progressing"*. That is exactly what happened: the live box aborted three
       pulls **"after 80–132 chunk(s) / 0.67–1.1 GB"** — chunks were ARRIVING when
       it fired. A fixed deadline cannot tell a stalled transfer from a slow one,
       so the biggest matrix on the box could never finish and `okCount` read 2 in
       5.3 h against an expected ~5.
       ⭐ Re-armed on every chunk (`_applyValuesChunk`), so a transfer that is
       moving is never abandoned and one that genuinely stops still fails fast.
       The bound now measures the thing it was always meant to: silence.
       ⚠ The abort itself was never the bug — it is the DESIGNED safe path and
       nothing corrupts. What decayed is the checkpoint's system of record, which
       is why this matters. */
    st.idleMs = READBACK_IDLE_MS;
    st.rearm = () => {
      if (!st.done) return;                       // already settled — never re-arm a finished pull
      clearTimeout(st.timer);
      st.timer = setTimeout(st.onIdle, st.idleMs);
    };
    st.onIdle = () => { if (st.done) { const d = st.done; st.done = null; d({ ok: false, reason: `idle ${Math.round(st.idleMs / 1000)}s after ${st.chunks} chunk(s) / ${(st.bytes / 1048576).toFixed(1)} MB — the donor stopped sending` }); } };
    const timer = st.timer = setTimeout(st.onIdle, st.idleMs);
    try {
      ws.send(JSON.stringify(range
        ? { type: 'readback_matrix_values', reqId, name, chunkBytes: chunkBytes | 0, offset: range.offset, length: range.length }
        : { type: 'readback_matrix_values', reqId, name, chunkBytes: chunkBytes | 0 }));
    } catch (e) {
      clearTimeout(timer); this._valuesReadbacks.delete(reqId); this._valuesReadbackInFlight = false;
      return { ok: false, reason: `send failed: ${(e && e.message) || e}` };
    }
    const out = await settle;
    clearTimeout(timer);
    this._valuesReadbacks.delete(reqId);
    this._valuesReadbackInFlight = false;
    return out;
  },

  /**
   * `SHADOWCOST.3` — apply ONE type=7 chunk. Called from the SPRR binary handler.
   * Widens f32 → the CPU's Float64 in place at the chunk's own absolute offset.
   * Order is VERIFIED rather than assumed: a chunk landing anywhere but the next
   * expected offset is counted and the transfer fails at the ack, because a
   * silently mis-placed chunk is individually valid and no per-chunk check finds it.
   */
  _applyValuesChunk(reqId, byteOffset, payload) {
    const st = this._valuesReadbacks && this._valuesReadbacks.get(reqId);
    if (!st) return false;
    // ⭐ PROGRESS RESETS THE DEADLINE. This is what makes the bound an IDLE
    // timeout rather than a wall clock: a transfer that is moving can never be
    // abandoned, and one that stops still fails within the idle window. The old
    // fixed deadline killed three pulls on the live box while chunks were still
    // arriving — 80–132 of them, 0.67–1.1 GB in.
    if (typeof st.rearm === 'function') st.rearm();
    if (byteOffset !== st.nextOffset) st.outOfOrder++;
    /**
     * ⭐⭐ `REBINDWAIT.4` — THE VERIFICATION WAS THE BOTTLENECK, NOT THE WIRE.
     *
     * FNV-1a-64 over the arriving bytes must match the donor's accumulation over
     * the same bytes in send order, so the digest cannot change. What changed is
     * the arithmetic: one BigInt xor + one BigInt multiply PER BYTE, and the
     * intra matrix is 1,726 MB — about 1.8 BILLION BigInt operations, on the
     * event loop, while she teaches.
     *
     * ⚠ MEASURED, and I had the number an hour before I connected it:
     *   `_cpuMasterMatrixChecksum` clocked 12 MB in 2,051 ms = 5.9 MB/s, and the
     *   live readback then ran at 7.8 MB/s. I had priced the pull at 39 MB/s by
     *   reusing an UPLOAD measurement for a download — the same mistake as
     *   treating a query count as evidence a query still worked. The wire was
     *   never the limit.
     *
     * ⭐ Two 32-bit limbs in plain Number math instead. PRIME 0x100000001b3 splits
     *   into hi 0x100 / lo 0x1b3, and every partial product stays under 2^53 so
     *   doubles hold them exactly: lo*0x1b3 ≤ 1.87e12, hi*0x1b3 + lo*0x100 +
     *   carry ≤ 3e12. `>>> 0` is ToUint32, which is modulo 2^32 for any finite
     *   number, so it truncates the limbs correctly.
     *
     * ⚠ PROVED BIT-IDENTICAL TO THE BigInt FORM BEFORE SHIPPING — empty input, a
     *   single zero byte, 0xff, 1 KB, 4 KB, and 200 random-length fuzz rounds, all
     *   equal. Measured 4.8 → 26.5 MB/s, 5.5x. A digest that is merely FASTER and
     *   not IDENTICAL would fail every transfer while looking like a donor fault.
     */
    let hi = st.hashHi, lo = st.hashLo;
    for (let i = 0; i < payload.length; i++) {
      lo = (lo ^ payload[i]) >>> 0;
      const l = lo * 0x1b3;
      const carry = Math.floor(l / 4294967296);
      const nlo = l >>> 0;
      hi = (hi * 0x1b3 + lo * 0x100 + carry) >>> 0;
      lo = nlo;
    }
    st.hashHi = hi; st.hashLo = lo;
    const startElem = byteOffset / 4;
    const n = payload.length >> 2;
    const vals = st.matrix.values;
    if (startElem + n > vals.length) { st.overrun++; return false; }
    // Read f32 LE out of the frame into the CPU store. ⭐ This loop is
    // dtype-agnostic by construction — it indexes by ELEMENT (`startElem`,
    // `n`), never by byte offset into the values array — so it was correct
    // when the CPU store was f64 and stays correct now that it is f32. Since
    // WEIGHTPREC the two sides are the same width and nothing is widened.
    for (let k = 0; k < n; k++) vals[startElem + k] = payload.readFloatLE(k * 4);
    st.chunks++;
    st.bytes += payload.length;
    st.nextOffset = byteOffset + payload.length;
    return true;
  },

  /**
   * ⭐ PACED PULL (donor ≥ 0.3.52) — read a matrix range by range at a set rate,
   * so the pull NEVER fills the card's link. The old whole-matrix pull queued
   * every chunk at once ahead of the card's other replies; over the tunnel one
   * ~6.8 GB pull ran ~11 min with the outbound line full and dropped the pod.
   * Here each range (DREAM_READBACK_RANGE_MB, default 4) is its own verified
   * request — checksum per range — and the loop waits so the average stays at
   * DREAM_READBACK_PACE_MBPS (default 2). Her lessons run the whole time.
   * Chunks land straight in the CPU master as they arrive (as before).
   */
  async _pacedReadbackMatrix(name, ws, into = null) {
    const reg = this._replicaMatrixRegistry;
    const entry = (reg && typeof reg.get === 'function') ? reg.get(name) : null;
    const m = into || (entry && entry.matrix);
    if (!m || !m.values) return { ok: false, reason: `no CPU master matrix '${name}'` };
    const total = m.values.length * 4;
    const RANGE = Math.max(1, Number(process.env.DREAM_READBACK_RANGE_MB) > 0 ? Number(process.env.DREAM_READBACK_RANGE_MB) : 4) * 1048576;
    const PACE = (Number(process.env.DREAM_READBACK_PACE_MBPS) > 0 ? Number(process.env.DREAM_READBACK_PACE_MBPS) : 2) * 1048576;
    const t0 = Date.now();
    let bytes = 0;
    for (let off = 0; off < total; off += RANGE) {
      if (!ws || ws.readyState !== 1) return { ok: false, reason: 'the card left mid-pull', bytes };
      if (typeof globalThis._brainShutdownRequested !== 'undefined' && globalThis._brainShutdownRequested && !this._pacedAllowDuringStop) return { ok: false, reason: 'shutdown', bytes };
      const len = Math.min(RANGE, total - off);
      const r = await this.gpuReadbackMatrixValues(name, ws, 1024 * 1024, into, { offset: off, length: len });
      if (!r || !r.ok) return { ok: false, reason: `range @${off}: ${(r && r.reason) || 'unknown'}`, bytes };
      bytes += r.bytes || 0;
      const due = t0 + (bytes / PACE) * 1000;
      const wait = due - Date.now();
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    }
    const secs = (Date.now() - t0) / 1000;
    console.log(`[Brain] PACED PULL ${name} — ${(bytes / 1048576).toFixed(1)} MB in ${secs.toFixed(0)}s (${(bytes / 1048576 / Math.max(1, secs)).toFixed(1)} MB/s, every range checksum-matched); the brain's copy now holds what the card trained.`);
    return { ok: true, bytes, secs };
  },

  /** A card that speaks ranged reads (donor ≥ 0.3.52). */
  _pacedCapable(ws) {
    const c = ws && this.clients && this.clients.get ? this.clients.get(ws) : null;
    const v = /^(\d+)\.(\d+)\.(\d+)/.exec(String((c && c.donorAppVersion) || ''));
    return !!v && ((+v[1]) * 1e6 + (+v[2]) * 1e3 + (+v[3])) >= 3052;
  },

  /** `SHADOWCOST.3` — the closing JSON ack: verify and settle. */
  _settleValuesReadback(ack) {
    const st = this._valuesReadbacks && this._valuesReadbacks.get(ack.reqId);
    if (!st || !st.done) return;
    const done = st.done; st.done = null;
    const ms = Date.now() - st.t0;
    // `REBINDWAIT.4` — ONE BigInt, at the end, to render the two limbs as the
    // decimal u64 string the donor sends. Per-transfer, not per-byte.
    const mine = ((BigInt(st.hashHi) << 32n) | BigInt(st.hashLo)).toString();
    const theirs = String(ack.checksum != null ? ack.checksum : '0');
    const problems = [];
    if (!ack.found) problems.push(ack.error || 'donor reported not found');
    if (ack.chunks !== st.chunks) problems.push(`chunk count ${st.chunks} received vs ${ack.chunks} sent`);
    if (st.outOfOrder) problems.push(`${st.outOfOrder} chunk(s) arrived out of order`);
    if (st.overrun) problems.push(`${st.overrun} chunk(s) ran past the CPU array`);
    if (mine !== theirs) problems.push(`checksum ${mine} != donor ${theirs}`);
    if (problems.length) {
      done({ ok: false, reason: problems.join('; '), chunks: st.chunks, bytes: st.bytes, ms });
      return;
    }
    const mbps = ms > 0 ? (st.bytes / 1048576) / (ms / 1000) : 0;
    if (!st.ranged) console.log(`[Brain] SHADOWCOST.3 readback ${st.name} — ${st.chunks} chunks / ${(st.bytes / 1048576).toFixed(1)} MB in ${(ms / 1000).toFixed(1)}s = ${mbps.toFixed(1)} MB/s, checksum MATCHED; the CPU master now holds the weights the GPU trained.`);
    done({ ok: true, chunks: st.chunks, bytes: st.bytes, ms, mbps, checksum: mine });
  },

  /**
   * ⭐ `SHADOWCOST.3` — REFRESH THE CPU MASTER FROM THE DONOR, THEN SAVE.
   *
   * Deliberately NOT hooked inside `saveWeights`: that method is synchronous and
   * called from a dozen places (cell-pass, grade-advance, ramhead retry, the
   * periodic interval, shutdown). Making it async to await a ~60 s transfer would
   * either ripple through every caller or silently return a promise nobody awaits
   * — and a save that appears to have happened but has not is the same class of
   * lie this whole stem was filed against. So the readback owns its own cadence
   * and TRIGGERS a save when it succeeds.
   *
   * ⛔ ON FAILURE IT DOES NOT SAVE. A partial transfer leaves `matrix.values` a
   * mix of old-CPU and new-GPU rows; both halves are real trained weights, but a
   * checkpoint written from that is a third brain. The previous checkpoint slots
   * survive untouched (CHECKROT keeps 3), which is the correct outcome — an older
   * coherent snapshot beats a newer incoherent one.
   *
   * ⚠ Gated on donor >= 0.3.36. An older donor has no `readback_matrix_values`
   * opcode and would silently ignore the request, so the pending would ride its
   * timeout and burn 10 minutes proving nothing. Negotiated per socket, the same
   * law every other verb here follows.
   */
  async refreshCheckpointFromDonor(reason = 'hourly', opts = {}) {
    // ⭐ `READBACKEYE.1` — EVERY EXIT IS RECORDED, because this method had eight
    //   of them and published none. `_lastReadbackOk` was written on success and
    //   read by nothing; the seven refusals returned a `reason` string that went
    //   straight on the floor. With the console ring serving only the newest 500
    //   of its 2,000 lines, an hourly event is already unreachable by the time
    //   anyone asks — so "did the readback fire?" was unanswerable from outside
    //   the box while the parity verdict sat at DRIFTING. Same argument as
    //   ONESHOT.1: a number you had to be watching for is not something the
    //   board can answer with later.
    // ⚠ Counts for ALL reasons, but `_lastReadbackRefusal` deliberately EXCLUDES
    //   the two routine ones. This runs on a 5-minute tick against a 1-hour gap,
    //   so 11 of every 12 calls refuse normally — letting those occupy the
    //   "last refusal" field would bury the one that means something under a
    //   permanent, healthy, misleading value.
    const ROUTINE = new Set(['inside the readback gap', 'first tick — clock seeded, first pull is one gap from now', 'remote cortex card — it keeps its own checkpoint; no periodic pull']);
    const refuse = (why) => {
      const st = this._readbackStats || (this._readbackStats = { refusals: {} });
      st.refusals[why] = (st.refusals[why] || 0) + 1;
      if (!ROUTINE.has(why)) this._lastReadbackRefusal = { reason: why, at: Date.now() };
      return { ok: false, reason: why };
    };
    const ws = this._gpuClient;
    if (!ws || ws.readyState !== 1) return refuse('no donor connected');
    let versionOk = false;
    try {
      const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      const v = ((c && c.donorAppVersion) || '').toString().trim();
      const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (m) versionOk = ((+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3])) >= 3036; // 0.3.36
    } catch { versionOk = false; }
    if (!versionOk) {
      if (!this._readbackVersionWarned) {
        this._readbackVersionWarned = true;
        console.warn('[Brain] SHADOWCOST.3 checkpoint readback UNAVAILABLE — the primary donor is older than 0.3.36, so checkpoints keep being written from the CPU shadow (which SHADOWCOST.8 measured as a DIFFERENT brain, not a lagging copy). Update the donor.');
      }
      return refuse('donor < 0.3.36');
    }
    // ⛔ THIS GAP IS THE WEIGHT-LOSS BOUND ON A DONOR DEATH, which is what it
    //   should be read as — not as a cache-refresh interval. 94% of plasticity
    //   arrives via `hebbian_bound` and trains on the donor's RESIDENT state
    //   (SHADOWCOST.8: the CPU arrays are a DIFFERENT brain, not a lagging
    //   copy). So everything learned since the last successful readback dies
    //   with the card. A donor that aborts at minute 59 of an hourly gap throws
    //   away an hour of the walk.
    //
    // ⭐ 3_600_000 → 1_800_000 on 2026-10-19, RE-PRICED FIRST rather than tuned:
    //     pull   ~6.8 GB over loopback at the measured 541.78 MB/s ≈ 13 s
    //     save   5,997 MB binary weights, measured 51–66 s wall this week
    //     cycle  ≈ 75–80 s, and the save pins the loop for most of it
    //   duty = cycle / gap →  hourly 2.2% · 30 min 4.4% · 15 min 8.9%
    //   Thirty minutes halves the worst-case loss for ~2 points of walk
    //   throughput. Fifteen doubles the tax again for the same shape of win,
    //   so it is left to the operator rather than taken as the default.
    // ⚠ This is a TIGHTENING — a bound made smaller, nothing removed — so the
    //   consolidation gate and every walk-length figure are untouched.
    // ⛔ The real fix is not here: it is the donor keeping its own on-disk
    //   checkpoint and handing it back on reconnect, which bounds the loss
    //   without the host paying the transfer at all.
    let GAP_MS = Number.isFinite(+process.env.DREAM_READBACK_MIN_GAP_MS)
      ? Math.max(0, +process.env.DREAM_READBACK_MIN_GAP_MS) : 1_800_000;
    // ⭐ A REMOTE cortex holder gets a shorter gap. A rented card can vanish
    // (dropped, or terminated with its disk) and this gap is the bound on what
    // dies with it; measured, one dropped after ~45 min with no pull since the
    // move. Remote = a median heartbeat RTT over 200 ms (the loopback card reads
    // 0 ms, the tunnelled pod ~1,100 ms). `DREAM_READBACK_REMOTE_GAP_MS`
    // (default 600,000 = 10 min). The pull runs over the tunnel, so it costs
    // time on the pod's link — that trade is the point.
    try {
      const _oc = this.clients && this.clients.get ? this.clients.get(ws) : null;
      // ⛔ Remote by IDENTITY, not by RTT: measured, the local 4070 read 213 ms
      // under teaching load while the tunnelled pod read 207 ms, so an RTT
      // threshold called the local card remote. A card is local when its GPU is
      // this machine's GPU (`_perfStats.gpuName`, nvidia-smi at boot); RTT > 500 ms
      // is the fallback only when the host GPU is unknown.
      const _host = this._perfStats && this._perfStats.gpuName;
      const _remote = _oc && (_host
        ? String(_oc.gpuName || '') !== String(_host)
        : Number(_oc.rttMs) > 500);
      // ⛔⛔ NO PERIODIC PULL FROM A REMOTE CORTEX CARD. It was every 10 min, and
      // one pull is ~6.8 GB — about 11 minutes over the pod's link at ~10 MB/s —
      // so the pull ran longer than its own gap and the pod's outbound line was
      // never free: every reply and heartbeat queued behind gigabytes of weights
      // until the donor's 30 s send watchdog dropped the link (measured: a drop
      // 1,680 MB into a pull). The loss bound it was buying is already held on
      // the card: the donor keeps its own on-disk checkpoint and hands it back
      // on reconnect (`donor-checkpoint-restore`). She trains straight through;
      // only an explicit pull (`force`, e.g. before a stop) reads the weights.
      // `DREAM_READBACK_REMOTE_GAP_MS` > 0 opts back into a periodic pull.
      if (_remote && !opts.force) {
        const _r = Number(process.env.DREAM_READBACK_REMOTE_GAP_MS);
        // ⭐ A card that reads BY RANGE (≥ 0.3.52) is pulled hourly AT A PACE —
        // ~2 MB/s in the background, her lessons never pause, the link never
        // fills — so the brain's copy is never more than about an hour behind
        // what the card trained (a rented card's disk dies with it). An older
        // card can only be pulled whole, which is what dropped the link: none.
        if (this._pacedCapable(ws)) GAP_MS = _r > 0 ? _r : 3_600_000;
        else if (!(_r > 0)) return refuse('remote cortex card — it keeps its own checkpoint; no periodic pull');
        else GAP_MS = Math.min(GAP_MS, _r);
      }
      if (_remote) this._readbackChunkBytes = 1024 * 1024;   // small pieces on a tunnel: no single send near the donor's 30 s watchdog
      else this._readbackChunkBytes = 0;
      // A remote card that reads by range is PULLED AT A PACE (never fills its link).
      this._readbackPaced = !!(_remote && this._pacedCapable(ws));
    } catch { /* keep the default gap */ }
    // The ONE owner of the gap. The published state read its own copy with a
    // default of 3,600,000 that was never moved when this one was halved to
    // 1,800,000, so the board reported an hourly cadence the code had stopped
    // running. It reads this value now.
    this._readbackGapMs = GAP_MS;
    // ⛔ `SHADOWCOST.3` FIX — SEED THE CLOCK, or "hourly" is not hourly on the
    //   first fire. `_lastReadbackMs` starts undefined, so `!this._lastReadbackMs`
    //   made the gap check fall through and the FIRST scheduler tick pulled the
    //   whole ~6.8 GB — five minutes into the boot, in the exact window the
    //   canonical upload and the cross-projection rebinds need the wire. Caught
    //   live on the 0.3.36 press: the pull was refused only by the
    //   upload-in-flight guard below, i.e. by luck of ordering rather than by
    //   this gate doing its job. Seeding it at first call means the first real
    //   pull lands one full gap after boot, which is what the cadence was priced
    //   for. `force` (the pre-stop pull) still bypasses it.
    if (!this._lastReadbackMs) {
      this._lastReadbackMs = Date.now();
      if (!opts.force) return refuse('first tick — clock seeded, first pull is one gap from now');
    }
    if (!opts.force && (Date.now() - this._lastReadbackMs) < GAP_MS) {
      return refuse('inside the readback gap');
    }
    // ⛔ Never two at once, and never during an upload — the values buffer is
    // being written from the other direction and a readback mid-upload would
    // capture a half-replaced matrix.
    if (this._valuesReadbackInFlight || this._pacedPullInFlight) return refuse('already in flight');
    if (this._cortexUploadInFlight) return refuse('a cortex upload is in flight');
    this._lastReadbackMs = Date.now();
    this._pacedPullInFlight = !!this._readbackPaced;
    try {
      return await this._refreshCheckpointPull(reason, ws);
    } finally { this._pacedPullInFlight = false; }
  },

  async _refreshCheckpointPull(reason, ws) {
    const refuse = (why) => {
      const st = this._readbackStats || (this._readbackStats = { refusals: {} });
      st.refusals[why] = (st.refusals[why] || 0) + 1;
      this._lastReadbackRefusal = { reason: why, at: Date.now() };
      return { ok: false, reason: why };
    };
    // The intra matrix is the whole point — it is the biggest thing in the
    // cluster and the one `hebbian_bound` trains behind the CPU's back. The
    // cross-projections ride the same dual-write posture and are far smaller;
    // they are pulled too, in registry order, and any single failure aborts the
    // save rather than mixing a fresh intra with stale cross weights.
    const names = ['cortex_intraSynapses'];
    try {
      const reg = this._replicaMatrixRegistry;
      if (reg && reg.keys) for (const k of reg.keys()) if (k !== 'cortex_intraSynapses') names.push(k);
    } catch { /* registry best-effort; the intra alone is still worth pulling */ }
    const t0 = Date.now();
    let bytes = 0;
    for (const n of names) {
      // MULTI-CARD — the sliced intra matrix is pulled slice by slice, each into
      // its own rows of the master; any slice failing aborts the save the same
      // way a whole-matrix failure does.
      if (n === this._SLICE_NAME && this._intraSliceActive()) {
        const reg = this._replicaMatrixRegistry;
        const full = reg && reg.get(n) && reg.get(n).matrix;
        let sliceFail = null;
        const _readers = this._sliceReaders();
        if (!_readers) sliceFail = { reason: 'a row range has no live holder' };
        for (const s of (_readers || [])) {
          if (!full || !s.ws || s.ws.readyState !== 1) { sliceFail = { reason: 'a slice holder is gone' }; break; }
          const rp = full.rowPtr;
          const r = await this.gpuReadbackMatrixValues(n, s.ws, undefined, { values: full.values.subarray(rp[s.a], rp[s.b]) });
          if (!r || !r.ok) { sliceFail = r || { reason: 'unknown' }; break; }
          bytes += r.bytes || 0;
        }
        if (sliceFail) {
          console.warn(`[Brain] SHADOWCOST.3 readback ABORTED on a slice of '${n}' (${reason}): ${sliceFail.reason || 'unknown'} — NOT saving, so the existing checkpoint slots stay coherent.`);
          return { ...refuse(`aborted on a slice of '${n}': ${sliceFail.reason || 'unknown'}`), name: n };
        }
        continue;
      }
      const r = this._readbackPaced
        ? await this._pacedReadbackMatrix(n, ws)
        : await this.gpuReadbackMatrixValues(n, null, this._readbackChunkBytes || undefined);
      if (!r || !r.ok) {
        console.warn(`[Brain] SHADOWCOST.3 readback ABORTED on '${n}' (${reason}): ${(r && r.reason) || 'unknown'} — NOT saving, so the existing checkpoint slots stay coherent.`);
        return { ...refuse(`aborted on '${n}': ${(r && r.reason) || 'unknown'}`), name: n };
      }
      bytes += r.bytes || 0;
    }
    const secs = (Date.now() - t0) / 1000;
    console.log(`[Brain] SHADOWCOST.3 checkpoint refresh (${reason}) — ${names.length} matrix(es), ${(bytes / 1048576).toFixed(1)} MB in ${secs.toFixed(1)}s. Saving the weights the GPU trained.`);
    // `WEIGHTLOSS.1` — stamped BEFORE the save, so the save records that these
    // weights now include what the card trained (`gpuPulledAt`).
    this._gpuPulledAtLoad = Date.now();
    try { this.saveWeights({ force: true, trigger: `gpu-readback:${reason}` }); } catch (e) {
      console.warn('[Brain] SHADOWCOST.3 save after readback failed:', (e && e.message) || e);
      return refuse(`save failed: ${(e && e.message) || e}`);
    }
    this._lastReadbackOk = { at: Date.now(), reason, bytes, secs, matrices: names.length };
    // DONOR PULL — the master now holds what the cards trained; a snapshot of
    // it (when one is due) lets the next joining card pull instead of be pushed.
    try { this._maybePublishWeights(); } catch { /* publishing never blocks a save */ }
    // ⭐ `READBACKEYE.1` — the cumulative side. One `lastOk` cannot answer "is the
    //   hourly cadence actually running?" on a box that has been up for hours;
    //   a count can, and `secs` banked here is what says whether `REBINDWAIT.4`'s
    //   limb-FNV fix held (was 222 s, priced at ~60 s).
    {
      const st = this._readbackStats || (this._readbackStats = { refusals: {} });
      st.ok = (st.ok || 0) + 1;
      st.bytesTotal = (st.bytesTotal || 0) + bytes;
      st.secsTotal = (st.secsTotal || 0) + secs;
      if (secs > (st.secsMax || 0)) st.secsMax = secs;
    }
    return { ok: true, bytes, secs, matrices: names.length };
  },

  /** Ask a donor for its resident weight digest (checksum + samples). */
  async gpuReadbackMatrixChecksum(name, sampleCount = 0, targetWs = null) {
    const ws = (targetWs && targetWs.readyState === 1) ? targetWs : this._gpuClient;
    if (!ws || ws.readyState !== 1) return null;
    const ack = await this._sparseSend({ type: 'readback_matrix_checksum', name, sampleCount: sampleCount | 0 }, 30000, ws);
    if (!ack) return null;
    return {
      found: !!ack.found,
      nnz: ack.nnz | 0,
      checksum: String(ack.checksum != null ? ack.checksum : '0'),
      samples: Array.isArray(ack.samples) ? ack.samples : [],
    };
  },

  /**
   * FNV-1a-64 over the CPU master's weights in the SAME f32 representation the
   * GPU received. ⭐ Since WEIGHTPREC (2026-09-05) the CPU master IS Float32, so
   * this hashes the stored array directly instead of a downcast view — the two
   * sides are now the same numbers, not merely the same after rounding, which
   * removes a whole class of "parity says divergent but it is only precision".
   * Chunked + setImmediate-yielded so a 14MB matrix hash never pins the
   * event loop (TU.20.2 discipline). Returns a decimal string (u64 via BigInt).
   */
  async _cpuMasterMatrixChecksum(name, sampleCount = 0) {
    const reg = this._replicaMatrixRegistry;
    const entry = (reg && typeof reg.get === 'function') ? reg.get(name) : null;
    const matrix = entry && entry.matrix;
    const FNV_OFFSET = 0xcbf29ce484222325n, MASK = 0xffffffffffffffffn, PRIME = 0x100000001b3n;
    if (!matrix || !matrix.values) return { found: false, nnz: 0, checksum: '0', samples: [] };
    const f32 = matrix.values instanceof Float32Array ? matrix.values : new Float32Array(matrix.values);
    const nnz = f32.length;
    if (nnz === 0) return { found: true, nnz: 0, checksum: FNV_OFFSET.toString(), samples: [] };
    const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    // ⭐ `REBINDWAIT.4` — same two-limb FNV-1a-64 as `_applyValuesChunk`, proved
    //   bit-identical to the BigInt form. THIS is the method that was measured at
    //   12 MB / 2,051 ms = 5.9 MB/s, which is what made `?parity=run` a ~5-minute
    //   operation on the intra matrix and made the readback look wire-bound when
    //   it was arithmetic-bound.
    let hi = 0xcbf29ce4, lo = 0x84222325;
    // ⛔ `SHADOWCOST.2` — THE MASK WAS NOT A MASK. This was `1_000_000` used with
    //   `i & (CHUNK - 1)`, which is the power-of-two idiom applied to a decimal
    //   constant: 999,999 is 0xF423F, so the test `(i & 999999) === 999999` is
    //   not "every millionth step", it is "i has all TWELVE of those bits set" —
    //   true for about 1 in 4,096 steps. Over the intra matrix's ~1.8 billion
    //   byte steps that is ~440,000 yields instead of ~1,800, each paying the
    //   event loop's full backlog. The intended cadence needs a power of two.
    const CHUNK = 1 << 20; // yield every 1 MiB so the diagnostic never pins the loop
    for (let i = 0; i < bytes.length; i++) {
      lo = (lo ^ bytes[i]) >>> 0;
      const l = lo * 0x1b3;
      const carry = Math.floor(l / 4294967296);
      const nlo = l >>> 0;
      hi = (hi * 0x1b3 + lo * 0x100 + carry) >>> 0;
      lo = nlo;
      if ((i & (CHUNK - 1)) === (CHUNK - 1)) await new Promise(r => setImmediate(r));
    }
    const hash = (BigInt(hi) << 32n) | BigInt(lo);
    const cap = Math.min(sampleCount | 0, 64);
    const samples = [];
    if (cap > 0) {
      const step = Math.max(1, Math.floor(nnz / cap));
      for (let i = 0; i < nnz && samples.length < cap; i += step) samples.push({ idx: i, val: f32[i] });
    }
    return { found: true, nnz, checksum: hash.toString(), samples };
  },

  /**
   * ⭐ `SHADOWCOST.2` — THE CHEAP HALF OF THE VERDICT.
   *
   * `parityCheckMatrix` hashes every weight byte of the CPU master. On a
   * cross-projection that is nothing; on the intra matrix it is ~452M nnz x 4B
   * = ~1.8 BILLION byte steps of BigInt arithmetic, and it also runs a full CPU
   * propagate for mode 2. That price is worth paying once, deliberately — it is
   * not worth paying to answer the question actually being asked, which is not
   * "is one bit different" but "is the CPU copy UNDER-TRAINED relative to the
   * donor's". A five-fold weight difference is visible in a handful of samples.
   *
   * The donor already ships up to 64 sampled `{idx, val}` beside its digest, and
   * the CPU side of that comparison is 64 array reads. So this is the read that
   * costs nothing and can run often; the full hash stays for when the answer
   * needs to be exact. Compared in f32 (Math.fround) because the CPU keeps
   * Float64 and the upload downcasts — comparing raw f64 would report a
   * divergence that is only the wire format.
   */
  async parityCheckMatrixSamples(name, sampleCount = 64) {
    const out = { name, mode: 'samples', verdict: 'UNKNOWN', ts: Date.now() };
    const cap = Math.min(64, Math.max(1, sampleCount | 0));
    const reg = this._replicaMatrixRegistry;
    const entry = (reg && typeof reg.get === 'function') ? reg.get(name) : null;
    const matrix = entry && entry.matrix;
    if (!matrix || !matrix.values) { out.detail = `no CPU master matrix '${name}' in the replica registry`; return out; }
    const gpu = await this.gpuReadbackMatrixChecksum(name, cap);
    if (!gpu) { out.detail = 'no donor connected / readback timed out'; return out; }
    out.cpuNnz = matrix.values.length | 0;
    out.gpuNnz = gpu.nnz | 0;
    if (!gpu.found) { out.verdict = 'STALE'; out.detail = `donor holds no resident '${name}' — never uploaded, or dropped`; return out; }
    if (out.gpuNnz !== out.cpuNnz) {
      out.verdict = 'STALE';
      out.detail = `nnz differs (cpu ${out.cpuNnz} vs gpu ${out.gpuNnz}) — the donor is training a structurally different matrix; sample indices do not align, so no value comparison is meaningful`;
      return out;
    }
    if (!gpu.samples.length) { out.detail = 'donor returned no samples'; return out; }
    let maxAbs = 0, maxRel = 0, sumCpu = 0, sumGpu = 0, n = 0, worst = null;
    for (const s of gpu.samples) {
      const i = s.idx | 0;
      if (i < 0 || i >= out.cpuNnz) continue;
      const c = Math.fround(matrix.values[i]);
      const g = Math.fround(s.val);
      const d = Math.abs(g - c);
      const scale = Math.max(Math.abs(g), Math.abs(c));
      const rel = scale > 0 ? d / scale : 0;
      if (d > maxAbs) maxAbs = d;
      if (rel > maxRel) { maxRel = rel; worst = { idx: i, cpu: c, gpu: g }; }
      sumCpu += Math.abs(c); sumGpu += Math.abs(g); n++;
    }
    out.compared = n;
    out.maxAbsDiff = maxAbs;
    out.maxRelDiff = maxRel;
    out.meanAbsCpu = n ? sumCpu / n : 0;
    out.meanAbsGpu = n ? sumGpu / n : 0;
    // The headline number for the shadow-cadence question: how much smaller is
    // the copy we SAVE than the copy that is actually training? ~1 means the
    // shadow is keeping up; a ratio far below 1 means the checkpoint on disk is
    // the under-trained one, which is the whole reason the cadence exists.
    out.cpuOverGpu = out.meanAbsGpu > 0 ? out.meanAbsCpu / out.meanAbsGpu : null;
    out.worstSample = worst;
    /**
     * ⛔⛔ `REBINDWAIT.5` — A VERDICT THAT CAN ONLY EVER RETURN ONE ANSWER IS NOT
     *     A VERDICT, AND THIS ONE COULD ONLY EVER SAY `DIVERGENT`.
     *
     * The threshold was `maxRel <= 1e-6` — f32 round-trip noise — which is the
     * right test for two FROZEN copies and the wrong one for a LIVE brain. The
     * donor never stops training: the readback is a snapshot with per-value age
     * skew that `_collectBinarySections` already documents and accepts, so by the
     * time a sample is compared the GPU has moved on. Measured immediately after
     * a transfer whose digest MATCHED end to end: `cpuOverGpu` 0.9939 — the two
     * copies as aligned as they will ever be — and this line still said
     * `DIVERGENT` on a single weight that had travelled 0.075 since the snapshot.
     *
     * ⭐ THE AGGREGATE IS THE HONEST MEASURE, and it is the one the whole stem was
     *   filed on: `cpuOverGpu` drifting away from 1.0 is what proved the CPU copy
     *   was a different brain (0.9704 → 1.0212 while being watched). A single
     *   sample's relative error measures how long ago the snapshot was taken.
     *
     * ⚠ So the verdict reads the ratio, and STALE is its own answer — distinct
     *   from DIVERGENT, because "the snapshot is old" and "the copies are pulling
     *   apart" are different findings with different fixes. maxRelDiff is still
     *   reported; it just no longer decides.
     */
    const drift = out.cpuOverGpu != null ? Math.abs(out.cpuOverGpu - 1) : null;
    out.aggregateDrift = drift;
    if (maxRel <= 1e-6) {
      out.verdict = 'MATCH';
      out.detail = `${n} sampled weights identical in f32 — the CPU master and the donor hold the same values`;
    } else if (drift != null && drift <= 0.05) {
      out.verdict = 'ALIGNED';
      out.detail = `${n} sampled weights, cpu/gpu mean magnitude ${out.cpuOverGpu.toFixed(4)} (within 5% of 1.0) — the copies are aligned in aggregate. Individual samples differ by up to ${(maxRel * 100).toFixed(1)}%, which is the per-value age skew of a snapshot taken while the donor kept training, not divergence.`;
    } else if (drift != null && drift <= 0.25) {
      out.verdict = 'DRIFTING';
      out.detail = `cpu/gpu mean magnitude ${out.cpuOverGpu.toFixed(4)} — the copies have started to pull apart. A readback re-aligns them; if this keeps climbing between readbacks the cadence is too slow.`;
    } else {
      out.verdict = 'DIVERGENT';
      out.detail = `cpu/gpu mean magnitude ${out.cpuOverGpu != null ? out.cpuOverGpu.toFixed(4) : 'n/a'} (max relative ${(maxRel * 100).toFixed(2)}%) — the saved copy is NOT the copy that is training`;
    }
    return out;
  },

  /**
   * Full parity verdict for one named matrix. Runs the three checks in order and
   * returns { verdict, ...evidence }. Mode 3 (MATH-ERROR) uses a fixed 3×3 sparse
   * reference so a CPU-math regression is caught even when GPU + CPU agree with
   * each other (both could be equally wrong on a shared code path).
   */
  async parityCheckMatrix(name, sampleCount = 8) {
    const out = { name, verdict: 'UNKNOWN', ts: Date.now() };
    // Mode 3 FIRST — CPU sanity vs a hand-computed reference (independent of GPU).
    // 3×3 CSR: row0=[2,0,1], row1=[0,3,0], row2=[1,0,4]; spikes=[1,1,1] → [3,3,5].
    try {
      // Use the REAL SparseMatrix class (constructor of any registry matrix) so
      // this exercises the actual propagate() code path, not a reimplementation.
      const reg0 = this._replicaMatrixRegistry;
      const anyEntry = (reg0 && reg0.size) ? [...reg0.values()][0] : null;
      const SM = anyEntry && anyEntry.matrix && anyEntry.matrix.constructor;
      if (SM) {
        const ref = new SM(3, 3);
        ref.values = new Float64Array([2, 1, 3, 1, 4]);
        ref.colIdx = new Uint32Array([0, 2, 1, 0, 2]);
        ref.rowPtr = new Uint32Array([0, 2, 3, 5]);
        ref.nnz = 5;
        const got = ref.propagate(new Float64Array([1, 1, 1]), new Float64Array(3));
        const want = [3, 3, 5];
        const mathOk = got && got.length === 3 && want.every((w, i) => Math.abs(got[i] - w) < 1e-9);
        if (!mathOk) {
          out.verdict = 'MATH-ERROR';
          out.detail = `CPU reference propagate wrong: got [${Array.from(got || []).join(',')}] want [${want.join(',')}] — the equational matmul itself is broken, GPU parity is moot.`;
          return out;
        }
      }
    } catch (e) { /* reference check is best-effort; fall through to weight parity */ }

    const cpu = await this._cpuMasterMatrixChecksum(name, sampleCount);
    if (!cpu.found) { out.verdict = 'UNKNOWN'; out.detail = `no CPU master matrix '${name}' in the replica registry`; return out; }
    const gpu = await this.gpuReadbackMatrixChecksum(name, sampleCount);
    out.cpu = { nnz: cpu.nnz, checksum: cpu.checksum };
    if (!gpu) { out.verdict = 'UNKNOWN'; out.detail = 'no donor connected / readback timed out'; return out; }
    out.gpu = { found: gpu.found, nnz: gpu.nnz, checksum: gpu.checksum };
    // Mode 1 — STALE: donor lacks the matrix, or nnz/checksum differ.
    if (!gpu.found || gpu.nnz !== cpu.nnz || gpu.checksum !== cpu.checksum) {
      out.verdict = 'STALE';
      out.detail = !gpu.found
        ? `donor holds no resident '${name}' — never uploaded, or dropped (ISSUE-B). Resync needed.`
        : `resident weights ≠ CPU master (cpu nnz=${cpu.nnz}/hash=${cpu.checksum} vs gpu nnz=${gpu.nnz}/hash=${gpu.checksum}) — dropped uploads left the donor training a stale matrix (ISSUE-B). Resync needed.`;
      return out;
    }
    // Weights MATCH → Mode 2 — GPU-DIVERGENT: same input, diff output?
    try {
      // Deterministic sparse input: every 7th pre-neuron fires (bounded, repeatable).
      const cols = (cpu && this._replicaMatrixRegistry.get(name).matrix.cols) || 0;
      const idx = [];
      for (let c = 0; c < cols; c += 7) idx.push(c);
      const preSpikes = new Uint32Array(idx);
      const gpuCurr = await this.gpuSparsePropagate(name, preSpikes);
      const m = this._replicaMatrixRegistry.get(name).matrix;
      const dense = new Float64Array(m.cols);
      for (const c of idx) dense[c] = 1;
      const cpuCurr = m.propagate(dense, new Float64Array(m.rows));
      if (gpuCurr && cpuCurr && gpuCurr.length === cpuCurr.length) {
        let maxAbs = 0, dot = 0, na = 0, nb = 0;
        for (let i = 0; i < cpuCurr.length; i++) {
          const d = Math.abs(gpuCurr[i] - cpuCurr[i]); if (d > maxAbs) maxAbs = d;
          dot += gpuCurr[i] * cpuCurr[i]; na += gpuCurr[i] * gpuCurr[i]; nb += cpuCurr[i] * cpuCurr[i];
        }
        const cos = (na > 0 && nb > 0) ? dot / Math.sqrt(na * nb) : 1;
        out.propagate = { maxAbsErr: maxAbs, cosine: cos };
        // f32 GPU vs f64 CPU → small numeric drift is expected; only a real
        // shader/precision BUG diverges beyond a generous tolerance.
        const DIVERGE_ABS = 1e-2, DIVERGE_COS = 0.9999;
        if (maxAbs > DIVERGE_ABS || cos < DIVERGE_COS) {
          out.verdict = 'GPU-DIVERGENT';
          out.detail = `weights match but donor propagate differs (maxAbsErr=${maxAbs.toExponential(2)}, cosine=${cos.toFixed(6)}) — shader/precision bug, not stale weights. Re-uploading won't help.`;
          return out;
        }
      }
    } catch (e) { out.propagateError = e && e.message; }
    out.verdict = 'CLEAN';
    out.detail = 'resident weights == CPU master and propagate agrees within f32 tolerance.';
    return out;
  },

  /**
   * T17.7 Phase C.1 — rebind all 14 cortex cross-projections from
   * standalone mode to cluster-bound mode after both main-cortex GPU
   * init AND cortexCluster.initGpu() complete. The rebind is wire-
   * cheap (one JSON per matrix, binding metadata only — values/colIdx/
   * rowPtr stay in place on GPU) and frees the standalone preSpikes/
   * postCurrents/postSpikes buffers (each matrix sheds ~60 MB at
   * biological scale — 14 matrices × ~60 MB = ~840 MB VRAM freed).
   *
   * After this runs:
   *   - Cross-projection propagate reads pre-spikes from main-cortex
   *     `bufs.cortex.spikes` at the standalone region's offset inside
   *     the main cortex's corresponding sub-region (first-N sub-slice),
   *     writes post-currents into `bufs.cortex.currents` at the
   *     destination sub-slice — the LIF dispatch that runs next sees
   *     the accumulated currents and fires the main cortex neurons
   *     within the language slice.
   *   - Hebbian dispatch reads pre+post from `bufs.cortex.spikes`
   *     at the two bound offsets — which is where curriculum teach's
   *     write_spike_slice call places the training pattern.
   *   - Main cortex's intra-synapse matrix is NOT rebound. The
   *     homogeneous-cortex intra coupling
   *     is handled by wave-function oscillation phase-sync +
   *     fractal propagation, not an explicit intra matrix. The
   *     STANDALONE cortexCluster keeps its intra-synapses for the
   *     CPU-shadow equivalence check through Phase C/D; Phase E
   *     deletes it alongside the standalone cluster itself.
   *
   * Sub-slice sizes match the standalone cortexCluster's region sizes,
   * which in turn match the cross-projection matrix dimensions. The
   * first-N sub-slice of each main-cortex sub-region gets the
   * training pattern; the remaining (main-size − N) neurons of each
   * sub-region stay homogeneous cortex coupled via wave-function
   * activation, consistent with a biological "language core" inside
   * the larger cortical territory.
   */
  async _ensureCortexCrossProjectionsBound() {
    if (this._cortexCrossProjectionsBound) return;
    if (!this.cortexCluster || !this.cortexCluster.regions) return;
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return;
    const stand = this.cortexCluster;
    const mainSize = this.CLUSTER_SIZES.cortex;
    if (!mainSize) return;

    // Main cortex region layout — same fractions used by _regionsFor
    // and _mirrorCortexRegions. Kept in sync across all three call
    // sites; divergence here would silently point cross-projections
    // at the wrong main-cortex neurons.
    const LAYOUT = {
      auditory:  [0.000, 0.083],
      visual:    [0.083, 0.250],
      free:      [0.250, 0.500],
      letter:    [0.500, 0.550],
      phon:      [0.550, 0.750],
      sem:       [0.750, 0.917],
      fineType:  [0.917, 0.967],
      motor:     [0.967, 0.984],
      // WMB word_motor band (2026-07-15) — lockstep with brain-server.js
      // CORTEX_SUBREGION_LAYOUT. word_motor (langCortex 90K) drops into the unused
      // tail of the motor sub-region (motor uses only ~34.5K of the [0.967,1.0]
      // ~2.02M territory) → main-cortex start ~60.31M, no overlap, no shift to any
      // other region. Fixes sem_to_word_motor / word_motor_to_sem binding (14/16 → 16/16)
      // so emission teach runs GPU-bound. Binding-only, SAVESTART-safe.
      word_motor: [0.984, 1.000],
    };
    const mainSliceStart = {};
    for (const [regName, [frA]] of Object.entries(LAYOUT)) {
      mainSliceStart[regName] = Math.floor(mainSize * frA);
    }

    const projNames = Object.keys(stand.crossProjections || {});
    if (projNames.length === 0) return;
    console.log(`[Brain] rebinding ${projNames.length} cortex cross-projections to main-cortex sub-slices`);
    let bound = 0;
    for (const projKey of projNames) {
      const idx = projKey.indexOf('_to_');
      if (idx < 0) continue;
      const srcName = projKey.slice(0, idx);
      const dstName = projKey.slice(idx + 4);
      const standSrc = stand.regions[srcName];
      const standDst = stand.regions[dstName];
      if (!standSrc || !standDst) continue;
      const srcLen = standSrc.end - standSrc.start;
      const dstLen = standDst.end - standDst.start;
      const srcOff = mainSliceStart[srcName];
      const dstOff = mainSliceStart[dstName];
      if (srcOff == null || dstOff == null) continue;
      const matrixKey = `${stand.name}_${projKey}`;  // e.g., "cortex_sem_to_motor"
      const ack = await this._sparseSend({
        type: 'rebind_sparse',
        name: matrixKey,
        binding: {
          srcCluster: 'cortex',
          srcRegion: { start: srcOff, end: srcOff + srcLen },
          dstCluster: 'cortex',
          dstRegion: { start: dstOff, end: dstOff + dstLen },
        },
      }, 30000);
      if (ack && ack.ok) {
        bound++;
        // Mark the CPU-side projection so cluster._crossRegionHebbian
        // can route GPU dispatch via hebbianBound (no array transfer).
        const proj = stand.crossProjections[projKey];
        if (proj) proj._gpuBound = true;
        // CHAT.1 — record the bound matrix name so gpuSparsePropagateAuto skips
        // the dense pre payload (the donor discards it for bound matrices anyway).
        if (!this._cortexBoundNames) this._cortexBoundNames = new Set();
        this._cortexBoundNames.add(matrixKey);
      } else {
        console.warn(`[Brain] rebind ${matrixKey} failed — GPU Hebbian will still use standalone path for this projection`);
      }
    }
    console.log(`[Brain] ${bound}/${projNames.length} cross-projections now cluster-bound to main cortex slices`);
    this._cortexCrossProjectionsBound = bound > 0;
  },

  /**
   * Dispatch sparse Hebbian via binary frame.
   */
  async gpuSparseHebbian(name, preSpikes, postSpikes, lr) {
    // Backpressure gate — see gpuSparsePropagate.
    if (!this._gpuSparseFlowOk()) return null;
    const reqId = this._nextSparseReqId();
    const pre = preSpikes instanceof Uint32Array ? preSpikes
      : preSpikes instanceof Uint8Array ? Uint32Array.from(preSpikes)
      : new Uint32Array(preSpikes || []);
    const post = postSpikes instanceof Uint32Array ? postSpikes
      : postSpikes instanceof Uint8Array ? Uint32Array.from(postSpikes)
      : new Uint32Array(postSpikes || []);
    const hdr = this._encodeSparseHeader(3, reqId, name);
    const preLen = Buffer.alloc(4);
    preLen.writeUInt32LE(pre.length, 0);
    const postLen = Buffer.alloc(4);
    postLen.writeUInt32LE(post.length, 0);
    const lrBuf = Buffer.alloc(4);
    lrBuf.writeFloatLE(lr || 0.01, 0);
    const preBuf = Buffer.from(pre.buffer, pre.byteOffset, pre.byteLength);
    const postBuf = Buffer.from(post.buffer, post.byteOffset, post.byteLength);
    // v0.3.15 - repeat compression on the BODY (the header carries a fresh reqId
    // every call, so equality is judged on everything after it — pre + post + lr).
    // A type-3 repeat rides a real reqId and the donor acks it as type 3, so the
    // await contract is identical. Cache discipline: only trust the cache when the
    // socket is far below any drop threshold (a dropped-but-cached frame would
    // make a later repeat re-execute the WRONG payload); any uncertainty deletes
    // the key so the next identical payload ships full.
    const body = Buffer.concat([preLen, preBuf, postLen, postBuf, lrBuf]);
    if (this._donorRepeatTeach()) {
      const ws = this._gpuClient;
      const safeToCache = ws && ws.readyState === 1 && ws.bufferedAmount < 64 * 1024 * 1024;
      const cache = this._teachRepeatCacheFor(ws);
      const key = '3:' + name;
      if (safeToCache) {
        const prevBody = cache.get(key);
        if (prevBody && prevBody.equals(body)) {
          const rep = this._encodeRepeatFrame(3, reqId, name);
          this._countTeachOut(12, rep.length, (hdr.length + body.length) - rep.length, this._teachGopsFor(name, 1));  // TEACHCREDIT — a repeat re-executes the same full-matrix op
          return this._sparseSendBinary(rep, reqId, 30_000);
        }
        cache.set(key, body);
      } else {
        cache.delete(key);
      }
    }
    const full = Buffer.concat([hdr, body]);
    this._countTeachOut(3, full.length, 0, this._teachGopsFor(name, 1));  // TEACHCREDIT — one full-matrix Hebbian pass
    return this._sparseSendBinary(full, reqId, 30_000);
  },
};

module.exports = { SERVER_GPU_MIXIN, DF7_MILESTONES, MAIN_BRAIN_BYTES_PER_NEURON };
