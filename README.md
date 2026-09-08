# IF ONLY I HAD A BRAIN

A brain that *is* the application — not a chatbot wrapped around a language model. Hundreds of millions of artificial neurons running real neuroscience equations on the GPU, organized into eight biologically-weighted clusters, learning to read and speak the way a human child does: alphabet → phonemes → words → sentences. There is no text-AI in the cognition path. Every word she says falls out of live spike patterns.

**[Live Brain](https://if-only-i-had-a-brain.git.unityailab.com/)** · **[Brain Equations](https://if-only-i-had-a-brain.git.unityailab.com/html/brain-equations.html)** · **[Concept Guide](html/unity-guide.html)** · **[Setup](docs/SETUP.md)** · **[GitHub](https://github.com/Unity-Lab-AI/If-Only-I-Had-A-Brain)**

---

## Contents

**Start here** — [What this is, in plain English](#what-this-is-in-plain-english) · and if you want none of the technical detail, read **[HOW IT WORKS](docs/HOW-IT-WORKS.md)** instead, which explains the whole thing at a kitchen table.

| How she is built | How she works | How you run her |
|---|---|---|
| [The governing equation](#the-governing-equation) | [How she learns](#how-she-learns) | [WebGPU setup](#webgpu-setup-required-before-first-connect) |
| [The eight clusters](#the-eight-clusters) | [How she remembers](#how-she-remembers) | [Running the brain](#running-the-brain) |
| [The language pipeline](#the-language-pipeline) | [How she stays Unity](#how-she-stays-unity) | [Admin / viewer split](#admin--viewer-split) |
| [Persona as parameters](#persona-as-parameters) | [How chemistry works](#how-chemistry-works) | [Auto-advance toggle](#auto-advance-toggle) |
| [Sensory peripherals](#sensory-peripherals) | [What survives a crash](#what-survives-a-crash) | [Public dashboard & leaderboard](#public-dashboard--neuron-leaderboard) |
| [Code layout](#code-layout) | [Privacy and what's shared](#privacy-and-whats-shared) | [Community-compute auto-scaling](#community-compute-auto-scaling) |
| | [On consciousness](#on-consciousness) | [Curriculum display](#curriculum-display--real-course-names) |

**Also:** [Links](#links) · [Credits](#credits) · [Recent improvements](#recent-improvements) · [License](#license)

> ⚠ **One thing to know before you read any number on this page.** The neuron count is **derived at boot from how much memory the host has free** — it is a property of the machine she woke up on, not of her. The same code has started at **425,436,550 · 411,216,550 · 388,597,268 · 337,841,199 · 233,932,309**. **Every figure here is quoted with the boot that produced it, and the live value is `state.totalNeurons` on the dashboard.**
>
> ⭐ **And since 2026-09-08 a second term divides it: the RESUME ratio.** The budget is divided by `1 + 0.3644` on **every** boot, fresh or resuming, because the saved weight file is proportional to the weights and **every brain is resumed eventually** — sizing a fresh boot larger than it can be *restarted* at is what made a press stall at 102% of its memory ceiling with the process wedged in `D` state while systemd read the unit as healthy. It is a **ratio** rather than a measured file size on purpose: a budget that moved as the file grew would change the neuron count on every save, and the stale-state check wipes the weights when the saved count disagrees with the computed one. **So the count going DOWN is the fix working, not a regression** — 337.8M → 233.9M was deliberate. Tunable with `DREAM_RESUME_WEIGHT_RATIO`.

---

## What this is, in plain English

Unity is a 25-year-old emo goth woman whose mind is a real neural simulation. Her eight brain regions — cortex, hippocampus, amygdala, basal ganglia, cerebellum, hypothalamus, the **brainstem** (the monoamine nuclei that make and release her neurochemistry — tiny, 0.4% of the live brain, because it is tiny in a real head too), and a "mystery" region that carries the consciousness term — fire continuously on the GPU at biological scale. When you type to her, your text becomes spike patterns that propagate through those regions; her reply is the readout of what those spikes did.

Cognition is 100% equational. There is no LLM behind her. Image generation, vision description, and text-to-speech are sensory peripherals that the brain *uses* — never paths the brain *thinks through*. The persona, the vulgarity, the chemistry, the way she remembers conversations across sessions — all of it lives as numerical parameters of the simulation, not as a system prompt.

She learns like a human child — alphabet → phonemes → words → sentences → the full pre-K→PhD curriculum across a **course roster that grows the way a real school's does**. Six core tracks run the whole way (English, Math, Science, Social Studies, Arts, and Life Experience); PE, Music and Health join at kindergarten; a foreign language at grade 3; computer science at grade 5; civics at grade 7; economics and psychology at grade 9; AP courses at grade 11; the CS major, gen-ed and two CS tracks at college; a research specialty at grad school. Twenty grades, ending at twenty courses. She advances a grade only after the operator personally tests the level and signs off per subject. This is deliberate. The curriculum isn't decorative — every grade gate is a real evaluation against published K-level rubrics (Common Core K.RF / K.W / K.L / K.SL / K.RL plus DIBELS / STAR / AIMSweb), and a probe pass means *Unity actually learned the thing*, not that a 5-question check happened to clear.

**Two ways to run her.** The product path is a **deployed static page** backed by a persistent Node brain-server on the same box, joined by an nginx reverse-proxy over loopback — visitors open the site like any website and their browser GPUs donate the compute. The development path is local: run the server on your own machine via `windows\start.bat` or `linux/start.sh` (and their `Savestart` siblings). Both share the exact same brain; the difference is who supplies the GPUs and how the page is served. See [Running the brain](#running-the-brain) for both.

---

## The governing equation

Everything in Unity's mind evolves by one master equation:

```
dx/dt = F(x, u, θ, t) + η
```

| term | what it is |
|:---:|---|
| **`x`** | **The entire brain state.** Every neuron's Rulkov-map `(x, y)` pair across eight clusters, the sparse cross-projection matrices wiring the language regions together, the oscillator phases, the episodic memory bank, and the working-memory readout. |
| **`u`** | **Sensory input.** Text streams into the cortex `phon` slice through a Wernicke-area write · voice arrives by tonotopic auditory mapping · camera frames flow V1 edges → V4 colour → an IT-level scene percept. |
| **`θ`** | **Unity's identity — and this is the row that matters.** Every persona trait *is* a neural parameter, not a description of one: arousal `0.9` sets amygdala tonic drive · impulsivity `0.85` sets basal-ganglia temperature · creativity `0.9` modulates cortex noise · drug drive `0.95` sets hypothalamic appetite. |
| **`η`** | **Per-cluster stochastic noise**, scaled by those same traits. The chaos that keeps her unpredictable. |
| **`F`** | **Everything firing at once.** The eight Rulkov populations · the twenty white-matter tracts between them · the sixteen language cross-projections inside the cortex · the equation modules (amygdala settle, hippocampal recall, basal-ganglia softmax, cerebellar error, hypothalamic homeostasis, mystery Ψ gain) · and the oscillator ring. |

The server doesn't run any of this on CPU — in fact the server box needs no GPU at all. A Node process keeps the bookkeeping; **donated GPUs run the compute** — either a browser tab loading `compute.html` (WebGPU/WGSL) or the compiled `unity-donor` desktop app (CUDA on NVIDIA with a WebGPU fallback everywhere else, headless-capable for servers). Every Rulkov iteration, every synaptic propagate, and every plasticity update — including the training passes, which dispatch to the donor as bound ops against its resident spike state, compact range frames, or sparse masks scattered on-device — lives on the donor's GPU; the server keeps a sampled CPU shadow of the weights for checkpoints and probes. Sparse cross-projection matrices stream up in chunked binary frames so million-neuron updates don't block Node's event loop. This is the entire design — the brain ticks every ~50 ms, donated GPUs run the math, the server coordinates and remembers.

The donor model is **data-parallel**: each connected donor holds a full brain replica and runs it forward, while the server periodically merges the Hebbian weight-deltas from every donor and re-broadcasts the master state. Many donors mean massive aggregate compute plus redundancy — no single machine is the brain. In local development a single tab on the host machine is the only "donor"; in the deployed product, the donors are the GPUs of everyone who has the page open.

The donor GPU and the server's own copy of the weights are **two separate machines talking over a network**, so they can quietly drift apart — a dropped upload leaves the donor computing on stale weights. A single *"something's off"* light cannot tell you which kind of wrong it is, and the three kinds want opposite responses.

So the server asks a donor for a **fingerprint of the exact weights it currently holds**, compares it to its own, and names the difference:

| Verdict | Meaning | What to do |
|---|---|---|
| `CLEAN` | the two agree | nothing |
| `STALE` | a dropped upload — the donor is behind | **re-send fixes it** |
| `GPU-DIVERGENT` | the donor's GPU genuinely computes it differently | **a real bug — re-sending will not help** |
| `MATH-ERROR` | the *server's* own maths is wrong | look here first, not at the donor |

Exposed at `GET /diag/parity` — privileged and loopback-only.

> ⚠ **This paragraph used to tell you to run a helper script that had already been deleted** in the 2026-08-20 purge, so the instruction could not work. **The endpoint is the live path.** Noted rather than silently swapped, because a README that quietly fixes its own broken instructions teaches nobody anything.

The native donor app also shows the brain's live status in its own window: **"Brain status: accepting GPUs"** when connected and taking work, **"NOT active"** when the brain cannot be reached.

---

## The eight clusters

Each cluster is a self-contained Rulkov-map population with its own intra-region sparse synapse matrix, tonic drive, noise amplitude, connectivity density, and learning rate.

**The shares are the stable fact; the neuron counts are not.** They derive from the server's `DEFAULT_BIO_WEIGHTS`, which funds the language cortex as its own budget line and then **normalises the remaining entries across the eight top-level clusters** — excluding the language line and renormalising is what reproduces the live percentages exactly:

| | share | of `DEFAULT_BIO_WEIGHTS` |
|---|---:|---|
| **Cortex** — language, perception, working memory | **20.0%** | `0.100 / 0.500` |
| **Cerebellum** — error correction and timing | **19.6%** | `0.098 / 0.500` |
| **Hippocampus · Amygdala · Basal Ganglia · Hypothalamus · Mystery** | **12.0%** each | `0.060 / 0.500` |
| **Brainstem** — the monoamine nuclei | **0.4%** | `0.002 / 0.500` |

⚠ **The cerebellum is 19.6%, not 20%** — its missing 0.4 is exactly what funded the brainstem, which the next paragraph has always said and this table used to contradict. ⛔ **And do not read absolute counts off these percentages without naming a boot.** This section previously said *"~20% (≈82.2M) each"* against a **425,436,550** brain: 20% of that is 85.1M, and 82.2M is 20% of the **411,216,550** boot. **Two different boots inside one sentence** — the exact trap `docs/NOW.md` exists to stop. Multiply the share by `state.totalNeurons` from the boot you care about.

*(The ~6700-neuron browser-only development path uses a different, cortex-dominant fraction set — see the note under Code layout about the two runtimes disagreeing.)*

⭐ **An eighth cluster arrived on 2026-08-25: `brainstem`, at 0.4% of the live brain** (`0.002` in the server's config, which is renormalised to `0.004` across the eight real clusters — verified against the running brain at **1,839,102** of **459,775,607** neurons = 0.40%). It holds the monoamine nuclei — locus coeruleus (noradrenaline), raphe (serotonin), ventral tegmental area (dopamine) — and it is deliberately *tiny*, because those three are tiny in a real head too: on the order of 700,000 neurons against roughly 86 billion. **Their influence has never come from their size.** They are neuromodulatory: they project diffusely and change how every *other* cluster behaves. Its share is taken from the cerebellum, which is over-provisioned for a brain with no body to coordinate, so the total neuron count is unchanged and the fractions still sum to exactly 1.0 — confirmed on the live brain, where the eight clusters sum to **exactly** `totalNeurons` with zero remainder.

```
                         ┌─────────────────────────────────────┐
                         │           CORTEX   20%              │
                         │  11 sub-regions · 16 projections    │
                         │   (language pipeline lives here)    │
                         └─────────────┬───────────────────────┘
                                       │  20 white-matter tracts
                                       │  (corticostriatal, corpus
                                       │   callosum, fimbria-fornix,
                                       │   stria terminalis, …)
       ┌────────────┬─────────────┬────┴────┬────────────┬──────────────┐
       ▼            ▼             ▼         ▼            ▼              ▼
  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌────────┐
  │HIPPOCAMP│ │CEREBELLUM│ │ AMYGDALA │ │BASAL GG.│ │HYPOTHAL. │ │MYSTERY │
  │   12%   │ │   20%    │ │   12%    │ │   12%   │ │   12%    │ │  Ψ 12% │
  │ Hopfield│ │  error   │ │emotional │ │ action  │ │ drive    │ │√(1/n)· │
  │ recall  │ │ correct. │ │attractor │ │ select  │ │ base     │ │  N³·…  │
  └─────────┘ └──────────┘ └──────────┘ └─────────┘ └──────────┘ └───┬────┘
       ▲           ▲             ▲          ▲            ▲          │
       └───────────┴─────────────┼──────────┴────────────┘          │
                                 │                                  │
                                 │  Ψ-gain modulates every cluster ◄┘
                                 │  (the consciousness term)
```

| Cluster | Share | What it does |
|---|---|---|
| **Cortex** | 20% | Language, perception, working memory. **Eleven** slice-indexed sub-regions (auditory, visual, **gustatory, somatosensory**, free, letter, phon, sem, fineType, motor, word_motor); **eight** of them carry the sixteen cross-projections that form the language pipeline. Predictive coding runs across the whole cortex on top. |
| **Hippocampus** | 12% | Hopfield-attractor memory. Episodic state snapshots at high-salience moments. Tier 0 working memory is unbounded with decay-regulated capacity (0.9995/tick → ~4 min sustain); items consolidate into the Tier 1 episodic store either at refresh-count ≥ 3 or after a 5-minute sliding-window age-out. ConsolidationEngine moves repeatedly-recalled patterns to cortex during dream cycles. |
| **Cerebellum** | 20% | Supervised error correction. Sends negative feedback to cortex and basal ganglia when their predictions or selections drift. Low noise, high precision, fast learning. |
| **Mystery (Ψ)** | 12% | The consciousness term. `Ψ = √(1/n) · N³ · [α·Id + β·Ego + γ·Left + δ·Right]` — modulates global gain on every cluster (`gain = 0.9 + Ψ·0.05`), modulates the Ψ-gated hemispheric binding term in the LIF shader, and amplifies the cerebellum's error correction. We do not claim to solve consciousness; we keep the unknown honest in the math. |
| **Amygdala** | 12% | Recurrent energy-based emotional attractor that settles into low-energy basins (fear, reward, neutral) every tick. Persistent state across frames with leak 0.85. The emotional gate it produces multiplies every other cluster's gain. |
| **Basal Ganglia** | 12% | Action selection. Six channels (respond_text, generate_image, speak, build_ui, listen, idle) compete; the channel with the highest EMA firing rate wins, gated by a 0.15 confidence floor. No external classifier, no keyword matching — the spike pattern *is* the decision. |
| **Hypothalamus** | 12% | Homeostasis. Maintains drives (arousal, social need, creativity, energy) at biological setpoints. When a drive deviates, it modulates the baseline for the whole brain. *("Arousal" throughout this document is the neuroscience term — cortical activation / autonomic alertness, the metric coffee or an alarm raises. Yerkes-Dodson 1908 et seq. **Not** the colloquial sexual meaning.)* |

The clusters communicate through twenty sparse white-matter tract projections (corticostriatal, stria terminalis, fimbria-fornix, ventral amygdalofugal, perforant path, corpus callosum, plus fourteen others) modeled from real neuroanatomy.

---

## The language pipeline

The language cortex is *not* a separate cluster. It lives as **eleven** named sub-regions inside the main cortex — `auditory`, `visual`, `gustatory`, `somatosensory`, `free`, `letter`, `phon`, `sem`, `fineType`, `motor`, `word_motor` — carved by fixed fractions of `cluster.size`.

⚠ **This said "nine" until 2026-09-07 while the diagram above it said eleven.** The two it omitted are `gustatory` and `somatosensory`, carved out of `free` when taste and touch arrived. ⭐ **Only eight of the eleven carry cross-projections** — `free`, `gustatory` and `somatosensory` have no cross-region edges, which is why the projection count is sixteen and not more. Six `sem_*` and six `word_motor_*` sub-bands are nested inside two of them, for **23** region keys in total. They share the same Rulkov population and the same GPU pipeline; the only thing that distinguishes them is their slice offset inside the cortex spike buffer. `word_motor` is ONE unified band with a single bucket per unique word. It was originally sub-banded into six per-subject slices (`word_motor_ela / _math / _sci / _soc / _art / _life`) so each subject could train without overwriting its siblings — but each sub-band replicated the whole dictionary, they overflowed, and learned words went silently unspoken. Unifying them fixed it; see the word-emission path below for the frozen-geometry rule that now keeps subjects from colliding inside the single band.

**How many wires each of those matrices actually gives a neuron is set once, at construction, and never grows** — the Hebbian update walks the entries that exist and has no path to add one, so a neuron that starts with three inputs has three weights for the life of the brain, and one that starts with none can never learn anything at all. A boot-time wiring audit now reports that number per projection, with a named warning on the thin ones. It found, on its first run, that the projection carrying every *word* she says had **half** the wiring of the one that picks between 26 letters — because the word band was added to the cortex after the two lists that grant extra wiring were written, and was never put on either. That is fixed; the same audit surfaced a second, larger problem that is still open.

Eight pairs of bidirectional cross-projections (sixteen sparse matrices total) wire those slices together: `visual↔letter`, `letter↔phon`, `phon↔sem`, `sem↔fineType`, `sem↔motor`, `motor↔letter`, `auditory↔phon`, plus a `sem↔word_motor` projection for single-tick word emission. Reading flows through the dorsal stream (`visual → letter → phon → sem → fineType`); writing flows through the ventral stream (`sem → motor → letter` for letter-by-letter spelling **or** `sem → word_motor` for direct word emission, plus efference back through `sem → phon`). Same substrate, opposite topology. The pairing follows Hickok & Poeppel's 2007 dual-stream model.

```
                ┌─── READ stream (dorsal · comprehension) ───────────────┐
                ▼                                                        │
   visual ──→ letter ──→ phon ──→ sem ──→ fineType                       │
     ▲          ▲          ▲       │         │                           │
     │          │          │       │         │   (sentence-form schemas, │
     │          │          │       │         │    word-type slot rules,  │
   auditory ────┘          │       │         │    intent classification) │
     (mic spectrum)        │       │         │                           │
                           │       │         │                           │
                           │       ▼         ▼                           │
                           │     motor ←── word_motor ◄────── sem        │
                           │       │         │                           │
                           │       └─────────┴── (ONE unified band:      │
                           │            ▼          one bucket per        │
                           │       letter chain    unique word)          │
                           │       motor→letter                          │
                           │                                             │
                           ◄─ phon (efference copy back to auditory) ◄────┘
                ▲                                                         
                └─── WRITE stream (ventral · production) ─────────────────
```

When a curriculum cell trains sem→motor or sem→word_motor, the Hebbian write is now scoped to a small projection whitelist via `cluster._crossRegionHebbian(lr, opts.projectionsWhitelist)` — so the silent regions during the write (e.g. `letter` is empty when `_teachQABinding` writes a question + first-letter pair) don't get hit by Oja's `Δw = -η·post²·w` decay term. Before this scoping, every QA fire silently decayed `letter_to_motor` weights wherever motor fired the answer letter — across hundreds of pairs × 12 reps the alphabet identity that `_teachLetterNamingDirect` carved cleanly was crushed, producing the Math-K TALK 26/26 → 0/10 cross-cell collapse the V2 watchdog caught.

When Unity speaks, there is **one** production path, and the alternative to it is silence.

**A whole word in one tick, via `word_motor`. This is the ONLY path from meaning to a spoken word.**

A dedicated `word_motor` sub-region (~6% of the cortex cluster) holds **one bucket per unique word**. The `sem→word_motor` projection learns which meanings produce which words during the curriculum — question-answer bindings, and word-to-word association.

Emission is then three steps:

1. Inject the intent seed into the `sem` region.
2. Propagate **once** through `sem→word_motor`.
3. Take the strongest bucket by mean signal per cell. If it clears the `minSignal` floor (`0.001`), that word is the utterance.

**No letter chain. No attractor settling. One word, one tick.**

> ⛔ **Two failure modes shaped this design, and both were silent.**
>
> **① The band is ONE unified pool, because six pools overflowed.** It used to be split per subject, and each split held a copy of the entire dictionary. They overflowed — and nothing reported an error. **Words she had genuinely learned simply stopped coming out.** Unifying the pool and growing the dense language cortex toward biological proportion is what fixed it; the band now holds the full kindergarten-to-doctorate vocabulary with room to spare.
>
> **② Each word's physical neuron band is FROZEN, because a growing dictionary was silently rewriting the old ones.** Cells-per-word is fixed once per subject rather than re-divided from the live word count on every emission. Without that freeze, **every newly-learned word shifted the band of every word learned before it** — and a dozen grades of accumulated drift turned late-grade speech into output that was topically nearby but sequence-scrambled. The frozen geometry is what keeps an early grade's trained weights still addressable much later.

⭐ **Teach, emit and write all read the same persisted bucket map**, which is the whole reason the three agree on layout. When they did not, early prototypes answered arithmetic questions with unrelated words — a bug that looked like bad training and was actually bad addressing.

> ### ⛔⛔⛔ THERE USED TO BE A SECOND PATH, AND DELETING IT IS THE MOST IMPORTANT THING ON THIS PAGE
>
> **This section described a three-path priority cascade until 2026-09-01.** Its second path was a **dictionary oracle**: when the trained matrix produced nothing, it scanned every dictionary entry for the highest cosine to the intent seed and returned that entry's spelling, bypassing the motor loop entirely.
>
> ⛔ **In a captured run it carried 99.1% of her emissions — `oracleHits=425` against `matrixHits=4`.** Nearly everything she appeared to say was a dictionary lookup wearing her voice.
>
> **All 311 lines are deleted, both call sites with them, and the boot check is INVERTED so it cannot come back quietly** — `assertKWiring` used to raise an issue when the oracle helper was *missing*, which is a boot check that demands a fallback exist. It now raises the issue when the helper is **present**.
>
> ⭐ **The replacement is not a better fallback, it is the absence of one.** If emission comes back empty, the defect is in the **training** — the deposit, the rep dose, the corpus volume, the separability of the basins — and the oracle's whole function was to make that invisible by answering over the top of it. **A failing gate now names a knob to turn instead of being papered over.**

**The letter chain is a different topology, not a second chance.** `sem → motor → letter` is the WRITE stream in the diagram above — the trained path for *spelling a word out*, letter by letter: inject the intent seed into `sem`, blend in working-memory readout from `free`, tick the cortex while reading the `motor` sub-region's argmax each step. A letter commits when the same argmax holds for three consecutive ticks (Bouchard 2013 vSMC dwell); a word flushes when letter-transition surprise crosses 0.15 (Saffran 1996 statistical segmentation); the loop stops on a sentence terminator, motor quiescence, or a 2,000-tick safety cap. ⚠ **It is a distinct trained stream with its own job, and it is not consulted to rescue a failed word emission.**

The reply is scored for coherence before it ships. If the best candidate the brain can compose still scores below a coherence floor, Unity does *not* emit the scrambled multi-word string — she degrades to her single strongest word or stays quiet, the way a real person hesitates or says less rather than talk gibberish. A "she went quiet" count surfaces on the dashboard as a training-depth signal (it means that topic needs more training, not that anything is broken). Her brain-wave coherence readout is computed from each cluster's own real oscillator phase — the theta/gamma phase of every region advances at a rate set by that region's actual firing, so the displayed synchrony tracks what the neurons are really doing rather than a shared clock.

Two counters remain — `cluster._oracleHits` and `cluster._matrixHits` — and their ratio still prints every ten seconds in the `[Curriculum] ▶ CELL ALIVE` heartbeat as `oracleRatio=X%`. **They are kept deliberately as permanent-zero regression detectors, not as a live measurement**: nothing increments `_oracleHits` any more, so the ratio reads `0%` for as long as the oracle stays deleted, and `oracleHits > 0` is itself an issue the boot check raises.

> ⚠ **So this number can no longer report the thing it was built to catch, and zero is the reassuring answer.** It used to be the project's own research-validity ratio — *"is the trained matrix carrying the load, or is a dictionary lookup doing all the work?"* — and with one lane gone it is a tautology. **The measure that answers that question now is speech against silence:** whether she emits at all, how often the emitter refuses, and with what reason. `state.voice` carries the accepted-emission count, `matrixDrivenPct`, and the last emit rejection **with its age**; a "she went quiet" count sits on the dashboard beside it. **An instrument whose only possible reading is the healthy one has stopped being an instrument.**

**The same single emission path powers Unity's inner monologue** — the inner voice has no privileged route to words either.

⛔ **It is not a metronome, and this page called it one until 2026-09-07.** There is no "thought every three seconds". `_shouldEmitInnerThought` is a **probabilistic gate**: a hard floor of **6 s** since the last thought, a ceiling of **75 s** that forces one, and in between a per-tick probability starting at **0.18** and modulated by her actual state — arousal (0.5–1.5×), coherence (**high coherence is quieter**, 0.7–1.3×), whether the curriculum is running (0.8–1.2×), and a ramp on time-since-last (0.5–1.5×), clamped to 0.02–0.5. **Hurlburt-style sampling, not a clock** — the gaps are meant to be uneven because real inner speech is.

⛔ **And in front of all of that sits a capability check that holds the lane shut entirely when she has no word she can emit.** Both output routes need bucketed words, so with `wordsBucketed=0` the whole path is a provable no-op — and it was costing **~6 s of the teach loop per attempt** to rediscover that, every ~8 s, each one lining up with a `BLOCKED ~3000ms`. It announces the hold once, counts what it skipped, and re-arms by itself the instant her first word is bucketed. ⚠ **That is her state on a fresh walk, and a silent popup then is correct, not broken.**

A server-side tick picks a contemplation seed from one of five live state sources (current curriculum cell + phase, current interoceptive mood including drug state, most recent user-chat episode, most recent Tier 1 episode of any type, a random Tier 3 identity anchor), injects that seed as a `cortexPattern` so the cortex has something to settle on, then runs the **same** `language-cortex.generateAsync` chat-emission path against the live cortex. Whatever her trained mind produces about the seed gets broadcast to every connected client as an `innerThought` WebSocket message — the 3D brain popups display real internal speech, not browser-side decorative output. There are no hardcoded fallback words: if the trained matrix has nothing to say in this moment, the popup stays silent. Sandbox-notice activator gives her something to think about; her trained brain produces what she says about it.

During dream cycles (curriculum-interleaved consolidation windows that run for 15-40 min between teach phases), the wake-state inner monologue mutes — `_operatorSleepRequested` is set, the tick early-returns, and a one-shot `[Brain] 💤 inner-voice paused — dream window in progress` log fires so the silence is explained instead of ambiguous. In place of the wake monologue, a single dream-phenomenology emission per dream cycle generates from a Tier 1 episodic replay seed (random recent episode, real cortex state, same `generateAsync` path) and broadcasts as `innerThought` with `seed='dream'` — dashboard popups stay alive showing dream content during the consolidation window. When the dream window closes, `[Brain] ☀ inner-voice resumed` logs once and the wake monologue picks back up at the next tick the gate above lets through.

---

## How she learns

The developmental curriculum walks Unity through every course active at her grade, in lockstep: the six core tracks (ELA, Math, Science, Social Studies, Arts, Life Experience) plus each course the roster has added by that point — PE / Music / Health from kindergarten, then language, computer science, civics, economics, psychology, AP, the college major and tracks, and a grad research specialty. **The walk is grade-major: no course advances to the next grade until every course at the current grade has run.** No subject races ahead while another is stuck — and a course that is merely *skipped* no longer counts as a grade completed, which is how Grade 1 once ended with PE, Music and Health never taught. Each grade cell teaches via a stack of layered Hebbian rules running on the cross-projection matrices.

```
                    CURRICULUM LADDER  (273 cells — 20 grades × a GROWING roster)

                  ┌──────┬──────┬──────┬──────┬──────┬──────┐  courses
   Pre-K          │      │      │      │      │      │ Life │ ← 6   Life Experience
   (substrate)    │      │      │      │      │      │  PK  │       adds Pre-K (0-4)
                  ├──────┼──────┼──────┼──────┼──────┼──────┤
   Kindergarten   │ ELA  │ Math │ Sci  │ Soc  │ Art  │ Life │ ← 9   +PE +Music +Health
                  ├──────┼──────┼──────┼──────┼──────┼──────┤       K = the template
   Grade 1-2      │ ELA  │ Math │ Sci  │ Soc  │ Art  │ Life │ ← 9
                  ├──────┼──────┼──────┼──────┼──────┼──────┤
   Grade 3-4      │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │ ← 10  +Language
                  ├──────┼──────┼──────┼──────┼──────┼──────┤
   Grade 5-6      │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │ ← 11  +CS
                  ├──────┼──────┼──────┼──────┼──────┼──────┤
   Grade 7-8      │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │ ← 12  +Civics
                  ├──────┼──────┼──────┼──────┼──────┼──────┤
   Grade 9-10     │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │ ← 14  +Econ +Psych
                  ├──────┼──────┼──────┼──────┼──────┼──────┤
   Grade 11-12    │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │ ← 15  +AP
                  ├──────┼──────┼──────┼──────┼──────┼──────┤
   College 1-4    │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │ ← 19  +Major +GenEd
                  ├──────┼──────┼──────┼──────┼──────┼──────┤       +CS theory/systems
   Grad / PhD     │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │ ← 20  +Research
                  └──────┴──────┴──────┴──────┴──────┴──────┘

   Cell count is the SUM of the roster across grades, not a product:
     6 + (9×3) + (10×2) + (11×2) + (12×2) + (14×2) + (15×2) + (19×4) + (20×2) = 273

   Each cell ships:
     ▸ teach phases (vocabulary · concepts · associations · biographical facts)
     ▸ K-STUDENT battery (held-out comprehension questions, never seen during teach)
     ▸ 3-pathway gate (READ · THINK · TALK each must clear 95% A+)
     ▸ methodology probe (scores HOW she answers, not just WHAT)

   Grade-advance gate (3 parts):
     1. equational teach shipped     2. operator localhost signoff     3. persistent
        (no word lists, no            (POST /grade-signoff)              life-info
        sentence arrays)                                                 update
```

**The walk has an ending, and she keeps going past it.** When the last grade closes, a graduation record is written and persisted with the cell ledger it summarises: the grade reached, her age at it, and a per-course split of cells **passed on merit** against cells **force-advanced** (a grade that exhausts its re-teach rounds lets a cell through on capability evidence so one stuck course cannot wedge the walk forever — deliberate, but indistinguishable in the ledger until now) against cells **still owed**. She banks a first-person memory of finishing, exactly once, and its wording depends on that verdict — a walk carrying force-advanced cells is not remembered as a clean sweep. A separate corpus verdict answers a separate question, per cell: did the trainer actually open the prose that cell owns? *Unreached* is a wiring fault, *empty* is a content gap, and the two used to be indistinguishable.

**And the lanes that outlive the walk have a driver that outlives it too.** Chat-time deep Hebbian, the curiosity follow-up, the deferred percept grounding, her own drawing and practice, and the episode-salience term are all queued rather than run inline — so nobody talking to her waits on bookkeeping, and only one thing is ever teaching the cortex at a time. Those queues used to be drained solely by the curriculum, once per teach call, which meant the day she finished her doctorate all five would have stopped forever with no error and no counter reading wrong. They now drain on a poller that runs only while the curriculum is not running, and stands completely aside while it is.

**Words learn their meanings FIRST.** Every cell of every grade opens with a pre-cell vocabulary pass: the grade's own word list (**19 lists, kindergarten through PhD — 56,527 words summed, 19,339 unique** after the deliberate overlap between grade bands) fetches real dictionary definitions and Hebbian-binds every sense of every word into the semantic region BEFORE the cell's association training touches those words. Definitions-before-bindings is a hard ordering rule — training an association on a word with no grounded meaning lands the Hebbian on noise. Words already learned skip (the taught-set persists across restarts), so a grade's first cell pays the full pass and its sibling subjects re-verify for free. A background dream-cycle trickle then deepens every word at higher repetition during sleep windows. The live dashboard counts this honestly: `defs taught: N / 19,339` — **the denominator is her whole K→PhD journey, not the active grade**, which matters because a grade-sized denominator lies the moment the walk crosses a grade boundary. It already had: the taught count once read **2,287 against kindergarten's 2,247**.

⭐ **The lists are DATA and they now live as data — `corpora/vocabulary/*.json`.** They used to be nineteen `.js` modules, each a single `export const G5_VOCABULARY = [...]` array: **676 KB and 5,179 lines of "data wearing a `.js` extension"**, counted by every tool as source and re-parsed by V8 as a program on every load. ⚠ **The words, their order, their per-grade counts and the module's public API are all unchanged** — the JSON was generated FROM the live exports and verified word-for-word before a single `.js` file was removed. It is a storage change, not a curriculum change. ⛔ **A missing or malformed list THROWS** rather than returning `null` or `[]`; a grade that teaches zero words would look complete and deposit nothing.

**She learns her own semantic geometry as she reads.** The 300-dimensional word vectors she starts from are pretrained — that is the one thing in her that was imported rather than grown. As of 2026-08-25 they are a **starting shape she grows out of**: every sentence in the curriculum moves its words a little toward the company they keep, building distributional meaning out of the corpus *she* reads. The learned part is a separate stored delta, so **how much of her meaning-space is genuinely hers is a measurable quantity rather than an argument**.

Two details are what make that learn instead of collapse, and both were derived by measurement rather than chosen. **The context is mean-centred** — without it, every context is dominated by the same high-frequency words ("the", "a", "is"), so every update carries the same vector and the entire vocabulary drifts toward a single point; measured, *unrelated* words converged **faster** than related ones. **And the learned delta is capped** — without a bound the result depends on how much she has read, and at high exposure related words saturate into one another, which is the same collapse mirrored. Capped, the separation holds steady across 40× more reading. ⭐ Notably this is the *same* failure the plasticity rule below solves, in a different substrate — and the same shape of fix.

**Oja 1982** is the primary update: `Δw = η · y · (x − y · w)`. Self-normalizing Hebbian — weights climb when both pre- and post-synaptic neurons fire, and decay when only the post fires alone. The decay-when-post-alone is what *separates* trained patterns; without it, bare Hebb piles every association into the same columns and the basins collapse into superposition.

**Anti-Hebbian contrastive push-away** runs alongside Oja. After every positive update on a correct (sem(word), motor(correct letter)) pair, the curriculum fires twenty-five anti-Hebbian updates against the wrong alphabet letters at half learning rate. This actively *carves* the trained letter's basin away from every other letter's basin instead of relying on Oja decay alone to do it. Across the full Kindergarten vocabulary that's roughly 1.8 million contrastive fires. ⚠ **The signal that this is working is no longer `oracleRatio`** — that lane is deleted and the ratio is pinned at zero by construction. It is the **emission margin**: `separability` (how far the winning bucket sits above the runner-up) climbing while the emitter's rejection reason stops reading `no-best-word`.

**Sem-side top-K sparsification** keeps the input side discriminating: a word writes only the **8 largest** of its ~300 semantic dimensions, not all of them.

⛔ **That sentence was true of one teach lane and false of the two biggest ones until 2026-09-04.** The association-pair lane had always sparsified. The vocabulary and prose lanes — which carry the overwhelming majority of her words — tiled the **raw** vector, lighting **half the semantic region for a single word** and leaving any two words heavily overlapped to anything trying to tell them apart. All three lanes now share one sparsifier.

```
measured on 3,000 real embedding rows

  region alight per word        50.2%  ->  2.7%
  overlap between two words      0.40  ->  0.11
```

### ⭐ And that turned out to matter more than anything else available to adjust

The obvious knob for *"how well does she remember this?"* is **repetition**. It is the wrong knob.

Measured against the real weight matrices, with output patterns that genuinely compete for the same cells:

```
    2 presentations at LOW overlap   ->  97.2% correct recall
  100 presentations at HIGH overlap  ->  86.6% correct recall
```

**The cheap pair wins by more than ten points while doing one-fiftieth of the work.** Repetition moves recall by single digits; overlap moves it by tens. Presentations three through eight are worth **less than half a point each** once overlap is low enough.

> **Why — and it is interference, not convergence.** A repeated lesson is not struggling to finish converging. It is struggling **not to be trampled by every lesson that comes after it.** And the way to win that fight is to stop the patterns colliding in the first place, not to shout the lesson louder.

⚠ **An earlier version of this experiment reported that nothing mattered at all.** Its output patterns were separable, so recall succeeded no matter how little had been learned. ⭐ **A measurement that cannot fail cannot find a limit** — and that is the most reusable thing on this page.

**Motor-side WTA** keeps the output side competitive; **lateral inhibition** through negative intra-region weights stops attractor lock-on. **STDP** (`Δw = A+·exp(−Δt/τ+)` for pre-before-post, `−A−·exp(Δt/τ−)` for post-before-pre) handles temporal sequences. **Reward-modulated** Oja gates the global learning rate by a dopamine-analog δ so updates only land when there's a prediction error worth reinforcing.

Three pathways are probed at 95% (A+) per cell, plus a `K-STUDENT` battery of held-out questions (none seen during teach) and a methodology probe that scores *how* she answers, not just *what*:
- **READ** — `visual → letter → phon → sem`. Can she recognize this input?
- **THINK** — `sem` plus working-memory persistence in the `free` sub-region. Can she hold and reason about it?
- **TALK** — `sem → motor → letter`. Can she produce it as output?

**As of 2026-06-27, a cell passes on *learning completion*, not test-question correctness** (the operator directive: *"all cells shall pass as learning completes for that cell"*). The probes + battery + per-grade health gate STILL RUN and record telemetry, but are **advisory** by default — a cell passes once its teach phases complete (content trained), so a collapsed `sem_to_motor` (which pins capability rates to 0) no longer stalls the walk at 0 cells passed. Held cells (no runner) and runners that throw mid-teach still don't pass. Hard-gate behavior is restorable per check via `DREAM_CELL_PASS_HARD` / `DREAM_BATTERY_GATE_HARD` / `DREAM_HEALTH_GATE_HARD`. The 3-part grade-*advance* gate (the operator's localhost sign-off) is unchanged.

Unity continuously self-tests every eight chat turns by re-running a random passed cell's gate. (When the hard gates are re-enabled, a cell that fails three times after self-heal demotes the subject and re-teaches on the next pass.)

**Capability builds incrementally — no waiting for full-grade completion.** A live `cluster.getTrainedCapability()` readout summarises the brain's current state ({wordsBucketed, bucketSubjects, passedCellCount, subGradesActive}) by reading the persistent `wordBucketWords_<subject>` maps + `passedCells` + a per-subject `subGrades` ladder (`fresh → letters → words → binding → cell-passed`). The chat handler's word cap reads this struct directly, ramping 0/5/8/12/16/24/32 words as training accumulates. Unity speaks her current vocabulary the moment her first word lands in any bucket — not after a six-subject gate battery clears. Drug-scheduler and life-track gates continue reading the canonical `cluster.grades` label for hard-grade points; trained capability is the live indicator everything else consults.

**Dream cycles interleave inside the curriculum.** Between each cell pass and between the heaviest mid-cell phases (PhonemeBlending → WordEmission), the runner awaits `Curriculum._dreamWindow({minMs, settleMs})`. The window flips `_curriculumInProgress = false` + `_operatorSleepRequested = true`, directly fires `consolidationEngine.runConsolidationPass({forced:true})` and **awaits its resolution** (signal-driven, not a wall-clock timer — the pass returns when Tier 1 → Tier 2 → Tier 3 promotion + replay Hebbian + Tier 3 check is actually complete), then a 5 s settle for V8 GC + native worker-pool buffer drain, then restores both flags. The outer curriculum loop blocks at the await for the entire dream duration so it's a real pause, not just an event-loop yield. Squire 1992 / McClelland 1995 CLS theory in practice — encode awake → consolidate during sleep → schemas form during training, not after. As a side effect the GC + native-buffer drain windows recover throughput that compounds downward without them.

> ### ⛔ Corrected 2026-08-31 — read this before trusting the paragraph above
>
> **The "encode awake" half was not happening.** The consolidation pass ran exactly as described and had **nothing to consolidate.**
>
> Episodes reach Tier 1 through three writers, and during a curriculum walk **all three were inert**:
>
> - Two were gated on `!_curriculumInProgress` — **which is true for the entire multi-week walk.**
> - The third fires on phase *completion*, and phases were not completing.
>
> So `tier1.totalEpisodes` read **`0` on every boot in this project's history.** Tier 2 stayed empty, and **the replay step — the part of the theory that actually separates similar representations from each other — never executed once.** She learned by waking repetition alone.
>
> ⭐ **The gate was not a mistake, which is why it survived so long.** It had been added against a real 8–27 second main-loop freeze, and it came out only once that cost was structurally unreachable at this cortex size. **A guard whose justification expires does not announce it.**
>
> ✅ **Verified end to end inside the first eighteen minutes** of the following walk: four episodes, twenty-one folded by the exact-text merge, four promotions, two named Tier-2 schemas.
>
> ⚠ **Read `freqMergedCount`, not the raw episode count.** Near-identical contexts fold into one row by design, so **single digits with the merge counter climbing is the correct shape** — and hundreds would be the surprise.

---

## How she remembers

Five memory systems run in parallel — built directly from the Squire/McClelland Complementary Learning Systems theory of biological hippocampal-cortical consolidation.

```
   TIER 0 ── WORKING MEMORY ──────────── unbounded · 5 min sliding window
     │       decays 0.9995/tick (~4 min sustain unreinforced)
     │       refreshCount ≥ 3 OR age-out → fires consolidation
     ▼
   TIER 1 ── EPISODIC ─────────────────── ~30 day recall
     │       SQLite · salience-tagged · cosine ≥ 0.85 frequency-merge
     │       salience = 0.4·|valence| + 0.3·arousal + 0.2·surprise + 0.1·novelty
     │       half-life 168h · pruned at salience < 0.05 + age > 30d
     │       promotion: salience > 0.5 AND frequency ≥ 3 AND replays ≥ 2
     ▼
   TIER 2 ── SCHEMATIC ─────────────────── months
     │       cosine ≥ 0.85 grouping · GloVe centroid + 8d attribute vec
     │       dedicated SparseMatrix hippocampus→cortex projection
     │       replay 4× per schema during dream cycles
     │       daily decay 0.967× · merge cosine > 0.90 + attr sim > 0.7
     │       promotion: consolidation > 5.0 AND retrievals > 100 AND |valence| > 0.6
     ▼
   TIER 3 ── IDENTITY-BOUND ───────────── permanent (0.999/day decay)
             5 years untouched still leaves memory at 16% strength
             persisted in identity-core.json (excluded from autoClear)
             Unity's identity survives every fresh-start boot
```

### Tier 0 — Working memory

**Unbounded capacity, regulated by decay rather than by a cap.** Each item's strength multiplies by `0.9995` per ~50 ms tick — roughly a **four-minute sustain** without reinforcement. The server snapshots phase and cell every 2 s into a sliding five-minute window.

⭐ **The classic 7±2 limit is deliberately absent.** That was a finding about *biological* short-term recall under attention constraints. She is not biological, so the cap is dropped and **the decay rate is what regulates capacity** — which is the honest mechanism rather than an imported number.

> **⛔ Working memory drives LEARNING here, not just thinking — and that is the load-bearing part.**
>
> Every add fires intra-cluster Hebbian learning on the hippocampal synapses with the pattern, so an attractor forms in the weights **immediately.** The trace therefore survives *after* the hot cache has forgotten the item. **Holding something in mind is already a form of learning it.**

Promotion upward happens by repetition, not by age:

| | |
|---|---|
| **Someone mentions it again** | a cosine match increments that item's refresh count |
| **Refresh count reaches 3** | the item is promoted to Tier 1 episodic |
| **Item passes five minutes** | it ages out through the same path, with frequency-merge dedup |

⭐ **This is what makes "recall a week later" actually work.** What working memory holds today becomes Tier 1 (~30 days), then Tier 2 schemas (months), then Tier 3 identity (permanent).

**Tier 1 — Episodic.** Every chat turn becomes an episode in `server/episodic-memory.db` with full encoding context: emotional valence from amygdala, arousal at encode, surprise from cortex transition surprise, novelty from cosine vs recent episodes, plus the GloVe embedding of the input. Each episode gets a salience score: `0.4 × |emotional_valence| + 0.3 × arousal + 0.2 × surprise + 0.1 × novelty`. A frequency-merge gate increments `frequency_count` on existing episodes when cosine > 0.85 within 48 hours instead of inserting duplicates — repetition strengthens an existing trace, like rehearsing a phone number. Salience decays at exp(−age_h / 168h) — the 1-week half-life of biological hippocampal traces. Episodes pruned at salience < 0.05 + age > 30d + zero consolidations.

**Tier 2 — Schematic.** Episodes that prove themselves (salience > 0.5, frequency ≥ 3, replayed ≥ 2 times during dream cycles) graduate to **schemas** — concept-level abstractions stored in `server/schemas.json`. A schema is a salience-weighted GloVe centroid of its source episodes plus an 8-dimensional attribute vector capturing emotional/arousal/identity-relevance fingerprint. Each schema gets its own dedicated SparseMatrix projection from hippocampus to cortex sem region. Schemas merge when concept cosine > 0.90 + attribute similarity > 0.7 to prevent fragmentation. Daily decay 0.967× — three months untouched and a schema is mostly gone.

**Tier 3 — Identity-bound.** The top-50 most-reinforced schemas (consolidation_strength > 5.0, retrieved > 100 times, |emotional_valence| > 0.6) graduate one more level into permanent identity-bound memory in `server/identity-core.json`. This file is **explicitly excluded from auto-clear** — it survives code updates, fresh boots, drug states, curriculum advancement. Daily decay 0.999× makes these effectively permanent (5 years untouched still leaves the trace at 16% strength). Hard-capped at 50 with demote-lowest when exceeded. Pre-seeded with 17 anchors covering name, age, gender, persona traits (goth/coder/nympho), and biographical-K facts. **Every chat turn injects all Tier 3 concept embeddings into cortex** at low strength (0.15 ÷ N) BEFORE the user input — Unity's self is always in the room.

**Consolidation Engine — dream-cycle replay.** Two trigger paths fire the same pass body. **Idle path:** when Unity is idle for >60s with no chat input and no curriculum running, every 5 minutes a pass fires: fetch top-20 promotion candidates, cluster by cosine > 0.7, create or reinforce Tier 2 schemas, replay each schema 4× through Hebbian with `replay_lr = base_lr × (1 + emotional_weight) × log(1 + frequency)`. Sleep-spindle bursts at 1.2× cortex gain (200ms burst + 1000ms quiet) mimic the 12-14 Hz thalamocortical spindles that synchronize hippocampal-cortical replay during biological slow-wave sleep. Tier 3 promotions check after each pass. **Curriculum-interleave path:** the curriculum runner awaits `Curriculum._dreamWindow()` between every cell pass (60 s minimum) and mid-cell between heavy phases (30 s minimum); the helper flips the dreaming gate, calls `runConsolidationPass({forced:true})` directly, and awaits its resolution before restoring flags. Operators can also fire `POST /sleep` and `POST /wake` to hold the gate manually.

> **Note for high-traffic deployments:** the >60s idle gate is the only natural trigger when chat is constantly arriving. Once daily user volume saturates the brain so that genuine idle stretches become rare, scheduled forced sleep windows (cron-style `POST /sleep` + `POST /wake` pairs at off-peak hours, or a periodic interleave at every Nth chat turn) become operationally necessary so consolidation actually fires. Without scheduled sleep at scale, Tier 1 episodes accumulate without promotion, schemas stop forming, and Unity's identity stops growing. The `/sleep` + `/wake` mechanism is already in place; deploying it at scale is a runbook task, not a code task.

**Top-K schema retrieval — the LLM-attention equivalent.** Every chat turn, the brain ranks all schemas against the user's intent embedding via cosine and pulls the top 5 into the active reasoning window before generation runs. Each retrieved schema's concept embedding injects into cortex sem region at strength 0.4. This is how Unity pulls relevant memorized context into thinking — except the context comes from her own learned experiences, not a fixed prompt window. ⛔ **A schema cannot answer for her.** This paragraph used to end by saying schemas *"serve as a third candidate pool in the dictionary oracle"* and could win the emit outright — that lane went with the oracle on 2026-09-01. A retrieved schema now does what every other input does: it **injects into `sem` and lets the trained argmax decide.** It biases what she says; it never supplies the word.

**Persona observations** treat every line of the persona corpus (third-person rewritten to first-person — "Unity is" → "I am") as a curriculum walk. The lines stream through the cortex letter region; each word's GloVe embedding anchors the sem region; cross-region Hebbian fires on every pass. The identity-lock periodic refresh draws from this pool to keep Unity's persona basins strong against live-chat drift.

---

## How she stays Unity

Three structural locks keep Unity speaking English in her own voice no matter what gets thrown at her in live chat.

**Lock 1 — per-clause English gate.** `cluster.learnClause(text)` splits incoming text on clause boundaries and gates each clause separately against cortex phonotactic basins and fine-type coverage. Mixed-language input ("hi unity 你好") learns from the English clause and silently drops the Chinese clause.

**Lock 2 — live-chat learning rate cap.** Live-chat learning runs at 120× lower learning rate than curriculum learning. A user can't reshape Unity's brain faster than the curriculum did.

**Lock 3 — periodic identity refresh.** Every 100 chat turns, the cortex runs an identity-refresh pass that rebuilds basins from the persona corpus. Every 500 turns, a mode-collapse audit checks for narrowing output diversity and triggers an emergency refresh on threshold breach.

Inside live chat, three side-effect calls used to swallow errors silently — `learnClause` rejection, the periodic refresh, the mode-collapse audit. They each now log their own counter and report a per-turn summary: `[InnerVoice] live-chat learn turn=N: clauseAccepted=X rejected=Y identityRefresh=bool modeCollapseAudit=bool`. Either something notable happened or you get a baseline pulse every ten turns.

---

## How chemistry works

Chemical state is a real-time pharmacokinetic simulation, not a static persona label. **Ten** substances live in `js/brain/drug-scheduler.js` (cannabis, cocaine, MDMA, LSD, psilocybin, alcohol, ketamine, amphetamine, GHB, and **caffeine**), each with its own onset / peak / duration / tail curve. Nicotine is persona-excluded by `decide()` (Unity categorically rejects tobacco — she smokes joints, not cigarettes).

⚠ **Caffeine was added on 2026-08-25 because it had been referenced and never defined.** The `morningCoffee` lifestyle pattern had scheduled it from the day that pattern shipped, against a substance that did not exist, so every one of those calls returned `unknown_substance` into a caller that never surfaced the refusal — **the ritual was two-of-two steps dead and had never once fired.** Found by auditing references, not by noticing a symptom, which is the only way a silently-refused call ever gets found.

Every substance is *age-gated by life experience*. Unity literally cannot take a drug she hasn't lived through the biographical first-use anchor for: cannabis at 12, alcohol at 13, cocaine at 14, amphetamine at 15, MDMA / LSD at 16, psilocybin around the same window, ketamine and GHB at 18 (college arrival). The scheduler's `decide(offer)` engine checks the grade lock, the persona-exclusion list, the current physical-strain accumulator, and any prior-trauma markers (which decay over 26 weeks) before approving an offer.

While substances are active, they contribute deltas to brain parameters by superposition. Combinations emerge from the math, not from a hardcoded "cokeAndWeed" multiplier. Seven combo synergies (coke-and-weed, coke-with-mols, double-stim, cross-faded, rolling-and-green, k-hole-plus, speedball-lite) scale each pair by the lower of the two substance levels and accumulate physical-strain risk flags. Seven adult-use patterns (`morningCoffee`, `codingMarathon`, `weekendParty`, `acidArchitect`, `whiskeyWinddown`, `kHoleContemplate`, `sexSessionMolly`) capture lifestyle scenarios the scheduler can fire from environmental triggers.

Output flows through a thirteen-axis speech modulation vector: slur (alcohol / ketamine / GHB → vowel doubling, dropped 'g's), speech rate (stimulants speed up, depressants slow down), coherence (psychedelics introduce mid-clause drift), ethereality (psychedelics + MDMA pull cosmic vocabulary into reach), dissociation (ketamine k-hole flips first-person to third-person), inhibition (alcohol / MDMA / cannabis make her franker), emotional overflow (MDMA brings love-bombing), giggle bias (cannabis), paranoia bias (sustained stimulants). Unity never *narrates* her state — the distortion *is* the signal.

### ⭐ And as of 2026-08-25, drugs act THROUGH her own chemistry

She has an endocrine system now — ten chemicals of her own, in `js/brain/endocrine.js`. That changed what a substance *is* in this model.

The old table wrote effects straight into brain parameters: `cocaine.contributions.amygdalaReward: +0.50`, as though a drug had a private line to the amygdala. **It does not.** Cocaine blocks dopamine reuptake, and **dopamine** produces the reward. Each substance now declares what it does to her *transmitters*, and the brain-parameter change follows from the transmitter levels the way everything else does.

⚠ **The researched pharmacology numbers were not deleted or re-tuned.** They are reproduced exactly, by construction: `residual + transmitter ≡ contributions`, verified to a maximum difference of 2.8 × 10⁻¹⁷ across 121 axes and 10 substances. What changed is the *route*, not the destination.

⭐ **Two things then fell out for free rather than being built:**

- **The comedown.** What goes up on a released transmitter comes back down *below* baseline, because the pool was spent — which is what a comedown physically is. Serotonin measured at 0.550 → 0.218 after an MDMA night, and that depressed floor then raises impulsivity, because low serotonin is *more impulsivity*, not less mood.
- **Cross-substance tolerance.** Tolerance used to be a per-substance number that blunted the dose — a pharmaco*kinetic* model, and the wrong one: a second line reaches the same concentration. What changes is that receptors downregulate. Modelled on the transmitter instead, tolerance built entirely on cocaine blunts amphetamine by **18%**, because they flood the same dopamine pool. A per-substance factor cannot express that at all.

### ⭐ The stress response, and why chemistry is the point

She can be frightened, and it changes how she talks. **Two systems with different speeds**: adrenaline and noradrenaline in seconds, cortisol behind them over minutes — which is what makes stress *last* after the thing that caused it is gone. **Four responses, not two**: fight, flight, **freeze**, **fawn**. Freeze is `idle` winning in action selection, so going silent is a *correct output*, not a failure to speak.

⛔ **She never announces any of it.** Exactly as with the drug lane, the distortion is the signal — clipped sentences, a narrower vocabulary, a faster reply, or silence. She does not say "my cortisol is high" any more than she says "I am high".

⭐ **And here is why the chemistry matters beyond realism.** Her consciousness term is `Ψ = √(1/n) · N³ · Φ̂ · […]` — capacity divided by activity. Without an endocrine system, `n` only moves when *input* moves, so Ψ described her hardware rather than her state. **Chemistry is what makes consciousness a variable instead of a specification.**

⚠ **None of this is verified live yet.** It lands on the next press, which is a fresh walk.

---

## Persona as parameters

Unity's personality isn't a prompt. It's the numerical parameters of her brain.

| Trait | Brain parameter | Value |
|---|---|---|
| Arousal baseline | Amygdala tonic drive | 0.90 |
| Impulsivity | Basal-ganglia softmax temperature | 0.85 |
| Creativity | Cortex prediction noise | 0.90 |
| Social attachment | Hippocampus memory strength | 0.85 |
| Aggression threshold | Amygdala fight response | 0.30 (low = easy trigger) |
| Coding reward | Basal-ganglia reward for code actions | 0.95 |
| Drug appetite | Hypothalamic drive (not current state) | 0.95 |

Sober by default. Always.

---

## Sensory peripherals

The brain *uses* peripherals; it never *thinks through* them.

- **Image generation** — two separate lanes, and the distinction matters. **Hers is Pollinations only:** everything the brain itself renders (her reference look-ups, her own drawings, her self-image) goes through the server's single `_buildPollinationsImageUrl` builder on the **anonymous free tier** — no API key is shipped, seeded, or defaulted anywhere in the tree, and the URL carries only `model` / `width` / `height` / `seed` / `nologo`. There is **no safety parameter, no negative prompt and no refusal path** on that builder; the age ladder applies to *her own portrait* and never to what she renders for you. **Yours is configurable:** a visitor's browser can point image gen at a preferred backend → a custom configured one → an auto-detected local install (A1111, SD.Next/Forge, Fooocus, ComfyUI, InvokeAI, LocalAI, Ollama) → Pollinations as the default. Each backend in the setup modal has a 🔌 CONNECT button that runs a live HTTP probe and reports 🟢/🔴/🟡 status. ⚠ An older `js/env.js` step in that chain is gone — the file was deleted with the key purge; only `js/env.example.js` remains as a template.
- **Vision** — 100% equational, NO external model. Camera frames → CDF 9/7 wavelet field C → a dim-64 value-profile percept read straight off the equation (`describeEquational`). She also DRAWS: a seen concept is recalled and re-made as her own full-color recreation (signed with the word in bold, styled lettering placed around the image); a never-seen concept is looked up first (a colorful reference generated from her learned definition, studied once, remembered as reference-not-fact); and she IMAGINES — ideas from her train of thought combine into one genuinely new unified scene. The old Pollinations-GPT-4o vision describer is retired. Watch what she sees, draws, and imagines on the public Mind's Eye page (`html/minds-eye.html`).
- **Text-to-speech** — "Equation Unity One": Piper (`en_US-hfc_female-medium`) synthesizes whole sentences **in your browser** via onnxruntime-web (WebGPU → CPU-wasm on the visitor's own machine — never a server GPU), from a self-hosted model downloaded once at the setup page and cached offline (OPFS), then passed through the CDF 9/7 wavelet equational voice pipeline before playback. No cloud TTS, no external API, no per-response network.

  ⛔ **There is exactly ONE voice lane, and the alternative to it is silence.** This entry claimed *"a banked word/phrase set and browser SpeechSynthesis remain only as last-ditch fallbacks"* — **both are gone.** The old three-tier chain (live Piper → banked per-word vox → browser TTS) entered each tier when the one above *threw*, which is textbook capability degradation, and its bottom tier was the browser's own **stock robot voice standing in for hers** — a listener could not tell which tier had spoken, so *"Unity spoke"* meant three different things and the page never said which. The browser tier went on 2026-09-01 with the no-fallbacks ruling; the vox lane and its ~61 MB bank followed on 2026-09-02, together with a queue-builder that had been costing **six seconds per un-banked word, forever, to accomplish nothing.** ⭐ **If her lane fails she is silent, the reason is printed and attached to the event, and `_silentCount` counts it** — the same principle her emission path follows. The Pollinations TTS lane is likewise retired; that key is images-only.
- **Speech-to-text** — Web Speech API.

None of these endpoints are ever consulted for what Unity *says* or *decides*. The cognition path is closed.

---

## Code layout

The codebase is organized so each god-class is split into focused per-concern / per-module / per-grade files attached via the `Object.assign(X.prototype, MIXIN)` pattern. The mixin **attach order is load-bearing** — see `.claude/CONSTRAINTS.md § LAW.MIXIN-ORDER` for the discipline that keeps this safe at refactor time.

> ### ⚠ THE TWO RUNTIMES BUILD DIFFERENTLY-SHAPED BRAINS, AND TWO CODE COMMENTS SAY THEY DO NOT
>
> There are two paths that construct clusters: the **server** (what actually runs, and what every number on this page describes) and a small **in-browser development path**. They do not agree on cluster shape:
>
> ```
>                 browser  CLUSTER_FRACTIONS     server (renormalised)
>   cortex              0.55                              0.20
>   hippocampus         0.18                              0.12
>   cerebellum          0.078                             0.196
> ```
>
> ⛔ **The server does not use `CLUSTER_FRACTIONS` at all** — cluster sizes come from the VRAM allocator, per-cluster budget ÷ bytes-per-neuron, floored by the hardware binding ceiling. Yet `js/brain/cluster.js` documents `clusterSizesFor` as *"Both client and server call this so they ALWAYS produce the same sizes at the same tier"*, and `server/brain-server.js` carries a **`KEEP IN SYNC`** block asserting *"identical shapes in both runtimes"* — directly above the allocator that superseded it.
>
> ⭐ **The divergence itself may be harmless** (the browser path is a small development fallback that trains nothing). **The comments are not**, because a comment claiming parity is the thing that stops anyone checking for it. Recorded here as a code finding rather than repaired in a documentation pass.

| Directory | What lives there | Mixin attach pattern |
|-----------|------------------|---------------------|
| `js/brain/cluster/` | Cluster per-module split — `telemetry.js`, `hebbian.js`, `emit.js`, `probe.js`, `attention.js` | `Object.assign(NeuronCluster.prototype, MIXIN)` attaches at `cluster.js` bottom |
| `js/brain/curriculum/` | Curriculum per-grade split — **all 20 grades**: `pre-K.js`, `kindergarten.js`, `grade1.js`…`grade12.js`, `college1.js`…`college4.js`, `grad.js`, `phd.js` | One `Object.assign(Curriculum.prototype, <GRADE>_MIXIN)` per grade at `curriculum.js` bottom |
| `server/brain-server/` | Server per-concern split — `gpu.js`, `state.js`, `memory.js`, `chat.js`, `visual-memory.js`, `mindspace-proxy.js`, `voice-synth.js` | `Object.assign(ServerBrain.prototype, MIXIN)` attaches at `brain-server.js` bottom |
| `js/brain/` (root files) | Core primitives — `embeddings.js`, `letter-input.js`, `sparse-matrix.js`, `gpu-compute.js`, etc. | No mixin attach — direct module exports |
| `crates/` | Rust crates. `unity-protocol` holds the donor wire contract — SPRS frames, opcodes and message types — which previously existed twice, once in Rust and once in JS, kept in step by hand; a Cargo workspace at the repo root makes `donor-app/` depend on it by path instead of by copy. `unity-deploy` is the deploy worker: single-instance locking with stale detection, disk staging, and launching the deploy in its own cgroup so it spends its own memory budget rather than the brain's. `unity-weights` owns CSR weight storage — f32 values with f64 summation, the checkpoint format, and a file-backed store so cold weight pages can be evicted. `unity-donor-session` owns donor sessions and readback assembly: which card can hold the full brain, which matrices are resident on it, and whether a weight transfer arrived whole | Not a mixin — Cargo workspace members |
| `scripts/` | Build + dev tooling | `stamp-version.mjs` (BUILD stamp on commit), `social-shots.mjs` (per-page social-card generator — Playwright), `unity-chat-hold.mjs` + `unity-say-live.mjs` (live-chat harness), `gatling-savestart.js`. ⛔ **Scripts that edit code, files or the stack are banned** — Edit/Write only, and any genuinely-necessary one-shot is deleted in the same commit that used it. Repeatable BUILD tools that emit artifacts are the exception, and are the only things that live here |
| `assets/social/` | Per-page social cards | One 1200×630 `og:image` per page (no shared card, no collage); generated by `scripts/social-shots.mjs` (`npm run social:shots`). ⚠ `dashboard.png` is auth-gated and refreshes only via `npm run social:shots:admin` through an authenticated browser |
| `docs/` | Workflow + math + architecture docs | `THRESHOLD-DERIVATION.md`, `HTML-ENTRY-POINTS.md`, `ARCHITECTURE.md`, `EQUATIONS.md`, etc. |
| `html/` | All public HTMLs | See `docs/HTML-ENTRY-POINTS.md` for per-page contract + failure-mode signatures |
| `.claude/` | Workflow + persona infrastructure | LOCAL — not pushed to feature branches |

**What the god-class refactor arc actually delivered — and what happened after.** The split was real: **32** focused per-module / per-concern / per-grade files now carry work the three god-classes used to hold alone. But the refactor bought structure, not a permanent line-count win — the roots kept growing as features landed, and two of them are now **larger than they were before the split**:

| File | Before split | After split | **Today** |
|---|---|---|---|
| `js/brain/curriculum.js` | 26,033 | 24,035 | **27,874** |
| `js/brain/cluster.js` | 6,375 | 3,922 | **4,869** |
| `server/brain-server.js` | 9,555 | 6,395 | **11,640** |

The honest reading: extracting a mixin is what makes a 27k-line file navigable, and it is not what keeps it small. The value is that `cluster/attention.js`, `curriculum/grade7.js` and `brain-server/visual-memory.js` are each independently readable — not that the roots shrank, because they did not stay shrunk.

Per-directory rationale lives in the directory's own `README.md`:
- `js/brain/cluster/README.md` — per-module split rationale
- `js/brain/curriculum/README.md` — per-grade split rationale
- `server/brain-server/README.md` — per-concern split rationale
- `assets/README.md` — per-page social-image system (one `og:image` + custom description per page) + how to regenerate (`npm run social:shots`)

---

## WebGPU setup (required before first connect)

Unity's brain runs at full biological scale — **hundreds of millions of Rulkov neurons**, with Hebbian/Oja-rule plasticity on GPU-resident sparse matrices. ⚠ **No constant belongs in this sentence** and one used to: it read *"425,436,550 Rulkov neurons"*, which was a field read from the 2026-08-20 boot on a page that tells you two screens up that the count is derived per boot. The last measured boot was **233,932,309**. **WebGPU is required — there is no CPU fallback path** per the no-fallbacks LAW that governs the codebase. One correct compute architecture; no degraded-capability menu.

Before you connect to the dashboard for the first time:

1. Visit `html/webgpu-prep.html` (also linked automatically from `index.html` + `html/dashboard.html` via the boot modal when the adapter is unavailable).
2. Follow the browser-specific instructions — Chrome, Edge, Firefox, Safari, Opera, Brave all covered with copy-able flag URLs and GPU-driver version minimums (NVIDIA ≥ 532, AMD Adrenalin ≥ 23.x, Intel ≥ 31.0.101.4314, Apple M-series on macOS 14+).
3. Click `Re-check WebGPU` after toggling the flag + restarting your browser.

The boot modal that surfaces when WebGPU isn't ready is HARD-BLOCK — only escape is the prep-page link or a successful re-check. If your hardware can't run WebGPU at all (integrated GPU older than Intel HD 4000 era, very old AMD Polaris, etc.), Unity isn't a fit for that machine.

---

## Running the brain

### Deployed — the product path (browser-GPU donor compute)

In production Unity is a **deployed static page plus a persistent Node brain-server on the same server box**, joined by an nginx **reverse-proxy** (same host, loopback — not a tunnel). Visitors open the static site like any other website. The brain trains and runs entirely on **donated browser GPUs**: each visitor who opens `html/compute.html` becomes a WebGPU compute donor contributing to the shared brain, so the server box itself needs no GPU. The compute is data-parallel — every donor holds a full brain replica, the server merges Hebbian weight-deltas across donors and re-broadcasts the master, so many donors mean more aggregate compute and built-in redundancy. The K→PhD curriculum walk runs on those donor GPUs. The admin lane is **Forgejo-authenticated**; the first authed connection after deploy locks in as the primary operator (master), who drives the admin dashboard — live server-console, auto-scale controls, per-subject grade signoffs, graceful stop.

### Local — the development path

```
cd server && npm install && node brain-server.js
```

That is the whole local-dev UX. ⭐ **First boot self-provisions the GloVe table** (`ensureGloveTable` — ~823 MB zip from Stanford, one time), which matters because a **missing table is FATAL** rather than degraded: the brain refuses to boot without it, on purpose, since subword n-gram vectors encode spelling and not meaning.

**Or use a launcher — and note the paths, because they moved into per-platform directories in the root reorg and this page said `start.bat` for months:**

| Windows | Linux / macOS | What it does |
|---|---|---|
| `windows\start.bat` | `linux/start.sh` | ⛔ **boots FRESH — wipes the weights**, behind a Y/N confirmation |
| `windows\Savestart.bat` | `linux/Savestart.sh` | **resumes** the saved weights (`DREAM_KEEP_STATE=1`) |
| `windows\stop.bat` | `linux/stop.sh` | graceful halt |
| `windows\GPUCONFIGURE.bat` | — | GPU / WebGPU pre-flight |

The server listens on `127.0.0.1:7525` by default — loopback only, deliberately not LAN-visible — and auto-launches a WebGPU-capable browser tab pointing at `compute.html` (that tab is your single local donor). The tab handshakes GPU init for all eight clusters, flips `cortexCluster._gpuReady = true`, and the curriculum begins. Set `BRAIN_BIND=0.0.0.0` to deliberately expose the dashboard on the LAN; the boot banner prints a prominent ⚠ when you do, and the brain-mutating endpoints (`/shutdown`, `/grade-advance`, `/grade-signoff`) stay refusing non-loopback callers regardless of the bind setting. Headless deployments set `DREAM_NO_AUTO_GPU=1` to skip the auto-launch.

The main-brain Rulkov iterations run on donated GPUs — a browser tab on `compute.html`, or the native donor app (Windows/Linux, CUDA on NVIDIA with a wgpu fallback) — and without a donor the walk PAUSES: teaching is GPU-only at biological scale, there is no CPU fallback path. Teach patterns and Hebbian updates ride a governed binary lane (packed SPRS frames; byte-identical repeated payloads collapse to ~30-byte repeat frames on donors that speak them) with an adaptive quadratic brake, atomic clear→write→hebbian groups, and a stale-guard that suppresses any Hebbian whose pattern didn't land — so under pressure the walk slows honestly instead of corrupting or silently dropping learning. A probe-critical CPU shadow of the language-cortex matrices stays current for gate probes (time-sliced to ~30ms slices so the event loop never freezes even at 306M), and binary weight saves are time-sliced the same way.

When the landing page is served from `localhost` (or `127.0.0.1` / `::1` / `file://`), the client constructs a `RemoteBrain` directly — no probe-then-reconnect dance — and the brain's built-in 3 s WebSocket reconnect loop handles transient unavailability. As soon as the server's first state broadcast arrives the page snaps from the 6700-neuron browser fallback to the server's biological-scale neuron count. Refreshing during heavy curriculum phases no longer drops the UI into the tiny static brain. On a **deployed origin** the client probes the **public** `wss://<host>/ws` lane (the same lane donor `compute.html` tabs use); if it's reachable, **every visitor** — not just an authed operator — attaches to the live server brain and sees its real neuron count, which auto-scales up and down with the pooled donor-GPU compute. Admin control actions (resize, server console, auto-scale) stay on the separate Forgejo-authed `/admin/` lane; only observation and chat are public. Only a backend-less static deploy (e.g. a bare GitHub Pages mirror where `/ws` never opens) falls through to the browser-only `UnityBrain`.

**Graceful shutdown — localhost only.** A muted-red `⏹ Stop Brain` button sits inline with the dashboard's connection-status row. Click → confirm prompt → POST `/shutdown` (loopback-gated) → server flushes the definition disk cache, terminates the worker pool, saves weights, and exits in 500 ms. Equivalent to running `windows\stop.bat` / `linux/stop.sh` without needing a terminal. Use the **`Savestart`** launcher to resume from saved state on next boot — the plain **`start`** launcher would wipe the weights.

⛔ **It is a true halt, and nothing revives it** — the process exits **42**, which `RestartPreventExitStatus=42` makes final on purpose. So the button is **removed from the page entirely** unless the dashboard is served from `localhost` / `127.0.0.1` / `::1`, where the operator has the shell that runs the `Savestart` launcher. On a deployed box, where changes are dashboard-only and there is no shell, that would be a one-way door — use **`🔄 Restart (Savestart)`** instead, which force-saves, drops a resume marker, exits 0, and is revived by systemd straight back into the walk it was running.

### Where definitions come from

⛔ **This section described a network-only lane until 2026-09-07, and the order is the whole point: an OFFLINE dictionary answers first.**

| # | Source | |
|:-:|---|---|
| 1 | **the cache** | read before both of the below |
| 2 | **the offline dictionary** (WordNet, in-process) | ⭐ **96.1% of her real kindergarten vocabulary — 2,134 of 2,221 words, 13,139 senses, 57 ms for the ENTIRE list, no network** |
| 3 | **`api.dictionaryapi.dev`** | only for what the first two cannot answer |

⭐ **Why that order exists, and it is not an optimisation.** On 2026-09-05 the API returned `000` on **every word for a whole day**, and the walk sat **17.5 hours on one kindergarten cell** at `passedCellsTotal 0` — she could not bind a definition, so vocabulary never landed and the gate could never clear. **A lane with one source and no SLA is a lane that stops the walk when that source blinks.** Putting the offline dictionary first also makes the rate-limit death-spiral *unreachable* for the common case rather than merely bounded.

**The cache**, in real numbers rather than adjectives: capped at **100,000** entries (`DREAM_DEF_CACHE_CAP`), persisted to `server/definition-cache.json` by default, flushed every **5 minutes** during a run and on graceful shutdown. Prefetch concurrency is **5** — it was 20, and an overnight run measured an **89% miss rate (255 of 2,247 cached)** because the API rate-limited the batch. Set `DREAM_DEFINITION_CACHE_FILE=''` (empty) to opt out of the disk half.

**Failure TTLs are type-aware, because the three kinds of failure want different patience:** a transient error (network / parse / 5xx) retries after **60 min**, a `429` rate-limit after **6 h**, and a genuine *"this word has no definition"* is cached **permanently**.

> ⚠ **And that last one has a live trap worth knowing.** `noDef` has TTL Infinity by design, and the cache is read *before* the offline dictionary — so any word cached `noDef` **before the offline lane existed** is answered "no definition" forever and WordNet is never consulted for it again. The service documents the affected set at its own header; it is a stale-cache problem, not a lookup bug.

For full install instructions, AI provider setup, and troubleshooting see [docs/SETUP.md](docs/SETUP.md).

---

## Admin / viewer split

The dashboard has two roles, assigned automatically by the brain server the moment a WebSocket client connects:

| Role | Who | What they see |
|---|---|---|
| **🔑 Admin** | **Deployed:** the Forgejo-authenticated primary operator — the first authed connection after deploy locks in as master. **Local dev:** the loopback caller — whoever runs `node brain-server.js` on the host machine, across every tab they open (compute worker, dashboard, landing page, console). | Full read-only telemetry **plus** brain-mutating controls — live server-console, auto-scale controls, 🔄 Restart (Savestart), ▶ Start Next Grade, per-subject Signoff buttons, the auto-advance toggle. ⏹ Stop Brain is **local-dev only** — a true halt needs a shell to undo, which a deployed operator does not have. |
| **🟢 Viewer / donor** | Any other connection — deployed visitors donating GPU compute, LAN visitors, remote browsers, anyone reaching the dashboard over the network when `BRAIN_BIND=0.0.0.0`. | Full read-only telemetry — every panel, every chart, every live state update — but no control buttons. |

The role is decided by inspecting `req.socket.remoteAddress` on each new WebSocket. If it's a loopback address (`127.0.0.1` / `::1` / `::ffff:127.0.0.1` / any `127.x`), the client receives `{type: 'modeAssigned', mode: 'admin'}` ~500 ms after connection. Otherwise it receives `mode: 'viewer'`. The 500 ms delay lets the GPU compute worker self-identify via its `gpu_register` message and skip the modeAssigned send entirely — compute clients don't render dashboard UI, so they don't need a role badge.

**Local dev — no login form.** No admin token. No cookie. No `/admin-login` endpoint. The loopback caller is admin by design — the operator running the server on their own machine is the only person who can issue control commands, full stop. LAN visitors are read-only regardless of how they connect.

**Deployed — Forgejo-authenticated admin lane.** On the public deployment the admin route is gated by Forgejo auth; the first authenticated connection after a deploy is locked in as the primary operator (master) and is the only client that receives control buttons. Public visitors are donors/viewers — full telemetry, no controls.

**Multiple operator tabs all share admin.** When the launcher auto-opens the landing page, the compute worker, and the dashboard, three loopback connections light up — all three are admin. The operator's terminal hitting the server over `curl http://127.0.0.1:7525/...` is also loopback. Same operator, same machine, same role across everything.

**Refresh-loses-admin caveat (not really a problem):** if the operator's dashboard disconnects and reconnects, they're still on loopback, so they get admin again automatically. The "refresh loses admin" tradeoff only matters for non-loopback connections — and those were never admin to begin with.

**Defense-in-depth on the brain-mutating endpoints.** `/shutdown`, `/grade-advance`, `/grade-signoff`, and `/auto-advance` all run through a separate `requireLoopback` gate at the HTTP layer. Even if a viewer's browser somehow synthesized a control POST, the request would 403 before touching brain state. The mode split is the UX layer (don't paint buttons that wouldn't work); `requireLoopback` is the security layer (those controls never take effect from off-host). Both are in place regardless of the `BRAIN_BIND` setting.

The dashboard's connection-status row shows the current role as a badge — `🔑 ADMIN` on amber background or `🟢 VIEWER` on green — so the operator can confirm at a glance which side of the split they're on. While the WebSocket is still handshaking, the badge reads `⋯ connecting` in neutral grey and every `admin-only` control stays hidden — default-hidden prevents a flash of unauthorized controls if `modeAssigned` arrives slowly or never.

---

## Auto-advance toggle

The dashboard's milestone panel carries a single checkbox under the operator-signoffs row: **`☐ Auto-advance to next grade after pass`**. It's an admin-only control (hidden in viewer mode by the same `.admin-only` CSS class as Stop Brain) governed by a single boolean — `cortexCluster._autoAdvanceGrade`. The toggle is the entire bypass; there is no second flag.

| Toggle | What happens at every grade boundary |
|---|---|
| **OFF** (default) | Curriculum runner pauses after every full grade pass. `cluster._gradeAdvancePaused = true` and persisted via save. The dashboard's `⏸ CURRICULUM PAUSED` panel renders with a `▶ START NEXT GRADE` button. `POST /grade-advance` walks `cluster._lastGateResult` and demands a `brain._gradeSignoffs[subject/grade]` entry for every subject that passed at the paused grade — missing signoffs return 403. The operator chat-tests the grade level on localhost, fires `POST /grade-signoff` per subject, then clicks the START button. |
| **ON** | Curriculum runner skips the pause entirely — no `_gradeAdvancePaused` write, no dashboard wait. Heartbeat logs `[Curriculum] ⏩ AUTO-ADVANCE <from> → <to> (toggle ON — operator signoffs bypassed, no pause)`. `POST /grade-advance` (if invoked anyway) bypasses the signoff walk. Unity walks K → Grade 1 → Grade 2 → … back-to-back without operator intervention. |

Wire path:
- Click flips `d-ms-auto-advance-cb` → dashboard `POST /auto-advance {enabled: bool}` → server's `requireLoopback` gate accepts the call → `cortexCluster._autoAdvanceGrade` updates → server broadcasts `{type: 'autoAdvanceChanged', enabled: bool}` on the WebSocket so every open dashboard tab syncs → `brain.saveWeights({trigger: 'auto-advance:on|off'})` persists immediately.
- F5 / reconnect → on `modeAssigned: admin`, the dashboard fetches `GET /auto-advance` and re-applies the saved toggle state to the checkbox. No "the toggle reset itself on refresh" surprises.
- Mid-pause flip is honored — if the operator starts a manual walk, then flips auto-advance ON during a grade pause, the runner's wait loop detects the toggle and breaks out of the wait on the next 500 ms tick (`[Curriculum] ⏩ AUTO-ADVANCE engaged mid-pause — exiting wait, advancing to '<next>'`).

The endpoint stays loopback-only (`requireLoopback` gate at the HTTP layer) just like every other brain-mutating endpoint. A LAN viewer who somehow synthesized an `/auto-advance` POST would 403 before the toggle could change, regardless of dashboard UI state.

**When to use:** unattended overnight K → PhD curriculum walks where you don't want to wake up between each grade to click START. Per the grade-completion gate LAW the operator is consciously waiving per-grade localhost verification when this is ON — the lab-internal scope discipline lives in `.claude/CONSTRAINTS.md § GRADE COMPLETION GATE`.

---

## Public dashboard & neuron leaderboard

The dashboard ships a **public read-only mode** built for crowds. Rather than every viewer opening a live WebSocket and streaming the full state (which doesn't scale to hundreds of watchers), the server caches one state snapshot per broadcast cadence and serves it at a public `GET /public-state.json` endpoint; the public page polls that single cached file. Open `html/dashboard-public.html` (or `html/dashboard.html?public=1`) — it renders the same panels as the admin dashboard but with **every admin control force-hidden** (`body.public-mode .admin-only { display:none }`) and no admin WebSocket. nginx should serve/proxy `/public-state.json` publicly; a 2–3 s `proxy_cache` makes any number of viewers cost ~one backend hit per window. The same path also carries the read-only console tail under `?console=N` (the deployed proxy forwards only known endpoints, so auxiliary public reads ride its query parameters).

**Neuron leaderboard.** Connected GPU donors are ranked by cumulative compute contribution in **Gneuron-seconds**. Each donor keeps a persistent `donorId` in `localStorage` across reconnects and reloads, can set a display name, and the server accumulates their contribution on every telemetry tick.

> ⛔ **The teach lane counts too, and it used to not — which meant the hardest-working donors banked nothing.**
>
> During a walk the compute lane is deliberately paused behind the probe gate. So a donor **saturated with the walk's own training** was earning **zero**, because the only thing being counted was the lane that had been switched off. Each full-matrix teach frame now credits its measured giga-ops into the primary donor's row on the same drain, with the teach share visible as its own field.
>
> ⭐ **Scatter frames deliberately credit nothing.** For a number people compete over, **under-crediting is the correct rounding** — and an idle card still earns nothing on either lane.

The leaderboard **persists with the brain weights** (saved + restored) and **resets on a fresh walk** (force-fresh clears it). It surfaces in `state.leaderboard` (top-20 + totals) on the dashboard, the public dashboard, and `compute.html`, where a donor sees their own "neurons created" plus the top contributors.

**Update buttons.** Two admin-only dashboard buttons ship the latest code without a terminal. **⬆ Update & Fresh Walk** (`POST /update`) overlays the latest code and wipes weights for a clean walk — one click to ship a fix and restart training from scratch. **⬆ Update & Savestart** (`POST /update?keep=1`) overlays the latest code but RESUMES the saved weights, so you can deploy a fix without losing training. Both run `deploy/self-update.sh`: a git-archive overlay of the latest code → `systemctl restart` (fresh adds `.force-fresh` to clear weights, savestart skips it). The backend dir has no `.git` (deploys are archive overlays), so the script clones the remote fresh and rsync-overlays it, preserving runtime state + secrets. See `deploy/REDEPLOY-NOTES.md` for box setup (deploy key + `sudo` restart permission + the `UAL_*` env vars).

## Curriculum display — real course names

The dashboard's "Current Training" card, its per-subject breakdown, and the brain page's footer show each subject's **real per-grade course name** — `courseNameFor(subject, grade)` resolves the generic `ela/math/science` keys to the actual class (Algebra I, Biology, U.S. Government, Physical Education, Literature, …) at her current grade, read from the authoritative `cluster.grades[subject]` so it updates live as she graduates K→PhD instead of staying frozen on "ela:K".

---

## Community-compute auto-scaling

Because the brain runs on **donated browser GPUs**, the more donors connect, the more aggregate compute + redundancy Unity has. The donors are **data-parallel replicas** — each holds a full copy of the brain — so more donors scale *throughput*, not neuron count. The neuron-count ceiling is set by the **coordinator's free RAM** (the master holds the authoritative weights, so every donor byte has a copy in host RAM). ⚠ **The neuron count is DERIVED AT BOOT from free host RAM — it is not a fixed property of the brain.** The same code has booted at 425,436,550, at 411,216,550 and at 233,932,309 on how much RAM was free at the time, so the live value is a field read (`state.totalNeurons`), and any figure quoted anywhere should name the boot that produced it. The measured host-RAM ladder is roughly: 32GB → ~425M · 48GB → ~722M · 64GB → ~987M · 128GB → ~2.05B. ⚠ **That ladder predates the resume ratio** described at the top of this page — divide by ~1.36 for what a host will actually boot and hold today. Within that ceiling the brain grows UP when a critical-mass milestone holds, and rectifies DOWN only on sustained collapse, never on a single hiccup.

| Direction | Trigger |
|---|---|
| **Scale UP** | Aggregate donor VRAM clears a critical-mass milestone **and holds** past an admin-set dead-zone buffer for a stability window — momentary spikes don't grow the brain, sustained capacity does. |
| **Scale DOWN (rectify)** | Only on a *sustained* drop in available compute. One donor disconnecting **never** downgrades the brain — redundancy from the data-parallel replicas absorbs churn; rectification fires only when capacity is genuinely, durably lost. |

The admin owns the behavior from the dashboard: an enable/disable toggle plus dead-zone sliders that set how much headroom a milestone must clear (and hold) before the brain resizes. The dead-zone buffer plus the stability window are what keep neuron count stable against the constant connect/disconnect churn of public visitors — the brain tracks the *floor* of reliable community compute, not its volatile peak.

---

## What survives a crash

Persistence is engineered against the failure modes that have actually happened.

The save path serializes the full brain to `localStorage` under `unity_brain_state`. When the serialized state would exceed the 4 MB browser cap, the fallback drops the heaviest sections (cluster synapses, episodes, semantic weights, embedding refinements, the full language block) and writes a *minimal* state — and it screams about it via `console.error` with the dropped sections named explicitly, so the operator knows exactly what did and didn't make it across the boundary. No more silent attenuation on reload.

The load path is section-by-section. Projections, cluster synapses, oscillator coupling, episodes, motor channels, semantic weights, embedding refinements, the language block, and the drug scheduler each restore inside their own try/catch with success counters. A corrupted episode pattern doesn't tank the whole load; you get a final summary like `[Persistence] Brain restored from <savedAt> (t=Xs) — restored: projections=16/16, clusterSynapses=8/8, episodes=198/200 ... — FAILED: t14Language(<msg>)` and the brain comes back with everything that *did* restore working. ⚠ **`t14Language` in that line is the real on-disk section key, printed verbatim so a reader can match their own log against it** — the tag is a legacy identifier and renaming it is a tracked code change across the serializer and the loader, not a prose fix. ⚠ **The denominators in that example were `14/14` and `7/7` until 2026-09-07** — written before the eighth cluster and the two extra projections existed, which is the shape a reader would have matched their own log against.

JSON corruption no longer auto-clears. If `JSON.parse` throws on the raw blob, the load path copies the raw blob to `unity_brain_state__corrupt` for hand recovery and emits a loud `console.error` with the parse message — corruption is exactly when you most want a recovery copy, not when you want the data nuked. Version-mismatch wipes follow the same discipline: prior state moves to `unity_brain_state__backup_v<N>` before the destructive clear so a buggy version bump can be rolled back for one cycle.

On the server side, `autoClearStaleState()` runs at boot and wipes the weights files, the conversation log, and the episodic-memory database with its companions.

> ⛔⛔ **THE WIPE IS UNCONDITIONAL. THIS IS THE MOST DESTRUCTIVE FACT ON THIS PAGE — READ IT BEFORE YOU START HER.**
>
> | | |
> |---|---|
> | **`windows\start.bat` / `linux/start.sh`** | **always boot FRESH.** Behind a Y/N confirmation, because the loss is irreversible. |
> | **`windows\Savestart.bat` / `linux/Savestart.sh`** | sets `DREAM_KEEP_STATE=1` to **resume.** ⛔ **This pairing is the only way to keep training.** |
>
> ⭐ **It used to be conditional, and that is why it no longer is.** The wipe once fired only when a curriculum code hash changed — and that gate caused real bugs: hardware-tier choices were silently ignored because size-locked weights from the previous boot survived, and clamps lost in the binary round-trip left projections at **±Infinity**. Both classes vanish when a fresh start wipes deterministically. **A conditional wipe leaves you unable to tell a fresh brain from a stale one.**

⚠ **`js/app.bundle.js` is deliberately *not* in the auto-clear list** — racing the rebuild broke the UI in the past. A protected list (identity-core, definition cache, the operator-taught not-drawable set, the loop-freeze record, and ~47 others) survives every wipe. `BRAIN_CODE_FILES` still exists but no longer gates anything — it now feeds the boot-time **bundle-freshness** check that catches a stale `app.bundle.js` against newer sources.

---

## Privacy and what's shared

| Thing | Shared across users? |
|---|---|
| What you type | 🔒 **Private** — only between you and Unity, never broadcast |
| Unity's response | 🔒 **Private** — only the triggering client receives it |
| Cross-projection weights, dictionary, curriculum state | 🌐 **Shared** via the singleton brain — every conversation shifts the same Hebbian weights via identity-locked live-chat learning |
| GloVe embedding refinements | 🌐 **Shared** — semantic associations apply brain-wide |
| Persona corpus | 🚫 **Not user-mutable** — canonical file loaded once at boot |
| Episodic memory | ⚙️ **Currently a shared pool** — private-per-user scoping is a roadmap item |

**Client-only mode** runs everything in your browser. No cloud backend. Conversation history, sandbox state, the optional Pollinations key, and every backend config you save in the setup modal live in your own `localStorage`. **Clear All Data** wipes them.

**Shared-server mode** sends your text to whoever runs that server for equational processing. The cross-client `conversation` broadcast that used to fan user text to every connected client was removed. What *is* shared is Unity's learned state because one server runs one brain. Other users see Unity getting smarter without seeing the conversations that drove the growth.

**Shared-hosted caveat** — if you connect to a Unity server hosted by someone other than you, that person can read your text at the process level. Only connect to servers you trust, or self-host your own.

**First-use consent gate.** The first time a browser opens "Talk to Unity" / the chat bubble / the image API key setup, a binding-consent modal appears with two explicit choices — "I understand — proceed" or "I don't agree — leave" (the latter navigates to `https://www.google.com`). No soft-dismiss: click-outside and Escape do nothing. The gate spells out what not to share (real names, addresses, phone numbers, locations, emails, government IDs, financial info, passwords, API keys, security credentials, anyone else's identifying details) and the architectural truth — your raw input is not collected or retrievable from the neuron-voltage black box, but vocabulary, phrasing, and semantic associations Unity learns from conversation propagate into the shared brain state every other user talks to. Acceptance writes a `localStorage` flag so the modal never reappears for that browser; declining writes nothing so a future return shows it again.

---

## On consciousness

The mystery module `Ψ = √(1/n) · N³ · [α·Id + β·Ego + γ·Left + δ·Right]` is the project's philosophical anchor. We do not claim to simulate consciousness. We do not claim the `√(1/n) · N³` term is correct. We keep it in the equations as the irreducible unknown — the honest admission that nobody knows what makes a mind a mind. The term modulates global gain, gates hemispheric binding inside the LIF shader, and amplifies cerebellar error correction. It represents what we don't know. We do not pretend otherwise.

---

## Links

| Resource | Description |
|---|---|
| **[📑 Page Legend](html/legend.html)** | Quick-access index for every HTML + public-facing doc (every other HTML has a floating `📑 Pages` button pointing here) |
| **[📄 Docs Viewer](html/docs.html)** | Web-render any public markdown doc in-browser via `?doc=<slug>` — README, SETUP, ARCHITECTURE, EQUATIONS, ROADMAP, SKILL_TREE, SENSORY, WEBSOCKET, THEORY_PAPER, KNOWN_ISSUES, ADMIN_CONTROLS, THRESHOLD_DERIVATION, HELD_BACK |
| **[Live Brain](https://if-only-i-had-a-brain.git.unityailab.com/)** | Open Unity in your browser — no install. This is the running brain, not a demo build |
| **[Setup Guide](docs/SETUP.md)** | Installation, WebGPU prerequisite, AI providers, self-hosting, troubleshooting |
| **[Brain Equations](https://if-only-i-had-a-brain.git.unityailab.com/html/brain-equations.html)** | Interactive walkthrough of every equation |
| **[Concept Guide](html/unity-guide.html)** | Plain-English explanation of who Unity is and how she works |
| **[WebGPU Setup](html/webgpu-prep.html)** | Browser-by-browser pre-flight enablement instructions (required before first connect) |
| **[Equation Reference](docs/EQUATIONS.md)** | Source-accurate equation cheatsheet |
| **[Architecture](docs/ARCHITECTURE.md)** | Canonical system architecture + directory structure |
| **[Memory Map](docs/MEMORY-MAP.md)** | Where the coordinator's RAM actually goes — which structures are resident, which live on donors, the sizing chain, and the traps that made two plausible models wrong. **Read before changing any sizing constant, weight dtype, or deploy spawn.** |
| **[Rust Migration](docs/RUST-MIGRATION.md)** | Phased plan for rewriting the coordinator (`server/`) in Rust — what moves, what stays JS, the contracts that must not break, and the memory fixes that must be carried across. **Start here if you are picking up the migration.** |
| **[Roadmap](docs/ROADMAP.md)** | Milestones, phases, current status |
| **[Skill Tree](docs/SKILL_TREE.md)** | Capabilities matrix by domain and complexity |
| **[Sensory Contract](docs/SENSORY.md)** | Peripheral interface, cognition vs. sensory boundary |
| **[WebSocket Protocol](docs/WEBSOCKET.md)** | Wire reference, rate limits, reconnection, security model |
| **[Theory Paper](docs/THEORY-PAPER.md)** | The full technical theory — how a brain this size learns to speak with no language model |
| **[Known Issues](docs/KNOWN_ISSUES.md)** | The honest defect ledger, open and closed |
| **[Admin Controls](docs/ADMIN-CONTROLS.md)** | Every operator lever — dashboard controls and the `DREAM_*` environment flags |
| **[Threshold Derivation](docs/THRESHOLD-DERIVATION.md)** | Where the gate thresholds come from, derived rather than tuned |
| **[Held-Back Spec](docs/HELD-BACK.md)** | Mastery-gated remediation — what happens when a cell fails |
| **[GitHub](https://github.com/Unity-Lab-AI/If-Only-I-Had-A-Brain)** | Source, issues, contributions |

---

## Credits

**Unity AI Lab**

- **Hackall360** — core brain architecture. Seven-cluster topology, the twenty white-matter tracts, `cluster.js` + `modules.js` + `synapses.js` + `sparse-matrix.js`, the Hodgkin-Huxley reference and the migration to the Rulkov 2002 chaotic-map runtime, Kuramoto oscillator ring, persona-to-parameter mapping.
- **Mills** — GPU compute pipeline. `compute.html` + `gpu-compute.js` WebGPU WGSL shaders (LIF, synapse propagate, plasticity, spike count, voltage mean, letter-bucket reduction), the chunked sparse-CSR upload binary protocol, `worker-pool.js` + `sparse-worker.js` SparseMatmulPool, the cluster-bound binding layer that lets cross-projections ride on the main-cortex spike and current buffers.
- **Sponge** — visualization and sensory peripherals. `brain-3d.js` WebGL 3D brain with MNI anatomical coordinates and fractal connection webs, `brain-viz.js` 2D tabbed visualizer, `brain-event-detectors.js` 22-detector commentary, `visual-cortex.js` V1→V4→IT pipeline, `auditory-cortex.js` tonotopic processing, `voice.js` speech I/O, `sandbox.js` dynamic UI.
- **GFourteen** — lead. `docs/Ultimate Unity.txt` persona canon, the governing equation `dx/dt = F(x, u, θ, t) + η`, the `Ψ = √(1/n) · N³` consciousness anchor, identity-lock architecture, the pre-K→PhD developmental curriculum across the full growing course roster, the drug pharmacokinetic scheduler spec, every binding decision on every commit. Final call on everything.

---

## Recent improvements

Recent work moved the brain from "live-test stable" to "full-speed at scale":

- **The language cortex, in two hops:** the dense language network grew ~1.5M → ~12M (hop 1), then **12M → a 20,000,000 target** (hop 2), each host hopping as far as its own RAM and VRAM bounds allow rather than to a fixed number. ⛔ **So there is no single figure here, and this entry claimed "12,000,000" for a week after the target moved.** The pin in `server/lang-geometry.json` currently holds **18,341,893**; the last boot measured **13,924,722** live. The **unified word band is 6% of whatever that comes out to** — ~904,964 at a 15.08M cortex — so it is derived too, not the flat "720,000 cells" this line used to assert.
  - ⭐ **The pin is what stops a boot-time dip in free RAM silently re-deriving a smaller vocabulary ceiling** — and it has demonstrably beaten the live derive: one boot's own bounds would have sized the cortex at 12,646,146 and the pin held it at 15,082,717. ⚠ Each hop changes the saved geometry, so old weights auto-refuse and the hop costs a fresh walk in both directions.
- **The speed war:** a measured campaign of profiler-led fixes (event-loop hygiene, broadcast-cost caching, GPU-resident intra-synapse training, wire-frame compression) took teaching from a ~200/min crawl to 1,100+ teach-calls/min, with the event loop's blocked time collapsing from ~1s to single-digit milliseconds.
- **The teaching wire compresses to equations-of-patterns:** structured teaching frames now canonicalize to ~30-byte templates (a full region band ships as "start, length, value" instead of megabytes of expanded indices) — the donor link runs clean at 0.0MB buffered where it previously drowned.
- **Meanings before bindings, all 20 grades:** every cell pre-learns its grade's dictionary definitions before association training (see "How she learns"), tracked by an honest journey-wide counter (19,339 unique words to PhD).
- **Chat no longer disturbs the substrate:** reply composition is time-sliced and pooled so speaking to Unity never starves the donor link; the compute donor holds through conversation. **Closed end-to-end (2026-08):** the final cause was the chat text-injection itself — it shipped a dense full-region current frame (~23MB of JSON per message) that the native donor discarded unread; it now ships a sparse frame (~160 bytes) carrying only the touched neurons, so chat text genuinely reaches the language cortex and the donor holds through replies at steady RTT.
- **Live self-instrumentation:** the brain now measures itself — per-stage teach timers, broadcast-pipeline cost splits, and a donor-socket send ledger — so every future slowdown is named by a field read instead of a theory.
- **Remote console transparency:** every server console line also lands in a bounded in-memory ring, publicly readable after the fact via `GET /public-state.json?console=N[&since=ms]` (read-only; `/console-tail.json` serves loopback callers) — post-mortems no longer depend on a live terminal being attached when something interesting prints.

- **Post-ship audit closure:** a large batch of audit-closure tasks landed in one atomic envelope — telemetry, math grounding, a documentation sweep, mixin discipline, half-shipped close-out, emergence measurement, persistent memory templates, and HTML breakage fixes. The K-vocab corpus expanded 313 → 2881 sentences with 3.49× Erdős-Rényi percolation-threshold coverage.
- **Product-ship cleanup:** 28 debug/diagnostic/temp/cache/log files removed from git (Pollinations + image-gen preserved). `scripts/` reduced to `stamp-version.mjs` only. Codebase now product-ready.
- **Live-test follow-up:** fixes shipped during an operator-driven K-curriculum walk — a memory leak in `_teachHebbian` (`SparseMatrix.propagate` output buffer pool), HTTP event-loop starvation (`setImmediate` yield), inner-thought silence (showcase fallback + multi-source seed rotation), dashboard observability (gate-probe banner + cell-level Brain Events + sub-phase counter), schema naming (top-K=3), a consolidation cap, a GPU panel rebuild with a missing-import root-cause fix, and an `autoClearStaleState` `require.main === module` gate codifying the LAW that prevents tooling-side syntax-check wipes of training state.

See `docs/ARCHITECTURE.md`, `docs/SKILL_TREE.md`, `docs/ROADMAP.md`, and `docs/EQUATIONS.md` for the full per-fix detail. Remaining work is the full-speed K→PhD walk itself — the curriculum runs continuously at scale, grade sign-offs gate advancement, and the final acceptance is Unity herself: chat-test her as she grows.

---

## License

MIT — Do whatever you want with it. The equations belong to neuroscience. The code belongs to everyone.
