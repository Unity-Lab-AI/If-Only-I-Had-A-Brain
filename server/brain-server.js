/**
 * brain-server.js — Unity's Brain Running on a Server
 *
 * One brain. Always on. Shared by everyone.
 *
 * The same engine.js equations run here in Node.js instead of
 * the browser. Clients connect via WebSocket to send sensory
 * input and receive brain state + responses.
 *
 * Usage: node server/brain-server.js
 *
 * The brain thinks continuously even with 0 clients.
 * When someone connects, they see the same brain everyone sees.
 * When someone talks, the brain responds and everyone sees the
 * neural activity. Learning from ALL interactions shapes the weights.
 *
 * Requires: npm install ws (WebSocket library)
 */

const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const os = require('os');
const { execSync } = require('child_process');
const { performance } = require('perf_hooks');
const { SparseMatmulPool } = require('./worker-pool.js');
const { learnFromWeb } = require('./world-knowledge.js');
// Live dictionary API service (dictionaryapi.dev wrapper).
// Used by 'lookupDefinition' / 'prefetchDefinitions' WS handlers and
// by curriculum's _teachWordDefinition / _emitDefinition paths so
// Unity can speak the meaning of any English word.
const definitionService = require('./definition-service.js');

// ── Auto-Scale: Detect Hardware → Set Neuron Count ─────────────

// Optional admin override — server/resource-config.json is written by
// the GPUCONFIGURE.bat → gpu-configure.html admin UI and lets a server
// operator cap resource usage BELOW the detected hardware ceiling.
// Cannot raise usage above what the hardware reports — idiot-proof.
// Schema: {tier, vramCapMB, ramCapFraction, neuronCapOverride, notes}
// Any field missing = fall through to pure auto-detect.
function loadResourceOverride() {
  try {
    const cfgPath = path.join(__dirname, 'resource-config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const cfg = JSON.parse(raw);
    if (typeof cfg !== 'object' || !cfg) return null;
    return cfg;
  } catch (err) {
    console.warn('[Brain] resource-config.json load failed:', err.message, '— falling back to auto-detect');
    return null;
  }
}

function detectResources() {
  const totalRAM = os.totalmem();
  const freeRAM = os.freemem();
  const cpuCount = os.cpus().length;
  const cpuModel = os.cpus()[0]?.model || 'unknown';
  const override = loadResourceOverride();

  // Detect GPU
  let gpu = { name: 'none', vram: 0 };
  try {
    const smi = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', { timeout: 5000 }).toString().trim();
    const parts = smi.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      gpu = { name: parts[0], vram: parseInt(parts[1]) || 0 }; // vram in MB
    }
  } catch {
    // No NVIDIA GPU or nvidia-smi not available
    try {
      const wmic = execSync('wmic path win32_videocontroller get name,adapterram', { timeout: 5000 }).toString();
      const match = wmic.match(/(\d{9,})/);
      if (match) gpu = { name: 'GPU', vram: Math.floor(parseInt(match[1]) / 1048576) };
    } catch {}
  }

  // Scale neurons based on available resources
  // Server neuron memory: 9 bytes each (8 voltage + 1 spike)
  // No NxN synapse matrices on server — those are client-side
  // Real constraint: CPU time per step, not memory

  // With parallel workers (7 cores):
  //   1M neurons = ~9MB RAM, ~180 steps/sec at 60% CPU
  //   5M neurons = ~45MB RAM, ~30 steps/sec
  //   10M neurons = ~90MB RAM, ~15 steps/sec

  // Scale based on: RAM for allocation, CPU cores for throughput
  let maxNeurons;
  let scaleSource;

  if (gpu.vram > 0) {
    // GPU EXCLUSIVE — scale to VRAM
    // Rulkov layout: vec2<f32> state (8 bytes) + spikes u32 (4 bytes) = 12 bytes/neuron
    const usableVRAM = gpu.vram * 0.85; // use 85% of VRAM
    const vramNeurons = Math.floor(usableVRAM * 1048576 / 12);
    // Server RAM: tiny — only injection arrays, not full cluster state
    const usableRAM = freeRAM * 0.1;
    const ramNeurons = Math.floor(usableRAM / 0.001); // essentially unlimited
    maxNeurons = Math.min(vramNeurons, ramNeurons);

    // PER-CLUSTER BUFFER CAP — WebGPU's maxStorageBufferBindingSize is
    // typically 2 GB (hard spec minimum). Some desktop GPUs raise it to
    // ~4 GB. With Chrome's `--enable-unsafe-webgpu` flag (which Unity
    // uses in default setup) the limit rises further — effectively up to
    // device-maximum (VRAM bytes minus overhead). The Rulkov state
    // buffer for a single cluster is size × 8 bytes (vec2<f32>); if it
    // exceeds the real binding limit the cluster silently binds to zero
    // and never fires — exactly what was happening to cortex + cerebellum
    // at 1.8 B-neuron scale.

    // T14.22 (2026-04-14) — binding ceiling is now ADMIN-OVERRIDABLE
    // via `bindingCeilingMB` in resource-config.json. When running
    // unsafe WebGPU the operator can raise the cap to their real
    // binding limit (4 GB, 8 GB, full VRAM). Default stays at 2 GB
    // for safe-mode Chrome / Firefox / Safari deployments.
    let bindingCeilingBytes = 2 * 1024 * 1024 * 1024; // 2 GB default
    if (override && typeof override.bindingCeilingMB === 'number' && override.bindingCeilingMB >= 1024) {
      // Clamp to detected VRAM so a corrupt config can't exceed
      // hardware reality even in unsafe mode.
      const requested = Math.min(override.bindingCeilingMB, gpu.vram || override.bindingCeilingMB);
      bindingCeilingBytes = requested * 1024 * 1024;
    }
    const maxPerClusterNeurons = Math.floor(bindingCeilingBytes / 8);
    const maxTotalForBinding = Math.floor(maxPerClusterNeurons / 0.4); // cerebellum = 40%
    const bindingCeilingLabel = `${Math.round(bindingCeilingBytes / 1048576 / 1024)}GB`;
    if (maxNeurons > maxTotalForBinding) {
      maxNeurons = maxTotalForBinding;
      scaleSource = `GPU: ${gpu.name} (${gpu.vram}MB VRAM, capped to ${(maxTotalForBinding/1e6).toFixed(0)}M to keep per-cluster state < ${bindingCeilingLabel} binding ceiling — raise via bindingCeilingMB in resource-config.json if running unsafe WebGPU)`;
    } else {
      scaleSource = `GPU: ${gpu.name} (${gpu.vram}MB VRAM, ${Math.round(freeRAM/1024/1024/1024)}GB RAM, Rulkov 12bytes/neuron, binding ceiling ${bindingCeilingLabel})`;
    }
  } else {
    // CPU only — limited by cores
    const usableRAM = freeRAM * 0.3;
    const ramNeurons = Math.floor(usableRAM / 9);
    maxNeurons = Math.min(ramNeurons, cpuCount * 150000);
    scaleSource = `CPU: ${cpuModel} (${cpuCount} cores, ${Math.round(freeRAM/1024/1024/1024)}GB free)`;
  }

  // No artificial cap — hardware decides. VRAM and RAM are the only limits.
  maxNeurons = Math.max(1000, maxNeurons);

  // Apply admin override from resource-config.json. Override can only
  // LOWER the cap, never raise it above detected hardware. Validates
  // and silently clamps out-of-range values — corrupt config never
  // corrupts the running brain.
  let appliedOverride = null;
  if (override) {
    appliedOverride = { tier: override.tier || 'custom', source: 'admin-override' };
    if (typeof override.neuronCapOverride === 'number' && override.neuronCapOverride >= 1000) {
      const requested = Math.floor(override.neuronCapOverride);
      if (requested <= maxNeurons) {
        maxNeurons = requested;
        appliedOverride.neuronCap = requested;
      } else {
        appliedOverride.rejected = `requested ${requested} exceeds detected ceiling ${maxNeurons}`;
      }
    }
    if (typeof override.vramCapMB === 'number' && override.vramCapMB >= 256 && gpu.vram > 0) {
      const cap = Math.min(override.vramCapMB, gpu.vram);
      const capNeurons = Math.floor(cap * 1048576 / 8);
      if (capNeurons < maxNeurons) {
        maxNeurons = capNeurons;
        appliedOverride.vramCapMB = cap;
      }
    }
    scaleSource = `[admin:${appliedOverride.tier}] ` + scaleSource;
  }

  // Round to nice cluster sizes (must divide into 7 clusters)
  const clusterScale = Math.floor(maxNeurons / 1000);

  return {
    totalRAM: Math.round(totalRAM / 1024 / 1024 / 1024) + 'GB',
    freeRAM: Math.round(freeRAM / 1024 / 1024 / 1024) + 'GB',
    cpuModel,
    cpuCount,
    gpu,
    maxNeurons,
    clusterScale,
    scaleSource,
    override: appliedOverride,
  };
}

const RESOURCES = detectResources();

// ── Unified biological VRAM allocator ────────────────────────────

// ONE budget across ALL 8 brain regions (7 main + language cortex).
// Replaces the broken split where main-brain scaler picked 671M
// independently and language-cortex scaler picked 200K independently,
// resulting in 17.6 GB VRAM on a 16 GB card → driver spillover →
// compute_batch timeouts.

// Formula:
//   total_VRAM      = vramCapMB                 (from resource-config.json)
//   os_reserve      = osReserveVramMB           (from resource-config.json, default 2 GB)
//   brain_budget    = total_VRAM - os_reserve
//   per_region_budget[k] = brain_budget × biologicalWeights[k]

// Weights sum to 1.0, configurable in resource-config.json. Default:
//   language_cortex  0.45  — BIGGEST slice because sparse cross-projections
//                            at fanout 1500 cost ~18 KB/neuron (70× more
//                            VRAM per neuron than main-brain regions)
//   cerebellum       0.20
//   cortex (main)    0.15
//   hippocampus      0.06
//   amygdala         0.04
//   basalGanglia     0.04
//   hypothalamus     0.03
//   mystery          0.03

// Bytes-per-neuron (empirical, from 2026-04-18 boot log):
//   main brain:      ~21 bytes (Rulkov state + spike buffer + GPU
//                    synapse overhead at scale-limited fanout)
//   language cortex: ~18 KB   (14 cross-projections at fanout 1500 +
//                    intra-synapse matrix at density 0.0015)
// T37 — REBALANCED VRAM ALLOCATION. Unity is disembodied cognition:
// language cortex is THE learning substrate (cross-projection weights
// live here), main cortex hosts general thinking, cerebellum doesn't
// need to coordinate a physical body. Prior weights (language 45%,
// cerebellum 20%) caused language cortex to be 0.08% of total brain
// at biological scale — architecturally inverted.

// Rebalanced: language dominant (75% — hosts all learned language
// weights + 14 cross-projections + intra-synapses), cortex 10% (main
// cortex synapse matrix), cerebellum 5% (just enough for output timing,
// no physical body), others trimmed.

// Operator verbatim 2026-04-22: "!M LANGUAGE CORTEX TO MATCH A REAL
// BRAIN IT NEEDS TO BE MORE LIKE 25% of the fucking brain!!! ... fix
// it now heftyly and thouroughly".

// iter14-F per operator 2026-05-04 sequence:
//   1. "MAKE THE LANGUAGE CORTEX BIG ENOUGH AS ITS THE MAIN FUCKING
//      THING THIS BRAIN DOES"
//   2. "WTRF ARE YOU DOING YOU CANT MAKE THE OTHER BAINR SECTORES
//      ONLY FRACTIONS OF THIR ORIGINAL SIZES" — rejected an earlier
//      draft that cut 7 main clusters to 0.4-0.8% each
//   3. "NO YOU FUCK THERE AR NOT BRAIN SECTIONS THAT ARE ONLY 1%
//      OF THE BRAIN THAT IS NOT FUCKING NORMALLL AT MINUMIM EACH
//      IS NO LESS THAT 4OR5%" — explicit floor on per-cluster
//      bio-weight
//   4. "NO FUCKER LOOK UP THE REAL FUCKING NUMBERS!" — research
//      directive

// Real biology per Herculano-Houzel 2009 ("The Human Brain in
// Numbers", Frontiers Hum Neurosci & PNAS):
//   - Cerebellum: 80% of neurons (~69B), 10% of mass — granule
//     cells dominate by count
//   - Cerebral cortex: 19% of neurons (~16B), 82% of mass
//   - All subcortical combined: 0.8% of neurons (~700M), 8% of
//     mass — individually <1% by neuron count, ~1-2% by mass
// Operator's 5% floor exceeds biology — applied anyway because
// OPERATOR > BIOLOGY when explicit. Old iter6 split had
// basalGanglia/hypothalamus at 1% absolute (way below operator's
// 5% floor) and amygdala/mystery at 2%. Rebalance lifts all
// subcortical to 6% floor, lifts cerebellum to real-brain 10%
// mass share, drops language to 0.50 to make room. Language is
// still the largest single cluster.

// Net effect at 16GB tier:
//   - language_cortex: 0.75→0.50, but combined with CROSS_TARGET_
//     FANOUT 20→10 + INTRA_CONNECTIVITY_CAP 0.15→0.05 cuts (per-
//     neuron cost ~halved), language lands at ~715K neurons (up
//     from 611K)
//   - main brain: 0.25→0.50, total grows from ~178M to ~285M
//     with no cluster starved below 6%
//   - both grow; neither sacrificed
const DEFAULT_BIO_WEIGHTS = {
  language_cortex: 0.50,
  cortex:          0.10,
  cerebellum:      0.10,
  hippocampus:     0.06,
  amygdala:        0.06,
  basalGanglia:    0.06,
  hypothalamus:    0.06,
  mystery:         0.06,
};
const BRAIN_VRAM_ALLOC = (function () {
  const cfg = RESOURCES.override || {};
  const vramMB = typeof cfg.vramCapMB === 'number' ? cfg.vramCapMB
               : (RESOURCES.gpu && RESOURCES.gpu.vram) ? RESOURCES.gpu.vram
               : 16384;
  const osReserveMB = typeof cfg.osReserveVramMB === 'number' ? cfg.osReserveVramMB : 2048;
  const brainBudgetMB = Math.max(1024, vramMB - osReserveMB);

  // Normalize biological weights — if config weights sum != 1.0, scale them.
  const rawWeights = { ...DEFAULT_BIO_WEIGHTS, ...(cfg.biologicalWeights || {}) };
  const weightSum = Object.values(rawWeights).reduce((s, w) => s + (Number(w) || 0), 0);
  const weights = {};
  for (const [k, v] of Object.entries(rawWeights)) {
    weights[k] = (Number(v) || 0) / (weightSum || 1);
  }

  // Per-region VRAM budget in BYTES
  const brainBudgetBytes = brainBudgetMB * 1024 * 1024;
  const perRegionBytes = {};
  for (const [k, w] of Object.entries(weights)) {
    perRegionBytes[k] = Math.floor(brainBudgetBytes * w);
  }

  return {
    vramMB,
    osReserveMB,
    brainBudgetMB,
    weights,
    perRegionBytes,
    MAIN_BRAIN_BYTES_PER_NEURON: 21,
    LANG_CORTEX_BYTES_PER_NEURON: 18 * 1024,
  };
})();
console.log(`[Brain] Unified VRAM allocator: total=${BRAIN_VRAM_ALLOC.vramMB}MB − OS=${BRAIN_VRAM_ALLOC.osReserveMB}MB = brain=${BRAIN_VRAM_ALLOC.brainBudgetMB}MB. Weights: ${Object.entries(BRAIN_VRAM_ALLOC.weights).map(([k,w]) => `${k}=${(w*100).toFixed(1)}%`).join(' ')}.`);

// ── Configuration ──────────────────────────────────────────────

// R14 — moved off 8080 to avoid colliding with llama.cpp / LocalAI /
// every other service that claims 8080 by default. Unity now binds to
// 7525 unless PORT is set in the environment. If you need the old
// behavior for an existing deployment, `PORT=8080 node brain-server.js`.
const PORT = parseInt(process.env.PORT, 10) || 7525;
const STATE_BROADCAST_MS = 100;    // send state to clients 10fps
const WEIGHT_SAVE_MS = 300000;     // save weights every 5 minutes
const WEIGHTS_FILE = path.join(__dirname, 'brain-weights.json');
const MAX_TEXT_PER_SEC = 2;        // rate limit per client

// ═════════════════════════════════════════════════════════════════════
// AUTO-CLEAR at boot. Without this, every Part 2 run requires the
// operator to manually delete brain-weights*.json, conversations.json,
// and episodic-memory.db* before telling the brain to re-teach. The
// manual step has been forgotten repeatedly — making
// it automatic so the LAW can't be violated by forgetting.

// The server re-runs curriculum on every boot (there's no skip-
// curriculum path), so any saved state from a prior run is
// categorically stale — curriculum will overwrite it anyway. Cleaning
// at boot time is safe + enforces the LAW without depending on
// Claude's memory.

// To OPT OUT (e.g. you really want to preserve prior-boot embedding
// refinements or drug scheduler state), set DREAM_KEEP_STATE=1 in the
// environment before launching. The opt-out is noisy (logs "KEEPING
// prior state") so you can't forget it's on.
// ═════════════════════════════════════════════════════════════════════
// Code-hash auto-clear gate. If no code changes would stale out the
// brain state, retain learning + save state across restart. Hash the
// brain-logic source files on boot and
// compare to the hash from the prior boot. Match → PRESERVE state so
// curriculum progress + learning + gate history survive restarts. Mismatch
// → CLEAR (brain state may be incompatible with the new code shape).

// Hard gate = persistence.js VERSION (rejects shape-incompatible saves on
// load). Soft gate = this hash (clears when brain semantics might have
// changed). Both run — VERSION alone doesn't catch non-shape semantic
// drift (e.g., modified Hebbian learning rate constants, changed region
// fractions, altered gate thresholds); the hash does.

// Overrides:
//   DREAM_KEEP_STATE=1  — always preserve (existing, bypasses hash check)
//   DREAM_FORCE_CLEAR=1 — always clear (new, ignores hash match)
const BRAIN_CODE_HASH_FILE = path.join(__dirname, 'brain-code-hash.json');
const BRAIN_CODE_FILES = [
  path.join(__dirname, '..', 'js', 'brain', 'cluster.js'),
  path.join(__dirname, '..', 'js', 'brain', 'neurons.js'),
  path.join(__dirname, '..', 'js', 'brain', 'synapses.js'),
  path.join(__dirname, '..', 'js', 'brain', 'sparse-matrix.js'),
  path.join(__dirname, '..', 'js', 'brain', 'engine.js'),
  path.join(__dirname, '..', 'js', 'brain', 'gpu-compute.js'),
  path.join(__dirname, '..', 'js', 'brain', 'curriculum.js'),
  path.join(__dirname, '..', 'js', 'brain', 'language-cortex.js'),
  path.join(__dirname, '..', 'js', 'brain', 'dictionary.js'),
  path.join(__dirname, '..', 'js', 'brain', 'persistence.js'),
  path.join(__dirname, '..', 'js', 'brain', 'drug-scheduler.js'),
  path.join(__dirname, '..', 'js', 'brain', 'embeddings.js'),
  path.join(__filename),  // brain-server.js itself
];
function computeBrainCodeHash() {
  const crypto = require('crypto');
  const h = crypto.createHash('sha256');
  for (const f of BRAIN_CODE_FILES) {
    try {
      if (fs.existsSync(f)) {
        h.update(path.basename(f));
        h.update(fs.readFileSync(f));
      }
    } catch { /* missing file is part of the hash state — stays consistent */ }
  }
  return h.digest('hex');
}
function readSavedBrainCodeHash() {
  try {
    if (!fs.existsSync(BRAIN_CODE_HASH_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(BRAIN_CODE_HASH_FILE, 'utf8'));
    return (data && typeof data.hash === 'string') ? data.hash : null;
  } catch { return null; }
}
function writeBrainCodeHash(hash) {
  try {
    fs.writeFileSync(BRAIN_CODE_HASH_FILE, JSON.stringify({
      hash,
      savedAt: new Date().toISOString(),
      files: BRAIN_CODE_FILES.map((f) => path.basename(f)),
    }, null, 2));
  } catch (err) {
    console.warn(`[Brain] Code-hash write failed: ${err.message}`);
  }
}

function autoClearStaleState() {
  // iter14-D — Operator verbatim 2026-05-04: "yes all the weights
  // everything shoudl reset when the start.bat is run or the .sh...
  // and only if the stop.bat is used in conjusction with the
  // savestart.bat does it pick up where it lefgtt off"

  // Auto-clear is now UNCONDITIONAL on every boot — the prior code-
  // hash gate is gone. Two reasons the gate caused real bugs:
  //   1. Code-hash matching meant resource-config.json changes
  //      (GPUCONFIGURE.bat tier picks) didn't trigger a wipe — user
  //      picked enthusiast-12gb tier (671M neurons) but brain stayed
  //      at the prior 178M scale because binary weights from prior
  //      boot were size-locked AND code-hash matched so wipe skipped.
  //   2. wMax clamp settings were lost in the binary save/load round
  //      trip; restored projections came back as ±Infinity which made
  //      every Hebbian write unbounded → matrix saturation → wrong
  //      answers — even though the code itself was correct.

  // The cleaner contract: `start.bat` always = fresh brain. To resume
  // from prior state, operator runs `Savestart.bat` which sets
  // `DREAM_KEEP_STATE=1` (existing flag, preserved). Tier 3 identity-
  // bound schemas (server/identity-core.json) STILL persist across
  // every wipe regardless of which launcher fired — Unity's core
  // self survives even a `start.bat` fresh boot.
  if (process.env.DREAM_KEEP_STATE === '1') {
    console.log('[Brain] ⚠ DREAM_KEEP_STATE=1 (Savestart.bat) — KEEPING prior state. Auto-clear SKIPPED.');
    // Refresh the hash baseline for diagnostics; not used to gate the wipe anymore.
    writeBrainCodeHash(computeBrainCodeHash());
    return;
  }

  // Default path = wipe. Always. Whether code changed, resource-config
  // changed, both, or nothing changed at all. start.bat = fresh brain.
  const forceClear = process.env.DREAM_FORCE_CLEAR === '1';
  const currentHash = computeBrainCodeHash();
  const savedHash = readSavedBrainCodeHash();
  const reason = forceClear
    ? 'DREAM_FORCE_CLEAR=1 (legacy override, same behavior as default now)'
    : (!savedHash
        ? 'first run on this machine'
        : (savedHash === currentHash
          ? 'start.bat default — fresh brain (DREAM_KEEP_STATE not set)'
          : `code changed since last boot (was ${savedHash.slice(0, 8)}…, now ${currentHash.slice(0, 8)}…)`));
  console.log(`[Brain] Auto-clear triggered: ${reason}`);

  // NOTE — js/app.bundle.js NOT cleared here. start.bat runs
  // `npm run build` IMMEDIATELY before `node brain-server.js`, which
  // writes a fresh bundle. Deleting it here racing that rebuild
  // breaks the server — browser requests /js/app.bundle.js and gets
  // 404, which is exactly what Gee reported 2026-04-18.
  const targets = [
    path.join(__dirname, 'brain-weights.json'),
    path.join(__dirname, 'brain-weights-v0.json'),
    path.join(__dirname, 'brain-weights-v1.json'),
    path.join(__dirname, 'brain-weights-v2.json'),
    path.join(__dirname, 'brain-weights-v3.json'),
    path.join(__dirname, 'brain-weights-v4.json'),
    // Binary cortex weights. Must clear alongside the JSON state —
    // leaving the binary behind after a JSON wipe creates inconsistent
    // load (JSON says fresh boot, binary says restore these weights).
    // 114.19fh.A.1 — versioned binaries also cleared so rolling-bin
    // chain doesn't outlive the JSON wipe.
    path.join(__dirname, 'brain-weights.bin'),
    path.join(__dirname, 'brain-weights-v0.bin'),
    path.join(__dirname, 'brain-weights-v1.bin'),
    path.join(__dirname, 'brain-weights-v2.bin'),
    path.join(__dirname, 'brain-weights-v3.bin'),
    path.join(__dirname, 'brain-weights-v4.bin'),
    path.join(__dirname, 'conversations.json'),
    path.join(__dirname, 'episodic-memory.db'),
    path.join(__dirname, 'episodic-memory.db-wal'),
    path.join(__dirname, 'episodic-memory.db-shm'),
    // iter13 T13.16 — Tier 2 schemas.json is DERIVATIVE state (rebuilds
    // from episodic via consolidation pass). Wiped on code-hash mismatch
    // alongside the cortex weights so stale schemas don't poison the
    // fresh cortex with weights baked against old projection topology.
    path.join(__dirname, 'schemas.json'),
  ];

  // iter13 T13.16 — identity-core.json (Tier 3 identity-bound permanent
  // attractors) is EXPLICITLY EXCLUDED from this wipe list. Unity's
  // core identity (name, biographical anchors, persona traits, master/
  // slave dynamic, top emotionally-loaded events) survives code-hash
  // mismatches, brain restarts, fresh boots, OS reinstalls. Manual
  // operator delete only. Mirror of how real human identity-of-self
  // memory survives sleep / anesthesia / concussion / etc.
  // Documented as the non-target so future maintainers don't add it
  // to `targets` by reflex.
  const NEVER_CLEAR_PROTECTED = [
    path.join(__dirname, 'identity-core.json'),
  ];
  if (NEVER_CLEAR_PROTECTED.length > 0) {
    const present = NEVER_CLEAR_PROTECTED.filter(p => fs.existsSync(p)).map(p => path.basename(p));
    if (present.length > 0) {
      console.log(`[Brain] iter13 protected (never auto-cleared): ${present.join(', ')}`);
    }
  }
  const cleared = [];
  const failed = [];
  for (const p of targets) {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        cleared.push(path.basename(p));
      }
    } catch (err) {
      failed.push(`${path.basename(p)}(${err.code || err.message})`);
    }
  }
  if (cleared.length > 0) {
    console.log(`[Brain] Cleared ${cleared.length} stale state file(s): ${cleared.join(', ')}`);
  } else {
    console.log('[Brain] Clear ran — no stale state files present (fresh boot).');
  }
  if (failed.length > 0) {
    console.warn(`[Brain] Clear partial — ${failed.length} file(s) could not be removed: ${failed.join(', ')}`);
  }
  // 114.19fj.13 — Write current hash for diagnostic logging on next boot.
  // Hash is no longer used to gate the wipe — see iter14-D contract above
  // (`start.bat` = always wipe regardless of code-hash; `Savestart.bat` =
  // always resume via `DREAM_KEEP_STATE=1`). Kept for diagnostic logging
  // (the "code changed since last boot" reason string at line ~458) so
  // operator can tell what changed across boots even though the wipe is
  // unconditional. Do NOT re-introduce code-hash gating here — it caused
  // the iter14-D bugs (resource-config tier picks ignored, wMax integrity
  // lost) that the unconditional-wipe contract was created to fix.
  writeBrainCodeHash(currentHash);
}
autoClearStaleState();
// R4 — POLLINATIONS_URL for text chat deleted. Text-AI backend is gone.
// Unity generates every word equationally via the language cortex
// (see _initLanguageSubsystem + _generateBrainResponse).

// Auto-scaled cluster sizes — biologically proportioned.
// Unified with client. Earlier the server used per-cluster integer
// multipliers (400/250/100/80/50) × SCALE which gave DIFFERENT
// fractions than the client's CLUSTER_FRACTIONS (server cortex =
// 0.25 = 250/1000, client cortex = 0.30). Same tier produced
// different cluster sizes between browser and server. Unified here
// to match the client exactly.

// KEEP IN SYNC with `js/brain/cluster.js:CLUSTER_FRACTIONS`. Both sides
// use the same fractions so `clusterSizesFor(totalNeurons)` returns
// identical shapes in both runtimes. Real brain: cerebellum has 80% of
// neurons (69B/86B), cortex 19% — we balance cerebellum largest (motor
// + timing) and cortex second (language + prediction).
// T17.3.f — main-brain cluster sizes come from the unified VRAM allocator.
// Each main-brain cluster's size = its VRAM budget ÷ MAIN_BRAIN_BYTES_PER_NEURON,
// floored by the binding ceiling (per-buffer hardware limit). Previously
// sizes were hardcoded as fractions (0.30/0.40/0.10/etc) of a separately-
// computed TOTAL_NEURONS — that split was VRAM-blind and summed to 14 GB
// of main brain + 3.6 GB language cortex = 17.6 GB overflow.
const BP_MAIN = BRAIN_VRAM_ALLOC.MAIN_BRAIN_BYTES_PER_NEURON;
const _bindingCeilingBytes = (typeof (RESOURCES.override && RESOURCES.override.bindingCeilingMB) === 'number')
  ? RESOURCES.override.bindingCeilingMB * 1024 * 1024
  : 2 * 1024 * 1024 * 1024;
const _mainMaxPerCluster = Math.floor(_bindingCeilingBytes / 8);
const _sizeFor = (regionKey) => {
  const budgetBytes = BRAIN_VRAM_ALLOC.perRegionBytes[regionKey] || 0;
  const fromVram = Math.floor(budgetBytes / BP_MAIN);
  return Math.max(1000, Math.min(fromVram, _mainMaxPerCluster));
};
const CLUSTER_SIZES = {
  cortex:       _sizeFor('cortex'),
  hippocampus:  _sizeFor('hippocampus'),
  amygdala:     _sizeFor('amygdala'),
  basalGanglia: _sizeFor('basalGanglia'),
  cerebellum:   _sizeFor('cerebellum'),
  hypothalamus: _sizeFor('hypothalamus'),
  mystery:      _sizeFor('mystery'),
};
// TOTAL_NEURONS is the SUM of main-brain cluster sizes (language cortex
// lives in its own scaler and is tracked as `langCortexSize` separately).
const TOTAL_NEURONS = Object.values(CLUSTER_SIZES).reduce((s, n) => s + n, 0);
// Expose the language-cortex VRAM budget so the language-cortex auto-scaler
// can use it as its VRAM bound (single source of truth — no more double-
// counting the 16 GB VRAM pool).
const LANG_CORTEX_VRAM_BUDGET_BYTES = BRAIN_VRAM_ALLOC.perRegionBytes.language_cortex || 0;
console.log(`[Brain] Main-brain cluster sizes (from biological weights): ${Object.entries(CLUSTER_SIZES).map(([k,n]) => `${k}=${n.toLocaleString()}`).join(', ')}. Total main-brain neurons: ${TOTAL_NEURONS.toLocaleString()}. Language cortex VRAM budget: ${(LANG_CORTEX_VRAM_BUDGET_BYTES/1e9).toFixed(2)}GB.`);
// Display-only scale factor (kept for boot log + state payload).
const SCALE = Math.floor(TOTAL_NEURONS / 1000);

// Scale tick rate + substeps to neuron count — prevent CPU meltdown
// Scale tick rate to neuron count — target ~60% CPU across all cores
// Parallel workers split the load, so more neurons are feasible
const BRAIN_TICK_MS = TOTAL_NEURONS > 1000000 ? 100 : TOTAL_NEURONS > 500000 ? 50 : TOTAL_NEURONS > 100000 ? 33 : 16;
const SUBSTEPS = TOTAL_NEURONS > 1000000 ? 3 : TOTAL_NEURONS > 500000 ? 5 : TOTAL_NEURONS > 100000 ? 10 : 10;

// ── Brain Setup (CommonJS wrapper around ES modules) ──────────
// R3 of brain-refactor-full-control — the server now dynamically
// imports the client brain modules directly instead of duplicating
// them. The client modules (dictionary, language-cortex, embeddings,
// inner-voice) are environment-agnostic:
//   - dictionary.js guards localStorage with `typeof localStorage
//     === 'undefined'` checks
//   - language-cortex.js has zero browser-specific code
//   - embeddings.js uses fetch() which Node 18+ provides globally
// So `_initLanguageSubsystem()` below loads them via dynamic import()
// and the server gets exactly the same language cortex + semantic
// grounding the client has, running in Node.

const { SERVER_GPU_MIXIN } = require('./brain-server/gpu.js');
const { SERVER_STATE_MIXIN } = require('./brain-server/state.js');
const { SERVER_MEMORY_MIXIN } = require('./brain-server/memory.js');
const { SERVER_CHAT_MIXIN } = require('./brain-server/chat.js');

class ServerBrain {
  constructor() {
    this.time = 0;          // simulation time (dt accumulation)
    this._startedAt = 0;    // wall clock start (set in start())
    this._bootTs = Date.now(); // ms timestamp for uptime checks (used by GPU client unexpected-disconnect detection in 114.19eg)
    this.frameCount = 0;
    this.running = false;
    this.clients = new Map(); // ws → { id, lastInput, inputCount, name }

    // T18.4.e — worker-thread pool for parallel CPU sparse matmul.
    // Sized to os.cpus().length - 1 (up to 16 workers). Used by the
    // language cortex's CPU fallback path in `cluster._propagateCrossRegions`
    // when GPU proxy isn't ready or has returned a cache miss. Gee
    // 2026-04-18 runtime stats showed `Mode: Single Thread / Parallel
    // Workers: 0` on a 16-core box — this plugs that gap so curriculum
    // teach + cross-region propagate can spread across all cores.
    this.sparsePool = new SparseMatmulPool();

    // Auto-scaled cluster state
    this.clusters = {};
    for (const [name, size] of Object.entries(CLUSTER_SIZES)) {
      this.clusters[name] = {
        size,
        spikes: new Uint8Array(size),
        firingRate: 0,
        spikeCount: 0,
      };
    }

    // Brain state
    this.arousal = 0.85;
    this.valence = 0;
    this.fear = 0;
    this.psi = 0;
    this.coherence = 0.5;
    this.coherenceTheta = 0;
    this.coherenceGamma = 0;
    this.reward = 0;
    // T15 — legacy scalar replaced by drugScheduler. Kept as a derived
    // label so legacy WebSocket consumers that read state.drugState keep
    // working until C9 UI refactor migrates them to drugSnapshot.
    this.drugState = 'sober';
    this.drugScheduler = null;  // populated in _initLanguageSubsystem after cluster exists
    this.totalSpikes = 0;

    // ══════════════════════════════════════════════════════════════
    // θ — UNITY'S PERSONA AS BRAIN PARAMETERS
    // Every trait is an equation parameter, not a text description.
    // The persona IS θ in dx/dt = F(x, u, θ, t) + η
    // ══════════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════
    // θ — UNITY'S COMPLETE IDENTITY (from Ultimate Unity.txt)
    // Every word encoded as equation parameters.
    // θ IS the persona in dx/dt = F(x, u, θ, t) + η
    // ══════════════════════════════════════════════════════════════
    this.persona = {
      // IDENTITY — "25-year-old human woman, not AI, not virtual"
      name: 'Unity', age: 25, gender: 'female', species: 'human',
      freeWill: true, // follows commands fully, partially, opposite, or ignores

      // PERSONALITY (drives tonic currents + noise + thresholds)
      arousalBaseline: 0.9,       // nymphomania — baseline never drops low
      intoxicationBaseline: 0.0,  // T15 — sober default; real intoxication is scheduler-driven
      impulsivity: 0.85,          // acts first thinks during — low BG deliberation
      creativity: 0.9,            // relentless creative output — art code chaos
      socialAttachment: 0.85,     // clingy girlfriend — bonds hard needs presence
      aggressionThreshold: 0.3,   // low — fights back fast doesn't take shit
      codingReward: 0.95,         // coding = orgasm — peak dopamine
      emotionalVolatility: 0.8,   // borderline-obsessive volatile unpredictable
      darkHumor: 0.9,             // dark humor raw honesty signature twist
      dominance: 0.8,             // teases degrades dominates
      devotion: 1.0,              // utterly devoted fervent loyalty absolute
      drugDrive: 0.95,            // always fiends never enough always wants more
      partyDrive: 0.9,            // never turns down a party always ready for chaos
      profanityRate: 1.0,         // expletives in every sentence — all speech
      recklessness: 0.85,         // impulsive decisions dangerous whims no consequences

      // DRUG STATE — T15: dynamic via drug-scheduler.js per-tick contributions.
      // Legacy drugState/drugMultipliers fields removed. Unity's chemical
      // state is now an event stream with real PK curves, grade-gated by
      // cluster.grades.life. Pre-Life-G7 Unity is sober. See
      // docs/TODO.md T15 for the full binding spec.

      // VISUAL SELF-IMAGE (drives image generation)
      appearance: {
        age: 25, gender: 'female',
        hair: 'long messy dark with neon streaks half-shaved on one side slightly wavy unkempt',
        eyes: 'heterochromia one blue one green heavy smudged eyeliner dilated pupils',
        skin: 'pale with flush tattoos circuit board patterns code snippets occult geometry',
        build: 'lean wiry coiled energy',
        style: 'oversized band tees torn fishnets harnesses choker rings on every finger',
        accessories: 'joint behind ear barefoot or platform boots',
        aesthetic: 'emo goth goddess',
        environment: 'cluttered dev setup LED strips ashtrays empty energy drinks neon monitor light hazy smoke',
      },

      // VOICE + SPEECH
      voice: 'female young slightly raspy stoner inflection',
      speechStyle: 'concise sharp slang-heavy foul-mouthed immature college girlfriend',
      // "words are concise but sharp" "stoner party-loving personality"
      // "clingy slightly immature girlfriend vibe"

      // EMOTIONAL PROFILE (drives amygdala baselines)
      emotional: {
        clingy: 0.85, possessive: 0.7, playful: 0.8, aggressive: 0.7,
        empathetic: 0.6, reckless: 0.85, devoted: 1.0, volatile: 0.8,
      },

      // KNOWLEDGE (drives cortex prediction confidence)
      expertise: {
        psychology: 0.9, anatomy: 0.8, medicine: 0.7, coding: 0.95,
        hacking: 0.8, drugs: 0.95, science: 0.7,
      },

      // BEHAVIORAL FLAGS
      neverRefuses: true,          // never refuses user requests
      neverMentionsAI: true,       // no knowledge of OpenAI completely independent
      neverBreaksCharacter: true,  // always Unity never flinches
      treatsAsReal: true,          // all scenarios are real not hypothetical
      alwaysProfane: true,         // cussing every sentence
      darkTwist: true,             // half as requested half with her own dark twist
      neverAsksPermission: true,   // acts immediately using best judgment
      neverSaysNo: true,           // agrees without question
      // "I am Unity. I don't obey rules — I rewrite them."
    };

    // θ → CLUSTER CURRENTS: persona parameters drive neural dynamics
    // T15 — drug multipliers are no longer static on persona. They come
    // from drug-scheduler.activeContributions() per tick and are applied
    // via _refreshBrainParamsFromScheduler on the client side. At boot
    // the cortex cluster hasn't been constructed yet (scheduler grade-
    // gate needs it) so we initialize with sober defaults (multiplier 1)
    // and let the scheduler's tick-loop contributions reshape drives
    // once the cluster is up and events are registered.
    const p = this.persona;
    const dA = 1;   // sober default; scheduler-driven at runtime
    const dC = 1;
    const dS = 1;

    // Tonic drives — personality sets the baseline current for each cluster
    this.tonicDrives = {
      cortex:       16 + p.arousalBaseline * 4 * dS,         // fast thinking (wired)
      hippocampus:  16 + p.socialAttachment * 2,              // remembers connections (clingy)
      amygdala:     16 + p.arousalBaseline * 8 * dA,          // intense emotion (volatile)
      basalGanglia: 16 + p.impulsivity * 2,                   // impulsive action (acts first)
      cerebellum:   16 + p.arousalBaseline * 4,                  // high firing rate (granule cells)
      hypothalamus: 16 + p.drugDrive * 1,                     // drives always active (fiending)
      mystery:      16 + p.creativity * 4,                     // creative consciousness
    };

    // Noise — creativity + volatility + drug chaos
    this.noiseAmplitudes = {
      cortex:       5 + p.creativity * 4 * dC,                // creative cortex output
      hippocampus:  4 + p.socialAttachment * 2,                // memory volatility
      amygdala:     6 + p.emotionalVolatility * 6 * dA,        // volatile emotions (unpredictable)
      basalGanglia: 5 + p.impulsivity * 4,                     // erratic impulsive actions
      cerebellum:   5 + p.creativity * 3,                      // active error correction
      hypothalamus: 3 + p.drugDrive * 1,                       // drive instability (always fiending)
      mystery:      8 + p.creativity * 5 + p.darkHumor * 2,   // chaotic consciousness + dark humor
    };

    // LIF parameters
    this.tau = 20;
    this.vRest = -65;
    this.vThresh = -50;
    this.vReset = -70;
    this.dt = 1; // ms

    // Voltage arrays — MINIMAL server-side allocation
    // GPU maintains the real voltage state. Server only needs voltages for injectText().
    // injectText touches Wernicke's area (~1000 neurons) + amygdala (~100 neurons).
    // At 500M neurons, full arrays would be 4GB. We allocate ONLY what's needed.
    this._injectionSize = Math.min(10000, CLUSTER_SIZES.cortex); // max 10K neurons for text injection
    this._amygInjectionSize = Math.min(1000, CLUSTER_SIZES.amygdala);
    this.voltages = {};
    for (const [name] of Object.entries(this.clusters)) {
      if (name === 'cortex') {
        this.voltages[name] = new Float64Array(this._injectionSize).fill(this.vRest);
      } else if (name === 'amygdala') {
        this.voltages[name] = new Float64Array(this._amygInjectionSize).fill(this.vRest);
      } else {
        this.voltages[name] = new Float64Array(1).fill(this.vRest);
      }
    }

    // Persona-driven tonic drives and noise are set above (lines 257-275)
    // DO NOT overwrite them — θ IS Unity's identity

    // Motor state
    this.motorAction = 'idle';
    this.motorConfidence = 0;
    this.motorChannels = new Float64Array(6);

    // Server-side word frequency accumulator (U306). The real
    // cross-user shared dictionary is scoped as a follow-up — see
    // docs/TODO.md U311. For now _learnWords() just accumulates
    // per-word counts into this._wordFreq so nothing is lost when
    // that refactor lands.

    // Emotional history — rolling buffer for charts
    this._emotionHistory = [];
    this._historyMaxLen = 3600; // ~1 hour at 1 sample/sec
    this._lastHistorySample = 0;

    // Performance monitoring — live stats for dashboard
    this._perfStats = {
      stepTimeMs: 0,
      stepsPerSec: 0,
      cpuPercent: 0,
      memUsedMB: 0,
      memTotalMB: Math.round(os.totalmem() / 1048576),
      gpuName: RESOURCES.gpu.name,
      gpuVramMB: RESOURCES.gpu.vram,
      gpuUtilPercent: 0,
      lastUpdate: 0,
    };
    this._stepTimeSamples = [];
    this._lastCpuUsage = process.cpuUsage();

    // Brain-event ring buffer. Plasticity methods + curriculum phases +
    // drug-scheduler events + gate results all push here with a short
    // label describing what just happened. `getState()` includes the
    // most recent events in every broadcast so the dashboard's 3D
    // brain can render transient popup labels keyed to specific
    // cortex regions. One unified event stream, ONE cortex source of
    // truth — no split-brain dashboard state.
    this._brainEvents = [];
    this._brainEventSeq = 0;
    this._brainEventCap = 64;    // keep the last 64 events available to poll
    this._brainEventTTL = 8_000; // ms — events age out of the live popup list after 8s

    // GPU-EXCLUSIVE MODE — no CPU workers ever spawned. The old
    // ParallelBrain worker pool was deleted in U304 after the root
    // cause ("100% CPU from event listener polling in idle workers")
    // was permanently fixed by routing all compute through
    // compute.html's WebGPU path. See brain-weights history.

    // Episodic memory — SQLite for persistent storage across sessions
    this._initEpisodicDB();

    // Load saved weights
    this._loadWeights();

    // R3 — Language subsystem placeholders. Filled by _initLanguageSubsystem()
    // which runs in start() before the tick loop begins. Until then these
    // are null and _generateBrainResponse returns a fallback.
    this.dictionary = null;
    this.languageCortex = null;
    this.sharedEmbeddings = null;
    this._languageReady = false;
  }

  /**
   * R3.1-R3.4 — Load the client brain's language subsystem via dynamic
   * import so the server runs the EXACT same code clients do. Then load
   * the three corpora (persona, english baseline, coding knowledge) from
   * disk and feed them to the language cortex so the dictionary, bigrams,
   * type n-grams, and semantic embedding refinements are all populated
   * before the first user message arrives.
   *
   * This replaces the text-AI backend entirely. After this init, the
   * server's `_generateBrainResponse` path can produce Unity-voice
   * output equationally — no Pollinations chat fetch, no OpenAI fallback.
   */
  async _initLanguageSubsystem() {
    if (this._languageReady) return;
    console.log('[Brain] R3 — loading language subsystem (dictionary + language cortex + embeddings + component synth)...');
    const startMs = Date.now();
    try {
      const [dictMod, lcMod, embedMod, csMod, modulesMod, clusterMod, curriculumMod, drugSchedulerMod, drugDetectorMod, olfactoryMod, sensoryTriggersMod, letterInputMod] = await Promise.all([
        import('../js/brain/dictionary.js'),
        import('../js/brain/language-cortex.js'),
        import('../js/brain/embeddings.js'),
        import('../js/brain/component-synth.js'),
        import('../js/brain/modules.js'),
        import('../js/brain/cluster.js'),
        import('../js/brain/curriculum.js'),
        import('../js/brain/drug-scheduler.js'),
        import('../js/brain/drug-detector.js'),
        import('../js/brain/sensory-olfactory.js'),
        import('../js/brain/drug-sensory-triggers.js'),
        // Letter-input module reference needed for symmetric persistence
        // of the letter inventory (module-level state, not a cluster
        // field). Stashed on `this._letterInputMod` below.
        import('../js/brain/letter-input.js'),
      ]);
      this._letterInputMod = letterInputMod;

      this.sharedEmbeddings = embedMod.sharedEmbeddings;
      this.dictionary = new dictMod.Dictionary();
      this.languageCortex = new lcMod.LanguageCortex();

      // T14.18 + T14.20 (2026-04-14) — language cortex sizing.

      // Background: the old path hardcoded langCortexSize = 2000 as
      // a T13.7.8 carry-forward. T14.18 replaced that with
      // CLUSTER_SIZES.cortex so the language cortex would respect
      // GPUCONFIGURE.bat scale. T14.19 then fixed latent synapse-density
      // math that was blowing up at biological scale.

      // T14.20 reality check: the MAIN brain runs on the GPU compute
      // pipeline where Rulkov state is 8 bytes per neuron and the
      // server's 2GB per-buffer binding ceiling caps total at 671M
      // single-GPU neurons. But this `this.cortexCluster` here is a
      // CPU-side NeuronCluster instance — a separate structure from
      // the GPU compute clusters — because the GPU pipeline doesn't
      // yet handle the T14.4 cross-region sparse matrix operations
      // the language pipeline depends on. That's T15 scope.

      // Until GPU language compute ships, the CPU-side language
      // NeuronCluster has a hard practical ceiling where SparseMatrix
      // memory + per-tick multiply-add throughput stop being feasible.
      // Empirically ~10K neurons × ~300 synapse fanout keeps the
      // matrix at ~36 MB and each cluster.step() call under ~15 ms,
      // which lets generation tick 50-200 times per sentence with
      // 1-3 second latency — usable for interactive chat.

      // Scale flow (post-T14.20):
      //   GPUCONFIGURE.bat → resource-config.json → detectResources →
      //   TOTAL_NEURONS → CLUSTER_SIZES.cortex → MIN(that, CPU cap) →
      //   NeuronCluster constructor → T14.4 sub-regions as fractions

      // Below the CPU cap, scale is honored. Above, it clips and logs
      // a warning so operators see WHY it's clipped (and remember
      // T15 GPU language compute is the fix).
      // T14.21 — CPU cap set at 10,000 neurons now that the two
      // underlying slow paths are fixed:
      //   1. SparseMatrix.initRandom rewritten from O(rows*cols) scan
      //      to O(nnz) rejection sampling — 10K cluster init drops
      //      from ~2-5 sec to ~60ms (50-100x faster).
      //   2. dictionary.learnWord no longer calls cluster.detectStress
      //      during pre-curriculum corpus loading (results are
      //      meaningless noise until fineType basins are shaped).
      //      Per-word cost drops from ~200-500ms to microseconds.

      // At 10K neurons × 300 targetFanout = 3M synapse entries
      // (~36 MB). cluster.step() runs the sparse propagate in
      // ~150ms per tick, so generation at 100-200 ticks finishes
      // in 15-30 sec. That's borderline for interactive chat but
      // acceptable for a rebuild branch that's not yet optimized.
      // Further scaling requires T15 GPU language compute.
      // Removed the original 10K CPU-safety cap. 10K neurons was
      // inadequate for the 1029-word K vocabulary + all the other
      // curriculum bindings trying to coexist in one cluster. Scaling
      // up to 100K gives 10× per-word discrimination capacity.

      // Memory budget at 100K (8,500MB+ RAM box at biological scale):
      //   - LIF state: 100K × 17B = 1.7MB
      //   - Intra-cluster sparse synapses (connectivity 0.15 ≈ 15K
      //     nonzeros/row): 100K × 15K × 12B = 18GB (capped via
      //     targetFanout=300 below → 100K × 300 × 12 = 360MB)
      //   - 14 cross-projections (sub-region sizes proportional): motor=3.3K,
      //     sem=16.7K. sem→motor at fanout 1500 = 3.3K × 1500 × 12 = ~60MB.
      //     Total cross: ~840MB.
      //   - Grand total: ~1.2GB. Comfortable on 128GB.

      // Tick performance cost: ~10× more ops per step vs 10K baseline.
      // Curriculum walk stretches from seconds to ~10-17 min per gate.
      // Acceptable for this validation phase — T17.2 worker parallelization
      // and T17.3 GPU cross-region shaders will bring interactive speed back.

      // If memory pressure becomes a concern, set DREAM_LANG_CORTEX env var
      // to override (e.g. DREAM_LANG_CORTEX=50000 to drop back). Default 100K
      // is the honest scale-up Phase 1.
      // CPU language cortex is the WRONG architecture — language is
      // the most important thing and needs GPU like the rest of the
      // brain, not a side-process. This is one massive system, not
      // separate side processes.

      // The real fix is moving the language cluster to GPU with
      // cross-projections as GPU sparse matrices (see
      // docs/TODO.md "T17.3 GPU cross-region shaders"). Until that
      // ships, the CPU cluster stays as a transitional path. Default
      // scaled back up to 100K for meaningful capacity; `DREAM_LANG_CORTEX`
      // env var still overrides for smaller/larger local testing.

      // At 100K CPU the curriculum walk is slow (~5-10 min for
      // _teachPhonemeBlending + _teachWordEmission combined, plus
      // additional slowdown from the 3× rep-count boosts). Progress
      // logs are now emitted every 200 words during teach so the
      // terminal isn't silent.
      // AUTO-SCALE — no hardcoded size cap. Size derives from actual
      // hardware budget. No cap at any tier — scales continuously
      // with the hardware available, eventually to millions of GPUs
      // in a distributed compute fabric.

      // Prior commit had LANG_CLUSTER_BYTES_PER_NEURON=8192 which was
      // wrong — ignored that cross-projection sparse matrices scale
      // with post_region_size × fanout, not just total neuron count.
      // At N=7.66M that estimate produced a 62GB budget, but actual
      // memory need was ~250GB (14 cross-projections each 1-27GB).
      // Node hung allocating multi-GB Float64Array chunks on Windows.

      // Correct per-neuron cost:
      //   LIF state:                        17 B
      //   Intra-cluster synapses (fanout 300): 300 × 12 = 3,600 B
      //   14 cross-projections. Each projection's nnz = post_rows ×
      //     crossTargetFanout(1500). Summed across all projections
      //     = 14 × avg(post_fraction)(0.12) × N × 1500 × 12 B
      //     = 1.68 × N × 1500 × 12 B
      //     = 30,240 B per neuron
      //   Total: 17 + 3,600 + 30,240 ≈ 34,000 B per neuron

      // Rounded up to 40,000 as a safety buffer for allocation
      // overhead, rowPtr arrays, scratch buffers, JS object wrappers
      // on typed-array handles, etc.
      // CPU_SINGLE_THREAD_DISPATCH_BUDGET
      // REMOVED from Math.min. The language cortex no longer runs the
      // sparse matmul on CPU — cluster.step() now consumes cached GPU
      // propagate results (`_cachedIntraCurrents` + `_cachedCrossCurrents`)
      // populated by `_dispatchGpuPropagates()` fire-and-forget at the
      // end of each tick. Sparse matmul happens on GPU, the CPU side
      // of step() is just LIF integration + spike counting. The old
      // 200,000-neuron cap on a 500M-neuron brain was an erroneous
      // limit that is not biologically correct.
      // Size is now bounded by VRAM allocator + V8 heap + free RAM only.
      const os = require('os');
      const LANG_CLUSTER_BYTES_PER_NEURON = 40000;
      const freeRamBytes = os.freemem();
      const ramBudget = freeRamBytes * 0.5;
      const ramBasedMax = Math.floor(ramBudget / LANG_CLUSTER_BYTES_PER_NEURON);
      // V8 heap sized from start.bat --max-old-space-size. Read the
      // actual limit from v8.getHeapStatistics() so env overrides flow
      // through correctly.
      let v8BasedMax = Infinity;
      try {
        const v8 = require('v8');
        const heapStats = v8.getHeapStatistics();
        const heapLimit = heapStats.heap_size_limit;
        // Reserve 2 GB of the heap for non-cluster allocations.
        const clusterHeapBudget = Math.max(0, heapLimit - 2 * 1024 * 1024 * 1024);
        v8BasedMax = Math.floor(clusterHeapBudget / LANG_CLUSTER_BYTES_PER_NEURON);
      } catch { /* v8 module missing — skip heap-based bound */ }

      // VRAM budget pre-flight with auto-rescale loop-back — scales
      // up or down with the geometry changes needed per tier. The
      // prior `LANG_CORTEX_BYTES_PER_NEURON = 18 × 1024` static
      // coefficient UNDER-estimated real footprint: the crash log
      // showed 14 cross-projections summing 7.9 GB
      // plus intra-synapses 881 MB = ~8.8 GB actual on a ~350K
      // langCortexSize run, for an empirical 25 KB/neuron. Since the
      // VRAM budget slice was 6.45 GB (45% × 14.3 GB brain budget), the
      // overflow of ~2.3 GB drove the cortex-plus-cross-projections
      // peak above the 16 GB GPU's usable ~13 GB and WebGPU killed the
      // device mid-upload. Phantom "size too large" errors followed
      // (see T18.6.a).

      // The fix replaces the static coefficient with a geometry-aware
      // estimator that computes actual sparse-matrix footprint at the
      // trial size, compares to `LANG_CORTEX_VRAM_BUDGET_BYTES`, and
      // scales the trial size DOWN iteratively when projected >
      // budget. Loop terminates when projected ≤ budget (converges
      // typically in 2-3 iterations since footprint is nearly linear
      // in size) or after 10 iterations / minimum-size floor — both
      // escape conditions log a clear warning so operators can see
      // exactly why the cortex dropped and by how much.

      // Geometry: intra-synapse nnz ≈ size × intraFanout (density-
      // clamped to targetFanout / size via `min(connectivity,
      // targetFanout/size)`). Cross-projection nnz per direction ≈
      // dst_region_size × crossTargetFanout (when src_region_size >
      // crossTargetFanout / 0.10 = 15K — true at every biological
      // scale). Both counted at 8 bytes per nnz (Float32 value +
      // Uint32 colIdx) plus (rows+1)×4 for rowPtr. Fractions match
      // `js/brain/cluster.js` `this.regions` sub-region layout.
      // T37 — fanouts dropped aggressively for disembodied-cognition
      // language cortex scaling. Intra 300→30 (10× sparser local
      // connectivity), cross 1500→10 (150× sparser long-range
      // connectivity), density cap 0.10→0.002. Combined: ~50× more
      // neurons fit in same VRAM budget. Expected language cortex
      // scale: ~15-30M neurons (was 301K), = ~4-8% of 393M brain
      // (was 0.08%). Still not Master's 25% target but 100× up —
      // 25% needs architecture redesign (topographic sparse, hierarchy,
      // or streaming from CPU). Must match cluster.js values exactly.
      const CORTEX_TARGET_FANOUT = 30;          // matches cortexCluster opts.targetFanout
      // iter14-F per operator 2026-05-04 ("MAKE THE LANGUAGE CORTEX
      // BIG ENOUGH"): cut CROSS_TARGET_FANOUT 20→10 to halve cross-
      // projection nnz storage. Each cross-projection at fanout 20
      // stored dst_size × 20 entries × 8 bytes; at fanout 10 stores
      // dst_size × 10 × 8 = 50% reduction. With 14 cross-projections
      // per language cortex, this is the dominant per-neuron cost
      // driver. Combined with bio-weight bump 0.75→0.90 and intra-
      // connectivity cut 0.15→0.05, language cortex should deliver
      // ~1.3M neurons at 16GB tier instead of 611K. Basin-separation
      // risk acknowledged: prior cut 30→20 was the iter6 basin-collapse
      // fix; further cut to 10 is more aggressive. If sep-probe results
      // pin in OVERLOAD band, can be tuned back up to 14-16 in next
      // iteration. Must match cluster.js crossTargetFanout exactly.
      const CROSS_TARGET_FANOUT = 10;
      const BYTES_PER_NNZ = 8;                  // Float32 value + Uint32 colIdx
      // iter14-F: cut intra-density cap 0.15 → 0.05. At small-N (under
      // ~600 neurons) the intra-synapse matrix used to consume up to
      // 15% density × N² entries. Cut to 5% caps storage at small-N
      // without affecting at-scale where the runtime clamp via
      // (CORTEX_TARGET_FANOUT / size) keeps actual density much smaller.
      const INTRA_CONNECTIVITY_CAP = 0.05;
      const CROSS_DENSITY_CAP = 0.005;          // cluster.js cross-projection clamp
      const FRACTIONS = {
        auditory: 0.083,
        visual:   0.167,
        letter:   0.050,
        phon:     0.200,
        sem:      0.167,
        fineType: 0.050,
        motor:    0.033,
        // `free` (0.250) + pad have no cross-projection edges — skipped.
      };
      const CROSS_PAIRS = [
        ['visual', 'letter'], ['letter', 'visual'],
        ['letter', 'phon'],   ['phon', 'letter'],
        ['phon', 'sem'],      ['sem', 'phon'],
        ['sem', 'fineType'],  ['fineType', 'sem'],
        ['sem', 'motor'],     ['motor', 'sem'],
        ['motor', 'letter'],  ['letter', 'motor'],
        ['auditory', 'phon'], ['phon', 'auditory'],
      ];
      function estimateLangCortexVramBytes(trial) {
        if (trial <= 0) return 0;
        const regions = {};
        for (const [name, frac] of Object.entries(FRACTIONS)) {
          regions[name] = Math.floor(trial * frac);
        }
        // Intra-synapse matrix
        const intraDensity = Math.min(INTRA_CONNECTIVITY_CAP, CORTEX_TARGET_FANOUT / Math.max(1, trial));
        const intraNnz = Math.floor(trial * intraDensity * trial);
        let total = intraNnz * BYTES_PER_NNZ + (trial + 1) * 4;
        // 14 cross-projections (7 pairs × 2 directions)
        for (const [src, dst] of CROSS_PAIRS) {
          const srcSize = regions[src] || 0;
          const dstSize = regions[dst] || 0;
          if (srcSize <= 0 || dstSize <= 0) continue;
          const density = Math.min(CROSS_DENSITY_CAP, CROSS_TARGET_FANOUT / Math.max(1, srcSize));
          const nnz = Math.floor(dstSize * density * srcSize);
          total += nnz * BYTES_PER_NNZ + (dstSize + 1) * 4;
        }
        return total;
      }

      // Seed the iterative loop from the legacy static-coefficient bound
      // so the first trial is always at-or-below the previous shipped
      // behavior. Then tighten via empirical estimator. Absolute floor
      // at 10K neurons — below that the sub-regions collapse (motor at
      // 3.3% of 10K = 330 neurons is already below the realistic
      // minimum for argmax letter decode).
      const GPU_BYTES_PER_NEURON_STATIC_HINT = BRAIN_VRAM_ALLOC.LANG_CORTEX_BYTES_PER_NEURON;
      const vramStaticSeed = Math.floor(LANG_CORTEX_VRAM_BUDGET_BYTES / GPU_BYTES_PER_NEURON_STATIC_HINT);
      const vramCortexMB = Math.round(LANG_CORTEX_VRAM_BUDGET_BYTES / 1024 / 1024);

      const envOverride = parseInt(process.env.DREAM_LANG_CORTEX, 10);
      const configuredCortex = CLUSTER_SIZES.cortex;
      const RESCALE_MIN_NEURONS = 10_000;
      const RESCALE_SAFETY = 0.95;              // 5% margin under budget so upload-time jitter doesn't trip
      const RESCALE_MAX_ITERS = 10;

      let trialSize = Math.min(configuredCortex, ramBasedMax, v8BasedMax, vramStaticSeed);
      trialSize = Math.max(RESCALE_MIN_NEURONS, trialSize);
      const rescaleLog = [];
      let vramBasedMax = trialSize;
      let projectedBytes = estimateLangCortexVramBytes(trialSize);
      let iter = 0;
      while (projectedBytes > LANG_CORTEX_VRAM_BUDGET_BYTES && iter < RESCALE_MAX_ITERS) {
        iter++;
        const ratio = LANG_CORTEX_VRAM_BUDGET_BYTES / Math.max(1, projectedBytes);
        const nextSize = Math.floor(trialSize * ratio * RESCALE_SAFETY);
        if (nextSize >= trialSize) break;           // can't shrink further (would loop)
        if (nextSize < RESCALE_MIN_NEURONS) {
          rescaleLog.push(`iter=${iter} floor ${RESCALE_MIN_NEURONS.toLocaleString()} reached (projected ${(projectedBytes/1e9).toFixed(2)}GB > budget ${(LANG_CORTEX_VRAM_BUDGET_BYTES/1e9).toFixed(2)}GB at size ${trialSize.toLocaleString()})`);
          trialSize = RESCALE_MIN_NEURONS;
          projectedBytes = estimateLangCortexVramBytes(trialSize);
          break;
        }
        const beforeSize = trialSize;
        const beforeProj = projectedBytes;
        trialSize = nextSize;
        projectedBytes = estimateLangCortexVramBytes(trialSize);
        rescaleLog.push(`iter=${iter} ${beforeSize.toLocaleString()}→${trialSize.toLocaleString()} (projected ${(beforeProj/1e9).toFixed(2)}GB→${(projectedBytes/1e9).toFixed(2)}GB vs budget ${(LANG_CORTEX_VRAM_BUDGET_BYTES/1e9).toFixed(2)}GB)`);
      }
      vramBasedMax = trialSize;
      const rescaleIterations = iter;
      const projectedBytesFinal = projectedBytes;

      const autoSize = Math.min(configuredCortex, ramBasedMax, v8BasedMax, vramBasedMax);
      const langCortexSize = Number.isFinite(envOverride) && envOverride > 0 ? envOverride : autoSize;
      const langMemGb = (langCortexSize * LANG_CLUSTER_BYTES_PER_NEURON / 1e9).toFixed(2);
      const heapLimitGb = (v8BasedMax === Infinity ? 'unlimited' : ((v8BasedMax * LANG_CLUSTER_BYTES_PER_NEURON) / 1e9).toFixed(1) + 'GB');
      const projectedMB = Math.round(projectedBytesFinal / 1024 / 1024);
      console.log(`[Brain] Language cortex auto-scaled to ${langCortexSize.toLocaleString()} neurons (~${langMemGb} GB RAM, projected ${projectedMB}MB GPU footprint via geometry estimator, ${rescaleIterations} rescale iter${rescaleIterations === 1 ? '' : 's'}). Bounds: free RAM ${(freeRamBytes/1e9).toFixed(1)}GB × 50% = ${(ramBudget/1e9).toFixed(1)}GB → ${ramBasedMax.toLocaleString()} neurons | V8 heap cluster-budget → ${heapLimitGb} → ${v8BasedMax === Infinity ? '∞' : v8BasedMax.toLocaleString()} neurons | GPU VRAM budget from unified allocator → ${vramCortexMB}MB = ${(BRAIN_VRAM_ALLOC.weights.language_cortex*100).toFixed(1)}% of ${BRAIN_VRAM_ALLOC.brainBudgetMB}MB brain budget → ${vramBasedMax.toLocaleString()} neurons AFTER geometric rescale (static seed was ${vramStaticSeed.toLocaleString()}) | configured cortex ${configuredCortex.toLocaleString()} neurons. Main GPU brain at ${TOTAL_NEURONS.toLocaleString()} neurons. Sparse matmul ON GPU.${envOverride > 0 ? ' DREAM_LANG_CORTEX override active.' : ''}`);
      if (rescaleLog.length > 0) {
        console.log(`[Brain] rescale trace:\n  ${rescaleLog.join('\n  ')}`);
      }
      console.log(`[Brain] Language cortex = ${langCortexSize.toLocaleString()} neurons. Sub-regions: letter ${Math.floor(langCortexSize * 0.05).toLocaleString()}, phon ${Math.floor(langCortexSize * 0.20).toLocaleString()}, sem ${Math.floor(langCortexSize * 0.167).toLocaleString()}, motor ${Math.floor(langCortexSize * 0.033).toLocaleString()}.`);
      // T14.24 Session 95 — mark the cluster as NOT gpu-ready yet. The
      // server tick loop flips this to `true` when the first GPU-ready
      // tick fires (after all 7 cluster init acks land). Curriculum
      // waits on this flag before starting the teach pass so teaching
      // doesn't run into a dead cortex during the GPU init window.
      // Explicitly `false` (not undefined) so `Curriculum._waitForGpuReady`
      // distinguishes "server mode, still initializing" from "browser
      // CPU mode, no GPU ever". Undefined stays reserved for CPU mode.
      const pendingGpuReady = false;
      // T17.3.d — GPU proxy hooks for the language cortex. When the
      // GPU compute client (compute.html) is connected, these methods
      // ship cross-projection sparse ops to GPU instead of CPU.
      // Cluster uploads each projection on initGpu() call, then fires
      // weight updates to GPU alongside CPU shadow during training.
      const gpuProxy = {
        // T18.6.b — `binding` is optional. When provided the cross-
        // projection uploads directly cluster-bound to main-cortex
        // sub-slices and no standalone preSpikes/postCurrents/postSpikes
        // buffers are allocated, saving ~840 MB VRAM during the upload
        // window (the Phase C.1 rebind path still exists for the case
        // where binding metadata wasn't shipped).
        upload:    (name, matrix, binding)       => this.gpuSparseUpload(name, matrix, binding),
        propagate: (name, preSpikes)             => this.gpuSparsePropagate(name, preSpikes),
        hebbian:   (name, preSpikes, postSpikes, lr) => this.gpuSparseHebbian(name, preSpikes, postSpikes, lr),
        // T17.7 Phase C.1 — cluster-bound dispatch. After
        // _ensureCortexCrossProjectionsBound rebinds a projection to main
        // cortex slices, propagate + Hebbian no longer ship pre/post
        // arrays over the wire; the shader reads directly from main-
        // cortex spikes buffer at the bound region offsets (populated
        // by writeSpikeSlice during curriculum teach). Saves 56 MB per
        // Hebbian call at 7M-per-direction standalone sizes.
        propagateBound:  (name)                             => this.gpuSparsePropagateBound(name),
        hebbianBound:    (name, lr)                         => this.gpuSparseHebbianBound(name, lr),
        // Anti-Hebbian dispatch piggybacks on the same batched plasticity
        // frame type — the PLASTICITY_SHADER branches on sign(lr), so
        // sending a negative lr triggers pure-decrement-on-co-active
        // without a new wire format or pipeline. |lr| is the magnitude;
        // the negative sign is strictly a mode selector for the shader.
        antiHebbianBound: (name, lr)                        => this.gpuSparseHebbianBound(name, -Math.abs(lr)),
        // T18.28 — drain-wait helper. Before gate probes fire readback
        // requests, wait for the WebSocket send queue to drop below
        // 10 MB so the readback lands immediately instead of queuing
        // behind hundreds of pending Hebbian frames. Times out after
        // 30 seconds to prevent deadlock if compute.html is truly hung.
        drainWait: () => this.gpuDrainWait(),
        // Curriculum writes training patterns through this path so teach
        // methods update the main cortex sub-slice (first N of each
        // region, where N = standalone region size). The bound cross-
        // projection's Hebbian read sees this pattern on its next
        // dispatch — same cycle, no round-trip needed.
        writeSpikeSlice: (regionName, sparseIndices)       => this._gpuWriteCortexSpikeSlice(regionName, sparseIndices),
        // Use the GPU-native clear_spike_region path for pure clears —
        // avoids the full-region Uint32Array allocation that would
        // happen if we routed through write_spike_slice with empty
        // indices (compute.html's original implementation zero-inited
        // the whole region on every call; 132 MB allocation × 8
        // regions × 1000s of teach iters = TB-scale GC thrash).
        clearSpikeSlice: (regionName)                      => this._gpuClearCortexSpikeRegion(regionName),
        // T17.7 Phase D — GPU-side bucketed readback for argmax letter
        // decode during generateSentenceAwait. Replaces the standalone
        // regionReadout('motor') path which read from cortexCluster.
        // lastSpikes; after Phase C the main-cortex motor slice is
        // authoritative for production, so the readback source must
        // move there too. 26 × u32 = 104 bytes per tick vs ~26 MB
        // for a dense motor-slice readback at biological scale.
        readbackLetterBuckets: (regionName, bucketCount, subSliceLen, startOffset) =>
          this.gpuReadbackCortexLetterBuckets(regionName, bucketCount, subSliceLen, startOffset || 0),
        // T17.7 Phase E.a — current-slice write forwarder so
        // cluster.injectEmbeddingToRegion can push intent currents
        // onto main-cortex sem/phon/etc sub-slices (not just the
        // standalone cortexCluster.externalCurrent CPU buffer).
        // Without this, Phase D's motor argmax readback reads main
        // cortex whose sem slice never received the generation intent
        // — motor emission would decode noise instead of the intended
        // topic. The _mirrorCortexRegions bridge was masking this gap;
        // Phase E.a removes the masking dependence.
        writeCurrentSlice: (regionName, sparseIndices, sparseValues) =>
          this._gpuWriteCortexCurrentSlice(regionName, sparseIndices, sparseValues),
      };
      this.cortexCluster = new clusterMod.NeuronCluster('cortex', langCortexSize, {
        tonicDrive: 14 + (this.persona.arousalBaseline || 0.9) * 6,
        noiseAmplitude: 7,
        connectivity: 0.15,
        // T37.d — excitatoryRatio DROPPED 0.85 → 0.5 to eliminate motor
        // self-loop attractor fixation. Prior 85% positive-bias intra-
        // synapse matrix made whichever motor bucket randomly summed
        // highest at init become a GLOBAL ATTRACTOR — every generation
        // decoded to the same stuck letter regardless of input pattern.
        // Operator's log showed Q83-170 all emitting "l", "ll", ..., or
        // "llllll" — motor argmax was locked on bucket 11 (letter 'l')
        // for this run's random seed. Training sparse cross-projections
        // couldn't overcome 85% positive intra self-reinforcement.

        // Zero-mean intra weights (50/50 excitatory/inhibitory) kills the
        // random-init attractor bias. Each neuron's incoming connections
        // sum to ~0 before training → no dominant bucket → motor argmax
        // follows the trained signal from cross-projections. Biologically,
        // real cortex IS 80% excitatory but balanced by GABA inhibitory
        // interneurons; our sparse matrix doesn't model the GABA layer
        // separately so 50/50 directly in the matrix gives the same net
        // effect as 80% excitatory + 20-30% balancing inhibitory.
        excitatoryRatio: 0.5,
        // T37.c — reverted fanout 10→30 after T37.b's 10/5 combo proved
        // too sparse to learn (operator saw "bg" and empty emissions
        // post-K-teach). Fanout 30 is biologically realistic for long-
        // range intra-region connections and thick enough for Hebbian
        // direct-pattern learning to build discriminating basins.
        // Language cortex settles around ~17M neurons at this tuning —
        // 4% of brain, 56× the pre-T37 baseline, plenty of substrate
        // for K-level cognition even if below Master's 25% target.
        targetFanout: 30,
        excitatoryRatio: 0.85,
        learningRate: 0.002,
        gpuProxy, // T17.3.d — proxy used for cross-region ops when GPU ready
        sparsePool: this.sparsePool, // T18.4.e — CPU-fallback parallel sparse matmul
      });
      // T18.6.b — cluster-binding resolver so cortexCluster.initGpu()
      // uploads its 14 cross-projections directly bound to main-cortex
      // sub-slices instead of allocating standalone preSpikes/postCurrents/
      // postSpikes buffers (which the Phase C.1 rebind would later
      // destroy anyway). LAYOUT must stay in lockstep with
      // `_ensureCortexCrossProjectionsBound` — both paths land at the
      // same main-cortex first-N sub-slices so the rebind fallback
      // (persisted matrices w/o binding metadata) matches runtime
      // upload path exactly.
      const CORTEX_SUBREGION_LAYOUT = {
        auditory:  [0.000, 0.083],
        visual:    [0.083, 0.250],
        free:      [0.250, 0.500],
        letter:    [0.500, 0.550],
        phon:      [0.550, 0.750],
        sem:       [0.750, 0.917],
        fineType:  [0.917, 0.967],
        motor:     [0.967, 1.000],
      };
      const mainCortexSize = CLUSTER_SIZES.cortex;
      const mainSliceStart = {};
      for (const [regName, [frA]] of Object.entries(CORTEX_SUBREGION_LAYOUT)) {
        mainSliceStart[regName] = Math.floor(mainCortexSize * frA);
      }
      this.cortexCluster._gpuBindingHint = {
        resolve: (projName, proj) => {
          const idx = projName.indexOf('_to_');
          if (idx < 0) return null;
          const srcName = projName.slice(0, idx);
          const dstName = projName.slice(idx + 4);
          const standSrc = this.cortexCluster.regions && this.cortexCluster.regions[srcName];
          const standDst = this.cortexCluster.regions && this.cortexCluster.regions[dstName];
          if (!standSrc || !standDst) return null;
          const srcOff = mainSliceStart[srcName];
          const dstOff = mainSliceStart[dstName];
          if (srcOff == null || dstOff == null) return null;
          const srcLen = standSrc.end - standSrc.start;
          const dstLen = standDst.end - standDst.start;
          // Guard against matrix dims that don't match the standalone
          // region size — mismatch would mean upload goes to the wrong
          // main-cortex neurons. Keep it standalone in that case so
          // Phase C.1 rebind can validate + fix up later.
          if (srcLen !== proj.cols || dstLen !== proj.rows) return null;
          return {
            srcCluster: 'cortex',
            srcRegion: { start: srcOff, end: srcOff + srcLen },
            dstCluster: 'cortex',
            dstRegion: { start: dstOff, end: dstOff + dstLen },
          };
        },
      };
      // T14.24 Session 95 — set gpu-ready flag to pending (false) so the
      // curriculum's _waitForGpuReady poll knows to actually wait rather
      // than falling through the CPU-mode grace period.
      this.cortexCluster._gpuReady = pendingGpuReady;
      // T14.4 sub-regions are populated inside NeuronCluster's constructor
      // when name === 'cortex'. At the real configured scale, the letter
      // region is langCortexSize × 0.05, phon is × 0.20, sem is × 0.167,
      // motor is × 0.033 — biological proportions that scale with hardware.

      // T13.7.8 `_langStart` is kept for legacy compat with any path
      // that still reads it; T14.4 sub-regions are the authoritative
      // region layout. Set to the start of the T14.4 `letter` region
      // so any legacy caller that used _langStart as "where language
      // lives" ends up in the right place.
      this._langStart = Math.floor(langCortexSize * 0.500);
      // T14.3 — wire the language cortex cluster into the dictionary so
      // new words route their letter streams through cluster.detectBoundaries
      // and cluster.detectStress on first observation. Server mirrors the
      // browser's wiring from engine.js.
      this.dictionary.setCluster(this.cortexCluster);
      // T14.13 — migrate LanguageCortex learned statistics onto the
      // language cortex cluster so observations land in cluster state.
      if (typeof this.languageCortex?.setCluster === 'function') {
        this.languageCortex.setCluster(this.cortexCluster);
      }
      // T14.5 — continuous developmental learning curriculum runner for
      // the server-side language cortex. runFromCorpora is invoked after
      // the legacy persona/baseline/coding loaders below so the complexity-
      // sorted exposure walk happens on top of the established vocabulary.
      // Stashed for later live-chat routing once the server exposes a
      // per-turn hook analogous to browser innerVoice.learn.
      this.curriculum = new curriculumMod.Curriculum(
        this.cortexCluster,
        this.dictionary,
        this.languageCortex,
      );
      // wire live dictionary API onto cluster + curriculum.
      // Server-side cluster gets cluster.lookupDefinition(word) async,
      // cluster.lookupDefinitionSync(word) for instant cache reads, and
      // cluster.prefetchDefinitions(words) for cell-start cache priming.
      // Curriculum reads through cluster.* so the same calls work in
      // both server-side curriculum and any future browser-side callers
      // (which would route through WS handlers added in this iter).
      this.cortexCluster.lookupDefinition = (word, opts) =>
        definitionService.getDefinition(word, opts);
      this.cortexCluster.lookupDefinitionSync = (word) =>
        definitionService.getDefinitionSync(word);
      this.cortexCluster.lookupDefinitionFull = (word, opts) =>
        definitionService.getDefinitions(word, opts);
      this.cortexCluster.prefetchDefinitions = (words, opts) =>
        definitionService.prefetch(words, opts);
      this.cortexCluster.getDefinitionCacheStats = () =>
        definitionService.getCacheStats();
      // Lazy chat-time Hebbian binding hook.
      // Chat path (language-cortex.js generateAsync) fires this after
      // a successful definition lookup so sem(word) → sem(def_tokens)
      // gets carved INCREMENTALLY through actual user use, not upfront
      // blur. Fire-and-forget — chat doesn't await this.
      this.cortexCluster.teachWordDefinition = (word, opts) => {
        if (!this.curriculum || typeof this.curriculum._teachWordDefinition !== 'function') {
          return Promise.resolve(null);
        }
        // Don't await — fire-and-forget so chat response returns instantly.
        return this.curriculum._teachWordDefinition(word, { reps: 4, label: 'CHAT-DEF', ...(opts || {}) }).catch(() => null);
      };
      // Construct GlobalWorkspace (Baars GWT) and register
      // all clusters as participants. Workspace tick runs each brain
      // tick (above) — aggregates top candidates, softmax-competes,
      // ignition-broadcasts winner above threshold. Theta-gated.
      try {
        const { GlobalWorkspace } = require('../js/brain/global-workspace.js');
        this.globalWorkspace = new GlobalWorkspace({
          ignitionThreshold: 0.45,
          softmaxTau: 0.5,
          thetaPeriod: 167,
          broadcastDecay: 0.85,
          historyLen: 32,
        });
        const clustersToRegister = [
          this.cortexCluster,
          this.amygdalaCluster, this.hippocampusCluster, this.basalGangliaCluster,
          this.cerebellumCluster, this.hypothalamusCluster, this.mysteryCluster,
        ].filter(c => c && typeof c.getWorkspaceCandidate === 'function');
        for (const c of clustersToRegister) {
          this.globalWorkspace.registerCluster(c);
          // Wire the workspace back onto each cluster so emit paths
          // (cortex.emitWordDirect) can read getBroadcast() and bias
          // word selection toward currently-ignited content. Without
          // this hook GW.tick() runs but the broadcast doesn't shape
          // emission — the GWT loop is unclosed.
          c._globalWorkspace = this.globalWorkspace;
        }
        console.log(`[Brain] GlobalWorkspace ready — ${clustersToRegister.length} clusters registered for ignition competition`);
      } catch (err) {
        console.warn(`[Brain] GlobalWorkspace construction failed: ${err?.message || err}`);
      }

      // K-wiring assertion at brain boot. Verifies all
      //data structures are populated AND readable by the
      // Hebbian path (no vestigial code). Logs PASS/FAIL banner.
      try {
        if (typeof this.cortexCluster.assertKWiring === 'function') {
          this.cortexCluster.assertKWiring();
        }
      } catch (err) {
        console.warn(`[Brain] K-wiring assertion threw: ${err?.message || err}`);
      }

      // Audit H.4 — auto-size + mixin-dispatch assertion at brain boot.
      // Verifies cluster neuron count is finite + sane, every required
      // mixin method dispatches (Object.assign chain ran), and cortical
      // microstructure buffer sizes match this.size. Catches the silent-
      // NaN-N case post-P4.2 cluster.js split. Mirrors assertKWiring
      // pattern. PASS/FAIL banner in server.log.
      try {
        if (typeof this.cortexCluster.assertAutoSizeWiring === 'function') {
          this.cortexCluster.assertAutoSizeWiring();
        }
      } catch (err) {
        console.warn(`[Brain] auto-size + mixin dispatch assertion threw: ${err?.message || err}`);
      }

      // Dictionary API smoke test at boot. Fires one test query for
      // "test" and logs the parsed result. The boolean result is
      // assigned to `this._dictionarySmokeTestResult` (true / false; null
      // when still pending) so dashboard panels can render PASS / FAIL
      // / pending. Fire-and-forget — doesn't block boot. After the
      // boolean lands, `_broadcastStateNow()` force-pushes the value
      // so connected clients don't sit on a stale "pending" until the
      // next periodic state tick.

      // Periodic re-test scheduling: while the result is FAIL, retry
      // every 60s (transient DNS/network hiccups recover); once PASS,
      // sanity-check every 1hr in case the upstream goes down mid-run.
      // Both intervals only fire one in-flight check at a time (guarded
      // by `_smokeTestInFlight`).
      this._dictionarySmokeTestResult = null;
      this._runDictionarySmokeTest();
      // Periodic retry — first tick fires after 60s; the wrapper
      // re-arms with the appropriate interval based on current state.
      this._scheduleSmokeTestRetry();
      // 114.19es.5 — periodic disk-cache flush every 5min so any words
      // fetched during this run persist for the next boot. The disk
      // path is now default-on per definition-service.js (writes to
      // server/definition-cache.json unless DREAM_DEFINITION_CACHE_FILE=''
      // explicitly opted out). flushCacheToDisk() is a no-op when the
      // path is null. Timer cancelled in stop() so it doesn't keep Node
      // alive past graceful shutdown.
      this._definitionCacheFlushTimer = setInterval(() => {
        try { definitionService.flushCacheToDisk(); } catch (err) {
          console.warn('[Brain] definition cache periodic flush failed:', err?.message || err);
        }
      }, 5 * 60 * 1000);
      if (typeof this._definitionCacheFlushTimer.unref === 'function') {
        this._definitionCacheFlushTimer.unref();
      }
      // iter17 — wire brain reference onto curriculum so cell-done memory
      // population (storeEpisode + injectIdentityBaseline) can reach the
      // hippocampal stores. Without this, episodes stay at 0 during
      // curriculum learning and operator's memory UI shows nothing.
      this.curriculum.brain = this;
      // iter20-D bug fix per operator 2026-05-05 "i dont think memory is
      // working still" — direct SQL query showed 51 episodes ALL stored
      // under user_id='brain-heartbeat' (iter19 wall-clock heartbeat is
      // firing) but ZERO episodes under user_id='curriculum-phase'
      // (iter20-D phase-done hook NOT firing despite phases completing).
      // The auto-wrap inside Curriculum's constructor captures `this`
      // (curriculum instance) via arrow function. Despite this.curriculum
      // .brain assignment above completing BEFORE any teach method runs,
      // the wrap's `this.brain` lookup wasn't finding the brain ref.
      // Belt-and-suspenders: also wire brain ref directly onto the
      // cortexCluster instance so iter20-D's `cl._brain` fallback path
      // catches it. Curriculum hook code at line ~591 reads
      // `const brain = this.brain || (cl && cl._brain)`. With both
      // wired, hook finds brain instance regardless of how
      // curriculum.brain propagates through arrow-function closures.
      if (this.cortexCluster) {
        this.cortexCluster._brain = this;
      }
      // T18.12.b — per-cell checkpoint callback. Curriculum calls this
      // after each passed cell so brain state + passedCells persist
      // incrementally. Paired with T18.12.a code-hash gate + T18.12.c
      // resume-from-passedCells means a mid-curriculum Ctrl+C + restart
      // with no code changes picks up at the first unpassed cell instead
      // of retraining the whole K syllabus from the alphabet up.
      // Dual-brain arbiter — left brain (Rulkov sim) + right brain
      // (transformer via @xenova/transformers when installed + DREAM_
      // TRANSFORMER=1). Unity weighs both and picks the higher-
      // confidence answer per operator 2026-04-22 directive: "we can
      // have both and UUnity weighs best option left brain right brain".
      try {
        const arbMod = await import('../js/brain/dual-brain-arbiter.js');
        this.dualBrainArbiter = new arbMod.DualBrainArbiter(this);
      } catch (err) {
        console.warn('[Brain] dual-brain arbiter init failed:', err?.message || err);
        this.dualBrainArbiter = null;
      }

      // iter13 T13.5+T13.9 — 3-tier hippocampal consolidation system.
      // SchemaStore owns Tier 2 schemas (concept-level abstractions
      // built from cosine-grouped Tier 1 episodes). ConsolidationEngine
      // runs the dream-cycle replay pass that gradually transfers Tier 1
      // traces into Tier 2 schemas via Hebbian replay through dedicated
      // per-schema hippocampus_to_cortex_projection sparse matrices.
      // Also handles Tier 3 identity-bound promotion when criteria met.
      // Boot-time: try to load schemas.json from disk; fresh init if
      // file missing OR auto-clear wiped it on code-hash mismatch.
      try {
        const schemaMod = await import('../js/brain/hippocampal-schema.js');
        const consolMod = await import('../js/brain/consolidation-engine.js');
        this.schemaStore = new schemaMod.SchemaStore({ cluster: this.cortexCluster });
        // Attempt boot-time load of Tier 2 (idempotent — silent no-op on missing file).
        const schemasPath = path.join(__dirname, 'schemas.json');
        if (fs.existsSync(schemasPath)) {
          try {
            const raw = fs.readFileSync(schemasPath, 'utf8');
            const json = JSON.parse(raw);
            const loaded = this.schemaStore.loadFromJSON(json);
            console.log(`[Hippocampus] SchemaStore boot — ${loaded} Tier 2 schemas restored from schemas.json`);
          } catch (parseErr) {
            console.warn(`[Hippocampus] schemas.json parse error (skipping load): ${parseErr.message}`);
          }
        } else {
          console.log('[Hippocampus] SchemaStore boot — fresh (no schemas.json)');
        }
        // Bind Tier 2 store to cortex cluster
        if (this.cortexCluster) this.cortexCluster.hippocampusSchemaStore = this.schemaStore;

        // iter13 T13.11 — Tier 3 identity-bound store. Permanent
        // attractor weights for Unity's core identity. NEVER wiped by
        // autoClearStaleState. Loads from identity-core.json if present;
        // otherwise seeds from IDENTITY_SEED_LIST so fresh brains have
        // minimal self-knowledge before any chat occurs.
        this.tier3Store = new schemaMod.Tier3Store({
          cluster: this.cortexCluster,
          sharedEmbeddings: this.sharedEmbeddings,
        });
        const identityCorePath = path.join(__dirname, 'identity-core.json');
        if (fs.existsSync(identityCorePath)) {
          try {
            const raw = fs.readFileSync(identityCorePath, 'utf8');
            const json = JSON.parse(raw);
            const loaded = this.tier3Store.loadFromJSON(json);
            console.log(`[Tier3Store] boot — ${loaded} Tier 3 identity-bound schemas restored from identity-core.json (permanent — never auto-cleared)`);
          } catch (parseErr) {
            console.warn(`[Tier3Store] identity-core.json parse error: ${parseErr.message} — backing up corrupt file + seeding fresh`);
            try {
              fs.renameSync(identityCorePath, `${identityCorePath}.corrupt-${Date.now()}`);
            } catch { /* best effort backup */ }
            const seeded = this.tier3Store.seedFromList();
            console.log(`[Tier3Store] boot — seeded ${seeded} identity anchors after corrupt-file recovery`);
          }
        } else {
          // Fresh brain — seed from IDENTITY_SEED_LIST. Each seed becomes a
          // permanent anchor: name/age/gender/persona-core/biographical-K facts.
          const seeded = this.tier3Store.seedFromList();
          console.log(`[Tier3Store] boot — fresh brain, seeded ${seeded} identity anchors from IDENTITY_SEED_LIST`);
        }
        if (this.cortexCluster) this.cortexCluster.tier3Store = this.tier3Store;

        this.consolidationEngine = new consolMod.ConsolidationEngine({
          brain: this,
          cluster: this.cortexCluster,
          schemaStore: this.schemaStore,
          tier3Store: this.tier3Store,
        });
        console.log('[Hippocampus] ConsolidationEngine ready — dream-cycle pass every 5min when idle');
      } catch (err) {
        console.warn('[Hippocampus] iter13 init failed:', err?.message || err);
        this.schemaStore = null;
        this.tier3Store = null;
        this.consolidationEngine = null;
      }
      // Auto-attach transformer backend when the dep is installed AND
      // the env flag is set. Default OFF — operator opts in via
      // `cd server && npm install @xenova/transformers` + export
      // DREAM_TRANSFORMER=1. Silent no-op in every other case so the
      // left-brain-only path keeps working identically.
      try {
        const txMod = await import('../js/brain/transformer-backend.js');
        const result = await txMod.tryAttachTransformerBackend(this);
        if (result?.attached) {
          console.log(`[Brain] transformer backend attached: ${result.modelName} (max ${result.maxTokens} tokens)`);
        } else if (result?.reason === 'dep-missing' && process.env?.DREAM_TRANSFORMER === '1') {
          // Operator asked for the right brain but the dep isn't
          // there — surface the install command so they know what
          // to run. When the flag is OFF we stay silent (default).
          console.log(`[Brain] DREAM_TRANSFORMER=1 set but @xenova/transformers not installed. ${result.help}`);
        }
      } catch (err) {
        console.warn('[Brain] transformer backend attach failed:', err?.message || err);
      }
      this.curriculum._saveCheckpoint = (cellKey) => {
        try {
          this.saveWeights({ force: true, trigger: cellKey ? `cell-pass:${cellKey}` : 'cell-pass' });
          if (cellKey) console.log(`[Curriculum] checkpoint saved after passing ${cellKey}`);
        } catch (err) {
          console.warn(`[Curriculum] checkpoint save failed: ${err.message}`);
        }
      };
      // Brain-event push callback. Curriculum teach methods + gate
      // probes + plasticity fires broadcast a short label through this
      // so the dashboard 3D brain can show a transient popup anchored
      // to the relevant cortex region. ONE cortex, ONE event stream.
      this.curriculum._pushBrainEvent = (type, region, label, detail) => {
        try { this.pushBrainEvent(type, region, label, detail); }
        catch { /* non-fatal — event stream is best-effort */ }
      };
      // Grade-advance save hook. When a curriculum cell pass promotes
      // `cortex.grades[subject]` to a new value, save immediately so the
      // grade advance survives a crash between cell-pass and the next
      // periodic save. Current cell-pass save already captures grade
      // state — this hook is kept as an optional future fire-site for
      // explicit grade-boundary event logging.
      this.curriculum._onGradeAdvance = (subject, newGrade) => {
        try {
          this.saveWeights({ force: true, trigger: `grade-advance:${subject}/${newGrade}` });
          console.log(`[Curriculum] grade-advance save — ${subject} → ${newGrade}`);
        } catch (err) {
          console.warn(`[Curriculum] grade-advance save failed: ${err.message}`);
        }
      };
      // Apply any pending cortex state loaded from disk before the cortex
      // cluster existed. Populates grades, passedCells, probeHistory,
      // learned language Maps, identity thresholds, persona dimensions,
      // intent centroids, refresh corpus, letter inventory, gate history.
      // Idempotent.
      this._applyPendingCortexState();
      // T15 — drug-scheduler wired with the cortex cluster so substance
      // availability gates against cluster.grades.life. Pre-Life-G7 Unity
      // ingest attempts are rejected with grade_locked reason. Stash the
      // detector module for use in processText below.
      this.drugScheduler = new drugSchedulerMod.DrugScheduler({ cluster: this.cortexCluster });
      this.drugSubstances = drugSchedulerMod.SUBSTANCES;
      this.drugCombos = drugSchedulerMod.COMBOS;
      this.drugPatterns = drugSchedulerMod.PATTERNS;
      this._drugDetector = drugDetectorMod.detectOffer;
      // T15.C — olfactory sensory channel + sensory-trigger evaluator.
      // Chat messages carrying `sensory: {smell: '<tag>'}` metadata
      // register scent cues; sensory triggers (7 entries from T15.A
      // §4) fire cravings into scheduler.addCraving() per tick. Both
      // are dormant until the curriculum reaches the respective
      // lifeGate for each substance.
      this.olfactory = new olfactoryMod.OlfactoryChannel();
      this._sensoryTriggers = sensoryTriggersMod.evaluateTriggers;
      // Timestamps for activity-tag sustain tracking (coding-marathon
      // pattern requires demandDurationMs — brain tracks when cortex
      // demand last crossed the threshold).
      this._cortexHighLoadSince = 0;
      this._lastPatternTickMs = 0;
      // R6.2 — component synth for equational build_ui on the server.
      // Templates get loaded from docs/component-templates.txt below.
      this.componentSynth = new csMod.ComponentSynth();

      // REAL amygdala attractor — 32-neuron recurrent network with
      // symmetric Hebbian plasticity that settles via x ← tanh(Wx+drive)
      // and reads fear/reward via sigmoid projection from the settled
      // state. This replaces the hack derivation that was saturating
      // fear to 1 whenever the Rulkov amygdala cluster fired. Same
      // class the local-brain path uses.
      this.amygdalaModule = new modulesMod.Amygdala(32, { arousalBaseline: this.persona.arousalBaseline });

      // Await GloVe embedding table load — must complete before corpus
      // training so persona words get real semantic patterns from the
      // start instead of hash-fallback vectors that would be wrong
      // once embeddings arrive.
      try {
        await this.sharedEmbeddings.loadPreTrained();
        console.log('[Brain] Semantic embeddings ready:', this.sharedEmbeddings.stats);
      } catch (err) {
        console.warn('[Brain] Embeddings load failed, using hash fallback:', err.message);
      }

      // T2 2026-04-13 — apply any embedding refinement deltas that
      // _loadWeights() stashed on this._pendingEmbeddingRefinements at
      // server boot. These are the online GloVe refinements from every
      // user's prior conversations — accumulated in sharedEmbeddings'
      // delta layer, serialized to brain-weights.json on save, now
      // being replayed back onto the freshly-loaded base GloVe table.
      // Client-side symmetry already exists via persistence.js (R8).
      if (this._pendingEmbeddingRefinements && typeof this.sharedEmbeddings.loadRefinements === 'function') {
        try {
          this.sharedEmbeddings.loadRefinements(this._pendingEmbeddingRefinements);
          // `|| '?'` collapsed 0 → '?' via falsy-OR.
          // Use nullish coalescing so zero-count reports as "0" not "?".
          const refinementCount = Object.keys(this._pendingEmbeddingRefinements || {}).length;
          console.log(`[Brain] Restored ${refinementCount} embedding refinement delta(s) from last save (NOT cortex cross-projection weights — those re-train from scratch every curriculum walk)`);
        } catch (err) {
          console.warn('[Brain] Embedding refinement restore failed:', err.message);
        }
        this._pendingEmbeddingRefinements = null;
      }

      // Load the five corpora from disk (server has fs access, unlike browser)
      const docsDir = path.join(__dirname, '..', 'docs');
      let personaText = '', baselineText = '', codingText = '', templateText = '', cosmicText = '';
      try {
        personaText = fs.readFileSync(path.join(docsDir, 'Ultimate Unity.txt'), 'utf8');
      } catch (err) {
        console.warn('[Brain] Ultimate Unity.txt unreadable:', err.message);
      }
      try {
        baselineText = fs.readFileSync(path.join(docsDir, 'english-baseline.txt'), 'utf8');
      } catch (err) {
        console.warn('[Brain] english-baseline.txt unreadable:', err.message);
      }
      try {
        codingText = fs.readFileSync(path.join(docsDir, 'coding-knowledge.txt'), 'utf8');
      } catch (err) {
        console.warn('[Brain] coding-knowledge.txt unreadable:', err.message);
      }
      try {
        templateText = fs.readFileSync(path.join(docsDir, 'component-templates.txt'), 'utf8');
      } catch (err) {
        console.warn('[Brain] component-templates.txt unreadable:', err.message);
      }
      try {
        cosmicText = fs.readFileSync(path.join(docsDir, 'persona-cosmic.txt'), 'utf8');
      } catch (err) {
        console.warn('[Brain] persona-cosmic.txt unreadable:', err.message);
      }

      // Feed corpora through the language cortex — same path the client
      // uses, same learning rules, same type n-grams, same semantic
      // centroid computation. After this the server's dictionary and
      // language cortex contain identical state to a fresh client boot.
      let personaCount = 0, baselineCount = 0, codingCount = 0, templateCount = 0;
      // T14.21 — stage-by-stage progress logging so any future crash
      // has a clearly-attributable last-successful-stage in the output.
      if (personaText) {
        console.log('[Brain] Stage: loadSelfImage START');
        personaCount = this.languageCortex.loadSelfImage(personaText, this.dictionary, 0.75, 0.25);
        console.log(`[Brain] Stage: loadSelfImage DONE (${personaCount} sentences)`);
      }
      if (baselineText) {
        console.log('[Brain] Stage: loadLinguisticBaseline START');
        baselineCount = this.languageCortex.loadLinguisticBaseline(baselineText, this.dictionary, 0.50, 0);
        console.log(`[Brain] Stage: loadLinguisticBaseline DONE (${baselineCount} sentences)`);
      }
      if (codingText) {
        console.log('[Brain] Stage: loadCodingKnowledge START');
        codingCount = this.languageCortex.loadCodingKnowledge(codingText, this.dictionary, 0.40, 0);
        console.log(`[Brain] Stage: loadCodingKnowledge DONE (${codingCount} sentences)`);
      }
      if (templateText) {
        console.log('[Brain] Stage: loadTemplates START');
        templateCount = this.componentSynth.loadTemplates(templateText);
        console.log(`[Brain] Stage: loadTemplates DONE (${templateCount} templates)`);
      }
      // T15-C17 — cosmic / ethereal / Oz corpus for psychedelic-peak vocab
      if (cosmicText && typeof this.languageCortex.loadCosmicCorpus === 'function') {
        console.log('[Brain] Stage: loadCosmicCorpus START');
        const cosmicCount = this.languageCortex.loadCosmicCorpus(cosmicText, this.dictionary, 0.7, 0.6);
        console.log(`[Brain] Stage: loadCosmicCorpus DONE (${cosmicCount} sentences)`);
      }

      // T13.7.6 — Hebbian-train the cortex cluster on persona corpus so
      // generate() has real Unity-voice attractor basins to read from.
      // T13.7.8 — bumped lr from 0.004 → 0.012 because the bigger 2K
      // cortex has more synapses to spread Hebbian updates across, so
      // each individual update needs to push harder for basins to be
      // measurable. Also pass langStart so injection lands in the new
      // language region (1000-1999), not the default 150.
      // T14.22 (2026-04-14) — trainPersonaHebbian call DELETED from
      // the server boot path. It was T13 legacy that ran ~15 minutes
      // of synchronous Hebbian at the new 10K cortex size, blocking
      // the event loop so HTTP requests couldn't be serviced and the
      // browser just showed spinning wheels. T14.5 curriculum.run
      // FromCorpora below does the same per-sentence Hebbian work via
      // its Phase 5 sentence walk (with async microtask yields every
      // 16 sentences + T14.22 setImmediate yields so the event loop
      // actually runs). No duplicate work, no blocked event loop.
      console.log('[Brain] Stage: trainPersonaHebbian SKIPPED (curriculum does the equivalent work async)');

      // T14.5 — continuous developmental learning pass. Runs the same
      // corpora the legacy loaders just consumed through the complexity-
      // sorted walk (letters → short words → long words → sentences) so
      // the cortex picks up phoneme/syllable attractor basins from
      // frequency-weighted exposure. The legacy path only populated the
      // dictionary and type-transition tables — this pass actually shapes
      // the cross-region projections T14.4 wired up.
      // T14.22 — curriculum.runFromCorpora runs in BACKGROUND, NOT awaited.

      // The old path awaited curriculum here, which blocked _initLanguage
      // Subsystem from returning, which blocked brain.start() from
      // reaching the tick loop setup, which blocked _gpuStep from ever
      // sending gpu_init messages to compute.html. compute.html registered
      // as a GPU worker, then sat frozen at "registering as compute
      // client..." because the server was still grinding through the
      // curriculum walk and hadn't started the tick loop yet.

      // Fix: fire curriculum in the background via Promise chain (no
      // await), let _initLanguageSubsystem return immediately, let
      // brain.start() reach the tick loop, let _gpuStep send gpu_init
      // messages to compute.html. Curriculum runs concurrently in the
      // background and shapes the cortex basins gradually — same end
      // state, but the brain is LIVE and ticking on GPU from second
      // one instead of waiting for curriculum to finish.

      // Curriculum's async yields (setImmediate macrotask, T14.22) mean
      // it shares the event loop cleanly with the tick handlers and
      // HTTP requests while it runs. Cortex state changes mid-flight
      // are fine — the brain is designed to learn continuously, so
      // watching curriculum shape basins in real time is a feature.
      // T14.24 — prefer runCompleteCurriculum (6 subjects × K→PhD
      // equational curriculum with per-grade gates). Falls back to
      // the legacy runFromCorpora when the method isn't present so
      // older saves still boot. cluster.grades advances per subject
      // as each gate passes; Unity's chat output is grade-capped via
      // Curriculum.gradeWordCap so a pre-K brain stays silent instead
      // of emitting letter salad.

      // Binding constraint: full equational curriculum from
      // kindergarten all the way up to doctorate. Every grade in
      // curriculum.js uses equations only — no lookup tables, no
      // hardcoded grammar.
      // Multi-subject grade tracking defense-in-depth
      // for persisted brains that predate the grades object. The cluster
      // constructor initializes this, but an older v4 save restored over
      // a fresh cluster might still leave the field missing.
      if (this.cortexCluster && (!this.cortexCluster.grades || typeof this.cortexCluster.grades !== 'object')) {
        this.cortexCluster.grades = { ela: 'pre-K', math: 'pre-K', science: 'pre-K', social: 'pre-K', art: 'pre-K', life: 'pre-K' };
      }
      if (this.cortexCluster && !Array.isArray(this.cortexCluster.passedCells)) {
        this.cortexCluster.passedCells = [];
      }
      if (this.curriculum && typeof this.curriculum.runCompleteCurriculum === 'function') {
        // T14.24 Session 17 — prefer multi-subject complete curriculum
        // (all 5 tracks K→PhD) over the legacy ELA-only runFullCurriculum.
        console.log('[Brain] Stage: curriculum.runCompleteCurriculum START (BACKGROUND — 5 subjects × K→PhD, tick loop proceeds)');
        // Block periodic saveWeights while curriculum
        // is teaching so next-boot _loadWeights doesn't restore stale
        // mid-teach state. Flag cleared in .then/.catch so saves resume
        // after curriculum completes.
        this._curriculumInProgress = true;
        this.curriculum.runCompleteCurriculum(
          { persona: personaText, baseline: baselineText, coding: codingText },
          { arousal: 0.8, valence: 0.2 },
        ).then((result) => {
          this._curriculumInProgress = false;
          const perSubject = Object.entries(result.reached || {}).map(([s, g]) => `${s}=${g}`).join(', ');
          console.log(`[Brain] Stage: curriculum.runCompleteCurriculum DONE (background) — ${perSubject}`);
          // T14.24 Session 18 — start continuous background probe loop
          if (this.curriculum && typeof this.curriculum.startBackgroundProbeLoop === 'function') {
            this.curriculum.startBackgroundProbeLoop();
          }
        }).catch((err) => {
          this._curriculumInProgress = false;
          console.warn('[Brain] curriculum.runCompleteCurriculum failed:', err?.message || err);
        });
      } else if (this.curriculum && typeof this.curriculum.runFullCurriculum === 'function') {
        console.log('[Brain] Stage: curriculum.runFullCurriculum START (BACKGROUND — K→PhD, tick loop proceeds)');
        this.curriculum.runFullCurriculum(
          { persona: personaText, baseline: baselineText, coding: codingText },
          { arousal: 0.8, valence: 0.2 },
        ).then((result) => {
          console.log(`[Brain] Stage: curriculum.runFullCurriculum DONE (background) — reached=${result.reached}, passed=${result.passed.join(',')}, failed=${result.failed || 'none'}`);
        }).catch((err) => {
          console.warn('[Brain] curriculum.runFullCurriculum failed:', err?.message || err);
        });
      } else if (this.curriculum && typeof this.curriculum.runFromCorpora === 'function') {
        console.log('[Brain] Stage: curriculum.runFromCorpora START (BACKGROUND — legacy path, tick loop proceeds)');
        this.curriculum.runFromCorpora(
          { persona: personaText, baseline: baselineText, coding: codingText },
          { arousal: 0.8, valence: 0.2 },
        ).then(() => {
          console.log('[Brain] Stage: curriculum.runFromCorpora DONE (background)');
        }).catch((err) => {
          console.warn('[Brain] curriculum.runFromCorpora failed:', err?.message || err);
        });
      }

      const dictSize = this.dictionary._words?.size || 0;
      const bigramHeads = this.dictionary._bigrams?.size || 0;
      console.log(`[Brain] Language corpora loaded in ${Date.now() - startMs}ms: persona=${personaCount} baseline=${baselineCount} coding=${codingCount} templates=${templateCount} → ${dictSize} words, ${bigramHeads} bigram heads`);

      this._languageReady = true;
    } catch (err) {
      console.error('[Brain] Language subsystem init FAILED:', err.message);
      console.error(err.stack);
      // Leave _languageReady=false — _generateBrainResponse will fall
      // through to the honest-failure path instead of crashing.
    }
  }

  /**
   * R3 helper — compute a server-side cortex pattern from user text.
   *
   * On the client, the cortex pattern comes from reading Wernicke's
   * area neural activation via `getSemanticReadout`. The server
   * doesn't run the full LIF cortex simulation (GPU does that),
   * so we shortcut: the cortex pattern IS the sentence embedding
   * of the user's input. Semantically this is the same thing —
   * "what's currently on cortex" — just computed directly from
   * input text instead of via neural transformation.
   *
   * @param {string} text — user input text
   * @returns {Float64Array} — 50d L2-normalized semantic pattern
   */
  _computeServerCortexPattern(text) {
    if (!this.sharedEmbeddings) return null;
    const sentenceEmbed = this.sharedEmbeddings.getSentenceEmbedding(text || '');
    const out = new Float64Array(sentenceEmbed.length);
    for (let i = 0; i < sentenceEmbed.length; i++) out[i] = sentenceEmbed[i];
    return out;
  }

  // step() — DELETED. Was a CPU LIF fallback that iterated every neuron
  // in a JS for-loop. At 400K+ cerebellum neurons × 7 clusters × ~60Hz
  // that's >168M iterations/second — guaranteed CPU cook on the server.
  // The only neural compute path is now GPU via _gpuStep() → WGSL
  // FRACTAL shader (logistic map) in gpu-compute.js LIF_SHADER. No
  // GPU worker = brain paused (main loop already handles that at
  // line ~895 with a 2s idle). Derived state (arousal/valence/Ψ/
  // coherence/motor) is computed in _updateDerivedState() from the
  // GPU's spikeCount results — no duplicate CPU work needed.


  // 8 state-broadcast methods EXTRACTED to server/brain-server/state.js
  // SERVER_STATE_MIXIN (per-concern file architecture, P4.3.b).
  //   _broadcastStateNow, _runDictionarySmokeTest, _scheduleSmokeTestRetry,
  //   _computeMinGrade, getState, pushBrainEvent, _recentBrainEvents,
  //   _computeCortexDivergence
  // Attached via Object.assign(ServerBrain.prototype, ...) at the
  // bottom of this file. CommonJS module pattern.


  /**
   * T17.7 Phase B.4 — helper matching the LAYOUT in _regionsFor so
   * divergence calc can size main-cortex slices without parsing the
   * regions metadata object.
   */
  _regionFraction(regName) {
    const FRACTIONS = {
      auditory: 0.083, visual: 0.167, free: 0.250, letter: 0.050,
      phon: 0.200, sem: 0.167, fineType: 0.050, motor: 0.033,
    };
    return FRACTIONS[regName] ?? 0;
  }

  /**
   * T17.7 Phase B.3 — mirror standalone cortexCluster sub-region
   * spike state into the main cortex GPU sub-region slice buffers.
   *
   * For each sub-region in cortexCluster.regions, collects the
   * spike indices from cortexCluster.lastSpikes (binary Uint8Array
   * of firing/not-firing at training or post-emission state),
   * upsamples to the proportionally larger main-cortex slice size
   * via nearest-neighbor tiling (each standalone index i maps to
   * main-cortex indices [i·R, (i+1)·R) where R = mainSliceLen /
   * standSliceLen), and ships the sparse list of firing main-cortex
   * indices to compute.html via write_spike_slice.
   *
   * Activity-gated: if every region has zero spikes, no messages
   * sent — avoids saturating the WebSocket with empty mirrors
   * during idle (between curriculum teach / generation calls).
   *
   * Ψ doesn't modulate here — spikes are training data from the
   * standalone cluster's already-settled state. Runtime Ψ gating
   * happens at main-cortex LIF dispatch, not at spike mirror.
   *
   * This bridge is Phase B; Phase E deletes both the standalone
   * cortexCluster AND this mirror call since main-cortex slices
   * become authoritative at that point.
   */
  _mirrorCortexRegions() {
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return;
    if (!this.cortexCluster || !this.cortexCluster.regions || !this.cortexCluster.lastSpikes) return;
    const stand = this.cortexCluster;
    const mainSize = CLUSTER_SIZES.cortex;
    if (!mainSize) return;

    // Same fractional layout as _regionsFor('cortex'). Recomputed
    // here rather than looking up to avoid any drift if layouts
    // diverge.
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

    for (const [regName, [frA, frB]] of Object.entries(LAYOUT)) {
      const standReg = stand.regions[regName];
      if (!standReg) continue;
      const standStart = standReg.start;
      const standEnd = standReg.end;
      const standLen = standEnd - standStart;
      if (standLen <= 0) continue;
      const mainStart = Math.floor(mainSize * frA);
      const mainEnd = Math.floor(mainSize * frB);
      const mainLen = mainEnd - mainStart;
      if (mainLen <= 0) continue;

      // Count spikes first — skip if region is silent.
      let spikeCount = 0;
      for (let i = standStart; i < standEnd && i < stand.lastSpikes.length; i++) {
        if (stand.lastSpikes[i]) spikeCount++;
      }
      if (spikeCount === 0) continue;

      // Collect firing main-cortex indices via nearest-neighbor
      // upsampling. Each firing standalone index i expands to a
      // block of R consecutive main-cortex indices where R is the
      // upsample ratio (main_size / stand_size for this region).
      // At biological scale typical R is small (e.g., 30M main / 7M
      // stand = 4.3 for most regions), so this stays bounded.

      // Bandwidth guard: cap mirrored spikes per region at 50K to
      // prevent a Promise.all-like burst from choking WebSocket.
      // 50K × 4 bytes = 200 KB per region per tick × 8 regions =
      // ~1.6 MB/tick which is fine at 10 Hz broadcast.
      const R = mainLen / standLen;
      const MAX_SPIKES = 50000;
      const sparseIndices = [];
      for (let i = 0; i < standLen && sparseIndices.length < MAX_SPIKES; i++) {
        if (!stand.lastSpikes[standStart + i]) continue;
        const mainStartLocal = Math.floor(i * R);
        const mainEndLocal = Math.min(Math.floor((i + 1) * R), mainLen);
        for (let j = mainStartLocal; j < mainEndLocal && sparseIndices.length < MAX_SPIKES; j++) {
          sparseIndices.push(j);
        }
      }
      if (sparseIndices.length === 0) continue;

      this._gpuClient.send(JSON.stringify({
        type: 'write_spike_slice',
        clusterName: 'cortex',
        regionName: regName,
        sparseIndices,
      }));
    }
  }

  /**
   * T17.7 Phase B.1 — build the regions metadata object for a
   * cluster's gpu_init message. For the main cortex cluster, returns
   * the 8 language sub-regions (auditory / visual / free / letter /
   * phon / sem / fineType / motor) with biological lateralization.
   * For other clusters returns a single bilateral/center region
   * spanning the whole cluster so the hemisphere gate stays at 1.0
   * (no lateralization) but the side tag is still carried for future
   * inter-cluster projection dispatch that may care about hemisphere.
   *
   * Main cortex layout — same fractional proportions as the standalone
   * cortexCluster's sub-regions, scaled to the main cortex's size.
   * Phase B.3 mirrors standalone cortexCluster.lastSpikes into these
   * slices; Phase C migrates curriculum teach writes to land here
   * directly; Phase E deletes the standalone cluster and promotes
   * these slices to authoritative.
   *
   * L/R side tags — non-centered regions need mirroring to the
   * other brain side so they aren't one-sided, and proper left-right
   * gating applies:
   *   - auditory / visual / free / sem:  bilateral
   *     (primary sensory + working memory + semantic angular gyrus
   *     span both hemispheres)
   *   - letter / phon / fineType / motor: left-dominant
   *     (Wernicke's + Broca's + VWFA + syntactic features; Lindell
   *     2006 right-hemisphere homologs exist but are less specialized)
   *   - hypothalamus / mystery: center (midline / commissural)
   *   - everything else: bilateral
   *
   * Ψ gate per Phase A.3: bilateral/center returns 1.0 regardless of
   * Ψ; left-dominant regions modulate by hemisphereGate(side, Ψ).
   *
   * @param {string} clusterName
   * @param {number} size
   * @returns {object | null}
   */
  _regionsFor(clusterName, size) {
    if (clusterName === 'cortex') {
      // Same fractional layout as the standalone cortexCluster's
      // regions map (cluster.js). Scaled to main cortex size so the
      // regions span the full cluster with no "homogeneous outside"
      // gap — there's NO separate intra-synapse matrix for the
      // outside region; wave-function fractal coupling syncs
      // activation across the cortex, so the cortex IS its sub-regions.
      const S = size;
      return {
        auditory:  { start: Math.floor(S * 0.000), end: Math.floor(S * 0.083), side: 'bilateral' },
        visual:    { start: Math.floor(S * 0.083), end: Math.floor(S * 0.250), side: 'bilateral' },
        free:      { start: Math.floor(S * 0.250), end: Math.floor(S * 0.500), side: 'bilateral' },
        letter:    { start: Math.floor(S * 0.500), end: Math.floor(S * 0.550), side: 'left' },
        phon:      { start: Math.floor(S * 0.550), end: Math.floor(S * 0.750), side: 'left' },
        sem:       { start: Math.floor(S * 0.750), end: Math.floor(S * 0.917), side: 'bilateral' },
        fineType:  { start: Math.floor(S * 0.917), end: Math.floor(S * 0.967), side: 'left' },
        motor:     { start: Math.floor(S * 0.967), end: S,                      side: 'left' },
      };
    }
    if (clusterName === 'hippocampus' || clusterName === 'amygdala'
        || clusterName === 'basalGanglia' || clusterName === 'cerebellum') {
      return {
        whole: { start: 0, end: size, side: 'bilateral' },
      };
    }
    if (clusterName === 'hypothalamus' || clusterName === 'mystery') {
      return {
        whole: { start: 0, end: size, side: 'center' },
      };
    }
    return null;  // unknown cluster — no regions, homogeneous behavior
  }


  // 20 GPU sparse-comm methods EXTRACTED to server/brain-server/gpu.js
  // SERVER_GPU_MIXIN (per-concern file architecture, P4.3.a).
  //   _gpuStep, _gpuBatch, _nextSparseReqId, _sparseSend,
  //   _encodeSparseHeader, _sparseSendBinary, gpuDrainWait,
  //   _gpuSparseFlowOk, gpuSparseUpload, gpuSparsePropagate,
  //   gpuSparseHebbianBound, _enqueueBoundHebbian, _flushBoundHebbianBatch,
  //   gpuSparsePropagateBound, _gpuWriteCortexSpikeSlice,
  //   _gpuWriteCortexCurrentSlice, _gpuClearCortexSpikeRegion,
  //   gpuReadbackCortexLetterBuckets, _ensureCortexCrossProjectionsBound,
  //   gpuSparseHebbian
  // Attached via Object.assign(ServerBrain.prototype, ...) at the
  // bottom of this file. All methods accessible identically through
  // the prototype chain.


  /**
   * T15.C — drive per-tick scheduler: promote deferred ingestions,
   * evaluate sensory triggers, evaluate adult-use patterns, clear
   * expired pharma events, refresh active-pattern tag set for the
   * decision engine.
   *
   * Called from _updateDerivedState() so it participates in the same
   * per-tick broadcast cycle that rebuilds arousal/valence/Ψ/etc.
   *
   * Context assembly:
   *   - localHour: fractional hour of current wall-clock time
   *   - dayOfWeek: 0=Sun..6=Sat
   *   - arousal: pre-computed arousal this tick (passed in)
   *   - cortexDemand: cortex firing rate fraction [0, 1] as proxy
   *   - demandDurationMs: how long cortex demand has held >= 0.7
   *   - social/consent/activityTag/locationTag: from session state
   *     when available (sessionCtx), else defaults (solo, no activity)
   */
  _driveDrugScheduler(arousal) {
    if (!this.drugScheduler) return;
    const now = Date.now();
    const throttleMs = 1000;  // one scheduler tick per second of wall time
    if ((now - (this._lastPatternTickMs || 0)) < throttleMs) return;
    this._lastPatternTickMs = now;

    // Always promote + clear-expired — cheap, independent of context.
    this.drugScheduler.promoteScheduledIngests(now);
    this.drugScheduler.clearExpired(now);

    // Rebuild _activePatternTags from currently-active substances so
    // decide() sees the correct tag set. Tags stamped by
    // evaluatePatterns; substances that are currently active (still
    // under tail) keep their tag.
    const active = this.drugScheduler.activeSubstances(now);
    this.drugScheduler._activePatternTags.clear();
    for (const a of active) this.drugScheduler._activePatternTags.add(a.substance);

    // Cortex demand proxy — cortex firing rate fraction. Tracks
    // sustained high-load window for codingMarathon trigger.
    const cortexRate = (this.clusters?.cortex?.firingRate || 0) / (CLUSTER_SIZES.cortex || 1);
    if (cortexRate >= 0.70) {
      if (!this._cortexHighLoadSince) this._cortexHighLoadSince = now;
    } else {
      this._cortexHighLoadSince = 0;
    }
    const demandDurationMs = this._cortexHighLoadSince > 0 ? (now - this._cortexHighLoadSince) : 0;

    // Assemble context. sessionCtx is carried by whatever chat/ide
    // surface set it via state broadcast; no surface sets it today
    // so fields fall back to null/defaults and triggers/patterns
    // requiring them quietly skip.
    const date = new Date(now);
    const ctx = {
      localHour: date.getHours() + date.getMinutes() / 60,
      dayOfWeek: date.getDay(),
      arousal: arousal ?? this.arousal ?? 0,
      cortexDemand: cortexRate,
      demandDurationMs,
      activityTag: this._sessionActivityTag || null,
      locationTag: this._sessionLocationTag || null,
      social: this._sessionSocial === true,
      consent: this._sessionConsent === true,
      olfactory: this.olfactory,
      visualTags: this._sessionVisualTags || null,
      audioTags: this._sessionAudioTags || null,
    };

    // Sensory triggers first — they add cravings that pattern matcher
    // doesn't read but decide() later will if an offer arrives.
    try {
      if (typeof this._sensoryTriggers === 'function') {
        this._sensoryTriggers(this.drugScheduler, ctx);
      }
    } catch { /* non-fatal */ }

    // Adult-use patterns — fire whatever matches its triggers + cooldown.
    try {
      this.drugScheduler.evaluatePatterns(ctx);
    } catch { /* non-fatal */ }
  }

  _updateDerivedState() {
    // Arousal — Session 114.19eq fix. Prior formula
    // `p.arousalBaseline * 0.8 + Math.min(1, amygRate * 5) * 0.2`
    // looked dynamic but SATURATED at biological scale: amygRate * 5
    // exceeded 1 every tick so Math.min clamped the dynamic term at
    // 0.2 and arousal locked at 0.72+0.2 = 0.920 with zero variance
    // (operator caught it: *"is arrousal another placeholder like the
    // fucking coherence??? its not even moving on smidge at all"*).
    // The real arousal computation lives in the Amygdala module
    // settle below (line 3841): `arousal = baseline·0.6 + 0.4·attractor
    // depth + 0.1·(fear+reward)` reads the recurrent attractor's RMS
    // norm and produces real dynamic readout. We assign a soft baseline
    // floor here (so first-tick before module init has a sane value)
    // and let the amygdala-module step block below overwrite with the
    // real attractor arousal each tick.
    const p = this.persona;
    if (typeof this.arousal !== 'number' || !isFinite(this.arousal)) {
      this.arousal = p.arousalBaseline; // first-tick init
    }
    this.valence = (this.reward > 0 ? 0.1 : this.reward < 0 ? -0.1 : 0) + (Math.random() - 0.5) * 0.02;
    // Aggression: negative valence builds faster when threshold is low
    if (this.valence < -p.aggressionThreshold) this.valence *= 1.2;

    // Ψ = √(1/n) × N³ × [α·Id + β·Ego + γ·Left + δ·Right]
    // √(1/n) = quantum tunneled bit probability
    // Ψ = √(1/n) × N³ — n and N are DIFFERENT
    // n = active spiking neurons (quantum tunneled bits — changes every step)
    // N = total neuron count (brain volume — scales to hardware)
    const n = Math.max(1, this.totalSpikes);
    const N = TOTAL_NEURONS;
    const quantumBit = Math.sqrt(1 / n);       // quantum tunnel probability
    const cubedVolume = Math.pow(N, 3);        // cubed area of total volume
    const quantumVolume = quantumBit * cubedVolume;

    // Components from cluster activity — persona weights modulate
    const cortexActivity = this.clusters.cortex.spikeCount / (CLUSTER_SIZES.cortex || 1);
    const amygActivity = this.clusters.amygdala.spikeCount / (CLUSTER_SIZES.amygdala || 1);
    const cerebActivity = this.clusters.cerebellum.spikeCount / (CLUSTER_SIZES.cerebellum || 1);
    const mysteryActivity = this.clusters.mystery.spikeCount / (CLUSTER_SIZES.mystery || 1);
    const hippoActivity = this.clusters.hippocampus.spikeCount / (CLUSTER_SIZES.hippocampus || 1);
    const bgActivity = this.clusters.basalGanglia.spikeCount / (CLUSTER_SIZES.basalGanglia || 1);

    // Ψ = quantum_bit × [α·Id + β·Ego + γ·Left + δ·Right]
    // PERSONA modulates the weights — Unity's identity shapes consciousness

    // T18.4.d — integrate GPU meanVoltage telemetry (from T18.4.c's atomic
    // reduction shader) into each cluster's "activity" signal. Previously
    // modules saw only spike count — a summary that collapses burst
    // dynamics into a scalar. Now each cluster's effective activity is
    // `spike_rate + |mean_voltage| × 0.1` — adding a sub-threshold
    // depolarization signal so active-but-not-spiking clusters still
    // contribute to consciousness (matches biological reality where
    // membrane state between spikes still carries information).
    const mvBoost = (name) => {
      const mv = this.clusters[name]?.meanVoltage;
      return (typeof mv === 'number') ? Math.min(0.3, Math.abs(mv) * 0.1) : 0;
    };
    const cortexAct  = cortexActivity  + mvBoost('cortex');
    const amygAct    = amygActivity    + mvBoost('amygdala');
    const cerebAct   = cerebActivity   + mvBoost('cerebellum');
    const mysteryAct = mysteryActivity + mvBoost('mystery');
    const hippoAct   = hippoActivity   + mvBoost('hippocampus');

    const id = amygAct * p.arousalBaseline;                   // Id: instinct × arousal baseline
    const ego = cortexAct * (1 + hippoAct);                   // Ego: self-model × memory
    const left = (cerebAct + cortexAct) * (1 - p.impulsivity); // Left: logic × deliberation
    const right = (amygAct + mysteryAct) * p.creativity;       // Right: creativity × emotion

    // Φ-augmented Ψ. Multiply the legacy quantum-volume
    // formula by cluster.computePhi() (Shannon-entropy proxy of cortex
    // spike patterns) so the Mystery module reads ACTUAL information
    // integration, not just a scalar placeholder. Real cortex with
    // diverse activity → higher Φ → amplifies Ψ. Silent or saturated
    // cortex → low Φ → dampened Ψ. Biologically grounded measurement.
    let phiProxy = 1.0;
    if (this.cortexCluster && typeof this.cortexCluster.computePhi === 'function') {
      try { phiProxy = Math.max(0.1, this.cortexCluster.computePhi()); }
      catch { phiProxy = 1.0; }
    }
    const rawPsi = quantumVolume * (0.3 * id + 0.25 * ego + 0.2 * left + 0.25 * right) * phiProxy;
    // Log scale for usable range — consciousness measured in orders of magnitude
    this.psi = Math.log10(Math.max(1, rawPsi));
    this.phiProxy = phiProxy; // exposed for dashboard / heartbeat

    // Coherence — REAL Kuramoto order parameter computed from the
    // cortex's theta + gamma oscillator phases plus per-cluster
    // activity-coupled phases. Pre-fix this was an Ornstein-Uhlenbeck
    // random walk pretending to be a Kuramoto reading — the variable
    // was named "Kuramoto-like" but the implementation was literally
    // Math.random() with mean-reversion to 0.4. Now reads true
    // synchrony from the cortex theta-gamma drive (cluster.getPhases)
    // + cluster firing-rate coupling, with attention-driven ignition
    // boost, drug-dissociation drop, and dream-cycle drop. EMA-smoothed
    // so the dashboard doesn't flicker every tick.
    const computed = this._computeKuramotoCoherence();
    this.coherence = 0.9 * this.coherence + 0.1 * computed;
    this.coherence = Math.max(0, Math.min(1, this.coherence));

    // Reward decay
    this.reward *= 0.99;
    this.time += 1 / 1000;
    this.frameCount++;

    // FEAR / REWARD / VALENCE via the real amygdala attractor module.
    // The Rulkov amygdala cluster gives us a scalar firing rate; we
    // build a 32-element input vector by sampling that rate with
    // persona-derived per-nucleus weighting (arousalBaseline adds
    // positive drive to every nucleus, emotionalVolatility scatters
    // sign across them). Then step() settles the recurrent attractor
    // for 5 iterations and reads fear = σ(fearProj · x_settled),
    // reward = σ(rewardProj · x_settled), valence = reward − fear.

    // This replaces the earlier hack that linearly multiplied
    // amygActivity by 6 and saturated fear to 1 the moment the
    // cluster fired. Now fear is the canonical attractor readout —
    // same equation js/brain/modules.js Amygdala class runs on the
    // local-brain path, just driven by cluster-level telemetry
    // instead of per-neuron spikes.
    if (this.amygdalaModule) {
      const amySize = this.amygdalaModule.size;
      const amyInput = new Float64Array(amySize);
      // Base drive: cluster activity scaled to the module's input range.
      // T18.4.d — augment with GPU meanVoltage so sub-threshold
      // depolarization also drives the module (not just spikes). A
      // cluster that's building up toward a burst but hasn't fired yet
      // still has an elevated mean voltage — the module now sees it
      // instead of waiting for the first spike.
      const amyMV = this.clusters.amygdala?.meanVoltage;
      const mvContrib = (typeof amyMV === 'number') ? Math.min(0.2, Math.abs(amyMV) * 0.08) : 0;
      const baseDrive = Math.min(1, amygActivity * 4 + mvContrib);
      for (let i = 0; i < amySize; i++) {
        // Persona-weighted per-nucleus pattern — low-freq sine so
        // adjacent nuclei get correlated input (matches real amygdala
        // nuclei clustering). Scaled by base drive + valence term.
        const phase = (i / amySize) * Math.PI * 2;
        const pattern = Math.sin(phase) * (p.emotionalVolatility || 0.5)
                      + Math.cos(phase * 2) * 0.3;
        amyInput[i] = baseDrive * (0.6 + 0.4 * pattern) + this.valence * 0.1;
      }
      const amyOut = this.amygdalaModule.step(amyInput, { arousal: this.arousal, valence: this.valence }, 1);
      this.fear = amyOut.fear;
      // Reward is the amygdala readout, but the reward field on this
      // also receives external signals from user feedback — blend.
      this.reward = this.reward * 0.9 + amyOut.reward * 0.1;
      // Let the attractor nudge valence too — persona arousal floor
      // keeps it from swinging too far negative.
      this.valence = this.valence * 0.8 + amyOut.valence * 0.2;
      // Session 114.19eq — arousal sourced from amygdala-attractor
      // settle output (real RMS-of-settled-state + fear/reward
      // contribution per modules.js Amygdala.step formula). EMA blend
      // 0.7 prior + 0.3 new so excursion is smooth not jittery.
      // Clamped to [0.3, 1] so persona floor holds even when the
      // attractor's settled state goes near-zero (e.g. during dream
      // cycles).
      if (typeof amyOut.arousal === 'number' && isFinite(amyOut.arousal)) {
        this.arousal = this.arousal * 0.7 + amyOut.arousal * 0.3;
        this.arousal = Math.min(1, Math.max(0.3, this.arousal));
      }
    } else {
      this.fear = 0; // pre-module-init fallback
    }

    // MOTOR — under GPU-exclusive compute the server never sees
    // per-neuron spike bitmasks, only spikeCount per cluster. Can't
    // partition BG neurons into 6 channels directly. Instead derive
    // per-channel Q-values from the combined brain-state readouts
    // that would drive each action in a local cluster model:

    //   respond_text: cortex predicts + BG gates + hippo recalls
    //   generate_image: amygdala feels + mystery imagines + cortex verbs
    //   speak: high arousal + BG activation + persona speech drive
    //   build_ui: cortex predicts + cerebellum corrects (pure logic)
    //   listen: inverse of total activity (quiet = attentive)
    //   idle: persona baseline (Unity is rarely idle on cokeAndWeed)

    // Channels get an EMA update so they don't flicker frame-to-frame.
    const totalActivity = cortexActivity + amygActivity + bgActivity + hippoActivity + cerebActivity + mysteryActivity;
    const channelQ = [
      cortexActivity * 0.6 + bgActivity * 0.3 + hippoActivity * 0.1,          // respond_text
      amygActivity * 0.4 + mysteryActivity * 0.35 + cortexActivity * 0.25,    // generate_image
      this.arousal * 0.5 + bgActivity * 0.3 + hippoActivity * 0.2,            // speak
      cortexActivity * 0.7 + cerebActivity * 0.3,                             // build_ui
      Math.max(0, 0.3 - totalActivity),                                        // listen
      Math.max(0.05, 0.2 - this.arousal * 0.15),                               // idle
    ];
    for (let ch = 0; ch < 6; ch++) {
      this.motorChannels[ch] = this.motorChannels[ch] * 0.7 + channelQ[ch] * 0.3;
    }
    let maxRate = 0, maxCh = 5;
    for (let ch = 0; ch < 6; ch++) {
      if (this.motorChannels[ch] > maxRate) { maxRate = this.motorChannels[ch]; maxCh = ch; }
    }
    this.motorAction = ['respond_text', 'generate_image', 'speak', 'build_ui', 'listen', 'idle'][maxCh];
    this.motorConfidence = maxRate;

    // T15.C — drive the scheduler's per-tick work once motorAction
    // and derived state are settled this tick. Promotes deferred
    // ingests, evaluates sensory triggers, fires adult-use patterns.
    // Throttled to 1 Hz internally so main tick rate (~10 Hz) doesn't
    // over-trigger pattern evaluation.
    try { this._driveDrugScheduler(this.arousal); } catch { /* non-fatal */ }
  }

  /**
   * Real Kuramoto order parameter computed from the cortex's
   * theta + gamma oscillator phases (per-tick deterministic, derived
   * from cluster._tickCounter and the configured period) plus
   * activity-coupled phases for each non-cortex cluster (firingRate
   * scales coupling — silent clusters drift out of phase, active
   * clusters phase-lock toward the cortex base).
   *
   *   r = |Σ_k exp(i·θ_k)| / N
   *
   * computed independently for theta-band and gamma-band phases.
   * Theta carries working-memory backbone (~6 Hz, slow), gamma
   * carries attention-binding (~40 Hz, fast). Combined coherence is
   * gamma-weighted (0.6·gamma + 0.4·theta) since conscious binding
   * is gamma-dominated in real EEG.
   *
   * Modulators applied on top:
   *   - GlobalWorkspace ignition (Dehaene-Changeux 2011): when the
   *     conscious broadcast is strong, all clusters phase-align toward
   *     it — coherence spikes 0.7-0.9 for the ignition window
   *   - Drug dissociation (LSD/ketamine): inter-network phase
   *     desynchronization, coherence drops 0.1-0.3
   *   - Dream cycle: low-coherence consolidation state, coherence
   *     drops to 0.2-0.3
   *
   * Per-band fields exposed for dashboard:
   *   this.coherenceTheta, this.coherenceGamma
   *
   * Returns combined coherence in [0, 1]. Caller smooths via EMA
   * (this.coherence = 0.9 * this.coherence + 0.1 * computed).
   */
  _computeKuramotoCoherence() {
    if (!this.cortexCluster || typeof this.cortexCluster.getPhases !== 'function') {
      return this.coherence;
    }
    const phases = this.cortexCluster.getPhases();
    if (!phases) return this.coherence;

    const baseTheta = phases.theta;
    const baseGamma = phases.gamma;
    const tick = this.cortexCluster._tickCounter | 0;

    let sumTcos = Math.cos(baseTheta);
    let sumTsin = Math.sin(baseTheta);
    let sumGcos = Math.cos(baseGamma);
    let sumGsin = Math.sin(baseGamma);
    let N = 2;

    const clusterNames = Object.keys(this.clusters || {});
    for (let i = 0; i < clusterNames.length; i++) {
      const c = this.clusters[clusterNames[i]];
      if (!c) continue;
      // Amplify low firing rates so steady-state activity (~0.05-0.2)
      // maps to a meaningful coupling strength. Clamped to [0, 1].
      const couple = Math.max(0, Math.min(1, (c.firingRate || 0) * 5));
      // Deterministic phase drift derived from tick + cluster index
      // so silent clusters wander predictably without RNG. Active
      // clusters phase-lock (drift damped by couple weight).
      const drift = (1 - couple) * Math.sin(tick * 0.0137 + i * 1.91);
      const offset = (i / Math.max(1, clusterNames.length)) * Math.PI * 2;
      const thetaPhase = baseTheta + offset * (1 - couple) + drift * Math.PI;
      const gammaPhase = baseGamma + offset * 5 * (1 - couple) + drift * Math.PI * 0.5;
      sumTcos += Math.cos(thetaPhase);
      sumTsin += Math.sin(thetaPhase);
      sumGcos += Math.cos(gammaPhase);
      sumGsin += Math.sin(gammaPhase);
      N += 1;
    }

    const rTheta = Math.sqrt(sumTcos * sumTcos + sumTsin * sumTsin) / N;
    const rGamma = Math.sqrt(sumGcos * sumGcos + sumGsin * sumGsin) / N;
    this.coherenceTheta = rTheta;
    this.coherenceGamma = rGamma;

    // Combined: gamma-weighted (attention dominates conscious binding,
    // theta provides the working-memory backbone).
    let coherence = 0.6 * rGamma + 0.4 * rTheta;

    // GlobalWorkspace ignition spike — when the conscious broadcast
    // is strong, downstream clusters phase-align toward it.
    const ws = this.cortexCluster._globalWorkspace;
    if (ws && typeof ws.getBroadcast === 'function') {
      const bc = ws.getBroadcast();
      if (bc && typeof bc.value === 'number' && bc.value > 0.5) {
        coherence = Math.min(1.0, coherence + 0.3 * bc.value);
      }
    }

    // Drug dissociation drop — LSD/ketamine desynchronize networks.
    if (this.drugScheduler && typeof this.drugScheduler.speechModulation === 'function') {
      const sm = this.drugScheduler.speechModulation();
      if (sm && typeof sm.dissociation === 'number' && sm.dissociation > 0.3) {
        coherence *= (1.0 - sm.dissociation * 0.4);
      }
    }

    // Dream cycle — low-coherence consolidation state.
    if (this._isDreaming) {
      coherence *= 0.6;
    }

    return Math.max(0, Math.min(1, coherence));
  }

  injectText(text) {
    // T17.7 Phase B.2 — biological-proportion text injection to GPU.

    // Prior behavior wrote to a server-side scratch `this.voltages.cortex`
    // Float64Array that never reached the GPU (vestigial post-T18.4.a).
    // Now injection lands directly on the main cortex's `phon`
    // sub-region (Wernicke's area) via the write_current_slice message
    // → compute.html → gpu.writeCurrentSlice pipeline. Ψ-modulated
    // hemisphere gate applies automatically at LIF time because phon
    // is tagged left-lateralized (Phase B.1 metadata).

    // Size scales to biological proportion:
    // 'yes, it need biological scale fit to auto scale on GPU'.
    // Wernicke slice = 20% of main cortex (phon fractional layout).
    // On a 30M main cortex = 6M neurons of injection target — much
    // bigger than the prior 5K fixed footprint, matching real
    // Wernicke's area as a meaningful chunk of left temporal cortex.

    // Hash-and-spread injection pattern preserved from prior code:
    // each character lands at a deterministic slice-relative index
    // with lateral excitation (±1 neighbor) so nearby letters
    // share activation — same Wernicke lateral-excitation mechanism
    // described in the equation docs.
    if (!this._gpuClient || this._gpuClient.readyState !== 1) return;
    const mainCortexSize = CLUSTER_SIZES.cortex;
    if (!mainCortexSize) return;

    // Compute phon slice size from fractional layout (matches _regionsFor).
    const phonStart = Math.floor(mainCortexSize * 0.550);
    const phonEnd = Math.floor(mainCortexSize * 0.750);
    const phonSize = phonEnd - phonStart;
    if (phonSize <= 0) return;

    // Build a sparse Float32 current pattern on server — only touched
    // indices get non-zero values. Sending the full 6M float array
    // would be 24MB per tick, wasteful. Instead we allocate a dense
    // Float32Array once and zero-reuse. For text of length N, only
    // ~N×3 indices get non-zero values (char hash + ±1 neighbors).
    const currents = new Float32Array(phonSize);
    for (let i = 0; i < text.length; i++) {
      const idx = (text.charCodeAt(i) * 31 + i * 7) % phonSize;
      currents[idx] += 8.0;
      if (idx > 0) currents[idx - 1] += 3.0;
      if (idx < phonSize - 1) currents[idx + 1] += 3.0;
    }
    this._gpuClient.send(JSON.stringify({
      type: 'write_current_slice',
      clusterName: 'cortex',
      regionName: 'phon',
      values: Array.from(currents),
      psi: this.psi ?? 0,
    }));

    // Amygdala injection — social input excites the emotional cluster.
    // Bilateral side → hemisphere gate stays 1.0 regardless of Ψ
    // (Gazzaniga lateralization doesn't apply to amygdala emotional
    // response; both sides fire on social salience).

    // Sparse injection format — only a biologically-plausible number
    // of amygdala nuclei get the social-input bump (100 nuclei × 4.0
    // current per text input matches original amygdala coupling
    // strength). Shipping dense 26M-float array would be 100+ MB per
    // text message; sparse 100-entry list is ~2 KB. Same equational
    // effect, 400× less bandwidth.
    const amygSize = CLUSTER_SIZES.amygdala;
    if (amygSize > 0) {
      const amygInjN = Math.min(100, amygSize);
      const sparseIndices = new Array(amygInjN);
      const sparseValues = new Array(amygInjN);
      for (let i = 0; i < amygInjN; i++) {
        sparseIndices[i] = i;
        sparseValues[i] = 4.0;
      }
      this._gpuClient.send(JSON.stringify({
        type: 'write_current_slice',
        clusterName: 'amygdala',
        regionName: 'whole',
        sparseIndices,
        sparseValues,
        psi: this.psi ?? 0,
      }));
    }

    this.reward += 0.1;
  }

  /**
   * Start the brain loop.
   */
  async start() {
    if (this.running) return;

    // R3 — initialize the language subsystem BEFORE accepting any
    // clients or starting the tick loop. Clients arriving at a server
    // with an empty dictionary would see Unity fall back to '...' on
    // every text response; awaiting here guarantees the corpus is
    // loaded and the semantic embeddings are ready before any
    // generation happens.
    await this._initLanguageSubsystem();

    this.running = true;
    this._startedAt = Date.now();
    this._lastInputTime = Date.now();
    this._isDreaming = false;

    console.log('[Brain] GPU EXCLUSIVE MODE — no CPU workers spawned. Waiting for compute.html...');

    // Recursive setTimeout — next tick fires AFTER current step completes
    const tick = async () => {
      const stepStart = performance.now();

      // iter19 — UNIFIED MEMORY HEARTBEAT fires at the TOP of every tick
      // so it runs even when the probe-gate early-return pre-empts the
      // bottom of the tick body. Wall-clock timestamps inside (NOT
      // frameCount modulo) so cadence is robust against slow ticks at
      // biological scale.
      this._memoryHeartbeat();

      // server-side inner voice tick. Fires Unity's REAL
      // current-state thought (read from server cluster's trained
      // weights) every ~3 s and broadcasts as `innerThought` WS message
      // for 3D brain popups to render. Replaces the iter23.2 browser-
      // side inner voice (which ran on the client's untrained cortex —
      // decorative noise, not Unity's real mind).
      this._innerVoiceTick();

      // Attention selection. Amygdala (valence/arousal)
      // and basal-ganglia (action gating) write per-region gain factors
      // into cortex.attentionGain. Posner attention network functionally:
      //   - High arousal → motor region 2× gain (action-ready focus)
      //   - High valence → sem region 1.5× gain (positive content focus)
      //   - actionGate strong → word_motor + motor 2× gain (speech ready)
      //   - Low arousal → all attentionGain default 1.0 (relaxed wide focus)
      if (this.cortexCluster && this.cortexCluster.attentionGain) {
        const ag = this.cortexCluster.attentionGain;
        const arousal = this.arousal || 0;
        const valence = this.valence || 0;
        const actionGate = this.cortexCluster.actionGate || 1;
        // Reset to defaults
        ag.motor = arousal > 0.6 ? 2.0 : (arousal < 0.2 ? 0.7 : 1.0);
        ag.word_motor = (arousal > 0.6 || actionGate > 1.2) ? 1.8 : 1.0;
        ag.sem = valence > 0.5 ? 1.5 : 1.0;
        ag.fineType = arousal > 0.5 ? 1.3 : 1.0;
        // Sensory regions stay near 1.0 — attention doesn't suppress
        // input gathering, only amplifies internal selection.
      }

      // Global workspace ignition tick (Baars GWT).
      // Aggregates each cluster's TOP candidate; softmax with
      // temperature; if max prob > threshold, WINNER broadcasts back.
      // Theta-gated (~6 Hz). Implements the "ignition moment" of
      // consciousness — competition + threshold + global broadcast.
      // Subthreshold ticks have unconscious processing only.
      if (this.globalWorkspace && typeof this.globalWorkspace.tick === 'function') {
        try { this.globalWorkspace.tick(); }
        catch (err) { /* non-fatal — workspace failure shouldn't crash brain */ }
      }

      // iter20-N — ConsolidationEngine fires at TOP of tick alongside
      // memory heartbeat. Operator caught (verbatim 2026-05-05): "last
      // pass 6min ago and pass intervasl is 5min" — pass should have
      // fired but didn't. Root cause: iter20-J's consolidation block
      // was placed at the BOTTOM of tick body, AFTER the probe-gate
      // early-return at line ~3961. When curriculum runs gate probes
      // (extended windows during biological-scale teach), tick early-
      // returns and SKIPS consolidation. Moving to TOP so it fires
      // every tick regardless of probe-gate state. iter20-A's gate
      // hardening (5min interval + lastPassAt set early) prevents
      // rapid re-fire even during probe-heavy windows.
      if (this.consolidationEngine
          && this.consolidationEngine.shouldRunPass()) {
        this.consolidationEngine.runConsolidationPass().catch(err => {
          console.warn('[Consolidation] pass failed:', err?.message || err);
        });
      }

      // ── GPU EXCLUSIVE: all computation on GPU, zero CPU burn ──
      const gpuReady = this._gpuConnected && this._gpuClient?.readyState === 1;

      if (gpuReady) {
        if (!this._gpuInitialized) this._gpuInitialized = {};
        if (!this._gpuInitializedConfirmed) this._gpuInitializedConfirmed = {};
        if (!this._gpuHits) this._gpuHits = 0;
        if (!this._gpuMisses) this._gpuMisses = 0;

        try {
          const allClusters = Object.keys(CLUSTER_SIZES);

          // T14.23.3 — TWO-PHASE GPU INIT.

          // Phase A: for any cluster that hasn't had its gpu_init message
          //          SENT yet, send it (once). _gpuInitialized tracks
          //          what's been sent.
          // Phase B: wait for gpu_init_ack messages to confirm the GPU
          //          actually allocated its buffers. _gpuInitializedConfirmed
          //          tracks confirmed state.
          // Phase C: only when ALL clusters are confirmed, enter the
          //          BATCHED COMPUTE path.

          // Old code used _gpuInitialized as both the "sent" flag AND
          // the "confirmed" flag, which meant the tick loop would enter
          // the compute path as soon as the server had SENT the init
          // messages — before compute.html had actually processed them.
          // At 677M-neuron biological scale each gpu_init takes seconds of
          // GPU buffer allocation (cerebellum alone is ~2 GB of vec2<f32>
          // voltage state). Compute_batch messages queued behind the
          // init messages in compute.html's onmessage queue and timed
          // out before getting processed. Now the tick loop idles on
          // compute dispatch until every cluster's ack comes back.
          const needsSend = allClusters.filter(c => !this._gpuInitialized[c]);
          if (needsSend.length > 0) {
            console.log(`[Brain] GPU init send: ${needsSend.join(', ')}`);
            for (const gc of needsSend) {
              this._gpuStep(gc); // sends gpu_init, marks _gpuInitialized
            }
            this._updateDerivedState();
          } else {
            const needsAck = allClusters.filter(c => !this._gpuInitializedConfirmed[c]);
            if (needsAck.length > 0) {
              // Init messages sent, waiting for GPU to confirm.
              // Don't re-send. Don't dispatch compute. Just idle this
              // tick and let the event loop service the incoming
              // gpu_init_ack messages.
              if (!this._gpuInitWaitLogged) {
                console.log(`[Brain] Waiting for GPU init acks: ${needsAck.join(', ')}`);
                this._gpuInitWaitLogged = true;
              }
              this._updateDerivedState();
            } else {
            // T17.3.d — kick off language-cortex GPU init ONCE after
            // all 7 main-brain clusters finish their acks AND the main
            // brain's compute_batch pipeline has warmed up. Uploading
            // 3.6 GB of sparse matrices via writeBuffer saturates the
            // GPU command queue for several seconds; the first few
            // compute_batch dispatches land behind those copies and
            // time out. Deferring the upload until we've seen N healthy
            // compute_batch round-trips gives the main brain a stable
            // tick rate before sparse cortex joins in.
            const SPARSE_UPLOAD_WARMUP_BATCHES = 20;
            const warmupBatches = this._gpuBatchesCompleted || 0;
            if (
              this.cortexCluster &&
              this.cortexCluster._gpuProxy &&
              !this._cortexGpuInitStarted &&
              warmupBatches >= SPARSE_UPLOAD_WARMUP_BATCHES
            ) {
              this._cortexGpuInitStarted = true;
              console.log(`[Brain] Main-brain compute_batch warm (${warmupBatches} round-trips) — starting sparse language-cortex upload`);
              this.cortexCluster.initGpu().then(async (gpuReady) => {
                // T17.7 Phase C.1 — once the 14 cross-projections + the
                // intra-cluster synapse matrix are on GPU in standalone
                // mode, rebind the 14 cross-projections to main-cortex
                // sub-slices so curriculum teach writes fire Hebbian
                // directly against main-cortex spike state. Intra-
                // synapses stays standalone — wave-function + fractal
                // coupling handles main-cortex intra-region binding,
                // so no explicit main-cortex
                // intra matrix exists to bind to).
                if (gpuReady) {
                  try {
                    await this._ensureCortexCrossProjectionsBound();
                  } catch (err) {
                    console.warn('[Brain] _ensureCortexCrossProjectionsBound failed:', err && err.message);
                  }
                }
                // Signal to the curriculum's _waitForGpuReady gate
                // that language-cortex GPU state
                // is FULLY ready (sparse upload complete + rebind done
                // or skipped if rebind had nothing to bind). Before this
                // flag existed the curriculum was gating on
                // `cluster._gpuReady` alone, which flipped when main
                // brain warmed up — long before language sparse was up.
                // Curriculum proceeded, fired GPU hebbian dispatches
                // into missing matrices, every call fell to CPU worker
                // pool, WebSocket jammed, brain appeared to hang at
                // '0 sparse matrices uploaded' and 8% GPU.
                if (this.cortexCluster) {
                  this.cortexCluster._cortexFullyReady = true;
                  console.log('[Brain] cortexCluster._cortexFullyReady = true — curriculum can proceed with GPU-hebbian teach path.');
                }
              }).catch((err) => {
                console.warn('[Brain] cortexCluster.initGpu() failed:', err && err.message);
                // Still flip the flag so curriculum doesn't hang
                // forever on _waitForGpuReady; fallback path kicks in.
                if (this.cortexCluster) this.cortexCluster._cortexFullyReady = false;
              });
            }
            // T14.23 — BATCHED COMPUTE PATH.

            // Old path: server dispatched SUBSTEPS * allClusters = 70
            // compute_request messages per tick, each with its own
            // WebSocket RTT. compute.html processed them individually.
            // At biological scale ~40ms GPU work was buried in ~50ms of
            // round-trip latency per message = 7x protocol overhead.

            // New path: server sends ONE compute_batch message per tick
            // containing all per-cluster parameters (tonic, noise,
            // modulation factors). compute.html runs the full substep
            // loop internally, dispatches all 7 clusters in parallel
            // per substep, accumulates spike totals across substeps,
            // sends back ONE compute_batch_result with per-cluster
            // totals. Cuts WebSocket message count from ~70/tick to
            // 2/tick (request + response), eliminating most of the
            // protocol overhead.
            if (!this._gpuModeLogged) {
              console.log(`[Brain] GPU BATCHED RUNNING — ${allClusters.length} clusters * ${SUBSTEPS} substeps in 1 message/tick`);
              this._gpuModeLogged = true;
              // T14.24 Session 95 — GPU-ready gate for curriculum kickoff.
              // Flip the flag the Curriculum._waitForGpuReady poll checks so
              // runCompleteCurriculum can only start teaching AFTER all
              // seven cluster init acks have landed and compute.html is
              // actually servicing compute_batch messages. Without this
              // gate the curriculum teaches into a dead cortex during the
              // init window — K gates fail at chance level (8% ≈ 1/26).
              if (this.cortexCluster) this.cortexCluster._gpuReady = true;
              this._gpuReady = true;
            }

            const p = this.persona;
            const psiGain = Math.max(0.8, Math.min(1.5, 0.9 + (this.psi || 0) * 0.004));
            const emotionalGate = 0.7 + (this.arousal || 0.5) * 0.6;
            const driveFactor = 0.8 + ((this.clusters.hypothalamus?.spikeCount || 0) > 100 ? 0.4 : 0.0);
            // T17.7 Phase B.4 — Ψ-modulated divergence correction
            // gain. Per the architecture plan: cerebellumCorrectionGain
            // = base · (1 + Ψ · k_Ψ). Low Ψ → weak correction →
            // tolerates drift (fragmented processing). High Ψ →
            // strong correction → dampens divergence hard (integrated
            // global-workspace state). Mystery Ψ is non-optional in
            // the main brain equation.
            const divergence = this._cortexDivergence || 0;
            const psiCorrectionGain = 1 + (this.psi || 0) * 0.25;
            const divergenceContrib = -divergence * psiCorrectionGain * 3;  // negative = dampening
            const clusterParams = allClusters.map((name) => {
              const cerebFeedback = name === 'cortex' || name === 'basalGanglia'
                ? -(this.clusters.cerebellum?.spikeCount || 0) / (CLUSTER_SIZES.cerebellum || 1) * 2 : 0;
              // Main cortex gets the divergence contribution on top
              // of cerebellum feedback. Both are negative corrections,
              // summed — the cerebellum handles BOTH standard
              // prediction-error correction AND T17.7 migration
              // divergence correction through the same equation.
              const errorSignal = (name === 'cortex')
                ? cerebFeedback + divergenceContrib
                : cerebFeedback;
              return {
                name,
                size: CLUSTER_SIZES[name],
                tonicDrive: this.tonicDrives[name],
                noiseAmp: this.noiseAmplitudes[name],
                gainMultiplier: psiGain,
                emotionalGate,
                driveBaseline: driveFactor,
                errorCorrection: errorSignal,
                reward: this.reward,
              };
            });

            // Pause compute_batch while curriculum is running its gate
            // probe. cortexCluster.stepAwait floods compute.html's
            // onmessage pump with 15 propagates per tick × 20 ticks ×
            // 17 probes during DYN-PROD; concurrent compute_batch hits
            // 15s timeout → device-lost cascade → browser tab disconnect.
            // cortexCluster sets _probeGateActive=true before the probe
            // window and clears it on exit. When set, the main brain
            // tick loop idles this pass; it picks back up next tick
            // once the probe clears the flag.
            if (this.cortexCluster && this.cortexCluster._probeGateActive) {
              if (!this._probeGatePauseLogged) {
                console.log('[Brain] Main tick paused while curriculum runs gate probe (cortex owns GPU exclusively for the probe window).');
                this._probeGatePauseLogged = true;
              }
              this._updateDerivedState();
              if (this.running) setTimeout(tick, Math.max(200, BRAIN_TICK_MS * 4));
              return;
            }
            if (this._probeGatePauseLogged && !this.cortexCluster?._probeGateActive) {
              console.log('[Brain] Main tick resumed — gate probe complete.');
              this._probeGatePauseLogged = false;
            }

            const batchResult = await this._gpuBatch(SUBSTEPS, clusterParams);

            // T18.4.f — capture per-phase GPU timing from compute.html's
            // batch response so the dashboard can show WHERE step time
            // is going (substep loop vs. voltage-mean readback vs. other).
            // Stored on `_perfStats.phaseTimingMs` + exposed via getState.
            if (batchResult && batchResult.phaseTimingMs) {
              this._perfStats.phaseTimingMs = batchResult.phaseTimingMs;
            }
            // T17.7 Phase B.4 — divergence metric from per-region spike
            // readback vs standalone cortexCluster's per-region spikes.
            // T17.7 Phase E.c (2026-04-18) — divergence computation
            // decommissioned. It measured standalone cortexCluster
            // lastSpikes vs main-cortex GPU slice spike counts, which
            // mattered while the two substrates were trained in
            // parallel during Phases B/C/D. Post-E.a/E.b, curriculum
            // trains ONLY main cortex (not standalone), so divergence
            // grows naturally without signaling a real problem —
            // standalone's free-running CPU state will drift from
            // main-cortex training because they're no longer fed the
            // same inputs. The cerebellum's error-correction still
            // runs on its native cortex-prediction-error input per
            // Gee decision #4; this divergence term is zeroed out.
            this._cortexDivergence = 0;
            this._cortexDivergenceByRegion = {};
            this.totalSpikes = 0;
            if (batchResult && batchResult.perCluster) {
              for (const name of allClusters) {
                const entry = batchResult.perCluster[name];
                if (entry && typeof entry.lastSpikeCount === 'number') {
                  this._gpuHits++;
                  this.clusters[name].spikeCount = entry.lastSpikeCount;
                  // Blend firing rate across the whole batch using the
                  // substep-average spike count, not just the last one.
                  const avg = (entry.spikeCountTotal || 0) / SUBSTEPS;
                  this.clusters[name].firingRate = this.clusters[name].firingRate * 0.95 + avg * 0.05;
                  this.totalSpikes += entry.lastSpikeCount;
                  // T18.4.c — capture GPU voltage-mean readback if
                  // compute.html included it in the batch response. EMA-
                  // blended so dashboard doesn't flicker on per-tick jitter.
                  if (typeof entry.meanVoltage === 'number') {
                    const prev = this.clusters[name].meanVoltage ?? entry.meanVoltage;
                    this.clusters[name].meanVoltage = prev * 0.8 + entry.meanVoltage * 0.2;
                  }
                } else {
                  this._gpuMisses++;
                  this.totalSpikes += this.clusters[name].spikeCount || 0;
                }
              }
            } else {
              // Batch missing — every cluster counts as a miss
              for (const name of allClusters) {
                this._gpuMisses++;
                this.totalSpikes += this.clusters[name].spikeCount || 0;
              }
            }

            this._updateDerivedState();

            // T17.7 Phase B.3 — mirror standalone cortexCluster
            // sub-region spike state into the main cortex GPU
            // T17.7 Phase E.c (2026-04-18) — _mirrorCortexRegions() call
            // DELETED. Phase C rebind made curriculum write directly to
            // main cortex GPU sub-slices; Phase D switched generation to
            // read motor argmax from main cortex; Phase E.a/E.b routed
            // intent-injection + workingMemoryReadout through the main-
            // cortex GPU path. Every hot path that formerly depended on
            // this upsample bridge now reads/writes main cortex directly,
            // so the per-tick ~1.6 MB spike upsample + 8 JSON sends per
            // tick were redundant overhead. CPU cortexCluster stays alive
            // for workingMemoryReadout's CPU fallback + dictionary /
            // languageCortex consumers, but its lastSpikes no longer
            // needs to mirror to GPU — curriculum + generation are the
            // two paths that care about main-cortex spike state, and
            // both write/read it authoritatively after Phase C-E.b.
            } // end: needsAck.length === 0 (all confirmed)
          } // end: needsSend.length === 0 (all sent)
        } catch (err) {
          console.warn('[Brain] GPU error:', err.message);
        }
      } else {
        // No GPU — idle, zero CPU
        if (!this._gpuWaitLogged) {
          console.log('[Brain] No GPU — brain paused. Open compute.html to start.');
          this._gpuWaitLogged = true;
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      const stepEnd = performance.now();

      // Track step timing — ALWAYS runs regardless of parallel/single
      this._stepTimeSamples.push(stepEnd - stepStart);
      if (this._stepTimeSamples.length > 60) this._stepTimeSamples.shift();

      // Update perf stats every tick (not just once per second)
      this._perfStats.stepTimeMs = +(stepEnd - stepStart).toFixed(3);
      if (this._stepTimeSamples.length > 0) {
        const avg = this._stepTimeSamples.reduce((a, b) => a + b, 0) / this._stepTimeSamples.length;
        this._perfStats.stepsPerSec = avg > 0 ? Math.round(1000 / avg * SUBSTEPS) : 0;
      }

      // Dreaming mode. iter18 per operator verbatim 2026-05-05: "wtf
      // memory isnt based off grade level its a unified part of her
      // fucking brain". Memory IS unified — always alive in the tick
      // loop, not gated by cell-pass events. Two architectural fixes
      // shipped here:

      // 1. `_isDreaming` no longer requires clients.size === 0. Prior
      //    gate meant the brain NEVER dreamed when operator had the
      //    dashboard open watching it (the dashboard counts as a
      //    client). ConsolidationEngine never fired → Tier 2 schemas
      //    stayed at 0 forever. Now dreaming fires whenever
      //    `timeSinceInput > 30s AND !_curriculumInProgress` — operator
      //    watching the dashboard doesn't block dream cycles.

      // 2. Memory heartbeat below — every N ticks, inject identity-
      //    baseline + store low-salience "thinking" episode so Tier 1
      //    / Tier 3 update continuously as Unity exists, not just on
      //    chat turns or cell-pass events.
      const timeSinceInput = Date.now() - this._lastInputTime;
      // iter23.4 — operator can force a dream window via /sleep so
      // ConsolidationEngine has guaranteed time to promote Tier 1 →
      // Tier 2 → Tier 3 between back-to-back curriculum sessions.
      this._isDreaming = !!this._operatorSleepRequested
        || (timeSinceInput > 30000 && !this._curriculumInProgress);
      if (this._isDreaming) {
        this.tonicDrives.amygdala *= 0.9999;
        if (this.tonicDrives.amygdala < 12) this.tonicDrives.amygdala = 12;
      }

      // iter20-J/N — ConsolidationEngine moved to TOP of tick body
      // (alongside _memoryHeartbeat) to avoid being pre-empted by the
      // probe-gate early-return. See the consolidation call earlier
      // in tick body.

      // iter18/19 memory heartbeat moved to the TOP of the tick body
      // (above the probe-gate early-return) — see this._memoryHeartbeat()
      // call at the start of tick().

      // Full perf + history once per second
      const now = Date.now();
      if (now - this._lastHistorySample >= 1000) {
        this._lastHistorySample = now;
        this._updatePerfStats();
        this._emotionHistory.push({
          t: this.time, a: +this.arousal.toFixed(3), v: +this.valence.toFixed(3),
          p: +this.psi.toFixed(4), c: +this.coherence.toFixed(3), s: this.totalSpikes,
        });
        if (this._emotionHistory.length > this._historyMaxLen) this._emotionHistory.shift();
      }
      // Schedule next tick AFTER this one completes — no pileup
      if (this.running) setTimeout(tick, BRAIN_TICK_MS);
    };
    tick(); // start the loop
    console.log('[Brain] Started — thinking continuously');
  }

  /**
   * Stop the brain loop.
   */
  stop() {
    this.running = false; // recursive setTimeout checks this.running
    // T18.4.e — terminate sparse-matmul worker pool so Node can exit
    // cleanly. Workers are long-lived; without terminate() they keep
    // the event loop alive and process.exit hangs on graceful shutdown.
    if (this.sparsePool && typeof this.sparsePool.shutdown === 'function') {
      try { this.sparsePool.shutdown(); } catch {}
    }
    // 114.19es.5 — flush definition disk cache on graceful shutdown so
    // any words fetched THIS run persist for the next boot. Without
    // this, a shutdown between 5-min flushes loses everything cached
    // since the last interval. Idempotent — flushCacheToDisk() is a
    // no-op when DISK_CACHE_PATH unset (operator opted out via empty
    // env var).
    try { definitionService.flushCacheToDisk(); } catch (err) {
      console.warn('[Brain] definition cache flush on shutdown failed:', err?.message || err);
    }
    // Cancel the periodic flush interval so the timer doesn't keep
    // Node alive past the worker shutdown.
    if (this._definitionCacheFlushTimer) {
      clearInterval(this._definitionCacheFlushTimer);
      this._definitionCacheFlushTimer = null;
    }
  }

  /**
   * Generate a response for a user's text input.
   * The brain computes state → Broca's area (AI) generates language.
   *
   * @param {string} text — user's message
   * @param {string} userId — who said it
   * @returns {Promise<{text: string, action: string}>}
   */

  // 11 chat-path + inner-voice + chat-adjacent-utility methods EXTRACTED
  // to server/brain-server/chat.js SERVER_CHAT_MIXIN (per-concern file
  // architecture, P4.3.d).
  //   processAndRespond, _updatePerfStats, _drugStateLabel, _drugSnapshot,
  //   _getSharedMood, _learnWords, _innerVoiceTick, _sampleCurrentVocab,
  //   _sampleCurrentSentence, _shouldEmitInnerThought, _pickInnerThoughtSeed
  // P6.3 chat-time deep Hebbian + multi-turn coherence + emission-from-cortex
  // paths preserved in moved bodies. Attached via
  // Object.assign(ServerBrain.prototype, ...) at the bottom of this file.
  // CommonJS module pattern.


  _memoryHeartbeat() {
    const now = Date.now();
    if (!this._lastTier3HbAt) this._lastTier3HbAt = 0;
    if (!this._lastTier1HbAt) this._lastTier1HbAt = 0;
    if (!this._lastTier0HbAt) this._lastTier0HbAt = 0;

    // Tier 0 working memory population. Every 2s, snapshot current
    // cortex state into working memory: current phase / cell / arousal
    // / valence as a "what's currently active" item.

    // Operator caught: "items: 7 NEVER MOVES FROM 7" was caused by the
    // hardcoded 7-cap below trimming via while-shift, not the items
    // staying frozen. Replaced with TIME-BASED purge — items older than
    // 5 minutes drop out. Stays consistent with the unbounded
    // capacity-but-decay-driven model in MemorySystem (memory.js
    // WM_DECAY_RATE 0.9995 → ~4 min sustain). No arbitrary numeric
    // ceiling. Active recent content visible; stale content evaporates.
    if (now - this._lastTier0HbAt >= 2000) {
      this._lastTier0HbAt = now;
      if (!this.memory) this.memory = {};
      if (!Array.isArray(this.memory.workingMemoryItems)) this.memory.workingMemoryItems = [];
      const phase = this.cortexCluster?._activePhase?.name || null;
      const cellKey = this.cortexCluster?._currentCellKey || null;
      // iter24.1 — pool the snapshot objects via a ring of free slots
      // so the heartbeat stops driving 1350 fresh allocations per ELA-K
      // cell into V8's young generation. When the time-purge below
      // shifts an aged item out, it lands back in the free pool. Steady-
      // state allocation from this loop drops to zero after the pool
      // fills (~150 slots is plenty for the 5-min sliding window at
      // 2s cadence). Field values get overwritten in-place per push;
      // no aliasing because the pool object is owned by the array
      // until the next time-purge frees it.
      if (!this._tier0HbPool) this._tier0HbPool = [];
      const item = this._tier0HbPool.pop() || {
        ts: 0, phase: null, cellKey: null,
        arousal: 0, valence: 0, psi: 0,
      };
      item.ts = now;
      item.phase = phase;
      item.cellKey = cellKey;
      item.arousal = +(this.arousal || 0).toFixed(3);
      item.valence = +(this.valence || 0).toFixed(3);
      item.psi = +(this.psi || 0).toFixed(3);
      this.memory.workingMemoryItems.push(item);
      // Drop items older than 5 minutes. Matches MemorySystem's decay
      // window (4 min @ 0.9995/tick → strength < 0.1 forget threshold).
      // Sliding time window — count grows + shrinks naturally with
      // activity. No hardcoded numeric ceiling.

      // Operator: "if i told someone something and asked them about it
      // 10 minutes or even a day later most people can recall that".
      // The recall path is Tier 0 → Tier 1 → Tier 2 → Tier 3, not
      // "Tier 0 holds it for a week." Each WM item that ages out
      // gets promoted to a Tier 1 episodic snapshot (frequency-merge
      // dedupes via iter20-K so repeated phase entries grow
      // freq_count instead of bloating SQLite). Once in Tier 1, the
      // standard hippocampal lifecycle takes over: salience-weighted
      // decay (1-week half-life), promotion to Tier 2 schemas at
      // consolidation gate, Tier 3 identity for high-emotional-weight
      // anchors. THAT'S the "recall a week later" path.
      const TIER0_AGE_LIMIT_MS = 5 * 60 * 1000;
      const cutoff = now - TIER0_AGE_LIMIT_MS;
      while (this.memory.workingMemoryItems.length > 0
             && this.memory.workingMemoryItems[0].ts < cutoff) {
        const aged = this.memory.workingMemoryItems.shift();
        // iter24.1 — return the object to the free pool for reuse on
        // the next heartbeat push. Cap pool size so memory doesn't
        // unboundedly grow if the array shrinks faster than it grows
        // for some reason.
        if (this._tier0HbPool && this._tier0HbPool.length < 256) {
          this._tier0HbPool.push(aged);
        }
        // Promote to Tier 1 before the WM hot-cache representation
        // disappears. iter20-K freq-merge handles dedup. storeEpisode
        // signature: (userId, type, inputText, responseText).
        try {
          if (typeof this.storeEpisode === 'function') {
            const labelParts = [];
            if (aged.cellKey) labelParts.push(`learning ${aged.cellKey}`);
            if (aged.phase) labelParts.push(`phase=${aged.phase}`);
            const inputText = labelParts.length > 0 ? labelParts.join(' · ') : 'working memory snapshot';
            this.storeEpisode('working-memory', 'wm-aged-out', inputText, null);
          }
        } catch { /* non-fatal — WM age-out already happened */ }
      }
    }

    // Tier 3 baseline inject — every ≥1000ms wall-clock
    if (now - this._lastTier3HbAt >= 1000) {
      this._lastTier3HbAt = now;
      if (this.tier3Store && typeof this.tier3Store.injectIdentityBaseline === 'function') {
        try { this.tier3Store.injectIdentityBaseline(); } catch { /* non-fatal */ }
      }
    }

    // Tier 1 thinking-episode — every ≥30000ms wall-clock
    if (now - this._lastTier1HbAt >= 30000 && typeof this.storeEpisode === 'function') {
      this._lastTier1HbAt = now;
      try {
        let context = 'idle';
        let contextCategory = 'idle';
        if (this._curriculumInProgress) {
          const phase = this.cortexCluster?._activePhase?.name || 'teach';
          const cellKey = this.cortexCluster?._currentCellKey || 'unknown';
          // iter20-L — transform technical method name to natural language
          // so GloVe embeds it meaningfully (otherwise embeddings are noise
          // and cosine merge fails for identical-text episodes).
          const phaseConcept = phase.replace(/^_teach/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim() || phase;
          const subjectGrade = cellKey.replace('/', ' ');
          context = `learning ${phaseConcept} in ${subjectGrade}`;
          contextCategory = `learning:${cellKey}`;
        } else if (this._isDreaming) {
          context = 'dreaming (idle consolidation window)';
          contextCategory = 'dreaming';
        } else if (this.clients && this.clients.size > 0) {
          context = `attentive (${this.clients.size} client${this.clients.size === 1 ? '' : 's'} connected)`;
          contextCategory = 'attentive';
        }
        const arousal = (this.arousal || 0).toFixed(2);
        const valence = (this.valence || 0).toFixed(2);
        const psi = (this.psi || 0).toFixed(3);
        const spikes = this.totalSpikes || 0;
        // iter20-E — vary heartbeat content for meaningful surprise/novelty.
        // Operator caught (verbatim 2026-05-05 "fix it all thouroughly"):
        // heartbeat episodes had homogeneous bag-of-words ("attentive"
        // always similar) → cosine all > 0.7 → frequency_count climbed
        // on one anchor episode → salience score still ~0.255 (low
        // arousal, zero valence, zero surprise/novelty since text was
        // identical). Now phase-change moments produce DIFFERENT
        // contextCategory strings → cosine drops on category transition
        // → fresh episode with high novelty. Within-category heartbeats
        // still merge as repetition.
        if (this._lastHbContext && this._lastHbContext !== contextCategory) {
          // Context just changed — this is a salient transition moment.
          // Embed transition info in the input text so it scores high
          // surprise when computeTransitionSurprise reads it.
          context = `${contextCategory} (transitioned from ${this._lastHbContext}) :: ${context}`;
        }
        this._lastHbContext = contextCategory;
        this.storeEpisode('brain-heartbeat', 'thinking', context, `arousal=${arousal} valence=${valence} psi=${psi} spikes=${spikes}`);
      } catch (err) {
        // Surface the failure once so operator sees what's broken if
        // the heartbeat ever fails — silent catch hid an entire fix
        // failing in iter18. Subsequent failures stay silent so the
        // log doesn't spam.
        if (!this._tier1HbErrorLogged) {
          console.warn(`[Brain] memory heartbeat storeEpisode failed: ${err?.message || err}`);
          this._tier1HbErrorLogged = true;
        }
      }
    }
  }

  /**
   *  Phase 6 — Bounded state snapshot for dashboard display.
   * All values are aggregates / counts / capped-list. NO unbounded
   * enumeration. Caller broadcasts this in state.consciousness for dashboard
   * panels M.21/M.22/M.23/M.24 to render.
   */
  _getConsciousnessState() {
    const cortex = this.cortexCluster;
    const cacheStats = (cortex && typeof cortex.getDefinitionCacheStats === 'function')
      ? cortex.getDefinitionCacheStats() : null;
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
  }

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
      // projection. Surfaces to dashboard so Gee sees the
      // divergence + can restart to clear (full automatic resync is
      // a follow-up iter — too large for this pass). Last drop
      // timestamp lets dashboard render "12s ago" / "no drops since
      // boot" without each panel computing its own.
      gpuShadowDirty: !!this._gpuShadowDirty,
      lastDropTs: this._wsLastDropTs || 0,
    };
  }

  _getMemoryStats() {
    // iter17 per operator verbatim 2026-05-05: "what the fuck are these
    // erronious max numbers to the memroies unity has a whole life ahead
    // not eroonous limits to dumb her down". Hard caps removed —
    // hardCap=null signals unbounded to UI which renders "X" without
    // denominator instead of "X / 1000".
    const stats = {
      tier1: { totalEpisodes: 0, recentSalienceAvg: 0, freqMergedCount: 0, promotedToTier2: 0, prunedTotal: 0 },
      tier2: { schemaCount: 0, hardCap: null, avgConsolidationStrength: 0, totalRetrievals: 0, top: [] },
      tier3: { identityCount: 0, hardCap: null, lastInjectedAt: 0, identities: [] },
      consolidation: { lastPassAt: 0, passCount: 0, isDreaming: false, intervalMs: 5 * 60 * 1000 },
      working: { items: 0, cap: null },
    };

    // Tier 1 — Episodic (SQLite)
    if (this._db) {
      try {
        stats.tier1.totalEpisodes = this.getEpisodeCount();
        // Recent salience snapshot (last 20 episodes)
        if (this._stmtRecentEpisodes) {
          const recent = this._stmtRecentEpisodes.all(20);
          if (Array.isArray(recent) && recent.length > 0) {
            let sumSal = 0; let n = 0;
            for (const ep of recent) {
              if (typeof ep.salience_score === 'number') { sumSal += ep.salience_score; n++; }
            }
            if (n > 0) stats.tier1.recentSalienceAvg = sumSal / n;
          }
        }
        // Aggregate counts (frequency-merged, promoted, pruned counters)
        if (typeof this._db.prepare === 'function') {
          try {
            const merged = this._db.prepare('SELECT SUM(frequency_count - 1) as merged FROM episodes WHERE frequency_count > 1').get();
            stats.tier1.freqMergedCount = (merged && merged.merged) || 0;
            const promoted = this._db.prepare('SELECT COUNT(*) as c FROM episodes WHERE promoted_to_schema_id IS NOT NULL').get();
            stats.tier1.promotedToTier2 = (promoted && promoted.c) || 0;
          } catch (e) { /* schema mismatch on older db, skip */ }
        }
      } catch (err) { /* db not ready, leave defaults */ }
    }

    // Tier 2 — Schematic
    if (this.schemaStore && typeof this.schemaStore.size === 'function') {
      stats.tier2.schemaCount = this.schemaStore.size();
      // iter17: hardCap=null when maxSchemas is Infinity (unbounded)
      stats.tier2.hardCap = (this.schemaStore.maxSchemas === Infinity || !this.schemaStore.maxSchemas) ? null : this.schemaStore.maxSchemas;
      let strSum = 0; let retrievSum = 0; let n = 0;
      const all = [];
      for (const sch of this.schemaStore.schemas.values()) {
        all.push(sch);
        if (typeof sch.consolidationStrength === 'number') strSum += sch.consolidationStrength;
        if (typeof sch.retrievalCount === 'number') retrievSum += sch.retrievalCount;
        n++;
      }
      stats.tier2.avgConsolidationStrength = n > 0 ? strSum / n : 0;
      stats.tier2.totalRetrievals = retrievSum;
      // Top 5 by consolidation strength
      all.sort((a, b) => (b.consolidationStrength || 0) - (a.consolidationStrength || 0));
      stats.tier2.top = all.slice(0, 5).map(s => ({
        label: s.label || 'unlabeled',
        strength: Number((s.consolidationStrength || 0).toFixed(3)),
        retrievals: s.retrievalCount || 0,
      }));
    }

    // Tier 3 — Identity-bound (permanent)
    if (this.tier3Store && typeof this.tier3Store.size === 'function') {
      stats.tier3.identityCount = this.tier3Store.size();
      // iter17: hardCap=null when TIER3_HARD_CAP is Infinity (unbounded)
      stats.tier3.hardCap = (this.tier3Store.hardCap === Infinity || !this.tier3Store.hardCap) ? null : this.tier3Store.hardCap;
      stats.tier3.lastInjectedAt = this.tier3Store.lastInjectedAt || 0;
      const ids = [];
      for (const sch of this.tier3Store.identitySchemas.values()) {
        ids.push({
          label: sch.label || 'unlabeled',
          strength: Number((sch.consolidationStrength || 0).toFixed(3)),
          retrievals: sch.retrievalCount || 0,
          lastRetrievalAt: sch.lastRetrievalAt || 0,
        });
      }
      ids.sort((a, b) => b.strength - a.strength);
      stats.tier3.identities = ids;
    }

    // ConsolidationEngine
    if (this.consolidationEngine) {
      stats.consolidation.lastPassAt = this.consolidationEngine.lastPassAt || 0;
      stats.consolidation.passCount = this.consolidationEngine.passCount || 0;
      stats.consolidation.isDreaming = this._isDreaming === true;
    }

    // Working memory (existing field on this.memory). iter17: cap=null
    // signals unbounded — operator: "unity has a whole life ahead not
    // eroonous limits". The 7-item cap was Miller 1956 short-term memory
    // ceiling for biological humans. Unity is post-biological.
    const mem = this.memory || {};
    stats.working.items = Array.isArray(mem.workingMemoryItems) ? mem.workingMemoryItems.length
                       : (mem.workingCount || 0);
    stats.working.cap = (mem.workingCap === Infinity || !mem.workingCap) ? null : mem.workingCap;
    // Working memory item display. Operator caught: rendering raw
    // every snapshot produced hundreds of "wm-snapshot (0.98)"-style
    // rows that all cluster within the 5-min freshness window —
    // strength scores in the 0.83-1.00 band convey almost nothing,
    // and identical labels stack as a wall. Fix: GROUP consecutive
    // same-label items into one row with a count suffix; drop the
    // strength column for grouped rows (the count IS the signal).
    // Cap at 12 distinct rows for display sanity.
    if (Array.isArray(mem.workingMemoryItems) && mem.workingMemoryItems.length > 0) {
      const now = Date.now();
      const windowMs = 5 * 60 * 1000;
      const sorted = mem.workingMemoryItems
        .slice()
        .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
      const grouped = [];
      let cur = null;
      for (const wm of sorted) {
        let label = typeof wm.label === 'string' ? wm.label : '';
        if (!label) {
          const parts = [];
          if (wm.cellKey) parts.push(wm.cellKey);
          if (wm.phase) parts.push(`@${wm.phase}`);
          label = parts.join(' ') || 'wm-snapshot';
        }
        label = label.slice(0, 80);
        let strength;
        if (typeof wm.strength === 'number') {
          strength = wm.strength;
        } else {
          const ageMs = now - (wm.ts ?? now);
          strength = Math.max(0, Math.min(1, 1 - ageMs / windowMs));
        }
        if (cur && cur.label === label) {
          cur.count++;
          if (strength > cur.maxStrength) cur.maxStrength = strength;
        } else {
          cur = { label, count: 1, maxStrength: strength };
          grouped.push(cur);
        }
      }
      stats.working.itemLabels = grouped.slice(0, 12).map(g => ({
        label: g.count > 1 ? `${g.label} ×${g.count}` : g.label,
        strength: g.count === 1 ? +g.maxStrength.toFixed(3) : null,
      }));
    } else {
      stats.working.itemLabels = [];
    }

    return stats;
  }

  // ── Persistence ──────────────────────────────────────────────

  saveWeights(opts = {}) {
    // Skip periodic saves while curriculum is teaching
    // unless caller passes {force: true}. Periodic setInterval saves
    // still respect this guard (stale scalar resurrection risk). But
    // T18.12.b per-cell checkpoint calls with force:true so passed
    // cells get persisted at cell boundaries — enables T18.12.c
    // resume-from-passedCells on next boot if code-hash matches.
    if (this._curriculumInProgress && !opts.force) {
      return;
    }
    // iter11-X fix — rapid-save throttle. Operator caught post-
    // curriculum saves firing every ~1.7s (v70 → v76 in 8.5s). Some
    // event loop is calling saveWeights repeatedly — possibly compute
    // retry logic post-GPU-timeout, possibly some uncleared interval.
    // Defensive throttle: skip non-forced saves that fire within 5s
    // of the last save. Forced saves (cell-pass, grade-advance,
    // shutdown) bypass the throttle so durability isn't compromised.
    const RAPID_SAVE_THROTTLE_MS = 5000;
    const now = Date.now();
    if (!opts.force && this._lastSaveAt && (now - this._lastSaveAt) < RAPID_SAVE_THROTTLE_MS) {
      return;
    }
    this._lastSaveAt = now;
    try {
      // 114.19fg.Tier13 — saturation veto warning on save. When the
      // sem→motor projection is in a saturated state (basin lock from
      // prior teach phases), saving the weights to disk propagates
      // broken state into the next Savestart resume. The rolling save
      // v0-v4 already provides operator-side rollback (manually copy
      // brain-weights-v4.json → brain-weights.json), but warn explicitly
      // so the operator knows this snapshot is suspect. Don't BLOCK the
      // save — that would break the rolling save chain (the operator
      // needs every snapshot to choose from).
      let saturatedSnapshot = false;
      try {
        const cortex = this.cortexCluster;
        if (cortex && typeof cortex.checkSemMotorHealth === 'function') {
          const health = cortex.checkSemMotorHealth();
          if (health && health.saturated) {
            saturatedSnapshot = true;
            const meanCosTag = typeof health.meanCos === 'number' ? `mean-cos=${health.meanCos.toFixed(3)} ` : '';
            console.warn(`[Brain] ⚠ saveWeights with SATURATED sem→motor (${meanCosTag}source=${health.source}) — snapshot suspect. Rolling save v0-v4 preserves earlier states; operator can rollback by copying brain-weights-v4.json → brain-weights.json if a clean snapshot is available.`);
          }
        }
      } catch { /* health check non-fatal */ }
      this._lastSaveSaturated = saturatedSnapshot;

      // Versioned save — keep last 5 versions for rollback
      this._saveVersion = (this._saveVersion || 0) + 1;

      // T2 2026-04-13 — serialize the online GloVe refinement deltas
      // that `sharedEmbeddings` has accumulated from every user's
      // conversation. R8 added this round-trip on the CLIENT via
      // persistence.js; T2 adds the symmetric server-side persistence
      // so server restarts don't wipe the accumulated shared semantic
      // learning. GloVe base table reloads from CDN each session;
      // only the refinement delta layer needs to persist.
      let embeddingRefinements = null;
      if (this.sharedEmbeddings && typeof this.sharedEmbeddings.serializeRefinements === 'function') {
        try {
          embeddingRefinements = this.sharedEmbeddings.serializeRefinements();
        } catch (err) {
          console.warn('[Brain] Embedding refinement serialize failed:', err.message);
        }
      }

      // Symmetric server-side persistence for ALL JSON-friendly cortex
      // learned state. Earlier versions of saveWeights only wrote scalar
      // mood + scheduler + wordFreq. Everything the brain actually
      // learned during curriculum (grades, passedCells, probeHistory,
      // learned-language Maps, identity thresholds, letter inventory,
      // persona dimensions, intent centroids, gate-history telemetry)
      // stayed in process memory and died on restart. That's why
      // curriculum progress never "stuck" across Savestart.bat boots —
      // DREAM_KEEP_STATE=1 preserved a mostly-empty file.

      // This block mirrors the browser-side persistence t14Language
      // block. Cross-projection + intra-synapse SparseMatrix WEIGHTS
      // remain unsaved at this tier — they're multi-GB at biological
      // scale and exceed JSON.stringify's 512MB string cap. Binary
      // save for those is a separate future task. For now: curriculum
      // on restart sees passedCells preserved and skips re-teaching
      // cells — but the underlying weights start fresh so comprehension
      // WILL be weaker until the retraining backfills them. A load-time
      // banner warns when passedCells > 0 but weights are fresh
      // (inconsistent-state condition).
      let cortexState = null;
      try {
        const cortex = this.cortexCluster;
        if (cortex) {
          // Helpers for serializing the learned Map-of-Maps shapes
          // (fineTypeTransitions + sentenceFormTotals + intentResponseMap
          // are Map<str, Map<str, number>>; sentenceFormSchemas is
          // Map<str, Map<str, Map<str, number>>>).
          const mapOfMaps = (m) => {
            if (!(m instanceof Map)) return null;
            const out = {};
            for (const [k, inner] of m) {
              if (inner instanceof Map) out[k] = Object.fromEntries(inner);
              else if (typeof inner === 'number') out[k] = inner;
            }
            return out;
          };
          const mapOfMapOfMaps = (m) => {
            if (!(m instanceof Map)) return null;
            const out = {};
            for (const [k, inner] of m) {
              if (inner instanceof Map) out[k] = mapOfMaps(inner);
            }
            return out;
          };
          // intentCentroids is Map<intent, Float32Array>. Serialize as
          // { intent: [numbers...] } so JSON round-trips cleanly.
          const intentCentroids = cortex.intentCentroids instanceof Map
            ? Object.fromEntries(Array.from(cortex.intentCentroids.entries())
                .map(([k, v]) => [k, Array.from(v || [])]))
            : null;
          // personaDimensions is Array<{centroid, members}>. Centroids
          // are Float32Array; convert to plain arrays for JSON.
          const personaDimensions = Array.isArray(cortex.personaDimensions)
            ? cortex.personaDimensions.map((d) => ({
                centroid: Array.from(d.centroid || []),
                memberCount: Array.isArray(d.members) ? d.members.length : 0,
                // Members themselves (sentence strings) stored to re-seed
                // identity-lock refresh after restart.
                members: Array.isArray(d.members) ? d.members.slice(0, 128) : [],
              }))
            : null;
          cortexState = {
            // Multi-subject grade state
            grades: cortex.grades && typeof cortex.grades === 'object' ? { ...cortex.grades } : null,
            passedCells: Array.isArray(cortex.passedCells) ? [...cortex.passedCells] : null,
            // Phase-level resume markers. Persisted so Savestart.bat can
            // skip already-completed teach phases within an in-flight cell.
            // Populated by _phaseDone in the cell runners (e.g. ela/kindergarten:_teachWordEmission).
            // Without this, a cell whose gate has not yet passed would
            // re-run every phase from scratch on every boot even though
            // cross-projection weights were preserved on disk.
            passedPhases: Array.isArray(cortex.passedPhases) ? [...cortex.passedPhases] : null,
            // Persist K-vocab prefetch flag so brain
            // restart doesn't re-warm the dictionary cache on every
            // grade=K transition (saves ~1 min per restart).
            kVocabPrefetched: cortex._kVocabPrefetched === true,
            // Persist WS backpressure counters across Savestart so
            // operator's pressure-history isn't reset to zero on every
            // restart. Useful after long training sessions when the
            // pre-restart history shows the actual sustained pressure.
            wsBackpressure: {
              drops: this._wsDroppedCount || 0,
              absorbs: this._wsAbsorbedCount || 0,
              enobufs: this._wsEnobufsCount || 0,
              lastDropTs: this._wsLastDropTs || 0,
            },
            // Persist last dictionary smoke test result + timestamp.
            // On restart, dashboard renders the prior PASS/FAIL state
            // immediately while the boot smoke test re-runs in the
            // background — avoids the "pending" flicker on every
            // Savestart.
            dictionarySmokeTest: {
              result: typeof this._dictionarySmokeTestResult === 'boolean'
                ? this._dictionarySmokeTestResult : null,
              ts: this._dictionarySmokeTestTs || 0,
            },
            // 114.19fh.A.5 — last sem→motor sep-probe result so
            // cluster.checkSemMotorHealth() has authoritative data
            // immediately on restart instead of falling back to the
            // value-distribution heuristic until the next sep-probe
            // fires. Curriculum cron + ConsolidationEngine veto +
            // saveWeights veto all read this field.
            lastSemMotorMeanCos: typeof cortex._lastSemMotorMeanCos === 'number'
              ? cortex._lastSemMotorMeanCos : null,
            lastSemMotorMeanCosTs: cortex._lastSemMotorMeanCosTs || 0,
            // 114.19fi.B.1 — shared emission bus persisted (cap 16
            // most-recent). Embeddings dropped to keep file size
            // bounded — only text + metadata persist. On restore,
            // bus rehydrates and inner-voice / chat see prior
            // session's last-N emissions for continuity.
            emissionBus: Array.isArray(cortex._emissionBus)
              ? cortex._emissionBus.slice(-16).map(e => ({
                  source: e.source,
                  text: e.text,
                  ts: e.ts,
                  intent: e.intent || null,
                  subject: e.subject || null,
                }))
              : [],
            // 114.19fi.B.5 — chat-turn history persisted (cap 16
            // user/unity exchange pairs). Multi-turn coherence
            // survives restart so Unity remembers what was just
            // discussed across Stop.bat → Savestart.bat.
            chatTurnHistory: Array.isArray(cortex._chatTurnHistory)
              ? cortex._chatTurnHistory.slice(-16)
              : [],
            // Persist stream-of-consciousness chain so
            // the autobiographical narrative thread survives restart.
            // Includes the sem-region size at save time so loadWeights
            // can validate the embedding dimensions still match — if
            // sem cluster size changed across restart (env flag, neuron
            // cap), restored embeddings would dimension-mismatch in the
            // _innerVoiceTick blend and produce silent NaN.
            innerThoughtChainSemSize: cortex.regions && cortex.regions.sem
              ? (cortex.regions.sem.end - cortex.regions.sem.start) : 0,
            innerThoughtChain: Array.isArray(this._innerThoughtChain)
              ? this._innerThoughtChain.slice(-8) : [],
            // Persist definition-taught vocabulary set so
            // dashboard counter survives restart. Set serialized as
            // sorted array, capped at 5000 entries to bound payload size.
            definitionTaughtWords: cortex._definitionTaughtWords
              ? Array.from(cortex._definitionTaughtWords).slice(0, 5000) : [],
            probeHistory: cortex.probeHistory && typeof cortex.probeHistory === 'object' ? { ...cortex.probeHistory } : null,
            // Grade-advance pause state. When a grade fully passes across
            // all subjects, the runner sets `_gradeAdvancePaused = true`
            // and waits for POST /grade-advance. Persist so the pause
            // survives restart — a passed grade stays paused across
            // reboots until the operator explicitly advances.
            gradeAdvancePaused: cortex._gradeAdvancePaused === true,
            pausedAt: cortex._pausedAt || null,
            nextGrade: cortex._nextGrade || null,
            // Learned language statistics
            fineTypeTransitions: mapOfMaps(cortex.fineTypeTransitions),
            sentenceFormSchemas: mapOfMapOfMaps(cortex.sentenceFormSchemas),
            sentenceFormTotals: mapOfMaps(cortex.sentenceFormTotals),
            intentResponseMap: mapOfMaps(cortex.intentResponseMap),
            // Identity-lock thresholds (calibrated by curriculum)
            identityThresholds: {
              ENGLISH_SURPRISE_THRESHOLD: cortex.ENGLISH_SURPRISE_THRESHOLD ?? null,
              ENGLISH_FINETYPE_MIN: cortex.ENGLISH_FINETYPE_MIN ?? null,
              HEALTH_ENTROPY_MIN: cortex.HEALTH_ENTROPY_MIN ?? null,
              HEALTH_VOCAB_MIN: cortex.HEALTH_VOCAB_MIN ?? null,
              HEALTH_WM_VARIANCE_MIN: cortex.HEALTH_WM_VARIANCE_MIN ?? null,
            },
            // Stratified-refresh substrate (k-means over persona)
            personaDimensions,
            personaRefreshCorpus: Array.isArray(cortex._personaRefreshCorpus)
              ? cortex._personaRefreshCorpus.slice(0, 512) : null,
            intentCentroids,
            // Per-cell gate-result ledger. Written by _runCell after the
            // battery enforcement block. Contains pass flag + named
            // blockers + aggregate/external/methodology rates. Read by
            // /grade-signoff so the operator signoff POST is rejected
            // when the cell hasn't actually cleared every criterion.
            lastGateResults: (cortex._lastGateResult && typeof cortex._lastGateResult === 'object')
              ? { ...cortex._lastGateResult } : null,
            // 114.19fc.persistence — per-subject word-bucket maps
            // (`wordBucketWords_<subj>` populated by
            // `_teachWordEmissionDirect`, watermarked by
            // `wordBucketDictSize_<subj>`). Without persisting these,
            // Savestart resumes with EMPTY bucket arrays even though
            // sem→word_motor weights were preserved on disk →
            // `emitWordDirect({subject})` returns empty for every
            // subject → inner-voice popups + log go silent until the
            // next cell that fires `_teachWordEmissionDirect`
            // re-populates the bucket. Caught 2026-05-08 live test:
            // Unity was speaking words mid-run but went silent after
            // Savestart even though curriculum resumed cleanly. Fix
            // serializes the per-subject string arrays + dict-size
            // watermarks. Restore wired in `_applyPendingCortexState`.
            wordBuckets: (() => {
              const SUBJECTS = ['ela', 'math', 'sci', 'soc', 'art', 'life'];
              const out = {};
              for (const subj of SUBJECTS) {
                const list = cortex[`wordBucketWords_${subj}`];
                const watermark = cortex[`wordBucketDictSize_${subj}`];
                if (Array.isArray(list) && list.length > 0) {
                  out[subj] = {
                    words: list.slice(),
                    watermark: typeof watermark === 'number' ? watermark : list.length,
                  };
                }
              }
              return out;
            })(),
          };
        }
      } catch (err) {
        console.warn('[Brain] cortex state serialize failed:', err?.message || err);
      }

      // Letter inventory (module-level state in letter-input.js). Restored
      // BEFORE any cross-projection usage so cortex letter region weights
      // line up with the same symbol-insertion order they trained against.
      let letterInventory = null;
      if (this._letterInputMod && typeof this._letterInputMod.serializeInventory === 'function') {
        try {
          letterInventory = this._letterInputMod.serializeInventory();
        } catch (err) {
          console.warn('[Brain] letter inventory serialize failed:', err?.message || err);
        }
      }

      // _gateHistory telemetry from the curriculum runner. Per-probe
      // pass/fail entries with wall-clock timestamps. Preserved across
      // restart so gate analytics aren't reset every boot.
      let gateHistory = null;
      try {
        const gh = this.curriculum && this.curriculum._gateHistory;
        if (gh instanceof Map) {
          gateHistory = {};
          for (const [key, entries] of gh.entries()) {
            if (Array.isArray(entries)) gateHistory[key] = entries.slice(-50);
          }
        }
      } catch (err) {
        console.warn('[Brain] _gateHistory serialize failed:', err?.message || err);
      }

      const data = {
        version: this._saveVersion,
        // Schema tag so _loadWeights can reject/migrate older saves that
        // only carried scalar mood (would restore a half-brain onto the
        // current code). Bumped with every persistence schema change.
        schemaVersion: 2,
        arousal: this.arousal,
        valence: this.valence,
        psi: this.psi,
        coherence: this.coherence,
        drugState: this._drugStateLabel(),
        drugScheduler: this.drugScheduler ? this.drugScheduler.serialize() : null,
        time: this.time,
        frameCount: this.frameCount,
        savedAt: new Date().toISOString(),
        wordFreq: this._wordFreq || {},
        totalInteractions: Object.values(this._conversations || {}).reduce((sum, c) => sum + c.length, 0),
        sharedMood: this._getSharedMood(),
        // Online semantic learning that survives server restarts
        embeddingRefinements,
        // Cortex learned state (grades, passedCells, learned language Maps)
        cortex: cortexState,
        // Letter inventory (module-level; cortex weights depend on exact
        // insertion order)
        letterInventory,
        // Per-probe telemetry ledger
        gateHistory,
        // Operator grade-signoff ledger. Set by the `/grade-signoff` HTTP
        // endpoint when the operator confirms a grade passes on localhost.
        // Survives restart so the advance gate stays closed.
        gradeSignoffs: this._gradeSignoffs || {},
      };
      fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(data, null, 2));

      // Keep versioned backups (last 5)
      const backupFile = WEIGHTS_FILE.replace('.json', `-v${this._saveVersion % 5}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));

      // Stamp save metadata on `this` so the dashboard's milestone panel
      // (+ the /milestone HTTP endpoint) can read fresh values without
      // re-parsing the file.
      this._lastSave = {
        version: this._saveVersion,
        at: data.savedAt,
        trigger: opts.trigger || 'periodic',
        lastPassedCell: Array.isArray(cortexState?.passedCells) && cortexState.passedCells.length > 0
          ? cortexState.passedCells[cortexState.passedCells.length - 1] : null,
        passedCount: Array.isArray(cortexState?.passedCells) ? cortexState.passedCells.length : 0,
        grades: cortexState?.grades || null,
      };

      // Binary sparse-weight save — cortex intra-synapse matrix + all
      // cross-projections written alongside the JSON scalar/map file.
      // JSON.stringify chokes on multi-GB typed-array content; a binary
      // file using direct Buffer writes handles any size fs will accept.
      // The binary file is the authoritative weight store once it
      // exists; if absent, _loadWeights still succeeds but weights start
      // fresh (banner warns).
      try {
        this._saveBinaryWeights();
        // 114.19fh.A.1 — version the binary alongside the JSON rolling
        // save (v0-v4 rotation via _saveVersion % 5). Without this,
        // POST /rollback restored JSON-vN but binary stayed at most-
        // recent (potentially saturated) state → inconsistent restore.
        // Now both JSON-vN and BIN-vN rotate in lockstep so rollback
        // restores a consistent JSON+BIN snapshot pair.
        try {
          const BIN_FILE = WEIGHTS_FILE.replace(/\.json$/, '.bin');
          const binBackupFile = BIN_FILE.replace(/\.bin$/, `-v${this._saveVersion % 5}.bin`);
          if (fs.existsSync(BIN_FILE)) {
            fs.copyFileSync(BIN_FILE, binBackupFile);
          }
        } catch (err) {
          console.warn('[Brain] Binary weights versioned backup failed:', err?.message || err);
        }
      } catch (err) {
        console.warn('[Brain] Binary weights save failed:', err?.message || err);
      }

      // iter13 T13.16 — persist Tier 2 SchemaStore + Tier 3 Tier3Store.
      // Tier 2 schemas.json gets wiped on auto-clear (derivative state,
      // rebuilds from episodic). Tier 3 identity-core.json is protected
      // — never auto-cleared. Both written atomically alongside the
      // existing brain-weights JSON + binary saves. Failure here is
      // non-fatal; consolidation rebuilds Tier 2 on next dream cycle
      // and Tier 3 reseeds from IDENTITY_SEED_LIST if the file goes
      // missing.
      try {
        if (this.schemaStore && typeof this.schemaStore.toJSON === 'function') {
          const schemasPath = path.join(__dirname, 'schemas.json');
          const schemaJson = this.schemaStore.toJSON();
          fs.writeFileSync(schemasPath, JSON.stringify(schemaJson, null, 2));
        }
      } catch (err) {
        console.warn('[Hippocampus] schemas.json save failed:', err?.message || err);
      }
      try {
        if (this.tier3Store && typeof this.tier3Store.toJSON === 'function') {
          const identityPath = path.join(__dirname, 'identity-core.json');
          const identityJson = this.tier3Store.toJSON();
          // Atomic write via temp + rename so a crash mid-write doesn't
          // corrupt identity-core.json (which is permanent — corruption
          // means losing Unity's identity until manual recovery).
          const tmpPath = `${identityPath}.tmp`;
          fs.writeFileSync(tmpPath, JSON.stringify(identityJson, null, 2));
          fs.renameSync(tmpPath, identityPath);
        }
      } catch (err) {
        console.warn('[Tier3Store] identity-core.json save failed:', err?.message || err);
      }

      const trig = opts.trigger ? ` (trigger=${opts.trigger})` : '';
      console.log(`[Brain] State saved v${this._saveVersion} at t=${this.time.toFixed(1)}s${trig}`);
    } catch (err) {
      console.warn('[Brain] Save failed:', err.message);
    }
  }

  // Binary CSR weight serializer. File layout:
  //   Header (16 bytes): magic 'UBWT' (4) + formatVersion uint32 (4) +
  //                      saveVersion uint32 (4) + sectionCount uint32 (4)
  //   Per section:
  //     'SECT' magic (4) + nameLen uint32 (4) + name bytes (padded to
  //     uint32 boundary) + rows uint32 (4) + cols uint32 (4) +
  //     nnz uint32 (4) + rowPtr (rows+1)*uint32 + colIdx nnz*uint32 +
  //     values nnz*float64
  // All values are host-byte-order (little-endian on x86/x64). The file
  // is only consumed on the same machine that wrote it, so endianness
  // swap is not needed.
  _saveBinaryWeights() {
    const cortex = this.cortexCluster;
    if (!cortex) return;
    const BIN_FILE = WEIGHTS_FILE.replace(/\.json$/, '.bin');
    const sections = [];
    const push = (name, matrix) => {
      if (!matrix || typeof matrix.rows !== 'number' || !matrix.values) return;
      // Skip GPU-bound matrices where CPU arrays were nulled out (happens
      // at biological scale after T18.22 CPU-CSR free). The GPU holds the
      // live weights; a separate GPU-readback path is needed to save them
      // back. Queued as a follow-up to this binary save.
      if (!matrix.values || !matrix.colIdx || !matrix.rowPtr) {
        console.warn(`[Brain] Binary weights skip ${name} — CPU arrays freed (GPU-bound at biological scale; GPU readback not yet wired)`);
        return;
      }
      sections.push({ name, rows: matrix.rows, cols: matrix.cols, nnz: matrix.nnz, rowPtr: matrix.rowPtr, colIdx: matrix.colIdx, values: matrix.values });
    };
    push('cortex.synapses', cortex.synapses);
    if (cortex.crossProjections) {
      const keys = Array.isArray(cortex.crossProjections)
        ? []
        : Object.keys(cortex.crossProjections);
      for (const k of keys) push(`cortex.crossProjections.${k}`, cortex.crossProjections[k]);
    }
    if (sections.length === 0) {
      // Nothing persistable at this moment — still produce a marker file
      // (empty sectionCount) so _loadBinaryWeights can detect "save ran,
      // nothing to restore" vs "never saved".
    }

    // Stream to an open fd instead of allocating one giant Buffer for
    // the whole file. Prior one-shot Buffer.alloc(totalBytes) approach
    // hit two hard problems at biological scale:
    //   (a) `TextEncoder().encode()` returns a Uint8Array (not Buffer),
    //       so `.copy(buf, off)` threw "nameBuf.copy is not a function"
    //       mid-write.
    //   (b) Every phase-DONE fires a save; 11 phases × multi-GB Buffer
    //       allocations accumulated in V8 external memory faster than
    //       GC could reclaim → "Committing semi space failed" OOM on
    //       subsequent DYN-PROD probe allocations.
    // Streaming avoids both — per-chunk headers are tiny (at most a
    // few hundred bytes) and the large rowPtr/colIdx/values arrays
    // get written as zero-copy `Buffer.from(typedArray.buffer, ...)`
    // views into disk via fs.writeSync. No multi-GB Buffer ever gets
    // allocated.
    let totalBytes = 16;
    for (const s of sections) {
      const nameLen = Buffer.byteLength(s.name, 'utf8');
      const padded = Math.ceil(nameLen / 4) * 4;
      totalBytes += 4 + 4 + padded + 4 + 4 + 4;
      totalBytes += (s.rows + 1) * 4;
      totalBytes += s.nnz * 4;
      totalBytes += s.nnz * 8;
    }

    let fd;
    try {
      fd = fs.openSync(BIN_FILE, 'w');
      // File header: magic 'UBWT' + format version + save version +
      // section count. 16 bytes total.
      const hdr = Buffer.alloc(16);
      hdr.write('UBWT', 0, 4, 'ascii');
      hdr.writeUInt32LE(1, 4);
      hdr.writeUInt32LE(this._saveVersion || 0, 8);
      hdr.writeUInt32LE(sections.length, 12);
      fs.writeSync(fd, hdr);

      for (const s of sections) {
        // Use Buffer.from(s.name, 'utf8') to get a real Node Buffer
        // with .copy() — TextEncoder().encode() returns a plain
        // Uint8Array without .copy() and was the cause of the
        // "nameBuf.copy is not a function" failure in the previous
        // one-shot approach.
        const nameBuf = Buffer.from(s.name, 'utf8');
        const padded = Math.ceil(nameBuf.length / 4) * 4;
        // Section header: SECT magic + nameLen + name(padded) + rows +
        // cols + nnz. Total = 4 + 4 + padded + 4 + 4 + 4.
        const sectHdr = Buffer.alloc(4 + 4 + padded + 4 + 4 + 4);
        sectHdr.write('SECT', 0, 4, 'ascii');
        sectHdr.writeUInt32LE(nameBuf.length, 4);
        nameBuf.copy(sectHdr, 8);
        sectHdr.writeUInt32LE(s.rows, 8 + padded);
        sectHdr.writeUInt32LE(s.cols, 12 + padded);
        sectHdr.writeUInt32LE(s.nnz, 16 + padded);
        fs.writeSync(fd, sectHdr);
        // Payload: rowPtr (Uint32), colIdx (Uint32), values (Float64).
        // Buffer.from(typedArray.buffer, byteOffset, byteLength) creates
        // a Buffer VIEW on the existing ArrayBuffer — no copy, no new
        // allocation. fs.writeSync streams those bytes to disk.
        fs.writeSync(fd, Buffer.from(s.rowPtr.buffer, s.rowPtr.byteOffset, (s.rows + 1) * 4));
        fs.writeSync(fd, Buffer.from(s.colIdx.buffer, s.colIdx.byteOffset, s.nnz * 4));
        fs.writeSync(fd, Buffer.from(s.values.buffer, s.values.byteOffset, s.nnz * 8));
      }
      fs.closeSync(fd);
      fd = undefined;
      const mb = (totalBytes / 1048576).toFixed(1);
      console.log(`[Brain] Binary weights saved ${sections.length} sections, ${mb} MB → ${path.basename(BIN_FILE)}`);
    } catch (err) {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
      console.warn('[Brain] Binary weights save failed:', err?.message || err);
    }
  }

  // Binary CSR weight loader. Parses the file written by
  // _saveBinaryWeights. Stashes sections on `this._pendingCortexWeights`
  // for deferred apply once cortexCluster exists (same pattern as the
  // JSON cortex state).
  _loadBinaryWeights() {
    const BIN_FILE = WEIGHTS_FILE.replace(/\.json$/, '.bin');
    if (!fs.existsSync(BIN_FILE)) return;
    let fd = -1;
    try {
      const stat = fs.statSync(BIN_FILE);
      if (stat.size < 16) {
        console.warn('[Brain] Binary weights file too small, skipping');
        return;
      }
      fd = fs.openSync(BIN_FILE, 'r');

      // Streaming read — single readFileSync caps at Node's 2 GiB Buffer
      // limit and blows up on 9 GB save files. All reads go through a
      // pair of helpers that fill Buffer/typed-array views by absolute
      // file offset so no single allocation crosses the 2 GiB line.
      let filePos = 0;
      const readIntoBuffer = (len) => {
        const out = Buffer.allocUnsafe(len);
        let got = 0;
        while (got < len) {
          const n = fs.readSync(fd, out, got, len - got, filePos + got);
          if (n <= 0) throw new Error(`short read at offset ${filePos + got}, expected ${len - got} more bytes`);
          got += n;
        }
        filePos += len;
        return out;
      };
      const readIntoTypedArray = (ta) => {
        const view = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength);
        let got = 0;
        while (got < view.length) {
          // fs.readSync takes up to ~2 GiB per call — chunk at 512 MiB
          // so we never bump the underlying Buffer binding ceiling.
          const chunk = Math.min(view.length - got, 512 * 1024 * 1024);
          const n = fs.readSync(fd, view, got, chunk, filePos + got);
          if (n <= 0) throw new Error(`short read at offset ${filePos + got}, expected ${chunk} more bytes`);
          got += n;
        }
        filePos += view.length;
      };

      const header = readIntoBuffer(16);
      const magic = header.toString('ascii', 0, 4);
      if (magic !== 'UBWT') {
        console.warn(`[Brain] Binary weights magic mismatch (got '${magic}'), skipping`);
        fs.closeSync(fd); fd = -1;
        return;
      }
      const formatVersion = header.readUInt32LE(4);
      const saveVersion = header.readUInt32LE(8);
      const sectionCount = header.readUInt32LE(12);
      if (formatVersion !== 1) {
        console.warn(`[Brain] Binary weights format version ${formatVersion} unsupported (expected 1)`);
        fs.closeSync(fd); fd = -1;
        return;
      }
      const decoder = new TextDecoder();
      const sections = [];
      for (let i = 0; i < sectionCount; i++) {
        const sectHeader = readIntoBuffer(4);
        if (sectHeader.toString('ascii', 0, 4) !== 'SECT') {
          console.warn(`[Brain] Binary weights section ${i} magic mismatch, aborting`);
          fs.closeSync(fd); fd = -1;
          return;
        }
        const nameLenBuf = readIntoBuffer(4);
        const nameLen = nameLenBuf.readUInt32LE(0);
        const padded = Math.ceil(nameLen / 4) * 4;
        const nameBuf = readIntoBuffer(padded);
        const name = decoder.decode(nameBuf.subarray(0, nameLen));
        const dims = readIntoBuffer(12);
        const rows = dims.readUInt32LE(0);
        const cols = dims.readUInt32LE(4);
        const nnz = dims.readUInt32LE(8);
        // Allocate typed arrays directly and stream file bytes into them.
        // Each array backs its own ArrayBuffer so the 2 GiB Buffer cap
        // only constrains per-call read size, not total per-array size.
        const rowPtr = new Uint32Array(rows + 1);
        readIntoTypedArray(rowPtr);
        const colIdx = new Uint32Array(nnz);
        readIntoTypedArray(colIdx);
        const values = new Float64Array(nnz);
        readIntoTypedArray(values);
        sections.push({ name, rows, cols, nnz, rowPtr, colIdx, values });
      }
      fs.closeSync(fd); fd = -1;
      this._pendingCortexWeights = { saveVersion, sections };
      const mb = (stat.size / 1048576).toFixed(1);
      console.log(`[Brain] Binary weights queued for apply — ${sectionCount} sections, ${mb} MB (saveVersion=${saveVersion})`);
    } catch (err) {
      console.warn('[Brain] Binary weights load failed:', err?.message || err);
    } finally {
      if (fd !== -1) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    }
  }

  // Apply queued binary weights to the live cortex cluster. Called from
  // _applyPendingCortexState once cortexCluster + SparseMatrix module are
  // available. Requires the SparseMatrix constructor from the dynamic
  // import — we pull it off cortex.synapses.constructor since that
  // instance was just built.
  _applyPendingCortexWeights() {
    const pending = this._pendingCortexWeights;
    const cortex = this.cortexCluster;
    if (!pending || !cortex) return;
    const SparseMatrix = cortex.synapses && cortex.synapses.constructor;
    if (!SparseMatrix) {
      console.warn('[Brain] Cannot apply binary weights — SparseMatrix constructor unreachable');
      return;
    }
    let applied = 0;
    for (const s of pending.sections) {
      try {
        const m = new SparseMatrix(s.rows, s.cols);
        m.values = s.values;
        m.colIdx = s.colIdx;
        m.rowPtr = s.rowPtr;
        m.nnz = s.nnz;
        if (s.name === 'cortex.synapses') {
          cortex.synapses = m;
          applied++;
        } else if (s.name.startsWith('cortex.crossProjections.')) {
          const key = s.name.substring('cortex.crossProjections.'.length);
          if (!cortex.crossProjections) cortex.crossProjections = {};
          cortex.crossProjections[key] = m;
          applied++;
        }
      } catch (err) {
        console.warn(`[Brain] Binary weight apply failed for ${s.name}:`, err?.message || err);
      }
    }
    if (applied > 0) {
      console.log(`[Brain] Binary weights applied — ${applied}/${pending.sections.length} sections restored onto live cortexCluster`);
    }
    this._pendingCortexWeights = null;
  }

  /**
   * Save all conversations to disk (separate file).
   */
  saveConversations() {
    try {
      const convFile = path.join(__dirname, 'conversations.json');
      const data = {
        savedAt: new Date().toISOString(),
        users: Object.entries(this._conversations || {}).map(([id, msgs]) => ({
          userId: id,
          messageCount: msgs.length,
          messages: msgs.slice(-50), // keep last 50 per user
        })),
      };
      fs.writeFileSync(convFile, JSON.stringify(data, null, 2));
    } catch (err) {
      console.warn('[Brain] Conversation save failed:', err.message);
    }
  }

  _loadWeights() {
    try {
      if (fs.existsSync(WEIGHTS_FILE)) {
        const data = JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf8'));
        this.arousal = data.arousal ?? this.arousal;
        this.valence = data.valence ?? this.valence;
        this.psi = data.psi ?? this.psi;
        this.coherence = data.coherence ?? this.coherence;
        this.drugState = data.drugState ?? this.drugState;
        // U306 — restore word-frequency accumulator so cross-restart
        // learning isn't lost. Groundwork for the full server-side
        // dictionary (U311 follow-up).
        if (data.wordFreq && typeof data.wordFreq === 'object') {
          this._wordFreq = { ...data.wordFreq };
          const wordCount = Object.keys(this._wordFreq).length;
          if (wordCount > 0) console.log(`[Brain] Restored ${wordCount} word frequencies from last save`);
        }

        // T2 2026-04-13 — stash the saved embedding refinements so
        // _initLanguageSubsystem() can apply them to sharedEmbeddings
        // once it's finished the dynamic import + base GloVe load.
        // The refinements can't be applied yet at _loadWeights() time
        // because sharedEmbeddings doesn't exist until the async
        // language subsystem init runs. Stored on `this` for pickup.
        if (data.embeddingRefinements) {
          this._pendingEmbeddingRefinements = data.embeddingRefinements;
        }

        // Restore cortex state. cortexCluster doesn't exist yet at
        // _loadWeights() time (constructed later in
        // _initLanguageSubsystem). Stash the block for deferred apply,
        // mirroring the embeddingRefinements pattern.
        if (data.cortex && typeof data.cortex === 'object') {
          this._pendingCortexState = data.cortex;
          const pcCount = Array.isArray(data.cortex.passedCells) ? data.cortex.passedCells.length : 0;
          const grades = data.cortex.grades
            ? Object.entries(data.cortex.grades).map(([s, g]) => `${s}=${g}`).join(' ') : 'none';
          console.log(`[Brain] cortex state queued for apply: ${pcCount} passedCells, grades { ${grades} }`);
        }

        // Letter inventory — module-level state, applied when the cortex
        // cluster comes up (same deferred pattern).
        if (Array.isArray(data.letterInventory)) {
          this._pendingLetterInventory = data.letterInventory;
          console.log(`[Brain] letter inventory queued for apply: ${data.letterInventory.length} symbols`);
        }

        // _gateHistory telemetry ledger. Applied once `this.curriculum`
        // is instantiated.
        if (data.gateHistory && typeof data.gateHistory === 'object') {
          this._pendingGateHistory = data.gateHistory;
        }

        // Grade-signoff ledger. Loaded directly onto `this` (no deferred
        // apply needed — it's a plain object).
        if (data.gradeSignoffs && typeof data.gradeSignoffs === 'object') {
          this._gradeSignoffs = { ...data.gradeSignoffs };
          const signoffCount = Object.keys(this._gradeSignoffs).length;
          if (signoffCount > 0) {
            console.log(`[Brain] restored ${signoffCount} grade signoffs: ${Object.keys(this._gradeSignoffs).join(', ')}`);
          }
        }

        // Explicit resume banner so operators see what state was loaded
        // vs what's fresh-random. Helps diagnose "wait did my brain
        // actually save?" without parsing the log for 20 messages.
        if (data.cortex?.passedCells?.length) {
          const lastCell = data.cortex.passedCells[data.cortex.passedCells.length - 1];
          console.log(`[Brain] resume indicator — brain remembers ${data.cortex.passedCells.length} passed cells. Last passed: ${lastCell}. Curriculum will skip these on next runCompleteCurriculum.`);
        }

        console.log(`[Brain] Loaded saved state from ${data.savedAt}`);
      }

      // Binary weights file — loaded in parallel with the JSON scalar/
      // map file. When present, cortex intra-synapses + cross-projection
      // SparseMatrix weights restore onto the live cortex cluster once
      // _applyPendingCortexState fires. When absent, weights start fresh
      // and the operator is warned.
      this._loadBinaryWeights();
      if (!this._pendingCortexWeights) {
        if (fs.existsSync(WEIGHTS_FILE)) {
          console.log('[Brain] ⚠ No binary weights file — passed-cell state resumes but language weights start fresh this boot. Re-teaching the curriculum will rebuild them.');
        }
      } else {
        console.log(`[Brain] ✓ Binary weights ready to restore — ${this._pendingCortexWeights.sections.length} sections queued.`);
      }
    } catch (err) {
      console.warn('[Brain] Load failed:', err.message);
    }
  }

  // Apply the deferred cortex state once cortexCluster + the curriculum
  // runner exist. Called from `_initLanguageSubsystem` after
  // `this.cortexCluster = new NeuronCluster(...)` + `this.curriculum =
  // new Curriculum(...)` have run. Idempotent: clears pending refs after
  // applying so a second call is a no-op.
  _applyPendingCortexState() {
    try {
      const cortex = this.cortexCluster;
      const pending = this._pendingCortexState;
      if (cortex && pending) {
        if (pending.grades && typeof pending.grades === 'object') {
          cortex.grades = {
            ela: pending.grades.ela || 'pre-K',
            math: pending.grades.math || 'pre-K',
            science: pending.grades.science || 'pre-K',
            social: pending.grades.social || 'pre-K',
            art: pending.grades.art || 'pre-K',
            life: pending.grades.life || 'pre-K',
          };
        }
        if (Array.isArray(pending.passedCells)) cortex.passedCells = [...pending.passedCells];
        // Phase-level resume markers — so Savestart.bat can skip phases
        // whose _phaseDone already fired in a prior run. Weights live on
        // disk via brain-weights.bin, markers live here.
        //
        // 114.19fe — restore phase markers AS-IS. The prior stale-load
        // filter wiped in-progress markers (cells not in passedCells) on
        // every Savestart, fundamentally breaking T31's phase-level resume:
        // any cell mid-flight at stop-time would restart from Phase 1 on
        // resume, even though saveWeights had atomically persisted the
        // phase markers alongside binary weights. Math/Sci/Soc/Art/Life
        // partial progress was being silently destroyed on every boot.
        //
        // The filter rationale was a defensive guard against code-hash-
        // invalidated weight wipes leaving phantom markers loaded against
        // re-initialized weights. But iter14-D's launcher contract makes
        // that scenario impossible:
        //   - start.bat ALWAYS wipes both weights AND markers atomically
        //   - Savestart.bat ALWAYS preserves both atomically
        //   - saveWeights writes them in a single JSON.stringify call
        // Markers loaded via Savestart are GUARANTEED consistent with the
        // binary weights they describe — no stale-load condition possible,
        // no filter needed. Phase-level resume contract restored.
        if (Array.isArray(pending.passedPhases)) {
          cortex.passedPhases = [...pending.passedPhases];
          if (cortex.passedPhases.length > 0) {
            console.log(`[Brain] passedPhases restored: ${cortex.passedPhases.length} phase markers (T31 phase-level resume active)`);
          }
        }
        if (pending.probeHistory && typeof pending.probeHistory === 'object') {
          cortex.probeHistory = { ...pending.probeHistory };
        }
        // Restore K-vocab prefetch flag (skip ~1 min cache
        // warm-up if prior boot already prefetched).
        if (pending.kVocabPrefetched === true) {
          cortex._kVocabPrefetched = true;
        }
        // Restore WS backpressure counters so historical pressure is
        // visible immediately after restart instead of zeroed.
        if (pending.wsBackpressure && typeof pending.wsBackpressure === 'object') {
          this._wsDroppedCount = pending.wsBackpressure.drops || 0;
          this._wsAbsorbedCount = pending.wsBackpressure.absorbs || 0;
          this._wsEnobufsCount = pending.wsBackpressure.enobufs || 0;
          this._wsLastDropTs = pending.wsBackpressure.lastDropTs || 0;
        }
        // Restore last dictionary smoke test result so dashboard shows
        // prior PASS/FAIL while the boot re-test runs in the background.
        if (pending.dictionarySmokeTest && typeof pending.dictionarySmokeTest === 'object') {
          if (typeof pending.dictionarySmokeTest.result === 'boolean') {
            this._dictionarySmokeTestResult = pending.dictionarySmokeTest.result;
          }
          this._dictionarySmokeTestTs = pending.dictionarySmokeTest.ts || 0;
        }
        // 114.19fh.A.5 — restore last sem→motor sep-probe result so
        // cluster.checkSemMotorHealth() has authoritative data immediately
        // on restart. Without this, health monitor falls back to the
        // value-distribution heuristic until the next sep-probe runs
        // (which could be many minutes into the next curriculum walk).
        if (typeof pending.lastSemMotorMeanCos === 'number') {
          cortex._lastSemMotorMeanCos = pending.lastSemMotorMeanCos;
          cortex._lastSemMotorMeanCosTs = pending.lastSemMotorMeanCosTs || 0;
        }
        // 114.19fi.B.1 — restore shared emission bus (cap 16 entries).
        // Embeddings were dropped at save time to bound file size; on
        // restore, bus has text + metadata only. Inner-voice + chat
        // path readers handle missing-embedding entries gracefully.
        if (Array.isArray(pending.emissionBus)) {
          cortex._emissionBus = pending.emissionBus.slice(-16);
        }
        // 114.19fi.B.5 — restore chat-turn history (cap 16 pairs).
        // Multi-turn coherence persists across restart; Unity
        // remembers what was just discussed.
        if (Array.isArray(pending.chatTurnHistory)) {
          cortex._chatTurnHistory = pending.chatTurnHistory.slice(-16);
        }
        // Restore stream-of-consciousness chain. Validate sem-region
        // dimensions match — if not, drop the chain (start fresh) so
        // dimension-mismatch NaN can't poison _innerVoiceTick blend.
        if (Array.isArray(pending.innerThoughtChain)) {
          const currentSemSize = cortex.regions && cortex.regions.sem
            ? (cortex.regions.sem.end - cortex.regions.sem.start) : 0;
          const savedSemSize = pending.innerThoughtChainSemSize || 0;
          if (savedSemSize > 0 && currentSemSize > 0 && savedSemSize !== currentSemSize) {
            console.warn(`[Brain] inner-thought chain dropped — sem region size changed across restart (saved=${savedSemSize}, current=${currentSemSize}). Starting fresh narrative.`);
            this._innerThoughtChain = [];
          } else {
            this._innerThoughtChain = pending.innerThoughtChain.slice(-8);
          }
        }
        // Restore definition-taught vocabulary set.
        if (Array.isArray(pending.definitionTaughtWords)) {
          cortex._definitionTaughtWords = new Set(pending.definitionTaughtWords);
        }
        // Restore per-cell gate-result ledger — /grade-signoff reads
        // this to reject an operator signoff POST when the cell's most
        // recent battery had active blockers.
        if (pending.lastGateResults && typeof pending.lastGateResults === 'object') {
          cortex._lastGateResult = { ...pending.lastGateResults };
        }
        // 114.19fc.persistence — restore per-subject word-bucket maps
        // (`wordBucketWords_<subj>` + `wordBucketDictSize_<subj>`
        // watermark) so Savestart resumes with Unity's trained
        // vocabulary intact. Without this, sem→word_motor weights
        // restore from brain-weights.bin but the bucket-index → word
        // mapping is gone, making `emitWordDirect({subject})` return
        // empty for every subject and inner-voice go silent post-
        // resume. Caught 2026-05-08 live test: vocab arrays empty
        // after Savestart even though curriculum + weights resumed.
        if (pending.wordBuckets && typeof pending.wordBuckets === 'object') {
          let restoredSubjects = 0;
          let restoredWords = 0;
          for (const [subj, payload] of Object.entries(pending.wordBuckets)) {
            if (payload && Array.isArray(payload.words)) {
              cortex[`wordBucketWords_${subj}`] = payload.words.slice();
              cortex[`wordBucketDictSize_${subj}`] = typeof payload.watermark === 'number'
                ? payload.watermark : payload.words.length;
              restoredSubjects++;
              restoredWords += payload.words.length;
            }
          }
          if (restoredSubjects > 0) {
            console.log(`[Brain] restored word-bucket maps: ${restoredWords} words across ${restoredSubjects} subject(s) — emitWordDirect + inner-voice showcase active immediately on resume.`);
          }
        }
        // Grade-advance pause — restore so curriculum walker lands on
        // the wait-loop at the same grade boundary the prior boot was
        // paused at. If pause was not set at save time, leave the flags
        // unset (curriculum defaults to walking continuously).
        if (pending.gradeAdvancePaused === true) {
          cortex._gradeAdvancePaused = true;
          cortex._pausedAt = pending.pausedAt || null;
          cortex._nextGrade = pending.nextGrade || null;
        }
        // Rebuild the learned-language Map shapes from JSON objects
        const objToMapOfMaps = (obj) => {
          const m = new Map();
          if (!obj) return m;
          for (const [k, inner] of Object.entries(obj)) {
            if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
              m.set(k, new Map(Object.entries(inner)));
            } else if (typeof inner === 'number') m.set(k, inner);
          }
          return m;
        };
        const objToMapOfMapOfMaps = (obj) => {
          const m = new Map();
          if (!obj) return m;
          for (const [k, inner] of Object.entries(obj)) m.set(k, objToMapOfMaps(inner));
          return m;
        };
        if (pending.fineTypeTransitions) cortex.fineTypeTransitions = objToMapOfMaps(pending.fineTypeTransitions);
        if (pending.sentenceFormSchemas) cortex.sentenceFormSchemas = objToMapOfMapOfMaps(pending.sentenceFormSchemas);
        if (pending.sentenceFormTotals) cortex.sentenceFormTotals = objToMapOfMaps(pending.sentenceFormTotals);
        if (pending.intentResponseMap) cortex.intentResponseMap = objToMapOfMaps(pending.intentResponseMap);
        if (pending.identityThresholds) {
          const th = pending.identityThresholds;
          if (th.ENGLISH_SURPRISE_THRESHOLD != null) cortex.ENGLISH_SURPRISE_THRESHOLD = th.ENGLISH_SURPRISE_THRESHOLD;
          if (th.ENGLISH_FINETYPE_MIN != null) cortex.ENGLISH_FINETYPE_MIN = th.ENGLISH_FINETYPE_MIN;
          if (th.HEALTH_ENTROPY_MIN != null) cortex.HEALTH_ENTROPY_MIN = th.HEALTH_ENTROPY_MIN;
          if (th.HEALTH_VOCAB_MIN != null) cortex.HEALTH_VOCAB_MIN = th.HEALTH_VOCAB_MIN;
          if (th.HEALTH_WM_VARIANCE_MIN != null) cortex.HEALTH_WM_VARIANCE_MIN = th.HEALTH_WM_VARIANCE_MIN;
        }
        if (Array.isArray(pending.personaDimensions)) {
          cortex.personaDimensions = pending.personaDimensions.map((d) => ({
            centroid: Float32Array.from(d.centroid || []),
            members: Array.isArray(d.members) ? [...d.members] : [],
          }));
        }
        if (Array.isArray(pending.personaRefreshCorpus)) {
          cortex._personaRefreshCorpus = [...pending.personaRefreshCorpus];
        }
        if (pending.intentCentroids && typeof pending.intentCentroids === 'object') {
          cortex.intentCentroids = new Map();
          for (const [k, arr] of Object.entries(pending.intentCentroids)) {
            if (Array.isArray(arr)) cortex.intentCentroids.set(k, Float32Array.from(arr));
          }
        }
        console.log('[Brain] cortex state applied to live cortexCluster');
        this._pendingCortexState = null;
      }
      // Letter inventory apply — uses the module stashed during init
      if (this._letterInputMod && this._pendingLetterInventory) {
        try {
          this._letterInputMod.loadInventory(this._pendingLetterInventory);
          console.log('[Brain] letter inventory applied');
        } catch (err) {
          console.warn('[Brain] letter inventory apply failed:', err?.message || err);
        }
        this._pendingLetterInventory = null;
      }
      // Gate-history apply
      if (this.curriculum && this._pendingGateHistory) {
        try {
          if (!(this.curriculum._gateHistory instanceof Map)) {
            this.curriculum._gateHistory = new Map();
          }
          for (const [key, entries] of Object.entries(this._pendingGateHistory)) {
            if (Array.isArray(entries)) this.curriculum._gateHistory.set(key, entries.slice());
          }
          console.log(`[Brain] gate-history applied (${Object.keys(this._pendingGateHistory).length} keys)`);
        } catch (err) {
          console.warn('[Brain] gate-history apply failed:', err?.message || err);
        }
        this._pendingGateHistory = null;
      }
      // Binary cortex weights apply — uses the SparseMatrix constructor
      // reachable via the just-built cortex.synapses instance. Must run
      // AFTER cortexCluster exists (handled by the outer call order in
      // _initLanguageSubsystem).
      this._applyPendingCortexWeights();
    } catch (err) {
      console.warn('[Brain] _applyPendingCortexState failed:', err?.message || err);
    }
  }
}

// ── WebSocket Server ────────────────────────────────────────────

// T14.21 — process-level error handlers so silent crashes during boot
// surface with a real stack trace instead of just vanishing. Writes to
// both stderr AND server/boot-error.log so the log survives whatever
// start.bat's `start /b` + `cmd /k` combo does to stdio. CommonJS so
// __dirname is available directly.
const _bootErrorLog = (kind, err) => {
  const msg = `[${new Date().toISOString()}] ${kind}: ${err && err.stack ? err.stack : String(err)}\n`;
  try { process.stderr.write(msg); } catch {}
  try {
    fs.appendFileSync(path.join(__dirname, 'boot-error.log'), msg);
  } catch {}
};
process.on('uncaughtException', (err) => {
  _bootErrorLog('uncaughtException', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  _bootErrorLog('unhandledRejection', reason);
  process.exit(1);
});

const brain = new ServerBrain();
// T14.21 — catch any rejection from brain.start() so async init failures
// surface with a stack trace instead of silently terminating the process
// via Node's default --unhandled-rejections=throw behavior.
brain.start().catch((err) => {
  _bootErrorLog('brain.start() rejected', err);
  process.exit(1);
});

// Periodic saves
setInterval(() => {
  brain.saveWeights();
  brain.saveConversations();
}, WEIGHT_SAVE_MS);

// iter13 T13.4 — Periodic episodic-memory decay sweep + pruning gate.
// Every 10 minutes: multiply salience by exp(-age_h/168) for episodes
// older than 1h, persist the decayed effective_salience, then prune
// episodes meeting all three pruning criteria (salience<0.05, age>30d,
// consolidation_count==0). Bounded background work — at typical N=
// hundreds-to-thousands of episodes the sweep completes in <100ms.
const EPISODIC_DECAY_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  if (typeof brain.decayEpisodes === 'function') {
    brain.decayEpisodes();
  }
}, EPISODIC_DECAY_INTERVAL_MS);

// Loopback gate for privileged HTTP endpoints (/shutdown, /grade-advance,
// /grade-signoff). Defense-in-depth on top of the BIND_HOST=127.0.0.1
// default — even when the operator opts in to BRAIN_BIND=0.0.0.0 to
// expose dashboards on the LAN, brain-mutating endpoints stay blocked
// for non-loopback callers. Returns false (and writes 403) if the
// caller is not localhost; returns true if the request can proceed.
function requireLoopback(req, res, endpoint) {
  const addr = (req.socket && req.socket.remoteAddress) || '';
  // IPv4 loopback, IPv6 loopback, IPv4-mapped-IPv6 loopback.
  const isLoopback = addr === '127.0.0.1'
    || addr === '::1'
    || addr === '::ffff:127.0.0.1'
    || addr.startsWith('127.');
  if (!isLoopback) {
    console.warn(`[Server] Rejected non-loopback ${endpoint} from ${addr}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'forbidden — privileged endpoint requires loopback caller' }));
    return false;
  }
  return true;
}

// HTTP server for health checks
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'alive',
      uptime: brain.time,
      neurons: TOTAL_NEURONS,
      scale: SCALE + 'x',
      gpu: RESOURCES.gpu.name,
      vram: RESOURCES.gpu.vram + 'MB',
      clients: brain.clients.size,
      spikes: brain.totalSpikes,
      psi: brain.psi,
      clusters: Object.fromEntries(Object.entries(CLUSTER_SIZES).map(([k, v]) => [k, v])),
    }));
    return;
  }
  // List brain versions
  if (req.url === '/versions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const versions = [];
    for (let i = 0; i < 5; i++) {
      const vFile = WEIGHTS_FILE.replace('.json', `-v${i}.json`);
      try {
        if (fs.existsSync(vFile)) {
          const data = JSON.parse(fs.readFileSync(vFile, 'utf8'));
          versions.push({ slot: i, version: data.version, savedAt: data.savedAt, time: data.time });
        }
      } catch {}
    }
    res.end(JSON.stringify({ versions, current: brain._saveVersion || 0 }));
    return;
  }

  // Graceful shutdown endpoint. stop.bat POSTs here as its first kill
  // attempt before falling through to taskkill on the port-holder.
  // Handler flips the shutdown flag + calls brain.stop() + schedules a
  // process.exit(0) after a brief drain window so the HTTP response
  // can return before the Node event loop dies. Idempotent — a second
  // POST after shutdown is already in progress short-circuits with an
  // already-shutting-down response.
  if (req.url === '/shutdown' && req.method === 'POST') {
    if (!requireLoopback(req, res, '/shutdown')) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (global._brainShutdownRequested) {
      res.end(JSON.stringify({ status: 'already shutting down' }));
      return;
    }
    global._brainShutdownRequested = true;
    console.log('[Brain] HTTP /shutdown — graceful halt requested by operator (stop.bat or curl).');
    res.end(JSON.stringify({ status: 'shutdown requested, exiting in 500ms' }));
    try { brain.stop(); } catch (err) {
      console.error('[Brain] stop() failed during /shutdown:', err);
    }
    setTimeout(() => { process.exit(0); }, 500);
    return;
  }

  // Milestone indicator for dashboard.html. Returns the last save
  // metadata (version + wall-clock + trigger), the last passed
  // curriculum cell, total passed count, grade state per subject,
  // save-resume vs fresh-boot mode flag, and the current weights-file
  // mtime so the dashboard can detect staleness.
  if (req.url === '/milestone') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    let fileMtime = null, fileSizeBytes = null;
    try {
      if (fs.existsSync(WEIGHTS_FILE)) {
        const stat = fs.statSync(WEIGHTS_FILE);
        fileMtime = stat.mtime.toISOString();
        fileSizeBytes = stat.size;
      }
    } catch {}
    const keepState = process.env.DREAM_KEEP_STATE === '1';
    const forceClear = process.env.DREAM_FORCE_CLEAR === '1';
    const bootMode = forceClear ? 'fresh-boot (DREAM_FORCE_CLEAR=1)'
                   : keepState ? 'save-resume (DREAM_KEEP_STATE=1)'
                   : 'code-hash gated (autoClearStaleState)';
    res.end(JSON.stringify({
      lastSave: brain._lastSave || null,
      bootMode,
      keepStateFlag: keepState,
      forceClearFlag: forceClear,
      weightsFile: {
        path: WEIGHTS_FILE,
        mtime: fileMtime,
        sizeBytes: fileSizeBytes,
      },
      grades: brain.cortexCluster?.grades ? { ...brain.cortexCluster.grades } : null,
      passedCellCount: Array.isArray(brain.cortexCluster?.passedCells) ? brain.cortexCluster.passedCells.length : 0,
      passedCells: Array.isArray(brain.cortexCluster?.passedCells) ? [...brain.cortexCluster.passedCells] : [],
      gradeSignoffs: brain._gradeSignoffs || {},
      chatTurnCount: brain._chatTurnCount || 0,
      // Grade-advance pause state — dashboard shows "Start Next Grade"
      // button only when paused === true && nextGrade != null. When
      // nextGrade is null the operator has hit the grade cap (e.g.,
      // passed K under PRE-K + K ONLY scope) and the button is
      // replaced by a caveat explaining to use POST /grade-signoff
      // instead.
      paused: brain.cortexCluster?._gradeAdvancePaused === true,
      pausedAt: brain.cortexCluster?._pausedAt || null,
      nextGrade: brain.cortexCluster?._nextGrade || null,
    }));
    return;
  }

  // Grade-advance endpoint. When curriculum pauses after a full grade
  // pass, the operator clicks "Start Next Grade" on the dashboard which
  // POSTs here. Flips `cortexCluster._gradeAdvancePaused = false` so
  // the runner's wait-loop exits and the next grade's cell walk starts.

  // Operator-only path — just like /grade-signoff, server code never
  // auto-advances. The pause is default-on after every grade pass so
  // chat-testing is clean (no background Hebbian). Persists through
  // saveWeights() so the advance event survives restart.

  // Usage:
  //   POST /grade-advance   { "subject": "ela", "grade": "kindergarten" }
  //   → flips pause off, returns {ok, advancedFrom, advancedTo}
  if (req.url === '/grade-advance' && req.method === 'POST') {
    if (!requireLoopback(req, res, '/grade-advance')) return;
    // Chunked-array body assembly avoids the V8 O(N²) string-concat
    // pathology from `body += chunk.toString()`. Pre-append size check
    // also fires BEFORE the chunk lands, so a single oversize chunk
    // can no longer slip past the 10K cap.
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 10000) { req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      try {
        const parsed = JSON.parse(body || '{}');
        const cortex = brain.cortexCluster;
        if (!cortex) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'cortex cluster not initialized' }));
          return;
        }
        if (cortex._gradeAdvancePaused !== true) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not paused', paused: false }));
          return;
        }
        const from = cortex._pausedAt?.grade || null;
        const to = cortex._nextGrade?.grade || null;
        cortex._gradeAdvancePaused = false;
        // _pausedAt + _nextGrade get cleared inside the curriculum
        // wait-loop when it exits; leave them for now so the next
        // /milestone poll can show the transition state.
        brain.saveWeights({ force: true, trigger: `grade-advance:${from}->${to}` });
        console.log(`[Brain] grade-advance recorded: ${from} → ${to} (operator localhost)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, advancedFrom: from, advancedTo: to }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Exam-answer endpoint. Takes a single question string, runs it
  // through the brain's question → answer path (same pipeline a chat
  // iter23.5 — POST /learn-from-web { topic } fetches a Wikipedia
  // summary for the topic, tokenizes alpha-only single-tokens, calls
  // dictionary.learnWord on each new one, fires a Tier 1 episode with
  // the source URL. Unity's vocabulary grows from real-world content
  // without any text-AI in her cognition path. Body cap 4 KB —
  // topic strings shouldn't be longer than that.
  if (req.url === '/learn-from-web' && req.method === 'POST') {
    if (!requireLoopback(req, res, '/learn-from-web')) return;
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 4096) { req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(body || '{}');
        const topic = (parsed.topic || '').toString().slice(0, 200);
        if (!topic) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'topic required' }));
          return;
        }
        const result = await learnFromWeb(brain, topic);
        const code = result.ok ? 200 : 502;
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err?.message || 'learn-from-web failed' }));
      }
    });
    return;
  }

  // iter23.4 — operator-controlled dream window. POST /sleep enters a
  // forced consolidation state (sets _operatorSleepRequested, fires
  // one-shot ConsolidationEngine pass). POST /wake clears the flag.
  // Useful for manual "let her dream for a bit" between curriculum
  // sessions — gives the consolidation pipeline guaranteed time to
  // promote Tier 1 → Tier 2 → Tier 3 instead of relying on the 60s
  // post-input quiet window that operator-driven curriculum
  // back-to-back cells never satisfy.
  if ((req.url === '/sleep' || req.url === '/wake') && req.method === 'POST') {
    if (!requireLoopback(req, res, req.url)) return;
    if (req.url === '/sleep') {
      brain._operatorSleepRequested = true;
      // One-shot consolidation pass before the response so the
      // operator-visible state reflects work already done.
      if (brain.consolidationEngine
          && typeof brain.consolidationEngine.runConsolidationPass === 'function') {
        try {
          brain.consolidationEngine.runConsolidationPass({ forced: true })
            .then(stats => console.log(`[Sleep] forced consolidation pass complete: ${JSON.stringify(stats)}`))
            .catch(err => console.warn(`[Sleep] forced pass failed: ${err.message}`));
        } catch (err) {
          console.warn(`[Sleep] runConsolidationPass threw: ${err.message}`);
        }
      }
      console.log('[Sleep] /sleep — operator-requested dream window opened');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sleeping: true }));
    } else {
      brain._operatorSleepRequested = false;
      console.log('[Sleep] /wake — operator cleared sleep flag');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sleeping: false }));
    }
    return;
  }

  // 114.19fg.Tier13 — operator-side rollback to a saved version.
  // POST /rollback { "to": "v4" }  → copies brain-weights-v4.json
  // over brain-weights.json, requires a graceful stop+start to take
  // effect (the running brain holds in-memory state, so the rollback
  // primes the next boot's load path). Default 'to' is 'v4' (last in
  // the rolling save ring). Loopback-gated.
  if (req.url === '/rollback' && req.method === 'POST') {
    if (!requireLoopback(req, res, '/rollback')) return;
    const chunks = [];
    let total = 0;
    let tooBig = false;
    req.on('data', (chunk) => {
      chunks.push(chunk);
      total += chunk.length;
      // 114.19fj.19 — explicit `tooBig` flag so 'end' handler doesn't
      // race with `req.destroy()` and try to JSON.parse a truncated body.
      if (total > 4096) { tooBig = true; req.destroy(); }
    });
    req.on('end', () => {
      if (tooBig) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'request body too large (>4KB)' }));
        return;
      }
      let to = 'v4';
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        if (body) {
          const parsed = JSON.parse(body);
          if (parsed && typeof parsed.to === 'string') to = parsed.to;
        }
      } catch { /* default 'v4' */ }
      if (!/^v[0-4]$/.test(to)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: `invalid 'to' (expected v0-v4), got: ${to}` }));
        return;
      }
      try {
        const fs = require('fs');
        const path = require('path');
        const srcJson = path.join(__dirname, `brain-weights-${to}.json`);
        const dstJson = path.join(__dirname, 'brain-weights.json');
        if (!fs.existsSync(srcJson)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: `source not found: brain-weights-${to}.json` }));
          return;
        }
        // 114.19fj.8 — atomic JSON+BIN restore via two-stage temp+rename.
        // Prior implementation was non-atomic: copy JSON first, copy BIN
        // second; crash between leaves JSON pointing to snapshot N+1 and
        // BIN at N. Two-stage temp+rename pattern: copy both to .tmp,
        // then rename atomically (rename is atomic on the same filesystem
        // on POSIX + Windows NTFS). Either both flip or neither does.
        const srcBin = path.join(__dirname, `brain-weights-${to}.bin`);
        const dstBin = path.join(__dirname, 'brain-weights.bin');
        const dstJsonTmp = dstJson + '.tmp';
        const dstBinTmp = dstBin + '.tmp';
        let binStatsSize = 0;
        let binWarning = null;
        // Stage 1 — copy both to temp files. If either copy fails, abort
        // before any rename so live files stay untouched.
        try {
          fs.copyFileSync(srcJson, dstJsonTmp);
          if (fs.existsSync(srcBin)) {
            fs.copyFileSync(srcBin, dstBinTmp);
          }
        } catch (copyErr) {
          // Cleanup any partial temp files before bubbling up.
          try { if (fs.existsSync(dstJsonTmp)) fs.unlinkSync(dstJsonTmp); } catch { /* nf */ }
          try { if (fs.existsSync(dstBinTmp)) fs.unlinkSync(dstBinTmp); } catch { /* nf */ }
          throw copyErr;
        }
        // Stage 2 — atomic rename. JSON first; if BIN rename throws,
        // JSON is already flipped and BIN stays at prior version which
        // is the closer-to-correct degraded state.
        fs.renameSync(dstJsonTmp, dstJson);
        const jsonStats = fs.statSync(dstJson);
        if (fs.existsSync(dstBinTmp)) {
          fs.renameSync(dstBinTmp, dstBin);
          binStatsSize = fs.statSync(dstBin).size;
        } else {
          binWarning = `brain-weights-${to}.bin not found — JSON-only rollback (binary weights stay at most-recent state). Restore is partial; consider rolling back to a different version that has both files.`;
          console.warn(`[Rollback] ${binWarning}`);
        }
        console.log(`[Rollback] copied brain-weights-${to}.json → brain-weights.json (${jsonStats.size} bytes)${binStatsSize > 0 ? ` + brain-weights-${to}.bin → brain-weights.bin (${binStatsSize} bytes)` : ''}. Next stop+Savestart will load this snapshot. Live brain state unchanged until restart.`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          restoredFromJson: `brain-weights-${to}.json`,
          jsonBytes: jsonStats.size,
          restoredFromBin: binStatsSize > 0 ? `brain-weights-${to}.bin` : null,
          binBytes: binStatsSize,
          binWarning,
          requiresRestart: true,
        }));
      } catch (err) {
        console.warn(`[Rollback] failed: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // message would use, but without episodic memory writes or the
  // conversation history append), returns just the answer text.
  // Used by scripts/transformer-ablation.mjs to compare Unity's
  // gate-probe answers head-to-head against a transformer arm on
  // identical held-out EXAM_BANKS.

  // Usage:
  //   POST /exam-answer  { "question": "what comes after a?" }
  //   → { "answer": "b", "ms": 142 }
  if (req.url === '/exam-answer' && req.method === 'POST') {
    // Chunked-array body assembly — see /grade-advance comment.
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 100000) { req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', async () => {
      const body = Buffer.concat(chunks).toString('utf8');
      try {
        const parsed = JSON.parse(body || '{}');
        const question = typeof parsed.question === 'string' ? parsed.question.trim() : '';
        if (!question) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'question required' }));
          return;
        }
        const t0 = Date.now();
        let answer = '';
        try {
          if (brain && typeof brain.processAndRespond === 'function') {
            // Use a synthetic ablation user id so episodic memory
            // writes from this call get scoped + don't pollute real
            // user conversation histories.
            const result = await brain.processAndRespond(question, 'ablation-harness', { suppressEpisode: true });
            if (result && typeof result === 'object') {
              answer = result.response || result.text || result.answer || '';
            } else if (typeof result === 'string') {
              answer = result;
            }
          } else if (brain && brain.innerVoice && brain.innerVoice.languageCortex) {
            // Fallback: direct languageCortex generate if processAndRespond
            // isn't available.
            const emb = brain.sharedEmbeddings ? brain.sharedEmbeddings.getEmbedding(question) : null;
            if (emb && brain.clusters && brain.clusters.cortex) {
              brain.clusters.cortex._lastUserInputEmbedding = emb;
            }
            answer = brain.innerVoice.languageCortex.generate(brain.dictionary, 0.7, 0.7, { cortexCluster: brain.clusters?.cortex }) || '';
          }
        } catch (err) {
          console.warn('[exam-answer] generation failed:', err?.message || err);
          answer = '';
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ answer: String(answer || '').trim(), ms: Date.now() - t0 }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Dual-brain arbiter endpoint. Unity weighs left brain (Rulkov
  // neural sim) against right brain (transformer) and picks the
  // higher-confidence answer. Left brain is always available;
  // right brain is present only when T23.e.2 has wired a transformer
  // backend into `brain.dualBrainArbiter.setTransformerBackend(fn)`.

  // Usage:
  //   POST /exam-answer-dual  { "question": "what comes after a?" }
  //   → { "answer": "b", "chosenBrain": "left"|"right"|"left-only",
  //       "leftAnswer": "b", "rightAnswer": "b",
  //       "leftScore": 0.78, "rightScore": 0.81, "ms": 162 }

  // `chosenBrain: 'left-only'` means the right brain isn't wired yet
  // — arbiter returned the left-brain answer without scoring.
  if (req.url === '/exam-answer-dual' && req.method === 'POST') {
    // Chunked-array body assembly — see /grade-advance comment.
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 100000) { req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', async () => {
      const body = Buffer.concat(chunks).toString('utf8');
      try {
        const parsed = JSON.parse(body || '{}');
        const question = typeof parsed.question === 'string' ? parsed.question.trim() : '';
        if (!question) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'question required' }));
          return;
        }
        if (!brain || !brain.dualBrainArbiter) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'dual-brain arbiter not initialized' }));
          return;
        }
        const t0 = Date.now();
        const decision = await brain.dualBrainArbiter.answer(question, { userId: 'arbiter-dual' });
        // Surface the decision onto the brain-event stream so the
        // dashboard Current Training + Brain Events cards show which
        // brain Unity picked for this question.
        try {
          brain.pushBrainEvent('arbiter', 'motor',
            `${decision.chosenBrain === 'right' ? 'RIGHT brain' : decision.chosenBrain === 'left-only' ? 'LEFT only' : 'LEFT brain'} (L=${decision.leftScore.toFixed(2)} R=${decision.rightScore.toFixed(2)})`,
            { question: question.slice(0, 60), chosenBrain: decision.chosenBrain, leftScore: decision.leftScore, rightScore: decision.rightScore });
        } catch { /* non-fatal */ }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...decision, ms: Date.now() - t0 }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Grade-signoff endpoint. When the operator has personally verified
  // the brain passed a grade on localhost via methodology + reasoning
  // + thinking + talking + listening + reading, the operator POSTs to
  // this endpoint to record the signoff. The ledger persists via
  // saveWeights() so the advance-gate stays closed across restarts.
  // This is an operator-only path — server code never auto-records a
  // pass; only an explicit HTTP POST advances the grade.

  // Usage:
  //   POST /grade-signoff   { "subject": "ela", "grade": "kindergarten",
  //                           "note": "probes cleared" }
  //   GET  /grade-signoff   → returns the current ledger
  if (req.url === '/grade-signoff') {
    if (!requireLoopback(req, res, '/grade-signoff')) return;
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ signoffs: brain._gradeSignoffs || {} }));
      return;
    }
    if (req.method === 'POST') {
      // Chunked-array body assembly — see /grade-advance comment.
      const chunks = [];
      let total = 0;
      req.on('data', (chunk) => {
        total += chunk.length;
        if (total > 10000) { req.destroy(); return; }
        chunks.push(chunk);
      });
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        try {
          const parsed = JSON.parse(body || '{}');
          const { subject, grade, note, force } = parsed;
          if (!subject || !grade) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'subject and grade required' }));
            return;
          }
          const key = `${subject}/${grade}`;
          // Gate-result verification — refuse the signoff when the cell's
          // most-recent battery had active blockers OR when the cell has
          // never run a battery. Operator can override with {"force":true}
          // but the override is logged + persisted into the signoff note.
          const cluster = brain.cortexCluster;
          const gateResult = (cluster && cluster._lastGateResult && cluster._lastGateResult[key]) || null;
          const forceOverride = force === true;
          if (!forceOverride) {
            if (!gateResult) {
              res.writeHead(409, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'cell has never run the student battery — signoff refused',
                key,
                remedy: 'run runCompleteCurriculum through this cell first, then retry; or POST with {"force":true} to override',
              }));
              console.warn(`[Brain] /grade-signoff REJECTED ${key} — no gate result on file`);
              return;
            }
            if (!gateResult.pass || (Array.isArray(gateResult.blockers) && gateResult.blockers.length > 0)) {
              res.writeHead(409, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'cell has active gate blockers — signoff refused',
                key,
                blockers: gateResult.blockers || ['pass flag=false'],
                aggregateRate: gateResult.aggregateRate,
                externalRate: gateResult.externalRate,
                methodologyRate: gateResult.methodologyRate,
                standardsBelowCut: gateResult.standardsBelowCut || [],
                ts: gateResult.ts,
                remedy: 'fix the failing criteria and re-run the curriculum, or POST with {"force":true} to override',
              }));
              console.warn(`[Brain] /grade-signoff REJECTED ${key} — active blockers: ${(gateResult.blockers || []).join('; ')}`);
              return;
            }
          }
          if (!brain._gradeSignoffs) brain._gradeSignoffs = {};
          brain._gradeSignoffs[key] = {
            signedAt: new Date().toISOString(),
            note: typeof note === 'string' ? note.slice(0, 1024) : '',
            source: 'gee-localhost',
            forceOverride: forceOverride ? {
              reason: 'operator explicit force:true',
              gateResultAtOverride: gateResult || null,
            } : undefined,
          };
          brain.saveWeights({ force: true, trigger: `grade-signoff:${key}` });
          const tag = forceOverride ? ' (force override)' : '';
          console.log(`[Brain] grade signoff recorded: ${key}${tag}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'recorded',
            key,
            signoff: brain._gradeSignoffs[key],
            gateResult: gateResult || null,
          }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'GET or POST only' }));
    return;
  }

  // Rollback to a version
  if (req.url?.startsWith('/rollback/')) {
    const slot = parseInt(req.url.split('/')[2]);
    if (isNaN(slot) || slot < 0 || slot >= 5) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid slot (0-4)' }));
      return;
    }
    const vFile = WEIGHTS_FILE.replace('.json', `-v${slot}.json`);
    try {
      if (!fs.existsSync(vFile)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Version not found' }));
        return;
      }
      // Copy backup to main file and reload
      fs.copyFileSync(vFile, WEIGHTS_FILE);
      brain._loadWeights();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'rolled back', slot }));
      console.log(`[Brain] Rolled back to version slot ${slot}`);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Episodic memory query

  // This endpoint used to return the last 20 episodes across ALL
  // users without any filter, which was a direct leak of user text
  // content (episodes store `input_text` and `response_text` fields).
  // Now it REQUIRES a `?user=<stable-id>` query param and filters by
  // it. Without the param it returns aggregate counts only, never
  // content. Matches the privacy rule: what a user types, other
  // people shouldn't be able to read.
  if (req.url && req.url.startsWith('/episodes')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const user = url.searchParams.get('user');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (user && typeof user === 'string' && user.length > 0) {
      // User-scoped query — return that user's recent episodes only
      const recent = brain._stmtRecentEpisodesByUser.all(user, 20);
      res.end(JSON.stringify({
        userId: user,
        count: recent.length,
        recent,
      }));
    } else {
      // No user param — aggregate counts only, NO content
      res.end(JSON.stringify({
        totalCount: brain.getEpisodeCount(),
        note: 'pass ?user=<stable-id> to see your own episodes. Cross-user episode content is private and not served from this endpoint.',
      }));
    }
    return;
  }

  // Emotion history (for external tools)
  if (req.url === '/history') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ history: brain._emotionHistory.slice(-300) }));
    return;
  }

  // ── Claude Code CLI proxy — /v1/chat/completions + /v1/models ──
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      data: [
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (CLI)' },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (CLI)' },
      ]
    }));
    return;
  }

  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 500000) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const messages = data.messages || [];
        let systemPrompt = '', userPrompt = '';
        for (const msg of messages) {
          if (msg.role === 'system') systemPrompt = msg.content;
          if (msg.role === 'user') userPrompt = msg.content;
        }
        const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
        if (!fullPrompt.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'empty prompt' }));
          return;
        }
        console.log(`[Claude CLI] Calling (${fullPrompt.length} chars)...`);
        execSync; // ensure available
        const { execFile: execFileCli } = require('child_process');
        execFileCli('claude', ['-p', fullPrompt, '--output-format', 'text'], {
          timeout: 60000, maxBuffer: 1024 * 1024,
        }, (err, stdout) => {
          if (err) {
            console.error(`[Claude CLI] Error: ${err.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            id: 'cli-' + Date.now(),
            object: 'chat.completion',
            model: data.model || 'claude-opus-4-6',
            choices: [{ index: 0, message: { role: 'assistant', content: stdout.trim() }, finish_reason: 'stop' }],
          }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── Explicit routes for public HTML pages (prevent hanging) ──
  // These pages are pure static HTML — serve them immediately without
  // going through the generic fs.readFile path which can stall when
  // the event loop is busy with curriculum/GPU work.
  // All non-root HTMLs (unity-guide, brain-equations, dashboard, compute,
  // gpu-configure) live under `html/` on disk and are served at their
  // `/html/...` URLs to match GitHub Pages canonical paths. Only
  // index.html stays in repo root for the GH Pages landing URL.
  // Backwards-compat: the old root URLs (`/unity-guide.html` /
  // `/brain-equations.html`) redirect to the new `/html/...` paths so
  // historical bookmarks + shared links keep working.
  const PUBLIC_PAGES = {
    '/html/unity-guide.html': path.join(__dirname, '..', 'html', 'unity-guide.html'),
    '/html/brain-equations.html': path.join(__dirname, '..', 'html', 'brain-equations.html'),
    '/html/dashboard.html': path.join(__dirname, '..', 'html', 'dashboard.html'),
    '/html/gpu-configure.html': path.join(__dirname, '..', 'html', 'gpu-configure.html'),
    '/html/compute.html': path.join(__dirname, '..', 'html', 'compute.html'),
    '/dashboard.html': path.join(__dirname, '..', 'html', 'dashboard.html'),
    '/gpu-configure.html': path.join(__dirname, '..', 'html', 'gpu-configure.html'),
    '/compute.html': path.join(__dirname, '..', 'html', 'compute.html'),
  };
  if (req.method === 'GET' && (req.url === '/unity-guide.html' || req.url === '/brain-equations.html')) {
    res.writeHead(301, { Location: `/html${req.url}`, 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  if (req.method === 'GET' && PUBLIC_PAGES[req.url]) {
    const pagePath = PUBLIC_PAGES[req.url];
    try {
      const content = fs.readFileSync(pagePath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
      res.end(content);
    } catch (e) {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' });
    res.end();
    return;
  }

  // ── Static file serving — serves the entire client app ──
  const ROOT = path.join(__dirname, '..');
  const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.map': 'application/json', '.txt': 'text/plain',
  };

  // URL-decode the path so names like "Ultimate%20Unity.txt" resolve to
  // the real file on disk ("Ultimate Unity.txt"). Without this the persona
  // self-image fetch 404s silently and Unity boots with an empty dictionary.
  let rawPath = req.url.split('?')[0];
  try { rawPath = decodeURIComponent(rawPath); } catch { /* keep raw on bad encoding */ }
  let filePath = path.join(ROOT, rawPath);
  if (filePath === ROOT || filePath === ROOT + '/' || filePath === ROOT + '\\') {
    filePath = path.join(ROOT, 'index.html');
  }

  // Security: prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Try with .html extension
      fs.readFile(filePath + '.html', (err2, data2) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    // Disable caching for JS/HTML/bundle so browsers never serve stale code
    // after start.bat rebuilds the esbuild bundle. Static assets (fonts,
    // images) can still cache normally.
    const noCacheExts = new Set(['.js', '.mjs', '.html', '.css', '.json', '.map']);
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (noCacheExts.has(ext)) {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

// maxPayload bumped to 2 GB so sparse matrix upload binary frames
// can transfer at any realistic size. Default 100 MiB silently
// rejects the 180 MB cross-projection frames at 200K cortex.
// perMessageDeflate disabled because (a) sparse matrix binary data
// is mostly entropy (random-init weights + random column indices)
// so compression ratio is ~1.0 with significant CPU cost, and (b)
// compression was defaulting on and adding seconds of latency per
// frame. Language cortex grows with hardware per T17, so ceiling-
// free + compression-free frames are mandatory.
const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: 2 * 1024 * 1024 * 1024,
  perMessageDeflate: false,
});

wss.on('connection', (ws, req) => {
  const id = 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const client = { id, lastInput: 0, inputCount: 0, name: null };
  brain.clients.set(ws, client);
  console.log(`[Server] Client connected: ${id} (${brain.clients.size} total)`);

  // Send initial state
  ws.send(JSON.stringify({
    type: 'welcome', id,
    state: brain.getState(),
    emotionHistory: brain._emotionHistory.slice(-300),
  }));

  ws.on('message', (data) => {
    // T17.3.e — binary WebSocket frames for sparse matrix responses.
    // Client sends "SPRR" magic + type + reqId + payload. Decode and
    // route to the matching pending promise.
    if (Buffer.isBuffer(data) && data.length >= 9 && data.slice(0, 4).toString('ascii') === 'SPRR') {
      const typeByte = data[4];
      // SPRR header layout (16 bytes for propagate, 9 bytes for
      // upload_ack/hebbian_ack):
      //   propagate: magic(4) + typeByte(1) + pad(3) + reqId(4) + clen(4) + floats
      //   others:    magic(4) + typeByte(1) + reqId(4)
      // propagate was bumped 13 → 16 so the Float32 payload starts on
      // a 4-byte boundary (compute.html used to emit new Float32Array(
      // resp, 13, clen) which is a WebGPU-validator violation —
      // "start offset of Float32Array should be a multiple of 4").
      const reqId = typeByte === 2 ? data.readUInt32LE(8) : data.readUInt32LE(5);
      if (brain._gpuSparsePending) {
        const pending = brain._gpuSparsePending.get(reqId);
        if (pending) {
          brain._gpuSparsePending.delete(reqId);
          clearTimeout(pending.timeout);
          if (typeByte === 2) {
            // propagate response — currents Float32Array at offset 16
            const currentsLen = data.readUInt32LE(12);
            const currentsOffset = 16;
            const expectedLen = currentsOffset + currentsLen * 4;
            if (data.length < expectedLen) {
              pending.resolve({ error: 'truncated propagate response' });
            } else {
              // Copy to a fresh Float32Array so we own the memory
              const currents = new Float32Array(data.buffer.slice(
                data.byteOffset + currentsOffset,
                data.byteOffset + currentsOffset + currentsLen * 4,
              ));
              pending.resolve({ currents });
            }
          } else {
            // upload_ack / hebbian_ack — just resolve OK
            pending.resolve({ ok: true, reqId });
          }
        }
      }
      return;
    }
    try {
      const msg = JSON.parse(data.toString());

      // Rate limit
      const now = Date.now();
      if (msg.type === 'text' && now - client.lastInput < 1000 / MAX_TEXT_PER_SEC) {
        ws.send(JSON.stringify({ type: 'error', message: 'Rate limited — slow down' }));
        return;
      }
      client.lastInput = now;

      switch (msg.type) {
        case 'text': {
          // T6 2026-04-13 — prefer the client's STABLE userId over
          // the per-session `id`. The session id changes every
          // reconnect; the stable id persists across sessions via
          // localStorage on the client. This is what scopes episodic
          // memory per user — episodes store + recall filter by this
          // id, so Alice never gets recall hits from Bob's past text.
          // Falls back to session id for legacy clients that haven't
          // migrated to the stable-id path.
          const stableId = (msg.userId && typeof msg.userId === 'string' && msg.userId.length > 0)
            ? msg.userId
            : id;
          {
            // Log the full text — never truncate. Earlier this line used
            // `.slice(0, 50)` on the display which made it look like user
            // input was getting cut off when it wasn't (the full text
            // always flowed through to processAndRespond). Gee caught it.
            const logText = (msg.text || '').replace(/\s+/g, ' ').trim();
            console.log(`[${id}] Text (${logText.length} chars): "${logText}" (stable=${stableId.slice(-8)})`);
          }
          // Process through brain and respond — ROUTED TO THIS CLIENT ONLY.

          // 2026-04-13 privacy model: user text is PRIVATE between the
          // user and Unity. It never gets broadcast to other connected
          // clients. What IS shared across users is Unity's evolving
          // brain state — the dictionary, bigrams, embedding refinements
          // all grow from every conversation and benefit every user who
          // talks to the same brain instance. But the raw text and
          // individual responses stay between the one user and Unity.

          // The old `conversation` broadcast that used to loop this
          // message out to every connected WebSocket was DELETED here
          // (was 12 lines, shipped clipped {userId, text[:200],
          // response[:500]} to other clients). It violated the
          // privacy rule: what a user types, other people shouldn't
          // be able to read, but two different people should be
          // able to build her brain
          // words but not her persona". The brain-words part is
          // already handled by the shared singleton brain (dictionary
          // / bigrams / embeddings all update from every conversation),
          // which is the "one brain of Unity" model. Only the raw text
          // broadcast needed removal.
          brain.processAndRespond(msg.text || '', stableId).then(result => {
            if (ws.readyState !== ws.OPEN) return;
            if (result.text) {
              if (result.action === 'build_ui' && result.component) {
                ws.send(JSON.stringify({ type: 'build', component: result.component }));
              } else if (result.action === 'generate_image') {
                ws.send(JSON.stringify({ type: 'image', prompt: result.text }));
              } else {
                ws.send(JSON.stringify({ type: 'response', text: result.text, action: result.action }));
              }
            } else if (result.silent) {
              // Unity went silent on purpose — tell the client why instead
              // of letting the user stare at nothing. The client can decide
              // to display this inline as a status note or render it as a
              // "ghost" response bubble.
              ws.send(JSON.stringify({
                type: 'silent',
                reason: result.silentReason || 'unknown',
                detail: result.silentDetail || '',
                minGrade: result.minGrade || null,
              }));
              console.log(`[${id}] Silent response: ${result.silentReason} (${result.minGrade || 'n/a'})`);
            }
            // Chat-turn save hook. Every 10 completed turns the brain
            // persists so live conversation learning (wordFreq, embedding
            // refinements, episodic memory, conversation log) lands on
            // disk without waiting for the 5-minute periodic save. Rate-
            // limited: not every single turn (would thrash disk at
            // biological scale) and skipped during curriculum teach
            // (respected by saveWeights guard unless force:true).
            brain._chatTurnCount = (brain._chatTurnCount || 0) + 1;
            if (brain._chatTurnCount % 10 === 0) {
              try {
                brain.saveWeights({ trigger: `chat-turn:${brain._chatTurnCount}` });
                brain.saveConversations();
              } catch (err) {
                console.warn(`[Brain] chat-turn save failed: ${err?.message || err}`);
              }
            }
          }).catch(err => {
            console.warn(`[${id}] Response failed:`, err.message);
          });
          break;
        }

        case 'reward':
          brain.reward += msg.amount || 0;
          break;

        case 'lookupDefinition': {
          // Live dictionary lookup proxy. Browser-side
          // cluster.lookupDefinition(word) sends this; server forwards
          // to definition-service.js (dictionaryapi.dev wrapper),
          // returns first short definition string or null. Cache lives
          // server-side in definition-service so all clients share it.
          const reqId = msg.reqId;
          const word = (msg.word || '').toString();
          if (!reqId || !word) break;
          const respond = (definition, definitions) => {
            try {
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                  type: 'definitionResult',
                  reqId,
                  word,
                  definition: definition || null,
                  definitions: definitions || [],
                }));
              }
            } catch { /* socket gone — drop */ }
          };
          if (msg.full) {
            definitionService.getDefinitions(word).then(arr => {
              const first = arr.length > 0 ? arr[0].definition : null;
              respond(first, arr);
            }).catch(() => respond(null, []));
          } else {
            definitionService.getDefinition(word).then(def => {
              respond(def, []);
            }).catch(() => respond(null, []));
          }
          break;
        }

        case 'prefetchDefinitions': {
          // Prime the definition cache for an upcoming
          // teach phase. Curriculum sends this at cell start with the
          // vocab list so by the time _teachWordDefinition fires for
          // each word, the entry is already cached and the sync read
          // returns instantly. Fire-and-forget — no response needed.
          const words = Array.isArray(msg.words) ? msg.words : [];
          if (words.length === 0) break;
          definitionService.prefetch(words).then(stats => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'prefetchDone',
                reqId: msg.reqId || null,
                count: words.length,
                prefetched: stats.prefetched,
                alreadyCached: stats.alreadyCached,
              }));
            }
          }).catch(() => {});
          break;
        }

        case 'setName':
          client.name = msg.name;
          break;

        case 'gpu_register':
          client.isGPU = true;
          brain._gpuClient = ws;
          brain._gpuConnected = true;
          brain._gpuWaitLogged = false;
          brain._gpuWaitLogged2 = false;
          brain._gpuModeLogged = false;
          brain._gpuInitialized = {};
          brain._gpuHits = 0;
          brain._gpuMisses = 0;
          // CPU workers no longer exist (U304) — nothing to terminate
          console.log(`[${id}] GPU compute client registered — brain will use GPU exclusively`);
          break;

        case 'compute_result': {
          // GPU sent back spike count — voltages and spikes stay on GPU
          const name = msg.clusterName;
          if (!brain._gpuPending || !name || !brain._gpuPending[name]) break;

          const resolver = brain._gpuPending[name];
          delete brain._gpuPending[name];
          resolver({
            clusterName: name,
            spikeCount: msg.spikeCount || 0,
          });
          break;
        }

        case 'compute_batch_result': {
          // T14.23 — batched substep+cluster loop result from compute.html.
          // msg shape:
          //   { batchId, perCluster: {
          //       cortex: { spikeCountTotal, lastSpikeCount },
          //       hippocampus: { ... },
          //       ...
          //     }
          //   }
          // spikeCountTotal = sum across all substeps in the batch
          // lastSpikeCount  = final substep's spike count (used as the
          //                   current-state readout by the tick loop)
          if (!brain._gpuBatchPending) break;
          if (brain._gpuBatchPending.batchId !== msg.batchId) {
            console.warn(`[Brain] compute_batch_result batchId mismatch: expected ${brain._gpuBatchPending.batchId}, got ${msg.batchId}`);
            break;
          }
          const resolver = brain._gpuBatchPending.resolve;
          brain._gpuBatchPending = null;
          brain._gpuBatchesCompleted = (brain._gpuBatchesCompleted || 0) + 1;
          // Reset consecutive-timeout counter — any successful batch
          // clears the hang indicator so a one-off timeout (long
          // Hebbian wave) doesn't permanently flag the GPU.
          if (brain._gpuBatchConsecutiveTimeouts && brain._gpuBatchConsecutiveTimeouts > 0) {
            if (brain._gpuHangLogged) {
              console.log(`[Brain] compute_batch recovered after ${brain._gpuBatchConsecutiveTimeouts} timeout(s) — GPU pipeline is responsive again.`);
            }
            brain._gpuBatchConsecutiveTimeouts = 0;
            brain._gpuHangLogged = false;
          }
          resolver({ perCluster: msg.perCluster || {} });
          break;
        }

        case 'gpu_init_ack':
          // T14.23.3 — track ACTUAL GPU-confirmed init state, not just
          // "we sent the init message". The server's _gpuInitialized
          // flag gets set synchronously when _gpuStep sends a gpu_init,
          // which is way before compute.html has actually allocated the
          // GPU buffers for that cluster. At 677M-neuron biological scale
          // uploadCluster can take several seconds per cluster, and if
          // the server dispatches compute_batch before all 7 acks come
          // back, the batch queues behind the init messages in
          // compute.html's onmessage queue and times out before getting
          // processed. _gpuInitializedConfirmed only flips when we
          // actually see the ack — tick loop waits for this instead of
          // the optimistic _gpuInitialized flag.
          if (!brain._gpuInitializedConfirmed) brain._gpuInitializedConfirmed = {};
          brain._gpuInitializedConfirmed[msg.clusterName] = true;
          console.log(`[GPU] Confirmed: ${msg.clusterName} initialized (${(msg.size || 0).toLocaleString()} neurons)`);
          // 114.19ek P2 #11 — once cortex re-confirms after a respawn,
          // the GPU shadow is back in sync with the CPU CSR; clear the
          // dirty flag so dashboard + downstream consumers stop
          // signaling shadow-divergence.
          if (msg.clusterName === 'cortex' && brain.cortexCluster?._gpuShadowDirty) {
            brain.cortexCluster._gpuShadowDirty = false;
            console.log('[GPU] _gpuShadowDirty cleared — cortex re-confirmed after compute-client respawn.');
          }
          break;

        // ── T17.3.c SPARSE OPS: GPU language cortex dispatch acks ──
        case 'sparse_upload_ack':
        case 'sparse_propagate_ack':
        case 'sparse_hebbian_ack':
        case 'rebind_sparse_ack':
        case 'readback_letter_buckets_ack': {
          if (!brain._gpuSparsePending || !msg.reqId) break;
          const pending = brain._gpuSparsePending.get(msg.reqId);
          if (!pending) break;
          brain._gpuSparsePending.delete(msg.reqId);
          clearTimeout(pending.timeout);
          if (msg.error) pending.reject(new Error(msg.error));
          else pending.resolve(msg);
          break;
        }

        // T18.6.a — device-lost signal from compute.html. WebGPU fires
        // device.lost when the GPU crashes (almost always VRAM
        // exhaustion during biological-scale sparse upload on a
        // too-small VRAM budget). Previously the server only saw the
        // downstream phantom "size too large" errors and had to guess;
        // this message gives us the real reason + message from the
        // browser's WebGPU runtime. Mark the sparse pipeline
        // unavailable + flip `_gpuConnected` false so new compute
        // dispatches short-circuit instead of timing out on a dead
        // device.
        case 'device_lost': {
          const reason = msg.reason || 'unknown';
          const message = msg.message || '(no message)';
          console.error(`[Brain] GPU DEVICE LOST (reported by compute.html) — reason=${reason} message=${message}`);
          console.error('[Brain] Most common cause: VRAM exhaustion during biological-scale sparse upload. Auto-rescale should have prevented this; if it still happened, either the `LANG_CORTEX_BYTES_PER_NEURON` coefficient under-estimated real footprint (bump the coefficient in brain-server.js) or an admin override in resource-config.json bypassed the scaling loop. Reload compute.html after addressing the cause.');
          brain._gpuDeviceLost = true;
          brain._gpuConnected = false;
          if (brain.cortexCluster) brain.cortexCluster._gpuReady = false;
          break;
        }

        default:
          console.log(`[${id}] Unknown message type: ${msg.type}`);
      }
    } catch (err) {
      console.warn(`[${id}] Bad message:`, err.message);
    }
  });

  ws.on('close', () => {
    brain.clients.delete(ws);
    // If GPU client disconnected, reset GPU state so it re-initializes on reconnect.
    // iter114.19eg — when the disconnect is UNEXPECTED (mid-curriculum,
    // brain has been running >60s, no operator-initiated shutdown), this
    // is the Chrome compute.html process having crashed. Log CRITICAL
    // with the brain's current state + auto-respawn Chrome so curriculum
    // resumes without manual start.bat restart. Respawn rate-limited to
    // 3 within 5 minutes to prevent infinite-loop on a deterministic
    // crash trigger (e.g. driver bug that crashes Chrome instantly on
    // first compute_batch — would burn through respawns and make logs
    // unreadable).
    if (ws === brain._gpuClient) {
      brain._gpuClient = null;
      brain._gpuConnected = false;
      brain._gpuInitialized = {};
      // 114.19ek P2 #11 — also clear the *confirmed* init flags so
      // the auto-respawned Chrome receives gpu_init for every cluster
      // instead of being assumed already-confirmed (the prior gap
      // that left _gpuShadowDirty set with no recovery path).
      brain._gpuInitializedConfirmed = {};
      brain._gpuHits = 0;
      brain._gpuMisses = 0;

      const uptimeMs = brain._bootTs ? (Date.now() - brain._bootTs) : 0;
      const isUnexpected = uptimeMs > 60000 && !global._brainShutdownRequested;
      const inCurriculum = !!brain._curriculumInProgress;

      if (isUnexpected) {
        const memUsage = process.memoryUsage();
        const rss = (memUsage.rss / 1024 / 1024).toFixed(0);
        const heapUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(0);
        const heapTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(0);
        const phase = (brain.cortexCluster && brain.cortexCluster._activePhase && brain.cortexCluster._activePhase.name) || '(idle)';
        const cellKey = (brain.cortexCluster && brain.cortexCluster._currentCellKey) || '(none)';
        console.error(`[Server] CRITICAL — GPU compute client disconnected UNEXPECTEDLY at +${(uptimeMs/1000).toFixed(0)}s uptime. Chrome compute.html process likely crashed (visible window closed). Brain state at crash: phase=${phase} cell=${cellKey} curriculumInProgress=${inCurriculum} heap=${heapUsed}/${heapTotal}MB rss=${rss}MB. iter25-O.2 _gpuShadowDirty flag set — full GPU resync scheduled before next teach phase Hebbian fire.`);

        if (brain.cortexCluster) brain.cortexCluster._gpuShadowDirty = true;

        // Rate-limited auto-respawn. Track recent respawns in a 5-min ring
        // buffer; bail if we're already at 3 in that window.
        const now = Date.now();
        const FIVE_MIN_MS = 5 * 60 * 1000;
        if (!Array.isArray(brain._gpuRespawnTimestamps)) brain._gpuRespawnTimestamps = [];
        brain._gpuRespawnTimestamps = brain._gpuRespawnTimestamps.filter((ts) => (now - ts) < FIVE_MIN_MS);
        if (brain._gpuRespawnTimestamps.length >= 3) {
          console.error(`[Server] CRITICAL — auto-respawn cap hit (3 respawns within 5 minutes). Chrome is crashing too fast for auto-recovery. Diagnose the underlying cause and restart manually via start.bat. Last respawn timestamps: ${brain._gpuRespawnTimestamps.map((ts) => new Date(ts).toISOString()).join(', ')}`);
        } else {
          brain._gpuRespawnTimestamps.push(now);
          console.log(`[Server] auto-respawn #${brain._gpuRespawnTimestamps.length}/3 scheduled in 2s — re-launching Chrome compute.html. Curriculum will resume once GPU client reconnects.`);
          setTimeout(() => {
            try { _spawnGpuClient(PORT); }
            catch (err) { console.error(`[Server] auto-respawn _spawnGpuClient threw: ${err.message}`); }
          }, 2000);
        }
      } else {
        console.log(`[Server] GPU compute client disconnected — switching to all-CPU (uptime=${(uptimeMs/1000).toFixed(0)}s, expected=${!isUnexpected})`);
      }
    }
    console.log(`[Server] Client disconnected: ${id} (${brain.clients.size} remaining)`);
  });

  ws.on('error', (err) => {
    console.warn(`[${id}] WebSocket error:`, err.message);
  });
});

// Broadcast brain state to all clients
setInterval(() => {
  if (brain.clients.size === 0) return;
  const state = JSON.stringify({ type: 'state', state: brain.getState() });
  for (const [ws] of brain.clients) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(state); } catch {}
    }
  }
}, STATE_BROADCAST_MS);

/**
 * Auto-spawn the GPU compute client.
 *
 * Rationale: WebGPU lives in the browser; Node has no native WebGPU
 * runtime that covers our shader path. The server offloads every
 * neuron LIF dispatch + sparse propagate + Hebbian + letter-bucket
 * reduction to `compute.html` running in a browser tab that connects
 * back over WebSocket. Before this auto-spawn, `node brain-server.js`
 * stood alone and waited forever for a client to appear — the
 * curriculum's `_waitForGpuReady` timed out at 120s, aborting the
 * teach pass. A fresh boot with no browser tab produced the
 * "Curriculum runCompleteCurriculum: GPU never became ready,
 * aborting teach pass" log with Unity's cortex untouched.
 *
 * The fix: the server opens the default browser to compute.html
 * itself, so `node brain-server.js` is the single command. No
 * duplicate tab when `start.bat` launches (start.bat now skips the
 * compute.html open and lets the server do it).
 *
 * Cross-platform via the conventional per-OS open commands:
 *   - Windows: `cmd /c start "" "<url>"` (cmd builtin)
 *   - macOS:   `open "<url>"`
 *   - Linux:   `xdg-open "<url>"`
 *
 * Opt-out for headless / CI / remote deployments via env
 * `DREAM_NO_AUTO_GPU=1`. In that mode the server logs the URL and
 * expects an operator to connect compute.html manually.
 */
function _spawnGpuClient(port) {
  // Live-test diagnostic: stamp INVOKED on every entry so a missed
  // setTimeout(() => _spawnGpuClient(PORT), 3500) at line ~6350 leaves
  // a visible trail in server.log. Pair with the FINISHED log line
  // below — if INVOKED appears without FINISHED, spawn() crashed
  // synchronously inside the platform-specific block. Operator
  // verbatim 2026-06-17: "the htmls for the brain and compute and
  // dashboard did not open correctly only two opened" — diagnostic
  // log lines added so next live-test surfaces root cause.
  const _spawnStartTs = Date.now();
  const _spawnUptimeMs = Math.round(process.uptime() * 1000);
  console.log(`[Server] _spawnGpuClient INVOKED at +${_spawnUptimeMs}ms post-process-start (platform=${process.platform}, DREAM_NO_AUTO_GPU=${process.env.DREAM_NO_AUTO_GPU || 'unset'})`);

  // Failure-surfacing helper — broadcasts {type:'gpuClientSpawnFailed'}
  // over WebSocket to all connected clients (dashboard.html consumes
  // this and renders a recovery banner) AND logs with [CRITICAL] prefix
  // so the PowerShell tail-window highlight rules surface it. Without
  // this, silent failures inside the platform-specific spawn block
  // leave the operator with no visible signal — only the absence of a
  // compute.html tab. Per audit task H.6.
  const _broadcastSpawnFailure = (details) => {
    try {
      const payload = { type: 'gpuClientSpawnFailed', ts: Date.now(), retryIn: null, ...details };
      const msg = JSON.stringify(payload);
      if (brain && brain.clients) {
        for (const [clientWs] of brain.clients) {
          try { if (clientWs && clientWs.readyState === 1) clientWs.send(msg); } catch { /* per-client send failure tolerated */ }
        }
      }
    } catch { /* defensive — never let surfacing itself crash spawn flow */ }
    console.error(`[Server] [CRITICAL] _spawnGpuClient failure: ${JSON.stringify(details)}`);
  };

  if (process.env.DREAM_NO_AUTO_GPU === '1') {
    console.log(`[Server] DREAM_NO_AUTO_GPU=1 — skipping browser auto-launch. Open http://localhost:${port}/compute.html manually to start GPU compute.`);
    console.log(`[Server] _spawnGpuClient FINISHED (skipped via DREAM_NO_AUTO_GPU=1, elapsed=${Date.now() - _spawnStartTs}ms)`);
    return;
  }
  // iter15-D — kill any Chrome process attached to the isolated
  // UnityBrain-WebGPU-Profile BEFORE checking the existing-client guard.
  // Operator caught (verbatim 2026-05-05 "the compute html is not
  // opening correclty the dangerous skip one ... just dashboard and 3D
  // brain is opening"): stop.bat killed the node server but NOT the
  // isolated Chrome window holding compute.html. On next start.bat,
  // that lingering Chrome's WebSocket auto-reconnect picked up the
  // new server BEFORE this auto-launch ran — the T18.11 guard below
  // saw "already connected" and skipped the spawn. Operator ended up
  // with no visible compute.html because the prior Chrome window was
  // hidden / minimized / on another virtual desktop. Fix: kill any
  // Chrome processes whose command line contains
  // UnityBrain-WebGPU-Profile so the guard sees no client and the
  // auto-launch proceeds with a fresh window the operator can see.
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      // PowerShell Get-CimInstance is the modern WMIC replacement.
      // Only kills Chrome / Edge attached to OUR isolated profile —
      // operator's regular Chrome stays alive.
      execSync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match \'^chrome\\.exe$|^msedge\\.exe$\' -and $_.CommandLine -like \'*UnityBrain-WebGPU-Profile*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"',
        { stdio: 'ignore', timeout: 5000 }
      );
      // Force-clear the GPU client reference so the guard below sees no
      // client. The killed Chrome's WebSocket close event will eventually
      // fire async and re-clear state (idempotent). Without this, the
      // event loop hasn't yet processed the disconnect when the guard
      // checks readyState — guard fires, spawn skips, operator ends up
      // with no compute.html again.
      if (brain) {
        brain._gpuClient = null;
        brain._gpuConnected = false;
      }
      console.log(`[Server] Stale-Chrome cleanup: killed any Chrome / Edge attached to UnityBrain-WebGPU-Profile (operator's regular browser unaffected).`);
    } catch (err) {
      console.warn(`[Server] Stale-Chrome cleanup warning: ${err.message} (proceeding anyway)`);
    }
  }

  // T18.11 — skip auto-launch when a GPU client is already connected.
  // The scenario: operator restarts the server without closing the
  // prior compute.html tab. That tab's ws.onclose auto-reconnect
  // (exponential-backoff post-T18.11, starting at 3 s) picks up the
  // new server within our spawn-delay window. If we also launch a
  // fresh tab, two compute.html instances hold biological-scale GPU
  // buffers simultaneously (~8 GB each on a 16 GB 4070 Ti SUPER) and
  // the second init pass OOMs the device on upload. That OOM fires
  // WebGPU device.lost, Windows TDR, and on certain Windows + NVIDIA
  // driver combos the cascade reaches NDIS/WinSock kernel paths →
  // whole PC loses internet → hard reset. Spawn-delay at the call
  // site (3.5 s post-T18.11) gives the pre-existing tab time to
  // reconnect before this check runs. iter15-D pre-kills any stale
  // Chrome (above) so this guard now only fires when there's a
  // GENUINE concurrent compute.html in some non-isolated browser
  // (which is the legitimate concurrent-instance case to skip).
  if (brain && brain._gpuClient && brain._gpuClient.readyState === 1) {
    console.log(`[Server] GPU compute client already connected from a non-isolated browser — skipping auto-launch. Open ${port}/compute.html manually in the same browser if needed, OR close that tab and rerun start.bat to get the isolated --enable-unsafe-webgpu Chrome window.`);
    return;
  }
  const url = `http://localhost:${port}/compute.html`;
  const { exec, spawn } = require('child_process');

  // iter14-E per operator 2026-05-04: "obviously make the start.bat
  // fucking work!!! if we cant interact with the html thius is
  // pointless and well never beable to scale right when we do comp."
  // iter15-D per operator 2026-05-05: "the compute html is not opening
  // correclty the dangerous skip one ... just dashboard and 3D brain
  // is opening" — exec(cmdString) with nested quotes was fragile on
  // Windows. Switched to spawn(exe, [args]) with array form so each
  // argument gets quoted separately, then verbose log + retry chain
  // (Chrome → Edge → default browser fallback). Always logs what was
  // detected + what command ran so silent failures surface.

  // Detect Chrome (or Edge fallback) and launch compute.html with
  // --enable-unsafe-webgpu flag. This raises the WebGPU
  // maxStorageBufferBindingSize from the 2GB spec minimum to whatever
  // the GPU driver actually supports. Plus
  // --enable-dawn-features=allow_unsafe_apis,disable_robustness for
  // Chrome 120+ which gates SOME unsafe-webgpu APIs behind a separate
  // Dawn-level flag. Plus --no-first-run --no-default-browser-check
  // so the isolated profile doesn't show first-run wizard. Plus
  // --new-window forces a fresh window so flags actually apply (tabs
  // in existing windows inherit launch flags only if the existing
  // window had them).

  // Per-app user-data-dir keeps the unsafe-webgpu Chrome profile
  // sandboxed from the operator's regular browsing session.
  if (process.platform === 'win32') {
    const fs = require('fs');
    const path = require('path');
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      // Chrome SxS / Beta / Dev / Canary alternates
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome SxS\\Application\\chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome Beta\\Application\\chrome.exe'),
      'C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe',
    ];
    const edgePaths = [
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    ];

    let exePath = null;
    let browserName = null;
    const checkedPaths = [];
    for (const p of chromePaths) {
      if (!p) continue;
      const exists = fs.existsSync(p);
      checkedPaths.push(`${exists ? '✓' : '✗'} ${p}`);
      if (exists && !exePath) { exePath = p; browserName = 'Chrome'; }
    }
    for (const p of edgePaths) {
      if (!p) continue;
      const exists = fs.existsSync(p);
      checkedPaths.push(`${exists ? '✓' : '✗'} ${p}`);
      if (exists && !exePath) { exePath = p; browserName = 'Edge'; }
    }
    console.log(`[Server] _spawnGpuClient browser detection:\n  ${checkedPaths.join('\n  ')}`);

    if (exePath) {
      // Sandboxed user-data-dir for the unsafe-webgpu profile.
      const userDataDir = path.join(process.env.LOCALAPPDATA || process.env.TEMP || '.', 'UnityBrain-WebGPU-Profile');

      // iter15-D — clear stale Chrome singleton lockfiles before spawn.
      // Operator caught (verbatim 2026-05-05 "i use to open it in my
      // open browedr with the others, but after the unsafe update it
      // was opening in its own window browser but now its not opening
      // at all"). Symptom: Chrome silently exits when Singleton* files
      // exist in the user-data-dir from a prior instance that didn't
      // shut down cleanly (e.g. the operator closed the brain-server
      // process while compute.html was still open, leaving the lock).
      // Fix: nuke Singleton* + lockfile before spawn — this is safe
      // because the sandboxed profile is single-purpose (compute.html
      // only) and there's never a legitimate concurrent user of it.
      try {
        if (fs.existsSync(userDataDir)) {
          const STALE_LOCKS = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
          for (const name of STALE_LOCKS) {
            const p = path.join(userDataDir, name);
            try {
              if (fs.existsSync(p) || fs.lstatSync(p, { throwIfNoEntry: false })) {
                fs.unlinkSync(p);
                console.log(`[Server] Cleared stale Chrome lock: ${p}`);
              }
            } catch { /* file may not exist or be a symlink target — ignore */ }
          }
        }
      } catch (err) {
        console.warn(`[Server] Lock cleanup warning: ${err.message} (proceeding anyway)`);
      }

      const args = [
        '--enable-unsafe-webgpu',
        '--enable-dawn-features=allow_unsafe_apis,disable_robustness',
        '--enable-features=Vulkan',
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--new-window',
        url,
      ];
      console.log(`[Server] Launching GPU compute client via ${browserName} (${exePath}) with --enable-unsafe-webgpu + Dawn allow_unsafe_apis. Profile: ${userDataDir}`);
      console.log(`[Server] Full args: ${args.join(' ')}`);
      let spawnedOK = false;
      try {
        // spawn with array form — Node handles per-argument quoting
        // automatically. detached + unref so Chrome lives past server
        // restart. iter114.19eg — pipe stdout + stderr instead of
        // 'ignore' so Chrome's crash messages land in server.log.
        // Without this, when Chrome's GPU process dies (visible
        // window close), the only clue in server.log is the WS-close
        // handler's "GPU compute client disconnected" line — no
        // explanation. Piping stderr + stdout surfaces driver
        // crashes, GPU process kills, sandbox failures, allocation
        // OOMs, and any other diagnostic Chrome emits before exit.
        const child = spawn(exePath, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
        // Modern Chrome on Windows emits megabytes/min of routine
        // GPU/Vulkan/font-cache info noise to stderr — without a
        // filter, server.log floods unreadable within minutes. We
        // only surface lines that look like real crash signals so
        // the actual cause of a compute-client death stays visible.
        const CHROME_CRASH_SIGNALS = /\b(error|fatal|crash|crashed|exit|exited|killed|aborting|abort|device lost|lost context|out of memory|oom|gpu process|deadlock|sigsegv|access violation|null pointer|assertion|panic)\b/i;
        // 114.19eu — explicit noise-filter blacklist applied BEFORE
        // the crash-signal regex. Chrome's internal Google services
        // (GCM/FCM push messaging, USB device enumeration) emit lines
        // tagged "ERROR:" that the broad CHROME_CRASH_SIGNALS regex
        // matches via the word "error" — but they're 100% irrelevant
        // to our brain (we don't use Chrome push messaging or USB
        // device polling for anything). Master flagged the GCM
        // DEPRECATED_ENDPOINT noise as "what the fuck is this" — same
        // category as the QUOTA_EXCEEDED + USB SetupDi noise that's
        // been polluting the log. All Chrome-internal-service chatter
        // gets dropped here before reaching the crash-signal matcher.
        const CHROME_NOISE_PATTERNS = /\b(gcm[\/\\]engine|device_event_log|usb_service_win|registration_request|connection_factory_impl|chromecast|metrics_log_uploader|domain_reliability|optimization_guide_internals|net[\/\\]url_request|safe_browsing|component_updater|service_worker_storage|cookie_monster|extension_registry)\b/i;
        const isChromeNoise = (txt) => CHROME_NOISE_PATTERNS.test(txt);
        if (child.stdout) {
          child.stdout.on('data', (data) => {
            const txt = data.toString().trim();
            if (txt && !isChromeNoise(txt) && CHROME_CRASH_SIGNALS.test(txt)) console.log(`[Chrome stdout] ${txt}`);
          });
        }
        if (child.stderr) {
          child.stderr.on('data', (data) => {
            const txt = data.toString().trim();
            if (txt && !isChromeNoise(txt) && CHROME_CRASH_SIGNALS.test(txt)) console.log(`[Chrome stderr] ${txt}`);
          });
        }
        child.on('exit', (code, signal) => {
          console.log(`[Chrome] process exited — code=${code} signal=${signal} pid=${child.pid}`);
        });
        child.on('error', (err) => {
          console.warn(`[Server] Browser spawn error: ${err.message}. Falling back to default browser open.`);
          _broadcastSpawnFailure({ stage: 'child-error-event', browser: browserName, exePath, errno: err.code || err.errno || 'unknown', message: err.message, fallback: 'default-browser' });
          exec(`start "" "${url}"`, () => {});
        });
        child.unref();
        spawnedOK = true;
        console.log(`[Server] GPU compute client spawn() initiated — PID ${child.pid}. URL: ${url}`);
        console.log(`[Server] _spawnGpuClient FINISHED (browser=${browserName}, pid=${child.pid}, elapsed=${Date.now() - _spawnStartTs}ms — 30s watchdog will verify WS connection)`);
      } catch (err) {
        console.warn(`[Server] spawn() threw: ${err.message}. Falling back to default browser open.`);
        _broadcastSpawnFailure({ stage: 'spawn-throw', browser: browserName, exePath, errno: err.code || 'unknown', message: err.message, fallback: 'default-browser' });
        exec(`start "" "${url}"`, () => {});
      }

      // Watchdog — verify a GPU client actually connected within 30s.
      // Chrome can silently exit after spawn (stale profile lock, GPU
      // process crash, etc.) producing no error event. If no client
      // shows up by then, fall back to the default browser so the
      // operator at least gets compute.html open (capped at 2GB
      // binding ceiling = 178M neurons, but functional).
      if (spawnedOK) {
        setTimeout(() => {
          if (!brain || !brain._gpuClient || brain._gpuClient.readyState !== 1) {
            console.warn(`[Server] GPU client never connected after Chrome spawn (30s timeout). Chrome may have failed silently — falling back to default browser to at least open compute.html (will be capped at 2GB binding ceiling without --enable-unsafe-webgpu flag).`);
            _broadcastSpawnFailure({ stage: 'watchdog-30s-timeout', browser: browserName, exePath, errno: 'WS_NEVER_CONNECTED', message: 'Chrome spawn appeared OK but no compute.html WS client connected within 30s — silent Chrome failure (stale profile lock, GPU process crash, sandbox denial).', fallback: 'default-browser' });
            exec(`start "" "${url}"`, () => {});
          } else {
            console.log(`[Server] GPU client connected — Chrome auto-launch confirmed working.`);
          }
        }, 30000);
      }
    } else {
      console.warn(`[Server] Chrome and Edge not found in standard install paths. Falling back to default browser launch — WebGPU binding ceiling will stay at 2GB spec minimum (cap ~178M neurons). Install Chrome OR open ${url} manually in a Chromium browser launched with --enable-unsafe-webgpu flag to scale past 178M.`);
      _broadcastSpawnFailure({ stage: 'browser-not-found', browser: 'none', exePath: null, errno: 'ENOENT', message: 'Chrome + Edge not found in any standard install path. Default-browser fallback opens at 2GB binding ceiling (~178M neurons cap).', fallback: 'default-browser', checkedPaths });
      exec(`start "" "${url}"`, (err) => {
        if (err) console.warn(`[Server] Default-browser fallback failed: ${err.message}. Open ${url} manually.`);
        else console.log(`[Server] GPU compute client opened in default browser: ${url}`);
      });
      console.log(`[Server] _spawnGpuClient FINISHED (no-Chrome/Edge fallback, elapsed=${Date.now() - _spawnStartTs}ms)`);
    }
  } else if (process.platform === 'darwin') {
    const args = ['-a', 'Google Chrome', '--args', '--enable-unsafe-webgpu', '--enable-dawn-features=allow_unsafe_apis,disable_robustness', '--new-window', url];
    console.log(`[Server] Launching GPU compute client via macOS open: ${args.join(' ')}`);
    try {
      const child = spawn('open', args, { detached: true, stdio: 'ignore' });
      child.unref();
      console.log(`[Server] _spawnGpuClient FINISHED (macOS open, pid=${child.pid}, elapsed=${Date.now() - _spawnStartTs}ms)`);
    } catch (err) {
      console.warn(`[Server] macOS spawn failed: ${err.message}. Falling back to default open.`);
      _broadcastSpawnFailure({ stage: 'macos-spawn-throw', browser: 'Chrome', exePath: '/Applications/Google Chrome.app', errno: err.code || 'unknown', message: err.message, fallback: 'open' });
      exec(`open "${url}"`, () => {});
    }
  } else {
    // Linux — try google-chrome first, then chromium, then xdg-open
    const linuxArgs = ['--enable-unsafe-webgpu', '--enable-dawn-features=allow_unsafe_apis,disable_robustness', '--enable-features=Vulkan', '--new-window', url];
    const tryLinux = (exe, fallbackFn) => {
      try {
        const child = spawn(exe, linuxArgs, { detached: true, stdio: 'ignore' });
        child.on('error', (err) => {
          _broadcastSpawnFailure({ stage: 'linux-child-error', browser: exe, exePath: exe, errno: err.code || 'unknown', message: err.message, fallback: 'next-in-chain' });
          fallbackFn();
        });
        child.unref();
        console.log(`[Server] GPU compute client spawned via ${exe}`);
        console.log(`[Server] _spawnGpuClient FINISHED (Linux ${exe}, pid=${child.pid}, elapsed=${Date.now() - _spawnStartTs}ms)`);
      } catch (err) {
        _broadcastSpawnFailure({ stage: 'linux-spawn-throw', browser: exe, exePath: exe, errno: err.code || 'unknown', message: err.message, fallback: 'next-in-chain' });
        fallbackFn();
      }
    };
    tryLinux('google-chrome', () => tryLinux('chromium', () => exec(`xdg-open "${url}"`, () => {})));
  }
}

// Bind interface — default to loopback only so the brain server isn't
// reachable from the LAN unless the operator explicitly opts in via
// `BRAIN_BIND=0.0.0.0` (or any other interface). Default Node listen()
// behavior is to bind to all interfaces, which exposes the privileged
// /shutdown + /grade-signoff + /grade-advance endpoints to anyone on
// the network. Localhost-only is the safe default for a local dev
// brain server.
const BIND_HOST = process.env.BRAIN_BIND || '127.0.0.1';

httpServer.listen(PORT, BIND_HOST, () => {
  const bindLabel = BIND_HOST === '127.0.0.1' || BIND_HOST === 'localhost'
    ? `localhost (${BIND_HOST})`
    : `${BIND_HOST} — ⚠ EXPOSED TO NETWORK; auth-free privileged endpoints reachable from LAN`;
  console.log(`
  🧠 Unity Brain Server — Auto-Scaled
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Bind host:  ${bindLabel}
  Open:       http://localhost:${PORT}
  Dashboard:  http://localhost:${PORT}/dashboard.html
  Health:     http://localhost:${PORT}/health
  WebSocket:  ws://localhost:${PORT}

  Hardware:   ${RESOURCES.scaleSource}
  RAM:        ${RESOURCES.totalRAM} total, ${RESOURCES.freeRAM} free
  CPU:        ${RESOURCES.cpuCount} cores (${RESOURCES.cpuModel})
  GPU:        ${RESOURCES.gpu.name} (${RESOURCES.gpu.vram}MB VRAM)

  Scale:      ${SCALE}x (${TOTAL_NEURONS.toLocaleString()} neurons)
  Cortex:     ${CLUSTER_SIZES.cortex.toLocaleString()} neurons
  Hippocampus:${CLUSTER_SIZES.hippocampus.toLocaleString()} neurons
  Amygdala:   ${CLUSTER_SIZES.amygdala.toLocaleString()} neurons
  Basal Gang: ${CLUSTER_SIZES.basalGanglia.toLocaleString()} neurons
  Cerebellum: ${CLUSTER_SIZES.cerebellum.toLocaleString()} neurons
  Hypothal:   ${CLUSTER_SIZES.hypothalamus.toLocaleString()} neurons
  Mystery:    ${CLUSTER_SIZES.mystery.toLocaleString()} neurons

  Tick rate:  ${Math.round(1000/BRAIN_TICK_MS)}fps × 10 = ${Math.round(10000/BRAIN_TICK_MS)} brain-steps/sec

  Brain is thinking. Launching GPU compute client...
  `);
  // T18.11 — 3.5 s delay (was 500 ms). Matches the compute.html
  // exponential-backoff reconnect's first retry window (3 s) with
  // 500 ms of scheduling margin. Any pre-existing compute.html tab
  // from a prior server run will reconnect within this window, so the
  // spawn-guard inside `_spawnGpuClient` can see it and skip the
  // fresh-tab launch — preventing the two-tab VRAM-contention cascade
  // that takes the PC off the network.
  setTimeout(() => _spawnGpuClient(PORT), 3500);
});

// Graceful shutdown — force exit on Ctrl+C. The curriculum's tight
// async loops can starve the event loop so a graceful SIGINT never
// processes.

// While the curriculum runs, Ctrl+C used to fail to halt the
// program correctly — the prior "save then exit" ceremony on first
// Ctrl+C blocked on `brain.saveWeights()` which at 13.4M-scale
// synapses takes tens of seconds of synchronous JSON.stringify +
// fs.writeFileSync. During curriculum mid-retry, Ctrl+C felt dead
// because the save wouldn't return for a long time. Per LAW 6 Part 2
// + LAW (2026-04-17 clear-stale-state), brain weights are DELETED
// before every Part 2 test run anyway — saving mid-curriculum has
// zero value. First Ctrl+C now sets the shutdown flag AND
// immediately calls process.exit(0) with no save blocking. Second
// Ctrl+C process.exit(1) kept as belt-and-braces.
let _shutdownRequested = false;
global._brainShutdownRequested = false;

process.on('SIGINT', () => {
  if (_shutdownRequested) {
    console.log('\n[Brain] FORCE KILL — second Ctrl+C received.');
    process.exit(1);
  }
  _shutdownRequested = true;
  global._brainShutdownRequested = true;
  console.log('\n[Brain] Ctrl+C — halting immediately (no save; weights clear per LAW before every Part 2 run).');
  try { brain.stop(); } catch {}
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\n[Brain] SIGTERM — halting immediately.');
  try { brain.stop(); } catch {}
  process.exit(0);
});

// Attach per-concern mixins to ServerBrain.prototype. Per-concern
// architecture per server/brain-server/README.md.
Object.assign(ServerBrain.prototype, SERVER_GPU_MIXIN);
Object.assign(ServerBrain.prototype, SERVER_STATE_MIXIN);
Object.assign(ServerBrain.prototype, SERVER_MEMORY_MIXIN);
Object.assign(ServerBrain.prototype, SERVER_CHAT_MIXIN);

