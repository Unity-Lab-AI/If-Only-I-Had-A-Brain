// fetch-code-corpora.mjs — CODE-PROFICIENCY corpus builder (hybrid, like academics).
//
// Gee 2026-06-18: "whats not done is Unity being trained to code proficiently
// in those code types ... can we use a api like thing to train code too she
// needs? like we did education?" — YES. Same hybrid as the academic corpus.
//
// ARCHITECTURE NOTE: Unity's brain is WORD-SEQUENCE based (lowercase a-z GloVe
// token walks). Raw code text (<div>{};) does NOT tokenize cleanly — symbols
// filter out as non-ASCII. So code PROFICIENCY for this brain = (a) UNDERSTANDING
// from concept-PROSE about the languages (trained here), + (b) GENERATION from
// the component-template library (docs/component-templates.txt, the synth).
// This script feeds (a): real openly-licensed coding-concept prose.
//
// SOURCE: Simple/English Wikipedia (CC-BY-SA) — solid articles on HTML, CSS,
// JavaScript, the DOM, functions, variables, algorithms, data structures, etc.
// MERGES into the EXISTING corpora/coding/<grade>.json (already trained by
// curriculum._trainCodingStories, already wired) so the hand-authored
// autobiographical coding memories are PRESERVED and the concept-prose augments
// them — deepening her code understanding, compounding G6->PhD.
//
// RUN:  node .claude/scripts/fetch-code-corpora.mjs            (all grades)
//       node .claude/scripts/fetch-code-corpora.mjs grade9     (one grade)
// Network required. Re-runnable / MERGES (never loses content). Node 18+.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'corpora', 'coding');

const MAX_SENT_PER_TOPIC = 12;
const SENT_MIN = 30, SENT_MAX = 240;
// ⛔ Contact details are mandatory for Wikimedia hosts — without them the API
// refuses essentially every request (0 OK / 6x 429, measured 2026-09-02), and it
// is an identity rejection that no backoff can clear. Not UA forgery: the agent
// still says what it is and who runs it.
const UA = 'UnityBrainCurriculum/1.0 (https://github.com/Unity-Lab-AI/If-Only-I-Had-A-Brain; contact@unityailab.com) node-fetch educational-research';

// grade -> coding-concept Wikipedia topics, COMPOUNDING (HTML -> CSS -> JS ->
// web apps -> CS foundations -> systems -> the brain-sim research at grad/phd).
// FULL G5→PhD CODE-PROFICIENCY PROGRESSION (HTML → CSS → JS → CS depth → the
// brain-sim). Each grade's topics are chosen to comprehensively cover that
// rung's real HTML/CSS/JS proficiency targets (see docs/CODE-CURRICULUM.md for
// the per-grade concept layout). Compounds every grade — earlier rungs are
// assumed known. Trained as concept-PROSE (understanding); GENERATION is the
// exemplar library in docs/component-templates.txt.
const TOPICS = {
  // G5 — what computers/code/programs ARE (gentle intro rung)
  grade5:  ['Computer', 'Computer program', 'Computer programming', 'Software', 'Internet', 'Web page', 'Computer keyboard', 'Code'],
  // G6 — HTML foundations: tags, elements, attributes, document structure, links, images, lists
  grade6:  ['HTML', 'HTML element', 'HTML attribute', 'Web page', 'Web browser', 'Hyperlink', 'World Wide Web', 'Markup language', 'Website', 'Tag (metadata)', 'URL', 'HTML5', 'Web standards', 'Plain text', 'Image file formats'],
  // G7 — CSS foundations + HTML forms/tables: selectors, box model, color, typography, layout
  grade7:  ['Cascading Style Sheets', 'CSS box model', 'Web colors', 'Typography', 'Web design', 'Page layout', 'Form (HTML)', 'Table (information)', 'Style sheet (web development)', 'Web template system', 'CSS Flexible Box Layout', 'CSS Grid Layout', 'Responsive web design', 'Pixel'],
  // G8 — JS foundations + CSS layout: variables, types, operators, control flow, flexbox
  grade8:  ['JavaScript', 'Variable (computer science)', 'Data type', 'Control flow', 'Conditional (computer programming)', 'Operator (computer programming)', 'Expression (computer science)', 'Statement (computer science)', 'Source code', 'Integer (computer science)', 'Loop (computing)', 'Comment (computer programming)', 'Debugging', 'Syntax (programming languages)'],
  // G9 — JS core + responsive design: functions, arrays, objects, strings, loops, media queries
  grade9:  ['Subroutine', 'Array (data structure)', 'For loop', 'While loop', 'Object (computer science)', 'String (computer science)', 'Boolean data type', 'Responsive web design', 'Parameter (computer programming)', 'Scope (computer science)', 'Search algorithm', 'Linked list', 'Iteration', 'Value (computer science)'],
  // G10 — DOM + events + web apps: manipulation, listeners, JSON, fetch, storage
  grade10: ['Document Object Model', 'Event (computing)', 'JSON', 'Application programming interface', 'Hypertext Transfer Protocol', 'Web application', 'Ajax (programming)', 'Web storage', 'Callback (computer programming)', 'Client–server model', 'Representational state transfer', 'WebSocket', 'Single-page application', 'Web server'],
  // G11 — ES6 + async + tooling: closures, higher-order fns, promises, modules, git
  grade11: ['ECMAScript', 'Closure (computer programming)', 'Higher-order function', 'Anonymous function', 'Futures and promises', 'Asynchronous I/O', 'Modular programming', 'Version control', 'Git', 'Npm (software)', 'Immutable object', 'Continuous integration', 'Callback (computer programming)', 'Event-driven programming'],
  // G12 — CS foundations + advanced JS/OOP: algorithms, recursion, classes, inheritance, errors
  grade12: ['Algorithm', 'Sorting algorithm', 'Recursion (computer science)', 'Object-oriented programming', 'Class (computer programming)', 'Inheritance (object-oriented programming)', 'Exception handling', 'Data structure', 'Functional programming', 'Computational complexity', 'Time complexity', 'Greedy algorithm', 'Software testing', 'Polymorphism (computer science)'],
  // College — CS core, discrete/algorithms, systems/data, software engineering/security
  college1: ['Computer science', 'Data structure', 'Algorithm', 'Abstraction (computer science)', 'Programming paradigm', 'Software design pattern', 'Compiler', 'Programming language', 'Stack (abstract data type)', 'Queue (abstract data type)', 'Binary tree', 'Pointer (computer programming)'],
  college2: ['Discrete mathematics', 'Graph theory', 'Computational complexity theory', 'Big O notation', 'Dynamic programming', 'Hash table', 'Tree (data structure)', 'Linear algebra', 'Breadth-first search', 'Depth-first search', "Dijkstra's algorithm", 'Recurrence relation'],
  college3: ['Operating system', 'Computer network', 'Database', 'SQL', 'Concurrency (computer science)', 'Cache (computing)', 'Process (computing)', 'Statistics', 'Relational database', 'Thread (computing)', 'Internet protocol suite', 'Database index'],
  college4: ['Software engineering', 'Software testing', 'Software design pattern', 'Cryptography', 'Computer security', 'Web framework', 'Continuous integration', 'Distributed computing', 'Unit testing', 'Public-key cryptography', 'Hash function', 'Model–view–controller'],
  // Grad/PhD — ML + numerical + the brain-sim (her thesis: building a brain)
  grad:     ['Machine learning', 'Numerical analysis', 'Artificial neural network', 'Optimization problem', 'Gradient descent', 'Linear algebra', 'Computer simulation', 'Artificial intelligence', 'Backpropagation', 'Supervised learning', 'Convolutional neural network', 'Loss function'],
  phd:      ['Computational neuroscience', 'Artificial neural network', 'Deep learning', 'Neuron', 'Hebbian theory', 'Spiking neural network', 'Machine learning', 'Cognitive science', 'Synaptic plasticity', 'Recurrent neural network', 'Reinforcement learning', 'Action potential'],
};

function clean(extract) {
  if (!extract) return [];
  let t = extract
    .replace(/===?[^=]+===?/g, ' ')        // section headers
    .replace(/\[[0-9]+\]/g, ' ')           // ref markers
    .replace(/\([^)]*\)/g, ' ')            // parentheticals
    .replace(/\s+/g, ' ');
  const out = [];
  for (let s of t.split(/(?<=[.!?])\s+/)) {
    s = s.trim();
    if (s.length < SENT_MIN || s.length > SENT_MAX) continue;
    if (/[^\x20-\x7e]/.test(s)) continue;          // ASCII only (brain is a-z)
    if (/may refer to|disambiguation|listen|born|\bb\.\b/i.test(s)) continue;
    if (!/[a-z]/.test(s) || !/[.!?]$/.test(s)) continue;
    out.push(s.toLowerCase());
    if (out.length >= MAX_SENT_PER_TOPIC) break;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchExtract(title) {
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const host of ['en.wikipedia.org', 'simple.wikipedia.org']) {
      const url = `https://${host}/w/api.php?format=json&action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`;
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) continue;
        const j = await r.json();
        const pages = j?.query?.pages || {};
        for (const k of Object.keys(pages)) {
          const sents = clean(pages[k].extract);
          if (sents.length >= 3) return sents;
        }
      } catch { /* try next host / retry */ }
    }
    await sleep(700 * (attempt + 1));
  }
  return [];
}

async function buildGrade(grade, titles) {
  const fresh = [];
  for (const title of titles) {
    const sents = await fetchExtract(title);
    if (sents.length) {
      fresh.push({ theme: 'concept-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), story: sents.join(' ') });
      process.stdout.write(`  coding/${grade}: ${title} (${sents.length})\n`);
    } else {
      process.stdout.write(`  coding/${grade}: ${title} — no usable content, skipped\n`);
    }
    await sleep(700);
  }
  if (fresh.length === 0) return 0;

  const outPath = path.join(OUT, `${grade}.json`);
  // MERGE into the existing hand-authored coding corpus — union by theme,
  // keep the longer story. Preserves the bespoke autobiographical entries
  // ("i learned html on grandpa's computer") AND the new concept-prose.
  // Monotonic: a re-run can only ADD coverage (the wiki API throttles to
  // empty under load, same lesson as the academic ingest).
  const byTheme = new Map();
  let prevDoc = null;
  try {
    prevDoc = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    for (const e of (prevDoc.experiences || [])) byTheme.set(e.theme, e);
  } catch { /* no prior file — fresh grade */ }
  for (const e of fresh) {
    const old = byTheme.get(e.theme);
    if (!old || e.story.length > old.story.length) byTheme.set(e.theme, e);
  }
  const merged = [...byTheme.values()];

  fs.mkdirSync(OUT, { recursive: true });
  const doc = {
    version: (prevDoc?.version || 1),
    grade,
    domain: 'coding',
    note: (prevDoc?.note || `Code-proficiency corpus for ${grade}. Hand-authored coding memories + concept-prose (Simple/English Wikipedia, CC-BY-SA, cleaned) — trained via curriculum._trainCodingStories. Understanding half; generation half is the component-template library.`),
    experiences: merged,
  };
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf8');
  const n = merged.reduce((a, e) => a + e.story.split(/(?<=[.!?])\s+/).length, 0);
  return n;
}

const [argGrade] = process.argv.slice(2);
let total = 0;
for (const grade of Object.keys(TOPICS)) {
  if (argGrade && grade !== argGrade) continue;
  console.log(`[code] ${grade} ...`);
  total += await buildGrade(grade, TOPICS[grade]);
}
console.log(`[code] DONE — ~${total} sentences across corpora/coding/ (concept-prose merged with hand-authored coding memories).`);
