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
  console.log(`      OK (vs an UNDERIVED bar) : ${r.ok}`);
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
  // ⛔ THE BAR, PRINTED. `ok` counts cells clearing floors nobody derived, so
  // the output says what clearing them is actually worth. A bare numerator is
  // how an instrument starts lying — the same reason the dashboard ships
  // "1/17 mx" instead of "1".
  if (!r.floorsDerived) {
    const pct = ((r.avgWordsPerProseCell / r.realCourseYearWords) * 100).toFixed(1);
    console.log(`\n  ⛔ THE BAR IS UNDERIVED — floors were chosen, not measured:`);
    console.log(`     ${Object.entries(r.floors).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(' · ')}`);
    console.log(`     A "high" cell reports OK at ${r.floors.high.toLocaleString()} words; one real high-school`);
    console.log(`     textbook is ~${r.realCourseYearWords.toLocaleString()}-250,000. Average prose cell holds`);
    console.log(`     ${r.avgWordsPerProseCell.toLocaleString()} words = ~${pct}% of ONE real course year.`);
    console.log(`     "OK" therefore means NOT-STARVED, not FINISHED.  (see FLOORLIE.1)`);
  }
  console.log(`\n  ${r.clean ? 'PASS — every cell the walk runs has a lane and content' : 'FAIL — see the flagged cells above'}`);
}
