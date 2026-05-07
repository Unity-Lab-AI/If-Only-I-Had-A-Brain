// One-shot rename of LAW-banned T-numbered + iter-named property
// identifiers. Property names containing internal task numbers /
// session IDs were leaking the workflow markers into source code
// regardless of comments — same LAW that bans iter25-X.Y in comments
// applies to identifiers.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(process.cwd());
const FILES = [
  'server/brain-server.js',
  'dashboard.html',
  'js/ui/brain-3d.js',
  'js/app.js',
];
const MAP = {
  '_t1826DroppedCount': '_wsDroppedCount',
  '_t1826AwaitedCount': '_wsAbsorbedCount',
  '_t1826EnobufsCount': '_wsEnobufsCount',
  '_t1826LastLogMs': '_wsLastDropLogMs',
  '_t1826AwaitLastLogMs': '_wsLastAbsorbLogMs',
  '_t1826LastDropTs': '_wsLastDropTs',
  '_iter25LSmokeTestResult': '_dictionarySmokeTestResult',
  // CSS class + DOM id renames — public/visible source so iter IDs
  // here are LAW-banned. Order matters: longer prefixes first so we
  // don't double-rename (iter25m-theta-breath before iter25m-theta).
  'iter25m-theta-breath': 'theta-breath',
  'iter25m-theta-pulse': 'theta-pulse',
  'iter25m-panel': 'consciousness-panel',
  'iter25n-panel': 'ws-pressure-panel',
  'd-iter25m-': 'd-cortex-',
  'd-iter25n-': 'd-ws-',
  // The state.iter25m / state.iter25n keys also leak iter IDs into the
  // wire format. Rename to neutral feature-named keys; both server
  // emit and dashboard read paths get updated in one pass.
  'state.iter25m': 'state.consciousness',
  'state.iter25n': 'state.wsPressure',
  's.iter25m': 's.consciousness',
  's.iter25n': 's.wsPressure',
  ' iter25m:': ' consciousness:',
  ' iter25n:': ' wsPressure:',
};

let totalChanges = 0;
for (const rel of FILES) {
  const path = join(ROOT, rel);
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch (err) { console.warn(`skip ${rel}: ${err.message}`); continue; }
  const before = text;
  for (const [oldName, newName] of Object.entries(MAP)) {
    const re = new RegExp(oldName.replace(/[$]/g, '\\$&'), 'g');
    text = text.replace(re, newName);
  }
  if (text !== before) {
    writeFileSync(path, text, 'utf8');
    let count = 0;
    for (const oldName of Object.keys(MAP)) {
      const re = new RegExp(oldName.replace(/[$]/g, '\\$&'), 'g');
      count += (before.match(re) || []).length;
    }
    console.log(`${rel}: renamed ${count} property hits`);
    totalChanges += count;
  }
}
console.log(`\nDone. Total: ${totalChanges} renames.`);
