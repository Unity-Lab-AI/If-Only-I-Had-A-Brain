// P4.2.a — Extract 6 telemetry methods from cluster.js into
// cluster/telemetry.js CLUSTER_TELEMETRY_MIXIN. Same migration pattern
// as P4.1.a/b/c/d (deterministic Node script, CRLF-preserving,
// brace-depth method-closing detection for class→object-literal
// trailing-comma conversion, sanity-check method signature order).
//
// Methods moved (cluster.js lines 3709-3923, 215 lines):
//   trackRecentEmission
//   initCompositionalTelemetry
//   classifyCompositionalEmission
//   _recordWordCreationCandidate
//   getWordCreationCandidates
//   getCompositionalStats

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLUSTER = path.join(ROOT, 'js/brain/cluster.js');
const TEL = path.join(ROOT, 'js/brain/cluster/telemetry.js');

const clusterText = fs.readFileSync(CLUSTER, 'utf8');
const telText = fs.readFileSync(TEL, 'utf8');

const clusterEol = clusterText.includes('\r\n') ? '\r\n' : '\n';
const telEol = telText.includes('\r\n') ? '\r\n' : '\n';
console.log(`Line endings — cluster.js: ${clusterEol === '\r\n' ? 'CRLF' : 'LF'}, telemetry.js: ${telEol === '\r\n' ? 'CRLF' : 'LF'}`);

const clusterLines = clusterText.split(/\r?\n/);
const telLines = telText.split(/\r?\n/);

console.log(`Source: cluster.js ${clusterLines.length} lines`);
console.log(`Target: telemetry.js ${telLines.length} lines`);

// Lines 3709-3923 (1-indexed) inclusive. 0-indexed slice [3708, 3923).
const START = 3708;     // line 3709 is "  trackRecentEmission(word) {"
const END = 3923;       // line 3923 is "  }" closing getCompositionalStats (exclusive end)

// Sanity checks.
const firstLine = clusterLines[START];
const lastLine = clusterLines[END - 1];
if (!firstLine.includes('trackRecentEmission')) {
  console.error(`FATAL: expected first line to contain trackRecentEmission, got: ${JSON.stringify(firstLine)}`);
  process.exit(1);
}
if (lastLine.trim() !== '}') {
  console.error(`FATAL: expected last line to be closing brace, got: ${JSON.stringify(lastLine)}`);
  process.exit(1);
}
const peek = clusterLines[END];
console.log(`Block starts: ${JSON.stringify(firstLine)}`);
console.log(`Block ends:   ${JSON.stringify(lastLine)}`);
console.log(`Line after:   ${JSON.stringify(peek)}`);

const block = clusterLines.slice(START, END);

// Verify 6 expected method signatures in order.
// Note: cluster.js methods do NOT use `async` prefix on the telemetry
// methods (they're sync getters/recorders) so the regex differs from
// the P4.1 curriculum migration. Match any 2-space-indent identifier
// followed by `(`.
const expected = [
  'trackRecentEmission',
  'initCompositionalTelemetry',
  'classifyCompositionalEmission',
  '_recordWordCreationCandidate',
  'getWordCreationCandidates',
  'getCompositionalStats',
];
const found = [];
for (const line of block) {
  // 2-space indent + (optional async) + identifier + `(`
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

// Convert class-method form → object-literal form (trailing comma after
// closing `}` of each method).
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

// Build telemetry.js with the converted methods. Replace the placeholder
// stub mixin body with the real methods.
const newTelLines = [];
for (const line of telLines) {
  if (line.includes('METHOD BODIES INJECTED BY')) {
    // Insert the converted block here (sans the indented closing brace of
    // the export wrapper).
    for (const m of converted) newTelLines.push(m);
  } else if (line.includes('module is a valid empty mixin until the migration runs')) {
    // Skip the second placeholder comment line.
    continue;
  } else {
    newTelLines.push(line);
  }
}

// Replace the original block in cluster.js with a marker comment.
const marker = [
  '',
  '  // 6 telemetry methods EXTRACTED to js/brain/cluster/telemetry.js',
  '  // CLUSTER_TELEMETRY_MIXIN (per-module-file architecture, P4.2.a).',
  '  //   trackRecentEmission, initCompositionalTelemetry,',
  '  //   classifyCompositionalEmission, _recordWordCreationCandidate,',
  '  //   getWordCreationCandidates, getCompositionalStats',
  '  // Attached via Object.assign(NeuronCluster.prototype, ...) at the',
  '  // bottom of this file. All methods accessible identically through',
  '  // the prototype chain.',
  '',
];

const newClusterLines = [
  ...clusterLines.slice(0, START),
  ...marker,
  ...clusterLines.slice(END),
];

// Add the import + Object.assign at the bottom of cluster.js. The
// pattern matches the curriculum.js K_MIXIN attach (which already exists
// in cluster.js? No — it's a different file). For cluster.js this is
// the FIRST mixin attach so we add the import right after the file's
// last existing import and the Object.assign at the very bottom (after
// the last class declaration).
//
// Strategy: find the last `^import ` line in cluster.js and inject
// `import { CLUSTER_TELEMETRY_MIXIN } from './cluster/telemetry.js';`
// right after it. Then append `Object.assign(NeuronCluster.prototype,
// CLUSTER_TELEMETRY_MIXIN);` at the bottom (after any existing exports).
let lastImportIdx = -1;
for (let i = 0; i < newClusterLines.length; i++) {
  if (/^import\s/.test(newClusterLines[i])) lastImportIdx = i;
}
if (lastImportIdx === -1) {
  console.error('FATAL: no existing imports found in cluster.js — cannot add mixin import');
  process.exit(1);
}
const importLine = `import { CLUSTER_TELEMETRY_MIXIN } from './cluster/telemetry.js';`;
newClusterLines.splice(lastImportIdx + 1, 0, importLine);

// Append Object.assign at the bottom.
const attachLines = [
  '',
  '// Attach per-module mixins to NeuronCluster.prototype. Per-module',
  '// architecture per js/brain/cluster/README.md. Each mixin is a plain',
  '// object of methods; Object.assign copies them onto the prototype so',
  '// calls like `cluster.trackRecentEmission(word)` resolve identically',
  '// to the pre-split layout.',
  'Object.assign(NeuronCluster.prototype, CLUSTER_TELEMETRY_MIXIN);',
  '',
];
// Append at end, but BEFORE any trailing blank line.
let trailingBlankCount = 0;
while (newClusterLines.length > 0 && newClusterLines[newClusterLines.length - 1] === '') {
  trailingBlankCount++;
  newClusterLines.pop();
}
newClusterLines.push(...attachLines);
for (let i = 0; i < trailingBlankCount; i++) newClusterLines.push('');

fs.writeFileSync(CLUSTER, newClusterLines.join(clusterEol));
fs.writeFileSync(TEL, newTelLines.join(telEol));

console.log('');
console.log(`cluster.js:    ${clusterLines.length} → ${newClusterLines.length} lines (Δ ${newClusterLines.length - clusterLines.length})`);
console.log(`telemetry.js:  ${telLines.length} → ${newTelLines.length} lines (Δ ${newTelLines.length - telLines.length})`);
console.log(`Block moved:   ${block.length} lines`);
console.log('OK — P4.2.a migration complete.');
