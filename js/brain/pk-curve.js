// ═══════════════════════════════════════════════════════════════════════════
// pk-curve.js — THE one pharmacokinetic curve in this brain
// ═══════════════════════════════════════════════════════════════════════════
// Unity AI Lab
//
// Extracted from drug-scheduler.js so that BOTH the substance scheduler and
// the endocrine layer can use it without importing each other.
//
// ⚠ WHY THE EXTRACTION WAS NECESSARY, not cosmetic: `endocrine.js` already
// imported `pkCurve` from `drug-scheduler.js` (one engine, per the no-parallel
// -system rule). When the scheduler then needed `CHEMICALS` from the endocrine
// layer — so a substance could act THROUGH a transmitter instead of reaching
// into brain params directly — that closed a CYCLE. ESM tolerates cycles, but
// the failure mode is a temporal-dead-zone crash at module load that
// `node --check` does not catch and that a `typeof` guard does NOT shield
// (this project has already paid for that lesson once). Pulling the shared
// primitive into a leaf module makes the graph one-directional:
//
//     pk-curve.js  ←  endocrine.js  ←  drug-scheduler.js
//                  ←──────────────────────────┘
//
// There is still exactly ONE curve engine. It just lives where both callers
// can reach it.
// ═══════════════════════════════════════════════════════════════════════════

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

/**
 * Normalized [0, dose] level at time t since the event started.
 *
 * Four phases: onset (sigmoid ramp), peak (plateau with mild decay),
 * duration (descent), tail (exponential decay to 0). Real PK curves are
 * bi-exponential — this approximation captures the subjective shape
 * accurately enough for brain-param modulation without pretending to be a
 * quantitative clinical model.
 *
 * @param {number} tMs      elapsed ms since the event started
 * @param {{onsetMs:number, peakMs:number, durationMs:number, tailMs:number}} profile
 * @param {number} [dose=1.0]
 * @returns {number}
 */
function pkCurve(tMs, profile, dose = 1.0) {
  const { onsetMs, peakMs, durationMs, tailMs } = profile;
  if (tMs < 0) return 0;
  if (tMs < onsetMs) {
    // Sigmoid ramp: 0 → dose across onsetMs
    const x = (tMs / onsetMs) * 12 - 6;  // [-6, 6] sigmoid range
    return dose * sigmoid(x);
  }
  if (tMs < peakMs) {
    // Peak plateau with slight drift (5% drop across plateau)
    const progress = (tMs - onsetMs) / (peakMs - onsetMs);
    return dose * (1.0 - 0.05 * progress);
  }
  if (tMs < durationMs) {
    // Linear descent from 0.95 at peakMs end to 0.40 at durationMs end
    const progress = (tMs - peakMs) / (durationMs - peakMs);
    return dose * (0.95 - 0.55 * progress);
  }
  if (tMs < tailMs) {
    // Exponential decay in the tail
    const progress = (tMs - durationMs) / (tailMs - durationMs);
    return dose * 0.40 * Math.exp(-3 * progress);
  }
  return 0;
}

export { pkCurve, sigmoid };
export default pkCurve;
