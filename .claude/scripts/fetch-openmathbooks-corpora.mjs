// fetch-openmathbooks-corpora.mjs — THE DEGREE-LEVEL MATHS LANE.
//
// Written 2026-09-02 against a measured gap: after the K-5 and secondary maths
// lanes landed, **every remaining empty cell in the whole corpus was maths**, and
// all of them were college or postgraduate — `college2` (Linear Algebra and
// Discrete Math), `college4` (Numerical Methods), `grad`/`phd` (Research Math).
// The OpenStax mirrors stop at AP Calculus and Illustrative Mathematics stops at
// Algebra II, so nothing mapped reached above first-year undergraduate.
//
// SOURCE: PreTeXt-built open mathematics textbooks. PreTeXt renders a book as
// static HTML with one page per section and a predictable `sec_*` / `ch_*` name,
// which is the same walkable shape the other HTML lanes already handle.
//
// ⛔⛔ THE LICENCE IS READ FROM THE BOOK'S OWN COLOPHON, AND THE REASON IS A
// NEAR-MISS ON THIS VERY BOOK. Its landing page and its preface carry no licence
// string at all; a probe that looked only there would have recorded "no licence
// found" and rejected a **CC-BY-SA 4.0** text. **"I did not find a licence" is
// not "there is no licence"** — it is the same failure shape as a lane that
// cannot tell a refusal from an absence, which this corpus has now been bitten
// by three times in one week.
//
// LICENCE POSTURE (unchanged, and set by Gee 2026-09-02): NonCommercial is
// ACCEPTED — *"this is not a cvommercial use its a non profit educational
// experiment"*. **NoDerivatives is REFUSED**, because this corpus publishes a
// cleaned, excerpted, sentence-segmented adaptation into a public repository.
// ShareAlike is accepted with its obligation carried onward.
//
// RUN:  node .claude/scripts/fetch-openmathbooks-corpora.mjs           (all)
//       node .claude/scripts/fetch-openmathbooks-corpora.mjs college2  (one cell)
// Network required. Re-runnable / idempotent. Node 18+.
//
// ⛔ DO NOT RUN CONCURRENTLY WITH ANOTHER INGEST THAT WRITES `math`. The write is
// atomic; the read-modify-write around it is not.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', '..', 'corpora', 'academic');
const UA = 'UnityBrainCurriculum/1.0 (educational research; openly-licensed content)';

const SENT_MIN = 40, SENT_MAX = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ⚠ GRADE FOLLOWS THE ROSTER'S OWN COURSE NAME, never a subject keyword.
// `courseNameFor('math','college2')` is "Linear Algebra and Discrete Math", so a
// discrete mathematics text covers one genuine half of that course and the cell
// stays honestly THIN until the linear-algebra half lands beside it.
const BOOKS = [
  {
    base: 'https://discrete.openmathbooks.org/dmoi3/',
    colophon: 'front-colophon.html',
    index: 'frontmatter.html',
    subject: 'math',
    grade: 'college2',
    label: 'Discrete Mathematics',
  },
];

async function fetchText(url, ms = 25000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal });
    if (!r.ok) return { html: null, reason: `HTTP ${r.status}` };
    return { html: await r.text(), reason: '' };
  } catch (e) {
    return { html: null, reason: `network: ${e?.message || e}` };
  } finally { clearTimeout(timer); }
}

// Reads the licence off the colophon. Returns `{id, ok, why}` or null when the
// page could not be read at all — and those are deliberately DIFFERENT answers:
// null means "I could not look", not "there is nothing there".
async function licenceOf(book) {
  const { html } = await fetchText(new URL(book.colophon, book.base).href);
  if (!html) return null;
  const txt = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ');
  const m = /Creative Commons\s+([A-Za-z\- ]{0,60})/i.exec(txt);
  if (!m) return { id: null, ok: false, why: 'no Creative Commons statement on the colophon' };
  const tail = m[1].replace(/\s+/g, ' ').trim();
  if (/NoDeriv/i.test(tail)) return { id: `CC ${tail}`, ok: false, why: 'NoDerivatives — this corpus publishes an adaptation' };
  return { id: `CC ${tail}`.replace(/\s+$/, ''), ok: true };
}

// PreTeXt pages open with the book's LaTeX macro preamble and carry the reader
// chrome on every page. Both read as text and neither is prose.
function cleanSection(html) {
  let t = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;/gi, ' ');
  // ⛔ THE MACRO PREAMBLE IS THE BIGGEST SINGLE SOURCE OF FALSE PROSE HERE — it
  // is a few thousand characters of `\newcommand{...}{...}` at the top of EVERY
  // page, and it survives a tag strip untouched.
  t = t.replace(/\\(re)?newcommand\s*\{[^}]*\}(\s*\[\d+\])?\s*\{[\s\S]{0,400}?\}/g, ' ');
  t = t.replace(/\\DeclareMathOperator\s*\{[^}]*\}\s*\{[^}]*\}/g, ' ');
  t = t.replace(/\\\[[\s\S]{0,600}?\\\]/g, ' ');    // display maths
  t = t.replace(/\\\([\s\S]{0,300}?\\\)/g, ' ');    // inline maths
  t = t.replace(/\$[^$]{0,300}\$/g, ' ');
  t = t.replace(/\\[a-zA-Z]+\s*/g, ' ');            // any remaining control words
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
    // Reader chrome and licence boilerplate that survives the strip.
    if (/search book|search results|dark mode|creative commons|all rights reserved|feedback|table of contents|previous section|next section/i.test(s)) continue;
    // A leftover brace or bracket means unbalanced apparatus straddled the
    // sentence boundary — half a macro glued to real prose.
    if (/[{}\[\]\\]/.test(s)) continue;
    out.push(s.toLowerCase());
  }
  return out;
}

const CONTEXT_CHARS = 1400, CONTEXT_SENTS = 2;
function figureContext(html, index) {
  // The head segment of `before` is discarded: a window cut mid-sentence can
  // still end that fragment at a full stop and pass every filter.
  const before = cleanSection(String(html).slice(Math.max(0, index - CONTEXT_CHARS), index)).slice(1);
  const after = cleanSection(String(html).slice(index, index + CONTEXT_CHARS));
  return [...before.slice(-CONTEXT_SENTS), ...after.slice(0, CONTEXT_SENTS)]
    .join(' ').replace(/\s+/g, ' ').trim().slice(0, 700);
}

function harvestFigures(html, pageUrl) {
  const figs = [];
  for (const m of String(html || '').matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = m[1];
    const src = (/\bsrc="([^"]+)"/i.exec(attrs) || [])[1] || '';
    if (!src || /^data:/i.test(src) || /logo|icon|sprite|spacer/i.test(src)) continue;
    const alt = ((/\balt="([^"]*)"/i.exec(attrs) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const context = figureContext(html, m.index);
    // A real label OR real surrounding prose. A picture with neither has nothing
    // to bind to, and an unanchored percept fuses with whatever word is current.
    const words = alt.replace(/[^a-z ]/gi, '').trim();
    if (words.length < 3 && context.length < 40) continue;
    let abs;
    try { abs = new URL(src, pageUrl).href; } catch { continue; }
    figs.push({ src: abs, alt, caption: '', context });
  }
  return figs;
}

async function walkBook(book) {
  const { html: idx, reason } = await fetchText(new URL(book.index, book.base).href);
  if (!idx) return { sentences: [], figures: [], pages: 0, dead: 1, reason };
  // PreTeXt names every chapter page `ch_*` and every section page `sec_*`.
  const pages = [...new Set([...idx.matchAll(/href="([^"]+\.html)"/g)].map((m) => m[1]))]
    .filter((h) => /(^|\/)(sec|ch)_[^/]*\.html$/.test(h));
  const all = [], figures = [];
  const figSeen = new Set();
  let dead = 0, got = 0;
  for (const p of pages) {
    const url = new URL(p, book.base).href;
    const { html } = await fetchText(url);
    if (!html) { dead++; continue; }
    got++;
    all.push(...cleanSection(html));
    for (const f of harvestFigures(html, url)) {
      if (figSeen.has(f.src)) continue;
      figSeen.add(f.src);
      figures.push(f);
    }
    await sleep(200);
  }
  if (dead) console.log(`      (${dead} page(s) unreachable — a shortfall, not a verdict)`);
  const seen = new Set();
  return { sentences: all.filter((s) => !seen.has(s) && seen.add(s)), figures, pages: got, dead, reason: '' };
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
    source: 'hybrid: PreTeXt open mathematics textbooks + prior sources, cleaned + sentence-segmented',
    note: `Maths KNOWLEDGE corpus for ${subject}/${grade}. Trained via curriculum._trainAcademicStories alongside the equational runners, which are untouched.`,
    experiences: merged,
  }, null, 2), 'utf8');
  fs.renameSync(tmp, outPath);
  return merged.length;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0];
let grandWords = 0, grandFigs = 0;

for (const book of BOOKS) {
  if (only && book.grade !== only) continue;
  console.log(`[omb] ${book.label} -> ${book.subject}/${book.grade}`);
  const lic = await licenceOf(book);
  if (!lic) { console.log('  SKIPPED — colophon unreadable, so the licence is UNKNOWN rather than absent'); continue; }
  if (!lic.ok) { console.log(`  SKIPPED — ${lic.id || 'no licence'} — ${lic.why}`); continue; }
  console.log(`  licence verified from the book's own colophon: ${lic.id}`);

  const got = await walkBook(book);
  if (got.sentences.length < 50) {
    console.log(`  SKIPPED — only ${got.sentences.length} usable sentences${got.reason ? ` (${got.reason})` : ''}`);
    continue;
  }
  const words = got.sentences.join(' ').split(/\s+/).length;
  const entry = {
    theme: `omb-${book.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    story: got.sentences.join(' '),
    source: `openmathbooks/${new URL(book.base).hostname}`,
    licence: lic.id,
  };
  if (got.figures.length) entry.figures = got.figures;
  const n = writeCell(book.subject, book.grade, entry);
  grandWords += words; grandFigs += got.figures.length;
  console.log(`  ${got.pages} pages · ${got.sentences.length} sentences · ${words.toLocaleString()} words · ${got.figures.length} figures (cell now ${n} entries)`);
}

console.log(`[omb] DONE — ${grandWords.toLocaleString()} words, ${grandFigs.toLocaleString()} figures written under corpora/academic/.`);
