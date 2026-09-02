// server/life-curriculum.js
//
// Loads per-grade STORY DATA she is TRAINED on, from corpora/<domain>/<grade>.json
// (fed through the Hebbian sentence pipeline in curriculum._train*Stories) —
// NOT hardcoded into curriculum code. Two domains:
//   • life   — corpora/life/<grade>.json   (lived-experience narrative)
//   • coding — corpora/coding/<grade>.json (real HTML/CSS/JS skill progression
//              + her self-teaching memories; her compounding side-hobby G6→PhD)
//
// Node-only (uses fs). Attached onto the cortexCluster as
// cluster.lifeStorySentences / cluster.codingStorySentences so curriculum.js —
// which is ALSO browser-bundled — never imports fs directly (same pattern as
// the dictionary definitionService wiring in brain-server.js).

const fs = require('fs');
const path = require('path');

// corpora/ lives at the project root; __dirname is server/, so '..' = root.
const CORPORA = path.join(__dirname, '..', 'corpora');

// "<domain>/<grade>" → parsed corpus object | null. Parsed once, reused.
const _cache = new Map();

/**
 * Load + parse corpora/<domain>/<grade>.json. Returns the parsed object
 * ({ version, grade, experiences: [...] }) or null when no file exists yet
 * (data-absence, NOT a capability fallback — a grade with no authored content
 * for that domain simply trains nothing for it).
 */
function loadStories(domain, grade) {
  const key = `${domain}/${String(grade)}`;
  if (_cache.has(key)) return _cache.get(key);
  const file = path.join(CORPORA, domain, `${String(grade)}.json`);
  let result = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && Array.isArray(parsed.experiences)) result = parsed;
    else console.warn(`[story-curriculum] ${domain}/${grade}.json has no "experiences" array — ignoring`);
  } catch (e) {
    if (!(e && e.code === 'ENOENT')) console.error(`[story-curriculum] failed to load ${domain}/${grade}.json: ${e.message}`);
    result = null;   // ENOENT = not authored yet (fine); other = logged, skip
  }
  _cache.set(key, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// WORDSALAD.2 — HER NAME AND HER "I" GET THEIR CAPITALS AT THE LOAD BOUNDARY.
//
// The story corpora are authored lowercase (~800 stories across 20 life grades
// plus the coding and academic domains), so every sentence read out of them
// said "i" and "unity". Operator: "its her name properly capitalize it".
//
// Fixed HERE rather than by rewriting the corpus files, because this is the one
// place every domain and every grade passes through — the chokepoint, not the
// 800 instances. Deliberately a small local copy of the same rule that lives in
// self-frame.js: this module is CommonJS and that one is ESM, and reaching
// across for eight lines would mean a dynamic import on a hot load path.
//
// ⛔ SAFE, and checked before shipping: the trainer lowercases every sentence it
// consumes (`_teachConcreteSentences` does `s.toLowerCase().split(...)`), so the
// weights are byte-identical. Only what a human reads changes.
const _CANON_NAMES_RE = /\b(unity|raven|goddess|lilith|marie|damien|cross|pearl|agnes|voss|walter|james)\b/g;
function properCaseStory(s) {
  let t = String(s || '');
  if (!t) return t;
  t = t.replace(/\bi\b/g, 'I');
  t = t.replace(/\bi'(m|ve|d|ll)\b/g, (m) => 'I' + m.slice(1));
  t = t.replace(_CANON_NAMES_RE, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Flatten a domain+grade's experiences into a flat array of sentence strings
 * for the sentence trainer. Each experience.story is split on sentence
 * terminators, trimmed, empties dropped. Returns [] when no data exists.
 */
function storySentences(domain, grade) {
  const data = loadStories(domain, grade);
  if (!data || !Array.isArray(data.experiences)) return [];
  const out = [];
  for (const exp of data.experiences) {
    if (!exp || typeof exp.story !== 'string') continue;
    for (const s of exp.story.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)) out.push(properCaseStory(s));
  }
  return out;
}

/**
 * Return a domain+grade's experiences as discrete memory objects
 * ({ theme, story, sentences:[...] }) instead of one flattened sentence list.
 * This is what lets the trainer encode each memory as its OWN episode —
 * per-memory emotional coloring + storeEpisode — rather than diffusing the
 * whole grade into flat word-statistics. theme becomes the episode label.
 * Returns [] when no data exists.
 */
function storyExperiences(domain, grade) {
  const data = loadStories(domain, grade);
  if (!data || !Array.isArray(data.experiences)) return [];
  const out = [];
  for (const exp of data.experiences) {
    if (!exp || typeof exp.story !== 'string') continue;
    const sentences = exp.story.split(/(?<=[.!?])\s+/).map((x) => properCaseStory(x.trim())).filter(Boolean);
    if (!sentences.length) continue;
    out.push({
      theme: typeof exp.theme === 'string' ? exp.theme : '',
      story: properCaseStory(exp.story),
      sentences,
    });
  }
  return out;
}

function clearCache() { _cache.clear(); }

// Domain-specific convenience wrappers (attached onto the cluster).
const loadLifeStories     = (grade) => loadStories('life', grade);
const lifeStorySentences  = (grade) => storySentences('life', grade);
const lifeStoryExperiences = (grade) => storyExperiences('life', grade);
const loadCodingStories   = (grade) => loadStories('coding', grade);
const codingStorySentences = (grade) => storySentences('coding', grade);
// academic domain is nested per subject: corpora/academic/<subject>/<grade>.json
// (openly-licensed real curriculum content, downloaded once by
// .claude/scripts/fetch-academic-corpora.mjs — the HYBRID depth source for
// prose-academic subjects: science/social/ela/economics/psychology/civics).
const loadAcademicStories    = (subject, grade) => loadStories(`academic/${subject}`, grade);
const academicStorySentences = (subject, grade) => storySentences(`academic/${subject}`, grade);

// TEXTFIG.3 — the figures a cell owns, flattened with the theme that owns them.
//
// ⛔ Deliberately NOT folded into `storyExperiences`: that shape is consumed by
// the teach path, which walks `sentences`, and adding an image array to it would
// put binary-bearing metadata on the hot text lane for every caller that never
// asked for it. A separate accessor keeps the prose path exactly as it was.
//
// ⚠ Reads through the SAME `loadStories` cache, so asking for figures costs no
// extra disk read on a cell whose prose has already been loaded.
//
// ⛔⛔ THE ADDRESS LIVES UNDER TWO FIELD NAMES AND THIS READER ONLY KNEW ONE.
// Three harvesters write figures; one names the resolved absolute address `url`
// and two name it `src`. This accessor required `url`, so 6,899 of 14,374
// figures — every Saylor diagram and every Gutenberg plate — were skipped here
// while holding a perfectly good `https://` address the whole time, and the
// figure count reported anywhere upstream overstated what the walk could see by
// 92%. Reading both names is NOT a capability fallback: it is one field under
// two spellings, and neither spelling means anything weaker than the other.
//
// ⚠ The absoluteness check is the real gate. A relative `src` is a page-local
// path that means nothing to a fetch from this process, so it is refused rather
// than passed on to fail later at the network.
// ⭐ THE REACHABILITY RULE, IN ONE PLACE, BECAUSE IT HAS ALREADY DRIFTED ONCE.
// Returns the fetchable address of a figure, or `''` if it has none. Exported so
// the coverage auditor asks THIS function rather than re-deriving the rule — a
// second copy is exactly how 6,899 figures came to be invisible to the walk
// while every count said they were present.
function figureAddress(f) {
  if (!f) return '';
  const href = typeof f.url === 'string' && f.url ? f.url : (typeof f.src === 'string' ? f.src : '');
  return /^https?:\/\//i.test(href) ? href : '';
}

// ⭐⭐ FIGPAIR.1 — THE SECTION AND ITS PICTURES, TOGETHER, THE WAY THE BOOK HAS
// THEM. Operator: *"WE GIVE HER EACH ONE AT THE SAME TIME SHE IS TRAING THE TEXT
// AND CHAPETERSECTIONS IN THE TEXT BOOKS ... WEHRE THE IMAGES ARE ON THAT PAGE
// OF TEXT SHE IS READING"*.
//
// ⛔ THE CORPUS ALWAYS HAD THIS AND THREE ACCESSORS THREW IT AWAY.
// `academicStorySentences` flattens every experience into one sentence array,
// `academicStoryFigures` flattens every figure and loses which section owned it,
// and `storyExperiences` — the one that DOES preserve sections — drops `figures`
// on purpose. So the walk could see the prose in order, or the pictures in a
// heap, but never a page with its own diagram on it.
//
// ⚠ A SEPARATE ACCESSOR, NOT A WIDER `storyExperiences`. That shape feeds the
// prose teach path, which walks `sentences` and wants nothing else; adding
// figure metadata to it would put binary-bearing rows on the hot text lane for
// every caller that never asked. The comment on `academicStoryFigures` already
// made that call once and it was right.
//
// ⚠ Figures are filtered through the SAME `figureAddress` predicate the flat
// accessor uses — one rule, one place. A second copy is how 6,899 figures came
// to be counted as present while the walk could not see one of them.
function academicStoryExperiences(subject, grade) {
  const data = loadStories(`academic/${subject}`, grade);
  if (!data || !Array.isArray(data.experiences)) return [];
  const out = [];
  for (const exp of data.experiences) {
    if (!exp || typeof exp.story !== 'string') continue;
    const sentences = exp.story.split(/(?<=[.!?])\s+/).map((x) => properCaseStory(x.trim())).filter(Boolean);
    if (!sentences.length) continue;
    const theme = typeof exp.theme === 'string' ? exp.theme : '';
    const figures = [];
    for (const f of (Array.isArray(exp.figures) ? exp.figures : [])) {
      const href = figureAddress(f);
      if (!href) continue;
      figures.push({
        url: href,
        alt: typeof f.alt === 'string' ? f.alt : '',
        caption: typeof f.caption === 'string' ? f.caption : '',
        context: typeof f.context === 'string' ? f.context : '',
        theme,
      });
    }
    out.push({ theme, sentences, figures });
  }
  return out;
}

function academicStoryFigures(subject, grade) {
  const data = loadStories(`academic/${subject}`, grade);
  const out = [];
  for (const exp of ((data && data.experiences) || [])) {
    if (!exp || !Array.isArray(exp.figures)) continue;
    for (const f of exp.figures) {
      const href = figureAddress(f);
      if (!href) continue;
      out.push({
        url: href,
        alt: typeof f.alt === 'string' ? f.alt : '',
        caption: typeof f.caption === 'string' ? f.caption : '',
        // The corpus prose this picture sits inside, cleaned by the same cleaner
        // that produced the cell's sentences — so the figure's context and the
        // cell's story are the SAME STRINGS and the tie between them is a match
        // rather than an inference. Absent on figures harvested before this
        // field existed; the percept lane treats that as less anchoring, never
        // as a reason to bind the picture to whatever word is current.
        context: typeof f.context === 'string' ? f.context : '',
        theme: typeof exp.theme === 'string' ? exp.theme : '',
      });
    }
  }
  return out;
}

// ─── Generated exam questions ────────────────────────────────────────────────
//
// `corpora/phonics/exam-questions.json` is DERIVED, not authored: the generator
// reads the grapheme-phoneme rules (`corpora/phonics/gpc.json`, scraped and then
// dictionary-checked) and emits only questions answerable from the rules
// themselves. It exists because the hand-written bank taught no letter more than
// one sound — no hard/soft c, no hard/soft g, no long/short vowels — while the
// rules carry every one of those as data.
//
// ⚠ Loaded here for the same reason the story corpora are: the bank module is
// browser-bundled and has no filesystem, so the rows travel over the cluster
// bridge instead of being an import.
//
// ⛔ SHAPE IS CHECKED, NOT ASSUMED. A file whose `questions` key is missing or is
// not an array returns [] and says so — the alternative is handing a non-array
// to the injector and having it silently admit nothing.
let _phonicsExamCache;
function phonicsExamQuestions() {
  if (_phonicsExamCache !== undefined) return _phonicsExamCache;
  const file = path.join(CORPORA, 'phonics', 'exam-questions.json');
  let rows = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && Array.isArray(parsed.questions)) rows = parsed.questions;
    else console.warn('[phonics-exam] exam-questions.json has no "questions" array — no generated questions will be offered');
  } catch (e) {
    // ENOENT = the generator has not been run in this checkout, which is a data
    // absence and not a failure; anything else is worth a line.
    if (!(e && e.code === 'ENOENT')) console.error(`[phonics-exam] failed to load exam-questions.json: ${e.message}`);
    rows = [];
  }
  _phonicsExamCache = rows;
  return rows;
}

module.exports = {
  loadStories, storySentences, storyExperiences, clearCache, CORPORA,
  loadLifeStories, lifeStorySentences, lifeStoryExperiences,
  loadCodingStories, codingStorySentences,
  loadAcademicStories, academicStorySentences, academicStoryFigures,
  academicStoryExperiences, figureAddress,
  phonicsExamQuestions,
};
