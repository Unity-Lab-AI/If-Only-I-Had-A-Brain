/**
 * profile_tick.mjs — where does a tick actually spend its time?
 *
 * Optimising before measuring is how you speed up the 3% and leave the 90%
 * alone. This times the whole tick, then times the pieces, so the next
 * change is aimed at whatever is actually expensive.
 *
 * Run: node js/brain/profile_tick.mjs
 */
import { UnityBrain } from './engine.js';

const brain = new UnityBrain({});
if (typeof brain.init === 'function') await brain.init();

// Warm up: first ticks pay for JIT compilation and lazy allocation, and
// including them makes every later number look better than it is.
for (let i = 0; i < 50; i++) brain.step(0.016);

const N = 200;
const t0 = performance.now();
for (let i = 0; i < N; i++) brain.step(0.016);
const perTick = (performance.now() - t0) / N;

console.log(`tick: ${perTick.toFixed(3)} ms  ->  ${(1000 / perTick).toFixed(1)} ticks/sec`);

// Per-cluster: population step vs plasticity, the two halves that scale
// with neuron count and synapse count respectively.
let neuronMs = 0;
let learnMs = 0;
let synapses = 0;
let neurons = 0;

for (const [name, cluster] of Object.entries(brain.clusters)) {
  const m = cluster.synapses || cluster.recurrent || cluster.weights;
  const vals = m?.values || m;
  const nnz = vals?.length ?? 0;
  synapses += nnz;
  neurons += cluster.size ?? 0;

  const a = performance.now();
  for (let i = 0; i < 50; i++) cluster.learn(0.2);
  const learn = (performance.now() - a) / 50;
  learnMs += learn;

  console.log(`  ${name.padEnd(14)} ${String(cluster.size ?? '?').padStart(5)} neurons  ` +
    `${String(nnz).padStart(9)} synapses  learn ${learn.toFixed(3)} ms`);
}

console.log('');
console.log(`total: ${neurons.toLocaleString()} neurons, ${synapses.toLocaleString()} synapses`);
console.log(`plasticity: ${learnMs.toFixed(3)} ms/tick (${(learnMs / perTick * 100).toFixed(1)}% of a tick)`);
console.log(`everything else: ${(perTick - learnMs).toFixed(3)} ms/tick`);
console.log('');
console.log(`at ${(1000 / perTick).toFixed(0)} ticks/sec, 1M ticks takes ` +
  `${(1e6 * perTick / 1000 / 60).toFixed(1)} minutes`);
