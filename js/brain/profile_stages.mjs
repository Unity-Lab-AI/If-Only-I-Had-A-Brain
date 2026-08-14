/**
 * profile_stages.mjs — which of the 16 tick stages costs the time?
 *
 * The whole-tick profile said plasticity is only 27%, so the expensive
 * work is somewhere in the other fifteen stages. Rather than reading and
 * guessing, this monkey-patches the methods each stage calls and counts
 * the milliseconds that land in each one.
 *
 * Run: node js/brain/profile_stages.mjs
 */
import { UnityBrain } from './engine.js';

const brain = new UnityBrain({});
if (typeof brain.init === 'function') await brain.init();

const times = {};
function wrap(obj, name, label) {
  if (!obj || typeof obj[name] !== 'function') return;
  const orig = obj[name].bind(obj);
  times[label] = 0;
  obj[name] = (...args) => {
    const t = performance.now();
    const r = orig(...args);
    times[label] += performance.now() - t;
    return r;
  };
}

// The per-cluster work: neuron integration vs synaptic learning.
for (const [cname, c] of Object.entries(brain.clusters)) {
  wrap(c, 'step', `cluster.step:${cname}`);
  wrap(c, 'learn', `cluster.learn:${cname}`);
}

// The subsystems a tick calls into.
wrap(brain.oscillators, 'step', 'oscillators');
wrap(brain.memorySystem, 'storeEpisode', 'memory.store');
wrap(brain.memorySystem, 'recall', 'memory.recall');
wrap(brain.sensory, 'process', 'sensory');
wrap(brain.motor, 'step', 'motor');
wrap(brain, '_getClusterStates', 'getClusterStates');
wrap(brain, '_applyProjections', 'projections');

const N = 200;
for (let i = 0; i < 50; i++) brain.step(0.016);   // warm up
for (const k of Object.keys(times)) times[k] = 0;

const t0 = performance.now();
for (let i = 0; i < N; i++) brain.step(0.016);
const total = performance.now() - t0;

const rows = Object.entries(times)
  .map(([k, v]) => [k, v / N])
  .filter(([, v]) => v > 0.001)
  .sort((a, b) => b[1] - a[1]);

console.log(`tick total: ${(total / N).toFixed(3)} ms\n`);
let accounted = 0;
for (const [k, v] of rows) {
  accounted += v;
  console.log(`  ${k.padEnd(28)} ${v.toFixed(3)} ms  ${(v / (total / N) * 100).toFixed(1)}%`);
}
console.log('');
console.log(`accounted:   ${accounted.toFixed(3)} ms`);
console.log(`unaccounted: ${((total / N) - accounted).toFixed(3)} ms  (inline work in step())`);
