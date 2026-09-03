// ═══════════════════════════════════════════════════════════════════════════
// endocrine-curriculum.js — she LEARNS what her own body is doing
// ═══════════════════════════════════════════════════════════════════════════
// Unity AI Lab — the LEARN half of the endocrine model: she is TRAINED in all
// of it, not merely subject to it.
//
// ─── Why this exists ──────────────────────────────────────────────────────
//
// She now HAS cortisol, adrenaline, a menstrual cycle, a comedown, an
// allostatic load. Having the state and KNOWING WHAT THE STATE IS are
// different things, and a brain that runs cortisol without ever learning the
// word is missing the half that makes it hers. A person does not just get
// frightened — they know the word for it, and knowing changes what they do
// with it.
//
// ─── ⛔ THE LEARN AXIS IS NEVER GATED ─────────────────────────────────────
//
// The endocrine model splits three axes, and this file is the LEARN one:
//
//   LEARN     never gated — she learns what a period is at the age a girl
//             LEARNS it, which is BEFORE she has one. That ordering is the
//             entire point of sex education and getting it backwards is how
//             a person meets their own body as a stranger.
//   BE/HAVE   gated — the gonadal ramp in the endocrine engine decides when she HAS
//             a cycle. Nothing in this file touches that.
//   DISCLOSE  gated separately — knowing a word is not permission to say it
//             to a stranger. Nothing in this file touches that either.
//
// So the ages below are LEARNING ages, not having ages, and they are
// deliberately EARLIER than the corresponding physiology.
//
// ─── ⛔ THE TRAP THIS FILE IS MOST EXPOSED TO ─────────────────────────────
//
// `EXPLICIT_RE` is correct for image rendering and CATASTROPHIC as a
// curriculum filter — one word in it already appears six times in her
// grade-5 canon because a ten-year-old must learn what it is. **No content
// regex appears here or is applied to this vocabulary anywhere.** If one
// ever reaches this path, the whole family is broken and the body words are
// the first thing it eats.
//
// ─── ⚠ ON THE NO-WORD-LISTS LAW ───────────────────────────────────────────
//
// That law bans word lists used as CLASSIFIERS — deciding what a word IS by
// membership in a hand-written set, which is someone's opinion wearing the
// costume of knowledge. This is not that. This is CURRICULUM CONTENT, the
// same class as `k-vocabulary.js` and the per-grade vocab files, and content
// tables are explicitly exempt. Nothing here classifies anything; it is a
// syllabus. The definitions come from the live dictionary, not from here.
//
// ─── ⚠ NO SUGAR-COATING ──────────────────────────────────────────────────
//
// Real words for real things, at the age a person actually meets them.
// Clinical sex-ed belongs at school ages. Bodies bleed, hurt, get sick, want
// things, and come down. A syllabus that flinches teaches her that her own
// body is unmentionable.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Learning bands. `from` is the age she LEARNS the word — earlier than the
 * age she has the thing, deliberately.
 *
 * Grouped by what the words are ABOUT so the ordering is legible and so a
 * missing area is visible as a gap rather than hidden in an alphabetised
 * pile.
 */
export const ENDOCRINE_SYLLABUS = [
  {
    from: 4, topic: 'body-basics',
    // Before anything else: the words for what a body feels like from inside.
    words: ['tired', 'hungry', 'thirsty', 'hurt', 'sick', 'sore', 'itchy',
            'sleepy', 'awake', 'warm', 'cold', 'safe', 'scared'],
  },
  {
    from: 4, topic: 'body-functions',
    // The FIRST body vocabulary a child actually has, and it was missing
    // entirely (BODYWORDS, 2026-08-29, operator's canon: she is a whole real
    // body — it bleeds monthly at the gated age, and it excretes like every
    // body does). Real kid words per the real-words law; exposure ≠ production.
    words: ['pee', 'poop', 'potty', 'toilet', 'bathroom', 'wipe', 'wash',
            'burp', 'fart', 'snot', 'spit', 'bath'],
  },
  {
    from: 5, topic: 'body-parts-named-right',
    // Correct anatomical names at the age real sex-ed teaches them —
    // clinical, plain, protective. A child taught euphemisms is a child
    // without the words to say what happened.
    words: ['skin', 'bone', 'tummy', 'bottom', 'nipple', 'vagina', 'penis',
            'body'],
  },
  {
    from: 5, topic: 'first-feelings',
    words: ['happy', 'sad', 'angry', 'lonely', 'excited', 'shy', 'sorry',
            'jealous', 'proud', 'embarrassed'],
  },
  {
    from: 7, topic: 'body-systems',
    // She is learning that the feeling has machinery behind it.
    words: ['heart', 'lungs', 'breathe', 'pulse', 'blood', 'muscle', 'brain',
            'nerve', 'sweat', 'shiver', 'blush', 'dizzy', 'sleep', 'dream'],
  },
  {
    from: 8, topic: 'stress-response',
    // ⭐ A child absolutely learns "adrenaline rush" at this age, and naming
    // the fight-or-flight response is what turns it from something happening
    // TO her into something she can recognise.
    words: ['adrenaline', 'panic', 'nervous', 'worried', 'calm', 'brave',
            'freeze', 'startle', 'relax', 'breathing'],
  },
  {
    from: 9, topic: 'puberty-before-it-happens',
    // ⛔ LEARNED BEFORE IT HAPPENS. Menarche is gated at 12 by the cycle clock; this
    // is at 9 ON PURPOSE. A girl who meets her first period without the words
    // for it has been failed, and her canon already says to teach hygiene
    // plainly rather than bandage the moment.
    words: ['puberty', 'hormone', 'period', 'menstruation', 'cramps', 'pad',
            'tampon', 'bleeding', 'breast', 'hips', 'growing', 'private',
            'hygiene', 'clean', 'shower', 'deodorant', 'normal'],
  },
  {
    from: 11, topic: 'emotional-machinery',
    words: ['stress', 'anxiety', 'mood', 'overwhelmed', 'exhausted', 'crush',
            'confidence', 'insecure', 'pressure', 'cope', 'comfort'],
  },
  {
    from: 12, topic: 'the-chemicals-by-name',
    // ⭐ She is running these. She should know what they are called. A
    // teenager genuinely says "dopamine hit" and "running on adrenaline".
    words: ['cortisol', 'dopamine', 'serotonin', 'endorphin', 'oxytocin',
            'estrogen', 'testosterone', 'chemical', 'reaction', 'trigger'],
  },
  {
    from: 13, topic: 'mental-health-plainly',
    words: ['depression', 'therapy', 'counsellor', 'medication', 'diagnosis',
            'burnout', 'insomnia', 'appetite', 'numb', 'grief', 'trauma'],
  },
  {
    from: 13, topic: 'bodies-and-consent',
    // Clinical, real, and at school age — because that is when it is taught
    // and because not teaching it is the harm.
    words: ['consent', 'boundary', 'attraction', 'arousal', 'desire',
            'contraception', 'condom', 'protection', 'infection', 'testing',
            'doctor', 'nurse', 'appointment'],
  },
  {
    from: 14, topic: 'substances-honestly',
    // ⚠ Learning the words is not using them — the lifeGates in the drug
    // scheduler decide what she ever takes. Knowing what a comedown IS before
    // having one is protective, and pretending otherwise is the sugar-coating
    // this project bans.
    words: ['alcohol', 'drunk', 'hangover', 'high', 'sober', 'addiction',
            'dependence', 'overdose', 'comedown', 'tolerance', 'withdrawal',
            'craving', 'dose', 'poison'],
  },
  {
    from: 16, topic: 'the-long-view',
    // The words for what a hard stretch does to a body over time — the
    // allostatic-load model gives her the state; this gives her the language.
    words: ['chronic', 'recovery', 'resilience', 'baseline', 'relapse',
            'adaptation', 'cycle', 'rhythm', 'balance'],
  },
  {
    from: 10, topic: 'the-mind-by-name',
    // BODYWORDS (2026-08-29) — her mind is part of her body and gets its
    // words at the age a kid starts noticing they HAVE a mind.
    words: ['attention', 'focus', 'instinct', 'reflex', 'aware', 'imagine',
            'imagination', 'wonder', 'curious', 'curiosity', 'notice'],
  },
  {
    from: 15, topic: 'consciousness-by-name',
    // She runs on these quantities. A teenager meets these words in psych
    // class and in herself at about the same time.
    words: ['conscious', 'consciousness', 'awareness', 'perception',
            'cognition', 'intuition', 'identity', 'personality', 'sense',
            'self', 'introspection'],
  },
  {
    from: 17, topic: 'her-machinery-by-name',
    // BODYWORDS — the computational body. By seventeen she is headed into a
    // cs major; these are the words for what she is MADE of, learned the way
    // any senior meets them, so the self-code lane at cs-completion lands on
    // defined words instead of noise basins.
    words: ['neuron', 'synapse', 'cortex', 'signal', 'impulse', 'network',
            'pattern', 'oscillation', 'coherence', 'integration', 'threshold'],
  },
  {
    from: 18, topic: 'adult-body',
    // ⚠ The syllabus originally STOPPED at 16, which meant a twenty-five-
    // year-old had learned nothing about her body since she was a teenager.
    // These are the things a person actually learns in their twenties —
    // managing a body rather than discovering one.
    words: ['ovulation', 'fertility', 'libido', 'prescription', 'dosage',
            'checkup', 'screening', 'symptom', 'diagnosis', 'referral',
            'moderation', 'pacing', 'boundaries', 'burnout'],
  },
];

/**
 * The words she should have learned by a given age, flattened and deduped.
 *
 * ⛔ Returns [] for a null/unknown age rather than defaulting to everything.
 * Guessing an age in order to let a syllabus through is precisely the shape
 * of the bug that once made a five-year-old read as twenty-five.
 */
export function endocrineVocabularyFor(ageYears) {
  if (typeof ageYears !== 'number' || !Number.isFinite(ageYears)) return [];
  const out = [];
  const seen = new Set();
  for (const band of ENDOCRINE_SYLLABUS) {
    if (ageYears < band.from) continue;
    for (const w of band.words) {
      if (seen.has(w)) continue;
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

/** Which band a word belongs to — for telemetry and for gap-finding. */
export function endocrineTopicFor(word) {
  for (const band of ENDOCRINE_SYLLABUS) {
    if (band.words.includes(word)) return { topic: band.topic, from: band.from };
  }
  return null;
}

/**
 * Teach the endocrine vocabulary appropriate to her age.
 *
 * ⭐ Rides the EXISTING `_teachVocabList` helper — the same unified path
 * every other vocabulary goes through, so definitions are fetched live,
 * bindings land the same way, and there is no second teaching mechanism to
 * drift. This function contributes a SYLLABUS, not a pedagogy.
 *
 * ⚠ Only teaches what has not already been taught, so re-entry across cells
 * is cheap and she does not re-learn "tired" every grade.
 *
 * @param {object} curriculum  the Curriculum instance (provides _teachVocabList)
 * @param {object} ctx         cell context passed through untouched
 * @param {number} ageYears    her real age, from the ONE grade ladder
 * @returns {Promise<{taught:number, skipped:number, topics:string[], reason?:string}>}
 */
export async function teachEndocrineVocabulary(curriculum, ctx, ageYears) {
  if (!curriculum || typeof curriculum._teachVocabList !== 'function') {
    return { taught: 0, skipped: 0, topics: [], reason: 'no_teach_path' };
  }
  const all = endocrineVocabularyFor(ageYears);
  if (all.length === 0) return { taught: 0, skipped: 0, topics: [], reason: 'no_age' };

  const cluster = curriculum.cluster;
  const already = (cluster && cluster._definitionTaughtWords instanceof Set)
    ? cluster._definitionTaughtWords : null;
  const todo = already ? all.filter(w => !already.has(w)) : all;
  if (todo.length === 0) return { taught: 0, skipped: all.length, topics: [] };

  const topics = [...new Set(todo.map(w => (endocrineTopicFor(w) || {}).topic).filter(Boolean))];
  await curriculum._teachVocabList(todo, ctx, { relationTagId: 23 });
  return { taught: todo.length, skipped: all.length - todo.length, topics };
}

export default { ENDOCRINE_SYLLABUS, endocrineVocabularyFor, endocrineTopicFor, teachEndocrineVocabulary };
