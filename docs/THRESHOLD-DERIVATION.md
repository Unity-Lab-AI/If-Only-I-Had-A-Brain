---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE — 2026-06-17 here,
# so its sources have had two months to move. That is the point of the stamp.
status: draft
sources:
  - js/brain/neurons.js
  - js/brain/gpu-compute.js
  - js/brain/cluster.js
  - js/brain/cluster/emit.js
  - js/brain/curriculum.js
  - js/brain/consolidation-engine.js
  # Added 2026-09-06 — the drift checker was right: this page makes LINE-PRECISE
  # claims about these files and did not declare them, so check 8 could never
  # flag it when they moved. `rep-compression.js` joins them with the
  # self-pricing + lateral-hint derivations added the same day.
  - server/brain-server.js
  - donor-app/src/donor.rs
  - js/brain/rep-compression.js
verified-scope: |
  CHECKED 2026-08-27 — every named constant on this page looked up in source:
    - CORRECTED (5): BACK_INJECT_BASE 0.15->0.24, BACK_INJECT_DECAY 0.85->0.92,
      COHERENCE_MIN (a three-way name collision: 0.15 / 0.05 / 0.80, with this
      page attributing one site's value to another site's gate), the
      consolidation cap 30s -> 45s routine + 120s forced, and the B.6
      percolation section (233->2,881 sentences, ~700->7,831 bigrams,
      0.31->3.485 mean degree; the "6x UNDER percolation" verdict INVERTED).
    - VERIFIED UNCHANGED (10): COHERENCE_BONUS_GAIN 0.5, MIN_UNIQUE_RATIO 0.5,
      DREAM_RECOMB_COHERENCE_MIN 0.20, INJECTION_GAIN 8, NOISE_FLOOR 0.001,
      MAX_CUMULATIVE_SEM_INJECT 1.5, ADAPTIVE_FLOOR = EMA x 0.5, P6.1 reps 80,
      P6.8 reps 30, K_VOCABULARY 2247.
    - corpus/bigram figures MEASURED by importing the real modules and
      counting, not by reading the array literal.
  NOT CHECKED — do not read this page as authority on:
    - whether the back-inject call at emit.js:1723 is subject to the
      MAX_CUMULATIVE_SEM_INJECT budget accounting at :1470-1489. The old
      "50% reserved for intent" claim was WITHDRAWN rather than restated,
      because I could not confirm the path is budget-enforced.
    - whether the bigram graph is ONE giant component or several islands.
      Mean degree clears the threshold; that is not a connectivity proof, and
      a mean can clear a bound while the graph is fragmented.
    - the I.2 / I.10 / I.13 / I.14 / I.17 / I.18+I.20 session-114.19fp
      constants (timeouts, log thresholds, ring sizes) - NOT re-read.
    - the equation-library primitives at the top (Hebbian/Oja, leak, softmax,
      Erdos-Renyi, GloVe variance) - these are math, not code claims.
  ⚠ THE PREDICTED SELF-DRIFT, NOW CLOSED. The pass that wrote this page also
  edited two of its sources - js/brain/cluster/emit.js and
  js/brain/consolidation-engine.js - to demote the stale comments it documents,
  and warned that the resulting drift row would be the checker being CORRECT.
  It was. Those commits now EXIST (the change measures +13/-1 across the two
  files and is the only movement in either since), so the stamp can name them.
  ⛔ COMPLETING the stamp, not silencing it: both edits are COMMENT-ONLY -
  verified, not assumed, because the rebuilt bundle is byte-identical at
  4,426,103 bytes since esbuild strips comments - and the only reason the
  original stamp could not name them is that a commit cannot contain its own
  hash. ⛔ The rule stands for everything else: never clear a drift row by
  bumping a hash on a source you have not read.
last-verified: "cd465955 2026-08-29"
---

# THRESHOLD-DERIVATION — Math grounding for every named constant

> **Status:** drafted 2026-06-17 per audit B.1 — "ZERO mathematical derivation for any threshold introduced this session".
> **Companion LAW:** `.claude/CONSTRAINTS.md § LAW THRESHOLD-MATH` and persistent memory `feedback_thresholds_need_math_derivation.md`.
> **Purpose:** Every named constant introduced during Phase 1-6 + LAW.1 + per-module refactor arc needed a math justification. This file is that justification, end-to-end.
>
> **Re-verified 2026-08-27 (DOCPROV.4, 6 of 22 — the OLDEST baseline on the board, stamped 2026-06-17 with two months for its sources to move).** ⭐ **Every named constant was looked up in source; ten held, five had moved, and one section had inverted from true to false.** ⛔ **The big one: the "Open-loop work: K-vocab corpus expansion" section declared itself *"the largest single item on the audit ship-gate"* and stated that her sentence invention was *"mathematically suppressed"* — measured, `K_CONCRETE_SENTENCES` is 2,881 not 233, unique bigrams 7,831 not ~700, mean degree 3.485 not 0.31. The gap it described was closed and the page kept asserting it, which handed any emission investigation a mathematically-dressed false cause while `EMITZERO.1` sits open.** ⛔ **`BACK_INJECT_BASE` is 0.24 and `BACK_INJECT_DECAY` is 0.92** (`emit.js:1719-1720`) — this page said 0.15/0.85; ⭐ **the code is right and carries its own superseding WORD-ORDER REBALANCE derivation**, which names the old values as a *cause of scrambled output*, so this was not drift but a doc that never caught up. ⛔ **`COHERENCE_MIN` is THREE different constants** — 0.15 (`cluster.js:261`, the composeSentence floor this page describes), 0.05 (`curriculum.js:17030`, a bonus floor, not a gate) and 0.80 (`curriculum.js:18626`) *(line numbers re-pointed 2026-08-29 — the SUBJRETIRE + ASSOCBOUND.1 curriculum additions shifted them; both values re-verified unchanged)* — and the page documented the second one's value against the first one's gate. ⛔ **The consolidation cap is 45s routine / 120s forced, not 30s.** ⚠ **Two STALE IN-CODE COMMENTS fixed in the same commit** (`emit.js:1689` asserting 0.85 twenty lines above `= 0.92`; `consolidation-engine.js:114` saying "default 30s" above 45000/120000) — **a wrong comment beside a right value is worse than no comment, because it is what stops the next reader checking.** ⭐ **VERIFIED UNCHANGED and worth stating so nobody re-checks:** `COHERENCE_BONUS_GAIN 0.5`, `MIN_UNIQUE_RATIO 0.5`, `DREAM_RECOMB_COHERENCE_MIN 0.20`, `INJECTION_GAIN 8`, `NOISE_FLOOR 0.001`, `MAX_CUMULATIVE_SEM_INJECT 1.5`, `ADAPTIVE_FLOOR = EMA × 0.5`, P6.1 `reps = 80`, P6.8 `reps = 30`, `K_VOCABULARY = 2247`.

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

### `COHERENCE_MIN` — ⛔ THREE different constants share this name, with three different values

⛔ **CORRECTED 2026-08-27: this entry documented the value of one `COHERENCE_MIN` against the gate of a different one.** Enumerated from source, there are three:

| site | value | what it actually gates |
|---|---|---|
| `js/brain/cluster.js:261` | **0.15** (env `DREAM_COHERENCE_MIN`, `> 0` wins) | ⭐ **This is the `composeSentence` floor this entry describes** — and it is `0.15`, not `0.05` |
| `js/brain/curriculum.js:17030` | **0.05** | The P5.3 **quality-bonus** noise floor — below it, `coherenceBonus` is simply not added. **Not a rejection gate at all** |
| `js/brain/curriculum.js:18626` | **0.80** | `_probeCM2MysteryPsiCoherence` per-trial threshold, 15 trials |

⚠ **Line numbers re-pointed 2026-08-29:** the SUBJRETIRE/`subjectsOwedAt` ledger functions and the ASSOCBOUND.1 `assocCallers` tally added to `curriculum.js` (2026-08-27/28) shifted `:16906`→`:17030` and `:18502`→`:18626`. **Both values re-verified unchanged** (0.05 and 0.80), as is `cluster.js:261` = 0.15. The other changed source since the previous stamp, `gpu-compute.js`, gained only the RHYTHM3S.2 per-region attention gains inside `updateRegionGates` — nothing this page derives touches it.

⚠ **So `0.05` was a real value in the codebase — attached to the wrong mechanism here.** The distinction matters: at `0.05` the entry reads as *"emissions are rejected below 0.05"*, when the composeSentence floor is **three times higher** and the `0.05` figure governs whether a **bonus** is applied. ⛔ **A name collision is the most dangerous shape a constant table can have** — every value in the table is individually real, so nothing looks wrong.

**Gates (corrected):** the `cluster.js:261` value is the `composeSentence` cosine-vs-intent-concept floor. Sentences below it land `fillCount=0`, `lowCoherence=true` so the caller falls through.

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

### `BACK_INJECT_BASE = 0.24` ⛔ *(this file said `0.15` until 2026-08-27)*

**Gates:** P3.4 back-injection initial strength of own-emission re-injection.

⛔ **CORRECTED 2026-08-27. The live value is `0.24` (`js/brain/cluster/emit.js:1719`), not `0.15`.** ⭐ **And the important part is that the CODE is right and this page was wrong** — the change is not undocumented drift. `emit.js:1700-1719` carries a full superseding derivation under the heading **WORD-ORDER REBALANCE**, whose reasoning is worth reading before touching either constant:

> the bio-leak default (base 0.15, decay 0.85) left the prior-word transition signal too weak against the persistent ~0.30 intent seed, so per-tick argmax selected words by **topic-similarity to the intent** rather than by **grammatical sequence given the prior word** → topically-correct but scrambled word-salad.

⭐ **So `0.15` was not merely re-tuned — it was identified as a CAUSE of scrambled output and deliberately traded away from pure cortical-leak timing.** The code states its own replacement bound: **asymptotic magnitude `base × 1/(1−decay) = 0.24 / 0.08 = 3.0`** worst case on `sem` (against `1.0` under the old `0.15/0.85`), held below that in practice by per-tick cortical leak.

⚠ **The named tuning lever, quoted so nobody re-derives it:** *"FIRST knob to turn if the live walk reads grammatical yet wanders off the prompt's topic: lower BASE toward 0.18 and/or DECAY toward 0.88."* The pair is explicitly the lever between **topical word-salad** (back-inject too weak) and **grammatical-but-off-topic drift** (too strong).

⛔ **DO NOT read this as a diagnosis of `EMITZERO.1`.** The constants were, per the same comment, *"validated on a live GPU emission run (headless can't exercise emission)"*, and `EMITZERO.1` is filed as a question with evidence and no cause. ⚠ **One thing I did NOT establish and am not asserting:** whether the back-inject call at `:1723` passes through the budgeted injection path at all — it calls `injectEmbeddingToRegion` directly, while the `MAX_CUMULATIVE_SEM_INJECT` accounting lives at `:1470-1489` with per-source `budgetShare` clamps. **The old prose below claimed a 50%-of-budget reservation; I could not confirm that this path is budget-enforced, so the claim is withdrawn rather than restated with a new number.**

**SUPERSEDED derivation, kept for the record:** *Energy-budget allocation per audit B.5 / E.3. Total `MAX_CUMULATIVE_SEM_INJECT = 1.5` (post-E.3). Back-injection share = 5% of budget = 0.075 initial, but compounding over geometric decay (8 ticks at 0.85^i) sums to ~5×0.15 = 0.75 → roughly 50% of budget. 0.15 chosen so the cumulative back-injection sum approaches but never exceeds half-budget, leaving 50% reserved for intent (B.5 + E.3).* ⚠ `MAX_CUMULATIVE_SEM_INJECT = 1.5` **is still correct** (`emit.js:1476`) — verified this pass.

### `BACK_INJECT_DECAY = 0.92` ⛔ *(this file said `0.85` until 2026-08-27)*

**Gates:** P3.4 geometric decay rate of back-injection over composition ticks.

⛔ **CORRECTED 2026-08-27. The live value is `0.92` (`js/brain/cluster/emit.js:1720`).** Same WORD-ORDER REBALANCE change as `BACK_INJECT_BASE` above — the decay was *softened* on purpose so mid-sentence words keep strong next-word steering instead of fading into the topic centroid, letting the trained word→word transition (`relationTagId=13`) actually drive sequencing tick-by-tick.

⛔ **The biological derivation no longer describes the live value, and that is deliberate — but the arithmetic must not be left implying otherwise.** `exp(−3/20) ≈ 0.861`; `0.92` is **6.9% above** it, not *"within 1.5%"*. Inverted, `0.92` corresponds to `Δt/τ = −ln(0.92) ≈ 0.0834`, i.e. a **~1.67ms** effective inter-word interval at `τ = 20ms` — **not** the 3ms the derivation assumes. ⭐ **The code says so itself:** *"Deliberate trade above pure cortical-leak timing."*

**SUPERSEDED derivation, kept for the record (audit B.3):** *Cortical leak `exp(−Δt/τ)`; 3 ticks per word × 1ms tick = 3ms inter-word interval; membrane τ = 20ms biological mean; per-word decay `exp(−3/20) ≈ 0.861`; chosen 0.85 within 1.5% of biological value.*

⚠ **The old "Drift trigger" is now MISLEADING and is retired:** *"recompute `BACK_INJECT_DECAY = exp(−TICKS_PER_WORD × tick_ms / τ_ms)`"* would drive the value back to ~0.861 and silently reintroduce the word-salad this constant was raised to fix. **The live drift trigger is the emission quality itself** — the lever quoted in the `BACK_INJECT_BASE` entry above.

⛔ **A stale in-code comment was fixed in the same commit.** `emit.js:1689-1696` asserted *"BACK_INJECT_DECAY=0.85 biological derivation … Chosen 0.85 within 1.5% of biological"* **twenty lines above `const BACK_INJECT_DECAY = 0.92`**, with no marker separating the two — so the file contradicted itself and the older block read as current. It is now labelled SUPERSEDED in place. ⭐ **Same class as the `visual-cortex.js` header that claimed an LLM in the perception path: a comment that was true when written and was never demoted when the code moved past it.**

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

### The four saturation thresholds — `DREAM_SAT_*` ⭐ *(derived 2026-09-03; this page had none of them)*

**Gates:** whether the sem→motor projection is declared SATURATED — the state in which every concept drives the same motor pattern, so she emits without discriminating. Consumed at `cluster.js:2206` (plasticity brake, ANDed with `surpriseGate > 0.5`) and `cluster.js:2662` (the health verdict). The detector fires when

```
    meanAbs > wMax × DREAM_SAT_MEANABS   AND   maxAbs/meanAbs < DREAM_SAT_RATIO
```

or, independently, when `meanCos > DREAM_SAT_MEANCOS`.

⛔ **Their own block said the quiet part: *"conservative defaults match prior hardcoded values; env vars only deviate when empirical 20hr-test data justifies a shift."* That data was never gathered, so all four were inherited numbers with no stated meaning.** The 20-hour run is still the right way to CALIBRATE them; it is not needed to say what they mean, and this section is the second thing.

**Math — computed over 200,000 samples per distribution (deterministic LCG, `wMax = 0.4`):**

| weight distribution | `meanAbs/wMax` | `maxAbs/meanAbs` | detector |
|---|---:|---:|---|
| uniform `[0, wMax]` — healthy spread | 0.495 | 2.02 | healthy |
| exponential — sparse Hebbian-like | 0.165 | 12.08 | healthy |
| very sparse — a few strong | 0.021 | 48.07 | healthy |
| mildly concentrated | 0.999 | 1.15 | **SATURATED** |
| near-flat — fully saturated | 1.000 | 1.03 | **SATURATED** |

⭐ **`DREAM_SAT_MEANABS = 0.6` is uniform-plus-20%.** A uniform spread over `[0, wMax]` has mean exactly `wMax/2` — the simulation returns **0.495**, matching theory. So the threshold asks *"has the mean climbed a fifth above what an even spread would give?"* **Uniform is the natural zero point for "no concentration", and 0.6 is the first defensible step above it.**

⭐ **`DREAM_SAT_RATIO = 1.5` is uniform-minus-25%.** Uniform gives `max/mean = 2.0` (simulation: **2.02**); a perfectly flat distribution gives **1.0**. The threshold sits between them, so it asks *"is the peak less than 1.5× the mean — i.e. is the distribution more than halfway from uniform to flat?"* Sparse Hebbian weights sit at **12** and genuinely sparse ones at **48**, so the healthy cases clear it by an order of magnitude and the test is not delicate.

⭐ **The AND is load-bearing and the two terms are anti-correlated**, which is why neither alone would do: a high `meanAbs/wMax` arrives together with a low `max/mean` only when the mass has genuinely flattened. Every healthy row above fails BOTH conditions; every saturated row passes both.

⭐ **`DREAM_SAT_SAMPLE = 1000` resolves that gap at ~6σ.** Relative standard error of the mean is `CV/√n`; at `n = 1000` and `CV ≈ 1` that is **3.16%**. The gap the threshold must resolve is 0.50 → 0.60, i.e. **20%**, which is **≈ 6.3 standard errors**. Sampling is by stride over the whole array rather than a prefix, so it is a spread sample and not a corner of the matrix.

⭐ **`DREAM_SAT_MEANCOS = 0.7` is ~16σ above chance.** For random vectors in `d` dimensions, `E[cos] = 0` and `SD = 1/√d`:

| `d` | SD of cos | 0.7 in σ |
|---:|---:|---:|
| 128 | 0.0884 | 7.9 |
| 256 | 0.0625 | 11.2 |
| 512 | 0.0442 | 15.8 |
| 1024 | 0.0313 | 22.4 |

So at any plausible sem width, 0.7 means *"essentially every concept points the same way"* — it cannot be reached by chance, which is the property a saturation alarm needs. ⚠ **It is deliberately far out**: this term gates PLASTICITY, so a false positive stops her learning.

⚠ **VERIFIED PRODUCED, because a threshold on a field nobody writes is worth nothing.** `_lastSemMotorMeanCos` is set at `curriculum.js:18558` from the separability probe's `meanCos`, nulled at `:9996` and `:10011`, and persisted across restart via `brain-server.js:7288`/`8532`. **I suspected it was producer-less — like `separability` and `meanVoltage` before it — and it is not.** Checked before writing rather than retracted after.

⛔ **WHAT THIS SECTION DOES NOT CLAIM.** These are derivations of what the numbers MEAN against reference distributions, not measurements of *her* weight distribution. The 20-hour empirical calibration the code block asks for is still owed, and **the falsifier is now stated: if a live `[SatHealth]` sample on a healthy brain reports `meanAbs/wMax > 0.6` with `ratio < 1.5`, the thresholds are wrong and this table says by how much.**

### `DREAM_RANGE_MAX_RUNS = 16` ⛔ *NOT a tunable — it is a peer's contract*

**Gates:** the maximum number of runs a range-compressed Hebbian pattern may carry before the GPU path refuses it and the update falls to the full CPU pass.

**Math: there is none to do, and that is the finding.** **16 is the donor's own acceptance limit (`donor.rs:1249`).** Any value above it ships frames the donor **discards in silence** while this side records them as GPU-carried — skipping the CPU pass **4 times in 5**. Matching the peer's contract is the only setting under which *"nothing is ever dropped"* is true. It was `65,536` until `READBACKEYE.3` (2026-08-30).

⭐ **The env var is an upgrade path, not a dial:** when a donor ships a raised handler cap, set this to **that donor's number**. ⛔ **Raising it to buy speed buys the speed with her weights.**

⚠ **WHAT IS ACTUALLY UNKNOWN IS THE BILL, NOT THE VALUE** — and the board row filed this as a value awaiting measurement, which is the wrong half. The honest answer is a range, priced live at 115.6 min:

- ranges path = `gpu` 6,278 vs `boundGpu` 60,524 → **9.4% of intra dispatches**
- mean full CPU pass = `1,576,315 ms / 7,128` = **221.1 ms**
- **WORST** (nothing compresses to ≤16 runs): all 6,278 become full CPU passes → **+1,388 s on a 6,936 s boot, +20% wall clock**, cpuMs 23.9% → ~43.9%
- **BEST** (every accepted pattern already fits): **zero change, nothing was ever lost**

⛔ **`rangesRunsOkMax` cannot narrow it — it is a MAX, and a max cannot price a cap** (the third time that shape has bitten in that file). A bucket counter now ships to answer it on the next press. **Until then no claim is made about how much was lost, and correctness wins: her training is not traded for wall clock while the number is unknown.**

### `DREAM_CHAT_COHERENCE_FLOOR = 0.10` ⚠ *genuinely uncalibrated — the experiment is stated instead*

**Gates:** chat-only. Below this coherence an emission is **refused and degraded to a single honest word** rather than shipping salad. Gate and probe paths never reach it.

**Math: none yet, and the source says so — *"Env-tunable; calibrate on the live walk."*** This section deliberately does **not** invent one. What can be said now:

- It sits **below** `DREAM_RECOMB_COHERENCE_MIN = 0.20`, whose own derivation puts K-grade emission cosines in **[0.10, 0.40], mean ≈ 0.20**. So 0.10 is the **bottom of the observed range** — a floor that refuses only the worst of what was seen, not a median split.
- That placement is consistent: consolidation should be choosier (0.20) than speech (0.10), because a bad memory is permanent and a bad sentence is not.

⭐ **THE EXPERIMENT, so the next press can settle it rather than re-deferring:** capture the coherence of every chat emission for one session alongside whether a human would call the output salad. **The floor belongs at the value that maximises refusals-of-salad minus refusals-of-good-speech.** ⛔ **The falsifier in both directions:** if she goes silent on replies that read fine, 0.10 is **too high**; if salad ships at coherence above 0.10, it is **too low**. Either observation moves it — nothing else should.

⚠ **This interacts with `NOFALLBACK.5`, and that is why it cannot be calibrated from the current run:** removing the dictionary oracle removes ~99% of emissions in the captured run, so the coherence distribution this floor must sit inside **is about to change shape**. Calibrating against today's oracle-carried emissions would fit the floor to a lane that is being deleted.

### P6.8 `reps = 30`

**Gates:** Discourse-coherence Hebbian repetition count.

**Math:** Discourse coherence (cross-sentence boundary signal, relationTagId=31) is SOFT signal — boundary biases, not lock-ins. 30 reps matches standard K-curriculum default. After audit D.6 dedup pass, the pairs trained here are GUARANTEED distinct from within-sentence pairs (which already trained at 30 reps via relationTagId=13). So 30 reps for the channel = parity with the within-sentence channel — both channels equally weighted but distinct content.

---

## ✅ CLOSED: K-vocab corpus expansion (B.6) — the percolation gap is GONE, and this page said otherwise for two months

⛔ **THE MOST CONSEQUENTIAL CORRECTION ON THIS PAGE.** The section below declared *"the largest single item on the audit ship-gate"* and asserted that **her sentence invention was "mathematically suppressed."** ⭐ **Measured 2026-08-27 by loading the real modules and counting — not by reading the array:**

| quantity | this page claimed | **measured** | verdict |
|---|---|---|---|
| `K_CONCRETE_SENTENCES` | 233 | **2,881** | **12.4× larger** |
| avg words / sentence | 3.5 | **4.97** | longer too |
| total word positions | ~820 | **14,308** | — |
| unique bigrams | ~700 | **7,831** | **11.2× more** |
| mean bigram-graph degree (bigrams ÷ N) | 0.31 | **3.485** | — |
| stated target for robust connectivity | ~4,500 bigrams / degree ≈ 2.0 | **exceeded by 74%** | ⭐ **PASSED** |

`N = 2247` (`K_VOCABULARY`) **is still correct** — verified, and the only number in the old block that survived.

⛔ **Why this mattered more than a wrong number:** an open, authoritative-sounding claim that *"most bigram paths terminate in dead-ends"* and that compositional emergence is **mathematically suppressed** is a **ready-made false explanation for any emission failure.** ⚠ **`EMITZERO.1` is open right now** — 100% emit refusal, one reason, `no-best-word` — and it is filed deliberately as *a question with evidence and no diagnosis*. **This page offered a mathematically-dressed cause that has been false since the corpus grew.** ⭐ **That is the exact failure mode `SKILL_TREE.md:358` established: a doc lying in the direction that feels like an answer.**

**Erdős-Rényi threshold, recomputed and still the right test:**
- Giant connected component when `Np > 1` ⇒ `p > 1/N ≈ 0.000445`
- Mean degree **3.485 ≫ 1**, and above the 2.0 robustness target
- ⚠ **Honest limit of this check:** degree = `unique bigrams ÷ vocab size` is the same coarse proxy the original used, kept **deliberately** so the before/after is comparable. It is **not** a connectivity proof — it does not test whether the bigram graph has one giant component or several islands, and **a mean can clear a threshold while the graph is fragmented.** ⛔ **Do not upgrade "above percolation" to "compositional emergence is available"** — that would be substituting one over-claim for its mirror image.

**SUPERSEDED text, kept for the record:** *K_CONCRETE_SENTENCES currently: 233 sentences × 3.5 avg words → ~700 unique bigrams; N = 2247 vocab; mean bigram-graph degree = 700/2247 ≈ 0.31. We're 6× UNDER percolation. Implication: Hebbian propagation through the K-vocab transition graph can not robustly produce compositional emergence at current corpus density. The "she invented a sentence" milestone is mathematically suppressed… Action required: Expand K_CONCRETE_SENTENCES from 233 → 800-1000 sentences targeting ~3000-4500 unique bigrams. This is the largest single item on the audit ship-gate.*

⚠ **Knock-on: the `MIN_UNIQUE_RATIO` derivation above still cites the 233-sentence corpus** (*"233 sentences × avg 3.5 words = ~820 word positions"*). Its **value `0.5` is still correct in code**, so the threshold is not wrong — but its stated empirical basis describes a corpus **12× smaller** than the live one, and its own drift trigger (*"if K corpus expands per audit B.6, recompute"*) **fired and was never actioned.** ⛔ **A drift trigger nobody re-reads is not a trigger** — which is the entire argument for `docs:drift` being a command instead of a paragraph.

---

## 2026-09-02 — the per-cell corpus floor ladder: CROSS-CHECKED, not newly derived

- **Constants:** `FLOOR` in `server/curriculum-coverage.js` — early **7,300** · middle **29,000** · upper **73,000** · high **146,000** · college **330,000** · grad **330,000**
- **Status:** ⛔ **NOT a new threshold.** These were derived on 2026-09-01 from measured OpenStax books and have been enforced by the live auditor since. What changed on 2026-09-02 is that they are now **published in `docs/CURRICULUM-GAP.md §THE TARGET LADDER`**, where the acceptance criterion had been saying *"at or above its target"* while naming no target — enforced in code, unfalsifiable in the doc.
- **Existing derivation (unchanged, restated so this page carries it):** 8 chapters sampled across `chemistry-book`, run through the production cleaner's shape → 417,371 raw bytes = 31,038 clean words = **one clean word per 13.4 bytes**, applied to each book's true size (biology-concepts 146,598 · anatomy 334,525 · chemistry 524,791 · physics 878,811). `high` and `college` take the SMALLEST complete book at that band so the value is a floor; `upper`/`middle`/`early` are ratio-extrapolated at 0.50/0.20/0.05 × high and are **labelled as extrapolated in `FLOOR_BASIS`**; `grad` reuses the college anchor and is labelled as the weakest link.
- **⭐ NEW CROSS-CHECK (2026-09-02), from a completely unrelated source:** the full text of every work on the ELA reading ladder was counted — 43,835 → 554,505 words per assigned year; band medians early 180,815 · middle 86,940 · upper 111,097 · high 270,798 · college 198,632 · grad 254,727. **`high`'s assigned reading is 1.9× its textbook-derived floor**, so the floor is conservative as intended. **And the grad band — the one anchor with no counted basis — measures 45,321 and 464,132, a median of 254,727 that brackets the reused 330,000.** The reuse is now cross-checked rather than merely admitted.
- **⚠ A SECOND LADDER WAS DERIVED AND DISCARDED THE SAME DAY.** Before reading the code, I built early 20,000 · middle 30,000 · upper 40,000 · high 55,000 · college 70,000 · grad 85,000, floored at *what the corpus already holds*. That is **circular** — it defines "deep enough" as "what we have" — and it would have contradicted the live instrument, leaving doc and tool disagreeing about what "done" means. Recorded here because the failure mode (deriving before reading) is more reusable than the numbers were.
- **Cost of closing to the floor, computed 2026-09-02:** 173 prose cells × band floor ≈ **31.6M words** against 4.66M today = **6.8× corpus → 6.8^0.80 = 4.7×** on `_trainAcademicStories` alone. Exponent measured on this corpus (10.2× sentences → 6.4× expensive-lane growth). **This is the number that says the floors cannot all be reached by fetching harder.**
- **Drift trigger:** re-measure whenever a cap or a source changes; re-compute the 4.7× immediately before the press.

## Update protocol

Any new threshold MUST land with:
1. A row in this file (or a row update if existing).
2. The math reference, current value, theoretical optimum, drift trigger.
3. An inline comment in the source file referencing this doc.

This file is the source of truth for "why does this constant exist at this value?" If the source-code value drifts from this file, file-source disagreement is the bug — fix via a coordinated update.

## Session 114.19fp additions (2026-06-17, I.1-I.20)

Live-test follow-up shipped 20 atomic fixes — several introduced new named constants needing math grounding. Inventory:

### I.2 — Dream-trickle K-VOCAB retry timeout

- **Constant:** `timeoutMs: 20000` in `_dreamWindow` per-word `_teachWordDefinition` call
- **Previous value:** 3000ms (default in `_teachWordDefinition`)
- **Math justification:** SEED-phase observed timeouts were `check(timeout-15000ms)`, `card(timeout-15000ms)`, `tip(timeout-15000ms)`, `broke(timeout-15000ms)` — slowest 8s+ from dictionaryapi.dev edge. 20s gives 30% headroom past the slowest observed timeout (15s). At PREFETCH_CONCURRENCY=3 retry + 20s timeout × 3 retries = 60s worst-case per word. Across 289 missed words at 20s avg = ~6000s = ~100 minutes worst-case to clear the gap. Acceptable for dream-window background work.
- **Theoretical optimum:** depends on dictionaryapi.dev p99 latency under load — would need empirical sampling. 20s is conservative.

### I.8 — Consolidation duration cap

- **Constant:** ⛔ **CORRECTED 2026-08-27 — the default is `45000` (45s) for a routine pass and `120000` (120s) for a FORCED one, not `30000`.** Read at `js/brain/consolidation-engine.js:143-149`: `opts.forced` selects `DREAM_CONSOLIDATION_FORCE_MAX_MS` (default **120000**), otherwise `DREAM_CONSOLIDATION_MAX_MS` (default **45000**). ⭐ **The split exists because of `CONSTARVE.1`:** the once-per-2h emergency pass was aborting at 48.5s against the routine 45s cap and never finishing Tier-3 promotion — so the forced path was widened to 120s while **the routine cap was left alone**, since that is the original 153s-runaway guard. ⚠ **The code's own RE-PRICE note is the reason it was allowed:** this *widens a bound* rather than removing a gate, so walk-finiteness pricing is untouched. ⛔ **A stale in-code comment was fixed in the same commit** — `consolidation-engine.js:114` still read *"`DREAM_CONSOLIDATION_MAX_MS` env var (default 30s)"* thirty lines above the code setting 45000/120000.
- **Math justification:** Observed consolidation pass `duration=153445ms` (2 min 33s) during operator's K-curriculum run. Targeted: ≤ 30s per pass during active K-cell training. At 30s cap with per-cluster deadline check, the next pass picks up remaining clusters fresh — no work loss, just split across passes. SEED-phase skip is binary (consolidation pass entirely no-ops when `_currentMacroPhase.includes('SEED')`).
- **Theoretical optimum:** consolidation pass time should be ≤ 10% of K-cell teach duration to avoid starving curriculum GPU time. K-cell avg ~20min × 10% = 2min cap; 30s is conservative.

### I.10 — Slow-word log threshold

- **Constant:** 30000ms (30s) — `_teachWordIntegrated` per-word duration threshold for `⚠ slow word "X" took Yms` warn
- **Math justification:** K-cell `_teachWordIntegrated` averages 19.2s/word per F.2 acceptance projection. 30s = 1.56× the average → catches genuine outliers (cache misses, GPU dispatch backlogs) without spamming the log for normal slow words.

### I.13 — SparseMatrix.propagate output buffer pool

- **Constant:** `_predictPropagateScratch.length === cluster.synapses.rows`
- **Math justification:** Sized to match the synapse-matrix output dimension. Per-cell allocation rather than per-call eliminates the +231 MB/min leak source. Reuse rate = (number of `_teachPredictiveError` calls per cell × number of words per cell) = O(76 words × 24 reps × N pairs × 4 reps definition) ≈ millions of reuses per cell — single-allocation amortizes to ~zero bytes per call.

### I.14 — Event-loop yield throttle

- **Constant:** 50ms throttle interval (`_lastHebbianYieldAt + 50ms < now → yield`)
- **Math justification:** HTTP request timeout default 8-15s. To keep p99 HTTP latency sub-second, the event loop must drain at least every ~100ms. 50ms throttle gives 2× safety margin. Teach-loop velocity impact: yields fire ~20×/sec on saturated `_teachHebbian` = ~20ms of `setImmediate` overhead per second = 2% throughput cost. Acceptable trade for HTTP responsiveness.

### I.18 + I.20 — GPU polling cadence

- **Constant:** 1000ms (1s) between `nvidia-smi` execSync calls — `_lastGpuVramPoll + 1000ms < now → poll`
- **Math justification:** nvidia-smi takes ~30-100ms per execSync on Windows. 1Hz polling = 1-10% CPU overhead during poll. State broadcast cadence is also 1Hz (`if (now - _lastHistorySample >= 1000)`) so polling cadence matches broadcast cadence — no wasted samples.

### I.17 — Dispatch counter ring buffer (hidden diagnostic)

- **Constants:** 30000ms (30s) window, 5000-entry lazy soft-cap
- **Math justification:** At biological scale `_teachHebbian` dispatches ~1000-5000 ops/sec via `_sparseSendBinary`. 30s × 5000/sec = 150,000 entries worst-case if window grows unbounded. 5000-entry soft-cap triggers cutoff prune (anything older than 30s removed) before memory pressure. Lazy because main prune happens in `_updatePerfStats` every 1s.

See `docs/ARCHITECTURE.md § Live-test follow-up close` for cross-module summary of all 20 fixes.

## Self-pricing + lateral-hint additions (2026-09-06)

Two named constants shipped with the rep-pricing publication and the lateral-inhibition active-index hint. Both are derived from live measurements taken off the box the same day, so the numbers they rest on are recorded here rather than in a commit message.

### Rep-pricing re-measure interval

- **Constant:** `DREAM_REP_AUTOPRICE_GAP_MS`, default **60,000 ms**.
- **What it bounds:** how often the collision-load measurement re-runs. Previously it ran on **every** `_teachAssociationPairs` call with ≥8 pairs — **25,603 calls** in one live boot — sampling up to **512** patterns per call, each sample costing one `_dictionaryPatternFor` (a fresh `Float64Array(300)`, a GloVe lookup and five hash stripes) plus one `_topKEmbedding`.
- **Math justification:** the measured quantity is a property of **the corpus and the encoding**, neither of which changes between two calls a millisecond apart. The fastest thing that legitimately moves it is a grade transition, and cells run for **tens of minutes** (`cellElapsedMs` read **3,148,555 ms = 52 min** live, mid-cell). A 60 s interval is therefore **~52× finer than the fastest real change**, while cutting the sampling work by the call rate: 25,603 calls over a 3,233 s boot = **7.9 calls/s**, so 60 s collapses ~475 measurements into 1 — a **475× reduction** with no loss of resolution against anything that actually varies.
- **Theoretical optimum:** one measurement per cell entry, which is what this approximates without needing a cell-boundary hook. Lower is pure waste; much higher risks a stale verdict spanning a grade change, which is why the verdict now carries `measuredAt` so its age is readable rather than assumed.
- **Drift trigger:** re-derive if mean cell duration falls below ~10 minutes, or if the verdict is ever wired to STEER compression (`DREAM_REP_AUTOPRICE=1`) rather than only to report — a steering input earns a tighter interval than a reporting one.

### Lateral active-index hint verification budget

- **Constant:** `DREAM_LATERAL_HINT_VERIFY`, default **500** calls.
- **What it bounds:** how many times the caller-supplied motor active-index list is checked against the full scan before the scan is skipped. One mismatch disables the hint permanently for the process.
- **Math justification:** the failure this guards is **deterministic, not stochastic** — either something writes motor spikes between the caller's `_writeTiledPattern` and the lateral call, or nothing does. A deterministic disagreement shows up on the **first** call, so the budget is not a statistical confidence level; it is a margin against **path variety**. The assoc loop reaches this code under distinguishable conditions — `skipPredictiveError` true or false, `binarize` true or false, def-bind vs corpus-pair callers, and the anti-pair branch taken or not — a handful of binary axes, so **on the order of 16–32 distinct paths**. At the measured **170,334 lateral calls per boot**, 500 is **~15× the path count** and **0.29% of the calls**, so every path is exercised many times over while the verification costs well under one percent of the very scan it exists to remove.
- **Cost of being wrong in the safe direction:** 500 double-runs × 2.23 ms = **1.1 s per boot**, against the **380,300 ms** the scan currently spends. The verification is 0.0003 of what it protects.
- **Theoretical optimum:** unmeasurable without knowing the true path count; 500 is deliberately generous because the failure is silent (a wrong hint trains anti-Hebbian against the wrong rows and reports nothing), and a silent failure justifies paying more than the minimum for evidence.
- **Drift trigger:** re-derive if the assoc pair loop gains a new conditional branch around the motor write, or if a **second** call site is ever given a hint — the path count is the input, and it is the thing that changes.
