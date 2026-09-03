// figure-queue.js — EVERY ILLUSTRATION GETS SEEN, AND EACH ONE KEEPS ITS TEXT.
//
// Gee: *"we need to make sure we use all illistrations and figures in all corpus
// so Unity can see them and they are converted in topo coeffient wavelets as we
// do it"*, *"all illistrastions shall always be direclty connected and trained to
// the text that refrences them"*, and on the design fork: **option 1 — the
// background lane — *"but they have to link to thhe text corrctly"*.**
//
// ⛔ THE MEASUREMENT THAT FORCED THIS. Figures were perceived INLINE in the cell
// pass, bounded to `DREAM_TEXTFIG_PER_CELL` (6) per visit. With 37,592 figures
// on disk that is not a cap, it is a ceiling on what she can ever see:
//
//     math/grade10      2,769 figures  ->  462 cell visits to finish
//     genered/college3  1,542 figures  ->  257
//     science/grade11   1,397 figures  ->  233
//     median cell          13 visits         WORST 462
//
// A cell is visited a handful of times in a walk, never hundreds. **The resume
// cursor fixed "the same 24 forever"; it could not fix "6 per visit times few
// visits".** The richest cells would have shown a fraction of a percent.
//
// ⭐ SO PERCEPTION COMES OFF THE CELL PASS. The pass enqueues the cell's figures
// — a metadata insert, microseconds — and a background drain works through them
// steadily. No cell pass is ever pinned, the walk's wall clock is unchanged, and
// every figure is eventually seen.
//
// ⛔⛔ AND THE LINKAGE IS THE WHOLE POINT, SO IT IS CARRIED, NEVER LOOKED UP.
// Each row holds the figure's OWN `alt`, `caption`, `context` (the corpus prose
// it sits inside) and `theme`. `_perceiveTextbookFigure` builds its phrase from
// exactly those fields and keys the percept on the theme it is HANDED —
// **nothing about it reads ambient state**, which is why a figure perceived an
// hour after its prose binds identically to one perceived inline.
//
// ⚠ That is not an accident of this design, it is the `CAMPOISON` fix holding:
// an unlabelled frame that fuses with "whatever word is current" is precisely
// the defect that made a webcam placeholder become her memory of a word. A
// deferred lane would re-open it instantly if the binding were resolved at
// perception time instead of travelling with the row.
'use strict';

const path = require('path');

const DB_FILE = path.join(__dirname, 'figure-queue.db');

// A stable identity for a figure, from its own address. ⛔ Not its position in
// any list — an index re-points at a different picture the moment a cell is
// re-ingested, which is the bug the figure key already carried once today.
//
// ⭐ ONE OWNER. This rule used to be written out here in full, in a second
// arithmetic form than the producer's, and in three other files besides. The
// forms were proven to agree over every URL in the corpus before they were
// merged — but two copies agreeing today is not one copy.
const { figKeyOf: figKey } = require('../js/brain/figure-identity.cjs');

class FigureQueue {
  constructor() {
    this._db = undefined;
    this._ins = null;
    this._insMany = null;
  }

  db() {
    if (this._db === undefined) {
      try {
        const Database = require('better-sqlite3');
        const db = new Database(DB_FILE);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.exec(`CREATE TABLE IF NOT EXISTS figq (
          k        TEXT PRIMARY KEY,
          url      TEXT NOT NULL,
          alt      TEXT,
          caption  TEXT,
          context  TEXT,
          theme    TEXT,
          subject  TEXT,
          grade    TEXT,
          state    TEXT NOT NULL DEFAULT 'pending',
          tries    INTEGER NOT NULL DEFAULT 0,
          lastErr  TEXT,
          at       INTEGER NOT NULL
        )`);
        db.exec('CREATE INDEX IF NOT EXISTS figq_state ON figq (state, at)');
        this._ins = db.prepare(`INSERT OR IGNORE INTO figq
          (k, url, alt, caption, context, theme, subject, grade, state, tries, at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`);
        this._insMany = db.transaction((rows) => {
          let added = 0;
          for (const r of rows) added += this._ins.run(r.k, r.url, r.alt, r.caption, r.context, r.theme, r.subject, r.grade, r.at).changes;
          return added;
        });
        this._db = db;
      } catch (e) {
        this._db = null;
        console.warn('[FigureQueue] unavailable — figures will NOT be perceived this boot:', e?.message || e);
      }
    }
    return this._db;
  }

  // ⚠ INSERT OR IGNORE on the figure's own key, so re-teaching a cell does not
  // re-queue what is already banked or already waiting. Idempotent by
  // construction rather than by a caller remembering to check.
  enqueueCell(subject, grade, figures) {
    const db = this.db();
    if (!db || !Array.isArray(figures) || !figures.length) return 0;
    const now = Date.now();
    const rows = [];
    for (const f of figures) {
      const url = f && (f.url || f.src);
      if (!url) continue;
      const theme = f.theme || `${subject}/${grade}`;
      rows.push({
        k: `${theme}-${figKey(url)}`,
        url: String(url),
        alt: f.alt == null ? '' : String(f.alt).slice(0, 500),
        caption: f.caption == null ? '' : String(f.caption).slice(0, 500),
        // ⭐ THE LINK. The corpus prose this picture sits inside, cleaned by the
        // same cleaner that produced the cell's sentences — so the figure's text
        // and the cell's story are the SAME STRINGS, and the tie between them is
        // a match rather than an inference.
        context: f.context == null ? '' : String(f.context).slice(0, 900),
        theme,
        subject: String(subject || ''),
        grade: String(grade || ''),
        at: now,
      });
    }
    if (!rows.length) return 0;
    try { return this._insMany(rows); } catch (e) {
      console.warn('[FigureQueue] enqueue failed:', e?.message || e);
      return 0;
    }
  }

  // One pending figure, oldest first, so a cell taught earlier is seen earlier.
  next() {
    const db = this.db();
    if (!db) return null;
    try {
      return db.prepare("SELECT * FROM figq WHERE state = 'pending' ORDER BY at, rowid LIMIT 1").get() || null;
    } catch { return null; }
  }

  markDone(k, outcome) {
    const db = this.db();
    if (!db) return;
    // ⚠ `held` and `seen` are kept apart from `done` so the counts can answer
    // "how many did she actually perceive" separately from "how many were
    // already in the store". Collapsing them would make a resumed run look like
    // a productive one.
    try { db.prepare('UPDATE figq SET state = ?, lastErr = NULL WHERE k = ?').run(outcome || 'seen', k); } catch { /* nf */ }
  }

  // ⛔ A FAILURE IS RECORDED WITH ITS REASON AND RETRIED A BOUNDED NUMBER OF
  // TIMES, NEVER DROPPED SILENTLY. A figure that 404s forever must stop costing
  // fetches, and a figure that failed once to a transient must not be lost —
  // those are different outcomes and this keeps them apart.
  markFailed(k, reason, maxTries = 3) {
    const db = this.db();
    if (!db) return;
    try {
      const row = db.prepare('SELECT tries FROM figq WHERE k = ?').get(k);
      const tries = ((row && row.tries) | 0) + 1;
      const state = tries >= maxTries ? 'failed' : 'pending';
      db.prepare('UPDATE figq SET state = ?, tries = ?, lastErr = ? WHERE k = ?')
        .run(state, tries, String(reason || '').slice(0, 300), k);
    } catch { /* nf */ }
  }

  stats() {
    const db = this.db();
    if (!db) return { available: false, pending: 0, seen: 0, held: 0, failed: 0, total: 0 };
    try {
      const rows = db.prepare('SELECT state, COUNT(*) AS c FROM figq GROUP BY state').all();
      const s = { available: true, pending: 0, seen: 0, held: 0, failed: 0, total: 0 };
      for (const r of rows) { s[r.state] = r.c; s.total += r.c; }
      return s;
    } catch { return { available: false, pending: 0, seen: 0, held: 0, failed: 0, total: 0 }; }
  }

  close() { try { if (this._db) this._db.close(); } catch { /* nf */ } }
}

module.exports = { FigureQueue, DB_FILE, figKey };
