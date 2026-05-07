#!/usr/bin/env node
/**
 * configure.js — Unity Brain Server Resource Configuration Tool
 *
 * One-shot admin tool launched by GPUCONFIGURE.bat. Runs hardware
 * detection, serves a local web UI at http://127.0.0.1:7526, and
 * writes server/resource-config.json when the admin clicks Save.
 * The running brain-server.js reads that file at its next boot to
 * cap neuron count below detected hardware — server operators can
 * deliberately run smaller than their ceiling without breaking the
 * auto-detect path.
 *
 * Security: binds ONLY on 127.0.0.1. Never accessible from another
 * machine. No auth needed — if you can reach 127.0.0.1 you're the
 * local user.
 *
 * Idiot-proof rules enforced both client-side and server-side:
 *   1. Neuron count can never exceed detected hardware ceiling
 *   2. VRAM cap can never exceed detected VRAM
 *   3. Minimum 1000 neurons always enforced
 *   4. Invalid JSON writes are rejected, existing config preserved
 *   5. Tier presets map to known-good combinations
 *
 * Usage:
 *   node server/configure.js
 *   → opens http://127.0.0.1:7526 in your browser
 *   → pick a tier OR tweak manually
 *   → click Save
 *   → config written to server/resource-config.json
 *   → close the tab or click Exit
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { exec } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'resource-config.json');
const HTML_PATH = path.join(__dirname, '..', 'html', 'gpu-configure.html');
const PORT = 7526;

// ── Hardware detection (mirrors brain-server.js logic) ───────────

function detectHardware() {
  const totalRAM = os.totalmem();
  const freeRAM = os.freemem();
  const cpuCount = os.cpus().length;
  const cpuModel = os.cpus()[0]?.model || 'unknown';

  let gpu = { name: 'none', vram: 0 };
  try {
    const smi = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', { timeout: 5000 }).toString().trim();
    const parts = smi.split(',').map(s => s.trim());
    if (parts.length >= 2) gpu = { name: parts[0], vram: parseInt(parts[1]) || 0 };
  } catch {
    try {
      const wmic = execSync('wmic path win32_videocontroller get name,adapterram', { timeout: 5000 }).toString();
      const match = wmic.match(/(\d{9,})/);
      if (match) gpu = { name: 'GPU', vram: Math.floor(parseInt(match[1]) / 1048576) };
    } catch {}
  }

  // Compute the hardware ceiling in neurons
  let ceilingNeurons;
  if (gpu.vram > 0) {
    const usableVRAM = gpu.vram * 0.85;
    ceilingNeurons = Math.floor(usableVRAM * 1048576 / 8); // 8 bytes/neuron SLIM
  } else {
    const usableRAM = freeRAM * 0.3;
    ceilingNeurons = Math.floor(usableRAM / 9);
    ceilingNeurons = Math.min(ceilingNeurons, cpuCount * 150000);
  }
  ceilingNeurons = Math.max(1000, ceilingNeurons);

  return {
    gpu,
    totalRAMBytes: totalRAM,
    freeRAMBytes: freeRAM,
    cpuCount,
    cpuModel,
    ceilingNeurons,
    hasGPU: gpu.vram > 0,
  };
}

// ── Existing config ───────────────────────────────────────────────

function loadCurrentConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

// ── Validation — NEVER let the admin break it ────────────────────

function validateAndSave(payload, hardware) {
  const errors = [];
  const cfg = {
    tier: String(payload.tier || 'custom').slice(0, 64),
    notes: String(payload.notes || '').slice(0, 500),
    updatedAt: new Date().toISOString(),
  };

  // Neuron cap — must be ≥ 1000 and ≤ detected ceiling
  if (payload.neuronCapOverride != null) {
    const n = Math.floor(Number(payload.neuronCapOverride));
    if (!Number.isFinite(n) || n < 1000) {
      errors.push(`neuronCapOverride must be ≥ 1000, got ${payload.neuronCapOverride}`);
    } else if (n > hardware.ceilingNeurons) {
      errors.push(`neuronCapOverride ${n} exceeds detected hardware ceiling ${hardware.ceilingNeurons}`);
    } else {
      cfg.neuronCapOverride = n;
    }
  }

  // VRAM cap — must be ≥ 256 MB and ≤ detected VRAM
  if (payload.vramCapMB != null && hardware.gpu.vram > 0) {
    const v = Math.floor(Number(payload.vramCapMB));
    if (!Number.isFinite(v) || v < 256) {
      errors.push(`vramCapMB must be ≥ 256, got ${payload.vramCapMB}`);
    } else if (v > hardware.gpu.vram) {
      errors.push(`vramCapMB ${v} exceeds detected VRAM ${hardware.gpu.vram}MB`);
    } else {
      cfg.vramCapMB = v;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // Write atomically via temp file
  const tmp = CONFIG_PATH + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8');
    fs.renameSync(tmp, CONFIG_PATH);
    return { ok: true, config: cfg };
  } catch (err) {
    return { ok: false, errors: [`write failed: ${err.message}`] };
  }
}

// ── HTTP server ──────────────────────────────────────────────────

let shuttingDown = false;

const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET' && (req.url === '/' || req.url === '/gpu-configure.html')) {
    try {
      const html = fs.readFileSync(HTML_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      res.writeHead(500);
      res.end('failed to load gpu-configure.html: ' + err.message);
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/detect') {
    const hw = detectHardware();
    const current = loadCurrentConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hardware: hw, current }));
    return;
  }

  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const hw = detectHardware();
        const result = validateAndSave(payload, hw);
        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, errors: ['invalid JSON: ' + err.message] }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/clear') {
    try {
      if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, cleared: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, errors: [err.message] }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/exit') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, exiting: true }));
    shuttingDown = true;
    setTimeout(() => {
      console.log('[configure] shutdown requested by UI — goodbye');
      process.exit(0);
    }, 250);
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

// Bind ONLY on loopback — never accessible from another machine
server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log('');
  console.log('  ===========================================');
  console.log('   Unity Brain Server — GPU / Resource Config');
  console.log('  ===========================================');
  console.log('');
  console.log('  Admin UI running at: ' + url);
  console.log('  Config file:         ' + CONFIG_PATH);
  console.log('');
  console.log('  Ctrl+C to cancel without saving.');
  console.log('');

  // Auto-open the browser
  const opener = process.platform === 'win32' ? `start "" "${url}"`
               : process.platform === 'darwin' ? `open "${url}"`
               : `xdg-open "${url}"`;
  exec(opener, () => {});
});

// Graceful shutdown — Ctrl+C should exit cleanly
process.on('SIGINT', () => {
  if (shuttingDown) return;
  console.log('\n[configure] Ctrl+C received — exiting without saving');
  process.exit(0);
});
