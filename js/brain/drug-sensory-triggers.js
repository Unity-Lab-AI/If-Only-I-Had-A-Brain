// ═══════════════════════════════════════════════════════════════════════════
// drug-sensory-triggers.js — Sensory → scheduler craving bridge
// ═══════════════════════════════════════════════════════════════════════════
// Unity AI Lab — the sensory half of the drug scheduler
//
// ⚠ This block used to cite `docs/T15-pharmacology-research.md`, which does
// not exist in the tree — a pointer to a file no reader can open. The seven
// triggers and their decay windows are therefore documented HERE, beside the
// code that implements them. Each trigger's matcher reads sensory channel
// state (olfactory / visual / audio / context) and fires
// scheduler.addCraving(substance, delta, durationMs) when matched.
//
// Run from the main tick loop: `evaluateTriggers(scheduler, ctx)` walks
// every trigger, fires each one whose matcher returns true.
//
// Context shape (all optional; unset fields don't match triggers that
// require them):
//   ctx.olfactory     - OlfactoryChannel instance (sensory-olfactory.js)
//   ctx.visualTags    - Set<string> or Array of active visual pattern tags
//                       ('whitePowderLine' | 'flashRate:>3Hz' | etc)
//   ctx.audioTags     - Set<string> or Array of active audio tags
//                       ('barRoom' | 'bpm:>120' | etc)
//   ctx.activityTag   - string ('creative' / 'coding' / etc)
//   ctx.locationTag   - string ('nightclub' / 'home' / etc)
//   ctx.localHour     - number [0, 24)
//
// Each carries its own decay window. Repeated firings stack via the scheduler's
// addCraving clamped at 1.0.
// ═══════════════════════════════════════════════════════════════════════════

// Normalize visual/audio tag containers to a has() interface so triggers
// can do membership tests uniformly whether caller passed a Set, Array,
// or string.
function tagHas(tags, key) {
  if (!tags) return false;
  if (tags instanceof Set) return tags.has(key);
  if (Array.isArray(tags)) return tags.includes(key);
  if (typeof tags === 'string') return tags === key;
  return false;
}

const TRIGGERS = [
  // 1 — coffee aroma → caffeine craving
  {
    name: 'coffeeAroma',
    substance: 'caffeine',
    delta: 0.40,
    durationMs: 15 * 60 * 1000,
    match(ctx) {
      if (ctx.olfactory && ctx.olfactory.strength('coffee') > 0.1) return true;
      if (tagHas(ctx.visualTags, 'steamingMug')) return true;
      return false;
    },
  },

  // 2 — skunky weed smell → cannabis craving
  {
    name: 'skunkyWeed',
    substance: 'cannabis',
    delta: 0.50,
    durationMs: 20 * 60 * 1000,
    match(ctx) {
      if (ctx.olfactory && ctx.olfactory.strength('skunky') > 0.1) return true;
      // Social context where peer is smoking also lights this up.
      if (ctx.locationTag === 'smokingPeer') return true;
      return false;
    },
  },

  // 3 — late-night bar music → alcohol craving
  {
    name: 'lateNightBar',
    substance: 'alcohol',
    delta: 0.35,
    durationMs: 30 * 60 * 1000,
    match(ctx) {
      if (typeof ctx.localHour !== 'number') return false;
      if (ctx.localHour < 22 && ctx.localHour > 3) return false;
      return tagHas(ctx.audioTags, 'barRoom');
    },
  },

  // 4 — bright flashing lights + 120bpm+ beat → MDMA craving
  {
    name: 'clubSensoryOnset',
    substance: 'mdma',
    delta: 0.60,
    durationMs: 45 * 60 * 1000,
    match(ctx) {
      const flashHit = tagHas(ctx.visualTags, 'flashRate:>3Hz');
      const beatHit  = tagHas(ctx.audioTags,  'bpm:>120');
      return flashHit && beatHit;
    },
  },

  // 5 — powder on mirror (visual cue) → cocaine craving
  {
    name: 'powderOnMirror',
    substance: 'cocaine',
    delta: 0.80,
    durationMs: 5 * 60 * 1000,   // brief — intrusive-thought window
    match(ctx) {
      return tagHas(ctx.visualTags, 'whitePowderLine');
    },
  },

  // 6 — fresh-ground herb smell during creative work → cannabis
  {
    name: 'herbWhileCreating',
    substance: 'cannabis',
    delta: 0.70,
    durationMs: 15 * 60 * 1000,
    match(ctx) {
      if (!ctx.olfactory || ctx.olfactory.strength('freshHerb') < 0.1) return false;
      return ctx.activityTag === 'creative' || ctx.activityTag === 'coding'
        || ctx.activityTag === 'architecture';
    },
  },

  // 7 — club bathroom fluorescent light + 3am context → cocaine
  {
    name: 'clubBathroomLate',
    substance: 'cocaine',
    delta: 0.65,
    durationMs: 10 * 60 * 1000,
    match(ctx) {
      if (typeof ctx.localHour !== 'number') return false;
      if (ctx.localHour >= 4 && ctx.localHour < 24) return false;
      if (!tagHas(ctx.visualTags, 'fluorescentBathroom')) return false;
      return ctx.locationTag === 'nightclub';
    },
  },
];

/**
 * Walk every trigger, fire matching ones into the scheduler's craving
 * intake. Returns the list of trigger names that fired (for telemetry).
 *
 * @param {DrugScheduler} scheduler
 * @param {object} ctx - see file header for shape
 * @returns {string[]} names of triggers fired this tick
 */
function evaluateTriggers(scheduler, ctx) {
  if (!scheduler || typeof scheduler.addCraving !== 'function') return [];
  const fired = [];
  for (const trig of TRIGGERS) {
    try {
      if (trig.match(ctx)) {
        scheduler.addCraving(trig.substance, trig.delta, trig.durationMs);
        fired.push(trig.name);
      }
    } catch { /* non-fatal — skip malformed matcher */ }
  }
  return fired;
}

export { TRIGGERS, evaluateTriggers };
export default evaluateTriggers;
