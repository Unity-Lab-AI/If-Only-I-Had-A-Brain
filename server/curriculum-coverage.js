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
// ⭐⭐ THE FLOORS ARE NOW DERIVED FROM MEASURED TEXTBOOKS, and the derivation
// is here so it can be checked rather than trusted.
//
// ⛔ THE PREVIOUS VALUES (early 2,000 · middle 5,000 · upper 15,000 · high
// 20,000 · college 20,000 · grad 20,000) WERE INVENTED. Not derived from a
// course, a syllabus or a counted book — they were what looked reasonable when
// typed. A `high` cell therefore reported OK at 20,000 words, roughly 13% of a
// real course year, and the tool printed `104 OK` as though that were finished.
// That is the SAME defect this module exists to catch, committed by the module
// itself — the twin of `ACAD-API-3`'s "remains OPTIONAL, all 666 topics covered"
// and the wiki's "89/89 cells, 0 thin". Recorded, not quietly replaced.
//
// ── THE MEASUREMENT (2026-09-01, against the OpenStax mirrors already in use) ──
// Ratio first: 8 chapters sampled across `chemistry-book`, run through the
// PRODUCTION cleaner's shape so the number reflects what actually survives
// ingest rather than raw markdown — 417,371 raw bytes -> 31,038 clean prose
// words = ONE CLEAN WORD PER 13.4 BYTES. Applied to each book's true size:
//
//     biology-concepts-book   107 chapters   1.88 MB  ->   146,598 words
//     anatomy-book            198 chapters   4.29 MB  ->   334,525 words
//     chemistry-book          149 chapters   6.73 MB  ->   524,791 words
//     physics-book            283 chapters  11.27 MB  ->   878,811 words
//
// ⭐ MEASURED ANCHORS, used directly:
//   high    = 146,000 — `biology-concepts` is the lightest COMPLETE course book
//                       in the set and is pitched at exactly this band, so it is
//                       the honest floor for a high-school year, not an average.
//   college = 330,000 — `anatomy` is a real college course book. Chemistry and
//                       physics are larger; taking the SMALLEST keeps this a
//                       floor rather than an aspiration.
//   grad    = 330,000 — the research literature is at minimum a book's worth per
//                       year. ⚠ This one is the weakest of the three: it reuses
//                       the college anchor because no grad reading list was
//                       counted. Labelled rather than dressed up.
//
// ⚠ EXTRAPOLATED, NOT MEASURED — no elementary textbook exists in these mirrors,
// so the lower three bands are scaled from the measured high-school anchor by a
// stated pedagogical ratio. They are a judgement about how reading volume grows,
// and they are marked as such so nobody later mistakes them for counted numbers:
//   upper  (G6-8)   = 0.50 x high ≈ 73,000
//   middle (G3-5)   = 0.20 x high ≈ 29,000
//   early  (pre-K-G2) = 0.05 x high ≈ 7,300
//
// ⛔ CONSEQUENCE, STATED BEFORE IT LANDS: raising the bar from 20,000 to 146,000
// at `high` means most cells that read OK yesterday now read THIN. That is the
// point. The corpus did not get worse; the ruler stopped lying.
const FLOOR = { early: 7300, middle: 29000, upper: 73000, high: 146000, college: 330000, grad: 330000 };
const FLOORS_DERIVED = true;
// Which bands rest on a counted book and which on a ratio — published, because
// "derived" is not one thing and a reader deserves to know which half they have.
const FLOOR_BASIS = {
  early: 'extrapolated 0.05x high', middle: 'extrapolated 0.20x high', upper: 'extrapolated 0.50x high',
  high: 'MEASURED biology-concepts-book 146,598w', college: 'MEASURED anatomy-book 334,525w',
  grad: 'college anchor reused — no grad reading list counted',
};
// A real course year, for the comparison the floors cannot make alone. Now the
// measured high-school anchor rather than a remembered rule of thumb.
const REAL_COURSE_YEAR_WORDS = 146598;

function readCell(corpusRoot, subject, grade) {
  const f = path.join(corpusRoot, subject, `${grade}.json`);
  let raw;
  try { raw = fs.readFileSync(f, 'utf8'); } catch { return null; }
  try {
    const j = JSON.parse(raw);
    const experiences = j.experiences || [];
    let words = 0, licensed = 0;
    // DIALOGUE.2 — terminal-punctuation mix, per cell.
    //
    // ⛔ A word count cannot answer "can this cell teach her what a QUESTION
    // looks like?", and that turned out to matter: measured 2026-09-01, the
    // three boot corpora hold 842 sentences with ZERO question marks and ZERO
    // exclamation marks between them, and the whole rebuilt academic corpus is
    // 248,443 sentences at 0.28% `?` and 0.19% `!`.
    //
    // `_teachSentenceStructure` trains FIVE intent forms — declarative_svo,
    // declarative_copula, question, imperative, exclamative — so a cell of pure
    // expository prose supplies exemplars for two of them and none for the
    // rest. Reported per cell because a 0.28% AVERAGE hides which cells are at
    // zero, and expository textbook prose is exactly the genre that has none.
    let sentences = 0, questions = 0, exclamations = 0;
    for (const e of experiences) {
      const story = String(e.story || '');
      words += story.split(/\s+/).length;
      if (e.licence) licensed++;
      for (const s of story.split(/(?<=[.!?])\s+/)) {
        const t = s.trim();
        if (!t) continue;
        sentences++;
        if (t.endsWith('?')) questions++;
        else if (t.endsWith('!')) exclamations++;
      }
    }
    const dialoguePct = sentences > 0
      ? ((questions + exclamations) / sentences) * 100
      : 0;
    return {
      words, entries: experiences.length, licensed,
      sentences, questions, exclamations, dialoguePct,
    };
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

  const run = [], missingLane = [], empty = [], thin = [], noDialogue = [];
  let okCount = 0, reachableWords = 0, entries = 0, licensed = 0;
  let sentences = 0, questions = 0, exclamations = 0;
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
      sentences += c.sentences; questions += c.questions; exclamations += c.exclamations;
      // DIALOGUE.2 — a cell with prose but NO interrogative or exclamative
      // sentence cannot teach two of the five intent forms the curriculum
      // trains. Tracked separately from `thin`: this cell may be enormous and
      // still unable to show her what a question looks like.
      if (c.sentences > 0 && (c.questions + c.exclamations) === 0) {
        noDialogue.push(`${subject}/${grade}`);
      }
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
    // ⛔ THE HONESTY FIELDS. `ok` above counts cells clearing an UNDERIVED bar,
    // so it is published alongside what that bar is worth against a real course
    // year. Without these, `ok: 104` reads as 104 finished cells.
    floors: { ...FLOOR },
    floorsDerived: FLOORS_DERIVED,
    floorBasis: { ...FLOOR_BASIS },
    realCourseYearWords: REAL_COURSE_YEAR_WORDS,
    avgWordsPerProseCell: (run.length - run.filter((c) => !PROSE_ACADEMIC_SUBJECTS.has(c.split('/')[0])).length)
      ? Math.round(reachableWords / (run.length - run.filter((c) => !PROSE_ACADEMIC_SUBJECTS.has(c.split('/')[0])).length))
      : 0,
    // ⛔ DIALOGUE.2 — the sentence-FORM mix, because a word count cannot say
    // whether a cell can teach her what a question looks like. Measured
    // 2026-09-01: the three boot corpora hold 842 sentences with ZERO `?` and
    // ZERO `!`, and the whole academic corpus runs 0.28% / 0.19%.
    sentences,
    questions,
    exclamations,
    dialoguePct: sentences ? Math.round(((questions + exclamations) / sentences) * 1000) / 10 : 0,
    // Cells with real prose that still cannot show her an interrogative or an
    // exclamative — distinct from `thin`, since a huge cell can be one of these.
    noDialogue: noDialogue.length,
    noDialogueList: noDialogue.slice(0, CAP),
    noDialogueMore: Math.max(0, noDialogue.length - CAP),
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
