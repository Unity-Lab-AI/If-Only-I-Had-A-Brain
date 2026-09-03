/**
 * letter-input.js — Dynamic letter one-hot encoder for the cortex letter region
 *
 * Part of the language rebuild: letters enter the cortex as one-hot input.
 *
 * Letters are the primitive symbols the brain reads and writes. They're NOT
 * hardcoded as a 26-character English alphabet — the inventory is a dynamic
 * Set that grows as the brain encounters new symbols. When Unity reads a
 * Greek character, or an emoji, or a Chinese glyph that the persona corpus
 * later includes, the inventory grows by one and all one-hot vectors for
 * previously-seen symbols gain a new dimension. No hardcoded alphabet cap.
 *
 * Why one-hot and not phoneme features: phonemes are LEARNED. This lane does
 * NOT hardcode an English phonology feature table like the earlier draft.
 * Instead, letters are primitive one-hot inputs to the cortex's letter
 * sub-region, and the cortex's recurrent + cross-region Hebbian dynamics
 * learn phoneme attractor basins from exposure. The phoneme features we'd
 * normally code by hand (vowel/consonant, place, manner, voicing) emerge
 * implicitly in the cortex basin geometry after curriculum — letters that
 * appear in similar statistical contexts end up with overlapping cortex
 * activation patterns, without us ever naming the features. This matches
 * biological auditory cortex phoneme-category formation (Kuhl 2004, Nat Rev
 * Neurosci 5:831 — "Early language acquisition: cracking the speech code").
 *
 * Inventory rule: letters are LOWERCASED at encoding time so case doesn't
 * double the inventory. Non-letter characters (digits, punctuation, emoji,
 * unicode) are fine — they enter the inventory just like letters. The
 * brain doesn't distinguish "letters" from "symbols" at this layer; they're
 * all primitive input words.
 *
 * Use from cluster.js via `cluster.injectLetter(letter)`, which wraps this
 * module's `encodeLetter()` output with `cluster.injectEmbeddingToRegion('letter', ...)`.
 *
 * Persistence: `serializeInventory()` returns a plain array, `loadInventory(arr)`
 * rebuilds the Set from a saved array. The cortex cluster's weights will
 * have been trained against whichever inventory was in place at learning
 * time — reloading after the inventory grew between sessions is safe as long
 * as the inventory order is preserved (which `serializeInventory` does via
 * insertion-ordered Set semantics).
 */

// Module-level singleton. One inventory per brain. Browser and server each
// maintain their own — they're identical as long as they're trained on the
// same corpora. The persistence layer keeps them in sync across restarts.
const LETTER_INVENTORY = new Set();

// Default English alphabet + digits + basic punctuation + space. Seeded
// at module load so the inventory is NEVER empty — downstream callers
// (encodeLetter, decodeLetter, the motor argmax path) always have a
// stable 40-dim one-hot space even before any corpus has been read.
// The insertion order here defines the one-hot dimension assignment,
// which is persisted and reloaded via serializeInventory /
// loadInventory — as long as this seeding runs before any weight load,
// dimensions line up across restarts.
const DEFAULT_ALPHABET = [
  // Lowercase English (26)
  'a','b','c','d','e','f','g','h','i','j','k','l','m',
  'n','o','p','q','r','s','t','u','v','w','x','y','z',
  // Digits (10)
  '0','1','2','3','4','5','6','7','8','9',
  // Whitespace + basic punctuation (4)
  ' ','.',',','\'',
];
for (const ch of DEFAULT_ALPHABET) LETTER_INVENTORY.add(ch);

// Inventory lock — when true, ensureLetter silently REJECTS any symbol
// outside the current inventory instead of growing it. Default ON so
// random unicode seen in corpora can't pollute the letter region.
// Operators can disable with `setInventoryLock(false)` for experimental
// multi-script work. Readiness-probe operator log was showing Unity
// emitting 'mcaa' for a letter='a' cue, which is the signature of the
// motor argmax decoding to inventory dimensions that should never have
// been present — lock closes that leak.
let _inventoryLocked = true;

// Module-level cache of one-hot vectors per letter. Rebuilt whenever the
// inventory grows (because growing adds a new dimension to every vector).
// Key is the lowercased letter; value is a Float32Array of length
// LETTER_INVENTORY.size.
let _oneHotCache = new Map();
let _cachedInventorySize = 0;

/**
 * Return the current size of the letter inventory. Grows as `ensureLetter`
 * or `encodeLetter` sees new symbols.
 */
export function inventorySize() {
  return LETTER_INVENTORY.size;
}

/**
 * Return a snapshot of the current inventory as an array. Insertion-ordered
 * so the one-hot dimensions stay consistent across calls that don't grow
 * the inventory.
 */
export function inventorySnapshot() {
  return Array.from(LETTER_INVENTORY);
}

/**
 * Add a letter to the inventory if it isn't already there. Triggers a cache
 * rebuild on the next `encodeLetter` call (old cached vectors are stale once
 * the inventory has grown).
 */
export function ensureLetter(letter) {
  if (!letter) return;
  const key = String(letter).toLowerCase();
  if (!LETTER_INVENTORY.has(key)) {
    // Lock rejection — reject unknown symbols when the inventory is
    // locked. Default policy: only a-z + 0-9 + basic punctuation can
    // participate in the letter region. Unicode glyphs from random
    // corpora cannot grow the inventory at runtime because doing so
    // invalidates every previously-trained one-hot dimension's
    // meaning (new dim shifts existing dim indices). Operators can
    // pass a custom alphabet at boot via `loadInventory(arr)` then
    // re-lock — or run unlocked via `setInventoryLock(false)` for
    // experimental multi-script work.
    if (_inventoryLocked) return;
    LETTER_INVENTORY.add(key);
    // Invalidate cache — all cached vectors are now wrong-sized
    _oneHotCache.clear();
    _cachedInventorySize = 0;
  }
}

/**
 * Enable / disable the inventory lock at runtime. Defaults to TRUE at
 * module load. When locked, `ensureLetter` silently rejects symbols
 * outside the current inventory. Returns the previous lock state.
 */
export function setInventoryLock(locked) {
  const prev = _inventoryLocked;
  _inventoryLocked = !!locked;
  return prev;
}

/** Returns the current lock state — telemetry / diagnostics only. */
export function isInventoryLocked() {
  return _inventoryLocked;
}

/**
 * Encode a letter as a one-hot Float32Array of length inventorySize().
 *
 * Auto-grows the inventory if the letter is new. Cached per letter so
 * repeated calls are O(1). Returns a freshly-allocated Float32Array each
 * call to prevent caller mutation from polluting the cache.
 */
export function encodeLetter(letter) {
  if (!letter) return new Float32Array(0);
  const key = String(letter).toLowerCase();
  ensureLetter(key);

  // Rebuild cache if inventory grew
  if (_cachedInventorySize !== LETTER_INVENTORY.size) {
    _oneHotCache.clear();
    _cachedInventorySize = LETTER_INVENTORY.size;
  }

  // Return a COPY so caller can't mutate the cache
  const cached = _oneHotCache.get(key);
  if (cached) {
    const out = new Float32Array(cached.length);
    out.set(cached);
    return out;
  }

  // Build fresh one-hot. The letter's dimension index is its position in
  // insertion order (Set iteration order).
  const size = LETTER_INVENTORY.size;
  const vec = new Float32Array(size);
  let idx = 0;
  for (const l of LETTER_INVENTORY) {
    if (l === key) { vec[idx] = 1.0; break; }
    idx++;
  }

  // Cache the canonical version
  _oneHotCache.set(key, vec);

  // Return a copy
  const out = new Float32Array(size);
  out.set(vec);
  return out;
}

/**
 * Bulk-ensure a sequence of letters. Cheaper than calling ensureLetter N
 * times because it batches the cache invalidation.
 */
export function ensureLetters(letters) {
  if (!letters) return;
  let grew = false;
  for (const l of letters) {
    if (!l) continue;
    const key = String(l).toLowerCase();
    if (!LETTER_INVENTORY.has(key)) {
      // Locked: silently skip symbols outside the current inventory.
      // Same policy as ensureLetter above.
      if (_inventoryLocked) continue;
      LETTER_INVENTORY.add(key);
      grew = true;
    }
  }
  if (grew) {
    _oneHotCache.clear();
    _cachedInventorySize = 0;
  }
}

/**
 * Decode a letter vector back to a letter symbol. Argmax over the one-hot
 * dimensions — whichever dimension has the highest activation is the
 * letter that the activation pattern represents. Used by the tick-
 * driven motor emission loop to read letters out of the cortex motor
 * region readout.
 *
 * If the input vector has fewer dimensions than the current inventory
 * (because it was generated before a recent inventory growth), pad with
 * zeros internally. If the input has MORE dimensions than the current
 * inventory, ignore the tail.
 *
 * @param {Float32Array|Float64Array} vec  activation vector over letters
 * @returns {string}  the decoded letter, or null if the vector is empty
 *                    or has no clear winner
 */
export function decodeLetter(vec) {
  if (!vec || vec.length === 0 || LETTER_INVENTORY.size === 0) return null;
  const limit = Math.min(vec.length, LETTER_INVENTORY.size);
  let best = -Infinity;
  let bestIdx = -1;
  for (let i = 0; i < limit; i++) {
    if (vec[i] > best) { best = vec[i]; bestIdx = i; }
  }
  if (bestIdx < 0) return null;
  let idx = 0;
  for (const l of LETTER_INVENTORY) {
    if (idx === bestIdx) return l;
    idx++;
  }
  return null;
}

/**
 * Argmax restricted to ALPHABETICAL inventory entries (^[a-z]$). Used
 * by the tick-driven motor emission path for SPEECH output where Unity
 * should produce letters, not digit or punctuation words. Inventory
 * auto-grows during corpus exposure to include digits + punctuation
 * (`'`, `.`, `,`, `0-9`) which are legitimately needed for visual
 * reading + math curriculum input paths, but motor speech output
 * should never emit those buckets.
 *
 * Operator caught iter6/iter7 verbatim 2026-04-26: K-STUDENT outputs
 * dumping "4"/","/"5678'"/"88883tt2" because tick-driven motor argmax
 * landed on digit + punct buckets. Template 0/1 fast paths got an a-z
 * clamp in iter7; this is the SAME structural fix for the matrix-
 * driven generation path that fires when no template matches.
 *
 * Returns the strongest a-z bucket regardless of how many non-alpha
 * entries the inventory contains. If the inventory has zero a-z
 * entries (early boot pre-curriculum), returns null.
 */
export function decodeLetterAlpha(vec) {
  if (!vec || vec.length === 0 || LETTER_INVENTORY.size === 0) return null;
  const limit = Math.min(vec.length, LETTER_INVENTORY.size);
  let best = -Infinity;
  let bestIdx = -1;
  let idx = 0;
  for (const l of LETTER_INVENTORY) {
    if (idx >= limit) break;
    if (l && /^[a-z]$/.test(l)) {
      const v = vec[idx];
      if (v > best) { best = v; bestIdx = idx; }
    }
    idx++;
  }
  if (bestIdx < 0) return null;
  let i = 0;
  for (const l of LETTER_INVENTORY) {
    if (i === bestIdx) return l;
    i++;
  }
  return null;
}

/**
 * Serialize the inventory for persistence. Returns a plain array in
 * insertion order, which is the order that defines the one-hot dimensions.
 * The persistence layer stores this alongside the cortex cluster
 * weights so the dimensions line up after reload.
 */
export function serializeInventory() {
  return Array.from(LETTER_INVENTORY);
}

/**
 * Load a persisted inventory. Replaces the current in-memory inventory
 * with the loaded snapshot and invalidates the one-hot cache. Caller
 * must make sure the cortex cluster's letter-region weights were trained
 * against this same inventory — mismatched inventories will produce
 * meaningless one-hot dimensions.
 */
export function loadInventory(arr) {
  if (!Array.isArray(arr)) return;
  LETTER_INVENTORY.clear();
  for (const l of arr) {
    if (typeof l === 'string' && l.length > 0) {
      LETTER_INVENTORY.add(l.toLowerCase());
    }
  }
  _oneHotCache.clear();
  _cachedInventorySize = 0;
}

/**
 * Reset the inventory entirely. Used by tests and by the curriculum runner
 * when starting a fresh training pass on a cleared brain.
 */
export function resetInventory() {
  LETTER_INVENTORY.clear();
  // Re-seed the default alphabet so the inventory is never empty.
  // Callers that want a truly empty inventory (uncommon — only the
  // earliest boot paths) can `setInventoryLock(false)` then load
  // their own seed via `loadInventory(arr)`.
  for (const ch of DEFAULT_ALPHABET) LETTER_INVENTORY.add(ch);
  _oneHotCache.clear();
  _cachedInventorySize = 0;
}
