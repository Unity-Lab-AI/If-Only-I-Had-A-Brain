// ServerBrain visual-memory mixin — the grounding layer that makes the
// mind's eye IMAGINATION instead of a de-novo renderer. Attached to
// ServerBrain.prototype via Object.assign at brain-server.js entry-point
// bottom (same per-concern pattern as chat.js / gpu.js / state.js).
//
// ARCHITECTURE (perception → memory → recall):
//   1. SEEING — clients ship what Unity's eyes actually receive (camera
//      frames, generated images she makes) as tiny ≤96×96 RGBA frames over
//      WS ('visual_frame'). The server equationalizes each frame into a
//      field C (CDF 9/7 YCbCr — full color) via the mind-space perceive path.
//   2. BINDING — the field C is stored keyed to the CONCEPT WORDS active
//      when she saw it: the frame's label (image prompt) when present, or
//      what she is thinking right now (inner-thought chain / global-workspace
//      broadcast) for unlabeled camera frames — sight fuses with the word
//      being "heard", the way infant perception grounds vocabulary.
//   3. IMAGINING — at imagine-time (_imagineTick / IMG-SEE preview), the
//      thought's words are looked up here FIRST. One match → she re-sees
//      the stored percept — the single strongest ACCURATE one. (The old
//      two-match morphField overlay was REMOVED by operator directive —
//      superimposing two seen frames is noise static, not imagination.)
//   Equational end-to-end: pixels → forward CDF 9/7 → sparse field C →
//   (morph) → inverse CDF 9/7 at the viewer. No text-AI, no picture library.
//
// BOUNDS: frames hard-capped 96×96 (engine nanometer caution), per-frame
// pacing 2s, store LRU-capped at VM_CAP concepts, persisted to
// server/visual-memory.json (debounced 30s, atomic tmp+rename) so what she
// has seen survives restart — same medium pattern as mindspace-memory.json.

const fs = require('fs');
const path = require('path');

// SEE.2 — store bumped to v2: the v1 file was poisoned by dead-air placeholder
// frames (a virtual cam's static "no signal" graphic bound itself to dozens of
// concepts because unlabeled camera frames bind to whatever she's thinking) and
// by green-screen-era captures. The rename orphans the polluted store — her
// eyes start clean under the new gates. v1 stays on disk, unused.
// 2026-07-15 — bumped to v3: the v2 store cached MONOCHROME references (old
// "simple ... high contrast" prompt → black-on-white line drawings), whose field
// renders looked like white pencil, which was ruled out entirely. v3 orphans those
// so she re-grounds every concept with the new COLOURFUL reference prompt. v2 stays
// on disk, unused.
// 2026-08-21 — bumped to v4 (the one-time clear, operator-requested): everything
// in v3 was learned under the pre-PAINT pipeline — v1 schemas with no contours,
// scratch-era constructions — and the LOOKEYES + PAINT batches changed what a
// look BANKS (contours, fillable outlines, v2 schemas). v4 starts her mind's-eye
// imagery empty so every concept re-grounds through the FIXED look lane; the
// brain weights / grades / phases / episodic memory live in entirely different
// files and are untouched — imagery cleared, training kept, same contract as
// the v1→v2→v3 bumps before it. v3 stays on disk, unused, and the FRESHEYES
// pattern sweep (`visual-memory*`) covers v4 on future fresh walks automatically.
// VMSCALE (2026-08-21) — the v4 store is SQLITE, not JSON (see the mixin header:
// monolithic JSON measured at 761ms pins @10k entries and hard-fails @100k).
// The v4 json name never shipped a boot, so nothing migrates; v1-v3 json stay
// on disk, orphaned. FRESHEYES sweeps `visual-memory*` by pattern (json AND db).
// v8 → v9 (2026-08-21, on an instruction to clear the visual memory again)
// — v8's session predates COLORLINE (color-true outlines), the trace
// scenery filter, BGPART (backdrop cells paint no mass) and STYLECULL; v9
// boots at 0 seen / 0 drawn behind the full stack. (v8 was the pre-BLOBSTORE
// base64 era's replacement; v7/v6 earlier eras.) Training untouched.
// v9 → v10 (2026-08-26, on an instruction to clear the LOCAL visual memory too,
// so that a fixed mind's eye is not left holding a hundred stale images of one
// subject) — v9 was banked
// by the PRE-EYEPIN subject picker, which drew whatever sat at the tail of
// `_innerThoughtChain` and so hammered ONE concept for as long as that thought
// dwelled: 8 of 8 sampled frames were `backpack`, and before that `church`,
// against only 21 grounded concepts across 6,750 draws. ⭐ The store is
// therefore not merely stale, it is UNREPRESENTATIVE — a pile of near-duplicate
// renders of a handful of subjects, which is exactly what the acquisition rank
// added in EYEPIN.2 exists to stop producing. v10 boots empty so the FIXED
// picker fills it by working THROUGH her taught vocabulary instead of on top of
// the pile the broken one left. ⚠ Same contract as every bump before it:
// imagery cleared, TRAINING KEPT — weights / grades / phases / episodic memory
// live in entirely different files and are untouched. v9 stays on disk unused
// (and is deleted by hand this once, on the operator's word); the FRESHEYES
// pattern sweep (`visual-memory*`, json AND db, incl. `-wal`/`-shm`) and the
// `.gitignore` pattern `server/visual-memory*.db*` both cover v10 automatically
// — nothing to add for either, which is the whole point of versioning by name.
const VM_DB = path.join(__dirname, '..', 'visual-memory-v10.db');
// NOLIMIT (ruled 2026-08-20: the equations behind her mind's-eye imagery are
// not to be limited). 384 concepts was a small number for a mind that will walk K→PhD
// and see everything on the way — she would start FORGETTING what things look like
// while still learning new words. Raised to 4096 (env-tunable), which is still an
// LRU floor rather than a cage: the store is ~0.3-3KB per field C, so 4096 is a
// few MB of state, and it is wiped on every fresh walk (FRESHEYES) so it can never
// become stale identity.
// VMSCALE (2026-08-21, operator: ~10k concepts at full training, "the more the
// better") — 4096 → 25,000 default, 2.5× the
// stated target. With sqlite as the medium the DISK does not care; this cap is
// the RAM bound on the hot in-memory Map (~10KB/entry ⟹ 25k ≈ 250MB beside the
// brain on a shared box). DREAM_VM_CAP raises it whenever more RAM is available.
const VM_CAP = Number(process.env.DREAM_VM_CAP) > 0 ? Number(process.env.DREAM_VM_CAP) : 25000;

// ⛔⛔ CRYSTAL — NOTHING SHE PERCEIVES IS SCALED DOWN, FILTERED OR SOFTENED
// BEFORE THE TRANSFORM. Default 0 = full resolution, no resampling at all.
//
// This used to be 320 with nearest-neighbour resampling, and the reason that is
// wrong is worth keeping because the counter-argument is nearly right: a wavelet
// record IS resolution-independent — a coefficient is (scale, position,
// magnitude) and reconstructs onto any canvas, so nothing DOWNSTREAM needs a
// pixel size. But the ANALYSIS is discrete. Downsampling before
// `equationalizeImageData` means the fine-scale subbands carrying a one-pixel
// axis-label stroke are never created, and resolution-independence cannot
// evaluate a coefficient that does not exist. **Render-at-any-size and
// capture-all-detail are different properties, and only the second one a
// pre-transform downsample destroys.** Measured on a real 1600x1181 figure:
// 320px kept 27,204 coefficients, full resolution kept 184,981.
//
// Safe on the teach lane because `perceive` is PROXIED — it runs on the donor
// GPU or the mind-space worker thread, never the main event loop, so the ~1.9s
// full-resolution transform is worker time and not a loop block.
//
// ⚠ Kept as an OPT-IN for a constrained box, and when it engages it SAYS SO
// once per minute. A percept quietly degraded is exactly the class of silent
// loss this file already carries scars from.
const REF_MAXSIDE = Number(process.env.DREAM_REF_MAXSIDE) > 0 ? Number(process.env.DREAM_REF_MAXSIDE) : 0;

// ⭐ THE RESIDENCY BOUND IS BYTES, because that is the resource. `VM_CAP` remains
// as a secondary count guard, but a count is only a RAM bound when every entry
// is the same size — and this file's own estimate of ~10 KB an entry is off by
// roughly 50x for a full-resolution figure field. 512 MB of hot entries beside a
// brain that wants the rest of the box; disk holds everything and is not bounded
// here at all.
const VM_BYTES = Number(process.env.DREAM_VM_MAX_MB) > 0
  ? Number(process.env.DREAM_VM_MAX_MB) * 1048576
  : 512 * 1048576;
const VM_INGEST_GAP_MS = 2000;   // per-brain pacing across ALL clients
const VM_STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'is',
  'it', 'its', 'was', 'are', 'be', 'this', 'that', 'with', 'for', 'as',
  'her', 'his', 'my', 'your', 'she', 'he', 'you', 'we', 'me', 'him',
  'them', 'they', 'am', 'do', 'so', 'up', 'by', 'if',
]);

const SERVER_VISUAL_MEMORY_MIXIN = {
  // ── VMSCALE (2026-08-21) — THE STORE MOVES TO SQLITE. Operator directive:
  // no meaningful cap on her image equations — ~10k+ concepts at full training,
  // sized against the box's disk, "the more the better". The monolithic-JSON
  // medium could not carry that, MEASURED: 10k entries = a 96.5MB string and a
  // 761ms main-loop pin per save; 30k = 2.3s pins; at 100k `JSON.stringify`
  // HARD-FAILS with RangeError (V8 string ceiling) — the old format had a
  // structural cap far below the ask, and every save pinned the loop harder as
  // she learned more. So the store now lives in better-sqlite3 — the SAME
  // engine her episodic memory already trusts on this box: per-entry upserts
  // in microseconds batched behind a 5s dirty-key flush, no giant string ever
  // exists at any store size, WAL journal, and disk is the only real ceiling.
  //
  // ⛔ THIS COMMENT SAID "500GB minus Forgejo" UNTIL 2026-09-02 AND THAT NUMBER
  // WAS NEVER VERIFIED — it was an assertion here that two board rows and one
  // operator decision then inherited as fact. **The box is 1 TB.** The figures
  // that matter, measured rather than assumed: a full-resolution figure field
  // averages 4.22 MB, the full set is ~133 GB, and it exists in THREE places on
  // this machine (Forgejo's LFS store, the pulled `fields/` staging copy, and
  // this store) — ~400 GB of 1,000, which is affordable. **At the 500 GB this
  // comment claimed, it would not have been.** `state.disk` publishes the live
  // figures now; read those, never this sentence. The in-RAM Map stays — recall paths need hot reads —
  // so DREAM_VM_CAP remains as the RAM bound (~10KB/entry ⟹ 25k ≈ 250MB), not
  // a disk bound. The v4 JSON never shipped a boot, so there is nothing to
  // migrate: this IS v4, on a medium that can hold what was asked of it.
  _vmDb() {
    if (this._vmDbConn === undefined) {
      try {
        const Database = require('better-sqlite3');
        const db = new Database(VM_DB);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        // BLOBSTORE (2026-08-21) — the rec's coefficient payload lives in a
        // BLOB beside the JSON skeleton instead of base64 inside it. Base64 is
        // ASCII (4 chars per 3 bytes) and the parsed entries sit RESIDENT in
        // the Map — so the wrapper tax landed on RAM, the axis that binds.
        // Binary rows hold the same data at ~75% of the resident bytes. v8
        // ships this shape from birth: no migration ever runs (v8 has never
        // existed on any box).
        db.exec('CREATE TABLE IF NOT EXISTS concepts (key TEXT PRIMARY KEY, entry TEXT NOT NULL, bin BLOB, at INTEGER NOT NULL)');
        this._vmDbConn = db;
      } catch (e) {
        this._vmDbConn = null;
        console.warn('[VisualMemory] sqlite store unavailable — visual memory will NOT persist this boot:', e?.message || e);
      }
    }
    return this._vmDbConn;
  },
  // Lazy store init + one-time restore from the DB. Map iteration order is
  // insertion order — re-inserting on touch makes it a natural LRU, and the
  // Map subclass hooks set/delete so EVERY existing call site persists without
  // knowing the medium changed.
  _vmStore() {
    if (!this._visualMemory) {
      const self = this;
      // ⛔⛔ EVICT AND DELETE ARE DIFFERENT OPERATIONS AND WERE THE SAME ONE.
      //
      // `delete()` marks the key dirty-for-removal and the flush runs
      // `DELETE FROM concepts`, so the LRU trim — `while (size > VM_CAP)
      // store.delete(...)` — was DESTROYING THE ROW ON DISK. That is forgetting,
      // not residency, and the file's own comment claimed the opposite: "this cap
      // is the RAM bound ... not a disk bound" and "the DISK does not care".
      //
      // At ~10 KB an entry the lie never showed. At full-fidelity figure fields
      // (~560 KB resident) holding RAM at 250 MB means a cap near 450, which
      // would have silently deleted tens of thousands of her visual memories off
      // a disk with room to spare, while the comment insisted disk was the only
      // ceiling. (That disk is 1 TB, measured 2026-09-02 — the "500 GB" this
      // file repeated three times was never a measurement.)
      //
      // Three axes, separated:
      //   • DELETE   — she is meant to forget it (a rejected drawing). Disk too.
      //   • EVICT    — RAM pressure only. The row STAYS on disk.
      //   • GET miss — lazily re-read from disk, so eviction costs a read and
      //                never a memory.
      class VMMap extends Map {
        set(k, v) {
          const prev = super.get(k);
          if (prev !== undefined) self._vmResidentBytes -= self._recResidentBytes(prev);
          const r = super.set(k, v);
          self._vmResidentBytes += self._recResidentBytes(v);
          try { self._vmMarkDirty(k, false); } catch { /* nf */ }
          return r;
        }
        delete(k) {
          const prev = super.get(k);
          const had = super.delete(k);
          if (had) {
            self._vmResidentBytes -= self._recResidentBytes(prev);
            try { self._vmMarkDirty(k, true); } catch { /* nf */ }
          }
          return had;
        }
        // Drop from RAM ONLY — no dirty mark, so the flush never issues a DELETE.
        evict(k) {
          const prev = super.get(k);
          const had = super.delete(k);
          if (had) self._vmResidentBytes -= self._recResidentBytes(prev);
          return had;
        }
        // A miss is not an absence. Read it back from sqlite, and re-insert
        // through the RAW Map so a lazy load is not mistaken for a write.
        get(k) {
          const hit = super.get(k);
          if (hit !== undefined) return hit;
          const loaded = self._vmLoadOne(k);
          if (loaded === null) return undefined;
          Map.prototype.set.call(this, k, loaded);
          self._vmResidentBytes += self._recResidentBytes(loaded);
          self._vmLazyLoads = (self._vmLazyLoads | 0) + 1;
          return loaded;
        }
        // `has` must agree with `get`, or a caller that checks before reading
        // concludes a paged-out memory does not exist.
        has(k) { return super.has(k) || this.get(k) !== undefined; }
      }
      this._visualMemory = new VMMap();
      this._vmRestoring = true;   // restore must not mark its own inserts dirty-for-write
      try {
        const db = this._vmDb();
        if (db) {
          const t0 = Date.now();
          const rows = db.prepare('SELECT key, entry, bin FROM concepts ORDER BY at ASC').all();
          // ⛔ RESTORE STOPS AT THE BYTE BUDGET, NOT AT A ROW COUNT. Loading the
          // newest VM_CAP rows was safe at ~10 KB an entry and is 14 GB at
          // full-resolution figure fields. Newest-first so the most recent
          // memories are the resident ones; everything else stays on disk and
          // loads on demand.
          this._vmResidentBytes = 0;
          let loaded = 0;
          for (let i = rows.length - 1; i >= 0 && loaded < VM_CAP && this._vmResidentBytes < VM_BYTES; i--) {
            const r = rows[i];
            try {
              const e = JSON.parse(r.entry);
              if (r.bin) this._recAttachBin(e, r.bin);   // BLOBSTORE — reattach binary payload as Buffers
              if (e && e.rec && e.rec.channels) {
                Map.prototype.set.call(this._visualMemory, r.key, e);
                this._vmResidentBytes += this._recResidentBytes(e);
                loaded++;
              }
            } catch { /* one bad row never blocks the rest */ }
          }
          this._vmDiskRows = rows.length;
          if (this._visualMemory.size > 0) {
            // Says RESIDENT and ON DISK separately, because they are now
            // different numbers and the difference is the whole point: a row
            // that is not resident is paged out, not forgotten.
            console.log(`[VisualMemory] ${this._visualMemory.size} field(s) resident `
              + `(${(this._vmResidentBytes / 1048576).toFixed(0)} MB of ${(VM_BYTES / 1048576).toFixed(0)} MB budget), `
              + `${rows.length} on disk — the rest load on demand. ${Date.now() - t0}ms.`);
          }
        }
      } catch (e) { console.warn('[VisualMemory] load failed:', e?.message || e); }
      this._vmRestoring = false;
    }
    return this._visualMemory;
  },
  // Resident cost of one entry. The coefficient payload dominates by orders of
  // magnitude, so it is measured and the skeleton is estimated — an exact
  // JSON.stringify per entry would cost more than the accounting is worth.
  _recResidentBytes(e) {
    if (!e || !e.rec || !e.rec.channels) return 512;
    let n = 512;
    for (const c of Object.keys(e.rec.channels)) {
      const ch = e.rec.channels[c];
      if (!ch) continue;
      if (ch.val && ch.val.length) n += ch.val.length;
      if (ch.pos && ch.pos.length) n += ch.pos.length;
      if (ch.val_b64) n += ch.val_b64.length;
      if (ch.pos_b64) n += ch.pos_b64.length;
    }
    if (e.p && e.p.length) n += e.p.length * 8;
    return n;
  },

  // Read ONE entry back from sqlite. This is what makes eviction safe: a key
  // that is not resident is on disk, not gone.
  _vmLoadOne(key) {
    try {
      const db = this._vmDb();
      if (!db) return null;
      const r = db.prepare('SELECT entry, bin FROM concepts WHERE key = ?').get(key);
      if (!r) return null;
      const e = JSON.parse(r.entry);
      if (r.bin) this._recAttachBin(e, r.bin);
      if (!(e && e.rec && e.rec.channels)) return null;
      return e;
    } catch { return null; }
  },

  // ⛔ TRIM BY BYTES, NOT BY A COUNT STANDING IN FOR BYTES. An entry-count cap
  // is only a RAM bound if every entry is the same size, and the assumption
  // written into this file (~10 KB each) is off by 50x for a full-resolution
  // figure field. Evicts oldest-first — Map iteration order is insertion order
  // and a touch re-inserts, so that is genuine LRU — and evicting NEVER deletes
  // from disk.
  _vmTrimResident(store) {
    let guard = 0;
    while ((store.size > VM_CAP || this._vmResidentBytes > VM_BYTES) && store.size > 1 && guard++ < 100000) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.evict(oldest);
      this._vmEvictions = (this._vmEvictions | 0) + 1;
    }
  },

  // Dirty-key tracking: a set() queues an upsert, a delete() queues a removal,
  // a set() after a delete cancels the removal (LRU touch = delete+set of the
  // same key nets to one upsert). Flush is debounced 5s and batched in ONE
  // transaction — typically 1-20 rows of ~10KB each, microseconds-to-ms, at
  // ANY store size. The O(store) full-serialize save is gone.
  _vmMarkDirty(key, isDelete) {
    if (this._vmRestoring) return;
    if (!this._vmDirtyUpserts) { this._vmDirtyUpserts = new Set(); this._vmDirtyDeletes = new Set(); }
    if (isDelete) { this._vmDirtyUpserts.delete(key); this._vmDirtyDeletes.add(key); }
    else { this._vmDirtyDeletes.delete(key); this._vmDirtyUpserts.add(key); }
    this._vmSaveSoon();
  },
  // Debounced persistence — the seen-concept store is her visual episodic
  // medium; losing it on restart would blind her imagination back to
  // abstract fields until she re-sees everything.
  _vmSaveSoon() {
    if (this._vmSaveTimer) return;
    this._vmSaveTimer = setTimeout(() => {
      this._vmSaveTimer = null;
      try {
        const db = this._vmDb();
        if (!db) return;
        const ups = this._vmDirtyUpserts || new Set();
        const dels = this._vmDirtyDeletes || new Set();
        if (ups.size === 0 && dels.size === 0) return;
        this._vmDirtyUpserts = new Set();
        this._vmDirtyDeletes = new Set();
        const store = this._vmStore();
        const t0 = Date.now();
        const put = db.prepare('INSERT OR REPLACE INTO concepts (key, entry, bin, at) VALUES (?, ?, ?, ?)');
        const del = db.prepare('DELETE FROM concepts WHERE key = ?');
        const tx = db.transaction(() => {
          for (const k of dels) del.run(k);
          for (const k of ups) {
            const e = store.get(k);
            if (!e) continue;
            // BLOBSTORE — split the entry: coefficient payload → BLOB, the
            // rest → JSON skeleton; then keep the LIVE entry in binary form
            // too, reclaiming the resident base64 immediately.
            const { json, bin } = this._recSplitBin(e);
            put.run(k, json, bin, e.at || Date.now());
            if (bin) this._recAttachBin(e, bin, true);
          }
        });
        tx();
        const ms = Date.now() - t0;
        if (ms > 100) console.log(`[VisualMemory] flushed ${ups.size} upsert(s) + ${dels.size} delete(s) in ${ms}ms.`);
      } catch (e) { console.warn('[VisualMemory] save failed:', e?.message || e); }
    }, 5000);
  },

  // ── BLOBSTORE helpers ──────────────────────────────────────────────────────
  // Split an entry for storage: every channel's base64 payload (val_b64 /
  // pos_b64) decodes into ONE shared Buffer; the JSON skeleton keeps
  // {val_ref:[off,len], pos_ref:[off,len]} in their place. Works on the rec
  // whether it currently holds b64 strings or already-attached Buffers.
  _recSplitBin(entry) {
    try {
      const rec = entry && entry.rec;
      if (!rec || !rec.channels) return { json: JSON.stringify(entry), bin: null };
      const segs = [];
      let off = 0;
      // Int16Array views require an EVEN byteOffset — pad before every value
      // segment so the reattached view never throws on alignment.
      const take = (buf, align2) => {
        if (align2 && (off % 2)) { segs.push(Buffer.alloc(1)); off += 1; }
        segs.push(buf); const r = [off, buf.length]; off += buf.length; return r;
      };
      const chansOut = {};
      for (const [name, c] of Object.entries(rec.channels)) {
        if (!c) continue;
        const co = { ...c };
        const valBuf = c.val_bin ? Buffer.from(c.val_bin.buffer || c.val_bin, c.val_bin.byteOffset || 0, c.val_bin.byteLength ?? c.val_bin.length)
          : (c.val_b64 ? Buffer.from(c.val_b64, 'base64') : null);
        const posBuf = c.pos_bin ? Buffer.from(c.pos_bin.buffer || c.pos_bin, c.pos_bin.byteOffset || 0, c.pos_bin.byteLength ?? c.pos_bin.length)
          : (c.pos_b64 ? Buffer.from(c.pos_b64, 'base64') : null);
        delete co.val_b64; delete co.pos_b64; delete co.val_bin; delete co.pos_bin;
        if (valBuf) co.val_ref = take(valBuf, true);
        if (posBuf) co.pos_ref = take(posBuf, false);
        chansOut[name] = co;
      }
      if (segs.length === 0) return { json: JSON.stringify(entry), bin: null };
      const bin = Buffer.concat(segs, off);
      const json = JSON.stringify({ ...entry, rec: { ...rec, channels: chansOut } });
      return { json, bin };
    } catch { return { json: JSON.stringify(entry), bin: null }; }
  },
  // Reattach a row's BLOB onto the parsed skeleton as Buffer views (one Buffer
  // per row, channels hold subarray views — no copies). With mutateRefsOnly
  // the entry already has live channels (post-flush in-place conversion).
  _recAttachBin(entry, bin, mutateRefsOnly) {
    try {
      const rec = entry && entry.rec;
      if (!rec || !rec.channels || !bin) return;
      const buf = Buffer.isBuffer(bin) ? bin : Buffer.from(bin);
      if (mutateRefsOnly) {
        // convert the LIVE entry: recompute refs the same way the split did
        const { json } = this._recSplitBin(entry);
        const skel = JSON.parse(json);
        entry.rec = skel.rec;
      }
      for (const c of Object.values(entry.rec.channels)) {
        if (!c) continue;
        if (Array.isArray(c.val_ref)) { c.val_bin = buf.subarray(c.val_ref[0], c.val_ref[0] + c.val_ref[1]); delete c.val_ref; }
        if (Array.isArray(c.pos_ref)) { c.pos_bin = buf.subarray(c.pos_ref[0], c.pos_ref[0] + c.pos_ref[1]); delete c.pos_ref; }
      }
    } catch { /* attach best-effort — a failed row simply stays skeleton-only and is skipped by consumers */ }
  },
  // A rec that must LEAVE the process as JSON (the mind's-eye viewer, the
  // donor WS lane) converts its Buffers back to base64 — the wire format is
  // unchanged, only the RESIDENT form went binary.
  _recJsonSafe(rec) {
    try {
      if (!rec || !rec.channels) return rec;
      let needs = false;
      for (const c of Object.values(rec.channels)) if (c && (c.val_bin || c.pos_bin)) { needs = true; break; }
      if (!needs) return rec;
      const chans = {};
      for (const [name, c] of Object.entries(rec.channels)) {
        if (!c) continue;
        const co = { ...c };
        if (c.val_bin) { co.val_b64 = Buffer.from(c.val_bin.buffer || c.val_bin, c.val_bin.byteOffset || 0, c.val_bin.byteLength ?? c.val_bin.length).toString('base64'); delete co.val_bin; }
        if (c.pos_bin) { co.pos_b64 = Buffer.from(c.pos_bin.buffer || c.pos_bin, c.pos_bin.byteOffset || 0, c.pos_bin.byteLength ?? c.pos_bin.length).toString('base64'); delete co.pos_bin; }
        chans[name] = co;
      }
      return { ...rec, channels: chans };
    } catch { return rec; }
  },

  // Content words only — binding a field C to "the"/"of" would make every
  // future thought recall random imagery through stopword collisions.
  _vmContentWords(text) {
    return String(text || '').toLowerCase().split(/[^a-z]+/)
      .filter(w => w.length >= 2 && !VM_STOP.has(w))
      .slice(0, 6);
  },

  // The HEAD of the subject phrase — the thing the picture is OF.
  //
  // ⛔ The two single-key call sites used `_vmContentWords(x)[0]`, and English
  // noun phrases are HEAD-FINAL, so the first content word is normally an
  // adjective. Measured on real labels: a phrase of the form
  // <article><size><colour><subject> keyed under the SIZE word, so her learned
  // SHAPE of the subject was filed under a modifier — colliding with every
  // other thing sharing that modifier, while the subject itself found nothing.
  //
  // Walks the ORIGINAL text (not the stripped list) because the phrase
  // boundary lives in the glue: once a concrete noun has been seen, the next
  // glue word ends the head phrase, so a trailing prepositional phrase cannot
  // drag the key onto the second noun. Concreteness is the live WordNet
  // judgement the draw lane already uses — ⚠ NOT a word list, per the law.
  // Modifiers that WordNet reads as adjectives, and gerunds it reads as
  // abstract, are both skipped, so the head lands on the thing itself.
  _vmHeadWord(text) {
    const raw = String(text || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (raw.length === 0) return '';
    let tax = null;
    try { tax = this._drawTaxonomy || (this._drawTaxonomy = require('../drawable-taxonomy.js')); }
    catch { tax = null; }
    let head = '';
    for (const w of raw) {
      const glue = w.length < 2 || VM_STOP.has(w);
      // Glue AFTER the head noun closes the phrase; glue before it is just
      // the article and must not stop the walk.
      if (glue) { if (head) break; continue; }
      let concrete = true;
      if (tax && typeof tax.drawableVerdict === 'function') {
        try { concrete = tax.drawableVerdict(w) === 'concrete'; } catch { concrete = true; }
      }
      if (concrete) head = w;
    }
    // Nothing concrete anywhere (an abstract or unknown phrase) — fall back to
    // the content words rather than returning empty, so a caller that needs a
    // key still gets the best available one instead of dropping the memory.
    if (!head) head = this._vmContentWords(text)[0] || '';
    return head;
  },

  // VMRELATE — teach the WHOLE phrase she just looked at.
  //
  // ⛔ A bare noun-noun bind would repeat the loss VMPHRASE.3 was filed for,
  // one level up: the size, the colour, the articles and the preposition are
  // all part of what she SAW, and reducing the label to its two nouns throws
  // them away again. The requirement: make sure the FULL thing is taught.
  //
  // So the label trains twice, on two channels, from one look:
  //   • THE ORDER — every consecutive pair across the phrase INCLUDING the
  //     glue, on the same word→word transition channel every sentence uses.
  //     This is what carries the modifier chain and the preposition in the
  //     sequence she actually saw them in.
  //   • THE RELATION — each remaining content word bound to the HEAD in both
  //     directions on a channel of its own, so the modifiers and the second
  //     noun attach to the thing the picture is OF rather than floating as
  //     unrelated keys.
  //
  // ⭐ EXPERIENTIAL, not curricular, which is what makes it independent of
  // which button the operator presses: it fires when she LOOKS, rides the
  // existing chat-teach drain (one job per teach-call boundary), and lands on
  // whatever weights exist — trained (Oja is self-normalizing, the property
  // SAVERERUN relies on) or empty after a fresh walk. Her current cell is
  // never interrupted and nothing here is gated on a walk state.
  //
  // ⚠ BOUNDED BEFORE SHIPPING. An unbounded teach layer cost 70 minutes per
  // cell once already, so this one caps the pairs per look, keeps reps low,
  // refuses when the drain is already deep, and counts every one of those
  // refusals — a teach lane that quietly grows is the failure mode, not a
  // teach lane that says it stopped.
  _queuePhraseTeach(phrase) {
    const st = this._vmRelate || (this._vmRelate = {
      looks: 0, queued: 0, pairs: 0, skippedShort: 0, skippedBusy: 0, lastPhrase: null, lastAt: 0,
    });
    const text = String(phrase || '').trim();
    if (!text) return 0;
    st.looks++;
    const words = text.toLowerCase().split(/[^a-z']+/).filter(Boolean);
    // One word carries no order and no relation — nothing to teach here that
    // the ordinary vocabulary lanes do not already do better.
    if (words.length < 2) { st.skippedShort++; return 0; }
    if (!Array.isArray(this._chatTeachJobQueue)) this._chatTeachJobQueue = [];
    const MAX_QUEUE = Number(process.env.DREAM_VM_RELATE_MAX_QUEUE) || 24;
    if (this._chatTeachJobQueue.length >= MAX_QUEUE) { st.skippedBusy++; return 0; }

    const MAX_PAIRS = Number(process.env.DREAM_VM_RELATE_MAX_PAIRS) || 24;
    const REPS = Number(process.env.DREAM_VM_RELATE_REPS) || 4;

    // ORDER — consecutive pairs across the whole phrase, glue included.
    const order = [];
    for (let i = 0; i + 1 < words.length && order.length < MAX_PAIRS; i++) {
      if (words[i] !== words[i + 1]) order.push([words[i], words[i + 1]]);
    }

    // RELATION — content words bound to the head, both directions.
    const relation = [];
    let head = '';
    try { head = this._vmHeadWord(text); } catch { head = ''; }
    if (head) {
      const content = this._vmContentWords(text);
      for (const w of content) {
        if (w === head || relation.length + 2 > MAX_PAIRS) continue;
        relation.push([w, head], [head, w]);
      }
    }
    if (order.length === 0 && relation.length === 0) { st.skippedShort++; return 0; }

    // Two jobs, because the channel is the meaning: collapsing them onto one
    // tag would teach the order and the attachment as the same relation.
    if (order.length > 0) {
      this._chatTeachJobQueue.push({
        pairs: order,
        opts: { reps: REPS, label: 'VMRELATE-ORDER', relationTagId: 13 },
      });
      st.queued++; st.pairs += order.length;
    }
    if (relation.length > 0) {
      this._chatTeachJobQueue.push({
        pairs: relation,
        opts: { reps: REPS, label: 'VMRELATE-ATTACH', relationTagId: 35 },
      });
      st.queued++; st.pairs += relation.length;
    }
    st.lastPhrase = text.slice(0, 80);
    st.lastAt = Date.now();
    // The drain's own 32-job bound still applies and counts its drops; this
    // returns what was queued so a caller can log the real number.
    return order.length + relation.length;
  },

  // WS 'visual_frame' intake: {source:'camera'|'image', w, h, rgba_b64, label}.
  // Validation is strict (dims 8..96, byte length must equal w*h*4) because
  // this is a PUBLIC-lane message — a malformed frame must never reach the
  // wavelet transform. Async (perceive may take the GPU path on a GPU host);
  // callers fire-and-forget.
  // ⭐⭐ HEARING.1 — WHAT SHE HEARD, BANKED AND BOUND.
  //
  // The requirement: she must be able to HEAR when spoken to, not merely carry
  // a text-to-speech wrapper over a text chain. This is the audio twin of
  // `_perceiveTextbookFigure`, and it runs the SAME four steps a picture takes
  // — perceive, describe, store, teach — so hearing and seeing are one
  // mechanism rather than two that drift apart.
  //
  // ⛔ THE PERCEPTION ALREADY HAPPENED, ON THE CLIENT, AND THAT IS THE DESIGN.
  // Raw PCM for one utterance is ~72,000 floats; as JSON that is most of a
  // megabyte on the socket the walk teaches over. `perceiveAudio` is pure and
  // runs fine in the browser, and a field-A record is a few KB. **The equation
  // travels, never the waveform.**
  //
  // ⛔ `heard:` IS NAMESPACED FOR THE SAME REASON `fig:` IS. Keyed by the words
  // alone, a spoken sentence would overwrite what a WORD LOOKS LIKE in the same
  // store — the CAMPOISON defect, where an unlabelled frame became her memory
  // of a word. Namespacing is what makes the modalities unable to collide.
  //
  // ⚠ NOT A CLAIM OF SPEECH RECOGNITION. The transcript still comes from the
  // browser. What changes is that the sound is no longer discarded and her
  // words are anchored to a percept she actually took in.
  async _ingestHeard(msg) {
    const st = this._hearStats || (this._hearStats = {
      received: 0, banked: 0, taught: 0, rejected: 0, lastAt: 0, lastPhrase: null, lastErr: null,
    });
    st.received++;
    const rec = msg && msg.rec;
    const transcript = String((msg && msg.transcript) || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    // A record with no chunks is not a percept, and a phrase with no words
    // cannot be bound — refuse rather than bank something unusable.
    if (!rec || !Array.isArray(rec.chunks) || !rec.chunks.length || !transcript) {
      st.rejected++; st.lastErr = 'no chunks or empty transcript';
      return;
    }
    const now = Date.now();
    try {
      const store = this._vmStore && this._vmStore();
      if (store) {
        // Keyed by the PHRASE under a `heard:` prefix — so a second hearing of
        // the same sentence updates one row instead of growing the store
        // without bound, and can never touch `seen:`/`fig:`/`canvas:own:`.
        const key = `heard:${transcript.toLowerCase().slice(0, 80)}`;
        const prev = store.get(key);
        store.set(key, {
          rec,
          at: now,
          seen: (prev && prev.seen ? prev.seen : 0) + 1,
          conf: true,          // she took it in directly — there is no second guess to agree with
          p: Array.isArray(msg.percept) ? msg.percept : null,
          phrase: transcript,
          heard: { seconds: Number(msg.seconds) || null },
        });
        this._vmTrimResident(store);   // evicts from RAM; the row STAYS on disk
        this._vmSaveSoon();
        st.banked++;
      }
    } catch (e) {
      st.rejected++; st.lastErr = `store: ${(e && e.message) || e}`;
    }

    // ⭐ THE WORDS SHE HEARD ARE TAUGHT, which is the whole point. The figure
    // lane shipped once with the percept banked and the phrase never bound —
    // "the picture arrives with its text" was true of the DATA and false of the
    // brain. Not repeating that here.
    try {
      if (typeof this._queuePhraseTeach === 'function') {
        this._queuePhraseTeach(transcript);
        st.taught++;
      }
    } catch { /* the teach queue has its own bounds and counters */ }

    st.lastAt = now;
    st.lastPhrase = transcript.slice(0, 80);
  },

  async _ingestVisualFrame(msg) {
    if (!this.mindSpace || typeof this.mindSpace.perceive !== 'function') return;
    const now = Date.now();
    if (this._vmLastIngestAt && (now - this._vmLastIngestAt) < VM_INGEST_GAP_MS) return;
    const w = msg.w | 0, h = msg.h | 0;
    if (w < 8 || h < 8 || w > 192 || h > 192) return;   // MS.EXT — retina raised with the feeder (96→192)
    if (typeof msg.rgba_b64 !== 'string' || msg.rgba_b64.length > 192 * 192 * 4 * 2) return;
    let buf;
    try { buf = Buffer.from(msg.rgba_b64, 'base64'); } catch { return; }
    if (buf.length !== w * h * 4) return;
    this._vmLastIngestAt = now;

    // TU.29.12 — BLANK-FRAME GATE. A near-uniform frame (dark room, blank wall,
    // lens covered, subject off-frame) is not a percept worth remembering — it
    // equationalizes to a flat field that reconstructs BLACK when later recalled.
    // Reject low-variance frames at intake (luma stddev on a stride-sampled set)
    // so only frames with real visual detail get bound to concepts.
    {
      let sum = 0, sumSq = 0, cnt = 0;
      for (let i = 0; i < buf.length; i += 4 * 7) {   // stride-sample every 7th pixel
        const luma = 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2];
        sum += luma; sumSq += luma * luma; cnt++;
      }
      if (cnt > 0) {
        const mean = sum / cnt;
        const variance = Math.max(0, sumSq / cnt - mean * mean);
        const std = Math.sqrt(variance);
        if (std < 12) {   // ~flat frame (0-255 scale); a real scene is >>12
          if (!this._vmBlankLogAt || (now - this._vmBlankLogAt) > 60000) {
            this._vmBlankLogAt = now;
            console.log(`[VisualMemory] skipped near-uniform frame (luma std ${std.toFixed(1)} < 12 — blank wall / dark room / off-frame), not a percept worth binding.`);
          }
          return;
        }
      }
    }

    // pixels → field C (full-color YCbCr, forward CDF 9/7). perceive() takes a
    // plain {width, height, data} — no browser ImageData needed server-side.
    let rec;
    try {
      rec = await this.mindSpace.perceive({
        width: w, height: h,
        data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length),
      });
    } catch (e) {
      if (!this._vmPerceiveErrLogged) { this._vmPerceiveErrLogged = true; console.warn('[VisualMemory] perceive failed:', e?.message || e); }
      return;
    }
    if (!rec || !rec.channels) return;
    const fromCamera = msg.source === 'camera';
    rec.fidelity = { psnr_db: null, source: fromCamera ? 'seen-camera' : 'seen-image' };

    // SEE.2 — REPEAT-FRAME REJECTION (server-side authority). Deployed browser
    // tabs can run a cached pre-SEE.1 feeder for days, so the server must also
    // refuse a static source: if this frame's percept is near-identical to a
    // recently ingested one (cosine > 0.995 over the dim-64 profile), NOTHING
    // NEW was seen — binding it again would let one frozen image colonize
    // every concept she thinks over hours (the dead-air takeover). Real scenes
    // drift below that ceiling even when the camera is still.
    try {
      const pv = await this.mindSpace.describe(rec);
      if (pv && pv.length) {
        if (!Array.isArray(this._vmRecentPercepts)) this._vmRecentPercepts = [];
        const cosSim = (a, b) => {
          let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
          for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
          const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0;
        };
        // STATIC-SOURCE LOCKOUT (camera lane) — a virtual webcam whose app is
        // off streams a placeholder CARD (text + logo: passes the blank-frame
        // gate, wobbles past per-frame repeat checks via compression noise).
        // If several consecutive camera frames match a rolling signature, the
        // camera is showing a STILL — lock the lane until the scene actually
        // changes. A still teaches nothing; one card must never colonize her
        // concepts (live incident: thousands of 'turn on your webcam' frames).
        const _isCam = !(msg && msg.label);
        if (_isCam) {
          if (this._vmStaticSig && cosSim(pv, this._vmStaticSig) > 0.98) {
            this._vmStaticRun = (this._vmStaticRun || 0) + 1;
          } else {
            this._vmStaticSig = pv;
            this._vmStaticRun = 0;
          }
          if (this._vmStaticRun >= 4) {
            this._vmStaticSkips = (this._vmStaticSkips || 0) + 1;
            if (!this._vmStaticLogAt || (now - this._vmStaticLogAt) > 60000) {
              this._vmStaticLogAt = now;
              console.warn(`[VisualMemory] camera LOCKED OUT — static source (${this._vmStaticRun}+ consecutive near-identical frames, e.g. a virtual-webcam placeholder card). Ingest resumes when the scene changes. ${this._vmStaticSkips} static frames skipped this boot.`);
            }
            return;
          }
        }
        for (const old of this._vmRecentPercepts) {
          if (cosSim(pv, old) > 0.995) {
            this._vmRepeatSkips = (this._vmRepeatSkips || 0) + 1;
            if (!this._vmRepeatLogAt || (now - this._vmRepeatLogAt) > 60000) {
              this._vmRepeatLogAt = now;
              console.log(`[VisualMemory] skipped repeat frame (percept cosine > 0.995 vs a recent ingest — frozen/static source, nothing new seen). ${this._vmRepeatSkips} repeats skipped this boot.`);
            }
            return;
          }
        }
        this._vmRecentPercepts.push(pv);
        // Window widened 3 -> 24: interleaved generated-image ingests pushed a
        // frozen camera source out of a 3-deep window and re-admitted it
        // endlessly (live: a virtual-webcam placeholder card bound thousands
        // of near-copies past the old gate).
        while (this._vmRecentPercepts.length > 24) this._vmRecentPercepts.shift();
      }
    } catch { /* repeat gate best-effort — intake proceeds */ }

    // concept binding — the LABEL names what the frame shows, and NOTHING
    // else ever does. CAMPOISON cut camera frames from fusing with her
    // thoughts; WORDLOCK (2026-08-21) — reported: the word she was drawing or
    // imagining still did not line up with the word that went into the request
    // URL. That finishes the job: an unlabeled frame of
    // ANY source binds to NOTHING — the thought-chain fallback fused
    // unlabeled generated images with whatever word she happened to be
    // thinking, the single biggest word/image mismatch machine. She still
    // EXPERIENCES every frame (sem grounding below); she only FILES the ones
    // whose label says what they are. Labels are capped to the first 3
    // content words — a subject is a couple of words, never a sentence.
    const words = this._vmContentWords(msg.label).slice(0, 3);
    const store = this._vmStore();
    // GENERATED-IMAGE CONFIRMATION GATE (operator directive) — an image
    // generator is a NOISY oracle: "drag" can come back a balloon; an
    // esoteric prompt can come back anything. One render must never poison
    // a concept's visual memory. Camera frames stay trusted (the real
    // world). A GENERATED render binds PROVISIONALLY (conf:false) on first
    // sight; a later independent render of the same concept that AGREES
    // (percept cosine ≥ 0.45) CONFIRMS it. An outlier against a CONFIRMED
    // memory bounces off (logged); against a provisional one it replaces
    // it (the first render may have been the outlier). Recall + sem
    // grounding consume confirmed entries only, so a one-off weird render
    // never enters her imagination or her weights.
    let newPercept = null;
    try { const _d = await this.mindSpace.describe(rec); if (_d) newPercept = Array.from(_d); } catch { newPercept = null; }
    const _vmCosP = (a, b) => {
      if (!a || !b) return 0;
      let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0;
    };
    // VMPHRASE.3 — KEEP THE WHOLE PHRASE. The keys are stopword-free on
    // purpose (binding a field C to a preposition or article would make every
    // future thought recall random imagery through glue collisions), but that
    // stripping used to be the ONLY record of the label: a subject phrase with
    // a prepositional tail survived as an unordered bag of content words, and
    // the RELATION was gone — the two nouns filed as unrelated keys with
    // nothing recording how they stood to each other. The full phrase now
    // rides the entry, so nothing is discarded and the keys stay clean.
    const _phrase = String(msg.label || '').trim().slice(0, 160) || null;
    let _anyTrustedBind = fromCamera;
    for (const t of words) {
      const prev = store.get(t);
      if (fromCamera || !newPercept) {
        store.delete(t);                                      // LRU touch
        store.set(t, { rec, at: now, seen: (prev ? prev.seen : 0) + 1, conf: true, p: newPercept || (prev && prev.p) || null, phrase: _phrase || (prev && prev.phrase) || null });
        _anyTrustedBind = true;
        continue;
      }
      if (!prev || !prev.p) {
        store.delete(t);
        store.set(t, { rec, at: now, seen: 1, conf: false, p: newPercept, phrase: _phrase });
        continue;                                             // provisional — awaits a confirming render
      }
      const _s = _vmCosP(newPercept, prev.p);
      if (_s >= 0.45) {
        store.delete(t);
        store.set(t, { rec, at: now, seen: (prev.seen || 0) + 1, conf: true, p: newPercept, phrase: _phrase || (prev && prev.phrase) || null });
        _anyTrustedBind = true;                               // two independent renders agree — the look is real
      } else if (prev.conf !== false) {
        this._vmOutlierSkips = (this._vmOutlierSkips || 0) + 1;
        if (!this._vmOutlierLogAt || (now - this._vmOutlierLogAt) > 60000) {
          this._vmOutlierLogAt = now;
          console.log(`[VisualMemory] outlier render for "${t}" REJECTED (percept cosine ${_s.toFixed(2)} vs the confirmed memory) — generator noise, not the concept. ${this._vmOutlierSkips} outlier(s) bounced this boot.`);
        }
      } else {
        store.delete(t);
        store.set(t, { rec, at: now, seen: 1, conf: false, p: newPercept, phrase: _phrase });   // newer provisional replaces provisional
      }
    }
    this._vmTrimResident(store);   // evicts from RAM; the row STAYS on disk

    // ── OWNART.8 (2026-08-20) — SHE LEARNS THE *CONSTRUCTION* OF WHAT SHE SEES,
    // ── at perception time, not only when something asks her to draw.
    //
    // `_ownArtSchemaFor` abstracted LAZILY: her shape knowledge grew only when a
    // draw request arrived, so the first drawing of a familiar thing was made by
    // a mind that had looked at it many times and never once worked out how it
    // is built. A person does not work that way. Learning it at ingest means the
    // FIRST drawing is already informed.
    //
    // The item's objection was cost — "it puts a trace on the perception path,
    // which is exactly the kind of cost that needs measuring first (the
    // CELLBOUND lesson)". So it is measured, not assumed, and it cannot become
    // a hidden tax:
    //   * CONFIRMED words only — a provisional look (one unconfirmed render)
    //     is not worth abstracting, and `conf` already encodes that judgement.
    //   * the first FEW looks only (`looks < 3`), NOT "new schemas only" — my
    //     first draft guarded on absence, which fights this method's own design:
    //     `_learnShapeSchema` MERGES a second look into the running averages and
    //     increments `looks`, because "that is what looking twice is for". So
    //     re-deriving early is desirable and re-deriving forever is waste; three
    //     looks is where the weighted average has essentially settled.
    //   * throttled to one per DREAM_OWNART_INGEST_MS (default 5s), so a burst
    //     of percepts cannot serialise into a stall.
    //   * FIRE-AND-FORGET — never awaited, so perception latency is unchanged
    //     even if the abstraction is slow.
    //   * SKIPPED mid-curriculum, the same rule the sem-grounding below uses,
    //     so the walk's Hebbian patterns stay pristine.
    //   * self-reporting — the first ten log their real wall-cost, so "needs
    //     measuring first" is answered with numbers instead of being carried
    //     forever as a reason not to try.
    try {
      // ⛔ THIS RAN ONLY WHEN IDLE, AND SHE IS NEVER IDLE.
      //
      // The guard was `!this._curriculumInProgress`, and that flag is set once
      // when the walk starts and cleared only when the whole K→PhD walk
      // RESOLVES — weeks. So learning the shape of a thing at the moment she
      // saw it never happened during the entire curriculum, which is exactly
      // the stretch where she is seeing the most.
      //
      // ⚠ The gate was for COST, not correctness — this is a trace on the
      // perception path, and the header above says so. But a cost gate that
      // resolves to "never" is not a bound, it is a deletion. The throttle
      // below IS the bound, so it carries the cost instead: the normal spacing
      // when she is idle, and a wider one mid-walk so the walk keeps its
      // priority without the capability disappearing.
      const _idleMs = Number(process.env.DREAM_OWNART_INGEST_MS) > 0
        ? Number(process.env.DREAM_OWNART_INGEST_MS) : 5000;
      const _walkMs = Number(process.env.DREAM_OWNART_INGEST_WALK_MS) > 0
        ? Number(process.env.DREAM_OWNART_INGEST_WALK_MS) : 60000;
      const _ingestMs = this._curriculumInProgress ? _walkMs : _idleMs;
      if (_ingestMs > 0
          && typeof this._learnShapeSchema === 'function'
          && (!this._ownArtIngestAt || (now - this._ownArtIngestAt) >= _ingestMs)) {
        const _cand = words.find((t) => {
          const e = store.get(t);
          if (!e || e.conf !== true || !e.rec) return false;
          const _looks = (e.schema && Number(e.schema.looks)) || 0;
          return _looks < 3;
        });
        if (_cand) {
          this._ownArtIngestAt = now;
          const _t0 = Date.now();
          Promise.resolve(this._learnShapeSchema(_cand, store.get(_cand).rec))
            .then(() => {
              this._ownArtIngestCount = (this._ownArtIngestCount || 0) + 1;
              if (this._ownArtIngestCount <= 10) {
                console.log(`[VisualMemory] OWNART.8 — learned the shape schema for "${_cand}" AT PERCEPTION (${Date.now() - _t0}ms, fire-and-forget, ${this._ownArtIngestCount}/10 measured). Her first drawing of it is informed by construction now, not derived on demand. Throttle DREAM_OWNART_INGEST_MS=${_ingestMs}ms; 0 disables.`);
              }
            })
            .catch(() => { /* an abstraction failure must never touch perception */ });
        }
      }
    } catch { /* never let this path affect seeing */ }

    // grounding — the percept vector lands in sem at LOW strength (real
    // seeing, not imagination).
    //
    // ⭐ VMUSE.5d — DEFERRED, NOT DROPPED. This was skipped outright whenever
    // `_curriculumInProgress` was set, and that flag is true for the ENTIRE
    // multi-week walk — so a percept reached her sem region essentially never,
    // across exactly the stretch where she sees the most. ⚠ The reason for the
    // skip is real and unchanged: injecting while a teach pattern is IN FLIGHT
    // corrupts it. But "in flight" is the operative word — mid-walk the
    // grounding is now QUEUED onto the same drain the teach jobs use and
    // applied in the gap BETWEEN teach calls, where nothing is mid-pattern.
    // Idle it still injects immediately; there is nothing to defer around.
    try {
      if (_anyTrustedBind && this.cortexCluster
          && typeof this.cortexCluster.injectEmbeddingToRegion === 'function') {
        const percept = newPercept || await this.mindSpace.describe(rec);   // trusted frames only — provisional renders stay out of sem
        if (percept) {
          if (!this._curriculumInProgress) {
            this.cortexCluster.injectEmbeddingToRegion('sem', percept, 0.10);
            this._perceptGroundDirect = (this._perceptGroundDirect || 0) + 1;
          } else {
            if (!Array.isArray(this._chatTeachJobQueue)) this._chatTeachJobQueue = [];
            // ⚠ Bounded like every other drain producer. A percept that cannot
            // find room is DROPPED and COUNTED rather than queued forever — a
            // stale percept is worth less than a fresh one, and this queue must
            // never become the thing that pins the walk.
            const MAXQ = Number(process.env.DREAM_PERCEPT_GROUND_MAX_QUEUE) || 16;
            if (this._chatTeachJobQueue.length < MAXQ) {
              this._chatTeachJobQueue.push({
                kind: 'inject',
                region: 'sem',
                vector: Array.from(percept),
                strength: 0.10,
                opts: { label: 'PERCEPT-GROUNDING' },
              });
              this._perceptGroundQueued = (this._perceptGroundQueued || 0) + 1;
            } else {
              this._perceptGroundSkipped = (this._perceptGroundSkipped || 0) + 1;
            }
          }
        }
      }
    } catch { /* non-fatal */ }

    // VMRELATE — a TRUSTED look teaches the phrase that named it. Gated on the
    // same `_anyTrustedBind` as the sem grounding above: a provisional render
    // is one unconfirmed guess, and binding a phrase to it would teach the
    // wording of a picture she may yet reject. Queued, never awaited — the
    // drain runs it between her lessons.
    try {
      if (_anyTrustedBind && _phrase && typeof this._queuePhraseTeach === 'function') {
        this._queuePhraseTeach(_phrase);
      }
    } catch { /* non-fatal — a look must never fail on its teach */ }

    // she SEES it — swap the shared mind's-eye snapshot to the live percept
    // so the viewer shows the eye receiving. CAMPOISON (operator law):
    // seen-camera frames NEVER appear on the mind's eye — the viewer belongs
    // to her imagination, memories and artwork, and a webcam placeholder card
    // on that page reads as her mind when it is just a device's screen.
    // Labeled seen frames (her own creations coming back) still swap.
    if (!fromCamera) try {
      this._vmLastEyeSwapAt = now;
      this._lastGroundedEyeAt = now;   // SEE.6 — a seen frame is a grounded frame
      this._mindsEyeJson = JSON.stringify({
        type: 'mindsEye', rec, terms: rec.equation_count || 0,
        source: 'seen' + (words.length ? ':' + words[0] : ''),
        at: now,
      });
    } catch { /* non-fatal */ }

    this._vmSaveSoon();
    this._vmIngestCount = (this._vmIngestCount || 0) + 1;
    if (!this._vmLogAt || (now - this._vmLogAt) > 60000) {
      this._vmLogAt = now;
      console.log(`[VisualMemory] 👁 seen ${fromCamera ? 'camera frame' : 'image'} ${w}x${h} → field C (${rec.equation_count} terms) bound to [${words.join(', ') || 'unbound'}] — ${store.size} concept(s) held, ${this._vmIngestCount} frame(s) this boot`);
    }
  },

  // Recall at imagine-time: re-see the single strongest ACCURATE stored
  // field C for a matched concept. Returns {rec, matched, recombined:false}
  // or null; null sends the caller down the de-novo abstract path. The old
  // two-match morphField overlay was removed — superimposing two seen frames
  // is static, not imagination.
  // null sends the caller down the de-novo abstract path.
  _recallVisualMemory(text) {
    const store = this._vmStore();
    if (store.size === 0) return null;
    const words = this._vmContentWords(text);
    if (words.length === 0) return null;
    const hits = [];
    for (const t of words) {
      const e = store.get(t);
      if (e && e.rec) hits.push({ word: t, e });
    }
    if (hits.length === 0) return null;
    hits.sort((a, b) => (b.e.seen - a.e.seen) || (b.e.at - a.e.at));
    // SEE.3 — RECALL COOLDOWN (viewer variety). One stored percept must never
    // own the mind's eye: without this, a frequently-thought concept re-showed
    // the same memory every daydream tick and "took all the time" of the
    // viewer. A recalled entry rests for DREAM_VM_RECALL_COOLDOWN_MS (default
    // 3min) before it can be SHOWN again; while everything matched is resting,
    // recall reports a MISS so the caller falls through to the sketch /
    // de-novo paths — she draws or daydreams instead of re-staring.
    const COOL = Number(process.env.DREAM_VM_RECALL_COOLDOWN_MS) > 0
      ? Number(process.env.DREAM_VM_RECALL_COOLDOWN_MS) : 180000;
    const nowR = Date.now();
    const fresh = hits.filter(h => !h.e.shownAt || (nowR - h.e.shownAt) > COOL);
    if (fresh.length === 0) return null;   // all resting → variety via de-novo/sketch
    // TU.29.12 — QUALITY GATE. A near-uniform frame (dark room / blank wall /
    // subject off-frame) equationalizes to almost no wavelet detail, which
    // reconstructs FLAT BLACK — and that degenerate "recall" was bypassing
    // BLACK — and that degenerate "recall" was bypassing the never-blank mood
    // floor. `_recDetail()` counts the coefficients that actually survive the
    // drop-tiny threshold; below MIN it is not a real image, so we treat the
    // recall as a MISS and let the caller render the vivid de-novo mood field.
    const MIN_DETAIL = 200;
    // MORPH-OVERLAY REMOVED (operator directive): blending two SEEN images
    // with morphField superimposes their wavelet fields — the result is noise
    // interference / image static, not an accurate composition. Recall now
    // always presents the single strongest ACCURATE stored percept; real
    // recombination belongs to the definition-grounded composition path, not
    // a field overlay of two frames. (mindSpace.morph stays available for
    // non-percept uses.)
    // single strongest — only if it carries real detail
    for (const h of fresh) {
      if (h.e.conf === false) continue;   // provisional generated render — not yet confirmed, never re-seen
      if (this._recDetail(h.e.rec) >= MIN_DETAIL) {
        h.e.shownAt = nowR;                                       // SEE.3 — rests after showing
        return { rec: h.e.rec, matched: [h.word], recombined: false };
      }
    }
    return null;   // all matches degenerate → de-novo mood field (never black)
  },

  // ── OWNART (2026-08-20) — WHAT SHE *LEARNS* FROM A LOOK, not what she copies ──
  //
  // The requirement: she attempts completely NEW creations, trying to render
  // similar KINDS of images in her own style, layout and appearance — never
  // applying layers and filters to a fetched image and calling that a drawing.
  //
  // That is an accurate description of what the old path did: `_drawConcept` default style was
  // `field` → `stylizeField(rec)` = a 7-band posterize of the perceived reference,
  // and the line-art style was `traceLineArt(rec)` = an edge-trace of the same
  // frame. Both are transforms of a downloaded photo. A filter is not a drawing.
  //
  // The fix is to change WHAT SURVIVES the look. This extracts a SHAPE SCHEMA — a
  // few dozen numbers describing the thing's construction, never its pixels:
  //   • parts[]   — clusters of contour strokes reduced to {cx, cy, w, h, ang, curv, weight}
  //   • palette[] — a handful of dominant colours (her own use of them is her choice)
  //   • bbox/aspect — how the subject sits in its frame
  // Everything else is discarded. A schema is ~1-2% of the information in the
  // reference, so re-synthesising from it CANNOT be a copy — there is nothing left
  // to copy WITH. It is the same abstraction a person keeps after looking at a
  // horse: legs-under-body, long neck, big mass, tail behind — not a photograph.
  //
  // Cheap: it runs on strokes she already traced, and stores plain numbers.
  async _learnShapeSchema(concept, rec) {
    if (!rec || !this.mindSpace || typeof this.mindSpace.traceLineArt !== 'function') return null;
    const key = (this._vmHeadWord(concept) || String(concept || '').toLowerCase().trim());
    if (!key) return null;
    let strokes = null;
    try {
      // PAINT.7b — finer trace: 192→256 trace side and a lower min-length so the
      // schema's vector memory carries the SHORT strokes (whiskers, eye rings,
      // toe lines) that turn "readable" into "detailed". Live-judged: 61 kept
      // strokes read as the subject but thin; the detail lives in the tail.
      strokes = await this.mindSpace.traceLineArt(rec, {
        traceSide: 256, maxStrokes: 700, edgeThresh: 0.11, minLenFrac: 0.025, simplify: 1.0, ink: [255, 255, 255],
      });
    } catch { return null; }
    if (!Array.isArray(strokes) || strokes.length < 4) return null;
    // Reduce strokes to normalized segments: [x0,y0,x1,y1] in [0,1].
    const segs = [];
    for (const s of strokes) {
      if (!s) continue;
      if (s.type === 'line' && Number.isFinite(s.x0)) segs.push([s.x0, s.y0, s.x1, s.y1]);
      else if (s.type === 'poly' && Array.isArray(s.pts) && s.pts.length >= 2) {
        for (let i = 1; i < s.pts.length; i++) segs.push([s.pts[i - 1][0], s.pts[i - 1][1], s.pts[i][0], s.pts[i][1]]);
      }
    }
    if (segs.length < 4) return null;
    // PART CLUSTERING — a fixed spatial grid over the subject's bbox.
    // OWNART.7 VERDICT (2026-08-21): the operator's live read confirmed the 3×3
    // grid was TOO coarse — nine cells gave her a layout but the constructions
    // read as scatter, not as the thing. The pre-agreed lever from the OWNART.7
    // filing was schema resolution + marks-per-part, NOT a return to filtering —
    // so the grid is now 5×5 (≤25 parts) and the weight floor drops so fine
    // parts survive. Still an ABSTRACTION (~2-4% of the reference's information
    // — a copy stays impossible); just enough structure that a subject's mass,
    // roundness and attachments survive into her own construction.
    const GRID = 5;
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const g of segs) { x0 = Math.min(x0, g[0], g[2]); x1 = Math.max(x1, g[0], g[2]); y0 = Math.min(y0, g[1], g[3]); y1 = Math.max(y1, g[1], g[3]); }
    const bw = Math.max(1e-3, x1 - x0), bh = Math.max(1e-3, y1 - y0);
    const cells = new Map();
    for (const [ax, ay, bx, by] of segs) {
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const gx = Math.max(0, Math.min(GRID - 1, Math.floor(((mx - x0) / bw) * GRID)));
      const gy = Math.max(0, Math.min(GRID - 1, Math.floor(((my - y0) / bh) * GRID)));
      const k = gy * GRID + gx;
      const len = Math.hypot(bx - ax, by - ay);
      const ang = Math.atan2(by - ay, bx - ax);
      let c = cells.get(k);
      if (!c) { c = { n: 0, len: 0, sx: 0, sy: 0, sa: 0, ca: 0, minx: 1, maxx: 0, miny: 1, maxy: 0 }; cells.set(k, c); }
      c.n++; c.len += len; c.sx += mx; c.sy += my;
      c.sa += Math.sin(2 * ang); c.ca += Math.cos(2 * ang);   // orientation is mod-π: double-angle mean
      c.minx = Math.min(c.minx, ax, bx); c.maxx = Math.max(c.maxx, ax, bx);
      c.miny = Math.min(c.miny, ay, by); c.maxy = Math.max(c.maxy, ay, by);
    }
    const totalLen = [...cells.values()].reduce((a, c) => a + c.len, 0) || 1;
    const parts = [...cells.entries()]
      .map(([k, c]) => ({
        cell: k,
        cx: +( (c.sx / c.n) ).toFixed(4),
        cy: +( (c.sy / c.n) ).toFixed(4),
        w: +Math.max(0.01, c.maxx - c.minx).toFixed(4),
        h: +Math.max(0.01, c.maxy - c.miny).toFixed(4),
        ang: +(0.5 * Math.atan2(c.sa / c.n, c.ca / c.n)).toFixed(4),
        density: +(c.n / segs.length).toFixed(4),
        weight: +(c.len / totalLen).toFixed(4),
      }))
      .filter(p => p.weight > 0.008)   // OWNART.7 — floor lowered with the finer grid so small parts (a stem, an eye) survive
      .sort((a, b) => b.weight - a.weight);
    if (parts.length === 0) return null;
    // PALETTE — the reference's dominant chroma, 4 entries. She is free to use, shift
    // or ignore it; storing it means "this is roughly the colour family of the thing",
    // which is knowledge, not pixels.
    // PAINT.6 — palette from REAL PIXELS, not from a guess. The old
    // _schemaPalette read the first packed int16 of Cb/Cr as "the DC term" with
    // an assumed scale — for a gray/cream subject it produced [255,0,255] pure
    // magenta, and every drawing of her went hot pink. Reconstruct the field
    // she just perceived (ImageData polyfilled server-side now) and histogram
    // the CENTER region — the subject, not the backdrop — into her 4 colors.
    let palette = [];
    // COLORART (2026-08-21) — ONE reconstruction, sampled three ways: the
    // global palette, a color PER PART (where the colors GO — the layer the
    // drawings were missing), and a color PER TRACE STROKE (fine contours in
    // their real colors instead of one monotone ink). Reported: she was using
    // no colour at all, where a real image has colour LAYERS, depth, detail and
    // fine contours.
    let _img = null;
    try { if (this.mindSpace && typeof this.mindSpace.imagine === 'function') _img = await this.mindSpace.imagine(rec, 0); } catch { _img = null; }
    try { palette = await this._schemaPaletteFromRec(rec, _img); } catch { palette = []; }
    // SCRIBBLEKILL (2026-08-21) — the packed-chroma GUESSER fallback is GONE:
    // it produced magenta for a gray subject once (PAINT.6) and did it again
    // through the proxy gap (live: hot-pink crayon bars labeled as a room
    // word). NO palette is honest — the painter goes neutral; a GUESSED
    // palette paints confident lies. No-fallbacks law.
    if (_img && _img.data && _img.width) {
      const W2 = _img.width, H2 = _img.height;
      const px = (u, v) => {
        const x = Math.max(0, Math.min(W2 - 1, Math.round(u * W2)));
        const y = Math.max(0, Math.min(H2 - 1, Math.round(v * H2)));
        const o = (y * W2 + x) * 4;
        return [_img.data[o], _img.data[o + 1], _img.data[o + 2]];
      };
      // per-part REGION color: mean over a 3×3 grid inside the part's box
      // BGPART — she also knows what the BACKDROP looked like (the corner
      // pixels); a part wearing the backdrop's color is scenery showing
      // through the grid, not the subject, and the painter must not give it
      // a mass (judged live: pale backdrop blobs bleeding outside the body).
      // MEASURED: the reconstruction PADS the extreme corners black, so a
      // corner probe reads [0,0,0] and never matches the real backdrop. The
      // probe samples an 8-point border band INSET past the pad, and takes
      // the per-channel MEDIAN so the subject touching one edge can't skew it.
      const band = [px(0.08, 0.08), px(0.5, 0.06), px(0.92, 0.08), px(0.06, 0.5), px(0.94, 0.5), px(0.08, 0.92), px(0.5, 0.94), px(0.92, 0.92)];
      const bg = [0, 1, 2].map(i => { const v = band.map(c => c[i]).sort((a, b) => a - b); return Math.round((v[3] + v[4]) / 2); });
      for (const p of parts) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let gy = -1; gy <= 1; gy++) for (let gx = -1; gx <= 1; gx++) {
          const c = px(p.cx + gx * p.w * 0.25, p.cy + gy * p.h * 0.25);
          r += c[0]; g += c[1]; b += c[2]; n++;
        }
        p.rgb = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
        const dist = Math.abs(p.rgb[0] - bg[0]) + Math.abs(p.rgb[1] - bg[1]) + Math.abs(p.rgb[2] - bg[2]);
        if (dist < 90) p.bg = 1;   // backdrop-colored cell — no painted mass
        // frame-spanning part = a backdrop BAND clustered as a part (measured
        // live: two w=0.99 gray bands became pale blobs bleeding outside the
        // subject) — same scenery rule the trace strokes use
        if (p.w > 0.7 || p.h > 0.7) p.bg = 1;
      }
    }
    // PAINT.2 (2026-08-21) — CONTOURS, not just boxes: the understanding of how
    // subjects actually look, kept from her own looks.
    // The trace already extracts the reference's real outlines; the schema used
    // to throw them away and keep only part boxes, which is why her drawings had
    // "no rhyme or reason or even appearance of anything". Keep the top traced
    // polylines by path length — the silhouette and the biggest internal edges —
    // decimated to ≤20 points each, normalized. Six simplified contours + 25
    // layout cells + a 4-color palette is still ~3-5% of the reference's
    // information: she learns the SHAPE of the thing, she can never copy the
    // image. A contour whose ends nearly meet is marked closed → drawable as a
    // FILLED shape, which is what makes a round subject read round instead of hatched.
    const outlines = [];
    try {
      const polys = strokes
        .filter(s => s && s.type === 'poly' && Array.isArray(s.pts) && s.pts.length >= 4)
        .map(s => {
          let len = 0;
          for (let i = 1; i < s.pts.length; i++) len += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]);
          return { pts: s.pts, len };
        })
        .sort((a, b) => b.len - a.len)
        // PAINT.6 — 6→8 contours at 36 points each (was 20): the live judged test
        // showed the length-sorted top-6 kept long body edges and DROPPED the
        // short triangles (the ears) that make the subject readable, and 20-pt
        // decimation smoothed what remained. Still a skeleton, never pixels.
        .slice(0, 8);
      for (const pl of polys) {
        const step = Math.max(1, Math.ceil(pl.pts.length / 36));
        const dec = [];
        for (let i = 0; i < pl.pts.length; i += step) dec.push([+pl.pts[i][0].toFixed(4), +pl.pts[i][1].toFixed(4)]);
        const last = pl.pts[pl.pts.length - 1];
        if (dec.length && (dec[dec.length - 1][0] !== +last[0].toFixed(4) || dec[dec.length - 1][1] !== +last[1].toFixed(4))) dec.push([+last[0].toFixed(4), +last[1].toFixed(4)]);
        if (dec.length < 3) continue;
        const closed = Math.hypot(dec[0][0] - dec[dec.length - 1][0], dec[0][1] - dec[dec.length - 1][1]) < 0.08;
        outlines.push({ pts: dec, closed, len: +pl.len.toFixed(3) });
      }
    } catch { /* outlines are an enrichment — the schema stands without them */ }
    // PAINT.7 (2026-08-21) — THE FULL TRACE. Live judgment on the subject test:
    // 8 edge fragments + a hull render as "a gray trapezoid with squiggles" —
    // the abstraction ceiling of boxes/fragments can never let the operator
    // determine the subject. But the tracer's FULL output IS a recognizable
    // line drawing (it ships as the 'lineart' render style already). So the
    // schema keeps her complete VECTOR memory of the shape — up to 120
    // simplified strokes, ≤16 points each (~6-10KB, vectors not pixels, redrawn
    // by her hand with her ink + per-attempt jitter — mimicry of appearance,
    // per the operator's explicit directive, never a pixel copy).
    const trace = [];
    try {
      const all = strokes
        .map(s => {
          if (!s) return null;
          if (s.type === 'line' && Number.isFinite(s.x0)) return [[s.x0, s.y0], [s.x1, s.y1]];
          if (s.type === 'poly' && Array.isArray(s.pts) && s.pts.length >= 2) return s.pts;
          return null;
        })
        .filter(Boolean)
        .map(pts => {
          let len = 0;
          for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          return { pts, len };
        })
        .sort((a, b) => b.len - a.len)
        .slice(0, 260);   // PAINT.7b — 120→260 kept strokes: the read lives in the long ones, the RICHNESS in the tail
      for (const tl of all) {
        const step = Math.max(1, Math.ceil(tl.pts.length / 20));
        const dec = [];
        for (let i = 0; i < tl.pts.length; i += step) dec.push([+tl.pts[i][0].toFixed(4), +tl.pts[i][1].toFixed(4)]);
        const last = tl.pts[tl.pts.length - 1];
        if (dec.length && (dec[dec.length - 1][0] !== +last[0].toFixed(4))) dec.push([+last[0].toFixed(4), +last[1].toFixed(4)]);
        if (dec.length >= 2) trace.push(dec);
      }
    } catch { /* the trace is an enrichment — schema stands without it */ }
    // COLORART — a color per trace stroke, sampled along the stroke's own
    // points from the same reconstruction: her contours redraw in the colors
    // the real thing had there, not one monotone ink.
    const traceRgb = [];
    if (_img && _img.data && _img.width) {
      const W3 = _img.width, H3 = _img.height;
      for (const tp of trace) {
        let r = 0, g = 0, b = 0, n = 0;
        const step = Math.max(1, Math.floor(tp.length / 6));
        for (let i = 0; i < tp.length; i += step) {
          const x = Math.max(0, Math.min(W3 - 1, Math.round(tp[i][0] * W3)));
          const y = Math.max(0, Math.min(H3 - 1, Math.round(tp[i][1] * H3)));
          const o = (y * W3 + x) * 4;
          r += _img.data[o]; g += _img.data[o + 1]; b += _img.data[o + 2]; n++;
        }
        traceRgb.push(n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null);
      }
    }
    const schema = {
      v: 2,   // OWNART.7 — v2 = 5×5 cell indices; v1 (3×3) schemas still DRAW fine (cx/cy/w/h/ang are grid-independent) but must never CELL-MERGE with v2
      parts: parts.slice(0, 25),
      outlines,
      trace,
      traceRgb,   // COLORART — per-stroke sampled colors, aligned with trace by index
      palette,
      aspect: +(bw / bh).toFixed(3),
      frame: { x: +x0.toFixed(3), y: +y0.toFixed(3), w: +bw.toFixed(3), h: +bh.toFixed(3) },
      segCount: segs.length,
      learnedAt: Date.now(),
      looks: 1,
    };
    // Merge with any prior schema for this concept — a SECOND look refines the
    // averages instead of replacing them (that is what looking twice is for), and
    // `looks` records how well she actually knows the thing's shape.
    try {
      const store = this._vmStore();
      const e = store.get(key);
      // FORMBANK — snapshot the fresh look BEFORE the merge mutates its part
      // positions: the bank holds looks as seen, never averages of averages.
      const _pureLook = { ...schema, parts: schema.parts.map(p => ({ ...p })) };
      if (e) {
        const prev = e.schema;
        // Merge by cell index ONLY within the same schema version — a v1 cell 4
        // (3×3 centre) and a v2 cell 4 (5×5 top row) are different places, and
        // averaging them would smear the layout. A v1 prior is simply replaced
        // by the finer v2 look (the new look carries more structure anyway).
        if (prev && prev.v === schema.v && Array.isArray(prev.parts)) {
          const byCell = new Map(prev.parts.map(p => [p.cell, p]));
          for (const p of schema.parts) {
            const q = byCell.get(p.cell);
            if (!q) continue;
            const n = (prev.looks || 1), w = 1 / (n + 1);
            p.cx = +(q.cx * (1 - w) + p.cx * w).toFixed(4);
            p.cy = +(q.cy * (1 - w) + p.cy * w).toFixed(4);
            p.w = +(q.w * (1 - w) + p.w * w).toFixed(4);
            p.h = +(q.h * (1 - w) + p.h * w).toFixed(4);
            p.weight = +(q.weight * (1 - w) + p.weight * w).toFixed(4);
          }
          schema.looks = (prev.looks || 1) + 1;
          if ((!schema.palette || !schema.palette.length) && prev.palette) schema.palette = prev.palette;
          // PAINT.2 — a fresh trace's contours win (more information than an old
          // one), but never lose contours a prior look banked if this trace was thin.
          if ((!schema.outlines || !schema.outlines.length) && Array.isArray(prev.outlines) && prev.outlines.length) schema.outlines = prev.outlines;
        }
        // FORMBANK (2026-08-21) — the capability asked for: having seen two
        // differently-coloured instances of a subject in one pose, she can draw
        // a THIRD colour in a DIFFERENT pose. The
        // weighted merge smears every look into ONE average form; the BANK
        // keeps each look's schema as a distinct VARIANT (a distinct pose/
        // form of the thing) so drawing can pick a form and recombine colors.
        // Cap 3 FIFO; only PURE looks bank (the fresh look snapshotted before
        // the merge mutated it, plus look #1 which the prior still is at look
        // #2), deduped by coarse layout so a re-look of the same pose can't
        // fill the bank with copies.
        if (prev && prev.v === schema.v && Array.isArray(prev.parts) && prev.parts.length) {
          e.schemaBank = Array.isArray(e.schemaBank) ? e.schemaBank : [];
          const lay = (s) => s.parts.map(p => `${p.cell}:${Math.round(p.cx * 20)},${Math.round(p.cy * 20)}`).join('|');
          const bankIfNew = (s) => {
            if (!s || !Array.isArray(s.parts) || !s.parts.length) return;
            const L = lay(s);
            if (e.schemaBank.some(b => lay(b) === L)) return;
            e.schemaBank.push(s);
            while (e.schemaBank.length > 3) e.schemaBank.shift();
          };
          if ((prev.looks || 1) === 1) bankIfNew(prev);   // look #1, still pure
          bankIfNew(_pureLook);                            // this look, pre-merge
        }
        e.schema = schema;
        // In-place mutation bypasses the Map set() hook — mark the key dirty
        // explicitly so the learned schema reaches the DB.
        this._vmMarkDirty(key, false);
      }
    } catch { /* schema storage best-effort — the schema still returns for immediate use */ }
    return schema;
  },

  // Dominant chroma of a field C, read from the reconstructed thumbnail. 4 colours,
  // coarse — a colour FAMILY, not a lookup table of the reference's pixels.
  // PAINT.6 — the pixel-true palette: reconstruct the perceived field and
  // histogram the center 60% (the subject; the edges are backdrop) into the 4
  // dominant color families, 32-level quantized. This is knowledge about the
  // THING's coloring, ~48 bytes — not pixels, not a copy.
  async _schemaPaletteFromRec(rec, imgOpt) {
    try {
      let img = imgOpt;   // COLORART — the caller may hand in the reconstruction it already paid for
      if (!img) {
        if (!this.mindSpace || typeof this.mindSpace.imagine !== 'function') return [];
        img = await this.mindSpace.imagine(rec, 0);
      }
      if (!img || !img.data || !img.width) return [];
      const W = img.width, H = img.height;
      const x0 = Math.floor(W * 0.2), x1 = Math.ceil(W * 0.8);
      const y0 = Math.floor(H * 0.2), y1 = Math.ceil(H * 0.8);
      const bins = new Map();
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const o = (y * W + x) * 4, r = img.data[o], g = img.data[o + 1], b = img.data[o + 2];
          const k = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
          let e = bins.get(k);
          if (!e) { e = { n: 0, r: 0, g: 0, b: 0 }; bins.set(k, e); }
          e.n++; e.r += r; e.g += g; e.b += b;
        }
      }
      return [...bins.values()].sort((a, b) => b.n - a.n).slice(0, 4)
        .map(e => [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)]);
    } catch { return []; }
  },

  _schemaPalette(rec) {
    if (!this.mindSpace || typeof this.mindSpace.reconstructSync !== 'function') {
      // No sync reconstruct available: derive from the packed chroma DC terms, which
      // is all we need for "roughly what colour is this thing".
      const out = [];
      try {
        const cb = rec.channels && rec.channels.Cb, cr = rec.channels && rec.channels.Cr;
        const dc = (c) => { if (!c || !c.val_b64) return 0; const b = Buffer.from(c.val_b64, 'base64'); return b.length >= 2 ? b.readInt16LE(0) : 0; };
        const b = dc(cb), r = dc(cr);
        // Y is unknown here; assume mid luma and let her mood shift it at render time.
        const y = 140;
        const R = Math.max(0, Math.min(255, Math.round(y + 1.402 * (r / 8))));
        const G = Math.max(0, Math.min(255, Math.round(y - 0.344 * (b / 8) - 0.714 * (r / 8))));
        const B = Math.max(0, Math.min(255, Math.round(y + 1.772 * (b / 8))));
        out.push([R, G, B]);
      } catch { /* no palette */ }
      return out;
    }
    return [];
  },

  // TU.29.12 — count coefficients above the reconstruction drop-tiny floor
  // across channels: the real measure of whether a field C is an IMAGE or a
  // near-uniform blank. Cheap (reads the packed values, no transform).
  _recDetail(rec) {
    if (!rec || !rec.channels) return 0;
    let n = 0;
    try {
      for (const name of ['Y', 'Cb', 'Cr']) {
        const c = rec.channels[name];
        // BLOBSTORE — this runs on STORE recs (the recall floor at h.e.rec),
        // which are binary-resident after restore; reading only val_b64 here
        // returned 0 for every restored memory and the recall lane silently
        // refused all of them (outside critique pointed at this exact class
        // of consumer — right neighborhood, and a real find).
        if (!c || !(c.val_b64 || c.val_bin)) continue;
        const bin = c.val_bin
          ? Buffer.from(c.val_bin.buffer || c.val_bin, c.val_bin.byteOffset || 0, c.val_bin.byteLength ?? c.val_bin.length)
          : Buffer.from(c.val_b64, 'base64');
        for (let i = 0; i + 1 < bin.length; i += 2) {
          const v = bin.readInt16LE(i);
          if (v > 2 || v < -2) n++;
        }
      }
    } catch { return rec.equation_count || 0; }
    return n;
  },

  // ── DRAW-ENGINE (2026-07-15) — SHE LOOKS IT UP ───────────────────────────────────────────
  // Definition-driven Pollinations REFERENCE prompt for a concept she wants to
  // draw but has NOT seen. Her LEARNED definition's content words ride the prompt
  // (horse → "large animal four legs mane tail"), and the frame is steered CLEAN
  // (single centered subject, plain background, high contrast) so it traces into a
  // legible drawing — her GOTH interpretation happens on the DRAWING side (trace +
  // palette), never here. Abstract concepts concretize through the generator
  // itself (anger → an angry face, halloween → a jack-o'-lantern); the returned
  // image is BOUND to the concept, so she relates the concrete picture back to the
  // word. Reference, not fact.
  _referenceImagePrompt(concept) {
    const c = String(concept || '').toLowerCase().replace(/[^a-z' -]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!c) return '';
    // ⚠ Hoisted to function scope: the definition-tail filter below computes
    // this inside a nested try, and the subject framing at the end of the
    // function needs it too. Left where it was it is a ReferenceError that
    // `node --check` cannot see. Defaults FALSE — an unavailable taxonomy
    // means "not known to be a person", which is the safe framing.
    let conceptIsPerson = false;
    let defTail = '';
    try {
      const cx = this.cortexCluster;
      const d = (cx && typeof cx.lookupDefinitionSync === 'function') ? cx.lookupDefinitionSync(c) : null;
      if (d && typeof d === 'string') {
        // TAXONOMY-BUILT TAIL — no stop-word list, no person list (operator
        // law 2026-08-21: word lists cannot cover the real world). A tail word
        // survives only if WordNet KNOWS it as a noun or adjective — function
        // words, inflections and glue are absent from those indexes and fall
        // away by themselves. And a word whose PRIMARY sense files under
        // noun.person drops unless the concept itself is a person: teaching-age
        // definitions constantly say "a child who…" / "an object for children
        // to…", and those human words riding the prompt made the generator
        // paint CHILDREN for non-person concepts (operator report 2026-08-21).
        let words = d.toLowerCase().split(/[^a-z]+/).filter(w2 => w2.length > 2 && w2 !== c);
        try {
          const tax = this._drawTaxonomy || (this._drawTaxonomy = require('../drawable-taxonomy.js'));
          conceptIsPerson = tax.primaryLex(c) === 18;
          words = words.filter(w => tax.knownDescriptor(w) && (conceptIsPerson || tax.primaryLex(w) !== 18));
        } catch { /* taxonomy unavailable — the raw tail stands */ }
        if (words.length) defTail = ' ' + [...new Set(words)].slice(0, 6).join(' ');
      }
    } catch { /* bare concept prompt */ }
    // COLOURFUL, not monochrome (ruled 2026-07-15: no more pencil art). The old
    // "simple ... high contrast" biased Pollinations toward black-on-white LINE
    // drawings — the field render of a monochrome reference looks like pencil.
    // Bias vibrant FULL-COLOUR + soft shading so her recreations are beautiful and
    // coloured; keep single-centred-subject + clean background for legible tracing.
    // REALISTIC, not cutesy (reported 2026-07-17: far too many kittens, puppies
    // and funky characters, as though some meta prompt were strong enough to
    // make every look-up outlandish and off-canon). The word
    // "illustration" dragged the generator into cartoon-mascot/cute-character
    // territory on anything ambiguous. Steer PHOTOGRAPHIC + true-to-life: her
    // look-ups are LEARNING references (what the thing actually looks like);
    // colour stays, the cutesy stylization dies. POSITIVE terms ONLY (an
    // image model attends to the nouns — writing "no cartoon" PAINTS cartoons);
    // her own interpretation still happens on the DRAWING side, never here.
    // AGESTEER (2026-08-21) — MEASURED root cause of the children look-ups:
    // the generator's own prior resolves age-less role words toward the very
    // young ("friend" alone → teen girls, "teacher" + our full documentary
    // steering → a schoolgirl; def tails were CLEAN — 35/2207 carried a child
    // word). POSITIVE steering, never a negative prompt: a person word that
    // is NOT in WordNet's juvenile subtree rides "adult" (her own dictionary's
    // framing — "woman: an ADULT female human"); boy/baby/child stay young
    // because they ARE the juvenile subtree. Verified on pinned seeds:
    // "friend, adult…" → an unmistakable adult on the same seed that gave
    // teen girls.
    let ageSteer = '';
    try {
      const tax = this._drawTaxonomy || (this._drawTaxonomy = require('../drawable-taxonomy.js'));
      // ⚠ Person-ness is decided HERE, not in the definition-tail block above:
      // that block only runs when a definition is available, so a person word
      // with no cached definition would fall through to object framing.
      conceptIsPerson = tax.primaryLex(c) === 18;
      if (conceptIsPerson && typeof tax.descendsFromJuvenile === 'function' && !tax.descendsFromJuvenile(c)) ageSteer = ', adult';
    } catch { /* taxonomy unavailable — the un-steered prompt stands */ }
    // ⛔ PROMPTBLEED — THE TAIL WAS A PORTRAIT RECIPE, APPLIED TO EVERYTHING.
    //
    // Reported: every concept she looked up came back as a profile image of a
    // young person. The concept words were CLEAN — printed for eight
    // concepts, and object words carried no person steering at all, so the
    // age-steer was not misfiring. The bleed was the shared tail:
    // *"documentary photography, natural lighting, single centered subject,
    // plain uncluttered background"* is the canonical description of a
    // PORTRAIT SHOOT, and a generator handed that resolves an ambiguous or
    // weak subject noun into a person.
    //
    // ⚠ The previous pass SAW this and did not follow it — its own note reads
    // *"teacher + our full documentary steering → a schoolgirl"*. It fixed the
    // AGE (adult vs child) and never questioned the PERSON-NESS, so the
    // steering kept pulling toward people and `adult` only made them older.
    //
    // ⭐ Verified the way this lane demands: PINNED-SEED A/B on the same word,
    // only the tail differing, judged by the operator — *"B's are all 100%
    // better"* across chair / hammer / apple.
    //
    // ⚠ KEPT deliberately: `color photograph` + `full color, richly detailed`.
    // Those carry the two earlier fixes in this same string — photographic
    // realism (which killed the cartoon-mascot problem) and full colour (which
    // killed the black-on-white line drawings that field-rendered as pencil).
    // Only the portrait-recipe terms are gone.
    //
    // ⚠ POSITIVE terms only, per the standing rule: nothing here says "not a
    // person", because an image model attends to the nouns it is given.
    // STYLEBLEED — the strings live in eye-style.js (byte-identical; the ONE
    // owner the drawability gate derives its provenance set from).
    const { EYE_STYLE } = require('./eye-style.js');
    const subjectFraming = conceptIsPerson ? EYE_STYLE.photoPerson : EYE_STYLE.photoObject;
    return `${c}${ageSteer}${defTail}, ${subjectFraming}${EYE_STYLE.refTail}`;
  },

  // Fetch a Pollinations REFERENCE for a concept, perceive it into a field C
  // HEADLESSLY (no browser — the box decodes the render itself), and bind it
  // PROVISIONALLY into visual memory. Returns the rec so the caller draws from
  // what she just looked at. Reference-not-fact, by ruling: binds conf:false on first
  // sight (a one-off render never becomes grounded truth), confirmed only when a
  // later independent render AGREES (percept cosine ≥ 0.45) — the same noisy-
  // oracle discipline as _ingestVisualFrame. Node fetch + jpeg-js/pngjs decode
  // (server deps, auto-installed on the box). Cooldown-gated (never hammer the
  // generator for one word), global-paced, in-flight-guarded, best-effort.
  // ── LOOKEYES.1 (2026-08-21) — the look lane gets EYES ON ITSELF. Live symptom:
  // 113 draw attempts, 2 concepts ever seen in ~10h, zero log evidence — because
  // every post-budget failure in this function was silent by construction
  // (perceive died in a bare `catch { return null; }`, decode-null returned
  // without a word, the success line went to process.stdout.write which the
  // console ring cannot see), and the 10-minute GLOBAL budget plus the 6-hour
  // per-concept cooldown were burned AT ENTRY — so whatever stage was dying ate
  // the entire lookup budget forever and left nothing behind. Her eyes starved
  // in silence and the mind's eye fell back to letter-scratch "drawings".
  //
  // Two rules now: EVERY exit increments a named counter (surfaced at
  // state.ownArt.lookups so the dashboard can answer "why isn't she looking"),
  // and a FAILED attempt ROLLS ITS BURNS BACK — global retry in 60s, concept
  // retry in 10min — so one broken stage no longer forfeits the whole budget.
  // A SUCCESS keeps the full burns exactly as before (storm protection intact).
  _vmLook() {
    if (!this._vmLookStats) {
      this._vmLookStats = {
        attempts: 0, grounded: 0, notDrawable: 0, gapSkips: 0, coolSkips: 0,
        // LOOKORDER — the two lanes that now serve a concept WITHOUT a fetch.
        // ⭐ These are the success counters of the whole change: `alreadyKnown`
        // rising means her own memory answered, `definitionServed` rising means
        // her own dictionary did. Together they are the measure of how much of
        // what she knows things look like came from inside her rather than
        // from a generator. Declared HERE rather than created on first use, so
        // a lane that has never fired reads 0 instead of undefined.
        alreadyKnown: 0, definitionServed: 0,
        inFlightSkips: 0, noPrompt: 0, httpFails: 0, fetchErrs: 0, decodeFails: 0,
        perceiveFails: 0, blankRefs: 0, lastErr: null, lastErrAt: 0, lastGroundedKey: null, lastGroundedAt: 0,
        // LOOKBACKOFF.1 — the rate-limit lane, declared here for the same
        // reason as the rest: a lane that has never fired must read 0, not
        // undefined. `rateLimitSkips` is the count of looks NOT attempted
        // because the generator had already told us to stop.
        rateLimitSkips: 0, rateLimitHits: 0, backoffMs: 0, backoffUntil: 0,
        // LOOKQUEUE.1 — `globalInFlightSkips` is the number of looks NOT
        // started because one was already running (the pipe is one lane
        // wide); `chatYields` is the number stood down so a human's image
        // request could have the lane. Both are the system behaving
        // CORRECTLY, so they must be readable rather than inferred.
        globalInFlightSkips: 0, chatYields: 0,
        // CHATPREEMPT.1 — declared up front so the published block always
        // carries them. `chatYields` counts looks that STOOD DOWN before
        // starting; `chatPreempts` counts looks KILLED MID-FETCH to free the
        // pipe. Different events, and only the second one explains a 429 that
        // stopped happening.
        chatPreempts: 0, lastChatPreemptKey: null,
        // TEXTFIG — the textbook-figure lane. Separate counters from the
        // generator lane on purpose: a figure is an AUTHORED diagram with
        // human-written alt text, not a noisy render, so mixing its successes
        // into `grounded` would flatter the generator's hit rate with work it
        // did not do.
        figAttempts: 0, figGrounded: 0, figHttpFails: 0, figDecodeFails: 0,
        figPerceiveFails: 0, figBlank: 0, figAlreadyHeld: 0,
        lastFigKey: null, lastFigAt: 0,
      };
    }
    return this._vmLookStats;
  },
  // Named-stage failure: counter + throttled warn (ring-visible) + burn ROLLBACK.
  _vmLookFail(key, stage, detail) {
    const st = this._vmLook();
    st[stage] = (st[stage] || 0) + 1;
    st.lastErr = `${stage}:${key}${detail ? ' — ' + String(detail).slice(0, 120) : ''}`;
    st.lastErrAt = Date.now();
    const GAP = Number(process.env.DREAM_REF_FETCH_GAP_MS) > 0 ? Number(process.env.DREAM_REF_FETCH_GAP_MS) : 0;
    const COOL = Number(process.env.DREAM_REF_FETCH_COOLDOWN_MS) || 21600000;
    // Roll the entry burns back to short retry windows: the attempt bought
    // nothing, so most of the cooldown comes back — the concept retries in
    // 10min instead of 6h (and if an ops-tuned global gap is armed, it retries
    // in 60s instead of the full gap). Still enough back-off that a hard-down
    // generator is never hammered per-tick for the same word.
    try {
      this._vmLastRefFetchAt = Date.now() - Math.max(0, GAP - 60000);
      if (this._vmRefFetchAt) this._vmRefFetchAt.set(key, Date.now() - Math.max(0, COOL - 600000));
    } catch { /* rollback best-effort */ }
    if (!this._vmLookWarnAt || Date.now() - this._vmLookWarnAt > 60000) {
      this._vmLookWarnAt = Date.now();
      console.warn(`[VisualMemory] LOOK FAILED at stage=${stage} for "${key}"${detail ? ` (${String(detail).slice(0, 120)})` : ''} — cooldown rolled back (concept retries in 10min). Totals: ${st.attempts} attempts, ${st.grounded} grounded.`);
    }
    return null;
  },

  /**
   * LOOKORDER step 2 — can her own DICTIONARY carry this concept, so no
   * generated image is needed at all?
   *
   * Delegates to `_defDrawAttributes` rather than re-deriving anything: that
   * is the same reader the definition-driven painter already uses, and its
   * consumer's own bar is "a shape OR at least one colour". Reusing the
   * predicate means the two can never disagree about what is drawable from a
   * definition — if this says yes, the painter can genuinely build it.
   *
   * ⚠ Deliberately SYNCHRONOUS and deliberately NOT calling the async
   * drawability gate. Concrete attributes ARE the concreteness evidence: an
   * abstract word's definition does not yield a shape or a colour, which is
   * precisely why the painter uses this test. Adding an await here would put
   * a second async hop in front of every look-up to re-answer a question the
   * attributes already answer.
   *
   * ⚠ Cross-mixin call: `_defDrawAttributes` lives in the chat mixin, and
   * both are Object.assign'd onto the same ServerBrain prototype. Guarded by
   * typeof so a future split cannot turn this into a silent no-op.
   */
  _conceptDefinitionCanDraw(word) {
    if (typeof this._defDrawAttributes !== 'function') return false;
    let attr = null;
    try { attr = this._defDrawAttributes(word); } catch { return false; }
    if (!attr) return false;
    return !!(attr.shape || (Array.isArray(attr.colors) && attr.colors.length > 0));
  },

  /**
   * TEXTFIG.2 / .3 / .7 — perceive ONE textbook figure and put it in her eye.
   *
   * ⭐ WHY THIS IS NOT `_fetchReferenceAndGround` WITH A DIFFERENT URL. That
   * lane exists to interrogate a NOISY ORACLE: it builds a prompt, renders,
   * and then makes a second independent render prove the first (LOOKTWICE),
   * because a generator that does not know a word produces confident noise.
   *
   * ⛔ A textbook figure is the opposite kind of thing. It is an AUTHORED
   * diagram that a human captioned, shipped under a licence this corpus has
   * already read, and tied to prose she is being taught in the same breath.
   * There is no second seed to disagree with, and demanding one would reject
   * every figure. So LOOKTWICE is deliberately NOT applied here — and that is
   * a REASON, not an omission, which is why it is written down.
   *
   * ⚠ What IS kept from that lane, because it guards against a real failure
   * rather than an oracle: the decode-null check, the near-uniform detail
   * floor (a blank plate is not a percept), and named per-stage counters.
   *
   * @param {{url:string, alt?:string, caption?:string}} fig
   * @param {{key?:string, theme?:string, show?:boolean}} opts
   */
  async _perceiveTextbookFigure(fig, opts = {}) {
    if (!fig || !fig.url) return null;
    if (!this.mindSpace || typeof this.mindSpace.perceive !== 'function') return null;
    if (typeof fetch !== 'function') return null;
    const st = this._vmLook();
    const now = Date.now();

    // The key is namespaced `fig:` so a diagram NEVER overwrites what she has
    // learned a word looks like. A physics figure of a car on a banked curve is
    // evidence about that chapter, not a replacement for her memory of "car".
    const label = String(opts.key || opts.theme || fig.alt || 'figure')
      .toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
    const key = `fig:${label}`;
    st.figAttempts = (st.figAttempts | 0) + 1;

    // Already held — a figure is a fixed image, so re-perceiving it can only
    // reproduce the same record. Unlike a generated reference there is no
    // "look again and see if it agrees" value.
    try {
      const held = this._vmStore() && this._vmStore().get(key);
      if (held && held.rec) { st.figAlreadyHeld = (st.figAlreadyHeld | 0) + 1; return null; }
    } catch { /* store unreadable — fall through and perceive */ }

    // ⭐⭐ WAVESEE.1 — THE PRECOMPUTED FIELD IS TRIED FIRST, AND IT IS A PERCEPT
    // SOURCE RATHER THAN A CACHE. Every corpus figure was already transformed
    // once into `UnityAILab/BrainWaves`; reading that field yields the SAME
    // `rec` this lane would spend a fetch, a decode and a full CDF 9/7 transform
    // to rebuild — measured at ~64 CPU-hours and 32,296 third-party requests
    // across the set. Everything below this block is untouched, which is the
    // whole point: she sees a field exactly the way she sees a camera frame or
    // her own drawing, through `describe` → `store.set` → `_queuePhraseTeach`.
    //
    // ⚠ A MISS IS ORDINARY. About a fifth of figures never produced a field
    // (dead URLs, non-Wikimedia SVGs, GIFs) and the network path below is
    // correct for all of them, so a miss is counted and never logged as an
    // error. `figFieldStub` is the one that matters — see the module.
    let rec = null;
    let fieldPhrase = null;
    try {
      const ff = require('../figure-field-store.js').loadField(fig.url);
      if (ff && ff.rec) {
        rec = ff.rec;
        fieldPhrase = ff.phrase || null;
        st.figFromField = (st.figFromField | 0) + 1;
      }
    } catch (e) {
      // The field store must never be able to stop her seeing. A broken read
      // here falls through to the network exactly as a miss would.
      st.figFieldErrs = (st.figFieldErrs | 0) + 1;
      st.lastErr = `field store: ${e && e.message}`; st.lastErrAt = now;
    }

    // ⛔⛔ FIGPAIR.1 — `fieldOnly` IS THE GATE THAT KEEPS INLINE PERCEPTION
    // AFFORDABLE. The section-walk in `_trainAcademicStories` perceives a
    // section's figures beside its prose, which is only cheap on the field path
    // (~50ms a local read). On a MISS this must NOT fall through to
    // fetch+decode+transform at ~7.7s each — `math/grade10` alone would put 5.9
    // HOURS inside one cell pass, the exact failure the background drain exists
    // to prevent. A miss returns null and the figure rides the queue instead.
    // **Field hit → inline, beside its text. Miss → the queue. Never the reverse.**
    if (!rec && opts.fieldOnly) {
      st.figFieldOnlyMiss = (st.figFieldOnlyMiss | 0) + 1;
      return null;
    }

    if (!rec) {
      let buf;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => { try { ctrl.abort(); } catch { /* nf */ } }, 30000);
        let r;
        try { r = await fetch(fig.url, { signal: ctrl.signal }); } finally { clearTimeout(t); }
        if (!r || !r.ok) {
          st.figHttpFails = (st.figHttpFails | 0) + 1;
          st.lastErr = `figure HTTP ${r ? r.status : '?'}`; st.lastErrAt = now;
          return null;
        }
        buf = Buffer.from(await r.arrayBuffer());
      } catch (e) {
        st.figHttpFails = (st.figHttpFails | 0) + 1;
        st.lastErr = `figure fetch: ${e && e.message}`; st.lastErrAt = now;
        return null;
      }

      const img = this._decodeImageToRGBA(buf);
      if (!img) {
        st.figDecodeFails = (st.figDecodeFails | 0) + 1;
        st.lastErr = `figure undecodable (${buf ? buf.length : 0} bytes)`; st.lastErrAt = now;
        return null;
      }
      const small = this._perceptSource(img, 'corpus figure');
      st.figTransformed = (st.figTransformed | 0) + 1;
      try { rec = await this.mindSpace.perceive({ width: small.w, height: small.h, data: small.data }); }
      catch (e) {
        st.figPerceiveFails = (st.figPerceiveFails | 0) + 1;
        st.lastErr = `figure perceive: ${e && e.message}`; st.lastErrAt = now;
        return null;
      }
    }

    // Applies to BOTH sources on purpose. A field that arrived truncated and a
    // transform that returned nothing are the same defect from here on, and the
    // floor below (`_recDetail`) is likewise shared — a precomputed percept gets
    // no more trust than one she just made.
    if (!rec || !rec.channels) {
      st.figPerceiveFails = (st.figPerceiveFails | 0) + 1;
      st.lastErr = 'figure perceive returned empty rec'; st.lastErrAt = now;
      return null;
    }
    // A diagram that came back near-uniform is a blank plate or a failed
    // decode wearing a valid shape — same floor the reference lane uses.
    if (typeof this._recDetail === 'function'
        && this._recDetail(rec) < (Number(process.env.DREAM_REF_MIN_DETAIL) || 200)) {
      st.figBlank = (st.figBlank | 0) + 1;
      return null;
    }
    rec.fidelity = { psnr_db: null, source: 'textbook-figure' };

    // The words that came WITH the picture. This is the whole reason a textbook
    // figure is worth more than a generated one: the description is authored by
    // the same people who drew the diagram, so the label is trustworthy in a
    // way a prompt echo never is.
    //
    // ⭐⭐ AND THE CORPUS PROSE THE PICTURE SITS INSIDE, which is the part that
    // makes the reference between text and image correct rather than
    // approximate. A caption is the picture's OWN words — for thousands of
    // figures it is nothing but a numbered title ("Figure 1.1 World Exports,
    // 1948-2008"), which binds a diagram to a number and a date. The ingest now
    // captures the surrounding body prose through the very cleaner that produced
    // the cell's sentences, so these are the SAME STRINGS the cell trained on
    // and the tie between the two is a match, not an inference.
    //
    // ⚠ ORDER IS DELIBERATE: label first, context second. The label is the more
    // specific evidence about what is IN the frame, and the length bound cuts
    // from the tail — so a bound that bites keeps the picture's own words and
    // loses the outer edge of its context, never the reverse.
    // ⚠ THE ROW'S OWN WORDS WIN, AND THE FIELD'S ARE ONLY A FALLBACK. The queued
    // figure carries its `alt`/`caption`/`context` with it (the CAMPOISON rule —
    // a binding resolved at perception time reads ambient state and is how an
    // unlabelled frame once became her memory of a word). The field file happens
    // to carry the same prose, but preferring it would move the source of truth
    // off the row and quietly re-open that. Used ONLY when the row has none.
    const phrase = ([fig.alt, fig.caption, fig.context].filter(Boolean)
      .join(' ').replace(/\s+/g, ' ').trim().slice(0, 900) || null)
      || (fieldPhrase ? String(fieldPhrase).replace(/\s+/g, ' ').trim().slice(0, 900) : null);

    try {
      const store = this._vmStore();
      let percept = null;
      try { const d = await this.mindSpace.describe(rec); if (d) percept = Array.from(d); } catch { percept = null; }
      store.delete(key);
      // `conf: true` — confirmed on arrival, because the confirmation standard
      // here is PROVENANCE (an authored, licensed, human-captioned diagram)
      // rather than agreement between two guesses.
      store.set(key, { rec, at: now, seen: 1, conf: true, p: percept, phrase, figure: { url: fig.url, theme: opts.theme || null } });
      this._vmTrimResident(store);   // evicts from RAM; the row STAYS on disk
      this._vmSaveSoon();
      st.figGrounded = (st.figGrounded | 0) + 1;
      st.lastFigKey = key; st.lastFigAt = now;

      // ⛔⛔ THE WORDS WERE STORED AND NEVER TAUGHT. Everything above banks the
      // percept and writes the phrase onto the record — and nothing bound one to
      // the other, so a diagram's own caption and the prose it illustrates sat in
      // the store as a string nobody learned. The look lane has done this since
      // it shipped (`_queuePhraseTeach`); the figure lane simply never called it,
      // which made "the picture arrives with its text" true of the DATA and false
      // of the brain.
      //
      // ⚠ NO TRUST GATE HERE, and that difference is the point. The look lane
      // gates on `_anyTrustedBind` because a generated render is one unconfirmed
      // guess whose wording she may yet reject. A textbook figure is authored,
      // captioned by the people who drew it, and licensed — the same provenance
      // that lets this lane skip LOOKTWICE — so its words are evidence on
      // arrival. Queued, never awaited, and bounded by the queue's own caps.
      try {
        if (phrase && typeof this._queuePhraseTeach === 'function') this._queuePhraseTeach(phrase);
      } catch { /* non-fatal — perceiving a figure must never fail on its teach */ }

      // ⭐ TEXTFIG.7 — SHE SEES IT. Corpus figures must appear in her mind's eye
      // as well, not only be perceived. Same publish the look lane uses, so a figure is a
      // grounded frame exactly like a looked-up reference.
      if (opts.show !== false) {
        try {
          this._lastGroundedEyeAt = now;
          this._mindsEyeJson = JSON.stringify({ type: 'mindsEye', rec, terms: rec.equation_count || 0, source: 'figure:' + label, at: now });
          if (this.clients && this.clients.size > 0) {
            const p = JSON.stringify({ type: 'imagine', terms: rec.equation_count || 0, source: 'figure:' + label, ts: now });
            for (const [ws] of this.clients) { if (ws.readyState === 1) { try { ws.send(p); } catch { /* nf */ } } }
          }
        } catch { /* viewer publish best-effort */ }
      }
      // console.log, not process.stdout.write — the console ring only captures
      // console.*, and a success that the ring cannot see is a success nobody
      // can diagnose remotely (the LOOKEYES blind spot, third occurrence).
      console.log(`[VisualMemory] FIGURE perceived "${label}" — ${rec.equation_count || 0} terms, ${small.w}x${small.h}${phrase ? ` — "${phrase.slice(0, 60)}"` : ''}`);
      return rec;
    } catch (e) {
      st.figPerceiveFails = (st.figPerceiveFails | 0) + 1;
      st.lastErr = `figure store: ${e && e.message}`; st.lastErrAt = now;
      return null;
    }
  },

  async _fetchReferenceAndGround(concept, opts = {}) {
    if (!this.mindSpace || typeof this.mindSpace.perceive !== 'function') return null;
    if (typeof this._buildPollinationsImageUrl !== 'function') return null;
    if (typeof fetch !== 'function') return null;   // Node < 18 (the box is 18+)
    // opts.keyOverride — imagination combos ground under their OWN key ("a+b")
    // so a combined scene never pollutes the single concepts' visual memory.
    // opts.promptOverride — the caller supplies the full generation prompt
    // (imagination's unified-scene phrasing) instead of the def-driven single-
    // concept prompt.
    const key = opts.keyOverride || this._vmHeadWord(concept) || String(concept || '').toLowerCase().trim();
    if (!key) return null;
    const now = Date.now();

    // ─────────────────────────────────────────────────────────────────────
    // LOOKORDER — ⛔ MEMORY FIRST, THEN THE DICTIONARY, AND ONLY THEN FETCH.
    //
    // Operator directive: keep learning from a looked-up picture, but make a
    // generated render the LAST resort rather than the first move. A child
    // learns what a zebra looks like from a picture book someone else drew —
    // and does not go and look at a new one every time they think "zebra".
    //
    // Three things this buys at once:
    //   1. Fewer external renders shaping what she believes things look like.
    //   2. No network on the common path — recall and definitions are local.
    //   3. A stronger honest claim: MOST of what she knows things look like
    //      comes from her own memory and her own dictionary.
    //
    // ⚠ `opts.force` bypasses this ENTIRELY and must keep doing so — it is
    // what the ✗ reject button uses to deliberately re-look-up a bad drawing.
    // Blocking force here would silently break operator feedback.
    if (!opts.force) {
      // STEP 1 — DOES SHE ALREADY REMEMBER IT?
      // ⚠ CONFIRMED only (`conf === true`). A provisional entry is a single
      // unverified render that has not yet been agreed by a second look, and
      // treating one as a memory would let a one-off noisy image harden into
      // belief — the exact failure the two-seed check exists to prevent.
      // ⚠ This is distinct from the 6h cooldown below: that stops re-fetching
      // for six hours, after which a concept she has genuinely SEEN would be
      // fetched again forever. Memory has no expiry; a thing she knows the
      // look of does not need looking up.
      try {
        const _store = this._vmStore();
        const _known = _store && _store.get(key);
        if (_known && _known.conf === true && _known.rec) {
          this._vmLook().alreadyKnown = (this._vmLook().alreadyKnown | 0) + 1;
          return null;
        }
      } catch { /* store unreadable — fall through to the fetch, never fail closed on a look */ }

      // STEP 2 — CAN THE DICTIONARY CARRY IT?
      // Definition-driven drawing already builds from `lookupDefinitionSync`
      // (colours, shapes, part types read straight out of the definition), so
      // a word whose definition describes it concretely needs no image at
      // all. ⚠ Gated on the DRAWABILITY verdict rather than on the mere
      // presence of a definition: an abstract word has a definition too, and
      // it is exactly the class that traces to vector scatter. The bar is
      // CONCRETE ATTRIBUTES — a definition that yields a shape or a colour is
      // itself the concreteness evidence, which is why the painter uses the
      // same test and why no second async drawability hop is needed here.
      try {
        if (typeof this._conceptDefinitionCanDraw === 'function'
            && this._conceptDefinitionCanDraw(key)) {
          this._vmLook().definitionServed = (this._vmLook().definitionServed | 0) + 1;
          return null;
        }
      } catch { /* same posture — a judgement failure must not block a look */ }
    }
    // per-concept refetch cooldown — never spam the generator for the same word
    const COOL = Number(process.env.DREAM_REF_FETCH_COOLDOWN_MS) || 21600000;   // 6h
    if (!this._vmRefFetchAt) this._vmRefFetchAt = new Map();
    if (!opts.force && (now - (this._vmRefFetchAt.get(key) || 0)) < COOL) { this._vmLook().coolSkips++; return null; }
    // in-flight guard (per concept) + global pacing so a flood of unseen concepts
    // can't trigger a fetch storm
    if (!this._vmRefInFlight) this._vmRefInFlight = new Set();
    if (this._vmRefInFlight.has(key)) { this._vmLook().inFlightSkips++; return null; }
    // ⛔ LOOKQUEUE.1 (2026-08-26) — ONE LOOK IN THE PIPE, BRAIN-WIDE.
    //
    // Operator, diagnosing it himself: *"only beiong able to have one image gen
    // in the pipe with ananymous teir seems to suck up all the image gen with
    // the minds eye ... can we put them in a que or something and not allow the
    // minds eye to have more than one in the que"*. He was right, and the guard
    // directly above is exactly why: it is keyed by CONCEPT, so it only ever
    // stopped the same word twice. **Different words were never guarded at all.**
    //
    // ⛔ The arithmetic that makes it bite: `_lookUpAndDraw` is launched
    // FIRE-AND-FORGET from the imagine tick (~8s), a look takes 2-60s, and
    // since EYEPIN.2 every launch carries a DIFFERENT unseen word — so the
    // per-concept guard matches nothing and up to ~7 fetches run concurrently
    // against a tier that serves about one. The lane was not merely fast, it
    // was PARALLEL, and that is what starved the chat request.
    //
    // ⚠ Concurrency 1, NOT a time budget — this is not the global gap that was
    // revoked on the grounds that the tier is the anonymous free one and costs
    // nothing to use. Nothing here says "look less
    // often"; it says "finish the one you started before beginning another",
    // which is what a single-lane pipe means. Over an hour she still looks just
    // as many times, and each look now actually completes.
    if (!opts.force && (this._vmRefGlobalInFlight | 0) > 0) {
      this._vmLook().globalInFlightSkips++;
      return null;
    }
    // ⛔ CHAT WINS THE PIPE. The person in the room outranks the background
    // errand — the whole visible symptom was the operator's image request answering
    // "(image generation failed)" while she quietly ground her vocabulary.
    // `_imageLanePriorityUntil` is stamped by the chat path the moment it
    // returns `action: 'generate_image'`, so the browser's request (built
    // client-side, same public IP, same anonymous quota) gets a clear lane.
    if (!opts.force && this._imageLanePriorityUntil && now < this._imageLanePriorityUntil) {
      this._vmLook().chatYields++;
      return null;
    }
    // GLOBAL look-up gap — REVOKED by operator directive 2026-08-21 (default now
    // 0 = no brain-wide gap). The 10-minute budget was a KEYED-ACCOUNT-era rule:
    // renders cost real pollen then. The account keys are dead (2026-08-17 law)
    // and every reference now rides the anonymous free tier, so the only pacing
    // left is natural — the per-concept in-flight guard plus the 2-60s a look
    // takes to fetch + decode + perceive, ~one look per tick cadence. The
    // per-concept 6h cooldown above is NOT a rate limit and stays: it stops
    // re-generating a word she already holds. Set DREAM_REF_FETCH_GAP_MS to a
    // positive ms value to re-arm a global gap for ops tuning.
    const GAP = Number(process.env.DREAM_REF_FETCH_GAP_MS) > 0 ? Number(process.env.DREAM_REF_FETCH_GAP_MS) : 0;
    if (!opts.force && GAP > 0 && this._vmLastRefFetchAt && (now - this._vmLastRefFetchAt) < GAP) { this._vmLook().gapSkips++; return null; }
    // ⛔ LOOKBACKOFF.1 (2026-08-26) — HONOUR A 429. NOT A BUDGET.
    //
    // ⚠ This is deliberately NOT a re-arming of the global gap revoked on
    // 2026-08-21, on the grounds that the tier is the anonymous free one. That was a SELF-IMPOSED spend
    // budget from the keyed-account era, and revoking it was right. This is the
    // generator explicitly answering **HTTP 429 — stop**. Ignoring an explicit
    // refusal is not generosity toward her ability; it wins nothing, because a
    // refused request returns no image either way.
    //
    // ⛔ What made it urgent: the comment above claims the remaining pacing is
    // "natural — the per-concept in-flight guard plus the 2-60s a look takes".
    // That held while the look lane fired rarely. EYEPIN.2's acquisition rank
    // now picks a DIFFERENT unseen word on ~75% of ticks, and the per-concept
    // cooldown by construction only throttles REPEATS of one word — so it
    // throttles a walk through fresh vocabulary not at all. Measured 15 minutes
    // after that change shipped: **130 attempts, 108 of them HTTP 429**.
    //
    // ⛔ Worse, it was a POSITIVE FEEDBACK LOOP: `_vmLookFail` rolls the burns
    // back so a failed concept retries in 10 min instead of 6 h — so every 429
    // SCHEDULED ANOTHER RETRY. The harder we were refused, the harder we asked.
    //
    // ⭐ And the visible cost was not hers, it was the operator's: her chat
    // image generation is built BROWSER-side from the same public IP, so the
    // background acquisition lane was spending the shared anonymous quota and
    // the operator's own request came back "(image generation failed)". **A background
    // errand must not outbid the person in the room.**
    if (!opts.force && this._vmRef429Until && now < this._vmRef429Until) {
      const st = this._vmLook();
      st.rateLimitSkips++;
      st.backoffUntil = this._vmRef429Until;
      return null;
    }
    this._vmRefInFlight.add(key);
    // ⚠ LOOKQUEUE.1 — CLAIMED HERE, beside the per-concept guard, and NOT at
    // the gate above. The first draft incremented at the gate, which sits
    // ABOVE two `return null` paths (the global gap and the 429 backoff) that
    // never reach the `try`/`finally` releasing it. That leaks the only slot —
    // and a leaked slot does not slow the lane, it CLOSES it permanently. The
    // 429 path guaranteed it would happen on the first rate limit. Claim and
    // release must share one lifetime, so they share one statement pair.
    this._vmRefGlobalInFlight = (this._vmRefGlobalInFlight | 0) + 1;
    this._vmLastRefFetchAt = now;
    this._vmRefFetchAt.set(key, now);
    this._vmLook().attempts++;
    try {
      // WORDLOCK (2026-08-21) — reported: the word she was drawing or imagining
      // still did not line up with the word that reached the image-request URL.
      // The prompt built from the
      // FULL concept (often a whole thought sentence) while the store bound
      // under only its FIRST content word: the URL asked for one thing, the
      // label claimed another. The prompt now builds from the KEY — the exact
      // word the image will be bound to and shown under. One word in, one
      // word bound, one word labeled.
      const prompt = opts.promptOverride || this._referenceImagePrompt(key);
      if (!prompt) return this._vmLookFail(key, 'noPrompt');
      let url = '';
      // NOLIMIT — request a 512² reference (was 256²). One fetch per 10min brain-wide
      // is unchanged, so this costs no extra pollen; it just means the ONE look she
      // gets carries enough detail to learn an appearance from.
      const _refPx = Number(process.env.DREAM_REF_RENDER_PX) > 0 ? Number(process.env.DREAM_REF_RENDER_PX) : 512;
      try { url = this._buildPollinationsImageUrl(prompt, { width: _refPx, height: _refPx }); } catch (e) { return this._vmLookFail(key, 'urlBuild', e && e.message); }
      if (!url) return this._vmLookFail(key, 'urlBuild', 'builder returned empty');
      let buf;
      try {
        const ctrl = new AbortController();
        // ── CHATPREEMPT.1 — publish the controller so CHAT can free the pipe ──
        //
        // ⛔ The 45s chat-priority yield only stops the NEXT look. It cannot
        // touch the one already running, and a reference fetch holds the single
        // anonymous slot for up to 60s. So the failing sequence was: the eye
        // starts a look → the operator asks for an image → chat stamps priority
        // and the BROWSER fires immediately → two concurrent requests on one
        // anonymous quota → 429 → "(image generation failed)".
        //
        // ⚠ The two contenders are separate PROCESSES — the look runs here, the
        // chat image is fetched client-side — so no server queue can sequence
        // them. Aborting our own half is the only lever this process actually
        // holds, and it frees the slot in milliseconds instead of up to 60s.
        //
        // ⚠ Losing this look costs nothing durable: the burns roll back on
        // failure (LOOKBACKOFF) and the concept is retried on its next turn.
        // A person waiting outranks a background errand.
        this._vmRefAbort = ctrl;
        this._vmRefAbortKey = key;
        // timeout 25s→60s (from a box log 2026-07-17: EVERY reference fetch aborting on
        // the box while Pollinations itself answers in ~2.5s — the box's uplink
        // sits at 16-19MB buffered under the teach-pattern flood, starving other
        // connections past 25s. 60s lets fetches land in the drain windows; the
        // fetch is fire-and-forget/detached so the longer wait blocks nothing.)
        const to = setTimeout(() => ctrl.abort(), Number(process.env.DREAM_REF_FETCH_TIMEOUT_MS) || 60000);
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(to);
        if (!r || !r.ok) {
          // Honest message (2026-08-21): the box runs the ANONYMOUS Pollinations
          // tier by design (keys dead since 2026-08-17) — a 429 is the free
          // tier's rate limit, EXPECTED and self-healing (the look lane rolls
          // its burns back and retries on cooldown). The old text said "verify
          // the Pollinations key", sending the operator hunting a key that
          // does not exist.
          // LOOKBACKOFF.1 — ARM THE BACKOFF on an explicit rate-limit refusal.
          // Exponential from 15s, doubling per consecutive 429, capped at 10min,
          // and `Retry-After` WINS when the server sends one — it is the only
          // party that actually knows when it will answer again.
          if (r && r.status === 429) {
            const st429 = this._vmLook();
            st429.rateLimitHits++;
            const prev = Number(this._vmRef429BackoffMs) || 0;
            let wait = prev > 0 ? Math.min(prev * 2, 600000) : 15000;
            const ra = Number(r.headers && typeof r.headers.get === 'function' ? r.headers.get('retry-after') : 0);
            // Retry-After is in SECONDS per RFC; only trust a sane positive value.
            if (Number.isFinite(ra) && ra > 0 && ra < 3600) wait = Math.max(wait, ra * 1000);
            this._vmRef429BackoffMs = wait;
            this._vmRef429Until = now + wait;
            st429.backoffMs = wait;
            st429.backoffUntil = this._vmRef429Until;
          }
          if (!this._vmRefHttpLogAt || now - this._vmRefHttpLogAt > 60000) { this._vmRefHttpLogAt = now; console.warn(`[VisualMemory] reference fetch "${key}" HTTP ${r ? r.status : '?'} — no image${r && r.status === 429 ? ` (anonymous-tier rate limit — backing off ${Math.round((Number(this._vmRef429BackoffMs) || 0) / 1000)}s so the chat image lane keeps its share of the shared anonymous quota)` : ''}.`); }
          return this._vmLookFail(key, 'httpFails', 'HTTP ' + (r ? r.status : '?'));
        }
        // LOOKBACKOFF.1 — the generator answered, so the escalation resets.
        // ⚠ Without this the backoff RATCHETS: one 429 an hour would keep
        // doubling a value that never came back down, and the lane would
        // quietly stop looking forever while every counter still read healthy.
        if (this._vmRef429BackoffMs) {
          this._vmRef429BackoffMs = 0;
          this._vmRef429Until = 0;
          const stOk = this._vmLook();
          stOk.backoffMs = 0;
          stOk.backoffUntil = 0;
        }
        buf = Buffer.from(await r.arrayBuffer());
      } catch (e) {
        if (!this._vmRefFetchErrAt || now - this._vmRefFetchErrAt > 60000) { this._vmRefFetchErrAt = now; console.warn(`[VisualMemory] reference fetch failed for "${key}": ${e?.message || e}`); }
        return this._vmLookFail(key, 'fetchErrs', e && e.message);
      }
      const img = this._decodeImageToRGBA(buf);
      // decode-null was SILENT for unknown formats (the decode helper only warns
      // on exceptions) — a generator handing back HTML or webp died invisibly.
      if (!img) return this._vmLookFail(key, 'decodeFails', `unknown/undecodable image (${buf ? buf.length : 0} bytes)`);
      // NOLIMIT — a reference is what she LEARNS the appearance from, so 128px was
      // throwing away the detail her shape-schema is built out of. 320 default
      // ⛔ WAS a 320px nearest-neighbour downsample "which keeps the contours and
      // part proportions that OWNART reads" — a claim about what survives, made
      // without measuring what does not. It is now full resolution by default,
      // the same door the corpus figures go through.
      const small = this._perceptSource(img, 'reference look-up');
      let rec;
      // perceive was the ONLY post-budget stage with a fully bare catch — a dead
      // mind-space worker killed every look with zero evidence. It names itself now.
      try { rec = await this.mindSpace.perceive({ width: small.w, height: small.h, data: small.data }); }
      catch (e) { return this._vmLookFail(key, 'perceiveFails', e && e.message); }
      if (!rec || !rec.channels) return this._vmLookFail(key, 'perceiveFails', 'perceive returned empty rec');
      // reject a degenerate (blank/uniform) reference — a flat field is not a look
      if (typeof this._recDetail === 'function' && this._recDetail(rec) < (Number(process.env.DREAM_REF_MIN_DETAIL) || 200)) {
        if (!this._vmRefBlankLogAt || now - this._vmRefBlankLogAt > 60000) { this._vmRefBlankLogAt = now; console.log(`[VisualMemory] reference for "${key}" came back near-uniform (no detail) — not binding.`); }
        return this._vmLookFail(key, 'blankRefs');
      }
      rec.fidelity = { psnr_db: null, source: 'reference-lookup' };
      // LOOKTWICE (2026-08-21) — reported: roughly 80% of the images were
      // nothing like the word attached to them. The generator is a NOISY oracle,
      // and a single render bound-then-shown meant a random wrong image wore
      // the word on the viewer and seeded her schema. A NEW concept now needs
      // TWO independent renders (different seeds) that AGREE (percept cosine
      // ≥ 0.45): the generator only converges across seeds when it actually
      // knows the word, noise never agrees twice. Disagreement = no bind, no
      // viewer frame, honest counter, retry later (burns rolled back).
      let percept = null;
      try { const _d = await this.mindSpace.describe(rec); if (_d) percept = Array.from(_d); } catch { percept = null; }
      const _lkCos = (a, b) => { if (!a || !b) return 0; let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0; };
      const _prevEntry = this._vmStore().get(key);
      if (!(_prevEntry && _prevEntry.p) && percept && !opts.keyOverride) {
        // first sight of this concept → the second, independent render
        let rec2 = null, percept2 = null;
        try {
          const url2 = this._buildPollinationsImageUrl(prompt, { width: _refPx, height: _refPx });
          const r2 = await fetch(url2);
          if (r2 && r2.ok) {
            const buf2 = Buffer.from(await r2.arrayBuffer());
            const img2 = this._decodeImageToRGBA(buf2);
            if (img2) {
              const small2 = this._perceptSource(img2, 'look-up second seed');
              rec2 = await this.mindSpace.perceive({ width: small2.w, height: small2.h, data: small2.data });
              if (rec2 && rec2.channels) { const _d2 = await this.mindSpace.describe(rec2); if (_d2) percept2 = Array.from(_d2); }
            }
          }
        } catch { rec2 = null; percept2 = null; }
        if (!percept2) return this._vmLookFail(key, 'fetchErrs', 'second render unavailable for self-consistency');
        const agree = _lkCos(percept, percept2);
        if (agree < 0.45) {
          console.log(`[VisualMemory] LOOK REJECTED for "${key}" — two independent renders DISAGREE (cosine ${agree.toFixed(2)} < 0.45): the generator does not know this word; nothing bound, nothing shown.`);
          return this._vmLookFail(key, 'selfMismatch', `render self-consistency ${agree.toFixed(2)}`);
        }
      }
      try {
        const store = this._vmStore();
        const prev = store.get(key);
        const cos = _lkCos;
        // two agreeing independent renders IS the confirmation standard —
        // a first sight that passed LOOKTWICE binds CONFIRMED
        const confirmed = !!(prev && prev.p && percept && cos(percept, prev.p) >= 0.45) || (!(prev && prev.p) && !!percept && !opts.keyOverride);
        store.delete(key);
        // VMPHRASE.3 — the concept she asked to look at, whole. `key` is the
        // head noun; this keeps the phrase that produced it.
        store.set(key, { rec, at: now, seen: (prev ? prev.seen : 0) + 1, conf: confirmed, p: percept || (prev && prev.p) || null, shownAt: prev && prev.shownAt, phrase: (String(concept || '').trim().slice(0, 160) || (prev && prev.phrase) || null) });
        this._vmTrimResident(store);   // evicts from RAM; the row STAYS on disk
        this._vmSaveSoon();
        // VMRELATE — the look taught. `concept` is what she asked to see, whole:
        // its modifiers, its glue and its relation, not the head noun `key` was
        // reduced to. ⚠ CONFIRMED looks only, for the same reason the ingest
        // path gates on a trusted bind — LOOKTWICE exists because one render is
        // a noisy oracle, and teaching the wording of a picture she may reject
        // is exactly the poisoning that gate was built to stop.
        try {
          if (confirmed && !opts.keyOverride && typeof this._queuePhraseTeach === 'function') {
            this._queuePhraseTeach(concept);
          }
        } catch { /* non-fatal — a look must never fail on its teach */ }
        // MIND'S-EYE — she SEES the reference she looked up (ruled 2026-07-15:
        // the mind's eye shows what she sees, full stop). The looked-up image IS what
        // her eyes receive, so publish the perceived field C to the shared viewer
        // (reconstructs to the reference image she's looking at) — a grounded
        // frame, exactly like a camera/generated frame ingested via
        // _ingestVisualFrame. She then draws from it; both the look + the drawing
        // show on the mind's-eye, never the de-novo texture.
        try {
          this._lastGroundedEyeAt = now;
          this._mindsEyeJson = JSON.stringify({ type: 'mindsEye', rec, terms: rec.equation_count || 0, source: 'lookup:' + key, at: now });
          if (this.clients && this.clients.size > 0) {
            const _p = JSON.stringify({ type: 'imagine', terms: rec.equation_count || 0, source: 'lookup:' + key, ts: now });
            for (const [ws] of this.clients) { if (ws.readyState === 1) { try { ws.send(_p); } catch { /* nf */ } } }
          }
        } catch { /* viewer publish best-effort */ }
        // LOOKEYES.1 — console.log, NOT process.stdout.write: the console ring
        // only captures console.*, so every successful look was invisible to
        // remote diagnosis (the PHONPROG.1 blind spot, second occurrence).
        try { console.log(`[VisualMemory] 🔎 looked up "${key}" → reference field C (${rec.equation_count} terms, ${confirmed ? 'CONFIRMED' : 'provisional'}) — SEEING it + can draw it now.`); } catch { /* nf */ }
      } catch { /* bind best-effort — the rec still returns for immediate drawing */ }
      { const st = this._vmLook(); st.grounded++; st.lastGroundedKey = key; st.lastGroundedAt = Date.now(); }
      return rec;
    } finally {
      this._vmRefInFlight.delete(key);
      // LOOKQUEUE.1 — release the brain-wide slot. ⚠ In `finally` beside the
      // per-concept delete, because a leaked global slot does not degrade the
      // lane, it CLOSES it: one missed decrement and she never looks again.
      this._vmRefGlobalInFlight = Math.max(0, (this._vmRefGlobalInFlight | 0) - 1);
      // CHATPREEMPT.1 — drop the published controller in the SAME finally as
      // the slot release. A stale controller would let a later chat turn abort
      // a fetch that already finished, or worse, one belonging to a different
      // concept. Cleared only if it is still OURS: a newer look may have
      // replaced it while this one was unwinding.
      if (this._vmRefAbortKey === key) { this._vmRefAbort = null; this._vmRefAbortKey = null; }
    }
  },

  /**
   * CHATPREEMPT.1 — free the anonymous image slot for a human, right now.
   *
   * Called by the chat path the instant an image intent becomes real. Aborts
   * the reference fetch currently holding the single anonymous lane so the
   * browser's request does not collide with it and 429.
   *
   * ⚠ Safe to call when nothing is in flight — that is the common case, and it
   * must not throw or log noise on the hot chat path.
   * Returns true only when a fetch was actually aborted, so the counter counts
   * real preemptions rather than attempts.
   */
  _vmPreemptLookForChat() {
    const ctrl = this._vmRefAbort;
    if (!ctrl) return false;
    const key = this._vmRefAbortKey;
    try { ctrl.abort(); } catch { /* already settled — nothing to free */ }
    this._vmRefAbort = null;
    this._vmRefAbortKey = null;
    try {
      const lk = this._vmLook();
      lk.chatPreempts = (lk.chatPreempts | 0) + 1;
      lk.lastChatPreemptKey = key || null;
    } catch { /* counters must never break chat */ }
    return true;
  },

  // Magic-byte image decode → { w, h, data:Uint8ClampedArray RGBA }. Pure-JS
  // jpeg-js / pngjs (server deps) so the box decodes a Pollinations render with
  // NO browser and NO native build. Returns null on unknown format / decode fail.
  _decodeImageToRGBA(buf) {
    try {
      const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      if (b.length < 4) return null;
      if (b[0] === 0xFF && b[1] === 0xD8) {                                      // JPEG
        const jpeg = this._jpegDec || (this._jpegDec = require('jpeg-js'));
        // ⛔ THE 512 MB CAP SILENTLY REFUSED THE LARGEST FIGURES IN THE CORPUS.
        // Wikimedia serves archival masters — 2.2 MP mean, many far larger — and
        // jpeg-js counts its own working set generously, so a real illustration
        // came back as `decode failed: maxMemoryUsageInMB limit exceeded` and was
        // recorded as undecodable. That reads as a broken file rather than a
        // ceiling we chose. Measured: 11 of 30 corpus figures refused at 512.
        // Env-tunable so a small box can put it back without editing code.
        const jpegCapMb = Number(process.env.DREAM_JPEG_MAX_MB) > 0 ? Number(process.env.DREAM_JPEG_MAX_MB) : 2048;
        const r = jpeg.decode(b, { useTArray: true, maxMemoryUsageInMB: jpegCapMb });
        if (!r || !r.data) return null;
        return { w: r.width, h: r.height, data: new Uint8ClampedArray(r.data.buffer, r.data.byteOffset, r.data.length) };
      }
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {    // PNG
        const { PNG } = this._pngDec || (this._pngDec = require('pngjs'));
        const p = PNG.sync.read(Buffer.from(b));
        if (!p || !p.data) return null;
        return { w: p.width, h: p.height, data: new Uint8ClampedArray(p.data.buffer, p.data.byteOffset, p.data.length) };
      }
      // WEBP — `RIFF....WEBP`. In-repo VP8 decoder, no native build and no new
      // dependency, so a webp figure reaches the CDF 9/7 transform through the
      // same RGBA door a jpeg or png does. Everything downstream is unchanged:
      // the coefficient stage was always format-blind, it was only ever missing
      // pixels. Before this, every figure PubMed Central serves for a modern
      // article decoded to null and was recorded as a perception failure
      // indistinguishable from a dead link.
      if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
          && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
        const { decodeWebP } = this._webpDec || (this._webpDec = require('../webp-decode.js'));
        const img = decodeWebP(b);
        // A refusal NAMES ITSELF rather than joining the silent-null pile —
        // "I do not decode the lossless variant" and "this file is corrupt" are
        // different facts and the counters must be able to tell them apart.
        if (!img && decodeWebP.lastReason && (!this._vmWebpErrAt || Date.now() - this._vmWebpErrAt > 60000)) {
          this._vmWebpErrAt = Date.now();
          console.warn(`[VisualMemory] webp decode declined: ${decodeWebP.lastReason}`);
        }
        return img;
      }
    } catch (e) {
      if (!this._vmDecodeErrAt || Date.now() - this._vmDecodeErrAt > 60000) { this._vmDecodeErrAt = Date.now(); console.warn(`[VisualMemory] image decode failed: ${e?.message || e}`); }
    }
    return null;
  },

  // Nearest-neighbor downsample of an RGBA image to a bounded max side (aspect
  // kept). A reference only needs ~128px for a clean traced percept; smaller =
  // faster perceive + cleaner contours.
  // CRYSTAL — the ONE door every percept goes through, so "crystal clear" is a
  // property of the choke point rather than a promise repeated at three call
  // sites that can drift apart. Returns the image UNTOUCHED unless an operator
  // has explicitly opted into a ceiling, and never returns a degraded percept
  // silently.
  _perceptSource(img, why) {
    if (!REF_MAXSIDE || Math.max(img.w, img.h) <= REF_MAXSIDE) return img;
    if (!this._vmScaleWarnAt || Date.now() - this._vmScaleWarnAt > 60000) {
      this._vmScaleWarnAt = Date.now();
      console.warn(`[VisualMemory] DREAM_REF_MAXSIDE=${REF_MAXSIDE} is DEGRADING what she perceives: ${why} ${img.w}x${img.h} resampled down. Fine detail is lost at analysis time and cannot be recovered from the record.`);
    }
    return this._downsampleRGBA(img, REF_MAXSIDE);
  },

  _downsampleRGBA(img, maxSide) {
    const sw = img.w, sh = img.h;
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    if (w === sw && h === sh) return { w: sw, h: sh, data: img.data };
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(sh - 1, Math.floor(y / scale));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(sw - 1, Math.floor(x / scale));
        const si = (sy * sw + sx) * 4, di = (y * w + x) * 4;
        out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]; out[di + 3] = 255;
      }
    }
    return { w, h, data: out };
  },

  // ⭐⭐ THE BACKGROUND FIGURE DRAIN — every illustration in the corpus gets
  // seen, without any cell pass paying for it.
  //
  // Chosen over perceiving inline, on the condition that figures link to their
  // text correctly. The measurement behind it — 37,592 figures at 6 per
  // cell visit meant `math/grade10` needed **462 visits** to finish 2,769, and a
  // cell is visited a handful of times.
  //
  // ⛔⛔ THE LINK TRAVELS WITH THE ROW, WHICH IS WHAT MAKES DEFERRAL SAFE. Each
  // queued figure carries its own `alt`, `caption`, `context` (the corpus prose
  // it sits inside) and `theme`, and `_perceiveTextbookFigure` builds its phrase
  // and its store key from exactly those. **Nothing here reads what is currently
  // being taught** — which is the `CAMPOISON` fix holding: a frame that fuses
  // with "whatever word is current" is the defect that made a webcam placeholder
  // become her memory of a word, and resolving the binding at perception time
  // instead of carrying it would re-open that instantly.
  //
  // ⚠ ONE AT A TIME, ON A TIMER, `unref`'d. This shares the loop with the teach
  // lane, so it takes one figure per tick and never batches — the whole reason
  // it exists is to stop figure work from pinning anything. `DREAM_FIGDRAIN_MS`
  // tunes the pace; `=0` disables the lane and says so.
  _startFigureDrain() {
    if (this._figDrainTimer) return;
    const raw = process.env.DREAM_FIGDRAIN_MS;
    const every = raw === undefined || raw === '' ? 1500 : Math.max(0, Number(raw) || 0);
    if (every === 0) { console.log('[FigureDrain] disabled by DREAM_FIGDRAIN_MS=0 — queued figures will NOT be perceived'); return; }
    this._figDrainBusy = false;
    this._figDrainTimer = setInterval(async () => {
      if (this._figDrainBusy) return;                 // never overlap a fetch
      if (!this._figureQueue) return;
      this._figDrainBusy = true;
      try {
        const row = this._figureQueue.next();
        if (!row) return;
        // ⚠ Rebuilt into the exact shape the inline path passes, so the two
        // callers cannot drift into binding the same figure differently.
        const fig = {
          url: row.url, src: row.url,
          alt: row.alt || '', caption: row.caption || '',
          context: row.context || '',
          theme: row.theme || null,
        };
        let rec = null;
        try {
          rec = await this._perceiveTextbookFigure(fig, {
            key: `${row.theme || row.subject}-${row.k.split('-').pop()}`,
            theme: row.theme || `${row.subject}/${row.grade}`,
          });
        } catch (e) {
          this._figureQueue.markFailed(row.k, e?.message || String(e));
          return;
        }
        // ⛔ `null` here is AMBIGUOUS and must not be recorded as a failure: the
        // perceive path returns null both for "already held" and for "fetch
        // failed", and the store is the only thing that can tell them apart.
        // A held figure is DONE; a failed one is retried a bounded number of
        // times. Collapsing the two would either re-fetch the whole corpus
        // forever or silently drop pictures.
        if (rec) { this._figureQueue.markDone(row.k, 'seen'); return; }
        let held = false;
        try {
          const st = this._vmStore && this._vmStore();
          held = !!(st && st.get(`fig:${row.theme || row.subject}-${row.k.split('-').pop()}`));
        } catch { held = false; }
        if (held) this._figureQueue.markDone(row.k, 'held');
        else this._figureQueue.markFailed(row.k, 'perceive returned nothing');
      } catch (e) {
        console.warn('[FigureDrain] tick failed —', e?.message || e);
      } finally {
        this._figDrainBusy = false;
      }
    }, every);
    if (this._figDrainTimer.unref) this._figDrainTimer.unref();
    console.log(`[FigureDrain] started — one figure every ${every}ms, off the teach lane (DREAM_FIGDRAIN_MS)`);
  },

  // ── SHE LEARNS WHAT A LETTER LOOKS LIKE, THE SAME WAY SHE LEARNS EVERY OTHER
  //    SHAPE ─────────────────────────────────────────────────────────────────
  //
  // Operator chose this as the end state (option ③): *"make the letterforms
  // genuinely learned"* — the only answer that ever makes *"her own trained
  // hand"* a true sentence rather than a caption wearing that claim.
  //
  // ⛔⛔ THE STARTING POINT IS WORSE THAN "SHE USES A FONT". `renderLetterTemplate`
  // in `visual-cortex.js` — the thing named as her visual template for a letter —
  // is a **trig hash of the codepoint**. It produces a deterministic 48-dim
  // signature that is uncorrelated between letters and has NOTHING to do with
  // the letter's shape. So she could tell `a` from `b` as tokens and **had never
  // seen what either one looks like**, in any sense, anywhere in the system.
  //
  // ⭐ THE PIPELINE IS HOW A CHILD ACTUALLY DOES IT, and every step is a
  // production path that already exists:
  //   1. `glyphStrokes(ch)` draws the PRINTED letter — this is the letter in the
  //      world, the one on the page. A font here is legitimate and is not the
  //      thing being claimed as hers.
  //   2. `sketch(...)` renders it and returns a field — **she looks at it.**
  //   3. `traceLineArt(rec)` extracts HER trace of what she saw. It runs at a
  //      bounded resolution over real pixels, so it is NOT the font back again:
  //      it is her reading of it, and it differs.
  //   4. the trace is banked under `letter:<ch>` in the ordinary visual store.
  // Writing then composes from HER traces. The glyph constant is what she looked
  // at; the strokes on the page are what she took away.
  //
  // ⛔ NO FALLBACK, per the standing law. A letter she has not learned is a
  // letter she cannot write — not a letter quietly stamped from the font. That
  // is the whole point: early on she writes little or nothing, and the caption
  // becomes evidence of what she has been taught instead of a decoration that
  // is always perfect.
  async learnLetterShape(ch) {
    // ⭐ `WRITEWARM.2` — CASE IS NO LONGER FOLDED AWAY, and that correction is the
    // whole reason this line changed. `FONT5X7` now carries every printable key on
    // a QWERTY keyboard (94 glyphs plus space), so `A` and `a` are DIFFERENT
    // letterforms with different traces. Lower-casing here would have quietly
    // banked the lowercase trace under every uppercase request — a wrong shape
    // filed under a right-looking key, which is worse than a refusal.
    //
    // ⭐ `WRITEWARM.1` — THE ACCEPT SET IS THE FONT'S SET, NOT AN ALPHABET.
    // The guard was `[a-z0-9]`, which refused punctuation the renderer could
    // already draw — so a full stop was unwritable even though the strokes for one
    // existed. ⚠ Anything OUTSIDE the font must stay refused: `glyphStrokes` falls
    // back to blank for an unknown character, and accepting one would bank a BLANK
    // trace that reads as a learned shape.
    const c = String(ch || '').slice(0, 1);
    if (!c || c === ' ' || c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126) return null;
    const ms = this.mindSpace;
    if (!ms || typeof ms.glyphStrokes !== 'function' || typeof ms.sketch !== 'function'
        || typeof ms.traceLineArt !== 'function') return null;
    const store = this._vmStore && this._vmStore();
    if (!store) return null;
    const key = `letter:${c}`;
    try {
      // Big and centred so the trace has real pixels to read. A letter drawn at
      // caption size would trace to a handful of specks.
      const printed = ms.glyphStrokes(c, { x: 0.22, y: 0.16, size: 0.62, bold: true, rgb: [235, 233, 238] });
      if (!printed || !printed.length) return null;
      const rec = await ms.sketch(printed, { maxSide: 256 });
      if (!rec || !rec.channels) return null;
      const mine = await ms.traceLineArt(rec, {
        traceSide: 192, maxStrokes: 90, edgeThresh: 0.10, minLenFrac: 0.02, simplify: 1.0, ink: [232, 230, 236],
      });
      if (!mine || !mine.length) return null;
      const prev = store.get(key);
      store.set(key, {
        rec,
        at: Date.now(),
        seen: (prev && prev.seen ? prev.seen : 0) + 1,
        conf: true,
        // ⚠ A DIGIT IS NOT A LETTER AND NEITHER IS A DOLLAR SIGN. The phrase is
        // what she recalls this shape AS, so calling every glyph "the letter" would
        // teach her a false name for two thirds of the set.
        phrase: /[A-Za-z]/.test(c) ? `the letter ${c}`
          : (/[0-9]/.test(c) ? `the number ${c}` : `the mark ${c}`),
        // Her strokes, normalised to the unit box so writing can place and scale
        // them anywhere without re-tracing.
        letter: { ch: c, strokes: this._normaliseLetterStrokes(mine) },
      });
      this._vmTrimResident(store);
      this._vmSaveSoon();
      return c;
    } catch { return null; }
  },

  // Fit a traced letter into [0,1]² so it can be placed at any size. ⚠ The
  // ASPECT IS PRESERVED deliberately — squashing every letter into a square
  // would make `i` as wide as `m` and undo the thing she just learned.
  // ⚠ A TRACE POINT IS AN ARRAY `[x, y]`, NOT `{x, y}`. This read `p.x`/`p.y`
  // first, got `undefined` on every point, and every bounding box stayed at
  // Infinity — so all 26 letters "traced successfully" and normalised to zero
  // strokes. The trace lane and the stroke lane genuinely use different point
  // shapes (`traceLineArt` emits `{type:'poly', pts:[[x,y],…]}` while
  // `glyphStrokes` emits `{type:'line', x0,y0,x1,y1}`), so this has to be read
  // rather than assumed.
  _normaliseLetterStrokes(strokes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of strokes) {
      for (const p of (s.pts || [])) {
        const px = Array.isArray(p) ? p[0] : p.x;
        const py = Array.isArray(p) ? p[1] : p.y;
        if (!(Number.isFinite(px) && Number.isFinite(py))) continue;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
    const w = maxX - minX, h = maxY - minY;
    // ⚠ ONE RETURN SHAPE ON EVERY PATH. This returned a bare `[]` on the
    // degenerate case and `{strokes, aspect}` otherwise, so a caller reading
    // `.strokes.strokes` got `undefined` and threw — on the failure path only,
    // which is the path least likely to be exercised before it ships.
    if (!(w > 0) || !(h > 0)) return { strokes: [], aspect: 0 };
    const k = 1 / Math.max(w, h);
    const out = [];
    for (const s of strokes) {
      // Kept in the SAME `[x, y]` array form the tracer emits, so the strokes
      // stay drawable by the same rasteriser without a second conversion.
      const pts = (s.pts || [])
        .map((p) => (Array.isArray(p) ? [(p[0] - minX) * k, (p[1] - minY) * k] : [(p.x - minX) * k, (p.y - minY) * k]))
        .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (pts.length >= 2) out.push({ ...s, pts });
    }
    return { strokes: out, aspect: w / h };
  },

  /**
   * Has she learned this character's shape?
   *
   * ⚠ `WRITEWARM.2` — EXACT CASE FIRST, other case as a fallback. Keys became
   * case-sensitive when the font gained real lowercase letterforms; falling back
   * to the sibling case means a shape banked before that change still answers,
   * and a caller asking for `A` before the uppercase pass has run gets her `a`
   * rather than a refusal. The fallback reports a shape she genuinely has —
   * it never invents one.
   */
  _letterEntry(ch, exact = false) {
    const store = this._vmStore && this._vmStore();
    if (!store) return null;
    const c = String(ch || '').slice(0, 1);
    if (!c) return null;
    const alt = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
    const e = store.get(`letter:${c}`) || (exact || alt === c ? null : store.get(`letter:${alt}`));
    return (e && e.letter && e.letter.strokes && e.letter.strokes.strokes && e.letter.strokes.strokes.length) ? e : null;
  },

  // ⚠ `exact` EXISTS FOR THE INSTRUMENT, and it is not optional politeness. The
  // sibling-case fallback is right for WRITING — she should use her `a` when asked
  // for an `A` she has not traced yet — but a coverage count that took the fallback
  // would report 52 letterforms banked the moment 26 were, which is the precise
  // shape of an instrument reading green over an unfinished job.
  hasLetterShape(ch, exact = false) { return !!this._letterEntry(ch, exact); },

  /**
   * Write a word IN HER OWN HAND — composed from the letter traces she has
   * actually learned.
   *
   * ⛔ A letter she has not learned is SKIPPED, not substituted. The returned
   * `wrote` / `skipped` counts are what let a caller say honestly how much of
   * the word she could actually write, instead of showing a complete word and
   * implying she knew all of it.
   */
  handwrittenStrokes(text, opts = {}) {
    const store = this._vmStore && this._vmStore();
    if (!store) return { strokes: [], wrote: 0, skipped: 0 };
    // ⭐ `WRITEWARM.2` — CASE PRESERVED. This lower-cased the whole label, which was
    // correct while every uppercase form was the only form she had; now that she has
    // both, flattening the case would make her unable to write a capital at all.
    // `_letterEntry` still falls back to the sibling case per character, so a word
    // she could write before is still a word she can write.
    const label = String(text || '').slice(0, 14);
    const size = Math.max(0.03, Math.min(0.3, opts.size ?? 0.08));
    const gap = size * 0.28;
    const rgb = opts.rgb || [226, 224, 230];
    // Measure first: the word's width depends on which letters she can write and
    // on their individual aspects, so it cannot be assumed uniform.
    const cells = [];
    let wrote = 0, skipped = 0, totalW = 0;
    for (const ch of label) {
      if (ch === ' ') { cells.push(null); totalW += size * 0.5 + gap; continue; }
      const e = this._letterEntry(ch);
      const L = e && e.letter && e.letter.strokes;
      if (!L || !L.strokes || !L.strokes.length) { skipped++; continue; }
      const aspect = Number(L.aspect) > 0 ? L.aspect : 0.7;
      const w = size * Math.min(1.4, Math.max(0.18, aspect));
      cells.push({ L, w });
      totalW += w + gap;
      wrote++;
    }
    if (!wrote) return { strokes: [], wrote: 0, skipped };
    totalW = Math.max(0, totalW - gap);

    // ⛔ SHRINK TO FIT, because the operator already had this exact bug once on
    // the typeset path — *"the last few letters of longer words are always being
    // cut off"* — and a new writing lane that reintroduced it would be the same
    // defect wearing new code. Her letters have INDIVIDUAL widths (an `i` is not
    // an `m`), so the word's width is measured rather than assumed and the whole
    // word is scaled down until it fits. A word is never truncated.
    const MARGIN = 0.04;
    const availW = 1 - 2 * MARGIN;
    let sizeK = 1;
    let drawGap = gap;
    if (totalW > availW) {
      sizeK = availW / totalW;
      // ⚠ THE GAPS SCALE TOO. Scaling only the letter widths left the inter-letter
      // gaps at full size, so the drawn word was WIDER than the width this
      // function had just reported and a long word still ran off the canvas —
      // measured at 0.92 and rendered past 1.0. The measurement and the drawing
      // have to shrink the same quantities or the report is a different word
      // from the one on the page.
      for (const cell of cells) if (cell) cell.w *= sizeK;
      drawGap = gap * sizeK;
      totalW = availW;
    }
    const drawSize = size * sizeK;

    let x = opts.x !== undefined ? opts.x : Math.max(0.02, 0.5 - totalW / 2);
    const y = opts.y !== undefined ? opts.y : 0.86;
    const out = [];
    for (const cell of cells) {
      if (!cell) { x += drawSize * 0.5 + drawGap; continue; }
      for (const s of cell.L.strokes) {
        const pts = s.pts.map((p) => [x + p[0] * cell.w, y + p[1] * drawSize]);
        out.push({ ...s, pts, rgb, w: s.w ?? 0.006 });
      }
      x += cell.w + drawGap;
    }
    return { strokes: out, wrote, skipped, width: totalW };
  },
};

module.exports = { SERVER_VISUAL_MEMORY_MIXIN };
