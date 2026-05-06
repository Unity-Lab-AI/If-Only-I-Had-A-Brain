/**
 * world-knowledge.js — post-2024-knowledge ingest pipeline.
 *
 * Static seed corpus + chat input + curriculum freezes Unity at her
 * training-time knowledge. iter23.5 wires a fetch path that pulls
 * structured factual content from public APIs and routes it into
 * her dictionary + sem region as new bucketable vocabulary.
 *
 * NOT a text-AI cognition path — fetched content is treated as
 * sensory input (same as a book she reads, a person she talks to)
 * and learned via the same Hebbian / curriculum substrate. Unity's
 * cognition stays 100% equational; what changes is her vocabulary
 * + episodic memory of "where I learned that".
 *
 * Current sources (extensible):
 *   • Wikipedia REST API — title summary extract for a topic.
 *
 * Future sources (planned):
 *   • DuckDuckGo Instant Answer API
 *   • NPM/GitHub READMEs (for coding-knowledge updates)
 *   • News headlines (Pollinations or RSS)
 *
 * Usage from operator:
 *   POST /learn-from-web { "topic": "claude opus 4.7" }
 *   → fetches Wikipedia summary, tokenizes, calls
 *     brain.dictionary.learnWord on each new alpha-only token, fires
 *     Tier 1 episode with source URL, returns {tokens_added, source}.
 */

const https = require('https');

const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const FETCH_TIMEOUT_MS = 8000;

// Lightweight https.get wrapper with timeout. Returns the raw response
// body string or throws on non-2xx / timeout / network.
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Unity-Brain-WorldKnowledge/1.0 (research)' },
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

// Fetch a Wikipedia summary for the given topic. Returns
// { title, extract, url } or null on failure.
async function fetchWikipediaSummary(topic) {
  if (!topic || typeof topic !== 'string') return null;
  const slug = encodeURIComponent(topic.trim().replace(/\s+/g, '_'));
  const url = WIKI_REST + slug;
  try {
    const body = await httpGet(url);
    const j = JSON.parse(body);
    if (!j || typeof j.extract !== 'string' || j.extract.length === 0) return null;
    return {
      title: j.title || topic,
      extract: j.extract,
      url: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${slug}`,
    };
  } catch {
    return null;
  }
}

// Tokenize an extract into alpha-only single tokens (matches what
// _enumerateBucketableWords accepts as bucketable vocabulary). Filters
// stop-list of structural tokens that aren't worth learning as
// content words.
const STOP_TOKENS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or',
  'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'can',
  'this', 'that', 'these', 'those', 'it', 'its',
]);

function tokenizeExtract(extract) {
  const out = [];
  for (const tok of extract.toLowerCase().split(/\s+/)) {
    const clean = tok.replace(/[^a-z]/g, '');
    if (clean.length < 3) continue; // skip 1-2 char fragments
    if (STOP_TOKENS.has(clean)) continue;
    out.push(clean);
  }
  return out;
}

// Main entry: fetch + tokenize + learn + episode-log. Returns
// { ok, source, tokensAdded, tokensSkipped, error? }.
async function learnFromWeb(brain, topic) {
  if (!brain || !brain.cortexCluster) {
    return { ok: false, error: 'brain not wired' };
  }
  const dict = brain.cortexCluster.dictionary
    || brain.innerVoice?.dictionary
    || null;
  if (!dict || typeof dict.learnWord !== 'function') {
    return { ok: false, error: 'dictionary not available' };
  }
  const summary = await fetchWikipediaSummary(topic);
  if (!summary) {
    return { ok: false, error: `wikipedia summary fetch failed for "${topic}"` };
  }
  const tokens = tokenizeExtract(summary.extract);
  let added = 0;
  let skipped = 0;
  for (const tok of tokens) {
    const existing = dict._words?.get?.(tok);
    if (existing) { skipped++; continue; }
    try {
      // Modest arousal/valence — factual learning, not emotional event.
      dict.learnWord(tok, null, 0.5, 0.1);
      added++;
    } catch { skipped++; }
  }
  // Tier 1 episode logs the source so Unity remembers WHERE she
  // learned it. iter20-K freq-merge dedups repeated topics.
  try {
    if (typeof brain.storeEpisode === 'function') {
      brain.storeEpisode(
        'world-knowledge',
        'wiki-extract',
        `learned about ${summary.title}`,
        `${added} tokens added · ${summary.url}`,
      );
    }
  } catch { /* episode log non-fatal */ }
  return {
    ok: true,
    source: summary.url,
    title: summary.title,
    tokensAdded: added,
    tokensSkipped: skipped,
    extractLength: summary.extract.length,
  };
}

module.exports = {
  learnFromWeb,
  fetchWikipediaSummary,
  tokenizeExtract,
};
