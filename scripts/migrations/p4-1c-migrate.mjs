// P4.1.c — Extract 3 orphan K-ELA legacy methods + consolidate the
// post-P4.1.a/b marker chrome in curriculum.js into a single coherent
// extraction-reference block.
//
// Methods moved (curriculum.js lines 6082-6176, 95 lines, 3 methods):
//   _teachAlphabetSequence, _teachLetterNames, _teachLetterSounds
//
// These are Session 25 legacy methods superseded by the
// _teachAlphabetSequencePairs path (which calls _teachAssociationPairs +
// _teachLetterSequenceDirect). NO active callers anywhere in the codebase
// (grep verified). Per "never delete TODO info" + per-grade-file rule,
// we migrate (not delete) with a DEPRECATED-LEGACY header so future
// readers know they're orphan code preserved for historical reference.
//
// In the same operation: replace the stale section-header block at
// lines 6178-6199 (ELA-K section header + intro + orphan doc for
// already-moved _teachLetterCaseBinding) PLUS the two fragmented
// P4.1.a + P4.1.b marker blocks at lines 6201-6220, with a single
// consolidated extraction-reference block.

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

// Lines 6082-6176 (1-indexed) — the 3 orphan methods.
// 0-indexed slice: [6081, 6176)
const METHODS_START = 6081;  // line 6082: "  async _teachAlphabetSequence(opts = {}) {"
const METHODS_END = 6176;    // line 6176: "  }" closing _teachLetterSounds (exclusive end)

// The CHROME block that gets consolidated: lines 6178-6220 (stale section
// header + intro + orphan doc + P4.1.b marker + P4.1.a marker).
// 0-indexed slice [6177, 6220) — line 6178 onwards through 6220 inclusive
// We replace ALL of lines 6082-6220 (0-indexed [6081, 6220)) with one
// consolidated marker.
const REPLACE_START = 6081;  // line 6082
const REPLACE_END = 6220;    // line 6220 inclusive (the line before _pregateEnrichment header)

// Sanity checks on methods block.
const firstMethodLine = currLines[METHODS_START];
const lastMethodLine = currLines[METHODS_END - 1];
if (!firstMethodLine.includes('_teachAlphabetSequence')) {
  console.error(`FATAL: expected first method line to contain _teachAlphabetSequence, got: ${JSON.stringify(firstMethodLine)}`);
  process.exit(1);
}
if (lastMethodLine.trim() !== '}') {
  console.error(`FATAL: expected last method line to be closing brace, got: ${JSON.stringify(lastMethodLine)}`);
  process.exit(1);
}
console.log(`Methods block starts: ${JSON.stringify(firstMethodLine)}`);
console.log(`Methods block ends:   ${JSON.stringify(lastMethodLine)}`);

// Sanity check on the chrome boundary: line at REPLACE_END (1-indexed 6220)
// should be the last `// _teachWordInContext) stay on...` line of the P4.1.a marker.
const chromeLastLine = currLines[REPLACE_END - 1];
if (!chromeLastLine.includes('_teachWordInContext') && !chromeLastLine.includes('Curriculum.prototype here')) {
  console.error(`FATAL: expected line ${REPLACE_END} to be end of P4.1.a marker, got: ${JSON.stringify(chromeLastLine)}`);
  process.exit(1);
}
console.log(`Chrome last line: ${JSON.stringify(chromeLastLine)}`);

const methodsBlock = currLines.slice(METHODS_START, METHODS_END);

// Verify the 3 expected method signatures.
const expected = ['_teachAlphabetSequence', '_teachLetterNames', '_teachLetterSounds'];
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
if (commaCount !== 3) {
  console.error(`FATAL: expected 3 method closings converted to "  },", got ${commaCount}`);
  process.exit(1);
}
console.log(`Converted ${commaCount} method closings to object-literal form.`);

// Build the kindergarten.js insertion with DEPRECATED-LEGACY header.
const moveHeader = [
  '',
  '  // ─── K-ELA legacy/orphan teach helpers — DEPRECATED, preserved for reference ───',
  '  // Session 25 legacy direct-pattern alphabet teach. Superseded by the',
  '  // _teachAlphabetSequencePairs path (calls _teachAssociationPairs + ',
  '  // _teachLetterSequenceDirect) which writes one-hot discriminative',
  '  // letter[X]->letter[X+1] into cluster.synapses for unambiguous Template 0',
  '  // retrieval (vs the blurred GloVe-cosine ambiguity these legacy methods',
  '  // would have hit). NO active callers anywhere in the codebase — preserved',
  '  // here as historical reference under per-grade-file architecture.',
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

// Build the CONSOLIDATED curriculum.js replacement marker that supersedes
// the stale chrome at 6178-6199 + fragmented P4.1.a/b markers at 6201-6220.
const consolidatedMarker = [
  '',
  '  // ═══════════════════════════════════════════════════════════════════',
  '  // K-ELA teach helpers — EXTRACTED to js/brain/curriculum/kindergarten.js',
  '  // ═══════════════════════════════════════════════════════════════════',
  '  //',
  '  // Per per-grade-file architecture directive. All K-ELA letter/phoneme/',
  '  // word teach helpers + 6 K cell runners + 6 K gates + K-LIFE corpus',
  '  // live in kindergarten.js K_MIXIN, attached to Curriculum.prototype',
  '  // via Object.assign at curriculum.js entry-point bottom.',
  '  //',
  '  // Extracted teach methods:',
  '  //   - 3 orphan/legacy: _teachAlphabetSequence, _teachLetterNames,',
  '  //     _teachLetterSounds (Session 25 path superseded by',
  '  //     _teachAlphabetSequencePairs; preserved with deprecation marker)',
  '  //   - 5 direct-Oja: _teachLetterSequenceDirect, _teachWordSpellingDirect,',
  '  //     _teachLetterNamingDirect, _teachWordEmissionDirect,',
  '  //     _teachWordSpellingDirectFinal',
  '  //   - 13 contiguous helpers: _teachLetterCaseBinding, _teachLetterNaming,',
  '  //     _teachVowelSoundVariants, _teachWordEmission, _teachRhymeFamilies,',
  '  //     _teachSyllableCounts, _teachCVCSoundIsolation, _teachPluralTransform,',
  '  //     _teachQuestionWordCategories, _teachEndPunctuation,',
  '  //     _teachStoryComprehension, _teachPhonemeBlending, _teachCapitalization',
  '  //',
  '  // Also in kindergarten.js K_MIXIN:',
  '  //   - 6 K cell runners (runElaKReal + runArt/Soc/Sci/MathKReal + runLifeK)',
  '  //   - 6 K gates (_gateElaKReal + _gateArt/Soc/Sci/MathKReal + _gateLifeKReal)',
  '  //   - 15 K-LIFE methods (A.K-LIFE umbrella: first-words, family roles,',
  '  //     sensory firsts, comfort objects, fears, bedtime, dietary, motor,',
  '  //     friendships+games, songs+rhymes, storybooks, self-awareness,',
  '  //     integration, gate criterion, vocab pre-step)',
  '  //   - ~18 K-Math/K-Sci/K-Soc/K-Art/K-Life teach methods from prior session',
  '  //',
  '  // Shared primitives STAY on Curriculum.prototype in curriculum.js:',
  '  // _teachAssociationPairs, _teachCombination, _teachHebbian,',
  '  // _teachHebbianAsymmetric, _teachSentenceStructures, _teachDefinitionFirst,',
  '  // _teachWordInContext, _teachQABinding, _teachBiographicalFacts,',
  '  // _conceptTeach, _writeTiledPattern, _clearSpikes, _hb,',
  '  // _auditExamVocabulary, _pregateEnrichment, _teachPredictiveError,',
  '  // _teachLateralInhibition, _teachAntiHebbian.',
  '',
];

const newCurrLines = [
  ...currLines.slice(0, REPLACE_START),
  ...consolidatedMarker,
  ...currLines.slice(REPLACE_END),
];

fs.writeFileSync(CURR, newCurrLines.join(currEol));
fs.writeFileSync(KIND, newKindLines.join(kindEol));

console.log('');
console.log(`curriculum.js:    ${currLines.length} → ${newCurrLines.length} lines (Δ ${newCurrLines.length - currLines.length})`);
console.log(`kindergarten.js:  ${kindLines.length} → ${newKindLines.length} lines (Δ ${newKindLines.length - kindLines.length})`);
console.log(`Methods moved:    ${methodsBlock.length} lines`);
console.log(`Chrome consolidated: ${REPLACE_END - METHODS_END} → ${consolidatedMarker.length} lines`);
console.log('OK — P4.1.c migration complete.');
