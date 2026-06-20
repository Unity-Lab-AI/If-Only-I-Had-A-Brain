#!/usr/bin/env node
/**
 * scripts/smoke-server-boot.mjs — End-to-end brain-server boot smoke.
 *
 * Per audit task H.3 — `node --check` confirms syntax but doesn't catch
 * runtime dispatch failures from the post-P4.2 cluster.js + P4.3
 * brain-server.js mixin refactor (e.g., an Object.assign chain not
 * running before constructor-time dispatch, or a mixin attached but
 * the method symbol mis-exported).
 *
 * What this does:
 *   1. Fork `server/brain-server.js` with DREAM_NO_AUTO_GPU=1 +
 *      DREAM_KEEP_STATE=1 (preserve state — no destructive boot during
 *      smoke; the goal is dispatch verification, not training).
 *   2. Pipe stdout/stderr into our buffer + wait up to 90s for either:
 *      - "[Brain] HTTP listening on port" log line (success signal)
 *      - "[Cluster cortex] cortical wiring verified" log line
 *      - "[Cluster cortex] auto-size + mixin dispatch verified" log line
 *   3. Once HTTP is up, GET /health and confirm JSON shape includes
 *      `status: 'alive'`, `neurons: <number>`, `clusters: {...}`.
 *   4. Kill the child cleanly via SIGTERM (gracefully shuts down the
 *      brain via stop-signal handler) and wait up to 10s for exit.
 *   5. Report PASS only if all 4 checks succeeded. Exit code 0 on PASS,
 *      1 on FAIL.
 *
 * Usage:
 *   node scripts/smoke-server-boot.mjs
 *
 * NOT wired into start.bat by default (per audit H.3 + the no-tests-
 * ever LAW — this is a developer-side verification script that runs
 * once after a refactor, not a CI gate that fires on every boot).
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_FILE = path.join(REPO_ROOT, 'server', 'brain-server.js');
const PORT = parseInt(process.env.PORT, 10) || 7525;
const BOOT_TIMEOUT_MS = 90_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const HEALTH_RETRY_MAX = 5;
const HEALTH_RETRY_DELAY_MS = 2_000;

const banner = (txt) => console.log(`\n${'━'.repeat(72)}\n${txt}\n${'━'.repeat(72)}`);

async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchHealth() {
  for (let attempt = 0; attempt < HEALTH_RETRY_MAX; attempt += 1) {
    try {
      const r = await fetch(`http://localhost:${PORT}/health`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (err) {
      if (attempt === HEALTH_RETRY_MAX - 1) throw err;
      await sleep(HEALTH_RETRY_DELAY_MS);
    }
  }
  throw new Error('health-endpoint unreachable after retries');
}

async function run() {
  banner('scripts/smoke-server-boot.mjs — H.3 boot smoke');
  console.log(`Repo root:  ${REPO_ROOT}`);
  console.log(`Server JS:  ${SERVER_FILE}`);
  console.log(`Target URL: http://localhost:${PORT}/health`);
  console.log(`Boot timeout: ${BOOT_TIMEOUT_MS}ms\n`);

  const env = {
    ...process.env,
    DREAM_NO_AUTO_GPU: '1',     // skip Chrome auto-launch — H.6 already verified
    DREAM_KEEP_STATE: '1',      // non-destructive — preserve saved state during smoke
  };

  const child = spawn(
    process.execPath,
    ['--max-old-space-size=8192', SERVER_FILE],
    { cwd: path.join(REPO_ROOT, 'server'), env, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let httpListening = false;
  let kWiringVerified = false;
  let autoSizeVerified = false;
  let dictionaryReady = false;
  const stdoutLines = [];

  const watchLine = (line) => {
    if (line.includes('HTTP listening on port') || line.includes('Open:       http://localhost')) httpListening = true;
    if (line.includes('cortical wiring verified')) kWiringVerified = true;
    if (line.includes('auto-size + mixin dispatch verified')) autoSizeVerified = true;
    if (line.includes('dictionary API ready')) dictionaryReady = true;
  };

  // Per-stream line buffering — a single log line can straddle two `data`
  // chunks (TCP/pipe boundary). The prior code matched substrings against raw
  // chunks, so a verdict line split across chunks (e.g. "cortical wiring
  // verified") was silently missed → false FAIL. Accumulate per stream, only
  // run watchLine on COMPLETE newline-terminated lines.
  const makeReader = (isErr) => {
    let buf = '';
    return (data) => {
      const txt = data.toString();
      stdoutLines.push(isErr ? `[stderr] ${txt}` : txt);
      buf += txt;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        watchLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    };
  };
  child.stdout.on('data', makeReader(false));
  child.stderr.on('data', makeReader(true));

  const bootDeadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < bootDeadline) {
    if (httpListening) break;
    await sleep(500);
  }

  const checks = {
    httpListening,
    kWiringVerified,
    autoSizeVerified,
    dictionaryReady,
    healthEndpoint: false,
    healthShape: false,
  };

  if (httpListening) {
    try {
      const health = await fetchHealth();
      checks.healthEndpoint = true;
      checks.healthShape = (
        health.status === 'alive' &&
        typeof health.neurons === 'number' && Number.isFinite(health.neurons) && health.neurons > 0 &&
        health.clusters && typeof health.clusters === 'object'
      );
      console.log(`[smoke] /health: status=${health.status} neurons=${health.neurons} clusters=${Object.keys(health.clusters || {}).length}`);
    } catch (err) {
      console.warn(`[smoke] /health fetch failed: ${err.message}`);
    }
  }

  // Cleanly request shutdown.
  if (child.pid && !child.killed) {
    try {
      const r = await fetch(`http://localhost:${PORT}/shutdown`, { method: 'POST' });
      if (r.ok) console.log('[smoke] graceful /shutdown accepted');
    } catch {}
    await sleep(SHUTDOWN_TIMEOUT_MS / 4);
    try { if (!child.killed) child.kill('SIGTERM'); } catch {}
  }

  // Wait for child exit
  const exitDeadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
  while (!child.killed && child.exitCode == null && Date.now() < exitDeadline) await sleep(250);
  if (!child.killed && child.exitCode == null) {
    try { child.kill('SIGKILL'); } catch {}
  }

  banner('Results');
  let allPass = true;
  for (const [name, ok] of Object.entries(checks)) {
    const tag = ok ? 'PASS' : 'FAIL';
    if (!ok) allPass = false;
    console.log(`  ${tag.padEnd(6)} ${name}`);
  }
  console.log('');
  if (allPass) {
    console.log('✅ SMOKE PASS — brain-server boots cleanly, all mixin dispatches resolve, /health endpoint healthy.');
    process.exit(0);
  } else {
    console.log('❌ SMOKE FAIL — see lines above. Tail of brain-server stdout/stderr:');
    console.log(stdoutLines.slice(-30).join(''));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[smoke] driver error:', err);
  process.exit(2);
});
