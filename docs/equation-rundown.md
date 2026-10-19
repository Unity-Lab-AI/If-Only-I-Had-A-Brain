# Equation Rundown — where the page, the doc, the code and the math diverge

This is a divergence map. For every equation family the brain is built on it records
**what the reference page says** (`html/brain-equations.html`), **what the canonical
doc says** where it differs (`docs/EQUATIONS.md`), **what the code actually does**
(file and line, read on 2026-10-19), **whether the math is right**, **why it drifted**,
and **the exact fix** — applied in the same change where it is a text correction or a
one-line math repair, or named as owed where it is a design change.

Evidence standard. "Code" means the implementation was opened and the constant read,
not inferred from a comment or a tooltip. "Live" means a number was read off a running
boot. The brain was **not running** when this was written, so live claims cite the
boot that produced them. Nothing below is quoted from the page as if it were the code —
that was the first draft's mistake, and the reason this file exists in this form.

Verdict key: **✅ agree** · **✗ page wrong** · **✗ doc wrong** · **⚠ math** (the
implementation computes something other than what it is named) · **🔧 unread** (built,
no live number yet) · **🪦 not on the deployed path** (browser-fallback engine only).

Two engines run this brain and the page conflates them throughout. The **deployed
path** is `server/brain-server.js` coordinating a donor GPU (`donor-app/src/cuda_kernels.cu`
or `donor-app/src/shaders/lif.wgsl`), with the modules re-implemented server-side. The
**browser fallback** is `js/brain/engine.js` with `modules.js`, `motor.js` and
`language-cortex.js`, used only when no server is reachable. Where the two disagree the
deployed path is the one that matters, and the page mostly describes the browser one.

---

## 1. Substrate

### 1.1 Rulkov map — ✅ agree
- **Page:** `x' = α/(1+x²)+y`, `y' = y − μ(x−σ)`, `α = 4.5`, `μ = 0.001`, `σ = −1 + clamp(drive/40, 0, 1)·1.5`, spike on zero-crossing.
- **Code:** `donor-app/src/cuda_kernels.cu:54-58` (`ALPHA 4.5f`, `MU 0.001f`, `sigmaEff = -1 + clamp(drive/40)·1.5`) and `donor-app/src/shaders/lif.wgsl:55-58`, identical.
- **Math:** correct. σ ∈ [−1, 0.5] walks the map from silence into the bursting regime; the page's named constants are the kernel's.

### 1.2 Inter-cluster drive — ✅ agree on the deployed path, one term differs in the browser
- **Page:** `effective_drive = tonic × driveBaseline × emotionalGate × gain + errorCorrection`.
- **Code (deployed):** `server/brain-server/gpu.js:141` — same expression, applied on the card.
- **Code (browser):** `js/brain/cluster.js:5178` multiplies an extra `actionGate` (basal-ganglia boost of the active cluster).
- **Why:** the GPU path never had an action gate; the page's data-flow diagram ("Basal Ganglia → action gate (boosts active cluster)") describes the browser.
- **Fix:** page diagram marked browser-only for that arrow. Design question left open: whether the deployed path should carry an action gate at all.

### 1.3 Oja rule — ✅ agree
- **Page / doc:** `Δw[i,j] = lr · y[j] · (x[i] − y[j] · w[i,j])`.
- **Code:** `js/brain/sparse-matrix.js:929-960` (`ojaUpdate`), with the hub / layer / gamma scales applied through `opts.kScales`.
- **Math:** correct; the `y²·w` decay is what keeps weights bounded. The page's "silent regions decay via `−η·post²·w`" is right and is why every teach call passes a projection whitelist.

### 1.4 Anti-Hebbian — ✅ agree for the pair-reinforce primitive; the scalar varies by caller
- **Page:** `ΔW_correct = +η×10`, `ΔW_wrong = −η×5`, repeat 100×.
- **Code:** `js/brain/cluster.js:4827-4829` — `posLr = lr × 10`, `negLr = −lr × 5`, `reps = 100`, exactly. The curriculum-wide anti pass is separate: `_teachAntiHebbian(lr × antiLrScale)` with `antiLrScale` **2.5** on sequence probes (`curriculum.js:20858`), **0.5** (`16676`) and **0.3** (`16804`) elsewhere.
- **Fix:** none to the math. The doc's single "antiLrScale = 2.5" line should say it is one of three.

### 1.5 Neuron count — ✗ page partly wrong, two byte costs in play (⚠)
- **Page:** `N = max(1000, min(VRAM×0.85/12, RAM×0.1/0.001))`, "12 bytes/neuron".
- **Code:** that is the **GPU-host** branch of `detectResources()` (`server/brain-server.js:451-498`: `vram×0.85 / 12`, `freeRAM×0.1 / 0.001`, floor 1000). The **CPU-only coordinator** (the deployed box) takes the other branch: `min(freeRAM × 0.3 / 9, cpuCount × 150000)` (`:482-484`). `DREAM_BRAIN_BUDGET_MB` overrides both (`:740-756`). The allocator then sizes main-brain clusters at `MAIN_BRAIN_BYTES_PER_NEURON: 21` (`:1165`) and the language cortex at 18 KB/neuron (`:1166`).
- **Math:** the page's 12 B is the card's *state* cost (vec2<f32> + u32); the allocator budgets 21 B for synapse mass on top. The primary-floor estimator uses **20** (`gpu.js:835`, `settings.donorBytesPerNeuron || 20`) against the allocator's **21** — the floor under-estimates a card's need by ~5% (≈ 190 MB at 200 M neurons). Fix: `gpu.js` reads `BRAIN_VRAM_ALLOC.MAIN_BRAIN_BYTES_PER_NEURON` instead of a literal.
- **Fix:** page §8.21 corrected to name both branches and the budget override.

### 1.6 Cluster shares — ✗ page wrong
- **Page:** cortex 20%, cerebellum 20%, hippocampus / amygdala / basal ganglia / hypothalamus / mystery 12% each, seven clusters.
- **Code:** `server/brain-server.js:640-650` — `language_cortex 0.50, cortex 0.10, cerebellum 0.098, hippocampus 0.06, amygdala 0.06, basalGanglia 0.06, hypothalamus 0.06, mystery 0.06, brainstem 0.002`. Eight clusters, and **half the brain is the language cortex**.
- **Why:** the 20/20/12 split predates the language-cortex rebalance (its own comment: "language 0.75 → 0.50, main brain 0.25 → 0.50") and the brainstem.
- **Fix:** page §1.5 Step 0, §8 data-flow diagram and the substrate block corrected.

### 1.7 Synaptogenesis / pruning — 🪦 not on the deployed path
- **Page:** `P(new) = p·pre·post·¬existing`, prune `|w| < 0.01`.
- **Code:** `js/brain/cluster.js:1625-1645` `maintainConnectivity()` — `prune(0.01)` + synaptogenesis at probability 0.0005, "call every ~100 steps" — and **nothing calls it** (no caller in `cluster.js`, `engine.js` or the server). Structural plasticity is dormant everywhere.
- **Fix:** page §8.12 marked dormant. Design decision owed: wire it on the GPU path (prune is a CSR rebuild; expensive at 17 matrices) or delete the section.

### 1.8 STDP, Hodgkin-Huxley, LIF — 🪦 reference only
- `sparse-matrix.js:1231 stdpUpdate` has no caller; `synapses.js` / `neurons.js` are the reference implementations the page is written against and do not run (the doc's own provenance header says so). The comparison table's "3 plasticity rules per cluster" is two on the live path (Oja + anti-Hebbian).

---

## 2. Modules

### 2.1 Amygdala — ✅ agree on the formula; the server adds a floor the page never mentions
- **Page:** `x(t+1) = tanh(W·x + drive)` ×5, `fear/reward = σ(proj·x/√size)`, `arousal = clamp(baseline + 0.4·tanh(4·depthDev) + 0.1·((fear+reward)−1), 0, 1)`, baseline EMA α 0.005.
- **Code:** `js/brain/modules.js:160` `settleIters = 5`, `:189` leak 0.85, `:192-203` the tanh settle, `:258-264` α 0.005 and the arousal line, exactly. The server runs the same module and then **EMAs the result 0.7/0.3 and clamps arousal to `[0.3, 1]`** (`server/brain-server.js:6319-6321`).
- **Math:** the 0.3 floor means the dashboard tooltip's "a sleeping infant ≈ 0" cannot happen on the deployed brain; her arousal never reads below 30%.
- **Fix:** page and dashboard tooltip now state the floor. Whether a resting floor of 0.3 is wanted is a design call (it was added so a quiet brain still acts).

### 2.2 Hypothalamus — ✅ agree
- `dH/dt = −α(H − H_set) + input`, `α = 0.1`, needs-attention threshold 0.15 (`modules.js:405-426`).

### 2.3 Basal ganglia — ✗ page wrong on the deployed path
- **Page:** 6 channels × 25 neurons (150), `rate = EMA(spikes/25, α 0.3)`, winner needs `rate ≥ 0.15`, softmax `P(a) = e^{Q/τ}/Σ`, τ = impulsivity.
- **Code (browser):** `js/brain/motor.js:26` 25 per channel, `:43` **floor 0.05** (lowered from 0.15 because the old floor sat above the steady-state rate and the motor never left idle), `:145` EMA **0.5/0.5** (was 0.7/0.3). `modules.js:295-325`: τ = **2.0** for Unity (high temperature = impulsive), not "τ = impulsivity".
- **Code (deployed):** the server never sees per-neuron spikes, so there are **no channels at all**: `server/brain-server.js:6341-6357` builds six Q-values from cluster activities (`respond_text = 0.6·cortex + 0.3·bg + 0.1·hippo`, `generate_image = 0.4·amyg + 0.35·mystery + 0.25·cortex`, `speak = 0.5·arousal + …`, `listen = max(0, 0.3 − total)`, `idle = max(0.05, 0.2 − 0.15·arousal)`), EMA 0.7/0.3, plain argmax, **no confidence floor, no softmax**.
- **Why:** the page describes the browser model, written before GPU-exclusive compute removed per-neuron readback.
- **Fix:** page §8.9 rewritten to show the deployed formula and label the channel model browser-only.

### 2.4 Cerebellum — ✗ page wrong; three different formulas exist
- **Page:** `errorCorrection = −(Σ error²/n) × 2`.
- **Code (browser):** `engine.js:676` `errorSignal = meanAbs(error) × 2` (mean absolute, not mean square), `:684-685` cortex gets `−errorSignal`, basal ganglia `−0.5·errorSignal`.
- **Code (deployed):** `server/brain-server.js:7329-7338` — `cerebFeedback = −(cerebellum.spikeCount / cerebellum.size) × 2` for cortex and basal ganglia only, cortex additionally receiving the migration-divergence term. The server's "error" is the cerebellum's **firing rate**, not a prediction residual; the forward model in `modules.js:363-398` (`corrected = pred + w·(tgt − pred)`, `w += lr·error`) runs only in the browser.
- **Math:** on the deployed path the cerebellum is a negative feedback proportional to its own activity. That is a defensible damping term, but it is not the Marr-Albus error correction the page describes.
- **Fix:** page §4/§8 state the deployed formula. Design question owed: give the server-side cerebellum a real prediction residual (the cortex prediction error already exists at `cluster.js:2397`).

### 2.5 Kuramoto coherence — ✅ agree on the formula; ⚠ one math wart, fixed
- **Page / guide:** `R = |Σ e^{iθ_k}|/N` per band, `0.6·rGamma + 0.4·rTheta`, EMA α 0.1, ignition lift, dissociation drop, dream drop.
- **Code:** `server/brain-server.js:6453-6460` the two order parameters and the 60/40 blend; `:6468` `+0.3·broadcast` when the broadcast exceeds 0.5; `:6476` `×(1 − 0.4·dissociation)` above 0.3; `:6482` `×0.6` while dreaming; `:6250` `0.9·old + 0.1·new`. Per-cluster phases come from each cluster's own activity-modulated accumulator (`:7340-7346`, `cluster.js:4236`), so the measure is real.
- **Math wart:** the sum was seeded with the cortex's base phases (`N = 2`, `:6409-6413`) and the loop then added the cortex's own phases again (`:6416-6450`) — the same value twice, so the cortex carried double weight in every reading. **Fixed in this change:** the loop skips the cortex cluster. Expect the live coherence to read slightly lower and more honest after the next boot.

### 2.6 Theta / gamma — ⚠ the Hz are simulated-time labels
- **Page:** "theta ~6 Hz modulates drive, gamma ~40 Hz modulates learning rate, gated to the upper theta half".
- **Code:** `cluster.js:537-538` `thetaPeriod = 167`, `gammaPeriod = 25` — in **ticks**; `:524` ±15% drive; `:4251` the upper-half gate. 167 ticks is 6 Hz only if a tick is 1 ms. The server's tick is `BRAIN_TICK_MS` = 100 ms above a million neurons (`brain-server.js:2166`), so on the deployed brain theta cycles every **16.7 s** and gamma every **2.5 s** of wall-clock.
- **Math:** the gating still cycles — plasticity is still modulated across phases — but nothing about it is 6 Hz or 40 Hz in real time, and the curriculum's gamma sampling walks the same period in teach calls.
- **Fix:** page §5 now gives the periods in ticks and both readings of them. Whether the periods should scale with `BRAIN_TICK_MS` is a design call.

### 2.7 Ψ — ✅ agree
- `Ψ = √(1/n) · N³ · Φ̂ · [α·Id + β·Ego + γ·Left + δ·Right]`, then `log10(max(1, ·))` (`mystery.js:201-222`). `n` = active spikes, `N` = total neurons. `psiGain` rides Ψ's deviation from its own slow EMA and is clamped `[0.8, 1.5]` (`brain-server.js:6236`).

### 2.8 Φ proxy — ✗ page wrong, and the first draft of this file was wrong with it (⚠)
- **Page:** "Shannon entropy of 1024 sampled spikes", and the first draft of this file said "floored at 0.1".
- **Code:** `cluster.js:2487-2497` — at scale Φ is the **binary entropy of the exact GPU spike proportion** (`spikeCount / size`), the 1024-sample path being the browser fallback. `brain-server.js:6173-6197`: the 0.1 floor is **gone**; Φ̂ = `raw / reference`, the reference seeded at `H(0.015) = 0.1124`, raised to any new high at once and decayed at 0.99995/tick never below the seed; `floored` means `norm ≤ 0.01`.
- **Math:** `H(p)` for `p < 0.5` is monotone in `p`, so this Φ̂ is **her firing rate relative to its own high-water mark** — a sparsity meter, not integration. The code's own comment admits the design limit. It does move Ψ now (the old clamp made it a constant that cancelled out of `psiGain`), which is the improvement.
- **Fix:** this file corrected; page §6 corrected. Owed: an integration measure that is not a function of firing rate alone (e.g. mutual information between cluster spike proportions across a tick window — the per-cluster counts already arrive every batch).

---

## 3. Consciousness mechanisms

### 3.1 Global workspace — ✗ page and dashboard wrong on both numbers
- **Page / dashboard tooltip:** ignition threshold 0.55; a 10% mean-bucket boost on the broadcast word.
- **Code:** `global-workspace.js:69-75` default **0.35** (lowered from 0.45 on her own report; `DREAM_GW_IGNITION` overrides). `cluster/emit.js:526` boost = `1 + 0.6 × strength` — up to **+60%**, not 10%.
- **Math:** a 60% multiplier on one bucket is a strong prior toward repeating the last ignited word; the anti-repeat damp in `cluster.js:2601-2609` (candidate value × down to 0.25 once a word exceeds 40% of recent emissions) exists to counter exactly that. The two constants were tuned against each other and neither is documented.
- **Fix:** page and dashboard tooltip corrected to 0.35 and `1 + 0.6·strength`.

### 3.2 Predictive-coding surprise gate — ✗ page simplified
- **Page:** `gate = 0.5 + clamp(error, 0, 1)` → 1.5× / 0.5×.
- **Code:** `cluster.js:2397-2421` `gate = 0.5 + err` (or `0.5 + err × coherence × inhibition` under the noise gate), ceiling `DREAM_SURPRISE_MAX` 1.5, and a **saturation clamp to 0.5** while sem→motor basins are collapsed (so a high error from corruption cannot amplify its own stamping). Its distribution is recorded (`_surpriseStats`).
- **Fix:** page text corrected.

### 3.3 Stream blend, meta-register, attention — ✅ agree
- 60/40 blend `inner-voice.js:248`; reflective inject 0.3 halving per repeat to a 0.04 floor `cluster.js:4125-4132`; attention gain clamped `[0.5, 2.0]` `cluster.js:4301`.

---

## 4. Memory

### 4.1 Working memory — ✅ agree, with one caveat the page lacks
- `WM_DECAY_RATE 0.9995`, drop below 0.1, `CONSOLIDATION_THRESHOLD 3` (`js/brain/memory.js:35-36, 138-186`).
- **Caveat:** the server's Tier-0 age-out → Tier-1 promotion is **suspended while `_curriculumInProgress`** (`server/brain-server/memory.js:1119-1129`) — the teach-heartbeat snapshots were a freeze source and merge anyway. Her walk-time episodes come from the other two writers (chat and phase completion). The guide's statement that "the whole chain now runs while she studies" is true for those writers and not for this one.
- **Fix:** guide and page now say which writer sleeps during the walk.

### 4.2 Episodic salience — ✅ agree; decay ⚠ math, fixed
- Weights 0.4/0.3/0.2/0.1 (`server/brain-server/memory.js:398, 536`); prune at `effective_salience < 0.05` and age > 30 d (`:612-613`).
- **Decay:** page and variable name say "168-hour half-life"; the code computed `exp(−age_h / 168)` (`:622`), which is a **time constant** — half strength arrives at 168·ln2 ≈ 116 h, 1/e at 168 h. **Fixed in this change:** `exp(−ln2 · age_h / 168)`, so 168 h is a half-life as documented. Consequence: traces now decay slower than before (half at 168 h instead of 116 h), so fewer prunes per sweep. No walk gate touched.

### 4.3 Frequency-merge — ✗ page wrong
- **Page:** cosine > 0.85 within 48 h. **Code:** exact-text merge within 48 h (`:470`) then cosine ≥ **0.5** (`:489-500`, lowered from 0.7 because near-identical heartbeats were not merging). The dashboard tooltip already said 0.5.
- **Fix:** page corrected.

### 4.4 Tier-1 → Tier-2 promotion gate — ✗ page wrong
- **Page:** `salience > 0.5 AND frequency ≥ 3 AND consolidations ≥ 2`.
- **Code:** `findPromotionCandidates` (`:662-665`) — salience > **0.2**, frequency ≥ **1**, consolidation ≥ **0**, deliberately relaxed to break a chicken-and-egg (nothing could ever consolidate first).
- **Fix:** page corrected. The relaxed gate means any salient-enough episode promotes on its first dream pass; that is the current design, stated.

### 4.5 Schemas — ✗ page's equation block wrong, its prose right
- Group cosine **0.85** (`hippocampal-schema.js:70`, raised from 0.70 — the page's eq block still says 0.7), merge 0.90 with attribute cosine 0.7 (`:52, 297-299`), decay 0.967/day (`:47`). ✅ otherwise.
- **Retrieval:** top-K 5, strength bonus `min(0.2, 0.05·ln(1+s))` (`:548-562`). The page's **"+0.05 Tier-3 boost" does not exist** in `retrieveSchemas`.
- **Fix:** page eq block corrected; the Tier-3 line removed.

### 4.6 Identity (Tier 3) — ✗ page wrong on the cap
- Promotion `strength > 5 ∧ retrievals > 100 ∧ |valence| > 0.6`, decay 0.999/day, baseline inject 0.15 (`:620-648`) ✅. Cap: page says 50, code `TIER3_HARD_CAP = Infinity` (`:647`).
- **Fix:** page corrected.

### 4.7 Consolidation engine — ✗ page wrong on the cap
- 5 min, top-20, replay ×4, spindle 1.2× for 200 ms / 1000 ms quiet (`consolidation-engine.js:38-43`, `memory.js:662`) ✅. Pass cap: page says `DREAM_CONSOLIDATION_MAX_MS` default 30 s; code **45 s** routine, **120 s** forced (`:152-184`).
- **Fix:** page corrected.

### 4.8 Dream recombination — ✅ agree
- Coherence ≥ 0.20, ≥ 4 words, unique ratio ≥ 0.6, reps 5, 3 rounds per window (`curriculum.js:5751-5761`). 🔧 no live non-zero count yet.

---

## 5. Language

### 5.1 Single-tick emission floor — ✅ agree
- `NOISE_FLOOR 0.001`, adaptive `EMA × 0.5` after 20 samples, EMA α 0.05 (`cluster/emit.js:789-819, 913-914`).

### 5.2 Comprehension gate — ✗ page wrong, and ⚠ the probe measures less than its name
- **Page:** "inject each prompt word's GloVe at 0.4 into sem, step, cosine of the sem readout against the answer > 0.05, pass at ≥ 40%".
- **Code:** `curriculum.js:33421-33525` — for each prompt word it takes the **first letter only**, builds that letter's one-hot, propagates it through `letter_to_sem`, averages, mean-centres, and compares to the answer's GloVe; a question passes at cosine > **0.10**; the gate passes at `GATE_PATH_MIN` = **0.80** of up to 10 sampled questions (`curriculum.js:920`).
- **Math:** two prompts whose words share first letters produce identical probes ("cat sat" ≡ "car sun"). The gate therefore measures the letter→meaning projection's association with the answer, not comprehension of the prompt. It is the gate every grade's cells are closed on.
- **Fix:** page corrected to describe what runs. **Owed (design, re-price first):** read each prompt word through the real reading path (`cluster.readText`, or its GloVe injected into sem) before the readout, so the probe sees words rather than initials.

### 5.3 Visual attention — ✗ page wrong; browser only
- **Page:** `!describedOnce ∨ (cortexError > 0.5 ∧ salience > 0.3) ∨ Δsalience > 0.4 ∨ Δarousal > 0.15`.
- **Code:** `engine.js:786` `cortexError > 0.7 && salience > 0.5` only — no Δsalience, no Δarousal — and this is the **browser** engine. The deployed look lane (`visual-memory.js`) is thought-driven on its own cadence with a 30 s reference gap (`:1669`), not a trigger formula.
- **Fix:** page §8.6 corrected and scoped.

### 5.4 Hippocampal recall threshold — ✗ page wrong
- **Page (§1.5 step 3):** "if the cosine clears ~0.75 the episode is injected".
- **Code:** browser `engine.js:75` `RECALL_ERROR_THRESHOLD = 0.4` on **prediction error**, not cosine; the deployed chat path uses schema retrieval (§4.5) instead.
- **Fix:** page corrected.

### 5.5 Sentence types, post-processing, bigrams, letter-shape word types — 🪦 browser only, one renderer shared
- `language-cortex.js` (sentence-type probabilities, agreement/negation post-processing, bigram sequencing, `_fineType`) runs in the **browser fallback** only. The server keeps exactly one function from it: `_renderSentence` for capitalisation and terminal punctuation on a probe answer (`chat.js:855`, `language-cortex.js:2618-2660`). The page's §8.14 / §8.16 / §8.17 describe that engine as if it were the deployed one.
- **Fix:** those sections are now labelled browser-fallback with the one shared renderer named.

---

## 6. Senses, hands, compute — ✅ agree (constants read)
- Definition caps 24 / 10 / 6 (`curriculum.js:17833-17835`); visual store cap 25,000 (`visual-memory.js:91`); image engine free-VRAM floor 3072 MB, 5 s probe TTL, 20 s idle unload, 15 s chat yield (`image-engine.js:68-97`), 30 s look gap (`visual-memory.js:1669`); tunnel cadence 25 ticks, 16 buckets, gain 0.25, RTT gate 19 ms (`gpu.js:1840-1844`). All 🔧 unread on a live boot for the lanes that only the fresh walk exercises (pool, tunnel, image engine, definition union).

---

## 7. What changed in this pass

**Code (two one-line math repairs, no walk gate touched):**
1. `server/brain-server/memory.js` — episodic decay now `exp(−ln2·age/168)`: 168 h is a half-life, as named and documented, instead of a time constant.
2. `server/brain-server.js` `_computeKuramotoCoherence` — the cortex is counted once; its base phase no longer double-weights every reading.

**Page (`html/brain-equations.html`), corrected to the code:** cluster shares (1.6), basal ganglia (2.3), cerebellum (2.4), theta/gamma periods (2.6), Φ (2.8), ignition threshold and boost (3.1), surprise gate (3.2), frequency-merge (4.3), promotion gate (4.4), schema cosine and the phantom Tier-3 boost (4.5), identity cap (4.6), consolidation cap (4.7), comprehension gate (5.2), visual attention (5.3), recall threshold (5.4), browser-only language sections (5.5), neuron-count branches (1.5), amygdala floor (2.1). Dashboard tooltip: ignition 0.55 → 0.35.

**Owed, each a design decision rather than a typo:**
- 5.2 the comprehension probe reads initials, not words — re-price the walk before changing the gate.
- 2.8 Φ̂ is a firing-rate meter — a real integration measure is still to be built.
- 2.4 the deployed cerebellum feeds back its firing rate, not a prediction residual.
- 2.6 theta/gamma periods are in ticks and do not scale with `BRAIN_TICK_MS`.
- 1.7 structural plasticity has no caller.
- 1.5 the floor estimator's 20 bytes/neuron against the allocator's 21 — one constant, read from one place.
- `docs/EQUATIONS.md` §8 carries the browser language engine as live and 25 headers with ticket/session tags; it needs the same pass as the page.

## 8. The readings to take first on the next boot
1. `state.voice.verdict.status` — `matrix-driven` or nothing else counts.
2. `consciousness.phiState` — `live`, not `floored`; and `phiNorm` should move with firing, because that is all it can do (2.8).
3. `coherence` — expect a modest drop versus the last boot's reading; that is the double-count leaving, not a regression.
