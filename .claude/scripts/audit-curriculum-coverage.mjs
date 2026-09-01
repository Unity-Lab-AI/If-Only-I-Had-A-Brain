// audit-curriculum-coverage.mjs — DOES EVERY CELL THE WALK RUNS HAVE CONTENT?
//
// ⛔⛔ THE QUESTION THIS ANSWERS IS NOT "how deep is each corpus file". That
// question was asked for a year and always came back fine, because a file that
// is never read still has words in it. Two failures proved it:
//
//   • 268,481 words sat in corpora/academic/cs/college*, /grad, /phd and in
//     civics|economics|psychology/college* — subjects RETIRED at grade12, so
//     the walk never reaches those cells. Every one would have passed a
//     depth check while training nothing.
//   • 71 cells (art, pe, music, health, language, ap) RAN with no prose lane
//     at all, because their subjects were absent from PROSE_ACADEMIC_SUBJECTS.
//     A per-file depth check cannot see a file that was never expected.
//
// So this audit starts from the WALK, not from the filesystem: it asks the
// curriculum itself which (subject, grade) cells are actually owed, and only
// then asks whether each one has content. Reachability first, depth second.
//
// RUN:  node .claude/scripts/audit-curriculum-coverage.mjs
//       node .claude/scripts/audit-curriculum-coverage.mjs --json
// No network. Reads the live curriculum module and corpora/academic/.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CORPUS = path.join(ROOT, 'corpora', 'academic');

// pathToFileURL, not a raw path — on Windows an absolute path starts with a
// drive letter and Node's ESM loader reads `c:` as an unsupported URL scheme.
const mod = await import(pathToFileURL(path.join(ROOT, 'js', 'brain', 'curriculum.js')).href);
const { GRADE_ORDER, PROSE_ACADEMIC_SUBJECTS, subjectsForGrade, subjectsOwedAt } = mod;

// Steady state: assume every cell up to each grade has been passed, so the
// retirement rules apply exactly as they will on a completed walk. Retirement
// is ledger-gated (an untrained subject stays owed), so this is the roster a
// healthy walk sees rather than the debt-carrying one.
const passed = new Set();
for (const g of GRADE_ORDER) for (const s of subjectsForGrade(g)) passed.add(`${s}/${g}`);

// Grade bands, mirroring the ingest. Depth expectations differ by band because
// a real year is a different size at every grade — a flat target is the same
// mistake as a flat sentence cap.
const BAND = {
  'pre-K': 'early', kindergarten: 'early', grade1: 'early', grade2: 'early',
  grade3: 'middle', grade4: 'middle', grade5: 'middle',
  grade6: 'upper', grade7: 'upper', grade8: 'upper',
  grade9: 'high', grade10: 'high', grade11: 'high', grade12: 'high',
  college1: 'college', college2: 'college', college3: 'college', college4: 'college',
  grad: 'grad', phd: 'grad',
};
// Minimum words for a cell to count as "real" at that band. These are FLOORS
// for flagging, not targets — a cell above the floor is not thereby finished.
const FLOOR = { early: 2000, middle: 5000, upper: 15000, high: 20000, college: 20000, grad: 20000 };

// BY DESIGN, and this list is the only thing that may be absent without being
// a defect. Math is taught equationally; the lived year is hand-authored.
// Anything else missing a lane is a finding, not a policy.
const BY_DESIGN_NO_PROSE = new Set(['math', 'life']);

function cellWords(subject, grade) {
  const f = path.join(CORPUS, subject, `${grade}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const experiences = j.experiences || [];
    let words = 0, sents = 0, licensed = 0;
    for (const e of experiences) {
      words += e.story.split(/\s+/).length;
      sents += e.story.split(/(?<=[.!?])\s+/).length;
      if (e.licence) licensed++;
    }
    return { words, sents, entries: experiences.length, licensed };
  } catch { return null; }
}

const run = [], missingLane = [], empty = [], thin = [], ok = [];
for (const grade of GRADE_ORDER) {
  for (const subject of subjectsOwedAt(grade, passed)) {
    run.push({ subject, grade });
    if (!PROSE_ACADEMIC_SUBJECTS.has(subject)) {
      if (!BY_DESIGN_NO_PROSE.has(subject)) missingLane.push({ subject, grade });
      continue;
    }
    const c = cellWords(subject, grade);
    if (!c || c.entries === 0) { empty.push({ subject, grade }); continue; }
    const floor = FLOOR[BAND[grade]] ?? 5000;
    if (c.words < floor) thin.push({ subject, grade, words: c.words, floor });
    else ok.push({ subject, grade, words: c.words });
  }
}

// ⛔ THE REVERSE CHECK — corpus files for cells the walk does NOT run. This is
// the half that a depth-only audit is structurally blind to, and it is where
// 268,481 words were found hiding.
const reachable = new Set(run.map((c) => `${c.subject}/${c.grade}`));
const unreachable = [];
if (fs.existsSync(CORPUS)) {
  for (const s of fs.readdirSync(CORPUS)) {
    const d = path.join(CORPUS, s);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.json')) continue;
      const g = f.replace(/\.json$/, '');
      if (!reachable.has(`${s}/${g}`)) {
        const c = cellWords(s, g);
        unreachable.push({ subject: s, grade: g, words: c ? c.words : 0 });
      }
    }
  }
}

const totals = ok.reduce((a, c) => a + c.words, 0) + thin.reduce((a, c) => a + c.words, 0);
const report = {
  cellsWalkRuns: run.length,
  needProse: run.length - run.filter((c) => !PROSE_ACADEMIC_SUBJECTS.has(c.subject)).length,
  ok: ok.length, thin: thin.length, empty: empty.length,
  missingLane: missingLane.length, byDesignNoProse: run.filter((c) => BY_DESIGN_NO_PROSE.has(c.subject)).length,
  unreachableFiles: unreachable.length,
  unreachableWords: unreachable.reduce((a, c) => a + c.words, 0),
  reachableWords: totals,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...report, empty, thin, missingLane, unreachable }, null, 2));
} else {
  console.log('CURRICULUM COVERAGE — reachability first, depth second\n');
  console.log(`  cells the walk runs        : ${report.cellsWalkRuns}`);
  console.log(`    needing a prose corpus   : ${report.needProse}`);
  console.log(`      OK                     : ${report.ok}`);
  console.log(`      THIN (below band floor): ${report.thin}`);
  console.log(`      EMPTY                  : ${report.empty}`);
  console.log(`    no prose lane BY DESIGN  : ${report.byDesignNoProse}  (math, life)`);
  console.log(`    no prose lane — DEFECT   : ${report.missingLane}`);
  console.log(`  reachable corpus words     : ${report.reachableWords.toLocaleString()}`);
  console.log(`  UNREACHABLE files          : ${report.unreachableFiles}  (${report.unreachableWords.toLocaleString()} words the walk never reads)`);
  if (missingLane.length) console.log(`\n  ⛔ NO LANE: ${missingLane.map((c) => `${c.subject}/${c.grade}`).join('  ')}`);
  if (empty.length) console.log(`\n  ⛔ EMPTY: ${empty.map((c) => `${c.subject}/${c.grade}`).join('  ')}`);
  if (unreachable.length) console.log(`\n  ⛔ UNREACHABLE: ${unreachable.map((c) => `${c.subject}/${c.grade} (${c.words.toLocaleString()}w)`).join('  ')}`);
  if (thin.length) console.log(`\n  ⚠ THIN: ${thin.map((c) => `${c.subject}/${c.grade} ${c.words.toLocaleString()}/${c.floor.toLocaleString()}`).join('  ')}`);
  const clean = !missingLane.length && !empty.length && !unreachable.length;
  console.log(`\n  ${clean ? 'PASS — every cell the walk runs has a lane and content' : 'FAIL — see the flagged cells above'}`);
}
