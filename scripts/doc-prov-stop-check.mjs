// scripts/doc-prov-stop-check.mjs
//
// DOCPROV.2 — the ENFORCEMENT half of doc provenance. The reporting half is
// `scripts/doc-drift-check.mjs` check 8, which only ever runs when someone
// asks; this one runs itself, wired as the Stop hook in `.claude/settings.json`.
//
// What it answers: "this session moved a file that a doc page CLAIMS as one of
// its sources, and no claim page was touched." That is the DOCS BEFORE PUSH
// LAW, otherwise enforced by discipline alone — the same discipline that
// produced every doc lie in this repo's history.
//
// ⛔ WARN-ONLY, FAIL-OPEN, NEVER BLOCKS. Exit 0 on every path including its own
// crash. A hook that can wedge a session is the STOPTRAP shape — the one
// control nobody can undo, reachable by an operator with no shell. The
// upstream kit's version of this idea blocks once; ours must not.
//
// ⚠ IT LIVES IN `scripts/`, NOT IN `.claude/hooks/`, and that is deliberate:
// `.gitignore` excludes `.claude/` (IP boundary), so ZERO hooks are tracked
// while `.claude/settings.json` IS. A hook body in there would exist only on
// one machine while the tracked settings file pointed at it for everyone. Here
// it is versioned, it ships with the repo, and it sits next to the reporting
// half it shares a parser shape with.
//
// ⚠ Two scopes, reported separately, because they answer different questions:
//   A — uncommitted (working tree + index + untracked) vs HEAD
//   B — committed but unmerged: merge-base(base)..HEAD
// Scope B is what the LAW is literally about (docs land in the SAME commit as
// the code); scope A is the earlier warning.
//
// ⚠ THE BOARD AND THE LEDGER DO NOT COUNT AS "A DOC WAS TOUCHED".
// TODO / RESUME / FINALIZED / NOW are worklist and history, not claim pages —
// the same exclusion check 8 uses. Editing the board while a described
// subsystem moves underneath a page is precisely the state this exists to
// name, so accepting the board as proof would defeat it.
//
// ⚠ Repeats are suppressed by FINGERPRINT, not by a timer: it speaks when the
// set of offending pages CHANGES, then goes quiet. Stop fires on every turn
// boundary, and a warning that reprints unchanged for an hour is the wall of
// BLOCKED notices again. Detection stays complete; only the printing is
// deduplicated.
//
// State, inspectable and never authoritative: `.claude/.docprov-state.json`

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = process.env.CLAUDE_PROJECT_DIR
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.join(ROOT, '.claude', '.docprov-state.json');

// Archives and the worklist keep their own rules — same pattern as check 8.
const ARCHIVE = /FINALIZED|RESUME|TODO|NOW\.md|OPEN-TASKS/;
const IS_DOC = (f) => (/^(docs|deploy)\/[^/]+\.md$/.test(f) || f === 'README.md') && !ARCHIVE.test(f);

const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
};
const lines = (out) => (out || '').split('\n').map((s) => s.trim().replace(/\\/g, '/')).filter(Boolean);

// ── the provenance map: page -> declared sources ──────────────────────────
// ⛔ CRLF-tolerant for the reason check 8 records against itself: `.` does not
// match `\r`, and the naive list matcher captured only the FIRST source of
// every page while still reporting success. This repo stores CRLF.
function provenance() {
  const pages = [];
  for (const dir of ['docs', 'deploy']) {
    try {
      for (const n of readdirSync(path.join(ROOT, dir))) if (n.endsWith('.md')) pages.push(`${dir}/${n}`);
    } catch { /* absent dir is not a finding */ }
  }
  pages.push('README.md');

  const map = [];
  let covered = 0, uncovered = 0;
  for (const rel of pages) {
    if (ARCHIVE.test(rel)) continue;
    let txt = '';
    try { txt = readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
    const fm = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(txt);
    if (!fm) { uncovered++; continue; }
    const block = /^sources:[ \t]*\r?\n((?:[ \t]+-[ \t]+[^\r\n]+\r?\n?)+)/m.exec(fm[1]);
    if (!block) { uncovered++; continue; }
    const sources = [...block[1].matchAll(/-[ \t]+([^\r\n]+)/g)]
      .map((m) => m[1].trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/'))
      .filter(Boolean);
    if (!sources.length) { uncovered++; continue; }
    covered++;
    map.push({ page: rel, sources });
  }
  return { map, covered, uncovered };
}

// ── what moved, per scope ─────────────────────────────────────────────────
function scopeA() {
  const out = new Set([
    ...lines(git(['diff', '--name-only', 'HEAD'])),
    ...lines(git(['diff', '--name-only', '--cached'])),
    ...lines(git(['ls-files', '--others', '--exclude-standard'])),
  ]);
  return { label: 'uncommitted', files: [...out], usable: true };
}

function scopeB() {
  const branch = (git(['rev-parse', '--abbrev-ref', 'HEAD']) || '').trim();
  if (!branch || branch === 'HEAD') return { label: 'unmerged', files: [], usable: false, why: 'detached HEAD' };
  const base = branch === 'develop' ? 'main' : 'develop';
  // ⛔ "I could not check" is a different answer from "this is fine", and
  // conflating them is the reassuring-direction lie this pair exists to catch.
  if (git(['rev-parse', '--verify', base]) === null) {
    return { label: 'unmerged', files: [], usable: false, why: `no local ${base} to compare against` };
  }
  const mb = (git(['merge-base', 'HEAD', base]) || '').trim();
  if (!mb) return { label: 'unmerged', files: [], usable: false, why: `no merge-base with ${base}` };
  return { label: 'unmerged', files: lines(git(['diff', '--name-only', `${mb}..HEAD`])), usable: true };
}

function judge(scope, prov) {
  if (!scope.usable || !scope.files.length) return null;
  const changed = new Set(scope.files);
  const hits = prov.map
    .map(({ page, sources }) => ({ page, moved: sources.filter((s) => changed.has(s)) }))
    .filter((h) => h.moved.length);
  if (!hits.length) return null;
  // ⚠ Coarse on purpose: this establishes THAT a claim page was edited, never
  // that the RIGHT one was. The message says so rather than implying a
  // precision it does not have.
  if (scope.files.some(IS_DOC)) return null;
  return { scope: scope.label, hits };
}

try {
  if (git(['rev-parse', '--git-dir']) === null) process.exit(0);   // no git, nothing to compare
  const prov = provenance();
  const findings = [scopeA(), scopeB()].map((s) => judge(s, prov)).filter(Boolean);

  const fingerprint = findings
    .map((f) => `${f.scope}:${f.hits.map((h) => h.page).sort().join(',')}`)
    .sort().join('|');

  let prev = '';
  try { prev = (JSON.parse(readFileSync(STATE, 'utf8')) || {}).fingerprint || ''; } catch { /* first run */ }

  try {
    writeFileSync(STATE, JSON.stringify({
      at: new Date().toISOString(),
      fingerprint,
      coveredPages: prov.covered,
      uncoveredPages: prov.uncovered,
      // ⛔ Recorded so silence can be told apart from a pass. With few pages
      // carrying frontmatter, most changes are covered by no page at all —
      // that is "not evaluated", never "clean".
      verdict: fingerprint
        ? 'sources-moved-no-doc-touched'
        : (prov.covered ? 'no-covered-source-moved' : 'nothing-covered-nothing-checked'),
      findings,
    }, null, 2));
  } catch { /* state is a convenience, not a gate */ }

  if (fingerprint && fingerprint !== prev) {
    const msg = ["[docprov] DOCS BEFORE PUSH — a page's declared sources moved and no claim page was touched:"];
    for (const f of findings) {
      for (const h of f.hits) msg.push(`  · ${h.page} (${f.scope}) — moved: ${h.moved.join(', ')}`);
    }
    msg.push(`  provenance coverage: ${prov.covered} page(s) declare sources, ${prov.uncovered} do not — an uncovered page cannot warn at all.`);
    msg.push('  ⚠ Coarse by design: it sees THAT a doc changed, not whether the RIGHT one did. Warning only — nothing is blocked.');
    process.stderr.write(msg.join('\n') + '\n');
  }
} catch (e) {
  // Fail-open, and say why — swallowing this silently would make the check's
  // own breakage indistinguishable from a clean session.
  try { process.stderr.write('[docprov] check skipped: ' + e.message + '\n'); } catch { /* ignore */ }
}
process.exit(0);
