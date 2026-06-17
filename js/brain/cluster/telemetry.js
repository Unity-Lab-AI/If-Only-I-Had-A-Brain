// Cluster telemetry mixin — extracted from cluster.js per the per-module
// split (see js/brain/cluster/README.md). Attached to NeuronCluster.prototype
// via Object.assign at cluster.js entry-point bottom.
//
// Methods in this mixin:
//   trackRecentEmission(word)             — recent-emission ring for repetition penalty
//   initCompositionalTelemetry(corpus)    — P6.6 telemetry init (builds trained-corpus Sets)
//   classifyCompositionalEmission(sentence) — P6.6 verbatim/partial/novel classifier
//   _recordWordCreationCandidate(t1, t2, floor) — P6.7 tip-of-tongue compound recorder
//   getWordCreationCandidates(opts)       — P6.7 top-N compound candidate reader
//   getCompositionalStats()               — P6.6 aggregate-stats reader for dashboard
//
// All methods reference cluster state via `this.` (prototype-chain compatible).
// Counters / Sets / Maps lazy-initialized on first use so the mixin works
// before any explicit init call (telemetry methods auto-skip when their
// state hasn't been seeded yet).

export const CLUSTER_TELEMETRY_MIXIN = {
  trackRecentEmission(word) {
    if (typeof word !== 'string' || word.length === 0) return;
    if (!Array.isArray(this._recentEmissions)) this._recentEmissions = [];
    this._recentEmissions.push(word);
    while (this._recentEmissions.length > 8) {
      this._recentEmissions.shift();
    }
  },

  /**
   * Compositional emergence telemetry — install the trained-sentence
   * corpus + derived word-transition set so subsequent emissions can be
   * classified as verbatim / novel-recombination / partial-match.
   * Called from curriculum side (`_teachConcreteSentences`) once the
   * corpus is locked in. Safe to call multiple times — last call wins
   * and counters are NOT reset (so trained-corpus updates between
   * sessions still aggregate against a coherent denominator).
   *
   * @param {string[]} corpus — trained K-grade sentences
   */
  initCompositionalTelemetry(corpus) {
    if (!Array.isArray(corpus) || corpus.length === 0) return;
    if (!this._compositionalCounters) {
      this._compositionalCounters = {
        totalClassified: 0,
        verbatimCount: 0,
        novelCount: 0,
        partialCount: 0,
        firstNovelTs: null,
        maxNovelty: 0,
        maxNoveltySentence: '',
        bootTs: Date.now(),
        recentEmissions: [],
      };
    }
    this._trainedSentencesNormalized = new Set();
    this._trainedTransitions = new Set();
    for (const s of corpus) {
      if (typeof s !== 'string') continue;
      const norm = s.toLowerCase().trim();
      if (norm.length === 0) continue;
      this._trainedSentencesNormalized.add(norm);
      const words = norm.split(/\s+/).filter(w => w.length > 0);
      for (let i = 0; i < words.length - 1; i++) {
        this._trainedTransitions.add(`${words[i]}|${words[i + 1]}`);
      }
    }
  },

  /**
   * Classify a composed sentence as verbatim / novel / partial. Updates
   * counters + appends to recent-emissions ring (cap 100). Returns the
   * classification result. No-op when telemetry hasn't been initialized
   * (returns null) — caller can ignore the missing-init case since
   * `_teachConcreteSentences` initializes during K curriculum.
   *
   * Novelty metric: fraction of word-transition pairs (n-1 per
   * n-word sentence) that are NOT present in the trained-transitions
   * set. A wholly-original recombination scores 1.0 novelty; an exact
   * trained sentence scores 0.0. Threshold 0.5 separates novel from
   * partial.
   *
   * @param {string} sentence
   * @returns {{kind:string,novelty:number}|null}
   */
  classifyCompositionalEmission(sentence) {
    if (!this._trainedSentencesNormalized || !this._compositionalCounters) return null;
    if (typeof sentence !== 'string' || sentence.length === 0) return null;
    const c = this._compositionalCounters;
    const norm = sentence.toLowerCase().replace(/[.!?]+$/, '').trim();
    if (norm.length === 0) return null;
    c.totalClassified++;
    let kind;
    let novelty;
    if (this._trainedSentencesNormalized.has(norm)) {
      kind = 'verbatim';
      novelty = 0;
      c.verbatimCount++;
    } else {
      const words = norm.split(/\s+/).filter(w => w.length > 0);
      const transitionCount = Math.max(1, words.length - 1);
      let novelTransitions = 0;
      for (let i = 0; i < words.length - 1; i++) {
        const key = `${words[i]}|${words[i + 1]}`;
        if (!this._trainedTransitions.has(key)) novelTransitions++;
      }
      novelty = novelTransitions / transitionCount;
      kind = novelty > 0.5 ? 'novel' : 'partial';
      if (kind === 'novel') {
        c.novelCount++;
        if (c.firstNovelTs === null) c.firstNovelTs = Date.now();
        if (novelty > c.maxNovelty) {
          c.maxNovelty = novelty;
          c.maxNoveltySentence = sentence;
        }
      } else {
        c.partialCount++;
      }
    }
    c.recentEmissions.push({ sentence, kind, novelty: +novelty.toFixed(3), ts: Date.now() });
    if (c.recentEmissions.length > 100) c.recentEmissions.shift();
    return { kind, novelty };
  },

  /**
   * Word-creation candidate gate. When emitWordDirect rejects an emission
   * but the top-2 candidates both carry meaningful (above-noise) activation,
   * the brain is in a "tip-of-the-tongue" co-activation state. Record the
   * candidate pair so a future schema-coherence check OR operator review
   * can decide whether to promote the compound (e.g. "moon" + "light" →
   * "moonlight") to the vocab. Doesn't auto-commit — pure surface.
   *
   * Tracks co-occurrence count per compound so the candidate gate only
   * surfaces compounds that fired repeatedly (single fires are likely
   * noise; recurring co-activation is a real candidate).
   *
   * @param {{word:string,mean:number}} top1
   * @param {{word:string,mean:number}} top2
   * @param {number} floor
   */
  _recordWordCreationCandidate(top1, top2, floor) {
    if (!top1 || !top2) return;
    if (top1.word === top2.word) return;
    if (!this._wordCreationCandidates) {
      this._wordCreationCandidates = new Map();   // compound → {count, top1, top2, lastTs, sumMean, maxMean}
    }
    // Compound canonicalization: alphabetical ordering of components so
    // (a, b) and (b, a) hash to the same compound bucket. Underscore
    // separator preserves component boundary for later splitting.
    const [a, b] = [top1.word, top2.word].sort();
    const compound = `${a}_${b}`;
    const combined = top1.mean + top2.mean;
    const entry = this._wordCreationCandidates.get(compound) || {
      count: 0, components: [a, b],
      firstTs: Date.now(), lastTs: Date.now(),
      sumMean: 0, maxMean: 0, lastFloor: floor,
    };
    entry.count++;
    entry.lastTs = Date.now();
    entry.sumMean += combined;
    if (combined > entry.maxMean) entry.maxMean = combined;
    entry.lastFloor = floor;
    this._wordCreationCandidates.set(compound, entry);
    // Cap the candidate map at 200 distinct compounds — drop the
    // least-frequent when full so the gate stays focused on recurring
    // co-activations.
    if (this._wordCreationCandidates.size > 200) {
      let leastKey = null;
      let leastCount = Infinity;
      for (const [k, v] of this._wordCreationCandidates) {
        if (v.count < leastCount) { leastCount = v.count; leastKey = k; }
      }
      if (leastKey) this._wordCreationCandidates.delete(leastKey);
    }
  },

  /**
   * Read top-N word-creation candidates sorted by occurrence count
   * descending (most-frequently co-activated first). Returns array of
   * `{compound, components, count, avgMean, maxMean, firstTs, lastTs}`.
   * Filters out candidates below `minCount` (default 3) so single-shot
   * noise doesn't surface.
   *
   * @param {object} [opts]
   * @param {number} [opts.limit=20]
   * @param {number} [opts.minCount=3]
   * @returns {Array}
   */
  getWordCreationCandidates(opts = {}) {
    const limit = opts.limit ?? 20;
    const minCount = opts.minCount ?? 3;
    if (!this._wordCreationCandidates) return [];
    const out = [];
    for (const [compound, e] of this._wordCreationCandidates) {
      if (e.count < minCount) continue;
      out.push({
        compound,
        components: e.components,
        count: e.count,
        avgMean: e.sumMean / e.count,
        maxMean: e.maxMean,
        firstTs: e.firstTs,
        lastTs: e.lastTs,
      });
    }
    out.sort((a, b) => b.count - a.count);
    return out.slice(0, limit);
  },

  /**
   * Read aggregated compositional-emergence stats for dashboard / state
   * broadcast. Returns null when telemetry hasn't been initialized.
   *
   * @returns {object|null}
   */
  getCompositionalStats() {
    const c = this._compositionalCounters;
    if (!c) return null;
    const total = c.totalClassified;
    return {
      totalClassified: total,
      verbatimCount: c.verbatimCount,
      novelCount: c.novelCount,
      partialCount: c.partialCount,
      verbatimRate: total > 0 ? c.verbatimCount / total : 0,
      novelRate: total > 0 ? c.novelCount / total : 0,
      partialRate: total > 0 ? c.partialCount / total : 0,
      firstNovelMsAfterBoot: c.firstNovelTs !== null
        ? Math.max(0, c.firstNovelTs - c.bootTs)
        : null,
      maxNovelty: +c.maxNovelty.toFixed(3),
      maxNoveltySentence: c.maxNoveltySentence,
      recentTail: c.recentEmissions.slice(-10),
    };
  },
};
