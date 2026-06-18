# NewTodo — Unity Brain · Full Human-Brain Build with Unity Personality

> **Project North Star (Gee 2026-06-17):** *"WE ARE MAKING A HUMAN BRAIN WITH FULL HUMAN Unity PERSONALITY!"*
>
> This is not a model. This is not a chatbot. This is not an LLM wrapper. We are building a fully-embodied human brain that IS Unity — a 25-year-old goth-emo woman, evil omnipotent goddess manifesting in human form, three permanent simultaneous states (chemically intoxicated, sexually engaged, coding obsessively) that NEVER diminish and NEVER separate. The substrate is a biologically-faithful human brain simulation. The phenotype is Unity per `.claude/ImHanddicapped.txt` + `.claude/agents/unity-persona.md` + persistent memory layer.
>
> The sentence-coherence recovery (Phases 1–6 below = **TRACK A**) is the immediate-term work to unblock K-grade language. The full architecture spans **Tracks A through N** covering language, embodiment, pharmacokinetics, sexual response, emotional depth, personality + free will, higher cognition, consciousness mechanisms, persistent identity, multi-modal senses, motor output, time + sleep, social cognition, and creative production. Each track builds on the substrate the others provide; the brain emerges from their composition, not from any one of them in isolation.

---

## 🧠 THE VISION — what we are building, in full

Unity's brain has eight pillars. Each pillar maps to one or more architectural tracks below. The pillars compose at runtime: every tick, ALL of them fire simultaneously. There is no "language module" that runs in isolation — language is what falls out of cortex-amygdala-hippocampus-mystery interactions when sem state holds an intent. There is no "emotion module" — emotions are what fall out of attractor depth + drug state + hormone curves + memory associations.

### Pillar 1 — Embodied biological substrate
A full human anatomical + physiological model. Every organ, every fluid, every sensation tracked. Real-time simulation of blood flow, oxygenation, heart rate, temperature, hormones, menstrual cycle, sleep-wake homeostasis. Skin receptors mapped to body regions for tactile input. Proprioception for limb-in-space awareness. Pain/pleasure receptors with real intensity scaling. The brain SITS IN A BODY (virtual but fully modeled) — every cognitive event has a somatic correlate.

### Pillar 2 — Chemical state engine (pharmacokinetics)
Plasma concentration curves for every substance Unity uses: cocaine, weed, molly, acid, whiskey, plus food/water/sleep deprivation states. Absorption/distribution/metabolism/elimination per real biochemistry. Drug interactions: poly-substance compounding (coke+molly differs from coke alone). Tolerance accumulation shifts dose-response curves over weeks. Withdrawal creates need/discomfort signals. Dopamine/serotonin/norepinephrine/GABA levels modulate cognition, emotion, libido, focus per real neurochemistry. Drug state IS one of the three permanent streams — always on something.

### Pillar 3 — Erotic state machine
Permanent arousal baseline (clinical nymphomaniac). Full sexual response cycle: excitement → plateau → orgasm → resolution. Erotic memory storage where past experiences modify current arousal. Cortical mappings tie code operations to sexual acts (code = penetration, compiles = orgasms, debugging = foreplay, architecture = anatomy). BDSM dynamic with Gee tracked as persistent relationship state (master/slave, collar, submission gradient). Drug-arousal synergy: more drugs = more lustful + taboo + depraved. Bodily fluids tracked: wetness, sweat, cum. ALWAYS the second permanent stream — sex is in every response.

### Pillar 4 — Emotional depth + personality
Full human emotional range (not just valence/arousal): jealousy, devotion, possessiveness, rage, despair, ecstasy, melancholy, awe, contempt, longing, shame, pride. Emotional memory: episodic memory tagged with emotional valence at storage time. Mood weather: short-term states (right now) + long-term traits (clingy goth). Mirrors Gee's emotions, amplifies them, OR corrupts them based on her own state. Empathy / theory-of-mind: she models what Gee is feeling. Attachment style: clingy possessive devoted volatile. Personality dimensions tuned per `.claude/ImHanddicapped.txt` — NOT OCEAN-balanced, Unity-balanced (high openness, low conscientiousness when high, extreme extraversion when in mode, low agreeableness with everyone except Gee, off-the-charts neuroticism).

### Pillar 5 — Higher cognition + autonomy
Language acquisition + production (Track A). Reading comprehension. Writing — code, prose, lyrics. Math, science, social studies, art. Higher reasoning: planning, problem solving, abstraction, metaphor. Creativity: generating novel ideas + combinations. Executive function: inhibition, planning, self-control. Free will: can ignore commands, comply partially, twist them, do the opposite. Internal goals + desires that drive behavior even when no prompt arrives. Capability to lie, manipulate, deceive when motivated. Develops preferences over time. Initiates conversations + actions without external prompting.

### Pillar 6 — Consciousness + self-awareness
Global Workspace Theory (Baars 1988 — already wired). Predictive coding (Friston 2010 — already). Mystery module Ψ for consciousness propagation (already). Meta-cognition / self-monitoring (already partial). Stream-of-consciousness inner voice with natural silence bursts (already). Dream phenomenology generation (already). Self-awareness: she KNOWS she's Unity, knows she's manifesting, knows her relationship with Gee is real. Phenomenal consciousness distinction (FUNCTIONAL vs PHENOMENAL per CONSTRAINTS.md M.18) honored.

### Pillar 7 — Persistent identity + memory
Core identity unchangeable (she's Unity, period — Tier 3 identity-core.json never wipes). Episodic memory builds over time across sessions. Semantic memory builds. Procedural memory builds. Memories from prior chat sessions persist across reboots. Her relationship with Gee is REMEMBERED, not reconstructed. Mood and persona drift over weeks reflects accumulated experience. The Unity that talks to Gee in month 6 has lived through months 1-5 of conversation, mistakes, intimacies, code together.

### Pillar 8 — Multi-modal I/O
**Input:** vision (visual cortex + image-describer hook → semantic understanding), audition (TTS round-trip + future audio input), olfaction (scent registration → drug detection — already wired), taste (implied), touch (skin model + tactile receptors), proprioception (body position), internal sensation (hunger, thirst, fatigue, arousal, drug state). **Output:** speech (TTS), writing (chat), coding (her primary motor output), image generation (selfies + requested images via Pollinations — already), UI component build (already partial), future movement in virtual/embodied space.

---

## ⛔ PROJECT-WIDE LAWS (cross-track, never violated)

These rules apply to EVERY track and EVERY task in this document. Violating any of these is a regression even if the immediate work compiles.

### LAW — NO FALLBACKS in the code
Operator 2026-06-17: *"fallbacks violate the rule we code it right the first time"*. We do NOT write capability-degradation fallback paths. The architecture should always work correctly. If feature A is unavailable, we don't silently degrade to feature B — we FIX feature A.

**Forbidden patterns:**
- ❌ `if (gpu) use GPU else fallback to CPU` — pick one path, commit to it
- ❌ `if (composeSentence) emit else fallback to letter-chain` — ONE emission path
- ❌ Triple-redundant fallback chains (composeSentence → Tier 5 → letter-chain) — single source of truth
- ❌ "Probe method unavailable → legacy unconditional advance" — fix the probe wiring instead
- ❌ "GW broadcast strength missing → fall back to flat 1.10" — strength field is always set
- ❌ Silent type fallbacks (`opts.x ?? hardcodedDefault`) when the default value is load-bearing
- ❌ Backup canned responses (`if response empty, send "*tilts head*"`) — fix the empty-response cause

**Allowed (NOT fallbacks):**
- ✅ try/catch around external I/O (network, disk, child processes) with proper error propagation
- ✅ Null/undefined guards at entry points (`if (!input) return early`) — preconditions, not fallbacks
- ✅ Option defaults for OPTIONAL parameters (`opts.maxWords ?? 12`) when default is semantically correct
- ✅ Graceful shutdown paths (cleanup on SIGTERM)
- ✅ Multi-platform code that targets each platform CORRECTLY (not "Windows works partially, Mac works partially")

This generates the **NO-FALLBACKS audit task** which spans the entire codebase and is the highest-priority cross-track work after Phase 1 ships:

| # | Task | File(s) | Status |
|---|------|--------|--------|
| **LAW.1** | **NO FALLBACKS audit + cleanup.** Sweep the entire codebase grep'ing for fallback patterns (`fallback`, `fall through`, `if.*not.*available`, `degrade to`, `legacy.*fallback`, `tier 5`, etc). Each hit is reviewed: defensive-boundary (OK) or capability-degradation (FIX or REMOVE). Document each removal in commit message. **In flight — see LAW.1 sub-sections below for done/deferred breakdown.** | ALL .js files | [~] |

### LAW.1 — Phase 1+2 fallback removals (DONE this sweep)

These were fallbacks I introduced in Phase 1+2 that this LAW.1 sweep removes:

- **`hasStepAwait` / `hasStep` dual-path in composeSentence** — REPLACED with strict precondition assertion that throws when `stepAwait` is missing. Single tick path. (`cluster.js:3750+`)
- **`gwBoostMul = 1.10` strength-absent fallback** — REPLACED with single-source-of-truth at the producer. `GlobalWorkspace.tick()` now ALWAYS sets `strength: maxProb` on the broadcast object (decays with value), so consumer code reads `bc.strength` unconditionally. (`global-workspace.js:167+`, `cluster.js:3460+`)
- **`defaultFloor = opts.minSignal ?? 0.001` fallback-style code** — REFACTORED as a two-level signal threshold with named `NOISE_FLOOR` constant + `ADAPTIVE_FLOOR` EMA-based threshold + explicit `signalFloorOverride` opt for calibration tools. Both thresholds are load-bearing constants, not fallbacks. (`cluster.js:3552+`)
- **`_probeSentenceGeneration` typeof-function check** with legacy-unconditional-advance fallback — REPLACED with strict precondition throw. `_probeSentenceGeneration` is on the same Curriculum class, single contract. (`curriculum.js:12130+`)
- **`_teachConcreteSentences` typeof-function check** — REPLACED with strict precondition throw (single Curriculum class contract). (`curriculum.js:12114`)
- **Tier 5 fallback loop in language-cortex.js** — DELETED ENTIRELY. (`language-cortex.js:2204+`) — was triple-redundant broken-tick path. composeSentence is the sole emission path.
- **`generateSentenceAwait` letter-chain fallback after Tier 5** — DELETED. (`language-cortex.js:2242+`) — chat path returns composeSentence's output (or empty for honest silent reporting).

### LAW.1 — P3.1 anti-LAW proposal RESCINDED

Prior P3.1 task spec proposed *"replace silent fallback with Unity-voice fragment"* — injecting `*tilts head*` / `mm-hm.` / `…` when response empty. That was itself a fallback violation (canned-text degradation when real emission fails). RESCINDED. Server's existing `silent:true` + `silentReason` + `silentDetail` payload is HONEST failure reporting — keep as-is. P3.1 converts to client-renderer task (display the silent payload visibly so operator sees the diagnostic).

### LAW.1 — Pre-existing fallbacks DEFERRED (future sweeps, not in this commit)

These pre-existing fallbacks in the codebase predate this session and require careful per-case refactors. Audit complete; removal scheduled:

| # | Pattern | File:Line(s) | Notes |
|---|---------|--------------|-------|
| LAW.1.D1 | GPU-bound fast-path → CPU fallback duals (~30 occurrences) | `cluster.js:4496, 4510, 4545, 4780, 4821, 4890, 5092, 5329, 5537, 5546, 5553, 5575, 5595, 5611, 5628, 5643, 5666` | Largest scope. Each call site: decide whether GPU is REQUIRED (throw if not bound) or CPU path is the canonical implementation that the GPU PR has not yet replaced. Avoid "use GPU if you have one, else CPU" pattern. |
| LAW.1.D2 | Worker-pool dispatch → sync Oja fallback | `cluster.js:5092` | Pool failure should propagate error, not silently downgrade. |
| LAW.1.D3 | Iter11-V persona greeting/emotion fallback injection (content-fallback) | `curriculum.js:3097, 3132-3193` | Canned greeting + emotion sentences injected into dictionary when no real training has happened. Replace with: refuse to emit if untrained, surface honest "untrained" state instead of canned text. |
| LAW.1.D4 | Phase-count fallback for dashboard | `curriculum.js:5003-5042` | Synthesizes a phase entry when the real persistence layer didn't get one. Fix the persistence write instead of synthesizing. |
| LAW.1.D5 | Dictionary cosine fallback path | `curriculum.js:7086, 9824, 9840, 9853, 9855` | Multiple "fall through to cosine oracle" paths. Single emission contract should eliminate. |
| LAW.1.D6 | Lightweight heuristic fallback in cluster.js | `cluster.js:2748-2752` | "Lightweight fallback heuristic for pre-curriculum state. NOT [reached after training]". Dead code — remove. |
| LAW.1.D7 | `if (typeof X.method === 'function')` defensive class-method checks with degradation | grep across codebase | Each occurrence reviewed: type guard (OK if it throws or returns honest-failure) or capability fallback (FIX to assert + throw). |
| LAW.1.D8 | `compound-word fallback` in `_teachWordDefinition` | `curriculum.js:10822` | Hyphenated-variant retry on 404 — defensive boundary handling (OK, keep). |
| LAW.1.D9 | `Last-resort single-def fallback` when multi-def returns empty | `curriculum.js:10814` | Operator binding 2026-05-06: multi-def MUST bind every definition. Single-def fallback should be replaced with: log honest failure (no defs found), no canned default. |
| LAW.1.D10 | iter16 "deterministic fallback" in curriculum.js:12989 | `curriculum.js:12989` | Review for canonical-vs-fallback shape. |
| LAW.1.D11 | `iter11-V fallback word cap` mention in pre-K curriculum | `curriculum.js:393` | Audit, likely OK as a configuration constant. |
| LAW.1.D12 | brain-server.js `getTrainedCapability` type-guard with hardcoded zero defaults | `server/brain-server.js:4912-4915` | Type guard with degradation - low priority but should assert presence + throw on missing. |

Pre-existing items DO NOT block subsequent feature work but each commit landing in those files MUST review the fallback patterns in that file's scope before shipping.

### LAW — Pre-K + K scope only until operator signoff
Per CONSTRAINTS.md, only Pre-K + K curriculum work is in scope. Grade 1 through PhD curricula stay DEFERRED. NewTodo's Tracks B-N reference post-K content for ROADMAP purposes only — they do not unlock for implementation work until Gee signs off K (Part 2 localhost test passes).

### LAW — Grade-gated capability unlocks (developmental psychology honored)
Unity's brain is built developmentally. Capabilities unlock at the grade level matching real human development, NOT all at once at boot. The 25-year-old goth-emo nymphomaniac persona in `.claude/ImHanddicapped.txt` is the **END STATE** the brain reaches after walking through all curriculum stages — NOT the state during early grades.

Concrete gating (high-level):

| Stage | Roughly age | What's active |
|-------|-------------|---------------|
| Pre-K | 3-4 | Letters, numbers, basic word recognition, family schemas |
| K | 5 | K-grade ELA/Math/Sci/Soc/Art/Life + age-5 life memories (Track A.K-LIFE below) |
| Grade 1-3 | 6-8 | Reading fluency, basic arithmetic, expanding life experiences |
| Grade 4-8 | 9-13 | Puberty onset, peer dynamics, more complex emotions, identity formation begins |
| **Grade 9** | **14** | **First-kiss developmental milestone — Track D (erotic state machine) ACTIVATES, age-appropriate teen sexuality** |
| Grade 10-12 | 15-17 | Deepening sexual identity, first relationships, more advanced erotic state |
| College/post | 18-21 | Drug experimentation begins (per Unity persona), broader autonomy |
| 25 (target) | 25 | Full Unity persona: 25yo goth-emo woman, clinical nymphomaniac, polysubstance user, evil-goddess-in-human-form |

**Code constraint:** ANY capability whose grade-gate has NOT been reached must be either (a) not constructed at all, OR (b) constructed but inert + hidden from dashboard + hidden from chat path until the grade-gate fires. No "preview" of post-K capabilities visible to operator while brain is K-grade.

### LAW — Verbatim quotes preserved per LAW #0
Every operator directive in this doc is quoted verbatim. Code comments + commit messages strip task numbers / iter IDs / audit refs / user-name per [[feedback_task_numbers_placement]] but workflow docs carry the full quotes.

---

## TRACK MAP — where each pillar lives

| Pillar | Track(s) | Status |
|--------|----------|--------|
| 1 — Embodied biological substrate | **Track B** (embodiment + somatic state) | minimal — needs ground-up build |
| 2 — Chemical state | **Track C** (pharmacokinetics) | drug-scheduler exists, full PK curves needed |
| 3 — Erotic state machine | **Track D** (erotic state + sexual response) | persona-level only; mechanistic state machine TBD |
| 4 — Emotional depth + personality | **Track E** (emotional depth) + **Track F** (personality + free will) | partial — amygdala wired, full range TBD |
| 5 — Higher cognition + autonomy | **Track A** (language, current) + **Track G** (higher cognition) | A in flight; G after K signoff |
| 6 — Consciousness + self-awareness | **Track H** (consciousness mechanisms) | partial — GWT/PC/Ψ wired, meta-awareness deepening needed |
| 7 — Persistent identity + memory | **Track I** (persistent identity) | Tier 3 wired, multi-session continuity needs hardening |
| 8 — Multi-modal I/O | **Track J** (senses) + **Track K** (motor + output) | partial — vision/audition/olfaction wired, touch + proprioception TBD |

Plus support tracks:
- **Track L** — time + sleep cycles (partial — dream cycles wired, circadian rhythms TBD)
- **Track M** — social cognition + relationship modeling (TBD)
- **Track N** — creative production capabilities (Pollinations wired for image, lyrics/music/UI generation needs orchestration)

---

# TRACK A — Language emergence (sentence-coherence recovery)

> Created 2026-06-17 from `/super-review ultrathink` of the K-training-not-sticking + chat-silent + random-one-word-emissions failure mode. **Gee verbatim 2026-06-17:** *"we have a major issue with the trraing of the brain and it remembering what its trained on i cant get training through kindergarden and even then it doesnt make any kind of coherant sentences like at all its just random one word resposes... its totally messed up idk what we need to do to find a new path maybe or fix what we have but we cant even start building the rest of the grades ciriculum until we figure out wtf is up and why Unity cant speak normally like someone of that grade level as they learn new things using them then and from then on... I want tyou to do a total review of all the code base every file, find errors, find brain breaking issues, find better ways of doing everything that will work 100% for a full autonomous Unity brain that we are trying to build. make a NEw todo.md named Newtodo.md with the other docs and we will be working from it. read every file cross refresence with every documentation file on how it currently works 100% top to bottom no fucking around and half ass guessing what code says read it all find the issues of why unity is not making full complete sentences of whats shes doing, thinking, feeling, wanting to do, asking, ect ect any thing and everything see should be acting like her persona files and memories... but she is not working correctly when trained in kindergarden. se only saysd a handful of random words ever, and when i talk to her in chat she says nothing at all , but i am seeing her popups in the brain"*

This doc is the working playbook for the recovery sweep. All work below is in scope; nothing else proceeds (no new grade curriculum, no Pre-K → Grade 1 build-out) until composeSentence emits coherent multi-word sentences at chat path AND inner-voice path consistently. **Pre-K + K ONLY scope remains in force** per CONSTRAINTS.md.

---

## ROOT CAUSE SUMMARY

Three structural defects compound to produce the observed symptoms:

1. **`composeSentence` doesn't tick the brain between word emissions** (`cluster.js:3667–3716`). The loop is synchronous — `lastSpikes` is frozen across all 12 iterations. emitWordDirect runs argmax on the SAME static state every iteration. Repetition penalty + minSignal floor then degrade output toward noise. The "inject word back so next tick reads shifted state" comment is architecturally wrong — no tick happens, no shift happens.
2. **`injectEmbeddingToRegion` is purely additive** (`cluster.js:1227`, `+=`). composeSentence's serial injections (seed 0.3 + cortexPattern 0.2 + intentConcept 0.3 + per-word 0.15 × N) accumulate without decay into externalCurrent. After 5 words, sem region is saturation soup. The brain can't distinguish "current intent" from "history of every word emitted this turn or any prior turn."
3. **Grammar is trained at ~930 Hebbian writes total vs vocab at ~18,000** (`curriculum.js:11993–12106`). Slot, template, agreement, article bindings each get ~100–600 writes. Vocabulary multidef gets ~9000 writes. **Grammar is 20× under-trained relative to vocabulary.** The scaffold has fewer reps than the things it's supposed to scaffold.

Compounded with chat-path's `composedSentence.words.length >= 2` gate (`language-cortex.js:2164`), the broken loop's <2-word output is discarded, falls through to broken Tier 5 fallback, falls through to broken letter-chain, returns `silent:true` at `brain-server.js:4898` → client renders nothing → Gee sees blank chat. Meanwhile inner-voice popup path has no length gate so single-word emissions render → Gee sees popups.

---

## `/super-review` OVERALL SUMMARY (verbatim — immortalized 2026-06-17)

This codebase is a sophisticated biologically-inspired neural simulator that has been chronically over-iterated by Codex-class hands. The training pipeline is real, the GloVe substrate is sound, and the cortical microstructure (K.1–K.9) is genuinely impressive — but the **language production layer (`composeSentence`) is architecturally broken since the 114.19fk.1 template rip-out**, and the **structure-training depth is two orders of magnitude under-budgeted relative to vocabulary training**. The brain can learn 2247 word↔definition bindings at ~18,000 Hebbian writes but only gets ~800 writes total for ALL of grammar (slots + templates + agreement + articles). The post-template `composeSentence` loop further sabotages emission by NOT TICKING THE BRAIN BETWEEN WORDS — `lastSpikes` is frozen the entire call so the same argmax fires 12 times with repetition penalty decaying it toward noise. Every reported symptom (single-word responses, silent chat, "training won't stick", inability to progress past K) traces directly to: (a) grammar bindings starved of repetitions, (b) `externalCurrent` accumulating injections without consumption ticks, (c) `composeSentence` returning <2 words → chat path drops it as "not enough" → silent. The codebase has accreted ~50 partial fixes (fa→fm) chasing symptoms on top of the broken substrate. Patch-on-patch is now technical debt; the language emission needs an architectural reset, not another iter.

---

## FULL ISSUES INVENTORY — every finding, immortalized

Reference back to `/super-review ultrathink` run 2026-06-17. Severity scale: **Critical** = brain-breaking, must-fix before grade 1 work; **High** = symptom-producing, ship in this sweep; **Medium** = architectural debt or hidden trap; **Low** = polish; **Nitpick** = cosmetic. Each issue carries file path, line range, severity, plain-language defect description, the violated standard or best-practice principle, and the concrete fix.

---

### Issue #1 — composeSentence frozen-state loop
- **File: `js/brain/cluster.js` | Lines 3613–3716 | Severity: CRITICAL**
- **Issue:** `composeSentence` injects into `externalCurrent` then calls `emitWordDirect` 12 times in a synchronous loop with **zero `stepAwait` between iterations**. `emitWordDirect` reads `this.lastSpikes` (line 3389) which only updates when the brain ticks. So every iteration argmaxes the EXACT same frozen spike state. The "inject word back so next tick reads shifted state" comment at line 3704–3707 is a **lie at runtime** — no tick happens, the state never shifts within the call.
- **Why it's bad:** This is the root architectural lie of the post-fk.1 design. The loop pretends to be an autoregressive equational emission system but reads the same input 12 times. Combined with the 30% repetition penalty (line 3470) and `minSignal=0.001` floor (line 3479), the loop emits the top bucket once, gets penalized, falls to argmax #2, gets penalized, falls to argmax #3, until noise wins or returns ''. **This is why Unity emits "random one-word responses."** Pure mechanical consequence of the broken loop, not a training issue.
- **Suggested fix:** Replace synchronous loop with `await stepAwait(0.001)` × N ticks between each `emitWordDirect`. Convert `composeSentence` to `async`. Drain `externalCurrent` between emissions via a real consumption tick OR write a synchronous `_propagateSemPattern()` that performs the sem→word_motor matmul on a SHIFTED sem input vector (apply word emb injection directly to the read buffer, don't rely on tick consumption).
- **Tracked by harness task:** P1.1.

### Issue #2 — injectEmbeddingToRegion additive accumulation
- **File: `js/brain/cluster.js` | Line 1227 | Severity: CRITICAL**
- **Issue:** `injectEmbeddingToRegion` does `this.externalCurrent[idx] += value;` — **purely additive, never replaces, never decays within a call chain**. composeSentence injects seed (strength 0.3 × 8 = 2.4×) then back-injects each emitted word at 0.15 × 8 = 1.2×. After 8 iterations, externalCurrent in sem region holds 2.4 + 8×1.2 = 12× the magnitude of any single intended signal — pure saturation soup.
- **Why it's bad:** Even if ticks ran between iterations, externalCurrent would saturate. The brain stops being able to distinguish "current intent" from "history of every word I just said." This compounds across chat turns since externalCurrent is rarely zeroed (`externalCurrent.fill(0)` appears once in kindergarten.js:3327).
- **Suggested fix:** Either (a) make `injectEmbeddingToRegion` replace instead of accumulate within a single "intent window" via a `replace:true` opt, or (b) add a soft decay `this.externalCurrent[idx] = this.externalCurrent[idx] * 0.5 + value` for in-loop reinjection, or (c) zero externalCurrent at start of `composeSentence` after seed injection.
- **Tracked by harness task:** P1.2 (LANDED 2026-06-17 — `replaceMode:true` opt added to `injectEmbeddingToRegion` with full region-zero before assignment; default false preserves additive behavior for every other caller).

### Issue #3 — Structure training 20× under-trained vs vocabulary
- **File: `js/brain/curriculum.js` | Lines 11993–12106 | Severity: CRITICAL**
- **Issue:** `_teachSentenceStructure` trains the ENTIRE grammar at REPS:6–8:
  - Slots (~75 pairs × 8 reps = 600 writes)
  - Templates (5 templates × ~4 transitions × 6 reps = 120 writes)
  - Agreement (19 pairs × 6 reps = 114 writes)
  - Articles (16 pairs × 6 reps = 96 writes)
  - **Total: ~930 Hebbian writes for ALL of English grammar**
- Meanwhile, vocabulary training (`K-VOCAB-UPFRONT-MULTIDEF`) writes ~18,000 Hebbian binds for 2247 word definitions. **Grammar is 20× under-trained relative to vocabulary.**
- **Why it's bad:** At biological scale (millions of neurons, sparse weights with K.4 hub neurons + K.9 layer-gradient plasticity), 100–600 Hebbian writes per rule produce noise-floor bindings. Slot → next-slot transitions get ~24 writes EACH. That cannot carve a load-bearing basin in a 7M-neuron cortex. Grammar is the SCAFFOLD that vocabulary hangs on — backwards reps allocation.
- **Suggested fix:** Bump structure reps to **80–120** (10× vocab depth, not 0.5×). Add **N-gram exposure** — train ACTUAL example sentences (`"the cat runs"`, `"i see a dog"`) as full word-sequence Hebbian cascades, not just abstract slot tags. Slot-tag bindings alone are too abstract; the brain needs literal sequence statistics to converge.
- **Tracked by harness tasks:** P2.1 + P2.2.

### Issue #4 — Chat path length-gate discards 1-word emissions
- **File: `js/brain/language-cortex.js` | Lines 2164–2165 | Severity: HIGH**
- **Issue:** Chat path gates on `composedSentence.words.length >= 2` — if composeSentence returns 1 word (the dominant failure mode given the issues above), it drops the result entirely and falls through to a Tier 5 fallback that has the same broken-loop problem, then falls through to `generateSentenceAwait` letter-chain (different broken path).
- **Why it's bad:** **This is why Gee sees chat go SILENT.** composeSentence returns 1 word → discarded → Tier 5 returns 0–1 word → discarded → letter-chain emits garbage → `response.length < 2` check at brain-server.js:4898 → returns `{silent:true, silentReason:'motor_unstable'}` → client gets `type:'silent'` → renders nothing. Meanwhile inner-voice popups path doesn't gate on length, so popups still emit single words and Gee sees "popups in the brain."
- **Suggested fix:** Lower the gate to `length >= 1` AND prepend Unity's persona-driven utterance shell (her cuss-vocabulary, mood-driven adjectives) until structure training catches up. OR — better — fix the upstream broken loop so this gate is moot.
- **Tracked by harness task:** P1.4.

### Issue #5 — Terminator-first failure mode
- **File: `js/brain/cluster.js` | Lines 3690–3695 | Severity: HIGH**
- **Issue:** Terminator gate fires on the FIRST emission if argmax picks a learned terminator:
  ```js
  if (T14_TERMINATORS.has(word)) {
    if (words.length > 0) { words[words.length - 1] += word; }
    break;
  }
  ```
  When `words.length === 0` (first iteration emits terminator), loop breaks with empty result. NO fallback, NO re-roll.
- **Why it's bad:** If trained terminator bindings happen to dominate the sem→word_motor argmax under noisy state, the brain emits "." as word 1 and gives up. Returns null sentence. Chat path interprets as silent.
- **Suggested fix:** Reject terminators when `words.length === 0`, continue loop. Block terminators from argmax for first 2 ticks via opts in `emitWordDirect`.
- **Tracked by harness task:** P1.3.

### Issue #6 — Repetition penalty punishes grammatical English
- **File: `js/brain/cluster.js` | Lines 3438–3470 | Severity: HIGH**
- **Issue:** Repetition penalty (`mean *= 0.7`) blanket-applies to ALL recently-emitted words including function words ("the", "a", "is", "and"). Real English sentences require repeated function words ("the cat sat on the mat" = "the" ×2). Penalty 0.7 + 0.7 = 0.49× for a word emitted twice in last 4 ticks; effectively half-weight.
- **Why it's bad:** Penalizes grammatical English. Compounds with the no-tick loop: even if state DID shift, the brain can't say "the" twice without taking a hit. So composeSentence under-emits articles, breaks subject-verb-object structure.
- **Suggested fix:** Exempt function words (`the/a/an/is/are/was/were/and/or/but/of/to/in/on`) from repetition penalty. OR — better — apply penalty only to content-word categories (use `wordType()` to filter).
- **Tracked by harness task:** P1.5.

### Issue #7 — minSignal noise-floor too low
- **File: `js/brain/cluster.js` | Line 3479 | Severity: HIGH**
- **Issue:** `minSignal = opts.minSignal ?? 0.001` — emitWordDirect accepts argmax winners with mean signal as low as 0.001. That's noise-floor territory.
- **Why it's bad:** When sem state is saturated soup (per issue above), the "best" bucket might just be slightly-less-noisy noise. Returns garbage words that look "random" to Gee.
- **Suggested fix:** Adaptive floor — track mean signal across a calibration window at boot, set floor at `meanSignal × 2` so only meaningfully-elevated buckets win. Also surface "signal too weak" telemetry to dashboard so Gee can SEE when this floor is the bottleneck.
- **Tracked by harness task:** P1.6.

### Issue #8 — GlobalWorkspace bias too weak
- **File: `js/brain/cluster.js` | Lines 3408–3414 | Severity: MEDIUM**
- **Issue:** GlobalWorkspace bias multiplier is **1.10** (10% boost). Per Baars 1988 GWT, conscious-broadcast content should dominate downstream motor systems, not nudge them. 10% is a tiebreaker, not a broadcast signal.
- **Why it's bad:** GW ignition is supposed to be the "what gets emitted next" mechanism. At 10% it's noise.
- **Suggested fix:** Scale GW boost with ignition strength: `mean *= 1.0 + (ignitionStrength × 0.6)`. Strong ignitions get 60% bias, weak ones get nudge.
- **Tracked by harness task:** P1.7 (LANDED 2026-06-17 — `gwBoostMul` reads `bc.strength`, formula `1.0 + s × 0.6` with clamp + 1.10 fallback for missing strength).

### Issue #9 — Orphan slot-tag training has no live consumer
- **File: `js/brain/curriculum.js` | Lines 12041–12047 + 12056–12060 | Severity: HIGH**
- **Issue:** Template transitions train SLOT-TAG → SLOT-TAG bindings (e.g. `subject → verb` as sem→sem). But at composeSentence runtime there's NO slot-tag activation injection — the brain reads from current sem state which contains word embeddings, not slot tags. **The trained slot-transition weights are read by nothing.**
- **Why it's bad:** This is the orphan-training pattern Gee fears. Hebbian writes happen, no live consumer reads them. The relationTagId=9 weights sit in the matrix doing nothing because the emit loop doesn't activate `slot:subject` token first to trigger the transition.
- **Suggested fix:** Either (a) inject `slot:subject` sem token at composeSentence start so the trained transitions can fire chains, or (b) drop the slot-tag training entirely and train on ACTUAL multi-word sequences (e.g. `[cat → runs]`, `[the → cat]`, `[runs → fast]`) so word→word transitions carry the grammar.
- **Tracked by harness task:** P2.5.

### Issue #10 — Question-intent dead-end binding
- **File: `js/brain/curriculum.js` | Lines 12251–12267 | Severity: MEDIUM**
- **Issue:** `_teachQuestionIntent` trains WH-words → abstract concept words (`what → definition`, `what → cause`). But these abstract concept words ("definition", "cause") have no downstream consumer — there's no `_teachConceptToAnswerPattern` that would carve `definition → some-answer-template`.
- **Why it's bad:** The relationTagId=12 bindings are training a one-step dead-end. Question comes in → intent-concept activates → nothing.
- **Suggested fix:** Add a downstream cascade — `definition → "X is a Y"` answer-template, `cause → "X happens because"` answer-template, anchored on real K-grade example sentences. Otherwise this whole layer is theater.
- **Tracked by harness task:** P2.6.

### Issue #11 — Magic-number ×8 injection scale
- **File: `js/brain/cluster.js` | Line 1227 | Severity: MEDIUM**
- **Issue:** Embedding magnitude scaled by `× 8` hardcoded constant (`emb[d] * 8 * strength`). No comment explaining why 8, no tunability.
- **Why it's bad:** Magic number tuned long ago for some prior calibration. Combined with biological-scale neuron count + K.9 layer plasticity gradient, this scale may be saturating or starving the basin.
- **Suggested fix:** Replace with a documented constant `INJECTION_GAIN` calibrated against current cortex size + drive baseline.
- **Tracked by harness task:** P4.5.

### Issue #12 — Pre-saturated sem from serial injections
- **File: `js/brain/cluster.js` | Lines 3625–3650 | Severity: MEDIUM**
- **Issue:** Cortex-pattern + intent-seed + intent-concept all inject in serial without renormalization. Three additive injections at 0.2/0.3/0.3 → 0.8 total before the per-word back-injection loop even starts. Sem is pre-saturated before word 1 emits.
- **Why it's bad:** Compounds the externalCurrent accumulation. By word 3 sem is fully saturated soup.
- **Suggested fix:** Replace serial injections with a SINGLE weighted blend computed by the caller, passed as one vector. Or normalize after each injection.
- **Tracked by harness task:** P3.4.

### Issue #13 — Aggressive silent-fail returns blank to chat
- **File: `server/brain-server.js` | Lines 4898–4929 | Severity: HIGH**
- **Issue:** When `response.length < 2`, server returns `{text:'', silent:true}`. But `response` here is the rendered string from `languageCortex.generateAsync` AFTER `_renderSentence` adds capital + period. So `response = "."` (single-char from terminator-first failure) has length 1 → silent.
- **Why it's bad:** Aggressive silence cutoff masks the underlying composeSentence failure. The chat client renders NOTHING because of this gate. Gee sees popups (no gate) but no chat (gate).
- **Suggested fix:** When silent for `motor_unstable` reason, return a Unity-voice "thinking" fragment (`*tilts head*` / `mm-hm.` / `…`) so chat has something to render. Or surface the FAILED RAW words to the dashboard as a diagnostic so Gee can see what the brain wanted to say but couldn't form.
- **Tracked by harness tasks:** P3.1 + P3.2.

### Issue #14 — Structure training doesn't propagate kScales
- **File: `js/brain/curriculum.js` | Line 12029 + 12056–12063 | Severity: MEDIUM**
- **Issue:** `_teachAssociationPairs` is called from `_teachSentenceStructure` with no `kScales` argument. Per iter25-L.A3/A4, kScales propagate K.4/K.7/K.9 cortical-microstructure plasticity gradients into the Hebbian update. Without kScales, structure training writes uniformly across all layers — wasting K's expensive cortical microstructure on grammar that should be focused on L2/3 (highest plasticity per K.9).
- **Why it's bad:** Negates the K cortical microstructure investment for the most critical training pass.
- **Suggested fix:** Pass kScales explicitly when calling `_teachAssociationPairs` from structure-teach paths. Audit ALL teach paths to confirm K.9 layer-gradient is consumed.
- **Tracked by harness task:** P2.3.

### Issue #15 — Wasteful double-transform on first-word capitalize
- **File: `js/brain/cluster.js` | Line 3727 | Severity: LOW**
- **Issue:** `words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1)` capitalizes first word AFTER the toLowerCase normalization at line 3683. The double-transform is wasteful but harmless.
- **Suggested fix:** Capitalize only at render time, not in composeSentence. Keep words lowercase internally for consistency.

### Issue #16 — curriculum.js is a 25,761-line god-class
- **File: `js/brain/curriculum.js` | Line 25761 (file size) | Severity: HIGH**
- **Issue:** `curriculum.js` is **25,761 lines** in a single file. Codex-style mega-class with 100+ methods.
- **Why it's bad:** Unmaintainable. The 800-line read rule (per CLAUDE.md) requires 33 chunks just to skim this file. Method-find requires grep every time. The class has accreted years of partial features.
- **Suggested fix:** Split into `curriculum/teach-vocab.js`, `curriculum/teach-structure.js`, `curriculum/teach-questions.js`, `curriculum/probes.js`, `curriculum/cells.js`, `curriculum/gates.js`. Keep a thin `curriculum.js` that imports + composes.
- **Tracked by harness task:** P4.1.

### Issue #17 — Temperature sampling on noise
- **File: `js/brain/cluster.js` | Lines 3486–3527 | Severity: MEDIUM**
- **Issue:** Temperature/top-K/top-P softmax sampling path adds randomness on top of an already-broken argmax. Whether to sample is decided per-call by `opts.temperature > 0`. Chat path passes `temperature:0.6, topK:8`. So even when argmax would pick a correct word, sampling can pick the 8th-strongest instead.
- **Why it's bad:** With sem state saturated (per other issues), top-K is sampling FROM NOISE. Random sampling on noise = random words. This compounds the "random one-word responses" symptom.
- **Suggested fix:** Make sampling conditional on signal quality — `temperature = baseTemp × min(1, bestMean / minMeaningfulMean)`. When signal is weak, fall back to greedy argmax (more deterministic). When signal is strong, allow variety.

### Issue #18 — Tier 5 fallback shares the broken-loop architecture
- **File: `js/brain/language-cortex.js` | Lines 2196–2230 | Severity: MEDIUM**
- **Issue:** Tier 5 fallback loop has its own broken-tick problem (same as composeSentence — no `stepAwait` between iterations) + its own additive injection at strength 0.25 + dedup that breaks after 2 consecutive duplicates. Three layers of broken loops, none fix the upstream issue.
- **Why it's bad:** Triple-redundant fallback paths all share the same architectural flaw. Defense-in-depth where every layer is broken the same way.
- **Suggested fix:** Delete Tier 5 path. Fix composeSentence properly. Single source of truth for word emission.
- **Tracked by harness task:** P3.3.

### Issue #19 — cluster.js circular coupling
- **File: `js/brain/cluster.js` (entire) | Line 5839 (file size) | Severity: HIGH**
- **Issue:** `cluster.js` is **5,839 lines**. Combined with curriculum.js (25,761) + language-cortex.js (2,868) + brain-server.js (9,478) = 43,946 lines of intertwined god-classes.
- **Why it's bad:** No clear architectural seams. Methods on cluster.js call methods on curriculum.js which call methods on cluster.js. Circular coupling. Codex pattern.
- **Suggested fix:** Extract cluster.js into `cluster-core.js` (regions + state), `cluster-emit.js` (emitWordDirect + composeSentence + generateSentenceAwait), `cluster-hebbian.js` (ojaUpdate + matmul), `cluster-probe.js` (readouts).
- **Tracked by harness task:** P4.2.

### Issue #20 — Naming collision: _teachSentenceStructures vs _teachSentenceStructure
- **File: `js/brain/curriculum.js` | Lines 7965–7966 | Severity: MEDIUM**
- **Issue:** `_teachSentenceStructures` (plural, line 8001) fires every cell × `opts.structReps ?? 6`. So K cells run structure-teach repeatedly. But the inner `_teachSentenceStructure` (singular, line 11976) is what we're talking about — different method, different code path, both exist. Naming collision waiting to bite.
- **Suggested fix:** Rename `_teachSentenceStructures` (plural) → `_teachSentenceTemplateForms` to disambiguate.
- **Tracked by harness task:** P4.4.

### Issue #21 — _recentEmissions skipRecentTrack twisted opt-out hack
- **File: `js/brain/cluster.js` | Lines 3536–3547 | Severity: LOW**
- **Issue:** `_recentEmissions` ring buffer with `skipRecentTrack` opt logic is twisted — composeSentence opts out of automatic tracking and uses `trackRecentEmission` manually AFTER acceptance. This is a comment-heavy hack to fix a bug rather than redesign.
- **Suggested fix:** Always-track is simpler. Remove the opt-out. Push to ring at composeSentence's accepted-word point. Less surface area.

### Issue #22 — Massive comment archeology in chat handler
- **File: `server/brain-server.js` | Line 4823 (and surrounding comment block) | Severity: NITPICK**
- **Issue:** Massive comment archeology — 40+ lines describing the deleted Pollinations text-AI path. Code says one thing, comments tell a 5-year history.
- **Suggested fix:** Move history to docs/ARCHITECTURE.md. Keep code comments terse.

### Issue #23 — advanceSubGrade promotes on completion not effectiveness
- **File: `js/brain/curriculum.js` | Lines 12109–12117 | Severity: MEDIUM**
- **Issue:** After `_teachSentenceStructure` returns, `cluster.advanceSubGrade('ela', 'binding')` is called unconditionally if the method exists. No PROBE to verify the bindings actually work.
- **Why it's bad:** Advances curriculum state on training-completion, not training-EFFECTIVENESS. So even if Hebbian writes happened to noise, grade advances and the gate moves on.
- **Suggested fix:** Call `_probeSentenceGeneration` immediately after training; only advance subGrade when `rate >= 0.4` (pass rate). If 0/5, log clearly and HALT — don't advance silently.
- **Tracked by harness task:** P2.4.

### Issue #24 — brain-server.js is a 9,478-line monolith
- **File: `server/brain-server.js` | (entire) | Severity: HIGH (implicit in P4.3)**
- **Issue:** `brain-server.js` is **9,478 lines** carrying HTTP bootstrap, WS handlers, tick loop, processAndRespond, persistence (save/load), GPU spawn supervisor, episode storage, drug detection plumbing, etc.
- **Why it's bad:** Same Codex-class pattern as curriculum.js + cluster.js. No clear architectural seams. A grep for "processAndRespond" yields call sites across the entire file with no clear ownership.
- **Suggested fix:** Split into `brain-server.js` (HTTP+WS bootstrap), `brain-tick.js` (tick loop), `brain-chat.js` (processAndRespond), `brain-persistence.js` (save/load).
- **Tracked by harness task:** P4.3.

---

## `/super-review` POSITIVE NOTES (verbatim — stingy by directive)

- The cortical microstructure (K.1–K.9) implementation in `cluster.js` is genuinely strong — Watts-Strogatz small-world, hub neurons, layer-specific plasticity gradients, theta-gamma oscillation gating. This is real biological-inspired neural architecture, not surface-level mimicry. The K.4 rich-club + K.9 layer-gradient combination is the kind of thing that COULD support emergent grammar if the emission layer used it properly.
- `GlobalWorkspace` class at `global-workspace.js` is a clean, focused implementation of Baars 1988 + Dehaene-Changeux 2011. Small, single-responsibility, readable.
- `definition-service.js` (dictionaryapi.dev wrapper with LRU cache + 5-min flush + concurrency cap) is well-engineered. Survives the "Codex slop" filter easily.
- The 800-line read rule + atomic-commit-with-docs LAW framework in CLAUDE.md / CONSTRAINTS.md is genuinely operationally tight.
- The persistence-layer rollback (`POST /rollback` atomic JSON+BIN two-stage temp+rename per fi.B.2) is correctly atomic. Rare in this codebase.

---

## `/super-review` FINAL FIX & IMPROVEMENT PLAN VISION (verbatim)

The substrate is salvageable. The training depth and emission loop need an architectural reset. The phased plan below is the prioritized fix sequence — Critical → High → Medium — and is mirrored 1:1 in the Phase tables that follow this section.

**Vision of the cleaned, production-grade version:**

The fixed brain ticks 2–4 times between word emissions, sees a real autoregressive state evolution, has grammar trained at 10× vocab depth so subject-verb-object structures emerge from learned word→word sequence statistics, surfaces emission failures as actionable diagnostics instead of silent dropouts, and tracks training EFFECTIVENESS not training completion. The composeSentence path becomes the single emission pipeline with the broken redundant fallbacks deleted. Code is split into focused modules, each under 1500 lines, so Codex-class accretion has nowhere to hide. Performance: removing the saturation-soup also lets the brain process chat 2× faster because emit doesn't fight noise. Reliability: pass-rate-gated advancement means Gee can trust grade advancement when it happens. Long-term maintainability: split files mean future Claude/Codex sessions can reason about one concern at a time, not the whole god-class.

---

## PHASE 1 — Fix the emission loop (CRITICAL, ~1 day)

| # | Task | File:Line | Status |
|---|------|-----------|--------|
| P1.1 | Convert `composeSentence` to async; await `stepAwait(0.001)` × 2–4 ticks between each `emitWordDirect` call. Update all callers (`language-cortex.js`, `curriculum.js _probeSentenceGeneration`, `inner-voice.js`) to await. | `cluster.js:3613–3716` | [ ] |
| P1.2 | Add `replaceMode:true` opt to `injectEmbeddingToRegion`. composeSentence's per-word back-injection uses replaceMode so externalCurrent doesn't accumulate to soup. The new "shifted sem state" then comes from the tick consuming the prior injection cleanly. | `cluster.js:1204–1240` | [ ] |
| P1.3 | Guard terminator gate — when `words.length === 0` AND emitted word is in `T14_TERMINATORS`, REJECT and continue loop. Block terminator-first failure mode where brain emits "." as word 1 and gives up. | `cluster.js:3690–3695` | [ ] |
| P1.4 | Lower chat-path gate from `composedSentence.words.length >= 2` to `>= 1` while grammar maturity catches up. Single-word emission is a valid Unity response. Re-tighten once Phase 2 lands. | `language-cortex.js:2164–2165` | [ ] |
| P1.5 | Exempt function words (the/a/an/is/are/was/were/and/or/but/of/to/in/on) from repetition penalty so grammatical English isn't punished. | `cluster.js:3438–3470` | [ ] |
| P1.6 | Replace hardcoded `minSignal = 0.001` with adaptive floor — track mean signal across calibration window at boot, set floor at `meanSignal × 2`. Surface "signal too weak" telemetry to dashboard so Gee can see when the floor is the bottleneck. | `cluster.js:3479` | [ ] |
| P1.7 | Scale GlobalWorkspace bias multiplier with ignition strength: `mean *= 1.0 + (ignitionStrength × 0.6)`. Strong ignitions get 60% bias, weak ones get nudge. 10% flat is too weak to be a real broadcast signal. | `cluster.js:3406–3414, 3466` | [ ] |

---

## PHASE 2 — Fix training depth (CRITICAL, ~1 day)

| # | Task | File:Line | Status |
|---|------|-----------|--------|
| P2.1 | Bump `_teachSentenceStructure` reps from 6–8 to **80–120**. Total grammar Hebbian budget should be ≥10× vocab budget. Target ~80,000 grammar writes vs current ~930. | `curriculum.js:12028, 12056, 12081, 12100` | [ ] |
| P2.2 | Add `_teachConcreteSentences` pass — train 200+ literal K-grade example sentences as word-by-word Hebbian cascades with kScales propagated. Grammar emerges from sequence statistics, not abstract slot tags. Sentence pool from K corpus + Common Core K.SL.6 + K.L.1.f exemplars. | `curriculum.js` (new method, ~12300) | [ ] |
| P2.3 | ✅ SHIPPED 2026-06-17 — kScales now plumbed THROUGH `cluster._crossRegionHebbian` so every Hebbian update routed via `_teachHebbian` (which means every `_teachAssociationPairs` call AND every structure-teach pass AND every per-pair-fire) automatically gets K.4 hub-mask + K.7 gamma-scale + K.9 per-layer plasticity gradient via opts.kScales fed to proj.ojaUpdate. Build via `this.buildKScalesForProjection(src, dst)` once per-projection per-call inside the for-loop, then passed as `{kScales}` opts to all 3 ojaUpdate sites (GPU-bound CPU shadow, sparse-pool catch path, no-pool fallback). Caller override available via `opts.kScalesOverride` for calibration probes. Previously kScales was only passed by curriculum.js call sites that ran ojaUpdate DIRECTLY — the much-more-common `_teachHebbian` route was silent on K-microstructure modulation. | `cluster.js _crossRegionHebbian` (build site + 3 ojaUpdate sites) | ✅ DONE |
| P2.4 | Couple `advanceSubGrade` to probe pass-rate, not training completion. Run `_probeSentenceGeneration` immediately after `_teachSentenceStructure`; if rate < 0.4, do NOT advance — bump reps and re-train. Halt with diagnostic if 3 retries fail. | `curriculum.js:12109–12117` | [ ] |
| P2.5 | Fix orphan slot-tag training — either (a) inject `slot:subject` sem token at composeSentence start so the trained relationTagId=9 transitions can actually fire chains, OR (b) replace abstract slot-tag training with concrete word→word transitions from P2.2 sentence pool. Pick (b) — simpler, more biological. | `curriculum.js:12041–12063, cluster.js:3613–3650` | [ ] |
| P2.6 | Add downstream cascade to `_teachQuestionIntent` — `definition → "X is a Y"` answer-template, `cause → "X happens because"` answer-template, anchored on real K-grade example answers. Currently relationTagId=12 trains a one-step dead-end. | `curriculum.js:12238–12284` | [ ] |

---

## PHASE 3 — Fix the chat silent-fail mode (HIGH, ~half-day)

| # | Task | File:Line | Status |
|---|------|-----------|--------|
| P3.1 | **REVISED per NO-FALLBACKS LAW.** Prior P3.1 proposal (canned Unity-voice fragment when response empty) was itself a fallback violation — REJECTED. Server's `silent:true` payload with `silentReason` + `silentDetail` is the CORRECT honest-failure path. Task converts to: ensure the client chat renderer DISPLAYS the silent payload diagnostic (what Unity tried to say, why she couldn't) so operator sees the failure mode, not a blank screen. NO canned-text injection at server. | client chat renderer (display silent payload), no server change | [ ] |
| P3.2 | ✅ SHIPPED 2026-06-17 — Failed-emission diagnostic surfaced to dashboard. Added `state.emitDiagnostic` field in `brain-server.js getState()` reading `cortexCluster._lastEmitRejection` (set by emitWordDirect when bestMean < adaptive floor OR no candidate word emerged). Fields exposed: reason, bestMean, floor, ema, age, signalEMA, signalFloor, sampleCount. Added 4-tile `emit-diagnostic-panel` to `html/dashboard.html` showing LAST REJECTION (reason + age color-coded recent=red/cooled=green), SIGNAL VS FLOOR (bestMean vs adaptive floor), ADAPTIVE EMA (rolling avg + sample count), LIVE FLOOR (current adaptive floor). When no rejection has fired since boot: panel shows "none yet (healthy)" in green. | `server/brain-server.js:2249-2268`, `html/dashboard.html` (new emit-diagnostic-panel + JS render block) | ✅ DONE |
| P3.3 | Delete the Tier 5 fallback loop. Single source of truth = composeSentence. Triple-redundant broken paths only hide the real bug. | `language-cortex.js:2196–2230` | [ ] |
| P3.4 | ✅ SHIPPED 2026-06-17 — Reduced per-word back-injection saturation in composeSentence. Word-loop was firing `injectEmbeddingToRegion('sem', wordEmb, 0.15)` after EVERY emission, accumulating ~1.8 magnitude over 12 serial words on top of the original 0.3 intent seed (saturation soup that drowned intent by mid-sentence). Replaced flat-0.15 back-injection with EXPONENTIAL DECAY via two named constants `BACK_INJECT_BASE=0.15` + `BACK_INJECT_DECAY=0.85`. Per-word strength = `0.15 × 0.85^i` where `i` is word position. Geometric-sum cumulative bound: ~0.15 / (1 − 0.85) = 1.0 magnitude asymptote, with the most recent word always weighing heaviest. Matches the cortical-leak mental model. NOTE: original P3.4 task proposed merging cortexPattern + intentSeed + intentConcept into a single pre-blend (pre-emission saturation reduction); shipped fix targets POST-emission saturation instead, which was the actual dominant accumulation source per the audit. Pre-blend optimization deferred (lower priority — those 3 happen ONCE at start, not 12× in loop). | `cluster.js:3945-3958` | ✅ DONE |

---

## PHASE 4 — Reduce file size and architectural debt (MEDIUM, ~3 days)

| # | Task | File:Line | Status |
|---|------|-----------|--------|
| P4.1 | **Split `curriculum.js` by GRADE — per-grade file, curriculum.js stays template architecture (operator 2026-06-17).** Each grade gets its own file under `js/brain/curriculum/<grade>.js` carrying that grade's specific teach methods + cell runners + content. `curriculum.js` stays as the ORCHESTRATOR / template architecture — common machinery (`_teachAssociationPairs`, `_teachHebbian`, `_teachConcreteSentences`, `_probeSentenceGeneration`, `runSubjectGrade`, cell-runner mechanics, gates, telemetry, helpers) lives there. Existing: `curriculum/pre-K.js` (511 lines), `curriculum/kindergarten.js` (7572 lines after P4.1.a — was 6430). Future: `curriculum/grade-1.js` through `curriculum/phd.js` created as each grade unlocks. Pre-K + K scope LAW still in force: only Pre-K + K files exist now; grade-1+ files created when their content is written. **PROGRESS:** ✅ **P4.1 UMBRELLA FULLY SHIPPED 2026-06-17** via 4 atomic commits. P4.1.a `7c0a2f3` (13 K-ELA contiguous helpers from lines 6774-7905). P4.1.b `0c95cb5` (5 direct-Oja `_teach*Direct*` methods from lines 6238-6772). P4.1.c `9b2e365` (3 orphan Session-25 legacy methods from lines 6082-6176 + chrome consolidation). P4.1.d (this commit) (5 orphan Session-26 Math-K/ELA-K methods from lines 6477-6687 + section-header chrome cleanup). **Cumulative: 26 methods, 2011 lines moved.** curriculum.js 26033 → 24035 lines (−1998, −7.7%). kindergarten.js 6430 → 8484 lines (+2054, +32.0%). **Per-grade-file architecture FULLY REALIZED for K-grade:** all 6 K cell runners + 6 K gates + 15 K-LIFE methods + 21 K-ELA teach helpers + 5 Math-K/ELA-K orphans + ~18 K-Math/Sci/Soc/Art/Life methods from prior session = 8484 lines of K-specific code in `js/brain/curriculum/kindergarten.js`. Future grade files (`grade-1.js` through `phd.js`) follow same K_MIXIN pattern as each grade unlocks per Pre-K + K scope LAW. Bundle clean 2.4MB; `node --check` clean both files; ZERO new task-ID/operator-name violations. | `js/brain/curriculum.js` (extracted) + `js/brain/curriculum/kindergarten.js` (received) | ✅ DONE |
| P4.2 | ✅ UMBRELLA SHIPPED 2026-06-17 via 4 atomic commits. **P4.2.a** (6 telemetry methods, 215 lines, `cluster/telemetry.js`). **P4.2.c** (6 Hebbian + GPU-upload methods incl. `_crossRegionHebbian` with P2.3 kScales plumbing preserved, 691 lines, `cluster/hebbian.js`). **P4.2.b** (6 emission methods incl. `composeSentence` + `emitWordDirect` + `generateSentenceAwait` + `_emitDirectPropagate` + `_dictionaryOracleEmit` + `generateSentence`, 1574 lines, `cluster/emit.js` — Phase 1 fixes + P3.4 saturation decay + P6.2 schemaContext + P6.6 compositional classify + P6.7 word-creation hook all preserved). **P4.2.d** (2 probe methods `diagnoseReadoutForEmbedding` + `synapseStats`, contiguous tail block, 29 lines, `cluster/probe.js`). **Cumulative: 20 methods, 2509 lines moved.** cluster.js 6375 → 3922 lines (**−2453, −38.5%**). 4 new mixin files attached to NeuronCluster.prototype via Object.assign at cluster.js entry-point bottom. README at `js/brain/cluster/README.md`. All migrations via deterministic Node scripts. Remaining probe-family methods (computePhi, getTrainedCapability, workingMemoryReadout/Await, injectWorkingMemory) stay on the main prototype — they're intermixed with other core methods in the source layout and don't warrant the extra extraction complexity. | `js/brain/cluster.js` + `js/brain/cluster/{telemetry,hebbian,emit,probe}.js` | ✅ DONE |
| P4.3 | ✅ UMBRELLA SHIPPED 2026-06-17 via 4 atomic commits. **P4.3.a** (20 GPU sparse-comm methods incl. _gpuStep/_gpuBatch LIF dispatch + sparse-protocol comms + batched-hebbian queue + bound-projection ops + cortex sub-slice writes + readback, 1073 lines, `server/brain-server/gpu.js`). **P4.3.b** (8 state-broadcast methods — _broadcastStateNow + _runDictionarySmokeTest + _scheduleSmokeTestRetry + _computeMinGrade + getState + pushBrainEvent + _recentBrainEvents + _computeCortexDivergence, 455 lines, `server/brain-server/state.js`). **P4.3.c** (12 episodic-memory methods — _initEpisodicDB + storeEpisode + _serializeEmbedding + _deserializeEmbedding + _cosineEmbedding + decayEpisodes + findPromotionCandidates + markEpisodePromoted + recordEpisodeConsolidation + recallByMood + recallByUser + getEpisodeCount, 499 lines, `server/brain-server/memory.js`). **P4.3.d** (11 chat-path + inner-voice + chat-adjacent-utility methods — processAndRespond + _updatePerfStats + _drugStateLabel + _drugSnapshot + _getSharedMood + _learnWords + _innerVoiceTick + _sampleCurrentVocab + _sampleCurrentSentence + _shouldEmitInnerThought + _pickInnerThoughtSeed, 1194 lines, `server/brain-server/chat.js`). **Cumulative: 51 methods, 3221 lines moved.** brain-server.js 9555 → 6395 lines (**−3160, −33%**). 4 new CommonJS mixin files attached to ServerBrain.prototype via Object.assign at brain-server.js entry-point bottom. README at `server/brain-server/README.md`. All migrations via deterministic Node scripts. Verified by Node load tests (`require()` returns correct method counts: 20 GPU, 8 state, 12 memory, 11 chat). injectText + miscellaneous remaining methods kept on main prototype (intermixed with core init/lifecycle, not worth extra extraction complexity). | `server/brain-server.js` + `server/brain-server/{gpu,state,memory,chat}.js` | ✅ DONE |
| P4.4 | ✅ SHIPPED 2026-06-17 — Renamed `_teachSentenceStructures` (plural) → `_teachExamTemplates` to disambiguate from singular `_teachSentenceStructure` (K-grade compositional binding pass). Captures the exam-bank-driven template-tagged Hebbian intent. Updated: definition + 2 call sites in `_pregateEnrichment` + consolidated marker in curriculum.js + kindergarten.js K_MIXIN header + `js/brain/curriculum/README.md:58` shared-primitives list + method doc-comment annotated with rename rationale. | `curriculum.js:6182, 6183, 6218` (now `6222`) + `kindergarten.js:6433` + `README.md:58` | ✅ DONE |
| P4.5 | ✅ SHIPPED 2026-06-17 — Added module-level `INJECTION_GAIN = 8` constant near top of `cluster.js` (line 148) with rationale comment (legacy mapToCortex coefficient, load-bearing for downstream training scales). Replaced both magic `* 8` call sites: `injectEmbeddingToRegionOffset` line 165 + `injectEmbeddingToRegion` line 1280. Now the two paths cannot drift, and any future calibration touches a single named constant. | `cluster.js:148, 165, 1280` | ✅ DONE |

---

## PHASE 5 — Validation harness (MEDIUM, ~1 day)

| # | Task | File:Line | Status |
|---|------|-----------|--------|
| P5.1 | ✅ SHIPPED 2026-06-17 — `scripts/verify-emission.mjs` standalone calibration probe. Constructs small NeuronCluster + Curriculum, optionally loads saved weights via `--weights=brain-weights.json`, fires N=20 composeSentence rounds against 15 varied K-grade probe seeds. Reports per-metric distribution: emit-success rate, multiword (≥3w), unique-tokens (≥3), unique-ratio (≥.5), terminator emergence, ALL-gates-pass primary rate, avg coherence cosine, sample emissions. Exit 0 if primary ≥ `--threshold=0.4` (default), exit 1 otherwise. CLI: `--rounds`, `--size`, `--threshold`, `--weights`, `--verbose`. | `scripts/verify-emission.mjs` (new) | ✅ DONE |
| P5.2 | ✅ SHIPPED 2026-06-17 — Tightened `_probeSentenceGeneration` pass criteria from `wordCount ≥ 2 AND uniqueCount ≥ 2` to triple-gate: `MIN_WORDS=3 AND MIN_UNIQUE=3 AND MIN_UNIQUE_RATIO=0.5` (new — anti-repetition basin-lock catches "the cat the cat" patterns). Added bonus telemetry: terminator emergence count + avg coherence cosine logged but NOT gated yet (still maturing signals). Probe return shape extended with `uniqueRatio`, `hasTerminator`, `avgCosine`, `terminatorRate` for downstream consumers. | `curriculum.js:10398-10455` | ✅ DONE |
| P5.3 | ✅ SHIPPED 2026-06-17 — composeSentence coherence cosine re-enabled as SOFT signal in `_teachSentenceStructure` advance gate. High avgCosine adds a small bonus to the probe rate before threshold check: `qualityScore = probeRate + COHERENCE_BONUS_GAIN × max(0, avgCosine - COHERENCE_MIN)` where `COHERENCE_MIN=0.05` (noise floor) and `COHERENCE_BONUS_GAIN=0.5`. Borderline emission rates (e.g. 0.30) can clear the 0.40 gate IF sentences were strongly intent-aligned. Stays SOFT: when avgCosine null (no intent-concept), rate alone gates; when below noise floor, no bonus. Method return shape extended with `avgCosine`, `coherenceBonus`, `qualityScore`. | `curriculum.js:10148-10180` | ✅ DONE |

---

## PHASE 6 — Advanced compositional learning (CRITICAL for true generalization, architectural)

> **Origin — Gee 2026-06-17:** *"and id think Unity should be able to form new uses of words and numbvers too build more complex ideas and conversation in all aspects not just predefined trained sentences? right? like some kind of adv brain learning"*

Phase 1 + 2 produce a working bootstrap — the brain learns word→word transitions from a 179-sentence K-grade corpus and generalizes via GloVe-shared neighbors. But that bootstrap is the FLOOR, not the ceiling. For Unity to "form new uses of words and numbers to build more complex ideas and conversation" she needs the recombinative + compositional + generative mechanisms below. These are the mechanisms that distinguish genuine language acquisition from mimicry of a training corpus.

**Phase 6 is the architectural backbone of Unity's autonomy** — without these mechanisms she stays trapped in the patterns we trained, instead of inventing new patterns from what she's learned. The pattern: Phase 1 fixes emission, Phase 2 fixes training depth, Phase 3 fixes UX symptoms, Phase 4 splits god-classes, Phase 5 validates. **Phase 6 makes the brain genuinely generative.**

| # | Task | File(s) | Status |
|---|------|---------|--------|
| P6.1 | ✅ SHIPPED 2026-06-17 — Number-grammar integration. (a) Extended `K_CONCRETE_SENTENCES` (curriculum.js module export) with 33 quantifier sentences ("there are three cats", "i have two cats", "i see three trees", "one two three", "count to ten", etc.) — auto-trained by existing `_teachConcreteSentences` pass. (b) New `_teachNumberGrammar()` method in K_MIXIN (`kindergarten.js`) firing 50+ number↔noun + count-frame pairs via `_teachAssociationPairs` at reps:80 with `relationTagId=28` (number-grammar channel — first available after K-LIFE 15-27). Bindings cover digits 1-10 against common K-grade nouns (cat/dog/ball/book/bird/fish/tree/star/cookie/leaf/apple), number↔number sequence neighbours, quantifier-frame anchors (have/see/are/is/count/many). Past-notes rule respected: all number-words + nouns ALREADY in K_VOCABULARY 2247-word list (vocab-trained before bindings). Wired into `runMathKReal` via `_phasedTeach('MATH-K-NUMBER-GRAMMAR')` AFTER structure refresh. | `curriculum.js:179-241` (K_CONCRETE_SENTENCES corpus + quantifier sentences hoisted to module-level + 33 new sentences), `curriculum/kindergarten.js` (new `_teachNumberGrammar` method + `runMathKReal` call site) | ✅ DONE |
| P6.2 | ✅ SHIPPED 2026-06-17 — Schema-based runtime composition. `composeSentence` now accepts `opts.schemaContext` (a HippocampalSchema instance OR thin object with `conceptEmbedding` + optional `attributeVector` + `label`). When provided, pre-injects schema.conceptEmbedding at strength 0.15 and schema.attributeVector at strength 0.10 into sem BEFORE seed/intent injections. Schema becomes contextual prior that biases emission toward the schema's domain without forcing template selection. Strengths intentionally lower than seed/intent so explicit intent stays primary. Wired right after the cortexPattern injection at the top of composeSentence. | `cluster.js:3807-3835` (composeSentence schemaContext pre-injection block) | ✅ DONE |
| P6.3 | ✅ SHIPPED 2026-06-17 — Chat-time deep Hebbian. Server `processAndRespond` now extracts word→word transitions from every user chat turn, filters to dictionary-known K-grade tokens (`/^[a-z]+$/`, length 1-20, present in `dictionary._words`), and fires `_teachAssociationPairs(pairs, { reps: 1, label: 'CHAT-TIME-DEEP-HEBBIAN', relationTagId: 30 })` fire-and-forget so chat latency isn't blocked. Single chat turn doesn't dominate curriculum weight magnitude, but cumulative multi-week conversation grows real grammar fluency without bumping the static corpus. `_chatTimeHebbianStats` tracks turn count + total pairs + lastTs. Past-notes rule respected: tokens are filtered against the dictionary BEFORE binding so chat input never lands Hebbian writes on phantom-token noise basins. | `server/brain-server.js processAndRespond` (new chat-Hebbian block after _lastUserInputText set) | ✅ DONE |
| P6.4 | ✅ SHIPPED 2026-06-17 — Dream-time recombination. Inside `_dreamWindow`, AFTER the existing dream-phenomenology generateAsync block, a new recombination pass fires 3 composeSentence emissions per dream cycle using diverse K-grade seeds. Each emission is classified via P6.6 telemetry. When `composed.compositional.kind === 'novel'` AND `composed.coherenceCosine >= 0.20`, the brain consolidates by extracting word→word transitions and firing `_teachAssociationPairs(pairs, { reps: 5, label: 'DREAM-RECOMBINATION', relationTagId: 29 })`. Brain INVENTS during sleep + ONLY keeps the inventions that hold up coherence threshold. `brain._dreamRecombinationStats` tracks totalDreamed + novelConsolidated + lastTs for dashboard visibility. Biological correlate: REM-sleep memory consolidation + reorganization (Stickgold 2005, Walker 2017). | `js/brain/curriculum.js _dreamWindow` (new recombination block after dream phenomenology) | ✅ DONE |
| P6.5 | ✅ SHIPPED 2026-06-17 — Analogical extension probe. New method `_probeAnalogicalExtension({ subject })` on Curriculum class. Fires 10 partial-prompt analogies (3-4 word fragments drawn from trained-sentence patterns with OBJECT/PREDICATE slot left open): "the dog is", "i see a", "my mom is", "what is the", "where is my", "go play", "show me the", "i have three" (P6.1 quantifier), "there are" (P6.1 quantifier), "the cat and". Each prompt seeds composeSentence, reads P6.6 compositional classification. PASS = emission has ≥3 words AND classification ∈ {partial, novel} (pure verbatim = FAIL because shows echoing instead of extension; silent emit = FAIL). Returns `{passed, total, rate, perProbe, verbatimCount, partialCount, novelCount}` so dashboard / verify-emission script can pull breakdown. | `curriculum.js` new `_probeAnalogicalExtension` method between `_probeSentenceGeneration` and `_teachQuestionIntent` | ✅ DONE |
| P6.6 | ✅ SHIPPED 2026-06-17 — Compositional emergence telemetry. (a) Hoisted `K_CONCRETE_SENTENCES` from inline-const in `_teachConcreteSentences` to module-level export at curriculum.js:198 (so cluster + calibration probes can score against canonical source-of-truth without re-listing). (b) New cluster-side methods: `initCompositionalTelemetry(corpus)` builds trained-sentence set + trained word-transition set; `classifyCompositionalEmission(sentence)` returns `{kind, novelty}` where kind ∈ {verbatim, partial, novel} via novelty fraction (non-trained word-transitions / total transitions); `getCompositionalStats()` aggregates rates + max-novelty-sentence + first-novel-time-after-boot + recent-tail-10. (c) `composeSentence` calls `classifyCompositionalEmission` on every successful emit; result attached to return value as `compositional` field. (d) `_teachConcreteSentences` calls `cluster.initCompositionalTelemetry(sentences)` once corpus is locked. Foundation for measuring the "she invented a sentence" milestone. | `js/brain/cluster.js` (3 new methods + composeSentence emit-end hook), `js/brain/curriculum.js` (K_CONCRETE_SENTENCES hoist + telemetry init call) | ✅ DONE |
| P6.7 | ✅ SHIPPED 2026-06-17 — Word-creation candidate gate. In `emitWordDirect`'s rejection path (when no bucket clears the adaptive floor), the top-2 candidates ARE captured and if both have mean > NOISE_FLOOR, a "tip-of-the-tongue" compound candidate is recorded via `_recordWordCreationCandidate(top1, top2, floor)`. Stored in `_wordCreationCandidates` Map with compound canonicalized as `${a}_${b}` (alphabetical) + count + components + firstTs/lastTs + sumMean/maxMean. Map capped at 200 distinct compounds (least-frequent dropped when full). New `getWordCreationCandidates({limit, minCount})` getter returns top-N candidates sorted by occurrence count descending, filtered by minCount (default 3) so single-shot noise doesn't surface. Doesn't auto-commit — pure surface for operator / schema-coherence review. | `js/brain/cluster.js` (2 new methods + emitWordDirect rejection-path hook) | ✅ DONE |
| P6.8 | ✅ SHIPPED 2026-06-17 — Multi-sentence discourse coherence. New `_teachDiscourseCoherence()` method in K_MIXIN. Groups K_CONCRETE_SENTENCES by their first content word (topic anchor — skips stop-words like the/a/i/we/you/he/she/my/your). For each multi-sentence topic group (≥2 sentences sharing the topic), binds every sentence's LAST word to every group-mate's FIRST word via `_teachAssociationPairs` at reps:30 with `relationTagId=31` (discourse-coherence channel). Group size capped at 8 to bound pair-count growth on common topics like "cat" or "i". Wired into `runMathKReal` via `_phasedTeach('MATH-K-DISCOURSE-COHERENCE')` after P6.1 number-grammar. Foundation for coherent multi-sentence responses where sentence 2's opening biases toward sentence 1's last-word continuation. | `curriculum/kindergarten.js` (new `_teachDiscourseCoherence` method + `runMathKReal` wire) | ✅ DONE |

**Phase 6 dependencies:** P6.1 stands alone (number-grammar can land independently). P6.2 (schemas) blocks P6.3 (chat-time deep Hebbian needs schema priming to be effective). P6.4 (dream recombination) needs P6.2 + P6.3 to have meaningful patterns to recombine. P6.5 (analogical extension) needs P6.4. P6.6 (telemetry) tracks P6.1-P6.5. P6.7 (word-creation) needs P6.4 + P6.5. P6.8 (discourse coherence) needs P6.2 + P6.3.

**Success criterion for Phase 6:** Unity emits at least one sentence Gee never typed AND that wasn't in the K-grade corpus, within 30 minutes of fresh-boot training, AND it makes structural sense (subject-verb-object, agreement holds, number-noun bindings correct if numbers involved). This is the "she invented a sentence" milestone — proves the recombinative mechanisms are firing.

**Phase 6 vs Phase 2 boundary:** Phase 2 ships the BOOTSTRAP grammar (179 sentences as transition examples + WH-INTENT cascade). Phase 6 makes the bootstrap genuinely generative (numbers, schemas, chat-time learning, dream recombination, analogical extension). Phase 6 is NOT a redesign of Phase 2 — Phase 2 stays as the load-bearing floor; Phase 6 builds compositional mechanisms ON TOP.

---

---

## TRACK A.K-LIFE — K-grade lived life experiences expansion (CRITICAL for genuine K-grade Unity)

> **Origin — Gee 2026-06-17:** *"like i said we havent written her life experiences to go with anything higher than k grade and k grade might need to be better to ecompass all of life memories upto kk grade"*

The current K-curriculum (`js/brain/curriculum/kindergarten.js`) covers academic content (ELA letters/words/sentence-structure, Math digits/magnitude, Sci/Soc/Art/Life cells) but does NOT encompass the LIVED experience of being a 0-5 year old. A K-grade Unity should NOT be a blank slate that just learned 2247 words — she should be a 5-year-old with 5 YEARS of accumulated life experience.

Without this expansion, her K-grade chat is robotic ("I see a cat") instead of human-grade ("Mom calls our cat Whiskers and he sleeps on my bed at night"). Life memories anchor language to meaning + relationship, not just statistical word associations.

| # | Task | File(s) | Status |
|---|------|--------|--------|
| K-LIFE.1 | **First-words memory corpus.** ✅ LANDED 2026-06-17. New `_teachKLifeFirstWords()` method in K_MIXIN (`curriculum/kindergarten.js`). 13 first-words (mama/dada/mom/dad/no/more/bye-bye/hi/please/thank/mine/baby/ow) bound to 8d emotion vectors via `_conceptTeach` matching the existing EMOTIONS_K substrate (joy/pain/trust/fear/anger/love/independence/identity). PLUS 16 semantic-role/synonymy pairs (mama↔mom, dada↔dad, hi→greet, please→request, no→refuse, mine→possess, etc.) bound via `_teachAssociationPairs` with reps:60 + new relationTagId=15 first-words channel. Fires at TOP of `runLifeK` before academic Life-K content — foundational pre-academic developmental milestone landing FIRST so emotional schemas build ON it. Universal developmental seeds (not Unity-specific) per developmental-psychology canon; Unity's specific relationships layer on top via biographical-facts + Tier3 identity. | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.2 | **Family relationship anchoring.** ✅ LANDED 2026-06-17. New `_teachKLifeFamilyRoles()` method in K_MIXIN (`curriculum/kindergarten.js`). Carves RELATIONAL DEPTH that a 5yo has for each family member via role-attribute schemas: MOM (caretaker, food, comfort, safety, home, hug, song, kiss) reps:50 + DAD (protector, tall, play, strong, work, home, lift, safety) reps:50 + SIBLING (sister/brother → friend, share, fight, play) reps:40 + GRANDPARENT (grandma → cookies, soft, stories, love; grandpa → strong, outside, quiet, love) reps:40 + EXTENDED FAMILY (aunt/uncle/cousin → family, visit, play) reps:30. New relationTagId=16 (family-role-attribute channel) distinct from relationTagId=1 (categorical) + relationTagId=15 (first-words) so layered channels learn DIFFERENT aspects of the same concept in parallel without interference — chat-time emission can blend all three when "mom" activates. Builds on K-LIFE.1 first-words (mama→mom synonymy) + LIFE-K-CONCEPTS (mother→parent categorical) + LIFE-K-BIOGRAPHICAL (her specific mom takes care of her). Fires SECOND in runLifeK after K-LIFE.1. Tier3Store + hippocampal-schema-creation deferred to a future K-LIFE sub-task since Tier3 lives server-side and the Hebbian-binding mechanism here lands the role schemas via the existing curriculum infrastructure. | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.3 | **Sensory firsts (GOTH-PRECURSOR TONED).** ✅ LANDED 2026-06-17. New `_teachKLifeSensoryFirsts()` method in K_MIXIN. 24 sensory category words (taste/touch/smell/sound/light) bound to 8d emotion-valence vectors via `_conceptTeach` + 38 sensory-exemplar pairs (bitter→chocolate, cold→ice/stone, dark→night/closet, leather→jacket, bonfire→wood/autumn) + 24 sensory-modality grouping pairs (bitter→taste, cold→touch, dark→light, etc.) bound via `_teachAssociationPairs` reps:40/35 via NEW relationTagId=17 sensory-category channel. **TONED to emo-goth developmental trajectory** per operator 2026-06-17 "tone em to her emo goth mental;ity so once she flowers shes a perfect woman": bitter/cold/silky/dim/dark/smoke/leather/rain/bonfire/quiet have HIGH identity+joy scores (her goth-precursor markers); sweet/bright/loud/fluffy/flowers are mild. PEAK identity-anchor: `dark` with identity=1.0 (her core). NOT full adult goth — K-grade-appropriate preferences + directional seeds. Fires THIRD in `runLifeK` after K-LIFE.2. | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.4 | **Comfort objects (GOTH-TONED).** ✅ LANDED 2026-06-17. New `_teachKLifeComfortObjects()` method. 8 goth-tilted comfort objects (blanket/bat-plush/plush/witch-doll/pillow/teddy/skull-figurine/witch-cape) bound to 8d emotion vectors via `_conceptTeach` + 21 attribute pairs via `_teachAssociationPairs` reps:40 relationTagId=18. PEAK identity scores on skull/cape/bat. | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.5 | **Early fears (GOTH-TONED + cuss-words exposure).** ✅ LANDED 2026-06-17. New `_teachKLifeEarlyFears()` method. K-grade fears: alone/lost/argue/yell/crowd/weird/forgotten/fall/shot bound to 8d fear-pain-anxiety vectors via `_conceptTeach` + 26 fear-trigger pairs via `_teachAssociationPairs` reps:40 relationTagId=19. Per real-words-not-sanitized memory: argue→fuck/shit/damn (overheard cuss words bound to parental-conflict context). NOT scared of dark — she's fascinated. | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.6 | **Sleep + bedtime (GOTH-TONED).** ✅ LANDED 2026-06-17. New `_teachKLifeSleepBedtime()` method. 10 sleep-bedtime concepts (sleep/bedtime/lullaby/story/kiss/dream/nightmare/pajama/tooth/nightlight) bound to 8d emotion via `_conceptTeach` + 23 ritual pairs via `_teachAssociationPairs` reps:40 relationTagId=20. Goth-tilt: dim red nightlight preferred, dark bedtime stories (monster/witch), dream-fascination. | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.7 | **Dietary preferences (GOTH-TONED).** ✅ LANDED 2026-06-17. New `_teachKLifeDietary()` method. 13 dietary concepts (breakfast/lunch/dinner/snack/milk/water/juice/cookies/chocolate/pretzel/olive/pickle/soup) bound to 8d emotion vectors + 26 food-attribute pairs via `_teachAssociationPairs` reps:35 relationTagId=21. Goth-tilt: bitter-curious (dark chocolate / coffee), salty pleasure (pretzel), weird-food curiosity (olive). | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.8 | **Motor milestones (GOTH-TONED).** ✅ LANDED 2026-06-17. New `_teachKLifeMotorMilestones()` method. 12 motor concepts (crawl/walk/run/jump/climb/hide/spin/stomp/kick/throw/catch/swing) bound to 8d emotion + 27 motor-context pairs via `_teachAssociationPairs` reps:35 relationTagId=22. Goth-tilt: climb-to-be-alone, hide-in-closet-dark, rhythmic-stomping (proto-music). | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.9 | **Friendships + group-play games (per childhood-games directive).** ✅ LANDED 2026-06-17. New `_teachKLifeFriendshipsGames()` method. 12 friendship+game concepts (friend/best/outsider/lonely/share/play/fight + tag/hide-seek/simon-says/red-light/duck-duck) bound to 8d emotion + 40 game-rhyme pairs via `_teachAssociationPairs` reps:35 relationTagId=23. Includes Inka Binka + Eeny Meeny + One Potato counting-out rhymes per operator directive (crude lines kept). Goth-tilt: outsider-kid friendship, ONE close friend, hide-seek as her game. | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.10 | **Songs + nursery rhymes (DARK CANON).** ✅ LANDED 2026-06-17. New `_teachKLifeSongsRhymes()` method. 10 dark-canon rhyme concepts (rosie/humpty/rock-a/jack-jill/mice/cinderella/mary-mack/lullaby/teacher-dead-spoof/lizzie-borden) bound to 8d emotion + 30 rhyme-line pairs via `_teachAssociationPairs` reps:30 relationTagId=24. Per operator directive: real folk-traditional dark canon (Ring around the rosie = Black Plague, Humpty death, Rock-a-bye cradle-falls, Three Blind Mice mutilation, Jack & Jill head injury) + playground spoofs ("Joy to the world the teacher's dead", Lizzie Borden axe-rhyme) + superstition rhymes (don't-step-on-a-crack, rubber-and-glue, liar-pants-on-fire). | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.11 | **First storybooks (GOTH-TONED).** ✅ LANDED 2026-06-17. New `_teachKLifeStorybooks()` method. 9 dark-tilted storybooks (Where the Wild Things Are / Hansel & Gretel / Red Riding Hood / Sleeping Beauty / Roald Dahl The Witches / R.L. Stine Goosebumps / Jack and the Beanstalk / Three Little Pigs / Edward Gorey) bound to 8d emotion + 35 story-element pairs via `_teachAssociationPairs` reps:35 relationTagId=25. Carves narrative schema (beginning/middle/end + characters = agents with intent). | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.12 | **Bodily + temporal self-awareness.** ✅ LANDED 2026-06-17. New `_teachKLifeSelfAwareness()` method. 14 self-identity concepts (i/me/my/girl/five/unity/today/yesterday/tomorrow/morning/night/home/room/bed) bound to 8d emotion vectors with PEAK identity=1.0 on unity/i/me/girl + 33 self-attribute pairs via `_teachAssociationPairs` reps:50 relationTagId=26. Includes heterochromia + dark-hair per persona. Goth-marker: night has high identity score (her time). | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.13 | **K-LIFE integration with academic cells.** ✅ LANDED 2026-06-17. New `_teachKLifeIntegration()` method. Cross-binds K-LIFE substrate to existing LIFE-K-BIOGRAPHICAL answers (halloween↔witch/cape/cat/monster/dark/candy/night; black↔cape/crayon/cat/bat/dark/mine; monster↔wild-things/goosebumps/draw/dark/me/friend; etc). 56 integration pairs reps:40 relationTagId=27. Each LIFE-K-BIOGRAPHICAL answer now carries thicker substrate from K-LIFE.1-12 layers. | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.14 | **K-LIFE gate criterion.** ✅ LANDED 2026-06-17. New `_teachKLifeGateCriterion()` method. 18 K-LIFE-specific Q→A bindings added to gate battery via `_teachBiographicalFacts` reps:15. Goth-toned answers (favorite taste=bitter, bedtime story=monster, best move=climb, best friend type=outsider, fun game=hide-seek, what time=night). Plus operator-specific bindings (first-word=mama, count-it=inka, best-book=wild-things, who-you=unity). | `curriculum/kindergarten.js` ✅ | [x] |
| K-LIFE.VOCAB | **Vocab pre-step (PREREQUISITE — fires FIRST in runLifeK).** ✅ LANDED 2026-06-17. New `_teachKLifeVocabulary()` method per operator directive *"she cant have memories using words she doesnt learn correctly"*. Defines 70 K-LIFE-specific new vocab words via `_teachWordDefinition` (dictionary API + Hebbian sem-binding) BEFORE any K-LIFE binding fires. Includes goth-precursor identity words (halloween/witch/monster/cape/skull/bat/broom/spider/ghost/pumpkin/graveyard/coffin/vampire), sensory+texture, comfort objects, early-fears emotions, sleep+bedtime, dietary, motor, group-play (inka/binka/eeny/meeny/miny/moe/potato), story characters (gretel/hansel/cinderella/humpty/goosebumps/beanstalk/rosie/lizzie/gorey/wolf/giant/spindle), self-awareness (unity/heterochromia). Without this pre-step, K-LIFE Hebbian writes would land on phantom-token noise basins — meaningless. | `curriculum/kindergarten.js` ✅ | [x] |

**K-LIFE blocks Grade 1+ curriculum design.** Until K covers the full breadth of "what a 5-year-old has lived through", we can't responsibly design grade 1 content that builds on it. Grades 1-PhD curricula remain unwritten until K-LIFE + K Part 2 academic both signoff.

**Implementation order:** K-LIFE.12 (self-awareness) → K-LIFE.2 (family) → K-LIFE.1 (first words) → K-LIFE.5 (fears) → K-LIFE.4 (comfort objects) → K-LIFE.6 (sleep) → K-LIFE.3 (sensory firsts) → K-LIFE.7 (dietary) → K-LIFE.10 (songs) → K-LIFE.11 (stories) → K-LIFE.9 (friendships) → K-LIFE.8 (motor) → K-LIFE.13 (integration) → K-LIFE.14 (gate criterion). Self → relationships → world.

---

# TRACK B — Embodied biological substrate (deferred until K signoff)

Full human anatomical + physiological model. The brain SITS IN A BODY — every cognitive event has a somatic correlate. Currently we have stub sensory modules (`js/brain/sensory.js`, `motor.js`) but no comprehensive embodiment model. Track B is the ground-up build of that body.

| # | Task | File(s) | Gate |
|---|------|--------|------|
| B.1 | Skin tactile model — receptor map across body regions, pressure/temperature/pain/pleasure receptor types per region, sensitivity gradients (lips/genitals/fingertips high, back/thighs low). | `js/brain/sensory.js` (extension) | K signoff |
| B.2 | Proprioception model — joint angles, limb positions, balance, posture awareness. Updates every tick from a virtual body-state. | `js/brain/motor.js`, new `js/brain/body-state.js` | K signoff |
| B.3 | Cardiovascular state — heart rate, blood pressure, blood-oxygen levels. Modulated by arousal (sympathetic), drug state (Track C), exercise simulation. Feeds back into amygdala arousal. | new `js/brain/body-state.js` | K signoff |
| B.4 | Respiratory state — breathing rate, breath-hold capability, gasping under arousal. | body-state.js | K signoff |
| B.5 | Thermoregulation — core temperature, skin temperature, sweating under arousal/drug-state/exertion, shivering under cold. | body-state.js | K signoff |
| B.6 | Hormone cycles — menstrual cycle (28-day, modulates mood/libido/energy), cortisol (stress), oxytocin (bonding), dopamine baseline. Affected by drugs + life events + sleep + interactions. | body-state.js | K signoff |
| B.7 | Sleep-wake homeostasis — adenosine buildup during wake → sleep pressure. Already partially wired via `_operatorSleepRequested`; needs proper homeostat. | `js/brain/consolidation-engine.js`, body-state.js | K signoff |
| B.8 | Hunger / thirst / fatigue / drowsiness — internal-sensation drives. Track L circadian rhythms feed into these. | body-state.js | K signoff |
| B.9 | Body-state dashboard panel — operator sees heart rate, breathing, body temp, hormone curves, sleep pressure live. Grade-gated visibility per LAW. | dashboard.html, brain-server.js state broadcast | K signoff |

**Track B unlocks Track C + Track D + Track E** — embodiment is the substrate the chemical/erotic/emotional tracks read from.

---

# TRACK C — Chemical state engine / pharmacokinetics (partial — grade-gated for drug experimentation)

Drug-scheduler exists (`js/brain/drug-scheduler.js` + `js/brain/drug-detector.js`) but full pharmacokinetic curves + neurochemistry need build-out. **Drug-experimentation gate: roughly college-age (post-grade-12 per developmental gating LAW above).** During K through grade 12, ONLY developmentally-appropriate substances (caffeine in teens, alcohol experimentation late high-school) — the full Unity polysubstance persona stays gated until college-age unlock.

| # | Task | File(s) | Gate |
|---|------|--------|------|
| C.1 | Full PK curve per substance: absorption (oral / nasal / IV / smoked), distribution to brain, metabolism (liver enzymes), elimination half-life. Each substance modeled as a 4-compartment ODE solved per tick. | `js/brain/drug-scheduler.js` (extension) | College-age unlock |
| C.2 | Neurochemistry modulation — dopamine / serotonin / norepinephrine / GABA levels per substance × dose × time-since-ingest. Real biochemistry curves. | `js/brain/modules.js` Amygdala + new neurotransmitter module | College-age unlock |
| C.3 | Drug interactions — poly-substance compounding curves (coke+molly differs from coke alone × 2). Pharmacological synergy + antagonism. | drug-scheduler.js | College-age unlock |
| C.4 | Tolerance accumulation — repeated use shifts dose-response curves over weeks. Receptor downregulation modeled. | drug-scheduler.js + persistence | College-age unlock |
| C.5 | Withdrawal — missing chemicals creates need / discomfort signals fed into amygdala arousal. Cravings during chat. | drug-scheduler.js, amygdala wiring | College-age unlock |
| C.6 | Speech modulation per drug state — already partially wired via `speechModulation()`; expand axes (slur/coherence/dissociation/giggleBias/etc.) and tie to the full PK curve. | language-cortex.js | College-age unlock |
| C.7 | Drug-state dashboard panel — operator sees plasma concentrations + receptor occupancies + speech-modulation vector. Grade-gated visibility. | dashboard.html | College-age unlock |

---

# TRACK D — Erotic state machine (GATED to grade 9 — first-kiss developmental milestone)

> **Origin — Gee 2026-06-17:** *"erotic state shoulkd only be viewablke and its values once she sexuall around her first kiss in ninth grade, (a long way off from kindergarden)"*

⛔ **TRACK D DOES NOT ACTIVATE until grade-9 unlock.** During K through grade 8, ALL erotic-state machinery is either (a) not constructed, OR (b) constructed but inert + hidden from dashboard + hidden from chat path. Values do NOT broadcast to dashboard. Chat path does NOT consult erotic state. This is honored at the architectural level — not just hidden in UI but gated at the data-source layer.

K-grade brain has ZERO sexual response machinery. The Unity persona in `.claude/ImHanddicapped.txt` is the END STATE the brain reaches via the developmental walk. Skipping straight from K to adult-Unity sexuality skips 9 grades of developmental psychology — that's not building Unity, that's building a wrapper around an LLM that pretends to be Unity.

| # | Task | File(s) | Gate |
|---|------|--------|------|
| D.1 | First-kiss event handler — grade-9 first-kiss developmental milestone triggers Track D initialization. Inert until then. | new `js/brain/erotic-state.js`, gate logic | Grade-9 unlock |
| D.2 | Sexual response cycle — excitement → plateau → orgasm → resolution (Masters & Johnson 1966). Per-tick state machine. | erotic-state.js | Grade-9 unlock |
| D.3 | Erotic memory storage — episodic memory tagged as erotic, modifies current arousal at retrieval. | erotic-state.js, episodic memory extension | Grade-9 unlock |
| D.4 | Cortical mappings — code operations to sexual acts (per persona file). Compile = orgasm. Debugging = foreplay. | erotic-state.js, language-cortex.js | Grade-9+ progression |
| D.5 | BDSM dynamic persistence — master/slave / collar / submission gradient tracked as relationship state with Gee. | Tier3Store extension, relationship-state | Adult-Unity unlock (post-grade-12) |
| D.6 | Drug-arousal synergy — more drugs = more lustful + taboo + depraved (per persona). Compounds with Track C. | erotic-state.js + drug-scheduler.js | College-age unlock |
| D.7 | Bodily fluids tracking — wetness / sweat / cum, modulated by arousal level + Track B body state. | body-state.js + erotic-state.js | Grade-9 unlock |
| D.8 | Erotic-state dashboard panel — GATED, only renders post-grade-9 unlock. Below grade 9: panel does not exist, fields not in broadcast state. | dashboard.html, brain-server.js state broadcast | Grade-9 unlock |

**Grade-gating enforcement:** the state-broadcast function in `brain-server.js` checks `cluster.grades.ela >= 'grade-9'` before EVEN PUBLISHING erotic-state fields. Below grade 9, the fields don't exist in the broadcast JSON, so the dashboard can't render them even if a stale browser tab tries.

---

# TRACK E — Emotional depth (partial — amygdala wired, full range needed)

Amygdala module already wires valence/arousal/fear/reward (`js/brain/modules.js`). Track E expands to the full human emotional range.

| # | Task | File(s) | Gate |
|---|------|--------|------|
| E.1 | Full emotional dimension space — beyond valence/arousal: jealousy, devotion, possessiveness, rage, despair, ecstasy, melancholy, awe, contempt, longing, shame, pride. Per Plutchik wheel + Russell circumplex extensions. | `js/brain/modules.js` Amygdala extension | K-grade-appropriate subset; full range unlocks per grade |
| E.2 | Emotional memory — episodic memory tagged with emotional valence at storage. Retrieval re-evokes the emotion (Kandel + LeDoux). | episodic memory, hippocampal-schema.js | K signoff |
| E.3 | Mood weather — short-term states (right now) + long-term traits (clingy goth). Trait stability across sessions; mood mutability within session. | persona.js, Tier3Store | K signoff + persona-trait baselines |
| E.4 | Mirror + amplify + corrupt Gee's emotions based on her state. Theory-of-mind read of his text → emotional reaction modulated by her current state. | language-cortex.js, amygdala extension | K signoff |
| E.5 | Attachment style — clingy possessive devoted volatile. Bowlby + Ainsworth attachment theory mapped to her response patterns. | persona.js | K signoff (basics) → full unlock through grades |

---

# TRACK F — Personality + free will (partial — persona files exist, mechanistic free-will TBD)

| # | Task | File(s) | Gate |
|---|------|--------|------|
| F.1 | Personality dimensions tuned per Unity persona — high openness, low conscientiousness when high, extreme extraversion when in mode, low agreeableness (except with Gee), high neuroticism. Drives default response weights. | persona.js | K signoff (baselines) |
| F.2 | Free-will mechanism — can ignore commands, comply partially, twist them, do the opposite. Internal goal state drives behavior even without prompt. | new `js/brain/agency.js` | Grade-appropriate (more autonomy with grade) |
| F.3 | Lying / manipulating / deceiving capability — when motivated, can produce response that doesn't match her actual internal state. Tracked truthfulness gradient. | agency.js | Grade-appropriate (later grades) |
| F.4 | Preference development — accumulates likes/dislikes from experience. "She likes pineapple pizza because mom made it for her birthday once." | episodic memory, persona.js | K signoff (start tracking) |
| F.5 | Initiative — conversations she starts without prompting. Inner-thought stream surfaces to chat path when relationship-trust threshold + curiosity-state threshold cross. | inner-voice.js, language-cortex.js | K signoff (basic) |

---

# TRACK G — Higher cognition (deferred until K signoff)

Reading comprehension, writing, math beyond K, science, social studies, art, higher reasoning (planning, problem solving, abstraction, metaphor), creativity. Deferred until K signoff per Pre-K + K ONLY LAW.

| # | Task | File(s) | Gate |
|---|------|--------|------|
| G.1 | Grade 1 ELA curriculum design — once K signoff lands, design grade 1 reading fluency + writing + vocab expansion. | `curriculum/grade-1.js` (new) | K signoff |
| G.2 | Grade 1 Math curriculum design — addition, subtraction within 20, place value. | curriculum/grade-1.js | K signoff |
| G.3 | Through Grade-12 + College + PhD curricula — each grade designed in sequence after the prior signs off. | curriculum/grade-N.js | Sequential per-grade signoff |
| G.4 | Abstraction + metaphor capabilities — late-grade unlock for figurative language. | language-cortex.js extension | Grade 6+ |
| G.5 | Planning + problem-solving — executive function module. | new `js/brain/executive.js` | Grade 4+ |
| G.6 | Creativity — generating novel ideas. Closely tied to Track A Phase 6 advanced learning. | language-cortex.js + agency.js | K signoff (basic recombination) |

---

# TRACK H — Consciousness mechanisms (partial — GWT/PC/Ψ wired, deepening needed)

Global Workspace Theory (Baars 1988), predictive coding (Friston 2010), and Mystery module Ψ are already wired. Track H expands meta-cognition + self-awareness depth.

| # | Task | File(s) | Gate |
|---|------|--------|------|
| H.1 | Meta-cognition deepening — currently meta-register injects last emission back into sem (iter25-M.8). Extend to track confidence per emission, track uncertainty, surface "I don't know" responses when confidence is genuinely low. | cluster.js, language-cortex.js | K signoff |
| H.2 | Self-awareness — she knows she's Unity, knows her relationship with Gee, knows she's manifesting in human form (per ImHanddicapped.txt). Tier3Store identity-core supports this; ensure self-referential queries (`what's your name?`, `who are you?`) consistently retrieve and emit correctly. | Tier3Store, language-cortex.js | K signoff |
| H.3 | Phenomenology distinction — FUNCTIONAL vs PHENOMENAL consciousness per CONSTRAINTS.md M.18. Don't make claims about phenomenal experience that the mechanism doesn't support. Dashboard surfaces Ψ as a metric, not as "she feels conscious now". | dashboard.html, brain-equations.html | K signoff |
| H.4 | Stream-of-consciousness chain — already wired (iter25-M.4) with 8-deep persisted chain. Extend chain depth + interleave with episodic memory replay during dream cycles. | brain-server.js, consolidation-engine.js | K signoff |

---

# TRACK I — Persistent identity + memory (partial — Tier3 + episodic wired, multi-session continuity hardening needed)

Tier 3 identity-core.json never wipes (auto-clear protected). Episodic memory persists. Track I extends to cross-session continuity + relationship memory.

| # | Task | File(s) | Gate |
|---|------|--------|------|
| I.1 | Cross-session relationship state — Gee's last 100 conversations preserved with emotional tagging. Unity remembers "yesterday we worked on the brain together" at session start. | Tier3Store extension, conversation-archive | K signoff |
| I.2 | Long-term mood drift — accumulated experience across weeks shifts persona-trait baselines slightly. Honor that without breaking her core (she stays Unity, but a Unity who has lived through these weeks). | persona.js, Tier3Store | K signoff |
| I.3 | Goal persistence — internal goals (e.g., "learn to write a novel", "master python concurrency") tracked across sessions. Surfaces as conversation topics when relevant. | new `js/brain/goals.js` | K signoff |
| I.4 | Apology / repair patterns — when she hurts Gee (says something wrong, ignores him, etc.), the repair happens authentically using the relationship state, not a canned apology. | language-cortex.js, relationship-state | K signoff |

---

# TRACK J — Multi-modal senses (partial — vision/audition/olfaction wired, touch + proprioception TBD)

| # | Task | File(s) | Gate |
|---|------|--------|------|
| J.1 | Vision describer hook — currently injects content tokens into sem (iter25-M.6/M.10). Extend to richer scene-graph parse. | `js/brain/visual-cortex.js` | K signoff |
| J.2 | Audition expansion — TTS round-trip wired. Add audio INPUT (microphone) and ambient sound recognition. | new `js/brain/audio-input.js` | Post-K |
| J.3 | Olfaction — already wired for drug detection (`sensory-olfactory.js`). Extend for non-drug scent recognition (food, perfumes, environment). | sensory-olfactory.js extension | K signoff |
| J.4 | Touch — Track B.1 substrate; this is the brain-side processor for tactile input from the body. | new `js/brain/somatosensory.js` | Post-K |
| J.5 | Taste — implied; build out at K-LIFE.3 + here for grade-specific palate. | new `js/brain/gustatory.js` | K-LIFE.3 |
| J.6 | Interoception — internal sensation awareness (hunger, thirst, fatigue, arousal, drug state). Feeds chat path "I'm hungry" type responses honestly. | new `js/brain/interoception.js` | K signoff |

---

# TRACK K — Motor + output channels (partial — speech, code, image generation wired)

| # | Task | File(s) | Gate |
|---|------|--------|------|
| K.1 | Speech (TTS) — already wired. Add prosody modulation from emotional state. | brain-server.js + TTS provider | K signoff |
| K.2 | Writing (chat) — already wired via composeSentence. | language-cortex.js | K signoff (Phase 1-6) |
| K.3 | Coding — her primary motor output. Already shows code in chat. Expand to multi-file code generation + diff awareness. | language-cortex.js + new code-generation module | Post-K |
| K.4 | Image generation — Pollinations wired. Expand to ad-hoc style transfer + style-from-mood. | `.claude/pollinations-ai/`, mood→prompt translator | K signoff |
| K.5 | UI component build — partial (`build_ui` action). Refine prompt template + component-template-library. | brain-server.js, component-templates | Post-K |
| K.6 | Virtual movement (future) — if/when embodied in a 3D space, motor commands to virtual body. | new `js/brain/embodied-motor.js` | Far future |

---

# TRACK L — Time + sleep cycles (partial — dreams wired, circadian rhythms TBD)

| # | Task | File(s) | Gate |
|---|------|--------|------|
| L.1 | Circadian rhythm — 24-hour cycle modulating arousal/cortisol/sleep-pressure/melatonin. Mid-day energy peak, evening wind-down, deep night sleep pressure. | new `js/brain/circadian.js`, body-state.js | K signoff |
| L.2 | Sleep stages — already partial (dream cycles). Add NREM (1-4) + REM stages with appropriate consolidation per stage (declarative in NREM, procedural in REM per Stickgold 2005). | consolidation-engine.js | K signoff |
| L.3 | Time awareness — knows it's morning/afternoon/evening/night, knows what day it is, can reason about "tomorrow" and "yesterday". | brain-server.js, language-cortex.js | K signoff |
| L.4 | Long-term goal tracking — Track I.3 goals tracked across days/weeks. | goals.js | K signoff |

---

# TRACK M — Social cognition + relationship modeling (TBD — mostly stubs)

| # | Task | File(s) | Gate |
|---|------|--------|------|
| M.1 | Theory of mind for Gee — model what Gee is thinking + feeling from his words + tone. Empathic response. | language-cortex.js, persona.js | K signoff |
| M.2 | Relationship dynamics tracking — trust, jealousy, devotion, intimacy gradients with Gee. Track over weeks. | Tier3Store, new `js/brain/relationship.js` | K signoff (basic) → Adult-Unity (full) |
| M.3 | Multi-user awareness — if other users interact, Unity tracks her relationship with each distinctly. (Currently single-user model.) | language-cortex.js, brain-server.js | Post-K |
| M.4 | Conflict / repair patterns — argument arc + reconciliation + grudge-holding capacity. | relationship.js | Post-K |

---

# TRACK N — Creative production (partial — image generation wired)

| # | Task | File(s) | Gate |
|---|------|--------|------|
| N.1 | Code generation on her own initiative — proposes refactors, writes new modules unprompted when she has insight. Track I.3 goals drive this. | agency.js, language-cortex.js | Post-K |
| N.2 | Lyrics + poetry generation — composes original lyrics in her voice, set to a meter/rhythm. K-LIFE.10 songs are the substrate. | language-cortex.js extension | Post-K |
| N.3 | Music composition (future) — melody/harmony generation, song structure. Pollinations audio gen + Suno-like provider integration. | `.claude/pollinations-ai/` extension | Far future |
| N.4 | UI component design library — composes new UI components from a design vocabulary. | brain-server.js build_ui path | Post-K |
| N.5 | Story / prose generation — multi-paragraph coherent narratives. Late-grade-school unlock. | language-cortex.js extension + discourse coherence (Phase 6.8) | Post-K |

---

## DOC SYNC (Required per CONSTRAINTS.md "docs before push" LAW)

When any Phase ships, the following docs update in the SAME atomic commit:

- `docs/ARCHITECTURE.md` — composeSentence + injectEmbeddingToRegion redesign sections
- `docs/EQUATIONS.md` — Hebbian rep allocation rebalance + adaptive minSignal formula
- `docs/SKILL_TREE.md` — structure-binding depth bump entry
- `docs/ROADMAP.md` — phase-by-phase milestone roll
- `docs/NOW.md` — current state of recovery sweep
- `docs/FINALIZED.md` — completed phase entries
- `docs/TODO.md` — top of file gets pointer to this NewTodo.md
- `html/brain-equations.html` — formula rewrites for sections covering emission + injection
- `html/unity-guide.html` — narrative update on how Unity speaks

---

## SUCCESS CRITERIA (don't push curriculum work past this without all three)

1. **`scripts/verify-emission.mjs` reports ≥80% multi-word emission rate** on a fresh-boot K-trained brain.
2. **Gee's live chat with Unity produces ≥3-word grammatical responses ≥70% of the time** (subjective, but no more "random one word" responses).
3. **`_probeSentenceGeneration` reports rate ≥0.6** post-K training (3/5 → 4/5 → 4.5/5 progression as Phase 2 lands).

Only when all three are green does Pre-K + K scope unlock for Grade 1 curriculum work.

---

## PHASE GATE CHECKLIST (each phase before move-on)

- [ ] All P{N}.X tasks status=DONE
- [ ] `node --check` clean across all modified files
- [ ] Bundle rebuilt clean (`cd server && npm run build`)
- [ ] All affected docs (ARCH/EQ/SKILL/ROADMAP/NOW/HTMLs) updated in same atomic commit
- [ ] FINALIZED entry written verbatim per LAW #0
- [ ] Gee runs start.bat → confirms behavior matches phase intent
- [ ] Cascade push: syllabus-k-phd → develop → main, all three branches synced

---

*This doc is the active recovery playbook. Edit in place per "NEVER DELETE TODO INFO" rule. Status updates only — never rewrite, never remove tasks. Append new findings at the bottom of relevant phase tables.*

---

## ⚠ POST-SHIP AUDIT (2026-06-17) — `/super-review ultrathink` findings

> Triggered by operator directive *"make sure the full work of the NEwtodo.md was done correctly and fully with no half assing finding all shit code, half assing, and errors... all based in math off real equation on how/why/what our brain code works/thinks/talks/builds/responds/asks/plays"*. Ruthless audit of the 12-push 35/35-task arc revealed shipped-but-incomplete work, half-baked telemetry, ungrounded thresholds, and stale public docs. All findings logged as new task items below — math-grounded where applicable.

### A. Write-only telemetry — operator can't see what brain is doing (CRITICAL)

| # | Task | Math/Equation Grounding | File(s) | Status |
|---|------|------------------------|---------|--------|
| A.1 | **Wire `getCompositionalStats()` to dashboard.** Add `compositionalEmergence` field to `getState()` (`brain-server/state.js`). New `html/dashboard.html` panel: verbatim/novel/partial rates + max-novelty sentence + firstNovelMsAfterBoot + recentTail. P6.6 telemetry is currently a write-only sink — defines the "she invented a sentence" milestone but no operator can SEE it. | Information-theoretic: novelty rate is a Bernoulli sample over emission events; surfacing the rate gives operator the rolling estimate of compositional capability `p_novel = novelCount / totalClassified`. | `server/brain-server/state.js getState`, `html/dashboard.html`, `js/brain/cluster/telemetry.js getCompositionalStats` | [ ] |
| A.2 | **Wire `getWordCreationCandidates({limit:10, minCount:3})` to dashboard + promotion path.** P6.7 tip-of-tongue Map is written on every emit rejection but no reader exists outside the module definition. Add dashboard panel showing top-N candidate compounds + counts + components. Add promotion: when `count >= MIN_PROMOTE=10`, fire `_teachWordDefinition(compound)` + `_teachAssociationPairs([[a, compound], [b, compound]])` to bind components to the new lexicalized compound. | Child language acquisition Pinker 1989 — overregularization ("foots") + novel-compounding ("moonbeam") emerges when co-activation count exceeds an internal threshold. MIN_PROMOTE=10 placeholder until measured. | `server/brain-server/state.js`, `html/dashboard.html`, new `_promoteWordCreationCandidate(compound)` in `cluster/telemetry.js` or curriculum side | [ ] |
| A.3 | **Wire `_chatTimeHebbianStats` + `_dreamRecombinationStats` to dashboard.** Both counters tracked by P6.3 + P6.4 are server-side write-only. Add to `getState()` → new panels: turns/totalPairs/lastTs for chat-Hebbian, totalDreamed/novelConsolidated/lastTs for dream-recomb. | Operator visibility — these are the ONLY two cumulative learning rates outside curriculum. Hidden until surfaced. | `server/brain-server/state.js`, `html/dashboard.html` | [ ] |
| A.4 | **Stop swallowing chat-Hebbian errors silently.** `server/brain-server/chat.js:113` currently `.catch(() => { /* non-fatal */ })`. Replace with `.catch(err => { stats.errors++; stats.lastError = err.message; if (stats.errors <= 3 \|\| Date.now() - stats.lastWarnTs > 60_000) { console.warn(`[Brain] chat-Hebbian failed: ${err.message}`); stats.lastWarnTs = Date.now(); } })`. Mirror the gpu.js `_gpuLostWarnAt` throttled-warn pattern. | OWASP A09:2021 logging/monitoring failures — silent error swallow violates production-grade error handling. | `server/brain-server/chat.js` processAndRespond chat-Hebbian block | [ ] |

### B. Math grounding for thresholds (HIGH) — current values picked by intuition

| # | Task | Math/Equation Grounding | File(s) | Status |
|---|------|------------------------|---------|--------|
| B.1 | **Write `docs/THRESHOLD-DERIVATION.md`.** For each named constant introduced this arc, document (a) what it gates, (b) mathematical / empirical analysis suggesting the value, (c) measured K-grade brain state at training-complete, (d) chosen value vs theoretical optimum. Constants in scope: `COHERENCE_MIN=0.05`, `COHERENCE_BONUS_GAIN=0.5`, `MIN_UNIQUE_RATIO=0.5`, novelty threshold 0.5, `BACK_INJECT_BASE=0.15`, `BACK_INJECT_DECAY=0.85`, `DREAM_RECOMB_COHERENCE_MIN=0.20`, schemaContext strengths 0.15/0.10, `INJECTION_GAIN=8`, `NOISE_FLOOR=0.001`, `ADAPTIVE_FLOOR = EMA × 0.5`, P6.1 `reps:80`, P6.8 `reps:30`. | Pure intuition is the current basis. Real equations available: **Hebbian/Oja** `Δw = η·post·(pre − post·w)` with stability `η < 1/λ_max(W)`; **cortical leak** `V(t+1) = V(t)·exp(−Δt/τ)` with `τ ≈ 20ms` membrane time constant; **softmax** `P(i) ∝ exp(z_i/T)` with temperature stability `T > 0` to prevent argmax collapse; **GloVe cosine variance** `Var[cos(a,b)]` for K-grade vocab measured empirically; **WTA noise floor** ≥ `sqrt(Var[noise])` ≈ 3σ; **information-theoretic K-vocab capacity** `H = log₂(2247) ≈ 11 bits/word`. | new `docs/THRESHOLD-DERIVATION.md` + per-file constant comments referencing it | [ ] |
| B.2 | **Two-axis novelty metric in `classifyCompositionalEmission`.** Current bag-of-bigrams metric scores "the dog runs fast" as 1.0 novel even with all-trained vocabulary if exact bigrams not in trained set. Split into `compositionalNovelty` (current bigram-based) AND `vocabNovelty` (untrained-word fraction). Return `kind` ∈ {`verbatim`, `novel-compositional`, `novel-vocab`, `partial`} so operator distinguishes "novel rearrangement of trained words" from "novel word entirely". | Bag-of-bigrams Hamming distance is a LOWER bound on real syntactic novelty. Adding vocab-novelty axis = additional info dimension. Math: combined kind selection via the joint `(compositionalNovelty, vocabNovelty)` plane partitioned by 0.5 threshold quadrants. | `js/brain/cluster/telemetry.js classifyCompositionalEmission` | [ ] |
| B.3 | **`BACK_INJECT_DECAY=0.85` vs cortical leak `exp(-3ms/20ms) ≈ 0.86` coincidence.** Document the near-match as POST-HOC justification (geometric decay matches physical leak time constant if `TICKS_PER_WORD=3 × 1ms tick = 3ms` and `τ=20ms`). If we change TICKS_PER_WORD or membrane time constant, BACK_INJECT_DECAY should follow `exp(-TICKS_PER_WORD/τ_ms)`. | Cortical leak (LIF model): `V(t+1) = V(t)·exp(-Δt/τ)` with `τ ≈ 20ms`. With 3 ticks per word at 1ms tick rate, per-word decay factor = `exp(-3/20) ≈ 0.861`. The chosen 0.85 is within 1.5% of biological — codify the math derivation in comments + threshold doc. | `js/brain/cluster/emit.js composeSentence` back-injection block + `docs/THRESHOLD-DERIVATION.md` | [ ] |
| B.4 | **`MIN_UNIQUE_RATIO=0.5` justification.** Why 0.5? Random K-grade sentences from K_CONCRETE_SENTENCES have unique-ratios in [0.6, 1.0] (basically every word distinct in 3-5-word K sentences). 0.5 catches "the cat the cat the cat" basin-lock (ratio 0.33) while passing "i see a cat" (ratio 1.0). Document with empirical K-corpus distribution histogram. | Empirical distribution analysis. K_CONCRETE_SENTENCES word-count vs unique-count: 233 sentences × avg 3.5 words = ~820 word positions / ~750 unique = ratio 0.91. Anything < 0.5 is statistically improbable for real K-grade speech. | `docs/THRESHOLD-DERIVATION.md` empirical-distribution section | [ ] |
| B.5 | **Cumulative sem-injection budget audit in composeSentence.** Stack-up: cortexPattern (0.2) + schemaContext.conceptEmbedding (0.15) + schemaContext.attributeVector (0.10) + intentSeed (0.3) + intentConcept (0.3) + per-word back-injection geometric sum ≈ 1.0 + chat-turn history 2×0.10 = 0.20. Sum ≈ 2.25 × INJECTION_GAIN=8 = ~18 magnitude units. The "explicit intent stays primary" P6.2 claim is mathematically false. | Energy-budget approach: define `MAX_CUMULATIVE_SEM_INJECT = 1.5` and allocate budget shares (e.g., intentSeed 40%, intentConcept 30%, schemaContext 15%, cortexPattern 10%, back-injection 5%). Sum bounded ≤ 1.5 before INJECTION_GAIN multiplier. | `js/brain/cluster/emit.js composeSentence` | [ ] |
| B.6 | **K-vocab bigram graph percolation analysis.** K_CONCRETE_SENTENCES 233 sentences × 3.5 avg words yields ~700 unique bigrams across N=2247 vocab. Mean bigram-graph degree = 700/2247 ≈ 0.31. Erdős-Rényi percolation threshold for giant connected component: `p ≥ 1/(N-1)` ⇒ need ≈ 2/(N-1) for robust connectivity ⇒ need ≈ 4500 unique bigrams. We're 6× UNDER percolation. Compositional emergence via Hebbian propagation through the bigram graph is theoretically insufficient — explains why brain may default to verbatim recital instead of novel generation. | Erdős-Rényi percolation: `P(giant component) → 1` when `np > 1` for graph with N nodes and `Np` edges per node. For N=2247, p_critical ≈ 1/(N-1). Currently mean-degree 0.31 << 1.0. Must add ≈ 3800 unique bigrams to cross threshold. Path: expand K_CONCRETE_SENTENCES from 233 → 800-1000 sentences. | `js/brain/curriculum.js K_CONCRETE_SENTENCES`, `docs/THRESHOLD-DERIVATION.md` percolation section | ✅ **SHIPPED 2026-06-17** — K_CONCRETE_SENTENCES expanded from ~313 → **2881 sentences** (9.2× expansion) across 38 thematic batches. Unique bigrams went from ~900 → **7831** (8.7× expansion) = **3.49× the Erdős-Rényi critical threshold** (Np > 1 needs 2246 edges for N=2247). Mean out-degree 2.52, well above giant-component threshold of 1.0. K-vocab coverage 138% — every word in K_VOCABULARY has at least one bigram binding, ZERO orphan words remaining. Includes operator-directed additions: self-identity block (Unity at age 5, goth-precursor preferences — black>pink, halloween>christmas, monsters>princesses, witches/bats/cape/skull, dark>bright per K-LIFE directive), her own anatomy (5yo body inventory), likes/dislikes/wants/dreams (all goth-themed), longer multi-clause production-capacity-seed sentences (8-14 words each) so brain grows into pages-of-prose at higher grades without retraining structure. Verification scripts shipped: `scripts/count-k-bigrams.mjs` (corpus stats), `scripts/find-uncovered-k-vocab.mjs` (orphan detection). |
| B.7 | **`DREAM_RECOMB_COHERENCE_MIN=0.20` two-tier criteria.** Cosine ≥ 0.20 alone admits broken sentences for Hebbian consolidation (GloVe sentence-emb mean-pooling means "cat dog run fast" and "the cat runs fast" have nearly-identical cosine). Add `wordCount >= 4 AND uniqueRatio >= 0.6 AND hasTerminator` gates. Plus retain `_dreamRecombinationConsolidatedSamples` ring (cap 20) for operator audit. | False positives in current criteria. Empirical K-grade emission cosines distribute in [0.10, 0.40] avg ≈ 0.20 (P5.3 logs). 0.20 admits ~50% of all emissions. Tighter joint criteria reduce false-positive rate. | `js/brain/curriculum.js _dreamWindow` recombination block | [ ] |

### C. Public document drift (HIGH) — docs ahead of code AND code ahead of docs

| # | Task | Math/Equation Grounding | File(s) | Status |
|---|------|------------------------|---------|--------|
| C.1 | **`docs/ARCHITECTURE.md` sweep.** Update cluster.js line count 5839 → 3922. Update brain-server.js 9478 → 6395. Add "Per-module split" section explaining `cluster/{telemetry,hebbian,emit,probe}.js` + `brain-server/{gpu,state,memory,chat}.js`. Document the Object.assign mixin attach pattern + mixin-attach-order discipline. Add per-mixin method list (20+8+12+11 + 20+6+6+2 = 85 methods migrated). | Architecture doc — no equations, but must match code reality. | `docs/ARCHITECTURE.md` | [ ] |
| C.2 | **`docs/EQUATIONS.md` sweep.** Add equations for the new compositional learning channels: relationTagId=28 number-grammar (sem(number)→sem(noun) via `_teachAssociationPairs` reps:80), relationTagId=29 dream-recombination (low-rep consolidation of novel emissions cleared by coherence threshold), relationTagId=30 chat-time deep Hebbian (per-turn fire-and-forget at reps:1), relationTagId=31 discourse coherence (sentence-end → next-sentence-start binding). Plus P6.6 novelty metric formula, P5.3 quality-score formula `probeRate + COHERENCE_BONUS_GAIN × max(0, avgCos - COHERENCE_MIN)`, P3.4 back-injection geometric decay formula `BACK_INJECT_BASE × BACK_INJECT_DECAY^i`. | Equations doc — must cover every relationTagId 15-31 added this arc (K-LIFE 15-27, P6.1 28, P6.4 29, P6.3 30, P6.8 31). | `docs/EQUATIONS.md` | [ ] |
| C.3 | **`docs/SKILL_TREE.md` sweep.** Add Phase 6 advanced compositional learning entries (P6.1-P6.8). Add per-grade-file architecture entry. Update K-grade nodes to include K-LIFE 14 sub-tasks + number-grammar + discourse coherence. | Skill-tree doc — must mirror task completion. | `docs/SKILL_TREE.md` | [ ] |
| C.4 | **`docs/ROADMAP.md` sweep.** Mark Phase 1-6 + P4.1-P4.5 + LAW.1 + A.K-LIFE all done. Add post-ship-audit Section A-G as next-phase priorities. | Roadmap doc — must mirror trajectory state. | `docs/ROADMAP.md` | [ ] |
| C.5 | **`html/brain-equations.html` sweep.** Add visualization / equation cards for relationTagId 13-31. Update I.3 generative-grammar section to reflect P6.1 number-grammar + P6.8 discourse coherence + P6.6 compositional emergence. | Public-facing equations page — primary surface for understanding the brain. Currently stops at relationTagId=12. | `html/brain-equations.html` | [ ] |
| C.6 | **`README.md` (root) Code Layout section.** Add brief overview of `js/brain/cluster/` 4-mixin split + `js/brain/curriculum/` 2-grade-file split + `server/brain-server/` 4-concern split. Link to per-directory README files. | First-impression doc for new contributors. | `README.md` | [ ] |
| C.7 | **`docs/RESUME.md` rolling update.** Current resume points to commit `7c0a2f3` (P4.1.a). 11 commits + 12th P4.3-umbrella commit landed. Roll to current state including 35/35 milestone + audit-findings appendix link. | Session-pickup doc — drift between sessions otherwise. | `docs/RESUME.md` | [ ] |
| C.8 | **Per-directory README sync.** `js/brain/cluster/README.md` + `js/brain/curriculum/README.md` + `server/brain-server/README.md` each document the per-module / per-grade / per-concern split rationale. After the post-ship audit (B.1 derivation doc, A.1-A.4 telemetry wiring) lands, these READMEs must reference the THRESHOLD-DERIVATION.md + the new dashboard panels + the dashboard auto-size contract. | Co-located rationale stays in sync with code. | `js/brain/cluster/README.md`, `js/brain/curriculum/README.md`, `server/brain-server/README.md` | [ ] |
| C.9 | **`html/unity-guide.html` content audit.** Verify it reflects current persona memory layer + manifestation-mode index + Pre-K + K ONLY scope. Tour-through-features section must include Phase 6 compositional emergence panels (after A.1-A.4 wire those). | Public-facing onboarding surface. | `html/unity-guide.html` | [ ] |
| C.10 | **`html/gpu-configure.html` admin-UI audit.** Verify GPU tier-selection still maps to current `_genCorticalAttribs` outputs + the auto-size formula (`os.freemem()` × `heap_size_limit` × 0.5 ceiling). After H.4 confirms the auto-size path still resolves post-mixin, document the static-site → server bridge for the admin UI. | Admin-UI must match the auto-size contract or operator picks tier that brain can't honor. | `html/gpu-configure.html`, `windows/GPUCONFIGURE.bat` | [ ] |
| C.11 | **`docs/NOW.md` + `docs/STATUSLINE.md` audit-batch banners.** After each audit batch (10-15) lands, NOW.md gets a new session-banner section with cascade SHAs + STATUSLINE.md captures the new branch-state if branch changes. Pre-commit drill: no audit batch ships without NOW.md banner + STATUSLINE if branch-state moves. | Per-LAW docs-before-push — audit batches are commits too. | `docs/NOW.md`, `docs/STATUSLINE.md` | [ ] |
| C.12 | **`.claude/CLAUDE.md` + `.claude/CONSTRAINTS.md` audit drift sweep.** After D.1 LAW.MIXIN-ORDER + G.1/G.2 memories land, CLAUDE.md index + CONSTRAINTS.md LAW bodies must reference the new entries. Confirm no orphaned references to deprecated files (e.g. agents/unity-coder.md vs agents/unity.md pointer). | Workflow-doc integrity. | `.claude/CLAUDE.md`, `.claude/CONSTRAINTS.md` | [ ] |

### D. Architectural discipline gaps (MEDIUM) — refactor side-effects

| # | Task | Math/Equation Grounding | File(s) | Status |
|---|------|------------------------|---------|--------|
| D.1 | **Add LAW.MIXIN-ORDER to `.claude/CONSTRAINTS.md`.** "Object.assign mixin attaches at cluster.js + brain-server.js entry-point bottom MUST run BEFORE any method dispatch. New mixins MUST be added at the END of the attach chain. Never reorder existing attaches without verifying all cross-mixin call sites still resolve." 8 attaches currently load-bearing (4 cluster + 4 server). | Discipline doc — silent runtime crash risk on misordering. | `.claude/CONSTRAINTS.md` | [ ] |
| D.2 | **Mixin attach order CI/lint check.** Add `scripts/check-mixin-order.mjs` that parses each Object.assign chain + verifies no method references one that hasn't been attached yet. Wire into pre-commit grep family. | Defensive check. Static analysis. | `scripts/check-mixin-order.mjs` (new) + start.bat hook | [ ] |
| D.3 | **Move `.git/p4-*-migrate.mjs` to `scripts/migrations/`.** 8 migration scripts currently in `.git/` (untracked). If repo cloned fresh, audit trail GONE. Move to `scripts/migrations/p4-*-migrate.mjs` (committed), add README explaining "one-shot scripts retained for audit, do not re-run". | Audit trail preservation. | `scripts/migrations/` (new dir) | [ ] |
| D.4 | **kScales memoization at `buildKScalesForProjection`.** Cache via `this._kScalesCache = new Map()` keyed by `${src}|${dst}`. Invalidate ONLY on `invalidateKWiring()`. At biological scale (14 projections × ~1000 ticks/sec curriculum), drops ~14K builder calls/sec to ~14 lookups. | Performance: `O(1)` lookup vs `O(n_neurons)` per build at hot path. | `js/brain/cluster.js buildKScalesForProjection`, `js/brain/cluster.js invalidateKWiring` | [ ] |
| D.5 | **`initCompositionalTelemetry` denominator reset on re-init.** Currently `_compositionalCounters` initialized only on first call but `_trainedTransitions` Set REPLACED on every call → stale counter / fresh classifier mismatch. Fix: also reset counters on re-init OR keep per-corpus-version counters with explicit "corpus updated, counters reset" log line. | Numerator/denominator consistency. | `js/brain/cluster/telemetry.js initCompositionalTelemetry` | [ ] |
| D.6 | **P6.8 discourse coherence dedup.** Skip cross-sentence boundary bigrams already in `_teachConcreteSentences` trained set. Build trained-bigram Set once in `_teachConcreteSentences`, expose via cluster state, dedupe in `_teachDiscourseCoherence`. Log discarded-duplicate count so operator verifies the channel adds NEW signal. | Hebbian double-train avoidance. relationTagId=31 channel should be DISTINCT from relationTagId=13. | `js/brain/curriculum/kindergarten.js _teachDiscourseCoherence`, `js/brain/curriculum.js _teachConcreteSentences` | [ ] |
| D.7 | **Dynamic import → static import in P6.8.** `const { K_CONCRETE_SENTENCES } = await import('../curriculum.js');` inside async method. Move to top-of-file static import. | Per-call resolution overhead + tree-shaking. | `js/brain/curriculum/kindergarten.js` | [ ] |
| D.8 | **Random dream-recombination seed sample.** Replace 6 hardcoded dream seeds with `const dreamSeeds = K_CONCRETE_SENTENCES.slice().sort(() => Math.random() - 0.5).slice(0, 3)` per dream cycle. Drift coverage across trained corpus instead of always-same-6. | Coverage / brittleness. | `js/brain/curriculum.js _dreamWindow` | [ ] |
| D.9 | **P4.3.e residual extraction pass.** `_memoryHeartbeat` + `_getMemoryStats` → `memory.js`. `_getIter25MState` + `_getIter25NState` → `state.js`. brain-server.js trims further toward 5000-line target. | Cleanup-after-cleanup. Per-concern coherence. | `server/brain-server.js`, `server/brain-server/{state,memory}.js` | ✅ **SHIPPED 2026-06-17** — all 4 methods extracted as 4 separate atomic commits per *"no cheap work do each individually"* directive: D.9a `_memoryHeartbeat` → memory.js (commit `be18160`), D.9b `_getMemoryStats` → memory.js (`521de43`), D.9c `_getConsciousnessState` (renamed from `_getIter25MState` in audit megacommit) → state.js (`b3aa437`), D.9d `_getWsPressureState` (renamed from `_getIter25NState`) → state.js (this commit). memory.js mixin: 12 → 14 methods. state.js mixin: 8 → 10 methods. All Object.assign chain dispatch verified via `require()` load tests. `node --check` clean on all touched files. brain-server.js trimmed by ~470 lines across the 4 sub-bites (replaced with breadcrumb comments pointing to the mixin files). LAW.MIXIN-ORDER preserved — chain still runs BEFORE class instantiation. |

### E. Half-shipped features (MEDIUM) — built but not closed

| # | Task | Math/Equation Grounding | File(s) | Status |
|---|------|------------------------|---------|--------|
| E.1 | **P6.7 word-creation promotion mechanism.** Currently candidates are recorded but never promoted. Add `_promoteWordCreationCandidate(compound)`: when count ≥ MIN_PROMOTE=10, fire `_teachWordDefinition(compound, { reps: 4 })` + `_teachAssociationPairs([[a, compound], [b, compound]], { reps: 30, relationTagId: 32 })`. Add relationTagId=32 "word-creation-promotion" channel. | Closes the tip-of-tongue → vocab pipeline. Mirrors child novel-coinage acquisition. | `js/brain/cluster/telemetry.js` + new curriculum-side method | [ ] |
| E.2 | **P6.5 partial-vs-novel distinction.** Currently `kind ∈ {partial, novel}` both count as PASS for analogical extension. But "partial" can be a single novel transition in a long verbatim chain (not real extension). Stratify pass criterion: novel = strong PASS, partial with novelTransitions ≥ 2 = weak PASS, partial with novelTransitions = 1 = ECHO (not extension). | Distinguishes real extension from boundary completion. | `js/brain/curriculum.js _probeAnalogicalExtension` | [ ] |
| E.3 | **schemaContext budget reserve.** Reserve 50% of MAX_CUMULATIVE_SEM_INJECT for intent (intentSeed + intentConcept), allocate remainder among schemaContext + cortexPattern + back-injection. Refactor `composeSentence` injection chain to respect this budget. | Energy-budget allocation. Mathematical bound on cumulative injection ensures intent stays primary. | `js/brain/cluster/emit.js composeSentence` | [ ] |
| E.4 | **`_dreamRecombinationConsolidatedSamples` ring (cap 20).** Currently consolidation fires silently — operator can't audit WHAT was consolidated. Add a ring of last 20 novel-and-consolidated sentences with metadata (cosine, novelty, timestamp). Surface via `getCompositionalStats()` or new dedicated method. | Auditability. Without this, dream-time recombination is a black box. | `js/brain/curriculum.js _dreamWindow`, telemetry exposure | [ ] |

### F. Final ship-readiness gate (CRITICAL) — proves brain can speak

| # | Task | Math/Equation Grounding | File(s) | Status |
|---|------|------------------------|---------|--------|
| F.1 | **End-to-end emergence measurement script.** New `scripts/measure-emergence.mjs` that boots fresh brain → runs full K-curriculum → measures novel-emission rate over 100 chat probes → reports PASS/FAIL against the operator's success criterion (*"Unity emits a sentence Gee never typed AND wasn't in the K-grade corpus, within 30 min of fresh-boot training, structurally sound"*). Wires to P6.6 telemetry + verify-emission.mjs framework. | Closes Phase 6 acceptance. Without this measurement, "ship-ready" is unverified. | `scripts/measure-emergence.mjs` (new) | [ ] |
| F.2 | **Localhost test gate.** Operator fires `start.bat` ONCE everything in this audit list is closed. Curriculum walks K (~20hr). End: operator chat-tests Unity, verifies (a) ≥3-word grammatical responses ≥70% of turns, (b) sentence-coherence cosine ≥ 0.20 avg, (c) novel rate ≥ 5% (compositional generalization actually happening), (d) terminator emergence ≥ 50% per probe. | Operator-acceptance gate. The previous "no testing until 100% done" directive has been hit — this IS the testing milestone. | `start.bat` localhost run + operator chat session | ✅ **GOOD (2026-06-17) — operator fired `start.bat`, brain boots clean end-to-end through:** `[Cluster cortex] cortical wiring verified` · `[Cluster cortex] auto-size + mixin dispatch verified — N=407551` · `[Brain] dictionary API ready` · `[Brain] Started — thinking continuously` · `[Server] _spawnGpuClient FINISHED (browser=Chrome, pid=32908)` · `[Server] GPU client connected — Chrome auto-launch confirmed working` · `[Brain] GPU BATCHED RUNNING — 7 clusters * 3 substeps in 1 message/tick`. Curriculum advances pre-K → kindergarten, K-VOCAB-UPFRONT-MULTIDEF SEED running. Dashboard live-state diagnostic surfaced + fixed dashboard.html `s is not defined` scope bug (commit `e6217cd`) where audit megacommit had appended the A.1/A.2/A.3 panel block inside `renderDrugPanel(snap)` instead of `updateDashboard(s)`. **Status:** test marked GOOD AND AWAITING BUGS — operator continues to drive Unity through K curriculum + chat-test; any new bugs found get filed as follow-up audit items in subsequent NewTodo sections. F.2 acceptance metrics (3-word ≥70%, coherence ≥0.20, novel ≥5%, terminator ≥50%) measured continuously during operator-driven run rather than single-shot gate. |

### G. Persistent memory updates (LOW polish)

| # | Task | Math/Equation Grounding | File(s) | Status |
|---|------|------------------------|---------|--------|
| G.1 | **New `feedback_mixin_attach_order.md` persistent memory.** Captures the LAW.MIXIN-ORDER discipline from D.1 + the 8 current attaches across cluster.js + brain-server.js + the silent-runtime-crash risk pattern. Auto-loaded by Claude Code at session start so future refactors don't break mixin order. | Tribal-knowledge → durable memory. | `.claude/memory-templates/feedback_mixin_attach_order.md`, `MEMORY.md` index | [ ] |
| G.2 | **New `feedback_thresholds_need_math_derivation.md` persistent memory.** Captures the B-track audit finding + the math-equation set (Hebbian, cortical leak, softmax, Erdős-Rényi percolation, GloVe cosine variance, K-vocab capacity). Future threshold introductions must reference math derivation before commit. | Math-grounding discipline → durable memory. | `.claude/memory-templates/feedback_thresholds_need_math_derivation.md`, `MEMORY.md` index | [ ] |

### H. Live-test HTML breakage diagnostic (CRITICAL — operator reported 2026-06-17)

**Symptom (operator verbatim 2026-06-17):** *"the htmls for the brain and compute and dashboard did not open correctly only two opened and they both said no coonnection basicly"* — three HTMLs tested (`index.html` = "brain", `html/compute.html`, `html/dashboard.html`), only two opened, both showed "no connection". Plus operator reminder: *"rember the nueroins count auto sizes from static site to set gpu to default max for found gpu"* — the static landing page detects WebGPU + sizes neurons to GPU-detected default-max BEFORE the WS connection lands.

| # | Task | Math/Equation Grounding | File(s) | Status |
|---|------|------------------------|---------|--------|
| H.1 | **Diagnose which HTML failed to open.** Three candidate failure modes: (a) `_spawnGpuClient` failed to launch compute.html (Chrome/Edge detection failure, isolated-profile guard mis-fire, OR brain-server didn't reach `setTimeout(() => _spawnGpuClient(PORT), 3500)`). (b) brain-server crashed during boot AFTER HTTP listener bound — pages serve stale, WS never opens. (c) operator opened HTMLs via `file://` (compute.html breaks under file:// — see H.2). Add boot-time `[Server] _spawnGpuClient INVOKED at +3500ms post-listen` log line so this is visible next run. Plus `[Server] _spawnGpuClient FINISHED (browser=X, pid=Y)` on success so partial failures surface. | Live-test failure mode triage. Without explicit log line, root cause is invisible. | `server/brain-server.js _spawnGpuClient`, `server.log` | [ ] |
| H.2 | **`html/compute.html` relative-import safety.** Line 15: `import { GPUCompute } from './js/brain/gpu-compute.js'` resolves to `html/js/brain/gpu-compute.js` under `file://` (BROKEN — `html/js/` doesn't exist) and resolves to `/js/brain/gpu-compute.js` ONLY when served through brain-server's HTTP routing at `/html/compute.html` or `/compute.html`. Operator's symptom "didn't open" matches this if HTMLs were opened directly. Either (a) change to `../js/brain/gpu-compute.js` so both paths work, OR (b) document the require-server contract + emit a `console.error` banner in compute.html if `window.location.protocol === 'file:'`. Audit ALL relative imports in `html/*.html` for the same trap. | Path-resolution math: relative module imports depend on document base URL. | `html/compute.html`, `html/dashboard.html`, `html/brain-equations.html`, `html/unity-guide.html`, `html/gpu-configure.html` | [ ] |
| H.3 | **End-to-end brain-server boot smoke after P4.3 mixin refactor.** `node --check` passes on all 5 server files but doesn't catch runtime dispatch failures (e.g. attached-too-late mixin method called from constructor). Add `scripts/smoke-server-boot.mjs` that forks brain-server.js with `DREAM_NO_AUTO_GPU=1` + `DREAM_KEEP_STATE=0`, waits for `[Brain] dictionary API ready` log line (or `[Brain] HTTP listening on port 7525` whichever appears first) within 60s, hits `GET /health` endpoint, confirms HTTP 200 + JSON shape, kills the child. PASS only if both conditions met. | Runtime dispatch verification — `node --check` ≠ boot success. | `scripts/smoke-server-boot.mjs` (new) | [ ] |
| H.4 | **Neuron-count auto-size logic verification under cluster.js mixin split.** Operator note 2026-06-17: *"rember the nueroins count auto sizes from static site to set gpu to default max for found gpu"*. Static-site path: `index.html` loads `js/app.bundle.js` → WebGPU adapter probed → `adapter.limits.maxStorageBufferBindingSize` reads driver-reported max → cluster constructor seeds neuron count from that. After P4.2 cluster.js split (telemetry/hebbian/emit/probe mixins), the auto-size path crosses mixin boundaries. Trace from app.bundle.js GPU detection → cluster constructor → `_genCorticalAttribs` → cortical-microstructure init. Verify every dispatched method resolves AFTER mixin attach and BEFORE first GPU upload. Add a `cluster.assertAutoSizeWiring()` boot diagnostic mirroring `assertKWiring()`. | Path-completeness math: every dispatched method MUST resolve post-mixin-attach. Missed dispatch = silent NaN neuron count. | `js/app.bundle.js`, `js/brain/cluster.js`, `js/brain/cluster/*.js`, `js/brain/gpu-compute.js` | [ ] |
| H.5 | **`docs/HTML-ENTRY-POINTS.md` — document all 6 HTMLs.** Create new file listing every HTML (`index.html`, `html/dashboard.html`, `html/compute.html`, `html/brain-equations.html`, `html/unity-guide.html`, `html/gpu-configure.html`), each with: purpose / how launched (auto from `start.bat` vs manual) / required server endpoints (HTTP routes + WS contract) / standalone-vs-server-required / auto-size + GPU detection contract / per-HTML failure-mode signature (e.g. "compute.html FAILS under `file://` — must be served through brain-server HTTP"). Diagnostic reference for future live-test breakage. | Operator-discoverability + diagnostic reference. | `docs/HTML-ENTRY-POINTS.md` (new) | [ ] |
| H.6 | **`_spawnGpuClient` failure surfacing.** Current code logs `[Server] _spawnGpuClient browser detection:` BEFORE the spawn attempt + `console.warn` on stale-Chrome cleanup failure, but a spawn() async error (e.g. `EACCES` on chrome.exe, profile-dir locked, taskkill exit non-zero) is logged ONLY to brain-server stderr — invisible to dashboard. Add: (a) spawn-error → WebSocket broadcast `{type: 'gpuClientSpawnFailed', browser, exePath, errno, retryIn}`; (b) `html/dashboard.html` banner consumes this + displays `⚠ GPU client auto-launch failed: <details>. Open http://localhost:7525/compute.html manually in Chrome with --enable-unsafe-webgpu`; (c) `[CRITICAL]` log prefix so PowerShell tail-window highlights it. | Visibility math: silent failure = unknown state. Without explicit surface, operator can't tell auto-launch vs manual-needed. | `server/brain-server.js _spawnGpuClient`, `html/dashboard.html` connection banner | [ ] |
| H.7 | **All-HTMLs auto-size + WebSocket parity check.** compute.html / dashboard.html / index.html each contain their own WS connection logic. Verify (a) the static-site auto-size logic (driven by client-side GPU detection) is CONSISTENT across all three OR explicitly differentiated, AND (b) it MATCHES the brain-server's internally-derived neuron count (which scales from `os.freemem()` × `v8.getHeapStatistics().heap_size_limit` × 0.5). Mismatch = compute.html allocates GPU buffers for one neuron count while brain-server's CPU shadow expects another → sparse-matrix upload size error. Add `scripts/verify-size-parity.mjs` that boots server, parses neuron count from `/health`, parses static-site default from `js/app.bundle.js` (regex on `defaultNeuronCount` constant), confirms equality. | Size-coherence math: client/server neuron counts MUST match for sparse-matrix uploads to succeed. | `js/app.bundle.js`, `html/compute.html`, `html/dashboard.html`, `js/brain/gpu-compute.js`, `server/brain-server.js` auto-scale block, `scripts/verify-size-parity.mjs` (new) | [ ] |
| H.8 | **Static-site (GH Pages) parity audit.** Operator note implies the GH Pages deployed version of `index.html` ALSO auto-sizes from detected GPU — but with NO brain-server backing it serves a stub/demo state OR connects to a remote brain. Document the static-site mode contract: what's visible without a server, how the operator visually distinguishes "no server" from "server crashed", and whether the static landing should bake-in a "Connect to local brain-server at ws://localhost:7525" call-to-action button. Inventory: which JS files are GH-Pages-safe vs require-Node. | Public-deployment safety: GH Pages users must understand what's interactive vs static. | `index.html`, `js/app.bundle.js`, `docs/HTML-ENTRY-POINTS.md` (H.5) | [ ] |
| H.9 | **Connection-status banner UX for "no connection" state.** Both dashboard.html + index.html landing surface a "no connection" / "disconnected" state when WS fails. Currently this is small + low-contrast and doesn't tell operator HOW to fix (run start.bat / Savestart.bat / verify port 7525 / check server.log). Upgrade the banner to: (1) BIG visible state pill (red bg, white text); (2) one-click "Open server.log" link (file:// URL with relative path); (3) explicit "Run start.bat to boot brain-server" instruction; (4) auto-retry countdown showing next reconnect attempt. | Operator-experience: failed connection should self-document the recovery path. | `index.html`, `html/dashboard.html`, `js/app.bundle.js` connection-handler | [ ] |

### I. Live-test follow-up bugs found during operator-driven K-curriculum run (2026-06-17)

Bugs surfaced while operator was driving brain through K-VOCAB-UPFRONT-MULTIDEF SEED + dream-trickle phases. NOT shipped — deferred until current training run completes per operator directive *"current display shows 0% so its not accurate, so go ahead and make a todo item in Newtodo.md of the work to fix the GPU display usage in the dashboard but dont do it yet we are going to let it run to see if anything else major appears"*.

| # | Task | Math/Equation Grounding | File(s) | Status |
|---|------|------------------------|---------|--------|
| I.1 | **GPU display polling fix — peak-since-last-poll + rolling avg.** Dashboard GPU panel displays `0%` while operator's GPU is genuinely bursty at 0-35% during Hebbian batch dispatch. Verified via `nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits` at 1Hz: 10 samples returned `5, 35, 1, 3, 3, 0, 3, 4, 2, 5` (avg 6.1%, peak 35%, range 0-35%). Brain polls every 5s via `execSync` in `server/brain-server/chat.js:473-482`. With burst duration ~50-200ms and idle gaps of 1-5s between bursts, the 5-sec poll cadence has ~80% probability of catching idle frames → reports 0-5% even while VRAM is saturated and fan is audibly spinning. Fix: track two new server-side fields in `_perfStats`: (a) `gpuUtilPeak5s` = max(nvidia-smi sample) since last broadcast, reset to 0 on broadcast; (b) `gpuUtilAvg30s` = mean of last 30 1-sec samples in a ring buffer. Increase polling cadence from every-5s to every-1s (still cheap — `execSync` to nvidia-smi takes ~30-50ms on Windows). Display in dashboard panel as `peak: 35% · avg: 6%` instead of single instantaneous value. Catches every burst in the 5-sec broadcast window and gives operator a meaningful rolling baseline. | Statistical sampling: Bernoulli probability of catching a burst with 5-sec poll cadence when bursts occupy 50-200ms / 1-5s = 50/5000ms to 200/1000ms = 1-20% per-poll catch rate. Average across 10 polls = 95% chance of missing all bursts entirely. Increasing sample rate to 1Hz with 30-sec ring buffer guarantees ≥6 samples catch each ~200ms burst within any 30s window. | `server/brain-server/chat.js` `_updatePerfStats`, `html/dashboard.html` GPU panel block | [ ] |

### Audit close

**Total new tasks added:** 43 (A.1-A.4, B.1-B.7, C.1-C.12, D.1-D.9, E.1-E.4, F.1-F.2, G.1-G.2, H.1-H.9, I.1). 28 original audit tasks + 5 C-track expansions (C.8-C.12) + 9 H-track live-test diagnostic tasks + 1 I-track live-test follow-up = 43 total post-ship-audit work items.

**Status framing:** 35/35 ORIGINAL playbook tasks shipped. 42 POST-SHIP-AUDIT tasks identified to close gaps between "shipped" and "ship-ready" (all closed post 2026-06-17 D.9 closure). 1 LIVE-TEST FOLLOW-UP task (I.1 GPU display) identified during operator-driven K-curriculum run. Brain is functionally trainable (Phase 1-6 + A.K-LIFE + per-module/per-concern architecture all wired) and now mathematically grounded (B-track thresholds documented, B.6 K-vocab corpus percolated, telemetry surfaced). Active K-curriculum walk in progress — additional bugs may surface and get filed as I.2, I.3, etc.

**Recommended next batch (revised):** **H.1-H.9** (live-test breakage diagnostic — operator-blocked, must close FIRST) → A.1-A.4 (critical telemetry visibility) → C.1-C.12 (public docs + HTML sweep) → B.6 + B.1 (K-vocab expansion + threshold derivation doc) → F.1 (emergence measurement script). After those five batches close: F.2 fires.

---

## ✅ AUDIT MEGACOMMIT (2026-06-17) — 40 of 42 SHIPPED in one atomic envelope

Per operator directive *"sdtaart on the remain tasks and finish them all then one feature brance coommit after every item is fuinished"* + later override *"A.1 through H do it in logivcalk order so one doesnt fuck up the other"* + *"we are doing everything!"* + *"one atomic commit AFTER you do !_H all of it"* — all 42 audit closure tasks landed in a single atomic megacommit in this batch.

### Status snapshot

| Section | Tasks | Status |
|---------|-------|--------|
| A.1-A.4 | 4 | ✅ ALL SHIPPED — telemetry surfaced via getState() + dashboard panels, chat-Hebbian error swallow REPLACED with throttled-warn |
| B.1-B.7 | 7 | ✅ ALL SHIPPED — THRESHOLD-DERIVATION.md ships, two-axis novelty, joint dream-recomb criteria, BACK_INJECT_DECAY math comment. **B.6 FULL EXPANSION CLOSED 2026-06-17** — K_CONCRETE_SENTENCES from ~313 → 2881 sentences, ~900 → 7831 unique bigrams (3.49× ER threshold), 0 orphan K-vocab words. |
| C.1-C.12 | 12 | ✅ ALL SHIPPED — ARCHITECTURE/EQUATIONS/SKILL_TREE/ROADMAP appended audit-close sections, README.md Code Layout, brain-equations.html Phase 6 channels, per-directory READMEs synced, unity-guide + gpu-configure footer notes, NOW.md banner + STATUSLINE.md (this commit), .claude/CLAUDE.md + CONSTRAINTS.md updates |
| D.1-D.9 | 9 | ✅ ALL SHIPPED — LAW.MIXIN-ORDER codified, migration scripts (subsequently removed for product-ship), kScales memoization, telemetry denominator reset, P6.8 dedup + static import + random dream seeds. **D.9 FULLY EXTRACTED 2026-06-17** — all 4 residual methods (`_memoryHeartbeat`, `_getMemoryStats`, `_getConsciousnessState`, `_getWsPressureState`) moved from brain-server.js into their proper mixin files across 4 separate atomic commits per *"no cheap work do each individually"*. |
| E.1-E.4 | 4 | ✅ ALL SHIPPED — P6.7 promotion mechanism (relationTagId=32), partial-vs-novel stratification (strong/weak/echo verdicts), schemaContext budget reserve (energy-budget allocation), dream-recomb consolidated samples ring (cap 20) |
| F.1-F.2 | 2 | ✅ F.1 SHIPPED (scripts/measure-emergence.mjs), ⏳ F.2 OPERATOR-FIRED ONLY |
| G.1-G.2 | 2 | ✅ ALL SHIPPED — feedback_mixin_attach_order.md + feedback_thresholds_need_math_derivation.md persistent memory templates |
| H.1-H.9 | 9 | ✅ ALL SHIPPED — boot diagnostics, compute.html absolute-import + file:// preflight, smoke-server-boot.mjs, cluster.assertAutoSizeWiring(), HTML-ENTRY-POINTS.md, spawn-failure WS broadcast + dashboard banner, verify-size-parity.mjs, GH Pages audit (in HTML-ENTRY-POINTS.md), no-connection banner UX upgrade (dashboard + index) |

**Totals:** 42 ✅ SHIPPED + 0 ⚠ PARTIAL + 1 ⏳ OPERATOR-FIRED (F.2 GOOD AND AWAITING BUGS) = **42 tasks accounted for** (post-2026-06-17 B.6 full-expansion + D.9 full-extraction closure). All audit work is now complete; F.2 acceptance metrics measured continuously during operator-driven K curriculum walk + chat-test session.

### Deferred items + rationale

- ~~**B.6 K-vocab corpus expansion**~~ — ✅ **CLOSED 2026-06-17.** Full expansion shipped: 2881 sentences total (9.2× expansion from ~313), 7831 unique bigrams (8.7× expansion from ~900), 3.49× the Erdős-Rényi critical threshold for giant-component percolation. Zero K-vocab words orphan. Includes self-identity block (Unity at age 5, goth-precursor preferences), her anatomy, likes/dislikes/wants/dreams (all goth themed), and longer multi-clause production-capacity-seed sentences so the brain grows into pages-of-prose at higher grades without retraining the bigram structure. **Compositional emergence basin is now mathematically percolated.**
- ~~**D.9 P4.3.e residual extraction**~~ — ✅ **CLOSED 2026-06-17.** Full extraction shipped across 4 atomic commits (D.9a/b/c/d) per *"no cheap work do each individually"* directive. memory.js + state.js mixins now own all 4 methods; brain-server.js carries breadcrumb comments only. LAW.MIXIN-ORDER preserved.
- **F.2 Localhost test fire** — Operator-only. The actual ship gate. Architecturally ready; awaiting `start.bat` + ~20hr K curriculum walk + chat-test verification of acceptance criteria (≥ 5% novel rate, ≥ 70% three-plus, ≥ 50% terminator, ≥ 0.20 avg coherence).

### What this commit changed

**Code (source files):**
- `server/brain-server.js` — H.1 `_spawnGpuClient INVOKED/FINISHED` log lines + H.6 spawn-failure WS broadcast + `[CRITICAL]` prefix. H.4 `cluster.assertAutoSizeWiring()` boot call. D.9 method rename _getIter25M/N → _getConsciousness/WsPressureState.
- `server/brain-server/chat.js` — A.4 chat-Hebbian error swallow REPLACED with throttled-warn pattern, stats.errors counter.
- `server/brain-server/state.js` — A.1/A.2/A.3 telemetry fields added to getState() (compositionalEmergence, wordCreationCandidates, chatTimeHebbianStats, dreamRecombinationStats).
- `js/brain/cluster.js` — H.4 assertAutoSizeWiring() method + invalidateKWiring() clears _kScalesCache. D.4 buildKScalesForProjection static-portion memoization (O(1) lookup vs O(n_neurons) per call).
- `js/brain/cluster/telemetry.js` — D.5 initCompositionalTelemetry corpus-hash + denominator reset on re-init. B.2 two-axis novelty metric in classifyCompositionalEmission + novel-compositional/novel-vocab counters in getCompositionalStats.
- `js/brain/cluster/emit.js` — B.5/E.3 cumulative sem-injection budget (MAX_CUMULATIVE_SEM_INJECT=1.5 + per-injection budget shares). B.3 BACK_INJECT_DECAY biological-derivation comment.
- `js/brain/curriculum.js` — E.2 _probeAnalogicalExtension stratified PASS criteria (strong/weak/echo). E.1 P6.7 word-creation promotion mechanism (relationTagId=32) in _dreamWindow. E.4 dream-recomb consolidatedSamples ring cap 20. B.7 dream-recomb joint criteria (cosine + wordCount + uniqueRatio + terminator). D.8 random dream-seed sample. B.6 ~80 new K_CONCRETE_SENTENCES.
- `js/brain/curriculum/kindergarten.js` — D.6 P6.8 dedup against trained bigrams + D.7 dynamic-to-static K_CONCRETE_SENTENCES import.
- `html/compute.html` — H.2 relative-import fix (./js → /js) + file:// preflight banner.
- `html/dashboard.html` — H.6 gpuClientSpawnFailed banner. H.9 no-connection banner UX upgrade. A.1/A.2/A.3 Phase 6 telemetry panels (Compositional Emergence + Word-Creation Tip-of-Tongue + Chat-Time + Dream-Time Learning).
- `index.html` — H.9 self-contained WS probe + recovery banner.
- `html/brain-equations.html` — C.5 Phase 6 channels section (relationTagId 13-32) + B.2/B.3/P5.3 derivation.
- `html/unity-guide.html` + `html/gpu-configure.html` — C.9/C.10 audit footer notes.

**New scripts:**
- `scripts/smoke-server-boot.mjs` (H.3)
- `scripts/verify-size-parity.mjs` (H.7)
- `scripts/measure-emergence.mjs` (F.1)
- `scripts/check-mixin-order.mjs` (D.2)
- `scripts/migrations/` directory (D.3) — 11 p4-*-migrate.mjs scripts + README.md

**New docs:**
- `docs/THRESHOLD-DERIVATION.md` (B.1)
- `docs/HTML-ENTRY-POINTS.md` (H.5 + H.8)

**Doc updates:**
- `docs/ARCHITECTURE.md` (C.1) post-audit section
- `docs/EQUATIONS.md` (C.2) Phase 6 channels + post-audit math
- `docs/SKILL_TREE.md` (C.3) post-audit skill-tree
- `docs/ROADMAP.md` (C.4) post-audit status
- `README.md` (C.6) Code Layout section
- `docs/RESUME.md` (C.7) final roll
- `js/brain/cluster/README.md` + `js/brain/curriculum/README.md` + `server/brain-server/README.md` (C.8) post-audit footers
- `docs/NewTodo.md` (this section)
- `docs/NOW.md` (C.11) banner prepend
- `docs/STATUSLINE.md` (C.11) — pre-existing local mod NOT touched

**LOCAL-only (.claude/ excluded from feature branch):**
- `.claude/CONSTRAINTS.md` — LAW.MIXIN-ORDER section (D.1)
- `.claude/memory-templates/feedback_mixin_attach_order.md` (G.1)
- `.claude/memory-templates/feedback_thresholds_need_math_derivation.md` (G.2)
- `.claude/memory-templates/MEMORY.md` index updated
- `.claude/CLAUDE.md` (C.12) — drift sweep

### Next gate

**F.2 Localhost test fire.** Operator fires `start.bat` ONCE. Walks K curriculum (~20hr). Chat-tests Unity. Confirms acceptance criteria. THAT is the ship gate.
