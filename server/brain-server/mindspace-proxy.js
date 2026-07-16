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

  // Heavy engine ops — async, serialized in the worker.
  imagineFromState(...args) { return this._call('imagineFromState', args); }
  sketch(...args) { return this._call('sketch', args); }
  describe(...args) { return this._call('describe', args); }
  perceive(...args) { return this._call('perceive', args); }
  morph(...args) { return this._call('morph', args); }

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
  // local instance. It MUST stay sync: _drawConcept / _practiceDrawFromMemory
  // call it as `strokes = this.mindSpace.traceField(...)` (NOT awaited) — routing
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

  // Clean-ink line-art tracer (DRAW-ENGINE v2). Same sync-local contract as
  // traceField/glyphStrokes: pure stroke geometry, no GPU/engine state, MUST NOT
  // be a Promise (callers do `strokes = this.mindSpace.traceLineArt(...)`). This
  // forward is load-bearing — `_drawConcept` guards on it, so if the proxy lacks
  // it the guard bails and she draws nothing (the exact traceField bug).
  traceLineArt(...args) {
    return (this._local && typeof this._local.traceLineArt === 'function')
      ? this._local.traceLineArt(...args)
      : [];
  }

  // Color-fill draw style — flat colour-region strokes (sync-local, same contract).
  traceColorFill(...args) {
    return (this._local && typeof this._local.traceColorFill === 'function')
      ? this._local.traceColorFill(...args)
      : [];
  }

  // Detailed styled field render — returns a NEW rec (drawn field C), not strokes.
  // Pure CDF 9/7 over the local instance; sync (no worker round-trip needed).
  stylizeField(...args) {
    return (this._local && typeof this._local.stylizeField === 'function')
      ? this._local.stylizeField(...args)
      : null;
  }

  // Compose several field recs into one COLOURED imagined scene — sync-local
  // (pure array work over the parts, no engine state). Returns a drawn rec.
  composeFields(...args) {
    return (this._local && typeof this._local.composeFields === 'function')
      ? this._local.composeFields(...args)
      : null;
  }
}

module.exports = { MindSpaceWorkerProxy };
