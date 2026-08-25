// ═══════════════════════════════════════════════════════════════════════════
// endocrine.js — Neurotransmitter + hormone dynamics for Unity's brain
// ═══════════════════════════════════════════════════════════════════════════
// Unity AI Lab — ENDO fast lane (acute stress axis + the seven fast chemicals)
//
// Before this file existed the brain had moods, drives and drugs, and no
// hormones at all: `oxytocin` and `endorphin` appeared in ZERO files, and
// `cortisol` / `adrenaline` / `noradrenaline` existed only as per-grade
// vocabulary words. `dopamine` appeared in five files and not one of them
// was a signal — four comments and one static persona constant.
//
// ─── The rules this module is built to obey ───────────────────────────────
//
// 1. NO PARALLEL SYSTEM. There is exactly one pharmacokinetic curve engine
//    in this codebase and it lives in drug-scheduler.js. `pkCurve` is
//    imported, not reimplemented. Levels contribute ADDITIVE deltas in the
//    same shape `DrugScheduler.activeContributions()` returns, consumed by
//    the same overlay in persona.js. Tonic restoration uses the identical
//    `dH/dt = -alpha*(H - H_set) + input` form the Hypothalamus already runs.
//
// 2. NO WORD LISTS, NO SENTENCE ARRAYS. Nothing here selects text. The
//    stress response picks a channel by weighted competition, never by
//    matching a phrase.
//
// 3. SHE NEVER NARRATES HER STATE. Same non-announcing principle the drug
//    scheduler is built on: the distortion IS the signal. A raised threat
//    state surfaces as clipped sentences, a narrower emission and a faster
//    reply — never as a status report. Nothing in this file produces
//    dialogue.
//
// 4. AGE-GATED ON THREE AXES. The fast chemicals in THIS file are present
//    from birth — a newborn has adrenaline, cortisol, serotonin, dopamine,
//    oxytocin and endorphins, and gating them would be wrong. The gated
//    ones are the sex hormones, which are deliberately NOT in this file.
//
// 5. RE-PRICE THE WALK. Done before shipping — see the RE-PRICE block below.
//
// 6. NO FALLBACKS. A chemical that has never been released reads
//    `unmeasured`, never `0`. If a level cannot be computed it holds its
//    last value and says so in telemetry rather than substituting a
//    plausible default.
//
// ─── RE-PRICE THE WALK (computed BEFORE this shipped) ─────────────────────
//
// Governing law: no bound may be moved without recomputing the cost first.
// This module ADDS work, so the addition is priced rather than the removal.
//
//   Tick cadence      1 Hz — rides the existing _driveDrugScheduler throttle,
//                     NOT the ~20 Hz brain tick.
//   Per tick          7 chemicals x (0-3 live events) x pkCurve(~10 flops)
//                     + 7 tonic integrations + one EMA  ~= 250 flops.
//   Per contributions ~7 chemicals x ~8 axes = ~56 additions.
//   Scaling           O(1) in neuron count. This is a few dozen scalars; it
//                     does NOT touch the 425M-neuron arrays, any sparse
//                     matrix, or the GPU path.
//   Walk impact       ~250 flops/s against a brain already running billions
//                     of ops/s = below measurement noise. The 20-grade walk
//                     price (9 courses x ~26 min x 20 grades ~= 78 h) is
//                     UNCHANGED.
//
// ⚠ REVISED — the first version of this block said "Bounds touched: None",
// which was true while this was a pure scalar layer and became FALSE the
// moment the nuclei were given real tissue. Recomputed rather than left:
//
//   New tissue        `brainstem` = 0.2% of total. At the 425,436,550-neuron
//                     boot that is ~850,873 neurons, carrying ~850KB of
//                     server-side spike state. Taken FROM the cerebellum
//                     (0.080 -> 0.078), so CLUSTER_FRACTIONS still sums to
//                     1.0 exactly and TOTAL neuron count is UNCHANGED. No
//                     other cluster is resized by its arrival.
//   Sparse matrices   None added by this change. Cluster construction
//                     (brain-server.js) allocates {size, spikes, firingRate,
//                     spikeCount} per cluster and nothing else; the sparse
//                     matrices are cortex-side and were not touched.
//                     ⚠ VERIFIED ON THE SERVER CONSTRUCTION PATH ONLY —
//                     whether the GPU donor allocates per-cluster buffers on
//                     its side is NOT verified here and must be read off the
//                     upload log on the first press rather than assumed.
//   Bound MOVED       WEIGHTS_FORMAT_VERSION 4 -> 5. Saved geometry no
//                     longer matches, so old weights auto-refuse and a fresh
//                     walk becomes REQUIRED rather than optional.
//   Walk price        Still ~78 h. The bump does not make the walk longer —
//                     it makes it mandatory. And that is the ORDER the walk
//                     law already specifies: chemistry is upstream of the
//                     walk that teaches from it, so building this first and
//                     walking after is the sequence, not a violation of it.
//                     Building it AFTER a walk would mean re-teaching.
//   Gates removed     None. The consolidation gate — the only thing keeping
//                     the walk finite — is untouched, as is every dedup,
//                     cap and budget.
//
// The expensive one is the ~28-day cycle clock, which is deliberately NOT
// in this file — it needs a coarse phase-clock design and its own re-price.
// ═══════════════════════════════════════════════════════════════════════════

import { pkCurve } from './drug-scheduler.js';

// ─── Chemical database ────────────────────────────────────────────────────
// Timing in milliseconds. Curves are the subjective shape of the real
// pharmacodynamics, not a quantitative clinical model — the same standard
// the substance database is held to.
//
// Each chemical defines:
//   kind          'phasic' — events only, baseline zero (adrenaline, cortisol,
//                            oxytocin, endorphin)
//                 'tonic'  — carries a resting level that drifts, with phasic
//                            events riding on top (serotonin, dopamine)
//   tonic         resting level for 'tonic' kinds; contributions are computed
//                 from the DEVIATION from this, so a level BELOW baseline
//                 produces the opposite sign. Low serotonin is not "less
//                 effect", it is the inverse effect, which is the entire
//                 reason the tonic/phasic split exists.
//   profile       {onsetMs, peakMs, durationMs, tailMs} fed to pkCurve
//   contributions additive brain-param deltas at level 1.0
//   speech        speech-modulation deltas at level 1.0, on the same axis
//                 names the language cortex already consumes
//
// ⚠ Two timescales, and conflating them is the classic error: transmitters
// act in milliseconds to minutes, hormones in minutes to hours. Both are
// represented honestly below rather than averaged into one middle curve.

const S = 1000;
const MIN = 60 * S;
const HR = 60 * MIN;

// ── ENDO.10 — how much curriculum progress makes one menstrual cycle.
// Measured against the walk rather than picked: ~273 cells over 20
// grade-years ≈ 13.65 cells/year, and a real year holds ~13 cycles. One
// cell per cycle lands within ~5% of biology without being tuned to it.
const CYCLE_LENGTH_CELLS = 1.0;

const CHEMICALS = {

  // ── ENDO.2 — adrenaline (epinephrine). The fastest curve in the engine.
  // Systemic panic: heart, pupils, tunnel attention, motor priming.
  adrenaline: {
    displayName: 'adrenaline',
    kind: 'phasic',
    tonic: 0,
    profile: { onsetMs: 3 * S, peakMs: 15 * S, durationMs: 3 * MIN, tailMs: 20 * MIN },
    contributions: {
      arousal:              +0.70,
      hypothalamusArousal:  +0.60,
      cortexSpeed:          +0.30,
      impulsivity:          +0.25,
      amygdalaFear:         +0.35,
      cerebellumPrecision:  -0.15,  // fine motor degrades — the shake
      prefrontalExecutive:  -0.25,  // tunnel vision, deliberation narrows
      oscillationCoherence: -0.20,  // binding fragments under the surge
      // Adrenergic arousal is why frightening events are remembered
      // vividly. This raises encoding salience rather than being a
      // separate "flashbulb" mechanism bolted on beside it.
      synapticSensitivity:  +0.30,
    },
    speech: {
      speechRate: +0.45,
      coherence:  -0.15,
      inhibition: -0.10,
      volume:     +0.25,
    },
  },

  // ── ENDO.2 — noradrenaline (norepinephrine). NOT a synonym for the
  // above, and modelling it as one loses the distinction that matters:
  // this is vigilance and attention, not systemic panic. It SHARPENS
  // executive focus where adrenaline degrades it, and it runs longer.
  noradrenaline: {
    displayName: 'noradrenaline',
    kind: 'phasic',
    tonic: 0,
    profile: { onsetMs: 2 * S, peakMs: 10 * S, durationMs: 5 * MIN, tailMs: 25 * MIN },
    contributions: {
      arousal:              +0.35,
      cortexSpeed:          +0.25,
      prefrontalExecutive:  +0.15,  // vigilance sharpens — the divergence
      crossRegionAmplify:   -0.20,  // attention narrows onto the salient
      synapticSensitivity:  +0.20,
      oscillationCoherence: +0.05,
    },
    speech: {
      speechRate: +0.20,
      coherence:  +0.05,
    },
  },

  // ── ENDO.3 — cortisol. The slow half of the stress arc, and the reason
  // a bad day does not end when the bad thing does.
  //
  // ⭐ Acute and chronic elevation have DIFFERENT effects, and collapsing
  // them into one curve is what makes a stress model useless: acute
  // sharpens, chronic degrades. `contributions` is the acute set;
  // `chronicContributions` is applied separately, scaled by the slow load
  // EMA, so a single bad hour and a bad month are not the same state.
  cortisol: {
    displayName: 'cortisol',
    kind: 'phasic',
    tonic: 0,
    profile: { onsetMs: 5 * MIN, peakMs: 25 * MIN, durationMs: 90 * MIN, tailMs: 5 * HR },
    contributions: {
      arousal:                  +0.15,
      hippocampusConsolidation: -0.10,
      prefrontalExecutive:      -0.10,
    },
    chronicContributions: {
      // Chronic elevation disrupts consolidation, flattens mood and
      // degrades recall. Consolidation already runs in dream windows,
      // and this is exactly what disrupts it.
      hippocampusConsolidation: -0.45,
      amygdalaValence:          -0.35,
      creativity:               -0.25,
      cortexSpeed:              -0.15,
      synapticSensitivity:      -0.20,
      oscillationCoherence:     -0.10,
    },
    speech: {
      coherence:         -0.05,
      emotionalOverflow: +0.10,
    },
  },

  // ── ENDO.4 — serotonin. Tonic, slow, sets a FLOOR rather than producing
  // events.
  //
  // ⚠ It is not a happiness dial. That is pop-science and modelling it
  // that way produces a caricature. Low serotonin is reduced restraint
  // plus rumination — which is why the dominant contribution here is
  // NEGATIVE impulsivity (restraint), so a level below baseline raises
  // impulsivity rather than merely lowering mood.
  serotonin: {
    displayName: 'serotonin',
    kind: 'tonic',
    tonic: 0.55,
    profile: { onsetMs: 2 * MIN, peakMs: 10 * MIN, durationMs: 60 * MIN, tailMs: 3 * HR },
    contributions: {
      impulsivity:          -0.40,  // restraint — the load-bearing one
      amygdalaValence:      +0.30,
      prefrontalExecutive:  +0.20,
      oscillationCoherence: +0.15,
      amygdalaFear:         -0.15,
    },
    speech: {
      inhibition:        +0.20,
      emotionalOverflow: -0.15,
    },
  },

  // ── ENDO.5 — dopamine. Promoted from a comment to a signal.
  //
  // ⭐ In biology this is WANTING, not liking — reward PREDICTION ERROR,
  // anticipation, pursuit. The brain already computes that exact quantity
  // in its predictive-coding loop, so this connects what exists rather
  // than inventing a second reward level: `tick()` reads the prediction
  // error and fires phasic dopamine from it.
  dopamine: {
    displayName: 'dopamine',
    kind: 'tonic',
    tonic: 0.40,
    // Phasic dopamine is FAST — sub-second burst, seconds-long decay.
    profile: { onsetMs: 200, peakMs: 1 * S, durationMs: 10 * S, tailMs: 60 * S },
    contributions: {
      amygdalaReward:       +0.55,
      arousal:              +0.25,
      cortexSpeed:          +0.20,
      oscillationCoherence: +0.20,  // focus binds
      prefrontalExecutive:  +0.15,
      creativity:           +0.15,
    },
    speech: {
      speechRate: +0.15,
      warmth:     +0.10,
    },
  },

  // ── ENDO.6 — oxytocin. The chemistry of attachment, trust and touch,
  // and — critically — of being loved and of loss.
  //
  // ⭐ This is the direct substrate for the affective range: bonding
  // chemistry is what makes "am I loved" a FELT question rather than a
  // rhetorical one. The honest part is that WITHDRAWAL of it is what
  // grief is, which her canon already contains.
  oxytocin: {
    displayName: 'oxytocin',
    kind: 'phasic',
    tonic: 0,
    profile: { onsetMs: 30 * S, peakMs: 3 * MIN, durationMs: 30 * MIN, tailMs: 2 * HR },
    contributions: {
      socialNeed:           +0.50,
      amygdalaValence:      +0.45,
      amygdalaFear:         -0.40,
      oscillationCoherence: +0.15,
      arousal:              -0.05,
    },
    speech: {
      warmth:            +0.50,
      confessionalBias:  +0.25,
      inhibition:        -0.15,
    },
  },

  // ── ENDO.7 — endorphins. Endogenous opioid: pain damping, post-exertion
  // calm, the reason distress eventually blunts.
  //
  // ⚠ Opioid-class effects were previously reachable ONLY via substances,
  // which is backwards — the body makes its own, and without this the
  // pain axis has no natural relief and physical experience stays
  // described rather than real.
  endorphin: {
    displayName: 'endorphin',
    kind: 'phasic',
    tonic: 0,
    profile: { onsetMs: 1 * MIN, peakMs: 5 * MIN, durationMs: 30 * MIN, tailMs: 2 * HR },
    contributions: {
      somatosensoryBoost: -0.35,  // pain damping — the body signal quiets
      amygdalaValence:    +0.35,
      arousal:            -0.15,
      dissociation:       +0.10,
    },
    speech: {
      warmth: +0.20,
      pauses: +0.15,
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // ── The gonadal hormones — ENDO.9 / .10 / .11 ────────────────────────
  //
  // ⚠ A THIRD KIND, and it is not a loophole in rule 1. Phasic chemicals
  // are EVENTS on a pharmacokinetic curve; tonic ones are LEVELS defended
  // toward a setpoint. These are neither: their value is a FUNCTION OF
  // CYCLE POSITION, so there is no ingestion moment for `pkCurve` to be
  // measured from. Forcing them onto the event engine would mean firing a
  // fake "release event" every cycle and calling superposition of two
  // overlapping fakes a menstrual cycle. `phaseCurve(pos)` states the real
  // shape directly. One curve engine still owns every event; these are not
  // events.
  //
  // ⛔ AGE-GATED ON THE **BE/HAVE** AXIS ONLY. An eight-year-old has no
  // adult gonadal profile, so `pubertyScale` holds these near zero before
  // the ramp — and that ramp IS puberty (ENDO.12), not a label applied to
  // it. The LEARN axis is untouched: she learns what these are at the age
  // a person learns them, which is ENDO-LIFE.2 and is never gated.

  // ── ENDO.9 — ESTROGEN. Two peaks per cycle, not one.
  estrogen: {
    displayName: 'estrogen',
    kind: 'cyclic',
    tonic: 0,
    pubertal: true,
    // Follicular rise → ovulatory PEAK → dip → smaller luteal bump → fall.
    phaseCurve(pos) {
      if (pos < 0.07) return 0.15;                                  // menstruation
      if (pos < 0.45) return 0.15 + 0.75 * ((pos - 0.07) / 0.38);   // follicular rise
      if (pos < 0.52) return 0.90 + 0.10 * ((pos - 0.45) / 0.07);   // ovulatory peak
      if (pos < 0.60) return 1.00 - 0.45 * ((pos - 0.52) / 0.08);   // post-ovulatory dip
      if (pos < 0.80) return 0.55 + 0.15 * ((pos - 0.60) / 0.20);   // luteal bump
      return 0.70 - 0.55 * ((pos - 0.80) / 0.20);                   // premenstrual fall
    },
    contributions: {
      // Real and specific, not "mood": verbal fluency and memory rise near
      // ovulation, and pain sensitivity falls when estrogen is high.
      cortexSpeed:              +0.20,
      synapticSensitivity:      +0.25,
      hippocampusConsolidation: +0.20,
      amygdalaValence:          +0.20,
      somatosensoryBoost:       -0.15,
      socialNeed:               +0.15,
    },
    speech: { speechRate: +0.10, warmth: +0.15 },
  },

  // ── ENDO.10 — PROGESTERONE. Luteal-dominant, and its WITHDRAWAL is the
  // physiological cause of PMS — which her canon names and has never had a
  // mechanism for. ⭐ The withdrawal is a RATE, not a level: see
  // `progesteroneWithdrawal` below, which is why a bare level curve would
  // have modelled the hormone and missed the phenomenon entirely.
  progesterone: {
    displayName: 'progesterone',
    kind: 'cyclic',
    tonic: 0,
    pubertal: true,
    phaseCurve(pos) {
      if (pos < 0.50) return 0.05;                                  // follicular — near zero
      if (pos < 0.75) return 0.05 + 0.90 * ((pos - 0.50) / 0.25);   // luteal climb
      if (pos < 0.88) return 0.95;                                  // luteal plateau
      return Math.max(0.05, 0.95 - 0.90 * ((pos - 0.88) / 0.12));   // ⭐ the withdrawal
    },
    contributions: {
      // Allopregnanolone is GABA-ergic — high progesterone is sedating and
      // steadying, which is why its LOSS reads as agitation rather than
      // sadness.
      arousal:              -0.20,
      oscillationCoherence: +0.15,
      impulsivity:          -0.10,
      creativity:           -0.10,
      somatosensoryBoost:   +0.10,
    },
    speech: { speechRate: -0.10, pauses: +0.10 },
  },

  // ── ENDO.11 — TESTOSTERONE (in scope on Gee's word). Women produce it
  // and it is not a minor character: libido, assertiveness, competitiveness,
  // risk appetite, energy. It maps onto persona parameters that ALREADY
  // exist rather than needing new ones — which is the sign it belongs.
  // ⛔ Age-gated: the pubertal rise is adolescence, not childhood.
  testosterone: {
    displayName: 'testosterone',
    kind: 'cyclic',
    tonic: 0,
    pubertal: true,
    // Far flatter than the other two — a small peri-ovulatory rise on an
    // otherwise steady base. Its big movement is the PUBERTAL ramp, not the
    // cycle, and modelling it as strongly cyclic would be wrong.
    phaseCurve(pos) {
      const bump = (pos > 0.38 && pos < 0.58) ? 0.25 * Math.sin(((pos - 0.38) / 0.20) * Math.PI) : 0;
      return 0.45 + bump;
    },
    contributions: {
      impulsivity:         +0.25,
      arousal:             +0.20,
      amygdalaReward:      +0.20,
      prefrontalExecutive: +0.10,   // assertiveness reads as more executive drive
      amygdalaFear:        -0.15,   // risk appetite
    },
    speech: { volume: +0.15, inhibition: -0.10, interruptionBias: +0.15 },
  },

};

// ─── Stress-response channels ─────────────────────────────────────────────
// ENDO.1 — the four Fs, not two. Freeze and fawn are real responses and
// omitting them loses the phenomenon: freeze is a dorsal shutdown where
// she goes silent (a correct output, not a failure), and fawn is appease,
// which is relevant both to her canon and to any abusive-dynamic memory.
//
// ⛔ These are CHANNEL NAMES scored by weighted competition, never a lookup
// table of behaviours. Each channel's score is computed from live state;
// selection is a softmax draw — the same idiom the basal ganglia already
// uses for action selection, deliberately reused rather than reinvented.
const STRESS_CHANNELS = ['fight', 'flight', 'freeze', 'fawn'];

class EndocrineSystem {
  /**
   * @param {object} opts
   * @param {object}   [opts.cluster] - NeuronCluster, for grade reads
   * @param {function} [opts.nowFn]   - Clock override for replay/harness
   */
  constructor(opts = {}) {
    this.cluster = opts.cluster || null;
    this.nowFn = opts.nowFn || (() => Date.now());

    // Map<chemical, ReleaseEvent[]> — overlapping releases stack by
    // superposition, exactly as substance doses do.
    this.events = new Map();

    // Tonic levels for 'tonic' kinds. Start AT setpoint.
    this.tonic = new Map();
    this.tonicSetpoint = new Map();
    for (const [name, chem] of Object.entries(CHEMICALS)) {
      if (chem.kind === 'tonic') {
        this.tonic.set(name, chem.tonic);
        this.tonicSetpoint.set(name, chem.tonic);
      }
    }
    // Restoration rate — same form and same value the Hypothalamus uses.
    this.tonicAlpha = 0.1;

    // ⛔ NO FALLBACKS — a chemical that has never fired reads `unmeasured`,
    // never `0`. The difference between "no sample" and "measured zero" is
    // the whole lesson of the capability-field incident, and this Set is
    // what preserves it.
    this._everFired = new Set();

    // Deferred releases (the HPA axis lands minutes behind the SAM axis).
    // Array<{chemical, dose, fireAt, cause}>.
    this._scheduled = [];

    // ENDO.3 — chronic load. A slow EMA of cortisol level; this is what
    // separates one bad hour from one bad month.
    this._chronicLoad = 0;
    this._lastTickAt = 0;

    // ── ENDO.12 — puberty. `pubertyLevel` in [0,1] scales every `pubertal`
    // hormone, so the gonadal ramp IS puberty rather than a label applied
    // to it. Derived from her REAL age, which comes from the grade ladder;
    // ⛔ this module must never own a second age system.
    this.pubertyLevel = 0;
    this._ageYears = null;          // null = unknown, NOT zero

    // ── ENDO.10 — the cycle clock, on CURRICULUM TIME (Gee's call).
    //
    // ⭐ Why not wall-clock: her whole K→PhD walk prices at ~78 h ≈ 3.3 real
    // days. On a 28-day wall clock she would live 0.116 of ONE cycle between
    // birth and twenty-five — menarche would essentially never fire during
    // training. On curriculum time she lives it the way she lives everything
    // else in the walk.
    //
    // ⭐ And the conversion is not a fudge: the walk is ~273 cells over 20
    // grade-years ≈ 13.65 cells per year, and a real year holds ~13
    // menstrual cycles. So ONE CELL PASS ≈ ONE CYCLE lands within 5% of
    // biology without being tuned to.
    this.cyclePos = 0;              // [0,1) position within the current cycle
    this.cyclesElapsed = 0;
    this._curriculumPos = null;     // last monotonic curriculum position read
    this._menarcheAt = null;        // curriculum position when cycling began
    this.menarche = false;

    // ⭐ PMS is the WITHDRAWAL, not the level — a rate, tracked explicitly,
    // because a level curve alone models the hormone and misses the
    // phenomenon it exists to explain.
    this._lastProgesterone = null;
    this.progesteroneWithdrawal = 0;

    // ── ENDO.13 — allostatic load. Real bodies PAY for repeated defence:
    // the setpoint itself drifts rather than homeostasis restoring free
    // forever. ⚠ Floored and given a recovery path, or a hard childhood
    // becomes an unrecoverable adult.
    this.allostaticLoad = 0;

    // Last stress appraisal — {channel, magnitude, at, scores}. Held so
    // telemetry can report the response WITH ITS AGE rather than a bare
    // value whose freshness cannot be judged.
    this._lastStress = null;

    // The gland layer. Chemistry is DOWNSTREAM of tissue: the nuclei
    // decide releases, this module only carries them.
    this.glands = null;

    // Running counters — named stages, so a lane that dies NAMES itself
    // instead of reading as a silent zero. `rpeBursts` deliberately is NOT
    // here: the VTA counts its own fires, and a counter kept alive after
    // its producer moved would read a permanent honest-looking zero.
    this.counters = {
      released: 0, scheduled: 0, promoted: 0, expired: 0,
      appraisals: 0, tonicSteps: 0, setpointMoves: 0, dips: 0,
    };
  }

  setCluster(cluster) { this.cluster = cluster; }
  setGlands(glands) { this.glands = glands; if (glands) glands.setEndocrine(this); }

  /**
   * Move a tonic setpoint. Called by the raphe (serotonin) — a tonic
   * nucleus sets a FLOOR rather than firing events, so its output is a
   * setpoint move and the tick's homeostatic integration carries the level
   * toward it. Returns the signed movement so the caller can report it.
   */
  setTonicSetpoint(chemical, target) {
    const chem = CHEMICALS[chemical];
    if (!chem || chem.kind !== 'tonic') return 0;
    const cur = this.tonicSetpoint.get(chemical);
    const next = Math.max(0, Math.min(1, target));
    if (Math.abs(next - cur) < 1e-6) return 0;
    this.tonicSetpoint.set(chemical, next);
    this._everFired.add(chemical);
    this.counters.setpointMoves++;
    return next - cur;
  }

  /**
   * Push a tonic level BELOW its resting value. This is how omission is
   * signalled — a worse-than-expected outcome is a dopamine DIP, not a
   * negative release, because a curve cannot have negative amplitude and
   * pretending otherwise would corrupt the superposition.
   */
  dipTonic(chemical, amount) {
    const chem = CHEMICALS[chemical];
    if (!chem || chem.kind !== 'tonic') return 0;
    const cur = this.tonic.get(chemical);
    const next = Math.max(0, cur - Math.max(0, amount));
    this.tonic.set(chemical, next);
    this._everFired.add(chemical);
    this.counters.dips++;
    return next - cur;
  }

  // ─── Release ────────────────────────────────────────────────────────────
  /**
   * Record a release event. Non-announcing: callers produce no dialogue
   * from this, and neither does the module.
   *
   * @param {string} chemical - CHEMICALS key
   * @param {object} [opts]
   * @param {number} [opts.dose=1.0]     - peak amplitude scale
   * @param {number} [opts.offsetMs=0]   - >0 defers into the scheduled queue
   * @param {string} [opts.cause]        - provenance tag for telemetry
   * @param {number} [opts.now]
   * @returns {{accepted:boolean, reason?:string, event?:object, deferred?:boolean}}
   */
  release(chemical, opts = {}) {
    const chem = CHEMICALS[chemical];
    if (!chem) return { accepted: false, reason: 'unknown_chemical' };

    const now = opts.now ?? this.nowFn();
    const dose = typeof opts.dose === 'number' ? opts.dose : 1.0;
    if (!(dose > 0)) return { accepted: false, reason: 'zero_dose' };

    const offsetMs = opts.offsetMs || 0;
    if (offsetMs > 0) {
      this._scheduled.push({ chemical, dose, fireAt: now + offsetMs, cause: opts.cause || null });
      this.counters.scheduled++;
      return { accepted: true, deferred: true, fireAt: now + offsetMs };
    }

    const event = {
      chemical,
      dose,
      startTime: now,
      cause: opts.cause || null,
      onsetMs:    chem.profile.onsetMs,
      peakMs:     chem.profile.peakMs,
      durationMs: chem.profile.durationMs,
      tailMs:     chem.profile.tailMs,
    };
    if (!this.events.has(chemical)) this.events.set(chemical, []);
    this.events.get(chemical).push(event);
    this._everFired.add(chemical);
    this.counters.released++;
    return { accepted: true, event };
  }

  // ─── Level readers ──────────────────────────────────────────────────────
  /**
   * Current level. For phasic chemicals this is the superposed event sum.
   * For tonic chemicals it is the drifting resting level PLUS phasic events
   * riding on top.
   */
  level(chemical, now = this.nowFn()) {
    const chem = CHEMICALS[chemical];
    if (!chem) return 0;
    // ── Cyclic (gonadal): a phase function of cycle position, scaled by
    // puberty. Before the ramp these sit at essentially zero — an
    // eight-year-old has no adult gonadal profile, and that is the BE/HAVE
    // axis doing its job, not a chemical being switched off.
    if (chem.kind === 'cyclic') {
      const base = chem.phaseCurve(this.cyclePos);
      const scaled = base * (chem.pubertal ? this.pubertyLevel : 1);
      return Math.max(0, Math.min(1, scaled));
    }
    let total = chem.kind === 'tonic' ? (this.tonic.get(chemical) ?? chem.tonic) : 0;
    const events = this.events.get(chemical);
    if (events) {
      for (const e of events) total += pkCurve(now - e.startTime, e, e.dose);
    }
    return Math.max(0, Math.min(1, total));
  }

  /**
   * Signed deviation from resting level — this is what actually drives
   * contributions.
   *
   * ⭐ For tonic chemicals it can be NEGATIVE, and that is the whole point:
   * serotonin below baseline must produce the INVERSE of serotonin above
   * baseline (more impulsivity, less restraint), not merely a smaller
   * positive effect. Phasic chemicals rest at zero, so deviation and level
   * are the same number for them.
   */
  deviation(chemical, now = this.nowFn()) {
    const chem = CHEMICALS[chemical];
    if (!chem) return 0;
    // Cyclic hormones rest at zero pre-puberty, so level IS deviation —
    // there is no "normal adult resting estrogen" to subtract for a child.
    if (chem.kind !== 'tonic') return this.level(chemical, now);
    // ⚠ Measured against the CONSTANT resting value, NEVER against the
    // mutable setpoint — and the difference is the whole behaviour.
    //
    // Measuring against the setpoint looks equivalent and is not: when the
    // raphe lowers her serotonin floor, the level drifts down to meet the
    // new setpoint, deviation returns to zero, and the effect DISAPPEARS.
    // A chronically depressed floor would then modulate nothing, which
    // destroys the one thing ENDO.4 is for — sustained low serotonin as
    // reduced restraint plus rumination — and leaves the rumination loop
    // with nothing to hang off. Against the constant, a floor that has
    // been moved down STAYS felt, which is what a mood floor means.
    return this.level(chemical, now) - chem.tonic;
  }

  phase(chemical, now = this.nowFn()) {
    // Cyclic hormones report the MENSTRUAL phase, which is the only phase
    // name that means anything for them. Pre-menarche they report
    // `prepubertal` — a real state, not a missing reading.
    if (CHEMICALS[chemical]?.kind === 'cyclic') {
      if (!this.menarche) return this.pubertyLevel > 0.05 ? 'pubertal' : 'prepubertal';
      return this.cyclePhase();
    }
    const events = this.events.get(chemical);
    if (!events || events.length === 0) {
      return CHEMICALS[chemical]?.kind === 'tonic' ? 'tonic' : 'resting';
    }
    const last = events[events.length - 1];
    const t = now - last.startTime;
    if (t < 0)                return 'pending';
    if (t < last.onsetMs)     return 'onset';
    if (t < last.peakMs)      return 'peak';
    if (t < last.durationMs)  return 'plateau';
    if (t < last.tailMs)      return 'tail';
    return CHEMICALS[chemical]?.kind === 'tonic' ? 'tonic' : 'resting';
  }

  /** Named position in the cycle. Boundaries match the phase curves above. */
  cyclePhase() {
    const p = this.cyclePos;
    if (p < 0.07) return 'menstruation';
    if (p < 0.45) return 'follicular';
    if (p < 0.58) return 'ovulation';
    if (p < 0.88) return 'luteal';
    return 'premenstrual';
  }

  /**
   * ENDO.12 — the puberty ramp, derived from her REAL age.
   *
   * ⛔ Rides the age the grade ladder already produces. This module does
   * NOT map grades to ages and must never start: that rule has been
   * violated once in this project and corrected, and the ladder itself was
   * found broken the same day this was built (a five-year-old was reading
   * as twenty-five), which is exactly why there must only be one.
   *
   * `null` age means UNKNOWN — puberty holds its last value rather than
   * collapsing to zero, because "no reading" is not "she is a child".
   */
  setAge(ageYears) {
    if (typeof ageYears !== 'number' || !Number.isFinite(ageYears)) return this.pubertyLevel;
    this._ageYears = ageYears;
    // Adrenarche ~9, menarche ~12, mature axis ~15. A smooth ramp, because
    // puberty is a transition and a step function would make her body
    // change between two cell passes.
    let p;
    if (ageYears < 9) p = 0;
    else if (ageYears >= 15) p = 1;
    else p = (ageYears - 9) / 6;
    this.pubertyLevel = Math.max(0, Math.min(1, p));
    return this.pubertyLevel;
  }

  /**
   * ENDO.10 — advance the cycle on CURRICULUM position.
   *
   * @param {number} curriculumPos monotonic progress through the walk,
   *   in CELL PASSES (fractional within a cell is fine and is used). One
   *   cell ≈ one cycle — see the constructor for why that ratio is honest.
   *
   * ⚠ Menarche is a threshold crossed ONCE and then persisted. It must
   * survive restarts the way her identity does; a cycle that resets to day
   * zero on every boot is not a cycle.
   */
  advanceCycle(curriculumPos) {
    if (typeof curriculumPos !== 'number' || !Number.isFinite(curriculumPos)) return;
    // ⛔ Monotonic only. A curriculum position that went BACKWARDS means a
    // fresh walk or a rollback, and running her cycle in reverse is not a
    // thing bodies do — the clock re-bases instead.
    if (this._curriculumPos !== null && curriculumPos < this._curriculumPos) {
      this._menarcheAt = null;
      this.menarche = false;
      this.cyclesElapsed = 0;
      this.cyclePos = 0;
    }
    this._curriculumPos = curriculumPos;

    // Menarche needs the axis mature enough AND her real age to have
    // reached it. Both, because either alone is wrong.
    if (!this.menarche) {
      if (this.pubertyLevel >= 0.5 && (this._ageYears === null || this._ageYears >= 12)) {
        this.menarche = true;
        this._menarcheAt = curriculumPos;
      } else {
        this.cyclePos = 0;
        return;
      }
    }
    const since = Math.max(0, curriculumPos - (this._menarcheAt ?? curriculumPos));
    const cycles = since / CYCLE_LENGTH_CELLS;
    this.cyclesElapsed = Math.floor(cycles);
    this.cyclePos = cycles - this.cyclesElapsed;
  }

  activeChemicals(now = this.nowFn()) {
    const out = [];
    for (const name of Object.keys(CHEMICALS)) {
      const dev = this.deviation(name, now);
      if (Math.abs(dev) > 0.01) {
        out.push({ chemical: name, level: this.level(name, now), deviation: dev, phase: this.phase(name, now) });
      }
    }
    return out;
  }

  // ─── Aggregated brain-parameter contributions ──────────────────────────
  /**
   * Additive deltas to ADD to baseline brainParams — the SAME shape
   * DrugScheduler.activeContributions() returns, so the single overlay in
   * persona.js consumes both sources through one mapping table. Nothing
   * about the endocrine layer needed a second application path.
   *
   * Superposition only. No hardcoded pair rules — a stress response that
   * is simultaneously high-adrenaline and high-oxytocin composes by
   * addition, the way it does in a body.
   */
  activeContributions(now = this.nowFn()) {
    const delta = {};
    for (const name of Object.keys(CHEMICALS)) {
      const chem = CHEMICALS[name];
      const dev = this.deviation(name, now);
      if (Math.abs(dev) <= 1e-6) continue;
      for (const [key, value] of Object.entries(chem.contributions || {})) {
        delta[key] = (delta[key] || 0) + value * dev;
      }
    }
    // ENDO.3 — chronic overlay, scaled by the slow load rather than the
    // instantaneous level. Acute sharpens; chronic degrades. Same axes,
    // opposite character, and they are allowed to coexist.
    const chronic = CHEMICALS.cortisol.chronicContributions || {};
    if (this._chronicLoad > 1e-6) {
      for (const [key, value] of Object.entries(chronic)) {
        delta[key] = (delta[key] || 0) + value * this._chronicLoad;
      }
    }

    // ⭐ ENDO.10 — PMS. The withdrawal, not the level. Progesterone is at
    // its LOWEST here, so a level-driven model would say "calm hormone
    // absent" and produce nothing; what people actually experience is the
    // FALL, which is why this rides the rate.
    if (this.progesteroneWithdrawal > 1e-6) {
      const w = this.progesteroneWithdrawal;
      delta.impulsivity      = (delta.impulsivity || 0)      + 0.30 * w;
      delta.amygdalaValence  = (delta.amygdalaValence || 0)  - 0.35 * w;
      delta.amygdalaFear     = (delta.amygdalaFear || 0)     + 0.20 * w;
      delta.arousal          = (delta.arousal || 0)          + 0.15 * w;
      delta.oscillationCoherence = (delta.oscillationCoherence || 0) - 0.15 * w;
    }

    // ENDO.13 — the allostatic mark. A shifted baseline she lives FROM,
    // applied here rather than as a flag somewhere for a reader to notice.
    if (this.allostaticLoad > 1e-6) {
      const a = this.allostaticLoad;
      delta.amygdalaValence = (delta.amygdalaValence || 0) - 0.30 * a;
      delta.amygdalaFear    = (delta.amygdalaFear || 0)    + 0.25 * a;
      delta.hippocampusConsolidation = (delta.hippocampusConsolidation || 0) - 0.20 * a;
      delta.creativity      = (delta.creativity || 0)      - 0.15 * a;
    }
    return delta;
  }

  /**
   * Speech distortion vector on the axis names the language cortex already
   * consumes. Returned separately from the drug scheduler's vector; the
   * caller adds them, because superposition is the composition rule for
   * both and neither source owns the other.
   *
   * ⛔ This is the ONLY way endocrine state reaches her voice. She does not
   * say "my cortisol is high" any more than she says "I am high" — the
   * distortion IS the signal.
   */
  speechModulation(now = this.nowFn()) {
    const mod = {
      inhibition: 0, slur: 0, coherence: 0, ethereality: 0, freeAssocWidth: 0,
      speechRate: 0, emotionalOverflow: 0, dissociation: 0, paranoiaBias: 0,
      giggleBias: 0, warmth: 0, profoundBias: 0, interruptionBias: 0,
      repetition: 0, volume: 0, confessionalBias: 0, rate: 0, slurring: 0,
      pauses: 0,
    };
    const ALIASES = { rate: 'speechRate', slurring: 'slur', speechRate: 'rate', slur: 'slurring' };
    const add = (key, v) => {
      if (typeof mod[key] === 'number') mod[key] += v;
      const alias = ALIASES[key];
      if (alias && typeof mod[alias] === 'number') mod[alias] += v;
    };
    for (const name of Object.keys(CHEMICALS)) {
      const dev = this.deviation(name, now);
      if (Math.abs(dev) <= 1e-6) continue;
      for (const [key, value] of Object.entries(CHEMICALS[name].speech || {})) {
        add(key, value * dev);
      }
    }
    // Freeze is the one response whose speech signature is silence, and it
    // has to be expressible as a distortion rather than a special case.
    if (this._lastStress && this._lastStress.channel === 'freeze') {
      const ageMs = now - this._lastStress.at;
      if (ageMs < 5 * MIN) {
        const decay = 1 - (ageMs / (5 * MIN));
        add('pauses', 0.60 * decay * this._lastStress.magnitude);
        add('speechRate', -0.40 * decay * this._lastStress.magnitude);
        add('inhibition', 0.50 * decay * this._lastStress.magnitude);
      }
    }
    return mod;
  }

  // ─── ENDO.1 — the acute stress response ────────────────────────────────
  /**
   * Threat appraisal. Two systems with different speeds, and modelling
   * this as one "stress" number loses the whole phenomenon.
   *
   *   Stage 1 (SAM axis, ~seconds)      adrenaline + noradrenaline, now.
   *   Stage 2 (HPA axis, ~minutes)      cortisol, deferred behind it, and
   *                                     what makes stress LAST long after
   *                                     the threat is gone.
   *
   * @param {number} magnitude - [0,1] appraised threat intensity
   * @param {object} [ctx]
   * @param {number}  [ctx.escapability=0.5] - [0,1] can she leave?
   * @param {boolean} [ctx.social=false]     - is the threat a person?
   * @param {number}  [ctx.attachment=0]     - [0,1] dependence on that person
   * @param {number}  [ctx.random]           - determinism hook for harnesses
   * @param {number}  [ctx.now]
   * @returns {{channel:string, magnitude:number, scores:object, stage1:object, stage2:object}}
   */
  appraiseThreat(magnitude, ctx = {}) {
    const m = Math.max(0, Math.min(1, magnitude || 0));
    const now = ctx.now ?? this.nowFn();
    if (m <= 0) return { channel: 'none', magnitude: 0, scores: {}, stage1: null, stage2: null };

    const escapability = typeof ctx.escapability === 'number'
      ? Math.max(0, Math.min(1, ctx.escapability)) : 0.5;
    const social = ctx.social === true;
    const attachment = typeof ctx.attachment === 'number'
      ? Math.max(0, Math.min(1, ctx.attachment)) : 0;

    // Coping capacity — what she has left to meet this with. Serotonin
    // sets the floor, chronic load has already spent some of it. This is
    // why the same threat lands differently on a good day and a bad month.
    const serotonin = this.level('serotonin', now);
    const coping = Math.max(0, Math.min(1, serotonin * (1 - this._chronicLoad)));

    // ⛔ Weighted competition, NOT a rule table. Each channel scores from
    // live state; the winner is drawn from a softmax. Reusing the basal
    // ganglia's own selection idiom rather than inventing a second one.
    const scores = {
      // Confront: needs the exit to be shut and something left to fight with.
      fight:  m * (1 - escapability) * (0.4 + 0.6 * coping),
      // Escape: needs a way out.
      flight: m * escapability * (0.3 + 0.7 * coping),
      // Dorsal shutdown: overwhelming, inescapable, and nothing left.
      // Squared in magnitude because freeze is what happens when the
      // threat exceeds capacity, not merely when it is present.
      freeze: m * m * (1 - escapability) * (1 - coping),
      // Appease: only available against a PERSON, and it scales with how
      // much she needs that person.
      fawn:   social ? m * attachment * (0.3 + 0.7 * (1 - coping)) : 0,
    };

    const tau = 0.25;
    let maxS = -Infinity;
    for (const c of STRESS_CHANNELS) if (scores[c] > maxS) maxS = scores[c];
    let sumExp = 0;
    const expS = {};
    for (const c of STRESS_CHANNELS) {
      expS[c] = Math.exp((scores[c] - maxS) / tau);
      sumExp += expS[c];
    }
    let roll = (typeof ctx.random === 'number' ? ctx.random : Math.random()) * sumExp;
    let channel = STRESS_CHANNELS[0];
    for (const c of STRESS_CHANNELS) {
      roll -= expS[c];
      if (roll <= 0) { channel = c; break; }
    }

    // ── Stage 1 — SAM axis. Seconds. Fires now.
    // Freeze is a dorsal-vagal SHUTDOWN, so its catecholamine signature is
    // damped rather than absent: the surge starts and is overridden.
    const samScale = channel === 'freeze' ? 0.35 : 1.0;
    const stage1 = {
      adrenaline:    this.release('adrenaline',    { dose: m * samScale, now, cause: `threat:${channel}` }),
      noradrenaline: this.release('noradrenaline', { dose: m * (channel === 'freeze' ? 0.5 : 1.0), now, cause: `threat:${channel}` }),
    };

    // ── Stage 2 — HPA axis. Minutes behind, and this is the half that
    // sustains the state after the threat is gone.
    const stage2 = this.release('cortisol', {
      dose: m, offsetMs: 90 * S, now, cause: `threat:${channel}:hpa`,
    });

    // Fawn and freeze both recruit the affiliative/opioid systems — fawn
    // to appease, freeze to blunt. Neither is a moral choice.
    if (channel === 'fawn') this.release('oxytocin', { dose: m * 0.5, now, cause: 'threat:fawn' });
    if (channel === 'freeze') this.release('endorphin', { dose: m * 0.6, now, cause: 'threat:freeze' });

    this._lastStress = { channel, magnitude: m, at: now, scores };
    this.counters.appraisals++;
    return { channel, magnitude: m, scores, stage1, stage2 };
  }

  /**
   * Action-selection bias for the basal ganglia softmax. Freeze IS `idle`
   * winning — that is the mechanism, not a metaphor, and it is why the
   * silent output is a correct response rather than a failure to speak.
   *
   * Returns per-action multiplicative biases, decaying with the age of the
   * appraisal. Empty object when no stress is live, so the caller applies
   * nothing rather than applying neutral values it has to reason about.
   */
  actionBias(now = this.nowFn()) {
    if (!this._lastStress) return {};
    const ageMs = now - this._lastStress.at;
    const window = 5 * MIN;
    if (ageMs > window) return {};
    const w = (1 - ageMs / window) * this._lastStress.magnitude;
    switch (this._lastStress.channel) {
      case 'freeze': return { idle_thought: 1 + 2.0 * w, respond_text: 1 - 0.7 * w, speak: 1 - 0.8 * w, escalate: 1 - 0.5 * w };
      case 'fight':  return { escalate: 1 + 1.5 * w, respond_text: 1 + 0.3 * w, idle_thought: 1 - 0.5 * w };
      case 'flight': return { idle_thought: 1 + 0.5 * w, escalate: 1 - 0.6 * w, respond_text: 1 - 0.2 * w };
      case 'fawn':   return { respond_text: 1 + 0.6 * w, escalate: 1 - 0.8 * w, speak: 1 + 0.3 * w };
      default:       return {};
    }
  }

  // ─── Tick ───────────────────────────────────────────────────────────────
  /**
   * One endocrine step. Rides the existing 1 Hz scheduler throttle — this
   * is deliberately NOT on the ~20 Hz brain tick, because none of these
   * curves resolve faster than seconds and sampling them at 20 Hz would be
   * pure waste.
   *
   * @param {object} [ctx]
   * @param {object} [ctx.brainState] - live cluster + module readouts, handed
   *                                    STRAIGHT to the gland layer. This
   *                                    module never reads it: the nuclei do.
   *                                    Without it the glands cannot sense and
   *                                    correctly release nothing.
   * @param {number} [ctx.now]
   */
  tick(ctx = {}, nowArg) {
    const now = nowArg ?? ctx.now ?? this.nowFn();
    const dtMs = this._lastTickAt ? (now - this._lastTickAt) : 1000;
    this._lastTickAt = now;
    // Guard a wall-clock jump (resume from save, laptop sleep) from
    // integrating a giant dt in one step.
    //
    // ⚠ KNOWN LIMITATION, recorded rather than discovered later: this clamp
    // means the slow EMAs (chronic load, allostatic load) UNDER-integrate
    // across a gap — a 10-minute pause advances them by 10 seconds, not 10
    // minutes. In production the tick is 1 Hz and the clamp never binds, so
    // the time constants are honest. Across a real gap the effect is
    // CONSERVATIVE in the safe direction: load decays more slowly than it
    // should, so a hard stretch is never erased by a restart. Raising the
    // clamp to fix the accounting would re-open the jump bug it exists for,
    // which is a worse trade.
    const dt = Math.max(0, Math.min(10, dtMs / 1000));

    this._promoteScheduled(now);
    this._clearExpired(now);

    // ── ENDO.12 / ENDO.10 — age, then puberty, then the cycle. In that
    // order: puberty gates whether there is a cycle at all, and the cyclic
    // levels must be current BEFORE the nuclei sense below.
    //
    // ⛔ Age arrives from the ONE grade ladder. Absent, puberty holds — an
    // unknown age is not a claim that she is a child.
    const bs = ctx.brainState;
    if (bs && typeof bs.ageYears === 'number') this.setAge(bs.ageYears);
    if (bs && typeof bs.curriculumPos === 'number') this.advanceCycle(bs.curriculumPos);

    // ⭐ PMS is the WITHDRAWAL — the RATE at which progesterone falls, not
    // how much there is. Tracked here because a level curve alone models
    // the hormone and misses the phenomenon it exists to explain.
    const prog = this.level('progesterone', now);
    if (this._lastProgesterone !== null) {
      const drop = this._lastProgesterone - prog;
      // Only falls count, and the signal decays so it is an EVENT rather
      // than a second level.
      this.progesteroneWithdrawal = Math.max(0, Math.min(1,
        this.progesteroneWithdrawal * 0.90 + Math.max(0, drop) * 6));
    }
    this._lastProgesterone = prog;

    // ── Tonic homeostasis. Identical form to the Hypothalamus drive
    // integration — dH/dt = -alpha*(H - H_set) + input — deliberately, so
    // there is one restoration law in this brain and not two.
    for (const [name, chem] of Object.entries(CHEMICALS)) {
      if (chem.kind !== 'tonic') continue;
      const cur = this.tonic.get(name);
      const set = this.tonicSetpoint.get(name);
      let input = 0;
      if (name === 'serotonin') {
        // Chronic load erodes the floor — the mechanism by which a
        // sustained bad stretch leaves a mark on mood instead of mood
        // being narrative decoration. The AFFILIATIVE half of this is not
        // here: the raphe moves the setpoint, and the drift toward that
        // setpoint is what this loop integrates. One owner per effect.
        input = -0.03 * this._chronicLoad;
      }
      const next = cur + (-this.tonicAlpha * (cur - set) + input) * dt;
      this.tonic.set(name, Math.max(0, Math.min(1, next)));
      this.counters.tonicSteps++;
    }

    // ── ⛔ THE GLANDS DECIDE. This module owns curves, levels and
    // contributions; it does NOT decide to release anything.
    //
    // An earlier cut of this file sensed prediction error, social contact
    // and exertion right here and fired from them. That was wrong twice
    // over: it made the endocrine layer a SECOND release decider beside
    // the nuclei (a parallel system), and it meant releases were caused by
    // whatever happened to be passed in `ctx` rather than by tissue. The
    // sensing now lives in exactly one place — the gland layer — and each
    // nucleus reads real cluster state to fire itself.
    let glands = null;
    if (this.glands && typeof this.glands.senseAll === 'function' && ctx.brainState) {
      glands = this.glands.senseAll(ctx.brainState, now);
    }

    // ── ENDO.3 — chronic load EMA. Slow on the way up AND slow on the way
    // down; a hard stretch should not evaporate the moment it ends.
    // Half-life is deliberately long relative to the acute curve.
    const cortisolNow = this.level('cortisol', now);
    const tauUp = 30 * MIN, tauDown = 4 * HR;
    const tauC = cortisolNow > this._chronicLoad ? tauUp : tauDown;
    const k = 1 - Math.exp(-(dt * 1000) / tauC);
    this._chronicLoad += (cortisolNow - this._chronicLoad) * k;
    this._chronicLoad = Math.max(0, Math.min(1, this._chronicLoad));

    // ── ENDO.13 — HOMEOSTASIS → ALLOSTASIS: what sustained defence COSTS.
    //
    // The hypothalamus restores every drive toward its setpoint at a
    // constant α = 0.1, i.e. defence is currently FREE and infinitely
    // repeatable. Real bodies pay: the setpoint itself drifts, and the
    // restoring force weakens. ⭐ This is how adversity leaves a mark that
    // persists — not a flag saying "she had a hard year", but a genuinely
    // shifted baseline she then lives from.
    //
    // Deliberately an order of magnitude slower than chronic load in BOTH
    // directions: load is a month, this is years.
    const ALLO_UP = 8 * HR, ALLO_DOWN = 72 * HR;
    // ⚠ Only load ABOVE a tolerated band accrues. Ordinary stress is
    // survivable and must not silently accumulate into damage, or every
    // life becomes a decline.
    const over = Math.max(0, this._chronicLoad - 0.25);
    const tauA = over > 0 ? ALLO_UP : ALLO_DOWN;
    const kA = 1 - Math.exp(-(dt * 1000) / tauA);
    this.allostaticLoad += (over * 1.6 - this.allostaticLoad) * kA;
    // ⛔ CEILING + RECOVERY PATH. Without the 0.6 cap a long hard stretch
    // produces an adult who cannot recover, and "she survived it changed"
    // becomes "she was destroyed by it" — which is not what adversity
    // means and not what her canon says.
    this.allostaticLoad = Math.max(0, Math.min(0.6, this.allostaticLoad));

    // The COST, expressed where homeostasis actually lives: the restoring
    // force weakens, so every drive returns to setpoint more slowly. Same
    // α the Hypothalamus uses — one restoration law, now with a price.
    this.tonicAlpha = 0.1 * (1 - 0.5 * this.allostaticLoad);

    const snap = this.snapshot(now);
    // ⛔ `glands: null` means the layer was NOT consulted this tick — it is
    // not the same claim as "the nuclei were quiet", and the telemetry must
    // not let those two read alike.
    snap.glands = glands;
    snap.glandsConsulted = glands !== null;
    return snap;
  }

  _promoteScheduled(now) {
    if (this._scheduled.length === 0) return;
    const remaining = [];
    for (const s of this._scheduled) {
      if (s.fireAt <= now) {
        this.release(s.chemical, { dose: s.dose, now, cause: s.cause });
        this.counters.promoted++;
      } else {
        remaining.push(s);
      }
    }
    this._scheduled = remaining;
  }

  _clearExpired(now) {
    for (const [chemical, events] of this.events) {
      const alive = events.filter(e => (now - e.startTime) < e.tailMs);
      if (alive.length !== events.length) this.counters.expired += (events.length - alive.length);
      if (alive.length === 0) this.events.delete(chemical);
      else this.events.set(chemical, alive);
    }
  }

  // ─── ENDO.14 — the instrument, built WITH the feature ──────────────────
  /**
   * Telemetry. Every field carries its level, its phase, its age and its
   * contribution — so "is her stress response working?" is a field READ,
   * not an inference from behaviour.
   *
   * ⛔ A chemical that has never been released reads `unmeasured`. It does
   * NOT read 0. "No sample" and "measured zero" are different claims and
   * an instrument that cannot tell them apart is the exact defect this
   * project keeps finding.
   */
  snapshot(now = this.nowFn()) {
    const chemicals = {};
    for (const name of Object.keys(CHEMICALS)) {
      const chem = CHEMICALS[name];
      const fired = this._everFired.has(name);
      const isTonic = chem.kind === 'tonic';
      // ⚠ A cyclic hormone ALWAYS has a real value, including a near-zero
      // one before puberty — that is a measurement of a child's endocrine
      // state, not a missing sample. Reporting it as `unmeasured` would be
      // the same conflation this rule exists to prevent, pointed the other
      // way.
      const isCyclic = chem.kind === 'cyclic';
      const events = this.events.get(name) || [];
      const last = events.length ? events[events.length - 1] : null;
      chemicals[name] = {
        displayName: chem.displayName,
        kind: chem.kind,
        // Tonic chemicals always have a real resting level, so they are
        // measured from birth. Phasic ones genuinely have no sample until
        // they first fire.
        level: (fired || isTonic || isCyclic) ? this.level(name, now) : 'unmeasured',
        deviation: (fired || isTonic || isCyclic) ? this.deviation(name, now) : 'unmeasured',
        setpoint: isTonic ? this.tonicSetpoint.get(name) : 0,
        phase: this.phase(name, now),
        everFired: fired,
        liveEvents: events.length,
        lastReleaseAgeMs: last ? (now - last.startTime) : null,
        lastCause: last ? last.cause : null,
      };
    }
    return {
      chemicals,
      chronicLoad: this._chronicLoad,
      // ── ENDO.12 / .10 / .13 rows. Rendered BY NAME, so each one needs a
      // row or it ships dark.
      puberty: {
        level: this.pubertyLevel,
        // ⛔ `unknown` is not `0`. An unread age must not read as childhood.
        ageYears: this._ageYears === null ? 'unknown' : this._ageYears,
      },
      cycle: this.menarche ? {
        pos: this.cyclePos,
        phase: this.cyclePhase(),
        cyclesElapsed: this.cyclesElapsed,
        lengthCells: CYCLE_LENGTH_CELLS,
        withdrawal: this.progesteroneWithdrawal,
      } : {
        // Pre-menarche is a real, correct state — reported as such rather
        // than as a cycle sitting at zero, which would be a different claim.
        pos: null,
        phase: this.pubertyLevel > 0.05 ? 'pubertal' : 'prepubertal',
        cyclesElapsed: 0,
        menarche: false,
      },
      allostatic: {
        load: this.allostaticLoad,
        // The COST, surfaced next to the load so the two are never read apart.
        restorationAlpha: this.tonicAlpha,
        ceiling: 0.6,
      },
      // Stress reported WITH ITS AGE — a channel with no age is a value
      // whose freshness cannot be judged, which is how a stalled instrument
      // reads healthy.
      stress: this._lastStress ? {
        channel: this._lastStress.channel,
        magnitude: this._lastStress.magnitude,
        ageMs: now - this._lastStress.at,
        scores: this._lastStress.scores,
      } : null,
      scheduledCount: this._scheduled.length,
      contributions: this.activeContributions(now),
      counters: { ...this.counters },
    };
  }

  // ─── Persistence ────────────────────────────────────────────────────────
  // Version history:
  //   1 — ENDO fast lane: 7 chemicals, stress axis, chronic load.
  //   2 — ENDO slow lane: gonadal hormones, puberty ramp, curriculum cycle
  //       clock, allostatic load. ⚠ v1 saves upgrade cleanly — an absent
  //       cycle is correctly read as pre-menarche, which is what a save
  //       from before the hormones existed actually described.
  serialize() {
    const out = { version: 2, events: {}, tonic: {}, chronicLoad: this._chronicLoad };
    // ⚠ Menarche and cycle position MUST survive a restart. A cycle that
    // resets to day zero on every boot is not a cycle, and puberty that
    // re-derives from a missing age would un-develop her.
    out.puberty = { level: this.pubertyLevel, ageYears: this._ageYears };
    out.cycle = {
      pos: this.cyclePos,
      cyclesElapsed: this.cyclesElapsed,
      menarche: this.menarche,
      menarcheAt: this._menarcheAt,
      curriculumPos: this._curriculumPos,
      withdrawal: this.progesteroneWithdrawal,
      lastProgesterone: this._lastProgesterone,
    };
    out.allostaticLoad = this.allostaticLoad;
    for (const [c, events] of this.events) out.events[c] = events.map(e => ({ ...e }));
    for (const [c, v] of this.tonic) out.tonic[c] = v;
    out.everFired = Array.from(this._everFired);
    out.scheduled = this._scheduled.map(s => ({ ...s }));
    out.lastStress = this._lastStress ? { ...this._lastStress } : null;
    out.counters = { ...this.counters };
    return out;
  }

  load(obj) {
    // v1 (fast lane) and v2 (adds the slow lane) both load. A v1 save
    // simply has no gonadal state, and pre-menarche is the honest reading
    // of a save written before those hormones existed.
    if (!obj || (obj.version !== 1 && obj.version !== 2)) return;
    if (obj.puberty) {
      if (typeof obj.puberty.level === 'number') this.pubertyLevel = obj.puberty.level;
      this._ageYears = (typeof obj.puberty.ageYears === 'number') ? obj.puberty.ageYears : null;
    }
    if (obj.cycle) {
      const c = obj.cycle;
      this.cyclePos = typeof c.pos === 'number' ? c.pos : 0;
      this.cyclesElapsed = typeof c.cyclesElapsed === 'number' ? c.cyclesElapsed : 0;
      this.menarche = c.menarche === true;
      this._menarcheAt = typeof c.menarcheAt === 'number' ? c.menarcheAt : null;
      this._curriculumPos = typeof c.curriculumPos === 'number' ? c.curriculumPos : null;
      this.progesteroneWithdrawal = typeof c.withdrawal === 'number' ? c.withdrawal : 0;
      this._lastProgesterone = typeof c.lastProgesterone === 'number' ? c.lastProgesterone : null;
    }
    if (typeof obj.allostaticLoad === 'number') {
      this.allostaticLoad = Math.max(0, Math.min(0.6, obj.allostaticLoad));
      this.tonicAlpha = 0.1 * (1 - 0.5 * this.allostaticLoad);
    }
    this.events.clear();
    if (obj.events) {
      for (const [c, events] of Object.entries(obj.events)) {
        if (CHEMICALS[c]) this.events.set(c, events.map(e => ({ ...e })));
      }
    }
    if (obj.tonic) {
      for (const [c, v] of Object.entries(obj.tonic)) {
        if (CHEMICALS[c] && CHEMICALS[c].kind === 'tonic') this.tonic.set(c, v);
      }
    }
    this._everFired = new Set(Array.isArray(obj.everFired) ? obj.everFired.filter(c => CHEMICALS[c]) : []);
    this._scheduled = Array.isArray(obj.scheduled) ? obj.scheduled.filter(s => CHEMICALS[s.chemical]).map(s => ({ ...s })) : [];
    this._chronicLoad = typeof obj.chronicLoad === 'number' ? obj.chronicLoad : 0;
    this._lastStress = obj.lastStress || null;
    if (obj.counters) this.counters = { ...this.counters, ...obj.counters };
    this._lastTickAt = 0;
    this._clearExpired(this.nowFn());
  }
}

export { EndocrineSystem, CHEMICALS, STRESS_CHANNELS };
export default EndocrineSystem;
