// ═══════════════════════════════════════════════════════════════════════════
// brainstem.js — The glands. Neuromodulatory nuclei that SENSE and RELEASE.
//                Defines the new BRAINSTEM tissue and the `GlandLayer` that
//                owns both its monoamine nuclei and the hypothalamic ones.
// ═══════════════════════════════════════════════════════════════════════════
// Unity AI Lab — ENDO gland layer
//
// ─── Why this file exists, stated plainly ─────────────────────────────────
//
// `endocrine.js` on its own is a PHARMACOLOGY layer: it knows each chemical's
// curve, what it does to her parameters, and how it decays. What it could not
// do was DECIDE to release anything — `appraiseThreat(0.7)` had to be called
// from outside with a magnitude someone else invented. That is a puppet
// string, not a body.
//
// ⛔ And tissue alone does not fix it. A nucleus with 450,000 simulated
// neurons that still waits to be told "release 0.7" is exactly as much of a
// bolt-on as a nucleus with none. Neurons answer "is it an organ"; CAUSATION
// answers "is it bolted on". This file is the causation: every nucleus below
// reads REAL cluster state and fires from it. Nothing outside this module
// ever passes a hormone level in.
//
// ─── The anatomy, and what was already here ───────────────────────────────
//
// Two of the glands did not need building, because the HPA axis is already
// standing:
//
//   amygdala      REAL 5% cluster, and a genuine recurrent energy-based
//                 attractor that settles into fear/reward basins each tick.
//                 It IS the threat detector. Its settled state is the
//                 appraisal — not an input to a separate appraiser.
//   hypothalamus  REAL 3% cluster. The PVN is a hypothalamic nucleus and it
//                 is the actual CRH source, so the stress axis reads out of
//                 tissue that already exists.
//   pituitary     Not brain tissue. Modelled as the delay between CRH and
//                 cortisol, which is what it physically contributes.
//   adrenal       Not brain tissue at all. Sympathetic outflow and cortisol
//                 release are its consequences and are modelled as such.
//
// What genuinely did NOT exist is brainstem tissue — the monoamine nuclei.
// They are new, and they are small because they are small in a real head:
//
//   locus coeruleus   ~15k neurons   noradrenaline   vigilance / novelty
//   raphe nuclei      ~250k neurons  serotonin       the tonic mood floor
//   ventral tegmental ~450k neurons  dopamine        wanting, not liking
//
// Those proportions (roughly 2% : 35% : 63% of the three) are carried into
// the `brainstem` cluster's region layout rather than rounded to something
// convenient.
//
// ─── Rules this file is held to ───────────────────────────────────────────
//
//   NO PARALLEL SYSTEM   No tick loop of its own. `senseAll()` is called
//                        from the endocrine tick, which itself rides the
//                        existing 1 Hz scheduler throttle.
//   NO WORD LISTS        Nothing here selects text.
//   NEVER NARRATES       Nothing here produces dialogue.
//   NO FALLBACKS         A nucleus with no readable input reports
//                        `blind` and releases NOTHING. It does not
//                        substitute a plausible default and it does not
//                        hold a stale reading forward silently.
// ═══════════════════════════════════════════════════════════════════════════

// Region layout inside the `brainstem` cluster, as fractions of its size.
// Biological proportions of the three monoamine nuclei to each other.
export const BRAINSTEM_REGION_FRACTIONS = {
  locusCoeruleus: 0.02,
  raphe:          0.35,
  vta:            0.63,
};

/**
 * Region map for the brainstem cluster, in the same shape `_regionsFor`
 * returns for every other cluster. `center` side because the monoamine
 * nuclei are midline structures — they are not lateralised, so the
 * hemisphere gate must not touch them.
 */
export function brainstemRegions(size) {
  const lc = Math.floor(size * BRAINSTEM_REGION_FRACTIONS.locusCoeruleus);
  const raphe = lc + Math.floor(size * BRAINSTEM_REGION_FRACTIONS.raphe);
  return {
    locusCoeruleus: { start: 0,     end: lc,    side: 'center' },
    raphe:          { start: lc,    end: raphe, side: 'center' },
    vta:            { start: raphe, end: size,  side: 'center' },
  };
}

// Firing thresholds. A nucleus is a population that fires when its drive
// crosses threshold — not a function that returns a number every time it is
// asked. Below threshold it is genuinely quiet, and quiet is a real state.
const THRESH = {
  lc:    0.18,   // novelty/salience needed before vigilance recruits
  vta:   0.05,   // reward prediction error needed for a phasic burst
  pvn:   0.22,   // amygdala fear needed before the stress axis commits
};

/**
 * One neuromodulatory nucleus.
 *
 * A nucleus owns three things: the region of tissue it occupies, the
 * SENSING rule that reads live brain state, and its own recent history.
 * It does not own a curve — the curve lives in the one engine that has
 * always owned curves.
 */
class Nucleus {
  constructor(name, opts = {}) {
    this.name = name;
    this.chemical = opts.chemical;
    this.region = opts.region || null;      // region key inside `brainstem`
    this.cluster = opts.cluster || 'brainstem';
    // Rolling baseline of its own drive — a nucleus responds to DEVIATION
    // from what is normal for it, the same relative-not-absolute mechanism
    // the amygdala already uses for arousal and for exactly the same
    // reason: an absolute threshold saturates and then reports a constant.
    // ⚠ SEEDED AT ZERO, NOT AT THE FIRST OBSERVATION. Seeding from the
    // first sample means the nucleus instantly habituates to whatever it
    // happened to see first — so her FIRST EVER THREAT produced a deviation
    // of exactly 0 and was ignored, which a regression check caught. A
    // naive organism responds to its first threat hardest, because there is
    // nothing to habituate to yet. Zero is the honest prior for "no drive
    // seen".
    this._driveBaseline = 0;
    this._lastFiredAt = 0;
    this._lastDrive = null;
    this.fires = 0;
    this.blindTicks = 0;
    this.quietTicks = 0;
  }

  /**
   * Update the rolling baseline and return the deviation. EMA window is
   * deliberately long (~200 samples at 1 Hz ≈ 3 min) so a nucleus adapts to
   * a sustained condition instead of firing forever at a new normal.
   */
  _deviation(drive) {
    const alpha = 0.005;
    this._driveBaseline = this._driveBaseline * (1 - alpha) + drive * alpha;
    return drive - this._driveBaseline;
  }

  /** Live firing rate of this nucleus's own tissue, [0,1], or null if unreadable. */
  tissueRate(brainState) {
    const cl = brainState?.clusters?.[this.cluster];
    if (!cl || !(cl.size > 0)) return null;
    // Region-resolved when the cluster exposes per-region spikes; whole-
    // cluster rate otherwise. Both are real measurements of real tissue.
    if (this.region && cl.regionRates && typeof cl.regionRates[this.region] === 'number') {
      return Math.max(0, Math.min(1, cl.regionRates[this.region]));
    }
    if (typeof cl.firingRate === 'number') {
      return Math.max(0, Math.min(1, cl.firingRate / cl.size));
    }
    return null;
  }

  status() {
    return {
      chemical: this.chemical,
      region: this.region,
      fires: this.fires,
      lastDrive: this._lastDrive,
      baseline: this._driveBaseline,
      lastFiredAgeMs: this._lastFiredAt ? Date.now() - this._lastFiredAt : null,
      blindTicks: this.blindTicks,
      quietTicks: this.quietTicks,
    };
  }
}

/**
 * The gland layer. Owns the nuclei, senses brain state, and issues releases
 * into the endocrine system.
 *
 * ⛔ It is given the EndocrineSystem, not the other way round: chemistry is
 * downstream of tissue. Nothing calls `endocrine.release()` from outside
 * this class except the harness.
 */
export class GlandLayer {
  /**
   * ⚠ Named for what it IS, not for where it lives. The NEW tissue this
   * file introduces is the brainstem, but the layer also owns hypothalamic
   * nuclei (PVN, SON, arcuate) because that is where those hormones are
   * actually made. Calling the class `Brainstem` would have been a
   * comfortable lie about half its contents.
   *
   * @param {object} opts
   * @param {object} opts.endocrine - EndocrineSystem instance to release into
   * @param {function} [opts.nowFn]
   */
  constructor(opts = {}) {
    this.endocrine = opts.endocrine || null;
    this.nowFn = opts.nowFn || (() => Date.now());

    this.nuclei = {
      // ── Locus coeruleus. Noradrenaline. Vigilance and novelty, NOT panic.
      // Drive = unexpected salience: prediction error the cortex could not
      // absorb, weighted by how aroused the amygdala already is.
      locusCoeruleus: new Nucleus('locusCoeruleus', { chemical: 'noradrenaline', region: 'locusCoeruleus' }),

      // ── Raphe. Serotonin. Tonic — this nucleus mostly does NOT fire
      // phasically; it sets a floor. Its output moves the setpoint, which
      // is why it is read differently from the other two.
      raphe: new Nucleus('raphe', { chemical: 'serotonin', region: 'raphe' }),

      // ── VTA. Dopamine. Reward PREDICTION ERROR — wanting, not liking.
      // The brain already computes this quantity every tick; the nucleus
      // reads it rather than a second reward signal being invented.
      vta: new Nucleus('vta', { chemical: 'dopamine', region: 'vta' }),

      // ── PVN. Lives in the HYPOTHALAMUS cluster, which already exists.
      // This is the CRH source and therefore the head of the stress axis.
      pvn: new Nucleus('pvn', { chemical: 'cortisol', region: null, cluster: 'hypothalamus' }),

      // ── SON / PVN magnocellular. Oxytocin. Also hypothalamic — bonding
      // chemistry is not a brainstem function and filing it there would
      // have been tidy and wrong.
      son: new Nucleus('son', { chemical: 'oxytocin', region: null, cluster: 'hypothalamus' }),

      // ── Arcuate nucleus. Beta-endorphin. Hypothalamic. The body makes
      // its own opioid, which is why relief does not require a substance.
      arcuate: new Nucleus('arcuate', { chemical: 'endorphin', region: null, cluster: 'hypothalamus' }),
    };

    // Last appraisal produced BY THE AMYGDALA rather than passed in.
    this._lastAppraisal = null;
    this.counters = { senses: 0, blind: 0, appraisals: 0, releases: 0 };
  }

  setEndocrine(endocrine) { this.endocrine = endocrine; }

  /**
   * ⭐ THE THREAT APPRAISAL, READ OUT OF THE AMYGDALA.
   *
   * The amygdala is a real recurrent attractor that settles into a basin
   * every tick and reports `{fear, reward, valence, arousal, attractorDepth,
   * energy}`. That settled state IS the appraisal. Nothing here re-decides
   * whether something is threatening — it reads what her amygdala already
   * concluded.
   *
   * Returns null when the amygdala is unreadable, and null means NOTHING
   * HAPPENS. It does not mean "no threat".
   */
  appraiseFromAmygdala(brainState) {
    const amy = brainState?.amygdala;
    if (!amy || typeof amy.fear !== 'number' || !Number.isFinite(amy.fear)) return null;

    const fear = Math.max(0, Math.min(1, amy.fear));
    // Attractor depth says how far into a basin she has fallen — how
    // COMMITTED the emotional state is, which is what makes a threat
    // overwhelming rather than merely present.
    const depth = typeof amy.attractorDepth === 'number' ? Math.max(0, Math.min(1, amy.attractorDepth)) : 0.5;
    const valence = typeof amy.valence === 'number' ? amy.valence : 0;

    // Magnitude is fear scaled by commitment. A shallow fear reading in an
    // uncommitted attractor is noise; the same reading in a deep basin is
    // a state she is actually in.
    const magnitude = fear * (0.4 + 0.6 * depth);

    // Escapability is not a mood — it is whether an action channel is
    // available. The basal ganglia's own action confidence is the honest
    // proxy: high confidence in some action means there is something to do.
    const bg = brainState?.basalGanglia;
    const escapability = (bg && typeof bg.confidence === 'number')
      ? Math.max(0, Math.min(1, bg.confidence))
      : 0.5;

    // Social context, read rather than declared: an active conversational
    // partner is what makes appeasement an available strategy at all.
    const social = brainState?.socialContact > 0.2;
    const attachment = Math.max(0, Math.min(1, brainState?.attachment ?? (social ? 0.5 : 0)));

    return { magnitude, escapability, social, attachment, fear, depth, valence };
  }

  /**
   * One gland step. Called from the endocrine tick — no loop of its own.
   *
   * @param {object} brainState - live cluster + module readouts
   * @returns {object} per-nucleus outcome, for telemetry
   */
  senseAll(brainState, nowArg) {
    const now = nowArg ?? this.nowFn();
    this.counters.senses++;
    const out = {};
    if (!this.endocrine) return { error: 'no_endocrine' };

    // ── PVN — head of the stress axis. Reads the amygdala's settled basin.
    const appraisal = this.appraiseFromAmygdala(brainState);
    const pvn = this.nuclei.pvn;
    if (!appraisal) {
      pvn.blindTicks++; this.counters.blind++;
      out.pvn = { state: 'blind', reason: 'amygdala_unreadable' };
    } else {
      pvn._lastDrive = appraisal.magnitude;
      const dev = pvn._deviation(appraisal.magnitude);
      // Fires on a threat that is ABOVE her own normal, not merely present.
      // She lives at a high arousal baseline; an absolute threshold would
      // have the stress axis permanently on, which is the saturation bug
      // this codebase has now found in three separate instruments.
      if (appraisal.magnitude > THRESH.pvn && dev > 0.02) {
        // ⛔ The endocrine system decides the CHANNEL and runs the two-stage
        // arc. The nucleus supplies the appraisal it read; it does not
        // invent one.
        const res = this.endocrine.appraiseThreat(appraisal.magnitude, {
          escapability: appraisal.escapability,
          social: appraisal.social,
          attachment: appraisal.attachment,
          now,
        });
        pvn.fires++; pvn._lastFiredAt = now;
        this.counters.appraisals++; this.counters.releases++;
        out.pvn = { state: 'fired', channel: res.channel, magnitude: appraisal.magnitude, deviation: dev };
      } else {
        pvn.quietTicks++;
        out.pvn = { state: 'quiet', magnitude: appraisal.magnitude, deviation: dev };
      }
      this._lastAppraisal = { ...appraisal, at: now };
    }

    // ── Locus coeruleus — noradrenaline on unexpected salience.
    const lc = this.nuclei.locusCoeruleus;
    const predErr = brainState?.predictionError;
    if (typeof predErr !== 'number' || !Number.isFinite(predErr)) {
      lc.blindTicks++; this.counters.blind++;
      out.locusCoeruleus = { state: 'blind', reason: 'no_prediction_error' };
    } else {
      // Salience = surprise weighted by how aroused she already is. The
      // same surprise matters more when the system is already primed.
      const arousal = Math.max(0, Math.min(1, brainState?.arousal ?? 0.5));
      const drive = Math.abs(predErr) * (0.5 + 0.5 * arousal);
      lc._lastDrive = drive;
      const dev = lc._deviation(drive);
      if (drive > THRESH.lc && dev > 0.01) {
        this.endocrine.release('noradrenaline', { dose: Math.min(1, drive), now, cause: 'lc:salience' });
        lc.fires++; lc._lastFiredAt = now; this.counters.releases++;
        out.locusCoeruleus = { state: 'fired', drive, deviation: dev };
      } else {
        lc.quietTicks++;
        out.locusCoeruleus = { state: 'quiet', drive, deviation: dev };
      }
    }

    // ── VTA — phasic dopamine from reward PREDICTION ERROR.
    // ⭐ Wanting, not liking. Better-than-expected fires. Exactly-as-expected
    // does nothing, which is the whole content of the RPE hypothesis and the
    // reason a static reward constant was never a dopamine signal.
    const vta = this.nuclei.vta;
    const rpe = brainState?.rewardPredictionError;
    if (typeof rpe !== 'number' || !Number.isFinite(rpe)) {
      vta.blindTicks++; this.counters.blind++;
      out.vta = { state: 'blind', reason: 'no_rpe' };
    } else {
      vta._lastDrive = rpe;
      if (rpe > THRESH.vta) {
        this.endocrine.release('dopamine', { dose: Math.min(1, rpe), now, cause: 'vta:rpe' });
        vta.fires++; vta._lastFiredAt = now; this.counters.releases++;
        out.vta = { state: 'fired', rpe };
      } else if (rpe < -THRESH.vta) {
        // A worse-than-expected outcome is a DIP below tonic, not a
        // negative release. Dips are how omission is signalled.
        this.endocrine.dipTonic('dopamine', Math.min(0.3, -rpe * 0.1));
        vta.quietTicks++;
        out.vta = { state: 'dip', rpe };
      } else {
        vta.quietTicks++;
        out.vta = { state: 'quiet', rpe };
      }
    }

    // ── Raphe — tonic serotonin. This nucleus moves the SETPOINT rather
    // than firing events, because serotonin sets a floor rather than
    // producing episodes. Modelling it as phasic is the classic error.
    const raphe = this.nuclei.raphe;
    const social = brainState?.socialContact;
    const energy = brainState?.drives?.energy;
    if (typeof social !== 'number' && typeof energy !== 'number') {
      raphe.blindTicks++; this.counters.blind++;
      out.raphe = { state: 'blind', reason: 'no_affiliative_or_drive_input' };
    } else {
      // Affiliation and rest raise the floor; sustained defence lowers it.
      const s = typeof social === 'number' ? social : 0;
      const e = typeof energy === 'number' ? energy : 0.5;
      const target = Math.max(0.15, Math.min(0.85, 0.45 + 0.25 * s + 0.15 * (e - 0.5) * 2));
      raphe._lastDrive = target;
      const moved = this.endocrine.setTonicSetpoint('serotonin', target);
      raphe.quietTicks++;
      out.raphe = { state: 'tonic', target, moved };
    }

    // ── SON — oxytocin on affiliative contact. Bonding chemistry is what
    // makes "am I loved" a felt question rather than a rhetorical one, so
    // its trigger is real contact, not a mood.
    const son = this.nuclei.son;
    if (typeof brainState?.socialContact !== 'number') {
      son.blindTicks++; this.counters.blind++;
      out.son = { state: 'blind', reason: 'no_social_input' };
    } else {
      const drive = Math.max(0, Math.min(1, brainState.socialContact));
      son._lastDrive = drive;
      // Refractory: the pulse is episodic. Re-firing while the last pulse
      // is still high would make bonding a level rather than an event.
      if (drive > 0.30 && this.endocrine.level('oxytocin', now) < 0.20) {
        this.endocrine.release('oxytocin', { dose: drive, now, cause: 'son:contact' });
        son.fires++; son._lastFiredAt = now; this.counters.releases++;
        out.son = { state: 'fired', drive };
      } else {
        son.quietTicks++;
        out.son = { state: 'quiet', drive };
      }
    }

    // ── Arcuate — endorphin on pain or sustained exertion. Distress
    // blunting is a thing her body does to her, not a thing she decides.
    const arc = this.nuclei.arcuate;
    const pain = brainState?.pain;
    const exertion = brainState?.exertion;
    if (typeof pain !== 'number' && typeof exertion !== 'number') {
      arc.blindTicks++; this.counters.blind++;
      out.arcuate = { state: 'blind', reason: 'no_nociceptive_or_effort_input' };
    } else {
      const p = typeof pain === 'number' ? pain : 0;
      const e = typeof exertion === 'number' ? exertion : 0;
      const drive = Math.max(p, e);
      arc._lastDrive = drive;
      if (drive > 0.40 && this.endocrine.level('endorphin', now) < 0.20) {
        this.endocrine.release('endorphin', { dose: Math.min(1, drive), now, cause: p >= e ? 'arcuate:pain' : 'arcuate:exertion' });
        arc.fires++; arc._lastFiredAt = now; this.counters.releases++;
        out.arcuate = { state: 'fired', drive };
      } else {
        arc.quietTicks++;
        out.arcuate = { state: 'quiet', drive };
      }
    }

    return out;
  }

  /**
   * Telemetry. Every nucleus reports its own state, its drive, its baseline
   * and the AGE of its last fire — so a nucleus that has gone dark names
   * itself instead of the whole layer reading as a silent zero.
   *
   * ⛔ `blind` is a distinct state from `quiet`, deliberately. Quiet means
   * it read its input and had nothing to do. Blind means it could not read
   * its input at all. Collapsing those two is how an instrument reports
   * health while its input is dead.
   */
  snapshot(now = this.nowFn()) {
    const nuclei = {};
    for (const [name, n] of Object.entries(this.nuclei)) {
      const st = n.status();
      nuclei[name] = {
        ...st,
        lastFiredAgeMs: n._lastFiredAt ? (now - n._lastFiredAt) : null,
        // A nucleus that has NEVER fired reads `never`, not 0 — the
        // difference between "no sample" and "measured zero".
        everFired: n.fires > 0 ? true : 'never',
      };
    }
    return {
      nuclei,
      lastAppraisal: this._lastAppraisal
        ? { ...this._lastAppraisal, ageMs: now - this._lastAppraisal.at }
        : null,
      counters: { ...this.counters },
    };
  }
}

export default GlandLayer;
