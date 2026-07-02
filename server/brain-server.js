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

// ── Donor LEADERBOARD identity helpers ─────────────────────────
// The leaderboard answers "who is contributing compute", which is a DIFFERENT
// question from "where do I route work" (that's always client.donorId — a
// per-device persistent UUID, never touched here). The aggregation rule: a
// donor who types a name lands in ONE shared row keyed by name:<lowercased>, so
// 100 people all typing "Bob" stack onto a single "Bob"; a donor with no name
// stays a per-device anonymous row keyed by their donorId. These helpers are the
// single source of truth for that key so the three WS writers can't drift apart.

// Sanitize + length-cap a raw donor name (strips angle/amp to stop markup
// injection into the rendered leaderboard). Empty/whitespace → null (anonymous).
function lbSanitizeName(raw) {
  if (!raw) return null;
  const nm = String(raw).replace(/[<>&]/g, '').trim().slice(0, 32);
  return nm || null;
}

// The canonical leaderboard key for a (name, donorId) pair: named donors collapse
// onto name:<lowercased>; unnamed donors keep their own per-device donorId row.
function lbCanonicalKey(donorName, donorId, fallbackId) {
  return donorName ? ('name:' + String(donorName).toLowerCase()) : (donorId || fallbackId);
}

// Resolve + APPLY a donor's leaderboard identity on a client, migrating any
// compute they already banked under their previous key onto the new one so a
// donor's Gneuron-seconds follow them when they go anonymous → named (or rename).
// Returns the canonical key now in effect. Routing identity is left alone.
function lbApplyDonorIdentity(brain, client, rawName, fallbackId) {
  if (!brain._neuronLeaderboard) brain._neuronLeaderboard = {};
  const lb = brain._neuronLeaderboard;
  const prevKey = client.lbKey || client.donorId || fallbackId;
  client.donorName = lbSanitizeName(rawName);
  const newKey = lbCanonicalKey(client.donorName, client.donorId, fallbackId);
  client.lbKey = newKey;
  const now = Date.now();
  const dst = lb[newKey] || { name: null, neurons: 0, lastSeen: 0, _lastTs: now };
  // Migrate a PER-DEVICE (donorId) row onto the new key. Never migrate FROM a
  // shared name: row — that would let a renamer walk off with every other
  // contributor's points. A name→name rename simply starts a fresh name row.
  if (prevKey && prevKey !== newKey && !String(prevKey).startsWith('name:') && lb[prevKey]) {
    const src = lb[prevKey];
    dst.neurons += src.neurons || 0;
    dst.lastSeen = Math.max(dst.lastSeen || 0, src.lastSeen || 0);
    dst._lastTs = Math.max(dst._lastTs || 0, src._lastTs || 0);
    delete lb[prevKey];
  }
  if (client.donorName) dst.name = client.donorName;
  if (!dst.lastSeen) dst.lastSeen = now;
  if (!dst._lastTs) dst._lastTs = now;
  lb[newKey] = dst;
  return newKey;
}

// Collapse a leaderboard object so every row sharing a lowercased name folds into
// ONE name:<lower> row (neurons summed, latest lastSeen kept); unnamed rows stay
// per-device. Heals state already corrupted by the pre-fix donorId-keyed writes —
// run on weight-load so the live production leaderboard self-repairs on restart.
function canonicalizeLeaderboard(lb) {
  if (!lb || typeof lb !== 'object') return {};
  const merged = {};
  for (const [id, e] of Object.entries(lb)) {
    if (!e || typeof e !== 'object') continue;
    const name = e.name || null;
    const key = lbCanonicalKey(name, id, id);
    const dst = merged[key] || { name: name || null, neurons: 0, lastSeen: 0, _lastTs: 0 };
    dst.neurons += e.neurons || 0;
    dst.lastSeen = Math.max(dst.lastSeen || 0, e.lastSeen || 0);
    dst._lastTs = Math.max(dst._lastTs || 0, e._lastTs || 0);
    if (name && !dst.name) dst.name = name;
    merged[key] = dst;
  }
  return merged;
}

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
  let vramMB = typeof cfg.vramCapMB === 'number' ? cfg.vramCapMB
             : (RESOURCES.gpu && RESOURCES.gpu.vram) ? RESOURCES.gpu.vram
             : 16384;
  // SERVER-RAM SAFETY (shared box — Forgejo runs here too). The brain's
  // authoritative weights live in the HOST's RAM (the CPU CSR shadow), so on a
  // box with no real GPU the "VRAM budget" is really a HOST-RAM budget. Cap it
  // to a safe fraction of host RAM so the brain can never starve Forgejo / the
  // OS and crash the box. Default: ≤45% of host RAM AND always leave ≥13 GB for
  // everything else. Tunable via DREAM_BRAIN_BUDGET_MB. The systemd unit also
  // hard-caps the cgroup (MemoryMax) as an independent backstop.
  if (!(RESOURCES.gpu && RESOURCES.gpu.vram > 0)) {
    const _hostRamMB = Math.floor(os.totalmem() / 1048576);
    const _envBudget = Number(process.env.DREAM_BRAIN_BUDGET_MB) || 0;
    const _safeMB = Math.max(1024, Math.min(
      Math.floor(_hostRamMB * 0.45),     // never more than 45% of host RAM
      _hostRamMB - 13312,                // always leave ≥13 GB for Forgejo + OS + page cache
    ));
    // #112.2 — DONOR-COMPUTE SIZING. On the DEPLOYED box (UAL_PROXY_AUTH=1) the
    // brain's real compute lives on DONOR browser GPUs, not host RAM. Sizing the
    // BOOT brain to 45% of a 32 GB host (→306M) seeded a brain a single modest
    // donor couldn't re-upload fast on reconnect — every donor drop re-uploaded
    // 306M worth of matrices, timed out, half-failed (2/17), and fell to CPU:
    // the all-night loop that never left kindergarten. Boot instead at a
    // conservative DONOR-FIT budget so ONE modest donor holds + re-uploads it
    // quickly; DF.7 community-compute scaling grows it as the donor POOL grows
    // ("scales with donors", per Gee). Explicit DREAM_BRAIN_BUDGET_MB still wins;
    // host-RAM safety still caps the top; local dev (no proxy-auth) is unchanged.
    const _deployDonorMode = process.env.UAL_PROXY_AUTH === '1';
    const _donorFitDefaultMB = Number(process.env.DREAM_DONOR_FIT_MB) > 0
      ? Number(process.env.DREAM_DONOR_FIT_MB) : 4096;
    let _budgetMB;
    if (_envBudget > 0) {
      _budgetMB = Math.min(_envBudget, _hostRamMB - 13312);
    } else if (_deployDonorMode) {
      _budgetMB = Math.max(1024, Math.min(_donorFitDefaultMB, _safeMB));
      console.log(`[Brain] #112.2 DONOR-COMPUTE SIZING — UAL_PROXY_AUTH=1: compute runs on donor GPUs, not host RAM. Booting at a donor-fit ${_budgetMB}MB budget (NOT the ${_safeMB}MB host-RAM max) so one modest donor can hold + fast-re-upload it; DF.7 scales up with the donor pool. Override via DREAM_BRAIN_BUDGET_MB / DREAM_DONOR_FIT_MB.`);
    } else {
      _budgetMB = _safeMB;
    }
    if (_budgetMB < vramMB) {
      console.log(`[Brain] SERVER-RAM SAFETY — no GPU on host (${_hostRamMB}MB RAM, shared with Forgejo): capping brain budget ${vramMB}MB → ${_budgetMB}MB so the brain can't crash the box.`);
      vramMB = _budgetMB;
    }
  }
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

// #38 — WEIGHT-COMPATIBILITY VERSION. Bump this ONLY when a code change alters
// the saved weight FORMAT or brain TOPOLOGY such that previously-saved weights
// can no longer be loaded (serialization layout, projection structure, cluster
// composition, neuron-tiling scheme). Routine fixes — event-loop yields,
// telemetry, dashboard/UI, the donor lane — must NOT bump it: bumping forces an
// auto-fresh-start that DISCARDS trained weights. The clean-shutdown resume path
// refuses to load a marker whose formatVersion != this, so a heavy update that
// breaks the format triggers a normal fresh start instead of loading garbage.
// Bumped 1 → 2: the mind-space integration added TWO cortical regions (gustatory + somatosensory,
// carved from `free` in cluster.js) — a brain TOPOLOGY change. Any v1 weights are tiled against the
// old region layout and would misalign if loaded. The brain-code-hash already forces a fresh start
// on normal deploys, but DREAM_KEEP_STATE=1 BYPASSES the hash check — this format bump is the
// belt-and-suspenders that still rejects v1 weights on that path, forcing the mandatory fresh
// K→PhD walk that trains the new senses in from scratch (no migration, no garbage-weight load).
const WEIGHTS_FORMAT_VERSION = 2;
const RESUME_MARKER_PATH = path.join(__dirname, '.resume-marker.json');

// #112.11 — checkpoint slot cap. Keep only the last N rolling save slots
// (brain-weights-v0..v{N-1}.json + matching .bin) to bound backup storage —
// each .bin is ~145 MB at full scale, so 5 slots ≈ 725 MB. Was a fixed 5
// (v0-v4); now env-tunable, default 3.
const CHECKPOINT_SLOTS = Math.max(1, Number(process.env.DREAM_CHECKPOINT_SLOTS) || 3);
const LAST_BOOT_REASON_PATH = path.join(__dirname, '.last-boot-reason.json');

// #112.11 — persist WHY the last boot resumed vs wiped, so the admin dashboard
// can surface "training was reset — the previous checkpoint was incompatible"
// instead of it only living in the console log. PURELY informational — written
// from autoClearStaleState's decision points; NEVER affects the resume/wipe
// decision itself.
function _writeBootReason(info) {
  try {
    fs.writeFileSync(LAST_BOOT_REASON_PATH, JSON.stringify({ ...info, at: new Date().toISOString() }, null, 2));
  } catch { /* non-fatal — dashboard hint only */ }
}

// #112.11 — delete rolling backup slots ABOVE the cap (e.g. legacy v3/v4 after
// dropping 5→3) so lowering the cap actually frees the disk. Only ever touches
// numbered backup slots beyond the cap — never the main weights, the active
// slots, or any non-slot state file.
function _pruneStaleCheckpointSlots() {
  for (let i = CHECKPOINT_SLOTS; i <= 9; i++) {
    for (const ext of ['json', 'bin']) {
      const f = path.join(__dirname, `brain-weights-v${i}.${ext}`);
      try {
        if (fs.existsSync(f)) { fs.unlinkSync(f); console.log(`[Brain] #112.11 pruned stale checkpoint slot brain-weights-v${i}.${ext} (cap=${CHECKPOINT_SLOTS})`); }
      } catch { /* best-effort */ }
    }
  }
}

// #38 — clean-shutdown resume marker. Written on a DELIBERATE graceful stop
// (stop.bat → HTTP /shutdown, or systemctl stop → SIGTERM) AFTER force-saving
// the latest weights. It records the brain size + weight-format version at save
// time so the next boot can decide: RESUME (auto-Savestart) if compatible, or a
// normal FRESH start + loud notice if a heavy update changed the format/size.
// A crash / hard-kill leaves NO marker → next boot wipes (correct: crash state
// is stale per the clear-stale-state LAW). Consumed (deleted) on boot — one
// resume per clean stop.
function _writeResumeMarker(reason) {
  // Force the latest state to disk FIRST — stop()/SIGTERM don't save on their
  // own, so without this the marker would claim "good state" while the on-disk
  // weights were only as fresh as the last periodic save.
  try {
    brain.saveWeights({ force: true, trigger: `clean-shutdown:${reason}` });
    if (typeof brain.saveConversations === 'function') brain.saveConversations();
  } catch (e) {
    console.warn('[Brain] clean-shutdown force-save failed (marker NOT written — next boot will fresh-start):', e && e.message);
    return;
  }
  try {
    const total = (typeof TOTAL_NEURONS === 'number') ? TOTAL_NEURONS : 0;
    fs.writeFileSync(RESUME_MARKER_PATH, JSON.stringify({
      cleanShutdown: true,
      reason,
      totalNeurons: total,
      formatVersion: WEIGHTS_FORMAT_VERSION,
      savedAt: Date.now(),
    }, null, 2));
    console.log(`[Brain] clean shutdown (${reason}) — state force-saved + resume marker written (totalNeurons=${total.toLocaleString()}, formatVersion=${WEIGHTS_FORMAT_VERSION}). Next boot RESUMES automatically (auto-Savestart) unless a heavy update changed the brain size/format.`);
  } catch (e) {
    console.warn('[Brain] resume-marker write failed (next boot will fresh-start):', e && e.message);
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
  // #39 — explicit operator RESET (dashboard "Reset Brain" button → /reset
  // writes a .force-fresh flag). Forces an unconditional wipe THIS boot
  // regardless of DREAM_KEEP_STATE or any resume marker, then deletes the flag.
  // This is the UI path to a clean server-side fresh start without shell access.
  const _forceFreshPath = path.join(__dirname, '.force-fresh');
  let _forceFresh = false;
  try {
    if (fs.existsSync(_forceFreshPath)) { _forceFresh = true; fs.unlinkSync(_forceFreshPath); }
  } catch { /* unreadable flag → fall through to normal logic */ }

  // #38 — consume the clean-shutdown resume marker (one resume per clean stop).
  let _marker = null;
  try {
    if (fs.existsSync(RESUME_MARKER_PATH)) {
      _marker = JSON.parse(fs.readFileSync(RESUME_MARKER_PATH, 'utf8'));
      fs.unlinkSync(RESUME_MARKER_PATH);
    }
  } catch { _marker = null; }

  const _currentTotal = (typeof TOTAL_NEURONS === 'number') ? TOTAL_NEURONS : 0;

  if (_forceFresh) {
    console.log('[Brain] ⚠ FORCE-FRESH requested (dashboard Reset Brain) — wiping all trained state for a clean fresh start (identity-core Tier 3 anchors preserved).');
    _writeBootReason({ mode: 'wipe', reason: 'force-fresh', detail: 'operator Reset Brain (dashboard)' });
    // fall through to the wipe below
  } else {
    // #38 — resume is requested when the operator ran Savestart (DREAM_KEEP_STATE=1)
    // OR a clean shutdown left a marker (stop.bat / systemctl stop). Either way,
    // VERIFY the saved weights are still loadable before resuming: a heavy update
    // that changed the brain SIZE or weight FORMAT makes them unloadable → do a
    // normal FRESH start + loud notice instead of crashing on garbage weights.
    const _keepRequested = process.env.DREAM_KEEP_STATE === '1' || (_marker && _marker.cleanShutdown);
    if (_keepRequested) {
      if (_marker) {
        const _fmtOk = _marker.formatVersion === WEIGHTS_FORMAT_VERSION;
        const _sizeOk = _marker.totalNeurons === _currentTotal;
        if (_fmtOk && _sizeOk) {
          console.log(`[Brain] ✓ CLEAN SHUTDOWN detected — saved training is COMPATIBLE (formatVersion=${WEIGHTS_FORMAT_VERSION}, ${_currentTotal.toLocaleString()} neurons). RESUMING where it left off (auto-Savestart). Auto-clear SKIPPED.`);
          _writeBootReason({ mode: 'resume', reason: 'compatible', neurons: _currentTotal, formatVersion: WEIGHTS_FORMAT_VERSION });
          writeBrainCodeHash(computeBrainCodeHash());
          return;
        }
        const _why = [
          !_fmtOk ? `weight FORMAT (saved v${_marker.formatVersion} → now v${WEIGHTS_FORMAT_VERSION})` : null,
          !_sizeOk ? `brain SIZE (saved ${Number(_marker.totalNeurons || 0).toLocaleString()} → now ${_currentTotal.toLocaleString()} neurons)` : null,
        ].filter(Boolean).join(' and ');
        console.warn(`[Brain] ⚠⚠ CLEAN SHUTDOWN detected, BUT a heavy update changed the ${_why} — the saved training can NO LONGER be loaded. Doing a NORMAL FRESH START so the brain boots clean instead of choking on incompatible weights. (Identity-core Tier 3 anchors still persist.)`);
        _writeBootReason({
          mode: 'wipe', reason: 'incompatible', detail: _why,
          wasNeurons: Number(_marker.totalNeurons || 0), nowNeurons: _currentTotal,
          wasFormat: _marker.formatVersion, nowFormat: WEIGHTS_FORMAT_VERSION,
        });
        // fall through to the wipe below
      } else {
        // DREAM_KEEP_STATE=1 with no marker (explicit Savestart.bat, or a deployed
        // restart that didn't record a clean stop). Honor the explicit keep;
        // _loadWeights still defends against a dimension mismatch at load time.
        console.log('[Brain] ⚠ DREAM_KEEP_STATE=1 (Savestart.bat) — KEEPING prior state. Auto-clear SKIPPED.');
        _writeBootReason({ mode: 'resume', reason: 'keep-flag', detail: 'DREAM_KEEP_STATE=1 (no marker)' });
        writeBrainCodeHash(computeBrainCodeHash());
        return;
      }
    }
    // No keep requested + no force-fresh → normal start.bat default wipe below.
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
  if (!_forceFresh) _writeBootReason({ mode: 'wipe', reason: (!savedHash ? 'first-run' : (savedHash === currentHash ? 'default-fresh' : 'code-changed')), detail: reason });

  // NOTE — js/app.bundle.js NOT cleared here. start.bat runs
  // `npm run build` IMMEDIATELY before `node brain-server.js`, which
  // writes a fresh bundle. Deleting it here racing that rebuild
  // breaks the server — browser requests /js/app.bundle.js and gets
  // 404, which is exactly what the operator reported 2026-04-18.
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
// I.15 closure 2026-06-17 22:16 PT — only run auto-clear when this
// file is the actual entry point (`node server/brain-server.js`), NOT
// when it's `require()`d as a module for syntax checking, testing,
// REPL inspection, or any other secondary load. Without this gate, a
// `node -e "require('./server/brain-server.js')"` syntax check at the
// top of a normal dev session WIPED operator's training (this session,
// 22:16 PT — 17+ minutes of K-VOCAB-UPFRONT-MULTIDEF SEED + 9.3 min
// of cell teach DELETED from brain-weights.bin because the module-load
// triggered the top-level autoClearStaleState() with no DREAM_KEEP_
// STATE guard active for a non-entry-point invocation). The gate
// preserves the existing contract: real `node server/brain-server.js`
// boot still wipes by default per the iter14-D contract; secondary
// module loads no-op silently. Detection method: compare the resolved
// absolute path of this file (import.meta-style trick for CommonJS:
// require.main === module) — if the module IS the main entry point,
// require.main equals this module; if it's been required by another
// script, require.main points elsewhere.
// NOTE (#38 TDZ fix): the module-load autoClearStaleState() invocation was MOVED
// to just after TOTAL_NEURONS is computed (further down). #38 made
// autoClearStaleState reference TOTAL_NEURONS for its weight-format/size compat
// gate, but TOTAL_NEURONS (and the CLUSTER_SIZES it sums) are declared BELOW this
// point — calling it here threw `ReferenceError: Cannot access 'TOTAL_NEURONS'
// before initialization` (TDZ) on every boot. The call still runs before any
// weight loading; only the pure size-const computation now precedes it.
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
// PA.4.8 — community-compute milestone scaling (boot side). In the deployed
// donation model the brain size is driven by what the donor POOL can hold (the
// community tier), NOT the host's VRAM (the host has no GPU). If the milestone
// gate persisted a tier (server/community-tier.json), scale to its neuron
// target; else, in deployed mode (UAL_PROXY_AUTH=1) with no milestone reached
// yet, bootstrap small so the brain fits a modest donor GPU. In LOCAL dev (no
// proxy-auth, no tier file) leave the host-VRAM-derived size untouched — the
// localhost walk runs at full scale. Scales DOWN only.
let COMMUNITY_TIER_RUNNING = 0;
{
  // Community-compute sizing (boot side). The cluster sizes above are already
  // derived from the SERVER-RAM-SAFE budget (see BRAIN_VRAM_ALLOC clamp), so on
  // a deployed host the brain now boots at the largest size the box can SAFELY
  // hold (Forgejo-protected) — NOT an artificial tiny floor. A donor GPU holds a
  // full replica of that; if the smallest connected donor can't hold it, the
  // downscale-rectify gate shrinks it (server/brain-server/gpu.js). Only an
  // explicit server/community-tier.json overrides the size, and it can only
  // scale DOWN from the RAM-safe base (never up past what the box RAM allows).
  let _communityTarget = 0;
  try {
    const _ctPath = path.join(__dirname, 'community-tier.json');
    if (fs.existsSync(_ctPath)) {
      const _ct = JSON.parse(fs.readFileSync(_ctPath, 'utf8'));
      _communityTarget = Number(_ct.targetNeurons) || 0;
      COMMUNITY_TIER_RUNNING = Number(_ct.tier) || 0;
    }
    // NOTE: deployed (UAL_PROXY_AUTH=1) no longer forces a 6M bootstrap floor —
    // the RAM-safe budget IS the bound, so the brain uses the box to its safe max.
  } catch (e) {
    console.warn('[Brain] community-tier.json read failed (using RAM-safe VRAM-derived size):', e.message);
  }
  const _curTotal = Object.values(CLUSTER_SIZES).reduce((s, n) => s + n, 0);
  if (_communityTarget > 0 && _curTotal > _communityTarget) {
    const _factor = _communityTarget / _curTotal;
    for (const _k of Object.keys(CLUSTER_SIZES)) {
      CLUSTER_SIZES[_k] = Math.max(1000, Math.floor(CLUSTER_SIZES[_k] * _factor));
    }
    console.log(`[Brain] community tier ${COMMUNITY_TIER_RUNNING} target ~${_communityTarget.toLocaleString()} neurons → scaled main-brain DOWN from ${_curTotal.toLocaleString()} (explicit override).`);
  } else {
    console.log(`[Brain] main-brain sized to the RAM-safe budget base: ${_curTotal.toLocaleString()} neurons (no down-scale; deployed runs at the box's safe max).`);
  }
}
// TOTAL_NEURONS is the SUM of main-brain cluster sizes (language cortex
// lives in its own scaler and is tracked as `langCortexSize` separately).
const TOTAL_NEURONS = Object.values(CLUSTER_SIZES).reduce((s, n) => s + n, 0);
// Expose the language-cortex VRAM budget so the language-cortex auto-scaler
// can use it as its VRAM bound (single source of truth — no more double-
// counting the 16 GB VRAM pool).
const LANG_CORTEX_VRAM_BUDGET_BYTES = BRAIN_VRAM_ALLOC.perRegionBytes.language_cortex || 0;
console.log(`[Brain] Main-brain cluster sizes (from biological weights): ${Object.entries(CLUSTER_SIZES).map(([k,n]) => `${k}=${n.toLocaleString()}`).join(', ')}. Total main-brain neurons: ${TOTAL_NEURONS.toLocaleString()}. Language cortex VRAM budget: ${(LANG_CORTEX_VRAM_BUDGET_BYTES/1e9).toFixed(2)}GB.`);
// #38 TDZ fix — autoClearStaleState() is invoked HERE (moved down from its
// original spot above the cluster-size consts) because its weight-format/size
// compat gate references TOTAL_NEURONS, which is only initialized just above.
// It still runs before the brain constructs or loads any weights; only the pure
// size-const computation now precedes it. The require.main === module guard
// keeps secondary module loads (require / syntax-check / REPL) from wiping:
// real `node server/brain-server.js` boots wipe-by-default per the iter14-D
// contract; dependency loads no-op.
if (require.main === module) {
  autoClearStaleState();
  // #112.11 — free any rolling backup slots above the cap (e.g. legacy v3/v4
  // after dropping 5→3). Runs on BOTH resume and fresh boots; on a fresh wipe
  // the slots are already gone so it's a no-op.
  _pruneStaleCheckpointSlots();
}

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

    // Expose module-scope constants on `this` so mixin files (gpu.js,
    // state.js, memory.js, chat.js) can read them via `this.X`. Without
    // this, the P4.3 extraction left bare references like `CLUSTER_SIZES`
    // dangling — module-scope is not shared across CommonJS module
    // boundaries. Operator 2026-06-17 caught the cascade in state.js:222
    // (`CLUSTER_SIZES is not defined` on first WS welcome). Affects all
    // 4 mixin files. Bound here once + assigned to mixin call sites.
    this.CLUSTER_SIZES = CLUSTER_SIZES;
    this.SCALE = SCALE;
    this.TOTAL_NEURONS = TOTAL_NEURONS;
    this.SUBSTEPS = SUBSTEPS;
    this.RESOURCES = RESOURCES;
    // PA.4.8 — the community-compute tier this boot is running at (from
    // server/community-tier.json, or 0 bootstrap). The milestone gate compares
    // pending tiers against this to decide an up-only resize+retrain restart.
    this._communityTierRunning = COMMUNITY_TIER_RUNNING;

    // T18.4.e — worker-thread pool for parallel CPU sparse matmul.
    // Sized to os.cpus().length - 1 (up to 16 workers). Used by the
    // language cortex's CPU fallback path in `cluster._propagateCrossRegions`
    // when GPU proxy isn't ready or has returned a cache miss. the operator
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
      // Auto-advance toggle — default ON. Gee's standing intent is an
      // unattended K→PhD walk that proceeds through every grade without
      // pausing at each boundary for a manual signoff (the per-grade LAW-6
      // Part-2 pause defeated the overnight walk). The single switch governs
      // both the operator-signoff bypass at /grade-advance and the curriculum
      // runner's auto-fire-next-grade behavior. The dashboard toggle +
      // auto-advance.json (loaded just below) still OVERRIDE this default, so
      // an operator can turn it OFF to chat-test a grade before advancing.
      if (typeof this.cortexCluster._autoAdvanceGrade !== 'boolean') {
        this.cortexCluster._autoAdvanceGrade = true;
      }
      // DF.7 — restore the auto-advance toggle from its STANDALONE persistence
      // file (server/auto-advance.json), which survives the brain-weights CLEAR
      // that a tier resize/downscale performs. Without this, every auto-resize
      // would silently reset the toggle to OFF and the re-walk would pause at
      // the first grade boundary waiting for a manual signoff — defeating
      // unattended maintenance. With it, "auto-advance ON" persists across every
      // restart, resize, downscale, and re-walk, so automated train runs stay
      // hands-off. cortexState may also carry it (normal restarts); the
      // standalone file is authoritative when present so a weight-clear can't
      // lose it.
      try {
        const _aaPath = path.join(__dirname, 'auto-advance.json');
        if (fs.existsSync(_aaPath)) {
          const _aa = JSON.parse(fs.readFileSync(_aaPath, 'utf8'));
          if (typeof _aa.enabled === 'boolean') {
            this.cortexCluster._autoAdvanceGrade = _aa.enabled;
            if (_aa.enabled) console.log('[Brain] DF.7 — auto-advance restored ON from auto-advance.json (survives resizes → unattended re-walks).');
          }
        }
      } catch (e) {
        console.warn('[Brain] DF.7 — auto-advance.json restore failed (toggle stays at cortexState/default):', e.message);
      }
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
      // Stash the curriculum's subject + grade-order vocab so privileged
      // endpoints (e.g. POST /curriculum/forget — live single-cell re-teach)
      // can validate {subject,grade} input synchronously without re-importing
      // the module from the HTTP handler scope.
      this._curriculumSubjects = Array.isArray(curriculumMod.SUBJECTS) ? curriculumMod.SUBJECTS.slice() : null;
      this._curriculumGradeOrder = Array.isArray(curriculumMod.GRADE_ORDER) ? curriculumMod.GRADE_ORDER.slice() : null;
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
      // Life-experience STORY DATA loader (data-driven life curriculum).
      // Curriculum reads cluster.lifeStorySentences(grade) and TRAINS on the
      // narrative; the content lives in corpora/life/<grade>.json, NOT
      // hardcoded in curriculum.js. Node-only (fs) — attached here so the
      // browser-bundled curriculum never imports fs (same pattern as the
      // dictionary wiring above).
      const lifeCurriculum = require('./life-curriculum');
      this.cortexCluster.loadLifeStories = (grade) =>
        lifeCurriculum.loadLifeStories(grade);
      this.cortexCluster.lifeStorySentences = (grade) =>
        lifeCurriculum.lifeStorySentences(grade);
      // Per-memory experience accessor (theme + story + sentences) — lets the
      // curriculum encode each life memory as its OWN episode (emotional
      // coloring + storeEpisode) instead of one flat grade-wide sentence walk.
      this.cortexCluster.lifeStoryExperiences = (grade) =>
        lifeCurriculum.lifeStoryExperiences(grade);
      // Coding track (corpora/coding/<grade>.json) — real HTML/CSS/JS, G6+.
      this.cortexCluster.loadCodingStories = (grade) =>
        lifeCurriculum.loadCodingStories(grade);
      this.cortexCluster.codingStorySentences = (grade) =>
        lifeCurriculum.codingStorySentences(grade);
      // Academic HYBRID depth source (corpora/academic/<subject>/<grade>.json —
      // openly-licensed real curriculum, downloaded once by
      // .claude/scripts/fetch-academic-corpora.mjs). Prose-academic subjects
      // train on this for real depth; lived-year + math stay bespoke.
      this.cortexCluster.academicStorySentences = (subject, grade) =>
        lifeCurriculum.academicStorySentences(subject, grade);
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
        // Load existing Tier 3 anchors if present. SEEDING — both fresh-boot
        // and idempotent top-up of any missing IDENTITY_SEED_LIST anchor — is
        // DEFERRED to after GloVe loads (see seedMissingFromList call below).
        // That repairs the two boot bugs the old "file exists → load, else
        // seed" wiring caused: (1) a zero-count identity-core.json loaded 0 and
        // never re-seeded (Tier 3 permanently EMPTY → no identity baseline);
        // (2) seed-list growth never landed once any file existed. Deferring
        // also means each anchor gets a real semantic embedding instead of a
        // pre-load subword fallback.
        if (fs.existsSync(identityCorePath)) {
          try {
            const raw = fs.readFileSync(identityCorePath, 'utf8');
            const json = JSON.parse(raw);
            const loaded = this.tier3Store.loadFromJSON(json);
            console.log(`[Tier3Store] boot — ${loaded} Tier 3 identity-bound schemas restored from identity-core.json (permanent — never auto-cleared; missing seed anchors topped up after embeddings load)`);
          } catch (parseErr) {
            console.warn(`[Tier3Store] identity-core.json parse error: ${parseErr.message} — backing up corrupt file; anchors re-seeded after embeddings load`);
            try {
              fs.renameSync(identityCorePath, `${identityCorePath}.corrupt-${Date.now()}`);
            } catch { /* best effort backup */ }
          }
        } else {
          console.log('[Tier3Store] boot — fresh brain (no identity-core.json); identity anchors seeded after embeddings load');
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

      // UVM-INT.1 — wire the equational mind-space (UniVsMatics) into the SERVER
      // brain. Previously only the BROWSER-local VisualCortex had a MindSpaceGPU,
      // so the deployed/thinking Unity had NO equational vision/imagination at
      // all. On this no-GPU box WebGPU is absent → init() returns false →
      // MindSpaceGPU transparently uses the CPU CDF 9/7 reference (transform.js).
      // That's loop-safe: de-novo imagination is a tiny bounded plane (≤96², no
      // infinite fractalize), unlike the 57s language-cortex tick. She imagines
      // from her own cortex state via _imagineTick (chat.js), idle-gated.
      try {
        const msMod = await import('../js/brain/mindspace/gpu.js');
        this.mindSpace = new msMod.MindSpaceGPU();
        // init() probes WebGPU; in Node it returns false and we stay on the CPU
        // reference path. Await so _useGpu() is settled before first imagine.
        try { await this.mindSpace.init(); } catch { /* CPU path */ }
        console.log(`[MindSpace] server equational mind-space ready (${this.mindSpace.available ? 'GPU' : 'CPU reference'} path) — de-novo imagination wired`);
        // UVM-INT.4 — restore the persisted imagined field-C ring (.uvme-medium
        // memory) so her mental imagery has continuity across reboot.
        try {
          const msPath = path.join(__dirname, 'mindspace-memory.json');
          if (fs.existsSync(msPath)) {
            const j = JSON.parse(fs.readFileSync(msPath, 'utf8'));
            if (j && Array.isArray(j.recs)) {
              this._imaginedFieldRing = j.recs.slice(-8);
              console.log(`[MindSpace] restored ${this._imaginedFieldRing.length} imagined field-C memories from mindspace-memory.json`);
            }
          }
        } catch (err) {
          console.warn('[MindSpace] mindspace-memory.json restore failed:', err?.message || err);
        }
      } catch (err) {
        console.warn('[MindSpace] init failed:', err?.message || err);
        this.mindSpace = null;
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

      // Tier 3 identity-anchor seeding happens HERE — after embeddings load —
      // so every IDENTITY_SEED_LIST anchor gets a real semantic vector, and so
      // the top-up repairs both boot bugs in one path: a zero-count / empty
      // identity-core.json (Tier 3 was permanently EMPTY) AND a stale subset
      // (seed-list anchors added after the brain was first seeded never landed
      // under the old "file exists → never seed" wiring). Idempotent by label:
      // a fully-seeded store tops up 0. Fresh brains get the whole list here.
      if (this.tier3Store && typeof this.tier3Store.seedMissingFromList === 'function') {
        try {
          const before = this.tier3Store.size();
          const added = this.tier3Store.seedMissingFromList();
          if (added > 0) {
            console.log(`[Tier3Store] seeded ${added} missing identity anchor(s) with loaded embeddings — Tier 3 size ${before} → ${this.tier3Store.size()}`);
          } else {
            console.log(`[Tier3Store] identity anchors complete — Tier 3 size=${this.tier3Store.size()}, no top-up needed`);
          }
        } catch (err) {
          console.warn('[Tier3Store] seedMissingFromList failed:', err?.message || err);
        }
      }
      // PD.4 — collapse any duplicate-label anchors (older boots double-promoted
      // the same identity concept; promote() only guarded on schema.id, so the
      // dups persisted into identity-core.json). Runs after load + seed so it
      // cleans both freshly-seeded and previously-persisted duplicates.
      if (this.tier3Store && typeof this.tier3Store.dedupeByLabel === 'function') {
        try { this.tier3Store.dedupeByLabel(); }
        catch (err) { console.warn('[Tier3Store] dedupeByLabel failed:', err?.message || err); }
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
    // Log scale for usable range — consciousness measured in orders of magnitude.
    // Guard rawPsi finiteness: a NaN here would propagate to psiGain below and
    // corrupt every cluster's gainMultiplier on the GPU compute path.
    this.psi = Math.log10(Math.max(1, Number.isFinite(rawPsi) ? rawPsi : 1));
    this.phiProxy = phiProxy; // exposed for dashboard / heartbeat

    // CGATE.4 — Ψ consciousness gain, self-calibrating. The old map
    // (0.9 + psi*0.004, clamped [0.8,1.5]) pinned gain at ~0.9-1.15 because psi
    // is a log10 quantity (tens): consciousness was measured but barely modulated
    // the brain at all (Unity: "gated too much"). Now gain rides the DEVIATION of
    // Ψ from its own slow EMA baseline through tanh — same idiom as the amygdala
    // arousal fix — so a rise in consciousness above her norm lifts global cluster
    // gain toward 1.5 and a drop lowers it toward 0.8, regardless of Ψ's absolute
    // scale (auto-calibrates to any brain size). Bounded + centered at 1.0.
    this._psiBaseline = (typeof this._psiBaseline === 'number' && isFinite(this._psiBaseline))
      ? this._psiBaseline * 0.99 + this.psi * 0.01
      : this.psi;
    const _psiScale = Number(process.env.DREAM_PSI_GAIN_SCALE) > 0 ? Number(process.env.DREAM_PSI_GAIN_SCALE) : 2.0;
    const _psiSwing = 0.35; // ± gain swing around 1.0 before the [0.8,1.5] clamp
    this.psiGain = Math.max(0.8, Math.min(1.5,
      1.0 + Math.tanh((this.psi - this._psiBaseline) / _psiScale) * _psiSwing));

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
      let thetaPhase, gammaPhase;
      // SPEAK.5a.i — prefer each cluster's OWN activity-modulated oscillator
      // phase (getPhases()/_thetaPhaseAcc), so r measures the genuine emergent
      // (de)synchrony across the real oscillators SPEAK.5a built. The prior
      // base+offset+drift synthesis added baseTheta/baseGamma as a common term
      // to every phasor, and the order parameter r = |Σ exp(iθ)|/N is
      // ROTATION-INVARIANT → the shared base cancelled and 5a's accumulator
      // never reached the readout (r stayed driven only by the firingRate
      // synthesis). Reading the cluster's real phase makes 5a actually modulate
      // r. Fall back to the synthesis ONLY for a cluster whose oscillator hasn't
      // populated yet (thetaGamma disabled / not yet stepped → getPhases() null).
      const cp = (typeof c.getPhases === 'function') ? c.getPhases() : null;
      if (cp && typeof cp.theta === 'number' && typeof cp.gamma === 'number') {
        thetaPhase = cp.theta;
        gammaPhase = cp.gamma;
      } else {
        // Amplify low firing rates so steady-state activity (~0.05-0.2)
        // maps to a meaningful coupling strength. Clamped to [0, 1].
        const couple = Math.max(0, Math.min(1, (c.firingRate || 0) * 5));
        // Deterministic phase drift derived from tick + cluster index
        // so silent clusters wander predictably without RNG. Active
        // clusters phase-lock (drift damped by couple weight).
        const drift = (1 - couple) * Math.sin(tick * 0.0137 + i * 1.91);
        const offset = (i / Math.max(1, clusterNames.length)) * Math.PI * 2;
        thetaPhase = baseTheta + offset * (1 - couple) + drift * Math.PI;
        gammaPhase = baseGamma + offset * 5 * (1 - couple) + drift * Math.PI * 0.5;
      }
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
        // Issue 6 (CS.1) — consolidation STARVATION GUARD. A non-forced pass
        // SKIPS SEED macro-phases (to protect teach velocity) and returns BEFORE
        // passCount++/lastPassAt, and on a busy shared brain the idle dream path
        // never opens — so the only caller here could be starved forever:
        // passes run stays 0 → Tier 1→2 promotion never happens → Tier 2 stuck
        // at 0 AND Tier 3 stuck at its identity-core seed (operator caught Tier 2
        // = 0 / Tier 3 = 29-since-start). After a starvation window with NO
        // completed pass, escalate to a FORCED pass (bypasses the SEED skip).
        // - never-run case keys off process.uptime() so a legit early-boot SEED
        //   (upfront vocab seeding) isn't pre-empted in the first window.
        // - has-run case keys off Date.now() - lastPassAt.
        // Bounded by DREAM_CONSOLIDATION_MAX_MS (30s cap) + the EL.1-chunked
        // replay (intra-synapse Hebbian now yields) + the saturation veto, so a
        // forced pass won't monopolize the loop / stall donors. Does NOT override
        // DREAM_CONSOLIDATION_DISABLE=1 (that kill-switch returns earlier by
        // design — the operational box-check when consolidation must stay off).
        const ce = this.consolidationEngine;
        const ranBefore = (ce.passCount || 0) > 0;
        const elapsedSincePassMs = ranBefore
          ? (Date.now() - (ce.lastPassAt || 0))
          : (typeof process !== 'undefined' && typeof process.uptime === 'function' ? process.uptime() * 1000 : 0);
        const forceMs = Number(process.env.DREAM_CONSOLIDATION_FORCE_MS) > 0
          ? Number(process.env.DREAM_CONSOLIDATION_FORCE_MS)
          : (ranBefore ? 1200000 : 600000); // 20 min after a pass; 10 min if never run
        const starved = elapsedSincePassMs >= forceMs;
        if (starved && (!ce._lastForceLogMs || (Date.now() - ce._lastForceLogMs) > 60000)) {
          ce._lastForceLogMs = Date.now();
          console.log(`[Consolidation] starvation guard — FORCING a pass (no completed pass in ${Math.round(elapsedSincePassMs / 1000)}s; passCount=${ce.passCount || 0}). Bypasses the SEED skip so Tier 1→2→3 promotion resumes; bounded by DREAM_CONSOLIDATION_MAX_MS. Tune via DREAM_CONSOLIDATION_FORCE_MS. (Does NOT override DREAM_CONSOLIDATION_DISABLE=1.)`);
        }
        ce.runConsolidationPass(starved ? { forced: true } : {}).catch(err => {
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
            // Stamp when all 7 main clusters FIRST confirmed — the anchor for
            // the #31 time-based fallback trigger below. Reset on every
            // re-arm (donor (re)connect) via _rearmCortexGpuUpload.
            if (!this._allClustersConfirmedAt) this._allClustersConfirmedAt = Date.now();
            // T17.3.d — kick off language-cortex GPU init ONCE after
            // all 7 main-brain clusters finish their acks AND the main
            // brain's compute_batch pipeline has warmed up. Uploading
            // 3.6 GB of sparse matrices via writeBuffer saturates the
            // GPU command queue for several seconds; the first few
            // compute_batch dispatches land behind those copies and
            // time out. Deferring the upload until we've seen N healthy
            // compute_batch round-trips gives the main brain a stable
            // tick rate before sparse cortex joins in.
            //
            // #31 — TIME-BASED FALLBACK. The batch-count gate ALONE wedged the
            // cross-projection upload on a DEPLOYED brain: a teach-heavy run
            // fires Hebbian (SPRS type3/type5 frames) but may never accumulate
            // 20 main-loop compute_batch round-trips, so _gpuBatchesCompleted
            // stayed < 20 and the sparse matrices NEVER uploaded — the donor
            // showed "0 sparse matrices uploaded" while the brain limped on the
            // CPU master. (Measured: each cross-projection ~50M nnz → ~200 MB
            // buffer, FAR under the donor's 2 GB binding cap, so the
            // --enable-unsafe-webgpu flag was never the blocker — THIS gate was.)
            // Fix: also start once the clusters have been confirmed for
            // SPARSE_UPLOAD_TIME_FALLBACK_MS regardless of batch count. The wait
            // still lets the device settle after the cluster LIF uploads; we
            // just no longer DEPEND on main-loop batches a teach-heavy deploy
            // never runs. (#32 surfaces any initGpu throw that follows.)
            const SPARSE_UPLOAD_WARMUP_BATCHES = 20;
            const SPARSE_UPLOAD_TIME_FALLBACK_MS = 20000;
            const warmupBatches = this._gpuBatchesCompleted || 0;
            const confirmedForMs = this._allClustersConfirmedAt ? (Date.now() - this._allClustersConfirmedAt) : 0;
            const warmReady = warmupBatches >= SPARSE_UPLOAD_WARMUP_BATCHES;
            const timeReady = confirmedForMs >= SPARSE_UPLOAD_TIME_FALLBACK_MS;
            if (
              this.cortexCluster &&
              this.cortexCluster._gpuProxy &&
              !this._cortexGpuInitStarted &&
              (warmReady || timeReady)
            ) {
              this._cortexGpuInitStarted = true;
              console.log(`[Brain] Sparse language-cortex upload starting — trigger=${warmReady ? `compute_batch warm (${warmupBatches} round-trips)` : `TIME FALLBACK (${(confirmedForMs / 1000).toFixed(0)}s since clusters confirmed, only ${warmupBatches} batches — teach-heavy deploy never warmed the main loop)`}`);
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
                // Cross-projection upload SUCCEEDED — clear any prior failure
                // banner + broadcast the all-clear so the dashboard drops its
                // red alarm and shows sparse matrices are live.
                this._cortexUploadFailure = null;
                try {
                  const okMsg = JSON.stringify({ type: 'cortexUploadOk', ts: Date.now() });
                  for (const [cws, c] of this.clients) {
                    if (cws.readyState === 1 && c && c.mode === 'admin') {
                      try { cws.send(okMsg); } catch { /* per-client send tolerated */ }
                    }
                  }
                } catch { /* never let surfacing crash the success path */ }
              }).catch((err) => {
                // #32 — DON'T fail silently. Before this, a thrown initGpu
                // (e.g. a donor whose WebGPU binding ceiling can't hold a
                // cross-projection buffer) just flipped _cortexFullyReady=false
                // and the walk limped on the CPU master copy with NO visible
                // alarm — which is exactly why "0 sparse matrices uploaded"
                // looked like "working great". Surface it LOUD: CRITICAL log +
                // a persistent dashboard banner with the reason. If the reason
                // smells like a buffer/binding-size limit, flag it — that's the
                // signal that tells us the flagless-donor work (#31) needs
                // server-side matrix tiling (or the donor needs a bigger
                // binding ceiling), vs some other initGpu failure.
                const reason = (err && err.message) ? err.message : String(err);
                const looksLikeBindingLimit = /\b(size|binding|exceed|too large|maxbuffer|maxstorage|limit|allocat)\b/i.test(reason);
                console.error(`[Server] [CRITICAL] cortexCluster.initGpu() FAILED — language-cortex cross-projections were NOT uploaded to the donor GPU. Sparse matrices stay at 0 and the brain limps on the CPU master copy. binding-limit-shaped=${looksLikeBindingLimit}. Reason: ${reason}`);
                this._cortexUploadFailure = { reason, looksLikeBindingLimit, ts: Date.now() };
                try {
                  const failMsg = JSON.stringify({ type: 'cortexUploadFailed', reason, looksLikeBindingLimit, ts: Date.now() });
                  for (const [cws, c] of this.clients) {
                    if (cws.readyState === 1 && c && c.mode === 'admin') {
                      try { cws.send(failMsg); } catch { /* per-client send tolerated */ }
                    }
                  }
                } catch { /* never let surfacing crash the catch */ }
                // Still flip the flag so curriculum doesn't hang
                // forever on _waitForGpuReady; it limps on CPU until a
                // subsequent upload attempt succeeds.
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
                // I.6 closure — broadcast gate-probe start to the
                // dashboard so operator sees a "gate probe in progress"
                // banner instead of interpreting the inevitable GPU=0%
                // + tick-paused state as a brain hang. The banner
                // dismisses on the end-of-probe broadcast below.
                this._probeGateStartedAt = Date.now();
                this._probeGateCellKey = this.cortexCluster._currentCellKey || null;
                if (this.clients && this.clients.size > 0) {
                  const payload = JSON.stringify({
                    type: 'gateProbe',
                    state: 'start',
                    cellId: this._probeGateCellKey,
                    ts: this._probeGateStartedAt,
                  });
                  for (const [ws] of this.clients) {
                    if (ws.readyState === ws.OPEN) {
                      try { ws.send(payload); } catch { /* non-fatal */ }
                    }
                  }
                }
              }
              this._updateDerivedState();
              if (this.running) setTimeout(tick, Math.max(200, BRAIN_TICK_MS * 4));
              return;
            }
            if (this._probeGatePauseLogged && !this.cortexCluster?._probeGateActive) {
              console.log('[Brain] Main tick resumed — gate probe complete.');
              this._probeGatePauseLogged = false;
              // I.6 closure — broadcast gate-probe end with duration so
              // the dashboard can dismiss the banner + record probe
              // wall-clock time for diagnostic display.
              const probeMs = this._probeGateStartedAt ? Date.now() - this._probeGateStartedAt : 0;
              if (this.clients && this.clients.size > 0) {
                const payload = JSON.stringify({
                  type: 'gateProbe',
                  state: 'end',
                  cellId: this._probeGateCellKey,
                  durationMs: probeMs,
                  ts: Date.now(),
                });
                for (const [ws] of this.clients) {
                  if (ws.readyState === ws.OPEN) {
                    try { ws.send(payload); } catch { /* non-fatal */ }
                  }
                }
              }
              this._probeGateStartedAt = null;
              this._probeGateCellKey = null;
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
            // the operator decision #4; this divergence term is zeroed out.
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


  // _memoryHeartbeat() extracted to server/brain-server/memory.js
  // (SERVER_MEMORY_MIXIN). Method dispatches identically via the
  // Object.assign chain at brain-server.js entry-point bottom.

  // _getConsciousnessState() extracted to server/brain-server/state.js
  // (SERVER_STATE_MIXIN). Method dispatches identically via the
  // Object.assign chain at brain-server.js entry-point bottom.

  // _getWsPressureState() extracted to server/brain-server/state.js
  // (SERVER_STATE_MIXIN). Method dispatches identically via the
  // Object.assign chain at brain-server.js entry-point bottom.

  // _getMemoryStats() extracted to server/brain-server/memory.js
  // (SERVER_MEMORY_MIXIN). Method dispatches identically via the
  // Object.assign chain at brain-server.js entry-point bottom.

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
            // Auto-advance toggle — single switch governing the
            // signoff-bypass at /grade-advance AND the curriculum
            // runner's auto-fire-next-grade behavior. Persisted so an
            // overnight K→PhD walk picks up across Savestart.bat with
            // the toggle still set the way the operator left it. Reset
            // to false on fresh-state boots (start.bat wipes the file).
            autoAdvanceGrade: cortex._autoAdvanceGrade === true,
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
            // Donor neuron-compute LEADERBOARD — persists WITH the brain weights
            // (so contributions survive restart/resume) and is WIPED on a fresh
            // walk (force-fresh clears brain-weights). Keyed by persistent donorId
            // → {name, neurons, lastSeen}; internal _lastTs dropped (recomputed on
            // next telemetry). Top-200 by contribution to bound payload.
            neuronLeaderboard: this._neuronLeaderboard
              ? Object.fromEntries(Object.entries(this._neuronLeaderboard)
                  .sort((a, b) => (b[1].neurons || 0) - (a[1].neurons || 0))
                  .slice(0, 200)
                  .map(([lid, e]) => [lid, { name: e.name || null, neurons: e.neurons || 0, lastSeen: e.lastSeen || 0 }]))
              : {},
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
                const cellSize = cortex[`wordBucketCellSize_${subj}`]; // SPEAK.1 frozen geometry
                if (Array.isArray(list) && list.length > 0) {
                  out[subj] = {
                    words: list.slice(),
                    watermark: typeof watermark === 'number' ? watermark : list.length,
                    cellSize: typeof cellSize === 'number' ? cellSize : undefined,
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

      // Keep versioned backups (last CHECKPOINT_SLOTS — #112.11, was fixed 5)
      const backupFile = WEIGHTS_FILE.replace('.json', `-v${this._saveVersion % CHECKPOINT_SLOTS}.json`);
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
          const binBackupFile = BIN_FILE.replace(/\.bin$/, `-v${this._saveVersion % CHECKPOINT_SLOTS}.bin`);
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
          // Empty-store guard. An empty Tier 3 has no legitimate meaning —
          // identity anchors are always seeded at boot — so a zero-size store
          // at save time means seeding hasn't run yet (early save) or a
          // transient wipe. Persisting it would write an empty schemas:[]
          // array that the next boot loads as 0, and the load path would then
          // skip nothing-to-top-up only if the array were absent — i.e. an
          // empty file is exactly the poison that trapped Tier 3 at ZERO.
          // Never overwrite a good identity-core.json with an empty store.
          if (this.tier3Store.size() === 0) {
            console.warn('[Tier3Store] identity-core.json save SKIPPED — Tier 3 store is empty (seeding not yet run / transient wipe); preserving on-disk anchors instead of writing an empty file.');
          } else {
            const identityJson = this.tier3Store.toJSON();
            // Atomic write via temp + rename so a crash mid-write doesn't
            // corrupt identity-core.json (which is permanent — corruption
            // means losing Unity's identity until manual recovery).
            const tmpPath = `${identityPath}.tmp`;
            fs.writeFileSync(tmpPath, JSON.stringify(identityJson, null, 2));
            fs.renameSync(tmpPath, identityPath);
          }
        }
      } catch (err) {
        console.warn('[Tier3Store] identity-core.json save failed:', err?.message || err);
      }

      // UVM-INT.4 — persist the imagined field-C ring (the ".uvme medium" memory)
      // so her mental imagery survives reboot. Bounded (≤8 tiny ≤48² recs), atomic
      // write. Derivative state — fine to lose / auto-clear; she re-imagines.
      try {
        if (Array.isArray(this._imaginedFieldRing) && this._imaginedFieldRing.length > 0) {
          const msPath = path.join(__dirname, 'mindspace-memory.json');
          const tmp = `${msPath}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify({ version: 1, recs: this._imaginedFieldRing.slice(-8) }));
          fs.renameSync(tmp, msPath);
        }
      } catch (err) {
        console.warn('[MindSpace] mindspace-memory.json save failed:', err?.message || err);
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
        // Restore auto-advance toggle. Overrides the constructor-time
        // default (false) so a Savestart.bat resume keeps the operator's
        // prior choice intact across reboots. start.bat wipes weights
        // entirely so this path only fires on legitimate resumes.
        if (typeof pending.autoAdvanceGrade === 'boolean') {
          cortex._autoAdvanceGrade = pending.autoAdvanceGrade;
          if (pending.autoAdvanceGrade === true) {
            console.log('[Brain] restored auto-advance toggle: ON (signoffs bypassed + grade auto-fire enabled)');
          }
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
        // Restore the donor neuron-compute leaderboard (persists across restart/
        // resume; a fresh walk via force-fresh wipes brain-weights so it starts
        // empty). Re-seed the internal _lastTs so the first telemetry after
        // restart doesn't credit a huge gap.
        if (pending.neuronLeaderboard && typeof pending.neuronLeaderboard === 'object') {
          const lb = {};
          for (const [lid, e] of Object.entries(pending.neuronLeaderboard)) {
            if (!e || typeof e !== 'object') continue;
            lb[lid] = { name: e.name || null, neurons: e.neurons || 0, lastSeen: e.lastSeen || 0, _lastTs: 0 };
          }
          // Self-heal: collapse pre-fix duplicate rows (many donorId-keyed "Bob"
          // rows left by the old set_donor_name bug) into one name:<lower> row each.
          // The live production leaderboard repairs itself on the next restart.
          this._neuronLeaderboard = canonicalizeLeaderboard(lb);
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
              // SPEAK.1 — restore frozen bucket geometry so a cap env change between
              // boots can't silently re-shape bands and desync trained weights.
              if (typeof payload.cellSize === 'number' && payload.cellSize >= 1) {
                cortex[`wordBucketCellSize_${subj}`] = payload.cellSize;
              }
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

// ⛔ LAW.MIXIN-ORDER — Object.assign attaches MUST run BEFORE
// `new ServerBrain()` so the prototype carries every required mixin
// method by the time the constructor fires. Pre-fix the attaches were
// at the file BOTTOM (post-instantiation), which made the constructor's
// `this._initEpisodicDB()` call (line ~860) crash with
// "TypeError: this._initEpisodicDB is not a function" — exactly the
// silent-runtime-crash failure mode LAW.MIXIN-ORDER warns against.
// Operator's 2026-06-17 live test caught this — server.log showed
// `at new ServerBrain (brain-server.js:860:10)`. cluster.assertAutoSize-
// Wiring() couldn't catch this because it fires AFTER the constructor;
// the brain already crashed by the time the assertion would run.
//
// Order matters within the chain too — GPU first (provides device-lost
// callback used by constructor's GPU init path), then STATE / MEMORY
// (constructor calls _initEpisodicDB which lives in MEMORY mixin), then
// CHAT (chat path called post-boot).
Object.assign(ServerBrain.prototype, SERVER_GPU_MIXIN);
Object.assign(ServerBrain.prototype, SERVER_STATE_MIXIN);
Object.assign(ServerBrain.prototype, SERVER_MEMORY_MIXIN);
Object.assign(ServerBrain.prototype, SERVER_CHAT_MIXIN);

const brain = new ServerBrain();

// DF.5 — server console capture → admin dashboard console-log view. On a
// DEPLOYED host the operator has no local terminal / "Log Tail" window, so the
// server console is invisible. Mirror console.log/warn/error into a bounded
// ring buffer AND stream each new line to ADMIN WS clients only (the public
// donor/viewer lane never receives server logs). Wrapped here — right after
// the brain exists — so it captures the entire curriculum walk + teach + gate
// + save stream the operator wants to watch live. The ring backlog is sent to
// each admin on mode assignment (see the modeAssigned block) so a freshly
// opened dashboard immediately shows recent history, not a blank panel.
const SERVER_LOG_RING_CAP = 400;
brain._serverLogRing = [];
let _serverLogSeq = 0;
(function captureServerConsole() {
  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  brain._origConsole = orig;   // internal paths use these to avoid recursion
  const fmt = (args) => args.map((a) => {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return a.stack || a.message || String(a);
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
  const capture = (level, args) => {
    const entry = { seq: _serverLogSeq++, ts: Date.now(), level, text: fmt(args).slice(0, 2000) };
    brain._serverLogRing.push(entry);
    if (brain._serverLogRing.length > SERVER_LOG_RING_CAP) brain._serverLogRing.shift();
    // Stream to admin clients only. CRITICAL: never call the wrapped console
    // in here — that would recurse infinitely. ws.send failures swallow.
    const clients = brain.clients;
    if (clients && clients.size) {
      const payload = JSON.stringify({ type: 'serverLog', entry });
      for (const [ws, c] of clients) {
        if (c && c.mode === 'admin' && ws.readyState === ws.OPEN) {
          try { ws.send(payload); } catch { /* admin tab gone — ignore */ }
        }
      }
    }
  };
  console.log = (...args) => { orig.log(...args); capture('log', args); };
  console.warn = (...args) => { orig.warn(...args); capture('warn', args); };
  console.error = (...args) => { orig.error(...args); capture('error', args); };
})();

// Re-arm the sparse-cortex GPU upload when a (new) donor becomes primary.
// The cluster LIF buffers re-init via the _gpuInitialized reset at each
// new-primary site, but the sparse WEIGHT-MATRIX upload (cortexCluster.initGpu
// — the 14 cross-projections + the intra-cluster synapse matrix) is gated by a
// ONE-TIME _cortexGpuInitStarted flag. Without re-arming it, a donor that
// connects AFTER a prior donor (reconnect / failover / quarantine-promote) gets
// its neuron buffers but ZERO cross-projection / intra-synapse matrices — the
// "0 sparse matrices uploaded" symptom, with Hebbian frames firing into pathways
// that aren't on the GPU. initGpu() has no internal "already uploaded" guard, so
// re-arming the flag makes it fully re-upload to the new primary on the next
// warm tick (the warmup-batch counter is cumulative, so it fires promptly).
function _rearmCortexGpuUpload(reason) {
  brain._cortexGpuInitStarted = false;
  // #31 — reset the time-fallback anchor too, so the new primary re-arms the
  // both-triggers gate from scratch (clusters re-confirm → re-stamp → upload
  // fires on warmup OR the time fallback again, never wedged behind a stale
  // anchor from the previous donor).
  brain._allClustersConfirmedAt = null;
  if (brain.cortexCluster) brain.cortexCluster._cortexFullyReady = false;
  console.log(`[Brain] re-arming sparse cortex upload for the new primary GPU (${reason}) — cross-projections + intra-synapses will re-upload.`);
}

// T14.21 — catch any rejection from brain.start() so async init failures
// surface with a stack trace instead of silently terminating the process
// via Node's default --unhandled-rejections=throw behavior.
brain.start().catch((err) => {
  _bootErrorLog('brain.start() rejected', err);
  process.exit(1);
});

// Periodic saves
setInterval(() => {
  // Force the periodic save THROUGH the curriculum guard while a walk is
  // in progress. Otherwise saveWeights() returns early (the _curriculumInProgress
  // guard) and weights ONLY ever persist on a cell-pass — so a walk that
  // stalls/rectifies before any cell passes never hits disk, and the next
  // boot wipes the RAM-only training. A forced checkpoint on the save cadence
  // guarantees the walk's progress is durable (resumes under DREAM_KEEP_STATE).
  brain.saveWeights(brain._curriculumInProgress
    ? { force: true, trigger: 'periodic-curriculum-checkpoint' }
    : {});
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

// PA.4.8 — community-compute milestone execution gate. Every 30s, check
// whether a pending higher tier has held past the stability window; if so,
// persist the target + graceful-restart so the brain re-boots at the new
// scale + re-walks. No-op until donors actually cross a milestone + hold it.
setInterval(() => {
  if (typeof brain._maybeExecuteMilestoneResize === 'function') {
    try { brain._maybeExecuteMilestoneResize(); }
    catch (e) { console.warn('[Brain] PA.4.8 — milestone execution check failed:', e.message); }
  }
}, 30 * 1000);

// DF.7 — periodic master re-broadcast to replica donors (data-parallel
// delta-merge re-sync). Re-converges every replica's GPU shadow to the
// authoritative CPU master. No-op unless ≥2 donors are connected (one donor IS
// the master). Conservative interval — re-streaming the full weight set is
// heavy at scale, so this corrects slow drift; fire-and-forget Hebbian keeps
// replicas approximately current between rebroadcasts.
// DF.7 — when fan-out is ON, Hebbian batches round-robin across donors so their
// GPU weight-shadows drift apart faster; re-converge them to the CPU master more
// often (default 60s) to bound the drift. Without fan-out, slow-drift correction
// at 10 min is plenty. Env-tunable via DREAM_DF7_REBROADCAST_MS.
const REPLICA_REBROADCAST_MS = Number(process.env.DREAM_DF7_REBROADCAST_MS) > 0
  ? Number(process.env.DREAM_DF7_REBROADCAST_MS)
  : (process.env.DREAM_DF7_FANOUT !== '0' ? 60 * 1000 : 10 * 60 * 1000);
setInterval(() => {
  // DF.7 F4 — before re-syncing replicas, re-evaluate which donor should be PRIMARY
  // (fastest healthy, by live capacity score) so a fast late-joiner / a recovered
  // donor takes the main per-tick stream instead of it staying pinned to a
  // weaker/laggy card. Margin-gated inside to avoid thrash. Must run before the
  // rebroadcast so the (possibly new) primary's master is what replicas converge to.
  if (typeof brain._maybeRebalancePrimary === 'function') {
    try { brain._maybeRebalancePrimary(); } catch (e) { console.warn('[Brain] DF.7 F4 — primary rebalance check failed:', e?.message || e); }
  }
  if (typeof brain._rebroadcastMasterToReplicas === 'function') {
    brain._rebroadcastMasterToReplicas().catch((e) => {
      console.warn('[Brain] DF.7 — replica rebroadcast failed:', e?.message || e);
    });
  }
}, REPLICA_REBROADCAST_MS);

// Loopback gate for privileged HTTP endpoints (/shutdown, /grade-advance,
// /grade-signoff). Defense-in-depth on top of the BIND_HOST=127.0.0.1
// default — even when the operator opts in to BRAIN_BIND=0.0.0.0 to
// expose dashboards on the LAN, brain-mutating endpoints stay blocked
// for non-loopback callers. Returns false (and writes 403) if the
// caller is not localhost; returns true if the request can proceed.
//
// Local dev: brain-mutating HTTP (/shutdown, /grade-advance, /grade-signoff)
// stays loopback-only. PA.4 DEPLOYED (UAL_PROXY_AUTH=1): every caller is
// loopback FROM the Forgejo-auth reverse proxy, so loopback alone is not
// authorization — the endpoint additionally requires a proxy-vouched
// Forgejo identity in X-UAL-User (proxy sets it only after auth + strips
// client-supplied copies). The admin/viewer split for the WS/dashboard UI
// happens at the WS layer via the modeAssigned message on the same header.
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
  // PA.4 proxy-auth: behind the reverse proxy, loopback is universal — gate
  // brain-mutating endpoints on the proxy-vouched Forgejo identity instead.
  if (process.env.UAL_PROXY_AUTH === '1') {
    const ualUser = (req.headers['x-ual-user'] || '').toString().trim();
    if (!ualUser) {
      console.warn(`[Server] Rejected unauthenticated ${endpoint} (proxy-auth on, no X-UAL-User)`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'forbidden — admin endpoint requires Forgejo auth' }));
      return false;
    }
  }
  return true;
}

// HTTP server for health checks
const httpServer = http.createServer((req, res) => {
  // Public dashboard snapshot — ONE cached state JSON served to ALL public
  // viewers so they poll a single file instead of each holding a live WS
  // stream (1000 viewers × full state every cadence = server meltdown). The
  // broadcast loop refreshes brain._publicStateJson on the dashboard cadence;
  // this just hands back the cached string (cheap — no recompute per request)
  // and stamps _lastPublicPollTs so the broadcast keeps the snapshot warm even
  // with zero live WS clients. PUBLIC (no auth) — it's the same data the
  // public /ws lane sends. Short cache header lets nginx/browser micro-cache.
  if (req.url === '/public-state.json' && req.method === 'GET') {
    brain._lastPublicPollTs = Date.now();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=2' });
    res.end(brain._publicStateJson || JSON.stringify({ type: 'state', state: null, snapshotAt: 0, note: 'snapshot warming up — try again in a moment' }));
    return;
  }
  // MINDSEYE.1 — single-source "what Unity sees" snapshot. The cached field C from
  // the latest _imagineTick (one compute), handed back as-is to any number of
  // mind's-eye viewers (html/minds-eye.html). PUBLIC (no auth), read-only. Viewers
  // reconstruct the image client-side from this one equation — no per-viewer
  // compute, no 1000 heavy copies. Same single-source idiom as /public-state.json.
  if (req.url === '/minds-eye.json' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=2', 'Access-Control-Allow-Origin': '*' });
    res.end(brain._mindsEyeJson || JSON.stringify({ type: 'mindsEye', rec: null, terms: 0, at: 0, note: 'Unity has not imagined yet — her mind’s eye warms up once the brain is idle (not mid-teach).' }));
    return;
  }

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
    for (let i = 0; i < CHECKPOINT_SLOTS; i++) {
      const vFile = WEIGHTS_FILE.replace('.json', `-v${i}.json`);
      const vBin = WEIGHTS_FILE.replace(/\.json$/, `-v${i}.bin`);
      try {
        if (fs.existsSync(vFile)) {
          const data = JSON.parse(fs.readFileSync(vFile, 'utf8'));
          let binBytes = 0;
          try { if (fs.existsSync(vBin)) binBytes = fs.statSync(vBin).size; } catch {}
          versions.push({ slot: i, version: data.version, savedAt: data.savedAt, time: data.time, neurons: data.totalNeurons || null, binBytes });
        }
      } catch {}
    }
    res.end(JSON.stringify({ versions, current: brain._saveVersion || 0, slots: CHECKPOINT_SLOTS }));
    return;
  }

  // #112.11 — manual checkpoint (dashboard "Save checkpoint now"). Forces an
  // immediate versioned save between the 5-min periodic ticks. Admin-gated.
  if (req.url === '/checkpoint' && req.method === 'POST') {
    if (!requireLoopback(req, res, '/checkpoint')) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    try {
      brain.saveWeights({ force: true, trigger: 'manual-dashboard' });
      const ver = brain._saveVersion || 0;
      res.end(JSON.stringify({ ok: true, version: ver, slot: `v${ver % CHECKPOINT_SLOTS}`, at: brain._lastSave?.at || null }));
    } catch (err) {
      res.end(JSON.stringify({ ok: false, error: err && err.message }));
    }
    return;
  }

  // Manual GPU-shadow re-sync (dashboard "↻ Re-sync GPU shadow"). Weight-SAFE.
  // `_gpuShadowDirty` is set when a compute client drops / fails over (the donor
  // GPU mirror may have drifted from the authoritative CPU master). It normally
  // clears only when a donor RESPAWNS and cortex re-confirms gpu_init — so with a
  // single never-respawning donor it stays stuck indefinitely. This forces the
  // cortex GPU re-upload to the CURRENTLY-connected primary (no donor disconnect
  // needed): `_rearmCortexGpuUpload` resets the init flag so the next warm tick
  // re-uploads the master CSR; the donor's gpu_init re-confirm then clears
  // `_gpuShadowDirty` via the existing path. Touches NO weights — it re-pushes
  // the intact CPU master to the GPU mirror.
  if (req.url === '/resync' && req.method === 'POST') {
    if (!requireLoopback(req, res, '/resync')) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    try {
      const dirtyBefore = !!(brain.cortexCluster && brain.cortexCluster._gpuShadowDirty);
      const donors = brain._gpuClients ? brain._gpuClients.size : 0;
      if (typeof _rearmCortexGpuUpload === 'function') {
        _rearmCortexGpuUpload('manual /resync (dashboard)');
      }
      console.log(`[Brain] HTTP /resync — manual cortex GPU re-upload armed (dashboard). dirtyBefore=${dirtyBefore} donors=${donors}. Cortex re-uploads the CPU master to the primary on the next warm tick; _gpuShadowDirty clears when the donor re-confirms gpu_init.`);
      res.end(JSON.stringify({
        ok: true,
        armed: true,
        dirtyBefore,
        donors,
        note: donors > 0
          ? 'cortex re-upload armed — DIRTY clears when the primary donor re-confirms gpu_init (watch the server console for "_gpuShadowDirty cleared")'
          : 'no donors connected — the re-upload fires when a donor connects',
      }));
    } catch (err) {
      res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
    }
    return;
  }

  // Graceful shutdown endpoint = a TRUE HALT (dashboard "Stop Brain" / stop.bat).
  // #112.10 — exits with code 42 (NOT 0). The systemd unit sets
  // `RestartPreventExitStatus=42`, so a deliberate Stop stays DOWN instead of
  // being instantly revived by `Restart=always` (the prior `exit(0)` made Stop
  // behave identically to Restart — "couldn't shut it off"). A crash or a
  // Restart (exit 0) is still auto-revived; only THIS deliberate halt is not.
  // To bring it back after a Stop: `sudo systemctl start unity-brain` (box) or
  // re-run start.bat / Savestart.bat (local). Force-saves + drops the resume
  // marker first, so when it IS restarted it auto-resumes the trained state.
  // Idempotent — a second POST short-circuits.
  if (req.url === '/shutdown' && req.method === 'POST') {
    if (!requireLoopback(req, res, '/shutdown')) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (global._brainShutdownRequested) {
      res.end(JSON.stringify({ status: 'already shutting down' }));
      return;
    }
    global._brainShutdownRequested = true;
    console.log('[Brain] HTTP /shutdown — TRUE HALT requested (dashboard Stop / stop.bat). Exiting 42; systemd will NOT revive. Bring back with: sudo systemctl start unity-brain');
    res.end(JSON.stringify({ status: 'halting — exit 42, will NOT auto-revive; restart with `systemctl start unity-brain` (box) or start.bat (local)' }));
    // #38 — DELIBERATE clean stop. Force-save the latest weights + drop the
    // resume marker so a LATER manual start auto-resumes (no need to remember
    // Savestart) unless a heavy update made the weights incompatible.
    try { _writeResumeMarker('stop.bat / HTTP /shutdown'); } catch (err) {
      console.warn('[Brain] resume-marker on /shutdown failed:', err && err.message);
    }
    try { brain.stop(); } catch (err) {
      console.error('[Brain] stop() failed during /shutdown:', err);
    }
    // Give the (possibly large) force-save a moment to flush to disk before exit.
    // Exit 42 (deliberate-halt sentinel) — see RestartPreventExitStatus in the unit.
    setTimeout(() => { process.exit(42); }, 1500);
    return;
  }

  // #40 — RESTART (Savestart) from the dashboard. Drops the resume marker
  // (force-save + mark) then exits; on the deployed box systemd Restart=always
  // revives the process, which then auto-RESUMES the trained state (#38). Gives
  // the operator a UI restart without shell access. (Local dev has no systemd —
  // the process just exits; re-run Savestart.bat.)
  if (req.url === '/restart' && req.method === 'POST') {
    if (!requireLoopback(req, res, '/restart')) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (global._brainShutdownRequested) { res.end(JSON.stringify({ status: 'already restarting' })); return; }
    global._brainShutdownRequested = true;
    console.log('[Brain] HTTP /restart — operator requested RESTART+RESUME (dashboard). Force-saving + marking resume, then exiting for systemd to revive.');
    res.end(JSON.stringify({ status: 'restarting — will resume on next boot (systemd revives in a few seconds)' }));
    try { _writeResumeMarker('dashboard /restart'); } catch (err) {
      console.warn('[Brain] resume-marker on /restart failed:', err && err.message);
    }
    try { brain.stop(); } catch (err) { console.error('[Brain] stop() failed during /restart:', err); }
    setTimeout(() => { process.exit(0); }, 1500);
    return;
  }

  // #39 — RESET (fresh start) from the dashboard. Writes a .force-fresh flag +
  // clears any resume marker, then exits; systemd revives the process and
  // autoClearStaleState sees the flag → WIPES all trained state (identity-core
  // Tier 3 anchors preserved) for a clean fresh brain. UI path to a server-side
  // reset without shell access.
  if (req.url === '/reset' && req.method === 'POST') {
    if (!requireLoopback(req, res, '/reset')) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (global._brainShutdownRequested) { res.end(JSON.stringify({ status: 'already restarting' })); return; }
    try {
      fs.writeFileSync(path.join(__dirname, '.force-fresh'), JSON.stringify({ requestedAt: Date.now(), via: 'dashboard /reset' }, null, 2));
      try { if (fs.existsSync(RESUME_MARKER_PATH)) fs.unlinkSync(RESUME_MARKER_PATH); } catch { /* best-effort */ }
    } catch (err) {
      res.end(JSON.stringify({ status: 'reset FAILED — could not write force-fresh flag', error: err && err.message }));
      return;
    }
    global._brainShutdownRequested = true;
    console.log('[Brain] HTTP /reset — operator requested RESET (dashboard). Force-fresh flag written + resume marker cleared; exiting for systemd to revive into a FRESH brain (identity-core preserved).');
    res.end(JSON.stringify({ status: 'reset armed — wiping to a fresh brain on next boot (systemd revives in a few seconds)' }));
    try { brain.stop(); } catch (err) { console.error('[Brain] stop() failed during /reset:', err); }
    setTimeout(() => { process.exit(0); }, 1000);
    return;
  }

  // Dashboard "Update & Fresh Walk" — re-pull the latest project code and
  // start a clean walk in one click. The backend dir has NO .git (redeploy
  // is a git-archive overlay), so this spawns deploy/self-update.sh
  // DETACHED: that script overlays the latest code into the backend dir,
  // writes the server-side `.force-fresh` flag (so autoClearStaleState WIPES
  // weights for a fresh walk — identity-core Tier 3 preserved), then
  // `systemctl restart`s the service. The restart fires AFTER the overlay
  // completes (no race), so new code + cleared weights boot cleanly and —
  // with auto-advance ON (persisted in auto-advance.json) — the walk starts
  // itself. Loopback/admin-gated (same as /reset). The script path is
  // overridable via DREAM_SELF_UPDATE_CMD; box deploy config (remote /
  // backend dir / service name) is set via the UAL_* env vars the script
  // reads. Local dev (no systemd, no deploy dir) has no script → returns a
  // clear "not found" rather than half-updating.
  if (req.url.split('?')[0] === '/update' && req.method === 'POST') {
    if (!requireLoopback(req, res, '/update')) return;
    // `?keep=1` (or `?mode=savestart`) = UPDATE & SAVESTART: overlay the new
    // code but RESUME the saved weights instead of wiping. Default (no query)
    // = the original UPDATE & FRESH WALK (writes .force-fresh → wipe).
    const _q = req.url.split('?')[1] || '';
    const keepState = /(?:^|&)keep=1(?:&|$)/.test(_q) || /(?:^|&)mode=savestart(?:&|$)/.test(_q);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // WL.4 — auto-clear a STALE update flag. If a prior /update's self-update script
    // died before restarting (e.g. the sudo restart was blocked), `_brainShutdownRequested`
    // would stay set forever and lock the button out (exactly what happened 2026-06-28).
    // Clear it once it's older than the stale window so a retry works. Env-tunable
    // DREAM_UPDATE_STALE_MS (default 5 min).
    const _updStaleMs = Number(process.env.DREAM_UPDATE_STALE_MS) > 0 ? Number(process.env.DREAM_UPDATE_STALE_MS) : 5 * 60 * 1000;
    if (global._brainShutdownRequested) {
      if (global._brainShutdownRequestedAt && (Date.now() - global._brainShutdownRequestedAt) > _updStaleMs) {
        console.warn(`[Brain] /update — clearing STALE update flag (set ${Math.round((Date.now() - global._brainShutdownRequestedAt) / 1000)}s ago; the prior update likely failed to restart). Allowing this retry.`);
        global._brainShutdownRequested = false;
      } else {
        res.end(JSON.stringify({ status: 'already updating/restarting' })); return;
      }
    }
    const updateScript = process.env.DREAM_SELF_UPDATE_CMD || path.join(__dirname, '..', 'deploy', 'self-update.sh');
    let scriptExists = false;
    try { scriptExists = fs.existsSync(updateScript); } catch { /* non-fatal */ }
    if (!scriptExists) {
      res.end(JSON.stringify({ status: 'update FAILED — self-update script not found', script: updateScript, hint: 'add deploy/self-update.sh on the box (or set DREAM_SELF_UPDATE_CMD). Local dev has no self-update path — use start.bat (fresh) / Savestart.bat (resume).' }));
      return;
    }
    global._brainShutdownRequested = true;
    global._brainShutdownRequestedAt = Date.now();   // WL.4 — stamp so a failed update can be detected stale + cleared
    if (keepState) {
      console.log(`[Brain] HTTP /update?keep=1 — UPDATE + SAVESTART requested (dashboard). Spawning ${updateScript} detached with UAL_KEEP_STATE=1: overlay latest code → SKIP .force-fresh → systemctl restart (resumes saved weights via the unit's DREAM_KEEP_STATE=1).`);
      res.end(JSON.stringify({ status: 'update armed — pulling latest code, RESUMING saved weights (savestart), restarting (~1-2 min)', mode: 'savestart', script: updateScript }));
    } else {
      console.log(`[Brain] HTTP /update — UPDATE + FRESH WALK requested (dashboard). Spawning ${updateScript} detached: overlay latest code → write .force-fresh → systemctl restart.`);
      res.end(JSON.stringify({ status: 'update armed — pulling latest code, clearing weights, restarting into a fresh walk (~1-2 min)', mode: 'fresh', script: updateScript }));
    }
    try {
      const { spawn } = require('child_process');
      const env = { ...process.env };
      if (keepState) env.UAL_KEEP_STATE = '1';
      const child = spawn('bash', [updateScript], { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env });
      // WL.4 — stream the self-update script's output into the brain console (→ the
      // admin Server Console ring → dashboard) so the operator watches the deploy
      // live (clone → overlay → restart, or the exact failure) instead of needing
      // shell to read /opt/unity-brain/self-update.log.
      const _pipeUpdateLines = (buf) => String(buf).split(/\r?\n/).forEach(l => { if (l.trim()) console.log(l); });
      if (child.stdout) child.stdout.on('data', _pipeUpdateLines);
      if (child.stderr) child.stderr.on('data', _pipeUpdateLines);
      child.unref();
    } catch (err) {
      console.error('[Brain] /update spawn failed:', err && err.message);
    }
    // Intentionally do NOT process.exit here — the spawned script runs
    // `systemctl restart` AFTER its overlay completes, which replaces this
    // process with the freshly-updated code. Exiting now would let systemd
    // revive the OLD code before the overlay finished (a race).
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
    // #112.11 — why the last boot resumed vs wiped (incl. incompatible-checkpoint
    // detail) so the dashboard can surface a "training was reset" banner.
    let lastBootReason = null;
    try {
      if (fs.existsSync(LAST_BOOT_REASON_PATH)) lastBootReason = JSON.parse(fs.readFileSync(LAST_BOOT_REASON_PATH, 'utf8'));
    } catch {}
    res.end(JSON.stringify({
      lastSave: brain._lastSave || null,
      bootMode,
      lastBootReason,
      checkpointSlots: CHECKPOINT_SLOTS,
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
        // Grade-completion-gate enforcement — every subject whose battery
        // cleared at the paused grade must have a corresponding operator
        // signoff in brain._gradeSignoffs[${subject}/${from}] before the
        // runner is allowed to advance. Walks cortex._lastGateResult so
        // we only demand signoffs for subjects that actually ran a
        // battery (a subject that never ran has nothing to attest to).
        // The check is bypassed when cortex._autoAdvanceGrade === true
        // (the auto-advance toggle is on) — operator has opted in to
        // unattended overnight walks where per-cell localhost
        // verification is waived in exchange for back-to-back grade
        // progression without intervention. Toggle off = signoffs
        // required as normal.
        if (cortex._autoAdvanceGrade !== true && from) {
          const signoffs = brain._gradeSignoffs || {};
          const lastResults = (cortex._lastGateResult && typeof cortex._lastGateResult === 'object')
            ? cortex._lastGateResult : {};
          const suffix = `/${from}`;
          const missing = [];
          for (const key of Object.keys(lastResults)) {
            if (!key.endsWith(suffix)) continue;
            const result = lastResults[key];
            if (!result || result.pass !== true) continue;
            const signoff = signoffs[key];
            if (!signoff || typeof signoff.signedAt !== 'string' || !signoff.signedAt) {
              missing.push(key);
            }
          }
          if (missing.length > 0) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'missing operator signoffs — grade-advance blocked',
              pausedGrade: from,
              missing,
              remedy: 'POST /grade-signoff per listed subject/grade key before retrying, OR enable the auto-advance toggle (POST /auto-advance {enabled:true}) to bypass signoffs for unattended walks',
            }));
            console.warn(`[Brain] /grade-advance BLOCKED — missing signoffs for '${from}': ${missing.join(', ')}`);
            return;
          }
        }
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

  // Live single-cell RE-TEACH endpoint. Surgically retrains ONE (subject,grade)
  // cell on the running brain WITHOUT a reset: forgetCell() drops the cell from
  // passedCells + demotes the subject (no weight wipe), then runSubjectGrade()
  // re-teaches it (it would otherwise SKIP a cell still marked passed). The teach
  // takes minutes, so we forget + respond 202 immediately and run the re-teach in
  // the BACKGROUND, persisting weights on completion. Loopback-gated like every
  // other brain-mutating endpoint; refuses while a cell is already teaching so two
  // teach passes never interleave on the same cluster.
  if (req.url === '/curriculum/forget' && req.method === 'POST') {
    if (!requireLoopback(req, res, '/curriculum/forget')) return;
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 10000) { req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        const subject = String(parsed.subject || '').trim().toLowerCase();
        const grade = String(parsed.grade || '').trim();
        const curriculum = brain.curriculum;
        const cortex = brain.cortexCluster;
        if (!curriculum || !cortex) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'curriculum/cortex not initialized' }));
          return;
        }
        if (typeof curriculum.forgetCell !== 'function' || typeof curriculum.runSubjectGrade !== 'function') {
          res.writeHead(501, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'live re-teach not supported by this build' }));
          return;
        }
        // Validate input synchronously — we kick the teach off in the background,
        // so a bad subject/grade must be rejected NOW, not silently fail later.
        const subjects = brain._curriculumSubjects;
        const gradeOrder = brain._curriculumGradeOrder;
        if (Array.isArray(subjects) && !subjects.includes(subject)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `unknown subject '${subject}'`, validSubjects: subjects }));
          return;
        }
        if (Array.isArray(gradeOrder) && !gradeOrder.includes(grade)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `unknown grade '${grade}'`, validGrades: gradeOrder }));
          return;
        }
        if (!subject || !grade) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'subject and grade are required' }));
          return;
        }
        // Concurrency guard — never interleave two teach passes on one cluster.
        if (cortex._currentCellKey) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'a cell is currently teaching — retry when idle', teaching: cortex._currentCellKey }));
          return;
        }
        if (brain._liveReteachActive) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'a live re-teach is already running', reteaching: brain._liveReteachActive }));
          return;
        }
        // runSubjectGrade(null corpora) falls back to curriculum._lastCtx — if the
        // brain never started its walk that cache is empty and there's nothing to
        // teach from.
        if (!curriculum._lastCtx) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'curriculum corpora not initialized yet (brain has not begun its walk) — cannot re-teach' }));
          return;
        }
        const cellKey = `${subject}/${grade}`;
        const forgot = curriculum.forgetCell(subject, grade);
        brain._liveReteachActive = cellKey;
        console.log(`[Brain] /curriculum/forget — live re-teach requested for ${cellKey} (forgot=${forgot}); teaching in background, no reset.`);
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          accepted: true,
          subject,
          grade,
          forgot,
          note: 'cell forgotten (no weight reset); live re-teach started in background — watch the Current Training card / GET /milestone. Weights persist on completion.',
        }));
        // Background re-teach — long-running; runs after the response is sent.
        (async () => {
          try {
            const result = await curriculum.runSubjectGrade(subject, grade, null, {});
            console.log(`[Brain] live re-teach ${cellKey} DONE — pass=${result?.pass} reason=${result?.reason || 'n/a'}`);
            brain.saveWeights({ force: true, trigger: `live-reteach:${cellKey}` });
          } catch (err) {
            console.warn(`[Brain] live re-teach ${cellKey} FAILED: ${err?.message || err}`);
          } finally {
            brain._liveReteachActive = null;
          }
        })();
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Auto-advance toggle endpoint. Single switch governing the curriculum
  // runner's behavior across grade boundaries:
  //   OFF (default) — runner pauses after every full grade pass,
  //     /grade-advance demands per-subject operator signoffs before
  //     un-pausing. Operator clicks "Start Next Grade" between grades.
  //   ON — runner auto-fires the advance after each grade pass AND
  //     /grade-advance skips the signoff demand entirely. Unattended
  //     overnight K→PhD walks become possible. Single switch — no
  //     separate "bypass-signoffs" flag.
  //
  // Usage:
  //   GET  /auto-advance          → returns { enabled: bool }
  //   POST /auto-advance { enabled: true | false }   → flips state,
  //                                                    broadcasts WS event,
  //                                                    persists to weights.
  //
  // Loopback-gated (same as every other brain-mutating endpoint).
  // Defense-in-depth on top of the dashboard's admin-only UI control.
  if (req.url === '/auto-advance') {
    if (!requireLoopback(req, res, '/auto-advance')) return;
    const cortex = brain.cortexCluster;
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        enabled: !!(cortex && cortex._autoAdvanceGrade === true),
      }));
      return;
    }
    if (req.method === 'POST') {
      // Same chunked-body assembly the privileged endpoints use to dodge
      // the V8 O(N²) string-concat pathology and enforce a hard size cap.
      const chunks = [];
      let total = 0;
      req.on('data', (chunk) => {
        total += chunk.length;
        if (total > 1024) { req.destroy(); return; }
        chunks.push(chunk);
      });
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        try {
          if (!cortex) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'cortex cluster not initialized' }));
            return;
          }
          const parsed = JSON.parse(body || '{}');
          if (typeof parsed.enabled !== 'boolean') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'body must include { enabled: true | false }' }));
            return;
          }
          const prev = cortex._autoAdvanceGrade === true;
          cortex._autoAdvanceGrade = parsed.enabled === true;
          const next = cortex._autoAdvanceGrade;
          // WS broadcast so every connected dashboard tab updates the
          // toggle UI in real time, not just the one that POSTed.
          const wsMsg = JSON.stringify({ type: 'autoAdvanceChanged', enabled: next });
          for (const [ws] of brain.clients) {
            if (ws.readyState === 1) {
              try { ws.send(wsMsg); } catch { /* per-client send failure tolerated */ }
            }
          }
          // Persist immediately so a refresh / Savestart resume reflects
          // the new state. saveWeights serializes the cortex state with
          // the new autoAdvanceGrade flag inside cortexState.
          brain.saveWeights({ force: true, trigger: `auto-advance:${next ? 'on' : 'off'}` });
          // DF.7 — ALSO persist to the STANDALONE auto-advance.json so the
          // toggle survives a tier resize/downscale (which CLEARS brain-weights).
          // This is what keeps automated train runs unattended across every
          // restart + retrain — the re-walk reads this file at boot and keeps
          // auto-advancing instead of pausing for a manual signoff.
          try {
            fs.writeFileSync(path.join(__dirname, 'auto-advance.json'), JSON.stringify({ enabled: next }, null, 2));
          } catch (e) {
            console.warn('[Brain] DF.7 — auto-advance.json persist failed (resize may reset the toggle):', e.message);
          }
          if (prev !== next) {
            console.log(`[Brain] auto-advance toggle: ${prev ? 'ON' : 'OFF'} → ${next ? 'ON' : 'OFF'} (operator localhost)`);
            if (next) {
              console.log('[Brain] ⚠ auto-advance ON — operator signoffs bypassed at /grade-advance, curriculum will auto-fire next grade after each cell pass');
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, enabled: next }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    res.writeHead(405, { 'Content-Type': 'application/json', 'Allow': 'GET, POST' });
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  // DF.7 — community-compute auto-scale controls (admin). GET returns the
  // current dead-zone settings + live community-compute telemetry; POST updates
  // the toggle / dead-zone buffer / stability window. Gee 2026-06-20: the auto-
  // relearn must be admin-controllable with a dead-zone buffer so a single
  // donor connecting/disconnecting never downgrades the brain.
  //   GET  /autoscale  → { settings, community }
  //   POST /autoscale  { enabled?, bufferPct?, stabilityMin?, minDonorsFloor? }
  if (req.url === '/autoscale') {
    if (!requireLoopback(req, res, '/autoscale')) return;
    // Shared with the periodic WS broadcast (getState → community) via the
    // brain._getCommunityState() method, so the HTTP /autoscale response and the
    // live dashboard can never drift (the panel showed 0s because only this route
    // set `community`, never the broadcast). Single source of truth now.
    // ASCALE minDonorMB lives inside _getCommunityState() (state.js) so it surfaces here too.
    const communityStatus = () => brain._getCommunityState();
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ settings: brain._getAutoScaleSettings(), community: communityStatus() }));
      return;
    }
    if (req.method === 'POST') {
      const chunks = [];
      let total = 0;
      req.on('data', (chunk) => {
        total += chunk.length;
        if (total > 1024) { req.destroy(); return; }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          // DF.7 — deliberate MANUAL downscale (admin button). Retrains NOW at a
          // fitting smaller tier, bypassing the auto hold window. Destructive
          // (loses current-size learning) — the dashboard guards it behind an
          // explicit confirm. Respond BEFORE the brain exits for the restart.
          if (parsed.action === 'downscale') {
            const target = (typeof brain._manualDownscale === 'function') ? brain._manualDownscale() : null;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, action: 'downscale', targetTier: target, note: target == null ? 'already at smallest tier — nothing to do' : 'retraining at smaller tier; brain restarting' }));
            return;
          }
          const next = brain._setAutoScaleSettings(parsed);
          // WS broadcast so every admin dashboard syncs the toggle/sliders live.
          const wsMsg = JSON.stringify({ type: 'autoScaleChanged', settings: next, community: communityStatus() });
          for (const [ws, c] of brain.clients) {
            if (ws.readyState === 1 && c && c.mode === 'admin') {
              try { ws.send(wsMsg); } catch { /* per-client send failure tolerated */ }
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, settings: next, community: communityStatus() }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    res.writeHead(405, { 'Content-Type': 'application/json', 'Allow': 'GET, POST' });
    res.end(JSON.stringify({ error: 'method not allowed' }));
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
      let to = `v${CHECKPOINT_SLOTS - 1}`;
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        if (body) {
          const parsed = JSON.parse(body);
          if (parsed && typeof parsed.to === 'string') to = parsed.to;
        }
      } catch { /* default to highest slot */ }
      // #112.11 — validate against the live slot cap (was hardcoded v0-v4).
      const _slotMatch = /^v([0-9])$/.exec(to);
      if (!_slotMatch || Number(_slotMatch[1]) >= CHECKPOINT_SLOTS) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: `invalid 'to' (expected v0-v${CHECKPOINT_SLOTS - 1}), got: ${to}` }));
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

// PR.4 — privacy-preserving IP mask for the client↔brain profiling table.
// Drops the last IPv4 octet / tail IPv6 segments so the admin view can group
// clients by rough origin without surfacing a full address.
function _maskIp(ip) {
  if (!ip) return '?';
  let s = String(ip).replace(/^::ffff:/, '');
  if (s.includes('.')) { const p = s.split('.'); return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : s; }
  if (s.includes(':')) { const p = s.split(':').filter(Boolean); return (p.slice(0, 3).join(':') || '::') + '::x'; }
  return s;
}
// PR.3 — byte sizer shared by the inbound listener + outbound send wrapper.
function _wsFrameBytes(d) {
  try { return typeof d === 'string' ? Buffer.byteLength(d) : (d && (d.byteLength || d.length)) || 0; }
  catch { return 0; }
}

wss.on('connection', (ws, req) => {
  const id = 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  // PA.4 reverse-proxy Forgejo auth: the auth proxy sets X-UAL-User on the
  // admin route AFTER authenticating against Forgejo (and strips any
  // client-supplied copy on every route). Donor/public routes carry no such
  // header. Trusted only when UAL_PROXY_AUTH=1 — see mode assignment below.
  const ualUser = (req.headers['x-ual-user'] || '').toString().trim();
  const _connNow = Date.now();
  const _rawIp = (req.socket && req.socket.remoteAddress)
    || (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim()
    || '';
  const client = {
    id, lastInput: 0, inputCount: 0, name: null, isGPU: false, mode: null, ualUser: ualUser || null,
    // PR.4 client↔brain profiling — per-connection health counters. Live byte
    // counters feed the admin Clients table; cumulative totals (on brain) survive
    // disconnects for the Network rate readout.
    connectedAt: _connNow, lastSeen: _connNow, ip: _maskIp(_rawIp),
    bytesIn: 0, bytesOut: 0, msgIn: 0, msgOut: 0, rttMs: null,
  };
  brain.clients.set(ws, client);
  brain._totalConnectionsEver = (brain._totalConnectionsEver || 0) + 1;
  // PR.3 network accounting. Wrap send (outbound) + add a lightweight inbound
  // listener — both purely additive: they count bytes/messages and never alter
  // payloads. The primary message handler (added below) runs independently.
  const _origSend = ws.send.bind(ws);
  ws.send = (data, ...rest) => {
    const n = _wsFrameBytes(data);
    client.bytesOut += n; client.msgOut += 1;
    brain._netBytesOutEver = (brain._netBytesOutEver || 0) + n;
    return _origSend(data, ...rest);
  };
  ws.on('message', (data) => {
    const n = _wsFrameBytes(data);
    client.bytesIn += n; client.msgIn += 1; client.lastSeen = Date.now();
    brain._netBytesInEver = (brain._netBytesInEver || 0) + n;
  });
  console.log(`[Server] Client connected: ${id} (${brain.clients.size} total)`);

  // #33 — donor-socket liveness heartbeat. readyState + the close event alone
  // CANNOT detect a HALF-OPEN socket (laptop sleep, network blip, a tab killed
  // without a clean close): the socket stays readyState===1 forever. A dead
  // PRIMARY donor then keeps its slot and a fresh donor joins as an idle
  // replica behind a corpse — and reconnecting never helps. Mark alive on
  // every pong; the sweep timer (see _heartbeatTimer below) pings each round
  // and terminate()s anything that missed the previous ping, which fires
  // ws.on('close') → the existing primary-left failover / standby promotion.
  ws._isAlive = true;
  ws._missedPings = 0;
  ws.on('pong', () => {
    ws._isAlive = true;
    ws._missedPings = 0; // HBGRACE.1 — a pong clears the grace counter
    // PR.4 — round-trip latency from the heartbeat ping/pong pair, SMOOTHED.
    // The heartbeat samples once per 30s, so a single jittery pong (Starlink
    // handover, a briefly-backgrounded/throttled browser-tab donor) would pin
    // the displayed RTT — and the red "unhealthy" flag — high for a full 30s,
    // making the row flap in/out of red on bad samples. We take the MEDIAN of
    // the last 5 samples instead: a lone spike is rejected, only a sustained
    // high RTT moves the reported value (which both the dashboard + the F1/F2
    // donor health-score read via c.rttMs). c.rttRawMs keeps the latest raw.
    const c = brain.clients.get(ws);
    if (c && ws._pingSentAt) {
      const raw = Math.max(0, Date.now() - ws._pingSentAt);
      c.lastSeen = Date.now();
      c.rttRawMs = raw;
      if (!Array.isArray(c._rttSamples)) c._rttSamples = [];
      c._rttSamples.push(raw);
      while (c._rttSamples.length > 5) c._rttSamples.shift();
      const sorted = c._rttSamples.slice().sort((a, b) => a - b);
      c.rttMs = sorted[Math.floor(sorted.length / 2)]; // median → outlier-robust
    } else if (c) {
      c.lastSeen = Date.now();
    }
  });

  // Send initial state. The admin/viewer mode comes in a SEPARATE
  // `modeAssigned` message after a 500ms claim window — see the
  // setTimeout block below for the rationale (lets the compute worker
  // identify itself via gpu_register before we commit the admin slot).
  ws.send(JSON.stringify({
    type: 'welcome', id,
    state: brain.getState(),
    emotionHistory: brain._emotionHistory.slice(-300),
  }));

  // Admin/viewer mode assignment. The operator on the host box has
  // multiple simultaneous connections (compute worker + brain UI tab +
  // dashboard tab + console terminal), all sharing the loopback
  // remoteAddress — they should ALL be treated as the same admin
  // user. We assign by remoteAddress: loopback → admin,
  // non-loopback → viewer. The compute worker (identified via the
  // gpu_register message it sends shortly after connecting) is a
  // back-end shadow and is excluded from the modeAssigned send since
  // it doesn't render any UI.
  //
  // 500ms delay gives the compute worker time to identify itself
  // before we'd send a pointless modeAssigned. After the delay, if
  // the connection turned out to be a user (not GPU worker), we
  // determine mode from remoteAddress.
  //
  // No persistence — admin is per-boot + per-machine-of-origin.
  // Refresh from the same machine keeps admin (still loopback).
  // LAN refresh stays viewer.
  setTimeout(() => {
    if (ws.readyState !== 1) return;  // socket already closed
    if (client.isGPU) return;          // compute worker — back-end shadow, no UI
    const addr = (req.socket && req.socket.remoteAddress) || '';
    const isLoopback = addr === '127.0.0.1'
      || addr === '::1'
      || addr === '::ffff:127.0.0.1'
      || addr.startsWith('127.');
    // PA.4 admin gating. UAL_PROXY_AUTH=1 (DEPLOYED behind the Forgejo-auth
    // reverse proxy): every client reaches us over loopback FROM the proxy,
    // so loopback can no longer imply admin — admin === a proxy-vouched
    // Forgejo identity in X-UAL-User (proxy sets it only post-auth + strips
    // client-supplied copies; we additionally require the hop be loopback,
    // i.e. from our own proxy). No header → viewer/donor (compute-only,
    // enforced in PA.4.6). Default (LOCAL dev, no proxy): loopback → admin.
    const proxyAuth = process.env.UAL_PROXY_AUTH === '1';
    const mode = proxyAuth
      ? ((client.ualUser && isLoopback) ? 'admin' : 'viewer')
      : (isLoopback ? 'admin' : 'viewer');
    // PA.4.2+ — FIRST-AUTHED-OPERATOR binding. On a static deploy there is no
    // loopback-implies-admin guarantee like localhost. So: the public can't
    // reach the admin lane at all (Forgejo auth_request), and the FIRST
    // Forgejo-authed operator to connect after deploy is bound as the LOCKED
    // primary operator — persisted to server/operator-identity.json so it
    // survives reboots. That binding can only ever be a lab member (public is
    // gated out), and the first one is THE operator/master. Later authed lab
    // members still get 'admin' (they can help) but are flagged non-primary.
    // This is how the operator is guaranteed to be master on a static deploy.
    let isPrimaryOperator = false;
    if (mode === 'admin' && client.ualUser) {
      try {
        if (brain._primaryOperator === undefined) {
          const _opPath = path.join(__dirname, 'operator-identity.json');
          brain._primaryOperator = fs.existsSync(_opPath)
            ? (JSON.parse(fs.readFileSync(_opPath, 'utf8')).primaryOperator || null)
            : null;
        }
        if (!brain._primaryOperator) {
          brain._primaryOperator = client.ualUser;
          fs.writeFileSync(
            path.join(__dirname, 'operator-identity.json'),
            JSON.stringify({ primaryOperator: client.ualUser, boundAtMs: Date.now() }, null, 2),
          );
          isPrimaryOperator = true;
          console.log(`[Server] PRIMARY OPERATOR bound (locked + persisted): '${client.ualUser}' — first Forgejo-authed connection after deploy. Master role is theirs across reboots.`);
        } else {
          isPrimaryOperator = (client.ualUser === brain._primaryOperator);
        }
      } catch (e) {
        console.warn('[Server] operator-identity bind failed (continuing as admin):', e.message);
      }
    }
    client.mode = mode;
    client.isPrimaryOperator = isPrimaryOperator;
    try {
      ws.send(JSON.stringify({ type: 'modeAssigned', mode, primaryOperator: isPrimaryOperator }));
      // DF.5 — hand the new admin the recent server-console backlog so the
      // dashboard console-log panel shows history immediately instead of only
      // lines emitted after this tab connected. Admin-only; viewers get nothing.
      if (mode === 'admin' && Array.isArray(brain._serverLogRing) && brain._serverLogRing.length) {
        ws.send(JSON.stringify({ type: 'serverLogBacklog', entries: brain._serverLogRing.slice(-200) }));
      }
    } catch { /* connection closed during the assignment window — drop silently */ }
    const who = client.ualUser ? ` user=${client.ualUser}${isPrimaryOperator ? ' (PRIMARY)' : ''}` : '';
    console.log(`[Server] ${id} assigned mode: ${mode} (remote=${addr || 'unknown'}${who})`);
  }, 500);

  ws.on('message', (data) => {
    // T17.3.e — binary WebSocket frames for sparse matrix responses.
    // Client sends "SPRR" magic + type + reqId + payload. Decode and
    // route to the matching pending promise.
    if (Buffer.isBuffer(data) && data.length >= 9 && data.slice(0, 4).toString('ascii') === 'SPRR') {
      // PA.4.6 — donor isolation: only a registered pool donor may submit
      // SPRR compute responses; a faked frame could resolve a pending sparse
      // promise with garbage currents. Drop frames from non-pool senders.
      if (!brain._gpuClients || !brain._gpuClients.has(ws)) return;
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

      // PA.4.6 — donor isolation + bad-actor hardening. Compute-protocol
      // messages mutate brain state (spike counts, init flags, device-lost,
      // sparse acks) — only honor them from a registered pool donor. A random
      // public/donor-route connection faking these could poison brain state.
      // gpu_register is exempt (it's how a donor JOINS the pool). Chat policy
      // (who may send 'text') is a separate operator decision — not gated here.
      const DONOR_PROTOCOL = ['compute_result', 'compute_batch_result', 'gpu_init_ack', 'sparse_upload_ack', 'sparse_propagate_ack', 'sparse_hebbian_ack', 'rebind_sparse_ack', 'readback_letter_buckets_ack', 'device_lost'];
      if (DONOR_PROTOCOL.indexOf(msg.type) !== -1 && !(brain._gpuClients && brain._gpuClients.has(ws))) {
        if (!brain._donorSpoofWarnAt || (Date.now() - brain._donorSpoofWarnAt) > 5000) {
          brain._donorSpoofWarnAt = Date.now();
          console.warn(`[Brain] PA.4.6 — ignored compute-protocol '${msg.type}' from non-donor ${id} (not in GPU pool).`);
        }
        return;
      }

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
            // always flowed through to processAndRespond). the operator caught it.
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

        case 'gpu_register': {
          client.isGPU = true;
          // PA.4.3 multi-donor pool. Track every registered donor GPU. The
          // brain's weights live in the PRIMARY donor's VRAM and ALL dispatch
          // targets brain._gpuClient (the primary) — unchanged. A second donor
          // no longer CLOBBERS the first; it joins as a hot STANDBY that gets
          // promoted to primary on primary-disconnect (failover, see close
          // handler). NOTE: true load-SHARING across donors (sharding the brain
          // so weak "STD" GPUs each hold a slice) is the next layer — this is
          // the non-breaking foundation it builds on.
          if (!brain._gpuClients) brain._gpuClients = new Set();
          brain._gpuClients.add(ws);
          // PA.4.8 — capture donor compute capacity (compute.html reports its
          // WebGPU adapter VRAM) for community-compute milestone scaling.
          client.gpuVramMB = Number(msg.vramMB) || 0;
          // ASCALE — DONATED capacity, so auto-scale gates on what the donor actually gives, not
          // the full card. utilizationPct = donation duty-cycle (default 100 = full); donatedMB =
          // explicit VRAM cap if the donor set one (0 = unset → fall back to vram × util in
          // _recomputeCommunityCompute). Browser donor omits both → util 100 / donated 0.
          client.utilizationPct = Math.max(0, Math.min(100, Number(msg.utilizationPct) || 100));
          client.donatedMB = Math.max(0, Number(msg.donatedMB) || 0);
          // WSQ.4 — donor's self-measured downlink (Mbps); lets sync pacing target the real link
          // capacity instead of an RTT proxy. 0 / absent (browser donor, or pre-measurement) = unknown.
          client.donorLinkMbps = Math.max(0, Number(msg.linkDownMbps) || 0);
          // F8/F9 — WebGPU storage-binding cap, captured at register (gpu_register
          // sends it as `maxStorageBindingMB`; telemetry later sends `maxBindMB`).
          // Capturing here makes the capability gate + dashboard label work from the
          // FIRST replica-sync, before the first telemetry frame arrives.
          client.maxBindMB = Number(msg.maxStorageBindingMB) || Number(msg.maxBindMB) || 0;
          client.gpuName = (msg.gpuName || 'unknown').toString().slice(0, 80);
          // FLAP — platform/backend telemetry captured at register so a 0-Gn/s donor's
          // OS / compute backend / driver / compute-capability is visible in the Clients table
          // from the first frame (native donor sends these; the browser donor omits them → blank).
          client.osPlatform = (msg.osPlatform || client.osPlatform || '').toString().slice(0, 16);
          client.engineBackend = (msg.engineBackend || client.engineBackend || '').toString().slice(0, 24);
          client.driverVersion = (msg.driverVersion || client.driverVersion || '').toString().slice(0, 48);
          client.computeCapability = (msg.computeCapability || client.computeCapability || '').toString().slice(0, 12);
          // Donor LEADERBOARD identity — a persistent client-side ID (localStorage
          // UUID sent by compute.html) keys this donor's cumulative neuron-compute
          // total across reconnects, plus an optional display name. The leaderboard
          // persists in saveWeights and RESETS on a fresh walk (force-fresh wipes
          // brain-weights). Accumulation happens in gpu_telemetry below.
          client.donorId = (msg.donorId && String(msg.donorId).slice(0, 64)) || client.donorId || `anon-${id}`;
          // Leaderboard identity — NOT routing (routing is always client.donorId,
          // set above, untouched). The NAME links compute across devices: same name
          // → ONE shared row, totals combined (100 people typing "Bob" → one "Bob");
          // no name → a per-device anonymous row keyed by donorId. lbApplyDonorIdentity
          // also migrates any compute the donor banked while anonymous onto their name
          // row. A register frame with no donorName keeps the donor's current name
          // rather than silently demoting them to anonymous.
          {
            const _rawName = (msg.donorName !== undefined) ? msg.donorName : client.donorName;
            lbApplyDonorIdentity(brain, client, _rawName, `anon-${id}`);
          }
          const havePrimary = brain._gpuClient && brain._gpuClient.readyState === 1;
          // DF.7 (flag-gated) — promote a materially-stronger newcomer to PRIMARY
          // so the beefiest GPU does the work instead of whoever connected first
          // (the "2GB card is primary while the 16GB idles" problem). Re-uploads
          // the brain to the new primary via the same path as failover; the old
          // primary stays in the pool as a replica. Default ON (DREAM_DF7_FANOUT≠0).
          const _df7PromoteStronger = havePrimary
            && (typeof brain._df7Fanout === 'function' && brain._df7Fanout())
            && typeof brain._donorStrength === 'function'
            && brain._donorStrength(ws) > brain._donorStrength(brain._gpuClient);
          if (!havePrimary || _df7PromoteStronger) {
            if (_df7PromoteStronger) {
              console.log(`[${id}] DF.7 — newcomer GPU is STRONGER (capacity score ${brain._donorStrength(ws).toFixed(2)} > current primary ${brain._donorStrength(brain._gpuClient).toFixed(2)}; score = throughput Gn/s × link-health, F1) — promoting it to PRIMARY; previous primary stays a replica + re-syncs.`);
            }
            brain._gpuClient = ws;
            brain._gpuConnected = true;
            brain._gpuWaitLogged = false;
            brain._gpuWaitLogged2 = false;
            brain._gpuModeLogged = false;
            brain._gpuInitialized = {};
            brain._gpuInitializedConfirmed = {};
            brain._gpuHits = 0;
            brain._gpuMisses = 0;
            _rearmCortexGpuUpload(_df7PromoteStronger ? 'gpu_register promote-stronger' : 'gpu_register primary');
            console.log(`[${id}] GPU compute client registered as PRIMARY — brain weights upload here (pool: ${brain._gpuClients.size}).`);
          } else {
            console.log(`[${id}] GPU compute client registered — bringing it up to a FULL brain replica (DF.7 data-parallel; pool: ${brain._gpuClients.size}).`);
            // DF.7 — make the new donor a REAL replica that SHARES compute,
            // not an idle hot-standby. Replays cluster init + every tracked
            // master matrix to it. Fire-and-forget + delayed ~1.5s so the
            // donor finishes its own WebGPU device init before we stream
            // weights at it. With this, every connected GPU holds the brain
            // and independent work fans out across all of them (_gpuParallelMap).
            if (typeof brain._syncReplicaToDonor === 'function') {
              setTimeout(() => { brain._syncReplicaToDonor(ws).catch(() => {}); }, 1500);
            }
          }
          // PA.4.8 — recompute community compute level + milestone tier.
          if (brain._recomputeCommunityCompute) brain._recomputeCommunityCompute();
          break;
        }

        case 'gpu_telemetry': {
          // #30 — per-donor GPU telemetry. compute.html reports ITS OWN GPU
          // (each donor tracks their own): model, VRAM capacity, binding
          // ceiling, and a live throughput proxy (WebGPU forbids reading true
          // util%/VRAM-used for privacy, so throughput is the honest signal).
          // Stored on the donor's client record; _updatePerfStats aggregates
          // the whole pool into perf.gpuPool so the admin dashboard shows the
          // donor fleet instead of the (GPU-less) server box's empty probe.
          // FLAP — re-read platform/backend each telemetry tick so the Clients table stays correct
          // even if the register frame was missed on a reconnect race (native donor re-sends them).
          if (msg.osPlatform) client.osPlatform = String(msg.osPlatform).slice(0, 16);
          if (msg.engineBackend) client.engineBackend = String(msg.engineBackend).slice(0, 24);
          if (msg.driverVersion) client.driverVersion = String(msg.driverVersion).slice(0, 48);
          if (msg.computeCapability) client.computeCapability = String(msg.computeCapability).slice(0, 12);
          if (Number(msg.linkDownMbps) > 0) client.donorLinkMbps = Number(msg.linkDownMbps); // WSQ.4 — live downlink update
          client.telemetry = {
            gpuName: (msg.gpuName || client.gpuName || 'webgpu').toString().slice(0, 80),
            vramMB: Number(msg.vramMB) || client.gpuVramMB || 0,
            maxBindMB: Number(msg.maxBindMB) || 0,
            gneuronsPerSec: Number(msg.gneuronsPerSec) || 0,
            stepsComputed: Number(msg.stepsComputed) || 0,
            osPlatform: client.osPlatform || '',
            engineBackend: client.engineBackend || '',
            driverVersion: client.driverVersion || '',
            computeCapability: client.computeCapability || '',
            ts: Date.now(),
          };
          // Accumulate this donor's neuron-compute contribution into the
          // leaderboard — Gneuron-seconds since their last telemetry (dt capped
          // at 10s so a reconnect gap can't spike the total). Keyed by the
          // persistent donorId so it survives page reloads + reconnects.
          // A telemetry frame may carry an updated name (donor renamed mid-session) —
          // re-resolve identity (and migrate banked compute) through the shared helper
          // so the row key always matches gpu_register's keying.
          if (msg.donorName !== undefined) {
            lbApplyDonorIdentity(brain, client, msg.donorName, `anon-${id}`);
          }
          const _lbKey = client.lbKey || client.donorId;
          if (_lbKey) {
            if (!brain._neuronLeaderboard) brain._neuronLeaderboard = {};
            const lb = brain._neuronLeaderboard[_lbKey] || { name: client.donorName || null, neurons: 0, lastSeen: 0, _lastTs: Date.now() };
            const now = Date.now();
            const dt = Math.min(10, Math.max(0, (now - (lb._lastTs || now)) / 1000));
            lb.neurons += (Number(msg.gneuronsPerSec) || 0) * dt; // billions of neuron-steps contributed
            lb._lastTs = now;
            lb.lastSeen = now;
            if (client.donorName) lb.name = client.donorName;
            brain._neuronLeaderboard[_lbKey] = lb;
          }
          break;
        }

        case 'set_donor_name': {
          // Donor sets/updates their leaderboard display name. Route their
          // contributions to the shared NAME row (name:<lower>) — NOT a donorId-keyed
          // row, which was the bug that spawned a duplicate "Bob" per device. The
          // helper sanitizes + length-caps the name and migrates any compute already
          // banked under this donor's anonymous donorId row onto the name row.
          lbApplyDonorIdentity(brain, client, msg.name, client.donorId || `anon-${id}`);
          break;
        }

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
          // PA.4.5 — result validation + "STD"-GPU quarantine. A bad/dirty/
          // malicious donor GPU can return NaN/Inf/negative/absurd spike
          // counts that the tick loop writes straight into
          // clusters[name].spikeCount + totalSpikes, corrupting brain state.
          // Validate every cluster's counts against [0, size] bounds at this
          // trust boundary; zero any invalid entry so the tick never sees
          // garbage, and strike the donor. Repeated strikes → quarantine
          // (drop from pool; if it was the primary, fail over to a standby).
          const _per = msg.perCluster || {};
          const _badNames = [];
          for (const _name of Object.keys(_per)) {
            const _entry = _per[_name];
            if (!_entry || typeof _entry !== 'object') { delete _per[_name]; continue; }
            const _size = brain.CLUSTER_SIZES[_name] || 0;
            const _last = _entry.lastSpikeCount;
            const _tot = _entry.spikeCountTotal;
            // lastSpikeCount: finite in [0, size]. spikeCountTotal: finite in
            // [0, size×64] (substeps vary; 64 is a generous, false-positive-safe cap).
            const _lastOk = Number.isFinite(_last) && _last >= 0 && _last <= _size;
            const _totOk = Number.isFinite(_tot) && _tot >= 0 && _tot <= _size * 64;
            if (!_lastOk || !_totOk) {
              _badNames.push(_name);
              _entry.lastSpikeCount = 0;
              _entry.spikeCountTotal = 0;
            }
          }
          if (_badNames.length > 0) {
            const _dc = brain.clients.get(ws);
            const _strikes = _dc ? (_dc.gpuBadResults = (_dc.gpuBadResults || 0) + 1) : 0;
            if (!brain._gpuValidationWarnAt || (Date.now() - brain._gpuValidationWarnAt) > 5000) {
              brain._gpuValidationWarnAt = Date.now();
              console.warn(`[Brain] PA.4.5 — donor ${id} returned invalid cluster result(s) [${_badNames.join(', ')}] (zeroed before use). Donor strikes: ${_strikes}/5.`);
            }
            const QUARANTINE_THRESHOLD = 5;
            if (_strikes >= QUARANTINE_THRESHOLD) {
              console.error(`[Brain] PA.4.5 — QUARANTINING donor ${id} after ${_strikes} bad-result batches (dirty/incompatible GPU). Removing from pool.`);
              if (brain._gpuClients) brain._gpuClients.delete(ws);
              if (ws === brain._gpuClient) {
                let _promo = null;
                if (brain._gpuClients) { for (const _c of brain._gpuClients) { if (_c && _c.readyState === 1) { _promo = _c; break; } } }
                if (_promo) {
                  brain._gpuClient = _promo; brain._gpuConnected = true;
                  brain._gpuInitialized = {}; brain._gpuInitializedConfirmed = {};
                  if (brain.cortexCluster) brain.cortexCluster._gpuShadowDirty = true;
                  _rearmCortexGpuUpload('quarantine failover');
                  console.log('[Brain] PA.4.5 — promoted a standby to primary after quarantine; brain re-uploads on next dispatch.');
                } else {
                  brain._gpuClient = null; brain._gpuConnected = false;
                  console.error('[Brain] PA.4.5 — no healthy standby after quarantine; dropped to all-CPU until a good donor connects.');
                }
                try { ws.send(JSON.stringify({ type: 'quarantined', reason: 'invalid compute results' })); } catch { /* donor already gone */ }
              }
            }
          }
          resolver({ perCluster: _per });
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
    // PA.4.3 — remove this donor from the GPU pool (no-op if it wasn't one).
    if (brain._gpuClients) brain._gpuClients.delete(ws);
    // PA.4.8 — recompute community compute level after a donor leaves.
    if (brain._recomputeCommunityCompute) brain._recomputeCommunityCompute();
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
      // PA.4.3 — the PRIMARY donor left. Promote a healthy STANDBY from the
      // pool (failover) so the brain keeps a GPU instead of dropping to
      // all-CPU + Chrome auto-respawn. The promoted donor has empty VRAM, so
      // force a full re-upload (clear init flags) + mark the shadow dirty;
      // the next dispatch re-sends gpu_init + re-uploads every projection.
      let _promotedGpu = null;
      if (brain._gpuClients) {
        // DF.7 — promote the STRONGEST live standby, not just the first one, so
        // the beefiest remaining GPU takes over. Default ON (DREAM_DF7_FANOUT≠0).
        if (typeof brain._df7Fanout === 'function' && brain._df7Fanout() && typeof brain._strongestLiveDonor === 'function') {
          _promotedGpu = brain._strongestLiveDonor(ws);
        }
        if (!_promotedGpu) {
          for (const _cand of brain._gpuClients) {
            if (_cand && _cand.readyState === 1 && _cand !== ws) { _promotedGpu = _cand; break; }
          }
        }
      }
      if (_promotedGpu) {
        brain._gpuClient = _promotedGpu;
        brain._gpuConnected = true;
        brain._gpuInitialized = {};
        brain._gpuInitializedConfirmed = {};
        brain._gpuHits = 0;
        brain._gpuMisses = 0;
        if (brain.cortexCluster) brain.cortexCluster._gpuShadowDirty = true;
        _rearmCortexGpuUpload('primary-left failover');
        const _pid = (brain.clients.get(_promotedGpu) || {}).id || '(unknown)';
        console.log(`[Server] PRIMARY GPU donor left — promoted standby ${_pid} to primary (pool: ${brain._gpuClients ? brain._gpuClients.size : 0}). Brain re-uploads to the new primary on next dispatch.`);
      } else {
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
      } // PA.4.3 — end no-standby branch (all-CPU + auto-respawn)
    }
    console.log(`[Server] Client disconnected: ${id} (${brain.clients.size} remaining)`);
  });

  ws.on('error', (err) => {
    console.warn(`[${id}] WebSocket error:`, err.message);
  });
});

// Broadcast brain state to all clients + refresh the PUBLIC snapshot cache.
// The public dashboard polls ONE cached file (GET /public-state.json) instead
// of each viewer opening a live WS stream — so 1000 public viewers cost one
// getState() per cadence + a static file read each, not 1000 full-state
// streams. We still compute when there are NO live WS clients IF a public
// poll happened recently, so the public page stays fresh without a WS.
setInterval(() => {
  const hasWsViewers = brain.clients.size > 0;
  const hasRecentPublicPoll = (Date.now() - (brain._lastPublicPollTs || 0)) < 30000;
  if (!hasWsViewers && !hasRecentPublicPoll) return; // nobody watching → skip the compute
  const stateObj = brain.getState();
  // Cache the public snapshot (SAME data points as the admin WS state).
  try { brain._publicStateJson = JSON.stringify({ type: 'state', state: stateObj, snapshotAt: Date.now() }); } catch { /* non-fatal */ }
  if (hasWsViewers) {
    const state = JSON.stringify({ type: 'state', state: stateObj });
    for (const [ws] of brain.clients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(state); } catch {}
      }
    }
  }
}, STATE_BROADCAST_MS);

// #33 — donor-socket liveness heartbeat sweep. Pings every connected socket;
// any that didn't answer the PREVIOUS ping (half-open — peer gone with no
// FIN/close) is terminate()d, which fires its ws.on('close') and the existing
// failover (a dead PRIMARY donor promotes a live standby instead of wedging a
// fresh donor behind a corpse). 30s cadence — long enough not to spam, short
// enough that a fresh donor isn't stuck for minutes behind a stale primary.
const _HEARTBEAT_MS = 30000;
// HBGRACE — how many CONSECUTIVE missed sweeps before terminate(). A single missed 30s window is
// NOT a dead socket: a donor mid replica-sync is draining a 40MB brain over its link, and the
// server's own teach/sync event-loop blocks can delay the ping send AND the pong handler. One miss
// under those conditions was falsely killing live, busy donors (worse on high-RTT/Starlink/Linux
// links) → terminate mid-sync → write-after-destroyed flood → reconnect → re-sync → churn.
const _HB_MISS_LIMIT = 2;        // healthy loop, idle donor: 2 misses (~60s) → dead
const _HB_MISS_LIMIT_BUSY = 5;   // mid-sync OR loop recently blocked: ~150s grace before death
const _heartbeatTimer = setInterval(() => {
  const loopBlockedRecently = (Date.now() - (brain._lastEventLoopBlockTs || 0)) < _HEARTBEAT_MS;
  for (const ws of wss.clients) {
    if (ws._isAlive === false) {
      const c = brain.clients.get(ws);
      // HBGRACE.3 — is this donor actively receiving the full-brain replica sync right now?
      const midSync = !!(brain._replicaSyncInFlight && brain._replicaSyncInFlight.has(ws));
      // HBGRACE.1/2 — busier grace budget when the donor is mid-sync OR the SERVER's own loop
      // just blocked (the pong may be sitting unprocessed in the queue — not the donor's fault).
      const limit = (midSync || loopBlockedRecently) ? _HB_MISS_LIMIT_BUSY : _HB_MISS_LIMIT;
      ws._missedPings = (ws._missedPings || 0) + 1;
      if (ws._missedPings < limit) {
        // Not dead yet — give another cycle. Re-ping so a live donor can clear it.
        ws._pingSentAt = Date.now();
        try { ws.ping(); } catch { /* dying — a later sweep terminates it */ }
        continue;
      }
      console.warn(`[Server] heartbeat — socket ${c ? c.id : '(unknown)'}${c && c.isGPU ? ' (GPU donor)' : ''} missed ${ws._missedPings} consecutive pings${midSync ? ' (mid replica-sync)' : ''}${loopBlockedRecently ? ' (server loop recently blocked)' : ''} — terminating so failover can fire.`);
      try { ws.terminate(); } catch { /* already gone */ }
      continue;
    }
    ws._isAlive = false;
    ws._pingSentAt = Date.now(); // PR.4 — stamp for the pong RTT measurement
    try { ws.ping(); } catch { /* socket dying — next sweep terminates it */ }
  }
}, _HEARTBEAT_MS);
wss.on('close', () => clearInterval(_heartbeatTimer));

// PR.2 — event-loop delay histogram (percentiles) via perf_hooks, complementing
// the 1s lag sampler above. Cumulative since boot; _getProfilingState reads
// mean/p50/p99/max so the admin view shows tail latency, not just the last spike.
try {
  const { monitorEventLoopDelay } = require('perf_hooks');
  const _elh = monitorEventLoopDelay({ resolution: 20 });
  _elh.enable();
  brain._eventLoopHistogram = _elh;
} catch { brain._eventLoopHistogram = null; }

// #36 — EVENT-LOOP LAG MONITOR (Path B keystone instrument). The box proved
// /ws handshakes stall at 306M even with consolidation disabled, so a
// synchronous span somewhere is monopolizing the loop — but we couldn't see
// WHICH. This sampler fires on a fixed 1s cadence; if it fires LATE, the delta
// is exactly how long the loop was blocked (= how long /ws handshakes + donor
// frames were stalled). It logs the blocked duration + live context so the
// span can be correlated to a phase / the inner-voice tick / a donor sync /
// consolidation. The threshold keeps healthy noise out. Tunable via
// DREAM_LOOP_LAG_WARN_MS. This turns "1/8 handshakes" into "section X blocked
// Nms" so Path B chunks the PROVEN blocker instead of guessing. Also pushed to
// the dashboard via brain._lastEventLoopLagMs (perf state) for a live readout.
const _LAG_SAMPLE_MS = 1000;
const _LAG_WARN_MS = Number(process.env.DREAM_LOOP_LAG_WARN_MS) > 0
  ? Number(process.env.DREAM_LOOP_LAG_WARN_MS)
  : 250;
let _lagAnchor = process.hrtime.bigint();
const _lagTimer = setInterval(() => {
  const now = process.hrtime.bigint();
  const actualMs = Number(now - _lagAnchor) / 1e6;
  _lagAnchor = now;
  const lagMs = actualMs - _LAG_SAMPLE_MS;
  brain._lastEventLoopLagMs = lagMs > 0 ? Math.round(lagMs) : 0;
  // HBGRACE.2 — stamp a REAL block (≥1s) so the donor heartbeat sweep can tell that a missed
  // pong was the server's own loop stalling (couldn't run the pong handler / send the ping),
  // NOT a dead donor — and extend grace instead of terminating a live, busy donor.
  if (lagMs >= 1000) brain._lastEventLoopBlockTs = Date.now();
  if (lagMs > _LAG_WARN_MS) {
    const cc = brain.cortexCluster;
    const phase = (cc && cc._activePhase && cc._activePhase.name)
      || (brain._curriculumInProgress ? 'curriculum' : 'idle');
    const cell = (cc && cc._currentCellKey) || '(none)';
    const donors = brain._gpuClients ? brain._gpuClients.size : 0;
    const consol = !!(brain.consolidationEngine && brain.consolidationEngine._inFlight);
    const innerVoice = !!brain._innerVoiceInFlight;
    const syncing = brain._replicaSyncInFlight ? brain._replicaSyncInFlight.size : 0;
    console.warn(`[EventLoop] BLOCKED ${lagMs.toFixed(0)}ms — /ws handshakes + donor frames stalled this long. context: phase=${phase} cell=${cell} donors=${donors} consolidationInFlight=${consol} innerVoiceInFlight=${innerVoice} replicaSyncing=${syncing}`);
  }
}, _LAG_SAMPLE_MS);
wss.on('close', () => clearInterval(_lagTimer));

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
  console.log('\n[Brain] SIGTERM — graceful stop (systemctl stop / restart).');
  // #38 — SIGTERM is a DELIBERATE clean stop (systemctl). Force-save + drop the
  // resume marker so the next spin-up auto-resumes (unless a heavy update made
  // the weights incompatible — then it fresh-starts with a notice).
  try { _writeResumeMarker('SIGTERM / systemctl'); } catch (err) {
    console.warn('[Brain] resume-marker on SIGTERM failed:', err && err.message);
  }
  try { brain.stop(); } catch {}
  process.exit(0);
});

// Per-concern mixins now attach BEFORE `new ServerBrain()` (above, near
// line 4718). Moving the attaches to pre-instantiation was the fix for
// the "TypeError: this._initEpisodicDB is not a function" boot crash
// operator caught 2026-06-17. See the comment block above the
// pre-instantiation Object.assigns for full LAW.MIXIN-ORDER rationale.

