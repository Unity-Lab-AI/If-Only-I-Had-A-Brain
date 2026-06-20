// ═══════════════════════════════════════════════════════════════════════
// Transformer vs Rulkov-brain ablation — scaffold (not yet runnable).
//
// WHY THIS EXISTS
// An external reviewer asked the falsifiability question that has the
// highest value-to-effort ratio this project can ask:
//
//   "if you swapped the LIF cortex for a 100M-param transformer, would
//    the gate probes pass harder or softer? If harder, the Rulkov path
//    isn't doing the work — the GloVe embeddings are."
//
// This harness runs Unity's curriculum gates + a same-compute
// transformer on the identical held-out EXAM_BANKS, compares per-
// sub-standard pass rates, and produces a single answer: is the
// neural simulation load-bearing on K-level cognition, or is it
// decorative relative to what GloVe + any sequence model delivers?
//
// WHAT IS + ISN'T SHIPPED AT THIS COMMIT
// ✓ Exam bank loader — pulls EXAM_BANKS at parity with Unity gates.
// ✓ Scoring logic — matches _studentTestProbe exact/startsWith/contains
//   variant-match accept rules.
// ✓ Report generator — per-sub-standard + aggregate + per-source
//   (DIBELS/AIMSweb/Fountas-Pinnell reference items broken out).
// ✗ Unity brain runner — not yet wired; placeholder delegates to a
//   CLI probe of the running brain-server.js via HTTP.
// ✗ Transformer backend — not yet wired. The structure accepts a
//   generic `generate(prompt)` callable, so any backend works:
//     - openai-compatible HTTP (GPT-2, TinyLlama via llama.cpp server)
//     - @xenova/transformers in Node (browser-compatible)
//     - local HuggingFace transformers via a subprocess bridge
//
// USAGE (when backends are wired):
//   node scripts/transformer-ablation.mjs --model gpt2 --scale 10M
//   node scripts/transformer-ablation.mjs --model tinyllama --scale 1B
//   node scripts/transformer-ablation.mjs --compare-unity  # both
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ─── Exam bank loading ──────────────────────────────────────────────

async function loadExamBanks() {
  // Dynamic import so this script works whether run via `node` directly
  // or wrapped into a broader test harness. The student-question-banks
  // module is pure ESM with no side effects.
  // Convert absolute OS path → file:// URL so Windows import() works.
  const modUrl = pathToFileURL(resolve(REPO_ROOT, 'js/brain/student-question-banks.js')).href;
  const mod = await import(modUrl);
  return mod.EXAM_BANKS;
}

// ─── Scoring — matches _studentTestProbe logic ──────────────────────

function scoreAnswer(answer, expectedAnswer, expectedVariants) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  const a = norm(answer);
  const exp = norm(expectedAnswer);
  const variants = (expectedVariants || [expectedAnswer]).map(norm);

  const exact = variants.includes(a);
  const startsWith = variants.some(v => v && a.startsWith(v));
  const contains = variants.some(v => v && a.includes(v));
  const overall = exact || startsWith || contains;

  // Match _studentTestProbe weight structure at a first-order
  // approximation: exact match 1.0, startsWith 0.8, contains 0.6.
  const matchScore = exact ? 1.0 : startsWith ? 0.8 : contains ? 0.6 : 0.0;
  return { answer: a, expected: exp, match: { exact, startsWith, contains, overall }, score: matchScore };
}

// T25 — methodology scoring: fraction of reasoning-keyword hits in
// the second-pass answer. Mirrors _studentTestProbe's methodology
// scoring in js/brain/curriculum.js: matches.length >= minKeywords
// is the pass floor, actual score is matches.length / keywords.length.
function scoreMethodology(methodologyAnswer, methodologySpec) {
  const result = { answer: String(methodologyAnswer || ''), keywords: [], matches: [], score: 0, pass: false };
  if (!methodologySpec || !Array.isArray(methodologySpec.keywords) || methodologySpec.keywords.length === 0) {
    return result;
  }
  const keywords = methodologySpec.keywords.map(k => String(k || '').toLowerCase().trim()).filter(k => k.length > 0);
  const minKeywords = typeof methodologySpec.minKeywords === 'number' ? methodologySpec.minKeywords : 1;
  const text = result.answer.toLowerCase();
  const matches = keywords.filter(k => text.includes(k));
  result.keywords = keywords;
  result.matches = matches;
  result.pass = matches.length >= minKeywords;
  result.score = keywords.length > 0 ? matches.length / keywords.length : 0;
  if (!result.pass) result.score = 0;
  return result;
}

// ─── Model backends (placeholders — wire as needed) ─────────────────

// ─── Unity backend — POST /exam-answer on running brain-server ──────

const UNITY_BASE_URL = process.env.UNITY_BASE_URL || 'http://localhost:7525';
let _unityReachable = null;

async function unityHealthCheck() {
  if (_unityReachable !== null) return _unityReachable;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const resp = await fetch(`${UNITY_BASE_URL}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    _unityReachable = resp.ok;
  } catch {
    _unityReachable = false;
  }
  if (!_unityReachable) {
    console.log(`[ablation] Unity brain-server unreachable at ${UNITY_BASE_URL} — Unity arm will return empty answers. Start with \`start.bat\` then re-run.`);
  } else {
    console.log(`[ablation] Unity brain-server reachable at ${UNITY_BASE_URL} — Unity arm will POST /exam-answer.`);
  }
  return _unityReachable;
}

async function runUnity(question) {
  // Delegates to the running brain-server.js via POST /exam-answer.
  // If the server isn't running, returns an empty answer fast (no
  // fetch) so the harness completes in seconds instead of minutes.
  if (!(await unityHealthCheck())) return '';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    const resp = await fetch(`${UNITY_BASE_URL}/exam-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return '';
    const json = await resp.json();
    return String(json.answer || '').trim();
  } catch {
    return '';
  }
}

// ─── Transformer backend — openai-compatible HTTP /v1/chat/completions ─
//
// Accepts any backend that speaks the OpenAI chat/completions wire
// format. Tested targets:
//   - llama.cpp server (--host 0.0.0.0 --port 8080)
//   - LM Studio (Local Server mode)
//   - Ollama (ollama serve + /v1/chat/completions endpoint)
//   - vLLM
//   - Any OpenAI-compatible gateway
//
// Env vars:
//   OPENAI_BASE_URL  default http://localhost:8080/v1
//   OPENAI_API_KEY   default "not-required" (local servers ignore it)
//   OPENAI_MODEL     default "gpt2" — model id the backend exposes

const TRANSFORMER_BASE_URL = process.env.OPENAI_BASE_URL || 'http://localhost:8080/v1';
const TRANSFORMER_API_KEY = process.env.OPENAI_API_KEY || 'not-required';
let _transformerReachable = null;

async function transformerHealthCheck() {
  if (_transformerReachable !== null) return _transformerReachable;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const resp = await fetch(`${TRANSFORMER_BASE_URL}/models`, {
      headers: { 'Authorization': `Bearer ${TRANSFORMER_API_KEY}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    _transformerReachable = resp.ok;
  } catch {
    _transformerReachable = false;
  }
  if (!_transformerReachable) {
    console.log(`[ablation] Transformer backend unreachable at ${TRANSFORMER_BASE_URL} — Transformer arm will return empty answers. Start any openai-compatible server (llama.cpp / LM Studio / Ollama / vLLM) on that port.`);
  } else {
    console.log(`[ablation] Transformer backend reachable at ${TRANSFORMER_BASE_URL}.`);
  }
  return _transformerReachable;
}

async function runTransformer(question, modelName /* unused */, scale /* unused */) {
  // Posts to an openai-compatible /chat/completions endpoint.
  // The question is framed as a simple kindergarten-exam prompt so
  // the transformer is measured on the same task Unity is: give a
  // short, direct answer. System prompt calibrates the reply format
  // so scoring doesn't reject "The answer is b." when Unity said "b".
  if (!(await transformerHealthCheck())) return '';
  const model = process.env.OPENAI_MODEL || 'gpt2';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    const resp = await fetch(`${TRANSFORMER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TRANSFORMER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a kindergarten student. Answer the question with a SHORT direct answer — usually one word. Do not explain. Do not add punctuation.' },
          { role: 'user', content: question },
        ],
        temperature: 0.0,
        max_tokens: 20,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return '';
    const json = await resp.json();
    const text = json?.choices?.[0]?.message?.content || '';
    // Strip common wrappers ("The answer is X", "It's X.", trailing period)
    return String(text || '')
      .trim()
      .replace(/^(the answer is|it is|it's|that is|that's)\s+/i, '')
      .replace(/[.!?]+$/g, '')
      .trim();
  } catch {
    return '';
  }
}

// ─── Run one arm (Unity OR transformer) across the full bank ────────

async function runArm(armName, generator, examBanks) {
  const perStandard = new Map();
  const perSource = new Map();
  const perCell = new Map();
  let totalPass = 0;
  let totalCount = 0;
  // T25 — methodology aggregates alongside answer aggregates. If the
  // transformer passes the answer but fails the methodology, that's
  // the reviewer's "GloVe is doing the work" signal in concrete form.
  let methoPass = 0;
  let methoCount = 0;

  for (const [cellKey, bank] of Object.entries(examBanks)) {
    let cellPass = 0;
    let cellMethoPass = 0;
    let cellMethoCount = 0;
    for (const q of bank) {
      const answer = await generator(q.question);
      const r = scoreAnswer(answer, q.expectedAnswer, q.expectedVariants);
      const pass = r.match.overall ? 1 : 0;
      totalPass += pass;
      totalCount += 1;
      cellPass += pass;
      const std = q.standard || 'unspecified';
      const src = q.source || 'authored';
      {
        const b = perStandard.get(std) || { pass: 0, total: 0, methoPass: 0, methoCount: 0 };
        b.pass += pass; b.total += 1;
        perStandard.set(std, b);
      }
      {
        const b = perSource.get(src) || { pass: 0, total: 0 };
        b.pass += pass; b.total += 1;
        perSource.set(src, b);
      }
      // T25 — methodology probe. If the question has a methodology
      // field, run the reasoning prompt through the same backend
      // and score by keyword match. Pass/count tracked separately.
      if (q.methodology && Array.isArray(q.methodology.keywords) && q.methodology.keywords.length > 0) {
        const methoAnswer = await generator(q.methodology.prompt);
        const mr = scoreMethodology(methoAnswer, q.methodology);
        methoCount += 1;
        cellMethoCount += 1;
        if (mr.pass) {
          methoPass += 1;
          cellMethoPass += 1;
          const b = perStandard.get(std);
          if (b) b.methoPass = (b.methoPass || 0) + 1;
        }
        const b = perStandard.get(std);
        if (b) b.methoCount = (b.methoCount || 0) + 1;
      }
    }
    perCell.set(cellKey, {
      pass: cellPass,
      total: bank.length,
      rate: bank.length > 0 ? cellPass / bank.length : 0,
      methoPass: cellMethoPass,
      methoCount: cellMethoCount,
      methoRate: cellMethoCount > 0 ? cellMethoPass / cellMethoCount : 0,
    });
  }

  return {
    armName,
    aggregate: { pass: totalPass, total: totalCount, rate: totalCount > 0 ? totalPass / totalCount : 0 },
    methoAggregate: { pass: methoPass, total: methoCount, rate: methoCount > 0 ? methoPass / methoCount : 0 },
    perCell: [...perCell.entries()].map(([k, v]) => ({ cellKey: k, ...v })),
    perStandard: [...perStandard.entries()].map(([k, v]) => ({
      standard: k,
      pass: v.pass,
      total: v.total,
      rate: v.total > 0 ? v.pass / v.total : 0,
      methoPass: v.methoPass || 0,
      methoCount: v.methoCount || 0,
      methoRate: (v.methoCount || 0) > 0 ? (v.methoPass || 0) / v.methoCount : 0,
    })),
    perSource: [...perSource.entries()].map(([k, v]) => ({ source: k, pass: v.pass, total: v.total, rate: v.total > 0 ? v.pass / v.total : 0 })),
  };
}

// ─── Main — run both arms, print comparison ─────────────────────────

function printReport(unity, transformer) {
  const pad = (s, n) => String(s).padEnd(n);
  const pct = (r) => `${(r * 100).toFixed(1)}%`;

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('TRANSFORMER-vs-RULKOV ABLATION REPORT');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('AGGREGATE — ANSWER (fill-in-the-blank fidelity)');
  console.log(`  Unity        ${unity.aggregate.pass}/${unity.aggregate.total} = ${pct(unity.aggregate.rate)}`);
  console.log(`  Transformer  ${transformer.aggregate.pass}/${transformer.aggregate.total} = ${pct(transformer.aggregate.rate)}`);
  const delta = unity.aggregate.rate - transformer.aggregate.rate;
  console.log(`  Δ (unity - transformer): ${(delta * 100).toFixed(1)} pp ${delta > 0 ? '(Unity wins)' : delta < 0 ? '(Transformer wins)' : '(tie)'}`);
  console.log('');
  // T25 — methodology comparison. This is the critical reviewer
  // question: a transformer can retrieve answers via GloVe pattern
  // match without actually REASONING. If Unity's neural sim gives
  // her methodology scores comparable to or better than the
  // transformer, that's the signal the Rulkov layer is load-bearing
  // for reasoning even if not for fill-in-the-blank answers.
  console.log('AGGREGATE — METHODOLOGY (reasoning-keyword fidelity) [T25]');
  console.log(`  Unity        ${unity.methoAggregate.pass}/${unity.methoAggregate.total} = ${pct(unity.methoAggregate.rate)}`);
  console.log(`  Transformer  ${transformer.methoAggregate.pass}/${transformer.methoAggregate.total} = ${pct(transformer.methoAggregate.rate)}`);
  const methoDelta = unity.methoAggregate.rate - transformer.methoAggregate.rate;
  console.log(`  Δ (unity - transformer): ${(methoDelta * 100).toFixed(1)} pp ${methoDelta > 0 ? '(Unity reasons better)' : methoDelta < 0 ? '(Transformer reasons better)' : '(tie)'}`);
  console.log('');
  console.log('PER CELL');
  for (const u of unity.perCell) {
    const t = transformer.perCell.find(t => t.cellKey === u.cellKey) || { rate: 0 };
    console.log(`  ${pad(u.cellKey, 24)} Unity ${pct(u.rate)}  Transformer ${pct(t.rate)}  Δ ${((u.rate - t.rate) * 100).toFixed(1)} pp`);
  }
  console.log('');
  console.log('PER SOURCE (external reference items broken out)');
  for (const u of unity.perSource) {
    const t = transformer.perSource.find(t => t.source === u.source) || { rate: 0 };
    console.log(`  ${pad(u.source, 24)} Unity ${pct(u.rate)}  Transformer ${pct(t.rate)}  n=${u.total}`);
  }
  console.log('');
  console.log('INTERPRETATION');
  if (Math.abs(delta) < 0.02) {
    console.log('  ANSWER: within 2 pp — architectures computationally equivalent on fill-in-the-blank.');
  } else if (delta < -0.05) {
    console.log('  ANSWER: Transformer beats Unity by > 5 pp. Neural sim decorative for answer retrieval.');
    console.log('  GloVe embeddings + sequence model produce the answer; Rulkov adds nothing on this axis.');
  } else if (delta > 0.05) {
    console.log('  ANSWER: Unity beats transformer by > 5 pp. Research-worthy — neural sim provides answer-path inductive bias.');
  } else {
    console.log('  ANSWER: marginal difference. Not decisive.');
  }
  // T25 — reasoning-specific interpretation. Answer-match is
  // retrieval; methodology-match is explanation. The reviewer's
  // critique was specifically about whether the neural sim does
  // anything the transformer can't — if the transformer answers
  // right but can't explain, AND Unity answers right AND can
  // explain, the neural sim has contributed a reasoning-path
  // capability that GloVe alone doesn't produce.
  if (unity.methoAggregate.total > 0 || transformer.methoAggregate.total > 0) {
    if (Math.abs(methoDelta) < 0.02) {
      console.log('  METHODOLOGY: within 2 pp — both architectures reason about as well / poorly as each other.');
    } else if (methoDelta < -0.05) {
      console.log('  METHODOLOGY: Transformer reasons better by > 5 pp. Large language training has exposed the transformer to more explanation patterns.');
      console.log('  Unity needs more exposure to reasoning-explanation content during curriculum teach to catch up.');
    } else if (methoDelta > 0.05) {
      console.log('  METHODOLOGY: Unity reasons better by > 5 pp. This IS the reviewer-critique answer — the neural sim provides reasoning-path capability the transformer cannot replicate from GloVe alone.');
      console.log('  Load-bearing finding. Write this up.');
    } else {
      console.log('  METHODOLOGY: marginal difference. Not decisive.');
    }
  }
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const modelName = args.find(a => a.startsWith('--model='))?.split('=')[1] || 'gpt2';
  const scale = args.find(a => a.startsWith('--scale='))?.split('=')[1] || '10M';

  console.log(`[ablation] loading exam banks...`);
  const examBanks = await loadExamBanks();
  const totalQuestions = Object.values(examBanks).reduce((a, b) => a + b.length, 0);
  console.log(`[ablation] loaded ${Object.keys(examBanks).length} cells · ${totalQuestions} questions total`);
  console.log(`[ablation] transformer backend: ${modelName} @ ${scale}`);
  console.log('');
  console.log('⚠ STUB MODE — neither backend wired yet. This run produces baseline-zero scores.');
  console.log('  To make this real: wire runUnity() to the brain-server HTTP endpoint + runTransformer() to a llama.cpp or transformers-js backend.');
  console.log('');

  const unity = await runArm('Unity', runUnity, examBanks);
  const transformer = await runArm('Transformer', (q) => runTransformer(q, modelName, scale), examBanks);

  printReport(unity, transformer);
}

main().catch(err => {
  console.error('[ablation] fatal:', err);
  process.exit(1);
});
