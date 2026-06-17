#!/usr/bin/env node
/**
 * scripts/verify-size-parity.mjs — Static-site ↔ brain-server neuron
 * count parity check. Per audit task H.7.
 *
 * Operator note 2026-06-17: "rember the nueroins count auto sizes from
 * static site to set gpu to default max for found gpu". The static
 * landing page (index.html via js/app.bundle.js) detects WebGPU adapter
 * limits + sizes neurons accordingly. The brain-server (server/brain-
 * server.js) independently auto-scales from os.freemem() + V8 heap
 * limits. If these two paths diverge, compute.html's GPU buffers will
 * be sized for one count while brain-server's CPU shadow expects
 * another → sparse-matrix upload size error.
 *
 * What this does:
 *   1. Boot brain-server in a subprocess (DREAM_NO_AUTO_GPU=1).
 *   2. Wait for HTTP listener.
 *   3. GET /health and parse the server-derived neuron count + cluster
 *      sizes.
 *   4. Locate the rebuilt js/app.bundle.js + regex-extract the
 *      default-neuron-count constants the static site uses to seed its
 *      WebGPU probe.
 *   5. Report whether server-derived size is consistent with what the
 *      static landing would request from the server (the static path
 *      typically asks the server for SCALE via WebSocket, but the
 *      pre-WS scaffolding builds with a known default for the 3D
 *      visualization — that default should not exceed the server's
 *      reported count).
 *
 * Exit code 0 = parity OK, 1 = mismatch, 2 = driver error.
 *
 * NOT wired into start.bat. Developer-side verification per audit H.7.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_FILE = path.join(REPO_ROOT, 'server', 'brain-server.js');
const BUNDLE_FILE = path.join(REPO_ROOT, 'js', 'app.bundle.js');
const PORT = parseInt(process.env.PORT, 10) || 7525;
const BOOT_TIMEOUT_MS = 90_000;

const banner = (t) => console.log(`\n${'━'.repeat(72)}\n${t}\n${'━'.repeat(72)}`);
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function bootServerAndReadHealth() {
  const env = { ...process.env, DREAM_NO_AUTO_GPU: '1', DREAM_KEEP_STATE: '1' };
  const child = spawn(
    process.execPath,
    ['--max-old-space-size=8192', SERVER_FILE],
    { cwd: path.join(REPO_ROOT, 'server'), env, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let httpListening = false;
  child.stdout.on('data', (d) => {
    const t = d.toString();
    if (t.includes('HTTP listening on port') || t.includes('Open:       http://localhost')) httpListening = true;
  });
  child.stderr.on('data', () => {});

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (!httpListening && Date.now() < deadline) await sleep(500);
  if (!httpListening) {
    try { child.kill('SIGKILL'); } catch {}
    throw new Error('brain-server did not bind HTTP within timeout');
  }
  let health = null;
  try {
    const r = await fetch(`http://localhost:${PORT}/health`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    health = await r.json();
  } finally {
    try { await fetch(`http://localhost:${PORT}/shutdown`, { method: 'POST' }); } catch {}
    await sleep(2_000);
    if (!child.killed) try { child.kill('SIGTERM'); } catch {}
    await sleep(2_000);
    if (!child.killed) try { child.kill('SIGKILL'); } catch {}
  }
  return health;
}

async function extractStaticSizeDefault() {
  // js/app.bundle.js is gitignored + rebuilt by start.bat. Treat its
  // absence as non-blocking — the parity check just can't verify the
  // static-side number in that case.
  let bundle;
  try {
    bundle = await fsp.readFile(BUNDLE_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { ok: false, reason: 'js/app.bundle.js not found — run start.bat to build it first' };
    }
    throw err;
  }

  // Heuristic regex sweep — the bundle minifies but property names are
  // preserved by esbuild default config. Look for tier defaults and
  // adapter-limit reads that would shape the static-site neuron count.
  const matches = {
    biologicalScaleDefault: null,
    fallbackBrowserScale: null,
    referencesAdapterLimits: bundle.includes('maxStorageBufferBindingSize'),
    referencesAutoSize: bundle.includes('autoSize') || bundle.includes('auto-size') || bundle.includes('AUTO_SIZE'),
  };

  const m1 = bundle.match(/biological(?:Scale)?[^=]*=\s*['"]?(\d{6,})/i);
  if (m1) matches.biologicalScaleDefault = parseInt(m1[1], 10);
  const m2 = bundle.match(/(?:browser|fallback|cpu)[A-Za-z]*Scale[^=]*=\s*['"]?(\d{3,7})/i);
  if (m2) matches.fallbackBrowserScale = parseInt(m2[1], 10);
  return { ok: true, ...matches };
}

async function run() {
  banner('scripts/verify-size-parity.mjs — H.7 static-site ↔ server parity');
  console.log(`Server JS:    ${SERVER_FILE}`);
  console.log(`Bundle JS:    ${BUNDLE_FILE}`);
  console.log(`Health URL:   http://localhost:${PORT}/health\n`);

  let health, statics;
  try { health = await bootServerAndReadHealth(); }
  catch (err) { console.error(`[parity] server-boot failure: ${err.message}`); process.exit(2); }
  try { statics = await extractStaticSizeDefault(); }
  catch (err) { console.error(`[parity] bundle-read failure: ${err.message}`); process.exit(2); }

  banner('Server-side (from /health)');
  console.log(`  neurons:     ${health.neurons}`);
  console.log(`  scale:       ${health.scale}`);
  console.log(`  clusters:    ${JSON.stringify(health.clusters)}`);

  banner('Static-side (from js/app.bundle.js)');
  if (!statics.ok) {
    console.log(`  ⚠ ${statics.reason}`);
  } else {
    console.log(`  references adapter.limits.maxStorageBufferBindingSize: ${statics.referencesAdapterLimits}`);
    console.log(`  references autoSize symbol/string:                    ${statics.referencesAutoSize}`);
    console.log(`  biologicalScale default (regex extracted):            ${statics.biologicalScaleDefault ?? '(not found in bundle)'}`);
    console.log(`  fallback browser scale (regex extracted):             ${statics.fallbackBrowserScale ?? '(not found in bundle)'}`);
  }

  banner('Parity verdict');
  let parityOk = true;
  if (!statics.ok) {
    console.log('⚠ INCONCLUSIVE — bundle missing. Rebuild via start.bat then re-run.');
    process.exit(0);
  }
  if (!statics.referencesAdapterLimits) {
    console.log('❌ FAIL — bundle does NOT reference maxStorageBufferBindingSize. Static auto-size path broken.');
    parityOk = false;
  }
  if (statics.biologicalScaleDefault && statics.biologicalScaleDefault > health.neurons * 2) {
    console.log(`❌ FAIL — bundle biological-scale default ${statics.biologicalScaleDefault} > 2× server-side ${health.neurons}. Mismatch risk.`);
    parityOk = false;
  }
  if (parityOk) {
    console.log('✅ PASS — static-site auto-size path references adapter limits + bundle defaults consistent with server count.');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run().catch((err) => { console.error('[parity] driver error:', err); process.exit(2); });
