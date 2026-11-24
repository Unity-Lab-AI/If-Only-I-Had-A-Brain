// runpod-control.js — the optional Runpod plug-in: rent a GPU, have it join
// her pool as a donor, and give it back when it is not needed.
//
// What it is NOT: it does not move her brain to Runpod. Her brain stays on this
// machine; a rented card joins the pool exactly like any other donor, over the
// Cloudflare donor lane (`wss://brain.theunitybrain.com/ws`). A bigger card
// gives her more room (the pool spreads clusters across cards).
//
// THE POD'S COMMAND IS READ FROM `deploy/runpod-donor-launcher.sh` AT START
// TIME, never copied in here. A pod's command is immutable once created, and a
// copy pasted into code is exactly the stale pin that file was written to end.
//
// THE KEY never leaves this machine: it is read from RUNPOD_API_KEY or from the
// gitignored `server/runpod-key.json` (written by the admin page), and no route
// ever sends it back out.
//
// Every pod this module creates is named `unity-donor-…`, and it only ever
// stops or terminates pods with that prefix — a pod the operator made by hand
// in the console is never touched by it.

'use strict';

const fs = require('fs');
const path = require('path');

const API = 'https://api.runpod.io';
const KEY_FILE = path.join(__dirname, 'runpod-key.json');
const SETTINGS_FILE = path.join(__dirname, 'runpod-settings.json');
const LAUNCHER = path.join(__dirname, '..', 'deploy', 'runpod-donor-launcher.sh');
const POD_PREFIX = 'unity-donor-';

function _key() {
  if (process.env.RUNPOD_API_KEY) return process.env.RUNPOD_API_KEY.trim();
  try { return (JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')).key || '').trim(); } catch { return ''; }
}

function hasKey() { return !!_key(); }

function setKey(key) {
  const k = String(key || '').trim();
  if (!k) { try { fs.unlinkSync(KEY_FILE); } catch { /* already gone */ } return; }
  fs.writeFileSync(KEY_FILE, JSON.stringify({ key: k, savedAt: Date.now() }), { mode: 0o600 });
}

function settings() {
  try { return Object.assign({ autoStopOnShutdown: true, donorName: '' }, JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))); }
  catch { return { autoStopOnShutdown: true, donorName: '' }; }
}

function saveSettings(patch) {
  const s = Object.assign(settings(), patch || {});
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
  return s;
}

async function _api(method, p, body) {
  const key = _key();
  if (!key) throw new Error('no Runpod API key saved');
  const r = await fetch(API + p, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'unity-brain-runpod' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!r.ok) {
    const msg = (json && (json.detail || json.title || json.error)) || text || `HTTP ${r.status}`;
    const err = new Error(`Runpod ${method} ${p} → ${r.status}: ${String(msg).slice(0, 300)}`);
    err.status = r.status;
    throw err;
  }
  return json;
}

// The launcher's executable body — from `set -x` to the end, comment lines
// dropped (comments only; every command line is kept, in order).
function _launcherBody() {
  const t = fs.readFileSync(LAUNCHER, 'utf8').replace(/\r/g, '');
  const at = t.indexOf('set -x');
  if (at < 0) throw new Error('deploy/runpod-donor-launcher.sh has no `set -x` body');
  return t.slice(at).split('\n').filter((l) => !/^\s*#/.test(l) && l.trim()).join('\n');
}

async function status() {
  const out = { hasKey: hasKey(), settings: settings(), balance: null, pods: [], gpus: [], error: null };
  if (!out.hasKey) return out;
  try {
    const [bal, pods, gpus] = await Promise.all([
      _api('GET', '/v2/billing/balance'),
      _api('GET', '/v2/pods?limit=100'),
      // ⚠ The catalog takes no `limit` — it returns every type in one page.
      _api('GET', '/v2/catalog/gpus?include=AVAILABILITY&product=POD&cloud=COMMUNITY'),
    ]);
    out.balance = bal && typeof bal.balanceAmount === 'number' ? bal.balanceAmount : null;
    // Field names per Runpod's v2 OpenAPI: `status` (PodStatus), `gpu.id`
    // (GpuConfig carries no display name), `cost` (the hourly rate, reported in
    // every status — including EXITED, when it is not being billed).
    out.pods = ((pods && pods.pods) || [])
      .filter((p) => String(p.name || '').startsWith(POD_PREFIX) && p.status !== 'TERMINATED')
      .map((p) => ({
        id: p.id, name: p.name, status: p.status || null,
        gpu: (p.gpu && p.gpu.id) || null,
        costPerHr: typeof p.cost === 'number' ? p.cost : null,
        createdAt: p.createdAt || null,
      }));
    // Only cards that can hold a cluster and are in stock now, cheapest first.
    out.gpus = ((gpus && gpus.gpus) || [])
      .filter((g) => g.availability && g.availability !== 'NONE' && Number(g.memory) >= 16 && g.price && Number(g.price.community) > 0)
      .map((g) => ({ id: g.id, name: g.name, memoryGB: g.memory, pricePerHr: g.price.community, availability: g.availability }))
      .sort((a, b) => a.pricePerHr - b.pricePerHr);
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

async function startDonor(gpuId) {
  if (!gpuId) throw new Error('pick a GPU');
  const s = settings();
  const body = {
    name: POD_PREFIX + String(gpuId).replace(/^NVIDIA\s+/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40),
    cloud: 'COMMUNITY',
    gpu: { id: gpuId, count: 1, minCudaVersion: '12.8' },
    image: 'ubuntu:24.04',
    disk: 20,
    env: {
      DONOR_GPUS: 'all', DONOR_UTIL: 'all', DONOR_NAME: s.donorName || '',
      NVIDIA_VISIBLE_DEVICES: 'all', NVIDIA_DRIVER_CAPABILITIES: 'all',
    },
    entrypoint: ['/bin/bash', '-c'],
    cmd: [_launcherBody()],
  };
  const pod = await _api('POST', '/v2/pods', body);
  console.log(`[Runpod] donor pod created — ${pod && pod.id} (${gpuId}) — it downloads the latest donor release and joins her pool over brain.theunitybrain.com.`);
  return pod;
}

async function stopDonor(id) {
  const pod = await _api('GET', `/v2/pods/${encodeURIComponent(id)}`);
  if (!pod || !String(pod.name || '').startsWith(POD_PREFIX)) throw new Error('not a donor pod this plug-in created — refusing to touch it');
  await _api('POST', `/v2/pods/${encodeURIComponent(id)}/action`, { action: 'terminate' });
  console.log(`[Runpod] donor pod terminated — ${id} (${pod.name}). Billing stops.`);
  return { id, terminated: true };
}

// Called on a clean shutdown: a donor pod with no brain to donate to only burns
// money (measured once at 24.9 hours of 0% GPU). Off by the admin page's switch.
async function stopAllOnShutdown() {
  if (!hasKey() || !settings().autoStopOnShutdown) return 0;
  let n = 0;
  try {
    const pods = await _api('GET', '/v2/pods?limit=100');
    for (const p of ((pods && pods.pods) || [])) {
      if (!String(p.name || '').startsWith(POD_PREFIX)) continue;
      try { await _api('POST', `/v2/pods/${encodeURIComponent(p.id)}/action`, { action: 'terminate' }); n++; } catch { /* report below */ }
    }
    if (n) console.log(`[Runpod] shutdown — terminated ${n} donor pod(s) so nothing bills while she is down.`);
  } catch (e) {
    console.warn(`[Runpod] shutdown auto-stop could not run: ${e.message} — check the Runpod console for running donor pods.`);
  }
  return n;
}

module.exports = { hasKey, setKey, settings, saveSettings, status, startDonor, stopDonor, stopAllOnShutdown };
