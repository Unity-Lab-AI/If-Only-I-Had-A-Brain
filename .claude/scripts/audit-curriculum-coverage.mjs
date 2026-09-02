// audit-curriculum-coverage.mjs — DOES EVERY CELL THE WALK RUNS HAVE CONTENT?
//
// ⛔⛔ THE QUESTION THIS ANSWERS IS NOT "how deep is each corpus file". That
// question was asked for a year and always came back fine, because a file that
// is never read still has words in it. Two failures proved it:
//
//   • 268,481 words sat in corpora/academic/cs/college*, /grad, /phd and in
//     civics|economics|psychology/college* — subjects RETIRED at grade12, so
//     the walk never reaches those cells. Every one would have PASSED a
//     depth check while training nothing.
//   • 71 cells (art, pe, music, health, language, ap) RAN with no prose lane
//     at all, because their subjects were absent from PROSE_ACADEMIC_SUBJECTS.
//     A per-file depth check cannot see a file that was never expected.
//
// So this audit starts from the WALK, not from the filesystem: it asks the
// curriculum itself which (subject, grade) cells are actually owed, and only
// then asks whether each one has content. Reachability first, depth second.
//
// ⭐ THE COMPUTATION IS NOT HERE — it lives in `server/curriculum-coverage.js`,
// which the server's state publish imports too. This file is the CLI face of
// that module. Two copies of a reachability rule drift, and a drifting
// instrument is precisely the bug class this tool exists to catch.
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
// ⚠ That module is CommonJS (all of `server/` is). The named destructure works
// because Node statically detects `module.exports = { ... }` and synthesises
// named exports — verified by running this, not assumed. If it is ever changed
// to a computed export shape, this line silently yields undefined.
const { computeCoverage } = await import(pathToFileURL(path.join(ROOT, 'server', 'curriculum-coverage.js')).href);

// ⭐ EXAM-VOCAB PRE-WALK CHECK — wiring an auditor that existed and had never
// been called. `auditAllExamVocabCoverage` (student-question-banks.js) was found
// by the dead-wiring sweep with ZERO consumers. ⚠ Its per-cell sibling
// `examVocabCoverage` IS wired at the gate (curriculum.js:9530), so the
// TEST-WORDS-PRE-TAUGHT law is enforced — this is the whole-curriculum version,
// which answers a different and press-relevant question: BEFORE a fresh walk,
// which exam words does the corpus never contain anywhere?
//
// ⚠ It normally takes the TRAINED vocabulary, which only exists on a running
// brain. Offline we pass the CORPUS vocabulary instead — a strict upper bound on
// what she could possibly learn, so a word missing here can NEVER be taught by
// the current corpus. That makes a hit here a hard finding and a miss merely
// "not provable offline", which is stated rather than blurred.
async function examVocabPreWalk() {
  let banks;
  try { banks = await import(pathToFileURL(path.join(ROOT, 'js', 'brain', 'student-question-banks.js')).href); }
  catch { return null; }
  if (typeof banks.auditAllExamVocabCoverage !== 'function') return null;
  // ⛔ ALL THREE CORPORA, NOT JUST ACADEMIC. The first version scanned only
  // corpora/academic and therefore reported `dad`, `grandma`, `pajamas`, `moms`
  // and `yeah` as absent — while every one of them is in the hand-authored LIFE
  // canon, which is exactly where that vocabulary BELONGS. She is taught from
  // academic + life + coding, so an exam-coverage check that reads one of the
  // three manufactures a gap out of the other two. Five false findings in the
  // first run, and they were the most plausible-looking ones on the list.
  const words = new Set();
  const walkCorpus = (dir) => {
    let subs = [];
    try { subs = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of subs) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) { walkCorpus(fp); continue; }
      if (!e.name.endsWith('.json')) continue;
      try {
        for (const x of (JSON.parse(fs.readFileSync(fp, 'utf8')).experiences || [])) {
          for (const w of String(x.story || '').toLowerCase().split(/\s+/)) {
            // ⛔ KEEP THE APOSTROPHE. Stripping to [a-z] turned "can't" into
            // "cant", so the exam bank's "can't" matched nothing and TEN
            // contractions (`can't`, `don't`, `doesn't`, `mom's`, `dad's`,
            // `aunt's`, `father's`, `mother's`, `valentine's`, `year's`) were
            // reported as absent from a corpus that contains every one of them.
            // A normalisation mismatch in the CHECKER, invented as a curriculum
            // gap — the same shape as every other false finding today.
            const c = w.replace(/[^a-z']/g, '').replace(/^'+|'+$/g, '');
            if (c) { words.add(c); if (c.includes("'")) words.add(c.replace(/'/g, '')); }
          }
        }
      } catch { /* skip unreadable cell */ }
    }
  };
  walkCorpus(CORPUS);
  walkCorpus(path.join(ROOT, 'corpora', 'life'));
  walkCorpus(path.join(ROOT, 'corpora', 'coding'));
  try { return { report: banks.auditAllExamVocabCoverage(words), corpusWords: words.size }; }
  catch { return null; }
}

const r = computeCoverage(mod, CORPUS);
if (!r) {
  console.log('ABORT — curriculum module did not expose GRADE_ORDER / subjectsOwedAt.');
  process.exit(1);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(r, null, 2));
} else {
  const more = (n) => (n > 0 ? `  … +${n} more` : '');
  console.log('CURRICULUM COVERAGE — reachability first, depth second\n');
  console.log(`  cells the walk runs        : ${r.cellsWalkRuns}`);
  console.log(`    needing a prose corpus   : ${r.needProse}`);
  console.log(`      OK (at/above band floor) : ${r.ok}${r.floorsDerived ? '' : '   ⛔ bar is UNDERIVED'}`);
  console.log(`      THIN (below band floor): ${r.thin}`);
  console.log(`      EMPTY                  : ${r.empty}`);
  console.log(`    no prose lane BY DESIGN  : ${r.byDesignNoProse}  (math, life)`);
  console.log(`    no prose lane — DEFECT   : ${r.missingLane}`);
  console.log(`  reachable corpus words     : ${r.reachableWords.toLocaleString()}  (${r.entries} entries, ${r.licencePct}% licence-recorded)`);
  console.log(`  UNREACHABLE files          : ${r.unreachableFiles}  (${r.unreachableWords.toLocaleString()} words the walk never reads)`);
  if (r.missingLane) console.log(`\n  ⛔ NO LANE: ${r.missingLaneList.join('  ')}${more(r.missingLaneMore)}`);
  if (r.empty) console.log(`\n  ⛔ EMPTY: ${r.emptyList.join('  ')}${more(r.emptyMore)}`);
  if (r.unreachableFiles) console.log(`\n  ⛔ UNREACHABLE: ${r.unreachableList.join('  ')}${more(r.unreachableMore)}`);
  if (r.thin) console.log(`\n  ⚠ THIN: ${r.thinList.join('  ')}${more(r.thinMore)}`);

  // DIALOGUE.2 — the sentence-FORM mix. A word count cannot say whether a cell
  // can show her what a question looks like, and expository textbook prose is
  // exactly the genre that never does.
  console.log(`\n  SENTENCE FORMS (can these cells teach her a question at all?):`);
  console.log(`     sentences in reachable cells : ${(r.sentences || 0).toLocaleString()}`);
  console.log(`     ending in '?'                : ${(r.questions || 0).toLocaleString()}`);
  console.log(`     ending in '!'                : ${(r.exclamations || 0).toLocaleString()}`);
  console.log(`     interrogative + exclamative  : ${r.dialoguePct || 0}%`);
  console.log(`     cells with prose but ZERO of either : ${r.noDialogue || 0}`);
  if (r.noDialogue) console.log(`     ⛔ NO DIALOGUE: ${r.noDialogueList.join('  ')}${more(r.noDialogueMore)}`);
  console.log(`     ⚠ _teachSentenceStructure trains FIVE intent forms; a cell of pure`);
  console.log(`        expository prose supplies exemplars for two and none for question`);
  console.log(`        or exclamative. Every gate probe asks her a QUESTION.`);
  // ⛔ THE BAR, PRINTED. `ok` counts cells clearing floors nobody derived, so
  // the output says what clearing them is actually worth. A bare numerator is
  // how an instrument starts lying — the same reason the dashboard ships
  // "1/17 mx" instead of "1".
  const pct = ((r.avgWordsPerProseCell / r.realCourseYearWords) * 100).toFixed(1);
  console.log(`\n  THE BAR (${r.floorsDerived ? 'DERIVED from measured textbooks' : '⛔ UNDERIVED — chosen, not measured'}):`);
  for (const [band, v] of Object.entries(r.floors || {})) {
    const basis = (r.floorBasis && r.floorBasis[band]) || '';
    console.log(`     ${band.padEnd(8)} ${String(v.toLocaleString()).padStart(9)}  ${basis}`);
  }
  console.log(`     Average prose cell holds ${r.avgWordsPerProseCell.toLocaleString()} words = ~${pct}% of one real course year`);
  console.log(`     (${r.realCourseYearWords.toLocaleString()} words, measured: biology-concepts-book).`);
  const ev = await examVocabPreWalk();
  if (ev && ev.report) {
    const p = ev.report;
    console.log(`\n  EXAM-VOCAB vs CORPUS (pre-walk, upper bound — corpus holds ${ev.corpusWords.toLocaleString()} distinct words):`);
    console.log(`     exam words required across all banks : ${(p.totalRequired || 0).toLocaleString()}`);
    console.log(`     NOT PRESENT anywhere in the corpus   : ${(p.totalMissing || 0).toLocaleString()}`);
    console.log(`     ⛔ a word missing here can never be taught by the current corpus,`);
    console.log(`        so the gate that requires it pre-taught cannot pass honestly.`);
  }
  console.log(`\n  ${r.clean ? 'PASS — every cell the walk runs has a lane and content' : 'FAIL — see the flagged cells above'}`);
}
