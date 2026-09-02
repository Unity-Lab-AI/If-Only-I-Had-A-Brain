// fetch-openstax-corpora.mjs — REAL TEXTBOOK ingest for the academic corpus.
//
// This is the fetcher that was marked "✅ DONE 2026-07-15" in the ledger and
// never written. The source decision it implements is not new and is not mine:
// the hybrid OpenStax + Wikibooks + Project Gutenberg spread, CC-BY / CC-BY-SA
// only, commercial-safe, CC-BY-NC excluded (which is why LibreTexts and MIT OCW
// are not here). Output format, path and merge semantics are IDENTICAL to
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
const SENT_CAP_BY_BAND = {
  early: 60, middle: 120, upper: 240, high: 400, college: 600, grad: 800,
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
// ⚠ MATH IS ABSENT ON PURPOSE. Math is equational by design and trains through
// its own bespoke runners; the algebra/calculus/precalculus mirrors exist and
// are deliberately NOT mapped. Adding prose there would be a change to how math
// is taught, which is a curriculum decision, not an ingest decision.
const BOOK_MAP = [
  { repo: 'biology-concepts-book', subject: 'science', grade: 'grade9',    label: 'Biology' },
  { repo: 'chemistry-book',        subject: 'science', grade: 'grade10',   label: 'Chemistry' },
  { repo: 'physics-book',          subject: 'science', grade: 'grade11',   label: 'Physics' },
  { repo: 'anatomy-book',          subject: 'science', grade: 'grade12',   label: 'Anatomy and Physiology' },
  { repo: 'astronomy-book',        subject: 'science', grade: 'grade6',    label: 'Earth and Space Science' },
  { repo: 'biology-book',          subject: 'science', grade: 'college1',  label: 'General Biology' },
  { repo: 'microbiology-book',     subject: 'science', grade: 'college2',  label: 'Microbiology' },
  { repo: 'economics-book',        subject: 'economics', grade: 'grade11', label: 'Macroeconomics' },
  { repo: 'economics-book',        subject: 'economics', grade: 'college1', label: 'Principles of Economics' },
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
    figs.push({ src, alt, caption });
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
async function licenceOf(repo) {
  const txt = await raw(`https://raw.githubusercontent.com/${OWNER}/${repo}/master/LICENSE.txt`);
  const m = /Creative Commons Attribution([^.\n]*)/i.exec(txt || '');
  if (!m) return null;
  const tail = m[1].replace(/\s+/g, ' ').trim();
  if (/NonCommercial|NC\b/i.test(tail)) return { id: `CC-BY-NC${tail}`, ok: false };
  return { id: `CC-BY${tail ? ' ' + tail : ''}`.trim(), ok: true };
}

async function buildBook({ repo, subject, grade, label }) {
  const cap = sentCapFor(grade);
  console.log(`[openstax] ${repo} -> ${subject}/${grade} (cap ${cap})`);

  const lic = await licenceOf(repo);
  if (!lic) { console.log(`  SKIPPED — no readable licence in ${repo}/LICENSE.txt`); return 0; }
  if (!lic.ok) { console.log(`  SKIPPED — ${lic.id} violates the CC-BY/CC-BY-SA-only posture`); return 0; }
  console.log(`  licence verified: ${lic.id}`);

  let files;
  try { files = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/contents/contents`); }
  catch (e) { console.log(`  SKIPPED — listing failed: ${e.message}`); return 0; }
  const mds = files.filter((f) => f.type === 'file' && f.name.endsWith('.md'));
  if (!mds.length) { console.log('  SKIPPED — no chapter files'); return 0; }

  // ⛔ SPREAD THE BUDGET ACROSS THE WHOLE BOOK, never front-load it. Taking the
  // cap from the first chapters would teach her chapter 1 in depth and leave
  // the other 250 sections untaught — the same "one number, wrong shape" error
  // as the flat sentence cap, one level up.
  const perChapter = Math.max(3, Math.ceil(cap / Math.min(mds.length, 60)));
  const stride = Math.max(1, Math.floor(mds.length / Math.min(mds.length, 60)));
  const picked = [];
  for (let i = 0; i < mds.length && picked.length < 60; i += stride) picked.push(mds[i]);

  const experiences = [];
  let taken = 0;
  let figuresFound = 0;
  for (const f of picked) {
    if (taken >= cap) break;
    const md = await raw(`https://raw.githubusercontent.com/${OWNER}/${repo}/master/contents/${f.name}`);
    const title = (/^title:\s*"?([^"\n]+)"?/m.exec(md || '') || [, f.name.replace(/\.md$/, '')])[1].trim();
    const room = Math.min(perChapter, cap - taken);
    const sents = cleanOpenStax(md, room);
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
  // Same keep-longer union as the wiki ingest — a re-run can only ADD coverage,
  // and the two sources merge by theme instead of overwriting each other.
  const byTheme = new Map();
  let prevDoc = null;
  try {
    prevDoc = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    for (const e of (prevDoc.experiences || [])) byTheme.set(e.theme, e);
  } catch { /* fresh cell */ }
  for (const e of experiences) {
    const old = byTheme.get(e.theme);
    if (!old || e.story.length > old.story.length) byTheme.set(e.theme, e);
  }
  const merged = [...byTheme.values()];
  const doc = {
    version: 1, grade, subject,
    source: 'hybrid: OpenStax textbooks (CC-BY) + Simple/English Wikipedia (CC-BY-SA), cleaned + sentence-segmented',
    note: `Hybrid academic-depth corpus for ${subject}/${grade}. Trained via curriculum._trainAcademicStories. Real openly-licensed curriculum content; lived-year + math stay bespoke.`,
    experiences: merged,
  };
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf8');
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
