/**
 * test_activerows.mjs — is active-row Oja bit-identical, and is it faster?
 *
 * THE CLAIM UNDER TEST. Cortical firing is sparse: a few thousand rows out
 * of a region millions wide. `ojaUpdate` already skips rows whose post is
 * 0, but it VISITS every row to discover that, so the outer loop costs
 * O(region) while the real work is O(firing). At biological scale that
 * skip-scan is the multi-second synchronous block that starves donor
 * handshakes and dashboard requests during teach — the block the chunking
 * and event-loop yields exist to survive.
 *
 * Passing `activeRows` makes the loop O(firing). That is only legitimate
 * if it changes NOTHING about the result, and the reason it should is one
 * line of algebra: Oja's update is
 *
 *     Δw = lr·y·x − lr·y²·w
 *
 * so at y = 0 (a non-firing post row) every term carries a factor of y and
 * the update is exactly 0 — no learning AND no decay. A skipped row and a
 * visited-then-skipped row must leave byte-identical weights.
 *
 * "Must" is a prediction, so this measures it rather than asserting it.
 *
 * Two checks:
 *   1. BIT-IDENTICAL — same matrix, same input, full scan vs active rows.
 *      Every weight must match to the last bit, not to a tolerance. A
 *      tolerance would hide exactly the reordering bug worth catching.
 *   2. FASTER, AND MORE SO AS THE REGION GROWS — the speedup must track
 *      the sparsity ratio. If it does not scale, the diagnosis was wrong.
 *
 * Run: node js/brain/test_activerows.mjs
 */
import { SparseMatrix } from './sparse-matrix.js';

let failures = 0;
function check(name, pass, detail) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

// Deterministic PRNG so a failure is reproducible.
let _s = 12345;
function rnd() { _s = (_s * 48271) % 2147483647; return _s / 2147483647; }

/**
 * Build a CSR matrix shaped like a real cross-projection: `rows` post
 * neurons, each with `fanout` incoming synapses (his targetFanout is 30).
 */
function buildMatrix(rows, cols, fanout) {
  const nnz = rows * fanout;
  const m = new SparseMatrix(rows, cols, 0);
  m.values = new Float64Array(nnz);
  m.colIdx = new Uint32Array(nnz);
  m.rowPtr = new Uint32Array(rows + 1);
  m.nnz = nnz;
  m.wMin = -1; m.wMax = 1;
  let k = 0;
  for (let i = 0; i < rows; i++) {
    m.rowPtr[i] = k;
    for (let f = 0; f < fanout; f++) {
      m.colIdx[k] = Math.floor(rnd() * cols);
      m.values[k] = (rnd() - 0.5) * 0.1;
      k++;
    }
  }
  m.rowPtr[rows] = k;
  return m;
}

/** Sparse post-spike vector + its active index list — the real shape. */
function buildSpikes(len, firing) {
  const vec = new Float64Array(len);
  const active = [];
  const stride = Math.max(1, Math.floor(len / firing));
  for (let i = 0; i < len; i += stride) { vec[i] = 1; active.push(i); }
  return { vec, active };
}

console.log('\nactive-row Oja — identical result, sparse cost\n');

// ─── 1. Bit-identical ──────────────────────────────────────────────
{
  const ROWS = 40000, COLS = 4000, FANOUT = 30, FIRING = 200;
  const post = buildSpikes(ROWS, FIRING);
  const pre = buildSpikes(COLS, 300).vec;

  const a = buildMatrix(ROWS, COLS, FANOUT);
  _s = 12345;
  const b = buildMatrix(ROWS, COLS, FANOUT);

  // Same starting weights (rebuilt from the same seed), then diverge only
  // by which iteration strategy runs.
  a.ojaUpdate(pre, post.vec, 0.01);                                  // full scan
  b.ojaUpdate(pre, post.vec, 0.01, { activeRows: post.active });     // active rows

  let mismatches = 0;
  let firstAt = -1;
  for (let i = 0; i < a.values.length; i++) {
    if (a.values[i] !== b.values[i]) {
      mismatches++;
      if (firstAt < 0) firstAt = i;
    }
  }
  check('bit-identical weights after one update', mismatches === 0,
    mismatches === 0
      ? `all ${a.values.length.toLocaleString()} weights match exactly`
      : `${mismatches} differ, first at index ${firstAt}`);

  // A weight must actually have MOVED — otherwise "identical" is trivially
  // true because neither path did anything.
  let moved = 0;
  const fresh = (_s = 12345, buildMatrix(ROWS, COLS, FANOUT));
  for (let i = 0; i < b.values.length; i++) if (b.values[i] !== fresh.values[i]) moved++;
  check('the update was not a no-op', moved > 0, `${moved.toLocaleString()} weights changed`);
}

// ─── 2. Cost scales with firing, not region size ───────────────────
// The whole diagnosis is that cost tracks REGION SIZE when it should track
// FIRING COUNT. Hold firing fixed, grow the region, and watch the two
// strategies diverge. If the speedup does not grow, the diagnosis is wrong.
{
  const COLS = 4000, FANOUT = 30, FIRING = 200;
  console.log('');
  const results = [];
  for (const ROWS of [20000, 80000, 320000]) {
    const post = buildSpikes(ROWS, FIRING);
    const pre = buildSpikes(COLS, 300).vec;
    const m = buildMatrix(ROWS, COLS, FANOUT);

    // WARM UP BOTH PATHS FIRST. Without this the first-measured strategy
    // pays for JIT compilation and reports slower than it is: the initial
    // run of this benchmark showed the active path at 0.8x on the smallest
    // matrix purely because the full scan ran first and absorbed the
    // compile cost. Warming both, then measuring both, removes the
    // ordering artifact — and the small-matrix case is exactly where the
    // true difference is smallest, so it is the one an artifact can flip.
    const REPS = 20;
    for (let r = 0; r < 5; r++) {
      m.ojaUpdate(pre, post.vec, 0.0001);
      m.ojaUpdate(pre, post.vec, 0.0001, { activeRows: post.active });
    }

    let t = process.hrtime.bigint();
    for (let r = 0; r < REPS; r++) m.ojaUpdate(pre, post.vec, 0.0001);
    const fullMs = Number(process.hrtime.bigint() - t) / 1e6 / REPS;

    t = process.hrtime.bigint();
    for (let r = 0; r < REPS; r++) m.ojaUpdate(pre, post.vec, 0.0001, { activeRows: post.active });
    const activeMs = Number(process.hrtime.bigint() - t) / 1e6 / REPS;

    const speedup = fullMs / activeMs;
    results.push({ ROWS, fullMs, activeMs, speedup });
    console.log(`  ${String(ROWS).padStart(7)} rows · ${post.active.length} firing (${(100 * post.active.length / ROWS).toFixed(2)}% dense)  ` +
      `full ${fullMs.toFixed(3)}ms → active ${activeMs.toFixed(3)}ms  = ${speedup.toFixed(1)}x`);
  }
  console.log('');
  check('active-row path is faster at every size',
    results.every(r => r.speedup > 1),
    results.map(r => `${r.speedup.toFixed(1)}x`).join(' · '));
  check('speedup GROWS as the region grows (cost tracks firing, not size)',
    results[2].speedup > results[0].speedup,
    `${results[0].speedup.toFixed(1)}x at ${results[0].ROWS} → ${results[2].speedup.toFixed(1)}x at ${results[2].ROWS}`);
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
