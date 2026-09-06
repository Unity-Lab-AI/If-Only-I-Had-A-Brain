#!/usr/bin/env node
/**
 * brain-ctl — the ALWAYS-UP control plane for the Unity brain.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Every power control used to live INSIDE brain-server.js (`/shutdown`,
 * `/restart`, `/savererun`, `/update`). That is a control plane hosted by the
 * very thing it controls, so it has one unavoidable dead zone: once the brain
 * is stopped, there is nothing left listening to start it again. On 2026-08-25
 * "Stop Brain" was pressed, the brain exited 42 (a deliberate halt systemd is
 * configured NOT to fight), and the box sat at 502 until someone with SSH
 * access ran one command. The operator who owns the brain had no way back in.
 *
 * brain-ctl is a separate, deliberately TINY systemd service that:
 *   1. stays up when the brain is down (it is not the brain, so brain crashes,
 *      OOM kills, GC pins and deliberate halts cannot take it with them), and
 *   2. can drive the brain's systemd unit — including `start`, the one verb the
 *      brain could never offer for itself.
 *
 * ── DESIGN RULES (deliberate, please keep) ─────────────────────────────────
 * • ZERO dependencies, node builtins only. It must start even if node_modules
 *   is mid-rsync during a deploy.
 * • It NEVER imports brain code, never loads weights, never allocates anything
 *   large. Its whole job is to be boring and alive. If this file ever needs the
 *   brain's modules, that is a bug in the change, not a missing feature here.
 * • It shells out ONLY to a fixed allowlist of systemctl verbs via a dedicated
 *   root helper (deploy/brain-ctl-helper.sh) authorised by a narrow sudoers
 *   rule. No user input ever reaches a shell. See SECURITY below.
 * • Binds loopback only. ALL external access arrives through nginx, which is
 *   where auth lives (HTTP Basic → the vouched X-UAL-User header), exactly like
 *   the brain's own admin lane.
 *
 * ── SECURITY ───────────────────────────────────────────────────────────────
 * The action is looked up in the ACTIONS table by exact key match, and only the
 * table's own hardcoded argv is ever executed. Request data is never
 * interpolated into a command, and execFile (no shell) is used, so there is no
 * shell to inject into. Unknown actions 400 before anything is spawned.
 *
 * Endpoints (all JSON):
 *   GET  /ctl/status   — brain up/down + systemd state + uptime. Never 502s.
 *   POST /ctl/start    — start a stopped brain. THE recovery verb.
 *   POST /ctl/stop     — true halt (brain saves + exits 42 if reachable).
 *   POST /ctl/restart  — savestart: force-save, resume marker, come back.
 *   POST /ctl/kick     — hard systemd restart, for a hung/unreachable brain.
 *   GET  /ctl/logs     — recent journal lines, for diagnosing a failed boot.
 *   GET  /ctl/health   — liveness of ctl itself.
 *
 * ...plus the rest of the power verbs the brain supports, which were ALSO only
 * reachable through the brain and so shared the same dead zone:
 *   POST /ctl/reset            — wipe to a fresh brain (identity-core preserved).
 *   POST /ctl/savererun        — keep weights, re-walk the curriculum on top.
 *   POST /ctl/update           — deploy latest code + FRESH WALK.
 *   POST /ctl/update-savestart — deploy latest code, RESUME saved training.
 *
 * Each of those delegates to the brain's own endpoint when the brain is up (so
 * behaviour is identical and it does its own bookkeeping), and does the
 * equivalent work directly when it is down. `savererun` is the one exception: it
 * must rewrite grade pointers inside the LOADED weights, so with the brain down
 * it refuses and says to press Start first, rather than pretending to work.
 */

'use strict';

const http = require('http');
const { execFile } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.UAL_CTL_PORT || '7526', 10);
const BIND = process.env.UAL_CTL_BIND || '127.0.0.1';
const BRAIN_PORT = parseInt(process.env.UAL_BRAIN_PORT || '7525', 10);
const BRAIN_HOST = process.env.UAL_BRAIN_HOST || '127.0.0.1';
const UNIT = process.env.UAL_BRAIN_UNIT || 'unity-brain';
const HELPER = process.env.UAL_CTL_HELPER
  || path.join(__dirname, '..', 'deploy', 'brain-ctl-helper.sh');

// ── LOCAL MODE — the same control plane, on a machine with no systemd ──────────
//
// This service was written for the box: every verb ends in `systemctl` via the
// root helper. Locally there is no systemd, no sudo and no unit — so the
// dashboard's control panel pointed at :7526, got nothing, and EVERY BUTTON
// HAS BEEN DEAD ON LOCALHOST SINCE IT SHIPPED. The panel already branches on
// `_dashIsLocal` and already targets this port; what was missing was anything
// answering it.
//
// ⭐ Adapted at the THREE PRIMITIVES (`runHelper`, `systemctlShow`, `journal`)
// rather than at the eleven verbs. Everything above those is written in terms
// of them plus a port probe, so `doStart` / `doStop` / `doRestart` / `doKick` /
// `doReset` / `doSaveRerun` are untouched and inherit local behaviour for free.
// Adapting per-verb would have been eleven chances to diverge from the box.
//
// ⚠ Detection is `/run/systemd/system`, the standard "am I under systemd" test
// — NOT `platform === 'linux'`, because a Linux dev box without systemd (WSL,
// a container) is exactly as local as Windows is.
const IS_SYSTEMD = process.platform === 'linux' && fs.existsSync('/run/systemd/system');
const LOCAL_MODE = !IS_SYSTEMD;
const IS_WIN = process.platform === 'win32';
const REPO_ROOT = path.join(__dirname, '..');
// The launchers already exist for both platforms and already do the full job
// (bundle build, memory install, env). Spawning `node brain-server.js` directly
// would be a SECOND definition of "start the brain" that silently drifts from
// the one the operator actually uses.
const LAUNCH_DIR = path.join(REPO_ROOT, IS_WIN ? 'windows' : 'linux');
const LAUNCHERS = Object.freeze({
  // start.* wipes state (fresh walk); Savestart.* keeps it. That is the
  // launchers' own contract, not a new one invented here.
  fresh: path.join(LAUNCH_DIR, IS_WIN ? 'start.bat' : 'start.sh'),
  save: path.join(LAUNCH_DIR, IS_WIN ? 'Savestart.bat' : 'Savestart.sh'),
  stop: path.join(LAUNCH_DIR, IS_WIN ? 'stop.bat' : 'stop.sh'),
});

/**
 * Spawn a launcher DETACHED and let go of it.
 *
 * ⛔ `detached + unref + stdio:'ignore'` is load-bearing, not tidiness. The
 * brain outlives this request by hours; if it stayed a child of brain-ctl it
 * would die whenever brain-ctl restarted, and holding its stdio would block on
 * a full pipe buffer — which is how a "start" that appears to hang actually
 * hangs. Detaching is what makes this service able to restart the thing that
 * outlives it.
 */
function spawnLauncher(script) {
  const { spawn } = require('child_process');
  if (!fs.existsSync(script)) {
    return Promise.reject(new Error(`launcher not found: ${script}`));
  }
  return new Promise((resolve, reject) => {
    try {
      const child = IS_WIN
        // cmd.exe /c runs the .bat; the empty title arg is required by `start`
        // when any later argument is quoted, or cmd treats the path AS the title.
        ? spawn('cmd.exe', ['/c', 'start', '', '/D', LAUNCH_DIR, path.basename(script)],
            { cwd: LAUNCH_DIR, detached: true, stdio: 'ignore', windowsHide: false })
        : spawn('bash', [script],
            { cwd: LAUNCH_DIR, detached: true, stdio: 'ignore' });
      child.on('error', reject);
      child.unref();
      resolve({ stdout: `launched ${path.basename(script)}`, stderr: '' });
    } catch (e) { reject(e); }
  });
}

/**
 * Is the working tree dirty? Used to REFUSE a pull rather than risk the
 * operator's files.
 *
 * ⛔ A SAVESTART MUST NEVER OVERWRITE ANYTHING IN THE OPERATOR'S DIRECTORY —
 * the workflow tree above all. This is the guard for that.
 * `git pull --ff-only` already refuses to clobber modified tracked
 * files, and `.claude/` is gitignored so a pull cannot see it at all — but
 * "git would probably refuse" is not a safety argument. We check first and
 * SKIP the pull entirely when anything is uncommitted, then still do the
 * restart the operator asked for.
 */
function localTreeDirty() {
  return new Promise((resolve) => {
    execFile('git', ['status', '--porcelain'], { cwd: REPO_ROOT, timeout: 30000 },
      (err, stdout) => {
        // Unreadable git status => treat as dirty. The safe answer to "I do not
        // know whether this would overwrite your work" is "do not pull".
        if (err) return resolve({ dirty: true, reason: 'git status unreadable' });
        const lines = String(stdout || '').split('\n').filter(Boolean);
        resolve({ dirty: lines.length > 0, files: lines.length, reason: lines.length ? `${lines.length} uncommitted change(s)` : '' });
      });
  });
}

/** git pull in the repo — the local stand-in for deploy/self-update.sh. */
function localGitPull() {
  return new Promise((resolve) => {
    // --ff-only: never creates a merge, never rewrites, and aborts rather than
    // reconciling. The most conservative pull there is.
    execFile('git', ['pull', '--ff-only'], { cwd: REPO_ROOT, timeout: 120000 },
      (err, stdout, stderr) => {
        // ⚠ Resolves even on failure, with `ok:false`. A pull that cannot
        // fast-forward (dirty tree, diverged branch) must NOT abort a restart
        // the operator asked for — it must be REPORTED and stepped over. The
        // opposite would make a local button silently do nothing.
        resolve({
          ok: !err,
          out: String(stdout || '').trim(),
          err: String((err && (err.stderr || err.message)) || stderr || '').trim(),
        });
      });
  });
}

// How long to let the brain flush ~5.4GB of weights after a graceful stop
// before we consider the process gone. Generous on purpose: cutting a save
// short is how trained state gets corrupted.
const GRACEFUL_WAIT_MS = parseInt(process.env.UAL_CTL_GRACEFUL_WAIT_MS || '20000', 10);

// How long to wait for a freshly-started brain to BIND its port. Deliberately
// generous: at 411M neurons the boot loads ~5.4 GB of weights before it
// listens, and reporting a false failure while it is coming up correctly is
// exactly the kind of lie this service exists to remove. Overridable so tests
// (and smaller brains) need not sit through the full budget.
const BIND_WAIT_MS = parseInt(process.env.UAL_CTL_BIND_WAIT_MS || '300000', 10);

// Where the brain keeps the flags that steer its NEXT boot. brain-ctl writes
// these directly so the destructive/deploy verbs work with the brain DOWN —
// which is the whole reason this service exists. Paths must match
// brain-server.js: `.force-fresh` lives beside it in server/, and the resume
// marker is what makes a later start auto-resume instead of re-walking.
const BRAIN_DIR = process.env.UAL_BRAIN_DIR || __dirname;
const FORCE_FRESH_PATH = path.join(BRAIN_DIR, '.force-fresh');
const RESUME_MARKER_PATH = process.env.UAL_RESUME_MARKER
  // NOTE: `.resume-marker.json` — the exact filename brain-server.js uses
  // (RESUME_MARKER_PATH). Getting this wrong would silently mean a Reset did
  // not clear the marker, so the "fresh" brain would resume old training.
  || path.join(BRAIN_DIR, '.resume-marker.json');
const SELF_UPDATE_SH = process.env.UAL_SELF_UPDATE_SH
  || path.join(BRAIN_DIR, '..', 'deploy', 'self-update.sh');

const log = (...a) => console.log(`[BrainCtl ${new Date().toISOString()}]`, ...a);

/**
 * The ONLY commands this service can ever run. Keys are matched exactly;
 * values are fixed argv arrays. Nothing from a request is ever added here.
 */
const ACTIONS = Object.freeze({
  start: ['start', UNIT],
  stop: ['stop', UNIT],
  restart: ['restart', UNIT],
  'reload-nginx': ['reload-nginx'],
});

function runHelper(action) {
  const argv = ACTIONS[action];
  if (!argv) return Promise.reject(new Error(`refusing unknown action: ${action}`));
  // LOCAL MODE — same closed verb set, different mechanism. The allowlist check
  // above still runs first, so local mode cannot execute anything the box
  // could not; it only substitutes the launcher for systemctl.
  if (LOCAL_MODE) {
    if (action === 'start') return spawnLauncher(LAUNCHERS.save);
    if (action === 'stop') {
      // Prefer the platform's own stop script; if the repo has none, fall
      // through to the graceful HTTP shutdown the callers already use.
      return fs.existsSync(LAUNCHERS.stop)
        ? spawnLauncher(LAUNCHERS.stop)
        : Promise.resolve({ stdout: 'no stop script — graceful shutdown only', stderr: '' });
    }
    if (action === 'restart') return spawnLauncher(LAUNCHERS.save);
    // reload-nginx has no local meaning and says so rather than pretending.
    return Promise.resolve({ stdout: `no-op on local: ${action}`, stderr: '' });
  }
  return new Promise((resolve, reject) => {
    // execFile, not exec — no shell is spawned, so there is no shell to inject
    // into even if an argv element were somehow attacker-influenced.
    execFile('sudo', ['-n', HELPER, ...argv], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = String(stdout || '');
        err.stderr = String(stderr || '');
        return reject(err);
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function systemctlShow(unit) {
  // LOCAL MODE — there is no unit. Synthesize the same SHAPE the callers expect
  // from what IS knowable locally: whether the brain's port is answering.
  // ⚠ Fields that genuinely cannot be known locally are reported as such
  // rather than guessed — a fabricated `ActiveState: active` would be exactly
  // the kind of confident-wrong readout this project keeps having to un-ship.
  if (LOCAL_MODE) {
    return probeBrainPort().then((up) => ({
      LoadState: 'not-loaded',
      ActiveState: up ? 'active' : 'inactive',
      SubState: up ? 'running' : 'dead',
      UnitFileState: 'n/a (local — no systemd unit)',
      ExecMainStartTimestamp: '',
      ExecMainPID: '',
      NRestarts: '',
      Result: '',
      _local: true,
      _source: 'port probe (no systemd on this host)',
    })).catch(() => ({
      LoadState: 'not-loaded', ActiveState: 'unknown', SubState: 'unknown',
      _local: true, _source: 'port probe failed',
    }));
  }
  return new Promise((resolve) => {
    execFile('systemctl', [
      'show', unit,
      '-p', 'ActiveState', '-p', 'SubState', '-p', 'Result',
      '-p', 'ExecMainStatus', '-p', 'ActiveEnterTimestamp',
      '-p', 'NRestarts', '-p', 'MemoryCurrent', '-p', 'LoadState',
    ], { timeout: 10000 }, (err, stdout) => {
      if (err) return resolve({});
      const out = {};
      for (const line of String(stdout).split('\n')) {
        const i = line.indexOf('=');
        if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
      }
      resolve(out);
    });
  });
}

/**
 * Is the brain actually SERVING? systemd `active` is necessary but not
 * sufficient: boot loads ~5.4GB of weights BEFORE binding the port, so there is
 * a legitimate multi-minute window where the unit is active and the brain is
 * not yet reachable. Conflating those two is what made the old dashboard lie.
 * A raw TCP connect is the cheapest honest probe and costs the brain nothing.
 */
function probeBrainPort(timeoutMs = 2000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (up) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch { /* already gone */ }
      resolve(up);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    try { sock.connect(BRAIN_PORT, BRAIN_HOST); } catch { finish(false); }
  });
}

// ⛔⛔ A TCP CONNECT IS NOT PROOF THE BRAIN IS SERVING, AND ON 2026-09-04 THAT
// DISTINCTION WAS THE WHOLE OUTAGE. A runaway `git lfs pull` (spawned by the
// brain, so sharing its cgroup and MemoryHigh budget) starved the event loop to
// "2% serviced". Node never stopped LISTENING, so the KERNEL kept completing
// handshakes from the listen backlog — `probeBrainPort()` connected instantly
// and /ctl/status reported:
//     { brainOnline: true, phase: "online", human: "Brain is online and serving." }
// …while `curl http://127.0.0.1:7525/public-state.json` timed out at 20s and the
// public site served nothing. The site was reported as not connecting at all,
// and every status surface contradicted that report.
// THE REPORT WAS RIGHT AND THE PANEL WAS WRONG.
//
// ⭐ The accept queue is drained by the kernel; only a RESPONSE proves the
// JavaScript thread is alive. So the status path now asks for one. This is the
// single check that distinguishes "starved" from "serving", and nothing else in
// the control plane could make that call.
function probeBrainResponds(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const started = Date.now();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve({ ok, ms: Date.now() - started });
    };
    let req;
    try {
      req = http.request(
        { host: BRAIN_HOST, port: BRAIN_PORT, path: '/public-state.json', method: 'GET', timeout: timeoutMs },
        (res) => {
          // Any status line at all means the event loop ran our handler. The
          // BODY is irrelevant here and is deliberately discarded — this asks
          // "is the loop alive", not "is the state good".
          res.resume();
          finish(true);
        },
      );
    } catch { return finish(false); }
    req.on('timeout', () => { try { req.destroy(); } catch { /* gone */ } finish(false); });
    req.on('error', () => finish(false));
    try { req.end(); } catch { finish(false); }
  });
}

function journal(lines = 60) {
  // LOCAL MODE — no journald. The brain's own console ring is reachable over its
  // HTTP tunnel, but that requires the brain to be UP, and the times you most
  // want logs are the times it is not. So: say plainly that there is no local
  // journal and point at where the output actually goes (the launcher window),
  // instead of returning an empty list that reads as "nothing was logged".
  if (LOCAL_MODE) {
    // ⭐ There IS a local log — the launchers redirect the brain to
    // `server/server.log` (`node brain-server.js > server.log 2>&1`). Tailing
    // the real file beats returning "no journal here", and unlike the brain's
    // own console ring it is readable when the brain is DOWN, which is exactly
    // when logs are wanted.
    const logPath = path.join(__dirname, 'server.log');
    return new Promise((resolve) => {
      fs.readFile(logPath, 'utf8', (err, txt) => {
        if (err) {
          // Same rule as the journald path below: an absent file is not an
          // empty log, and the shape says which it was.
          return resolve({
            ok: false,
            log: '',
            error: 'no-local-log',
            detail: String((err && err.message) || err || ''),
            human: `No systemd journal on this host (local run), and no ${logPath} yet. `
              + `The launchers write the brain's output there; it appears once ${IS_WIN ? 'start.bat / Savestart.bat' : 'start.sh / Savestart.sh'} has run.`,
          });
        }
        const all = String(txt).split('\n');
        // Tail only — this file grows for the whole walk and must never be
        // read into a response whole.
        resolve({ ok: true, log: all.slice(Math.max(0, all.length - lines)).join('\n') });
      });
    });
  }
  return new Promise((resolve) => {
    execFile('journalctl', ['-u', UNIT, '-n', String(lines), '--no-pager', '-o', 'short-iso'],
      { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (!err) return resolve({ ok: true, log: String(stdout || '') });
        // ⛔⛔ A REFUSED READ IS NOT A READ, AND THIS ROUTE USED TO REPORT IT AS
        // ONE. It returned the error text as the LOG BODY under `ok: true`, so a
        // caller asking "what did the boot say?" got a 200, a truthy ok, and a
        // string — which reads as output. On 2026-09-04, during a real outage
        // with the brain unreachable, that is exactly how it presented: the one
        // instrument that survives a dead brain answered `ok: true` and said
        // nothing, and the actual message was buried inside the field meant for
        // log lines.
        //
        // ⭐ THE PERMISSION CASE GETS ITS OWN VERDICT because it is the likely
        // one and the fix is a single unit directive. journald denies a
        // non-privileged service silently-ish: "No journal files were opened due
        // to insufficient permissions", pointing at the 'adm' and
        // 'systemd-journal' groups. The control plane runs as its own hardened
        // user, so out of the box it CANNOT read the logs it exists to serve.
        const msg = String((err && err.message) || err || '');
        const denied = /insufficient permissions|No journal files were opened|Permission denied/i.test(msg);
        resolve({
          ok: false,
          log: '',
          error: denied ? 'journal-permission-denied' : 'journal-unavailable',
          detail: msg,
          human: denied
            ? `This service cannot read the systemd journal, so there are no logs to show — this is a PERMISSIONS result, not an empty log. `
              + `Fix: add "SupplementaryGroups=systemd-journal" to the ${UNIT}-ctl unit, then daemon-reload and restart the control plane. `
              + `Until then, boot failures can only be read with shell access on the box.`
            : `The journal could not be read (${msg.slice(0, 200)}). This says nothing about whether the brain logged anything.`,
        });
      });
  });
}

async function buildStatus() {
  const [show, portUp] = await Promise.all([systemctlShow(UNIT), probeBrainPort()]);
  const activeState = show.ActiveState || 'unknown';
  const active = activeState === 'active';
  const exitStatus = show.ExecMainStatus ? parseInt(show.ExecMainStatus, 10) : null;

  // Set by the active-but-not-serving branch below: whether the brain is
  // plausibly still booting or has been up far too long for that. Declared here
  // so the returned object can publish it without re-deriving the timestamp.
  let _loopPinned = false;
  let _activeForSecOut = null;
  // Round-trip ms of the responsiveness probe when it succeeded; null when the
  // brain did not answer (or was never asked, because the port was closed).
  let _respondedMs = null;

  // Distinguish the states that need DIFFERENT operator actions. The old
  // dashboard collapsed all of these into one "unreachable" banner, which is
  // why a deliberate halt looked identical to a crashed boot.
  let phase;
  let human;
  if (active && portUp) {
    // ⛔ PORT-OPEN IS NOT SERVING. The kernel completes handshakes from the
    // listen backlog whether or not the JS thread is alive, so this branch used
    // to report "online and serving" through a total outage (see
    // probeBrainResponds above). Ask for an actual RESPONSE before saying so.
    const responded = await probeBrainResponds();
    if (responded.ok) {
      phase = 'online';
      human = 'Brain is online and serving.';
      _respondedMs = responded.ms;
    } else {
      // ⚠ PHASE STAYS A UI CONTRACT. `html/dashboard.html` enables Stop /
      // Restart / Kick by POSITIVE match on 'online' || 'booting', so inventing
      // a phase here would DISABLE every power control on exactly the brain an
      // operator most needs to act on. Same reasoning as the booting branch
      // below: the phase is the contract, the `human` string is the message.
      phase = 'online';
      _loopPinned = true;
      _respondedMs = null;
      human = 'Brain is LISTENING but NOT ANSWERING — the port accepts connections (the kernel does that) '
        + `while requests time out after ${responded.ms}ms. The event loop is pinned or starved, so the site, `
        + 'dashboard and chat will look disconnected even though the process is alive and training may be fine. '
        + 'Usual cause: a long synchronous operation, or another process sharing this cgroup/disk — a `git lfs pull` '
        + 'from a deploy has done exactly this (check `pgrep -fa git-lfs`). Prefer waiting or removing the competing '
        + 'work over restarting; a restart abandons whatever it is holding.';
    }
  } else if (active && !portUp) {
    // ⛔⛔ THIS BRANCH USED TO ASSERT "normal for the first minute or two after a
    // start" UNCONDITIONALLY, AND ON 2026-09-04 IT MISDIRECTED FOR OVER AN HOUR.
    // The brain had not started at all: `activeEnter` was hours old, the same
    // process throughout, `exitStatus 0`, `result success`. The real state was a
    // LIVE process with a PINNED EVENT LOOP — starved by a 114 GB transfer
    // sharing its disk — which is a completely different situation with a
    // completely different response, and the panel confidently called it a boot.
    //
    // ⭐ `ActiveEnterTimestamp` IS THE FIELD THAT SETTLES IT. "Booting" and
    // "alive but not accepting" are indistinguishable from `portOpen:false`
    // alone; they are trivially distinguishable from whether the unit's active
    // timestamp is recent. So it is read, not assumed.
    const _enterMs = Date.parse(show.ActiveEnterTimestamp || '') || 0;
    const _activeForSec = _enterMs ? Math.round((Date.now() - _enterMs) / 1000) : null;
    // 10 minutes: a cold biological-scale boot is ~15s of construction plus the
    // GloVe stream (16.8s measured on a workstation, so under a minute on the
    // box). Ten minutes is generous by an order of magnitude and still well
    // inside "something else is wrong".
    const _plausiblyBooting = _activeForSec == null || _activeForSec < 600;
    // ⚠ THE PHASE STAYS `booting` ON PURPOSE — only the SENTENCE changes.
    // A new phase value looked cleaner and would have broken the dashboard:
    // `html/dashboard.html` enables Stop / Restart / Kick by POSITIVE match on
    // `'online' || 'booting'` (≈:4323-4327), so an unrecognised phase silently
    // DISABLES every power control — leaving an operator unable to act on
    // exactly the brain this branch exists to describe. Worse than the wrong
    // words. The phase is a UI contract; the `human` string is the message.
    phase = 'booting';
    // Published so a caller can distinguish the two cases without re-deriving
    // it, and so the dashboard can colour it later without a protocol change.
    _loopPinned = !_plausiblyBooting;
    _activeForSecOut = _activeForSec;
    // ⛔⛔ THE ADVICE HAS TO TURN OVER, AND IT DID NOT. This message ended
    // "Wait for the operation to finish; a restart here would abandon whatever
    // it is holding" — correct for a save minutes from completing, and WRONG
    // after nineteen hours. It was read live at `activeForSec: 70168` while the
    // very same sentence already said "far too long to still be booting", so
    // the payload counselled patience and named the reason not to, in one
    // breath. **Counselling patience past every plausible operation is not
    // caution, it is an instrument telling an operator to do nothing while
    // nothing happens.**
    //
    // ⭐ THE TURNOVER POINT IS DERIVED, NOT PICKED. The longest legitimate
    // event-loop pin measured on this box is the shutdown weights save at
    // ~112 s, with the forced-consolidation cap next at 120 s
    // (`DREAM_CONSOLIDATION_FORCE_MAX_MS`) and a routine 5.4 GB binary save at
    // ~19 s of wall. 1800 s is **15× the longest pin anyone has recorded here**,
    // so anything past it is not an operation running long — it is an operation
    // that is not going to finish. Env-overridable for a box with slower disk.
    const _stuckAfterSec = (Number(process.env.UAL_CTL_STUCK_AFTER_SEC) > 0)
      ? Number(process.env.UAL_CTL_STUCK_AFTER_SEC) : 1800;
    const _beyondAnyOperation = _activeForSec != null && _activeForSec > _stuckAfterSec;
    human = _plausiblyBooting
      ? 'Brain process is running but has not bound its port yet — it loads ~5.4 GB of weights before listening. This is normal for the first minute or two after a start.'
      : `Brain process is ALIVE but not accepting connections, and it has been active for ${_activeForSec}s — far too long to still be booting. `
        + `This is NOT a start-up delay and NOT a crash: the unit never restarted (exit ${exitStatus == null ? 'n/a' : exitStatus}, result ${show.Result || 'n/a'}). `
        + `The event loop is pinned. The usual cause is a long synchronous operation or disk starvation — a weights save competing with a large transfer on the same volume will do it. `
        + (_beyondAnyOperation
          ? `⛔ It has now been pinned for ${(_activeForSec / 3600).toFixed(1)} hours, which is past every operation this brain performs — the longest pin ever measured here is the shutdown weights save at ~112s. This will NOT clear on its own. RESTART IT. Whatever it was holding is already lost; waiting only adds to it.`
          : `Wait for the operation to finish; a restart here would abandon whatever it is holding. ⚠ If this is still true past ${Math.round(_stuckAfterSec / 60)} minutes, stop waiting — that is beyond every operation this brain performs, and this message will say so.`);
  } else if (!active && portUp) {
    // Serving, but not via the unit we manage — typically a hand-started
    // `node server/brain-server.js` (local dev, or an admin debugging on the
    // box). Reporting this as "offline" would be a lie the site would visibly
    // contradict, and offering Start would fail on an already-bound port. Say
    // exactly what is true instead.
    // ⛔ SAME PORT-OPEN-IS-NOT-SERVING TRAP AS THE `online` BRANCH ABOVE. A
    // hand-started brain can have a pinned event loop just as easily as a
    // systemd-managed one — more easily, since that is often WHY someone is
    // debugging it by hand. Asserting "something is serving" on the strength of
    // a completed TCP handshake is the same wrong claim in a different branch.
    const responded = await probeBrainResponds();
    phase = 'unmanaged';
    if (responded.ok) {
      _respondedMs = responded.ms;
      human = `Something is serving on port ${BRAIN_PORT}, but systemd unit "${UNIT}" is ${activeState} — so the brain was most likely started by hand rather than by systemd. Power controls here drive the unit and will not affect a hand-started process; stop it the way it was started.`;
    } else {
      _loopPinned = true;
      human = `Something is LISTENING on port ${BRAIN_PORT} but NOT ANSWERING — requests time out after ${responded.ms}ms while the port still accepts connections (the kernel does that, not the app). `
        + `systemd unit "${UNIT}" is ${activeState}, so this is a hand-started process with a pinned or starved event loop. `
        + 'Usual cause: a long synchronous operation, or another process competing for the same cgroup/disk — a `git lfs pull` from a deploy has done exactly this (check `pgrep -fa git-lfs`). '
        + 'Power controls here drive the unit and will not affect a hand-started process.';
    }
  } else if (exitStatus === 42 && activeState === 'inactive') {
    // 42 is the deliberate-halt sentinel, and it is only meaningful while the
    // unit is genuinely stopped — ExecMainStatus lingers as the LAST exit code,
    // so checking it without the state guard would keep claiming "deliberately
    // halted" long after a subsequent failure or start.
    phase = 'halted';
    human = 'Brain was DELIBERATELY halted (exit 42). systemd is configured not to revive a deliberate halt, so it will stay down until someone starts it. Press Start.';
  } else if (activeState === 'failed') {
    phase = 'failed';
    human = 'Brain FAILED (crashed or was killed — check logs, e.g. an OOM kill). Press Start to try again; if it fails repeatedly the logs will say why.';
  } else {
    phase = 'offline';
    human = 'Brain is not running. Press Start to bring it back — it resumes saved training automatically.';
  }

  return {
    ok: true,
    // Means SERVING, not merely "systemd says active" — that distinction is the
    // whole point. `unmanaged` counts as online because the site really works.
    // ⛔ `&& !_loopPinned` IS LOAD-BEARING. A starved brain keeps `phase:'online'`
    // ON PURPOSE (the dashboard gates its power buttons on that string, and
    // disabling them here would strand the operator). But it is NOT online in any
    // sense a caller cares about — on 2026-09-04 this field said `true` through a
    // total outage. The phase is a UI contract; THIS is the honest answer.
    brainOnline: (phase === 'online' || phase === 'unmanaged') && !_loopPinned,
    phase,
    // ⭐ THE FIELD THAT WOULD HAVE ENDED AN HOUR OF GUESSING. `phase:'booting'`
    // covers two situations that need opposite responses — wait, or investigate
    // a pinned loop — and only the unit's active-for duration separates them.
    // Published rather than folded into prose so a caller can branch on it.
    // ⭐ It now ALSO fires for the listening-but-not-answering case, which is the
    // one the port probe alone could never see.
    loopPinned: _loopPinned,
    // Round-trip of the responsiveness probe (ms) when the brain answered.
    // null = it did not answer, or was not asked because the port was closed.
    respondedMs: _respondedMs,
    activeForSec: _activeForSecOut,
    human,
    unit: {
      name: UNIT,
      loadState: show.LoadState || 'unknown',
      activeState,
      subState: show.SubState || 'unknown',
      result: show.Result || 'unknown',
      exitStatus,
      nRestarts: show.NRestarts ? parseInt(show.NRestarts, 10) : null,
      activeEnter: show.ActiveEnterTimestamp || null,
      memoryBytes: show.MemoryCurrent && show.MemoryCurrent !== '[not set]'
        ? Number(show.MemoryCurrent) : null,
    },
    portOpen: portUp,
    brainPort: BRAIN_PORT,
    ctl: { version: 1, pid: process.pid, uptimeSec: Math.round(process.uptime()) },
    at: new Date().toISOString(),
  };
}

/**
 * Ask the brain to stop ITSELF first, so it force-saves weights and drops the
 * resume marker. Only fall back to `systemctl stop` if it is unreachable.
 * Skipping this and going straight to systemd would risk losing the delta since
 * the last checkpoint, which at this scale is hours of training.
 */
function askBrainToShutdown(route) {
  return new Promise((resolve) => {
    const req = http.request({
      host: BRAIN_HOST, port: BRAIN_PORT, path: route, method: 'POST',
      timeout: 10000,
      // brain-server's requireLoopback also accepts a vouched admin header;
      // we ARE loopback, so this is just an identity label in its logs.
      headers: { 'X-UAL-User': 'brain-ctl', 'Content-Length': '0' },
    }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ reached: true, status: res.statusCode, body: body.slice(0, 500) }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ reached: false, reason: 'timeout' }); });
    req.on('error', (e) => resolve({ reached: false, reason: e.message }));
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForPortClosed(budgetMs) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (!(await probeBrainPort(1000))) return true;
    await sleep(1000);
  }
  return false;
}

/**
 * Wait for a starting brain to bind its port. Gives up EARLY if systemd reports
 * the unit failed — otherwise a crash-looping boot would hold the operator's
 * request open for the full (deliberately long) budget with no signal.
 */
async function waitForBrainBound(budgetMs = BIND_WAIT_MS) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await probeBrainPort(1500)) return true;
    const s = await systemctlShow(UNIT);
    if ((s.ActiveState || '') === 'failed') return false;
    await sleep(2000);
  }
  return false;
}

// ── Actions ────────────────────────────────────────────────────────────────

async function doStart() {
  const before = await buildStatus();
  if (before.brainOnline) {
    return { ok: true, action: 'start', noop: true, message: 'Brain is already online.', status: before };
  }
  log('START requested — starting unit', UNIT);
  await runHelper('start');

  // ── The "reboot JUST the brain's web server" step ──
  // A brain restart re-creates the listening socket behind nginx's upstream.
  // nginx caches upstream connections and, on some failure paths, keeps
  // serving from a stale/failed upstream state after the backend reappears —
  // which shows up as a lingering 502 even though the brain is healthy again.
  // Reloading nginx after the brain binds re-establishes the proxy lanes
  // cleanly. Reload (not restart) is graceful: existing connections drain, the
  // static site NEVER goes down, so the web server stays up exactly as
  // required. Best-effort: a reload failure must not mask a successful start.
  let proxyReloaded = false;
  let proxyReloadError = null;
  const bound = await waitForBrainBound();

  if (bound) {
    try { await runHelper('reload-nginx'); proxyReloaded = true; log('nginx reloaded after brain bound its port'); }
    catch (e) { proxyReloadError = e.message; log('nginx reload FAILED (start still succeeded):', e.message); }
  }

  const after = await buildStatus();
  return {
    ok: true,
    action: 'start',
    boundPort: bound,
    proxyReloaded,
    proxyReloadError,
    message: bound
      ? `Brain started and is serving.${proxyReloaded ? ' Proxy lanes reloaded.' : ''}`
      : 'Brain was started but has not bound its port yet — it may still be loading weights. Check status/logs.',
    status: after,
  };
}

async function doStop() {
  log('STOP requested — asking the brain to halt itself first (so it force-saves)');
  const asked = await askBrainToShutdown('/shutdown');
  let graceful = false;
  if (asked.reached) {
    graceful = await waitForPortClosed(GRACEFUL_WAIT_MS);
    log(`brain /shutdown accepted; port closed=${graceful}`);
  } else {
    log('brain unreachable for graceful stop:', asked.reason);
  }
  // Always follow with systemctl stop: it makes the unit's state match reality
  // (so a later `start` is not fighting a half-stopped unit) and it is the only
  // path available when the brain never answered.
  try { await runHelper('stop'); } catch (e) { log('systemctl stop reported:', e.message); }
  const after = await buildStatus();
  return {
    ok: true,
    action: 'stop',
    gracefulSave: asked.reached && graceful,
    brainAnswered: asked.reached,
    message: asked.reached
      ? 'Brain saved its state and halted. It will stay down until you press Start.'
      : 'Brain was not answering, so it was stopped at the process level. Unsaved training since the last checkpoint may be lost.',
    status: after,
  };
}

async function doRestart() {
  // Prefer the brain's OWN /restart: it force-saves, writes the resume marker
  // and exits 0, which systemd's Restart=always then revives — the true
  // "savestart". Falling straight to systemctl would skip the save.
  log('RESTART (savestart) requested — trying the brain\'s own /restart first');
  const asked = await askBrainToShutdown('/restart');
  let viaBrain = false;
  if (asked.reached && asked.status === 200) {
    viaBrain = await waitForPortClosed(GRACEFUL_WAIT_MS);
  }
  if (!viaBrain) {
    log('brain did not exit on its own — escalating to systemctl restart');
    await runHelper('restart');
  }
  const bound = await waitForBrainBound();
  let proxyReloaded = false;
  if (bound) {
    try { await runHelper('reload-nginx'); proxyReloaded = true; } catch (e) { log('nginx reload failed:', e.message); }
  }
  const after = await buildStatus();
  return {
    ok: true,
    action: 'restart',
    savestart: viaBrain,
    boundPort: bound,
    proxyReloaded,
    message: bound
      ? `Brain restarted and is serving again${viaBrain ? ' (saved + resumed)' : ' (escalated to a process restart)'}.`
      : 'Restart issued but the brain has not bound its port yet — it may still be loading weights.',
    status: after,
  };
}

async function doKick() {
  // For a brain that is "active" but wedged (event-loop pinned, not answering).
  // Deliberately does NOT try the graceful path — that is what /restart is for.
  log('KICK requested — hard systemctl restart, no graceful save attempt');
  await runHelper('restart');
  const after = await buildStatus();
  return {
    ok: true,
    action: 'kick',
    message: 'Hard restart issued. The brain resumes from its last checkpoint, so anything since then is lost — this is the wedged-brain escape hatch.',
    status: after,
  };
}

// ── The remaining verbs the brain supports ("everything else inbetween") ────
// /reset, /savererun and /update all RESTART the brain, and all used to be
// served BY the brain — so they were unreachable in exactly the situation where
// an operator most needs them (brain down/failed and needing a wipe, a re-walk,
// or a code fix). Each is implemented here as: ask the brain to do it itself if
// it is up (identical behaviour, its own bookkeeping), otherwise perform the
// equivalent boot-flag work directly and start it. That keeps one button doing
// one predictable thing regardless of whether the brain happens to be alive.

/**
 * RESET — wipe to a fresh brain. Mirrors brain-server's /reset: write
 * `.force-fresh` (autoClearStaleState then WIPES weights on boot, identity-core
 * Tier 3 anchors preserved) and DELETE the resume marker so the fresh boot does
 * not auto-resume the very training we are discarding.
 */
async function doReset(confirmToken) {
  // Same destructive-verb interlock as /ctl/update fresh-walk — see the long
  // note there. Reset throws away every trained weight, so the API refuses
  // unless the caller states that intent explicitly.
  if (confirmToken !== 'WIPE') {
    return {
      ok: false, action: 'reset', refused: true, needsConfirm: 'WIPE',
      message: 'Refused: RESET destroys all trained weights. Re-send with {"confirm":"WIPE"} (the dashboard button asks you to type it). To keep training and just restart, use /ctl/restart.',
      status: await buildStatus(),
    };
  }
  log('RESET requested — arming a fresh-brain wipe (confirmed)');
  const asked = await askBrainToShutdown('/reset');
  if (asked.reached && asked.status === 200) {
    const gone = await waitForPortClosed(GRACEFUL_WAIT_MS);
    const bound = gone ? await waitForBrainBound() : false;
    let proxyReloaded = false;
    if (bound) { try { await runHelper('reload-nginx'); proxyReloaded = true; } catch { /* reported below */ } }
    return {
      ok: true, action: 'reset', viaBrain: true, boundPort: bound, proxyReloaded,
      message: bound
        ? 'Reset done by the brain itself — it is back up on a FRESH brain (trained weights wiped, identity-core preserved).'
        : 'Reset armed by the brain; it is restarting into a fresh walk but has not bound its port yet.',
      status: await buildStatus(),
    };
  }

  // Brain is down — do the equivalent work ourselves. This is the case the old
  // dashboard could not serve at all.
  log('brain unreachable — writing the fresh-boot flags directly');
  try {
    fs.writeFileSync(FORCE_FRESH_PATH,
      JSON.stringify({ requestedAt: Date.now(), via: 'brain-ctl /ctl/reset (brain was down)' }, null, 2));
    if (fs.existsSync(RESUME_MARKER_PATH)) fs.unlinkSync(RESUME_MARKER_PATH);
  } catch (err) {
    return { ok: false, action: 'reset', error: `could not arm the fresh-boot flags: ${err.message}`,
      hint: `brain-ctl needs write access to ${FORCE_FRESH_PATH} (it runs as the same user as the brain, so check ownership).`,
      status: await buildStatus() };
  }
  const started = await doStart();
  return {
    ok: true, action: 'reset', viaBrain: false, boundPort: started.boundPort,
    proxyReloaded: started.proxyReloaded,
    message: `Reset armed while the brain was down (fresh-boot flag written, resume marker cleared), then started. ${started.message}`,
    status: started.status,
  };
}

/**
 * SAVERERUN — keep every trained weight but reset the walk POINTERS so the
 * whole curriculum re-teaches on top of the existing synapses. Only the brain
 * can do this: it must take a rollback checkpoint and rewrite grade pointers
 * INSIDE the weights, which needs the loaded model. So when the brain is down
 * we honestly refuse and tell the operator to start it first, rather than
 * pretending or writing flags that would not have the intended effect.
 */
async function doSaveRerun() {
  log('SAVERERUN requested');
  const st = await buildStatus();
  if (!st.brainOnline) {
    return {
      ok: false, action: 'savererun', needsBrainUp: true,
      message: 'Savererun needs the brain RUNNING — it takes a rollback checkpoint and rewrites the grade pointers inside the loaded weights, which cannot be done from outside the process. Press Start first, then Savererun.',
      status: st,
    };
  }
  const asked = await askBrainToShutdown('/savererun');
  if (!asked.reached) {
    return { ok: false, action: 'savererun', message: `The brain did not accept the savererun request: ${asked.reason}`, status: await buildStatus() };
  }
  const gone = await waitForPortClosed(GRACEFUL_WAIT_MS);
  const bound = gone ? await waitForBrainBound() : false;
  let proxyReloaded = false;
  if (bound) { try { await runHelper('reload-nginx'); proxyReloaded = true; } catch { /* non-fatal */ } }
  return {
    ok: true, action: 'savererun', boundPort: bound, proxyReloaded,
    message: bound
      ? 'Savererun done — weights KEPT, walk pointers reset to pre-K, and the brain is back up re-teaching the curriculum on top of the trained synapses.'
      : 'Savererun armed; the brain is restarting but has not bound its port yet.',
    status: await buildStatus(),
  };
}

/**
 * UPDATE — pull the latest code and restart. `keep=true` is UPDATE & SAVESTART
 * (resume weights); `keep=false` is UPDATE & FRESH WALK (wipe, identity-core
 * preserved). Runs the SAME deploy/self-update.sh the brain would spawn, with
 * the same UAL_KEEP_STATE switch, so the outcome does not depend on who
 * launched it. Works with the brain down, which is the point: a bad deploy that
 * leaves the brain crash-looping can now be fixed by deploying the fix from the
 * dashboard instead of needing SSH.
 */
/**
 * How long this service may let `deploy/self-update.sh` run before SIGTERMing it.
 *
 * ⛔⛔ THIS MUST EXCEED `UAL_LFS_TIMEOUT`, AND IT DID NOT. The value was a
 * hardcoded 900000 (15 min) while `self-update.sh` bounds `git lfs pull` at 45m
 * by default — so on this path the parent was killed HALF AN HOUR before the
 * guard could ever fire, and a deploy could never legally finish. Two timeouts
 * in two files, in the wrong order, each looking reasonable alone.
 *
 * ⭐ Derived rather than picked, so the invariant cannot silently rot again: the
 * LFS bound plus headroom for the clone, the overlay and the restart. A number
 * chosen by hand is only correct until somebody edits the other file.
 *
 * ⚠ The brain's own /update route spawns DETACHED with no timeout at all, which
 * is why a long deploy fired from the dashboard survives and the same deploy
 * fired through here did not.
 */
function parseTimeoutToMs(spec) {
  // Accepts GNU `timeout` syntax: bare seconds, or a s/m/h/d suffix. Anything
  // unparseable returns null so the caller can fall back rather than compute a
  // confident wrong number.
  const s = String(spec == null ? '' : spec).trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([smhd]?)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = { '': 1000, s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
  return n * mult;
}

const DEPLOY_HEADROOM_MS = 20 * 60 * 1000;   // clone + overlay + restart
const DEPLOY_TIMEOUT_FLOOR_MS = 45 * 60 * 1000;

function deployTimeoutMs() {
  // `UAL_LFS_TIMEOUT=0` disables the LFS bound entirely (self-update.sh says so),
  // so there is no upper bound to derive from — fall back to the floor rather
  // than returning 0, which execFile reads as "no timeout" and would let a
  // wedged pull hold this service open forever.
  //
  // ⚠ THE '8m' HERE MIRRORS self-update.sh's OWN DEFAULT AND WILL GO STALE. It
  // already did once inside a single afternoon: it shipped as '45m' and Sponge
  // cut the script's default to 8m hours later, after measuring that a 45-minute
  // deadline is one nobody reaches — the pull starved the brain for 14 minutes
  // (163 GB read, 0 bytes written) INSIDE a correctly-working 45m guard.
  //
  // ⭐ THE FLOOR IS WHAT ACTUALLY KEEPS THIS CORRECT, NOT THE MIRROR. Whatever
  // the script's default drifts to, the cap here stays >= 45 min, which is
  // comfortably above any LFS bound anyone would sanely set. The mirror only
  // matters when the operator raises UAL_LFS_TIMEOUT above the floor, and in
  // that case the env var is set and read directly — so the literal is never
  // consulted in the case where being wrong would hurt.
  const lfs = parseTimeoutToMs(process.env.UAL_LFS_TIMEOUT || '8m');
  if (!lfs) return DEPLOY_TIMEOUT_FLOOR_MS;
  return Math.max(DEPLOY_TIMEOUT_FLOOR_MS, lfs + DEPLOY_HEADROOM_MS);
}

async function doUpdate(keep, confirmToken, skipFields) {
  const mode = keep ? 'savestart' : 'fresh-walk';
  log(`UPDATE requested (${mode})`);

  // ⚠ DESTRUCTIVE-VERB INTERLOCK (added after this cost a real brain).
  // A bare `POST /ctl/update` runs deploy/self-update.sh in FRESH-WALK mode,
  // which writes `.force-fresh` and WIPES every trained weight on the next
  // boot. During development I probed this endpoint expecting a "no deploy
  // script here" refusal; the script DID exist on the box, so the probe
  // deployed and wiped the running brain. A single unauthenticated-by-intent
  // curl must never be able to do that.
  //
  // So the wiping verbs now require an explicit typed token in the request.
  // The UI already asks the operator to confirm; this makes the API itself
  // refuse to be the accident. Non-destructive verbs (savestart) need nothing —
  // keeping the safe path frictionless is what stops people reaching for the
  // dangerous one out of habit.
  if (!keep && confirmToken !== 'WIPE') {
    return {
      ok: false, action: 'update', mode, refused: true, needsConfirm: 'WIPE',
      message: 'Refused: UPDATE + FRESH WALK destroys all trained weights. Re-send with {"confirm":"WIPE"} (the dashboard button does this for you). If you wanted the new code WITHOUT losing training, use /ctl/update-savestart instead.',
      status: await buildStatus(),
    };
  }

  // ── LOCAL MODE — the local equivalent of self-update.sh ───────────────────
  // The box overlays a git archive and restarts the unit. Locally the repo IS
  // the source, so "update" means: pull, then relaunch through the launcher
  // the operator actually uses. The WIPE interlock above still applies — local
  // is not a reason to make the destructive verb easier.
  if (LOCAL_MODE) {
    // ⛔ NEVER OVERWRITE THE OPERATOR'S WORK. Checked BEFORE pulling, and a
    // dirty tree SKIPS the pull rather than trusting git to refuse. The
    // restart still happens, because that is what was asked for — the pull is
    // the optional half. `.claude/` is gitignored and so is invisible to a
    // pull either way; this guard covers everything else.
    const dirt = await localTreeDirty();
    let pulled = null;
    if (dirt.dirty) {
      log(`LOCAL UPDATE — skipping git pull: ${dirt.reason}`);
    } else {
      pulled = await localGitPull();
      log(`LOCAL UPDATE — git pull ${pulled.ok ? 'ok' : 'FAILED'}: ${(pulled.out || pulled.err || '').split('\n')[0]}`);
    }
    // Stop first if it is up, so the launcher does not race a bound port.
    const stBefore = await buildStatus();
    if (stBefore.brainOnline) {
      await askBrainToShutdown('/shutdown').catch(() => {});
      await waitForPortClosed(Math.max(GRACEFUL_WAIT_MS, 120000));
    }
    // keep = Savestart (weights kept); fresh = start (state wiped at boot).
    const script = keep ? LAUNCHERS.save : LAUNCHERS.fresh;
    let launched;
    try { launched = await spawnLauncher(script); }
    catch (e) {
      return { ok: false, action: 'update', mode, local: true,
        message: `Could not launch ${path.basename(script)}: ${e.message}`,
        gitSkipped: dirt.dirty, status: await buildStatus() };
    }
    const bound = await waitForBrainBound();
    return {
      ok: true, action: 'update', mode, local: true,
      launcher: path.basename(script),
      gitSkipped: dirt.dirty || undefined,
      gitSkipReason: dirt.dirty ? dirt.reason : undefined,
      gitPulled: pulled ? pulled.ok : false,
      gitMessage: pulled ? (pulled.out || pulled.err).split('\n')[0] : 'skipped — uncommitted changes present',
      message: `LOCAL ${mode}: ${dirt.dirty ? 'git pull SKIPPED (' + dirt.reason + ')' : (pulled && pulled.ok ? 'git pull ok' : 'git pull failed, continued')}`
        + `, relaunched via ${path.basename(script)}${bound ? ' — brain is bound' : ' — brain not bound yet, watch the launcher window'}.`
        + (launched && launched.stdout ? '' : ''),
      status: await buildStatus(),
    };
  }

  if (!fs.existsSync(SELF_UPDATE_SH)) {
    return { ok: false, action: 'update', mode,
      message: `Update needs the deploy script, which is not on this box: ${SELF_UPDATE_SH}. Local dev has no self-update path — use start.bat / Savestart.bat.`,
      status: await buildStatus() };
  }

  const st = await buildStatus();
  if (st.brainOnline) {
    // Let the brain drive it — it streams the script's output into its own
    // console, which the operator is already watching.
    // Forward `fields=0` down the delegated path too, or the same press would
    // mean two different things depending on whether the brain happened to be
    // answering — the exact class of surprise this service exists to remove.
    const _q = [keep ? 'keep=1' : null, skipFields ? 'fields=0' : null].filter(Boolean).join('&');
    const asked = await askBrainToShutdown('/update' + (_q ? '?' + _q : ''));
    if (asked.reached && asked.status === 200) {
      const gone = await waitForPortClosed(Math.max(GRACEFUL_WAIT_MS, 120000));
      const bound = gone ? await waitForBrainBound() : await waitForBrainBound();
      let proxyReloaded = false;
      if (bound) { try { await runHelper('reload-nginx'); proxyReloaded = true; } catch { /* non-fatal */ } }
      return {
        ok: true, action: 'update', mode, viaBrain: true, boundPort: bound, proxyReloaded,
        message: bound
          ? `Update (${mode}) complete — latest code deployed and the brain is serving again${keep ? ', resuming saved training' : ' on a fresh walk'}.`
          : `Update (${mode}) was armed and the code overlay is running; the brain has not bound its port yet (overlay + restart takes 1-2 min).`,
        status: await buildStatus(),
      };
    }
    log('brain accepted nothing — falling back to running the deploy script directly');
  }

  // Brain down (or unresponsive): run the deploy script ourselves. It performs
  // its own `systemctl restart` at the end, so we do not start the brain here —
  // doing both would race the overlay against a boot.
  return await new Promise((resolve) => {
    const env = { ...process.env };
    if (keep) env.UAL_KEEP_STATE = '1';
    else delete env.UAL_KEEP_STATE;
    // ⛔ THE WAVELET FIELDS ARE WANTED, AND FETCHING THEM IS THE DEFAULT.
    // `fields=0` is an emergency hatch for a pull that has wedged (see the
    // brain's /update route for the incident it was built from), never the
    // normal path. Absent = fetch them, so no existing caller changes.
    if (skipFields) env.UAL_FIELDS = '0';
    execFile('bash', [SELF_UPDATE_SH], { timeout: deployTimeoutMs(), maxBuffer: 8 * 1024 * 1024, env },
      async (err, stdout, stderr) => {
        const tail = (s) => String(s || '').split('\n').filter(Boolean).slice(-12).join('\n');
        if (err) {
          return resolve({ ok: false, action: 'update', mode, viaBrain: false,
            message: `The deploy script failed: ${err.message}`,
            output: tail(stdout) + '\n' + tail(stderr), status: await buildStatus() });
        }
        const bound = await waitForBrainBound();
        let proxyReloaded = false;
        if (bound) { try { await runHelper('reload-nginx'); proxyReloaded = true; } catch { /* non-fatal */ } }
        resolve({ ok: true, action: 'update', mode, viaBrain: false, boundPort: bound, proxyReloaded,
          message: bound
            ? `Update (${mode}) complete while the brain was down — latest code deployed and the brain is serving again.`
            : `Update (${mode}) ran, but the brain has not bound its port yet. Check the logs.`,
          output: tail(stdout), status: await buildStatus() });
      });
  });
}

// ── HTTP ───────────────────────────────────────────────────────────────────

/**
 * Read a small JSON body, if any. Bounded (16 KB) because this endpoint takes
 * only tiny confirmation tokens and should never buffer an arbitrary upload.
 */
function readJsonBody(req) {
  return new Promise((resolve) => {
    if (req.method !== 'POST') return resolve({});
    let raw = '';
    let tooBig = false;
    req.on('data', (d) => {
      raw += d;
      if (raw.length > 16384) { tooBig = true; raw = ''; req.destroy(); }
    });
    req.on('end', () => {
      if (tooBig || !raw) return resolve({});
      try { resolve(JSON.parse(raw) || {}); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// One power action at a time. Two overlapping start/stop cycles against a
// 5.4GB-loading process is how you get a corrupted checkpoint.
let inFlight = null;

async function serialise(name, fn) {
  if (inFlight) {
    return { ok: false, busy: true, message: `Another power action (${inFlight}) is already running. Wait for it to finish.` };
  }
  inFlight = name;
  try { return await fn(); }
  finally { inFlight = null; }
}

const server = http.createServer(async (req, res) => {
  // Strip the /ctl prefix so the service works both behind nginx's /ctl/ lane
  // and when hit directly on loopback during debugging.
  const url = (req.url || '/').split('?')[0].replace(/^\/ctl(?=\/|$)/, '') || '/';
  const method = req.method || 'GET';

  // ── CROSS-ORIGIN — the reason every local button was dead ───────────────
  //
  // On the box, nginx proxies `/ctl/` on the SAME ORIGIN as the dashboard, so
  // the browser never does a cross-origin check and none of this is needed.
  // Locally the dashboard is served from :7525 and must call :7526 — and a
  // DIFFERENT PORT IS A DIFFERENT ORIGIN. With no CORS headers the browser
  // blocked every request, `available` never flipped, the panel never
  // appeared, and the legacy row stayed. ⚠ `curl` does not enforce CORS, so
  // every command-line probe of this service passed while the browser saw
  // nothing — which is exactly how this survived several rounds of fixes.
  //
  // ⛔ NEVER `Access-Control-Allow-Origin: *`. This service starts, stops and
  // WIPES a brain. A wildcard would let any page the operator happens to have
  // open POST to it. The allowlist is loopback origins only — the same trust
  // boundary the socket already has (it binds 127.0.0.1), expressed to the
  // browser rather than assumed.
  const origin = req.headers && req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // No Allow-Credentials: the dashboard sends `credentials: 'same-origin'`,
    // so cross-origin requests carry none and asking for them would widen the
    // surface for nothing.
  }
  // Preflight. A POST with a JSON body is not a "simple request", so the
  // browser sends OPTIONS first and never issues the POST if it 404s.
  if (method === 'OPTIONS') {
    res.writeHead(origin ? 204 : 405);
    return res.end();
  }

  try {
    if (method === 'GET' && (url === '/health' || url === '/')) {
      return sendJson(res, 200, { ok: true, service: 'brain-ctl', version: 1, uptimeSec: Math.round(process.uptime()) });
    }
    if (method === 'GET' && url === '/status') {
      return sendJson(res, 200, await buildStatus());
    }
    if (method === 'GET' && url === '/logs') {
      const n = Math.min(500, Math.max(10, parseInt((req.url.split('?')[1] || '').match(/n=(\d+)/)?.[1] || '80', 10)));
      // ⚠ `journal()` returns a VERDICT OBJECT, not a string — it has to, because
      // "here are the logs" and "I was refused permission to read them" are
      // different answers and this route used to give both the same shape.
      const j = await journal(n);
      return sendJson(res, 200, { ok: j.ok, unit: UNIT, lines: n, log: j.log, ...(j.ok ? {} : { error: j.error, detail: j.detail, human: j.human }) });
    }
    if (method === 'POST') {
      // Confirmation token for the destructive verbs. Accepted in a JSON body
      // ({"confirm":"WIPE"}) or as ?confirm=WIPE so an operator with a shell can
      // still drive it deliberately.
      const body = await readJsonBody(req);
      const qs = (req.url.split('?')[1] || '');
      const confirm = body.confirm || (qs.match(/(?:^|&)confirm=([^&]*)/)?.[1] || '');
      // `fields=0` — the emergency hatch, same two spellings as `confirm` so a
      // shell and the dashboard drive it identically. ⛔ OPT-IN ONLY: absent
      // means FETCH the wavelet fields, which is what every normal press wants.
      const skipFields = String(body.fields ?? (qs.match(/(?:^|&)fields=([^&]*)/)?.[1] ?? '')) === '0';

      const table = {
        '/start': doStart, '/stop': doStop, '/restart': doRestart, '/kick': doKick,
        // "Everything else inbetween that we support doing" — these restart the
        // brain too, and used to be reachable ONLY through the brain itself.
        '/reset': () => doReset(confirm),
        '/savererun': doSaveRerun,
        '/update': () => doUpdate(false, confirm, skipFields),   // UPDATE & FRESH WALK (wipes)
        '/update-savestart': () => doUpdate(true, '', skipFields), // UPDATE & SAVESTART (keeps)
      };
      const fn = table[url];
      if (fn) {
        const who = req.headers['x-ual-user'] || 'unknown';
        log(`${url} by user=${who} remote=${req.socket.remoteAddress}`);
        const out = await serialise(url.slice(1), fn);
        return sendJson(res, out.ok === false && out.busy ? 409 : 200, out);
      }
    }
    return sendJson(res, 404, { ok: false, error: 'no such control endpoint', url });
  } catch (err) {
    log('handler error:', err && err.stack || err);
    return sendJson(res, 500, {
      ok: false,
      error: String(err && err.message || err),
      // Surfaced because the overwhelmingly likely cause is the sudoers rule
      // not being installed, and that is invisible otherwise.
      hint: 'If this says "sudo: a password is required", the brain-ctl sudoers rule is missing. See deploy/README.md.',
      stderr: err && err.stderr ? String(err.stderr).slice(0, 500) : undefined,
    });
  }
});

// ⛔ ALREADY-RUNNING IS NOT AN ERROR. The launchers start this service on every
// run, and the whole point of it is to OUTLIVE the brain — so on the second
// launch the port is legitimately taken by the still-good instance from the
// first. Exit 0 quietly instead of crash-looping a red error into the log.
// Handled here, once, rather than adding a port check to four launcher scripts
// that would then have to stay in sync.
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    log(`port ${PORT} already in use — another brain-ctl is already running, which is correct. Exiting quietly.`);
    process.exit(0);
  }
  log(`FATAL listen error: ${err && err.message}`);
  process.exit(1);
});

server.listen(PORT, BIND, () => {
  log(`listening on http://${BIND}:${PORT} — controlling unit "${UNIT}", watching brain port ${BRAIN_PORT}`);
  log('this service stays up when the brain is down; that is its entire purpose');
  if (LOCAL_MODE) {
    log(`LOCAL MODE — no systemd on this host. Power verbs run ${IS_WIN ? 'windows\\*.bat' : 'linux/*.sh'} launchers from ${LAUNCH_DIR}; logs tail server/server.log.`);
  }
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log(`${sig} — shutting down control plane`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  });
}

// A control plane that dies on an unhandled error is worse than useless: it
// looks alive to systemd's Restart, but the operator sees a hang. Log loudly
// and keep serving — every handler already has its own try/catch.
process.on('uncaughtException', (err) => log('UNCAUGHT (staying up):', err && err.stack || err));
process.on('unhandledRejection', (err) => log('UNHANDLED REJECTION (staying up):', err && err.stack || err));
