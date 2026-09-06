// Generate REAL, grade-appropriate per-grade vocabulary files — CONTENT-DERIVED.
//
// Gee 2026-06-18: the prior generator's GloVe-frequency FILL polluted the
// files with proper-noun junk ('vidal','givenchy','kersee'...). FIX (#35,
// option 2): derive each grade's vocab from the ACTUAL CURRICULUM CONTENT for
// that grade — the words she really encounters — so it is clean + grade-
// appropriate BY CONSTRUCTION, no GloVe junk, no dictionary-API batch needed.
//
// Per-grade sources (all REAL words):
//   1. ACADEMIC runner sentences — every quoted string in grade<N>.js /
//      college<N>.js / grad.js / phd.js (runEla/Math/Sci/Soc/Art*Real SENTENCES
//      + exam prompts) → tokenized. THIS is the real academic vocabulary
//      taught at that grade (calculus terms at G12, chemistry at G10, etc.).
//   2. LIFE story-data — corpora/life/<grade>.json experience narratives,
//      tokenized (the lived-experience vocabulary).
//   3. Kuperman AoA (corpora/aoa.tsv) — developmental core words placed at
//      their acquisition grade, precocity-shifted EARLIER (Unity learns ahead).
//   4. CUSSING_BY_GRADE (curriculum.js) — the graded cuss/obscenity lexicon
//      newly acquired that grade (real escalating real-life acquisition).
//
// No GloVe. No proper-noun junk. Words are content-aligned to what she's
// actually taught. K keeps its curated k-vocabulary.js (not regenerated here).
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const BRAIN = path.join(ROOT, 'js', 'brain');
const CURR = path.join(BRAIN, 'curriculum');
const LIFE = path.join(ROOT, 'corpora', 'life');
const CODING = path.join(ROOT, 'corpora', 'coding');
const ACADEMIC = path.join(ROOT, 'corpora', 'academic');
const AOA = path.join(ROOT, 'corpora', 'aoa.tsv');

// ⚠ Reads the JSON store, not a `.js` module — the nineteen vocabulary modules
// were retired 2026-09-05 (see the writer at the bottom of this file).
const K_VOCABULARY = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'corpora', 'vocabulary', 'kindergarten.json'), 'utf8'));
const { CUSSING_BY_GRADE } = await import(pathToFileURL(path.join(BRAIN, 'curriculum.js')).href);
const kSet = new Set(K_VOCABULARY.map(w => w.toLowerCase()));

const CLEAN = w => /^[a-z][a-z-]*$/.test(w) && w.length >= 2 && w.length <= 20;
const tokens = (t) => String(t).toLowerCase().match(/[a-z][a-z-]*/g) || [];

// ── Grade config: key, AoA-age, output file, export name, source runner file.
const GRADES = [
  { key: 'grade1',   age: 6,  file: 'grade1-vocabulary.js',     exp: 'G1_VOCABULARY',   runner: 'grade1.js',   label: 'Grade 1 (age 6-7)' },
  { key: 'grade2',   age: 7,  file: 'grade2-vocabulary.js',     exp: 'G2_VOCABULARY',   runner: 'grade2.js',   label: 'Grade 2 (age 7-8)' },
  { key: 'grade3',   age: 8,  file: 'grade3-vocabulary.js',     exp: 'G3_VOCABULARY',   runner: 'grade3.js',   label: 'Grade 3 (age 8-9)' },
  { key: 'grade4',   age: 9,  file: 'grade4-vocabulary.js',     exp: 'G4_VOCABULARY',   runner: 'grade4.js',   label: 'Grade 4 (age 9-10)' },
  { key: 'grade5',   age: 10, file: 'grade5-vocabulary.js',     exp: 'G5_VOCABULARY',   runner: 'grade5.js',   label: 'Grade 5 (age 10-11)' },
  { key: 'grade6',   age: 11, file: 'grade6-vocabulary.js',     exp: 'G6_VOCABULARY',   runner: 'grade6.js',   label: 'Grade 6 (age 11-12)' },
  { key: 'grade7',   age: 12, file: 'grade7-vocabulary.js',     exp: 'G7_VOCABULARY',   runner: 'grade7.js',   label: 'Grade 7 (age 12-13)' },
  { key: 'grade8',   age: 13, file: 'grade8-vocabulary.js',     exp: 'G8_VOCABULARY',   runner: 'grade8.js',   label: 'Grade 8 (age 13-14)' },
  { key: 'grade9',   age: 14, file: 'grade9-vocabulary.js',     exp: 'G9_VOCABULARY',   runner: 'grade9.js',   label: 'Grade 9 (age 14-15)' },
  { key: 'grade10',  age: 15, file: 'grade10-vocabulary.js',    exp: 'G10_VOCABULARY',  runner: 'grade10.js',  label: 'Grade 10 (age 15-16)' },
  { key: 'grade11',  age: 16, file: 'grade11-vocabulary.js',    exp: 'G11_VOCABULARY',  runner: 'grade11.js',  label: 'Grade 11 (age 16-17)' },
  { key: 'grade12',  age: 17, file: 'grade12-vocabulary.js',    exp: 'G12_VOCABULARY',  runner: 'grade12.js',  label: 'Grade 12 (age 17-18)' },
  { key: 'college1', age: 18, file: 'college1-vocabulary.js',   exp: 'COL1_VOCABULARY', runner: 'college1.js', label: 'College year 1 (age 18)' },
  { key: 'college2', age: 19, file: 'college2-vocabulary.js',   exp: 'COL2_VOCABULARY', runner: 'college2.js', label: 'College year 2 (age 19)' },
  { key: 'college3', age: 20, file: 'college3-vocabulary.js',   exp: 'COL3_VOCABULARY', runner: 'college3.js', label: 'College year 3 (age 20-21)' },
  { key: 'college4', age: 21, file: 'college4-vocabulary.js',   exp: 'COL4_VOCABULARY', runner: 'college4.js', label: 'College year 4 (age 21-22)' },
  { key: 'grad',     age: 23, file: 'gradschool-vocabulary.js', exp: 'GRAD_VOCABULARY', runner: 'grad.js',     label: 'Graduate school (age 23-24)' },
  { key: 'phd',      age: 25, file: 'phd-vocabulary.js',        exp: 'PHD_VOCABULARY',  runner: 'phd.js',      label: 'Doctoral / PhD (age 25)' },
];
const PRECOCITY = 1.5;
const ageToKey = (a) => { for (const g of GRADES) if (g.age >= a) return g.key; return 'phd'; };

// ── 1. AoA words → grade by precocity-shifted acquisition age ──
const aoaByGrade = Object.fromEntries(GRADES.map(g => [g.key, []]));
const aoaText = fs.readFileSync(AOA, 'utf8').split('\n');
for (let i = 1; i < aoaText.length; i++) {
  const cols = aoaText[i].split('\t');
  if (cols.length < 6) continue;
  const w = String(cols[2] || '').toLowerCase().trim();
  const age = parseFloat(cols[5]);
  if (!CLEAN(w) || !isFinite(age) || kSet.has(w)) continue;
  (aoaByGrade[ageToKey(age - PRECOCITY)] ||= []).push(w);
}

// ── 2. academic vocab from the grade's runner file (quoted strings tokenized) ──
function academicWords(runnerFile) {
  const out = new Set();
  try {
    const src = fs.readFileSync(path.join(CURR, runnerFile), 'utf8');
    for (const q of (src.match(/'[^']*'/g) || [])) {
      for (const w of tokens(q.slice(1, -1))) if (CLEAN(w)) out.add(w);
    }
  } catch { /* runner missing — skip */ }
  return out;
}

// ── 3. story-data vocab from corpora/<domain>/<grade>.json (life + coding).
// CRITICAL (vocab-before-binding LAW): the coding curriculum uses technical
// words (querySelector, fetch, closure, flexbox, json...) — they MUST be in
// the grade vocab so they're learned BEFORE the coding training uses them.
function storyWords(dir, gradeKey) {
  const out = new Set();
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, `${gradeKey}.json`), 'utf8'));
    for (const exp of (data.experiences || [])) for (const w of tokens(exp.story || '')) if (CLEAN(w)) out.add(w);
  } catch { /* no data for this domain/grade — skip */ }
  return out;
}
const lifeWords = (g) => storyWords(LIFE, g);
const codingWords = (g) => storyWords(CODING, g);
// Academic (hybrid) corpus is nested per subject: corpora/academic/<subject>/<grade>.json.
// Pull every subject's grade file so real curriculum vocab (mitochondria,
// photosynthesis, federalism, inflation...) is learned BEFORE the academic
// training binds it (vocab-before-binding LAW).
function academicCorpusWords(gradeKey) {
  const out = new Set();
  let subjects = [];
  try { subjects = fs.readdirSync(ACADEMIC).filter(d => fs.statSync(path.join(ACADEMIC, d)).isDirectory()); } catch { return out; }
  for (const subj of subjects) {
    for (const w of storyWords(path.join(ACADEMIC, subj), gradeKey)) out.add(w);
  }
  return out;
}

// ── Assemble each grade: academic + life + AoA-for-grade + graded cussing.
// Per-grade NEW words (cumulative knowledge emerges as the brain accumulates).
const out = {};
for (const g of GRADES) {
  const set = new Set();
  for (const w of academicWords(g.runner)) set.add(w);       // runner-sentence vocab
  for (const w of academicCorpusWords(g.key)) set.add(w);    // hybrid corpus vocab (corpora/academic/*)
  for (const w of lifeWords(g.key)) set.add(w);
  for (const w of codingWords(g.key)) set.add(w);   // coding terms learned at this grade
  for (const w of (aoaByGrade[g.key] || [])) set.add(w);
  for (const w of (CUSSING_BY_GRADE[g.key] || [])) if (CLEAN(w)) set.add(w);
  // Drop K-vocab words already known (avoid re-warming the curated K set).
  out[g.key] = [...set].filter(w => !kSet.has(w)).sort();
}

// ⭐⭐ EMITS JSON, NOT JAVASCRIPT — changed 2026-09-05.
//
// This used to write nineteen `.js` modules, each one a single
// `export const G5_VOCABULARY = ['abacus', …]` array. That was **676 KB and
// 5,179 lines of "data wearing a `.js` extension"** — counted as source by every
// tool that counts source, and re-parsed by V8 as a program on every load.
//
// ⛔ THIS FUNCTION IS WHY REGENERATING COULD NOT BE LEFT ALONE. Converting the
// nineteen files by hand and leaving the generator emitting `.js` would mean the
// next run silently resurrects all of them beside the JSON, and then TWO sources
// of truth disagree the moment either is edited. **A migration that does not
// move the generator has not moved anything.**
//
// The words, their derivation, their order and their per-grade counts are
// unchanged — only the container is different.
const VOCAB_OUT = path.join(ROOT, 'corpora', 'vocabulary');

let total = 0;
fs.mkdirSync(VOCAB_OUT, { recursive: true });
const manifest = {};
// K is generated elsewhere (the curated foundational list) but is part of the
// same store, so its count rides the manifest for the same reason the others do.
for (const g of GRADES) {
  const dest = path.join(VOCAB_OUT, `${g.key}.json`);
  fs.writeFileSync(dest, JSON.stringify(out[g.key]) + '\n', 'utf8');
  manifest[g.key] = out[g.key].length;
  total += out[g.key].length;
  console.log(`[gen] corpora/vocabulary/${g.key}.json — ${out[g.key].length} real content-derived words`);
}
// ⚠ The manifest is a CONVENIENCE for humans and dashboards, never the
// authority: `fullJourneyVocabularyStats()` counts the arrays themselves, so a
// stale manifest cannot make a grade look bigger than it is.
try {
  const existing = JSON.parse(fs.readFileSync(path.join(VOCAB_OUT, 'manifest.json'), 'utf8'));
  if (existing && typeof existing.kindergarten === 'number') manifest.kindergarten = existing.kindergarten;
} catch { /* first run — no manifest yet */ }
fs.writeFileSync(path.join(VOCAB_OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`[gen] DONE — ${total} clean grade-appropriate words across G1-PhD (content-derived, zero GloVe junk)`);
