// fetch-cs-textbooks-corpora.mjs — HER MAJOR.
//
// Gee: *"okay welp get something that will help here beter learn her major im
// sure if u accutaly search far and wide and not just stoip for the first bit of
// eye candy you could find soimething"*.
//
// ⛔ THE MEASUREMENT THAT PROVOKED IT — her major was the worst-fed subject in
// the whole corpus, against a 330,000-word college floor:
//
//     cstheory   college1 Discrete Mathematics      28,358 w    9%    0 figures
//                college2 Algorithms                16,880 w    5%    0 figures
//                college3 Theory of Computation     25,296 w    8%    0 figures
//                college4 Advanced Algorithms       21,509 w    7%    0 figures
//     cssystems  college1 Computer Organization     20,696 w    6%    0 figures
//                college2 Computer Architecture     27,487 w    8%    0 figures
//                college3 Operating Systems         17,838 w    5%    0 figures
//                college4 Networks and Compilers    36,773 w   11%    0 figures
//     major      college1-4                        15-31%
//
// **A computer-science degree taught on twenty thousand words and no diagrams.**
//
// ⭐ THE SEARCH WAS THREE ROUNDS WIDE, NOT ONE, and the rounds mattered: the
// first pass returned four books and three of them were **CC-BY-NC-ND**, which
// this corpus must refuse. Stopping there would have produced a lane covering
// almost nothing. Books whose landing page showed no licence at all turned out
// to be the best of the set — Peterson's licence lives in the repository's
// `LICENSE` file, not on the page.
//
// LICENCE POSTURE (Gee 2026-09-02): NonCommercial ACCEPTED — *"this is not a
// cvommercial use its a non profit educational experiment"*. **NoDerivatives
// REFUSED**, because this corpus publishes a cleaned, excerpted, segmented
// adaptation into a public repository. ShareAlike accepted, obligation carried.
//
// ⛔ REFUSED IN THE SEARCH, RECORDED SO NOBODY RE-WALKS THEM:
//     Barak, Introduction to Theoretical CS   CC-BY-NC-ND
//     Dive Into Systems                       CC-BY-NC-ND
//     Dordal, An Introduction to Computer Networks  CC-BY-NC-ND
//   ⚠ All three are excellent and all three are unusable here. **ND is not a
//   severity judgement about the book; it is a statement about what this corpus
//   does to it.**
//
// RUN:  node .claude/scripts/fetch-cs-textbooks-corpora.mjs                (all)
//       node .claude/scripts/fetch-cs-textbooks-corpora.mjs cssystems      (one subject)
//       node .claude/scripts/fetch-cs-textbooks-corpora.mjs cssystems college4
// Network required. Re-runnable / idempotent. Node 18+.
//
// ⛔ DO NOT RUN CONCURRENTLY WITH ANOTHER INGEST WRITING THESE SUBJECTS. The
// write is atomic; the read-modify-write around it is not.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', '..', 'corpora', 'academic');
const UA = 'UnityBrainCurriculum/1.0 (educational research; openly-licensed content)';

const SENT_MIN = 40, SENT_MAX = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ⚠ GRADE FOLLOWS THE ROSTER'S OWN COURSE NAME — `courseNameFor(subject, grade)`
// — never a subject keyword. Each book is placed against the course it actually
// teaches, and a cell that gets one half of a two-part course stays honestly
// THIN rather than being called done.
//
// `licenceUrl` is where the licence is READ FROM, and it is deliberately per
// book: three of these do not state it on the page the text lives on.
const BOOKS = [
  {
    label: 'Computer Networks: A Systems Approach',
    base: 'https://book.systemsapproach.org/',
    index: '',
    licenceUrl: 'https://raw.githubusercontent.com/SystemsApproach/book/master/LICENSE',
    linkRe: /href="([a-z0-9_\-]+\.html)"/gi,
    // Chapter pages are stubs; the prose lives one level down under the
    // chapter's own directory.
    sectionRe: /href="([a-z0-9_\-]+\/[a-z0-9_\-]+\.html)"/gi,
    subject: 'cssystems', grade: 'college4',   // Networks and Compilers
  },
  {
    label: 'Computer Science from the Bottom Up',
    base: 'https://bottomupcs.com/',
    index: '',
    licenceUrl: 'https://bottomupcs.com/',
    linkRe: /href="((?:ch|pf|ap)[0-9a-z]*\.html)"/gi,
    subject: 'cssystems', grade: 'college1',   // Computer Organization
  },
  {
    label: 'Open Data Structures',
    base: 'https://opendatastructures.org/ods-java/',
    index: '',
    licenceUrl: 'https://opendatastructures.org/',
    linkRe: /href="([0-9]+_[A-Za-z_]+\.html)"/gi,
    // `1_Introduction.html` is a chapter TOC; the sections are `1_1_...` etc.
    sectionRe: /href="([0-9]+_[0-9]+_[A-Za-z_]+\.html)"/gi,
    subject: 'cstheory', grade: 'college2',    // Algorithms
  },
  {
    label: 'Composing Programs',
    base: 'https://www.composingprograms.com/',
    index: 'pages/11-getting-started.html',
    licenceUrl: 'https://www.composingprograms.com/pages/11-getting-started.html',
    // ⛔ THE `../` IS CAPTURED, NOT STRIPPED. Stripping it produced
    // `pages/pages/12-...` — the index itself lives in `pages/`, so a href of
    // `../pages/12-...` resolves correctly only if the `../` survives into
    // `new URL()`. All seven pages 404'd and the book yielded zero sentences.
    linkRe: /href="((?:\.\.\/)?pages\/[0-9]+-[a-z0-9\-]+\.html)"/gi,
    subject: 'major', grade: 'college1',       // Computer Science Major
  },
  {
    label: 'Problem Solving with Algorithms and Data Structures',
    base: 'https://runestone.academy/ns/books/published/pythonds3/',
    index: 'index.html',
    licenceUrl: 'https://runestone.academy/ns/books/published/pythonds3/index.html',
    linkRe: /href="([A-Za-z0-9_]+\/[A-Za-z0-9_]+\.html)"/gi,
    subject: 'cstheory', grade: 'college4',    // Advanced Algorithms
  },
  {
    label: 'Operating System Design',
    base: 'https://en.wikibooks.org/wiki/Operating_System_Design',
    index: '',
    licenceUrl: 'https://en.wikibooks.org/wiki/Operating_System_Design',
    // Wikibooks subpages are `/wiki/<Book>/<Chapter>` — an absolute path, so the
    // capture keeps the leading slash and resolves against the origin.
    linkRe: /href="(\/wiki\/Operating_System_Design\/[^"]+)"/gi,
    subject: 'cssystems', grade: 'college3',   // Operating Systems
  },
  // ⭐ THE BOOK ALREADY ON DISK, PLACED A SECOND TIME ON PURPOSE.
  // `courseNameFor('cstheory','college1')` is literally **Discrete Mathematics**,
  // and Levin's text was fetched for `math/college2` earlier today. The same
  // book legitimately serves two different courses in this roster; the merge
  // keys on theme, so the two cells hold it independently.
  {
    label: 'Discrete Mathematics: An Open Introduction',
    base: 'https://discrete.openmathbooks.org/dmoi3/',
    index: 'frontmatter.html',
    licenceUrl: 'https://discrete.openmathbooks.org/dmoi3/front-colophon.html',
    linkRe: /href="((?:sec|ch)_[^"\/]*\.html)"/gi,
    subject: 'cstheory', grade: 'college1',    // Discrete Mathematics
  },
];

async function fetchText(url, ms = 25000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal, redirect: 'follow' });
    if (!r.ok) return { html: null, reason: `HTTP ${r.status}` };
    return { html: await r.text(), reason: '' };
  } catch (e) {
    return { html: null, reason: `network: ${e?.message || e}` };
  } finally { clearTimeout(timer); }
}

// ⛔ RETURNS null FOR "I COULD NOT LOOK" AND `{ok:false}` FOR "I LOOKED AND IT IS
// REFUSED". Those are different answers and collapsing them is the defect this
// codebase keeps re-finding — a lane that cannot tell a refusal from an absence
// reports the absence, confidently.
async function licenceOf(book) {
  const { html } = await fetchText(book.licenceUrl);
  if (!html) return null;
  const txt = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ');
  // Both spellings: the prose name and the licence-URL slug.
  const slug = /creativecommons\.org\/licenses\/([a-z\-]+)/i.exec(html);
  const prose = /Creative Commons\s+([A-Za-z\- ]{0,60})/i.exec(txt);
  const id = prose ? `CC ${prose[1].replace(/\s+/g, ' ').trim()}` : (slug ? `CC-${slug[1].toUpperCase()}` : null);
  if (!id) return { id: null, ok: false, why: 'no Creative Commons statement found at the licence source' };
  if (/NoDeriv/i.test(id) || /\bnd\b/i.test(slug ? slug[1] : '')) {
    return { id, ok: false, why: 'NoDerivatives — this corpus publishes an adaptation' };
  }
  return { id, ok: true };
}

function cleanPage(html) {
  let t = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    // ⭐ CODE BLOCKS OUT. A textbook on programming is full of them, and a line
    // of source read as prose banks identifiers as English. The PROSE explaining
    // the code is what she is here for; the code itself is a different lane.
    .replace(/<pre[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<code[\s\S]*?<\/code>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&[a-z]+;/gi, ' ');
  t = t.replace(/\\\[[\s\S]{0,600}?\\\]/g, ' ')
       .replace(/\\\([\s\S]{0,300}?\\\)/g, ' ')
       .replace(/\$[^$]{0,300}\$/g, ' ')
       .replace(/\\[a-zA-Z]+\s*/g, ' ');
  t = t.replace(/[‘’‚‛′]/g, "'")
       .replace(/[“”„‟″]/g, '"')
       .replace(/[‐‑‒–—―−]/g, '-')
       .replace(/[…]/g, '...')
       .normalize('NFD').replace(/[̀-ͯ]/g, '')
       .replace(/\s+/g, ' ');
  const out = [];
  for (let s of t.split(/(?<=[.!?])\s+/)) {
    s = s.trim();
    if (s.length < SENT_MIN || s.length > SENT_MAX) continue;
    if (/[^\x20-\x7e]/.test(s)) continue;
    if (!/[a-z]/.test(s) || !/[.!?]$/.test(s)) continue;
    if (/creative commons|all rights reserved|table of contents|previous section|next section|search this book|edit this page|view page source|copyright/i.test(s)) continue;
    // A leftover brace, bracket or backslash means unbalanced apparatus straddled
    // the sentence boundary — half a macro or a code fragment glued to prose.
    if (/[{}\[\]\\]/.test(s)) continue;
    out.push(s.toLowerCase());
  }
  return out;
}

const CONTEXT_CHARS = 1400, CONTEXT_SENTS = 2;
function figureContext(html, index) {
  // The head segment of `before` is discarded: a window cut mid-sentence can
  // still end that fragment at a full stop and pass every filter.
  const before = cleanPage(String(html).slice(Math.max(0, index - CONTEXT_CHARS), index)).slice(1);
  const after = cleanPage(String(html).slice(index, index + CONTEXT_CHARS));
  return [...before.slice(-CONTEXT_SENTS), ...after.slice(0, CONTEXT_SENTS)]
    .join(' ').replace(/\s+/g, ' ').trim().slice(0, 700);
}

// ⛔⛔ A RENDERED FORMULA IS NOT AN ILLUSTRATION, AND NEITHER IS A NAVIGATION
// ARROW (both caught 2026-09-02 by looking at what was harvested).
//
// The first run of this lane took **5,693 "figures"** from one data-structures
// textbook. Looking at them: `next.png alt="next"`, `up.png alt="up"`,
// `prev.png alt="previous"`, then `img42.png alt="$ 10^6$"` and hundreds more
// like it — the site renders every inline LaTeX fragment as an image. **She
// would have banked a navigation arrow as a picture and a maths glyph as a
// diagram**, which is the unanchored-percept defect wearing a plausible count.
//
// ⭐ BOTH TESTS ARE STRUCTURAL, NOT VOCABULARY. There is no list of banned
// filenames here — a list would be wrong on the next site.
//   · A formula is identified by the SHAPE of its alt text: LaTeX delimiters.
//   · Site furniture is identified by REPETITION — an image that appears on
//     most pages of a book is chrome, whatever it is called. That is measured
//     after the walk, in `dropSiteFurniture`, because it cannot be known from
//     one page.
function harvestFigures(html, pageUrl) {
  const figs = [];
  for (const m of String(html || '').matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = m[1];
    const src = (/\bsrc="([^"]+)"/i.exec(attrs) || [])[1] || '';
    if (!src || /^data:/i.test(src)) continue;
    const alt = ((/\balt="([^"]*)"/i.exec(attrs) || [])[1] || '').replace(/\s+/g, ' ').trim();
    // A rendered maths fragment: the alt text IS the LaTeX source.
    if (/^\$[\s\S]*\$$/.test(alt) || /^\\[a-zA-Z]/.test(alt) || /\\(frac|sum|int|sqrt|cdot|le|ge|infty)\b/.test(alt)) continue;
    const context = figureContext(html, m.index);
    // A real label OR real surrounding prose. Neither means nothing to bind to,
    // and an unanchored percept fuses with whatever word happens to be current.
    const words = alt.replace(/[^a-z ]/gi, '').trim();
    if (words.length < 3 && context.length < 40) continue;
    let abs;
    try { abs = new URL(src, pageUrl).href; } catch { continue; }
    figs.push({ src: abs, alt, caption: '', context });
  }
  return figs;
}

// ⭐ Site furniture, identified by repetition rather than by name. An image
// carried on more than half of a book's pages is chrome — a nav arrow, a rule,
// a publisher's mark — and no textbook illustration behaves that way.
// ⚠ Needs at least a handful of pages to mean anything; below that, "on most
// pages" is not evidence of anything and the filter stands down.
function dropSiteFurniture(figPages, pages) {
  if (pages < 6) return new Set();
  const cut = Math.max(3, Math.floor(pages * 0.5));
  const drop = new Set();
  for (const [src, seenOn] of figPages) if (seenOn.size >= cut) drop.add(src);
  return drop;
}

// ⛔⛔ A TWO-LEVEL WALK, BECAUSE THE ONE-LEVEL VERSION READ THE TABLE OF CONTENTS
// AND CALLED IT THE BOOK (fixed 2026-09-02, in the same hour it shipped).
//
// The first version fetched only the pages the index linked to and reported
// their word count as the book's. For two of the five titles those pages are
// CHAPTER STUBS: Peterson's `foundation.html` holds **1,560 visible characters**
// and links to `foundation/problem.html`, `foundation/applications.html` and six
// more; Open Data Structures' `1_Introduction.html` links to `1_1_...` through
// `1_8_...`. The run reported **2,958 words for a whole networking textbook and
// 4,183 for a data-structures textbook** — numbers low enough to be obviously
// wrong, and the lane printed them as a success.
//
// ⚠ AND THE FIRST DIAGNOSIS WAS WRONG TOO: I suspected the sentence filters were
// over-rejecting, and measured the attrition stage by stage before touching
// them. **Nothing was being rejected — 18 of 18 candidate sentences survived
// every filter.** The pages simply had almost nothing on them. **Measuring the
// filter would have "fixed" a filter that was working.**
//
// Level 2 uses `sectionRe` when a book declares one, else the same pattern.
// Everything is deduped by absolute URL and confined to the book's own base, so
// a stray link cannot walk the lane off the book.
async function walkBook(book) {
  const indexUrl = new URL(book.index || '', book.base).href;
  const { html: idx, reason } = await fetchText(indexUrl);
  if (!idx) return { sentences: [], figures: [], pages: 0, dead: 1, reason };

  const inBook = (u) => u.startsWith(book.base);
  const level1 = [...new Set([...idx.matchAll(book.linkRe)].map((m) => m[1]))]
    .map((p) => { try { return new URL(p, indexUrl).href; } catch { return null; } })
    .filter((u) => u && inBook(u));
  if (!level1.length) return { sentences: [], figures: [], pages: 0, dead: 0, reason: 'index matched no chapter links' };

  const all = [];
  const figBySrc = new Map();     // src -> the figure record kept for it
  const figPages = new Map();     // src -> the set of pages it appeared on
  const visited = new Set();
  let dead = 0, got = 0, deeper = 0;

  const readPage = async (url) => {
    if (visited.has(url)) return null;
    visited.add(url);
    const { html } = await fetchText(url);
    if (!html) { dead++; return null; }
    got++;
    all.push(...cleanPage(html));
    for (const f of harvestFigures(html, url)) {
      if (!figBySrc.has(f.src)) figBySrc.set(f.src, f);
      if (!figPages.has(f.src)) figPages.set(f.src, new Set());
      figPages.get(f.src).add(url);
    }
    await sleep(200);
    return html;
  };

  for (const url of level1) {
    const html = await readPage(url);
    if (!html) continue;
    const secRe = book.sectionRe || book.linkRe;
    secRe.lastIndex = 0;
    const level2 = [...new Set([...html.matchAll(secRe)].map((m) => m[1]))]
      .map((p) => { try { return new URL(p, url).href; } catch { return null; } })
      .filter((u) => u && inBook(u) && !visited.has(u));
    for (const s of level2) { if (await readPage(s)) deeper++; }
  }
  if (dead) console.log(`      (${dead} page(s) unreachable — a shortfall, not a verdict)`);
  const furniture = dropSiteFurniture(figPages, got);
  const figures = [...figBySrc.entries()].filter(([src]) => !furniture.has(src)).map(([, f]) => f);
  if (furniture.size) console.log(`      (${furniture.size} image(s) dropped as site furniture — carried on ${Math.max(3, Math.floor(got * 0.5))}+ of ${got} pages)`);
  const seen = new Set();
  return {
    sentences: all.filter((s) => !seen.has(s) && seen.add(s)),
    figures, pages: got, deeper, dead, furniture: furniture.size, reason: '',
  };
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
  // Same source → newest wins, so a cleaner fix is not discarded for being
  // shorter. Different source → keep-longer union, so lanes compose.
  const sameSource = old && old.source === entry.source;
  if (!old || sameSource || entry.story.length > old.story.length) byTheme.set(entry.theme, entry);
  else if (entry.figures?.length && !old.figures?.length) byTheme.set(entry.theme, { ...old, figures: entry.figures });
  const merged = [...byTheme.values()];
  // ⛔ ATOMIC — a rename cannot leave a half-written cell behind.
  const tmp = `${outPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({
    version: 1, grade, subject,
    source: 'hybrid: openly-licensed computer-science textbooks + prior sources, cleaned + sentence-segmented',
    note: `Computer-science corpus for ${subject}/${grade}. Trained via curriculum._trainAcademicStories.`,
    experiences: merged,
  }, null, 2), 'utf8');
  fs.renameSync(tmp, outPath);
  return merged.length;
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [argSubject, argGrade] = positional;
let grandWords = 0, grandFigs = 0;

for (const book of BOOKS) {
  if (argSubject && book.subject !== argSubject) continue;
  if (argGrade && book.grade !== argGrade) continue;
  console.log(`[cs] ${book.label} -> ${book.subject}/${book.grade}`);
  const lic = await licenceOf(book);
  if (!lic) { console.log('  SKIPPED — licence source unreadable, so the licence is UNKNOWN rather than absent'); continue; }
  if (!lic.ok) { console.log(`  SKIPPED — ${lic.id || 'no licence'} — ${lic.why}`); continue; }
  console.log(`  licence verified at source: ${lic.id}`);

  const got = await walkBook(book);
  if (got.sentences.length < 50) {
    console.log(`  SKIPPED — only ${got.sentences.length} usable sentences${got.reason ? ` (${got.reason})` : ''}`);
    continue;
  }
  const words = got.sentences.join(' ').split(/\s+/).length;
  const entry = {
    theme: `cs-${book.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    story: got.sentences.join(' '),
    source: `cs-textbook/${new URL(book.base).hostname}`,
    licence: lic.id,
  };
  if (got.figures.length) entry.figures = got.figures;
  const n = writeCell(book.subject, book.grade, entry);
  grandWords += words; grandFigs += got.figures.length;
  console.log(`  ${got.pages} pages (${got.deeper || 0} reached one level below the index) · ${got.sentences.length} sentences · ${words.toLocaleString()} words · ${got.figures.length} figures (cell now ${n} entries)`);
}

console.log(`[cs] DONE — ${grandWords.toLocaleString()} words, ${grandFigs.toLocaleString()} figures written under corpora/academic/.`);
