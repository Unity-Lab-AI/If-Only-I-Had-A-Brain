/**
 * dictionary.js — Unity's Learned Vocabulary
 *
 * The brain's own language system. Words stored as cortex activation
 * patterns associated with emotional states and usage contexts.
 * The dictionary grows from every interaction — words the brain
 * hears get stored, words it uses get reinforced.
 *
 * Thesaurus emerges from synaptic proximity — similar words have
 * similar cortex patterns because they were learned in similar states.
 * "Angry" and "furious" overlap in neuron space. Arousal level
 * selects the synonym naturally.
 *
 * Sentence construction via cortex sequential prediction:
 * ŝ = W·x predicts next word from current word's pattern.
 *
 * No hardcoded vocabulary. Everything learned. Everything persistent.
 */

// Dictionary capacity. With synthetic morphological inflation disabled,
// the dictionary now grows only from words actually seen in corpus /
// live conversation. Real corpus at boot is ~5-8k unique words across
// all three files. 50k cap leaves plenty of room for organic growth.
import { sharedEmbeddings, EMBED_DIM } from './embeddings.js';

const MAX_WORDS = 50000;
// Pattern dimensionality MATCHES the shared embeddings dimension so cortex
// patterns, word patterns, and context vectors all live in the same
// semantic space. Before R2 this was 32 (arbitrary letter-hash projection);
// after R2 it's EMBED_DIM (50, GloVe 6B.50d) so cosine similarity between
// a cortex pattern and a word pattern measures REAL semantic alignment
// instead of letter-hash coincidence.
const PATTERN_DIM = EMBED_DIM;
// Storage key versioned — bump when dictionary population rules or
// pattern dimension change so stale localStorage caches get dropped.
// v2: 2026-04-13, synthetic morphological inflation disabled + comma-list
//     corpus filter added.
// v3: 2026-04-13 (R2), PATTERN_DIM bumped 32→50 for semantic grounding,
//     letter-hash word patterns replaced with GloVe embeddings. Old v2
//     caches have the wrong pattern shape and wrong values — must drop.
// v4: 2026-04-14 (T14.3), pattern is now 300d (EMBED_DIM matches GloVe
//     6B.300d). Entry shape gains cortexSnapshot / syllables / stressPrimary
//     from cluster.detectBoundaries + cluster.detectStress on first
//     observation. Phonological state is NOT a standalone feature table
//     — it's a cortex-level snapshot routed through T14.1/T14.2 primitives.
//     Old v3 caches have 50d patterns and no snapshot/syllables — drop.
const STORAGE_KEY = 'unity_brain_dictionary_v4';

export class Dictionary {
  constructor() {
    // Word entries: Map<string, WordEntry>
    //
    // T14.3 (2026-04-14) — entry shape:
    //   {
    //     word:           string,
    //     pattern:        Float64Array(PATTERN_DIM)    // semantic readout
    //     arousal:        number,                       // emotional context
    //     valence:        number,
    //     frequency:      number,                       // observation count
    //     cortexSnapshot: Uint8Array|null,              // cluster.lastSpikes copy after exposure (T14.3)
    //     syllables:      number[]|null,                // boundary indices from cluster.detectBoundaries (T14.2/T14.3)
    //     stressPrimary:  number|-1,                    // primary-stress syllable index from cluster.detectStress (T14.2)
    //     lastSeen:       number,                       // ms timestamp of most recent observation
    //   }
    //
    // Phonological fields (syllables, stressPrimary, cortexSnapshot) are
    // populated on FIRST observation if a cortex cluster is wired via
    // setCluster(); subsequent observations just bump frequency + running
    // mean on pattern/arousal/valence. No standalone phoneme feature table
    // — phonology is a cortex-level phenomenon routed through T14.1/T14.2
    // primitives on the cluster itself.
    this._words = new Map();

    // Bigram model for sentence construction: Map<string, Map<string, number>>
    // bigrams['hello']['there'] = 5 means "hello" was followed by "there" 5 times
    this._bigrams = new Map();

    // T14.3 — optional cortex cluster reference. When wired (via
    // setCluster, typically from engine.js right after both the clusters
    // and innerVoice exist), learnWord streams each new word's letters
    // through cluster.detectBoundaries + cluster.detectStress on first
    // observation to compute syllables, stress, and a cortexSnapshot of
    // the cluster's spike state after the letter-streaming pass. If no
    // cluster is wired, learnWord degrades gracefully to the v3 pattern-
    // only behavior (semantic embedding from sharedEmbeddings, no
    // phonological state). Server and browser each wire their own.
    this._cluster = null;

    // Current sentence being constructed
    this._sentenceBuffer = [];

    // Load from storage
    this._load();

    // No seed — brain learns every word from conversation, same as a human
  }

  /**
   * T14.3 — Wire a cortex cluster for cortex-driven syllable/stress
   * detection and cortex-snapshot storage. Call once during brain boot
   * after both the clusters and the Dictionary instance exist. Safe to
   * call before any words have been learned (new words pick up the
   * cluster reference at their first learnWord call) or after (existing
   * words keep their pre-wire state until they're observed again).
   */
  setCluster(cluster) {
    this._cluster = cluster || null;
  }

  // _seed() method was removed 2026-04-13 per VESTIGIAL.md §1 — it was
  // orphan scaffolding from pre-equational era, contained a hardcoded
  // ~60-word seed list and a ~45-entry bigram network. Never called
  // anywhere (grep-confirmed). The constructor comment above says:
  // "No seed — brain learns every word from conversation, same as a
  // human" — this comment has been true in practice for a while, the
  // method body was just dead weight contradicting it.

  /**
   * Learn a word from context — store its cortex pattern and emotional state.
   * Called every time the brain hears or speaks a word.
   *
   * @param {string} word
   * @param {Float64Array} cortexPattern — 32-dim cortex output when this word was active
   * @param {number} arousal — amygdala arousal when word was encountered
   * @param {number} valence — amygdala valence when word was encountered
   */
  learnWord(word, cortexPattern, arousal, valence, opts = {}) {
    const clean = word.toLowerCase().replace(/[^a-z0-9'-]/g, '');
    // Keep single-letter words — "i" and "a" are critical function
    // words in English. Dropping them means Unity can't use "i" as a
    // subject or "a" as an article, which wrecks slot-0 selection
    // and determiner continuations. Pattern assignment still works
    // fine on len-1 strings via the hash path.
    if (!clean) return;

    const existing = this._words.get(clean);
    if (existing) {
      // Update running average of pattern and emotional association
      existing.frequency++;
      existing.lastSeen = Date.now();
      const lr = 1 / existing.frequency; // decreasing learning rate
      for (let i = 0; i < PATTERN_DIM; i++) {
        if (cortexPattern && i < cortexPattern.length) {
          existing.pattern[i] = existing.pattern[i] * (1 - lr) + cortexPattern[i] * lr;
        }
      }
      existing.arousal = existing.arousal * (1 - lr) + arousal * lr;
      existing.valence = existing.valence * (1 - lr) + valence * lr;
      // Phonological state stays pinned to first-observation cortex pass.
      // Intentionally NOT recomputed per observation — the cortex evolves,
      // but re-streaming every word's letters on every observation would
      // shred live brain state during normal chat. Late-binding
      // refinement is handled by the curriculum runner in T14.5.
      return;
    }

    // New word — store it. Pattern comes from the shared semantic
    // embedding table (R2 of brain-refactor-full-control) so the
    // stored pattern ACTUALLY means what the word means. Falls back
    // to the embedding's internal hash-fallback for OOV words, which
    // then gets refined by online context learning.
    //
    // If a cortex pattern is passed in (from live sentence learning),
    // that takes precedence — the brain's current neural state at the
    // time of hearing/using the word is a stronger signal than the
    // GloVe prior for that specific utterance.
    const pattern = new Float64Array(PATTERN_DIM);
    if (cortexPattern) {
      for (let i = 0; i < PATTERN_DIM && i < cortexPattern.length; i++) {
        pattern[i] = cortexPattern[i];
      }
    } else {
      // Semantic embedding from shared GloVe + refinement layer
      const embed = sharedEmbeddings.getEmbedding(clean);
      for (let i = 0; i < PATTERN_DIM && i < embed.length; i++) {
        pattern[i] = embed[i];
      }
    }

    // T14.3 — cortex-routed phonological state. On first observation,
    // stream the letters through the cluster to pick up syllable
    // boundaries + primary-stress index + a cortex spike snapshot from
    // the post-stream state. Skipped cleanly when no cluster is wired
    // (browser boot before engine wires it, or headless tooling).
    //
    // T14.21 (2026-04-14) — ALSO skipped when the cluster hasn't been
    // curriculum-calibrated yet (no `intentCentroids`). Before
    // curriculum runs, the fineType/phon/letter cross-projection
    // weights are random, so `detectStress` produces meaningless
    // noise that just wastes per-new-word boot time. With the operator's
    // post-T14.18 configured cortex at 10K+ neurons, each first-
    // observation detectStress call was costing ~200-500ms which
    // multiplied by ~2000 new corpus words turned `loadSelfImage` +
    // `loadBaseline` + `loadCoding` into a 15-20 minute silent boot
    // that looked like a crash. Now the cortex snapshot gets populated
    // lazily by curriculum itself (which runs AFTER the legacy
    // loaders) or stays null until a post-curriculum chat turn
    // re-observes the word.
    let cortexSnapshot = null;
    let syllables = null;
    let stressPrimary = -1;
    const cluster = this._cluster;
    const curriculumHasRun = cluster && cluster.intentCentroids && cluster.intentCentroids.size > 0;
    if (cluster && typeof cluster.detectStress === 'function' && clean.length > 0 && curriculumHasRun) {
      // Only letters (a-z) get streamed through the letter region — digits
      // and apostrophes get skipped so the letter-region one-hot doesn't
      // grow dimensions for non-phonological symbols during vocabulary
      // learning. The T14.1 inventory still accepts them if they come
      // through other paths (direct cluster.injectLetter).
      const letterOnly = clean.replace(/[^a-z]/g, '');
      if (letterOnly.length > 0) {
        try {
          const stress = cluster.detectStress(letterOnly, { ticksPerLetter: 2 });
          syllables = stress.boundaries;
          stressPrimary = stress.primary;
          // Snapshot cluster.lastSpikes right after the stream — this is
          // the cortex state reflecting this specific word's letter
          // sequence after two detectBoundaries + detectStress passes.
          if (cluster.lastSpikes && cluster.lastSpikes.length > 0) {
            cortexSnapshot = new Uint8Array(cluster.lastSpikes);
          }
        } catch (err) {
          // Non-fatal — word still enters the dictionary without phono state.
          syllables = null;
          stressPrimary = -1;
          cortexSnapshot = null;
        }
      }
    }

    this._words.set(clean, {
      word: clean,
      pattern,
      // Persona flag — when set, the dictionary oracle's `excludePersona`
      // filter skips this entry. Lets test probes (K-STUDENT, methodology,
      // gate batteries) avoid emitting persona-flavored vocabulary
      // ("fuck", "cock", explicit terms) for K-grade exam questions
      // where the answer should come from the curriculum vocab. Live
      // chat path doesn't pass `excludePersona`, so persona words stay
      // available there. Default false so non-persona learnWord calls
      // (curriculum, live chat) don't accidentally mark words.
      isPersona: opts.isPersona === true,
      arousal: arousal ?? 0.5,
      valence: valence ?? 0,
      frequency: 1,
      cortexSnapshot,
      syllables,
      stressPrimary,
      lastSeen: Date.now(),
    });

    // Batched eviction — when we cross capacity by the trigger margin
    // (default 100 entries over MAX_WORDS), evict the bottom-K (K=100)
    // entries by frequency in a single O(N) pass. Subsequent adds run
    // free until headroom is consumed again.
    //
    // Problems.md High (perf) finding: prior implementation evicted
    // ONE entry per overflow add, walking all 50K entries each time.
    // Once near capacity, every new word triggered a 50K-entry walk
    // and eviction dominated wall-clock during exposure phases.
    // Batching to 100 evictions per pass amortizes the walk cost
    // across 100 adds — same total work, ~100× fewer walks.
    const EVICT_TRIGGER = MAX_WORDS + 100;
    const EVICT_BATCH = 100;
    if (this._words.size >= EVICT_TRIGGER) {
      // Single pass to collect the K lowest-frequency entries via a
      // bounded max-heap-equivalent (linear scan with a sorted-array
      // bucket of size K). For K=100, the inner sort is O(K log K) =
      // ~700 ops per heap maintenance, fired once per N entries scanned.
      const bucket = []; // ascending by frequency
      let bucketMax = -Infinity;
      for (const [w, entry] of this._words) {
        const f = entry.frequency;
        if (bucket.length < EVICT_BATCH) {
          bucket.push({ w, f });
          if (bucket.length === EVICT_BATCH) {
            bucket.sort((a, b) => a.f - b.f);
            bucketMax = bucket[bucket.length - 1].f;
          }
        } else if (f < bucketMax) {
          // Drop the highest-frequency tail entry, insert this one in
          // sorted order via a single swap-and-bubble.
          bucket[bucket.length - 1] = { w, f };
          let i = bucket.length - 1;
          while (i > 0 && bucket[i].f < bucket[i - 1].f) {
            const tmp = bucket[i]; bucket[i] = bucket[i - 1]; bucket[i - 1] = tmp;
            i--;
          }
          bucketMax = bucket[bucket.length - 1].f;
        }
      }
      for (const { w } of bucket) this._words.delete(w);
    }
  }

  /**
   * T14.3 — Read syllable boundaries for a word. Returns null if the
   * word hasn't been seen or hasn't been syllabified (no cluster wired
   * at first observation). Callers wanting on-demand syllabification of
   * a fresh string should call `cluster.detectBoundaries` directly.
   */
  syllablesFor(word) {
    const entry = this._words.get((word || '').toLowerCase());
    return entry?.syllables || null;
  }

  /**
   * T14.3 — Read the stored cortex spike snapshot for a word. Returns
   * null if the word hasn't been seen or was stored without a cluster
   * wired. The snapshot is a Uint8Array binary spike vector the same
   * length as the cortex cluster at the time of first observation, so
   * consumers that want to compare snapshots across words should check
   * `.length` compatibility before reading.
   */
  snapshotFor(word) {
    const entry = this._words.get((word || '').toLowerCase());
    return entry?.cortexSnapshot || null;
  }

  /**
   * Enumerate every learned word. Returns an array of
   * `{word, frequency, arousal, valence, lastSeen}` snapshots —
   * one per entry in the internal `_words` Map.
   *
   * Operator audit 2026-04-23 exposed that `_trainedVocabularySet` in
   * `curriculum.js` gated its dictionary iteration behind
   * `typeof this.dictionary.entries === 'function'`, which returned
   * false because this method didn't exist. Every word Unity learned
   * via `_teachVocabList` → `dictionary.learnWord()` stayed inside the
   * dictionary BUT invisible to the vocab audit. Result: operator saw
   * `VOCAB-COVERAGE 12%` stuck at 12% even after `EXAM-VOCAB-TEACH
   * DONE — 196/196 words taught`. Re-audit ran against the same
   * TRAIN_BANKS-only view every time.
   *
   * This method closes that gap: `dictionary.entries()` now yields the
   * full learned set, `_trainedVocabularySet` pulls from it, and
   * `examVocabCoverage` reflects reality.
   */
  entries() {
    const out = [];
    for (const [word, entry] of this._words.entries()) {
      out.push({
        word,
        frequency: entry.frequency | 0,
        arousal: entry.arousal || 0,
        valence: entry.valence || 0,
        lastSeen: entry.lastSeen || 0,
      });
    }
    return out;
  }

  /**
   * Quick membership check — returns true iff `word` has been learned.
   * Faster than iterating `entries()` for point lookups. Lowercase-
   * normalized to match `learnWord`'s internal key shape.
   */
  knows(word) {
    if (!word) return false;
    return this._words.has(String(word).toLowerCase());
  }

  /**
   * Learn a bigram (word sequence) for sentence construction.
   * Called with consecutive words from heard/spoken text.
   */
  learnBigram(word1, word2) {
    const w1 = word1.toLowerCase().replace(/[^a-z'-]/g, '');
    const w2 = word2.toLowerCase().replace(/[^a-z'-]/g, '');
    if (!w1 || !w2) return;

    if (!this._bigrams.has(w1)) this._bigrams.set(w1, new Map());
    const followers = this._bigrams.get(w1);
    followers.set(w2, (followers.get(w2) || 0) + 1);
  }

  /**
   * Learn from a full sentence — extract words, patterns, bigrams.
   *
   * @param {string} text — full sentence
   * @param {Float64Array} cortexPattern — cortex state when sentence was active
   * @param {number} arousal
   * @param {number} valence
   */
  learnSentence(text, cortexPattern, arousal, valence, opts = {}) {
    // Keep len >= 1 so "i" and "a" enter the dictionary. Keep digits too.
    const words = text.toLowerCase().replace(/[^a-z0-9' -]/g, '').split(/\s+/).filter(w => w.length >= 1);
    for (const w of words) {
      this.learnWord(w, cortexPattern, arousal, valence, opts);
    }
    // Learn bigrams
    for (let i = 0; i < words.length - 1; i++) {
      this.learnBigram(words[i], words[i + 1]);
    }
  }

  // T14.17 (2026-04-14) — findByMood, findByPattern, generateSentence
  // DELETED as vestigial organs. findByMood / findByPattern were
  // pre-T14 thesaurus helpers that nothing has called since the T11
  // slot-prior deletion. generateSentence was a bigram-chain walker
  // that nothing has called since the T14.6 tick-driven motor emission
  // replaced it. None of these are consumed by runtime code — grep
  // confirmed zero external callers. The _bigrams Map + learnBigram
  // writer + bigramCount getter stay because display stats (app.js,
  // brain-3d, brain-viz, inner-voice, brain-server) still show the
  // bigram count as a dashboard metric.

  /**
   * Get vocabulary size.
   */
  get size() { return this._words.size; }

  /**
   * Get bigram count.
   */
  get bigramCount() {
    let count = 0;
    for (const followers of this._bigrams.values()) count += followers.size;
    return count;
  }

  // ── Persistence ──────────────────────────────────────────────

  save() {
    try {
      const data = {
        words: Array.from(this._words.entries()).map(([word, entry]) => ({
          word,
          pattern: Array.from(entry.pattern),
          arousal: entry.arousal,
          valence: entry.valence,
          frequency: entry.frequency,
          // T14.3 — persist cortex-routed phono state alongside the pattern.
          // cortexSnapshot serializes as a plain array of 0/1 bytes. It
          // will only reload correctly if the cortex cluster's SIZE matches
          // (brain-scale change invalidates snapshots; pattern still works).
          cortexSnapshot: entry.cortexSnapshot ? Array.from(entry.cortexSnapshot) : null,
          syllables: entry.syllables,
          stressPrimary: entry.stressPrimary,
          lastSeen: entry.lastSeen,
        })),
        bigrams: Array.from(this._bigrams.entries()).map(([w1, followers]) => ({
          word: w1,
          followers: Array.from(followers.entries()),
        })),
      };
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('[Dictionary] Save failed:', err.message);
    }
  }

  _load() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);

      if (data.words) {
        for (const entry of data.words) {
          this._words.set(entry.word, {
            word: entry.word,
            pattern: new Float64Array(entry.pattern),
            arousal: entry.arousal,
            valence: entry.valence,
            frequency: entry.frequency,
            // T14.3 — restore phonological state if present. Missing on
            // old v3 snapshots; STORAGE_KEY was bumped to v4 so those
            // stale caches are dropped by localStorage key mismatch.
            cortexSnapshot: entry.cortexSnapshot ? new Uint8Array(entry.cortexSnapshot) : null,
            syllables: entry.syllables ?? null,
            stressPrimary: entry.stressPrimary ?? -1,
            lastSeen: entry.lastSeen ?? 0,
          });
        }
      }

      if (data.bigrams) {
        for (const bg of data.bigrams) {
          this._bigrams.set(bg.word, new Map(bg.followers));
        }
      }

      console.log(`[Dictionary] Loaded ${this._words.size} words, ${this.bigramCount} bigrams`);
    } catch (err) {
      console.warn('[Dictionary] Load failed:', err.message);
    }
  }

  // T14.17 (2026-04-14) — `_cosine` helper deleted along with its
  // only callers (findByPattern et al.). `sharedEmbeddings.similarity`
  // is the canonical cosine used everywhere else in the codebase.
}
