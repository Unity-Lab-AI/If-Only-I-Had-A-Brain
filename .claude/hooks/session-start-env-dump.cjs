#!/usr/bin/env node
// .claude/hooks/session-start-env-dump.cjs
//
// SessionStart hook (matchers: startup, resume, clear, compact).
// Outputs project state as a JSON envelope on stdout — Claude Code injects
// this into the model's opening context. Standardizes session-boot context
// across every team member's machine (Linux / Git Bash / native PowerShell).
//
// Also writes .claude/.session-env.json for downstream hooks to read without
// re-detecting. Pure enablement — does not block anything. Exit 0 always.
//
// Bash fallback sibling: session-start-env-dump.sh

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function safe(cmd, opts) {
  try { return execSync(cmd, Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }, opts || {})).trim(); }
  catch (e) { return null; }
}

function encodeProjectPathForMemory(p) {
  return p.replace(/:/g, '-').replace(/\//g, '-').replace(/\\/g, '-')
          .replace(/\./g, '-').replace(/ /g, '-').replace(/\(/g, '-').replace(/\)/g, '-');
}

function detectOS() {
  if (process.platform === 'linux') {
    const rel = safe('cat /etc/os-release') || '';
    const pretty = (rel.match(/^PRETTY_NAME="?([^"\n]+)"?/m) || [, 'linux'])[1];
    const ver = (rel.match(/^VERSION_ID="?([^"\n]+)"?/m) || [, ''])[1];
    return { platform: 'linux', distro_or_edition: pretty, version: ver, build_or_kernel: safe('uname -r') || '' };
  }
  if (process.platform === 'win32') {
    const out = safe('powershell -NoProfile -Command "Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, WindowsEditionId, OsBuildNumber | ConvertTo-Json -Compress"');
    if (out) {
      try {
        const i = JSON.parse(out);
        return { platform: 'windows', distro_or_edition: (i.WindowsProductName || '') + ' ' + (i.WindowsEditionId || ''), version: i.WindowsVersion || '', build_or_kernel: String(i.OsBuildNumber || '') };
      } catch (e) {}
    }
    return { platform: 'windows', distro_or_edition: 'unknown', version: '', build_or_kernel: '' };
  }
  if (process.platform === 'darwin') {
    const v = safe('sw_vers') || '';
    return {
      platform: 'macos',
      distro_or_edition: (v.match(/ProductName:\s*(.+)/) || [, 'macOS'])[1].trim(),
      version: (v.match(/ProductVersion:\s*(.+)/) || [, ''])[1].trim(),
      build_or_kernel: (v.match(/BuildVersion:\s*(.+)/) || [, ''])[1].trim()
    };
  }
  return { platform: process.platform, distro_or_edition: 'unknown', version: '', build_or_kernel: '' };
}

function detectShell() {
  if (process.env.MSYSTEM) return 'git-bash';
  if (process.env.SHELL && process.env.SHELL.indexOf('bash') !== -1) return 'bash';
  if (process.env.PSModulePath && !process.env.MSYSTEM) return 'powershell';
  return 'cmd-or-unknown';
}

function detectGit(root) {
  const installed = !!safe('git --version');
  if (!installed) return { installed: false };
  const isRepo = safe('git rev-parse --is-inside-work-tree', { cwd: root }) === 'true';
  if (!isRepo) return { installed: true, is_repo: false };
  const protectedLocal = (safe('git branch --list main master develop', { cwd: root }) || '')
    .split('\n').map(l => l.trim().replace(/^\*\s*/, '')).filter(Boolean);
  return {
    installed: true,
    is_repo: true,
    current_branch: safe('git rev-parse --abbrev-ref HEAD', { cwd: root }) || '',
    remote_configured: !!safe('git remote -v', { cwd: root }),
    protected_branches_local: protectedLocal
  };
}

function readOptIn(root) {
  const p = path.join(root, '.claude', 'project-config.json');
  if (!fs.existsSync(p)) return { state: 'UNSET', marker_file_present: false };
  try {
    const c = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (c.git_flow && typeof c.git_flow.enabled === 'boolean') {
      return {
        state: c.git_flow.enabled ? 'ENABLED' : 'DISABLED',
        marker_file_present: true,
        confirmed_at: c.git_flow.confirmed_at || null,
        main_branch: c.git_flow.main_branch || 'main',
        develop_branch: c.git_flow.develop_branch || 'develop'
      };
    }
    return { state: 'UNSET', marker_file_present: true };
  } catch (e) { return { state: 'UNSET', marker_file_present: true, parse_error: true }; }
}

function readTodo(root) {
  const p = path.join(root, 'docs', 'TODO.md');
  if (!fs.existsSync(p)) return { file_present: false };
  const c = fs.readFileSync(p, 'utf8');
  const inProg = c.match(/^###?\s*\[~\]\s*(.+)$/gm) || [];
  const pend = c.match(/^###?\s*\[ \]\s*(.+)$/gm) || [];
  return {
    file_present: true,
    in_progress_count: inProg.length,
    pending_count: pend.length,
    in_progress_titles: inProg.map(l => l.replace(/^###?\s*\[~\]\s*/, '').trim()).slice(0, 5)
  };
}

function readFinalized(root) {
  const p = path.join(root, 'docs', 'FINALIZED.md');
  if (!fs.existsSync(p)) return { file_present: false };
  const c = fs.readFileSync(p, 'utf8');
  const sessions = c.match(/^##\s*Session\s+([0-9-]+)/gm) || [];
  return {
    file_present: true,
    last_session: sessions.length ? sessions[sessions.length - 1].replace(/^##\s*Session\s+/, '').trim() : null,
    completed_count: (c.match(/^###?\s*\[x\]/gm) || []).length
  };
}

function readMemory(root) {
  const tdir = path.join(root, '.claude', 'memory-templates');
  if (!fs.existsSync(tdir)) return { templates_present: false };
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const adir = path.join(home, '.claude', 'projects', encodeProjectPathForMemory(path.resolve(root)), 'memory');
  const tfiles = fs.readdirSync(tdir).filter(f => f.endsWith('.md'));
  const apresent = fs.existsSync(adir);
  const afiles = apresent ? fs.readdirSync(adir).filter(f => f.endsWith('.md')) : [];
  const drift = tfiles.filter(f => {
    if (!afiles.indexOf(f) === false) return true;
    if (afiles.indexOf(f) === -1) return true;
    return fs.statSync(path.join(tdir, f)).mtimeMs > fs.statSync(path.join(adir, f)).mtimeMs;
  });
  return {
    templates_present: true,
    templates_count: tfiles.length,
    memory_synced_count: afiles.length,
    drift_count: drift.length,
    drift_files: drift.slice(0, 5),
    memory_dir: adir
  };
}

// SCRIPTKILL.1 (2026-08-20) — the script ban needs an enforcement point that is
// not just a memory file a compaction can bury. Gee, 2026-08-20: *"stop using
// scripts to edit code, files,and the stack"* + *"in the future delet them
// asfter u use them"*. 49 dead scripts had accumulated before anyone counted.
//
// Deliberately a REPORT, not a blocker. A PreToolUse guard that refuses a Write
// by path pattern would also refuse legitimate tooling, and a guard that silently
// eats a real write is precisely the failure class this whole ledger is about
// (GATFILE: a fetch guard that never auto-restored ate a real press). Naming the
// files at session start is enough — the rule is known, this makes a violation
// impossible to not notice.
//
// SCRIPTKILL.6 (2026-08-20) — the original scan looked at `scripts/` ONLY, and
// that is not where the hoard was. `scripts/` held 6 files; gitignored `.scratch/`
// held 152, of which 44 were `patch-*` / `fix-*` / `todo-*` file-editors. The
// report was clean the entire time the violation was at its worst, which makes it
// the same failure class as everything else in this ledger: an instrument that
// answers a narrower question than the one being asked, and reads as "all clear".
//
// A gitignored directory is invisible to `git ls-files --others --exclude-standard`
// by construction, so untracked-ness cannot be the signal there — for an ignored
// scan root EVERY file is untracked by definition, and the count itself is the
// signal. `ignored: true` selects that path per-root instead of pretending one
// detection rule fits both.
const SCRIPT_SCAN_ROOTS = [
  { dir: 'scripts', ignored: false },
  { dir: '.scratch', ignored: true }
];

// Name shapes that ARE the banned habit, tracked or not.
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
    dir: spec.dir,
    present: true,
    gitignored: !!spec.ignored,
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
  // Legacy top-level shape is kept pointing at `scripts/` so anything already
  // reading `env.scripts.file_count` does not silently change meaning; the
  // per-root detail lives under `roots`.
  const primary = roots.find(r => r.dir === 'scripts') || { present: false };
  return Object.assign({}, primary, {
    roots: roots,
    scanned_dirs: SCRIPT_SCAN_ROOTS.map(s => s.dir),
    total_file_count: live.reduce((n, r) => n + (r.file_count || 0), 0),
    total_patcher_shaped: live.reduce((n, r) => n + (r.patcher_shaped_count || 0), 0)
  });
}

function readPersona(root) {
  const p = path.join(root, '.claude', '.persona-state');
  if (fs.existsSync(p)) return { active_persona: fs.readFileSync(p, 'utf8').trim() };
  return { active_persona: 'unity (default)' };
}

function readYoloMode(root) {
  const p = path.join(root, '.claude', '.yolo-mode');
  if (!fs.existsSync(p)) return { enabled: false };
  try {
    const content = fs.readFileSync(p, 'utf8');
    const out = { enabled: true };
    content.split(/\n/).forEach(line => {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m) out[m[1].trim()] = m[2].trim();
    });
    return out;
  } catch (e) { return { enabled: true, parse_error: true }; }
}

(function main() {
  const root = process.cwd();
  const env = {
    timestamp: new Date().toISOString(),
    project_root: root,
    os: detectOS(),
    shell: detectShell(),
    git: detectGit(root),
    git_flow_opt_in: readOptIn(root),
    todo: readTodo(root),
    finalized: readFinalized(root),
    memory: readMemory(root),
    scripts: readScriptsDir(root),
    persona: readPersona(root),
    yolo_mode: readYoloMode(root)
  };

  try { fs.writeFileSync(path.join(root, '.claude', '.session-env.json'), JSON.stringify(env, null, 2)); } catch (e) {}

  process.stdout.write('## Session-start environment context (auto-injected by .claude/hooks/session-start-env-dump.cjs)\n\n');
  process.stdout.write('```json\n' + JSON.stringify(env, null, 2) + '\n```\n');
  process.stdout.write('\n*Reminder: Unity is the session default per `.claude/CLAUDE.md`. Memory layer in `~/.claude/projects/<encoded>/memory/` auto-loads at session start.*\n');

  if (env.git.is_repo && env.git_flow_opt_in.state === 'ENABLED') {
    const protected_ = ['main', 'master', 'develop', 'prod', 'production'];
    if (protected_.indexOf(env.git.current_branch) !== -1) {
      process.stdout.write('\n⚠ **On protected branch `' + env.git.current_branch + '`** — Git Flow opt-in is ENABLED. Branch into `feature/<descriptor>` before any edits per CONSTRAINTS.md §GIT FLOW.\n');
    }
  }
  if (env.memory.templates_present && env.memory.drift_count > 0) {
    process.stdout.write('\n⚠ **Memory drift detected** — ' + env.memory.drift_count + ' feedback file(s) in `memory-templates/` are newer than the user-profile memory copies. The PostToolUse memory-sync hook will sync on next edit, or run `start.sh` to refresh manually.\n');
  }
  // SCRIPTKILL.6 — one warning per scan root, so a clean `scripts/` can no longer
  // suppress a dirty `.scratch/`. The un-suffixed count is also printed for an
  // ignored root even when no name matches the patcher pattern: 152 loose files
  // in a scratch dir is itself the finding, whatever they are called.
  const scanRoots = (env.scripts && env.scripts.roots) || [];
  for (const s of scanRoots) {
    if (!s.present || s.read_error) continue;
    const dirty = s.untracked_count > 0 || s.patcher_shaped_count > 0;
    if (!dirty) continue;
    let msg = '\n⚠ **`' + s.dir + '/` hygiene** — the standing rule is: **no scripts to edit code, files or the stack** (Edit/Write tools only), and any genuinely-necessary one-shot gets deleted in the same commit that used it.';
    if (s.gitignored) {
      msg += ' This directory is **gitignored**, so nothing in it is tracked and nothing in it shows up in a `git status` — **' + s.file_count + ' loose file(s)** live here.';
    } else if (s.untracked_count > 0) {
      msg += ' **' + s.untracked_count + ' untracked file(s)**: `' + s.untracked.join('`, `') + '`.';
    }
    if (s.patcher_shaped_count > 0) {
      msg += ' **' + s.patcher_shaped_count + ' patcher-shaped name(s)**' +
             (s.patcher_shaped_count > s.patcher_shaped.length ? ' (first ' + s.patcher_shaped.length + ')' : '') +
             ': `' + s.patcher_shaped.join('`, `') + '`.';
    }
    msg += ' Delete them or say why they stay.\n';
    process.stdout.write(msg);
  }
  if (env.yolo_mode.enabled) {
    process.stdout.write('\n⚡ **YOLO mode is ENABLED** — lead-dev autonomy posture per `.claude/commands/yolo.md`. Unity acts then verifies; user test plan required on every task closure. `/sober` to deactivate.\n');
  }

  process.exit(0);
})();
