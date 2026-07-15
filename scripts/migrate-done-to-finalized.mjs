#!/usr/bin/env node
// Block-aware migration of completed [x] tasks out of docs/TODO.md into docs/FINALIZED.md.
// LAW-safe: FINALIZED-before-DELETE (copy verbatim + verify present, THEN remove from TODO),
// LAW #0 (never clip a word — whole block incl. indented children moves intact),
// NEVER-DELETE-TODO-INFO is satisfied because the info lands in FINALIZED first.
//
// Usage:  node scripts/migrate-done-to-finalized.mjs --dry   (report only, no writes)
//         node scripts/migrate-done-to-finalized.mjs         (execute)
//
// A "done block" = a line matching ^\s*-?\s*\**\[x\]  plus every following line that is
// EITHER blank OR indented deeper than the bullet's own indent (its continuation/children),
// stopping at the next line at the same-or-shallower indent that starts a bullet/header.

import { readFileSync, writeFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry');
const ROOT = new URL('../docs/', import.meta.url);
const TODO = new URL('TODO.md', ROOT);
const FIN  = new URL('FINALIZED.md', ROOT);

const todoRaw = readFileSync(TODO, 'utf8');
const finRaw  = readFileSync(FIN, 'utf8');
// preserve the file's own newline style
const NL = todoRaw.includes('\r\n') ? '\r\n' : '\n';
const lines = todoRaw.split(/\r?\n/);

const doneRe = /^(\s*)-?\s*\**\[x\]/;
const bulletOrHeaderRe = /^(\s*)(-|\*|#{1,6}\s|\d+\.)/;

function indentOf(l) { const m = l.match(/^(\s*)/); return m ? m[1].length : 0; }

// Build blocks
const blocks = [];   // {start, end, text, indent}
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(doneRe);
  if (!m) continue;
  const baseIndent = m[1].length;
  let j = i + 1;
  for (; j < lines.length; j++) {
    const l = lines[j];
    if (l.trim() === '') { continue; }              // blank — tentatively part of block, trimmed later
    const ind = indentOf(l);
    if (ind > baseIndent) continue;                 // deeper = child/continuation
    if (bulletOrHeaderRe.test(l) && ind <= baseIndent) break; // next sibling/header
    if (ind <= baseIndent) break;                   // dedented prose
  }
  // trim trailing blank lines out of the block
  let end = j - 1;
  while (end > i && lines[end].trim() === '') end--;
  blocks.push({ start: i, end, indent: baseIndent, text: lines.slice(i, end + 1).join(NL) });
  i = end; // skip past this block's children
}

// Robust presence check: distinctive phrase = the first 70 non-space chars of the body
// AFTER the [x] marker, normalized (collapse whitespace). Guards against ID-substring
// false positives.
function distinctivePhrase(text) {
  const firstLine = text.split(/\r?\n/)[0];
  const body = firstLine.replace(doneRe, '').replace(/^\s*\**/, '');
  const norm = body.replace(/\s+/g, ' ').trim();
  return norm.slice(0, 70);
}
const finNorm = finRaw.replace(/\s+/g, ' ');

const missing = [];
const present = [];
for (const b of blocks) {
  const phrase = distinctivePhrase(b.text).replace(/\s+/g, ' ');
  if (phrase.length >= 12 && finNorm.includes(phrase)) present.push(b);
  else missing.push(b);
}

console.log(`[migrate] done blocks found: ${blocks.length}`);
console.log(`[migrate]   already in FINALIZED (phrase match): ${present.length}`);
console.log(`[migrate]   MISSING → will copy verbatim: ${missing.length}`);
console.log(`[migrate] newline style: ${NL === '\r\n' ? 'CRLF' : 'LF'}`);

if (DRY) {
  console.log('\n--- MISSING blocks that would be appended to FINALIZED (first line each) ---');
  for (const b of missing) console.log('  + ' + b.text.split(/\r?\n/)[0].slice(0, 130));
  console.log('\n(dry run — no files written)');
  process.exit(0);
}

// EXECUTE
// 1) append missing blocks verbatim to FINALIZED under a dated migration section
if (missing.length) {
  const section =
    NL + NL + '## 2026-07-14 — TODO→FINALIZED migration sweep (completed [x] tasks archived verbatim)' + NL +
    'Verbatim migration of completed tasks that were marked [x] in docs/TODO.md but never moved out. ' +
    'Text preserved word-for-word (LAW #0); each block incl. its sub-bullets.' + NL + NL +
    missing.map(b => b.text).join(NL + NL);
  writeFileSync(FIN, finRaw.replace(/\s+$/,'') + section + NL, 'utf8');
  console.log(`[migrate] appended ${missing.length} missing blocks to FINALIZED.md`);
}

// 2) verify every block is now present in FINALIZED before removing from TODO
const finAfter = readFileSync(FIN, 'utf8').replace(/\s+/g, ' ');
const stillMissing = blocks.filter(b => {
  const p = distinctivePhrase(b.text).replace(/\s+/g, ' ');
  return !(p.length >= 12 && finAfter.includes(p));
});
if (stillMissing.length) {
  console.error(`[migrate] ABORT — ${stillMissing.length} block(s) not verified in FINALIZED; TODO left untouched.`);
  stillMissing.forEach(b => console.error('  ! ' + b.text.split(/\r?\n/)[0].slice(0,110)));
  process.exit(1);
}

// 3) remove done blocks from TODO (mark line indices, rebuild)
const remove = new Set();
for (const b of blocks) for (let k = b.start; k <= b.end; k++) remove.add(k);
const kept = lines.filter((_, i) => !remove.has(i));
// collapse any 3+ consecutive blank lines left behind to a single blank
const out = [];
for (const l of kept) {
  if (l.trim() === '' && out.length && out[out.length-1].trim() === '') continue;
  out.push(l);
}
writeFileSync(TODO, out.join(NL), 'utf8');
console.log(`[migrate] removed ${blocks.length} done blocks (${remove.size} lines) from TODO.md`);
console.log(`[migrate] TODO.md: ${lines.length} → ${out.length} lines`);
