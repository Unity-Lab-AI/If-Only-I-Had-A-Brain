// P4.1.a — Extract 13 K-ELA letter/phoneme/word teach helpers from
// curriculum.js into kindergarten.js K_MIXIN. Per operator 2026-04-22
// directive: per-grade file architecture, curriculum.js stays focused
// on shared primitives + scaffold, each grade owns its specifics.
//
// Methods moved (curriculum.js lines 6774-7905):
//   _teachLetterCaseBinding, _teachLetterNaming, _teachVowelSoundVariants,
//   _teachWordEmission, _teachRhymeFamilies, _teachSyllableCounts,
//   _teachCVCSoundIsolation, _teachPluralTransform, _teachQuestionWordCategories,
//   _teachEndPunctuation, _teachStoryComprehension, _teachPhonemeBlending,
//   _teachCapitalization
//
// All 13 verified K-only via grep: callers exist ONLY in kindergarten.js
// K cell runners (runElaKReal, runArtKReal, runSocKReal, runSciKReal,
// runMathKReal, runLifeK). Shared primitives stay: _teachAssociationPairs,
// _teachCombination, _teachHebbian, _teachSentenceStructures (plural),
// _teachDefinitionFirst, _teachWordInContext, _teachQABinding, etc.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CURR = path.join(ROOT, 'js/brain/curriculum.js');
const KIND = path.join(ROOT, 'js/brain/curriculum/kindergarten.js');

const currText = fs.readFileSync(CURR, 'utf8');
const kindText = fs.readFileSync(KIND, 'utf8');

// Detect dominant line ending to preserve on write-back.
const currEol = currText.includes('\r\n') ? '\r\n' : '\n';
const kindEol = kindText.includes('\r\n') ? '\r\n' : '\n';
console.log(`Line endings — curriculum.js: ${currEol === '\r\n' ? 'CRLF' : 'LF'}, kindergarten.js: ${kindEol === '\r\n' ? 'CRLF' : 'LF'}`);

const currLines = currText.split(/\r?\n/);
const kindLines = kindText.split(/\r?\n/);

console.log(`Source: curriculum.js ${currLines.length} lines`);
console.log(`Target: kindergarten.js ${kindLines.length} lines`);

// Lines 6774-7905 (1-indexed) inclusive. 0-indexed slice [6773, 7905).
const START = 6773;     // line 6774 is "  async _teachLetterCaseBinding(ctx) {"
const END = 7905;       // line 7905 is "  }" closing _teachCapitalization (exclusive end for slice)

// Sanity checks — abort if line layout drifted.
const firstLine = currLines[START];
const lastLine = currLines[END - 1];
if (!firstLine.includes('_teachLetterCaseBinding')) {
  console.error(`FATAL: expected first line to contain _teachLetterCaseBinding, got: ${JSON.stringify(firstLine)}`);
  process.exit(1);
}
if (lastLine.trim() !== '}') {
  console.error(`FATAL: expected last line to be closing brace, got: ${JSON.stringify(lastLine)}`);
  process.exit(1);
}
// Line AFTER the block should be blank or the runElaKReal-extracted marker comment.
const peek = currLines[END]; // 0-indexed line at END is the "next line"
console.log(`Block starts: ${JSON.stringify(firstLine)}`);
console.log(`Block ends:   ${JSON.stringify(lastLine)}`);
console.log(`Line after:   ${JSON.stringify(peek)}`);

const block = currLines.slice(START, END);

// Verify all 13 expected method signatures appear in the block.
const expected = [
  '_teachLetterCaseBinding', '_teachLetterNaming', '_teachVowelSoundVariants',
  '_teachWordEmission', '_teachRhymeFamilies', '_teachSyllableCounts',
  '_teachCVCSoundIsolation', '_teachPluralTransform', '_teachQuestionWordCategories',
  '_teachEndPunctuation', '_teachStoryComprehension', '_teachPhonemeBlending',
  '_teachCapitalization',
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
// Strategy: track open/close brace depth on lines starting with `  async _teach`
// signatures. When depth returns to 0 on a line that's exactly "  }", convert
// that line to "  },".
const converted = block.slice();
let inMethod = false;
let depth = 0;

for (let i = 0; i < converted.length; i++) {
  const line = converted[i];

  // Detect method signature start (2-space indent + async + identifier).
  if (/^  async _teach\w+\s*\(/.test(line)) {
    inMethod = true;
    depth = 0;
    // Count braces on the same line as the signature.
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    continue;
  }
  if (!inMethod) continue;

  // Count braces on this line.
  for (const ch of line) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }

  // If depth returned to zero and the line is exactly "  }", convert to "  },".
  if (depth === 0 && /^  \}$/.test(line)) {
    converted[i] = '  },';
    inMethod = false;
  }
}

// Sanity check — converted block should have exactly 13 occurrences of "  },"
// (one per method).
const commaCount = converted.filter(l => l === '  },').length;
if (commaCount !== 13) {
  console.error(`FATAL: expected 13 method closings converted to "  },", got ${commaCount}`);
  process.exit(1);
}
console.log(`Converted ${commaCount} method closings to object-literal form.`);

// Build the insertion for kindergarten.js K_MIXIN.
const moveHeader = [
  '',
  '  // ─── K-ELA letter/phoneme/word teach helpers — extracted from curriculum.js (P4.1) ───',
  '  // Per operator 2026-04-22 directive: per-grade file architecture.',
  '  // These 13 methods are called only from K cell runners. Shared primitives',
  '  // (_teachAssociationPairs, _teachCombination, _teachHebbian, _teachSentenceStructures,',
  '  // _teachDefinitionFirst, _teachWordInContext, _teachQABinding, _teachBiographicalFacts,',
  '  // _conceptTeach, _writeTiledPattern, _clearSpikes, _hb, _auditExamVocabulary,',
  '  // _pregateEnrichment) stay on Curriculum.prototype in curriculum.js.',
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
  '  // 13 K-ELA letter/phoneme/word teach helpers EXTRACTED to',
  '  // js/brain/curriculum/kindergarten.js K_MIXIN (P4.1 — per-grade file architecture).',
  '  //   _teachLetterCaseBinding, _teachLetterNaming, _teachVowelSoundVariants,',
  '  //   _teachWordEmission, _teachRhymeFamilies, _teachSyllableCounts,',
  '  //   _teachCVCSoundIsolation, _teachPluralTransform, _teachQuestionWordCategories,',
  '  //   _teachEndPunctuation, _teachStoryComprehension, _teachPhonemeBlending,',
  '  //   _teachCapitalization.',
  '  // Called only from K cell runners. Shared primitives (_teachAssociationPairs,',
  '  // _teachCombination, _teachHebbian, _teachSentenceStructures, _teachDefinitionFirst,',
  '  // _teachWordInContext) stay on Curriculum.prototype here.',
  '',
];

const newCurrLines = [
  ...currLines.slice(0, START),
  ...marker,
  ...currLines.slice(END),
];

// Write.
fs.writeFileSync(CURR, newCurrLines.join(currEol));
fs.writeFileSync(KIND, newKindLines.join(kindEol));

console.log('');
console.log(`curriculum.js:    ${currLines.length} → ${newCurrLines.length} lines (Δ ${newCurrLines.length - currLines.length})`);
console.log(`kindergarten.js:  ${kindLines.length} → ${newKindLines.length} lines (Δ ${newKindLines.length - kindLines.length})`);
console.log(`Block moved:      ${block.length} lines`);
console.log('OK — P4.1.a migration complete.');
