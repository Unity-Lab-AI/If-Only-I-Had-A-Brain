// scan-dangling-imports.mjs — find the #12 bug class across all P4.x split
// modules: an identifier USED in a module that is EXPORTED by a sibling
// module but neither imported/required nor locally declared in the user
// module → a ReferenceError waiting to fire at call time (hidden by
// node --check AND the esbuild bundle's single flattened scope).
//
// Heuristic static scan (no AST dep). Flags are candidates to verify by eye.
// Run: node scripts/scan-dangling-imports.mjs

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

// All project source modules (export providers).
const SRC_DIRS = ['js/brain', 'js/brain/cluster', 'js/brain/curriculum', 'server', 'server/brain-server', 'js/ai', 'js/ui'];
function listJs(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter(f => f.endsWith('.js') && f !== 'app.bundle.js').map(f => path.join(dir, f));
}
const allFiles = [...new Set(SRC_DIRS.flatMap(listJs))];

// Build export map: exportedName -> [files]. Handles ESM `export const/function/
// class NAME`, `export { A, B }`, and CJS `module.exports = { A, B }` / `exports.A =`.
const exportMap = new Map();
const addExport = (name, file) => { if (!name) return; if (!exportMap.has(name)) exportMap.set(name, []); exportMap.get(name).push(file); };
for (const rel of allFiles) {
  const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of txt.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) addExport(m[1], rel);
  for (const m of txt.matchAll(/export\s*\{([^}]+)\}/g)) for (const part of m[1].split(',')) { const nm = part.trim().split(/\s+as\s+/)[0].trim(); addExport(nm, rel); }
  for (const m of txt.matchAll(/(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) addExport(m[1], rel);
}

// Target = the P4.x split modules.
const TARGETS = [
  ...listJs('js/brain/cluster'),
  ...listJs('js/brain/curriculum'),
  ...listJs('server/brain-server'),
];

const JS_GLOBALS = new Set(['Math','JSON','Object','Array','Number','String','Boolean','Map','Set','Promise','Date','Float64Array','Float32Array','Uint8Array','Uint32Array','Int32Array','ArrayBuffer','console','globalThis','process','Buffer','require','module','exports','setTimeout','setInterval','clearTimeout','clearInterval','Error','TypeError','RangeError','parseInt','parseFloat','isNaN','isFinite','Symbol','Reflect','Proxy','WeakMap','WeakSet','structuredClone','queueMicrotask','performance','URL','TextEncoder','TextDecoder','RegExp','Infinity','NaN','undefined','fetch','AbortController']);

let totalFlags = 0;
for (const rel of TARGETS) {
  const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // imported / required names
  const imported = new Set();
  for (const m of txt.matchAll(/import\s*\{([^}]+)\}\s*from/g)) for (const part of m[1].split(',')) imported.add(part.trim().split(/\s+as\s+/).pop().trim());
  for (const m of txt.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) imported.add(m[1]);
  for (const m of txt.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(/g)) for (const part of m[1].split(',')) imported.add(part.trim().split(':').pop().trim());
  for (const m of txt.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(/g)) imported.add(m[1]);
  // locally declared names (module-level or any-scope const/let/var/function/class + destructures)
  const local = new Set();
  for (const m of txt.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
  for (const m of txt.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=/g)) for (const part of m[1].split(',')) local.add(part.trim().split(':').pop().trim().replace(/\s*=.*$/, ''));
  // own exports
  const own = new Set(); for (const [nm, files] of exportMap) if (files.includes(rel)) own.add(nm);

  // Strip comments + string/template literals + import/require lines so the
  // use-test only sees REAL code identifiers (class-name mentions in comments
  // and docstrings were the dominant false-positive source).
  const codeBody = txt
    .replace(/\/\*[\s\S]*?\*\//g, ' ')        // block comments
    .replace(/^\s*\/\/[^\n]*$/gm, ' ')         // full-line comments
    .replace(/\/\/[^\n]*$/gm, ' ')             // trailing comments
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '` `') // template literals
    .replace(/'(?:\\.|[^'\\])*'/g, "''")        // single-quoted strings
    .replace(/"(?:\\.|[^"\\])*"/g, '""')        // double-quoted strings
    .replace(/^\s*import[^\n]*$/gm, ' ')
    .replace(/require\([^)]*\)/g, ' ');

  const flags = [];
  for (const [name, providers] of exportMap) {
    if (providers.includes(rel)) continue;            // own export
    if (imported.has(name) || local.has(name)) continue;
    if (JS_GLOBALS.has(name)) continue;
    // Detect REAL dangling usage where it actually bites: a call `NAME(` or a
    // constructor `new NAME`. Bare-identifier mentions were the false-positive
    // source; call/ctor sites are unambiguous ReferenceError triggers.
    const esc = name.replace(/[$]/g, '\\$');
    const callRe = new RegExp(`(?<![.\\w$])${esc}\\s*\\(`);
    const ctorRe = new RegExp(`(?<![.\\w$])new\\s+${esc}\\b`);
    if (callRe.test(codeBody) || ctorRe.test(codeBody)) flags.push(`${name}  (exported by ${providers.map(p=>path.basename(p)).join(',')})`);
  }
  if (flags.length) {
    totalFlags += flags.length;
    console.log(`\n⚠ ${rel}:`);
    for (const f of flags) console.log(`    ${f}`);
  }
}
console.log(`\n${totalFlags === 0 ? '✅ no dangling-import candidates' : `Found ${totalFlags} candidate(s) — verify each by eye (some are false positives: shadowed locals, property keys).`}`);
