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
//      the stored percept. Two matches → morphField blends both field Cs in
//      the EQUATION domain (coefficient-set union + lerp) — imagination as
//      RECOMBINATION of stored percepts, not a caption of the thought.
//   Equational end-to-end: pixels → forward CDF 9/7 → sparse field C →
//   (morph) → inverse CDF 9/7 at the viewer. No text-AI, no picture library.
//
// BOUNDS: frames hard-capped 96×96 (engine nanometer caution), per-frame
// pacing 2s, store LRU-capped at VM_CAP concepts, persisted to
// server/visual-memory.json (debounced 30s, atomic tmp+rename) so what she
// has seen survives restart — same medium pattern as mindspace-memory.json.

const fs = require('fs');
const path = require('path');

const VM_FILE = path.join(__dirname, '..', 'visual-memory.json');
const VM_CAP = 384;              // distinct seen-concepts held (LRU)
const VM_INGEST_GAP_MS = 2000;   // per-brain pacing across ALL clients
const VM_STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'is',
  'it', 'its', 'was', 'are', 'be', 'this', 'that', 'with', 'for', 'as',
  'her', 'his', 'my', 'your', 'she', 'he', 'you', 'we', 'me', 'him',
  'them', 'they', 'am', 'do', 'so', 'up', 'by', 'if',
]);

const SERVER_VISUAL_MEMORY_MIXIN = {
  // Lazy store init + one-time restore from disk. Map iteration order is
  // insertion order — re-inserting on touch makes it a natural LRU.
  _vmStore() {
    if (!this._visualMemory) {
      this._visualMemory = new Map();
      try {
        if (fs.existsSync(VM_FILE)) {
          const j = JSON.parse(fs.readFileSync(VM_FILE, 'utf8'));
          if (j && Array.isArray(j.entries)) {
            for (const [w, e] of j.entries.slice(-VM_CAP)) {
              if (typeof w === 'string' && e && e.rec && e.rec.channels) this._visualMemory.set(w, e);
            }
            if (this._visualMemory.size > 0) {
              console.log(`[VisualMemory] restored ${this._visualMemory.size} seen-concept field(s) from visual-memory.json`);
            }
          }
        }
      } catch (e) { console.warn('[VisualMemory] load failed:', e?.message || e); }
    }
    return this._visualMemory;
  },

  // Debounced persistence — the seen-concept store is her visual episodic
  // medium; losing it on restart would blind her imagination back to
  // abstract fields until she re-sees everything.
  _vmSaveSoon() {
    if (this._vmSaveTimer) return;
    this._vmSaveTimer = setTimeout(() => {
      this._vmSaveTimer = null;
      try {
        const entries = Array.from(this._vmStore().entries()).slice(-VM_CAP);
        const tmp = VM_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries }));
        fs.renameSync(tmp, VM_FILE);
      } catch (e) { console.warn('[VisualMemory] save failed:', e?.message || e); }
    }, 30000);
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
    if (w < 8 || h < 8 || w > 96 || h > 96) return;
    if (typeof msg.rgba_b64 !== 'string' || msg.rgba_b64.length > 96 * 96 * 4 * 2) return;
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
    for (const t of tokens) {
      const prev = store.get(t);
      store.delete(t);                                        // LRU touch
      store.set(t, { rec, at: now, seen: (prev ? prev.seen : 0) + 1 });
    }
    while (store.size > VM_CAP) store.delete(store.keys().next().value);

    // grounding — the percept vector lands in sem at LOW strength (real
    // seeing, not imagination). Skipped mid-teach so the walk's Hebbian
    // patterns stay pristine, same rule as the imagine tick.
    try {
      if (!this._curriculumInProgress && this.cortexCluster
          && typeof this.cortexCluster.injectEmbeddingToRegion === 'function') {
        const percept = this.mindSpace.describe(rec);
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

  // Recall at imagine-time. One matched concept → re-see the stored field C.
  // Two → morphField blends both in the equation domain (recombination —
  // the imagination act itself). Returns {rec, matched, recombined} or null;
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
    // TU.29.12 — QUALITY GATE. A near-uniform frame (dark room / blank wall /
    // subject off-frame) equationalizes to almost no wavelet detail; morphing
    // two of them collapses to a handful of coefficients that reconstruct FLAT
    // BLACK — and that degenerate "recall" was bypassing the never-blank mood
    // floor. `_recDetail()` counts the coefficients that actually survive the
    // drop-tiny threshold; below MIN it is not a real image, so we treat the
    // recall as a MISS and let the caller render the vivid de-novo mood field.
    const MIN_DETAIL = 200;
    if (hits.length >= 2 && this.mindSpace && typeof this.mindSpace.morph === 'function') {
      try {
        const m = this.mindSpace.morph(hits[0].e.rec, hits[1].e.rec, 0.5);
        if (m && this._recDetail(m) >= MIN_DETAIL) return { rec: m, matched: [hits[0].word, hits[1].word], recombined: true };
      } catch { /* fall through to single recall */ }
    }
    // single strongest — only if it carries real detail
    for (const h of hits) {
      if (this._recDetail(h.e.rec) >= MIN_DETAIL) return { rec: h.e.rec, matched: [h.word], recombined: false };
    }
    return null;   // all matches degenerate → de-novo mood field (never black)
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
};

module.exports = { SERVER_VISUAL_MEMORY_MIXIN };
