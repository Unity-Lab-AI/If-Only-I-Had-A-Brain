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
    for (const s of exp.story.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)) out.push(s);
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
    const sentences = exp.story.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    if (!sentences.length) continue;
    out.push({ theme: typeof exp.theme === 'string' ? exp.theme : '', story: exp.story, sentences });
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

module.exports = {
  loadStories, storySentences, storyExperiences, clearCache, CORPORA,
  loadLifeStories, lifeStorySentences, lifeStoryExperiences,
  loadCodingStories, codingStorySentences,
  loadAcademicStories, academicStorySentences,
};
