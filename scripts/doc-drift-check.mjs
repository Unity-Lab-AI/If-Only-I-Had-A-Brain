// ─────────────────────────────────────────────────────────────────────────
// doc-drift-check.mjs — the DOC-side twin of the boot guard.
//
// The code side already refuses to start if an LLM SDK, a chat-completions
// URL or a transformer dependency reappears. The docs had no such guard,
// which is how a doc came to claim a route had been "REMOVED 2026-04-13"
// while that route ran in production for four more months. A doc that lies
// in the REASSURING direction is worse than no doc.
//
// ⛔ THIS TOOL NEVER WRITES ANYTHING. It reads, counts, and reports. It does
// not edit a doc, does not "fix" a list, and does not touch the stack. That
// is deliberate and load-bearing: the standing rule is that scripts do not
// edit code, files or the stack — Edit/Write do. A guard that silently
// rewrote a doc to make itself pass would be the exact failure it exists to
// catch.
//
// Usage:
//   node scripts/doc-drift-check.mjs          # report
//   node scripts/doc-drift-check.mjs --strict # exit 1 if anything drifted
//
// Exit code is 0 by default even when drift is found, so it can be run
// casually without breaking a workflow. --strict is for CI.
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => path.join(ROOT, p);
const read = (p) => { try { return readFileSync(R(p), 'utf8'); } catch { return ''; } };
const lsx = (dir, ext) => { try { return readdirSync(R(dir)).filter((f) => f.endsWith(ext)); } catch { return []; } };

const findings = [];
const ok = [];
const note = (title, items, detail) => {
  if (items.length) findings.push({ title, items, detail });
  else ok.push(title);
};

// ── 1. Every DREAM_* flag in the code is documented ──────────────────────
// The gap this catches was 139 of 178 — including DREAM_KEEP_STATE, the
// fresh-walk-vs-resume switch, the single most consequential variable here.
{
  const src = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(R(dir), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js') && e.name !== 'app.bundle.js') src.push(read(rel));
    }
  };
  walk('server'); walk('js');
  const inCode = new Set();
  for (const s of src) for (const m of s.matchAll(/DREAM_[A-Z0-9_]+/g)) inCode.add(m[0]);
  // Prefix artifacts — built up in code, not real variables. Documented as such.
  for (const p of ['DREAM_CONSOLIDATION_', 'DREAM_SAT_', 'DREAM_KEEP_']) inCode.delete(p);
  const doc = read('docs/ADMIN-CONTROLS.md');
  const missing = [...inCode].filter((f) => !doc.includes(f)).sort();
  note(`env flags documented (${inCode.size - missing.length}/${inCode.size})`, missing,
    'Add to docs/ADMIN-CONTROLS.md with its default, its effect, and whether it is a lever or an escape hatch.');
}

// ── 2. Every public HTML page is in the legend ───────────────────────────
{
  const legend = read('html/legend.html');
  const pages = lsx('html', '.html').filter((f) => f !== 'legend.html');
  const missing = pages.filter((p) => !legend.includes(p));
  note(`pages listed in legend.html (${pages.length - missing.length}/${pages.length})`, missing,
    'legend.html is the index every other page links to — a page absent from it is unreachable by anyone browsing.');
}

// ── 3. Every public page has a social card AND is in the generator ───────
// minds-eye.html shipped and was never added to PUBLIC_PAGES, so it had no
// card at all until someone went looking.
{
  const gen = read('scripts/social-shots.mjs');
  const pages = lsx('html', '.html').map((f) => f.replace(/\.html$/, ''));
  const missingFromGen = pages.filter((n) => !gen.includes(`'${n}'`));
  note('pages present in the social-card generator', missingFromGen,
    'Add to PUBLIC_PAGES in scripts/social-shots.mjs, or the page ships with no preview image.');

  const missingCard = pages.filter((n) => !existsSync(R(`assets/social/${n}.png`)));
  note('pages with a social card on disk', missingCard,
    'Run: npm run social:shots (dashboard.png needs npm run social:shots:admin through an authenticated browser).');
}

// ── 4. Every donor release tag has a release note ────────────────────────
{
  const cargo = read('donor-app/Cargo.toml');
  const v = (cargo.match(/^version\s*=\s*"([^"]+)"/m) || [])[1];
  const missing = v && !existsSync(R(`donor-app/RELEASE-${v}.md`)) ? [`donor v${v} has no RELEASE-${v}.md`] : [];
  note(`donor release note for the shipped version${v ? ` (${v})` : ''}`, missing,
    'Write donor-app/RELEASE-<version>.md. Notes stopped at 0.3.26 while the pod ran 0.3.29.');
}

// ── 5. No duplicate KNOWN_ISSUES ids ─────────────────────────────────────
// KI-18 was used twice, for two unrelated issues.
{
  const ki = read('docs/KNOWN_ISSUES.md');
  const ids = [...ki.matchAll(/^\| (KI-\d+)/gm)].map((m) => m[1]);
  const seen = new Set(), dupes = new Set();
  for (const id of ids) { if (seen.has(id)) dupes.add(id); seen.add(id); }
  note(`KNOWN_ISSUES ids unique (${ids.length} rows)`, [...dupes],
    'Two different issues under one id means one of them is unreachable by reference.');
}

// ── 6. Dead internal doc links ───────────────────────────────────────────
// ⚠ Archives are EXCLUDED by design. FINALIZED / RESUME / TODO / NOW are
// historical records; a link that has since moved is part of the record, not
// a defect, and "fixing" one would edit history.
// ⚠ The target must look like a FILE (have an extension). Without that, the
// regex matches inline code and prose fragments and reports `→ t`.
const ARCHIVE = /FINALIZED|RESUME|TODO|NOW\.md|OPEN-TASKS/;
{
  const dead = [];
  for (const f of lsx('docs', '.md').concat(['README.md'])) {
    const rel = f === 'README.md' ? 'README.md' : `docs/${f}`;
    if (ARCHIVE.test(rel)) continue;
    const s = read(rel);
    for (const m of s.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+\.[a-zA-Z0-9]{1,5})\)/g)) {
      const target = path.resolve(path.dirname(R(rel)), m[1]);
      if (!existsSync(target)) dead.push(`${rel} → ${m[1]}`);
    }
  }
  note('internal doc links resolve', dead.slice(0, 40),
    'A link to a moved or deleted file. Fix the path or strike the reference with its reason.');
}

// ── 7. Deleted-thing tripwire ────────────────────────────────────────────
// Names of things that were removed. If a doc describes one as PRESENT, the
// doc is lying in the reassuring direction — the failure this file exists for.
{
  // ⚠ Word-boundary patterns, not substrings. Plain `proxy.js` also matches
  // `mindspace-proxy.js`, which is LIVE — three false positives on the first
  // run, and a check that cries wolf gets ignored.
  // ⚠ `js/env.js` was tried here and REMOVED as a check. It is NOT a deleted
  // component — it is a gitignored, USER-CREATED config file that SETUP.md
  // correctly tells a deployer to copy from js/env.example.js. What was
  // deleted was the repo's own copy, which carried a seeded API key. Listing
  // it produced 7 false positives against correct documentation, which is
  // the failure mode this whole file exists to avoid — pointed at itself.
  const gone = [
    { name: 'proxy.js', re: /(^|[^a-zA-Z0-9._-])proxy\.js/ },
    { name: 'transformer-backend.js', re: /transformer-backend\.js/ },
    { name: 'dual-brain-arbiter.js', re: /dual-brain-arbiter\.js/ },
    { name: 'the Ollama/LLaVA vision describer', re: /(ollama-vision|openai-vision|VISION_MODEL_HINTS|visionBackends)/ },
    { name: 'the Claude CLI route', re: /\/v1\/chat\/completions/ },
  ];
  // A mention accompanied by a deletion marker ON THE SAME LINE is correct
  // documentation, not drift — the point is to keep the record, not erase it.
  const MARKED = /DELETED|REMOVED|~~|no longer|was deleted|\bgone\b|struck|REVOKED|predates|retired|dead|not exist|what was here/i;
  const hits = [];
  for (const f of lsx('docs', '.md').concat(['README.md'])) {
    const rel = f === 'README.md' ? 'README.md' : `docs/${f}`;
    if (ARCHIVE.test(rel)) continue; // archives keep their history
    const lines = read(rel).split('\n');
    for (const g of gone) {
      lines.forEach((ln, i) => {
        if (g.re.test(ln) && !MARKED.test(ln)) hits.push(`${rel}:${i + 1} mentions ${g.name} with no deletion marker`);
      });
    }
  }
  note('no doc describes a deleted component as live', hits,
    'Each hit reads as if the thing still exists. Mark it DELETED with its reason, or strike it.');
}

// ── Report ───────────────────────────────────────────────────────────────
const strict = process.argv.includes('--strict');
console.log('\nDOC DRIFT CHECK\n' + '─'.repeat(60));
for (const t of ok) console.log(`  ok    ${t}`);
for (const f of findings) {
  console.log(`\n  DRIFT ${f.title} — ${f.items.length} item(s)`);
  for (const i of f.items.slice(0, 25)) console.log(`          · ${i}`);
  if (f.items.length > 25) console.log(`          · … and ${f.items.length - 25} more`);
  console.log(`          → ${f.detail}`);
}
const total = findings.reduce((n, f) => n + f.items.length, 0);
console.log('\n' + '─'.repeat(60));
console.log(total === 0 ? 'No drift found.' : `${total} item(s) drifted across ${findings.length} check(s).`);
console.log('⛔ This tool reports only — it never edits a doc. Fix with Edit/Write.\n');
if (strict && total > 0) process.exit(1);
