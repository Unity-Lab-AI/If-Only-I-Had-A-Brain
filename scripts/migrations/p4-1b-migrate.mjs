// P4.1.b — Extract 5 K-only `_teach*Direct*` letter/word teach helpers
// from curriculum.js into kindergarten.js K_MIXIN. These methods carry
// the discriminative one-hot direct-Oja writes that bypass cross-region
// Hebbian — used to recarve letter/motor identity after sequence-train
// corruption and QA-rescale damage.
//
// Methods moved (curriculum.js lines 6238-6772, plus leading doc-block
// for method 1 at 6200-6237 → block start = 6200, end = 6772, 573 lines):
//   _teachLetterSequenceDirect, _teachWordSpellingDirect,
//   _teachLetterNamingDirect, _teachWordEmissionDirect,
//   _teachWordSpellingDirectFinal
//
// All 5 verified K-only via grep: callers exist ONLY in kindergarten.js
// K cell runners (runElaKReal direct calls + runLifeK/Art/Soc/Sci/MathK
// via _phasedTeach wrappers — see kindergarten.js lines 1222, 1227,
// 1247, 1251, 1396, 1401, 1417, 1421, 1606, 1611, 1627, 1631, 1814,
// 1819, 1841, 1845, 2204, 2212, 2231, 2235, 3831, 3867, 3913, 3923,
// 3977 for all call sites).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CURR = path.join(ROOT, 'js/brain/curriculum.js');
const KIND = path.join(ROOT, 'js/brain/curriculum/kindergarten.js');

const currText = fs.readFileSync(CURR, 'utf8');
const kindText = fs.readFileSync(KIND, 'utf8');

const currEol = currText.includes('\r\n') ? '\r\n' : '\n';
const kindEol = kindText.includes('\r\n') ? '\r\n' : '\n';
console.log(`Line endings — curriculum.js: ${currEol === '\r\n' ? 'CRLF' : 'LF'}, kindergarten.js: ${kindEol === '\r\n' ? 'CRLF' : 'LF'}`);

const currLines = currText.split(/\r?\n/);
const kindLines = kindText.split(/\r?\n/);

console.log(`Source: curriculum.js ${currLines.length} lines`);
console.log(`Target: kindergarten.js ${kindLines.length} lines`);

// Lines 6200-6772 (1-indexed) inclusive. 0-indexed slice [6199, 6772).
const START = 6199;     // line 6200 is "  /**" (start of method 1 doc)
const END = 6772;       // line 6772 is "  }" closing _teachWordSpellingDirectFinal (exclusive end)

// Sanity checks.
const firstLine = currLines[START];
const lastLine = currLines[END - 1];
if (firstLine.trim() !== '/**') {
  console.error(`FATAL: expected first line to be "/**" doc-open, got: ${JSON.stringify(firstLine)}`);
  process.exit(1);
}
if (lastLine.trim() !== '}') {
  console.error(`FATAL: expected last line to be closing brace, got: ${JSON.stringify(lastLine)}`);
  process.exit(1);
}
const peek = currLines[END];
console.log(`Block starts: ${JSON.stringify(firstLine)}`);
console.log(`Block ends:   ${JSON.stringify(lastLine)}`);
console.log(`Line after:   ${JSON.stringify(peek)}`);

const block = currLines.slice(START, END);

// Verify the 5 expected method signatures in order.
const expected = [
  '_teachLetterSequenceDirect',
  '_teachWordSpellingDirect',
  '_teachLetterNamingDirect',
  '_teachWordEmissionDirect',
  '_teachWordSpellingDirectFinal',
];
const found = [];
for (const line of block) {
  const m = /^  async (_teach\w+)\s*\(/.exec(line);
  if (m) found.push(m[1]);
}
if (found.length !== expected.length || found.some((n, i) => n !== expected[i])) {
  console.error('FATAL: method signature mismatch.');
  console.error('Expected:', expected);
  console.error('Found:   ', found);
  process.exit(1);
}
console.log(`Verified ${found.length} method signatures in order.`);

// Convert class-method form → object-literal form.
const converted = block.slice();
let inMethod = false;
let depth = 0;

for (let i = 0; i < converted.length; i++) {
  const line = converted[i];

  if (/^  async _teach\w+\s*\(/.test(line)) {
    inMethod = true;
    depth = 0;
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    continue;
  }
  if (!inMethod) continue;

  for (const ch of line) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }

  if (depth === 0 && /^  \}$/.test(line)) {
    converted[i] = '  },';
    inMethod = false;
  }
}

const commaCount = converted.filter(l => l === '  },').length;
if (commaCount !== 5) {
  console.error(`FATAL: expected 5 method closings converted to "  },", got ${commaCount}`);
  process.exit(1);
}
console.log(`Converted ${commaCount} method closings to object-literal form.`);

// Build the insertion for kindergarten.js K_MIXIN.
const moveHeader = [
  '',
  '  // ─── K-ELA direct one-hot letter/word teach helpers — extracted from curriculum.js ───',
  '  // These 5 methods bypass cross-region Hebbian and write directly into',
  '  // sem_to_motor / letter_to_motor via ojaUpdate to recarve discriminative',
  '  // attractors after sequence-training corruption + QA-rescale damage.',
  '  // Called only from K cell runners (runElaKReal direct + 5 subject runners',
  '  // via _phasedTeach wrappers). Per-grade-file architecture continuation.',
  '',
];
const insertion = [...moveHeader, ...converted, ''];

// Locate K_MIXIN closing `};` in kindergarten.js (last occurrence).
let closeIdx = -1;
for (let i = kindLines.length - 1; i >= 0; i--) {
  if (kindLines[i].trim() === '};') { closeIdx = i; break; }
}
if (closeIdx === -1) {
  console.error('FATAL: K_MIXIN closing }; not found in kindergarten.js');
  process.exit(1);
}
console.log(`K_MIXIN closes at kindergarten.js line ${closeIdx + 1}`);

const newKindLines = [
  ...kindLines.slice(0, closeIdx),
  ...insertion,
  ...kindLines.slice(closeIdx),
];

// Build the curriculum.js replacement marker.
const marker = [
  '',
  '  // 5 K-ELA direct one-hot letter/word teach helpers EXTRACTED to',
  '  // js/brain/curriculum/kindergarten.js K_MIXIN (per-grade file architecture).',
  '  //   _teachLetterSequenceDirect, _teachWordSpellingDirect,',
  '  //   _teachLetterNamingDirect, _teachWordEmissionDirect,',
  '  //   _teachWordSpellingDirectFinal.',
  '  // Called only from K cell runners. Direct-Oja recarve passes that bypass',
  '  // cross-region Hebbian for clean letter/word→motor attractors.',
  '',
];

const newCurrLines = [
  ...currLines.slice(0, START),
  ...marker,
  ...currLines.slice(END),
];

fs.writeFileSync(CURR, newCurrLines.join(currEol));
fs.writeFileSync(KIND, newKindLines.join(kindEol));

console.log('');
console.log(`curriculum.js:    ${currLines.length} → ${newCurrLines.length} lines (Δ ${newCurrLines.length - currLines.length})`);
console.log(`kindergarten.js:  ${kindLines.length} → ${newKindLines.length} lines (Δ ${newKindLines.length - kindLines.length})`);
console.log(`Block moved:      ${block.length} lines`);
console.log('OK — P4.1.b migration complete.');
