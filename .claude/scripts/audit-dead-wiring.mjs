// audit-dead-wiring.mjs — THE STACKSWEEP DETECTOR.
//
// Looks for the defect class that has dominated this project: not missing
// features, but FINISHED features that are unwired, orphaned, probed-for and
// never defined, or switched off. `DORMANT.1-.6` (2026-08-25) found
// `_teachWordSpellingDirectFinal` with **37 call sites and zero definitions**
// behind `typeof` guards, `meanVoltage` read as null for seven clusters while
// being computed every tick (a producer/consumer NAME MISMATCH), and
// `separability` — the only instrument measuring the emission margin — with no
// producer at all. 2026-09-01 added two more of the same shape: 20 college
// cells with real runners and no corpus lane, and 268,481 words in cells the
// walk never reaches.
//
// ⛔⛔ THE BLIND SPOT THIS TOOL EXISTS TO NOT REPEAT. That same 2026-08-25 audit
// produced SIX FALSE POSITIVES of its own — `DREAM_NOISE_GATE` is ON by
// default, `MECH_EVERY_CELL` is an opt-out, `DF7_FANOUT_PROPAGATE` auto-enables,
// `_onDeviceLost` is wired via a SETTER, `getLastDescription` is an optional
// adapter, `isTrusted` backs a working gate. **A grep for call sites cannot see
// `obj.method = fn`, nor a handler passed into a registry by string name.** So
// this tool counts BOTH of those as definitions, and its output is explicitly a
// CANDIDATE LIST, never a finding list. Every candidate is verified by hand.
//
// RUN:  node .claude/scripts/audit-dead-wiring.mjs [--json]
// No network. Read-only. Never edits anything.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const SKIP_DIR = /node_modules|\.git|\.scratch|corpora|piper|graphify-out|wiki/;
const CODE = /\.(js|mjs|cjs)$/;
// The bundle is generated from js/brain — including it double-counts every
// definition and makes an unwired method look wired.
const SKIP_FILE = /bundle|\.min\./;

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.test(fp)) walk(fp, out); }
    else if (CODE.test(e.name) && !SKIP_FILE.test(e.name)) out.push(fp);
  }
  return out;
}

const files = walk(ROOT);
const texts = new Map();
for (const f of files) { try { texts.set(f, fs.readFileSync(f, 'utf8')); } catch { /* unreadable */ } }
const haystack = [...texts.values()].join('\n');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── 1. typeof-function guards whose target may not exist anywhere ────────────
const guardCounts = new Map();
for (const [f, t] of texts) {
  for (const m of t.matchAll(/typeof\s+([\w.$]+)\s*===?\s*['"]function['"]/g)) {
    const name = m[1].split('.').pop();
    if (!name || name.length < 3) continue;
    if (!guardCounts.has(name)) guardCounts.set(name, { sites: 0, files: new Set() });
    const g = guardCounts.get(name); g.sites++; g.files.add(path.relative(ROOT, f));
  }
}

// ⛔ PLATFORM BUILT-INS ARE NOT DEFECTS. A `typeof setImmediate === 'function'`
// check is a CORRECT capability probe for an API that exists on Node and not in
// a browser (or vice versa). The first run of this tool flagged 10 of them and
// they were pure noise — a detector whose output is mostly noise trains its
// reader to skim, which is how a real finding gets missed.
const PLATFORM_GLOBALS = new Set([
  'setImmediate', 'requestIdleCallback', 'requestAnimationFrame', 'queueMicrotask',
  'AbortController', 'importScripts', 'instantiateStreaming', 'compileStreaming',
  'getHeapStatistics', 'memoryUsage', 'resourceUsage', 'loadavg', 'unref', 'ref',
  'structuredClone', 'reportError', 'gc', 'setInterval', 'setTimeout', 'fetch',
  'createImageBitmap', 'BroadcastChannel', 'WebAssembly', 'performance',
  // `percentile` is a method of Node's RecordableHistogram, returned by
  // `perf_hooks.monitorEventLoopDelay()` — NOT a repo function, so no
  // definition for it exists here and none should. Verified 2026-09-02 by
  // following the one reported site: `brain-server.js` constructs the histogram
  // at `resolution: 20`, calls `.enable()`, and assigns it to
  // `_eventLoopHistogram`; `state.js` reads `p50`/`p99` off it. The lane is
  // fully live. ⛔ Listed rather than silently tolerated because an allowlist
  // entry with no reason becomes indistinguishable from a suppressed bug.
  'percentile',
]);

// Definition shapes, INCLUDING the blind spots — and widened after the FIRST
// RUN produced 19 candidates of which 18 were false positives:
//   • `activeContributions(now = this.nowFn()) {` — a DEFAULT PARAMETER contains
//     parentheses, so the old `\([^)]*\)` could not match its own method
//     declaration. Four real methods were reported missing because of it.
//   • `this._drugDetector = drugDetectorMod.detectOffer;` — a PLAIN setter
//     assignment with no `.bind()`. This is the exact blind spot the 2026-08-25
//     audit was caught by, and the first version of this tool only handled the
//     `.bind(` variant of it. Two more false positives.
// ⭐ Both fixes make the tool STRICTER about claiming absence, which is the
// direction a detector should err: a missed defect costs a later audit, a false
// accusation costs trust in every line it prints.
function isDefinedAnywhere(name) {
  const n = esc(name);
  const shapes = [
    // ⛔ BALANCED PARENS, NOT A CHARACTER BUDGET. The first attempt at fixing
    // the default-parameter problem used `\([\s\S]{0,200}?\)\s*\{`, which then
    // matched a CALL SITE followed by any block within 200 characters — and it
    // silently swallowed the one genuine finding this sweep had (a call to
    // `getRandomEpisode` with no provider anywhere). A fix for false positives
    // that manufactures false negatives is strictly worse than the bug.
    // One nesting level is enough for `(now = this.nowFn())` and cannot span
    // to an unrelated brace.
    `(?:async\\s+)?${n}\\s*\\((?:[^()]|\\([^()]*\\))*\\)\\s*\\{`, // method/function decl
    `${n}\\s*:\\s*(?:async\\s*)?(?:function|\\()`,          // object property
    `${n}\\s*=\\s*(?:async\\s*)?(?:function|\\()`,          // function assignment
    `${n}\\s*=\\s*[\\w.$\\[\\]]+`,                          // PLAIN setter assignment ← blind spot
    `['"\`]${n}['"\`]`,                                     // registry / string dispatch ← blind spot
    `\\bget\\s+${n}\\s*\\(`,                                // getter
  ];
  return shapes.some((s) => new RegExp(s).test(haystack));
}

const guardOrphans = [];
for (const [name, g] of guardCounts) {
  if (PLATFORM_GLOBALS.has(name)) continue;
  if (!isDefinedAnywhere(name)) guardOrphans.push({ name, sites: g.sites, where: [...g.files].slice(0, 3) });
}
guardOrphans.sort((a, b) => b.sites - a.sites);

// ── 2. exported symbols nothing outside their own file references ────────────
const exportOrphans = [];
for (const [f, t] of texts) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  for (const m of t.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([\w$]+)/gm)) {
    const name = m[1];
    if (name.length < 4) continue;
    // Count references OUTSIDE the defining file only.
    let refs = 0;
    const re = new RegExp(`\\b${esc(name)}\\b`, 'g');
    for (const [g, gt] of texts) {
      if (g === f) continue;
      const hit = gt.match(re);
      if (hit) refs += hit.length;
    }
    if (refs === 0) exportOrphans.push({ name, file: rel });
  }
}

// ── 3. env flags: declared in code vs documented anywhere ────────────────────
const envFlags = new Map();
for (const [f, t] of texts) {
  for (const m of t.matchAll(/process\.env\.([A-Z][A-Z0-9_]{3,})/g)) {
    const k = m[1];
    if (!envFlags.has(k)) envFlags.set(k, new Set());
    envFlags.get(k).add(path.relative(ROOT, f).replace(/\\/g, '/'));
  }
}
let docsBlob = '';
for (const d of ['docs', 'deploy', '.claude']) {
  for (const f of walk(path.join(ROOT, d), []).concat(
    (() => { try { return fs.readdirSync(path.join(ROOT, d)).filter((x) => /\.(md|sh|bat)$/.test(x)).map((x) => path.join(ROOT, d, x)); } catch { return []; } })(),
  )) { try { docsBlob += fs.readFileSync(f, 'utf8'); } catch { /* skip */ } }
}
const undocumentedEnv = [...envFlags.keys()].filter((k) => !docsBlob.includes(k)).sort();

const report = {
  filesScanned: files.length,
  guardNames: guardCounts.size,
  guardSites: [...guardCounts.values()].reduce((a, g) => a + g.sites, 0),
  guardOrphans,
  exportOrphans,
  envFlags: envFlags.size,
  undocumentedEnv,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('DEAD-WIRING SWEEP — candidates, NOT findings\n');
  console.log(`  files scanned                : ${report.filesScanned}`);
  console.log(`  typeof-function guard names  : ${report.guardNames}  (${report.guardSites} sites)`);
  console.log(`  ⛔ guarded, NO definition     : ${guardOrphans.length}`);
  for (const g of guardOrphans.slice(0, 20)) console.log(`       ${g.name.padEnd(36)} ${String(g.sites).padStart(3)} sites   ${g.where[0] || ''}`);
  if (guardOrphans.length > 20) console.log(`       … +${guardOrphans.length - 20} more`);
  console.log(`\n  ⛔ exports referenced nowhere : ${exportOrphans.length}`);
  for (const e of exportOrphans.slice(0, 20)) console.log(`       ${e.name.padEnd(36)} ${e.file}`);
  if (exportOrphans.length > 20) console.log(`       … +${exportOrphans.length - 20} more`);
  console.log(`\n  env flags in code            : ${report.envFlags}`);
  console.log(`  ⚠ undocumented anywhere      : ${undocumentedEnv.length}`);
  if (undocumentedEnv.length) console.log(`       ${undocumentedEnv.slice(0, 24).join('  ')}${undocumentedEnv.length > 24 ? `  … +${undocumentedEnv.length - 24}` : ''}`);
  console.log('\n  ⛔ EVERY LINE ABOVE IS A CANDIDATE. The 2026-08-25 dormant audit');
  console.log('     produced SIX false positives because a grep cannot see a setter');
  console.log('     assignment or a registry lookup. Verify each one by hand.');
}
