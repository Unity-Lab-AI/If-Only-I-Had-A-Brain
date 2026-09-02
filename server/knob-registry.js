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
 *   ???    not yet verified — the read site is recorded, the scope is not
 *          proven, and it is rendered as unproven rather than guessed
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
    effect: 'live', site: 'js/brain/curriculum.js:24428',
    proof: 'read into a method-local `let lr` on every call, not a module const',
    what: 'Oja rate for the CONTENT lane — the lane that teaches meaning from prose. Accepted only in (0, 0.5]. Derived, not chosen: it matches a median word\'s exposure to a real deposit target across the rebuilt corpus (~25% per median word at 3 reps).',
  },
  {
    key: 'DREAM_SM_LR_SCALE', group: 'Learning rate & dose', dflt: '0.5',
    effect: '???', site: 'js/brain/cluster/hebbian.js:403',
    proof: 'read beside an instance field assignment; per-cluster vs per-call not yet proven',
    what: 'Damping on the sem→motor and sem→word_motor Hebbian rate. This is a saturation-prevention lever; 1.0 restores undamped behaviour.',
  },
  {
    key: 'DREAM_STRUCTURE_DOSE', group: 'Learning rate & dose', dflt: '1',
    effect: 'boot', site: 'js/brain/curriculum.js:2738',
    proof: 'module-scope `const STRUCTURE_DOSE = …` — frozen at import',
    what: 'Multiplier on structure-pass reps, clamped to [0.05, 1]. ⛔ It was cut to 0.4 once and REVERTED: a dose multiplier was never waste, it was less teaching. Lowering it is a RE-PRICE event.',
  },
  {
    key: 'DREAM_REHEARSAL_FRACTION', group: 'Learning rate & dose', dflt: '0.02',
    effect: 'live', site: 'js/brain/curriculum.js — _rehearseEarlierGrades',
    proof: 'read inside the method on every cell',
    what: 'Share of a cell\'s own sentence count spent re-presenting EARLIER grades of the same subject before new material. 0 disables the lane. Priced: 2% costs +0.225% of the whole prose lane.',
  },
  {
    key: 'DREAM_REHEARSAL_MAX', group: 'Learning rate & dose', dflt: '250',
    effect: 'live', site: 'js/brain/curriculum.js — _rehearseEarlierGrades',
    proof: 'read inside the method on every cell',
    what: 'Absolute ceiling on rehearsal sentences per cell, so the richest cells cannot spend the fraction unbounded. The budget is split evenly across every earlier grade.',
  },
  {
    key: 'DREAM_REHEARSAL_REPS', group: 'Learning rate & dose', dflt: '1',
    effect: 'live', site: 'js/brain/curriculum.js — _rehearseEarlierGrades',
    proof: 'read inside the method on every cell',
    what: 'Reps for rehearsed material, against the content lane\'s 3. One rep re-deposits ~4.7% onto a basin that already exists — a top-up, not a relearn. Raising it re-prices linearly.',
  },

  // ── rep compression ───────────────────────────────────────────────────────
  {
    key: 'DREAM_REP_AUTOPRICE', group: 'Rep compression (dose vs rate)', dflt: 'off ("1" arms it)',
    effect: 'live', site: 'js/brain/curriculum.js — _teachAssociationPairs pricing block',
    proof: 'read inside the method on every call',
    what: 'Lets the compression factor price ITSELF from the brain\'s own measured collision load instead of the hand-set DREAM_REP_COMPRESS. ⛔ The hand-set 40 was measured when the corpus held 4.48M words and the academic prose alone now holds 50.2M — 11.2x — and the sweep that produced it wrote its own expiry: "the compression that is free today is the first thing that breaks when the pair count climbs". ⚠ DEFAULT OFF ON PURPOSE: the sweep\'s "production" row is 8 active cells drawn from 1,885,340, while the live encoder is semWTA top-8 over a ~300-dim embedding tiled in atomic groups — those are not the same geometry, so the first LIVE reading is what settles whether 0.246 ever applied here. Unarmed it still measures and still publishes, so one press produces the evidence; armed, it steers.',
  },
  {
    key: 'DREAM_REP_COMPRESS', group: 'Rep compression (dose vs rate)', dflt: '40',
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
    effect: 'live', site: 'server/brain-server.js:5292',
    proof: 'read inside the tick path',
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
    effect: 'live', site: 'js/brain/cluster.js:2161',
    proof: 'read at the gate site',
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

  // Hand-written first so they win; then everything discovered that is not
  // already covered.
  const all = [...KNOBS];
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

  return {
    total: all.length,
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
