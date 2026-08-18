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
const DF7_MILESTONES = [
  { minCommunityMB: 0,       minDonors: 1,  neurons: 6_000_000 },   // tier 0 — bootstrap, fits a modest GPU
  { minCommunityMB: 24_000,  minDonors: 3,  neurons: 40_000_000 },  // tier 1 — a few mid GPUs
  { minCommunityMB: 96_000,  minDonors: 6,  neurons: 150_000_000 }, // tier 2 — community momentum
  { minCommunityMB: 256_000, minDonors: 10, neurons: 357_000_000 }, // tier 3 — top-computer scale
    ];

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
      const _sinceAnchorMs = _now - Math.max(this._lastBatchOkMs || 0, this._designedPauseSeenMs || 0);
      if (!_pausedByDesign && _live && this._lastBatchOkMs && _sinceAnchorMs > _STALL_MS) {
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
      psi: this.psi ?? 0,
    };
    this._gpuClient.send(JSON.stringify(_batchMsg));

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
    if (this._df7Fanout && this._df7Fanout() && typeof this._livePoolDonors === 'function') {
      const _mirrorMsg = JSON.stringify({ ..._batchMsg, batchId: -batchId, mirror: true });
      const _linkCap = (typeof this._donorLinkCapBytes === 'function') ? this._donorLinkCapBytes() : 64 * 1024 * 1024;
      for (const _ws of this._livePoolDonors()) {
        if (_ws === this._gpuClient || !_ws || _ws.readyState !== 1) continue;
        if (((_ws.bufferedAmount) || 0) > _linkCap) continue;   // busy receiving its replica
        try { _ws.send(_mirrorMsg); } catch { /* a dropped mirror is never fatal */ }
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
          t.roundTripMs = rtMs;
          // EMA over ~20 batches; seeded by the first sample so it converges fast.
          t.roundTripEmaMs = t.samples === 1 ? rtMs : (t.roundTripEmaMs * 0.95 + rtMs * 0.05);
          t.donorComputeMs = donorMs;
          t.unaccountedMs = (donorMs != null) ? Math.max(0, rtMs - donorMs) : null;
          t.donorReports = donorMs != null;
          t.substeps = substeps;
          // Sparse dispatches issued while this batch was in flight — the
          // queue-depth proxy (how much other traffic shared the donor socket).
          t.dispatchesDuring = (this._gpuDispatchTotal || 0) - _dispatchAtSend;
          this._perfStats.batchTiming = t;
          if (!this._batchTimingLogMs || (Date.now() - this._batchTimingLogMs) > 30000) {
            this._batchTimingLogMs = Date.now();
            const donorTxt = donorMs != null
              ? `donor=${donorMs.toFixed(0)}ms · UNACCOUNTED=${t.unaccountedMs.toFixed(0)}ms (wire + blocked loop)`
              : 'donor=not-reported (native donor sends no phaseTimingMs — the unaccounted split needs a browser donor or a donor-side port)';
            console.log(`[Brain] TICK-GAP — compute_batch round-trip ${rtMs}ms (ema ${t.roundTripEmaMs.toFixed(0)}ms) · substeps=${substeps} · ${donorTxt} · sparse dispatches in flight during batch=${t.dispatchesDuring}. Rate-limited 30s.`);
          }
        } catch { /* telemetry must never break a tick */ }
        resolve(value);
      };
      this._gpuBatchPending = { batchId, resolve: _instrumentedResolve };
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
  /**
   * DF.7 — load admin-configurable auto-scale settings (toggle + dead-zone
   * buffer + stability window) from server/autoscale-settings.json, defaulting
   * sanely on first boot. These govern WHEN the community-compute milestone
   * resize is allowed to fire. Gee 2026-06-20: the auto-relearn must be gated
   * WITH A BUFFER (a dead-zone) + admin-controllable so it "doesnt try to
   * relearn the second it hits a gate of available users compute connected so
   * that any one person disconnecting doesnt downgrade the brains fucntioning".
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
      // SIZING BASELINE — data-parallel sizing assumes a committed replica donor
      // holds at least this card class (operator directive); the size driver
      // never drops below it, so small cards can never shrink the brain. Tune
      // via the admin autoscale endpoint / autoscale-settings.json.
      donorBaselineMB: 16384,
      // Donor-replica cost estimator (bytes/neuron): ~12B GPU Rulkov state +
      // sparse-matrix share. The first-cut 42 (host-CSR semantics) was ~2x too
      // conservative and REFUSED a 16GB card that provably runs 357M locally
      // (live incident: runningFloor 21797MB vs the card's 16375MB -> no
      // primary -> CPU-only grind -> curriculum never started).
      // and host sizing agree.
      donorBytesPerNeuron: 20,
      // DF.7 downscale rectify — "buffers for the buffers". A downscale is far
      // more conservative than an upscale because it RETRAINS at a smaller size
      // (loses the bigger brain's learning), so it must only fire on a genuine,
      // SUSTAINED collapse of compute — never a transient mass-disconnect.
      autoDownscale: true,  // toggle — when compute can't hold the running tier,
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
          donorBytesPerNeuron: Number.isFinite(saved.donorBytesPerNeuron) ? Math.max(8, Math.min(1024, saved.donorBytesPerNeuron)) : defaults.donorBytesPerNeuron,
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
    // size is driven by what the smallest COMMITTED donor can hold — floored by
    // the operator baseline (donors are assumed to hold at least that card
    // class; smaller cards are assist-lane and never lower the driver). The
    // community SUM stays a THROUGHPUT metric only.
    const _baselineMB = settings.donorBaselineMB || 16384;
    const _driverMB = Math.max(_baselineMB, this._communityMinDonorMB || 0);
    const _bytesPerNeuron = settings.donorBytesPerNeuron || 20;
    // Mirrors local host sizing: 75% of the card usable minus a 2GB reserve.
    const _capNeurons = Math.max(0, Math.floor(((_driverMB * 0.75 - 2048) * 1048576) / _bytesPerNeuron));
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
    // (hysteresis). This is Gee's dead-zone: hovering right at a gate (one
    // donor flapping connect/disconnect) never trips a resize — only a genuine,
    // sustained surplus past the buffer does. With bufferPct=0 it reduces to
    // the raw gate. Donor-count gates are retired for SIZING (the baseline
    // assumption covers a lone donor). Tiers already covered by the BASELINE
    // capacity skip the buffer entirely — the baseline cannot flap, so there
    // is nothing to hysteresis against.
    const buffer = 1 + (settings.bufferPct || 0);
    let upgradeTier = 0;
    for (let i = 0; i < MILESTONES.length; i++) {
      if (_baseCapNeurons >= MILESTONES[i].neurons || _capNeurons >= MILESTONES[i].neurons * buffer) upgradeTier = i;
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
    const _runningNeurons = MILESTONES[runningTier] ? MILESTONES[runningTier].neurons : 0;
    // VRAM a single replica donor needs to hold the running tier — inverse of
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
          console.warn(`[Brain] DF.7 — DOWNSCALE candidate: size-driver capacity ~${_capNeurons.toLocaleString()} neurons fell >${(settings.downBufferPct * 100).toFixed(0)}% below the running tier ${runningTier} target (${_runningNeurons.toLocaleString()} neurons; driver ${_driverMB.toLocaleString()}MB vs floor ${runningFloorMB.toLocaleString()}MB). With the baseline assumption this only happens if the admin lowers donorBaselineMB. If HELD >=${settings.downStabilityMin}min, rectify by retraining at tier ${fitTier} (${MILESTONES[fitTier].neurons.toLocaleString()} neurons). A transient mass-disconnect will NOT trigger it.`);
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
        this._persistTierAndRestart(pending, this._communityTierPendingTarget || 6_000_000,
          `UP-scale: milestone tier ${pending} held ≥${settings.stabilityMin}min past the dead-zone`);
        return;
      }
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
  _persistTierAndRestart(tier, targetNeurons, reason) {
    try {
      const fsx = require('fs');
      const px = require('path');
      fsx.writeFileSync(
        px.join(__dirname, '..', 'community-tier.json'),
        JSON.stringify({ tier, targetNeurons, confirmedAtMs: Date.now() }, null, 2),
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
    global._brainShutdownRequested = true;
    setTimeout(() => process.exit(0), 1500);
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
    const _linkCap = this._donorLinkCapBytes();
    const _drained = scored.filter((s) => ((s.ws && s.ws.bufferedAmount) || 0) <= _linkCap);
    if (_drained.length > 0) scored = _drained;
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
  // Master switch. DEFAULT ON (Gee 2026-06-28: "we need fanout=1 set auto … when
  // I do the update and fresh walk" + Sponge asleep, so it can't depend on a
  // manual systemd-unit env edit). Enables: strongest-donor primary promotion +
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
  _maybeRebalancePrimary() {
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
      console.log(`[Brain] DF.7 F4 — rebalancing PRIMARY → healthier donor (${bc && bc.gpuName || '?'} score=${bestScore.toFixed(1)} vs current ${cc && cc.gpuName || '?'} score=${curScore.toFixed(1)}). Previous primary stays a replica + re-syncs.`);
      this._gpuClient = best;
      this._gpuConnected = true;
      this._gpuInitialized = {};
      this._gpuInitializedConfirmed = {};
      if (typeof this._rearmCortexGpuUpload === 'function') {
        try { this._rearmCortexGpuUpload('F4 periodic primary rebalance'); } catch { /* non-fatal */ }
      }
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
   * mechanism that stops the brain being "stuck on one GPU" (Gee 2026-06-20):
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
  async _syncReplicaToDonor(ws) {
    if (!ws || ws.readyState !== 1) return;
    if (ws === this._gpuClient) return;   // primary is the master — nothing to replicate
    if (!this._gpuClient) return;         // no master established yet
    // DF.7 — DEFER the full replica sync while the curriculum is actively teaching
    // (Gee 2026-07-15, "the cpu should not be fucking up the gpus trying to do
    // work"). Pushing the full ~366MB cortex_intraSynapses + 16 matrices to a
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
        const _prio = ['cortex', 'hippocampus', 'amygdala', 'basalGanglia', 'hypothalamus', 'mystery', 'cerebellum'];
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
          try {
            const _res = await this.gpuSparseUpload(name, entry.matrix, entry.binding, ws);
            // gpuSparseUpload resolves null on timeout/abort — only a non-null result proves
            // the donor actually holds it. Recording it regardless is how a donor ends up
            // being handed work for a matrix it never received.
            if (_res !== null && _res !== undefined) {
              synced++;
              if (_cc) {
                _cc.heldMatrices.add(name);
                if (_cc.heldMatrices.size === 1) {
                  console.log(`[Brain] DF.7 INCREMENTAL — donor ${_cc.gpuName || _cc.id} holds its first matrix (${name}) and is now work-eligible for it; remaining matrices stream in behind it.`);
                }
              }
            }
          } catch { /* skip a matrix that failed; rebroadcast will retry */ }
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
      console.log(`[Brain] DF.7 — replica sync complete: ${synced} matrices pushed to a donor${_coverage ? ` (PARTIAL coverage [${[..._coverage].join(', ')}] — it shares compute for the clusters it holds)` : '. It now holds a FULL brain replica and shares compute (no longer idle standby)'}.`);
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
      for (const _ws of replicas) { await this._syncReplicaToDonor(_ws); }
      this._lastReplicaRebroadcastMs = Date.now();
      console.log(`[Brain] DF.7 — master re-broadcast to ${replicas.length} replica(s) complete (GPU shadows re-converged to the CPU master, in parallel).`);
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
        if (this._gpuSparsePending && this._gpuSparsePending.has(reqId)) {
          this._gpuSparsePending.delete(reqId);
          console.warn(`[Brain] sparse dispatch reqId=${reqId} type=${msg.type} timed out after ${timeoutMs}ms`);
          resolve(null);
        }
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
  // ⚠ 64MiB HARD MESSAGE CAP remains on native donors: at hop 2 (~20M rows)
  // the intra rowPtr alone is ~80MB — that needs a donor-side protocol change
  // (segmented rowPtr) + release BEFORE the next growth. Tripwire warn below.
  _wsSendFrag(ws, buf, cb) {
    const LIMIT = 15 * 1024 * 1024; // margin under the ~16MiB native frame ceiling
    if (!buf || buf.length <= LIMIT) { ws.send(buf, cb); return; }
    if (buf.length > 60 * 1024 * 1024 && (!this._fragCapWarnMs || (Date.now() - this._fragCapWarnMs) > 60000)) {
      this._fragCapWarnMs = Date.now();
      console.warn(`[Brain] fragmented WS message is ${(buf.length / 1048576).toFixed(1)}MB — approaching/exceeding the native donor's 64MiB MESSAGE cap. Native donors may refuse it; this is the hop-2 rowPtr-segmentation prerequisite (donor release).`);
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

  async _sparseSendBinary(msgBuffer, reqId, timeoutMs = 120_000, targetWs = null) {
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
      const timeout = setTimeout(() => {
        if (this._gpuSparsePending && this._gpuSparsePending.has(reqId)) {
          this._gpuSparsePending.delete(reqId);
          resolve(null);
        }
      }, timeoutMs);
      this._gpuSparsePending.set(reqId, { resolve, reject, timeout, ws }); // TU.25.D — target-tagged for cancel-on-disconnect
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
  _gpuSparseFlowOk(targetWs = null) {
    // DF.7 — check the chosen donor's flow when targeting a replica, else the
    // primary's. Keeps the per-donor backpressure gate honest during fan-out.
    const c = (targetWs && targetWs.readyState === 1) ? targetWs : this._gpuClient;
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
  async gpuSparseUpload(name, matrix, binding, targetWs = null) {
    // DF.7 — target a specific donor when given (replica sync), else the
    // primary (canonical upload). Track every CANONICAL upload in the replica
    // registry so a newly-joined donor can be brought to a FULL brain replica
    // by replaying these. Replica-sync uploads (targetWs set) don't re-track.
    let ws = (targetWs && targetWs.readyState === 1) ? targetWs : this._gpuClient;
    const isReplicaSync = !!(targetWs && targetWs !== this._gpuClient);
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
        for (const _r of this._livePoolDonors()) {
          if (!_r || _r === this._gpuClient || _r.readyState !== 1) continue;
          let _seen = this._replicaMirrorAt.get(_r);
          if (!_seen) { _seen = new Map(); this._replicaMirrorAt.set(_r, _seen); }
          if (nowMs - (_seen.get(name) || 0) < MIRROR_THROTTLE_MS) continue;
          _seen.set(name, nowMs);
          this.gpuSparseUpload(name, matrix, binding, _r).catch(() => {});
        }
      }
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
    const hasBinding = !!(binding && binding.srcCluster && binding.dstCluster);
    console.log(`[Brain] sparse chunked upload reqId=${reqId} name=${name} totalChunks=${totalChunks} totalSize=${totalMb}MB${hasBinding ? ` (cluster-bound: ${binding.srcCluster}[${binding.srcRegion.start}..${binding.srcRegion.end}] → ${binding.dstCluster}[${binding.dstRegion.start}..${binding.dstRegion.end}])` : ''}`);

    // Pre-register the pending promise BEFORE sending any chunks so
    // the ack handler can find it even if client ACKs very fast.
    if (!this._gpuSparsePending) this._gpuSparsePending = new Map();
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
      const timeout = setTimeout(() => {
        if (this._gpuSparsePending && this._gpuSparsePending.has(reqId)) {
          this._gpuSparsePending.delete(reqId);
          console.warn(`[Brain] sparse chunked upload reqId=${reqId} name=${name} timed out after ${timeoutMs}ms`);
          resolve(null);
        }
      }, timeoutMs);
      this._gpuSparsePending.set(reqId, { resolve, reject, timeout, ws }); // TU.25.D — target-tagged for cancel-on-disconnect
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
      // UPLOAD GC FIX (2026-08-16, Gee: "lots of time just being burnt up") —
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
      if (isFirst) console.log(`[Brain] sparse upload ${name} first frame = ${(frame.length / 1048576).toFixed(1)}MB${frame.length > 15 * 1024 * 1024 ? ` — FRAGMENTED into ${Math.ceil(frame.length / (15 * 1024 * 1024))} WS continuation frames (native donor frame ceiling ~16MiB; message reassembles up to 64MiB)` : ' (under the ~16MiB native frame ceiling — sent whole)'}.`);
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
        const _loBytes = (Number.isFinite(_loMbEnv) && _loMbEnv > 0 ? _loMbEnv : 8) * 1024 * 1024;
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
    console.log(`[Brain] sparse chunked upload reqId=${reqId} name=${name} all ${totalChunks} chunks dispatched, awaiting ack`);
    return promise;
  },

  /**
   * Dispatch sparse propagate via binary frame: currents = matrix @ preSpikes.
   * Returns Float32Array (or null on timeout).
   */
  async gpuSparsePropagate(name, preSpikes, targetWs = null) {
    const pre = preSpikes instanceof Uint32Array ? preSpikes
      : preSpikes instanceof Uint8Array ? Uint32Array.from(preSpikes)
      : new Uint32Array(preSpikes || []);
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
    if (!this._gpuSparseFlowOk(targetWs)) return null;
    const reqId = this._nextSparseReqId();
    const hdr = this._encodeSparseHeader(2, reqId, name);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(pre.length, 0);
    const preBuf = Buffer.from(pre.buffer, pre.byteOffset, pre.byteLength);
    const full = Buffer.concat([hdr, lenBuf, preBuf]);
    const result = await this._sparseSendBinary(full, reqId, 30_000, targetWs);
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
    const ws = this._gpuClient;
    if (ws && ws.readyState === 1 && ws._sparseV2 === true) {
      return this.gpuSparsePropagateSparseIdx(name, preSpikes);
    }
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
   * ONE PROCESS (Gee 2026-07-17: "the minds eye and voice go on the GPU ...
   * its one process not bolted together shit") — mind-space op dispatch to the
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
   * Payloads are SMALL (≤192² frames ≈ 150KB, recs are KBs) → JSON+base64 is
   * the right wire; nothing like the 6MB spike arrays. Timeout → null; the
   * caller (MindSpaceWorkerProxy) holds the rollout ramp until v0.3.11 is the
   * min donor version (sparseV2 precedent — ramp removal is a logged milestone).
   */
  _mindspaceDonorCapable(op) {
    const ws = this._gpuClient;
    if (!(ws && ws.readyState === 1 && ws._mindspaceV1 === true)) return false;
    // Per-op capability: a donor may advertise a `mindspaceOps` list (the native
    // binary ships perceive/describe/stylizeField/traceLineArt first; de-novo
    // imagineFromState lands with its glyph-plane port). No list = all ops
    // (the browser donor hosts the full MindSpaceGPU surface).
    if (op && ws._mindspaceOps && !ws._mindspaceOps.has(op)) return false;
    return true;
  },

  async gpuMindspaceOp(op, payload, timeoutMs = 30_000) {
    const ws = this._gpuClient;
    if (!this._mindspaceDonorCapable(op)) return null;
    if (!this._mindspacePending) this._mindspacePending = new Map();
    if (!this._mindspaceReqId) this._mindspaceReqId = 1;
    const id = this._mindspaceReqId++;
    return new Promise((resolve) => {
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
    try {
      ws.send(JSON.stringify({
        type: 'hebbian_ranges',
        name,
        lr,
        reps: Math.max(1, Math.min(1000, Math.round(reps || 1))),
        preRanges,
        postRanges,
      }));
      this._hebbianRangesSent = (this._hebbianRangesSent || 0) + 1;
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
    // CHAT PRIORITY (CHAT.3) — while a live reply is composing, DELAY the
    // teach hebbian flush (re-arm 250ms) so the donor's serial onmessage
    // handler serves emission dispatches first. The queue keeps accumulating;
    // at the 1024-op cap it flushes anyway (bounded delay, bounded drops —
    // both under the existing fire-and-forget shed contract).
    if (this._chatPriorityActive && this._chatPriorityActive() && ops.length < 1000) {
      batch.flushTimer = setTimeout(() => this._flushBoundHebbianBatch(), 250);
      return;
    }
    batch.ops = [];

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
    const target = (this._df7Fanout && this._df7Fanout()) ? this._nextPoolDonor(ops.map(_o => _o.name)) : this._gpuClient;
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
  async gpuSparsePropagateBound(name) {
    // DF.7 — when fan-out is ON, spread the bound propagate round-robin across
    // the pool so the idle replica GPUs compute (their resident state is kept
    // current by _mirrorCortexWriteToReplicas). Default: targetWs=null →
    // primary (today's exact behavior). Result routing is by reqId, so an ACK
    // from any donor resolves correctly.
    const target = this._df7FanoutPropagate() ? this._nextPoolDonor(name) : null;
    return this.gpuSparsePropagate(name, new Uint32Array(0), target);
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
      // fresh teach freeze on top of active teaching (Gee's "freeze for 30").
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
    // (Gee: replies took up to 30s with chat stuck behind the teach firehose).
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
  _countTeachOut(type, bytes, savedBytes = 0) {
    if (!this._teachOutByType) this._teachOutByType = {};
    const k = 't' + type;
    const e = this._teachOutByType[k] || (this._teachOutByType[k] = { frames: 0, bytes: 0 });
    e.frames += 1;
    e.bytes += bytes;
    if (savedBytes > 0) this._teachOutBytesSaved = (this._teachOutBytesSaved || 0) + savedBytes;
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
  _gpuInitLangPseudoCluster() {
    this._langPseudoInit = false;
    const cortex = this.cortexCluster;
    if (!cortex || !cortex.regions || !cortex.size) return;
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return;
    if (!this._donorSpikeTemplateTeach()) return;   // pre-0.3.17 donor — intra stays CPU exactly as before
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
      this._gpuClient.send(JSON.stringify({
        type: 'gpu_init',
        clusterName: 'langCortex',
        size: cortex.size,
        tonicDrive: 0,
        noiseAmp: 0,
        lifParams: { tau: 20, Vrest: -65, Vthresh: -50, Vreset: -70, dt: 1, R: 1, tRefrac: 2 },
        regions,
      }));
      this._langPseudoInit = true;
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
   * GPU received (matrix.values is Float64 on the CPU but gpuSparseUpload
   * downcasts to Float32 — so hashing the f32 view is what matches the donor's
   * digest). Chunked + setImmediate-yielded so a 14MB matrix hash never pins the
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
    let hash = FNV_OFFSET;
    const CHUNK = 1_000_000; // yield every ~1MB so the diagnostic never pins the loop
    for (let i = 0; i < bytes.length; i++) {
      hash = (hash ^ BigInt(bytes[i])) & MASK;
      hash = (hash * PRIME) & MASK;
      if ((i & (CHUNK - 1)) === (CHUNK - 1)) await new Promise(r => setImmediate(r));
    }
    const cap = Math.min(sampleCount | 0, 64);
    const samples = [];
    if (cap > 0) {
      const step = Math.max(1, Math.floor(nnz / cap));
      for (let i = 0; i < nnz && samples.length < cap; i += step) samples.push({ idx: i, val: f32[i] });
    }
    return { found: true, nnz, checksum: hash.toString(), samples };
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
      // WMB word_motor band (Gee 2026-07-15) — lockstep with brain-server.js
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
          this._countTeachOut(12, rep.length, (hdr.length + body.length) - rep.length);
          return this._sparseSendBinary(rep, reqId, 30_000);
        }
        cache.set(key, body);
      } else {
        cache.delete(key);
      }
    }
    const full = Buffer.concat([hdr, body]);
    this._countTeachOut(3, full.length);
    return this._sparseSendBinary(full, reqId, 30_000);
  },
};

module.exports = { SERVER_GPU_MIXIN, DF7_MILESTONES };
