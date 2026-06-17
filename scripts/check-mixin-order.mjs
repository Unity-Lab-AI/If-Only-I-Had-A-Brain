// scripts/check-mixin-order.mjs — Static analysis lint for the
// Object.assign mixin chain at cluster.js + brain-server.js entry-point
// bottom. Per audit task D.2.
//
// PROBLEM: After P4.2 (cluster.js per-module split) + P4.3 (brain-server.js
// per-concern split), method dispatch crosses mixin boundaries. The
// Object.assign chain at file bottom MUST run before any cross-mixin
// dispatch happens. If a mixin is forgotten, OR added in the wrong
// order (rare but possible), OR a method symbol is mis-exported from
// the mixin file, runtime dispatch silently fails (method undefined).
//
// WHAT THIS CHECKS:
//   1. Each mixin attach file (cluster/{telemetry,hebbian,emit,probe}.js
//      + brain-server/{gpu,state,memory,chat}.js) exports the expected
//      MIXIN symbol.
//   2. Each Object.assign(X.prototype, MIXIN) line in cluster.js +
//      brain-server.js references the imported MIXIN by name.
//   3. Every method DEFINED in a mixin module is REACHABLE from the
//      consumer (i.e., import name resolves to a symbol of the right
//      shape).
//   4. No method appears in TWO mixins (collision risk).
//
// USAGE:
//   node scripts/check-mixin-order.mjs
//
// EXIT 0 = chain OK, 1 = drift detected, 2 = driver error.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MIXIN_CHAIN = [
  { consumer: 'js/brain/cluster.js', mixinFiles: [
    { file: 'js/brain/cluster/telemetry.js', symbol: 'CLUSTER_TELEMETRY_MIXIN' },
    { file: 'js/brain/cluster/hebbian.js',   symbol: 'CLUSTER_HEBBIAN_MIXIN' },
    { file: 'js/brain/cluster/emit.js',      symbol: 'CLUSTER_EMIT_MIXIN' },
    { file: 'js/brain/cluster/probe.js',     symbol: 'CLUSTER_PROBE_MIXIN' },
  ]},
  { consumer: 'server/brain-server.js', mixinFiles: [
    { file: 'server/brain-server/gpu.js',    symbol: 'SERVER_GPU_MIXIN' },
    { file: 'server/brain-server/state.js',  symbol: 'SERVER_STATE_MIXIN' },
    { file: 'server/brain-server/memory.js', symbol: 'SERVER_MEMORY_MIXIN' },
    { file: 'server/brain-server/chat.js',   symbol: 'SERVER_CHAT_MIXIN' },
  ]},
];

const gaps = [];

async function read(relPath) {
  return fsp.readFile(path.join(ROOT, relPath), 'utf8');
}

function findMethodKeys(mixinBody) {
  // Heuristic — match `methodName(...)` or `methodName: function` or
  // `async methodName(...)` inside the mixin object literal. Comments
  // stripped first to avoid commented-out method names.
  const stripped = mixinBody
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const matches = new Set();
  const methodRe = /(?:^|[\s,{])(?:async\s+)?([_a-zA-Z$][_a-zA-Z0-9$]*)\s*(?:\(|:\s*(?:async\s+)?function)/g;
  let m;
  while ((m = methodRe.exec(stripped)) != null) {
    const name = m[1];
    // Filter out obvious non-method tokens
    if (['if', 'for', 'while', 'switch', 'return', 'const', 'let', 'var', 'function', 'class', 'new', 'typeof', 'instanceof', 'do', 'else', 'try', 'catch', 'throw', 'async', 'await', 'yield', 'import', 'export', 'from', 'in', 'of', 'as'].includes(name)) continue;
    matches.add(name);
  }
  return matches;
}

async function checkOne({ consumer, mixinFiles }) {
  console.log(`\n── ${consumer} ──`);
  const consumerSrc = await read(consumer);
  const allMethods = new Map(); // methodName -> first mixin file where it appeared

  for (const { file, symbol } of mixinFiles) {
    // 1. Mixin file exists + exports the symbol
    let mixinSrc;
    try { mixinSrc = await read(file); }
    catch (err) { gaps.push(`${consumer}: mixin file ${file} not found (${err.code})`); console.log(`  ❌ ${file} NOT FOUND`); continue; }

    const isCJS = mixinSrc.includes('module.exports');
    const isESM = mixinSrc.includes('export const') || mixinSrc.includes('export {');
    if (!isCJS && !isESM) {
      gaps.push(`${file}: no module.exports nor ESM export found`);
      console.log(`  ❌ ${file} — no export pattern detected`);
      continue;
    }
    if (!new RegExp(`\\b${symbol}\\b`).test(mixinSrc)) {
      gaps.push(`${file}: symbol ${symbol} not present in source`);
      console.log(`  ❌ ${file} — symbol ${symbol} missing`);
      continue;
    }

    // 2. Consumer imports + Object.assign references the symbol
    const importRe = new RegExp(`(?:import\\s+\\{[^}]*\\b${symbol}\\b[^}]*\\}|require\\([^)]+\\)[^;]*\\b${symbol}\\b)`);
    if (!importRe.test(consumerSrc)) {
      gaps.push(`${consumer}: ${symbol} not imported`);
      console.log(`  ❌ ${symbol} not imported in consumer`);
      continue;
    }
    const assignRe = new RegExp(`Object\\.assign\\([^,]+,\\s*${symbol}\\)`);
    if (!assignRe.test(consumerSrc)) {
      gaps.push(`${consumer}: Object.assign(...,${symbol}) line missing`);
      console.log(`  ❌ Object.assign(${symbol}) line missing`);
      continue;
    }

    // 3. Extract methods + detect collisions
    const bodyStart = mixinSrc.indexOf('=');
    const body = mixinSrc.slice(bodyStart);
    const methods = findMethodKeys(body);
    let dupes = 0;
    for (const m of methods) {
      if (allMethods.has(m)) {
        gaps.push(`${file}: method '${m}' collides with previous mixin ${allMethods.get(m)}`);
        dupes += 1;
      } else {
        allMethods.set(m, file);
      }
    }
    console.log(`  ✓ ${symbol.padEnd(28)} ← ${file}  (~${methods.size} methods${dupes > 0 ? `, ${dupes} collisions` : ''})`);
  }
}

(async () => {
  console.log('━'.repeat(72));
  console.log('scripts/check-mixin-order.mjs — D.2 mixin chain lint');
  console.log('━'.repeat(72));

  for (const chain of MIXIN_CHAIN) {
    try { await checkOne(chain); }
    catch (err) { gaps.push(`${chain.consumer}: driver error — ${err.message}`); }
  }

  console.log('\n' + '━'.repeat(72));
  if (gaps.length === 0) {
    console.log('✅ PASS — all mixin chains resolve. Object.assign attaches present + symbols imported + no method collisions.');
    process.exit(0);
  } else {
    console.log(`❌ FAIL — ${gaps.length} issue${gaps.length === 1 ? '' : 's'} detected:`);
    for (const g of gaps) console.log(`  · ${g}`);
    process.exit(1);
  }
})().catch((err) => { console.error('[mixin-order] driver error:', err); process.exit(2); });
