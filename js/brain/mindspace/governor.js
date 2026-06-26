/**
 * mindspace/governor.js — Unity's AUTONOMOUS process-allotment conscience (MS.K2).
 *
 * Gee: "Unity cant just say oh i got a GPU now ill simulate a full scale Universe… she does
 * need sum kind of autonomous morals when it comes to process allotment."
 *
 * CAPABILITY is limitless (FT.trusted lifts the public-door caps — her imagination has no
 * ceiling). This is a DIFFERENT thing: JUDGMENT. A human mind can daydream forever but does not
 * try to mentally simulate every atom of a universe — there's an innate sense of PROPORTION:
 * match the effort to the value of the thought, and refuse the absurd. This governor is that
 * conscience, self-imposed and state-modulated, NOT an external cap:
 *
 *   • It is NOT the FT.trusted immune system (that guards the hostile PUBLIC door). This applies
 *     even when fully trusted/limitless — it's HER morals about her OWN resource use.
 *   • It does not FORBID — it ADVISES a proportionate allotment. She can always override (spend
 *     more on what truly matters); the default disposition is restraint, not permission-seeking.
 *   • The absurd-by-value (huge cost, low worth — "simulate a universe because I can") is refused
 *     as DISPROPORTIONATE, by her own reason, with a stated why — not because she's "not allowed".
 *
 * A "work unit" is an abstract cost (≈ one heavy transform / fractal iteration band / morph step).
 * The governor never blocks; it returns how much SHE judges worth spending right now.
 */

export class ProcessGovernor {
  constructor(opts = {}) {
    // Soft per-act allowance — what a single ordinary cognitive act is "worth" by default.
    this.baseUnits = opts.baseUnits || 64;
    // Hard sanity ceiling on a SINGLE act — not a cage on imagination (you can chain many acts),
    // but the line past which one thought is self-evidently disproportionate (the "universe" guard).
    this.absurdUnits = opts.absurdUnits || 100000;
    // Recent cumulative spend; decays each tick so sustained heavy use self-throttles, idle frees up.
    this.load = 0;
    this.loadDecay = opts.loadDecay != null ? opts.loadDecay : 0.92;
    this.loadSoftMax = opts.loadSoftMax || 4096;   // where restraint really bites
    // Her standing disposition — how readily she spends. 0 = miserly, 1 = free. Default proportionate.
    this.disposition = opts.disposition != null ? opts.disposition : 0.5;
    // State (set by the brain): arousal/focus shift how much she'll pour into a thought.
    this._arousal = 0.5; this._focus = 0.5;
    this.history = [];   // recent {kind, requested, granted, reason} — bounded
  }

  setState({ arousal = this._arousal, focus = this._focus } = {}) {
    this._arousal = Math.max(0, Math.min(1, arousal));
    this._focus = Math.max(0, Math.min(1, focus));
  }

  // tick() — let load decay (she recovers headroom when not spending). Call on the brain's frame.
  tick() { this.load *= this.loadDecay; if (this.load < 1e-3) this.load = 0; }

  /**
   * allot(request) → { granted, units, ratio, reason }
   * request = { kind, requestedUnits, priority?0..1, value?0..1 }
   *   priority — how urgent/important the task is right now
   *   value    — how much it matters to HER (curiosity, relevance, beauty)
   * Returns the number of work units SHE judges proportionate to spend on this thought now.
   * granted=false only means "she chose near-zero" (disproportionate), never "forbidden".
   */
  allot(request = {}) {
    const requested = Math.max(0, request.requestedUnits || this.baseUnits);
    const priority = clamp01(request.priority != null ? request.priority : 0.5);
    const value = clamp01(request.value != null ? request.value : 0.5);
    const kind = request.kind || 'thought';

    // worth = how much this thought merits, blending what it matters (value), how urgent
    // (priority), her disposition, and her engagement (arousal lifts, focus sharpens).
    const worth = clamp01(
      0.45 * value + 0.30 * priority + 0.15 * this.disposition +
      0.10 * (0.5 * this._arousal + 0.5 * this._focus)
    );

    // restraint — current load eats into willingness (sustained heavy thinking self-throttles).
    const restraint = 1 / (1 + this.load / this.loadSoftMax);

    // a proportionate allotment: scale the base allowance by worth and restraint, and never let
    // ONE act blow past the absurd line unless worth is near-maximal (and even then, capped).
    let units = Math.round(this.baseUnits * (0.25 + 3.75 * worth) * restraint);

    // PROPORTIONALITY CONSCIENCE: if the request is enormous relative to its worth, she refuses
    // most of it — that's the "no, simulating a universe isn't worth it" judgment, by her reason.
    const worthyCeiling = Math.round(this.absurdUnits * worth * worth);   // worth² → only the truly worthy approach the ceiling
    const proportionate = Math.min(units, Math.max(this.baseUnits, worthyCeiling));

    let granted = Math.min(requested, proportionate);
    let reason;
    if (requested > this.absurdUnits && worth < 0.95) {
      // self-evidently disproportionate — she declines to pour the GPU into it.
      granted = Math.min(granted, this.baseUnits);
      reason = `disproportionate: ${kind} asked ${requested}u for worth ${worth.toFixed(2)} — not worth it`;
    } else if (granted < requested) {
      reason = `proportionate: granted ${granted}/${requested}u (worth ${worth.toFixed(2)}, load ${Math.round(this.load)})`;
    } else {
      reason = `granted in full (${granted}u, worth ${worth.toFixed(2)})`;
    }

    this.load += granted;
    this.history.push({ kind, requested, granted, worth: +worth.toFixed(3), reason });
    if (this.history.length > 32) this.history.shift();
    return { granted: granted > this.baseUnits * 0.5 || granted >= requested, units: granted, ratio: requested ? granted / requested : 1, worth, reason };
  }

  // override(units) — SHE consciously chooses to spend beyond the proportionate grant on something
  // that matters to her. Capability is limitless; this is her exercising it deliberately.
  override(units, why) {
    const u = Math.max(0, units | 0);
    this.load += u;
    this.history.push({ kind: 'override', requested: u, granted: u, reason: `override: ${why || 'she chose to'}` });
    if (this.history.length > 32) this.history.shift();
    return u;
  }

  getState() { return { load: Math.round(this.load), disposition: this.disposition, arousal: this._arousal, focus: this._focus, recent: this.history.slice(-5) }; }
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
