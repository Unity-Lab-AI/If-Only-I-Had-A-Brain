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
const VM_FILE = path.join(__dirname, '..', 'visual-memory-v2.json');
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
    return `${c}${defTail}, simple clear centered illustration, single subject, plain background, high contrast`;
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
  async _fetchReferenceAndGround(concept, opts = {}) {
    if (!this.mindSpace || typeof this.mindSpace.perceive !== 'function') return null;
    if (typeof this._buildPollinationsImageUrl !== 'function') return null;
    if (typeof fetch !== 'function') return null;   // Node < 18 (the box is 18+)
    const key = (this._vmContentTokens(concept)[0]) || String(concept || '').toLowerCase().trim();
    if (!key) return null;
    const now = Date.now();
    // per-concept refetch cooldown — never spam the generator for the same word
    const COOL = Number(process.env.DREAM_REF_FETCH_COOLDOWN_MS) || 21600000;   // 6h
    if (!this._vmRefFetchAt) this._vmRefFetchAt = new Map();
    if (!opts.force && (now - (this._vmRefFetchAt.get(key) || 0)) < COOL) return null;
    // in-flight guard (per concept) + global pacing so a flood of unseen concepts
    // can't trigger a fetch storm
    if (!this._vmRefInFlight) this._vmRefInFlight = new Set();
    if (this._vmRefInFlight.has(key)) return null;
    const GAP = Number(process.env.DREAM_REF_FETCH_GAP_MS) || 15000;
    if (!opts.force && this._vmLastRefFetchAt && (now - this._vmLastRefFetchAt) < GAP) return null;
    this._vmRefInFlight.add(key);
    this._vmLastRefFetchAt = now;
    this._vmRefFetchAt.set(key, now);
    try {
      const prompt = this._referenceImagePrompt(concept);
      if (!prompt) return null;
      let url = '';
      try { url = this._buildPollinationsImageUrl(prompt, { width: 256, height: 256 }); } catch { return null; }
      if (!url) return null;
      let buf;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), Number(process.env.DREAM_REF_FETCH_TIMEOUT_MS) || 25000);
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(to);
        if (!r || !r.ok) {
          if (!this._vmRefHttpLogAt || now - this._vmRefHttpLogAt > 60000) { this._vmRefHttpLogAt = now; console.warn(`[VisualMemory] reference fetch "${key}" HTTP ${r ? r.status : '?'} — no image (verify the Pollinations key on the box).`); }
          return null;
        }
        buf = Buffer.from(await r.arrayBuffer());
      } catch (e) {
        if (!this._vmRefFetchErrAt || now - this._vmRefFetchErrAt > 60000) { this._vmRefFetchErrAt = now; console.warn(`[VisualMemory] reference fetch failed for "${key}": ${e?.message || e}`); }
        return null;
      }
      const img = this._decodeImageToRGBA(buf);
      if (!img) return null;
      const small = this._downsampleRGBA(img, Number(process.env.DREAM_REF_MAXSIDE) || 128);
      let rec;
      try { rec = await this.mindSpace.perceive({ width: small.w, height: small.h, data: small.data }); } catch { return null; }
      if (!rec || !rec.channels) return null;
      // reject a degenerate (blank/uniform) reference — a flat field is not a look
      if (typeof this._recDetail === 'function' && this._recDetail(rec) < (Number(process.env.DREAM_REF_MIN_DETAIL) || 200)) {
        if (!this._vmRefBlankLogAt || now - this._vmRefBlankLogAt > 60000) { this._vmRefBlankLogAt = now; console.log(`[VisualMemory] reference for "${key}" came back near-uniform (no detail) — not binding.`); }
        return null;
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
        try { process.stdout.write(`[VisualMemory] 🔎 looked up "${key}" → reference field C (${rec.equation_count} terms, ${confirmed ? 'CONFIRMED' : 'provisional'}) — she can draw it now.\n`); } catch { /* nf */ }
      } catch { /* bind best-effort — the rec still returns for immediate drawing */ }
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
