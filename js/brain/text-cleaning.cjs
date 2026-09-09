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

// ─────────────────────────────────────────────────────────────────────────────
// APPARATUS — TEXT THAT IS PROSE-SHAPED AND IS NOT PROSE.
//
// ⛔⛔ THE MEASUREMENT THAT FORCED THIS: the live teach viewer was showing
// `ela/kindergarten` training the INDEX of its own source book, row after row:
//
//     b., =21=, =22= sands of dee, the, =412= science sketches , =556= scott, sir w.
//     in this text the oe-ligature is represented by brackets .
//     page vi, "rocky" changed to "rock" (83.
//     de) page 688, small-caps were added to mulock to conform to rest of the index.
//
// Those are the back matter of Project Gutenberg #25545 — its index, its bold
// page references (`=412=` is a page number; the book's own transcriber note
// says *"bold text is represented by ="*) and its errata list. `stripBoilerplate`
// in the fetcher removes the licence header and footer, and the index sits
// BETWEEN those markers, so it is part of the body by every test that ran.
//
// ⛔ NONE OF IT IS MARKUP, which is why everything above this block let it
// through untouched. It is ASCII, it is lowercase, it carries terminal
// punctuation and it is inside the sentence-length bounds. **The existing filter
// asks "is this notation?" and the answer here is honestly no.**
//
// ⚠ AND THE INDEX IS THE SMALLEST OF THE CLASSES BUT ONE. Read through the
// PRODUCTION reader over all 3,758,196 academic corpus sentences, with the
// shipped rules in their shipped order:
//
//     web address                           16,649
//     credit line "located at :"            11,612
//     licence + page furniture              10,114
//     access-date citation stamp             6,214
//     bibliography isbn / doi / issn / oclc  3,017
//     author-initial reference run           1,644
//     gutenberg bold page ref  =NNN=           112
//     platform placeholder                     110
//     page-range citation  pp.NNN               84
//     html attribute debris  src= href=         37
//     transcriber errata                        16
//     ─────────────────────────────────────────────
//     APPARATUS                             49,609     1.320%
//     markup (the block above, pre-existing)  8,844     0.235%
//
// She was learning `commons.wikimedia.org/w/index.php?curid=11749560` as a
// sentence of English, and that class is 149 times larger than the index.
//
// ⚠ THE MATH CELLS LOOK LIKE THE WORST HIT AND THEY ARE NOT THIS FILTER'S DOING.
// `math/grade8` loses 8.3% of its sentences, of which **730 are the pre-existing
// LaTeX drop** above and 69 are apparatus. Attributing that loss here would be
// wrong, and the two counters are separate so nobody has to guess.
//
// ⛔⛔ THREE OF MY OWN DETECTORS WERE DISCARDED BY VALIDATION AND ONE NUMBER IS
// RETRACTED IN THE LEDGER. A comma-density heuristic scored 86,903 hits and put
// the headline at 2.556%; sampling it showed the hits are ordinary prose —
// *"calculus is used to find high points and low points, slope, concavity,
// inflection points"*. Also discarded: `; see also …` and `figure N shows …`,
// both real textbook writing. And `"is represented by"` had to be narrowed from
// 1,287 hits to 12, because *"a demand curve is represented by a demand
// function"* is exactly the prose the wide rule would have eaten.
// **A detector is not a finding until its hits have been read.**

// ⭐ THE ONE THING THAT IS STRIPPED RATHER THAN DROPPED, AND IT WAS MEASURED
// BOTH WAYS. A photo credit sits INSIDE genuine writing —
// `199 cm (louvre) (photo: carole raddato , cc by-sa 2.0) although subtle, the
// figure of watson demonstrates …` — so a licence rule that drops the sentence
// deletes real art history to silence a footer. Cutting the parenthetical and
// then judging what is left saves **757 sentences** that the drop rules would
// otherwise have taken, and every one of them was read before this shipped.
const CREDIT_PAREN = /\((?:photo|image|attribution|credit|figure credit|source)\s*:[^()]{0,300}\)/gi;

// ⛔⛔ A URL IS DROPPED, NEVER STRIPPED, AND THE STRIP VERSION WAS BUILT FIRST
// AND MEASURED AND THROWN AWAY. Removing the address and keeping the remainder
// turns a citation into a fragment that passes every test:
//
//     http://ecommons.txstate.edu/arp/206/ schneider, jack.   ->   schneider, jack.
//
// Adding a length floor and a terminator test did not save it either — the
// survivors were still `beth harris, puritan court cupboard, in smarthistory,
// november 1, 2018, accessed november 16, 2020,` all the way down. **A sentence
// that carries a web address is a citation or a credit, and the ~10% of the
// class that is genuine prose is prose whose whole content is pointing at a
// website.** Judged against teaching her URL fragments as vocabulary, the class
// goes.
const APPARATUS = [
  // The gutenberg index. ⭐ THE DISCRIMINATOR IS QUOTE POSITION, NOT COUNT, AND
  // THE COUNT VERSION WAS TRIED FIRST AND MEASURED. A `>= 2` threshold excluded
  // the one false positive — `the string "=234=+" is not`, a real sentence in a
  // formal-languages chapter — and paid for it by keeping fourteen genuine index
  // rows that carry only one reference, four of them in the very cell the
  // operator was watching (`s., =556= just-so stories , 562 keary, a.`).
  //
  // An index prints its page reference OUTSIDE the quoted title
  // (`"sing a song of sixpence," =31=`); a chapter that discusses a string
  // prints it INSIDE. Dropping quoted spans before counting separates the two
  // and lets the threshold fall back to one: 113 hits against 99, with the
  // original false positive still excluded.
  ['indexref', (s) => /=\d+(?:-\d+)?(?:\s?ff\.)?=/.test(s.replace(/"[^"]*"/g, ' '))],
  ['credit', /\b(?:located at|retrieved from|available at|available from|provided by|authored by|adapted from|image credit|photo credit|content by)\s*:/i],
  ['licence', /\bcc[ -]by(?:-[a-z]{2,3})*\b|\bcreative commons\b|\ball rights reserved\b|\blicense version \d|\blicense\s*:\s*cc\b/i],
  ['bibid', /\bisbn[\s:]?[\d -]{9,}|\bdoi[\s:]?10\.\d{4}|\bissn[\s:]?\d{4}|\boclc[\s:]?\d{4}/i],
  // An access-date stamp is a bibliographic GRAMMAR, not a word list — both
  // orders, because the corpus carries `accessed october 29, 2022` and
  // `accessed 13 february 2020`.
  ['citation', /\b(?:accessed|retrieved|last updated|last modified|viewed)\s+(?:on\s+)?(?:[a-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[a-z]{3,9}\.?\s+\d{4})/i],
  // ⭐ THE LAST TWO ROWS THE OPERATOR PASTED NEEDED THEIR OWN ARMS, AND THE
  // CHEAP WAY TO CATCH THEM WOULD HAVE COST 63,351 REAL SENTENCES. `bold text is
  // represented by = and italic by .` and `the text used / as punctuation in one
  // story` carry no citation marker at all — only a bare `=` and a bare `/`. A
  // rule on either symbol was measured: **60,039 hits on ` = ` and 3,312 on
  // ` / `, and they are real mathematics and science** (`if f = x2 is the
  // squaring function`, `the rational number 1 / 3`, `m / z 45-500`). Both
  // discarded.
  //
  // What is actually distinctive is that these sentences describe the
  // TRANSCRIPTION rather than the story. Both arms below hit **exactly** the
  // four and the two rows that exist, corpus-wide, and nothing else.
  ['transnote', /"[^"]{1,40}"\s+changed to|moved up from the end of the line|to conform to (?:the )?rest of|oe-ligature|small-caps were added|\b(?:bold|italic|italics|small-caps|small caps)\b[^.]{0,30}\bis represented by\b|\bthe text used\b[^.]{0,24}\bas punctuation\b/i],
  ['pagecite', /\bpp\.\s?\d+/i],
  // A reference list, not a name. TWO initials required: `said mr. j., and left`
  // is dialogue and carries one.
  ['initrun', (s) => (s.match(/(?:^|\s)[a-z]\.,/g) || []).length >= 2],
  // ⛔⛔ THIS RULE WAS EATING GEOMETRY AND THE MATH CELLS CAUGHT IT. The first
  // cut read `\b(?:src|alt|href|width|height)\s*=` — and `each with base = 5
  // centimeters, height = 3 centimeters` is a TRIANGLE, not a tag. Measured:
  // 148 hits before, **41 after**, and the 107 it stopped taking were
  // Illustrative Mathematics figure descriptions across grades 6, 7, 8 and 10.
  // An HTML attribute is written `href="…"` with no space; a dimension in prose
  // is written `height = 3 centimeters` with one. `width`/`height`/`style`
  // therefore require a quote, and only the three attributes that never occur as
  // English words are matched bare.
  ['attrdebris', /\b(?:src|alt|href)\s*=|\b(?:width|height|style)\s*=\s*["']/i],
  ['placeholder', /\belement has been excluded from this version of the text\b|\bthis (?:page|section) has no tags\b|\bshow toc\b/i],
  // ⛔⛔ LAST ON PURPOSE, AND IT IS UNCONDITIONAL. Last because it is the widest
  // arm and the counters exist to say WHICH source is contaminating the corpus:
  // a licence footer that happens to carry a URL should be counted as `licence`,
  // where a fix upstream can find it, not swallowed into one undifferentiated
  // pile. Moving it here changed no verdict, only the attribution — 34,966 hits
  // as the second rule became 11,848 here, with the difference reappearing under
  // the specific class that actually describes it.
  //
  // ⚠ AND UNCONDITIONAL AFTER TWO REFINEMENTS WERE BUILT, MEASURED AND THROWN
  // AWAY. Strip-then-judge turned citations into fragments (`schneider, jack.`);
  // requiring five words of prose after the address rescued **5,265** sentences
  // of which 18 of 18 sampled were resource listings (`https://youtu.be/…  works
  // discussed marcel duchamp, nude descending a staircase`). Neither test
  // separates prose from a link list, because a link list is mostly words.
  //
  // ⚠ THE COST IS REAL AND IS NOT HIDDEN: two hand-authored `corpora/coding`
  // sentences whose SUBJECT is what a URL is (*"as an example of a web page url,
  // https://www.example.com/index.html indicates protocol https, hostname …"*)
  // are refused with the furniture, along with an unmeasured handful of "visit
  // this site and find a story" exercise prompts. Weighed against ~35,000
  // sentences of link furniture, and against her learning
  // `commons.wikimedia.org/w/index.php?curid=11749560` as a word, the class goes.
  ['webaddr', /\b(?:https?:\/\/|www\.)|\b[a-z0-9-]{2,}\.(?:org|com|net|edu|gov|io)\/|\bindex\.php\?/i],
];

// ⭐ THE CHEAP EXIT, AND ⛔ IT IS ALSO THE PLACE THIS WHOLE BLOCK COULD GO
// SILENTLY DEAD. Eleven regexes over millions of sentences wants a gate, and a
// gate that does not admit every class is a rule that never runs while the code
// reads as though it does — the same shape as a fallback whose trigger cannot
// fire. **Measured: 93.11% of the corpus leaves on this one test, and all
// fifteen class witnesses reach the rules behind it.**
const APPARATUS_SUSPECT = /[=/]|\bpp\.|\bisbn\b|\bdoi\b|\bissn\b|\boclc\b|\bcc[ -]by\b|creative commons|all rights reserved|\bhttps?:|\bwww\.|\baccessed\b|\bretrieved\b|\blast (?:updated|modified)\b|\blocated at\b|\bprovided by\b|\bauthored by\b|\badapted from\b|\bavailable (?:at|from)\b|\bshow toc\b|has been excluded from this version|\bviewed\b|\bimage credit\b|\bphoto credit\b|\bcontent by\b|\blicense\b|\bchanged to\b|oe-ligature|small-caps|moved up from|to conform to|(?:^|\s)[a-z]\.,/i;

/** Cut credit apparatus that sits inside otherwise real prose. */
function stripCreditApparatus(s) {
  const before = String(s || '');
  if (!before || before.indexOf('(') < 0) return before;
  CREDIT_PAREN.lastIndex = 0;
  if (!CREDIT_PAREN.test(before)) return before;
  CREDIT_PAREN.lastIndex = 0;
  return before.replace(CREDIT_PAREN, ' ')
    .replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}

/**
 * Name the apparatus class a sentence belongs to, or '' when it is prose.
 *
 * Returns the CLASS rather than a boolean so the counters can say which kind of
 * non-prose was removed. A single `dropped` total cannot tell an index from a
 * bibliography, and the two want different fixes upstream.
 */
function apparatusClass(s) {
  const t = String(s || '');
  if (!t || !APPARATUS_SUSPECT.test(t)) return '';
  for (const [name, rule] of APPARATUS) {
    if (typeof rule === 'function' ? rule(t) : rule.test(t)) return name;
  }
  return '';
}

/** True when the sentence is apparatus and must not enter the corpus. */
function isApparatusSentence(s) {
  return apparatusClass(s) !== '';
}

// ⭐⭐ THE COUNTERS EXIST BECAUSE A FILTER NOBODY CAN AUDIT IS A FILTER NOBODY
// TRUSTS. Cleaning at read time means the corpus on disk and the corpus she is
// taught are no longer the same thing — so the difference has to be visible, or
// a word-count taken off the files becomes a quiet lie about what she read.
//
// ⚠ Process-lifetime totals, not per-cell: the reader is called once per cell
// per visit, and a per-call number would answer a question nobody asks.
// ⚠ `apparatus` is the TOTAL and `apparatusByClass` is the breakdown. Both, not
// one: the total answers "how much of the corpus on disk is not prose?" and the
// breakdown answers "which source is putting it there?" — and a fix upstream is
// only checkable against the second.
const cleaningStats = {
  seen: 0, cleaned: 0, dropped: 0,
  apparatus: 0, credited: 0,
  apparatusByClass: {
    indexref: 0, webaddr: 0, credit: 0, licence: 0, bibid: 0, citation: 0,
    transnote: 0, pagecite: 0, initrun: 0, attrdebris: 0, placeholder: 0,
  },
};

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
    // ⛔ APPARATUS RUNS AFTER THE MARKUP STRIP AND BEFORE `post`. After, because
    // a licence footer wrapped in wiki markup must be judged on its words rather
    // than its braces; before, because `post` is the caller's proper-casing and
    // capitalising an index entry does not make it a sentence.
    const credited = stripCreditApparatus(r.text);
    if (credited !== r.text) cleaningStats.credited++;
    const klass = apparatusClass(credited);
    if (klass) {
      cleaningStats.apparatus++;
      cleaningStats.apparatusByClass[klass]++;
      continue;
    }
    const t = post ? post(credited) : credited;
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
  if (r.drop) return '';
  // ⛔ A CAPTION AND A CONTEXT GET THE SAME BAR AS A SENTENCE, BECAUSE THEY BIND
  // TO A PERCEPT. A context reading `license : cc by-sa: attribution-sharealike`
  // teaches a licence string as the meaning of a picture, which is the
  // unlabelled-frame defect arriving through the eyes instead of the ears.
  const credited = stripCreditApparatus(r.text);
  const klass = apparatusClass(credited);
  if (klass) {
    cleaningStats.apparatus++;
    cleaningStats.apparatusByClass[klass]++;
    return '';
  }
  return credited;
}

exports.cleanProse = cleanProse;
exports.stripLeakedMarkup = stripLeakedMarkup;
exports.isMarkupSentence = isMarkupSentence;
exports.storyToSentences = storyToSentences;
exports.cleaningStats = cleaningStats;
exports.apparatusClass = apparatusClass;
exports.isApparatusSentence = isApparatusSentence;
exports.stripCreditApparatus = stripCreditApparatus;
