/**
 * Worker pool manager for CPU sparse-matmul parallelization.
 *
 * Without a worker pool, curriculum teach's sparse matmul loops run
 * on one core while the other cores sit idle. This pool partitions
 * the row range of a sparse matmul across N workers, each running in
 * its own thread, reading shared CSR arrays + writing disjoint
 * row-range slices of a shared output buffer.
 *
 * Usage:
 *   const pool = new SparseMatmulPool();  // sized to os.cpus().length - 1
 *   const out = await pool.propagate(sparseMatrix, spikesU32);
 *   // out is a Float32Array of length matrix.rows
 *
 * Falls back to synchronous CPU matmul if worker_threads is unavailable.
 */

const os = require('os');

let workerThreadsAvailable = true;
let WorkerClass = null;
try {
  WorkerClass = require('worker_threads').Worker;
} catch {
  workerThreadsAvailable = false;
}

class SparseMatmulPool {
  constructor(opts = {}) {
    // Pool sizing. Prior cap was 16; lowered to 8 because at biological
    // scale almost all matmul + plasticity traffic routes through the
    // GPU proxy, so the worker pool only fires on the cold-fallback
    // path (GPU miss / pre-rebind / standalone). Half the footprint
    // for the same effective throughput on bio workloads. Browser
    // scale (< 100K) still benefits from the workers because that
    // path pegs single-thread. `opts.size` lets an operator override.
    const cpuCount = os.cpus()?.length || 4;
    this._poolSize = Math.max(1, Math.min(opts.size ?? Math.min(cpuCount - 1, 8), 8));
    this._workers = [];
    this._ready = false;
    this._jobSeq = 0;
    this._pending = new Map(); // jobId → { resolve, expected, received }
    // Idle-termination config. Workers hold per-thread V8 heap even
    // when no jobs are running; terminating after a prolonged idle
    // window releases that memory to the OS. `_lastJobAt` is the
    // wall-clock of the most recent propagate/hebbian dispatch;
    // `_idleTerminateMs` is the threshold past which the pool self-
    // shuts-down (re-init lazily on next call). Default 5 minutes —
    // curriculum teach cycles fire far more often than that, so the
    // pool stays alive during active work and only quits during
    // long wait-for-operator-input windows.
    this._lastJobAt = Date.now();
    // iter11-S fix — bump idle-terminate threshold 300s → 1800s (5 min
    // → 30 min). Operator caught the WorkerPool churning idle-terminate
    // every 5 min during teach-phase quiet windows, then re-init on
    // next call (~240MB allocation cost per cycle). 30 min is long
    // enough to span teach-phase quiet windows + post-curriculum chat
    // wait without churn.
    this._idleTerminateMs = opts.idleTerminateMs ?? 1_800_000;
    this._idleCheckMs = opts.idleCheckMs ?? 30_000;
    this._idleTimer = null;

    // iter22 — SAB cache to kill the +500-800 MB/min leak during
    // _teachHebbian heartbeats. Without these caches, every propagate()
    // and every hebbianUpdate() allocates fresh SharedArrayBuffer for
    // (a) the output currents, (b) pre-spike Float32 conversion, (c)
    // post-spike Float32 conversion, plus shadowed input spikes. At
    // biological scale 13M neurons × 4 bytes = 52 MB per SAB. Tens of
    // thousands of dispatches per cell = TBs of SAB churn per cell.
    // The SABs are cleaned up by V8/native GC eventually but accumulate
    // faster than reclaim during heavy teach phases — V2 watchdog saw
    // native pool climbing +400-800 MB/heartbeat sustained for 4-min
    // windows before GC finally caught up.
    //
    // Cache strategy: keep one SAB per (length, kind). Reuse if next
    // call needs same length; reallocate if it grows. Holds at most a
    // few entries because all curricular teach paths use the same
    // cluster.size for spikes and same matrix.rows for output.
    this._cachedOutputSab = null;     // matmul output currents
    this._cachedOutputView = null;
    this._cachedSpikesSab = null;     // propagate spike input
    this._cachedSpikesView = null;
    this._cachedPreSab = null;        // hebbian pre-spikes
    this._cachedPreView = null;
    this._cachedPostSab = null;       // hebbian post-spikes
    this._cachedPostView = null;

    this._init();
  }

  // iter22 — get-or-allocate a cached Float32Array view backed by a
  // SharedArrayBuffer of `length` elements. `slot` is the cache name
  // (output / spikes / pre / post). Reallocates only if the cached
  // entry is missing or smaller than the requested length.
  _getCachedFloat32Sab(slot, length) {
    const sabKey = `_cached${slot}Sab`;
    const viewKey = `_cached${slot}View`;
    if (this[viewKey] && this[viewKey].length >= length) {
      // Reuse existing buffer; expose a subarray view of the requested
      // length so callers see exactly what they asked for. Workers
      // accept the SAB itself (sized to the cached max), and we pass
      // the explicit row count separately so they only touch
      // [startRow, endRow).
      return { sab: this[sabKey], view: this[viewKey].subarray(0, length) };
    }
    const sab = new SharedArrayBuffer(length * 4);
    const view = new Float32Array(sab);
    this[sabKey] = sab;
    this[viewKey] = view;
    return { sab, view };
  }
  _getCachedUint32Sab(slot, length) {
    const sabKey = `_cached${slot}Sab`;
    const viewKey = `_cached${slot}View`;
    if (this[viewKey] && this[viewKey].length >= length) {
      return { sab: this[sabKey], view: this[viewKey].subarray(0, length) };
    }
    const sab = new SharedArrayBuffer(length * 4);
    const view = new Uint32Array(sab);
    this[sabKey] = sab;
    this[viewKey] = view;
    return { sab, view };
  }

  _init() {
    if (!workerThreadsAvailable) {
      console.warn('[WorkerPool] worker_threads unavailable — CPU sparse matmul stays single-threaded.');
      return;
    }
    const path = require('path');
    const workerPath = path.join(__dirname, 'sparse-worker.js');
    try {
      for (let i = 0; i < this._poolSize; i++) {
        const w = new WorkerClass(workerPath);
        w.on('message', (msg) => this._handleMessage(msg));
        w.on('error', (err) => console.warn(`[WorkerPool] worker ${i} error:`, err.message));
        this._workers.push(w);
      }
      this._ready = true;
      // Reset idle clock. Without this, a pool re-init after idle-
      // termination inherits the stale `_lastJobAt` from before the
      // shutdown — the watchdog's next tick sees "idle 52 minutes"
      // and terminates again immediately. Operator log captured the
      // thrashing as `idle 3146s → terminate → restart → idle 3177s
      // → terminate → restart` on a 30-second cadence.
      this._lastJobAt = Date.now();
      console.log(`[WorkerPool] Started ${this._poolSize} sparse-matmul workers (${os.cpus()?.length} cores available).`);
      console.log(`[WorkerPool] Each worker runs its own V8 heap — expect ~${this._poolSize * 30} MB of worker heap baseline showing as 'workers' in the curriculum heartbeat. That total is NOT a leak; it's the pool's steady-state footprint and stays roughly flat unless a pool call churns external buffers.`);
      // Start idle-termination watchdog. If no propagate/hebbian
      // dispatches hit the pool for `_idleTerminateMs`, the pool
      // shuts itself down to release worker heap. Next call re-inits.
      this._startIdleWatchdog();
    } catch (err) {
      console.warn('[WorkerPool] Worker init failed:', err.message);
      this._ready = false;
    }
  }

  _handleMessage(msg) {
    if (msg.type === 'memSnap') {
      // Worker memoryUsage snapshot reply. Stash it in the cache indexed
      // by the snapId so concurrent mem-snapshot requests don't collide.
      if (!this._memSnapInflight) return;
      const entry = this._memSnapInflight.get(msg.snapId);
      if (!entry) return;
      entry.received++;
      if (!msg.error) {
        entry.replies.push({
          heapUsed: msg.heapUsed,
          heapTotal: msg.heapTotal,
          external: msg.external,
          arrayBuffers: msg.arrayBuffers,
          rss: msg.rss,
        });
      }
      if (entry.received >= entry.expected) {
        this._memSnapInflight.delete(msg.snapId);
        entry.resolve(entry.replies);
      }
      return;
    }
    if (msg.type !== 'done') return;
    const entry = this._pending.get(msg.jobId);
    if (!entry) return;
    entry.received++;
    if (entry.received >= entry.expected) {
      this._pending.delete(msg.jobId);
      entry.resolve();
    }
  }

  /**
   * Ask every worker for its current process.memoryUsage() and return
   * an aggregate. Resolves to `{ workerCount, totalHeapUsedMb,
   * totalExternalMb, totalRssMb, replies }`. Used by the curriculum
   * heartbeat to label worker-thread memory as a separate `workers=…`
   * field so operator no longer sees worker heap reported as
   * "unaccounted" — that was scaring Gee into thinking there was a
   * 450+ MB leak when it was just the pool's baseline footprint.
   *
   * Falls back to the per-worker estimate constant when the pool isn't
   * ready or all workers failed to reply. 500ms timeout caps the wait.
   */
  async memSnapshot(timeoutMs = 500) {
    const PER_WORKER_ESTIMATE_MB = 30;
    const fallback = () => ({
      workerCount: this._workers.length,
      estimated: true,
      totalHeapUsedMb: this._workers.length * PER_WORKER_ESTIMATE_MB,
      totalExternalMb: 0,
      totalRssMb: this._workers.length * PER_WORKER_ESTIMATE_MB,
      replies: [],
    });
    if (!this._ready || this._workers.length === 0) return fallback();
    if (!this._memSnapInflight) this._memSnapInflight = new Map();
    const snapId = ++this._jobSeq;
    const N = this._workers.length;
    const resultP = new Promise((resolve) => {
      this._memSnapInflight.set(snapId, { expected: N, received: 0, replies: [], resolve });
    });
    for (const w of this._workers) {
      try { w.postMessage({ type: 'mem', snapId }); }
      catch { /* worker dead — counts as non-reply, timeout handles it */ }
    }
    const timedOutP = new Promise((resolve) => setTimeout(() => {
      const entry = this._memSnapInflight?.get(snapId);
      if (entry) {
        this._memSnapInflight.delete(snapId);
        resolve(entry.replies); // resolve with whatever we have
      }
    }, timeoutMs));
    const replies = await Promise.race([resultP, timedOutP]);
    if (!replies || replies.length === 0) return fallback();
    let heap = 0, external = 0, rss = 0;
    for (const r of replies) {
      heap += r.heapUsed || 0;
      external += r.external || 0;
      rss += r.rss || 0;
    }
    const mb = (b) => Math.round(b / 1048576);
    return {
      workerCount: this._workers.length,
      respondedCount: replies.length,
      estimated: false,
      totalHeapUsedMb: mb(heap),
      totalExternalMb: mb(external),
      totalRssMb: mb(rss),
      replies,
    };
  }

  /**
   * Propagate a sparse CSR matrix against a spike vector across the
   * worker pool. Returns a Float32Array of post-synaptic currents.
   *
   * Uses SharedArrayBuffer so workers read/write the same memory
   * regions the caller sees — zero copy for the CSR data + input
   * spikes + output currents.
   *
   * If the pool isn't available, runs the matmul synchronously on the
   * main thread as a fallback. Same result, just no parallelism.
   */
  async propagate(matrix, spikesU32) {
    this._lastJobAt = Date.now();
    const rows = matrix.rows;

    // Materialize shared buffers. Ideally the caller already hands us
    // SharedArrayBuffer-backed views; if not (regular ArrayBuffer),
    // copy into shared memory so workers can access them. This copy
    // is O(nnz) one-time per call — cheap relative to the matmul.
    const shared = (arr, SharedCtor) => {
      if (arr.buffer instanceof SharedArrayBuffer) return arr;
      const sab = new SharedArrayBuffer(arr.byteLength);
      const view = new SharedCtor(sab);
      view.set(arr);
      return view;
    };

    // Single-thread fallback — just do it here, synchronously.
    if (!this._ready || this._workers.length === 0) {
      const out = new Float32Array(rows);
      const vals = matrix.values instanceof Float32Array ? matrix.values : new Float32Array(matrix.values);
      const cols = matrix.colIdx;
      const rowP = matrix.rowPtr;
      for (let i = 0; i < rows; i++) {
        let sum = 0;
        const s = rowP[i];
        const e = rowP[i + 1];
        for (let k = s; k < e; k++) {
          if (spikesU32[cols[k]] !== 0) sum += vals[k];
        }
        out[i] = sum;
      }
      return out;
    }

    const valsShared = shared(matrix.values instanceof Float32Array ? matrix.values : new Float32Array(matrix.values), Float32Array);
    const colsShared = shared(matrix.colIdx instanceof Uint32Array ? matrix.colIdx : new Uint32Array(matrix.colIdx), Uint32Array);
    const rowPShared = shared(matrix.rowPtr instanceof Uint32Array ? matrix.rowPtr : new Uint32Array(matrix.rowPtr), Uint32Array);
    // iter22 — reuse cached SABs for hot per-call buffers.
    let spikesShared;
    if (spikesU32.buffer instanceof SharedArrayBuffer) {
      spikesShared = spikesU32;
    } else {
      const cached = this._getCachedUint32Sab('Spikes', spikesU32.length);
      cached.view.set(spikesU32);
      spikesShared = cached.view;
    }
    const outCached = this._getCachedFloat32Sab('Output', rows);
    // Zero the slice we will write into. Worker overwrites every entry
    // it owns but row counts that don't divide evenly across workers
    // can leave trailing entries from a prior larger-rows job.
    outCached.view.fill(0);
    const outSab = outCached.sab;
    const outView = outCached.view;

    const jobId = ++this._jobSeq;
    const N = this._workers.length;
    const rowsPerWorker = Math.ceil(rows / N);

    return new Promise((resolve) => {
      this._pending.set(jobId, { resolve: () => resolve(outView), expected: N, received: 0 });

      for (let i = 0; i < N; i++) {
        const startRow = i * rowsPerWorker;
        const endRow = Math.min(startRow + rowsPerWorker, rows);
        if (startRow >= rows) {
          // This worker has no rows to do; counts as already done.
          const entry = this._pending.get(jobId);
          if (entry) {
            entry.received++;
            if (entry.received >= entry.expected) {
              this._pending.delete(jobId);
              resolve(outView);
            }
          }
          continue;
        }
        this._workers[i].postMessage({
          type: 'propagate',
          jobId,
          valuesBuf: valsShared.buffer,
          colIdxBuf: colsShared.buffer,
          rowPtrBuf: rowPShared.buffer,
          spikesBuf: spikesShared.buffer,
          currentsBuf: outSab,
          startRow,
          endRow,
        });
      }
    });
  }

  /**
   * T17.2 — Hebbian update across the worker pool. Each worker
   * processes a disjoint row-range of the matrix's values buffer, so
   * there are no write collisions. Mutates the matrix in place (just
   * like `SparseMatrix.hebbianUpdate`) — after the promise resolves
   * every weight has been updated with `ΔW = η · post · pre` clamped
   * to [wMin, wMax].
   *
   * Falls through to synchronous single-thread matmul if the pool
   * isn't available. Same result, just no parallelism.
   */
  async hebbianUpdate(matrix, preSpikes, postSpikes, lr) {
    this._lastJobAt = Date.now();
    const rows = matrix.rows;
    const wMin = matrix.wMin ?? -2.0;
    const wMax = matrix.wMax ?? 2.0;

    // Convert to Float32 (typed array) so the shared buffer is a
    // well-defined binary layout across workers. Single-thread
    // fallback below accepts whatever the caller passed.
    if (!this._ready || this._workers.length === 0) {
      // Synchronous fallback — identical semantics to
      // SparseMatrix.hebbianUpdate so behavior is indistinguishable.
      const values = matrix.values;
      const colIdx = matrix.colIdx;
      const rowP = matrix.rowPtr;
      for (let i = 0; i < rows; i++) {
        if (!postSpikes[i]) continue;
        const scaled = lr * postSpikes[i];
        const start = rowP[i];
        const end = rowP[i + 1];
        for (let k = start; k < end; k++) {
          let v = values[k] + scaled * preSpikes[colIdx[k]];
          if (v > wMax) v = wMax;
          else if (v < wMin) v = wMin;
          values[k] = v;
        }
      }
      return true;
    }

    const shared = (arr, SharedCtor) => {
      if (arr.buffer instanceof SharedArrayBuffer) return arr;
      const sab = new SharedArrayBuffer(arr.byteLength);
      const view = new SharedCtor(sab);
      view.set(arr);
      return view;
    };

    // values MUST be shared (we mutate it). If the caller's values
    // array isn't already SharedArrayBuffer-backed, upgrade it in
    // place so subsequent calls benefit too.
    if (!(matrix.values.buffer instanceof SharedArrayBuffer)) {
      const sab = new SharedArrayBuffer(matrix.values.byteLength);
      const shView = matrix.values instanceof Float32Array
        ? new Float32Array(sab)
        : new Float64Array(sab);
      shView.set(matrix.values);
      matrix.values = shView;
    }
    const valsShared = matrix.values instanceof Float32Array
      ? matrix.values
      : (() => {
          // Hebbian worker expects Float32 — one-time conversion if
          // matrix is stored as Float64 (SparseMatrix default).
          const sab = new SharedArrayBuffer(matrix.rows === 0 ? 4 : matrix.values.length * 4);
          const v = new Float32Array(sab);
          for (let i = 0; i < matrix.values.length; i++) v[i] = matrix.values[i];
          return v;
        })();
    const colsShared = shared(matrix.colIdx instanceof Uint32Array ? matrix.colIdx : new Uint32Array(matrix.colIdx), Uint32Array);
    const rowPShared = shared(matrix.rowPtr instanceof Uint32Array ? matrix.rowPtr : new Uint32Array(matrix.rowPtr), Uint32Array);
    // iter22 — cache pre / post Float32 SABs across calls. The
    // Float32Array.from(...) + new SharedArrayBuffer(byteLength) per call
    // path was allocating ~104 MB per dispatch (52 MB pre + 52 MB post)
    // at biological scale. With curriculum teach phases firing tens of
    // thousands of hebbianUpdate calls per cell, that was ~TB of SAB
    // churn per cell — V2 watchdog tracked this as the +500-800 MB/min
    // _teachHebbian heartbeat leak that prior iter22 commits had only
    // partially mitigated (curriculum-side fixed; pool-side untouched).
    let preShared, postShared;
    if (preSpikes instanceof Float32Array && preSpikes.buffer instanceof SharedArrayBuffer) {
      preShared = preSpikes;
    } else {
      const cached = this._getCachedFloat32Sab('Pre', preSpikes.length);
      cached.view.set(preSpikes);
      preShared = cached.view;
    }
    if (postSpikes instanceof Float32Array && postSpikes.buffer instanceof SharedArrayBuffer) {
      postShared = postSpikes;
    } else {
      const cached = this._getCachedFloat32Sab('Post', postSpikes.length);
      cached.view.set(postSpikes);
      postShared = cached.view;
    }

    const jobId = ++this._jobSeq;
    const N = this._workers.length;
    const rowsPerWorker = Math.ceil(rows / N);

    await new Promise((resolve) => {
      this._pending.set(jobId, { resolve, expected: N, received: 0 });
      for (let i = 0; i < N; i++) {
        const startRow = i * rowsPerWorker;
        const endRow = Math.min(startRow + rowsPerWorker, rows);
        if (startRow >= rows) {
          const entry = this._pending.get(jobId);
          if (entry) {
            entry.received++;
            if (entry.received >= entry.expected) {
              this._pending.delete(jobId);
              resolve();
            }
          }
          continue;
        }
        this._workers[i].postMessage({
          type: 'hebbian',
          jobId,
          valuesBuf: valsShared.buffer,
          colIdxBuf: colsShared.buffer,
          rowPtrBuf: rowPShared.buffer,
          preSpikesBuf: preShared.buffer,
          postSpikesBuf: postShared.buffer,
          startRow,
          endRow,
          lr,
          wMin,
          wMax,
        });
      }
    });

    // If we up-converted values to Float32 for workers but matrix
    // stored Float64, copy back so subsequent CPU single-thread reads
    // see the updated weights. (This only fires when the SparseMatrix
    // was constructed with Float64 values, which is the default.)
    if (valsShared !== matrix.values) {
      for (let i = 0; i < valsShared.length; i++) matrix.values[i] = valsShared[i];
    }
    return true;
  }

  get ready() {
    // Lazy re-init when the idle watchdog previously shut the pool
    // down. A caller asking for readiness after a long idle window
    // gets a fresh pool on first check — zero manual state required.
    if (!this._ready && this._idleTerminated) {
      this._idleTerminated = false;
      this._init();
    }
    return this._ready;
  }
  get size() { return this._workers.length; }

  _startIdleWatchdog() {
    if (this._idleTimer) clearInterval(this._idleTimer);
    this._idleTimer = setInterval(() => {
      if (!this._ready || this._workers.length === 0) return;
      const idleMs = Date.now() - this._lastJobAt;
      if (idleMs >= this._idleTerminateMs) {
        console.log(`[WorkerPool] idle ${Math.round(idleMs/1000)}s — terminating ${this._workers.length} workers to release heap; pool re-inits on next call.`);
        this.shutdown({ fromIdle: true });
      }
    }, this._idleCheckMs);
    if (this._idleTimer && typeof this._idleTimer.unref === 'function') this._idleTimer.unref();
  }

  shutdown(opts = {}) {
    for (const w of this._workers) {
      try { w.postMessage({ type: 'shutdown' }); } catch {}
      try { w.terminate(); } catch {}
    }
    this._workers = [];
    this._ready = false;
    if (this._idleTimer) {
      clearInterval(this._idleTimer);
      this._idleTimer = null;
    }
    // `fromIdle` marks a watchdog-triggered shutdown so `get ready()`
    // can lazily re-init on the next call. Explicit shutdowns (server
    // stop) shouldn't auto-restart.
    if (opts.fromIdle) this._idleTerminated = true;
  }
}

module.exports = { SparseMatmulPool };
