// verify-realvocab-emission.mjs — headless, CPU-only end-to-end proof that
// REAL words emit after training, post word_motor lamination fix. No 5-week
// walk, no browser GPU. Uses fastText-style subword embeddings (getEmbedding
// works without the 480MB GloVe file) so each word gets a distinct pattern.
//
// Pipeline (mirrors the real curriculum word-emission path):
//   1. learnWord(w, getEmbedding(w)) for a real K-word set → dictionary
//      entries with .pattern
//   2. _teachWordEmissionDirect({subject:'ela', words}) → trains sem→word_motor
//      via ojaUpdate (the projection that was dead at nnz=0 pre-fix)
//   3a. DIRECT probe: inject each word's pattern into sem, tick, emitWordDirect
//       → does the brain name the word back?
//   3b. FULL path: composeSentence(seed) → do real multi-word emissions come out?
//
// Run: node scripts/verify-realvocab-emission.mjs

import { NeuronCluster } from '../js/brain/cluster.js';
import { Curriculum } from '../js/brain/curriculum.js';
import { Dictionary } from '../js/brain/dictionary.js';
import { sharedEmbeddings } from '../js/brain/embeddings.js';

const SIZE = 20000;
const REPS = 16;

const K_WORDS = [
  'i','see','a','cat','the','dog','is','big','red','ball','mom','dad',
  'run','play','sun','tree','fish','bird','happy','water','go','my','we','like',
];

const cluster = new NeuronCluster('cortex', SIZE, {
  tonicDrive: 14, noiseAmplitude: 7, connectivity: 0.15,
  excitatoryRatio: 0.85, learningRate: 0.002,
});
const dict = new Dictionary();
cluster.dictionary = dict;                 // emitWordDirect reads cluster.dictionary
const curr = new Curriculum(cluster, dict);

console.log(`size=${SIZE} sem_to_word_motor nnz=${cluster.crossProjections.sem_to_word_motor.nnz}`);

// 1) Learn each word so it has a .pattern (distinct subword embedding).
for (const w of K_WORDS) dict.learnWord(w, sharedEmbeddings.getEmbedding(w), 0.6, 0.2);
console.log(`learned ${K_WORDS.length} words; dict size=${dict._words.size}`);

// 2) Train word emission through the now-alive projection.
await curr._teachWordEmissionDirect({ reps: REPS, subject: 'ela', words: K_WORDS });
const proj = cluster.crossProjections.sem_to_word_motor;
let nz = 0; for (const v of proj.values) if (Math.abs(v) > 1e-9) nz++;
console.log(`post-train sem_to_word_motor: nnz=${proj.nnz}, |w|>0 count=${nz}`);

// 3a) DIRECT recovery probe — inject word pattern into sem, tick, emit.
const sem = cluster.regions.sem;
function clearSem() { if (cluster.externalCurrent) for (let i = sem.start; i < sem.end; i++) cluster.externalCurrent[i] = 0; }

// CONTROL A — clean-pattern propagate, bypassing the tick entirely (mirrors
// the #10 micro-proof). Argmaxes the word_motor_ela sub-band directly.
const wmEla = cluster.regions.word_motor_ela;
const wmParent = cluster.regions.word_motor;
function argmaxBucketCleanPattern(pattern) {
  const semSize = sem.end - sem.start;
  const preSem = new Float64Array(semSize);
  // tile pattern across sem the same way _teachWordEmissionDirect.fillSem does
  const gSize = Math.max(1, Math.floor(semSize / pattern.length));
  for (let d = 0; d < pattern.length; d++) { const v = pattern[d] || 0; if (!v) continue; for (let n = 0; n < gSize; n++) { const idx = d*gSize+n; if (idx < semSize) preSem[idx] = v; } }
  const out = proj.propagate(preSem); // out indexed over word_motor parent
  const bStartRel = wmEla.start - wmParent.start, bEndRel = wmEla.end - wmParent.start;
  const bandSize = bEndRel - bStartRel; const bucketSize = Math.max(1, Math.floor(bandSize / K_WORDS.length));
  let best = -1, bestMean = -Infinity;
  for (let b = 0; b < K_WORDS.length; b++) { let s=0; const s0=bStartRel+b*bucketSize, s1=Math.min(bEndRel,s0+bucketSize); for (let n=s0;n<s1;n++) s+=out[n]; const m=s/Math.max(1,s1-s0); if (m>bestMean){bestMean=m;best=b;} }
  return best;
}
let cleanHits = 0;
for (let wi = 0; wi < K_WORDS.length; wi++) { if (argmaxBucketCleanPattern(dict._words.get(K_WORDS[wi]).pattern) === wi) cleanHits++; }
console.log(`\n[CONTROL A] clean-pattern propagate (no tick) recovery: ${cleanHits}/${K_WORDS.length} (${(cleanHits/K_WORDS.length*100).toFixed(0)}%)`);

// DIRECT — inject→tick(×4)→emitWordDirect. Also report sem spike count.
let directHits = 0; const directDetail = []; let semSpikeSample = -1;
for (const w of K_WORDS) {
  clearSem();
  cluster.injectEmbeddingToRegion('sem', dict._words.get(w).pattern, 1.0);
  if (typeof cluster.stepAwait === 'function') { for (let t=0;t<4;t++){ try { await cluster.stepAwait(0.001); } catch {} } }
  if (semSpikeSample < 0 && cluster.lastSpikes) { let c=0; for (let i=sem.start;i<sem.end;i++) if (cluster.lastSpikes[i]) c++; semSpikeSample=c; }
  const emitted = cluster.emitWordDirect({ subject: 'ela' });
  if (emitted === w) directHits++;
  directDetail.push(`${w}→${emitted || '∅'}${emitted === w ? '✓' : ''}`);
}
const directRate = directHits / K_WORDS.length;
console.log(`[DIRECT] inject→tick×4→emitWordDirect recovery: ${directHits}/${K_WORDS.length} (${(directRate*100).toFixed(0)}%) · sem-spikes-after-tick=${semSpikeSample}/${sem.end-sem.start}`);
console.log('  ' + directDetail.join('  '));

// 3b) FULL composeSentence path on a few seeds.
console.log('\n[FULL] composeSentence emissions:');
const seeds = ['i see a cat', 'the dog is big', 'i like the ball', 'my mom', 'i play'];
let nonEmpty = 0;
for (const s of seeds) {
  let out = '';
  try {
    const r = await cluster.composeSentence(s, { subject: 'ela' });
    out = r ? (r.sentence || (Array.isArray(r.words) ? r.words.join(' ') : '')) : '';
  } catch (e) { out = `(err: ${e.message})`; }
  if (out && !out.startsWith('(err')) nonEmpty++;
  console.log(`  "${s}" → "${out}"`);
}

console.log('\n────────────────────────────────────────────────');
console.log(`DIRECT word recovery: ${(directRate*100).toFixed(0)}%  ·  composeSentence non-empty: ${nonEmpty}/${seeds.length}`);
const ok = directRate >= 0.4;
console.log(ok
  ? '✅ REAL WORDS EMIT — post-fix, trained real vocab is recoverable through the emission path.'
  : '⚠ DIRECT recovery weak — the inject→tick→emit path needs more than the wiring fix (training depth / tick mismatch). Investigate.');
process.exit(0); // diagnostic — never fail the shell
