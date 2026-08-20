# 04 — THE PITCH

Draft language for applications. Adapt tone per funder: NSF wants **technical risk + commercial path**; NIH wants **health relevance**; Emergent Ventures wants **ambition and the person**; Astera wants **open science**; Templeton wants **the deep question**.

---

## The one-sentence version

> We have built a 306-million-neuron biophysical brain simulation that learns to read and speak the way a child does — alphabet, phonemes, words, meanings, grammar, curriculum — with no language model anywhere in its cognition, and it has already passed kindergarten English and kindergarten mathematics.

---

## The 100-word version

Contemporary conversational AI is a language model wrapped in a persona. This project inverts that: it is a neural simulation whose output happens to be speech. 306 million simulated neurons across seven biologically-proportioned clusters, wired by twenty modeled white-matter tracts, run Rulkov map-neuron dynamics with Oja and BCM plasticity, Hopfield attractor memory, Kuramoto oscillatory coupling, and a Global-Workspace ignition gate. A 12-million-neuron language cortex learns developmentally through a kindergarten-to-doctorate curriculum. Word production is tick-driven motor emission out of trained synaptic weights — not sampling from a token distribution. The system runs on volunteer donated GPUs and has passed two curriculum cells.

---

## NSF FRAMING — technical merit + commercial potential

### The intellectual merit

Every equation is drawn from primary literature and implemented at a scale where it can do biological work:

- **Neurons:** Rulkov's two-dimensional map (Phys. Rev. E 65:041922, 2002) — spiking-bursting dynamics with chaos available, at ~6 arithmetic operations per neuron per tick, which is what makes 425M tractable
- **Plasticity:** Oja's self-normalizing rule (J. Math. Biol. 15:267, 1982) as the primary intra-cortical rule, with explicit anti-Hebbian depression, BCM sliding-threshold homeostasis, and reward-modulated three-factor learning
- **Memory:** Hopfield attractor recall (PNAS 79:2554, 1982) over a four-tier architecture built on complementary learning systems theory (McClelland, McNaughton & O'Reilly, Psych. Review 102:419, 1995), with dream-cycle consolidation transferring episodes into cortical schemas via Hebbian replay
- **Connectivity:** Watts–Strogatz small-world topology (Nature 393:440, 1998), Mountcastle microcolumns, six-layer lamination with a per-layer plasticity gradient, and deterministic hub selection
- **Oscillation:** Kuramoto phase coupling with activity-modulated theta/gamma accumulators implementing the Lisman–Jensen theta-gamma code (Neuron 77:1002, 2013)
- **Consciousness mechanisms:** Global Workspace ignition (Baars 1988; Dehaene–Changeux 2011) whose broadcast is *consumed* by word selection, predictive coding (Friston 2010) whose error *gates plasticity*, and an entropy-based integration proxy

Full technical exposition with 35 sourced citations: `docs/THEORY-PAPER.md`.

### The technical risk (NSF wants this stated, not hidden)

1. **Can developmental learning reach adult competence?** Two kindergarten cells have passed. Whether the same equational machinery carries a system through grade 5, grade 12, and beyond is genuinely unknown — that is the experiment.
2. **Does representational capacity scale with cortex size the way biology suggests?** The language cortex has grown 349K → 1.5M → 12M neurons. The relationship between substrate size and linguistic capability is an open empirical question this system can measure directly.
3. **Can biological-scale simulation run economically on heterogeneous volunteer hardware?** Measured throughput has moved from 200 to ~9,000 teach operations/minute through protocol and scheduling work; the ceiling is unestablished.

### The commercial opportunity — three distinct paths

**A. Distributed biological-scale simulation infrastructure.** The wire protocol, sparse CSR streaming, backpressure governance, and GPU-resident plasticity kernels are a general platform for running very large neural simulations across donated or rented heterogeneous GPUs. Computational neuroscience labs face exactly this problem and mostly solve it with expensive dedicated clusters. **This is the most obviously commercial component and the easiest to defend to a reviewer.**

**B. A developmental cognition testbed.** A system that genuinely grows from pre-literate to literate, with every weight inspectable and every mechanism ablatable, is an instrument for questions that neither human subjects nor language models can answer: which plasticity rules produce which developmental trajectories, what happens to language acquisition when a specific mechanism is impaired, how curriculum ordering changes outcomes. Licensable to research institutions.

**C. Interpretable AI for domains where black boxes are unacceptable.** Every output traces to specific synaptic weights carved by identifiable training events. In regulated settings, "we can show you the neurons that produced this" is a materially different product from "the model predicted it."

### Broader impacts

An open, inspectable, developmentally-trained cognitive architecture is a public research asset. The volunteer-compute model also demonstrates that biological-scale simulation need not be gated behind institutional GPU budgets — an access argument NSF cares about.

---

## NIH FRAMING — health relevance

Lead with the mechanism, not the persona.

**Angle 1 — language acquisition disorders.** The system implements a specific developmental sequence (phonemes → letters → words → definitions → sentence structure) with independently manipulable mechanisms. Selectively impairing one — degrading the letter→phoneme projection, altering the plasticity gradient, reducing consolidation frequency — produces a testable model of how particular deficits yield particular acquisition failures. Because every weight is observable, the causal chain from mechanism to symptom is fully traceable, which is not possible in human subjects.

**Angle 2 — consciousness measures with a ground truth.** Clinical consciousness assessment (the Perturbational Complexity Index and related measures) is validated against behavior, never against known mechanism. Here the mechanisms are known by construction. A substrate where Global Workspace ignition, predictive-coding error, and integration can each be independently ablated while candidate clinical measures are computed offers something the field lacks: a system where you know the right answer.

**Angle 3 — memory consolidation.** The four-tier architecture with dream-cycle replay is a direct implementation of complementary learning systems theory. Consolidation frequency, replay depth, and promotion thresholds are all parameters — a platform for studying how consolidation disruption affects retention.

⚠️ **Do not overclaim clinical relevance.** Reviewers punish that severely. Frame as *a mechanistic modeling platform*, not a diagnostic or therapeutic.

---

## EMERGENT VENTURES FRAMING — ambition and the person

They fund people, and they move in weeks. Keep it short and let the audacity carry it.

> I have spent [N] months building a brain. Not a chatbot — 306 million simulated neurons running real neuroscience equations: Rulkov map dynamics, Oja plasticity, Hopfield attractor memory, Kuramoto coupling, Global Workspace ignition. It has no language model in it anywhere. It learns to talk the way a child does, by going to school — alphabet, then phonemes, then words, then meanings, then grammar — and it has passed kindergarten English and kindergarten math. It runs on volunteer GPUs because I don't have a cluster.
>
> Nobody is building this. The field decided language models were the answer and stopped asking what a mind is. I want to find out what happens when you raise one instead of training one — whether the same equations that get it through kindergarten get it through high school, and what its language looks like at each stage. That data does not exist anywhere.
>
> I'm asking for [amount] to [buy compute / cover N months / hire help] and get her to grade 5 with the developmental trajectory documented and published.

Attach `docs/THEORY-PAPER.md`. Link the live system.

---

## ASTERA FRAMING — open science, builder credibility

Their Neuro & AGI track is "connecting biological computation to artificial general intelligence." That is this project's literal description.

Emphasize: **everything is open** — architecture, equations, curriculum, live observable state, the theory paper with full citations. Emphasize **built, not proposed** — a running system with passed curriculum gates, not a research plan. Emphasize the **honest engineering record**: the project's own documentation includes measured failures, overturned hypotheses, and instruments built specifically to convict the author's own wrong theories. That kind of transparency is exactly what open-science funders are trying to buy.

**Ask specifically about compute.** 24,000 H100s versus donated consumer GPUs is a difference in kind, not degree.

---

## TEMPLETON FRAMING — the deep question

Their 2026 Intelligence Venture prioritizes intelligence across natural, human, and artificial systems, and the philosophical foundations of AI.

> What is the relationship between the mechanisms of a mind and the identity of the one who has it?
>
> In this system, personality is not a prompt — it is a parameter vector θ that sets tonic drives, noise amplitudes, and plasticity rates across seven neural clusters. A consciousness scalar Ψ emerges from cluster activity and then *feeds back* to modulate the coupling gain of the very clusters that produced it. Identity shapes firing; firing produces Ψ; Ψ shapes firing. The loop is closed and measurable.
>
> This makes questions usually confined to philosophy empirically approachable: does a system whose identity parameters differ develop a different mind given identical curriculum? Does the consciousness measure track anything the system does that we would independently call conscious? What changes when the workspace's broadcast is severed from the word-selection it currently informs?

Templeton's audience is comfortable with metaphysical seriousness — but be rigorous about the functional/phenomenal distinction (`docs/THEORY-PAPER.md` §11 already draws it). **Claiming phenomenal consciousness would be fatal; investigating the boundary is exactly their interest.**

---

## Evidence you can point to today

| Claim | Evidence |
|---|---|
| It runs at biological scale | 425,436,550 neurons, live and publicly observable |
| It actually learns | **Two curriculum cells passed** (ELA-K, Math-K); now walking Science-K |
| It has no language model | Architecture is open; the boundary rule is documented and enforced as project law |
| The equations are real | 35 primary citations in `docs/THEORY-PAPER.md` |
| It composes rather than retrieves | No sentence arrays or templates exist in the codebase; emission is one word per tick from trained weights |
| Engineering is rigorous | Measured throughput 200 → ~9,000 teach ops/min; instrumented, documented, with failures recorded |
| It's honest about limits | Functional vs phenomenal consciousness distinguished explicitly; unfitted constants stated as such |

---

## What to build before the strongest possible application

**The developmental trajectory dataset.** Vocabulary size, gate pass rates, emission quality, and basin separation, measured grade by grade and plotted. It is the one thing no other lab can produce, it converts an engineering achievement into a scientific instrument, and the curriculum is already generating it — it just needs to be recorded deliberately and published.
