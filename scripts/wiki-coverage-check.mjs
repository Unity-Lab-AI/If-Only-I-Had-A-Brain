// scripts/wiki-coverage-check.mjs
//
// WIKIFULL.1 — is every tracked file in the stack actually named on a wiki page?
//
// ⛔ THE POINT: a wiki page that SAYS "all files are covered" is worth nothing.
// That sentence is the same class of lie as a doc claiming a route was removed
// while it ran in production for four more months. Coverage has to be a NUMBER
// somebody can recompute, so this recomputes it: enumerate tracked files,
// enumerate the paths named anywhere under wiki/, print the difference.
//
// ⚠ REPORT-ONLY. It never edits a page — same law as its sibling
// scripts/doc-drift-check.mjs, and for the same reason: a checker that rewrote a
// page to make itself pass would be the exact failure it exists to catch.
//
// ⚠ FAIL-SOFT ON A MISSING wiki/. `wiki/` is gitignored on the operator's word,
// so a teammate's clone legitimately has no wiki at all. Absence of the tree is
// not evidence of missing coverage, and reporting it as failure would train
// people to ignore this tool.
//
// ⭐ MATCHING RULE, and it is deliberately strict about ambiguity:
//   1. Full repo-relative path present in any wiki page  → COVERED (exact)
//   2. Basename present AND that basename is UNIQUE across the whole tracked
//      tree                                              → COVERED (basename)
//   3. Basename is NOT unique (README.md, package.json, grade3.json …) → a
//      disambiguating path suffix is required. `README.md` alone can never
//      cover eleven different READMEs, and letting it would be a false pass in
//      the reassuring direction.
//
// Usage:  node scripts/wiki-coverage-check.mjs [--strict] [--list]
//   --strict  exit 1 when anything is uncovered (default: always exit 0)
//   --list    print every uncovered path, not just the first 40

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI = path.join(ROOT, 'wiki');
const STRICT = process.argv.includes('--strict');
const LIST_ALL = process.argv.includes('--list');

// ── the wiki text ─────────────────────────────────────────────────────────
function wikiPages(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) wikiPages(p, out);
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

// ── the tracked tree ──────────────────────────────────────────────────────
function trackedFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

// ── run ───────────────────────────────────────────────────────────────────
console.log('\nWIKI COVERAGE CHECK\n' + '─'.repeat(60));

if (!existsSync(WIKI)) {
  // ⛔ Not a finding. wiki/ is gitignored; a fresh clone has none.
  console.log('  skip  wiki/ is not present in this checkout (it is gitignored).');
  console.log('        Nothing was checked — this is NOT a pass.\n');
  process.exit(0);
}

const pages = wikiPages(WIKI);
const haystack = pages.map((p) => readFileSync(p, 'utf8')).join('\n');
const tracked = trackedFiles();

// Basename uniqueness across the whole tree decides how strict a match must be.
const basenameCount = new Map();
for (const f of tracked) {
  const b = path.posix.basename(f);
  basenameCount.set(b, (basenameCount.get(b) || 0) + 1);
}

const exact = [], byBasename = [], bySuffix = [], uncovered = [];

for (const f of tracked) {
  if (haystack.includes(f)) { exact.push(f); continue; }

  const parts = f.split('/');
  const base = parts[parts.length - 1];

  if (basenameCount.get(base) === 1) {
    if (haystack.includes(base)) { byBasename.push(f); continue; }
    uncovered.push(f);
    continue;
  }

  // Ambiguous basename: demand a suffix carrying at least one parent directory,
  // and demand that suffix be unambiguous among tracked files too.
  let hit = null;
  for (let i = parts.length - 2; i >= 0; i--) {
    const suffix = parts.slice(i).join('/');
    const owners = tracked.filter((t) => t === suffix || t.endsWith('/' + suffix));
    if (owners.length === 1 && haystack.includes(suffix)) { hit = suffix; break; }
  }
  if (hit) bySuffix.push(f); else uncovered.push(f);
}

const covered = exact.length + byBasename.length + bySuffix.length;
const pct = tracked.length ? ((covered / tracked.length) * 100).toFixed(1) : '0.0';

console.log(`  pages          ${pages.length}`);
console.log(`  tracked files  ${tracked.length}`);
console.log(`  COVERED        ${covered}  (${pct}%)`);
console.log(`    · exact path      ${exact.length}`);
console.log(`    · unique basename ${byBasename.length}`);
console.log(`    · path suffix     ${bySuffix.length}`);
console.log(`  UNCOVERED      ${uncovered.length}`);

if (uncovered.length) {
  console.log('\n  Not named on any wiki page:');
  const show = LIST_ALL ? uncovered : uncovered.slice(0, 40);
  for (const f of show) console.log('    · ' + f);
  if (!LIST_ALL && uncovered.length > show.length) {
    console.log(`    · … and ${uncovered.length - show.length} more (--list for all)`);
  }
}

// ── LINE-COUNT CHECK (WIKICOUNT.1) ────────────────────────────────────────
//
// ⛔ WHY THIS EXISTS. The wiki's module pages tabulate `| `path` | N |` line
// counts, and they were wrong twice over:
//
//   1. Every count produced by the ingest dossier was ONE TOO HIGH, because it
//      measured with `len(text.split('\n'))` — one greater than `wc -l` on any
//      file ending in a newline. 48 rows, all silently off by one.
//   2. Then a count went stale INSIDE the commit that recorded it: cluster.js
//      read 4,984, and a comment added in the same batch took it to 5,011.
//
// ⭐ A LINE COUNT IS A READING, NOT A PROPERTY. Hand-checking 157 rows found a
// 100-line error nobody would ever have noticed (a `.txt` recorded as 94 lines
// that is 194). So the check is mechanical from here on.
//
// ⚠ ESCAPE HATCH, and it is the honest half: a count written as `~N` is treated
// as deliberately approximate and is NOT checked. Files that change on every
// commit — FINALIZED.md, TODO.md, RESUME.md — cannot carry an exact count that
// stays true for an hour, and forcing one would make this check cry wolf. For
// those, an approximate figure carries every bit of information the reader
// needs.
const countRe = /\|\s*`([^`]+\.(?:js|mjs|cjs|md|rs|wgsl|html|json|txt|sh|bat|conf|service|yml|toml|cu|ptx|css))`\s*\|\s*(~?)([\d,]+)\s*\|/g;
const countWrong = [];
let countChecked = 0, countApprox = 0;
for (const p of pages) {
  const txt = readFileSync(p, 'utf8');
  const pageRel = path.relative(ROOT, p).replace(/\\/g, '/');
  for (const m of txt.matchAll(countRe)) {
    const [, rel, approx, shownRaw] = m;
    if (approx === '~') { countApprox++; continue; }
    const target = path.join(ROOT, rel);
    if (!existsSync(target)) continue;         // covered by the provenance check
    countChecked++;
    const shown = parseInt(shownRaw.replace(/,/g, ''), 10);
    let real;
    try { real = readFileSync(target).toString('binary').split('\n').length - 1; } catch { continue; }
    if (real !== shown) countWrong.push({ pageRel, rel, shown, real });
  }
}

console.log('\n  LINE COUNTS IN TABLES');
console.log(`    checked            ${countChecked}   (${countApprox} written as ~N, deliberately unchecked)`);
console.log(`    wrong              ${countWrong.length}`);
for (const w of countWrong.slice(0, 25)) {
  console.log(`      · ${w.rel} — page says ${w.shown.toLocaleString()}, wc -l says ${w.real.toLocaleString()}  [${w.pageRel}]`);
}
if (countWrong.length > 25) console.log(`      · … and ${countWrong.length - 25} more`);

// ── second check: wikilinks, orphans, index drift ─────────────────────────
//
// ⚠ A [[link]] to a page that does not exist is the wiki's own version of a
// dangling reference, and wiki/CLAUDE.md names it as a lint condition. Kept in
// this file rather than a second script so there is one command to run.
const pageNames = new Set(pages.map((p) => path.basename(p, '.md')));
const INFRA = new Set(['CLAUDE', 'index', 'log']);
const contentPages = [...pageNames].filter((n) => !INFRA.has(n));

const linkTargets = new Map();          // target -> [pages that link it]
for (const p of pages) {
  const from = path.basename(p, '.md');
  // ⚠ CLAUDE.md is the SCHEMA doc — it documents the wikilink syntax, so its
  // `[[page-name]]` and `[[...]]` are illustrations, not references. Scanning it
  // reported two broken links that were never links. Excluded as a link SOURCE
  // only; it is still read for file coverage above.
  if (from === 'CLAUDE') continue;
  const txt = readFileSync(p, 'utf8');
  for (const m of txt.matchAll(/\[\[([^\]|#]+)/g)) {
    const target = m[1].trim();
    if (!linkTargets.has(target)) linkTargets.set(target, []);
    linkTargets.get(target).push(from);
  }
}

const broken = [...linkTargets.entries()].filter(([t]) => !pageNames.has(t));
const linkedTo = new Set([...linkTargets.keys()]);
const indexTxt = existsSync(path.join(WIKI, 'index.md'))
  ? readFileSync(path.join(WIKI, 'index.md'), 'utf8') : '';
const missingFromIndex = contentPages.filter((n) => !indexTxt.includes(`[[${n}]]`));
const orphans = contentPages.filter((n) => !linkedTo.has(n) && !indexTxt.includes(`[[${n}]]`));

console.log('\n  WIKILINKS');
console.log(`    distinct targets   ${linkTargets.size}`);
console.log(`    broken             ${broken.length}`);
if (broken.length) {
  for (const [t, from] of broken.slice(0, 20)) {
    console.log(`      · [[${t}]] — linked from ${[...new Set(from)].join(', ')}`);
  }
}
console.log(`    orphan pages       ${orphans.length}`);
for (const o of orphans.slice(0, 20)) console.log(`      · ${o}`);
console.log(`    missing from index ${missingFromIndex.length}`);
for (const m of missingFromIndex.slice(0, 30)) console.log(`      · ${m}`);

console.log('\n' + '─'.repeat(60));
console.log(uncovered.length === 0
  ? `Every one of the ${tracked.length} tracked files is named on a wiki page.`
  : `${uncovered.length} of ${tracked.length} tracked files are named nowhere in the wiki.`);
const linkIssues = broken.length + orphans.length + missingFromIndex.length;
console.log(linkIssues === 0
  ? 'No broken wikilinks, no orphans, index is in sync.'
  : `${linkIssues} link/index issue(s) above.`);
console.log(countWrong.length === 0
  ? `Every checked line count matches \`wc -l\` (${countChecked} exact, ${countApprox} approximate).`
  : `${countWrong.length} line count(s) disagree with \`wc -l\` — write \`~N\` if the file churns too fast to pin.`);
console.log('⛔ This tool reports only — it never edits a page.\n');

if (STRICT && (uncovered.length || linkIssues || countWrong.length)) process.exit(1);
