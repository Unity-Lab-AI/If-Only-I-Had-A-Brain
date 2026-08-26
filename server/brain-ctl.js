#!/usr/bin/env node
/**
 * brain-ctl — the ALWAYS-UP control plane for the Unity brain.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Every power control used to live INSIDE brain-server.js (`/shutdown`,
 * `/restart`, `/savererun`, `/update`). That is a control plane hosted by the
 * very thing it controls, so it has one unavoidable dead zone: once the brain
 * is stopped, there is nothing left listening to start it again. On 2026-08-25
 * Gee pressed "Stop Brain", the brain exited 42 (a deliberate halt systemd is
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
 */

'use strict';

const http = require('http');
const { execFile } = require('child_process');
const net = require('net');
const path = require('path');

const PORT = parseInt(process.env.UAL_CTL_PORT || '7526', 10);
const BIND = process.env.UAL_CTL_BIND || '127.0.0.1';
const BRAIN_PORT = parseInt(process.env.UAL_BRAIN_PORT || '7525', 10);
const BRAIN_HOST = process.env.UAL_BRAIN_HOST || '127.0.0.1';
const UNIT = process.env.UAL_BRAIN_UNIT || 'unity-brain';
const HELPER = process.env.UAL_CTL_HELPER
  || path.join(__dirname, '..', 'deploy', 'brain-ctl-helper.sh');

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

function journal(lines = 60) {
  return new Promise((resolve) => {
    execFile('journalctl', ['-u', UNIT, '-n', String(lines), '--no-pager', '-o', 'short-iso'],
      { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        resolve(err ? `(journal unavailable: ${err.message})` : String(stdout || ''));
      });
  });
}

async function buildStatus() {
  const [show, portUp] = await Promise.all([systemctlShow(UNIT), probeBrainPort()]);
  const activeState = show.ActiveState || 'unknown';
  const active = activeState === 'active';
  const exitStatus = show.ExecMainStatus ? parseInt(show.ExecMainStatus, 10) : null;

  // Distinguish the states that need DIFFERENT operator actions. The old
  // dashboard collapsed all of these into one "unreachable" banner, which is
  // why a deliberate halt looked identical to a crashed boot.
  let phase;
  let human;
  if (active && portUp) {
    phase = 'online';
    human = 'Brain is online and serving.';
  } else if (active && !portUp) {
    phase = 'booting';
    human = 'Brain process is running but has not bound its port yet — it loads ~5.4 GB of weights before listening. This is normal for the first minute or two after a start.';
  } else if (!active && portUp) {
    // Serving, but not via the unit we manage — typically a hand-started
    // `node server/brain-server.js` (local dev, or an admin debugging on the
    // box). Reporting this as "offline" would be a lie the site would visibly
    // contradict, and offering Start would fail on an already-bound port. Say
    // exactly what is true instead.
    phase = 'unmanaged';
    human = `Something is serving on port ${BRAIN_PORT}, but systemd unit "${UNIT}" is ${activeState} — so the brain was most likely started by hand rather than by systemd. Power controls here drive the unit and will not affect a hand-started process; stop it the way it was started.`;
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
    brainOnline: phase === 'online' || phase === 'unmanaged',
    phase,
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

// ── HTTP ───────────────────────────────────────────────────────────────────

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

  try {
    if (method === 'GET' && (url === '/health' || url === '/')) {
      return sendJson(res, 200, { ok: true, service: 'brain-ctl', version: 1, uptimeSec: Math.round(process.uptime()) });
    }
    if (method === 'GET' && url === '/status') {
      return sendJson(res, 200, await buildStatus());
    }
    if (method === 'GET' && url === '/logs') {
      const n = Math.min(500, Math.max(10, parseInt((req.url.split('?')[1] || '').match(/n=(\d+)/)?.[1] || '80', 10)));
      return sendJson(res, 200, { ok: true, unit: UNIT, lines: n, log: await journal(n) });
    }
    if (method === 'POST') {
      const table = { '/start': doStart, '/stop': doStop, '/restart': doRestart, '/kick': doKick };
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

server.listen(PORT, BIND, () => {
  log(`listening on http://${BIND}:${PORT} — controlling unit "${UNIT}", watching brain port ${BRAIN_PORT}`);
  log('this service stays up when the brain is down; that is its entire purpose');
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
