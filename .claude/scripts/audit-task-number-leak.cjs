// audit-task-number-leak.cjs — DOES ANY SOURCE COMMENT NAME A TICKET?
//
// The LAW: task numbers, session IDs and milestone IDs live in `docs/TODO.md`,
// `docs/FINALIZED.md`, `docs/RESUME.md`, `.claude/*.md` and commit messages —
// nowhere else. A brain document, and a source comment, names the MECHANISM.
// A reader cannot look up `WALKCOST.2`.
//
// ⛔⛔ THIS FILE EXISTS BECAUSE THREE EARLIER DETECTORS PRODUCED CONFIDENT WRONG
// ANSWERS, AND TWO OF THE THREE ERRED *CLEAN* — the direction that gets a defect
// closed instead of fixed. Recorded so nobody rebuilds one of them:
//
//   ① "any ALLCAPS token >= 4 chars"  -> 9,905. It was matching this codebase's
//      own shouted emphasis (`⛔ THE MEASUREMENT THAT FORCED THIS`). An ALLCAPS
//      word is not evidence of a ticket.
//   ② a namespace pattern built in a shell -> 0 tickets, briefly believed.
//      `'\\b'` written through a shell into `node -e` collapses to a JS
//      BACKSPACE CHARACTER, not a word boundary. A heredoc ate the backslashes
//      the same way. Hence: this is a FILE, written with a real editor.
//   ③ a namespace pattern plus a HAND-PICKED "also an English word" list
//      -> 2,747. The list had 8 entries and English has rather more, so
//      `// a self she couldn't SPEAK` was filed as a LAW violation because
//      `SPEAK` is also a ticket stem. A hand list cannot enumerate a language.
//
// ⭐ WHAT WORKS, AND WHY IT KEEPS WORKING — derive BOTH halves, then self-test:
//   • The ticket NAMESPACE comes from the board and the ledger, so it is the
//     actual namespace rather than a guess at one.
//   • Whether a stem is ALSO an ordinary English word is answered by the corpus
//     she is taught from. Those stems count only with a `.N` suffix, because
//     `// PAINT is a word` is prose and `// PAINT.5` is a ticket. The oracle
//     grows with the corpus instead of with anyone's memory.
//   • The scanner REFUSES TO RUN if its own self-test fails.
//
// READ-ONLY. Writes nothing, edits nothing.
//
// RUN:  node .claude/scripts/audit-task-number-leak.cjs           # summary + per-file counts
//       node .claude/scripts/audit-task-number-leak.cjs --lines 8 # print offending lines for files with <= 8
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCAN_ROOTS = ['server', 'js'];
const NAMESPACE_DOCS = ['docs/TODO.md', 'docs/FINALIZED.md'];
const ENGLISH_CORPORA = ['corpora/academic', 'corpora/life'];

function readIf(p) { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return ''; } }

// ── half one: the ticket namespace, from the board and the ledger ────────────
const stems = new Set();
for (const d of NAMESPACE_DOCS) {
  for (const m of readIf(d).matchAll(/\b([A-Z][A-Z0-9]{2,})\.[0-9A-Z]+\b/g)) stems.add(m[1]);
}
if (stems.size < 50) {
  console.error(`ABORT — only ${stems.size} ticket stems parsed from the board. That is not a namespace, it is a broken read.`);
  process.exit(1);
}

// ── half two: which of those are ordinary English, per the corpus she reads ──
const words = new Set();
(function walkCorpus(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walkCorpus(p); continue; }
    if (!e.name.endsWith('.json')) continue;
    try {
      for (const ex of (JSON.parse(fs.readFileSync(p, 'utf8')).experiences || [])) {
        for (const w of String(ex.story || '').toLowerCase().split(/\s+/)) {
          const c = w.replace(/[^a-z]/g, '');
          if (c.length >= 3) words.add(c);
        }
      }
    } catch { /* skip unreadable cell */ }
  }
})(path.join(ROOT, ENGLISH_CORPORA[0]));
(function walkLife(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walkLife(p); continue; }
    if (!e.name.endsWith('.json')) continue;
    try {
      for (const ex of (JSON.parse(fs.readFileSync(p, 'utf8')).experiences || [])) {
        for (const w of String(ex.story || '').toLowerCase().split(/\s+/)) {
          const c = w.replace(/[^a-z]/g, '');
          if (c.length >= 3) words.add(c);
        }
      }
    } catch { /* skip */ }
  }
})(path.join(ROOT, ENGLISH_CORPORA[1]));

const safe = [], risky = [];
for (const s of stems) (words.has(s.toLowerCase()) ? risky : safe).push(s);
safe.sort(); risky.sort();

const RE = new RegExp('\\b(' + safe.join('|') + ')(\\.[0-9A-Z]+)?\\b');
const RISKY = risky.length ? new RegExp('\\b(' + risky.join('|') + ')\\.[0-9A-Z]+\\b') : /$^/;

// ── the self-test. A clean answer from a broken matcher is the failure mode. ──
const SELF = [
  ['// WALKCOST.2 blah', true],
  ['// nothing to see here', false],
  ['// PAINT is an ordinary word here', false],
];
for (const [line, want] of SELF) {
  if (RE.test(line) !== want) {
    console.error(`ABORT — SELF-TEST FAILED on ${JSON.stringify(line)} (wanted ${want}). The matcher is broken; its count would be a lie.`);
    process.exit(1);
  }
}

function walkSource(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (/node_modules|\.git/.test(p)) continue; walkSource(p, out); }
    else if (/\.(js|cjs|mjs)$/.test(e.name) && !/app\.bundle|\.bundle\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

const LINES_CAP = process.argv.includes('--lines')
  ? Number(process.argv[process.argv.indexOf('--lines') + 1] || 8)
  : 0;

const files = SCAN_ROOTS.flatMap((r) => walkSource(path.join(ROOT, r)));
let tick = 0, risk = 0, quote = 0;
const per = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  let t = 0, r = 0, q = 0;
  const hits = [];
  lines.forEach((l, i) => {
    const c = l.trim();
    if (!(c.startsWith('//') || c.startsWith('*') || c.startsWith('/*'))) return;
    // ⛔⛔ AN EDUCATION-STANDARD CODE IS DOMAIN CONTENT, NOT A TICKET, AND THIS
    // DETECTOR CANNOT TELL THEM APART WITHOUT BEING TOLD. `K.NBT.1` is the
    // Common Core code for kindergarten base-ten, and `NBT` is ALSO a ticket
    // stem in this project — so a curriculum file naming the standard it
    // implements was being reported as a LAW violation, and the only way to
    // "fix" it would have been to delete the one identifier that says which
    // standard the code satisfies.
    //
    // The shape is what separates them: a standard is anchored to a GRADE
    // (`K.` or a digit) or is a known strand prefix, and it is exactly the
    // reference a curriculum comment is supposed to carry.
    //   Common Core maths  K.NBT.1 · 1.OA.3 · 5.NF.2
    //   Common Core ELA    RF.K.1 · L.1.2 · RL.3.4 · W.2.1 · SL.K.3
    //   NGSS science       K-LS1-1 · 3-PS2-1 · MS-ESS1-4
    // ⚠ Deliberately narrow. It requires the grade anchor, so a bare ticket
    // like `NBT.1` is still caught — the exemption is for the standard's SHAPE,
    // never for the stem, and widening it would blind the detector to a whole
    // namespace.
    if (/\b(?:[K1-9]|1[0-2])\.[A-Z]{1,4}\.[0-9]+[a-z]?\b/.test(c)
      || /\b(?:RF|RL|RI|SL|W|L)\.[K0-9]+\.[0-9]+[a-z]?\b/.test(c)
      || /\b(?:K|[1-5]|MS|HS)-[A-Z]{2,4}[0-9]?-[0-9]+\b/.test(c)) return;
    if (RE.test(c)) { t++; hits.push([i + 1, l]); return; }
    if (RISKY.test(c)) { r++; hits.push([i + 1, l]); return; }
    if (/\bGee\b/.test(c)) { q++; hits.push([i + 1, l]); }
  });
  if (t + r + q) {
    tick += t; risk += r; quote += q;
    per.push([path.relative(ROOT, f), t, r, q, hits]);
  }
}
per.sort((a, b) => (b[1] + b[2] + b[3]) - (a[1] + a[2] + a[3]));

console.log('TASK-NUMBER LEAK — source comments naming a ticket instead of a mechanism\n');
console.log(`  namespace: ${stems.size} ticket stems from the board + ledger`);
console.log(`  oracle   : ${words.size.toLocaleString()} distinct corpus words -> ${risky.length} stems are ALSO ordinary English`);
console.log(`             (those count only with a .N suffix): ${risky.join(', ')}\n`);
console.log(`  TICKET comment lines            : ${tick}`);
console.log(`  RISKY-STEM lines (TAG.N only)   : ${risk}`);
console.log(`  verbatim 'Gee' lines, no ticket : ${quote}`);
console.log(`  TOTAL                           : ${tick + risk + quote}  across ${per.length} files\n`);
console.log('  ⚠ THE UNIT OF PROGRESS IS A WHOLE FILE. A half-swept file still breaks the LAW,');
console.log('     so the file count is the honest measure and the line count is not.\n');
console.log('  tick risk gee  file');
for (const [f, t, r, q] of per) {
  console.log('  ' + String(t).padStart(4) + ' ' + String(r).padStart(4) + ' ' + String(q).padStart(3) + '  ' + f);
}
if (LINES_CAP > 0) {
  console.log(`\n─── offending lines, for files with <= ${LINES_CAP} hits ───`);
  for (const [f, t, r, q, hits] of per) {
    if (t + r + q > LINES_CAP) continue;
    console.log('\n##### ' + f + '  (' + hits.length + ')');
    for (const [n, l] of hits) console.log(n + '|' + l);
  }
}
