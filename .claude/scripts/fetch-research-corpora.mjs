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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'corpora', 'academic');
const UA = 'UnityBrainCurriculum/1.0 (educational research; open-access literature)';

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
const PMC_ARTICLES = 400;      // full-text papers per subject per band — each taken whole
const ARXIV_ABSTRACTS = 3000;  // abstracts per subject per band

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
    if (/^(figure|fig|table|supplementary|appendix)\b/i.test(s)) continue;
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

async function pmcFullText(ids) {
  // efetch takes a comma list; batches of 10 keep each response readable and
  // stay well inside NCBI's rate guidance.
  const out = [];
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10).join(',');
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${batch}&rettype=xml`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) out.push(await r.text());
    } catch { /* a dead batch is a dead batch; the count reports it */ }
    await sleep(1200);
  }
  return out.join(' ');
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
      const xml = ids.length ? await pmcFullText(ids) : '';
      // Every paper whole — the 4,000-sentence cap that stood here truncated the
      // batch after downloading all of it.
      const sents = cleanSentences(xml, Infinity);
      if (sents.length >= 20) {
        entries.push({
          theme: `papers-${subject}`,
          story: sents.join(' '),
          source: 'pmc-oa',
          licence: 'open-access-subset (CC-BY / CC-BY-SA / CC0)',
        });
        console.log(`  ${subject}/${grade} — PMC full text: ${ids.length} articles -> ${sents.length} sentences`);
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
