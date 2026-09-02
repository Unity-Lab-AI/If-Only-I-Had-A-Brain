// fetch-wikibooks-corpora.mjs — TEXTBOOKS FOR THE COURSES THAT HAVE NONE.
//
// ⛔ THE GAP THIS EXISTS FOR, MEASURED: **131 of 174 cells run on encyclopedia
// articles only** — art 20, social 17, health 13, music 13, pe 13, language 10,
// science 9, cs 8, civics 6, and the rest. Gee: *"we need a text book basicly
// for every course"*.
//
// ⭐ AN ARTICLE ABOUT A SUBJECT IS NOT A COURSE IN IT. An encyclopedia entry on
// photosynthesis is written for someone who already reads science articles; a
// textbook chapter teaches it, in order, with the vocabulary introduced before
// it is used. Removing the sentence caps made every source COMPLETE; it did not
// turn an encyclopedia into a textbook.
//
// WHY WIKIBOOKS: it is literally a library of open textbooks, CC-BY-SA, with an
// API that exposes both the chapter TREE and the full plaintext of every
// chapter — which is the shape a book ingest needs and the shape a search index
// does not give you. Probed before building: `list=search` with `intitle:`
// finds books, `list=allpages&apprefix=Book/` enumerates a book's chapters, and
// `prop=extracts&explaintext=1` returns whole chapters as prose.
//
// ⛔ NO CAP ANYWHERE. Every chapter of every book, whole. What says a CELL is
// finished is the band floor in `docs/CURRICULUM-GAP.md §THE TARGET LADDER`.
//
// RUN:  node .claude/scripts/fetch-wikibooks-corpora.mjs           (all subjects)
//       node .claude/scripts/fetch-wikibooks-corpora.mjs civics    (one subject)
// Network required. Re-runnable / idempotent. Node 18+.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'corpora', 'academic');
const UA = 'UnityBrainCurriculum/1.0 (non-profit educational research; open textbooks)';
const API = 'https://en.wikibooks.org/w/api.php';

const SENT_MIN = 40, SENT_MAX = 320;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Subject → the `intitle:` searches that find its textbooks, and the grades that
// currently have NO textbook lane. ⚠ Wikibooks sits at secondary/undergraduate
// level, so it is assigned to the bands where that is honest — it is not a
// primary-school source and pretending otherwise would put college prose in a
// grade-3 cell, which is the corpus-bleed defect the grade gate exists to stop.
const PLAN = {
  civics:     { finds: ['intitle:Government', 'intitle:Civics', 'intitle:Constitution'], grades: ['grade9', 'grade10', 'grade11', 'grade12'] },
  economics:  { finds: ['intitle:Economics', 'intitle:Microeconomics', 'intitle:Macroeconomics'], grades: ['grade9', 'grade10', 'grade12'] },
  psychology: { finds: ['intitle:Psychology', 'intitle:Cognitive'], grades: ['grade9', 'grade10', 'grade11', 'grade12'] },
  social:     { finds: ['intitle:History', 'intitle:Sociology', 'intitle:Geography'], grades: ['grade9', 'grade10', 'grade11', 'grade12', 'college1', 'college3', 'college4'] },
  science:    { finds: ['intitle:Biology', 'intitle:Chemistry', 'intitle:Physics'], grades: ['grade7', 'grade8', 'grade9'] },
  cs:         { finds: ['intitle:Programming', 'intitle:Computer Science', 'intitle:Algorithms'], grades: ['grade9', 'grade10', 'grade11', 'grade12'] },
  health:     { finds: ['intitle:Health', 'intitle:Nutrition', 'intitle:Anatomy'], grades: ['grade9', 'grade10', 'grade11', 'grade12'] },
  music:      { finds: ['intitle:Music Theory', 'intitle:Music'], grades: ['grade9', 'grade10', 'grade11', 'grade12'] },
  art:        { finds: ['intitle:Art History', 'intitle:Drawing'], grades: ['grade9', 'grade10', 'grade11', 'grade12'] },
  language:   { finds: ['intitle:Spanish', 'intitle:French', 'intitle:Linguistics'], grades: ['grade9', 'grade10', 'grade11', 'grade12'] },
};

// ⛔⛔ RETRY, BECAUSE A TRANSIENT FAILURE WAS BEING REPORTED AS A VERDICT.
//
// The first version returned `null` on any error and the caller read that as
// "this book has no chapters", printing **`0 chapters, skipped (not a book)`**
// for `US History`, `Constitution of India` and six others — all of which are
// real books with real chapter trees. The same three requests re-run by hand a
// minute later returned 5 pages each. **The API was rate-limiting, and the
// fetcher was turning that into a judgement about the book.**
//
// Same defect class as everything else this sweep has found: a lane that cannot
// tell "I failed" from "there is nothing there" reports the second and nobody
// looks again. Now it retries with backoff and, when it truly gives up, says
// LOOKUP FAILED rather than passing sentence on the source.
async function api(params, attempts = 4) {
  const url = `${API}?${params}&format=json&formatversion=2`;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status < 500) return null;   // a real refusal, not a wobble
    } catch { /* timeout or socket — treat as transient */ }
    await sleep(1200 * (i + 1) * (i + 1));                   // 1.2s, 4.8s, 10.8s
  }
  return undefined;                                          // undefined = LOOKUP FAILED, null = genuinely absent
}

// A search hit is often a CHAPTER (`Introduction to Psychology/Abnormal
// Psychology`); the book is the part before the first slash. Roots are deduped
// so three chapters of one book do not read as three books.
async function findBooks(finds) {
  const roots = new Set();
  for (const q of finds) {
    const j = await api(`action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=20&srnamespace=0`);
    for (const hit of (j?.query?.search || [])) {
      const root = String(hit.title).split('/')[0].trim();
      if (root && !/^(Wikibooks|Help|Subject|Shelf)\b/i.test(root)) roots.add(root);
    }
    await sleep(400);
  }
  return [...roots];
}

// Every chapter of a book, following `continue` — a book with 300 chapters is a
// book with 300 chapters, and stopping at the first page of results is the same
// truncation this whole effort exists to undo.
async function chaptersOf(root) {
  const titles = [];
  let cont = '';
  let failed = false;
  for (let guard = 0; guard < 20; guard++) {
    const j = await api(`action=query&list=allpages&apprefix=${encodeURIComponent(root + '/')}&aplimit=500&apnamespace=0${cont}`);
    if (j === undefined) { failed = true; break; }   // gave up after retries
    if (!j) break;                                   // genuinely nothing
    for (const p of (j?.query?.allpages || [])) titles.push(p.title);
    if (j.continue && j.continue.apcontinue) {
      cont = `&apcontinue=${encodeURIComponent(j.continue.apcontinue)}`;
      await sleep(600);
    } else break;
  }
  return { titles, failed };
}

function cleanSentences(text) {
  const body = String(text || '')
    .replace(/={2,}[^=]{0,120}={2,}/g, ' ')          // == section headings ==
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
    // Wiki furniture that is not the book.
    if (/wikibooks|wikipedia|this page (was|is)|edit this|category:|template:|creative commons|licensed under|retrieved from/i.test(s)) continue;
    if (/^(figure|table|exercise|see also|external links|references)\b/i.test(s)) continue;
    out.push(s.toLowerCase());
  }
  return out;
}

// ⛔⛔ ONE CHAPTER PER REQUEST, AND BATCHING IS THE TRAP.
//
// `prop=extracts` with `exlimit>1` silently forces intro-only mode: the response
// carries the FIRST page's text and **zero characters for every other title in
// the batch**. Measured against a real book — a 3-title batch returned
// `365, 0, 0` characters, while the same first title fetched alone returned the
// same 365. So a 33-chapter book was yielding ONE chapter's intro, which is how
// `United States Government` came back as *"33 chapters but only 3 usable
// sentences"* and looked like a bad source rather than a bad request.
//
// ⚠ 33 requests per book instead of 2 is the price of the whole book. That is
// the trade this corpus has already decided everywhere else.
async function extractsFor(titles) {
  const all = [];
  let failed = 0;
  for (const t of titles) {
    const j = await api(`action=query&prop=extracts&explaintext=1&exlimit=1&titles=${encodeURIComponent(t)}`);
    if (j === undefined) { failed++; continue; }
    for (const p of (j?.query?.pages || [])) {
      if (p && p.extract) all.push(...cleanSentences(p.extract));
    }
    await sleep(350);
  }
  if (failed) console.log(`      (${failed} of ${titles.length} chapters could not be fetched — a shortfall, not a verdict)`);
  const seen = new Set();
  return all.filter((s) => !seen.has(s) && seen.add(s));
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
  fs.writeFileSync(outPath, JSON.stringify({
    version: 1, grade, subject,
    source: 'hybrid: Wikibooks open textbooks + prior sources, cleaned + sentence-segmented',
    note: `Textbook corpus for ${subject}/${grade}. Trained via curriculum._trainAcademicStories. A course is a book, not an article about the subject.`,
    experiences: merged,
  }, null, 2), 'utf8');
  return merged.length;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0];
let grandWords = 0, grandBooks = 0;
for (const [subject, plan] of Object.entries(PLAN)) {
  if (only && subject !== only) continue;
  console.log(`[wikibooks] ${subject} — searching…`);
  const roots = await findBooks(plan.finds);
  console.log(`[wikibooks] ${subject}: ${roots.length} candidate books`);
  let i = 0;
  for (const root of roots) {
    const { titles: chapters, failed } = await chaptersOf(root);
    if (failed) { console.log(`  ${root.slice(0, 46)} — ⛔ LOOKUP FAILED after retries; NOT a verdict about the book, re-run to include it`); continue; }
    if (chapters.length < 3) { console.log(`  ${root.slice(0, 46)} — ${chapters.length} chapters, skipped (not a book)`); continue; }
    const sents = await extractsFor(chapters);
    if (sents.length < 100) { console.log(`  ${root.slice(0, 46)} — ${chapters.length} chapters but only ${sents.length} usable sentences, skipped`); continue; }
    const grade = plan.grades[i % plan.grades.length];
    i++;
    const slug = root.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const n = writeCell(subject, grade, {
      theme: `book-${slug}`,
      story: sents.join(' '),
      source: `wikibooks/${slug}`,
      licence: 'CC-BY-SA 3.0',
    });
    const w = sents.join(' ').split(/\s+/).length;
    grandWords += w; grandBooks++;
    console.log(`  ${subject}/${grade} <- ${root.slice(0, 44)} — ${chapters.length} chapters, ${sents.length} sentences, ${w.toLocaleString()} words (cell now ${n} entries)`);
  }
}
console.log(`[wikibooks] DONE — ${grandBooks} books, ${grandWords.toLocaleString()} words of open textbook prose written under corpora/academic/.`);
