// teachview-bench.js — IS THE TEACH VIEWER ACTUALLY WORKING, RIGHT NOW?
//
// Operator: *"the teacherviewer needsd a full sweep bench that you can perfectly
// work yourself easily have a bennchmarking for all of it so a bench readout and
// all of that to know if shit is working or not"*, and then, correcting a first
// filing that had it exactly backwards: *"IT SHOULD BE : runnable from a press
// and live running during brain training"*.
//
// ⛔⛔ THAT CORRECTION IS THE WHOLE DESIGN. The first version of this was going
// to be an offline command-line auditor, in the shape of the corpus and
// task-number tools. Those audit FILES, which sit still. **Every question the
// teach viewer answers is about a brain that is currently running** — whether
// the ledger is writing, whether a knob write would take, whether a lane is
// quiet or dead, whether the corpus feed is feeding. Run against a stopped brain
// it would have printed green over a corpse, which is worse than no bench,
// because a check carries authority.
//
// ── THE THREE RULES THIS FILE IS BUILT ON ────────────────────────────────────
//
// ⛔ 1. IT MUST NOT DISTURB WHAT IT MEASURES. This project has already paid for
//    that lesson: the `[EventLoop] BLOCKED` warn was a `setInterval` ON THE LOOP
//    IT MEASURED, so it could only print after a block ended and a freeze that
//    never returned printed nothing. Every check here reads ALREADY-PUBLISHED
//    state and counters. No cortex reads, no GPU dispatch, no synchronous file
//    walks, no re-derivation of anything expensive. The bench reports its own
//    wall-clock so a slow bench is visible rather than mysterious.
//
// ⛔ 2. LIVE, "QUIET" AND "DEAD" LOOK IDENTICAL. A lane with nothing to do and a
//    lane that is broken both read zero. So a bare count is never a verdict —
//    every check that can be fooled by stillness carries a FRESHNESS axis: an
//    age, a last-advance value, or a denominator. This is the stalled-mirror
//    defect (a card showing a rate it earned minutes ago) and the wrong-lane
//    counter (a saturated card reading red `idle` because the counter watched
//    the wrong lane) turned into a rule.
//
// ⛔ 3. IT HAS TO BE ABLE TO FAIL. A sweep that always prints green is the
//    defect it exists to catch. `selfTest()` plants faults in a synthetic
//    snapshot and asserts the readout goes RED for each one; the bench refuses
//    to report if its own self-test does not fail where it should.
//
// ── WHY THE CHECKS ARE PURE FUNCTIONS OVER A SNAPSHOT ────────────────────────
// `runBench(snapshot)` takes a plain object and returns a verdict. It touches no
// globals and does no I/O. That is what lets the same code be (a) fired from a
// dashboard press against the live brain and (b) verified here and now against
// captured and planted-fault fixtures, without a running brain to build against.
// The collector that builds the snapshot is the only part that knows about the
// server, and it is deliberately tiny.
'use strict';

// A surface is GREEN (working), RED (broken — say why), or GREY (cannot tell,
// and that is not a pass). ⛔ GREY is a first-class outcome on purpose: the
// alternative is a check that guesses, and a guessing instrument is the thing
// this file exists to replace.
const GREEN = 'GREEN';
const RED = 'RED';
const GREY = 'GREY';

const ok = (name, detail) => ({ name, status: GREEN, detail });
const bad = (name, detail) => ({ name, status: RED, detail });
const grey = (name, detail) => ({ name, status: GREY, detail });

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ── SURFACE 1: THE KNOB REGISTRY ─────────────────────────────────────────────
// The panel's most dangerous column is `effect`, because on a running brain the
// wrong answer is SILENT: a `boot` knob accepts a write, reads back correctly,
// and changes nothing. `???` reached 171 of 205 rows once while the panel looked
// healthy, so its absence is checked as a hard condition rather than a stat.
function checkKnobs(s) {
  const k = s && s.knobs;
  if (!k || !Array.isArray(k.groups)) return grey('knob registry', 'no knob state in the snapshot — the registry did not publish');
  const rows = k.groups.flatMap((g) => (Array.isArray(g.knobs) ? g.knobs : []));
  if (!rows.length) return bad('knob registry', 'the registry published ZERO knobs — a panel with no rows renders as an empty page, not as an error');

  const unclassified = rows.filter((r) => !r.effect || r.effect === '???');
  const noGroup = k.groups.filter((g) => !g.name || /^unsorted/i.test(g.name));
  const noReason = rows.filter((r) => !r.why && !r.proof && !r.what);
  const dupes = rows.length - new Set(rows.map((r) => r.key)).size;

  const faults = [];
  if (unclassified.length) faults.push(`${unclassified.length} knob(s) with no effect class — a write to one of these may be silently ignored (e.g. ${unclassified.slice(0, 3).map((r) => r.key).join(', ')})`);
  if (dupes > 0) faults.push(`${dupes} duplicate knob key(s) — the panel would render one row twice and a write would be ambiguous`);
  if (noGroup.length) faults.push(`${noGroup.length} group(s) unsorted — "Other" is an admission nobody categorised, not a category`);
  if (noReason.length) faults.push(`${noReason.length} knob(s) with no recorded reason for their value`);
  if (faults.length) return bad('knob registry', faults.join(' · '));
  return ok('knob registry', `${rows.length} knobs · ${k.groups.length} groups · every one classified, grouped and reasoned`);
}

// ── SURFACE 2: THE KNOB WRITE LANE ───────────────────────────────────────────
// ⛔ The lane is only correct if it REFUSES as well as accepts. A write lane
// that took a `boot` knob would be worse than none: accepted, echoed back, and
// inert. The snapshot carries what the registry says is writable so the two can
// be compared rather than trusted separately.
// ⚠ `writable` is a CAPABILITY FLAG (boolean), not a count — my first version of
// this check read it as a number, got `null`, and reported GREY. Writing the
// check against the shape I assumed instead of the shape that exists is the same
// class of error the bench hunts, so it is recorded rather than quietly fixed.
function checkWriteLane(s) {
  const k = s && s.knobs;
  if (!k) return grey('knob write lane', 'no knob state — cannot tell whether the lane exists');
  const t = num(k.total);
  const b = num(k.boot);
  const unproven = num(k.unproven);
  if (t === null || b === null) return grey('knob write lane', 'the registry did not publish total/boot counts');
  if (typeof k.writable !== 'boolean') return grey('knob write lane', 'the registry did not publish a writable capability flag');

  // The flag must AGREE with the numbers behind it. A hardcoded flag that
  // disagrees with its own precondition is exactly how this one went stale.
  if (unproven !== null && k.writable === false && unproven === 0) {
    return bad('knob write lane', 'the panel says READ-ONLY while every effect class is proven — the capability flag disagrees with its own precondition, so the page is refusing a control the server would honour');
  }
  if (unproven !== null && k.writable === true && unproven > 0) {
    return bad('knob write lane', `the panel offers writes while ${unproven} knob(s) have no proven effect class — a write to one of those may be silently ignored`);
  }
  if (k.writable === false) {
    return bad('knob write lane', `read-only: ${unproven ?? '?'} knob(s) still unproven — ${k.writeNote || 'no reason published'}`);
  }
  return ok('knob write lane', `writable · ${t} knobs, ${b} refused as boot-frozen with a 409 rather than accepted-and-ignored`);
}

// ── SURFACE 3: THE TEACH LEDGER ──────────────────────────────────────────────
// ⛔⛔ THIS IS THE CHECK MOST EXPOSED TO THE QUIET/DEAD PROBLEM. A ledger with a
// zero row count during an idle moment and a ledger whose writer is broken look
// the same. So `total` alone is never the verdict: the walk's own activity
// decides whether zero is acceptable, and `dropped` is a hard fault at any count
// because a ledger that loses rows lets the page claim completeness it lacks.
function checkLedger(s) {
  const l = s && s.ledger;
  if (!l) return grey('teach ledger', 'no ledger block in the snapshot');
  if (l.available === false) return bad('teach ledger', `ledger not attached: ${l.reason || 'no reason given'} — the page has nothing to render`);
  const total = num(l.total);
  const dropped = num(l.dropped);
  const pending = num(l.pending);
  if (total === null) return grey('teach ledger', 'ledger attached but published no total');
  if (dropped !== null && dropped > 0) return bad('teach ledger', `${dropped} row(s) DROPPED — the ledger lost teaching it was asked to record, so any completeness claim from this page is false`);

  // The freshness axis. `walkActive` says the walk is running; if it is and the
  // ledger has not moved, that is a real fault rather than a quiet moment.
  const walkActive = !!(s.walk && s.walk.active);
  const advanced = num(l.advancedSinceLastBench);
  if (total === 0) {
    return walkActive
      ? bad('teach ledger', 'the walk is ACTIVE and the ledger holds zero rows — the writer is not running')
      : grey('teach ledger', 'zero rows and the walk is not active — quiet, not provably working');
  }
  if (walkActive && advanced === 0) {
    return bad('teach ledger', `${total} rows but NOTHING new since the last bench while the walk is active — the ledger is frozen, not quiet`);
  }
  const fresh = advanced === null ? 'no advance measurement yet' : `+${advanced} since last bench`;
  return ok('teach ledger', `${total} rows · ${pending ?? 0} pending · 0 dropped · ${fresh}`);
}

// ── SURFACE 4: THE CORPUS FEED ───────────────────────────────────────────────
// ⛔ TWO INSTRUMENTS OVER ONE FACT MUST NOT DISAGREE. The viewer says what she is
// being taught from; the coverage auditor says what is reachable. If those
// diverge, at least one of them is lying and the page is the more dangerous one
// because somebody is reading it.
function checkCorpusFeed(s) {
  const c = s && s.corpus;
  if (!c) return grey('corpus feed', 'no corpus block in the snapshot');
  const cells = num(c.cellsWithProse);
  const empty = num(c.emptyCells);
  const words = num(c.reachableWords);
  if (cells === null || words === null) return grey('corpus feed', 'coverage did not publish cell/word counts');
  if (words === 0) return bad('corpus feed', 'ZERO reachable words — she has nothing to read; the data repo is missing or the corpus path is wrong');
  if (cells === 0) return bad('corpus feed', 'ZERO cells carry prose while words are non-zero — the reachability rule and the word count disagree');
  const missing = num(c.missingLane);
  if (missing !== null && missing > 0) return bad('corpus feed', `${missing} cell(s) the walk runs have NO prose lane — those cells teach nothing and the page would not say so`);
  const emptyNote = empty ? ` · ${empty} empty (expected only where a subject has no prose lane by design)` : '';
  return ok('corpus feed', `${cells} cells with prose · ${words.toLocaleString()} reachable words${emptyNote}`);
}

// ── SURFACE 5: THE FIGURE LANE ───────────────────────────────────────────────
// ⛔⛔ AN LFS POINTER STUB IS A REAL FILE. Without `git lfs pull` every field on
// disk is a ~130-byte pointer, so a naive existence check reports a healthy
// cache while she perceives nothing. The store counts stubs separately for
// exactly this reason, and a stub count above zero is a hard fault — it means
// the press pulled the repo and not its contents.
function checkFigures(s) {
  const f = s && s.figures;
  if (!f) return grey('figure lane', 'no figure block in the snapshot');
  const stub = num(f.stub);
  const hit = num(f.hit);
  const miss = num(f.miss);
  const malformed = num(f.malformed);
  if (stub !== null && stub > 0) return bad('figure lane', `${stub} LFS POINTER STUB(S) read as fields — the field sync cloned the repo without pulling its contents, so these figures are invisible to her while the cache looks full`);
  if (malformed !== null && malformed > 0) return bad('figure lane', `${malformed} malformed field(s) — present, parsed, and not a field`);
  if (hit === null && miss === null) return grey('figure lane', 'the field store published no hit/miss counters');
  const total = (hit || 0) + (miss || 0);
  if (total === 0) return grey('figure lane', 'no figure reads yet — quiet, not provably working');
  // A miss is NOT a fault: it costs a live fetch + transform, which is the
  // behaviour that shipped before the store existed. It is reported as a rate so
  // a collapsing cache is visible.
  const hitPct = ((hit || 0) / total * 100).toFixed(1);
  return ok('figure lane', `${hit || 0} hit / ${miss || 0} miss (${hitPct}% served from the store) · 0 stubs · 0 malformed · a miss degrades to live transform, it does not break her`);
}

// ── SURFACE 6: EVERY PUBLISHED FIELD HAS A PRODUCER ──────────────────────────
// ⛔ The recurring defect of this whole project: a field the page renders that
// nothing ever writes. It reads as a truthful zero forever. Any field the
// snapshot declares as rendered must appear in the produced set.
function checkFieldProducers(s) {
  const r = s && s.rendered;
  if (!Array.isArray(r) || !r.length) return grey('rendered fields', 'the snapshot declared no rendered field list — cannot tell whether anything is dark');
  const dark = r.filter((x) => x && x.rendered && !x.produced);
  if (dark.length) {
    return bad('rendered fields', `${dark.length} field(s) rendered by the page with NO producer — they will read zero forever and look healthy: ${dark.slice(0, 4).map((x) => x.name).join(', ')}`);
  }
  return ok('rendered fields', `${r.length} rendered field(s), every one has a producer`);
}

const CHECKS = [checkKnobs, checkWriteLane, checkLedger, checkCorpusFeed, checkFigures, checkFieldProducers];

/**
 * Run every surface check over a snapshot. Pure: no I/O, no globals.
 * @param {object} snapshot
 * @returns {{verdict:string, working:boolean, surfaces:Array, red:number, grey:number, green:number, ms:number}}
 */
function runBench(snapshot) {
  const t0 = Date.now();
  const surfaces = CHECKS.map((fn) => {
    try { return fn(snapshot || {}); }
    catch (e) { return bad(fn.name, `the check itself threw: ${(e && e.message) || e} — a bench that crashes is a bench that reports nothing`); }
  });
  const red = surfaces.filter((x) => x.status === RED).length;
  const greyN = surfaces.filter((x) => x.status === GREY).length;
  const green = surfaces.filter((x) => x.status === GREEN).length;
  // ⛔ GREY DOES NOT PASS. "Cannot tell" is not "working", and rounding it up to
  // green is precisely how a surface stops being looked at.
  const working = red === 0 && greyN === 0;
  return {
    verdict: red > 0 ? 'NOT WORKING' : (greyN > 0 ? 'UNPROVEN' : 'WORKING'),
    working,
    surfaces,
    red,
    grey: greyN,
    green,
    ms: Date.now() - t0,
  };
}

/** Human-readable readout — the thing a press puts on the page and in the console ring. */
function formatBench(b) {
  const lines = [];
  lines.push('TEACH VIEWER BENCH');
  for (const s of b.surfaces) {
    const mark = s.status === GREEN ? 'GREEN' : (s.status === RED ? 'RED  ' : 'GREY ');
    lines.push(`  [${mark}] ${s.name} — ${s.detail}`);
  }
  lines.push('');
  lines.push(`  ${b.verdict}  (${b.green} green · ${b.red} red · ${b.grey} grey)  bench cost ${b.ms}ms`);
  if (b.grey > 0 && b.red === 0) {
    lines.push('  ⚠ UNPROVEN is not a pass. A grey surface is one this bench could not see,');
    lines.push('     usually because the walk was idle — re-run it during teaching.');
  }
  return lines.join('\n');
}

// ── THE SELF-TEST — THE BENCH PROVING IT CAN GO RED ──────────────────────────
// ⛔⛔ A sweep that always prints green is the defect it exists to catch, so this
// is not optional decoration: `runBench` refuses to be trusted unless every
// planted fault below actually turns its surface RED. Each fixture is a REAL
// failure this project has already had, not an invented one.
function healthySnapshot() {
  return {
    walk: { active: true },
    knobs: {
      total: 3, writable: true, boot: 1, unproven: 0, writeNote: 'writable',
      groups: [{
        name: 'Teaching dose & repetition',
        knobs: [
          { key: 'A', effect: 'live', why: 'measured' },
          { key: 'B', effect: 'boot', proof: 'module scope' },
          { key: 'C', effect: 'live', what: 'described' },
        ],
      }],
    },
    ledger: { available: true, total: 1200, pending: 3, dropped: 0, advancedSinceLastBench: 40 },
    corpus: { cellsWithProse: 189, emptyCells: 4, reachableWords: 56615176, missingLane: 0 },
    figures: { hit: 900, miss: 100, stub: 0, malformed: 0 },
    rendered: [{ name: 'teachRate', rendered: true, produced: true }],
  };
}

const FAULTS = [
  ['a knob with no effect class (a write to it is silently ignored)',
    (s) => { s.knobs.groups[0].knobs[0].effect = '???'; }],
  ['the panel says read-only while every effect class is proven (the stale capability flag this bench actually found)',
    (s) => { s.knobs.writable = false; s.knobs.writeNote = 'read-only'; }],
  ['the panel offers writes while knobs are still unproven (a write may be silently ignored)',
    (s) => { s.knobs.unproven = 6; }],
  ['the ledger dropped rows (it lost teaching it was asked to record)',
    (s) => { s.ledger.dropped = 7; }],
  ['the ledger frozen while the walk is active (dead, not quiet)',
    (s) => { s.ledger.advancedSinceLastBench = 0; }],
  ['zero reachable words (the data repo is missing)',
    (s) => { s.corpus.reachableWords = 0; }],
  ['a cell the walk runs with no prose lane',
    (s) => { s.corpus.missingLane = 2; }],
  ['LFS pointer stubs read as fields (cache looks full, she sees nothing)',
    (s) => { s.figures.stub = 12; }],
  ['a field the page renders that nothing produces',
    (s) => { s.rendered.push({ name: 'colorSurge', rendered: true, produced: false }); }],
];

/**
 * @returns {{passed:boolean, results:Array}} — passed only if EVERY planted
 * fault turned the readout red AND the healthy fixture came back working.
 */
function selfTest() {
  const results = [];
  const base = runBench(healthySnapshot());
  results.push({ name: 'healthy snapshot reads WORKING', pass: base.working === true, got: base.verdict });
  for (const [name, plant] of FAULTS) {
    const s = healthySnapshot();
    plant(s);
    const b = runBench(s);
    results.push({ name: `planted fault turns it RED: ${name}`, pass: b.red > 0, got: b.verdict });
  }
  return { passed: results.every((r) => r.pass), results };
}

// ── THE COLLECTOR — THE ONLY PART THAT KNOWS ABOUT THE SERVER ────────────────
//
// ⛔⛔ EVERY READ HERE IS OF ALREADY-PUBLISHED STATE. Nothing is recomputed.
// That is rule 1, and it is not a style preference: this runs on the loop the
// walk, the donor and the WS pump all share, so a filesystem sweep or a cortex
// read here would corrupt the very training it is reporting on.
//
//   • `knobState()` — 3 ms after its first call (measured; the first is 242 ms
//     because it discovers knobs from source, and that has already happened by
//     the time a press can fire).
//   • `_curriculumCoverage` — computed ONCE at boot and cached as a plain object
//     for exactly this reason; the server's own comment says recomputing it per
//     push "would put a filesystem sweep on the loop the donor and WS pump
//     share". This reads the cache. It never calls `computeCoverage`.
//   • `ledger.stats()` — a COUNT(*) on an indexed table plus in-memory counters.
//   • `fieldStoreStats()` — plain in-memory counters.
//
// ⭐ THE LEDGER ADVANCE IS THE FRESHNESS AXIS, and it needs memory across calls:
// "1,200 rows" cannot distinguish a working ledger from a frozen one. The caller
// holds the previous total, so the bench can say "+40 since last bench" — and a
// zero advance during an active walk becomes a RED rather than a shrug.
function collect(ctx) {
  const s = { walk: {}, knobs: null, ledger: null, corpus: null, figures: null, rendered: [] };
  const brain = (ctx && ctx.brain) || {};

  try { s.knobs = require('./knob-registry.js').knobState(); } catch (e) { s.knobs = null; }

  try {
    const led = brain._teachLedger;
    s.ledger = led ? led.stats() : { available: false, reason: 'ledger not attached — the curriculum has not booted yet' };
    const prev = ctx && typeof ctx.prevLedgerTotal === 'number' ? ctx.prevLedgerTotal : null;
    if (s.ledger && typeof s.ledger.total === 'number' && prev !== null) {
      s.ledger.advancedSinceLastBench = s.ledger.total - prev;
    }
  } catch (e) { s.ledger = { available: false, reason: `ledger stats threw: ${(e && e.message) || e}` }; }

  try {
    const c = brain._curriculumCoverage;
    if (c) {
      s.corpus = {
        cellsWithProse: (c.needProse || 0) - (c.empty || 0),
        emptyCells: c.empty || 0,
        reachableWords: c.reachableWords || 0,
        missingLane: c.missingLane || 0,
      };
    }
  } catch { s.corpus = null; }

  try { s.figures = require('./figure-field-store.js').fieldStoreStats(); } catch { s.figures = null; }

  // ⚠ The walk-active flag decides whether a zero is "quiet" or "dead", so it is
  // the single most load-bearing field in the snapshot. Read from whichever
  // signal the brain publishes; absent, everything degrades to GREY rather than
  // to a false green.
  try {
    s.walk.active = !!(brain._curriculumRunning || (brain.curriculum && brain.curriculum.running));
  } catch { s.walk.active = false; }

  return s;
}

/** One call for the press path: collect, bench, format. Returns both the object and the text. */
function benchNow(ctx) {
  const snapshot = collect(ctx);
  const result = runBench(snapshot);
  return { result, snapshot, text: formatBench(result), ledgerTotal: (snapshot.ledger && snapshot.ledger.total) || 0 };
}

module.exports = { runBench, formatBench, selfTest, healthySnapshot, collect, benchNow, GREEN, RED, GREY };
