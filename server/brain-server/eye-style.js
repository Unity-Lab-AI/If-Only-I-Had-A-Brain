// eye-style.js — STYLEBLEED (2026-08-29): the ONE owner of every code-authored
// image-steering string, so the drawability gate can refuse self-contamination
// by PROVENANCE instead of by an opinion list.
//
// The defect this closes, operator's words on the board (§MINDMOTION/STYLEBLEED):
// the eye kept looking up subjects like "color" and "crisp" — words that are
// WordNet-honestly concrete (coloring material; a potato crisp) but that only
// ever reached the subject lane FROM HER OWN STYLE TAILS ("vibrant saturated
// color, crisp sharp focus"). The generator handed such a subject plus the
// color-heavy steering renders a neon full-screen palette, it gets grounded,
// and the tick's recombination then tints everything it blends with.
//
// ⛔ NOT a word-list classifier (that law stands): nothing here judges what a
// word IS. The strings below are the literal prompt text the builders were
// already using — byte-identical, because two of them carry operator-judged
// A/B verdicts (PROMPTBLEED: "thats the fix! B's are all 100% better") that a
// rewording would silently discard. The gate derives "these words are my own
// style vocabulary" from the SAME strings the builders consume, so the two
// can never drift apart.

const EYE_STYLE = {
  // mood tail (MOODPOP, chat.js) — crisp/saturated, never fog
  moodBase: 'vibrant saturated color, crisp sharp focus',
  moodDark: 'bold dramatic contrast',
  moodBright: 'bright playful energy',
  moodEnergy: 'electric high energy',
  moodFear: 'edgy dramatic lighting',
  moodHigh: 'psychedelic swirling color',
  // chat image tail (chat.js)
  chatTail: 'crisp sharp focus, rich color, ultra detailed',
  // unified-scene tail (chat.js)
  sceneTail: 'realistic photograph, true to life, natural lighting, full color, richly detailed, plain uncluttered background',
  // reference-look framing (visual-memory.js — PROMPTBLEED-verified text)
  photoPerson: 'color photograph',
  photoObject: 'color photograph of the object',
  refTail: ', full color, richly detailed, plain background',
};

let _styleWords = null;
/** Every content word appearing in any style string — the provenance set. */
function styleWords() {
  if (!_styleWords) {
    _styleWords = new Set();
    for (const s of Object.values(EYE_STYLE)) {
      for (const w of String(s).toLowerCase().split(/[^a-z]+/)) {
        if (w.length > 2) _styleWords.add(w);
      }
    }
  }
  return _styleWords;
}

module.exports = { EYE_STYLE, styleWords };
