'use strict';

/**
 * ⭐⭐ THE KNOB REGISTRY — every training / weight / saturation knob the brain
 * reads, with its LIVE value, its default, and whether a write to it can
 * actually take effect.
 *
 * The arrangement: every knob is surfaced in the teach view, and they are set,
 * adjusted, monitored and kept correct from there as the brain is tested.
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

  // ══ EFFECT CLASSES, batch 5: the last 48, across twelve files ═════════════
  //
  // ⛔⛔ `cluster.js` IS WHY INDENTATION WAS NEVER GOING TO WORK, and it is the
  // file the two failed classifiers both stumbled on. Three different shapes
  // live at similar indents:
  //   • `const COHERENCE_MIN = (() => { … process.env … })()` — the read sits
  //     at indent 4 and is **module scope**, because the IIFE around it is.
  //   • nine reads at indent 6 inside `constructor(name, size, opts)`.
  //   • reads at indent 6-14 inside `stepAwait()` / `injectEmbeddingToRegion()`.
  // Indentation is identical across all three; only the enclosing construct
  // decides, and it was read for every one of them.
  //
  // ⭐⭐ A CONSTRUCTOR READ IS `boot`, AND CALLING IT `live` WOULD BE THE
  // DANGEROUS ANSWER. The value is captured when the cluster is CONSTRUCTED;
  // existing clusters keep theirs, and a running brain never re-runs it. So a
  // write is accepted, reads back, and changes nothing — which is precisely the
  // silent failure this column exists to warn about. **The nine microstructure
  // switches (`DREAM_SMALL_WORLD`, `DREAM_LAMINATION`, `DREAM_HUBS`, …) are all
  // of this kind: they shape the brain that gets BUILT, not the one running.**
  { key: 'DREAM_COHERENCE_MIN', effect: 'boot', group: 'Brain dynamics', proof: 'read at indent 4 but INSIDE the module-scope IIFE `const COHERENCE_MIN = (() => …)()` (cluster.js:229) — scope read 2026-09-03' },
  { key: 'DREAM_TOPOGRAPHIC', effect: 'boot', group: 'Brain dynamics', proof: 'read in `constructor(name, size, opts)` — captured at cluster construction' },
  { key: 'DREAM_SMALL_WORLD', effect: 'boot', group: 'Brain dynamics', proof: 'read in `constructor(…)` — captured at cluster construction' },
  { key: 'DREAM_MICROCOLUMNS', effect: 'boot', group: 'Brain dynamics', proof: 'read in `constructor(…)` — captured at cluster construction' },
  { key: 'DREAM_LAMINATION', effect: 'boot', group: 'Brain dynamics', proof: 'read in `constructor(…)` — captured at cluster construction' },
  { key: 'DREAM_HUBS', effect: 'boot', group: 'Brain dynamics', proof: 'read in `constructor(…)` — captured at cluster construction' },
  { key: 'DREAM_THETA_GAMMA', effect: 'boot', group: 'Brain dynamics', proof: 'read in `constructor(…)` — captured at cluster construction' },
  { key: 'DREAM_PREDICTIVE_CODING', effect: 'boot', group: 'Brain dynamics', proof: 'read in `constructor(…)` — captured at cluster construction' },
  { key: 'DREAM_BCM', effect: 'boot', group: 'Brain dynamics', proof: 'read in `constructor(…)` into `this._bcmEnabled` — captured at construction' },
  { key: 'DREAM_SM_WMAX', effect: 'boot', group: 'Brain dynamics', proof: 'read in `constructor(…)` — captured at cluster construction' },
  { key: 'DREAM_INNERVOICE_FORCE_CPU', effect: 'live', group: 'Speech & emission', proof: 'read in `injectEmbeddingToRegion(…)`, NOT the constructor — the constructor closes at cluster.js:1362 (checked 2026-09-03)' },
  { key: 'DREAM_SURPRISE_MAX', effect: 'live', group: 'Brain dynamics', proof: 'read in `buildKScalesForProjection(…)` — per projection build' },
  { key: 'DREAM_TICK_BREATHE_MS', effect: 'live', group: 'Brain dynamics', proof: 'read in `async stepAwait(dt)`; the `!== undefined` tests the env STRING, not a memo — per tick' },
  { key: 'DREAM_GEN_PROPAGATE_CHUNKED', effect: 'live', group: 'Brain dynamics', proof: 'read in `async stepAwait(dt)` — per tick' },
  // definition-service.js + kindergarten.js — column-0 top-level consts
  { key: 'DREAM_DEF_CACHE_CAP', effect: 'boot', group: 'Memory & consolidation', proof: 'column-0 `const CACHE_MAX = …` — once at import' },
  { key: 'DREAM_DEFINITION_CACHE_FILE', effect: 'boot', group: 'Memory & consolidation', proof: 'column-0 `const _envCachePath = …` — once at import' },
  { key: 'DREAM_GATE_PROD_MIN', effect: 'boot', group: 'Curriculum, gates & schedule', proof: 'column-0 `const K_GATE_PROD_MIN = _kGateEnvNum(…)` — once at import' },
  { key: 'DREAM_GATE_PATH_MIN', effect: 'boot', group: 'Curriculum, gates & schedule', proof: 'column-0 `const K_GATE_PATH_MIN = _kGateEnvNum(…)` — once at import' },
  { key: 'DREAM_VOCAB_RETEACH_MS', effect: 'live', group: 'Teaching dose & repetition' },
  { key: 'DREAM_KEEP_STATE', effect: 'live', group: 'Persistence & checkpoints' },
  // the rest, one per file
  { key: 'DREAM_CHAT_MAX_WORDS', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_WORD_MOTOR_VOCAB_CAP', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_FIGURE_FIELDS_DIR', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_MINDSEYE_MAX_SIDE', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_GW_IGNITION', effect: 'live', group: 'Brain dynamics' },
  { key: 'DREAM_CSR_FREE_MIN_MB', effect: 'live', group: 'Watchdogs, bounds & safety' },
  { key: 'DREAM_SAVE_MIN_FREE_DISK_MB', effect: 'live', group: 'Persistence & checkpoints' },
  { key: 'DREAM_SAVE_MIN_FREE_MB', effect: 'live', group: 'Persistence & checkpoints' },
  { key: 'DREAM_BC_COMPOUND_COH_MIN', effect: 'live', group: 'Brain dynamics' },
  // brain-server.js — the 19 batch 1 deliberately left, now read
  { key: 'DREAM_NO_HEAP_REEXEC', effect: 'boot', group: 'Watchdogs, bounds & safety', proof: 'top-level re-exec branch at brain-server.js:100 — evaluated once, before anything else' },
  { key: 'DREAM_HEAP_REEXECED', effect: 'boot', group: 'Watchdogs, bounds & safety', proof: 'same top-level re-exec branch — the guard that stops an infinite re-exec loop' },
  { key: 'DREAM_RESPECT_VRAM_CAP', effect: 'boot', group: 'GPU & donor', proof: 'inside the top-level RESOURCES/VRAM sizing block — once at boot' },
  { key: 'DREAM_DONOR_FIT_MB', effect: 'boot', group: 'GPU & donor', proof: 'inside the top-level RESOURCES sizing block — once at boot' },
  { key: 'DREAM_LANG_VRAM_RESERVE_MB', effect: 'boot', group: 'GPU & donor', proof: 'inside the module-scope `const BRAIN_VRAM_ALLOC = (function(){…})()` IIFE' },
  { key: 'DREAM_SUBSTEPS_NATIVE', effect: 'boot', group: 'Brain dynamics', proof: 'inside the module-scope `_SUBSTEPS_NATIVE_AUTO` const expression' },
  { key: 'DREAM_FORCE_CLEAR', effect: 'live', group: 'Persistence & checkpoints', proof: 'read inside `autoClearStaleState()` — re-read whenever that runs' },
  { key: 'DREAM_READBACK_STOP_BUDGET_MS', effect: 'live', group: 'GPU & donor', proof: 'read inside `async _readbackBeforeStop(reason)`' },
  { key: 'DREAM_LANG_RAM_FRACTION', effect: 'live', group: 'Speech & emission', proof: 'read inside `async _initLanguageSubsystem()`' },
  { key: 'DREAM_LANG_CORTEX', effect: 'live', group: 'Speech & emission', proof: 'read inside `async _initLanguageSubsystem()`' },
  { key: 'DREAM_LANG_UNPIN', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_NO_PRIMARY_WATCHDOG_MS', effect: 'live', group: 'Watchdogs, bounds & safety' },
  { key: 'DREAM_UPLOAD_WATCHDOG_MS', effect: 'live', group: 'Watchdogs, bounds & safety' },
  { key: 'DREAM_REUPLOAD_DEBOUNCE_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_WEIGHTS_PAIR_TOL_SEC', effect: 'live', group: 'Persistence & checkpoints' },
  { key: 'DREAM_NO_DONOR_ID_EVICT', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_PROMOTE_COOLDOWN_S', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_HB_BUF_FORGIVE_MB', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_LOOP_FREEZE_WARN_MS', effect: 'boot', group: 'Watchdogs, bounds & safety', proof: 'passed into the watchdog worker at construction — the worker keeps the value it was started with' },

  // ══ EFFECT CLASSES, batch 4: `chat.js` (26) + `visual-memory.js` (16) ═════
  //
  // `chat.js` is a mixin body — all 26 reads sit inside methods, 0 cache-guard
  // candidates, so all `live`. `visual-memory.js` is the first file in this
  // sweep that MIXES the two: **three column-0 `const` declarations, read and
  // confirmed one by one**, and thirteen in-method reads.
  //
  // ⛔ THOSE THREE ARE THE ONES THAT MATTER MOST TO GET RIGHT, because they are
  // the store's RAM and image bounds — `DREAM_VM_CAP` (25,000 entries),
  // `DREAM_VM_MAX_MB` and `DREAM_REF_MAXSIDE`. **A write to any of them on a
  // running brain does nothing**, and the panel previously said `???` rather
  // than saying so.
  { key: 'DREAM_VM_CAP', effect: 'boot', group: 'Vision & imagination', proof: 'column-0 `const VM_CAP = …` — top-level, evaluated once at import (read 2026-09-03)' },
  { key: 'DREAM_VM_MAX_MB', effect: 'boot', group: 'Vision & imagination', proof: 'column-0 `const VM_BYTES = …` — top-level, once at import (read 2026-09-03)' },
  { key: 'DREAM_REF_MAXSIDE', effect: 'boot', group: 'Vision & imagination', proof: 'column-0 `const REF_MAXSIDE = …` — top-level, once at import (read 2026-09-03)' },
  { key: 'DREAM_VM_RELATE_MAX_QUEUE', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_VM_RELATE_MAX_PAIRS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_OWNART_INGEST_MS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_OWNART_INGEST_WALK_MS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_PERCEPT_GROUND_MAX_QUEUE', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_VM_RECALL_COOLDOWN_MS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_REF_FETCH_GAP_MS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_REF_FETCH_COOLDOWN_MS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_REF_MIN_DETAIL', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_REF_FETCH_TIMEOUT_MS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_JPEG_MAX_MB', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_FIGDRAIN_MS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_REF_RENDER_PX', effect: 'live' },
  // chat.js — all live, groups by what each governs rather than by file
  { key: 'DREAM_CHAT_IMAGE_PRIORITY_MS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_IMAGINE_DRAW_PROB', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_DRAW_STYLE', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_ART_WEIGHT_MIN_GAP_MS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_ART_WEIGHT_MAX_QUEUE', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_ART_WEIGHT_MAX_PAIRS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_OWNART_CANVAS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_OWNART_MAX_SUBJECTS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_ART_RELEARN_GAP_MS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_PRACTICE_GAP_MS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_PRACTICE_ITERS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_DRAW_CANVAS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_LOOKUP_HOLD_MS', effect: 'live', group: 'Vision & imagination' },
  { key: 'DREAM_EYE_PROCESS', effect: 'live' },
  { key: 'DREAM_EYE_SHOW_THOUGHT', effect: 'live' },
  { key: 'DREAM_EYE_TRANSITION_MS', effect: 'live' },
  { key: 'DREAM_SPONTANEOUS_IMG_AROUSAL', effect: 'live' },
  { key: 'DREAM_SPONTANEOUS_IMG_GAP_MS', effect: 'live' },
  { key: 'DREAM_INQUIRE_DEPTH', effect: 'live' },
  { key: 'DREAM_THOUGHT_CONCEPT_GAP_MS', effect: 'live' },
  { key: 'DREAM_ABLATION_LOG', effect: 'live' },
  { key: 'DREAM_INNERVOICE_MAX_NEURONS', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_INNERVOICE_GPU_GEN', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_INNERVOICE_GPU_GEN_MIN_DONORS', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_CHAT_QPROBE_TIMEOUT_MS', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_DF7_FANOUT_PROPAGATE', effect: 'live', group: 'GPU & donor' },

  // ══ EFFECT CLASSES, batch 3: `server/brain-server/gpu.js`, all 30 ═════════
  //
  // Same shape as batch 2 and for the same structural reason: `gpu.js` is a
  // mixin body, every read sits at indent ≥ 4 inside a method, and there is no
  // module scope for a value to freeze into. **Screened for the `cached` guard
  // — 0 of 30 matched**, so none memoise into a `this._x`.
  //
  // ⚠ Every one lands in `GPU & donor` and that is the honest answer rather
  // than a lazy one: this file IS the donor lane — dispatch, upload pacing,
  // fan-out, VRAM floors and readback gaps. A knob here governs where and how
  // fast her weights move between CPU and GPU, which is one subject.
  { key: 'DREAM_BATCH_STALL_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_MIRROR_CAP_MB', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_BACKED_PENALTY', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_FANOUT', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_READ_FRESH_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_WORK_FLOOR', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_FLOOD_COOLDOWN_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_MIN_VRAM_MB', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_INFLIGHT', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_REGISTRY_WAIT_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_SYNC_DURING_TEACH', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_MIN_BIND_MB', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_REBROADCAST_DUTY', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_UPLOAD_WAIT_DONOR_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_SPARSE_CHUNK_NNZ', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_SPARSE_UPLOAD_TIMEOUT_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_UPLOAD_MIN_MBPS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_SPARSE_UPLOAD_TIMEOUT_MAX_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_UPLOAD_PACE_LOWATER_MB', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_SYNC_PACE_MAX_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_SYNC_TEACH_PACE_MAX_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_SYNC_TEACH_PACE_MIN_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_WS_SOFT_SHED_MB', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_GATE_GPU_PROBES', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DF7_LINK_CAP_MB', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_RESYNC_TEACH_THROTTLE_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_PATTERN_LANE_CAP_MB', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_PATTERN_TEACH_THROTTLE_MS', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_DELTA_COLIDX', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_READBACK_MIN_GAP_MS', effect: 'live', group: 'GPU & donor' },

  // ══ EFFECT CLASSES, batch 2: `js/brain/curriculum.js`, all 33 ═════════════
  //
  // ⭐ ALL 33 ARE `live`, AND THE UNIFORMITY IS A FACT ABOUT THE FILE RATHER
  // THAN AN ASSUMPTION: `curriculum.js` is a class body, so every one of these
  // reads sits at indent ≥ 4 inside a method — there is no module scope for a
  // value to freeze into. Verified three enclosing methods by reading
  // (`getCurriculumStatus()` runs per state broadcast, `_resolveMaxGradeIdx()`
  // per walk resolution, `runCompleteCurriculum()` per walk) rather than
  // asserting the shape from indentation, which is the heuristic that produced
  // two wrong classifiers before.
  //
  // ⚠ THE `cached` SHAPE WAS SCREENED FOR, NOT ASSUMED ABSENT. One site
  // (`DREAM_SELF_FRAME_LIGHT_MAX_UNITS`) matched an `undefined` guard and was
  // read: the guard tests the ENV STRING inside an IIFE, not a memo field, so
  // it re-evaluates every time. **`cached` and `live` are identical in source
  // and only the guard's SUBJECT tells them apart** — that is exactly why this
  // was checked per-site instead of pattern-matched away.
  //
  // ⛔ `live` HERE MEANS THE READ RE-RUNS, NOT THAT A KNOB IS USEFUL TO TURN
  // MID-WALK. Several of these methods run once per cell or once per boot; the
  // class says a write WILL be seen the next time that path runs, which is the
  // question the panel is answering.
  { key: 'DREAM_SELF_FRAME', effect: 'live', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_SELF_FRAME_MAX_UNITS', effect: 'live', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_SELF_FRAME_LIGHT_MAX_UNITS', effect: 'live', group: 'Curriculum, gates & schedule', proof: 'IIFE in an object literal; the `!== undefined` tests the env STRING, not a memo — re-evaluated per call' },
  { key: 'DREAM_UPLOAD_GRACE_MIN', effect: 'live', group: 'GPU & donor' },
  { key: 'DREAM_TRICKLE_BATCH', effect: 'live', group: 'Teaching dose & repetition' },
  { key: 'DREAM_PRECELL_VOCAB', effect: 'live', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_BATTERY_QUESTION_TIMEOUT_MS', effect: 'live', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_BATTERY_DEADLINE_MS', effect: 'live', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_BC_EMISSION_DOM_MAX', effect: 'live', group: 'Brain dynamics' },
  { key: 'DREAM_BC_VOCAB_MIN', effect: 'live', group: 'Brain dynamics' },
  { key: 'DREAM_BC_RECTIFY_DECAY', effect: 'live', group: 'Brain dynamics' },
  { key: 'DREAM_BC_RECTIFY_NORM', effect: 'live', group: 'Brain dynamics' },
  { key: 'DREAM_BATTERY_GATE_HARD', effect: 'live', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_CELL_PASS_HARD', effect: 'live', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_HEALTH_GATE_HARD', effect: 'live', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_MAX_GRADE', effect: 'live', group: 'Curriculum, gates & schedule', proof: 'read in `_resolveMaxGradeIdx()`, called per walk resolution — context read 2026-09-03' },
  { key: 'DREAM_GRADE_MAJOR_ROUNDS', effect: 'live', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_SPEAKLOOP', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_SPEAKLOOP_TEACH_ROUNDS', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_SPEAKLOOP_TEACH_MAX_MS', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_SPEAKLOOP_MAX_FAILS', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_SPEAKLOOP_DRILL_ROUNDS', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_SPEAKLOOP_DRILL_MAX_MS', effect: 'live', group: 'Speech & emission' },
  { key: 'DREAM_PER_WORD_TEACH_TIMEOUT_MS', effect: 'live', group: 'Teaching dose & repetition' },
  { key: 'DREAM_REL_USE_TTL_MS', effect: 'live', group: 'Brain dynamics' },
  { key: 'DREAM_REL_USE_FLAT_TTL_MS', effect: 'live', group: 'Brain dynamics' },
  { key: 'DREAM_REL_USE_MIN_MARGIN', effect: 'live', group: 'Brain dynamics' },
  { key: 'DREAM_SENTENCE_TRANSITION_REPS', effect: 'live', group: 'Teaching dose & repetition' },
  { key: 'DREAM_NO_AUTO_GPU', effect: 'live', group: 'GPU & donor', proof: 'read in `async runCompleteCurriculum(…)` — context read 2026-09-03' },
  // These three already carry a group from the UNSORTED pass; only the effect
  // class is new, and the fold overlays it without repeating the rest.
  { key: 'DREAM_K_UPFRONT_SEED', effect: 'live' },
  { key: 'DREAM_HELD_BACK', effect: 'live' },
  { key: 'DREAM_MECH_EVERY_CELL', effect: 'live' },
  { key: 'DREAM_LEARN_GEOMETRY', effect: 'live' },

  // ══ EMPTYING THE UNSORTED PEN ═════════════════════════════════════════════
  //
  // ⭐ ALL 17 PLACED BY READING what each one governs, not by keyword. The pen
  // is named `UNSORTED — no category read yet` precisely so it stays visibly
  // empty-or-not; leaving rows in it would be the honest failure, and clearing
  // it by guessing would be the dishonest success.
  //
  // ⚠ Two could not be placed from their descriptions and their SITES were read:
  // `DREAM_LEARN_GEOMETRY` runs a deliberately tiny learning rate on every
  // sentence of the walk (a teaching-dose lane, not a vision one, despite the
  // name), and `DREAM_INQUIRE_DEPTH` bounds the follow-up question chain she
  // builds while talking.
  { key: 'DREAM_TICK_MS', group: 'Brain dynamics' },
  { key: 'DREAM_ABLATION_LOG', group: 'Watchdogs, bounds & safety' },
  { key: 'DREAM_EYE_PROCESS', group: 'Vision & imagination' },
  { key: 'DREAM_EYE_SHOW_THOUGHT', group: 'Vision & imagination' },
  { key: 'DREAM_EYE_TRANSITION_MS', group: 'Vision & imagination' },
  { key: 'DREAM_REF_RENDER_PX', group: 'Vision & imagination' },
  { key: 'DREAM_SPONTANEOUS_IMG_AROUSAL', group: 'Vision & imagination' },
  { key: 'DREAM_SPONTANEOUS_IMG_GAP_MS', group: 'Vision & imagination' },
  { key: 'DREAM_FORCE_CLEAR', group: 'Persistence & checkpoints' },
  { key: 'DREAM_HELD_BACK', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_K_UPFRONT_SEED', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_MECH_EVERY_CELL', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_LEARN_GEOMETRY', group: 'Teaching dose & repetition' },
  { key: 'DREAM_INQUIRE_DEPTH', group: 'Speech & emission' },
  { key: 'DREAM_THOUGHT_CONCEPT_GAP_MS', group: 'Speech & emission' },
  { key: 'DREAM_SELF_UPDATE_CMD', group: 'Serving & network' },
  { key: 'DREAM_UPDATE_STALE_MS', group: 'Serving & network' },

  // ⭐ The batch-1 effect classes below predate the taxonomy, so their groups
  // come from the legacy map. Each is corrected in place as its file's reading
  // pass runs — the ones whose mapped group is already right are left alone
  // rather than restated, because a redundant override is another thing to keep
  // in sync.
  { key: 'DREAM_WALK_TICK_MS', group: 'Curriculum, gates & schedule' },
  { key: 'DREAM_POLLINATIONS_KEY', group: 'Vision & imagination' },

  // ══ EFFECT CLASSES, batch 1: `server/brain-server.js` ═════════════════════
  //
  // ⛔ CLASSIFIED BY READING EACH SITE, NOT BY A SCOPE DETECTOR. Two detectors
  // have already produced confident wrong answers on exactly this question — a
  // brace-depth one that called module-scope constants `live`, and a column-0
  // one that **scored 6/6 against hand-read truth and was still wrong**, calling
  // 107 of 192 boot-frozen when three of four spot-checks were live. A pattern
  // was used to LOCATE the sites; the verdict on each came from reading it.
  //
  // ⚠ AND THE LOCATOR VISIBLY FAILED TWICE while producing this batch, which is
  // why that distinction is not pedantry: it reported `(top level)` for two
  // sites sitting at indent 6 and 10. **Those two are NOT in this batch** — an
  // unclassified knob is honest, a wrongly-classified one is the defect.
  //
  // The rule applied: read at module scope ⟹ `boot` (a write on a running brain
  // is ignored); re-read inside a function that runs repeatedly ⟹ `live`.
  { key: 'DREAM_CHECKPOINT_SLOTS', effect: 'boot', site: 'server/brain-server.js:1145', proof: 'column-0 `const CHECKPOINT_SLOTS = …` — a top-level statement, evaluated once at import' },
  { key: 'DREAM_TICK_MS', effect: 'boot', site: 'server/brain-server.js:1932', proof: 'column-0 `const BRAIN_TICK_MS = _envPositive(…)` — top-level, once at import' },
  { key: 'DREAM_SUBSTEPS', effect: 'boot', site: 'server/brain-server.js:1933', proof: 'column-0 `const SUBSTEPS = …` — top-level, once at import' },
  { key: 'DREAM_SUBSTEPS_MAX', effect: 'boot', site: 'server/brain-server.js:1979', proof: 'column-0 `const SUBSTEPS_MAX = …` — top-level, once at import' },
  { key: 'DREAM_SUBSTEPS_TARGET_MS', effect: 'boot', site: 'server/brain-server.js:1980', proof: 'column-0 `const SUBSTEPS_TARGET_MS = …` — top-level, once at import' },
  { key: 'DREAM_DF7_REBROADCAST_MS', effect: 'boot', site: 'server/brain-server.js:8991', proof: 'column-0 `const REPLICA_REBROADCAST_MS = …` — top-level, once at import' },
  { key: 'DREAM_DF7_REBALANCE_MS', effect: 'boot', site: 'server/brain-server.js:9019', proof: 'column-0 `const PRIMARY_REBALANCE_MS = …` — top-level, once at import' },
  { key: 'DREAM_LOOP_LAG_WARN_MS', effect: 'boot', site: 'server/brain-server.js:12676', proof: 'column-0 `const _LAG_WARN_MS = …` — top-level, once at import' },
  { key: 'DREAM_CPU_PROFILE', effect: 'boot', site: 'server/brain-server.js:12754', proof: 'column-0 `if (process.env.DREAM_CPU_PROFILE !== \'0\')` — a top-level branch, taken once at import' },
  { key: 'DREAM_POLLINATIONS_KEY', effect: 'live', site: 'server/brain-server.js:176', proof: 'read in the `return` of `function _pollinationsImageKey()`, which runs per image request — context read 2026-09-03' },
  { key: 'DREAM_WALK_TICK_MS', effect: 'live', site: 'server/brain-server.js:5325', proof: 'first line of `async _walkHeartbeat(…)`, which runs every walk tick — context read 2026-09-03' },
  { key: 'DREAM_CPU_PROFILE_EVERY_MS', effect: 'live', site: 'server/brain-server.js:12888', proof: 'read inside the repeating `setTimeout` callback, so each cycle re-reads it — context read 2026-09-03' },
  { key: 'DREAM_PARITY_MIN_GAP_MS', effect: 'live', site: 'server/brain-server.js:9257', proof: 'inside the `?parity=` request branch — re-read per request' },
  { key: 'DREAM_UPDATE_STALE_MS', effect: 'live', site: 'server/brain-server.js:9880', proof: 'inside the `/update` request branch — re-read per request' },
  { key: 'DREAM_SELF_UPDATE_CMD', effect: 'live', site: 'server/brain-server.js:9889', proof: 'inside the `/update` request branch — re-read per request' },
  { key: 'DREAM_MIN_DONOR_VERSION', effect: 'live', site: 'server/brain-server.js:11130', proof: 'inside the `ws.on(\'pong\')` handler — re-read on every donor pong' },
  { key: 'DREAM_RECOMMENDED_DONOR_VERSION', effect: 'live', site: 'server/brain-server.js:11131', proof: 'inside the `ws.on(\'pong\')` handler — re-read on every donor pong' },
  { key: 'DREAM_LOOP_LAG_SUMMARY_UNDER_MS', effect: 'live', site: 'server/brain-server.js:13097', proof: 'inside the lag-report branch, which runs per lag event' },

  // ⭐ HAND-DECLARED BECAUSE DISCOVERY CANNOT SEE AN EFFECT CLASS. Both of these
  // were found by the runtime scanner, which recovers the key and the default
  // but not whether a write takes effect — so both published `effect: '???'`
  // while their scopes had in fact been read (2026-09-03, deriving them for
  // `docs/THRESHOLD-DERIVATION.md`). A knob whose behaviour is known and
  // unrecorded is the same defect as one nobody explained.
  {
    key: 'DREAM_RANGE_MAX_RUNS', group: 'GPU dispatch', dflt: '16',
    provenance: 'derived',
    effect: 'boot', site: 'js/brain/cluster/hebbian.js:132',
    proof: 'module-scope `const RANGE_MAX_RUNS = Math.max(1, … || 16)` — evaluated once at import, so a write on a running brain is ignored',
    what: '⛔ NOT A TUNING DIAL — it is the DONOR\'S acceptance limit (donor.rs:1249). Above 16 the donor silently DISCARDS the frame while this side records it as GPU-carried, skipping the CPU pass 4 times in 5. Raise it only to match a donor that has raised its own handler cap.',
  },
  {
    // ⭐ MOVED OUT OF `Saturation & coherence` 2026-09-03 — the example that
    // made the categorization ask concrete. That group held both the saturation
    // thresholds and this, related by the word "coherence" and by nothing else:
    // those gate PLASTICITY, this gates whether she SPEAKS.
    key: 'DREAM_CHAT_COHERENCE_FLOOR', group: 'Speech & emission', dflt: '0.10',
    provenance: 'inherited',
    effect: 'live', site: 'js/brain/language-cortex.js:2335',
    proof: 're-read from `process.env` inside the emission function on every call — a write takes effect on the next reply, no restart',
    what: 'Chat-only. Below this coherence an emission is refused and degraded to a single honest word rather than shipping salad; gate and probe paths never reach it. ⚠ Genuinely uncalibrated — its own comment says "calibrate on the live walk". It sits at the BOTTOM of the observed K-grade emission range [0.10, 0.40], and below consolidation\'s 0.20, which is coherent: a bad memory is permanent, a bad sentence is not.',
  },
  // ── saturation detection ──────────────────────────────────────────────────
  {
    key: 'DREAM_SAT_MEANCOS', group: 'Saturation & coherence', dflt: '0.7',
    provenance: 'derived', setOn: null,
    // ⭐ DERIVED 2026-09-03. For random vectors in d dimensions E[cos] = 0 with
    // SD = 1/√d, so 0.7 is ~16σ above chance at d=512 — unreachable by
    // accident, which is the property this needs because the term GATES
    // PLASTICITY and a false positive stops her learning. ⚠ Verified produced
    // before being priced: `_lastSemMotorMeanCos` is written at
    // curriculum.js:18558 from the separability probe, not a dead field.
    // Full working: docs/THRESHOLD-DERIVATION.md.
    why: '⚠ NOT DERIVED, and its own comment admits it: "conservative defaults match prior hardcoded values; env vars only deviate when empirical 20hr-test data justifies a shift." So 0.7 is the number it always was, carried forward. That data has never been gathered. It is not wrong — it is unexamined, and this row exists so it is not mistaken for a measured value. The same is true of the other three SAT_ thresholds.',
    effect: 'boot', site: 'js/brain/cluster.js:241',
    proof: 'module-scope `const SATURATION_MEANCOS = (() => …)()` — frozen at import',
    what: 'Mean cosine between sem→motor rows above which the matrix reads as saturated — the "everything means everything" end state. Feeds the consolidation replay VETO.',
  },
  {
    key: 'DREAM_SAT_MEANABS', group: 'Saturation & coherence', dflt: '0.6',
    provenance: 'derived',
    why: 'DERIVED 2026-09-03: a uniform spread over [0,wMax] has mean exactly wMax/2 (simulation returns 0.495 over 200,000 samples), so 0.6 is uniform-plus-20% — "has the mean climbed a fifth above what an even spread would give?" Uniform is the natural zero point for "no concentration". docs/THRESHOLD-DERIVATION.md.',
    effect: 'boot', site: 'js/brain/cluster.js:246',
    proof: 'module-scope const IIFE — frozen at import',
    what: 'Mean-absolute weight as a fraction of wMax, above which the projection reads as concentrated. ANDed with DREAM_SAT_RATIO.',
  },
  {
    key: 'DREAM_SAT_RATIO', group: 'Saturation & coherence', dflt: '1.5',
    provenance: 'derived',
    why: 'DERIVED 2026-09-03 over 200,000 samples per reference distribution: uniform [0,wMax] gives max/mean = 2.02 and a perfectly flat distribution gives 1.0, so 1.5 asks "is this more than halfway from uniform to flat?" Sparse Hebbian weights measure 12 and genuinely sparse ones 48, so healthy cases clear it by an order of magnitude. docs/THRESHOLD-DERIVATION.md.',
    effect: 'boot', site: 'js/brain/cluster.js:252',
    proof: 'module-scope `const SATURATION_FANOUT_RATIO = (() => …)()` — frozen at import; scope read 2026-09-03',
    what: 'Peak-to-mean ratio below which the sem→motor weights read as flattened. ANDed with DREAM_SAT_MEANABS, and the AND is load-bearing: the two terms are anti-correlated, so every healthy reference distribution fails both and every saturated one passes both.',
  },
  {
    key: 'DREAM_SAT_SAMPLE', group: 'Saturation & coherence', dflt: '1000',
    provenance: 'derived',
    why: 'DERIVED 2026-09-03: relative standard error of the mean is CV/√n = 3.16% at n=1000, against the 0.50→0.60 gap the threshold must resolve (20%) — about 6.3 standard errors. Sampling strides the whole array rather than taking a prefix, so it is a spread sample. docs/THRESHOLD-DERIVATION.md.',
    effect: 'boot', site: 'js/brain/cluster.js:258',
    proof: 'module-scope `const SATURATION_SAMPLE_SIZE = (() => …)()` — frozen at import; scope read 2026-09-03',
    what: 'How many weights the health check samples. A larger sample is a more trustworthy verdict and a slower one; 1000 resolves the gap at ~6σ.',
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

  // ── the substep controller, watchdogs, checkpoints ────────────────────────
  DREAM_WEIGHTS_PAIR_TOL_SEC: { p: 'derived', why: '⭐ DERIVED FROM THE OBSERVED DISTRIBUTION, which is the cleanest derivation in the codebase. A coherent weights pair is written seconds apart; the good pairs measured 43s, 103s and 268s, and the BROKEN one measured 2,311s. 600s therefore sits "well clear of a slow-but-honest save and well under a real desync" — the threshold was placed in the gap between two real populations rather than picked.' },
  DREAM_CHECKPOINT_SLOTS: { p: 'derived', why: 'Sized against real disk: each binary checkpoint is ~145 MB at full scale, so the old fixed 5 slots meant ~725 MB of backups. Now env-tunable, default 3. ⚠ The ring around it had its own bug — the slot was `saveVersion % 3` at an hourly-gated copy, and 12 saves an hour made every copy land on the SAME slot, giving one fresh file and two fossils while the dashboard read healthy.' },
  DREAM_SUBSTEPS: { p: 'set', why: '⭐⭐ PINNING IT DISABLES ADAPTATION ENTIRELY, and that is the design rather than a side effect: "a deliberate act always beats the controller". An operator who sets a number gets that number, not a controller\'s opinion of it — the lesson from an earlier auto-derived value that overrode a deliberate one.' },
  DREAM_SUBSTEPS_MAX: { p: 'set', why: 'Caps how far the adaptive substep controller may climb, so a runaway target cannot walk the value up indefinitely. Part of the three-knob set where one pins, one caps the climb, and one moves the target.' },
  DREAM_SUBSTEPS_TARGET_MS: { p: 'set', why: 'Moves the target the substep controller aims at. The controller adapts toward it; the cap bounds it; an explicit pin overrides both.' },
  DREAM_SUBSTEPS_NATIVE: { p: 'set', why: 'Tunes ONLY the native tier, where 24 was chosen to keep "a wide margin" under the deadline. ⚠ The margin matters because a donor that stalls mid-batch trips the zombie-kick path — running close to the deadline turns a slow batch into a disconnect.' },
  DREAM_CPU_PROFILE_EVERY_MS: { p: 'set', why: '⭐ REPEATING RATHER THAN ONE-SHOT, because "comparing early-vs-steady is exactly the question a one-shot could not answer". First sample at +150s gives the early picture — which is what named the walk\'s CPU thieves — then it repeats so steady state is observable at all. Priced at ~1ms sampling overhead per 45s interval; 0 restores the original one-shot.' },
  DREAM_CPU_PROFILE: { p: 'config', why: 'On by default; 0 disables profiling entirely. Distinct from the interval knob beside it, which controls whether it repeats.' },
  DREAM_LOOP_LAG_WARN_MS: { p: 'set', why: '⭐ SET TO TURN A SYMPTOM INTO A LOCATION: it converts "1/8 handshakes" into "section X blocked N ms", so the fix chunks the PROVEN blocker "instead of guessing". Also pushed to the dashboard for a live readout rather than living only in a log.' },
  DREAM_LOOP_LAG_SUMMARY_UNDER_MS: { p: 'set', why: 'Aggregates short teach-attributed blocks into one summary line per minute, because the operator objected to a page-long wall of block notices. ⛔ DETECTION IS UNTOUCHED and the comment insists on it: the watchdog and the published lag figure "see every block regardless of what this printer does". This changes the printer, never the instrument.' },
  DREAM_LOOP_FREEZE_WARN_MS: { p: 'set', why: 'The threshold at which the off-thread watchdog reports a stall WHILE it is happening. ⭐ That watchdog exists because every earlier diagnostic rode the loop it was measuring, so a freeze that never returned printed nothing at all — the warning could only ever arrive after the problem ended.' },
  DREAM_REUPLOAD_DEBOUNCE_MS: { p: 'set', why: 'Collapses a churn of N reconnects into a single throttled re-upload "instead of one full 85MB push per drop". ⚠ Measured from the last upload START rather than its end, so a long upload cannot be immediately re-triggered by a reconnect that happened while it ran.' },
  DREAM_UPDATE_STALE_MS: { p: 'set', why: 'SET FROM A REAL LOCKOUT ON A NAMED DATE: if the process died before restarting — a blocked restart, for instance — the shutdown flag "would stay set forever and lock the button out (exactly what happened 2026-06-28)". Clearing it past a stale window makes a retry possible instead of requiring a manual fix.' },
  DREAM_RESPECT_VRAM_CAP: { p: 'config', why: '⚠ Off by default, and the safety argument is directional: the hard reserve still bounds everything and "config can lower, never raise", so ignoring a stale cap "can only ever recover capacity the card genuinely has". Set it to keep honouring a deliberately low cap.' },
  DREAM_FORCE_CLEAR: { p: 'config', why: 'Forces a fresh wipe. ⭐ The reasoning around it is about IDENTITY: reaching the wipe path means a fresh brain, so Tier 3 must reset to her original persona seed at load — every resume path returns before this point, so a resumed brain never has its identity re-seeded.' },
  DREAM_POLLINATIONS_KEY: { p: 'config', why: '⛔ EMPTY BY DEFAULT AND MUST STAY THAT WAY. The standing ruling is the anonymous tier only — every key file was deleted and every seed path removed, and a default key must never be re-added. This reads an admin-supplied value at runtime and nothing else.' },
  DREAM_SELF_UPDATE_CMD: { p: 'config', why: 'Overrides the path to the self-update script. Defaults to the in-repo deploy script; exists so a differently-laid-out box can point at its own.' },
  DREAM_NO_PRIMARY_WATCHDOG_MS: { p: 'inherited', why: 'How long the brain tolerates having no primary donor before acting. No comment at the read site.' },
  DREAM_UPLOAD_WATCHDOG_MS: { p: 'inherited', why: 'Watchdog bound on a stuck upload. No comment at the read site.' },
  DREAM_SPARSE_UPLOAD_TIMEOUT_MS: { p: 'set', why: 'The EXPLICIT upload timeout, which "still wins outright" over the size-scaled one. ⚠ That precedence is the point: the scaled timeout is a convenience, and an operator who names a number is not overridden by it.' },
  DREAM_FIRING_TARGET_PCT: { p: 'set', why: 'The homeostatic firing set point everything else is driven toward. ⛔ Its comment carries a boundary worth keeping: changing the surrounding physics — a different decay term, a different α — is "a physics change on all three kernel implementations" and is the operator\'s decision, filed on the board, NEVER automatic. ⚠ Also `cached`: read once, so a live write is silently ignored.' },
  DREAM_PSI_GAIN_SCALE: { p: 'set', why: 'Scales the psi gain, and the design note is that it AUTO-CALIBRATES to any brain size — the value is a scale on a self-adjusting quantity rather than an absolute. Bounded and centred at 1.0, so the default is a no-op and deviation is explicit.' },
  DREAM_TICK_MS: { p: 'inherited', why: 'The brain tick interval, defaulting to an auto-derived value. Not derived at the read site.' },
  DREAM_TEXTFIG_PER_CELL: { p: 'derived', why: 'RE-PRICED WITH REAL NUMBERS: 134 ms average fetch at 200 KB means 6 figures ≈ 0.8s of network, about 0.05% of a ~26-minute cell pass. ⛔ But the cap has since been NARROWED rather than re-derived — it no longer bounds every inline percept. The section walk perceives a chapter section\'s own figures from the local field store beside its prose, gated on a field HIT; this cap now governs the NETWORK lane only, and spends its six attempts on figures that had no field. ⚠ The original bound existed because an unbounded loop over a 94-figure cell would put ~94 sequential image decodes inside a cell pass, on the same substrate the walk teaches with.' },
  DREAM_VM_RELATE_REPS: { p: 'inherited', why: 'Four reps when relating a new percept to what she already holds. No comment at the read site and no derivation anywhere — the same round 4 that the art-weight lane uses.' },

  // ── sizing, RAM, donor lifecycle ──────────────────────────────────────────
  DREAM_LANG_VRAM_RESERVE_MB: { p: 'derived', why: 'MEASURED, not reserved defensively: "5GB = the measured 3,969MB plus margin". ⭐ And it does not grow with the brain — the language cortex size is PINNED at 12M by the floor, so this footprint is fixed while the main brain scales. ⚠ The comment also records why the problem was invisible for a while: the tier clamp happened to hold the brain at 357M, which masked it.' },
  DREAM_LANG_RAM_FRACTION: { p: 'derived', why: 'Brings the RAM bound "in line with the constraint that was never the binding one" — the old bound was guarding the wrong resource. ⭐ It ships with its safety margin stated: the per-neuron estimate already carries ~1.7× over the measured ~590 bytes/neuron real footprint, so the fraction is applied to a conservative figure rather than a tight one.' },
  DREAM_DF7_REBALANCE_MS: { p: 'derived', why: 'DERIVED FROM AN OBSERVED FAILURE WINDOW: the old code re-checked only every 60s, "so a donor whose socket flooded stayed the coordinator (main-tick stream) for up to a minute before any handoff". Tightened so a flooding donor is demoted within ~10s and the main tick moves to a donor that actually drains — "no card stays pinned as primary".' },
  DREAM_DF7_REBROADCAST_MS: { p: 'derived', why: 'A cadence chosen against the drift it corrects: with fan-out ON, Hebbian batches round-robin across donors so their GPU shadows "drift apart faster", and 60s bounds that. ⭐ Without fan-out the same correction at 10 minutes "is plenty" — the interval tracks the mechanism rather than being one number for both regimes.' },
  DREAM_MIN_DONOR_VERSION: { p: 'set', why: 'The HARD floor — below it a donor connection is refused outright. Paired deliberately with the recommended version so the two do different jobs: this one protects against incompatibility, the other nudges without disruption.' },
  DREAM_RECOMMENDED_DONOR_VERSION: { p: 'set', why: '⭐ THE SOFT counterpart, and the reason it exists is kindness to a live walk: a donor above the hard floor but below this "keeps working normally and upgrades at its next natural disconnect, so nobody is kicked mid-walk for being one release behind".' },
  DREAM_DF7_PROMOTE_COOLDOWN_S: { p: 'set', why: 'A newcomer with no proven track record "joins as a replica and can win primacy at the next periodic rebalance once it has PROVEN itself" — promotion is earned rather than granted on arrival. ⚠ First-primary assignment, when there is no primary at all, is never gated: a cooldown that blocked the first donor would leave the brain with no coordinator.' },
  DREAM_DONOR_FIT_MB: { p: 'set', why: 'Sizes the brain to the donor POOL rather than to one card, so capacity "scales with donors" as more join. ⚠ Precedence is explicit: an explicit brain-budget override still wins, host-RAM safety still caps the top, and local development without proxy-auth is unchanged.' },
  DREAM_BRAIN_BUDGET_MB: { p: 'set', why: 'The explicit override for the derived neuron count. ⭐ What matters here is the surrounding discipline: the boot line PRINTS THE ARITHMETIC "so it can be made with numbers instead of vibes". ⚠ Remember the standing fact — the neuron count is DERIVED AT BOOT from free host RAM and is not a property of the brain; the same code has booted at 425,436,550 and 411,216,550.' },
  DREAM_LANG_CORTEX: { p: 'set', why: 'Dense language-cortex size, default 100,000, scaled back UP "for meaningful capacity" after being reduced. ⛔ Its documented default was wrong until 2026-09-02: the admin-controls table said 10, which was the `parseInt(x, 10)` RADIX rather than a value — a four-order-of-magnitude error on the doc a reader consults to avoid reading code.' },
  DREAM_LANG_UNPIN: { p: 'config', why: 'Releases the pinned language-cortex geometry "so a fresh walk re-derives naturally". The PIN exists because a boot-time free-RAM dip would otherwise re-derive a different geometry and orphan the trained weights.' },
  DREAM_HB_BUF_FORGIVE_MB: { p: 'set', why: 'SET FROM A REAL KILL: the primary\'s canonical GPU upload carries no replica-sync marker, so the heartbeat sweep "killed it mid-upload every cycle" — the grace period only covered replica syncs. ⚠ Bounded by the same hard ceiling as the rest, so "a truly dead socket still dies" and forgiveness never becomes immortality.' },
  DREAM_NO_DONOR_ID_EVICT: { p: 'config', why: 'Eviction is ON by default. ⭐ The mechanism note is the useful part: the sweep uses terminate rather than a graceful close, which fires the close handler, "so the existing failover / standby-promotion path runs unchanged" — the eviction reuses the tested path instead of inventing a second one.' },
  DREAM_READBACK_STOP_BUDGET_MS: { p: 'set', why: '⭐ A DELIBERATE TRADE, stated: "a slightly older coherent checkpoint beats a forged STALLED verdict". Bounding the readback at shutdown means the exit stays clean and the watchdog does not record a hard death that never happened — losing a little recency to keep the death record honest.' },
  DREAM_NO_HEAP_REEXEC: { p: 'config', why: 'Disables the automatic heap re-exec. ⚠ The guard around it is conservative by design: it re-execs ONLY when the CURRENT limit is below the hardware target, so it cannot loop and cannot shrink a heap someone raised on purpose.' },
  DREAM_HEAP_REEXECED: { p: 'config', why: 'An internal marker, not an operator lever — it records that a re-exec already happened so the process cannot re-exec itself in a loop.' },
  DREAM_WALK_TICK_MS: { p: 'inherited', why: 'The walk heartbeat interval. No comment at the read site.' },
  DREAM_PARITY_MIN_GAP_MS: { p: 'inherited', why: 'Minimum gap between parity checks. No comment at the read site.' },

  // ── GPU / donor transport ─────────────────────────────────────────────────
  // ⭐ The best-evidenced group in the codebase. Most of these were set from a
  // named live incident rather than chosen, and the incident is in the comment.
  DREAM_SPARSE_CHUNK_NNZ: { p: 'derived', why: 'SET FROM A LIVE INCIDENT, with the failure described: at 306M scale the intra-matrix upload killed the socket and produced "connect → intra chunks → socket killed → reconnect loop every ~4.5s", and "the moment intra gave up, 16/17 uploaded fine" — so the small cross-projections were never the problem. 750k non-zeros ≈ 6MB frames, a comfortable margin even counting the first chunk\'s row pointers.' },
  DREAM_SPARSE_UPLOAD_TIMEOUT_MAX_MS: { p: 'derived', why: 'RAISED 15 → 30 min AGAINST A MEASURED TRANSFER: the 12M language cortex\'s intra upload is ~2.9GB, about 12 minutes at the measured wire speed, so a 15-minute cap left no headroom for a slower link — and the next scale hop grows it further. The cap is on a SCALED timeout; an explicit override still wins outright.' },
  DREAM_DF7_REBROADCAST_DUTY: { p: 'derived', why: 'A DUTY RATIO WITH ITS ARITHMETIC STATED: at ratio 3, re-convergence "occupies at most ~25% of wall clock and teach keeps >=75%". ⭐ It is also self-scaling — at small scale a sweep takes seconds, so ratio × seconds stays under the caller\'s own 60s cadence and behaviour is unchanged. It only ever throttles when the sweep is genuinely expensive.' },
  DREAM_DF7_READ_FRESH_MS: { p: 'derived', why: 'Derived from the cadence it guards: the freshness window is 3× the 60s rebroadcast, "so a single missed cycle does not flap eligibility". A window equal to the cadence would make one dropped beat look like a dead replica.' },
  DREAM_WS_SOFT_SHED_MB: { p: 'set', why: '⭐ A SOFT cap placed deliberately BELOW the 500MB hard-drop line "so liveness traffic (pings, acks, uploads) keeps a drainable buffer". It sheds immediately rather than enqueueing, because the old 30s backpressure await "just stalled the pipeline while the queue kept growing" — waiting was the bug.' },
  DREAM_DF7_BACKED_PENALTY: { p: 'set', why: '⭐ A PENALTY RATHER THAN AN EXCLUSION, and the reason is that exclusion does not self-heal: a backed-up donor still pulls a sliver of work, "so it earns, appears on the leaderboard, and self-corrects as its socket drains". Setting it to 0 restores the old hard exclusion, where a struggling card simply vanished.' },
  DREAM_DF7_WORK_FLOOR: { p: 'set', why: '⭐ SAFE BECAUSE THE SCORING IS MULTIPLICATIVE: strength = base × health, so a tiny floor keeps a slow donor at the BOTTOM of the ranking and a healthy donor at health 1.0 always out-scores it. That is what stops the floor ever promoting a struggling card to PRIMARY and making it the main-tick barrier.' },
  DREAM_DF7_LINK_CAP_MB: { p: 'set', why: 'Keeps every donor\'s buffer seconds-empty by giving each card "exactly the work its link can drain (equal donors, each at its own pace)". The consequence named in the comment is that RTT stays REAL rather than inflated by queueing — which is what makes the health signal trustworthy.' },
  DREAM_DF7_MIRROR_CAP_MB: { p: 'set', why: 'Bounded by the SHED-CLASS threshold rather than the routing cap, and the argument is a size fact: "a compute_batch message is a few HUNDRED BYTES of cluster params — it costs the donor link nothing and is processed on the donor\'s own worker", so "only a genuinely drowning socket should be spared".' },
  DREAM_UPLOAD_PACE_LOWATER_MB: { p: 'set', why: 'Paces an upload to the donor\'s own drain rate "so the upload COMPLETES instead of timing out" — a slow link that was previously fed faster than it could drain would hit the deadline and lose the whole transfer. The outer timeout still guards a genuinely dead link.' },
  DREAM_UPLOAD_MIN_MBPS: { p: 'set', why: 'The floor rate used to SCALE the upload timeout to the transfer size, so a big matrix on a slow link is not judged by the same clock as a small one. ⚠ A truly dead link still dies: pacing bails on close and a stalled-but-open socket still hits the scaled deadline.' },
  DREAM_PATTERN_TEACH_THROTTLE_MS: { p: 'set', why: 'Self-pacing throttle driven by the donor\'s own buffer depth and smoothed RTT, "so a struggling donor self-paces and recovers instead of being held under". ⭐ Bounded at 16× "so this can never become an effective mute" — the bound exists because an unbounded self-pacer silences the donor it is trying to protect.' },
  DREAM_PATTERN_LANE_CAP_MB: { p: 'set', why: 'A separate, tighter cap for the PATTERN lane so gate-probe pattern writes still pass when the socket is under pressure. ⚠ The Hebbian-batch lane deliberately keeps the full soft cap, because those frames carry real weight deltas — dropping a pattern costs a probe, dropping a delta costs training.' },
  DREAM_DF7_FLOOD_COOLDOWN_MS: { p: 'set', why: '⭐ THIS IS WHAT MAKES "no fixed primary" STABLE. Without a cooldown, election flip-flops per second between a strong-GPU/weak-link card and a weaker-GPU/strong-link one — and every flip re-uploads the brain. The cooldown converts an oscillation into a decision.' },
  DREAM_DF7_SYNC_DURING_TEACH: { p: 'set', why: 'Three-valued and paced by default: unset or "paced" yields proportionally to MEASURED loop lag, "0" is the old hard defer, "1" is unpaced full speed. ⭐ Pacing replaced the hard defer because deferring blocked "on a window that may never arrive" — the sync waited for an idle moment that a busy walk never produced.' },
  DREAM_DF7_FANOUT: { p: 'config', why: 'Read fan-out across donor replicas, with an instant rollback at 0 and "no weight-format / restart-contract change". ⚠ Safe because the CPU CSR stays the authoritative Hebbian master, so a batch on any replica cannot corrupt training.' },
  DREAM_DELTA_COLIDX: { p: 'config', why: '⛔⛔ DISABLED, CAUSE UNKNOWN — and it is an OPEN board item, not a settled default. The offline evidence is strong: byte-exact at 750,000 entries (the production chunk size) and at the 10-entry parity vector, and concurrent encodes with separate scratches round-trip byte-exact. ⚠ What has NOT been reproduced offline is the actual multi-donor upload path end to end, and the standing instruction is explicit: re-enable ONLY after that reproduction exists. **A feature that passes every test you can run and still fails in production is disabled until the test that would have caught it is built.**' },
  DREAM_GATE_GPU_PROBES: { p: 'config', why: 'Whether gate probes run on the GPU. ⚠ The correctness rule beside it matters more than the switch: the propagate is PINNED to the PRIMARY — the same socket the write went down — "never a pool replica whose mirror may have shed the write". Reading from a replica that dropped the write returns confident nonsense.' },
  DREAM_DF7_MIN_BIND_MB: { p: 'inherited', why: 'A 1800MB minimum bindable-buffer requirement before a donor is eligible. ⭐ The reasoned part is the reporting: a donor below it is rejected with "an honest reason instead of a mysterious high-RTT / 0-Gn/s row". The threshold itself is not derived.' },
  DREAM_DF7_MIN_VRAM_MB: { p: 'inherited', why: 'A 1500MB VRAM floor for donor eligibility. ⚠ Rejection is not permanent — the donor "rejoins at full strength the instant its link recovers" — which is the same self-healing posture as the backed-up penalty. The number is not derived.' },
  DREAM_DF7_INFLIGHT: { p: 'inherited', why: 'How many chunks are in flight per donor. ⚠ Its ordering effect is explicitly COSMETIC: opening the round with the strongest donors "self-balances within microseconds regardless of start order", so the shared cursor does the real work.' },
  DREAM_DF7_SYNC_PACE_MAX_MS: { p: 'inherited', why: 'Ceiling on the idle-time sync pace. Not derived at the read site.' },
  DREAM_DF7_SYNC_TEACH_PACE_MAX_MS: { p: 'inherited', why: 'Ceiling on the during-teach sync pace. ⭐ The mechanism is reasoned — "the lag multiple backs off hard exactly when teach is suffering" — but the bound is not derived.' },
  DREAM_DF7_SYNC_TEACH_PACE_MIN_MS: { p: 'inherited', why: 'Floor on the during-teach sync pace, so backing off cannot become stopping. Not derived.' },
  DREAM_DF7_REGISTRY_WAIT_MS: { p: 'inherited', why: 'How long to wait for the donor registry before proceeding. No comment at the read site.' },
  DREAM_READBACK_MIN_GAP_MS: { p: 'inherited', why: 'Minimum gap between GPU readbacks. No comment at the read site.' },
  DREAM_BATCH_STALL_MS: { p: 'inherited', why: 'When a compute batch counts as stalled. No comment at the read site; the value decides how quickly a quiet donor is judged dead.' },
  DREAM_UPLOAD_WAIT_DONOR_MS: { p: 'inherited', why: 'How long an upload waits for a donor to become ready. ⚠ Targeted sends never wait at all — "a dead replica is skipped, not awaited" — so this only governs the broadcast path.' },
  DREAM_RESYNC_TEACH_THROTTLE_MS: { p: 'inherited', why: 'Throttle for resyncs raised during teach, so window-time resyncs "keep the fast 60s throttle and land in the natural drain slot". ⚠ Per-matrix dirty tracking is named in the comment as the queued deep cure — this throttle is the interim.' },

  // ── saturation rectification + the gates (the helper-read set) ────────────
  // ⭐ These are the eleven that were INVISIBLE until the scanner learned the
  // `_envNum('KEY', default)` form. The rectification pair is the mechanism that
  // stops saturation hard-stopping the walk.
  DREAM_BC_RECTIFY_DECAY: { p: 'set', why: 'The multiplicative weight decay applied to a COLLAPSED sem→motor projection. ⭐ It exists so that a saturation halt no longer RETURNS: the projection is rectified in place, the corrected weights are force-checkpointed, and the walk CONTINUES. Before it, detecting saturation stopped the walk. It also clears the stale separability reading, "so the next health read isn\'t pinned saturated by a frozen meanCos" — the fix and the instrument were corrected together. 0.5 is a halving, not a derived figure.' },
  DREAM_BC_RECTIFY_NORM: { p: 'set', why: 'The row-normalisation target applied straight after the decay above. The pair is one operation: decay the weights, then renormalise the rows so the projection is usable rather than merely smaller. 0.6 is chosen, not derived.' },
  DREAM_BC_EMISSION_DOM_MAX: { p: 'inherited', why: 'A 0.45 ceiling on how far one word may dominate emission before the collapse detector fires. Not derived at the read site.' },
  DREAM_BC_VOCAB_MIN: { p: 'inherited', why: 'A 0.85 floor on vocabulary breadth in the same collapse check. Not derived at the read site.' },
  DREAM_GATE_PROD_MIN: { p: 'inherited', why: '⚠ THE K-GATE PRODUCTION THRESHOLD — 0.80, and one of the most consequential numbers in the walk, since it decides whether a cell passes. It is the codebase\'s own authoritative passing bar (the default cut score, from below-benchmark reading cut scores), recalibrated down from a hardcoded 0.95 because at biological scale that bar is effectively unreachable and a genuinely-trained cell never A+-passed. **Recalibrated with a reason; not derived from this brain\'s own measurements.**' },
  DREAM_GATE_PATH_MIN: { p: 'inherited', why: 'The K-gate pathway threshold, 0.80, moving in step with the production bar above and carrying the same provenance.' },

  // ── the walk: bounds, doses, gates ────────────────────────────────────────
  DREAM_CELL_PASS_HARD: { p: 'set', why: '⭐ A LAW DECISION, off by default: a cell passes on COMPLETED LEARNING, not on test-question correctness. ⚠ Two cases still do not pass, and both are honest: a held cell with no runner wired for that subject/grade (nothing was trained), and a runner that threw mid-teach (the content training did not finish). Setting it restores the old behaviour where probe, battery and health gates decide the pass.' },
  DREAM_HEALTH_GATE_HARD: { p: 'set', why: 'The health half of the same ruling — advisory by default, so a health reading reports without blocking a pass. Same reasoning as the battery gate: the checks are kept and surfaced, they simply do not decide.' },
  DREAM_K_UPFRONT_SEED: { p: 'set', why: 'OFF by default, and the change it represents is the valuable part: the vocabulary seed moved OFF the critical path and was DEEPENED rather than removed. "This does not remove K\'s definition learning — it moves it off the critical path and deepens it." Setting it restores the old blocking behaviour where the full seed had to land before the first cell.' },
  DREAM_MECH_EVERY_CELL: { p: 'set', why: '⚠ AN OPT-OUT, NOT AN OPT-IN — and it has been misread as a disabled feature before. Language mechanics run on the first pass, whenever the sentence-generation probe falls below 0.85, and periodically; they are skipped only on intervening consolidated cells. ⭐ It is SELF-CORRECTING: if the probe rate drops, meaning mechanics regressed, it returns to full-every-cell until recovered. Setting it forces always-full.' },
  DREAM_HELD_BACK: { p: 'config', why: 'On by default, `0` disables. Governs whether a cell that could not complete is recorded as held back rather than silently skipped.' },
  DREAM_LEARN_GEOMETRY: { p: 'set', why: '⭐ SAFE BECAUSE OF A BOUND, and the comment states the argument: the cap means "the learned component can never overwhelm the imported base, so the failure mode is a small perturbation rather than a collapsed geometry — and the outcome no longer depends on how long she reads." That last clause is the point: without the cap, a longer read produced a different geometry.' },
  DREAM_BATTERY_QUESTION_TIMEOUT_MS: { p: 'set', why: 'One of the two budgets described as "the local-GPU unblock that lets her leave the cell". ⚠ Explicitly a local unblock rather than the real fix: routing the tick as a remote WS roundtrip is strictly worse latency and "must be designed WITH the donor-compute app, not retrofitted here".' },
  DREAM_KEEP_STATE: { p: 'config', why: '⛔ UNSET MEANS WIPE, and that is the single most consequential default in the project — the fresh-walk launcher boots clean, only the save-start launcher resumes. ⭐ The reasoning recorded here is about a QA projection reset: it runs on a fresh walk (where the weights were wiped anyway) and NOT on a resumed brain, because "wiping a projection that a trained brain is currently speaking from would throw away everything the QA phases did NOT damage along with what they did". Fresh walk decides; a resume is never surprised.' },

  // ── emission, memory, art ─────────────────────────────────────────────────
  DREAM_CHAT_MAX_WORDS: { p: 'set', why: 'A hard ceiling on a chat reply, and the truncation is argued rather than arbitrary: short is the DEFAULT shape, and because emission order follows argmax strength "the leading words carry the strongest activations, so truncation keeps the signal and drops the spill". Cutting the tail removes the weakest activations by construction.' },
  DREAM_GW_IGNITION: { p: 'config', why: 'The global-workspace ignition threshold, exposed so the consciousness gate can be tuned without a code change: stricter at 0.6 means harder ignition and more focused, looser at 0.3 means it fires more and is "more diffuse but more alive". Falls back to an options override, then 0.45.' },
  DREAM_MINDSEYE_MAX_SIDE: { p: 'set', why: '⭐ RAISED 128 → 512 ON A PRINCIPLE, not a measurement: a de-novo mind\'s-eye field "is a real image now, not a thumbnail", and the old value was "clipped by a number someone picked defensively". ⚠ The process governor still modulates WITHIN the raised band — that is her own judgement about spend, which the standing directive preserves ("morals not a cap"). This env var moves the ceiling for a smaller box.' },
  DREAM_CSR_FREE_MIN_MB: { p: 'set', why: 'A 512MB floor before a projection\'s CSR is freed, and the reasoning is about correctness rather than memory: free only when this projection "actually threatens memory", because below that keeping it resident means "saves stay complete, donor churn stays lossless, re-arms upload truth". Freeing too eagerly cost all three.' },
  DREAM_FIGURE_FIELDS_DIR: { p: 'config', why: 'Where the press leaves the precomputed wavelet fields. ⚠ The path is on the deploy rsync EXCLUDE list on purpose, "so the next press cannot delete what it just downloaded" — a real failure mode that was designed out rather than discovered.' },
  DREAM_SAVE_MIN_FREE_DISK_MB: { p: 'set', why: 'The free-disk floor the save guard enforces, and it is published beside the measured free space "so the number and the threshold it is judged against are read together". Defer-never-drop: a save below the floor is postponed, not abandoned.' },
  DREAM_SAVE_MIN_FREE_MB: { p: 'inherited', why: 'The RAM twin of the disk floor above. Its deferral counter is surfaced "so the guard is visibly idle rather than merely assumed idle" — the instrument is reasoned; the threshold is not derived here.' },
  DREAM_PRACTICE_ITERS: { p: 'inherited', why: 'How many self-critique iterations a practice session runs. ⭐ The mechanism around it is the reasoned part: practice needs BOTH halves of the judgement — her memory of the shape (the schema with its trace) and her memory of the look (the percept vector) — and only keeps a nudge that measurably improves resemblance. 5 is not derived.' },
  DREAM_PRACTICE_GAP_MS: { p: 'inherited', why: 'A ~30 minute per-concept cooldown between practice sessions. Paces the lane; not derived.' },
  DREAM_OWNART_MAX_SUBJECTS: { p: 'inherited', why: 'At most 3 subjects composed into one artwork. Not derived at the read site.' },
  DREAM_WORD_MOTOR_VOCAB_CAP: { p: 'inherited', why: 'A cap on the word-motor band\'s vocabulary. No comment at the read site. ⚠ Worth care if it is ever raised: the unified word-motor band replaced six per-subject sub-bands precisely because those overflowed and silenced learned words.' },
  DREAM_REP_COMPRESS_LR_CEIL: { p: 'derived', why: 'MEASURED, and the measurement is in the comment: 0.60 is "the highest value that is MEASURED clean (MID at 0.599 scores 100%)". It lands the LOW and MID tiers at 5 presentations and backs HI off to 7. ⛔ The comment also states the trade it exists to prevent: raising it past 0.60 to force HI to 5 buys two presentations for about 6% retrieval, "a bad trade, and it is the trade this comment exists to stop someone making silently".' },
  DREAM_REP_COMPRESS_FLOOR: { p: 'derived', why: 'DERIVED FROM A REAL REGRESSION. A live boot compressed a 4-rep dose to ONE presentation, and the arithmetic was right while the regime was one the sweep never measured — at n=1 there is no interleaved reinforcement left, so a pair writes once and every later pair\'s interference lands on it with no chance to re-assert. The floor of 4 forbids that independently of any other threshold.' },
  DREAM_REP_COMPRESS_MIN_DOSE: { p: 'derived', why: 'Lowered 12 → 6 so mid-size doses also reach the 5-rep instruction. ⭐ Safe for a stated reason rather than an assumed one: the real guard is the RESULT floor of 4, which forbids a collapse to a single presentation independently of this threshold, and doses of 5 or fewer already comply and are untouched.' },
  DREAM_PER_WORD_TEACH_TIMEOUT_MS: { p: 'derived', why: 'DERIVED AGAINST THE WORST REAL CASE. 120s "comfortably fits the richest word\'s full sliced teach while still bailing a truly-hung fetch" — the stated test being that over two minutes means the network is actually dead rather than the word being rich. ⭐ It exists because the previous timeout was dropping her richest words\' definitions entirely, "an inadvertent dumbing-down that only bites the hardest vocab".' },
  DREAM_WINDOW_MAX_MS: { p: 'derived', why: 'DERIVED FROM A LIVE OVERRUN: unbounded, a between-chunk window held the vocabulary seed for about 44 minutes while the stages ground through cortex ticks and cold dictionary fetches. The budget is checked between stages AND inside per-item loops, and skipped work is logged loudly and picked up by later windows, because the trickle queue and promotion candidates persist across windows by design.' },
  DREAM_PHASE_BUDGET_MS: { p: 'set', why: '⛔ 0 MEANS NO BUDGET AND NOW TRULY DOES. This is one of the ledger\'s own lying-instrument cases: setting 0 to "disable the bound" previously produced the MOST AGGRESSIVE cut possible — one rep per phase — while the console line printed "0 disables the bound". The arm site is now gated so nothing is armed unless a positive budget was explicitly asked for.' },
  DREAM_GRADE_MAJOR_ROUNDS: { p: 'set', why: 'THE BOUND IS THE FEATURE. Unbounded, the grade-major block wedges at grade 1 forever — which is not hypothetical: Life had passed zero cells in its entire existence. The cap turns "cannot pass" into "retried next boot" rather than a hung walk. ⚠ Its guard is a `typeof` check and not optional chaining, because this module is bundled for the browser where `process` is an undeclared identifier and `process?.env` would throw rather than short-circuit.' },
  DREAM_REL_USE_MIN_MARGIN: { p: 'set', why: 'SET SO THE INSTRUMENT CAN ANSWER "IS IT GETTING CLOSER?". The pass/fail confident flag and a single last-read sample cannot: "a live 0.00013 and a live 0.14 both render as flat, 0 confident, and those are opposite situations — one is a walk that will never arrive, one is a walk about to". The margin threshold plus a progress ratio is what separates them.' },
  DREAM_REL_USE_TTL_MS: { p: 'set', why: '⭐ A CACHE TTL CHOSEN AGAINST A SPECIFIC WRONG ALTERNATIVE, quoted: it is "deliberately NOT a skip-while-confident-zero gate: that would make the feature unable to ever notice the bands separating — a cost gate that resolves to never, which is a deletion wearing a bound\'s clothes". A long TTL still re-reads every word, just at a cadence matched to how fast the measured thing can actually move.' },
  DREAM_REL_USE_FLAT_TTL_MS: { p: 'set', why: 'The flat-case half of the same decision — a longer TTL for words currently reading flat, so the lane stays cheap without ever becoming a gate that resolves to never.' },
  DREAM_UPLOAD_GRACE_MIN: { p: 'set', why: 'SET SO A WAIT ESCALATES INTO A DIAGNOSIS. Under the grace window the condition reads as before; past it, the same condition is reported as a REAL fault together with the flags that decide it — "which is what turns this from wait longer into here is which precondition is wrong". It exists because the previous message was the only thing the operator saw and it said "by design".' },
  DREAM_BATTERY_DEADLINE_MS: { p: 'set', why: 'One of two budgets described as "the local-GPU unblock that lets her leave the cell". ⚠ The comment is explicit that the deeper fix — routing the tick as a remote WS roundtrip — is strictly worse latency and must be designed WITH the donor-compute app rather than retrofitted, so this is a deliberate local unblock and not the solution.' },
  DREAM_SENTENCE_TRANSITION_REPS: { p: 'set', why: 'A rep FLOOR of 24 so grade vocabulary binds deep enough to sequence — set because the content sentences were passing reps:2, which is too shallow for transition learning. ⛔ This registry recorded its default as 10 until the value was read by hand: the discovery parser had been grabbing the RADIX out of `parseInt(x, 10)`. Fixed at the parser, not per row.' },
  DREAM_SELF_FRAME_LIGHT_MAX_UNITS: { p: 'inherited', why: '⚠ AN ESTIMATE, AND HONESTLY LABELLED AS ONE: "the light unit\'s ~6s price is DERIVED from the full frame\'s measured 42s by item count, not measured directly". The telemetry beside it exists precisely so that estimate can be checked against a real run before anyone raises the budget.' },
  DREAM_SELF_FRAME_MAX_UNITS: { p: 'inherited', why: 'A per-cell budget on self-framing. The VISIBILITY around it is the reasoned part and states its own origin: units only increments after a frame is taught, and a capped flag says the budget stopped further reframing, "because the whole lying-instrument family started with features nobody could see running".' },
  DREAM_SELF_FRAME: { p: 'config', why: 'The enable switch for the self-framing lane, with its counters wired so an unexpectedly low unit count has a stated reason rather than looking like nothing ran.' },
  DREAM_PRECELL_VOCAB: { p: 'config', why: 'On by default; 0 restores the older trickle-only shape. A pre-cell vocabulary pass rather than relying on the background trickle alone.' },
  DREAM_MAX_GRADE: { p: 'config', why: '⛔ DEFAULTS TO UNCAPPED — the full pre-K→PhD walk — and this row exists partly because the code SAID OTHERWISE. Two doc comments and the boot log line all announced a default of "kindergarten per Pre-K + K ONLY scope LAW", a LAW that was REVOKED, while the resolver has defaulted to phd throughout. The one surface reporting the grade cap was naming a bound that does not exist; corrected 2026-09-02. The env var still caps lower for testing.' },
  DREAM_NO_AUTO_GPU: { p: 'config', why: 'The deployed-vs-local posture switch, and its reasoning is operational. Deployed, the backend waits for a REMOTE donor browser that may connect hours after boot — so it waits patiently (24h) and REQUIRES a real donor GPU with no CPU-fallback grace, "or the walk would abort / run on CPU before any donor connects and never train". The walk starts the moment the first donor GPU registers and cortex is ready.' },
  DREAM_SPEAKLOOP: { p: 'config', why: 'Kill switch for the speak-loop drill. ⭐ Its budget carries a real RE-PRICE: worst case is ~150 pairs x 2 rounds x ~2-4s per contrast, about 20 minutes unbounded, "so the budget line exists" — and pairs past the budget are LOGGED as unverified rather than silently skipped. A pair still wrong after the rounds is recorded and the walk continues, because the gate\'s own measurement catches it again later.' },
  DREAM_SPEAKLOOP_MAX_FAILS: { p: 'inherited', why: 'A 20-per-batch ceiling on how many failed pairs get the contrast treatment, with overflow LOGGED rather than dropped silently. The mechanism is reasoned — depress the measured thief in this question\'s context, reinforce the answer, so the next encounter meets a re-aimed basin — but 20 is not derived.' },
  DREAM_SPEAKLOOP_DRILL_ROUNDS: { p: 'inherited', why: 'How many drill rounds a failed pair gets. No derivation at the read site.' },
  DREAM_SPEAKLOOP_DRILL_MAX_MS: { p: 'inherited', why: 'Wall-clock bound on the drill half of the speak loop. No derivation at the read site.' },
  DREAM_SPEAKLOOP_TEACH_ROUNDS: { p: 'inherited', why: 'How many teach rounds a failed pair gets. No derivation at the read site.' },
  DREAM_SPEAKLOOP_TEACH_MAX_MS: { p: 'inherited', why: 'Wall-clock bound on the teach half of the speak loop. No derivation at the read site.' },
  DREAM_TRICKLE_BATCH: { p: 'inherited', why: 'Batch size for the dream-cycle vocabulary trickle. No comment at the read site and no derivation anywhere.' },
  DREAM_BATTERY_GATE_HARD: { p: 'config', why: '⭐ ADVISORY BY DEFAULT, and that is a LAW decision rather than a tuning one: "a cell passes on learning completion, not on test-question correctness". The battery checks and telemetry are all retained and still reported — they simply do not block. Setting this restores the old hard-block behaviour where answer and methodology rates gate the pass.' },

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
  DREAM_SAT_MEANABS: { p: 'derived', why: 'DERIVED 2026-09-03 over 200,000 samples per reference distribution: a uniform spread over [0,wMax] has mean exactly wMax/2 (measured 0.495), so 0.6 is uniform-plus-20% — "has the mean climbed a fifth above an even spread?" docs/THRESHOLD-DERIVATION.md.' },
  DREAM_SAT_RATIO: { p: 'derived', why: 'DERIVED 2026-09-03: uniform gives max/mean = 2.0 (measured 2.02) and perfectly flat gives 1.0, so 1.5 asks "more than halfway from uniform to flat?" Sparse Hebbian weights measure 12 and genuinely sparse ones 48 — healthy cases clear it by an order of magnitude. ANDed with MEANABS, and the AND is load-bearing because the two terms are anti-correlated. docs/THRESHOLD-DERIVATION.md.' },
  DREAM_SAT_SAMPLE: { p: 'derived', why: 'DERIVED 2026-09-03: relative standard error of the mean is CV/√n = 3.16% at n=1000, against a 20% gap to resolve — about 6.3 standard errors. The trade is still real (a larger sample is more trustworthy and slower); 1000 is where it lands. docs/THRESHOLD-DERIVATION.md.' },

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
  DREAM_RANGE_MAX_RUNS: { p: 'derived', why: '⛔ NOT A TUNABLE — it is a PEER CONTRACT, and this entry said otherwise until 2026-09-03. 16 is the donor\'s own acceptance limit (donor.rs:1249); any higher value ships frames the donor DISCARDS IN SILENCE while this side records them as GPU-carried, skipping the CPU pass 4 times in 5. The env var is an upgrade path for a donor with a raised handler cap, not a dial — raising it to buy speed buys the speed with her weights. ⚠ What IS unpriced is the BILL, not the value: worst case +20% wall clock (all 6,278 range dispatches falling to a 221.1 ms CPU pass on a 6,936 s boot), best case zero. rangesRunsOkMax cannot narrow it because a max cannot price a cap; a bucket counter now ships to answer it. Derivation: docs/THRESHOLD-DERIVATION.md.' },
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

// ⛔⛔ AND THE HELPER FORM, WHICH THE PANEL MISSED ENTIRELY UNTIL 2026-09-02.
// A knob read as `_envNum('DREAM_BC_RECTIFY_DECAY', 0.5)` never writes
// `process.env.` on that line, so the direct pattern above cannot see it — and
// **13 knobs were invisible to a panel whose whole claim is that it shows all of
// them.** Among them the sem→motor RECTIFICATION strengths, which are what
// corrects a collapsed emission matrix, and the two K-gate thresholds.
//
// ⚠ Found because the operator asked about attenuation code and one of the knobs
// on the board's own list of 31 could not be found in the panel. **A registry
// that silently omits an access pattern is the same defect class as a counter
// that double-counts** — it reports a complete set and holds a partial one.
const HELPER_RE = /[A-Za-z_$][\w$]*\(\s*['"](DREAM_[A-Z0-9_]+)['"]\s*(?:,|\))/g;

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

/**
 * A literal default sitting beside the read, e.g. `|| 40` or `: 45000`.
 *
 * ⛔ THE `parseInt(x, 10)` RADIX IS STRIPPED FIRST, AND IT HAD TO BE. Without
 * this the parser read the RADIX as the default and recorded
 * `DREAM_SENTENCE_TRANSITION_REPS` as **10** when the code plainly says
 * `let transReps = 24`. **A knob panel that misreports a default is exactly the
 * lying instrument it was built to catch**, and this one lied about two rows
 * until the values were read by hand against their source.
 */
function defaultBeside(line, key) {
  let src = String(line);
  // ⛔ SEARCH AFTER THE KNOB'S OWN POSITION, NOT FROM THE START OF THE LINE.
  // `(this._communityDonorCount || 0) >= (Number(process.env.DREAM_..._MIN_DONORS) || 1)`
  // has TWO `||` defaults on one line, and taking the first attributed the
  // **0 belonging to a different expression** to this knob. Its real default is 1.
  if (key) {
    const at = src.indexOf(key);
    if (at >= 0) src = src.slice(at + key.length);
  }
  const cleaned = src.replace(/parseInt\(([^)]*),\s*\d+\s*\)/g, 'parseInt($1)');
  // ⛔ NUMERIC SEPARATORS COUNT AS PART OF THE NUMBER. `1_800_000` was being read
  // as **1** — a 1.8-million-fold error — because the digit class stopped at the
  // first underscore. Found by auditing this registry against the admin-controls
  // table, where the DOC was right and this parser was wrong.
  const m = cleaned.match(/(?:\|\||\?\?)\s*([0-9][0-9_]*\.?[0-9]*)/)
    || cleaned.match(/:\s*([0-9][0-9_]*\.?[0-9]*)\s*[;,)]/);
  return m ? m[1].replace(/_/g, '') : null;
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
      // ⛔ NEVER SCAN THIS FILE. It is full of knob names in prose and in
      // example code, so scanning itself invented a knob called `DREAM_` out of
      // the elided `DREAM_..._MIN_DONORS` in one of its own comments. A registry
      // that reads its own documentation as evidence will always agree with
      // itself.
      else if (/\.(js|mjs|cjs)$/.test(e.name) && !e.name.includes('.bundle.')
               && path.resolve(p) !== path.resolve(__filename)) files.push(p);
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
      HELPER_RE.lastIndex = 0;
      // ⚠ Both patterns feed one loop, so a knob read either way lands with the
      // identical description, default and site handling. A second loop would
      // have been a second place for the rules to drift apart.
      const hits = [
        ...[...ln.matchAll(ENV_RE)].map((m) => m[1] || m[2]),
        ...[...ln.matchAll(HELPER_RE)].map((m) => m[1]),
      ];
      for (const key of hits) {
        // ⚠ A real knob is `DREAM_` plus at least two characters. The bare
        // prefix and one-letter stubs come from elided names in prose, never
        // from a read site.
        if (!key || !/^DREAM_[A-Z0-9][A-Z0-9_]+$/.test(key)) continue;
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
          dflt: defaultBeside(ln, key) || (doc && doc.dflt) || '—',
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
  // ══ THE CANONICAL CATEGORIES, AND THE GROUP DISPLAY ORDER ═════════════════
  //
  // The requirement: proper organisation and categorisation.
  //
  // ⛔ THE OLD GROUPS WERE NAMED AS ENTRIES WERE WRITTEN, so they answered
  // different questions. `Bounds & budgets` (33) is a cross-cutting SHAPE — a
  // bound on WHAT? — while `GPU dispatch` (1) duplicated `GPU & donor`, and
  // `Other` (17) held the brain's own tick interval.
  //
  // ⭐ THE AXIS IS WHAT THE KNOB GOVERNS, because the person turning one is
  // asking *"what will this change about her?"* and the group name should
  // answer it. The list order is the display order and reads outward from her
  // to the machine: what she is taught → what she says → what she keeps → what
  // she sees → how her brain runs → where it computes → how it is saved → what
  // protects it → how it is served.
  //
  // ⚠ ONE MAP OF 17 ENTRIES, NOT 205 EDITS. Recategorising per-knob would mean
  // touching every entry twice — once now and again when its effect class is
  // read — so the legacy name is mapped wholesale and individual knobs are
  // corrected as each one's read site is visited. Fewer touches, no rework.
  const GROUP_ORDER = [
    'Teaching dose & repetition',
    'Curriculum, gates & schedule',
    'Speech & emission',
    'Memory & consolidation',
    'Vision & imagination',
    'Brain dynamics',
    'GPU & donor',
    'Persistence & checkpoints',
    'Watchdogs, bounds & safety',
    'Serving & network',
    'UNSORTED — no category read yet',
  ];
  const GROUP_MAP = {
    'Learning rate & dose': 'Teaching dose & repetition',
    'Rep compression (dose vs rate)': 'Teaching dose & repetition',
    'Teaching & schedule': 'Curriculum, gates & schedule',
    'Gates & assessment': 'Curriculum, gates & schedule',
    'Chat, emission & language': 'Speech & emission',
    'Consolidation & replay': 'Memory & consolidation',
    "Vision, art & the mind's eye": 'Vision & imagination',
    'Firing & drive': 'Brain dynamics',
    'Cortical microstructure': 'Brain dynamics',
    'Saturation & coherence': 'Brain dynamics',
    'GPU & donor': 'GPU & donor',
    'GPU dispatch': 'GPU & donor',
    'Persistence & checkpoints': 'Persistence & checkpoints',
    'Watchdogs & timing': 'Watchdogs, bounds & safety',
    // ⚠ `Bounds & budgets` lands here WHOLESALE and that is a holding pen, not a
    // verdict: a budget on the teach dose and a watchdog timeout are different
    // subjects. Each moves to the lane it actually governs as it is read.
    'Bounds & budgets': 'Watchdogs, bounds & safety',
    'Network & serving': 'Serving & network',
    // ⛔ RENAMED, NOT KEPT. `Other` reads like a category; it is an admission
    // that nobody has looked. The name now says so, which is the difference
    // between a bucket and a backlog.
    Other: 'UNSORTED — no category read yet',
  };
  const canonicalGroup = (g) => GROUP_MAP[g] || (GROUP_ORDER.includes(g) ? g : 'UNSORTED — no category read yet');

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
  // ⛔⛔ A HAND ENTRY OVERRIDES ONLY THE FIELDS IT DEFINES — IT DOES NOT REPLACE
  // THE DISCOVERED ROW. This used to spread the hand entry wholesale, so an
  // entry written to supply ONE missing field silently dropped every field it
  // did not repeat.
  //
  // ⚠ CAUGHT BY MEASURING RIGHT AFTER DOING IT (2026-09-03). Adding 18 sparse
  // `{key, effect, site, proof}` rows to record effect classes left those knobs
  // with **no group, no default and no description** — they gained one field and
  // lost three, landing in an unnamed group on the panel. **A net worsening,
  // shipped as an improvement**, which is the exact shape this registry exists
  // to expose in other people's code.
  //
  // Discovery is the BASE (it knows the live default and read site by scanning
  // the running source); the hand entry is a sparse overlay on top. That also
  // keeps the original property: the hand-written `site` never rots, because
  // discovery's freshly-resolved line wins over a recorded one.
  const _disc = (() => { try { return discover(); } catch { return new Map(); } })();
  // ⛔⛔ FOLD THE HAND ARRAY BY KEY FIRST — TWO ENTRIES FOR ONE KNOB MUST NOT
  // BOTH SURVIVE. `KNOBS` is written in thematic batches, so the same knob
  // legitimately appears twice: once where its effect class was recorded and
  // again where its category was. Without this fold both rows published, and
  // the panel grew to **210 knobs with 5 duplicates** — caught by the
  // count-and-duplicate check immediately after the edit that caused it.
  //
  // Later entries overlay earlier ones field by field, so a batch can add ONE
  // property to a knob another batch already described without repeating the
  // rest — the same overlay rule that applies between the hand array and
  // discovery, applied within the hand array itself.
  const _folded = [];
  const _foldIdx = new Map();
  for (const k of KNOBS) {
    const at = _foldIdx.get(k.key);
    if (at === undefined) { _foldIdx.set(k.key, _folded.length); _folded.push({ ...k }); continue; }
    const tgt = _folded[at];
    for (const [f, v] of Object.entries(k)) {
      if (v !== undefined && v !== null && v !== '') tgt[f] = v;
    }
  }
  const all = _folded.map((k) => {
    const d = _disc.get(k.key);
    if (!d) return k;
    const merged = { ...d };
    for (const [f, v] of Object.entries(k)) {
      if (v !== undefined && v !== null && v !== '') merged[f] = v;
    }
    // Discovery resolves the line fresh, so its site always wins.
    if (d.site) merged.site = d.site;
    // ⚠ `discovered` must go FALSE once a human has described it, or the
    // `described` completeness count silently keeps counting it as unread.
    merged.discovered = false;
    return merged;
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
    const _g = canonicalGroup(k.group);
    if (!groups.has(_g)) groups.set(_g, []);
    groups.get(_g).push({
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
  // ⛔ THIS COMMENT CLAIMED A SORT THAT DID NOT EXIST. It said *"groups sorted
  // by size so the biggest subjects lead"* — and only the WITHIN-group sort was
  // ever implemented, so group order was insertion order: whatever sequence the
  // hand-written array and the runtime scanner happened to produce. **A comment
  // describing behaviour the code does not have is the same defect as a field
  // nobody renders.**
  //
  // ⭐ AND SIZE WOULD HAVE BEEN THE WRONG RULE ANYWAY: a
  // size-ordered list REARRANGES ITSELF as knobs are added, so a reader who
  // learns where something lives is wrong next week. `GROUP_ORDER` is fixed and
  // meaningful — outward from her to the machine — so position becomes
  // learnable. Knobs stay alphabetical inside each group.
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
    // ⛔⛔ THIS FLAG WAS HARDCODED `false` AND WENT STALE THE DAY ITS OWN
    // PRECONDITION WAS MET. Its note read *"a write lane needs every effect
    // class proven first, and a boot-frozen knob must refuse rather than
    // accept"* — and BOTH of those became true: `unproven` reached 0 when every
    // knob got a classified effect, and `POST /knob` refuses a boot knob with a
    // 409 that names why. The lane shipped, worked, and the panel kept
    // announcing itself read-only.
    //
    // ⭐ SO IT IS DERIVED NOW, NOT ASSERTED. A capability flag that a human has
    // to remember to flip is a field that will go stale again; this one is
    // computed from the same numbers the panel already publishes, so it cannot
    // disagree with them. **Found by the teach-view bench before that bench had
    // ever run against a live brain** — which is the entire argument for having
    // one.
    writable: unproven === 0,
    writeNote: unproven === 0
      ? 'writable — every effect class is proven, and a boot-frozen knob is refused with a 409 rather than accepted and silently ignored'
      : `read-only — ${unproven} knob(s) still have no proven effect class, and an unproven knob must not be offered a control on a guess`,
    // ⭐ Published in `GROUP_ORDER`, so a group's position is a fact about what
    // it governs rather than about how many knobs it currently holds. A name not
    // in the list sorts last rather than being dropped — an unknown category
    // must stay visible, and the UNSORTED pen belongs at the bottom regardless.
    groups: [...groups.entries()]
      .sort((a, b) => {
        const ia = GROUP_ORDER.indexOf(a[0]); const ib = GROUP_ORDER.indexOf(b[0]);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a[0].localeCompare(b[0]);
      })
      .map(([name, knobs]) => ({ name, knobs })),
  };
}

module.exports = { KNOBS, knobState };
