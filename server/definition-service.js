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

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

// fetch availability check at module load.
const HAS_FETCH = typeof globalThis.fetch === 'function';
if (!HAS_FETCH) {
  console.warn('[definition-service] WARN: globalThis.fetch unavailable (Node < 18?). Dictionary API disabled — definition lookups return null. Upgrade Node to ≥18 for live dictionary.');
}

// User-Agent for dictionary API.
const USER_AGENT = 'Unity-Brain/1.0 (https://github.com/unity-ai-lab)';

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
  if (entry.noDef) return false;                // permanent — never re-fetch
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

function _cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
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
  if (!HAS_FETCH) return null;
  const key = _normalize(word);
  if (!key) return null;
  const cached = _cacheGet(key);
  if (cached) return cached.error ? null : cached.definition;
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
      // propagate 429 status so prefetch can back off.
      if (res.status === 429) {
        _cachePut(key, { error: true, fetchedAt: Date.now(), rateLimited: true });
        return null;
      }
      if (!res.ok) {
        // 404 = word has no dictionary entry → permanent (noDef, never
        // re-fetch). Other non-OK (5xx) = transient → normal retry window.
        _cachePut(key, { error: true, fetchedAt: Date.now(), noDef: res.status === 404 });
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
        // OK response but no data → word has no entry → permanent (noDef).
        _cachePut(key, { error: true, fetchedAt: Date.now(), noDef: true });
        return null;
      }
      const definitions = [];
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
      if (definitions.length === 0) {
        // Parsed OK but zero usable definitions → no entry → permanent (noDef).
        _cachePut(key, { error: true, fetchedAt: Date.now(), noDef: true });
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
  inFlight.set(key, promise);
  return promise;
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
 * Fetch the full definition array for a word.
 * Returns [] on failure or when no definitions exist.
 *
 * @param {string} word
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<Array>}
 */
async function getDefinitions(word, opts = {}) {
  if (!HAS_FETCH) return [];
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
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<{prefetched: number, alreadyCached: number, rateLimited: number}>}
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
    if (cache.has(key)) { alreadyCached += 1; continue; }
    if (inFlight.has(key)) { alreadyCached += 1; continue; }
    todo.push(key);
  }
  // Process in chunks of PREFETCH_CONCURRENCY.
  for (let i = 0; i < todo.length; i += PREFETCH_CONCURRENCY) {
    const batch = todo.slice(i, i + PREFETCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(w => getDefinition(w, opts)));
    let batchHit429 = false;
    for (const r of results) {
      // After fetch settles, check cache for rateLimited flag set inside getDefinition.
    }
    for (const k of batch) {
      const c = cache.get(k);
      if (c && c.rateLimited) { rateLimited += 1; batchHit429 = true; }
      else if (c && !c.error) prefetched += 1;
    }
    if (batchHit429) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
    }
  }
  return { prefetched, alreadyCached, rateLimited };
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
      if (parsed && typeof parsed === 'object' && parsed.entries) {
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
    const payload = { savedAt: Date.now(), version: 1, entries };
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
 * definition (the fused-token dictionary purge) must require 'noDef' —
 * treating a rate-limited miss as no-definition purged real words
 * ("prevent", "password", "overflow") on the 2026-07-05 local run.
 * Returns: 'hasDef' | 'noDef' | 'error' | 'unknown' (never looked up /
 * cache evicted).
 */
function lookupStatus(word) {
  const key = _normalize(word);
  if (!key) return 'unknown';
  const entry = cache.get(key);
  if (!entry) return 'unknown';
  if (!entry.error) return 'hasDef';
  return entry.noDef ? 'noDef' : 'error';
}

module.exports = {
  getDefinition,
  getDefinitionSync,
  getDefinitions,
  prefetch,
  getCacheStats,
  clearCache,
  flushCacheToDisk,
  lookupStatus,
  // exposed for testing / brain boot smoke test
  _hasFetch: () => HAS_FETCH,
};
