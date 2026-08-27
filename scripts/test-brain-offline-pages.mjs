#!/usr/bin/env node
/**
 * Do the VISITOR-facing pages actually say "brain offline"?
 *
 * The dashboard is for admins. This covers what everyone else sees when the
 * brain is stopped but the web server is (correctly) still up:
 *   • index.html    — the leaderboard must not render an empty board that
 *                     reads as "nobody has donated yet"
 *   • compute.html  — a donor must be told the brain is deliberately down,
 *                     not just "disconnected", because that decides whether
 *                     waiting is pointless
 *   • minds-eye.html— an outage must not render as the much softer
 *                     "her mind's eye is warming up…"
 *
 * Serves the real page files with a mock nginx that returns exactly the
 * offline body the live box returns (verified against production), so this
 * tests the contract the frontend actually receives.
 *
 * Run: node scripts/test-brain-offline-pages.mjs
 */

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
const PORT = 7699;

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('SKIP — playwright not installed.'); process.exit(0); }

const pass = []; const fail = [];
const check = (n, c, d = '') => { (c ? pass : fail).push(n + (c ? '' : ` — ${d}`)); console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : ` — ${d}`}`); };

// EXACTLY what nginx's @brain_offline_state / @brain_offline_mindseye return.
// Kept verbatim in sync with deploy/nginx-unity-brain-ctl.conf — if that
// changes, this must too, and these tests are what will catch the drift.
const OFFLINE_STATE = {
  type: 'state', brainOnline: false, brainOffline: true,
  offlineReason: 'upstream-unreachable',
  human: 'Brain offline — the brain process is not running or is still loading. The site stays up; an admin can start it from the dashboard.',
  ctl: '/ctl/status', state: null,
};
const OFFLINE_MINDSEYE = {
  brainOnline: false, brainOffline: true, offlineReason: 'upstream-unreachable',
  human: 'Brain offline — nothing to imagine right now. The site stays up; an admin can start the brain from the dashboard.',
  ctl: '/ctl/status', note: 'brain offline', frame: null,
};

const srv = http.createServer((rq, rs) => {
  const u = (rq.url || '').split('?')[0];
  if (u === '/public-state.json') { rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(OFFLINE_STATE)); return; }
  if (u === '/minds-eye.json')    { rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(OFFLINE_MINDSEYE)); return; }
  // Serve the repo's REAL files — pages AND their static assets. minds-eye.html
  // is an ES module that imports js/brain/mindspace/transform.js; 404ing that
  // silently prevents the whole module from executing, so the page would sit at
  // "connecting…" and the test would fail for the wrong reason.
  const candidates = [
    path.join(REPO, u.replace(/^\//, '')),
    path.join(REPO, 'html', path.basename(u)),
  ];
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  for (const f of candidates) {
    if (existsSync(f) && !f.endsWith('/')) {
      try {
        const body = readFileSync(f);
        rs.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        rs.end(body); return;
      } catch { /* fall through to 404 */ }
    }
  }
  rs.writeHead(404); rs.end('');
});

const browser = await chromium.launch();
try {
  await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

  console.log('\n1. index.html — leaderboard must say offline, not look empty');
  {
    const p = await browser.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => {
      const t = document.body.innerText || '';
      return /brain offline/i.test(t);
    }, { timeout: 20000 }).catch(() => {});
    const txt = await p.innerText('body');
    check('says "Brain offline"', /brain offline/i.test(txt), txt.slice(0, 200));
    check('does NOT claim nobody donated', !/no contributors yet/i.test(txt),
      'an empty board during an outage misreads as "no donors"');
    await p.close();
  }

  console.log('\n2. compute.html — a donor must learn the brain is DOWN, not just "disconnected"');
  {
    // compute.html only calls connectToServer() AFTER WebGPU initialises, and
    // headless Chromium has no WebGPU adapter — so the real ws.onclose path
    // cannot be reached by simply loading the page here. Rather than fake a GPU
    // (which would test a mock, not the product), extract the ACTUAL onclose
    // body from the shipped file and run it against the same status element and
    // the same offline snapshot the live box serves. If someone edits that
    // handler, this test reads the edited code.
    const src = readFileSync(path.join(REPO, 'html', 'compute.html'), 'utf8');
    const start = src.indexOf('ws.onclose = () => {');
    check('found ws.onclose in compute.html', start > 0, 'the handler was renamed — update this test');
    // brace-match the handler body
    let depth = 0, end = start;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const handler = src.slice(start, end);
    check('handler consults the public snapshot', /public-state\.json/.test(handler),
      'without this the donor is never told WHY it dropped');

    const p = await browser.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/compute.html`, { waitUntil: 'domcontentloaded' });
    // Run the real handler with the page's real #status element in scope.
    await p.evaluate(`(async () => {
      const statusEl = document.getElementById('status');
      let _reconnectAttempt = 0, _reconnectTimer = null;
      const _showReconnectButton = () => {};
      const ws = {};
      ${handler}
      ws.onclose();
      await new Promise(r => setTimeout(r, 1500));
    })()`);
    await p.waitForFunction(() => /brain offline/i.test(document.getElementById('status')?.textContent || ''), { timeout: 15000 }).catch(() => {});
    const status = await p.textContent('#status');
    check('status says "Brain offline"', /brain offline/i.test(status || ''), `status="${(status || '').slice(0, 160)}"`);
    check('tells the donor it keeps retrying', /retry|retrying/i.test(status || ''), status || '');
    check('explains there is no compute to donate', /no compute to donate|not running/i.test(status || ''), status || '');
    await p.close();
  }

  console.log('\n3. minds-eye.html — outage must NOT read as "warming up"');
  {
    const p = await browser.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/minds-eye.html`, { waitUntil: 'domcontentloaded' });
    // The viewer reports state in #status-text (not body text).
    await p.waitForFunction(() => /offline/i.test(document.getElementById('status-text')?.textContent || ''), { timeout: 25000 }).catch(() => {});
    const txt = await p.textContent('#status-text');
    const cls = await p.getAttribute('#status', 'class');
    check('status says offline', /offline/i.test(txt || ''), `status-text="${txt}"`);
    check('status styled as an ERROR, not "warming"', /err/.test(cls || ''), `class="${cls}"`);
    check('does NOT say "warming up"', !/warming up/i.test(txt || ''),
      'claiming she is warming up while she is switched off is the lie this fixes');
    await p.close();
  }
} catch (err) {
  fail.push(`harness: ${err.message}`);
  console.error('HARNESS ERROR:', err);
} finally {
  await browser.close().catch(() => {});
  srv.close();
}

console.log('\n' + '='.repeat(64));
if (fail.length) { console.log(`FAILED — ${pass.length} passed, ${fail.length} failed`); for (const f of fail) console.log('  ✗ ' + f); }
else console.log(`ALL PASS — ${pass.length} assertions (visitors are told the truth)`);
console.log('='.repeat(64));
process.exit(fail.length ? 1 : 0);
