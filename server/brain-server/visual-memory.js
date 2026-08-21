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
//      thought's tokens are looked up here FIRST. One match → she re-sees
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
// renders looked like white pencil (Gee: "NO MORE PENCIL ART"). v3 orphans those
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
const VM_DB = path.join(__dirname, '..', 'visual-memory-v4.db');
// NOLIMIT (Gee 2026-08-20: *"the equations for images in the Unity minds eye are
// not limited"*). 384 concepts was a small number for a mind that will walk K→PhD
// and see everything on the way — she would start FORGETTING what things look like
// while still learning new words. Raised to 4096 (env-tunable), which is still an
// LRU floor rather than a cage: the store is ~0.3-3KB per field C, so 4096 is a
// few MB of state, and it is wiped on every fresh walk (FRESHEYES) so it can never
// become stale identity.
// VMSCALE (2026-08-21, operator: ~10k concepts at full training, "the more the
// better", sized against the 500GB box) — 4096 → 25,000 default, 2.5× the
// stated target. With sqlite as the medium the DISK does not care; this cap is
// the RAM bound on the hot in-memory Map (~10KB/entry ⟹ 25k ≈ 250MB beside the
// brain on a shared box). DREAM_VM_CAP raises it whenever more RAM is available.
const VM_CAP = Number(process.env.DREAM_VM_CAP) > 0 ? Number(process.env.DREAM_VM_CAP) : 25000;
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
  // exists at any store size, WAL journal, and disk (500GB minus Forgejo) is
  // the only real ceiling. The in-RAM Map stays — recall paths need hot reads —
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
        db.exec('CREATE TABLE IF NOT EXISTS concepts (key TEXT PRIMARY KEY, entry TEXT NOT NULL, at INTEGER NOT NULL)');
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
      class VMMap extends Map {
        set(k, v) { const r = super.set(k, v); try { self._vmMarkDirty(k, false); } catch { /* nf */ } return r; }
        delete(k) { const had = super.delete(k); if (had) { try { self._vmMarkDirty(k, true); } catch { /* nf */ } } return had; }
      }
      this._visualMemory = new VMMap();
      this._vmRestoring = true;   // restore must not mark its own inserts dirty-for-write
      try {
        const db = this._vmDb();
        if (db) {
          const t0 = Date.now();
          const rows = db.prepare('SELECT key, entry FROM concepts ORDER BY at ASC').all();
          for (const r of rows.slice(-VM_CAP)) {
            try {
              const e = JSON.parse(r.entry);
              if (e && e.rec && e.rec.channels) Map.prototype.set.call(this._visualMemory, r.key, e);
            } catch { /* one bad row never blocks the rest */ }
          }
          if (this._visualMemory.size > 0) {
            console.log(`[VisualMemory] restored ${this._visualMemory.size} seen-concept field(s) from sqlite in ${Date.now() - t0}ms (${rows.length} rows on disk, cap ${VM_CAP}).`);
          }
        }
      } catch (e) { console.warn('[VisualMemory] load failed:', e?.message || e); }
      this._vmRestoring = false;
    }
    return this._visualMemory;
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
        const put = db.prepare('INSERT OR REPLACE INTO concepts (key, entry, at) VALUES (?, ?, ?)');
        const del = db.prepare('DELETE FROM concepts WHERE key = ?');
        const tx = db.transaction(() => {
          for (const k of dels) del.run(k);
          for (const k of ups) {
            const e = store.get(k);
            if (e) put.run(k, JSON.stringify(e), e.at || Date.now());
          }
        });
        tx();
        const ms = Date.now() - t0;
        if (ms > 100) console.log(`[VisualMemory] flushed ${ups.size} upsert(s) + ${dels.size} delete(s) in ${ms}ms.`);
      } catch (e) { console.warn('[VisualMemory] save failed:', e?.message || e); }
    }, 5000);
  },

  // Content words only — binding a field C to "the"/"of" would make every
  // future thought recall random imagery through stopword collisions.
  _vmContentTokens(text) {
    return String(text || '').toLowerCase().split(/[^a-z]+/)
      .filter(w => w.length >= 2 && !VM_STOP.has(w))
      .slice(0, 6);
  },

  // WS 'visual_frame' intake: {source:'camera'|'image', w, h, rgba_b64, label}.
  // Validation is strict (dims 8..96, byte length must equal w*h*4) because
  // this is a PUBLIC-lane message — a malformed frame must never reach the
  // wavelet transform. Async (perceive may take the GPU path on a GPU host);
  // callers fire-and-forget.
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

    // concept binding — label first (image prompts name what she made); an
    // unlabeled camera frame fuses with what she is THINKING in this moment.
    let tokens = this._vmContentTokens(msg.label);
    if (tokens.length === 0) {
      try {
        const chain = Array.isArray(this._innerThoughtChain) ? this._innerThoughtChain : [];
        const last = chain.length ? chain[chain.length - 1] : null;
        tokens = this._vmContentTokens(typeof last === 'string' ? last : (last && last.sentence) || '');
        if (tokens.length === 0 && this.cortexCluster && this.cortexCluster._globalWorkspace
            && typeof this.cortexCluster._globalWorkspace.getBroadcast === 'function') {
          const b = this.cortexCluster._globalWorkspace.getBroadcast();
          tokens = this._vmContentTokens(b && b.label ? String(b.label).replace(/^cortex:/, '') : '');
        }
      } catch { /* binding is best-effort — an unbound frame still grounds sem below */ }
    }
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
    let _anyTrustedBind = fromCamera;
    for (const t of tokens) {
      const prev = store.get(t);
      if (fromCamera || !newPercept) {
        store.delete(t);                                      // LRU touch
        store.set(t, { rec, at: now, seen: (prev ? prev.seen : 0) + 1, conf: true, p: newPercept || (prev && prev.p) || null });
        _anyTrustedBind = true;
        continue;
      }
      if (!prev || !prev.p) {
        store.delete(t);
        store.set(t, { rec, at: now, seen: 1, conf: false, p: newPercept });
        continue;                                             // provisional — awaits a confirming render
      }
      const _s = _vmCosP(newPercept, prev.p);
      if (_s >= 0.45) {
        store.delete(t);
        store.set(t, { rec, at: now, seen: (prev.seen || 0) + 1, conf: true, p: newPercept });
        _anyTrustedBind = true;                               // two independent renders agree — the look is real
      } else if (prev.conf !== false) {
        this._vmOutlierSkips = (this._vmOutlierSkips || 0) + 1;
        if (!this._vmOutlierLogAt || (now - this._vmOutlierLogAt) > 60000) {
          this._vmOutlierLogAt = now;
          console.log(`[VisualMemory] outlier render for "${t}" REJECTED (percept cosine ${_s.toFixed(2)} vs the confirmed memory) — generator noise, not the concept. ${this._vmOutlierSkips} outlier(s) bounced this boot.`);
        }
      } else {
        store.delete(t);
        store.set(t, { rec, at: now, seen: 1, conf: false, p: newPercept });   // newer provisional replaces provisional
      }
    }
    while (store.size > VM_CAP) store.delete(store.keys().next().value);

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
    //   * CONFIRMED tokens only — a provisional look (one unconfirmed render)
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
      const _ingestMs = Number(process.env.DREAM_OWNART_INGEST_MS) > 0
        ? Number(process.env.DREAM_OWNART_INGEST_MS) : 5000;
      if (_ingestMs > 0 && !this._curriculumInProgress
          && typeof this._learnShapeSchema === 'function'
          && (!this._ownArtIngestAt || (now - this._ownArtIngestAt) >= _ingestMs)) {
        const _cand = tokens.find((t) => {
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
    // seeing, not imagination). Skipped mid-teach so the walk's Hebbian
    // patterns stay pristine, same rule as the imagine tick.
    try {
      if (_anyTrustedBind && !this._curriculumInProgress && this.cortexCluster
          && typeof this.cortexCluster.injectEmbeddingToRegion === 'function') {
        const percept = newPercept || await this.mindSpace.describe(rec);   // trusted frames only — provisional renders stay out of sem
        if (percept) this.cortexCluster.injectEmbeddingToRegion('sem', percept, 0.10);
      }
    } catch { /* non-fatal */ }

    // she SEES it — swap the shared mind's-eye snapshot to the live percept
    // so the viewer shows the eye receiving. BALANCED: camera frames arrive
    // every ~8s but the viewer belongs to IMAGINATION — a camera-seen swap
    // lands at most once per 60s (first sight immediate) so daydreams and
    // recalls own the display between glances. Her creations (generated
    // images, rare) always swap. Binding/grounding above are UNTHROTTLED —
    // she still perceives and remembers every frame; only the display paces.
    const _eyeSwapOk = !fromCamera
      || !this._vmLastEyeSwapAt || (now - this._vmLastEyeSwapAt) > 60000;
    if (_eyeSwapOk) try {
      this._vmLastEyeSwapAt = now;
      this._lastGroundedEyeAt = now;   // SEE.6 — a seen frame is a grounded frame
      this._mindsEyeJson = JSON.stringify({
        type: 'mindsEye', rec, terms: rec.equation_count || 0,
        source: (fromCamera ? 'seen-camera' : 'seen') + (tokens.length ? ':' + tokens[0] : ''),
        at: now,
      });
    } catch { /* non-fatal */ }

    this._vmSaveSoon();
    this._vmIngestCount = (this._vmIngestCount || 0) + 1;
    if (!this._vmLogAt || (now - this._vmLogAt) > 60000) {
      this._vmLogAt = now;
      console.log(`[VisualMemory] 👁 seen ${fromCamera ? 'camera frame' : 'image'} ${w}x${h} → field C (${rec.equation_count} terms) bound to [${tokens.join(', ') || 'unbound'}] — ${store.size} concept(s) held, ${this._vmIngestCount} frame(s) this boot`);
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
    const tokens = this._vmContentTokens(text);
    if (tokens.length === 0) return null;
    const hits = [];
    for (const t of tokens) {
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

  // ── OWNART (Gee 2026-08-20) — WHAT SHE *LEARNS* FROM A LOOK, not what she copies ──
  //
  // Gee: *"she will attemp completely new creations trying to replicate similar
  // types of images but in ther own unique style outlay and apperance, NOT JUST
  // APPLY LAYERS AND FILTERS to a pollinations image and calling it a draw"*.
  //
  // He is right about what the old path did: `_drawConcept` default style was
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
    const key = (this._vmContentTokens(concept)[0] || String(concept || '').toLowerCase().trim());
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
    // an assumed scale — for a gray/cream cat it produced [255,0,255] pure
    // magenta, and every drawing of her went hot pink. Reconstruct the field
    // she just perceived (ImageData polyfilled server-side now) and histogram
    // the CENTER region — the subject, not the backdrop — into her 4 colors.
    let palette = [];
    try { palette = await this._schemaPaletteFromRec(rec); } catch { palette = []; }
    if (!palette.length) { try { palette = this._schemaPalette(rec); } catch { palette = []; } }
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
        // PAINT.6 — 6→8 contours at 36 points each (was 20): the live cat test
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
    // PAINT.7 (2026-08-21) — THE FULL TRACE. Live judgment on the cat test:
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
    const schema = {
      v: 2,   // OWNART.7 — v2 = 5×5 cell indices; v1 (3×3) schemas still DRAW fine (cx/cy/w/h/ang are grid-independent) but must never CELL-MERGE with v2
      parts: parts.slice(0, 25),
      outlines,
      trace,
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
  async _schemaPaletteFromRec(rec) {
    try {
      if (!this.mindSpace || typeof this.mindSpace.imagine !== 'function') return [];
      const img = await this.mindSpace.imagine(rec, 0);
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
        if (!c || !c.val_b64) continue;
        // decode base64 → int16 count of non-trivial magnitudes (>2 quant units)
        const bin = Buffer.from(c.val_b64, 'base64');
        for (let i = 0; i + 1 < bin.length; i += 2) {
          const v = bin.readInt16LE(i);
          if (v > 2 || v < -2) n++;
        }
      }
    } catch { return rec.equation_count || 0; }
    return n;
  },

  // ── DRAW-ENGINE (Gee 2026-07-15) — SHE LOOKS IT UP ───────────────────────────────────────────
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
    let defTail = '';
    try {
      const cx = this.cortexCluster;
      const d = (cx && typeof cx.lookupDefinitionSync === 'function') ? cx.lookupDefinitionSync(c) : null;
      if (d && typeof d === 'string') {
        const stop = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'with', 'that', 'which', 'who', 'whom', 'is', 'are', 'was', 'were', 'be', 'been', 'as', 'by', 'at', 'it', 'its', 'this', 'these', 'those', 'from', 'used', 'uses', 'using', 'having', 'being', 'one', 'any', 'some', 'such', 'other', 'more', 'most', 'very', 'into', 'about', 'when', 'where', 'also', 'not', 'can', 'may']);
        const words = d.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2 && !stop.has(w) && w !== c);
        if (words.length) defTail = ' ' + [...new Set(words)].slice(0, 6).join(' ');
      }
    } catch { /* bare concept prompt */ }
    // COLOURFUL, not monochrome (Gee 2026-07-15: "NO MORE PENCIL ART"). The old
    // "simple ... high contrast" biased Pollinations toward black-on-white LINE
    // drawings — the field render of a monochrome reference looks like pencil.
    // Bias vibrant FULL-COLOUR + soft shading so her recreations are beautiful and
    // coloured; keep single-centred-subject + clean background for legible tracing.
    // REALISTIC, not cutesy (Gee 2026-07-17: "too many kittens puppies and funky
    // characters... like there is some meta prompt that is way to strong making
    // all the look up drawling sorta outlandish and non Unity canon"). The word
    // "illustration" dragged the generator into cartoon-mascot/cute-character
    // territory on anything ambiguous. Steer PHOTOGRAPHIC + true-to-life: her
    // look-ups are LEARNING references (what the thing actually looks like);
    // colour stays, the cutesy stylization dies. POSITIVE terms ONLY (Gee: an
    // image model attends to the nouns — writing "no cartoon" PAINTS cartoons);
    // her own interpretation still happens on the DRAWING side, never here.
    return `${c}${defTail}, realistic photograph, true to life, documentary photography, natural lighting, full color, richly detailed, single centered subject, plain uncluttered background`;
  },

  // Fetch a Pollinations REFERENCE for a concept, perceive it into a field C
  // HEADLESSLY (no browser — the box decodes the render itself), and bind it
  // PROVISIONALLY into visual memory. Returns the rec so the caller draws from
  // what she just looked at. Reference-not-fact (Gee): binds conf:false on first
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
        inFlightSkips: 0, noPrompt: 0, httpFails: 0, fetchErrs: 0, decodeFails: 0,
        perceiveFails: 0, blankRefs: 0, lastErr: null, lastErrAt: 0, lastGroundedKey: null, lastGroundedAt: 0,
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

  async _fetchReferenceAndGround(concept, opts = {}) {
    if (!this.mindSpace || typeof this.mindSpace.perceive !== 'function') return null;
    if (typeof this._buildPollinationsImageUrl !== 'function') return null;
    if (typeof fetch !== 'function') return null;   // Node < 18 (the box is 18+)
    // opts.keyOverride — imagination combos ground under their OWN key ("a+b")
    // so a combined scene never pollutes the single concepts' visual memory.
    // opts.promptOverride — the caller supplies the full generation prompt
    // (imagination's unified-scene phrasing) instead of the def-driven single-
    // concept prompt.
    const key = opts.keyOverride || (this._vmContentTokens(concept)[0]) || String(concept || '').toLowerCase().trim();
    if (!key) return null;
    const now = Date.now();
    // per-concept refetch cooldown — never spam the generator for the same word
    const COOL = Number(process.env.DREAM_REF_FETCH_COOLDOWN_MS) || 21600000;   // 6h
    if (!this._vmRefFetchAt) this._vmRefFetchAt = new Map();
    if (!opts.force && (now - (this._vmRefFetchAt.get(key) || 0)) < COOL) { this._vmLook().coolSkips++; return null; }
    // in-flight guard (per concept) + global pacing so a flood of unseen concepts
    // can't trigger a fetch storm
    if (!this._vmRefInFlight) this._vmRefInFlight = new Set();
    if (this._vmRefInFlight.has(key)) { this._vmLook().inFlightSkips++; return null; }
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
    this._vmRefInFlight.add(key);
    this._vmLastRefFetchAt = now;
    this._vmRefFetchAt.set(key, now);
    this._vmLook().attempts++;
    try {
      const prompt = opts.promptOverride || this._referenceImagePrompt(concept);
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
        // timeout 25s→60s (Gee log 2026-07-17: EVERY reference fetch aborting on
        // the box while Pollinations itself answers in ~2.5s — the box's uplink
        // sits at 16-19MB buffered under the teach-pattern flood, starving other
        // connections past 25s. 60s lets fetches land in the drain windows; the
        // fetch is fire-and-forget/detached so the longer wait blocks nothing.)
        const to = setTimeout(() => ctrl.abort(), Number(process.env.DREAM_REF_FETCH_TIMEOUT_MS) || 60000);
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(to);
        if (!r || !r.ok) {
          if (!this._vmRefHttpLogAt || now - this._vmRefHttpLogAt > 60000) { this._vmRefHttpLogAt = now; console.warn(`[VisualMemory] reference fetch "${key}" HTTP ${r ? r.status : '?'} — no image (verify the Pollinations key on the box).`); }
          return this._vmLookFail(key, 'httpFails', 'HTTP ' + (r ? r.status : '?'));
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
      // (env-tunable), which is still a downsample of a 256-1024px render but keeps
      // the contours and part proportions that OWNART reads.
      const small = this._downsampleRGBA(img, Number(process.env.DREAM_REF_MAXSIDE) || 320);
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
      // BIND PROVISIONALLY (reference-not-fact) — conf:false on first sight;
      // confirmed only when a later independent render agrees (cosine ≥ 0.45),
      // exactly the _ingestVisualFrame noisy-oracle gate.
      try {
        const store = this._vmStore();
        let percept = null;
        try { const _d = await this.mindSpace.describe(rec); if (_d) percept = Array.from(_d); } catch { percept = null; }
        const prev = store.get(key);
        const cos = (a, b) => { if (!a || !b) return 0; let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0; };
        const confirmed = !!(prev && prev.p && percept && cos(percept, prev.p) >= 0.45);
        store.delete(key);
        store.set(key, { rec, at: now, seen: (prev ? prev.seen : 0) + 1, conf: confirmed, p: percept || (prev && prev.p) || null, shownAt: prev && prev.shownAt });
        while (store.size > VM_CAP) store.delete(store.keys().next().value);
        this._vmSaveSoon();
        // MIND'S-EYE — she SEES the reference she looked up (Gee 2026-07-15: "the
        // minds eye shows the shit she sees period"). The looked-up image IS what
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
    }
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
        const r = jpeg.decode(b, { useTArray: true, maxMemoryUsageInMB: 512 });
        if (!r || !r.data) return null;
        return { w: r.width, h: r.height, data: new Uint8ClampedArray(r.data.buffer, r.data.byteOffset, r.data.length) };
      }
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {    // PNG
        const { PNG } = this._pngDec || (this._pngDec = require('pngjs'));
        const p = PNG.sync.read(Buffer.from(b));
        if (!p || !p.data) return null;
        return { w: p.width, h: p.height, data: new Uint8ClampedArray(p.data.buffer, p.data.byteOffset, p.data.length) };
      }
    } catch (e) {
      if (!this._vmDecodeErrAt || Date.now() - this._vmDecodeErrAt > 60000) { this._vmDecodeErrAt = Date.now(); console.warn(`[VisualMemory] image decode failed: ${e?.message || e}`); }
    }
    return null;
  },

  // Nearest-neighbor downsample of an RGBA image to a bounded max side (aspect
  // kept). A reference only needs ~128px for a clean traced percept; smaller =
  // faster perceive + cleaner contours.
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
};

module.exports = { SERVER_VISUAL_MEMORY_MIXIN };
