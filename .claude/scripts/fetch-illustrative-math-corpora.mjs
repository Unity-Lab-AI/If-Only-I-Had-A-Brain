// fetch-illustrative-math-corpora.mjs — THE K-12 MATHS TEXTBOOK LANE.
//
// Gee: *"we need a fucking text book like everything else you fool"*, then, when
// told the primary-grade arithmetic primer could not be found: *"there has to be
// a fucking k-12 math books and shit out ther wtf libraries have them by the
// hundreds"*.
//
// ⛔ HE WAS RIGHT AND THE EARLIER SEARCH WAS ONE HOST WIDE. The "exhausted"
// verdict was true of PROJECT GUTENBERG only — its best arithmetic text is De
// Morgan's *Elements of Arithmetic*, written by a professor of mathematics at
// University College London, and `topic=counting` there matches *accounting*.
// Reading that as "no open K-12 maths textbook exists" does not follow.
//
// ⭐ ILLUSTRATIVE MATHEMATICS — CC-BY 4.0, no NC, no ND, K-12, static HTML with a
// fully predictable URL shape. Probed 2026-09-02 alongside CK-12 (403, refuses
// this client), EngageNY (site retired), Utah Middle School Math (unreachable),
// Open Up Resources (200, but it IS this same IM content) and Mathematics Vision
// Project (200, CC-BY-NC-SA, secondary only).
//
// ⛔ MATHS IS STILL TAUGHT EQUATIONALLY. This is the KNOWLEDGE half — what a
// variable is, why a sequence behaves as it does, what a construction proves —
// and it is reachable only because `MATHBOOK.1` put `math` into
// `PROSE_ACADEMIC_SUBJECTS`. Every runner, gate and production stack is
// untouched. Writing here without that set membership would have produced
// UNREACHABLE cells: file present, counts healthy, nothing ever reading it.
//
// RUN:  node .claude/scripts/fetch-illustrative-math-corpora.mjs          (all)
//       node .claude/scripts/fetch-illustrative-math-corpora.mjs grade6   (one cell)
// Network required. Re-runnable / idempotent. Node 18+.
//
// ⛔ DO NOT RUN CONCURRENTLY WITH ANOTHER INGEST. Different host, same cell
// files: `CELLRACE.1` made the write atomic, not the read-modify-write
// transactional.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', '..', 'corpora', 'academic');
const BASE = 'https://curriculum.illustrativemathematics.org';
// ⭐⭐ THE SECOND HOST, AND IT EXISTS BECAUSE THE FIRST ONE GENUINELY DOES NOT
// CARRY THE PRIMARY LESSONS (probed 2026-09-02, not assumed).
//
// Every `k5/students/*` shape returns 404 on the publisher's own host. That is
// not a broken path — **IM K-5 does not publish a student book.** At these
// grades the lesson content lives in the TEACHER guide, and the search for a
// primary "student textbook" was a search for a document nobody printed.
//
// Kendall Hunt is IM's distributor and serves that guide as static HTML at
// CC-BY 4.0 (licence read off its own curriculum index, not assumed from the
// publisher's reputation): 50 units and 869 lessons across K-5.
//
// ⚠ Probed alongside it and rejected, with the reason, so nobody re-walks these:
//   Open Up Resources  200 — and a LOGIN WALL behind the 200. Same IM content,
//                            gated on a registered account. A 200 with HTML in
//                            it is not reachability.
//   OER Commons        403 — refuses this client
//   CK-12              403 — refuses this client
// ⛔ Neither 403 is worked around by forging a browser User-Agent. A host saying
// no is an answer.
const KH = 'https://im.kendallhunt.com';
const UA = 'UnityBrainCurriculum/1.0 (educational research; openly-licensed content)';
const LICENCE = 'CC-BY 4.0';

const SENT_MIN = 40, SENT_MAX = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ⛔ THE GRADE MAP FOLLOWS THE ROSTER'S OWN `courseNameFor('math', g)`, AND EACH
// ENTRY WAS CONFIRMED BY READING LESSON 1 OF THE COURSE — not by assuming the
// conventional order:
//   HS/1 "Getting to Know You — collect data and explore"  -> Algebra 1
//   HS/2 "Build It — use tools to create shapes precisely"  -> Geometry
//   HS/3 "A Towering Sequence — the Tower of Hanoi"         -> Algebra 2
//   MS/3 "Moving in the Plane — ways figures can move"      -> Math 8
// The roster names grade8 Algebra I, grade9 Geometry, grade10 Algebra II, so
// those three land exactly. ⚠ `MS/3` (Math 8) ALSO lands at grade8: it is
// genuine grade-eight mathematics and grade8 is the only cell it fits. Two
// sources in one cell is the normal case — the merge keys on theme.
// grade11 (Pre-Calculus) and grade12 (AP Calculus) are already fed by OpenStax
// via `MATHBOOK.1`, so they are deliberately absent here rather than duplicated.
const SECONDARY = [
  { path: 'MS/students/1', grade: 'grade6',  label: 'Math 6' },
  { path: 'MS/students/2', grade: 'grade7',  label: 'Math 7' },
  { path: 'MS/students/3', grade: 'grade8',  label: 'Math 8' },
  { path: 'HS/students/1', grade: 'grade8',  label: 'Algebra I' },
  { path: 'HS/students/2', grade: 'grade9',  label: 'Geometry' },
  { path: 'HS/students/3', grade: 'grade10', label: 'Algebra II' },
];

// ⚠ THE K-5 HALF IS NOT THE SAME KIND OF TEXT AND THE CODE SAYS SO. These are
// UNIT SUMMARIES written for families — "In this unit, students recognize
// numbers and quantities in their world" — not student lessons. Real numeracy
// prose naming counting, quantity and number, but ~533 words per unit against a
// 7,300-word early-band floor. Included because the early band has NO maths
// prose at all today, and labelled honestly rather than counted as a solved
// primary year.
//
// ⛔ THIS COMMENT USED TO SAY "K-5 student pages are served through Kendall
// Hunt, not this host", AND THAT WAS WRONG IN A WAY WORTH KEEPING VISIBLE.
// There are no K-5 student pages on any host: IM does not publish a student book
// at these grades. The lessons are in the TEACHER guide, which Kendall Hunt does
// serve — see `walkPrimaryLessons` below, which is what actually closes this.
// **A guess about WHERE a document lives reads exactly like a fact about
// WHETHER it exists, and it sat here unchallenged until the paths were probed.**
const PRIMARY = [
  { slug: 'kindergarten', grade: 'kindergarten' },
  { slug: 'grade-1', grade: 'grade1' },
  { slug: 'grade-2', grade: 'grade2' },
  { slug: 'grade-3', grade: 'grade3' },
  { slug: 'grade-4', grade: 'grade4' },
  { slug: 'grade-5', grade: 'grade5' },
];

// ⛔ EVERY FETCH IS BOUNDED. A bare `fetch` has no timeout, and one server that
// accepts the connection and never answers stops the whole ingest with no error
// and no output — the trap the Saylor lane hit on book 16 of 40.
async function fetchText(url, ms = 25000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; } finally { clearTimeout(timer); }
}

function cleanSentences(html) {
  const body = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Navigation, headers and footers repeat on every one of ~1,200 pages; left
    // in, the corpus would be mostly "Skip to main content IM Curriculum About
    // Us" — the single most common defect in an HTML ingest.
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[…]/g, '...')
    .replace(/[ -   　]/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
  const out = [];
  for (let s of body.split(/(?<=[.!?])\s+/)) {
    s = s.trim();
    if (s.length < SENT_MIN || s.length > SENT_MAX) continue;
    if (/[^\x20-\x7e]/.test(s)) continue;
    if (!/[a-z]/.test(s) || !/[.!?]$/.test(s)) continue;
    // Site furniture and licence boilerplate that survives the tag strip.
    if (/skip to main content|kendall hunt|google classroom|illustrative mathematics is a|creative commons|all rights reserved|privacy policy|terms of use|sign in|log in/i.test(s)) continue;
    // A run of lesson numbers from the lesson-picker strip ("1 2 3 4 5 …").
    if (/^[\d\s.]+$/.test(s)) continue;
    out.push(s.toLowerCase());
  }
  return out;
}

// ⭐ Figures ride the entry that owns their prose, WITH the corpus text they sit
// inside — the `FIGTEXT.1` shape. A diagram bound only to its own caption is the
// `CAMPOISON` defect one step upstream.
const CONTEXT_CHARS = 1400, CONTEXT_SENTS = 2;
function figureContext(html, index) {
  const s = String(html);
  // The head segment of `before` is discarded: a window cut mid-sentence can
  // still end that fragment at a full stop and pass every filter.
  const before = cleanSentences(s.slice(Math.max(0, index - CONTEXT_CHARS), index)).slice(1);
  const after = cleanSentences(s.slice(index, index + CONTEXT_CHARS));
  return [...before.slice(-CONTEXT_SENTS), ...after.slice(0, CONTEXT_SENTS)]
    .join(' ').replace(/\s+/g, ' ').trim().slice(0, 700);
}

function harvestFigures(html, pageUrl) {
  const figs = [];
  if (!html) return figs;
  for (const m of String(html).matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = m[1];
    const src = (/\bsrc="([^"]+)"/i.exec(attrs) || [])[1] || '';
    if (!src || /^data:/i.test(src) || /logo|icon|sprite|spacer/i.test(src)) continue;
    const alt = ((/\balt="([^"]*)"/i.exec(attrs) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const context = figureContext(html, m.index);
    // An image with no words to bind to is refused — a percept with nothing to
    // anchor it fuses with whatever word happens to be current.
    if (!alt && context.length < 40) continue;
    let abs;
    try { abs = new URL(src, pageUrl).href; } catch { continue; }
    figs.push({ src: abs, alt, caption: '', context });
  }
  return figs;
}

// Walk one course: index -> units -> lessons. NO CAPS anywhere; a stride sample
// of a textbook is a sample of a sample.
async function walkCourse(coursePath) {
  const index = await fetchText(`${BASE}/${coursePath}/index.html`);
  if (!index) return { sentences: [], figures: [], units: 0, lessons: 0, dead: 1 };
  const units = [...new Set([...index.matchAll(/href="([^"]+\/index\.html)"/g)].map((m) => m[1]))]
    .filter((h) => new RegExp(`/${coursePath}/\\d+/index\\.html$`).test(h));

  const all = [], figures = [];
  const figSeen = new Set();
  let lessons = 0, dead = 0;
  for (const u of units) {
    const unitUrl = new URL(u, BASE).href;
    const unitHtml = await fetchText(unitUrl);
    if (!unitHtml) { dead++; continue; }
    all.push(...cleanSentences(unitHtml));
    const lessonLinks = [...new Set([...unitHtml.matchAll(/href="([^"]+\/index\.html)"/g)].map((m) => m[1]))]
      .filter((h) => new RegExp(`/${coursePath}/\\d+/\\d+/index\\.html$`).test(h));
    for (const l of lessonLinks) {
      const lessonUrl = new URL(l, BASE).href;
      const html = await fetchText(lessonUrl);
      if (!html) { dead++; continue; }
      lessons++;
      all.push(...cleanSentences(html));
      for (const f of harvestFigures(html, lessonUrl)) {
        if (figSeen.has(f.src)) continue;
        figSeen.add(f.src);
        figures.push(f);
      }
      await sleep(200);
    }
    await sleep(200);
  }
  if (dead) console.log(`      (${dead} page(s) unreachable or timed out — a shortfall, not a verdict)`);
  const seen = new Set();
  return { sentences: all.filter((s) => !seen.has(s) && seen.add(s)), figures, units: units.length, lessons, dead };
}

async function walkPrimary(slug) {
  const idx = await fetchText(`${BASE}/k5/families/${slug}/units.html`);
  if (!idx) return { sentences: [], figures: [], units: 0 };
  const units = [...new Set([...idx.matchAll(/href="([^"]+family-materials\.html)"/g)].map((m) => m[1]))]
    .filter((h) => h.includes(`/${slug}/`));
  const all = [], figures = [];
  const figSeen = new Set();
  for (const u of units) {
    const url = new URL(u, BASE).href;
    const html = await fetchText(url);
    if (!html) continue;
    all.push(...cleanSentences(html));
    for (const f of harvestFigures(html, url)) {
      if (figSeen.has(f.src)) continue;
      figSeen.add(f.src);
      figures.push(f);
    }
    await sleep(200);
  }
  const seen = new Set();
  return { sentences: all.filter((s) => !seen.has(s) && seen.add(s)), figures, units: units.length };
}

// ⭐⭐ THE PRIMARY LESSONS THEMSELVES — the half `MATHBOOK.2` was filed against.
//
// Shape, read off the live site rather than guessed:
//   /K5/teachers/<slug>/units.html            -> unit links
//   /k5/teachers/<slug>/unit-N/lessons.html   -> lesson links
//   /k5/teachers/<slug>/unit-N/lesson-M/*.html
// ⚠ The index links are lower-case `/k5/` while the index itself answers on
// `/K5/`; the host is case-insensitive, and the links are followed AS SERVED
// rather than re-cased, so this lane never depends on which one is canonical.
//
// ⚠ REGISTER IS TEACHER-FACING AND THE LOG LINE SAYS SO EVERY TIME. These pages
// describe the lesson in the third person — "students count objects and relate
// counting to addition" — around the mathematics itself. That is real numeracy
// prose naming quantity, counting and number, and it is the only form this
// content is published in; it is NOT a student's own reading voice, and calling
// it one would be the same overclaim the family-materials lane was caught making.
async function walkPrimaryLessons(slug) {
  const idx = await fetchText(`${KH}/K5/teachers/${slug}/units.html`);
  if (!idx) return { sentences: [], figures: [], units: 0, lessons: 0, dead: 1 };
  const units = [...new Set([...idx.matchAll(/href="([^"]*\/unit-\d+\/[^"]*)"/g)].map((m) => m[1]))]
    .filter((h) => new RegExp(`/teachers/${slug}/unit-\\d+/`, 'i').test(h));
  const all = [], figures = [];
  const figSeen = new Set();
  let lessons = 0, dead = 0;
  for (const u of units) {
    const unitUrl = new URL(u, KH).href;
    const unitHtml = await fetchText(unitUrl);
    if (!unitHtml) { dead++; continue; }
    all.push(...cleanSentences(unitHtml));
    // One entry per lesson NUMBER — a lesson may serve several sibling pages and
    // they are all part of the same lesson, so they are all read.
    const lessonPages = [...new Set([...unitHtml.matchAll(/href="([^"]*\/lesson-\d+\/[^"]+\.html)"/g)].map((m) => m[1]))]
      .filter((h) => new RegExp(`/teachers/${slug}/unit-\\d+/lesson-\\d+/`, 'i').test(h));
    const seenLesson = new Set();
    for (const l of lessonPages) {
      const lessonUrl = new URL(l, KH).href;
      const html = await fetchText(lessonUrl);
      if (!html) { dead++; continue; }
      const num = (/\/lesson-(\d+)\//.exec(l) || [])[1];
      if (num && !seenLesson.has(num)) { seenLesson.add(num); lessons++; }
      all.push(...cleanSentences(html));
      for (const f of harvestFigures(html, lessonUrl)) {
        if (figSeen.has(f.src)) continue;
        figSeen.add(f.src);
        figures.push(f);
      }
      await sleep(200);
    }
    await sleep(200);
  }
  if (dead) console.log(`      (${dead} page(s) unreachable or timed out — a shortfall, not a verdict)`);
  const seen = new Set();
  return { sentences: all.filter((s) => !seen.has(s) && seen.add(s)), figures, units: units.length, lessons, dead };
}

function writeCell(subject, grade, entry) {
  const dir = path.join(OUT, subject);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `${grade}.json`);
  const byTheme = new Map();
  try {
    const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    for (const e of (prev.experiences || [])) byTheme.set(e.theme, e);
  } catch { /* fresh cell */ }
  const old = byTheme.get(entry.theme);
  const sameSource = old && old.source === entry.source;
  if (!old || sameSource || entry.story.length > old.story.length) byTheme.set(entry.theme, entry);
  // Otherwise the keep-longer rule would discard the pictures along with the
  // story it rejected, on exactly the runs that exist to add them.
  else if (entry.figures && entry.figures.length && !(old.figures && old.figures.length)) {
    byTheme.set(entry.theme, { ...old, figures: entry.figures });
  }
  const merged = [...byTheme.values()];
  // ⛔ ATOMIC — a rename cannot leave a half-written cell behind.
  const tmp = `${outPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({
    version: 1, grade, subject,
    source: 'hybrid: Illustrative Mathematics (CC-BY 4.0) + prior sources, cleaned + sentence-segmented',
    note: `Maths KNOWLEDGE corpus for ${subject}/${grade}. Trained via curriculum._trainAcademicStories alongside the equational runners, which are untouched.`,
    experiences: merged,
  }, null, 2), 'utf8');
  fs.renameSync(tmp, outPath);
  return merged.length;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0];
let grandWords = 0, grandFigs = 0, grandLessons = 0;

for (const c of SECONDARY) {
  if (only && c.grade !== only) continue;
  console.log(`[im] ${c.label} -> math/${c.grade}  (${c.path})`);
  const got = await walkCourse(c.path);
  if (got.sentences.length < 50) { console.log(`  SKIPPED — only ${got.sentences.length} usable sentences`); continue; }
  const words = got.sentences.join(' ').split(/\s+/).length;
  const entry = {
    theme: `im-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    story: got.sentences.join(' '),
    source: `illustrative-math/${c.path}`,
    licence: LICENCE,
  };
  if (got.figures.length) entry.figures = got.figures;
  const n = writeCell('math', c.grade, entry);
  grandWords += words; grandFigs += got.figures.length; grandLessons += got.lessons;
  console.log(`  ${got.units} units · ${got.lessons} lessons · ${got.sentences.length} sentences · ${words.toLocaleString()} words · ${got.figures.length} figures (cell now ${n} entries)`);
}

for (const p of PRIMARY) {
  if (only && p.grade !== only) continue;
  console.log(`[im] K-5 ${p.slug} -> math/${p.grade}`);
  const got = await walkPrimary(p.slug);
  if (got.sentences.length < 20) { console.log(`  SKIPPED — only ${got.sentences.length} usable sentences`); continue; }
  const words = got.sentences.join(' ').split(/\s+/).length;
  const entry = {
    theme: `im-k5-${p.slug}`,
    story: got.sentences.join(' '),
    source: `illustrative-math/k5/${p.slug}`,
    licence: LICENCE,
  };
  if (got.figures.length) entry.figures = got.figures;
  const n = writeCell('math', p.grade, entry);
  grandWords += words; grandFigs += got.figures.length;
  // ⚠ Says what it is every time: unit summaries, not lessons.
  console.log(`  ${got.units} unit summaries (FAMILY-FACING, not student lessons) · ${words.toLocaleString()} words · ${got.figures.length} figures (cell now ${n} entries)`);
}

// ⭐ The primary LESSONS, from Kendall Hunt. Kept as its own entry beside the
// family summaries rather than replacing them: the merge keys on theme, the two
// are genuinely different texts about the same unit, and a parent-facing
// explanation is worth having next to the lesson it explains.
for (const p of PRIMARY) {
  if (only && p.grade !== only) continue;
  console.log(`[im] K-5 LESSONS ${p.slug} -> math/${p.grade}  (${KH})`);
  const got = await walkPrimaryLessons(p.slug);
  if (got.sentences.length < 50) { console.log(`  SKIPPED — only ${got.sentences.length} usable sentences`); continue; }
  const words = got.sentences.join(' ').split(/\s+/).length;
  const entry = {
    theme: `im-k5-lessons-${p.slug}`,
    story: got.sentences.join(' '),
    source: `illustrative-math-kh/k5/teachers/${p.slug}`,
    licence: LICENCE,
  };
  if (got.figures.length) entry.figures = got.figures;
  const n = writeCell('math', p.grade, entry);
  grandWords += words; grandFigs += got.figures.length; grandLessons += got.lessons;
  console.log(`  ${got.units} units · ${got.lessons} lessons (TEACHER-FACING lesson text — the only form IM publishes K-5) · ${words.toLocaleString()} words · ${got.figures.length} figures (cell now ${n} entries)`);
}

console.log(`[im] DONE — ${grandWords.toLocaleString()} words, ${grandLessons} lessons, ${grandFigs.toLocaleString()} figures written under corpora/academic/math/.`);
