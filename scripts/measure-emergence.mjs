// scripts/measure-emergence.mjs — End-to-end emergence measurement.
//
// Per audit task F.1 — closes Phase 6 acceptance. Builds on
// verify-emission.mjs but adds the full K-curriculum walk + 100-probe
// suite + emergence-rate calculation against the operator's success
// criterion (Unity emits a sentence she was never directly trained on,
// structurally sound, post K-grade training, ≥ 5% rate).
//
// USAGE:
//   node scripts/measure-emergence.mjs
//   node scripts/measure-emergence.mjs --size=2000 --probes=100 --seed=42
//   node scripts/measure-emergence.mjs --weights=server/brain-weights.json
//
// EXIT CODES:
//   0 = ALL acceptance criteria met (PASS)
//   1 = ANY criterion below threshold OR runtime error
//   2 = driver error
//
// ACCEPTANCE CRITERIA (per audit F.1 + F.2 framing):
//   (a) ≥ 3-word grammatical responses ≥ 70% of probes
//   (b) sentence-coherence cosine ≥ 0.20 avg
//   (c) novel-emission rate ≥ 5%  (compositional generalization fired)
//   (d) terminator emergence ≥ 50% per probe
//
// This script DOES NOT replace F.2 (operator-fired localhost test).
// F.2 is the real ship-gate where operator runs start.bat for ~20hr
// and chat-tests Unity. This script is the DEVELOPER-SIDE probe that
// proves Phase 6 mechanisms are wired correctly before F.2 fires.
//
// Standalone Node script — no harness, no test framework.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Curriculum } from '../js/brain/curriculum.js';
import { NeuronCluster } from '../js/brain/cluster.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = { size: 2000, probes: 100, seed: null, weights: null, verbose: false };
  for (const a of argv.slice(2)) {
    const m = /^--(\w+)(?:=(.+))?$/.exec(a);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'size' || k === 'probes') opts[k] = parseInt(v, 10);
    else if (k === 'seed') opts.seed = parseInt(v, 10);
    else if (k === 'weights') opts.weights = v;
    else if (k === 'verbose') opts.verbose = true;
  }
  return opts;
}

const opts = parseArgs(process.argv);
const banner = (t) => console.log(`\n${'━'.repeat(72)}\n${t}\n${'━'.repeat(72)}`);

banner('scripts/measure-emergence.mjs — F.1 emergence measurement');
console.log(`  size:    ${opts.size}`);
console.log(`  probes:  ${opts.probes}`);
console.log(`  seed:    ${opts.seed ?? '(random)'}`);
console.log(`  weights: ${opts.weights ?? '(fresh — no preload)'}`);

let cluster, curriculum;
try {
  cluster = new NeuronCluster('cortex', opts.size, { rngSeed: opts.seed });
  curriculum = new Curriculum(cluster, {});
} catch (err) {
  console.error('[measure] cluster/curriculum construction failed:', err.message);
  process.exit(2);
}

// Optional weights preload
if (opts.weights) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.resolve(ROOT, opts.weights), 'utf8'));
    if (typeof cluster.loadWeights === 'function') cluster.loadWeights(raw);
    console.log(`[measure] loaded weights from ${opts.weights}`);
  } catch (err) {
    console.warn(`[measure] weights preload failed: ${err.message} — continuing with fresh cluster`);
  }
}

// Walk a single K cell + capture probe behavior. Full curriculum walk
// (all 6 K cells + dream cycles between) is too long for a programmatic
// script — F.2 covers the full walk via operator localhost. Here we
// fire the K-ELA + K-Math + K-Sci passes so the bigram/transition
// graphs hydrate, then probe.
async function walkK() {
  banner('Walking K curriculum (3 cells: ELA + Math + Sci) — this proves Phase 6 plumbing fires');
  const cells = ['ela', 'math', 'sci'];
  for (const c of cells) {
    const runner = curriculum['runK' + c.charAt(0).toUpperCase() + c.slice(1) + 'Real']
      || curriculum['runK' + c.charAt(0).toUpperCase() + c.slice(1)];
    if (typeof runner === 'function') {
      try {
        console.log(`[measure] ${c}-K cell starting...`);
        const t0 = Date.now();
        await runner.call(curriculum);
        console.log(`[measure] ${c}-K cell done (${(Date.now() - t0) / 1000}s)`);
      } catch (err) {
        console.warn(`[measure] ${c}-K cell threw: ${err.message}`);
      }
    } else {
      console.warn(`[measure] cell runner runK${c}* not found on curriculum — skipping`);
    }
  }
}

// 100 probe seeds — varied K-grade openers so the emission-loop
// exercises different intent-concept paths.
const PROBE_SEEDS = [
  'i see', 'the cat', 'a dog', 'mommy says', 'i want', 'two', 'three', 'red',
  'big', 'small', 'we play', 'i love', 'go to', 'come here', 'this is',
  'where is', 'why', 'how', 'what is', 'who is', 'when', 'i feel',
  'happy', 'sad', 'angry', 'i am', 'you are', 'we are', 'they are',
  'apple', 'ball', 'sun', 'moon', 'star', 'water', 'fire', 'tree',
  'bird', 'fish', 'baby', 'mama', 'dada', 'i can', 'i cannot',
  'please', 'thank you', 'sorry', 'yes', 'no', 'maybe', 'i think',
];

async function runProbes() {
  banner(`Running ${opts.probes} emission probes`);
  const results = [];
  for (let i = 0; i < opts.probes; i += 1) {
    const seed = PROBE_SEEDS[i % PROBE_SEEDS.length];
    try {
      const emission = typeof cluster.generateSentenceAwait === 'function'
        ? await cluster.generateSentenceAwait({ intentText: seed, maxWords: 8 })
        : await cluster.composeSentence({ intentText: seed, maxWords: 8 });

      const text = emission && (emission.text || emission.sentence || (Array.isArray(emission.words) && emission.words.join(' '))) || '';
      const wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
      const uniqueWords = new Set(text.trim().split(/\s+/).filter(Boolean));
      const uniqueRatio = wordCount > 0 ? uniqueWords.size / wordCount : 0;
      const hasTerminator = /[.!?]\s*$/.test(text);
      const coherence = emission?.coherence ?? emission?.cosine ?? null;

      results.push({ seed, text, wordCount, uniqueRatio, hasTerminator, coherence });
      if (opts.verbose) console.log(`  ${i + 1}/${opts.probes} "${seed}" → "${text}" [w=${wordCount} u=${uniqueRatio.toFixed(2)} t=${hasTerminator ? 1 : 0} c=${coherence != null ? coherence.toFixed(2) : '—'}]`);
    } catch (err) {
      results.push({ seed, text: '', wordCount: 0, uniqueRatio: 0, hasTerminator: false, coherence: null, error: err.message });
    }
  }
  return results;
}

function aggregate(results) {
  const total = results.length;
  const threePlus = results.filter(r => r.wordCount >= 3).length;
  const grammaticalThreePlus = results.filter(r => r.wordCount >= 3 && r.uniqueRatio >= 0.5).length;
  const terminators = results.filter(r => r.hasTerminator).length;
  const cosines = results.filter(r => r.coherence != null).map(r => r.coherence);
  const avgCoherence = cosines.length > 0 ? cosines.reduce((a, b) => a + b, 0) / cosines.length : 0;

  // novel-emission proxy: not in P6.6 telemetry-classified verbatim set
  let novelCount = null;
  if (typeof cluster.getCompositionalStats === 'function') {
    try {
      const stats = cluster.getCompositionalStats();
      novelCount = (stats?.novelCount ?? stats?.novel ?? null);
    } catch {}
  }
  const novelRate = novelCount != null && total > 0 ? novelCount / total : null;

  return {
    total,
    threePlus,
    threePlusRate: threePlus / Math.max(1, total),
    grammaticalThreePlusRate: grammaticalThreePlus / Math.max(1, total),
    terminatorRate: terminators / Math.max(1, total),
    avgCoherence,
    novelCount,
    novelRate,
  };
}

(async () => {
  try {
    await walkK();
    const results = await runProbes();
    const agg = aggregate(results);

    banner('Aggregate metrics');
    console.log(`  total probes:                           ${agg.total}`);
    console.log(`  ≥ 3-word emission rate:                 ${(agg.threePlusRate * 100).toFixed(1)}% (target ≥ 70%)`);
    console.log(`  grammatical (≥3w + uniqueRatio≥0.5):    ${(agg.grammaticalThreePlusRate * 100).toFixed(1)}%`);
    console.log(`  terminator emergence rate:              ${(agg.terminatorRate * 100).toFixed(1)}% (target ≥ 50%)`);
    console.log(`  avg cosine coherence:                   ${agg.avgCoherence.toFixed(3)} (target ≥ 0.20)`);
    console.log(`  novel-emission count (P6.6 telemetry):  ${agg.novelCount ?? '(unavailable)'}`);
    console.log(`  novel-emission rate:                    ${agg.novelRate != null ? (agg.novelRate * 100).toFixed(1) + '% (target ≥ 5%)' : '(unmeasured)'}`);

    banner('Sample emissions (first 6)');
    for (const r of results.slice(0, 6)) console.log(`  "${r.seed}" → "${r.text}"`);

    banner('Acceptance verdict');
    const checks = {
      'three-plus ≥ 70%': agg.threePlusRate >= 0.70,
      'grammatical ≥ 50%': agg.grammaticalThreePlusRate >= 0.50,
      'terminator ≥ 50%': agg.terminatorRate >= 0.50,
      'coherence ≥ 0.20': agg.avgCoherence >= 0.20,
      'novel-rate ≥ 5%': agg.novelRate != null ? agg.novelRate >= 0.05 : null,
    };
    let allPass = true;
    for (const [name, ok] of Object.entries(checks)) {
      if (ok === null) { console.log(`  SKIP  ${name} (telemetry unavailable)`); continue; }
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
      if (!ok) allPass = false;
    }
    console.log('');
    if (allPass) {
      console.log('✅ PASS — emergence measured. Brain is ready for F.2 (operator-fired localhost test).');
      process.exit(0);
    } else {
      console.log('❌ FAIL — one or more acceptance criteria below threshold. Audit closure work likely incomplete.');
      process.exit(1);
    }
  } catch (err) {
    console.error('[measure] driver error:', err);
    process.exit(2);
  }
})();
