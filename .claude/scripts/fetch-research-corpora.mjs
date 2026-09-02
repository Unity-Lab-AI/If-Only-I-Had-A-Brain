// fetch-research-corpora.mjs — THE GRAD / PhD LANE.
//
// The college→PhD source question was Gee's, and he answered it: textbooks for
// college2-4, the research literature for grad/PhD. This script is the second
// half — the literature.
//
// ⛔ WHY THE LITERATURE AND NOT MORE TEXTBOOKS: a graduate year is not a bigger
// textbook. It is papers. OpenStax stops at intro undergrad by construction, so
// for these two bands there is no textbook to fetch even in principle.
//
// TWO SOURCES, AND THEY ARE NOT INTERCHANGEABLE — the difference is stated here
// because it decides what a cell actually holds:
//
//   • PubMed Central Open Access  — FULL TEXT. A single article returns whole
//     sections of real scholarly prose (~70 KB of XML for one paper). This is
//     the deep lane, and it covers biology, medicine, psychology and parts of
//     social science.
//   • arXiv                       — ABSTRACTS ONLY. The API returns metadata,
//     not the paper; full text lives in a PDF or a LaTeX e-print, neither of
//     which is clean prose. ⚠ An abstract is still real scholarly writing at
//     exactly this register — dense, hedged, structured — but it is 150-250
//     words, so a cell built from arXiv needs hundreds of them. Labelled rather
//     than blurred into the PMC lane, because "a cell of abstracts" and "a cell
//     of papers" are different objects and a reader must be able to tell.
//
// LICENCE: PMC's Open Access subset is CC-BY / CC-BY-SA / CC0 by construction —
// the subset IS the licence filter. arXiv abstracts are distributed under
// arXiv's own terms for metadata reuse. Both are recorded per entry.
//
// RUN:  node .claude/scripts/fetch-research-corpora.mjs            (grad + phd)
//       node .claude/scripts/fetch-research-corpora.mjs grad       (one band)
// Network required. Re-runnable / idempotent. Node 18+.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripLeakedMarkup } from './clean-math.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
// ⛔⛔ THE OUTPUT DIR IS OVERRIDABLE BECAUSE A BOUNDED RUN IS OTHERWISE
// DESTRUCTIVE, AND THAT IS NOT OBVIOUS FROM READING `writeCell`.
//
// The merge rule is same-source-id WINS — deliberately, so a re-ingest replaces
// its own entry instead of stacking duplicates. The consequence is that a small
// probe run (`RESEARCH_PMC=8`) writes a tiny `papers-<subject>` entry straight
// over a real one holding hundreds of thousands of words, reports success, and
// looks identical to a healthy run. **A verification step that can silently
// delete the thing it is verifying is not a verification step.** Point
// `RESEARCH_OUT` at a scratch directory for any bounded run.
const OUT = process.env.RESEARCH_OUT ? path.resolve(process.env.RESEARCH_OUT) : path.join(ROOT, 'corpora', 'academic');
// ⛔ THE CONTACT DETAILS ARE LOAD-BEARING, NOT DECORATION. A robot that does not
// say who runs it is refused by policy on several of the hosts this corpus
// reads, and a refusal on identity grounds looks exactly like a rate limit while
// being immune to every backoff — which cost this project weeks on a different
// host before it was measured. NCBI likewise asks every automated client to
// identify itself. Stating what we are is the opposite of forging a browser.
const UA = 'UnityBrainCurriculum/1.0 (educational research; open-access literature; https://www.unityailab.com; contact@unityailab.com)';

// One figure carries three things a percept can bind to: the image, the words
// under it, and the sentence in the body that points at it. The third is the one
// that is easy to lose and the one the standing rule is about — an illustration
// must be trained CONNECTED to the text that references it — so it is harvested
// deliberately rather than hoped for.
const FIG_CONTEXT_CHARS = 1400;

const SENT_MIN = 40, SENT_MAX = 320;
// The grad band's floor is 330,000 words per cell (docs/CURRICULUM-GAP.md
// §THE TARGET LADDER). Nothing here reaches that in one pass, and the cap below
// is a per-run bound rather than a target — the merge is additive across runs.
// ⛔⛔ THESE TWO ARE A DIFFERENT KIND OF NUMBER FROM A SENTENCE CAP, AND THE
// DISTINCTION IS WORTH KEEPING (2026-09-02, under *"all the corpus needs to be
// complete"*).
//
// A sentence cap truncates a work that has already been downloaded — that is the
// defect, and every one of them is gone from every ingest. These are not that:
// the research literature has no end. PubMed Central holds millions of open
// papers and arXiv takes thousands a week, so "complete" is not a state this
// source can reach — there is only how much of an endless stream to take.
//
// Raised hard rather than removed, because a number here is a REQUEST SIZE and
// removing it means "every paper ever written". Each paper is read WHOLE; what
// these bound is how many papers, and the band floor decides when the cell is
// full. ⚠ NCBI asks for politeness, hence the batching and sleeps below.
// ⭐ Env-overridable so the lane can be RUN bounded instead of verified by a
// stand-in. A harness that reimplements the fetch proves the harness works; the
// only thing that proves this works is this file talking to these hosts, and a
// full pass is far too long to sit through for every change. `RESEARCH_PMC=8`
// exercises the real wiring end to end in seconds. Defaults unchanged.
const PMC_ARTICLES = Number(process.env.RESEARCH_PMC) || 400;      // full-text papers per subject per band — each taken whole
const ARXIV_ABSTRACTS = Number(process.env.RESEARCH_ARXIV ?? 3000);  // abstracts per subject per band

// Subject → where its literature actually lives. ⛔ Empty means NO LANE, said
// out loud: civics has no open-access research archive of its own, and pointing
// it at a biomedical index to fill a number would be worse than the gap.
const SOURCES = {
  science:    { pmc: '("cell biology"[MeSH] OR chemistry OR "materials science")', arxiv: ['physics.gen-ph', 'cond-mat.soft'] },
  psychology: { pmc: '(psychology OR "cognitive science" OR neuroscience)',        arxiv: ['q-bio.NC'] },
  social:     { pmc: '("public health" OR sociology OR "social determinants")',    arxiv: ['physics.soc-ph'] },
  cs:         { pmc: '',                                                           arxiv: ['cs.LG', 'cs.DS', 'cs.SE'] },
  economics:  { pmc: '',                                                           arxiv: ['econ.GN', 'econ.EM'] },
  civics:     { pmc: '',                                                           arxiv: [] },
};

// ⛔⛔ THE CELL A SUBJECT'S LITERATURE BELONGS IN IS NOT ALWAYS THE SUBJECT'S OWN
// NAME, AND WRITING IT THERE PRODUCES WORDS THE WALK NEVER READS.
//
// `SUBJECTS_RETIRED_AT` retires `cs`, `economics` and `psychology` at grade12 —
// at college and above they are superseded by `major` / `cstheory` / `cssystems`
// and, at grad level, by `research`. So a `psychology/phd.json` is not a thin
// cell, it is an UNREACHABLE one: the roster never asks for it.
//
// ⚠ Caught by the coverage auditor immediately after the first run of this
// script, which reported `UNREACHABLE files: 6 (465,704 words the walk never
// reads)` where it had reported 0 the hour before. **That is the auditor doing
// precisely the job it was written for, against the person who wrote it.** The
// same defect it was built to catch — 268,481 words sitting in cs/college*,
// /grad and /phd that nothing read — reproduced by me in one command.
const RETIRED_AT_GRADE12 = new Set(['cs', 'economics', 'psychology', 'civics']);
const GRAD_HOME = { cs: 'major', economics: 'research', psychology: 'research' };
const cellFor = (subject) => (RETIRED_AT_GRADE12.has(subject) ? GRAD_HOME[subject] : subject);

const GRADES = ['grad', 'phd'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Shared prose cleaner. Same shape as the other ingests so all four sources
// produce comparable sentences rather than four dialects of "clean".
function cleanSentences(raw, cap) {
  let t = String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\[[^\[\]]*\]/g, ' ')           // citation brackets and apparatus
    .replace(/\((?:[^()]{0,40}et al\.[^()]{0,40})\)/g, ' ')  // (Smith et al., 2019)
    .replace(/[‘’‚‛′]/g, "'")
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
    if (/[\[\]]/.test(s)) continue;
    // Journal furniture that is not the argument.
    if (/doi:|copyright|\ball rights reserved\b|received:|accepted:|corresponding author|conflicts? of interest|supplementary (material|file)|this article is|licensed under/i.test(s)) continue;
    // ⛔⛔ NARROWED — THIS RULE WAS DELETING THE EXACT PROSE THE FIGURE LANE
    // EXISTS TO PRESERVE. It dropped every sentence opening with `figure` /
    // `fig` / `table`, which is the shape of an IN-TEXT REFERENCE — "figure 3
    // shows the distribution of..." is the argument, not furniture, and it is
    // the sentence that binds the illustration to the text. A caption stub
    // like "Fig 1." cannot survive here anyway: SENT_MIN already requires 40
    // characters. So the rule was costing real anchors and buying nothing.
    // `supplementary` and `appendix` openings stay dropped — those genuinely
    // are apparatus pointing outside the paper.
    if (/^(supplementary|appendix)\b/i.test(s)) continue;
    // ⛔ LEAKED MATH MARKUP — 9,946 arxiv sentences carried raw LaTeX, the single
    // largest markup leak in the corpus. She learns WORDS from prose, so
    // `$d_{\mathrm{sk}}$` in a sentence teaches her that as vocabulary. Maths is
    // taught equationally here; leaked notation is the thing the grade gate
    // exists to forbid, arriving through the back door.
    const _m = stripLeakedMarkup(s);
    if (_m.drop) continue;
    s = _m.text;
    out.push(s.toLowerCase());
    if (out.length >= cap) break;
  }
  return out;
}

async function pmcIds(term, n) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&retmax=${n}`
    + `&term=${encodeURIComponent(term + ' AND open access[filter]')}&retmode=json`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.esearchresult?.idlist || []);
}

// Strip the JATS tags out of a caption or a body run without losing the words.
const detag = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ⛔⛔ THE FIGURE IMAGE URL IS NOT DERIVABLE FROM THE ARTICLE XML, AND SIX
// CONSTRUCTED PATTERNS WERE TRIED AND ALL 404ed BEFORE THAT WAS MEASURED.
//
// The XML gives `<graphic xlink:href="pone.0353938.g001.webp">` — a bare file
// name. The image actually lives at
//   https://cdn.ncbi.nlm.nih.gov/pmc/blobs/<shard>/<aid>/<opaque-hash>/<href>
// where the shard and the hash are content-addressed and appear NOWHERE in the
// XML. `/pmc/articles/<PMCID>/bin/<href>` — the pattern this kind of code
// usually assumes — is dead for both a 2007 article and a 2026 one, so the
// failure is the pattern and not the article's age.
//
// So the URL is READ, not built: one fetch of the article's own page, and the
// `<graphic>` file name is the join key because it is the last path segment of
// the blob URL. Measured on a real batch: **44 figures, 44 joined, 100%**, eight
// articles in 1.5 s. ⚠ A constructed URL would have banked thousands of rows
// that look perfectly well-formed and 404 at perceive time — the figure queue
// would have reported them `failed` with no way to tell a dead link from a dead
// host, which is precisely the "instrument that cannot distinguish I-failed from
// there-is-nothing-there" defect this project keeps paying for.
async function pmcBlobMap(pmcid) {
  try {
    const r = await fetch(`https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`, { headers: { 'User-Agent': UA } });
    if (!r.ok) return { map: new Map(), reason: `HTTP ${r.status}` };
    const html = await r.text();
    const map = new Map();
    for (const m of html.matchAll(/<img[^>]+src="(https:\/\/cdn\.ncbi\.nlm\.nih\.gov\/pmc\/blobs\/[^"]+)"/g)) {
      map.set(m[1].split('/').pop(), m[1]);
    }
    return { map, reason: map.size ? '' : 'page carries no blob images' };
  } catch (e) {
    return { map: new Map(), reason: e.message };
  }
}

// The in-text sentence that POINTS AT this figure. `<fig>` sits inline in the
// JATS body at the place the text discusses it, so the prose either side of the
// element is the reference — the same neighbourhood rule the textbook lane uses,
// applied to the same problem.
function figContextFromBody(articleXml, figIndex) {
  const before = detag(articleXml.slice(Math.max(0, figIndex - FIG_CONTEXT_CHARS), figIndex));
  const after = detag(articleXml.slice(figIndex, figIndex + FIG_CONTEXT_CHARS));
  const pick = (t, tail) => {
    const parts = t.split(/(?<=[.!?])\s+/).filter((x) => x.length >= 40);
    return tail ? parts.slice(-2) : parts.slice(0, 2);
  };
  return [...pick(before, true), ...pick(after, false)].join(' ').slice(0, 700);
}

async function pmcArticles(ids) {
  // efetch takes a comma list; batches of 10 keep each response readable and
  // stay well inside NCBI's rate guidance.
  const xmlParts = [];
  const figures = [];
  const figStats = { articles: 0, withFigs: 0, declared: 0, resolved: 0, noAnchor: 0, unresolved: 0 };
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10).join(',');
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${batch}&rettype=xml`;
    let xml = '';
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) xml = await r.text();
    } catch { /* a dead batch is a dead batch; the count reports it */ }
    if (!xml) { await sleep(1200); continue; }
    xmlParts.push(xml);
    // ⛔ SPLIT ON `<article ` / `<article>`, NEVER `<article\b` — a word boundary
    // treats the hyphen as one, so `\b` also matches `<article-id`,
    // `<article-title` and `<article-meta`. That mistake turned 8 articles into
    // 544 fragments and every figure join failed at 0%, silently, because each
    // fragment was well-formed enough to parse and simply held no `<fig>`.
    const arts = xml.split(/(?=<article[ >])/).filter((a) => /^<article[ >]/.test(a));
    for (const art of arts) {
      figStats.articles += 1;
      const pmcid = (art.match(/<article-id pub-id-type="pmcid">(PMC\d+)</) || [])[1];
      const found = [];
      for (const m of art.matchAll(/<fig[ >][\s\S]*?<\/fig>/g)) {
        const block = m[0];
        const href = (block.match(/<graphic\b[^>]*xlink:href="([^"]+)"/) || [])[1];
        if (!href) continue;   // a `<fig>` with no graphic is a table or a placeholder
        const label = detag((block.match(/<label>([\s\S]*?)<\/label>/) || [])[1]);
        const caption = detag((block.match(/<caption>([\s\S]*?)<\/caption>/) || [])[1]);
        found.push({ href, label, caption, at: m.index });
      }
      if (!pmcid || !found.length) continue;
      figStats.withFigs += 1;
      figStats.declared += found.length;
      const { map } = await pmcBlobMap(pmcid);
      for (const f of found) {
        const blob = map.get(f.href);
        if (!blob) { figStats.unresolved += 1; continue; }
        const context = f.caption.length >= 40 ? f.caption : figContextFromBody(art, f.at);
        // The same bar every other lane holds: a figure with no words attached
        // teaches nothing a percept can bind TO. Counted, not silently dropped.
        if (f.caption.length < 40 && context.length < 40) { figStats.noAnchor += 1; continue; }
        figStats.resolved += 1;
        figures.push({
          src: f.href,
          url: blob,
          alt: [f.label, f.caption].filter(Boolean).join(' — ').slice(0, 300),
          caption: f.caption,
          context,
          licence: 'open-access-subset (CC-BY / CC-BY-SA / CC0)',
        });
      }
      await sleep(300);
    }
    await sleep(1200);
  }
  return { xml: xmlParts.join(' '), figures, figStats };
}

async function arxivAbstracts(cats, n) {
  const per = Math.max(1, Math.floor(n / Math.max(1, cats.length)));
  let all = '';
  for (const cat of cats) {
    const url = `http://export.arxiv.org/api/query?search_query=cat:${encodeURIComponent(cat)}`
      + `&start=0&max_results=${per}&sortBy=submittedDate&sortOrder=descending`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) {
        const xml = await r.text();
        for (const m of xml.matchAll(/<summary>([\s\S]*?)<\/summary>/g)) all += ' ' + m[1];
      }
    } catch { /* counted by the caller via sentence yield */ }
    await sleep(3000);   // arXiv asks for 3s between calls
  }
  return all;
}

function writeCell(subject, grade, entries) {
  const dir = path.join(OUT, subject);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `${grade}.json`);
  const byTheme = new Map();
  try {
    const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    for (const e of (prev.experiences || [])) byTheme.set(e.theme, e);
  } catch { /* fresh cell */ }
  // Same-source-id wins, keep-longer across different sources — the rule the
  // Gutenberg ingest learned the hard way when a cleaner fix could not land.
  for (const e of entries) {
    const old = byTheme.get(e.theme);
    const sameSource = old && old.source === e.source;
    if (!old || sameSource || e.story.length > old.story.length) byTheme.set(e.theme, e);
  }
  const merged = [...byTheme.values()];
  fs.writeFileSync(outPath, JSON.stringify({
    version: 1, grade, subject,
    source: 'hybrid: PubMed Central Open Access full text + arXiv abstracts + prior sources, cleaned + sentence-segmented',
    note: `Research-literature corpus for ${subject}/${grade}. Trained via curriculum._trainAcademicStories. A graduate year reads papers, not a bigger textbook.`,
    experiences: merged,
  }, null, 2), 'utf8');
  return merged.length;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0];
let grandWords = 0;
for (const grade of GRADES) {
  if (only && grade !== only) continue;
  for (const [subject, src] of Object.entries(SOURCES)) {
    if (!src.pmc && !src.arxiv.length) {
      console.log(`  ${subject}/${grade} — NO LANE (no open-access research archive for this subject; stated, not filled)`);
      continue;
    }
    const entries = [];
    if (src.pmc) {
      const ids = await pmcIds(src.pmc, PMC_ARTICLES);
      await sleep(1200);
      const got = ids.length ? await pmcArticles(ids) : { xml: '', figures: [], figStats: null };
      const xml = got.xml;
      // Every paper whole — the 4,000-sentence cap that stood here truncated the
      // batch after downloading all of it.
      const sents = cleanSentences(xml, Infinity);
      if (sents.length >= 20) {
        const entry = {
          theme: `papers-${subject}`,
          story: sents.join(' '),
          source: 'pmc-oa',
          licence: 'open-access-subset (CC-BY / CC-BY-SA / CC0)',
        };
        // Attached only when non-empty — an empty array on every entry would
        // read as "figures were looked for and none exist" on the cells this
        // lane wrote before it could see figures at all, which is a different
        // and false claim.
        if (got.figures.length) entry.figures = got.figures;
        entries.push(entry);
        const s = got.figStats;
        // ⛔ THE FIGURE LINE NAMES EVERY STAGE, because this lane shipped for
        // weeks reporting nothing at all: 21M words of the two largest sources
        // in the corpus with ZERO figures, and no counter anywhere that would
        // have said so. A number that only ever prints its successes cannot
        // tell "this source has no figures" from "my harvester is broken".
        const figLine = s
          ? ` | figures: ${s.resolved} bound from ${s.declared} declared across ${s.withFigs}/${s.articles} illustrated articles`
            + `${s.unresolved ? `, ${s.unresolved} UNRESOLVED (no blob url on the article page)` : ''}`
            + `${s.noAnchor ? `, ${s.noAnchor} dropped with no caption and no in-text reference` : ''}`
          : '';
        console.log(`  ${subject}/${grade} — PMC full text: ${ids.length} articles -> ${sents.length} sentences${figLine}`);
      } else {
        console.log(`  ${subject}/${grade} — PMC full text: ${ids.length} articles -> only ${sents.length} usable sentences, not written`);
      }
    }
    if (src.arxiv.length) {
      const raw = await arxivAbstracts(src.arxiv, ARXIV_ABSTRACTS);
      const sents = cleanSentences(raw, Infinity);
      if (sents.length >= 20) {
        entries.push({
          theme: `abstracts-${subject}`,
          story: sents.join(' '),
          source: 'arxiv',
          licence: 'arxiv-metadata-reuse',
        });
        console.log(`  ${subject}/${grade} — arXiv abstracts [${src.arxiv.join(', ')}] -> ${sents.length} sentences`);
      } else {
        console.log(`  ${subject}/${grade} — arXiv abstracts -> only ${sents.length} usable sentences, not written`);
      }
    }
    if (!entries.length) continue;
    const home = cellFor(subject);
    const n = writeCell(home, grade, entries);
    const w = entries.reduce((a, e) => a + e.story.split(/\s+/).length, 0);
    grandWords += w;
    const routed = home === subject ? '' : `  [routed: ${subject} retires at grade12, its literature belongs to ${home} at this band]`;
    console.log(`  -> ${home}/${grade}.json (cell now ${n} entries, +${w.toLocaleString()} words this run)${routed}`);
  }
}
console.log(`[research] DONE — ${grandWords.toLocaleString()} words of open-access literature written under corpora/academic/.`);
