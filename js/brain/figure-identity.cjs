// figure-identity.cjs — THE ONE OWNER OF A FIGURE'S ADDRESS AND ITS READABILITY.
//
// ⛔⛔ WHY THIS FILE EXISTS: the rule that turns a figure's URL into its storage
// key had **five independent copies**, and the rule that decides whether a
// figure can be decoded at all had **two that did not agree**. Every one of them
// was written deliberately, each with a comment explaining why copying was
// acceptable that day — which is exactly how a rule ends up with five owners and
// no owner.
//
// The copies, before this module existed:
//
//     js/brain/curriculum.js          figKeyOf(fig)     (h<<5)+h ^ c   bare
//     server/figure-queue.js          figKey(url)       (h<<5)+h ^ c   bare
//     server/figure-field-store.js    figKey(url)       h*33 ^ c       fig: prefixed
//     .claude/scripts/perceive-corpus-figures.mjs       h*33 ^ c       fig: prefixed
//     .claude/scripts/gen-figure-links.mjs              h*33 ^ c       bare
//
// ⭐ THE TWO ARITHMETIC FORMS WERE PROVEN EQUIVALENT BEFORE THEY WERE MERGED,
// by running both over every URL the corpus actually holds — 38,318 compared,
// **0 disagreements**. `(h<<5)+h` and `h*33` are congruent modulo 2^32, and `^`
// coerces through ToInt32, so the truncation `<<` performs is invisible in the
// result. That is a measurement, not an argument: had even one differed, every
// field produced by one writer would have been unreadable by the other.
//
// ⚠ WHAT WAS ACTUALLY BROKEN was not the hash. It was the FORMAT rule, whose two
// copies held different lists — and a list is not congruent to another list.
//
// ⛔ NO NODE APIs AND NO IMPORTS, deliberately. This is required by CommonJS
// server modules on the teach path and imported by the ESM curriculum, which the
// repo's own invariant says is browser-bundled. Pure functions keep it legal in
// all three places without a build step, a polyfill, or a Node-version floor.

// djb2 over the address — the figure's IDENTITY, never its position in a file.
// ⛔ A LIST INDEX IS NOT AN IDENTITY. Keyed by position, a re-ingest that inserts
// one figure shifts every later key by one, so every banked percept in that cell
// silently re-binds to a DIFFERENT picture — and nothing can detect it, because
// the key still looks well-formed. This project has already paid for that once.
function hashAddress(src) {
  let h = 5381;
  const s = String(src || '');
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Accepts either shape the five copies took: a figure object (`{url}` or
// `{src}`) or a bare URL string. ⛔ BOTH FIELD NAMES ARE READ, because two
// harvesters write `src` where the rest write `url`, and an accessor that
// required `url` alone once made 6,899 figures unreachable while the corpus held
// them the whole time.
function figKeyOf(figOrUrl) {
  if (figOrUrl && typeof figOrUrl === 'object') {
    return hashAddress(figOrUrl.url || figOrUrl.src || '');
  }
  return hashAddress(figOrUrl);
}

// The store-address form. The visual store namespaces figures under `fig:` so a
// diagram can never overwrite something she has seen with her own eyes.
function figKey(figOrUrl) {
  return `fig:${figKeyOf(figOrUrl)}`;
}

// ⛔ THE `fig:` PREFIX MUST NEVER REACH A FILENAME. A colon is illegal on Windows
// and NTFS reads it as an alternate-data-stream separator, so `fig:abc.field.json`
// silently produces a stream hanging off a file named `fig` — with no write error
// at all. Two separate writers paid for this before it was written down.
function bareKey(key) {
  return String(key).replace(/^fig:/, '');
}

// Two characters deep: ~32,300 files over 36 shards keeps any single directory
// small enough for git, rsync and a filesystem to handle.
function shardName(key) {
  return bareKey(key).slice(0, 2).padEnd(2, '0');
}

// ⛔⛔ THE FORMAT RULE, AND THE ONE THAT WAS GENUINELY WRONG IN TWO PLACES.
//
// The curriculum's reachability gate held `gif|pdf|djvu|stl`. The failure
// classifier held `gif|pdf|djvu|stl|webm|mp4|svgz`. Two lists, silently
// diverged — the classifier would call a `.webm` permanently dead while the gate
// happily handed the same address to the perception lane as a live figure.
//
// ⭐ MEASURED BEFORE MERGING, so the union is a fact and not a preference: the
// corpus holds **zero** webm, mp4 or svgz figures, so today the two lists reach
// the same verdict on every figure that exists. The union is therefore a free
// merge — it changes no outcome now and closes the gap for the corpus this grows
// into. **A silent agreement between two copies is not the same as one copy.**
//
// Each entry is here because NOTHING IN THE PATH CAN READ IT, not because of a
// preference. The decoder handles jpeg, png and webp; a vector reaches pixels
// only through a rendition, which `svg`/`tif`/`tiff` have and these do not.
//
// ⚠ GIF IS A DELIBERATE EXCLUSION ON A DIFFERENT GROUND and is the one entry
// that is not purely technical: an animation's MOTION is the lesson, and she has
// no temporal percept path, so a first frame banks a MISLEADING percept rather
// than a partial one. Measured consequence of the current rule: 181 distinct
// GIFs in the corpus, **0 of which ever produced a field** — so excluding them
// costs nothing that was being collected, and stops the producer spending a
// fetch and a rendition round-trip on each one, on every pass.
const UNDECODABLE_FIGURE_EXT = /\.(gif|pdf|djvu|stl|webm|mp4|svgz)(\?|#|$)/i;

// Tested against the PATH, not the whole URL — a query string routinely carries
// a filename that has nothing to do with what the server returns.
function isUndecodableFigure(href) {
  const s = String(href || '');
  if (!s) return false;
  const p = s.split('?')[0].split('#')[0];
  return UNDECODABLE_FIGURE_EXT.test(`${p}?`);
}

// The reachability gate: the address a figure can actually be fetched at, or an
// empty string when there is no point in trying. Returning '' rather than
// throwing keeps every caller's shape unchanged — a figure with no usable
// address is simply not a figure, the same way one with no anchor text is not.
function figureAddress(f) {
  if (!f) return '';
  const href = (typeof f.url === 'string' && f.url)
    ? f.url
    : (typeof f.src === 'string' ? f.src : '');
  if (!/^https?:\/\//i.test(href)) return '';
  if (isUndecodableFigure(href)) return '';
  return href;
}

exports.hashAddress = hashAddress;
exports.figKeyOf = figKeyOf;
exports.figKey = figKey;
exports.bareKey = bareKey;
exports.shardName = shardName;
exports.UNDECODABLE_FIGURE_EXT = UNDECODABLE_FIGURE_EXT;
exports.isUndecodableFigure = isUndecodableFigure;
exports.figureAddress = figureAddress;
