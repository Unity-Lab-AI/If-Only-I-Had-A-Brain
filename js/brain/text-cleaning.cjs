// text-cleaning.cjs — STRIP MARKUP THAT LEAKED INTO PROSE. ONE OWNER.
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
// ⛔⛔ WHY THIS BODY MOVED OUT OF `.claude/scripts/clean-math.mjs`, WHICH IS THE
// WHOLE POINT OF THE FILE. That module is workflow TOOLING: it is not required
// for the brain to run, and a consuming project may not have it at all. The
// four fetchers that imported it are nine short of the thirteen that write the
// corpus — `openstax`, `openmathbooks`, `csmajor`, `cs-textbooks`, `academic`
// and four more never called it, and `openstax` is one of the three worst
// offenders by measured sentence count.
//
// **Fixing the writers would have meant thirteen edits and a standing invitation
// for the fourteenth to forget.** The corpus has exactly ONE reader —
// `server/life-curriculum.js` — so the rule now lives where the brain can reach
// it and is applied where every source converges, including sources that do not
// exist yet.
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
function stripLeakedMarkup(s, maxLoss = 0.4) {
  const before = String(s || '');
  if (!before) return { text: '', drop: true };
  // Cheap exit: the overwhelming majority of sentences carry no markup at all,
  // and this runs over millions of them. Measured over the live corpus:
  // 2,516,276 of 2,542,395 sentences (98.97%) leave through this line having
  // paid one regex test, which is what makes applying it at READ time viable.
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
  // ⭐ Measured again on the live corpus 2026-09-02: **18,503 sentences carry a
  // `$` followed by a digit** and every one of them survives this rule.
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
function isMarkupSentence(s) {
  return stripLeakedMarkup(s).drop;
}

// ⭐⭐ THE COUNTERS EXIST BECAUSE A FILTER NOBODY CAN AUDIT IS A FILTER NOBODY
// TRUSTS. Cleaning at read time means the corpus on disk and the corpus she is
// taught are no longer the same thing — so the difference has to be visible, or
// a word-count taken off the files becomes a quiet lie about what she read.
//
// ⚠ Process-lifetime totals, not per-cell: the reader is called once per cell
// per visit, and a per-call number would answer a question nobody asks.
const cleaningStats = { seen: 0, cleaned: 0, dropped: 0 };

/**
 * Split one experience's story into the sentences the trainer will actually
 * receive: terminator-split, trimmed, markup-stripped, stubs discarded.
 *
 * ⛔ THIS IS THE CHOKEPOINT. Three call sites used to hold the identical split
 * expression and none of them cleaned, so whether a sentence reached her weights
 * carrying `\mathrm` depended on which of thirteen fetchers had written it and
 * whether that fetcher happened to import the cleaner. Four of the thirteen did.
 *
 * @param {string} story
 * @param {(s:string)=>string} [post] per-sentence transform applied AFTER
 *        cleaning — the callers' existing proper-casing, kept in their hands
 */
function storyToSentences(story, post) {
  if (typeof story !== 'string' || !story) return [];
  const out = [];
  for (const raw of story.split(/(?<=[.!?])\s+/)) {
    const s = raw.trim();
    if (!s) continue;
    cleaningStats.seen++;
    const r = stripLeakedMarkup(s);
    // ⛔ A stub that is mostly notation is DROPPED, not shipped with its symbols
    // removed. "Let , then follows." is worse prose than no sentence at all, and
    // she would learn the shape of it.
    if (r.drop) { cleaningStats.dropped++; continue; }
    if (r.text !== s) cleaningStats.cleaned++;
    const t = post ? post(r.text) : r.text;
    if (t) out.push(t);
  }
  return out;
}

/**
 * Clean a standalone prose fragment — a figure's caption or the corpus text it
 * sits inside. Returns '' when the fragment was mostly notation.
 *
 * ⛔ THIS EXISTS BECAUSE A COMMENT CLAIMED IT WAS ALREADY HAPPENING. The figure
 * accessor said its `context` was *"cleaned by the same cleaner that produced
 * the cell's sentences"*. It was cleaned by the FETCHER, and only four of the
 * thirteen fetchers ran one — measured on the live corpus, **1,515 of 33,962
 * contexts and 356 of 19,259 captions still carried markup.**
 *
 * ⚠ This prose is not incidental: it is what BINDS to the percept, so markup
 * here teaches her a symbol as the meaning of a picture — the same defect as a
 * contaminated sentence, arriving through the eyes instead of the ears.
 *
 * ⚠ Empty on drop rather than a stub, because a caption reading "Let , then ."
 * is worse than a figure with no caption. Callers already treat '' as absent.
 */
function cleanProse(s) {
  if (typeof s !== 'string' || !s) return '';
  const r = stripLeakedMarkup(s);
  return r.drop ? '' : r.text;
}

exports.cleanProse = cleanProse;
exports.stripLeakedMarkup = stripLeakedMarkup;
exports.isMarkupSentence = isMarkupSentence;
exports.storyToSentences = storyToSentences;
exports.cleaningStats = cleaningStats;
