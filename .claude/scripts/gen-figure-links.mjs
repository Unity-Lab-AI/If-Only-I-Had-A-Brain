// gen-figure-links.mjs — THE JOIN TABLE BETWEEN THE TEXTS AND THE WAVES.
//
// ⛔ WHY THIS FILE HAS TO EXIST IN THE REPOSITORY. Each field already carries its
// own `links[]`, so wave → text works from any single field. **Text → wave did
// not.** With only the fields and the corpus, answering "which waves belong to
// this cell?" means opening all 31,572 field files, and answering "what does this
// figure look like?" means knowing to hash its url. Neither is discoverable by
// someone handed the repository.
//
// This writes the join once, as data: one row per CITATION — not per figure —
// because a plate cited by two cells is one wave with two sets of referencing
// words, and the row that matters is the citation.
//
// ⭐ It is generated from the CORPUS ALONE and needs no field to exist yet, so it
// is complete and correct before, during and after the field upload.
//
// RUN:  node .claude/scripts/gen-figure-links.mjs [--out <BrainWaves dir>]
// Offline.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const OUT = path.resolve(argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : path.join(ROOT, '..', 'BrainWaves'));

// The SAME hash the fields are named with. If these two ever disagree the join
// silently points at nothing, so it is copied verbatim rather than imported —
// this script must keep working if the ingest script moves.
function figKey(url) {
  let h = 5381;
  const s = String(url || '');
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const root = path.join(ROOT, 'corpora', 'academic');
const rows = [];
const perFigure = new Map();
for (const sub of fs.readdirSync(root)) {
  const sd = path.join(root, sub);
  if (!fs.statSync(sd).isDirectory()) continue;
  for (const f of fs.readdirSync(sd)) {
    if (!f.endsWith('.json')) continue;
    const grade = f.replace(/\.json$/, '');
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(sd, f), 'utf8')); } catch { continue; }
    for (const e of (d.experiences || [])) {
      for (const g of (e.figures || [])) {
        const url = g.url || g.src;
        if (!url || !/^https?:/i.test(url)) continue;
        const key = figKey(url);
        const ctx = String(g.context || '');
        rows.push({
          // where the words are
          subject: sub, grade, theme: e.theme || null,
          source: e.source || null, licence: e.licence || null,
          // the words themselves
          alt: g.alt || null, caption: g.caption || null, context: ctx || null,
          // where the wave is
          key, field: `fields/${key.slice(0, 2)}/${key}.field.json`, url,
        });
        perFigure.set(key, (perFigure.get(key) || 0) + 1);
      }
    }
  }
}

rows.sort((a, b) => (a.subject === b.subject
  ? (a.grade === b.grade ? (a.key < b.key ? -1 : 1) : (a.grade < b.grade ? -1 : 1))
  : (a.subject < b.subject ? -1 : 1)));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'LINKS.jsonl'), `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');

const anchored = rows.filter((r) => (r.context || '').length >= 40).length;
const cells = new Set(rows.map((r) => `${r.subject}/${r.grade}`)).size;
const multi = [...perFigure.values()].filter((n) => n > 1).length;

// A tiny per-cell roll-up, so "what does this cell cite?" needs no scan at all.
const byCell = {};
for (const r of rows) {
  const k = `${r.subject}/${r.grade}`;
  (byCell[k] = byCell[k] || { citations: 0, figures: new Set() });
  byCell[k].citations++;
  byCell[k].figures.add(r.key);
}
fs.writeFileSync(path.join(OUT, 'LINKS-by-cell.json'), `${JSON.stringify({
  version: 1,
  note: 'Per-cell roll-up of LINKS.jsonl — how many figure citations each (subject, grade) cell makes and '
    + 'how many DISTINCT waves that is. The two differ wherever a cell cites the same plate twice.',
  cells: Object.fromEntries(Object.entries(byCell).sort().map(([k, v]) => [k, { citations: v.citations, distinctFigures: v.figures.size }])),
}, null, 1)}\n`, 'utf8');

console.log(`[links] citations          ${rows.length.toLocaleString()}`);
console.log(`[links] distinct figures   ${perFigure.size.toLocaleString()}   (${multi.toLocaleString()} cited more than once)`);
console.log(`[links] cells covered      ${cells}`);
console.log(`[links] with anchor text   ${anchored.toLocaleString()} (${Math.round(100 * anchored / rows.length)}%)`);
console.log(`[links] -> ${path.join(OUT, 'LINKS.jsonl')}  (${(fs.statSync(path.join(OUT, 'LINKS.jsonl')).size / 1048576).toFixed(1)} MB)`);
console.log(`[links] -> ${path.join(OUT, 'LINKS-by-cell.json')}`);
