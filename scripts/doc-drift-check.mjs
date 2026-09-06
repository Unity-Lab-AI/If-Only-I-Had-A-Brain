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
import { execFileSync } from 'node:child_process';
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
  // ⛔ NOT FLAGS — identifier-shaped strings the broad match cannot tell from one.
  // The pattern above scans raw source, so it sees names inside COMMENTS and
  // inside REGEX LITERALS as readily as inside `process.env.X`. Both of these
  // live in `server/knob-registry.js` and neither is ever read from the
  // environment: `DREAM_CYCLE` is an alternation branch in the grouping regex
  // `/CONSOLIDAT|REPLAY|SLEEP|DREAM_CYCLE|SCHEMA|TIER/`, and
  // `DREAM_MAX_REPLAY_NNZ` appears once, in prose, as an example.
  // ⚠ EXCLUDED RATHER THAN NARROWING THE MATCH, deliberately: the broad scan is
  // what found 139 of 178 undocumented flags including `DREAM_KEEP_STATE`, and
  // requiring a `process.env.` prefix would re-hide anything read by
  // destructuring or by `env[name]`. A false positive that never resolves is
  // still a lying instrument — but the cure must not cost the detection.
  for (const p of ['DREAM_CYCLE', 'DREAM_MAX_REPLAY_NNZ']) inCode.delete(p);
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
  // ⛔ Was `dead.slice(0, 40)`, which capped the COUNT and not just the
  // display — the same under-report found in check 9 on 2026-08-27. The
  // report loop caps display at 25 and says how many more there are.
  note('internal doc links resolve', dead,
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

// ── 8. DOCPROV — provenance: has the ground moved under this page? ───────
//
// Checks 1-7 are CLAIM-based: each hunts a specific lie someone already
// thought to look for (a deleted component named as live, an undocumented
// flag). That only ever catches the lies we predicted. This check catches the
// ones we have not thought of yet, mechanically and for any page: a doc
// declares the source files its claims derive from plus the commit those
// claims were verified at, and git answers whether those files have moved
// since.
//
// ⭐ The governing rule, worth stating because every doc-lie in this file's
// history is a violation of it: THE DOC IS THE MAP, THE CODE IS THE
// TERRITORY. Every claim is a cached observation that may have gone stale.
// On conflict, trust the code and fix the page.
//
// ⚠ Frontmatter is OPTIONAL. A page without it is UNCOVERED, not failing —
// so this can land on two docs and grow, instead of demanding a 31-file
// migration before it reports anything. Coverage is printed either way, so
// "nothing is covered" can never masquerade as "nothing is stale".
{
  const stale = [];
  let covered = 0, uncovered = 0;

  const gitOut = (args) => {
    try {
      return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return null; }
  };
  // No git (a tarball deploy, a sandbox) → skip the whole check rather than
  // report every page as broken. Absence of the tool is not evidence of drift.
  const gitOk = gitOut(['rev-parse', '--git-dir']) !== null;

  const docFiles = [
    ...lsx('docs', '.md').map((f) => `docs/${f}`),
    ...lsx('deploy', '.md').map((f) => `deploy/${f}`),
    'README.md',
  ];

  for (const rel of docFiles) {
    if (ARCHIVE.test(rel)) continue;            // archives are history, not claims
    const txt = read(rel);
    // ⛔ CRLF-TOLERANT, and this is not cosmetic. This repo stores CRLF (git
    // says so on every commit). `.` does not match `\r`, so `.*\n?` stopped at
    // the carriage return and the list matcher captured only the FIRST source
    // of every page — the check would have reported `ok` while examining a
    // fraction of what each page claimed. A guard that silently under-reports
    // is the reassuring-direction lie this file exists to catch, and it was
    // caught by RUNNING the check against a real two-source page rather than
    // by reading the regex.
    const fm = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(txt);
    if (!fm) { uncovered++; continue; }
    // ⛔ COMMENT-TOLERANT, and this was found by RUNNING it: the previous
    // pattern required every line after `sources:` to be `- item`, so a YAML
    // `#` comment INSIDE the list truncated the parse at that line and every
    // source below it became invisible. Four sources added on 2026-08-27 with
    // an explaining comment above them silently did not register, and the
    // check reported the same 27 gaps as before the fix. A parser that reads
    // a valid file partially and reports `ok` is this file's own
    // reassuring-direction lie, so the parser is fixed rather than the docs
    // being told to avoid comments.
    const block = /^sources:[ \t]*\r?\n((?:[ \t]*(?:-[ \t]+|#)[^\r\n]*\r?\n?)+)/m.exec(fm[1]);
    const hashM = /^last-verified:\s*["']?([0-9a-f]{7,40})\b/m.exec(fm[1]);
    if (!block || !hashM) { uncovered++; continue; }
    covered++;
    if (!gitOk) continue;

    // ⚠ LINE-BASED, skipping `#` comments. A regex sweep for `- ` across the
    // whole block would harvest any dash-space inside an explaining comment
    // as if it were a declared source.
    const sources = block[1].split(/\r?\n/)
      .map((ln) => ln.trim())
      .filter((ln) => ln.startsWith('- '))
      .map((ln) => ln.slice(2).trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/'))
      .filter(Boolean);
    const hash = hashM[1];

    // ⛔ An unresolvable baseline (rebase, squash, shallow clone) must NEVER
    // pass silently. "I cannot check this" and "this is fine" are different
    // answers, and conflating them is the reassuring-direction lie in a new
    // form — the exact failure this file exists to catch.
    if (gitOut(['cat-file', '-e', `${hash}^{commit}`]) === null) {
      stale.push(`${rel} — last-verified ${hash} is not a commit in this repo; re-verify and restamp`);
      continue;
    }
    // A source that no longer exists is drift by itself: the page describes a
    // file that is gone.
    const missing = sources.filter((s) => !existsSync(R(s)));
    if (missing.length) stale.push(`${rel} — sources no longer exist: ${missing.join(', ')}`);

    const present = sources.filter((s) => existsSync(R(s)));
    if (!present.length) continue;
    const diff = gitOut(['diff', '--stat', `${hash}..HEAD`, '--', ...present]);
    if (diff && diff.trim()) {
      const files = diff.trim().split('\n').length - 1;   // last line is the summary
      stale.push(`${rel} — ${files} of its ${present.length} source(s) changed since ${hash}`);
    }
  }

  // ⛔ ZERO COVERAGE MUST NOT READ AS GREEN. With no page carrying
  // frontmatter, `stale` is empty and this lands in the ok column — "nothing
  // is stale" when the truth is "nothing was looked at". That is the
  // reassuring-direction lie this file exists to catch, and it would have been
  // self-inflicted in the very check written to prevent it. The title says
  // which of the two it is.
  const provTitle = covered === 0
    ? `doc provenance — NO PAGE IS COVERED YET (0 of ${uncovered}); nothing was checked`
    : `doc provenance verified (${covered} covered, ${uncovered} uncovered)`;
  note(provTitle, stale,
    'The page makes claims about files that have changed since it was last checked. Re-read the code, correct the page, then restamp last-verified. THE CODE IS THE TERRITORY.');
  if (!gitOk) console.log('  note  provenance: git unavailable — staleness not evaluated (coverage still counted)');
}

// ── 9. DOCPROV — does a page's `sources:` cover the files it CITES? ───────
//
// The gap this closes was found four times in one day, on four different
// pages: HTML-ENTRY-POINTS cited `html/docs.html:189-207`,
// THRESHOLD-DERIVATION cited `emit.js:1719`, KNOWN_ISSUES' KI-16 lives in
// `curriculum.js`, and HELD-BACK's whole noise-gate section is
// `cluster.js:2173` — and NONE of those files were in the citing page's
// `sources:` list.
//
// ⛔ THAT IS WORSE THAN A WRONG SOURCE LIST. Check 8 can only ever fire on
// the files a page NAMES as sources, so a page making load-bearing claims
// about a file it does not list is a page drift can never flag. All four were
// caught by a human reading the page. This makes it mechanical.
//
// ⚠ THE SIGNAL IS A LINE NUMBER, deliberately. `path.js:1404` is a precise
// claim about that file's contents — which is exactly what `sources:` is for.
// A bare filename in prose is a mention, not a claim, and flagging mentions
// would produce the cries-wolf noise this file's own header warns about.
//
// ⚠ Basename-only citations (`cluster.js:2173`) resolve ONLY when the
// basename is UNIQUE across tracked files. Ambiguous ones are SKIPPED, not
// guessed — the same rule the wiki coverage checker uses, and for the same
// reason: this repo has eleven README.md files.
//
// ⛔⛔ THIS CHECK NARROWS THE GAP. IT DOES NOT CLOSE IT — and the honest
// measurement says so, because the alternative was tested and rejected:
//
//   Would this rule have caught the four gaps that motivated it? NO. NONE of
//   them. Run against the pre-fix pages at 471b5248: HELD-BACK,
//   THRESHOLD-DERIVATION and HTML-ENTRY-POINTS carried ZERO line-precise
//   citations, and KNOWN_ISSUES' single one pointed at a file already in its
//   sources. Those pages were ABOUT files they never cited by line.
//
//   A second, bare-mention signal ("page names file N× but does not list
//   it") was built and MEASURED against that: bare counts for the four gaps
//   were cluster.js 2, emit.js 1, consolidation-engine.js 0, curriculum.js 2,
//   docs.html 4, brain-equations.html 5 — so a threshold of 2 catches four of
//   six, and consolidation-engine.js at ZERO is unreachable by any
//   mention-based rule (the page discussed DREAM_CONSOLIDATION_MAX_MS without
//   ever naming the file). Total drift items it added: +300 at threshold 2,
//   +175 at 3, +67 at 6, +13 even at 15, against a 43-item baseline.
//   ⛔ DELETED on those numbers. This file's own law is that a check which
//   cries wolf gets ignored, and `sources` is explicitly a FOCUSED set — a
//   page naming a file ten times may still not have claims that depend on it.
//
// ⭐ So: a page can be ABOUT a file it never cites precisely, and no
// mechanical rule available here finds that. Choosing the right `sources` list
// remains a judgment made at verification time. What this check buys is the
// subset that IS mechanical — 27 real gaps on first run — and an honest
// statement of the remainder instead of a guard that implies full coverage.
{
  const tracked = (() => {
    try {
      return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split('\n').map((s) => s.trim()).filter(Boolean);
    } catch { return []; }
  })();

  // basename → the single tracked path, or null when ambiguous.
  const byBase = new Map();
  for (const p of tracked) {
    const b = p.split('/').pop();
    byBase.set(b, byBase.has(b) ? null : p);
  }

  const CODE_EXT = /\.(js|mjs|cjs|rs|wgsl|cu|html|sh|bat|service|yml|toml|json)$/;
  const gaps = [];
  let checked = 0;

  const docFiles2 = [
    ...lsx('docs', '.md').map((f) => `docs/${f}`),
    ...lsx('deploy', '.md').map((f) => `deploy/${f}`),
    'README.md',
  ];

  for (const rel of docFiles2) {
    if (ARCHIVE.test(rel)) continue;
    const txt = read(rel);
    const fm = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(txt);
    if (!fm) continue;                                  // uncovered: nothing to compare against
    // ⛔ COMMENT-TOLERANT, and this was found by RUNNING it: the previous
    // pattern required every line after `sources:` to be `- item`, so a YAML
    // `#` comment INSIDE the list truncated the parse at that line and every
    // source below it became invisible. Four sources added on 2026-08-27 with
    // an explaining comment above them silently did not register, and the
    // check reported the same 27 gaps as before the fix. A parser that reads
    // a valid file partially and reports `ok` is this file's own
    // reassuring-direction lie, so the parser is fixed rather than the docs
    // being told to avoid comments.
    const block = /^sources:[ \t]*\r?\n((?:[ \t]*(?:-[ \t]+|#)[^\r\n]*\r?\n?)+)/m.exec(fm[1]);
    if (!block) continue;
    // Same line-based parse as check 8 — see the note there on why a block-wide
    // `- ` sweep is wrong once comments are allowed in the list.
    const declared = new Set(block[1].split(/\r?\n/)
      .map((ln) => ln.trim())
      .filter((ln) => ln.startsWith('- '))
      .map((ln) => ln.slice(2).trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/')));
    checked++;

    // Body only — a citation inside the frontmatter (verified-scope prose)
    // is commentary ABOUT the check, not a fresh claim.
    const body = txt.slice(fm[0].length);
    const cited = new Set();
    // `<path-or-basename>.<ext>:<line>` — the line number is the signal.
    for (const m of body.matchAll(/([A-Za-z0-9_./-]+\.[A-Za-z]{1,8}):\d+/g)) {
      let p = m[1].replace(/\\/g, '/').replace(/^\.\//, '');
      if (!CODE_EXT.test(p)) continue;
      if (!p.includes('/')) {
        const resolved = byBase.get(p);
        if (!resolved) continue;                        // unknown or ambiguous → do not guess
        p = resolved;
      }
      if (!existsSync(R(p))) continue;                  // a dead citation is check 6's business
      cited.add(p);
    }

    const uncoveredCites = [...cited].filter((p) => !declared.has(p)).sort();
    for (const p of uncoveredCites) gaps.push(`${rel} — cites ${p}:N but does not list it in sources`);

  }

  // ⛔ FULL array, NOT a slice. Passing `gaps.slice(0, 30)` here capped the
  // reported COUNT at 30, not merely the display — so every threshold read
  // "46 item(s)" and the check looked insensitive to its own tuning knob.
  // The report loop below already caps DISPLAY at 25 and prints "… and N
  // more", which is the honest split. ⚠ Self-inflicted instance of this
  // file's own header rule: a guard that silently under-reports is the
  // reassuring-direction lie it exists to catch.
  note(`sources cover the files each page cites (${checked} covered page(s) examined)`, gaps,
    'The page makes a line-precise claim about a file it does not declare, so check 8 can never flag it when that file moves. Add the file to `sources:` — or, if the citation is incidental, drop the line number.');
}

// ── 10. Stale-GEOMETRY tripwire ──────────────────────────────────────────
//
// The finding that produced this check: ONE cortex geometry change left SIX
// documents describing the old shape, and none of them knew about the others.
// `README.md` said "9 sub-regions", `html/brain-equations.html` said
// `free 0.250-0.500`, `docs/COMP-todo.md` and `docs/ARCHITECTURE.md` said
// "8 sub-regions" (ARCHITECTURE in four separate places), and
// `docs/SKILL_TREE.md` + `docs/ROADMAP.md` carried "8 named sub-regions",
// "14 cross-region projections", "7 pairs × 2" and `cortex 0.30`.
//
// ⛔ Fixing the sixth instance by hand does nothing about the seventh. This is
// the chokepoint: the OLD figures are now WRONG figures, so they can be
// tripwired by value — the same shape as check 7's deleted-component tripwire,
// and for the same reason.
//
// ⭐ THE HISTORICAL EXEMPTION IS LOAD-BEARING, NOT A CONVENIENCE. A dated
// milestone banner saying "8-subregion cortex substrate" was TRUE on its date,
// and rewriting it would falsify the record this project keeps on purpose. So a
// hit is only reported when the line carries no historical marker — exactly how
// check 7 treats a mention of a deleted component. `SKILL_TREE.md` and
// `ROADMAP.md` keep their old numbers legitimately and are silent here because
// their lines are marked.
//
// ⚠ These patterns encode CURRENT truth and will themselves go stale the next
// time the geometry moves. That is acceptable and is the point: the next change
// makes this check FAIL LOUDLY on its own patterns, which is a prompt to update
// them — infinitely better than six documents drifting in silence.
{
  const geo = [
    { was: '8 sub-regions',                now: '11 top-level sub-regions',  re: /\b8[- ]sub-?regions?\b|\b8 named sub-?regions?\b|\b8-subregion\b/i },
    { was: '9 sub-regions',                now: '11 top-level sub-regions',  re: /\b9 sub-?regions?\b/i },
    { was: '14 cross-region projections',  now: '16 (8 pairs × 2)',          re: /\b14 (sparse )?cross-region\b/i },
    // ⛔ MUST require the "× 2 directions" context. A bare /\b7 pairs\b/ matched
    // `COMBO SYNERGIES (7 pairs, scaled by min(level_a, level_b))` in
    // html/brain-equations.html — DRUG combo pairs, nothing to do with
    // projections. One false positive is how a tripwire starts getting ignored,
    // which this file's own header says is the failure mode that matters.
    { was: '7 pairs × 2 directions',       now: '8 pairs × 2',               re: /\b7 pairs\b[^.\n]{0,24}(×|x)\s*2/i },
    { was: 'cortex fraction 0.30',         now: '0.55',                      re: /cortex[:= ]+0\.30\b/i },
    { was: 'free 0.250-0.500',             now: 'free 0.300-0.500',          re: /free[`'" ]*0\.250-0\.500/i },
  ];
  // Same marker set as check 7, plus the words a forward-pointer or dated
  // banner actually uses in this repo.
  // ⚠ `Shipped milestones` is here because a list of what SHIPPED is a record by
  // definition — ROADMAP's milestone cell legitimately says "8-subregion cortex
  // substrate, 14 cross-region projections" because that is what shipped on
  // that date, and rewriting it would falsify the milestone.
  const HIST = /CORRECTED|SUPERSEDED|was TRUE WHEN WRITTEN|historical|HISTORICAL|until 2026|stale|~~|no longer|earlier|prior|forward-pointer|FORWARD-POINTER|Last updated|Earlier updated|Shipped milestones|shipped on|at the time|then\b/i;
  const hits = [];
  const files = [
    ...lsx('docs', '.md').map((f) => `docs/${f}`),
    ...lsx('deploy', '.md').map((f) => `deploy/${f}`),
    ...lsx('html', '.html').map((f) => `html/${f}`),
    'README.md', 'index.html',
  ];
  for (const rel of files) {
    if (ARCHIVE.test(rel)) continue;           // ledgers keep their own history
    // ⛔ SKIP FRONTMATTER, for the same reason check 9 does: a `verified-scope`
    // block is metadata ABOUT corrections, not a claim the page makes. And the
    // per-line historical marker cannot save it — YAML block scalars WRAP, so
    // `"8 sub-regions" -> ELEVEN` routinely lands on a different physical line
    // from its own `CORRECTED` keyword. Four false positives on the first run,
    // every one inside a note explaining the very fix.
    const txtAll = read(rel);
    const fmBlock = /^---\s*\r?\n[\s\S]*?\r?\n---/.exec(txtAll);
    const lines = (fmBlock ? txtAll.slice(fmBlock[0].length) : txtAll).split('\n');
    const lineOffset = fmBlock ? fmBlock[0].split('\n').length : 0;

    // ⛔ MARKING IS PARAGRAPH-SCOPED AND SECTION-AWARE, not per-line. A
    // per-line marker was tried first and was too fragile in both directions:
    //   · markdown prose WRAPS, so a forward-pointer banner listing the old
    //     figures put "8 sub-regions" on a different physical line from its own
    //     "was TRUE WHEN WRITTEN" — the check flagged the very banners written
    //     to explain the correction.
    //   · a dated snapshot SECTION ("STACK STATE AS OF 2026-04-15") is
    //     historical as a whole, and its banner sits many paragraphs above the
    //     figures it governs.
    // So: a hit is suppressed if its PARAGRAPH carries a marker, or if the
    // nearest preceding HEADER marks the section as dated/historical.
    const paraOf = new Array(lines.length).fill(0);
    const sectionHistorical = new Array(lines.length).fill(false);
    {
      let para = 0, histHeader = false, histLevel = 99;
      const paraHasMarker = new Map();
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (/^\s*$/.test(ln)) { para++; }
        // ⛔ STICKY BY HEADING LEVEL. A dated section marks everything under it
        // historical, INCLUDING its sub-sections — `## STACK STATE AS OF
        // 2026-04-15` followed by `### Brain substrate (live)` must not have the
        // sub-header clear the ancestor's status. That bug reported five hits
        // inside an explicitly-dated April snapshot.
        const h = /^(#{1,4})\s/.exec(ln);
        if (h) {
          const lvl = h[1].length;
          if (/AS OF|HISTORICAL|SUPERSEDED|\b20\d\d-\d\d-\d\d\b/i.test(ln)) {
            histHeader = true; histLevel = lvl;
          } else if (lvl <= histLevel) {
            histHeader = false; histLevel = 99;   // same or shallower ⇒ new section
          }
        }
        paraOf[i] = para;
        sectionHistorical[i] = histHeader;
        if (HIST.test(ln)) paraHasMarker.set(para, true);
      }
      for (let i = 0; i < lines.length; i++) {
        if (paraHasMarker.get(paraOf[i])) sectionHistorical[i] = true;
      }
    }
    lines.forEach((ln, i) => {
      if (sectionHistorical[i]) return;        // marked as history → correct as written
      for (const g of geo) {
        if (g.re.test(ln)) hits.push(`${rel}:${i + 1 + lineOffset} says "${g.was}" — current is ${g.now}`);
      }
    });
  }
  note(`no doc states a superseded cortex geometry as current (${geo.length} figures watched)`, hits,
    'One geometry change left SIX documents describing the old shape. Correct the figure, or mark the line as historical if it is a dated record — a dated banner that was true when written must NOT be rewritten.');
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
