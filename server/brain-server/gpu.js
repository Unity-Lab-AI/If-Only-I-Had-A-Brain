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

const SERVER_GPU_MIXIN = {
  async _gpuStep(clusterName) {
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
    const psiGain = Math.max(0.8, Math.min(1.5, 0.9 + (this.psi || 0) * 0.004));
    const emotionalGate = 0.7 + (this.arousal || 0.5) * 0.6;
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
  async _gpuBatch(substeps, clusterParams) {
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

    this._gpuClient.send(JSON.stringify({
      type: 'compute_batch',
      batchId,
      substeps,
      clusters: clusterParams,
      // Ψ flows to GPU so per-cluster regionGates can be updated every
      // tick via hemisphereGate(side, Ψ). Mystery Ψ is woven into the
      // main equation; lateralized cortex regions modulate drive by
      // Ψ-driven binding coefficient, matching biological split-brain +
      // global-workspace consciousness interpretation.
      psi: this.psi ?? 0,
    }));

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
    return new Promise((resolve) => {
      this._gpuBatchPending = { batchId, resolve };
      setTimeout(() => {
        if (this._gpuBatchPending && this._gpuBatchPending.batchId === batchId) {
          this._gpuBatchPending = null;
          // Consecutive-timeout counter — diagnostic. If the GPU is
          // really hung we'll see this number climb while successful
          // batches stay at 0. Reset by the compute_batch_result
          // handler on any successful batch.
          this._gpuBatchConsecutiveTimeouts = (this._gpuBatchConsecutiveTimeouts || 0) + 1;
          const queuePending = this._boundHebbianBatch?.ops?.length || 0;
          const lost = this._gpuDeviceLost ? ' (device.lost flagged during this batch)' : '';
          console.warn(`[Brain] compute_batch ${batchId} timed out after ${TIMEOUT_MS / 1000}s — GPU may be hung. Consecutive timeouts: ${this._gpuBatchConsecutiveTimeouts}. Bound-Hebbian queue: ${queuePending}.${lost}`);
          if (this._gpuBatchConsecutiveTimeouts >= 3 && !this._gpuHangLogged) {
            console.warn('[Brain] compute_batch consecutive-timeout threshold reached — GPU pipeline likely unrecoverable without compute.html reload. Main brain tick loop will keep waiting; curriculum work paused.');
            this._gpuHangLogged = true;
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
    if (this._gpuDispatchTimestamps.length > 5000) {
      const cutoff = Date.now() - 30000;
      this._gpuDispatchTimestamps = this._gpuDispatchTimestamps.filter(t => t >= cutoff);
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
  _recomputeCommunityCompute() {
    let totalMB = 0, donorCount = 0;
    if (this._gpuClients) {
      for (const ws of this._gpuClients) {
        if (!ws || ws.readyState !== 1) continue;
        const c = this.clients && this.clients.get(ws);
        const vram = (c && c.gpuVramMB) || 0;
        if (vram > 0) totalMB += vram;
        donorCount++;
      }
    }
    this._communityComputeMB = totalMB;
    this._communityDonorCount = donorCount;

    // Milestone tiers: (min community VRAM, min donor count) → target neuron
    // scale. Conservative under replication (Path A) — the running brain must
    // fit a typical donor. Tune as real donor hardware is observed.
    const MILESTONES = [
      { minCommunityMB: 0,       minDonors: 1,  neurons: 6_000_000 },   // tier 0 — bootstrap, fits a modest GPU
      { minCommunityMB: 24_000,  minDonors: 3,  neurons: 40_000_000 },  // tier 1 — a few mid GPUs
      { minCommunityMB: 96_000,  minDonors: 6,  neurons: 150_000_000 }, // tier 2 — community momentum
      { minCommunityMB: 256_000, minDonors: 10, neurons: 357_000_000 }, // tier 3 — top-computer scale
    ];
    let tier = 0;
    for (let i = 0; i < MILESTONES.length; i++) {
      if (totalMB >= MILESTONES[i].minCommunityMB && donorCount >= MILESTONES[i].minDonors) tier = i;
    }
    this._communityTier = tier;
    this._communityTierTarget = MILESTONES[tier].neurons;

    // Up-only milestone gate: flag a pending resize when we ENTER a higher
    // tier than the brain is currently RUNNING at, debounced via a stability
    // window the execution layer enforces (so a flapping donor can't thrash a
    // resize). Record candidate + entry time; do NOT execute here.
    const runningTier = this._communityTierRunning || 0;
    if (tier > runningTier && tier !== this._communityTierPending) {
      this._communityTierPending = tier;
      this._communityTierPendingSince = Date.now();
      console.log(`[Brain] PA.4.8 — community-compute milestone candidate: tier ${tier} (${totalMB.toLocaleString()}MB across ${donorCount} donor(s) → target ${MILESTONES[tier].neurons.toLocaleString()} neurons). Resize+retrain fires once held past the stability window — NOT on this connection alone.`);
    } else if (tier <= runningTier && this._communityTierPending && tier < this._communityTierPending) {
      // Dropped below the pending candidate before it executed — cancel
      // (critical mass not sustained).
      this._communityTierPending = null;
      this._communityTierPendingSince = null;
    }
  },

  _sparseSend(msg, timeoutMs = 30000) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return Promise.resolve(null);
    if (!this._gpuSparsePending) this._gpuSparsePending = new Map();
    const reqId = this._nextSparseReqId();
    msg.reqId = reqId;
    // I.17 — record dispatch for cross-platform GPU activity metric.
    this._recordGpuDispatch();
    this._gpuClient.send(JSON.stringify(msg));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this._gpuSparsePending && this._gpuSparsePending.has(reqId)) {
          this._gpuSparsePending.delete(reqId);
          console.warn(`[Brain] sparse dispatch reqId=${reqId} type=${msg.type} timed out after ${timeoutMs}ms`);
          resolve(null);
        }
      }, timeoutMs);
      this._gpuSparsePending.set(reqId, { resolve, reject, timeout });
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

  async _sparseSendBinary(msgBuffer, reqId, timeoutMs = 120_000) {
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return Promise.resolve(null);
    if (!this._gpuSparsePending) this._gpuSparsePending = new Map();
    // I.17 — record dispatch for cross-platform GPU activity metric.
    // Binary frames are the HIGH-volume path during _teachHebbian +
    // _teachAssociationPairs; counting these is what makes the
    // dispatch-rate metric meaningful at biological scale.
    this._recordGpuDispatch();
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
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return Promise.resolve(null);
    if (this._gpuClient.bufferedAmount > BUFFERED_AMOUNT_DROP_THRESHOLD) {
      const awaitStart = Date.now();
      while (this._gpuClient && this._gpuClient.readyState === 1
             && this._gpuClient.bufferedAmount > BUFFERED_AMOUNT_DROP_THRESHOLD) {
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
          this._gpuShadowDirty = true;
          if (!this._wsLastDropLogMs || (Date.now() - this._wsLastDropLogMs) >= 5000) {
            this._wsLastDropLogMs = Date.now();
            console.error(`[Brain] CRITICAL backpressure DROP after ${MAX_AWAIT_MS}ms await — ws.bufferedAmount=${(this._gpuClient.bufferedAmount/1024/1024).toFixed(1)}MB > ${BUFFERED_AMOUNT_DROP_THRESHOLD/1024/1024}MB. ${this._wsDroppedCount} total drops since boot. GPU shadow marked DIRTY; full resync scheduled before next teach-phase Hebbian fire. CPU + GPU weights are diverging — cortical-microstructure projections will mis-fire until resync lands.`);
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
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return Promise.resolve(null);
    this._gpuClient.send(msgBuffer, (err) => {
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
        console.warn(`[Brain] sparse binary reqId=${reqId} ERROR: ${err.message}`);
      }
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this._gpuSparsePending && this._gpuSparsePending.has(reqId)) {
          this._gpuSparsePending.delete(reqId);
          resolve(null);
        }
      }, timeoutMs);
      this._gpuSparsePending.set(reqId, { resolve, reject, timeout });
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
  _gpuSparseFlowOk() {
    const c = this._gpuClient;
    if (!c || c.readyState !== 1) return false;
    const pending = this._gpuSparsePending ? this._gpuSparsePending.size : 0;
    if (pending >= 4) return false;
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
  async gpuSparseUpload(name, matrix, binding) {
    const reqId = this._nextSparseReqId();
    const rows = matrix.rows;
    const cols = matrix.cols;
    const values = matrix.values instanceof Float32Array ? matrix.values : new Float32Array(matrix.values || []);
    const colIdx = matrix.colIdx instanceof Uint32Array ? matrix.colIdx : new Uint32Array(matrix.colIdx || []);
    const rowPtr = matrix.rowPtr instanceof Uint32Array ? matrix.rowPtr : new Uint32Array(matrix.rowPtr || []);
    const nnz = values.length;

    // 16 MB NNZ worth ≈ 2M nnz/chunk × 8 bytes (4 values + 4 colIdx)
    const CHUNK_NNZ = 2_000_000;
    const totalChunks = Math.max(1, Math.ceil(nnz / CHUNK_NNZ));
    const rowPtrBuf = Buffer.from(rowPtr.buffer, rowPtr.byteOffset, rowPtr.byteLength);
    const totalMb = ((values.byteLength + colIdx.byteLength + rowPtr.byteLength) / 1e6).toFixed(1);
    const hasBinding = !!(binding && binding.srcCluster && binding.dstCluster);
    console.log(`[Brain] sparse chunked upload reqId=${reqId} name=${name} totalChunks=${totalChunks} totalSize=${totalMb}MB${hasBinding ? ` (cluster-bound: ${binding.srcCluster}[${binding.srcRegion.start}..${binding.srcRegion.end}] → ${binding.dstCluster}[${binding.dstRegion.start}..${binding.dstRegion.end}])` : ''}`);

    // Pre-register the pending promise BEFORE sending any chunks so
    // the ack handler can find it even if client ACKs very fast.
    if (!this._gpuSparsePending) this._gpuSparsePending = new Map();
    const promise = new Promise((resolve, reject) => {
      const timeoutMs = 180_000;
      const timeout = setTimeout(() => {
        if (this._gpuSparsePending && this._gpuSparsePending.has(reqId)) {
          this._gpuSparsePending.delete(reqId);
          console.warn(`[Brain] sparse chunked upload reqId=${reqId} name=${name} timed out after ${timeoutMs}ms`);
          resolve(null);
        }
      }, timeoutMs);
      this._gpuSparsePending.set(reqId, { resolve, reject, timeout });
    });

    if (!this._gpuClient || this._gpuClient.readyState !== 1) return null;

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
      const colIdxHdr = Buffer.alloc(8);
      colIdxHdr.writeUInt32LE(colIdxByteOff, 0);
      colIdxHdr.writeUInt32LE(colIdxByteLen, 4);
      const colIdxSlice = Buffer.from(colIdx.buffer, colIdx.byteOffset + colIdxByteOff, colIdxByteLen);
      const pieces = isFirst
        ? (hasBinding
            ? [hdr, chunkMeta, firstMeta, rowPtrBuf, bindingBlock, valuesHdr, valuesSlice, colIdxHdr, colIdxSlice]
            : [hdr, chunkMeta, firstMeta, rowPtrBuf, valuesHdr, valuesSlice, colIdxHdr, colIdxSlice])
        : [hdr, chunkMeta, valuesHdr, valuesSlice, colIdxHdr, colIdxSlice];
      const frame = Buffer.concat(pieces);
      // Send chunk. WebSocket preserves order. Wait for the send
      // callback so we don't flood the send buffer with hundreds of
      // MB at once — backpressure per chunk.
      await new Promise((res) => {
        this._gpuClient.send(frame, (err) => {
          if (err) {
            console.warn(`[Brain] sparse chunk reqId=${reqId} seq=${seq}/${totalChunks} ERROR: ${err.message}`);
          }
          res();
        });
      });
    }
    console.log(`[Brain] sparse chunked upload reqId=${reqId} name=${name} all ${totalChunks} chunks dispatched, awaiting ack`);
    return promise;
  },

  /**
   * Dispatch sparse propagate via binary frame: currents = matrix @ preSpikes.
   * Returns Float32Array (or null on timeout).
   */
  async gpuSparsePropagate(name, preSpikes) {
    // Backpressure gate — if the WS send buffer is backed up, skip this
    // shadow instead of queueing another doomed request.
    if (!this._gpuSparseFlowOk()) return null;
    const reqId = this._nextSparseReqId();
    const pre = preSpikes instanceof Uint32Array ? preSpikes
      : preSpikes instanceof Uint8Array ? Uint32Array.from(preSpikes)
      : new Uint32Array(preSpikes || []);
    const hdr = this._encodeSparseHeader(2, reqId, name);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(pre.length, 0);
    const preBuf = Buffer.from(pre.buffer, pre.byteOffset, pre.byteLength);
    const full = Buffer.concat([hdr, lenBuf, preBuf]);
    const result = await this._sparseSendBinary(full, reqId, 30_000);
    if (!result || !result.currents) return null;
    return result.currents; // Float32Array assembled by ack handler
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
    // queue overflows the cap too, the call becomes a no-op (CPU remains
    // authoritative on Hebbian per cluster.js intraSynapsesHebbian's
    // fire-and-forget contract, so dropped GPU shadow is safe).
    return this._enqueueBoundHebbian(name, lr);
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
      return Promise.resolve(null);
    }
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
  _flushBoundHebbianBatch() {
    const batch = this._boundHebbianBatch;
    if (!batch) return;
    if (batch.flushTimer) {
      clearTimeout(batch.flushTimer);
      batch.flushTimer = null;
    }
    const ops = batch.ops;
    if (ops.length === 0) return;
    batch.ops = [];

    if (!this._gpuClient || this._gpuClient.readyState !== 1) {
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

    const batchPromise = this._sparseSendBinary(frame, reqId, 30_000);
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
  async gpuSparsePropagateBound(name) {
    return this.gpuSparsePropagate(name, new Uint32Array(0));
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
    const arr = Array.isArray(sparseIndices)
      ? sparseIndices
      : (sparseIndices && typeof sparseIndices.length === 'number')
        ? Array.from(sparseIndices)
        : [];
    this._gpuClient.send(JSON.stringify({
      type: 'write_spike_slice',
      clusterName: 'cortex',
      regionName,
      sparseIndices: arr,
    }));
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
    const idx = Array.isArray(sparseIndices) ? sparseIndices : Array.from(sparseIndices || []);
    const val = Array.isArray(sparseValues)  ? sparseValues  : Array.from(sparseValues || []);
    if (idx.length === 0 || idx.length !== val.length) return;
    this._gpuClient.send(JSON.stringify({
      type: 'write_current_slice',
      clusterName: 'cortex',
      regionName,
      sparseIndices: idx,
      sparseValues: val,
      psi: this.psi ?? 0,
    }));
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
    this._gpuClient.send(JSON.stringify({
      type: 'clear_spike_region',
      clusterName: 'cortex',
      regionName,
    }));
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
      motor:     [0.967, 1.000],
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
    const full = Buffer.concat([hdr, preLen, preBuf, postLen, postBuf, lrBuf]);
    return this._sparseSendBinary(full, reqId, 30_000);
  },
};

module.exports = { SERVER_GPU_MIXIN };
