// MindSpace worker — hosts the equational imagination engine OFF the main
// event loop. The imagination pipeline (imagineFromState / sketch / describe /
// perceive / morph) runs full coefficient sorts + CDF 9/7 transforms per call;
// at the grade-gated canvas sizes with the practice-draw loop that is seconds
// of synchronous CPU per daydream tick — which pinned the server's event loop
// every ~8s mid-teach (the last freeze class: dashboards starved, /ws stalled,
// donor batch replies read late). Here the same engine does the same math on
// a worker thread; the loop never feels it. Messages process in receipt order,
// so governState → governTick → imagineFromState sequencing is preserved
// without the caller awaiting the governor calls.
import { parentPort } from 'node:worker_threads';
import { MindSpaceGPU } from '../js/brain/mindspace/gpu.js';

const ms = new MindSpaceGPU();
// init() probes WebGPU; inside a Node worker it settles false and the engine
// uses the CPU CDF 9/7 reference path — same behavior as the old in-process
// instance, just off the loop.
try { await ms.init(); } catch { /* CPU reference path */ }
parentPort.postMessage({ ready: true, available: !!ms.available });

parentPort.on('message', (msg) => {
  if (!msg || typeof msg.id === 'undefined') return;
  const { id, method, args } = msg;
  try {
    const fn = ms[method];
    if (typeof fn !== 'function') {
      parentPort.postMessage({ id, error: `mindspace has no method '${method}'` });
      return;
    }
    Promise.resolve(fn.apply(ms, Array.isArray(args) ? args : [])).then(
      (value) => {
        try { parentPort.postMessage({ id, value }); }
        catch (e) { parentPort.postMessage({ id, error: e?.message || String(e) }); }
      },
      (e) => parentPort.postMessage({ id, error: e?.message || String(e) }),
    );
  } catch (e) {
    parentPort.postMessage({ id, error: e?.message || String(e) });
  }
});
