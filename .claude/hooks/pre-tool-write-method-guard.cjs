#!/usr/bin/env node
// .claude/hooks/pre-tool-write-method-guard.cjs
//
// PreToolUse hook (matcher: Bash). BLOCKING.
//
// ⛔ WHY THIS EXISTS: THE BANNED-WRITE-METHOD LAW HAS BEEN BROKEN FIVE TIMES BY
// FIVE DIFFERENT RATIONALISATIONS, AND EVERY ONE WAS INVENTED AT THE MOMENT THE
// WRITE FELT TRIVIAL.
//
//   1. a heredoc onto docs/FINALIZED.md
//   2. a `python -c` onto wiki/modules/curriculum.md
//   3. a `python - <<'PY'` patching crates/unity-deploy/src/main.rs
//   4. a `sed -i` inserting one line into html/teachview.html
//   5. a `cat >> wiki/log.md <<'EOF'` append
//
// The ledger's own conclusion on offence 2 was: **"a doc shape that punishes the
// sanctioned tool will keep producing violations no matter how many times the
// lesson is written down"** — and then the lesson was written down three more
// times. **The rule has no triviality exemption, and the exemptions keep being
// invented at the point of use, so the enforcement has to live there too.**
//
// ⭐ WHAT IT BLOCKS: a shell command that WRITES to a path inside the repo.
// Edit/Write are the sanctioned tools and are untouched by this hook.
//
// ⭐ WHAT IT DELIBERATELY ALLOWS, because over-blocking would make it get turned
// off — and a guard that is turned off is worse than no guard:
//   - every READ (`sed -n`, `grep`, `cat file`, `node -e` that only measures)
//   - writes to /dev/null, /tmp, $TMPDIR, %TEMP%, .scratch/ and nul
//   - heredocs piped to a COMMAND's stdin (`git commit -F -`) — not a file write
//   - `git` writing its own object store, and package managers writing their own
//
// ⚠ THE GUARD IS TESTED, NOT JUST READ. This project has already shipped a guard
// that was an EMPTY SET and read perfectly in the diff; the sibling harness runs
// every historical offence through this file and asserts each is caught, plus a
// list of legitimate commands that must pass. Run it with `--selftest`.
//
// Exit 2 → blocks the call, stderr goes back to the model and the user.
// Exit 0 → proceeds untouched.
//
// Bash fallback sibling: pre-tool-write-method-guard.sh

'use strict';

const fs = require('fs');

// Sinks a write may legitimately target. Anything here is not "the stack".
const ALLOWED_SINK = /(^|[\s=("'])(\/dev\/null|nul|\/tmp\/|\/var\/tmp\/|\$TMPDIR|\$\{TMPDIR\}|%TEMP%|%TMP%|\.scratch\/|\.git\/)/i;

// A path that looks like it belongs to the repo's tracked content. Deliberately
// a POSITIVE list of the trees the LAW names, plus the doc/source extensions —
// a negative list ("everything that is not /tmp") would block far too much.
const REPO_PATH = new RegExp(
  '(^|[\\s>=("\'])'
  + '(\\.?/)?'
  + '('
  + 'docs/|js/|server/|html/|wiki/|deploy/|crates/|scripts/|\\.claude/|css/|corpora/|'
  + '[A-Za-z0-9_.\\-/]+\\.(md|js|mjs|cjs|json|html|css|rs|toml|yml|yaml|sh|bat|txt|service)'
  + ')',
  'i',
);

// The repo's own top-level trees. A temp path cannot carry one of these, which
// is what makes this a clean separator for inline interpreters where shell
// quoting cannot be parsed reliably.
const TREE_PREFIX = /(^|[\s>=("'`,(])((?:\.\/)?(?:docs|js|server|html|wiki|deploy|crates|scripts|css|corpora|\.claude)\/)/;

function targetsRepo(fragment) {
  if (!fragment) return false;
  if (ALLOWED_SINK.test(fragment)) return false;
  return REPO_PATH.test(fragment);
}

// Strip quoted heredoc BODIES so their contents cannot masquerade as commands.
// The DELIMITER line is kept, because `<<` is the signal we match on.
function stripHeredocBodies(cmd) {
  return cmd.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm, '<<$1$2$1 [BODY]');
}

function findViolation(cmd) {
  const flat = stripHeredocBodies(cmd);

  // ── 1. In-place stream editors. No target analysis needed: `-i` IS the write.
  if (/\bsed\s+(-[a-zA-Z]*i[a-zA-Z]*\b|--in-place)/.test(flat)) {
    return { rule: 'sed -i', detail: 'in-place stream edit' };
  }
  if (/\bperl\s+(-[a-zA-Z]*i[a-zA-Z]*\b)/.test(flat)) {
    return { rule: 'perl -i', detail: 'in-place stream edit' };
  }

  // ── 2. Redirection into a repo path. `>` and `>>`, including `cat > f <<EOF`.
  //    Split on redirect operators and inspect only the TARGET fragment, so a
  //    repo path appearing as an ARGUMENT (`grep x docs/a.md > /dev/null`) does
  //    not trip it.
  const redirects = flat.split(/(?:^|[^0-9<>&])(>>?)(?![>&])/);
  for (let i = 1; i < redirects.length; i += 2) {
    const target = (redirects[i + 1] || '').trimStart().split(/[\s;|&)]/)[0];
    if (targetsRepo(target)) {
      return { rule: `${redirects[i]} redirect`, detail: `writes to ${target}` };
    }
  }

  // ── 3. `tee` into a repo path.
  const tee = /\btee\s+(-a\s+)?([^\s;|&]+)/.exec(flat);
  if (tee && targetsRepo(tee[2])) {
    return { rule: 'tee', detail: `writes to ${tee[2]}` };
  }

  // ── 4. Inline interpreters that write. A `node -e` that only MEASURES is
  //    fine and is used constantly for harnesses; what is banned is one that
  //    edits the tree. Both conditions must hold: a write call AND a repo path.
  const inlineNode = /\bnode\s+(?:--\S+\s+)*(?:-e|-p|--eval|--print)\b/.test(flat);
  const inlinePy = /\bpython3?\s+(?:-c\b|-\s*<<|-\s*$)/.test(flat) || /\bpython3?\s+-\s/.test(flat);
  if (inlineNode || inlinePy) {
    const writesFs = /(writeFileSync|appendFileSync|writeFile\(|appendFile\(|createWriteStream|renameSync|copyFileSync|unlinkSync|rmSync|mkdirSync|open\s*\([^)]*['"][wax])/.test(cmd);
    if (writesFs) {
      // ⚠ THE TEST IS A REPO TREE PREFIX, NOT A QUOTED LITERAL, AND THE REASON
      // IS A REAL MISS THIS GUARD'S OWN SELF-TEST CAUGHT. Extracting balanced
      // string literals looks obvious and breaks on the MIXED QUOTING these
      // one-liners always have — `node -e 'require("fs")...'` tokenises into
      // `'require("`, so the real path was never examined and offence #4 walked
      // straight through a guard that read correctly.
      //
      // A tree prefix cannot be produced by a temp path, so this separates the
      // two cases without parsing shell quoting at all.
      if (TREE_PREFIX.test(cmd)) {
        const hit = TREE_PREFIX.exec(cmd);
        return {
          rule: inlineNode ? 'node -e write' : 'python -c write',
          detail: `writes into the repo tree (${(hit && hit[2]) || 'tracked path'})`,
        };
      }
      // A path built from the working directory is a repo write with no literal.
      if (/process\.cwd\(\)|__dirname/.test(cmd)) {
        return {
          rule: inlineNode ? 'node -e write' : 'python -c write',
          detail: 'writes a path derived from the working directory',
        };
      }
      // ⚠ NAMED RESIDUAL, not a silent gap: an inline write to a bare filename
      // at the repo ROOT (`writeFileSync("notes.md", …)`) has neither a tree
      // prefix nor a cwd call and is NOT caught here. Tightening it would mean
      // blocking every temp-file harness, which would get the guard disabled —
      // and a disabled guard is worse than a narrow one.
    }
  }

  return null;
}

const MESSAGE = (v, cmd) => [
  '[write-method-guard] BLOCKED — banned write method against the repo.',
  '',
  `Rule matched: ${v.rule} (${v.detail})`,
  `Command: ${cmd.length > 400 ? cmd.slice(0, 400) + ' …' : cmd}`,
  '',
  'The LAW is Edit/Write ONLY for anything in the tree — no heredocs, no `sed -i`,',
  'no `node -e`/`python -c` that writes, no `>`/`>>` into a tracked path.',
  'Reading is untouched: `sed -n`, `grep`, `cat`, and a `node -e` that only measures',
  'all still work.',
  '',
  'This has been broken five times by five different rationalisations, every one',
  'invented at the moment the write felt trivial. An append feels like it has no',
  'anchor to choose — it does: Edit anchors on the last existing line, or Write',
  'rewrites the file.',
  '',
  'Do it with the Edit or Write tool instead.',
  'If this is genuinely a temp artifact, target /tmp, $TMPDIR or .scratch/.',
].join('\n');

// ── Self-test. The guard is EXERCISED, not just read: this project has already
// shipped a guard that was an empty set and looked correct in the diff.
const OFFENCES = [
  `cat >> wiki/log.md <<'EOF'\nsome text\nEOF`,
  `sed -i 's/foo/bar/' html/teachview.html`,
  `python - <<'PY'\nopen('crates/unity-deploy/src/main.rs','w').write(x)\nPY`,
  `node -e 'require("fs").writeFileSync("docs/FINALIZED.md", t)'`,
  `cat > docs/NOW.md <<'EOF'\nx\nEOF`,
  `echo "line" >> docs/TODO.md`,
  `printf '%s' "$x" > server/brain-server.js`,
  `sed --in-place 's/a/b/' docs/ARCHITECTURE.md`,
  `tee -a .claude/CONSTRAINTS.md < input`,
  `node -e 'fs.writeFileSync(path.join(process.cwd(),"h.cjs"), src)'`,
];

const LEGITIMATE = [
  `git commit -q -F - <<'MSG'\nsubject line\nMSG`,
  `sed -n '100,200p' docs/TODO.md`,
  `grep -n 'pattern' js/brain/curriculum.js | head -20`,
  `node --check server/brain-server.js`,
  `node -e 'const s=require("fs").readFileSync("docs/TODO.md","utf8");console.log(s.length)'`,
  `node .claude/scripts/audit-task-number-leak.cjs`,
  `git diff --unified=0 -- js/ server/ > /dev/null`,
  `curl -s https://example.com/x.json -o .scratch/ps.json`,
  `node -e 'const t=fs.mkdtempSync(os.tmpdir());fs.writeFileSync(t+"/a.js",x)'`,
  `wc -l docs/TODO.md && head -60 docs/CURRICULUM-GAP.md`,
  `ls -la server/*.js`,
  `git add -A && git status --short`,
  `echo "note" > /dev/null`,
  `cat docs/NOW.md | head -20`,
];

function selftest() {
  let pass = 0; let fail = 0;
  for (const c of OFFENCES) {
    const v = findViolation(c);
    if (v) { pass++; } else { fail++; console.log(`  MISSED (should block): ${c.split('\n')[0]}`); }
  }
  for (const c of LEGITIMATE) {
    const v = findViolation(c);
    if (!v) { pass++; } else { fail++; console.log(`  FALSE POSITIVE (should pass): ${c.split('\n')[0]}  -> ${v.rule}`); }
  }
  console.log(`[write-method-guard] selftest ${pass}/${OFFENCES.length + LEGITIMATE.length}` + (fail ? ` — ${fail} FAILED` : ' — all pass'));
  return fail === 0;
}

(function main() {
  if (process.argv.includes('--selftest')) {
    process.exit(selftest() ? 0 : 1);
  }

  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
  if (!raw) process.exit(0);

  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  const cmd = (payload.toolInput && payload.toolInput.command)
    || (payload.tool_input && payload.tool_input.command)
    || (payload.input && payload.input.command)
    || '';
  if (!cmd) process.exit(0);

  // ⚠ The guard REFUSES TO RUN SILENTLY BROKEN. If its own self-test does not
  // pass, it says so and lets the call through rather than blocking everything
  // on a bug in itself — but it is loud about it, because a guard that quietly
  // stopped matching is the failure mode this whole file exists to prevent.
  let healthy = true;
  try {
    for (const c of OFFENCES) if (!findViolation(c)) { healthy = false; break; }
  } catch { healthy = false; }
  if (!healthy) {
    process.stderr.write('[write-method-guard] ⚠ SELF-TEST FAILING — the guard is not matching its own known offences and is letting this through. Fix the hook.\n');
    process.exit(0);
  }

  const v = findViolation(cmd);
  if (v) {
    process.stderr.write(MESSAGE(v, cmd) + '\n');
    process.exit(2);
  }
  process.exit(0);
})();
