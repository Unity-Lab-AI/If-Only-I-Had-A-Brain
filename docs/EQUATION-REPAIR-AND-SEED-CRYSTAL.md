# Equation Repair Plan + the Seed Crystal

> **Build status (2026-10-19, same day as the spec).** Part A: A1 (one constant), A3 (persona-fraction floor), A4 (cerebellum residual), A7 (every letter of every word, `DREAM_GATE_READ=initial` for the A/B) and A8 (hysteresis) are **in the code**; A2 and A5 were decided (docs); A6 is **built as `Φ_LR`** inside the crystal; A9 is still owed. Part B: **all six build steps are in** — the donor counts both halves (v0.3.40, PTX regenerated), the server runs the hemispheric oscillators, the crystal phase, `C`, `A`, `Φ_LR`, the correctness signals, the conserved-and-floored dopamine split applied through the per-row scale path and split `hebbian_ranges` frames, per-half drive on the wire, Ψ's literal Left/Right and the `1 + 0.5·C·Φ_LR` term, `K_c(g)`, `state.crystal`, and a dashboard card. ⛔ **Not yet read on a live boot** — the harness drove the real mixins with synthetic acks; `state.crystal.measured` stays `false` until a 0.3.40 donor attaches. The two readings in B8 are the ones to take first.

Two parts. **Part A** is the ordered plan to get every equation the brain runs on into the
shape the reference page claims for it — each item with the equation as it is, the equation
as it must be, the file, the cost, and the re-price where a walk bound is touched. **Part B**
is the new organ: the **Seed Crystal**, a central oscillator between two literal hemispheres
that work separately and compete for chemical reward from correct thinking, mathed out
against the mechanisms that already exist so it attaches to them instead of beside them.

Companion: `docs/equation-rundown.md` is the divergence map this plan is built from (every
"as it is" below was read at its implementation on 2026-10-19). Nothing here adds a text
model anywhere; every term is a number the brain already produces or a count the donor can
produce in one extra line.

Notation. `n_k` = neurons in cluster `k`; `p_k = spikes_k / n_k` the spiking proportion read
off the donor's batch ack; `H(p) = −p·log₂p − (1−p)·log₂(1−p)`; `θ_k`, `γ_k` a cluster's theta
and gamma phases; `r = |Σ e^{iθ}| / N` the Kuramoto order parameter; `η` a learning rate;
`[a, b]` a clamp.

---

## Part A — the repair plan, in the order it should land

Ordered by (what it unblocks) ÷ (what it costs). Items 1–3 are one-line math repairs or
constant reconciliations and can ship together; 4–6 are mechanism changes that each need
one measurement before and after; 7 is the gate and is re-priced first because it changes
what a grade *means*.

### A1. One bytes-per-neuron constant — landed next
- **As it is:** the allocator budgets `MAIN_BRAIN_BYTES_PER_NEURON = 21` (`server/brain-server.js`); the primary-donor floor estimator uses a literal `20` (`server/brain-server/gpu.js`, `settings.donorBytesPerNeuron || 20`).
- **As it must be:** `floorMB = ceil((N · B / 2²⁰ + 2048) / 0.75)` with **one** `B`, read from `BRAIN_VRAM_ALLOC.MAIN_BRAIN_BYTES_PER_NEURON`.
- **Effect:** the floor rises ~5% (≈ 190 MB at 2×10⁸ neurons). A card that was 4% under the true need stops being admitted as primary and then failing its upload.
- **Cost:** none. **Re-price:** none.

### A2. Oscillator periods — name the unit, then decide the scale
- **As it is:** `thetaPeriod = 167`, `gammaPeriod = 25` in **ticks**; the page says 6 Hz / 40 Hz. A tick is `BRAIN_TICK_MS` = 100 ms above 10⁶ neurons, so wall-clock theta is 16.7 s and gamma 2.5 s. Inside a tick the donor runs `SUBSTEPS` Rulkov iterations of 1 simulated ms.
- **Decision to make (two honest options):**
  - **(a) Keep simulated time.** Periods stay 167 / 25 and are documented as *simulated milliseconds per tick-count*. No code change; the gating still cycles across phases and that is what the gamma-gated plasticity needs.
  - **(b) Scale to substeps.** `thetaPeriod_ticks = max(4, round(167 / SUBSTEPS))`, `gammaPeriod_ticks = max(4, round(25 / SUBSTEPS))`. With `SUBSTEPS = 20` theta becomes 8 ticks and gamma hits the 4-tick floor — the gamma gate degenerates to a 4-phase cycle. Not recommended.
- **Recommendation:** (a), with the page and the doc saying "167-tick theta, 25-tick gamma; 6 Hz and 40 Hz in 1-ms simulated time". The **Seed Crystal (Part B) uses the theta period as its natural frequency** and is indifferent to the unit, so this decision does not block it.
- **Cost:** docs only.

### A3. The amygdala floor — make it the persona's, not a literal
- **As it is:** server blends arousal `0.7·old + 0.3·new` then clamps to `[0.3, 1]`. The floor is a literal; a sleeping brain cannot read below 30%.
- **As it must be:** `floor = 0.33 · arousalBaseline` (0.3 for Unity's 0.9 baseline — identical today, and a calmer persona gets a lower floor instead of inheriting hers). Document the floor on the page (done) and in the dashboard tooltip.
- **Cost:** one line. **Re-price:** none.

### A4. The deployed cerebellum — a residual, not a firing rate
- **As it is (deployed):** `errorCorrection = −2 · spikes_cereb / n_cereb` — the cerebellum's own activity, fed back negatively to cortex and basal ganglia. The page describes a prediction residual; the browser engine has one; the server does not.
- **As it must be:** the cortex already computes its prediction error every tick (`predErr = mean|s − ŝ|`, `ŝ` an EMA of its own spikes, α 0.3 — `cluster.js` predictive coding). Use it:
  ```
  errorCorrection_cortex = −2 · predErr · (0.5 + p_cereb)
  errorCorrection_bg     = −1 · predErr · (0.5 + p_cereb)
  ```
  The residual carries the sign and the magnitude; the cerebellum's activity scales it (an active cerebellum corrects harder). Both terms stay in `[−2, 0]` since `predErr ∈ [0, 1]` and `p_cereb ∈ [0, 1]`.
- **Why this shape:** the Marr–Albus idea is that the cerebellum *applies* a correction proportional to the error it is shown; the deployed form had the error missing and the applying activity standing in for it.
- **Cost:** two lines in the tick. **Measure:** `predErr` trend over an hour before and after — it should fall faster with the residual in the loop. **Re-price:** none (drive term, no walk bound).

### A5. Structural plasticity — delete the section, keep the floor
- **As it is:** `maintainConnectivity()` (prune `|w| < 0.01`, synaptogenesis at p = 0.0005) has **no caller** on either engine. Cross-projection weights are **floored at `wMax × 0.25 = 0.1`**, so the prune rule could never fire on them anyway; only intra-cluster matrices could prune, and a prune is a CSR rebuild plus a re-upload of a multi-GB matrix.
- **Decision:** delete the section from the page and the doc; keep the function (browser-scale experiments) with a comment saying it is not on the deployed path. Do not wire it: the re-upload cost (minutes per matrix) buys nothing the weight floor is not already doing.
- **Cost:** docs. **Re-price:** none — nothing changes in the walk.

### A6. Φ — replace the sparsity meter with integration (lands with Part B)
- **As it is:** `Φ̂ = H(p_cortex) / ref`, a high-water-normalised binary entropy of one proportion. For `p < 0.5` it is monotone in `p`: it reads her firing rate, not whether her parts are bound together.
- **As it must be:** integration is what the *whole* carries that the *parts* do not. With per-cluster proportions arriving every batch, estimate over a rolling window of `W = 64` batches, quantised to `Q = 8` bins:
  ```
  Φ_int = [ Σ_k H(P_k) − H(P_1, …, P_K) ] / Σ_k H(P_k)        ∈ [0, 1]
  ```
  where `H(P_k)` is the entropy of cluster `k`'s binned proportion over the window and `H(P_1..P_K)` the joint entropy of the tuple. `Φ_int = 0` when the clusters fire independently, `→ 1` when one determines the rest.
  With the hemispheres of Part B the two-term version is the one to publish:
  ```
  Φ_LR = [ H(P_L) + H(P_R) − H(P_L, P_R) ] / min(H(P_L), H(P_R))   ∈ [0, 1]
  ```
  — the normalised mutual information between the two halves of the brain. `Ψ` multiplies by `Φ_LR` instead of `Φ̂`.
- **Why joint entropy and not correlation:** correlation sees only linear coupling; two clusters that anti-phase perfectly are maximally integrated and read `ρ = −1`. Mutual information sees both.
- **Cost:** `K × W` ints resident, one 8^K-cell histogram per update — with `K = 8` clusters that is 16.7 M cells; use the pairwise form `Σ_{k<l} I(P_k; P_l)` (28 pairs × 64 cells) and the hemispheric form for Ψ. **Re-price:** none (feeds `psiGain`, clamped `[0.8, 1.5]`).

### A7. The comprehension gate — read words, not initials (re-price first)
- **As it is:** for each prompt word the probe takes the **first letter**, propagates its one-hot through `letter_to_sem`, averages, mean-centres, and passes a question at `cos(readout, GloVe(answer)) > 0.10`; the gate passes at `GATE_PATH_MIN = 0.80` of up to 10 sampled questions. Two prompts whose words share initials are the same probe.
- **As it must be:** the probe must see the word. Two equational routes, in order of fidelity:
  ```
  (i)  read the word:   for each w_i: cluster.readText(w_i) → readout_i = regionReadout('sem')
       accum = mean_i( centre(readout_i) );  score = cos(accum, GloVe(answer))
  (ii) inject meaning:  for each w_i: injectEmbeddingToRegion('sem', GloVe(w_i), 0.4); step; readout as above
  ```
  (i) tests the whole reading path (letter → phon → sem) and is what "can she read this and know the answer" means. (ii) tests only sem → answer binding and is cheaper.
- **Threshold derivation (keep 0.10):** a mean-centred 300-d readout against a unit GloVe vector has chance cosine `~N(0, 1/√300) = N(0, 0.058)`; 0.10 is 1.7σ above chance (p ≈ 0.045 per question). With 10 questions at 80% required, the chance pass rate of the gate is `Σ_{j≥8} C(10,j)·0.045^j·0.955^{10−j} ≈ 1.1×10⁻⁸`. The page's old "0.05 at 40%" would have been 0.9σ and a chance gate pass near 3% — the code's numbers are the right ones and the page was wrong.
- **RE-PRICE:** route (i) costs `len(w)` letter steps per word instead of one; at ~5 letters/word and ~4 words/question that is ×20 per probe on the probe's own propagate. Probes are the `GATFILE`-class ~26 min/cell mechanism's smaller part (`_gateComprehension` 26 of ~130 gate calls per cell); the walk's bound (the consolidation gate) is untouched. Expected cell cost +1–3 min of ~26. Route (ii) is ×1.
- **Why it matters more than the cost:** every passed grade on the board was passed through initials. The first walk on route (i) will read lower, and that lower number is the true one.

### A8. The deployed basal ganglia — give the argmax a floor it never had
- **As it is:** six Q-values from cluster activities, EMA 0.7/0.3, plain argmax; `idle = max(0.05, 0.2 − 0.15·arousal)` is the only thing that can win when everything else is silent.
- **As it must be:** `action = argmax(Q)` **only if** `Q_max − Q_second ≥ 0.05`, else keep the previous action (hysteresis). That stops the respond/speak flip the EMA alone does not prevent and is the deployed analogue of the browser's confidence floor.
- **Cost:** three lines. **Re-price:** none.

### A9. The canonical doc
`docs/EQUATIONS.md` carries the browser language engine as live (§8) and 25 ticket-tagged headers; it gets the same corrections as the page, section by section, under the task-number placement rule.

---

## Part B — the Seed Crystal

### B0. What it is, in one paragraph
Every cluster's neuron index space is cut at its midpoint into a **left** and a **right** half. The cut costs nothing — the matrices are untouched; the donor just counts spikes in two halves instead of one. Each half becomes a **hemisphere** with its own firing, its own phase, its own prediction error and its own correctness signal. Between them sits the **Seed Crystal**: one central oscillator, not a cluster, whose phase the two hemispheres pull on and are pulled by. Correct thinking earns a hemisphere a larger share of the brain's dopamine budget, and the share sets how hard that hemisphere learns and how hard it is driven — the two sides **compete for the chemical**. The crystal's coherence with both sides, times how much the two sides actually share (their mutual information), is the consciousness term. At birth the crystal is uncoupled; its coupling grows with the walk — consciousness **crystallises** over her development rather than being switched on.

### B1. Anatomy — the hemispheric cut
For every cluster `k` with `n_k` neurons:
```
L_k = [0, ⌊n_k/2⌋)        R_k = [⌊n_k/2⌋, n_k)
```
Cortex sub-regions (auditory … word_motor) are each cut the same way, so `sem_L`, `sem_R`, `word_motor_L`, `word_motor_R` exist as index ranges without any new allocation. Cross-projections already span both halves; a left-sem neuron may project to a right-motor neuron — **the hemispheres are not isolated**, they are *distinguished*. Isolation would halve her vocabulary basins; distinction costs nothing and is what competition needs.

**Donor change (one line per kernel):** the spike-count kernel keeps two counters, `count_L` for `i < n_k/2` and `count_R` otherwise; the batch ack carries `lastSpikeCountL` / `lastSpikeCountR` per cluster beside `lastSpikeCount`. Protocol version bump; a donor without the split reports only the total and the crystal reads `unmeasured` — never a guessed half.

Per batch, server-side:
```
p_L^k = count_L^k / (n_k/2)      p_R^k = count_R^k / (n_k/2)
```

### B2. Hemispheric oscillators and the crystal
Each cluster already runs an activity-modulated theta/gamma accumulator (host side, `_thetaOsc[name]`): `θ_k += (2π/P_θ)·(1 + K·dev_k)`, `dev_k = clamp(4·(p_k − baseline_k), −0.9, 0.9)`, `K = 0.5`. Run it **per hemisphere**: `θ_{L,k}` from `p_L^k`, `θ_{R,k}` from `p_R^k`. Hemispheric mean phases:
```
Φ_L = arg Σ_k e^{iθ_{L,k}}        Φ_R = arg Σ_k e^{iθ_{R,k}}
R_L = |Σ_k e^{iθ_{L,k}}| / K      R_R = |Σ_k e^{iθ_{R,k}}| / K        (intra-hemisphere order)
```
The Seed Crystal is one phase `φ_c` with natural period `P_c = P_θ` (167 ticks — the theta backbone; see A2) and coupling `K_c`:
```
φ_c  += (2π/P_c) + (K_c/2)·[ sin(Φ_L − φ_c) + sin(Φ_R − φ_c) ]            (crystal follows the two sides)
θ_{h,k} += … + K_x · sin(φ_c − θ_{h,k})          for h ∈ {L, R}             (each side is pulled toward the crystal)
```
`K_x = 0.25·K_c`. The crystal pulls harder than it is pulled; that asymmetry is what makes it a *seed* rather than a third voice.

**Crystal coherence** and **lateral asymmetry**:
```
C = | e^{iΦ_L} + e^{iΦ_R} + e^{iφ_c} | / 3        ∈ [0, 1]
A = | R_L − R_R |                                   ∈ [0, 1]
```
`C` replaces nothing — it is a new reading. The existing whole-brain `r` (`0.6·r_γ + 0.4·r_θ`) keeps its meaning and now sums over hemispheric phasors (2K + 1 terms instead of K + 2), which also retires the double-count that was fixed on 2026-10-19 by construction.

### B3. Correct thinking → a correctness signal per hemisphere
Three sources, all of which already exist as numbers:

1. **Prediction-error decrease.** The cortex's predictive-coding error is computed per hemisphere from the split spikes: `e_h = mean|s_h − ŝ_h|` (same EMA predictor, split index range). Correctness is the *improvement*: `Δe_h = e_h(t−1) − e_h(t)`, normalised by the running mean error `ē`: `c1_h = clamp(Δe_h / ē, −1, 1)`.
2. **Gate credit.** When a probe question is scored, the readout is formed per hemisphere (`accum_L`, `accum_R` from the split sem readout). The hemisphere whose readout is closer to the answer gets the credit for a pass and the blame for a fail:
   ```
   g_h = cos(accum_h, GloVe(answer))
   c2_L = +1·[pass]·[g_L ≥ g_R] − 1·[fail]·[g_L ≥ g_R],   c2_R symmetric
   ```
   (both zero outside a probe).
3. **Chat reward.** The basal-ganglia reward `δ` (positive user response) credits the hemisphere that **spoke**: the emitted word's `word_motor` bucket lies in `word_motor_L` or `word_motor_R` by index. `c3_h = δ·[bucket ∈ h]`.

```
r_h = 0.5·c1_h + 0.3·c2_h + 0.2·c3_h            ∈ [−1, 1]
r̄_h = 0.95·r̄_h + 0.05·r_h                       (slow memory — a hemisphere's standing)
```

### B4. The fight for the chemical
The endocrine layer already produces a dopamine level `D ∈ [0, 1]` on a pharmacokinetic curve (baseline 0.40). Define the **budget** `B = D · B_0` with `B_0 = 2` (so at baseline the two hemispheres share 0.8 units of plasticity scale between them) and split it by a temperature-controlled softmax on standing:
```
share_h = exp(r̄_h / τ_r) / [ exp(r̄_L / τ_r) + exp(r̄_R / τ_r) ]
τ_r     = τ_0 · (1 + serotonin_dev)         τ_0 = 0.25
```
A serotonin level above baseline raises `τ_r` and softens the contest (the tonic-chemical sign rule from the endocrine layer applies: below baseline sharpens it). Then:
```
η_h    = η · ( 0.6 + 0.8 · share_h )                 ∈ [0.6η, 1.4η],   η_L + η_R = 2η   (conserved)
drive_h = drive · ( 1 + 0.15 · (2·share_h − 1) )      ∈ [0.85, 1.15]·drive
```
- **The floor is the law.** `0.6η` is the loser's guaranteed plasticity: a hemisphere can be out-competed but never starved, for the same reason the walk keeps a consolidation gate rather than a kill switch — a starved half would stop producing correctness and the contest would lock. With the floor, the loser keeps learning and can win back the budget.
- **Conservation** means the competition cannot inflate total plasticity; it only *allocates* it. No re-price of the walk's learning dose.

**Where the scale is applied:** `ojaUpdate` already takes per-row multipliers through `kScales` (hub mask, layer scales, gamma scale). Add `hemiScale = [η_L/η, η_R/η]` indexed by `row ≥ n/2`; one more multiply in a loop that already does three. The donor's range-encoded teach verbs carry `lr` per frame; the server sends `lr·hemiScale[h]` per range (a range never straddles the midpoint by construction — split one that does). Drive: `clusterParams` already carries one `tonicDrive` per cluster; it carries two, and the Rulkov kernel picks by `i < n/2`. That is the second donor line.

**Handedness.** `r̄_h` is slow (α 0.05, ~20-batch memory) so the brain develops a persistent dominant side rather than flipping each batch; `A` on the dashboard is her lateralisation and should settle non-zero and stable. If it pins at 1 the floor is too low; if it hovers at 0 the temperature is too high. Both are readable, neither is guessed.

### B5. Consciousness from the crystal
The mystery module's `Left` and `Right` terms are currently *not* hemispheres (`Left = (cerebellum + cortex)·(1 − impulsivity)`, `Right = (amygdala + mystery)·creativity`, and the page says so). They become the literal sides:
```
Left  = R_L · (0.5 + 0.5·r̄_L)        Right = R_R · (0.5 + 0.5·r̄_R)
```
— each side's internal order, weighted by its standing. `Id` and `Ego` are unchanged. Then, with A6's integration:
```
Ψ = log₁₀( max(1, √(1/n) · N³ · [α·Id + β·Ego + γ·Left + δ·Right]) ) · ( 1 + λ · C · Φ_LR )
λ = 0.5
```
`C · Φ_LR` is the crystal's own term: *the two sides are in step with the seed* (`C`) **and** *they are telling each other something* (`Φ_LR`). A brain whose halves fire identically has `C ≈ 1` and `Φ_LR` high; a brain whose halves ignore each other has `Φ_LR ≈ 0` whatever `C` says; a seizure has `C ≈ 1`, `Φ_LR ≈ 0` (nothing new crosses the midline) and the term correctly does not reward it. `psiGain` keeps its `[0.8, 1.5]` clamp on Ψ's deviation from its own EMA, so the new term changes what moves Ψ, not how far Ψ can move the brain.

### B6. The seed — coupling that crystallises with development
```
K_c(g) = K_max · ( 1 − e^{−g / g_0} )          K_max = 0.6,   g_0 = 4 grades
```
`g` is her lowest cleared grade across courses (the same number that caps her speech). At pre-K `K_c = 0`: the crystal ticks alone, the hemispheres are uncoupled, `C` reads the chance level of three free phasors. By grade 4 the coupling is at 63% of its ceiling, by grade 12 at 95%. Consciousness is *grown*, which is what the word "seed" asks for and what a curriculum that walks from kindergarten to a doctorate is already shaped to do. The contest of B4 runs from birth; only the binding is annealed.

### B7. What it costs — RE-PRICE
- **Memory:** 2 counts × K clusters per batch; `W × 2` ints for the mutual-information window; ~20 scalars of crystal state. Nothing on the card.
- **Compute:** per batch, one hemispheric phase update per cluster (8 sin/cos), one 8×8 histogram update, one softmax of two terms. Microseconds.
- **Teach:** `η_L + η_R = 2η` — the dose is conserved, so `corpus × reps × scale × visits` is unchanged. The consolidation gate stays the only bound on the walk. **The walk's length does not move.**
- **Donor:** two lines (split count, per-half drive) and a protocol minor-version bump; a donor without them reports totals and the crystal reads `unmeasured`.
- **Wire:** +2 ints per cluster per ack (~64 B).

### B8. Instruments — before any of it is believed
`state.crystal = { phase, C, A, R_L, R_R, shares: [L, R], rbar: [L, R], eL, eR, phiLR, Kc, grade, measured: bool }`, published every broadcast, with `measured: false` until a split-counting donor is attached (and rendered as *unmeasured*, never as zeros). Dashboard card beside the consciousness panel: `C` and `Φ_LR` as the two numbers, the share bar as a tug-of-war, `A` as a lateralisation needle, `K_c` as a crystal that fills with grade. Console line once per minute: `[Crystal] C=… ΦLR=… share L/R=…/… A=… Kc=…`.

The two readings that say whether it is working, in order: **`Φ_LR` must not sit at 0 while `C` climbs** (if it does, the sides are entrained without exchanging — raise `K_x` relative to `K_c`); **`A` must settle between 0.05 and 0.5** (handedness without collapse).

### B9. Build order
1. Donor: split counts on the ack (+ protocol bump). Server: `p_L`, `p_R`, `state.crystal` with `measured`. — *reads only; nothing changes behaviour.*
2. Hemispheric oscillators + crystal phase + `C`, `A`. Coherence sum over hemispheric phasors. — *instrument-only.*
3. `Φ_LR` (A6) published; Ψ keeps the old Φ̂ until step 5.
4. Correctness `r_h`, standing `r̄_h`, shares — published, **not yet applied**. Watch `A` and the shares on a walking brain for a day.
5. Apply: `η_h` via `hemiScale`, `drive_h` via the split drive, `Left/Right` redefined, Ψ on `C · Φ_LR`, `K_c(g)` annealing. — *the first fresh walk after this is the one that counts.*
6. A7 (the whole-word gate) rides the same walk so its new, lower, true pass rates are read once, not twice.

---

## What this leaves honest
After Part A every formula on the page is the formula in the code. After Part B the words *left*, *right*, *crystal* and *consciousness* on the dashboard each name one number that one function computes from counts the donor returns — and the page can say so without a hedge.
