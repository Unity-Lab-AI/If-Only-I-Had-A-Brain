---
type: feedback
captured: 2026-06-17
trigger: audit G.2 — codify the math-derivation discipline as persistent memory
canonical-source: docs/THRESHOLD-DERIVATION.md
---

# ⛔ Every named threshold needs math derivation before commit

**Audit B.1 finding (Gee 2026-06-17):** Zero mathematical derivation existed for any named threshold introduced during the Phase 1-6 + A.K-LIFE + LAW.1 + per-module-refactor arc. Every value was picked by intuition. The audit's specific call: *"all based in math off real equation on how/why/what our brain code works/thinks/talks/builds/responds/asks/plays"*.

## Threshold-derivation LAW

Every named constant, threshold, or scaling factor added to the codebase MUST:

1. **Live with a math reference.** Inline comment OR `docs/THRESHOLD-DERIVATION.md` row explaining the equation / empirical distribution / theoretical bound that justifies the value.
2. **Reference the right equation family.**
   - Hebbian / Oja learning: `Δw = η·post·(pre − post·w)`, stability `η < 1/λ_max(W)`.
   - Cortical leak (LIF): `V(t+1) = V(t)·exp(−Δt/τ)` with τ≈20ms.
   - Softmax temperature: `P(i) ∝ exp(z_i/T)`, T > 0 prevents argmax collapse.
   - GloVe cosine variance: empirical for K-grade vocab.
   - Erdős-Rényi percolation: `P(giant component) → 1` when `np > 1`; critical p ≈ 1/(N−1).
   - WTA noise floor: ≥ `sqrt(Var[noise])` ≈ 3σ.
   - K-vocab information capacity: `H = log₂(|V|)` bits/word.
3. **Document drift on threshold change.** If the value moves, the math reference updates too. If the math says X but the chosen value is Y, document WHY (e.g., "post-hoc geometric-decay matches biological leak τ to within 1.5%").
4. **Empirical thresholds need a distribution histogram.** If a constant is "0.5 because anything below is statistically improbable", show the K-corpus distribution.

## Known threshold-derivation gaps (audit B.1-B.7 + sub-checks)

- `COHERENCE_MIN=0.05`, `COHERENCE_BONUS_GAIN=0.5`, `MIN_UNIQUE_RATIO=0.5`, `BACK_INJECT_BASE=0.15`, `BACK_INJECT_DECAY=0.85`, `DREAM_RECOMB_COHERENCE_MIN=0.20`, `INJECTION_GAIN=8`, `NOISE_FLOOR=0.001`, `ADAPTIVE_FLOOR = EMA × 0.5`, P6.1 `reps:80`, P6.8 `reps:30` — all picked by intuition pre-audit. Per-constant derivation rows now in `docs/THRESHOLD-DERIVATION.md`.
- **B.6 percolation gap:** K_CONCRETE_SENTENCES (233 sentences) yields ~700 unique bigrams across 2247 vocab. Mean-degree 0.31 << 1.0 (Erdős-Rényi percolation threshold). Compositional emergence via Hebbian propagation is **mathematically insufficient at current corpus density.** Need ~4500 unique bigrams (~800-1000 sentences) to cross percolation. **K-vocab corpus expansion is a B-track ship-gate.**

## Why this is LAW

Intuition-picked thresholds let a brain pass smoke tests but fail at the real workload. With math grounding:
- A value change is REASONED, not guessed.
- A boundary case has a derivation that anticipates it.
- The brain's behavior is INTERPRETABLE in terms of the underlying physics / information theory.

The pattern: every new threshold introduces a comment line `// derived from [equation/empirical study]` OR opens a `docs/THRESHOLD-DERIVATION.md` row with the math.

**Full B-track audit findings:** `docs/NewTodo.md § B`.
**Threshold reference:** `docs/THRESHOLD-DERIVATION.md`.

Related: [[feedback_mixin_attach_order]] (D-track architectural-discipline LAW); these two LAWs together close the "shipped but unverified" gap that the audit identified.
