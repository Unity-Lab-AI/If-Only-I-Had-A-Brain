#!/usr/bin/env node
// TU.19-D — GPU↔CPU parity harness trigger.
//
// "GPU shadow DIRTY" conflates three failure modes we couldn't tell apart:
//   STALE         — the donor's resident weights ≠ the CPU master (dropped
//                   uploads / backpressure). Re-uploading FIXES this.
//   GPU-DIVERGENT — weights match but the donor's shader computes a different
//                   propagate than the CPU. A shader/precision bug — re-upload
//                   does NOT help.
//   MATH-ERROR    — the CPU master itself computes garbage (the equational
//                   matmul is broken). GPU parity is moot.
//   CLEAN         — resident weights == CPU master and propagate agrees.
//
// This script does NOT re-implement any brain math. It asks the LIVE brain
// (which alone holds the donor GPU + CPU master together) to run the verdict
// via the in-process /diag/parity endpoint, then prints the result. The real
// checksum + propagate comparison happens server-side against the actual
// resident donor weights (readback_matrix_checksum) and the actual CPU
// SparseMatrix.propagate — no jerry-rig, no shadow reimplementation.
//
// Usage:
//   node scripts/gpu-cpu-parity.mjs [matrixName] [--host http://127.0.0.1:7525] [--samples 8]
// Examples:
//   node scripts/gpu-cpu-parity.mjs                       # cortex_intraSynapses
//   node scripts/gpu-cpu-parity.mjs sem_to_word_motor_sci
//   node scripts/gpu-cpu-parity.mjs cortex_intraSynapses --host http://127.0.0.1:7525

const args = process.argv.slice(2);
let host = 'http://127.0.0.1:7525';
let samples = 8;
let name = 'cortex_intraSynapses';
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--host') { host = args[++i]; }
  else if (a === '--samples') { samples = parseInt(args[++i], 10) || 8; }
  else if (!a.startsWith('--')) { name = a; }
}

const url = `${host.replace(/\/$/, '')}/diag/parity?name=${encodeURIComponent(name)}&samples=${samples}`;

const VERDICT_LINE = {
  CLEAN:          '✅ CLEAN — resident donor weights == CPU master, propagate agrees within f32 tolerance.',
  STALE:          '🟠 STALE — donor weights ≠ CPU master (dropped uploads / backpressure). A RESYNC fixes this.',
  'GPU-DIVERGENT':'🔴 GPU-DIVERGENT — weights match but the donor SHADER computes differently. Re-upload will NOT help; it is a shader/precision bug.',
  'MATH-ERROR':   '🔴 MATH-ERROR — the CPU equational matmul itself is wrong. GPU parity is moot; fix the model math.',
  UNKNOWN:        '⚪ UNKNOWN — no donor connected / matrix not resident / readback timed out.',
};

(async () => {
  let resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    console.error(`[parity] could not reach the brain at ${host} — is it running + loopback-accessible?\n         ${e.message}`);
    process.exit(2);
  }
  let body;
  try { body = await resp.json(); }
  catch (e) { console.error(`[parity] non-JSON response (HTTP ${resp.status}): ${e.message}`); process.exit(2); }

  if (!body || body.ok === false) {
    console.error(`[parity] endpoint error: ${body && body.error ? body.error : 'unknown'}`);
    process.exit(2);
  }

  const v = body.verdict || 'UNKNOWN';
  console.log('');
  console.log(`  matrix : ${body.name}`);
  console.log(`  verdict: ${VERDICT_LINE[v] || v}`);
  if (body.detail) console.log(`  detail : ${body.detail}`);
  if (body.cpu) console.log(`  cpu    : nnz=${body.cpu.nnz} checksum=${body.cpu.checksum}`);
  if (body.gpu) console.log(`  gpu    : found=${body.gpu.found} nnz=${body.gpu.nnz} checksum=${body.gpu.checksum}`);
  if (body.propagate) console.log(`  propcmp: maxAbsErr=${body.propagate.maxAbsErr} cosine=${body.propagate.cosine}`);
  if (body.propagateError) console.log(`  properr: ${body.propagateError}`);
  console.log('');

  // Exit code encodes the verdict for CI / scripting: 0 CLEAN, 3 STALE, 4 DIVERGENT/MATH, 2 UNKNOWN.
  if (v === 'CLEAN') process.exit(0);
  if (v === 'STALE') process.exit(3);
  if (v === 'GPU-DIVERGENT' || v === 'MATH-ERROR') process.exit(4);
  process.exit(2);
})();
