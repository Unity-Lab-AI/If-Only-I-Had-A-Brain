/**
 * embeddings.js — Semantic Word Embeddings for the Brain
 *
 * T14.0 (2026-04-14) — full GloVe 300d, no vocabulary cap, real disk loader.
 *
 * Maps words to dense 300-dimensional vector representations. Similar words
 * have similar vectors — "calculator" and "compute" activate overlapping
 * cortex neurons because they're close in embedding space.
 *
 * Source: Stanford GloVe (Wikipedia + Gigaword, 6B tokens, 400K vocab,
 * 300d). The server reads `corpora/glove.6B.300d.txt` from disk at boot
 * (~480 MB Float32 in memory, ~1 GB raw text). The browser receives a
 * server-precomputed corpus-token subset via `/api/glove-subset.json`
 * to avoid downloading the full file.
 *
 * Three modes:
 * 1. Pre-trained: Load GloVe from local disk (server) or server subset
 *    endpoint (browser). 300d, no vocabulary cap.
 * 2. Learned: Online refinement deltas from live conversation context.
 * 3. Hybrid: Pre-trained base + learned refinements.
 *
 * The embedding vector maps to cortex neurons (Wernicke's area / language
 * sub-region per T14.4). Each dimension activates a specific cortex neuron
 * group via mapToCortex / cortexToEmbedding.
 *
 * Pre-T14.0 the dim was 50 (capped, hash fallback only). T14.0 lifted both
 * the dim and the vocabulary cap. The 50d ceiling was the structural limit
 * on fine semantic discrimination between closely-related concepts — 300d
 * removes it and matches the Stanford GloVe standard vocabulary.
 */

// T14.0 — full 300-dim GloVe. Was 50d in T13. The 50d ceiling was the
// structural limit on fine semantic resolution — at 50 dimensions, many
// close semantic neighbors (cat/kitten, sad/sorrowful, run/jog) had cosine
// similarity too compressed to distinguish reliably. 300d is the standard
// Stanford GloVe dimension (Pennington, Socher, Manning 2014) and gives
// roughly 6× the discriminating power between fine semantic neighbors.
const EMBED_DIM = 300;

// T14.0 — local file paths and remote URLs for GloVe 300d. The server
// reads from disk (corpora/glove.6B.300d.txt — operator must download
// from Stanford NLP per the README); the browser falls through to the
// server's static file path or the remote URLs as fallback.
//
// File: glove.6B.300d.txt — Stanford GloVe trained on Wikipedia + Gigaword,
// 6B tokens, 400K vocab, 300d vectors. ~1.0 GB raw text, ~480 MB if
// loaded into Float32 in memory at full vocab. Cap is 0 (no cap) — the
// foundation lift loads the entire vocabulary on the server. Browser-side
// uses a corpus-token subset hosted by the server (T14.0 RemoteBrain path).
const GLOVE_LOCAL_PATH = 'corpora/glove.6B.300d.txt';
// T14.23.2 — URL order trimmed. The Stanford NLP URL is CORS-blocked
// from all browser origins (no Access-Control-Allow-Origin header),
// and the HuggingFace URL returns 404 because the resolve path is
// wrong. Both used to hang for ~90s each before erroring out, eating
// 3+ minutes of boot time. Now only the localhost URL is attempted.
// Operators who want full GloVe download the file manually and place
// it at corpora/glove.6B.300d.txt — the server mounts /corpora/
// statically so the local URL hits it at runtime. Missing file
// produces a fast 404 which falls through to hash embeddings in
// under a second. External CDN fallback re-added if/when a CORS-
// permitting mirror is found.
const GLOVE_URLS = [
  'http://localhost:7525/corpora/glove.6B.300d.txt',
];

export class SemanticEmbeddings {
  constructor() {
    this._embeddings = new Map(); // word → Float32Array(50)
    this._dim = EMBED_DIM;
    this._loaded = false;
    this._loadingPromise = null;

    // Learned refinements — contextual shifts from brain experience
    this._refinements = new Map(); // word → Float32Array(50) delta

    // Unknown word fallback — fastText-style subword embedding (see _subwordEmbedding)
  }

  /**
   * T14.0 — Load full GloVe 300d vocabulary (~400K words). Server reads
   * from local disk (`corpora/glove.6B.300d.txt`); browser falls through
   * to the server's static file mount or remote CDN as fallback. Hash
   * embeddings remain as a last-resort floor when no GloVe is reachable,
   * but the foundation lift assumes GloVe is present in production.
   *
   * No vocabulary cap. The full 400k-word file loads if reachable.
   * Memory at 400k × 300d × 4 bytes = ~480 MB on the server, which is
   * acceptable for the brain server hardware tier. Browser receives a
   * server-precomputed corpus-token subset via `/api/glove-subset.json`
   * (much smaller, only the words actually seen in the loaded corpora).
   */
  async loadPreTrained() {
    if (this._loadingPromise) return this._loadingPromise;
    this._loadingPromise = this._doLoad();
    return this._loadingPromise;
  }

  async _doLoad() {
    // Detect runtime: Node has process + require, browser has fetch + window
    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined';
    try {
      console.log(`[Embeddings] Loading GloVe ${EMBED_DIM}d vectors (full vocab, no cap)...`);
      let text = null;

      if (isNode) {
        // Server path — stream from local disk LINE-BY-LINE.
        //
        // The old code did `fs.readFileSync(p, 'utf8')` which loads
        // the entire 990 MB file as a single JS string. V8's max
        // string length on 64-bit is ~1 GB; the 990 MB file is right
        // at the edge. Then `text.split('\n')` creates 400k substrings
        // + a 400k-element array, doubling memory. Boot logs showed
        // readFileSync either throwing "Invalid string length" or
        // completing but `split('\n')` OOM'ing silently, which caused
        // the fallback "GloVe not found" message despite the file being
        // present at 1,037,962,819 bytes / 400,000 lines.
        //
        // New path: `readline.createInterface` over a read stream, parse
        // each line as it arrives, build the Map incrementally. Peak
        // memory = Map + current line buffer, not the whole file.
        try {
          const fs = await import('fs');
          const path = await import('path');
          const readline = await import('readline');
          // Try several plausible paths relative to cwd / module location
          const candidates = [
            GLOVE_LOCAL_PATH,
            path.join(process.cwd(), GLOVE_LOCAL_PATH),
            path.join(process.cwd(), '..', GLOVE_LOCAL_PATH),
            path.join(process.cwd(), 'server', GLOVE_LOCAL_PATH),
          ];
          let foundPath = null;
          for (const p of candidates) {
            if (fs.existsSync(p)) { foundPath = p; break; }
          }
          if (!foundPath) {
            throw new Error(`GloVe ${EMBED_DIM}d not found at any of: ${candidates.join(', ')} — download glove.6B.300d.txt from https://nlp.stanford.edu/data/glove.6B.zip and place at corpora/glove.6B.300d.txt`);
          }
          console.log(`[Embeddings] Reading ${foundPath} via streaming readline...`);
          const stream = fs.createReadStream(foundPath, { encoding: 'utf8' });
          const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
          let streamCount = 0;
          for await (const line of rl) {
            if (!line) continue;
            const parts = line.split(' ');
            if (parts.length !== EMBED_DIM + 1) continue;
            const word = parts[0].toLowerCase();
            const vec = new Float32Array(EMBED_DIM);
            for (let i = 0; i < EMBED_DIM; i++) {
              vec[i] = parseFloat(parts[i + 1]) || 0;
            }
            // L2-normalize inline so the parse-after-read branch below
            // is skipped for the Node streaming path.
            let norm = 0;
            for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
            norm = Math.sqrt(norm) || 1;
            for (let i = 0; i < EMBED_DIM; i++) vec[i] /= norm;
            this._embeddings.set(word, vec);
            streamCount++;
            if (streamCount % 50000 === 0) {
              console.log(`[Embeddings]   streamed ${streamCount.toLocaleString()} vectors...`);
            }
          }
          this._loaded = true;
          console.log(`[Embeddings] Loaded ${streamCount.toLocaleString()} word vectors (${EMBED_DIM}d) via stream`);
          return streamCount;
        } catch (err) {
          if (err.message.includes('not found')) throw err;
          throw new Error(`Server GloVe load failed: ${err.message}`);
        }
      } else {
        // Browser path — try the configured URLs in order.
        //
        // T14.23.2 (2026-04-14) — AbortController with a 3-second
        // per-URL timeout. The old code used bare `await fetch(url)`
        // with no timeout, so a CORS-blocked or hanging CDN URL
        // could hang for minutes before erroring out. At the operator's
        // Stanford NLP URL (CORS-blocked) and HuggingFace URL
        // (returns 404 but slowly), the sequential fetches were
        // eating 5+ minutes of boot time with zero CPU activity
        // while the browser waited on network sockets. Now each
        // fetch has a hard 3s cap so even 3 failing URLs fall
        // through to hash embeddings in under 10 seconds.
        let response = null;
        for (const url of GLOVE_URLS) {
          let controller = null;
          let timer = null;
          try {
            controller = new AbortController();
            timer = setTimeout(() => controller.abort(), 3000);
            response = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (response.ok) break;
            response = null;
          } catch (err) {
            if (timer) clearTimeout(timer);
            console.log(`[Embeddings] GloVe fetch aborted/failed at ${url}: ${err?.name || err?.message || err}`);
            continue;
          }
        }
        if (!response) throw new Error('All GloVe URLs failed in browser path');
        // Also cap the response-body read so a slow trickle can't
        // hang the boot even if the server technically returned 200.
        const bodyController = new AbortController();
        const bodyTimer = setTimeout(() => bodyController.abort(), 30000);
        try {
          text = await response.text();
          clearTimeout(bodyTimer);
        } catch (err) {
          clearTimeout(bodyTimer);
          throw new Error(`GloVe body read failed: ${err?.message || err}`);
        }
      }

      // Parse the GloVe text — one word per line, space-separated:
      // <word> <v1> <v2> ... <vN>
      const lines = text.split('\n');
      let count = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        // Use a fast split for performance — GloVe lines have no embedded
        // multi-space tokens
        const parts = line.split(' ');
        if (parts.length !== EMBED_DIM + 1) continue;

        const word = parts[0].toLowerCase();
        const vec = new Float32Array(EMBED_DIM);
        for (let i = 0; i < EMBED_DIM; i++) {
          vec[i] = parseFloat(parts[i + 1]) || 0;
        }

        // L2-normalize so cosine similarity is in [-1, 1]
        let norm = 0;
        for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < EMBED_DIM; i++) vec[i] /= norm;

        this._embeddings.set(word, vec);
        count++;
        // T14.0 — no vocabulary cap. The full file loads. If memory is
        // the constraint, the operator runs Unity on a hardware tier that
        // can hold it (Phase 0 admin resource configuration handles the
        // tier picker).
      }

      this._loaded = true;
      console.log(`[Embeddings] Loaded ${count.toLocaleString()} word vectors (${EMBED_DIM}d)`);
      return count;
    } catch (err) {
      // Missing GloVe is no longer a degraded state — the default
      // fallback is fastText-style subword n-gram embeddings, not a
      // random hash. GloVe is an optional upgrade, not a requirement.
      console.log(`[Embeddings] GloVe ${EMBED_DIM}d not found — using built-in fastText-style subword embeddings (no download needed).`);
      console.log('[Embeddings] For real GloVe 6B.300d upgrade, place glove.6B.300d.txt at corpora/glove.6B.300d.txt. Optional.');
      this._loaded = false;
      return 0;
    }
  }

  /**
   * T14.0 — Returns the subset of the loaded GloVe vocabulary that
   * matches a given token set. Used by the server to pre-compute a
   * `/api/glove-subset.json` payload for the browser to fetch instead
   * of pulling the full 480 MB file.
   */
  getSubsetForTokens(tokens) {
    const subset = {};
    for (const tok of tokens) {
      const w = tok.toLowerCase().trim();
      const v = this._embeddings.get(w);
      if (v) subset[w] = Array.from(v);
    }
    return subset;
  }

  /**
   * T14.0 — Browser-side bulk load of a server-provided subset.
   * Replaces _doLoad's path when running in a browser that's connecting
   * to a server — the server precomputes the corpus-token subset and
   * the browser fetches it as a single small JSON file.
   */
  loadSubset(subset) {
    let count = 0;
    for (const [word, arr] of Object.entries(subset)) {
      if (!Array.isArray(arr) || arr.length !== EMBED_DIM) continue;
      this._embeddings.set(word, new Float32Array(arr));
      count++;
    }
    if (count > 0) this._loaded = true;
    console.log(`[Embeddings] Loaded ${count.toLocaleString()} word vectors from server subset (${EMBED_DIM}d)`);
    return count;
  }

  /**
   * Get embedding for a word.
   * Returns pre-trained + learned refinement if available.
   * Falls back to hash-based embedding for unknown words.
   *
   * @param {string} word
   * @returns {Float32Array} — EMBED_DIM-dimensional vector (300d after T14.0)
   */
  getEmbedding(word) {
    word = word.toLowerCase().trim();

    // Check pre-trained
    let vec = this._embeddings.get(word);

    if (!vec) {
      // Subword-based fallback for unknown words (fastText-style n-gram sum).
      vec = this._subwordEmbedding(word);
    }

    // Apply learned refinement
    const delta = this._refinements.get(word);
    if (delta) {
      const refined = new Float32Array(EMBED_DIM);
      for (let i = 0; i < EMBED_DIM; i++) {
        refined[i] = vec[i] + delta[i];
      }
      // Re-normalize
      let norm = 0;
      for (let i = 0; i < EMBED_DIM; i++) norm += refined[i] * refined[i];
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < EMBED_DIM; i++) refined[i] /= norm;
      return refined;
    }

    return vec;
  }

  /**
   * Get embedding for a sentence (average of word vectors).
   * @param {string} text
   * @returns {Float32Array}
   */
  getSentenceEmbedding(text) {
    const words = text.toLowerCase().replace(/[^a-z' -]/g, '').split(/\s+/).filter(w => w.length >= 2);
    if (words.length === 0) return new Float32Array(EMBED_DIM);

    const avg = new Float32Array(EMBED_DIM);
    for (const word of words) {
      const vec = this.getEmbedding(word);
      for (let i = 0; i < EMBED_DIM; i++) avg[i] += vec[i];
    }

    // Normalize
    let norm = 0;
    for (let i = 0; i < EMBED_DIM; i++) {
      avg[i] /= words.length;
      norm += avg[i] * avg[i];
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < EMBED_DIM; i++) avg[i] /= norm;

    return avg;
  }

  /**
   * Map embedding vector to cortex neuron currents.
   * The 50d vector maps to cortex Wernicke's area (language neurons).
   * Each dimension drives a group of cortex neurons.
   *
   * @param {Float32Array} embedding — 50d vector
   * @param {number} cortexSize — total cortex neurons
   * @param {number} langStart — start index of Wernicke's area
   * @returns {Float64Array} — current injection for cortex
   */
  mapToCortex(embedding, cortexSize = 300, langStart = 150) {
    const langSize = cortexSize - langStart;
    const currents = new Float64Array(cortexSize);

    // Map each embedding dimension to a group of cortex neurons
    const groupSize = Math.max(1, Math.floor(langSize / EMBED_DIM));

    for (let d = 0; d < EMBED_DIM; d++) {
      const value = embedding[d] * 8; // scale to current amplitude
      const startNeuron = langStart + d * groupSize;

      for (let n = 0; n < groupSize; n++) {
        const idx = startNeuron + n;
        if (idx < cortexSize) {
          currents[idx] = value;
        }
      }
    }

    return currents;
  }

  /**
   * REVERSE MAPPING — read semantic state back OUT of cortex neural activation.
   *
   * This is the mathematical inverse of `mapToCortex`. It's the read-side
   * of the semantic input/output loop:
   *
   *   word → getEmbedding → mapToCortex → inject as neural currents
   *        → cortex LIF dynamics + modulators (emotional gate, Ψ, etc)
   *        → lastSpikes / voltages
   *        → cortexToEmbedding                             ← THIS METHOD
   *        → 50-dim semantic vector representing "what Unity's cortex
   *          currently holds in Wernicke's area" in GloVe space
   *        → cosine against candidate word embeddings
   *        → pick the word that semantically matches the cortex state
   *
   * The read uses the SAME group-per-dimension layout as the write, so
   * the round-trip preserves the semantic structure (after neural
   * transformation through LIF integration + modulators). Each group of
   * groupSize neurons averages to ONE embedding dimension value.
   *
   * Output is L2-normalized so cosine similarity against word embeddings
   * (which are all L2-normalized by GloVe loader) produces values in
   * [-1, 1] that reflect semantic alignment.
   *
   * @param {Float64Array|Uint8Array} spikes — cluster.lastSpikes
   * @param {Float64Array} voltages — cluster voltages (for sub-threshold info)
   * @param {number} cortexSize — total cortex neuron count (default 300)
   * @param {number} langStart — first neuron of the language region (default 150)
   * @returns {Float64Array} — 50d L2-normalized semantic pattern
   */
  cortexToEmbedding(spikes, voltages, cortexSize = 300, langStart = 150) {
    const langSize = cortexSize - langStart;
    const groupSize = Math.max(1, Math.floor(langSize / EMBED_DIM));
    const out = new Float64Array(EMBED_DIM);

    for (let d = 0; d < EMBED_DIM; d++) {
      const startNeuron = langStart + d * groupSize;
      let sum = 0;
      let count = 0;
      for (let n = 0; n < groupSize; n++) {
        const idx = startNeuron + n;
        if (idx >= cortexSize) break;
        // Spike-dominant readout — a firing neuron contributes 1.0,
        // a subthreshold neuron contributes its normalized voltage.
        // This mirrors the write-side scaling (value * 8) so the
        // round-trip signal preserves sign and relative magnitude.
        if (spikes && spikes[idx]) {
          sum += 1.0;
        } else if (voltages) {
          sum += (voltages[idx] + 70) / 20; // LIF voltage norm, same as cluster.getOutput
        }
        count++;
      }
      out[d] = count > 0 ? sum / count : 0;
    }

    // L2 normalize so cosine against GloVe vectors works
    let norm = 0;
    for (let i = 0; i < EMBED_DIM; i++) norm += out[i] * out[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < EMBED_DIM; i++) out[i] /= norm;

    return out;
  }

  /**
   * Cosine similarity between two embeddings.
   * @returns {number} — -1 to 1
   */
  similarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < EMBED_DIM; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA * normB) || 1);
  }

  /**
   * Find the k most similar words to a given embedding.
   * @param {Float32Array} embedding
   * @param {number} k
   * @returns {Array<{word: string, similarity: number}>}
   */
  findSimilar(embedding, k = 5) {
    const results = [];

    for (const [word, vec] of this._embeddings) {
      const sim = this.similarity(embedding, vec);
      results.push({ word, similarity: sim });
    }

    // Also check learned refinements
    for (const [word] of this._refinements) {
      if (!this._embeddings.has(word)) {
        const vec = this.getEmbedding(word);
        results.push({ word, similarity: this.similarity(embedding, vec) });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, k);
  }

  /**
   * Learn from context — refine a word's embedding based on brain state.
   * The brain's cortex activation at the time of hearing/speaking a word
   * shifts the embedding toward the current context.
   *
   * @param {string} word
   * @param {Float32Array} contextEmbedding — average of surrounding words
   * @param {number} lr — learning rate (0.01 = gentle shift)
   */
  refineFromContext(word, contextEmbedding, lr = 0.01) {
    word = word.toLowerCase().trim();
    if (!this._refinements.has(word)) {
      this._refinements.set(word, new Float32Array(EMBED_DIM));
    }

    const delta = this._refinements.get(word);
    const base = this._embeddings.get(word) || this._subwordEmbedding(word);

    for (let i = 0; i < EMBED_DIM; i++) {
      // Move toward context
      delta[i] += lr * (contextEmbedding[i] - (base[i] + delta[i]));
    }
  }

  /**
   * Subword-based embedding for unknown words (fastText-style).
   * Sum of n-gram hash contributions (N = 3..5) over boundary-marked
   * word `<word>`. Deterministic — same word always produces same
   * vector. Words that share character n-grams share feature dims so
   * "cat" ↔ "cats" cosine > "cat" ↔ "xyz" cosine, giving the cortex
   * usable structure even without real GloVe vectors.
   */
  _subwordEmbedding(word) {
    // T14.24 Session 99 — fastText-style subword embedding as the
    // GloVe-free default. Previously this was a single-hash-per-word
    // function that produced fully-uncorrelated vectors for every
    // word, meaning "cat" and "cats" were as orthogonal as "cat" and
    // "xyzabc". No semantic structure AT ALL. That's why ELA-K READ
    // stayed at 8% chance level on the operator's live runs — the sem-region
    // injection during teach was pure noise with no learnable
    // structure, and the letter↔sem cross-projection couldn't converge.
    //
    // New approach: sum N-gram hashes (N = 3, 4, 5) from the word,
    // then normalize. Words that share character N-grams (stem +
    // inflection, plural, compound parts) share feature dimensions
    // naturally. "cat" ∩ "cats" = {'ca', 'at', 'cat'} — high cosine.
    // "red" ∩ "blue" = {} — low cosine. "run" ∩ "running" = {'run',
    // 'unn'} — medium cosine. This is the same idea as Facebook's
    // fastText subword embeddings (Bojanowski et al. 2017, Enriching
    // Word Vectors with Subword Information, TACL 5:135) minus the
    // learned component.
    //
    // Each character n-gram hashes to EMBED_DIM sparse positive
    // components via a modulo map. Summing positive n-gram hashes
    // gives every word a non-zero vector with the same magnitude
    // scale as real GloVe after L2 normalization, so injection
    // strength stays calibrated against the same reference.
    //
    // This replaces the old hash fallback entirely — no external file,
    // no 1 GB download, works out of the box. Real GloVe 300d still
    // beats it for semantic quality (it has real co-occurrence
    // statistics from a billion-word corpus), but fastText-style
    // subword hashing is dramatically better than the prior
    // unstructured random hash for cases where GloVe isn't available.
    const vec = new Float32Array(EMBED_DIM);
    const w = `<${word}>`; // boundary markers so prefixes/suffixes distinct
    const MIN_N = 3;
    const MAX_N = 5;

    // Walk every character n-gram in the word at multiple n sizes.
    // Each n-gram contributes to a set of EMBED_DIM components via a
    // deterministic hash → index mapping. Multiple n-grams overlap
    // different dims, so the word's final vector is a superposition
    // that preserves subword structure.
    for (let n = MIN_N; n <= MAX_N; n++) {
      if (w.length < n) continue;
      for (let i = 0; i <= w.length - n; i++) {
        const gram = w.slice(i, i + n);
        // Hash the n-gram to a 32-bit integer — djb2 variant.
        let h = 5381;
        for (let c = 0; c < gram.length; c++) {
          h = ((h << 5) + h + gram.charCodeAt(c)) | 0;
        }
        // Spread the n-gram contribution across 4 EMBED_DIM slots so
        // each n-gram touches multiple dims (denser representation).
        for (let k = 0; k < 4; k++) {
          h = ((h << 13) ^ h) | 0;
          h = ((h >> 17) ^ h) | 0;
          h = ((h << 5) ^ h) | 0;
          const idx = ((h >>> 0) % EMBED_DIM);
          // Sign bit from h determines direction, magnitude fixed to 1
          // per contribution. Summing many contributions gives a
          // roughly Gaussian distribution per dim.
          const sign = ((h >>> 16) & 1) === 0 ? 1 : -1;
          vec[idx] += sign;
        }
      }
    }

    // L2 normalize to unit length to match real GloVe scale.
    let norm = 0;
    for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < EMBED_DIM; i++) vec[i] /= norm;

    return vec;
  }

  // ── Serialization ───────────────────────────────────────────────

  /**
   * Serialize learned refinements for persistence.
   */
  serializeRefinements() {
    const data = {};
    for (const [word, delta] of this._refinements) {
      data[word] = Array.from(delta);
    }
    return data;
  }

  /**
   * Load learned refinements from persistence.
   */
  loadRefinements(data) {
    if (!data) return;
    for (const [word, arr] of Object.entries(data)) {
      this._refinements.set(word, new Float32Array(arr));
    }
    console.log(`[Embeddings] Loaded ${this._refinements.size} learned refinements`);
  }

  /**
   * Get stats.
   */
  get stats() {
    return {
      pretrained: this._embeddings.size,
      learned: this._refinements.size,
      dim: EMBED_DIM,
      loaded: this._loaded,
    };
  }
}

// ── SHARED SINGLETON ────────────────────────────────────────────
//
// R2 of brain-refactor-full-control — before this shared singleton,
// sensory.js created its own SemanticEmbeddings instance and did
// semantic cortex injection on INPUT, while language-cortex.js had
// no reference to embeddings at all and used letter-hash patterns
// on OUTPUT. The cortex state carried semantic info from input but
// the slot scorer couldn't read it because it was matching letter
// hashes against neural activation.
//
// One shared instance bridges both sides — input semantic mapping
// refines the SAME embedding table that output semantic scoring
// reads from. Online refinements from live conversation visible
// to the generation path.
//
// Import:
//   import { sharedEmbeddings } from './embeddings.js';
//
// Any module that wants semantic word vectors uses this. The
// instance's `loadPreTrained()` should be called once at boot from
// app.js (or the first importer) and `await`ed before corpus loading.
export const sharedEmbeddings = new SemanticEmbeddings();

// Export the dimension constant so downstream files can align buffer
// sizes (e.g. PATTERN_DIM in dictionary.js / language-cortex.js).
export { EMBED_DIM };
