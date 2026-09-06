/**
 * ⭐⭐ SELF-PRICING REP COMPRESSION — the compression factor decides itself from
 * the brain's OWN measured collision load, instead of carrying a constant that
 * was chosen against a corpus an eleventh of today's size.
 *
 * Standing instruction: the knobs must be set such that no more than one to
 * three reps are needed for anything — restating the broader rule that no more
 * than five reps should ever be required, and that the brain's thousands of
 * knobs can be adjusted to make a single pass act like thousands of passes.
 *
 * ⛔ THE ANSWER COULD NOT BE A NUMBER I TYPE IN. `DREAM_REP_COMPRESS=40` was
 * measured — but it was measured when the corpus held **4.48M words**, and the
 * academic prose alone now holds **50.2M across 2.54M sentences, 11.2× more**.
 * The sweep that produced that constant wrote its own expiry date into the code:
 *
 *   *"collision load is P·K²/COLS, so it rises with PAIR COUNT … the compression
 *   that is free today is the first thing that breaks when the pair count
 *   climbs. If retrieval/separability regresses after a corpus growth, THIS IS
 *   THE FIRST KNOB TO WALK BACK."*
 *
 * ⛔⛔ AND THE SWEEP'S TABLE SAYS THE DIRECTION OF THE ASK IS THE WRONG ONE. At
 * 6× the production load, 5 presentations score **43%** where 20 still score
 * 94%. Going 5 → 3 spends a margin that a 11.2× corpus growth has already been
 * eating. **So this module does not pick a smaller number. It picks the number
 * the measurement supports — which is smaller when the load is genuinely low,
 * and larger when it is not.**
 *
 * ⚠ WHAT THIS MODULE IS NOT: it is not a new experiment. Every accuracy figure
 * below is the REP_COMPRESS sweep's own published output — real SparseMatrix,
 * real ojaUpdate, rep-major ordering, scoring retrieval (does the correct post
 * still win the argmax) rather than margin, because *"the aggregate MARGIN is
 * preserved at every compression while retrieval can still collapse"*.
 */

/**
 * The measured sweep, as data.
 *
 * Rows are collision loads; columns are compression factors with the rep count
 * they produced from a 100-rep authored dose. Values are retrieval accuracy.
 *
 * ⚠ The 8× column at load 0.246 is taken from an earlier measurement run, which
 * scored it 99.0% at 1.6× production. The later re-run is HARSHER by
 * construction (*"it scores 8× at 76% where that reported 95.5%"*), so where the
 * two disagree the harsher number is kept. **Reading the ordering as the signal
 * and the absolute values as conservative is the sweep's own instruction.**
 */
export const SWEEP_LOADS = [0.246, 1.56, 6.25, 25];
export const SWEEP_COMPRESSIONS = [
  { factor: 1, reps: 100 },
  { factor: 5, reps: 20 },
  { factor: 8, reps: 13 },
  { factor: 12.5, reps: 8 },
  { factor: 20, reps: 5 },
];
/**
 * ⭐⭐ THE FLOOR OF WHAT WAS EVER MEASURED — derived from the table, never typed.
 *
 * ⛔ THIS IS THE NUMBER THAT ANSWERS *"a brain learns stuff once"* WITH "not yet
 * measured" INSTEAD OF WITH A GUESS. The sweep's smallest dose is 5
 * presentations. There is no row for 2 and no row for 1, so `safeCompressionFor`
 * cannot price a single pass — it can only decline to, which is the correct
 * behaviour and is also why the question stays open.
 *
 * ⚠ Reading a 1-rep or 2-rep figure off this surface would mean extrapolating
 * past the last measured column, which is the precise failure this module was
 * written to end. **Extending the table requires a new measurement run, not a
 * new constant** — and the run must use OVERLAPPING post patterns: one-hot posts
 * score 100% at every compression including 1×, producing a harness that cannot
 * fail and a number that means nothing.
 *
 * Derived from the table so it can never drift away from it: if a 1-rep row is
 * ever measured and appended, this follows automatically.
 */
export const SWEEP_MIN_REPS_MEASURED = SWEEP_COMPRESSIONS
  .reduce((m, c) => Math.min(m, c.reps), Infinity);

/** retrieval[loadIndex][compressionIndex] */
export const SWEEP_RETRIEVAL = [
  [1.000, 1.000, 1.000, 1.000, 1.000],   // 0.246 — production, as the sweep defined it
  [1.000, 0.940, 0.760, 0.610, 0.430],   // 1.56  — 6× harder
  [0.728, 0.240, 0.165, 0.118, 0.080],   // 6.25  — 25× harder
  [0.159, 0.048, 0.038, 0.023, 0.016],   // 25    — 100× harder
];

/**
 * ⭐⭐⭐ THE OVERLAPPING-POST SWEEP — the measurement the table above could not
 * make, run 2026-09-06 to answer *"a brain learns stuff once"* with a number.
 *
 * ⛔⛔ WHY A SECOND TABLE INSTEAD OF NEW ROWS ON THE FIRST: the original sweep
 * scored **1.000 across its entire production row, at every compression
 * including 20×**. A surface that cannot go down cannot tell you where the
 * cliff is. Its posts were effectively separable, so retrieval succeeded no
 * matter how little weight landed — a harness that cannot fail. **This run uses
 * OVERLAPPING posts (6 active of a 32-row pool, so patterns genuinely compete
 * for the same output rows) and the numbers move.** The two tables measure
 * different things and are kept apart rather than merged.
 *
 * Same instrument as before otherwise: real `SparseMatrix`, real `ojaUpdate`,
 * rep-major ordering, scoring RETRIEVAL (does the correct post win the argmax
 * against all 500 candidates) and not margin.
 *
 * Geometry: 128 post × 32,768 pre · P = 500 · `lr` ceiling 0.60 · authored dose
 * 100 reps × 0.0468, so the target asymptote is 99.171%.
 *
 * ⚠ THE `*` REGIME IS REAL AND IS THE WHOLE POINT. Preserving the asymptote at
 * n presentations needs `lr = 1-(1-target)^(1/n)`, which exceeds the 0.60
 * ceiling for every n below 8. So at n ≤ 5 the deposit is genuinely short —
 * n=1 reaches 60.0% of the target weight, n=2 84.0%, n=3 93.6%, n=5 99.0% —
 * and the question these rows answer is whether that shortfall MATTERS. Mostly
 * it does not; the load does.
 */
export const OVERLAP_LOADS = [0.056, 0.264, 0.560, 1.036, 2.220, 4.000];
export const OVERLAP_K = [2, 4, 6, 8, 12, 16];
export const OVERLAP_REPS = [1, 2, 3, 5, 8];
/** retrieval[loadIndex][repIndex] — rep counts are OVERLAP_REPS */
export const OVERLAP_RETRIEVAL = [
  [0.898, 0.972, 0.972, 0.972, 0.972],   // load 0.056
  [0.808, 0.876, 0.876, 0.876, 0.880],   // load 0.264 ← the production row
  [0.678, 0.756, 0.756, 0.756, 0.758],   // load 0.560
  [0.592, 0.612, 0.612, 0.612, 0.616],   // load 1.036
  [0.364, 0.380, 0.380, 0.380, 0.404],   // load 2.220
  [0.240, 0.242, 0.242, 0.242, 0.262],   // load 4.000
];
/** The full authored dose, measured only at the two loads the decision is between. */
export const OVERLAP_REFERENCE = {
  0.264: { 20: 0.890, 100: 0.952 },
  1.036: { 20: 0.646, 100: 0.866 },
};

/**
 * ⭐⭐⭐ THE FINDING, STATED PLAINLY BECAUSE IT INVERTS THE OBVIOUS READING.
 *
 * **Two presentations at load 0.056 retrieve at 97.2%. One hundred
 * presentations at load 1.036 retrieve at 86.6%.** The low-load pair wins by
 * 10.6 points while doing 1/50th of the work.
 *
 * Reading down a column instead of across a row is what makes it obvious:
 *
 *   n = 2 :  0.056 → 97.2%   0.264 → 87.6%   0.560 → 75.6%   1.036 → 61.2%
 *   n = 100:                 0.264 → 95.2%                   1.036 → 86.6%
 *
 * **Repetition buys single-digit points. Load buys tens of points.** Across the
 * whole grid, going from n=2 to n=100 is worth ~8 points at best, while halving
 * the load is worth 12–26. That is the same thing the module's own prose said
 * before any of this was measured — *"THE RISK IS NOT CONVERGENCE, IT IS
 * INTERFERENCE"* — now with the arithmetic attached.
 *
 * ⭐ AND IT LARGELY SETTLES THE REP QUESTION — WITH ONE EXCEPTION THAT IS ITSELF
 * INFORMATIVE. At every load **at or below 1.036**, `n=2` through `n=8` are flat
 * to within **0.4 points**: 97.2/97.2/97.2/97.2 · 87.6/87.6/87.6/88.0 ·
 * 75.6/75.6/75.6/75.8 · 61.2/61.2/61.2/61.6. **Presentations three through eight
 * buy nothing measurable there.**
 *
 * ⚠ **At the two HIGHEST loads they start to matter again** — 38.0 → 40.4 at
 * load 2.220 and 24.2 → 26.2 at 4.000, so n=8 is worth **2.0–2.4 points** over
 * n=2. A first draft of this comment claimed the plateau held "at every single
 * load"; **the data says otherwise and the claim was wrong.** ⭐ It is also
 * exactly what the interference account predicts: once collisions are severe
 * enough that a single write is reliably trampled, extra interleaved
 * presentations begin to buy back some of what was lost. **Repetition is the
 * remedy for interference you failed to prevent — which is why preventing it is
 * the better lever.**
 *
 * Only the step from 1 → 2 is worth much (2–7 points), and only the jump to the
 * full authored 100 adds more (a further 7–25, at 50× the cost).
 *
 * ⛔ WHAT THIS DOES NOT SAY: it does not say to set the rep count to 2 today.
 * The live load is a MEASURED quantity that `REPPRICE` now publishes, the
 * `semTopK` that produces it is one of several inputs, and no gate should move
 * off a synthetic grid. **It says which knob to turn, and that the knob is not
 * `lr` and not the rep count.**
 */
export const OVERLAP_VERDICT = Object.freeze({
  bestCheap: { load: 0.056, reps: 2, retrieval: 0.972 },
  worstExpensive: { load: 1.036, reps: 100, retrieval: 0.866 },
  repsPlateauFrom: 2,
  repsPlateauTo: 8,
  // The plateau is bounded, and the bound is stated rather than rounded away.
  repsPlateauHoldsUpToLoad: 1.036,
  repsPlateauMaxSpreadBelowBound: 0.004,
  repsPlateauMaxSpreadAboveBound: 0.024,
  note: 'load dominates repetition; n=2..8 flat within 0.4 points at loads <= 1.036, '
    + 'but worth 2.0-2.4 points at loads 2.220 and 4.000 — repetition buys back '
    + 'interference you did not prevent',
});

/**
 * Collision load — `P · K² / COLS`, the expected number of other patterns
 * sharing a given pre cell.
 *
 * ⛔⛔ NOTE THE SQUARE, AND NOTE THAT ONE COMMENT IN `curriculum.js` DROPS IT.
 * The defining line says `P * K^2 / COLS` and checks out against its own worked
 * figure (7,250 × 64 / 1,885,340 = 0.246, so K² = 64 and K = 8); a later comment
 * in the same file abbreviates it to `P·K / COLS`. **The squared form is the one
 * that reproduces the published number**, and using the other would understate
 * the load by a factor of K.
 */
export function collisionLoad(pairs, activePerPattern, cols) {
  const P = Math.max(0, Number(pairs) || 0);
  const K = Math.max(0, Number(activePerPattern) || 0);
  const C = Math.max(1, Number(cols) || 1);
  return (P * K * K) / C;
}

/**
 * ⭐⭐ COUNT THE COLLISIONS INSTEAD OF COMPUTING THEM — the honest form, and the
 * reason the formula above must not be used on this brain unaided.
 *
 * ⛔⛔ THE FORMULA HAS AN AMBIGUITY THAT CHANGES THE ANSWER BY SIX ORDERS OF
 * MAGNITUDE, and it was found while wiring it up rather than assumed away. The
 * live encoder is `_writeTiledPattern`: after `semTopK` (8) winner-take-all,
 * **8 feature dimensions survive**, and each one is tiled across
 * `floor(regionSize / featLength)` CELLS — about 6,284 of them at a 1.88M sem
 * region and a 300-dim embedding. So "K" is either:
 *
 *   K = 8       (surviving DIMENSIONS)      → load 7,250·64/1,885,340 = 0.246
 *   K = 50,272  (the CELLS they write)      → load larger by ~39,000,000×
 *
 * and "COLS" is either the 1.88M cells or the ~300 independent dimension groups.
 * ⚠ **Every cell inside one tile group carries the identical value and is
 * written together, so a group behaves as ONE feature, not as 6,284** — which
 * argues the dimension reading. But the sweep's harness ran a real SparseMatrix
 * with real columns, and which of these its geometry corresponds to is **not
 * something the comment settles.**
 *
 * ⛔ SO THE FORMULA IS NOT USED TO DRIVE ANYTHING. This function measures the
 * quantity the sweep actually DEFINED — *"the expected number of other patterns
 * sharing a given pre cell"* — by walking real patterns and counting. There is
 * no K, no COLS, and no interpretation: a cell touched by `m` patterns
 * contributes `m − 1` sharers to each of them.
 *
 * @param {Array<ArrayLike<number>|Set<number>>} patterns active-index lists
 * @returns {{load:number, patterns:number, cellsTouched:number,
 *            meanActive:number, maxSharers:number}}
 */
export function measureCollisionLoad(patterns) {
  const list = Array.isArray(patterns) ? patterns : [];
  if (!list.length) {
    return { load: 0, patterns: 0, cellsTouched: 0, meanActive: 0, maxSharers: 0 };
  }
  const touches = new Map();          // cell -> how many patterns wrote it
  let totalActive = 0;
  for (const p of list) {
    const idx = (p instanceof Set) ? p : p;
    for (const c of idx) {
      totalActive++;
      touches.set(c, (touches.get(c) | 0) + 1);
    }
  }
  // ⛔⛔ PER PATTERN, NOT PER CELL — AND THE SWEEP'S OWN PROSE AND FORMULA
  // DISAGREE ABOUT WHICH IT MEANS. Its words are *"the expected number of other
  // patterns sharing a given pre CELL"*, which is `Σ m(m−1) / Σ m` — and that
  // evaluates to `P·K/COLS`, the density. Its published FORMULA is `P·K²/COLS`,
  // which is `Σ m(m−1) / P`: the interference a whole PATTERN experiences,
  // summed across all K of its active cells.
  //
  // ⭐ Verified numerically under the sweep's own stated geometry (7,250
  // patterns, K=8, 1,885,340 columns): the per-cell reading returns 0.0309 and
  // the per-pattern reading returns 0.2461 against a published 0.246 — **the
  // two differ by exactly K, 7.97×**. The formula and the table are the pair
  // that were measured together, so the per-pattern reading is the one that
  // indexes the table, and matching the prose instead would have understated
  // the load by 8× and green-lit a compression the sweep never supported.
  //
  // ⚠ The per-cell density is kept and reported beside it, because it is the
  // more intuitive number and someone WILL quote the prose.
  let sharePairs = 0, maxSharers = 0;
  for (const [, m] of touches) {
    sharePairs += m * (m - 1);
    if (m > maxSharers) maxSharers = m;
  }
  return {
    load: sharePairs / list.length,
    cellDensity: totalActive > 0 ? sharePairs / totalActive : 0,
    patterns: list.length,
    cellsTouched: touches.size,
    meanActive: totalActive / list.length,
    maxSharers,
  };
}

/** Linear interpolation of the sweep's retrieval surface at an arbitrary load. */
function retrievalAt(load, ci) {
  const L = SWEEP_LOADS;
  if (load <= L[0]) return SWEEP_RETRIEVAL[0][ci];
  if (load >= L[L.length - 1]) return SWEEP_RETRIEVAL[L.length - 1][ci];
  for (let i = 0; i < L.length - 1; i++) {
    if (load >= L[i] && load <= L[i + 1]) {
      // ⚠ Interpolated in LOG load, because the sweep's own rows are roughly
      // geometric (0.246 → 1.56 → 6.25 → 25, about ×4 each). Interpolating
      // linearly across a geometric axis would read far too optimistic in the
      // middle of every interval — which is precisely where a real brain sits.
      const t = (Math.log(load) - Math.log(L[i])) / (Math.log(L[i + 1]) - Math.log(L[i]));
      const a = SWEEP_RETRIEVAL[i][ci], b = SWEEP_RETRIEVAL[i + 1][ci];
      return a + (b - a) * t;
    }
  }
  return SWEEP_RETRIEVAL[L.length - 1][ci];
}

/**
 * The largest compression the measurement supports at this load.
 *
 * ⛔ NEVER EXTRAPOLATES PAST THE SWEEP. A load above the highest measured row
 * clamps to that row, and a compression above the highest measured column is
 * never offered — the whole failure this replaces is a number used outside the
 * regime that justified it.
 *
 * @returns {{factor:number, expectedRetrieval:number, load:number, floor:number,
 *            capped:boolean, reason:string}}
 */
export function safeCompressionFor(load, floor = 0.95) {
  const f = Math.min(1, Math.max(0, Number(floor) || 0.95));
  let best = SWEEP_COMPRESSIONS[0], bestAcc = retrievalAt(load, 0), bestIdx = 0;
  for (let ci = SWEEP_COMPRESSIONS.length - 1; ci >= 0; ci--) {
    const acc = retrievalAt(load, ci);
    if (acc >= f) { best = SWEEP_COMPRESSIONS[ci]; bestAcc = acc; bestIdx = ci; break; }
  }
  const capped = bestIdx === SWEEP_COMPRESSIONS.length - 1;
  return {
    factor: best.factor,
    reps: best.reps,
    expectedRetrieval: bestAcc,
    load,
    floor: f,
    capped,
    // ⭐ The reason travels with the verdict, so a log line can say WHY this
    // number and not merely what it is. A compression with no reason attached
    // is the constant this module exists to replace.
    reason: capped
      ? `load ${load.toFixed(3)} is low enough for the highest compression the sweep measured (${best.factor}× → ${best.reps} reps, ${(100 * bestAcc).toFixed(1)}% retrieval); nothing beyond it has been measured`
      : bestIdx === 0
        ? `load ${load.toFixed(3)} supports NO compression at a ${(100 * f).toFixed(0)}% retrieval floor — the authored rep count stands`
        : `load ${load.toFixed(3)} supports ${best.factor}× (${best.reps} reps) at ${(100 * bestAcc).toFixed(1)}% retrieval; the next step up falls below the ${(100 * f).toFixed(0)}% floor`,
  };
}

/**
 * ⭐ THE PRODUCTION BASELINE THE SWEEP QUOTED, KEPT SO A LIVE READING CAN BE
 * COMPARED AGAINST IT RATHER THAN TRUSTED BLIND.
 *
 * ⛔⛔ AND A REAL DOUBT ABOUT IT, RECORDED RATHER THAN SMOOTHED OVER. That
 * figure is `7,250 pairs × 64 / 1,885,340 sem cells`, so it used **K = 8 active
 * cells per pattern** — a parameter of the synthetic harness. The live encoder
 * is `_writeTiledPattern`, which activates `floor(regionSize / featLength)` cells
 * for **every non-zero feature dimension**, so the real K is a property of the
 * embedding's density and the region's size and is nowhere near 8.
 *
 * **The two Ks are not the same quantity, so `0.246` should be treated as the
 * harness's load, not as a measurement of this brain.** That is exactly why the
 * live load is measured here instead of assumed, and why the measurement is
 * published before it is allowed to move anything.
 */
export const SWEEP_BASELINE = {
  pairs: 7250, activePerPattern: 8, cols: 1885340, load: 0.246,
  caveat: 'K=8 is the synthetic harness\'s active-cell count, not the live tiled encoding\'s',
};
