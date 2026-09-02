// fetch-openstax-corpora.mjs — REAL TEXTBOOK ingest for the academic corpus.
//
// This is the fetcher that was marked "✅ DONE 2026-07-15" in the ledger and
// never written. The source decision it implements is not new and is not mine:
// the hybrid OpenStax + Wikibooks + Project Gutenberg spread. ⛔ **The licence
// posture changed 2026-09-02 and this paragraph used to say "CC-BY / CC-BY-SA
// only, commercial-safe, CC-BY-NC excluded (which is why LibreTexts and MIT OCW
// are not here)" — that is no longer the rule.** Gee: *"we will use what ever
// has educational rights this is not a cvommercial use its a non profit
// educational experiment"*. NonCommercial material is in; **NoDerivatives stays
// out**, because this corpus publishes an adaptation. See `licenceOf` below.
// Output format, path and merge semantics are IDENTICAL to
// fetch-academic-corpora.mjs — same corpora/academic/<subject>/<grade>.json,
// same {theme, story} entries, same keep-longer union — so the two sources
// compose into one corpus instead of competing for the same files.
//
// SOURCE: the philschatz/*-book mirrors of OpenStax textbooks. Each repo holds
// contents/*.md — the real chapter prose, one file per section. Licence is
// CC-BY (verified per book from the repo's own LICENSE.txt at fetch time and
// recorded PER ENTRY, never assumed at the file level).
//
// ⭐ WHY A TEXTBOOK AND NOT MORE ENCYCLOPEDIA: an encyclopedia article states
// what a thing is. A textbook chapter EXPLAINS it, in the order a student meets
// it, with the worked reasoning between the facts. That difference is the whole
// point of the hybrid decision — and a grade-9 biology year is a book, not
// twenty summaries about biology.
//
// RUN:  node .claude/scripts/fetch-openstax-corpora.mjs               (all mapped cells)
//       node .claude/scripts/fetch-openstax-corpora.mjs science       (one subject)
//       node .claude/scripts/fetch-openstax-corpora.mjs science grade9
// Network required. Re-runnable / idempotent (keep-longer merge). Node 18+.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'corpora', 'academic');
const UA = 'UnityBrainCurriculum/1.0 (educational research; openly-licensed content)';
// The mirror owner. Kept as a named constant because every URL below needs it
// and omitting it 404s silently — which is exactly what happened on the first
// run: the licence probe fetched a bad URL, got nothing, and the licence guard
// correctly refused the book rather than assuming a licence it had not read.
const OWNER = 'philschatz';

const SENT_MIN = 30, SENT_MAX = 240;

// Same grade-banded ceiling as the wiki ingest — a real year is a different
// size at every grade, and one flat number applied to twenty different years is
// exactly the defect that kept the whole corpus at 14 sentences per topic.
// ⛔⛔⛔ NO CAP — 2026-09-02, on Gee's instruction that *"all the corpus needs to
// be complete"*. The comment above is right about flat numbers and was still
// describing a ceiling; a grade-banded ceiling is a smaller version of the same
// knife. **A textbook is taken whole.** The band floor in
// `docs/CURRICULUM-GAP.md §THE TARGET LADDER` says when a CELL is full; nothing
// says how much of a book she is allowed to read.
const SENT_CAP_BY_BAND = {
  early: Infinity, middle: Infinity, upper: Infinity, high: Infinity, college: Infinity, grad: Infinity,
};
const BAND_OF_GRADE = new Map([
  ['pre-k', 'early'], ['kindergarten', 'early'], ['grade1', 'early'], ['grade2', 'early'],
  ['grade3', 'middle'], ['grade4', 'middle'], ['grade5', 'middle'],
  ['grade6', 'upper'], ['grade7', 'upper'], ['grade8', 'upper'],
  ['grade9', 'high'], ['grade10', 'high'], ['grade11', 'high'], ['grade12', 'high'],
  ['college1', 'college'], ['college2', 'college'], ['college3', 'college'], ['college4', 'college'],
  ['grad', 'grad'], ['phd', 'grad'],
]);
const sentCapFor = (g) => SENT_CAP_BY_BAND[BAND_OF_GRADE.get(String(g || '').toLowerCase())] || SENT_CAP_BY_BAND.early;

// BOOK -> (subject, grade). The mapping is not invented here: it follows the
// course each grade actually runs per docs/CURRICULUM-SCOPE-SEQUENCE.md and the
// existing topic table — science G9 Biology, G10 Chemistry, G11 Physics, G12
// Anatomy/Physiology. The textbook simply replaces the encyclopedia summaries
// that were standing in for those courses.
//
// ⛔⛔ MATH WAS ABSENT ON PURPOSE, AND THE OPERATOR MADE THE CURRICULUM
// DECISION ON 2026-09-02. The note here used to read: *"the algebra/calculus/
// precalculus mirrors exist and are deliberately NOT mapped. Adding prose there
// would be a change to how math is taught, which is a curriculum decision, not
// an ingest decision."* That was the correct boundary and it was correctly
// refused at the ingest level — the decision was simply made above it, and math
// is now in `PROSE_ACADEMIC_SUBJECTS`, so these files are reachable.
//
// ⭐ Math is still TAUGHT equationally. The book supplies the knowledge half —
// what a variable is, why a limit exists, what the theorem says — beside runners
// that are untouched.
//
// ⚠ THE GRADES ARE THE ROSTER'S OWN, not invented here: `courseNameFor('math',
// g)` gives Algebra II at grade10, Pre-Calculus at grade11, AP Calculus at
// grade12, so the mirrors that exist land where the course names already say
// they belong. ⛔ **There is no OpenStax mirror for Math 1-5, Algebra I or
// Geometry**, so those cells have no textbook FROM THIS HOST; that gap is real
// and is on the board rather than papered over by putting a calculus book in
// grade 8.
//
// ✅ **AND IT IS CLOSED FROM ELSEWHERE, 2026-09-02** — Illustrative Mathematics
// supplies Algebra I and Geometry, and its K-5 teacher guide (via Kendall Hunt)
// supplies Math K-5. Every one of those cells now clears its band floor. **The
// statement above stays because it is still true OF THIS HOST, and reading a
// per-host gap as a per-corpus gap is what kept the primary grades unfed.**
const BOOK_MAP = [
  { repo: 'biology-concepts-book', subject: 'science', grade: 'grade9',    label: 'Biology' },
  { repo: 'chemistry-book',        subject: 'science', grade: 'grade10',   label: 'Chemistry' },
  { repo: 'physics-book',          subject: 'science', grade: 'grade11',   label: 'Physics' },
  { repo: 'anatomy-book',          subject: 'science', grade: 'grade12',   label: 'Anatomy and Physiology' },
  { repo: 'astronomy-book',        subject: 'science', grade: 'grade6',    label: 'Earth and Space Science' },
  { repo: 'biology-book',          subject: 'science', grade: 'college1',  label: 'General Biology' },
  { repo: 'microbiology-book',     subject: 'science', grade: 'college2',  label: 'Microbiology' },
  { repo: 'economics-book',        subject: 'economics', grade: 'grade11', label: 'Macroeconomics' },
  // ⛔⛔ `genered`, NOT `economics` — AND THE THIRD TIME THIS EXACT MISTAKE WAS
  // MADE. **`economics` RETIRES AT grade12.** Above that the roster runs
  // `major` / `genered` / `cstheory` / `cssystems` / `research`, so an
  // `economics/college1` file is a cell the walk never opens. The research lane
  // and the Saylor lane were each corrected for this; **this table never was**,
  // and `corpora/academic/economics/college1.json` has been sitting on disk with
  // **342,056 words the walk cannot read** ever since — found by teaching the
  // coverage auditor to count figures, which is not what it was looking for.
  //
  // ⚠ AND THE MISS WAS DOUBLE-BLIND: the Saylor lane skips college1 entirely
  // with the comment *"college1 is OpenStax's ceiling and already fed"* — true
  // of this table, false of the walk. **One lane deferring to another lane's
  // dead cell is how a gap survives two corrections.** `genered` matches
  // Saylor's own `COLLEGE_HOME` for economics, so the two agree now.
  { repo: 'economics-book',        subject: 'genered',   grade: 'college1', label: 'Principles of Economics' },
  // Math's knowledge half — see the block above. Grades follow the roster's own
  // `courseNameFor('math', g)`; licences verified CC-BY 3.0 on all three, and
  // chapter counts read from the repo rather than assumed: 83 / 96 / 131.
  { repo: 'algebra-intermediate-book',  subject: 'math', grade: 'grade10',  label: 'Algebra II' },
  { repo: 'algebra-trigonometry-book',  subject: 'math', grade: 'grade11',  label: 'Pre-Calculus' },
  // ⛔⛔ THE CALCULUS MIRROR IS ALL THREE PUBLISHED VOLUMES IN ONE REPO, AND
  // UNSPLIT IT PUT MULTIVARIABLE VECTOR CALCULUS IN A GRADE-TWELVE CELL.
  //
  // Found 2026-09-02 by reading `math/grade12`'s own theme list back: it carried
  // `triple-integrals`, `vectors-in-three-dimensions`, `green-s-theorem`,
  // `stokes-theorem` and `the-divergence-theorem` — Volume 3 — while
  // `courseNameFor('math','college1')` is literally **"Calculus II and
  // Multivariable"** and that cell was EMPTY. Content four years above its grade,
  // in the corpus, while the cell named for it held nothing.
  //
  // ⭐ THE SPLIT IS THE PUBLISHER'S, READ FROM `SUMMARY.md` — chapter titles, not
  // keywords, and `buildBook` refuses the whole book if a title is not in that
  // TOC. OpenStax's Volume 3 is the seven chapters from Parametric Equations
  // onward; the first of those is ALSO the last chapter of Volume 2, so it stays
  // with AP Calculus (BC covers it) and Volume 3 proper starts at Vectors in
  // Space. Volume 1 + Volume 2 = AP Calculus; Volume 3 = the multivariable half
  // of the college course.
  {
    repo: 'calculus-book', subject: 'math', grade: 'grade12', label: 'AP Calculus',
    chapters: [
      'Functions and Graphs', 'Limits', 'Derivatives', 'Applications of Derivatives',
      'Integration', 'Applications of Integrations', 'Techniques of Integration',
      'Introduction to Differential Equations', 'Sequences and Series', 'Power Series',
      'Parametric Equations and Polar Coordinates',
    ],
  },
  {
    repo: 'calculus-book', subject: 'math', grade: 'college1', label: 'Multivariable Calculus',
    chapters: [
      'Vectors in Space', 'Vector-Valued Functions',
      'Differentiation of Functions of Several Variables', 'Multiple Integration',
      'Vector Calculus', 'Second-Order Differential Equations',
    ],
  },
  // ⛔⛔ "PHILSCHATZ CARRIES 11 *-BOOK REPOS AND EXACTLY THREE ARE MATHS" WAS
  // WRONG, AND IT WAS WRITTEN AS A CHECKED FACT (corrected 2026-09-02).
  // The org carries **22** `*-book` repos and **five** are maths: the three
  // above plus `precalculus-book` and `statistics-book`. The undercount is why
  // this table stopped at AP Calculus and every degree-level maths cell was
  // reported EMPTY — a wrong inventory reads exactly like an exhausted source.
  //
  // ⚠ MAPPED AGAINST THE ROSTER'S OWN COURSE NAME, NOT BY SUBJECT KEYWORD.
  // `courseNameFor('math','college3')` is **"Differential Equations and
  // Statistics"**, so Introductory Statistics lands there and covers half that
  // course. It is deliberately NOT put at college1 ("Calculus II and
  // Multivariable"), which statistics is not.
  //
  // ⚠ `precalculus-book` is NOT added: grade11 is Pre-Calculus and already has
  // `algebra-trigonometry-book` mapped to it. A second book on the same course
  // is worth having, but it is a top-up for a fed cell, not a fix for an empty
  // one, and the empty cells come first.
  { repo: 'statistics-book',            subject: 'math', grade: 'college3', label: 'Statistics' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// OpenStax markdown carries YAML frontmatter, HTML blocks (tables, figures,
// exercise divs), CNX link syntax and inline term-attribute spans. Every one of
// those yields text that looks like a sentence and is not prose, so they are
// removed BEFORE segmentation rather than filtered after.
// ⭐ `TEXTFIG.1` — HARVEST THE FIGURES INSTEAD OF DELETING THEM.
//
// Every OpenStax figure ships as `![alt text](path "caption")`, which is a
// LABELLED PERCEPT: an image, a human-written description of it, and a caption
// tying it to the surrounding prose. The cleaner used to delete all three in
// one regex because it was only ever asked for sentences.
//
// ⚠ Alt text and caption are kept SEPARATE from `story` on purpose. They are
// not body prose — folding them in would inflate the word count with material
// that reads like a caption, and the corpus bar is measured in prose words.
//
// ⭐⭐ AND THE PICTURE COMES WITH THE PROSE IT SITS INSIDE. A caption is the
// picture's OWN words, written to be read while looking at the picture — for
// thousands of figures the whole textual anchor is a line like "Figure 1.1 World
// Exports, 1948-2008", which binds a percept to a number and a date rather than
// to the subject it illustrates. `context` is the surrounding BODY prose, run
// through the very cleaner that produced this cell's sentences, so the figure's
// context and the cell's story are the SAME STRINGS and the tie between them is
// a match rather than an inference.
const CONTEXT_CHARS = 1400;   // raw source taken either side of the image
const CONTEXT_SENTS = 2;      // whole sentences kept on each side

// ⚠ The window is cut from RAW source, so both ends can land mid-sentence. The
// TRAILING cut is already handled: the cleaner drops any segment that does not
// end in terminal punctuation, so a cut tail is discarded rather than fused onto
// its neighbour — the fabrication defect that made the speech lane invent
// sentences nobody said.
//
// ⛔ THE LEADING CUT IS NOT, AND A HARNESS ON A REAL PAGE CAUGHT IT: a window
// beginning mid-sentence can still end that fragment at a full stop, producing
// half a sentence that wears a terminator and passes every filter. The head
// segment of `before` is therefore always discarded — it is the ONE segment the
// cut can have truncated invisibly.
function figureContext(raw, index, clean) {
  const before = clean(String(raw).slice(Math.max(0, index - CONTEXT_CHARS), index), Infinity).slice(1);
  const after = clean(String(raw).slice(index, index + CONTEXT_CHARS), Infinity);
  return [...before.slice(-CONTEXT_SENTS), ...after.slice(0, CONTEXT_SENTS)]
    .join(' ').replace(/\s+/g, ' ').trim().slice(0, 700);
}

function harvestFigures(md) {
  const figs = [];
  if (!md) return figs;
  // ![alt](path "caption")  — caption optional, quotes single or double.
  const re = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["']([^"']*)["'])?\s*\)/g;
  let m;
  while ((m = re.exec(String(md))) !== null) {
    const alt = (m[1] || '').replace(/\s+/g, ' ').trim();
    const src = (m[2] || '').trim();
    const caption = (m[3] || '').replace(/\s+/g, ' ').trim();
    if (!src) continue;
    // A figure with no words attached teaches nothing a percept can bind TO —
    // it would be an image with no label, which is the camera-frame defect
    // (`CAMPOISON`) all over again. Skip rather than bank an unlabelled image.
    if (!alt && !caption) continue;
    figs.push({ src, alt, caption, context: figureContext(md, m.index, cleanOpenStax) });
  }
  return figs;
}

// `TEXTFIG.5` — the prose a table carries, without the data it tabulates.
// Takes the `summary="..."` attribute and the `<caption>` text; drops every
// cell. ⚠ Returns a sentence-terminated string or empty — the segmenter below
// splits on terminal punctuation, so a caption without a full stop would fuse
// with the next paragraph and corrupt both.
function tableCaptionProse(block) {
  if (!block) return '';
  const decode = (x) => String(x || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // ⚠ SUMMARY WINS, AND THE CAPTION IS NOT APPENDED TO IT. Measured on a real
  // chapter: the summary is a whole sentence ("Table showing Young's modulus Y,
  // Shear modulus S, and bulk modulus B for a variety of materials"), while the
  // caption is a TITLE plus its footnote marker ("Elastic Moduli 1").
  // Concatenating them produced "…materials.. Elastic Moduli 1." — a doubled
  // full stop and a sentence fragment glued to a good sentence.
  const sum = /<table[^>]*\ssummary="([^"]+)"/i.exec(block);
  let s = sum ? decode(sum[1]) : '';
  if (!s) {
    const cap = /<caption[^>]*>([\s\S]*?)<\/caption>/i.exec(block);
    s = cap ? decode(cap[1]) : '';
    // A bare title is not prose. Require enough words that it reads as a claim
    // rather than a heading, and strip a trailing footnote digit.
    s = s.replace(/\s+\d+$/, '');
    if (s.split(/\s+/).length < 5) return '';
  }
  if (!s) return '';
  if (!/[.!?]$/.test(s)) s += '.';
  return s;
}

function cleanOpenStax(md, cap) {
  if (!md) return [];
  let t = String(md);
  t = t.replace(/^---[\s\S]*?---/m, ' ');                 // YAML frontmatter
  // `TEXTFIG.5` — TABLES: THE BODY STAYS OUT, THE CAPTION COMES IN.
  //
  // Measured on a real chapter before deciding. An OpenStax table body is
  // numeric data — a row reads `Aluminum | 70 | 25 | 75` — so row-to-prose
  // would bank "aluminum 70 25 75", binding a material to three meaningless
  // integers. ⛔ That is number salad of exactly the class the LaTeX and
  // brace filters below already exist to reject, so converting rows would be
  // manufacturing the very input those guards were written to stop.
  //
  // ⭐ But the caption and the `summary` attribute are AUTHORED PROSE that
  // name the concepts the table is about — "Table showing Young's modulus Y,
  // Shear modulus S, and bulk modulus B for a variety of materials." That is a
  // figure's alt text by another name, and it was being deleted with the data.
  //
  // Replaced rather than stripped, so the caption lands in the sentence stream
  // and faces every quality filter below on equal terms with body prose.
  t = t.replace(/<table[\s\S]*?<\/table>/gi, (block) => ' ' + tableCaptionProse(block) + ' ');
  t = t.replace(/<div[^>]*>|<\/div>/gi, ' ');             // block wrappers
  t = t.replace(/<[^>]+>/g, ' ');                         // any remaining html
  t = t.replace(/\{:[^}]*\}/g, ' ');                      // {: data-type="term"} spans
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');            // images — harvested separately by harvestFigures()
  t = t.replace(/\[\\?\[?link\\?\]?\]\([^)]*\)/gi, ' ');  // [\[link\]](#id)
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');          // [text](url) -> text
  // ⛔ THE MARKDOWN AND LaTeX BRACKETS THE RULES ABOVE DO NOT REACH (2026-09-02).
  // Measured in the shipped corpus, not guessed: `read this [article][1] for an
  // example`, `link to learning this [video][1] reviews`, `\[ s o subscript 2 \]`
  // and stray `![` openers all trained as textbook prose. The reference-style
  // link form `[text][n]` is a different shape from `[text](url)` and slipped
  // past the line above.
  t = t.replace(/\[([^\[\]]*)\]\[[^\[\]]*\]/g, '$1');     // [text][1] -> text
  t = t.replace(/\\\[[\s\S]{0,400}?\\\]/g, ' ');          // \[ ... \] LaTeX display math
  t = t.replace(/!\[/g, ' ');                             // orphaned image openers
  t = t.replace(/\[\s*\d+(?:\s*[,-]\s*\d+)*\s*\]/g, ' '); // [ 12 ] numeric refs
  t = t.replace(/^\s*[*+-]\s+/gm, ' ');                   // bullet markers
  t = t.replace(/^#{1,6}\s+.*$/gm, ' ');                  // headings
  t = t.replace(/[*_`]+/g, '');                           // emphasis marks
  // Same normalisation the wiki cleaner uses, and for the same reason: the
  // ASCII test below is correct in intent and catastrophic without this, since
  // typographic punctuation appears in nearly every textbook sentence.
  t = t.replace(/[‘’‚‛′]/g, "'")
       .replace(/[“”„‟″]/g, '"')
       .replace(/[‐-―−]/g, '-')
       .replace(/[…]/g, '...')
       .replace(/[     ]/g, ' ')
       .normalize('NFD').replace(/[̀-ͯ]/g, '')
       .replace(/\s+/g, ' ');
  const out = [];
  for (let s of t.split(/(?<=[.!?])\s+/)) {
    s = s.trim();
    if (s.length < SENT_MIN || s.length > SENT_MAX) continue;
    if (/[^\x20-\x7e]/.test(s)) continue;
    if (!/[a-z]/.test(s) || !/[.!?]$/.test(s)) continue;
    // Textbook scaffolding that is not subject prose.
    if (/^by the end of this section|^learning objectives|^figure |^table |^visit this|^watch this|^click here/i.test(s)) continue;
    // Figure-caption debris. A caption enumerating panels — "(a) ... , (b) ...,
    // and (c) ..." — survives the leading-"figure" test when the word "figure"
    // sits earlier in the block, and it teaches her nothing but list glue.
    // Caught by reading the extracted prose, not by reasoning about the format.
    if ((s.match(/\(\s*[a-e]\s*\)/g) || []).length >= 2) continue;
    // ⛔ OPENSTAX EMBEDS ITS MATH AS LaTeX IN THE MARKDOWN, and it survived the
    // tag strip: `size 12{p= { {f} over {a} } } {}` was banked as a sentence.
    // Same rule as the wiki cleaner — DROP, do not repair; half a formula is
    // not prose with a blemish.
    if (/\\displaystyle|\\[a-z]{2,}\s*\{|size\s+\d+\s*\{|\bover\s*\{/i.test(s)) continue;
    if ((s.match(/[{}]/g) || []).length >= 2) continue;
    // A cross-reference whose `[link](...)` target was stripped, leaving
    // "as shown in ." — it now points at nothing.
    if (/\b(as shown in|as illustrated in|shown in|illustrated in|see)\s*[.,]/i.test(s)) continue;
    out.push(s.toLowerCase());
    if (out.length >= cap) break;
  }
  return out;
}

async function ghJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 120)}`);
  return JSON.parse(text);
}

async function raw(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return '';
  return r.text();
}

// Licence is READ from the book, not assumed. A per-entry licence string that
// was guessed is worse than none — it would pass the TEACHVIEW "licence
// recorded" check while being unverified.
// ⛔⛔ LICENCE POSTURE CHANGED 2026-09-02 ON GEE'S RULING, AND THE AXIS MOVED.
//
// Gee (verbatim): *"we will use what ever has educational rights this is not a
// cvommercial use its a non profit educational experiment"*.
//
// The old gate refused **NonCommercial** because the posture was
// commercial-safe. It is not a commercial project, so NC no longer excludes
// anything — and that gate was the reason LibreTexts and most of the Open
// Textbook Library were unreachable.
//
// ⚠ THE AXIS THAT STILL BITES IS **NoDerivatives**, and it is a different axis
// from commerce. This corpus does not merely read a book: it cleans, excerpts
// and sentence-segments it into a file that is **published in a public
// repository**. That is distributing an adaptation, which ND forbids no matter
// how non-commercial the intent is. ND therefore stays refused.
//
// ShareAlike is accepted with its consequence understood: a corpus built from
// SA material carries the SA obligation onward. Attribution is satisfied by the
// per-entry `source` + `licence` fields every ingest already writes.
async function licenceOf(repo) {
  const txt = await raw(`https://raw.githubusercontent.com/${OWNER}/${repo}/master/LICENSE.txt`);
  const m = /Creative Commons Attribution([^.\n]*)/i.exec(txt || '');
  if (!m) return null;
  const tail = m[1].replace(/\s+/g, ' ').trim();
  if (/NoDeriv|\bND\b/i.test(tail)) return { id: `CC-BY${tail}`, ok: false, why: 'NoDerivatives — this corpus publishes an adaptation' };
  return { id: `CC-BY${tail ? ' ' + tail : ''}`.trim(), ok: true };
}

// ⭐⭐ THE PUBLISHER'S OWN CHAPTER MAP — the thing that makes a volume split a
// READ rather than a guess.
//
// A book repo ships `SUMMARY.md`, its table of contents: one line per chapter
// tagged `{: .chapter}` followed by its section lines, every one carrying the
// module id it lives in. That is an authoritative chapter → modules mapping
// written by the publisher.
//
// ⛔ THIS EXISTS BECAUSE THE ALTERNATIVE WAS BANNED, AND RIGHTLY. The merged
// calculus mirror carries all three published volumes as ONE repo with opaque
// module-id filenames (`m53472.md`), so the only other way to split it is to
// classify chapters by keywords in their titles — a word list acting as a
// classifier, which is the approach this project has been corrected on three
// separate times. **The map was sitting in the repo the whole time.**
async function bookToc(repo) {
  const md = await raw(`https://raw.githubusercontent.com/${OWNER}/${repo}/master/SUMMARY.md`);
  if (!md) return null;
  const chapters = [];
  let cur = null;
  for (const line of String(md).split(/\n/)) {
    const chap = /\{:\s*\.chapter\s*\}\s*\[([^\]]+)\]\(contents\/([^)]+)\)/.exec(line);
    if (chap) { cur = { title: chap[1].trim(), modules: [chap[2].trim()] }; chapters.push(cur); continue; }
    // A preface or appendix ends the current chapter's run of sections.
    if (/\{:\s*\.(preface|appendix)\s*\}/.test(line)) { cur = null; continue; }
    const sect = /\[([^\]]+)\]\(contents\/([^)]+)\)/.exec(line);
    if (sect && cur) cur.modules.push(sect[2].trim());
  }
  return chapters.length ? chapters : null;
}

async function buildBook({ repo, subject, grade, label, chapters }) {
  const cap = sentCapFor(grade);
  console.log(`[openstax] ${repo} -> ${subject}/${grade} (cap ${cap})${chapters ? `  [${chapters.length} chapter(s) of the book]` : ''}`);

  const lic = await licenceOf(repo);
  if (!lic) { console.log(`  SKIPPED — no readable licence in ${repo}/LICENSE.txt`); return 0; }
  if (!lic.ok) { console.log(`  SKIPPED — ${lic.id} violates the CC-BY/CC-BY-SA-only posture`); return 0; }
  console.log(`  licence verified: ${lic.id}`);

  let files;
  try { files = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/contents/contents`); }
  catch (e) { console.log(`  SKIPPED — listing failed: ${e.message}`); return 0; }
  const mds = files.filter((f) => f.type === 'file' && f.name.endsWith('.md'));
  if (!mds.length) { console.log('  SKIPPED — no chapter files'); return 0; }

  // ⛔⛔ EVERY CHAPTER, WHOLE — 2026-09-02. This block used to stride-sample **60
  // of the book's chapters** and give each a slice of a global cap, so a
  // 283-chapter physics textbook shipped ~60 partial chapters and 223 were never
  // downloaded at all. The comment above was right that front-loading is wrong
  // and still left most of the book on the server. Gee: *"all the corpus needs
  // to be complete"*.
  let picked = mds;

  // ⭐ A VOLUME SPLIT, DRIVEN BY THE PUBLISHER'S TABLE OF CONTENTS.
  // ⛔ FAILS LOUDLY RATHER THAN SILENTLY INGESTING THE WHOLE BOOK: if the TOC is
  // unreadable, or a named chapter is not in it, this returns 0 instead of
  // writing every chapter into a cell that asked for seven. **A filter that
  // falls back to "everything" on error is how a grade-twelve cell would quietly
  // acquire a multivariable calculus course — which is the exact defect this
  // split exists to undo.**
  if (chapters) {
    const toc = await bookToc(repo);
    if (!toc) { console.log(`  SKIPPED — ${repo}/SUMMARY.md unreadable, and a chapter filter may not guess`); return 0; }
    const known = new Set(toc.map((c) => c.title));
    const missing = chapters.filter((t) => !known.has(t));
    if (missing.length) {
      console.log(`  SKIPPED — chapter(s) not in the book's own TOC: ${missing.join(' | ')}`);
      console.log(`            the TOC lists: ${toc.map((c) => c.title).join(' | ')}`);
      return 0;
    }
    const want = new Set();
    for (const c of toc) if (chapters.includes(c.title)) for (const m of c.modules) want.add(m);
    picked = mds.filter((f) => want.has(f.name));
    console.log(`  ${picked.length} of ${mds.length} chapter files selected by the book's own TOC`);
    if (!picked.length) { console.log('  SKIPPED — TOC matched no files on disk'); return 0; }
  }

  const experiences = [];
  let taken = 0;
  let figuresFound = 0;
  for (const f of picked) {
    const md = await raw(`https://raw.githubusercontent.com/${OWNER}/${repo}/master/contents/${f.name}`);
    const title = (/^title:\s*"?([^"\n]+)"?/m.exec(md || '') || [, f.name.replace(/\.md$/, '')])[1].trim();
    const sents = cleanOpenStax(md, Infinity);
    if (sents.length >= 3) {
      // `TEXTFIG.1` — figures ride the entry that owns their chapter, so a
      // percept can be bound to the SAME theme its prose trained under. Paths
      // are resolved against the book repo here rather than at use time: the
      // markdown says `../resources/<name>`, which is meaningless once the
      // entry has been detached from the file it came from.
      const figs = harvestFigures(md).map((g) => ({
        ...g,
        url: /^https?:/i.test(g.src)
          ? g.src
          : `https://raw.githubusercontent.com/${OWNER}/${repo}/master/resources/${g.src.replace(/^.*\//, '')}`,
      }));
      const entry = {
        theme: `${label}: ${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        story: sents.join(' '),
        source: `openstax/${repo}`,
        licence: lic.id,
      };
      // Only attach when there is something to attach. An empty array on every
      // entry would read as "figures were looked for and found none" on cells
      // ingested before this existed, which is a different claim.
      if (figs.length) entry.figures = figs;
      experiences.push(entry);
      taken += sents.length;
      figuresFound += figs.length;
    }
    await sleep(120);   // polite to raw.githubusercontent
  }
  if (!experiences.length) { console.log('  SKIPPED — no usable prose extracted'); return 0; }

  const dir = path.join(OUT, subject);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `${grade}.json`);
  // Keep-longer union across DIFFERENT sources — a re-run can only ADD coverage,
  // and two sources merge by theme instead of overwriting each other.
  //
  // ⛔⛔ SAME SOURCE WINS OUTRIGHT, AND WITHOUT THIS CLAUSE A REPAIR RUN IS A
  // GUARANTEED NO-OP. Keep-longer alone compares a re-fetch of the SAME book
  // against itself: the story text is identical, so `>` is false, the OLD entry
  // is kept, and every improvement that does not lengthen the prose — a figure's
  // `context`, a corrected licence, a new field entirely — can never land. That
  // is not hypothetical: **8 OpenStax books held 7,055 figures with no `context`
  // key at all**, and re-running this fetcher against them rewrote the cells,
  // logged success, and changed nothing. `fetch-saylor-corpora.mjs` and
  // `fetch-research-corpora.mjs` both already carry this clause; this file was
  // the one that did not, and the board had already recorded the trap by name.
  const byTheme = new Map();
  let prevDoc = null;
  try {
    prevDoc = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    for (const e of (prevDoc.experiences || [])) byTheme.set(e.theme, e);
  } catch { /* fresh cell */ }
  for (const e of experiences) {
    const old = byTheme.get(e.theme);
    const sameSource = old && old.source === e.source;
    if (!old || sameSource || e.story.length > old.story.length) byTheme.set(e.theme, e);
  }
  const merged = [...byTheme.values()];
  const doc = {
    version: 1, grade, subject,
    source: 'hybrid: OpenStax textbooks (CC-BY) + Simple/English Wikipedia (CC-BY-SA), cleaned + sentence-segmented',
    note: `Hybrid academic-depth corpus for ${subject}/${grade}. Trained via curriculum._trainAcademicStories. Real openly-licensed curriculum content; lived-year + math stay bespoke.`,
    experiences: merged,
  };
  // ⛔ ATOMIC — these cell files are shared by every ingest, and two of them have
  // already been caught running at the same time over the same twelve subjects.
  // A rename cannot leave a half-written file behind; it degrades a lost update
  // into last-writer-wins, which a deterministic re-run repairs.
  const tmp = `${outPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), 'utf8');
  fs.renameSync(tmp, outPath);
  console.log(`  ${experiences.length} chapters, ${taken} sentences -> ${subject}/${grade}.json (cell now ${merged.length} entries)`);
  return taken;
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [argSubject, argGrade] = positional;
let total = 0;
for (const b of BOOK_MAP) {
  if (argSubject && b.subject !== argSubject) continue;
  if (argGrade && b.grade !== argGrade) continue;
  try { total += await buildBook(b); }
  catch (e) { console.log(`[openstax] ${b.repo} FAILED — ${e.message}`); }
}
console.log(`[openstax] DONE — ~${total} real textbook sentences written under corpora/academic/.`);
