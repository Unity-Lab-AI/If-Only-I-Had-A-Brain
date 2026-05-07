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
const CACHE_MAX = 10000;
const cache = new Map();
const inFlight = new Map();

// Error entries get TTL; positive entries persist forever.
const ERROR_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Concurrency cap on prefetch + back-off on 429.
const PREFETCH_CONCURRENCY = 20;
const RATE_LIMIT_BACKOFF_MS = 1000; // pause 1s after a 429 before next batch

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
  // error entries expire after TTL.
  if (entry.error && entry.fetchedAt && (Date.now() - entry.fetchedAt) > ERROR_TTL_MS) {
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
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), timeoutMs);
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
        _cachePut(key, { error: true, fetchedAt: Date.now() });
        return null;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        _cachePut(key, { error: true, fetchedAt: Date.now() });
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
        _cachePut(key, { error: true, fetchedAt: Date.now() });
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

// Persistent disk cache (behind feature flag).
// Set DREAM_DEFINITION_CACHE_FILE=path/to/cache.json to enable. Loads
// at module init; caller invokes `flushCacheToDisk()` periodically or
// on shutdown to persist. Cache survives brain restart → no cold-start
// re-fetch of K_VOCABULARY (saves ~1 min per restart).
const fs = require('fs');
const path = require('path');
const DISK_CACHE_PATH = process.env.DREAM_DEFINITION_CACHE_FILE
  ? path.resolve(process.env.DREAM_DEFINITION_CACHE_FILE)
  : null;

if (DISK_CACHE_PATH) {
  try {
    if (fs.existsSync(DISK_CACHE_PATH)) {
      const raw = fs.readFileSync(DISK_CACHE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.entries) {
        let restored = 0;
        for (const [key, entry] of Object.entries(parsed.entries)) {
          if (entry && typeof entry === 'object') {
            // Skip stale error entries (TTL expired).
            if (entry.error && entry.fetchedAt && (Date.now() - entry.fetchedAt) > ERROR_TTL_MS) continue;
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

module.exports = {
  getDefinition,
  getDefinitionSync,
  getDefinitions,
  prefetch,
  getCacheStats,
  clearCache,
  flushCacheToDisk,
  // exposed for testing / brain boot smoke test
  _hasFetch: () => HAS_FETCH,
};
