// P4.3.a — Extract 20 GPU sparse-comm methods from brain-server.js into
// brain-server/gpu.js SERVER_GPU_MIXIN. Same migration pattern as
// P4.2.a/b/c + P4.1.a-d.
//
// Methods moved (brain-server.js lines 2615-3687, 1073 lines):
//   _gpuStep, _gpuBatch, _nextSparseReqId, _sparseSend,
//   _encodeSparseHeader, _sparseSendBinary, gpuDrainWait,
//   _gpuSparseFlowOk, gpuSparseUpload, gpuSparsePropagate,
//   gpuSparseHebbianBound, _enqueueBoundHebbian, _flushBoundHebbianBatch,
//   gpuSparsePropagateBound, _gpuWriteCortexSpikeSlice,
//   _gpuWriteCortexCurrentSlice, _gpuClearCortexSpikeRegion,
//   gpuReadbackCortexLetterBuckets, _ensureCortexCrossProjectionsBound,
//   gpuSparseHebbian

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BSV = path.join(ROOT, 'server/brain-server.js');
const GPU = path.join(ROOT, 'server/brain-server/gpu.js');

const bsvText = fs.readFileSync(BSV, 'utf8');
const gpuText = fs.readFileSync(GPU, 'utf8');

const bsvEol = bsvText.includes('\r\n') ? '\r\n' : '\n';
const gpuEol = gpuText.includes('\r\n') ? '\r\n' : '\n';
console.log(`Line endings — brain-server.js: ${bsvEol === '\r\n' ? 'CRLF' : 'LF'}, gpu.js: ${gpuEol === '\r\n' ? 'CRLF' : 'LF'}`);

const bsvLines = bsvText.split(/\r?\n/);
const gpuLines = gpuText.split(/\r?\n/);

console.log(`Source: brain-server.js ${bsvLines.length} lines`);
console.log(`Target: gpu.js ${gpuLines.length} lines`);

// Lines 2615-3687 (1-indexed) inclusive. 0-indexed slice [2614, 3687).
const START = 2614;
const END = 3687;

const firstLine = bsvLines[START];
const lastLine = bsvLines[END - 1];
if (!firstLine.includes('_gpuStep')) {
  console.error(`FATAL: expected first line to contain _gpuStep, got: ${JSON.stringify(firstLine)}`);
  process.exit(1);
}
if (lastLine.trim() !== '}') {
  console.error(`FATAL: expected last line to be closing brace, got: ${JSON.stringify(lastLine)}`);
  process.exit(1);
}
console.log(`Block starts: ${JSON.stringify(firstLine)}`);
console.log(`Block ends:   ${JSON.stringify(lastLine)}`);

const block = bsvLines.slice(START, END);

const expected = [
  '_gpuStep', '_gpuBatch', '_nextSparseReqId', '_sparseSend',
  '_encodeSparseHeader', '_sparseSendBinary', 'gpuDrainWait',
  '_gpuSparseFlowOk', 'gpuSparseUpload', 'gpuSparsePropagate',
  'gpuSparseHebbianBound', '_enqueueBoundHebbian', '_flushBoundHebbianBatch',
  'gpuSparsePropagateBound', '_gpuWriteCortexSpikeSlice',
  '_gpuWriteCortexCurrentSlice', '_gpuClearCortexSpikeRegion',
  'gpuReadbackCortexLetterBuckets', '_ensureCortexCrossProjectionsBound',
  'gpuSparseHebbian',
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
if (commaCount !== 20) {
  console.error(`FATAL: expected 20 method closings converted to "  },", got ${commaCount}`);
  process.exit(1);
}
console.log(`Converted ${commaCount} method closings to object-literal form.`);

// Inject into gpu.js.
const newGpuLines = [];
for (const line of gpuLines) {
  if (line.includes('METHOD BODIES INJECTED BY')) {
    for (const m of converted) newGpuLines.push(m);
  } else if (line.includes('module is a valid empty mixin until the migration runs')) {
    continue;
  } else {
    newGpuLines.push(line);
  }
}

// Replace block in brain-server.js with marker.
const marker = [
  '',
  '  // 20 GPU sparse-comm methods EXTRACTED to server/brain-server/gpu.js',
  '  // SERVER_GPU_MIXIN (per-concern file architecture, P4.3.a).',
  '  //   _gpuStep, _gpuBatch, _nextSparseReqId, _sparseSend,',
  '  //   _encodeSparseHeader, _sparseSendBinary, gpuDrainWait,',
  '  //   _gpuSparseFlowOk, gpuSparseUpload, gpuSparsePropagate,',
  '  //   gpuSparseHebbianBound, _enqueueBoundHebbian, _flushBoundHebbianBatch,',
  '  //   gpuSparsePropagateBound, _gpuWriteCortexSpikeSlice,',
  '  //   _gpuWriteCortexCurrentSlice, _gpuClearCortexSpikeRegion,',
  '  //   gpuReadbackCortexLetterBuckets, _ensureCortexCrossProjectionsBound,',
  '  //   gpuSparseHebbian',
  '  // Attached via Object.assign(ServerBrain.prototype, ...) at the',
  '  // bottom of this file. All methods accessible identically through',
  '  // the prototype chain.',
  '',
];

const newBsvLines = [
  ...bsvLines.slice(0, START),
  ...marker,
  ...bsvLines.slice(END),
];

// Brain-server.js doesn't use top-level imports in the same place as
// cluster.js (it's CommonJS-ish or has them spread out). For ES-module
// style, find the last top-level `import` and add ours.
// Check whether it uses `import` or `require`.
let usesImport = false;
for (const line of newBsvLines) {
  if (/^import\s/.test(line)) { usesImport = true; break; }
}
if (!usesImport) {
  // It's CommonJS-ish — find a good insertion point. Look for the line
  // declaring the ServerBrain class and insert above it.
  let classIdx = -1;
  for (let i = 0; i < newBsvLines.length; i++) {
    if (/^class\s+ServerBrain\b/.test(newBsvLines[i])) { classIdx = i; break; }
  }
  if (classIdx === -1) {
    console.error('FATAL: ServerBrain class not found');
    process.exit(1);
  }
  // Try to find a Node-style require block above
  // and insert near it. For ESM with no existing imports, prepend at top.
  // Simplest: insert directly above the class.
  const importLine = `import { SERVER_GPU_MIXIN } from './brain-server/gpu.js';`;
  newBsvLines.splice(classIdx, 0, importLine, '');
  console.log(`Inserted import above class at line ${classIdx + 1}`);
} else {
  let lastImportIdx = -1;
  for (let i = 0; i < newBsvLines.length; i++) {
    if (/^import\s/.test(newBsvLines[i])) lastImportIdx = i;
  }
  const importLine = `import { SERVER_GPU_MIXIN } from './brain-server/gpu.js';`;
  newBsvLines.splice(lastImportIdx + 1, 0, importLine);
  console.log(`Inserted import after line ${lastImportIdx + 1}`);
}

// Append Object.assign at end of file.
let trailingBlankCount = 0;
while (newBsvLines.length > 0 && newBsvLines[newBsvLines.length - 1] === '') {
  trailingBlankCount++;
  newBsvLines.pop();
}
newBsvLines.push(
  '',
  '// Attach per-concern mixins to ServerBrain.prototype. Per-concern',
  '// architecture per server/brain-server/README.md.',
  'Object.assign(ServerBrain.prototype, SERVER_GPU_MIXIN);',
  '',
);
for (let i = 0; i < trailingBlankCount; i++) newBsvLines.push('');

fs.writeFileSync(BSV, newBsvLines.join(bsvEol));
fs.writeFileSync(GPU, newGpuLines.join(gpuEol));

console.log('');
console.log(`brain-server.js: ${bsvLines.length} → ${newBsvLines.length} lines (Δ ${newBsvLines.length - bsvLines.length})`);
console.log(`gpu.js:          ${gpuLines.length} → ${newGpuLines.length} lines (Δ ${newGpuLines.length - gpuLines.length})`);
console.log(`Block moved:     ${block.length} lines`);
console.log('OK — P4.3.a migration complete.');
