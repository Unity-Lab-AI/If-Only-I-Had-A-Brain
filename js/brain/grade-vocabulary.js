// Per-grade vocabulary registry — maps GRADE_ORDER keys to each grade's
// vocabulary corpus for prefetch + lazy definition binding at that grade's
// curriculum start. the operator directive 2026-06-18. K uses the foundational
// k-vocabulary.js; G1->PhD each have a realistic frequency-band file
// (grade<N>-vocabulary.js / college<N>-vocabulary.js / gradschool / phd),
// generated from corpora/glove.6B.300d.txt by .claude/scripts/gen-grade-vocab.mjs.
//
// Dynamic import per grade keeps the curriculum module graph lean — only
// the active grade's vocab loads when that grade starts. Returns null for
// pre-K (no dedicated corpus; its inline runner vocab teaches as before).

export async function gradeVocabularyFor(grade) {
  switch (grade) {
    case 'kindergarten':
      return (await import('./k-vocabulary.js')).K_VOCABULARY;
    case 'grade1':
      return (await import('./grade1-vocabulary.js')).G1_VOCABULARY;
    case 'grade2':
      return (await import('./grade2-vocabulary.js')).G2_VOCABULARY;
    case 'grade3':
      return (await import('./grade3-vocabulary.js')).G3_VOCABULARY;
    case 'grade4':
      return (await import('./grade4-vocabulary.js')).G4_VOCABULARY;
    case 'grade5':
      return (await import('./grade5-vocabulary.js')).G5_VOCABULARY;
    case 'grade6':
      return (await import('./grade6-vocabulary.js')).G6_VOCABULARY;
    case 'grade7':
      return (await import('./grade7-vocabulary.js')).G7_VOCABULARY;
    case 'grade8':
      return (await import('./grade8-vocabulary.js')).G8_VOCABULARY;
    case 'grade9':
      return (await import('./grade9-vocabulary.js')).G9_VOCABULARY;
    case 'grade10':
      return (await import('./grade10-vocabulary.js')).G10_VOCABULARY;
    case 'grade11':
      return (await import('./grade11-vocabulary.js')).G11_VOCABULARY;
    case 'grade12':
      return (await import('./grade12-vocabulary.js')).G12_VOCABULARY;
    case 'college1':
      return (await import('./college1-vocabulary.js')).COL1_VOCABULARY;
    case 'college2':
      return (await import('./college2-vocabulary.js')).COL2_VOCABULARY;
    case 'college3':
      return (await import('./college3-vocabulary.js')).COL3_VOCABULARY;
    case 'college4':
      return (await import('./college4-vocabulary.js')).COL4_VOCABULARY;
    case 'grad':
      return (await import('./gradschool-vocabulary.js')).GRAD_VOCABULARY;
    case 'phd':
      return (await import('./phd-vocabulary.js')).PHD_VOCABULARY;
    default:
      return null;
  }
}

// FULL-JOURNEY VOCABULARY STATS (2026-08-17). The dashboard's defs-taught
// denominator must reflect the WHOLE K→PhD journey, not just the active
// grade: the taught-set numerator counts every grade's learned words, so a
// grade-sized denominator lies the moment the walk crosses a grade boundary
// (it already had — the taught count once read 2,287 against K's 2,247).
// Loads every grade's list once, dedups (the AoA frequency bands overlap by
// design — a word taught once is taught), caches the result. ~50k strings,
// one-time cost, trivial RAM.
const JOURNEY_GRADES = [
  'kindergarten', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5',
  'grade6', 'grade7', 'grade8', 'grade9', 'grade10', 'grade11', 'grade12',
  'college1', 'college2', 'college3', 'college4', 'grad', 'phd',
];
let _journeyStats = null;
export async function fullJourneyVocabularyStats() {
  if (_journeyStats) return _journeyStats;
  const uniq = new Set();
  let sum = 0;
  const perGrade = {};
  for (const g of JOURNEY_GRADES) {
    try {
      const v = await gradeVocabularyFor(g);
      const n = Array.isArray(v) ? v.length : 0;
      perGrade[g] = n;
      sum += n;
      if (Array.isArray(v)) for (const w of v) uniq.add(w);
    } catch {
      perGrade[g] = 0;   // a missing grade file must not sink the total
    }
  }
  _journeyStats = { unique: uniq.size, sum, perGrade };
  return _journeyStats;
}
