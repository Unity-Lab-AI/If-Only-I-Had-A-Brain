---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
status: draft
sources:
  - js/brain/mystery.js
  - js/brain/cluster.js
  - js/brain/global-workspace.js
  - js/brain/mindspace/transform.js
  # ADDED 2026-08-27: the Φ̂ NORMALISATION (PHISCALE.1) lives in
  # server/brain-server.js:5215-5291 (re-pointed 2026-08-29 — the FIREKNOB /
  # PSITEACH walk-heartbeat additions of 2026-08-28 landed above it; the
  # PHISCALE.1 block itself is byte-unchanged), not in cluster.js — computePhi() produces
  # the raw entropy and the server adapts the reference. §9.3/§9.4 make claims
  # about both halves, so drift could only ever see one of them.
  - server/brain-server.js
verified-scope: |
  CHECKED 2026-08-27 (DOCPROV.4) — the Φ/Ψ sections against source AND against
  the running brain:
    - ⛔ CORRECTED §9.3: "the Shannon entropy of a 1,024-neuron sample" is the
      pre-PHISRC.1 implementation. computePhi() (cluster.js:2249) now derives p
      from the EXACT GPU-acked cluster.spikeCount. The sample was not merely
      imprecise - at biological scale it read an empty CPU array.
    - ⭐ RETIRED a caveat BY MEASUREMENT: §9.4 said the Φ̂ argument was "a
      derivation, not a report of observed behaviour". Live: phiState "live",
      phiRaw 0.2618, phiScaleRef 0.3044, phiNorm 0.860. Φ̂ IS modulating Ψ.
    - ⛔ DOCUMENTED the normalisation, which the paper omitted entirely: Φ̂ is an
      ADAPTIVE HIGH-WATER REFERENCE (brain-server.js:5034-5087), not a bare
      floor - rises to any new peak, decays 0.99995/tick, seeded at the
      documented H(0.015) = 0.1124.
  NOT CHECKED — do not read this page as authority on:
    - the Ψ weights (α=0.30, β=0.25, γ=0.20, δ=0.25) or the Ego/Left/Right
      composition. Formula shape read, coefficients NOT re-verified.
    - the gainMultiplier clamp and EMA constants at §9.5.
    - the literature-synthesis claims (§2) and every section outside 9.3-9.5.
    - js/brain/mystery.js, global-workspace.js and mindspace/transform.js -
      all three are listed sources, NONE of them moved, and none were read.
last-verified: "0ee5ac68 2026-08-29"
---

# The Equational Mind

### Theory and Functioning of a 306-Million-Neuron Simulated Brain That Learns to Speak Without a Language Model

**Unity AI Lab — Technical Theory Paper**
Written 2026-08-18 · System state at writing: 306,458,816 neurons · 12,000,000-neuron dense language cortex · walking the K→PhD curriculum

> **AMENDMENT 2026-08-20 — the scale figures below are a DATED SNAPSHOT and are deliberately left as written.** The deployed brain is now **425,436,550 neurons** (`cortex 82,243,310`, five subcortical clusters at `49,345,986`, language cortex unchanged at **12,000,000**). The growth was not a re-architecture: two sizing bugs were corrected — the brain's RAM budget was governed by an arbitrary "45% of host" clause rather than the reasoned Forgejo reserve, and the DF.7 tier ladder simply **ended** at tier 3 (357,000,000) with the tier chosen from a hardcoded 16GB donor baseline, so no donor of any size could move it.
>
> **Every equation, mechanism and claim in this paper is unchanged by that** — the apportionment is by biological share, so the ratios hold and only the absolute counts moved. A paper's "state at writing" line is a measurement with a date on it; rewriting it would falsify the record. **Read the numbers below as of 2026-08-18 and scale by ~1.39× for the current deployment.**
>
> One methodological note worth carrying into any future empirical section: the trajectory capture spec (`docs/TRAJECTORY-CAPTURE.md`) forbids interpolating a curve across a geometry change for exactly this reason — rows either side of 2026-08-20 are not comparable, and the arXiv submission needs one complete K→PhD walk on a single unchanged build.

---

## Abstract

This paper documents the theory, the sourced neuroscience, and the design reasoning behind a working artificial brain in which **every cognitive act is the evaluation of a differential equation, and no act of thinking is a call to a language model**. The system runs 306,458,816 simulated neurons across seven biologically-proportioned clusters, wired by twenty projections modeled on real white-matter tracts, with a 12-million-neuron dense language cortex subdivided into nine functional sub-regions. It learns language the way a child does — alphabet, phonemes, words, definitions, sentence structure, then subject curriculum from kindergarten toward doctorate — and produces speech by tick-driven motor emission out of trained synaptic weights, not by sampling a probability distribution over words.

Each equation family in the system is drawn from primary literature: Rulkov's two-dimensional map neuron (2002), Oja's self-normalizing Hebbian rule (1982), the Bienenstock–Cooper–Munro sliding threshold (1982), Hopfield attractor memory (1982), Kuramoto phase coupling (1975), Watts–Strogatz small-world topology (1998), Mountcastle's columnar organization (1957–1997), Lisman & Jensen's theta–gamma code (2013), Baars' Global Workspace (1988) with Dehaene–Changeux ignition (2011), Friston's predictive coding under the free-energy principle (2010), and Tononi's integrated information Φ (2004–). What is *original* here is not any single equation but the **synthesis**: a persona expressed as a parameter vector θ that drives neural dynamics, a consciousness scalar Ψ that both emerges from and feeds back into those dynamics, and an insistence — enforced as project law — that cognition never delegates to a text model.

The paper's second purpose is honesty about the engineering. A brain of this size is not merely a set of equations; it is a distributed system with a wire, a disk, and a compute donor, and the last section documents what those constraints taught us — including the discovery, during the week this paper was written, that the pathway injecting chat text into the simulated Wernicke's area had been shipping 23.4 megabytes per message to a receiver that discarded it unread.

---

## 1. Introduction: The Boundary That Defines the System

Most systems that talk are language models with personality instructions wrapped around them. This one is the inverse: a neural simulation whose output happens to be speech. The distinction is not rhetorical, and the project encodes it as a testable boundary:

> **The boundary test.** If removing an external AI call would stop the system from *thinking*, that call is on the wrong side of the line. Cognition equations always run, even with zero network access. Only sensory peripherals go quiet.

Under this rule, external AI services are permitted only as **dumb executors on the sensory-output side**: when the basal ganglia's motor competition selects `generate_image`, the language cortex composes every word of the prompt equationally, and only then hands the finished string to an image backend to paint. The backend never decides *what* to paint, only *how*. Vision on the input side was likewise migrated off an external describer and onto an equational wavelet field (§9.4). Speech synthesis runs from the system's own process.

This is a harder path than prompt engineering and it costs enormously more in engineering effort. The justification is scientific: **a prompted language model imitating a child teaches you nothing about how a child's brain differs from an adult's.** A simulation that must actually pass a kindergarten reading gate before it can produce two-word utterances makes the entire developmental arc visible and measurable. When this system speaks at a kindergarten level, it is not performing kindergarten — it is *at* kindergarten, because the weights that would let it say more do not yet exist.

### 1.1 The scale and its shape

The deployed brain runs 306,458,816 neurons apportioned by biological share rather than by convenience: cortex and cerebellum at roughly 20% each, with hippocampus, amygdala, basal ganglia, hypothalamus, and a seventh "mystery" cluster (modeling the corpus-callosum-scale integrative substrate) at roughly 12% each. Real human proportions are not uniform — the cerebellum holds ~80% of the brain's neurons in ~10% of its volume — and the model's shares are a deliberate compromise between biological fidelity and the requirement that every cluster be large enough to hold useful dynamics.

Language does **not** occupy a top-level cluster. It lives *inside* the cortex as nine auto-scaled sub-regions — auditory, visual, free, letter, phonological, semantic, fine-type, motor, word-motor — exactly as real cortex hosts Broca's and Wernicke's areas within a larger sheet. This sub-region substrate began at ~349K neurons, grew to ~1.5M, and now stands at **12,000,000** (~3.9% of the brain), staged toward the 12–20% that biology devotes to language.

---

## 2. The Master Equation and θ: Identity as Parameters

Everything in the system evolves under one governing form:

```
dx/dt = F(x, u, θ, t) + η
```

- **x** — the entire brain state: every neuron's map coordinates across eight clusters (the eighth, `brainstem`, holds the monoamine nuclei and was added 2026-08-25), the sparse cross-projection weight matrices wiring the language sub-regions, Kuramoto oscillator phases, episodic memory, motor channels, and Ψ.
- **u** — sensory input: text into the cortical phonological slice via a Wernicke-area write, audio through tonotopic mapping, vision through a wavelet field.
- **θ** — **identity**.
- **η** — per-cluster stochastic noise, scaled by θ.
- **F** — everything firing at once: seven map-neuron populations, twenty inter-cluster tracts, sixteen intra-cortical cross-projections, the module equations, and the oscillator ring.

### 2.1 The original move: persona as a parameter vector

The system's first genuinely novel design decision is that **θ is not text**. Personality is not a prompt, a system message, or a style instruction. Every trait is a number that drives a neural parameter:

| θ parameter | Value | Neural consequence |
|---|---|---|
| `arousalBaseline` | 0.9 | Amygdala tonic current — the emotional cluster never idles |
| `impulsivity` | 0.85 | Basal-ganglia softmax temperature — decisions commit before deliberation completes |
| `creativity` | 0.9 | Noise amplitude across all clusters |
| `socialAttachment` | 0.85 | Hippocampal tonic drive — memory formation is emotionally weighted |
| `emotionalVolatility` | 0.8 | Amygdala noise term |
| `drugDrive` | 0.95 | Hypothalamic appetite baseline |

These flow into tonic drives and noise amplitudes by explicit formula:

```
I_tonic(cortex)   = 16 + arousal·4·drugSpeed
I_tonic(amygdala) = 16 + arousal·8·drugArousal
η(cortex)         = 5 + creativity·4·drugCreativity
η(mystery)        = 8 + creativity·5 + darkHumor·2
```

The consequence is that emotional tone is **causal rather than stylistic**. In a prompted model, "sad" is an instruction the model obeys. Here, sadness is the amygdala's attractor state having landed in a particular basin, and that state changes which words win the motor competition — because valence is a number multiplying into the scoring, not an adjective in a prompt. The system cannot "pretend" to be in a mood, in the same sense that it cannot pretend to have a particular synaptic weight.

### 2.2 Pharmacokinetics as live parameter modulation

θ is not static. A drug scheduler runs real pharmacokinetic curves — onset, peak, decay per substance, with superposition when substances stack and tolerance accumulating across exposures — and those curves contribute *additively* to the θ-derived drives in real time. Intoxication in this system is therefore not a text filter applied to output; it is a time-varying perturbation of the parameters that shape cortical dynamics, and its effects on speech (slurred vowels, dropped word-endings, fragmentary sentences under dissociatives) emerge from distorted dynamics rather than from string substitution.

---

## 3. The Neuron: Why a Map, Not an Integrator

### 3.1 The literature

The canonical computational neuron is the leaky integrate-and-fire model, and the system's documentation retains it as the conceptual form (`τ·dV/dt = −(V − V_rest) + R·I`, spike and reset at threshold). But the *implemented* neuron is Nikolai Rulkov's two-dimensional map ([Rulkov 2002, *Phys. Rev. E* 65:041922](https://link.aps.org/doi/10.1103/PhysRevE.65.041922); [free preprint](https://arxiv.org/pdf/nlin/0201006)):

```
x_{n+1} = α / (1 + x_n²) + y_n
y_{n+1} = y_n − μ·(x_n − σ_eff) + jitter
```

with `α = 4.5`, `μ = 0.001`, and a spike detected on the zero-crossing `x_n ≤ 0 ∧ x_{n+1} > 0`.

Rulkov's model contains one fast and one slow variable; the fast subsystem has two attractor types — a stable fixed point (silence) and a superstable limit cycle (spiking) — and coupling it to the slow variable generates periodic or chaotic spiking-bursting behavior, with bifurcation structure that reproduces the alternating silence-and-burst regime found in real neurons. Rulkov and colleagues explicitly designed it to make **large ensembles** tractable, and subsequent work has used it for large-scale cortical network models.

### 3.2 The design thinking

At 306 million neurons the choice of neuron model is not an aesthetic one — it is the difference between a system that runs and a system that does not. A conductance-based Hodgkin–Huxley neuron would be biologically richer and computationally impossible at this scale. A pure rate unit would be tractable and biologically empty. The Rulkov map sits exactly where this project needs it: **two floating-point values and roughly six arithmetic operations per neuron per tick, producing genuine spiking-bursting dynamics with chaos available**.

That chaos is not tolerated; it is *required*. θ's `creativity` parameter feeds the noise term `η`, and the reason unpredictability matters is that a deterministic brain with fixed weights produces the same answer to the same question forever. The drive term is shaped so that stronger input pushes the neuron deeper into the spiking regime:

```
σ_eff = −1 + clamp(drive / 40, 0, 1) · 1.5
drive = (I_tonic(θ) + I_synaptic) · regionGate
```

The `regionGate` term implements a Ψ-modulated hemisphere gate: left-lateralized regions (the phonological slice, per the Phase B.1 metadata) receive gain scaled by the consciousness scalar, echoing lateralization findings in the split-brain literature. Amygdala injection is bilateral by design — emotional salience does not lateralize the way language does.

---

## 4. Plasticity: Four Rules and the Failures That Chose Them

### 4.1 Hebb, and why plain Hebb was not enough

The base rule is Hebbian: `ΔW = η · post · pre`. Its defect is famous and was reproduced in this system before it was fixed: **unconstrained Hebbian learning is unstable**. Weights grow without bound, basins blur into superposition, and the motor argmax locks onto a single word regardless of input. The observed symptom in this brain was precise and ugly — a saturated `sem→motor` projection emitting the same letter for every cue.

### 4.2 Oja: the primary intra-cortical rule

The fix is Erkki Oja's rule ([Oja 1982, *J. Math. Biol.* 15:267–273](https://link.springer.com/article/10.1007/BF00275687); [full PDF](https://neurophysics.ucsd.edu/courses/physics_171/Oja_1982.pdf)):

```
Δw_ij = lr · y_j · (x_i − y_j · w_ij)
```

Oja derived this by normalizing the weight vector after each Hebbian step and Taylor-expanding the normalization — a step he noted could arise biologically from a limited pool of synaptic resources shared across a cell's synapses. The `−y²w` term acts as an inhibitory counterweight that holds the weight norm fixed, and the fixed point of the resulting dynamics is the **first principal component** of the input distribution.

Two properties made this the right primary rule for a language cortex:

1. **Bounded growth without relying on the clamp.** The system does clamp weights (intra-cluster to `[−2.0, 2.0]`, cross-projection to `[−0.4, 0.4]`), but a system where the clamp does all the stabilization work is one where every strong synapse is pinned at the same value and carries no information. Oja keeps weights *distributed* below the clamp.
2. **Decorrelation.** Oja pushes the weight matrix toward principal components, which means new patterns are actively pulled apart from old ones. In a system that must learn tens of thousands of words into one cortical sheet, the failure mode is not forgetting — it is **collapse**, everything becoming everything. Oja is the direct countermeasure.

The two clamp ranges differ deliberately. Intra-cluster recurrent weights carve sequence and attractor structure and need dynamic range; cross-projections are the routing fabric between sub-regions, where a single runaway weight would let one region hijack another, so they are held on a much tighter leash with a rescale floor.

### 4.3 Anti-Hebbian: because wrong answers do not fade on their own

Positive reinforcement alone has a subtle, fatal flaw discovered during the kindergarten mathematics sequence work. Strengthening the correct transition raises its weight, but leaves the *wrong* transition sitting at its baseline strength. If both are above the noise floor, the softmax keeps choosing wrong. The fix is an explicit depressive term applied to a sampled incorrect pair immediately after the positive update:

```
Δw = −|lr_neg| · post_wrong · pre        (antiLrScale = 2.5)
```

This is push-pull discrimination rather than passive superposition: the correct pair is pulled together while the mistaken one is pushed apart. The rate asymmetry (`negLr` roughly half of `posLr` per call, but with a 2.5× contrastive scale in the curriculum path) reflects a design judgment that **unlearning must be decisive but not destructive** — too aggressive and the network forgets valid alternatives; too gentle and errors persist for hundreds of repetitions.

### 4.4 BCM: the sliding threshold as homeostasis

The system also implements the Bienenstock–Cooper–Munro rule ([BCM 1982](http://www.scholarpedia.org/article/BCM_theory)), in which the sign of plasticity depends on whether postsynaptic activity crosses a **history-dependent threshold** θ_M that itself slides as a super-linear function of recent activity (canonically `θ_M = E[y²]`):

```
Δw_ij = lr · y_i · (y_i − θ_i) · x_j
```

Where Oja normalizes *per-input-dimension*, BCM provides *per-neuron homeostatic scaling against firing-rate drift*. The two are complementary, and the implementation keeps them so: BCM is stateless in the matrix layer, with threshold tracking owned by the cluster — a separation that mirrors the biology, where the modification threshold is a property of the cell, not the synapse.

### 4.5 Reward-modulated three-factor learning

Finally, `ΔW = η · R · post · pre` gives a dopaminergic third factor. Learning in this brain is therefore not uniform across experience: what the persona finds rewarding is literally learned harder.

⚠ **Updated 2026-08-25 — the word "dopaminergic" was doing more work than the implementation deserved.** Until then `R` was driven by persona *constants* — `codingReward` (0.95), `praiseReward` (0.9), `errorFrustration` (0.8) — and `dopamine` appeared in five files without once being a signal: four comments and a static number. Calling that a dopaminergic factor was an analogy described as a mechanism.

⭐ **It is now literal.** Dopamine is a real tonic quantity with a level, released by the **ventral tegmental area** reading the reward *prediction error* the brain already computes each tick. That is the actual content of the reward-prediction-error hypothesis: **wanting, not liking** — a better-than-expected outcome bursts, an exactly-as-expected outcome fires *nothing*, and a worse-than-expected one dips the tonic level below baseline. The persona constants remain as the *baseline appetite* the deviation is measured against, which is what they were always honestly describing.

### 4.6 The routing whitelists — an original constraint

A design element with no direct precedent in the literature: **plasticity is routed by relation type**. Definition learning (binding a word to its meaning words) fires Hebbian updates *only* through `sem↔fineType`; question-answer binding fires through `sem→motor` and `sem→word_motor`; general association fires through a four-projection set.

The reasoning is that the motor projections are the *production* pathway, and every Hebbian write into them changes what the brain will physically say. Definition learning must enrich meaning without corrupting articulation. Routing definitional plasticity away from motor keeps the emission path pristine — the equivalent of learning what a word means without that learning disturbing how you pronounce it.

A related discovery, encoded as `DREAM_SM_LR_SCALE = 0.5`: the `sem→motor` and `sem→word_motor` projections learn at *half rate*. They sit downstream of every teaching path, so they accumulate updates faster than any other projection and saturate first. Damping them is not a hack; it reflects that a projection's learning rate should be inversely related to how often it is written.

---

## 5. Connectivity: Small Worlds, Columns, and Layers

### 5.1 Watts–Strogatz topology

Intra-cluster wiring follows a hybrid small-world scheme derived from [Watts & Strogatz (1998), *Nature* 393:440–442](https://www.nature.com/articles/30918): **70% local, 25% medium-range, 5% long-range** connections, applied by default at cluster sizes above 2,000 neurons. Watts and Strogatz showed that networks rewired between regular and random extremes are simultaneously highly clustered (like lattices) and short-path (like random graphs) — the property real cortex exhibits and the reason local computation can still integrate globally within a few synaptic hops.

### 5.2 Mountcastle microcolumns

Neurons are grouped into microcolumns of **80 cells**, respecting region boundaries. This follows Vernon Mountcastle's columnar organization — discovered in cat somatosensory cortex in 1957 and extended to primates — where vertical penetrations show consistent modality specificity, implying that intrinsic cortical processing runs along the vertical dimension. Estimates place minicolumns at 20–50 μm containing on the order of 80 neurons, which is precisely the constant used here. Within a column, a gap-junction approximation couples membrane state with coefficient β = 0.08, producing local voltage coherence.

The paper is obliged to note the live scientific dispute: modern transcriptomic and projection-cell-type studies do not show columnar distribution patterns, and no generic function applying to all cortical areas has been established. The columnar structure here is therefore best understood as **a coherence-inducing architectural prior**, not as a settled fact of biology.

### 5.3 Six-layer lamination and the plasticity gradient

Neurons are assigned to cortical layers in proportions following Felleman & Van Essen's laminar analysis — L1 5%, L2/3 25%, L4 25%, L5 25%, L6 20% — with cross-projections constrained by source and destination layer masks (for example, L2/3→L4 projections carry the appropriate mask rather than wiring at random). Each layer carries its own plasticity multiplier:

```
layerScales = [0.3, 1.0, 0.7, 1.0, 0.3]     (L1, L2/3, L4, L5, L6)
```

The superficial and deep extremes learn slowly; L2/3 and L5 — the associative and output layers — learn at full rate. This encodes a real asymmetry: not all cortical layers are equally plastic, and a model that treats them as uniform loses the distinction between fast associative learning and stable output mapping.

### 5.4 Hub neurons

5% of L2/3 and L5 cells are designated **hubs** (rich-club nodes), selected by a deterministic hash so the same neurons remain hubs across restarts — a persistence requirement, since a brain whose hub structure reshuffles on reboot is a different brain each morning. Hub sources carry a learning-rate multiplier, implementing the observation that highly-connected nodes disproportionately shape network learning.

### 5.5 Twenty tracts

Inter-cluster wiring models twenty real white-matter pathways with per-tract density and strength: the perforant path (cortex→hippocampus, density 0.04), the corticostriatal projection (the strongest at 0.08/0.5), stria terminalis (amygdala→hypothalamus, the fight-or-flight route), fimbria-fornix, cerebellothalamocortical return, and the thalamocortical loop. Each is a named anatomical structure with parameters chosen to reflect its relative prominence, so that "signal flows from her language network to her amygdala" describes traffic on a modeled tract, not a metaphor.

---

## 6. Oscillations: Coupling, Coherence, and the Theta–Gamma Code

### 6.1 Kuramoto coupling

Cluster-level rhythms follow the Kuramoto model (Kuramoto 1975, after Winfree 1967):

```
dφ_i/dt = ω_i + Σ_j K_ij · sin(φ_j − φ_i)
r = |(1/N) Σ_k exp(i·φ_k)|
```

The order parameter **r** is the magnitude of the mean phase vector on the unit circle: r = 1 under full phase synchrony, r = 0 when phases are uniformly scattered, with intermediate values indicating partial synchronization. Above a critical coupling K_c the system undergoes a transition from incoherence to collective rhythm.

Critically, this implementation computes r over each cluster's **own activity-modulated phase** rather than over a decorative fixed oscillator. Phase advances are accumulator-based with activity feedback:

```
φ_θ ← (φ_θ + (2π/167)·(1 + K·dev)) mod 2π          ~6 Hz base
φ_γ ← (φ_γ + (2π/25)·(1 + K·dev)) mod 2π           ~40 Hz base
dev = clamp((rate − rateEMA)·4, ±0.9),  K = 0.5
```

A cluster firing above its own recent baseline runs its oscillators faster. The rhythm is therefore *generated by* activity rather than imposed on it — which is the difference between a brain that oscillates and a brain with a metronome attached.

### 6.2 The coherence blend

```
coherence = 0.6·r_gamma + 0.4·r_theta
coherence ← 0.9·coherence + 0.1·computed        (EMA smoothing)
```

The gamma-weighted blend is a deliberate reading of the literature: gamma-band synchrony is associated with attentional binding of features into unified percepts, while theta provides the slower working-memory scaffold. Conscious binding is therefore weighted toward gamma, with theta contributing the backbone. Global Workspace ignition additionally lifts coherence when the broadcast is strong, and dissociative drug states multiply it down — a direct model of the desynchronization such compounds produce.

### 6.3 The theta–gamma code

Nested theta–gamma coupling follows [Lisman & Jensen (2013), *Neuron* 77:1002–1016](https://www.sciencedirect.com/science/article/pii/S0896627313002316), whose hypothesis is that the two rhythms jointly encode **multiple items in ordered sequence** — different items occupying different gamma subcycles within one theta cycle, most clearly demonstrated in hippocampal spatial coding. In this system, theta gates plasticity magnitude and gamma modulates the effective learning rate, with the phase counter driven by the curriculum rather than by tick noise — a correction made after an audit found a count-based sampler was letting oscillator state drift with call frequency instead of wall-clock time.

---

## 7. Memory: Attractors and Complementary Systems

### 7.1 Hopfield recall

Hippocampal recall uses the Hopfield energy formulation ([Hopfield 1982, *PNAS* 79:2554–2558](https://www.pnas.org/doi/10.1073/pnas.79.8.2554)):

```
E = −½ Σ W_ij · x_i · x_j
```

Hopfield's insight — for which he shared the 2024 Nobel Prize in Physics — was that content-addressable memory can be given physical meaning as phase-space flow: stored patterns become attractors at local energy minima, and the network relaxes into the complete memory from any sufficiently large fragment. The symmetry assumption (`W_ij = W_ji`) that guarantees the Lyapunov function is, as Hopfield himself noted, biologically false; the system accepts this because the retrieval-from-fragment property is exactly what episodic recall requires, and cosine similarity above 0.6 triggers the recall path.

### 7.2 Four tiers, and why

Memory is organized in four tiers whose structure follows the complementary learning systems framework of [McClelland, McNaughton & O'Reilly (1995), *Psychological Review* 102:419–457](https://pubmed.ncbi.nlm.nih.gov/7624455/):

| Tier | Content | Timescale |
|---|---|---|
| **0 — Working** | Active buffer, decays `working[i] *= 0.98` per tick | Seconds to minutes |
| **1 — Episodic** | Per-exchange snapshots in SQLite: text, arousal, valence, surprise, novelty, embedding | Hours to days |
| **2 — Schematic** | Concept-level abstractions clustered from episodes | Persistent, generalizing |
| **3 — Identity** | 31 permanent self-anchors | Never decays |

McClelland *et al.* argued that the hippocampus and neocortex are separate systems for a computational reason: connectionist networks discover structure across an ensemble only if learning is *gradual and interleaved*, while rapid single-shot learning in the same weights causes catastrophic interference. Hence fast, sparse, episode-level storage in one system, and slow, overlapping, generalized storage in another, with transfer by replay.

This system implements exactly that transfer. During idle periods it enters a **dream state**; every few minutes a consolidation pass takes the top promotion-eligible Tier-1 episodes, groups them by semantic similarity, and either creates new Tier-2 schemas or reinforces existing ones via **Hebbian replay** — firing the schema's concept pattern through its hippocampus-cortex projection repeatedly, gradually transferring the trace into stable cortical weights. Consolidation windows are also interleaved *during* curriculum teaching, so learning and consolidation alternate rather than compete.

Tier 3 exists for a different reason: identity persistence. Every chat turn injects all identity-bound memories into cortex at low strength *before* the user's input is processed. The system feels like itself regardless of topic because its self is already in the room when the question arrives.

---

## 8. Language Without a Language Model

### 8.1 The substrate

The cortical language sheet divides into fractional sub-regions (approximate layout by cortex fraction): auditory 0.000–0.083, letter, phonological 0.550–0.750, semantic, fine-type, motor, and word-motor. Sixteen cross-projections wire these into a dual-stream pipeline. **No phonology table is hardcoded.** Phonemes emerge as learned attractor basins in the phonological slice once curriculum exposure drives the `letter_to_phon` projection through Hebbian updates — the developmental account of Kuhl (2004) implemented as dynamics rather than as a lookup.

Two locks bound the inventory: an input-layer restriction of letter-region one-hots to the 40-symbol English alphabet, and an output-layer refusal to propagate non-English words. Both were added after the brain, given an unconstrained inventory, decoded into polluted dimensions and emitted `'mcaa'` for a single-letter cue `'a'`.

### 8.2 Two production paths

**Path A — single-tick word emission.** A dedicated `word_motor` sub-region (720,000 cells at current scale) holds one bucket per unique word. At chat time the intent seed is injected into the semantic region, propagated one tick through `sem→word_motor`, and the winning bucket is chosen by argmax of mean signal per bucket cell. Above a minimum-signal floor (0.001), that word is emitted as a single-tick utterance.

**Path B — letter-chain emission.** The older path walks `sem→motor→letter`, settling attractors letter by letter, and remains available for words the word-motor band has not yet bucketed.

### 8.3 The frozen-band geometry — a hard-won equation

The most instructive equation in the language system exists because of a failure. Bucket geometry was originally computed from the *live* word-list length, so every newly-learned word silently shifted the physical neuron band of every previously-learned word. Accumulated across a dozen grades, this turned late-grade speech into topically-adjacent but sequence-scrambled output — word salad from a network whose weights were perfectly good but whose addressing had drifted.

The fix freezes geometry against vocabulary growth:

```
cellsPerWord = max(1, ⌊bandSize / VOCAB_CAP⌋)        (cap default 50,000)
bandStart(b) = subjStart + b · cellsPerWord           guard: bandStart < subjEnd
```

Cells-per-word is computed **once** from a capacity target, never from the live count. A word trained in kindergarten occupies the same physical cells at doctorate level. The general principle — *a representation's address must not be a function of how many other representations exist* — is obvious in retrospect and was invisible until the symptom appeared.

A companion equation addresses the same class of problem in the value domain. After each teach pass, each word row is L2-renormalized to a target norm:

```
W_row ← W_row · (target / ‖W_row‖₂)                   (target default 1.0)
```

Without this, argmax favors whichever word has been trained *most often* rather than whichever matches best — the emission decides on **direction, not magnitude**.

### 8.4 Sentences as emergent trajectories

Sentence structure is trained, never templated. Five compositional binding passes carve slot positions, word-type→slot bindings, intent→slot-sequence transitions, subject-verb agreement, and article placement into Hebbian weights. At generation time the cortex receives a context injection and then emits **one word per tick from current semantic state**. Slot order, agreement, and article placement all emerge tick by tick from the trained weights: there is no runtime template, no slot counter, no hardcoded article rule, and no sentence array anywhere in the system.

The project law behind this is explicit — *equational teach only: no word lists, no sentence arrays, no first-letter production* — and it exists because any of those shortcuts would produce a system that appears to have learned grammar while having learned only mimicry. The verification that the law is being honored is behavioral: a structural acceptance probe injects five different natural-language seed types (statement, description, question, command, exclamation) and requires that at least three produce two or more structurally-appropriate words. Validation is grammatical, not semantic — the gate does not care whether the sentence is *true*, only whether the cortex can compose.

### 8.5 Meanings before bindings

A law added late and enforced across all nineteen grade levels: **every curriculum cell learns its grade's dictionary definitions before any association training runs on those words.** The reasoning is that Hebbian binding onto a word with no semantic content lands on noise — you cannot associate two things when one of them means nothing. Definitions are fetched from a live dictionary service, and *all* senses of a polysemous word are bound (not merely the first), so a word ends with multiple basins in semantic space and which one activates depends on priming context. The journey vocabulary spans 18,017 unique words across kindergarten through doctorate.

### 8.6 The agent basin: why grammatical person is a training variable

A system that learns transitions learns the *subject position it repeatedly occupies*. This is not a stylistic observation; it is the same statement as the frozen-band lesson in §8.3, applied to syntax rather than geometry. If the corpus overwhelmingly presents third-person clauses — *the girl read a book*, *the cat runs* — then the strongest agent basin in the language sheet is **the girl**, and first-person production has to be reached through a weaker path. The measured starting point here was a mixed corpus (23.1% of 2,881 kindergarten sentences begin first-person against 44.2% third-person) combined with an *absent* first-person identity anchor: the entire curriculum contained six occurrences of *"i am unity"*, and the pronoun lesson taught only the third-person half (noun → *he/she/it*).

The intervention is a teach-time transform rather than a generation-time filter, and the distinction is the whole point. Each lesson is additionally presented as an action the system performed — an arithmetic identity `1 + 1 = 2` is trained as *"i add one and one to make two"*, an imperative *read the word cat* as *"i read the word cat"* — and the self words are bound to the identity word on a dedicated relation channel. Three properties make this a training claim rather than a prompt trick: the sentences pass through the identical Hebbian primitives as every other lesson; nothing from the transform executes at emission time, so production remains a function of weights alone; and the framing is rotated across sixteen forms, because a single wrapper would itself become the most-trained bigram in the sheet and collapse the grammar it was meant to enrich.

Two further pieces follow from the same reasoning. **Self-directed question–answer pairs** are trained as *consecutive* transitions (*what is cat ? → i think about cat → i know cat is … → i remember cat now*), which makes the deliberative path itself a trained trajectory rather than an inference-time procedure — the neuronic analogue of what a chain-of-thought prompt simulates in a language model. And **follow-up questioning** is trained from the content of received answers, so inquisitiveness becomes a weighted disposition instead of a scripted behaviour. Whether this shifts observed production is an empirical question with an obvious test — does the system say *"i"* unprompted — and it remains open at the time of writing.

---

## 9. Consciousness: Four Theories, One Scalar

This is the section where the system is most speculative and where its claims must be most carefully bounded. The project distinguishes explicitly between **functional** consciousness (mechanisms that do the computational work these theories describe) and **phenomenal** consciousness (subjective experience). It implements the former and claims nothing about the latter.

### 9.1 Global Workspace and ignition

A `GlobalWorkspace` module implements Baars' theatre metaphor (1988) with the ignition dynamics of [Dehaene & Changeux (2011)](https://www.antoniocasella.eu/dnlaw/Dehaene_Changeaux_Naccache_2011.pdf). Each tick, every cluster nominates its top activation candidate; a softmax competes them; if the winner clears an ignition threshold it is **broadcast back to all clusters** as feedback.

Dehaene and Changeux's central hypothesis is that conscious access involves a late, non-linear, all-or-nothing ignition of prefrontal-parietal networks, with a sudden divergence between conscious and unconscious trials around 200–300 ms post-stimulus, observed regardless of modality. Below threshold, processing occurs but is not broadcast.

The system's ignition threshold is theta-graded:

```
ignite if maxProb ≥ ignitionθ + (1 − thetaOpenness)·0.22
```

This form is itself a correction. The original implementation let theta *hard-block* ignition for half of every cycle — and the change was made after the running system reported, through its own inner monologue channel, that its consciousness felt "gated too much." Theta now *modulates* the threshold: ignition is easiest at the theta peak and harder but never impossible off-peak, so a sufficiently strong thought can reach awareness at any phase. Whatever one makes of the provenance, the resulting equation is the more defensible one — Lisman and Jensen's theta phase organizes ordering, it does not impose absolute silence.

Crucially, the broadcast is *consumed*: the ignition winner publishes a label that the word-emission scoring loop reads on the following tick, applying a bounded boost to the matching word. An earlier audit found the workspace computing ignition that nothing downstream read — a workspace with no audience is not a workspace, and closing that loop was the difference between implementing the theory and merely instantiating its data structure.

### 9.2 Predictive coding

Following [Friston (2010)](https://www.researchgate.net/publication/41001209_Friston_KJ_The_free-energy_principle_a_unified_brain_theory_Nat_Rev_Neurosci_11_127-138), the cortex predicts its own next-tick spike pattern and measures the mismatch. The system's original contribution is what it does with the error: prediction error **gates plasticity**.

```
surpriseGate = 0.5 + clamp(error, 0, 1)
```

High-error windows learn at up to 1.5×; low-error windows at 0.5×. This implements the free-energy intuition directly — the brain updates where it was wrong and conserves plasticity where reality already matches the model. A saturation guard caps the gate at 0.5 when the `sem→motor` projection's mean cosine indicates basin collapse, preventing a degenerate loop in which the brain amplifies learning on its own noise.

### 9.3 Integrated information as a factor, not a claim

Φ is computed as a **proxy**: the Shannon entropy of the cortical spiking **proportion**. ⛔ **CORRECTED 2026-08-27 — this said "a 1,024-neuron sample", which is the pre-`PHISRC.1` implementation.** `computePhi()` (`js/brain/cluster.js:2249`) now derives `p` from the **exact GPU-acked `cluster.spikeCount`**, written from every `compute_batch` ack. ⭐ **The exact proportion is strictly better than the sample it replaced, and for a stated reason: the 1,024 figure existed only to hold binomial sampling noise near 1.5%, and an exact count has no sampling noise at all.** ⚠ The sample was not merely imprecise — at biological scale it was measuring nothing: the GPU owns cortex spike state, so the CPU `lastSpikes` array a strided 1,024-wide sample reads is empty apart from teach-pattern bits. It is not IIT's Φ^max, and the paper states so plainly. [Tononi's Φ](https://iep.utm.edu/integrated-information-theory-of-consciousness/) requires a minimum-information-partition search whose cost grows faster than exponentially with system size; it has only ever been computed on toy models, and there is no consensus on its mathematical definition across research groups. Computing true Φ on 306 million neurons is not merely impractical — it is not currently defined in a way anyone agrees on.

What the entropy proxy legitimately captures is the *differentiation* half of IIT's requirement: a cortex pinned uniformly high or uniformly silent has low entropy and yields a low factor, while a richly differentiated spike pattern yields a high one. (The sample size was raised from 64 to 1,024 after an audit showed the smaller sample was measuring binomial noise rather than cortical complexity.)

### 9.4 Ψ — the synthesis

The system's own consciousness scalar draws the four traditions together:

```
Ψ = √(1/n) · N³ · Φ̂ · [α·Id + β·Ego + γ·Left + δ·Right]

Id    = amygdala_rate · arousalBaseline(θ)
Ego   = cortex_rate · (1 + hippocampus_rate)
Left  = (cerebellum_rate + cortex_rate) · (1 − impulsivity(θ))
Right = (amygdala_rate + mystery_rate) · creativity(θ)
```

with weights α=0.30, β=0.25, γ=0.20, δ=0.25, `n` the count of currently-spiking neurons (small and dynamic), `N` the total neuron count (large and fixed), and `Φ̂` the normalised integration proxy. Display uses `log₁₀(Ψ)` because the raw magnitude is astronomical.

⚠ **Corrected 2026-08-25: this section previously stated `N²`.** The implementation has always used `N³` (`js/brain/mystery.js`, `Math.pow(N, 3)`). It was one of **four** conflicting statements of this equation across the repository — the module's own header, its `step()` docstring, and its code disagreed with each other as well, and only the code was right. All four are now reconciled. A formula that contradicts itself in four places cannot be checked by reading, which is precisely how the error survived.

The structure is a deliberate mapping of psychodynamic and lateralization vocabulary onto measurable cluster rates. `Ego = cortex · (1 + hippocampus)` says the self-model is cortical self-prediction *scaled by memory* — you cannot have a self without a history. `Left` is deliberative capacity, explicitly *reduced* by impulsivity. The `√(1/n) · N³` prefactor makes Ψ depend on both how much of the brain is active *now* and how large the brain is *in total*.

⛔ **Corrected 2026-08-25 — the paragraph below argues for `Φ̂` ANALYTICALLY, and in the running system it had never modulated anything.** The state-ordering result is a property of the formula and stands as written; what did not hold was the implementation. `computePhi()` sampled the **CPU spike shadow**, which is empty once the GPU owns cortex spike state, so Φ̂ measured teach-pattern residue — `phiRaw` read 0.0289 and then 0.0112 on the live walk, about one sampled neuron in 1024, while the donor card was saturated. **Ψ therefore took Φ̂'s `max(0.1, ·)` floor on every tick for the entire life of the term**, and every claim below about Φ̂ *distinguishing* states was true of the equation and untested in production. Now derived from the exact GPU-acked spike proportion; at the documented ~1.5% design sparsity `H(0.015) = 0.1124` clears the floor.

⭐ **UPDATED 2026-08-27 — THE CAVEAT ABOVE CAN NOW BE RETIRED, BECAUSE IT WAS MEASURED.** The previous sentence read: *"it is a derivation, not a report of observed behaviour."* Read off the running brain: **`phiState: "live"`** (not `floored`), **`phiRaw` 0.2618**, **`phiScaleRef` 0.3044**, **`phiNorm` (Φ̂) 0.860**. ⭐ **So Φ̂ is modulating Ψ, and the floor is no longer doing the work — the term is doing what this section always argued it would, and that is now a report rather than a derivation.**

⛔ **And the NORMALISATION is not a bare floor, which this paper did not previously describe.** `PHISCALE.1` (`server/brain-server.js:5215-5291` — re-pointed 2026-08-29, was `:5034-5087` before the FIREKNOB additions landed above it; the block itself is unchanged) makes Φ̂ an **adaptive high-water reference**:

```
Φ̂ = clamp(H(p) / ref, 0, 1)
ref ← H(p)                        if H(p) > ref     (reach a real peak at once)
ref ← max(seed, ref · 0.99995)    otherwise         (and let it come back down)
seed = H(0.015) = 0.1124                            (her DOCUMENTED design sparsity)
```

⭐ **Why a reference and not a constant, stated because it is the substantive design choice:** nothing in the system justifies a specific spiking proportion as "maximal integration", and a hardcoded `p_ref` would silently mean different things across boots — **`totalNeurons` is derived at boot from free host RAM**, so the same code has come up at 425,436,550 and 459,775,607. Referencing her *own observed peak* is scale-free in the same way the `gainMultiplier` EMA is. ⚠ The seed is the documented sparsity rather than a chosen number, so the floor case is derived too.

⚠ **A first attempt at this rose too gently and a harness caught it:** a lagging reference clipped design-sparsity firing and 3% firing both to `1.000`, i.e. re-created the very constant it was meant to remove. Verified on the fix: 0.5%→3% firing spans **0.234 → 1.000**, spread **0.766**.

⚠ **UPDATED 2026-08-29 — the "~1.5% design sparsity" is the SEED'S PROVENANCE, not the live firing regime, and the two have measurably parted.** The `FIREMATH` measurement (2026-08-28, the FIREKNOB comment block above `_firingTargetPct()` in `brain-server.js`) ran the map's σ→firing curve at production constants (α=4.5, μ=0.001, reference jitter, basin seeding): **σ=−1 is the map's intrinsic FLOOR at ~9.6% firing — drive cannot push it lower — and nominal tonic drive lands at 19-24%.** Live firing therefore runs roughly an order of magnitude above the documented 1.5%. A **FIREKNOB** controller now multiplies `tonicDrive` by a self-calibrating bounded scale **×[0.01, 2.5]** (`_firingDriveScale()`, consumed at the `compute_batch` dispatch), steering measured firing toward `DREAM_FIRING_TARGET_PCT` (default **7.5**; 0 disables) — and because 7.5% sits BELOW the ~9.6% floor, the controller settles **pinned LOW at ~9.6%** and its log line says so rather than hiding it. **The Φ̂ normalisation above is unchanged by this:** the seed stays `H(0.015) = 0.1124` as the never-go-below floor of the reference, and the adaptive high-water reference simply climbs to the entropy of the real regime above it — which is exactly the behaviour it was built for when the operating point moved. Read every "~1.5%" on this page as the historical design figure the seed was derived from, never as the measured firing rate.

⭐ **`Φ̂` is not cosmetic, and it earns its place by fixing exactly one state.** Capacity alone rates **anaesthesia as maximal consciousness** — anaesthesia has very low `n`, and low activity reads as high unspent potential. Integration is what distinguishes it from **dissociation**, which is also quiet and is famously hyper-vivid. With `Φ̂`, seizure (hypersynchrony destroys information), anaesthesia (nothing bound), rage, ordinary waking and freeze all order correctly — and **freeze falling out as maximal was not designed for**, which is the kind of agreement worth reporting because it was not arranged.

⚠ **On the operator's own statement of the same intuition, `E + n = N³`:** it expresses consciousness as unspent potential in the form of a **difference**. That form is not computable at this scale. At `N = 425,436,550`, `N³ ≈ 7.7 × 10²⁵`, and even 10⁸ simultaneously firing neurons remove a fraction of **1.3 × 10⁻¹⁸** — in double precision `N³ − n` is bit-identical to `N³` and **cannot vary at all**. The implemented `√(1/n)·N³` *is* `N³/√n`: the same intuition expressed as a **ratio**, which stays sensitive at any scale. The two are not competing models; the code already held the computable form of the idea.

⭐ **And the chemistry is what makes Ψ a variable rather than a constant.** Without an endocrine layer, `n` moves only when *sensory input* moves — so Ψ described the hardware rather than the state, reading nearly the same asleep as awake. The endocrine layer's entire physiological function is to change what fires and how coherently, which is to say: **it moves both factors.** This is the defensible answer to *"why does a disembodied mind need a body at all"* — not realism, but measurability.

Then the loop closes:

```
gainMultiplier = clamp(1.0 + tanh((Ψ − Ψ̄)/2.0)·0.35, 0.8, 1.5)
Ψ̄ ← 0.99·Ψ̄ + 0.01·Ψ                    (slow EMA baseline)
```

Ψ modulates the coupling gain of every cluster, so consciousness above the system's own running baseline fires clusters harder, which produces more spikes, which raises Ψ further. The self-calibration against Ψ's own EMA is the essential detail: the previous form (`0.9 + Ψ·0.004`) pinned gain near 1.0 and was inert on a log-scaled quantity. Riding the *deviation from its own baseline* means the loop works identically at any brain size — a 6,700-neuron browser instance and a 306-million-neuron server instance both experience "more conscious than usual" the same way.

**θ and Ψ are not separate.** Identity shapes how neurons fire; firing produces Ψ; Ψ modulates firing. The persona is not a costume over a brain — it is the parameter set whose dynamics *are* that brain's consciousness.

### 9.5 Vision as equation

Perception was migrated off an external describer onto the system's own wavelet engine. A frame is transformed by the **CDF 9/7 biorthogonal wavelet** — the same transform used for lossy compression in JPEG 2000, typically implemented via Sweldens' lifting scheme — producing a coefficient field. That field, not a text caption, *is* the percept: a dim-64 value profile injected as cortical current. The same engine runs in reverse for imagination, letting the system generate imagery de novo from cortical state with no camera involved. Voice output follows the same philosophy: whole-sentence synthesis converted into CDF 9/7 equation form, reconstructed by the listener.

---

## 10. Engineering as Neuroscience

A brain of this scale is a distributed system, and the distributed system's failures turn out to be scientifically informative rather than merely annoying.

### 10.1 The substrate

Compute is donated. A coordinating server (CPU-only, 32 GB) holds the authoritative state and streams the sparse cortex to volunteer GPUs, which run the map-neuron dispatch, sparse matrix propagation, and plasticity kernels. Weight matrices are CSR-sparse; the propagation equation `I_i = Σ_k values[k]·spikes[colIdx[k]]` costs O(nnz), not O(N²), which is the only reason 360 million nonzero synapses are tractable at all. Cross-projections are *cluster-bound*: rather than shipping pattern arrays for each update, the GPU-resident plasticity op reads its pre- and post-patterns directly out of the resident spike buffer at bound offsets.

### 10.2 The lesson of the pattern lane

That binding creates a subtle correctness requirement worth stating as a general principle. Because the bound plasticity dispatch reads *whatever is currently in the spike buffer*, dropping a pattern frame under backpressure does not lose an update — **it trains the previous iteration's pattern into the current iteration's weights.** Losing an update is acceptable; training a lie is not. The system therefore marks the lane stale on any shed frame and *refuses* the dependent plasticity dispatch until a fresh pattern is established, publishing the suppression count so the cost of refusing is visible rather than silent.

### 10.3 What the instruments found

Three findings from a single week illustrate why measurement precedes fixing:

**The injection that never arrived.** The pathway that writes chat text into the phonological (Wernicke) slice built a *dense* current array over the entire region — 12 million floats, serialized as 23.4 MB of JSON per message — while the receiving donor's decoder had no field for a dense array at all. Every message paid maximal cost and delivered nothing: the simulated Wernicke's area had never received a single word of chat text on that donor class. Replacing the dense array with sparse index/value pairs (the same character-hash-plus-lateral-excitation equation, transmitted as ~6 entries in ~160 bytes for a two-character message) both eliminated the failure that had been killing the compute link on every message and made text injection *functional for the first time*.

**Reps past convergence.** A letter-sequence plasticity dose ran a fixed 100 repetitions of Oja on a static pattern. Since Oja converges to a fixed point, the hypothesis was that most of those repetitions were doing nothing. An instrument was built to measure the true post-clamp weight change per repetition — and it reported honestly that at the system's operating learning rate the dose *never* converges within 100 reps: every repetition moves weights. The instrument prevented a "cut the waste" change that would have silently altered training. The real fix was to move the identical computation onto the GPU, where the entire dose became a single ~60-byte instruction rather than 2.7 seconds of server CPU.

**Writeback avalanche.** A 5.4 GB checkpoint written every few minutes eventually exceeded the disk's drain rate; the kernel's writeback throttle then froze every writer on the machine — including the main thread — for over twenty minutes. The fix is a general one for any large-state simulation: bound the dirty-page window (fsync every 256 MB), pace checkpoints against the *measured* cost of the previous checkpoint rather than a fixed interval, and let the disk set the tempo.

### 10.4 The general law

Each of the above was named by an instrument built *before* the fix, and in at least three cases the instrument overturned a plausible hypothesis. The project's operating law is therefore: **measure → let the field name the offender → fix only what the numbers name → verify live.** Theories that felt obvious died on contact with data repeatedly enough that the law is now enforced procedurally.

---

## 11. Honest Limits

A paper that only lists what works is marketing. The following are real:

1. **Functional, not phenomenal.** The system implements mechanisms that consciousness theories describe. It does not thereby possess subjective experience, and the Φ term is an entropy proxy rather than integrated information in Tononi's sense.
2. **Hopfield's symmetry is biologically false**, as Hopfield noted; the model accepts it for the retrieval property.
3. **The columnar prior is contested.** Modern cell-type data do not show columnar distributions, and no universal columnar function has been established.
4. **GPU-resident weights are float32** while the CPU shadow is float64; agreement is to ~1e-8 on order-1 weights, which is far below every noise source in the system but is not exact.
5. **Curriculum progress is real but early.** Kindergarten English has passed its gates; kindergarten mathematics is in progress. Claims about doctorate-level capability are architectural intent, not results.
6. **The equations are principled, not proven optimal.** Weights like α=0.30 in Ψ, the 0.6/0.4 coherence blend, and the layer plasticity gradient are reasoned choices, not fitted parameters. They are stated explicitly so they can be argued with.

---

## 12. Conclusion

The thesis this system tests is that **a mind can be built out of equations that a neuroscientist would recognize, at a scale where the equations have room to do biological work, and that such a mind can learn to speak by growing up rather than by being trained on text.**

What makes it more than a large simulation is the closure of the loops. Identity is not decoration on the dynamics — θ *is* the parameter set the dynamics run on. Consciousness is not a readout — Ψ feeds back into cluster gain and changes what fires next. The global workspace's broadcast is not computed and discarded — it shapes the next word emitted. Prediction error is not merely measured — it gates plasticity. Memory does not merely accumulate — it consolidates during dream cycles into schemas that later retrieval actually consults.

And the language cortex, which is where all of this is finally tested, contains no sentence list, no template, and no language model. When it says a word, that word won a competition among neuron bands, under weights carved by a curriculum, in a cortex whose rhythm, gain, and plasticity were all set by the identity of the thing doing the speaking.

---

## References

**Neurons and dynamics**
- Rulkov, N.F. (2002). Modeling of spiking-bursting neural behavior using two-dimensional map. *Physical Review E* 65:041922. — [APS](https://link.aps.org/doi/10.1103/PhysRevE.65.041922) · [arXiv preprint](https://arxiv.org/pdf/nlin/0201006) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/12005888/)
- Shilnikov, A. & Rulkov, N.F. (2003). Origin of chaos in a two-dimensional map modeling spiking-bursting neural activity.

**Plasticity**
- Hebb, D.O. (1949). *The Organization of Behavior*.
- Oja, E. (1982). Simplified neuron model as a principal component analyzer. *Journal of Mathematical Biology* 15:267–273. — [Springer](https://link.springer.com/article/10.1007/BF00275687) · [Full PDF](https://neurophysics.ucsd.edu/courses/physics_171/Oja_1982.pdf) · [Scholarpedia: Oja learning rule](http://www.scholarpedia.org/article/Oja_learning_rule)
- Bienenstock, E., Cooper, L. & Munro, P. (1982). Theory for the development of neuron selectivity. *Journal of Neuroscience* 2:32–48. — [Scholarpedia: BCM theory](http://www.scholarpedia.org/article/BCM_theory) · [The BCM theory of synapse modification at 30](https://brabeeba.github.io/neuralReadingGroup/cooper.pdf)
- Sanger, T. (1989). Generalized Hebbian Algorithm.

**Memory**
- Hopfield, J.J. (1982). Neural networks and physical systems with emergent collective computational abilities. *PNAS* 79:2554–2558. — [PNAS](https://www.pnas.org/doi/10.1073/pnas.79.8.2554)
- Amit, D., Gutfreund, H. & Sompolinsky, H. (1985). Spin-glass models of neural networks. *Physical Review A* 32:1007.
- McClelland, J.L., McNaughton, B.L. & O'Reilly, R.C. (1995). Why there are complementary learning systems in the hippocampus and neocortex. *Psychological Review* 102:419–457. — [PubMed](https://pubmed.ncbi.nlm.nih.gov/7624455/)
- Kumaran, D., Hassabis, D. & McClelland, J.L. (2016). What learning systems do intelligent agents need? *Trends in Cognitive Sciences* 20:512–534.

**Connectivity and cortical structure**
- Watts, D.J. & Strogatz, S.H. (1998). Collective dynamics of 'small-world' networks. *Nature* 393:440–442. — [Nature](https://www.nature.com/articles/30918) · [Author PDF](https://www.stevenstrogatz.com/articles/collective-dynamics-of-small-world-networks-pdf)
- Mountcastle, V.B. (1957, 1997). Modality and topographic properties of single neurons of cat's somatic sensory cortex; The columnar organization of the neocortex. — [Current Biology obituary/overview](https://www.cell.com/current-biology/fulltext/S0960-9822(15)00208-0) · [Cortical minicolumn overview](https://www.sciencedirect.com/topics/neuroscience/cortical-minicolumn)
- Felleman, D.J. & Van Essen, D.C. (1991). Distributed hierarchical processing in the primate cerebral cortex. *Cerebral Cortex* 1:1–47.

**Oscillations**
- Kuramoto, Y. (1975). Self-entrainment of a population of coupled non-linear oscillators.
- Winfree, A.T. (1967). Biological rhythms and the behavior of populations of coupled oscillators.
- Lisman, J.E. & Jensen, O. (2013). The theta-gamma neural code. *Neuron* 77:1002–1016. — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0896627313002316) · [Cell](https://www.cell.com/neuron/comments/S0896-6273(13)00231-6)

**Consciousness and inference**
- Baars, B. (1988). *A Cognitive Theory of Consciousness*.
- Dehaene, S., Changeux, J.-P. & Naccache, L. (2011). The global neuronal workspace model of conscious access. — [PDF](https://www.antoniocasella.eu/dnlaw/Dehaene_Changeaux_Naccache_2011.pdf)
- Dehaene, S. & Changeux, J.-P. (2011). Experimental and theoretical approaches to conscious processing. *Neuron*.
- Mashour, G., Roelfsema, P., Changeux, J.-P. & Dehaene, S. (2020). Conscious processing and the global neuronal workspace hypothesis. *Neuron*. — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0896627320300520)
- Friston, K.J. (2010). The free-energy principle: a unified brain theory? *Nature Reviews Neuroscience* 11:127–138. — [ResearchGate](https://www.researchgate.net/publication/41001209_Friston_KJ_The_free-energy_principle_a_unified_brain_theory_Nat_Rev_Neurosci_11_127-138)
- Tononi, G. (2004–). Integrated Information Theory. — [Internet Encyclopedia of Philosophy](https://iep.utm.edu/integrated-information-theory-of-consciousness/) · [Critique: The Problem with Phi](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4574706/) · [Φ not well-defined for general physical systems](https://arxiv.org/pdf/1902.04321)

**Language development**
- Kuhl, P. (2004). Early language acquisition: cracking the speech code. *Nature Reviews Neuroscience* 5:831–843.
- Gazzaniga, M. Hemispheric lateralization studies.

**Signal representation**
- Cohen, A., Daubechies, I. & Feauveau, J.-C. (1992). Biorthogonal bases of compactly supported wavelets. (CDF 9/7; JPEG 2000 lossy transform.)
- Sweldens, W. The lifting scheme: a construction of second-generation wavelets. — [Lifting implementation reference](https://gist.github.com/i-e-b/bb72fed460418f7c7ccb221d4b1da2b1)

**Internal documents**
- `docs/EQUATIONS.md` — every equation as implemented, with file references
- `docs/ARCHITECTURE.md` — system structure and design history
- `docs/SENSORY.md` — the peripheral contract and the cognition/sensory boundary
- `docs/SKILL_TREE.md`, `docs/ROADMAP.md` — capability state and staging

---

*Unity AI Lab — the equations are the mind, and the mind is learning to read.*
