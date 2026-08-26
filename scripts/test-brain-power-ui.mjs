#!/usr/bin/env node
/**
 * End-to-end browser test for the brain power panel (CTLPLANE.1).
 *
 * Serves html/dashboard.html over a local HTTP server together with a REAL
 * brain-ctl process and a mock brain, then drives the page with Playwright to
 * prove the thing that actually matters:
 *
 *   THE START BUTTON WORKS WHEN THE BRAIN IS DOWN.
 *
 * The unit test (test-brain-ctl.mjs) proves the control plane's HTTP contract.
 * This proves the operator-facing path: page renders "Brain offline", Start is
 * enabled, clicking it issues a real POST, and the panel reflects the result.
 * Without this, "Gee can recover the brain himself" would be an inference from
 * two separately-passing halves rather than an observed behaviour.
 *
 * Run: node scripts/test-brain-power-ui.mjs
 * Skips (exit 0) if Playwright is unavailable, so it never breaks a machine
 * that has not installed browsers.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
// ── Why the page and the control plane share ONE port ──────────────────────
// dashboard.html's ctlUrl() treats a page served from localhost/127.0.0.1 as
// LOCAL DEV and targets brain-ctl DIRECTLY on :7526, rather than nginx's
// same-origin /ctl/ lane (which is what the deployed box uses). This harness
// must serve from 127.0.0.1, so it serves the page on 7526 too and proxies
// /ctl/* through to the real brain-ctl process behind it. That way the test
// exercises the page's genuine local-dev code path with no page edits.
const PAGE_PORT = 7526;      // must be 7526: see above
const CTL_PORT = 7694;       // real brain-ctl, behind the page server's proxy
const BRAIN_PORT = 7695;

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('SKIP — playwright not installed (npm i -D playwright). The control-plane contract is still covered by scripts/test-brain-ctl.mjs.'); process.exit(0); }

const pass = [];
const fail = [];
const check = (n, c, d = '') => { (c ? pass : fail).push(n + (c ? '' : ` — ${d}`)); console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : ` — ${d}`}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── mock privileged helper: records argv, never touches systemd ─────────────
const tmp = mkdtempSync(path.join(tmpdir(), 'bp-ui-'));
const helperLog = path.join(tmp, 'calls.log');
const helper = path.join(tmp, 'helper.sh');
// Scratch brain dir so the Reset button can arm its flags without touching real state.
const brainDir = mkdtempSync(path.join(tmpdir(), 'bp-ui-braindir-'));
writeFileSync(helper, `#!/usr/bin/env bash\necho "$*" >> ${helperLog}\nexit 0\n`);
chmodSync(helper, 0o755);

// ── page server: dashboard.html + a /ctl/ proxy to brain-ctl ───────────────
// The proxy makes the page same-origin with the control plane, mirroring how
// nginx exposes /ctl/ on the box (and avoiding CORS in the test).
const pageServer = http.createServer((rq, rs) => {
  if (rq.url.startsWith('/ctl/')) {
    const p = http.request({ host: '127.0.0.1', port: CTL_PORT, path: rq.url, method: rq.method,
      headers: { ...rq.headers, host: `127.0.0.1:${CTL_PORT}` } }, (pr) => {
      rs.writeHead(pr.statusCode, pr.headers); pr.pipe(rs);
    });
    p.on('error', () => { rs.writeHead(502, { 'Content-Type': 'application/json' }); rs.end('{"ok":false}'); });
    rq.pipe(p);
    return;
  }
  if (rq.url === '/' || rq.url.startsWith('/dashboard')) {
    const f = path.join(REPO, 'html', 'dashboard.html');
    if (!existsSync(f)) { rs.writeHead(404); rs.end('no dashboard'); return; }
    rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    rs.end(readFileSync(f));
    return;
  }
  // Everything else (bundles, fonts, the brain's own WS) 404s harmlessly — the
  // power panel must not depend on any of it.
  rs.writeHead(404); rs.end('');
});

function startMockBrain() {
  const sockets = new Set();
  const srv = http.createServer((rq, rs) => {
    if (rq.method === 'POST' && (rq.url === '/shutdown' || rq.url === '/restart')) {
      rs.writeHead(200, { 'Content-Type': 'application/json' });
      rs.end('{"status":"halting"}');
      setTimeout(() => { try { srv.close(); for (const s of sockets) s.destroy(); } catch {} }, 200);
      return;
    }
    rs.writeHead(404); rs.end();
  });
  srv.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return new Promise((res) => srv.listen(BRAIN_PORT, '127.0.0.1', () => res({
    close: () => new Promise((r) => { try { for (const s of sockets) s.destroy(); srv.close(() => r()); } catch { r(); } }),
  })));
}

const ctl = spawn(process.execPath, [path.join(REPO, 'server', 'brain-ctl.js')], {
  env: { ...process.env,
    UAL_CTL_PORT: String(CTL_PORT), UAL_BRAIN_PORT: String(BRAIN_PORT),
    UAL_BRAIN_UNIT: 'unity-brain-uitest-nonexistent', UAL_CTL_HELPER: helper,
    UAL_CTL_GRACEFUL_WAIT_MS: '4000',
    // A real start waits up to 5 minutes for the brain to load ~5.4 GB of
    // weights and bind its port. That is correct in production and far too slow
    // for a test, so shorten just the bind wait.
    UAL_CTL_BIND_WAIT_MS: '8000',
    UAL_BRAIN_DIR: brainDir,
    UAL_SELF_UPDATE_SH: path.join(brainDir, 'no-such-self-update.sh') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let ctlOut = '';
ctl.stdout.on('data', d => { ctlOut += d; });
ctl.stderr.on('data', d => { ctlOut += d; });

let browser, mockBrain = null;
try {
  await new Promise((r) => pageServer.listen(PAGE_PORT, '127.0.0.1', r));
  await sleep(1200);

  browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${PAGE_PORT}/dashboard.html`, { waitUntil: 'domcontentloaded' });

  console.log('\n1. brain DOWN — the panel must appear and say so');
  await page.waitForSelector('#brain-power.active', { timeout: 20000 });
  check('power panel is visible', await page.isVisible('#brain-power'));
  const title1 = (await page.textContent('#bp-title')).trim();
  check('title reports offline/halted', /offline|halted|failed/i.test(title1), `title="${title1}"`);
  check('panel carries a down state class',
    /state-(offline|halted|failed)/.test(await page.getAttribute('#brain-power', 'class')),
    await page.getAttribute('#brain-power', 'class'));
  const human1 = (await page.textContent('#bp-human')).trim();
  check('explains what to do', /press start/i.test(human1), `human="${human1}"`);

  console.log('\n2. THE POINT: Start must be ENABLED with the brain down');
  check('▶ Start Brain is enabled', await page.isEnabled('#bp-start'));
  check('⏹ Stop is disabled (nothing to stop)', await page.isDisabled('#bp-stop'));

  console.log('\n3. clicking Start issues a real control-plane POST');
  const startPost = page.waitForRequest((r) => r.url().includes('/ctl/start') && r.method() === 'POST', { timeout: 15000 });
  await page.click('#bp-start');
  await startPost;
  check('POST /ctl/start was issued from the page', true);
  // brain-ctl calls the (mock) helper with `start <unit>`; the mock brain never
  // binds, so ctl reports "started but not bound" — which is honest, and is the
  // path we want rendered rather than a false success.
  await page.waitForFunction(() => {
    const t = document.getElementById('bp-result');
    return t && /✓|✗|⚠/.test(t.textContent);
  }, { timeout: 45000 });
  const res3 = (await page.textContent('#bp-result')).trim();
  check('a result is shown to the operator', res3.length > 0, `result="${res3.slice(0, 120)}"`);
  const calls = existsSync(helperLog) ? readFileSync(helperLog, 'utf8') : '';
  check('control plane really invoked the privileged helper', /^start unity-brain-uitest-nonexistent/m.test(calls), JSON.stringify(calls));

  console.log('\n4. brain UP — panel must flip to a serving state');
  mockBrain = await startMockBrain();
  await page.click('#bp-refresh');
  await page.waitForFunction(() => {
    const c = document.getElementById('brain-power');
    return c && /state-(online|unmanaged)/.test(c.className);
  }, { timeout: 20000 });
  const title4 = (await page.textContent('#bp-title')).trim();
  check('title reports the brain is running', /online|unmanaged/i.test(title4), `title="${title4}"`);
  check('Start is now disabled (already running)', await page.isDisabled('#bp-start'));
  check('Force Restart is available for a wedged brain', await page.isEnabled('#bp-kick'));

  console.log('\n5. the REST of the verbs are present and correctly gated');
  {
    // With the brain UP (state from step 4), savererun should be available.
    check('Savererun enabled while brain is up', await page.isEnabled('#bp-savererun'));
    check('Update (keep weights) present', await page.isVisible('#bp-update-save'));
    check('Update + Fresh Walk present', await page.isVisible('#bp-update-fresh'));
    check('Reset present', await page.isVisible('#bp-reset'));

    // Now take the brain away and re-check the gating.
    if (mockBrain) { await mockBrain.close(); mockBrain = null; }
    await page.click('#bp-refresh');
    await page.waitForFunction(() => /state-(offline|halted|failed)/.test(document.getElementById('brain-power').className), { timeout: 20000 });
    check('Savererun DISABLED with the brain down', await page.isDisabled('#bp-savererun'),
      'it rewrites pointers inside loaded weights, so it cannot work while stopped');
    check('Savererun tooltip explains why', /needs the brain running/i.test(await page.getAttribute('#bp-savererun', 'title') || ''),
      await page.getAttribute('#bp-savererun', 'title'));
    check('Update STILL enabled with the brain down', await page.isEnabled('#bp-update-save'),
      'fixing a bad deploy is exactly when the brain is down');
    check('Reset STILL enabled with the brain down', await page.isEnabled('#bp-reset'));

    // Reset must demand a typed confirmation, and abort safely on anything else.
    page.once('dialog', d => d.dismiss().catch(() => {}));      // cancel the prompt
    await page.click('#bp-reset');
    await page.waitForTimeout(800);
    const aborted = (await page.textContent('#bp-result')).trim();
    check('Reset aborts when the typed confirm is cancelled', /aborted/i.test(aborted), `result="${aborted}"`);
  }

  console.log('\n6. no JS errors from the panel');
  check('no uncaught page errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
} catch (err) {
  fail.push(`harness: ${err.message}`);
  console.error('\nHARNESS ERROR:', err.message);
} finally {
  if (mockBrain) await mockBrain.close();
  if (browser) await browser.close().catch(() => {});
  ctl.kill('SIGKILL');
  pageServer.close();
}

console.log('\n' + '='.repeat(64));
if (fail.length) { console.log(`FAILED — ${pass.length} passed, ${fail.length} failed`); for (const f of fail) console.log('  ✗ ' + f); console.log('\nctl output:\n' + ctlOut.slice(-2000)); }
else console.log(`ALL PASS — ${pass.length} assertions (Start works with the brain down)`);
console.log('='.repeat(64));
process.exit(fail.length ? 1 : 0);
