// fetch-libretexts-corpora.mjs — THE COLLEGE + GRAD TEXTBOOK LANE, LICENCE-GATED.
//
// ⛔ WHY THIS HOST AND NOT ANOTHER FETCHER FOR A SMALL ONE. The standing ruling
// was *"find a bigger host first, before writing any more fetchers … probe
// licence AND reachability per host before a line of fetcher is written."*
// LibreTexts is that host, measured rather than assumed: **≥295,534 pages across
// eight libraries**, and its bookshelf areas line up with the starved courses
// one for one — `human` 75,004 against art/language/music, `socialsci` 74,685
// against social/psychology, `eng` 24,459 against the CS trio.
//
// ⭐ IT ALSO REACHES A HOST THAT REFUSES US DIRECTLY. `smarthistory.org` returns
// 403 to this client, and *SmartHistory of Art 2e* is here as a 710-page book
// under CC BY-NC-SA 4.0. The mirror is reachable where the origin is not.
//
// ⛔⛔ WHAT THIS LANE DOES **NOT** FIX, STATED FIRST SO NOBODY READS THE PAGE
// COUNT AS A SOLVED BOARD. Of the 129 cells with no textbook:
//
//     early K-8      68 cells   ← NOT reachable from here. College prose in a
//                                 grade-2 cell is the wrong-band defect the
//                                 coverage audit specifically verified absent.
//     highschool     41 cells   ← only partly; grade 11-12 at best
//     college        16 cells   ← THIS LANE
//     grad/phd        4 cells   ← THIS LANE
//
// **The largest block is the one a college host cannot serve.** Those 68 need
// primers and readers — a different source entirely. 295,534 pages is a real
// answer to a real question, and it is not an answer to that one.
//
// RUN:  node .claude/scripts/fetch-libretexts-corpora.mjs                (all mapped areas)
//       node .claude/scripts/fetch-libretexts-corpora.mjs art            (one subject)
//       node .claude/scripts/fetch-libretexts-corpora.mjs --list         (probe only, writes nothing)
// Network required. Re-runnable / idempotent. Node 18+.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripLeakedMarkup } from './clean-math.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'corpora', 'academic');
const UA = 'UnityBrainCurriculum/1.0 (educational research; https://www.unityailab.com; contact@unityailab.com)';

const SENT_MIN = 40, SENT_MAX = 320;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ⛔⛔ THE LICENCE GATE, AND IT IS THE REASON THIS FILE IS SAFE TO RUN.
//
// Operator ruling 2026-09-02: admit any VERIFIED Creative Commons licence
// including NonCommercial and ShareAlike, and **SKIP any book whose licence
// cannot be read.** Both halves matter — the second one is what stops the lane
// inheriting a site-wide default it never checked.
//
// ⚠ MEASURED BEFORE THE GATE WAS WRITTEN, over 25 evenly-spaced pages: 12 with
// no attribution block at all, 4 CC BY-NC-SA 4.0, 3 CC BY-NC-SA, 2 "not
// declared", 1 each CC BY-SA / CC BY 4.0 / CC BY / CC BY-NC 4.0. **"not
// declared" is a real value LibreTexts publishes**, not a fetch failure, and it
// is precisely the case that must not be guessed at.
//
// ⛔ ND REFUSES, and this is the one clause that still does. The corpus is a
// cleaned, excerpted, sentence-segmented ADAPTATION published in a public
// repository — that is what NoDerivatives forbids regardless of commercial
// intent. Same rule the Saylor lane already applies.
const LICENCE_OK = /^cc[\s-]*by(?:[\s-]*(?:nc|sa|nc[\s-]*sa))?(?:\s*\d(?:\.\d)?)?$/i;
function licenceVerdict(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return { ok: false, why: 'no attribution block on the book root' };
  if (/not declared/i.test(s)) return { ok: false, why: 'the book itself states "not declared"' };
  if (/noderiv|[\s-]nd\b|by[\s-]*nc[\s-]*nd|by[\s-]*nd/i.test(s)) return { ok: false, why: `ND forbids the adaptation this corpus is (${s})` };
  // ⚠⚠ NON-CC LICENCES ARE SKIPPED AND NAMED, NOT SILENTLY DROPPED — and two of
  // them are skipped on a TECHNICALITY I do not want buried in a total.
  //
  // ⛔ **PUBLIC DOMAIN is strictly MORE permissive than every licence admitted
  // above**, and GNU FDL explicitly permits derivatives. Refusing either is not
  // caution, it is the gate's wording outrunning its intent. They are refused
  // anyway because the ruling said *Creative Commons*, and **quietly widening a
  // gate the operator drew is how a scope stops being traceable** — but they are
  // counted apart and surfaced by name at the end of the run so the cost is a
  // number the operator can rule on rather than a silence.
  if (!/^cc/i.test(s)) {
    const permissive = /public domain|^pd\b|cc0|gnu free doc|gfdl/i.test(s);
    return { ok: false, why: `not a Creative Commons licence (${s})`, nonCC: true, permissive };
  }
  const bare = s.replace(/\s*\d(\.\d)?\s*$/, '').trim();
  if (!LICENCE_OK.test(bare)) return { ok: false, why: `unrecognised CC form (${s})` };
  return { ok: true, licence: s };
}

// ⭐ LibreTexts publishes the licence in a machine-readable block on every book
// root: `<div class="autoattribution">… is shared under a <a>CC BY-SA 4.0</a>
// license …</div>`. Found by reading the page, not by guessing at a meta tag —
// there is no `<meta>` licence, no JSON-LD and no `creativecommons.org` link
// anywhere in the markup, so every pattern the obvious approach would try
// returns nothing.
const ATTR_RE = /<div class="autoattribution">([\s\S]{0,900}?)<\/div>/i;
function licenceOf(html) {
  const m = ATTR_RE.exec(String(html || ''));
  if (!m) return '';
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const lic = /is shared under (?:an? )?(.+?) licen[sc]e/i.exec(text);
  return lic ? lic[1].trim() : '';
}

// ⛔ EVERY FETCH IS BOUNDED. A bare `fetch` has no timeout, and one server that
// accepts a connection and never answers stops the whole ingest with no error
// and no output — a failure this project has already paid for on another lane.
async function fetchText(url, ms = 25000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; } finally { clearTimeout(timer); }
}

// ⛔⛔ TWO SITEMAP SHAPES, AND ASSUMING ONE YIELDS ZERO FROM THE OTHER HALF.
// `human` and `socialsci` serve a `<sitemapindex>` pointing at shards; the other
// six serve a FLAT list of page URLs at the same filename. My own probe counter
// assumed the index shape and reported `med` as *"29,535 shards, 0 pages"* — the
// right number wearing the wrong noun. Detected from the document element, never
// from the library name, so a library that changes shape does not silently
// return nothing.
async function libraryPages(lib) {
  const top = await fetchText(`https://${lib}.libretexts.org/sitemap.xml`, 30000);
  if (!top) return [];
  const locs = [...top.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!/<sitemapindex/i.test(top)) return locs;
  const all = [];
  for (const shard of locs) {
    const s = await fetchText(shard, 40000);
    if (!s) continue;
    all.push(...[...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    await sleep(200);
  }
  return all;
}

// ⭐ A BOOK IS THE PATH PREFIX BEFORE ITS FIRST NUMBERED CHAPTER SEGMENT.
// LibreTexts chapter segments are `NN%3A_Title` (`NN:` percent-encoded), so the
// book root is everything above the first one. Verified rather than assumed:
// **27,142 of 28,736 pages in one shard resolve to a root, yielding 708 distinct
// books.** The 1,594 that do not are shelf indexes and stray pages, and they are
// skipped — a page with no book has no licence to inherit.
//
// ⛔ FRONT AND BACK MATTER ARE CHAPTER-LEVEL, NOT BOOK-LEVEL, AND MISSING THAT
// MADE THE REFUSAL COUNTER LIE. LibreTexts names those sections `zz:_Back_Matter`
// and `zz:_Front_Matter` — no leading digit — so a rule keyed only on `NN:`
// walked straight past them and resolved `…/SomeBook/zz:_Back_Matter` as a book
// in its own right. Caught on the first live run: of 37 books reported refused
// for an unreadable licence in `art`, **about thirty were back-matter stubs of
// books already counted** — an index page has no attribution block because it is
// not a book. No bad data could reach the corpus (they were refused either way),
// but the number describing the gate was wrong, which is the defect class this
// project keeps paying for.
function bookRootOf(url) {
  const parts = url.split('/');
  const i = parts.findIndex((s) => /^(?:\d+|zz)(?:%3A|:)/i.test(s));
  return i > 0 ? parts.slice(0, i).join('/') : null;
}

// ⛔ THE BOOKSHELF AREA IS THE SUBJECT SIGNAL, NOT THE LIBRARY. `human` alone
// holds Art, Music, Languages and Literature — four different courses in this
// curriculum. Mapping by library would file a music theory text under art.
//
// ⚠ DELIBERATELY SMALL AND EXPLICIT: an unmapped area is SKIPPED, never forced
// into the nearest cell, because a philosophy text filed under `science` is
// worse than a gap. ⛔ `Mathematics` is absent ON PURPOSE — maths is taught
// equationally here and a maths prose corpus is what the grade-completion gate
// exists to forbid.
const AREA_MAP = {
  Art: 'art', Art_History_and_Theory: 'art', Visual_Arts: 'art', Photography: 'art', Theater_and_Film: 'art',
  Literature_and_Literacy: 'ela', Composition: 'ela', Languages: 'ela', Journalism_and_Mass_Communication: 'ela',
  History: 'social', Geography: 'social', Anthropology: 'social', Sociology: 'social',
  Political_Science_and_Civics: 'social', Social_Work_and_Human_Services: 'social',
  Computer_Science: 'cssystems', Engineering: 'cssystems',
  Biology: 'science', Chemistry: 'science', Physics: 'science', Geosciences: 'science', Astronomy__Cosmology: 'science',
  // ⭐ MATHEMATICS ADDED 2026-09-04. `math` owes 1,286,412 words across six
  // cells — the single largest debt in the corpus — and reading those cells'
  // sources showed **100% Wikipedia, zero books**. Not a cap problem: no
  // library in `LIBS` mapped to `math` at all, so the lane could never take a
  // maths book no matter how starved the cell was.
  Algebra: 'math', Analysis: 'math', Applied_Mathematics: 'math', Calculus: 'math',
  Combinatorics_and_Discrete_Mathematics: 'math', Differential_Equations: 'math',
  Geometry: 'math', Linear_Algebra: 'math', Mathematical_Logic_and_Proof: 'math',
  Precalculus: 'math', Probability_Theory: 'math', Abstract_and_Geometric_Algebra: 'math',
  Scientific_Computing_Simulations_and_Modeling: 'math',
};

// ⛔⛔ THE CELL A SUBJECT LIVES IN AT COLLEGE IS NOT ITS OWN NAME — a trap this
// project has now hit twice on two different lanes. `economics`, `psychology`,
// `civics` and `cs` all RETIRE at grade12, so an `economics/college3.json` is
// not a thin cell, it is one the walk never opens. The reachable college
// subjects, read off the tree: art · cssystems · cstheory · ela · genered ·
// major · science · social.
const COLLEGE_HOME = { economics: 'genered', psychology: 'genered', civics: 'genered', cs: 'major' };
const collegeCellFor = (s) => COLLEGE_HOME[s] || s;

// The starved cells this lane exists to fill, measured off the corpus.
//
// ⭐⭐ `grad` and `phd` ADDED 2026-09-04, and the reason is a measurement: the
// worst-starved cells in the whole corpus are `math/phd` (57,930 words),
// `math/grad` (84,889), `art/phd` (111,904) and `ela/grad` (130,609) — and
// reading their sources shows **every one of them is 100% Wikipedia articles
// with ZERO books**. They were never short two books; they were never visited.
//
// ⛔ SO THIS IS NOT A CAP CHANGE AND MUST NOT BE READ AS ONE. `BOOKS_PER_CELL`
// is still 2 and is still the operator's number. This lane simply never looked
// above `college4`, so a whole band of real cells sat outside its reach.
const GRADES = ['college1', 'college2', 'college3', 'college4', 'grad', 'phd'];

// ⛔⛔ A GRADE ONLY COUNTS FOR A SUBJECT IF THAT CELL ACTUALLY EXISTS ON DISK.
//
// `cellState` returns `{words: 0, mine: 0}` for a file it cannot read, so an
// unguarded grade list reports every non-existent cell as maximally starved and
// this lane would happily CREATE it — which is precisely the trap recorded
// twenty lines above: `economics/college3.json` is not a thin cell, it is one
// the walk never opens. Existence is the honest test, because the cells the
// walk runs are the ones the corpus tooling already made.
function gradesFor(home) {
  return GRADES.filter((g) => {
    try { return fs.existsSync(path.join(OUT, home, `${g}.json`)); }
    catch { return false; }
  });
}

// ⛔⛔⛔ TWO BOOKS PER GRADE. THAT IS THE BOUND, AND IT IS THE OPERATOR'S NUMBER.
//
// Verbatim: *"okay wtf i toolkd u we dont need 400 books!!! like 2 books per
// grade is it"* — after an earlier correction on the same point, *"wtf we doint
// need 4000 fucking books"*.
//
// ⛔ I GOT THIS WRONG TWICE AND THE SECOND TIME WAS WORSE, because I had already
// been told. The first version walked the whole host catalogue — 478 books —
// because the host had them. The second bounded on the 330,000-word band floor,
// which is a smaller number wearing the same mistake: **it still sizes the run
// by how much text a cell could hold rather than by how many books a course
// actually has.** A real college course has a textbook, maybe two. Not fifteen.
//
// ⚠ THE BAND FLOOR IS STILL REPORTED, NEVER SILENTLY DROPPED. A cell that holds
// two whole books and still sits under the ladder's floor is a fact the coverage
// auditor should say out loud — but it is a fact about the LADDER, not a licence
// to keep downloading. The run prints the shortfall and stops anyway.
const BOOKS_PER_CELL = 2;
const BAND_FLOOR = 330000;

// What a cell already holds: words, and how many books THIS lane has put there.
// ⭐ Counting this lane's own books by source prefix is what makes a re-run
// idempotent — it tops up a cell that has one book and skips one that has two,
// instead of adding two more every time it is run.
function cellState(subject, grade) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(OUT, subject, `${grade}.json`), 'utf8'));
    let words = 0, mine = 0;
    for (const e of (d.experiences || [])) {
      words += String(e.story || '').split(/\s+/).length;
      if (/^libretexts\//.test(String(e.source || ''))) mine++;
    }
    return { words, mine };
  } catch { return { words: 0, mine: 0 }; }
}

function cleanSentences(html) {
  const body = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\[[^[\]]*\]/g, ' ')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/[…]/g, '...')
    .replace(/[     ]/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
  const out = [];
  for (let s of body.split(/(?<=[.!?])\s+/)) {
    s = s.trim();
    if (s.length < SENT_MIN || s.length > SENT_MAX) continue;
    if (/[^\x20-\x7e]/.test(s)) continue;
    if (!/[a-z]/.test(s) || !/[.!?]$/.test(s)) continue;
    if (/[[\]]/.test(s)) continue;
    // Platform furniture, navigation and attribution boilerplate — not the book.
    // ⛔ The attribution sentence in particular repeats on EVERY page of every
    // book, so leaving it in would teach the phrase "is shared under a license
    // and was authored, remixed, and/or curated by LibreTexts" thousands of
    // times — a running head is not the text.
    if (/libretexts|creative commons|is shared under|was authored, remixed|licensed under|all rights reserved|page id|contentuploads|table of contents|previous|next\b/i.test(s)) continue;
    if (/^(figure|table|exercise|example|definition|theorem|learning objectives)\b/i.test(s)) continue;
    const m = stripLeakedMarkup(s);
    if (m.drop) continue;
    out.push(m.text.toLowerCase());
  }
  return out;
}

// ⭐⭐ THE FIGURES, BECAUSE THE PICTURES ARE TRAINING DATA — NOT DECORATION.
// A textbook diagram goes down the same road her own eyes use: fetched, run
// through the forward CDF 9/7 transform and banked as a percept against the
// theme its prose trained under. Shape matches the other harvesters exactly
// (`{src, alt, caption, context}`) so nothing downstream knows which ingest
// produced a figure.
const CONTEXT_CHARS = 1400;
const CONTEXT_SENTS = 2;

// ⚠ The window is cut from RAW HTML, so both ends can land mid-sentence. The
// trailing cut is handled by `cleanSentences` refusing anything without terminal
// punctuation. ⛔ THE LEADING CUT IS NOT — a window beginning mid-sentence can
// still end that fragment at a full stop, producing half a sentence wearing a
// terminator that passes every filter. The head segment is therefore always
// discarded: it is the one segment the cut can have truncated invisibly.
function figureContext(html, index) {
  const s = String(html);
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
    if (!src || /^data:/i.test(src)) continue;
    // Platform chrome: the logo, sharing badges and the CC licence buttons.
    if (/licensebuttons|i\.creativecommons\.org|\/@style\/|logo|icon|avatar|spacer/i.test(src)) continue;
    const alt = ((/\balt="([^"]*)"/i.exec(attrs) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const title = ((/\btitle="([^"]*)"/i.exec(attrs) || [])[1] || '').replace(/\s+/g, ' ').trim();
    // LibreTexts wraps figures in `<figure>` with the caption in `<figcaption>`.
    const after = String(html).slice(m.index, m.index + 1200);
    const capM = /<figcaption[^>]*>([\s\S]{0,400}?)<\/figcaption>/i.exec(after);
    const caption = capM ? capM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    // ⚠ AN IMAGE WITH NO WORDS IS REFUSED. A percept with nothing to bind to is
    // the unlabelled-frame defect, where a picture fuses with whatever word
    // happened to be current and becomes a false memory.
    if (!alt && !caption && !title) continue;
    let abs; try { abs = new URL(src, pageUrl).href; } catch { continue; }
    figs.push({ src: abs, alt: alt || title, caption, context: figureContext(html, m.index) });
  }
  return figs;
}

async function readBook(root, pages) {
  const all = [];
  const figures = [];
  const figSeen = new Set();
  let dead = 0;
  // EVERY page of the book, in the book's own order. No stride, no sample, no
  // cap. ⛔ A per-book cap is the founding defect of this whole corpus effort —
  // it downloads a textbook and throws most of it away, and identical yields
  // across books of different sizes is its signature.
  for (const p of pages) {
    const html = await fetchText(p);
    if (!html) { dead++; await sleep(150); continue; }
    all.push(...cleanSentences(html));
    for (const f of harvestFigures(html, p)) {
      if (figSeen.has(f.src)) continue;   // the same plate repeats across chapters
      figSeen.add(f.src);
      figures.push(f);
    }
    await sleep(150);
  }
  // Dedupe across pages — running heads and repeated definitions are common, and
  // a duplicate sentence is not more of the book.
  const seen = new Set();
  return { sentences: all.filter((s) => !seen.has(s) && seen.add(s)), figures, pages: pages.length, dead };
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
  const merged = [...byTheme.values()];
  // ⛔ ATOMIC — these cell files are shared by every ingest, and two have already
  // been caught running at once over the same subjects. A rename cannot leave a
  // half-written file behind.
  const tmp = `${outPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({
    version: 1, grade, subject,
    source: 'hybrid: LibreTexts open textbooks + prior sources, cleaned + sentence-segmented',
    note: `Textbook corpus for ${subject}/${grade}. Trained via curriculum._trainAcademicStories. Every book here carries a licence read from its own page.`,
    experiences: merged,
  }, null, 2), 'utf8');
  fs.renameSync(tmp, outPath);
  return merged.length;
}

// ── run ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const LIST_ONLY = argv.includes('--list');
const only = argv.filter((a) => !a.startsWith('--'))[0];
// ⛔ ONLY THE LIBRARIES WHOSE SUBJECTS ARE ACTUALLY STARVED IN THIS BAND.
// `bio` and `phys` were scanned by the first version and neither can deliver
// anything: **`science` has no starved college cell**, so 33,679 + 19,582 pages
// were being read to produce zero books. Scanning a library for a subject that
// is already fed is the same waste as taking a book past the floor.
// ⭐ `math` ADDED 2026-09-04 for the same reason `bio` and `phys` were removed —
// the rule is unchanged, only the answer is. That rule is "scan a library only
// if it feeds a STARVED subject", and maths is now the most starved subject in
// the corpus by a wide margin (1,286,412 words owed across six cells, all of
// them holding zero books). `bio` and `phys` stay out: `science` still has one
// thin college cell owing 34,004 words, which two more textbooks would overshoot
// by an order of magnitude.
const LIBS = ['human', 'socialsci', 'eng', 'math'];

const books = new Map();   // root -> {root, area, subject, pages[]}
// ⛔⛔ THE CATALOGUE NUMBERS ARE NOT PRINTED, AND THAT IS A CORRECTION, NOT A
// STYLE CHOICE. This run takes AT MOST two books per grade — but the first
// version's output opened with `human: 75,004 pages … 465 books`, which reads
// exactly like a run about to download 465 books. The operator read it that way
// three times, and was right to: **an instrument that leads with a number the
// run will never act on is lying about what it is doing**, which is the defect
// class this project keeps paying for. What the run is BOUNDED by goes first and
// loudest; how big the shelf happens to be is not news.
console.log(`[libretexts] bound: ${BOOKS_PER_CELL} books per grade. Nothing beyond that is downloaded.`);
for (const lib of LIBS) {
  const pages = await libraryPages(lib);
  for (const u of pages) {
    if (!/\/Bookshelves\//.test(u)) continue;   // Courses/ are per-institution remixes
    const root = bookRootOf(u);
    if (!root) continue;
    const areaM = /\/Bookshelves\/([^/]+)/.exec(root);
    if (!areaM) continue;
    const subject = AREA_MAP[decodeURIComponent(areaM[1])];
    if (!subject) continue;
    if (!books.has(root)) books.set(root, { root, subject, pages: [] });
    books.get(root).pages.push(u);
  }
}
const bySubject = {};
for (const b of books.values()) (bySubject[b.subject] = bySubject[b.subject] || []).push(b);
// ⚠ The shelf size is available in `--list` mode, where reporting the whole
// catalogue is the POINT. In a real run it is noise that misreads as intent.

let admitted = 0, refusedND = 0, refusedUndeclared = 0, refusedNonCC = 0, refusedOther = 0;
// ⭐ Books refused only because their licence is not spelled "CC", while being at
// least as permissive as what IS admitted. Tracked separately because this is
// the one refusal category that is a wording artefact rather than a rights fact.
const permissiveRefused = [];
let grandWords = 0, grandFigures = 0;

for (const [subject, list] of Object.entries(bySubject)) {
  if (only && subject !== only) continue;
  // Biggest books first: a 710-page art history text is worth more to a starved
  // cell than forty stubs, and a run that is interrupted should have spent its
  // time on the books that matter.
  list.sort((a, b) => b.pages.length - a.pages.length);

  // ⭐ THE CELLS THIS SUBJECT ACTUALLY OWES, WITH THEIR CURRENT DEPTH READ OFF
  // DISK. A cell already at its floor is not visited at all, so a re-run costs
  // nothing for work already done.
  const home = collegeCellFor(subject);
  const need = gradesFor(home)
    .map((g) => ({ grade: g, ...cellState(home, g) }))
    .filter((c) => c.mine < BOOKS_PER_CELL);
  if (!need.length) {
    console.log(`[libretexts] ${home}: every cell already has its ${BOOKS_PER_CELL} books — no books taken`);
    continue;
  }
  const want = need.reduce((a, c) => a + (BOOKS_PER_CELL - c.mine), 0);
  console.log(`[libretexts] ${home}: taking ${want} book(s) — `
    + need.map((c) => `${c.grade} has ${c.mine}/${BOOKS_PER_CELL}`).join(' · '));

  let idx = 0;
  for (const b of list) {
    // ⛔ STOP AT TWO BOOKS A GRADE, not when the catalogue runs out.
    const owing = need.filter((c) => c.mine < BOOKS_PER_CELL);
    if (!owing.length) {
      console.log(`[libretexts] ${home}: every cell has its ${BOOKS_PER_CELL} books — ${list.length - idx} further books NOT downloaded`);
      break;
    }
    const rootHtml = await fetchText(b.root);
    const verdict = licenceVerdict(licenceOf(rootHtml));
    if (!verdict.ok) {
      if (/ND forbids/.test(verdict.why)) refusedND++;
      else if (/not declared|no attribution/.test(verdict.why)) refusedUndeclared++;
      else if (verdict.nonCC) {
        refusedNonCC++;
        if (verdict.permissive) permissiveRefused.push({ pages: b.pages.length, why: verdict.why, root: b.root });
      } else refusedOther++;
      if (LIST_ONLY) console.log(`  SKIP  ${b.subject.padEnd(10)} ${String(b.pages.length).padStart(4)}p  ${verdict.why}  ${b.root.split('/').pop().slice(0, 44)}`);
      continue;
    }
    admitted++;
    const slug = decodeURIComponent(b.root.split('/').pop()).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    if (LIST_ONLY) {
      console.log(`  TAKE  ${b.subject.padEnd(10)} ${String(b.pages.length).padStart(4)}p  [${verdict.licence}]  ${slug.slice(0, 50)}`);
      continue;
    }
    const got = await readBook(b.root, b.pages);
    if (got.sentences.length < 50) {
      console.log(`  ${slug.slice(0, 46)} — only ${got.sentences.length} usable sentences, skipped`);
      continue;
    }
    // ⭐ THE CELL WITH FEWEST BOOKS GETS THE NEXT ONE, thinnest first as the
    // tie-break — so every grade reaches its two before any grade gets a third,
    // and the biggest books land in the emptiest cells.
    const target = owing.sort((a, b) => (a.mine - b.mine) || (a.words - b.words))[0];
    const grade = target.grade;
    idx++;
    const entry = {
      theme: `book-${slug}`,
      story: got.sentences.join(' '),
      source: `libretexts/${slug}`,
      licence: verdict.licence,
    };
    // Figures ride the entry that owns their prose, so a percept binds to the
    // SAME theme the words trained under. Absent rather than empty when a book
    // has none — an empty array reads as "looked and found nothing".
    if (got.figures.length) entry.figures = got.figures;
    const n = writeCell(home, grade, entry);
    const w = entry.story.split(/\s+/).length;
    grandWords += w; grandFigures += got.figures.length;
    // ⚠ RE-READ FROM DISK RATHER THAN INCREMENTING. The cell merges by theme and
    // a re-run can REPLACE an entry instead of appending, so a counter that adds
    // its own optimism would drift above the truth and stop the run early — the
    // same shape as the figure progress counter that counted a directory.
    const st = cellState(home, grade);
    target.words = st.words; target.mine = st.mine;
    console.log(`  ${home}/${grade} <- ${slug.slice(0, 40)} — ${got.pages} pages, ${got.sentences.length} sentences, ${w.toLocaleString()} words, ${got.figures.length} figures `
      + `(book ${st.mine}/${BOOKS_PER_CELL}, cell ${st.words.toLocaleString()} words) [${verdict.licence}]`);
  }
}

// ⛔ THE REFUSALS ARE REPORTED, ALWAYS. A licence gate that silently drops books
// is indistinguishable from a host that has none — and the whole point of this
// gate is that "could not read a licence" and "has no licence" are different
// facts, both of which must stay visible.
console.log(`[libretexts] licence gate — ${admitted} admitted · ${refusedUndeclared} undeclared/unreadable · `
  + `${refusedND} ND · ${refusedNonCC} non-CC · ${refusedOther} unrecognised`);
if (permissiveRefused.length) {
  const pages = permissiveRefused.reduce((a, b) => a + b.pages, 0);
  console.log(`[libretexts] ⚠ ${permissiveRefused.length} of those refusals are PUBLIC DOMAIN or GNU FDL — ${pages.toLocaleString()} pages that are `
    + 'at least as permissive as what was admitted, refused only because the gate says "Creative Commons". Operator\'s call to widen:');
  for (const p of permissiveRefused.sort((a, b) => b.pages - a.pages).slice(0, 10)) {
    console.log(`      ${String(p.pages).padStart(4)}p  ${p.why}  ${decodeURIComponent(p.root.split('/').pop()).slice(0, 50)}`);
  }
}
if (!LIST_ONLY) {
  console.log(`[libretexts] DONE — ${grandWords.toLocaleString()} words and ${grandFigures.toLocaleString()} figures written under corpora/academic/.`);
  // ⛔ THE LADDER'S VERDICT IS REPORTED EVEN THOUGH IT IS NOT THE BOUND. Two
  // books a grade is the operator's rule and this run obeys it; whether two
  // books also clears the published 330,000-word floor is a separate question,
  // and a run that stayed silent about it would leave the coverage auditor to
  // report a shortfall nobody was warned about. **Reported, not acted on.**
  const short = [];
  for (const subject of new Set(Object.keys(bySubject).map(collegeCellFor))) {
    for (const g of GRADES) {
      const st = cellState(subject, g);
      if (st.mine > 0 && st.words < BAND_FLOOR) short.push(`${subject}/${g} ${Math.round(st.words / 1000)}k`);
    }
  }
  if (short.length) {
    console.log(`[libretexts] ⚠ ${short.length} cell(s) hold their ${BOOKS_PER_CELL} books and are still under the `
      + `${BAND_FLOOR.toLocaleString()}-word ladder floor: ${short.join(' · ')}`);
    console.log('[libretexts]   That is a fact about the ladder, not a reason to download more — the book count is the rule here.');
  }
}
