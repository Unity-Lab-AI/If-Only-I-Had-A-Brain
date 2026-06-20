// verify-emission.mjs — calibration probe for composeSentence emission
// quality. Exercises the autoregressive emission loop with a varied set
// of K-grade seeds and reports per-metric statistics: emit-success rate,
// multi-word rate, unique-token rate, terminator emergence rate, avg
// coherence cosine, sample emissions.
//
// USAGE (PowerShell / bash):
//   node scripts/verify-emission.mjs
//   node scripts/verify-emission.mjs --rounds=30 --size=500 --seed=42
//   node scripts/verify-emission.mjs --weights=brain-weights.json
//
// EXIT CODES:
//   0 = pass rate ≥ THRESHOLD (default 0.4)
//   1 = pass rate below threshold OR runtime error
//
// The probe constructs a small NeuronCluster + Curriculum instance,
// optionally loads serialized weights from `--weights`, then fires N
// emission rounds. Counts wins per metric. Final summary tabulates the
// distribution so an operator can see at-a-glance whether trained
// emission is landing OR whether the brain is in basin-lock / silent-
// fail / saturation-soup state.
//
// Standalone Node script — no harness, no test framework. Idempotent.
// Safe to fire at any point during curriculum work or post-training to
// check emission health. Pairs with the in-curriculum
// `_probeSentenceGeneration` (which runs during teach gates) — this
// script provides the same family of measurements outside the gate so
// you can compare in-flight probe results against a fresh-cluster
// baseline.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Curriculum } from '../js/brain/curriculum.js';
import { NeuronCluster } from '../js/brain/cluster.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Arg parsing ─────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { rounds: 20, size: 300, seed: null, weights: null, threshold: 0.4, verbose: false };
  for (const a of argv.slice(2)) {
    const m = /^--(\w+)(?:=(.+))?$/.exec(a);
    if (!m) continue;
    const k = m[1];
    const v = m[2];
    if (k === 'rounds' || k === 'size') opts[k] = parseInt(v, 10);
    else if (k === 'threshold') opts.threshold = parseFloat(v);
    else if (k === 'verbose') opts.verbose = true;
    else if (k === 'seed' || k === 'weights') opts[k] = v;
  }
  return opts;
}
const OPTS = parseArgs(process.argv);

// ─── K-grade probe seeds (mix of intent forms) ───────────────────────
// Same family as `_probeSentenceGeneration` plus a wider sweep so the
// distribution surface area is larger. All seeds are natural-language
// K-grade English so the brain has GloVe coverage of every token.
const PROBE_SEEDS = [
  { label: 'svo-statement',     seed: 'i see a thing' },
  { label: 'copula',            seed: 'the cat is big' },
  { label: 'wh-question',       seed: 'what is this' },
  { label: 'imperative',        seed: 'go run' },
  { label: 'exclamative',       seed: 'wow look' },
  { label: 'svo-action',        seed: 'the dog ran fast' },
  { label: 'descriptive',       seed: 'the red ball is round' },
  { label: 'possessive',        seed: 'my mom likes cake' },
  { label: 'negation',          seed: 'i do not want it' },
  { label: 'plural',            seed: 'the cats sleep here' },
  { label: 'where-question',    seed: 'where is the toy' },
  { label: 'why-question',      seed: 'why is it cold' },
  { label: 'count-statement',   seed: 'i have three pets' },
  { label: 'feeling',           seed: 'i feel happy today' },
  { label: 'preference',        seed: 'i like blue best' },
];

console.log(`[verify-emission] starting probe — rounds=${OPTS.rounds} size=${OPTS.size}${OPTS.weights ? ` weights=${OPTS.weights}` : ' weights=(none, fresh cluster)'} threshold=${OPTS.threshold}`);

// ─── Cluster + curriculum construction ───────────────────────────────
// Matches scripts/verify-curriculum-runtime.mjs setup so cluster has
// letter/phon/sem/motor regions the emission loop needs.
const cluster = new NeuronCluster('cortex', OPTS.size, {
  tonicDrive: 14, noiseAmplitude: 7,
  connectivity: 0.15, excitatoryRatio: 0.85, learningRate: 0.002,
});
const dict = {
  size: 0, bigramCount: 0,
  _words: new Map(),
  learnWord: () => {}, learnSentence: () => {},
};
const curr = new Curriculum(cluster, dict);

// ─── Optional weight load ────────────────────────────────────────────
if (OPTS.weights) {
  try {
    const weightsPath = path.isAbsolute(OPTS.weights) ? OPTS.weights : path.join(ROOT, OPTS.weights);
    if (!fs.existsSync(weightsPath)) {
      console.error(`[verify-emission] FATAL: weights file not found at ${weightsPath}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(weightsPath, 'utf8');
    const data = JSON.parse(raw);
    if (typeof cluster.loadWeights === 'function') {
      cluster.loadWeights(data);
      console.log(`[verify-emission] loaded weights from ${weightsPath}`);
    } else {
      console.warn(`[verify-emission] cluster.loadWeights() missing — skipping weight restore`);
    }
  } catch (err) {
    console.error(`[verify-emission] FATAL: weight load failed: ${err.message}`);
    process.exit(1);
  }
}

// ─── Run probe rounds ────────────────────────────────────────────────
const results = [];
const t0 = Date.now();
for (let round = 0; round < OPTS.rounds; round++) {
  const probe = PROBE_SEEDS[round % PROBE_SEEDS.length];
  let composed = null;
  let err = null;
  try {
    if (typeof cluster.composeSentence !== 'function') {
      console.error(`[verify-emission] FATAL: cluster.composeSentence is undefined — wiring bug`);
      process.exit(1);
    }
    composed = await cluster.composeSentence(probe.seed, { subject: 'ela' });
  } catch (e) {
    err = e;
  }
  const words = composed && Array.isArray(composed.words) ? composed.words : [];
  const uniqueWords = new Set(words.map(w => String(w).toLowerCase().replace(/[^a-z']/g, '')));
  uniqueWords.delete('');
  const sentence = composed ? (composed.sentence || '') : '';
  const lastChar = sentence.length > 0 ? sentence.charAt(sentence.length - 1) : '';
  const hasTerminator = lastChar === '.' || lastChar === '?' || lastChar === '!';
  const coherenceCosine = composed && typeof composed.coherenceCosine === 'number' ? composed.coherenceCosine : null;

  results.push({
    round, label: probe.label, seed: probe.seed,
    wordCount: words.length,
    uniqueCount: uniqueWords.size,
    uniqueRatio: words.length > 0 ? uniqueWords.size / words.length : 0,
    hasTerminator,
    coherenceCosine,
    sentence,
    emitted: !!composed && words.length > 0,
    err: err ? err.message : null,
  });
}
const dtMs = Date.now() - t0;

// ─── Aggregate stats ─────────────────────────────────────────────────
const N = results.length;
const emittedN = results.filter(r => r.emitted).length;
const multiwordN = results.filter(r => r.wordCount >= 3).length;
const uniqueN = results.filter(r => r.uniqueCount >= 3).length;
const ratioN = results.filter(r => r.uniqueRatio >= 0.5).length;
const terminatorN = results.filter(r => r.hasTerminator).length;
const passedAllN = results.filter(r =>
  r.wordCount >= 3 && r.uniqueCount >= 3 && r.uniqueRatio >= 0.5
).length;
const errorN = results.filter(r => r.err !== null).length;
const cosines = results.map(r => r.coherenceCosine).filter(c => typeof c === 'number');
const avgCos = cosines.length > 0 ? cosines.reduce((a, b) => a + b, 0) / cosines.length : null;

const emitRate = N > 0 ? emittedN / N : 0;
const multiwordRate = N > 0 ? multiwordN / N : 0;
const uniqueRate = N > 0 ? uniqueN / N : 0;
const ratioRate = N > 0 ? ratioN / N : 0;
const terminatorRate = N > 0 ? terminatorN / N : 0;
const passedAllRate = N > 0 ? passedAllN / N : 0;

// ─── Report ──────────────────────────────────────────────────────────
console.log(`\n[verify-emission] probe complete in ${(dtMs / 1000).toFixed(2)}s — ${N} rounds`);
console.log(`  emit-success     : ${emittedN}/${N} (${(emitRate * 100).toFixed(0)}%)`);
console.log(`  multiword (≥3w)  : ${multiwordN}/${N} (${(multiwordRate * 100).toFixed(0)}%)`);
console.log(`  unique-tokens(≥3): ${uniqueN}/${N} (${(uniqueRate * 100).toFixed(0)}%)`);
console.log(`  unique-ratio(≥.5): ${ratioN}/${N} (${(ratioRate * 100).toFixed(0)}%)`);
console.log(`  terminator       : ${terminatorN}/${N} (${(terminatorRate * 100).toFixed(0)}%)`);
console.log(`  ALL gates pass   : ${passedAllN}/${N} (${(passedAllRate * 100).toFixed(0)}%) ← primary score`);
console.log(`  avg coherence    : ${avgCos !== null ? avgCos.toFixed(3) : 'n/a (no intent-concept supplied)'}`);
console.log(`  errors           : ${errorN}/${N}`);

if (OPTS.verbose || passedAllN > 0) {
  console.log('\n[verify-emission] sample emissions:');
  const sample = results.filter(r => r.sentence.length > 0).slice(0, 8);
  for (const r of sample) {
    const term = r.hasTerminator ? '·' : ' ';
    const cos = r.coherenceCosine !== null ? ` cos=${r.coherenceCosine.toFixed(2)}` : '';
    console.log(`  [${String(r.round).padStart(2, '0')}] ${r.label.padEnd(16)} → "${r.sentence.slice(0, 60)}"${term} (${r.wordCount}w/${r.uniqueCount}u/r=${r.uniqueRatio.toFixed(2)}${cos})`);
  }
  if (OPTS.verbose && results.length > sample.length) {
    console.log(`  ... ${results.length - sample.length} more rounds (run with --verbose for full list)`);
  }
}

if (errorN > 0) {
  console.log('\n[verify-emission] errors encountered:');
  for (const r of results.filter(r => r.err)) {
    console.log(`  [${String(r.round).padStart(2, '0')}] ${r.label}: ${r.err}`);
  }
}

// ─── Exit code ───────────────────────────────────────────────────────
const passed = passedAllRate >= OPTS.threshold;
console.log(`\n[verify-emission] ${passed ? '✓ PASS' : '✗ FAIL'} — primary rate ${(passedAllRate * 100).toFixed(0)}% ${passed ? '≥' : '<'} threshold ${(OPTS.threshold * 100).toFixed(0)}%`);
process.exit(passed ? 0 : 1);
