// P4.3.c — Extract 12 episodic-memory methods from brain-server.js into
// brain-server/memory.js SERVER_MEMORY_MIXIN. CommonJS module pattern.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BSV = path.join(ROOT, 'server/brain-server.js');
const MEM = path.join(ROOT, 'server/brain-server/memory.js');

const bsvText = fs.readFileSync(BSV, 'utf8');
const memText = fs.readFileSync(MEM, 'utf8');

const bsvEol = bsvText.includes('\r\n') ? '\r\n' : '\n';
const memEol = memText.includes('\r\n') ? '\r\n' : '\n';
console.log(`Line endings — brain-server.js: ${bsvEol === '\r\n' ? 'CRLF' : 'LF'}, memory.js: ${memEol === '\r\n' ? 'CRLF' : 'LF'}`);

const bsvLines = bsvText.split(/\r?\n/);
const memLines = memText.split(/\r?\n/);

console.log(`Source: brain-server.js ${bsvLines.length} lines`);
console.log(`Target: memory.js ${memLines.length} lines`);

// Lines 3642-4140 (1-indexed) inclusive. 0-indexed slice [3641, 4140).
const START = 3641;
const END = 4140;

const firstLine = bsvLines[START];
const lastLine = bsvLines[END - 1];
if (!firstLine.includes('_initEpisodicDB')) {
  console.error(`FATAL: expected first line to contain _initEpisodicDB, got: ${JSON.stringify(firstLine)}`);
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
  '_initEpisodicDB', 'storeEpisode', '_serializeEmbedding',
  '_deserializeEmbedding', '_cosineEmbedding', 'decayEpisodes',
  'findPromotionCandidates', 'markEpisodePromoted',
  'recordEpisodeConsolidation', 'recallByMood', 'recallByUser',
  'getEpisodeCount',
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
if (commaCount !== 12) {
  console.error(`FATAL: expected 12 method closings converted to "  },", got ${commaCount}`);
  process.exit(1);
}
console.log(`Converted ${commaCount} method closings to object-literal form.`);

const newMemLines = [];
for (const line of memLines) {
  if (line.includes('METHOD BODIES INJECTED BY')) {
    for (const m of converted) newMemLines.push(m);
  } else if (line.includes('module is a valid empty mixin until the migration runs')) {
    continue;
  } else {
    newMemLines.push(line);
  }
}

const marker = [
  '',
  '  // 12 episodic-memory methods EXTRACTED to server/brain-server/memory.js',
  '  // SERVER_MEMORY_MIXIN (per-concern file architecture, P4.3.c).',
  '  //   _initEpisodicDB, storeEpisode, _serializeEmbedding,',
  '  //   _deserializeEmbedding, _cosineEmbedding, decayEpisodes,',
  '  //   findPromotionCandidates, markEpisodePromoted,',
  '  //   recordEpisodeConsolidation, recallByMood, recallByUser,',
  '  //   getEpisodeCount',
  '  // Attached via Object.assign(ServerBrain.prototype, ...) at the',
  '  // bottom of this file. CommonJS module pattern.',
  '',
];

const newBsvLines = [
  ...bsvLines.slice(0, START),
  ...marker,
  ...bsvLines.slice(END),
];

// Add require after existing state.js require.
let prevRequireIdx = -1;
for (let i = 0; i < newBsvLines.length; i++) {
  if (newBsvLines[i].includes("require('./brain-server/state.js')")) { prevRequireIdx = i; break; }
}
if (prevRequireIdx === -1) {
  console.error('FATAL: state.js require not found');
  process.exit(1);
}
newBsvLines.splice(prevRequireIdx + 1, 0, `const { SERVER_MEMORY_MIXIN } = require('./brain-server/memory.js');`);

// Append Object.assign right after state mixin attach.
let attachIdx = -1;
for (let i = newBsvLines.length - 1; i >= 0; i--) {
  if (newBsvLines[i].includes('Object.assign(ServerBrain.prototype, SERVER_STATE_MIXIN)')) {
    attachIdx = i;
    break;
  }
}
if (attachIdx === -1) {
  console.error('FATAL: SERVER_STATE_MIXIN attach not found');
  process.exit(1);
}
newBsvLines.splice(attachIdx + 1, 0, 'Object.assign(ServerBrain.prototype, SERVER_MEMORY_MIXIN);');

fs.writeFileSync(BSV, newBsvLines.join(bsvEol));
fs.writeFileSync(MEM, newMemLines.join(memEol));

console.log('');
console.log(`brain-server.js: ${bsvLines.length} → ${newBsvLines.length} lines (Δ ${newBsvLines.length - bsvLines.length})`);
console.log(`memory.js:       ${memLines.length} → ${newMemLines.length} lines (Δ ${newMemLines.length - memLines.length})`);
console.log(`Block moved:     ${block.length} lines`);
console.log('OK — P4.3.c migration complete.');
