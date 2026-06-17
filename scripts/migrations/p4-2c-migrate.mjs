// P4.2.c — Extract 6 Hebbian / GPU-upload methods from cluster.js into
// cluster/hebbian.js CLUSTER_HEBBIAN_MIXIN. Same migration pattern as
// P4.2.a + P4.1.a/b/c/d.
//
// Methods moved (cluster.js lines 4689-5379, 691 lines):
//   _crossRegionHebbian, initGpu, intraSynapsesHebbian,
//   intraSynapsesBcm, _crossRegionAntiHebbian, intraSynapsesAntiHebbian

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLUSTER = path.join(ROOT, 'js/brain/cluster.js');
const HEB = path.join(ROOT, 'js/brain/cluster/hebbian.js');

const clusterText = fs.readFileSync(CLUSTER, 'utf8');
const hebText = fs.readFileSync(HEB, 'utf8');

const clusterEol = clusterText.includes('\r\n') ? '\r\n' : '\n';
const hebEol = hebText.includes('\r\n') ? '\r\n' : '\n';
console.log(`Line endings — cluster.js: ${clusterEol === '\r\n' ? 'CRLF' : 'LF'}, hebbian.js: ${hebEol === '\r\n' ? 'CRLF' : 'LF'}`);

const clusterLines = clusterText.split(/\r?\n/);
const hebLines = hebText.split(/\r?\n/);

console.log(`Source: cluster.js ${clusterLines.length} lines`);
console.log(`Target: hebbian.js ${hebLines.length} lines`);

// Lines 4689-5379 (1-indexed) inclusive. 0-indexed slice [4688, 5379).
const START = 4688;     // line 4689 is "  async _crossRegionHebbian(lr, opts = {}) {"
const END = 5379;       // line 5379 is "  }" closing intraSynapsesAntiHebbian (exclusive end)

const firstLine = clusterLines[START];
const lastLine = clusterLines[END - 1];
if (!firstLine.includes('_crossRegionHebbian')) {
  console.error(`FATAL: expected first line to contain _crossRegionHebbian, got: ${JSON.stringify(firstLine)}`);
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
  '_crossRegionHebbian',
  'initGpu',
  'intraSynapsesHebbian',
  'intraSynapsesBcm',
  '_crossRegionAntiHebbian',
  'intraSynapsesAntiHebbian',
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

// Inject methods into hebbian.js, replacing the placeholder marker line.
const newHebLines = [];
for (const line of hebLines) {
  if (line.includes('METHOD BODIES INJECTED BY')) {
    for (const m of converted) newHebLines.push(m);
  } else if (line.includes('module is a valid empty mixin until the migration runs')) {
    continue;
  } else {
    newHebLines.push(line);
  }
}

// Replace block in cluster.js with marker comment.
const marker = [
  '',
  '  // 6 Hebbian + GPU-upload methods EXTRACTED to js/brain/cluster/hebbian.js',
  '  // CLUSTER_HEBBIAN_MIXIN (per-module-file architecture, P4.2.c).',
  '  //   _crossRegionHebbian, initGpu, intraSynapsesHebbian,',
  '  //   intraSynapsesBcm, _crossRegionAntiHebbian, intraSynapsesAntiHebbian',
  '  // Attached via Object.assign(NeuronCluster.prototype, ...) at the',
  '  // bottom of this file. P2.3 kScales build + plumbing through the 3',
  '  // ojaUpdate sites of _crossRegionHebbian is preserved in the moved',
  '  // method body.',
  '',
];

const newClusterLines = [
  ...clusterLines.slice(0, START),
  ...marker,
  ...clusterLines.slice(END),
];

// Add the import after the last existing import.
let lastImportIdx = -1;
for (let i = 0; i < newClusterLines.length; i++) {
  if (/^import\s/.test(newClusterLines[i])) lastImportIdx = i;
}
if (lastImportIdx === -1) {
  console.error('FATAL: no existing imports found in cluster.js');
  process.exit(1);
}
const importLine = `import { CLUSTER_HEBBIAN_MIXIN } from './cluster/hebbian.js';`;
newClusterLines.splice(lastImportIdx + 1, 0, importLine);

// Add Object.assign at bottom, right after the existing
// CLUSTER_TELEMETRY_MIXIN attach.
let attachIdx = -1;
for (let i = newClusterLines.length - 1; i >= 0; i--) {
  if (newClusterLines[i].includes('Object.assign(NeuronCluster.prototype, CLUSTER_TELEMETRY_MIXIN)')) {
    attachIdx = i;
    break;
  }
}
if (attachIdx === -1) {
  console.error('FATAL: CLUSTER_TELEMETRY_MIXIN attach not found');
  process.exit(1);
}
newClusterLines.splice(attachIdx + 1, 0, 'Object.assign(NeuronCluster.prototype, CLUSTER_HEBBIAN_MIXIN);');

fs.writeFileSync(CLUSTER, newClusterLines.join(clusterEol));
fs.writeFileSync(HEB, newHebLines.join(hebEol));

console.log('');
console.log(`cluster.js:    ${clusterLines.length} → ${newClusterLines.length} lines (Δ ${newClusterLines.length - clusterLines.length})`);
console.log(`hebbian.js:    ${hebLines.length} → ${newHebLines.length} lines (Δ ${newHebLines.length - hebLines.length})`);
console.log(`Block moved:   ${block.length} lines`);
console.log('OK — P4.2.c migration complete.');
