/**
 * T18.4.e — Worker thread for sparse CSR matmul row-range.
 *
 * Runs in a Node worker_thread. Receives:
 *   - Shared CSR arrays (values, colIdx, rowPtr) via SharedArrayBuffer
 *   - Shared spikes input buffer (Uint32Array-backed) via SharedArrayBuffer
 *   - Shared output currents buffer (Float32Array-backed) via SharedArrayBuffer
 *   - Row range [startRow, endRow) to process
 *
 * Writes currents[startRow..endRow) atomically via the shared output buffer.
 * Posts a `done` message on completion so the main thread's Promise.all
 * can resolve.
 *
 * No zero-copy magic — SharedArrayBuffer lets workers read/write without
 * cloning, so a 100MB CSR matrix is shared by reference not copy. Pool
 * startup cost is one-time; per-call dispatch is just a postMessage +
 * message round-trip (~sub-ms).
 *
 * Main-thread pool manager in `server/worker-pool.js`.
 */

const { parentPort } = require('worker_threads');

parentPort.on('message', (msg) => {
  if (msg.type === 'propagate') {
    propagate(msg);
  } else if (msg.type === 'hebbian') {
    hebbian(msg);
  } else if (msg.type === 'hebbianBatch') {
    hebbianBatch(msg);
  } else if (msg.type === 'mem') {
    // Memory snapshot request. Main thread aggregates these across
    // all workers so the heartbeat can show `workers=XXXmb` as a
    // separate labeled field instead of dumping worker heaps into
    // the "unaccounted" bucket and scaring the operator.
    try {
      const mu = process.memoryUsage();
      parentPort.postMessage({
        type: 'memSnap',
        snapId: msg.snapId,
        heapUsed: mu.heapUsed,
        heapTotal: mu.heapTotal,
        external: mu.external,
        arrayBuffers: mu.arrayBuffers || 0,
        rss: mu.rss,
      });
    } catch {
      parentPort.postMessage({ type: 'memSnap', snapId: msg.snapId, error: true });
    }
  } else if (msg.type === 'shutdown') {
    process.exit(0);
  }
});

function propagate(msg) {
  const {
    jobId,
    valuesBuf,
    colIdxBuf,
    rowPtrBuf,
    spikesBuf,
    currentsBuf,
    startRow,
    endRow,
  } = msg;

  // SharedArrayBuffer views — zero-copy access to the shared CSR data
  // and the input spike vector. Output currents buffer is also shared,
  // and each worker writes only to its own row range [startRow, endRow)
  // so there are no cross-worker write collisions by construction.
  const values  = new Float32Array(valuesBuf);
  const colIdx  = new Uint32Array(colIdxBuf);
  const rowPtr  = new Uint32Array(rowPtrBuf);
  const spikes  = new Uint32Array(spikesBuf);
  const currents = new Float32Array(currentsBuf);

  // Sparse CSR matmul over this worker's row range:
  //   currents[i] = Σ_{k=rowPtr[i]..rowPtr[i+1]} values[k] · spikes[colIdx[k]]
  for (let i = startRow; i < endRow; i++) {
    let sum = 0;
    const start = rowPtr[i];
    const end = rowPtr[i + 1];
    for (let k = start; k < end; k++) {
      if (spikes[colIdx[k]] !== 0) {
        sum += values[k];
      }
    }
    currents[i] = sum;
  }

  parentPort.postMessage({ type: 'done', jobId, startRow, endRow });
}

/**
 * T17.2 — Hebbian update on a row-range of a sparse CSR matrix.
 *
 *   ΔW_ij = η · post_i · pre_j
 *
 * Each row's update touches only its own slice of `values[start..end]`
 * so splitting row-range across workers is race-free by construction
 * (same reasoning as propagate). Worker reads preSpikes + postSpikes
 * shared buffers, writes directly to shared values buffer with bounds
 * clamping at wMin/wMax.
 */
function hebbian(msg) {
  const {
    jobId,
    valuesBuf,
    colIdxBuf,
    rowPtrBuf,
    preSpikesBuf,
    postSpikesBuf,
    startRow,
    endRow,
    lr,
    wMin,
    wMax,
  } = msg;

  const values = new Float32Array(valuesBuf);
  const colIdx = new Uint32Array(colIdxBuf);
  const rowPtr = new Uint32Array(rowPtrBuf);
  const preSpikes = new Float32Array(preSpikesBuf);
  const postSpikes = new Float32Array(postSpikesBuf);

  for (let i = startRow; i < endRow; i++) {
    const post = postSpikes[i];
    if (post === 0) continue;
    const scaled = lr * post;
    const start = rowPtr[i];
    const end = rowPtr[i + 1];
    for (let k = start; k < end; k++) {
      let v = values[k] + scaled * preSpikes[colIdx[k]];
      if (v > wMax) v = wMax;
      else if (v < wMin) v = wMin;
      values[k] = v;
    }
  }

  parentPort.postMessage({ type: 'done', jobId, startRow, endRow });
}

/**
 * iter24.5 — batched Hebbian. Pack N (pre, post) pairs into a single
 * postMessage; worker iterates internally and runs sequential Hebbian
 * per pair. Math identical to N separate `hebbian` dispatches because
 * the inner loop is the same per-pair logic in the same order.
 *
 * Strided layout:
 *   prePackedBuf  = batchCount slices of `sliceLen` floats, contiguous
 *   postPackedBuf = batchCount slices of `sliceLen` floats, contiguous
 *
 * Single CSR is shared across the whole batch — caller groups pairs
 * by matrix.
 */
function hebbianBatch(msg) {
  const {
    jobId,
    valuesBuf,
    colIdxBuf,
    rowPtrBuf,
    prePackedBuf,
    postPackedBuf,
    sliceLen,
    batchCount,
    startRow,
    endRow,
    lr,
    wMin,
    wMax,
  } = msg;

  const values = new Float32Array(valuesBuf);
  const colIdx = new Uint32Array(colIdxBuf);
  const rowPtr = new Uint32Array(rowPtrBuf);
  const prePacked = new Float32Array(prePackedBuf);
  const postPacked = new Float32Array(postPackedBuf);

  for (let k = 0; k < batchCount; k++) {
    const preBase = k * sliceLen;
    const postBase = k * sliceLen;
    for (let i = startRow; i < endRow; i++) {
      const post = postPacked[postBase + i];
      if (post === 0) continue;
      const scaled = lr * post;
      const rowStart = rowPtr[i];
      const rowEnd = rowPtr[i + 1];
      for (let p = rowStart; p < rowEnd; p++) {
        let v = values[p] + scaled * prePacked[preBase + colIdx[p]];
        if (v > wMax) v = wMax;
        else if (v < wMin) v = wMin;
        values[p] = v;
      }
    }
  }

  parentPort.postMessage({ type: 'done', jobId, startRow, endRow });
}
