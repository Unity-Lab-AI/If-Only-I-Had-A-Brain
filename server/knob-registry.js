'use strict';

/**
 * ⭐⭐ THE KNOB REGISTRY — every training / weight / saturation knob the brain
 * reads, with its LIVE value, its default, and whether a write to it can
 * actually take effect.
 *
 * Operator: *"we have all the knobs in the teachview so with the knobs that you
 * will know how to set and asjust perfectly for what we need you willl be the
 * one setting all the knobs and monitoring them and keeping them proper as we do
 * the test of the brain"*.
 *
 * ⛔ THE PROBLEM THIS SOLVES IS NOT "THERE IS NO UI". The knobs are read from
 * `process.env`, which on the deployed box means the systemd unit, which means a
 * shell — and there is no shell. So the honest state of affairs before this file
 * existed was: **the knobs governing how she learns could not be READ, let alone
 * turned, by the only person who operates this brain.** Every value below is a
 * fact the process already had and simply never published.
 *
 * ⛔⛔ AND THE HARD PART IS THE `effect` FIELD, NOT THE VALUES. A knob read once
 * at module scope is captured at boot: writing it later changes `process.env`,
 * reads back correctly, and **changes nothing about the training**. A panel that
 * accepted that write would be a control that lies — the exact defect class this
 * project keeps finding. So:
 *
 *   live   the read happens inside a function body, so it is re-read on every
 *          use and a write takes effect on the next call
 *   boot   the read happens at module scope, so the value was frozen when the
 *          process started and a write CANNOT take effect until a restart
 *   cached the read is guarded by an `if (this._x === undefined)` first-use
 *          cache, so it is read ONCE and then never again. A write BEFORE the
 *          first use takes effect; a write after it is silently ignored.
 *   ???    not yet verified — the read site is recorded, the scope is not
 *          proven, and it is rendered as unproven rather than guessed
 *
 * ⛔⛔ `cached` WAS FOUND BY READING THE SITES, AFTER TWO AUTOMATED CLASSIFIERS
 * HAD BOTH LIED — and it is the most dangerous of the three, because it looks
 * exactly like `live` in the source. `DREAM_FIRING_TARGET_PCT` and
 * `DREAM_NOISE_GATE` were both carried here as `live` and both sit behind a
 * first-use cache: on a brain that has already run, **a write to either is
 * accepted, reads back correctly, and changes nothing.** That is the precise
 * failure this whole panel exists to prevent, and it was in this file's own
 * hand-written data until it was checked line by line.
 *
 * ⚠ EVERY `effect` BELOW WAS DETERMINED BY READING THE READ SITE, NOT BY A
 * SCANNER. A brace-depth classifier was written first and it reported
 * `DREAM_PHASE_BUDGET_MS` and `DREAM_STRUCTURE_DOSE` as `live` when both are
 * module-scope constants — the IIFE wrapper defeats depth counting. **It was
 * discarded rather than shipped**, because a wrong effect class is worse than no
 * class at all: it is the panel promising a write will work.
 *
 * ⭐ `???` IS A FIRST-CLASS ANSWER HERE AND IS MEANT TO STAY VISIBLE. A knob
 * whose effect is unproven renders read-only with the reason. It gets promoted
 * to `live` or `boot` by someone reading its site, one at a time.
 *
 * ⭐⭐ AND THE SECOND AXIS — `provenance` — IS THE ONE THE OPERATOR ACTUALLY
 * ASKED FOR: *"tooltip theri values so i can see them what you set them too like
 * alen turning taking numbers of the turning machine to crack the enigma"*.
 *
 * ⛔ THE PANEL COULD NOT ANSWER THAT QUESTION BEFORE. It reported `overridden`,
 * which means *"the environment sets this"* — and on this box the environment
 * sets **nothing**, so every one of 195 rows read identically whether the number
 * had been derived from measurement that morning or inherited untouched from a
 * year ago. **A readout where a reasoned value and an unexamined one look the
 * same is not a readout.**
 *
 *   set        chosen deliberately, with the reasoning recorded on the row
 *   derived    the value came from a measurement or a computation, not a guess
 *   config     ⭐ NOT A MAGNITUDE — a switch, a path, or an on/off. There is
 *              nothing to derive, and calling these "underived" would pad the
 *              unexplained count with rows that can never be explained further.
 *   inherited  it works and nobody has re-derived it — honest, not an accusation
 *   stale      ⛔ it WAS derived, and the thing it was derived against changed
 *
 * ⚠ `stale` is the class worth staring at. `DREAM_REP_COMPRESS = 40` was
 * genuinely measured — against a corpus **11.2× smaller than today's**, and the
 * live collision load measures **1,542–7,471** against a sweep whose table stops
 * at **25**. **A measured number is not a current number.**
 */

/**
 * ⚠ `dflt` IS THE VALUE THE CODE FALLS BACK TO WITH THE VARIABLE UNSET, copied
 * from the read site — not a documented intention. Where the two disagreed, the
 * code won.
 */
const KNOBS = [
  // ── learning rate and dose ────────────────────────────────────────────────
  {
    key: 'DREAM_CONTENT_LR', group: 'Learning rate & dose', dflt: '0.0468',
    provenance: 'derived', setOn: '2026-09-02',
    why: 'Derived, not chosen, and derived against the REBUILT corpus rather than inherited. It used to be cluster.learningRate = 0.001, which at 3 reps deposits 0.30% of a pattern while the grammar lane beside it deposits 51.90% — the two lanes were 173x apart and the WEAK one was the one carrying her subject knowledge. Oja gives deposit = 1-(1-lr)^n, so matching a median word\'s exposure to a real target lands at 0.0468 ~= 24.99% per median word, at zero wall-clock cost.',
    effect: 'live', site: 'js/brain/curriculum.js:24428',
    proof: 'read into a method-local `let lr` on every call, not a module const',
    what: 'Oja rate for the CONTENT lane — the lane that teaches meaning from prose. Accepted only in (0, 0.5]. Derived, not chosen: it matches a median word\'s exposure to a real deposit target across the rebuilt corpus (~25% per median word at 3 reps).',
  },
  {
    key: 'DREAM_SM_LR_SCALE', group: 'Learning rate & dose', dflt: '0.5',
    effect: 'cached', site: 'js/brain/cluster/hebbian.js',
    proof: 'guarded by `if (this._smLrScale === undefined)` — read ONCE per cluster. Resolved from `???` by reading the site.',
    what: 'Damping on the sem→motor and sem→word_motor Hebbian rate. This is a saturation-prevention lever; 1.0 restores undamped behaviour.',
  },
  {
    key: 'DREAM_STRUCTURE_DOSE', group: 'Learning rate & dose', dflt: '1',
    provenance: 'derived', setOn: '2026-08-20',
    why: 'Cut to 0.4 once and REVERTED to 1.0 with the reasoning written down: "we fix waste, training stays whole; a dose multiplier was never waste, it was less teaching." The 0.4 bought ~9.7 days of structure-refresh against ~24 at 1.0, and what it bought them with was less of her education. Lowering it again is a RE-PRICE event, not a tuning choice.',
    effect: 'boot', site: 'js/brain/curriculum.js:2738',
    proof: 'module-scope `const STRUCTURE_DOSE = …` — frozen at import',
    what: 'Multiplier on structure-pass reps, clamped to [0.05, 1]. ⛔ It was cut to 0.4 once and REVERTED: a dose multiplier was never waste, it was less teaching. Lowering it is a RE-PRICE event.',
  },
  {
    key: 'DREAM_ACAD_VOCAB_CAP', group: 'Teaching & schedule', dflt: 'unlimited',
    provenance: 'set', setOn: '2026-09-02',
    why: 'WAS 60, HARDCODED. Set to unlimited on the operator\'s ruling. The arithmetic for keeping it was mine and wrong twice: 1,996,943 words was distinct-PER-CELL summed, when _definitionTaughtWords is global and persisted so the real figure is 365,132 distinct across the whole corpus (5.5x overcount); and those were priced as cold SERIAL lookups when prefetchDefinitions already batches at concurrency 20 (another 20x). Real cost of no cap: 19.8h across a ~24-day walk, 3.4%, with only 6 of 189 cells over 30 min on first visit. A cap here was never a cost control, it was a ceiling on what she can ever know.',
    effect: 'live', site: 'js/brain/curriculum.js — _trainAcademicStories pre-vocab block',
    proof: 'read inside the method on every cell',
    what: '⚠ DIAGNOSTIC LEVER ONLY — for bisecting a slow cell, never an operating setting. Caps how many unlearned words a cell looks up definitions for before its prose is taught. ⛔ It was hardcoded at 60 and the cap came off 2026-09-02 on the operator\'s ruling ("she has to be able to look up all workds she needs to know no some bullshit limit"). The arithmetic that appeared to justify keeping it was wrong twice: distinct-per-cell words were summed (1,996,943) when the figure that matters is distinct across the whole corpus (365,132, because _definitionTaughtWords is global and persisted), and those were then priced as cold serial lookups while prefetchDefinitions already batches at concurrency 20. Real cost of no cap: 19.8h across a ~24-day walk, with only 6 of 189 cells exceeding 30 min on first visit. A cap here was never a cost control, it was a ceiling on what she can ever know.',
  },
  {
    key: 'DREAM_REHEARSAL_FRACTION', group: 'Learning rate & dose', dflt: '0.02',
    provenance: 'set', setOn: '2026-09-02',
    why: 'NEW LANE, and 0.02 was picked from a re-price computed BEFORE it shipped and then re-run through the real method rather than a model of it. 189 prose cells, 170 gaining a rehearsal: 17,125 rehearsal sentence-reps against 7,627,185 new = 0.225% of the prose lane, worst single cell 0.667%, +77.6 minutes across a ~24-day walk. Chosen as the largest share that stays under 1% of any single cell.',
    effect: 'live', site: 'js/brain/curriculum.js — _rehearseEarlierGrades',
    proof: 'read inside the method on every cell',
    what: 'Share of a cell\'s own sentence count spent re-presenting EARLIER grades of the same subject before new material. 0 disables the lane. Priced: 2% costs +0.225% of the whole prose lane.',
  },
  {
    key: 'DREAM_REHEARSAL_MAX', group: 'Learning rate & dose', dflt: '250',
    provenance: 'set', setOn: '2026-09-02',
    why: 'NEW. 250 is the ceiling that keeps the richest cells from spending the 2% fraction unbounded — 44 of 189 cells hit it. Split evenly across every earlier grade, so at 9 earlier grades that is ~27 sentences each rather than 250 from the nearest one.',
    effect: 'live', site: 'js/brain/curriculum.js — _rehearseEarlierGrades',
    proof: 'read inside the method on every cell',
    what: 'Absolute ceiling on rehearsal sentences per cell, so the richest cells cannot spend the fraction unbounded. The budget is split evenly across every earlier grade.',
  },
  {
    key: 'DREAM_REHEARSAL_REPS', group: 'Learning rate & dose', dflt: '1',
    provenance: 'set', setOn: '2026-09-02',
    why: 'NEW. 1 rep against the content lane\'s 3, chosen because Oja deposits 1-(1-lr)^n: at DREAM_CONTENT_LR 0.0468 one exposure re-deposits 4.68% onto a basin that ALREADY EXISTS. This is a top-up, not a relearn — relearning is what would cost real time. Raising it re-prices linearly against the 0.225% figure.',
    effect: 'live', site: 'js/brain/curriculum.js — _rehearseEarlierGrades',
    proof: 'read inside the method on every cell',
    what: 'Reps for rehearsed material, against the content lane\'s 3. One rep re-deposits ~4.7% onto a basin that already exists — a top-up, not a relearn. Raising it re-prices linearly.',
  },

  // ── rep compression ───────────────────────────────────────────────────────
  {
    key: 'DREAM_REP_AUTOPRICE', group: 'Rep compression (dose vs rate)', dflt: 'off ("1" arms it)',
    provenance: 'set', setOn: '2026-09-02',
    why: 'NEW, and deliberately OFF. It was built to replace the stale DREAM_REP_COMPRESS with a measured one — but the measurement since taken says the sweep table it indexes does not cover this brain at all (live load 1,542-7,471 against a table topping out at 25). Arming it would swap a stale constant for a confident reading off the wrong chart. It still MEASURES and PUBLISHES unarmed, so a press produces the number. Arm only after the load sweep at the fresh-walk press.',
    effect: 'live', site: 'js/brain/curriculum.js — _teachAssociationPairs pricing block',
    proof: 'read inside the method on every call',
    what: 'Lets the compression factor price ITSELF from the brain\'s own measured collision load instead of the hand-set DREAM_REP_COMPRESS. ⛔ The hand-set 40 was measured when the corpus held 4.48M words and the academic prose alone now holds 50.2M — 11.2x — and the sweep that produced it wrote its own expiry: "the compression that is free today is the first thing that breaks when the pair count climbs". ⚠ DEFAULT OFF ON PURPOSE: the sweep\'s "production" row is 8 active cells drawn from 1,885,340, while the live encoder is semWTA top-8 over a ~300-dim embedding tiled in atomic groups — those are not the same geometry, so the first LIVE reading is what settles whether 0.246 ever applied here. Unarmed it still measures and still publishes, so one press produces the evidence; armed, it steers.',
  },
  {
    key: 'DREAM_REP_COMPRESS', group: 'Rep compression (dose vs rate)', dflt: '40',
    provenance: 'stale', setOn: '2026-09-01',
    why: '⛔ THE ONE TO STARE AT. It WAS measured — a real sweep over a real SparseMatrix scoring retrieval, not a guess — but it was measured when the academic corpus held 4.48M words and it now holds 50.2M, 11.2x more. The sweep wrote its own expiry into the code: "collision load rises with PAIR COUNT ... the compression that is free today is the first thing that breaks when the pair count climbs. THIS IS THE FIRST KNOB TO WALK BACK." Measured 2026-09-02 from the real pattern builder: live collision load is 1,542 (science/grade5) to 7,471 (ela/grade3), against a sweep that called 0.246 "production" and whose table stops at 25. This brain runs 60-300x beyond anything anyone measured. A measured number is not a current number. Needs a fresh sweep at the real load — scheduled for the fresh-walk press.',
    effect: 'live', site: 'js/brain/curriculum.js:17573',
    proof: 'read inside the teach method on every call',
    what: 'Divisor turning authored reps into presentations. 40 rather than 20 so every tier\'s target lands at 4-5 and the rate ceiling is the only thing that raises it.',
  },
  {
    key: 'DREAM_REP_COMPRESS_LR_CEIL', group: 'Rep compression (dose vs rate)', dflt: '0.60',
    effect: 'live', site: 'js/brain/curriculum.js:17594',
    proof: 'read inside the teach method on every call',
    what: 'Ceiling on the compensating rate raise. Compression trades reps for rate; this bounds how far the rate may go.',
  },
  {
    key: 'DREAM_REP_COMPRESS_FLOOR', group: 'Rep compression (dose vs rate)', dflt: '4',
    effect: 'live', site: 'js/brain/curriculum.js:17626',
    proof: 'read inside the teach method on every call',
    what: 'Minimum presentations after compression — the floor that stops a compressed phase collapsing to a single exposure.',
  },
  {
    key: 'DREAM_REP_COMPRESS_MIN_DOSE', group: 'Rep compression (dose vs rate)', dflt: '—',
    effect: 'live', site: 'js/brain/curriculum.js:17623',
    proof: 'read inside the teach method on every call',
    what: 'Minimum retained dose under compression.',
  },

  // ── saturation detection ──────────────────────────────────────────────────
  {
    key: 'DREAM_SAT_MEANCOS', group: 'Saturation & coherence', dflt: '0.7',
    provenance: 'inherited', setOn: null,
    why: '⚠ NOT DERIVED, and its own comment admits it: "conservative defaults match prior hardcoded values; env vars only deviate when empirical 20hr-test data justifies a shift." So 0.7 is the number it always was, carried forward. That data has never been gathered. It is not wrong — it is unexamined, and this row exists so it is not mistaken for a measured value. The same is true of the other three SAT_ thresholds.',
    effect: 'boot', site: 'js/brain/cluster.js:241',
    proof: 'module-scope `const SATURATION_MEANCOS = (() => …)()` — frozen at import',
    what: 'Mean cosine between sem→motor rows above which the matrix reads as saturated — the "everything means everything" end state. Feeds the consolidation replay VETO.',
  },
  {
    key: 'DREAM_SAT_MEANABS', group: 'Saturation & coherence', dflt: '0.6',
    effect: 'boot', site: 'js/brain/cluster.js:246',
    proof: 'module-scope const IIFE — frozen at import',
    what: 'Mean-absolute-weight ratio threshold in the same health check.',
  },
  {
    key: 'DREAM_SAT_RATIO', group: 'Saturation & coherence', dflt: '1.5',
    effect: '???', site: 'js/brain/cluster.js (saturation block)',
    proof: 'scope not yet read',
    what: 'Ratio threshold in the saturation verdict.',
  },
  {
    key: 'DREAM_SAT_SAMPLE', group: 'Saturation & coherence', dflt: '1000',
    effect: '???', site: 'js/brain/cluster.js (saturation block)',
    proof: 'scope not yet read',
    what: 'How many rows the health check samples. A larger sample is a more trustworthy verdict and a slower one.',
  },

  // ── firing and drive ──────────────────────────────────────────────────────
  {
    key: 'DREAM_FIRING_TARGET_PCT', group: 'Firing & drive', dflt: '7.5',
    effect: 'cached', site: 'server/brain-server.js',
    proof: 'guarded by `if (this._fireTargetCached === undefined)` — read ONCE, then never again. ⛔ Carried here as `live` until the sites were read line by line.',
    what: 'Target share of neurons firing per tick. The homeostatic set point everything else is driven toward.',
  },
  {
    key: 'DREAM_PSI_GAIN_SCALE', group: 'Firing & drive', dflt: '2.0',
    effect: 'live', site: 'server/brain-server.js:5606',
    proof: 'read inside the tick path',
    what: 'Scale on the psi gain term.',
  },
  {
    key: 'DREAM_NOISE_GATE', group: 'Firing & drive', dflt: 'on ("0" disables)',
    effect: 'cached', site: 'js/brain/cluster.js',
    proof: 'guarded by `if (this._noiseGateEnabled === undefined)` — read ONCE per cluster, then never again. ⛔ Carried here as `live` until the sites were read line by line.',
    what: 'The noise gate. ⚠ It is ON by default and this is an OPT-OUT — a past audit read it as a disabled feature and was wrong.',
  },
  {
    key: 'DREAM_ANNEAL_TEMP', group: 'Firing & drive', dflt: 'on ("0" disables)',
    effect: 'live', site: 'js/brain/cluster/emit.js:938',
    proof: 'read at the emit site',
    what: 'Annealing temperature on emission. Also an opt-out rather than an opt-in.',
  },

  // ── consolidation and replay ──────────────────────────────────────────────
  {
    key: 'DREAM_CONSOLIDATION_MAX_MS', group: 'Consolidation & replay', dflt: '45000',
    effect: 'live', site: 'js/brain/consolidation-engine.js:150',
    proof: 'read inside runConsolidationPass on every pass',
    what: 'Wall-clock cap on a routine consolidation pass. ⛔ The consolidation gate is currently the ONLY thing keeping the walk finite (~24 days with it, ~100 without) — this knob is load-bearing on that number.',
  },
  {
    key: 'DREAM_CONSOLIDATION_FORCE_MAX_MS', group: 'Consolidation & replay', dflt: '120000',
    effect: 'live', site: 'js/brain/consolidation-engine.js:147',
    proof: 'read inside runConsolidationPass on every pass',
    what: 'Cap on a FORCED pass. Widened to 120s so the once-per-2h emergency pass finishes Tier-3 promotion instead of aborting at ~48.5s against a 45s routine cap.',
  },
  {
    key: 'DREAM_CONSOLIDATION_FORCE_MS', group: 'Consolidation & replay', dflt: '—',
    effect: 'live', site: 'server/brain-server.js:6103',
    proof: 'read inside the scheduler',
    what: 'Interval between forced consolidation passes.',
  },
  {
    key: 'DREAM_CONSOLIDATION_GPU_REPLAY_MAX', group: 'Consolidation & replay', dflt: '—',
    effect: 'live', site: 'js/brain/consolidation-engine.js:89',
    proof: 'read inside the engine on every pass',
    what: 'Bound on GPU replay work per pass.',
  },
  {
    key: 'DREAM_CONSOLIDATION_MAX_REPLAY_NNZ', group: 'Consolidation & replay', dflt: '—',
    effect: 'live', site: 'js/brain/consolidation-engine.js:533',
    proof: 'read inside the replay path',
    what: 'Non-zero ceiling on a replay batch — the memory bound on how much can be replayed at once.',
  },
  {
    key: 'DREAM_CONSOLIDATION_DISABLE', group: 'Consolidation & replay', dflt: 'off',
    effect: 'live', site: 'js/brain/consolidation-engine.js:78',
    proof: 'read at the entry guard',
    what: '⛔ Turns consolidation off entirely. Consolidation is what moves Tier 1 episodes into Tier 2 schemas AND what bounds the walk — disabling it is a RE-PRICE event, not a tuning choice.',
  },

  // ── bounds ────────────────────────────────────────────────────────────────
  {
    key: 'DREAM_PHASE_BUDGET_MS', group: 'Bounds & budgets', dflt: '0 (no budget)',
    effect: 'boot', site: 'js/brain/curriculum.js:2712',
    proof: 'module-scope `const PHASE_BUDGET_MS = (() => …)()` — frozen at import',
    what: '⛔ Per-phase wall-clock budget. **`0` means NO BUDGET and truly means it** — an earlier revision documented `0` as "disables the bound" while the arm site read it as the harshest possible cut. The arm site is now gated so nothing is armed unless a positive budget was explicitly asked for.',
  },
  {
    key: 'DREAM_BRAIN_BUDGET_MB', group: 'Bounds & budgets', dflt: '—',
    effect: 'live', site: 'server/brain-server.js:661',
    proof: 'read at the sizing site',
    what: 'RAM budget the neuron count is derived from. ⚠ The neuron count is DERIVED AT BOOT from free host RAM, so it is not a property of the brain — quote it with the boot that produced it.',
  },
  {
    key: 'DREAM_WINDOW_MAX_MS', group: 'Bounds & budgets', dflt: '—',
    effect: 'live', site: 'js/brain/curriculum.js:4390',
    proof: 'read inside the dream-window helper',
    what: 'Cap on a single dream window.',
  },
  {
    key: 'DREAM_TEXTFIG_PER_CELL', group: 'Bounds & budgets', dflt: '6 (0 disables)',
    effect: 'live', site: 'js/brain/curriculum.js:8925',
    proof: 'read inside _perceiveCellFigures on every visit',
    what: 'Textbook figures perceived from the NETWORK per cell visit. ⚠ It no longer bounds every inline percept: the section walk perceives a section\'s own figures from the local field store beside its prose, and that path is gated on a field hit instead.',
  },
  {
    key: 'DREAM_VM_RELATE_REPS', group: 'Bounds & budgets', dflt: '—',
    effect: 'live', site: 'server/brain-server/visual-memory.js:562',
    proof: 'read at the relate site',
    what: 'Reps when relating a new percept to what she already holds.',
  },
  {
    key: 'DREAM_ART_WEIGHT_REPS', group: 'Bounds & budgets', dflt: '—',
    effect: 'live', site: 'server/brain-server/chat.js:2541',
    proof: 'read at the art-weight site',
    what: 'Reps when a drawing outcome is written back as weight.',
  },
];

/**
 * ⭐⭐ THE PROVENANCE TABLE — the answer to *"find the 186 in totalit that you
 * dont know their reason"*.
 *
 * Discovery finds a knob and lifts the comment sitting above its read site, but
 * that comment almost always explains **what the knob does**, not **why its
 * value is that number**. Those are different questions and the second one is
 * the operator's.
 *
 * ⛔ EVERY ROW HERE WAS PRODUCED BY READING THE READ SITE. No scan wrote any of
 * it — three automated classifiers have already lied about these knobs in a
 * single day (brace-depth scope, column-0 scope, and a hand-registry carrying
 * two `cached` values as `live`). A regex over the comment text was written as a
 * TRIAGE to decide reading order and was deliberately not used to conclude
 * anything.
 *
 * ⚠ `inherited` IS NOT A CRITICISM. It means the value works and nobody has
 * re-derived it. Several rows below are self-admittedly unpriced in their own
 * source comments, and quoting that admission is more useful than inventing a
 * derivation for them.
 */
const PROVENANCE = {
  // ── consolidation ─────────────────────────────────────────────────────────
  DREAM_CONSOLIDATION_FORCE_MAX_MS: { p: 'derived', why: 'DERIVED from a live reading, not chosen. The comment carries it: a forced pass yields between stages and "the live log shows only ~250-340ms loop blocks DURING the 48s pass", so a longer wall buys more yielding work rather than a longer pin. Widened to 120s so the once-per-2h emergency pass finishes Tier-3 promotion instead of aborting at ~48.5s against the routine 45s cap. Its own RE-PRICE note is recorded: this WIDENS a bound rather than removing a gate, so walk-finiteness pricing is untouched.' },
  DREAM_CONSOLIDATION_MAX_MS: { p: 'derived', why: 'DERIVED from a real failure. 45s is "the original 153s-runaway guard" — the cap exists because a pass was measured running 153 seconds and monopolising the event loop. Routine passes keep it unchanged while forced passes get 120s, because the runaway risk is in the frequent lane, not the twice-a-day one.' },
  DREAM_CONSOLIDATION_MAX_REPLAY_NNZ: { p: 'inherited', why: 'The GUARD is well reasoned — both the synchronous hebbianUpdate and the preSem build allocate hundreds of MB at biological scale and must be skipped together to keep the loop free. The NUMBER, 5,000,000 non-zeros, is not derived anywhere. It is a plausible ceiling nobody has priced.' },
  DREAM_CONSOLIDATION_GPU_REPLAY_MAX: { p: 'inherited', why: 'The FAIRNESS mechanism beside it is derived and important — `_gpuReplayCursor` exists because a fixed budget always spends itself on whichever schemas come first in store order, so the tail would never replay at all, "a silent truncation that would look exactly like working consolidation". The cap VALUE itself is not derived.' },
  DREAM_CONSOLIDATION_DISABLE: { p: 'config', why: 'A kill-switch, not a magnitude. It exists because the MAX_MS deadline cannot preempt synchronous work, so at 306M neurons a CPU replay monopolises the loop for 30-400s and stalls the public donor handshake. Off by default; this is the full stop, and the size guard in _replaySchema is the narrower everyday fix.' },
  DREAM_CONSOLIDATION_FORCE_MS: { p: 'inherited', why: 'The 2h interval between forced passes is not derived in the source. It reads as a round operational choice rather than a measured one.' },

  // ── definitions ───────────────────────────────────────────────────────────
  DREAM_DEF_CACHE_CAP: { p: 'derived', why: 'DERIVED from an observed overflow. The cap was 10,000 and "the K walk alone filled 9,906 of the old 10,000 slots" — one conversation past that and her oldest definitions began evicting AND vanishing from the disk cache on the next flush. Raised to ~100k against a size check: tens of MB of JSON, trivial next to the 158MB weight saves. The governing rule is quoted in the comment: her vocabulary grows without limits by LAW, so the definition ledger must too.' },
  DREAM_DEFINITION_CACHE_FILE: { p: 'config', why: 'A file path, not a tuned value. Empty string opts out. The rationale for HAVING it is recorded and sound: after 2-3 cold runs the cache approaches full vocabulary coverage and per-word lookups hit it instantly, so subsequent boots put zero rate-limit pressure on the dictionary API.' },
  DREAM_VOCAB_RETEACH_MS: { p: 'inherited', why: 'The WINDOW\'s existence is a LAW consequence and is well argued — a word counted as taught forever is spaced repetition removed, and the comment names that as a law violation, "cutting shit out of her". The window LENGTH is not derived.' },

  // ── emission / chat ───────────────────────────────────────────────────────
  DREAM_CHAT_COHERENCE_FLOOR: { p: 'inherited', why: '⚠ SELF-ADMITTEDLY UNCALIBRATED. Its own comment says "Env-tunable; calibrate on the live walk" — so 0.10 is a placeholder awaiting a walk that has not happened. The MECHANISM is deliberate: below-floor emission is refused and degraded to a single honest word rather than shipping salad, and gate/probe paths never pass through it.' },
  DREAM_ANNEAL_TEMP: { p: 'config', why: 'An opt-OUT switch, on by default. The annealing it controls is bounded by construction — the factor only ever REDUCES the caller\'s temperature, never raises it — so deterministic gate probes at temperature 0 stay 0 and fully-consolidated exploratory callers fall through to greedy argmax.' },
  DREAM_BC_COMPOUND_COH_MIN: { p: 'inherited', why: 'A 0.2 cosine floor between the top two candidate words. Not derived; a round threshold.' },

  // ── chat, drawing, the eye ────────────────────────────────────────────────
  DREAM_DRAW_CANVAS: { p: 'derived', why: '⭐ THE BEST-PRICED VALUE IN THE CODEBASE — re-measured on a real 260-stroke canvas before it moved. 512²: 452 ms / 277,790 coefficients / 1,085 KB · 1024²: 1,378 ms / 620,295 / 2,424 KB · 2048²: 4,878 ms / 1,295,291 / 5,075 KB. 1024 buys 2x the linear detail for 3x worker time, and `sketch` is PROXIED to the mind-space worker so that time is never an event-loop block. It was raised because 512 was "a stale default nobody re-priced after her schemas started keeping her FULL VECTOR TRACE" — cramming ~260 strokes into 512² is where the fine detail died.' },
  DREAM_CHAT_QPROBE_TIMEOUT_MS: { p: 'derived', why: 'DERIVED as an input-scaled formula rather than a flat number: a 45 s floor — which is the battery\'s own per-question budget, so the two agree by construction — plus 1 s per word past eight, capped at 90 s. The env flag overrides it flat when set.' },
  DREAM_ART_WEIGHT_MIN_GAP_MS: { p: 'set', why: '⭐ EXEMPLARY ESCAPE-HATCH HANDLING, and the comment says every case was checked rather than trusted: unset → NaN >= 0 is false → 60000 the default · =0 → 0 >= 0 is true → limit OFF, exact prior behaviour · =30000 → a 30s gap · =nonsense → NaN >= 0 is false → 60000, the safe default. ⚠ That matters here because this project has shipped an escape hatch documented as "disables the bound" that actually produced the harshest cut possible.' },
  DREAM_LOOKUP_HOLD_MS: { p: 'set', why: 'SET FROM AN OPERATOR COMPLAINT — "im not seeing her lookups any more". The draw was clobbering the lookup frame in about a millisecond, so she now LOOKS at a reference for a beat before drawing it, "paced like a person studying then sketching". The hold window also suppresses the tick\'s random favourite draw so it cannot steal the frame.' },
  DREAM_IMAGINE_DRAW_PROB: { p: 'set', why: 'SET FROM AN OBSERVED STARVATION: "the old grounded-only + 15% version never fired: starved". Raised so imaginative drawing is regular enough to actually SEE while reference drawings stay primary. Fired detached in the background because it may fetch parts and awaiting it would freeze the viewer. Comes from the operator\'s ask that "she needs to imagine too and draw things not always what she sees ... open ended dynamically to infinity".' },
  DREAM_INQUIRE_DEPTH: { p: 'set', why: 'BOUNDED ON PURPOSE, and the reason is stated: "always asking must not become an interrogation". Depth caps at 3, the chain resets when it ends or when nothing in the answer is new to her, and a separate record of what she has already asked in this chain stops her looping on the same word.' },
  DREAM_EYE_TRANSITION_MS: { p: 'set', why: 'A morph duration for the mind\'s-eye swap, with 0 restoring the instant swap. ⭐ The design rule beside it is the valuable part: transitions touch only the DISPLAY, never the imagined-field ring and never the store, because "they are display physics, not memories". Last-wins — a newer publish aborts an older transition mid-flight via a sequence token.' },
  DREAM_ART_RELEARN_GAP_MS: { p: 'set', why: 'Per-concept relearn pacing, set for a specific abuse case named in the comment: "reject-spam must not burn look-ups". Without it, repeatedly rejecting a drawing would spend the look budget re-fetching the same reference.' },
  DREAM_CHAT_IMAGE_PRIORITY_MS: { p: 'set', why: '⭐ A TIME WINDOW RATHER THAN A LOCK, and deliberately so: the client\'s image fetch happens in the browser, out of this process\'s sight, "so there is nothing to release; a lock with no releaser is a lane that never reopens". It is stamped at the exact instant the intent becomes real, server-side, so the look lane can see it even though the fetch itself is remote.' },
  DREAM_DF7_FANOUT_PROPAGATE: { p: 'config', why: 'A SAFETY GATE, off until read fan-out is proven. GPU inner-voice generation routes a bound-propagate READ to donor replicas, and that is only safe once fan-out is verified — "else a stale/unsynced replica makes her think garbage". Turning it on also auto-enables GPU generation, so the two travel together by design.' },
  DREAM_INNERVOICE_GPU_GEN: { p: 'config', why: 'An explicit opt-in for GPU inner-voice generation, which also comes on automatically once read fan-out is proven. Setting it to 0 is the kill-switch that forces the CPU-safe path.' },
  DREAM_INNERVOICE_GPU_GEN_MIN_DONORS: { p: 'inherited', why: 'How many donors must be present before GPU generation is considered. Not derived.' },
  DREAM_INNERVOICE_MAX_NEURONS: { p: 'inherited', why: 'The 2M ceiling is carried over from the earlier inner-voice gate. ⭐ What IS reasoned here is the fix beside it: this version keys on the LIVE proxy-ready flag, which the env-only gate omitted — and that omission "let a still-counted mid-reconnect donor slip through", freezing the box and knocking the donor off. She now goes briefly quiet during a ~25s reconnect instead.' },
  DREAM_SPONTANEOUS_IMG_AROUSAL: { p: 'inherited', why: 'The arousal floor for a spontaneous outward image. The DESIGN is deliberate — a high floor plus a long cooldown plus low probability, "so it\'s a rare mood-driven urge, not spam" — but 0.7 itself is not derived.' },
  DREAM_SPONTANEOUS_IMG_GAP_MS: { p: 'inherited', why: 'A round ~5 minute cooldown on spontaneous images. Part of the rare-not-spam design; the interval is not derived.' },
  DREAM_THOUGHT_CONCEPT_GAP_MS: { p: 'inherited', why: 'A round ~10 minute gap between thought-concept publishes. Not derived.' },
  DREAM_ART_WEIGHT_REPS: { p: 'inherited', why: 'Four reps when a drawing outcome is written back as weight. No comment at the read site and no derivation anywhere.' },
  DREAM_ART_WEIGHT_MAX_PAIRS: { p: 'inherited', why: 'A round 24-pair ceiling on art-weight work. Not derived.' },
  DREAM_ART_WEIGHT_MAX_QUEUE: { p: 'inherited', why: 'A round 24-deep queue bound on the same lane. Not derived.' },
  DREAM_DRAW_STYLE: { p: 'config', why: 'Pins the drawing style. Default is her own hand; `field` and `lineart` stay reachable through options because they are useful for SHOWING WHAT SHE SAW — "they are just not a drawing, and nothing calls them a drawing any more". The env flag exists to pin the old behaviour on a box for comparison.' },
  DREAM_ABLATION_LOG: { p: 'config', why: 'Off by default. Only fires when explicitly running an ablation pass, and is throttled to once per 30s so it can never flood the log.' },
  DREAM_EYE_PROCESS: { p: 'config', why: 'Controls whether the drawing process is published progressively rather than only the finished frame. Gated on a stroke count so trivial sketches do not animate.' },
  DREAM_EYE_SHOW_THOUGHT: { p: 'config', why: 'Off by default. When set, publishes a mind\'s-eye frame for an ungrounded thought as well as a grounded percept. ⚠ Off is the correct default — an unlabelled frame binding to whatever word is current is the exact failure that once made a webcam placeholder become her memory of a word.' },
  DREAM_OWNART_CANVAS: { p: 'inherited', why: 'Canvas size for her own artwork. Not derived at its read site; the reasoned material nearby is about style selection rather than dimensions.' },

  // ── cortical microstructure ───────────────────────────────────────────────
  // ⭐ THESE ARE DERIVED FROM PUBLISHED NEUROANATOMY RATHER THAN FROM A SWEEP,
  // which is a real derivation and a different KIND from a measured threshold.
  // Each names its source in the code; the numbers are the brain's, not ours.
  DREAM_MICROCOLUMNS: { p: 'config', why: 'An enable switch for microcolumn structure, on by default. ⭐ The number inside it IS derived, from anatomy rather than tuning: "Default column size 80 (Mountcastle\'s mid-range estimate)". The mechanism averages within-column voltage so basins ACCUMULATE across 80-120 neurons before motor argmax fires.' },
  DREAM_LAMINATION: { p: 'config', why: 'An enable switch for 6-layer lamination, on by default. Grounded in anatomy: layers are interleaved deterministically within each microcolumn so a column carries the full 6-layer stack, "matches real cortex where columns span all 6 layers vertically". Layer assignment uses neuron position within the column.' },
  DREAM_HUBS: { p: 'config', why: 'An enable switch for hub neurons, on by default. Grounded in anatomy: a sparse high-fanout overlay concentrating "50%+ of cross-region routing through 5% of neurons — matches real-brain attention-network observations". Within-cluster traffic still uses small-world and microcolumn structure.' },
  DREAM_TOPOGRAPHIC: { p: 'config', why: 'A locality switch, and its justification is quantitative anatomy: "real cortex is overwhelmingly local — ~95% of pyramidal-cell synapses land within 500 μm, matching a fixed-fanout topology more closely than uniform random global connectivity". Left as an opt-in flag so existing small-scale deployments keep their richer recurrent connectivity.' },
  DREAM_SMALL_WORLD: { p: 'config', why: 'Small-world wiring, on for clusters of 2K or more. Opt-out exists for backward-compatibility with older pure-random training. ⚠ The topographic flag wins over it when set, being the more aggressive locality bias for the biological-scale path.' },
  DREAM_PREDICTIVE_CODING: { p: 'config', why: 'An enable switch, on by default, citing Friston 2010 free-energy. The error is computed at the start of each step and used both to modulate Hebbian rate (high error means more learning) and to drive ascending feedback up the hierarchy. Allocated lazily on first step so non-cortex clusters waste nothing.' },
  DREAM_THETA_GAMMA: { p: 'config', why: 'An enable switch for theta-gamma nesting. ⭐ Its periods are derived from real frequencies rather than chosen: at ~1ms per tick, "Theta = 6Hz → 167 ticks/cycle. Gamma = 40Hz → 25 ticks/cycle". The mechanism organises information flow into theta packets carrying intra-packet gamma bursts.' },

  // ── saturation, drive, generation ─────────────────────────────────────────
  DREAM_SM_WMAX: { p: 'derived', why: 'DERIVED BY BISECTION — the comment calls 0.4 "the bisected value", so the ceiling was searched for rather than picked. It caps sem_to_motor and sem_to_word_motor weights only, and is the secondary lever to the LR damping: the documented order is to try LR damping first and reach for this while watching the saturation health readout if meanCos does not clear.' },
  DREAM_COHERENCE_MIN: { p: 'derived', why: 'Has a full derivation in docs/THRESHOLD-DERIVATION.md — and that entry opens with a warning worth carrying: ⛔ "THREE different constants share this name, with three different values". Check which one a call site means before quoting a number for it.' },
  DREAM_SURPRISE_MAX: { p: 'set', why: 'SET INSTRUMENT-FIRST, which is why it is a knob at all. The default 1.5 is "today\'s behaviour, byte-identical" — nothing changed when it shipped. What shipped WITH it is the gate\'s own distribution, so the next run can answer "is novelty being throttled?" with a number instead of an opinion. ⭐ The stated test is explicit: if atCeilingPct comes back near zero the ceiling was never the constraint and raising it would have done nothing.' },
  DREAM_NOISE_GATE: { p: 'config', why: 'An opt-OUT switch whose default is argued rather than assumed: "ON by default — this is coded-right, not test-tuned". The argument is that the gate is BOUNDED (worst case it damps a boost toward the always-learning 0.5 floor, never below), self-regulating from the saturation detector, and multiplicative with the always-on saturation clamp. Setting it to 0 exists to A/B against plain predictive coding.' },
  DREAM_GEN_PROPAGATE_CHUNKED: { p: 'set', why: 'DEFAULT FLIPPED ON, and the argument is that it changes nothing mathematically: the chunked path "is IDENTICAL MATH that yields between row slices, so the only thing flipping this default changes is whether the loop can breathe during that work" — which is precisely the failure the inner-voice gate was built to dodge. It makes the CPU fallback survivable rather than loop-fatal.' },
  DREAM_BCM: { p: 'config', why: 'An enable switch, off by default. ⭐ The reasoning recorded here is architectural rather than numeric, and it is a good rule: it resolves ONCE into a property because two separate sites read it (one decides whether to call, the other guards the body), and "a lazy resolve at one of them would leave the other to drift". One assignment, both readers agree.' },
  DREAM_INNERVOICE_FORCE_CPU: { p: 'config', why: 'A debug override forcing the CPU path, unset by default. ⚠ It REQUIRES the GPU proxy to be meaningful: with no writeCurrentSlice there is nowhere else for the pattern to go, so the CPU write stays authoritative and is never skipped. Small and browser instances are unaffected.' },
  DREAM_TICK_BREATHE_MS: { p: 'inherited', why: 'A yield interval so the loop "just stops going deaf while she uses it". The need is reasoned; the interval is not derived.' },
  DREAM_SAT_MEANABS: { p: 'inherited', why: 'Same provenance as the other saturation thresholds: the block\'s comment states these are "conservative defaults match prior hardcoded values; env vars only deviate when empirical 20hr-test data justifies a shift". That data has never been gathered, so 0.6 is the number it always was.' },
  DREAM_SAT_RATIO: { p: 'inherited', why: 'Carried forward with the other saturation thresholds, awaiting the empirical 20-hour data its own block says would justify moving it. 1.5 is unexamined rather than wrong.' },
  DREAM_SAT_SAMPLE: { p: 'inherited', why: 'How many matrix rows the saturation health check samples. 1000 is not derived — and the trade it sits on is real: a larger sample is a more trustworthy verdict and a slower one.' },

  // ── vision, art, the mind's eye ───────────────────────────────────────────
  DREAM_JPEG_MAX_MB: { p: 'derived', why: 'MEASURED against the real corpus: "11 of 30 corpus figures refused at 512". Wikimedia serves archival masters averaging 2.2 MP with many far larger, and jpeg-js counts its own working set generously, so a real illustration came back as "decode failed: maxMemoryUsageInMB limit exceeded" and was recorded as UNDECODABLE — reading as a broken file when it was a ceiling we chose. Raised to 2048 and left env-tunable so a small box can put it back without editing code.' },
  DREAM_REF_FETCH_TIMEOUT_MS: { p: 'derived', why: 'DERIVED from a live failure on the box, 2026-07-17: EVERY reference fetch was aborting while Pollinations itself answered in ~2.5s. Root cause measured — the box\'s uplink sits at 16-19MB buffered under the teach-pattern flood, which starves other connections past 25s. Raised 25s to 60s so fetches land in the drain windows. The fetch is fire-and-forget, so the longer wait blocks nothing.' },
  DREAM_VM_CAP: { p: 'derived', why: 'SIZED AGAINST A STATED TARGET. The operator put full training at ~10k concepts ("the more the better"), so the cap went 4,096 to 25,000 — 2.5x that target. With sqlite as the medium the DISK does not care; this cap is the RAM bound on the hot in-memory Map, estimated at ~10KB an entry so 25k is ~250MB beside a brain sharing the box.' },
  DREAM_VM_MAX_MB: { p: 'derived', why: '⭐ THIS ONE EXISTS BECAUSE THE COUNT-BASED CAP BESIDE IT WAS WRONG, and its comment says so: "a count is only a RAM bound when every entry is the same size — and this file\'s own estimate of ~10 KB an entry is off by roughly 50x for a full-resolution figure field." The residency bound is BYTES because bytes are the resource; VM_CAP survives only as a secondary count guard. Disk holds everything and is deliberately not bounded here.' },
  DREAM_REF_RENDER_PX: { p: 'set', why: 'RAISED DELIBERATELY, 256² to 512², with the cost checked first: one reference fetch per 10 minutes brain-wide is unchanged, so a bigger render costs no extra quota. The reasoning is that the ONE look she gets should carry enough detail to learn an appearance from.' },
  DREAM_REF_FETCH_GAP_MS: { p: 'set', why: 'SET TO 0 — the global look budget was REVOKED on the operator\'s word ("its the anonymous free"). The per-concept 6h cooldown is kept, but as de-duplication rather than rate limiting. Natural pacing now comes from the in-flight guard and the 2-60s a look actually takes.' },
  DREAM_VM_RECALL_COOLDOWN_MS: { p: 'set', why: 'SET FROM AN OBSERVED FAILURE: without it a frequently-thought concept re-showed the same memory every daydream tick and "took all the time" of the viewer. A recalled entry now rests ~3min before it can be SHOWN again, and while everything matched is resting recall reports a MISS so the caller falls through to sketch or de-novo — she draws or daydreams instead of re-staring.' },
  DREAM_OWNART_INGEST_MS: { p: 'set', why: 'A DESIGN RULING, quoted in place: "a cost gate that resolves to never is not a bound, it is a deletion." The old gate could disable the capability entirely; the throttle replaced it so the cost is carried by SPACING instead — normal spacing when she is idle, wider mid-walk so the walk keeps priority without the capability disappearing.' },
  DREAM_OWNART_INGEST_WALK_MS: { p: 'set', why: 'The mid-walk half of the same ruling — a wider spacing while the walk runs, so the walk keeps its priority and the ingest capability still exists rather than being gated to never.' },
  DREAM_REF_MAXSIDE: { p: 'config', why: 'An OPT-IN downscale for a constrained box, default 0 meaning full resolution. The transform runs on the GPU or the mind-space worker, never the main loop, so the ~1.9s full-resolution pass is worker time rather than a loop block. ⭐ When it does engage it SAYS SO once a minute, because "a percept quietly degraded is exactly the class of silent loss this file already carries scars from".' },
  DREAM_FIGDRAIN_MS: { p: 'config', why: 'A pace tuner where 0 disables the lane and says so. The design around it is the reasoned part: one figure per tick, never batched, on an unref\'d timer, because the whole point is to stop figure work pinning the loop it shares with the teach lane.' },
  DREAM_REF_MIN_DETAIL: { p: 'inherited', why: 'A near-uniformity floor catching "a blank plate or a failed decode wearing a valid shape". The comment is explicit that it is the SAME floor the reference lane uses — copied for consistency rather than derived here.' },
  DREAM_PERCEPT_GROUND_MAX_QUEUE: { p: 'inherited', why: 'The BEHAVIOUR is reasoned and matches every other drain producer: a percept that cannot find room is DROPPED AND COUNTED rather than queued forever, because a stale percept is worth less than a fresh one and this queue must never pin the walk. The depth of 16 is not derived.' },
  DREAM_VM_RELATE_MAX_PAIRS: { p: 'inherited', why: 'A round 24-pair ceiling on relate work. Not derived.' },
  DREAM_VM_RELATE_MAX_QUEUE: { p: 'inherited', why: 'A round 24-deep queue bound on the same lane. Not derived.' },
  DREAM_REF_FETCH_COOLDOWN_MS: { p: 'inherited', why: 'A 6-hour per-concept cooldown, carried with no derivation at its read site. Its ROLE was later clarified when the global budget was revoked: this is de-duplication, not rate limiting.' },

  // ── hebbian / ranges ──────────────────────────────────────────────────────
  DREAM_SM_LR_SCALE: { p: 'inherited', why: 'A round halving (0.5) applied as saturation prevention on the sem→motor and sem→word_motor rates, with 1.0 restoring undamped behaviour. Scoped deliberately — letter_to_phon, letter_to_motor and motor_to_sem comprehension are untouched. The scope is reasoned; the 0.5 is not derived.' },
  DREAM_RANGE_MAX_RUNS: { p: 'inherited', why: '⚠ SELF-ADMITTEDLY UNPRICED, and unusually honest about it. Its own comment states "WHICH ONE IS TRUE IS UNKNOWN, and rangesRunsOkMax cannot say — it is a MAX, and a max cannot price a cap", noting that is the third time that shape has bitten. The cap of 16 stands because the alternatives were never measured.' },
};

// ─── Discovery ───────────────────────────────────────────────────────────────
//
// ⛔⛔ THE HAND-WRITTEN LIST ABOVE IS 30 KNOBS AND THE BRAIN READS 190. Shipping
// only the 30 would have made this panel the very thing it exists to prevent:
// a complete-looking instrument over a sixth of the truth. The operator's ask
// was *"all the knobs"*, and 30 is not all of them.
//
// ⭐ SO THE REST ARE DISCOVERED FROM THE SOURCE THE PROCESS IS RUNNING, and
// each one's description is the CODE COMMENT AT ITS OWN READ SITE. That is
// evidence rather than invention — hand-typing 163 descriptions would have
// produced 163 confident guesses, which is worse than an honest extract.
//
// ⚠ A DISCOVERED KNOB IS ALWAYS `???`. Effect class is never inferred here:
// the scanner that tried to infer it classified two module-scope constants as
// live and was discarded. Discovery answers "does this knob exist and what is
// it set to", never "would a write work".
//
// ⚠ Hand-written entries WIN on merge, so improving one is a matter of adding
// it to `KNOBS` — the discovered row then disappears rather than duplicating.
const fs = require('fs');
const path = require('path');

const SCAN_ROOTS = ['js', 'server'];
// `process.env.X`, `process.env['X']`, and the optional-chaining variants.
const ENV_RE = /process(?:\?)?\.env(?:\?)?(?:\.([A-Z0-9_]+)|\[\s*['"]([A-Z0-9_]+)['"]\s*\])/g;

let _discovered = null;

/** The comment block immediately above a line, as the closest thing to an
 *  authored description that actually exists in the codebase. */
function commentAbove(lines, idx) {
  const out = [];
  for (let i = idx - 1; i >= 0 && out.length < 8; i--) {
    const t = lines[i].trim();
    if (t.startsWith('//')) { out.unshift(t.replace(/^\/\/\s?/, '')); continue; }
    if (t.startsWith('*')) { out.unshift(t.replace(/^\*\s?/, '')); continue; }
    if (t.startsWith('/*') || t.startsWith('/**')) { out.unshift(t.replace(/^\/\*+\s?/, '')); continue; }
    break;
  }
  // ⚠ These comments are written in the same emphatic markdown the docs use, and
  // a tooltip renders plain text — `**like this**` would show its asterisks.
  // Stripped here rather than in the page, so every consumer of the registry
  // gets text it can display as-is.
  return out.join(' ')
    .replace(/\*\*/g, '').replace(/`/g, '')
    .replace(/\s+/g, ' ').trim();
}

/** A literal default sitting beside the read, e.g. `|| 40` or `: 45000`. */
function defaultBeside(line) {
  const m = line.match(/(?:\|\||\?\?)\s*([0-9]*\.?[0-9]+)/)
    || line.match(/:\s*([0-9]*\.?[0-9]+)\s*[;,)]/);
  return m ? m[1] : null;
}

/**
 * Group a knob by its name, so ~190 rows arrive already sorted into subjects.
 *
 * ⚠ MATCHED ANYWHERE IN THE NAME, NOT ONLY AT THE FRONT. A prefix-only version
 * of this put 93 of 193 knobs into "Other" — a bucket holding half the list is
 * not a grouping, it is an unsorted list with a label. `DREAM_SAVE_MIN_FREE_
 * DISK_MB` leads with SAVE, but `DREAM_MAX_REPLAY_NNZ` does not lead with
 * anything, and both need a home.
 *
 * ⚠ ORDER IS SIGNIFICANT — the first match wins, so the most specific subjects
 * are tested first. Consolidation before replay, saturation before rate.
 */
function groupFor(key) {
  const t = key.replace(/^DREAM_/, '');
  const has = (re) => re.test(t);
  if (has(/CONSOLIDAT|REPLAY|SLEEP|DREAM_CYCLE|SCHEMA|TIER/)) return 'Consolidation & replay';
  if (has(/\bSAT_|SATUR|COHEREN|BCM|RECTIFY|NORMALI/)) return 'Saturation & coherence';
  if (has(/GPU|DF7|DONOR|CSR|WEBGPU|SHADER|CUDA|VRAM|DEVICE|POD|RUNPOD|MIRROR|REPLICA|DELTA/)) return 'GPU & donor';
  if (has(/CHAT|EMIT|VOICE|VOX|SPEAK|PIPER|TTS|UTTER|REPLY|WORD_MOTOR|LANG|GRAMMAR|SENTENCE|PHON/)) return 'Chat, emission & language';
  if (has(/ART|VM_|MEYE|MIND|PAINT|LOOK|FIG|IMAGE|CAMERA|VISION|DRAW|PRACTICE|POLLIN|CANVAS|WAVELET|FIELD/)) return 'Vision, art & the mind\'s eye';
  if (has(/SAVE|CHECKPOINT|WEIGHTS|BLOB|PERSIST|RESTORE|STATE|DISK|SQLITE|DB_/)) return 'Persistence & checkpoints';
  if (has(/GATE|BATTERY|EXAM|STUDENT|CELL_PASS|SCORE|CUT|PROBE|DRILL|ASSESS|QUESTION/)) return 'Gates & assessment';
  // ⭐ The cortical-microstructure switches are a real subject, not leftovers:
  // lamination, microcolumns, hub neurons, small-world wiring, topographic
  // projection, predictive coding, global-workspace ignition. They were landing
  // in "Other" because none of their names share a prefix with anything.
  if (has(/HUBS|MICROCOLUMN|SMALL_WORLD|TOPOGRAPHIC|LAMINA|LAYER|COLUMN|PREDICTIVE_CODING|GW_IGNITION|WORKSPACE/)) return 'Cortical microstructure';
  if (has(/LOOP|CPU|PROFILE|WATCHDOG|FREEZE|STALL|TIMEOUT|DEADLINE|HEARTBEAT|LAG|BREATHE|SUBSTEPS|DEBOUNCE|TTL/)) return 'Watchdogs & timing';
  if (has(/BUDGET|MAX|MIN|CAP|LIMIT|MB\b|NNZ|HEAP|RAM|MEM/)) return 'Bounds & budgets';
  if (has(/\bLR\b|_LR|REPS|DOSE|TRICKLE|TEACH|PHASE|STRUCTURE|REHEARS|VOCAB|DEF_|DEFINITION|CURRIC|GRADE|WALK|CORPUS/)) return 'Teaching & schedule';
  if (has(/FIRING|PSI|ANNEAL|NOISE|SPIKE|VOLT|DRIVE|GAIN|THETA|GAMMA|ATTENT/)) return 'Firing & drive';
  if (has(/WS_|SOCKET|HTTP|PORT|AUTH|CORS|NGINX|NET|FETCH|REQUEST/)) return 'Network & serving';
  return 'Other';
}

/**
 * ⭐ A THIRD DESCRIPTION SOURCE: `docs/ADMIN-CONTROLS.md` already documents 89
 * of these knobs in an authored table, and 47 of them are knobs whose read site
 * carries no comment at all. That is real authored text sitting in the repo
 * going unused — pulling it in beats leaving a row blank, and beats writing a
 * second description that could drift from it.
 *
 * ⚠ Read once, best-effort. The doc missing or moving degrades a description to
 * the read-site comment; it can never break the panel.
 */
let _docDescs = null;
function docDescriptions() {
  if (_docDescs) return _docDescs;
  _docDescs = new Map();
  try {
    const p = path.resolve(__dirname, '..', 'docs', 'ADMIN-CONTROLS.md');
    const txt = fs.readFileSync(p, 'utf8');
    // | `KEY` | default | kind | what it does |
    const re = /^\|\s*`(DREAM_[A-Z0-9_]+)`\s*\|([^|]*)\|([^|]*)\|(.*)\|\s*$/;
    for (const ln of txt.split(/\r?\n/)) {
      const m = ln.match(re);
      if (!m) continue;
      // Strip the markdown the tooltip cannot render — it is plain text there.
      const what = m[4].replace(/\*\*/g, '').replace(/`/g, '').trim();
      const dflt = m[2].replace(/[✅⚠⛔*`]/g, '').trim();
      if (what) _docDescs.set(m[1], { what, dflt });
    }
  } catch { /* the doc is a bonus, never a dependency */ }
  return _docDescs;
}

function discover() {
  if (_discovered) return _discovered;
  const found = new Map();
  const files = [];
  const walk = (d) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs|cjs)$/.test(e.name) && !e.name.includes('.bundle.')) files.push(p);
    }
  };
  // The repo root is one level above `server/`.
  const root = path.resolve(__dirname, '..');
  for (const r of SCAN_ROOTS) walk(path.join(root, r));

  for (const f of files) {
    let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (!txt.includes('DREAM_')) continue;
    const lines = txt.split(/\r?\n/);
    const rel = path.relative(root, f).replace(/\\/g, '/');
    lines.forEach((ln, i) => {
      ENV_RE.lastIndex = 0;
      for (const m of ln.matchAll(ENV_RE)) {
        const key = m[1] || m[2];
        if (!key || !key.startsWith('DREAM_')) continue;
        if (found.has(key)) continue;                 // first read site wins
        // ⚠ DESCRIPTION PRECEDENCE, most-authored first: the comment sitting
        // directly above the read is the closest thing to intent expressed at
        // the point of use; failing that, the admin-controls table is authored
        // prose about this exact knob; failing both, the row SAYS it has no
        // description. **Never a sentence assembled from the knob's name** —
        // that reads as documentation and is really just the name again.
        const above = commentAbove(lines, i);
        const doc = docDescriptions().get(key);
        found.set(key, {
          key,
          group: groupFor(key),
          dflt: defaultBeside(ln) || (doc && doc.dflt) || '—',
          effect: '???',
          site: `${rel}:${i + 1}`,
          proof: 'discovered by scanning the running source; read-site scope not verified',
          what: above
            || (doc && `${doc.what}  [from docs/ADMIN-CONTROLS.md]`)
            || 'No description yet — no comment at the read site and no row in docs/ADMIN-CONTROLS.md.',
          discovered: true,
          described: !!(above || doc),
        });
      }
    });
  }
  _discovered = found;
  return found;
}

/**
 * Markdown → the plain text a tooltip can actually show. One place, applied to
 * every description whatever wrote it.
 */
function plain(s) {
  return String(s == null ? '' : s)
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the publishable knob block.
 *
 * ⚠ EVERY FIELD HERE IS A FACT THE PROCESS ALREADY HAD. `value` is what
 * `process.env` holds right now; `overridden` says whether the environment set
 * it at all; `effective` is what the code will actually use. Nothing is
 * inferred, and nothing reports a health it cannot know.
 */
function knobState() {
  const groups = new Map();
  let overridden = 0, boot = 0, unproven = 0, described = 0;

  // ⛔⛔ THE SITE IS RESOLVED AT RUNTIME, BECAUSE HARDCODED LINE NUMBERS GO
  // STALE THE MOMENT THE FILE IS EDITED — AND THEY DID.
  //
  // The hand-written entries above originally carried `file:line`. After a day
  // of editing `curriculum.js`, `DREAM_CONTENT_LR`'s recorded line pointed at a
  // bare `}` and `DREAM_REP_COMPRESS`'s pointed into the middle of a comment.
  // ⚠ **The panel renders `site` as EVIDENCE for the effect class**, so a stale
  // line is not a cosmetic drift — it is a citation to the wrong code, on the
  // one field a reader would use to check the claim.
  //
  // ⭐ Discovery already locates every knob's CURRENT read site by scanning the
  // running source, so the hand-written `site` is overridden with it whenever
  // discovery found one. Hand-written entries now record only the FILE; the
  // line is always resolved fresh and can never rot again.
  const _disc = (() => { try { return discover(); } catch { return new Map(); } })();
  const all = [...KNOBS].map((k) => {
    const d = _disc.get(k.key);
    return d && d.site ? { ...k, site: d.site } : k;
  });
  const byKey = new Set(KNOBS.map((k) => k.key));
  let discoveredCount = 0;
  try {
    for (const [key, k] of discover()) {
      if (byKey.has(key)) continue;
      all.push(k); discoveredCount++;
    }
  } catch { /* discovery must never be able to break the state publish */ }

  for (const k of all) {
    const raw = (process.env && Object.prototype.hasOwnProperty.call(process.env, k.key))
      ? String(process.env[k.key]) : null;
    const isSet = raw !== null && raw !== '';
    if (isSet) overridden++;
    if (k.effect === 'boot') boot++;
    if (k.effect === '???') unproven++;
    // A knob counts as described if it was hand-written OR discovery found real
    // authored text for it. `undescribed` is what the panel prints as its own
    // completeness — a row with no description says so, and the total says how
    // many there are.
    if (!k.discovered || k.described) described++;
    if (!groups.has(k.group)) groups.set(k.group, []);
    groups.get(k.group).push({
      key: k.key,
      value: raw,
      overridden: isSet,
      discovered: !!k.discovered,
      // ⚠ `effective` is the DEFAULT string when unset, and the default string
      // is copied from the read site. It is what the code uses, not a guess.
      effective: isSet ? raw : k.dflt,
      dflt: k.dflt,
      effect: k.effect,
      site: k.site,
      proof: k.proof,
      // ⭐ WHICH KNOB IS WHICH. `provenance` says whether this number was chosen
      // deliberately, computed, merely inherited, or derived-then-outdated;
      // `why` carries the reasoning so the readout explains itself instead of
      // being a wall of numbers. A discovered knob gets `unknown` — absence of a
      // recorded reason is itself the answer, and is not dressed up as one.
      // ⚠ A hand-written entry's own provenance wins; otherwise the PROVENANCE
      // table supplies it for a discovered knob. Absence of both is `unknown`,
      // and that is a real answer rather than a gap dressed up as one.
      provenance: k.provenance || (PROVENANCE[k.key] && PROVENANCE[k.key].p) || 'unknown',
      setOn: k.setOn || null,
      why: plain(k.why || (PROVENANCE[k.key] && PROVENANCE[k.key].why) || '') || null,
      // ⛔ MARKDOWN IS STRIPPED AT THIS ONE EXIT, NOT AT EACH SOURCE. The three
      // description sources — hand-written entries, read-site comments and the
      // admin-controls table — are all written in the same emphatic markdown,
      // and a tooltip renders plain text, so `**like this**` would show its
      // asterisks. Stripping it per source meant fixing it three times and
      // missing the fourth; the render harness caught exactly that, on a
      // hand-written row, after the other two had been done.
      what: plain(k.what),
    });
  }
  // Groups sorted by size so the biggest subjects lead, and knobs sorted by
  // name inside each so a key can be found by eye in a 190-row list.
  for (const list of groups.values()) list.sort((a, b) => a.key.localeCompare(b.key));

  // Provenance tallies, so the page can lead with "how many of these numbers
  // does anyone have a reason for" rather than only "how many exist".
  //
  // ⛔ COUNTED OFF THE RESOLVED ROWS, NOT THE RAW ENTRIES. The first version
  // read `k.provenance` straight from the source entry, which is undefined for
  // every discovered knob — so the PROVENANCE table populated the rows while the
  // headline still reported "186 with no recorded reason". **A summary computed
  // from different data than the rows it summarises is the instrument lying
  // about its own contents**, which is precisely what this panel exists to catch.
  const prov = { set: 0, derived: 0, config: 0, inherited: 0, stale: 0, unknown: 0 };
  for (const g of groups.values()) {
    for (const row of g) prov[row.provenance] = (prov[row.provenance] | 0) + 1;
  }

  return {
    total: all.length,
    provenance: prov,
    // ⭐ `described` vs `discovered` is the honest completeness measure of this
    // panel and is published so the page can print it. A hand-written entry has
    // an authored description and a verified effect class; a discovered one has
    // its read site and whatever comment sits above it, and says so.
    described,
    discovered: discoveredCount,
    overridden,
    boot,
    unproven,
    // ⛔ Writes are NOT implemented, and the panel says so rather than drawing a
    // control that would not work. A `boot` knob could never honour one anyway,
    // and an unproven knob must not be offered one on a guess.
    writable: false,
    writeNote: 'read-only — a write lane needs every effect class proven first, and a boot-frozen knob must refuse rather than accept',
    groups: [...groups.entries()].map(([name, knobs]) => ({ name, knobs })),
  };
}

module.exports = { KNOBS, knobState };
