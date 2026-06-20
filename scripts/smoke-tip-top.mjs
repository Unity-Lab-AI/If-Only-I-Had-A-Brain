#!/usr/bin/env node
// Tip-top smoke test — verifies every module + method this session's
// ships added still resolves and behaves as advertised.
//
// Run: node scripts/smoke-tip-top.mjs
// Exit: 0 = all checks passed, 1 = failures printed

import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const abs = (p) => pathToFileURL(resolve(root, p)).href;
const req = createRequire(import.meta.url);
const ABS = (p) => resolve(root, p);

const results = {};

// 1. Curriculum — class + pre-K mixin attached + plasticity helpers + label maps
{
  const m = await import(abs('js/brain/curriculum.js'));
  const p = m.Curriculum.prototype;
  const preK = ['runElaPreK','runMathPreK','runSciPreK','runSocPreK','runArtPreK','runLifePreK','_teachPrekSpatial','_teachPrekVisual','_teachPrekLogic','_teachPrekSelf'];
  results.curriculum_preK_mixin = preK.every(n => typeof p[n] === 'function');
  results.curriculum_teachHebbian = typeof p._teachHebbian === 'function';
  results.curriculum_teachAntiHebbian = typeof p._teachAntiHebbian === 'function';
  results.curriculum_teachLateralInhibition = typeof p._teachLateralInhibition === 'function';
  results.curriculum_teachPredictiveError = typeof p._teachPredictiveError === 'function';
  results.curriculum_extractKeyToken = typeof p._extractKeyToken === 'function';
  results.curriculum_classifyTemplate = typeof p._classifyQuestionTemplate === 'function';
  results.curriculum_auditExamVocab = typeof p._auditExamVocabulary === 'function';
  results.curriculum_pregateEnrichment = typeof p._pregateEnrichment === 'function';
  results.curriculum_teachSentenceStructures = typeof p._teachSentenceStructures === 'function';
  results.curriculum_teachDefinitionFirst = typeof p._teachDefinitionFirst === 'function';
  results.curriculum_teachWordInContext = typeof p._teachWordInContext === 'function';
  results.curriculum_getStatus = typeof p.getCurriculumStatus === 'function';
  results.curriculum_SUBJECT_LABELS = typeof m.SUBJECT_LABELS === 'object' && m.SUBJECT_LABELS.ela;
  results.curriculum_GRADE_LABELS = typeof m.GRADE_LABELS === 'object' && m.GRADE_LABELS['pre-K'];
}

// 2. SparseMatrix — plasticity methods + topographic init
{
  const m = await import(abs('js/brain/sparse-matrix.js'));
  const p = m.SparseMatrix.prototype;
  results.sparse_ojaUpdate = typeof p.ojaUpdate === 'function';
  results.sparse_antiHebbianUpdate = typeof p.antiHebbianUpdate === 'function';
  results.sparse_bcmUpdate = typeof p.bcmUpdate === 'function';
  results.sparse_initTopographic = typeof p.initTopographic === 'function';
  // Functional test — 20-neuron ring topology, fanout 6 should produce 120 nnz
  const mat = new m.SparseMatrix(20, 20, {});
  mat.initTopographic(6, 0.8, 1.0);
  results.sparse_topographic_nnz = mat.nnz === 120;
  // Row 0 should wrap — should contain indices 1,2,3,17,18,19 (sorted)
  const row0 = Array.from(mat.colIdx.slice(mat.rowPtr[0], mat.rowPtr[1])).sort((a,b)=>a-b);
  results.sparse_topographic_wrap = JSON.stringify(row0) === '[1,2,3,17,18,19]';
}

// 3. Cluster — new plasticity methods
{
  const m = await import(abs('js/brain/cluster.js'));
  const p = m.NeuronCluster.prototype;
  results.cluster_crossRegionAntiHebbian = typeof p._crossRegionAntiHebbian === 'function';
  results.cluster_intraAntiHebbian = typeof p.intraSynapsesAntiHebbian === 'function';
  results.cluster_intraBcm = typeof p.intraSynapsesBcm === 'function';
  results.cluster_readInput = typeof p.readInput === 'function';
}

// 4. DualBrainArbiter — class + confidence scoring + decision round trip
{
  const m = await import(abs('js/brain/dual-brain-arbiter.js'));
  results.arbiter_class = typeof m.DualBrainArbiter === 'function';
  const stub = { dictionary: { knows: (w) => ['b','a','c','d'].includes(w) }, processAndRespond: async () => 'b' };
  const a = new m.DualBrainArbiter(stub);
  results.arbiter_hasRightBrain_initial = a.hasRightBrain() === false;
  const d = await a.answer('what letter comes after a?');
  results.arbiter_left_only_decision = d.answer === 'b' && d.chosenBrain === 'left-only';
  a.setTransformerBackend(async () => 'xylophone giraffe umbrella');
  results.arbiter_hasRightBrain_now = a.hasRightBrain() === true;
  const d2 = await a.answer('what letter comes after a?');
  results.arbiter_dual_scored = typeof d2.leftScore === 'number' && typeof d2.rightScore === 'number';
  results.arbiter_dual_chose = d2.chosenBrain === 'left' || d2.chosenBrain === 'right';
  results.arbiter_left_has_score = d2.leftScore > 0;
}

// 5. Transformer backend — returns disabled by default (DREAM_TRANSFORMER unset)
{
  const m = await import(abs('js/brain/transformer-backend.js'));
  results.tx_tryAttach = typeof m.tryAttachTransformerBackend === 'function';
  results.tx_workerStub = typeof m.tryAttachWorkerTransformer === 'function';
  const r = await m.tryAttachTransformerBackend({ dualBrainArbiter: { setTransformerBackend: () => {} } });
  results.tx_disabled_default = r.attached === false && r.reason === 'disabled';
}

// 6. Student question banks — data loaded + functions exported
{
  const m = await import(abs('js/brain/student-question-banks.js'));
  results.banks_examHasElaK = Array.isArray(m.EXAM_BANKS['ela/kindergarten']);
  results.banks_trainHasElaK = Array.isArray(m.TRAIN_BANKS['ela/kindergarten']);
  results.banks_examVocabCoverage = typeof m.examVocabCoverage === 'function';
  results.banks_trainExamOverlap = typeof m.trainExamOverlap === 'function';
  // Methodology field spot-check — should have ~107 entries
  const allExams = Object.values(m.EXAM_BANKS).flat();
  const withMetho = allExams.filter(q => q && q.methodology && Array.isArray(q.methodology.keywords)).length;
  results.banks_methoFieldCount = withMetho >= 100;
  // Held-out overlap — should be zero for ela/kindergarten
  const overlap = m.trainExamOverlap('ela/kindergarten');
  results.banks_elaK_heldOut = Array.isArray(overlap) && overlap.length === 0;
}

// 7. Worker pool — class + memSnapshot + idle watchdog + pool cap 8
{
  const mod = req(ABS('server/worker-pool.js'));
  results.pool_class = typeof mod.SparseMatmulPool === 'function';
  const proto = mod.SparseMatmulPool.prototype;
  results.pool_memSnapshot = typeof proto.memSnapshot === 'function';
  results.pool_startIdleWatchdog = typeof proto._startIdleWatchdog === 'function';
  // Boot a tiny pool, verify cap
  const p = new mod.SparseMatmulPool({ size: 4 });
  results.pool_cap_honors_size_opt = p.size <= 4;
  p.shutdown();
}

// 8. GPU compute — plasticity shader has the sign(lr) branch
{
  const fs = req('fs');
  const src = fs.readFileSync(ABS('js/brain/gpu-compute.js'), 'utf8');
  results.gpu_signLrBranch = src.includes('if (params.lr >= 0.0)') && src.includes('ANTI-HEBBIAN');
  results.gpu_ojaInShader = src.includes('OJA mode') || src.includes('Oja');
  // The module MUST parse cleanly as an ES module — compute.html
  // imports it directly, and a shader-embedded backtick (accidentally
  // closing the outer JS template literal) would break the browser
  // load silently with the server logging "compute client connected
  // then disconnected".
  try {
    await import(abs('js/brain/gpu-compute.js'));
    results.gpu_module_parses = true;
  } catch (err) {
    results.gpu_module_parses = false;
    results.gpu_module_parse_error = err.message;
  }
}

// 9. Dashboard — Current Training card + Brain Events card
{
  const fs = req('fs');
  const html = fs.readFileSync(ABS('dashboard.html'), 'utf8');
  results.dashboard_currentTrainingCard = html.includes('Current Training') && html.includes('d-curr-subject');
  results.dashboard_brainEventsCard = html.includes('Brain Events') && html.includes('d-brain-events');
  results.dashboard_renderCurriculum = html.includes('renderCurriculumStatus');
  results.dashboard_renderEvents = html.includes('renderBrainEvents');
}

// 10. CONSTRAINTS + CLAUDE.md wire
{
  const fs = req('fs');
  const constraints = fs.readFileSync(ABS('.claude/CONSTRAINTS.md'), 'utf8');
  const claude = fs.readFileSync(ABS('.claude/CLAUDE.md'), 'utf8');
  results.constraints_exists = constraints.length > 5000;
  results.constraints_hasLaw0 = constraints.includes('LAW #0 — VERBATIM WORDS');
  results.constraints_hasDocsBeforePush = constraints.includes('DOCS BEFORE PUSH');
  results.constraints_hasTestWordsPreTaught = constraints.includes('TEST WORDS MUST BE PRE-TAUGHT');
  results.claude_refsConstraints = claude.includes('.claude/CONSTRAINTS.md');
}

// 11. Brain-event endpoints + getState curriculum field
{
  const fs = req('fs');
  const src = fs.readFileSync(ABS('server/brain-server.js'), 'utf8');
  results.server_pushBrainEvent = src.includes('pushBrainEvent(type, region, label, detail)');
  results.server_recentBrainEvents = src.includes('_recentBrainEvents()');
  results.server_getStateCurriculum = src.includes('curriculum: this.curriculum && typeof this.curriculum.getCurriculumStatus');
  results.server_examAnswerEndpoint = src.includes("req.url === '/exam-answer'");
  results.server_examAnswerDualEndpoint = src.includes("req.url === '/exam-answer-dual'");
  results.server_antiHebbianBound = src.includes('antiHebbianBound: (name, lr)');
}

console.log(JSON.stringify(results, null, 2));
const failed = Object.entries(results).filter(([, v]) => v === false || v === undefined || v === null);
if (failed.length > 0) {
  console.error('\nFAILURES:');
  for (const [k, v] of failed) console.error('  -', k, '=', v);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED (' + Object.keys(results).length + ' assertions)');
