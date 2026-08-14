/**
 * test_improves.mjs — does prediction error actually FALL?
 *
 * "Weights changed" is a weaker claim than "it learned". A brain whose
 * weights drift is not learning; a brain whose PREDICTIONS get better is.
 * So this drives a fixed repeating input and watches mean |cortex error|
 * across the run. If learning works, later windows predict the same input
 * better than earlier ones.
 *
 * Run: node js/brain/test_improves.mjs
 */
import { UnityBrain } from './engine.js';

const brain = new UnityBrain({});
if (typeof brain.init === 'function') await brain.init();

const WINDOW = 200;
const WINDOWS = 12;
const means = [];

// A fixed pattern, injected every tick. Nothing about it changes, so any
// improvement in prediction is the brain, not the input getting easier.
const pattern = new Float64Array(32);
for (let i = 0; i < pattern.length; i++) {
  pattern[i] = Math.sin(i * 0.7) * 0.5 + 0.5;
}

for (let w = 0; w < WINDOWS; w++) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < WINDOW; i++) {
    if (brain.clusters?.cortex?.injectCurrent) {
      brain.clusters.cortex.injectCurrent(pattern);
    }
    brain.tick ? brain.tick(0.016) : brain.step(0.016);
    const err = brain.state?.cortex?.error;
    if (err && err.length) {
      let m = 0;
      for (let k = 0; k < err.length; k++) m += Math.abs(err[k]);
      sum += m / err.length;
      n++;
    }
  }
  means.push(n ? sum / n : NaN);
  process.stdout.write(`window ${String(w + 1).padStart(2)}  mean |err| ${means[w].toFixed(6)}\n`);
}

const first = means.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
const last = means.slice(-3).reduce((a, b) => a + b, 0) / 3;
const drop = ((first - last) / first) * 100;

console.log('');
console.log(`first 3 windows: ${first.toFixed(6)}`);
console.log(`last 3 windows:  ${last.toFixed(6)}`);
console.log(`change: ${drop >= 0 ? '-' : '+'}${Math.abs(drop).toFixed(2)}% error`);
console.log('');
console.log(drop > 1
  ? 'IMPROVING: predictions got better on a fixed input.'
  : drop < -1
    ? 'DEGRADING: predictions got worse — gain likely too high.'
    : 'FLAT: no measurable improvement.');
