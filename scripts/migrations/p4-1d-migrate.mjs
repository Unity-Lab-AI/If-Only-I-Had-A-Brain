// P4.1.d — Final bite of P4.1 per-grade-file architecture migration.
// Extract 5 orphan Math-K + ELA-K helpers from curriculum.js into
// kindergarten.js K_MIXIN with DEPRECATED-LEGACY header.
//
// Methods (curriculum.js lines 6477-6687, 211 lines, 5 methods):
//   _teachDigitSequence, _teachDigitNames, _teachMagnitudes,
//   _teachCVCReading, _teachSightWords
//
// All 5 are ORPHAN — grep-verified ZERO `this._teach*` callers
// anywhere in codebase. Only references are informational doc comments
// (e.g. "_teachDigitSequence() injects digits 0-9 in order" in
// equation-level prose). They were defined in Session 26 (Math-K
// helpers) per the section header at lines 6464-6475, but the K
// runners never actually wired them in — they're Session-26 legacy
// like the P4.1.c orphans were Session-25 legacy.
//
// In same atomic operation: delete the stale "Math-K helpers
// (Session 26)" section header at lines 6464-6476 since the methods
// it introduces are all moving out.

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

// Replace lines 6464-6687 (1-indexed inclusive) = 0-indexed [6463, 6687).
// Block: 224 lines (12 chrome + 1 blank + 211 methods).
const REPLACE_START = 6463;  // line 6464: "  // ─── TODO-aligned Math-K helpers (Session 26) ────────────────────"
const REPLACE_END = 6687;    // line 6687: "  }" closing _teachSightWords (exclusive)

// The METHODS sub-block (0-indexed [6476, 6687)) is what we move.
const METHODS_START = 6476;  // line 6477: "  async _teachDigitSequence(opts = {}) {"
const METHODS_END = 6687;    // line 6687: "  }" closing _teachSightWords (exclusive)

// Sanity checks on methods boundary.
const firstMethodLine = currLines[METHODS_START];
const lastMethodLine = currLines[METHODS_END - 1];
if (!firstMethodLine.includes('_teachDigitSequence')) {
  console.error(`FATAL: expected first method line to contain _teachDigitSequence, got: ${JSON.stringify(firstMethodLine)}`);
  process.exit(1);
}
if (lastMethodLine.trim() !== '}') {
  console.error(`FATAL: expected last method line to be closing brace, got: ${JSON.stringify(lastMethodLine)}`);
  process.exit(1);
}
console.log(`Methods block starts: ${JSON.stringify(firstMethodLine)}`);
console.log(`Methods block ends:   ${JSON.stringify(lastMethodLine)}`);

// Sanity check the chrome start.
const chromeFirstLine = currLines[REPLACE_START];
if (!chromeFirstLine.includes('TODO-aligned Math-K helpers') && !chromeFirstLine.includes('Math-K helpers')) {
  console.error(`FATAL: expected chrome start to be "Math-K helpers" section header, got: ${JSON.stringify(chromeFirstLine)}`);
  process.exit(1);
}
console.log(`Chrome start: ${JSON.stringify(chromeFirstLine)}`);

const methodsBlock = currLines.slice(METHODS_START, METHODS_END);

// Verify 5 method signatures in order.
const expected = ['_teachDigitSequence', '_teachDigitNames', '_teachMagnitudes', '_teachCVCReading', '_teachSightWords'];
const found = [];
for (const line of methodsBlock) {
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

// Convert class-method form → object-literal form (trailing comma).
const converted = methodsBlock.slice();
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

// Build kindergarten.js insertion with DEPRECATED-LEGACY header.
const moveHeader = [
  '',
  '  // ─── K-Math + K-ELA legacy/orphan teach helpers — DEPRECATED, preserved for reference ───',
  '  // Session-26 Math-K helpers (digit-sequence + digit-names + magnitudes via',
  '  // FREE region) + Session-26 K-ELA CVC-reading + sight-word helpers. Defined',
  '  // when the TODO MATH-K + ELA-K specs prescribed these signatures, but the',
  '  // actual K runners never wired them in (the inline Session-3 phon-region',
  '  // implementation shipped instead, then iter25-I structural binding +',
  '  // _teachConcreteSentences + _teachAssociationPairs paths took over).',
  '  // NO active callers anywhere in the codebase — only informational',
  '  // doc-comment references in equation-level prose. Preserved here as',
  '  // historical reference under per-grade-file architecture.',
  '',
];
const insertion = [...moveHeader, ...converted, ''];

// Locate K_MIXIN closing `};` in kindergarten.js.
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

// Build small replacement marker for curriculum.js.
const marker = [
  '',
  '  // 5 K-Math + K-ELA Session-26 legacy/orphan teach helpers EXTRACTED to',
  '  // js/brain/curriculum/kindergarten.js K_MIXIN (per-grade file architecture).',
  '  //   _teachDigitSequence, _teachDigitNames, _teachMagnitudes,',
  '  //   _teachCVCReading, _teachSightWords.',
  '  // NO active callers anywhere. Defined but never wired in. Preserved with',
  '  // DEPRECATED-LEGACY header in kindergarten.js. Section-26 Math-K helpers',
  '  // chrome (section header + intro doc) deleted as no longer applicable.',
  '',
];

const newCurrLines = [
  ...currLines.slice(0, REPLACE_START),
  ...marker,
  ...currLines.slice(REPLACE_END),
];

fs.writeFileSync(CURR, newCurrLines.join(currEol));
fs.writeFileSync(KIND, newKindLines.join(kindEol));

console.log('');
console.log(`curriculum.js:    ${currLines.length} → ${newCurrLines.length} lines (Δ ${newCurrLines.length - currLines.length})`);
console.log(`kindergarten.js:  ${kindLines.length} → ${newKindLines.length} lines (Δ ${newKindLines.length - kindLines.length})`);
console.log(`Methods moved:    ${methodsBlock.length} lines`);
console.log(`Total replaced:   ${REPLACE_END - REPLACE_START} lines → ${marker.length} marker lines`);
console.log('OK — P4.1.d migration complete. P4.1 umbrella now fully shipped.');
