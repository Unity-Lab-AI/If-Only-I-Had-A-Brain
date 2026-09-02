// clean-math.mjs — STRIP MARKUP THAT LEAKED INTO PROSE, SHARED BY EVERY FETCHER.
//
// ⛔⛔ THE MEASUREMENT THAT FORCED THIS: 22,859 corpus sentences carry raw LaTeX
// math — `arxiv` 9,946, `illustrative-math` 7,868 (**27% of that entire
// source**), `saylor` 2,594 — plus 981 carrying unrendered MediaWiki templates.
// That is TEN TIMES the bracket-debris problem the corpus rows were filed about,
// and nobody had measured it.
//
// It matters because this brain learns WORDS from prose. A sentence reading
// `the sk-wasserstein distance, denoted $d_{\mathrm{sk}}$, maps diagram points`
// teaches her `d_{\mathrm{sk}}` as vocabulary. Maths here is taught
// EQUATIONALLY, never as prose about notation, so leaked notation is not merely
// noise — it is the one thing the grade-completion gate exists to forbid,
// arriving through the back door.
//
// ⛔ ONE MODULE, FOUR CALLERS. Four private copies of this rule would drift, and
// the corpus already paid for that: the same missing merge clause was found in
// three separate fetchers on three separate days. Fix the chokepoint.
//
// ⚠ WHAT THIS DELIBERATELY DOES NOT TOUCH: editorial brackets in quotations —
// `destroyed by [bias]`, `[since 1925]`, `[researchers]`. 214 sentences carry
// those and **every one is ordinary English**, standard usage inside a quote.
// Treating a bracket as debris would damage real prose to fix imagined damage.
// The distinction is markup-versus-punctuation, not bracket-versus-no-bracket.

// Markup that is never prose, in the order it must be removed.
const PATTERNS = [
  /\{\{[\s\S]*?\}\}/g,                 // MediaWiki template  {{review question |...}}
  /\{\\displaystyle[\s\S]*?\}/g,       // MathML/wiki math    {\displaystyle c_{f}}
  /\\\([\s\S]*?\\\)/g,                 // inline LaTeX        \( n = 0 \)
  /\\\[[\s\S]*?\\\]/g,                 // display LaTeX       \[ ... \]
  /\$\$[\s\S]*?\$\$/g,                 // display maths       $$ ... $$
  // ⛔⛔ INLINE `$…$` ONLY WHEN THE SPAN LOOKS LIKE NOTATION. A naive
  // `\$[^$\n]{1,200}\$` matches from the first dollar to the second, so
  // `revenue rose from $1,200 to $4,500` became `revenue rose from 4,500` — it
  // ate the sentence BETWEEN two currency amounts. Two prices in one sentence
  // are indistinguishable from a math span by delimiters alone.
  //
  // The discriminator is the CONTENT: real inline maths carries a LaTeX marker
  // (`\`, `{`, `^`, `_`) or is a short unspaced symbol. `1,200 to ` is neither.
  /\$[^$\n]{0,200}?[\\{}^_][^$\n]{0,200}?\$/g,   // $d_{\mathrm{sk}}$, $x^2$
  /\$[^\s$]{1,24}\$/g,                           // $x$, $abc$ — short, unspaced
  /\\[a-zA-Z]{2,}(\{[^}]*\})*/g,       // bare command        \mathrm{sk}, \displaystyle
  /\[link\]/gi,                        // OpenStax cross-reference placeholder
];

/**
 * Strip leaked markup from one sentence.
 *
 * Returns `{ text, drop }`. `drop` is true when the sentence was MOSTLY markup —
 * removing it would leave a stub that reads like broken prose, which is worse
 * than not having the sentence. A sentence that merely mentions one symbol keeps
 * its words and loses the symbol.
 *
 * @param {string} s
 * @param {number} [maxLoss=0.4] fraction of characters that may be removed
 *                               before the sentence is discarded instead
 */
export function stripLeakedMarkup(s, maxLoss = 0.4) {
  const before = String(s || '');
  if (!before) return { text: '', drop: true };
  // Cheap exit: the overwhelming majority of sentences carry no markup at all,
  // and this runs over millions of them.
  if (!/[${}\\]|\[link\]/i.test(before)) return { text: before, drop: false };

  let t = before;
  for (const re of PATTERNS) t = t.replace(re, ' ');
  t = t.replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();

  const lost = 1 - (t.length / before.length);
  if (!t || lost > maxLoss) return { text: t, drop: true };
  // A residue of orphaned braces or backslashes means the sentence was more
  // notation than the patterns caught. Dropping beats shipping a stub.
  //
  // ⛔⛔ BUT A LONE `$` IS USUALLY MONEY, NOT MATHS, AND TREATING IT AS MARKUP
  // THREW AWAY REAL ECONOMICS. A first cut dropped on any residual `$` and the
  // projection came back with **9,307 saylor and 6,697 openstax sentences
  // discarded** — far more than those sources' entire LaTeX count. They are
  // business and economics texts: `$10,000` is the subject matter. Caught by the
  // numbers disagreeing with the earlier per-source measurement, not by an error.
  //
  // So `$` only counts as leftover notation when it looks like notation: paired,
  // or immediately followed by a letter, backslash or brace. `$` before a digit,
  // a space or a comma is currency and the sentence keeps it.
  if (/[{}\\]/.test(t)) return { text: t, drop: true };
  // ⚠ COUNT IS NOT THE SIGNAL, AND USING IT WAS THE CURRENCY BUG A SECOND TIME.
  // "prices of $5, $10 and $20 were compared" has three dollar signs and is
  // ordinary prose. What marks leftover notation is what FOLLOWS the sign: a
  // letter, brace or backslash. A digit, space, comma or full stop is money.
  if (/\$[^\s\d,.]/.test(t)) return { text: t, drop: true };
  return { text: t, drop: false };
}

/** True when the sentence should not enter the corpus at all. */
export function isMarkupSentence(s) {
  return stripLeakedMarkup(s).drop;
}
