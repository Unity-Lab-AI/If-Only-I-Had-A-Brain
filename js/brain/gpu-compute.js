/**
 * gpu-compute.js — WebGPU Compute Shaders for Neural Simulation
 *
 * Moves the heavy math to the GPU:
 *   - LIF neuron update: τ·dV/dt = -(V-Vrest) + R·I
 *   - Synapse propagation: I = Σ W·spike (sparse CSR)
 *   - Plasticity: ΔW = η·δ·pre·post
 *
 * Falls back to CPU Float64Array if WebGPU not available.
 * Double-buffers neuron state to avoid read-write conflicts.
 *
 * Usage:
 *   const gpu = new GPUCompute();
 *   if (await gpu.init()) {
 *     // GPU path
 *     gpu.uploadCluster(cluster);
 *     gpu.stepNeurons(dt, currents);
 *     const spikes = gpu.readbackSpikes();
 *   }
 */

// ── WGSL Shaders ────────────────────────────────────────────────

// RULKOV MAP NEURON — Rulkov 2002, "Modeling of spiking-bursting neural
// behavior using two-dimensional map", Phys. Rev. E 65, 041922.
//
//   x_{n+1} = α / (1 + x_n²) + y_n
//   y_{n+1} = y_n − μ·(x_n − σ)
//
// Two-variable discrete chaotic map that produces real biological
// spike-burst dynamics — the fast variable x generates sub-millisecond
// spikes on top of slow variable y driving burst envelopes. Used in
// large-scale published cortical simulations (Bazhenov, Rulkov,
// Shilnikov 2005+) and shown to reproduce experimentally observed
// firing patterns from thalamic relay, cortical pyramidal, and
// cerebellar Purkinje cells depending on (α, σ) parameterization.
//
// Parameters:
//   α ≈ 4.5  — nonlinearity, fixed near chaotic regime. Higher α =
//              longer bursts. Range 4.0-6.0 for bursting, 2.0-4.0 for
//              tonic spiking.
//   μ ≈ 0.001 — slow timescale. Ratio of slow-to-fast variable update.
//   σ       — external drive. Biological tonic/synaptic input maps here.
//              σ ∈ [-1.5, 0.5] is the useful range. Higher σ → more spikes.
//
// Spike detection: x crosses zero from below in a single tick. The
// fast variable jumps from ≈-1 to ≈α+y=+4 when the neuron spikes, so
// (x_old ≤ 0) ∧ (x_new > 0) is a clean edge detector.
//
// State: stored as vec2<f32> per neuron = (x, y). Doubles the buffer
// from 4 to 8 bytes/neuron — at 400K cerebellum that's 3.2MB, fine.
const LIF_SHADER = /* wgsl */`
  struct Params {
    n: u32,
    tau: f32,        // unused — Rulkov has no membrane time constant
    vRest: f32,      // unused
    vThresh: f32,    // unused
    vReset: f32,     // unused
    dt: f32,         // unused
    R: f32,          // unused
    effectiveDrive: f32,  // mapped to Rulkov σ (external drive)
    noiseAmp: f32,   // y-channel jitter to prevent phase lock
    seed: u32,
    gridX: u32,
    numRegions: u32,       // T17.7 Phase A.3 — how many entries in regionGates to scan
  };

  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var<storage, read_write> state: array<vec2<f32>>;  // (x, y) per neuron
  @group(0) @binding(2) var<storage, read_write> spikes: array<u32>;
  @group(0) @binding(3) var<storage, read> currents: array<f32>;           // T18.4.a — per-neuron synaptic current
  // T17.7 Phase A.3 — per-region hemispheric gate table. Packed as a
  // flat f32 array where each region takes 4 entries: [start, end,
  // gate, pad]. numRegions (in params) tells the shader how many
  // regions to scan. Gate is precomputed server-side as
  // hemisphereGate(side, psi) = 0.5 + 0.5 * sigmoid(psi * 4.0) for
  // lateralized regions, 1.0 for bilateral/center. When a neuron
  // index falls outside every registered region, gate defaults to
  // 1.0 (homogeneous-cortex neurons outside language sub-regions).
  //
  // Mystery psi binding constraint: the shader's per-neuron drive
  // is modulated by neuronDrive * regionGate
  // so psi is woven into the main equation at the firing-decision
  // level, not just in the global gainMultiplier already baked into
  // effectiveDrive. Two psi factors — one global (gainMultiplier),
  // one per-region (hemispheric binding) — matching the
  // consciousness architecture where psi both modulates overall
  // cortical gain AND shapes hemispheric integration.
  @group(0) @binding(4) var<storage, read> regionGates: array<f32>;

  fn pcg(v: u32) -> u32 {
    var s = v * 747796405u + 2891336453u;
    var word = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
    return (word >> 22u) ^ word;
  }

  fn randomFloat(seed: u32, idx: u32) -> f32 {
    let hash = pcg(seed ^ (idx * 1664525u + 1013904223u));
    return f32(hash) / 4294967295.0;
  }

  // T17.7 Phase A.3 — resolve per-neuron region gate via linear scan
  // of the regionGates table. At 8 regions per cluster this is 8
  // iterations per neuron per tick — negligible vs the Rulkov arithmetic.
  // Returns 1.0 if the neuron index doesn't fall in any registered
  // region (homogeneous-cortex population outside sub-regions).
  fn lookupRegionGate(neuronIdx: u32, numRegions: u32) -> f32 {
    for (var r = 0u; r < numRegions; r = r + 1u) {
      let base = r * 4u;
      let start = u32(regionGates[base]);
      let end = u32(regionGates[base + 1u]);
      if (neuronIdx >= start && neuronIdx < end) {
        return regionGates[base + 2u];
      }
    }
    return 1.0;
  }

  @compute @workgroup_size(256)
  fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x + id.y * params.gridX * 256u;
    if (i >= params.n) { return; }

    // Load 2D state. Guard against uninitialized / NaN by reseeding in
    // the basin of the bursting attractor.
    var xy = state[i];
    var x = xy.x;
    var y = xy.y;
    if (x != x || y != y || abs(x) > 100.0 || abs(y) > 100.0) {
      let phi = 0.61803398875;
      x = -1.0 + fract(f32(i) * phi) * 0.5;        // (-1.0, -0.5)
      y = -3.2 + fract(f32(i) * phi * 1.7) * 0.4;  // (-3.2, -2.8) — attractor basin
    }

    // Map biological drive to Rulkov σ. Unity's tonic drives run 8-20,
    // modulated to effectiveDrive ~ 6-40. Normalize to σ ∈ [-1.0, 0.5]:
    // silent cortex at σ≈-1, bursting cerebellum at σ≈0.3, saturated at 0.5.
    //
    // T18.4.a — per-neuron synaptic current from SYNAPSE_PROPAGATE_SHADER
    // (intra-cluster recurrence) plus any uploaded external / incoming
    // projection current gets added to the global drive BEFORE sigma
    // normalization. Without this the main brain was running with zero
    // synaptic coupling — every neuron saw only the global drive uniform,
    // the intra-cluster synapse matrix was uploaded but never consumed.
    //
    // T17.7 Phase A.3 — hemispheric gate modulates per-neuron drive
    // based on the neuron's region membership + global Ψ. Gate is
    // precomputed server-side per region as hemisphereGate(side, Ψ)
    // and uploaded via regionGates buffer; shader looks up the gate
    // for this neuron's index via linear scan over registered
    // regions. Low Ψ → lateralized regions dampen (hemispheric
    // divergence, one side dominant). High Ψ → gate trends 1.0
    // (bilateral binding, global-workspace integration). Homogeneous
    // cortex neurons outside any registered region get gate=1.0
    // (no lateralization). Mystery Ψ binding in the main equation.
    let regionGate = lookupRegionGate(i, params.numRegions);
    let neuronDrive = (params.effectiveDrive + currents[i]) * regionGate;
    let driveNorm = clamp(neuronDrive / 40.0, 0.0, 1.0);
    let sigma = -1.0 + driveNorm * 1.5;
    let alpha = 4.5;      // fixed nonlinearity — bursting regime
    let mu = 0.001;       // slow timescale

    // Rulkov map iteration
    let xNext = alpha / (1.0 + x * x) + y;
    // y update uses current x, not xNext (per Rulkov 2002)
    let jitter = (randomFloat(params.seed, i) - 0.5) * params.noiseAmp * 0.0001;
    let yNext = y - mu * (x - sigma) + jitter;

    // Spike = fast variable crossed zero upward this tick. The Rulkov
    // spike is a one-step jump from x≈-1 to x≈α+y ≈ +1.5..+3.5, so
    // this edge detector catches exactly one spike per action potential.
    if (x <= 0.0 && xNext > 0.0) {
      spikes[i] = 1u;
    } else {
      spikes[i] = 0u;
    }

    state[i] = vec2<f32>(xNext, yNext);
  }
`;

const SYNAPSE_PROPAGATE_SHADER = /* wgsl */`
  struct Params {
    n: u32,          // number of post-synaptic neurons
    nnz: u32,        // total non-zero entries
    srcOffset: u32,  // T17.7 Phase A.4 — read spikes at [srcOffset + colIdx[k]] when cluster-bound
    dstOffset: u32,  // T17.7 Phase A.4 — write currents at [dstOffset + i] when cluster-bound
  };

  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var<storage, read> values: array<f32>;    // CSR values
  @group(0) @binding(2) var<storage, read> colIdx: array<u32>;    // CSR column indices
  @group(0) @binding(3) var<storage, read> rowPtr: array<u32>;    // CSR row pointers
  @group(0) @binding(4) var<storage, read> spikes: array<u32>;    // pre-synaptic spikes (slice of cluster spikes when cluster-bound)
  @group(0) @binding(5) var<storage, read_write> currents: array<f32>; // output currents (slice of cluster currents when cluster-bound)

  @compute @workgroup_size(256)
  fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.n) { return; }

    var sum: f32 = 0.0;
    let start = rowPtr[i];
    let end = rowPtr[i + 1u];

    for (var k = start; k < end; k++) {
      let j = colIdx[k];
      if (spikes[params.srcOffset + j] != 0u) {
        sum += values[k];
      }
    }

    // T17.7 Phase A.4 — write to destination offset within the bound
    // cluster's currents buffer. When the sparse matrix is STANDALONE
    // (default standalone mode), srcOffset+dstOffset are both 0 and
    // behavior is identical to pre-A.4 — spikes[] and currents[] point
    // to the matrix's own preSpikes/postCurrents buffers with indices
    // starting at 0.
    currents[params.dstOffset + i] += sum;
  }
`;

// PLASTICITY_SHADER — Oja's rule (Oja 1982, J Math Biol 15:267).
//
// Prior shader was bare Hebbian: w += lr × reward when both pre and post
// fire. Weights grew monotonically to wMax, and because motor has ~20K
// neurons across 26 letter buckets shared by hundreds of trained pairs,
// every pair stacked onto the same outgoing columns — basins superposed
// into mush (sep-probe mean-cos climbed toward 0.5+).
//
// Oja adds a subtractive y²·w term that self-normalizes the weight vector
// per post neuron AND orthogonalizes it against inputs that fired
// post-alone. For binary spikes (y ∈ {0,1}) y² = y, so when post fires:
//   Δw = lr·y·(x - y·w) = lr·(x - w)
//   new_w = w·(1 - lr) + lr·x
// When pre also fires (x=1): w climbs toward 1 — w ← w + lr·(1-w)
// When pre doesn't fire (x=0): w decays toward 0 — w ← w·(1-lr)
// The decay-when-post-alone is the decorrelator: new pairs push active
// (pre,post) weights up WHILE pulling down weights where only post was
// firing, creating competition between inputs to the same post neuron.
//
// Touches every nnz in a firing row instead of only the pre-active ones,
// so roughly 2-3× more work per plasticity call at fanout 30. Worth it —
// the overlap collapse was the actual blocker on K emission discrimination.
const PLASTICITY_SHADER = /* wgsl */`
  struct Params {
    n: u32,
    nnz: u32,
    lr: f32,         // learning rate (also Oja's η)
    reward: f32,     // reward signal multiplier (applied to Oja lr)
    wMin: f32,
    wMax: f32,
    srcOffset: u32,  // T17.7 Phase A.4 — preSpikes[srcOffset + j] when cluster-bound
    dstOffset: u32,  // T17.7 Phase A.4 — postSpikes[dstOffset + i] when cluster-bound
  };

  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var<storage, read_write> values: array<f32>;
  @group(0) @binding(2) var<storage, read> colIdx: array<u32>;
  @group(0) @binding(3) var<storage, read> rowPtr: array<u32>;
  @group(0) @binding(4) var<storage, read> preSpikes: array<u32>;
  @group(0) @binding(5) var<storage, read> postSpikes: array<u32>;

  @compute @workgroup_size(256)
  fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.n) { return; }
    if (postSpikes[params.dstOffset + i] == 0u) { return; }

    // Effective learning rate magnitude. Sign of lr selects mode:
    //   lr > 0 → Oja's rule (self-normalizing Hebbian)
    //   lr < 0 → anti-Hebbian (pure decrement on co-active only)
    // Reward stays a positive multiplier on the effective rate. The
    // caller encodes mode by picking the sign of lr; the batched
    // plasticity dispatch then routes anti-Hebbian updates through
    // the same WebSocket frame type and pipeline as Oja updates.
    let eta = abs(params.lr) * params.reward;
    let start = rowPtr[i];
    let end = rowPtr[i + 1u];

    if (params.lr >= 0.0) {
      // OJA mode. Walk all nnz in the post-firing row:
      //   x=1 (pre also fires): w' = w·(1−eta) + eta·1 = w + eta·(1−w)  → climbs toward 1
      //   x=0 (pre silent):     w' = w·(1−eta) + 0     = w·(1−eta)     → decays toward 0
      // The decay-when-post-alone is the decorrelator.
      let decay = 1.0 - eta;
      let climb = eta;
      for (var k = start; k < end; k++) {
        let j = colIdx[k];
        let x = f32(preSpikes[params.srcOffset + j]);
        var w = values[k] * decay + climb * x;
        w = clamp(w, params.wMin, params.wMax);
        values[k] = w;
      }
    } else {
      // ANTI-HEBBIAN mode. Only decrements co-active (pre=1, post=1)
      // entries. No post-alone decay — that's Oja's job on positive
      // passes, and applying it here would inadvertently PUMP UP
      // weights where only post fires (y²·w inversion). Used by the
      // contrastive push-pull in _teachAssociationPairs /
      // _teachQABinding: caller samples a wrong pair and fires
      // this mode at |lr| to push that co-activation apart.
      for (var k = start; k < end; k++) {
        let j = colIdx[k];
        if (preSpikes[params.srcOffset + j] != 0u) {
          var w = values[k] - eta;
          w = clamp(w, params.wMin, params.wMax);
          values[k] = w;
        }
      }
    }
  }
`;

// T18.4.a cleanup — CURRENT_GEN_SHADER REMOVED.
//
// Prior incarnation wrote `currents[i] = effectiveDrive + noise` as a
// separate GPU dispatch before LIF. LIF_SHADER now does per-neuron
// drive inline via `neuronDrive = effectiveDrive + currents[i]`, where
// `currents[i]` is populated by SYNAPSE_PROPAGATE_SHADER (and optional
// CPU-side `writeExternalCurrents` upload). So a dedicated "write drive
// + noise" kernel is redundant. Keeping it around with no pipeline
// bound would be textbook vestigial organ code.

// T18.4.c — Voltage mean reduction. Atomic accumulator over the
// Rulkov x-component of every neuron's (x, y) state. WebGPU atomics
// only work on u32/i32, so we scale voltages by VOLT_SCALE=1000 and
// add as i32 (Rulkov x ranges ~±3, so ×1000 fits in signed i32
// comfortably even at 1B neurons: 3000 × 1e9 = 3e12 > 2^31, so we
// divide work across two accumulators if size > 2M — handled by
// the caller). Mean = total / size / VOLT_SCALE on readback.
//
// Full-systems wire: dispatched once per tick after LIF_SHADER,
// result is reduced in a 4-byte readback and included in
// compute_batch_result's perCluster.meanVoltage field so server's
// getState() exposes it to the dashboard/HUD. Previously main-brain
// clusters had NO voltage telemetry at all — voltages lived on GPU
// and nothing aggregated them.
const VOLTAGE_STATS_SHADER = /* wgsl */`
  struct Params {
    n: u32,
    gridX: u32,
    _pad0: u32, _pad1: u32,
  };

  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var<storage, read> state: array<vec2<f32>>;
  @group(0) @binding(2) var<storage, read_write> voltSum: array<atomic<i32>>;

  @compute @workgroup_size(256)
  fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x + id.y * params.gridX * 256u;
    if (i >= params.n) { return; }
    // Rulkov fast-var x is the "voltage analog" for monitoring.
    // Scale by 1000 and truncate to i32 for atomic accumulation.
    let scaled = i32(state[i].x * 1000.0);
    atomicAdd(&voltSum[0], scaled);
  }
`;

// Spike count shader — atomic counter, no CPU scan needed
const SPIKE_COUNT_SHADER = /* wgsl */`
  struct Params {
    n: u32,
    gridX: u32,
    _pad0: u32, _pad1: u32,
  };

  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var<storage, read> spikes: array<u32>;
  @group(0) @binding(2) var<storage, read_write> count: array<atomic<u32>>;

  @compute @workgroup_size(256)
  fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x + id.y * params.gridX * 256u;
    if (i >= params.n) { return; }
    if (spikes[i] != 0u) {
      atomicAdd(&count[0], 1u);
    }
  }
`;

// ── GPU Compute Manager ─────────────────────────────────────────

export class GPUCompute {
  constructor() {
    this._device = null;
    this._available = false;
    this._pipelines = {};
    this._buffers = {};
    this._ping = 0; // double-buffer index
    // Standalone sparse matrices keyed by name (not tied to any single
    // cluster). Used for T14.4 cross-region projections + any other
    // sparse structure that lives outside a cluster's intra-cluster
    // synapse matrix. Each entry: { rows, cols, nnz, values, colIdx,
    // rowPtr, preSpikes, postCurrents } where each field after
    // rows/cols/nnz is a GPUBuffer.
    this._sparseMatrices = {};
  }

  /**
   * Initialize WebGPU. Returns true if GPU is available.
   */
  async init() {
    if (!navigator.gpu) {
      console.log('[GPUCompute] WebGPU not available — using CPU fallback');
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      });
      if (!adapter) {
        console.log('[GPUCompute] No GPU adapter found');
        return false;
      }

      this._device = await adapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
          maxBufferSize: adapter.limits.maxBufferSize,
        },
      });

      // T18.6.a — device.lost handler. WebGPU fires this promise when the
      // device crashes (most common cause: VRAM exhaustion during
      // biological-scale sparse matrix upload; also driver timeouts,
      // system sleep, OOM kills). Without this handler every subsequent
      // `createBuffer` / dispatch returns the phantom error
      //   "createBuffer failed, size (N) is too large for the
      //    implementation when mappedAtCreation == true"
      // regardless of the actual requested size — the misleading error
      // is WebGPU's undiagnosable failure mode on a dead device. Setting
      // `_deviceLost` + clearing `_available` lets call sites short-
      // circuit fast instead of cascading thousands of phantom errors.
      // The `_onDeviceLost` callback is optional, consumed by compute.html
      // to surface the event back to the server over WebSocket so the
      // server log shows the real cause.
      this._deviceLost = false;
      this._deviceLostInfo = null;
      this._device.lost.then((info) => {
        this._deviceLost = true;
        this._deviceLostInfo = info;
        this._available = false;
        const reason = info && info.reason ? info.reason : 'unknown';
        const message = info && info.message ? info.message : '(no message)';
        console.error(`[GPUCompute] DEVICE LOST — reason=${reason} message=${message}`);
        console.error('[GPUCompute] Every subsequent GPU call will fail with phantom "size too large" errors regardless of the real size. Most common cause: VRAM exhaustion during biological-scale sparse upload. Reload compute.html after fixing the underlying cause (lower cortex N via GPUCONFIGURE.bat or server-side rescale).');
        if (typeof this._onDeviceLost === 'function') {
          try { this._onDeviceLost(info); } catch { /* non-fatal */ }
        }
      });

      // Log GPU info (API changed: requestAdapterInfo → info property in newer Chrome)
      const info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {});
      console.log(`[GPUCompute] GPU: ${info.device || info.description || info.vendor || 'detected'}`);
      console.log(`[GPUCompute] Max buffer: ${(adapter.limits.maxBufferSize / 1048576).toFixed(0)}MB`);
      // PA.4.8 — expose adapter info + capacity limits on the instance so
      // compute.html can report this donor's GPU capacity to the brain server
      // on gpu_register (community-compute milestone scaling). WebGPU doesn't
      // expose true VRAM; maxBufferSize / maxStorageBufferBindingSize are the
      // best available capacity proxies and correlate with GPU tier.
      this._adapterInfo = info || {};
      this._maxBufferSize = adapter.limits.maxBufferSize || 0;
      this._maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize || 0;

      // Create compute pipelines
      this._createPipelines();
      this._available = true;
      return true;
    } catch (err) {
      console.warn('[GPUCompute] Init failed:', err.message);
      return false;
    }
  }

  /**
   * T18.6.a — register a callback fired when WebGPU emits device.lost.
   * Used by compute.html to surface the lost state to the brain server
   * over WebSocket so the server log records the real crash cause
   * instead of just observing downstream phantom "size too large"
   * errors. Call AFTER `init()` returns true. No-op when the device
   * already lost before the callback was registered — in that case the
   * caller should check `_deviceLost` explicitly and handle the
   * already-dead case at the call site.
   */
  setDeviceLostCallback(cb) {
    this._onDeviceLost = cb;
  }

  _createPipelines() {
    const device = this._device;

    this._pipelines.lif = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({ code: LIF_SHADER }),
        entryPoint: 'main',
      },
    });

    this._pipelines.propagate = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({ code: SYNAPSE_PROPAGATE_SHADER }),
        entryPoint: 'main',
      },
    });

    this._pipelines.plasticity = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({ code: PLASTICITY_SHADER }),
        entryPoint: 'main',
      },
    });

    // currentGen pipeline removed — LIF shader generates currents inline

    this._pipelines.spikeCount = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({ code: SPIKE_COUNT_SHADER }),
        entryPoint: 'main',
      },
    });

    // T18.4.c — voltage mean reduction pipeline.
    this._pipelines.voltStats = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({ code: VOLTAGE_STATS_SHADER }),
        entryPoint: 'main',
      },
    });

    this._stepSeed = 0; // increments each step for noise variation
  }

  /**
   * T18.14.b — destroy every WebGPU buffer on a cluster buffers entry.
   * Called from `uploadCluster` before overwriting `this._buffers[name]`
   * so re-init on WS reconnect (server's `ws.on('close')` resets
   * `_gpuInitialized={}` → tick loop re-sends `gpu_init` → compute.html
   * calls `gpu.uploadCluster` again) doesn't orphan ~6.3 GB of VRAM
   * (cortex 107M + cerebellum 143M + 5 smaller clusters at 16 bytes /
   * neuron for voltages + spikes + currents). Each `.destroy()` wrapped
   * in try/catch so double-free on a dead device is non-fatal;
   * `bufs=undefined` is a no-op. Matches the `_destroySparseEntryBuffers`
   * pattern from T18.11.a for sparse matrices.
   */
  _destroyClusterBuffers(bufs) {
    if (!bufs) return;
    const fields = [
      'params', 'voltages', 'spikes', 'currents', 'regionGates',
      'synValues', 'synColIdx', 'synRowPtr',
      'voltSumBuf', 'spikeCountBuf',
    ];
    let reclaimedMB = 0;
    for (const f of fields) {
      const b = bufs[f];
      if (b && typeof b.destroy === 'function') {
        try {
          if (typeof b.size === 'number') reclaimedMB += b.size / (1024 * 1024);
          b.destroy();
        } catch { /* already gone */ }
      }
    }
    if (reclaimedMB > 0.1) {
      console.log(`[GPUCompute] _destroyClusterBuffers: reclaimed ~${reclaimedMB.toFixed(1)} MB of VRAM from prior cluster buffer set`);
    }
  }

  /**
   * Upload a cluster's neuron and synapse data to GPU buffers.
   * @param {string} name — cluster name
   * @param {number} size — number of neurons
   * @param {Float64Array} voltages — initial voltages (converted to f32)
   * @param {SparseMatrix} synapses — CSR synapse matrix
   * @param {object} lifParams — LIF parameters
   * @param {object} [regions] — T17.7 Phase A — optional sub-region slice
   *   metadata. Shape: `{auditory: {start, end}, visual: {start, end}, ...}`.
   *   When supplied, stored on `bufs.regions` for subsequent slice-range
   *   operations (`writeSpikeSlice`, `readbackSpikeSlice`,
   *   `writeCurrentSlice`, and cluster-bound cross-projection propagate).
   *   When absent the cluster is homogeneous — all current call sites
   *   behave identically to pre-T17.7 code.
   */
  uploadCluster(name, size, voltages, synapses, lifParams, regions) {
    const device = this._device;
    const vRest = lifParams?.Vrest || -65;

    // T18.14.b — destroy any prior buffer set for this cluster BEFORE
    // allocating new ones. Prevents VRAM orphaning on WS reconnect when
    // the browser tab is the same but the server re-sends gpu_init.
    // Without this guard, biological-scale re-init orphans ~6.3 GB of
    // VRAM per reconnect cycle (all 7 clusters' voltages + spikes +
    // currents + synapse CSR) → device.lost → Windows TDR → NDIS
    // cascade → whole PC loses internet.
    this._destroyClusterBuffers(this._buffers[name]);

    // Params uniform
    // LIF params — 48 bytes. Contains ALL params for self-contained LIF shader.
    // n, tau, vRest, vThresh, vReset, dt, R, effectiveDrive, noiseAmp, seed, gridX, pad
    const totalWg = Math.ceil(size / 256);
    const gridX = Math.min(totalWg, 32768);
    const params = new ArrayBuffer(48);
    const view = new DataView(params);
    view.setUint32(0, size, true);
    view.setFloat32(4, lifParams.tau || 20, true);
    view.setFloat32(8, vRest, true);
    view.setFloat32(12, lifParams.Vthresh || -50, true);
    view.setFloat32(16, lifParams.Vreset || -70, true);
    view.setFloat32(20, lifParams.dt || 1, true);
    view.setFloat32(24, lifParams.R || 1, true);
    // effectiveDrive and noiseAmp are written per-step, not at upload
    view.setFloat32(28, 16.0, true);   // placeholder effectiveDrive
    view.setFloat32(32, 5.0, true);    // placeholder noiseAmp
    view.setUint32(36, 1, true);       // placeholder seed
    view.setUint32(40, gridX, true);
    // bytes 44-47 = padding

    // Create buffers — for large clusters (millions of neurons), avoid mappedAtCreation
    // which requires mapping the entire buffer into JS heap. Instead create unmapped
    // and fill Vrest in chunks via writeBuffer.
    const CHUNK = 1000000; // 1M floats at a time = 4MB per chunk
    const makeBuffer = (sz, usage) => device.createBuffer({ size: sz, usage: usage | GPUBufferUsage.COPY_DST });

    // Rulkov state buffer — vec2<f32> per neuron = 8 bytes.
    // Doubled from the old 1D voltage buffer. At 400K cerebellum that's
    // 3.2MB; at full server scale it's still well under GPU limits.
    const voltagesA = makeBuffer(size * 8, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);

    // Seed (x, y) pairs uniquely via golden-ratio quasi-random so no
    // two Rulkov trajectories phase-lock. Starting region is the
    // bursting attractor basin from Rulkov 2002: x ∈ (-1.0, -0.5),
    // y ∈ (-3.2, -2.8). Golden-ratio sequence gives low-discrepancy
    // coverage of the basin without collisions.
    const PHI = 0.61803398875;
    for (let offset = 0; offset < size; offset += CHUNK) {
      const chunkSize = Math.min(CHUNK, size - offset);
      const chunk = new Float32Array(chunkSize * 2); // interleaved x,y
      for (let i = 0; i < chunkSize; i++) {
        const gi = offset + i;
        const gx = (gi * PHI) % 1;
        const gy = (gi * PHI * 1.7) % 1;
        chunk[i * 2]     = -1.0 + gx * 0.5;         // x ∈ (-1.0, -0.5)
        chunk[i * 2 + 1] = -3.2 + gy * 0.4;         // y ∈ (-3.2, -2.8)
      }
      device.queue.writeBuffer(voltagesA, offset * 8, chunk);
    }

    // LAYOUT — voltages + spikes + currents = 12 bytes/neuron
    //
    // T18.4.a (2026-04-18) — `currents` buffer REINTRODUCED. A prior
    // "slim" refactor removed it under the mistaken belief that
    // LIF_SHADER generated currents inline and the intra-cluster
    // synapse matrix wasn't on the per-tick path. In reality the slim
    // layout left main-brain neurons with zero synaptic coupling —
    // SYNAPSE_PROPAGATE_SHADER was never dispatched in fullStep, and
    // LIF_SHADER's inline drive didn't honor per-neuron currents even
    // when it was. The main brain equation and all sub-equations
    // require intra-cluster recurrence to be live. This restores the
    // buffer + wires the full dispatch (clearBuffer → propagate →
    // LIF reads currents[i]) so intra-cluster recurrence is actually
    // live on GPU.
    const buffers = {
      params: device.createBuffer({
        size: 48,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
      voltages: voltagesA, // single voltage buffer — in-place read/write
      spikes: makeBuffer(size * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC),
      // currents needs COPY_SRC too — region-slice readbacks via
      // copyBufferToBuffer copy FROM this buffer into a small working
      // buffer for CPU-side inspection. Without COPY_SRC the browser
      // WebGPU validator rejects the copyBufferToBuffer encode with
      // "usage doesn't include CopySrc" and the whole CommandBuffer
      // becomes invalid — breaking every readback downstream.
      currents: makeBuffer(size * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC),
      // T17.7 Phase A.3 — regionGates storage buffer. 16 regions × 4
      // f32 per entry (start, end, gate, pad) = 256 bytes. Initialized
      // to zeros; `numRegions` defaults to 0 so the shader's linear
      // scan finds nothing and returns 1.0 gate → homogeneous behavior
      // identical to pre-A.3. `updateRegionGates()` fills this buffer
      // + bumps numRegions once regions are registered and Ψ-gate
      // values computed server-side.
      regionGates: makeBuffer(16 * 4 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      numRegions: 0,
      size,
      gridX,
    };
    // Write initial params to GPU params buffer
    device.queue.writeBuffer(buffers.params, 0, params);
    device.queue.writeBuffer(buffers.regionGates, 0, new Float32Array(16 * 4));

    // Synapse CSR buffers
    if (synapses && synapses.nnz > 0) {
      const vals32 = new Float32Array(synapses.nnz);
      for (let i = 0; i < synapses.nnz; i++) vals32[i] = synapses.values[i];

      buffers.synValues = this._createBuffer(vals32, GPUBufferUsage.STORAGE);
      buffers.synColIdx = this._createBuffer(new Uint32Array(synapses.colIdx), GPUBufferUsage.STORAGE);
      buffers.synRowPtr = this._createBuffer(new Uint32Array(synapses.rowPtr), GPUBufferUsage.STORAGE);
      buffers.synNnz = synapses.nnz;
    }

    // T17.7 Phase A.1/A.2 — sub-region slice metadata + hemispheric
    // `side` attribute. Stored on the buffer entry so subsequent
    // slice-range accessors (writeSpikeSlice, readbackSpikeSlice,
    // cluster-bound sparse cross-projections) can resolve sub-region
    // addresses. Validate that every slice fits within [0, size) and
    // that slices don't overlap — misconfigured regions would silently
    // corrupt state, so fail loudly at upload time instead.
    //
    // Region entry shape: `{start, end, side}` where `side` is one of:
    //   'left'      — left-hemisphere dominant (Broca's, Wernicke's,
    //                 VWFA/fusiform, angular gyrus sem hub). Mirror
    //                 region may or may not exist on right side.
    //   'right'     — right-hemisphere dominant (homologous mirrors of
    //                 left-lateralized regions; spatial attention;
    //                 right-hemisphere emotion processing).
    //   'bilateral' — present on both hemispheres with equal weight
    //                 (V1 primary visual, Heschl's primary auditory,
    //                 cerebellum, hippocampus proper).
    //   'center'    — midline / commissural structures (corpus callosum
    //                 projections, some thalamic regions).
    //
    // Side defaults to 'bilateral' if the caller doesn't specify one,
    // which matches today's behavior (no hemispheric lateralization) so
    // existing code doesn't regress. Phase B wires the actual L/R
    // gate into LIF via a Ψ-modulated hemisphere binding coefficient
    // — mystery Ψ must remain involved in the main equation.
    const VALID_SIDES = new Set(['left', 'right', 'bilateral', 'center']);
    if (regions && typeof regions === 'object') {
      const validated = {};
      const sortedByStart = Object.entries(regions).sort((a, b) => (a[1]?.start ?? 0) - (b[1]?.start ?? 0));
      let prevEnd = 0;
      for (const [regName, range] of sortedByStart) {
        const start = Number.isFinite(range?.start) ? Math.floor(range.start) : 0;
        const end = Number.isFinite(range?.end) ? Math.floor(range.end) : 0;
        if (start < 0 || end > size || start >= end) {
          console.warn(`[GPUCompute] uploadCluster ${name} region ${regName}: invalid range [${start}, ${end}) vs cluster size ${size}; skipping this region.`);
          continue;
        }
        if (start < prevEnd) {
          console.warn(`[GPUCompute] uploadCluster ${name} region ${regName} [${start}, ${end}) overlaps prior region (ending at ${prevEnd}); skipping.`);
          continue;
        }
        const side = VALID_SIDES.has(range?.side) ? range.side : 'bilateral';
        validated[regName] = { start, end, side };
        prevEnd = end;
      }
      buffers.regions = validated;
      if (Object.keys(validated).length > 0) {
        const sideSummary = Object.entries(validated)
          .map(([n, r]) => `${n}(${r.side})`)
          .join(', ');
        console.log(`[GPUCompute] uploadCluster ${name}: ${Object.keys(validated).length} sub-regions registered — ${sideSummary}`);
      }
    }

    this._buffers[name] = buffers;
  }

  /**
   * T17.7 Phase A.1/A.2 — get validated region range for a cluster
   * sub-region. Returns `{start, end, side}` or null if the cluster
   * doesn't have that region or wasn't uploaded with region metadata.
   * Used by slice-range accessors + cluster-bound sparse cross-
   * projection dispatch to resolve addresses.
   *
   * Phase A.2 `side` filter:
   *   - `undefined` / omitted → returns the region as-registered (whatever
   *     side was declared at upload time; bilateral unless overridden)
   *   - `'left'` / `'right'` → returns the region only if its declared
   *     side matches. For left-lateralized regions like Broca's
   *     `sem`/`motor`, passing `'right'` returns null unless a bilateral
   *     mirror region was registered alongside (e.g. `sem_R` sibling).
   *     Phase B will wire the bilateral-mirror registration pattern.
   *   - `'bilateral'` → returns the region whether declared side is
   *     left, right, bilateral, or center. Useful for slice accessors
   *     that want the full population regardless of lateralization.
   *
   * @param {string} clusterName
   * @param {string} regionName — e.g. 'sem', 'motor', 'letter'
   * @param {string} [sideFilter] — 'left' | 'right' | 'bilateral' | undefined
   * @returns {{start: number, end: number, side: string} | null}
   */
  getRegion(clusterName, regionName, sideFilter) {
    const bufs = this._buffers[clusterName];
    if (!bufs || !bufs.regions) return null;
    const r = bufs.regions[regionName];
    if (!r) return null;
    if (sideFilter === undefined || sideFilter === 'bilateral') {
      return { start: r.start, end: r.end, side: r.side };
    }
    if (sideFilter !== r.side) return null;
    return { start: r.start, end: r.end, side: r.side };
  }

  /**
   * T17.7 Phase A.3 — update the per-cluster regionGates storage
   * buffer with current Ψ-computed gate values. Called per-tick (or
   * whenever Ψ changes significantly) before the next LIF dispatch.
   *
   * Iterates every registered region on the cluster, computes
   * `hemisphereGate(region.side, psi)` for each, packs into the
   * flat f32 array `[start, end, gate, pad, start, end, gate, pad, ...]`
   * that the shader scans. Updates `bufs.numRegions` so the shader
   * knows how many entries to walk.
   *
   * Zero cost per call (~8 regions × 4 f32 = 128 bytes writeBuffer)
   * relative to the per-neuron LIF compute. Safe to call every
   * substep if Ψ changes rapidly; can be throttled to once per tick
   * since Ψ changes slowly.
   *
   * @param {string} clusterName
   * @param {number} psi — current consciousness value
   */
  updateRegionGates(clusterName, psi) {
    const bufs = this._buffers[clusterName];
    if (!bufs?.regionGates) return;
    if (!bufs.regions) {
      bufs.numRegions = 0;
      return;
    }
    const MAX_REGIONS = 16;
    const entries = Object.entries(bufs.regions).slice(0, MAX_REGIONS);
    const packed = new Float32Array(MAX_REGIONS * 4); // zero-init
    let i = 0;
    for (const [, region] of entries) {
      const base = i * 4;
      packed[base]     = region.start;
      packed[base + 1] = region.end;
      packed[base + 2] = GPUCompute.hemisphereGate(region.side, psi);
      packed[base + 3] = 0.0;
      i++;
    }
    bufs.numRegions = i;
    this._device.queue.writeBuffer(bufs.regionGates, 0, packed.buffer, packed.byteOffset, packed.byteLength);
  }

  /**
   * T17.7 Phase A.2 — compute a Ψ-modulated hemispheric binding
   * coefficient for a region. Used by downstream slice-range LIF
   * modulation in Phase B; exposed here as a shared helper so both
   * the server (current assembly) and Phase B shader dispatches read
   * the same formula.
   *
   * Ψ is non-optional in this equation — mystery Ψ must remain
   * involved in the main brain equation.
   *
   * Formula: `gate = 0.5 + 0.5 · sigmoid(Ψ · k)` where k = 4.0 tunes
   * the sensitivity. Low Ψ → gate trends 0.5 → hemispheric divergence
   * (one side dominant, other dampened). High Ψ → gate trends 1.0 →
   * bilateral binding (both hemispheres integrated).
   *
   * For bilateral / center regions the formula returns 1.0 (full
   * activation) regardless of Ψ — only left/right regions get the
   * Ψ-driven gate because only lateralized regions have a hemispheric
   * dominance axis to modulate.
   *
   * @param {string} side — 'left' | 'right' | 'bilateral' | 'center'
   * @param {number} psi — consciousness value from mystery module
   * @returns {number} gate factor in [0.5, 1.0]
   */
  static hemisphereGate(side, psi) {
    if (side === 'bilateral' || side === 'center') return 1.0;
    const k = 4.0;
    const sig = 1.0 / (1.0 + Math.exp(-(psi || 0) * k));
    return 0.5 + 0.5 * sig;
  }

  /**
   * T17.7 Phase A.3 — write a spike pattern to a cluster's spike
   * buffer at a sub-region slice. Used by curriculum teach methods to
   * inject input patterns (sem embedding, letter one-hot, motor
   * target) into the unified cortex's language sub-regions instead of
   * writing to the standalone `cortexCluster.lastSpikes` Uint8Array.
   *
   * NOTE: `writeSpikeSlice` writes TRAINING DATA — the caller is
   * asserting "these neurons fired this tick" for Hebbian pre/post
   * computation. It does NOT represent runtime firing decisions, so
   * Mystery Ψ hemispheric gating does NOT apply here. Ψ-modulated
   * hemispheric binding applies only to CURRENTS (inputs that drive
   * LIF firing decisions) and to the LIF_SHADER itself where the
   * firing equation integrates drive. See `writeCurrentSlice` for the
   * current-injection path with Ψ gating, and `updateRegionGates` +
   * LIF_SHADER for the runtime per-tick hemispheric modulation.
   *
   * @param {string} clusterName — target cluster (e.g. 'cortex')
   * @param {string} regionName — sub-region (e.g. 'sem', 'motor')
   * @param {Uint32Array|Uint8Array|Float32Array} spikes — pattern to
   *   write; length must match (regionEnd - regionStart)
   * @returns {boolean} true on success, false if region not found
   */
  writeSpikeSlice(clusterName, regionName, spikes) {
    if (!this._available) return false;
    const bufs = this._buffers[clusterName];
    if (!bufs?.spikes) return false;
    const region = this.getRegion(clusterName, regionName);
    if (!region) return false;
    const device = this._device;
    const sliceLen = region.end - region.start;
    if (!spikes || spikes.length !== sliceLen) {
      console.warn(`[GPUCompute] writeSpikeSlice ${clusterName}/${regionName}: length mismatch (got ${spikes?.length}, expected ${sliceLen})`);
      return false;
    }
    // Normalize to u32 (binary firing representation). Training-data
    // writes are always binary — Hebbian cares only about which pre
    // fired and which post fired, not continuous-valued "how strongly".
    let u32;
    if (spikes instanceof Uint32Array) {
      u32 = spikes;
    } else {
      u32 = new Uint32Array(sliceLen);
      for (let i = 0; i < sliceLen; i++) u32[i] = spikes[i] ? 1 : 0;
    }
    const byteOffset = region.start * 4;
    device.queue.writeBuffer(bufs.spikes, byteOffset, u32.buffer, u32.byteOffset, u32.byteLength);
    return true;
  }

  /**
   * T17.7 Phase C.1 — sparse spike-slice write. Avoids allocating a
   * full-region Uint32Array when the pattern is sparse (a small list
   * of indices that should fire). Zero-fills the region slice via
   * `encoder.clearBuffer` (GPU-native — no CPU memory allocation)
   * then writes 1's at each sparse index via `queue.writeBuffer` at
   * byte-offset granularity.
   *
   * At biological scale (sem region ≈ 33M neurons) the dense path
   * allocates ~132 MB per write. With K curriculum firing thousands
   * of teach iterations × ~11 writes per iter, the dense path would
   * allocate on the order of a terabyte total during a single
   * curriculum walk — GC thrash measured at minutes per grade.
   *
   * Run-detection: consecutive sparse indices are coalesced into a
   * single `writeBuffer(runStart, runLen)` call. `_writeTiledPattern`
   * writes gSize consecutive ones per active feature dimension, so
   * typical runs are 100s-1000s long — 100 active features × 1 call
   * per run instead of 100 × gSize individual writes. Cuts
   * WebSocket-side CPU work by ~1000×.
   *
   * @param {string} clusterName
   * @param {string} regionName
   * @param {number[]|Uint32Array} sparseIndices — indices relative
   *   to region start that should fire (u32 1). Rest of region is
   *   cleared to 0.
   * @returns {boolean}
   */
  writeSpikeSliceSparse(clusterName, regionName, sparseIndices) {
    if (!this._available) return false;
    const bufs = this._buffers[clusterName];
    if (!bufs?.spikes) return false;
    const region = this.getRegion(clusterName, regionName);
    if (!region) return false;
    const device = this._device;
    const sliceLen = region.end - region.start;
    const byteOffset = region.start * 4;
    // Zero the region slice GPU-side — no CPU allocation.
    const encoder = device.createCommandEncoder();
    encoder.clearBuffer(bufs.spikes, byteOffset, sliceLen * 4);
    device.queue.submit([encoder.finish()]);
    // Short-circuit for pure-clear.
    if (!sparseIndices || sparseIndices.length === 0) return true;
    // Sort (defensively) so we can detect consecutive runs even if
    // caller emitted indices out of order. `_writeTiledPattern` emits
    // them in increasing order already, so sorting a pre-sorted list
    // is cheap (V8 TimSort → O(N) on sorted input).
    const idxs = sparseIndices instanceof Uint32Array
      ? sparseIndices.slice()
      : Uint32Array.from(sparseIndices);
    idxs.sort();
    // Small shared "runValues" buffer of ones — allocated lazily, sized
    // to the largest run we see in this call. Subsequent writes from
    // the same process reuse this (the dominant cost is not the buffer
    // allocation but the per-writeBuffer queue submission).
    let runStart = idxs[0];
    let runEnd = idxs[0];
    // Determine max run length first pass — cheap vs the writeBuffer
    // submissions that follow.
    let maxRun = 1;
    {
      let curLen = 1;
      for (let i = 1; i < idxs.length; i++) {
        if (idxs[i] === idxs[i - 1] + 1) {
          curLen++;
          if (curLen > maxRun) maxRun = curLen;
        } else {
          curLen = 1;
        }
      }
    }
    const onesBuf = new Uint32Array(maxRun);
    for (let i = 0; i < maxRun; i++) onesBuf[i] = 1;
    const flush = (s, e) => {
      if (s < 0 || e < s || s >= sliceLen) return;
      const eClamped = Math.min(e, sliceLen - 1);
      const len = eClamped - s + 1;
      device.queue.writeBuffer(
        bufs.spikes,
        byteOffset + s * 4,
        onesBuf.buffer, 0, len * 4,
      );
    };
    for (let i = 1; i < idxs.length; i++) {
      if (idxs[i] === idxs[i - 1] + 1) {
        runEnd = idxs[i];
      } else if (idxs[i] === idxs[i - 1]) {
        // duplicate — skip
      } else {
        flush(runStart, runEnd);
        runStart = idxs[i];
        runEnd = idxs[i];
      }
    }
    flush(runStart, runEnd);
    return true;
  }

  /**
   * T17.7 Phase C.1 — pure clear of a region slice on the spikes
   * buffer. GPU-native (`encoder.clearBuffer`) — no CPU allocation.
   * Used by curriculum `_clearSpikes` between teach iterations so
   * the next pattern write lands on zeroed main-cortex slices
   * without paying the dense-Uint32Array allocation cost.
   *
   * @param {string} clusterName
   * @param {string} regionName
   * @returns {boolean}
   */
  clearSpikeRegion(clusterName, regionName) {
    if (!this._available) return false;
    const bufs = this._buffers[clusterName];
    if (!bufs?.spikes) return false;
    const region = this.getRegion(clusterName, regionName);
    if (!region) return false;
    const device = this._device;
    const byteOffset = region.start * 4;
    const byteLen = (region.end - region.start) * 4;
    const encoder = device.createCommandEncoder();
    encoder.clearBuffer(bufs.spikes, byteOffset, byteLen);
    device.queue.submit([encoder.finish()]);
    return true;
  }

  /**
   * T17.7 Phase A.3 — write per-neuron current injection to a
   * cluster's `currents` buffer at a sub-region slice. Used by
   * sensory injection (Wernicke's text input) and curriculum teach
   * pre/post pattern building to feed currents that the LIF shader
   * will sum into its drive.
   *
   * Ψ gate applied same as `writeSpikeSlice` when `opts.psi` is
   * supplied. Current values are scaled in-place by the gate before
   * the GPU write, so a lateralized region's injection is naturally
   * dampened when Ψ is low (hemispheric divergence state).
   *
   * @param {string} clusterName
   * @param {string} regionName
   * @param {Float32Array} currents — per-neuron current (length
   *   must match regionEnd - regionStart)
   * @param {object} [opts]
   * @param {number} [opts.psi]
   * @returns {boolean}
   */
  writeCurrentSlice(clusterName, regionName, currents, opts = {}) {
    if (!this._available) return false;
    const bufs = this._buffers[clusterName];
    if (!bufs?.currents) return false;
    const region = this.getRegion(clusterName, regionName);
    if (!region) return false;
    const device = this._device;
    const sliceLen = region.end - region.start;
    if (!currents || currents.length !== sliceLen) {
      console.warn(`[GPUCompute] writeCurrentSlice ${clusterName}/${regionName}: length mismatch (got ${currents?.length}, expected ${sliceLen})`);
      return false;
    }
    const gate = (opts.psi !== undefined)
      ? GPUCompute.hemisphereGate(region.side, opts.psi)
      : 1.0;
    let f32;
    if (gate === 1.0 && currents instanceof Float32Array) {
      f32 = currents;
    } else {
      f32 = new Float32Array(sliceLen);
      for (let i = 0; i < sliceLen; i++) f32[i] = currents[i] * gate;
    }
    const byteOffset = region.start * 4;
    device.queue.writeBuffer(bufs.currents, byteOffset, f32.buffer, f32.byteOffset, f32.byteLength);
    return true;
  }

  /**
   * T17.7 Phase A.3 — atomic-reduce spike count in a sub-region
   * slice. Used by generation paths (motor region argmax decode)
   * that need spike telemetry at sub-region granularity without
   * reading back the full cluster spike buffer (which would be
   * ~800MB at 201M neurons × 4 bytes).
   *
   * Uses the same `SPIKE_COUNT_SHADER` that `readbackSpikeCount`
   * uses — adds a slice-range check in the caller by dispatching a
   * temporary params buffer that exposes the sub-range offsets.
   * Since the existing shader doesn't natively support ranges, Phase
   * A.3 takes the straightforward route: a tiny new params shape +
   * an early-return branch keyed on [start, end). Each readback
   * allocates its own 4-byte atomic buffer per call (same safety
   * pattern as `readbackSpikeCount`).
   *
   * @param {string} clusterName
   * @param {string} regionName
   * @returns {Promise<number>} spike count in the slice, or 0
   */
  async readbackSpikeSlice(clusterName, regionName) {
    const bufs = this._buffers[clusterName];
    if (!bufs?.spikes) return 0;
    const region = this.getRegion(clusterName, regionName);
    if (!region) return 0;
    const device = this._device;
    const sliceLen = region.end - region.start;

    // Per-slice atomic counter + per-call readback (same collision-
    // free pattern as readbackSpikeCount).
    const counter = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(counter, 0, new Uint32Array([0]));
    const readback = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Params: n (slice length), gridX, startOffset, pad
    const params = new ArrayBuffer(16);
    const view = new DataView(params);
    view.setUint32(0, sliceLen, true);
    view.setUint32(4, bufs.gridX || 32768, true);
    view.setUint32(8, region.start, true);
    const paramsBuffer = this._createBuffer(params, GPUBufferUsage.UNIFORM);

    // Lazy-compile the slice-offset variant of the spike count shader.
    if (!this._pipelines.spikeCountSlice) {
      const SLICE_SHADER = /* wgsl */`
        struct Params {
          n: u32,
          gridX: u32,
          sliceStart: u32,
          _pad0: u32,
        };
        @group(0) @binding(0) var<uniform> params: Params;
        @group(0) @binding(1) var<storage, read> spikes: array<u32>;
        @group(0) @binding(2) var<storage, read_write> count: array<atomic<u32>>;
        @compute @workgroup_size(256)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
          let i = id.x + id.y * params.gridX * 256u;
          if (i >= params.n) { return; }
          let absIdx = params.sliceStart + i;
          if (spikes[absIdx] != 0u) {
            atomicAdd(&count[0], 1u);
          }
        }
      `;
      this._pipelines.spikeCountSlice = device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: device.createShaderModule({ code: SLICE_SHADER }),
          entryPoint: 'main',
        },
      });
    }

    const bindGroup = device.createBindGroup({
      layout: this._pipelines.spikeCountSlice.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: bufs.spikes } },
        { binding: 2, resource: { buffer: counter } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.spikeCountSlice);
    pass.setBindGroup(0, bindGroup);
    this._dispatch2D(pass, sliceLen, bufs.gridX);
    pass.end();
    encoder.copyBufferToBuffer(counter, 0, readback, 0, 4);
    device.queue.submit([encoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const n = new Uint32Array(readback.getMappedRange().slice(0))[0];
    readback.unmap();
    readback.destroy();
    counter.destroy();
    paramsBuffer.destroy();
    return n;
  }

  /**
   * T17.7 Phase D — GPU-side reduction of a region slice into a fixed
   * number of letter buckets. Returns a Uint32Array of length
   * `bucketCount` where bucket[b] = spike count in the sub-slice
   * `[regionStart + startOffset + b·bucketSize, regionStart +
   * startOffset + (b+1)·bucketSize)`. Used by generateSentenceAwait
   * to argmax-decode the motor region's activation over the letter
   * inventory without shipping the full motor-slice spike array back
   * to the server.
   *
   * At biological scale the motor slice has ~6.6M neurons; a dense
   * readback would ship ~26 MB per tick. The bucketed reduction
   * ships bucketCount × 4 bytes — 104 bytes for a 26-letter
   * inventory. 250,000× reduction in per-tick readback bandwidth.
   *
   * Implementation: each GPU thread handles one neuron, atomically
   * increments its bucket index. Ordering mirrors curriculum's
   * `_writeTiledPattern` tiling (bucketSize consecutive neurons per
   * letter dimension) so the argmax from this readback matches what
   * curriculum trained the motor slice to produce.
   *
   * @param {string} clusterName
   * @param {string} regionName
   * @param {number} bucketCount — number of buckets (e.g. 26 for A..Z)
   * @param {number} subSliceLen — number of neurons to scan (must
   *   equal bucketCount × bucketSize; caller enforces). Typically
   *   the standalone region size so buckets align with curriculum
   *   teaching layout.
   * @param {number} [startOffset=0] — where in the region to start
   *   (relative to region.start). Phase C cluster-bound projections
   *   always land pattern in first-N of region, so startOffset=0.
   * @returns {Promise<Uint32Array|null>} length = bucketCount
   */
  async readbackLetterBuckets(clusterName, regionName, bucketCount, subSliceLen, startOffset = 0) {
    if (!this._available) return null;
    const bufs = this._buffers[clusterName];
    if (!bufs?.spikes) return null;
    const region = this.getRegion(clusterName, regionName);
    if (!region) return null;
    if (!Number.isFinite(bucketCount) || bucketCount <= 0) return null;
    if (!Number.isFinite(subSliceLen) || subSliceLen <= 0) return null;
    const regionLen = region.end - region.start;
    if (startOffset + subSliceLen > regionLen) return null;
    const bucketSize = Math.floor(subSliceLen / bucketCount);
    if (bucketSize <= 0) return null;

    const device = this._device;
    const absStart = region.start + startOffset;
    const dispatchLen = bucketCount * bucketSize;  // trim any remainder

    // Per-call atomic bucket counters. bucketCount typically 26 so
    // allocation is a handful of bytes. Fresh per call — same
    // collision-free pattern as readbackSpikeSlice.
    const counters = device.createBuffer({
      size: bucketCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(counters, 0, new Uint32Array(bucketCount));
    const readback = device.createBuffer({
      size: bucketCount * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Params: n (dispatchLen), gridX, absStart, bucketSize
    const params = new ArrayBuffer(16);
    const view = new DataView(params);
    view.setUint32(0, dispatchLen, true);
    view.setUint32(4, bufs.gridX || 32768, true);
    view.setUint32(8, absStart, true);
    view.setUint32(12, bucketSize, true);
    const paramsBuffer = this._createBuffer(params, GPUBufferUsage.UNIFORM);

    if (!this._pipelines.letterBuckets) {
      const SHADER = /* wgsl */`
        struct Params {
          n: u32,
          gridX: u32,
          absStart: u32,
          bucketSize: u32,
        };
        @group(0) @binding(0) var<uniform> params: Params;
        @group(0) @binding(1) var<storage, read> spikes: array<u32>;
        @group(0) @binding(2) var<storage, read_write> counts: array<atomic<u32>>;
        @compute @workgroup_size(256)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
          let i = id.x + id.y * params.gridX * 256u;
          if (i >= params.n) { return; }
          let absIdx = params.absStart + i;
          if (spikes[absIdx] != 0u) {
            let b = i / params.bucketSize;
            atomicAdd(&counts[b], 1u);
          }
        }
      `;
      this._pipelines.letterBuckets = device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: device.createShaderModule({ code: SHADER }),
          entryPoint: 'main',
        },
      });
    }

    const bindGroup = device.createBindGroup({
      layout: this._pipelines.letterBuckets.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: bufs.spikes } },
        { binding: 2, resource: { buffer: counters } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.letterBuckets);
    pass.setBindGroup(0, bindGroup);
    this._dispatch2D(pass, dispatchLen, bufs.gridX);
    pass.end();
    encoder.copyBufferToBuffer(counters, 0, readback, 0, bucketCount * 4);
    device.queue.submit([encoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const out = new Uint32Array(readback.getMappedRange().slice(0));
    readback.unmap();
    readback.destroy();
    counters.destroy();
    paramsBuffer.destroy();
    return out;
  }

  /**
   * T18.11 — destroy every GPU buffer hanging off a sparse-matrix entry.
   * Called before overwriting `_sparseMatrices[name]` so re-uploads
   * don't orphan the prior allocation. Safe on undefined entry (no-op)
   * and safe on a device-lost state (each destroy wrapped in try/catch
   * so a double-free on a dead device is non-fatal).
   *
   * Covers every buffer type an entry can hold:
   *   - Cluster-bound: values + colIdx + rowPtr (3 buffers)
   *   - Standalone:    values + colIdx + rowPtr + preSpikes + postCurrents + postSpikes (6 buffers)
   *
   * Completes T18.10's partial fix — that commit only destroyed on the
   * validation-FAILURE branch. This helper handles the success-path
   * leak that stacks across any future re-upload trigger.
   */
  _destroySparseEntryBuffers(entry) {
    if (!entry) return;
    try { entry.values?.destroy(); } catch { /* already gone */ }
    try { entry.colIdx?.destroy(); } catch { /* already gone */ }
    try { entry.rowPtr?.destroy(); } catch { /* already gone */ }
    try { entry.preSpikes?.destroy(); } catch { /* already gone */ }
    try { entry.postCurrents?.destroy(); } catch { /* already gone */ }
    try { entry.postSpikes?.destroy(); } catch { /* already gone */ }
  }

  /**
   * Upload a standalone sparse CSR matrix to GPU — not bound to any
   * cluster. Used for T14.4 cross-region projections where the matrix
   * connects one region's spikes to another region's currents
   * (independent of any cluster's intra-cluster synapses).
   *
   * Stores under `this._sparseMatrices[name]`. Subsequent
   * propagateSparse + hebbianSparse calls dispatch shaders against it.
   *
   * @param {string} name — projection identifier, e.g. 'sem_to_motor'
   * @param {number} rows — target region size (spikes vector destination)
   * @param {number} cols — source region size (pre-spike vector domain)
   * @param {Float32Array|Float64Array} values — CSR non-zero weights, length = nnz
   * @param {Uint32Array} colIdx — CSR column indices, length = nnz
   * @param {Uint32Array} rowPtr — CSR row pointers, length = rows + 1
   * @param {object} [binding] — T17.7 Phase A.4 — optional cluster-
   *   binding metadata so the sparse matrix addresses slices of live
   *   cluster buffers instead of standalone preSpikes/postCurrents.
   *   Shape: `{srcCluster, srcRegion, dstCluster, dstRegion}`. When
   *   provided:
   *     - `propagateSparse` reads pre-spikes from `bufs[srcCluster].spikes`
   *       at `srcRegion.start` offset and writes post-currents to
   *       `bufs[dstCluster].currents` at `dstRegion.start` offset
   *     - `hebbianSparse` reads both pre + post spikes from their
   *       respective cluster spike buffers at region offsets
   *     - Standalone `preSpikes` / `postCurrents` / `postSpikes`
   *       buffers on the matrix entry are NOT allocated (saves
   *       VRAM; cross-projections that sit inside the main cortex
   *       don't need their own standalone spike mirrors)
   *   When `binding` is omitted, behavior is identical to pre-A.4
   *   (standalone mode, default preSpikes/postCurrents buffers, offsets 0).
   */
  uploadSparseMatrix(name, rows, cols, values, colIdx, rowPtr, binding) {
    if (!this._available) return false;
    const device = this._device;
    // T18.11 — completes T18.10. If a matrix with this name is already
    // on GPU, destroy its buffers BEFORE allocating new ones. Without
    // this, any re-upload path (reconnect-triggered re-init, rebind
    // fallback on persisted-without-binding matrices, future
    // auto-rescale retry loop) orphans 3 buffers (cluster-bound) or 6
    // buffers (standalone: +preSpikes/postCurrents/postSpikes) at
    // 100-600 MB each. Stacked leaks guarantee VRAM exhaustion on a
    // 16 GB card during biological-scale init — the PC-reset / network
    // stack collapse cascade T18.10 half-fixed.
    this._destroySparseEntryBuffers(this._sparseMatrices[name]);
    const vals32 = values instanceof Float32Array ? values : new Float32Array(values);
    const cols32 = colIdx instanceof Uint32Array ? colIdx : new Uint32Array(colIdx);
    const rows32 = rowPtr instanceof Uint32Array ? rowPtr : new Uint32Array(rowPtr);
    const nnz = vals32.length;

    // Use createBuffer + queue.writeBuffer (async, non-blocking) instead
    // of createBuffer({mappedAtCreation:true}) which synchronously maps
    // the buffer to CPU memory before copy. For 60MB+ sparse matrices
    // mappedAtCreation was taking seconds per buffer × 3 buffers per
    // matrix, blocking the WebSocket onmessage handler and starving
    // main-brain compute_batch dispatch. writeBuffer queues the write
    // on the GPU command stream and returns immediately; subsequent
    // dispatches serialize behind it automatically.
    const makeStorage = (sizeBytes) => device.createBuffer({
      size: sizeBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // TU.19-D — values gets COPY_SRC so the GPU↔CPU parity harness can read the
    // ACTUAL resident weights back for a checksum (mirrors the native donor's
    // values_buf COPY_SRC). colIdx/rowPtr stay storage-only.
    const valuesBuf = device.createBuffer({
      size: vals32.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    const colIdxBuf = makeStorage(cols32.byteLength);
    const rowPtrBuf = makeStorage(rows32.byteLength);

    device.queue.writeBuffer(valuesBuf, 0, vals32.buffer, vals32.byteOffset, vals32.byteLength);
    device.queue.writeBuffer(colIdxBuf, 0, cols32.buffer, cols32.byteOffset, cols32.byteLength);
    device.queue.writeBuffer(rowPtrBuf, 0, rows32.buffer, rows32.byteOffset, rows32.byteLength);

    const entry = {
      rows, cols, nnz,
      values: valuesBuf,
      colIdx: colIdxBuf,
      rowPtr: rowPtrBuf,
    };
    // T17.7 Phase A.4 — cluster-bound vs standalone mode.
    //
    // Cluster-bound: the matrix reads pre-spikes from a source
    // cluster's spikes buffer at a slice offset, writes post-currents
    // to a destination cluster's currents buffer at a slice offset.
    // No standalone preSpikes/postCurrents/postSpikes buffers
    // allocated — saves VRAM at biological scale (bandwidth alone at
    // M+ scale would be substantial for standalone spike mirrors).
    //
    // Standalone (default): matrix owns its own pre/post/currents
    // buffers at sizes `cols × 4` + `rows × 4`. Backward-compatible
    // with pre-A.4 callers that haven't been migrated to cluster-
    // bound yet.
    if (binding && binding.srcCluster && binding.dstCluster) {
      const srcBufs = this._buffers[binding.srcCluster];
      const dstBufs = this._buffers[binding.dstCluster];
      if (!srcBufs?.spikes || !dstBufs?.currents) {
        // T18.10 — destroy the three allocated buffers before returning
        // false. Each can be 100-600 MB at biological scale; without
        // cleanup they orphan in VRAM, repeated failures (upload order
        // race / T18.6.c auto-rescale re-init) stack leaks until VRAM
        // exhausts → device.lost cascades into Windows TDR → certain
        // Windows + NVIDIA driver combos take the whole network stack
        // down until PC reset.
        try { valuesBuf.destroy(); } catch { /* already gone */ }
        try { colIdxBuf.destroy(); } catch { /* already gone */ }
        try { rowPtrBuf.destroy(); } catch { /* already gone */ }
        console.warn(`[GPUCompute] uploadSparseMatrix ${name}: cluster-bound mode requires src(${binding.srcCluster}) + dst(${binding.dstCluster}) both uploaded first — destroyed ${((vals32.byteLength + cols32.byteLength + rows32.byteLength) / 1048576).toFixed(1)} MB of allocated buffers to avoid VRAM leak`);
        return false;
      }
      entry.binding = {
        srcCluster: binding.srcCluster,
        srcRegion: binding.srcRegion || { start: 0, end: cols },
        dstCluster: binding.dstCluster,
        dstRegion: binding.dstRegion || { start: 0, end: rows },
      };
      // Validate that slice sizes match matrix dimensions.
      const srcLen = entry.binding.srcRegion.end - entry.binding.srcRegion.start;
      const dstLen = entry.binding.dstRegion.end - entry.binding.dstRegion.start;
      if (srcLen !== cols || dstLen !== rows) {
        console.warn(`[GPUCompute] uploadSparseMatrix ${name} binding size mismatch: srcRegion len=${srcLen} vs cols=${cols}; dstRegion len=${dstLen} vs rows=${rows}`);
      }
    } else {
      // Standalone mode — allocate own buffers.
      entry.preSpikes = device.createBuffer({
        size: cols * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      entry.postCurrents = device.createBuffer({
        size: rows * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      entry.postSpikes = device.createBuffer({
        size: rows * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }
    this._sparseMatrices[name] = entry;
    return true;
  }

  // Chunked sparse upload — for matrices too large to ship in a single
  // WebSocket frame without choking the browser frame assembler. Creates
  // empty GPU buffers up front, streams values+colIdx chunks via
  // writeBuffer at offsets, marks the matrix live when the last chunk
  // arrives. Zero 480MB JS-heap buffer; chunk bytes go straight from
  // the receive ArrayBuffer to GPU memory.
  _beginSparseUpload(name, rows, cols, nnz, rowPtr, binding) {
    if (!this._available) return false;
    const device = this._device;
    // T18.11 — destroy any prior entry's buffers before re-upload. Same
    // leak pattern as uploadSparseMatrix — chunked path also orphaned
    // values/colIdx/rowPtr (+ optional pre/post/currents buffers in
    // standalone mode) on re-upload.
    this._destroySparseEntryBuffers(this._sparseMatrices[name]);
    const rowPtr32 = rowPtr instanceof Uint32Array ? rowPtr : new Uint32Array(rowPtr);
    const makeStorage = (sizeBytes) => device.createBuffer({
      size: sizeBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const entry = {
      rows, cols, nnz,
      // TU.19-D — values gets COPY_SRC for the parity checksum readback (chunked path).
      values: device.createBuffer({ size: nnz * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC }),
      colIdx: makeStorage(nnz * 4),
      rowPtr: makeStorage(rowPtr32.byteLength),
      _pending: true,
    };
    // T17.7 Phase A.4 — chunked upload path gains cluster-binding
    // parameter. Same cluster-bound vs standalone split as
    // uploadSparseMatrix: bound mode reads/writes cluster buffers at
    // region offsets; standalone allocates its own pre/post/currents.
    if (binding && binding.srcCluster && binding.dstCluster) {
      const srcBufs = this._buffers[binding.srcCluster];
      const dstBufs = this._buffers[binding.dstCluster];
      if (!srcBufs?.spikes || !dstBufs?.currents) {
        // T18.10 — destroy the three allocated buffers before returning
        // false. Same leak path as uploadSparseMatrix — chunked-upload
        // cluster-bound validation failure orphans values/colIdx/rowPtr
        // in VRAM. A single leaked 7.9 GB cross-projection attempt
        // exhausts VRAM on a 16 GB card in ONE try; repeated retries
        // guarantee device.lost and potential Windows network stack
        // collapse via TDR cascade.
        try { entry.values.destroy(); } catch { /* already gone */ }
        try { entry.colIdx.destroy(); } catch { /* already gone */ }
        try { entry.rowPtr.destroy(); } catch { /* already gone */ }
        const leakedMB = ((nnz * 4 * 2 + rowPtr32.byteLength) / 1048576).toFixed(1);
        console.warn(`[GPUCompute] _beginSparseUpload ${name}: cluster-bound requires src(${binding.srcCluster}) + dst(${binding.dstCluster}) both uploaded first — destroyed ${leakedMB} MB of allocated buffers to avoid VRAM leak`);
        return false;
      }
      entry.binding = {
        srcCluster: binding.srcCluster,
        srcRegion: binding.srcRegion || { start: 0, end: cols },
        dstCluster: binding.dstCluster,
        dstRegion: binding.dstRegion || { start: 0, end: rows },
      };
    } else {
      entry.preSpikes = device.createBuffer({
        size: cols * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      entry.postCurrents = device.createBuffer({
        size: rows * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      entry.postSpikes = device.createBuffer({
        size: rows * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(entry.rowPtr, 0, rowPtr32.buffer, rowPtr32.byteOffset, rowPtr32.byteLength);
    this._sparseMatrices[name] = entry;
    return true;
  }

  _appendSparseUpload(name, valuesOffset, valuesChunk, colIdxOffset, colIdxChunk) {
    const entry = this._sparseMatrices[name];
    if (!entry) return false;
    const device = this._device;
    if (valuesChunk && valuesChunk.byteLength > 0) {
      device.queue.writeBuffer(entry.values, valuesOffset, valuesChunk.buffer, valuesChunk.byteOffset, valuesChunk.byteLength);
    }
    if (colIdxChunk && colIdxChunk.byteLength > 0) {
      device.queue.writeBuffer(entry.colIdx, colIdxOffset, colIdxChunk.buffer, colIdxChunk.byteOffset, colIdxChunk.byteLength);
    }
    return true;
  }

  _finishSparseUpload(name) {
    const entry = this._sparseMatrices[name];
    if (!entry) return false;
    entry._pending = false;
    return true;
  }

  /**
   * Dispatch sparse matmul: currents[target region] = matrix @ spikes[source region].
   * Reuses the existing SYNAPSE_PROPAGATE_SHADER. Pre-spikes must be
   * uploaded to this matrix's `preSpikes` buffer first via
   * `writeBuffer(entry.preSpikes, 0, spikeData)`.
   *
   * Returns a Float32Array of post-region currents (readback).
   */
  async propagateSparse(name) {
    if (!this._available) return null;
    const entry = this._sparseMatrices[name];
    if (!entry) return null;
    const device = this._device;

    // T17.7 Phase A.4 — cluster-bound vs standalone dispatch.
    // Cluster-bound: pre-spikes read from bound src cluster's spikes
    // at srcRegion.start offset; post-currents accumulate into bound
    // dst cluster's currents at dstRegion.start offset. The shader
    // reads srcOffset + dstOffset from the params uniform so no
    // buffer-level rebinding is needed — same pipeline, same layout,
    // just different offset values.
    // Standalone: pre-spikes from entry.preSpikes, post-currents
    // accumulate into entry.postCurrents, offsets are 0.
    const bound = !!entry.binding;
    const srcBuf = bound
      ? this._buffers[entry.binding.srcCluster].spikes
      : entry.preSpikes;
    const dstBuf = bound
      ? this._buffers[entry.binding.dstCluster].currents
      : entry.postCurrents;
    const srcOffset = bound ? entry.binding.srcRegion.start : 0;
    const dstOffset = bound ? entry.binding.dstRegion.start : 0;

    // Params: n (u32), nnz (u32), srcOffset (u32), dstOffset (u32) = 16 bytes
    const params = new Uint32Array([entry.rows, entry.nnz, srcOffset, dstOffset]);
    const paramsBuf = this._createBuffer(params, GPUBufferUsage.UNIFORM);
    const bindGroup = device.createBindGroup({
      layout: this._pipelines.propagate.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuf } },
        { binding: 1, resource: { buffer: entry.values } },
        { binding: 2, resource: { buffer: entry.colIdx } },
        { binding: 3, resource: { buffer: entry.rowPtr } },
        { binding: 4, resource: { buffer: srcBuf } },
        { binding: 5, resource: { buffer: dstBuf } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.propagate);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(entry.rows / 256));
    pass.end();

    // Readback the rows-range into a temporary mapped buffer. For
    // cluster-bound mode the currents live inside the cluster buffer
    // at dstOffset — copy that slice out instead of the whole cluster
    // currents buffer. For standalone mode copy the entire
    // postCurrents buffer as before.
    const readback = device.createBuffer({
      size: entry.rows * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    encoder.copyBufferToBuffer(dstBuf, dstOffset * 4, readback, 0, entry.rows * 4);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(readback.getMappedRange().slice(0));
    readback.unmap();
    readback.destroy();
    paramsBuf.destroy();
    return out;
  }

  /**
   * TU.19-D — read back a resident sparse matrix's weight digest for the GPU↔CPU
   * parity harness. Copies the resident `values` buffer to a MAP_READ staging
   * buffer, maps it, and computes FNV-1a-64 over the bit-exact little-endian f32
   * bytes — byte-for-byte identical to the native donor (compute.rs/cuda.rs) so a
   * browser donor and a native donor produce the same checksum for the same
   * resident weights (F10). Returns { found, nnz, checksum (decimal string),
   * samples:[{idx,val}] } or { found:false } when the matrix isn't resident.
   * `checksum` is a decimal string (BigInt) so JSON never loses precision.
   */
  async checksumSparseMatrix(name, sampleCount = 0) {
    if (!this._available) return { found: false, nnz: 0, checksum: '0', samples: [] };
    const entry = this._sparseMatrices[name];
    if (!entry) return { found: false, nnz: 0, checksum: '0', samples: [] };
    const device = this._device;
    const nnz = entry.nnz | 0;
    const FNV_OFFSET = 0xcbf29ce484222325n;
    if (nnz === 0) return { found: true, nnz: 0, checksum: FNV_OFFSET.toString(), samples: [] };
    const byteLen = nnz * 4;
    const staging = device.createBuffer({ size: byteLen, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(entry.values, 0, staging, 0, byteLen);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const mapped = staging.getMappedRange();
    const bytes = new Uint8Array(mapped);
    // FNV-1a 64 over the raw LE value bytes. 64-bit math in BigInt masked to u64.
    const MASK = 0xffffffffffffffffn;
    const PRIME = 0x100000001b3n;
    let hash = FNV_OFFSET;
    for (let i = 0; i < byteLen; i++) {
      hash = (hash ^ BigInt(bytes[i])) & MASK;
      hash = (hash * PRIME) & MASK;
    }
    // Evenly-spaced samples (flat nnz index → value), capped at 64.
    const vals = new Float32Array(mapped);
    const cap = Math.min(sampleCount | 0, 64);
    const samples = [];
    if (cap > 0) {
      const step = Math.max(1, Math.floor(nnz / cap));
      for (let i = 0; i < nnz && samples.length < cap; i += step) {
        samples.push({ idx: i, val: vals[i] });
      }
    }
    staging.unmap();
    staging.destroy();
    return { found: true, nnz, checksum: hash.toString(), samples };
  }

  /**
   * Dispatch sparse Hebbian weight update. Reuses PLASTICITY_SHADER.
   * Pre-spikes + post-spikes must be uploaded to the matrix's
   * preSpikes/postSpikes buffers before calling. Weights are updated
   * in place on GPU.
   *
   * @param {string} name
   * @param {number} lr — learning rate
   */
  /**
   * T32 — BATCHED Hebbian dispatch. Runs N Hebbian ops in ONE command
   * encoder + ONE device.queue.submit(). Previous single-op hebbianSparse
   * created fresh encoder + fresh paramsBuf + fresh bindGroup + individual
   * submit PER op. At T18.8 batched WS frames (64 ops per frame) that was
   * 64 separate submits per batch → GPU queue serializes per-submit,
   * CPU ping-pongs with driver between submits → GPU utilization sub-1%
   * at teach velocity even though shader ops are microseconds each.
   *
   * Batched path amortizes all the non-compute overhead across N ops:
   * single encoder, single pass, 64 bindGroups (cheap), 64 dispatches,
   * single submit. WebGPU driver queues the dispatches and the GPU
   * pipelines them without any CPU involvement between compute passes.
   * Expected GPU utilization jump: 1% → 50%+ during teach.
   *
   * @param {Array<{name: string, lr: number}>} ops — N Hebbian ops
   * @returns {boolean} true on success
   */
  hebbianSparseBatch(ops) {
    if (!this._available || !Array.isArray(ops) || ops.length === 0) return false;
    const device = this._device;
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.plasticity);
    const paramsBufs = [];
    let dispatched = 0;
    for (const { name, lr } of ops) {
      const entry = this._sparseMatrices[name];
      if (!entry) continue;
      const bound = !!entry.binding;
      const srcBuf = bound
        ? this._buffers[entry.binding.srcCluster].spikes
        : entry.preSpikes;
      const dstBuf = bound
        ? this._buffers[entry.binding.dstCluster].spikes
        : entry.postSpikes;
      const srcOffset = bound ? entry.binding.srcRegion.start : 0;
      const dstOffset = bound ? entry.binding.dstRegion.start : 0;
      const paramsView = new ArrayBuffer(32);
      new Uint32Array(paramsView, 0, 2).set([entry.rows, entry.nnz]);
      new Float32Array(paramsView, 8, 4).set([lr, 1.0, -2.0, 2.0]);
      new Uint32Array(paramsView, 24, 2).set([srcOffset, dstOffset]);
      const paramsBuf = this._createBuffer(new Uint8Array(paramsView), GPUBufferUsage.UNIFORM);
      paramsBufs.push(paramsBuf);
      const bindGroup = device.createBindGroup({
        layout: this._pipelines.plasticity.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: entry.values } },
          { binding: 2, resource: { buffer: entry.colIdx } },
          { binding: 3, resource: { buffer: entry.rowPtr } },
          { binding: 4, resource: { buffer: srcBuf } },
          { binding: 5, resource: { buffer: dstBuf } },
        ],
      });
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(entry.rows / 256));
      dispatched += 1;
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
    for (const b of paramsBufs) b.destroy();
    return dispatched;
  }

  hebbianSparse(name, lr) {
    if (!this._available) return false;
    const entry = this._sparseMatrices[name];
    if (!entry) return false;
    const device = this._device;

    // T17.7 Phase A.4 — cluster-bound vs standalone dispatch.
    // Cluster-bound: pre-spikes read from src cluster's spikes at
    // srcRegion.start offset; post-spikes read from dst cluster's
    // spikes at dstRegion.start offset (same spikes buffer as used
    // by LIF — post-synaptic neurons fire here). Standalone: from
    // entry.preSpikes / entry.postSpikes at offset 0.
    const bound = !!entry.binding;
    const srcBuf = bound
      ? this._buffers[entry.binding.srcCluster].spikes
      : entry.preSpikes;
    const dstBuf = bound
      ? this._buffers[entry.binding.dstCluster].spikes
      : entry.postSpikes;
    const srcOffset = bound ? entry.binding.srcRegion.start : 0;
    const dstOffset = bound ? entry.binding.dstRegion.start : 0;

    // Pack: n (u32), nnz (u32), lr (f32), reward (f32), wMin (f32),
    // wMax (f32), srcOffset (u32), dstOffset (u32) = 32 bytes
    const paramsView = new ArrayBuffer(32);
    new Uint32Array(paramsView, 0, 2).set([entry.rows, entry.nnz]);
    new Float32Array(paramsView, 8, 4).set([lr, 1.0, -2.0, 2.0]);
    new Uint32Array(paramsView, 24, 2).set([srcOffset, dstOffset]);
    const paramsBuf = this._createBuffer(new Uint8Array(paramsView), GPUBufferUsage.UNIFORM);
    const bindGroup = device.createBindGroup({
      layout: this._pipelines.plasticity.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuf } },
        { binding: 1, resource: { buffer: entry.values } },
        { binding: 2, resource: { buffer: entry.colIdx } },
        { binding: 3, resource: { buffer: entry.rowPtr } },
        { binding: 4, resource: { buffer: srcBuf } },
        { binding: 5, resource: { buffer: dstBuf } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.plasticity);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(entry.rows / 256));
    pass.end();
    device.queue.submit([encoder.finish()]);
    // T18.14.a — DESTROY paramsBuf after submit. WebGPU does NOT garbage
    // collect buffers; the previous "destroyed lazily by device GC"
    // comment was a lie. At ELA-K teach velocity through T18.8 batched
    // Hebbian dispatch (~30K hebbianSparse calls per teach pass), every
    // leaked 32-byte paramsBuf orphans a driver allocation-table handle.
    // NVIDIA drivers cap at ~65K concurrent handles + Windows imposes
    // its own per-process limits on top; after one ELA-K pass the table
    // exhausts → device.lost → Windows TDR → NDIS/WinSock cascade →
    // whole PC loses internet. Destruction
    // after queue.submit() is legal per WebGPU spec: the GPU can still
    // use the buffer's contents from the already-submitted command
    // buffer until the work completes; destroy() releases the handle
    // once the submit finishes. Matches the correct pattern already in
    // propagateSparse at line 1549.
    paramsBuf.destroy();
    return true;
  }

  /**
   * Write spike data into a sparse matrix's pre-spike buffer, so the
   * next propagateSparse/hebbianSparse call sees it.
   */
  writeSparsePreSpikes(name, spikes) {
    const entry = this._sparseMatrices[name];
    if (!entry) return false;
    // T17.7 Phase A.4 — cluster-bound matrices don't have standalone
    // preSpikes (they read from the bound src cluster's spikes buffer
    // via the LIF-populated slice). Skip silently — the spikes are
    // already in the cluster's spike buffer from the last LIF step.
    if (!entry.preSpikes) return true;
    const data = spikes instanceof Uint32Array ? spikes
      : spikes instanceof Uint8Array ? Uint32Array.from(spikes)
      : new Uint32Array(spikes);
    this._device.queue.writeBuffer(entry.preSpikes, 0, data.buffer, data.byteOffset, data.byteLength);
    return true;
  }

  /**
   * Write post-spike data (for Hebbian).
   */
  writeSparsePostSpikes(name, spikes) {
    const entry = this._sparseMatrices[name];
    if (!entry) return false;
    if (!entry.postSpikes) return true;  // cluster-bound: post-spikes live in cluster buffer
    const data = spikes instanceof Uint32Array ? spikes
      : spikes instanceof Uint8Array ? Uint32Array.from(spikes)
      : new Uint32Array(spikes);
    this._device.queue.writeBuffer(entry.postSpikes, 0, data.buffer, data.byteOffset, data.byteLength);
    return true;
  }

  /**
   * T17.7 Phase C.1 — rebind an already-uploaded sparse matrix from
   * standalone mode to cluster-bound mode WITHOUT re-transferring the
   * matrix data. The values/colIdx/rowPtr buffers stay in place; only
   * the per-request shader inputs (src/dst spike + current buffers)
   * change, driven by `entry.binding`.
   *
   * Used at boot time after both the main cortex cluster AND the
   * standalone cortexCluster have uploaded their GPU state. The 14
   * language cross-projections initially come up standalone (via
   * cortexCluster.initGpu()) with their own preSpikes/postCurrents/
   * postSpikes buffers sized for the standalone cluster. After this
   * rebind, propagateSparse/hebbianSparse read from main-cortex spikes
   * buffer at the bound src/dst region offsets and accumulate into
   * main-cortex currents buffer — no more standalone spike mirrors.
   *
   * Standalone buffers are `.destroy()`ed so VRAM pressure drops.
   *
   * @param {string} name — matrix key (e.g., 'cortex_sem_to_motor')
   * @param {{srcCluster, srcRegion:{start,end}, dstCluster, dstRegion:{start,end}}} binding
   * @returns {boolean} — true on success, false if matrix missing or
   *                     bound src/dst clusters aren't yet uploaded
   */
  rebindSparseMatrix(name, binding) {
    if (!this._available) return false;
    const entry = this._sparseMatrices[name];
    if (!entry) {
      console.warn(`[GPUCompute] rebindSparseMatrix: ${name} not found`);
      return false;
    }
    if (!binding || !binding.srcCluster || !binding.dstCluster) {
      console.warn(`[GPUCompute] rebindSparseMatrix ${name}: binding must specify srcCluster + dstCluster`);
      return false;
    }
    const srcBufs = this._buffers[binding.srcCluster];
    const dstBufs = this._buffers[binding.dstCluster];
    if (!srcBufs?.spikes || !dstBufs?.currents) {
      console.warn(`[GPUCompute] rebindSparseMatrix ${name}: src(${binding.srcCluster}) + dst(${binding.dstCluster}) must be uploaded first`);
      return false;
    }
    const srcRegion = binding.srcRegion || { start: 0, end: entry.cols };
    const dstRegion = binding.dstRegion || { start: 0, end: entry.rows };
    const srcLen = srcRegion.end - srcRegion.start;
    const dstLen = dstRegion.end - dstRegion.start;
    if (srcLen !== entry.cols || dstLen !== entry.rows) {
      console.warn(`[GPUCompute] rebindSparseMatrix ${name} size mismatch: srcRegion len=${srcLen} vs cols=${entry.cols}; dstRegion len=${dstLen} vs rows=${entry.rows}`);
      return false;
    }
    entry.binding = {
      srcCluster: binding.srcCluster,
      srcRegion: { start: srcRegion.start, end: srcRegion.end },
      dstCluster: binding.dstCluster,
      dstRegion: { start: dstRegion.start, end: dstRegion.end },
    };
    // Free standalone pre/post/currents buffers — not needed in bound
    // mode (shaders read directly from cluster spike/current buffers).
    if (entry.preSpikes && typeof entry.preSpikes.destroy === 'function') {
      entry.preSpikes.destroy();
      delete entry.preSpikes;
    }
    if (entry.postCurrents && typeof entry.postCurrents.destroy === 'function') {
      entry.postCurrents.destroy();
      delete entry.postCurrents;
    }
    if (entry.postSpikes && typeof entry.postSpikes.destroy === 'function') {
      entry.postSpikes.destroy();
      delete entry.postSpikes;
    }
    return true;
  }

  _createBuffer(data, usage) {
    const buffer = this._device.createBuffer({
      size: data.byteLength,
      usage: usage | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    const dst = buffer.getMappedRange();
    if (data instanceof Float32Array) {
      new Float32Array(dst).set(data);
    } else if (data instanceof Uint32Array) {
      new Uint32Array(dst).set(data);
    } else {
      new Uint8Array(dst).set(new Uint8Array(data));
    }
    buffer.unmap();
    return buffer;
  }

  /**
   * Dispatch 2D workgroups — splits to handle > 65535 × 256 neurons (16.7M+).
   * Returns { gridX, gridY } that matches what shaders use for index calculation.
   */
  _dispatch2D(pass, size, storedGridX) {
    const totalWg = Math.ceil(size / 256);
    const gridX = storedGridX || Math.min(totalWg, 32768);
    const gridY = Math.ceil(totalWg / gridX);
    pass.dispatchWorkgroups(gridX, gridY, 1);
    return { gridX, gridY };
  }

  /**
   * Run one LIF step on GPU for a cluster — SELF-CONTAINED.
   * Generates currents inline, updates voltage in place, counts spikes.
   * Only 3 bindings: params, voltages, spikes.
   *
   * @param {string} name
   * @param {number} effectiveDrive — tonic × drive × emoGate × Ψgain + errCorr
   * @param {number} noiseAmp
   */
  stepNeurons(name, effectiveDrive, noiseAmp) {
    if (!this._available) return;
    const bufs = this._buffers[name];
    if (!bufs) return;
    const device = this._device;

    // Update per-step params. Param struct layout:
    //   n(0), tau(4), vRest(8), vThresh(12), vReset(16), dt(20), R(24),
    //   effectiveDrive(28), noiseAmp(32), seed(36), gridX(40), numRegions(44)
    // effectiveDrive/noiseAmp/seed/numRegions change per-step; gridX
    // was written at init and stays constant, but we include it in the
    // single writeBuffer to keep the range contiguous.
    this._stepSeed = (this._stepSeed + 1) | 0;
    const edBuf = new ArrayBuffer(20);  // covers offsets 28..48
    const edView = new DataView(edBuf);
    edView.setFloat32(0, effectiveDrive ?? 16, true);           // abs 28
    edView.setFloat32(4, noiseAmp ?? 5, true);                  // abs 32
    edView.setUint32(8, this._stepSeed, true);                  // abs 36
    edView.setUint32(12, bufs.gridX || 32768, true);            // abs 40 — re-write same value
    edView.setUint32(16, bufs.numRegions ?? 0, true);           // abs 44 — T17.7
    device.queue.writeBuffer(bufs.params, 28, edBuf);

    // T18.4.a + T17.7 Phase A.3 — LIF bind group includes per-neuron
    // `currents` buffer (synaptic drive from propagate shader) AND the
    // `regionGates` storage buffer (Ψ-modulated hemispheric gate table
    // per sub-region). Both are required for the shader to compute
    // `neuronDrive = (effectiveDrive + currents[i]) * regionGate`.
    const bindGroup = device.createBindGroup({
      layout: this._pipelines.lif.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: bufs.params } },
        { binding: 1, resource: { buffer: bufs.voltages } },
        { binding: 2, resource: { buffer: bufs.spikes } },
        { binding: 3, resource: { buffer: bufs.currents } },
        { binding: 4, resource: { buffer: bufs.regionGates } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.lif);
    pass.setBindGroup(0, bindGroup);
    this._dispatch2D(pass, bufs.size, bufs.gridX);
    pass.end();

    device.queue.submit([encoder.finish()]);
    // No ping-pong — single voltage buffer updated in place
  }

  /**
   * T18.4.a — Zero the per-cluster `currents` buffer at the start of
   * each substep so `SYNAPSE_PROPAGATE_SHADER`'s `currents[i] += sum`
   * accumulation starts fresh. Uses `clearBuffer` (native WebGPU
   * zero-fill) instead of a dispatch so it's essentially free.
   */
  clearCurrents(name) {
    if (!this._available) return;
    const bufs = this._buffers[name];
    if (!bufs?.currents) return;
    const device = this._device;
    const encoder = device.createCommandEncoder();
    encoder.clearBuffer(bufs.currents);
    device.queue.submit([encoder.finish()]);
  }

  /**
   * T18.4.a — Upload external or incoming projection current deltas
   * from CPU (server) into the GPU `currents` buffer before the
   * propagate+LIF dispatch. Used for inter-cluster projections
   * (cortex → amygdala etc) that are computed server-side but feed
   * into GPU-resident neurons. The uploaded values get added to the
   * per-neuron drive via LIF_SHADER's `currents[i]` read.
   *
   * Pass a Float32Array of length `cluster.size`. Values will be
   * written starting at buffer offset 0.
   */
  writeExternalCurrents(name, currentsArray) {
    if (!this._available) return;
    const bufs = this._buffers[name];
    if (!bufs?.currents) return;
    const device = this._device;
    const src = currentsArray instanceof Float32Array ? currentsArray : new Float32Array(currentsArray);
    device.queue.writeBuffer(bufs.currents, 0, src.buffer, src.byteOffset, src.byteLength);
  }

  /**
   * Run synapse propagation on GPU (CSR sparse multiply).
   * @param {string} clusterName
   * @param {string} spikeSourceName — cluster whose spikes drive this propagation
   */
  propagateSynapses(clusterName, spikeSourceName) {
    if (!this._available) return;
    const bufs = this._buffers[clusterName];
    const srcBufs = this._buffers[spikeSourceName || clusterName];
    if (!bufs?.synValues || !srcBufs) return;
    const device = this._device;

    // Params for propagation
    const params = new ArrayBuffer(8);
    const view = new DataView(params);
    view.setUint32(0, bufs.size, true);
    view.setUint32(4, bufs.synNnz, true);

    const paramsBuffer = this._createBuffer(params, GPUBufferUsage.UNIFORM);

    const bindGroup = device.createBindGroup({
      layout: this._pipelines.propagate.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: bufs.synValues } },
        { binding: 2, resource: { buffer: bufs.synColIdx } },
        { binding: 3, resource: { buffer: bufs.synRowPtr } },
        { binding: 4, resource: { buffer: srcBufs.spikes } },
        { binding: 5, resource: { buffer: bufs.currents } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.propagate);
    pass.setBindGroup(0, bindGroup);
    this._dispatch2D(pass, bufs.size, bufs.gridX);
    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  /**
   * Read spike data back from GPU.
   * @param {string} name — cluster name
   * @returns {Promise<Uint32Array>}
   */
  // readbackSpikes removed — use readbackSpikeCount for aggregated count

  /**
   * Read voltage data back from GPU.
   * @param {string} name
   * @returns {Promise<Float32Array>}
   */
  // readbackVoltages removed — voltages stay on GPU, never read back

  // generateCurrents: REMOVED — LIF shader generates currents inline now
  // saves 4 bytes/neuron and eliminates an entire dispatch pass

  /**
   * Count spikes on GPU using atomic counter — no JS scan loop.
   * @param {string} name — cluster name
   * @returns {Promise<number>} spike count
   */
  async readbackSpikeCount(name) {
    const bufs = this._buffers[name];
    if (!bufs) return 0;
    const device = this._device;

    // Atomic counter buffer is per-cluster and persistent — safe to
    // share across sequential calls because it's cleared via
    // writeBuffer at the start of each dispatch.
    if (!bufs.spikeCountBuf) {
      bufs.spikeCountBuf = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
    }

    // T14.22.6 — per-call readback buffer. The old code shared
    // bufs.spikeCountReadback across all calls for this cluster,
    // which collided when two fullStep calls overlapped in time:
    // call 1 awaited mapAsync on the shared buffer, call 2 tried
    // to submit an encoder that used the same buffer as a copy
    // destination while it was still pending-mapped from call 1,
    // producing:
    //   Failed to execute 'mapAsync' on 'GPUBuffer': Buffer
    //   already has an outstanding map pending.
    // Plus cascading "used in submit while mapped/pending map"
    // warnings. T14.22.3 worked around this by serializing fullStep
    // calls in compute.html, which fixed the crash but cost 7x
    // parallelism — 7 clusters ran sequentially instead of
    // concurrently, turning ~50ms/substep into ~350ms/substep
    // (500x slower wall-clock at 677M-neuron biological scale).
    //
    // Real fix: per-call readback buffer. 4 bytes, disposable,
    // freed immediately after unmap. Concurrent calls for the
    // SAME cluster each get their own readback buffer with its
    // own map lifecycle — no shared state, no collision possible.
    // Then the compute.html serialization can come back off and
    // all 7 clusters run in parallel on the GPU again.
    const readback = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Zero the counter
    device.queue.writeBuffer(bufs.spikeCountBuf, 0, new Uint32Array([0]));

    // Params: n, gridX + 2 padding (16 bytes minimum for uniform alignment)
    const params = new ArrayBuffer(16);
    const view = new DataView(params);
    view.setUint32(0, bufs.size, true);
    view.setUint32(4, bufs.gridX || 32768, true);
    const paramsBuffer = this._createBuffer(params, GPUBufferUsage.UNIFORM);

    const bindGroup = device.createBindGroup({
      layout: this._pipelines.spikeCount.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: bufs.spikes } },
        { binding: 2, resource: { buffer: bufs.spikeCountBuf } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.spikeCount);
    pass.setBindGroup(0, bindGroup);
    this._dispatch2D(pass, bufs.size, bufs.gridX);
    pass.end();

    // Readback the count into the per-call disposable buffer
    encoder.copyBufferToBuffer(bufs.spikeCountBuf, 0, readback, 0, 4);
    device.queue.submit([encoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const count = new Uint32Array(readback.getMappedRange().slice(0))[0];
    readback.unmap();
    // Free the disposable buffer + disposable paramsBuffer.
    // WebGPU reclaims these when destroyed explicitly rather than
    // waiting for GC, keeping GPU memory bounded under steady load.
    readback.destroy();
    paramsBuffer.destroy();
    return count;
  }

  /**
   * T18.4.c — Voltage mean on GPU via atomic reduction, no CPU scan.
   * Accumulates scaled integer representation of Rulkov x-component
   * (fast variable, the spike analog) across every neuron atomically,
   * reads back the single i32 sum, divides by size + VOLT_SCALE=1000
   * for the mean. Used by the compute_batch path to emit per-cluster
   * mean voltage as a new telemetry channel.
   *
   * Prior behavior: voltages stayed on GPU, never aggregated, main
   * brain exposed no voltage telemetry at all. Now the dashboard HUD
   * can show mean voltage per cluster same as it shows spike count.
   *
   * @param {string} name — cluster name
   * @returns {Promise<number>} mean Rulkov x across the cluster
   */
  async readbackVoltageMean(name) {
    const bufs = this._buffers[name];
    if (!bufs) return 0;
    const device = this._device;

    // Atomic sum buffer — persistent, zeroed per call like spikeCountBuf.
    if (!bufs.voltSumBuf) {
      bufs.voltSumBuf = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
    }

    // Per-call disposable readback to avoid mapAsync collisions under
    // concurrent calls for the same cluster (same rationale as
    // readbackSpikeCount's per-call readback buffer).
    const readback = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(bufs.voltSumBuf, 0, new Int32Array([0]));

    const params = new ArrayBuffer(16);
    const view = new DataView(params);
    view.setUint32(0, bufs.size, true);
    view.setUint32(4, bufs.gridX || 32768, true);
    const paramsBuffer = this._createBuffer(params, GPUBufferUsage.UNIFORM);

    const bindGroup = device.createBindGroup({
      layout: this._pipelines.voltStats.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: bufs.voltages } },
        { binding: 2, resource: { buffer: bufs.voltSumBuf } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this._pipelines.voltStats);
    pass.setBindGroup(0, bindGroup);
    this._dispatch2D(pass, bufs.size, bufs.gridX);
    pass.end();

    encoder.copyBufferToBuffer(bufs.voltSumBuf, 0, readback, 0, 4);
    device.queue.submit([encoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const scaledSum = new Int32Array(readback.getMappedRange().slice(0))[0];
    readback.unmap();
    readback.destroy();
    paramsBuffer.destroy();

    const VOLT_SCALE = 1000;
    return scaledSum / Math.max(1, bufs.size) / VOLT_SCALE;
  }

  /**
   * Full GPU step — generate currents + LIF + spike count. No JS loops.
   * @param {string} name
   * @param {number} effectiveDrive
   * @param {number} noiseAmp
   * @returns {Promise<{spikeCount: number}>}
   */
  async fullStep(name, effectiveDrive, noiseAmp) {
    // T18.4.a (2026-04-18) — FULL pipeline: clear → propagate → LIF.
    //
    // Prior behavior: single LIF dispatch with inline drive+noise. The
    // `currents` buffer existed but LIF_SHADER never read it, and
    // SYNAPSE_PROPAGATE_SHADER was never dispatched from fullStep —
    // so main-brain neurons saw only the global drive uniform, the
    // intra-cluster synapse matrix was uploaded but never consumed,
    // and Unity's brain had zero synaptic recurrence on GPU. Per the operator
    // 2026-04-18: "does it fully do all we need for the main brain
    // equation and all sub equations in totality" — the answer was no.
    //
    // Now: each substep clears currents, runs intra-cluster sparse
    // matmul (currents[i] += Σ W·spike_prev), then LIF reads
    // currents[i] as per-neuron synaptic drive on top of the global
    // effectiveDrive uniform. Full intra-cluster recurrence live on GPU.
    //
    // If the cluster has no intra-cluster synapse matrix uploaded
    // (pure driven population, no recurrence), propagateSynapses is a
    // no-op and we fall through to drive+noise-only LIF like before.
    this.clearCurrents(name);
    const bufs = this._buffers[name];
    if (bufs?.synValues) {
      this.propagateSynapses(name, name);
    }
    this.stepNeurons(name, effectiveDrive, noiseAmp);
    const spikeCount = await this.readbackSpikeCount(name);
    return { spikeCount };
  }

  /**
   * Check if GPU compute is available and initialized.
   */
  get available() { return this._available; }

  /**
   * Release all GPU resources.
   */
  destroy() {
    for (const bufs of Object.values(this._buffers)) {
      for (const [key, buf] of Object.entries(bufs)) {
        if (buf?.destroy) buf.destroy();
      }
    }
    this._buffers = {};
    this._device?.destroy();
    this._available = false;
  }
}

/**
 * Auto-detect WebGPU and initialize compute.
 * @returns {Promise<GPUCompute|null>}
 */
export async function initGPUCompute() {
  const gpu = new GPUCompute();
  const ok = await gpu.init();
  return ok ? gpu : null;
}
