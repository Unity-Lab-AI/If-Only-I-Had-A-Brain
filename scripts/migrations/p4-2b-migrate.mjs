// P4.2.b — Extract 6 emission methods from cluster.js into
// cluster/emit.js CLUSTER_EMIT_MIXIN. Same migration pattern as
// P4.2.a + P4.2.c + P4.1.a-d.
//
// Methods moved (cluster.js lines 2996-4569, 1574 lines):
//   _dictionaryOracleEmit, generateSentence, emitWordDirect,
//   composeSentence, generateSentenceAwait, _emitDirectPropagate

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLUSTER = path.join(ROOT, 'js/brain/cluster.js');
const EMIT = path.join(ROOT, 'js/brain/cluster/emit.js');

const clusterText = fs.readFileSync(CLUSTER, 'utf8');
const emitText = fs.readFileSync(EMIT, 'utf8');

const clusterEol = clusterText.includes('\r\n') ? '\r\n' : '\n';
const emitEol = emitText.includes('\r\n') ? '\r\n' : '\n';
console.log(`Line endings — cluster.js: ${clusterEol === '\r\n' ? 'CRLF' : 'LF'}, emit.js: ${emitEol === '\r\n' ? 'CRLF' : 'LF'}`);

const clusterLines = clusterText.split(/\r?\n/);
const emitLines = emitText.split(/\r?\n/);

console.log(`Source: cluster.js ${clusterLines.length} lines`);
console.log(`Target: emit.js ${emitLines.length} lines`);

// Lines 2996-4569 (1-indexed) inclusive. 0-indexed slice [2995, 4569).
const START = 2995;     // line 2996 is "  _dictionaryOracleEmit(intentSeed, opts = {}) {"
const END = 4569;       // line 4569 is "  }" closing _emitDirectPropagate (exclusive end)

const firstLine = clusterLines[START];
const lastLine = clusterLines[END - 1];
if (!firstLine.includes('_dictionaryOracleEmit')) {
  console.error(`FATAL: expected first line to contain _dictionaryOracleEmit, got: ${JSON.stringify(firstLine)}`);
  process.exit(1);
}
if (lastLine.trim() !== '}') {
  console.error(`FATAL: expected last line to be closing brace, got: ${JSON.stringify(lastLine)}`);
  process.exit(1);
}
console.log(`Block starts: ${JSON.stringify(firstLine)}`);
console.log(`Block ends:   ${JSON.stringify(lastLine)}`);

const block = clusterLines.slice(START, END);

const expected = [
  '_dictionaryOracleEmit',
  'generateSentence',
  'emitWordDirect',
  'composeSentence',
  'generateSentenceAwait',
  '_emitDirectPropagate',
];
const found = [];
for (const line of block) {
  const m = /^  (?:async\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(line);
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

  if (/^  (?:async\s+)?[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(line)) {
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
if (commaCount !== 6) {
  console.error(`FATAL: expected 6 method closings converted to "  },", got ${commaCount}`);
  process.exit(1);
}
console.log(`Converted ${commaCount} method closings to object-literal form.`);

// Inject into emit.js.
const newEmitLines = [];
for (const line of emitLines) {
  if (line.includes('METHOD BODIES INJECTED BY')) {
    for (const m of converted) newEmitLines.push(m);
  } else if (line.includes('module is a valid empty mixin until the migration runs')) {
    continue;
  } else {
    newEmitLines.push(line);
  }
}

// Replace block in cluster.js with marker.
const marker = [
  '',
  '  // 6 emission methods EXTRACTED to js/brain/cluster/emit.js',
  '  // CLUSTER_EMIT_MIXIN (per-module-file architecture, P4.2.b).',
  '  //   _dictionaryOracleEmit, generateSentence, emitWordDirect,',
  '  //   composeSentence, generateSentenceAwait, _emitDirectPropagate',
  '  // Attached via Object.assign(NeuronCluster.prototype, ...) at the',
  '  // bottom of this file. Phase 1 fixes (P1.1 async stepAwait, P1.2',
  '  // replaceMode, P1.3 terminator-first guard) + P3.4 exponential-decay',
  '  // back-injection + P6.2 schemaContext pre-inject + P6.6 compositional',
  '  // classify + P6.7 word-creation candidate hook are all preserved in',
  '  // the moved method bodies.',
  '',
];

const newClusterLines = [
  ...clusterLines.slice(0, START),
  ...marker,
  ...clusterLines.slice(END),
];

// Add import after last existing import.
let lastImportIdx = -1;
for (let i = 0; i < newClusterLines.length; i++) {
  if (/^import\s/.test(newClusterLines[i])) lastImportIdx = i;
}
if (lastImportIdx === -1) {
  console.error('FATAL: no existing imports');
  process.exit(1);
}
const importLine = `import { CLUSTER_EMIT_MIXIN } from './cluster/emit.js';`;
newClusterLines.splice(lastImportIdx + 1, 0, importLine);

// Add Object.assign attach right after the existing HEBBIAN_MIXIN attach.
let attachIdx = -1;
for (let i = newClusterLines.length - 1; i >= 0; i--) {
  if (newClusterLines[i].includes('Object.assign(NeuronCluster.prototype, CLUSTER_HEBBIAN_MIXIN)')) {
    attachIdx = i;
    break;
  }
}
if (attachIdx === -1) {
  console.error('FATAL: CLUSTER_HEBBIAN_MIXIN attach not found');
  process.exit(1);
}
newClusterLines.splice(attachIdx + 1, 0, 'Object.assign(NeuronCluster.prototype, CLUSTER_EMIT_MIXIN);');

fs.writeFileSync(CLUSTER, newClusterLines.join(clusterEol));
fs.writeFileSync(EMIT, newEmitLines.join(emitEol));

console.log('');
console.log(`cluster.js: ${clusterLines.length} → ${newClusterLines.length} lines (Δ ${newClusterLines.length - clusterLines.length})`);
console.log(`emit.js:    ${emitLines.length} → ${newEmitLines.length} lines (Δ ${newEmitLines.length - emitLines.length})`);
console.log(`Block moved: ${block.length} lines`);
console.log('OK — P4.2.b migration complete.');
