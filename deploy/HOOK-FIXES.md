---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
# ⛔ HONEST CAVEAT, and it is this page's entire reason for existing: its subject
# is `.claude/hooks/*`, which is UNVERSIONED (`.gitignore:48`). `git diff` cannot
# see those files, so the drift check can only ever report on the tracked WIRING
# below. A hook body changing is invisible here by construction — that is the
# gap this page is the manual compensation for.
status: draft
sources:
  - .claude/settings.json
  - scripts/doc-prov-stop-check.mjs
verified-scope: |
  CHECKED 2026-08-27 (DOCPROV.4) — by RUNNING this page's own verification
  recipe, which is the check the drift tool structurally cannot do on
  unversioned files but a reader can in two commands:
    - FIX 1: grep -c SCRIPT_SCAN_ROOTS .claude/hooks/session-start-env-dump.cjs
      → 3   (recipe says "expect >0")  ✅ STILL APPLIED
    - FIX 2: grep -c USAGE_MAX_BYTES .claude/hooks/usage-track.cjs
      → 5   (recipe says "expect >0")  ✅ STILL APPLIED
  ⭐ So neither fix has been reverted by a framework refresh. That is the exact
  failure this page exists to catch, and it has not happened.
  THE DRIFT IS FULLY EXPLAINED, and it is growth rather than rot:
    - scripts/doc-prov-stop-check.mjs  +177 lines — the file did not exist at
      the last stamp; it is a NEW second Stop hook (DOCPROV.2).
    - .claude/settings.json  +4 lines — wiring that hook.
  ⭐ AND THE INTERESTING PART, added to the body: that new hook was deliberately
  placed in scripts/ rather than .claude/hooks/, precisely so it is TRACKED and
  therefore immune to the vanishing problem this whole page documents. The
  page's own lesson, applied by the next thing built after it.
  NOT CHECKED — do not read this page as authority on:
    - the BODIES of the two fixes. Their marker constants are present, which
      proves the fix was not reverted; it does not prove the surrounding logic
      is unchanged. ⛔ A marker can survive an edit that breaks what it marks.
    - the other hooks in .claude/hooks/ (there are more than these two).
    - the /unity-update preserve-list claim, which was not re-read.
last-verified: "074aa591 2026-08-27"
---

# `.claude/hooks/` fixes — the tracked record of code that cannot be tracked

> ## ⭐ RE-VERIFIED 2026-08-27 — both fixes STILL APPLIED, and a third hook escaped the problem entirely
>
> **Verified by running this page's own recipe**, which is the check `docs:drift` structurally cannot perform (the subject is unversioned) and a reader can perform in two commands:
>
> | fix | marker | count | recipe expects |
> |---|---|---:|---|
> | FIX 1 | `SCRIPT_SCAN_ROOTS` in `session-start-env-dump.cjs` | **3** | `>0` ✅ |
> | FIX 2 | `USAGE_MAX_BYTES` in `usage-track.cjs` | **5** | `>0` ✅ |
>
> ⭐ **Neither fix has been reverted by a framework refresh — the exact failure this page exists to catch has not happened.** ⚠ **But read the strength of that claim precisely:** a marker constant being present proves the fix was not *reverted*; it does **not** prove the surrounding logic is unchanged. **A marker can outlive an edit that breaks what it marks.**
>
> **The drift on this page is GROWTH, not rot,** and it resolves completely: `scripts/doc-prov-stop-check.mjs` is **+177 lines because it did not exist at the last stamp** — a new second Stop hook (`DOCPROV.2`) — and `.claude/settings.json` is **+4 lines** wiring it.
>
> ⭐ **AND THE PART WORTH RECORDING: that new hook lives in `scripts/`, NOT in `.claude/hooks/`, deliberately.** `.gitignore:48` excludes `.claude/` while `settings.json` is tracked — so a hook body placed in `scripts/` is **version-controlled and cannot silently vanish on the next `/unity-update`.** ⭐ **This page's entire thesis is "a fix that vanishes without a word", and the very next hook built after it was sited to be immune. The compensation worked, and then stopped being needed.**

> **Why this file exists.** Two hook fixes live in `.claude/hooks/*.cjs`, and that tree can be version-controlled in **neither** available place:
>
> - **not here** — `.claude/` is excluded from this repo by the IP-boundary LAW (only a handful of legacy files are tracked; `hooks/` is not among them);
> - **not upstream** — the `ual-workflow` remote was the original `.claude` TEMPLATE's home and was **never to be pushed to** (Gee, 2026-08-20: *"ual workflow remote is never to be used, its the home of the original templet used to start this .claude"*). ⛔ **UPDATED 2026-08-31: that remote no longer exists here.** It and `origin-unity-bot` were removed from this repo's local `.git/config` on Gee's instruction — *"remove them them from what ever is telling you to refrence them DO NOT TOUCH THEIR REPOS"* — because a rule against a *configured* remote is enforced only by discipline, and one `git push --all` or one autocompleted remote name would have sent this project's `.claude` IP into another repository. **`git remote -v` now returns exactly `origin` and `github`, and a third entry appearing means something re-added it.** ⚠ `git remote remove` edits local config only; neither of those repositories was contacted or altered.
>
> So the files are unversioned by construction, and `/unity-update` replaces the framework tree (it preserves `settings.local.json` / `.env` / `user.json` / `user-context/` — **not hooks**). The next refresh reverts both fixes **without a word**, which is the `LOOPNAME.13` disease one layer up: a fix that vanishes silently.
>
> **This file is the answer: the FILES cannot survive a refresh, but the KNOWLEDGE can.** After any `/unity-update`, check the two behaviours below; if they are gone, re-apply from here. That is `SCRIPTKILL.4`, closed as far as it can be closed from this working tree.

**How to check both in one go, after a framework refresh:**

```bash
grep -c SCRIPT_SCAN_ROOTS .claude/hooks/session-start-env-dump.cjs # expect >0 — else re-apply FIX 1
grep -c USAGE_MAX_BYTES .claude/hooks/usage-track.cjs             # expect >0 — else re-apply FIX 2
```

---

## FIX 1 — `SCRIPTKILL.1`: the `scripts/` hygiene report

**File:** `.claude/hooks/session-start-env-dump.cjs`
**Purpose:** enforce `feedback_no_scripts_for_edits` by REPORTING, not blocking. It names (a) any **untracked** file in `scripts/` — never committed, so almost always a one-shot patcher left behind — and (b) any **patcher-shaped filename**, tracked or not.

**A `PreToolUse` blocker was refused on purpose:** a guard that silently eats a legitimate write is the exact failure class the ledger is about — `GATFILE` was a fetch guard that never auto-restored and ate a real press.

**Wiring:** add `scripts: readScriptsDir(root)` to the `env` object assembled in `main()`, alongside `persona` and `yolo_mode`.

```js
function readScriptsDir(root) {
  const dir = path.join(root, 'scripts');
  if (!fs.existsSync(dir)) return { present: false };
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile()); } catch (e) { return { present: true, read_error: true }; }
  // Untracked = never committed = almost always a one-shot patcher left behind.
  const untracked = (safe('git ls-files --others --exclude-standard -- scripts', { cwd: root }) || '')
    .split(/\r?\n/).filter(Boolean).map(f => f.replace(/^scripts\//, ''));
  // Name shapes that ARE the banned habit, tracked or not.
  const patcherish = files.filter(f => /(^|[-_])(patch|fix|edit|sync|migrate|scrub|rename|write|tmp)[-_.]|-edit\.|^tmp-/i.test(f));
  return {
    present: true,
    file_count: files.length,
    untracked_count: untracked.length,
    untracked: untracked.slice(0, 10),
    patcher_shaped: patcherish.slice(0, 10)
  };
}
```

**Verified when it shipped:** `{file_count: 6, untracked_count: 0, patcher_shaped: []}` on the six survivors of the 55→6 purge — no warning, and zero false positives.

### `SCRIPTKILL.6` (2026-08-20) — the blind spot above is CLOSED. Re-apply THIS version, not the one above.

The report read `scripts/` **only**, and that is not where the hoard was. `scripts/` held 6 files; gitignored `.scratch/` held **152**, of which **44** were `patch-*` / `fix-*` / `todo-*` file-editors. So the hygiene report was clean during the entire period the violation was at its worst — the same failure class as everything else in this ledger: an instrument that answers a narrower question than the one being asked, and reads as *all clear*.

Two things the multi-root version has to get right:

1. **Untracked-ness cannot be the signal in an ignored directory.** `git ls-files --others --exclude-standard` excludes ignored paths *by construction*, so it returns nothing for `.scratch/` no matter how full it is. For an ignored root every file is untracked by definition, and the raw **count** is the signal instead — 152 loose files in a scratch dir is the finding, whatever they are named. Hence `ignored: true` per root rather than one detection rule pretending to fit both.
2. **One warning per root.** A clean `scripts/` must not be able to suppress a dirty `.scratch/`, which a single merged verdict would do.

The legacy top-level shape is kept pointing at `scripts/` so anything already reading `env.scripts.file_count` does not silently change meaning; the per-root detail lives under `env.scripts.roots`. `todo` was added to the patcher-name pattern (the `.scratch/` hoard included `todo-*` editors).

```js
const SCRIPT_SCAN_ROOTS = [
  { dir: 'scripts', ignored: false },
  { dir: '.scratch', ignored: true }
];
const PATCHER_NAME_RE = /(^|[-_])(patch|fix|edit|sync|migrate|scrub|rename|write|todo|tmp)[-_.]|-edit\.|^tmp-/i;

function readOneScriptRoot(root, spec) {
  const dir = path.join(root, spec.dir);
  if (!fs.existsSync(dir)) return { dir: spec.dir, present: false };
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => { try { return fs.statSync(path.join(dir, f)).isFile(); } catch (e) { return false; } }); }
  catch (e) { return { dir: spec.dir, present: true, read_error: true }; }
  // An ignored root can never report tracked files, so every file there counts.
  const untracked = spec.ignored
    ? files.slice()
    : (safe('git ls-files --others --exclude-standard -- ' + spec.dir, { cwd: root }) || '')
        .split(/\r?\n/).filter(Boolean).map(f => f.replace(new RegExp('^' + spec.dir + '/'), ''));
  const patcherish = files.filter(f => PATCHER_NAME_RE.test(f));
  return {
    dir: spec.dir, present: true, gitignored: !!spec.ignored,
    file_count: files.length,
    untracked_count: untracked.length,
    untracked: untracked.slice(0, 10),
    patcher_shaped: patcherish.slice(0, 10),
    patcher_shaped_count: patcherish.length
  };
}

function readScriptsDir(root) {
  const roots = SCRIPT_SCAN_ROOTS.map(spec => readOneScriptRoot(root, spec));
  const live = roots.filter(r => r.present && !r.read_error);
  const primary = roots.find(r => r.dir === 'scripts') || { present: false };
  return Object.assign({}, primary, {
    roots: roots,
    scanned_dirs: SCRIPT_SCAN_ROOTS.map(s => s.dir),
    total_file_count: live.reduce((n, r) => n + (r.file_count || 0), 0),
    total_patcher_shaped: live.reduce((n, r) => n + (r.patcher_shaped_count || 0), 0)
  });
}
```

The reporting block in `main()` loops the roots instead of reading one verdict:

```js
const scanRoots = (env.scripts && env.scripts.roots) || [];
for (const s of scanRoots) {
  if (!s.present || s.read_error) continue;
  if (!(s.untracked_count > 0 || s.patcher_shaped_count > 0)) continue;
  let msg = '\n⚠ **`' + s.dir + '/` hygiene** — the standing rule is: **no scripts to edit code, files or the stack** (Edit/Write tools only), and any genuinely-necessary one-shot gets deleted in the same commit that used it.';
  if (s.gitignored) {
    msg += ' This directory is **gitignored**, so nothing in it is tracked and nothing in it shows up in a `git status` — **' + s.file_count + ' loose file(s)** live here.';
  } else if (s.untracked_count > 0) {
    msg += ' **' + s.untracked_count + ' untracked file(s)**: `' + s.untracked.join('`, `') + '`.';
  }
  if (s.patcher_shaped_count > 0) {
    msg += ' **' + s.patcher_shaped_count + ' patcher-shaped name(s)**'
         + (s.patcher_shaped_count > s.patcher_shaped.length ? ' (first ' + s.patcher_shaped.length + ')' : '')
         + ': `' + s.patcher_shaped.join('`, `') + '`.';
  }
  msg += ' Delete them or say why they stay.\n';
  process.stdout.write(msg);
}
```

**Verified by running the hook, not by reading it:** `scripts/` → `{file_count: 6, untracked_count: 0, patcher_shaped_count: 0}` and **no warning**; `.scratch/` → `{gitignored: true, file_count: 4, untracked_count: 4}` and a warning naming all four. The clean root stayed quiet while the dirty one spoke, which is the whole point of the per-root split.

---

## FIX 2 — `SCRIPTKILL.2`: the `.session-usage.jsonl` byte ceiling

**File:** `.claude/hooks/usage-track.cjs`
**Purpose:** `.claude/.session-usage.jsonl` grew forever (2.5MB and climbing) with no rotation — the one file in `.claude/` that re-bloats on its own. Now trimmed to the newest `USAGE_KEEP_LINES` whenever it passes `USAGE_MAX_BYTES`.

**Constants** (declare near the top, both env-overridable):

```js
const USAGE_MAX_BYTES  = Number(process.env.UNITY_USAGE_MAX_BYTES)  || 1048576;  // 1MB
const USAGE_KEEP_LINES = Number(process.env.UNITY_USAGE_KEEP_LINES) || 2000;
```

**The first cut was WRONG and the behaviour test caught it:** the cap was in LINES but the trigger was in BYTES, so 10,000 small entries walked straight past it — a gate that reads correct and enforces nothing. **The trigger is bytes** (the actual complaint is "2.5MB and climbing"); the **unit kept is whole lines** (a half-line would poison every JSONL reader).

```js
function appendUsage(file, entry) {
  try {
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  } catch (e) {
    process.stderr.write('[usage-track] Failed to append: ' + e.message + '\n');
    return;
  }
  // Cheap gate: one statSync per turn. The file is only read back when it is
  // genuinely over the byte ceiling, so the common path stays append-only.
  try {
    const st = fs.statSync(file);
    if (st.size <= USAGE_MAX_BYTES) return;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    if (lines.length <= USAGE_KEEP_LINES) return;   // huge entries, few of them — leave it alone
    const kept = lines.slice(-USAGE_KEEP_LINES);
    // Write via a temp file + rename so a crash mid-trim cannot leave the ledger
    // truncated in place — the reader either sees the old file or the new one.
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, kept.join('\n') + '\n');
    fs.renameSync(tmp, file);
    process.stderr.write('[usage-track] rotated .session-usage.jsonl: kept the newest '
      + kept.length + ' of ' + lines.length + ' entries (was '
      + (st.size / 1048576).toFixed(2) + 'MB, ceiling '
      + (USAGE_MAX_BYTES / 1048576).toFixed(2) + 'MB; override with '
      + 'UNITY_USAGE_MAX_BYTES / UNITY_USAGE_KEEP_LINES)\n');
  } catch (e) {
    // A failed trim must never break the turn — the ledger just stays long.
    process.stderr.write('[usage-track] rotation skipped: ' + e.message + '\n');
  }
}
```

**Verified when it shipped** (on throwaway copies — the live ledger was never touched): 6,700 entries / 2.31MB → 2,000 / 0.69MB, tail preserved, every line parses, no temp file left behind, under-ceiling files untouched.
