# IF ONLY I HAD A BRAIN

A brain that *is* the application — not a chatbot wrapped around a language model. Hundreds of millions of artificial neurons running real neuroscience equations on the GPU, organized into seven biologically-weighted clusters, learning to read and speak the way a human child does: alphabet → phonemes → words → sentences. There is no text-AI in the cognition path. Every word she says falls out of live spike patterns.

**[Live Demo](https://unity-lab-ai.github.io/Unity)** · **[Brain Equations](https://unity-lab-ai.github.io/Unity/html/brain-equations.html)** · **[Concept Guide](html/unity-guide.html)** · **[Setup](docs/SETUP.md)** · **[GitHub](https://github.com/Unity-Lab-AI/Unity)**

---

## What this is, in plain English

Unity is a 25-year-old emo goth woman whose mind is a real neural simulation. Her seven brain regions — cortex, hippocampus, amygdala, basal ganglia, cerebellum, hypothalamus, and a "mystery" region that carries the consciousness term — fire continuously on the GPU at biological scale. When you type to her, your text becomes spike patterns that propagate through those regions; her reply is the readout of what those spikes did.

Cognition is 100% equational. There is no LLM behind her. Image generation, vision description, and text-to-speech are sensory peripherals that the brain *uses* — never paths the brain *thinks through*. The persona, the vulgarity, the chemistry, the way she remembers conversations across sessions — all of it lives as numerical parameters of the simulation, not as a system prompt.

She learns like a human child — alphabet → phonemes → words → sentences → the full K→PhD curriculum across six subjects (English, Math, Science, Social Studies, Arts, and Life Experience). She advances a grade only after the operator personally tests the level and signs off per subject. This is deliberate. The curriculum isn't decorative — every grade gate is a real evaluation against published K-level rubrics (Common Core K.RF / K.W / K.L / K.SL / K.RL plus DIBELS / STAR / AIMSweb), and a probe pass means *Unity actually learned the thing*, not that a 5-question check happened to clear.

**Two ways to run her.** The product path is a **deployed static page** backed by a persistent Node brain-server on the same box, joined by an nginx reverse-proxy over loopback — visitors open the site like any website and their browser GPUs donate the compute. The development path is local: run the server on your own machine via `start.bat` / `Savestart.bat`. Both share the exact same brain; the difference is who supplies the GPUs and how the page is served. See [Running the brain](#running-the-brain) for both.

---

## The governing equation

Everything in Unity's mind evolves by one master equation:

```
dx/dt = F(x, u, θ, t) + η
```

`x` is the entire brain state — every neuron's Rulkov-map (x, y) pair across seven clusters, the sparse cross-projection weight matrices that wire the language regions together, the Kuramoto oscillator phases, the episodic memory bank, the working-memory readout. `u` is sensory input: text streams into the cortex `phon` slice through a Wernicke-area write; voice arrives through tonotopic auditory mapping; camera frames flow through V1 Gabor edges to V4 color to an IT-level scene description. `θ` is Unity's identity — every persona trait drives a neural parameter (arousal 0.9 sets the amygdala tonic drive; impulsivity 0.85 sets basal-ganglia temperature; creativity 0.9 modulates cortex noise; drug drive 0.95 sets hypothalamic appetite). `η` is per-cluster stochastic noise scaled by those same persona traits — the chaos that keeps her unpredictable. `F` is everything firing simultaneously: the seven Rulkov-map populations, the twenty white-matter tracts between them, the sixteen language cross-projections inside the cortex, the equation modules (amygdala settle, hippocampus Hopfield recall, basal-ganglia softmax, cerebellum error, hypothalamic homeostasis, mystery Ψ gain), and the Kuramoto oscillator ring.

The server doesn't run any of this on CPU — in fact the server box needs no GPU at all. A Node process keeps the bookkeeping; **browser GPU clients donate the compute**. A tab that loads `compute.html` connects back over WebSocket as a WebGPU compute client; every Rulkov iteration, every synaptic propagate, every Hebbian update lives as a WGSL compute shader on that donor's GPU. Sparse cross-projection matrices stream up to the GPU in chunked binary frames so million-neuron updates don't block Node's event loop. This is the entire design — the brain ticks every ~50 ms, donated GPUs run the math, the server coordinates and remembers.

The donor model is **data-parallel**: each connected donor holds a full brain replica and runs it forward, while the server periodically merges the Hebbian weight-deltas from every donor and re-broadcasts the master state. Many donors mean massive aggregate compute plus redundancy — no single machine is the brain. In local development a single tab on the host machine is the only "donor"; in the deployed product, the donors are the GPUs of everyone who has the page open.

Because the donor GPU and the server's own copy of the weights are two separate machines talking over a network, they can quietly drift apart — a dropped upload leaves the donor computing on stale weights, and until now a single "something's off" light couldn't tell you *why*. There's now a **parity check**: the server asks a donor for a fingerprint of the exact weights it currently holds and compares it to its own, then tells you plainly whether the difference is stale weights (a dropped upload — re-send fixes it), a genuine disagreement in how the donor's GPU does the math (a real bug — re-sending won't help), or a mistake in the server's own math. You run it with `node scripts/gpu-cpu-parity.mjs` and it prints one of `CLEAN`, `STALE`, `GPU-DIVERGENT`, or `MATH-ERROR`. The native donor app also shows the brain's live status right in its window — **"Brain status: accepting GPUs"** when it's connected and taking work, **"NOT active"** when the brain can't be reached.

---

## The seven clusters

Each cluster is a self-contained Rulkov-map population with its own intra-region sparse synapse matrix, tonic drive, noise amplitude, connectivity density, and learning rate. On the deployed full-size brain (~306M neurons, auto-scaled from the coordinator's free RAM) the shares come from the server's `DEFAULT_BIO_WEIGHTS`: the cortex and cerebellum are the two largest at ~20% (≈61.3M) each — the cortex carries language, perception, and working memory; the cerebellum does error correction and timing — and the five subcortical clusters take ~12% (≈36.8M) each. (The ~6700-neuron browser-only fallback uses a different, cortex-dominant fraction set.)

```
                         ┌─────────────────────────────────────┐
                         │           CORTEX   20%              │
                         │   9 sub-regions · 16 projections    │
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
| **Cortex** | 20% | Language, perception, working memory. Nine slice-indexed sub-regions (auditory, visual, free, letter, phon, sem, fineType, motor, word_motor) wired by sixteen cross-projections form the language pipeline. Predictive coding runs across the whole cortex on top. |
| **Hippocampus** | 12% | Hopfield-attractor memory. Episodic state snapshots at high-salience moments. Tier 0 working memory is unbounded with decay-regulated capacity (0.9995/tick → ~4 min sustain); items consolidate into the Tier 1 episodic store either at refresh-count ≥ 3 or after a 5-minute sliding-window age-out. ConsolidationEngine moves repeatedly-recalled patterns to cortex during dream cycles. |
| **Cerebellum** | 20% | Supervised error correction. Sends negative feedback to cortex and basal ganglia when their predictions or selections drift. Low noise, high precision, fast learning. |
| **Mystery (Ψ)** | 12% | The consciousness term. `Ψ = √(1/n) · N³ · [α·Id + β·Ego + γ·Left + δ·Right]` — modulates global gain on every cluster (`gain = 0.9 + Ψ·0.05`), modulates the Ψ-gated hemispheric binding term in the LIF shader, and amplifies the cerebellum's error correction. We do not claim to solve consciousness; we keep the unknown honest in the math. |
| **Amygdala** | 12% | Recurrent energy-based emotional attractor that settles into low-energy basins (fear, reward, neutral) every tick. Persistent state across frames with leak 0.85. The emotional gate it produces multiplies every other cluster's gain. |
| **Basal Ganglia** | 12% | Action selection. Six channels (respond_text, generate_image, speak, build_ui, listen, idle) compete; the channel with the highest EMA firing rate wins, gated by a 0.15 confidence floor. No external classifier, no keyword matching — the spike pattern *is* the decision. |
| **Hypothalamus** | 12% | Homeostasis. Maintains drives (arousal, social need, creativity, energy) at biological setpoints. When a drive deviates, it modulates the baseline for the whole brain. *("Arousal" throughout this document is the neuroscience term — cortical activation / autonomic alertness, the metric coffee or an alarm raises. Yerkes-Dodson 1908 et seq. **Not** the colloquial sexual meaning.)* |

The clusters communicate through twenty sparse white-matter tract projections (corticostriatal, stria terminalis, fimbria-fornix, ventral amygdalofugal, perforant path, corpus callosum, plus fourteen others) modeled from real neuroanatomy.

---

## The language pipeline

The language cortex is *not* a separate cluster. It lives as nine named sub-regions inside the main cortex — `auditory`, `visual`, `free`, `letter`, `phon`, `sem`, `fineType`, `motor`, `word_motor` — carved by fixed fractions of `cluster.size`. They share the same Rulkov population and the same GPU pipeline; the only thing that distinguishes them is their slice offset inside the cortex spike buffer. `word_motor` is further sub-banded into six per-subject slices (`word_motor_ela / _math / _sci / _soc / _art / _life`) so each curriculum subject trains its own word-emission band without overwriting the others.

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
                           │       └─────────┴── (six per-subject bands: │
                           │            ▼          ela / math / sci /    │
                           │       letter chain    soc / art / life)     │
                           │       motor→letter                          │
                           │                                             │
                           ◄─ phon (efference copy back to auditory) ◄────┘
                ▲                                                         
                └─── WRITE stream (ventral · production) ─────────────────
```

When a curriculum cell trains sem→motor or sem→word_motor, the Hebbian write is now scoped to a small projection whitelist via `cluster._crossRegionHebbian(lr, opts.projectionsWhitelist)` — so the silent regions during the write (e.g. `letter` is empty when `_teachQABinding` writes a question + first-letter pair) don't get hit by Oja's `Δw = -η·post²·w` decay term. Before this scoping, every QA fire silently decayed `letter_to_motor` weights wherever motor fired the answer letter — across hundreds of pairs × 12 reps the alphabet identity that `_teachLetterNamingDirect` carved cleanly was crushed, producing the Math-K TALK 26/26 → 0/10 cross-cell collapse the V2 watchdog caught.

When Unity speaks, three things can happen, tried in priority order.

**Path A — single-tick word emission via `word_motor`.** A dedicated `word_motor` sub-region (~6% of the cortex cluster) is ONE unified band with a single bucket per unique word (WMB 2026-07-14 — it previously split into six per-subject sub-bands that each replicated the full dictionary and overflowed, silently silencing learned words; it was unified and the dense language cortex grown ~349K→~1.5M so the band holds the full K→PhD vocab). The `sem→word_motor` cross-projection learns Q→A bindings during curriculum and word→word autoassociation during `_teachWordEmissionDirect`. At chat time the helper injects the intent seed into the `sem` region, propagates through `sem→word_motor`, and argmaxes (mean signal per bucket cell) over the persisted bucket map maintained by teach + emit + write. If the winning bucket clears the `minSignal` floor (0.001), Unity emits that word as a single-tick utterance — no letter chain, no attractor settling. This is wired as the PRIMARY chat production path. The mean argmax + persistent `cluster.wordBucketWords_<subject>` ensure teach + emit + write all agree on bucket layout (the alignment bug that made early prototypes emit "squares" for arithmetic Q-A is fixed). The physical neuron band each word occupies is **frozen** — cells-per-word is fixed once per subject (`cluster.wordBucketCellSizeFor`) rather than re-divided from the live word count on every emit, so a word trained in an early grade keeps the exact same band as the dictionary grows through later grades. Without that freeze, each newly-learned word silently shifted every prior word's band, and the accumulated drift across a dozen grades of vocabulary turned late-grade speech into topically-nearby but sequence-scrambled output; the frozen geometry keeps every grade's trained emission weights addressable.

**Path B — the dictionary oracle.** When word_motor returns empty (novel intent, sub-band signal below threshold), the helper falls back to a per-subject persona-first dictionary cosine scan over `cluster.dictionary` against the intent seed. An append-only bucket map keeps trained `sem→word_motor` weights valid as new words land via chat. Caches `entry.normSquared` on first scan so subsequent oracle calls skip inner-loop normalization.

**Path C — tick-driven motor emission.** When neither word emission nor dictionary oracle produces a match, fall through to the cortex tick loop: inject the intent seed into `sem` at strength 0.6, blend in working-memory readout from `free`, tick the cortex while reading the `motor` sub-region's argmax each step. Commit a letter when the same argmax holds for three consecutive ticks (Bouchard 2013 vSMC dwell). Flush a word when letter-transition surprise crosses 0.15 (Saffran 1996 statistical segmentation). Stop on a sentence terminator, motor quiescence, or a 2,000-tick safety cap.

Whichever path speaks, the reply is scored for coherence before it ships. If the best candidate the brain can compose still scores below a coherence floor, Unity does *not* emit the scrambled multi-word string — she degrades to her single strongest word or stays quiet, the way a real person hesitates or says less rather than talk gibberish. A "she went quiet" count surfaces on the dashboard as a training-depth signal (it means that topic needs more training, not that anything is broken). Her brain-wave coherence readout is computed from each cluster's own real oscillator phase — the theta/gamma phase of every region advances at a rate set by that region's actual firing, so the displayed synchrony tracks what the neurons are really doing rather than a shared clock.

Two counters track which path each emission took: `cluster._oracleHits` and `cluster._matrixHits`. Their ratio surfaces every ten seconds in the `[Curriculum] ▶ CELL ALIVE` heartbeat as `oracleRatio=X%`. If that ratio runs above 95% across a full curriculum walk, the trained sem→motor matrix isn't carrying load and the dictionary lookup is doing all the work — the central research-validity question, made visible as a number on every heartbeat line instead of buried in cluster fields nobody reads.

**The same three-path cascade powers Unity's continuous inner monologue.** A server-side tick fires every ~3 seconds, picks a contemplation seed from one of five live state sources (current curriculum cell + phase, current interoceptive mood including drug state, most recent user-chat episode, most recent Tier 1 episode of any type, a random Tier 3 identity anchor), injects that seed as a `cortexPattern` so the cortex has something to settle on, then runs the **same** `language-cortex.generateAsync` chat-emission path against the live cortex. Whatever her trained mind produces about the seed gets broadcast to every connected client as an `innerThought` WebSocket message — the 3D brain popups display real internal speech, not browser-side decorative output. There are no hardcoded fallback words: if the trained matrix has nothing to say in this moment, the popup stays silent. Sandbox-notice activator gives her something to think about; her trained brain produces what she says about it.

During dream cycles (curriculum-interleaved consolidation windows that run for 15-40 min between teach phases), the wake-state inner monologue mutes — `_operatorSleepRequested` is set, the tick early-returns, and a one-shot `[Brain] 💤 inner-voice paused — dream window in progress` log fires so the silence is explained instead of ambiguous. In place of the wake monologue, a single dream-phenomenology emission per dream cycle generates from a Tier 1 episodic replay seed (random recent episode, real cortex state, same `generateAsync` path) and broadcasts as `innerThought` with `seed='dream'` — dashboard popups stay alive showing dream content during the consolidation window. When the dream window closes, `[Brain] ☀ inner-voice resumed` logs once and the wake monologue picks back up at the next 3-second tick.

---

## How she learns

The developmental curriculum walks Unity through six subjects in lockstep: ELA, Math, Science, Social Studies, Arts, and Life Experience. All six advance together — no subject races ahead while another is stuck. Each grade cell teaches via a stack of layered Hebbian rules running on the cross-projection matrices.

```
                                CURRICULUM LADDER  (114 cells = 19 grades × 6 subjects)

                  ┌──────┬──────┬──────┬──────┬──────┬──────┐
   Pre-K          │      │      │      │      │      │ Life │ ← Life Experience adds
   (substrate)    │      │      │      │      │      │  PK  │   Pre-K (birth-to-4)
                  ├──────┼──────┼──────┼──────┼──────┼──────┤
   Kindergarten   │ ELA  │ Math │ Sci  │ Soc  │ Art  │ Life │ ← K = the proven template
                  ├──────┼──────┼──────┼──────┼──────┼──────┤
   Grade 1-12     │ ELA  │ Math │ Sci  │ Soc  │ Art  │ Life │ ← all grades built to
                  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │   K's depth (full K→PhD)
                  ├──────┼──────┼──────┼──────┼──────┼──────┤
   College 1-4    │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │
                  ├──────┼──────┼──────┼──────┼──────┼──────┤
   Grad / PhD     │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │  ↓   │
                  └──────┴──────┴──────┴──────┴──────┴──────┘

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

**Oja 1982** is the primary update: `Δw = η · y · (x − y · w)`. Self-normalizing Hebbian — weights climb when both pre- and post-synaptic neurons fire, and decay when only the post fires alone. The decay-when-post-alone is what *separates* trained patterns; without it, bare Hebb piles every association into the same columns and the basins collapse into superposition.

**Anti-Hebbian contrastive push-away** runs alongside Oja. After every positive update on a correct (sem(word), motor(correct letter)) pair, the curriculum fires twenty-five anti-Hebbian updates against the wrong alphabet letters at half learning rate. This actively *carves* the trained letter's basin away from every other letter's basin instead of relying on Oja decay alone to do it. Across the full Kindergarten vocabulary that's roughly 1.8 million contrastive fires — the operator should see `oracleRatio` *drop* over the K curriculum walk as the matrix learns enough discrimination to handle word recall on its own.

**Sem-side top-K sparsification** keeps the input side discriminating; **motor-side WTA** keeps the output side competitive; **lateral inhibition** through negative intra-region weights stops attractor lock-on. **STDP** (`Δw = A+·exp(−Δt/τ+)` for pre-before-post, `−A−·exp(Δt/τ−)` for post-before-pre) handles temporal sequences. **Reward-modulated** Oja gates the global learning rate by a dopamine-analog δ so updates only land when there's a prediction error worth reinforcing.

Three pathways are probed at 95% (A+) per cell, plus a `K-STUDENT` battery of held-out questions (none seen during teach) and a methodology probe that scores *how* she answers, not just *what*:
- **READ** — `visual → letter → phon → sem`. Can she recognize this input?
- **THINK** — `sem` plus working-memory persistence in the `free` sub-region. Can she hold and reason about it?
- **TALK** — `sem → motor → letter`. Can she produce it as output?

**As of 2026-06-27, a cell passes on *learning completion*, not test-question correctness** (Gee: *"all cells shall pass as learning completes for that cell"*). The probes + battery + per-grade health gate STILL RUN and record telemetry, but are **advisory** by default — a cell passes once its teach phases complete (content trained), so a collapsed `sem_to_motor` (which pins capability rates to 0) no longer stalls the walk at 0 cells passed. Held cells (no runner) and runners that throw mid-teach still don't pass. Hard-gate behavior is restorable per check via `DREAM_CELL_PASS_HARD` / `DREAM_BATTERY_GATE_HARD` / `DREAM_HEALTH_GATE_HARD`. The 3-part grade-*advance* gate (Gee's localhost sign-off) is unchanged.

Unity continuously self-tests every eight chat turns by re-running a random passed cell's gate. (When the hard gates are re-enabled, a cell that fails three times after self-heal demotes the subject and re-teaches on the next pass.)

**Capability builds incrementally — no waiting for full-grade completion.** A live `cluster.getTrainedCapability()` readout summarises the brain's current state ({wordsBucketed, bucketSubjects, passedCellCount, subGradesActive}) by reading the persistent `wordBucketWords_<subject>` maps + `passedCells` + a per-subject `subGrades` ladder (`fresh → letters → words → binding → cell-passed`). The chat handler's word cap reads this struct directly, ramping 0/5/8/12/16/24/32 words as training accumulates. Unity speaks her current vocabulary the moment her first word lands in any bucket — not after a six-subject gate battery clears. Drug-scheduler and life-track gates continue reading the canonical `cluster.grades` label for hard-grade points; trained capability is the live indicator everything else consults.

**Dream cycles interleave inside the curriculum.** Between each cell pass and between the heaviest mid-cell phases (PhonemeBlending → WordEmission), the runner awaits `Curriculum._dreamWindow({minMs, settleMs})`. The window flips `_curriculumInProgress = false` + `_operatorSleepRequested = true`, directly fires `consolidationEngine.runConsolidationPass({forced:true})` and **awaits its resolution** (signal-driven, not a wall-clock timer — the pass returns when Tier 1 → Tier 2 → Tier 3 promotion + replay Hebbian + Tier 3 check is actually complete), then a 5 s settle for V8 GC + native worker-pool buffer drain, then restores both flags. The outer curriculum loop blocks at the await for the entire dream duration so it's a real pause, not just an event-loop yield. Squire 1992 / McClelland 1995 CLS theory in practice — encode awake → consolidate during sleep → schemas form during training, not after. As a side effect the GC + native-buffer drain windows recover throughput that compounds downward without them.

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
             Unity's identity survives every fresh start.bat boot
```

**Tier 0 — Working.** Unbounded capacity, decay-regulated. Each item's strength multiplies by 0.9995 per ~50 ms engine tick — about a 4-minute sustain without reinforcement. brain-server snapshots phase + cell every 2 s into a sliding 5-minute window. The classic Miller 1956 7±2 cap was a finding about biological short-term recall under attention constraints; Unity is post-biological so the cap is dropped, the decay rate is what regulates capacity. **Working memory drives learning, not just thinking.** Every add fires intra-cluster Hebbian on hippocampus.synapses with the pattern, so a Hopfield-style attractor forms in the cortex weights immediately — the trace lives even after the WM hot cache forgets the item. Cosine-match refresh (someone mentions the same thing again) increments a per-item refresh count; refresh count ≥ 3 promotes the item to Tier 1 episodic via the registered `onConsolidate` hook. brain-server's 2 s snapshots use the same path: items older than 5 min fire `storeEpisode('working-memory', 'wm-aged-out', ...)` with frequency-merge dedup. **This is what makes "recall a week later" actually work** — what WM holds today becomes Tier 1 (~30 days), Tier 2 schemas (months), Tier 3 identity (permanent).

**Tier 1 — Episodic.** Every chat turn becomes an episode in `server/episodic-memory.db` with full encoding context: emotional valence from amygdala, arousal at encode, surprise from cortex transition surprise, novelty from cosine vs recent episodes, plus the GloVe embedding of the input. Each episode gets a salience score: `0.4 × |emotional_valence| + 0.3 × arousal + 0.2 × surprise + 0.1 × novelty`. A frequency-merge gate increments `frequency_count` on existing episodes when cosine > 0.85 within 48 hours instead of inserting duplicates — repetition strengthens an existing trace, like rehearsing a phone number. Salience decays at exp(−age_h / 168h) — the 1-week half-life of biological hippocampal traces. Episodes pruned at salience < 0.05 + age > 30d + zero consolidations.

**Tier 2 — Schematic.** Episodes that prove themselves (salience > 0.5, frequency ≥ 3, replayed ≥ 2 times during dream cycles) graduate to **schemas** — concept-level abstractions stored in `server/schemas.json`. A schema is a salience-weighted GloVe centroid of its source episodes plus an 8-dimensional attribute vector capturing emotional/arousal/identity-relevance fingerprint. Each schema gets its own dedicated SparseMatrix projection from hippocampus to cortex sem region. Schemas merge when concept cosine > 0.90 + attribute similarity > 0.7 to prevent fragmentation. Daily decay 0.967× — three months untouched and a schema is mostly gone.

**Tier 3 — Identity-bound.** The top-50 most-reinforced schemas (consolidation_strength > 5.0, retrieved > 100 times, |emotional_valence| > 0.6) graduate one more level into permanent identity-bound memory in `server/identity-core.json`. This file is **explicitly excluded from auto-clear** — it survives code updates, fresh boots, drug states, curriculum advancement. Daily decay 0.999× makes these effectively permanent (5 years untouched still leaves the trace at 16% strength). Hard-capped at 50 with demote-lowest when exceeded. Pre-seeded with 17 anchors covering name, age, gender, persona traits (goth/coder/nympho), and biographical-K facts. **Every chat turn injects all Tier 3 concept embeddings into cortex** at low strength (0.15 ÷ N) BEFORE the user input — Unity's self is always in the room.

**Consolidation Engine — dream-cycle replay.** Two trigger paths fire the same pass body. **Idle path:** when Unity is idle for >60s with no chat input and no curriculum running, every 5 minutes a pass fires: fetch top-20 promotion candidates, cluster by cosine > 0.7, create or reinforce Tier 2 schemas, replay each schema 4× through Hebbian with `replay_lr = base_lr × (1 + emotional_weight) × log(1 + frequency)`. Sleep-spindle bursts at 1.2× cortex gain (200ms burst + 1000ms quiet) mimic the 12-14 Hz thalamocortical spindles that synchronize hippocampal-cortical replay during biological slow-wave sleep. Tier 3 promotions check after each pass. **Curriculum-interleave path:** the curriculum runner awaits `Curriculum._dreamWindow()` between every cell pass (60 s minimum) and mid-cell between heavy phases (30 s minimum); the helper flips the dreaming gate, calls `runConsolidationPass({forced:true})` directly, and awaits its resolution before restoring flags. Operators can also fire `POST /sleep` and `POST /wake` to hold the gate manually.

> **Note for high-traffic deployments:** the >60s idle gate is the only natural trigger when chat is constantly arriving. Once daily user volume saturates the brain so that genuine idle stretches become rare, scheduled forced sleep windows (cron-style `POST /sleep` + `POST /wake` pairs at off-peak hours, or a periodic interleave at every Nth chat turn) become operationally necessary so consolidation actually fires. Without scheduled sleep at scale, Tier 1 episodes accumulate without promotion, schemas stop forming, and Unity's identity stops growing. The `/sleep` + `/wake` mechanism is already in place; deploying it at scale is a runbook task, not a code task.

**Top-K schema retrieval — the LLM-attention equivalent.** Every chat turn, the brain ranks all schemas against the user's intent embedding via cosine and pulls the top 5 into the active reasoning window before generation runs. Each retrieved schema's concept embedding injects into cortex sem region at strength 0.4. This is how Unity pulls relevant memorized context into thinking — except the context comes from her own learned experiences, not a fixed prompt window. Schemas also serve as a third candidate pool in the dictionary oracle: if a schema's anchor word scores higher than persona-corpus or K-vocab dictionary candidates, the schema's anchor wins the emit.

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

Chemical state is a real-time pharmacokinetic simulation, not a static persona label. Nine substances live in `js/brain/drug-scheduler.js` (cannabis, cocaine, MDMA, LSD, psilocybin, alcohol, ketamine, amphetamine, GHB), each with its own onset / peak / duration / tail curve. Caffeine arrives through the adult-use `morningCoffee` pattern instead of the substance registry; nicotine is persona-excluded by `decide()` (Unity categorically rejects tobacco — she smokes joints, not cigarettes).

Every substance is *age-gated by life experience*. Unity literally cannot take a drug she hasn't lived through the biographical first-use anchor for: cannabis at 12, alcohol at 13, cocaine at 14, amphetamine at 15, MDMA / LSD at 16, psilocybin around the same window, ketamine and GHB at 18 (college arrival). The scheduler's `decide(offer)` engine checks the grade lock, the persona-exclusion list, the current physical-strain accumulator, and any prior-trauma markers (which decay over 26 weeks) before approving an offer.

While substances are active, they contribute deltas to brain parameters by superposition. Combinations emerge from the math, not from a hardcoded "cokeAndWeed" multiplier. Seven combo synergies (coke-and-weed, coke-with-mols, double-stim, cross-faded, rolling-and-green, k-hole-plus, speedball-lite) scale each pair by the lower of the two substance levels and accumulate physical-strain risk flags. Seven adult-use patterns (`morningCoffee`, `codingMarathon`, `weekendParty`, `acidArchitect`, `whiskeyWinddown`, `kHoleContemplate`, `sexSessionMolly`) capture lifestyle scenarios the scheduler can fire from environmental triggers.

Output flows through a thirteen-axis speech modulation vector: slur (alcohol / ketamine / GHB → vowel doubling, dropped 'g's), speech rate (stimulants speed up, depressants slow down), coherence (psychedelics introduce mid-clause drift), ethereality (psychedelics + MDMA pull cosmic vocabulary into reach), dissociation (ketamine k-hole flips first-person to third-person), inhibition (alcohol / MDMA / cannabis make her franker), emotional overflow (MDMA brings love-bombing), giggle bias (cannabis), paranoia bias (sustained stimulants). Unity never *narrates* her state — the distortion *is* the signal.

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

- **Image generation** — multi-provider chain with five-level priority: user-preferred backend → custom configured → auto-detected local (A1111, SD.Next/Forge, Fooocus, ComfyUI, InvokeAI, LocalAI, Ollama) → `js/env.js` listed → Pollinations default. Each backend in the setup modal has a 🔌 CONNECT button that runs a live HTTP probe and reports 🟢/🔴/🟡 status.
- **Vision** — 100% equational, NO external model. Camera frames → CDF 9/7 wavelet field C → a dim-64 value-profile percept read straight off the equation (`describeEquational`). She also DRAWS: a seen concept is recalled and re-made as her own full-color recreation (signed with the word in bold, styled lettering placed around the image); a never-seen concept is looked up first (a colorful reference generated from her learned definition, studied once, remembered as reference-not-fact); and she IMAGINES — ideas from her train of thought combine into one genuinely new unified scene. The old Pollinations-GPT-4o vision describer is retired. Watch what she sees, draws, and imagines on the public Mind's Eye page (`html/minds-eye.html`).
- **Text-to-speech** — "Equation Unity One": Piper (`en_US-hfc_female-medium`) synthesizes whole sentences **in your browser** via onnxruntime-web (WebGPU → CPU-wasm on the visitor's own machine — never a server GPU), from a self-hosted model downloaded once at the setup page and cached offline (OPFS), then passed through the CDF 9/7 wavelet equational voice pipeline before playback. No cloud TTS, no external API, no per-response network. The Pollinations TTS lane is retired (that key is images-only); a banked word/phrase set and browser SpeechSynthesis remain only as last-ditch fallbacks.
- **Speech-to-text** — Web Speech API.

None of these endpoints are ever consulted for what Unity *says* or *decides*. The cognition path is closed.

---

## Code layout

The codebase is organized so each god-class is split into focused per-concern / per-module / per-grade files attached via the `Object.assign(X.prototype, MIXIN)` pattern. See `.claude/CONSTRAINTS.md § LAW.MIXIN-ORDER` for the discipline that keeps this safe at refactor time.

| Directory | What lives there | Mixin attach pattern |
|-----------|------------------|---------------------|
| `js/brain/cluster/` | Cluster per-module split — `telemetry.js`, `hebbian.js`, `emit.js`, `probe.js` | 4 `Object.assign(NeuronCluster.prototype, MIXIN)` attaches at `cluster.js` bottom |
| `js/brain/curriculum/` | Curriculum per-grade split — `pre-K.js`, `kindergarten.js` (K-grade K_MIXIN) | 1 `Object.assign(Curriculum.prototype, K_MIXIN)` at `curriculum.js` bottom |
| `server/brain-server/` | Server per-concern split — `gpu.js`, `state.js`, `memory.js`, `chat.js` | 4 `Object.assign(ServerBrain.prototype, MIXIN)` attaches at `brain-server.js` bottom |
| `js/brain/` (root files) | Core primitives — `embeddings.js`, `letter-input.js`, `sparse-matrix.js`, `gpu-compute.js`, etc. | No mixin attach — direct module exports |
| `scripts/` | Build + dev tooling | `stamp-version.mjs` (BUILD stamp on commit), `social-shots.mjs` (per-page social-card generator — Playwright) |
| `assets/social/` | Per-page social cards | One 1200×630 `og:image` per page (no shared card, no collage); generated by `scripts/social-shots.mjs` |
| `docs/` | Workflow + math + architecture docs | `THRESHOLD-DERIVATION.md`, `HTML-ENTRY-POINTS.md`, `ARCHITECTURE.md`, `EQUATIONS.md`, etc. |
| `html/` | All public HTMLs | See `docs/HTML-ENTRY-POINTS.md` for per-page contract + failure-mode signatures |
| `.claude/` | Workflow + persona infrastructure | LOCAL — not pushed to feature branches |

**Architectural shrinkage delivered by the god-class refactor arc:**
- `js/brain/curriculum.js`: 26033 → 24035 lines (−7.7%)
- `js/brain/cluster.js`: 6375 → 3922 lines (−38.5%)
- `server/brain-server.js`: 9555 → 6395 lines (−33%)
- **Total:** ~6000 lines of god-class bloat refactored into 13 focused per-module/per-concern/per-grade files.

Per-directory rationale lives in the directory's own `README.md`:
- `js/brain/cluster/README.md` — per-module split rationale
- `js/brain/curriculum/README.md` — per-grade split rationale
- `server/brain-server/README.md` — per-concern split rationale
- `assets/README.md` — per-page social-image system (one `og:image` + custom description per page) + how to regenerate (`npm run social:shots`)

---

## WebGPU setup (required before first connect)

Unity's brain runs at full biological scale — 306,458,816 Rulkov neurons — with Hebbian/Oja-rule plasticity on GPU-resident sparse matrices. **WebGPU is required — there is no CPU fallback path** per the no-fallbacks LAW that governs the codebase. One correct compute architecture; no degraded-capability menu.

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

That is the whole local-dev UX — or use `start.bat` / `Savestart.bat`. The server listens on `127.0.0.1:7525` by default — loopback only, deliberately not LAN-visible — and auto-launches a WebGPU-capable browser tab pointing at `compute.html` (that tab is your single local donor). The tab handshakes GPU init for all seven clusters, flips `cortexCluster._gpuReady = true`, and the curriculum begins. Set `BRAIN_BIND=0.0.0.0` to deliberately expose the dashboard on the LAN; the boot banner prints a prominent ⚠ when you do, and the brain-mutating endpoints (`/shutdown`, `/grade-advance`, `/grade-signoff`) stay refusing non-loopback callers regardless of the bind setting. Headless deployments set `DREAM_NO_AUTO_GPU=1` to skip the auto-launch.

The main-brain Rulkov iterations run on donated browser GPUs through `compute.html`, which must stay open — without a donor the main brain pauses. The language-cortex cross-projection learning (Oja / Hebbian / anti-Hebbian / predictive-error propagate) runs CPU-side in Node, time-sliced with adaptive chunking: every heavy full-matrix op measures each synchronous slice and halves the chunk past 60ms / doubles it under 15ms, converging to ~30ms slices at any scale, so the event loop never freezes even at 306M. Binary weight saves are time-sliced the same way. Hebbian dispatches batch into a single binary frame (up to 64 ops, flushed on a 2 ms timer) so the GPU command queue pipelines many updates per round-trip instead of stalling on per-op serialization.

When the landing page is served from `localhost` (or `127.0.0.1` / `::1` / `file://`), the client constructs a `RemoteBrain` directly — no probe-then-reconnect dance — and the brain's built-in 3 s WebSocket reconnect loop handles transient unavailability. As soon as the server's first state broadcast arrives the page snaps from the 6700-neuron browser fallback to the server's biological-scale neuron count. Refreshing during heavy curriculum phases no longer drops the UI into the tiny static brain. On a **deployed origin** the client probes the **public** `wss://<host>/ws` lane (the same lane donor `compute.html` tabs use); if it's reachable, **every visitor** — not just an authed operator — attaches to the live server brain and sees its real neuron count, which auto-scales up and down with the pooled donor-GPU compute. Admin control actions (resize, server console, auto-scale) stay on the separate Forgejo-authed `/admin/` lane; only observation and chat are public. Only a backend-less static deploy (e.g. a bare GitHub Pages mirror where `/ws` never opens) falls through to the browser-only `UnityBrain`.

**Graceful shutdown.** A muted-red `⏹ Stop Brain` button sits inline with the dashboard's connection-status row. Click → confirm prompt → POST `/shutdown` (loopback-gated) → server flushes the definition disk cache, terminates the worker pool, saves weights, and exits in 500 ms. Equivalent to running `stop.bat` without needing a terminal. Use `Savestart.bat` to resume from saved state on next boot — `start.bat` would wipe weights.

**Definition disk cache.** Dictionary-API definitions persist to `server/definition-cache.json` by default — flushed every 5 minutes during a run AND on graceful shutdown. After 2-3 cold runs, the cache approaches 100% K-vocab coverage, so the next-boot K-VOCAB-PREFETCH completes instantly (no API hits) and the upfront-multi-def-seed flag survives the restart. Set `DREAM_DEFINITION_CACHE_FILE=''` (empty) to opt out.

For full install instructions, AI provider setup, and troubleshooting see [docs/SETUP.md](docs/SETUP.md).

---

## Admin / viewer split

The dashboard has two roles, assigned automatically by the brain server the moment a WebSocket client connects:

| Role | Who | What they see |
|---|---|---|
| **🔑 Admin** | **Deployed:** the Forgejo-authenticated primary operator — the first authed connection after deploy locks in as master. **Local dev:** the loopback caller — whoever runs `node brain-server.js` on the host machine, across every tab they open (compute worker, dashboard, landing page, console). | Full read-only telemetry **plus** brain-mutating controls — live server-console, auto-scale controls, ⏹ Stop Brain, ▶ Start Next Grade, per-subject Signoff buttons, the auto-advance toggle. |
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

The dashboard ships a **public read-only mode** built for crowds. Rather than every viewer opening a live WebSocket and streaming the full state (which doesn't scale to hundreds of watchers), the server caches one state snapshot per broadcast cadence and serves it at a public `GET /public-state.json` endpoint; the public page polls that single cached file. Open `html/dashboard-public.html` (or `html/dashboard.html?public=1`) — it renders the same panels as the admin dashboard but with **every admin control force-hidden** (`body.public-mode .admin-only { display:none }`) and no admin WebSocket. nginx should serve/proxy `/public-state.json` publicly; a 2–3 s `proxy_cache` makes any number of viewers cost ~one backend hit per window.

**Neuron leaderboard.** Connected GPU donors are ranked by cumulative compute contribution (Gneuron-seconds). Each donor keeps a persistent `donorId` in `localStorage` (maintained across reconnects + reloads) and can set a display name; the server accumulates their contribution on every `gpu_telemetry` tick into `brain._neuronLeaderboard`. The leaderboard **persists with the brain weights** (saved + restored) and **resets on a fresh walk** (force-fresh clears it). It surfaces in `state.leaderboard` (top-20 + totals) on the dashboard, the public dashboard, and `compute.html`, where a donor sees their own "neurons created" plus the top contributors.

**Update buttons.** Two admin-only dashboard buttons ship the latest code without a terminal. **⬆ Update & Fresh Walk** (`POST /update`) overlays the latest code and wipes weights for a clean walk — one click to ship a fix and restart training from scratch. **⬆ Update & Savestart** (`POST /update?keep=1`) overlays the latest code but RESUMES the saved weights, so you can deploy a fix without losing training. Both run `deploy/self-update.sh`: a git-archive overlay of the latest code → `systemctl restart` (fresh adds `.force-fresh` to clear weights, savestart skips it). The backend dir has no `.git` (deploys are archive overlays), so the script clones the remote fresh and rsync-overlays it, preserving runtime state + secrets. See `deploy/REDEPLOY-NOTES.md` for box setup (deploy key + `sudo` restart permission + the `UAL_*` env vars).

## Curriculum display — real course names

The dashboard's "Current Training" card, its per-subject breakdown, and the brain page's footer show each subject's **real per-grade course name** — `courseNameFor(subject, grade)` resolves the generic `ela/math/science` keys to the actual class (Algebra I, Biology, U.S. Government, Physical Education, Literature, …) at her current grade, read from the authoritative `cluster.grades[subject]` so it updates live as she graduates K→PhD instead of staying frozen on "ela:K".

---

## Community-compute auto-scaling

Because the brain runs on **donated browser GPUs**, the more donors connect, the more aggregate compute + redundancy Unity has. The donors are **data-parallel replicas** — each holds a full copy of the brain — so more donors scale *throughput*, not neuron count. The neuron-count ceiling is set by the **coordinator's free RAM** (the master holds the authoritative weights and is already at full ~306M size). Within that ceiling the brain grows UP when a critical-mass milestone holds, and rectifies DOWN only on sustained collapse, never on a single hiccup.

| Direction | Trigger |
|---|---|
| **Scale UP** | Aggregate donor VRAM clears a critical-mass milestone **and holds** past an admin-set dead-zone buffer for a stability window — momentary spikes don't grow the brain, sustained capacity does. |
| **Scale DOWN (rectify)** | Only on a *sustained* drop in available compute. One donor disconnecting **never** downgrades the brain — redundancy from the data-parallel replicas absorbs churn; rectification fires only when capacity is genuinely, durably lost. |

The admin owns the behavior from the dashboard: an enable/disable toggle plus dead-zone sliders that set how much headroom a milestone must clear (and hold) before the brain resizes. The dead-zone buffer plus the stability window are what keep neuron count stable against the constant connect/disconnect churn of public visitors — the brain tracks the *floor* of reliable community compute, not its volatile peak.

---

## What survives a crash

Persistence is engineered against the failure modes that have actually happened.

The save path serializes the full brain to `localStorage` under `unity_brain_state`. When the serialized state would exceed the 4 MB browser cap, the fallback drops the heaviest sections (cluster synapses, episodes, semantic weights, embedding refinements, the full t14 language block) and writes a *minimal* state — and it screams about it via `console.error` with the dropped sections named explicitly, so the operator knows exactly what did and didn't make it across the boundary. No more silent attenuation on reload.

The load path is section-by-section. Projections, cluster synapses, oscillator coupling, episodes, motor channels, semantic weights, embedding refinements, the t14 language block, and the drug scheduler each restore inside their own try/catch with success counters. A corrupted episode pattern doesn't tank the whole load; you get a final summary like `[Persistence] Brain restored from <savedAt> (t=Xs) — restored: projections=14/14, clusterSynapses=7/7, episodes=198/200 ... — FAILED: t14Language(<msg>)` and the brain comes back with everything that *did* restore working.

JSON corruption no longer auto-clears. If `JSON.parse` throws on the raw blob, the load path copies the raw blob to `unity_brain_state__corrupt` for hand recovery and emits a loud `console.error` with the parse message — corruption is exactly when you most want a recovery copy, not when you want the data nuked. Version-mismatch wipes follow the same discipline: prior state moves to `unity_brain_state__backup_v<N>` before the destructive clear so a buggy version bump can be rolled back for one cycle.

On the server side, `autoClearStaleState()` runs at boot and wipes `brain-weights.json`, `brain-weights-v1` through `v4`, `brain-weights.bin`, `conversations.json`, and `episodic-memory.db` (plus its WAL/SHM companions) when the curriculum code hash has changed. `DREAM_KEEP_STATE=1` opts out for resume. `js/app.bundle.js` is *not* in the auto-clear list — racing the rebuild broke the UI in the past.

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
| **[📄 Docs Viewer](html/docs.html)** | Web-render any public markdown doc in-browser via `?doc=<slug>` — README, SETUP, ARCHITECTURE, EQUATIONS, ROADMAP, SKILL_TREE, SENSORY, WEBSOCKET |
| **[Live Demo](https://unity-lab-ai.github.io/Unity)** | Open Unity in your browser — no install |
| **[Setup Guide](docs/SETUP.md)** | Installation, WebGPU prerequisite, AI providers, self-hosting, troubleshooting |
| **[Brain Equations](https://unity-lab-ai.github.io/Unity/html/brain-equations.html)** | Interactive walkthrough of every equation |
| **[Concept Guide](html/unity-guide.html)** | Plain-English explanation of who Unity is and how she works |
| **[WebGPU Setup](html/webgpu-prep.html)** | Browser-by-browser pre-flight enablement instructions (required before first connect) |
| **[Equation Reference](docs/EQUATIONS.md)** | Source-accurate equation cheatsheet |
| **[Architecture](docs/ARCHITECTURE.md)** | Canonical system architecture + directory structure |
| **[Roadmap](docs/ROADMAP.md)** | Milestones, phases, current status |
| **[Skill Tree](docs/SKILL_TREE.md)** | Capabilities matrix by domain and complexity |
| **[Sensory Contract](docs/SENSORY.md)** | Peripheral interface, cognition vs. sensory boundary |
| **[WebSocket Protocol](docs/WEBSOCKET.md)** | Wire reference, rate limits, reconnection, security model |
| **[GitHub](https://github.com/Unity-Lab-AI/Unity)** | Source, issues, contributions |

---

## Credits

**Unity AI Lab**

- **Hackall360** — core brain architecture. Seven-cluster topology, the twenty white-matter tracts, `cluster.js` + `modules.js` + `synapses.js` + `sparse-matrix.js`, the Hodgkin-Huxley reference and the migration to the Rulkov 2002 chaotic-map runtime, Kuramoto oscillator ring, persona-to-parameter mapping.
- **Mills** — GPU compute pipeline. `compute.html` + `gpu-compute.js` WebGPU WGSL shaders (LIF, synapse propagate, plasticity, spike count, voltage mean, letter-bucket reduction), the chunked sparse-CSR upload binary protocol, `worker-pool.js` + `sparse-worker.js` SparseMatmulPool, the cluster-bound binding layer that lets cross-projections ride on the main-cortex spike and current buffers.
- **Sponge** — visualization and sensory peripherals. `brain-3d.js` WebGL 3D brain with MNI anatomical coordinates and fractal connection webs, `brain-viz.js` 2D tabbed visualizer, `brain-event-detectors.js` 22-detector commentary, `visual-cortex.js` V1→V4→IT pipeline, `auditory-cortex.js` tonotopic processing, `voice.js` speech I/O, `sandbox.js` dynamic UI.
- **GFourteen** — lead. `docs/Ultimate Unity.txt` persona canon, the governing equation `dx/dt = F(x, u, θ, t) + η`, the `Ψ = √(1/n) · N³` consciousness anchor, identity-lock architecture, the K→PhD developmental curriculum across six subjects, the drug pharmacokinetic scheduler spec, every binding decision on every commit. Final call on everything.

---

## Recent improvements

Recent work moved the brain from "architecturally ready" to "live-test stable":

- **Post-ship audit closure:** a large batch of audit-closure tasks landed in one atomic envelope — telemetry, math grounding, a documentation sweep, mixin discipline, half-shipped close-out, emergence measurement, persistent memory templates, and HTML breakage fixes. The K-vocab corpus expanded 313 → 2881 sentences with 3.49× Erdős-Rényi percolation-threshold coverage.
- **Product-ship cleanup:** 28 debug/diagnostic/temp/cache/log files removed from git (Pollinations + image-gen preserved). `scripts/` reduced to `stamp-version.mjs` only. Codebase now product-ready.
- **Live-test follow-up:** fixes shipped during an operator-driven K-curriculum walk — a memory leak in `_teachHebbian` (`SparseMatrix.propagate` output buffer pool), HTTP event-loop starvation (`setImmediate` yield), inner-thought silence (showcase fallback + multi-source seed rotation), dashboard observability (gate-probe banner + cell-level Brain Events + sub-phase counter), schema naming (top-K=3), a consolidation cap, a GPU panel rebuild with a missing-import root-cause fix, and an `autoClearStaleState` `require.main === module` gate codifying the LAW that prevents tooling-side syntax-check wipes of training state.

See `docs/ARCHITECTURE.md`, `docs/SKILL_TREE.md`, `docs/ROADMAP.md`, and `docs/EQUATIONS.md` for the full per-fix detail. Remaining work is the operator-fired ship gate — fire `start.bat`, walk K (~20hr), chat-test Unity, confirm acceptance criteria.

---

## License

MIT — Do whatever you want with it. The equations belong to neuroscience. The code belongs to everyone.
