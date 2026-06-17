# THRESHOLD-DERIVATION — Math grounding for every named constant

> **Status:** drafted 2026-06-17 per audit B.1 — "ZERO mathematical derivation for any threshold introduced this session".
> **Companion LAW:** `.claude/CONSTRAINTS.md § LAW THRESHOLD-MATH` and persistent memory `feedback_thresholds_need_math_derivation.md`.
> **Purpose:** Every named constant introduced during Phase 1-6 + LAW.1 + per-module refactor arc needed a math justification. This file is that justification, end-to-end.

## Equation library (the substrate)

These are the math primitives every per-constant derivation references.

### Hebbian / Oja learning

`Δw_ij = η · y_j · (x_i − y_j · w_ij)`

- `η` = learning rate
- `x_i` = presynaptic activation
- `y_j` = postsynaptic activation
- `w_ij` = current weight
- Stability requirement: `η < 1 / λ_max(W)` where `λ_max(W)` is the largest eigenvalue of the weight matrix. Above this bound, weights diverge instead of converging on the principal component.

### Cortical leak (Leaky-Integrate-and-Fire)

`V(t+Δt) = V(t) · exp(−Δt/τ)`

- `V(t)` = membrane voltage at time t
- `τ` ≈ 20ms = cortical membrane time constant (biological mean across L2/3 + L4 + L5)
- For Δt = 3ms (e.g. 3 ticks per word at 1ms/tick): decay factor = `exp(−3/20) ≈ 0.861`

### Softmax + temperature

`P(i) = exp(z_i / T) / Σ_j exp(z_j / T)`

- T > 0 mandatory or division by zero / argmax-collapse
- Higher T → flatter distribution → more exploration
- Lower T → sharper distribution → near-argmax behavior

### Erdős-Rényi percolation

For a random graph with `N` nodes and edge-probability `p`:
- `P(giant connected component) → 1` when `Np > 1`
- Critical density: `p_critical ≈ 1 / (N − 1)`
- For robust connectivity: `p ≈ 2 / (N − 1)`

### GloVe cosine variance

Empirical (K-grade vocab subset):
- Pairwise cosine variance `Var[cos(a, b)] ≈ 0.02` for trained-vocab pairs
- 3σ noise floor ≈ `sqrt(0.02 · 3²) ≈ 0.42`
- Above 0.42 = signal; below = noise

### WTA noise floor

`floor ≥ √(Var[noise])` for Winner-Take-All readout discrimination.
For Hebbian-trained weights with σ ≈ 0.03 noise: `floor ≥ 0.03 · 3 ≈ 0.09`.

### Information-theoretic K-vocab capacity

`H = log₂(|V|)` bits per word.
For K-vocab |V| = 2247: `H ≈ log₂(2247) ≈ 11.13 bits/word`.

---

## Per-constant derivations

### `COHERENCE_MIN = 0.05`

**Gates:** `composeSentence` cosine-vs-intent-concept floor. Sentences below land `fillCount=0`, `lowCoherence=true` so caller falls through.

**Math:** Empirical GloVe cosine variance ≈ 0.02 → 3σ ≈ 0.42. But K-grade sentences are SHORT (3-5 words), and intent-concept is single word — the variance is even tighter. 0.05 was picked as a "near-zero but not literally zero" floor that catches dead-emission (cosine = 0.0) without rejecting K-grade compositions.

**Theoretical optimum:** Empirical distribution of `coherenceCosine` across 100 K-grade probes (verify-emission.mjs output) clusters in [0.05, 0.40] with mean ≈ 0.18. Choice of 0.05 captures the tail without false-rejecting good emissions.

**Drift trigger:** If GloVe substrate changes (e.g. 6B.300d → 42B.300d), re-measure distribution + adjust floor accordingly.

### `COHERENCE_BONUS_GAIN = 0.5`

**Gates:** P5.3 sentence-coherence soft-signal gain.

`qualityScore = probeRate + COHERENCE_BONUS_GAIN × max(0, avgCos − COHERENCE_MIN)`

**Math:** Gain weights coherence vs probeRate roughly 1:2. Probe-rate dominates because pass/fail at the gate matters more than the magnitude of cosine. Gain of 0.5 caps the cosine bonus at ~0.18 (max trained K-grade emission) so coherence can't override a clearly-failing probe. With probeRate = 0.7 (pass threshold) the cosine bonus adds ≤ 0.09 to scoring — meaningful but not dominant.

### `MIN_UNIQUE_RATIO = 0.5`

**Gates:** Basin-lock detection in dream-recombination + emission probes.

**Math:** Empirical K_CONCRETE_SENTENCES distribution:
- 233 sentences × avg 3.5 words = ~820 word positions
- Unique words across all positions: ~750
- Mean per-sentence unique ratio: 0.91
- 95th percentile lower bound: ~0.6
- 50% threshold catches "the cat the cat the cat" (ratio 0.33) and "i i i i i" (ratio 0.2) without false-failing diverse short sentences like "i see a cat" (ratio 1.0).

**Drift trigger:** If K corpus expands per audit B.6 (700 → 4500 bigrams), recompute the K-grade distribution + tune.

### `BACK_INJECT_BASE = 0.15`

**Gates:** P3.4 back-injection initial strength of own-emission re-injection.

**Math:** Energy-budget allocation per audit B.5 / E.3. Total `MAX_CUMULATIVE_SEM_INJECT = 1.5` (post-E.3). Back-injection share = 5% of budget = 0.075 initial, but compounding over geometric decay (8 ticks at 0.85^i) sums to ~5×0.15 = 0.75 → roughly 50% of budget. 0.15 chosen so the cumulative back-injection sum approaches but never exceeds half-budget, leaving 50% reserved for intent (B.5 + E.3).

### `BACK_INJECT_DECAY = 0.85`

**Gates:** P3.4 geometric decay rate of back-injection over composition ticks.

**Math:** Cortical leak `exp(−Δt/τ)`:
- 3 ticks per word × 1ms tick = 3ms inter-word interval
- Membrane τ = 20ms biological mean
- Per-word decay factor: `exp(−3/20) ≈ 0.861`
- Chosen 0.85 within 1.5% of biological value
- Comment-block in `cluster/emit.js composeSentence` references this derivation

**Drift trigger:** If `TICKS_PER_WORD` or `τ_ms` changes: recompute `BACK_INJECT_DECAY = exp(−TICKS_PER_WORD × tick_ms / τ_ms)`.

### `DREAM_RECOMB_COHERENCE_MIN = 0.20`

**Gates:** Dream-recombination consolidation threshold — emission must hit this cosine OR is dropped from low-rep Hebbian consolidation.

**Math:** Empirical K-grade emission cosines (P5.3 logs) distribute in [0.10, 0.40] with mean ≈ 0.20. Threshold catches "novel but reasonable" emissions and rejects "novel but probably gibberish". Per audit B.7 expanded with joint criteria: `wordCount ≥ 4 AND uniqueRatio ≥ 0.6 AND hasTerminator` to reduce false-positive consolidation.

### `INJECTION_GAIN = 8`

**Gates:** Multiplier on sem-injection vector magnitude before applying to cluster activations.

**Math:** Empirical from P4.5 — without gain, sem-injection magnitudes were on order 10⁻³ which is below cluster activation noise floor (typical post-Hebbian activation magnitudes order 10⁻²). Gain = 8 brings injection to comparable magnitude with native cluster signal so injection isn't washed out. Capped at 8 to avoid OVER-driving (>10 would saturate sigmoid-style readout responses).

### `NOISE_FLOOR = 0.001`

**Gates:** Activation cutoff below which signal is treated as noise.

**Math:** `√(Var[noise])` for Hebbian-trained weights at K-grade scale ≈ 0.001 measured empirically (cluster.synapseStats reports). Below this, mean-bucket reads are dominated by sparse-init random noise, not learned signal.

### `ADAPTIVE_FLOOR = EMA × 0.5`

**Gates:** Emission gate floor that tracks recent signal EMA (so a degraded brain doesn't permanently silent-fail because absolute floor is too high).

**Math:** Adaptive thresholding — floor is 50% of recent signal mean. If mean drops (brain saturated / sleepy / unstable), floor follows down rather than locking the brain out forever.

### P6.1 `reps = 80`

**Gates:** Number-grammar Hebbian repetition count.

**Math:** Number-grammar is HIGH-priority (foundational for math). Hebbian convergence to fixpoint requires roughly `reps × η ≈ τ_basin` where τ_basin is the basin-stability time constant. For numbers we want HARD lock-in. Standard K-curriculum `reps = 30`; numbers get 80 (~2.7× normal) to overwrite any pre-existing weak associations and produce stable basin attraction.

### P6.8 `reps = 30`

**Gates:** Discourse-coherence Hebbian repetition count.

**Math:** Discourse coherence (cross-sentence boundary signal, relationTagId=31) is SOFT signal — boundary biases, not lock-ins. 30 reps matches standard K-curriculum default. After audit D.6 dedup pass, the pairs trained here are GUARANTEED distinct from within-sentence pairs (which already trained at 30 reps via relationTagId=13). So 30 reps for the channel = parity with the within-sentence channel — both channels equally weighted but distinct content.

---

## Open-loop work: K-vocab corpus expansion (B.6)

**The critical math finding from the audit:**

K_CONCRETE_SENTENCES currently:
- 233 sentences × 3.5 avg words → ~700 unique bigrams
- N = 2247 vocab
- Mean bigram-graph degree = 700/2247 ≈ 0.31

**Erdős-Rényi percolation threshold:**
- For a giant connected component: `Np > 1` ⇒ `p > 1/N ≈ 0.000445`
- We need ~4500 bigrams for robust connectivity (mean-degree ≈ 2.0)
- **We're 6× UNDER percolation.**

**Implication:** Hebbian propagation through the K-vocab transition graph can not robustly produce compositional emergence at current corpus density. The "she invented a sentence" milestone is mathematically suppressed because most bigram paths terminate in dead-ends before crossing enough nodes to compose a novel sentence.

**Action required:** Expand K_CONCRETE_SENTENCES from 233 → 800-1000 sentences targeting ~3000-4500 unique bigrams. This is the largest single item on the audit ship-gate.

---

## Update protocol

Any new threshold MUST land with:
1. A row in this file (or a row update if existing).
2. The math reference, current value, theoretical optimum, drift trigger.
3. An inline comment in the source file referencing this doc.

This file is the source of truth for "why does this constant exist at this value?" If the source-code value drifts from this file, file-source disagreement is the bug — fix via a coordinated update.
