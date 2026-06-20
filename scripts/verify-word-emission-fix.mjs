// verify-word-emission-fix.mjs — decisive, GPU-free, GloVe-free proof that
// the word_motor lamination fix restores TRAINABILITY of word emission.
//
// Background: the sem_to_word_motor cross-projection is the primary word
// emission path (emitWordDirect propagates sem -> word_motor and argmaxes a
// word bucket). Before the lamination fix it initialized with nnz=0 (zero
// synapses) because word_motor was wrongly excluded from cortical lamination,
// so its L4 dst-mask matched no neurons. ojaUpdate only STRENGTHENS existing
// synapses (no synaptogenesis) -> training was a permanent no-op -> emission
// dead.
//
// This script isolates that exact mechanism. It trains K distinct
// word->bucket mappings through the SAME ojaUpdate call _teachWordEmissionDirect
// uses, then probes whether the brain recovers the correct bucket by argmax.
//   - On the FIXED projection (nnz>0): recovery should be well above chance.
//   - On a simulated BUG projection (nnz=0): ojaUpdate is a no-op, recovery
//     collapses to chance/zero.
//
// Run: node scripts/verify-word-emission-fix.mjs

import { NeuronCluster } from '../js/brain/cluster.js';
import { SparseMatrix } from '../js/brain/sparse-matrix.js';

const SIZE = 20000;
const K = 6;           // distinct synthetic words
const REPS = 60;
const LR = 0.05;

const cluster = new NeuronCluster('cortex', SIZE, {
  tonicDrive: 14, noiseAmplitude: 7, connectivity: 0.15,
  excitatoryRatio: 0.85, learningRate: 0.002,
});

const sem = cluster.regions.sem;
const wm = cluster.regions.word_motor;
const semSize = sem.end - sem.start;
const wmSize = wm.end - wm.start;
const proj = cluster.crossProjections.sem_to_word_motor;

console.log(`sem=${semSize} word_motor=${wmSize} sem_to_word_motor nnz=${proj.nnz}`);

// Deterministic pseudo-random (no Math.random — keep it reproducible).
let _s = 0x12345678 >>> 0;
const rnd = () => { _s = (Math.imul(_s ^ (_s >>> 15), 0x2C9277B5) + 0x6C078965) >>> 0; return _s / 0xFFFFFFFF; };

// K distinct dense-ish sem patterns (each ~50% active dims) — mirrors a
// tiled word embedding spread across the sem region.
const patterns = [];
for (let w = 0; w < K; w++) {
  const p = new Float64Array(semSize);
  for (let d = 0; d < semSize; d++) p[d] = (rnd() < 0.5) ? (0.4 + 0.6 * rnd()) : 0;
  patterns.push(p);
}

// K contiguous word_motor buckets.
const bucketSize = Math.max(1, Math.floor(wmSize / K));
const buckets = [];
for (let w = 0; w < K; w++) {
  const post = new Float64Array(wmSize);
  const bStart = w * bucketSize;
  const bEnd = (w === K - 1) ? wmSize : (w + 1) * bucketSize;
  for (let n = bStart; n < bEnd; n++) post[n] = 1;
  buckets.push({ post, bStart, bEnd });
}

function trainAndProbe(matrix, label) {
  // Train: word w sem pattern -> word w bucket, via the real ojaUpdate.
  for (let rep = 0; rep < REPS; rep++) {
    for (let w = 0; w < K; w++) matrix.ojaUpdate(patterns[w], buckets[w].post, LR);
  }
  // Probe: inject word w sem pattern, propagate, argmax bucket by mean activation.
  let correct = 0;
  const detail = [];
  for (let w = 0; w < K; w++) {
    const out = matrix.propagate(patterns[w]);
    let bestBucket = -1, bestMean = -Infinity;
    for (let b = 0; b < K; b++) {
      const { bStart, bEnd } = buckets[b];
      let s = 0; for (let n = bStart; n < bEnd; n++) s += out[n];
      const mean = s / Math.max(1, bEnd - bStart);
      if (mean > bestMean) { bestMean = mean; bestBucket = b; }
    }
    if (bestBucket === w) correct++;
    detail.push(`w${w}->b${bestBucket}${bestBucket === w ? '✓' : '✗'}`);
  }
  const rate = correct / K;
  console.log(`  [${label}] recovery ${correct}/${K} (${(rate * 100).toFixed(0)}%) — ${detail.join(' ')}`);
  return rate;
}

console.log(`\nchance baseline = ${(100 / K).toFixed(0)}%  (1 of ${K} buckets)\n`);

// (A) FIXED projection — the real, now-laminated sem_to_word_motor (nnz>0).
console.log('(A) FIXED projection (nnz>0 — word_motor laminated):');
const fixedRate = trainAndProbe(proj, 'FIXED');

// (B) BUG simulation — same geometry but nnz=0 (empty CSR), reproducing the
// pre-fix state where word_motor had no L4 targets.
console.log('\n(B) BUG simulation (nnz=0 — emulates pre-fix unlaminated word_motor):');
const bug = new SparseMatrix(wmSize, semSize, { wMin: -0.4, wMax: 0.4 });
bug.values = new Float64Array(0);
bug.colIdx = new Uint32Array(0);
bug.rowPtr = new Uint32Array(wmSize + 1); // all zero -> every row empty
bug.nnz = 0;
const bugRate = trainAndProbe(bug, 'BUG');

console.log('\n────────────────────────────────────────────────');
const verdict = fixedRate > bugRate && fixedRate >= 0.5;
console.log(`FIXED recovery ${(fixedRate * 100).toFixed(0)}% vs BUG recovery ${(bugRate * 100).toFixed(0)}%`);
console.log(verdict
  ? '✅ PROOF — the lamination fix makes word emission TRAINABLE; the nnz=0 bug state cannot learn (no-op ojaUpdate).'
  : '⚠ INCONCLUSIVE — fixed recovery not clearly above the bug/chance baseline; investigate further.');
process.exit(verdict ? 0 : 1);
