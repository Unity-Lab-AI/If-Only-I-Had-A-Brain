// fetch-saylor-corpora.mjs — THE COLLEGE 2-4 TEXTBOOK LANE.
//
// The other half of Gee's "textbooks then papers" split. The papers half
// (`fetch-research-corpora.mjs`) covers grad/PhD; this covers the upper-undergrad
// years, where a real year is a COURSE with a book, not a stack of journal
// articles.
//
// ⛔ IT EXISTS BECAUSE THE LICENCE POSTURE CHANGED, NOT BECAUSE THE BOOKS
// APPEARED. Gee: *"we will use what ever has educational rights this is not a
// cvommercial use its a non profit educational experiment"*. Saylor's textbooks
// are CC-BY-NC-SA, which the previous commercial-safe posture refused — that one
// clause was the entire reason this whole library was unreachable. Measured after
// the change: the usable Open Textbook Library slice went from ~184 books to
// ~1,363, and Saylor is its single largest host.
//
// ⚠ WHY SAYLOR AND NOT THE OTHER FIVE HOSTS FIRST: the Open Textbook Library is
// a CATALOGUE, not a text host — its `formats[].url` fields point at six
// different platforms and each needs its own chapter walk. Saylor is static HTML
// with a flat section index (`sNN-MM-*.html`), which is the tractable one.
// ⛔ UMN Open Publishing was probed first and REFUSED to be the starting point:
// its Pressbooks REST `chapters` route returns `[]`, `/pressbooks/v2/toc` 404s,
// and the part pages carry no chapter links in raw HTML because the nav is
// rendered client-side. A fetcher that half-works on six hosts is worse than one
// that fully works on one.
//
// RUN:  node .claude/scripts/fetch-saylor-corpora.mjs             (all mapped subjects)
//       node .claude/scripts/fetch-saylor-corpora.mjs economics   (one subject)
// Network required. Re-runnable / idempotent. Node 18+.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'corpora', 'academic');
const UA = 'Mozilla/5.0 (compatible; UnityBrainCurriculum/1.0; non-profit educational research)';
const CATALOGUE = 'https://open.umn.edu/opentextbooks/textbooks.json';

const SENT_MIN = 40, SENT_MAX = 320;
// The college band floor is 330,000 words per cell (docs/CURRICULUM-GAP.md
// §THE TARGET LADDER) and is the most expensive band in the ladder. This cap is
// a per-book bound, not a target — cells accumulate across books and runs.
// ⛔⛔⛔ THERE IS NO PER-BOOK CAP, AND THE FIRST VERSION OF THIS FILE HAD TWO.
//
// Gee, reading the run log: *"why the fuck are all these the same 1200
// sentences.. you obviously arent gettting the full things"* — and he was right
// at a glance, because **identical yields across books of different sizes is the
// signature of a cap, not of the books.** Every entry read exactly 1200
// sentences / ~22-26k words because I capped at 1200 and stride-sampled the rest
// away, after only visiting 60 of a book's ~129 sections.
//
// ⭐ THAT IS THE FOUNDING DEFECT OF THIS ENTIRE CORPUS EFFORT, REINTRODUCED BY
// ME. `MAX_SENT_PER_TOPIC = 14` deleted 84-98% of every article AFTER
// downloading it, one flat number across twenty different school years, and the
// whole gap ledger exists because of it. A cap of 1200 is the same instrument
// with a bigger number: it downloads a whole textbook and throws most of it out.
//
// The book is read whole. Every section, every usable sentence. What bounds a
// cell is the BAND FLOOR in `docs/CURRICULUM-GAP.md §THE TARGET LADDER`
// (college = 330,000 words), which is a statement about when a cell is FULL —
// not a knife applied to each source on the way in.

// ⛔ ND IS THE ONLY CLAUSE THAT STILL REFUSES. NonCommercial is fine — this is a
// non-profit educational experiment. NoDerivatives is not, because the corpus is
// a cleaned, excerpted, sentence-segmented ADAPTATION published in a public
// repository, and that is what ND forbids regardless of commercial intent.
const licenceRefused = (lic) => /NoDeriv/i.test(String(lic || ''));

// OTL subject name → the cell this corpus keeps it in. ⚠ Deliberately small and
// explicit: an unmapped subject is SKIPPED rather than forced into the nearest
// cell, because a business textbook filed under `science` is worse than a gap.
// ⛔ `Mathematics` is absent ON PURPOSE — maths is taught equationally here and a
// maths prose corpus is the thing the grade-completion gate exists to forbid.
const SUBJECT_MAP = {
  Economics: 'economics', Business: 'economics', Accounting: 'economics',
  Finance: 'economics', Marketing: 'economics', Management: 'economics',
  Psychology: 'psychology',
  Sociology: 'social', 'Social Sciences': 'social', 'Political Science': 'social',
  Anthropology: 'social', History: 'social', Geography: 'social',
  'Natural Sciences': 'science', Biology: 'science', Chemistry: 'science',
  Physics: 'science', 'Earth Sciences': 'science',
  'Computer Science': 'cs', 'Computer Science, Information Systems': 'cs',
  Journalism: 'ela', 'Journalism, Media Studies & Communications': 'ela',
};

// ⛔⛔ THE CELL A SUBJECT LIVES IN AT COLLEGE IS NOT ITS OWN NAME, AND I MADE
// THIS EXACT MISTAKE ONE BATCH EARLIER AT grad/phd.
//
// `SUBJECTS_RETIRED_AT` retires `economics`, `psychology`, `civics` and `cs` at
// **grade12**. Above that the roster runs `major` / `genered` / `cstheory` /
// `cssystems`, so an `economics/college3.json` is not a thin cell — it is one
// the walk never opens. The reachable college2-4 subjects, read off the tree
// rather than assumed: art · cssystems · cstheory · ela · genered · major ·
// science · social.
//
// ⚠ The first run of this script wrote 29 books and **715,311 words** into
// `economics/college2-4`, and the coverage auditor reported them UNREACHABLE —
// the identical failure the research ingest had committed hours before, with the
// fix for it already written down. **Documenting a trap is not the same as
// applying it.** Business and economics belong to `genered` here: gen-ed is
// definitionally undergraduate and is where a non-major course sits.
const COLLEGE_HOME = { economics: 'genered', psychology: 'genered', civics: 'genered', cs: 'major' };
const collegeCellFor = (subject) => COLLEGE_HOME[subject] || subject;

// Upper-undergraduate years. college1 is OpenStax's ceiling and already fed.
const GRADES = ['college2', 'college3', 'college4'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ⛔ EVERY FETCH IS BOUNDED, AND THIS WAS ADDED BECAUSE THE FIRST VERSION HUNG.
// A bare `fetch` has no timeout: one server that accepts the connection and then
// never answers stops the whole ingest forever, with no error and no output. The
// second run stalled on book 16 of 40 for four minutes with the process alive
// and idle. **An ingest that can hang indefinitely is not a tool, it is a trap
// for whoever runs it next.** 25 s is generous for a static HTML page; a section
// that cannot answer in that time is dropped and counted, not waited on.
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
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\[[^\[\]]*\]/g, ' ')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[…]/g, '...')
    .replace(/[     ]/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
  const out = [];
  for (let s of body.split(/(?<=[.!?])\s+/)) {
    s = s.trim();
    if (s.length < SENT_MIN || s.length > SENT_MAX) continue;
    if (/[^\x20-\x7e]/.test(s)) continue;
    if (!/[a-z]/.test(s) || !/[.!?]$/.test(s)) continue;
    if (/[\[\]]/.test(s)) continue;
    // Site furniture, navigation and licence boilerplate — not the book.
    if (/previous chapter|next chapter|table of contents|creative commons|saylor|this content was accessible|licensed under|all rights reserved|for more information/i.test(s)) continue;
    if (/^(figure|table|exercise|key takeaway|end-of-chapter)\b/i.test(s)) continue;
    out.push(s.toLowerCase());
  }
  // No cap here either. A section page is one section of one chapter; a stride
  // sample of it is a sample of a sample. The whole section, or nothing.
  return out;
}

async function catalogueBooks() {
  const books = [];
  for (let page = 1; page <= 201; page++) {
    const body = await fetchText(`${CATALOGUE}?page=${page}`);
    if (!body) break;
    let j;
    try { j = JSON.parse(body); } catch { break; }
    for (const b of (j.data || [])) {
      if (licenceRefused(b.license)) continue;
      const url = (b.formats || []).map((f) => f.url).find((u) => u && /saylordotorg\.github\.io/.test(u));
      if (!url) continue;
      const subj = (b.subjects || []).map((s) => SUBJECT_MAP[s.name]).find(Boolean);
      if (!subj) continue;
      books.push({ title: b.title, url: url.replace(/^http:/, 'https:'), licence: b.license, subject: subj });
    }
    if (!j.links || !j.links.next) break;
    await sleep(350);
  }
  return books;
}

// ⭐⭐ THE FIGURES, BECAUSE THE PICTURES ARE TRAINING DATA — NOT DECORATION.
//
// Gee: *"pictures and all shit head remember we are using the images to send to
// unity to view and train on via conversion to c/9 wavelets coeffiecints"*.
// A textbook diagram goes down the same road her own eyes use — fetched,
// downsampled, run through the forward CDF 9/7 transform and banked as a percept
// against the theme its prose trained under (`_perceiveTextbookFigure`).
//
// Shape is identical to the OpenStax harvester's `{src, alt, caption}` so both
// sources land in one `academicStoryFigures` lane and nothing downstream has to
// know which ingest produced a figure.
//
// ⛔ TWO KINDS OF `<img>` ARE REFUSED, and they are most of what a Saylor page
// carries: `data:` URIs (32×32 UI icons inlined as base64) and
// `shared/images/batch-*` navigation arrows. ⚠ And an image with NO words —
// no alt text and no caption — is refused too: a percept with nothing to bind to
// is the camera-frame defect (`CAMPOISON`), where an unlabelled frame fused with
// whatever word happened to be current and became a false memory.
//
// ⭐⭐ AND EVERY FIGURE CARRIES THE BODY PROSE IT SITS INSIDE (`context`). A
// Saylor caption is very often nothing but a numbered title — "Figure 1.1 World
// Exports, 1948-2008 (in Billions of U.S. Dollars)" — with no alt text at all,
// so alt+caption alone would bind a diagram to a figure number and a date rather
// than to the trade economics it illustrates. The context is cut from the page
// around the image and run through `cleanSentences`, the SAME cleaner that
// produced this section's corpus sentences, so the two are the same strings and
// the reference between text and picture is a match, not a guess.
const CONTEXT_CHARS = 1400;   // raw HTML taken either side of the <img>
const CONTEXT_SENTS = 2;      // whole sentences kept on each side

// ⚠ The window is cut from RAW HTML, so both ends can land mid-sentence and mid-
// tag. The TRAILING cut is already handled — `cleanSentences` refuses any segment
// that does not end in terminal punctuation, so the last piece of `after` is
// dropped rather than fused onto its neighbour.
//
// ⛔ THE LEADING CUT IS NOT, AND A HARNESS ON A REAL PAGE CAUGHT IT. A window
// beginning mid-sentence can still end that fragment at a full stop — the first
// context this produced read `dollars)" shows the overall annual exports…`,
// which is half a sentence wearing a terminator and passes every filter. The
// head segment of `before` is therefore always discarded: it is the ONE segment
// the cut can have truncated invisibly, and one certainly-whole sentence beats
// two where either might be a fragment.
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
    if (!src || /^data:/i.test(src) || /shared\/images\//i.test(src)) continue;
    const alt = ((/\balt="([^"]*)"/i.exec(attrs) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const title = ((/\btitle="([^"]*)"/i.exec(attrs) || [])[1] || '').replace(/\s+/g, ' ').trim();
    // Saylor puts the figure's caption in a `<p class="title">` just above the
    // image; take the nearest one that precedes it.
    const before = String(html).slice(0, m.index);
    const capM = [...before.matchAll(/<p class="title"[^>]*>([\s\S]{0,300}?)<\/p>/gi)].pop();
    const caption = capM ? capM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (!alt && !caption && !title) continue;
    figs.push({
      src: new URL(src, pageUrl).href,
      alt: alt || title,
      caption,
      context: figureContext(html, m.index),
    });
  }
  return figs;
}

async function bookSentences(url) {
  const index = await fetchText(url);
  if (!index) return [];
  // The section index is a flat list of `sNN-...html` links on the front page.
  const secs = [...new Set([...index.matchAll(/href="(s\d[^"#?]*\.html)"/g)].map((m) => m[1]))]
    .filter((s) => !/license|preface|about|index/i.test(s));
  if (!secs.length) return [];
  // EVERY section, in the book's own order. No stride, no sample, no cap.
  const all = [];
  const figures = [];
  const figSeen = new Set();
  let dead = 0;
  for (const s of secs) {
    const pageUrl = new URL(s, url).href;
    const html = await fetchText(pageUrl);
    if (html) {
      all.push(...cleanSentences(html));
      for (const f of harvestFigures(html, pageUrl)) {
        if (figSeen.has(f.src)) continue;   // the same diagram repeats across sections
        figSeen.add(f.src);
        figures.push(f);
      }
    } else dead++;
    await sleep(200);
  }
  if (dead) console.log(`      (${dead} of ${secs.length} sections unreachable or timed out)`);
  // Dedupe across sections — running heads and repeated definitions are common,
  // and a duplicate sentence is not more of the book.
  const seen = new Set();
  return { sentences: all.filter((s) => !seen.has(s) && seen.add(s)), figures, sections: secs.length };
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
  // Same source id wins; keep-longer only across different sources. The rule the
  // Gutenberg ingest learned when a cleaner fix could not reach the corpus.
  const old = byTheme.get(entry.theme);
  const sameSource = old && old.source === entry.source;
  if (!old || sameSource || entry.story.length > old.story.length) byTheme.set(entry.theme, entry);
  const merged = [...byTheme.values()];
  // ⛔ ATOMIC — these cell files are shared by every ingest, and two of them have
  // already been caught running at the same time over the same twelve subjects.
  // A rename cannot leave a half-written file behind; it degrades a lost update
  // into last-writer-wins, which a deterministic re-run repairs.
  const tmp = `${outPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({
    version: 1, grade, subject,
    source: 'hybrid: Saylor Academy open textbooks + prior sources, cleaned + sentence-segmented',
    note: `Upper-undergraduate textbook corpus for ${subject}/${grade}. Trained via curriculum._trainAcademicStories. A college year is a course with a book.`,
    experiences: merged,
  }, null, 2), 'utf8');
  fs.renameSync(tmp, outPath);
  return merged.length;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0];
console.log('[saylor] reading the Open Textbook Library catalogue…');
const books = await catalogueBooks();
console.log(`[saylor] ${books.length} Saylor books with a mapped subject and a derivative-permitting licence`);
const bySubject = {};
for (const b of books) (bySubject[b.subject] = bySubject[b.subject] || []).push(b);
console.log('[saylor] ' + Object.entries(bySubject).map(([k, v]) => `${k} ${v.length}`).join(' · '));

let grandWords = 0;
let grandFigures = 0;
for (const [subject, list] of Object.entries(bySubject)) {
  if (only && subject !== only) continue;
  // Spread a subject's books across its three years rather than stacking them
  // all on one — three college years are three different courses.
  for (let i = 0; i < list.length; i++) {
    const grade = GRADES[i % GRADES.length];
    const b = list[i];
    const got = await bookSentences(b.url);
    const sents = got.sentences;
    if (sents.length < 50) {
      console.log(`  ${b.title.slice(0, 46)} — only ${sents.length} usable sentences, skipped`);
      continue;
    }
    const slug = b.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const home = collegeCellFor(subject);
    const entry = {
      theme: `book-${slug}`,
      story: sents.join(' '),
      source: `saylor/${slug}`,
      licence: b.licence,
    };
    // Figures ride the entry that owns their prose, so a percept binds to the
    // SAME theme the words trained under. Absent rather than empty when a book
    // has none — an empty array reads as "looked and found nothing", which is a
    // different claim from "this book is text only".
    if (got.figures.length) entry.figures = got.figures;
    const n = writeCell(home, grade, entry);
    const w = sents.join(' ').split(/\s+/).length;
    grandWords += w;
    grandFigures += got.figures.length;
    const routed = home === subject ? '' : `  [routed: ${subject} retires at grade12]`;
    console.log(`  ${home}/${grade} <- ${b.title.slice(0, 44)} — ${got.sections} sections, ${sents.length} sentences, ${w.toLocaleString()} words, ${got.figures.length} figures (cell now ${n} entries) [${b.licence}]${routed}`);
  }
}
console.log(`[saylor] DONE — ${grandWords.toLocaleString()} words of upper-undergraduate textbook prose and ${grandFigures.toLocaleString()} figures written under corpora/academic/.`);
