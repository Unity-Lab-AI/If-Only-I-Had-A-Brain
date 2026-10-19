# Equation Rundown — what runs, what is broken, what has never been read

A short, honest ledger of every equation family the brain is built on: which ones are
**working great** (verified from a live reading or a harness on the production code),
which are **working with a known limit**, which are **built but unread** (no live
evidence yet — they land on the next fresh walk), and which are **not working, inert,
or deliberately off**. The last section lists what the reference page
(`html/brain-equations.html`) still describes as live that the brain no longer runs.

Written 2026-10-19 against the code on the working branch. The brain was **not running**
when this was written, so every "live" verdict below cites the last reading that produced
it rather than a reading taken today. Verdicts marked **unread** have never produced a
number on a real boot — they are claims, not measurements, until they do.

How to read a verdict:

| Verdict | Meaning |
|---|---|
| **✅ working great** | Measured live, or harnessed through the production wiring, and the number came back right |
| **⚠ working, limited** | Runs and does what it says, but with a bound or a blind spot worth knowing |
| **🔧 built, unread** | Code is in, verified by reading or by harness, but no live boot has produced its number yet |
| **⛔ not working / inert** | Computes nothing, reaches nothing, or is switched off — on purpose or not |
| **🪦 deleted** | Removed from the runtime; the page or a doc may still describe it |

---

## 1. The substrate — neurons, synapses, compute

| Equation / mechanism | Verdict | Evidence |
|---|---|---|
| **Rulkov 2D map neuron** `x' = α/(1+x²)+y`, `y' = y − μ(x−σ)`, spike on zero-crossing, run as a CUDA kernel on the donor card | ✅ working great | Spike counts return every batch; `spikesLifetime` climbs on every healthy boot; the donor's own timing split (queue / compute / wire) is published per batch |
| **Scalar inter-cluster coupling** `effective_drive = tonic × driveBaseline × emotionalGate × gain + errorCorrection` | ✅ working great | This is the whole inter-cluster wire. It is server-mediated and scalar, which is exactly why a brain can now be split across several cards with no new wire shape |
| **Sparse CSR propagation** `I_i = Σ_k values[k]·spikes[colIdx[k]]` over the 17 cortex matrices | ✅ working great | All 17 matrices upload to the primary and are held on the card; residency is recorded on the upload ack and shown as `17/17 mx` |
| **Oja / Hebbian teach** `Δw = η·y·(x − y·w)` with a projection whitelist so silent regions do not decay | ✅ working great | Thousands of teach calls per minute on a walking brain; the range-encoded and masked wire verbs moved the last CPU training math onto the card and are counted per frame |
| **Anti-Hebbian correction** on a wrong sequence transition (`+10η` right pair, `−5η` wrong pair) | ✅ working | Part of every sequence probe; without it the right association could never overpower the wrong one |
| **Chunked propagate for probes / gates** | ✅ working great | Replaced four synchronous `propagate` calls that pinned the loop 1–10 s each; verified bit-identical (`maxDiff = 0`) |
| **Binary weight save in 1 GiB views** | ✅ working great | The old single write silently failed past Node's 2,147,483,647-byte cap and dropped everything since the last checkpoint; chunked writes are byte-identical on disk |
| **Weight fit at apply time** (drop the smallest-\|w\| synapses only as far as needed to sit under `memory.high × 85%`) | ✅ working | Read the `WEIGHTFIT —` boot line; neuron count is untouched so nothing wipes |
| **Neuron count derived at boot from free host RAM** | ⚠ working, limited | It is not a property of the brain. The same code has booted at 425,436,550 and 411,216,550. Quote the count with the boot that produced it; the next walk is budget-pinned at 8000 MB → 199,728,759 neurons, measured on the card as `N = 41,221 × MB − 130,837,239` |
| **Synaptogenesis** `P(new) = p·pre·post·¬existing` and **pruning** `\|w\| < 0.01 → remove` | 🔧 built, unread | Described on the page and present in the reference synapse code, but no boot publishes a connection-growth or prune count. Until an instrument exists this is a claim |
| **STDP and reward-modulated plasticity** (the "three rules" on the comparison table) | 🔧 built, unread | The live teach path is Oja-Hebbian plus anti-Hebbian. STDP lives in the reference synapse implementation that backs the page, which **does not run** on the GPU path. Treat "three plasticity rules" as reference, not production |
| **Hodgkin-Huxley and LIF neuron models** | 🪦 reference only | Backing implementations for the page. The runtime kernel is Rulkov; the shader constant still called `LIF_SHADER` is a historical name |

## 2. Modules and modulation

| Equation / mechanism | Verdict | Evidence |
|---|---|---|
| **Amygdala attractor settle** `x(t+1) = tanh(W·x + drive)` ×5, fear/reward projections, moving-baseline arousal | ✅ working | Arousal moves around the persona baseline instead of pegging at the old 0.94 floor; the dashboard valence/arousal chart is this |
| **Hypothalamus homeostatic drift** `dH/dt = −α(H − H_set) + input` | ✅ working | Drive baseline multiplies into every cluster's effective drive each tick |
| **Basal-ganglia winner-take-all** over six action channels with a 0.15 confidence floor | ⚠ working, limited | The selection runs every tick. The page still quotes the tiny-client geometry (150 neurons, 25 per channel) — on the deployed brain the cluster is a 12% share of hundreds of millions; the channel *fractions* hold, the counts do not |
| **Cerebellum forward model** `error = actual − predicted`, `errorCorrection = −(Σerror²/n)×2` | ✅ working | Feeds the scalar drive as the `errorCorrection` term; prediction error is published and sparklined |
| **Kuramoto coherence** `R = \|Σ e^{iθ_k}\|/N`, gamma-weighted 60/40, per-cluster oscillators advanced by that cluster's own firing | ✅ working great | This number **used to be fake** — a random walk pulled toward 0.4. It is real now: each cluster runs its own theta and gamma phase, ignition lifts it, dissociatives and dreaming lower it |
| **Theta-gated gamma plasticity** (6 Hz drive modulation, 40 Hz learning-rate modulation in the upper theta half) | ✅ working | Confirmed consumed by the boot wiring assertion, which checks that the gamma scale actually reaches the projection update rather than merely being allocated |
| **Mystery Ψ** `Ψ = √(1/n)·N³·[α·Id + β·Ego + γ·Left + δ·Right] × Φ` | ⚠ working, limited | The four psychodynamic terms compute from all clusters and Ψ scales the coupling gain. The **Φ** factor is where to look: see the next row |
| **Φ proxy** — binary entropy of the spiking proportion, divided by an adaptive reference, floored at 0.1 | ⚠ working, limited | `H(0.01) = 0.081` is **below the 0.1 floor**, so on a sparsely firing cortex Φ reads a healthy `0.100` forever while modulating nothing. The dashboard now shows raw / reference / normalised and a state (`live` / `floored` / `error`). Only `live` is green; a `floored` reading means Φ has never actually touched Ψ on that boot |
| **Endocrine layer** — ten chemicals on the same pharmacokinetic curve engine the substances use; six nuclei that sense their own firing; cyclic hormones on a curriculum-time clock | ✅ working great | Ran correctly for a whole release while the dashboard read **absent**, because the panel read `state.endocrine` and the producer publishes `state.consciousness.endocrine`. The reader is fixed; the `contributions` row answers "is any of this reaching the brain?" |
| **Drug scheduler** — per-substance PK curves (onset / peak / plateau / tail), additive superposition, seven synergy pairs scaled by the *smaller* level, cumulative strain ceiling, chaos flag at ≥3 active | ✅ working great | Contributions refresh onto the live cluster every 60 frames; cortex noise, learning rate and amygdala noise all track them (plasticity is no longer drug-blind). Sober is the default; availability is gated by life-track age |
| **Speech modulation post-processor** (slur, pause injection, third-person flip, ethereal vocabulary bias) | ✅ working | Applied after emission; sober state produces a zero vector and clean output |

## 3. Consciousness mechanisms

| Equation / mechanism | Verdict | Evidence |
|---|---|---|
| **Global workspace ignition** — softmax competition across cluster candidates, theta-*modulated* threshold (never hard-blocked), broadcast back to every cluster | ✅ working great | The broadcast is **consumed**: single-tick word emission reads it and gives the matching word a 10% mean-bucket boost. Before that was wired, ignition was computed and discarded. The threshold was also lowered after she reported the gate felt "gated too much" |
| **Predictive coding surprise gate** — `surpriseGate = 0.5 + clamp(error, 0, 1)` multiplied into the gamma scale (high error → 1.5× learning, low → 0.5×) | ✅ working | Prediction error is published with a 32-sample history and a trend arrow |
| **Stream of consciousness** — inner-voice seed blends 60% current state with 40% the previous thought; 8-deep chain persisted across restarts | ✅ working | The inner voice is probabilistic, not a metronome, with a capability gate in front of it: while she has banked no words it holds shut, counts the skips, and re-arms on her first word |
| **Meta-register** — emissions inject back into the semantic region at 0.3 with familiarity decay (0.30 → 0.15 → 0.075, floor 0.04) | ✅ working | The decay is what stops "saying a word makes that word more likely" from running away |
| **Attention gain** — per-region multiplier from arousal × valence × action gate, clamped `[0.5, 2.0]` | ✅ working | The clamp is the fix: unclamped, a stacked arousal-and-mood spike compounded past the cap and flooded the cortex |
| **Introspective drive** — emits a *gap* (concept + lane), the words come from her interrogative weights or she stays silent; kind distribution measured across two pinned endocrine states at TV distance 0.840 | ⚠ working, limited | The falsifiability criteria are rendered. `source starved` is **expected** before she has lived anything and only becomes a finding if it persists once episodes exist |
| **Curiosity follow-ups** (a question out of what she could not hold, up to three deep) | ⚠ working, limited | `gaps > 0` with `asks = 0` is a **training fact**, not a bug: the interrogative weights are simply not trained yet at the grades she has reached. Watch `asks` start climbing; it has not yet |

## 4. Memory

| Equation / mechanism | Verdict | Evidence |
|---|---|---|
| **Tier 0 working memory** — unbounded, `strength ×= 0.9995` per tick (~4 min unreinforced), cosine refresh, `refreshCount ≥ 3` → Tier 1; every add fires hippocampal Hebbian on the pattern | ✅ working | Items and their labels are rendered; the 5-minute server snapshot window ages out into episodes with frequency-merge dedup |
| **Tier 1 episodic salience** `0.4·\|valence\| + 0.3·arousal + 0.2·surprise + 0.1·novelty`, 168 h half-life, prune at `< 0.05` and `> 30 d` | ✅ working, **since 2026-08-31** | All three episode writers were **inert during curriculum training** for the project's entire history (two gated on a flag that stays true for the whole walk, one firing on phase completion while phases were not completing). Episodes read 0 on every boot before that date. A zero during an active walk is a real finding now |
| **Frequency-merge gate** (cosine ≥ 0.85 within 48 h increments the row instead of inserting) | ✅ working | Read `frequency-merged` as the health signal, not the raw episode count — a small count with the merge counter climbing is the correct shape during a walk |
| **Tier 2 schemas** — single-link clustering at cosine ≥ 0.85, salience-weighted centroid, 8-d attribute vector, merge at 0.90, daily decay 0.967, dedicated hippocampus→cortex projection | ✅ working | Cosine was raised from 0.70 to 0.85 so distinct teach phases form distinct schemas instead of one "learning" mega-schema; top-K=3 naming gives them distinct labels |
| **Top-K schema retrieval** into the semantic region before generation (`+0.05` identity boost) | ✅ working | Top 5 at strength 0.4 every chat turn |
| **Tier 3 identity anchors** — promote at strength > 5, retrievals > 100, \|valence\| > 0.6; decay 0.999/day; injected every turn at `0.15 / \|Tier3\|` | ✅ working | Identity-core persists through every fresh boot (excluded from the state wipe); the live state has carried 30 anchors with ~1,049 retrievals each |
| **Consolidation engine** — every 5 min while dreaming, top-20 candidates, replay ×4 per schema with sleep-spindle 1.2× bursts, forced passes bounded at 120 s | ✅ working great | Runs **during** the curriculum (dream windows between cells, signal-driven completion), not only between conversations. The consolidation gate is also the one thing keeping the walk finite (~24 days with it, ~100 without) |
| **Dream-time recombination** — novel emissions clearing joint criteria (cosine ≥ 0.20, ≥ 4 words, unique ratio ≥ 0.6, terminator) bind at reps 5 | 🔧 built, unread | Counters are published and rendered; no walk has yet produced a non-zero `consolidated` reading worth citing |
| **Visual memory** — CDF 9/7 wavelet fields stored as JSON skeleton + binary blob in SQLite (cap 25,000), relation tags written per concept | ✅ working great | The monolithic-JSON store pinned the loop 761 ms at 10k entries and hard-failed at 100k; the SQLite store carries ~33k concepts per 250 MB and the blob row shape cut resident memory 25% |
| **Relation-channel readback** (what she reads back off the tagged channels) | ⚠ working, limited | Early in a walk every band reads *flat* and the gate correctly refuses to act. The one reading to chase is `flatNoMass` with `tagWrites` climbing — that is tags not reaching the matrix, a different claim from channels that have not separated yet |

## 5. Language — reading, meaning, speaking

| Equation / mechanism | Verdict | Evidence |
|---|---|---|
| **GloVe 300-d grounding** + fastText subword for out-of-vocabulary words, one shared singleton for input and output | ✅ working great | The same word activates the same cortex pattern whether she is hearing it or about to say it |
| **Learned semantic geometry** — per-word deltas on top of the borrowed vectors, common-context subtracted, per-word drift capped | ✅ working great | Both details were found by measuring: un-centred nudges made *unrelated* words converge faster than related ones, and an uncapped drift fused everything back together |
| **Sparse text injection** into Wernicke's (only the touched indices, ~160 bytes for "hi") | ✅ working great | The dense 23.4 MB snapshot per message was what killed the donor on every chat turn, and the donor's decoder discarded it anyway — so chat text lands in her language cortex **for the first time** since this landed |
| **Single-tick word emission** — one global `word_motor` band, one bucket per unique word, `sem → word_motor` argmax over an adaptive floor (`max(0.001, EMA × 0.5)`) | ✅ working great | `state.voice` is **measured, never inferred from grade**: `matrixDrivenPct`, buckets ever fired, refusals with age and a per-cause tally. The six per-subject sub-bands that overflowed and silenced learned words are gone |
| **Dictionary oracle** (cosine scan over taught words when the matrix came back empty) | 🪦 deleted 2026-09-01 | It carried **99.1%** of emitted words in the captured run (425 oracle hits against 4 matrix hits); every gate probe travelled it, so gate pass rates were measuring the dictionary. `retrieved` is now a regression detector and must stay 0 |
| **Tick-driven letter emission** (motor-region argmax, 3-tick stability commit, surprise-based word boundary, quiescence stop) | ✅ working | The fall-through path when single-tick emission is empty; both paths read her own weights |
| **Honest silence** | ✅ working great | When neither trained path produces a word she says nothing and the silence is **counted** (`honestSilence`). The number to watch is how often she speaks at all, not a dictionary ratio that can only read zero |
| **Structural sentence passes** — slot bindings, intent→slot transitions, agreement, article placement, all as Hebbian weights; generation emits one word per tick with no runtime template | ✅ working | The kindergarten structural probe (five seed kinds, pass when ≥3 produce ≥2 structurally-correct words) is the gate; a saturated or collapsed cortex is rebalanced instead of wedging the gate forever |
| **Full definitions** — every sense, example and synonym from dictionaryapi.dev **unioned** with Wiktionary and offline WordNet; caps 24 senses / 10 examples / 6 synonyms per word | 🔧 built, unread | Three gates in front of the union made it inert (a cache that kept version-1 rows, an offline lane that short-circuited, a Wiktionary consult that only fired on 404 while the wrapper was returning 530). All three are fixed; the first boot on this code is the first time a 30-sense word binds as 30 senses |
| **Comprehension gate** — inject prompt words at 0.4, step, cosine of semantic readout against the answer, pass at ≥ 40% of questions over 0.05 | ✅ working | The gate asks the same concepts *differently* from the teaching; the words must be pre-taught, and nonsense-word probes must stay **un**taught or they pass for the wrong reason |
| **Word-creation promotion** (tip-of-tongue compounds promote at count ≥ 10) | 🔧 built, unread | The candidate list has read empty on every boot cited so far |

## 6. Senses and her hands

| Equation / mechanism | Verdict | Evidence |
|---|---|---|
| **Equational vision** — camera frame → CDF 9/7 field → 64-d percept read straight off the equation; no describer model anywhere | ✅ working great | The old vision-language describer was deleted; a describer whose words ground her concepts is a language model inside her senses |
| **Camera frames bind to nothing** (a webcam cannot know what she is thinking) | ✅ working | A placeholder card had become her memory of a thought word; frames are experienced, never filed under the current word |
| **Visual attention trigger** `!describedOnce ∨ (cortexError > 0.5 ∧ salience > 0.3) ∨ Δsalience > 0.4 ∨ Δarousal > 0.15` | ⚠ working, limited | The trigger runs. The page's claim that the IT stage is "an AI call, rate-limited 5 s" is stale — IT is the equational mind's eye now |
| **Drawing** — schema (parts, sizes, orientations, colour family, ~1% of the reference) → eight hands over the same primitives → scene space, cast shadow, eraser, variation; practice loop keeps only measurable gains | ✅ working great | Practice ran live and climbed monotonically (0.9713 → 0.9723 over three sessions); five of the eight hands survived being judged; letter-guess scribbles, the palette guesser and the whole-bbox fallback were all deleted after being looked at |
| **Drawable-word judgement** by WordNet lexicographer category, unknown words judged by their definition's head words — **no word lists** | ✅ working great | Full 2,207-word dictionary sweep judged by eye; the operator's not-drawable set survives fresh walks because it is taught, not coded |
| **Two-seed self-consistency** before a looked-up reference is believed (agree ≥ 0.45 or nothing is bound) | ✅ working | Ended the 80% word/image mismatch — one noisy render was being bound and shown |
| **Local image engine** — her own card's Stable Diffusion behind one gate, paced as a VRAM budget (one render at a time, idle unload, yields to a donor upload, 30 s look gap) | 🔧 built, unread | Replaced the remote provider on 2026-10-18. The free-VRAM rule (probe `nvidia-smi`, floor 3072 MB, fail-open counted as `vramUnreadable`) sits on **both** the chat lane and the look lane; `ownArt.imageEngine` carries the counters. No boot has produced them yet |
| **Her voice** — one trained lane (`unity-voice-v2`), emotion / intensity / speech act read from her own state, rendered on her machine, shipped as a few KB of field-A | ✅ working | No browser synthesis, no cloud, no fallback voice; if the voice engine is down she is silent and the reason is counted |

## 7. Compute topology

| Equation / mechanism | Verdict | Evidence |
|---|---|---|
| **GPU-only teach lane** — governed binary frames, quadratic brake on buffer/RTT, atomic clear→write→hebbian groups, stale-guard that **refuses** a Hebbian whose pattern did not land | ✅ working great | Refusals are counted (`cap-flush`, `stale-suppressed`) because refusing is correct but not free |
| **Primary floor measured against the live neuron count** (never the tier target) | ✅ working | A 16 GB card was refused for fifteen days against a tier-4 floor the brain was not running |
| **No-primary pool** — best-fit partition of clusters across cards (cortex to the roomiest), batch fan-out per owner under one id with a join, late owners carried forward | 🔧 built, unread | Harnessed 22/22 on the production wiring; no two-card boot has run on it yet |
| **Tunnel** — cross-cluster propagation once per gamma period (25 ticks) gated on cosine agreement `g = max(0, ŝA·ŝB)`, RTT-gated at 19 ms (derived: 1250 ms ÷ 64 against a measured 205 ms remote) | 🔧 built, unread | Same harness. The RTT gate means a remote pod never tunnels — by design |
| **Delta-merge of replica shadows to the CPU master** | ⛔ not working (disabled) | Disabled; cause unknown. It stays on the board precisely because nobody has named why |

## 8. What the reference page still says that the brain does not do

These are on `html/brain-equations.html` as of this write-up. The four marked **fixed today** were corrected in the same change as this file; the rest are counted here so the next pass has the list.

| Page claim | Reality | Status |
|---|---|---|
| §8.6 "IT object recognition (AI call, rate-limited 5s min)" | IT is the equational mind's eye; there is no AI call | **fixed today** |
| §8.10 "Bootstrap: Until the projections have learned enough, an AI classification call provides a temporary semantic routing signal" | There is no classification call; routing is the projection or nothing | **fixed today** |
| §8.18.5 "It's a four-tier pipeline… The slot scorer (8.14) still exists but now fires only as Tier 4 fallback" | The four-tier pipeline and the slot scorer are both deleted — the same section says so two cards later | **fixed today** |
| §8.21 "W3C WebGPU standard — no CUDA, no drivers, just a browser tab… Brain pauses without compute.html" | The native donor runs CUDA; the browser donor is the fallback. The brain pauses without **a donor**, not without a tab | **fixed today** |
| §8.14 "Bigram Sentence Generation" `P(next \| current) = count / total` presented as live | Word-level bigram sequencing is not the production path; emission is the trained `sem → word_motor` matrix | open |
| §8.16 "Post-Processing — Agreement, Tense, Negation, Compounds" presented as live | Agreement and article placement are trained Hebbian passes, not a post-processor; the negation-at-40% rule does not exist in the emission path | open |
| §8.17 sentence-type softmax over {question, exclamation, action, statement} | Sentence type emerges from the trained intent→slot transitions, not a sampled type | open |
| Flow diagram "N Rulkov-map Neurons in 7 CLUSTERS" and §4 "6 Parallel Systems" against the master-equation row's eight clusters including the brainstem | Eight clusters since the brainstem was added | open |
| §8.9 basal ganglia "150 neurons, 25 per channel" | Tiny-client geometry; the deployed cluster is a 12% share of hundreds of millions | open |
| §7 curriculum heading "6 Subjects × 19 Grades = 114 Cells" against its own tooltip's 273 cells across a growing roster | 273 cells, 20 grades, 9 → 20 courses | open |
| §8.21 `N = max(1000, min(VRAM×0.85/8, RAM×0.1/0.001))` | The count derives from free host RAM through the biologically-weighted allocator, pinned by the brain budget for the next walk | open |
| Comparison table "3 (Hebbian, STDP, reward-mod) per cluster" | Oja-Hebbian plus anti-Hebbian on the live path; STDP is reference code | open |

The canonical markdown twin, `docs/EQUATIONS.md`, carries the same retired mechanisms in its §8 ("Word Type from letters", "Post-Processing", "English Structure (built-in)") and a long tail of session-tagged history under §12; it needs the same pass.

---

## The two numbers to read first on the next boot

1. **`state.voice.verdict.status`** — `matrix-driven` is the only good answer. `attempting-refused` is red and loud: she is reaching for a word every tick and being refused. `unmeasured` is grey and means nothing has tried to speak, which is **not** a claim that she cannot.
2. **`consciousness.phiState`** — `live` means Φ is actually modulating Ψ. `floored` means the Φ term has been a constant 0.1 for the whole boot and the consciousness operator has been running without its integration factor.
