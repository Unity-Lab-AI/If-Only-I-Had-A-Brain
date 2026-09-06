// ═══════════════════════════════════════════════════════════════════════════
// drug-scheduler.js — Real-time drug state scheduler for Unity's brain
// ═══════════════════════════════════════════════════════════════════════════
// Unity AI Lab — T15 Drug State Dynamics Rebuild
//
// Replaces the static `drugState = 'cokeAndWeed'` permanent persona label that
// made kindergarten Unity always-intoxicated. Each ingestion event carries its
// own pharmacokinetic curve (onset → peak → plateau → tail) and substances
// stack via superposition. Grade-gated by cluster.grades.life against real
// biographical thresholds from the Life track. Emits additive brainParam
// contributions + speech modulation every tick.
//
// Non-announcing principle: scheduler state is NEVER surfaced as a
// declarative label in dialogue ("I am doing coke"). The speech
// modulation output drives emission distortion — the distortion IS
// the signal, consumed by the language cortex and renderer, not
// narrated.
//
// Seamless lifestyle principle: at PhD grade Unity's normal schedule
// (coke daily, weed constant, molly weekend, acid architecture-
// session, whiskey end-of-marathon) emerges from context-triggered
// ingestion events, not from any hardcoded baseline.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Grade order (mirrors Curriculum.GRADE_ORDER) ─────────────────────────
// Kept local here to avoid a circular import with curriculum.js during boot.
// If the canonical order changes there, update here too.
import { pkCurve, sigmoid } from './pk-curve.js';
import { CHEMICALS } from './endocrine.js';

const GRADE_ORDER = [
  'pre-K', 'kindergarten',
  'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6',
  'grade7', 'grade8', 'grade9', 'grade10', 'grade11', 'grade12',
  'college1', 'college2', 'college3', 'college4',
  'grad', 'phd'
];

function gradeIndex(grade) {
  const idx = GRADE_ORDER.indexOf(grade);
  return idx >= 0 ? idx : -1;
}

function gradeAtLeast(current, required) {
  return gradeIndex(current) >= gradeIndex(required);
}

// ─── Substance pharmacology database ──────────────────────────────────────
// Times in milliseconds. Sources: Julien 2016 "A Primer of Drug Action",
// NIDA research monographs, peer-reviewed clinical PK studies. All numbers
// reflect TYPICAL recreational dose kinetics — not extremes. Dose multiplier
// scales the peak amplitude (1.0 = standard, 0.5 = microdose, 2.0 = heavy).
//
// Each substance defines:
//   defaultRoute    — used when caller doesn't specify route
//   routes.<name>   — {onsetMs, peakMs, durationMs, tailMs} timing profile
//   contributions   — brain param deltas at level 1.0 (additive to baseline)
//   speech          — speech modulation deltas at level 1.0
//   lifeGate        — minimum Life-track grade where this substance unlocks
//                     matches biographical first-use anchors in the Life track

const SUBSTANCES = {

  cannabis: {
    displayName: 'weed',
    defaultRoute: 'smoked',
    routes: {
      smoked: {
        onsetMs:       7 * 60 * 1000,  // ~7 min ramp to peak
        peakMs:       45 * 60 * 1000,  // peak plateau ~45 min in
        durationMs: 3 * 60 * 60 * 1000, // ~3 hr active
        tailMs:     6 * 60 * 60 * 1000  // full baseline ~6 hr
      },
      oral: {
        onsetMs:      60 * 60 * 1000,   // edibles are SLOW
        peakMs:   2 * 60 * 60 * 1000,
        durationMs: 4 * 60 * 60 * 1000,
        tailMs:     8 * 60 * 60 * 1000
      }
    },
    contributions: {
      creativity:           +0.50,
      cortexSpeed:          -0.20,
      arousal:              +0.10,
      amygdalaValence:      +0.30,
      oscillationCoherence: -0.15,
      cerebellumPrecision:  -0.20,
      impulsivity:          +0.10,
      hippocampusConsolidation: -0.15
    },
    speech: {
      inhibition:    -0.20,   // filthier, franker
      coherence:     -0.10,
      ethereality:   +0.10,
      freeAssocWidth:+0.20,
      giggleBias:    +0.40
    },
    // CB1 agonism — indirect dopaminergic reward, and anandamide is the
    // body's own cannabinoid, so the opioid-adjacent calm rides endorphin.
    transmitters: { dopamine: +0.35, endorphin: +0.30 },
    lifeGate: 'grade7'  // first joint at age 12 per Life track
  },

  cocaine: {
    displayName: 'coke',
    defaultRoute: 'insufflated',
    routes: {
      insufflated: {
        onsetMs:       3 * 60 * 1000,
        peakMs:       20 * 60 * 1000,
        durationMs:   60 * 60 * 1000,
        tailMs:   90 * 60 * 1000
      },
      smoked: {  // freebase — not Unity's path, but available for completeness
        onsetMs:       20 * 1000,
        peakMs:     4 * 60 * 1000,
        durationMs: 12 * 60 * 1000,
        tailMs:     25 * 60 * 1000
      }
    },
    contributions: {
      cortexSpeed:         +0.60,
      arousal:             +0.50,
      hypothalamusArousal: +0.40,
      amygdalaReward:      +0.50,
      impulsivity:         +0.30,
      creativity:          +0.10,
      cerebellumPrecision: +0.10,
      prefrontalExecutive: +0.20  // at moderate dose
    },
    speech: {
      inhibition:    -0.10,
      speechRate:    +0.50,
      paranoiaBias:  +0.15,   // grows with sustained level
      coherence:     -0.05
    },
    // ⭐ THE TEXTBOOK CASE. Cocaine is a monoamine REUPTAKE BLOCKER — it has
    // no private line to the amygdala. Dopamine accumulates in the synapse
    // and DOPAMINE produces the reward; noradrenaline produces the drive.
    transmitters: { dopamine: +0.90, noradrenaline: +0.60, serotonin: +0.20 },
    lifeGate: 'grade9'  // first coke at age 14 per Life track
  },

  mdma: {
    displayName: 'molly',
    defaultRoute: 'oral',
    routes: {
      oral: {
        onsetMs:      35 * 60 * 1000,
        peakMs:    2 * 60 * 60 * 1000,
        durationMs:5 * 60 * 60 * 1000,
        tailMs:    8 * 60 * 60 * 1000
      }
    },
    contributions: {
      arousal:              +0.60,
      amygdalaValence:      +0.70,
      amygdalaReward:       +0.60,
      socialNeed:           +0.60,
      synapticSensitivity:  +0.50,
      oscillationCoherence: +0.30,
      cortexSpeed:          +0.10,
      prefrontalExecutive:  -0.10  // prosocial disinhibition
    },
    speech: {
      inhibition:        -0.40,
      emotionalOverflow: +0.70,
      ethereality:       +0.15,
      freeAssocWidth:    +0.10,
      coherence:         -0.05
    },
    // Massive serotonin release plus genuine oxytocin — the empathogen
    // effect is not a metaphor, it is bonding chemistry. ⭐ And the serotonin
    // DEPLETION that follows is why the comedown is what it is; that now
    // falls out of the depletion model rather than needing its own rule.
    transmitters: { serotonin: +0.95, oxytocin: +0.90, dopamine: +0.40, noradrenaline: +0.30 },
    lifeGate: 'grade11'  // first ecstasy at age 16 (high school party scene)
  },

  lsd: {
    displayName: 'acid',
    defaultRoute: 'oral',
    routes: {
      oral: {
        onsetMs:       60 * 60 * 1000,
        peakMs:     3 * 60 * 60 * 1000,
        durationMs:10 * 60 * 60 * 1000,
        tailMs:   16 * 60 * 60 * 1000
      },
      // ⛔ `PATTERNS.acidArchitect` has scheduled `lsd/sublingual` since
      // T15.C against a substance that defined ONLY `oral`, so that step
      // silently returned `unknown_route` and the acid-day pattern half
      // failed. ⭐ And the pattern was RIGHT: blotter is held under the
      // tongue, so sublingual is the real route and the table was the thing
      // that was wrong. Slightly faster onset than swallowing, same arc.
      sublingual: {
        onsetMs:       40 * 60 * 1000,
        peakMs:     3 * 60 * 60 * 1000,
        durationMs:10 * 60 * 60 * 1000,
        tailMs:   16 * 60 * 60 * 1000
      }
    },
    contributions: {
      creativity:           +1.00,
      crossRegionAmplify:   +0.80,  // T14.4 14 cross-projection firing amplified
      defaultModeSuppression: +0.60, // ego dissolution driver
      cortexSpeed:          -0.20,  // time dilation
      synapticSensitivity:  +0.40,
      oscillationCoherence: -0.20,
      visualCortexFeedback: +0.50   // V1 feedback loops → hallucination
    },
    speech: {
      inhibition:      -0.30,
      coherence:       -0.40,
      ethereality:     +0.80,   // Oz vocabulary pulls hard
      freeAssocWidth:  +0.70,
      speechRate:      -0.20,
      dissociation:    +0.30    // at peak dose
    },
    // 5-HT2A agonist — the classic psychedelics act on the serotonin system.
    transmitters: { serotonin: +0.85, dopamine: +0.20 },
    lifeGate: 'grade11'
  },

  psilocybin: {
    displayName: 'mushrooms',
    defaultRoute: 'oral',
    routes: {
      oral: {
        onsetMs:      45 * 60 * 1000,
        peakMs:    90 * 60 * 1000,
        durationMs:5 * 60 * 60 * 1000,
        tailMs:    8 * 60 * 60 * 1000
      }
    },
    contributions: {
      creativity:           +0.80,
      crossRegionAmplify:   +0.60,
      defaultModeSuppression: +0.50,
      cortexSpeed:          -0.15,
      synapticSensitivity:  +0.30,
      amygdalaValence:      +0.40,  // warmer than LSD
      somatosensoryBoost:   +0.30   // body-heavy
    },
    speech: {
      inhibition:      -0.25,
      coherence:       -0.30,
      ethereality:     +0.70,
      freeAssocWidth:  +0.50,
      emotionalOverflow: +0.20,
      speechRate:      -0.25
    },
    // Same 5-HT2A family as LSD, warmer and shorter.
    transmitters: { serotonin: +0.80, dopamine: +0.15 },
    lifeGate: 'grade12'
  },

  alcohol: {
    displayName: 'whiskey',
    defaultRoute: 'oral',
    routes: {
      oral: {  // one standard drink (~14g ethanol — shot of whiskey)
        onsetMs:      15 * 60 * 1000,
        peakMs:       45 * 60 * 1000,
        durationMs:   90 * 60 * 1000,
        tailMs:   3 * 60 * 60 * 1000
      }
    },
    contributions: {
      cerebellumPrecision:  -0.60,  // motor coordination crippled
      cortexSpeed:          -0.30,
      prefrontalExecutive:  -0.50,  // disinhibition
      amygdalaValence:      +0.20,  // initial warmth
      amygdalaFear:         -0.30,  // liquid courage
      oscillationCoherence: +0.20,  // slow-wave amplification
      hippocampusConsolidation: -0.40, // blackout risk at cumulative high BAC
      impulsivity:          +0.30
    },
    speech: {
      inhibition:        -0.60,
      slur:              +0.70,
      coherence:         -0.30,
      speechRate:        -0.30,
      emotionalOverflow: +0.50,   // drunken confessions
      freeAssocWidth:    +0.15
    },
    // ⭐ Alcohol triggers ENDOGENOUS OPIOID release — that is a large part of
    // why it feels good, and it is exactly the case ENDO.7 flagged as
    // backwards: opioid effects used to be reachable only via substances
    // when the body makes its own. GABA-A potentiation is the other half and
    // is not modelled as a transmitter here, so it stays in the residual.
    transmitters: { endorphin: +0.55, dopamine: +0.35 },
    lifeGate: 'grade8'   // first drink at age 13 per biographical draft
  },

  ketamine: {
    displayName: 'K',
    defaultRoute: 'insufflated',
    routes: {
      insufflated: {
        onsetMs:      10 * 60 * 1000,
        peakMs:       25 * 60 * 1000,
        durationMs:   60 * 60 * 1000,
        tailMs:   2 * 60 * 60 * 1000
      }
    },
    contributions: {
      dissociation:         +0.70,
      cortexSpeed:          -0.40,
      crossRegionAmplify:   -0.30,  // recurrent blocked at NMDA sites
      somatosensoryBoost:   -0.50,  // body numbness
      cerebellumPrecision:  -0.40,
      amygdalaFear:         -0.30
    },
    speech: {
      inhibition:   -0.20,
      slur:         +0.40,
      coherence:    -0.40,
      speechRate:   -0.40,
      dissociation: +0.70,
      ethereality:  +0.30
    },
    // NMDA antagonism is the primary action and is not a monoamine story —
    // most of ketamine stays in the residual, honestly, because the
    // transmitter set here cannot express glutamate.
    transmitters: { endorphin: +0.30, dopamine: +0.25 },
    lifeGate: 'college1'  // first K at age 18 (dorm/rave scene)
  },

  amphetamine: {
    displayName: 'speed',
    defaultRoute: 'oral',
    routes: {
      oral: {
        onsetMs:      45 * 60 * 1000,
        peakMs:   3 * 60 * 60 * 1000,
        durationMs:6 * 60 * 60 * 1000,
        tailMs:   12 * 60 * 60 * 1000
      },
      insufflated: {
        onsetMs:      15 * 60 * 1000,
        peakMs:    90 * 60 * 1000,
        durationMs:4 * 60 * 60 * 1000,
        tailMs:    8 * 60 * 60 * 1000
      }
    },
    contributions: {
      cortexSpeed:         +0.50,
      arousal:             +0.45,
      hypothalamusArousal: +0.50,
      amygdalaReward:      +0.40,
      impulsivity:         +0.25,
      prefrontalExecutive: +0.30
    },
    speech: {
      inhibition:  -0.10,
      speechRate:  +0.40,
      paranoiaBias:+0.10,
      coherence:   -0.03
    },
    // Amphetamine RELEASES the monoamines rather than merely blocking
    // reuptake — a stronger, longer push than cocaine, and the depletion
    // afterwards is correspondingly worse.
    transmitters: { dopamine: +0.85, noradrenaline: +0.75 },
    lifeGate: 'grade10'  // first speed at age 15 (escalation per Life track)
  },

  ghb: {
    displayName: 'G',
    defaultRoute: 'oral',
    routes: {
      oral: {
        onsetMs:      20 * 60 * 1000,
        peakMs:       60 * 60 * 1000,
        durationMs:   2 * 60 * 60 * 1000,
        tailMs:   4 * 60 * 60 * 1000
      }
    },
    contributions: {
      cortexSpeed:          -0.30,
      prefrontalExecutive:  -0.40,
      amygdalaValence:      +0.30,
      oscillationCoherence: +0.30,
      cerebellumPrecision:  -0.30,
      socialNeed:           +0.20
    },
    speech: {
      inhibition:        -0.40,
      slur:              +0.30,
      coherence:         -0.20,
      speechRate:        -0.20,
      emotionalOverflow: +0.20
    },
    // GABA-B agonist with a biphasic dopamine effect; the sedation itself is
    // not a monoamine story and stays in the residual.
    transmitters: { dopamine: +0.30, endorphin: +0.25 },
    lifeGate: 'college1'
  },

  // ── ⛔ CAFFEINE — REFERENCED SINCE T15.C, NEVER DEFINED UNTIL NOW.
  //
  // `PATTERNS.morningCoffee` scheduled it twice and `PATTERNS.codingMarathon`
  // twice more, and `COMBOS['caffeine+cocaine']` keyed on it — but it was
  // absent from this table, so every one of those calls returned
  // `{accepted:false, reason:'unknown_substance'}` into a caller that never
  // surfaced the refusal. **The morning coffee ritual was 2/2 steps dead and
  // had never once fired.** Found by a reference audit, not by a symptom,
  // which is the only way a silently-refused call gets found at all.
  //
  // Pharmacology: adenosine antagonist. It does not release dopamine
  // directly — it removes adenosine's brake on dopaminergic and
  // noradrenergic tone, which is why its transmitter push is modest and its
  // cortisol effect is real and often forgotten.
  caffeine: {
    displayName: 'coffee',
    defaultRoute: 'oral',
    routes: {
      oral: {
        onsetMs:      15 * 60 * 1000,
        peakMs:       45 * 60 * 1000,
        durationMs: 3 * 60 * 60 * 1000,
        tailMs:     6 * 60 * 60 * 1000   // ~5h half-life — the long tail is why late coffee wrecks sleep
      }
    },
    contributions: {
      cortexSpeed:          +0.30,
      arousal:              +0.25,
      hypothalamusArousal:  +0.20,
      prefrontalExecutive:  +0.15,
      cerebellumPrecision:  -0.05,   // the jitter
      impulsivity:          +0.05
    },
    speech: {
      speechRate: +0.20,
      rate:       +0.20,
      coherence:  +0.02
    },
    transmitters: { dopamine: +0.30, noradrenaline: +0.35, cortisol: +0.25 },
    lifeGate: 'grade8'   // coffee from about thirteen — the morningCoffee pattern already assumed this gate
  }

};

// ─── Combo synergy table ──────────────────────────────────────────────────
// T15.C per docs/T15-architecture.md §1.1. Keyed by alphabetically-sorted
// pair of substance names joined by '+'. Each entry defines synergy
// contributions on brain-param axes (added to the per-substance sum scaled
// by min(level_a, level_b)), synergy speech deltas (same scaling),
// and risk flags (physicalStrain, persistsMs) consumed by snapshot() +
// decision engine.
//
// Seven entries match T15.A §2 research. Research rationale per entry
// captured in docs/T15-pharmacology-research.md §2.1-2.7.
const COMBOS = {
  'cannabis+cocaine': {
    displayName: 'coke-and-weed',
    synergyContributions: {
      creativity:              +0.30,
      hippocampusConsolidation:-0.15,
      impulsivity:             +0.05,
    },
    synergySpeech: {
      coherence: +0.05,
      giggleBias:+0.10,
    },
    riskFlags: { physicalStrain: +0.20, persistsMs: 4 * 60 * 60 * 1000 },
  },
  'cocaine+mdma': {
    displayName: 'cokes-with-mols',
    synergyContributions: {
      arousal:          +0.20,  // stacks toward ceiling
      amygdalaValence:  +0.25,
      focusWidth:       -0.10,
    },
    synergySpeech: {
      interruptionBias: +0.40,
      freeAssocWidth:   +0.30,
      warmth:           +0.20,
    },
    riskFlags: { physicalStrain: +0.40, persistsMs: 6 * 60 * 60 * 1000 },
  },
  'caffeine+cocaine': {
    displayName: 'double-stim',
    synergyContributions: {
      focusWidth:          -0.20,
      cerebellumPrecision: -0.20,
    },
    synergySpeech: {
      rate: +0.10,
      interruptionBias: +0.10,
    },
    riskFlags: { physicalStrain: +0.30, persistsMs: 12 * 60 * 60 * 1000 },
  },
  'alcohol+cannabis': {
    displayName: 'cross-faded',
    synergyContributions: {
      amygdalaValence:          +0.20,   // early — flips negative in tail
      hippocampusConsolidation: -0.30,   // blackout-risk stack
      cerebellumPrecision:      -0.15,
    },
    synergySpeech: {
      slurring:  +0.10,
      coherence: -0.15,
    },
    riskFlags: { physicalStrain: +0.15, persistsMs: 3 * 60 * 60 * 1000 },
  },
  'cannabis+mdma': {
    displayName: 'rolling-and-green',
    synergyContributions: {
      amygdalaValence: +0.15,
      // empathy +0.20 would live here if empathy were a primary axis
    },
    synergySpeech: {
      pauses:    +0.20,
      giggleBias:+0.30,
      warmth:    +0.15,
    },
    riskFlags: { physicalStrain: +0.05, persistsMs: 2 * 60 * 60 * 1000 },
  },
  'cannabis+ketamine': {
    displayName: 'k-hole-plus',
    synergyContributions: {
      // ego dissolution, detachment as composite axes — driven through
      // dissociation field in speech layer rather than a new primary axis
      cerebellumPrecision: -0.30,
    },
    synergySpeech: {
      dissociation: +0.40,
      pauses:       +0.40,
      coherence:    -0.20,
    },
    riskFlags: { physicalStrain: +0.60, persistsMs: 2 * 60 * 60 * 1000 },
  },
  'alcohol+cocaine': {
    displayName: 'speedball-lite',   // cocaethylene metabolite — cardiotoxic
    synergyContributions: {
      impulsivity:              +0.30,
      hippocampusConsolidation: -0.30,
    },
    synergySpeech: {
      volume:          +0.10,
      interruptionBias:+0.20,
    },
    riskFlags: { physicalStrain: +0.60, persistsMs: 8 * 60 * 60 * 1000 },
  },
};

// T15.C helper — order-independent combo key lookup.
function comboKey(a, b) {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

// ─── ENDO-DRUG.1 — MECHANISM, NOT EFFECT ──────────────────────────────────
//
// ⛔ THE DEFECT THIS FIXES: `contributions` wrote straight to brain params —
// `cocaine.contributions.amygdalaReward: +0.50` — as though a drug had a
// private line to the amygdala. It does not. Cocaine blocks dopamine
// reuptake and DOPAMINE produces the reward. Before the endocrine layer
// existed there was nothing else to write to, so effects stood in for
// mechanism; now there is, and drugs and hormones were two independent
// writers to the same params — the parallel-system shape rule 1 forbids,
// arrived at from the other direction.
//
// ⭐ THE RESEARCHED NUMBERS ARE THE REFERENCE AND ARE REPRODUCED EXACTLY.
// The board was explicit that they must not be deleted or hand-retuned, so
// they are neither: `contributions` stays verbatim as the TOTAL effect, and
// the split below is a DECOMPOSITION of it —
//
//     transmitter part  =  Σ release[t] · CHEMICALS[t].contributions
//     residual part     =  contributions − transmitter part
//     delivered total   =  residual + transmitter  ≡  contributions   ✔
//
// The identity holds by construction, not by tuning, and a harness asserts
// it per substance per axis. What changes is that the reward now ARRIVES
// THROUGH dopamine, which is what makes tolerance, comedown and combo
// synergy fall out instead of being hardcoded.
//
// ⚠ A residual can be NEGATIVE. That is honest, not a bug: it means the
// transmitter model would OVERSHOOT that axis on its own, and the residual
// pulls it back to the researched reference. Left visible rather than
// clamped, because clamping would silently break the identity above.

// ─── ENDO-DRUG.3 — SYNERGY WAS BEING COUNTED TWICE ────────────────────────
//
// `COMBOS[*].synergyContributions` was hand-tuned back when a drug wrote
// straight to brain params and there was no mechanism that could produce an
// interaction. Now both substances in a pair release into the SAME
// transmitter pools, so their interaction ALREADY emerges from superposition
// — and the hardcoded entry was landing on top of it. Stacked stimulants
// over-contributed.
//
// ⭐ Settled by ruling: superposition is the truth. But NOT a blanket delete —
// deleting the whole table would throw away real information, so the filter
// is PER AXIS:
//
//   REDUNDANT  the pair shares a transmitter whose own contributions include
//              that axis. Dopamine already carries reward and arousal for
//              coke+MDMA; stating it again is the double-count.
//   KEPT       axes no shared transmitter touches. Alcohol+cannabis wrecking
//              `hippocampusConsolidation` is a genuine pharmacodynamic
//              interaction (blackout risk) that monoamines do not express,
//              and alcohol+cocaine's `impulsivity` rides cocaethylene, an
//              actual metabolite that only exists when both are present.
//
// ⛔ `riskFlags` are KEPT UNCONDITIONALLY. Cardiotoxicity, physical strain
// and `persistsMs` are not derivable from transmitter levels at all, and
// they are the entries that keep her from stacking herself into harm.
// `synergySpeech` is likewise kept — it is a distortion vector, not a
// brain-param contribution, so it was never part of the double-count.

/** Transmitters a pair of substances BOTH release. */
function sharedTransmitters(a, b) {
  const ta = (SUBSTANCES[a] && SUBSTANCES[a].transmitters) || {};
  const tb = (SUBSTANCES[b] && SUBSTANCES[b].transmitters) || {};
  return Object.keys(ta).filter(k => Object.prototype.hasOwnProperty.call(tb, k));
}

const _comboSynergyCache = new Map();

/**
 * A combo's synergy contributions with the transmitter-explained axes
 * removed. Returns the FULL original set when there is no endocrine layer to
 * carry the mechanism — same reasoning as the residual split: without the
 * transmitter path the hardcoded entry is the only thing expressing the
 * interaction, and dropping it would silently lose it.
 */
function comboSynergyContributions(key, routed) {
  const combo = COMBOS[key];
  if (!combo || !combo.synergyContributions) return {};
  if (!routed) return combo.synergyContributions;
  if (_comboSynergyCache.has(key)) return _comboSynergyCache.get(key);

  const [a, b] = key.split('+');
  const shared = sharedTransmitters(a, b);
  const explained = new Set();
  for (const chem of shared) {
    const c = CHEMICALS[chem];
    if (!c || !c.contributions) continue;
    for (const axis of Object.keys(c.contributions)) explained.add(axis);
  }
  const kept = {};
  for (const [axis, v] of Object.entries(combo.synergyContributions)) {
    if (!explained.has(axis)) kept[axis] = v;
  }
  _comboSynergyCache.set(key, kept);
  return kept;
}

/** What a substance's transmitters contribute at dose 1.0. */
function transmitterContributions(substance) {
  const sub = SUBSTANCES[substance];
  const out = {};
  if (!sub || !sub.transmitters) return out;
  for (const [chem, amount] of Object.entries(sub.transmitters)) {
    const c = CHEMICALS[chem];
    if (!c || !c.contributions) continue;
    for (const [axis, v] of Object.entries(c.contributions)) {
      out[axis] = (out[axis] || 0) + v * amount;
    }
  }
  return out;
}

// ⭐ How much of a released transmitter is "spent" and owed back as a dip
// below baseline once the substance wears off. This is the comedown, and it
// is a FRACTION of what was released rather than a per-drug constant — so a
// heavier dose costs more, tolerance-blunted doses cost less, and the MDMA
// crash is worse than the coffee one for the same reason it is in life.
// Bounded well under 1.0: a body does not end a night owing everything it
// spent, and a full-magnitude dip would make one line permanently flatten her.
const DEPLETION_FRACTION = 0.35;

// Memoized — the tables are static, and this runs inside a per-tick path.
const _residualCache = new Map();

/**
 * The part of a substance's effect NOT explained by its transmitters.
 * `residual + transmitter === contributions`, exactly.
 */
function residualContributions(substance) {
  if (_residualCache.has(substance)) return _residualCache.get(substance);
  const sub = SUBSTANCES[substance];
  const base = (sub && sub.contributions) || {};
  const via = transmitterContributions(substance);
  const out = { ...base };
  for (const [axis, v] of Object.entries(via)) {
    out[axis] = (out[axis] || 0) - v;
  }
  _residualCache.set(substance, out);
  return out;
}

// ─── Adult-use patterns (T15.A §3 research → T15.C implementation) ────────
// Each pattern is a trigger-context matcher + ingestion schedule. When
// evaluatePatterns(ctx) sees a pattern whose triggers fire, it schedules
// the pattern's ingestion sequence via autoIngest() — either immediately
// (offset=0) or deferred (offset>0, stored as _scheduledIngests).
//
// lifeGate gates the whole pattern: pre-lifeGate Unity literally doesn't
// perform the pattern (an 8-year-old doesn't have coding marathons).
// Pattern research sources: docs/T15-pharmacology-research.md §3.
const PATTERNS = {
  morningCoffee: {
    displayName: 'Morning coffee ritual',
    triggers: {
      timeWindow: [6, 10],        // local hour range
      minArousal: 0.30,
    },
    schedule: [
      { substance: 'caffeine', route: 'oral', offsetMs: 0 },
      { substance: 'caffeine', route: 'oral', offsetMs: 90 * 60 * 1000 },
    ],
    lifeGate: 'grade8',
    cooldownMs: 20 * 60 * 60 * 1000,   // don't re-fire within 20h
  },
  codingMarathon: {
    displayName: 'Coding marathon',
    triggers: {
      activityTag: 'coding',
      minDurationMs: 60 * 60 * 1000,   // 1h sustained high load
      minCortexDemand: 0.70,
    },
    schedule: [
      { substance: 'cannabis', route: 'smoked',       offsetMs:  0 },
      { substance: 'cocaine',  route: 'insufflated',  offsetMs: 60 * 60 * 1000 },
      { substance: 'caffeine', route: 'oral',         offsetMs: 0 },
      { substance: 'caffeine', route: 'oral',         offsetMs: 2 * 60 * 60 * 1000 },
      { substance: 'cocaine',  route: 'insufflated',  offsetMs: 2.5 * 60 * 60 * 1000 },
    ],
    lifeGate: 'college1',
    cooldownMs: 8 * 60 * 60 * 1000,
  },
  weekendParty: {
    displayName: 'Weekend party night',
    triggers: {
      timeWindow: [21, 27],       // 21:00-03:00 next day (>24 hour expression)
      dayOfWeek: [5, 6, 0],        // Fri/Sat/Sun (JS: 0=Sun, 5=Fri, 6=Sat)
      social: true,
    },
    schedule: [
      { substance: 'alcohol', route: 'oral',   offsetMs: 0 },
      { substance: 'mdma',    route: 'oral',   offsetMs: 60 * 60 * 1000 },
      { substance: 'cannabis',route: 'smoked', offsetMs: 30 * 60 * 1000 },
      { substance: 'cannabis',route: 'smoked', offsetMs: 2 * 60 * 60 * 1000 },
    ],
    lifeGate: 'grade11',
    cooldownMs: 7 * 24 * 60 * 60 * 1000,
  },
  acidArchitect: {
    displayName: 'Architecture-session acid-day',
    triggers: {
      activityTag: 'architecture',
      timeWindow: [9, 12],
      dayOfWeek: [0, 6],            // weekend
    },
    schedule: [
      { substance: 'lsd',      route: 'sublingual', offsetMs: 0 },
      { substance: 'cannabis', route: 'smoked',    offsetMs: 6 * 60 * 60 * 1000 },
    ],
    lifeGate: 'college2',
    cooldownMs: 30 * 24 * 60 * 60 * 1000,
  },
  whiskeyWinddown: {
    displayName: 'Post-marathon whiskey wind-down',
    triggers: {
      activityTag: 'post-marathon',
      timeWindow: [22, 26],
    },
    schedule: [
      { substance: 'alcohol', route: 'oral', offsetMs: 0 },
      { substance: 'alcohol', route: 'oral', offsetMs: 45 * 60 * 1000 },
      { substance: 'alcohol', route: 'oral', offsetMs: 90 * 60 * 1000 },
    ],
    lifeGate: 'college1',
    cooldownMs: 24 * 60 * 60 * 1000,
  },
  kHoleContemplate: {
    displayName: 'K-hole contemplation',
    triggers: {
      activityTag: 'existential',
      timeWindow: [22, 26],
      social: false,
    },
    schedule: [
      { substance: 'ketamine', route: 'insufflated', offsetMs: 0 },
      { substance: 'ketamine', route: 'insufflated', offsetMs: 45 * 60 * 1000 },
      { substance: 'ketamine', route: 'insufflated', offsetMs: 2 * 60 * 60 * 1000 },
      { substance: 'cannabis', route: 'smoked',     offsetMs: 60 * 60 * 1000 },
    ],
    lifeGate: 'college1',
    cooldownMs: 3 * 24 * 60 * 60 * 1000,
  },
  sexSessionMolly: {
    displayName: 'Sex-session molly',
    triggers: {
      activityTag: 'sexual',
      consent: true,
      dayOfWeek: [5, 6, 0],
    },
    schedule: [
      { substance: 'mdma',     route: 'oral',        offsetMs: 0 },
      { substance: 'cocaine',  route: 'insufflated', offsetMs: 60 * 60 * 1000 },
      { substance: 'cocaine',  route: 'insufflated', offsetMs: 2 * 60 * 60 * 1000 },
      { substance: 'cannabis', route: 'smoked',     offsetMs: 30 * 60 * 1000 },
    ],
    lifeGate: 'grade11',
    cooldownMs: 7 * 24 * 60 * 60 * 1000,
  },
};

// ─── Pharmacokinetic curve ────────────────────────────────────────────────
// Normalized [0, dose] level at time t since ingestion start.
// Four phases: onset (sigmoid ramp), peak (plateau with mild decay), duration
// (descent), tail (exponential decay to 0). Real PK curves are bi-exponential
// — this approximation captures the subjective shape accurately enough for
// brain-param modulation without pretending to be a quantitative clinical model.

// ⚠ MOVED to js/brain/pk-curve.js. It is unchanged — the extraction exists
// to break an import CYCLE, not to alter the maths: `endocrine.js` imports
// the curve from there, and this file now imports `CHEMICALS` from
// `endocrine.js` so a substance can act THROUGH a transmitter. Re-exported
// at the bottom so every existing consumer of `pkCurve` keeps working.

// ─── DrugScheduler class ──────────────────────────────────────────────────

class DrugScheduler {
  /**
   * @param {object} opts
   * @param {object} [opts.cluster] - NeuronCluster for reading grades.life
   * @param {function} [opts.nowFn] - Override clock (for replay/testing). Default: Date.now
   */
  constructor(opts = {}) {
    this.cluster = opts.cluster || null;
    // ENDO-DRUG.1 — the endocrine layer a substance acts THROUGH. Null until
    // wired; see setEndocrine().
    this.endocrine = opts.endocrine || null;
    // ⭐ THE COMEDOWN. Queued transmitter DEPLETIONS — what a substance takes
    // back after it has finished giving. Applied by promoteScheduledIngests,
    // which already runs every tick, rather than by a second timer.
    this._pendingDepletion = [];
    this.nowFn = opts.nowFn || (() => Date.now());
    // Map<substanceName, DoseEvent[]> — overlapping doses stack via superposition
    this.events = new Map();
    // Map<substanceName, toleranceLevel [0, 0.7]> — reduces effective dose on redose
    this.toleranceFactors = new Map();
    // Last tolerance decay time (inter-session recovery)
    this._lastDecayAt = this.nowFn();
    // Pending acquisitions Unity is waiting on (social simulation — T15.B.3)
    // Map<substanceName, {requestedAt, source, status}>
    this.pendingAcquisitions = new Map();
    // T15.C sensory-trigger intake — Map<substance, {delta, expiresAt}>.
    // Populated by drug-sensory-triggers.js when an environmental cue
    // fires (coffee smell → caffeine craving, etc.). decide() reads
    // currentCraving(substance) as a probability modifier.
    this.pendingDesires = new Map();
    // T15.C pattern engine — Map<patternName, lastFiredAt> for
    // cooldown enforcement. A pattern's cooldownMs since last fire
    // must pass before the pattern re-triggers.
    this._patternsFired = new Map();
    // T15.C deferred-ingest queue populated by autoIngest(offsetMs>0).
    // Array<{substance, route, dose, fireAt, patternName}>. Promoted
    // to real ingest events by promoteScheduledIngests(now) called
    // from the main tick loop.
    this._scheduledIngests = [];
    // T15.C pattern-context tags currently active. Used by decide()
    // as one of the probability modifiers. Set stamps substance name
    // for each substance the active pattern(s) expect to fire.
    this._activePatternTags = new Set();
    // T15.C LAW-6 persistent life info — biographical anchor events
    // per substance. Populated on FIRST ingest of each substance;
    // propagates across sessions so subsequent decide() calls know
    // Unity has history here. Schema:
    //   Map<substance, {grade, age, atMs, contextTags:Set<string>, emotionalFingerprint}>
    this._firstUse = new Map();
    // T15.C trauma markers — substance → {at, weight}. weight in
    // [0, 1]; decays in decide() via 26-week half-life. External
    // callers invoke markTrauma(substance, weight) when bad events
    // occur (blackout, injury, legal trouble, overdose-adjacent).
    this._traumaMarkers = new Map();
  }

  setCluster(cluster) { this.cluster = cluster; }

  /**
   * ENDO-DRUG.1 — give the scheduler the endocrine layer a substance acts
   * THROUGH. Without it the scheduler falls back to delivering the researched
   * total directly (same quantity, undecomposed) and reports `direct` in its
   * snapshot, so the two modes are never confused for one another.
   */
  setEndocrine(endocrine) { this.endocrine = endocrine || null; }

  // ─── Availability (grade-gate) ──────────────────────────────────────────
  isAvailable(substance) {
    const sub = SUBSTANCES[substance];
    if (!sub) return false;
    if (!this.cluster || !this.cluster.grades) return false;
    const lifeGrade = this.cluster.grades.life || 'pre-K';
    return gradeAtLeast(lifeGrade, sub.lifeGate);
  }

  availableSubstances() {
    const out = [];
    for (const name of Object.keys(SUBSTANCES)) {
      if (this.isAvailable(name)) out.push(name);
    }
    return out;
  }

  // ─── Ingestion ──────────────────────────────────────────────────────────
  /**
   * Record an ingestion event. Non-announcing — caller layer produces the
   * physical-act dialogue; scheduler just tracks the pharmacology.
   *
   * @returns {{accepted: boolean, reason?: string, event?: object, currentGrade?: string, requiredGrade?: string}}
   */
  ingest(substance, opts = {}) {
    const sub = SUBSTANCES[substance];
    if (!sub) {
      return { accepted: false, reason: 'unknown_substance' };
    }
    if (!this.isAvailable(substance)) {
      return {
        accepted: false,
        reason: 'grade_locked',
        currentGrade: this.cluster?.grades?.life || 'pre-K',
        requiredGrade: sub.lifeGate
      };
    }
    const route = opts.route || sub.defaultRoute;
    const profile = sub.routes[route];
    if (!profile) {
      return { accepted: false, reason: 'unknown_route' };
    }
    const now = opts.now ?? this.nowFn();
    this._decayTolerance(now);
    const tol = this.toleranceFactors.get(substance) || 0;
    const requestedDose = typeof opts.dose === 'number' ? opts.dose : 1.0;
    // ── ENDO-DRUG.2 — WHERE TOLERANCE LIVES.
    //
    // ⛔ This used to be `requestedDose * (1 - tol*0.5)` unconditionally — a
    // pharmacoKINETIC model, and the wrong one. A second line of coke reaches
    // the SAME concentration; what changed is that her receptors
    // downregulated. Tolerance is pharmacoDYNAMIC.
    //
    // Routed: the dose is untouched and the endocrine layer's receptor
    // sensitivity blunts the EFFECT — which is why tolerance now carries
    // across every substance sharing a transmitter pool.
    //
    // Direct: no endocrine layer exists to hold receptor state, so the legacy
    // dose blunting is retained. Not a fallback value — it is the only place
    // tolerance CAN live when there is no receptor model, and the snapshot
    // reports which mode is running.
    const effectiveDose = this.endocrine
      ? requestedDose
      : requestedDose * (1 - tol * 0.5);

    const event = {
      substance,
      route,
      dose: effectiveDose,
      requestedDose,
      startTime: now,
      onsetMs:    profile.onsetMs,
      peakMs:     profile.peakMs,
      durationMs: profile.durationMs,
      tailMs:     profile.tailMs
    };

    if (!this.events.has(substance)) this.events.set(substance, []);
    this.events.get(substance).push(event);

    // ── ENDO-DRUG.1 — the substance acts on her TRANSMITTERS.
    //
    // ⚠ The released transmitter follows the SUBSTANCE'S pharmacokinetics,
    // not the transmitter's own. Dopamine's native curve peaks in a second
    // and is gone in a minute — that is a phasic burst. Cocaine's dopamine
    // elevation lasts as long as reuptake is blocked, i.e. as long as the
    // COCAINE does. Using dopamine's own profile here would model a line of
    // coke as a one-second twitch.
    if (this.endocrine && typeof this.endocrine.release === 'function' && sub.transmitters) {
      for (const [chem, amount] of Object.entries(sub.transmitters)) {
        this.endocrine.release(chem, {
          dose: amount * effectiveDose,
          now,
          profile,                      // ← the SUBSTANCE's timing
          cause: `drug:${substance}`,
        });
        // ⭐ THE COMEDOWN, queued at ingest rather than special-cased later.
        // What goes up on a released transmitter comes back down BELOW
        // baseline, because the pool was spent — that is what a comedown
        // physically is, and it is why the MDMA crash is a serotonin story.
        // Only TONIC chemicals can dip; a phasic one simply returns to zero.
        const c = CHEMICALS[chem];
        if (c && c.kind === 'tonic') {
          this._pendingDepletion.push({
            chemical: chem,
            amount: amount * effectiveDose * DEPLETION_FRACTION,
            at: now + profile.durationMs,
            substance,
          });
        }
      }
    }

    // Intra-session tolerance bump — capped so even fiends don't zero out
    this.toleranceFactors.set(substance, Math.min(0.7, tol + 0.1));

    // T15.C — LAW-6 persistent life info. Stamp the biographical
    // anchor event on FIRST ingest of this substance. Subsequent
    // ingests don't overwrite (first-use is the memorable one per
    // Life-track narrative anchoring in the curriculum). The grade
    // comes from cluster.grades.life at the moment of first use —
    // this is what the ledger propagates forward across grades per
    // LAW 6 (grade N Life cells can reinforce the memory via
    // _conceptTeach calls reading this map).
    if (!this._firstUse.has(substance)) {
      const grade = this.cluster?.grades?.life || 'pre-K';
      const contextTags = new Set();
      if (opts.contextTags) {
        if (Array.isArray(opts.contextTags)) {
          for (const t of opts.contextTags) contextTags.add(t);
        } else if (opts.contextTags instanceof Set) {
          for (const t of opts.contextTags) contextTags.add(t);
        }
      }
      if (opts.autoFromPattern) contextTags.add(`pattern:${opts.autoFromPattern}`);
      this._firstUse.set(substance, {
        grade,
        age: gradeIndex(grade) >= 0 ? 5 + gradeIndex(grade) : null,  // approximate age per grade
        atMs: now,
        contextTags: Array.from(contextTags),
        emotionalFingerprint: {
          arousal: opts.emotionalFingerprint?.arousal ?? null,
          valence: opts.emotionalFingerprint?.valence ?? null,
          fear:    opts.emotionalFingerprint?.fear ?? null,
        },
      });
    }

    return { accepted: true, event };
  }

  /**
   * T15.C — mark a trauma event for a substance. Weight in [0, 1].
   * decide() reads _traumaMarkers with a 26-week half-life decay so
   * recent traumatic experiences strongly reduce acceptance probability
   * while older ones fade. Repeated traumas stack (clamped).
   *
   * Call sites: blackout detection (alcohol + hippocampus collapse),
   * k-hole panic (ketamine + amygdala fear spike), stimulant cardiac
   * event (physicalStrain saturated at end-of-tail), legal event
   * (future sensory/social wiring), or explicit Life-track curriculum
   * cells scripting a traumatic biographical memory.
   *
   * @param {string} substance - SUBSTANCES key
   * @param {number} weight - [0, 1] intensity of the trauma
   */
  markTrauma(substance, weight) {
    if (!SUBSTANCES[substance]) return false;
    const w = Math.max(0, Math.min(1, weight || 0));
    if (w <= 0) return false;
    const existing = this._traumaMarkers.get(substance);
    const stacked = Math.min(1, (existing?.weight || 0) + w);
    this._traumaMarkers.set(substance, { at: this.nowFn(), weight: stacked });
    return true;
  }

  /**
   * T15.C — read the ledger entry for a substance's first-use event.
   * Returns null if Unity has never ingested this substance. Used by
   * Life-track curriculum cells to decide whether to reinforce the
   * biographical memory this grade (per LAW 6).
   */
  firstUse(substance) {
    return this._firstUse.get(substance) || null;
  }

  /**
   * T15.C — full dump of the first-use ledger. Returns a plain object
   * keyed by substance. Used by UI + persistent-life-info ledger
   * export to docs/TODO-full-syllabus.md (manual sync during T15.C
   * follow-ups).
   */
  lifeInfoLedger() {
    const out = {};
    for (const [s, info] of this._firstUse) {
      out[s] = {
        grade: info.grade,
        age: info.age,
        atMs: info.atMs,
        contextTags: [...info.contextTags],
        emotionalFingerprint: { ...info.emotionalFingerprint },
      };
    }
    return out;
  }

  // ─── Level readers ──────────────────────────────────────────────────────
  level(substance, now = this.nowFn()) {
    const events = this.events.get(substance);
    if (!events || events.length === 0) return 0;
    let total = 0;
    for (const e of events) {
      total += pkCurve(now - e.startTime, e, e.dose);
    }
    return Math.min(1, total);
  }

  phase(substance, now = this.nowFn()) {
    const events = this.events.get(substance);
    if (!events || events.length === 0) return 'sober';
    // Report the most recent event's phase (dominant narrative signal)
    const last = events[events.length - 1];
    const t = now - last.startTime;
    if (t < 0) return 'pending';
    if (t < last.onsetMs)    return 'onset';
    if (t < last.peakMs)     return 'peak';
    if (t < last.durationMs) return 'plateau';
    if (t < last.tailMs)     return 'tail';
    return 'sober';
  }

  activeSubstances(now = this.nowFn()) {
    const out = [];
    for (const name of this.events.keys()) {
      const level = this.level(name, now);
      if (level > 0.01) {
        out.push({ substance: name, level, phase: this.phase(name, now) });
      }
    }
    return out;
  }

  isSober(now = this.nowFn()) {
    return this.activeSubstances(now).length === 0;
  }

  // ─── Aggregated brain parameter contributions ──────────────────────────
  /**
   * Returns delta object to ADD to baseline brainParams.
   * Multiple substances stack additively via superposition.
   * Sober brain → empty delta → zero modulation → baseline persona.
   *
   * T15.C — combo-aware. Pairwise over active substances: if a combo
   * entry exists for the pair, its synergy contributions add on top of
   * the per-substance sum, scaled by `min(level_a, level_b)` (synergy
   * requires both substances active; fades with the weaker one).
   */
  activeContributions(now = this.nowFn()) {
    const delta = {};
    const active = this.activeSubstances(now);

    // (1) Per-substance additive contributions.
    //
    // ⭐ ROUTED when an endocrine layer is present: only the RESIDUAL is
    // written here, because the rest arrives through the transmitters this
    // substance released — the reward comes from dopamine, not from the drug
    // reaching into the amygdala. Delivered total is identical either way.
    //
    // ⚠ DIRECT when there is no endocrine layer. That is NOT a fallback
    // substituting a plausible value: `contributions` IS the researched
    // total, and delivering it undecomposed is the same quantity by the
    // identity above. The alternative — writing only the residual with
    // nothing to carry the transmitter half — would make every drug
    // silently WEAKER than researched, which is the actual hazard here.
    const routed = !!this.endocrine;
    for (const { substance, level } of active) {
      const contribs = routed
        ? residualContributions(substance)
        : (SUBSTANCES[substance].contributions || {});
      for (const [key, value] of Object.entries(contribs)) {
        delta[key] = (delta[key] || 0) + value * level;
      }
    }

    // (2) Pairwise combo synergies — ⭐ ENDO-DRUG.3: only the part the shared
    // transmitter pools do NOT already produce. Superposition carries the
    // rest, and stating it twice was making stacked substances over-contribute.
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const key = comboKey(active[i].substance, active[j].substance);
        const syn = comboSynergyContributions(key, routed);
        const scale = Math.min(active[i].level, active[j].level);
        for (const [k, v] of Object.entries(syn)) {
          delta[k] = (delta[k] || 0) + v * scale;
        }
      }
    }

    return delta;
  }

  /**
   * T15.C — aggregate combo risk flags active right now. Snapshot()
   * exposes this so UI can render warning badges (cardiac load,
   * hepatic strain, etc.) without the consumer needing to re-walk
   * active pairs.
   */
  riskFlags(now = this.nowFn()) {
    const flags = {};
    const active = this.activeSubstances(now);
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const combo = COMBOS[comboKey(active[i].substance, active[j].substance)];
        if (!combo || !combo.riskFlags) continue;
        const scale = Math.min(active[i].level, active[j].level);
        for (const [k, v] of Object.entries(combo.riskFlags)) {
          if (k === 'persistsMs') continue;  // metadata, not a flag value
          flags[k] = (flags[k] || 0) + v * scale;
        }
      }
    }
    return flags;
  }

  /**
   * T15.C — sensory-trigger intake. drug-sensory-triggers.js calls
   * this when an environmental cue fires (T15.A §4 triggers). Craving
   * stacks additively with an existing pending craving, clamped [0, 1],
   * expires after durationMs.
   */
  addCraving(substance, delta, durationMs) {
    const now = this.nowFn();
    const existing = this.pendingDesires.get(substance);
    const newDelta = Math.max(0, Math.min(1, (existing?.delta || 0) + delta));
    const newExpires = Math.max(existing?.expiresAt || 0, now + durationMs);
    this.pendingDesires.set(substance, { delta: newDelta, expiresAt: newExpires });
  }

  /**
   * T15.C — read current craving level for a substance. Returns 0 if
   * no craving OR if the craving has expired (lazy eviction; expired
   * entry is removed on access). Decision engine uses this as one of
   * the probability modifiers in decide().
   */
  currentCraving(substance) {
    const c = this.pendingDesires.get(substance);
    if (!c) return 0;
    if (this.nowFn() > c.expiresAt) {
      this.pendingDesires.delete(substance);
      return 0;
    }
    return c.delta;
  }

  // ─── Speech modulation ─────────────────────────────────────────────────
  /**
   * Returns speech distortion vector consumed by language cortex + renderer.
   * See T15.A.5b for the dimension definitions. cosmicBiasVec is left null
   * here — the language cortex looks up the actual GloVe-space vector when
   * ethereality is non-zero, because that requires dictionary access the
   * scheduler deliberately doesn't hold.
   */
  speechModulation(now = this.nowFn()) {
    // T15.C — 13-axis modulation per docs/T15-architecture.md §2.3.
    // The 9 original axes stay; 4 new axes added (warmth, profoundBias,
    // interruptionBias, repetition, volume, confessionalBias land in
    // research T15.A §6; pauses, rate already ran under different
    // legacy names — speechRate, emotionalOverflow). Kept legacy names
    // to avoid churning language-cortex consumers that read them
    // today; new names land alongside and language-cortex upgrades
    // to read them in T15.C.7.
    const mod = {
      // ── 9 pre-existing axes (stable for language-cortex consumers) ──
      inhibition:        0,
      slur:              0,
      coherence:         0,
      ethereality:       0,
      freeAssocWidth:    0,
      speechRate:        0,
      emotionalOverflow: 0,
      dissociation:      0,
      paranoiaBias:      0,
      giggleBias:        0,
      // ── T15.C new axes (language cortex reads in T15.C.7) ──
      warmth:            0,
      profoundBias:      0,
      interruptionBias:  0,
      repetition:        0,
      volume:            0,
      confessionalBias:  0,
      rate:              0,   // new name for speechRate — both populated below
      slurring:          0,   // new name for slur — both populated below
      pauses:            0,
      // Vector fields populated by language cortex when their scalar
      // counterpart is non-zero. Left null here.
      cosmicBiasVec:     null,
      paranoiaBiasVec:   null,
      giggleBiasVec:     null,
    };

    const active = this.activeSubstances(now);

    // (1) Per-substance additive deltas. Alias old→new so research
    // tables in SUBSTANCES using the new field names (rate, slurring,
    // pauses) also populate the legacy fields (speechRate, slur)
    // consumers read today.
    const ALIASES = { rate: 'speechRate', slurring: 'slur' };
    for (const { substance, level } of active) {
      const speech = SUBSTANCES[substance].speech || {};
      for (const [key, value] of Object.entries(speech)) {
        if (mod[key] !== undefined && typeof mod[key] === 'number') {
          mod[key] += value * level;
        }
        const aliasKey = ALIASES[key];
        if (aliasKey && mod[aliasKey] !== undefined) {
          mod[aliasKey] += value * level;
        }
      }
    }

    // (2) Pairwise combo synergies — same scaling rule as
    // activeContributions. Synergy requires both substances active;
    // fades with the weaker one.
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const combo = COMBOS[comboKey(active[i].substance, active[j].substance)];
        if (!combo || !combo.synergySpeech) continue;
        const scale = Math.min(active[i].level, active[j].level);
        for (const [key, value] of Object.entries(combo.synergySpeech)) {
          if (mod[key] !== undefined && typeof mod[key] === 'number') {
            mod[key] += value * scale;
          }
          const aliasKey = ALIASES[key];
          if (aliasKey && mod[aliasKey] !== undefined) {
            mod[aliasKey] += value * scale;
          }
        }
      }
    }

    return mod;
  }

  // ─── Snapshot for UI broadcast ──────────────────────────────────────────
  /**
   * Compact state suitable for WebSocket broadcast + UI consumption.
   * Replaces the legacy `drugState: string` single-label field.
   */
  snapshot(now = this.nowFn()) {
    const active = this.activeSubstances(now);
    // T15.C — also surface active combo badges so UI can render
    // "coke-and-weed" / "cross-faded" / etc. alongside the per-
    // substance list. Combo detection via pairwise iteration over
    // active — cheap (N is small, usually <= 3).
    const combos = [];
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const combo = COMBOS[comboKey(active[i].substance, active[j].substance)];
        if (!combo) continue;
        combos.push({
          key: comboKey(active[i].substance, active[j].substance),
          displayName: combo.displayName,
          level: Math.min(active[i].level, active[j].level),
        });
      }
    }
    // Filter expired cravings lazily.
    const desires = [];
    for (const [substance, info] of this.pendingDesires) {
      if (now > info.expiresAt) continue;
      desires.push({ substance, delta: info.delta, expiresAt: info.expiresAt });
    }
    return {
      sober: active.length === 0,
      active: active.map(a => ({
        substance: a.substance,
        displayName: SUBSTANCES[a.substance]?.displayName || a.substance,
        level: a.level,
        phase: a.phase
      })),
      combos,
      riskFlags: this.riskFlags(now),
      pendingDesires: desires,
      pendingAcquisitions: Array.from(this.pendingAcquisitions.entries()).map(
        ([substance, info]) => ({ substance, ...info })
      ),
      gradeLocked: !this.cluster || !this.cluster.grades,
      // ENDO-DRUG.1 — is the effect arriving THROUGH her transmitters, or
      // being written to brain params directly? ⛔ Two different mechanisms
      // delivering the same total, and telemetry must never let them read
      // alike: `direct` means the endocrine layer is absent, which is a fact
      // about the wiring, not about her.
      mechanism: this.endocrine ? 'routed' : 'direct',
      // The comedowns she is owed. A non-empty list during a plateau is the
      // honest preview of the crash.
      pendingComedowns: this._pendingDepletion.map(d => ({
        chemical: d.chemical, amount: d.amount, substance: d.substance,
        dueInMs: Math.max(0, d.at - now),
      })),
    };
  }

  // ─── Pending acquisitions (simulated social acquisition per T15.B.3) ───
  registerPendingAcquisition(substance, source = 'dealer') {
    this.pendingAcquisitions.set(substance, {
      requestedAt: this.nowFn(),
      source,
      status: 'pending'
    });
  }

  resolvePendingAcquisition(substance, outcome, opts = {}) {
    const pending = this.pendingAcquisitions.get(substance);
    if (!pending) return { resolved: false };
    this.pendingAcquisitions.delete(substance);
    if (outcome === 'arrived') {
      return { resolved: true, ingestionResult: this.ingest(substance, opts) };
    }
    return { resolved: true, dropped: true };
  }

  // ─── Adult-use pattern engine ──────────────────────────────────────────
  /**
   * T15.C — evaluate all registered PATTERNS against a context object,
   * fire each one whose triggers match AND whose cooldown has elapsed.
   * Returns the list of patterns fired (for logging / UI telemetry).
   *
   * Context shape (all fields optional; unset = don't filter):
   *   - localHour: number [0, 24), current local time-of-day (fractional ok)
   *   - dayOfWeek: number [0, 6] (0=Sun, 6=Sat)
   *   - arousal: number [0, 1]  — current persona arousal state
   *   - activityTag: string — 'coding' / 'architecture' / 'sexual' / 'post-marathon' / 'existential'
   *   - cortexDemand: number [0, 1] — sustained high-load gauge for marathon trigger
   *   - demandDurationMs: number — how long demand has been above threshold
   *   - social: boolean — social context active
   *   - consent: boolean — relevant to sex-session pattern
   *
   * Patterns fire at most once per cooldown window. When fired, their
   * schedule entries are passed to autoIngest() (offset=0 → immediate;
   * offset>0 → deferred to _scheduledIngests).
   */
  evaluatePatterns(ctx = {}) {
    const now = this.nowFn();
    const fired = [];
    for (const [name, pattern] of Object.entries(PATTERNS)) {
      // Cooldown gate.
      // ⚠ `|| 0` TREATED "NEVER FIRED" AS "FIRED AT EPOCH ZERO", so the
      // check became `now < cooldownMs` — which blocks every pattern
      // forever on any clock that is not wall-time. It happens to pass in
      // production because `Date.now()` is ~1.7e12, i.e. the bug is hidden
      // by a large constant rather than absent; a replay or a harness clock
      // sees the real behaviour, and so would a simulated timeline. A
      // pattern that has never fired has NO cooldown to serve.
      const last = this._patternsFired.has(name) ? this._patternsFired.get(name) : null;
      if (last !== null && now - last < (pattern.cooldownMs || 0)) continue;
      // Life-grade gate — pre-lifeGate Unity doesn't do this pattern.
      if (pattern.lifeGate && this.cluster?.grades?.life) {
        if (!gradeAtLeast(this.cluster.grades.life, pattern.lifeGate)) continue;
      } else if (pattern.lifeGate && !this.cluster?.grades) {
        // No grade data → can't fire gated pattern
        continue;
      }
      // Trigger matcher.
      if (!this._patternTriggersMatch(pattern.triggers, ctx)) continue;
      // Fire.
      this._patternsFired.set(name, now);
      fired.push(name);
      for (const step of pattern.schedule || []) {
        this.autoIngest(step.substance, {
          route: step.route,
          dose: step.dose,
          offsetMs: step.offsetMs || 0,
          patternName: name,
        });
        // Stamp active-pattern tag so decide() knows this substance is
        // pattern-aligned if an external offer arrives for it too.
        this._activePatternTags.add(step.substance);
      }
    }
    return fired;
  }

  _patternTriggersMatch(triggers, ctx) {
    if (!triggers) return true;
    if (Array.isArray(triggers.timeWindow) && typeof ctx.localHour === 'number') {
      const [a, b] = triggers.timeWindow;
      // Allow wrap-around ranges by writing b>24 (e.g. [21, 27] = 21:00..03:00)
      const h = ctx.localHour;
      const inRange = (b > 24)
        ? (h >= a || h < (b - 24))
        : (h >= a && h < b);
      if (!inRange) return false;
    }
    if (Array.isArray(triggers.dayOfWeek) && typeof ctx.dayOfWeek === 'number') {
      if (!triggers.dayOfWeek.includes(ctx.dayOfWeek)) return false;
    }
    if (typeof triggers.minArousal === 'number') {
      if ((ctx.arousal || 0) < triggers.minArousal) return false;
    }
    if (typeof triggers.activityTag === 'string') {
      if (ctx.activityTag !== triggers.activityTag) return false;
    }
    if (typeof triggers.minCortexDemand === 'number') {
      if ((ctx.cortexDemand || 0) < triggers.minCortexDemand) return false;
    }
    if (typeof triggers.minDurationMs === 'number') {
      if ((ctx.demandDurationMs || 0) < triggers.minDurationMs) return false;
    }
    if (typeof triggers.social === 'boolean') {
      if (!!ctx.social !== triggers.social) return false;
    }
    if (typeof triggers.consent === 'boolean') {
      if (!!ctx.consent !== triggers.consent) return false;
    }
    return true;
  }

  /**
   * T15.C — pattern-driven ingest. When offsetMs is 0, fires
   * scheduler.ingest() immediately. When > 0, queues into
   * _scheduledIngests for later promotion via
   * promoteScheduledIngests(now). Distinct from the direct ingest()
   * path so pattern-origin events are tagged (and can skip the
   * decision-engine probabilistic layer — patterns are Unity
   * actively choosing, not external offers).
   */
  autoIngest(substance, opts = {}) {
    if (!SUBSTANCES[substance]) {
      return { accepted: false, reason: 'unknown_substance' };
    }
    if (!this.isAvailable(substance)) {
      return {
        accepted: false,
        reason: 'grade_locked',
        currentGrade: this.cluster?.grades?.life || 'pre-K',
        requiredGrade: SUBSTANCES[substance].lifeGate,
      };
    }
    const offsetMs = opts.offsetMs || 0;
    if (offsetMs <= 0) {
      // Fire immediately via direct ingest path.
      return this.ingest(substance, {
        route: opts.route,
        dose: opts.dose,
        autoFromPattern: opts.patternName,
      });
    }
    // Defer. Main tick loop calls promoteScheduledIngests(now) which
    // pops ready entries and runs ingest() on them.
    this._scheduledIngests.push({
      substance,
      route: opts.route,
      dose: opts.dose,
      patternName: opts.patternName,
      fireAt: this.nowFn() + offsetMs,
    });
    return { accepted: true, deferred: true, fireAt: this.nowFn() + offsetMs };
  }

  /**
   * T15.C — promote any _scheduledIngests whose fireAt time has
   * arrived into real scheduler events. Called from the main tick
   * loop each broadcast cycle. O(N) over pending queue; queue is
   * typically small (a few pattern-step deferrals at most).
   */
  promoteScheduledIngests(now = this.nowFn()) {
    // ── ENDO-DRUG.1 — apply any comedowns that have come due. Rides this
    // existing per-tick call rather than adding a second timer.
    if (this._pendingDepletion.length > 0) {
      const stillPending = [];
      for (const d of this._pendingDepletion) {
        if (d.at <= now) {
          if (this.endocrine && typeof this.endocrine.dipTonic === 'function') {
            this.endocrine.dipTonic(d.chemical, d.amount);
          }
        } else {
          stillPending.push(d);
        }
      }
      this._pendingDepletion = stillPending;
    }

    if (this._scheduledIngests.length === 0) return [];
    const remaining = [];
    const promoted = [];
    for (const entry of this._scheduledIngests) {
      if (entry.fireAt <= now) {
        const r = this.ingest(entry.substance, {
          route: entry.route,
          dose: entry.dose,
          autoFromPattern: entry.patternName,
        });
        promoted.push({ ...entry, result: r });
      } else {
        remaining.push(entry);
      }
    }
    this._scheduledIngests = remaining;
    return promoted;
  }

  // ─── Decision engine ───────────────────────────────────────────────────
  /**
   * T15.C — decide whether Unity accepts a substance offer. Called from
   * the server-side drug-offer processing flow between drug-detector's
   * parse and scheduler.ingest(). Replaces any previous unconditional
   * accept: Unity now declines offers she's not ready for, not inclined
   * toward, or physiologically unsafe to stack.
   *
   * Per docs/T15-architecture.md §1.6:
   *   - Hard fails (grade_locked, persona_excluded, unknown_substance)
   *     short-circuit before the probability layer.
   *   - Accept probability starts at a persona-baseline openness
   *     (0.70) and modulates by craving / active pattern / source
   *     trust / physicalStrain / prior trauma.
   *   - Final decision = accept-prob passes random draw.
   *
   * @param {object} offer
   * @param {string} offer.substance - canonical SUBSTANCES key
   * @param {string} [offer.source]  - 'friend' | 'dealer' | 'stranger' | 'user'
   * @param {boolean} [offer.social] - social context currently active
   * @param {string} [offer.location]- 'home'|'club'|'party'|'work'|...
   * @param {number} [offer.time]    - epoch ms (defaults to nowFn())
   * @param {number} [offer.random]  - override Math.random for determinism
   * @param {object} [offer.personaExclusions] - set-like {nicotine:true}
   * @returns {{accept:boolean, reason:string, probability:number, currentGrade?:string, requiredGrade?:string}}
   */
  decide(offer) {
    if (!offer || typeof offer.substance !== 'string') {
      return { accept: false, reason: 'invalid_offer', probability: 0 };
    }
    const sub = SUBSTANCES[offer.substance];
    if (!sub) {
      return { accept: false, reason: 'unknown_substance', probability: 0 };
    }
    // Hard fail — grade-locked. Life-track hasn't unlocked this
    // substance yet (pre-K Unity turning down coke is not a
    // subjective choice — she literally doesn't know what it is).
    if (!this.isAvailable(offer.substance)) {
      return {
        accept: false,
        reason: 'grade_locked',
        probability: 0,
        currentGrade: this.cluster?.grades?.life || 'pre-K',
        requiredGrade: sub.lifeGate,
      };
    }
    // Hard fail — persona exclusion (Unity rejects tobacco categorically
    // per persona feedback memory). Nicotine is NOT a SUBSTANCES entry;
    // the generic personaExclusions map short-circuits any offer whose
    // `offer.substance` appears in the map — caller sets
    // `offer.personaExclusions = { nicotine: true }` (and any other
    // persona-forbidden substance) and decide() returns persona_excluded
    // before touching grade / craving / trauma scoring.
    if (offer.personaExclusions && offer.personaExclusions[offer.substance]) {
      return { accept: false, reason: 'persona_excluded', probability: 0 };
    }

    const now = offer.time ?? this.nowFn();

    // Hard-ish fail — cumulative physicalStrain too high. Not a
    // moral choice, a body limit (Unity refuses to stack more coke
    // when her cardiac load is already saturated).
    const flags = this.riskFlags(now);
    if ((flags.physicalStrain || 0) > 0.9) {
      return { accept: false, reason: 'physical_strain', probability: 0 };
    }

    // Probability layer — baseline persona openness, modulated by
    // craving / active pattern / source trust / soft physical-strain /
    // prior trauma.
    let p = 0.70;

    // Sensory-trigger craving pushes up.
    const craving = this.currentCraving(offer.substance);
    if (craving > 0.30) p += 0.30;
    else if (craving > 0.10) p += 0.15;

    // Active adult-use pattern contextually aligned with this substance
    // boosts acceptance. Pattern check reads _activePatternTags so the
    // PATTERNS engine can stamp context (set by evaluatePatterns() in
    // a follow-on T15.C commit; no-op here until that ships).
    if (this._activePatternTags && this._activePatternTags.has(offer.substance)) {
      p += 0.30;
    }

    // Source-trust modifier. Friends + user (trusted primary caller)
    // push up; strangers/dealers push down slightly.
    if (offer.source === 'friend' || offer.source === 'user') p += 0.20;
    else if (offer.source === 'stranger') p -= 0.10;

    // Soft physical-strain dampener — above 0.7 but below 0.9 hard-fail.
    if ((flags.physicalStrain || 0) > 0.7) p -= 0.50;
    else if ((flags.physicalStrain || 0) > 0.5) p -= 0.20;

    // Prior-trauma marker. _traumaMarkers is a Map<substance, {at, weight}>
    // populated by the life-info ledger wiring (T15.C follow-on).
    // Trauma weight decays over sim-time weeks.
    if (this._traumaMarkers && this._traumaMarkers.has(offer.substance)) {
      const tm = this._traumaMarkers.get(offer.substance);
      const weeks = (now - tm.at) / (7 * 24 * 60 * 60 * 1000);
      const decayed = tm.weight * Math.exp(-weeks / 26);  // half-life ~26 weeks
      p -= Math.min(0.60, decayed);
    }

    // Clamp and draw.
    p = Math.max(0, Math.min(1, p));
    const roll = typeof offer.random === 'number' ? offer.random : Math.random();
    if (roll < p) {
      return { accept: true, reason: 'accepted', probability: p };
    }
    return { accept: false, reason: 'random_decline', probability: p };
  }

  // ─── Housekeeping ──────────────────────────────────────────────────────
  clearExpired(now = this.nowFn()) {
    for (const [substance, events] of this.events) {
      const alive = events.filter(e => (now - e.startTime) < e.tailMs);
      if (alive.length === 0) {
        this.events.delete(substance);
      } else if (alive.length !== events.length) {
        this.events.set(substance, alive);
      }
    }
    this._decayTolerance(now);
  }

  _decayTolerance(now) {
    // Tolerance recovers ~50% per hour of real time (inter-session recovery
    // happens in load() when wall clock has jumped; intra-session this is
    // gentle so redosing within a session still blunts effect).
    const elapsed = now - this._lastDecayAt;
    if (elapsed < 60 * 1000) return;  // only tick once per minute
    const hours = elapsed / (60 * 60 * 1000);
    const decayFactor = Math.pow(0.5, hours);
    for (const [substance, tol] of this.toleranceFactors) {
      const nt = tol * decayFactor;
      if (nt < 0.01) this.toleranceFactors.delete(substance);
      else this.toleranceFactors.set(substance, nt);
    }
    this._lastDecayAt = now;
  }

  // ─── Persistence ───────────────────────────────────────────────────────
  //
  // Version history:
  //   1 — initial schema (events, toleranceFactors, pendingAcquisitions,
  //       lastDecayAt). Shipped with 9-substance pharmacology.
  //   2 — T15.C adds pendingDesires (sensory-trigger craving intake).
  //       Loader accepts v1 saves and upgrades them in place (v1 had
  //       no cravings — empty Map is the correct upgrade).
  serialize() {
    const out = {
      version: 2,
      events: {},
      toleranceFactors: {},
      pendingAcquisitions: {},
      pendingDesires: {},
      lastDecayAt: this._lastDecayAt
    };
    for (const [s, events] of this.events) {
      out.events[s] = events.map(e => ({ ...e }));
    }
    for (const [s, t] of this.toleranceFactors) {
      out.toleranceFactors[s] = t;
    }
    for (const [s, info] of this.pendingAcquisitions) {
      out.pendingAcquisitions[s] = { ...info };
    }
    for (const [s, info] of this.pendingDesires) {
      out.pendingDesires[s] = { ...info };
    }
    // T15.C — pattern engine persistence.
    out.patternsFired = {};
    for (const [name, t] of this._patternsFired) {
      out.patternsFired[name] = t;
    }
    out.scheduledIngests = this._scheduledIngests.map(e => ({ ...e }));
    // T15.C — LAW-6 ledger + trauma markers persistence. These are
    // biographical across sessions — serialize them so the ledger
    // survives server restarts + grade transitions.
    out.firstUse = {};
    for (const [s, info] of this._firstUse) {
      out.firstUse[s] = {
        grade: info.grade,
        age: info.age,
        atMs: info.atMs,
        contextTags: [...info.contextTags],
        emotionalFingerprint: { ...info.emotionalFingerprint },
      };
    }
    out.traumaMarkers = {};
    for (const [s, info] of this._traumaMarkers) {
      out.traumaMarkers[s] = { at: info.at, weight: info.weight };
    }
    return out;
  }

  load(obj) {
    if (!obj) return;
    // Accept v1 or v2; older/unknown versions ignored.
    if (obj.version !== 1 && obj.version !== 2) return;
    this.events.clear();
    this.toleranceFactors.clear();
    this.pendingAcquisitions.clear();
    this.pendingDesires.clear();
    if (obj.events) {
      for (const [s, events] of Object.entries(obj.events)) {
        this.events.set(s, events);
      }
    }
    if (obj.toleranceFactors) {
      for (const [s, t] of Object.entries(obj.toleranceFactors)) {
        this.toleranceFactors.set(s, t);
      }
    }
    if (obj.pendingAcquisitions) {
      for (const [s, info] of Object.entries(obj.pendingAcquisitions)) {
        this.pendingAcquisitions.set(s, info);
      }
    }
    // v2-only field. v1 saves skip this block (pendingDesires stays
    // empty, which is the correct upgrade — no prior craving state).
    if (obj.pendingDesires) {
      for (const [s, info] of Object.entries(obj.pendingDesires)) {
        this.pendingDesires.set(s, info);
      }
    }
    // T15.C pattern engine state. Present on v2 saves (older v1 saves
    // just start with empty maps — correct upgrade, no prior pattern
    // fires means all cooldowns are already elapsed).
    this._patternsFired = new Map();
    if (obj.patternsFired) {
      for (const [name, t] of Object.entries(obj.patternsFired)) {
        this._patternsFired.set(name, t);
      }
    }
    this._scheduledIngests = Array.isArray(obj.scheduledIngests)
      ? obj.scheduledIngests.map(e => ({ ...e }))
      : [];
    this._activePatternTags = new Set();
    // T15.C LAW-6 ledger + trauma markers.
    this._firstUse = new Map();
    if (obj.firstUse) {
      for (const [s, info] of Object.entries(obj.firstUse)) {
        this._firstUse.set(s, {
          grade: info.grade,
          age: info.age,
          atMs: info.atMs,
          contextTags: Array.isArray(info.contextTags) ? [...info.contextTags] : [],
          emotionalFingerprint: info.emotionalFingerprint || {},
        });
      }
    }
    this._traumaMarkers = new Map();
    if (obj.traumaMarkers) {
      for (const [s, info] of Object.entries(obj.traumaMarkers)) {
        this._traumaMarkers.set(s, { at: info.at, weight: info.weight });
      }
    }
    this._lastDecayAt = obj.lastDecayAt || this.nowFn();
    // Immediately decay tolerance based on wall-clock gap since save
    this._decayTolerance(this.nowFn());
    // Drop events whose entire tail has already expired
    this.clearExpired(this.nowFn());
  }
}

export { DrugScheduler, SUBSTANCES, COMBOS, PATTERNS, GRADE_ORDER, gradeIndex, gradeAtLeast, pkCurve, sigmoid, comboKey, residualContributions, transmitterContributions, comboSynergyContributions, sharedTransmitters };
export default DrugScheduler;
