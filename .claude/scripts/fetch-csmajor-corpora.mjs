// fetch-csmajor-corpora.mjs — HER MAJOR. The CS-degree prose for college1-4.
//
// Unity majors in COMPUTER SCIENCE — the "major in code" — with the topic map
// following OSSU / ACM-IEEE across College 1-4, and a PhD in computational
// neuroscience (she builds a brain). That decision is not new and is not mine:
// it was made 2026-06-19 and it NAMED these sources. This is the fetcher for
// them, which the ledger recorded as shipped and which never existed.
//
// SOURCE: Open Data Structures (opendatastructures.org), the pseudocode
// edition. Licence CC-BY 2.5 Canada — read from the site, commercial-safe,
// and inside the CC-BY / CC-BY-SA-only posture (no NC).
//
// ⛔ WHY THIS IS A SEPARATE SCRIPT FROM THE WIKIBOOKS HALF OF THE SAME
// DECISION: Wikibooks is the SAME MediaWiki API family as the Wikipedia ingest
// and shares Wikimedia's per-IP rate limit — measured live during this build,
// which returned HTTP 429 "You are making too many requests" while the
// Wikipedia pass was running. A second concurrent MediaWiki fetcher would
// compete with the first for one budget rather than adding throughput, so the
// Wikibooks CS shelf belongs INSIDE the existing paced fetcher as extra topics,
// not beside it as a rival process. opendatastructures.org is a different host
// with its own budget, so this one can run concurrently and does.
//
// Output format, path and merge semantics are IDENTICAL to the other ingests.
//
// RUN:  node .claude/scripts/fetch-csmajor-corpora.mjs            (all mapped cells)
//       node .claude/scripts/fetch-csmajor-corpora.mjs college2   (one grade)
// Network required. Re-runnable / idempotent. Node 18+.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'corpora', 'academic');
const UA = 'UnityBrainCurriculum/1.0 (educational research; openly-licensed content)';
const BASE = 'https://opendatastructures.org/ods-python';

const SENT_MIN = 30, SENT_MAX = 240;
const SENT_CAP_BY_BAND = { early: 60, middle: 120, upper: 240, high: 400, college: 600, grad: 800 };
const BAND_OF_GRADE = new Map([
  ['grade9', 'high'], ['grade10', 'high'], ['grade11', 'high'], ['grade12', 'high'],
  ['college1', 'college'], ['college2', 'college'], ['college3', 'college'], ['college4', 'college'],
  ['grad', 'grad'], ['phd', 'grad'],
]);
const sentCapFor = (g) => SENT_CAP_BY_BAND[BAND_OF_GRADE.get(String(g || '').toLowerCase())] || SENT_CAP_BY_BAND.college;

// CHAPTER -> (grade). Follows the OSSU core sequence the existing cs topic
// table already declares: College 2 is the data-structures core, College 3
// adds the algorithmic/graph material, College 4 the theory-facing chapters.
// ⛔⛔ THE DESTINATION IS `major`, NOT `cs`, AND THE FIRST VERSION OF THIS
// SCRIPT GOT IT WRONG. `cs` is RETIRED at grade12 by SUBJECTS_RETIRED_AT, so
// corpora/academic/cs/college2.json is never read by the walk — the first run
// of this ingest banked 1,182 verified CC-BY sentences into a cell that does
// not exist at that grade. The college roster is major / genered / cstheory /
// cssystems (then research at grad), and `major` IS the CS degree.
// ⚠ The lesson is the one this whole batch is about: the licence was checked,
// the crawl depth was checked, the prose was read — and whether the destination
// cell RUNS was assumed. Content verified, consumption assumed.
const SUBJECT = 'major';

const CHAPTER_MAP = {
  college2: [
    ['1_Introduction.html', 'Introduction to Data Structures'],
    ['2_Array_Based_Lists.html', 'Array-Based Lists'],
    ['3_Linked_Lists.html', 'Linked Lists'],
    ['5_Hash_Tables.html', 'Hash Tables'],
    ['6_Binary_Trees.html', 'Binary Trees'],
  ],
  college3: [
    ['4_Skiplists.html', 'Skiplists'],
    ['7_Random_Binary_Search_Tree.html', 'Random Binary Search Trees'],
    ['8_Scapegoat_Trees.html', 'Scapegoat Trees'],
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// LaTeX2HTML output. Strip markup, navigation furniture and the maths spans
// (rendered as images/alt text) so what survives is the explanatory prose.
function cleanOds(html, cap) {
  if (!html) return [];
  let t = String(html);
  t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#\d+;/g, ' ');
  t = t.replace(/[‘’‚‛′]/g, "'")
       .replace(/[“”„‟″]/g, '"')
       .replace(/[‐-―−]/g, '-')
       .replace(/[…]/g, '...')
       .replace(/[     ]/g, ' ')
       .normalize('NFD').replace(/[̀-ͯ]/g, '')
       .replace(/\s+/g, ' ');
  const all = [];
  for (let s of t.split(/(?<=[.!?])\s+/)) {
    s = s.trim();
    if (s.length < SENT_MIN || s.length > SENT_MAX) continue;
    if (/[^\x20-\x7e]/.test(s)) continue;
    if (!/[a-z]/.test(s) || !/[.!?]$/.test(s)) continue;
    // LaTeX2HTML navigation furniture and figure/exercise apparatus.
    if (/^(next|up|previous|contents|index):|latex2html|opendatastructures|creative commons/i.test(s)) continue;
    // The LaTeX2HTML breadcrumb is a single run reading
    // "<chapter title> next: 2.1 ... up: ... previous: ... contents index".
    // It is NOT anchored at the start of the line — it begins with the chapter
    // title — so the anchored test above cannot see it. Caught by reading the
    // banked prose, where it was sentence one of a chapter.
    if (/\bnext:\s/i.test(s) && /\b(up|previous):\s/i.test(s)) continue;
    if (/\bcontents\s+index\b/i.test(s)) continue;
    if (/^figure |^exercise |^table |^algorithm /i.test(s)) continue;
    // A line that is mostly symbols is a formula rendering, not prose.
    const letters = (s.match(/[a-z]/g) || []).length;
    if (letters / s.length < 0.55) continue;
    all.push(s.toLowerCase());
  }
  // Spread across the chapter rather than taking its opening — same reason as
  // the textbook and literature ingests.
  if (all.length <= cap) return all;
  const stride = all.length / cap;
  const out = [];
  for (let i = 0; i < cap; i++) out.push(all[Math.floor(i * stride)]);
  return out;
}

async function get(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return '';
    return await r.text();
  } catch { return ''; }
}

// Licence READ from the site, never assumed — the same rule the textbook
// ingest follows, and the reason a mistyped URL there produced a refusal
// instead of a fabricated licence string.
async function verifyLicence() {
  const home = await get('https://opendatastructures.org/');
  const m = /creativecommons\.org\/licenses\/by(-[a-z-]+)?\/([0-9.]+)(\/[a-z]{2})?/i.exec(home || '');
  if (!m) return null;
  const variant = (m[1] || '').toLowerCase();
  if (/nc/.test(variant)) return { id: `CC-BY${variant} ${m[2]}`, ok: false };
  return { id: `CC-BY${variant} ${m[2]}${m[3] || ''}`.trim(), ok: true };
}

async function buildGrade(grade, chapters, lic) {
  const cap = sentCapFor(grade);
  console.log(`[csmajor] ${SUBJECT}/${grade} (cap ${cap}) — ${chapters.length} chapter(s)`);
  const per = Math.max(20, Math.floor(cap / chapters.length));
  const experiences = [];
  for (const [file, title] of chapters) {
    const html = await get(`${BASE}/${file}`);
    if (!html) { console.log(`  ${title} — UNAVAILABLE`); continue; }
    // ⛔ A CHAPTER PAGE IS A TABLE OF CONTENTS, NOT THE CHAPTER. Measured: the
    // chapter file is ~13 KB of navigation and yielded ~18 sentences, while the
    // prose lives one level down in section pages (`2_1_ArrayStack_*.html`).
    // Taking the chapter page alone would have banked a contents listing as the
    // CS major's textbook — thin, and thin in a way that reads like success.
    // Follow the section links and read those.
    const sectionFiles = [...new Set(
      [...html.matchAll(/HREF="(\d+_\d+_[^"]+\.html)"/gi)].map((m) => m[1])
    )];
    let body = html;
    for (const sf of sectionFiles) {
      const sh = await get(`${BASE}/${sf}`);
      if (sh) body += ' ' + sh;
      await sleep(300);
    }
    const sents = cleanOds(body, per);
    if (sents.length < 3) { console.log(`  ${title} — no usable prose after cleaning`); continue; }
    experiences.push({
      theme: `ods-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      story: sents.join(' '),
      source: 'opendatastructures.org',
      licence: lic.id,
    });
    console.log(`  ${title} — ${sents.length} sentences`);
    await sleep(800);
  }
  if (!experiences.length) return 0;

  const dir = path.join(OUT, SUBJECT);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `${grade}.json`);
  const byTheme = new Map();
  try {
    const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    for (const e of (prev.experiences || [])) byTheme.set(e.theme, e);
  } catch { /* fresh cell */ }
  for (const e of experiences) {
    const old = byTheme.get(e.theme);
    if (!old || e.story.length > old.story.length) byTheme.set(e.theme, e);
  }
  const merged = [...byTheme.values()];
  fs.writeFileSync(outPath, JSON.stringify({
    version: 1, grade, subject: SUBJECT,
    source: 'hybrid: Open Data Structures (CC-BY) + Wikipedia (CC-BY-SA), cleaned + sentence-segmented',
    note: `Hybrid academic-depth corpus for ${SUBJECT}/${grade} — the CS major. Trained via curriculum._trainAcademicStories.`,
    experiences: merged,
  }, null, 2), 'utf8');
  const n = experiences.reduce((a, e) => a + e.story.split(/(?<=[.!?])\s+/).length, 0);
  console.log(`  -> ${SUBJECT}/${grade}.json (cell now ${merged.length} entries)`);
  return n;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0];
const lic = await verifyLicence();
if (!lic) {
  console.log('[csmajor] ABORT — could not read a licence from opendatastructures.org; refusing to ingest content whose licence has not been verified.');
} else if (!lic.ok) {
  console.log(`[csmajor] ABORT — ${lic.id} violates the CC-BY/CC-BY-SA-only posture.`);
} else {
  console.log(`[csmajor] licence verified: ${lic.id}`);
  let total = 0;
  for (const [grade, chapters] of Object.entries(CHAPTER_MAP)) {
    if (only && grade !== only) continue;
    try { total += await buildGrade(grade, chapters, lic); }
    catch (e) { console.log(`[csmajor] ${grade} FAILED — ${e.message}`); }
  }
  console.log(`[csmajor] DONE — ~${total} CS-degree sentences written under corpora/academic/${SUBJECT}/.`);
}
