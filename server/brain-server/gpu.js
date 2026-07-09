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
        if (eff > 0) { totalMB += eff; if (eff < minDonorMB) minDonorMB = eff; }
        donorCount++;
      }
    }
    this._communityComputeMB = totalMB;
    this._communityDonorCount = donorCount;
    // ASCALE caveat (data-parallel): every donor holds the FULL replica, so the brain's max SIZE is
    // bounded by the SMALLEST donor's committed VRAM — NOT the community SUM (which is a throughput
    // metric). Tracked + logged for the size-tier(min-donor) vs throughput-tier(Σ Gn/s)
    // reconciliation. The milestone tiers below still gate on the (now effective) sum; a full
    // size-tier rewire onto min-donor is the flagged architectural follow-up.
    this._communityMinDonorMB = (donorCount > 0 && minDonorMB !== Infinity) ? Math.round(minDonorMB) : 0;
    const settings = this._getAutoScaleSettings();

    // Milestone tiers: (min community VRAM, min donor count) → target neuron
    // scale. Conservative under replication (Path A) — the running brain must
    // fit a typical donor. Tune as real donor hardware is observed.
    const MILESTONES = [
      { minCommunityMB: 0,       minDonors: 1,  neurons: 6_000_000 },   // tier 0 — bootstrap, fits a modest GPU
      { minCommunityMB: 24_000,  minDonors: 3,  neurons: 40_000_000 },  // tier 1 — a few mid GPUs
      { minCommunityMB: 96_000,  minDonors: 6,  neurons: 150_000_000 }, // tier 2 — community momentum
      { minCommunityMB: 256_000, minDonors: 10, neurons: 357_000_000 }, // tier 3 — top-computer scale
    ];
    // RAW tier — highest tier whose bare thresholds are met. This is the
    // display/telemetry value (what the community currently qualifies for).
    let tier = 0;
    for (let i = 0; i < MILESTONES.length; i++) {
      if (totalMB >= MILESTONES[i].minCommunityMB && donorCount >= MILESTONES[i].minDonors) tier = i;
    }
    this._communityTier = tier;
    this._communityTierTarget = MILESTONES[tier].neurons;

    // DF.7 DEAD-ZONE — UPGRADE tier uses BUFFERED thresholds. To count as
    // "entered" for the purpose of triggering a resize, community compute must
    // exceed the tier's VRAM gate by bufferPct (hysteresis) AND meet the donor
    // floor. This is Gee's dead-zone: hovering right at a gate (one donor
    // flapping connect/disconnect) never trips a resize — only a genuine,
    // sustained surplus past the buffer does. With bufferPct=0 it reduces to
    // the raw gate.
    const buffer = 1 + (settings.bufferPct || 0);
    let upgradeTier = 0;
    for (let i = 0; i < MILESTONES.length; i++) {
      const vramGate = MILESTONES[i].minCommunityMB * buffer;
      const donorGate = Math.max(MILESTONES[i].minDonors, settings.minDonorsFloor || 1);
      if (totalMB >= vramGate && donorCount >= donorGate) upgradeTier = i;
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
      console.log(`[Brain] DF.7/PA.4.8 — milestone candidate: tier ${upgradeTier} (${Math.round(totalMB).toLocaleString()}MB EFFECTIVE DONATED across ${donorCount} donor(s); smallest donor commits ${this._communityMinDonorMB.toLocaleString()}MB ⚠ data-parallel SIZE is bounded by THIS, not the sum, past the ${(settings.bufferPct * 100).toFixed(0)}% dead-zone → target ${MILESTONES[upgradeTier].neurons.toLocaleString()} neurons). Resize fires only if held ≥${settings.stabilityMin}min — a single donor joining/leaving will NOT trigger it.`);
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
    // ONLY when community compute collapses BELOW the running tier's VRAM floor
    // by more than downBufferPct AND stays there past downStabilityMin do we
    // rectify — retrain at the biggest tier the surviving GPUs can actually
    // hold. Far more conservative than upscale (a downscale loses the bigger
    // brain's learning), so a transient mass-disconnect (10 people leaving then
    // returning) never shrinks the brain. `_computeInsufficient` flags the
    // admin alert the instant compute can't hold the running tier, regardless
    // of the buffer/window (so you SEE the problem before any rectify fires).
    const runningFloorMB = MILESTONES[runningTier] ? MILESTONES[runningTier].minCommunityMB : 0;
    this._runningFloorMB = runningFloorMB;
    this._computeInsufficient = (runningTier > 0) && (totalMB < runningFloorMB);
    if (settings.autoDownscale && runningTier > 0) {
      const downGate = runningFloorMB * (1 - (settings.downBufferPct || 0));
      if (totalMB < downGate) {
        // Pick the biggest tier the surviving compute can actually hold (raw —
        // no buffer; we want the largest brain that fits, not a timid floor).
        let fitTier = 0;
        for (let i = 0; i < MILESTONES.length; i++) {
          if (totalMB >= MILESTONES[i].minCommunityMB && donorCount >= MILESTONES[i].minDonors) fitTier = i;
        }
        if (fitTier < runningTier && fitTier !== this._communityDownTierPending) {
          this._communityDownTierPending = fitTier;
          this._communityDownTierPendingTarget = MILESTONES[fitTier].neurons;
          this._communityDownTierPendingSince = Date.now();
          console.warn(`[Brain] DF.7 — DOWNSCALE candidate: compute ${totalMB.toLocaleString()}MB fell >${(settings.downBufferPct * 100).toFixed(0)}% below the running tier ${runningTier} floor (${runningFloorMB.toLocaleString()}MB). If HELD ≥${settings.downStabilityMin}min, rectify by retraining at tier ${fitTier} (${MILESTONES[fitTier].neurons.toLocaleString()} neurons). A transient mass-disconnect will NOT trigger it.`);
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

  // DF.7 F3 — CAPACITY-WEIGHTED donor selector for independent (stateless) work
  // units. Was flat round-robin (`idx % len`, equal share → slowest donor became
  // the barrier); now one smooth-weighted-round-robin step so the next donor is
  // picked ∝ strength (throughput × health). Slow/laggy donors get proportionally
  // fewer units; >1s-RTT donors get none while a healthy donor exists. Single
  // donor / fan-out OFF → that donor.
  _nextPoolDonor() {
    const donors = this._livePoolDonors();
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
    return process.env.DREAM_DF7_FANOUT_PROPAGATE === '1';
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
      if (!_cc._bindSkipWarned) {
        _cc._bindSkipWarned = true;
        console.warn(`[Brain] DF.7 F8 — donor ${_cc.gpuName || _cc.id} maxBind ${_bindCap}MB < ${_minBind}MB floor — NOT replica-syncing (can't bind cortex matrices; would 0-compute after a wasted upload). Stays connected but excluded from the fan-out.`);
      }
      return;
    }
    if (_cc) _cc._bindIncapable = false;
    if (!this._replicaSyncInFlight) this._replicaSyncInFlight = new Set();
    if (this._replicaSyncInFlight.has(ws)) return;
    this._replicaSyncInFlight.add(ws);
    try {
      // 1) init the replica's cluster LIF buffers (mirror _gpuStep first-dispatch).
      const clusters = Object.keys(this.CLUSTER_SIZES || {});
      for (const clusterName of clusters) {
        const size = this.CLUSTER_SIZES[clusterName];
        if (!size || !ws || ws.readyState !== 1) continue;
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
      const reg = this._replicaMatrixRegistry;
      let synced = 0;
      if (reg && reg.size) {
        for (const [name, entry] of reg) {
          if (!ws || ws.readyState !== 1) break;
          try { await this.gpuSparseUpload(name, entry.matrix, entry.binding, ws); synced++; }
          catch { /* skip a matrix that failed; rebroadcast will retry */ }
        }
      }
      console.log(`[Brain] DF.7 — replica sync complete: ${synced} matrices + ${clusters.length} clusters pushed to a donor. It now holds a FULL brain replica and shares compute (no longer idle standby).`);
    } catch (e) {
      console.warn('[Brain] DF.7 — replica sync failed (donor stays standby until next rebroadcast):', e.message);
    } finally {
      this._replicaSyncInFlight.delete(ws);
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
      await this._gpuParallelMap(replicas, (ws) => this._syncReplicaToDonor(ws));
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
    ws.send(msgBuffer, (err) => {
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
    const ws = (targetWs && targetWs.readyState === 1) ? targetWs : this._gpuClient;
    const isReplicaSync = !!(targetWs && targetWs !== this._gpuClient);
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
    if (isReplicaSync && (!matrix || !matrix.values || matrix.values.length === 0)) {
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
      // #112.3 — FAIL FAST. Was 180s: a stuck/dropped donor upload hung for 3
      // minutes before the loop moved on, and with no retry it declared PARTIAL
      // → CPU fallback. 45s + the per-matrix retry in initGpu means a transient
      // failure recovers quickly and a truly-gone donor is detected in ~45s, not
      // 3 minutes. Tunable via DREAM_SPARSE_UPLOAD_TIMEOUT_MS.
      const timeoutMs = Number(process.env.DREAM_SPARSE_UPLOAD_TIMEOUT_MS) > 0
        ? Number(process.env.DREAM_SPARSE_UPLOAD_TIMEOUT_MS)
        : 45_000;
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
        ws.send(frame, (err) => {
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
        if (_prtt > 200 || _mbps > 0) {
          const _capEnv = Number(process.env.DREAM_DF7_SYNC_PACE_MAX_MS);
          const _capMs = Number.isFinite(_capEnv) && _capEnv > 0 ? _capEnv : 200;
          // RTT proxy: ~RTT/8 between chunks. Bandwidth-aware (WSQ.4 hint, preferred when present):
          // ~half this chunk's transmit time at the donor's measured downlink so we don't outrun the
          // link. Take the max of the two, capped (DREAM_DF7_SYNC_PACE_MAX_MS).
          const _rttPace = _prtt > 200 ? Math.round(_prtt / 8) : 0;
          const _bwPace = _mbps > 0 ? Math.round(((valuesByteLen + colIdxByteLen) * 8 / 1e6) / _mbps * 1000 * 0.5) : 0;
          const _paceMs = Math.min(_capMs, Math.max(_rttPace, _bwPace));
          if (_paceMs > 0) await new Promise((r) => setTimeout(r, _paceMs));
        }
      }
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
      targetWs = this._nextPoolDonor();
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
    const target = (this._df7Fanout && this._df7Fanout()) ? this._nextPoolDonor() : this._gpuClient;
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
      this._armShadowResync('teach-hebbian batch shed at soft cap'); // dirty on the clearable flag + resync actually armed
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
    const target = this._df7FanoutPropagate() ? this._nextPoolDonor() : null;
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
  _armShadowResync(reason) {
    if (this.cortexCluster) this.cortexCluster._gpuShadowDirty = true;
    const now = Date.now();
    const alreadyArmed = (this._cortexGpuInitStarted === false) || (this._cortexUploadInFlight === true);
    if (alreadyArmed) return;
    if (this._shadowAutoResyncAt && (now - this._shadowAutoResyncAt) <= 60000) return;
    this._shadowAutoResyncAt = now;
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
  _donorPatternSendGated(json) {
    const ws = this._gpuClient;
    if (!ws || ws.readyState !== 1) return false;
    if (ws.bufferedAmount > this._donorSoftCapBytes()) {
      this._wsPatternShedCount = (this._wsPatternShedCount || 0) + 1;
      this._armShadowResync('teach-pattern frame shed at soft cap'); // dirty on the clearable flag + resync actually armed
      const now = Date.now();
      if (!this._wsPatternShedLogMs || (now - this._wsPatternShedLogMs) > 30000) {
        this._wsPatternShedLogMs = now;
        console.warn(`[Brain] TU.28.1 — teach-pattern frame SHED: ws.bufferedAmount=${(ws.bufferedAmount / 1024 / 1024).toFixed(1)}MB > ${(this._donorSoftCapBytes() / 1024 / 1024)}MB soft cap. This stream previously had NO backpressure guard (buffer grew to GB scale, donor pings queued 19s+, compute tab crash-looped). Dropping is safe — CPU authoritative; GPU shadow re-converges via auto-resync once the buffer drains. ${this._wsPatternShedCount} pattern frames shed since boot (rate-limited 30s).`);
      }
      return false;
    }
    ws.send(json);
    return true;
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
    const idx = Array.isArray(sparseIndices) ? sparseIndices : Array.from(sparseIndices || []);
    const val = Array.isArray(sparseValues)  ? sparseValues  : Array.from(sparseValues || []);
    if (idx.length === 0 || idx.length !== val.length) return;
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
    const json = JSON.stringify({
      type: 'clear_spike_region',
      clusterName: 'cortex',
      regionName,
    });
    if (!this._donorPatternSendGated(json)) return;   // TU.28.1 — soft-cap gate (stream was unguarded)
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
