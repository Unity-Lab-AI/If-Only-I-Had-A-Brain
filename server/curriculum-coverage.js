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
// ⭐ The figure-reachability rule is IMPORTED, never re-derived. `figureAddress`
// is the same predicate `academicStoryFigures` gates on, so this auditor and the
// walk can never disagree about which pictures exist — the disagreement that let
// 6,899 figures be counted as present while the walk could not see one of them.
const { figureAddress } = require('./life-curriculum.js');

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
    // ⛔⛔ READ THIS BEFORE DRAWING THE CONCLUSION I DREW. When this was added
    // (2026-09-01) I read a low `?`/`!` rate as "she has no examples of the
    // sentence forms she must produce". THAT WAS WRONG, and the retraction is
    // kept here because the number is seductive and the next reader will meet
    // it before they meet the mechanism.
    //
    // ⭐ INTENT FORM IS NOT LEARNED FROM CORPUS PUNCTUATION. It is taught
    // directly by `_teachConcreteSentences` from `K_CONCRETE_SENTENCES` —
    // 1,418 sentences at reps=100 as word→word Hebbian cascades, the
    // load-bearing grammar pass. ⚠ NOT ONE of those 1,418 carries any terminal
    // punctuation at all (no `.`, no `?`, no `!`), and 51 of them OPEN with an
    // interrogative word ("what is this", "where is the cat"). **Question form
    // is encoded as WORD ORDER, which is the only form the emission path can
    // reproduce anyway — she emits words, not punctuation.**
    //
    // So what this field actually measures is the GENRE of a cell's prose, not
    // its teaching power. Expository textbook writing has no dialogue by
    // nature; that is normal and is not a defect to be "fixed" by hunting
    // question marks. It stays because genre mix is a real property worth
    // seeing per cell — but it must never again be read as an intent-form gap.
    let sentences = 0, questions = 0, exclamations = 0;
    // ⛔⛔ THE FIGURE COLUMNS EXIST BECAUSE THIS AUDITOR WAS BLIND TO PICTURES
    // FOR ITS WHOLE LIFE, AND THAT BLINDNESS HID A REAL DEFECT FOR A DAY.
    //
    // It measured prose depth per cell and said nothing about the images beside
    // that prose, so **6,899 of 14,374 figures — every Saylor diagram and every
    // Gutenberg plate — were unreachable by the walk while every count reported
    // them present.** An instrument that cannot see a thing cannot report it
    // missing; the raw count was never the problem, the absence of a REACHABLE
    // count was.
    //
    // ⚠ `figuresContext` is the second column and it is not decoration. A figure
    // with no words to bind to is the `CAMPOISON` defect, and a caption that is
    // only a numbered title ("Figure 1.1 World Exports, 1948-2008") is barely
    // better — it binds a diagram to a number and a date. Context is the corpus
    // prose the picture sits inside, and a cell rich in figures that carry none
    // of it is a cell whose pictures are weakly anchored, which a raw figure
    // count would render as a healthy number.
    let figures = 0, figuresReachable = 0, figuresContext = 0, figuresLabelled = 0;
    for (const e of experiences) {
      const story = String(e.story || '');
      words += story.split(/\s+/).length;
      if (e.licence) licensed++;
      for (const f of (Array.isArray(e.figures) ? e.figures : [])) {
        figures++;
        if (figureAddress(f)) figuresReachable++;
        if (typeof f.context === 'string' && f.context.trim().length >= 40) figuresContext++;
        const label = `${(f && f.alt) || ''} ${(f && f.caption) || ''}`.replace(/[^a-z ]/gi, ' ').trim();
        // A placeholder is not a label — `[Illustration]` is what a transcriber
        // types where a picture goes, and binding a plate to the word
        // "illustration" says nothing about what is in it.
        const placeholder = /^(illustration|image|figure|photo|picture|graphic|logo|decoration)(\s+\d+)?$/i
          .test(label.replace(/\s+/g, ' '));
        if (label.length >= 3 && !placeholder) figuresLabelled++;
      }
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
      figures, figuresReachable, figuresContext, figuresLabelled,
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

  const run = [], missingLane = [], empty = [], thin = [], noDialogue = [], noFigures = [];
  let okCount = 0, reachableWords = 0, entries = 0, licensed = 0;
  let sentences = 0, questions = 0, exclamations = 0;
  let figures = 0, figuresReachable = 0, figuresContext = 0, figuresLabelled = 0;
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
      figures += c.figures; figuresReachable += c.figuresReachable;
      figuresContext += c.figuresContext; figuresLabelled += c.figuresLabelled;
      // A cell the walk runs that can show her nothing. ⚠ Deliberately counted
      // over cells with REAL PROSE only — an empty cell is already reported as
      // empty, and counting it twice would inflate this into meaninglessness.
      if (c.figuresReachable === 0) noFigures.push(`${subject}/${grade}`);
      // DIALOGUE.2 — cells whose prose carries no interrogative or exclamative
      // punctuation at all. ⚠ This is a GENRE signal, not a defect count:
      // expository writing legitimately has none, and intent form is taught
      // elsewhere (see the note in `readCell`). Useful for spotting a cell that
      // is meant to be literature and reads like a textbook.
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
    // ⛔ THE FIGURE COLUMNS. `figures` is the raw row count and is the number
    // that lied for a day; `figuresReachable` is the one the walk can act on,
    // computed with the walk's OWN predicate rather than a copy of it.
    figures,
    figuresReachable,
    // Pictures whose only anchor is their own label — no corpus prose captured
    // around them. A high `figures` with a low `figuresContext` is a cell full
    // of diagrams bound to figure numbers instead of to the subject.
    figuresContext,
    // Pictures with a real label, placeholders like `[Illustration]` excluded.
    figuresLabelled,
    // Cells the walk runs, holding real prose, that can show her no picture at
    // all. ⚠ Not a defect on its own — a literature cell legitimately has none —
    // but it is the number that says where the pictures are NOT.
    noFigures: noFigures.length,
    noFiguresList: noFigures.slice(0, CAP),
    noFiguresMore: Math.max(0, noFigures.length - CAP),
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
