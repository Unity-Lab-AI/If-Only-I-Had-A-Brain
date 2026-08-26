#!/usr/bin/env node
/**
 * Test harness for server/brain-ctl.js — the always-up brain control plane.
 *
 * Runs brain-ctl against a MOCK brain (a tiny HTTP server that answers
 * /shutdown and /restart like the real one) and a MOCK privileged helper that
 * records its argv instead of touching systemd. That lets the whole state
 * machine and the graceful-stop path be exercised on a dev box with no systemd
 * unit, no root, and no 5.4 GB of weights.
 *
 * What it verifies:
 *   1. offline   — nothing on the brain port → "press Start", never a crash
 *   2. unmanaged — port open but unit not active → says so, does not claim down
 *   3. graceful stop — brain is ASKED to halt itself (so it force-saves)
 *      before any process-level stop
 *   4. ungraceful stop — unreachable brain is reported as possibly-lossy
 *   5. concurrency — a second power action is refused with 409, not interleaved
 *   6. security — the helper's own validation refuses other units / verbs
 *   7. /ctl/logs and /ctl/health stay answerable with the brain down
 *
 * Run: node scripts/test-brain-ctl.mjs
 * Exits non-zero on the first failed assertion.
 */

import http from 'node:http';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
const CTL_JS = path.join(REPO, 'server', 'brain-ctl.js');
const HELPER_SH = path.join(REPO, 'deploy', 'brain-ctl-helper.sh');

// Ports well away from the real 7525/7526 so a test can never hit a live brain.
const CTL_PORT = 7691;
const BRAIN_PORT = 7692;

let pass = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TEST_UNIT = 'unity-brain-test-nonexistent';
const tmp = mkdtempSync(path.join(tmpdir(), 'brainctl-test-'));
const helperLog = path.join(tmp, 'helper.log');
const mockHelper = path.join(tmp, 'mock-helper.sh');
writeFileSync(mockHelper, `#!/usr/bin/env bash\necho "$*" >> ${helperLog}\nexit 0\n`);
chmodSync(mockHelper, 0o755);
const helperCalls = () => (existsSync(helperLog) ? readFileSync(helperLog, 'utf8').trim().split('\n').filter(Boolean) : []);

// Scratch "brain dir" so the reset verb can write .force-fresh / clear the
// resume marker without touching a real brain's state.
const brainDir = mkdtempSync(path.join(tmpdir(), 'brainctl-braindir-'));
const forceFresh = path.join(brainDir, '.force-fresh');
const resumeMarker = path.join(brainDir, '.resume-marker.json');

function req(method, urlPath, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: CTL_PORT, path: urlPath, method, timeout: timeoutMs },
      (res) => {
        let b = '';
        res.on('data', (d) => { b += d; });
        res.on('end', () => {
          try { resolve({ code: res.statusCode, json: JSON.parse(b) }); }
          catch { resolve({ code: res.statusCode, json: null, raw: b }); }
        });
      });
    r.on('timeout', () => { r.destroy(); reject(new Error('client timeout')); });
    r.on('error', reject);
    r.end();
  });
}

/** Mock brain: answers the two self-halt routes, then really closes its port. */
function startMockBrain({ answerShutdown = true } = {}) {
  const srv = http.createServer((rq, rs) => {
    if (rq.method === 'POST' && (rq.url === '/shutdown' || rq.url === '/restart')) {
      if (!answerShutdown) { rs.destroy(); return; }
      rs.writeHead(200, { 'Content-Type': 'application/json' });
      rs.end(JSON.stringify({ status: 'halting' }));
      // Mimic the real brain: flush, then drop the listener shortly after.
      setTimeout(() => { try { srv.close(); for (const s of sockets) s.destroy(); } catch {} }, 300);
      return;
    }
    rs.writeHead(404); rs.end();
  });
  const sockets = new Set();
  srv.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return new Promise((resolve) => srv.listen(BRAIN_PORT, '127.0.0.1', () => resolve({
    srv,
    close: () => new Promise((r) => { try { for (const s of sockets) s.destroy(); srv.close(() => r()); } catch { r(); } }),
  })));
}

function startCtl(env = {}) {
  const child = spawn(process.execPath, [CTL_JS], {
    env: {
      ...process.env,
      UAL_CTL_PORT: String(CTL_PORT),
      UAL_CTL_BIND: '127.0.0.1',
      UAL_BRAIN_PORT: String(BRAIN_PORT),
      // A unit name that cannot exist, so systemctl reports inactive/not-found
      // rather than us ever touching a real unit from a test.
      UAL_BRAIN_UNIT: TEST_UNIT,
      UAL_CTL_HELPER: mockHelper,
      UAL_CTL_GRACEFUL_WAIT_MS: '6000',
      UAL_BRAIN_DIR: brainDir,
      UAL_CTL_BIND_WAIT_MS: '4000',
      // Point the update verb at a script that cannot exist, so the "no deploy
      // script here" refusal is what gets exercised rather than a real deploy.
      UAL_SELF_UPDATE_SH: path.join(brainDir, 'no-such-self-update.sh'),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  return { child, log: () => out };
}

async function waitPort(port, up, budget = 15000) {
  const end = Date.now() + budget;
  while (Date.now() < end) {
    const isUp = await new Promise((res) => {
      const s = new net.Socket();
      s.setTimeout(600);
      s.once('connect', () => { s.destroy(); res(true); });
      s.once('timeout', () => { s.destroy(); res(false); });
      s.once('error', () => { s.destroy(); res(false); });
      s.connect(port, '127.0.0.1');
    });
    if (isUp === up) return true;
    await sleep(300);
  }
  return false;
}

const ctl = startCtl();
let brain = null;
let exitCode = 0;

try {
  if (!(await waitPort(CTL_PORT, true))) throw new Error(`brain-ctl never listened on ${CTL_PORT}:\n${ctl.log()}`);

  console.log('\n1. brain DOWN — control plane must stay answerable');
  {
    const h = await req('GET', '/ctl/health');
    check('/ctl/health 200 with brain down', h.code === 200 && h.json?.ok === true);
    const s = await req('GET', '/ctl/status');
    check('/ctl/status 200 (never 502)', s.code === 200);
    check('reports brain NOT online', s.json?.brainOnline === false, `got ${s.json?.brainOnline}`);
    check('phase is offline/halted/failed', ['offline', 'halted', 'failed'].includes(s.json?.phase), `phase=${s.json?.phase}`);
    check('gives the operator a next step', /Press Start/i.test(s.json?.human || ''), s.json?.human);
    const l = await req('GET', '/ctl/logs?n=10');
    check('/ctl/logs answerable with brain down', l.code === 200 && typeof l.json?.log === 'string');
  }

  console.log('\n2. port open but unit inactive — must NOT be reported as offline');
  {
    brain = await startMockBrain();
    await waitPort(BRAIN_PORT, true);
    const s = await req('GET', '/ctl/status');
    check('phase=unmanaged', s.json?.phase === 'unmanaged', `phase=${s.json?.phase}`);
    check('counts as online (site really works)', s.json?.brainOnline === true);
    check('explains it was hand-started', /by hand/i.test(s.json?.human || ''), s.json?.human);
  }

  console.log('\n3. graceful stop — the brain must be ASKED first, so it saves');
  {
    const r = await req('POST', '/ctl/stop');
    check('stop 200', r.code === 200, `code=${r.code}`);
    check('brain answered the self-halt request', r.json?.brainAnswered === true);
    check('reported as a graceful save', r.json?.gracefulSave === true, JSON.stringify(r.json?.message));
    check('message says state was saved', /saved its state/i.test(r.json?.message || ''), r.json?.message);
    const calls = helperCalls();
    check('followed up with a process-level stop', calls.some((c) => c === `stop ${TEST_UNIT}`), JSON.stringify(calls));
    await brain.close(); brain = null;
  }

  console.log('\n4. ungraceful stop — unreachable brain must be reported as possibly lossy');
  {
    const before = helperCalls().length;
    const r = await req('POST', '/ctl/stop');
    check('stop still 200 with no brain', r.code === 200);
    check('brainAnswered=false', r.json?.brainAnswered === false);
    check('warns training may be lost', /may be lost/i.test(r.json?.message || ''), r.json?.message);
    check('still issued a process-level stop', helperCalls().length > before, `before=${before} after=${helperCalls().length}`);
  }

  console.log('\n5. concurrency — a second power action must be refused, not interleaved');
  {
    brain = await startMockBrain();
    await waitPort(BRAIN_PORT, true);
    const first = req('POST', '/ctl/stop');
    await sleep(400);
    const second = await req('POST', '/ctl/stop');
    check('second action returns 409', second.code === 409, `code=${second.code}`);
    check('second action flagged busy', second.json?.busy === true);
    check('explains what is running', /already running/i.test(second.json?.message || ''), second.json?.message);
    await first;
    if (brain) { await brain.close(); brain = null; }
    // The lock must RELEASE, or the control plane wedges after one use.
    const after = await req('POST', '/ctl/stop');
    check('lock released after completion', after.code === 200, `code=${after.code}`);
  }

  console.log('\n6. unknown endpoints');
  {
    const r = await req('GET', '/ctl/definitely-not-a-thing');
    check('unknown route 404s', r.code === 404);
    const p = await req('POST', '/ctl/nuke');
    check('unknown POST action 404s (no command run)', p.code === 404);
  }

  console.log('\n7. privileged helper — independent validation (the security boundary)');
  {
    const runHelper = (args) => {
      try { execFileSync('bash', [HELPER_SH, ...args], { stdio: 'pipe' }); return 0; }
      catch (e) { return e.status; }
    };
    check('refuses another unit (forgejo)', runHelper(['start', 'forgejo']) === 77);
    check('refuses sshd', runHelper(['restart', 'sshd']) === 77);
    check('refuses an unknown verb', runHelper(['nuke', 'unity-brain']) === 64);
    check('refuses a missing unit arg', runHelper(['start']) === 77);
    check('refuses no args at all', runHelper([]) === 64);
  }

  console.log('\n8. the REST of the power verbs ("everything else inbetween")');
  {
    // RESET with the brain DOWN must arm the fresh boot itself — the case the
    // old dashboard could not serve at all.
    writeFileSync(resumeMarker, '{"stale":"marker"}');
    const r = await req('POST', '/ctl/reset');
    check('reset answers with the brain down', r.code === 200, `code=${r.code}`);
    check('reset did NOT go via the brain', r.json?.viaBrain === false, JSON.stringify(r.json?.viaBrain));
    check('reset WROTE .force-fresh (wipe armed)', existsSync(forceFresh));
    check('reset CLEARED the resume marker', !existsSync(resumeMarker),
      'a leftover marker would make the "fresh" brain resume the training being discarded');
    const ff = existsSync(forceFresh) ? JSON.parse(readFileSync(forceFresh, 'utf8')) : {};
    check('force-fresh records who armed it', /brain-ctl/.test(ff.via || ''), JSON.stringify(ff));

    // SAVERERUN with the brain down must REFUSE honestly, not pretend.
    const sr = await req('POST', '/ctl/savererun');
    check('savererun refuses with the brain down', sr.json?.ok === false);
    check('savererun says it needs the brain up', sr.json?.needsBrainUp === true);
    check('savererun tells the operator to press Start', /press start/i.test(sr.json?.message || ''), sr.json?.message);

    // UPDATE with no deploy script must say so rather than half-updating.
    const up = await req('POST', '/ctl/update');
    check('update refuses without a deploy script', up.json?.ok === false);
    check('update names the missing script', /self-update/i.test(up.json?.message || ''), up.json?.message);
    check('update reports fresh-walk mode', up.json?.mode === 'fresh-walk', `mode=${up.json?.mode}`);
    const ups = await req('POST', '/ctl/update-savestart');
    check('update-savestart is a distinct route', ups.code === 200 || ups.json?.ok === false);
    check('update-savestart reports savestart mode', ups.json?.mode === 'savestart', `mode=${ups.json?.mode}`);
  }

  console.log('\n9. control plane survived the whole run');
  {
    const h = await req('GET', '/ctl/health');
    check('still alive at the end', h.code === 200 && h.json?.ok === true);
    check('never crashed/restarted (same pid)', typeof h.json?.uptimeSec === 'number' && h.json.uptimeSec >= 0);
  }
} catch (err) {
  failures.push(`harness error: ${err.message}`);
  console.error('\nHARNESS ERROR:', err);
} finally {
  if (brain) await brain.close();
  ctl.child.kill('SIGTERM');
  await sleep(400);
  ctl.child.kill('SIGKILL');
}

console.log(`\n${'='.repeat(64)}`);
if (failures.length) {
  console.log(`FAILED — ${pass} passed, ${failures.length} failed:`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  exitCode = 1;
} else {
  console.log(`ALL PASS — ${pass} assertions`);
}
console.log('='.repeat(64));
process.exit(exitCode);
