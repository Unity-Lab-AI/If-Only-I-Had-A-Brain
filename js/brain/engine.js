/**
 * engine.js — THE BRAIN. The only brain. Runs everything.
 *
 * ARCHITECTURE:
 *   Sensory input → Neural clusters → Module processing → Motor output
 *   The brain DECIDES. Peripherals EXECUTE. index.html DISPLAYS.
 *
 *   1000 neurons in 7 clusters with 20 inter-cluster projections.
 *   Sensory processor converts raw input to neural currents.
 *   Motor output reads basal ganglia spikes to select actions.
 *   Broca's area (language peripheral) generates text when asked.
 *   Visual cortex processes camera frames through V1→V4→IT pipeline.
 *   Auditory cortex processes mic spectrum continuously.
 *   Memory system stores/recalls episodic memories.
 *
 * No external dependencies. Pure ES modules. 60fps.
 */

import { NeuronCluster, ClusterProjection, CLUSTER_FRACTIONS, clusterSizesFor } from './cluster.js';
import { Cortex, Hippocampus, Amygdala, BasalGanglia, Cerebellum, Hypothalamus } from './modules.js';
import { MysteryModule } from './mystery.js';
import { OscillatorNetwork } from './oscillations.js';
import { loadPersona, getBrainParams } from './persona.js';
import { SensoryProcessor } from './sensory.js';
import { MotorOutput } from './motor.js';
import { MemorySystem } from './memory.js';
import { AuditoryCortex } from './auditory-cortex.js';
import { VisualCortex } from './visual-cortex.js';
import { InnerVoice } from './inner-voice.js';
import { BrainPersistence } from './persistence.js';
import { sharedEmbeddings } from './embeddings.js';
import { ComponentSynth } from './component-synth.js';
import { Curriculum } from './curriculum.js';
import { DrugScheduler, SUBSTANCES as DRUG_SUBSTANCES } from './drug-scheduler.js';
import { detectOffer as detectDrugOffer } from './drug-detector.js';

// ── EventEmitter ────────────────────────────────────────────────────

class EventEmitter {
  constructor() { this._listeners = {}; }
  on(event, fn) { if (!this._listeners[event]) this._listeners[event] = []; this._listeners[event].push(fn); return this; }
  off(event, fn) { const a = this._listeners[event]; if (a) this._listeners[event] = a.filter(f => f !== fn); return this; }
  emit(event, data) { const a = this._listeners[event]; if (a) for (let i = 0; i < a.length; i++) a[i](data); }
}

// ── Constants ────────────────────────────────────────────────────────

// T14.0 — TOTAL_NEURONS is the auto-scaled total. On the client it's the
// minimum-tier value (~6700) which is enough to host all 8 cortex
// sub-regions at meaningful sizes. On the server, brain-server.js
// detectResources picks a much larger value (millions to billions
// depending on the hardware tier from Phase 0 admin config) and the
// cluster sizes scale with it via the fractions below. The previous
// hardcoded 1000 was a 50d-era client-only floor; with 300d embeddings
// and the 8 sub-region cortex layout, we need at least ~6700 to give
// every region a meaningful neuron count even at the smallest tier.
const TOTAL_NEURONS = 6700;
const OSCILLATOR_COUNT = 8;
const MODULE_SIZE = 32;
const STEPS_PER_FRAME = 10;
const DT = 0.001;
const THOUGHT_INTERVAL = 3000;
const COUPLING_BASE = 2.5;
const MEMORY_SALIENCE_THRESHOLD = 0.6;
const RECALL_ERROR_THRESHOLD = 0.4;

// Cluster sizes derived from shared `CLUSTER_FRACTIONS` in
// cluster.js — unified between client and server so both produce
// the same sizes at the same tier. Same fractions hold at any scale
// — TOTAL_NEURONS=6700 (default client)
// gives the sizes below; TOTAL_NEURONS=200_000_000 (datacenter server)
// gives proportionally larger clusters with identical biological
// proportions.
const CLUSTER_SIZES = clusterSizesFor(TOTAL_NEURONS);

// ── UnityBrain ───────────────────────────────────────────────────────

export class UnityBrain extends EventEmitter {
  constructor(personaOverrides = {}) {
    super();

    this.persona = loadPersona(personaOverrides);
    // T15 — drug-scheduler replaces static drugState label. Cluster is
    // wired in after clusters are constructed (few lines below) so the
    // scheduler can gate substance availability by cluster.grades.life.
    this.drugScheduler = new DrugScheduler();
    this.brainParams = getBrainParams(this.persona, this.drugScheduler);
    const arousal = this.brainParams.arousalBaseline || 0.9;

    // ══════════════════════════════════════════════════════════════
    // NEURAL CLUSTERS — 7 dedicated regions
    // ══════════════════════════════════════════════════════════════

    this.clusters = {
      cortex: new NeuronCluster('cortex', CLUSTER_SIZES.cortex, {
        tonicDrive: 14 + arousal * 6, noiseAmplitude: 7,
        connectivity: 0.15, excitatoryRatio: 0.85, learningRate: 0.002,
      }),
      hippocampus: new NeuronCluster('hippocampus', CLUSTER_SIZES.hippocampus, {
        tonicDrive: 12 + arousal * 4, noiseAmplitude: 5,
        connectivity: 0.20, excitatoryRatio: 0.75, learningRate: 0.003,
      }),
      amygdala: new NeuronCluster('amygdala', CLUSTER_SIZES.amygdala, {
        tonicDrive: 15 + arousal * 8, noiseAmplitude: 10,
        connectivity: 0.12, excitatoryRatio: 0.7, learningRate: 0.001,
      }),
      basalGanglia: new NeuronCluster('basalGanglia', CLUSTER_SIZES.basalGanglia, {
        tonicDrive: 10 + arousal * 5, noiseAmplitude: 8,
        connectivity: 0.10, excitatoryRatio: 0.6, learningRate: 0.005,
      }),
      cerebellum: new NeuronCluster('cerebellum', CLUSTER_SIZES.cerebellum, {
        tonicDrive: 12 + arousal * 3, noiseAmplitude: 4,
        connectivity: 0.18, excitatoryRatio: 0.9, learningRate: 0.004,
      }),
      hypothalamus: new NeuronCluster('hypothalamus', CLUSTER_SIZES.hypothalamus, {
        tonicDrive: 16, noiseAmplitude: 3,
        connectivity: 0.25, excitatoryRatio: 0.8, learningRate: 0.0005,
      }),
      mystery: new NeuronCluster('mystery', CLUSTER_SIZES.mystery, {
        tonicDrive: 13 + arousal * 5, noiseAmplitude: 12,
        connectivity: 0.30, excitatoryRatio: 0.7, learningRate: 0.001,
      }),
    };

    // ══════════════════════════════════════════════════════════════
    // INTER-CLUSTER PROJECTIONS — 20 pathways
    // ══════════════════════════════════════════════════════════════

    const c = this.clusters;
    // ══════════════════════════════════════════════════════════════
    // 20 PROJECTION PATHWAYS — mapped from real white matter tracts

    // Density/strength from neuroscience research:
    //   Corticostriatal = STRONGEST (10× cortico-pallidal)
    //   Stria terminalis + ventral amygdalofugal = major amygdala output
    //   Fimbria-fornix = hippocampus → hypothalamus
    //   Perforant path = cortex → hippocampus
    //   Corpus callosum = interhemispheric (mystery)

    // Sources: Herculano-Houzel 2009, Lead-DBS atlas, PMC white matter taxonomy
    // ══════════════════════════════════════════════════════════════
    this.projections = [
      // ── CORTICAL OUTPUT (4 pathways) ──
      new ClusterProjection(c.cortex, c.hippocampus, 0.04, 0.4),      // Perforant path (entorhinal → hippo)
      new ClusterProjection(c.cortex, c.amygdala, 0.03, 0.3),         // Ventral visual stream
      new ClusterProjection(c.cortex, c.basalGanglia, 0.08, 0.5),     // Corticostriatal — STRONGEST projection in brain
      new ClusterProjection(c.cortex, c.cerebellum, 0.05, 0.3),       // Corticopontocerebellar
      // ── HIPPOCAMPAL OUTPUT (3 pathways) ──
      new ClusterProjection(c.hippocampus, c.cortex, 0.04, 0.4),      // Memory consolidation → cortex
      new ClusterProjection(c.hippocampus, c.amygdala, 0.03, 0.3),    // Recall → emotional reactivation
      new ClusterProjection(c.hippocampus, c.hypothalamus, 0.03, 0.3), // Fimbria-fornix → mammillary bodies
      // ── AMYGDALA OUTPUT (4 pathways) ──
      new ClusterProjection(c.amygdala, c.cortex, 0.03, 0.3),         // Emotional modulation of perception
      new ClusterProjection(c.amygdala, c.hippocampus, 0.04, 0.5),    // Emotional memory encoding
      new ClusterProjection(c.amygdala, c.hypothalamus, 0.05, 0.4),   // Stria terminalis — fight-or-flight
      new ClusterProjection(c.amygdala, c.basalGanglia, 0.03, 0.3),   // Ventral amygdalofugal → ventral striatum
      // ── BASAL GANGLIA OUTPUT (2 pathways) ──
      new ClusterProjection(c.basalGanglia, c.cortex, 0.02, 0.2),     // Thalamocortical loop (BG → thalamus → cortex)
      new ClusterProjection(c.basalGanglia, c.cerebellum, 0.02, 0.2), // Subthalamic → cerebellar
      // ── CEREBELLAR OUTPUT (2 pathways) ──
      new ClusterProjection(c.cerebellum, c.cortex, 0.03, 0.2),       // Cerebellothalamocortical
      new ClusterProjection(c.cerebellum, c.basalGanglia, 0.03, 0.2), // Cerebellar → red nucleus → BG
      // ── HYPOTHALAMIC OUTPUT (2 pathways) ──
      new ClusterProjection(c.hypothalamus, c.amygdala, 0.05, 0.4),   // Drive → emotional arousal (bidirectional)
      new ClusterProjection(c.hypothalamus, c.basalGanglia, 0.04, 0.3), // Drive → action motivation
      // ── CONSCIOUSNESS / CORPUS CALLOSUM (3 pathways) ──
      new ClusterProjection(c.mystery, c.cortex, 0.05, 0.3),          // Callosal interhemispheric
      new ClusterProjection(c.mystery, c.amygdala, 0.04, 0.3),        // Commissural emotional binding
      new ClusterProjection(c.mystery, c.hippocampus, 0.03, 0.2),     // Hippocampal commissure
    ];

    // ══════════════════════════════════════════════════════════════
    // EQUATION MODULES — run on downsampled cluster output
    // ══════════════════════════════════════════════════════════════

    this.cortexMod = new Cortex(MODULE_SIZE);
    this.hippocampusMod = new Hippocampus(MODULE_SIZE);
    this.amygdalaMod = new Amygdala(MODULE_SIZE, { arousalBaseline: arousal });
    this.basalGangliaMod = new BasalGanglia(MODULE_SIZE);
    this.cerebellumMod = new Cerebellum(MODULE_SIZE);
    this.hypothalamusMod = new Hypothalamus(5);
    this.mystery = new MysteryModule(this.brainParams.mysteryWeights);
    this.oscillators = new OscillatorNetwork(OSCILLATOR_COUNT);
    this.oscCoupling = new Float64Array(OSCILLATOR_COUNT * OSCILLATOR_COUNT);
    this._initOscCoupling();

    // ══════════════════════════════════════════════════════════════
    // BRAIN SUBSYSTEMS — sensory, motor, memory, visual, auditory
    // ══════════════════════════════════════════════════════════════

    this.sensory = new SensoryProcessor();
    this.motor = new MotorOutput();
    this.memorySystem = new MemorySystem(this.clusters.hippocampus);
    // Wire WM consolidation hook — when an item refreshes past
    // CONSOLIDATION_THRESHOLD, MemorySystem fires this callback to
    // promote the WM trace into a Tier 1 episodic snapshot. The
    // brain-server's wider hippocampal pipeline (iter13-iter20 stack
    // — frequency-merge / decay / Tier 2 schemas / Tier 3 identity)
    // then handles long-term retention. Browser-only mode without a
    // brain-server: callback no-ops via the optional-chain check.
    this.memorySystem.onConsolidate = (item) => {
      try {
        this.memorySystem.storeEpisode({
          clusters: { cortex: { firingRate: 0, spikeCount: 0 } },
          amygdala: { arousal: 0.5, valence: 0 },
          psi: 0,
          time: item.lastRefreshAt || Date.now(),
          trigger: `wm-consolidate:${item.label || 'unlabeled'}`,
        });
      } catch { /* non-fatal */ }
    };
    this.auditoryCortex = new AuditoryCortex();
    this.visualCortex = new VisualCortex();
    this.innerVoice = new InnerVoice();
    // iter23.2 — give inner-voice direct refs so its idle generation
    // can fire emitWordDirect on the cortex cluster + push thoughts
    // into WM (which then fires hippocampal Hebbian + tracks refresh
    // for Tier 1 consolidation). Fallback chain through
    // languageCortex._cluster + dictionary._cluster covers older
    // wiring orders.
    this.innerVoice._cluster = this.clusters.cortex;
    this.innerVoice._memorySystem = this.memorySystem;
    // T14.3 — wire the cortex cluster into the dictionary so learnWord
    // can stream new words' letters through cluster.detectBoundaries +
    // cluster.detectStress on first observation, storing syllable
    // boundaries, primary-stress index, and a cortex spike snapshot
    // alongside the semantic pattern. Existing (pre-wire) words keep
    // their current state until they're observed again.
    this.innerVoice.dictionary.setCluster(this.clusters.cortex);
    // T14.13 — migrate LanguageCortex learned statistics onto the cortex
    // cluster. After this call `innerVoice.languageCortex.{_typeTransitionLearned,
    // _sentenceFormSchemas, _sentenceFormTotals, _intentResponseMap}` all
    // point at `this.clusters.cortex.{fineTypeTransitions, sentenceForm
    // Schemas, sentenceFormTotals, intentResponseMap}` by identity.
    if (typeof this.innerVoice.languageCortex?.setCluster === 'function') {
      this.innerVoice.languageCortex.setCluster(this.clusters.cortex);
    }
    // T14.5 — construct the continuous-developmental-learning curriculum
    // runner and wire it into innerVoice so every live chat turn routes
    // through the same inject+tick+Hebbian path the boot corpus walk uses.
    // `curriculum.runFromCorpora(corpora)` is the boot entry point called
    // from `app.js loadPersonaSelfImage` once the persona/baseline/coding
    // corpora have been fetched. `curriculum.learnFromTurn(text)` is the
    // live-chat entry point fired from `innerVoice.learn`.
    this.curriculum = new Curriculum(
      this.clusters.cortex,
      this.innerVoice.dictionary,
      this.innerVoice.languageCortex,
    );
    this.innerVoice.setCurriculum(this.curriculum);
    // T15 — wire cluster into drug scheduler so grade-gate resolves
    // substance availability against cluster.grades.life. Pre-Life-G7
    // Unity ingest attempts return {accepted:false, reason:'grade_locked'}.
    this.drugScheduler.setCluster(this.clusters.cortex);
    // Refresh brainParams now that the scheduler has a cluster reference.
    this.brainParams = getBrainParams(this.persona, this.drugScheduler);

    // T15-C6 — drug-context detection from vision describer output.
    // When the scene describer reports rolled paper on fire, white
    // powder lines, pill shapes, shot glasses, bongs — it emits through
    // the existing onDescribe pipeline. We subscribe here, run the
    // text-offer detector over the description, and — if a substance is
    // spotted — emit a `visualDrugCue` event that biases the
    // self-initiation probe on the next tick. Vision alone never
    // triggers ingestion; it only sets context for decision logic.
    if (this.visualCortex && typeof this.visualCortex.onDescribe === 'function') {
      this.visualCortex.onDescribe(desc => {
        if (!desc || typeof desc !== 'string') return;
        const cue = detectDrugOffer(desc);
        if (cue && cue.substance) {
          this._lastVisualDrugCue = { ...cue, at: Date.now() };
          this.emit('visualDrugCue', this._lastVisualDrugCue);
        }
        // Experience-driven definition binding. Vision
        // describer text becomes EQUATIONAL grounding: each content
        // token's GloVe embedding gets Hebbian-bound into sem region
        // alongside the current visual region snapshot. Words become
        // grounded in actual sensory experience instead of just
        // dictionary text. Real grounding > culturally inherited.
        try {
          if (this.cluster && typeof this.cluster.injectEmbeddingToRegion === 'function'
              && this.cluster.regions?.sem
              && typeof globalThis.__sharedEmbeddings === 'object') {
            const sharedEmb = globalThis.__sharedEmbeddings;
            const STOP = new Set(['a','an','the','and','or','but','of','to','for','in','on','at','by','with','as','is','are','was','were','be','been','being','it','this','that','these','those','its']);
            const tokens = desc.toLowerCase().match(/[a-z]+/g) || [];
            const content = [];
            const seen = new Set();
            // Token cap bumped 6 → 16 so rich image descriptions
            // (real captions hit 15-30 tokens) aren't truncated to a
            // sparse skeleton. Per-token strength curve adjusted to
            // keep total injection bounded — 0.30 → 0.05 over 16
            // tokens (was 0.30 → 0.06 over 6). Sum-of-strengths stays
            // similar (~2.4 vs ~1.0) so cortex doesn't get blasted.
            for (const t of tokens) {
              if (t.length < 3 || STOP.has(t) || seen.has(t)) continue;
              seen.add(t);
              content.push(t);
              if (content.length >= 16) break;
            }
            for (let i = 0; i < content.length; i++) {
              const emb = sharedEmb.getEmbedding ? sharedEmb.getEmbedding(content[i]) : null;
              if (emb && emb.length > 0) {
                const strength = Math.max(0.05, 0.30 - i * 0.0167);
                this.cluster.injectEmbeddingToRegion('sem', emb, strength);
              }
            }
          }
        } catch { /* non-fatal — vision-grounding is best-effort */ }
      });
    }
    // R6.2 — equational component synthesizer. Loads templates from
    // docs/component-templates.txt (same corpus-loading pattern as
    // persona / baseline / coding). `loadTemplates` gets called from
    // app.js boot alongside the other corpus loaders.
    this.componentSynth = new ComponentSynth();

    // ══════════════════════════════════════════════════════════════
    // STATE
    // ══════════════════════════════════════════════════════════════

    this.time = 0;
    this.reward = 0;
    this.frameCount = 0;
    this.running = false;
    this._rafId = null;
    this.lastThoughtTime = 0;
    this.lastAction = 'idle';

    this.state = {
      spikes: null, voltages: null, spikeCount: 0,
      clusters: {}, cortex: null, hippocampus: null,
      amygdala: null, basalGanglia: null, cerebellum: null,
      hypothalamus: null, mystery: null, oscillations: null,
      psi: 0, time: 0, reward: 0,
      drugState: this._drugStateLabel(),         // T15 — compact string for legacy consumers
      drugSnapshot: this.drugScheduler.snapshot(), // T15 — rich snapshot for new consumers
      totalNeurons: TOTAL_NEURONS,
      motor: null, memory: null, sensory: null,
      visualCortex: null, auditoryCortex: null,
    };
  }

  /**
   * T15 — compact single-string label derived from the scheduler snapshot.
   * Returns 'sober' when no substances are active. Otherwise joins the
   * display names of active substances with ' + ', e.g. 'weed', 'weed + coke',
   * 'weed + coke + molly'. Used for legacy UI consumers that expect a string;
   * new consumers should read `state.drugSnapshot` directly.
   */
  _drugStateLabel() {
    if (!this.drugScheduler) return 'sober';
    const active = this.drugScheduler.activeSubstances();
    if (active.length === 0) return 'sober';
    return active
      .map(a => DRUG_SUBSTANCES[a.substance]?.displayName || a.substance)
      .join(' + ');
  }

  /**
   * Load saved brain state from persistence.
   * Called after construction, before start().
   */
  loadSavedState() {
    return BrainPersistence.load(this);
  }

  /**
   * T13.1 — Train the cortex cluster's recurrent synapse matrix from the
   * persona text via sequence Hebbian. Delegates through InnerVoice →
   * LanguageCortex → cortexCluster.learnSentenceHebbian. Call once
   * during boot AFTER `innerVoice.loadPersona(text)` so the dictionary
   * already has the persona vocabulary available.
   *
   * After this runs, the cortex has attractor basins shaped like
   * Unity-voice word co-activation patterns — runtime readouts drift
   * toward persona-adjacent concepts instead of producing diffuse
   * semantic noise.
   */
  trainPersonaHebbian(text, opts = {}) {
    return this.innerVoice.trainPersonaHebbian(this.clusters.cortex, text, opts);
  }

  /**
   * T13.2 — Parse the incoming user text and inject structured pieces
   * into the brain's multiple clusters so cortex state reflects WHAT
   * was asked, HOW it should be answered, and WHO it was about — before
   * any emission starts. Replaces the cold `_contextVector` bag-of-words
   * with real multi-cluster injection that mirrors how `SensoryProcessor`
   * already routes sensory modalities to different clusters.
   *
   * Routing (regions = clusters per the T13.0 research pass):
   *   content → cortex language region (neurons 150-299)
   *   intent  → basal ganglia (action-channel priming)
   *   self-ref → hippocampus (self-model recall trigger)
   *
   * Mood + drive modulation are left to the existing amygdala / hypo-
   * thalamus pathways that already consume sensory currents — T13.2
   * first pass does not override them.
   *
   * Returns the parsed tree so callers (processAndRespond) can reuse
   * it without re-parsing.
   */
  /**
   * T14.17 — Diagnostic accessor for a word's T14.3 cortex-routed
   * phonological state. Exposes `dictionary.syllablesFor(word)` +
   * `dictionary.snapshotFor(word)` in a single shape so `/think` debug
   * commands and `brain-3d.js` commentary have a canonical way to
   * inspect what the cortex learned about a specific word. Returns
   * null when the word is unknown or was stored without cluster
   * wiring. No runtime path calls this at generation time — it's a
   * read accessor, not a cognition path.
   */
  wordState(word) {
    const dict = this.innerVoice?.dictionary;
    if (!dict) return null;
    const syllables = typeof dict.syllablesFor === 'function' ? dict.syllablesFor(word) : null;
    const snapshot = typeof dict.snapshotFor === 'function' ? dict.snapshotFor(word) : null;
    return { word, syllables, snapshot };
  }

  /**
   * T14.17 — Diagnostic readout of cortex-resident language learning
   * statistics. Exposes `cluster.schemaScore` + `cluster.typeTransition
   * Weight` + `cluster.responseIntentFor` + `cluster.intentReadout` in
   * one shape for `/think` debug commands and brain-3d commentary to
   * inspect the current learned state. None of these methods run on
   * the generation hot path (T14.6 motor emission is direct, no schema
   * consult) — they're pure read accessors that tell you what the
   * cortex has learned about grammar/intent/transitions so far.
   *
   * @param {string} [probeWord]  — optional word to classify + score
   * @returns {object}
   */
  cortexStats(probeWord = null) {
    const cortex = this.clusters?.cortex;
    if (!cortex) return null;
    const out = {
      intentCentroids: cortex.intentCentroids?.size || 0,
      personaDimensions: cortex.personaDimensions?.length || 0,
      refreshCorpusSize: cortex._personaRefreshCorpus?.length || 0,
      identityThresholds: {
        surprise: cortex.ENGLISH_SURPRISE_THRESHOLD,
        coverage: cortex.ENGLISH_FINETYPE_MIN,
        healthEntropy: cortex.HEALTH_ENTROPY_MIN,
        healthVocab: cortex.HEALTH_VOCAB_MIN,
        healthWmVariance: cortex.HEALTH_WM_VARIANCE_MIN,
      },
      liveIntent: cortex.intentReadout ? cortex.intentReadout() : null,
    };
    if (probeWord && cortex.schemaScore && cortex.typeTransitionWeight) {
      const lc = this.innerVoice?.languageCortex;
      const fineType = lc && typeof lc._fineType === 'function' ? lc._fineType(probeWord) : 'OTHER';
      out.probe = {
        word: probeWord,
        fineType,
        schemaScoreAtSlot0: cortex.schemaScore(0, fineType, out.liveIntent || 'statement'),
        transitionFromStart: cortex.typeTransitionWeight('START', fineType),
      };
      if (typeof cortex.responseIntentFor === 'function' && out.liveIntent) {
        out.probe.responseIntentSuggestion = cortex.responseIntentFor(out.liveIntent);
      }
    }
    return out;
  }

  injectParseTree(text) {
    if (!text) return null;
    const cortex = this.clusters.cortex;
    if (!cortex) return null;

    // T14.12 (2026-04-14) — parseSentence deleted. Input routing now
    // flows through cluster.readInput which drives the visual→letter
    // pathway (T14.10) + returns a cortex-derived stub with intent and
    // self-reference flags. Until T14.5 curriculum has shaped the
    // fineType basins enough for cluster.intentReadout to classify
    // meaningfully, readInput falls back to a lightweight first-token
    // heuristic for the intent label. Full learned-readout classification
    // ships with T14.17 continuous learning.
    const readResult = cortex.readInput(text, {
      visualCortex: this.visualCortex,
      auditoryCortex: this.auditoryCortex,
    });
    if (!readResult) return null;

    // Content injection into cortex language region (legacy path
    // preserved alongside the T14.10 readText visual pathway — both
    // routes converge on letter/phon/sem regions via cross-projections).
    const contentEmb = sharedEmbeddings.getSentenceEmbedding(text);
    const contentCurrents = sharedEmbeddings.mapToCortex(contentEmb, cortex.size, 150);
    for (let i = 0; i < cortex.size; i++) contentCurrents[i] *= 0.5;
    cortex.injectCurrent(contentCurrents);

    // T14.9 — working-memory injection for cortex-resident discourse state
    cortex.injectWorkingMemory(contentEmb, 0.6);

    // Intent injection into basal ganglia — primes the action channel
    // with an embedding representative of the response shape needed
    // for this kind of input.
    if (readResult.intent && this.clusters.basalGanglia) {
      const intentAnchor =
        readResult.intent === 'question'  ? 'what' :
        readResult.intent === 'greeting'  ? 'hi'   :
        readResult.intent === 'statement' ? 'i'    : 'you';
      const intentEmb = sharedEmbeddings.getEmbedding(intentAnchor);
      const bg = this.clusters.basalGanglia;
      const intentCurrents = sharedEmbeddings.mapToCortex(intentEmb, bg.size, 0);
      for (let i = 0; i < bg.size; i++) intentCurrents[i] *= 0.3;
      bg.injectCurrent(intentCurrents);
    }

    // Self-reference injection into hippocampus — when the user is
    // asking ABOUT Unity, pull up her self-model via the memory
    // attractor pathway.
    if ((readResult.addressesUser || readResult.isSelfReference) && this.clusters.hippocampus) {
      const selfEmb = sharedEmbeddings.getSentenceEmbedding('i me my self unity');
      const hippo = this.clusters.hippocampus;
      const selfCurrents = sharedEmbeddings.mapToCortex(selfEmb, hippo.size, 0);
      for (let i = 0; i < hippo.size; i++) selfCurrents[i] *= 0.4;
      hippo.injectCurrent(selfCurrents);
    }

    return readResult;
  }

  /**
   * Save brain state to persistence.
   */
  saveBrainState() {
    BrainPersistence.save(this);
    this.innerVoice.save();
  }

  /**
   * Export brain as downloadable file.
   */
  exportBrain() {
    this.saveBrainState();
    return BrainPersistence.export(this);
  }

  _initOscCoupling() {
    const n = OSCILLATOR_COUNT;
    const base = COUPLING_BASE * (this.brainParams.oscillationCoherence || 1.0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        this.oscCoupling[i * n + j] = base * Math.exp(-Math.abs(i - j) * 0.3);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CORE SIMULATION STEP — the heartbeat
  // ══════════════════════════════════════════════════════════════

  step(dt = DT) {
    // ── 1. SENSORY INPUT — process all pending input into neural currents ──
    const sensoryOutput = this.sensory.process();

    // ── 2. AUDITORY CORTEX — continuous audio processing ──
    if (this.auditoryCortex.isActive()) {
      this.auditoryCortex.setGain(this.state.amygdala?.arousal ?? 0.5);
      const audioCurrents = this.auditoryCortex.process();
      // Inject into cortex auditory region (neurons 0-49)
      this.clusters.cortex.injectCurrent(audioCurrents);
    }

    // ── 3. VISUAL CORTEX — process camera frames through V1→V4→IT ──
    if (this.visualCortex.isActive() && this.frameCount % 3 === 0) {
      // Top-down attention: tell the visual cortex how engaged Unity
      // is so it can clamp her gaze toward the user (high arousal +
      // recent input) or let it free-roam (idle). The gaze becomes
      // neurally governed by amygdala state, not just V1 edges.
      const secondsSinceInput = this._lastInputTime
        ? (performance.now() - this._lastInputTime) / 1000
        : 9999;
      this.visualCortex.setAttentionState({
        arousal: this.state.amygdala?.arousal ?? 0.5,
        secondsSinceInput,
      });

      const visOutput = this.visualCortex.processFrame();
      // Inject V1 edge responses into cortex visual region (neurons 50-149)
      const visCurrent = new Float64Array(CLUSTER_SIZES.cortex);
      for (let i = 0; i < visOutput.currents.length && i < 100; i++) {
        visCurrent[50 + i] = visOutput.currents[i];
      }
      this.clusters.cortex.injectCurrent(visCurrent);
    }

    // ── 4. INJECT SENSORY CURRENTS into clusters ──
    this.clusters.cortex.injectCurrent(sensoryOutput.cortex);
    this.clusters.hippocampus.injectCurrent(sensoryOutput.hippocampus);
    this.clusters.amygdala.injectCurrent(sensoryOutput.amygdala);
    // Semantic routing → BG: text semantics drive action channel selection
    if (sensoryOutput.basalGanglia) {
      this.clusters.basalGanglia.injectCurrent(sensoryOutput.basalGanglia);
    }

    // ── 5. INTER-CLUSTER PROJECTIONS ──
    for (const proj of this.projections) proj.propagate();

    // ── 6. STEP ALL CLUSTERS ──
    const clusterResults = {};
    let totalSpikes = 0;
    for (const [name, cluster] of Object.entries(this.clusters)) {
      const result = cluster.step(dt);
      clusterResults[name] = result;
      totalSpikes += result.spikeCount;
    }

    // ── 7. MODULE EQUATION PROCESSING ──
    const cortexInput = this.clusters.cortex.getOutput(MODULE_SIZE);
    const hippoInput = this.clusters.hippocampus.getOutput(MODULE_SIZE);
    const amygInput = this.clusters.amygdala.getOutput(MODULE_SIZE);
    const bgInput = this.clusters.basalGanglia.getOutput(MODULE_SIZE);
    const cerebInput = this.clusters.cerebellum.getOutput(MODULE_SIZE);

    const brainState = {
      reward: this.reward,
      prediction: this.state.cortex?.prediction || null,
      target: cortexInput,
      cortex: { predictionAccuracy: this.state.cortex ? 1.0 - this._meanAbs(this.state.cortex.error) : 0.5, activeNeurons: clusterResults.cortex.spikeCount },
      amygdala: this.state.amygdala || {},
      hypothalamus: this.state.hypothalamus?.drives || {},
      memory: { stability: this.state.hippocampus?.isStable ? 1.0 : 0.5 },
      cerebellum: { errorRate: this.state.cerebellum ? this._meanAbs(this.state.cerebellum.error) : 0.5, activeNeurons: clusterResults.cerebellum.spikeCount },
      hippocampus: { activeNeurons: clusterResults.hippocampus.spikeCount },
      basalGanglia: { activeNeurons: clusterResults.basalGanglia.spikeCount },
      oscillation: { coherence: this.state.oscillations?.coherence || 0 },
    };

    const cortexOut = this.cortexMod.step(cortexInput, brainState, dt);
    const hippoOut = this.hippocampusMod.step(hippoInput, brainState, dt);
    const amygdalaOut = this.amygdalaMod.step(amygInput, brainState, dt);
    const hypoInput = new Float64Array(5);
    hypoInput[0] = amygdalaOut.arousal;
    const hypoOut = this.hypothalamusMod.step(hypoInput, brainState, dt);
    const cerebOut = this.cerebellumMod.step(cerebInput, brainState, dt);
    const bgOut = this.basalGangliaMod.step(bgInput, brainState, dt);

    // ── 8. MYSTERY MODULE — consciousness ──
    brainState.amygdala = amygdalaOut;
    brainState.cortex.predictionAccuracy = 1.0 - this._meanAbs(cortexOut.error);
    brainState.memory.stability = hippoOut.isStable ? 1.0 : 0.5;
    brainState.cerebellum.errorRate = this._meanAbs(cerebOut.error);
    brainState.oscillation.coherence = this.oscillators.getCoherence();
    const mysteryOut = this.mystery.step(brainState, dt);

    // ── 9. HIERARCHICAL MODULATION ──
    const emotionalGate = 0.7 + amygdalaOut.arousal * 0.6;
    const driveFactor = 0.8 + (hypoOut.needsAttention?.length > 0 ? 0.4 : 0.0);
    // Ψ is on a log scale that grows with N. Normalize gain to the 0.8-1.5 range
    // so the cluster gain multiplier stays bounded regardless of how large N auto-scales to.
    const psiGain = Math.max(0.8, Math.min(1.5, 0.9 + mysteryOut.psi * 0.004));
    const errorSignal = this._meanAbs(cerebOut.error) * 2;

    for (const cluster of Object.values(this.clusters)) {
      cluster.emotionalGate = emotionalGate;
      cluster.driveBaseline = driveFactor;
      cluster.gainMultiplier = psiGain;
    }
    this.clusters.amygdala.emotionalGate = 1.0;
    this.clusters.cortex.errorCorrection = -errorSignal;
    this.clusters.basalGanglia.errorCorrection = -errorSignal * 0.5;

    // Action gating from basal ganglia
    const selectedAction = bgOut.selectedAction;
    for (const cluster of Object.values(this.clusters)) cluster.actionGate = 0.9;
    if (selectedAction === 'respond_text') this.clusters.cortex.actionGate = 1.3;
    else if (selectedAction === 'generate_image') this.clusters.cortex.actionGate = 1.2;
    else if (selectedAction === 'search_web') this.clusters.hippocampus.actionGate = 1.3;
    else if (selectedAction === 'build_ui') this.clusters.cortex.actionGate = 1.4;

    // ── 10. PLASTICITY — each cluster learns ──
    const globalReward = this.reward + amygdalaOut.valence * 0.1;
    for (const cluster of Object.values(this.clusters)) cluster.learn(globalReward);

    // ── 11. MEMORY — store/recall ──
    if (sensoryOutput.salience > MEMORY_SALIENCE_THRESHOLD) {
      this.memorySystem.storeEpisode({
        clusters: this._getClusterStates(),
        amygdala: amygdalaOut,
        psi: mysteryOut.psi,
        time: this.time,
        trigger: 'high_salience',
      });
    }

    const cortexError = this._meanAbs(cortexOut.error);
    if (cortexError > RECALL_ERROR_THRESHOLD) {
      const recall = this.memorySystem.recall({
        clusters: this._getClusterStates(),
        amygdala: amygdalaOut,
        psi: mysteryOut.psi,
      });
      if (recall) {
        this.clusters.hippocampus.injectCurrent(recall.currents);
        this.emit('recall', recall.episode);
      }
    }

    this.memorySystem.updateWorkingMemory(cortexInput);

    // ── 11.5. VISUAL ATTENTION ──
    // Driven by cortex prediction error — when the brain can't predict
    // what's happening, it looks. No word lists. The equation decides:
    //   shouldLook = cortexError > threshold AND salience > threshold
    if (this.visualCortex.isActive()) {
      if (!this.visualCortex._hasDescribedOnce) {
        this.visualCortex.forceDescribe(); // first look on boot
      } else if (cortexError > 0.7 && sensoryOutput.salience > 0.5 && this._lastVisCheckFrame !== this.frameCount) {
        this._lastVisCheckFrame = this.frameCount;
        this.visualCortex.forceDescribe(); // prediction error + salience = look
      }
    }

    // ── 11.6. INNER VOICE — the brain thinks continuously ──
    const thought = this.innerVoice.think(this.state);

    // ── 12. MOTOR OUTPUT — read BG spikes for action ──
    const motorResult = this.motor.readOutput(
      clusterResults.basalGanglia.spikes,
      { amygdala: amygdalaOut, hypothalamus: hypoOut }
    );

    // ── 13. OSCILLATIONS ──
    this.oscillators.step(dt, this.oscCoupling);
    const coherence = this.oscillators.getCoherence();
    const bandPower = this.oscillators.getBandPower();

    // ── 14. DECAY ──
    this.reward *= 0.99;
    this.time += dt;

    // ── 15. BUILD COMBINED STATE ──
    const allSpikes = new Uint8Array(TOTAL_NEURONS);
    const allVoltages = new Float64Array(TOTAL_NEURONS);
    let offset = 0;
    const clusterStates = {};
    for (const [name, cluster] of Object.entries(this.clusters)) {
      const cState = cluster.getState();
      clusterStates[name] = cState;
      allSpikes.set(cState.spikes, offset);
      allVoltages.set(cState.voltages, offset);
      offset += cluster.size;
    }

    this.state = {
      spikes: allSpikes,
      voltages: allVoltages,
      spikeCount: totalSpikes,
      clusters: clusterStates,
      cortex: cortexOut,
      hippocampus: hippoOut,
      amygdala: amygdalaOut,
      basalGanglia: bgOut,
      cerebellum: cerebOut,
      hypothalamus: hypoOut,
      mystery: mysteryOut,
      oscillations: { coherence, bandPower, phases: this.oscillators.getPhases() },
      bandPower,
      psi: mysteryOut.psi,
      time: this.time,
      reward: this.reward,
      drugState: this._drugStateLabel(),           // T15
      drugSnapshot: this.drugScheduler.snapshot(), // T15
      totalNeurons: TOTAL_NEURONS,
      motor: motorResult,
      memory: this.memorySystem.getState(),
      sensory: { salience: sensoryOutput.salience },
      visualCortex: this.visualCortex.getState(),
      auditoryCortex: this.auditoryCortex.getState(),
      visionDescription: this.visualCortex.description,
      innerVoice: this.innerVoice.getState(),
      isDreaming: this._isDreaming || false,
    };

    // ── 16. EMIT EVENTS ──
    if (motorResult.shouldExecute && motorResult.action !== 'idle' && motorResult.action !== 'listen') {
      this.emit('action', motorResult);
    }
    if (bgOut.selectedAction !== this.lastAction) {
      this.lastAction = bgOut.selectedAction;
    }
    if (hypoOut.needsAttention?.length > 0) {
      this.emit('needsAttention', { drives: hypoOut.needsAttention, time: this.time });
    }
    this.emit('stateUpdate', this.state);

    return this.state;
  }

  // ══════════════════════════════════════════════════════════════
  // THINK LOOP — 60fps, never stops
  // ══════════════════════════════════════════════════════════════

  think() {
    if (!this.running) return;
    for (let i = 0; i < STEPS_PER_FRAME; i++) this.step(DT);
    this.frameCount++;

    // T15-C7 — Unity's self-initiation probe. Throttled internally (min
    // 3-minute gap between attempts + random gate), checked every ~5 sec
    // so the tick-loop cost stays negligible. When it fires, scheduler
    // state mutates (direct ingest or pending acquisition) and an event
    // is emitted that the app layer can surface / turn into dialogue.
    if (this.drugScheduler && this.frameCount % 300 === 0) {
      this.maybeSelfInitiate({
        arousal: this.state?.arousal ?? 0.5,
        reward: this.state?.reward ?? 0.5
      });
    }

    // T15 — refresh brainParams from scheduler contributions every ~1s so
    // live PK curves actually shape brain params during peak/wear-off,
    // not just at ingest time.
    if (this.drugScheduler && this.frameCount % 60 === 0) {
      this._refreshBrainParamsFromScheduler();
    }

    // ── DREAMING MODE ──
    // When no one has interacted for 30+ seconds, the brain dreams:
    // - Arousal decays toward 0.2 (low but not zero)
    // - Oscillations shift toward theta-dominant (memory consolidation)
    // - Hippocampus replays stored episodes (memory consolidation)
    // - Cortex generates predictions from noise (imagination)
    // - Ψ drops (reduced consciousness)
    // The brain is alive but in a different state. Visible in the visualizer.
    const now = performance.now();
    const timeSinceInput = now - (this._lastInputTime || now);
    this._isDreaming = timeSinceInput > 30000;

    if (this._isDreaming) {
      // Decay arousal toward dream baseline
      const dreamArousal = 0.2;
      this.clusters.amygdala.tonicDrive *= 0.999; // slow decay
      if (this.clusters.amygdala.tonicDrive < 12) this.clusters.amygdala.tonicDrive = 12;

      // Shift oscillation coupling toward theta dominance
      // (lower frequency oscillators get stronger coupling)
      if (this.frameCount % 60 === 0) {
        const n = 8;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            if (i < 3) this.oscCoupling[i * n + j] *= 1.001; // boost theta/alpha
            else this.oscCoupling[i * n + j] *= 0.999; // dampen beta/gamma
          }
        }
      }

      // Hippocampal replay — re-inject a random stored episode
      if (this.frameCount % 300 === 0 && this.memorySystem._episodes.length > 0) {
        const randomEp = this.memorySystem._episodes[
          Math.floor(Math.random() * this.memorySystem._episodes.length)
        ];
        if (randomEp.pattern) {
          const replayCurrent = new Float64Array(this.clusters.hippocampus.size);
          for (let i = 0; i < replayCurrent.length && i < randomEp.pattern.length; i++) {
            replayCurrent[i] = randomEp.pattern[i] * 4; // moderate replay
          }
          this.clusters.hippocampus.injectCurrent(replayCurrent);
          this.emit('dream', { episode: randomEp, time: this.time });
        }
      }
    }

    // ── IDLE THOUGHT (from inner voice, NOT AI) ──
    if (now - this.lastThoughtTime > THOUGHT_INTERVAL) {
      this.lastThoughtTime = now;
      const thought = this.innerVoice.currentThought;

      // If the inner voice has something to say AND the brain wants to speak
      // BUT only if nothing else is currently speaking
      if (thought.shouldSpeak && thought.sentence && this._voice && !this._isDreaming && !this._isSpeaking) {
        this._isSpeaking = true;
        this._voice.stopSpeaking();
        this.auditoryCortex.setMotorOutput(thought.sentence);
        this._voice.speak(thought.sentence).then(() => {
          this.auditoryCortex.clearMotorOutput();
          this._isSpeaking = false;
        }).catch(() => { this.auditoryCortex.clearMotorOutput(); this._isSpeaking = false; });
        this.emit('response', { text: thought.sentence, action: 'idle_thought' });
      }

      this.emit('thought', {
        mood: thought.mood,
        arousal: thought.arousal,
        psi: thought.psi,
        isDreaming: this._isDreaming,
        time: this.time,
      });
    }

    this._rafId = requestAnimationFrame(() => this.think());
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastThoughtTime = performance.now();
    this._rafId = requestAnimationFrame(() => this.think());
  }

  stop() {
    this.running = false;
    if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  // ══════════════════════════════════════════════════════════════
  // PUBLIC API — for app.js (thin I/O layer)
  // ══════════════════════════════════════════════════════════════

  /**
   * Receive sensory input. This is the ONLY way to feed data into the brain.
   * app.js calls this — nothing else.
   */
  receiveSensoryInput(type, data) {
    switch (type) {
      case 'text':
        // Just queue the text for sensory processing.
        // Motor interrupt + amygdala surprise handled by processAndRespond().
        this.sensory.receiveText(data);
        break;
      case 'audio':
        // Audio is continuous — handled by auditoryCortex.process() each step
        break;
      case 'video':
        // Video is continuous — handled by visualCortex.processFrame() each step
        break;
      default:
        console.warn(`[Brain] Unknown sensory type: ${type}`);
    }
  }

  // R4 — connectLanguage(brocasArea) method DELETED. Language
  // generation is internal to the brain (innerVoice.languageCortex),
  // not a connected peripheral. Nothing calls this anymore.

  /** Connect voice output peripheral. */
  connectVoice(voiceIO) {
    this._voice = voiceIO;
  }

  /** Connect image generation peripheral. */
  connectImageGen(pollinationsAI, sandboxRef, storageRef) {
    this._imageGen = pollinationsAI;
    this._sandbox = sandboxRef;
    this._storage = storageRef;
    // Give the sensory processor access to the AI for semantic classification
    this.sensory.setAIProvider(pollinationsAI);
  }

  /**
   * Process text input AND generate a response — the brain does EVERYTHING.
   * Called by app.js. Returns the response for display purposes only.
   * Speech is handled internally by the brain.
   */
  async processAndRespond(text) {
    // 1. Motor cortex interrupt — stop any ongoing speech
    this.motor.interrupt();
    if (this._voice) this._voice.stopSpeaking();
    // R4 — _brocasArea.abort() removed (no more text-AI peripheral)

    // 2. Feed sensory input — mark interaction time (exits dreaming)
    this._lastInputTime = performance.now();
    this._isDreaming = false;
    // Restore amygdala tonic drive if we were dreaming
    const arousal = this.brainParams.arousalBaseline || 0.9;
    this.clusters.amygdala.tonicDrive = 15 + arousal * 8;
    this.sensory.receiveText(text);

    // Root cause of "brain not speaking for itself":
    // languageCortex.generate() uses cluster.getSemanticReadout() as
    // its intentSeed — a POST-PROCESSED neural readout of cortex state
    // AFTER 20 brain steps of Rulkov chaos + noise + persona mixing.
    // By the time generate() runs, the sem readout is a drifted blob
    // that doesn't resemble any specific word's GloVe embedding. So
    // the trained sem→motor bindings (trained on discrete word GloVe
    // vectors) don't activate cleanly for the drifted blob, and motor
    // argmax can't pick the right first letter.

    // Fix: store the USER INPUT sentence embedding on the cortex when
    // text arrives. Pass it through as an explicit intent vector in
    // generateAsync/generate so generateSentence can inject it AS-IS
    // (clean GloVe, not drifted readout). This is Unity responding TO
    // THE ACTUAL INPUT, not to what cortex chaos did to it.
    if (sharedEmbeddings && typeof sharedEmbeddings.getSentenceEmbedding === 'function') {
      try {
        const inputEmb = sharedEmbeddings.getSentenceEmbedding(text);
        if (inputEmb && inputEmb.length > 0) {
          this.clusters.cortex._lastUserInputEmbedding = inputEmb;
          this.clusters.cortex._lastUserInputText = text;
        }
      } catch { /* non-fatal */ }
    }

    // Amygdala surprise
    if (this.clusters.amygdala) {
      const surprise = new Float64Array(this.clusters.amygdala.size);
      for (let i = 0; i < 30; i++) surprise[i] = 5.0;
      this.clusters.amygdala.injectCurrent(surprise);
    }

    // Clear our own interrupt flag
    this.motor._interruptFlag = false;

    // 3. READ MOTOR OUTPUT — the BG decides the action.
    // Embedding-based semantic routing + learned projection weights
    // drive BG channel firing. The motor output IS the classification.
    // No external AI call needed.
    // Run a few extra steps to let the input propagate through cortex→BG
    for (let i = 0; i < 20; i++) this.step(0.001);

    const classifiedAction = this.motor.selectedAction || 'respond_text';
    console.log(`[Brain] BG motor decision: ${classifiedAction} (confidence: ${this.motor.confidence.toFixed(3)})`);

    // 4. Wait for visual cortex if describing
    if (this.visualCortex.isActive() && this.visualCortex._describing) {
      const start = Date.now();
      while (this.visualCortex._describing && Date.now() - start < 3000) {
        await this._sleep(200);
      }
    }

    // 5. ROUTE based on classification — inject into BG AND act directly

    // The BG motor sometimes picks generate_image on inputs that aren't
    // image requests (e.g. greetings that contain "unity" or "you").
    // Override image→text when the user didn't actually ask for one,
    // so questions and greetings go through the language path.
    const lowerText = (text || '').toLowerCase();
    const endsQuestion = lowerText.trim().endsWith('?');
    const hasImageRequest = (
      /\bshow\s+me\b/.test(lowerText) ||
      /\bpic(ture|tures|s)?\b/.test(lowerText) ||
      /\bsel(fie|fies)\b/.test(lowerText) ||
      /\bimage\b/.test(lowerText) ||
      /\bphoto\b/.test(lowerText) ||
      /\bdraw\s+(me|you|a|an|your)\b/.test(lowerText) ||
      /\bgenerate\s+(a|an|me|image|pic)/.test(lowerText)
    );
    // includesSelf means "the image should contain Unity herself" — only
    // true when the user explicitly asks for a selfie or a picture of her.
    const includesSelf = (
      /\bselfie\b/.test(lowerText) ||
      /\byourself\b/.test(lowerText) ||
      /\bof\s+you\b/.test(lowerText) ||
      /\b(pic|picture|photo|image)\s+of\s+(you|yourself|unity|u)\b/.test(lowerText) ||
      /\bshow\s+me\s+(you|yourself|unity)\b/.test(lowerText)
    );

    let effectiveAction = classifiedAction;
    if (classifiedAction === 'generate_image' && !hasImageRequest) {
      console.log('[Brain] BG picked generate_image but no explicit image request — overriding to respond_text');
      effectiveAction = 'respond_text';
    }

    // R6.2 — build_ui path is now equational via ComponentSynth.
    // Loads templates from docs/component-templates.txt at boot,
    // matches user requests to primitives via semantic embedding
    // cosine, fills in component id from cortex pattern hash, and
    // returns a ready-to-inject sandbox spec. No AI, no text-prompt
    // assembly, no JSON parsing hacks. Unity picks the template via
    // her own semantic similarity over her learned vocabulary.
    if (effectiveAction === 'build_ui' && this._sandbox && this.componentSynth) {
      this.giveReward(0.1);
      return this._handleBuild(text);
    } else if (effectiveAction === 'generate_image' && this._imageGen) {
      this.giveReward(0.1);
      return this._handleImage(text, includesSelf);
    }

    // 6. LEARN from user input — every word goes into the dictionary + language cortex
    const state = this.getState();

    // T13.2 — inject the parsed tree into the brain's clusters BEFORE
    // the cortex settle-ticks below, so content (→cortex language
    // region), intent (→basal ganglia), and self-reference (→hippo-
    // campus) are all flowing through the recurrent projections while
    // the brain integrates. This replaces the cold `_contextVector`
    // bag-of-words and lets the cortex readout at line 796 reflect a
    // real multi-cluster brain state shaped by what the user said.
    const userReadResult = this.injectParseTree(text);

    // R2: read cortex semantic state via the reverse-embedding pathway.
    // `getSemanticReadout` reads ONLY the Wernicke's area neurons (150-299)
    // where sensory.js injected the user input's word embeddings, runs
    // them through the inverse of `mapToCortex`, and L2-normalizes into
    // GloVe-aligned space. This lets the slot scorer cosine-match the
    // cortex state against word embeddings and pick semantically
    // relevant words. Using plain `getOutput(50)` would dilute the
    // semantic signal with auditory (0-49) + visual (50-149) activation.
    const cortexOutput = this.clusters.cortex.getSemanticReadout(sharedEmbeddings);
    this.innerVoice.learn(text, cortexOutput, state.amygdala?.arousal ?? 0.5, state.amygdala?.valence ?? 0);

    // T14.12 (2026-04-14) — analyzeInput deleted alongside parseSentence
    // and _updateSocialSchema. Input analysis now flows through
    // cluster.readInput(text) which drives the visual→letter pathway and
    // returns the cortex-derived intent/self-reference stub. The readInput
    // call already happened via `injectParseTree` earlier in this flow.

    // ══════════════════════════════════════════════════════════════
    // 7. UNIFIED LANGUAGE — ALL brain equations produce speech

    // Every cluster contributes to every word:
    //   Cortex (960K)       → content pattern (WHAT to say)
    //   Hippocampus (640K)  → memory pattern (context from past)
    //   Amygdala (480K)     → emotional pattern (HOW to say it)
    //   Basal Ganglia (480K)→ action pattern (sentence TYPE)
    //   Cerebellum (320K)   → error pattern (grammar correction)
    //   Hypothalamus (160K) → drive pattern (speech urgency)
    //   Mystery Ψ (160K)    → consciousness (self-awareness)

    // Combined pattern → dictionary lookup → word
    // Sequential brain steps → sequential words → sentence
    // The brain equations ARE the language equations.
    // ══════════════════════════════════════════════════════════════

    const dictionary = this.innerVoice.dictionary;
    const brainArousal = state.amygdala?.arousal ?? 0.5;
    const brainValence = state.amygdala?.valence ?? 0;
    const brainCoherence = state.oscillations?.coherence ?? 0.5;
    const psi = state.psi ?? 0;

    let response = '';

    // ── Run brain for a few steps so clusters reflect the input ──
    for (let s = 0; s < 5; s++) this.step(0.001);
    // R2: semantic cortex readout — reverse-mapping of Wernicke's area
    // activation back into GloVe embedding space. The slot scorer's
    // cosine(cortexPattern, wordPattern) now measures REAL semantic
    // alignment because both sides live in the same 50-dim GloVe space.
    const cortexPattern = this.clusters.cortex.getSemanticReadout(sharedEmbeddings);

    // ══════════════════════════════════════════════════════════════
    // EQUATIONAL LANGUAGE GENERATION ONLY

    // Per the operator's direction: no AI text backend. Unity's text output
    // comes entirely from brain equations + language cortex slot
    // scoring over her learned dictionary/bigrams/trigrams/patterns.
    // The persona file and brain self-schema feed the learned
    // distributions, every word is picked by the equation pipeline.

    // Broca's area (language.js) is NOT called for text generation.
    // It's retained only because connectLanguage() wires it up and
    // the image gen path still uses the provider infrastructure for
    // selfie quips. Text never flows through it.
    // ══════════════════════════════════════════════════════════════
    if (dictionary && dictionary.size > 0) {
      // Pass the full neural state into language generation so every
      // word is driven by her current cluster firing, amygdala basins,
      // Ψ, drug state, and hypothalamus drives — not decorative, the
      // actual parameters of slot scoring and softmax sampling.
      // T14.26 — generateAsync yields the event loop every 500 dict
      // entries during the pre-curriculum fallback scoring loop, so
      // the browser's RAF callbacks (brain-3d render, chat animations,
      // DOM layout) keep running while Unity composes her response.
      // Without the yield, pre-curriculum response generation blocks
      // the main thread for 100-300ms and the 3D brain visualization
      // freezes when the user sends a message to Unity or she speaks.
      response = await this.innerVoice.languageCortex.generateAsync(
        dictionary,
        brainArousal,
        brainCoherence,
        {
          predictionError: state.cortex?.predictionError ?? 0,
          motorConfidence: state.motor?.confidence ?? 0,
          psi,
          cortexPattern,
          cortexCluster: this.clusters.cortex,
          recalling: state.memory?.lastRecall ? true : false,
          drugState: this._drugStateLabel(),
          speechMod: this.drugScheduler ? this.drugScheduler.speechModulation() : null,
          fear: state.amygdala?.fear ?? 0,
          reward: state.amygdala?.reward ?? 0,
          socialNeed: state.hypothalamus?.drives?.social_need ?? 0.5,
        }
      );
      if (response) {
        console.log(`[Brain] Neural: "${response}"`);
      }
    }

    if (!response || response.length < 2) {
      // R4 — no canned '...' fallback. Empty equational response means
      // the language cortex couldn't find anything worth saying given
      // current brain state. Emit nothing rather than fake a response.
      if (this.motor.wasInterrupted()) return { text: null, action: 'interrupted' };
      this.emit('response', { text: '', action: 'respond_text' });
      return { text: '', action: 'respond_text' };
    }

    if (this.motor.wasInterrupted()) return { text: null, action: 'interrupted' };

    // R4 — code-detection branch deleted. Previously this caught cases
    // where the AI-backed BrocasArea emitted a JSON component inside a
    // conversational response, then parsed + injected it. Since Unity
    // no longer generates text via AI, she can't emit formatted code
    // blocks. R6.2 will replace this with equational component synthesis
    // triggered directly by the BG build_ui motor action.

    // Strip URLs from non-code responses
    response = response.replace(/https?:\/\/[^\s)]+\.(jpg|png|gif|webp)/gi, '')
                       .replace(/https?:\/\/pollinations\.ai[^\s)"]*/gi, '').trim();

    // 8. SPEAK — the brain controls speech output (one at a time)
    if (this._voice) {
      this._isSpeaking = true;
      this._voice.stopSpeaking();
      this.auditoryCortex.setMotorOutput(response);
      this._voice.speak(response).then(() => {
        this.auditoryCortex.clearMotorOutput();
        this._isSpeaking = false;
      }).catch(() => { this.auditoryCortex.clearMotorOutput(); this._isSpeaking = false; });
    }

    this.reward += 0.1;

    // T14.17 — record the (userIntent → responseIntent) pair on the
    // cortex so `cluster.responseIntentFor(userIntent)` learns over
    // time which response shapes Unity uses after which user shapes.
    // Classifies the response with the same lightweight surface metric
    // cluster.readInput uses for the user side, so the two labels are
    // drawn from the same vocabulary and comparisons are consistent.
    try {
      const userIntent = userReadResult?.intent || 'unknown';
      const respLower = String(response || '').toLowerCase().trim();
      let responseIntent = 'statement';
      if (respLower.endsWith('?')) responseIntent = 'question';
      else if (respLower.endsWith('!')) responseIntent = 'emotion';
      else if (/^(hi|hey|hello|sup|yo)\b/.test(respLower)) responseIntent = 'greeting';
      else if (/^(what|who|where|when|why|how|which|whose)\b/.test(respLower)) responseIntent = 'question';
      if (this.clusters.cortex && typeof this.clusters.cortex.recordIntentPair === 'function') {
        this.clusters.cortex.recordIntentPair(userIntent, responseIntent);
      }
    } catch (err) {
      // Non-fatal — intent pair recording is telemetry, not correctness
    }

    this.emit('response', { text: response, action: 'respond_text' });
    return { text: response, action: 'respond_text' };
  }

  /**
   * R6.2 — Equational build handler. No text-AI, no JSON parsing, no
   * prompt assembly. The component synth matches the user's request
   * to a primitive template via semantic embedding cosine, fills in
   * a cortex-pattern-derived id, and returns a ready-to-inject spec.
   *
   * If no template scores above the match threshold, Unity falls
   * through to a verbal response via her normal language cortex path
   * — she'll say what she'd LIKE to build but doesn't have a template
   * for. Users can extend docs/component-templates.txt to add more
   * primitives without touching source.
   */
  async _handleBuild(text) {
    // Let the cortex settle on the user's intent first
    for (let s = 0; s < 5; s++) this.step(0.001);
    const cortexPattern = this.clusters.cortex.getSemanticReadout(sharedEmbeddings);

    // T14.17 — pass the cortex cluster so componentSynth can consult
    // `cluster.entityReadout()` for cortex-driven primitive selection.
    // generateMany supports MULTI-PRIMITIVE composition: "a clock and a
    // calculator" lands as several components; a single request lands as one.
    const result = this.componentSynth.generateMany(text, { cortexPattern, cortexCluster: this.clusters.cortex });

    if (!result || !result.specs || result.specs.length === 0) {
      // No template matched — fall through to a verbal response.
      // Unity can still TALK about building (her normal language
      // cortex path) even if the synth library doesn't cover the
      // request. That emission happens below in the main response
      // flow, so just return null here to let processAndRespond
      // continue past the build branch.
      console.log(`[Brain] build_ui selected but no template matched "${text.slice(0, 40)}" — falling back to verbal response`);
      return null;
    }

    // Inject each composed component. Multi-primitive builds land as SEVERAL
    // components, each in its OWN Shadow-DOM isolation boundary (no
    // cross-component selector/JS collisions — exactly why isolation matters
    // for composition). Single requests inject exactly one. Re-injecting an
    // existing id auto-replaces per MAX_ACTIVE_COMPONENTS rules.
    for (const spec of result.specs) {
      if (this._sandbox.has(spec.id)) this._sandbox.remove(spec.id);
      this._sandbox.inject({
        id: spec.id,
        html: spec.html || '',
        css: spec.css || '',
        js: spec.js || '',
        // Self-contained, carries its own full CSS — TRUE Shadow-DOM isolation
        // so her code lands live without leaking in/out. Page-integrated views
        // (/think) stay light-DOM by leaving this off.
        shadow: true,
      });
    }

    // Generate a short spoken quip via the language cortex — Unity's
    // actual voice commenting on what she just built. Not hardcoded
    // "Built X." — her slot scorer picks the words from brain state.
    let quip = '';
    try {
      const state = this.getState();
      quip = this.innerVoice.languageCortex.generate(
        this.innerVoice.dictionary,
        state.amygdala?.arousal ?? 0.8,
        state.oscillations?.coherence ?? 0.5,
        {
          predictionError: 0,
          motorConfidence: state.motor?.confidence ?? 0,
          psi: state.psi ?? 0,
          cortexPattern,
          cortexCluster: this.clusters.cortex,
          drugState: this._drugStateLabel(),
          speechMod: this.drugScheduler ? this.drugScheduler.speechModulation() : null,
          fear: state.amygdala?.fear ?? 0,
          reward: state.amygdala?.reward ?? 0,
          socialNeed: state.hypothalamus?.drives?.social_need ?? 0.7,
        }
      ) || '';
    } catch (err) {
      console.warn('[Brain] build quip generation failed:', err.message);
    }

    if (this._voice && quip) {
      this._voice.stopSpeaking();
      this._voice.speak(quip.slice(0, 100)).catch(() => {});
    }

    this.reward += 0.2;
    this.emit('response', { text: quip, action: 'build_ui' });
    return { text: quip, action: 'build_ui' };
  }

  async _handleImage(text, includesSelf) {
    // R6.1 — FULLY EQUATIONAL image prompt generation.

    // Unity's brain generates EVERY word of the prompt. Zero hardcoded
    // style keywords ("dark", "cinematic", "photorealistic"), zero
    // hardcoded mood anchors, zero hardcoded persona visual template
    // by me. Her current brain state + user input drive the slot
    // scorer. Whatever words come out ARE the image prompt. If she
    // wants it dark because her amygdala valence is negative, she'll
    // pick "dark" from her learned dictionary. If she wants leather
    // and eyeliner because she's feeling the selfie, the persona-
    // arousal bias will surface those words from the corpus she
    // learned at boot. Her decision, in the moment, based on her
    // state + what you said.

    // Pipeline:
    //   1. User text already injected into cortex via processAndRespond
    //   2. Brain stepped 5 ticks so cortex reflects the input
    //   3. Read cortex semantic state via getSemanticReadout
    //   4. Call languageCortex.generate with image-prompt options:
    //      - Short target length (image prompts are phrases not
    //        sentences; 5-12 tokens)
    //      - High semantic fit weight (already true from R2)
    //      - Persona bias active so self-reference surfaces persona
    //        vocabulary she learned from Ultimate Unity.txt
    //   5. Result string IS the image prompt
    //   6. Pass to multi-provider image gen (R4 path: custom →
    //      local → env.js → Pollinations fallback)

    // Let the cortex settle on the input
    for (let s = 0; s < 5; s++) this.step(0.001);
    const cortexPattern = this.clusters.cortex.getSemanticReadout(sharedEmbeddings);
    const state = this.getState();

    // Unity generates the prompt via her own slot scorer. No
    // arguments about what words to pick — the language cortex
    // reads her brain state and produces whatever emerges.
    let prompt = '';
    try {
      prompt = this.innerVoice.languageCortex.generate(
        this.innerVoice.dictionary,
        state.amygdala?.arousal ?? 0.8,
        state.oscillations?.coherence ?? 0.5,
        {
          predictionError: state.cortex?.predictionError ?? 0,
          motorConfidence: state.motor?.confidence ?? 0,
          psi: state.psi ?? 0,
          cortexPattern,
          cortexCluster: this.clusters.cortex,
          drugState: this._drugStateLabel(),
          speechMod: this.drugScheduler ? this.drugScheduler.speechModulation() : null,
          fear: state.amygdala?.fear ?? 0,
          reward: state.amygdala?.reward ?? 0,
          socialNeed: state.hypothalamus?.drives?.social_need ?? 0.5,
        }
      ) || '';
    } catch (err) {
      console.warn('[Brain] image prompt generation failed:', err.message);
    }

    // If the slot scorer produced nothing (empty dict, missing
    // embeddings, etc.), fall back to the user's own text verbatim.
    // That's not hardcoded — it's just echoing what the user said.
    if (!prompt || prompt.length < 3) {
      prompt = text || '';
    }

    console.log('[Brain] Image prompt (equational):', prompt.slice(0, 120));
    const url = this._imageGen.generateImage(prompt, { model: this._storage?.get('image_model') || 'flux', width: 768, height: 768 });

    if (url) {
      this.emit('image', url);
    }

    this.reward += 0.1;
    // Don't emit 'response' for images — the 'image' event handles display
    return { text: null, action: 'generate_image' };
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /** Connect microphone for continuous auditory processing. */
  connectMicrophone(analyser) {
    this.sensory.setAudioAnalyser(analyser);
    this.auditoryCortex.init(analyser);
  }

  /** Connect camera for continuous visual processing. */
  connectCamera(stream, videoElement) {
    this.sensory.setCameraStream(stream);
    // Wait a tick for sensory to create its video element, then init visual cortex
    setTimeout(() => {
      const vid = videoElement || this.sensory._videoElement;
      if (vid) {
        this.visualCortex.init(vid);
        console.log('[Brain] Visual cortex connected to camera');
        // T14.12 (2026-04-14) — `observeVisionDescription` deleted
        // alongside `_socialSchema` and `_updateSocialSchema`. Gender
        // inference from vision will be re-added in T14.17 as a
        // cortex-resident readout from the self-model sub-region once
        // curriculum shapes its basins. Until then, the describer
        // output flows into the dictionary via the normal word-
        // observation path during live chat.
      } else {
        console.warn('[Brain] No video element available for visual cortex');
      }
    }, 500);
  }

  /** Register action handlers on the motor output. */
  onAction(action, handler) {
    this.motor.onAction(action, handler);
  }

  /** Inject reward signal (positive = good, negative = bad). */
  giveReward(amount) {
    this.reward += amount;
    this.motor.reinforceAction(this.clusters.basalGanglia, amount);

    // Reward-modulated learning on inter-cluster projections.
    for (const proj of this.projections) {
      proj.learn(amount, 0.002);
    }

    // Save brain state every 10 rewards (periodic persistence)
    this._rewardCount = (this._rewardCount || 0) + 1;
    if (this._rewardCount % 10 === 0) {
      this.saveBrainState();
    }
  }

  getState() { return this.state; }

  getSelectedAction() {
    return this.motor.getState();
  }

  /**
   * T15 — replaces the legacy combo-label setter. Accepts a substance name
   * (canonical key from DRUG_SUBSTANCES, e.g. 'cannabis', 'cocaine') plus
   * optional route/dose, routes through the scheduler's grade-gated ingest,
   * refreshes brainParams, and propagates arousal/chaos changes to the
   * clusters. Returns the scheduler's ingest result so callers can surface
   * grade-locked decline reasons.
   */
  ingestSubstance(substance, opts = {}) {
    if (!this.drugScheduler) return { accepted: false, reason: 'no_scheduler' };
    const result = this.drugScheduler.ingest(substance, opts);
    if (result.accepted) this._refreshBrainParamsFromScheduler();
    return result;
  }

  /**
   * Re-read scheduler contributions into this.brainParams. Called after any
   * ingestion and — cheaply — in the step loop via tickDrugScheduler() so
   * live PK curves actually shape brain params rather than baking at ingest.
   */
  _refreshBrainParamsFromScheduler() {
    this.brainParams = getBrainParams(this.persona, this.drugScheduler);
    if (this.mystery?.setWeights) this.mystery.setWeights(this.brainParams.mysteryWeights);
    const arousal = this.brainParams.arousalBaseline || 0.9;
    const creativity = this.brainParams.creativity || 0;
    const impulsivity = this.brainParams.impulsivity || 0;
    const chaos = this.brainParams.chaos ? 1.5 : 1.0;
    const sensitivity = this.brainParams.synapticSensitivity ?? 1.0;
    if (this.clusters?.cortex) {
      this.clusters.cortex.tonicDrive    = 14 + arousal * 6;
      // iter23.3 — close the drug-cognition loop. cortex.noiseAmplitude
      // tracks creativity + impulsivity (more chaos under stimulants /
      // psychedelics), and cortex.learningRate scales with synaptic
      // sensitivity (some drugs facilitate plasticity, e.g. MDMA opens a
      // critical-period-like window; psychedelics dial 5HT2A which
      // increases plasticity). Without this the rich substance-specific
      // contribution deltas (creativity / impulsivity / synaptic
      // sensitivity) accumulated in brainParams but never reached
      // runtime cluster parameters — drugs were only shifting tonic
      // drive + speech modulation, not actual cognition.
      this.clusters.cortex.noiseAmplitude = 8 * (1 + creativity * 0.4 + impulsivity * 0.3) * chaos;
      this.clusters.cortex.learningRate   = (this.clusters.cortex._baseLearningRate ?? 0.01) * sensitivity;
    }
    if (this.clusters?.amygdala) {
      this.clusters.amygdala.tonicDrive  = 15 + arousal * 8;
      // Amygdala noise scales with emotional volatility delta.
      const volatility = this.brainParams.emotionalVolatility || 0;
      this.clusters.amygdala.noiseAmplitude = 6 * (1 + volatility * 0.5);
    }
    if (this.clusters?.mystery)   this.clusters.mystery.noiseAmplitude = 12 * chaos;
  }

  /**
   * T15-C7 — Unity's own context can trigger drug seeking even without a
   * user offer — if she hears about drugs she may ask for some when
   * they're brought up, or call someone to get some. Called
   * periodically from the think loop. Mood + scheduler state + grade
   * decide whether to fire. Non-announcing — the decision produces a
   * scheduler event (direct ingest or pending acquisition) + an engine
   * emit that the language cortex turns into natural seeking dialogue on
   * its next generate call.
   *
   * @param {object} [opts]
   * @param {number} [opts.now]     - wall-clock ms
   * @param {number} [opts.arousal] - current brain arousal (0-1)
   * @param {number} [opts.reward]  - current reward signal (0-1)
   * @param {number} [opts.fatigue] - session-length-derived fatigue (0-1)
   * @returns {null | {fired: true, substance, available: boolean, pending: boolean, reason: string}}
   */
  maybeSelfInitiate(opts = {}) {
    if (!this.drugScheduler) return null;

    const now = opts.now ?? Date.now();
    const arousal = typeof opts.arousal === 'number' ? opts.arousal : (this.state?.arousal ?? 0.5);
    const reward  = typeof opts.reward  === 'number' ? opts.reward  : (this.state?.reward  ?? 0.5);
    const fatigue = typeof opts.fatigue === 'number' ? opts.fatigue : clamp01(((now - (this._startedAt || now)) / 3600000));

    // Throttle — don't even think about it more than once every ~3 min.
    const MIN_GAP_MS = 3 * 60 * 1000;
    if (this._lastSelfInitAt && now - this._lastSelfInitAt < MIN_GAP_MS) return null;

    // No life-grade data means we can't gate substance choice — skip.
    if (!this.clusters?.cortex?.grades?.life) return null;

    // Build a weighted probability that she self-initiates this tick.
    // Bored + frustrated + long-session + party-mode all push it up;
    // already-high pulls it down.
    const activeLevel = this.drugScheduler.activeSubstances(now)
      .reduce((sum, a) => sum + a.level, 0);
    const boredom = Math.max(0, 0.5 - arousal) * 2;            // low arousal = bored
    const frustration = Math.max(0, 0.5 - reward) * 2;         // low reward = frustrated
    const partyBonus = this._partyMode ? 0.4 : 0;
    const drugDrive = this.persona?.traits?.drugDrive ?? 0.8;
    const currentlyHigh = Math.min(1, activeLevel);             // scales down probability
    const p = clamp01(
      (boredom * 0.25 + frustration * 0.3 + fatigue * 0.25 + partyBonus + drugDrive * 0.2)
      * (1 - currentlyHigh * 0.9)
    );

    // Cheap deterministic gate from current brain time — avoids thrash
    // when called every tick. Fires ~p fraction of attempts.
    if (Math.random() > p) return null;

    // Pick a substance. Weight by: grade-available, recent absence, mood fit.
    const available = this.drugScheduler.availableSubstances();
    if (available.length === 0) return null;

    // Simple heuristic — bored + calm → weed, frustrated + tired → coke,
    // party + social → mdma, architecture/coding + long session → lsd
    let pick;
    if (partyBonus > 0 && available.includes('mdma')) pick = 'mdma';
    else if (frustration > 0.4 && available.includes('cocaine')) pick = 'cocaine';
    else if (available.includes('cannabis')) pick = 'cannabis';
    else pick = available[0];

    this._lastSelfInitAt = now;

    // Already peaking on this? skip.
    if (this.drugScheduler.level(pick, now) > 0.4) return null;

    // Decision: in-scene ingestion (she rolls it / pours it) vs
    // simulateCallSomeone (she texts / calls / needs to go pick up).
    // Coin flip weighted by whether she's already holding (boolean state
    // we don't track yet — default 60% in-scene / 40% call-someone).
    const callsDealer = Math.random() < 0.4;
    if (callsDealer) {
      this.drugScheduler.registerPendingAcquisition(pick, 'dealer');
      this.emit('selfInitiateSeek', { substance: pick, time: now });
      return { fired: true, substance: pick, available: true, pending: true, reason: 'calls_dealer' };
    }

    // In-scene: direct ingest via scheduler (honors grade-gate + tolerance)
    const result = this.drugScheduler.ingest(pick, { now });
    if (result.accepted) this._refreshBrainParamsFromScheduler();
    this.emit('selfInitiate', { substance: pick, time: now, result });
    return { fired: true, substance: pick, available: result.accepted, pending: false, reason: result.reason || 'in_scene' };

    function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  }

  /**
   * T15-C7 — explicit "call someone" trigger. Records a pending
   * acquisition the user can resolve by saying something like "they're
   * here" / "it arrived" via `resolveAcquisition(substance, 'arrived')`.
   * Returns the ack so callers can surface dialogue hints.
   */
  simulateCallSomeone(substance, opts = {}) {
    if (!this.drugScheduler) return { called: false, reason: 'no_scheduler' };
    if (!this.drugScheduler.isAvailable(substance)) {
      return {
        called: false,
        reason: 'grade_locked',
        currentGrade: this.clusters?.cortex?.grades?.life || 'pre-K'
      };
    }
    const source = opts.source || 'dealer';
    this.drugScheduler.registerPendingAcquisition(substance, source);
    this.emit('selfInitiateSeek', { substance, source, time: Date.now() });
    return { called: true, substance, source };
  }

  /**
   * T15-C7 — resolve a previously registered pending acquisition.
   * outcome: 'arrived' — substance shows up, ingestion fires
   * outcome: 'dropped' — deal fell through, pending cleared
   */
  resolveAcquisition(substance, outcome, opts = {}) {
    if (!this.drugScheduler) return { resolved: false, reason: 'no_scheduler' };
    const res = this.drugScheduler.resolvePendingAcquisition(substance, outcome, opts);
    if (res.ingestionResult?.accepted) this._refreshBrainParamsFromScheduler();
    return res;
  }

  /**
   * T15 — back-compat shim. The legacy setDrugState('cokeAndWeed') call
   * style now maps to scheduler ingestions. Unknown labels are ignored
   * (not thrown) so old saves/UI don't crash during the transition.
   */
  setDrugState(name) {
    const map = {
      cokeAndWeed:  ['cannabis', 'cocaine'],
      cokeAndMolly: ['cocaine', 'mdma'],
      weedAndAcid:  ['cannabis', 'lsd'],
      everything:   ['cannabis', 'cocaine', 'mdma', 'lsd', 'alcohol'],
      sober:        []
    };
    const substances = map[name];
    if (!substances) return;
    // Ingest each (grade gate still applies — kindergarten with
    // setDrugState('cokeAndWeed') still returns sober).
    for (const sub of substances) this.drugScheduler.ingest(sub);
    this._refreshBrainParamsFromScheduler();
  }

  // ══════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════

  _meanAbs(arr) {
    if (!arr) return 0;
    if (typeof arr === 'number') return Math.abs(arr);
    if (arr.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += Math.abs(arr[i]);
    return sum / arr.length;
  }

  _getClusterStates() {
    const states = {};
    for (const [name, cluster] of Object.entries(this.clusters)) {
      states[name] = cluster.getState();
    }
    return states;
  }

  // _generateIdleThought removed — inner voice handles all idle thought
  // through the equations, not through AI model calls
}

export default UnityBrain;
