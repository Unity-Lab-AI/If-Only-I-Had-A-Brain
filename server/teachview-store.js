// teachview-store.js — THE TEACH VIEW SURVIVES A RESTART.
//
// ⛔ THE DEFECT THIS CLOSES: the walk runs for WEEKS and the interesting
// evidence is usually hours old by the time anyone wants it. `curriculum
// ._teachView` lives entirely in memory — counters plus a 400-entry reading
// ring — so every reboot reset the totals to zero and dropped the ring. The
// console ring holds ~4 minutes and rotates, which is how one question's own
// lane line was lost, and this was the same hole one layer up.
//
// ⚠ IT IS THE SERVER'S JOB, NOT THE CURRICULUM'S. `js/brain/curriculum.js` is
// ALSO browser-bundled, so it must never import `fs` — the same reason
// `academicStorySentences`, `lookupDefinition` and `perceiveTextbookFigure` are
// attached onto the cluster from here rather than imported there. `teachBus`
// stays exactly what its own contract promises: a counter bump and a ring write,
// no I/O, no stringify, no await, on the loop the donor socket shares.
//
// ⛔⛔ `ringSeq` MUST SURVIVE, AND THAT IS THE ONE THING A NAIVE SNAPSHOT GETS
// WRONG. The state publish sends only ring rows with `r.n > since`, where
// `since` is a sequence number the client is holding. If a reboot restarted the
// counter at 0, every row it then produced would have `n` BELOW the client's
// `since` — so a viewer that had been watching before the restart would see an
// empty feed forever and read it as "nothing is being taught". Restoring the
// sequence is not bookkeeping; it is the difference between a live instrument
// and a silent one.
//
// ⚠ TOTALS ACCUMULATE ACROSS RESTARTS BY DESIGN — that is the whole point of
// retention on a walk measured in weeks — while `startedAt` keeps the ORIGINAL
// start so a rate over the whole walk stays computable, and `resumedAt` records
// this boot separately rather than overwriting it.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'teachview-state.json');

// The ring is capped at 400 live; persisting the whole of it is ~120 KB of JSON
// at the 400-char text cap, which is fine at this cadence. The cap is repeated
// here rather than imported because the curriculum is ESM and this is CJS, and
// a mismatch is visible: a restored ring longer than the live cap is trimmed by
// the next `teachBus` call anyway.
const RING_CAP = 400;
const VERSION = 1;

/**
 * Read the persisted teach view. Returns null when there is nothing to restore
 * — an absent file is a fresh walk, not a failure, and is reported as such by
 * the caller rather than warned about here.
 */
function load() {
  let raw;
  try {
    raw = fs.readFileSync(FILE, 'utf8');
  } catch (e) {
    // ENOENT is the normal first-boot case. Anything else is worth seeing,
    // because a teach view that silently fails to restore looks exactly like a
    // walk that has taught nothing.
    if (!(e && e.code === 'ENOENT')) {
      console.warn(`[TeachView] could not read ${path.basename(FILE)}: ${e.message}`);
    }
    return null;
  }
  try {
    const j = JSON.parse(raw);
    if (!j || j.version !== VERSION) {
      console.warn(`[TeachView] ignoring ${path.basename(FILE)} — version ${j && j.version} != ${VERSION}`);
      return null;
    }
    return j;
  } catch (e) {
    console.warn(`[TeachView] ${path.basename(FILE)} is unparseable, starting fresh: ${e.message}`);
    return null;
  }
}

/**
 * Merge a persisted snapshot INTO a live `_teachView`. Called once, at boot,
 * after the Curriculum is constructed and before any teaching runs.
 *
 * ⚠ MERGE, NOT REPLACE. The live object may already carry a few events from
 * construction-time lanes; overwriting it would discard them and would also
 * mean the restore path behaves differently depending on how early it ran.
 */
function restoreInto(tv, saved) {
  if (!tv || !saved) return null;
  tv.total = (tv.total | 0) + (saved.total | 0);
  for (const k of ['byLane', 'bySource']) {
    for (const [name, n] of Object.entries(saved[k] || {})) {
      tv[k][name] = (tv[k][name] || 0) + (n | 0);
    }
  }
  for (const [cell, c] of Object.entries(saved.byCell || {})) {
    const live = tv.byCell[cell] || (tv.byCell[cell] = { items: 0, words: 0, lanes: Object.create(null) });
    live.items += (c.items | 0);
    live.words += (c.words | 0);
    for (const [lane, n] of Object.entries(c.lanes || {})) {
      live.lanes[lane] = (live.lanes[lane] || 0) + (n | 0);
    }
  }
  // ⛔ The sequence continues from the highest number ever issued — see the
  // header. `Math.max` rather than assignment, so a snapshot older than the
  // live object can never wind the counter backwards.
  tv.ringSeq = Math.max(tv.ringSeq | 0, saved.ringSeq | 0);
  if (Array.isArray(saved.ring) && saved.ring.length) {
    tv.ring = saved.ring.concat(tv.ring).slice(-RING_CAP);
  }
  if (Array.isArray(saved.flags) && saved.flags.length) {
    tv.flags = saved.flags.concat(tv.flags);
  }
  // The original start of the walk, not this boot's.
  if (saved.startedAt) tv.startedAt = Math.min(tv.startedAt || saved.startedAt, saved.startedAt);
  if (saved.lastAt) tv.lastAt = Math.max(tv.lastAt | 0, saved.lastAt | 0);
  tv.resumedAt = Date.now();
  tv.restoredFrom = { total: saved.total | 0, ring: (saved.ring || []).length, writtenAt: saved.writtenAt || null };
  return tv.restoredFrom;
}

/**
 * Snapshot a live `_teachView` to disk.
 *
 * ⛔ ATOMIC, via a pid-suffixed temp sibling and a rename. A teach view is
 * written on a timer while the process is also teaching; a torn file would be
 * unparseable at the next boot and would silently reset the very totals this
 * module exists to preserve. A rename cannot leave a half-written file.
 */
function save(tv) {
  if (!tv) return false;
  const doc = {
    version: VERSION,
    writtenAt: new Date().toISOString(),
    total: tv.total | 0,
    byLane: tv.byLane,
    byCell: tv.byCell,
    bySource: tv.bySource,
    ringSeq: tv.ringSeq | 0,
    startedAt: tv.startedAt || null,
    lastAt: tv.lastAt || null,
    // Flags are rules that stay up until cleared, so they are worth keeping;
    // bounded because an uncleared flag rule could otherwise grow forever.
    flags: Array.isArray(tv.flags) ? tv.flags.slice(-100) : [],
    ring: Array.isArray(tv.ring) ? tv.ring.slice(-RING_CAP) : [],
  };
  const tmp = `${FILE}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(doc), 'utf8');
    fs.renameSync(tmp, FILE);
    return true;
  } catch (e) {
    console.warn(`[TeachView] snapshot failed: ${e.message}`);
    try { fs.unlinkSync(tmp); } catch { /* temp may not exist */ }
    return false;
  }
}

module.exports = { load, save, restoreInto, FILE, RING_CAP, VERSION };
