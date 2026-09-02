// fetch-vp8-tables.mjs — DERIVE THE VP8 CONSTANT TABLES FROM THE NORMATIVE SPEC.
//
// ⛔⛔ WHY THIS SCRIPT EXISTS AT ALL, AND WHY THE TABLES ARE NOT TYPED BY HAND.
//
// A WebP `VP8 ` chunk is a lossy VP8 key frame, and decoding one needs about
// 3,300 constants: two 128-entry quantizer lookups, two 1,056-entry coefficient
// probability tables, a 900-entry key-frame sub-block mode table, and a handful
// of small ones. Every single value feeds a shared arithmetic decoder, so ONE
// wrong number does not degrade the picture — it desynchronises the bit stream
// and every macroblock after it is noise.
//
// ⭐ THE REASON THIS IS DERIVED RATHER THAN RECALLED IS A MEASURED MISTAKE, NOT
// CAUTION IN THE ABSTRACT. Writing `default_coeff_probs` out from memory
// produced a table that began `253, 136, 254, ...`. The spec's table begins with
// an entire band of `128`s, and `253, 136, 254` is band **1**. Every coefficient
// would have been read one band out of position. The same pattern this project
// keeps paying for: confident, well-formed, and wrong, with nothing to error on.
//
// The derivation is checked, not trusted. Each table declares the exact count it
// must yield and a MISMATCH IS FATAL — no partial write, no silent fallback,
// because a short table would still parse and still produce garbage.
//
// ⚠ TWO EXTRACTION TRAPS, BOTH HIT AND BOTH GUARDED HERE:
//   • An RFC text file is PAGINATED. `RFC 6386`, `[Page 95]` and `November 2011`
//     all contain digits, and a naive scan folds them into the data — that is
//     what first produced 1,072 values for a 1,056-entry table.
//   • The reference source LABELS ITS ROWS IN COMMENTS — `/* left mode 3 */` —
//     so comment digits become table entries. That inflated the 900-entry mode
//     table to 1,010.
//
// SOURCE:  RFC 6386, "VP8 Data Format and Decoding Guide" (IETF, November 2011).
// LICENCE: the RFC's code components are BSD-licensed (Copyright (c) 2010, 2011,
//          Google Inc.), under the IETF Trust's Code Components terms. The same
//          licence class as the CMU Pronouncing Dictionary this corpus already
//          derives its phonics inventory from.
//
// RUN:  node .claude/scripts/fetch-vp8-tables.mjs
// Network required. Re-runnable / idempotent. Node 18+.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'server', 'vp8-tables.json');
const SPEC = 'https://www.rfc-editor.org/rfc/rfc6386.txt';
const UA = 'UnityBrainCurriculum/1.0 (educational research; https://www.unityailab.com; contact@unityailab.com)';

// Page furniture. Stripped BEFORE any digit is read, never after.
const isFurniture = (s) => /\[Page \d+\]/.test(s) || /^RFC 6386/.test(s) || /\f/.test(s) || /^Bankoski/.test(s);

// Every table this decoder needs, with the count that proves the extraction.
// The counts are the DECLARED dimensions from the spec, multiplied out.
const WANTED = [
  { name: 'dc_qlookup',          decl: /const\s+int\s+dc_qlookup\s*\[/,                     count: 128 },
  { name: 'ac_qlookup',          decl: /const\s+int\s+ac_qlookup\s*\[/,                     count: 128 },
  { name: 'default_coeff_probs', decl: /const\s+Prob\s+default_coeff_probs\s*\[/,           count: 4 * 8 * 3 * 11 },
  { name: 'coeff_update_probs',  decl: /const\s+Prob\s+coeff_update_probs\s*\[/,            count: 4 * 8 * 3 * 11 },
  { name: 'kf_b_mode_probs',     decl: /static\s+const\s+unsigned\s+char\s+kf_b_mode_probs\s*\[/, count: 10 * 10 * 9 },
  { name: 'kf_ymode_prob',       decl: /const\s+Prob\s+kf_ymode_prob\s*\[/,                 count: 4 },
  { name: 'kf_uv_mode_prob',     decl: /const\s+Prob\s+kf_uv_mode_prob\s*\[/,               count: 3 },
  { name: 'coeff_bands',         decl: /const\s+int\s+coeff_bands\s*\[16\]/,                count: 16 },
  { name: 'zigzag',              decl: /static\s+const\s+unsigned\s+int\s+zigzag\s*\[16\]/, count: 16 },
];

// The extra-bits probabilities for the six coefficient categories. The spec
// zero-terminates each one, so the trailing 0 is dropped by count.
const CATS = [
  { name: 'Pcat1', decl: /const\s+Prob\s+Pcat1\s*\[/, count: 1 },
  { name: 'Pcat2', decl: /const\s+Prob\s+Pcat2\s*\[/, count: 2 },
  { name: 'Pcat3', decl: /const\s+Prob\s+Pcat3\s*\[/, count: 3 },
  { name: 'Pcat4', decl: /const\s+Prob\s+Pcat4\s*\[/, count: 4 },
  { name: 'Pcat5', decl: /const\s+Prob\s+Pcat5\s*\[/, count: 5 },
  { name: 'Pcat6', decl: /const\s+Prob\s+Pcat6\s*\[/, count: 11 },
];

function extract(lines, decl, name, count, dropTrailingZero) {
  const start = lines.findIndex((l) => decl.test(l));
  if (start < 0) throw new Error(`${name}: declaration not found in the spec — the RFC's own naming changed, do NOT guess a replacement`);
  const body = [];
  for (let i = start; i < lines.length; i++) {
    const s = lines[i];
    if (isFurniture(s)) continue;
    body.push(s);
    // A declaration ends at its own closing brace. `};` on one line covers both
    // the multi-line tables and the single-line ones.
    if (body.length > 0 && /\};\s*$/.test(s)) break;
  }
  let t = body.join('\n');
  t = t.slice(t.indexOf('{'));
  t = t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  let nums = (t.match(/\d+/g) || []).map(Number);
  if (dropTrailingZero && nums.length === count + 1 && nums[nums.length - 1] === 0) nums = nums.slice(0, count);
  if (nums.length !== count) {
    throw new Error(`${name}: extracted ${nums.length} values, the spec declares ${count}. `
      + 'REFUSING to write a partial table — a short probability table desynchronises the arithmetic '
      + 'decoder and produces noise that looks like a decoder bug rather than a data bug.');
  }
  if (nums.some((n) => n < 0 || n > 255) && name !== 'dc_qlookup' && name !== 'ac_qlookup') {
    throw new Error(`${name}: a probability outside 0..255 — the extraction picked up something that is not this table`);
  }
  return nums;
}

const r = await fetch(SPEC, { headers: { 'User-Agent': UA } });
if (!r.ok) throw new Error(`spec fetch failed: HTTP ${r.status}`);
const lines = (await r.text()).split(/\r?\n/);
console.log(`[vp8-tables] RFC 6386 fetched — ${lines.length.toLocaleString()} lines`);

const tables = {};
for (const w of WANTED) {
  tables[w.name] = extract(lines, w.decl, w.name, w.count, false);
  console.log(`  ${w.name.padEnd(20)} ${String(w.count).padStart(5)} values  head ${tables[w.name].slice(0, 5).join(',')}`);
}
for (const c of CATS) {
  tables[c.name] = extract(lines, c.decl, c.name, c.count, true);
  console.log(`  ${c.name.padEnd(20)} ${String(c.count).padStart(5)} values  ${tables[c.name].join(',')}`);
}

// ⚠ A CROSS-CHECK THAT DOES NOT DEPEND ON THE EXTRACTOR BEING RIGHT. The two
// quantizer lookups are monotonic non-decreasing by construction and start at 4.
// If the extractor had grabbed a neighbouring table the shape would break here.
for (const q of ['dc_qlookup', 'ac_qlookup']) {
  const a = tables[q];
  if (a[0] !== 4) throw new Error(`${q}: starts at ${a[0]}, the spec's ladders both start at 4`);
  for (let i = 1; i < a.length; i++) if (a[i] < a[i - 1]) throw new Error(`${q}: not monotonic at ${i} — wrong table`);
}
// The mode table is indexed [above][left][node]; every value is a probability.
if (tables.kf_b_mode_probs[0] !== 231) throw new Error('kf_b_mode_probs: first value is not the spec\'s 231 — wrong offset');

fs.writeFileSync(OUT, `${JSON.stringify({
  version: 1,
  note: 'VP8 key-frame constant tables, DERIVED from RFC 6386 rather than hand-typed. Flat arrays; '
    + 'the multi-dimensional ones are indexed arithmetically by server/webp-decode.js. Every table was '
    + 'checked against the dimension count the spec declares for it, and the extraction refuses to write '
    + 'a partial table, because one wrong probability desynchronises the whole arithmetic decoder.',
  source: { what: 'VP8 Data Format and Decoding Guide', url: SPEC, licence: 'BSD (RFC 6386 code components, Copyright (c) 2010, 2011 Google Inc.)' },
  layout: {
    default_coeff_probs: '[4 block types][8 coeff bands][3 prev-coeff contexts][11 tree nodes] -> ((t*8+b)*3+c)*11+n',
    coeff_update_probs: 'same layout as default_coeff_probs',
    kf_b_mode_probs: '[10 above modes][10 left modes][9 tree nodes] -> (a*10+l)*9+n',
  },
  counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
  tables,
}, null, 1)}\n`, 'utf8');

const total = Object.values(tables).reduce((a, v) => a + v.length, 0);
console.log(`[vp8-tables] DONE — ${total.toLocaleString()} constants written to server/vp8-tables.json, every table dimension-checked.`);
