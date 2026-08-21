// MindSpaceWorkerProxy — the same surface as MindSpaceGPU, with the engine
// living in a worker thread (server/mindspace-worker.mjs). Heavy ops
// (imagineFromState / sketch / describe / perceive / morph) return Promises
// and execute serialized in the worker — one imagination lane, in order,
// zero event-loop time on the main thread. Governor calls stay sync-shaped
// at the call site (fire-and-forget RPC; worker message order preserves the
// governState → governTick → imagine sequence). glyphStrokes is pure
// stroke geometry (FONT5X7 → line segments, no engine state) and runs on a
// local instance so sync callers keep working unchanged.
const { Worker } = require('worker_threads');
const path = require('path');

class MindSpaceWorkerProxy {
  constructor(localPure) {
    this._local = localPure || null;
    this._pending = new Map();
    this._seq = 0;
    this.available = false;
    let readyResolve;
    this._ready = new Promise((r) => { readyResolve = r; });
    this._worker = new Worker(path.join(__dirname, '..', 'mindspace-worker.mjs'));
    // Imagination must never hold the process open past shutdown.
    this._worker.unref();
    this._worker.on('message', (m) => {
      if (m && m.ready) {
        this.available = !!m.available;
        readyResolve(true);
        return;
      }
      if (!m || !this._pending.has(m.id)) return;
      const p = this._pending.get(m.id);
      this._pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error));
      else p.resolve(m.value);
    });
    this._worker.on('error', (e) => {
      console.warn('[MindSpace] worker error:', e?.message || e);
      for (const p of this._pending.values()) p.reject(e instanceof Error ? e : new Error(String(e)));
      this._pending.clear();
    });
    this._worker.on('exit', (code) => {
      if (code !== 0) console.warn(`[MindSpace] worker exited with code ${code} — imagination paused (calls reject until restart).`);
      const err = new Error('mindspace worker exited');
      for (const p of this._pending.values()) p.reject(err);
      this._pending.clear();
    });
  }

  init() { return this._ready; }

  _call(method, args) {
    return new Promise((resolve, reject) => {
      const id = ++this._seq;
      this._pending.set(id, { resolve, reject });
      try { this._worker.postMessage({ id, method, args }); }
      catch (e) { this._pending.delete(id); reject(e); }
    });
  }

  // ── ONE PROCESS (Gee 2026-07-17: "the minds eye and voice go on the GPU ...
  // its one process not bolted together shit") — DONOR BRIDGE ────────────────
  // When a mindspace-capable donor is connected (compute.html / donor-v0.3.11+),
  // the heavy mind-space ops run ON THE DONOR GPU — the same device computing
  // her brain. brain-server injects the bridge after construction. The LOCAL
  // worker path below each op is the ROLLOUT RAMP ONLY (until v0.3.11 is the
  // min donor version — sparseV2 precedent; removal milestone in TODO §ONE
  // PROCESS), NOT a permanent fallback.
  setDonorBridge(dispatch, capable) {
    this._donorDispatch = dispatch;   // (op, payload, timeoutMs) => Promise<result|null>
    this._donorCapable = capable;     // () => boolean
  }

  _viaDonor(op) {
    return !!(this._donorDispatch && this._donorCapable && this._donorCapable(op));
  }

  // Heavy engine ops — async; donor GPU when capable, local worker as the ramp.
  async imagineFromState(seed, opts) {
    if (this._viaDonor('imagineFromState')) {
      const f32 = seed instanceof Float32Array ? seed : Float32Array.from(seed || []);
      const r = await this._donorDispatch('imagineFromState', {
        seed_b64: Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString('base64'),
        opts: opts || {},
      });
      if (r && r.rec) return r.rec;
      // fall through to the local ramp on donor miss/timeout
    }
    return this._call('imagineFromState', [seed, opts]);
  }

  sketch(...args) { return this._call('sketch', args); }

  async describe(rec, dim) {
    if (this._viaDonor('describe')) {
      const r = await this._donorDispatch('describe', { rec, dim });
      if (r && r.percept_b64) {
        const buf = Buffer.from(r.percept_b64, 'base64');
        return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4)).slice();
      }
    }
    return this._call('describe', [rec, dim]);
  }

  async perceive(img) {
    if (this._viaDonor('perceive') && img && img.data && img.width && img.height) {
      const r = await this._donorDispatch('perceive', {
        width: img.width, height: img.height,
        rgba_b64: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength).toString('base64'),
      });
      if (r && r.rec) return r.rec;
    }
    return this._call('perceive', [img]);
  }

  morph(...args) { return this._call('morph', args); }
  // PROXYCOLOR (2026-08-21) — reconstruct a rec to pixels. The COLOR pipeline
  // (palette + per-part + per-stroke sampling) checks `typeof imagine ===
  // 'function'` before sampling — this method was MISSING from the proxy, so
  // on the box every schema silently banked with NO colors and every drawing
  // rendered as monotone neutral outlines while the harness (which ran the
  // engine directly) showed full color. The worker dispatch is generic, the
  // engine has imagine() — one passthrough completes the pipeline in
  // production.
  imagine(...args) { return this._call('imagine', args); }

  // Governor state lives with the engine; call sites stay sync-shaped.
  governState(...args) { this._call('governState', args).catch(() => {}); }
  governTick(...args) { this._call('governTick', args).catch(() => {}); }

  // Pure stroke geometry — no engine state; sync on the local instance.
  glyphStrokes(...args) {
    return (this._local && typeof this._local.glyphStrokes === 'function')
      ? this._local.glyphStrokes(...args)
      : [];
  }

  // Pure field-C → HER HAND'S STROKES (CDF 9/7 inverse → Sobel edges → edge-
  // follow polylines → Douglas-Peucker → field-colored). Like glyphStrokes it's
  // pure geometry over the rec with NO engine/GPU state, so it runs SYNC on the
  // local instance. It MUST stay sync: _drawConcept
  // calls it as `strokes = this.mindSpace.traceField(...)` (NOT awaited) — routing
  // it through the worker would hand back a Promise (no .length), every draw
  // would silently fall to null, and she'd look things up without ever drawing.
  // THIS omission was exactly that bug: the proxy lacked traceField, so
  // _drawConcept's guard (`typeof this.mindSpace.traceField !== 'function'`)
  // bailed on EVERY call and no drawing was ever produced. (Gee 2026-07-15:
  // "twn - twenty lookups in a row and not one single drawing has been attempted".)
  traceField(...args) {
    return (this._local && typeof this._local.traceField === 'function')
      ? this._local.traceField(...args)
      : [];
  }

  // Clean-ink line-art tracer (DRAW-ENGINE v2) — NOW ASYNC (ONE PROCESS):
  // donor GPU when capable (the lifting inside the trace runs on the same
  // device as her brain), local instance as the rollout ramp. ⚠ Contract
  // change from the old sync version: EVERY caller must `await` it (chat.js
  // _drawConcept/_drawImagined updated in the same batch — a non-awaited call
  // would see a Promise with no .length and silently draw nothing, the exact
  // old traceField-forward bug class).
  async traceLineArt(rec, opts) {
    if (this._viaDonor('traceLineArt')) {
      const r = await this._donorDispatch('traceLineArt', { rec, opts: opts || {} });
      if (r && Array.isArray(r.strokes)) return r.strokes;
    }
    return (this._local && typeof this._local.traceLineArt === 'function')
      ? this._local.traceLineArt(rec, opts)
      : [];
  }

  // Color-fill draw style — flat colour-region strokes (sync-local; out of the
  // auto-rotation, explicit opts.style only — not donor-routed).
  traceColorFill(...args) {
    return (this._local && typeof this._local.traceColorFill === 'function')
      ? this._local.traceColorFill(...args)
      : [];
  }

  // Detailed styled field render — NOW ASYNC (ONE PROCESS): donor GPU when
  // capable, local as the rollout ramp. Same await-contract warning as
  // traceLineArt above.
  async stylizeField(rec, opts) {
    if (this._viaDonor('stylizeField')) {
      const o = opts || {};
      const r = await this._donorDispatch('stylizeField', {
        rec,
        opts: { traceSide: o.traceSide, bands: o.bands },
        labelStrokes: o.labelStrokes || null,
      });
      if (r && r.rec) return r.rec;
    }
    return (this._local && typeof this._local.stylizeField === 'function')
      ? this._local.stylizeField(rec, opts)
      : null;
  }

  // composeFields forward REMOVED (2026-07-16) — the collage compositor is gone;
  // imagination now field-renders ONE unified looked-up scene (see chat.js).
}

module.exports = { MindSpaceWorkerProxy };
