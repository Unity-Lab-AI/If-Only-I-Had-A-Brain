#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// gate-walk-check.mjs — LOCAL gate-logic + cell-transition diagnostic
// ═══════════════════════════════════════════════════════════════════════
//
// A fast, local, deterministic walk-through of the ENTIRE K→PhD curriculum
// cell sequence to prove the GATE LOGIC and CELL→CELL TRANSITIONS have no
// bugs or hang-ups "between finishing up between cells". It does NOT teach
// or run a real brain/GPU — that needs a donor and can't be "very quick".
// Instead it stubs the heavy seams (teach / emission / dream window) so
// every cell deterministically "emits a→z", then drives the REAL walk
// drivers (`runSubjectGrade`, `runCompleteCurriculum`) + the REAL gate-
// enforcement + advance logic, under a per-cell watchdog that FAILS LOUD
// if any cell hangs.
//
// NOTE on the project's NO-TESTS LAW: this is a manual DIAGNOSTIC you run
// and read — not an automated unit-test suite wired into CI. It exists so
// "verify by reading output" (the LAW's preferred method) can cover the
// whole walk at once instead of staring at a live 100-min run.
//
// USAGE (on your machine, from the repo root):
//     node scripts/gate-walk-check.mjs
//
// ENV KNOBS:
//     GATE_WALK_PER_CELL_MS   per-cell hang watchdog (default 4000)
//     GATE_WALK_VERBOSE=1     print every cell line (default: phase summaries)
//
// EXIT CODE: 0 = all green · 1 = a hang / missing dispatch / gate-logic
//            mismatch was found.
// ═══════════════════════════════════════════════════════════════════════

import { Curriculum, GRADE_ORDER, SUBJECTS, ALPHABET_ORDER } from '../js/brain/curriculum.js';

const PER_CELL_MS = Number(process.env.GATE_WALK_PER_CELL_MS) || 4000;
const VERBOSE = process.env.GATE_WALK_VERBOSE === '1';
const AZ = ALPHABET_ORDER || 'abcdefghijklmnopqrstuvwxyz';

let failures = 0;
const log = (s) => process.stdout.write(s + '\n');
const fail = (s) => { failures++; log('  ✗ ' + s); };
const ok = (s) => log('  ✓ ' + s);

// ── A bounded await: rejects if `p` doesn't settle within `ms`. This is the
//    hang detector — a real cell-transition hang trips it instead of parking
//    the harness forever (the exact failure mode this tool exists to catch).
function withTimeout(p, ms, label) {
  let t;
  const guard = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`HANG — ${label} did not settle within ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve(p).finally(() => clearTimeout(t)), guard]);
}

// ── Minimal fake cluster: only the fields the gate + transition logic read.
//    Heavy cluster methods (step / generateSentenceAwait / GPU) are NEVER
//    reached because we stub the probe + teach seams below.
function makeCluster() {
  return {
    grades: { ela: 'pre-K', math: 'pre-K', science: 'pre-K', social: 'pre-K', art: 'pre-K', life: 'pre-K' },
    passedCells: [],
    subGrades: { ela: 'fresh', math: 'fresh', science: 'fresh', social: 'fresh', art: 'fresh', life: 'fresh' },
    advanceSubGrade: () => true,
    _currentCellKey: null,
    _lastGateResult: {},
    _probeGateActive: false,
    _inCurriculumMode: false,
    _activePhase: null,
    dictionary: null,
  };
}

// ── Build a Curriculum wired to a fresh fake cluster, with the heavy seams
//    stubbed. `probeScore` drives whether each student probe "passes" (1) or
//    "fails" (0), so the gate-decision branches can be exercised. Every probe
//    deterministically emits the alphabet a→z (the "print a→z for each test").
function buildStubbed(probeScore) {
  const cluster = makeCluster();
  const c = new Curriculum(cluster, null, null);
  c._lastCtx = { gateWalk: true }; // satisfies runSubjectGrade's ctx guard

  // teach bypassed — substrate "passes" so the gate logic runs on top of it.
  c._cellRunner = () => async () => ({ pass: true, reason: 'gate-walk: substrate stub (teach bypassed)' });
  // every probe emits a→z; score is the scenario knob.
  c._studentTestProbe = async (opts = {}) => ({
    question: opts.question || '', answer: AZ,
    match: { exact: probeScore >= 1, startsWith: probeScore >= 1, contains: probeScore >= 1, overall: probeScore >= 1 },
    score: probeScore, methodology: probeScore >= 1, logic: probeScore >= 1,
    retention: probeScore >= 1, understanding: probeScore >= 1, ticks: 5, ms: 0,
    methodologyScore: probeScore >= 1 ? 1 : 0, emissionDiag: null,
  });
  // Battery emits a→z per question and passes/fails by probeScore. We stub the
  // whole battery (not just the probe) so the diagnostic stays fast + clean and
  // free of teach/dictionary deps — the real battery internals + GPU aren't the
  // gate-transition concern, and #112.9 already covers battery-level hangs. The
  // REAL gate-enforcement below still runs on this result (advance vs block).
  c._runStudentBattery = async (questions = []) => {
    const total = questions.length || 0;
    const passing = probeScore >= 1;
    const results = questions.map((q) => ({
      question: q.question, answer: AZ, score: probeScore,
      match: { overall: passing }, standard: q.standard || 'GATE.WALK', source: q.source || 'gate-walk',
    }));
    return {
      pass: passing ? total : 0, total, rate: passing ? 1 : 0, summary: '', results,
      byStandard: [], standardsBelowCut: 0, methoQuestions: 0, methoPass: 0, methoRate: 0,
      externalPass: 0, externalTotal: 0, externalRate: passing ? 1 : 0,
    };
  };
  c._measureEmissionCapability = async () => ({ canTalkAtAll: true, recognizedLetters: 5, maxEmissionLen: 26 });
  c._runMethodologyBattery = async () => ({ cellKey: '', total: 0, passed: 0, rate: 0, results: [], elapsedMs: 0 });
  c._teachVocabList = async () => {};       // teach bypassed (upfront exam-vocab prefetch)
  c._dreamWindow = async () => {};          // skip the 60s consolidation window
  c._saveCheckpoint = () => {};             // no disk I/O
  c._memorySnapshotAndGc = () => {};        // no gc churn
  c._studentQuestionBank = () => ([         // tiny a→z bank so the gate block runs
    { question: 'say the letter a', expectedAnswer: 'a', expectedVariants: ['a'], standard: 'GATE.WALK', source: 'gate-walk' },
    { question: 'say the letter b', expectedAnswer: 'b', expectedVariants: ['b'], standard: 'GATE.WALK', source: 'gate-walk' },
    { question: 'say the letter c', expectedAnswer: 'c', expectedVariants: ['c'], standard: 'GATE.WALK', source: 'gate-walk' },
  ]);
  // quiet the heartbeat/flush helper — keep behavior, drop the noise.
  if (!VERBOSE) c._hb = () => {};
  return { c, cluster };
}

// ════════════════════════════ PHASE 1 ════════════════════════════
// Dispatch coverage: every (subject, grade) cell must resolve to a runner
// function via _cellRunnerRaw (no missing case, no throw building the
// closure). This builds the closures only — it does NOT execute teach.
async function phase1() {
  log('\n── PHASE 1 — cell dispatch coverage (every K→PhD cell resolves) ──');
  const { c } = buildStubbed(1);
  let cells = 0, bad = 0;
  for (const grade of GRADE_ORDER) {
    for (const subject of SUBJECTS) {
      cells++;
      try {
        const fn = c._cellRunnerRaw(subject, grade);
        if (typeof fn !== 'function') { bad++; fail(`${subject}/${grade}: dispatch did not return a runner (${typeof fn})`); }
      } catch (e) { bad++; fail(`${subject}/${grade}: dispatch THREW — ${e.message}`); }
    }
  }
  if (bad === 0) ok(`${cells} cells (${SUBJECTS.length} subjects × ${GRADE_ORDER.length} grades) all resolve to a runner`);
  else fail(`${bad}/${cells} cells failed dispatch`);
}

// ════════════════════════════ PHASE 2 ════════════════════════════
// Gate decision logic — the code touched by #112.9b. One cell, three
// scenarios, asserting the pass/block outcome:
//   (a) passing battery               → advance
//   (b) failing battery, advisory OFF → BLOCK (result.pass downgraded)
//   (c) failing battery, advisory ON  → advance ("cavewoman so be it")
async function phase2() {
  log('\n── PHASE 2 — gate decision logic (advance vs block) ──');
  const scenarios = [
    { name: 'passing battery → advance',               score: 1, advisory: '0', expectPass: true },
    { name: 'failing battery + advisory OFF → BLOCK',   score: 0, advisory: '0', expectPass: false },
    { name: 'failing battery + advisory ON  → advance', score: 0, advisory: '1', expectPass: true },
  ];
  const prev = process.env.DREAM_BATTERY_GATE_ADVISORY;
  for (const s of scenarios) {
    process.env.DREAM_BATTERY_GATE_ADVISORY = s.advisory;
    const { c } = buildStubbed(s.score);
    let res;
    try {
      res = await withTimeout(c.runSubjectGrade('ela', 'kindergarten', null, {}), PER_CELL_MS, `gate:${s.name}`);
    } catch (e) { fail(`${s.name}: ${e.message}`); continue; }
    if (!!res?.pass === s.expectPass) ok(`${s.name}  (result.pass=${!!res?.pass})`);
    else fail(`${s.name}: expected pass=${s.expectPass}, got pass=${!!res?.pass} — reason: ${String(res?.reason || '').slice(0, 100)}`);
  }
  if (prev === undefined) delete process.env.DREAM_BATTERY_GATE_ADVISORY;
  else process.env.DREAM_BATTERY_GATE_ADVISORY = prev;
}

// ════════════════════════════ PHASE 3 ════════════════════════════
// Full traversal — walk every subject pre-K→PhD via the REAL
// runCompleteCurriculum loop, each cell wrapped in the hang watchdog.
// Asserts: every subject reaches PhD, every grade passes, clean transitions,
// and NO cell exceeds the watchdog (the "hang-up when a cell was done" bug).
async function phase3() {
  log('\n── PHASE 3 — full K→PhD traversal + per-cell hang watchdog ──');
  process.env.DREAM_MAX_GRADE = 'phd';                 // uncap the grade ceiling
  process.env.DREAM_BATTERY_GATE_ADVISORY = '1';       // match live deploy
  const { c } = buildStubbed(1);

  // Per-cell watchdog + a→z log, wrapping the REAL runSubjectGrade.
  const realRSG = c.runSubjectGrade.bind(c);
  const timings = [];
  c.runSubjectGrade = async (subject, grade, corpora, opts) => {
    const t0 = Date.now();
    const res = await withTimeout(realRSG(subject, grade, corpora, opts), PER_CELL_MS, `${subject}/${grade}`);
    const ms = Date.now() - t0;
    timings.push({ subject, grade, ms, pass: !!res?.pass });
    if (VERBOSE) log(`     ${res?.pass ? '✓' : '·'} ${subject}/${grade}  a→z (${ms}ms)`);
    return res;
  };

  let hung = false;
  for (const subject of SUBJECTS) {
    let reached;
    try {
      // runFullSubjectCurriculum = the per-subject grade walker (pre-K→PhD,
      // pass→dream→next / readyAndWaiting→break / fail→break). No GPU-ready
      // wait, unlike the all-subjects runCompleteCurriculum entry.
      const r = await c.runFullSubjectCurriculum(subject, null, {});
      reached = r?.reached;
    } catch (e) {
      hung = true;
      fail(`${subject}: walk threw/hung — ${e.message}`);
      continue;
    }
    if (reached === 'phd') ok(`${subject}: walked pre-K → PhD cleanly (${timings.filter(t => t.subject === subject).length} cells)`);
    else fail(`${subject}: stopped at '${reached}' (did not reach PhD)`);
  }

  const total = timings.length;
  const slowest = timings.slice().sort((a, b) => b.ms - a.ms)[0];
  log(`  · walked ${total} cells; slowest ${slowest ? `${slowest.subject}/${slowest.grade} ${slowest.ms}ms` : 'n/a'}; watchdog ${PER_CELL_MS}ms`);
  if (!hung && total === SUBJECTS.length * GRADE_ORDER.length) ok(`all ${total} cells transitioned without a hang`);
  else if (!hung) log(`  (note: ${total} cells walked; ${SUBJECTS.length * GRADE_ORDER.length} = full matrix)`);
}

// ════════════════════════════ MAIN ════════════════════════════
(async () => {
  log('═══ Unity gate-walk diagnostic — gate logic + cell transitions, K→PhD ═══');
  log(`grades: ${GRADE_ORDER.length} (${GRADE_ORDER[0]}…${GRADE_ORDER[GRADE_ORDER.length - 1]}) · subjects: ${SUBJECTS.join(', ')}`);
  try {
    await phase1();
    await phase2();
    await phase3();
  } catch (e) {
    fail(`harness error: ${e && e.stack ? e.stack : e}`);
  }
  log('\n═══ RESULT ═══');
  if (failures === 0) { log('✓ ALL GREEN — every cell dispatches, gate logic is correct, full K→PhD walk transitions with no hangs.'); process.exit(0); }
  else { log(`✗ ${failures} FAILURE(S) — see ✗ lines above.`); process.exit(1); }
})();
