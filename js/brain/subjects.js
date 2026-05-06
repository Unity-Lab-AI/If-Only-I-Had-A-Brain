/**
 * subjects.js — single source of truth for curriculum subject identifiers.
 *
 * Six subject codes drive every per-subject mechanism: word_motor sub-
 * bands, sem sub-bands, projection whitelists, bucket maps, gate-probe
 * subject hints. Three independent inline tables drifted apart across
 * curriculum.js, cluster.js, and the per-method whitelists — exactly
 * the kind of decoupling that produced the iter22-D bucket-layout
 * misalignment bug. Centralized here so every consumer reads the same
 * map.
 *
 * SUBJECT_NORMALIZE accepts caller-side variants (english, mathematics,
 * social-studies, life-skills) and returns the canonical 3-letter code
 * used by region naming + bucket maps. Callers that pass already-
 * canonical codes pass through unchanged.
 */

export const SUBJECT_NORMALIZE = Object.freeze({
  ela: 'ela', english: 'ela',
  math: 'math', mathematics: 'math',
  sci: 'sci', science: 'sci',
  soc: 'soc', social: 'soc', 'social-studies': 'soc',
  art: 'art', arts: 'art',
  life: 'life', 'life-skills': 'life',
});

export const SUBJECTS = Object.freeze(['ela', 'math', 'sci', 'soc', 'art', 'life']);

// Convenience normalizer with safe fallback. Returns null for unknown
// subjects so callers can decide whether to error or skip silently.
export function normalizeSubject(subject) {
  if (!subject || typeof subject !== 'string') return null;
  return SUBJECT_NORMALIZE[subject.toLowerCase()] || null;
}

// Build the per-subject sub-band region name (matches iter21-B carve).
export function wordMotorBandName(subject) {
  const subj = normalizeSubject(subject);
  return subj ? `word_motor_${subj}` : null;
}
