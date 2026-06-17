// P4.3.d — Extract 6 chat-path + inner-voice methods from brain-server.js
// into brain-server/chat.js SERVER_CHAT_MIXIN. CommonJS module pattern.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BSV = path.join(ROOT, 'server/brain-server.js');
const CHAT = path.join(ROOT, 'server/brain-server/chat.js');

const bsvText = fs.readFileSync(BSV, 'utf8');
const chatText = fs.readFileSync(CHAT, 'utf8');

const bsvEol = bsvText.includes('\r\n') ? '\r\n' : '\n';
const chatEol = chatText.includes('\r\n') ? '\r\n' : '\n';
console.log(`Line endings — brain-server.js: ${bsvEol === '\r\n' ? 'CRLF' : 'LF'}, chat.js: ${chatEol === '\r\n' ? 'CRLF' : 'LF'}`);

const bsvLines = bsvText.split(/\r?\n/);
const chatLines = chatText.split(/\r?\n/);

console.log(`Source: brain-server.js ${bsvLines.length} lines`);
console.log(`Target: chat.js ${chatLines.length} lines`);

// Lines 3150-4343 (1-indexed) inclusive. 0-indexed slice [3149, 4343).
const START = 3149;
const END = 4343;

const firstLine = bsvLines[START];
const lastLine = bsvLines[END - 1];
if (!firstLine.includes('processAndRespond')) {
  console.error(`FATAL: expected first line to contain processAndRespond, got: ${JSON.stringify(firstLine)}`);
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
  'processAndRespond', '_updatePerfStats', '_drugStateLabel',
  '_drugSnapshot', '_getSharedMood', '_learnWords',
  '_innerVoiceTick', '_sampleCurrentVocab', '_sampleCurrentSentence',
  '_shouldEmitInnerThought', '_pickInnerThoughtSeed',
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
if (commaCount !== 11) {
  console.error(`FATAL: expected 11 method closings converted to "  },", got ${commaCount}`);
  process.exit(1);
}
console.log(`Converted ${commaCount} method closings to object-literal form.`);

const newChatLines = [];
for (const line of chatLines) {
  if (line.includes('METHOD BODIES INJECTED BY')) {
    for (const m of converted) newChatLines.push(m);
  } else if (line.includes('module is a valid empty mixin until the migration runs')) {
    continue;
  } else {
    newChatLines.push(line);
  }
}

const marker = [
  '',
  '  // 11 chat-path + inner-voice + chat-adjacent-utility methods EXTRACTED',
  '  // to server/brain-server/chat.js SERVER_CHAT_MIXIN (per-concern file',
  '  // architecture, P4.3.d).',
  '  //   processAndRespond, _updatePerfStats, _drugStateLabel, _drugSnapshot,',
  '  //   _getSharedMood, _learnWords, _innerVoiceTick, _sampleCurrentVocab,',
  '  //   _sampleCurrentSentence, _shouldEmitInnerThought, _pickInnerThoughtSeed',
  '  // P6.3 chat-time deep Hebbian + multi-turn coherence + emission-from-cortex',
  '  // paths preserved in moved bodies. Attached via',
  '  // Object.assign(ServerBrain.prototype, ...) at the bottom of this file.',
  '  // CommonJS module pattern.',
  '',
];

const newBsvLines = [
  ...bsvLines.slice(0, START),
  ...marker,
  ...bsvLines.slice(END),
];

let prevRequireIdx = -1;
for (let i = 0; i < newBsvLines.length; i++) {
  if (newBsvLines[i].includes("require('./brain-server/memory.js')")) { prevRequireIdx = i; break; }
}
if (prevRequireIdx === -1) {
  console.error('FATAL: memory.js require not found');
  process.exit(1);
}
newBsvLines.splice(prevRequireIdx + 1, 0, `const { SERVER_CHAT_MIXIN } = require('./brain-server/chat.js');`);

let attachIdx = -1;
for (let i = newBsvLines.length - 1; i >= 0; i--) {
  if (newBsvLines[i].includes('Object.assign(ServerBrain.prototype, SERVER_MEMORY_MIXIN)')) {
    attachIdx = i;
    break;
  }
}
if (attachIdx === -1) {
  console.error('FATAL: SERVER_MEMORY_MIXIN attach not found');
  process.exit(1);
}
newBsvLines.splice(attachIdx + 1, 0, 'Object.assign(ServerBrain.prototype, SERVER_CHAT_MIXIN);');

fs.writeFileSync(BSV, newBsvLines.join(bsvEol));
fs.writeFileSync(CHAT, newChatLines.join(chatEol));

console.log('');
console.log(`brain-server.js: ${bsvLines.length} → ${newBsvLines.length} lines (Δ ${newBsvLines.length - bsvLines.length})`);
console.log(`chat.js:         ${chatLines.length} → ${newChatLines.length} lines (Δ ${newChatLines.length - chatLines.length})`);
console.log(`Block moved:     ${block.length} lines`);
console.log('OK — P4.3.d migration complete.');
