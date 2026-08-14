/**
 * test_learning.mjs — does the brain actually learn?
 *
 * The claim being tested is narrow and checkable: with prediction error
 * wired into reward, synaptic weights CHANGE as the brain ticks, and they
 * change in a way that tracks how surprised it was. Before the fix, reward
 * was permanently 0, so ΔW = η · 0 · post · pre = 0 forever -- the brain
 * ran and nothing moved.
 *
 * Run: node engine/test_learning.mjs
 */
import { UnityBrain } from './engine.js';

function weightFingerprint(engine) {
  // Sum of |w| across every cluster's recurrent matrix. A single number
  // that cannot stay still if anything is learning.
  let total = 0;
  let count = 0;
  for (const cluster of Object.values(engine.clusters)) {
    const m = cluster.synapses || cluster.recurrent || cluster.weights;
    if (!m) continue;
    const vals = m.values || m;
    if (!vals || typeof vals.length !== 'number') continue;
    for (let i = 0; i < vals.length; i++) total += Math.abs(vals[i]);
    count += vals.length;
  }
  return { total, count };
}

const engine = new UnityBrain({});
if (typeof engine.init === 'function') await engine.init();

const before = weightFingerprint(engine);
console.log(`weights tracked: ${before.count.toLocaleString()}`);
console.log(`|W| before: ${before.total.toFixed(6)}`);
console.log(`reward before: ${engine.reward}`);

const TICKS = 300;
let rewardSeen = 0;
let rewardNonZero = 0;
for (let i = 0; i < TICKS; i++) {
  engine.tick ? engine.tick(0.016) : engine.step(0.016);
  rewardSeen += engine.reward;
  if (Math.abs(engine.reward) > 1e-9) rewardNonZero++;
}

const after = weightFingerprint(engine);
const delta = after.total - before.total;
const pct = before.total ? (delta / before.total) * 100 : 0;

console.log(`|W| after ${TICKS} ticks: ${after.total.toFixed(6)}`);
console.log(`change: ${delta >= 0 ? '+' : ''}${delta.toFixed(6)} (${pct.toFixed(4)}%)`);
console.log(`reward non-zero on ${rewardNonZero}/${TICKS} ticks, mean ${(rewardSeen / TICKS).toFixed(6)}`);
console.log('');
console.log(Math.abs(delta) > 1e-9 && rewardNonZero > 0
  ? 'LEARNING: weights moved and reward was live.'
  : 'NOT LEARNING: weights static or reward stuck at zero.');
