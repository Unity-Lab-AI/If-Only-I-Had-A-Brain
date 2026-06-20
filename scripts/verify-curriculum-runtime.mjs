// T14.24 Session 94 — runtime verification of the full 5×19 curriculum
// dispatch + helper resolution. Not a test file (no assertions, no test
// framework) — a diagnostic that runs every cell runner once against a
// real NeuronCluster and reports which cells dispatch, run, and pass
// their gate. Safe to delete once T14.24 gates are all green.
import { Curriculum } from '../js/brain/curriculum.js';
import { NeuronCluster } from '../js/brain/cluster.js';

// Construct cluster exactly the way engine.js does for the cortex
// cluster — name='cortex' enables the letter/phon/sem/motor regions
// that the T14.24 teach helpers inject into.
const cluster = new NeuronCluster('cortex', 300, {
  tonicDrive: 14, noiseAmplitude: 7,
  connectivity: 0.15, excitatoryRatio: 0.85, learningRate: 0.002,
});
const dict = {
  size: 0, bigramCount: 0,
  learnWord: () => {}, learnSentence: () => {},
};
const curr = new Curriculum(cluster, dict);

const SUBJECTS = ['ela','math','science','social','art'];
const GRADES = [
  'kindergarten','grade1','grade2','grade3','grade4','grade5','grade6',
  'grade7','grade8','grade9','grade10','grade11','grade12',
  'college1','college2','college3','college4','grad','phd',
];

let dispatchOK = 0, dispatchFail = 0;
const dispatchErrors = [];
for (const s of SUBJECTS) {
  for (const g of GRADES) {
    try {
      const runner = curr._cellRunner(s, g);
      if (typeof runner !== 'function') { dispatchFail++; dispatchErrors.push(`${s}/${g}`); continue; }
      dispatchOK++;
    } catch (err) {
      dispatchFail++;
      dispatchErrors.push(`${s}/${g}: ${err.message}`);
    }
  }
}
console.log(`DISPATCH: ${dispatchOK}/${dispatchOK+dispatchFail}`);
if (dispatchFail) { for (const e of dispatchErrors) console.log(' ', e); }

// Full 95-cell sweep — runs every cell runner exactly once and reports
// which execute without throwing. Doesn't evaluate gates, just confirms
// the runner code paths are all reachable with a real cluster.
const PROBE = [];
for (const s of SUBJECTS) for (const g of GRADES) PROBE.push([s, g]);
console.log('\nFULL 95-CELL SWEEP:');
let probeOK = 0, probeFail = 0;
const failures = [];
for (const [s,g] of PROBE) {
  try {
    const runner = curr._cellRunner(s, g);
    const p = runner({ corpus: { persona: '', baseline: '', coding: '' } });
    await p.then(
      r => { probeOK++; },
      err => { probeFail++; failures.push(`${s}/${g}: ASYNC ${err.message}`); }
    );
  } catch (err) {
    probeFail++;
    failures.push(`${s}/${g}: SYNC ${err.message}`);
  }
}
console.log(`FULL SWEEP: ${probeOK}/${probeOK+probeFail}`);
if (failures.length) for (const f of failures.slice(0, 40)) console.log(' ', f);
process.exit(probeFail || dispatchFail ? 1 : 0);
