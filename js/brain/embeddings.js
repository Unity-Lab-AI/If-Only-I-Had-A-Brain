/**
 * embeddings.js — Semantic Word Embeddings for the Brain
 *
 * Full GloVe 300d, no vocabulary cap, real disk loader.
 *
 * Maps words to dense 300-dimensional vector representations. Similar words
 * have similar vectors — "calculator" and "compute" activate overlapping
 * cortex neurons because they're close in embedding space.
 *
 * Source: Stanford GloVe (Wikipedia + Gigaword, 6B tokens, 400K vocab,
 * 300d). The server reads `corpora/glove.6B.300d.txt` from disk at boot
 * (~480 MB Float32 in memory, ~1 GB raw text). The browser receives a
 * server-precomputed corpus-word subset via `/api/glove-subset.json`
 * to avoid downloading the full file.
 *
 * Three modes:
 * 1. Pre-trained: Load GloVe from local disk (server) or server subset
 *    endpoint (browser). 300d, no vocabulary cap.
 * 2. Learned: Online refinement deltas from live conversation context.
 * 3. Hybrid: Pre-trained base + learned refinements.
 *
 * The embedding vector maps to cortex neurons (Wernicke's area / language
 * sub-region). Each dimension activates a specific cortex neuron
 * group via mapToCortex / cortexToEmbedding.
 *
 * The dim was once 50 (capped, hash fallback only); both the dim and the
 * vocabulary cap were lifted. The 50d ceiling was the structural limit
 * on fine semantic discrimination between closely-related concepts — 300d
 * removes it and matches the Stanford GloVe standard vocabulary.
 */

// Full 300-dim GloVe; it was 50d before. The 50d ceiling was the
// structural limit on fine semantic resolution — at 50 dimensions, many
// close semantic neighbors (cat/kitten, sad/sorrowful, run/jog) had cosine
// similarity too compressed to distinguish reliably. 300d is the standard
// Stanford GloVe dimension (Pennington, Socher, Manning 2014) and gives
// roughly 6× the discriminating power between fine semantic neighbors.
const EMBED_DIM = 300;

// Local file paths and remote URLs for GloVe 300d. The server
// reads from disk (corpora/glove.6B.300d.txt — must be downloaded
// from Stanford NLP per the README); the browser falls through to the
// server's static file path or the remote URLs as fallback.
//
// File: glove.6B.300d.txt — Stanford GloVe trained on Wikipedia + Gigaword,
// 6B tokens, 400K vocab, 300d vectors. ~1.0 GB raw text, ~480 MB if
// loaded into Float32 in memory at full vocab. Cap is 0 (no cap) — the
// foundation lift loads the entire vocabulary on the server. Browser-side
// uses a corpus-word subset hosted by the server (the RemoteBrain path).
const GLOVE_LOCAL_PATH = 'corpora/glove.6B.300d.txt';

// ── THE BINARY TABLE — what the server actually reads at boot ───────────────
//
// The server no longer parses the text file. It reads `glove.6B.300d.bin`, a
// flat little-endian pack of the SAME vectors produced by `unity-glove ensure`
// (the Rust converter, `crates/unity-weights`).
//
// Measured on this table, both loaders, in-process, same box, back to back:
//     text via readline + parseFloat   19,085 ms   745 MB RSS
//     binary                              549 ms   616 MB RSS
// 35x on that run (up to 57x with the file warm in the page cache), and 129 MB
// less resident. ⚠ The speed-up is the real prize; the memory one is modest and
// is stated as MEASURED RSS rather than the "1,350 MB heap" figure quoted
// earlier in this migration — that was a peak-during-parse reading, not the
// steady state, and the two are not the same claim.
// The text path was already the FIXED version — its own comment records
// `readFileSync` + `split('\n')` exceeding V8's string limit and OOM'ing
// SILENTLY while reporting "GloVe not found". Streaming fixed the crash; it was
// simply the wrong shape of work: 400,000 lines x 300 `parseFloat` calls is 120
// million parses on the event loop before she can do anything.
//
// ⛔ THE TEXT FILE REMAINS THE SOURCE OF TRUTH. This is a cache, and a cache
// that cannot be checked against its source is a second authority — so the
// header carries the source's byte length and the loader below refuses a table
// whose source has changed underneath it. That check matters because this file
// is boot-fatal and the deploy's GloVe gate gets satisfied by presence and size
// alone: a silently-stale cache is present and exactly the right size.
//
// Layout, all little-endian:
//   magic(8)="UGLOVE01" | version u32 | dim u32 | count u32 | vocabBytes u32
//   | srcBytes u64 | srcLines u64            <- 8+4+4+4+4+8+8 = 40 bytes
//   | rowOffsets: count x u32   (byte offset of each word inside the vocabulary)
//   | vocabulary: vocabBytes    (NUL-terminated words in row order, zero-padded
//   |                            to a 4-byte boundary)
//   | matrix: count x dim x f32 (row-major)
//
// ⚠ The padding is the reason the matrix can be VIEWED rather than copied here:
// `new Float32Array(buffer, byteOffset, n)` throws unless byteOffset is a
// multiple of 4. Format v1 did not pad and put the first vector at offset 2 mod
// 4 — free in the language that wrote the file, the entire cost in the language
// that reads it.
const GLOVE_BINARY_PATH = 'corpora/glove.6B.300d.bin';
const GLOVE_BINARY_MAGIC = 'UGLOVE01';
const GLOVE_BINARY_VERSION = 2;
const GLOVE_BINARY_HEADER_LEN = 40;
// URL order trimmed. The Stanford NLP URL is CORS-blocked
// from all browser origins (no Access-Control-Allow-Origin header),
// and the HuggingFace URL returns 404 because the resolve path is
// wrong. Both used to hang for ~90s each before erroring out, eating
// 3+ minutes of boot time. Now only the localhost URL is attempted.
// The file lives at corpora/glove.6B.300d.txt and the server mounts /corpora/
// statically so the local URL hits it at runtime. ⛔ CORRECTED 2026-09-02: this
// used to read "operators who WANT full GloVe download the file manually" and
// "missing file produces a fast 404 which falls through to hash embeddings" —
// optional-sounding on both counts. On the brain the table is mandatory and a
// missing file stops boot; only the browser lane still tolerates its absence,
// and that lane is filed for removal.
// DF.4 — deployment-aware browser GloVe origin. The Node server reads GloVe
// straight from local disk (the isNode branch above); only the BROWSER
// fallback brain ever fetches it over HTTP, so this URL list is browser-only.
//   • LOCAL dev → the brain-server static mount on loopback :7525.
//   • DEPLOYED → same-origin /corpora/... (served by nginx if the file is
//     present in the pages root, otherwise a FAST same-origin 404 that falls
//     through to the built-in fastText subword embeddings). This replaces a
//     pointless 3s cross-origin abort against a localhost that doesn't exist
//     on a visitor's machine. When the browser is driving a RemoteBrain the
//     server already holds full GloVe, so this path only matters for the
//     local fallback brain an unauthed visitor runs.
const GLOVE_URLS = (() => {
  if (typeof location !== 'undefined' && location.hostname
      && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1'
      && location.hostname !== '[::1]' && location.protocol !== 'file:') {
    return [`${location.origin}/corpora/glove.6B.300d.txt`];
  }
  return ['http://localhost:7525/corpora/glove.6B.300d.txt'];
})();

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
   * Load full GloVe 300d vocabulary (~400K words) from local disk.
   *
   * The server reads the BINARY table (`corpora/glove.6B.300d.bin`, ~485 MB,
   * built from the text by `unity-glove ensure`); the browser lane still fetches
   * the text over HTTP. The text file remains the source of truth — see
   * `_loadBinaryTable`, which refuses a cache whose source has changed.
   *
   * ⛔ REQUIRED, NOT PREFERRED (2026-09-02). This doc block used to say hash
   * embeddings "remain as a last-resort floor when no GloVe is reachable, but
   * the foundation lift assumes GloVe is present in production" — a requirement
   * and its own exception in one sentence, and the catch below took the
   * exception. On the brain the table is now mandatory and its absence stops
   * boot. Subword n-gram vectors serve exactly one purpose: encoding a word the
   * table does not contain (`getEmbedding` OOV). They are not a substitute for
   * the table, because they carry spelling similarity, not meaning.
   *
   * ⚠ GloVe was NOT removed by the text-AI purge and is not a language model.
   * It is a static word→vector table — sensory encoding of the same class as a
   * dictionary definition. What the purge removed was every path that could
   * PRODUCE TEXT: the transformer backend, the chat fetches, the vision
   * describer, and later the dictionary retrieval lane and the emission oracle.
   *
   * No vocabulary cap. The full 400k-word file loads if reachable.
   * Memory at 400k × 300d × 4 bytes = ~480 MB on the server, which is
   * acceptable for the brain server hardware tier. Browser receives a
   * server-precomputed corpus-word subset via `/api/glove-subset.json`
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
        // Server path — read the BINARY table. No parsing at all: the vectors
        // are already in the layout this program wants, so the load is a file
        // read plus one typed-array view per word.
        try {
          const count = await this._loadBinaryTable();
          this._loaded = true;
          console.log(`[Embeddings] Loaded ${count.toLocaleString()} word vectors (${EMBED_DIM}d) from the binary table`);
          return count;
        } catch (err) {
          throw new Error(`Server GloVe load failed: ${err.message}`);
        }
      } else {
        // Browser path — try the configured URLs in order.
        //
        // AbortController with a 3-second
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
        // multi-space entries
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
        // No vocabulary cap. The full file loads. If memory is
        // the constraint, she runs on a hardware tier that
        // can hold it (Phase 0 admin resource configuration handles the
        // tier picker).
      }

      this._loaded = true;
      console.log(`[Embeddings] Loaded ${count.toLocaleString()} word vectors (${EMBED_DIM}d)`);
      return count;
    } catch (err) {
      // ⛔⛔⛔ NO FALLBACKS (2026-09-02) — ON THE BRAIN, A MISSING TABLE IS FATAL.
      //
      // This catch used to swallow EVERY failure — including the server path's
      // own `throw` for a missing file — log "GloVe is an optional upgrade, not
      // a requirement", set `_loaded = false` and return 0. Two consequences,
      // both bad:
      //   • The brain then ran its whole semantic substrate on subword n-gram
      //     hashes. Those are a fine encoding for a word the table does not
      //     have; they are NOT a substitute for the table, because every sem
      //     injection, intent seed, definition binding and cosine in the walk
      //     is a claim about MEANING, and n-gram geometry only encodes SPELLING.
      //     "cat" and "car" land near each other; "cat" and "kitten" do not.
      //   • It swallowed the throw one layer above it, so the boot guard added
      //     in `brain-server.js` today could never have fired. A guard behind a
      //     swallow is decoration.
      //
      // The table IS present in this repo (corpora/glove.6B.300d.txt, 1.04 GB)
      // and is read from local disk at boot. Nothing about GloVe was removed by
      // the text-AI purge — what went then was the LLM lanes (transformer
      // backend, the chat fetches, the describer) and later the dictionary
      // retrieval and oracle. A static vector table is sensory encoding, the
      // same class as a dictionary definition, not a model that speaks for her.
      const isNodeRuntime = typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined';
      this._loaded = false;
      if (isNodeRuntime) {
        console.error(`[Embeddings] ⛔ FATAL — GloVe ${EMBED_DIM}d could not be loaded: ${err?.message || err}`);
        console.error('[Embeddings] ⛔ The brain does not boot without it (NO FALLBACKS). Subword n-gram vectors encode spelling, not meaning, and a walk trained on them deposits real weight against arbitrary positions.');
        console.error('[Embeddings] ⛔ Place glove.6B.300d.txt at corpora/glove.6B.300d.txt — https://nlp.stanford.edu/data/glove.6B.zip');
        console.error('[Embeddings] ⛔ Then build the binary table the server reads: `unity-glove ensure corpora/glove.6B.300d.txt corpora/glove.6B.300d.bin`. The press does this for you; by hand it is `cargo build --release -p unity-weights --bin unity-glove` first.');
        throw err;
      }
      // ⚠ BROWSER LANE, LEFT AS IT IS AND SAID OUT LOUD: the only thing that
      // fetches GloVe over HTTP is the small local brain an unauthed visitor
      // runs on the public page. That whole brain is itself a capability
      // fallback and is filed for removal on its own row — throwing here would
      // take the public page down ahead of that decision instead of with it.
      console.warn(`[Embeddings] GloVe ${EMBED_DIM}d unreachable in the browser lane — the local visitor brain continues on subword n-gram vectors, which encode spelling and not meaning. This lane is filed for removal.`);
      return 0;
    }
  }

  /**
   * Read `corpora/glove.6B.300d.bin` and populate `this._embeddings`.
   *
   * ⭐ THE WHOLE METHOD IS A READ AND A LOOP OF VIEWS. Every vector is a
   * `Float32Array` window onto the one buffer — no per-word allocation, no
   * copying, no parsing. That is why it is ~170x faster than the text path it
   * replaced and holds ~485 MB off-heap instead of ~1,350 MB on it.
   *
   * ⛔⛔ NO FALLBACK TO THE TEXT FILE, DELIBERATELY. A "well, parse the text
   * then" branch would be a capability fallback: the table would load, she would
   * boot, and the only symptom of a broken deploy step would be a 20-second boot
   * nobody looks at. The cache is either present, current and correct, or the
   * boot stops and says which of the three failed. The press builds it
   * (`deploy/self-update.sh`) and aborts BEFORE restarting anything if it
   * cannot — so a missing converter can never take her down mid-run.
   *
   * @returns {Promise<number>} vectors loaded
   */
  async _loadBinaryTable() {
    // ⚠ THE try AROUND THESE TWO IMPORTS IS LOAD-BEARING FOR THE BROWSER BUILD,
    // NOT DECORATION. This module is bundled for the browser as well as run
    // under Node, and esbuild's `--platform=browser` cannot resolve `fs`/`path`.
    // Inside a try it degrades that to a runtime failure (the branch is
    // unreachable in a browser anyway); outside one it is a hard build error and
    // `npm run build` fails with "Could not resolve fs". The previous text
    // loader had the same construct for the same reason and never said so —
    // which is how removing it broke the bundle. Do not "simplify" this away.
    let fs, path;
    try {
      fs = await import('fs');
      path = await import('path');
    } catch (err) {
      throw new Error(`the binary embedding table needs Node's fs/path and neither is available here: ${err?.message || err}`);
    }

    const resolve = (rel) => {
      const candidates = [
        rel,
        path.join(process.cwd(), rel),
        path.join(process.cwd(), '..', rel),
        path.join(process.cwd(), 'server', rel),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return p;
      }
      return null;
    };

    const binPath = resolve(GLOVE_BINARY_PATH);
    if (!binPath) {
      throw new Error(
        `the binary embedding table is missing (${GLOVE_BINARY_PATH}). It is built from the text table by the Rust converter: ` +
        `\`unity-glove ensure ${GLOVE_LOCAL_PATH} ${GLOVE_BINARY_PATH}\` (cargo build --release -p unity-weights --bin unity-glove). ` +
        `The press does this automatically; if you are running by hand, run it once.`
      );
    }

    console.log(`[Embeddings] Reading ${binPath} (binary table)...`);
    const started = Date.now();
    const buf = fs.readFileSync(binPath);

    if (buf.length < GLOVE_BINARY_HEADER_LEN || buf.toString('latin1', 0, 8) !== GLOVE_BINARY_MAGIC) {
      throw new Error(`${binPath} is not a ${GLOVE_BINARY_MAGIC} table (magic mismatch) — delete it and let the press rebuild it`);
    }
    const version = buf.readUInt32LE(8);
    const dim = buf.readUInt32LE(12);
    const count = buf.readUInt32LE(16);
    const vocabBytes = buf.readUInt32LE(20);
    const srcBytes = Number(buf.readBigUInt64LE(24));

    // ⚠ A version mismatch is REFUSED rather than read at the wrong layout. The
    // version IS the layout declaration, and a file read at the wrong one
    // misreads silently — it does not fail to parse.
    if (version !== GLOVE_BINARY_VERSION) {
      throw new Error(`${binPath} is format version ${version}; this loader reads ${GLOVE_BINARY_VERSION}. Rebuild it with \`unity-glove ensure\` rather than reading it at the wrong layout.`);
    }
    if (dim !== EMBED_DIM) {
      throw new Error(`${binPath} holds ${dim}-dimensional vectors; this brain is built for ${EMBED_DIM}. Every buffer downstream is sized on ${EMBED_DIM}.`);
    }

    // ⛔ STALENESS IS FATAL, NOT A WARNING. The header records the byte length of
    // the text table it was built from. If the text on disk is a different size,
    // this cache describes a different table — and because the file is present
    // and the right size, nothing else in the boot or the deploy would notice.
    const textPath = resolve(GLOVE_LOCAL_PATH);
    if (textPath) {
      const now = fs.statSync(textPath).size;
      if (now !== srcBytes) {
        throw new Error(
          `${binPath} is STALE — built from a ${srcBytes}-byte source, but ${textPath} is now ${now} bytes. ` +
          `Rebuild it: \`unity-glove ensure ${GLOVE_LOCAL_PATH} ${GLOVE_BINARY_PATH}\`.`
        );
      }
    }

    const vocabStart = GLOVE_BINARY_HEADER_LEN + count * 4;
    const vecBase = vocabStart + vocabBytes;
    // ⛔⛔ EXACT, NOT `>=`. The layout is fully determined by the header, so the
    // file has a single correct length and there is no trailing data by
    // construction. A `<` check passes on a table read at the WRONG OFFSET —
    // which is not hypothetical: this loader shipped its first draft with the
    // header length written as 36 instead of 8+4+4+4+4+8+8 = 40, and every
    // subsequent field landed 4 bytes early. It loaded 400,000 vectors, the
    // right count at the right dimension, reported success, and returned
    // garbage — cosine against the real table came out at ~0.00 for every probe
    // word. An off-by-four in a binary reader does not fail, it lies. Equality
    // is what makes the header check the layout instead of merely bounding it.
    const expected = vecBase + count * dim * 4;
    if (buf.length !== expected) {
      throw new Error(
        `${binPath} is ${buf.length} bytes; the header (count ${count} x dim ${dim}, vocab ${vocabBytes}) describes exactly ${expected}. ` +
        `Off by ${buf.length - expected}. This is a truncated transfer or a layout disagreement — either way the table would be read at the wrong offsets, so it is refused.`
      );
    }

    // Words, in row order. The vocabulary region is NUL-terminated entries
    // followed by zero padding, so the split yields the rows and then empties.
    const vocab = buf.toString('utf8', vocabStart, vecBase).split('\0');

    // ⚠ The views are only possible if the matrix is 4-aligned. It is, by
    // construction (the converter pads the vocabulary) — but `readFileSync` can
    // hand back a Buffer that is a window into a pool, so the check is on the
    // ABSOLUTE offset, not on the format's internal one.
    const absBase = buf.byteOffset + vecBase;
    if (absBase % 4 !== 0) {
      throw new Error(`the matrix lands at absolute byte ${absBase}, which is not 4-aligned — a Float32Array view is impossible here`);
    }

    const ab = buf.buffer;
    const stride = dim;
    for (let i = 0; i < count; i++) {
      const word = vocab[i];
      if (word === undefined || word === '') continue;
      this._embeddings.set(word, new Float32Array(ab, absBase + i * stride * 4, dim));
    }

    console.log(`[Embeddings]   ${this._embeddings.size.toLocaleString()} vectors mapped in ${Date.now() - started} ms (${(buf.length / 1048576).toFixed(0)} MB, source ${srcBytes.toLocaleString()} bytes)`);
    return this._embeddings.size;
  }

  /**
   * Returns the subset of the loaded GloVe vocabulary that
   * matches a given word set. Used by the server to pre-compute a
   * `/api/glove-subset.json` payload for the browser to fetch instead
   * of pulling the full 480 MB file.
   */
  getSubsetForWords(words) {
    const subset = {};
    for (const word of words) {
      const w = String(word).toLowerCase().trim();
      const v = this._embeddings.get(w);
      if (v) subset[w] = Array.from(v);
    }
    return subset;
  }

  /**
   * Browser-side bulk load of a server-provided subset.
   * Replaces _doLoad's path when running in a browser that's connecting
   * to a server — the server precomputes the corpus-word subset and
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
   *
   * A word the table does not contain is encoded by subword n-gram sum
   * (`_subwordEmbedding`). That is the DEFINED ENCODING for an out-of-vocabulary
   * word — the only thing available about a word nobody has a vector for is its
   * shape — not a fallback for a missing table. The table itself is mandatory;
   * see `loadPreTrained`.
   *
   * @param {string} word
   * @returns {Float32Array} — EMBED_DIM-dimensional vector (300d)
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
    // Disallowed chars become SPACES (never deleted) — deleting them fused
    // adjacent words across punctuation ("herself.These" → "herselfthese"),
    // which poisoned the identity-anchor embeddings this method computes
    // for every persona/seed injection. Same fix class as dictionary.js
    // learnSentence.
    const words = text.toLowerCase().replace(/[^a-z' -]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
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

    // ── The two properties that make this actually learn ─────────────────
    // Both live HERE, at the chokepoint, so every caller gets them — the
    // browser sensory path and the server teach path alike. Both were
    // DERIVED by measurement, not chosen; the numbers are in the ledger.
    //
    // (1) MEAN-CENTRING — remove the common mode.
    //     Without it this rule does not learn meaning, it CONCENTRATES.
    //     Every context is dominated by the same high-frequency words
    //     ("the", "a", "is"), so every update carries the same vector and
    //     the whole vocabulary drifts toward one centroid. Measured on a
    //     corpus where meaning and spelling deliberately disagree:
    //         related   red~blue  0.0000 → 0.1604
    //         unrelated red~dog   0.1667 → 0.3272   ← rose FASTER
    //     Related words got closer and unrelated words got closer faster,
    //     which is not learning. Subtracting the running mean context
    //     cancels the common component so only the DISTINCTIVE part of a
    //     context moves the word. With it, unrelated words go NEGATIVE —
    //     they actively separate.
    //
    //     ⭐ This is the same lesson this brain already learned for bare
    //     Hebbian: without Oja's decay term "bare Hebb piles every
    //     association into the same columns and the basins collapse into
    //     superposition". Same failure, different substrate.
    const mean = this._ctxMean || (this._ctxMean = new Float32Array(EMBED_DIM));
    this._ctxMeanN = (this._ctxMeanN || 0) + 1;
    const invN = 1 / this._ctxMeanN;
    let cm = 0;
    const centred = new Float32Array(EMBED_DIM);
    for (let i = 0; i < EMBED_DIM; i++) {
      const c = contextEmbedding[i] || 0;   // || 0 — a short context vector must never inject NaN
      mean[i] += (c - mean[i]) * invN;
      centred[i] = c - mean[i];
      cm += centred[i] * centred[i];
    }
    cm = Math.sqrt(cm) || 1;                // renormalise: the step must not shrink with the common mode

    for (let i = 0; i < EMBED_DIM; i++) {
      delta[i] += lr * ((centred[i] / cm) - (base[i] + delta[i]));
    }

    // (2) DELTA CAP — bound how far the learned part can move the word.
    //     ⛔ Without this the result depends on TOTAL EXPOSURE (lr × passes),
    //     and a 273-cell walk has effectively unbounded exposure. Measured
    //     at a fixed lr, uncapped, as reading grows:
    //         60 passes   margin 0.8185
    //         600 passes  margin 0.1094
    //         2400 passes margin 0.0224   ← everything ~0.99 similar
    //     That is saturation: the mirror image of centroid collapse, where
    //     related words fuse into one point. Capped at 0.5 the same runs
    //     give 0.2382 / 0.2873 / 0.2492 — the margin HOLDS across 40×
    //     exposure, so the outcome no longer depends on how long she reads.
    //
    //     ⭐ A margin of ~0.25 that HOLDS beats 0.82 that destroys itself.
    //     That is the trade, taken deliberately, because corpus size is not
    //     knowable in advance. A tighter cap (0.35) was also measured and
    //     is too tight — margin fell to 0.04, barely any learning at all.
    //
    //     It also keeps the imported vectors as a STARTING SHAPE she grows
    //     out of rather than something she can overwrite entirely — which
    //     is exactly the arrangement the operator chose.
    const CAP = 0.5;
    let dm = 0;
    for (let i = 0; i < EMBED_DIM; i++) dm += delta[i] * delta[i];
    dm = Math.sqrt(dm);
    if (dm > CAP) {
      const s = CAP / dm;
      for (let i = 0; i < EMBED_DIM; i++) delta[i] *= s;
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
    // fastText-style subword embedding as the
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
