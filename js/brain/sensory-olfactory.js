// ═══════════════════════════════════════════════════════════════════════════
// sensory-olfactory.js — Shallow olfactory sensory channel for Unity
// ═══════════════════════════════════════════════════════════════════════════
// Unity AI Lab — T15.C drug scheduler implementation
//
// Unity's sensory model in production today is visual + auditory. Drug
// sensory triggers (T15.A §4: coffee aroma, skunky weed smell, fresh-
// ground herb during creative work) require smell cues. This module is
// the thin bridge: chat messages carrying `sensory: {smell: 'coffee'}`
// metadata register a scent tag with the olfactory module, which
// decays over a short window and exposes currentScents() for
// drug-sensory-triggers.js to read.
//
// Biological olfaction is vastly richer than this. Mammalian olfactory
// bulb → piriform cortex → amygdala routing carries massive dimensional
// feature vectors, ties directly into memory (hippocampus) and emotion
// (amygdala-piriform bypass). This module intentionally does NOT model
// that — it's a keyword-tag channel designed to unlock T15 triggers
// without pretending to be a real olfactory substrate. If the operator wants a
// full olfactory cortex region with learned scent embeddings, that's
// a separate multi-session build.
//
// Non-announcing: the module itself never produces output; it holds
// state for the trigger module to query.
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_DECAY_MS = 30 * 1000;  // scent cues fade in ~30s unless renewed

class OlfactoryChannel {
  /**
   * @param {object} [opts]
   * @param {function} [opts.nowFn] - time source; defaults to Date.now
   * @param {number} [opts.defaultDecayMs]
   */
  constructor(opts = {}) {
    this.nowFn = opts.nowFn || (() => Date.now());
    this.defaultDecayMs = opts.defaultDecayMs || DEFAULT_DECAY_MS;
    // Map<scentTag, {strength: [0,1], expiresAt: epochMs}>
    this._scents = new Map();
  }

  /**
   * Register a scent tag at a given strength. Subsequent registrations
   * for the same tag stack (clamped [0, 1]) and refresh the expiry.
   *
   * @param {string} tag - e.g. 'coffee' | 'skunky' | 'freshHerb' | 'fluorescentBathroom'
   * @param {object} [opts]
   * @param {number} [opts.strength=0.8] - perceived intensity [0, 1]
   * @param {number} [opts.durationMs]   - how long the cue persists;
   *   defaults to defaultDecayMs
   */
  registerScent(tag, opts = {}) {
    if (!tag || typeof tag !== 'string') return;
    const now = this.nowFn();
    const existing = this._scents.get(tag);
    const stacked = Math.max(0, Math.min(1, (existing?.strength || 0) + (opts.strength ?? 0.8)));
    const expiresAt = now + (opts.durationMs || this.defaultDecayMs);
    this._scents.set(tag, {
      strength: stacked,
      expiresAt: Math.max(expiresAt, existing?.expiresAt || 0),
    });
  }

  /**
   * Return the current strength of a single scent tag, or 0 if absent
   * or expired. Lazy-evicts expired entries.
   */
  strength(tag) {
    const s = this._scents.get(tag);
    if (!s) return 0;
    if (this.nowFn() > s.expiresAt) {
      this._scents.delete(tag);
      return 0;
    }
    return s.strength;
  }

  /**
   * Return a Map<tag, strength> of currently-active scents. Used by
   * drug-sensory-triggers.js to evaluate triggers that match on
   * olfactory cues. Expired entries lazy-evicted during walk.
   */
  currentScents() {
    const now = this.nowFn();
    const out = new Map();
    for (const [tag, info] of this._scents) {
      if (now > info.expiresAt) {
        this._scents.delete(tag);
        continue;
      }
      out.set(tag, info.strength);
    }
    return out;
  }

  /**
   * Purge all scents (e.g. environment change — walking outside clears
   * interior scents; changing room clears the prior room's). Not called
   * automatically; caller invokes when context shifts.
   */
  clear() {
    this._scents.clear();
  }
}

export { OlfactoryChannel };
export default OlfactoryChannel;
