// One-shot updater for the moved launcher scripts. Adds a "cd to project
// root" shim at the top of each .bat / .sh file, then rewrites the
// remaining `%~dp0` (Windows) / `$(dirname "$0")/` (Linux) references to
// climb one extra level so they resolve to project-root paths exactly the
// way they did when these files lived in the repo root.
//
// Idempotent: looks for a sentinel marker comment so re-running doesn't
// stack multiple shims on top of each other.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(process.cwd());

const BAT_FILES = ['windows/start.bat', 'windows/Savestart.bat', 'windows/stop.bat', 'windows/GPUCONFIGURE.bat'];
const SH_FILES  = ['linux/start.sh', 'linux/Savestart.sh', 'linux/stop.sh'];

const BAT_SHIM = `REM Launcher lives in windows\\ — cd up one level so the rest of the script
REM resolves paths from the project root (corpora\\, server\\, js\\, etc.)
REM exactly the way it did when this file used to live in the root.
cd /d "%~dp0.."`;

const SH_SHIM = `# Launcher lives in linux/ — cd up one level so the rest of the script
# resolves paths from the project root (corpora/, server/, js/, etc.)
# exactly the way it did when this file used to live in the root.
cd "$(dirname "$0")/.." || exit 1`;

const BAT_SHIM_MARK = 'Launcher lives in windows';
const SH_SHIM_MARK = 'Launcher lives in linux';

let totalChanges = 0;

for (const rel of BAT_FILES) {
  const path = join(ROOT, rel);
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch (err) { console.warn(`skip ${rel}: ${err.message}`); continue; }
  const before = text;

  // 1. Insert shim if missing. Anchor it to the line immediately after
  // `@echo off` so paths take effect before any other directive.
  if (!text.includes(BAT_SHIM_MARK)) {
    text = text.replace(/^@echo off\s*\r?\n/m, m => m + BAT_SHIM + '\r\n');
  }

  // 2. Rewrite remaining `%~dp0` so they climb one extra level. Skip
  // any line containing the shim marker (those are deliberate).
  text = text.split(/\r?\n/).map((line) => {
    if (line.includes(BAT_SHIM_MARK)) return line;
    if (line.trim() === 'cd /d "%~dp0.."') return line;
    return line.replace(/%~dp0(?!\.\.)/g, '%~dp0..\\');
  }).join('\r\n');

  if (text !== before) {
    writeFileSync(path, text, 'utf8');
    console.log(`${rel}: shim + path fixes applied`);
    totalChanges += 1;
  }
}

for (const rel of SH_FILES) {
  const path = join(ROOT, rel);
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch (err) { console.warn(`skip ${rel}: ${err.message}`); continue; }
  const before = text;

  // 1. Insert shim if missing. Anchor after the shebang.
  if (!text.includes(SH_SHIM_MARK)) {
    text = text.replace(/^(#!\/[^\r\n]*\r?\n)/, m => m + SH_SHIM + '\n');
  }

  // 2. Rewrite remaining `$(dirname "$0")/...` references so they
  // climb one extra level.
  text = text.split(/\r?\n/).map((line) => {
    if (line.includes(SH_SHIM_MARK)) return line;
    if (line.trim() === 'cd "$(dirname "$0")/.." || exit 1') return line;
    // Skip if the line already has /.. in the dirname expression.
    return line.replace(/\$\(dirname "\$0"\)\/(?!\.\.)/g, '$(dirname "$0")/../');
  }).join('\n');

  if (text !== before) {
    writeFileSync(path, text, 'utf8');
    console.log(`${rel}: shim + path fixes applied`);
    totalChanges += 1;
  }
}

console.log(`\nDone. ${totalChanges} files updated.`);
