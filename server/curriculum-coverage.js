// curriculum-coverage.js — IS EVERY CELL THE WALK RUNS ACTUALLY FED?
//
// ⛔ THE ONE THING THIS MODULE EXISTS TO DO DIFFERENTLY: it starts from the
// WALK, not from the filesystem. It asks the curriculum which (subject, grade)
// cells are owed, and only then asks whether each has content. Reachability
// first, depth second.
//
// A depth-only check — "how many words does each corpus file hold" — was run
// for a year and always came back healthy, because it is structurally blind to
// both failures this project actually hit:
//
//   • 268,481 words sat in cells the walk NEVER REACHES (cs, civics, economics
//     and psychology retire at grade12, while college runs a different roster).
//     Every one of those files would have PASSED a depth check while training
//     nothing at all.
//   • 71 cells RAN WITH NO LANE (art, pe, music, health, language, ap were
//     absent from PROSE_ACADEMIC_SUBJECTS). A check that only inspects files it
//     expects cannot see a file it was never told to expect.
//
// ⭐ SINGLE SOURCE OF TRUTH. `.claude/scripts/audit-curriculum-coverage.mjs`
// and the server's state publish both import this — because two copies of a
// reachability rule drift, and a drifting instrument is the class of bug this
// whole module is a response to.
// ⚠ COMMONJS, deliberately — `server/` is CJS (its own package.json sets no
// `type`, so the root's `"type": "module"` does not reach here) and every
// sibling uses `require` / `module.exports` / `__dirname`. Writing this as ESM
// "worked" via dynamic import() from brain-server.js while making Node reparse
// the file on every load and putting one odd module in an otherwise uniform
// directory. Matching the directory is the whole point of a convention.
const fs = require('fs');
const path = require('path');

// The ONLY legitimate absences. Math is taught equationally — a maths prose
// corpus is the thing the grade-completion gate exists to forbid — and the
// lived year is hand-authored because it is HER life. Anything else without a
// lane is a finding, not a policy, and that distinction is the whole point of
// naming them here rather than silently skipping.
const BY_DESIGN_NO_PROSE = new Set(['math', 'life']);

const BAND = {
  'pre-K': 'early', kindergarten: 'early', grade1: 'early', grade2: 'early',
  grade3: 'middle', grade4: 'middle', grade5: 'middle',
  grade6: 'upper', grade7: 'upper', grade8: 'upper',
  grade9: 'high', grade10: 'high', grade11: 'high', grade12: 'high',
  college1: 'college', college2: 'college', college3: 'college', college4: 'college',
  grad: 'grad', phd: 'grad',
};
// FLOORS for flagging, not targets. A cell above its floor is not thereby
// finished — it is merely not obviously starved. Band-aware because a real
// year is a different size at every grade, which is the same reason the
// sentence cap is banded.
const FLOOR = { early: 2000, middle: 5000, upper: 15000, high: 20000, college: 20000, grad: 20000 };

function readCell(corpusRoot, subject, grade) {
  const f = path.join(corpusRoot, subject, `${grade}.json`);
  let raw;
  try { raw = fs.readFileSync(f, 'utf8'); } catch { return null; }
  try {
    const j = JSON.parse(raw);
    const experiences = j.experiences || [];
    let words = 0, licensed = 0;
    for (const e of experiences) {
      words += String(e.story || '').split(/\s+/).length;
      if (e.licence) licensed++;
    }
    return { words, entries: experiences.length, licensed };
  } catch { return null; }
}

/**
 * @param {object} curriculumModule — the loaded js/brain/curriculum.js exports
 * @param {string} corpusRoot — absolute path to corpora/academic
 * @returns {object} summary + the flagged cells, bounded for display
 */
function computeCoverage(curriculumModule, corpusRoot) {
  const { GRADE_ORDER, PROSE_ACADEMIC_SUBJECTS, subjectsForGrade, subjectsOwedAt } = curriculumModule;
  if (!GRADE_ORDER || !subjectsOwedAt) return null;

  // Steady state: assume every prior cell passed, so retirement applies exactly
  // as it will on a healthy walk. Retirement is LEDGER-gated (an untrained
  // subject stays owed), so this is the roster a completed walk sees rather
  // than the debt-carrying one — which is the roster the corpus must satisfy.
  const passed = new Set();
  for (const g of GRADE_ORDER) for (const s of subjectsForGrade(g)) passed.add(`${s}/${g}`);

  const run = [], missingLane = [], empty = [], thin = [];
  let okCount = 0, reachableWords = 0, entries = 0, licensed = 0;
  for (const grade of GRADE_ORDER) {
    for (const subject of subjectsOwedAt(grade, passed)) {
      run.push(`${subject}/${grade}`);
      if (!PROSE_ACADEMIC_SUBJECTS.has(subject)) {
        if (!BY_DESIGN_NO_PROSE.has(subject)) missingLane.push(`${subject}/${grade}`);
        continue;
      }
      const c = readCell(corpusRoot, subject, grade);
      if (!c || c.entries === 0) { empty.push(`${subject}/${grade}`); continue; }
      reachableWords += c.words; entries += c.entries; licensed += c.licensed;
      const floor = FLOOR[BAND[grade]] ?? 5000;
      if (c.words < floor) thin.push(`${subject}/${grade}:${c.words}/${floor}`);
      else okCount++;
    }
  }

  // ⛔ THE REVERSE SWEEP — corpus files for cells the walk does NOT run. This is
  // the half a depth-only audit cannot have, and it is where the 268,481 words
  // were found. Without it, an unreachable file reads as coverage.
  const reachable = new Set(run);
  const unreachable = [];
  let unreachableWords = 0;
  try {
    for (const s of fs.readdirSync(corpusRoot)) {
      const d = path.join(corpusRoot, s);
      if (!fs.statSync(d).isDirectory()) continue;
      for (const f of fs.readdirSync(d)) {
        if (!f.endsWith('.json')) continue;
        const g = f.replace(/\.json$/, '');
        if (reachable.has(`${s}/${g}`)) continue;
        const c = readCell(corpusRoot, s, g);
        unreachableWords += c ? c.words : 0;
        unreachable.push(`${s}/${g}`);
      }
    }
  } catch { /* corpus root unreadable — reported as zero, not as clean */ }

  const CAP = 12;   // bounded per the dashboard law; the count is always exact
  return {
    cellsWalkRuns: run.length,
    needProse: run.length - run.filter((c) => !PROSE_ACADEMIC_SUBJECTS.has(c.split('/')[0])).length,
    ok: okCount,
    thin: thin.length,
    empty: empty.length,
    missingLane: missingLane.length,
    byDesignNoProse: run.filter((c) => BY_DESIGN_NO_PROSE.has(c.split('/')[0])).length,
    unreachableFiles: unreachable.length,
    unreachableWords,
    reachableWords,
    entries,
    licencePct: entries ? Math.round((licensed / entries) * 1000) / 10 : 0,
    // ⚠ Lists are TRUNCATED for display and say so; the counts above are not.
    // A truncated list that looks complete is how a dashboard starts lying.
    emptyList: empty.slice(0, CAP),
    emptyMore: Math.max(0, empty.length - CAP),
    missingLaneList: missingLane.slice(0, CAP),
    missingLaneMore: Math.max(0, missingLane.length - CAP),
    unreachableList: unreachable.slice(0, CAP),
    unreachableMore: Math.max(0, unreachable.length - CAP),
    thinList: thin.slice(0, CAP),
    thinMore: Math.max(0, thin.length - CAP),
    clean: missingLane.length === 0 && empty.length === 0 && unreachable.length === 0,
  };
}

module.exports = { computeCoverage, BY_DESIGN_NO_PROSE };
