/**
 * server/loop-watchdog.js — LOOPNAME.8: eyes that are NOT on the loop.
 *
 * Everything the brain owns for diagnosis rides the main event loop: the admin
 * WebSocket, `/public-state.json`, the console ring, and the `[EventLoop] BLOCKED`
 * warn itself. That warn is a `setInterval` on the loop it is measuring, so it can
 * only ever print AFTER the block ends — a freeze that never returns leaves no
 * line at all. LOOPNAME.7 answered half of it by writing `.last-breadcrumb.json`
 * synchronously on every phase change, which survives a hard freeze or an OOM
 * kill. But a breadcrumb is post-mortem: it says where she WAS, never that she is
 * stuck right now, and never for how long.
 *
 * This is the other half, and it has to live on a different event loop to exist at
 * all. The main thread stamps a monotonic-ish heartbeat into a SharedArrayBuffer;
 * this worker polls that stamp on ITS OWN loop. When the stamp stops advancing,
 * the main loop is blocked AT THIS MOMENT, and this thread is still running and
 * still able to say so.
 *
 * ── THE TRAP THIS FILE HAS TO AVOID ──
 *
 * A worker's `console.log` / `process.stdout.write` is NOT a direct write. Node
 * pipes worker stdio to the parent thread and the parent's event loop drains it —
 * the loop this worker exists to report on. Logging the ordinary way would queue
 * every freeze line behind the freeze and flush them all after recovery, which is
 * precisely the failure being fixed, reintroduced by the fix. So every byte this
 * file emits goes through `fs.writeSync` on a raw file descriptor, which is a
 * plain `write(2)` syscall issued by this thread and owes the parent loop nothing.
 * `fs.writeFileSync` is the same deal, so the JSON artifact is safe too.
 *
 * Deliberately NOT included: an HTTP port for live querying. It would be the
 * nicest version of this — curl the freeze state while she is pinned — but the
 * public vhost forwards only known routes, so a new port would be unreachable
 * from outside and I would be shipping something I could not verify. Raw-fd log
 * plus a synchronous JSON artifact are both checkable on the box.
 *
 * Cost: one V8 isolate (~10-15MB) and a 500ms poll that does an `Atomics.load`
 * and a subtraction. It writes nothing while the loop is healthy.
 */

'use strict';

const fs = require('fs');
const { workerData } = require('worker_threads');

// Slot layout of the shared heartbeat (BigInt64Array). Atomics requires an
// integer-typed array, and millisecond timestamps overflow Int32, so BigInt64 is
// the only correct width here.
//   [0] main-thread heartbeat, ms since epoch — written by the lag sampler
//   [1] main-thread boot time, ms since epoch — written once at spawn
//   [2] freeze episodes this session — written by THIS thread
//   [3] worst freeze observed, ms          — written by THIS thread
const HB = 0;
const BOOT = 1;
const COUNT = 2;
const WORST = 3;

const beat = new BigInt64Array(workerData.sab);
const POLL_MS = Number(workerData.pollMs) || 500;
const WARN_MS = Number(workerData.warnMs) || 5000;
const REPEAT_MS = Number(workerData.repeatMs) || 10000;
const freezeFile = workerData.freezeFile;
const breadcrumbFile = workerData.breadcrumbFile;

// Raw fd write. fd 2 (stderr) so freeze reporting cannot be lost to stdout
// buffering, and so it lands in journalctl beside the brain's own warns.
function emit(line) {
  try { fs.writeSync(2, line + '\n'); } catch { /* nothing left to report with */ }
}

// The phase label is a string, and marshalling strings through a SharedArrayBuffer
// is all cost and no benefit when the main thread is already writing exactly this
// on every phase change — synchronously, for exactly this reason. Reading
// LOOPNAME.7's artifact reuses that work instead of duplicating it, and it is a
// plain readFileSync from this thread, so a jammed parent loop cannot block it.
function lastBreadcrumb() {
  try {
    const b = JSON.parse(fs.readFileSync(breadcrumbFile, 'utf8'));
    return `phase="${b.phase}" cell=${b.cell || '(none)'} donors=${b.donors} rssMB=${b.rssMB} breadcrumbAt=${b.at}`;
  } catch {
    return 'phase=(no breadcrumb on disk yet)';
  }
}

let inFreeze = false;
let freezeStartedAt = 0;
let lastRepeatAt = 0;
let lastSeenBeat = 0n;

emit(`[LoopWatchdog] LOOPNAME.8 armed on a separate thread — polling the main loop every ${POLL_MS}ms, `
  + `reporting a stall past ${WARN_MS}ms and re-reporting every ${REPEAT_MS}ms while it lasts. `
  + `This thread writes stderr with raw fs.writeSync, so its lines are NOT queued behind the loop it watches.`);

setInterval(() => {
  const now = Date.now();
  const hb = Atomics.load(beat, HB);
  if (hb === 0n) return;                     // main thread has not stamped yet
  const staleMs = now - Number(hb);

  if (staleMs >= WARN_MS) {
    if (!inFreeze) {
      inFreeze = true;
      freezeStartedAt = now - staleMs;
      lastRepeatAt = 0;
      Atomics.add(beat, COUNT, 1n);
      emit(`[LoopWatchdog] ⛔ MAIN LOOP STALLED — no heartbeat for ${staleMs}ms AND IT IS STILL STALLED. `
        + `This line is being written WHILE it happens; the main loop's own [EventLoop] BLOCKED warn cannot print until it recovers. ${lastBreadcrumb()}`);
    }
    if (now - lastRepeatAt >= REPEAT_MS) {
      lastRepeatAt = now;
      // Only the artifact needs rewriting on each repeat — it is the thing a
      // never-returning freeze leaves behind for the next boot to read.
      try {
        fs.writeFileSync(freezeFile, JSON.stringify({
          state: 'STALLED',
          observedAt: new Date(now).toISOString(),
          stalledForMs: staleMs,
          stalledSinceApprox: new Date(freezeStartedAt).toISOString(),
          mainUptimeSAtStall: Math.round((freezeStartedAt - Number(Atomics.load(beat, BOOT))) / 1000),
          episodesThisSession: Number(Atomics.load(beat, COUNT)),
          worstMsThisSession: Number(Atomics.load(beat, WORST)),
          breadcrumb: lastBreadcrumb(),
          note: 'LOOPNAME.8 — written by a WATCHDOG THREAD, not the main loop. If state is still STALLED on the next boot, '
            + 'the process never recovered from this stall and stalledForMs is the last measurement before it died.',
        }, null, 2));
      } catch { /* the watchdog never becomes the failure */ }
      if (staleMs >= WARN_MS + REPEAT_MS) {
        emit(`[LoopWatchdog] ⛔ still stalled — ${Math.round(staleMs / 1000)}s and counting. ${lastBreadcrumb()}`);
      }
    }
    return;
  }

  if (inFreeze) {
    // Recovery. The duration is measured from the last good heartbeat to the one
    // that just landed, so it does not include this thread's own poll slack.
    const heldMs = Number(Atomics.load(beat, HB)) - freezeStartedAt;
    const dur = heldMs > 0 ? heldMs : (now - freezeStartedAt);
    if (BigInt(Math.round(dur)) > Atomics.load(beat, WORST)) {
      Atomics.store(beat, WORST, BigInt(Math.round(dur)));
    }
    inFreeze = false;
    emit(`[LoopWatchdog] ✓ main loop RECOVERED after ${Math.round(dur)}ms `
      + `(episode ${Number(Atomics.load(beat, COUNT))} this session, worst ${Number(Atomics.load(beat, WORST))}ms).`);
    try {
      fs.writeFileSync(freezeFile, JSON.stringify({
        state: 'RECOVERED',
        observedAt: new Date(now).toISOString(),
        lastStallMs: Math.round(dur),
        stalledFrom: new Date(freezeStartedAt).toISOString(),
        episodesThisSession: Number(Atomics.load(beat, COUNT)),
        worstMsThisSession: Number(Atomics.load(beat, WORST)),
        breadcrumb: lastBreadcrumb(),
        note: 'LOOPNAME.8 — the main loop came back. A RECOVERED state here means the stall ended; a STALLED state '
          + 'left on disk across a reboot means it did not.',
      }, null, 2));
    } catch { /* non-fatal */ }
  }
  lastSeenBeat = hb;
}, POLL_MS);
