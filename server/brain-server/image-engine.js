// image-engine.js — HER EYES COME HOME. Every picture she asks for is rendered
// on her own card, through CORA's local image engine, paced so the card stays
// hers.
//
// ── WHAT THIS REPLACES ─────────────────────────────────────────────────────
// `_buildPollinationsImageUrl` handed the look lane a GET URL to a remote free
// API. That API cost nothing per render, so the lane was priced accordingly:
// a 0 ms global gap, no unload, nothing to yield to. All three assumptions
// break the moment the renderer is HER OWN GPU, shared with the donor compute
// and her voice. This module keeps the contract the lane already consumes
// (bytes in → `_decodeImageToRGBA` → `perceive`, untouched) and changes only
// the SOURCE of the bytes — the same shape as the unity-voice-v2 swap, where
// the PCM source changed and the CDF 9/7 transport did not.
//
// ── THE ENGINE (measured 2026-10-18 on the operator's 4070 Ti SUPER) ───────
//   CORA services/image_sidecar.py on 127.0.0.1:5124 — local Stable Diffusion,
//   realistic-vision-v51 (SD1.5, 1.99 GB), diffusers, same Python310 as her voice.
//   POST /txt2img {prompt,width,height,steps,seed}  → image/png (+X-Seed, X-Seconds)
//   GET  /health   answers instantly; the checkpoint loads on the FIRST render
//   POST /unload   drops the pipelines, frees the card, process stays
//   one render at a time (its own threading.Lock); offload=True by default
//
//   VRAM baseline (voice idle)          2,409 MiB
//   peak during a 512² / 25-step render 4,910 MiB   → the render costs ~2,500 MiB
//   peak at 768²                        5,475 MiB   → ~3,070 MiB; looks stay at 512²
//   render, warm                        2.1 s
//   reload after /unload                0.6 s       → unloading when idle is FREE
//   resident loaded-but-idle            +544 MiB;  after /unload +248 MiB (CUDA context)
//
// ── ⛔ "NOT OVER CLOCKED" IS A VRAM BUDGET, DERIVED NOT CHOSEN ───────────────
//   card 16,376 MiB · donor 5–13 GB on a walk · voice ~2.4 GB · render ~2.5 GB
//   At the donor's TOP end  13 + 2.4 + 2.5  exceeds the card. So:
//   1. offload always — the launcher never passes --no-offload (that is "+3 GB").
//   2. /unload after an idle window — reload is 0.6 s, so this costs nothing and
//      returns ~300 MiB between looks.
//   3. one render at a time — the sidecar's lock already does it; the gate here
//      queues callers so a burst never stacks POSTs behind that lock.
//   4. a real global gap between LOOKS — `DREAM_REF_FETCH_GAP_MS` defaulted to 0
//      because the old API was free. Default is now 30,000 ms: at 2.1 s per
//      render that bounds the look lane to ~7% of GPU time worst case, and the
//      6 h per-concept cooldown bounds the total. (RE-PRICE written down, as
//      the law requires before any pacing changes.)
//   5. yield to the donor — a LOOK is skipped while a matrix upload is in
//      flight (`_gpuUploadsInFlight`, counted in gpu.js), because that is the
//      one window where the donor sits at its VRAM peak. A CHAT render waits
//      instead of skipping: a person in the room outranks a background errand,
//      and the wait is bounded.
//
// ── ⛔ NO SILENT FALLBACK ───────────────────────────────────────────────────
// If the sidecar is down, `render()` returns null and the caller's own stage
// counters name it (`engineDown`). Nothing reaches for a remote API. A lane
// that quietly swapped renderers would be the "silent successful fallback"
// trap this project has paid for more than once.
//
// ── ⛔ THE PUBLIC SIDE ──────────────────────────────────────────────────────
// A visitor must NEVER be able to trigger a render. The browser receives a
// `{url}` to `/image/<id>.png`, which serves a picture the brain ALREADY MADE
// from a bounded cache — a miss is a 404, never a render. That is why the route
// is safe to expose through the tunnel while `:5124` is not.
'use strict';

const crypto = require('crypto');

const ENGINE_URL = (process.env.UNITY_IMAGE_URL || 'http://127.0.0.1:5124').replace(/\/+$/, '');
const RENDER_TIMEOUT_MS = Number(process.env.DREAM_IMAGE_TIMEOUT_MS) > 0 ? Number(process.env.DREAM_IMAGE_TIMEOUT_MS) : 90000;
// Unload after this much idle. Reload measured at 0.6 s, so short is fine;
// 20 s still lets a LOOKTWICE second seed (seconds after the first) stay warm.
const UNLOAD_IDLE_MS = Number(process.env.DREAM_IMAGE_UNLOAD_IDLE_MS) >= 0 ? Number(process.env.DREAM_IMAGE_UNLOAD_IDLE_MS) : 20000;
// How long a CHAT render may wait for an in-flight donor upload before giving
// up (looks never wait — they skip).
const CHAT_YIELD_MAX_MS = Number(process.env.DREAM_IMAGE_CHAT_YIELD_MS) >= 0 ? Number(process.env.DREAM_IMAGE_CHAT_YIELD_MS) : 15000;
const HEALTH_TTL_MS = 30000;
const CACHE_CAP = Number(process.env.DREAM_IMAGE_CACHE_CAP) > 0 ? Number(process.env.DREAM_IMAGE_CACHE_CAP) : 48;
const STEPS = Number(process.env.DREAM_IMAGE_STEPS) > 0 ? Number(process.env.DREAM_IMAGE_STEPS) : 25;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ImageEngineMixin = {
  /** Counters a dashboard can read. Every failure names its stage. */
  _imageEngine() {
    if (!this._imageEngineStats) {
      this._imageEngineStats = {
        engine: ENGINE_URL, ok: 0, engineDown: 0, httpFails: 0, timeouts: 0, donorYieldSkips: 0,
        queued: 0, unloads: 0, lastMs: null, lastErr: null, lastErrAt: 0, lastOkAt: 0,
      };
    }
    return this._imageEngineStats;
  },

  /**
   * The request the look lane consumes. Replaces the old URL builder at the
   * one chokepoint: callers `fetch(req.url, {...req.init, signal})` and feed
   * the bytes to the same decoder as before.
   */
  _buildImageRequest(prompt, opts = {}) {
    const width = opts.width || 512;
    const height = opts.height || 512;
    // Fresh seed per render unless pinned — the generator is deterministic per
    // (prompt, seed) and a repeated prompt must not look recycled.
    const seed = (typeof opts.seed === 'number') ? opts.seed : Math.floor(Math.random() * 2147483646) + 1;
    const body = { prompt: String(prompt || '').slice(0, 600), width, height, steps: opts.steps || STEPS, seed };
    if (opts.negative) body.negative = String(opts.negative);
    return {
      url: `${ENGINE_URL}/txt2img`,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      seed, width, height,
    };
  },

  /** Cached liveness so a dead engine costs one probe per 30 s, not one per look. */
  async _imageEngineAlive() {
    const now = Date.now();
    if (this._imageEngineHealth && now - this._imageEngineHealth.at < HEALTH_TTL_MS) return this._imageEngineHealth.ok;
    let ok = false;
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 3000);
      const r = await fetch(`${ENGINE_URL}/health`, { signal: c.signal });
      clearTimeout(t);
      ok = !!(r && r.ok);
    } catch { ok = false; }
    this._imageEngineHealth = { ok, at: now };
    return ok;
  },

  /**
   * ONE render, through the gate. Returns { png:Buffer, seed, ms, width, height }
   * or null — never throws. `opts.purpose` is 'look' (skips when the donor is
   * uploading) or 'chat' (waits, bounded).
   */
  async _imageEngineRender(prompt, opts = {}) {
    const st = this._imageEngine();
    if (!(await this._imageEngineAlive())) {
      st.engineDown++;
      st.lastErr = `engineDown: ${ENGINE_URL} not answering /health`;
      st.lastErrAt = Date.now();
      return null;
    }

    // Rule 5 — yield to the donor's matrix upload.
    if ((this._gpuUploadsInFlight | 0) > 0) {
      if (opts.purpose !== 'chat') {
        st.donorYieldSkips++;
        st.lastErr = 'donorYield: matrix upload in flight — look skipped';
        st.lastErrAt = Date.now();
        return null;
      }
      const deadline = Date.now() + CHAT_YIELD_MAX_MS;
      while ((this._gpuUploadsInFlight | 0) > 0 && Date.now() < deadline) await sleep(250);
    }

    // Rule 3 — one at a time, queued (the sidecar locks too; this keeps POSTs
    // from piling up behind that lock with their timeouts running).
    const prev = this._imageEngineChain || Promise.resolve();
    let release;
    this._imageEngineChain = new Promise((r) => { release = r; });
    st.queued++;
    try { await prev; } catch { /* a previous failure never blocks the next */ }

    const req = this._buildImageRequest(prompt, opts);
    const t0 = Date.now();
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), RENDER_TIMEOUT_MS);
      let r;
      try { r = await fetch(req.url, { ...req.init, signal: c.signal }); }
      finally { clearTimeout(t); }
      if (!r || !r.ok) {
        st.httpFails++;
        let why = '';
        try { why = (await r.text()).slice(0, 160); } catch { /* body optional */ }
        st.lastErr = `HTTP ${r ? r.status : '?'} ${why}`;
        st.lastErrAt = Date.now();
        return null;
      }
      const png = Buffer.from(await r.arrayBuffer());
      const ms = Date.now() - t0;
      st.ok++; st.lastMs = ms; st.lastOkAt = Date.now();
      this._imageEngineTouch();
      const hdrSeed = Number(r.headers && typeof r.headers.get === 'function' ? r.headers.get('x-seed') : 0);
      return { png, seed: hdrSeed || req.seed, ms, width: req.width, height: req.height };
    } catch (e) {
      const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')));
      if (aborted) st.timeouts++; else st.httpFails++;
      st.lastErr = `${aborted ? 'timeout' : 'fetchErr'}: ${String((e && e.message) || e).slice(0, 160)}`;
      st.lastErrAt = Date.now();
      return null;
    } finally {
      release();
    }
  },

  /** Rule 2 — arm/re-arm the idle unload. Free (0.6 s reload), returns ~300 MiB. */
  _imageEngineTouch() {
    if (this._imageEngineUnloadTimer) clearTimeout(this._imageEngineUnloadTimer);
    if (!(UNLOAD_IDLE_MS > 0)) return;
    this._imageEngineUnloadTimer = setTimeout(async () => {
      this._imageEngineUnloadTimer = null;
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 20000);
        const r = await fetch(`${ENGINE_URL}/unload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: c.signal });
        clearTimeout(t);
        if (r && r.ok) this._imageEngine().unloads++;
      } catch { /* unload is best-effort; the next render reloads regardless */ }
    }, UNLOAD_IDLE_MS);
    // Never hold the process open for an unload.
    if (this._imageEngineUnloadTimer && typeof this._imageEngineUnloadTimer.unref === 'function') this._imageEngineUnloadTimer.unref();
  },

  // ── The read-only picture cache behind /image/<id>.png ─────────────────────
  _imageCachePut(png, meta = {}) {
    if (!this._imageCache) this._imageCache = new Map();
    const id = crypto.randomBytes(8).toString('hex');
    this._imageCache.set(id, { png, at: Date.now(), ...meta });
    while (this._imageCache.size > CACHE_CAP) {
      const oldest = this._imageCache.keys().next().value;
      this._imageCache.delete(oldest);
    }
    return id;
  },

  _imageCacheGet(id) {
    if (!this._imageCache || !/^[a-f0-9]{16}$/.test(String(id || ''))) return null;
    return this._imageCache.get(id) || null;
  },

  /**
   * A chat-requested picture: render (waiting out a donor upload, bounded),
   * cache, and hand back a URL the browser can <img>. null = honest no-image;
   * the caller says so in words instead of showing nothing.
   */
  async _renderImageForChat(prompt) {
    const out = await this._imageEngineRender(prompt, { purpose: 'chat', width: 512, height: 512 });
    if (!out) return null;
    const id = this._imageCachePut(out.png, { prompt: String(prompt).slice(0, 200), seed: out.seed });
    return { url: `/image/${id}.png`, id, seed: out.seed, ms: out.ms };
  },
};

module.exports = { ImageEngineMixin, ENGINE_URL };
