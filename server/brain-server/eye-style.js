// eye-style.js — the ONE owner of every code-authored image-steering string, so
// the drawability gate can refuse self-contamination by PROVENANCE instead of by
// an opinion list.
//
// THE DEFECT THIS CLOSES: the eye kept looking up subjects like "color" and
// "crisp" — words that are
// WordNet-honestly concrete (coloring material; a potato crisp) but that only
// ever reached the subject lane FROM HER OWN STYLE TAILS ("vibrant saturated
// color, crisp sharp focus"). The generator handed such a subject plus the
// color-heavy steering renders a neon full-screen palette, it gets grounded,
// and the tick's recombination then tints everything it blends with.
//
// ⛔ NOT a word-list classifier (that law stands): nothing here judges what a
// word IS. The strings below are the literal prompt text the builders were
// already using — byte-identical, because two of them carry operator-judged
// A/B verdicts — one variant judged unanimously better than the other — that a
// rewording would silently discard. The gate derives "these words are my own
// style vocabulary" from the SAME strings the builders consume, so the two
// can never drift apart.

const EYE_STYLE = {
  // mood tail (chat.js) — crisp/saturated, never fog
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
  // reference-look framing (visual-memory.js — A/B-verified text, do not reword)
  // ⭐ 2026-11-23 — re-verified by a new pinned-seed A/B on her own renderer,
  // judged by the operator: the look is a STUDY REFERENCE — the whole thing,
  // centred, on a plain neutral grey backdrop — because the drawing lane learns
  // the subject's silhouette from it, and a full scene (or a white backdrop for a
  // light subject) leaves no single subject to find. Grey beat white on
  // elephant / guitar / cat / rooster / bear; the old "plain background" tail
  // still produced full scenes.
  photoPerson: 'color photograph',
  // ⛔ "whole object, centered … on a plain neutral grey studio backdrop" was a
  // PRODUCT-SHOT recipe: judged on her own renderer at one pinned seed, "first"
  // came back as a grey plate seen from above and "door" as a grey close-up —
  // the grey backdrop greyed every palette she learned (her paintings read
  // black and white) and "centered" pulled round centred objects (a door
  // became a round knocker), which is where the rings and orbs came from.
  // This tail, same seed: a whole blue door, a full chair, a cat — in colour,
  // seen the usual way.
  // followed by the concept and a viewpoint: "color photograph of one whole <c>, seen from …"
  photoObject: 'color photograph of one whole',
  refTail: ', plain pale background, vivid natural colors, full color, richly detailed',
  // fused-idea SCENE framing (chat.js) — an idea that puts its subject IN a
  // place or WITH a substance is a relation, and the isolated-backdrop tail
  // above erases exactly that relation: judged 2026-11-23 on her renderer,
  // ideas of the form "<thing> in <place>" / "<thing> with <substance>" came
  // back as the thing alone on grey; with this framing it sat in the place and
  // in the substance.
  fuseScene: 'color photograph, the whole scene, natural lighting, full color, richly detailed',
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
