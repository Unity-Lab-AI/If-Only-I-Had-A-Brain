// teach-ledger.js — EVERYTHING A CELL EVER TAUGHT, KEPT.
//
// The first area of the training monitor built completely, and the standard is
// **all of it, not a sample** — chosen ahead of *what is being sent*,
// *statistics* and *controls* because it is one of only two the inventory calls
// a REAL gap rather than a drawing job.
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

  // ⭐⭐ THE EXPORT SUMMARY — a cell's FULL taught-content record, shaped so it
  // can be diffed OFFLINE against the per-cell source table in the curriculum
  // gap ledger. That document says what a cell must hold and which source must
  // close the difference; this says what the cell actually taught, broken down
  // the same way.
  //
  // ⛔ THE WORD COUNT IS A FLOOR AND THE ROW SAYS SO. Text is stored capped, so
  // any item longer than the cap contributes only its first cap characters.
  // `truncated` is returned beside `words` for exactly that reason — a count
  // that silently understates is the instrument-that-lies defect, and a count
  // that names its own floor is evidence.
  //
  // ⚠ Words are whitespace-delimited runs, counted in SQL — the same definition
  // the corpus ingest uses when it reports a cell's word total, which is the
  // number this export exists to be compared against.
  summary({ cell = null } = {}) {
    const db = this.db();
    // Same field set on both paths, so a reader never has to branch on
    // availability to know which keys exist.
    if (!db) return { cell, available: false, items: 0, words: 0, truncated: 0, firstAt: 0, lastAt: 0, textCap: TEXT_CAP, bySource: [], byLane: [], byPhase: [] };
    this.flush();
    const where = cell ? 'WHERE cell = ?' : '';
    const args = cell ? [cell] : [];
    // TRIM first so a leading/trailing space cannot invent a word; the empty
    // case is stated explicitly because `LENGTH('') - LENGTH('') + 1` is 1.
    const WORDS = "SUM(CASE WHEN TRIM(text) = '' THEN 0 ELSE LENGTH(TRIM(text)) - LENGTH(REPLACE(TRIM(text), ' ', '')) + 1 END)";
    const group = (col) => {
      try {
        return db.prepare(
          `SELECT ${col} AS key, COUNT(*) AS items, ${WORDS} AS words, MIN(at) AS firstAt, MAX(at) AS lastAt
           FROM taught ${where} GROUP BY ${col} ORDER BY items DESC`,
        ).all(...args);
      } catch { return []; }
    };
    let totals = { items: 0, words: 0, truncated: 0, firstAt: 0, lastAt: 0 };
    try {
      const r = db.prepare(
        `SELECT COUNT(*) AS items, ${WORDS} AS words,
                SUM(CASE WHEN LENGTH(text) >= ${TEXT_CAP} THEN 1 ELSE 0 END) AS truncated,
                MIN(at) AS firstAt, MAX(at) AS lastAt
         FROM taught ${where}`,
      ).get(...args);
      totals = {
        items: r.items | 0,
        words: r.words | 0,
        truncated: r.truncated | 0,
        firstAt: r.firstAt || 0,
        lastAt: r.lastAt || 0,
      };
    } catch { /* an unreadable summary reports zeros rather than inventing rows */ }
    return {
      cell,
      available: true,
      ...totals,
      textCap: TEXT_CAP,
      bySource: group('source'),
      byLane: group('lane'),
      byPhase: group('phase'),
    };
  }

  // The evidence behind the summary, streamed rather than materialised. A cell
  // can hold hundreds of thousands of rows and this runs on the same process
  // that teaches — building one array of them is how a monitor becomes the
  // outage it was built to detect.
  *iterate({ cell = null, lane = null, source = null } = {}) {
    const db = this.db();
    if (!db) return;
    this.flush();
    const where = [];
    const args = [];
    if (cell) { where.push('cell = ?'); args.push(cell); }
    if (lane) { where.push('lane = ?'); args.push(lane); }
    if (source) { where.push('source = ?'); args.push(source); }
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const stmt = db.prepare(
      `SELECT n, at, cell, lane, phase, source, reps, rel, text FROM taught ${filter} ORDER BY n`,
    );
    yield* stmt.iterate(...args);
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

/**
 * ⏱ THE RETENTION SERIES — because the console ring holds about four minutes.
 *
 * ⛔ THE PROBLEM IS NOT HYPOTHETICAL AND IT COST SOMETHING TODAY. The walk runs
 * for weeks and the interesting evidence is usually hours old by the time anyone
 * wants it, but the ring rotates in minutes: the boot line proving the glyph pass
 * had run was already gone when it was looked for, and a wedge's own lane line
 * was lost the same way. **Everything the dashboard shows is instantaneous, so a
 * question about what happened an hour ago has no surface at all.**
 *
 * ⭐ The ledger beside this answers *"what did she TEACH"*. This answers *"what
 * was the machine DOING"* — one sampled row of live counters, so the shape of a
 * stall, a ramp or a queue draining is readable after the fact instead of only
 * while it happens.
 *
 * ⚠ BOUNDED BY ROW COUNT, PRUNED ON WRITE. An append-only diagnostic that grows
 * with uptime is one that eventually fills the disk on the box that also hosts
 * the lab's git — the same shared-host reasoning as the memory reserve. At the
 * default sample gap this keeps roughly a week and then discards oldest-first.
 *
 * ⚠ Fail-soft in the same way as the ledger: a box without the native module
 * still teaches, and the failure is COUNTED rather than silent.
 */
// ⛔⛔ THE GAP IS DERIVED FROM THE WALK LENGTH, AND AT 30 s IT WAS NOT.
//
// This ring exists so a WEEKS-LONG walk can be read back after the fact. At a
// 30 s gap, 20,000 rows is ~6.9 days — its own comment said "roughly a week" —
// against a walk priced at **~24 days** of structure refresh. So the ring filled
// about a third of the way through a run and then discarded oldest-first,
// silently throwing away THE START OF THE WALK: exactly the evidence a
// long-run instrument is kept for, and the loss is invisible because a full
// ring and a correct ring look identical.
//
//   24 days = 2,073,600 s ;  20,000 rows  ->  103.7 s per sample
//
// 120 s covers **27.8 days** with ~16% headroom, at ~20 MB on disk — the axis
// this project has repeatedly established is the cheap one.
//
// ⚠ A SHORTER GAP DOES NOT BUY DETAIL, IT BUYS A SHORTER MEMORY. The signal
// this ring is for is a stall, and the stalls of interest run tens of minutes
// (the recorded wedges are 31 min and ~116 min), so 2 min resolves them with
// ~15x margin. Sub-two-minute detail belongs to the client-side throughput
// trace, which is deliberately a different instrument with a different lifetime.
// Full arithmetic in `docs/THRESHOLD-DERIVATION.md`.
const SERIES_MAX_ROWS = 20000;      // 27.8 days at the 120s gap below
const SERIES_GAP_MS = 120000;

class TeachSeries {
  constructor(ledger) {
    this._ledger = ledger;          // shares the ledger's database file and handle
    this._ready = undefined;
    this._insert = null;
    this._lastAt = 0;
    this._written = 0;
    this._dropped = 0;
  }

  _init() {
    if (this._ready !== undefined) return this._ready;
    const db = this._ledger && this._ledger.db();
    if (!db) { this._ready = null; return null; }
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS series (
        n    INTEGER PRIMARY KEY AUTOINCREMENT,
        at   INTEGER NOT NULL,
        json TEXT NOT NULL
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS series_at ON series (at)');
      this._insert = db.prepare('INSERT INTO series (at, json) VALUES (?, ?)');
      this._prune = db.prepare('DELETE FROM series WHERE n <= (SELECT MAX(n) FROM series) - ?');
      this._ready = db;
    } catch (e) {
      this._ready = null;
      console.warn('[TeachSeries] unavailable — nothing about this boot will be readable after it ends:', e?.message || e);
    }
    return this._ready;
  }

  /**
   * Record one sample. Rate-limited internally, so a caller may invoke this as
   * often as it likes — the heartbeat is the natural site and it fires every 10s
   * against a 30s gap.
   */
  sample(obj, now = Date.now()) {
    if (!obj) return false;
    if (now - this._lastAt < SERIES_GAP_MS) return false;
    const db = this._init();
    if (!db) { this._dropped += 1; return false; }
    try {
      this._insert.run(now, JSON.stringify(obj));
      this._lastAt = now;
      this._written += 1;
      // Prune on a cadence rather than every write — the delete is a scan and
      // paying it 20,000 times to stay exactly at the cap buys nothing.
      if (this._written % 200 === 0) { try { this._prune.run(SERIES_MAX_ROWS); } catch { /* nf */ } }
      return true;
    } catch { this._dropped += 1; return false; }
  }

  /** Newest-first window, for a reader asking what happened around some time. */
  range({ since = 0, until = 0, limit = 500 } = {}) {
    const db = this._init();
    if (!db) return { available: false, rows: [], total: 0 };
    try {
      const lim = Math.max(1, Math.min(5000, limit | 0));
      const u = until > 0 ? until : Date.now();
      const rows = db.prepare('SELECT at, json FROM series WHERE at >= ? AND at <= ? ORDER BY at DESC LIMIT ?')
        .all(since | 0, u, lim)
        .map((r) => { try { return { at: r.at, ...JSON.parse(r.json) }; } catch { return { at: r.at }; } });
      const total = db.prepare('SELECT COUNT(*) c FROM series WHERE at >= ? AND at <= ?').get(since | 0, u).c;
      // ⚠ `total` beside `returned` for the same reason the ledger carries it:
      // a window that shows part of something while reading as the whole is the
      // defect this whole instrument family exists to end.
      return { available: true, rows, returned: rows.length, total, more: total > rows.length };
    } catch { return { available: false, rows: [], total: 0 }; }
  }

  stats() {
    const db = this._init();
    if (!db) return { available: false, written: this._written, dropped: this._dropped };
    try {
      const r = db.prepare('SELECT COUNT(*) c, MIN(at) a, MAX(at) b FROM series').get();
      return {
        available: true, rows: r.c, oldestAt: r.a || null, newestAt: r.b || null,
        spanMs: (r.a && r.b) ? (r.b - r.a) : 0,
        written: this._written, dropped: this._dropped,
        capRows: SERIES_MAX_ROWS, gapMs: SERIES_GAP_MS,
      };
    } catch { return { available: false, written: this._written, dropped: this._dropped }; }
  }
}

module.exports = { TeachLedger, TeachSeries, DB_FILE, TEXT_CAP, FLUSH_ROWS, FLUSH_MS, SERIES_MAX_ROWS, SERIES_GAP_MS };
