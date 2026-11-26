// status-file.js — ONE status page, rewritten in place, never appended.
//
// The operator asked for a single file holding every diagnostic needed to watch
// and troubleshoot a whole walk, that does not grow into a run-on log and does not
// cost real compute. So this module reads ONLY what the brain already keeps
// (`getState()` — the dashboard builds it ten times a second — plus a few fields
// on the brain object and the console ring) and writes `server/status.md` every
// 30 s. One atomic write per interval (tmp file + rename): a reader never sees a
// half-written page. Nothing here sends a frame to a donor or touches a matrix.
//
// ⚠ Fields are read defensively: a missing section prints "—" instead of
// throwing, because a status page that dies on one renamed field is worse than
// a page with one blank row.
'use strict';

const fs = require('fs');
const path = require('path');

const STATUS_FILE = path.join(__dirname, '..', 'status.md');
// ⭐ THE HISTORY THE PAGE MUST NOT OVERWRITE. One short line per notable event
// (gate verdicts, cell changes, warnings/errors, loop freezes ≥ 5 s, partition
// changes) in ONE file, capped at HISTORY_CAP lines — newest kept, oldest dropped,
// never rotated into new files. 5,000 lines of ≤ 220 chars is ≈ 1 MB at most,
// and a whole K → PhD walk's verdicts fit inside it.
const HISTORY_FILE = path.join(__dirname, '..', 'status-history.md');
const HISTORY_CAP = Number(process.env.DREAM_STATUS_HISTORY_LINES) > 0 ? Number(process.env.DREAM_STATUS_HISTORY_LINES) : 5000;
const NOTABLE = /(CELL (PASS|FAIL|START|DONE|ALIVE.*heartbeat #1 )|gate .*(PASS|FAIL)|PASSED|FAILED|PARTITION|IMAGE LANE|BUILD |\[EventLoop\] BLOCKED [5-9]\d{3,}ms|\[EventLoop\] BLOCKED \d{5,}ms|SUBSTEPS\.2|HANDOFF|low.balance|⛔)/;
const INTERVAL_MS = Number(process.env.DREAM_STATUS_FILE_MS) > 0 ? Number(process.env.DREAM_STATUS_FILE_MS) : 30000;

const _get = (o, p) => { try { return p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); } catch { return undefined; } };
const _fmt = (v) => (v == null || v === '' ? '—' : (typeof v === 'object' ? JSON.stringify(v).slice(0, 240) : String(v)));
const _denver = (ms) => { try { return new Date(ms).toLocaleString('en-US', { timeZone: 'America/Denver', hour12: false }); } catch { return String(ms); } };

function _lastRingLine(re) {
  const ring = globalThis.__consoleRing;
  if (!Array.isArray(ring)) return null;
  for (let i = ring.length - 1; i >= 0; i--) { const e = ring[i]; if (e && re.test(e.line)) return e; }
  return null;
}

function _countRing(re, sinceMs) {
  const ring = globalThis.__consoleRing;
  if (!Array.isArray(ring)) return 0;
  let n = 0;
  for (const e of ring) if (e && e.ts >= sinceMs && re.test(e.line)) n++;
  return n;
}

function buildStatus(brain) {
  const now = Date.now();
  let st = {};
  try { st = brain.getState() || {}; } catch (e) { st = { _err: e && e.message }; }
  const L = [];
  const row = (k, v) => L.push(`| ${k} | ${_fmt(v)} |`);
  const head = (t) => { L.push('', `## ${t}`, '', '| field | value |', '|---|---|'); };

  L.push(`# Unity status — ${_denver(now)} (Denver) · rewritten every ${Math.round(INTERVAL_MS / 1000)} s`);

  head('Boot');
  row('build', `${_get(st, 'build.short')} (${_get(st, 'build.branch')}) booted ${_get(st, 'build.bootedAt')}`);
  row('boot', _get(st, 'bootReason'));
  row('boot fatal', _get(st, 'bootFatal'));
  row('uptime s', Math.round(process.uptime()));

  head('Curriculum');
  const alive = _lastRingLine(/CELL ALIVE/);
  row('last heartbeat', alive ? `${_denver(alive.ts)} · ${alive.line.slice(0, 200)}` : null);
  const pass = _lastRingLine(/(PASSED|FAILED|✓ PASS|✗ FAIL|gate .*(PASS|FAIL))/);
  row('last gate verdict', pass ? `${_denver(pass.ts)} · ${pass.line.slice(0, 200)}` : null);
  const prod = _lastRingLine(/\[PROD\] sample .* DONE/);
  row('last PROD sample', prod ? prod.line.slice(0, 200) : null);
  row('liveness', _get(st, 'curriculum.liveness'));
  row('grades', _get(st, 'curriculum.grades') || _get(st, 'grades'));

  head('Pod / donor link');
  const tg = _lastRingLine(/TICK-GAP/);
  if (tg) {
    const m = (re) => { const x = re.exec(tg.line); return x ? Number(x[1]) : null; };
    const rt = m(/round-trip (\d+)ms/), donor = m(/donor=(\d+)ms/), un = m(/UNACCOUNTED=(\d+)ms/);
    row('last batch', `${_denver(tg.ts)} · round-trip ${rt} ms · donor ${donor} ms · unaccounted ${un} ms · substeps ${m(/substeps=(\d+)/)}`);
    row('card busy (donor / round-trip)', rt && donor != null ? `${Math.round(100 * donor / rt)}%` : null);
  } else row('last batch', null);
  row('batch round-trip ema ms', brain._batchTiming && Math.round(brain._batchTiming.roundTripEmaMs || 0));
  row('substeps now', brain._adaptSubsteps);
  row('gate probes', _get(st, 'profiling.throughput.gateProbes'));
  row('bound propagate', _get(st, 'profiling.throughput.boundPropagate'));
  try {
    const cards = [];
    if (brain.clients) for (const [, c] of brain.clients) {
      if (c && c.isGPU) cards.push(`${c.gpuName || c.id}${c.isLocalHost ? ' (host)' : ' (remote)'} v${c.donorAppVersion || '?'} image=${c.imageCapable == null ? '?' : c.imageCapable}`);
    }
    row('cards', cards.join(' · ') || null);
  } catch { row('cards', null); }
  const part = _lastRingLine(/PARTITION/);
  row('partition', part ? part.line.slice(0, 220) : null);

  head('Loop');
  row('BLOCKED lines (last 30 min)', _countRing(/\[EventLoop\] BLOCKED/, now - 1800000));
  const blk = _lastRingLine(/\[EventLoop\] BLOCKED/);
  row('last BLOCKED', blk ? `${_denver(blk.ts)} · ${blk.line.slice(0, 200)}` : null);
  row('event loop lag ms', _get(st, 'eventLoopLagMs') ?? _get(st, 'perf.eventLoopLagMs'));

  head('Memory / host');
  const mu = process.memoryUsage();
  row('rss / heap / external MB', `${Math.round(mu.rss / 1048576)} / ${Math.round(mu.heapUsed / 1048576)} / ${Math.round(mu.external / 1048576)}`);
  row('host card free MB (last probe)', brain._vramProbe ? brain._vramProbe.mb : null);
  row('neurons', _get(st, 'totalNeurons') ?? _get(st, 'bootReason.neurons'));

  head('Eyes / voice / talk');
  row('image engine', _get(st, 'ownArt.imageEngine'));
  const il = _lastRingLine(/IMAGE LANE/);
  row('image lane', il ? il.line.slice(0, 200) : null);
  const vs = brain._voiceSynth;
  row('voice', vs ? `${vs.lastVoice || '?'}${vs._dead ? ' (worker dead)' : ''} ${vs.v2 ? _fmt(vs.v2) : ''}` : null);
  row('chat texts (last 30 min)', _countRing(/\] Text \(/, now - 1800000));
  const tx = _lastRingLine(/\] Text \(/);
  row('last chat in', tx ? `${_denver(tx.ts)} · ${tx.line.slice(0, 180)}` : null);

  L.push('', '## Last 12 warnings / errors', '');
  const al = Array.isArray(globalThis.__consoleAlerts) ? globalThis.__consoleAlerts.slice(-12) : [];
  if (!al.length) L.push('—');
  for (const a of al) L.push(`- ${_denver(a.ts)} [${a.level}] ${String(a.line).slice(0, 220).replace(/\n/g, ' ')}`);
  L.push('');
  return L.join('\n');
}

// Collect notable ring lines since the last tick into the capped history.
function _updateHistory(brain) {
  const ring = globalThis.__consoleRing;
  if (!Array.isArray(ring)) return;
  if (!brain._statusHistory) {
    brain._statusHistory = [];
    try {
      const prev = fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter((l) => l.startsWith('- '));
      brain._statusHistory = prev.slice(-HISTORY_CAP);
    } catch { /* first boot: no history yet */ }
    brain._statusHistoryAt = 0;
  }
  let added = 0;
  for (const e of ring) {
    if (!e || e.ts <= brain._statusHistoryAt) continue;
    if (e.level !== 'log' || NOTABLE.test(e.line)) {
      brain._statusHistory.push(`- ${_denver(e.ts)} [${e.level}] ${String(e.line).slice(0, 220).replace(/\n/g, ' ')}`);
      added++;
    }
  }
  if (ring.length) brain._statusHistoryAt = Math.max(brain._statusHistoryAt, ring[ring.length - 1].ts || 0);
  if (!added) return;
  if (brain._statusHistory.length > HISTORY_CAP) brain._statusHistory.splice(0, brain._statusHistory.length - HISTORY_CAP);
  const body = `# Unity status history — newest last, capped at ${HISTORY_CAP} lines (one file, never rotated)\n\n${brain._statusHistory.join('\n')}\n`;
  const tmp = HISTORY_FILE + '.tmp';
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, HISTORY_FILE);
}

function startStatusFile(brain) {
  if (process.env.DREAM_STATUS_FILE === '0') return null;
  const tick = () => {
    try { _updateHistory(brain); } catch { /* history is best-effort; the page still writes */ }
    try {
      const body = buildStatus(brain);
      const tmp = STATUS_FILE + '.tmp';
      fs.writeFileSync(tmp, body);
      fs.renameSync(tmp, STATUS_FILE);
    } catch (e) {
      if (!brain._statusFileErrAt || Date.now() - brain._statusFileErrAt > 600000) {
        brain._statusFileErrAt = Date.now();
        console.warn(`[Status] could not write ${STATUS_FILE}: ${e && e.message}`);
      }
    }
  };
  const t = setInterval(tick, INTERVAL_MS);
  if (typeof t.unref === 'function') t.unref();
  setTimeout(tick, 5000).unref?.();
  console.log(`[Status] status page → ${STATUS_FILE} (rewritten every ${Math.round(INTERVAL_MS / 1000)} s; DREAM_STATUS_FILE=0 disables).`);
  return t;
}

module.exports = { startStatusFile, buildStatus, STATUS_FILE, HISTORY_FILE };
