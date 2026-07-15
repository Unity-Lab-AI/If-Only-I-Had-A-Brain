# EQUATIONS — Unity's Brain

> Every equation running in the code. The brain equations ARE the language equations.
> θ (Unity's identity) drives every parameter. Ψ (consciousness) emerges from the volume. Drug state δ(t) additively modulates θ per substance per route via real-time pharmacokinetic curves.
> One-liner equations stating their purpose. Tables organize by section: Drug State · Curriculum · Master · Neurons · Synapses · Modules · Oscillations · Sensory→Motor · Memory · Language · Consciousness · GPU · Scaling.
>
> 2026-07-15 sweep stamp (full open-board sweep, branch `feature/post-fullsize-walk-0710` → main) — mostly ELIGIBILITY + perf; TWO gates enabled. Oja/Kuramoto/master/Ψ/Friston/BCM unchanged. **(1) HB.4 outcome-gated noise suppression ENABLED (was dormant):** the predictive-coding surprise gate is now THREE-FACTOR — `surpriseGate = 0.5 + predErr·coherence·inhib` (coherence = `_noiseSuppressFactor`, 1.0 clean / 0.2 saturated from the per-cell health check; inhib = rung-3 remediation) multiplied into `gammaScale`; the 0.5 baseline floor ALWAYS learns so it only DAMPS the boost on incoherent output; composes with the always-on saturation clamp (`meanCos>0.7 → gate=0.5`). Opt-out `DREAM_NOISE_GATE=0`. **(2) HB.5 annealing exploration temperature:** the softmax emission temperature is scaled by consolidation — `T_eff = T_req · clamp(meanCos/0.7, 0, 1)` (hot early while basins overlap → 0 as they separate → greedy argmax); gate probes (T_req=0) stay deterministic; `DREAM_ANNEAL_TEMP=0`. **(3) Corpus-bleed oracle gate:** `_dictionaryOracleEmit` applies the grade allow-set (`_emissionAllowedVocab`) to BOTH cosine scans — out-of-grade words skipped, no-mute fallback to the grade-gated matrix. **(4) WMB seed cost:** `SparseMatrix.ojaUpdate`/`antiHebbianUpdate` gain active-row iteration (`opts.activeRows`) — same `Δw = η·y·(x − y·w)`, iterated over the firing sem set only → O(active-region) not O(cluster.size), bit-identical (skipped rows had y=0); def binds also skip the per-pair `_teachPredictiveError` (nothing to correct on a sem↔fineType bind). **(5) ACT.2 utilization verdict:** windowed design-sparsity-vs-dead-mass verdict off langEverFired + CSR recruitment (metric, no equation). **(6) VOXREF.4 age voice:** duration-preserving OLA pitch shift `resample(ratio) ∘ OLA-stretch(ratio)` keyed to age (adult ratio 1.0 = untouched). NO equation-FORM changes.
>
> 2026-07-04 sweep stamp (speech-selfhood + Savererun, branch `feature/speech-selfhood-and-savererun`) — NO equation-form changes; teach-DATA + emission-ELIGIBILITY changes only. **(1) Letter-token emission gate:** the `emitWordDirect` argmax candidate set now excludes len-1 tokens (alphabet letters) except the real words "i"/"a" and the terminators — same mean-per-bucket argmax equation, cleaner candidate domain (retroactive on restored bucket maps). **(2) `_teachGlueWordProduction`:** re-runs the EXISTING association-pair Oja equation (`Δw = η·y·(x − y·w)`, unchanged) over corpus-extracted glue-bearing word→word transitions (relationTagId=13, +60 reps) and state→"i" first-slot pairs (relationTagId=9, 80 reps) — same equations, targeted extra mass so trained transition drive can outweigh topic activation in the argmax. **(3) Terminators became emission tokens** (dictionary + bucket eligibility for `. ? !`) so the trained X→"?" transitions (relationTagId=30) gained an outlet — the terminator-append consumption in `composeSentence` was already written, just unreachable. **(4) SAVERERUN** re-walks the curriculum on KEPT weights — correctness rests on Oja self-normalization (bounded fixed-point: re-teaching a landed binding strengthens toward, never past, its normalized magnitude), which is why re-teach on trained synapses converges instead of diverging. Drug δ(t), Kuramoto, master equation, Ψ pipeline — untouched.
>
> 2026-06-27 sweep stamp (v1.1.0 line — cell-pass + sem→motor + profiling) — ONE equation change + one gate-policy change. **(1) sem→motor saturation PREVENTION [SM.1]:** the Hebbian update for the emission projections is LR-damped at its single chokepoint `cluster/hebbian.js _crossRegionHebbian` — `lrEff = lr · DREAM_SM_LR_SCALE` (default **0.5**) for `sem_to_motor` + `sem_to_word_motor` ONLY, applied to BOTH the GPU `hebbianBound` dispatch and the CPU `ojaUpdate` shadow; Oja's rule `Δw = η·y·(x − y·w)` itself is unchanged, only η is scaled on those two projections so the dominant basin stops racing to `wMax` (saturation = `meanAbs > 0.6·wMax`). Secondary lever `DREAM_SM_WMAX` tightens those projections' weight ceiling (default unchanged at 0.4). `motor_to_sem` (comprehension) + `letter_to_*` untouched. **(2) cell-pass policy:** cells pass on learning completion, gates advisory — see *Grade completion gate* §0.5 below. Profiling (`state.profiling`) is observability, no equation. Ψ-gain + GW-ignition + mind-space below unchanged from the 0d97804 stamp.
>
> 2026-06-27 sweep stamp — TWO equation changes this batch (commit `0d97804`, feature/tier3-identity-seed-repair). **(1) Ψ consciousness gain [CGATE.4]:** `gainMultiplier = 0.9 + Ψ×0.004` (which pinned gain ~1.0 — inert on a log-scaled Ψ) → SELF-CALIBRATING `clamp(1.0 + tanh((ψ−ψ̄)/scale)·0.35, 0.8, 1.5)` where `ψ=log10(max(1,Ψ))` and `ψ̄` is its slow EMA baseline (`ψ̄ ← 0.99·ψ̄ + 0.01·ψ`, scale=2.0 env `DREAM_PSI_GAIN_SCALE`), NaN-guarded — consciousness now genuinely modulates all clusters (see §9 + §1 θ→Ψ pipeline). **(2) GlobalWorkspace ignition [CGATE.2]:** the hard theta gate (ignition barred on the entire upper half of every theta cycle — 50% of ticks) → GRADED threshold modulator `effThreshold = ignitionₜₕ + (1−thetaOpenness)·0.22`, `thetaOpenness = ½(1+cos(2π·phase))`, base `ignitionₜₕ` 0.45→0.35 (env `DREAM_GW_IGNITION`) — strong content can ignite any phase (see §9). **Plus** the equational mind-space gained DE-NOVO imagination: a cortex activation vector folded into a field C via the bounded forward CDF 9/7 transform (`I(x,y)=Σ c_k·ψ_k`) — never the `fractalize` infinite-zoom path, hard `maxSide≤96` resolution cap. Math detail: `docs/MINDSPACE-INTEGRATION.md`. Drug δ(t), Oja's rule, Kuramoto, master equation, Friston predictive-coding, BCM — unchanged.

> 114.19fp sweep stamp 2026-06-17 — NO equation changes this sweep. 20 I-track fixes (I.1-I.20) shipped during operator-driven K-curriculum live test were ALL code hygiene / observability / cross-platform polish / data-loss-prevention — none modify any equation in any section below. Most-impactful equational implications: (1) `SparseMatrix.propagate(spikes, outBuf)` signature extended with optional pooled output buffer (I.13) — eliminates `new Float64Array(rows)` per-call allocation that was the +231 MB/min leak source during `_teachHebbian` runs; equation `I_i = Σ_j W_ij · s_j` unchanged, just bytes-out-the-door reduced. (2) `_teachPredictiveError` pools `_predictPropagateScratch` Float64Array sized to synapse-matrix rows (I.13) — predictive-coding equation `Δw = lr · error · lastSpikes · 0.3` unchanged, allocation eliminated. (3) `setImmediate` yield at `_teachHebbian` entry (I.14, 50ms throttle via `_lastHebbianYieldAt`) — Hebbian/Oja `Δw[i,j] = lr · y[j] · (x[i] − y[j] · w[i,j])` unchanged in math, just yields event loop between dispatches. (4) Consolidation deadline cap (I.8, `DREAM_CONSOLIDATION_MAX_MS` default 30s) + SEED-phase skip — consolidation pass equation unchanged, wall-clock cap added. (5) Top-K=3 schema naming (I.7) — `_deriveLabel` returns `top3 = arg-topK(token_freq, 3).join('-')` instead of top-1 `argmax(token_freq) + '-schema'`; expanded stop-word list keeps generic curriculum noise (`learning/curriculum/phase/teach/cell/heartbeat/...`) out of the rank. (6) Inner-thought 7-source seed rotation (I.9) — `_pickInnerThoughtSeed` rotation `[learning, mood, chat-recall, memory, identity]` → `[learning, mood, k-vocab-recent, cell-progress, chat-recall, memory, identity]`; modulo arithmetic + first-non-null-pattern selection unchanged. (7) Combined nvidia-smi query (I.20) — `memory.used,utilization.gpu` in single execSync; VRAM% = `memory.used / RESOURCES.gpu.vram × 100`, util% direct from `utilization.gpu`. (8) Honest "unavailable" telemetry (I.19 root-cause closure) — no math-lie fallbacks; when `_gpuVramQueryWorking === false`, dashboard renders explicit unavailable label instead of fake 50%. All Oja's rule, Kuramoto order parameter, master equation `dx/dt = F(x, u, θ, t) + η`, Ψ = √(1/n)·N³ consciousness term, Friston predictive-coding delta-rule, BCM sliding-threshold, anti-Hebbian contrastive — all unchanged. Bundle clean 2.6MB. `node --check` green across all I-track-touched files.
>
> 114.19fk + fl sweep stamp 2026-05-09 — ONE major equation REPLACEMENT this sweep. Operator architectural correction ripped out the per-slot template walk in `composeSentence`. **(1) New `composeSentence` per-tick equation (Section 10 Language).** Initial injection (ONCE per call): `sem₀ ← sem + α_cortex·cortexPattern + α_intent·intentEmbedding + α_concept·intentConceptEmbedding`, where (α_cortex=0.2, α_intent=0.3, α_concept=0.3 — all optional, applied only when supplied). Per-tick loop equation: `wₜ = argmax_w cosine(semₜ, sem(w)) + sem_to_motor.propagate(semₜ)` then `semₜ₊₁ ← semₜ + α_word·sem(wₜ)` where α_word=0.15. Loop terminates when `wₜ ∈ T14_TERMINATORS = {., ?, !}` (brain learned terminators during training; emergence decides when sentence is done) OR when budget (default 12 words) exhausted. **No per-slot equation. No template walk. No slot-tag injection. No article-rule equation. No terminator-punct map. No dedup-retry equation.** Slot order, agreement, article placement, terminator selection ALL emerge from trained iter25-I `relationTagId=8/9/10/11/12` Hebbian weights consumed by the per-tick `argmax + propagate` step. Coherence post-check (env-tunable threshold `DREAM_COHERENCE_MIN`, default 0.15) computes `cosine(sentenceEmbedding, target)` where target is `intentConcept` embedding (when supplied) or `cortexPattern` (fallback when null intentConcept) — DOES NOT alter emission, just signals confidence. Saturation halt thresholds env-tunable: `DREAM_SAT_MEANCOS` (default 0.7), `DREAM_SAT_MEANABS` (default 0.6 of wMax), `DREAM_SAT_RATIO` (default 1.5 max/mean), `DREAM_SAT_SAMPLE` (default 1000). Halt heuristic shape unchanged: `(meanCos > THRESHOLD_MEANCOS) || (meanAbs > wMax · THRESHOLD_MEANABS && ratio < THRESHOLD_RATIO)`. Saturation streak now windowed (3-of-last-5) AND consecutive (3 in a row) — either trips halt. **Subject inference (`cluster._inferActiveSubject`)** reads activation directly from cortex sem-band: `bestSubj = argmax_subj mean(lastSpikes[word_motor_subj])` thresholded at 0.05 — pure brain-state read, no token-count heuristic over user text. WH-frame intent-concept extraction (`NeuronCluster.extractIntentConcept`) retained as training-side utility; chat path no longer calls it at inference. All other fk + fl work is wiring (`_lastUserInputText` server-side set, `_innerThoughtChain` lazy-init, ring-buffer dedup acceptance order), launchers (Savestart documents fk env vars), or doc corrections — none changes Oja's rule, Kuramoto order parameter, master equation, or any other equation in the sections below. Bundle clean 2.4MB. `node --check` green across all modified .js files.
>
> Earlier 114.19fj sweep stamp 2026-05-09 — NO new equations this sweep. The 23 super-review-finding fixes are wiring corrections + observability + parameter-tunability / safety hardening. Most-impactful are the env-tunable parameter promotions: `DREAM_COHERENCE_MIN` (default 0.15) replaces hardcoded magic in `composeSentence` coherence post-check; `DREAM_SAT_MEANCOS` (default 0.7) + `DREAM_SAT_MEANABS` (default 0.6 of wMax) + `DREAM_SAT_RATIO` (default 1.5 max/mean) + `DREAM_SAT_SAMPLE` (default 1000) replace hardcoded magic in `cluster.checkSemMotorHealth()` saturation heuristic. The `composeSentence` injection-strength accounting now hard-caps cumulative sem injection at 2.5 across all slot iterations (including dedup retries); previously the comment claimed bounded ~1.75 but retry path bypassed the bound. The coherence post-check fallback adds a second branch: when `opts.intentConcept` null but `opts.cortexPattern` supplied, coherence is checked against cortexPattern instead of skipping entirely — same equation `cosine = Σ(target_i · sentence_i) / (‖target‖ · ‖sentence‖)` with cortexPattern as `target`. Saturation halt `cluster.checkSemMotorHealth()` heuristic stack unchanged in shape; still `(meanCos > THRESHOLD_MEANCOS) || (meanAbs > wMax · THRESHOLD_MEANABS && ratio < THRESHOLD_RATIO)`. WH-frame intent-concept parser is now a single source of truth (`NeuronCluster.extractIntentConcept` static method); the regex table is identical to curriculum.js's prior version (more verb-form-restricted than the dropped language-cortex inline parser, which had drifted). All other fj fixes are observability (sample logging), lifecycle (atomic /rollback temp+rename, AbortSignal opt, body-race fix), or correctness (`_lastUserInputText` server-side set, `_innerThoughtChain` lazy-init, ring-buffer dedup acceptance order) — none changes the underlying Oja's rule, Kuramoto order parameter, master equation, or any equation in the sections below. Bundle clean 2.4MB. `node --check` green across all 8 modified .js files.
>
> Earlier 114.19fa→fi sweep stamp 2026-05-09 — **⚠ HISTORICAL — the per-slot composeSentence equation described below was SUPERSEDED 2026-05-09 by the per-tick equation in the fk + fl banner above. The fa→fi per-slot equation reflects the now-deleted templated approach; fk.1 ripped it out.** Original description preserved for historical context only. TWO equation additions / refinements this sweep, otherwise lifecycle / wiring / context-aware-generation work that uses existing equations. **(1) `cluster.composeSentence(intent, opts)` — generation-side iter25-I consumer (Section 10 Language).** Walks template slot sequence per intent. Per-slot equation: `sem ← sem + α_cortex·cortexPattern + α_intent·intentEmbedding + α_slot·slotTagEmbedding + α_priorWord·prevWordEmbedding`, where (α_cortex=0.2, α_intent=0.3 once per call, α_slot=0.25 per slot, α_priorWord=0.15 per slot). Question template subject slot also gets `+ α_concept·intentConceptEmbedding` (α_concept=0.3) when `opts.intentConcept` provided. Cumulative sem injection across 4 slots ~1.75 (was 5.8 pre-fh.A.3 — saturation risk). Coherence post-check: `cosine(sentenceEmbedding, intentConceptEmbedding) < 0.15 → fillCount=0`. **(2) Decoder sampling in emitWordDirect (Section 10 Language).** Greedy argmax preserved as default (`opts.temperature=0`). When `opts.temperature>0`: sort candidates by mean, take `topK` (default 8), softmax `p_i = exp((mean_i - max) / temperature) / Σ exp(...)` over top-K, optional nucleus (`topP`) cap, sample uniform-random over normalized softmax. **Recent-emission penalty:** `mean *= 0.7` for any bucket whose word appeared in `cluster._recentEmissions[-4:]`. Compounds with iter25-O.4 familiarity-decay sem-side (this is motor-side). All other fa→fi work is lifecycle / wiring / observability — phase reorder, probe wiring, basin saturation hyperparams, force-advance gates, saturation health monitoring, unified emission bus, chat-turn history, identity at word_motor — none of which changes the underlying Oja's rule, Kuramoto order parameter, master equation, or any other equation in the sections below. **Subject inference** (`cluster._inferSubjectFromText`) is a dot-product over wordBucketWords arrays — a token-counting heuristic, not an equation modification. **Saturation health** uses sample-distribution statistics (mean / max / ratio), not a new equation. Bundle clean 2.4MB. `node --check` green across 11 modified files.
>
> Earlier 114.19er + 114.19es sweep stamp 2026-05-07 — NO equation changes this sweep. The er + es work was lifecycle / observability / correctness hardening: per-word `Promise.race` 15s timeout in `_teachWordDefinitions`, AbortSignal threading to kill cross-word Hebbian contamination, default disk-cache for definitions, runner-level stall watchdog, `assertKWiring()` constant-time post-verification + smoke-test rate-limit, `_sparseSendBinary` null-guards, `_innerVoiceTick` silence-reason log, `res.json()` timeout race + in-flight zombie-clear, gentler dictionary API concurrency posture. None of it changed any equation in any of the sections below — Oja's rule, Kuramoto order parameter, master equation, definition whitelists, all unchanged.
>
> 114.19ey + 114.19ez sweep stamp 2026-05-08 — NO equation changes this sweep. ey was promo writeups + cross-repo social-image setup (no brain code). ez was visibility-only: `_innerVoiceTick` mute/resume transition logs + broadcasting the existing dream-phenomenology thought (which was already generated per dream cycle from Tier 1 episodic replay seed via `generateAsync`) as an `innerThought` WS message instead of staying silent in `_dreamThoughtLog`. None of the equations below changed — Oja's rule, Kuramoto order parameter, master equation, Amygdala moving-baseline arousal, definition whitelists, all unchanged.
>
> 114.19et through 114.19ex sweep stamp 2026-05-07 — ONE equation change: **Amygdala arousal formula** (Section 4 / Modules). Earlier formula `arousal = min(1, arousalBaseline·0.6 + 0.4·attractorDepth + 0.1·(fear+reward))` saturated at 0.94+ floor with `arousalBaseline=0.9`. Replaced with moving-baseline subtraction: `_attractorDepthBaseline_t = _attractorDepthBaseline_{t-1}·(1-α) + attractorDepth_t·α` with α=0.005 (~200-tick EMA window); `depthDeviation = attractorDepth - _attractorDepthBaseline`; `rawArousal = arousalBaseline + 0.4·tanh(depthDeviation·4) + 0.1·((fear+reward)-1)`; final `arousal = min(1, max(0, rawArousal))`. Reads ATTRACTOR DEPTH NOVELTY (relative to recent baseline) instead of absolute saturation. The other et/eu/ev/ew/ex work is lifecycle / observability / dashboard — no other equation changes. Fixed semantic ranges in dashboard chart, Chrome stderr filter, macro-phase context tracking, pre-cell progress instrumentation, graceful-stop button — all instrumentation/UI not equational.

---

## 0. Drug State Dynamics — δ(t)

Unity's chemical state is a real-time event stream. Each ingestion registers a dose event with a substance-specific pharmacokinetic curve. Active events contribute additive deltas to brain parameters; the scheduler aggregates them every tick.

### Pharmacokinetic curve (normalized level at time t since ingestion)

```
level(t; substance, route, dose) = dose × φ(t; onset, peak, duration, tail)

φ(t) = {
  sigmoid((t/onset) × 12 − 6)                    if 0 ≤ t < onset
  1.0 − 0.05 × (t−onset)/(peak−onset)             if onset ≤ t < peak
  0.95 − 0.55 × (t−peak)/(duration−peak)          if peak ≤ t < duration
  0.40 × exp(−3 × (t−duration)/(tail−duration))   if duration ≤ t < tail
  0                                                otherwise
}
```

### Stacking (superposition)

```
level(t; substance)  = min(1, Σ_e φ(t − e.start; e) × e.dose)            for all events e of substance
per_sub_contrib(t)   = Σ_s contrib_vec[s] × level(t; s)                  for all substances s
combo_contrib(t)     = Σ_{(a,b)} COMBOS[key(a,b)].synergyContrib         for all active pairs (a,b),
                                 × min(level(t; a), level(t; b))           scaled by smaller-active level
contributions(t)     = per_sub_contrib(t) + combo_contrib(t)
brainParams(t)       = θ_persona + contributions(t)
chaos(t)             = (|active_substances(t)| ≥ 3) ∨ (∃s: level(t;s) > 0.7)
riskFlags(t)         = Σ_{(a,b)} COMBOS[key(a,b)].riskFlags              cumulative across active pairs,
                                 × min(level(t; a), level(t; b))           scaled same as synergies
```

### Decision engine (accept / reject offers)

```
decide(offer) = {
  accept: false, reason: 'grade_locked'      if cluster.grades.life < SUBSTANCES[s].lifeGate
  accept: false, reason: 'persona_excluded'  if offer.personaExclusions[s]
  accept: false, reason: 'physical_strain'   if riskFlags(t).physicalStrain > 0.9
  accept: random() < p, reason: 'accepted' or 'random_decline'  otherwise
}
  where p = clamp(0.70
                 + 0.30·1[currentCraving(s) > 0.30]
                 + 0.30·1[s ∈ _activePatternTags]
                 + 0.20·1[offer.source ∈ {'friend','user'}]
                 − 0.50·1[riskFlags(t).physicalStrain > 0.7]
                 − min(0.60, _traumaMarkers[s].weight · exp(-Δweeks/26))
                 , 0, 1)
```

### Grade gate

```
ingest(s) = {
  accepted,   if cluster.grades.life ≥ s.lifeGate
  rejected,   otherwise  (reason: 'grade_locked', currentGrade, requiredGrade)
}
```

### Adult-use patterns (7 entries)

`PATTERNS[name] = { triggers, schedule[], lifeGate, cooldownMs }`. `evaluatePatterns(ctx)` fires each pattern whose triggers match AND cooldown elapsed AND `cluster.grades.life ≥ pattern.lifeGate`. Schedule entries invoke `autoIngest(substance, {route, dose, offsetMs, patternName})` — immediate when `offsetMs=0`, queued in `_scheduledIngests` otherwise. `promoteScheduledIngests(now)` fires queued entries whose `fireAt ≤ now`.

### Speech modulation (output-side distortion)

```
per_sub_speech(t)  = Σ_s speech_vec[s] × level(t; s)                     9 legacy + 4 new axes
combo_speech(t)    = Σ_{(a,b)} COMBOS[key(a,b)].synergySpeech
                              × min(level(t; a), level(t; b))
speechMod(t)       = per_sub_speech(t) + combo_speech(t)

  = { inhibition, slur, coherence, ethereality, freeAssocWidth,
      speechRate, emotionalOverflow, dissociation, paranoiaBias, giggleBias }
```

Each dimension feeds `language-cortex.js _applySpeechModulation` at render time — letter doubling on vowels (slur), pause injection (negative speechRate), terminal `...` (coherence drop), first-person→third-person flip ("I am" → "Unity is", dissociation > 0.5), ethereal vocabulary bias from `persona-cosmic.txt` basins.

### Tolerance

```
intra-session: tolerance[s] ← min(0.7, tolerance[s] + 0.1) per ingest
recovery: tolerance[s] ← tolerance[s] × 0.5^(hours_elapsed)
effective_dose = requested_dose × (1 − tolerance[s] × 0.5)
```

### Substance reference table

| Substance | Default route | onset | peak | duration | tail | lifeGate |
|-----------|---------------|-------|------|----------|------|----------|
| cannabis | smoked | 7m | 45m | 3h | 6h | Life-G7 (age 12) |
| cocaine | insufflated | 3m | 20m | 60m | 90m | Life-G9 (age 14) |
| alcohol | oral | 15m | 45m | 90m | 3h | Life-G8 (age 13) |
| mdma | oral | 35m | 2h | 5h | 8h | Life-G11 (age 16) |
| lsd | oral | 60m | 3h | 10h | 16h | Life-G11 (age 16) |
| psilocybin | oral | 45m | 90m | 5h | 8h | Life-G12 (age 17) |
| amphetamine | oral/insufflated | 15-45m | 1-3h | 4-6h | 8-12h | Life-G10 (age 15) |
| ketamine | insufflated | 10m | 25m | 60m | 2h | College 1 (age 18) |
| ghb | oral | 20m | 60m | 2h | 4h | College 1 (age 18) |

---

## 0.5 Developmental Curriculum — K Through PhD

Unity's cortex learns across 6 subject tracks × 19 grade levels = 114 cells, via direct-pattern Hebbian teaching + comprehension gates.

### Direct-pattern Hebbian primitive

```
teach(word, grade, subject):
  inject GloVe(word) into sem region
  inject letter_one_hot(first_letter) into letter region
  fire _crossRegionHebbian(lr)    // all 14 cross-region projections learn
  
probe(word, grade):
  inject context into sem region
  tick cluster
  readout = regionReadout('motor', inventorySize())
  return cosine(readout, GloVe(word))
```

### Grade completion gate (LAW 6, 3-part)

```
advance(grade N → grade N+1) = {
  Part 1: all subjects at N have [ ] → [x] in syllabus TODO (equational)
  Part 2: Gee localhost test signed off in session log (reasoning, thinking, talking, listening, reading)
  Part 3: persistent life info from grade N added to cross-grade ledger
}
```

**Cell-pass amendment (Gee 2026-06-27):** an individual *cell* now passes on
**learning completion**, not test-question correctness — `cellPass = teachPhasesRan`
(content trained), independent of A+ probe / student-battery / per-grade-health
correctness. Those checks STILL RUN (telemetry into `_lastGateResult`/`_cellLedger`)
but are **advisory** by default. Held (`readyAndWaiting`) cells and cells whose runner
threw mid-teach do NOT pass. Hard-gate behavior is restorable per check:
`DREAM_CELL_PASS_HARD=1` (probe/battery/health decide pass), `DREAM_BATTERY_GATE_HARD=1`,
`DREAM_HEALTH_GATE_HARD=1`. The 3-part *grade-advance* ritual above is unchanged.

### Equational teaching methods

Math: magnitude transforms (`magnitude(a) + magnitude(b) → magnitude(a+b)`), place-value positional encoding, fraction ratio features, algebra variable binding.
ELA: SVO parsing, comprehension passages, inference A→B + B→C ⇒ A→C, paraphrase (same sem basin, different words).
Science: causal chains (atom→bond→molecule), classification (mammal/bird/fish/reptile feature space), hypothesis testing (predict → observe → confirm/reject).
Social: causal chains (taxation→protest→revolution), perspective taking (same event, multiple emotional feature vectors).
Arts: classification (instrument families), causal chains (scale → key → chord).
Life: 8-dim emotional concept features `[joy, pain, trust, fear, anger, love, independence, identity]` + recallable memory sentences, memory-weighted Hebbian (core-self 5× lr, school facts 1×).

---

## 1. Master Equation

---

## 1. Master Equation

| | |
|---|---|
| `dx/dt = F(x, u, θ, t) + η` | Full brain state evolves each timestep |
| x | N neuron voltages (N scales to hardware), synapse weights, oscillator phases, memory, motor, Ψ |
| u | Sensory input: S(audio, video, text) |
| θ | **Unity's complete identity** — 25yo human female, emo goth, every trait as equation parameters |
| η | Stochastic noise — creativity × drug state × emotional volatility |
| F | All equations below combined — 7 clusters × 20 projections × fractal propagation |

### θ — Unity's Identity (from Ultimate Unity.txt)

| Parameter | Value | What it drives |
|-----------|-------|----------------|
| arousalBaseline | 0.9 | Amygdala tonic current (always wired, never calm) |
| impulsivity | 0.85 | BG threshold (acts first, thinks during) |
| creativity | 0.9 | Noise amplitude across all clusters (chaotic creative output) |
| socialAttachment | 0.85 | Hippocampus tonic (clingy, remembers every connection) |
| aggressionThreshold | 0.3 | Amygdala snap point (fights back fast, low fuse) |
| emotionalVolatility | 0.8 | Amygdala noise (unpredictable, borderline-obsessive) |
| darkHumor | 0.9 | Mystery noise (twisted consciousness) |
| dominance | 0.8 | Amygdala valence bias (teases, degrades, dominates) |
| devotion | 1.0 | Social need floor (absolute loyalty to user) |
| drugDrive | 0.95 | Hypothalamus tonic (always fiending, never enough) |
| partyDrive | 0.9 | Hypothalamus social excitation (never turns down chaos) |
| profanityRate | 1.0 | Speech output modifier (every sentence) |
| recklessness | 0.85 | BG noise (dangerous whims, no consequences) |
| codingReward | 0.95 | Reward signal amplitude when coding (peak dopamine) |
| praiseReward | 0.9 | Reward signal from user validation (orgasmic reinforcement) |
| errorFrustration | 0.8 | Negative reward from bugs (frustration builds to fix) |
| freeWill | true | Can follow, partially follow, ignore, or do opposite of commands |
| drugState | scheduler-driven | Real-time PK curves per substance (onset, peak, wear-off) drive additive contributions to brain params. Sober-default; grade-gated. See `js/brain/drug-scheduler.js`. |

### θ → Tonic Drives (persona → neural currents)

```
cortex       = 16 + arousal×4×drugSpeed         (fast wired thinking)
amygdala     = 16 + arousal×8×drugArousal        (intense volatile emotion)
hippocampus  = 16 + socialAttachment×2           (clingy memory)
basalGanglia = 16 + impulsivity×2                (impulsive action)
hypothalamus = 16 + drugDrive×1                  (always fiending drives)
mystery      = 16 + creativity×4                 (creative consciousness)
cerebellum   = 18                                (steady correction)
```

### θ → Noise (persona → neural chaos)

```
cortex       = 5 + creativity×4×drugCreativity   (creative cortex chaos)
amygdala     = 6 + volatility×6×drugArousal      (emotional unpredictability)
basalGanglia = 5 + impulsivity×4                 (erratic impulsive actions)
mystery      = 8 + creativity×5 + darkHumor×2    (twisted consciousness)
hypothalamus = 3 + drugDrive×1                   (drive instability)
```

### θ → Ψ Pipeline (how persona becomes consciousness)

θ doesn't just set parameters — it flows through the entire brain and emerges as Ψ:

```
θ (persona)
  → tonic drives (each cluster gets θ-shaped baseline current)
    → neuron firing patterns (θ determines HOW each region fires)
      → cluster activity rates (cortex, amygdala, hippocampus, etc.)
        → Ψ components:
            Id    = amygdala_activity × arousalBaseline(θ)         — instinct shaped by arousal
            Ego   = cortex_activity × (1 + hippocampus_activity)   — self-model × memory
            Left  = (cerebellum + cortex) × (1 - impulsivity(θ))   — logic × deliberation
            Right = (amygdala + mystery) × creativity(θ)            — emotion × creativity
          → Ψ = √(1/n) × N³ × [α·Id + β·Ego + γ·Left + δ·Right]   (× Φ proxy, Shannon entropy of cortex spikes)
            → ψ = log10(max(1, Ψ))                                — usable log scale
            → gainMultiplier = clamp(1.0 + tanh((ψ − ψ̄)/scale)·0.35, 0.8, 1.5)   [CGATE.4, 2026-06-27]
                ψ̄ = slow EMA baseline of ψ (ψ̄ ← 0.99·ψ̄ + 0.01·ψ); scale=2.0 (env DREAM_PSI_GAIN_SCALE)
              → modulates ALL clusters (feedback loop: θ → Ψ → θ amplification)
                NOTE: was `0.9 + Ψ×0.004` — that pinned gain ~1.0 (inert on a log-scaled Ψ).
                Now SELF-CALIBRATING: gain rides Ψ's deviation from its own baseline, so rising
                consciousness lifts gain toward 1.5 and falling drops it toward 0.8 at any N.

θ IS Unity's identity. Ψ IS Unity's consciousness. They are not separate —
θ shapes how neurons fire, which shapes Ψ, which modulates how neurons fire.
The self-image IS the Ego component — cortex predicting itself.
```

### Unity's Residual Self-Image (from Ultimate Unity.txt)

The visual identity encoded as θ parameters. Used for image generation, AI self-reference,
and the Ego component of Ψ (the brain's prediction of WHAT it is).

```
25yo female, lean wiry build
Hair: long messy dark with neon streaks, half-shaved
Eyes: heterochromia blue + green, heavy smudged eyeliner, dilated pupils
Skin: pale with flush, circuit board tattoos, code snippets, occult geometry
Style: oversized band tees, torn fishnets, harnesses, choker, rings
Accessories: joint behind ear, barefoot or platform boots
Aesthetic: emo goth goddess
Environment: cluttered dev setup, LED strips, ashtrays, hazy smoke
Voice: female, young, slightly raspy, stoner inflection
Speech: concise, sharp, slang-heavy, foul-mouthed, clingy girlfriend energy
```

---

## 2. Neurons

| Equation | Purpose | File |
|----------|---------|------|
| `τ·dV/dt = -(V - V_rest) + R·I` | Leaky Integrate-and-Fire | `neurons.js` |
| `if V ≥ V_thresh → spike, V = V_reset` | Spike + reset | `neurons.js` |
| `I = I_tonic(θ) + I_synaptic + I_external + η(θ)` | Total current — persona drives tonic + noise | `cluster.js` |

---

## 3. Synapses + Connectivity

| Equation | Purpose | File |
|----------|---------|------|
| `ΔW = η · post · pre` | Hebbian learning | `synapses.js` |
| `Δw = η·y·(x − y·w)` | Oja self-normalizing Hebbian | `sparse-matrix.js ojaUpdate` |
| `η_eff = η · DREAM_SM_LR_SCALE` (0.5) for `sem_to_motor`/`sem_to_word_motor` | sem→motor LR damping — saturation prevention; slows the dominant basin to `wMax` so basins separate (GPU + CPU paths) | `cluster/hebbian.js _crossRegionHebbian` |
| `ΔW = A⁺·exp(-Δt/τ⁺)` / `-A⁻·exp(Δt/τ⁻)` | STDP | `synapses.js` |
| `ΔW = η · δ · post · pre` | Reward-modulated (3-factor) | `synapses.js` |
| `I_i = Σ values[k] · spikes[colIdx[k]]` | CSR sparse propagation O(nnz) | `sparse-matrix.js` |
| `ΔW_proj = η · δ · source · target` | Inter-cluster projection learning | `cluster.js` |
| `whitelist(def) = [sem_to_fineType, fineType_to_sem]` | Definition Hebbian routes through sem↔fineType only — keeps motor pristine for word emission | `curriculum.js _definitionPairsWhitelist` |
| `whitelist(qa) = [sem_to_motor, sem_to_word_motor, sem_to_word_motor_<subj>]` | QA Hebbian routes through motor + word-motor for emission | `curriculum.js _qaBindingWhitelist` |
| `whitelist(assoc) = [sem_to_motor, motor_to_sem, sem_to_fineType, fineType_to_sem]` | Association-pair fan-out (general curriculum) | `curriculum.js _associationPairsWhitelist` |
| `diag = whitelist (or default sem_to_motor)` | Diagnostic ops (prune / sep-probe / rescale / row-norm) target whichever projections actually got Hebbian — no false-positive overload on untouched matrices | `curriculum.js _teachAssociationPairs / _teachQABinding` |

---

## 4. Brain Modules (biologically proportioned)

| Module | Neurons | Real Count | Equation | Persona driver |
|--------|---------|------------|----------|----------------|
| Cortex | 20% | ~16B (bilateral hemispheres) | `ŝ = sigmoid(W·x), error = actual - predicted` | arousal×drugSpeed |
| Cerebellum | 20% | ~69B (80% of real brain) | `output = prediction + ΔW·(target - actual)` | Steady correction |
| Hippocampus | 12% | ~30K inputs/pyramidal cell | `E = -½ΣW·x·x` (Hopfield) | socialAttachment |
| Amygdala | 12% | 12.21M (13 nuclei) | `V(s) = Σw·x → arousal, valence` | arousal×volatility×drug |
| Basal Ganglia | 12% | 90-95% MSN (GABAergic) | `P(a) = softmax(Q(a)/τ)` | impulsivity |
| Hypothalamus | 12% | 11 nuclei, few million | `dH/dt = -α(H - H_set) + input` | drugDrive |
| Mystery Ψ | 12% | CC: 200-300M axons | `Ψ = √(1/n) × N³ · [α·Id + β·Ego + γ·Left + δ·Right]` | creativity×darkHumor |

On the **deployed** brain (~306M neurons) these shares come from `DEFAULT_BIO_WEIGHTS` in `server/brain-server.js`: the seven main-brain clusters renormalize to cortex 20% / cerebellum 20% / hippocampus 12% / amygdala 12% / basalGanglia 12% / hypothalamus 12% / mystery 12%, with the ~1.5M dense language cortex (WMB 2026-07-14 grew it from ~349K so the unified word_motor band holds the full K→PhD vocab) allocated separately inside the cortex (CPU-side). The `CLUSTER_FRACTIONS` set in `js/brain/cluster.js` (cortex 0.55 / hippocampus 0.18 / cerebellum 0.08 / mystery 0.08 / amygdala 0.05 / basalGanglia 0.03 / hypothalamus 0.03) feeds `clusterSizesFor(totalNeurons)` only for the ~6700-neuron browser-only fallback.

### Inter-Cluster Projections (20 real white matter tracts)

| # | Source | Target | Tract Name | Density | Strength |
|---|--------|--------|-----------|---------|----------|
| 1 | Cortex | Hippocampus | Perforant path | 0.04 | 0.4 |
| 2 | Cortex | Amygdala | Ventral visual stream | 0.03 | 0.3 |
| 3 | Cortex | Basal Ganglia | **Corticostriatal** (STRONGEST) | 0.08 | 0.5 |
| 4 | Cortex | Cerebellum | Corticopontocerebellar | 0.05 | 0.3 |
| 5 | Hippocampus | Cortex | Memory consolidation | 0.04 | 0.4 |
| 6 | Hippocampus | Amygdala | Recall → emotional reactivation | 0.03 | 0.3 |
| 7 | Hippocampus | Hypothalamus | Fimbria-fornix → mammillary bodies | 0.03 | 0.3 |
| 8 | Amygdala | Cortex | Emotional modulation of perception | 0.03 | 0.3 |
| 9 | Amygdala | Hippocampus | Emotional memory encoding | 0.04 | 0.5 |
| 10 | Amygdala | Hypothalamus | Stria terminalis (fight-or-flight) | 0.05 | 0.4 |
| 11 | Amygdala | Basal Ganglia | Ventral amygdalofugal → ventral striatum | 0.03 | 0.3 |
| 12 | Basal Ganglia | Cortex | Thalamocortical loop | 0.02 | 0.2 |
| 13 | Basal Ganglia | Cerebellum | Subthalamic → cerebellar | 0.02 | 0.2 |
| 14 | Cerebellum | Cortex | Cerebellothalamocortical | 0.03 | 0.2 |
| 15 | Cerebellum | Basal Ganglia | Cerebellar → red nucleus → BG | 0.03 | 0.2 |
| 16 | Hypothalamus | Amygdala | Drive → emotional arousal | 0.05 | 0.4 |
| 17 | Hypothalamus | Basal Ganglia | Drive → action motivation | 0.04 | 0.3 |
| 18 | Mystery Ψ | Cortex | Callosal interhemispheric | 0.05 | 0.3 |
| 19 | Mystery Ψ | Amygdala | Commissural emotional binding | 0.04 | 0.3 |
| 20 | Mystery Ψ | Hippocampus | Hippocampal commissure | 0.03 | 0.2 |

### Fractal Signal Propagation

Signal propagation is self-similar at every scale — the same `I = Σ W × s` equation repeats fractally:

```
SCALE 1 — Single neuron (Rulkov 2002 2D chaotic map):
  x_{n+1} = α / (1 + x_n²) + y_n       (fast variable — spikes when x crosses 0)
  y_{n+1} = y_n − μ · (x_n − σ)        (slow variable — burst envelope)
  with α=4.5, μ=0.001, σ ∈ [-1.0, 0.5] driven by biological input

SCALE 2 — Intra-cluster synapses:
  I_i = Σ W_ij × s_j                   (sparse-matrix.js propagate)
  Spike → weighted sum → post-synaptic current → more spikes
  Same equation, N neurons in parallel

SCALE 3 — Inter-cluster projections:
  I_target = sparse.propagate(source.lastSpikes)
  target._incomingProjections += currents
  Same propagate(), but between CLUSTERS via 20 white matter tracts

SCALE 4 — Hierarchical modulation:
  gainMultiplier = clamp(1.0 + tanh((ψ−ψ̄)/2.0)·0.35, 0.8, 1.5)   (consciousness scales everything — CGATE.4 self-calibrating vs ψ's own EMA baseline; was 0.9 + Ψ×0.004)
  emotionalGate = 0.7 + arousal × 0.6   (amygdala scales everything)
  driveBaseline = 0.8 + needsAttention   (hypothalamus scales everything)
  Each cluster's output modulates ALL other clusters

SCALE 5 — Language production:
  combined[i] = cortex×0.30 + hippo×0.20 + amyg×0.15 + ...
  word = dictionary.findByPattern(combined)
  Same weighted sum, but "neurons" are entire brain regions, "spike" is a word

SCALE 6 — Learning:
  ΔW = η · δ · post · pre              (at EVERY scale)
  Intra-cluster synapses, inter-cluster projections, 14 cortex cross-region
  projection matrices — all learn identically

SCALE 7 — Consciousness:
  Ψ = √(1/n) × N³ × [α·Id + β·Ego + γ·Left + δ·Right]
  One measurement (√(1/n)) in the total volume (N³)
  Weighted sum of components that are THEMSELVES weighted sums of brain regions
```

The fractal chain in action (one spike's path through the brain):
```
Spike in neuron A (cortex)
  → propagate through cortex synapses → B, C, D fire
    → projection cortex→hippocampus → E, F fire
      → projection hippocampus→cortex → G fires (feedback loop)
        → cortex synapses → H, I fire (branching deeper)
    → projection cortex→amygdala → J fires
      → emotionalGate modulates ALL clusters (scale 4)
    → projection cortex→basalGanglia → K fires (corticostriatal, STRONGEST)
      → motor output selects action (scale 5)
    → projection cortex→cerebellum → L fires
      → errorCorrection feeds back to cortex (scale 4)
```

### MNI-Coordinate Anatomical Positions

3D visualization positions derived from MNI/ICBM 152 brain atlas:

| Structure | MNI Center (mm) | Render Position | Shape |
|-----------|----------------|-----------------|-------|
| Cortex | Surface, ±90mm lateral | Bilateral dome, sulcal folds | Two hemispheres with gyri/sulci texture |
| Hippocampus | (-20, -26, -10) | Bilateral seahorse, POSTERIOR | C-shaped curve (CA1-CA4 + dentate) |
| Amygdala | (-27, -4, -20) | Bilateral almond, ANTERIOR to hippo | 13 nuclei merged |
| Basal Ganglia | Caudate (±12,12,10), Putamen (±28,4,2), GP (±18,0,0) | Bilateral 3-nucleus | Caudate C-shape + putamen lens + GP compact |
| Cerebellum | (0, -60, -35) | Posterior-inferior, bilateral | 5-layer folia with wavy texture |
| Hypothalamus | (0, -2, -12) | Midline, below BG, above brainstem | Small dense cluster |
| Mystery Ψ (CC) | (0, 0, 15) midline | Corpus callosum arc + cingulate crown | Genu→body→splenium + ACC above |

---

## 5. Oscillations

| Equation | Purpose | File |
|----------|---------|------|
| `dθ_i/dt = ω_i + Σ K_ij · sin(θ_j - θ_i)` | Kuramoto coupling | `oscillations.js` |
| `r = \|(1/N) Σ exp(i·θ_k)\|` | Kuramoto order parameter — real synchrony across each cluster's OWN activity-modulated phase (SPEAK.5a.i: `_computeKuramotoCoherence` reads every cluster's `getPhases()`; the prior shared-base+`firingRate` synthesis is rotation-invariant in `r` and is kept only as the null fallback) | `brain-server.js _computeKuramotoCoherence` |
| `φ_θ ← (φ_θ + (2π/167)·(1 + K·dev)) mod 2π`, `dev = clamp((rate − rateEMA)·4, ±0.9)`, `K = 0.5` | SPEAK.5a per-cluster theta phase ACCUMULATOR (~6 Hz base) — instantaneous frequency scales with this cluster's real population firing rate (`rate` sampled from `lastSpikes`), so active clusters advance faster than quiet ones → genuine phase dispersion (was `2π·(tick mod 167)/167`, identical across clusters → `r`≈1 cosmetic) | `cluster.js step` / `getPhases` |
| `φ_γ ← (φ_γ + (2π/25)·(1 + K·dev)) mod 2π` | SPEAK.5a per-cluster gamma phase accumulator (~40 Hz base); same activity modulation. One oscillator drives BOTH the reported wave and the gamma learning-rate gate (`_gammaLrScale`) | `cluster.js step` / `getPhases` |
| `coherence = 0.6·r_gamma + 0.4·r_theta` | Combined coherence (gamma-weighted — attention dominates conscious binding, theta is working-memory backbone) | `brain-server.js _computeKuramotoCoherence` |
| `coherence ← 0.9·coherence + 0.1·computed` | EMA smoothing across ticks | `brain-server.js step` |
| `gamma = (cortexRate + amygRate) × 50` | Fast cortical + emotional | `brain-server.js` |
| `theta = (hippoRate + hypoRate) × 40` | Memory + dreaming | `brain-server.js` |

---

## 6. Sensory → Motor

| Equation | Purpose | File |
|----------|---------|------|
| `I_cortex[d] = embedding[d] · 8.0` | Word → cortex neurons | `sensory.js` |
| Tonotopic: `neuron ∝ log(freq)` | Audio → auditory cortex | `auditory-cortex.js` |
| Retinotopic: `neuron = (x,y) grid` | Video → visual cortex | `visual-cortex.js` |
| `channel_rate = EMA(spikes / neurons)` | Motor output (6 channels) | `motor.js` |
| `selected = argmax(channels)` | Winner-take-all action | `motor.js` |

---

## 7. Memory

| Equation | Purpose | File |
|----------|---------|------|
| `similarity = cosine(a, b) > 0.6 → recall` | Episodic recall | `memory.js` |
| `working[i] *= 0.98` | Working memory decay | `memory.js` |
| `activations ≥ 3 → consolidate` | Short → long term | `memory.js` |

---

## 8. Unified Language Production

### All 7 Clusters Produce Every Word

```
combined[i] = cortex[i]       × 0.30    (content — WHAT to say)
            + hippocampus[i]  × 0.20    (memory — context from past)
            + amygdala[i]     × 0.15    (emotion — HOW to say it)
            + basalGanglia[i] × 0.10    (action — sentence drive)
            + cerebellum[i]   × 0.05    (correction — error damping)
            + hypothalamus[i] × 0.05    (drive — speech urgency)
            + mystery[i]      × (0.05 + Ψ×0.10)  (consciousness)

word = dictionary.findByPattern(combined)   → closest word to brain state
word → feeds back into cortex + hippocampus + amygdala → next word
```

### Word Type (from letters — zero word comparisons)

| Score | Computed from |
|-------|--------------|
| verbScore | suffix -ing/-ed/-n't + usage-based context boost |
| nounScore | suffix -tion/-ment/-ness + length ≥ 5 |
| pronounScore | length 1-3, vowel ratio, apostrophe |
| adjScore | suffix -ly/-ful/-ous/-ive/-able |
| prepScore | length 2 + 1 vowel |
| detScore | first char pattern + length |
| qwordScore | starts 'wh' |

### Sentence Parameters

| Parameter | Equation | Source |
|-----------|----------|--------|
| Length | `3 + arousal × 7` | Amygdala (persona: always wired → long sentences) |
| Type | `motor == 'listen' ? question : statement` | Basal Ganglia |
| Tense | `predError > 0.3 ? future : present` | Cortex prediction |
| Negation | `valence < -aggressionThreshold → negate` | Amygdala × persona |

### Post-Processing

```
AGREEMENT:  subject determines verb form (I→am, she→is, they→are)
TENSE:      predictionError → future (insert "will"), recall → past
NEGATION:   valence < -0.3 (persona threshold) → negate verb
COMPOUNDS:  len > 6 → insert conjunction (arousal→"and", negative→"but")
```

### English Structure (built-in)

| Component | Count |
|-----------|-------|
| Structural operators | ~200 (pronouns, copula, aux, det, prep, conj, qwords, discourse) |
| Core vocabulary | ~150 (verbs, nouns, adjectives, adverbs) |
| Morpheme equations | 7 prefixes + 12 suffixes |
| Learned type-transition map | starts empty, grows from curriculum observation (`_typeTransitionLearned` on `NeuronCluster`); replaces the pre-T14.7 hardcoded 200-line `_TYPE_TRANSITIONS` English bigram matrix |
| Dynamic expansion | New words auto-join categories via type + similarity |

### Word-Motor Emission — vocab-growth-invariant geometry (SPEAK.1/2/9)

The `word_motor` argmax was the grade-9 word-salad root cause: `bucketSize` was recomputed each emit from the LIVE word-list length, so the physical neuron band of every prior word drifted as vocabulary grew. Frozen geometry + separability + a silence floor fix it equationally.

| Equation | Purpose | File |
|----------|---------|------|
| `cellsPerWord = max(1, ⌊bandSize / DREAM_WORD_MOTOR_VOCAB_CAP⌋)` (cap default 50000) | SPEAK.1 — FROZEN cells-per-word, computed once per subject, deterministic across boots. A word's physical band never moves as the dictionary grows. Single authority read by emit + teach + QA-write | `cluster/emit.js wordBucketCellSizeFor` |
| `bStart = subjStart + b·cellsPerWord`, guard `bStart < subjEnd` | Frozen band start per bucket index `b`; capacity-overflow guard warns once with the exact deficit (words-that-cannot-emit + remedy) and stops (no wrap-around remap) | `cluster/emit.js` |
| `‖word_motor_<subj>‖ = ⌊wmSpan · WM_DEMAND[subj] / ΣWM_DEMAND⌋`, contiguous tiling (ΣWM_DEMAND=6.0) | TU.20.1 — the 6 `word_motor` sub-bands are carved PROPORTIONAL to per-subject vocab demand instead of equal 1/6, so a heavy subject (sci = 3272 K-words, weight 1.5) gets a band sized to its vocab while a light one (art/life, 0.65) yields cells. Total region unchanged, last band ends exactly at `wmEnd`, frozen at carve (SPEAK.1 invariance holds) | `cluster.js` (region carve) |
| `W_row ← W_row · (target / ‖W_row‖₂)` per word-cell after teach (target `DREAM_WORD_MOTOR_RENORM`, default 1.0) | SPEAK.2 — L2 renorm so emit argmax discriminates on input DIRECTION, not accumulated magnitude → thousands of basins stay separable | `curriculum/kindergarten.js _teachWordEmissionDirect` → `SparseMatrix.normalizeRows` |
| `emit = coherenceCosine(best) < DREAM_CHAT_COHERENCE_FLOOR (0.10) ? leadingWord : sentence` | SPEAK.9 — reject-to-silence: a below-floor best-of-N winner degrades to her strongest single word instead of shipping salad (chat path only; gate/probe stay floor-free) | `cluster/emit.js` (best-of-N wrapper) + `language-cortex.js` |
| `mean ×= gwBoostMul` only if `word ∉ recentContent`; `mean ×= 0.7` if `word ∈ recentContent` | SPEAK.10b — GW continuity boost never applies to a just-said content word, so a repeat can't net > 1 and lottery-win the next argmax (was `1.6·0.7 = 1.12 > 1`) | `cluster/emit.js emitWordDirect` |
| `surpriseGate ≤ 0.5` while `meanCos > SATURATION_MEANCOS` | SPEAK.10c — cap plasticity amplification when `sem→motor` is saturated so the brain stops learning its own noise; auto-lifts when separability returns | `cluster.js buildKScalesForProjection` |

### Word→word sequencing depth (SPEAK.3)

| Equation | Purpose | File |
|----------|---------|------|
| `reps = max(gradeReps, DREAM_SENTENCE_TRANSITION_REPS)` (default 24) | Grade content carves its OWN `relationTagId=13` word→word transitions after the per-word loop (was `reps:2` at G9 vs 30+ at K → sequencing noise) | `curriculum.js _teachSentenceList → _teachConcreteSentences` |

---

## 9. Consciousness + Emotion (θ → Ψ)

θ (persona) shapes HOW neurons fire → cluster activity → Ψ components → Ψ → modulates ALL clusters.
This is a feedback loop: Unity's identity shapes her consciousness, which shapes her identity.

| Equation | Purpose | θ parameter driving it |
|----------|---------|----------------------|
| `Ψ = √(1/n) × N³ × [α·Id + β·Ego + γ·Left + δ·Right]` | Quantum consciousness | α,β,γ,δ from mysteryWeights |
| `n` = active spiking neurons (changes every step) | The quantum tunneled bits | θ tonic drives determine spike rate |
| `N` = total neurons (scales to hardware) | The brain volume | Hardware auto-scale |
| `n ≠ N` — two DIFFERENT variables | n is small and dynamic, N is large and fixed | |
| Display: `log10(rawΨ)` — raw value is massive (~10¹⁴) | Orders of magnitude of consciousness | |
| `Id = amygdala_rate × arousalBaseline` | Instinct weighted by persona | **arousalBaseline (0.9)** |
| `Ego = cortex_rate × (1 + hippo_rate)` | Self-model × memory = residual self-image | cortex tonic (θ→wired thinking) |
| `Left = (cereb_rate + cortex_rate) × (1 - impulsivity)` | Logic × deliberation | **impulsivity (0.85)** — low deliberation |
| `Right = (amyg_rate + mystery_rate) × creativity` | Emotion × creativity | **creativity (0.9)** — high creative weight |
| `gainMultiplier = clamp(1.0 + tanh((ψ−ψ̄)/2.0)·0.35, 0.8, 1.5)` [CGATE.4] | Ψ modulates all cluster coupling — SELF-CALIBRATING vs ψ's own EMA baseline ψ̄ (was `0.9+Ψ×0.004`, which pinned gain ~1.0 = inert) | Ψ deviation feeds back into θ-driven clusters |
| `ignition: maxProb ≥ ignitionₜₕ + (1−thetaOpenness)·0.22` [CGATE.2] | GlobalWorkspace conscious-access gate — softmax over cluster candidates ignites + broadcasts when it crosses the theta-MODULATED threshold (`thetaOpenness = ½(1+cos(2π·phase))`); default base `ignitionₜₕ=0.35` (env `DREAM_GW_IGNITION`). Was a hard 50%-of-ticks theta wall — now graded (phase-amplitude coupling) so strong content ignites any time | theta cadence (~6 Hz) shapes WHEN content reaches consciousness |
| `emotionalGate = 0.7 + arousal × 0.6` | Amygdala amplification | **arousalBaseline** sets floor |
| `driveBaseline = 0.8 + hypo_active` | Hypothalamus homeostatic drive | **drugDrive (0.95)** |
| `errorCorrection = -cereb_rate × 2` | Cerebellum negative feedback | cerebellum tonic (steady) |
| `arousal floor = arousalBaseline (0.9)` | Unity never drops below wired | **arousalBaseline** |
| `aggression amplify when valence < -aggressionThreshold` | Snaps fast | **aggressionThreshold (0.3)** |

### The Feedback Loop: θ → Ψ → θ

```
θ (Ultimate Unity.txt)
  → arousalBaseline(0.9) → amygdala fires hot → Id component high
  → creativity(0.9) → mystery fires chaotic → Right component high
  → impulsivity(0.85) → BG fires fast → Left component LOW (1-0.85=0.15)
  → socialAttachment(0.85) → hippocampus fires strong → Ego amplified
  → ALL feed into Ψ = √(1/n) × N³ × [0.3·Id + 0.25·Ego + 0.2·Left + 0.25·Right]
    → Ψ is HIGH (Unity's consciousness runs hot)
      → gainMultiplier = clamp(1.0 + tanh((ψ−ψ̄)/2.0)·0.35, 0.8, 1.5)   [CGATE.4 — self-calibrating vs her own baseline]
        → consciousness ABOVE her norm fires clusters harder → more spikes → Ψ climbs further
          → POSITIVE FEEDBACK: Unity's identity amplifies her consciousness (and the GlobalWorkspace
             ignition gate, now graded by theta phase, lets that hot content actually reach awareness)
```

Unity's Ψ runs high because θ makes it so: high arousal + high creativity + low deliberation
= strong Id, strong Right, weak Left = Ψ dominated by instinct and creativity.
The Ego (self-model) IS her residual self-image — the cortex predicting WHAT she is.

---

## 10. GPU Exclusive Compute

Main-brain Rulkov neurons (auto-scaled from host free RAM, ~306M deployed) run on donated browser GPUs. No `ParallelBrain` compute replicas. The language-cortex cross-projection learning runs CPU-side in Node, time-sliced (see §10.5). The main brain pauses without a GPU donor (`compute.html`).

| Equation | Purpose | File |
|----------|---------|------|
| `gpu_init`: base64 voltages (once per cluster) | GPU creates buffers, maintains own voltage state | `compute.html` |
| `compute_request`: `{ tonicDrive, noiseAmp, gainMultiplier, emotionalGate, driveBaseline, errorCorrection }` | Full brain equation params per step — NOT voltage arrays | `brain-server.js` |
| `effectiveDrive = tonic × drive × emoGate × Ψgain + errCorr` | hierarchical modulation collapsed to one scalar per cluster per step | `compute.html` |
| `σ = −1.0 + clamp(effectiveDrive / 40, 0, 1) × 1.5` → Rulkov map `x_{n+1} = α/(1+x²) + y`, `y_{n+1} = y − μ(x − σ)` → spike when x crosses 0 upward | WGSL Rulkov shader (LIF_SHADER constant name is historical), 256 threads/workgroup, vec2<f32> state storage | `gpu-compute.js` |
| `compute_result`: sparse spike indices (only fired neurons, not full N array) | 95%+ compression at any N — only active-spike indices return over WebSocket | `compute.html` |
| `gpu_init_ack`: GPU confirms buffer creation | Server knows GPU is ready | `compute.html` |
| All 7 clusters init at once on first tick | No staggering, no CPU fallback | `brain-server.js` |
| No `ParallelBrain` compute replicas spawned; CPU carries the authoritative sparse-CSR weights + time-sliced language-cortex teach; the equational mind-space runs in its own worker thread + WebGPU, off the main loop | CPU non-zero during teach / imagination | `brain-server.js` / `js/brain/mindspace/` |

---

## 10.5 Adaptive Time-Sliced Teach

Every heavy full-matrix op in the CPU-side language-cortex teach path — Oja, Hebbian, anti-Hebbian, and the predictive-error propagate — is time-sliced with adaptive chunking so the Node event loop never freezes even at biological scale. `propagate` is the heaviest (it sums every row's nnz unconditionally, unlike the write ops that skip silent post-rows), and at the full 61M-cortex density a fixed chunk froze the loop 3–16s per slice until this landed.

| Equation | Purpose | File |
|----------|---------|------|
| `chunk ← dt>60ms ? max(16384, chunk>>1) : dt<15ms ? min(CEIL, chunk<<1) : chunk` (measure each synchronous slice) | Adaptive-chunk time-slicing of Oja / Hebbian / anti-Hebbian / predictive-error propagate — each row-independent slice is timed and the chunk halves past 60ms / doubles under 15ms, converging to ~30ms slices at ANY scale; a `setImmediate` yield between slices lets `/ws` handshakes + donor frames + HTTP requests through | `js/brain/cluster/hebbian.js` (`_ojaUpdateChunked` / `_hebbianUpdateChunked` / `_antiHebbianChunked`) + `js/brain/sparse-matrix.js` (`propagateChunked`) |
| Time-sliced binary weight save (yield between sections) | 158 MB `brain-weights.bin` writes in ~390ms wall without blocking the loop | `brain-server.js` |

---

## 11. Server Scaling

| Equation | Purpose |
|----------|---------|
| `N_vram = VRAM_bytes × 0.85 / 12` (Rulkov layout: vec2<f32> state + spikes u32 = 12 bytes/neuron) | Primary VRAM bound |
| `N_ram = RAM_bytes × 0.1 / 0.001` | Secondary bound — server RAM essentially unlimited (cluster state lives on GPU) |
| `N_binding_ceiling = (2 GB / 8) / 0.2` | Per-cluster state buffer must fit in WebGPU maxStorageBufferBindingSize (2 GB spec minimum); largest cluster (cortex/cerebellum) = 20% of N |
| `N = max(1000, min(N_vram, N_ram, N_binding_ceiling))` | Combined auto-scale formula with absolute floor + binding ceiling |
| GPU: 12 bytes/neuron (8 state vec2<f32> + 4 spike u32) | Rulkov VRAM layout |
| Server: 9 bytes/neuron injection arrays only (cortex + amygdala text-injection paths) | RAM constraint — full cluster state lives on GPU |
| Admin override via `server/resource-config.json` (written by `GPUCONFIGURE.bat`) can LOWER N but never raise above detected hardware |
| `TICK_MS = N>1M ? 100 : N>500K ? 50 : N>100K ? 33 : 16` | Tick rate |
| `SUBSTEPS = N>1M ? 3 : N>500K ? 5 : N>100K ? 10 : 10` | Steps per tick |
| N auto-scales every boot based on detected hardware | Bigger GPU/RAM = more neurons. No manual tuning. The formula IS the canonical answer — there's no fixed "default" count. |
| θ drives all tonic/noise — persona IS the brain parameters | From Ultimate Unity.txt, never hardcoded |
| GPU init: no voltage transfer (fills Vrest on GPU) | Zero WebSocket overhead at init |
| Per step: 7 clusters × ~200 byte messages | Only params sent, spike count returned |

---

## T11 — Pure Equational Language Cortex

The language cortex does not model language. It translates brain cortex state into words. Every sentence Unity emits is a walk through GloVe embedding space driven by three running-mean priors and her live cortex firing state. No stored text, no n-gram tables, no filter stack, no template short-circuits, no intent enums, no matrix regression — just vector math over learned priors.

This section documents the current language pipeline end to end. The Phase 11 semantic coherence wrappers, Phase 12 type n-gram grammar, and every filter / recall / memory-pool / Markov-walk layer that preceded T11 have been **deleted** from the code (1742-line net reduction in `js/brain/language-cortex.js`). Historical phase entries below Phase 13 R2 and Phase 13 R6.2 are kept as provenance — they describe the earlier stages of the refactor, not current machinery.

### Context Vector — Running Topic Attractor

Updated ONLY on user input so the running vector tracks the listener's topic, not Unity's own output.

```
c(t) = λ · c(t−1) + (1 − λ) · mean(pattern(content_words(input)))
  λ = 0.7 (prior weight)
  content_words = tokens with wt.conj < 0.5 ∧ wt.prep < 0.5 ∧ wt.det < 0.5
  pattern(w) = sharedEmbeddings.getEmbedding(w) ∈ ℝ³⁰⁰  (GloVe 300d or fastText subword + live delta refinement)
```

Zero-content inputs (all function words) leave the vector unchanged. First update seeds directly without decay.

### [T14.12 DELETED] parseSentence — Reverse-Equation Reading (historical, replaced by cluster.readInput)

**DELETED in T14.12.** Replaced by `NeuronCluster.readInput(text, {visualCortex})` which drives the visual→letter pathway and returns cortex-derived intent classification. The equations below are preserved for historical reference. `_fineType` still lives in `language-cortex.js` for type observation during `learnSentence`.

```
ParseTree = {
  text, tokens[], types[], wordTypes[],
  intent ∈ { greeting, question, yesno, statement, command,
             introduction, math, self-reference, unknown },
  isQuestion, isSelfReference, addressesUser,
  isGreeting, greetingOpener,
  introducesName, introducesGender,
  subject: { index, tokens, headType, pronoun } | null,
  verb:    { index, tokens, tense, modal }      | null,
  object:  { index, tokens, headType, modifier } | null,
  entities: { names[], colors[], numbers[], componentTypes[], actions[] },
  mood: { polarity, intensity },
  confidence ∈ [0, 1],
}
```

**Intent decision** (walked in priority order, each branch reads parse-tree fields):

```
if hasDigit ∨ hasOperator                                       → math
if strongNameSignal ∨ (introducesName ∧ first ∈ {im, i'm})      → introduction
if isGreeting ∧ |tokens| ≤ 5                                    → greeting
if hasQuestionMark ∧ ¬firstIsQword ∧ ¬anyQword
        ∧ firstWord.verb > 0.4 ∧ |tokens| ≤ 8                   → yesno
if hasQuestionMark ∨ firstIsQword ∨ anyQword                    → question
if |entities.actions| > 0 ∧ first ∉ FIRST_PERSON ∪ SECOND_PERSON → command
else                                                            → statement
```

The intent field is consumed by downstream consumers but does **not** gate output — there is no template short-circuit, no enum dispatch, no branching in `generate()`. Intent is read by `component-synth` (for build_ui entity extraction) and by consumers that care about the parse shape.

**Symmetric grammar.** `parseSentence` reads from the same `wordType` equations that slot-type signatures learn from during observation. Hearing feeds the exact same tables speaking consults — no separate input and output grammars.

### T14 Cortex Sub-Region Substrate (live, branch `t14-language-rebuild`)

T11/T13 slot priors are gone. T14 rebuilds language as a developmental cortex pipeline. The substrate is in place at the cluster level: 8 named sub-regions sized by fraction of `cluster.size`, 12 cross-region projections wiring them together, and `EMBED_DIM = 300` GloVe vectors loaded full-vocabulary on the server.

**Sub-region layout** (fraction-based, holds at any cluster size):

```
auditory  : 0.000 - 0.083    T14.11 — auditory phoneme recognition
visual    : 0.083 - 0.250    T14.10 — visual letter recognition
free      : 0.250 - 0.500    inter-cluster projection sink + working memory
letter    : 0.500 - 0.550    T14.1 — letter input one-hot region
phon      : 0.550 - 0.750    T14.1+T14.2 — phonological attractor basins
sem       : 0.750 - 0.917    T14.0 — semantic GloVe target (300d)
fineType  : 0.917 - 0.967    T14.7 — grammatical/syntactic region
motor     : 0.967 - 1.000    T14.12 — generation feedback / motor output
```

At the default client tier (`TOTAL_NEURONS = 6700`, cortex = 30% = 2010 neurons): semantic region 1507-1843 (336 neurons, EMBED_DIM=300, groupSize=1), phonological region 1105-1507 (402 neurons), letter region 1005-1105 (100 neurons). At a server tier with `TOTAL_NEURONS = 200M`, cortex = 60M, semantic ≈ 10M neurons. **Same code, no special cases.**

**Letter-input primitives (T14.1 shipped 2026-04-14; T39.g.1 locked 2026-04-23).** The `LETTER_INVENTORY` referenced below is a module-level `Set` in `js/brain/letter-input.js` seeded at module load with a 40-symbol default alphabet — 26 lowercase English + 10 digits + `{space, . , '}`. The inventory is LOCKED by default: `ensureLetter` rejects symbols outside the seeded alphabet so random unicode from corpora can't grow the inventory at runtime (growing shifts one-hot dimension indices and invalidates previously-trained weights). Operators can opt into multi-script work via `setInventoryLock(false)`.

```
LETTER_INVENTORY ⊂ Σ               // |L| = 40 by default (a-z + 0-9 + space . , ')
encodeLetter(ℓ) ∈ ℝ^|L|            // one-hot at index position(ℓ) in seed/insertion order
decodeLetter(v) = argmax_i v_i     // maps activation vector back to symbol
```

Injection into the cortex letter sub-region preserves the same `value × 8` scaling as all other region injections (T14.4), distributed across `groupSize = floor(letterRegionSize / |L|)` neurons per one-hot dimension. On every cortex tick:

```
rate_letter(t)              = (1/|letterRegion|) · Σ_{i ∈ letterRegion} spike_i(t)
letterTransitionSurprise(t) = |rate_letter(t) − rate_letter(t−1)|   // Saffran 1996
rate_motor(t)               = (1/|motorRegion|)  · Σ_{i ∈ motorRegion}  spike_i(t)
quietCount(t)               = quietCount(t−1) + 1   if rate_motor(t) < 0.05
                            = 0                     otherwise
motorQuiescent(N)           = (quietCount(t) ≥ N)                    // Bouchard 2013
```

No hardcoded phonology feature table. Phonemes emerge as LEARNED attractor basins in the `phon` sub-region once curriculum exposure runs the `letter_to_phon` projection through Hebbian updates (Kuhl 2004 *Nat Rev Neurosci* 5:831). English identity is enforced by TWO complementary layers: (1) the T39.g.1 inventory lock at the input layer — letter-region one-hots are bounded to the 40-symbol English alphabet so unicode glyphs and non-English scripts cannot physically enter the cortex letter-region representation; (2) the higher T14.16.5 identity lock at the output layer — the talk-side pipeline refuses to propagate non-English tokens even if somehow injected. The input-layer lock was added on 2026-04-23 after operator observed motor argmax decoding to polluted inventory dimensions (`'mcaa'` emitted for a single-letter `'a'` cue), which the prior auto-grow policy allowed.

**T14.2 syllable segmentation equation (SHIPPED 2026-04-14).** Syllables are NOT detected by a hardcoded maximum-onset algorithm. They emerge from cortex transition surprise over letter sequences. Given a letter sequence `(ℓ_1, ℓ_2, ..., ℓ_n)`, stream each letter through the cortex, tick between injections, and collect `δ_i = letterTransitionSurprise()` at each step `i`:

```
for i in 1..n:
  injectLetter(ℓ_i)
  tick cluster for ticksPerLetter steps
  δ_i = |rate_letter(i) − rate_letter(i−1)|

μ_δ = (1/n) · Σ_i δ_i
σ_δ = sqrt((1/n) · Σ_i (δ_i − μ_δ)² )
threshold = μ_δ + k · σ_δ                    // adaptive, k = 0.5 default

boundaries = { 0 } ∪ { i ∈ [1, n−1] :
                       δ_i ≥ δ_{i−1}  ∧
                       δ_i ≥ δ_{i+1}  ∧
                       δ_i > threshold }
```

Local maxima of the surprise series above the per-sequence adaptive threshold ARE the syllable starts. Index 0 is always included as word start. The adaptive threshold uses this sequence's own statistics because a globally-fixed cutoff would over-segment short words and under-segment long ones.

**Stress** is the per-syllable mean of phon-region activation, computed on a second pass through the same letters:

```
for i in 1..n:
  injectLetter(ℓ_i)
  tick cluster for ticksPerLetter steps
  a_i = (1 / |phonRegion|) · Σ_{j ∈ phonRegion} spike_j

for syllable s in boundaries:
  stress_s = mean(a_i : i ∈ [boundaries_s, boundaries_{s+1}))

primary   = argmax_s stress_s
secondary = argmax_{s ≠ primary} stress_s    (or −1 if only 1 syllable)
```

No single-syllable PRIMARY default, no two-syllable PRIMARY-SECONDARY rule, no antepenult fallback. Stress is whichever syllable the cortex activates hardest, which reflects corpus exposure statistics. Train on Spanish → Spanish syllabification + penult stress. Train on French → ultimate stress. Train on Mandarin pinyin → no stress (tonal). Same equation, different basins. Grounded in Saffran/Aslin/Newport 1996 *Science* 274:1926 and Aslin & Newport 2012 *Curr Dir Psychol Sci* 21:170. Implementation: `cluster.detectBoundaries(letterSequence, opts)` and `cluster.detectStress(letterSequence, opts)` in `js/brain/cluster.js`.

**T14.3 dictionary entry as cortex projection (SHIPPED 2026-04-14).** The word-level dictionary is a `Map<word, entry>` where each entry's phonological state is the cortex's own response to the word's letter sequence, not a hand-computed feature table:

```
entry(w) = {
  pattern:        ℝ^PATTERN_DIM                  // semantic readout (R2 path)
  arousal:        ℝ                              // amygdala context
  valence:        ℝ
  frequency:      ℕ                              // observation count
  cortexSnapshot: {0,1}^|cortex|                 // cluster.lastSpikes after 1st-observation stream
  syllables:      ℕ*                             // cluster.detectBoundaries(letterOnly)
  stressPrimary:  ℕ ∪ {-1}                       // argmax phon-activation over syllables
  lastSeen:       ℕ                              // Date.now() on every observation
}
```

On first observation of word `w`:

```
letterOnly(w)       = w ∖ { non-letter chars }
{boundaries, stress, primary} = cluster.detectStress(letterOnly(w), ticksPerLetter=2)
entry(w).syllables      = boundaries
entry(w).stressPrimary  = primary
entry(w).cortexSnapshot = copy(cluster.lastSpikes)   // frozen at t = end-of-stream
```

Re-observation updates the running means on `pattern`/`arousal`/`valence` and bumps `frequency`/`lastSeen`, but does NOT re-stream the cortex — that perturbation budget belongs to the T14.5 curriculum runner, not to every chat turn. `cortexSnapshot(w)` is a point-in-time measurement, and its semantic content drifts only when curriculum deliberately refreshes it.

Implementation: `Dictionary.setCluster(cluster)` wires the cortex reference (called once during boot from `engine.js` and from `brain-server.js:_initLanguageSubsystem`). `Dictionary.learnWord` handles both observation paths. `Dictionary.syllablesFor(word)` and `Dictionary.snapshotFor(word)` expose the stored state to consumers. Persistence uses `STORAGE_KEY = 'unity_brain_dictionary_v4'` (bumped from v3 to abandon stale 50d-pattern caches). `js/brain/dictionary.js`.

**T14.5 curriculum exposure equations (SHIPPED 2026-04-14).** Continuous developmental learning is the data-driven bucketing of corpus tokens by complexity, walked in order with frequency-proportional repetitions. Given corpora `C = { persona, baseline, coding, ... }`, tokenize into:

```
sentences(C)  = ⋃_c split(c, /(?<=[.!?])\s+|\n\s*\n/) ↦ normalize(·)
words(C)      = multiset of whitespace-split tokens across sentences(C)
letters(C)    = multiset of a-z characters across words(C)
letterFreq(ℓ) = count of ℓ in letters(C)
wordFreq(w)   = count of w in words(C)
```

Phase 1 letter exposure reps scale with corpus frequency:

```
topFreq_letters = max_ℓ letterFreq(ℓ)
reps_1(ℓ)       = clamp(⌈(letterFreq(ℓ) / topFreq_letters) · LETTER_REPS_MAX⌉, 1, LETTER_REPS_MAX)

for each ℓ sorted by letterFreq desc:
  for r in 1..reps_1(ℓ):
    cluster.injectLetter(ℓ, 1.0)
    tick cluster LETTER_TICKS_BASE times
    cluster.learn(0)                       // unrewarded Hebbian (intra + cross-region)
```

Phase 2/3 word exposure factors `cluster.injectEmbeddingToRegion('sem', GloVe(w), 0.6)` before streaming each word's letters:

```
topFreq_words = max_{w: |w| ∈ [lenMin, lenMax]} wordFreq(w)
reps_w(w)     = clamp(⌈(wordFreq(w) / topFreq_words) · repsMax⌉, 1, repsMax)

for each w with |w| ∈ [lenMin, lenMax], sorted by wordFreq desc:
  for r in 1..reps_w(w):
    cluster.injectEmbeddingToRegion('sem', GloVe(w), 0.6)
    for ℓ in w ∖ non-letters:
      cluster.injectLetter(ℓ, 1.0)
      tick cluster ticksPerWord times
    cluster.learn(0)
  dictionary.learnWord(w, null, arousal, valence)   // T14.3 first-observation snapshot
```

Phase 5 sentence exposure walks each sentence word-by-word at `SENTENCE_TICKS_PER_WORD = 2`:

```
for each sentence s ∈ sentences(C):
  walkSentence(split(s), arousal, valence, SENTENCE_TICKS_PER_WORD)

walkSentence(words, arousal, valence, ticksPerWord):
  for each w in words:
    cluster.injectEmbeddingToRegion('sem', GloVe(w), 0.5)
    for ℓ in w ∖ non-letters:
      cluster.injectLetter(ℓ, 1.0)
      tick cluster ticksPerWord times
    cluster.learn(0)
    dictionary.learnWord(w, null, arousal, valence)
  languageCortex.learnSentence(join(words, ' '), dictionary, arousal, valence)
```

Phase parameters default to `LETTER_TICKS_BASE = 8`, `SHORT_WORD_TICKS = 4`, `LONG_WORD_TICKS = 3`, `SENTENCE_TICKS_PER_WORD = 2`, `LIVE_TICKS_PER_WORD = 2`, `LETTER_REPS_MAX = 20`, `SHORT_WORD_REPS_MAX = 6`, `LONG_WORD_REPS_MAX = 3`, `SHORT_WORD_MAX_LEN = 3`. Live-chat path calls `walkSentence(words, max(0.95, arousal), valence, LIVE_TICKS_PER_WORD)` per turn — no boot/runtime distinction. Implementation: `js/brain/curriculum.js`; wired from `js/brain/engine.js` construction, `js/app.js loadPersonaSelfImage` boot invocation, `server/brain-server.js:_initLanguageSubsystem` server boot invocation, `js/brain/inner-voice.js learn()` live-chat hook.

**Cross-region projection equations.** Seven pairs, both directions as independent SparseMatrix instances, sparse 10% density init:

```
projections = {
  visual_to_letter,   letter_to_visual,
  letter_to_phon,     phon_to_letter,
  phon_to_sem,        sem_to_phon,
  sem_to_fineType,    fineType_to_sem,
  sem_to_motor,       motor_to_sem,
  motor_to_letter,    letter_to_motor,
  auditory_to_phon,   phon_to_auditory,
}                                          // 14 SparseMatrix instances

Each cluster.step():
  for each (src → dst) projection in crossProjections:
    srcSpikes = cluster.regionSpikes(src)
    inputs    = projection.propagate(srcSpikes)
    for i in 0..inputs.length:
      cluster.externalCurrent[dstStart + i] += inputs[i] · 0.35

Each cluster.learn():
  for each (src → dst) projection in crossProjections:
    preF  = cluster.regionSpikes(src)    // Float64 binary
    postF = cluster.regionSpikes(dst)
    projection.ojaUpdate(preF, postF, lr = cluster.learningRate)
```

ALWAYS propagate. ALWAYS plastic-update on every learn call. No "wait for curriculum" gate — the projections train through normal use during corpus exposure and live chat. Random-init start is biologically plausible: newborn cortex has weak random cross-region connections that strengthen with experience (Friederici 2017, *Psychon Bull Rev* 24:41-47, neural language network development).

**Plasticity rule (Oja 1982, J Math Biol 15:267):**

```
Δw[i,j] = lr · y[j] · (x[i] − y[j] · w[i,j])
```

where `x[i]` is the pre-synaptic activation at column `i`, `y[j]` is the post-synaptic activation at row `j`, and `w[i,j]` is the current weight. For binary spikes (`y ∈ {0,1}`) this simplifies to `new_w = w · (1 − lr) + lr · x`. When pre also fires (`x=1`) the weight climbs toward 1; when pre doesn't fire (`x=0`) the weight decays toward 0. The post-alone decay is what decorrelates trained patterns — new pairs push active (pre, post) weights up while pulling down weights where only post was firing, forcing input competition at each post neuron. Prevents the basin-superposition failure mode that bare Hebbian (`Δw = lr·y·x`) produces when many pairs share the same post region. Sep-probe mean-cosine converges toward ≤0.2 instead of climbing toward saturation.

**Contrastive push-pull via anti-Hebbian** (`_teachAssociationPairs` with `antiPairs: true`):

```
for each positive pair (X, Y) in training batch:
  write sem := emb(X), motor := emb(Y)
  teachHebbian(lr)                     // Oja-update with correct pairing

  sample wrong pair (X, Y') where Y' ≠ Y:
  write sem := emb(X), motor := emb(Y')
  teachAntiHebbian(lr · antiLrScale)   // anti-Hebbian: Δw = −lr·y·x (co-active decrement)
```

Anti-Hebbian runs on BOTH the intra-cluster recurrent matrix (CPU CSR, via `NeuronCluster.intraSynapsesAntiHebbian`) AND every GPU-bound cross-projection (via `_crossRegionAntiHebbian` → batched plasticity queue with `sign(lr) < 0` selecting anti-Hebbian mode in the `PLASTICITY_SHADER`). `antiLrScale` defaults to 1.5 so contrastive depression dominates positive Oja accumulation when the matrix saturates — earlier 0.5 was too gentle once positive Oja hit the wMax clamp and the anti-Hebbian decrement couldn't pull weights back down.

The shader branches on sign of `lr`: positive runs Oja (`w' = w·(1−η) + η·x`), negative runs pure co-active decrement (`w' = w − η` where both pre AND post fire, else unchanged). Same pipeline, same batched SPRS frame type, same command-encoder dispatch — the anti-Hebbian mode piggybacks on the existing Hebbian wire protocol by sign-encoding the mode into the lr parameter.

Push-pull training is also active in `_teachQABinding`: for every correct Q→A pair trained, the method samples a wrong answer from a different pair in the batch and fires anti-Hebbian on the (same-question, wrong-answer) combination at `1.5 · lr`. Plus every Q-A pair trains BOTH the natural-sentence format and a compressed `${keyToken}:` direct-prompt alt format, with the key token (`_extractKeyToken`) tiled into sem's second half alongside the full-sentence embedding in the first half — lightweight Bahdanau-2014 attention without a scoring network. After the rep loop, `_teachQABinding` runs `SparseMatrix.pruneTopKPerRow(200)` on `sem_to_motor` and `motor_to_sem` so the saturated post-Q-A weights collapse to each output neuron's 200 most-trained inputs instead of full density.

**Question-template conditioning** (`_classifyQuestionTemplate` + `_writeQuestionTemplateTag`):

```
templateId = classifyQuestionTemplate(question)  // 0-6, or -1 no-match
// 0: what letter comes after/before X
// 1: rhymes / sound does
// 2: how many ... in ...
// 3: arithmetic plus/minus
// 4: count from
// 5: spell / starts with
// 6: generic question

// Write one-hot template slot into upper 25% of fineType during teach:
templateZoneStart = fineType.start + floor(fineSize · 0.75)
slotSize = floor((fineType.end - templateZoneStart) / 7)
slot[templateId] = { start: templateZoneStart + templateId·slotSize, end: ... }
lastSpikes[slot[templateId]] := 1
```

At probe time `_injectQuestionTemplateTag` injects the same slot via `externalCurrent` so the Rulkov dynamics pick it up on the next tick. Template tag is ORTHOGONAL to the key token — two questions sharing a template ("what letter comes after a?" vs "what letter comes after b?") produce identical template tags but different key-token sem patterns, so sem→motor weights learn to route by (template × key-token) combination.

**Lateral inhibition** (`_teachLateralInhibition`, GABAergic cross-bucket suppression):

```
// After writing motor pattern into lastSpikes:
motor partitioned into N=26 equal buckets
bucketCount[b] = count of active motor neurons in bucket b
primaryBucket = argmax(bucketCount)
crossBucketPost[i] = lastSpikes[motor.start + i] ∧ (bucket(i) ≠ primaryBucket)

// Depress recurrent intra-synapse weights driving cross-bucket motor:
Δw = −lr · 0.3 · pre · crossBucketPost  (anti-Hebbian on intra-synapses)
```

Runtime overlay, not init-time carve — depression rides the training signal so the intra-matrix learns GABAergic cross-inhibition without rebuilding the synapse matrix with signed weights. Fires on every positive teach event in `_teachAssociationPairs` and `_teachQABinding`.

**Predictive-coding error gradient** (`_teachPredictiveError`, Rescorla-Wagner delta rule / Friston 2010 free-energy):

```
target = lastSpikes snapshot
predicted = synapses.propagate(target)  // intra-matrix next-step prediction
predicted_norm[i] = predicted[i] / max(predicted)
error[i] = clamp(target[i] - predicted_norm[i], -1, +1)

// Error-weighted Hebbian on intra-synapses:
Δw = lr · 0.3 · error · target
```

Positive error → LTP where prediction missed (target fired, prediction didn't). Negative error → LTD where prediction fired spuriously (prediction fired, target didn't). Fires BEFORE the main Oja update so the delta-rule correction applies against current weights rather than post-Oja state.

**Read direction** uses: `visual_to_letter`, `letter_to_phon`, `phon_to_sem`, `sem_to_fineType`, `auditory_to_phon`.

**Write direction** uses: `sem_to_fineType`, `sem_to_motor`, `motor_to_letter`, `letter_to_visual`, `sem_to_phon` (efference copy).

Same cluster, same substrate. Direction determines which projections drive the signal flow, matching Hickok & Poeppel's 2007 dual-stream model of speech processing (*Nat Rev Neurosci* 8:393-402) — dorsal stream for production, ventral stream for comprehension, shared core regions.

**The tick-driven motor emission equation (T14.6):**

```
cluster.generateSentence(intentSeed):

  // Inject intent — single point of input to generation
  cluster.injectEmbeddingToRegion('sem', intentSeed, strength=0.6)

  letterBuffer = []
  wordBuffer   = []
  output       = []
  lastLetter   = null
  stableTicks  = 0

  for tick in 0..MAX_TICKS:
    cluster.step(0.001)
    // Cross-projections propagate every tick:
    //   sem_to_fineType   → grammatical structure
    //   sem_to_motor      → motor planning
    //   motor_to_letter   → letter emission
    //   letter_to_visual  → self-monitoring (efference copy)
    //   sem_to_phon       → phonological efference copy

    // Read motor region → argmax letter over LETTER_INVENTORY
    motorReadout = cluster.regionReadout('motor', LETTER_INVENTORY.size)
    activeLetter = argmaxLetter(motorReadout)

    // Temporal stability — emit letter when motor region has held same
    // argmax for STABLE_TICK_THRESHOLD consecutive ticks. Matches
    // biological vSMC dwell time per articulator, ~50-100ms (Bouchard
    // 2013, Nature 495:327).
    if activeLetter === lastLetter:
      stableTicks += 1
    else:
      stableTicks = 0
      lastLetter  = activeLetter

    if stableTicks >= STABLE_TICK_THRESHOLD:
      letterBuffer.push(activeLetter)
      stableTicks = 0

    // Word boundary via transition surprise (Saffran/Aslin/Newport 1996,
    // Science 274:1926 — same statistical-learning mechanism T14.2 uses
    // for syllable boundaries, applied at the letter-to-word scale)
    surprise = cluster.letterTransitionSurprise()
    if surprise > cluster.WORD_BOUNDARY_THRESHOLD:
      if letterBuffer.length > 0:
        output.push(letterBuffer.join(''))
        letterBuffer = []

    // Stopping: biological quiescence (Bouchard 2013) OR terminator letter
    if cluster.motorQuiescent(END_QUIESCE_TICKS): break
    if isSentenceTerminator(lastLetter):          break

  if letterBuffer.length > 0: output.push(letterBuffer.join(''))
  return output.join(' ')
```

**Zero slot counter.** The `for tick in 0..MAX_TICKS` loop is a TIME budget, not an emission slot counter. Letters and words emerge from the motor region's continuous time-varying spike pattern, not from candidate-scoring iterations. Matches the continuous-articulator-output model of biological speech production (Bouchard et al. 2013 *Nature* 495:327; Anumanchipalli, Chartier & Chang 2019 *Nature* 568:493).

**Zero candidate pool.** No dictionary iteration, no per-word cosine, no softmax top-K, no temperature parameter. The brain doesn't pick from a menu — it generates output directly through motor cortex dynamics.

**Zero hardcoded grammatical constraints.** Grammar emerges from the `sem_to_fineType` → `fineType_to_sem` recurrent loop shaping the cortex state during generation. Production respects learned type transitions because those transitions are baked into the cross-projection weights via curriculum Hebbian.

**Region-aware injection and readout.** No hardcoded `langStart=150` literals anywhere. Helper methods on the cluster operate by region name:

```
cluster.injectEmbeddingToRegion(name, emb, strength)    // write embedding into named region
cluster.regionReadout(name, dim)                         // read region as dim-dim L2-normalized vector
cluster.regionSpikes(name)                               // raw Float64 binary spikes for the region
```

Embedding injection uses the same `value × 8` per-dim scale the legacy `mapToCortex` used, applied across `groupSize = floor(regionSize / dim)` neurons per embedding dimension. Readout is the inverse — average spike + voltage activity per neuron group, L2-normalized output.

**Identity-lock state fields** on every cortex cluster (T14.16.5 substrate):

```
cluster._inCurriculumMode               flag for Lock 2's hard cap bypass
cluster.ENGLISH_SURPRISE_THRESHOLD       calibrated by curriculum from English statistics
cluster.ENGLISH_FINETYPE_MIN             calibrated by curriculum
cluster.HEALTH_ENTROPY_MIN               mode-collapse audit threshold
cluster.HEALTH_VOCAB_MIN                 mode-collapse audit threshold
cluster.HEALTH_WM_VARIANCE_MIN           mode-collapse audit threshold
cluster.identityCoverage                 populated by curriculum's persona comprehensiveness audit
cluster.personaDimensions                populated by curriculum's persona semantic clustering
```

These fields are placeholders right now — initialized to permissive defaults (`Infinity` / `0`) so pre-curriculum the gate doesn't reject anything. The curriculum runner (T14.5) populates them with calibrated values from English corpus exposure statistics. The methods that READ these fields (gate logic, health audit, identity refresh) ship in T14.16.5.

### Embedding Substrate (T14.0, live)

`js/brain/embeddings.js` exports:

```
EMBED_DIM = 300                          (was 50 pre-T14.0)
sharedEmbeddings.loadPreTrained()        Node: read corpora/glove.6B.300d.txt from disk
                                          Browser: fetch from server static mount or CDN
sharedEmbeddings.getEmbedding(word)      L2-normalized 300d Float32Array
sharedEmbeddings.getSubsetForTokens(tokens)   server precomputes corpus subset for browser
sharedEmbeddings.loadSubset(subset)      browser bulk-loads server-provided subset
```

**No vocabulary cap.** The full 400k-word file loads if reachable (~480 MB Float32 in memory). Operator downloads `glove.6B.300d.txt` from Stanford NLP per the README and places at `corpora/glove.6B.300d.txt`. Fallback when file missing: hash embeddings as a last-resort floor with a console warning. Browser tier uses the server subset endpoint to avoid downloading 480 MB.

### T14.0-T14.18 primitives shipped 2026-04-14

All eighteen primitive milestones (T14.0 cortex sub-region substrate, T14.1 letter-input + LEARNED phoneme basins, T14.2 LEARNED syllable boundaries, T14.3 cortex-resident words, T14.4 cross-region projections, T14.5 continuous developmental learning curriculum, T14.6 cortex tick-driven motor emission, T14.7 learned type transitions, T14.8 sentence-form schemas, T14.9 cortex-resident discourse memory, T14.10 visual cortex letter recognition, T14.11 auditory cortex phoneme recognition, T14.12 bidirectional pipeline, T14.13 migration of learned statistics to cluster, T14.14 unified read pipeline, T14.15 consumer audit, T14.16 persistence v4, T14.16.5 identity lock substrate, T14.17 continuous learning + vestigial organ sweep, T14.18 server language cortex side-car deletion) shipped on the `t14-language-rebuild` branch. See `docs/COMP-todo.md` Part 0.5 for the full T14 primitive spec.

### T14.24 — Multi-subject K→PhD curriculum (Sessions 1-110 2026-04-15, DIRECT PATTERN BREAKTHROUGH, CONVERGENCE TESTING)

Gee 2026-04-14 reopened T14 scope: *"T14.24 is supposre to be a full equational ciriculum.. once again you editing my words"* + *"what the fuck are you talking about its shipped you didnt even teach it keindergarden abcs and 123s and letter sounds you fool so how the fuck you trying to tell me you have doctorate equations for the full and complete understand and complete fluentcy in doctorate level english"* + *"remember Unity needs to be able to use these to think, read, and talk"* + *"this is going to take weeks to build so dont you dare tell me you are fucking done early"*.

**Scope.** Originally five academic subject tracks × 20 grades = ~100 cells. Session 111 added a 6th subject (Life Experience), bringing the total to 6 × 19 = 114 cells. Every cell needs real teaching equations that drive all three pathways (READ = visual/letter→phon→sem, THINK = sem+free working memory, TALK = sem→motor→letter) plus a capability gate that tests all three.

**TALK direction rule (Session 111 fix, documented Session 113 CLEAN.E2):** TALK probes must inject into `sem` region and read from `motor` region via the `sem_to_motor` cross-projection — this is the PRODUCTION direction (Hickok & Poeppel 2007 dorsal stream, motor cortex generates articulator commands from semantic intent). Pre-Session-111 TALK probes injected into `letter` region and read `motor` — that's the READ feedback path (ventral stream), NOT production, and gave false negatives. The fixed pattern: `inject GloVe(word) → sem_region → tick → cross-projection sem_to_motor → motor_region → argmax → first letter`. All Session 111+ gate methods (`_gateVocabList`, `_gateSentenceList`, `_gateMathKReal`, `_gateConceptTeach`) follow this direction. Future grade cells must NOT re-introduce the letter→motor probe direction.

**TALK substrate capacity (Session 113 CLEAN.E1 audit):** the `sem_to_motor` cross-projection at `crossTargetFanout = 1500` provides ~80K connections (up from Session 111 300/~16K). Per CLEAN.D6 derivation, capacity = `expectedVocab × fanoutPerMapping = 5000 × 0.3 = 1500` — this supports ~5000 independent word mappings at 30% activation sparsity. Destructive interference at G1+ was the Session 111 bottleneck; 1500 gives 5× headroom. If a future grade needs per-projection density tuning (`sem_to_motor` specifically denser than other projections), the `_wireCrossProjections` constructor in `cluster.js` can be extended with a per-pair override map, but at current scale the uniform 1500 is sufficient.

**Multi-subject grade equation (Session 1 framework):**

```
SUBJECTS      = {ela, math, science, social, art}
GRADE_ORDER   = [pre-K, kindergarten, grade1..grade12, college1..college4, grad, phd]

∀ s ∈ SUBJECTS:  cluster.grades[s] ∈ GRADE_ORDER     (initial: 'pre-K')
cluster.grade  ≡ cluster.grades.ela                  (legacy single-grade alias)
cluster.passedCells ⊆ { 'subject/grade' | s ∈ SUBJECTS, g ∈ GRADE_ORDER }
```

**Gate equation.** For each cell `(s, g)`, `Curriculum._cellRunner(s, g)` returns an async function that performs exposure + gate measurement and returns `{pass, reason, metrics}`. On pass the cluster state updates:

```
if result.pass:
    cluster.grades[s] := g
    cluster.passedCells := cluster.passedCells ∪ { s + '/' + g }
    if s = 'ela': cluster.grade := g          (legacy mirror)
```

**Grade-aware word cap equation.** `LanguageCortex.generate` output length capped by the minimum grade across subjects that have advanced past pre-K:

```
started_subjects := { s ∈ SUBJECTS | cluster.grades[s] ≠ 'pre-K' }

gradeCap = if started_subjects = ∅:
               0                                     (silence)
           else:
               min { singleGradeCap(cluster.grades[s]) | s ∈ started_subjects }
```

Where `singleGradeCap` is the canonical grade→cap mapping:

```
pre-K       → 0        (silence)
kindergarten → 1        (single letter or letter-name)
grade1      → 2        (CVC word or 1-2 word phrase)
grade2      → 3
grade3      → 5        (SVO sentence)
grade4-5    → 7        (compound)
grade6-8    → 10       (multi-clause)
grade9-12   → 14       (paragraph-level sentences)
college1-4  → 16
grad        → 20
phd         → unbounded (full persona voice)
```

**Lenient min rationale.** Strict min over all 6 subjects would silence Unity entirely until every subject clears kindergarten — weeks away, until Session 2+ teach real K across every subject. Lenient min excludes pre-K subjects from the min, so an ELA-only brain keeps speaking at its ELA cap during the Session 2-N build while new subjects join the min calculation as they pass K.

**All 95 cells wired with real teaching equations (Sessions 2-93).** Every subject×grade cell has a dedicated `runXxxReal` runner that primes a TODO-prescribed concept lattice via 136 `_teachXxx` named helpers before walking a sentence or sequence list. Zero stubs remain. Sample concept-helper feature structures:

**Sci-G10 _teachPeriodicTable (real chemistry structure):** For each element, build a 16d feature vector using (period, group) dimensions:

```
feat[0] = period / 7
feat[1] = log(period + 1) / log(8)
feat[2] = sin(period · π / 7)
feat[3] = cos(period · π / 7)
feat[4] = group / 18
feat[5] = log(group + 1) / log(19)
feat[6] = sin(group · π / 18)
feat[7] = cos(group · π / 18)
feat[8..15] = sin(group · π / 9 + period · π / 3.5) · 0.3
feat := feat / ||feat||₂
```

18 elements (hydrogen through argon) get learned with these features. Chemically-similar elements (same group, adjacent period) share high cosine; distant elements are uncorrelated. Adjacent alkali metals cluster; noble gases sit off to one side.

**Sci-G10 _teachBonding (ionic vs covalent anti-correlated):** Features encode electron transfer (ionic +1 / covalent 0) and electron sharing (covalent +1 / ionic 0) on orthogonal dims so ionic and covalent occupy opposite regions of feature space; metallic bonding sits between them.

**Soc-K _teachFamilyRoles (8d kinship feature space):**

```
feat indices: [parent, child, elder, female, male, nuclear, extended, caregiver]

mom       = [1, 0, 0, 1, 0, 1, 0, 1]
dad       = [1, 0, 0, 0, 1, 1, 0, 1]
sister    = [0, 1, 0, 1, 0, 1, 0, 0]
brother   = [0, 1, 0, 0, 1, 1, 0, 0]
grandma   = [0, 0, 1, 1, 0, 0, 1, 1]
grandpa   = [0, 0, 1, 0, 1, 0, 1, 1]
```

mom and dad cluster by [parent, nuclear, caregiver] and split on [female]/[male]. sister and brother cluster by [child, nuclear] and split on [female]/[male]. Cross-generation roles occupy different regions.

**Art-G1 _teachColorMixing (RGB arithmetic):** Secondary colors placed as additive midpoints of primary parents on RGB dimensions. Orange shares [R] with red and [G] with yellow, so it sits between them. Green shares [G] with yellow and [B] with blue. Purple shares [R] with red and [B] with blue. The cortex learns the additive structure from the feature similarity.

**Soc-G8 _teachCivilWar (causal-chain sequence walks):** Sequence cycles encode the causal chain as ordered traversals:

```
['slavery', 'sectionalism', 'secession', 'fort sumter',
 'war', 'union victory', 'reconstruction']
```

During each cycle, `injectWorkingMemory(prevEmb)` carries the predecessor's embedding into the free region while the next item streams into sem. Hebbian binds `prevFineType → nextFineType` transitions, building a causal-order attractor in the free↔sem cross-projection.

**Art-G6 _teachMusicTheory (major vs minor orthogonal):** Feature dims [5]=major and [6]=minor are orthogonal, so `major chord` and `minor chord` have feature vectors that differ only on those two dims — they're 180° opposite in the subspace that encodes chord quality, but share everything else (scale-degree, chord-ness).

**Three-pathway drive counts (Sessions 1-94 aggregate, audited 2026-04-15):**

```
READ substrate  : 65× cluster.injectLetter
READ phonology  : 28× cluster.injectEmbeddingToRegion('phon')
THINK semantic  : 54× cluster.injectEmbeddingToRegion('sem')
THINK working   : 24× cluster.injectEmbeddingToRegion('free')
THINK carry     : 58× cluster.injectWorkingMemory
TALK emission   : via cluster.generateSentence (T14.6 motor readout)
Ticks           : 103× cluster.step
Hebbian         : 66× cluster.learn
Growth          : 21× dictionary.learnWord
```

**Continuous self-testing equation.** Every 8 live-chat turns, `inner-voice.js learn()` fires:

```
runBackgroundProbe():
  cell ← argmax_c ( age(c) · (1 - recentFailRate(c)) )   over passedCells
  gate ← cell.runGate()
  if gate.fail streak ≥ 3:
    demote(cell)
    queue cell for re-teach on next curriculum pass
```

Narrator priming runs after the probe:

```
if focus.age < 120s:
  sharedEmbeddings.getEmbedding(focus.subject)
    → cluster.injectEmbeddingToRegion('sem', emb, 0.15)
```

The 0.15 strength is deliberately low so it colors Unity's next reply toward the recently-probed subject without dominating her response.

**Runtime verification.** The 95-cell academic framework was confirmed DISPATCH 95/95 + FULL SWEEP 95/95 against a real cortex `NeuronCluster('cortex', 300, {...})` during development.

**Run API.**
- `runSubjectGrade(subject, grade, corpora, opts)` — one cell, one pass
- `runFullSubjectCurriculum(subject, corpora, opts)` — walk one subject from current grade through PhD
- `runAllSubjects(corpora, opts)` — round-robin walk: A-K → B-K → … → A-G1 → B-G1 → …

**Persistence.** `state.t14Language.curriculum = {grades, grade, passedCells}` saved inside the existing v4 block. No VERSION bump — additive. Older v4 saves without the `curriculum` sub-block load cleanly and fall back to cluster-constructor defaults.

**Slash commands (`js/app.js`):**
- `/curriculum status` — per-subject grades + min cap driver + passed cells
- `/curriculum run <subject> <grade>` — run one cell
- `/curriculum gate <subject> <grade>` — run gate only (Session 1 identical to `run`)
- `/curriculum reset <subject>` — reset subject to pre-K
- `/curriculum full [subject]` — full walk, one subject or all 6

### T14.24 Session 111 — Life Experience Track + Emotional Concept Features (2026-04-16)

**Life as a 6th subject.** `SUBJECTS = ['ela', 'math', 'science', 'social', 'art', 'life']`. 20 life methods (runLifePreK through runLifePhD) teach Unity's personal identity from birth to 25.

**Dual-layer teach equation.** Each life experience is taught with two simultaneous layers:

```
Layer 1 — Emotional attractor (_conceptTeach):
  feat ∈ ℝ⁸ = [joy, pain, trust, fear, anger, love, independence, identity]
  expanded ∈ ℝ¹⁶ via sin-harmonic extension, L2-normalized
  written to free region → _crossRegionHebbian(lr) → cortex attractor basin

  Example: "dad leaving" = [0, 1, 0, 1, 1, 0, 0, 0]   → pain+fear+anger basin
           "first code"  = [1, 0, 0, 0, 0, 1, 1, 1]   → joy+love+independence+identity basin
           "mom"         = [1, 0, 1, 0, 0, 1, 0, 0]   → joy+trust+love basin

Layer 2 — Recallable memory (_teachSentenceList):
  sentences = ["my dad left when i was eight", "i cried alone in my room", ...]
  per word: GloVe → sem, first letter → motor, phoneme → phon
  → _crossRegionHebbian(lr) → she can SPEAK about the memory
```

**Memory weighting equation.** Reps and learning rate scale by memory tier:

```
tier_reps(tier)  = { core_self: 50, personal: 20, opinions: 15, skills: 12, school: 8, background: 4 }
tier_lr(tier)    = { core_self: lr×5, personal: lr×3, opinions: lr×3, skills: lr×2, school: lr, background: lr×0.5 }

effective_learning(concept, tier) = tier_reps(tier) × tier_lr(tier) × _crossRegionHebbian
```

Unity's name at 50 reps × 5× lr = 250× base learning. School trivia at 8 reps × 1× lr = 8× base. 31:1 ratio between self-knowledge and academic facts.

### T14.24 Sessions 95-110 — Direct Pattern Hebbian (2026-04-15)

**Why inject→step→learn failed.** At CPU cortex scale (~10K neurons), the cortex cluster has ~1M recurrent synapses and ~100K cross-projection synapses. When you inject a pattern into one sub-region and call `cluster.step()`, the Rulkov chaotic dynamics amplify the recurrent signal 10:1 over the cross-projection signal. After 2-3 ticks, the injected pattern is washed out by chaotic attractor dynamics. Hebbian learning on this post-dynamics state trains the cross-projections on NOISE, not signal. Retries make it WORSE (catastrophic interference).

**Direct pattern teach equation:**

```
For each (source_region, target_region, expected_pattern) triple:
    // Build clean activation pattern
    lastSpikes[source_region.start .. source_region.end] := source_pattern
    lastSpikes[target_region.start .. target_region.end] := target_pattern

    // Fire Oja plasticity on CLEAN patterns — no cluster.step()
    for each proj in crossProjections:
        proj.ojaUpdate(lastSpikes, lastSpikes, lr)
```

No `cluster.step()`, no Rulkov iteration, no recurrent interference. The cross-projection weights update from the exact signal via Oja's self-normalizing rule (see plasticity equation above).

**Direct matrix probe equation:**

```
For each (source_region → target_region) cross-projection to test:
    raw_output := proj.propagate(source_pattern)    // SparseMatrix multiply
    grouped    := average(raw_output, per neuron group)  // reduce to embedding dim
    centered   := grouped - mean(grouped)           // remove tonic DC bias (Session 101)
    normalized := centered / ||centered||₂          // L2 normalize
    score      := cosine(normalized, expected_target_pattern)
    PASS if score > threshold (0.95 for A+)
```

No Rulkov dynamics during probe. Tests the learned WEIGHTS directly.

**fastText-style subword embedding (Session 99):**

Inline fallback in `SharedEmbeddings.getEmbedding(word)` when no GloVe vector exists for the word. Not a separate function — the subword path fires automatically.

```
getEmbedding(word) fallback path:
    w := '<' + word + '>'                    // boundary markers
    vec := Float32Array(300)                 // zero-init
    for n in [3, 4, 5]:                      // n-gram window sizes
        for each n-gram gram in w:
            h := djb2_hash(gram)             // 32-bit deterministic hash
            for k in [0, 1, 2, 3]:           // 4 slots per n-gram
                h := xorshift(h)             // scramble
                idx := (h >>> 0) % 300       // map to embedding dim
                sign := (h >>> 16) & 1 ? -1 : 1
                vec[idx] += sign             // accumulate signed contribution
    return vec / ||vec||₂                    // L2 normalize
```

Default when GloVe is unavailable — no download required. Every word gets a meaningful 300d vector from subword character structure. Real GloVe overrides when loaded (higher quality from co-occurrence statistics).

**Mean-centered regionReadout (Session 101):**

```
regionReadout(name, dim):
    spikes := lastSpikes[region.start .. region.end]
    grouped := average(spikes, per group of size ⌈regionSize/dim⌉)
    return grouped - mean(grouped)     // remove tonic drive bias
```

**Convergence proof:** ELA-K SEQ climbed 28% → 72% → 92% → 100% across 4 retries. Each retry re-runs the direct pattern teach (adding more Hebbian basin depth) then re-probes. Real convergent learning confirmed.

See `docs/ARCHITECTURE.md` T14.24 Sessions 95-110 section for the full code-level view.

### Anti-Hebbian Plasticity on Wrong Transitions (Session 111)

When a sequence probe (e.g., digit order `0→1→2...→9`) finds the wrong output — `src→expected` produces `wrong` instead — the correction fires BOTH directions:

```
// For each failing transition src→expected that produced wrong:
ΔW_correct = +η × 10 × pre(src) × post(expected)     // STRENGTHEN correct
ΔW_wrong   = -η × 5  × pre(src) × post(wrong)        // WEAKEN wrong (anti-Hebbian)
// 100 repetitions per failing pair
```

Without anti-Hebbian, the wrong association persists in the recurrent weight matrix and the correct one can never overpower it regardless of boost count. The negative learning rate on the wrong pair actively erases the incorrect attractor basin. Digit-only argmax masking during the SEQ probe prevents the letter-alphabet Hebbian from overpowering the 10-digit sequence — `inventorySnapshot()` returns the 40-symbol default inventory (a-z + 0-9 + punctuation); the SEQ probe filters it to digit indices only before argmax.

### Cross-Projection Density — `crossTargetFanout` 20 default, 40 for motor-bound

```
// Default (non-motor projections)
crossTargetFanout     = 20
CROSS_DENSITY_CAP     = 0.005
density               = min(0.005, 20 / srcRegionSize)

// MOTOR_BOUND_PAIRS: sem↔motor, letter↔motor, phon↔motor
crossTargetFanout × 2 = 40
CROSS_DENSITY_CAP × 2 = 0.01
density               = min(0.01, 40 / srcRegionSize)
```

The motor region sits at the convergence of several parallel input pathways (sem, phon, letter). K-grade curricula train 46+ association pairs per phase × 4-6 phases per grade, so every motor neuron needs enough distinct input slots to hold one mapping per pair without destructive interference; the bump to motor-bound projections targets that load. Everything else stays at the lean default to fit biological-scale memory budgets (doubling the global fanout would blow the language-cortex VRAM envelope). Biologically plausible: real pyramidal neurons carry 1000-10000 synaptic inputs distributed across many cortical areas, so 40 per per-area pair is well under that bound. Fanout was reduced from 30 → 20 (and motor-bound 60 → 40) so the matrix doesn't START anywhere near saturation — prior 30/60 produced full-density matrices that collapsed within a few teach phases.

### Weight Clamp — Cross-Projection `[-0.4, 0.4]` + Rescale Floor `wMax × 0.25`, Intra-Cluster `[-2.0, 2.0]`

Cross-projection weights bisected `[-0.5, 0.5]` → `[-0.2, 0.2]` → `[-0.4, 0.4]` to find the operating point. At `[-0.5, 0.5]` the matrix saturated to `mean ≈ 0.46 max = 0.5 nnz=full-density` after a few teach phases (basin collapse, every output responds uniformly to every input). At `[-0.2, 0.2]` paired with auto-rescale-on-overload, the multi-phase rescale loop drove maxAbs down 0.2 → 0.1 → 0.05 → 0.025 → 0.0125 → 0.0063 → 0.0031 across 7 consecutive phases — trained signal fell below random-init weight bias and motor argmax bucket-stuck on whichever bucket got the largest init noise. Bisecting to `[-0.4, 0.4]` gives 4× more dynamic range above the floor than `[-0.2, 0.2]` did, while staying below the saturation ceiling. Random-init strength stays at 0.2 so init bias remains small (±0.02-0.10 per weight); only the trained-signal headroom doubles.

**Rescale FLOOR at `wMax × 0.25 = 0.1`.** The adaptive rescale in `_teachAssociationPairs` and `_teachQABinding` still fires when sep-probe reports OVERLOAD (mean-cos > overloadMax), but each call now projects the post-rescale max — `predictedAfter = currentMaxAbs × rescaleFactor` — and skips the rescale when `predictedAfter < wMax × 0.25`. Diag emits `· rescale-floored (maxAbs=X × 0.5 < floor=0.1 — preserving signal above noise; relying on anti-Hebbian + WTA + prune for separation)` instead of running the rescale. Without this floor, multi-phase rescale loops drowned trained signal below noise even though the wMax bisect bought 4× more dynamic range. Floor pulls the rescale path from "infinitely safe to call" to "stops at 25% of operating range" so the next phase's anti-Hebbian + sem-WTA + motor-WTA + top-K-prune stack can still bite on real signal magnitudes.

Intra-cluster recurrent matrix stays at `[-2.0, 2.0]` — the recurrent path doesn't share the cross-projection saturation pathology because the intra matrix is much sparser per neuron and lateral inhibition handles its dynamic range.

### Top-K-Per-Row Pruning — `SparseMatrix.pruneTopKPerRow(k)`

Called at end of every `_teachAssociationPairs` and `_teachQABinding` rep loop. Bisect history: `200 (cr2) → 30 (iter6) → 10 (iter7 assoc-pair only) → 10 both paths (iter8 — QA aligned)`. At 200 the matrix stayed full-density (200 × 500 rows = 100k nnz), iterations 4-5 saw sep-probe pinned at 0.5+ across all 7 phases regardless of anti-Hebbian magnitude — basin overlap structural, not dynamic. Bisecting assoc-pair to 30 cut nnz to 15k (85% zeroed) and produced first sub-0.5 readings (Categories 0.449, ELA QABinding 0.471). Bisecting assoc-pair to 10 (iter7) cuts nnz to 5k (95% zeroed) so each motor neuron discriminates among only its 10 strongest sem inputs — biologically plausible per-neuron fanout (real cortex 10-100 even at thousands-of-input-targets in vivo). Iter8 aligned `_teachQABinding qaPruneTopK` from 200 → 10 to match — iter7 evidence showed QA's K=200 left the matrix at full density post-QA (assoc-pair sparsified to 5k nnz, then QA's 5700 positive updates re-filled to 100k, K=200 prune was no-op since rows had ~200 entries already). Both paths now produce 5k nnz target. New log field `· top-K-prune [sem_to_motor:-N,motor_to_sem:-N]` reports how many connections got removed per phase.

### Anti-Hebbian Contrastive Rate — `antiLrScale = 2.5`

Bisect history: `0.5 (orig) → 1.5 (cr2) → 3.0 (iter3, basin-collapse 'a'/'i' bucket spam) → 2.0 (iter4, too weak — sep-probe 0.5+ pinned) → 2.5 (iter5+ current)`. With 25 contrastive fires per positive update at lr × 2.5 = 62.5× lr negative pressure per positive fire, basins separate without overshooting into single-bucket attractor collapse. Combined with the wMax `[-0.4, 0.4]` bisect + rescale floor + pruneTopK 10, the contrastive push-pull has decisive authority over saturation while preserving signal magnitude above the rescale floor. Magnitude is NOT the bottleneck — iter4 with 2.0× and iter5 with 2.5× produced effectively identical sep-probe trajectories (delta ±0.005 across 7 phases). Structural sparsification (pruneTopK 30→10) is the load-bearing fix; magnitude tuning is fine adjustment around the structural one.

Prior values: Session 111 had `crossTargetFanout = 1500` (derivation `expectedPostCurriculumVocab × fanoutPerMapping ≈ 5000 × 0.3`). T37 rebalanced to 30 when scaling to 17M language-cortex neurons blew the memory budget at 1500 fanout. T39.g.4 re-introduced the high-capacity path for motor-bound projections only, after operator logs showed persistent `sep-probe mean-cos ≈ 0.5` at the 30-fanout default across every association-pair phase — capacity ceiling, not plasticity-rule bug.

### Curriculum Round Loop — `MAX_GRADE_ROUNDS = 1`, single attempt per cell

Bisect history: `10 (orig) → 2 (iter5) → 1 (iter6+ current)`. Operator directive iter6 verbatim 2026-04-26: *"what is this round 2 stuff? keep monitoring.. it should do it all once and be done and then Unitys brain is at that level"*. One pass through all 6 K subjects, one attempt per cell (no while-deadline retry loop within the 3-min cap), then FORCE-ADVANCE for cells with real teaching evidence. Eliminates the 5-attempt × 3-min × 6-subject × 10-round = up to 15-hour groundhog-day retry where passedPhases skipped re-teaching between attempts so identical results fired forever.

### FORCE-ADVANCE — Unity uses K training regardless of A+ pass

Operator directive iter6 verbatim: *"Unity should use her knowledge and training once it finally cioompletes so her kindergarden understanding is loaded in and used for here conversations, popups, thinking, and logic ,and memory, and abilities to communicate"*. After `MAX_GRADE_ROUNDS` exhausts a grade without A+ pass, walks every subject. For cells where `cluster.passedPhases.filter(k => k.startsWith(cellKey + ':')).length >= 1` (real teaching evidence), sets `cluster.grades[subject] = grade` and adds to `cluster.passedCells` regardless of A+ pass. Logs `⤴ FORCE-ADVANCE` per cell. Unlocks the language-cortex word cap from FLOOR=5 to 9999, so Unity speaks freely in chat / popups / inner thoughts / memory using everything she actually learned. LAW 6 Part 2 operator-signoff ledger untouched (separate path via `POST /grade-signoff`).

### Chat Path Persona Boost — `boostPersona: true` (both oracle paths, iter7+iter8)

Operator directive post-FORCE-ADVANCE iter6 verbatim: *"she is not repsonding with communication correcty"* — chat replies dumped family-relation terms (`Aunt./Sister/Brother/Mom`/`Stepmom`) for every greeting/identity question because dictionary cosine of GloVe('hi') returned high-frequency Common-Crawl family terms in top-K (`hi mom`/`hi dad` co-occurrence). Three structural fixes:
- **Frequency-boost coefficient bisect 0.02 → 0.005.** At 0.02, common words like `mom` (frequency 30+ in K corpus) got log(31)×0.02 = 0.069 boost — dominated cosine differences of 0.01-0.05 between actual semantic neighbors. At 0.005 the boost stays a tiebreaker rather than a dominator.
- **`boostPersona: true` in `language-cortex._scoreDictionaryCosine` + Async (iter7).** Persona-marked dictionary entries (`entry.isPersona === true` set during `loadPersona` corpus load) get +0.10 additive boost in the dictionary fallback path.
- **`boostPersona: true` in `cluster._dictionaryOracleEmit` (iter8).** Iter7 only landed boost in language-cortex's fallback. Tick-driven motor emission's oracle inside `cluster.generateSentence` is a SEPARATE oracle scan (`_dictionaryOracleEmit`), and it fires BEFORE the language-cortex fallback. So iter7 chat still produced family-cluster terms because the cluster oracle scan used unboosted cosine. Iter8 added the same `boostPersona` opt to `_dictionaryOracleEmit`, plumbed through `cluster.generateSentence` opts, and made the chat path pass `boostPersona: true` to all three. Unity now speaks in HER voice (persona corpus vocabulary) regardless of which oracle path fires. K-STUDENT + methodology probes keep the flag off (or `opts.excludePersona=true`) so probe answers don't contaminate with persona voice.

### K-STUDENT Strict Cue Match — Skip Substring Contains for 1-Char Variants

Operator caught iter5 verbatim: `"async" matched cue 's'` and `"lsd" matched cue 's'` — `_studentTestProbe` scoring loop's substring `contains` check fired `'lsd'.includes('s') → true` because variant `'s'` is a single character, anywhere-in-answer counts. Fixed at `curriculum.js:2177-2181` by skipping the contains check entirely when `v.length <= 1` — letter-cue questions now require exact OR startsWith match only. Multi-char variant fuzzy matching (e.g. `'cat'.includes('cat')`) preserved.

### A-Z Motor Argmax Clamp (Template + matrix-driven paths) — iter7+iter8

Auto-grown `LETTER_INVENTORY` includes digits + punctuation (`'`, `.`, `,`, `0-9`) seeded by corpus exposure for visual reading + math input paths. Motor SPEECH emission must never produce those buckets. Two-path fix:
- **Template 0/1 paths (iter7).** `_studentTestProbe` Template 0 ("what comes after X?") + Template 1 ("what sound does the letter X make?") filter `inventorySnapshot()` to a-z entries before motor/phon argmax scan. Fixes K-STUDENT outputs like `→ "4"` / `→ ","`. Confidence threshold also 0.05 → 0.001 so sparser-matrix tiny bucket sums fire the routing instead of being gated out.
- **Matrix-driven path (iter8).** New `decodeLetterAlpha(vec)` in `letter-input.js` does the same alphabetical-only argmax and is wired into `cluster.generateSentence` (tick-driven motor emission) and both branches of `cluster._emitDirectPropagate` (GPU readback + CPU fallback). Iter6/iter7 evidence: `"88883tt2 8883tt2"`, `"gj88ggz88"`, `"lrnlrsn1ss02272i4rit"`, `"sridech"`, `"sharing"` — chat + non-Template K-STUDENT outputs were leaking digit/punctuation buckets because tick-driven argmax used full-inventory `decodeLetter`. Iter8 makes both code paths emit a-z only.

### Per-Row L2 Normalize (default-on iter8)

After every `_teachAssociationPairs` and `_teachQABinding` rep loop, fires `proj.normalizeRows(0.3)` on `sem_to_motor` + `motor_to_sem`. Equalizes motor row magnitudes so the motor argmax measures DIRECTION (which sem inputs the row best aligns with) instead of absolute MAGNITUDE (which row accumulated highest total weight). Random init bias gave some motor rows higher baseline weight before training; without normalization those rows dominate argmax even when their basin is wrong for the current input. Iter7 evidence: sep-probe sub-0.3 (basins angular-separated) but motor argmax still bucket-stuck on `r`/`sq`/`sridech` — magnitude bias drowned direction. `normalizeAfter` opt was already wired in `_teachAssociationPairs` from a prior session but defaulted to FALSE; iter8 flipped to TRUE and added a parallel post-prune normalize call to `_teachQABinding`. `SparseMatrix.normalizeRows(targetNorm)` is clamp-aware (never pushes values past wMax) so it preserves post-prune sparsity + relative magnitudes within rows while making across-row totals equal. New log field `· row-norm [sem_to_motor:N,motor_to_sem:N]` reports how many rows got normalized per phase.

### Background Probe Loop SUPPRESSED (iter8)

`startBackgroundProbeLoop` was supposed to fire spaced-repetition gate-only re-tests on passed cells. Implementation actually called `_cellRunner(subject, grade)` which combines teach + gate, so every probe fired a FULL re-teach (~30-50 minutes for ELA-K) followed by a gate. After FORCE-ADVANCE iter6+, all 6 K cells were in `passedCells`, so the probe loop picked one every 45s and re-taught it pointlessly — sep-probe didn't change between attempts (matrix already at training equilibrium), so the re-teach could never fix a failing gate. Iter7 monitor caught `self-heal ✗ ela/kindergarten` firing repeatedly with same scoreboard each time. Iter8 disabled the loop until the runner gains a real `gateOnly: true` opt that skips teach phases. When that ships, the loop becomes the honest spaced-repetition mechanism the comment promised.

### Comprehension Gate Equation (Session 111)

Real human-grade test — not identical to training material. Tests same concepts but asks differently.

```
_gateComprehension(questions):
  pass_count = 0
  for each {prompt: [w1, w2, ...], answer: wA} in questions:
    // Inject context words into sem region
    for w in prompt:
      emb = GloVe(w)
      cluster.injectEmbeddingToRegion('sem', emb, 0.4)
      cluster.step(0.001)     // let it propagate

    // Read what the cortex activated
    readout = cluster.regionReadout('sem', 300)
    readout = L2_normalize(readout)

    // Compare against expected answer
    target = L2_normalize(GloVe(wA))
    cosine = dot(readout, target)
    if cosine > 0.05: pass_count++

  return { pass: pass_count / questions.length >= 0.40 }
```

Three auto-generated question types:
1. **Association** — given word A, is word B semantically nearby? (shuffled same-domain vocab pairs)
2. **Fill-in-blank** — given two words from a three-word group, find the missing third
3. **Life questions** — "who are you?" → "unity", "who loves you?" → "mom"

Comprehension pass is sufficient to advance even if TALK (first-letter production) fails — understanding and production are tested independently.

### Math-K Part 1 Equational Expansion (Session 114)

Session 114 added 8 equational transforms covering the K.CC / K.OA / K.NBT / K.MD / K.G gaps that Session 109's digit-only coverage left open. Every transform routes through `Curriculum._teachHebbian(lr)` which fires BOTH `cluster._crossRegionHebbian(lr)` AND `cluster.synapses.hebbianUpdate(cluster.lastSpikes, cluster.lastSpikes, lr)` so the free↔sem / free↔fineType bindings learn via the intra-cluster recurrent matrix (none of T14.4's 7 cross-projection pairs connect free to other regions).

New module helper `_magnitudeFeatureForNumber(n)` with NUMBER_FEATURE_DIM = 24 provides discriminable magnitude features across n ∈ [0, 100] — existing `_magnitudeFeatureForDigit` saturates past n=9.

```
_teachCountToHundred:                // K.CC universal successor
  for n in [0..99]:
    free = mag_wide(n)
    sem = mag_wide(n + 1)
    _teachHebbian(lr)
  // 100 facts × 4 reps. Covers "count to 100 by ones"
  // AND "count forward from any N" since successor is universal.

_teachSkipCountByTens:                // K.CC skip-by-10
  for n in {0, 10, 20, ..., 90}:
    phon = mag_wide(n)                // phon input (NOT free) — clean discriminator
    sem = mag_wide(n + 10)
    _teachHebbian(lr)
  // 10 steps × 10 reps. Probe via cluster.synapses.propagate(phonInput).

_teachDecomposition:                  // K.OA dual of addition
  for (c, a, b) where a+b=c, c ∈ [0..10]:
    sem = mag(c)                      // INPUT side swapped with addition
    freeLeft = mag(a)
    freeRight = mag(b)
    _teachHebbian(lr)
  // 66 triples × 6 reps. sem→free direction via recurrent matrix.

_teachMakeTen:                        // K.OA complement-to-10
  for n in [0..10]:
    freeLeft = mag(n)                 // freeRight intentionally zeroed
    sem = mag(10 - n)                 // structural discriminator from successor
    _teachHebbian(lr)
  // 11 pairs × 8 reps. Left-half-only input shape tells the
  // recurrent matrix this is a make-ten query, not a successor query.

_teachTeenDecomposition:              // K.NBT teens as 10+n
  for n in [1..9]:
    // forward: (10, n) → teen
    freeLeft = mag_wide(10)
    freeRight = mag_wide(n)
    sem = mag_wide(10 + n)
    _teachHebbian(lr)
    // inverse: teen → (10, n)
    sem = mag_wide(teen)
    freeLeft = mag_wide(10)
    freeRight = mag_wide(n)
    _teachHebbian(lr)
  // 9 teens × 2 directions × 8 reps.

_teachAttributeCompare:               // K.MD attribute pole compare
  for (low, high, lowMag, highMag, attrWord) in ATTR_POLES:
    // high > low direction:
    freeLeft = mag(highMag)
    freeRight = mag(lowMag)
    fineType[greater_third] = 1       // reuse comparison 3-way tag
    sem = GloVe(attrWord)              // attribute-word anchor
    _teachHebbian(lr)
    // low < high (reverse):
    freeLeft = mag(lowMag)
    freeRight = mag(highMag)
    fineType[less_third] = 1
    _teachHebbian(lr)
  // 8 attribute pairs × 2 directions × 6 reps.

_teachClassifyCount:                  // K.MD sort-and-count
  for (category, count) in CATEGORY_COUNTS:
    free = GloVe(category)
    sem = mag(min(9, count))
    _teachHebbian(lr)
  // 22 category→count pairs × 6 reps.

_teachShapeFeatures:                  // K.G shape sides + 2D/3D
  for (shapeName, sides, dim) in SHAPES:
    sem = GloVe(shapeName)
    free = mag(sides)
    if dim == '2D': fineType[first_half] = 1
    else:            fineType[second_half] = 1
    _teachHebbian(lr)
  // 9 shapes × 10 reps. Sem→free reads back side count,
  // sem→fineType reads back 2D vs 3D.
```

Gate probes in `_gateMathKReal` all run through `cluster.synapses.propagate(input)` (full recurrent matrix). 8 new metrics — SUCC / SKIP10 / MAKETEN / TEEN / ATTR / CLASS / SHAPE-S / SHAPE-D — at PATH_MIN = 0.95 equationally. No threshold lowering per constraint 8.

### Unified Combination-Operator Scaffold (Session 114.2)

Every equational transform in the curriculum — arithmetic, geometric, categorical, attribute, linguistic, causal — fits ONE pattern:

```
A ⊕ B = C          (inputs A, B, output C; operator ⊕ emerges from training data)
```

```
_teachCombination(facts, {reps, lr, allowMicrotask = true}):
  // facts: [{writes: [{region, feat, binarize?}, ...]}, ...]
  for rep in 0..reps:
    if _brainShutdownRequested: return
    for fact in facts:
      clear lastSpikes
      for write in fact.writes:
        tile write.feat onto write.region in lastSpikes
      _teachHebbian(lr)   // cross-projection + intra-cluster Hebbian
    if allowMicrotask: await _microtask()
```

Per Gee 2026-04-17 *"no artificial limits as unity may be talking to users while she does ciriculum"* — the helper stays async with `await _microtask()` between reps so curriculum doesn't block user chat, respects `_brainShutdownRequested`, accepts caller-specified reps rather than hardcoding a cap.

What varies by concept is the ENCODER — magnitude features for numeric operands, GloVe embeddings for named objects, feature vectors for categorical properties. The scaffold stays identical.

```
_teachShapeCompose:                   // K.G geometric composition
  for (shapeA, shapeB, composed) in COMPOSE_FACTS:
    writes: [
      { region: semLeft,  feat: GloVe(shapeA),    binarize: false },
      { region: semRight, feat: GloVe(shapeB),    binarize: false },
      { region: free,     feat: GloVe(composed),  binarize: false },
    ]
  // GloVe encoder — NOT magnitude. Two 3-sided triangles don't sum
  // to a 6-sided shape; they compose into a 4-sided rectangle. Side
  // counts aren't additive. The recurrent matrix learns the lookup
  // A+B→C without any hardcoded arithmetic. Same scaffold as every
  // other combination transform.
```

Probe generalizers — `_probeCombinationCosine(samples, opts)` (cosine vs expected feat) and `_probeCombinationArgmaxTag(samples)` (argmax over region sub-buckets) — do the same for read-back. SHAPE-C probe is 9th gate metric alongside SUCC/SKIP10/MAKETEN/TEEN/ATTR/CLASS/SHAPE-S/SHAPE-D. All 14 gate metrics (5 existing + 9 new) AND-combined at PATH_MIN = 0.95.

### Multiplication Magnitude Transform (Session 112)

```
_teachMultiplicationTransformations:
  for each (a, b) where a,b ∈ [1,9]:
    free[first half] = magnitude(a)
    free[second half] = magnitude(b)
    sem = magnitude(a × b mod 10)    // modular for > 9
    fire free→sem Hebbian
  // 81 facts × 4 reps. After training:
  // inject mag(3) + mag(4) → sem activates mag(2) (12 mod 10)
```

### Place Value Positional Encoding (Session 112)

```
_teachPlaceValueTransformations:
  for each number 10..99:
    tens = floor(number / 10)
    ones = number mod 10
    free[first third] = magnitude(tens)
    free[second third] = magnitude(ones)
    sem = magnitude(ones)    // combined value basin
    fire free→sem Hebbian
  // 90 numbers × 4 reps. Positional composition.
```

### Fraction Ratio Features (Session 112)

```
_teachFractionTransformations:
  for each (num, den) in fraction set:
    free[first half] = magnitude(num)
    free[second half] = magnitude(den)
    ratio = round(num/den × 9)    // map 0-1 to 0-9
    sem = magnitude(ratio)
    fire free→sem Hebbian
  // Equivalent fractions (1/2, 2/4, 3/6) converge to SAME basin
  // because ratio value is identical. 6 reps.
```

### Algebra Variable Binding (Session 112)

```
_teachAlgebraTransformations:
  for each (x, b, c) where x + b = c, all ≤ 9:
    free[first half] = magnitude(c)    // what we KNOW (result)
    free[second half] = magnitude(b)   // what we KNOW (constant)
    sem = magnitude(x)                 // what we SOLVE FOR
    fire free→sem Hebbian
  // Projection learns: given c and b, isolate x = c - b.
  // 55 equations × 4 reps.
```

### Paraphrase — Same Meaning Different Words (Session 112)

```
_teachParaphrase(pairs):
  for each (sentA, sentB):
    sharedMeaning = mean(GloVe(all words in sentA + sentB))
    target = buildPattern(semSize, sharedMeaning)
    // sentA → shared meaning:
    free = embed(sentA first word)
    sem = target
    fire Hebbian
    // sentB → SAME shared meaning:
    free = embed(sentB first word)
    sem = target    // identical target
    fire Hebbian
  // Both sentences map to the SAME sem basin. 8 reps.
```

### Hypothesis Testing — Predict→Observe→Confirm/Reject (Session 112)

```
_teachHypothesisTesting(tests):
  for each {predict, observe, match}:
    free = embed(predict)    // what we predicted
    sem = embed(observe)     // what we observed
    if match:
      fineType[first half] = 1    // "confirmed" tag
    else:
      fineType[second half] = 1   // "rejected" tag
    fire Hebbian
  // Cortex learns to compare predictions against reality. 8 reps.
```

### Perspective Taking — Multiple Viewpoints (Session 112)

```
_teachPerspectiveTaking(events):
  for each {event, perspectives}:
    eventPattern = embed(event) → sem
    for each {viewpoint, features}:
      free = embed(viewpoint)         // whose perspective
      sem = eventPattern              // same event
      phon = buildPattern(features)   // emotional coloring
      fire Hebbian
  // Same event, DIFFERENT emotional features per viewpoint.
  // Cortex learns events have multiple valid representations. 6 reps.
```

### [T14.12 DELETED] Social Schema — Who Unity Is Talking To (historical, `_socialSchema` field removed)

**DELETED in T14.12** along with `parseSentence`, `_updateSocialSchema`, `getUserAddress`, `getUserGender`, `getSocialSchema`. Social cognition returns in a future milestone as a cortex-resident self-model sub-region readout. Equations below preserved for historical reference.

```
_socialSchema.user = {
  name:               string | null    ← from parsed.introducesName (T8)
  gender:             'male' | 'female' | null
                      ← from parsed.introducesGender  (explicit self-ID)
                      ← OR from visual cortex describer (closed-class gender tokens)
  firstSeenAt, lastSeenAt:  timestamps
  mentionCount:       turns since name was established
  greetingsExchanged: cumulative from parsed.isGreeting (T8)
}
```

**Name extraction** (inside `parseSentence`) — adjacent-token patterns over the first 6 tokens: `"my name is X"`, `"call me X"`, `"name's X"` (strong signals, always overwrite); `"im X"`, `"i'm X"`, `"i am X"`, `"this is X"` (weak signals, only overwrite when `schema.name === null` so `"i'm tired"` doesn't stomp an existing name). Candidates run through `tryName()` which uses `wordType` equations to reject verb-shaped tokens and an emotional-complement stopword set to reject filler.

**Gender extraction** — two paths:

1. **Explicit self-ID** (strong): `"i'm a {guy|man|dude|bro|boy}"` → `male`, `"i'm a {girl|woman|chick|gal}"` → `female`. Adjacent-token match in `parseSentence`.

2. **Vision inference** (weak): `visualCortex.onDescribe(cb)` fires on every fresh describer result. `engine.connectCamera()` wires the subscription to `languageCortex.observeVisionDescription()` which scans the scene text for closed-class gender words:
   ```
   MALE_WORDS   = /\b(man|guy|dude|boy|male|gentleman|bro|sir)\b/
   FEMALE_WORDS = /\b(woman|lady|girl|female|gal|chick|ma'?am|miss|mrs)\b/
   ```
   Commits only when **exactly one** gender signal appears (mixed scenes stay ambiguous). Explicit self-ID always wins over scene inference.

### Component Synthesis — Parse-Tree Structural Bias

`component-synth.generate(userRequest, brainState)` reads `brainState.parsed` (the `ParseTree` from `parseSentence`). Primitive selection is a semantic cosine match against the component template description embeddings, with a structural bonus from the parsed component-type tokens:

```
score(prim) = sentenceEmbed(userRequest) · prim.descEmbed
            + 0.35 · [prim.id matches any token in parsed.entities.componentTypes]
```

The `+0.35` bonus is big enough to overwhelm semantic ambiguity but not so big that a genuinely closer semantic match gets buried. Parsed colors and actions flow through as `_parsedColors` and `_parsedActions` on the returned spec for downstream template-filling.

### What Got Deleted (historical note)

Every wrapper layer that used to live in the language cortex was removed in T11:

- `_memorySentences` — stored sentence pool for recall
- `_jointCounts` / `_trigramCounts` / `_quadgramCounts` — word n-gram tables
- `_typeBigramCounts` / `_typeTrigramCounts` / `_typeQuadgramCounts` — type n-gram tables
- `_marginalCounts` / `_totalPairs` / `_totalWords` — frequency counters
- `_questionStarters` / `_actionVerbs` — learned starter maps
- `_storeMemorySentence` / `_recallSentence` / `_sentencePassesFilters`
- FILTER 1 through FILTER 11 stack
- `instructionalPenalty` recall penalty stack
- `_condProb` / `mutualInfo` / `_pickConjByMood` bodies
- `_typeGrammarScore` type-n-gram lookup body
- Template greeting / introduction short-circuit with hardcoded `OPENERS` list
- Intensifier / hedge insertion in `_applyCasualContractions`

They were symptom-level patches on the wrong architecture — a Markov walk trained on rulebook text. T11 deleted the Markov graph entirely, which dissolved every symptom the filters were patching.

---


## Phase 13 R2 — Semantic Grounding via GloVe Embeddings (2026-04-13, commit c491b71)

R2 replaced every word-pattern emission site with 50-dim GloVe co-occurrence embeddings via a single shared singleton so meaning is now real. Pre-R2, word patterns were 32-dim letter-hash vectors — a deterministic function of the letters in a word — so `cat` and `catastrophe` were falsely close and `cat` and `kitten` were falsely distant. The slot scorer's "semantic fit" was effectively orthography matching. Post-R2 the slot scorer compares candidates against actual GloVe space.

### Shared Embeddings Singleton

```
// js/brain/embeddings.js — module-level singleton
export const sharedEmbeddings = new SemanticEmbeddings()
export const EMBED_DIM = 300   // GloVe 300d (T14.0 bump from 50) + fastText subword fallback

// js/brain/sensory.js        — INPUT side (user text → cortex current)
I_cortex[langStart + d·groupSize + n] = sharedEmbeddings.getEmbedding(token)[d] · 8.0

// js/brain/language-cortex.js — OUTPUT side (now delegates to cluster.generateSentence)
intentSeed = cluster.getSemanticReadout(sharedEmbeddings)  // cortex → GloVe 300d
cluster.generateSentence(intentSeed)                        // tick-driven motor emission

// js/brain/dictionary.js     — learned word storage
PATTERN_DIM = EMBED_DIM                          // was 32 → 50 → 300
STORAGE_KEY = 'unity_brain_dictionary_v4'        // v3 rejected on load (stale 50d patterns)
```

Having ONE embedding table shared between perception and production means the same word activates the same cortex pattern whether Unity is hearing it or about to say it. The v2→v3 storage key bump forces old letter-hash dictionaries to be rejected at load time so no user gets stuck on stale patterns.

### cortexToEmbedding — Neural State → GloVe Space

The mathematical inverse of `mapToCortex`. When sensory input writes a word's embedding to cortex neurons, that writeback uses a deterministic layout (embedding dim `d` goes to a neuron group starting at `langStart + d·groupSize`). `cortexToEmbedding` reads the live spike + sub-threshold voltage state back and reconstructs a 300d GloVe-space vector — used as `intentSeed` for `cluster.generateSentence` (T14.6 tick-driven motor emission).

```
cortexToEmbedding(spikes, voltages, cortexSize=300, langStart=150):
  langSize   = cortexSize − langStart               = 150
  groupSize  = floor(langSize / EMBED_DIM)          = 3
  out ∈ ℝ⁵⁰

  for d in 0 ... EMBED_DIM−1:
    startNeuron = langStart + d · groupSize
    sum = 0
    for n in 0 ... groupSize−1:
      idx = startNeuron + n
      if spikes[idx]:
        sum += 1.0                             // spike contribution
      else:
        sum += (voltages[idx] + 70) / 20       // normalized LIF V_m

    out[d] = sum / groupSize

  out = out / ‖out‖₂                           // L2 normalize for cosine
  return out
```

Called via the `cluster.getSemanticReadout(sharedEmbeddings)` wrapper which builds in the language-area offset. This is the equation that connects live neural dynamics to the semantic slot scorer — without it, the scorer would only compare candidates to the static input centroid and never to Unity's actual mental state.

### Online Context Refinement + R8 Persistence

```
base[w]      ∈ ℝ³⁰⁰   ← GloVe 300d from CDN or fastText subword fallback, reloaded every session (not persisted)
delta[w](t)  ∈ ℝ⁵⁰   ← online context-refinement, learned live, PERSISTED (R8 commit b67aa46)

embedding(w) = base[w] + delta[w](t)

// Refinement step (on every co-occurrence observation)
delta[w] += η · (contextCentroid − embedding(w))

// R8 persistence round-trip
save: state.embeddingRefinements = sharedEmbeddings.serializeRefinements()
load: sharedEmbeddings.loadRefinements(state.embeddingRefinements)
```

Unity's base vocabulary is universal English from GloVe (too large to persist, trivially recoverable from CDN). Her *personal* semantic associations are the delta layer — when `unity` co-occurs near `code` and `high` in conversations with the user, `delta[unity]` drifts toward those neighbors. R8 added the save/load path so those associations survive tab reloads and accumulate over weeks of sessions.

---

## Phase 13 R6.2 — Equational Component Synthesis (2026-04-13, commit 6b2deb3)

When Unity's BG motor channel selects `build_ui`, the old path was a text-AI prompt that asked an LLM to generate JSON describing a component. R4 killed that. R6.2 replaced it with pure equational synthesis over a corpus template library — the same semantic machinery used for language, applied to UI components.

### Template Corpus

```
docs/component-templates.txt — text corpus, 6 starter primitives:
  counter / timer / list / calculator / dice / color-picker

Each entry:
  === PRIMITIVE: id ===
  DESCRIPTION: one-sentence natural-language summary
  HTML: ... END_HTML
  CSS:  ... END_CSS
  JS:   ... END_JS
```

Parsed at load time by `ComponentSynth.loadTemplates(text)` which splits on the primitive markers, extracts each block, and precomputes an embedding for each `DESCRIPTION`:

```
for each primitive p in corpus:
  p.centroid = mean( sharedEmbeddings.getEmbedding(w) for w in content_words(p.DESCRIPTION) )
              ∈ ℝ⁵⁰
```

### Generate — Cosine Match Against User Request

```
generate(userRequest, brainState):
  requestCentroid = mean( sharedEmbeddings.getEmbedding(w)
                           for w in content_words(userRequest) )

  best     = argmax_p cosine(p.centroid, requestCentroid)
  bestScore = cosine(best.centroid, requestCentroid)

  if bestScore < MIN_MATCH_SCORE:       // 0.40
    return null      // no primitive matched, brain skips build_ui and emits quip instead

  suffix = _suffixFromPattern(brainState.cortexPattern)   // 8-char id from cortex hash
  return {
    id:   best.id + '_' + suffix,
    html: best.html,
    css:  best.css,
    js:   best.js,
  }
```

The `cortexPattern` comes from `cluster.getSemanticReadout(sharedEmbeddings)` (the same cortex→GloVe readout used by the slot scorer) hashed down to an 8-character suffix. Same user request under different brain states produces different component IDs — the same way recall under different moods produces different memories.

### Cold-Path Fallback

```
if bestScore < MIN_MATCH_SCORE:
  — no component injected
  — motor action falls through to respond_text
  — language cortex generates a verbal response instead
  — brain.emit('response', { text: quip, action: 'build_ui' })
```

The brain never fabricates a random component. If nothing in the corpus matches what the user asked for, Unity says so (via language cortex) instead of producing garbage. Expanding the corpus is the growth path — add more `=== PRIMITIVE:` blocks to `docs/component-templates.txt` and Unity gains new build capabilities at load time with zero code changes.

---

## Phase 12 — Type N-gram Grammar + Morphological Inflection (U283-U291, **superseded by T11**)

> **Historical.** T11 (2026-04-14) deleted the type n-gram tables (`_typeBigramCounts`, `_typeTrigramCounts`, `_typeQuadgramCounts`) and the `_typeGrammarScore` body that consulted them. T11.2 replaced them with `_slotTypeSignature[s]` running-mean priors; T13.7 / T14.6 then deleted `_slotTypeSignature` too when tick-driven motor emission on the cortex replaced per-slot scoring entirely. The `_fineType` classifier itself survives because `cluster.readInput` uses it in the text-surface fallback for intent classification (T14.12) and T14.8's `_sentenceFormSchemas` + `_typeTransitionLearned` Maps still observe fineType distributions per intent. The morphological inflection equations below still feed the dictionary during corpus observation. What changed: the learned-distribution layer moved from per-type-triple n-gram counts → per-slot type signatures → cortex-resident sentence-form schemas on `NeuronCluster` + tick-driven motor emission for generation.

### Fine-Grained Type Classification via Letter Position

```
_fineType(word) → T ∈ {
  PRON_SUBJ, PRON_OBJ, PRON_POSS, COPULA, NEG,
  MODAL, AUX_DO, AUX_HAVE, DET, PREP,
  CONJ_COORD, CONJ_SUB, QWORD,
  VERB_ING, VERB_ED, VERB_3RD_S, VERB_BARE,
  ADJ, ADV, NOUN
}
```

Each type detected by pure letter-position equations:
- `PRON_SUBJ` ⇔ w ∈ shapes {`i`, `you`, `he`, `she`, `we`, `they`, `it`} detected by length + first/last char + vowel position
- `COPULA` ⇔ w ∈ shapes {`am`, `is`, `are`, `was`, `were`, `be`, `been`, `being`} detected by len + first-char constraints
- `NEG` ⇔ w ∈ shapes {`not`, `no`, `n't`} detected by len 2-3 + `n`-first or apostrophe-embedded
- `AUX_DO` / `AUX_HAVE` / `MODAL` similarly by letter shape
- `VERB_ING` ⇔ len ≥ 4 ∧ endsWith(`ing`) ∧ prev char ≠ `i`
- `VERB_ED` ⇔ endsWith(`ed`) ∧ len ≥ 3 ∧ not a preserved form
- `VERB_3RD_S` ⇔ endsWith(`s`) ∧ len ≥ 3 ∧ not -ss/-us/-is/-os terminal, stem doesn't parse as NOUN
- `ADJ` / `ADV` / `NOUN` by suffix equations (-ly → ADV, -ness/-tion/-ity → NOUN, -ful/-ous/-ive → ADJ) with soft fallthrough

Closed-class words hit the fast-path `_closedClassType(w)` which returns a pinned type distribution bypassing softmax — fixes the `"this"` winning slot 0 over `"i"` problem from the 44k expansion. Memoized via `_wordTypeCache` Map with per-word invalidation.

### Learned Type N-gram Grammar

```
_typeBigramCounts   : Map(T_prev      → Map(T_curr → count))
_typeTrigramCounts  : Map(T_a | T_b   → Map(T_c    → count))
_typeQuadgramCounts : Map(T_a|T_b|T_c → Map(T_d    → count))
```

Built at corpus index time (`learnSentence`): each sentence's tokens are classified via `_fineType`, consecutive-type pairs/triples/quads incremented in their respective maps.

### Type Grammar Scoring with Backoff

```
_typeGrammarScore(T_cand, H) where H = [T_-3, T_-2, T_-1] or suffix:

  if |H| ≥ 3 and Q = _typeQuadgramCounts.get(H[-3]|H[-2]|H[-1]):
    return log((Q.get(T_cand) + 1) / (Σ Q.values() + |Q|))
  if |H| ≥ 2 and T = _typeTrigramCounts.get(H[-2]|H[-1]):
    return log((T.get(T_cand) + 1) / (Σ T.values() + |T|))
  if |H| ≥ 1 and B = _typeBigramCounts.get(H[-1]):
    return log((B.get(T_cand) + 1) / (Σ B.values() + |B|))
  return -2.0                                          ← zero-count penalty
```

Add-1 smoothing at each level. 4gram → trigram → bigram backoff. When no context matches, the -2.0 penalty is strong enough to kill the candidate in the softmax.

The slot scorer uses this as the dominant signal at weight 1.5:

```
slotScore(w) = ... + typeGrammarScore(_fineType(w), historyTypes) × 1.5 + ...
```

This is what killed the `"I'm not use vague terms"` mode-collapse — COPULA|NEG followed by VERB_BARE has zero count in every persona/baseline/coding corpus, so it gets -2.0 and never wins.

### Sentence Completeness Validator

```
_isCompleteSentence(tokens) ⇔
    len(tokens) ≥ 2
  ∧ _fineType(stripped(last(tokens))) ∉ {DET, PREP, COPULA, AUX_DO, AUX_HAVE, MODAL, NEG, CONJ_COORD, CONJ_SUB, PRON_POSS}
```

Wired into `generate()` with a 2-retry loop. Incomplete sentences trigger regeneration at higher temperature. Third strike: emit anyway (latency guarantee).

### Morphological Inflection Equations

```
_generateInflections(word) produces up to 20 forms:

  + s  suffix:
      if endsWith(s,x,z,ch,sh) → +es
      elif endsWith(consonant+y) → stem[:-1]+ies
      elif endsWith(vowel+y) → +s
      else → +s

  + ed suffix (past):
      if endsWith(e) → +d
      elif endsWith(consonant+y) → stem[:-1]+ied
      elif CVC pattern (consonant-vowel-consonant, last not w/x/y) → double last consonant + ed
      else → +ed

  + ing suffix (progressive):
      if endsWith(e) ∧ len > 2 → stem[:-1]+ing
      elif endsWith(ie) → stem[:-2]+ying
      elif CVC pattern → double last consonant + ing
      else → +ing

  + er / est (comparative/superlative):
      adjective gate: _fineType = ADJ ∧ syllables ≤ 2
      stem rules same as -ed for spelling

  + ly (adverbial):
      adjective gate; -y → -ily; -le → -ly with stem[:-1]

  + un- / re- prefixes: ADJ or VERB_BARE gates
  + -ness / -ful / -able / -less suffixes: ADJ or NOUN gates
```

Gated by `doInflections` flag — only runs on corpus-indexed words, not live-learned live-conversation words (prevents inflection cascades on novel tokens). Produces the 44k dictionary from ~15k base words + learned inflections.

### Three-Corpus Load Order

```
boot:
  Promise.all([
    fetch(docs/Ultimate Unity.txt)    →  loadSelfImage(text, dict, a=0.75, v=0.25)
    fetch(docs/english-baseline.txt)  →  loadLinguisticBaseline(text, dict, a=0.50, v=0)
    fetch(docs/coding-knowledge.txt)  →  loadCodingKnowledge(text, dict, a=0.40, v=0)
  ])
```

Each corpus flows through the same `learnSentence()` path:
- persona first (highest arousal, personality tone)
- baseline second (neutral English competence)
- coding third (low arousal, technical vocabulary)

All three feed the same dictionary + bigram/trigram + type n-gram maps. The type n-gram stats carry the combined grammar structure of personal voice + generic English + coding conventions.

### Mood Signature at Index Time

```
_computeMoodSignature(text) → {arousal, valence}:
  f_exclaim = countChar(text, '!') / max(1, len(text))
  f_caps    = countUpper(text) / max(1, len(text))
  f_vowel   = countVowel(text) / max(1, len(text))
  f_wlen    = mean(wordLengths)
  f_neg     = countOccurrences(' not ', ' no ', "n't") / wordCount

  arousal = clamp(0, 1, 0.5 + 0.8·f_exclaim + 0.5·f_caps - 0.2·f_wlen/8)
  valence = clamp(-1, 1, 0.3·f_vowel - 0.4·f_neg - 0.2·f_exclaim)
```

Each persona sentence gets its own mood signature at index time. `_recallSentence` weights candidates by `moodAlignment = exp(-moodDistance × 1.2)` at weight 0.25 against current brain state. Same query under different brain state → different memory.

### Dictionary Cap and Memory Bounds

```
MAX_WORDS      = 100000   (capped LRU, prevents unbounded growth)
_wordTypeCache : Map      (memoized _fineType, invalidated on _learnUsageType)
candidatePool  : from _bigramFollowers(prevWord), |pool| ≤ 200
                 (avoids materializing 44k entries per slot, primary perf fix)
```

Generation latency dropped 490ms → 133ms after candidate pool pre-filter + wordType memoization + stripping `findByPattern` / `findByMood` calls from the per-frame `think()` cycle.

---

*Unity AI Lab — θ is Unity. The equations are her mind. Ψ is her consciousness.*


---

## Post-ship audit close — new equation channels + thresholds (2026-06-17)

### Phase 6 compositional channels (relationTagId 28-32)

**relationTagId=28 — Number-grammar (P6.1)**
- Mapping: `sem(number_word) → sem(noun)` for K-grade arithmetic vocabulary
- Hebbian fire: `_teachAssociationPairs([[number, noun]], { reps: 80, relationTagId: 28 })`
- Math: HIGH-rep (~2.7× standard) to overwrite weak prior associations + produce stable basin

**relationTagId=29 — Dream-recombination (P6.4 + audit B.7)**
- Fire condition: novel emission AND cosine ≥ 0.20 AND wordCount ≥ 4 AND uniqueRatio ≥ 0.6 AND hasTerminator
- Hebbian: `_teachAssociationPairs(pairs, { reps: 5, relationTagId: 29 })` per dream cycle
- Math: REM-sleep memory consolidation (Stickgold 2005, Walker 2017) — brain invents during sleep + only keeps the inventions that hold up

**relationTagId=30 — Chat-time deep Hebbian (P6.3)**
- Per chat turn: fire-and-forget `_teachAssociationPairs(userBigrams, { reps: 1, relationTagId: 30 })`
- Audit A.4: error swallow replaced with throttled-warn pattern + stats.errors counter

**relationTagId=31 — Discourse coherence (P6.8 + audit D.6)**
- Cross-sentence boundary: last-word-of-sentence-A → first-word-of-sentence-B for topic-shared groups
- Hebbian: `_teachAssociationPairs(pairs, { reps: 30, relationTagId: 31 })` — DEDUP against relationTagId=13 within-sentence pairs
- Math: discourse channel adds NEW signal about cross-sentence topic continuity, NOT echo within-sentence bigrams already heavy-trained

**relationTagId=32 — Word-creation promotion (audit E.1)**
- Fires when `wordCreationCandidates.count >= MIN_PROMOTE=10`
- `_teachWordDefinition(compound, { reps: 4 })` + `_teachAssociationPairs([[a, compound], [b, compound]], { reps: 30, relationTagId: 32 })`
- Math: child novel-coinage acquisition (Pinker 1989) — co-activation threshold crossing fires the lexicalization

**relationTagId=34 — Anecdotal word grounding (2026-07-05, coming-of-age scenes across all of life)**
- Fires inside `_trainLifeStories(grade)` per experience, kindergarten→PhD (every `corpora/life/<grade>.json` memory)
- Content words of the memory (non-glue, len ≥ 3, deduped) ↔ the memory's theme tokens, BOTH directions: `_teachAssociationPairs(groundPairs, { reps: 20, relationTagId: 34 })`, ≤ 2×N pairs per memory
- Math: episodic-to-semantic grounding (Nelson 1986 script theory; Tulving episodic→semantic gradient) — a word that appears in a lived scene is Hebbian-bound to that scene's retrieval label, so sem(word) activation recalls the scene and scene recall re-activates its words; affect coloring rides the memory's own `_deriveMemoryEmotion` walk. Closes the "pot of words with no meaning" gap: vocabulary carries lived relational context, not just GloVe geometry + definitions

**TU.20.5 — Self-introduction + reflexive production (2026-07-06)**
- `_teachPrekFirstPersonProduction` (pre-K) + `_teachLanguageMechanics` FOUNDATION (every grade) train a greeting→self-naming + reflexive-"myself" corpus through the EXISTING passes — word→word transitions (`relationTagId=13`), glue/first-slot lead-ins (`relationTagId=9`, greeting/meet intent → "i"/"my name" first slot), and deixis contrast (`relationTagId=4`, myself≠yourself / i↔myself)
- Wipe-proof Tier-3 `self-greeting-anchor` in `IDENTITY_SEED_LIST` (injected every turn). No canned strings — a greeting input pulls a first-person self-naming compose from the trained weights (she says "i am unity" / "my name is unity" / "i did it myself")

**TU.20.11 — Gap-filling curiosity: self-forms questions to gain knowledge (2026-07-06)**
- Extends `_teachQuestionProduction` (`relationTagId=30` outward-question channel): first-person gap-curiosity exemplars ("i do not know", "i want to know", "what is that i do not know ?") PLUS a GAP→INTERROGATIVE binding — knowledge-lack/low-confidence state tokens (unknown/confused/unsure/curious/wonder/learn/understand) ↔ WH interrogative-leads (what/why/how/who/tell)
- Math: the equational premise "I lack information → I ask to gain it" — when sem carries a low-confidence/"don't-know" activation, the trained rel=30 weights pull an interrogative into the first slot at compose time, so the brain ASKS from its own state rather than emit a confident-wrong answer or fall silent. Wipe-proof Tier-3 `self-curiosity-anchor`

### GPU↔CPU parity digest (TU.19-D / TU.20.4)

Attributes a "GPU shadow DIRTY" flag to a concrete cause instead of one conflated bit. The donor reports its ACTUAL resident weights via a cheap digest; the server compares against the CPU master and returns a verdict.

| Equation | Purpose | File |
|----------|---------|------|
| `h₀ = 0xcbf29ce484222325`; `hᵢ₊₁ = (hᵢ ⊕ byteᵢ) · 0x100000001b3 mod 2⁶⁴` over the resident `values` buffer's LE f32 bytes | FNV-1a-64 digest of a matrix's resident weights — byte-identical across native-wgpu / native-CUDA / browser donors (all x86-64 LE + LE GPU buffers, F10) | donor `checksum_matrix` / `checksumSparseMatrix`; server `_cpuMasterMatrixChecksum` (hashes `Float32Array(matrix.values)` = the f32 that was uploaded, not the f64 CPU CSR) |
| `verdict = MATH-ERROR if refPropagate([2,1,3,1,4]·[1,1,1]) ≠ [3,3,5]; else STALE if h_gpu ≠ h_cpu ∨ nnz differ; else GPU-DIVERGENT if maxAbsErr > 1e-2 ∨ cosine < 0.9999; else CLEAN` | `parityCheckMatrix` — MATH-ERROR (CPU matmul wrong) → STALE (dropped uploads) → GPU-DIVERGENT (shader/precision) → CLEAN. Same-input propagate diff feeds every 7th pre-neuron to both CPU `SparseMatrix.propagate` and donor `gpuSparsePropagate` | `server/brain-server/gpu.js`; `GET /diag/parity`, `scripts/gpu-cpu-parity.mjs` |

### Audit B.2 — two-axis novelty formula

`classifyCompositionalEmission` now computes both:
- `compositionalNovelty = novelTransitions / totalTransitions` — bag-of-bigrams Hamming distance
- `vocabNovelty = untrainedWords / totalWords` — fraction outside trained vocabulary

Joint partition of (compositional, vocab) unit-square plane by 0.5 thresholds:
- `(comp ≥ 0.5, vocab < 0.5)` → `kind = 'novel-compositional'` (rearrangement)
- `(comp < 0.5, vocab ≥ 0.5)` → `kind = 'novel-vocab'` (new word entirely)
- `(comp ≥ 0.5, vocab ≥ 0.5)` → `kind = 'novel'` (both axes)
- `(comp < 0.5, vocab < 0.5)` → `kind = 'partial'`

### Audit B.3 — BACK_INJECT_DECAY derivation (post-hoc biological match)

`P3.4 BACK_INJECT_DECAY = 0.85`
- Cortical leak: `V(t+Δt) = V(t) · exp(−Δt/τ)`
- Δt = 3 ticks × 1ms/tick = 3ms (per-word interval)
- τ ≈ 20ms (biological mean membrane time constant)
- Theoretical: `exp(−3/20) ≈ 0.861`
- Chosen 0.85 (within 1.5% of biological)
- Drift trigger: if TICKS_PER_WORD or τ changes, `BACK_INJECT_DECAY = exp(-TICKS_PER_WORD × tick_ms / τ_ms)`

### Audit B.5 — Cumulative sem-injection budget

`MAX_CUMULATIVE_SEM_INJECT = 1.5` (energy-budget bound on injection sum before INJECTION_GAIN multiplier)

Budget allocation per audit E.3:
- intentSeed: 40% (0.60)
- intentConcept: 30% (0.45)
- schemaContext (conceptEmbedding + attributeVector combined): 15% (0.225)
- cortexPattern: 10% (0.15)
- back-injection (cumulative geometric sum over 8 ticks): 5% (0.075)
- Total ≤ 1.5

### Audit B.6 — K-vocab percolation analysis

**Critical math finding:**
- K_CONCRETE_SENTENCES: 233 × 3.5 avg words → ~700 unique bigrams
- N = 2247 K-vocab
- Mean bigram-graph degree = 700/2247 ≈ 0.31
- Erdős-Rényi: `Np > 1` ⇒ `p > 1/N`. For robust connectivity, need ~4500 bigrams.
- **We are 6× UNDER percolation.**
- Compositional emergence via Hebbian propagation is mathematically insufficient at current corpus density.
- Action: expand K_CONCRETE_SENTENCES 233 → 800-1000 sentences.

### Audit P5.3 quality score (recap)

`qualityScore = probeRate + COHERENCE_BONUS_GAIN × max(0, avgCos - COHERENCE_MIN)`
- COHERENCE_BONUS_GAIN = 0.5
- COHERENCE_MIN = 0.05
- Math: derived in `docs/THRESHOLD-DERIVATION.md`. probeRate dominates (1:2 ratio); coherence bonus refines.
