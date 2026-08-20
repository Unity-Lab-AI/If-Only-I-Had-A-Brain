# `.claude/hooks/` fixes — the tracked record of code that cannot be tracked

> **Why this file exists.** Two hook fixes live in `.claude/hooks/*.cjs`, and that tree can be version-controlled in **neither** available place:
>
> - **not here** — `.claude/` is excluded from this repo by the IP-boundary LAW (only a handful of legacy files are tracked; `hooks/` is not among them);
> - **not upstream** — the `ual-workflow` remote is the original `.claude` TEMPLATE's home and is **never to be pushed to** (Gee, 2026-08-20: *"ual workflow remote is never to be used, its the home of the original templet used to start this .claude"*).
>
> So the files are unversioned by construction, and `/unity-update` replaces the framework tree (it preserves `settings.local.json` / `.env` / `user.json` / `user-context/` — **not hooks**). The next refresh reverts both fixes **without a word**, which is the `LOOPNAME.13` disease one layer up: a fix that vanishes silently.
>
> **This file is the answer: the FILES cannot survive a refresh, but the KNOWLEDGE can.** After any `/unity-update`, check the two behaviours below; if they are gone, re-apply from here. That is `SCRIPTKILL.4`, closed as far as it can be closed from this working tree.

**How to check both in one go, after a framework refresh:**

```bash
grep -c patcher_shaped .claude/hooks/session-start-env-dump.cjs   # expect 1 — else re-apply FIX 1
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

⚠ **Known blind spot, found 2026-08-20 (`SCRIPTKILL.5`): this reads `scripts/` ONLY.** The real patcher hoard was in gitignored `.scratch/` — 152 files, 44 of them `patch-*` / `fix-*` / `todo-*` / `close-*` editors. If this is ever re-applied, consider scanning `.scratch/` too.

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
