// clean-math.mjs — the fetchers' door onto the shared markup cleaner.
//
// ⛔⛔ THE BODY MOVED TO `js/brain/text-cleaning.cjs` ON 2026-09-02, AND THE
// REASON IS THE MEASUREMENT THAT KILLED THIS FILE'S ORIGINAL CLAIM. Its header
// said *"ONE MODULE, FOUR CALLERS — fix the chokepoint"*. It was one module. It
// was not the chokepoint.
//
//     fetchers that write corpora/           13
//     fetchers that imported this module      4
//
// The nine that never called it include `openstax` — **one of the three worst
// offenders by measured sentence count (3,950)** — plus `openmathbooks`, which
// is a MATHS source. A rule applied by four of thirteen producers is not a
// chokepoint; it is a convention, and the corpus measured 26,119 contaminated
// sentences to prove it.
//
// ⭐ The real chokepoint is the READER. Thirteen writers converge on ONE
// consumer, `server/life-curriculum.js`, which is now where the rule is applied
// — so a source that has never heard of this file is covered anyway, and so is
// the fourteenth fetcher nobody has written yet.
//
// This module stays because those four fetchers legitimately clean at write
// time too, and cleaning early keeps the stored corpus honest rather than
// leaving the difference to be reconciled at every read. It is now a re-export
// so there is one definition, not two that agree until they do not.
export {
  stripLeakedMarkup,
  isMarkupSentence,
} from '../../js/brain/text-cleaning.cjs';
