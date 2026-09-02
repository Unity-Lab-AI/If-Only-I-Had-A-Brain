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
const { computeCoverage, BY_DESIGN_NO_PROSE, examVocabSweep } = await import(pathToFileURL(path.join(ROOT, 'server', 'curriculum-coverage.js')).href);

// ⭐ EXAM-VOCAB PRE-WALK CHECK — wiring an auditor that existed and had never
// been called. `auditAllExamVocabCoverage` (student-question-banks.js) was found
// by the dead-wiring sweep with ZERO consumers. ⚠ Its per-cell sibling
// `examVocabCoverage` IS wired at the gate (curriculum.js:9530), so the
// TEST-WORDS-PRE-TAUGHT law is enforced — this is the whole-curriculum version,
// which answers a different and press-relevant question: BEFORE a fresh walk,
// which exam words does the corpus never contain anywhere?
//
// ⛔⛔ THE BODY MOVED TO `server/curriculum-coverage.js` ON 2026-09-02, AND THIS
// FILE'S OWN HEADER IS WHY. It says the computation must not live here because
// two copies drift — and the reachability rule obeyed that while this sweep did
// not, so its answer was reachable only from a terminal and **never reached the
// training monitor**. It is now one implementation with two consumers: this CLI
// and the server's state publish.
async function examVocabPreWalk() {
  const r = await examVocabSweep(ROOT);
  return (r && r.available) ? r : null;
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
  // ⚠ The list is NOT hardcoded here any more. It read "(math, life)" while the
  // set behind it had already dropped math, which is a label disagreeing with
  // its own number — the smallest version of the defect this tool exists to find.
  console.log(`    no prose lane BY DESIGN  : ${r.byDesignNoProse}  (${[...BY_DESIGN_NO_PROSE].join(', ')})`);
  console.log(`    no prose lane — DEFECT   : ${r.missingLane}`);
  console.log(`  reachable corpus words     : ${r.reachableWords.toLocaleString()}  (${r.entries} entries, ${r.licencePct}% licence-recorded)`);
  console.log(`  UNREACHABLE files          : ${r.unreachableFiles}  (${r.unreachableWords.toLocaleString()} words the walk never reads)`);
  if (r.missingLane) console.log(`\n  ⛔ NO LANE: ${r.missingLaneList.join('  ')}${more(r.missingLaneMore)}`);
  if (r.empty) console.log(`\n  ⛔ EMPTY: ${r.emptyList.join('  ')}${more(r.emptyMore)}`);
  if (r.unreachableFiles) console.log(`\n  ⛔ UNREACHABLE: ${r.unreachableList.join('  ')}${more(r.unreachableMore)}`);
  if (r.thin) console.log(`\n  ⚠ THIN: ${r.thinList.join('  ')}${more(r.thinMore)}`);

  // ⛔ THE PICTURES. This auditor was blind to them for its whole life, and that
  // blindness hid a real defect: 6,899 of 14,374 figures were unreachable by the
  // walk while every count reported them present. The raw count was never the
  // problem — the absence of a REACHABLE count was.
  const figs = r.figures || 0;
  const reach = r.figuresReachable || 0;
  console.log(`\n  FIGURES (the pictures beside the prose):`);
  console.log(`     rows on disk in reachable cells : ${figs.toLocaleString()}`);
  console.log(`     REACHABLE by the walk           : ${reach.toLocaleString()}${figs && reach < figs ? `  ⛔ ${(figs - reach).toLocaleString()} have no fetchable address` : ''}`);
  console.log(`     carrying corpus context         : ${(r.figuresContext || 0).toLocaleString()}${reach ? `  (${((r.figuresContext || 0) / reach * 100).toFixed(1)}% of reachable)` : ''}`);
  console.log(`     with a real label (not a placeholder) : ${(r.figuresLabelled || 0).toLocaleString()}`);
  console.log(`     cells with prose but NO reachable picture : ${r.noFigures || 0}`);
  if (r.noFigures) console.log(`     · ${r.noFiguresList.join('  ')}${more(r.noFiguresMore)}`);
  console.log(`     ⚠ A cell with no picture is not automatically a defect —`);
  console.log(`        a literature cell legitimately has none. This is the`);
  console.log(`        number that says WHERE the pictures are not.`);
  console.log(`     ⚠ "carrying corpus context" is the anchoring column. A`);
  console.log(`        caption like "Figure 1.1 World Exports, 1948-2008" binds`);
  console.log(`        a diagram to a number and a date; context is the prose`);
  console.log(`        the picture actually sits inside.`);

  // DIALOGUE.2 — terminal-punctuation mix. ⚠ A GENRE signal, not a teaching
  // gap: see the retraction note in server/curriculum-coverage.js readCell().
  console.log(`\n  PROSE GENRE (terminal-punctuation mix — NOT an intent-form gap):`);
  console.log(`     sentences in reachable cells : ${(r.sentences || 0).toLocaleString()}`);
  console.log(`     ending in '?'                : ${(r.questions || 0).toLocaleString()}`);
  console.log(`     ending in '!'                : ${(r.exclamations || 0).toLocaleString()}`);
  console.log(`     interrogative + exclamative  : ${r.dialoguePct || 0}%`);
  console.log(`     cells with prose but ZERO of either : ${r.noDialogue || 0}`);
  if (r.noDialogue) console.log(`     · ${r.noDialogueList.join('  ')}${more(r.noDialogueMore)}`);
  console.log(`     ⚠ DO NOT read a low number as "she cannot learn questions".`);
  console.log(`        Intent form is taught by _teachConcreteSentences from`);
  console.log(`        K_CONCRETE_SENTENCES — 1,418 sentences at reps=100, of which`);
  console.log(`        NONE carry terminal punctuation and 51 open with an`);
  console.log(`        interrogative word. Question form is encoded as WORD ORDER,`);
  console.log(`        which is the only form the emission path can reproduce.`);
  console.log(`        Expository prose having no dialogue is genre-normal.`);
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
