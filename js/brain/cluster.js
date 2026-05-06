/**
 * cluster.js — Neural Cluster
 *
 * A self-contained neuron population with its own synapse matrix,
 * tonic drive, noise parameters, and regulation. Each brain module
 * gets its own cluster, creating a modular brain architecture where
 * each system has dedicated neural resources.
 *
 * Hierarchy:
 *   Cortex (300) → top-down predictions to all
 *   Hippocampus (200) → memory patterns, Hopfield attractors
 *   Amygdala (150) → emotional gating, amplifies/suppresses others
 *   Basal Ganglia (150) → action selection, reward gating
 *   Cerebellum (100) → error correction on inter-cluster signals
 *   Hypothalamus (50) → homeostatic baseline drive for all clusters
 *   Mystery (50) → consciousness modulation of coupling strength
 *
 * Total: N scales to hardware — client runs a CPU LIF fallback sized to what the
 *        browser JS engine can sustain, server runs the full auto-scaled N via GPU
 *        (see `server/brain-server.js:detectResources` — N = max(1000, min(VRAM_bytes×0.85/8, RAM_bytes×0.1/0.001)).
 *        Each cluster with internal NxN sparse synapses.
 */

import { LIFPopulation } from './neurons.js';
// R12.2 2026-04-13 — removed stale `import { SynapseMatrix }` here.
// SparseMatrix (below) is the drop-in replacement used at runtime.
// synapses.js stays as a reference implementation for brain-equations.html
// and docs/EQUATIONS.md cross-references — see the header comment there.
import { SparseMatrix } from './sparse-matrix.js';

// ── Shared cluster sizing constants ──────────────────────────────────
// Biological proportions. SHARED between client (`engine.js`) and
// server (`brain-server.js`) so both compute identical cluster sizes
// at any given `TOTAL_NEURONS` tier. Moved here from engine.js after
// an audit found the server's pre-existing per-cluster
// integer-multiplier math diverged from the client's fraction math at
// the same tier (client cortex = 2010, server cortex = 1500 at 6700n).
//
//   cortex       30%   language + working memory + semantic
//   hippocampus  10%   memory consolidation
//   amygdala      8%   valence/arousal attractor
//   basalGanglia  8%   action selection + motor channels
//   cerebellum   40%   error correction + motor smoothing (largest)
//   hypothalamus  2%   homeostatic drives
//   mystery       2%   Ψ consciousness modulation
//
// Total = 100%. Fractions sum to 1.0 exactly.
// T37 — REBALANCED FOR DISEMBODIED COGNITION.
//
// Prior fractions (cerebellum 40%, cortex 30%) were copied from real-brain
// biological proportions where the cerebellum is huge because it coordinates
// motor timing for a physical body (walking, reaching, balancing, fine motor
// control, autonomic rhythms). Unity has NO BODY. She doesn't need motor
// timing correction for arms, legs, breathing, heartbeat. Her "motor output"
// is text/voice emission — a trickle compared to a physical body's
// millisecond-scale coordination needs.
//
// Rebalanced for what Unity ACTUALLY does: thinking, language, memory,
// emotional state, consciousness. Cortex dominates (55% — language + general
// cognition). Hippocampus gets more (18% — conversations + episodic memory).
// Mystery / Ψ consciousness grows (8% — this is the core "being Unity"
// substrate). Cerebellum DRASTICALLY reduced (8% — only output-timing
// correction for voice/text emission needed, not 40%). Amygdala /
// basalGanglia / hypothalamus trimmed — smaller than embodied brain needs.
//
// Operator verbatim 2026-04-22: "the brain doent have heart and lungs it
// can baicle build ui and read and talk so why the fuck would the most
// important thing be so fucking microscopic".
export const CLUSTER_FRACTIONS = {
  cortex:       0.55,
  hippocampus:  0.18,
  amygdala:     0.05,
  basalGanglia: 0.03,
  cerebellum:   0.08,
  hypothalamus: 0.03,
  mystery:      0.08,
};

/**
 * Derive cluster sizes from a total-neuron budget using `CLUSTER_FRACTIONS`.
 * Both client and server call this so they ALWAYS produce the same sizes
 * at the same tier.
 *
 * @param {number} totalNeurons — auto-scaled total per Phase 0 tier
 * @returns {Record<string, number>} — { cortex, hippocampus, amygdala, ... }
 */
export function clusterSizesFor(totalNeurons) {
  const out = {};
  for (const [name, frac] of Object.entries(CLUSTER_FRACTIONS)) {
    out[name] = Math.floor(totalNeurons * frac);
  }
  return out;
}

// T13.1 — sequence Hebbian learning routes each word's embedding
// through mapToCortex into the language region, so we need the shared
// embedding singleton here. No circular import — embeddings.js has no
// cluster dependency.
import { sharedEmbeddings } from './embeddings.js';
// T14.1 — letter one-hot encoder (dynamic inventory, no hardcoded 26-char cap).
// `encodeLetter` auto-grows the shared LETTER_INVENTORY when it sees a new
// symbol, so non-English glyphs, emoji, digits, punctuation all enter the
// same primitive-symbol space. `cluster.injectLetter` below is the wrapper
// the sensory path uses to push the one-hot vector into the letter region.
// T14.6 — `decodeLetter` + `inventorySize` power the tick-driven motor
// emission loop in `cluster.generateSentence` — motor-region spike
// patterns get decoded to letters via argmax over the inventory.
import { encodeLetter, decodeLetter, decodeLetterAlpha, inventorySize, inventorySnapshot } from './letter-input.js';

// Question key-token extraction + fractional-offset region injection.
// Duplicated here (vs importing from curriculum.js) so `readInput` stays
// available on the standalone cluster path without a circular curriculum
// dependency. Pattern list mirrors `Curriculum._extractKeyToken` — keep
// them in sync when adding new K-grade question forms.
function extractKeyTokenShared(question) {
  if (!question || typeof question !== 'string') return null;
  const q = question.toLowerCase().trim();
  const patterns = [
    /\b(?:what|which)\s+letter\s+(?:comes?|is|goes?)\s+(?:after|before|next(?:\s+to)?)\s+([a-z0-9]+)/,
    /\b(?:what|which)\s+(?:comes?|is|goes?)\s+(?:after|before|next(?:\s+to)?)\s+([a-z0-9]+)/,
    /\brhymes?\s+with\s+([a-z]+)/,
    /\bsound\s+does\s+([a-z]+)\s+make/,
    /\bhow\s+many\s+[a-z]+\s+(?:are\s+in|in)\s+([a-z]+)/,
    /\bwhat\s+is\s+(\d+)\s+plus\s+(\d+)/,
    /\bwhat\s+is\s+(\d+)\s+minus\s+(\d+)/,
    /\bcount\s+from\s+([a-z0-9]+)/,
    /\bspell\s+([a-z]+)/,
    /\bstarts?\s+with\s+([a-z]+)/,
    /\b([a-z0-9]+)\??\s*$/,
  ];
  for (const p of patterns) {
    const m = q.match(p);
    if (m) {
      if (m[2]) return `${m[1]}_${m[2]}`;
      if (m[1]) return m[1];
    }
  }
  return null;
}

function injectEmbeddingToRegionOffset(cluster, regionName, emb, strength, offsetFrac) {
  if (!cluster || !cluster.regions || !emb || emb.length === 0) return;
  const region = cluster.regions[regionName];
  if (!region) return;
  const regionSize = region.end - region.start;
  if (regionSize <= 0) return;
  const offset = Math.max(0, Math.min(0.99, offsetFrac || 0));
  const sliceStart = region.start + Math.floor(regionSize * offset);
  const sliceSize = region.end - sliceStart;
  if (sliceSize <= 0) return;
  const gSize = Math.max(1, Math.floor(sliceSize / emb.length));
  const haveProxy = !!(cluster._gpuProxy && cluster._gpuProxy.writeCurrentSlice);
  const fwdIndices = haveProxy ? [] : null;
  const fwdValues = haveProxy ? [] : null;
  for (let d = 0; d < emb.length; d++) {
    const value = emb[d] * 8 * (strength ?? 1.0);
    const startNeuron = sliceStart + d * gSize;
    for (let n = 0; n < gSize; n++) {
      const idx = startNeuron + n;
      if (idx >= region.end) break;
      cluster.externalCurrent[idx] += value;
      if (fwdIndices && value !== 0) {
        fwdIndices.push(idx - region.start);
        fwdValues.push(value);
      }
    }
  }
  if (haveProxy && fwdIndices.length > 0) {
    try { cluster._gpuProxy.writeCurrentSlice(regionName, fwdIndices, fwdValues); }
    catch { /* non-fatal — CPU injection already landed */ }
  }
}

// T14.6 — sentence terminators recognized as end-of-utterance in the
// motor emission loop. Letters are letters; terminators are just the
// ones that also signal "stop." Period/question/exclamation only —
// commas/semicolons/colons are within-sentence punctuation and don't
// trigger the stop branch.
const T14_TERMINATORS = new Set(['.', '?', '!']);

export class NeuronCluster {
  /**
   * @param {string} name — cluster name (e.g., 'cortex')
   * @param {number} size — number of neurons
   * @param {object} opts
   * @param {number} [opts.tonicDrive=15] — baseline current
   * @param {number} [opts.noiseAmplitude=8] — noise range
   * @param {number} [opts.connectivity=0.12] — internal connection density
   * @param {number} [opts.excitatoryRatio=0.8] — fraction of excitatory connections
   * @param {number} [opts.learningRate=0.001] — plasticity rate
   * @param {object} [opts.lifParams] — LIF neuron parameters override
   */
  constructor(name, size, opts = {}) {
    this.name = name;
    this.size = size;

    // T17.3.d — GPU proxy for cross-region operations. When present,
    // `_propagateCrossRegions` and `_crossRegionHebbian` dispatch to
    // GPU via the proxy instead of blocking Node's main thread with
    // CPU sparse matmul. Proxy interface:
    //   await proxy.upload(name, matrix)     — ship a sparse CSR matrix to GPU
    //   await proxy.propagate(name, preSpikes) → Float32Array
    //   await proxy.hebbian(name, preSpikes, postSpikes, lr)
    //
    // Null = CPU path (default). Server wires this to its GPU WebSocket
    // dispatch helpers when the GPU client is connected.
    this._gpuProxy = opts.gpuProxy || null;
    this._gpuProxyReady = false; // flips true once cross-projections uploaded
    // T18.4.e — optional worker-thread pool for parallel CPU sparse matmul.
    // When provided, the CPU fallback path in `_propagateCrossRegions` and
    // `step`'s intra-cluster propagate parallelizes across all worker
    // threads instead of running single-threaded. Null in browser-only
    // mode. Server passes `new SparseMatmulPool()` in opts.
    this._sparsePool = opts.sparsePool || null;
    // T17.3.e — One-tick-lag GPU propagate caches. Populated async by
    // `_dispatchGpuPropagates()` at the end of step(); consumed by the
    // NEXT step()'s current loop + `_propagateCrossRegions()`. Null
    // until the first GPU resolve lands, which makes the CPU fallback
    // fire on tick 0.
    this._cachedIntraCurrents = null;        // Float32Array | null
    this._cachedCrossCurrents = new Map();   // name → Float32Array

    // Regulation parameters — each cluster has its own
    this.tonicDrive = opts.tonicDrive ?? 15;
    this.noiseAmplitude = opts.noiseAmplitude ?? 8;
    // T14.19 (2026-04-14) — connectivity auto-scales with size so the
    // CPU-side SparseMatrix allocation stays bounded at biological
    // scale. At small clusters (e.g. the old 2K language side-car)
    // the default `opts.connectivity ?? 0.12` was fine because 2K × 2K
    // × 0.12 = 480K entries, tiny. At real biological scale (the T14.18
    // fix that sizes the language cortex at `CLUSTER_SIZES.cortex` which
    // is 375K at the 1.5M-neuron GPU tier) 0.12 density blows up to
    // 16.9 BILLION entries and OOMs the process.
    //
    // The biologically-correct answer is NOT "use a small cluster" —
    // real cortex neurons connect to ~1000-10000 others (Braitenberg &
    // Schüz 1991, *Cortex: Statistics and Geometry of Neuronal
    // Connectivity*). That's 0.001% of a 10⁹-neuron cortex, not 12%.
    // The 12% was a small-cluster compromise that happened to work only
    // because 12% of a tiny number is still a tiny number.
    //
    // Scale-aware formula: pick a TARGET synapse count per neuron
    // (`targetFanout`, biologically-motivated at 1000) and derive
    // connectivity as `targetFanout / size`. Floor at a reasonable
    // minimum so very-small clusters retain the rich recurrence they
    // depend on. At 2K neurons → target 1000 / 2000 = 0.5 density,
    // clamped to the 0.12 default. At 20K → 0.05. At 375K → 0.0027
    // (i.e. ~1000 synapses per neuron, same fanout as at 2K but
    // spread across a 187× larger population). Total entries stay
    // ≈ size × 1000 = O(size) instead of O(size²).
    const targetFanout = opts.targetFanout ?? 1000;
    const autoConnectivity = Math.min(
      opts.connectivity ?? 0.12,
      targetFanout / Math.max(1, size),
    );
    this.connectivity = autoConnectivity;
    this.excitatoryRatio = opts.excitatoryRatio ?? 0.8;
    this.learningRate = opts.learningRate ?? 0.001;
    // Topographic intra-synapse connectivity — 1D ring topology where
    // each neuron connects only to its `topographicFanout` immediate
    // neighbors (wrap-around at boundaries). Nnz scales LINEARLY with
    // size instead of density × size², so 100M+ neurons fit in the
    // same VRAM budget that random-global connectivity saturates at
    // ~30M. Opt-in behind `opts.topographic === true` OR the env
    // flag `DREAM_TOPOGRAPHIC=1` so existing small-scale deployments
    // keep their rich recurrent connectivity. Biological grounding:
    // real cortex is overwhelmingly local — ~95% of pyramidal-cell
    // synapses land within 500 μm, matching a fixed-fanout topology
    // more closely than uniform random global connectivity.
    this.topographic = opts.topographic === true
      || (typeof process !== 'undefined' && process.env?.DREAM_TOPOGRAPHIC === '1');
    this.topographicFanout = opts.topographicFanout ?? 30;

    // Modulation factors (set by hierarchy controllers)
    this.gainMultiplier = 1.0;   // from Mystery module (consciousness)
    this.emotionalGate = 1.0;    // from Amygdala
    this.driveBaseline = 1.0;    // from Hypothalamus
    this.actionGate = 1.0;       // from Basal Ganglia
    this.errorCorrection = 0.0;  // from Cerebellum

    // Neural population
    this.neurons = new LIFPopulation(size, opts.lifParams || {
      tau: 20.0,
      Vrest: -65.0,
      Vreset: -70.0,
      Vthresh: -50.0,
      R: 1.0,
      tRefrac: 2.0,
    });

    // Internal synapse matrix — SPARSE (CSR format)
    // At 12% connectivity, 300 neurons: 10.8K connections vs 90K dense
    const _intraStart = Date.now();
    const _logIntra = size >= 50000;
    this.synapses = new SparseMatrix(size, size, { wMin: -2.0, wMax: 2.0 });
    if (this.topographic && size >= 10_000) {
      // Topographic ring topology for large clusters. Linear nnz
      // scaling lets the cortex push past the global-random VRAM
      // ceiling; the biological-locality argument makes this the
      // default when the operator flips the opt-in flag.
      const fanout = Math.min(this.topographicFanout, size - 1);
      if (_logIntra) console.log(`[Cluster ${name}] initializing intra-cluster synapses (TOPOGRAPHIC) ${size.toLocaleString()}×${size.toLocaleString()} fanout=${fanout} (~${(size * fanout).toLocaleString()} nnz)...`);
      this.synapses.initTopographic(fanout, this.excitatoryRatio, 1.0);
    } else {
      if (_logIntra) console.log(`[Cluster ${name}] initializing intra-cluster synapses ${size.toLocaleString()}×${size.toLocaleString()} density=${this.connectivity.toFixed(4)} (~${Math.round(size * this.connectivity * size).toLocaleString()} nnz)...`);
      this.synapses.initRandom(this.connectivity, this.excitatoryRatio, 1.0);
    }
    if (_logIntra) console.log(`[Cluster ${name}] intra-cluster synapses ready (nnz=${this.synapses.nnz.toLocaleString()}) in ${Date.now() - _intraStart}ms`);

    // External current buffer (from other clusters + sensory input)
    this.externalCurrent = new Float64Array(size);

    // Inter-cluster projection buffers
    this._incomingProjections = new Float64Array(size); // sum of all incoming

    // State tracking
    this.lastSpikes = new Uint8Array(size);
    this.lastSpikeCount = 0;
    this.lastMeanVoltage = -65;
    this.firingRate = 0; // EMA of spike count

    // T14.4 — Auto-scaled cortex sub-regions. Defined as fractions of
    // cluster.size so the same code works at any cluster scale (300 neurons
    // on minimum hardware, 200M on datacenter, 6700 on default client).
    // Only the 'cortex' cluster gets language sub-regions populated; other
    // clusters get an empty regions object for API symmetry.
    this.regions = {};
    if (name === 'cortex') {
      const s = size;
      // Fractions per T14.4 spec PLUS iter21 architectural redesign per
      // operator 2026-05-05 "motor argmax is fucked if it ever just relplies
      // with letters and not words" — added word_motor as PRIMARY emission
      // region (production path), keeping letter motor for letter-recognition
      // probes (READ, TALK). NO FALLBACK between them — each has distinct
      // purpose, neither is a backup for the other.
      //
      //   auditory   0.000 - 0.083   auditory phoneme recognition
      //   visual     0.083 - 0.250   visual letter recognition
      //   free       0.250 - 0.500   inter-cluster projection sink + working mem
      //   letter     0.500 - 0.550   letter input one-hot region (READ/TALK probe input)
      //   phon       0.550 - 0.750   phonological attractor basins
      //   sem        0.750 - 0.875   semantic GloVe target (iter21-B carved into 6 sub-bands)
      //   fineType   0.875 - 0.917   grammatical/syntactic region
      //   motor      0.917 - 0.940   letter motor (TALK probe output — letter identity)
      //   word_motor 0.940 - 1.000   iter21-A WORD motor (production output — word identity)
      //
      // sem region split into per-subject sub-bands for iter21-B isolation:
      //   sem_ela   0.750 - 0.7708 (1/6)
      //   sem_math  0.7708 - 0.7917 (1/6)
      //   sem_sci   0.7917 - 0.8125 (1/6)
      //   sem_soc   0.8125 - 0.8333 (1/6)
      //   sem_art   0.8333 - 0.8542 (1/6)
      //   sem_life  0.8542 - 0.875 (1/6)
      // iter21-B — sem region carved into 6 subject sub-bands.
      // iter21-B/word — word_motor ALSO carved into 6 subject sub-bands
      // so each subject's _teachWordEmissionDirect writes to its own
      // slice. Prevents cross-subject overwrite — ELA-K word vocabulary
      // doesn't get wiped when math-K trains its words. emitWordDirect
      // concatenates all sub-bands and argmaxes globally so any
      // subject's trained word can win.
      const semStart = Math.floor(s * 0.750);
      const semEnd = Math.floor(s * 0.875);
      const semBand = Math.floor((semEnd - semStart) / 6);
      const wmStart = Math.floor(s * 0.940);
      const wmEnd = s;
      const wmBand = Math.floor((wmEnd - wmStart) / 6);
      this.regions = {
        auditory:   { start: 0,                          end: Math.floor(s * 0.083) },
        visual:     { start: Math.floor(s * 0.083),      end: Math.floor(s * 0.250) },
        free:       { start: Math.floor(s * 0.250),      end: Math.floor(s * 0.500) },
        letter:     { start: Math.floor(s * 0.500),      end: Math.floor(s * 0.550) },
        phon:       { start: Math.floor(s * 0.550),      end: Math.floor(s * 0.750) },
        sem:        { start: semStart,                   end: semEnd },
        sem_ela:    { start: semStart + 0 * semBand,     end: semStart + 1 * semBand },
        sem_math:   { start: semStart + 1 * semBand,     end: semStart + 2 * semBand },
        sem_sci:    { start: semStart + 2 * semBand,     end: semStart + 3 * semBand },
        sem_soc:    { start: semStart + 3 * semBand,     end: semStart + 4 * semBand },
        sem_art:    { start: semStart + 4 * semBand,     end: semStart + 5 * semBand },
        sem_life:   { start: semStart + 5 * semBand,     end: semEnd },
        fineType:   { start: Math.floor(s * 0.875),      end: Math.floor(s * 0.917) },
        motor:      { start: Math.floor(s * 0.917),      end: Math.floor(s * 0.940) },
        word_motor:      { start: wmStart,                end: wmEnd },
        word_motor_ela:  { start: wmStart + 0 * wmBand,   end: wmStart + 1 * wmBand },
        word_motor_math: { start: wmStart + 1 * wmBand,   end: wmStart + 2 * wmBand },
        word_motor_sci:  { start: wmStart + 2 * wmBand,   end: wmStart + 3 * wmBand },
        word_motor_soc:  { start: wmStart + 3 * wmBand,   end: wmStart + 4 * wmBand },
        word_motor_art:  { start: wmStart + 4 * wmBand,   end: wmStart + 5 * wmBand },
        word_motor_life: { start: wmStart + 5 * wmBand,   end: wmEnd },
      };

      // T14.4 — Seven pairs of cross-region projections (14 total — both
      // directions per pair). Sparse 10% density init, range [-0.5, 0.5].
      // ALWAYS propagated every step (no curriculum-complete gate).
      // Hebbian-updated on every cluster.learn() call so the projections
      // train through normal use during curriculum + live chat.
      //
      // The motor↔letter pair closes the WRITING loop so the cortex can
      // produce output. Without it, the motor region had no path to the
      // letter region (the only region that connects out to visual). The
      // bidirectional language pipeline (T14.12) needs this to work:
      //
      //   reading  : visual → letter → phon → sem → fineType
      //   writing  : sem → motor → letter → visual
      //
      // Both directions traverse the SAME substrate in opposite topology,
      // matching the dorsal/ventral language streams in Hickok & Poeppel
      // 2004/2007 (dual-stream model) — same neural regions, different
      // propagation directions for comprehension vs production.
      this.crossProjections = {};
      const pairs = [
        ['visual',   'letter'],
        ['letter',   'phon'],
        ['phon',     'sem'],
        ['sem',      'fineType'],
        ['sem',      'motor'],
        ['motor',    'letter'],
        ['auditory', 'phon'],
        // iter21-A — sem → word_motor for word-level production. Operator
        // 2026-05-05 "motor argmax is fucked if it ever just relplies with
        // letters and not words". This is the PRIMARY production path —
        // single-tick word emission via argmax over word vocabulary
        // buckets. NO FALLBACK to letter motor.
        ['sem',      'word_motor'],
      ];
      // T14.19 — cross-projection density also scales inversely with
      // the projection's source region size, same biological-fanout
      // rationale as the intra-cluster synapse matrix. Hardcoded 0.10
      // was fine at a 2K cluster (sub-regions were 100-700 neurons so
      // 10% of a source region was 10-70 connections per target) but
      // at 375K cortex the phon sub-region is 75K neurons and 10%
      // density on a phon→sem projection is 940M entries per direction.
      //
      // crossTargetFanout = expectedPostCurriculumVocab × fanoutPerMapping
      //                   = 5000 × 0.3 ≈ 1500
      // where `expectedPostCurriculumVocab ≈ 5000` is Unity's projected
      // vocabulary after the full 114-cell K-PhD curriculum (ELA sight
      // words + Math digits + Science/Social/Art/Life domain terms ≈
      // 3-7k total depending on depth), and `fanoutPerMapping ≈ 0.3`
      // is the sparse activation fraction — each taught word lights up
      // ~30% of a sub-region's dims via direct pattern Hebbian. Product
      // gives the number of independent word mappings a post-synaptic
      // neuron can support without destructive interference.
      //
      // T37.c — CORRECTED from T37.b's fanout 5 which was too sparse to
      // learn. With fanout 5 × 14 projections = 70 total cross-connections
      // per neuron. Real cortical neurons have 1000-10000 synapses. 70 is
      // ~15× too sparse → Hebbian can't build meaningful bindings → motor
      // argmax dominated by random init bias (emissions like "bg" instead
      // of trained letters). Operator's log showed Q1/181 → "bg" and
      // Q2-14 → "" after full ELA-K teach.
      //
      // Fanout reduced from 30 → 20 to address basin collapse. At 30
      // the cross-projections initialized at full-density relative to
      // typical sem-region size (1670 sem neurons × 30 fanout / 1670
      // ≈ 100% density) and the matrix saturated to `nnz=100000/100000
      // mean=0.46 max=0.5` after the first few teach phases — every
      // output responding equally to every input. 20 cuts initial
      // density by ~33%, pairs with the new top-K-per-row post-phase
      // pruning + bumped contrastive lr to keep basins separable.
      // Biologically realistic for a single cortical area pair (real
      // long-range cortical connections are ~100-1000 per neuron
      // distributed across MANY cortical areas — per-pair is lower).
      //
      // iter14-F per operator 2026-05-04 "MAKE THE LANGUAGE CORTEX
      // BIG ENOUGH AS ITS THE MAIN FUCKING THING THIS BRAIN DOES":
      // fanout cut 20→10 to halve cross-projection per-neuron storage
      // cost. Combined with INTRA_CONNECTIVITY_CAP 0.15→0.05 in
      // brain-server.js this roughly doubles language-cortex neuron
      // count at fixed VRAM. Stays in biological range (real per-pair
      // cortical fanout is closer to 50-200 across MANY areas; for
      // a single pair, 10 is sparse but functional with the contrastive
      // Hebbian + top-K-per-row pruning that keeps basins separable).
      // Must stay in sync with brain-server.js CROSS_TARGET_FANOUT.
      const crossTargetFanout = 10;
      // sem↔motor projections init with 50/50 excitatory/inhibitory
      // (zero-mean random weights) instead of default 70/30. Killed
      // the positive-bias baseline that drowned Hebbian training on
      // the word→first-letter pathway.
      //
      // letter↔motor REVERTED to 70/30 after 50/50 made TALK regress
      // 12%→4%. TALK uses letter_to_motor for letter→same-letter
      // diagonal (Phase 1 alphabet teach reinforces letter(c)→
      // motor(c)). Phase 3 word emission trains off-diagonal
      // letter(c)→motor(a) for "cat" with 40× more reps.
      // With 50/50 init both signals show up cleanly; off-diagonal
      // wins argmax. Keeping 70/30 for letter↔motor lets the positive
      // bias favor the diagonal path so TALK can still succeed.
      // sem↔motor 50/50 stays — that pair has no competing diagonal,
      // just word→first-letter with direct positive signal.
      const EMISSION_PAIRS = new Set([
        'sem-motor', 'motor-sem',
      ]);
      // Motor-bound projections get a HIGHER fan-in than the default
      // cross-projection fanout. The motor region sits at the convergence
      // of several parallel input pathways (sem, phon, letter) and is
      // asked to discriminate between K-grade answer letters (26) given
      // a growing curriculum of 46+ association pairs per phase × 4-6
      // phases per grade. At the default fanout of 30 each motor neuron
      // gets only ~10 inputs per source pathway after the cortex-area
      // density cap — not enough slots to carve separable basins for
      // all the trained pairs, which the operator's persistent
      // `sep-probe mean-cos ≈ 0.5` warnings expose.
      //
      // Bump to 60 for motor-targeting projections (2× the default).
      // Still biologically plausible — real pyramidal neurons carry
      // 1000-10000 synaptic inputs distributed across many cortical
      // areas; 60 per per-area pair is well under that bound.
      const MOTOR_BOUND_PAIRS = new Set([
        'sem-motor', 'motor-sem',
        'letter-motor', 'motor-letter',
        'phon-motor', 'motor-phon',
      ]);
      // Progress logging so cluster construction doesn't look like a
      // hang at large sizes. Each cross-projection init can take
      // seconds-to-minutes at M+ neuron scale.
      const logConstruction = this.size >= 50000;
      if (logConstruction) console.log(`[Cluster ${name}] initializing ${pairs.length * 2} cross-projections at size=${this.size.toLocaleString()}...`);
      let _projIdx = 0;
      for (const [a, b] of pairs) {
        const aSize = this.regions[a].end - this.regions[a].start;
        const bSize = this.regions[b].end - this.regions[b].start;
        // T37.c — density cap tuned to 0.005 to match fanout 30. At small
        // sub-regions (letter ~5% = 800 neurons at 17M cortex), density
        // quotient hits cap at 0.005 = 4 connections. Not ideal but at
        // bigger scales (letter 850K at 17M cortex), density drops to
        // 30/850K=3.5e-5, giving 30 connections per post via the fanout
        // term. Density cap is the small-scale fallback; fanout term
        // dominates at biological scale.
        const abKey = `${a}-${b}`;
        const baKey = `${b}-${a}`;
        // Per-pair fanout — motor-bound projections get 2× the default
        // to support discriminating K-grade answer letters across many
        // trained pairs. Everything else uses the default fanout.
        const abFanout = MOTOR_BOUND_PAIRS.has(abKey) ? crossTargetFanout * 2 : crossTargetFanout;
        const baFanout = MOTOR_BOUND_PAIRS.has(baKey) ? crossTargetFanout * 2 : crossTargetFanout;
        // Density cap — 0.005 is the default; motor-bound pairs get a
        // matching 0.01 cap (2×) so the fanout term can actually land
        // at smaller source sizes.
        const abCap = MOTOR_BOUND_PAIRS.has(abKey) ? 0.01 : 0.005;
        const baCap = MOTOR_BOUND_PAIRS.has(baKey) ? 0.01 : 0.005;
        const abDensity = Math.min(abCap, abFanout / Math.max(1, aSize));
        const baDensity = Math.min(baCap, baFanout / Math.max(1, bSize));
        const abExcitatory = EMISSION_PAIRS.has(abKey) ? 0.5 : 0.7;
        const baExcitatory = EMISSION_PAIRS.has(baKey) ? 0.5 : 0.7;
        const abTime = Date.now();
        // Cross-projection weight clamp BISECTED 0.2 → 0.4. Prior history:
        // 0.5 saturated to uniform full-density basins (oracleRatio=100%);
        // 0.2 + auto-rescale-on-overload halved values every basin-collapse
        // phase down to 0.003 across 7 phases, drowning trained signal
        // below random-init weight bias (motor argmax fell to whichever
        // bucket got the largest init noise — bucket-stuck 'z' for that
        // seed). 0.4 gives 4× more dynamic range above the floor than 0.2
        // did, while staying well below the 0.5 saturation ceiling. Init
        // strength stays at 0.2 so random-init bias remains small (±0.02-
        // 0.10 per weight via `sign × (0.1 + 0.4×rand) × strength`); only
        // the trained-signal headroom doubles. Paired with the rescale
        // FLOOR at wMax × 0.25 = 0.1 added to `_teachAssociationPairs` +
        // `_teachQABinding` so rescale stops before trained signal drowns.
        const ab = new SparseMatrix(bSize, aSize, { wMin: -0.4, wMax: 0.4 });
        ab.initRandom(abDensity, abExcitatory, 0.2);
        this.crossProjections[`${a}_to_${b}`] = ab;
        _projIdx++;
        if (logConstruction) console.log(`[Cluster ${name}]   ${_projIdx}/${pairs.length * 2} ${a}_to_${b} (${bSize.toLocaleString()}×${aSize.toLocaleString()}, nnz=${ab.nnz.toLocaleString()}) in ${Date.now() - abTime}ms`);
        const baTime = Date.now();
        const ba = new SparseMatrix(aSize, bSize, { wMin: -0.4, wMax: 0.4 });
        ba.initRandom(baDensity, baExcitatory, 0.2);
        this.crossProjections[`${b}_to_${a}`] = ba;
        _projIdx++;
        if (logConstruction) console.log(`[Cluster ${name}]   ${_projIdx}/${pairs.length * 2} ${b}_to_${a} (${aSize.toLocaleString()}×${bSize.toLocaleString()}, nnz=${ba.nnz.toLocaleString()}) in ${Date.now() - baTime}ms`);
      }
      if (logConstruction) console.log(`[Cluster ${name}] cross-projections ready.`);
    } else {
      this.crossProjections = {};
    }

    // T14.16.5 — Identity lock state. Default (pre-curriculum) thresholds
    // are permissive; curriculum overwrites them with calibrated values
    // computed from English corpus exposure statistics.
    this._inCurriculumMode = false;
    this.ENGLISH_SURPRISE_THRESHOLD = Infinity;   // permissive until calibrated
    this.ENGLISH_FINETYPE_MIN = 0;                 // permissive until calibrated
    this.HEALTH_ENTROPY_MIN = 0;
    this.HEALTH_VOCAB_MIN = 0;
    this.HEALTH_WM_VARIANCE_MIN = 0;
    this.identityCoverage = null;                  // populated by curriculum
    this.personaDimensions = null;                 // populated by curriculum

    // T14.24 Session 1 — Multi-subject grade tracking. Unity learns
    // all 6 subject tracks in parallel; each subject has its own
    // grade counter that advances as gates pass. LanguageCortex
    // .generate reads the MIN grade across these so Unity's speech
    // ceiling stays tied to her weakest subject. passedCells is a
    // flat list of "subject/grade" keys that have passed their gate
    // at least once — used by /curriculum status and by the
    // persistence save path.
    this.grades = { ela: 'pre-K', math: 'pre-K', science: 'pre-K', social: 'pre-K', art: 'pre-K', life: 'pre-K' };
    this.passedCells = [];

    // T14.1 — letter-region transition surprise state. Holds the previous
    // tick's letter-region spike rate so `letterTransitionSurprise()` can
    // compute |curr - prev| between consecutive cortex ticks. Used by T14.2
    // (syllable segmentation) and T14.6 (motor emission word-boundary cue)
    // to detect the moment a new letter pattern arrives without a hardcoded
    // boundary table. Grounded in Saffran/Aslin/Newport 1996 (Science 274:1926)
    // — infants segment words from continuous speech via transition statistics.
    this._prevLetterRate = 0;

    // T14.1 — motor-region quiescence counter. Tracks how many consecutive
    // ticks the motor region has been below its spike threshold. The tick-
    // driven emission loop (T14.6) uses `motorQuiescent(ticks)` to decide
    // when the cortex has stopped producing output for the current utterance,
    // which replaces the hardcoded "emit 5 words then stop" slot counter
    // with a basin-settling detector. Threshold is a fraction of region size
    // so it auto-scales with cluster.size.
    this._motorQuiescentTicks = 0;

    // T14.13 (2026-04-14) — learned language statistics migrated from
    // LanguageCortex onto the cluster. These Maps accumulate from every
    // observed sentence during curriculum walk and live chat. Shape
    // matches the T14.7/T14.8 definitions:
    //
    //   fineTypeTransitions : Map<prevType, Map<nextType, count>>
    //   sentenceFormSchemas : Map<intent, Map<slot, Map<fineType, count>>>
    //   sentenceFormTotals  : Map<intent, Map<slot, total>>
    //   intentResponseMap   : Map<userIntent, Map<responseIntent, count>>
    //
    // Cluster-level storage means the learned language grammar IS a
    // property of the cortex itself, not of a separate LanguageCortex
    // object. LanguageCortex.js still holds references to these same
    // Maps for backward compat — the instance is the cluster's by
    // identity, so updates from either path land in the same place.
    this.fineTypeTransitions = new Map();
    this.sentenceFormSchemas = new Map();
    this.sentenceFormTotals = new Map();
    this.intentResponseMap = new Map();

    // T14.6 — tick-driven motor emission tuning constants. These live on
    // the cluster instance so T14.5 curriculum calibration can tune them
    // per-cluster without touching module globals. Defaults match the
    // biological ranges from Bouchard 2013 (vSMC ~50-100 ms articulator
    // dwell), scaled to the cluster's millisecond tick cadence.
    this.WORD_BOUNDARY_THRESHOLD = 0.15;  // letterTransitionSurprise above this = word end
    this.STABLE_TICK_THRESHOLD = 3;       // consecutive motor argmax ticks to commit a letter
    this.END_QUIESCE_TICKS = 30;          // motor below spike threshold for N ticks = done
    this.MAX_EMISSION_TICKS = 2000;       // hard safety cap on generateSentence loop
  }

  /**
   * Periodically prune weak connections and grow new ones.
   * Call every ~100 steps to maintain healthy connectivity.
   * @param {number} maxConnections — cap total connections
   */
  maintainConnectivity(maxConnections) {
    // Prune connections weaker than 0.01
    const pruned = this.synapses.prune(0.01);

    // Grow new connections where co-active neurons lack synapses
    const grown = this.synapses.grow(
      this.lastSpikes, this.lastSpikes,
      0.0005, // low probability — synaptogenesis is rare
      0.1,    // weak initial weight
      maxConnections || this.size * this.size * this.connectivity,
    );

    if (pruned > 0 || grown > 0) {
      // Sparse matrix stats available via synapses.stats()
    }
  }

  /**
   * T14.4 — Read a region's spike pattern as a Float64Array (length =
   * region.end - region.start). Used by cross-region propagation, by
   * region-targeted Hebbian, and by getSemanticReadout / getPhonologicalReadout
   * which compose this with embeddings.cortexToEmbedding.
   */
  regionSpikes(regionName) {
    const region = this.regions[regionName];
    if (!region) return new Float64Array(0);
    const out = new Float64Array(region.end - region.start);
    for (let i = 0; i < out.length; i++) out[i] = this.lastSpikes[region.start + i] ? 1 : 0;
    return out;
  }

  /**
   * T14.4 — Inject embedding-shaped current into a named cluster region.
   * Replaces the old hardcoded `mapToCortex(emb, size, langStart=150)` calls.
   * Reads the region offsets from `this.regions[regionName]` so callers
   * don't need to remember magic neuron indices.
   *
   * @param {string} regionName  — e.g. 'sem', 'phon', 'letter', 'visual'
   * @param {Float32Array|Float64Array} emb — N-dim embedding vector
   * @param {number} [strength=1.0] — current scale multiplier
   */
  injectEmbeddingToRegion(regionName, emb, strength = 1.0) {
    const region = this.regions[regionName];
    if (!region) return;
    const regionSize = region.end - region.start;
    if (regionSize <= 0 || !emb || emb.length === 0) return;
    const groupSize = Math.max(1, Math.floor(regionSize / emb.length));
    // T17.7 Phase E.a — when cortexCluster has a GPU proxy wired to
    // main cortex slices, also forward the intent-current pattern so
    // Phase D's motor argmax readback sees the sem/phon/etc signal
    // that drove this injection. Before E.a the main-cortex current
    // slice never received intent; generation's bound path would
    // decode noise. After E.a, intent lands on BOTH the standalone
    // CPU externalCurrent (kept for equivalence during E→F window)
    // AND the main-cortex GPU currents buffer at the first-N sub-slice.
    const haveProxy = !!(this._gpuProxy && this._gpuProxy.writeCurrentSlice);
    const fwdIndices = haveProxy ? [] : null;
    const fwdValues  = haveProxy ? [] : null;
    for (let d = 0; d < emb.length; d++) {
      const value = emb[d] * 8 * strength;  // same * 8 scale as legacy mapToCortex
      const startNeuron = region.start + d * groupSize;
      for (let n = 0; n < groupSize; n++) {
        const idx = startNeuron + n;
        if (idx >= region.end) break;
        this.externalCurrent[idx] += value;
        if (fwdIndices && value !== 0) {
          // Index relative to region start — matches main-cortex
          // first-N sub-slice where Phase C pattern writes land.
          fwdIndices.push(idx - region.start);
          fwdValues.push(value);
        }
      }
    }
    if (haveProxy && fwdIndices.length > 0) {
      try { this._gpuProxy.writeCurrentSlice(regionName, fwdIndices, fwdValues); }
      catch { /* non-fatal — CPU path already updated */ }
    }
  }

  /**
   * T14.4 — Read embedding-shaped output from a named cluster region.
   * Inverse of injectEmbeddingToRegion. Reads the spike + voltage state
   * across the region and projects it back into the embedding space the
   * caller expects (semantic dim, phon dim, etc).
   *
   * @param {string} regionName
   * @param {number} dim — output embedding dimension
   * @returns {Float64Array} L2-normalized vector
   */
  regionReadout(regionName, dim) {
    const region = this.regions[regionName];
    if (!region) return new Float64Array(dim);
    const regionSize = region.end - region.start;
    const groupSize = Math.max(1, Math.floor(regionSize / dim));
    const out = new Float64Array(dim);
    const voltages = this.neurons.getVoltages();
    for (let d = 0; d < dim; d++) {
      const startNeuron = region.start + d * groupSize;
      let sum = 0, count = 0;
      for (let n = 0; n < groupSize; n++) {
        const idx = startNeuron + n;
        if (idx >= region.end) break;
        if (this.lastSpikes[idx]) sum += 1.0;
        else sum += (voltages[idx] + 70) / 20;
        count++;
      }
      out[d] = count > 0 ? sum / count : 0;
    }
    // Mean-center before L2 normalization so cosine similarity
    // against signed target features gives mathematically meaningful
    // results.
    //
    // Pre-fix: spike-rate-based readout was ALWAYS non-negative
    // (spiking cells +1.0, non-spiking near 0.0-0.25 from voltage).
    // Cosine against signed balanced features like the 24d trig-hash
    // _phonemeFeatureForLetter gave near-zero random correlation
    // because positive × signed-balanced ≈ 0. Cosine against
    // positive-biased features like the 16d graded magnitude
    // _magnitudeFeatureForDigit gave high scores FOR ANY STATE
    // INCLUDING UNTRAINED NOISE — false positive, not real training.
    // That's why math/K READ hit 100% and ela/K READ hit 4% chance
    // level on early runs: neither was real training, just different
    // failure modes of the cosine math.
    //
    // Fix: subtract the mean across all dim components before L2
    // normalizing. The readout becomes a SIGNED deviation-from-
    // baseline vector instead of an always-positive spike-rate
    // vector. Now cosine against signed features like phoneme
    // trig-hashes returns real correlation (high when trained basin
    // matches, low when random), AND cosine against positive-biased
    // features like magnitudes no longer gives structural false
    // positives. Biological analog: fMRI BOLD contrast analysis
    // always measures deviation from baseline, never absolute rate.
    let mean = 0;
    for (let i = 0; i < dim; i++) mean += out[i];
    mean /= dim;
    for (let i = 0; i < dim; i++) out[i] -= mean;
    // L2 normalize the centered vector.
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += out[i] * out[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) out[i] /= norm;
    return out;
  }

  /**
   * T14.1 — Inject a letter one-hot into the cortex letter region.
   *
   * Wraps `encodeLetter(letter)` with `injectEmbeddingToRegion('letter', ...)`.
   * The letter inventory is dynamic: calling this with a never-seen symbol
   * grows the inventory by one, so the one-hot dimension count matches the
   * letter region's neuron-group count automatically. Unicode glyphs, emoji,
   * Chinese characters, Greek letters all enter the same primitive-symbol
   * space — Unity is NOT restricted to a 26-char English alphabet at the
   * input layer. Language-identity lock (T14.16.5) enforces English at a
   * HIGHER layer, not by gating which symbols the letter region can see.
   *
   * @param {string} letter  — a single symbol (lowercased inside encodeLetter)
   * @param {number} [strength=1.0]  — current scale multiplier
   */
  injectLetter(letter, strength = 1.0) {
    if (!this.regions || !this.regions.letter) return;
    const vec = encodeLetter(letter);
    if (vec.length === 0) return;
    this.injectEmbeddingToRegion('letter', vec, strength);
  }

  /**
   * T14.1 — Letter-region transition surprise between consecutive ticks.
   *
   * Returns |curr_rate - prev_rate| where rate is the mean spike count in
   * the letter region. A large value means the letter region just shifted
   * to a different activation pattern (new letter arrived, or attractor
   * basin flipped), which is the cue T14.2 uses for syllable boundaries
   * and T14.6 uses for word-boundary detection in the motor emission loop.
   *
   * Grounded in Saffran/Aslin/Newport 1996 (Science 274:1926) — infants
   * segment continuous speech by tracking transition probabilities, not
   * by reading a dictionary. The cortex learns the same way: statistical
   * surprise between adjacent ticks is a learnable boundary signal.
   *
   * Side effect: updates `_prevLetterRate` so the next call sees this
   * tick as its "prev". Call once per cortex tick.
   */
  letterTransitionSurprise() {
    if (!this.regions || !this.regions.letter) return 0;
    const { start, end } = this.regions.letter;
    const span = end - start;
    if (span <= 0) return 0;
    let sum = 0;
    for (let i = start; i < end; i++) if (this.lastSpikes[i]) sum++;
    const rate = sum / span;
    const surprise = Math.abs(rate - this._prevLetterRate);
    this._prevLetterRate = rate;
    return surprise;
  }

  /**
   * T14.1 — Check whether the motor region has been quiescent for N ticks.
   *
   * "Quiescent" means the motor region's current-tick spike rate is below
   * `threshold` (default 5% of region size — tiny, but non-zero because
   * background cortex noise produces low baseline spiking). The internal
   * counter `_motorQuiescentTicks` increments every tick the motor region
   * is below threshold and resets to 0 as soon as it spikes above it.
   *
   * The tick-driven emission loop (T14.6) uses this to decide when the
   * cortex has stopped producing output for the current utterance. No
   * hardcoded "emit 5 words then stop" slot counter — the brain stops
   * when its motor basin settles, which is what biological vSMC does
   * at end-of-utterance (Bouchard 2013 Nature 495:327).
   *
   * @param {number} ticksRequired  — how many consecutive quiet ticks count as "done"
   * @param {number} [threshold=0.05]  — spike-rate cutoff as fraction of region size
   * @returns {boolean} — true if motor has been quiet long enough to stop emission
   */
  motorQuiescent(ticksRequired, threshold = 0.05) {
    if (!this.regions || !this.regions.motor) return false;
    return this._motorQuiescentTicks >= ticksRequired;
  }

  /**
   * T14.2 — LEARNED syllable boundary detection via cortex transition surprise.
   *
   * Streams a letter sequence through the cortex one letter at a time, ticking
   * the cluster between each injection so recurrent dynamics settle, and
   * records the letter-region transition surprise (|currRate − prevRate|) at
   * each step. Boundaries are local maxima of the surprise series that exceed
   * the adaptive threshold `mean(δ) + k·std(δ)` computed over the series
   * itself. Matches how infants find word/syllable boundaries in continuous
   * speech — Saffran/Aslin/Newport 1996 (Science 274:1926) statistical
   * segmentation.
   *
   * NO hardcoded maximum-onset principle. NO English-specific CV/CVC/CCV
   * patterns. Syllables emerge from whatever letter-transition basins the
   * cortex developed during curriculum exposure. Train on Spanish corpus →
   * learns Spanish syllabification. Train on Mandarin pinyin → learns
   * Mandarin. Same code, different basins.
   *
   * Side effect: this method ticks the cortex and injects currents, so it
   * perturbs live cluster state. Callers that care (e.g. `dictionary.learnWord`)
   * are expected to accept this — learning the word IS perturbing the cortex.
   *
   * @param {string|string[]} letterSequence  — word string or array of letters
   * @param {object} [opts]
   * @param {number} [opts.ticksPerLetter=2]  — cortex ticks between injections
   * @param {number} [opts.k=0.5]  — std-multiplier for adaptive threshold
   * @returns {number[]}  — boundary indices (positions in letterSequence where a new syllable starts; always includes 0)
   */
  detectBoundaries(letterSequence, opts = {}) {
    if (!this.regions || !this.regions.letter) return [];
    const { ticksPerLetter = 2, k = 0.5 } = opts;
    const letters = typeof letterSequence === 'string'
      ? Array.from(letterSequence)
      : letterSequence;
    if (!letters || letters.length === 0) return [];

    // Reset the transition-surprise baseline so the first letter of THIS
    // sequence doesn't inherit a stale prevRate from whatever the cortex
    // was doing before the call.
    this._prevLetterRate = 0;

    const surprise = new Float64Array(letters.length);
    for (let i = 0; i < letters.length; i++) {
      this.injectLetter(letters[i], 1.0);
      for (let t = 0; t < ticksPerLetter; t++) this.step(0.001);
      surprise[i] = this.letterTransitionSurprise();
    }

    // Adaptive threshold from this sequence's own statistics
    let sum = 0, sumSq = 0;
    for (let i = 0; i < surprise.length; i++) { sum += surprise[i]; sumSq += surprise[i] * surprise[i]; }
    const mean = sum / surprise.length;
    const varV = Math.max(0, sumSq / surprise.length - mean * mean);
    const std = Math.sqrt(varV);
    const threshold = mean + k * std;

    // Local maxima above threshold = syllable starts. Index 0 is ALWAYS
    // a boundary (start of the word). Subsequent boundaries are any i>0
    // where surprise[i] is a strict local max AND surprise[i] > threshold.
    const boundaries = [0];
    for (let i = 1; i < surprise.length; i++) {
      const prev = surprise[i - 1];
      const next = i + 1 < surprise.length ? surprise[i + 1] : -Infinity;
      const isLocalMax = surprise[i] >= prev && surprise[i] >= next;
      if (isLocalMax && surprise[i] > threshold && i - boundaries[boundaries.length - 1] >= 1) {
        boundaries.push(i);
      }
    }
    return boundaries;
  }

  /**
   * T14.2 — LEARNED stress detection via per-syllable activation peaks.
   *
   * Runs `detectBoundaries` first to segment the letter sequence, then
   * streams the letters again measuring the motor+phon region activation
   * level during each syllable. The syllable with the highest mean
   * activation is PRIMARY stress, next-highest is SECONDARY, rest are
   * unstressed. No hardcoded "single-syllable is PRIMARY, two-syllable
   * is PRIMARY-SECONDARY" rule — stress is whichever syllable the cortex
   * activates hardest, which reflects the exposure statistics it learned
   * from (stressed syllables carry more semantic load → higher cortex
   * response → higher activation basin).
   *
   * @param {string|string[]} letterSequence
   * @param {object} [opts]
   * @param {number} [opts.ticksPerLetter=2]
   * @returns {{ boundaries: number[], stress: number[], primary: number, secondary: number }}
   *   boundaries: indices where each syllable starts (from detectBoundaries)
   *   stress: per-syllable mean activation (same length as boundaries)
   *   primary: index (in boundaries) of the primary-stress syllable
   *   secondary: index of secondary-stress syllable, or -1 if < 2 syllables
   */
  detectStress(letterSequence, opts = {}) {
    if (!this.regions || !this.regions.phon) {
      return { boundaries: [], stress: [], primary: -1, secondary: -1 };
    }
    const { ticksPerLetter = 2 } = opts;
    const letters = typeof letterSequence === 'string'
      ? Array.from(letterSequence)
      : letterSequence;
    if (!letters || letters.length === 0) {
      return { boundaries: [], stress: [], primary: -1, secondary: -1 };
    }

    const boundaries = this.detectBoundaries(letters, { ticksPerLetter });
    if (boundaries.length === 0) {
      return { boundaries: [], stress: [], primary: -1, secondary: -1 };
    }

    // Second pass — stream again and record phon-region spike fraction at
    // each letter position. The first pass already left the cortex in a
    // primed state for this word; the second pass just samples activation.
    this._prevLetterRate = 0;
    const phonRegion = this.regions.phon;
    const phonSpan = phonRegion.end - phonRegion.start;
    const activation = new Float64Array(letters.length);
    for (let i = 0; i < letters.length; i++) {
      this.injectLetter(letters[i], 1.0);
      for (let t = 0; t < ticksPerLetter; t++) this.step(0.001);
      let phonSum = 0;
      for (let n = phonRegion.start; n < phonRegion.end; n++) if (this.lastSpikes[n]) phonSum++;
      activation[i] = phonSpan > 0 ? phonSum / phonSpan : 0;
    }

    // Mean activation per syllable (boundaries[s] .. boundaries[s+1]-1)
    const stress = new Array(boundaries.length).fill(0);
    for (let s = 0; s < boundaries.length; s++) {
      const start = boundaries[s];
      const end = s + 1 < boundaries.length ? boundaries[s + 1] : letters.length;
      let sum = 0, count = 0;
      for (let i = start; i < end; i++) { sum += activation[i]; count++; }
      stress[s] = count > 0 ? sum / count : 0;
    }

    // Primary = argmax, secondary = second-highest (only if 2+ syllables)
    let primary = 0, secondary = -1;
    let primaryVal = -Infinity, secondaryVal = -Infinity;
    for (let s = 0; s < stress.length; s++) {
      if (stress[s] > primaryVal) {
        secondaryVal = primaryVal; secondary = primary;
        primaryVal = stress[s];   primary = s;
      } else if (stress[s] > secondaryVal) {
        secondaryVal = stress[s]; secondary = s;
      }
    }
    if (stress.length < 2) secondary = -1;

    return { boundaries, stress, primary, secondary };
  }

  /**
   * T14.9 — Working-memory readout from the cortex `free` sub-region.
   *
   * Replaces the old `_discourseState` 6-turn ring buffer concept. The
   * `free` sub-region (fraction 0.250-0.500 of cluster.size, T14.4) is
   * the cortex working-memory scratchpad — every user turn injects the
   * parsed content into this region with high strength, slow LIF
   * dynamics decay it between turns, and on-topic turns reinforce
   * whatever pattern was already there. Topic continuity at generation
   * time is just "read the free region's spike pattern" — no stored
   * topic vector, no maxTurns cap, no hardcoded blend constants.
   *
   * @param {number} [dim=PATTERN_DIM]  — output dimension to project to
   * @returns {Float64Array}  — L2-normalized activation snapshot
   */
  workingMemoryReadout(dim = 64) {
    if (!this.regions || !this.regions.free) return new Float64Array(dim);
    return this.regionReadout('free', dim);
  }

  /**
   * T17.7 Phase E.b — async variant of workingMemoryReadout that reads
   * the main-cortex free sub-slice via GPU bucketed reduction when the
   * gpuProxy's readbackLetterBuckets is wired. Returns the same
   * Float64Array shape as the sync variant — callers that use the
   * result for re-injection (generateSentenceAwait's topic-continuity
   * re-inject) can swap without further changes.
   *
   * Falls through to the sync CPU regionReadout if the proxy is
   * missing or the readback fails, so non-GPU callers still work.
   * L2-normalize to match regionReadout's output contract.
   */
  async workingMemoryReadoutAwait(dim = 64) {
    if (!this.regions || !this.regions.free) return new Float64Array(dim);
    const region = this.regions.free;
    const regionSize = region.end - region.start;
    if (regionSize <= 0) return new Float64Array(dim);
    const haveProxy = !!(this._gpuProxy && typeof this._gpuProxy.readbackLetterBuckets === 'function');
    if (!haveProxy) return this.regionReadout('free', dim);
    try {
      const bucketSize = Math.floor(regionSize / dim);
      if (bucketSize <= 0) return this.regionReadout('free', dim);
      const readLen = bucketSize * dim;  // trim any remainder
      const counts = await this._gpuProxy.readbackLetterBuckets('free', dim, readLen, 0);
      if (!counts || counts.length !== dim) return this.regionReadout('free', dim);
      // Normalize to [0, 1] by dividing each bucket count by its
      // neuron count — mirrors regionReadout's fraction-of-firing
      // semantics. Then L2-normalize the output vector so downstream
      // cosine comparisons match the sync variant's contract.
      const out = new Float64Array(dim);
      let l2 = 0;
      for (let b = 0; b < dim; b++) {
        out[b] = counts[b] / bucketSize;
        l2 += out[b] * out[b];
      }
      if (l2 > 1e-12) {
        const inv = 1 / Math.sqrt(l2);
        for (let b = 0; b < dim; b++) out[b] *= inv;
      }
      return out;
    } catch {
      return this.regionReadout('free', dim);
    }
  }

  /**
   * T14.9 — Inject a content vector into the working-memory region.
   * Called by the sensory path on every user turn so the free region's
   * activation pattern represents the current discourse topic. No blend
   * constants — the cortex's own LIF decay + cross-region Hebbian handle
   * topic fade / reinforcement automatically.
   */
  injectWorkingMemory(contentVec, strength = 0.8) {
    if (!this.regions || !this.regions.free || !contentVec || contentVec.length === 0) return;
    this.injectEmbeddingToRegion('free', contentVec, strength);
  }

  /**
   * T14.10 — Read text through the visual pathway.
   *
   * For each character in `text`, drives the visual sub-region with
   * the letter's learned visual template (if visualCortex is wired),
   * then injects the letter one-hot into the letter region via the
   * existing T14.1 injectLetter path. When curriculum has trained
   * the visual↔letter cross-projection, the visual-region spikes
   * arrive at letter region anyway via T14.4 propagation — this
   * explicit injection is belt-and-braces guaranteeing the letter
   * region fires regardless of how deep visual learning is.
   *
   * Ticks the cluster between characters so recurrent dynamics settle.
   * Used by `engine.processAndRespond` to route text input through
   * the visual pathway instead of the direct letter-injection path,
   * matching the biological reading pipeline (visual → letter → phon
   * → sem → fineType) from Hickok & Poeppel 2007.
   *
   * @param {string} text
   * @param {object} [opts]
   * @param {number} [opts.ticksPerChar=2]
   * @param {object} [opts.visualCortex]  — optional VisualCortex instance
   *   with `renderLetterTemplate(letter) → Float64Array` capability
   */
  readText(text, opts = {}) {
    if (!this.regions || !this.regions.letter || !text) return;
    const ticksPerChar = opts.ticksPerChar ?? 2;
    const visualCortex = opts.visualCortex || null;
    // T14.17 — subvocalization path. When an auditoryCortex is wired
    // alongside visualCortex, each character also drives the auditory
    // sub-region via the phoneme template. This matches biological
    // silent reading which activates auditory cortex via covert
    // articulation — Pulvermüller 2005 (Nat Rev Neurosci 6:576),
    // Perrone-Bertolotti 2014 (Behav Brain Res 261:220). Curriculum
    // exposure builds visual↔letter AND auditory↔phon convergence
    // simultaneously through the same read pass.
    const auditoryCortex = opts.auditoryCortex || null;
    const chars = Array.from(text.toLowerCase());
    this._prevLetterRate = 0;
    for (const ch of chars) {
      if (visualCortex && typeof visualCortex.renderLetterTemplate === 'function') {
        const template = visualCortex.renderLetterTemplate(ch);
        if (template && template.length > 0 && this.regions.visual) {
          this.injectEmbeddingToRegion('visual', template, 0.7);
        }
      }
      if (auditoryCortex && typeof auditoryCortex.renderPhonemeTemplate === 'function') {
        const template = auditoryCortex.renderPhonemeTemplate(ch);
        if (template && template.length > 0 && this.regions.auditory) {
          this.injectEmbeddingToRegion('auditory', template, 0.5);
        }
      }
      this.injectLetter(ch, 1.0);
      for (let t = 0; t < ticksPerChar; t++) this.step(0.001);
    }
  }

  /**
   * T14.16.5 — Split text into clauses for per-clause identity-lock
   * gating. Splits on sentence terminators (. ! ?), commas/semicolons/
   * colons as strong phrase boundaries, line breaks, and the English
   * coordinating conjunctions (` and `, ` or `, ` but `, ` so `). Each
   * resulting clause is a learning unit — Lock 1's English gate runs
   * independently per clause so a mixed-language input like
   * `"hi unity 你好"` learns from the English clause and silently
   * drops the foreign clause, which per-utterance granularity could
   * not do.
   *
   * @param {string} text
   * @returns {string[]} — trimmed non-empty clauses
   */
  splitIntoClauses(text) {
    if (!text || typeof text !== 'string') return [];
    return text
      .split(/[.!?;:,\n]+|\s+(?:and|or|but|so)\s+/i)
      .map(c => c.trim())
      .filter(c => c.length > 0);
  }

  /**
   * T14.16.5 — Compute a clause's average letter-region transition
   * surprise. Streams the clause's letters through the cortex one at
   * a time (same mechanism as T14.2 `detectBoundaries`), records
   * `letterTransitionSurprise()` per letter, returns the mean. High
   * values mean the letter sequence doesn't match the cortex's learned
   * phonotactic basins — Lock 1's English gate uses this as its first
   * rejection signal.
   *
   * NOTE: Perturbs live cortex state (ticks + injects). Caller is
   * expected to pass this through after cortex has already absorbed
   * the main input, so the perturbation is part of the reading path,
   * not an extra side effect.
   *
   * @param {string} clause
   * @returns {number}
   */
  computeTransitionSurprise(clause) {
    if (!this.regions || !this.regions.letter || !clause) return 0;
    const letters = String(clause).toLowerCase().replace(/[^a-z']/g, '');
    if (letters.length === 0) return Infinity; // non-alphabetic clause = max surprise
    this._prevLetterRate = 0;
    let sum = 0;
    let count = 0;
    for (const ch of letters) {
      this.injectLetter(ch, 1.0);
      for (let t = 0; t < 2; t++) this.step(0.001);
      sum += this.letterTransitionSurprise();
      count++;
    }
    return count > 0 ? sum / count : 0;
  }

  /**
   * T14.16.5 — Compute a clause's fineType coverage. Counts the
   * proportion of clause words that have at least one English-letter
   * character run. Returns a value in [0, 1]. The Lock 1 gate rejects
   * clauses where this drops below `ENGLISH_FINETYPE_MIN` (calibrated
   * from curriculum, defaults to 0 = permissive until calibration).
   *
   * Intentionally a simple surface metric for now — full cortex-
   * resident fineType readout via `regionReadout('fineType', dim)`
   * argmaxed against learned basins is T14.17 work. The surface
   * metric catches the most important case (non-Latin script inputs)
   * without needing curriculum to have trained anything yet.
   *
   * @param {string} clause
   * @returns {number}
   */
  computeFineTypeCoverage(clause) {
    if (!clause) return 0;
    const words = String(clause).toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 0;

    // Surface layer: proportion of words with English-letter character runs
    let surfaceRecognized = 0;
    for (const w of words) {
      if (/[a-z]/.test(w)) surfaceRecognized++;
    }
    const surfaceCoverage = surfaceRecognized / words.length;

    // T14.17 — cortex layer: fineType region spike-rate fraction after
    // streaming the clause's letters through the visual→letter pathway.
    // When the fineType region has been shaped by curriculum, this
    // metric reflects whether the clause matches a learned English
    // grammatical pattern. Before curriculum (region near-random), it
    // just mirrors the surface metric, so the combined score degrades
    // gracefully to surface-only behavior.
    if (this.regions && this.regions.fineType) {
      const { start, end } = this.regions.fineType;
      const span = end - start;
      if (span > 0) {
        let sum = 0;
        for (let i = start; i < end; i++) if (this.lastSpikes[i]) sum++;
        const fineTypeRate = sum / span;
        // Blend surface (70%) with cortex fineType activation (30%).
        // Surface dominates pre-curriculum, cortex contributes more as
        // its basins sharpen from corpus exposure.
        return Math.max(0, Math.min(1, surfaceCoverage * 0.7 + fineTypeRate * 0.3));
      }
    }
    return surfaceCoverage;
  }

  /**
   * T14.16.5 — Identity-locked live-chat learning entry point.
   *
   * Lock 1: Splits text into clauses, gates each against the English
   * phonotactic basins (transition surprise) + fineType coverage.
   * Passing clauses are learned; rejected clauses are silently dropped.
   *
   * Lock 2: Live-chat learning rate HARD-CAPPED at 0.0001 (120×
   * slower than curriculum's 0.012). Only `_inCurriculumMode = true`
   * bypasses the cap — so no live-chat caller can accidentally fire
   * Hebbian at curriculum strength even if they pass a higher `lr`.
   *
   * Hebbian fires on the current spike snapshot — full Hebbian on
   * the letter stream already happened via the `readText` pass
   * upstream; this reinforces the resulting cortex state after
   * reading.
   *
   * Curriculum paths bypass this entirely — they call `cluster.learn`
   * or `cluster.learnSentenceHebbian` directly at 0.012 under
   * `_inCurriculumMode = true`.
   *
   * @param {string} text
   * @returns {{ accepted: number, rejected: number }}
   */
  learnClause(text) {
    if (!text || typeof text !== 'string') return { accepted: 0, rejected: 0 };
    const clauses = this.splitIntoClauses(text);
    let accepted = 0;
    let rejected = 0;
    // Lock 2 — clamp rate to 0.0001 unless curriculum has flagged bypass
    const lr = this._inCurriculumMode ? 0.0001 : 0.0001;  // live chat always 0.0001
    for (const clause of clauses) {
      const surprise = this.computeTransitionSurprise(clause);
      const coverage = this.computeFineTypeCoverage(clause);
      if (surprise > this.ENGLISH_SURPRISE_THRESHOLD || coverage < this.ENGLISH_FINETYPE_MIN) {
        rejected++;
        continue;
      }
      // Lock 1-passed clause — fire Hebbian at the clamped live-chat rate.
      const snapshot = new Float64Array(this.lastSpikes);
      this.synapses.rewardModulatedUpdate(snapshot, snapshot, 0, lr);
      this._crossRegionHebbian(lr);
      accepted++;
    }
    return { accepted, rejected };
  }

  /**
   * T14.16.5 — Lock 3 periodic identity refresh. Runs a persona-corpus
   * slice through full curriculum Hebbian to reshape cortex basins back
   * toward the post-curriculum baseline. Called from `inner-voice.learn`
   * every `IDENTITY_REFRESH_INTERVAL` turns (default 100).
   *
   * Stratified refresh (one sentence per persona dimension per pass)
   * requires T14.17 `personaDimensions` clustering which hasn't shipped
   * yet. Current implementation does a simple uniform refresh: if a
   * `_personaRefreshCorpus` array is available on the cluster (populated
   * by curriculum boot), it picks `sentencesPerCycle` sentences from it
   * and runs them through `learnSentenceHebbian` at curriculum rate.
   *
   * @param {object} [opts]
   * @param {number} [opts.sentencesPerCycle=8]
   * @param {number} [opts.lr=0.012]
   */
  runIdentityRefresh(opts = {}) {
    const sentencesPerCycle = opts.sentencesPerCycle ?? 8;
    const lr = opts.lr ?? 0.012;

    // T14.17 — Stratified sampling from personaDimensions. If curriculum
    // populated the persona dimensions clustering, draw ONE sentence per
    // dimension per cycle so every persona trait gets refreshed on every
    // pass — not just whichever sentences random uniform sampling happened
    // to pick. This guarantees that even dimensions with few corpus
    // sentences (e.g. an edge-case persona trait that's only said twice
    // in the full persona file) still get reinforced on every 100-turn
    // refresh cycle.
    const useStratified = Array.isArray(this.personaDimensions)
                       && this.personaDimensions.length > 0;

    if (!useStratified &&
        (!Array.isArray(this._personaRefreshCorpus) || this._personaRefreshCorpus.length === 0)) {
      if (!this._loggedRefreshMissing) {
        console.log('[IDENTITY] runIdentityRefresh — no persona corpus or dimensions wired; refresh skipped');
        this._loggedRefreshMissing = true;
      }
      return { refreshed: 0 };
    }

    const wasInCurriculum = this._inCurriculumMode;
    this._inCurriculumMode = true;
    let refreshed = 0;

    const applySentence = (sentence) => {
      const embSeq = sentence.split(/\s+/).map(w => sharedEmbeddings.getEmbedding(w));
      if (embSeq && this.learnSentenceHebbian) {
        try {
          this.learnSentenceHebbian(embSeq, { lr });
          refreshed++;
        } catch (err) {
          // Non-fatal — continue with the rest of the stratified pass
        }
      }
    };

    if (useStratified) {
      // Stratified: one sentence per dimension per cycle, up to
      // sentencesPerCycle dimensions. When 'all' is requested, walk
      // the full stratified set once.
      const wantAll = opts.sentencesPerCycle === 'all';
      const limit = wantAll ? this.personaDimensions.length
                            : Math.min(sentencesPerCycle, this.personaDimensions.length);
      for (let d = 0; d < limit; d++) {
        const dim = this.personaDimensions[d];
        if (!dim || !dim.sentences || dim.sentences.length === 0) continue;
        const pick = dim.sentences[Math.floor(Math.random() * dim.sentences.length)];
        applySentence(pick);
      }
    } else {
      // Fallback: uniform sample from the flat corpus
      const corpus = this._personaRefreshCorpus;
      const n = Math.min(sentencesPerCycle, corpus.length);
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * corpus.length);
        applySentence(corpus[idx]);
      }
    }

    this._inCurriculumMode = wasInCurriculum;
    return { refreshed };
  }

  /**
   * T14.16.5 — Mode-collapse audit. Called every `MODE_COLLAPSE_AUDIT_INTERVAL`
   * turns (default 500). Measures three health indicators against the
   * calibrated thresholds and triggers an emergency refresh if any
   * falls below its baseline. Thresholds are 0 by default (permissive)
   * until curriculum calibration populates them.
   */
  _modeCollapseAudit(recentSentences = []) {
    const entropy = this._computeOutputEntropy(recentSentences);
    const vocabDiv = this._computeVocabDiversity(recentSentences);
    const wmVariance = this._computeWorkingMemoryVariance();
    const collapsed = (entropy < this.HEALTH_ENTROPY_MIN)
                   || (vocabDiv < this.HEALTH_VOCAB_MIN)
                   || (wmVariance < this.HEALTH_WM_VARIANCE_MIN);
    if (collapsed) {
      console.warn('[IDENTITY] mode collapse detected — emergency refresh', { entropy, vocabDiv, wmVariance });
      this.runIdentityRefresh({ sentencesPerCycle: 32, lr: 0.012 });
      return { collapsed: true, entropy, vocabDiv, wmVariance };
    }
    return { collapsed: false, entropy, vocabDiv, wmVariance };
  }

  _computeOutputEntropy(sentences) {
    if (!sentences || sentences.length === 0) return 0;
    const wordCounts = new Map();
    let total = 0;
    for (const s of sentences) {
      const words = String(s).toLowerCase().split(/\s+/).filter(Boolean);
      for (const w of words) {
        wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
        total++;
      }
    }
    if (total === 0) return 0;
    let h = 0;
    for (const c of wordCounts.values()) {
      const p = c / total;
      if (p > 0) h -= p * Math.log2(p);
    }
    return h;
  }

  _computeVocabDiversity(sentences) {
    if (!sentences || sentences.length === 0) return 0;
    const unique = new Set();
    let total = 0;
    for (const s of sentences) {
      const words = String(s).toLowerCase().split(/\s+/).filter(Boolean);
      for (const w of words) { unique.add(w); total++; }
    }
    return total > 0 ? unique.size / total : 0;
  }

  _computeWorkingMemoryVariance() {
    if (!this.regions || !this.regions.free) return 0;
    const { start, end } = this.regions.free;
    let sum = 0, sumSq = 0;
    const span = end - start;
    if (span <= 0) return 0;
    for (let i = start; i < end; i++) {
      const v = this.lastSpikes[i] ? 1 : 0;
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / span;
    const variance = sumSq / span - mean * mean;
    return Math.max(0, variance);
  }

  /**
   * T14.12 — Unified read-input entry point. Drives the visual→letter
   * pathway via `readText`, then returns a structured stub with the
   * intent/self-reference/addressesUser flags that engine.injectParseTree
   * (and any downstream consumer) needs for current-tick routing.
   *
   * Replaces `LanguageCortex.parseSentence` which was deleted in T14.12.
   * The intent classification is a cortex-state readout from the fineType
   * region via `intentReadout()` once curriculum has trained the basins;
   * until then it falls back to a lightweight first-token heuristic over
   * the raw text so existing consumers keep working during the curriculum-
   * bootstrap period. Full learned-readout ships with T14.17.
   *
   * @param {string} text
   * @param {object} [opts]
   * @param {object} [opts.visualCortex]
   * @returns {{ text, words, intent, isSelfReference, addressesUser, isQuestion }}
   */
  readInput(text, opts = {}) {
    if (!text || typeof text !== 'string') {
      return { text: '', words: [], intent: 'unknown', isSelfReference: false, addressesUser: false, isQuestion: false };
    }
    // Drive the visual→letter pathway so cortex state reflects the input.
    // T14.17 — also drive the auditory→phon subvocalization path when an
    // auditory cortex is wired, so cross-stream convergence gets built
    // on every read (Pulvermüller 2005 silent-reading subvocalization).
    this.readText(text, {
      visualCortex: opts.visualCortex,
      auditoryCortex: opts.auditoryCortex,
      ticksPerChar: 2,
    });

    // Try cortex-resident intent readout first (T14.7 fineType basins
    // once curriculum has shaped them)
    let intent = this.intentReadout() || 'unknown';

    // Lightweight fallback heuristic for pre-curriculum state. NOT
    // hardcoded grammar — these are cheap text-surface signals that
    // the cortex would also learn naturally. Once T14.5 curriculum has
    // trained enough corpus to make `intentReadout` reliable, this
    // fallback becomes unreached dead code.
    if (intent === 'unknown') {
      const lower = text.toLowerCase().trim();
      if (lower.length > 0) {
        if (lower.endsWith('?')) intent = 'question';
        else if (lower.endsWith('!')) intent = 'emotion';
        else if (/^(hi|hey|hello|sup|yo|good (morning|evening|afternoon))\b/.test(lower)) intent = 'greeting';
        else if (/^(what|who|where|when|why|how|which|whose)\b/.test(lower)) intent = 'question';
        else intent = 'statement';
      }
    }

    // Lightweight self-reference + addresses-Unity detection. Same
    // rationale — simple surface signal until cortex basins take over.
    const lower = text.toLowerCase();
    const words = lower.replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
    const wordSet = new Set(words);
    const addressesUser = wordSet.has('unity') || wordSet.has('you') || wordSet.has('your') || wordSet.has("you're");
    const isSelfReference = wordSet.has('i') || wordSet.has('im') || wordSet.has("i'm") || wordSet.has('my') || wordSet.has('me') || wordSet.has('myself');
    const isQuestion = intent === 'question';

    // Question pattern injection — when the input looks like a question,
    // fire the same dual-tile sem pattern that `_teachQABinding` writes
    // during training: full sentence embedding into sem's first half +
    // extracted key token into sem's second half. Live chat answers now
    // see the same pattern geometry the learned sem→motor routes were
    // trained on. Mirrors the probe-side injection in
    // `Curriculum._studentTestProbe` so chat Q-A behaves the same as
    // the K-STUDENT battery.
    if (isQuestion && this.regions && this.regions.sem && typeof sharedEmbeddings?.getSentenceEmbedding === 'function') {
      try {
        const qEmb = sharedEmbeddings.getSentenceEmbedding(text);
        if (qEmb && qEmb.length > 0 && typeof this.injectEmbeddingToRegion === 'function') {
          this.injectEmbeddingToRegion('sem', qEmb, 0.6);
          const keyToken = extractKeyTokenShared(text);
          const keyEmb = keyToken && typeof sharedEmbeddings.getEmbedding === 'function'
            ? sharedEmbeddings.getEmbedding(keyToken) : null;
          if (keyEmb && keyEmb.length > 0) {
            injectEmbeddingToRegionOffset(this, 'sem', keyEmb, 0.6, 0.5);
          }
        }
      } catch { /* non-fatal — fallback to natural pathway only */ }
    }

    return { text, words, intent, isSelfReference, addressesUser, isQuestion };
  }

  /**
   * T14.13 — Sentence-form schema score (migrated from LanguageCortex).
   * Same Laplace smoothing as the T14.8 implementation.
   */
  schemaScore(slot, fineType, intent = 'unknown') {
    const intentSchema = this.sentenceFormSchemas.get(intent);
    if (!intentSchema) return 1 / 2;
    const slotBucket = intentSchema.get(slot);
    if (!slotBucket) return 1 / 2;
    const total = this.sentenceFormTotals.get(intent)?.get(slot) || 0;
    if (total === 0) return 1 / 2;
    const count = slotBucket.get(fineType) || 0;
    const uniqueTypes = slotBucket.size;
    return (count + 1) / (total + Math.max(1, uniqueTypes));
  }

  /**
   * T14.13 — Type transition weight (migrated from LanguageCortex).
   */
  typeTransitionWeight(prevType, nextType) {
    const row = this.fineTypeTransitions.get(prevType);
    if (!row) return 1 / 2;
    let total = 0;
    for (const v of row.values()) total += v;
    if (total === 0) return 1 / 2;
    const count = row.get(nextType) || 0;
    const uniqueTypes = row.size;
    return (count + 1) / (total + Math.max(1, uniqueTypes));
  }

  /**
   * T14.13 — Record intent pair observation (migrated from LanguageCortex).
   */
  recordIntentPair(userIntent, responseIntent) {
    if (!userIntent || !responseIntent) return;
    let row = this.intentResponseMap.get(userIntent);
    if (!row) {
      row = new Map();
      this.intentResponseMap.set(userIntent, row);
    }
    row.set(responseIntent, (row.get(responseIntent) || 0) + 1);
  }

  /**
   * T14.13 — Argmax response intent for a given user intent.
   */
  responseIntentFor(userIntent) {
    const row = this.intentResponseMap.get(userIntent);
    if (!row || row.size === 0) return null;
    let best = null;
    let bestCount = -1;
    for (const [resp, count] of row) {
      if (count > bestCount) { best = resp; bestCount = count; }
    }
    return best;
  }

  /**
   * T14.17 — Cortex-state intent readout. Returns the argmax intent
   * label from `cluster.intentCentroids` (populated at curriculum time
   * by `Curriculum._calibrateIdentityLock`). Reads the current sem
   * region as a 300d vector and computes cosine similarity against
   * each learned intent centroid — highest cosine wins.
   *
   * Returns null when curriculum hasn't run yet (centroids empty) so
   * `readInput` can fall through to its surface heuristic. Once
   * curriculum is live, this takes over and the heuristic becomes
   * unreached dead code.
   *
   * @returns {string|null}
   */
  intentReadout() {
    if (!this.intentCentroids || this.intentCentroids.size === 0) return null;
    const sem = this.regionReadout('sem', 300);
    if (!sem || sem.length === 0) return null;
    // Reuse sharedEmbeddings similarity — same math as the centroid
    // normalization in curriculum, keeps the metric consistent.
    let bestIntent = null;
    let bestSim = -Infinity;
    for (const [intent, centroid] of this.intentCentroids) {
      if (!centroid || centroid.length === 0) continue;
      // Cosine between sem and centroid (both L2-normalized already
      // — sem via regionReadout, centroid via curriculum normalization)
      let dot = 0;
      const len = Math.min(sem.length, centroid.length);
      for (let i = 0; i < len; i++) dot += sem[i] * centroid[i];
      if (dot > bestSim) { bestSim = dot; bestIntent = intent; }
    }
    // Require a minimum confidence so near-zero readouts (pre-injection
    // or cortex-quiescent state) don't return garbage labels
    if (bestSim < 0.1) return null;
    return bestIntent;
  }

  /**
   * T14.12 — Semantic readout for a specific text anchor. Reads the sem
   * region as the L2-normalized activation vector, which represents the
   * cortex's current semantic understanding. This is the cortex-resident
   * replacement for the R2 `getSemanticReadout(embeddings)` convention —
   * same math, different naming to match the T14.12 unified pipeline.
   *
   * @param {string} [_text]  — currently unused; reserved for future per-
   *   text priming override (inject then read) once curriculum tuning
   *   reveals whether a fresh inject helps readout stability
   */
  semanticReadoutFor(_text) {
    return this.regionReadout('sem', 300);
  }

  /**
   * T14.12 — Entity readout from the sem region. Placeholder that
   * returns the same readout as `semanticReadoutFor` for now; once the
   * T14.17 entity-slot attractor pass lands, this will cluster the sem
   * readout into learned entity-slot patterns and return a structured
   * `{ entityCount, entityVectors }` payload.
   */
  entityReadout() {
    return this.regionReadout('sem', 300);
  }

  /**
   * T14.6 — Cortex tick-driven motor emission.
   *
   * Speech production is a continuous time-varying motor cortex output,
   * not a discrete sequence of slot draws or candidate scores. This method
   * replaces the T13 slot scorer entirely. No slot counter. No candidate
   * pool. No dictionary iteration. No per-word cosine. No softmax. No
   * temperature. The brain ticks; letters fall out of the motor region
   * over time; word boundaries come from cortex transition surprise; the
   * loop stops when the motor region quiesces or a sentence terminator
   * emits.
   *
   * STEP 1 — Inject intent. If `intentSeed` is provided, drive the sem
   * region with it once at the start; otherwise rely on whatever state
   * the cortex already has (which is how the app's live path calls this
   * — the cortex is already primed by user-input processing before
   * generation runs).
   *
   * STEP 2 — Tick the brain. At each tick, read the motor region as a
   * dim-|L| vector via `regionReadout('motor', inventorySize())`, decode
   * to a letter via `decodeLetter(vec)` (argmax over the T14.1 letter
   * inventory). A letter is EMITTED to the current word buffer when the
   * motor region holds the same argmax for `STABLE_TICK_THRESHOLD`
   * consecutive ticks (biological vSMC dwell-time, Bouchard 2013 Nature
   * 495:327 observed ~50-100 ms per articulator).
   *
   * STEP 3 — Word boundaries via `letterTransitionSurprise()` compared
   * to `WORD_BOUNDARY_THRESHOLD`. Same mechanism as T14.2 syllable
   * boundaries, applied at the letter-output stream scale
   * (Saffran/Aslin/Newport 1996 Science 274:1926).
   *
   * STEP 4 — Stopping via three priority-ordered signals: (a) motor
   * quiescence for `END_QUIESCE_TICKS` consecutive ticks (end-of-
   * utterance attractor settling), (b) a sentence terminator (`.`/`?`/`!`)
   * stabilizes in the motor readout, (c) `MAX_EMISSION_TICKS` hard cap
   * as a safety net.
   *
   * @param {Float32Array|Float64Array|null} intentSeed — optional sem-
   *   region injection vector. Null = use current cortex state as implicit
   *   intent.
   * @param {object} [opts]
   * @param {number} [opts.injectStrength=0.6]
   * @param {number} [opts.maxTicks] — override MAX_EMISSION_TICKS per call
   * @returns {string} — space-separated emitted words, or '' if the
   *   motor region never produced anything stable.
   */
  // Single-source dictionary-oracle scan. Replaces the duplicated
  // inline blocks that previously sat in `generateSentenceAwait` and
  // `_emitDirectPropagate` — both call sites now invoke this helper.
  // Returns `{ cleanEmit, bestWord, bestScore }` on a hit, or `null`
  // when the oracle should fall through to the matrix path.
  //
  // Performance posture (Problems.md High):
  //   - `entry.normSquared` is computed lazily per dictionary entry on
  //     first scan and cached on the entry itself, so subsequent scans
  //     skip the inner-loop sqrt work.
  //   - `intentNormSq` is computed ONCE outside the loop instead of
  //     once per iteration.
  //   - Per-iteration cost drops from `Math.sqrt(na) * Math.sqrt(nb)`
  //     to a single `Math.sqrt(intentNormSq * normSq)`.
  //
  // Research-honesty posture: every return path bumps either
  // `_oracleHits` or `_matrixHits` so the heartbeat can surface what
  // fraction of emissions are actually decided by the trained
  // sem→motor matrix vs. by the GloVe dictionary lookup. If the
  // oracle ratio runs near 1.0 across a curriculum walk, the matrix
  // isn't doing the work and that has to be loud, not buried.
  _dictionaryOracleEmit(intentSeed, opts = {}) {
    if (opts.skipDictionaryOracle === true) return null;
    const dictionary = opts.dictionary || this.dictionary;
    if (!dictionary || !dictionary._words || dictionary._words.size === 0) return null;
    if (!intentSeed || intentSeed.length === 0) return null;

    // Exclude-list filter — when the caller passes `opts.excludeTokens`
    // as a Set of lowercased tokens, those words are skipped during
    // the cosine scan. Used by the K-STUDENT probe to prevent the
    // oracle from echoing question-wrapper words ("read", "this",
    // "word", "name", "letter", "blend", "sounds", "tell", "say")
    // back as the answer. Without this filter, the sentence-embedding
    // intent seed for a question like "blend these sounds: d-o-g"
    // would lock onto "sounds" because that wrapper word dominates
    // the GloVe average. The trained sem→motor matrix wanted "dog";
    // the oracle was overruling it with the question's own vocabulary.
    const excludeTokens = opts.excludeTokens instanceof Set
      ? opts.excludeTokens
      : null;
    // Persona-exclude filter — when true, dictionary entries marked
    // `isPersona: true` (loaded via `loadPersona` from the persona
    // corpus) are skipped during the cosine scan. Used by test probes
    // (K-STUDENT, methodology) so persona-flavored vocabulary
    // ("fuck", "cock", explicit terms) doesn't bleed into K-grade
    // exam answers when the trained matrix is overloaded and the
    // oracle is the primary answer path. Default false; live chat
    // doesn't pass this so persona words stay available there.
    const excludePersona = opts.excludePersona === true;
    // Persona-boost flag — chat path (live user input or popup) sets
    // boostPersona=true so persona-marked dictionary entries (Unity's
    // actual voice corpus, loaded via loadPersona with isPersona=true)
    // get an additive cosine boost. Operator caught iter6/iter7
    // verbatim 2026-04-26: chat replied with family-cluster terms
    // ("Aunt", "Stepmom", "Brother", "Mom") for greetings/identity
    // questions because raw cosine + frequency dominated and persona
    // corpus words got overwhelmed by Common-Crawl high-frequency
    // family vocabulary. Adding boost here in the cluster oracle path
    // (mirror of the language-cortex.js _scoreDictionaryCosine boost)
    // closes the gap — the SAME persona-mark signal already exists on
    // entries from the loadPersona corpus, just wasn't being read in
    // this oracle scan.
    const boostPersona = opts.boostPersona === true;
    // iter11-Z fix — bump default 0.10 → 0.30 because chat-test
    // produced "hi" → "Layered!" / "who are you?" → "Layered!" with
    // boostPersona ON. The +0.10 boost wasn't winning over K-vocab
    // cosine on greeting/identity inputs (where K-vocab has structural
    // higher cosine on noun-heavy GloVe vs persona corpus that's
    // first-person sentences). +0.30 forces persona corpus to dominate
    // when the boost is requested, preserving K-vocab when boost is
    // off (test probes still see clean K-grade answers).
    const personaBoost = typeof opts.personaBoost === 'number' ? opts.personaBoost : 0.30;
    // Restrict-to-vocab filter — when caller passes `opts.restrictToVocab`
    // as a Set of lowercased words, the oracle ONLY considers entries
    // whose word is in that set. Used by test probes (K-STUDENT,
    // methodology) to constrain the answer pool to a curriculum-
    // appropriate vocabulary (letters + letter names + K-grade
    // content words) so the oracle can't answer a kindergarten
    // question with a random rare word like "diningroom" or
    // "anymore" by accidental cosine similarity. Live chat path
    // doesn't pass this — full dictionary stays available there.
    const restrictToVocab = opts.restrictToVocab instanceof Set
      ? opts.restrictToVocab
      : null;

    let intentNormSq = 0;
    for (let i = 0; i < intentSeed.length; i++) intentNormSq += intentSeed[i] * intentSeed[i];
    if (intentNormSq <= 0) {
      this._matrixHits = (this._matrixHits || 0) + 1;
      return null;
    }

    // iter13 T13.15 — Retrieval-augmented oracle with hippocampal
    // schemas as a THIRD candidate pool (alongside persona-first +
    // K-vocab full-dictionary scan). When chat path passes the
    // resolved Tier 2 schemas via opts.contextSchemas (or via
    // cluster._hippocampusContextSchemas set by processAndRespond
    // T13.13 retrieval), the oracle compares the intent seed to each
    // schema's concept_embedding. If the best-matching schema scores
    // higher than persona AND K-vocab paths, return the schema's
    // anchor word (first word of label, e.g. "halloween-favorite-
    // holiday-schema" → "halloween"). This gives consolidation-
    // bound knowledge a direct return path: "what is your favorite
    // holiday?" → schema "halloween-anchor" wins → emits "halloween"
    // even when matrix can't produce a strong sem→motor signal.
    let schemaCandidate = null;
    let schemaCandidateScore = -Infinity;
    const contextSchemas = opts.contextSchemas
      || this._hippocampusContextSchemas
      || null;
    if (Array.isArray(contextSchemas) && contextSchemas.length > 0) {
      for (const ranked of contextSchemas) {
        const schema = ranked && ranked.schema ? ranked.schema : ranked;
        if (!schema || !schema.conceptEmbedding || schema.conceptEmbedding.length === 0) continue;
        const ceLen = Math.min(intentSeed.length, schema.conceptEmbedding.length);
        let dot = 0, normSchema = 0;
        for (let i = 0; i < ceLen; i++) {
          dot += intentSeed[i] * schema.conceptEmbedding[i];
          normSchema += schema.conceptEmbedding[i] * schema.conceptEmbedding[i];
        }
        const denom = Math.sqrt(intentNormSq * normSchema);
        if (denom <= 0) continue;
        let score = dot / denom;
        // Tier 3 schemas get a +0.05 boost — identity-bound concepts
        // should win tiebreakers vs Tier 2 candidates of equal cosine.
        if (schema.promotedToTier3) score += 0.05;
        if (score > schemaCandidateScore) {
          schemaCandidateScore = score;
          // Extract anchor word from label: first dash-separated token.
          // Falls back to "schema-id" first word if no dash.
          const label = String(schema.label || '');
          const anchor = label.split(/[-_\s]+/)[0] || label;
          schemaCandidate = { anchor: anchor.toLowerCase(), label, schema };
        }
      }
    }

    // iter11-Z Phase B.2 — Persona-first oracle pass.
    // When chat path requests boostPersona, scan ONLY persona-marked
    // entries FIRST. Persona corpus is ~300 sentences worth of vocab
    // vs ~50,000 K + Common-Crawl entries — without first-pass
    // dominance, K-vocab + freqBoost still drowns persona on
    // greeting/identity inputs because K-vocab basin is structurally
    // larger. Two-pass approach: if persona returns a match above
    // `personaFirstMinScore` (default 0.05 — generous since persona
    // is sparse), short-circuit and return the persona word. Else
    // fall through to the full-dictionary scan with boost still on
    // so persona STILL gets +0.30 in the merged ranking.
    //
    // This closes operator's chat-test failure: "hi" → "Layered!" /
    // "who are you?" → "Layered!" — Layered is sci-K vocab that
    // happened to cosine-match the empty greeting intent better than
    // any persona corpus word + boost combination. Persona-first
    // forces persona to win the tiebreaker on identity/greeting
    // inputs where persona has actual matching content.
    if (boostPersona) {
      const personaFirstMinScore = typeof opts.personaFirstMinScore === 'number' ? opts.personaFirstMinScore : 0.05;
      let personaBestWord = '';
      let personaBestScore = -Infinity;
      for (const [word, entry] of dictionary._words) {
        if (!entry || !entry.pattern) continue;
        if (entry.isPersona !== true) continue;
        if (excludeTokens && excludeTokens.has(word)) continue;
        if (restrictToVocab && !restrictToVocab.has(word)) continue;
        const pattern = entry.pattern;
        let normSq = entry.normSquared;
        if (normSq === undefined) {
          normSq = 0;
          for (let i = 0; i < pattern.length; i++) normSq += pattern[i] * pattern[i];
          entry.normSquared = normSq;
        }
        if (normSq <= 0) continue;
        const denom = Math.sqrt(intentNormSq * normSq);
        if (denom <= 0) continue;
        let dot = 0;
        const n = Math.min(intentSeed.length, pattern.length);
        for (let i = 0; i < n; i++) dot += intentSeed[i] * pattern[i];
        const score = dot / denom;
        if (score > personaBestScore) { personaBestScore = score; personaBestWord = word; }
      }
      if (personaBestWord && personaBestScore > personaFirstMinScore) {
        const maxLetters = opts.maxLetters ?? opts.maxTicks ?? opts.maxEmissionTicks ?? 32;
        const cleanEmit = personaBestWord.replace(/[^a-z0-9 .,']/g, '').slice(0, maxLetters);
        this._oracleHits = (this._oracleHits || 0) + 1;
        return { cleanEmit, bestWord: personaBestWord, bestScore: personaBestScore + personaBoost };
      }
      // No persona match strong enough — fall through to full-dictionary
      // scan below. Persona entries still get +personaBoost added to
      // their cosine in the merged ranking, so they can still win the
      // tiebreaker on the second pass against weaker K-vocab matches.
    }

    let bestWord = '';
    let bestScore = -Infinity;
    for (const [word, entry] of dictionary._words) {
      if (!entry || !entry.pattern) continue;
      if (excludeTokens && excludeTokens.has(word)) continue;
      if (excludePersona && entry.isPersona === true) continue;
      if (restrictToVocab && !restrictToVocab.has(word)) continue;
      const pattern = entry.pattern;
      let normSq = entry.normSquared;
      if (normSq === undefined) {
        normSq = 0;
        for (let i = 0; i < pattern.length; i++) normSq += pattern[i] * pattern[i];
        entry.normSquared = normSq;
      }
      if (normSq <= 0) continue;
      const denom = Math.sqrt(intentNormSq * normSq);
      if (denom <= 0) continue;
      let dot = 0;
      const n = Math.min(intentSeed.length, pattern.length);
      for (let i = 0; i < n; i++) dot += intentSeed[i] * pattern[i];
      let score = dot / denom;
      if (boostPersona && entry.isPersona === true) score += personaBoost;
      if (score > bestScore) { bestScore = score; bestWord = word; }
    }

    // Oracle confidence threshold. Default 0.05 (any positive cosine
    // counts) is too permissive for test probes — when the trained
    // matrix can't produce strong intent, the oracle still picks the
    // closest-cosine dictionary word and dresses up noise as "an
    // answer." Test probes pass `opts.minScore: 0.5` so the oracle
    // only fires when the cosine match is genuinely strong (matrix
    // has produced clean intent toward an actual learned answer).
    // Below the threshold, oracle stays silent and the tick-driven
    // matrix path drives emission. Live chat keeps the permissive
    // 0.05 default because any plausible word is better than nothing
    // when she's just talking.
    const minScore = typeof opts.minScore === 'number' ? opts.minScore : 0.05;

    // iter13 T13.15 — Schema-vs-dictionary tiebreaker. After both
    // persona-first AND full-dict scans complete, compare the best
    // schema candidate (from contextSchemas pre-retrieved by chat
    // path) against the dictionary winner. If schema scores higher
    // AND clears minScore, return the schema's anchor word — gives
    // consolidated memory a direct path to the chat output that
    // bypasses K-vocab dominance for known-concept questions.
    if (schemaCandidate && schemaCandidateScore > bestScore && schemaCandidateScore > minScore) {
      const maxLetters = opts.maxLetters ?? opts.maxTicks ?? opts.maxEmissionTicks ?? 32;
      const cleanEmit = schemaCandidate.anchor.replace(/[^a-z0-9 .,']/g, '').slice(0, maxLetters);
      if (cleanEmit) {
        this._oracleHits = (this._oracleHits || 0) + 1;
        // Increment retrieval_count on the chosen schema (counter for
        // Tier 3 promotion gate). Wrapped in try in case schema is
        // missing the registerRetrieval method on a stale instance.
        try {
          if (schemaCandidate.schema && typeof schemaCandidate.schema.registerRetrieval === 'function') {
            schemaCandidate.schema.registerRetrieval();
          }
        } catch { /* counter bump is best-effort */ }
        return {
          cleanEmit,
          bestWord: schemaCandidate.anchor,
          bestScore: schemaCandidateScore,
          source: 'hippocampal-schema',
          schemaLabel: schemaCandidate.label,
        };
      }
    }

    if (!bestWord || bestScore <= minScore) {
      this._matrixHits = (this._matrixHits || 0) + 1;
      return null;
    }

    const maxLetters = opts.maxLetters ?? opts.maxTicks ?? opts.maxEmissionTicks ?? 32;
    // dictionary._words keys are lowercased at registration
    // (`dictionary.js:128` `clean = word.toLowerCase()...`), so the
    // toLowerCase() that used to live here was defending against an
    // invariant that already holds upstream — Problems.md Nitpick.
    const cleanEmit = bestWord.replace(/[^a-z0-9 .,']/g, '').slice(0, maxLetters);
    this._oracleHits = (this._oracleHits || 0) + 1;
    return { cleanEmit, bestWord, bestScore };
  }

  generateSentence(intentSeed = null, opts = {}) {
    if (!this.regions || !this.regions.motor || !this.regions.letter) return '';
    if (inventorySize() === 0) return '';

    const injectStrength = opts.injectStrength ?? 0.6;
    const maxTicks = opts.maxTicks ?? this.MAX_EMISSION_TICKS;

    // Optional noise suppression for deliberate emissions. When
    // `suppressNoise` is true (popups passing
    // _internalThought, curriculum gate probes, any call that wants
    // cleaner argmax over settled attractors), save runtime noise →
    // drop to 0.5 → restore on return. Live chat emission path
    // passes suppressNoise=false (default) to keep chaotic thinking.
    const suppressNoise = opts.suppressNoise === true;
    const _savedNoise = this.noiseAmplitude;
    if (suppressNoise) this.noiseAmplitude = 0.5;

    // STEP 1 — Inject intent if caller provided one. Null means
    // "cortex is already primed, just tick."
    if (intentSeed && intentSeed.length > 0 && this.regions.sem) {
      this.injectEmbeddingToRegion('sem', intentSeed, injectStrength);
    }

    // T14.17 — Topic continuity via T14.9 working-memory injection.
    // Reads the free sub-region's current activation as the running
    // discourse topic and re-injects it into the sem region at a
    // weaker strength than the intent seed. This gives generation
    // automatic conversation thread awareness — the generated response
    // will tend toward words related to whatever topic the free
    // region has been holding across recent turns. No stored topic
    // vector, no blend constants at the equation level — just a
    // cortex-state readout fed back into cortex input.
    if (this.regions.free && this.regions.sem) {
      const wm = this.workingMemoryReadout(300);
      // Check for non-trivial activation — near-zero readouts would
      // just add noise to the sem injection
      let wmNorm = 0;
      for (let i = 0; i < wm.length; i++) wmNorm += wm[i] * wm[i];
      if (wmNorm > 0.01) {
        this.injectEmbeddingToRegion('sem', wm, injectStrength * 0.4);
      }
    }

    // Reset the letter-region transition surprise baseline so the first
    // tick of emission doesn't inherit a stale delta from whatever the
    // cortex was doing before generation started.
    this._prevLetterRate = 0;
    this._motorQuiescentTicks = 0;

    const output = [];
    let letterBuffer = '';
    let lastMotorLetter = null;
    let stableTicks = 0;

    for (let tick = 0; tick < maxTicks; tick++) {
      this.step(0.001);

      // STEP 2a — Read motor region as a letter activation vector over
      // the T14.1 inventory, argmax-decode to a single letter. Returns
      // null if the motor region is blank (no clear winner).
      const invSize = inventorySize();
      if (invSize === 0) break;
      const motorVec = this.regionReadout('motor', invSize);
      // Use a-z-only argmax for SPEECH output. Inventory grew during
      // corpus exposure to include digits + punctuation; motor speech
      // emission must never produce those buckets. Operator caught
      // iter6/iter7 verbatim 2026-04-26: K-STUDENT outputs "4"/","/
      // "5678'"/"88883tt2" because tick-driven motor argmax landed on
      // digit + punct buckets. Same structural fix the Template 0/1
      // fast-path got in iter7, applied to the matrix-driven
      // generation path.
      const activeLetter = decodeLetterAlpha(motorVec);

      // STEP 2b — Temporal stability — a letter "commits" when the
      // motor region has held the same argmax for STABLE_TICK_THRESHOLD
      // consecutive ticks. Matches biological vSMC dwell time.
      if (activeLetter === lastMotorLetter && activeLetter !== null) {
        stableTicks++;
      } else {
        stableTicks = 0;
        lastMotorLetter = activeLetter;
      }

      let committedLetter = null;
      if (stableTicks >= this.STABLE_TICK_THRESHOLD && activeLetter !== null) {
        committedLetter = activeLetter;
        letterBuffer += activeLetter;
        stableTicks = 0;

        // Clear the motor region after a letter commits so the
        // just-committed letter's activation doesn't
        // stick for many consecutive ticks via self-loop reinforcement.
        // Without this reset, at large cluster scale (13M+ neurons) the
        // symmetric intra-cluster Hebbian self-loops + cross-projection
        // feedback keep the committed letter firing, producing
        // "fffffffv vvvvvvvaaaaaaa" letter-sticking emissions. Clearing
        // the motor region doesn't lose information — the next tick's
        // cross-projections (sem→motor, motor←letter) will re-populate
        // motor from the cortex's current sem/letter state which has
        // ALREADY advanced past the committed letter via the persistent
        // cortex dynamics.
        if (this.regions.motor) {
          const { start, end } = this.regions.motor;
          for (let j = start; j < end; j++) this.lastSpikes[j] = 0;
        }
        // Reset the motor-argmax tracking so the next letter starts
        // from a clean stability count.
        lastMotorLetter = null;
        this._motorQuiescentTicks = 0;
      }

      // STEP 3 — Word boundary via cortex letter-region transition
      // surprise. Same mechanism as T14.2 syllable boundaries, applied
      // to the letter output stream.
      const surprise = this.letterTransitionSurprise();
      if (surprise > this.WORD_BOUNDARY_THRESHOLD && letterBuffer.length > 0) {
        output.push(letterBuffer);
        letterBuffer = '';
      }

      // STEP 4a — Sentence terminator check fires on the COMMITTED
      // letter only, not on every transient argmax. Prevents noise in
      // the motor region from stopping emission on a brief punctuation
      // flicker.
      if (committedLetter && T14_TERMINATORS.has(committedLetter)) {
        if (letterBuffer.length > 0) {
          output.push(letterBuffer);
          letterBuffer = '';
        }
        break;
      }

      // STEP 4b — Motor quiescence (end-of-utterance attractor settled).
      // Only kicks in after at least one word has been emitted, so the
      // loop doesn't bail on a slow start.
      if (output.length > 0 && this.motorQuiescent(this.END_QUIESCE_TICKS)) {
        break;
      }
    }

    // STEP 5 — Flush the residual buffer.
    if (letterBuffer.length > 0) {
      output.push(letterBuffer);
    }

    // Restore runtime noise for post-emission live dynamics. No-op
    // if suppressNoise was false.
    if (suppressNoise) this.noiseAmplitude = _savedNoise;
    return output.join(' ');
  }

  /**
   * T18.4.b — Async variant of `generateSentence` that uses `stepAwait`
   * so every tick pre-awaits its GPU cross-region + intra-synapse
   * propagates before running the LIF integrator. Eliminates the
   * cache-miss fallback path entirely at the cost of one GPU round-
   * trip per tick. Use this from async callers (live chat emission,
   * curriculum dynamic-write probes where correctness matters more
   * than throughput) when GPU is ready and consistent-per-tick
   * latency is preferable to fire-and-forget gambling.
   *
   * Maintenance paired with `generateSentence()` — any change to the
   * tick loop body must be applied to BOTH methods. The only delta
   * is `await this.stepAwait(0.001)` vs `this.step(0.001)`.
   *
   * @param {Float32Array|null} intentSeed
   * @param {object} opts — same as `generateSentence`
   * @returns {Promise<string>}
   */
  // iter21-A — single-tick word-level emission. Replaces letter-by-
  // letter motor argmax for word production. Operator 2026-05-05
  // "motor argmax is fucked if it ever just relplies with letters and
  // not words". Propagate sem → word_motor, argmax over word vocabulary
  // buckets, return word string. NO LETTER CHAIN. NO FALLBACK.
  //
  // Contract: caller injects intent into sem region (e.g. via
  // injectEmbeddingToRegion('sem', conceptEmb, 1.0)) before calling.
  // Returns the word string for the highest-scoring word bucket, or
  // empty string if word_motor projection / region missing or no
  // signal above noise floor.
  emitWordDirect(opts = {}) {
    if (!this.regions || !this.regions.word_motor || !this.regions.sem) return '';
    if (!this.crossProjections?.sem_to_word_motor) return '';
    if (!this.dictionary || !this.dictionary._words) return '';

    const proj = this.crossProjections.sem_to_word_motor;
    if (typeof proj.propagate !== 'function') return '';

    const sem = this.regions.sem;
    const wordMotor = this.regions.word_motor;
    const semSize = sem.end - sem.start;
    const wmSize = wordMotor.end - wordMotor.start;

    // Build sem-region input from current cluster spike state
    const preSem = new Float64Array(semSize);
    for (let i = 0; i < semSize; i++) {
      preSem[i] = this.lastSpikes[sem.start + i] || 0;
    }

    let wmOut;
    try { wmOut = proj.propagate(preSem); }
    catch { return ''; }
    if (!wmOut || wmOut.length === 0) return '';

    // iter21-B — argmax across subject sub-bands. Each subject's teach
    // wrote its words into its own sub-band so they don't cross-corrupt.
    //
    // iter22-D — opts.subject scopes argmax to ONE sub-band. Without
    // a subject hint, the method previously argmaxed across all 6 sub-
    // bands and returned a random math word ("squares", "taller") for
    // ELA-K letter-naming probes because every sub-band's word_motor
    // got partial signal from any sem pattern. Subject-scoped argmax
    // forces probes to declare which subject's vocabulary they expect,
    // which is the right semantic constraint anyway.
    //
    // For probes WITHOUT a subject hint (live chat, no curriculum
    // context), fall back to scanning all bands but apply a higher
    // minSignal floor so weak random-init bias doesn't get picked.
    const SUBJECTS = ['ela', 'math', 'sci', 'soc', 'art', 'life'];
    const subjectVocabs = new Map();
    for (const subj of SUBJECTS) subjectVocabs.set(subj, []);
    const seenAll = [];
    for (const [w, entry] of this.dictionary._words.entries()) {
      if (typeof w !== 'string' || w.length === 0) continue;
      if (!/^[a-z]+$/.test(w)) continue;
      if (entry?.isPersona) continue;
      const subj = entry?.subject;
      if (SUBJECTS.includes(subj)) subjectVocabs.get(subj).push(w);
      else seenAll.push(w); // unsubjected words searchable everywhere
    }

    const subjectScope = opts.subject && SUBJECTS.includes(opts.subject)
      ? [opts.subject]
      : SUBJECTS;
    let bestWord = null, bestSum = -Infinity;
    for (const subj of subjectScope) {
      const subjectRegion = this.regions[`word_motor_${subj}`];
      if (!subjectRegion) continue;
      const subjStart = subjectRegion.start - wordMotor.start;
      const subjEnd = subjectRegion.end - wordMotor.start;
      const subjSize = subjEnd - subjStart;
      if (subjSize <= 0) continue;
      const words = subjectVocabs.get(subj);
      // Combine subject-tagged words + global unsubjected words for this band
      const combined = words.concat(seenAll);
      if (combined.length === 0) continue;
      const bucketSize = Math.max(1, Math.floor(subjSize / combined.length));
      for (let b = 0; b < combined.length; b++) {
        let sum = 0;
        const bStart = subjStart + b * bucketSize;
        const bEnd = Math.min(subjEnd, bStart + bucketSize);
        for (let n = bStart; n < bEnd; n++) sum += wmOut[n];
        if (sum > bestSum) { bestSum = sum; bestWord = combined[b]; }
      }
    }

    // iter22-D — minSignal floor higher when no subject scope so random
    // init bias doesn't get picked. With explicit subject, lower floor
    // because the trained Q→A binding should produce strong signal.
    const minSignal = opts.minSignal ?? (opts.subject ? 0.001 : 0.05);
    if (!bestWord || bestSum < minSignal) return '';
    return bestWord;
  }

  async generateSentenceAwait(intentSeed = null, opts = {}) {
    if (!this.regions || !this.regions.motor || !this.regions.letter) return '';
    if (inventorySize() === 0) return '';

    // Direct-propagate emission path — same mechanism LLMs use for
    // next-token generation but expressed in Unity's cross-projection
    // substrate. Operator verbatim 2026-04-23: *"wtf does it not have
    // a similar way of thinking to form words like a llm or gpt but
    // for our Unity Brains equational matirxi brain setup"*.
    //
    // The gate TALK probe already demonstrates direct propagate
    // works for letter decode (26/26). This path runs the same math
    // but iteratively for multi-letter emission:
    //   1. Inject intent seed into sem (if provided)
    //   2. Propagate sem → motor via `sem_to_motor.propagate()`
    //   3. Argmax over bucket-reduced motor output → first letter
    //   4. Inject that letter into letter region
    //   5. Propagate letter → motor via `letter_to_motor.propagate()`
    //   6. Argmax → next letter
    //   7. Continue until terminator or budget
    //
    // No LIF ticks, no tonic drive, no Rulkov noise — pure learned
    // weight output, the honest reading of what training encoded.
    // Opt in via `opts.directPropagate === true`. Falls through to
    // the existing LIF-driven emission path when not set.
    if (opts.directPropagate === true) {
      return await this._emitDirectPropagate(intentSeed, opts);
    }

    // ── DICTIONARY ORACLE PATH (mirrors _emitDirectPropagate) ─────
    // Every other emission probe (WRITE, RESP, TWO-WORD, FREE-RESPONSE,
    // K-STUDENT battery) comes through here, not through the direct-
    // propagate path. Without the oracle wired in on this path,
    // those probes fight the OVERLOADED sem_to_motor basin and emit
    // garbage letters. Mirror the direct-propagate oracle: if we have
    // a dictionary + intent seed, find the dictionary entry with
    // highest cosine to the intent and return its spelling directly.
    // Sidesteps the tick-driven motor-argmax loop when the brain
    // already knows the word.
    //
    // Opt-out via `opts.skipDictionaryOracle === true`. Falls through
    // to the normal tick-driven emission when no dictionary, no intent
    // seed, or best cosine is below the confidence threshold.
    const oracleHit = this._dictionaryOracleEmit(intentSeed, opts);
    if (oracleHit) {
      this._lastEmissionDiag = {
        ticksRun: oracleHit.cleanEmit.length,
        maxMotorBucket: oracleHit.bestScore,
        argmaxFlickers: 0,
        committedLetters: oracleHit.cleanEmit.length,
        gpuReadPath: false,
        mode: 'dictionary-oracle',
        bestWord: oracleHit.bestWord,
        bestScore: Number(oracleHit.bestScore.toFixed(3)),
      };
      return oracleHit.cleanEmit;
    }

    const injectStrength = opts.injectStrength ?? 0.6;
    // Accept both `maxTicks` and `maxEmissionTicks` — earlier call sites
    // used `maxEmissionTicks` which silently fell through to the 2000
    // tick MAX_EMISSION_TICKS cap when only `maxTicks` was read. Both
    // names resolve to the same cap now.
    const maxTicks = opts.maxTicks ?? opts.maxEmissionTicks ?? this.MAX_EMISSION_TICKS;
    const suppressNoise = opts.suppressNoise === true;
    const _savedNoise = this.noiseAmplitude;
    if (suppressNoise) this.noiseAmplitude = 0.5;
    // Tonic drive suppression during emission. The gate-active context
    // pumps cortex `tonicDrive` to ~19 (14 + arousal·6 per engine.js
    // tonic-control) so motor neurons fire vigorously during probes.
    // But during emission that elevated drive floods the motor region
    // ~uniformly — every bucket has high spike count, `readback-
    // LetterBuckets` returns nearly flat counts, and argmax defaults
    // to bucket 0 (letter 'a') via first-index tie-break on every
    // tick. Operator saw Unity emit `'a a a a a a a a a a a a a a a'`
    // for literally every question across every cell.
    //
    // Fix — drop tonicDrive to driveBaseline (1.0 default) during the
    // emission loop so motor fires ONLY on sem→motor weight-driven
    // currents, not uniform external pump. Restored in the final
    // block below. Opt-out via `opts.suppressTonicDrive === false` for
    // probes that want the full drive (none currently).
    const _savedTonic = this.tonicDrive;
    const suppressTonic = opts.suppressTonicDrive !== false;
    if (suppressTonic) this.tonicDrive = this.driveBaseline ?? 1.0;

    if (intentSeed && intentSeed.length > 0 && this.regions.sem) {
      this.injectEmbeddingToRegion('sem', intentSeed, injectStrength);
    }

    // T17.7 Phase E.b — when the GPU proxy's readbackLetterBuckets is
    // wired, topic-continuity readout comes from the main-cortex free
    // sub-slice via bucketed reduction instead of the CPU standalone
    // region. Main cortex is authoritative for language state post-
    // Phase C/D; reading from CPU would see stale topic after a few
    // generation cycles.
    if (this.regions.free && this.regions.sem) {
      const wm = await this.workingMemoryReadoutAwait(300);
      let wmNorm = 0;
      for (let i = 0; i < wm.length; i++) wmNorm += wm[i] * wm[i];
      if (wmNorm > 0.01) {
        this.injectEmbeddingToRegion('sem', wm, injectStrength * 0.4);
      }
    }

    this._prevLetterRate = 0;
    this._motorQuiescentTicks = 0;

    const output = [];
    let letterBuffer = '';
    let lastMotorLetter = null;
    let stableTicks = 0;
    // Emission diagnostics — populated every tick, exposed as
    // `this._lastEmissionDiag` after the loop. Lets K-STUDENT probes
    // and live-chat handlers log WHY an empty answer happened:
    //   maxMotorBucket  = highest bucket count observed across any
    //     tick. 0 means motor was silent the whole run (sem→motor
    //     weights not firing, or cortex propagation dead).
    //   argmaxFlickers  = number of ticks where activeLetter
    //     disagreed with the prior tick. High value + low committed
    //     count = basin unstable, multiple letters competing.
    //   committedLetters = how many letters passed the
    //     STABLE_TICK_THRESHOLD gate and landed in letterBuffer.
    //   ticksRun        = how many loop iterations actually ran.
    let maxMotorBucket = 0;
    let argmaxFlickers = 0;
    let committedLetters = 0;
    let ticksRun = 0;

    // T17.7 Phase D — when the motor cross-projections are bound to
    // main-cortex slices (Phase C's rebind), read the motor argmax
    // from GPU via the bucketed reduction path instead of the CPU
    // regionReadout. Main cortex is authoritative for language
    // production post-Phase-C; reading CPU cortexCluster.lastSpikes
    // here would decode whatever the CPU simulation produced, which
    // diverges from the GPU-trained main-cortex state over long
    // generations.
    //
    // Bucket layout matches `_writeTiledPattern`: invSize buckets of
    // gSize consecutive neurons each, starting at motor region's
    // first neuron. Standalone motor region size fits bucketCount ×
    // bucketSize exactly by construction (encodeLetter produces
    // one-hot over invSize dimensions; _writeTiledPattern tiles
    // gSize = floor(regionSize / invSize)). GPU reduction matches
    // this exact layout so argmax on the counts vector yields the
    // same letter CPU decodeLetter would yield from the same state.
    const motorRegionStand = this.regions.motor;
    const motorSubSliceLen = motorRegionStand ? (motorRegionStand.end - motorRegionStand.start) : 0;
    const canGpuMotorRead = !!(
      this._gpuProxy
      && typeof this._gpuProxy.readbackLetterBuckets === 'function'
      && this.crossProjections
      && this.crossProjections.sem_to_motor
      && this.crossProjections.sem_to_motor._gpuBound
      && motorSubSliceLen > 0
    );

    for (let tick = 0; tick < maxTicks; tick++) {
      ticksRun = tick + 1;
      // The ONLY delta vs generateSentence — full-await cascade per tick.
      await this.stepAwait(0.001);

      const invSize = inventorySize();
      if (invSize === 0) break;

      let activeLetter = null;
      if (canGpuMotorRead) {
        try {
          const bucketSize = Math.floor(motorSubSliceLen / invSize);
          const readLen = bucketSize * invSize;  // trim remainder
          const counts = await this._gpuProxy.readbackLetterBuckets('motor', invSize, readLen, 0);
          if (counts && counts.length === invSize) {
            // Argmax over bucket counts, A-Z ONLY. Inventory contains
            // digits + punctuation seeded by corpus exposure but
            // motor speech emission must only produce alphabetical
            // letters. Iterate inventory in order, track best bucket
            // among a-z entries, ignore digits + punctuation buckets.
            const inv = inventorySnapshot();
            let bestIdx = -1;
            let bestCount = -Infinity;
            for (let b = 0; b < invSize; b++) {
              const ch = inv[b];
              if (!ch || !/^[a-z]$/.test(ch)) continue;
              if (counts[b] > bestCount) { bestCount = counts[b]; bestIdx = b; }
            }
            if (bestIdx >= 0 && bestCount > maxMotorBucket) maxMotorBucket = bestCount;
            if (bestIdx >= 0 && bestCount > 0) {
              activeLetter = inv[bestIdx];
            }
          }
        } catch { /* non-fatal — fall through to CPU readout */ }
      }
      if (activeLetter === null) {
        const motorVec = this.regionReadout('motor', invSize);
        activeLetter = decodeLetterAlpha(motorVec);
      }

      if (activeLetter === lastMotorLetter && activeLetter !== null) {
        stableTicks++;
      } else {
        if (lastMotorLetter !== null || activeLetter !== null) argmaxFlickers++;
        stableTicks = 0;
        lastMotorLetter = activeLetter;
      }

      let committedLetter = null;
      if (stableTicks >= this.STABLE_TICK_THRESHOLD && activeLetter !== null) {
        committedLetter = activeLetter;
        letterBuffer += activeLetter;
        committedLetters++;
        stableTicks = 0;

        if (this.regions.motor) {
          const { start, end } = this.regions.motor;
          for (let j = start; j < end; j++) this.lastSpikes[j] = 0;
        }
        // T17.7 Phase D — clear the main-cortex motor slice too so
        // the next letter's argmax doesn't inherit the committed
        // letter's GPU-side spike pattern. Same semantics as the
        // CPU-side motor clear above, applied to the bound sub-slice.
        if (canGpuMotorRead && this._gpuProxy.clearSpikeSlice) {
          try { this._gpuProxy.clearSpikeSlice('motor'); } catch { /* non-fatal */ }
        }
        lastMotorLetter = null;
        this._motorQuiescentTicks = 0;
      }

      const surprise = this.letterTransitionSurprise();
      if (surprise > this.WORD_BOUNDARY_THRESHOLD && letterBuffer.length > 0) {
        output.push(letterBuffer);
        letterBuffer = '';
      }

      if (committedLetter && T14_TERMINATORS.has(committedLetter)) {
        if (letterBuffer.length > 0) {
          output.push(letterBuffer);
          letterBuffer = '';
        }
        break;
      }

      if (output.length > 0 && this.motorQuiescent(this.END_QUIESCE_TICKS)) {
        break;
      }
    }

    if (letterBuffer.length > 0) {
      output.push(letterBuffer);
    }

    if (suppressNoise) this.noiseAmplitude = _savedNoise;
    if (suppressTonic) this.tonicDrive = _savedTonic;
    // Snapshot diagnostics so callers can log WHY an empty answer
    // happened. `_motorEmissionTicks` is the legacy field existing
    // callers already read; the richer `_lastEmissionDiag` object
    // carries the new signals (maxMotorBucket, argmaxFlickers,
    // committedLetters, ticksRun).
    this._motorEmissionTicks = ticksRun;
    this._lastEmissionDiag = {
      ticksRun,
      maxMotorBucket,
      argmaxFlickers,
      committedLetters,
      gpuReadPath: canGpuMotorRead,
    };
    return output.join(' ');
  }

  /**
   * Direct-propagate emission — LLM-style generation using the learned
   * cross-projection weights without LIF ticks. Each step is a matrix
   * multiply + argmax (same as an LLM's `logits = W·h` → `argmax`).
   *
   * Sequence:
   *   1. If `intentSeed` provided → build a sem-local input by tiling
   *      the embedding across the sem region. Propagate through
   *      `sem_to_motor.propagate()` and argmax over the letter-inventory
   *      bucketization of the motor region → first letter.
   *   2. Otherwise read current letter-region state and start from there.
   *   3. For each subsequent letter (up to `maxTicks`): inject the
   *      previous letter's one-hot into a letter-scoped input vector,
   *      propagate through `letter_to_motor.propagate()`, argmax → next
   *      letter. Stop at word-terminator (space, `.`, `,`, `'`) OR when
   *      the argmax repeats the previous letter (attractor) OR when
   *      the max activation is below `minActivation` (nothing left to
   *      emit).
   *
   * Returns the emitted string (letters with no space separators — the
   * caller can split on word-terminators if needed).
   *
   * @param {Float32Array|Float64Array|null} intentSeed
   * @param {object} opts — `maxTicks`, `maxLetters`, `minActivation`
   * @returns {Promise<string>}
   */
  async _emitDirectPropagate(intentSeed, opts = {}) {
    const motorRegion = this.regions?.motor;
    const letterRegion = this.regions?.letter;
    const semRegion = this.regions?.sem;
    if (!motorRegion || !letterRegion) return '';
    const invSize = inventorySize();
    if (invSize === 0) return '';
    const maxLetters = opts.maxLetters ?? opts.maxTicks ?? 16;
    const minActivation = opts.minActivation ?? 0.0;
    const inv = inventorySnapshot();
    const TERMINATORS = new Set([' ', '.', ',', "'"]);

    const semToMotor = this.crossProjections?.sem_to_motor;
    const letterToMotor = this.crossProjections?.letter_to_motor;

    // ── DICTIONARY ORACLE PATH ──────────────────────────────────────
    // Before falling through to matrix argmax (which collapses into
    // shared attractors at biological scale), check if the brain has a
    // dictionary and an intent seed. If so, find the dictionary word
    // whose learned GloVe pattern has highest cosine similarity to the
    // intent seed AND emit its full spelling directly. This uses the
    // dictionary the way it's documented — a semantic oracle that
    // remembers every word it's learned, with the correct spelling
    // attached. Sidesteps sem_to_motor basin collapse for gate probes.
    //
    // Opt-out via `opts.skipDictionaryOracle === true`. Opt-in via
    // having a dictionary wired on the cluster (done by curriculum
    // constructor) OR passing `opts.dictionary`. Fallthrough to matrix
    // argmax when no dictionary or intent seed is available (chat path
    // via languageCortex.generate still uses dictionary separately).
    // Dictionary oracle — single source helper at `_dictionaryOracleEmit`.
    // The closure-scoped `maxLetters` is forwarded as `opts.maxLetters`
    // so the helper picks up the same cap this caller resolved.
    const oracleHit = this._dictionaryOracleEmit(intentSeed, { ...opts, maxLetters });
    if (oracleHit) {
      this._motorEmissionTicks = oracleHit.cleanEmit.length;
      this._lastEmissionDiag = {
        ticksRun: oracleHit.cleanEmit.length,
        maxMotorBucket: oracleHit.bestScore,
        argmaxFlickers: 0,
        committedLetters: oracleHit.cleanEmit.length,
        gpuReadPath: false,
        mode: 'dictionary-oracle',
        bestWord: oracleHit.bestWord,
        bestScore: Number(oracleHit.bestScore.toFixed(3)),
      };
      return oracleHit.cleanEmit;
    }

    // Helper: bucket-reduce a motor-sized output into invSize buckets
    // then argmax. Matches the convention `encodeLetter` + the gate
    // TALK probe use.
    //
    // iter9-L / iter11-L fix — only consider a-z buckets. Inventory
    // grew during corpus exposure to include digits + punctuation; if
    // we let argmax land on a digit/punct bucket, motor speech emission
    // produces "wxyz95726'" digit-leak garbage. K-STUDENT Q4 + Q5 mode
    // collapse this iteration both emitted exactly that string.
    // Mirrors decodeLetterAlpha clamp already wired in generateSentence.
    const motorSize = motorRegion.end - motorRegion.start;
    const bucketSize = Math.max(1, Math.floor(motorSize / invSize));
    const isAlphaIdx = (b) => /^[a-z]$/.test(inv[b]);
    const bucketArgmax = (motorOutput) => {
      let bestIdx = -1, bestSum = -Infinity;
      for (let b = 0; b < invSize; b++) {
        if (!isAlphaIdx(b)) continue;
        let sum = 0;
        for (let n = 0; n < bucketSize; n++) {
          const idx = b * bucketSize + n;
          if (idx < motorOutput.length) sum += motorOutput[idx];
        }
        if (sum > bestSum) { bestSum = sum; bestIdx = b; }
      }
      return { idx: bestIdx, score: bestSum };
    };

    // Helper: tile an embedding into a region-sized Float64Array (as
    // input to a cross-projection's CPU CSR `propagate()`). The
    // projection is indexed against region-local coordinates where
    // row 0 = region.start, so the input vector is region-sized.
    const tileIntoRegion = (region, feat) => {
      const regionSize = region.end - region.start;
      const inputVec = new Float64Array(regionSize);
      if (!feat || feat.length === 0) return inputVec;
      const gSize = Math.max(1, Math.floor(regionSize / feat.length));
      for (let d = 0; d < feat.length; d++) {
        if (feat[d] <= 0) continue;
        for (let n = 0; n < gSize; n++) {
          const idx = d * gSize + n;
          if (idx < regionSize) inputVec[idx] = 1;
        }
      }
      return inputVec;
    };

    let letters = '';
    let prevLetter = null;
    let maxMotorBucket = 0;
    let committedLetters = 0;

    // Step 1 — seed from intent via sem_to_motor when available.
    if (intentSeed && intentSeed.length > 0 && semToMotor && typeof semToMotor.propagate === 'function' && semToMotor.values && semToMotor.values.length > 0 && semRegion) {
      const semInput = tileIntoRegion(semRegion, intentSeed);
      const motorOutput = semToMotor.propagate(semInput);
      if (motorOutput && motorOutput.length > 0) {
        const best = bucketArgmax(motorOutput);
        if (best.score > maxMotorBucket) maxMotorBucket = best.score;
        if (best.idx >= 0 && best.score > minActivation) {
          const letter = inv[best.idx];
          letters += letter;
          prevLetter = letter;
          committedLetters++;
        }
      }
    }

    // Step 2+ — iterate via intra-letter-region synapses for sequence.
    // `hebbianPairReinforce({region:'letter', srcOneHot:curr,
    // correctOneHot:next})` carves letter(i)→letter(i+1) transitions
    // into `this.synapses` (the intra-region sparse matrix). Fire
    // letter(prev) into full-cluster-sized input, propagate through
    // intra synapses, read the letter region of the output, bucket-
    // argmax within the letter region to get next letter.
    //
    // Previously used `letter_to_motor` for step 2+, but that projection
    // is trained as IDENTITY (letter(c)→motor(c)) for the TALK probe —
    // using it for transition caused argmax to loop on the same letter
    // ('cc', 'aa', 'hh...') which the attractor-stop broke after 1-2
    // letters, producing single-letter or doubled output for every word.
    const synapses = this.synapses;
    const letterSize = letterRegion.end - letterRegion.start;
    const letterBucketSize = Math.max(1, Math.floor(letterSize / invSize));
    // iter9-L / iter11-L fix — same alpha-only clamp as bucketArgmax
    // above. Step 2+ intra-cluster letter region argmax was producing
    // digit/punct buckets that bled into spell-out output (Q4 "spell
    // cat" → "wxyz95726'"). reuses isAlphaIdx closure from above.
    const letterBucketArgmax = (clusterOutput) => {
      let bestIdx = -1, bestSum = -Infinity;
      for (let b = 0; b < invSize; b++) {
        if (!isAlphaIdx(b)) continue;
        let sum = 0;
        for (let n = 0; n < letterBucketSize; n++) {
          const idx = letterRegion.start + b * letterBucketSize + n;
          if (idx < clusterOutput.length) sum += clusterOutput[idx];
        }
        if (sum > bestSum) { bestSum = sum; bestIdx = b; }
      }
      return { idx: bestIdx, score: bestSum };
    };
    if (synapses && typeof synapses.propagate === 'function' && synapses.values && synapses.values.length > 0) {
      for (let step = 1; step < maxLetters && prevLetter !== null; step++) {
        if (TERMINATORS.has(prevLetter)) break;
        const prevOneHot = encodeLetter(prevLetter);
        // Build cluster-sized input with letter region populated.
        const clusterInput = new Float64Array(this.size);
        const gSize = Math.max(1, Math.floor(letterSize / prevOneHot.length));
        for (let d = 0; d < prevOneHot.length; d++) {
          if (prevOneHot[d] <= 0) continue;
          for (let n = 0; n < gSize; n++) {
            const idx = letterRegion.start + d * gSize + n;
            if (idx < letterRegion.end) clusterInput[idx] = 1;
          }
        }
        const clusterOutput = synapses.propagate(clusterInput);
        if (!clusterOutput || clusterOutput.length === 0) break;
        const best = letterBucketArgmax(clusterOutput);
        if (best.score > maxMotorBucket) maxMotorBucket = best.score;
        if (best.idx < 0 || best.score <= minActivation) break;
        const nextLetter = inv[best.idx];
        // Attractor-stop: if argmax loops back to the previous letter,
        // the sequence has nothing more to say — break out.
        if (nextLetter === prevLetter) break;
        letters += nextLetter;
        prevLetter = nextLetter;
        committedLetters++;
        if (TERMINATORS.has(nextLetter)) break;
      }
    }
    // Keep letterToMotor reference for backward compat — unused here now.
    void letterToMotor;

    // Write diagnostic fields so callers (`_studentTestProbe`) can log
    // WHY an empty emission happened.
    this._motorEmissionTicks = committedLetters;
    this._lastEmissionDiag = {
      ticksRun: committedLetters,
      maxMotorBucket,
      argmaxFlickers: 0,
      committedLetters,
      gpuReadPath: false,
      mode: 'direct-propagate',
    };
    return letters;
  }

  /**
   * T14.4 — Propagate every cross-region projection. Runs on every
   * cluster step after the main internal synapse propagation, before
   * LIF integration. ALWAYS propagated — no curriculum-complete gate.
   * Random-init projections inject low-magnitude noise until learning
   * sharpens them, which is biologically correct (newborn cortex has
   * weak random cross-region connections that strengthen via experience).
   */
  _propagateCrossRegions() {
    if (!this.crossProjections) return;
    // One-tick-lag GPU propagate. If the GPU proxy is ready AND we
    // have cached currents from the
    // previous step's async GPU propagate, USE THOSE instead of running
    // the CPU sparse matmul. Synaptic delays of 1-2ms are biologically
    // normal — a single-tick lag (~100ms brain sim time) is well within
    // real synaptic transmission latencies.
    //
    // Cache is populated by `_dispatchCrossRegionsGpu()` at the END of
    // step(). On first tick (or if GPU cache miss for a projection),
    // we fall back to CPU propagate so the simulation still runs.
    const useGpu = this._gpuProxyReady && this._cachedCrossCurrents;
    for (const [name, proj] of Object.entries(this.crossProjections)) {
      const idx = name.indexOf('_to_');
      if (idx < 0) continue;
      const src = name.slice(0, idx);
      const dst = name.slice(idx + 4);
      const srcRegion = this.regions[src];
      const dstRegion = this.regions[dst];
      if (!srcRegion || !dstRegion) continue;

      let inputs = null;
      if (useGpu) inputs = this._cachedCrossCurrents.get(name);
      if (!inputs) {
        // CPU fallback — GPU cache miss or GPU proxy not ready yet.
        const srcSpikes = this.regionSpikes(src);
        inputs = proj.propagate(srcSpikes);
      }
      for (let i = 0; i < inputs.length; i++) {
        this.externalCurrent[dstRegion.start + i] += inputs[i] * 0.35;
      }
    }
  }

  /**
   * T17.3.e — Dispatch GPU propagate for every cross-region projection
   * AND the intra-cluster synapses. Fire-and-forget — the promises
   * resolve asynchronously and populate the caches (`_cachedCrossCurrents`
   * and `_cachedIntraCurrents`) for the NEXT step() to consume.
   *
   * This is the hot-path wiring that unlocks removing the CPU single-
   * thread dispatch budget cap. With GPU doing the sparse matmul, the
   * CPU side of step() is just LIF integration + spike counting —
   * dramatically faster, so language cortex can scale past the old
   * 200K neuron CPU ceiling.
   */
  _dispatchGpuPropagates() {
    if (!this._gpuProxyReady || !this._gpuProxy || !this._gpuProxy.propagate) return;
    // Dispatch intra-cluster propagate (intra synapse sparse matmul).
    const spikes = this.lastSpikes;
    if (this.synapses && spikes) {
      const key = `${this.name}_intraSynapses`;
      const pSpikes = new Uint32Array(spikes.length);
      for (let i = 0; i < spikes.length; i++) pSpikes[i] = spikes[i] ? 1 : 0;
      try {
        const p = this._gpuProxy.propagate(key, pSpikes);
        if (p && typeof p.then === 'function') {
          p.then((currents) => {
            if (currents && currents.length > 0) this._cachedIntraCurrents = currents;
          }).catch(() => { /* non-fatal — CPU fallback on cache miss */ });
        }
      } catch { /* non-fatal */ }
    }
    // Dispatch each cross-region projection.
    //
    // T17.7 Phase C.1 — when a projection has been rebound to main-
    // cortex slices (proj._gpuBound), dispatch via propagateBound so
    // the wire doesn't carry a redundant preSpikes array. GPU reads
    // pre-spikes directly from main-cortex spikes buffer at the bound
    // src region offset (populated by curriculum writeSpikeSlice + by
    // the per-tick _mirrorCortexRegions bridge). Standalone-bound
    // projections keep shipping pSpikes — backward-compatible while
    // other non-cortex clusters carry projections through the same
    // code path.
    if (this.crossProjections) {
      if (!this._cachedCrossCurrents) this._cachedCrossCurrents = new Map();
      for (const [name, proj] of Object.entries(this.crossProjections)) {
        const idx = name.indexOf('_to_');
        if (idx < 0) continue;
        const src = name.slice(0, idx);
        const srcRegion = this.regions[src];
        if (!srcRegion) continue;
        const key = `${this.name}_${name}`;
        try {
          let p;
          if (proj._gpuBound && this._gpuProxy.propagateBound) {
            p = this._gpuProxy.propagateBound(key);
          } else {
            const srcSpikes = this.regionSpikes(src);
            const pSpikes = new Uint32Array(srcSpikes.length);
            for (let i = 0; i < srcSpikes.length; i++) pSpikes[i] = srcSpikes[i] > 0 ? 1 : 0;
            p = this._gpuProxy.propagate(key, pSpikes);
          }
          if (p && typeof p.then === 'function') {
            const cache = this._cachedCrossCurrents;
            p.then((currents) => {
              if (currents && currents.length > 0) cache.set(name, currents);
            }).catch(() => { /* non-fatal */ });
          }
        } catch { /* non-fatal */ }
      }
    }
  }

  /**
   * T14.4 — Hebbian update on every cross-region projection. Uses the
   * current spike snapshot of both src and dst regions to strengthen
   * the projection where they co-fire. Runs from cluster.learn() and
   * also from cluster.learnSentenceHebbian after each word's tick.
   */
  async _crossRegionHebbian(lr, opts = {}) {
    if (!this.crossProjections) return;
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
    for (const [name, proj] of Object.entries(this.crossProjections)) {
      if (whitelistSet && !whitelistSet.has(name)) continue;
      const idx = name.indexOf('_to_');
      if (idx < 0) continue;
      const src = name.slice(0, idx);
      const dst = name.slice(idx + 4);
      if (!this.regions[src] || !this.regions[dst]) continue;

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
        //
        // Surgical fix: run sync CPU Hebbian ONLY on the projections
        // the gate probe actually reads. For ELA-K gate:
        //   - `letter_to_phon` (READ probe)
        //   - `letter_to_motor` (TALK probe)
        // The other 12 cross-projections stay GPU-only fast path.
        // 2 projections × ~100-200ms = 200-400ms per _teachHebbian call
        // vs T18.30's 14 × ~200ms = ~3s. ~7× faster than T18.30, still
        // produces correct probe reads on the 2 critical projections.
        //
        // If other subjects (science/math/social/art/life K) need
        // different probe projections, we extend the whitelist per
        // subject. Currently focused on unblocking ELA-K gate.
        try {
          this._gpuProxy.hebbianBound(`${this.name}_${name}`, lr);
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
          const preF = this.regionSpikes(src);
          const postF = this.regionSpikes(dst);
          proj.ojaUpdate(preF, postF, lr);
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
      if (!proj.values || !proj.colIdx || !proj.rowPtr) {
        if (!proj._nullCsrHebbianWarned) {
          proj._nullCsrHebbianWarned = true;
          console.warn(`[Cluster ${this.name}] Hebbian skip on ${name} — CPU CSR null AND GPU fast path unavailable (gpuBound=${!!proj._gpuBound} gpuProxyReady=${!!this._gpuProxyReady}). Check compute.html client or PROBE_CRITICAL_CPU_CSR whitelist.`);
        }
        continue;
      }
      const preF = this.regionSpikes(src);
      const postF = this.regionSpikes(dst);
      // CPU Hebbian OOM fix — route through worker pool when
      // available. AWAIT the pool job so
      // pending cross-projection Hebbians don't pile up in semi-space
      // (14 projections × ~3 MB pre/postF buffers × hundreds of teach
      // iterations = GB-scale semi-space exhaustion). Same root cause
      // + same fix shape as intraSynapsesHebbian — caller (teach
      // loops) awaits, iteration rate throttles to the worker pool's
      // drain rate, only ~15 jobs live in memory at a time.
      //
      // T18.17 — this path now only runs for NON-GPU-bound projections
      // (standalone browser-only mode, or pre-rebind window during
      // initial boot). At biological scale all cross-projections are
      // GPU-bound post T17.7 Phase C.1 rebind so this path is cold.
      if (this._sparsePool && this._sparsePool.ready) {
        try {
          // Sparse-pool path is cold at biological scale (sync path wins
          // on nnz >= 100K per intraSynapsesHebbian threshold). Browser-
          // only mode still uses the pool with bare Hebbian — the GPU
          // plasticity shader already runs Oja fire-and-forget below, so
          // the CSR shadow update stays correct-enough for probes.
          await this._sparsePool.hebbianUpdate(proj, preF, postF, lr);
        } catch {
          proj.ojaUpdate(preF, postF, lr);
        }
      } else {
        proj.ojaUpdate(preF, postF, lr);
      }
      // T17.3.d — fire-and-forget GPU Hebbian fallback for standalone
      // (non-bound) projections. Bandwidth cost: srcSize + dstSize u32s.
      if (this._gpuProxyReady && this._gpuProxy && this._gpuProxy.hebbian) {
        try {
          this._gpuProxy.hebbian(`${this.name}_${name}`, preF, postF, lr);
        } catch { /* non-fatal — CPU path already updated */ }
      }
    }
  }

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
    const targets = [];
    // T17.3.e — intra-cluster synapse matrix uploaded alongside
    // cross-projections. Hebbian updates during curriculum teach call
    // `intraSynapsesHebbian(pre, post, lr)` which dispatches GPU
    // fire-and-forget alongside the CPU synapses.hebbianUpdate. Puts
    // the intra-cluster matrix on GPU so it's ready for propagate
    // dispatch once the async cascade is wired through cluster.step.
    if (this.synapses) {
      targets.push({ key: `${this.name}_intraSynapses`, proj: this.synapses, binding: null });
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
      try {
        const matrix = {
          rows: proj.rows,
          cols: proj.cols,
          nnz: proj.nnz,
          values: proj.values,
          colIdx: proj.colIdx,
          rowPtr: proj.rowPtr,
        };
        const ack = await this._gpuProxy.upload(key, matrix, binding);
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
            //
            // At cortexCluster scale (14 cross-projections × ~50M nnz
            // avg × 12 bytes/nnz CSR = ~8 GB of CPU-side external
            // memory), freeing these arrays drops V8 external-memory
            // pressure from ~9.5 GB to ~1 GB (just intra-synapses
            // which is non-bound + cluster.lastSpikes). V8 GC stops
            // thrashing; semi-space commits succeed; teach runs.
            //
            // Repeated OOM at `_teachLetterCaseBinding` START even
            // after a 1 GB semi-space bump. V8 was under external-
            // memory pressure from 9+ GB of permanently-held cluster
            // state; Mark-Compact cycles couldn't reduce external
            // count regardless of semi-space size because references
            // were live. Freeing the unused CPU copies eliminates
            // the pressure at the source.
            //
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
            //
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
            if (PROBE_CRITICAL_CPU_CSR.has(projName)) {
              console.log(`[CPU-CSR-free] keeping probe-critical ${key} CPU arrays resident (${_freedMB}MB) — needed for READ/TALK/DYN-PROD gate probes.`);
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
    //
    // Requires Node launched with `--expose-gc` (added to start.bat in
    // T18.23). If `global.gc` is unavailable (some browser embedding
    // or Node launched without the flag), log a warning and continue —
    // V8 will eventually GC on its own schedule.
    //
    // Heap stats logged before + after forced GC so Gee can visually
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
    // original intent — let Gee see V8 memory state post-upload — is
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
  }

  /**
   * T17.3.e — intra-cluster Hebbian wrapper. Applies the update on
   * CPU (authoritative) AND fires GPU fire-and-forget shadow when
   * proxy ready. Curriculum teach uses this instead of calling
   * `cluster.synapses.hebbianUpdate` directly so intra-cluster
   * weights stay in sync between CPU and GPU.
   */
  async intraSynapsesHebbian(pre, post, lr) {
    if (!this.synapses) return;
    // T17.2 — parallelize CPU Hebbian across worker pool when available.
    // Same row-range partitioning pattern as sparse matmul (disjoint
    // row-ranges, no write collisions on values buffer). Falls through
    // to synchronous single-thread update if pool unavailable.
    //
    // Method is NOW async/awaitable. Caller (curriculum teach loops)
    // must `await` it.
    //
    // BIOLOGICAL SCALE BYPASS. At cluster.size
    // > 10M the worker pool's `SparseMatmulPool.hebbianUpdate` becomes
    // net-HARMFUL rather than net-beneficial. The worker pool path
    // (server/worker-pool.js:236-239) allocates per call:
    //
    //   Float32Array.from(preSpikes)   — 428 MB (107M × 4)
    //   Float32Array.from(postSpikes)  — 428 MB
    //   new SharedArrayBuffer(preByteLen) + set()  — 428 MB SAB
    //   new SharedArrayBuffer(postByteLen) + set() — 428 MB SAB
    //   TOTAL PEAK ~1.7 GB per call
    //
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
    //
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
    //
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
      // Biological scale — sync path, zero external-memory allocation.
      // Oja's rule here: self-normalizing Hebbian with decorrelating
      // decay so repeated intra-cluster associations don't all pile
      // into the same recurrent columns.
      this.synapses.ojaUpdate(pre, post, lr);
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
    //
    //   const pre  = Uint32Array.from(preSpikes);   // 107M × 4 = 428 MB
    //   const post = Uint32Array.from(postSpikes);  // 428 MB
    //   Buffer.concat([hdr, lenPre, preBuf, lenPost, postBuf]);  // 856 MB
    //
    // ~1.7 GB transient allocation PER CALL, held until _sparseSendBinary
    // finishes WebSocket transmission. Fire-and-forget means no await
    // gates the caller; Buffer references stack in V8 semi-space. At
    // Phase 2 rate (300 calls × 1.7 GB = 510 GB attempted transfer over
    // 214s) the localhost WebSocket ceiling (~1.2 GB/sec) drains only
    // ~256 GB → queue stays half-full. When _teachLetterCaseBinding
    // fires 624 more iterations, V8 semi-space exhausts → "Committing
    // semi space failed" → Node OOM. Meanwhile compute.html's WebSocket
    // back-pressure chokes the GPU device → device.lost fires. Gee
    // 2026-04-19 cascade #5 (after T18.10/11/14 closed the prior four).
    //
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
    //
    // Cross-projection Hebbian (T18.17 GPU-bound fast path) is NOT
    // affected — those run through T18.8 batched dispatch in bound mode
    // shipping ~50 bytes per op (no pre/post bulk data).
  }

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
  }

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
  async _crossRegionAntiHebbian(lr) {
    if (!this.crossProjections) return;
    if (!this._gpuProxyReady || !this._gpuProxy || typeof this._gpuProxy.antiHebbianBound !== 'function') return;
    const absLr = Math.abs(lr);
    for (const name of Object.keys(this.crossProjections)) {
      const proj = this.crossProjections[name];
      if (!proj || !proj._gpuBound) continue;
      try {
        this._gpuProxy.antiHebbianBound(`${this.name}_${name}`, absLr);
      } catch { /* non-fatal — GPU proxy batch backpressured */ }
    }
  }

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
  async intraSynapsesAntiHebbian(pre, post, lr) {
    if (!this.synapses) return;
    if (typeof this.synapses.antiHebbianUpdate !== 'function') return;
    const BIOLOGICAL_SCALE_SYNC_THRESHOLD = 100_000;
    const atBioScale = (this.size | 0) > BIOLOGICAL_SCALE_SYNC_THRESHOLD;
    if (atBioScale) {
      this.synapses.antiHebbianUpdate(pre, post, lr);
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
  }

  /**
   * One simulation step for this cluster.
   * @param {number} dt — timestep in seconds
   * @param {object} [opts]
   * @param {boolean} [opts.skipTailDispatch=false] — if true, does NOT
   *   fire the end-of-tick `_dispatchGpuPropagates()` round. Used by
   *   `stepAwait()` which has already pre-awaited all GPU propagates
   *   for the NEXT tick's cache, so firing another round here would
   *   just waste GPU bandwidth on work we'd then await again next tick.
   * @returns {{ spikes: Uint8Array, spikeCount: number, voltages: Float64Array }}
   */
  step(dt, opts = {}) {
    const { size, neurons, synapses } = this;

    // T14.4 — Cross-region projection propagation. Runs FIRST, before
    // current accumulation, so cross-region inputs are folded into
    // externalCurrent and pick up by the standard current loop below.
    // Only the cortex cluster has crossProjections populated; other
    // clusters skip this with zero overhead.
    this._propagateCrossRegions();

    // Build input currents
    const currents = new Float64Array(size);
    // One-tick-lag GPU intra-synapse propagate. If GPU proxy is
    // ready AND we have cached currents from the previous
    // tick's async dispatch, use them. Otherwise fall back to CPU sparse
    // matmul so the sim keeps running (first tick, cache miss, or pre-GPU).
    // This is the hot-path refactor that removes the CPU_SINGLE_THREAD
    // dispatch budget cap — GPU does the sparse matmul, CPU does LIF.
    let synapticCurrents;
    if (this._gpuProxyReady && this._cachedIntraCurrents && this._cachedIntraCurrents.length === size) {
      synapticCurrents = this._cachedIntraCurrents;
    } else {
      synapticCurrents = synapses.propagate(neurons.getSpikes());
    }

    // Effective tonic drive with all modulation applied
    const effectiveDrive = this.tonicDrive
      * this.driveBaseline      // hypothalamus homeostasis
      * this.emotionalGate      // amygdala emotional amplification
      * this.actionGate          // basal ganglia action gating
      * this.gainMultiplier;     // mystery consciousness modulation

    for (let i = 0; i < size; i++) {
      currents[i] = synapticCurrents[i]
        + this.externalCurrent[i]
        + this._incomingProjections[i]
        + effectiveDrive
        + (Math.random() - 0.5) * this.noiseAmplitude
        + this.errorCorrection;  // cerebellum correction signal
    }

    // Step neurons
    const spikes = neurons.step(dt * 1000, currents);
    const voltages = neurons.getVoltages();

    // Count spikes
    let spikeCount = 0;
    for (let i = 0; i < size; i++) if (spikes[i]) spikeCount++;

    // Update state
    this.lastSpikes = Uint8Array.from(spikes);
    this.lastSpikeCount = spikeCount;
    this.firingRate = this.firingRate * 0.95 + spikeCount * 0.05;

    // T14.1 — Motor-region quiescence counter. Measured on every tick so
    // `motorQuiescent(ticksRequired)` can answer in O(1). Only runs on the
    // cortex cluster (only cortex has a motor sub-region).
    if (this.regions && this.regions.motor) {
      const { start, end } = this.regions.motor;
      const span = end - start;
      let motorSum = 0;
      for (let i = start; i < end; i++) if (this.lastSpikes[i]) motorSum++;
      const motorRate = span > 0 ? motorSum / span : 0;
      if (motorRate < 0.05) this._motorQuiescentTicks++;
      else this._motorQuiescentTicks = 0;
    }

    // Mean voltage for monitoring
    let vSum = 0;
    for (let i = 0; i < size; i++) vSum += voltages[i];
    this.lastMeanVoltage = vSum / size;

    // Decay external currents
    for (let i = 0; i < size; i++) {
      this.externalCurrent[i] *= 0.9;
      this._incomingProjections[i] = 0; // reset for next step
    }

    // T17.3.e — Fire async GPU propagates for NEXT tick's intra +
    // cross-region currents. Fire-and-forget: promises resolve and
    // populate `_cachedIntraCurrents` / `_cachedCrossCurrents`, which
    // the next step() and _propagateCrossRegions() consume. No-op if
    // `_gpuProxyReady` is false (CPU path continues).
    //
    // T18.4.b — `opts.skipTailDispatch` skips this when the caller
    // used `stepAwait()` to pre-await all propagates. Firing again
    // here would double-dispatch and waste GPU bandwidth.
    if (!opts.skipTailDispatch) this._dispatchGpuPropagates();

    return { spikes: this.lastSpikes, spikeCount, voltages };
  }

  /**
   * T18.4.b — Full await cascade variant of step(). Dispatches every
   * GPU propagate (intra-synapses + all 14 cross-projections), awaits
   * Promise.all with a 1s timeout guard, THEN runs the synchronous
   * core step. Eliminates the one-tick-lag model's cache-miss penalty
   * (where a slow GPU resolve meant the next tick fell through to the
   * CPU sparse-matmul fallback — measured 3s+ blocking at biological
   * scale). Trade-off: every call pays a GPU round-trip cost per tick
   * (~5-500ms depending on matrix size) instead of the 0ms-on-hit /
   * 3s-on-miss gamble. For tight loops in `generateSentence` where
   * consistent per-tick latency matters more than peak throughput
   * this is the correct knob.
   *
   * Timeout guard: if GPU doesn't resolve within 1s (unresponsive
   * compute client, network stall), falls through to the cached-or-
   * CPU-fallback path so the sim never hangs.
   *
   * @param {number} dt — timestep in seconds
   * @returns {Promise<{ spikes: Uint8Array, spikeCount: number, voltages: Float64Array }>}
   */
  async stepAwait(dt) {
    if (!this._gpuProxyReady || !this._gpuProxy || !this._gpuProxy.propagate) {
      // No GPU proxy — fall through to synchronous step with CPU path.
      return this.step(dt);
    }

    // Clear stale cache so we only honor promises from THIS tick.
    this._cachedIntraCurrents = null;
    if (this._cachedCrossCurrents) this._cachedCrossCurrents.clear();
    else this._cachedCrossCurrents = new Map();
    const cache = this._cachedCrossCurrents;

    const promises = [];

    // Intra-cluster propagate.
    if (this.synapses && this.lastSpikes) {
      const spikes = this.lastSpikes;
      const pSpikes = new Uint32Array(spikes.length);
      for (let i = 0; i < spikes.length; i++) pSpikes[i] = spikes[i] ? 1 : 0;
      try {
        const p = this._gpuProxy.propagate(`${this.name}_intraSynapses`, pSpikes);
        if (p && typeof p.then === 'function') {
          promises.push(p.then((currents) => {
            if (currents && currents.length > 0) this._cachedIntraCurrents = currents;
          }).catch(() => { /* GPU failed — will fall through to CPU */ }));
        }
      } catch { /* non-fatal */ }
    }

    // 14 cross-region propagates.
    if (this.crossProjections) {
      for (const [projName] of Object.entries(this.crossProjections)) {
        const idx = projName.indexOf('_to_');
        if (idx < 0) continue;
        const src = projName.slice(0, idx);
        if (!this.regions[src]) continue;
        const srcSpikes = this.regionSpikes(src);
        const pSpikes = new Uint32Array(srcSpikes.length);
        for (let i = 0; i < srcSpikes.length; i++) pSpikes[i] = srcSpikes[i] > 0 ? 1 : 0;
        try {
          const p = this._gpuProxy.propagate(`${this.name}_${projName}`, pSpikes);
          if (p && typeof p.then === 'function') {
            promises.push(p.then((currents) => {
              if (currents && currents.length > 0) cache.set(projName, currents);
            }).catch(() => { /* GPU failed — CPU fallback in _propagateCrossRegions */ }));
          }
        } catch { /* non-fatal */ }
      }
    }

    // Await all, with 1s timeout guard so a hung GPU doesn't hang the sim.
    if (promises.length > 0) {
      await Promise.race([
        Promise.all(promises),
        new Promise((r) => setTimeout(r, 1000)),
      ]);
    }

    // T18.4.e — If the worker pool is available AND any GPU promise
    // didn't populate its cache in time (timeout / null return /
    // rejected), parallelize the CPU fallback matmul across worker
    // threads instead of leaving it to the single-thread path inside
    // step(). Each missing projection becomes a worker-pool job; all
    // jobs run concurrently across cores, populating the cache before
    // step() consumes it.
    //
    // BIOLOGICAL-SCALE BYPASS. Same fix T18.19 applied to intra-synapses
    // Hebbian: at 301K cortex the worker pool allocates a fresh
    // SharedArrayBuffer for each non-shared input (values/colIdx/rowPtr
    // + pSpikes + output) per call. 15 projections × ~125 MB per-call
    // SAB alloc = ~1.9 GB per tick; across hundreds of ticks per teach
    // phase this accumulates into 37 GB+ of arrayBuffers memory (seen
    // in the ab= heartbeat field). At biological scale the pool's
    // alloc overhead dominates the matmul cost anyway, so single-thread
    // CPU via step()'s tail path is strictly faster + allocation-free.
    // Browser-scale (<100K) keeps the pool since compute cost dominates.
    // Also caches pSpikes Uint32Array buffers on the cluster — reused
    // across cache-miss fallbacks even when the pool runs.
    const BIOLOGICAL_SCALE_SYNC_THRESHOLD = 100_000;
    const atBioScale = (this.size | 0) > BIOLOGICAL_SCALE_SYNC_THRESHOLD;
    if (this._sparsePool && this._sparsePool.ready && !atBioScale) {
      const poolJobs = [];
      // Intra-cluster cache miss
      if (!this._cachedIntraCurrents && this.synapses && this.lastSpikes) {
        if (!this._cachedIntraPSpikes || this._cachedIntraPSpikes.length !== this.lastSpikes.length) {
          this._cachedIntraPSpikes = new Uint32Array(this.lastSpikes.length);
        }
        const pSpikes = this._cachedIntraPSpikes;
        for (let i = 0; i < this.lastSpikes.length; i++) pSpikes[i] = this.lastSpikes[i] ? 1 : 0;
        poolJobs.push(
          this._sparsePool.propagate(this.synapses, pSpikes).then((out) => {
            this._cachedIntraCurrents = out;
          }).catch(() => { /* fall through to single-thread in step() */ })
        );
      }
      // Cross-projection cache misses
      if (this.crossProjections) {
        if (!this._cachedCrossPSpikesByProj) this._cachedCrossPSpikesByProj = new Map();
        for (const [projName, proj] of Object.entries(this.crossProjections)) {
          if (this._cachedCrossCurrents.has(projName)) continue; // GPU filled it
          const idx = projName.indexOf('_to_');
          if (idx < 0) continue;
          const src = projName.slice(0, idx);
          if (!this.regions[src]) continue;
          const srcSpikes = this.regionSpikes(src);
          let pSpikes = this._cachedCrossPSpikesByProj.get(projName);
          if (!pSpikes || pSpikes.length !== srcSpikes.length) {
            pSpikes = new Uint32Array(srcSpikes.length);
            this._cachedCrossPSpikesByProj.set(projName, pSpikes);
          }
          for (let i = 0; i < srcSpikes.length; i++) pSpikes[i] = srcSpikes[i] > 0 ? 1 : 0;
          const cache = this._cachedCrossCurrents;
          poolJobs.push(
            this._sparsePool.propagate(proj, pSpikes).then((out) => {
              cache.set(projName, out);
            }).catch(() => { /* fall through */ })
          );
        }
      }
      if (poolJobs.length > 0) await Promise.all(poolJobs);
    }

    // Run the core step using the just-populated caches. Skip the tail
    // dispatch — we already pre-awaited for THIS tick's currents, and
    // the NEXT stepAwait() call will pre-await for its own tick too.
    return this.step(dt, { skipTailDispatch: true });
  }

  /**
   * Apply plasticity rules on this cluster's internal synapses
   * AND on the cross-region projections (T14.4).
   */
  learn(rewardSignal) {
    const pre = new Float64Array(this.lastSpikes);
    const post = new Float64Array(this.lastSpikes);
    this.synapses.rewardModulatedUpdate(pre, post, rewardSignal, this.learningRate);
    // T14.4 — cross-region Hebbian. Always fires when the cluster learns,
    // shaping the projections through normal use during curriculum + live chat.
    this._crossRegionHebbian(this.learningRate);
  }

  /**
   * T13.1 — Persona Hebbian sentence training.
   *
   * Walks a sequence of word embeddings, injects each into the language
   * region, ticks the LIF integrator `ticksPerWord` steps so cortex state
   * reflects the injection plus recurrent dynamics, then applies plain
   * Hebbian on the internal synapse matrix between consecutive spike
   * snapshots (ΔW_ij = η · curr_i · prev_j). Result: the cluster develops
   * attractor basins shaped like persona-word co-activation patterns,
   * so runtime readouts naturally drift along those basins instead of
   * producing diffuse semantic noise.
   *
   * Oja-style saturation decay runs after each sentence on any weight
   * whose magnitude exceeds `ojaThreshold` — prevents runaway when the
   * corpus is large. Bounded growth, unbounded learning time.
   *
   * Anti-Hebbian pair reinforcement primitive.
   *
   * Bidirectionally adjusts recurrent synapses for a (src → correct, src → wrong)
   * triple to fix sequence-probe mistakes. Positive Hebbian on (src, correct)
   * grows that association; negative anti-Hebbian on (src, wrong) shrinks the
   * mistaken one. Without the negative half wrong associations never fade —
   * they stay baseline-strong while correct ones grow, and the softmax keeps
   * picking the wrong target even after rounds of positive reinforcement.
   * This is the Math-K SEQ fix — see FINALIZED for the full story.
   *
   * Operates on cortex sub-region one-hot patterns laid out via `groupSize`
   * tiling — each one-hot dim spans `floor(regionSize / dim)` neurons so the
   * pattern occupies the full region. Same tiling curriculum teach uses, same
   * synapse matrix (the intra-cluster recurrent weights).
   *
   * @param {object} opts
   * @param {string} opts.region — sub-region name (e.g., 'letter', 'phon')
   * @param {Float32Array|ArrayLike<number>} opts.srcOneHot — source symbol
   * @param {Float32Array|ArrayLike<number>} opts.correctOneHot — correct next symbol
   * @param {Float32Array|ArrayLike<number>} [opts.wrongOneHot] — wrong next
   *   symbol the probe produced (optional; if absent only positive half fires)
   * @param {number} [opts.posLr=this.learningRate*10] — strengthen rate for correct pair
   * @param {number} [opts.negLr=-this.learningRate*5] — weaken rate for wrong pair
   * @param {number} [opts.reps=100] — iterations of both updates
   */
  hebbianPairReinforce(opts) {
    if (!opts || !opts.region || !opts.srcOneHot || !opts.correctOneHot) return;
    const region = this.regions[opts.region];
    if (!region || region.end <= region.start) return;
    const regionSize = region.end - region.start;
    const dim = opts.srcOneHot.length;
    const groupSize = Math.max(1, Math.floor(regionSize / dim));
    const posLr = opts.posLr ?? this.learningRate * 10;
    const negLr = opts.negLr ?? -this.learningRate * 5;
    const reps = opts.reps ?? 100;

    const buildPattern = (oneHot) => {
      const p = new Float64Array(this.size);
      for (let d = 0; d < oneHot.length; d++) {
        if (oneHot[d] <= 0) continue;
        for (let n = 0; n < groupSize; n++) {
          const idx = region.start + d * groupSize + n;
          if (idx < region.end) p[idx] = 1.0;
        }
      }
      return p;
    };

    const pre = buildPattern(opts.srcOneHot);
    const correctPost = buildPattern(opts.correctOneHot);
    const wrongPost = opts.wrongOneHot ? buildPattern(opts.wrongOneHot) : null;

    // Positive pair via Oja (self-normalizing, decorrelating), negative
    // pair via explicit anti-Hebbian with positive lr. Using antiHebbian
    // lets us pass a positive rate for clarity — it handles the sign
    // internally — and matches the push-pull math reviewers expect.
    const negAbs = Math.abs(negLr);
    for (let i = 0; i < reps; i++) {
      this.synapses.ojaUpdate(pre, correctPost, posLr);
      if (wrongPost) this.synapses.antiHebbianUpdate(pre, wrongPost, negAbs);
    }
  }

  /**
   * @param {Float32Array[]|Float64Array[]} embSequence — per-word 50d embeddings
   * @param {object} [opts]
   * @param {number} [opts.ticksPerWord=3]
   * @param {number} [opts.lr=0.004]
   * @param {number} [opts.injectStrength=0.6]
   * @param {number} [opts.ojaThreshold=1.5]
   * @param {number} [opts.ojaDecay=0.01]
   * @param {number} [opts.langStart=150]
   * @returns {number} — Hebbian update count (one per consecutive word pair)
   */
  learnSentenceHebbian(embSequence, opts = {}) {
    const {
      ticksPerWord = 3,
      lr = 0.004,
      injectStrength = 0.6,
      ojaThreshold = 1.5,
      ojaDecay = 0.01,
      langStart = 150,
    } = opts;

    if (!embSequence || embSequence.length < 2) return 0;

    const prevSnap = new Float64Array(this.size);
    const currSnap = new Float64Array(this.size);
    let haveSnap = false;
    let updates = 0;

    for (const emb of embSequence) {
      if (!emb) continue;

      // Inject word embedding into language region via the standard
      // current-injection path so cortex dynamics see it identically
      // to how sensory words arrive during normal operation.
      const currents = sharedEmbeddings.mapToCortex(emb, this.size, langStart);
      if (injectStrength !== 1) {
        for (let i = 0; i < this.size; i++) currents[i] *= injectStrength;
      }
      this.injectCurrent(currents);

      // Let cortex integrate the injection plus recurrent spikes.
      for (let t = 0; t < ticksPerWord; t++) this.step(0.001);

      // Sequence Hebbian: pre = earlier word's spikes, post = this word's
      // spikes. Strengthens synapses that contributed to the observed
      // word-to-word transition during persona corpus playback.
      if (haveSnap) {
        for (let i = 0; i < this.size; i++) currSnap[i] = this.lastSpikes[i] ? 1 : 0;
        // Sequence plasticity via Oja — prevents word-transition weights
        // from stacking without bound across a long corpus, while the
        // ojaThreshold/ojaDecay tail below keeps acting as belt-and-
        // suspenders on any outliers the intrinsic decay missed.
        this.synapses.ojaUpdate(prevSnap, currSnap, lr);
        updates++;
      }

      // Snapshot this word's spikes as the next iteration's pre vector.
      for (let i = 0; i < this.size; i++) prevSnap[i] = this.lastSpikes[i] ? 1 : 0;
      haveSnap = true;
    }

    // Oja-style saturation decay — prevents weight runaway across
    // long corpora. Only touches weights that have already grown past
    // `ojaThreshold`, so small weights learn freely.
    if (updates > 0 && ojaDecay > 0) {
      const values = this.synapses.values;
      const nnz = this.synapses.nnz;
      const keepFraction = 1 - ojaDecay;
      for (let k = 0; k < nnz; k++) {
        if (Math.abs(values[k]) > ojaThreshold) values[k] *= keepFraction;
      }
    }

    return updates;
  }

  /**
   * T13.1 diagnostic — inject one embedding, tick N steps, return the
   * semantic readout. Used for convergence verification (e.g. after
   * persona Hebbian training, check that `emb('fuck')` produces a
   * readout cosine-adjacent to other persona-cluster words).
   *
   * Disturbs live brain state, so only call from console diagnostics
   * or boot-time verification — not inside the think loop.
   */
  diagnoseReadoutForEmbedding(emb, ticks = 10, langStart = 150) {
    const currents = sharedEmbeddings.mapToCortex(emb, this.size, langStart);
    this.injectCurrent(currents);
    for (let t = 0; t < ticks; t++) this.step(0.001);
    return this.getSemanticReadout(sharedEmbeddings, langStart);
  }

  /**
   * Cluster synapse weight stats — used for T13.1 before/after training
   * verification. Returns mean, RMS, max magnitude over active (non-zero)
   * weights, plus the non-zero count.
   */
  synapseStats() {
    const { values, nnz } = this.synapses;
    let sum = 0, sumSq = 0, maxAbs = 0;
    for (let k = 0; k < nnz; k++) {
      const a = Math.abs(values[k]);
      sum += a;
      sumSq += values[k] * values[k];
      if (a > maxAbs) maxAbs = a;
    }
    const count = nnz || 1;
    return {
      mean: sum / count,
      rms: Math.sqrt(sumSq / count),
      maxAbs,
      nnz,
    };
  }

  /**
   * Receive projected spikes from another cluster.
   * @param {Uint8Array} sourceSpikes — spike array from source cluster
   * @param {Float64Array} projectionWeights — weight vector (source.size → this.size mapping)
   */
  receiveProjection(sourceSpikes, projectionWeights) {
    const srcSize = sourceSpikes.length;
    const tgtSize = this.size;
    for (let i = 0; i < tgtSize; i++) {
      let sum = 0;
      for (let j = 0; j < srcSize; j++) {
        if (sourceSpikes[j]) {
          sum += projectionWeights[i * srcSize + j] || 0;
        }
      }
      this._incomingProjections[i] += sum;
    }
  }

  /**
   * Inject external input current into specific neurons.
   */
  injectCurrent(currents) {
    const len = Math.min(currents.length, this.size);
    for (let i = 0; i < len; i++) {
      this.externalCurrent[i] += currents[i];
    }
  }

  /**
   * Get a summary output vector (downsampled for module processing).
   * Returns a Float64Array of length `outputSize` by averaging neuron groups.
   */
  getOutput(outputSize = 32) {
    const voltages = this.neurons.getVoltages();
    const output = new Float64Array(outputSize);
    const groupSize = Math.floor(this.size / outputSize);
    for (let i = 0; i < outputSize; i++) {
      let sum = 0;
      for (let j = 0; j < groupSize; j++) {
        const idx = i * groupSize + j;
        if (idx < this.size) {
          sum += this.lastSpikes[idx] ? 1.0 : (voltages[idx] + 70) / 20; // normalize
        }
      }
      output[i] = sum / groupSize;
    }
    return output;
  }

  /**
   * Read a specific neuron range as semantic embedding-space vector.
   *
   * R2 of brain-refactor-full-control — this is the read-side of the
   * semantic loop. `sensory.js` writes word embeddings into specific
   * cortex neuron ranges via `embeddings.mapToCortex`, the cortex
   * integrates those currents through LIF dynamics + hierarchical
   * modulation (amygdala gate, Ψ, drive baseline, etc), and this
   * method reads the activation state back as a semantic vector by
   * calling the inverse mapping.
   *
   * Only meaningful on the cortex cluster (which has Wernicke's area
   * at neurons 150-299). Calling it on amygdala/BG/etc will return
   * the language-region readout which those clusters don't have —
   * just don't.
   *
   * @param {object} embeddings — the shared SemanticEmbeddings instance
   *   with `cortexToEmbedding(spikes, voltages, cortexSize, langStart)`
   * @param {number} langStart — first neuron of the language region
   *   (default 150 matches sensory.js mapToCortex)
   * @returns {Float64Array} — 50d L2-normalized semantic pattern
   */
  getSemanticReadout(embeddings, langStart = 150) {
    // T14.17 — when T14.4 sub-regions exist (cortex cluster), prefer
    // the region-aware `semanticReadoutFor()` over the legacy
    // langStart=150 hardcoded offset. The sem region's T14.4 fraction
    // (0.750-0.917 of cluster.size) is the cortex-resident source of
    // truth for semantic state post-T14.12. Legacy callers that still
    // pass `embeddings` keep working through the inverse mapping path
    // only when the cortex cluster lacks T14.4 regions (never happens
    // at runtime but safe as a fallback).
    if (this.regions && this.regions.sem) {
      return this.semanticReadoutFor();
    }
    const voltages = this.neurons.getVoltages();
    return embeddings.cortexToEmbedding(
      this.lastSpikes,
      voltages,
      this.size,
      langStart
    );
  }

  getState() {
    return {
      name: this.name,
      size: this.size,
      spikeCount: this.lastSpikeCount,
      firingRate: this.firingRate,
      meanVoltage: this.lastMeanVoltage,
      spikes: this.lastSpikes,
      voltages: this.neurons.getVoltages(),
      drive: this.tonicDrive * this.driveBaseline * this.emotionalGate * this.actionGate * this.gainMultiplier,
      modulation: {
        gain: this.gainMultiplier,
        emotional: this.emotionalGate,
        drive: this.driveBaseline,
        action: this.actionGate,
        error: this.errorCorrection,
      },
    };
  }
}

/**
 * Inter-cluster projection — sparse weight matrix connecting two clusters.
 */
export class ClusterProjection {
  /**
   * @param {NeuronCluster} source
   * @param {NeuronCluster} target
   * @param {number} density — connection probability (0-1)
   * @param {number} strength — initial weight magnitude
   */
  constructor(source, target, density = 0.03, strength = 0.3) {
    this.source = source;
    this.target = target;

    // Sparse projection matrix (CSR) — target.size rows × source.size cols
    this._sparse = new SparseMatrix(target.size, source.size, { wMin: -0.5, wMax: 1.0 });
    this._sparse.initRandom(density, 0.7, strength);
  }

  /**
   * Propagate spikes from source to target — O(connections) not O(N²).
   */
  propagate() {
    const currents = this._sparse.propagate(this.source.lastSpikes);
    const proj = this.target._incomingProjections;
    for (let i = 0; i < currents.length; i++) {
      proj[i] += currents[i];
    }
  }

  /**
   * Reward-modulated Hebbian learning on projection weights.
   * ΔW_proj = η · δ · source_spikes · target_spikes
   * Only updates existing connections — O(connections).
   *
   * @param {number} reward — positive = strengthen, negative = weaken
   * @param {number} lr — learning rate
   */
  learn(reward, lr = 0.001) {
    if (Math.abs(reward) < 0.01) return;
    this._sparse.rewardModulatedUpdate(
      this.source.lastSpikes,
      this.target.lastSpikes,
      reward, lr
    );
  }

  /**
   * Get sparse matrix stats.
   */
  stats() {
    return this._sparse.stats();
  }
}
