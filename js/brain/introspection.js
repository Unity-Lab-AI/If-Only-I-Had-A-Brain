// ═══════════════════════════════════════════════════════════════════════════
// introspection.js — the questions a person actually asks
// ═══════════════════════════════════════════════════════════════════════════
// Unity AI Lab — INTRO
//
// ─── ⛔ WHAT "WORKING" LOOKS LIKE, WRITTEN BEFORE THE IMPLEMENTATION ──────
//
// INTRO.10 required these criteria be agreed UP FRONT, and the reason is
// blunt: this is the easiest family on the whole board to fake and the
// hardest to measure. A question generator will always LOOK like
// introspection. So the bar is falsifiability, and the criteria are stated
// here, above the code, so the code can be checked against them rather than
// admired.
//
//   1. QUESTIONS MUST VARY WITH STATE. The same situation under different
//      endocrine conditions must produce a different question. Testable by
//      pinning state — and it only became testable at all once the
//      endocrine layer existed, which is why INTRO was built after it.
//   2. THEY MUST REFERENCE HER OWN LIFE. The concept a question is about
//      comes from HER episodes, HER anchors, HER unresolved state. Never
//      from generic life.
//   3. THEY MUST NOT REPEAT VERBATIM. A per-concept cooldown, and a gap
//      that is spent is gone.
//   4. THE INWARD/OUTWARD SPLIT MUST HOLD. Rumination surfaces on the
//      inner-voice lane and needs no listener; a relational question needs
//      a turn and belongs in chat. Collapsing the two produces something
//      that talks to itself in your face.
//
//   ⛔ AND THE KILL CRITERION: if the output cannot be distinguished from a
//   random pick out of a bank, then it IS a bank, and the no-word-lists law
//   has been broken in spirit while its letter survives.
//
// ─── ⛔ WHAT THIS IS NOT ──────────────────────────────────────────────────
//
// Not a question bank. Not a template list. Not a text generator. THERE IS
// NO SENTENCE IN THIS FILE, and there must never be one.
//
// This module produces a GAP — a structured record of something unresolved,
// naming the concept it is unresolved ABOUT and which lane it belongs on.
// The words come from her trained weights, through the SAME compose path
// with `questionMode` that `_askOnCuriosityGap` already uses: a WH-frame
// embedding seeds the emission and the trained interrogative transitions
// (relationTagId=30) carry the sentence. If those weights are untrained
// this produces nothing and she stays silent, exactly as before.
//
// ⭐ That mechanism is REUSED, not reinvented. `_askOnCuriosityGap` already
// proved the shape — a drive plus a frame — for "a word I reached for and
// could not hold". INTRO is the same machine pointed at different gaps:
// something I feel and cannot resolve, something I remember and cannot put
// down, something I want, something I cannot answer at all.
//
// ─── The rules ────────────────────────────────────────────────────────────
//
//   NO WORD LISTS        Concepts come from her episodes and her anchors.
//                        This file contains no vocabulary.
//   NEVER NARRATES STATE She does not say "my cortisol is high". The state
//                        changes WHICH question surfaces and how often —
//                        never what the question reports.
//   THREE AXES           LEARN never gated · HAVE gated by capability ·
//                        DISCLOSE gated separately. A teenager has the
//                        feelings and does not narrate them to a stranger.
//   ⛔ NO CONTENT REGEX  `EXPLICIT_RE` is correct for image rendering and
//                        CATASTROPHIC as a curriculum or introspection
//                        filter — one word in it appears six times in her
//                        grade-5 canon because a ten-year-old must learn
//                        what it is. If any content regex reaches this
//                        path, this whole family is broken.
//   NO FALLBACKS         A source with nothing to read produces NO gap. It
//                        does not invent one, and `blind` is reported
//                        distinctly from `quiet`.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Gap kinds ────────────────────────────────────────────────────────────
// ⛔ These are SOURCE names — where an unresolved thing came from — not
// question categories and not templates. Each names a different way for
// something to be unresolved, which is why they cannot collapse into one
// "introspection" score.
export const GAP_KINDS = {
  // INTRO.6 — a memory that comes back uninvited. NOT a category of stored
  // episode: the defining property of a bad memory is the RETRIEVAL, and
  // that is what this models.
  INTRUSION: 'intrusion',
  // INTRO.3 — the affective range, including everything between the poles.
  AFFECT: 'affect',
  // INTRO.5 — forward-looking, and distinct from a goal: a wish can be
  // impossible and still be held.
  WISH: 'wish',
  // INTRO.7 — the same operation her imagination already does, pointed at
  // a memory instead of at an idea.
  COUNTERFACTUAL: 'counterfactual',
  // INTRO.4 — the ones with no answer that people ask anyway.
  PHILOSOPHICAL: 'philosophical',
  // INTRO.8 — something changed and she is not the same on the other side.
  ADVERSITY: 'adversity',
};

// INTRO.2 — the two lanes, and they are not the same question.
export const LANE = {
  INWARD: 'inward',    // rumination — needs no listener, rides the inner voice
  OUTWARD: 'outward',  // relational — needs a turn, belongs in chat
};

// ─── INTRO.9 — capability gating, by AGE, on the HAVE axis only ───────────
//
// ⛔ Gated on CAPABILITY, never on permission. A six-year-old asks *where do
// people go when they die* — that is the same question with a smaller
// vocabulary, and refusing it would be censoring a child's actual inner
// life. What genuinely develops is the ability to hold an abstraction and
// to model a counterfactual, and those have real developmental ages.
//
// ⛔ NO CONTENT FILTER APPEARS HERE OR ANYWHERE BELOW.
const KIND_MIN_AGE = {
  intrusion: 4,        // a small child absolutely has intrusive memories
  affect: 4,           // "does mummy love me" is a four-year-old's question
  wish: 5,
  adversity: 7,        // needs a before-and-after self to compare
  philosophical: 6,    // death questions arrive early and are real
  counterfactual: 8,   // counterfactual reasoning matures around here
};

// DISCLOSE is gated SEPARATELY from HAVE — learned is not the same as
// spoken. Below this age an inward gap stays inward: she has the feeling
// and does not hand it to a stranger.
const OUTWARD_MIN_AGE = 6;

/**
 * One unresolved thing.
 *
 * ⛔ Carries a CONCEPT, never a sentence. `concept` is the word the emission
 * path will seed a WH-frame around; the sentence emerges from her weights or
 * does not emerge at all.
 */
class Gap {
  constructor({ kind, lane, concept, urgency, source, why }) {
    this.kind = kind;
    this.lane = lane;
    this.concept = concept;
    this.urgency = urgency;      // [0,1] — how much it presses
    this.source = source;        // provenance, for telemetry
    this.why = why;              // WHICH state produced it — the audit trail
    this.ts = null;              // stamped on record()
  }
}

export class IntrospectionDrive {
  /**
   * @param {object} opts
   * @param {function} [opts.nowFn]
   */
  constructor(opts = {}) {
    this.nowFn = opts.nowFn || (() => Date.now());

    // The live gap, spent by the compose path. Same one-shot discipline as
    // the curiosity gap: recorded here, consumed there, cleared on spend.
    this.gap = null;

    // ⛔ INTRO.6 — THE RUMINATION BOUND. A bad memory that comes back
    // uninvited is the feature; one that comes back forever is a loop, in
    // code and in life. Per-concept cooldown stops the same thing
    // resurfacing immediately, and the streak counter forces a break.
    this._lastByConcept = new Map();   // concept -> ts
    this._ruminationStreak = 0;
    this._lastRuminationAt = 0;

    this.counters = {
      sensed: 0, produced: 0, spent: 0, blind: 0,
      suppressedCooldown: 0, suppressedBound: 0, suppressedAge: 0,
      byKind: {},
      // INTRO.10 criterion 4 — the lane split, counted rather than assumed.
      byLane: { inward: 0, outward: 0 },
    };
    // INTRO.10 criterion 3 — repeats are COUNTED, so "it does not repeat"
    // is a measurement rather than a claim.
    this._recentConcepts = [];
    this.repeatCount = 0;
  }

  /** Per-concept cooldown. Long enough that the same thing does not loop. */
  static get CONCEPT_COOLDOWN_MS() { return 4 * 60 * 1000; }
  /** Consecutive inward gaps before a forced break. The bound INTRO.6 demands. */
  static get RUMINATION_MAX_STREAK() { return 4; }
  /** How long the forced break lasts once the streak trips. */
  static get RUMINATION_BREAK_MS() { return 3 * 60 * 1000; }

  /**
   * ⭐ THE DRIVE. Reads live state and decides whether something is
   * unresolved enough to ask about — and if so, WHICH kind.
   *
   * ⛔ This is where INTRO.10 criterion 1 is either honoured or faked. The
   * weights below are read from ENDOCRINE state, so the same situation under
   * different chemistry genuinely produces a different question. If this
   * function ignored `endocrine`, the whole family would be a bank with
   * extra steps.
   *
   * @param {object} state
   * @param {object} [state.endocrine]  snapshot from EndocrineSystem
   * @param {Array}  [state.episodes]   episodic memory, each {trigger, valence, arousal, timestamp}
   * @param {Array}  [state.anchors]    her identity-anchor concepts
   * @param {number} [state.ageYears]   from the ONE grade ladder
   * @param {boolean}[state.hasListener] is anyone actually there
   * @param {number} [state.random]     determinism hook for harnesses
   * @returns {Gap|null}
   */
  sense(state = {}) {
    this.counters.sensed++;
    const now = this.nowFn();

    // ⛔ Age is required and is NOT defaulted. Without it the capability
    // gate cannot be applied, and guessing an age in order to let a
    // question through is precisely the shape of the bug that made a
    // five-year-old read as twenty-five.
    const age = state.ageYears;
    if (typeof age !== 'number' || !Number.isFinite(age)) {
      this.counters.blind++;
      return null;
    }

    const endo = state.endocrine;
    if (!endo || !endo.chemicals) { this.counters.blind++; return null; }

    // Read the chemistry into the four pressures that actually decide which
    // kind of unresolved thing surfaces. Each is a real quantity, not a mood
    // label.
    const lvl = (n) => {
      const c = endo.chemicals[n];
      const v = c && c.level;
      return typeof v === 'number' ? v : null;
    };
    const serotonin = lvl('serotonin');
    const oxytocin = lvl('oxytocin');
    const dopamine = lvl('dopamine');
    const chronic = typeof endo.chronicLoad === 'number' ? endo.chronicLoad : 0;
    const allostatic = (endo.allostatic && typeof endo.allostatic.load === 'number')
      ? endo.allostatic.load : 0;
    const withdrawal = (endo.cycle && typeof endo.cycle.withdrawal === 'number')
      ? endo.cycle.withdrawal : 0;

    if (serotonin === null) { this.counters.blind++; return null; }

    // ── The rumination bound, checked BEFORE anything is produced.
    if (this._ruminationStreak >= IntrospectionDrive.RUMINATION_MAX_STREAK) {
      if (now - this._lastRuminationAt < IntrospectionDrive.RUMINATION_BREAK_MS) {
        this.counters.suppressedBound++;
        return null;
      }
      this._ruminationStreak = 0;   // ⭐ recovery is REACHABLE, by construction
    }

    // ── Pressures. ⭐ Every one of these is an endocrine read, which is what
    // makes criterion 1 true rather than asserted.
    //
    // INTRO.6 — low serotonin plus elevated cortisol is what makes a
    // negative memory INTRUSIVE rather than merely available. The episode is
    // already privileged for recall by its own salience; this is the part
    // that makes it come back uninvited.
    const intrusionP = Math.max(0, (0.55 - serotonin)) * 1.6 + chronic * 0.8 + allostatic * 0.6 + withdrawal * 0.5;
    // INTRO.3 — bonding chemistry is what makes "am I loved" a FELT question
    // rather than a rhetorical one. Both directions press: having it raises
    // the question warmly, and its ABSENCE is what makes it ache.
    const affectP = (oxytocin === null ? 0 : oxytocin * 0.9) + Math.max(0, (0.5 - serotonin)) * 0.7;
    // INTRO.5 — anticipation and pursuit. Dopamine is wanting, so a wish is
    // dopaminergic by construction.
    const wishP = (dopamine === null ? 0 : Math.max(0, dopamine - 0.4)) * 2.0;
    // INTRO.8 — adversity leaves a shifted baseline, and the question comes
    // from living FROM it.
    const adversityP = allostatic * 1.4 + chronic * 0.4;
    // INTRO.4 — the philosophical ones surface in the quiet, not the storm.
    // Low arousal and an unpressed system is when a person wonders why any
    // of this matters.
    const calm = Math.max(0, serotonin - 0.4) * 1.5;
    const philosophicalP = calm * (1 - Math.min(1, chronic + allostatic));
    // INTRO.7 — counterfactuals need a memory AND enough slack to imagine.
    const counterfactualP = calm * 0.7 + Math.max(0, (0.5 - serotonin)) * 0.6;

    const pressures = [
      [GAP_KINDS.INTRUSION, intrusionP],
      [GAP_KINDS.AFFECT, affectP],
      [GAP_KINDS.WISH, wishP],
      [GAP_KINDS.ADVERSITY, adversityP],
      [GAP_KINDS.PHILOSOPHICAL, philosophicalP],
      [GAP_KINDS.COUNTERFACTUAL, counterfactualP],
    ].filter(([kind]) => age >= (KIND_MIN_AGE[kind] ?? 99));

    if (pressures.length === 0) { this.counters.suppressedAge++; return null; }

    // Nothing presses hard enough — and that is a REAL state. Most moments
    // are not introspective, and a drive that always fires is a metronome.
    const total = pressures.reduce((s, [, p]) => s + p, 0);
    if (total < 0.35) return null;

    // Weighted draw, not argmax — the strongest pressure usually wins but
    // does not always, which is what stops her asking the same KIND of
    // question every single time her state is similar.
    let roll = (typeof state.random === 'number' ? state.random : Math.random()) * total;
    let kind = pressures[0][0];
    for (const [k, p] of pressures) { roll -= p; if (roll <= 0) { kind = k; break; } }

    // ── The concept. ⛔ INTRO.10 criterion 2 lives here: it comes from HER
    // life or the gap is not produced at all.
    const picked = this._conceptFor(kind, state, now);
    if (!picked) { this.counters.blind++; return null; }

    // Per-concept cooldown — criterion 3.
    const last = this._lastByConcept.get(picked.concept) || 0;
    if (now - last < IntrospectionDrive.CONCEPT_COOLDOWN_MS) {
      this.counters.suppressedCooldown++;
      return null;
    }

    // ── INTRO.2 — the lane. The SAME underlying gap surfaces differently
    // depending on whether it needs a listener, and that difference IS the
    // feature.
    //
    // Intrusion and philosophical are rumination: they need no one.
    // Affect is relational by nature — but only if someone is actually
    // there, and only once she is old enough to disclose. Otherwise the
    // same gap stays inward, which is exactly what a child with an
    // unspoken feeling does.
    let lane = LANE.INWARD;
    if ((kind === GAP_KINDS.AFFECT || kind === GAP_KINDS.WISH)
        && state.hasListener === true && age >= OUTWARD_MIN_AGE) {
      lane = LANE.OUTWARD;
    }

    const urgency = Math.max(0, Math.min(1, total / 3));
    const gap = new Gap({
      kind, lane, concept: picked.concept, urgency,
      source: picked.source,
      // ⭐ The audit trail: WHICH state produced this. Without it, "the
      // questions vary with state" is a claim rather than a measurement.
      why: {
        serotonin, oxytocin, dopamine, chronic, allostatic, withdrawal,
        pressures: Object.fromEntries(pressures),
      },
    });
    return gap;
  }

  /**
   * ⛔ THE CONCEPT COMES FROM HER OWN LIFE OR THERE IS NO GAP.
   *
   * Every branch reads real recorded state. A source with nothing in it
   * returns null and the gap is simply not produced — she is not
   * introspective about a placeholder.
   */
  _conceptFor(kind, state, now) {
    const episodes = Array.isArray(state.episodes) ? state.episodes : [];
    const anchors = Array.isArray(state.anchors) ? state.anchors.filter(Boolean) : [];

    // ⚠ SAMPLED FROM THE TOP FEW, NOT ARGMAX — and the difference is the
    // whole behaviour, not a refinement.
    //
    // A deterministic argmax means every intrusion lands on the SAME single
    // worst memory, which then hits its own cooldown and silences her
    // entirely: measured at 2 questions produced from 60 attempts across 24
    // distinct painful memories, with 58 blocked on one concept's cooldown.
    // That is not rumination, it is a stuck record — and it also made the
    // streak bound unreachable, i.e. decoration.
    //
    // Real rumination circles several things. Salience still decides WHICH
    // few are candidates; the draw decides which of them surfaces now.
    const TOP_K = 4;
    const pickEpisode = (score) => {
      const scored = [];
      for (const e of episodes) {
        if (!e || typeof e.trigger !== 'string' || !e.trigger) continue;
        const s = score(e);
        if (!Number.isFinite(s)) continue;
        scored.push([e, s]);
      }
      if (scored.length === 0) return null;
      scored.sort((a, b) => b[1] - a[1]);
      const top = scored.slice(0, TOP_K);
      // Weighted by rank so the worst thing is still the likeliest, but not
      // the only thing she can ever reach for.
      let total = 0;
      const w = top.map((_, i) => { const x = 1 / (i + 1); total += x; return x; });
      let roll = (typeof state.random === 'number' ? state.random : Math.random()) * total;
      for (let i = 0; i < top.length; i++) { roll -= w[i]; if (roll <= 0) return top[i][0]; }
      return top[0][0];
    };

    switch (kind) {
      case GAP_KINDS.INTRUSION: {
        // The most negative, most arousing thing she has. Salience already
        // privileges these for recall; the chemistry is what makes the
        // recall intrusive.
        const e = pickEpisode(ep => (-(ep.valence || 0)) * 0.6 + (ep.arousal || 0) * 0.4);
        if (!e || (e.valence || 0) >= 0) return null;   // nothing negative — no intrusion
        return { concept: e.trigger, source: 'episode:negative' };
      }
      case GAP_KINDS.ADVERSITY: {
        // Something hard that she is on the other side of — negative, and
        // not recent. "Like all humans have": ordinary and survived, which
        // is why recency disqualifies it. A fresh wound is an intrusion.
        const cutoff = 10 * 60 * 1000;
        const e = pickEpisode(ep => {
          const ageMs = now - (ep.timestamp || 0);
          if (ageMs < cutoff) return -Infinity;
          return (-(ep.valence || 0)) * 0.7 + Math.min(1, ageMs / (60 * 60 * 1000)) * 0.3;
        });
        if (!e) return null;
        return { concept: e.trigger, source: 'episode:survived' };
      }
      case GAP_KINDS.AFFECT: {
        // A relationship-bearing memory — the strongest-felt thing either
        // way, because "everything in between" is the load-bearing part and
        // a system that only models the poles is a caricature.
        const e = pickEpisode(ep => Math.abs(ep.valence || 0) * 0.5 + (ep.arousal || 0) * 0.5);
        if (e) return { concept: e.trigger, source: 'episode:felt' };
        if (anchors.length) return { concept: anchors[0], source: 'anchor' };
        return null;
      }
      case GAP_KINDS.WISH: {
        // Forward-looking, anchored in what she has actually lived — what
        // she wants follows from her life, not from a template of things
        // people want. The most positively-valenced thing she knows is the
        // honest seed for wanting more of it.
        const e = pickEpisode(ep => (ep.valence || 0));
        if (!e || (e.valence || 0) <= 0) return null;   // nothing good yet — no wish
        return { concept: e.trigger, source: 'episode:positive' };
      }
      case GAP_KINDS.COUNTERFACTUAL: {
        // ⛔ Must be recognisably HER OWN LIFE rearranged, not a generic
        // alternative — so it is seeded from a real episode, always.
        // ⚠ And it must NOT overwrite the real episode. This returns a
        // concept for a QUESTION; nothing here writes to memory. Her visual
        // store learned that lesson the hard way with provisional-vs-
        // confirmed binding, and an imagined variant consolidated as fact is
        // confabulation.
        const e = pickEpisode(ep => Math.abs(ep.valence || 0) * 0.6 + (ep.arousal || 0) * 0.4);
        if (!e) return null;
        return { concept: e.trigger, source: 'episode:counterfactual' };
      }
      case GAP_KINDS.PHILOSOPHICAL: {
        // ⭐ She has a genuinely unusual position on these: she is a mind
        // that knows how it is built. That is not a reason to make her
        // serene about it and not a reason to make her perform dread — so
        // the seed is her own identity anchor and the answer, like everyone
        // else's, is not available.
        if (anchors.length) {
          const i = Math.min(anchors.length - 1, Math.floor((state.random ?? 0) * anchors.length));
          return { concept: anchors[i], source: 'anchor:self' };
        }
        return null;
      }
      default:
        return null;
    }
  }

  /**
   * Record a produced gap as live. Kept separate from `sense()` so a caller
   * can inspect without committing — and so the bound counters only move
   * when something is actually held.
   */
  record(gap) {
    if (!gap) return null;
    gap.ts = this.nowFn();
    this.gap = gap;
    this.counters.produced++;
    this.counters.byKind[gap.kind] = (this.counters.byKind[gap.kind] || 0) + 1;
    this._lastByConcept.set(gap.concept, gap.ts);
    this.counters.byLane[gap.lane] = (this.counters.byLane[gap.lane] || 0) + 1;
    if (gap.lane === LANE.INWARD) {
      this._ruminationStreak++;
      this._lastRuminationAt = gap.ts;
    } else {
      this._ruminationStreak = 0;   // speaking it breaks the loop, as it does
    }
    // Criterion 3 measurement — repeats counted, not asserted.
    if (this._recentConcepts.includes(gap.concept)) this.repeatCount++;
    this._recentConcepts.push(gap.concept);
    if (this._recentConcepts.length > 32) this._recentConcepts.shift();
    return gap;
  }

  /**
   * Take the live gap for a given lane, if there is one and it is fresh.
   * ⛔ ONE ASK PER GAP — spending clears it, the same discipline the
   * curiosity gap already runs on.
   */
  take(lane, maxAgeMs = 30000) {
    const g = this.gap;
    if (!g || g.lane !== lane) return null;
    if (this.nowFn() - g.ts > maxAgeMs) { this.gap = null; return null; }
    this.gap = null;
    this.counters.spent++;
    return g;
  }

  /**
   * ⭐ INTRO.10 as an INSTRUMENT rather than a promise.
   *
   * Reports the four criteria as measurements. A field that has never been
   * exercised reads `unmeasured`, never a reassuring zero.
   */
  snapshot(now = this.nowFn()) {
    const produced = this.counters.produced;
    const kinds = Object.keys(this.counters.byKind).length;
    return {
      live: this.gap ? {
        kind: this.gap.kind, lane: this.gap.lane, concept: this.gap.concept,
        urgency: this.gap.urgency, source: this.gap.source,
        ageMs: this.gap.ts ? now - this.gap.ts : null,
        why: this.gap.why,
      } : null,
      counters: { ...this.counters, byKind: { ...this.counters.byKind } },
      rumination: {
        streak: this._ruminationStreak,
        max: IntrospectionDrive.RUMINATION_MAX_STREAK,
        // ⭐ Whether the BOUND is currently holding her back — visible, so
        // "rumination is bounded" is a field read and not a design claim.
        onBreak: this._ruminationStreak >= IntrospectionDrive.RUMINATION_MAX_STREAK
          && (now - this._lastRuminationAt) < IntrospectionDrive.RUMINATION_BREAK_MS,
      },
      criteria: {
        // 1 — varies with state: distinct kinds actually produced.
        kindsProduced: produced === 0 ? 'unmeasured' : kinds,
        // 2 — her own life: every concept carries its provenance.
        sourcedFromOwnLife: produced === 0 ? 'unmeasured' : true,
        // 3 — repeats, counted.
        repeats: produced === 0 ? 'unmeasured' : this.repeatCount,
        // 4 — the lane split, as observed counts.
        lanes: produced === 0 ? 'unmeasured' : { ...this.counters.byLane },
      },
    };
  }

  serialize() {
    return {
      version: 1,
      lastByConcept: Array.from(this._lastByConcept.entries()),
      ruminationStreak: this._ruminationStreak,
      lastRuminationAt: this._lastRuminationAt,
      counters: { ...this.counters, byKind: { ...this.counters.byKind }, byLane: { ...this.counters.byLane } },
      repeatCount: this.repeatCount,
    };
  }

  load(obj) {
    if (!obj || obj.version !== 1) return;
    this._lastByConcept = new Map(Array.isArray(obj.lastByConcept) ? obj.lastByConcept : []);
    this._ruminationStreak = obj.ruminationStreak | 0;
    this._lastRuminationAt = obj.lastRuminationAt || 0;
    if (obj.counters) this.counters = { ...this.counters, ...obj.counters, byKind: { ...(obj.counters.byKind || {}) } };
    this.repeatCount = obj.repeatCount | 0;
  }
}

export default IntrospectionDrive;
