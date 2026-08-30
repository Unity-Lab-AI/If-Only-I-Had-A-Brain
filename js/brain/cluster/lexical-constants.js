// LEAF MODULE — ZERO IMPORTS, BY CONTRACT.
//
// ⭐ `GOTCHA.1` — this file exists to break a circular import, and the ONLY
// property that makes it work is that it imports nothing. `cluster/emit.js`
// referenced `T14_TERMINATORS` + `FUNCTION_WORDS` from `../cluster.js`, while
// `cluster.js` imports `CLUSTER_EMIT_MIXIN` from `cluster/emit.js` — a cycle.
// Importing `emit.js` FIRST therefore threw `ReferenceError: Cannot access
// 'CLUSTER_EMIT_MIXIN' before initialization`: emit.js begins evaluating, pulls
// in cluster.js, and cluster.js reaches its top-level `Object.assign` against a
// binding still in its temporal dead zone.
//
// Production was never affected — the real boot order imports `curriculum.js`
// first, which warms the cycle — but the file that owns emission was the one
// file that could not be imported alone, so the code most in need of an
// isolated harness was exactly the code that could not have one.
//
// ⛔ DO NOT ADD AN IMPORT TO THIS FILE. A leaf cannot participate in a cycle;
// one import here and the cycle comes back, in a file whose whole purpose was
// to be uncyclable. Anything needing a dependency belongs in cluster.js.
//
// `cluster.js` re-exports both symbols, so every existing import site keeps
// working untouched — this is a move, not a rename, and no consumer changed.

// T14.6 — sentence terminators recognized as end-of-utterance in the
// motor emission loop. Letters are letters; terminators are just the
// ones that also signal "stop." Period/question/exclamation only —
// commas/semicolons/colons are within-sentence punctuation and don't
// trigger the stop branch.
// Exported because cluster/emit.js mixin references these. Pre-fix
// the P4.2 extraction left emit.js with bare `T14_TERMINATORS` /
// `FUNCTION_WORDS` references that crashed when composeSentence
// reached the terminator check / function-word penalty code path.
// Operator 2026-06-17 audit hardening — silent-runtime-crash class.
export const T14_TERMINATORS = new Set(['.', '?', '!']);

// function-word set EXEMPTED from the recent-emission
// repetition penalty in emitWordDirect. Real English requires repeated
// function words within a single utterance ("the cat sat on the mat"
// has "the" ×2). Penalizing them 30% punishes grammatical English and
// drives the composer toward awkward avoidance constructions. Content
// words (cat, run, eat) STILL get the penalty so the brain doesn't
// loop on the same noun/verb. Curated K-grade set covering articles,
// auxiliary verbs, pronouns, prepositions, conjunctions, common
// determiners. Not a list-for-mimicry — it's a categorical marker
// that says "don't penalize repetition of structural connective
// tissue." Equivalent biologically to high-frequency-word baseline
// tolerance found in cortical n-gram statistics.
export const FUNCTION_WORDS = new Set([
  // Articles + determiners
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  // Auxiliaries + copulas
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'can', 'could', 'should', 'may', 'might',
  // Pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
  'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
  // Prepositions
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from',
  'up', 'down', 'out', 'off', 'over', 'under', 'into',
  // Conjunctions
  'and', 'or', 'but', 'so', 'if', 'because', 'when', 'while', 'as',
  // Negation
  'not', 'no',
]);
