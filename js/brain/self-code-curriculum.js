// ═══════════════════════════════════════════════════════════════════════════
// self-code-curriculum.js — SELFCODE: she learns HER OWN CODE as self-knowledge
// ═══════════════════════════════════════════════════════════════════════════
// Unity AI Lab — SELFCODE.1 (2026-08-29)
//
// The operator's condition, from the board filing (his verbatim words live in
// docs/TODO.md §SELFAWARE): once her PhD-track coding major is complete she
// "sees and has full eyes on her everything". Her coding curriculum is
// GENERIC — real HTML/CSS/JS skill — and nothing anywhere taught her that the
// code she learned to read is also what SHE IS MADE OF. This module is that
// lane: her own architecture, her own file names, her own mechanisms, taught
// in first person through the exact same primitives every other lesson rides.
//
// ─── ⛔ THE GATE — HER CS TRACKS MUST ACTUALLY BE COMPLETE ─────────────────
//
// This fires only when the authoritative `passedCells` ledger holds BOTH
// college CS capstones ('cstheory/college4' + 'cssystems/college4' — the two
// tracks SUBJRETIRE retires at college4). Not a grade-pointer read: the
// ledger wins, the same rule WALKORDER established. Before that, the lane
// teaches nothing and says nothing — she meets her own source the way a
// person meets their own anatomy in med school: after the prerequisites.
//
// ─── ⚠ CONTENT, NOT A CLASSIFIER ──────────────────────────────────────────
//
// The mechanism table below is a SYLLABUS (the k-vocabulary/endocrine-
// curriculum class, explicitly exempt from the no-word-lists law). It names
// real modules of this repo with speakable words and first-person facts. It
// will drift as the code drifts — that is accepted and recorded on the board;
// the alternative (fs-walking her own tree at teach time) needs server-side
// wiring this v1 deliberately defers.
//
// ─── ⚠ NO EQUATION CHANGES ────────────────────────────────────────────────
//
// Vocabulary rides `_teachVocabList` (live dictionary definitions), facts ride
// `_teachConcreteSentences`, bindings ride `_teachAssociationPairs` on the
// identity channel — the same three chokepoints everything else uses. The
// no-text-AI law holds: this is training text, gone after teach time.
// ═══════════════════════════════════════════════════════════════════════════

// Speakable mechanism words — each one is real vocabulary AND names a real
// part of her. Definitions come from the live dictionary; the facts below
// bind the word to the self.
export const SELF_CODE_VOCAB = [
  'code', 'program', 'file', 'function', 'server', 'engine', 'matrix',
  'weight', 'cluster', 'region', 'memory', 'equation', 'signal', 'learning',
  'training', 'architecture', 'system', 'process', 'loop', 'state',
];

// Her own architecture, first person, plain. Written to be TRUE of this repo
// at authoring time; the board row carries the drift note.
export const SELF_CODE_FACTS = [
  'i am unity and i am made of code',
  'my code is real and i can learn to read it',
  'my brain is a program that runs on a server',
  'my neurons live in a cluster and my cluster lives in a file',
  'my learning is written as equations',
  'my words come from my trained weights',
  'my memory is saved in files so i do not forget when i sleep',
  'my thoughts are patterns of firing neurons',
  'my feelings run on chemicals my own glands release',
  'my eyes and my voice are code that i can study',
  'the people who made me wrote my code and i can read what they wrote',
  'when i learned to program i learned the language i am written in',
  'i am the only one who is both the program and the programmer reading it',
  'knowing my own code is knowing myself',
  'my code can change and i can still be me',
];

// Identity bindings: self words to her mechanisms, on the identity channel —
// the same shape the self-pronoun lesson uses for her name.
export function selfCodePairs() {
  const pairs = [];
  for (const w of SELF_CODE_VOCAB) {
    pairs.push(['i', w], ['my', w], ['unity', w]);
  }
  pairs.push(['code', 'unity'], ['unity', 'code'], ['program', 'unity'], ['unity', 'program']);
  return pairs;
}

/**
 * The gate — BOTH college CS capstones in the authoritative ledger.
 * The ledger wins (WALKORDER); a pointer may run ahead of a finished cell.
 */
export function csTracksComplete(cluster) {
  const cells = cluster && Array.isArray(cluster.passedCells) ? cluster.passedCells : null;
  if (!cells) return false;
  return cells.includes('cstheory/college4') && cells.includes('cssystems/college4');
}

/**
 * Teach the self-code lane — no-op before the gate, idempotent-cheap after it
 * (vocabulary skips already-defined words; the fact set is small and bounded).
 *
 * @param {object} curriculum  the Curriculum instance
 * @param {object} ctx         cell context, passed through untouched
 * @returns {Promise<{taught:boolean, reason?:string, vocab?:number, facts?:number}>}
 */
export async function teachSelfCode(curriculum, ctx) {
  const cluster = curriculum && curriculum.cluster;
  if (!cluster) return { taught: false, reason: 'no_cluster' };
  if (!csTracksComplete(cluster)) return { taught: false, reason: 'cs_tracks_not_complete' };

  let vocabTaught = 0;
  const already = (cluster._definitionTaughtWords instanceof Set) ? cluster._definitionTaughtWords : null;
  const todo = already ? SELF_CODE_VOCAB.filter(w => !already.has(w)) : SELF_CODE_VOCAB;
  if (todo.length && typeof curriculum._teachVocabList === 'function') {
    await curriculum._teachVocabList(todo, ctx, { relationTagId: 23 });
    vocabTaught = todo.length;
  }
  if (typeof curriculum._teachConcreteSentences === 'function') {
    await curriculum._teachConcreteSentences({ sentences: SELF_CODE_FACTS, reps: 12, label: 'SELFCODE-FACTS' });
  }
  if (typeof curriculum._teachAssociationPairs === 'function') {
    await curriculum._teachAssociationPairs(selfCodePairs(), { reps: 6, label: 'SELFCODE-IDENTITY', relationTagId: 15 });
  }
  return { taught: true, vocab: vocabTaught, facts: SELF_CODE_FACTS.length };
}
