// Boot-time corpus audits, OFF the main loop.
//
// The curriculum coverage and the whole-curriculum exam-vocabulary sweep both
// walk every corpus on disk — measured on a freshstart, 72.7 million words and
// 499,055 distinct ones. Run synchronously at boot they froze the main loop for
// 52 s while a GPU donor that had just connected waited on it. Same module,
// same functions, same results; they simply run on their own thread now, and
// the server reads the answer when it arrives.

import { parentPort, workerData } from 'worker_threads';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const cov = require('./curriculum-coverage.js');

(async () => {
  const out = { coverage: null, coverageErr: null, exam: null };
  try {
    const cur = await import(pathToFileURL(workerData.curriculumPath).href);
    out.coverage = cov.computeCoverage(cur, workerData.academicDir);
  } catch (e) {
    out.coverageErr = (e && e.message) || String(e);
  }
  try {
    out.exam = await cov.examVocabSweep(workerData.root);
  } catch (e) {
    out.exam = { available: false, reason: (e && e.message) || String(e) };
  }
  parentPort.postMessage(out);
})();
