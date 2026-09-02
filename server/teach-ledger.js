// teach-ledger.js — EVERYTHING A CELL EVER TAUGHT, KEPT.
//
// Gee picked this as the first area of the training monitor to build completely:
// **"All of it, not a sample"** — chosen over *what is being sent*, *statistics*
// and *controls*, and it is one of the two the inventory calls a REAL gap rather
// than a drawing job.
//
// ⛔ WHAT WAS ACTUALLY MISSING, precisely. The teach view's COUNTS were never
// sampled — per-lane, per-cell, per-source totals are complete and survive a
// restart. What did not exist is the ability to ask **"show me everything this
// cell ever taught"**: the reading feed is a 400-item ring, and once teaching
// floods it the window covers about forty-five seconds. **A bigger ring is not
// the answer to that question** — the ring is what a human reads live, and an
// unbounded ring at teach rates is a memory leak with a nice name.
//
// ⭐ WHY A LEDGER IS AFFORDABLE, PRICED BEFORE IT WAS BUILT (2026-09-02):
// `teachBus` fires **once per unique item, on rep 0 only** — the comment at its
// call site is explicit that counting per rep would inflate the analytics by the
// dose. So the row count is the number of distinct things taught, not the number
// of Hebbian writes: roughly **3-4 million rows across a full K->PhD walk**
// (~47M corpus words at ~15 words a sentence, plus the definition lanes), which
// is ~465 MB of SQLite. Disk is the cheap axis here; the RAM-resident ring is
// untouched and stays at 400.
//
// ⛔⛔ THE ROW STORES THE TEXT, AND THAT IS A DELIBERATE REFUSAL OF THE OBVIOUS
// SAVING. The text is already on disk in the corpus files, so a row could store
// `(source file, sentence ordinal)` and recover it — at a quarter of the size.
// **That is the position-versus-identity bug this project fixed the same day, in
// the figure lane**: an ordinal into a MUTABLE file silently re-points at
// different content the moment that file is re-ingested, and nothing can detect
// it because the row still looks well-formed. A ledger whose rows quietly change
// meaning is worse than no ledger.
//
// ⚠ WRITES ARE BATCHED, NOT PER-ITEM. A synchronous insert per teach item would
// put disk I/O on the lane whose wall-clock this project has spent weeks
// reducing. Rows accumulate in memory and flush inside one transaction on a
// count or time trigger, and on shutdown.
'use strict';

const path = require('path');

const DB_FILE = path.join(__dirname, 'teach-ledger.db');
const FLUSH_ROWS = 512;
const FLUSH_MS = 5000;
// Same bound the reading ring uses, for the same reason: this is the text a
// human reads back, and an unbounded field invites a single pathological item to
// dominate the file.
const TEXT_CAP = 400;

class TeachLedger {
  constructor() {
    this._db = undefined;      // undefined = not tried, null = unavailable
    this._pending = [];
    this._timer = null;
    this._insert = null;
    this._insertMany = null;
    this._droppedNoDb = 0;
    this._written = 0;
  }

  // ⚠ Lazy and fail-soft in exactly the way the visual store is: a box without
  // the native module must still teach. The difference from a capability
  // fallback is that nothing degrades to a WORSE ledger — there is either a
  // ledger or an honest count of what could not be written.
  db() {
    if (this._db === undefined) {
      try {
        const Database = require('better-sqlite3');
        const db = new Database(DB_FILE);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.exec(`CREATE TABLE IF NOT EXISTS taught (
          n       INTEGER PRIMARY KEY AUTOINCREMENT,
          at      INTEGER NOT NULL,
          cell    TEXT,
          lane    TEXT NOT NULL,
          phase   TEXT,
          source  TEXT,
          reps    INTEGER,
          rel     INTEGER,
          text    TEXT NOT NULL
        )`);
        // The whole point of the ledger is "everything THIS cell taught", so the
        // cell index is not optional — without it every read is a full scan.
        db.exec('CREATE INDEX IF NOT EXISTS taught_cell ON taught (cell, n)');
        this._insert = db.prepare(
          'INSERT INTO taught (at, cell, lane, phase, source, reps, rel, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        );
        this._insertMany = db.transaction((rows) => {
          for (const r of rows) this._insert.run(r.at, r.cell, r.lane, r.phase, r.source, r.reps, r.rel, r.text);
        });
        this._db = db;
      } catch (e) {
        this._db = null;
        console.warn('[TeachLedger] unavailable — nothing taught this boot will be retrievable afterwards:', e?.message || e);
      }
    }
    return this._db;
  }

  // Called from the teach chokepoint. Must never throw into a teach.
  append(row) {
    if (!row) return;
    if (this.db() === null) { this._droppedNoDb++; return; }
    this._pending.push({
      at: row.at || Date.now(),
      cell: row.cell || null,
      lane: row.lane || 'unknown',
      phase: row.phase || null,
      source: row.source || null,
      reps: row.reps == null ? null : (row.reps | 0),
      rel: row.rel == null ? null : (row.rel | 0),
      text: row.text == null ? '' : String(row.text).slice(0, TEXT_CAP),
    });
    if (this._pending.length >= FLUSH_ROWS) { this.flush(); return; }
    if (!this._timer) {
      this._timer = setTimeout(() => { this._timer = null; this.flush(); }, FLUSH_MS);
      // ⚠ Unref'd — a pending ledger flush must never be the reason the process
      // refuses to exit.
      if (typeof this._timer.unref === 'function') this._timer.unref();
    }
  }

  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (!this._pending.length) return 0;
    const db = this.db();
    if (!db) { this._droppedNoDb += this._pending.length; this._pending.length = 0; return 0; }
    const rows = this._pending;
    this._pending = [];
    try {
      this._insertMany(rows);
      this._written += rows.length;
      return rows.length;
    } catch (e) {
      // ⛔ Counted, not swallowed. A ledger that loses rows in silence is the
      // defect class this whole monitor exists to end.
      this._droppedNoDb += rows.length;
      console.warn(`[TeachLedger] flush failed, ${rows.length} row(s) lost:`, e?.message || e);
      return 0;
    }
  }

  // ⭐ THE QUESTION THE RING COULD NOT ANSWER: everything one cell ever taught,
  // paged to the true end, WITH the complete count beside the page so a partial
  // view can never read as the whole.
  page({ cell = null, lane = null, source = null, after = 0, limit = 200 } = {}) {
    const db = this.db();
    if (!db) return { rows: [], total: 0, returned: 0, after, limit, available: false };
    this.flush();
    const lim = Math.max(1, Math.min(2000, limit | 0 || 200));
    const where = [];
    const args = [];
    if (cell) { where.push('cell = ?'); args.push(cell); }
    if (lane) { where.push('lane = ?'); args.push(lane); }
    if (source) { where.push('source = ?'); args.push(source); }
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
    let total = 0;
    try {
      total = db.prepare(`SELECT COUNT(*) AS c FROM taught ${filter}`).get(...args).c | 0;
    } catch { total = 0; }
    const pageWhere = where.concat(['n > ?']);
    const rows = db.prepare(
      `SELECT n, at, cell, lane, phase, source, reps, rel, text FROM taught WHERE ${pageWhere.join(' AND ')} ORDER BY n LIMIT ?`,
    ).all(...args, after | 0, lim);
    return {
      rows, total, returned: rows.length, after: after | 0, limit: lim,
      // The honest end-of-data signal: a client pages until this is false rather
      // than guessing from a short page.
      more: rows.length === lim,
      available: true,
    };
  }

  // Per-cell totals straight from the ledger — the "complete counts beside every
  // paced feed" the dashboard law requires.
  cells() {
    const db = this.db();
    if (!db) return { rows: [], available: false };
    this.flush();
    const rows = db.prepare(
      'SELECT cell, COUNT(*) AS items, MIN(at) AS firstAt, MAX(at) AS lastAt FROM taught WHERE cell IS NOT NULL GROUP BY cell ORDER BY items DESC',
    ).all();
    return { rows, available: true };
  }

  stats() {
    const db = this.db();
    if (!db) {
      return { available: false, written: this._written, pending: this._pending.length, dropped: this._droppedNoDb, total: 0, file: DB_FILE };
    }
    let total = 0;
    try { total = db.prepare('SELECT COUNT(*) AS c FROM taught').get().c | 0; } catch { total = 0; }
    return {
      available: true,
      total,
      written: this._written,
      pending: this._pending.length,
      // ⚠ Surfaced deliberately: a ledger that silently lost rows would let the
      // page claim completeness it does not have.
      dropped: this._droppedNoDb,
      file: DB_FILE,
    };
  }

  close() {
    try { this.flush(); } catch { /* shutdown is best-effort */ }
    try { if (this._db) this._db.close(); } catch { /* already closed */ }
  }
}

module.exports = { TeachLedger, DB_FILE, TEXT_CAP, FLUSH_ROWS, FLUSH_MS };
