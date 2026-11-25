//+ /B3/B4/C4/C5 — Live Dictionary API integration.

// Pipes "what is X" / definition queries to dictionaryapi.dev (free,
// no API key, no auth) so the brain can speak the definition of any
// English word — not just the ~200 K-vocab words baked into trained
// word_motor buckets.

// Design decisions (full operator-quoted rationale lives in TODO.md
//entry, kept out of this code per workflow-files-only rule):
//   - No rate limiting (free API, no concurrency cap on prefetch
//     beyond the  batch-of-20)
//   - In-memory cache; optional disk cache via DREAM_DEFINITION_CACHE_FILE
//   - Sensory-I/O role only; equational learning happens in cluster
//     Hebbian primitives reading the API output

//hardening landed:
//   B2  — concurrency cap on prefetch (20 parallel) + 429 back-off
//   B3  — TTL on error-cached entries (5 min) so transient failures
//         don't permanently undefine words
//   B4  — LRU eviction (cap 10k entries) so cache doesn't grow unbounded
//   C4  — Node version check; logs warning + degrades to no-op when
//         globalThis.fetch is unavailable (Node < 18)
//   C5  — User-Agent header on every fetch so dictionaryapi.dev can
//         identify Unity Brain traffic

// Module is sensory I/O — like Pollinations image-gen — NOT cognition.
// The fetched definition becomes input to the equational layer
// (sem-region embeddings, Hebbian co-activation, motor emission).
// Cognition stays 100% equational.

/* ⭐ The offline dictionary, consulted BEFORE the network in getDefinition().
   Required at module scope, not lazily inside the hot path, so a missing file
   is a boot-time complaint rather than a surprise on the first word taught.
   The module itself loads WordNet lazily and never throws — see its header. */
const offlineDict = require('./offline-dictionary.js');

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
// The SAME dictionary without the wrapper's editorial filtering. See the union
// block in the fetch path for why this is a second query for one capability
// rather than a fallback, and for the measured coverage that forced it.
const WIKT_BASE = 'https://en.wiktionary.org/api/rest_v1/page/definition/';

// fetch availability check at module load.
const HAS_FETCH = typeof globalThis.fetch === 'function';
if (!HAS_FETCH) {
  console.warn('[definition-service] WARN: globalThis.fetch unavailable (Node < 18?). Dictionary API disabled — definition lookups return null. Upgrade Node to ≥18 for live dictionary.');
}

// User-Agent for dictionary API.
const USER_AGENT = 'Unity-Brain/1.0 (https://github.com/unity-ai-lab)';

/**
 * Wiktionary senses for one word, in the SAME shape the wrapper produces:
 * `{ partOfSpeech, definition, example, synonyms }`.
 *
 * ⛔ Returns `[]` on any failure and never throws — the union that calls this
 * must degrade to the wrapper's senses, never to zero senses.
 *
 * ⚠ Three things about this payload that a naive reader gets wrong:
 *   1. It carries EVERY language on the page (`en, sq, nl, fr, es, sv, other`
 *      observed on one word). Only `en` is ours.
 *   2. Definition text is HTML — `<a rel="mw:WikiLink" …>`, `<span
 *      class="usage-label-sense">`, `<b>` — and must be stripped before it
 *      reaches the teach lane, or she binds markup as vocabulary.
 *   3. The API emits `definition: ""` for header rows. Those are dropped;
 *      an empty definition is not a sense.
 */
async function _fetchWiktionarySenses(word, timeoutMs) {
  const strip = (s) => String(s || '')
    .replace(/<[^>]*>/g, ' ')          // tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const out = [];
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(2000, timeoutMs || 3000));
  try {
    const res = await fetch(WIKT_BASE + encodeURIComponent(word), {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    });
    if (!res.ok) return out;                       // 404 here is not fatal — the wrapper may still know it
    const j = await res.json();
    const en = Array.isArray(j && j.en) ? j.en : [];
    for (const group of en) {
      const pos = String((group && group.partOfSpeech) || '').toLowerCase();
      for (const d of (group && group.definitions) || []) {
        const def = strip(d && d.definition);
        if (!def) continue;                        // header rows arrive as ""
        const ex = Array.isArray(d && d.examples) && d.examples.length ? strip(d.examples[0]) : '';
        out.push({ partOfSpeech: pos, definition: def, example: ex, synonyms: [] });
      }
    }
  } catch { /* fall through to [] */ }
  finally { clearTimeout(t); }
  return out;
}

/* ⭐⭐ WHAT NO DICTIONARY CARRIES — asked ONLY when every dictionary above came
 * up empty (2026-11-24). Operator: "most of these look like typos or in need of
 * an urban dixtionary search as they are alot of proper words but not just found
 * in a normalk dictionary" · "urban dictionary not grad gated as like ive told u a
 * 5 year old learns every word in the book before turning 6 from theri parents".
 * LEARNING is never gated (what she SAYS is, elsewhere). No account, no key.
 *   • Wikipedia's page summary — holidays, names, places, things (Diwali,
 *     William): its opening sentences, as one noun sense.
 *   • Urban Dictionary — slang and everything else people say: the top-voted
 *     senses, with their examples.
 * Same sense shape as every other source, tagged with where it came from. */
const WIKI_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const URBAN_DEFINE = 'https://api.urbandictionary.com/v0/define?term=';

async function _fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(2000, timeoutMs || 4000));
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
  finally { clearTimeout(t); }
}

async function _fetchWikipediaSenses(phrase, timeoutMs) {
  const j = await _fetchJson(WIKI_SUMMARY + encodeURIComponent(String(phrase).trim().replace(/\s+/g, '_')), timeoutMs);
  if (!j || j.type !== 'standard' || typeof j.extract !== 'string' || !j.extract.trim()) return [];
  // the opening two sentences — what the thing IS, not its whole article
  const s = j.extract.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  return s ? [{ partOfSpeech: 'noun', definition: s, example: '', synonyms: [], source: 'wikipedia' }] : [];
}

async function _fetchUrbanSenses(word, timeoutMs) {
  const j = await _fetchJson(URBAN_DEFINE + encodeURIComponent(String(word).trim()), timeoutMs);
  const list = Array.isArray(j && j.list) ? j.list : [];
  const clean = (s) => String(s || '').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
  return list
    .filter((d) => d && clean(d.definition))
    .sort((a, b) => ((b.thumbs_up | 0) - (b.thumbs_down | 0)) - ((a.thumbs_up | 0) - (a.thumbs_down | 0)))
    .slice(0, 3)
    .map((d) => ({ partOfSpeech: '', definition: clean(d.definition).slice(0, 400), example: clean(d.example).slice(0, 200), synonyms: [], source: 'urban' }));
}

// A run-together phrase ("chinesenewyear", "grayhair" — her vocabulary list
// carries some) split back into real words by WordNet's own lemma index, fewest
// words first. No list: a word is a word because the dictionary has it.
// ⚠ Every part must be a real word of 3+ letters — a 2-letter floor split
// "recieve" (a typo) into "re ci eve". Returns the readings to try: fewest
// words and most words (≤ 5), so "chinesenewyear" is asked as both
// "chinese newyear" and "chinese new year".
function _splitRunTogether(s) {
  const w = String(s || '').toLowerCase();
  if (!/^[a-z]{6,}$/.test(w)) return [];
  const memo = new Map();
  const known = (x) => {
    if (memo.has(x)) return memo.get(x);
    let k = false; try { const r = offlineDict.lookup(x); k = !!(r && r.length); } catch { k = false; }
    memo.set(x, k); return k;
  };
  // every reading into 2–4 real words of 3+ letters (bounded), fewest pieces
  // first — WordNet holds no multi-word phrases, so the source that knows the
  // phrase (Wikipedia) decides which reading is the real one
  const out = [];
  const walk = (i, parts) => {
    if (out.length >= 12) return;
    if (i === w.length) { if (parts.length >= 2) out.push(parts.join(' ')); return; }
    if (parts.length >= 4) return;
    for (let j = w.length; j >= i + 3; j--) { const p = w.slice(i, j); if (known(p)) walk(j, parts.concat(p)); }
  };
  walk(0, []);
  return out.sort((a, b) => a.split(' ').length - b.split(' ').length).slice(0, 6);
}

// A TYPO OF A REAL WORD (operator: "need to check for possible typos alot of
// training data its sure to have a typo or two or more"). Every single edit —
// one letter dropped, added, changed, or two neighbours swapped — checked
// against WordNet; when real words sit one edit away, the one with the most
// senses (the commonest) is what the typo meant. ⛔ A MISSPELLING IS NOT A WORD
// (operator: "cnat just write definitions to words that truelty are just wrong
// spellings") — it is never given a definition; it is recorded as a typo of
// the real word, and the harvest teaches the real word in its place. Asked only
// after Wikipedia (so a name is not "corrected" — william ≠ williams). Short
// words (3–4 letters) count ONLY a neighbour swap — the typo short words
// actually get ("teh" → the, "adn" → and); any other edit of a 4-letter string
// lands on some real word by chance (didn → din). "Real" = WordNet OR her own
// dictionary cache — WordNet carries no function words, so "the" is only there.
function _typoOf(word) {
  const w = String(word || '').toLowerCase();
  if (!/^[a-z]{3,}$/.test(w)) return null;
  const senses = (x) => {
    let n = 0;
    try { const r = offlineDict.lookup(x); n = (r && r.length) || 0; } catch { n = 0; }
    if (!n) { const e = cache.get(x); if (e && !e.error) n = Array.isArray(e.definitions) ? e.definitions.length : 1; }
    return n;
  };
  const AB = 'abcdefghijklmnopqrstuvwxyz';
  const short = w.length < 5;
  const cands = new Set();
  for (let i = 0; i <= w.length; i++) {
    const a = w.slice(0, i), b = w.slice(i);
    if (b.length > 1) cands.add(a + b[1] + b[0] + b.slice(2));               // swap
    if (short) continue;
    if (b) cands.add(a + b.slice(1));                                       // drop
    for (const c of AB) { cands.add(a + c + b); if (b) cands.add(a + c + b.slice(1)); }   // add / change
  }
  cands.delete(w);
  let best = null, bestN = 0;
  for (const c of cands) { const n = senses(c); if (n > bestN) { bestN = n; best = c; } }
  return best;
}

// Senses for a word every dictionary missed: Wikipedia, then a typo of a real
// word, then Urban Dictionary — trying the run-together split first when the
// word is one.
// A typo found here is RECORDED (not defined) so the harvest can teach the real
// word; see typoOf() below.
const _typoMap = new Map();

// A dictionary's OWN verdict that a spelling is wrong: Wiktionary files "recieve"
// with the single sense "Misspelling of receive." — that is not a definition to
// learn, it is the typo answer. When EVERY sense says so, the word is recorded
// as a typo of the word named and gets no definition.
// Every sense must say so — a real word that ALSO carries a misspelling sense
// ("loose": "Misspelling of lose", among real ones) keeps its definitions.
// Language-code entries ("ISO 639-3 language code for …") are not a meaning
// and are set aside; "obsolete form of" points at the real word too.
function _misspellingOf(defs) {
  if (!Array.isArray(defs) || !defs.length) return null;
  let target = null, judged = 0;
  for (const d of defs) {
    const t = String((d && d.definition) || '');
    if (/^\s*ISO\s+639/i.test(t)) continue;
    const m = /^\s*(?:(?:common|deliberate|obsolete|rare|nonstandard)\s+)?(?:misspelling|form|spelling)\s+of\s+(?:the\s+)?([a-z][a-z' -]*?)\s*[,.;]?(?:\s+for\s+.*)?\s*$/i.exec(t);
    if (!m) return null;
    target = target || m[1].trim().toLowerCase();
    judged++;
  }
  return judged ? target : null;
}

async function _fetchBeyondDictionaries(word, timeoutMs) {
  const phrases = _splitRunTogether(word);
  const asked = phrases.concat([word]);
  for (const q of asked) {
    const wiki = await _fetchWikipediaSenses(q, timeoutMs);
    if (wiki.length) return wiki;
  }
  if (!phrases.length) {
    const meant = _typoOf(word);
    if (meant) { _typoMap.set(String(word).toLowerCase(), meant); return []; }   // a misspelling: no definition
  }
  for (const q of asked) {
    const urb = await _fetchUrbanSenses(q, timeoutMs);
    if (urb.length) return urb;
  }
  return [];
}

// A `noDef` decided before these sources existed gets ONE more look through
// them; one decided after is final. Bumped whenever a source is added.
const NODEF_GEN = 2;

// LRU cache. Insertion order = recency in Map. On hit,
// delete + re-set so the entry moves to the "newest" end. On overflow,
// pop the oldest entry (first key).
// CAP RAISED 10k -> 100k (env-tunable): the K walk alone filled 9,906 of
// the old 10,000 slots — ONE conversation past that and her oldest
// definitions started evicting (and vanishing from the disk cache on the
// next flush). Her vocabulary grows without limits by LAW; the definition
// ledger must too. ~100k entries ≈ tens of MB JSON — trivial next to the
// 158MB weight saves. DREAM_DEF_CACHE_CAP overrides.
const CACHE_MAX = Number(process.env.DREAM_DEF_CACHE_CAP) > 0
  ? Number(process.env.DREAM_DEF_CACHE_CAP) : 100000;
const cache = new Map();
const inFlight = new Map();

// Error entries get a TYPE-AWARE TTL; positive entries persist forever.
// FC.11 — the per-word vocab pre-teach was re-stalling on the same ~67 words
// every 5 min (a 429 rate-limit death-spiral): error cached → 5-min TTL expires
// → re-fetch → 429 again → re-cache → loop (197 stalls in a single K walk,
// 5-12s each, blocking the walk from ever reaching cell content training).
// Now the TTL depends on WHY it failed:
//   • no-definition (404 / empty / no-defs) → PERMANENT — the word genuinely
//     has no dictionary entry; never waste another API call on it.
//   • 429 rate-limited → long backoff — don't re-hammer the free-tier API
//     mid-walk; the cached miss rides for hours.
//   • transient (network / parse / 5xx) → moderate retry window.
// Net: a fresh restart loads the cached errors and the vocab seed becomes
// cache-only (minutes, not hours), and it scales to every grade K→PhD instead
// of paying a per-word API tax 45k times.
const ERROR_TTL_MS = 60 * 60 * 1000;            // 60 min — transient (network/parse/5xx)
const RATE_LIMIT_TTL_MS = 6 * 60 * 60 * 1000;   // 6 h — 429 rate-limited
// no-definition (noDef) entries are PERMANENT (TTL Infinity).
function _errorEntryExpired(entry) {
  if (!entry || !entry.error || !entry.fetchedAt) return false;
  // permanent — except a miss decided before the newest source existed, which
  // gets exactly one more look (NODEF_GEN)
  if (entry.noDef) return (entry.noDefGen | 0) < NODEF_GEN;
  // A rate-limit cached before a 429 also asked the other sources never asked
  // them — it gets one fresh look now instead of waiting out its 6 hours.
  if (entry.rateLimited && !entry.askedOthers) return true;
  const ttl = entry.rateLimited ? RATE_LIMIT_TTL_MS : ERROR_TTL_MS;
  return (Date.now() - entry.fetchedAt) > ttl;
}

// Concurrency cap on prefetch + back-off on 429.
//
// 114.19es.13 — gentler against the free-tier API. Captured 2026-05-07
// overnight run had 89% miss rate (255/2247 cached) at PREFETCH_CONCURRENCY=20
// + RATE_LIMIT_BACKOFF_MS=1000. dictionaryapi.dev rate-limits aggressively
// under load: 20 parallel hits a 429, we back off for 1s, then 20 MORE
// parallel hit another 429 immediately. Net: most batches lose to rate
// limiting. Dropping to 5 parallel + 5s backoff means fewer 429s overall
// + more time for the API's per-IP rate window to drain between batches.
// Pairs with es.5 disk cache for compounding benefit — first run gets
// better coverage, persistent cache means subsequent runs barely touch
// the API at all.
const PREFETCH_CONCURRENCY = 5;
const RATE_LIMIT_BACKOFF_MS = 5000; // pause 5s after a 429 before next batch

const _normalize = (w) => (typeof w === 'string' ? w.toLowerCase().trim() : '');

function _cachePut(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  // Evict oldest if over cap.
  while (cache.size > CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

/* ⛔⛔ A PERMANENT `noDef` IS A CLAIM ABOUT ONE SOURCE'S COVERAGE, NOT ABOUT THE
 * WORD — and it was shadowing the peer source that can answer.
 *
 * `getDefinition` consults the offline dictionary before the network, but it
 * reads the CACHE before both. So any word cached `noDef` before the offline
 * lane existed is answered "no definition" forever and **the offline dictionary
 * is never consulted for it again** — `noDef` has TTL Infinity by design, and the
 * disk cache restores it on every boot.
 *
 * ⭐ MEASURED on the local 4,135-entry cache: 195 permanent `noDef` entries, of
 * which **80 are words the loaded WordNet can define right now** — `touch` (27
 * senses), `tight` (16), `net` (12), `hell`, `american`, `australia`, `egypt`,
 * `greece`, `rome`, and the four the flag surfaced (`be` 14, `look` 14, `every` 2,
 * `america` 2), all stamped 2026-06-20, months before the offline lane shipped.
 * Those are content words she could never have learned a definition for.
 *
 * ⚠ THE 404 ITSELF WAS NEVER WRONG. This file already records that `is` and `was`
 * both 404 while `are`, `were` and `been` return 200 — the API's coverage is
 * genuinely uneven. What was wrong is treating one source's 404 as the answer
 * when the module's own header calls offline **"a peer source, not a fallback"**.
 *
 * ⭐ IT HEALS RATHER THAN PURGES. On a `noDef` hit the offline dictionary gets
 * asked; if it answers, the entry is REPLACED with the positive one, so the word
 * is fixed permanently, the disk cache repairs itself on the next flush, and no
 * stored data has to be migrated or deleted. The branch is self-extinguishing —
 * a healed entry is no longer an error and never re-enters it — and it is the
 * CHOKEPOINT: `getDefinition`, `getDefinitionSync`, `getDefinitionsSync`,
 * `getDefinitions` and `lookupStatus` all read through here, so none of them can
 * disagree about whether a word is definable.
 */
function _rescueNoDefFromOffline(key, entry) {
  if (!entry || !entry.error || !entry.noDef) return null;
  let offline = null;
  try { offline = offlineDict.lookup(key); } catch { return null; }
  if (!offline || !offline.length) return null;
  const definitions = offline.map((d) => ({
    partOfSpeech: d.partOfSpeech || '',
    definition: d.definition,
    example: '',
    synonyms: [],
    source: 'wordnet-offline',
  }));
  const healed = { definition: definitions[0].definition, definitions, fetchedAt: Date.now(), healedFromNoDef: true };
  _cachePut(key, healed);
  return healed;
}

function _cacheGet(key) {
  let entry = cache.get(key);
  if (!entry) return null;
  // A misspelling cached as "defined" before the typo rule existed is turned
  // into what it is — a typo of the real word, no definition — on read.
  if (!entry.error && Array.isArray(entry.definitions)) {
    const m = _misspellingOf(entry.definitions);
    if (m) {
      _typoMap.set(key, m);
      entry = { error: true, fetchedAt: Date.now(), noDef: true, noDefGen: NODEF_GEN, typoOf: m };
      _cachePut(key, entry);
      return entry;
    }
  }
  const healed = _rescueNoDefFromOffline(key, entry);
  if (healed) return healed;
  // error entries expire after a type-aware TTL (FC.11 — no-def permanent,
  // 429 long backoff, transient moderate retry).
  if (_errorEntryExpired(entry)) {
    cache.delete(key);
    return null;
  }
  // Re-insert to move to LRU "newest".
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

/**
 * Fetch a word's first short definition string. Returns null on
 * 404 / network failure / timeout / fetch unavailable.
 *
 * @param {string} word
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<string|null>}
 */
async function getDefinition(word, opts = {}) {
  const key = _normalize(word);
  if (!key) return null;
  const cached = _cacheGet(key);
  if (cached) return cached.error ? null : cached.definition;

  /* ⭐⭐ THE OFFLINE DICTIONARY ANSWERS FIRST, AND THAT ORDER IS THE FIX.
   *
   * ⛔ On 2026-09-05 `api.dictionaryapi.dev` returned `000` on every word for a
   * whole day and the walk sat 17.5 hours on one kindergarten cell with
   * `passedCellsTotal 0` — she could not bind a definition, so vocabulary never
   * landed and the gate could never clear. A lane with one source and no SLA is
   * a lane that stops the walk when that source blinks.
   *
   * ⭐ MEASURED on her real K vocabulary: 96.1% answered (2,134/2,221), 13,139
   * senses, 57 ms for the ENTIRE vocabulary, in-process, no network. Putting it
   * FIRST means ~96% of lookups never touch the wire at all — which also makes
   * the FC.11 429 death-spiral unreachable for the common case, instead of
   * merely bounded.
   *
   * ⚠ IT IS A PEER SOURCE, NOT A FALLBACK. The banned "last-resort single-def"
   * arm taught ONE sense per word; this returns MULTI-SENSE entries with part of
   * speech — the same shape the network path builds below, averaging 6.1 senses
   * per word. Same capability, different transport.
   *
   * ⚠ AND IT RUNS BEFORE THE `HAS_FETCH` GUARD ON PURPOSE: a runtime with no
   * fetch used to mean no definitions at all. Now it means no NETWORK
   * definitions.
   */
  // ⛔⛔ THE OFFLINE LANE USED TO `return` HERE, AND THAT MADE IT THE ONLY
  // SOURCE FOR MOST OF THE LANGUAGE. WordNet holds 155,467 lemmas, so for
  // almost any ordinary word it answered first and the network never ran —
  // which meant NO examples (it has none), NO synonyms, and none of the
  // Wiktionary senses. Measured after the union shipped and before this
  // change: `headphones` still returned 1 sense with 0 examples, and
  // `heterochromia` returned 0 even though Wiktionary answers it HTTP 200.
  // The union looked installed and reached almost nothing.
  //
  // ⭐ This file's own header already calls offline **"a peer source, not a
  // fallback"** — and a peer CONTRIBUTES, it does not short-circuit. Its
  // senses are now collected and merged with the network's, deduped with
  // everything else. The no-fetch runtime it was built for still gets exactly
  // what it got before: see the `!HAS_FETCH` return below, which now serves
  // these senses instead of nothing.
  let offlineDefs = [];
  try {
    const offline = offlineDict.lookup(key);
    if (offline && offline.length) {
      offlineDefs = offline.map((d) => ({
        partOfSpeech: d.partOfSpeech || '',
        definition: d.definition,
        example: '',
        synonyms: [],
        source: 'wordnet-offline',
      }));
    }
  } catch (err) {
    /* Never let the offline lane break the network lane. It is an addition. */
    console.warn('[OfflineDict] lookup threw (non-fatal, falling through to the API):', (err && err.message) || err);
  }

  // No fetch in this runtime → the offline senses ARE the answer, exactly as
  // before this block became a contributor rather than a short-circuit.
  if (!HAS_FETCH) {
    if (offlineDefs.length) {
      _cachePut(key, { definition: offlineDefs[0].definition, definitions: offlineDefs, fetchedAt: Date.now() });
      return offlineDefs[0].definition;
    }
    return null;
  }
  if (inFlight.has(key)) return inFlight.get(key);

  const timeoutMs = opts.timeoutMs ?? 5000;
  const promise = (async () => {
    let timer = null;
    let zombieGuard = null;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), timeoutMs);
      // 114.19er.1 — defense-in-depth zombie-clear. AbortController +
      // res.json() race below should handle every documented hang path,
      // but if an unknown deadlock holds the (async () => {})() chain
      // open past 2× timeoutMs the in-flight Map keeps a dead promise
      // and every subsequent caller for this key inherits the zombie.
      // This timer force-removes the in-flight entry so the next call
      // starts a fresh fetch instead of awaiting a corpse.
      zombieGuard = setTimeout(() => {
        if (inFlight.get(key) === promise) {
          inFlight.delete(key);
          _cachePut(key, { error: true, fetchedAt: Date.now(), zombieClear: true });
        }
      }, timeoutMs * 2);

      const res = await fetch(API_BASE + encodeURIComponent(key), {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      });
      // ⛔ A 429 IS ONE SOURCE SAYING "SLOW DOWN", NOT "NO SUCH WORD" — and it
      // used to return here, so Wiktionary, Wikipedia and Urban Dictionary were
      // never asked: 189 kindergarten words (androcles, gelert, whittington…)
      // waited 6 hours undefined while Wikipedia had pages for them. It now
      // falls through to the same other-sources path as any wrapper failure;
      // only if NONE of them answers is it cached rate-limited (prefetch still
      // backs off on that flag).
      const _rl = res.status === 429;
      if (!res.ok) {
        // ⛔⛔ A 404 FROM THE WRAPPER IS NOT "NO SUCH WORD", AND TREATING IT AS
        // ONE IS WHAT KEPT HER VOCABULARY CORPORATE. Every word the operator
        // named — fuck, shit, cunt, piss, penis, vagina, tampon, puberty,
        // horny, feces — 404s here and is PRESENT in Wiktionary with real
        // depth (shit 29 senses, fuck 26 across five parts of speech). This
        // branch used to cache `noDef: true` on that 404, which is a PERMANENT
        // marker: the word was never asked for again, on any later walk.
        // So the single most important place to ask the unfiltered source is
        // exactly where the filtered one says the word does not exist.
        // ⛔⛔ THIS FIRES ON **ANY** WRAPPER FAILURE, NOT JUST 404 — AND THE
        // 404-ONLY VERSION WAS CAUGHT BY MEASUREMENT, NOT BY READING.
        // With the gate at `=== 404`, a test run returned 0 senses for shit,
        // cunt, tampon, puberty, heterochromia and headphones, which looked
        // like Wiktionary rate-limiting me again. It was not: Wiktionary
        // answered **HTTP 200 with 29 senses for `shit`** in the same second
        // the wrapper answered **HTTP 530**. The consult never ran because 530
        // is not 404.
        // dictionaryapi.dev returned 530 repeatedly across this session, so
        // this is its normal failure mode, not a freak. Wiktionary's
        // availability is INDEPENDENT of the wrapper's — gating the healthy
        // source on the sick one's particular status code means a wrapper
        // outage silently teaches her nothing for every word in that window.
        if (!res.ok) {
          let wikt = [];
          try { wikt = await _fetchWiktionarySenses(key, timeoutMs); } catch { wikt = []; }
          // Offline senses ride here too — a wrapper 404 says nothing about
          // what WordNet or Wiktionary know, and dropping the peer's senses
          // on the wrapper's say-so is the same mistake one level down.
          const union = [];
          const seenU = new Set();
          for (const d of [...offlineDefs, ...wikt]) {
            const k = String(d.definition || '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
            if (!k || seenU.has(k)) continue;
            seenU.add(k); union.push(d);
          }
          const _miss = _misspellingOf(union);
          if (_miss) {
            _typoMap.set(key, _miss);
            _cachePut(key, { error: true, fetchedAt: Date.now(), noDef: true, noDefGen: NODEF_GEN, typoOf: _miss });
            return null;
          }
          if (union.length > 0) {
            _cachePut(key, { definition: union[0].definition, definitions: union, fetchedAt: Date.now() });
            return union;
          }
          // every dictionary is empty — what no dictionary carries
          let beyond = [];
          try { beyond = await _fetchBeyondDictionaries(key, timeoutMs); } catch { beyond = []; }
          if (beyond.length > 0) {
            _cachePut(key, { definition: beyond[0].definition, definitions: beyond, fetchedAt: Date.now() });
            return beyond[0].definition;
          }
        }
        // 404 with nothing from any source = genuinely no entry → permanent at
        // this source generation. Other non-OK (5xx) = transient.
        if (_rl) { _cachePut(key, { error: true, fetchedAt: Date.now(), rateLimited: true, askedOthers: true }); return null; }
        _cachePut(key, { error: true, fetchedAt: Date.now(), noDef: res.status === 404, noDefGen: NODEF_GEN, typoOf: _typoMap.get(key) || undefined });
        return null;
      }
      // 114.19er.1 — wrap res.json() in its own timeout race. AbortController
      // covers fetch() initiation but doesn't reliably abort streaming
      // body parsing across all Node versions. If the server holds the
      // connection open mid-stream (intermittent dictionaryapi.dev
      // behavior under load), res.json() can hang past the controller
      // timeout. Race against a Promise-rejection backstop so this path
      // fails fast instead of dragging the curriculum into deadlock.
      const jsonTimeoutMs = Math.max(2000, timeoutMs);
      const data = await Promise.race([
        res.json(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`json-parse-timeout-${jsonTimeoutMs}ms`)), jsonTimeoutMs)),
      ]);
      if (!Array.isArray(data) || data.length === 0) {
        // OK response but no data → ask what no dictionary carries, else no entry
        let beyond = [];
        try { beyond = await _fetchBeyondDictionaries(key, timeoutMs); } catch { beyond = []; }
        if (beyond.length > 0) {
          _cachePut(key, { definition: beyond[0].definition, definitions: beyond, fetchedAt: Date.now() });
          return beyond[0].definition;
        }
        _cachePut(key, { error: true, fetchedAt: Date.now(), noDef: true, noDefGen: NODEF_GEN, typoOf: _typoMap.get(key) || undefined });
        return null;
      }
      const definitions = [];
      // ⛔⛔ WIKTIONARY IS QUERIED ALONGSIDE, AND IT IS NOT A FALLBACK.
      // Operator: "we need like a urban dictions for her to look up all the
      // names that normal dictrionaries wont.. ie she needs full human
      // definitions so all slang cusses and obsinitys and organ and
      // excreations names… lets not limit her by only having words that
      // corporate dictionarieds have".
      //
      // MEASURED, 10 words the wrapper returns nothing useful for:
      //   fuck 26 defs (Verb/Noun/Interjection/Adverb/Particle) · shit 29 ·
      //   cunt 14 · piss 10 · vagina 7 · horny 7 · tampon 4 · puberty 4 ·
      //   penis 3 · feces 2            -> 10 of 10 present, with real depth
      //
      // ⭐ `dictionaryapi.dev` is itself a WRAPPER over Wiktionary, so going to
      // the source is not a second opinion — it is the same dictionary with
      // the editorial filtering removed. That is why this is a UNION and not a
      // fallback: neither query is the lesser path, and the file already sets
      // this precedent with the hyphenated-compound retry ("a second query for
      // the same capability, not a lesser one"). Senses are merged and deduped
      // on normalised text, so a word both sources know gains nothing spurious.
      //
      // ⚠ Wiktionary returns HTML and EVERY language on the page. Both are
      // handled: `en` only, tags stripped, empty definitions dropped (the API
      // emits `""` for header rows). Anatomy, excretion and obscenity are
      // ordinary entries there — no separate "adult" source is needed, and a
      // user-submitted one (Urban Dictionary) would have traded this coverage
      // for joke definitions she would have to unlearn.
      for (const d of offlineDefs) definitions.push(d);   // the peer source, merged not skipped
      try {
        const wikt = await _fetchWiktionarySenses(key, timeoutMs);
        for (const d of wikt) definitions.push(d);
      } catch { /* the union degrades to the wrapper's senses, never to zero */ }
      for (const entry of data) {
        const meanings = entry.meanings || [];
        for (const meaning of meanings) {
          const defs = meaning.definitions || [];
          for (const d of defs) {
            if (d.definition) {
              definitions.push({
                partOfSpeech: meaning.partOfSpeech || '',
                definition: d.definition,
                example: d.example || '',
                synonyms: Array.isArray(d.synonyms) ? d.synonyms : [],
              });
            }
          }
        }
      }
      // Dedup the union on normalised definition text. Both sources derive
      // from Wiktionary, so a word they both know returns overlapping senses;
      // binding the same sentence twice would weight that sense for no reason.
      // ⚠ Normalise punctuation and case only — two senses that differ by a
      // single word are DIFFERENT senses and must both survive.
      if (definitions.length > 1) {
        const seenDef = new Set();
        const merged = [];
        for (const d of definitions) {
          const k = String(d.definition || '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
          if (!k || seenDef.has(k)) continue;
          seenDef.add(k);
          merged.push(d);
        }
        definitions.length = 0;
        for (const d of merged) definitions.push(d);
      }
      if (definitions.length === 0) {
        // Parsed OK but zero usable definitions → ask what no dictionary
        // carries, else no entry at this source generation.
        let beyond = [];
        try { beyond = await _fetchBeyondDictionaries(key, timeoutMs); } catch { beyond = []; }
        if (beyond.length > 0) {
          _cachePut(key, { definition: beyond[0].definition, definitions: beyond, fetchedAt: Date.now() });
          return beyond[0].definition;
        }
        _cachePut(key, { error: true, fetchedAt: Date.now(), noDef: true, noDefGen: NODEF_GEN, typoOf: _typoMap.get(key) || undefined });
        return null;
      }
      const _miss2 = _misspellingOf(definitions);
      if (_miss2) {
        _typoMap.set(key, _miss2);
        _cachePut(key, { error: true, fetchedAt: Date.now(), noDef: true, noDefGen: NODEF_GEN, typoOf: _miss2 });
        return null;
      }
      const first = definitions[0].definition;
      _cachePut(key, { definition: first, definitions, fetchedAt: Date.now() });
      return first;
    } catch (err) {
      _cachePut(key, { error: true, fetchedAt: Date.now() });
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      if (zombieGuard) clearTimeout(zombieGuard);
      inFlight.delete(key);
    }
  })();
  /* ⛔⛔ EVERY LOOKUP SETTLES. A lookup asks up to five sources in sequence
     (wrapper, Wiktionary, Wikipedia, Urban Dictionary), each reading its body
     with `res.json()`, and an abort does not reliably end a stalled body read.
     One lookup that never settled held `prefetch`'s `Promise.allSettled`
     open, and with it the whole walk: science/kindergarten sat 11h40m on one
     300-word vocabulary chunk with the teach ledger frozen. The zombie guard
     above only cleared the in-flight map — callers already awaiting the
     promise waited forever. This deadline answers THEM: the word resolves as
     a transient miss (retried on its TTL like any network blip) and the walk
     moves on. Bound = every source's own timeout in sequence, plus slack. */
  const _hardMs = timeoutMs * 6;
  const guarded = new Promise((resolve) => {
    const dl = setTimeout(() => {
      if (inFlight.get(key) === guarded) inFlight.delete(key);
      if (!_cacheGet(key)) _cachePut(key, { error: true, fetchedAt: Date.now(), deadline: true });
      console.warn(`[DefinitionService] lookup "${key}" did not settle in ${_hardMs}ms — resolved as a transient miss so the walk continues.`);
      resolve(null);
    }, _hardMs);
    promise.then((v) => { clearTimeout(dl); resolve(v); }, () => { clearTimeout(dl); resolve(null); });
  });
  inFlight.set(key, guarded);
  return guarded;
}

/**
 * Synchronous cache read. Returns the definition string when cached,
 * null otherwise. NEVER triggers a network request.
 *
 * @param {string} word
 * @returns {string|null}
 */
function getDefinitionSync(word) {
  if (!HAS_FETCH) return null;
  const key = _normalize(word);
  if (!key) return null;
  const cached = _cacheGet(key);
  if (!cached || cached.error) return null;
  return cached.definition;
}

/**
 * The FULL cached definitions (with partOfSpeech), cache-only:
 * never a network call, so a tick-path caller (the eye-subject picker's
 * adjective probe) stays microseconds. Returns null on any miss — an unknown
 * word is simply not treated as a modifier.
 */
function getDefinitionsSync(word) {
  const key = _normalize(word);
  if (!key) return null;
  const cached = _cacheGet(key);
  if (!cached || cached.error || !Array.isArray(cached.definitions)) return null;
  return cached.definitions;
}

/**
 * Fetch the full definition array for a word.
 * Returns [] on failure or when no definitions exist.
 *
 * @param {string} word
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<Array>}
 */
async function getDefinitions(word, opts = {}) {
  /* ⛔ The `HAS_FETCH` early-return used to live here too, which meant a runtime
     without fetch got NO definitions from any source. getDefinition() now
     answers from the offline dictionary before it ever looks at the network, so
     gating this on fetch would discard 96% of the vocabulary for no reason. */
  const key = _normalize(word);
  if (!key) return [];
  const cached = _cacheGet(key);
  if (cached) return cached.error ? [] : (cached.definitions || []);
  await getDefinition(key, opts);
  const fresh = _cacheGet(key);
  return fresh && !fresh.error ? (fresh.definitions || []) : [];
}

/**
 *  — Prefetch with concurrency cap + 429 back-off.
 *
 * Chunks the word list into batches of PREFETCH_CONCURRENCY (20). For
 * each batch, fires all in parallel and awaits completion. If ANY
 * response in a batch hit 429, sleep RATE_LIMIT_BACKOFF_MS before
 * starting the next batch.
 *
 * Returns when all words have been processed (or skipped due to cache).
 *
 * @param {string[]} words
 * @param {{timeoutMs?: number, onProgress?: (p: {chunk: number, chunks: number, words: number, total: number, prefetched: number, rateLimited: number}) => void}} [opts]
 *   `timeoutMs` bounds ONE fetch, never the call. `onProgress` fires after each
 *   chunk settles and is a report, not a bound — see the loop comment.
 * @returns {Promise<{prefetched: number, alreadyCached: number, rateLimited: number, chunks: number, networkWords: number}>}
 */
async function prefetch(words, opts = {}) {
  if (!HAS_FETCH || !Array.isArray(words) || words.length === 0) {
    return { prefetched: 0, alreadyCached: 0, rateLimited: 0 };
  }
  let prefetched = 0;
  let alreadyCached = 0;
  let rateLimited = 0;
  // Build the to-fetch list (filter cached / in-flight).
  const todo = [];
  for (const w of words) {
    const key = _normalize(w);
    if (!key) continue;
    /* ⛔⛔ THIS READ THE RAW MAP AND BYPASSED THE CHOKEPOINT, WHICH IS THE WHOLE
       REASON THE OFFLINE HEAL DID NOTHING FOR THE VOCABULARY PASS.
       `cache.has(key)` is true for a POISONED permanent-miss entry, so the word
       was counted "already cached", `getDefinition` was never called, `_cacheGet`
       was never called — and the offline dictionary that can define the word was
       never consulted. This is the path the pre-cell pass runs over all ~2,247
       grade words, so it is the path that mattered most, and it was the one
       reader left outside the chokepoint after `lookupStatus` was brought in.
       ⚠ MEASURED CONSEQUENCE: the live flag read `DEF-MISS ×96 · 94 distinct`
       with `be`, `look`, `america` and `every` still named — all four of which
       resolve correctly through `getDefinition` on a fresh cache.
       ⭐ AND IT FIXES A SECOND BUG IN THE SAME LINE. `cache.has` is true for an
       EXPIRED transient error too, so a word whose lookup failed on a network
       blip was skipped here FOREVER rather than retried when its TTL lapsed —
       silently converting "the service was down for a moment" into "this word is
       never fetched again". `_cacheGet` deletes an expired error and returns
       null, so the word correctly re-enters the fetch list. */
    const _hit = _cacheGet(key);
    if (_hit) { alreadyCached += 1; continue; }
    if (inFlight.has(key)) { alreadyCached += 1; continue; }
    todo.push(key);
  }
  /* ⛔⛔ THIS LOOP RAN SILENT AND THAT IS WHAT MADE IT LOOK LIKE A HANG.
   *
   * The caller `await`s this whole function. `opts.timeoutMs` bounds each
   * INDIVIDUAL fetch and nothing bounds the total, so a large word list is one
   * await lasting as long as `ceil(todo/PREFETCH_CONCURRENCY)` sequential
   * chunks — plus a RATE_LIMIT_BACKOFF_MS sleep after every chunk that hit a
   * 429. Measured on the real `ela/kindergarten` list: 17,873 distinct content
   * words, 12,585 answered offline in 1.5 s, **5,288 to the network = 1,058
   * sequential chunks**, which is ~5 min at best and hours if the API throttles.
   *
   * ⭐ Nothing above is a bug — that IS the work, and killing it would delete
   * the anchoring the prose training depends on. **The bug was that it reported
   * nothing while doing it**, so from outside it is indistinguishable from a
   * wedge. This is the third time this project has mistaken an unbounded-but-
   * working await for a hang.
   *
   * ⚠ `onProgress` is therefore a REPORTING channel, deliberately not a bound.
   * It never throws into the loop and it never stops it.
   */
  const _onProgress = (typeof opts.onProgress === 'function') ? opts.onProgress : null;
  const _chunks = Math.ceil(todo.length / PREFETCH_CONCURRENCY);
  let _chunk = 0;
  // Process in chunks of PREFETCH_CONCURRENCY.
  for (let i = 0; i < todo.length; i += PREFETCH_CONCURRENCY) {
    const batch = todo.slice(i, i + PREFETCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(w => getDefinition(w, opts)));
    let batchHit429 = false;
    for (const r of results) {
      // After fetch settles, check cache for rateLimited flag set inside getDefinition.
    }
    for (const k of batch) {
      // Through the chokepoint for the same reason as the skip-check above: a
      // word healed from the offline dictionary during this batch must count as
      // PREFETCHED, not vanish from both tallies because the raw entry still
      // looked like an error at the moment it was read.
      const c = _cacheGet(k);
      if (c && c.rateLimited) { rateLimited += 1; batchHit429 = true; }
      else if (c && !c.error) prefetched += 1;
    }
    /* Report BEFORE the back-off sleep, so a throttled run shows the chunk it
       reached rather than going quiet for another 5 s at the worst moment. */
    _chunk += 1;
    if (_onProgress) {
      try { _onProgress({ chunk: _chunk, chunks: _chunks, words: Math.min(i + batch.length, todo.length), total: todo.length, prefetched, rateLimited }); } catch { /* a reporter must never break the work it reports on */ }
    }
    if (batchHit429) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
    }
  }
  return { prefetched, alreadyCached, rateLimited, chunks: _chunks, networkWords: todo.length };
}

/**
 * Cache statistics.
 */
function getCacheStats() {
  let hits = 0;
  let errs = 0;
  let rateLimited = 0;
  for (const v of cache.values()) {
    if (v.rateLimited) rateLimited += 1;
    else if (v.error) errs += 1;
    else hits += 1;
  }
  return { size: cache.size, hits, errs, rateLimited, inFlight: inFlight.size, capacity: CACHE_MAX, fetchAvailable: HAS_FETCH };
}

/**
 * Drop the in-memory cache (test/debug only).
 */
function clearCache() {
  cache.clear();
  inFlight.clear();
}

// 114.19es.5 — Persistent disk cache enabled BY DEFAULT.
//
// Earlier this lived behind the DREAM_DEFINITION_CACHE_FILE env flag,
// which meant fresh deployments always paid the cold-start cost +
// re-walked dictionaryapi.dev's rate-limit gauntlet on every boot.
// Captured 2026-05-07 overnight run had 89% miss rate (255/2247 cached)
// — most words returned null defs because the API rate-limited the
// per-word lookups after the prefetch concurrency batch.
//
// Default now: write cache to `<server>/definition-cache.json`
// (alongside brain-weights.bin, which sits in the same dir). Operator
// can still override via env var. Set DREAM_DEFINITION_CACHE_FILE=''
// (empty string) to explicitly disable.
//
// After 2-3 cold runs, cache approaches 100% K_VOCAB coverage and
// per-word lookups hit cache instantly → zero rate-limit pressure on
// subsequent boots.
const fs = require('fs');
const path = require('path');
// ⛔ BUMP THIS WHENEVER THE SHAPE **OR THE SOURCES** OF A DEFINITION RECORD
// CHANGE. A cached record is a statement about what the pipeline could produce
// at the moment it was written; when the pipeline grows, every older record is
// an understatement, and this cache is persistent ACROSS FRESH WALKS, so an
// un-bumped version silently teaches the old vocabulary forever.
//   v1 — dictionaryapi.dev only, first definition's words, no examples
//   v2 — 2026-10-19: union with Wiktionary (the wrapper 404s on anatomy,
//        excretion and obscenity), examples and synonyms bound, per-definition
//        word cap 8 -> 24
const CACHE_VERSION = 2;
const DEFAULT_DISK_CACHE_PATH = path.join(__dirname, 'definition-cache.json');
const _envCachePath = process.env.DREAM_DEFINITION_CACHE_FILE;
const DISK_CACHE_PATH = (typeof _envCachePath === 'string')
  ? (_envCachePath.length > 0 ? path.resolve(_envCachePath) : null)
  : DEFAULT_DISK_CACHE_PATH;

if (DISK_CACHE_PATH) {
  try {
    if (fs.existsSync(DISK_CACHE_PATH)) {
      const raw = fs.readFileSync(DISK_CACHE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      // ⛔⛔ A CACHE WRITTEN BY AN OLDER DEFINITION PIPELINE WOULD HAVE HIDDEN
      // THE WHOLE 2026-10-19 FIX, SILENTLY, ON EXACTLY THE WORDS THAT MATTER.
      // The disk cache is deliberately persistent and deliberately excluded
      // from the fresh-walk wipe, so a fresh walk REUSES it. Measured on the
      // v1 file sitting here when the union shipped:
      //     16,779 word entries · mean 5.23 senses · only 18% carried ANY
      //     example · 27% held a single sense
      //     1,539 cached `noDef` — a PERMANENT "no such word" marker — and
      //     they included real words the wrapper merely 404'd on
      //     (heterochromia, graphological, predication, collectivity)
      // Every one of those would have been served from disk and never
      // re-fetched, so the examples, the synonyms, the raised word cap and the
      // Wiktionary senses would have reached almost nothing. The walk would
      // have looked fixed and taught the old vocabulary.
      //
      // ⭐ The version is the fix, not a one-time `rm`: a manual delete has to
      // be remembered by a human every time the pipeline changes, and it will
      // not be. Entries written under a lower CACHE_VERSION are discarded on
      // load and re-fetched. **Bump CACHE_VERSION whenever the shape or the
      // SOURCES of a definition record change** — adding Wiktionary to the
      // union is exactly such a change.
      const _fileVersion = Number(parsed && parsed.version) || 0;
      if (_fileVersion < CACHE_VERSION) {
        console.log(`[definition-service] disk cache DISCARDED — written by pipeline v${_fileVersion}, this build is v${CACHE_VERSION}. `
          + `${Object.keys((parsed && parsed.entries) || {}).length} entries will be re-fetched against the current sources `
          + `(the union with Wiktionary, examples and synonyms). This is deliberate: serving them would teach the old vocabulary.`);
      } else if (parsed && typeof parsed === 'object' && parsed.entries) {
        let restored = 0;
        for (const [key, entry] of Object.entries(parsed.entries)) {
          if (entry && typeof entry === 'object') {
            // Skip stale error entries (type-aware TTL — FC.11).
            if (_errorEntryExpired(entry)) continue;
            cache.set(key, entry);
            restored += 1;
          }
        }
        console.log(`[definition-service] disk cache loaded: ${restored} entries from ${DISK_CACHE_PATH}`);
      }
    }
  } catch (err) {
    console.warn(`[definition-service] disk cache load failed: ${err?.message || err}`);
  }
}

function flushCacheToDisk() {
  if (!DISK_CACHE_PATH) return false;
  try {
    const entries = {};
    for (const [k, v] of cache.entries()) entries[k] = v;
    const payload = { savedAt: Date.now(), version: CACHE_VERSION, entries };
    fs.writeFileSync(DISK_CACHE_PATH, JSON.stringify(payload), 'utf8');
    return true;
  } catch (err) {
    console.warn(`[definition-service] disk cache flush failed: ${err?.message || err}`);
    return false;
  }
}

/**
 * Definitive lookup-status for a word AFTER a getDefinition call ran.
 * Distinguishes "the API positively said 404 — this word has no dictionary
 * entry" from "the lookup failed for another reason" (429 rate-limit,
 * network, timeout, 5xx). Callers that DELETE data based on absence of a
 * definition (the fused-word dictionary purge) must require 'noDef' —
 * treating a rate-limited miss as no-definition purged real words
 * ("prevent", "password", "overflow") on the 2026-07-05 local run.
 * Returns: 'hasDef' | 'noDef' | 'error' | 'unknown' (never looked up /
 * cache evicted).
 */
function lookupStatus(word) {
  const key = _normalize(word);
  if (!key) return 'unknown';
  // ⚠ THROUGH `_cacheGet`, NOT `cache.get`. This read the raw Map, so it was the
  // one status answer that could still say `noDef` about a word the offline
  // dictionary defines — and DEF-MISS keys on exactly this value, which is how
  // four definable words got reported as having no dictionary entry. Reading
  // through the chokepoint also means an EXPIRED transient error now reports
  // `unknown` instead of `error`; every caller treats both as transient
  // (`_why !== 'noDef'`), so nothing downstream changes behaviour.
  // A misspelling is never "a word with no entry": it is the real word, taught.
  if (typoOf(word)) return 'typo';
  const entry = _cacheGet(key);
  if (!entry) return 'unknown';
  if (!entry.error) return 'hasDef';
  return entry.noDef ? 'noDef' : 'error';
}

// The real word a misspelling stands for, or null. Never a definition — the
// harvest swaps the real word in so she learns it, not the typo.
function typoOf(word) {
  const key = _normalize(word);
  if (!key) return null;
  const e = cache.get(key);
  return (e && e.typoOf) || _typoMap.get(key) || null;
}

// ⭐ IS THIS A REAL WORD — answered by a DICTIONARY, never an encyclopedia.
// Wikipedia and Urban Dictionary answer for names, places, typos and slang
// spellings ("alquife", "effeminancy"), so "has a definition" stopped meaning
// "is a word" once they joined the union, and she spoke and drew strings that
// are not words. A word is real when WordNet holds it, or a cached sense came
// from a dictionary (any source other than wikipedia/urban). A known typo is
// never real. Cache-only, never fetches.
function isRealWord(word) {
  const key = _normalize(word);
  if (!key) return false;
  if (typoOf(word)) return false;
  try { const off = offlineDict.lookup(key); if (off && off.length) return true; } catch { /* fall to cache */ }
  const e = cache.get(key);
  if (!e || e.error || !Array.isArray(e.definitions)) return false;
  return e.definitions.some((d) => d && d.source !== 'wikipedia' && d.source !== 'urban');
}

module.exports = {
  isRealWord,
  typoOf,
  getDefinition,
  getDefinitionSync,
  getDefinitionsSync,
  getDefinitions,
  prefetch,
  getCacheStats,
  clearCache,
  flushCacheToDisk,
  lookupStatus,
  // exposed for testing / brain boot smoke test
  _hasFetch: () => HAS_FETCH,
};
