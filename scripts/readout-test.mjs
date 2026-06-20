// Isolated test: does mean-centered regionReadout actually change
// the cosine vs magnitude/phoneme features, or is my theory wrong?
import { NeuronCluster } from '../js/brain/cluster.js';

// Build a cortex cluster with the same config as the CPU language
// cluster in brain-server.js
const c = new NeuronCluster('cortex', 300, {
  tonicDrive: 14,
  noiseAmplitude: 7,
  connectivity: 0.15,
  targetFanout: 300,
  excitatoryRatio: 0.85,
  learningRate: 0.002,
});

// Build a magnitude feature for digit 5 — same as _magnitudeFeatureForDigit
function magFeat(n) {
  const out = new Float64Array(16);
  for (let i = 0; i <= Math.min(n, 3); i++) out[i] = 1.0 - i * 0.15;
  out[4] = Math.log(n + 1) / Math.log(11);
  out[5] = n / 9;
  out[6] = (n * n) / 81;
  out[7] = Math.sqrt(n) / 3;
  for (let i = 8; i < 16; i++) out[i] = Math.sin(n * 0.628 * (i - 7) + 0.1);
  let norm = 0;
  for (let i = 0; i < 16; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < 16; i++) out[i] /= norm;
  return out;
}

function phonemeFeat(pos) {
  const out = new Float64Array(24);
  const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19];
  for (let i = 0; i < 24; i++) {
    const p = PRIMES[i % PRIMES.length];
    const phase = (i * 0.19) + 0.27;
    out[i] = Math.sin(pos * 0.4636 * p + phase) + Math.cos(pos * 0.7853 * p + phase * 2);
  }
  let norm = 0;
  for (let i = 0; i < 24; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < 24; i++) out[i] /= norm;
  return out;
}

function cos(a, b) {
  let dot = 0, na = 0, nb = 0;
  const L = Math.min(a.length, b.length);
  for (let i = 0; i < L; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Probe 1: read phon BEFORE any injection (baseline cortex state)
console.log('=== Baseline (no injection) ===');
for (let t = 0; t < 4; t++) c.step(0.001);
const readPhon16 = c.regionReadout('phon', 16);
const readPhon24 = c.regionReadout('phon', 24);
console.log(`phon16 mean=${(readPhon16.reduce((a,b)=>a+b,0)/16).toFixed(4)}  first-3=[${readPhon16.slice(0,3).map(v=>v.toFixed(3)).join(', ')}]`);
console.log(`phon24 mean=${(readPhon24.reduce((a,b)=>a+b,0)/24).toFixed(4)}  first-3=[${readPhon24.slice(0,3).map(v=>v.toFixed(3)).join(', ')}]`);

// Test 1: Does cosine with magnitude feature pass threshold on baseline?
console.log('\n=== Magnitude cosines (baseline phon, no training) ===');
for (let n = 0; n < 10; n++) {
  const feat = magFeat(String(n));
  const cosVal = cos(readPhon16, feat);
  console.log(`digit ${n}: cos=${cosVal.toFixed(4)}  ${cosVal > 0.15 ? 'PASS' : 'fail'}`);
}

// Test 2: Does cosine with phoneme feature pass threshold on baseline?
console.log('\n=== Phoneme cosines (baseline phon, no training) ===');
const alphabet = 'abcdefghijklmnopqrstuvwxyz';
let passes = 0;
for (let i = 0; i < 26; i++) {
  const feat = phonemeFeat(i);
  const cosVal = cos(readPhon24, feat);
  if (cosVal > 0.15) passes++;
}
console.log(`ELA: ${passes}/26 pass cosine > 0.15 on untrained baseline`);
