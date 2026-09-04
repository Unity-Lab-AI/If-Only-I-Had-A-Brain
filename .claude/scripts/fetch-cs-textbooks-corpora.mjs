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
// ⛔ Contact details are mandatory for Wikimedia hosts (one book here is a
// Wikibook) — without them the API refuses essentially every request
// (0 OK / 6x 429, measured 2026-09-02). It is an identity rejection, not a rate
// limit, so no backoff can clear it. Not UA forgery: the agent still says
// exactly what it is and who runs it, and adds the contact the host asks for.
const UA = 'UnityBrainCurriculum/1.0 (https://github.com/Unity-Lab-AI/If-Only-I-Had-A-Brain; contact@unityailab.com) node-fetch educational-research';

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
  // ⛔⛔ THE THREE ND BOOKS — ADMITTED 2026-09-02 ON THE OPERATOR'S RULING, AND
  // THEY ARE THE ONLY GOOD SOURCES FOR THE TWO COURSES THAT HAD NONE.
  //
  // Gee: *"yeah we arent distributing we are reading it but we have to store a
  // copy of it to 'read' it"* — and on the box that is literally the case:
  // `deploy.yml` excludes `corpora` from the public pages web root, so the
  // corpus lands in the BACKEND directory and is served to nobody. It is
  // training material she reads, not a page anyone can fetch.
  //
  // ⚠ Recorded as ND per entry, with the source URL, so the corpus never
  // misrepresents what these are.
  {
    label: 'Introduction to Theoretical Computer Science',
    base: 'https://introtcs.org/public/',
    index: 'index.html',
    licenceUrl: 'https://introtcs.org/public/index.html',
    linkRe: /href="(lec_[0-9a-z_]+\.html)"/gi,
    subject: 'cstheory', grade: 'college3',    // Theory of Computation
  },
  {
    label: 'Dive Into Systems',
    base: 'https://diveintosystems.org/book/',
    index: 'index.html',
    licenceUrl: 'https://diveintosystems.org/book/copyright.html',
    linkRe: /href="([A-Za-z0-9\-_]+\/[a-z0-9_]+\.html)"/gi,
    subject: 'cssystems', grade: 'college2',   // Computer Architecture
  },
  {
    label: 'An Introduction to Computer Networks',
    base: 'https://intronetworks.cs.luc.edu/current2/html/',
    index: '',
    licenceUrl: 'https://intronetworks.cs.luc.edu/current2/html/preface.html',
    linkRe: /href="([a-z][a-zA-Z0-9_]*\.html)"/gi,
    subject: 'cssystems', grade: 'college4',   // Networks and Compilers
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
  // ⭐⭐ THE THREE `major` CELLS THAT HAD NO BOOK AT ALL — added 2026-09-04.
  //
  // Measured off the corpus, not assumed: `major/college2`, `college3` and
  // `college4` held ZERO entries from this lane and owed 177,101 / 180,954 /
  // 205,742 words. Only `major/college1` had ever been given a book, so the
  // subject that IS her degree was the least-fed one in the roster.
  //
  // ⚠ EVERY FIELD BELOW WAS READ OFF THE LIVE PAGE, NOT GUESSED. A wrong
  // `linkRe` fails SILENTLY here — the Composing Programs note twenty lines up
  // records exactly that, seven 404s and zero sentences — so each book's real
  // link shape was fetched and inspected first, and each licence URL was
  // confirmed to carry a machine-readable `creativecommons.org/licenses/...`
  // slug, because `licenceOf` refuses anything that does not.
  {
    label: 'Eloquent JavaScript',
    base: 'https://eloquentjavascript.net/',
    index: 'index.html',
    licenceUrl: 'https://eloquentjavascript.net/index.html',   // CC BY-NC 3.0, confirmed
    linkRe: /href="([0-9]{2}_[a-z_]+\.html)"/gi,
    subject: 'major', grade: 'college2',
  },
  {
    label: 'Think Java (2nd edition)',
    base: 'https://greenteapress.com/thinkjava7/html/',
    index: 'index.html',
    // ⚠ The licence lives on the INDEX, not the preface — the preface page
    // carries no CC slug at all and would have been refused as undeclared.
    licenceUrl: 'https://greenteapress.com/thinkjava7/html/index.html',   // CC BY-NC-SA, confirmed
    linkRe: /href="(chapter-[0-9]+\.html)"/gi,
    subject: 'major', grade: 'college3',
  },
  {
    label: 'Automate the Boring Stuff with Python',
    base: 'https://automatetheboringstuff.com/2e/',
    index: '',
    licenceUrl: 'https://automatetheboringstuff.com/2e/chapter0/',   // CC BY-NC-SA, confirmed
    // Absolute paths with a trailing slash, no `.html` anywhere — the capture
    // keeps the leading slash so it resolves against the origin.
    linkRe: /href="(\/2e\/chapter[0-9]+\/)"/gi,
    subject: 'major', grade: 'college4',
  },

  // ══ SECOND BOOKS, ADDED 2026-09-04 ═══════════════════════════════════════
  //
  // ⛔ THE MEASUREMENT THAT PROVOKED THESE, AND IT CORRECTED THIS ROW'S OWN
  // PREMISE. Every `cstheory` and `major` cell ALREADY HAD A BOOK — the board
  // read them as starved and the real state was "fed once". Measured against the
  // 330,000-word college floor:
  //
  //     cstheory college1 147,567   college2 116,840   college3 247,033   college4 155,686
  //     major    college1 124,402   college2 249,080   college3 194,817   college4 237,406
  //
  // **One book is not a college year.** So the fix is not a new host and not a
  // new lane — it is a SECOND book in the cells that own the debt. Together
  // `cstheory` and `major` are 1,167,169 of the 1,999,649 words still owed
  // across the whole corpus: 58% of the remaining debt in two subjects.
  //
  // ⭐ EVERY FIELD BELOW WAS READ OFF THE LIVE PAGE, because a wrong `linkRe`
  // yields zero sentences and reports success — the failure this file has taken
  // twice already (Composing Programs' `../`, Open Data Structures' one-level-
  // down sections). The index of each book was fetched, its local hrefs
  // extracted, and the pattern derived from the actual link shapes.
  //
  // ⛔ AND THE LICENCE WAS READ AS A LINK, NOT AS PROSE. `creativecommons.org/
  // licenses/<slug>` is unambiguous; the phrase "Creative Commons license" in a
  // paragraph is not, and cannot tell NoDerivatives from anything else.
  //     Think Python 2e       by-nc 3.0      (on the WP landing page, NOT the html index)
  //     Think Complexity 2e   by-nc-sa 4.0   (on the WP landing page, NOT the html index)
  //     Think OS              by-nc-sa 4.0   (on the html index)
  //     Think Stats 2e        by-nc-sa 4.0   (on the html index)
  //     Think Bayes           by-nc-sa 4.0   (on the html index)
  //
  // ⛔ REFUSED IN THE SAME PASS, RECORDED SO NOBODY RE-WALKS IT:
  //     Think Data Structures — its page claims "a Creative Commons license" in
  //     prose and publishes NO machine-readable licence link anywhere. ND status
  //     is therefore unverifiable, and this corpus republishes a cleaned,
  //     excerpted adaptation. **An unverifiable licence is a refusal, not a
  //     rounding error** — one 19-chapter book is not worth an unchecked claim.
  //     Erickson's *Algorithms* (CC-BY 4.0, genuinely usable) is PDF-only: its
  //     index carries two HTML links total, so there is no chapter walk to do.
  {
    label: 'Think Python (2nd edition)',
    base: 'https://greenteapress.com/thinkpython2/html/',
    index: 'index.html',
    // ⚠ The html index carries NO licence link at all. The declaration lives on
    // the book's landing page — the same shape as Think Java above, and the
    // exact case this file's header records as "the best of the set".
    licenceUrl: 'https://greenteapress.com/wp/think-python-2e/',   // CC BY-NC 3.0, read as a link
    linkRe: /href="(thinkpython2[0-9]+\.html)"/gi,
    subject: 'major', grade: 'college1',       // beside Composing Programs
  },
  {
    label: 'Think Complexity (2nd edition)',
    base: 'https://greenteapress.com/complexity2/html/',
    index: 'index.html',
    licenceUrl: 'https://greenteapress.com/wp/think-complexity-2e/',   // CC BY-NC-SA 4.0, read as a link
    linkRe: /href="(thinkcomplexity2[0-9]+\.html)"/gi,
    subject: 'cstheory', grade: 'college4',    // Advanced Algorithms — complexity is the course
  },
  {
    label: 'Think OS',
    base: 'https://greenteapress.com/thinkos/html/',
    index: 'index.html',
    licenceUrl: 'https://greenteapress.com/thinkos/html/index.html',   // CC BY-NC-SA 4.0, on the index
    linkRe: /href="(thinkos[0-9]+\.html)"/gi,
    subject: 'cssystems', grade: 'college3',   // Operating Systems — an exact course match
  },
  {
    label: 'Think Stats (2nd edition)',
    base: 'https://greenteapress.com/thinkstats2/html/',
    index: 'index.html',
    licenceUrl: 'https://greenteapress.com/thinkstats2/html/index.html',   // CC BY-NC-SA 4.0, on the index
    linkRe: /href="(thinkstats2[0-9]+\.html)"/gi,
    subject: 'major', grade: 'college2',
  },
  {
    label: 'Think Bayes',
    base: 'https://greenteapress.com/thinkbayes/html/',
    index: 'index.html',
    licenceUrl: 'https://greenteapress.com/thinkbayes/html/index.html',   // CC BY-NC-SA 4.0, on the index
    linkRe: /href="(thinkbayes[0-9]+\.html)"/gi,
    subject: 'major', grade: 'college3',
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
  // ⛔⛔ THE SLUG WINS, AND THE PROSE IS ONLY A FALLBACK — REVERSED 2026-09-02
  // AFTER IT WROTE A NON-LICENCE INTO THE CORPUS.
  //
  // The prose pattern captures whatever follows the words "Creative Commons",
  // and one book's page reads *"…under the Creative Commons license described
  // below"*. That produced the recorded licence string **"CC license described
  // below"** — a sentence fragment sitting in the field that is supposed to say
  // what may be done with the text, on a book that is actually CC BY-NC-ND.
  //
  // ⭐ The licence-URL slug is machine-readable and unambiguous; the prose is a
  // human sentence that may or may not name the licence. Preferring the sentence
  // over the identifier was backwards. The prose is still used when there is no
  // slug, but only if it actually names a licence component — otherwise this
  // reports that it could not read one, which is a true answer.
  const slug = /creativecommons\.org\/licenses\/([a-z\-]+)/i.exec(html);
  const prose = /Creative Commons\s+([A-Za-z\- ]{0,60})/i.exec(txt);
  const proseNamesALicence = prose && /attribution|zero|public domain|share ?alike|noncommercial|noderiv/i.test(prose[1]);
  const id = slug
    ? `CC-${slug[1].toUpperCase()}`
    : (proseNamesALicence ? `CC ${prose[1].replace(/\s+/g, ' ').trim()}` : null);
  if (!id) return { id: null, ok: false, why: 'no Creative Commons statement found at the licence source' };
  // ⛔⛔ NoDerivatives — ADMITTED UNDER AN EXPLICIT OPERATOR RULING, AND LABELLED
  // AS WHAT IT IS RATHER THAN RELABELLED (2026-09-02).
  //
  // Gee: *"yeah we are only reading it in educational purposes but we have to
  // have a copy to read it this is fair use for education and experimentations
  // open source non profit non commercial"*.
  //
  // ⭐ HE IS RIGHT ABOUT THE PART I HAD FRAMED WRONGLY. **ND does not restrict
  // reading, and it does not restrict copying** — CC BY-NC-ND expressly permits
  // reproducing the work in any medium. The only act it withholds is
  // DISTRIBUTING an adapted version. My earlier note said these books were
  // "unusable", which overstated the licence.
  //
  // ⚠ WHAT IS ACTUALLY EXPOSED, STATED PLAINLY RATHER THAN ARGUED AWAY: the
  // corpus is 189 tracked files that reach the training box only by being pushed
  // to `main`, and one of this project's two remotes is PUBLIC. So the cleaned,
  // segmented text IS published. The fully-compliant alternative — keeping ND
  // cells out of git entirely — was checked and is closed in practice: a
  // gitignored cell never reaches the box, and hand-delivering it over SSH is
  // against this project's own deploy rule.
  //
  // The call is the operator's, on his project, for a non-commercial educational
  // experiment over books that are free to read and whose market this does not
  // displace. ⛔ **What this code must NOT do is launder the label.** The entry
  // keeps its true licence string and its source URL, so anyone reading the
  // corpus can see exactly which works are ND and on what basis they are here.
  const isND = /NoDeriv/i.test(id) || /(^|-)nd(-|$)/i.test(slug ? slug[1] : '');
  if (isND) return { id, ok: true, nd: true, why: 'NoDerivatives — admitted under the operator ruling above; recorded as ND, not relabelled' };
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
