// P4.3.b — Extract 8 state-broadcast methods from brain-server.js into
// brain-server/state.js SERVER_STATE_MIXIN. CommonJS module pattern.
//
// Methods moved (brain-server.js lines 1980-2438, 459 lines):
//   _broadcastStateNow, _runDictionarySmokeTest, _scheduleSmokeTestRetry,
//   _computeMinGrade, getState, pushBrainEvent, _recentBrainEvents,
//   _computeCortexDivergence

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BSV = path.join(ROOT, 'server/brain-server.js');
const STATE = path.join(ROOT, 'server/brain-server/state.js');

const bsvText = fs.readFileSync(BSV, 'utf8');
const stateText = fs.readFileSync(STATE, 'utf8');

const bsvEol = bsvText.includes('\r\n') ? '\r\n' : '\n';
const stateEol = stateText.includes('\r\n') ? '\r\n' : '\n';
console.log(`Line endings — brain-server.js: ${bsvEol === '\r\n' ? 'CRLF' : 'LF'}, state.js: ${stateEol === '\r\n' ? 'CRLF' : 'LF'}`);

const bsvLines = bsvText.split(/\r?\n/);
const stateLines = stateText.split(/\r?\n/);

console.log(`Source: brain-server.js ${bsvLines.length} lines`);
console.log(`Target: state.js ${stateLines.length} lines`);

// Lines 1980-2438 (1-indexed) inclusive. 0-indexed slice [1979, 2438).
const START = 1979;     // line 1980: "/**" (start of doc-comment block above _broadcastStateNow)
const END = 2434;       // line 2434: "  }" closing _computeCortexDivergence (exclusive end)

const firstLine = bsvLines[START];
const lastLine = bsvLines[END - 1];
if (!firstLine.trim().startsWith('/**')) {
  console.error(`FATAL: expected first line to be doc-open, got: ${JSON.stringify(firstLine)}`);
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
  '_broadcastStateNow', '_runDictionarySmokeTest', '_scheduleSmokeTestRetry',
  '_computeMinGrade', 'getState', 'pushBrainEvent', '_recentBrainEvents',
  '_computeCortexDivergence',
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
if (commaCount !== 8) {
  console.error(`FATAL: expected 8 method closings converted to "  },", got ${commaCount}`);
  process.exit(1);
}
console.log(`Converted ${commaCount} method closings to object-literal form.`);

// Inject into state.js.
const newStateLines = [];
for (const line of stateLines) {
  if (line.includes('METHOD BODIES INJECTED BY')) {
    for (const m of converted) newStateLines.push(m);
  } else if (line.includes('module is a valid empty mixin until the migration runs')) {
    continue;
  } else {
    newStateLines.push(line);
  }
}

// Replace block in brain-server.js with marker.
const marker = [
  '',
  '  // 8 state-broadcast methods EXTRACTED to server/brain-server/state.js',
  '  // SERVER_STATE_MIXIN (per-concern file architecture, P4.3.b).',
  '  //   _broadcastStateNow, _runDictionarySmokeTest, _scheduleSmokeTestRetry,',
  '  //   _computeMinGrade, getState, pushBrainEvent, _recentBrainEvents,',
  '  //   _computeCortexDivergence',
  '  // Attached via Object.assign(ServerBrain.prototype, ...) at the',
  '  // bottom of this file. CommonJS module pattern.',
  '',
];

const newBsvLines = [
  ...bsvLines.slice(0, START),
  ...marker,
  ...bsvLines.slice(END),
];

// Add require after existing P4.3.a require line.
let gpuRequireIdx = -1;
for (let i = 0; i < newBsvLines.length; i++) {
  if (newBsvLines[i].includes("require('./brain-server/gpu.js')")) { gpuRequireIdx = i; break; }
}
if (gpuRequireIdx === -1) {
  console.error('FATAL: gpu.js require not found');
  process.exit(1);
}
const requireLine = `const { SERVER_STATE_MIXIN } = require('./brain-server/state.js');`;
newBsvLines.splice(gpuRequireIdx + 1, 0, requireLine);

// Append Object.assign right after the existing SERVER_GPU_MIXIN attach.
let attachIdx = -1;
for (let i = newBsvLines.length - 1; i >= 0; i--) {
  if (newBsvLines[i].includes('Object.assign(ServerBrain.prototype, SERVER_GPU_MIXIN)')) {
    attachIdx = i;
    break;
  }
}
if (attachIdx === -1) {
  console.error('FATAL: SERVER_GPU_MIXIN attach not found');
  process.exit(1);
}
newBsvLines.splice(attachIdx + 1, 0, 'Object.assign(ServerBrain.prototype, SERVER_STATE_MIXIN);');

fs.writeFileSync(BSV, newBsvLines.join(bsvEol));
fs.writeFileSync(STATE, newStateLines.join(stateEol));

console.log('');
console.log(`brain-server.js: ${bsvLines.length} → ${newBsvLines.length} lines (Δ ${newBsvLines.length - bsvLines.length})`);
console.log(`state.js:        ${stateLines.length} → ${newStateLines.length} lines (Δ ${newStateLines.length - stateLines.length})`);
console.log(`Block moved:     ${block.length} lines`);
console.log('OK — P4.3.b migration complete.');
