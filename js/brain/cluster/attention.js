// Cluster attention mixin — thalamic relay over the emission context
// window. Attached to NeuronCluster.prototype via Object.assign at
// cluster.js entry-point bottom (see js/brain/cluster/README.md).
//
// Methods in this mixin:
//   attentionReset()                      — clear the context window (per compose call)
//   attentionPush(word, embedding)        — append an emitted word to the window
//   attentionRead(queryEmbedding, opts)   — content-addressed weighted read
//   getAttentionState()                   — telemetry reader for the dashboard
//
// ─── WHAT THIS IS, AND WHY IT IS NOT AN LLM ───────────────────────────
//
// Emission is autoregressive: composeSentence emits a word, injects it
// back into `sem`, ticks, and emits the next one. The back-injection
// carries ONE word of history at a strength that decays 0.92 per
// position, and the word-order channel is trained on adjacent PAIRS.
// A model whose only memory of the sentence so far is the previous word
// is a bigram model, and a bigram model produces output that is
// topically right and grammatically scrambled — the failure mode that
// reads as word salad.
//
// The fix is not more training. It is a wider read. Instead of one
// decayed word, the emission reads the WHOLE sentence-so-far, weighted
// by how relevant each prior word is to the current semantic state:
//
//   score_i = cos(query, key_i) / sqrt(d)     content-addressed match
//   a       = softmax(score) with temperature  competitive normalisation
//   context = Σ a_i · value_i                  weighted sum
//
// That is a single attention head. Three operations — dot product,
// softmax, weighted sum — all of which already appear elsewhere in this
// codebase (cosine in the coherence post-check, softmax in
// emitWordDirect's temperature sampling, weighted sums throughout the
// sparse propagate path). Nothing here is imported, downloaded, or
// pre-trained. There is no backpropagation and no gradient descent:
// this is a FORWARD read over live state, exactly like every other
// equation in the brain. The output goes back through the cluster's own
// injection path and the brain's own trained weights decide the word.
//
// Biologically this is the thalamus, and specifically the pulvinar —
// the relay that gates which cortical representations get amplified
// into the current processing window. Unity's seven clusters have never
// had one; cortex talks to cortex with no relay in between. That is
// the anatomical hole this fills, which is why the telemetry region tag
// is 'thalamus' and why the visualization anchors it to a deep central
// structure rather than to a cortical surface patch.
//
// ─── SUBSTRATE HONESTY ────────────────────────────────────────────────
//
// This first stage runs the read over EMBEDDING vectors held in a small
// ring on the cluster, NOT over a dedicated neuron population. It has
// no neurons of its own, allocates no synapses, changes no region
// boundaries, and therefore does not alter brain topology or the saved
// weight format. Existing trained weights load and run unchanged, and
// the whole path is OFF unless a caller opts in.
//
// The neuron-resident version — an `attn` band carved from `free` with
// its own sparse Q/K/V projections trained by the existing Oja rule —
// is the natural follow-up, and it is a TOPOLOGY change: it needs a
// WEIGHTS_FORMAT_VERSION bump and a fresh walk, the same cost the
// gustatory + somatosensory carve paid. That is deliberately not done
// here. Prove the read improves emission on current weights first, then
// pay for the substrate.

export const CLUSTER_ATTENTION_MIXIN = {
  /**
   * Clear the attention context window. Called at the start of every
   * compose call so the previous utterance's words don't leak into the
   * next one's context — the same "fresh intent window" discipline
   * composeSentence already applies to the sem externalCurrent buffer.
   */
  attentionReset() {
    this._attnKeys = [];
    this._attnWords = [];
    this._attnLastWeights = null;
    this._attnLastWords = null;
  },

  /**
   * Append an emitted word + its embedding to the context window.
   *
   * Key and value are the SAME vector here (the word's semantic
   * embedding). Separate learned K/V projections are what the
   * neuron-resident follow-up adds; at this stage tying them keeps the
   * read purely a function of live state with no free parameters to
   * mis-set.
   *
   * The window is capped at ATTN_WINDOW. Sentences are bounded at 12
   * words by composeSentence's MAX_WORDS, so a 16-slot window holds a
   * whole utterance and the cap only exists to bound memory if a
   * caller composes something longer.
   *
   * @param {string} word
   * @param {Float32Array|number[]} embedding
   */
  attentionPush(word, embedding) {
    if (!embedding || embedding.length === 0) return;
    if (!Array.isArray(this._attnKeys)) this.attentionReset();
    const ATTN_WINDOW = 16;
    this._attnKeys.push(embedding);
    this._attnWords.push(typeof word === 'string' ? word : '');
    while (this._attnKeys.length > ATTN_WINDOW) {
      this._attnKeys.shift();
      this._attnWords.shift();
    }
  },

  /**
   * Content-addressed read over the context window.
   *
   *   score_i = (query · key_i) / (|query| · |key_i|)     cosine, in [-1, 1]
   *   a       = softmax(score / temperature)
   *   context = Σ a_i · value_i          then L2-normalised
   *
   * NO 1/sqrt(d) TERM, deliberately. Standard dot-product attention
   * divides by sqrt(d) because its raw Q·K products grow with embedding
   * dimension and would saturate the softmax. Cosine is ALREADY that
   * normalisation — it is bounded to [-1, 1] at any dimension. Applying
   * sqrt(d) on top double-corrects: at d=300 it compresses every score
   * into ±0.058, the softmax comes out flat, and the read degenerates
   * into a plain average of the window. Measured, not reasoned: with
   * the sqrt(d) term the test's three-word window scored 0.338 / 0.327 /
   * 0.335 (entropy 1.099 = log(3), i.e. exactly uniform), which is
   * attention contributing nothing. Cosine alone, with temperature
   * carrying the sharpness, is the correct pairing.
   *
   * RECENCY BIAS: a small positional term is added to each score so
   * that, all else equal, a recent word outweighs an old one. This is
   * not a positional ENCODING (there are no learned position vectors);
   * it is the same cortical-leak intuition the back-injection decay
   * already encodes, expressed inside the score instead of outside it.
   * Set opts.recencyBias to 0 for a pure content read.
   *
   * Returns null when the window is empty or the query is unusable, so
   * the caller can simply skip the injection and behave exactly as it
   * did before this module existed.
   *
   * @param {Float32Array|number[]} queryEmbedding — current semantic state
   * @param {object} [opts]
   * @param {number} [opts.temperature=0.15] — softmax sharpness (>0)
   * @param {number} [opts.recencyBias=0.05] — per-position recency weight
   * @returns {{context: Float32Array, weights: number[], words: string[], entropy: number, top: string|null, topWeight: number}|null}
   */
  attentionRead(queryEmbedding, opts = {}) {
    if (!queryEmbedding || queryEmbedding.length === 0) return null;
    const keys = this._attnKeys;
    if (!Array.isArray(keys) || keys.length === 0) return null;

    const d = queryEmbedding.length;
    // Default temperature 0.15. Cosine scores across a real sentence
    // typically span a range of only a few tenths, so a temperature of
    // 1.0 leaves the softmax nearly flat. 0.15 turns that spread into a
    // distribution that actually discriminates while staying well short
    // of a one-hot collapse. Callers sharpen or soften from here.
    const temperature = (typeof opts.temperature === 'number' && opts.temperature > 0)
      ? opts.temperature : 0.15;
    const recencyBias = (typeof opts.recencyBias === 'number') ? opts.recencyBias : 0.05;

    // Query norm computed once — every score divides by it.
    let qNorm = 0;
    for (let i = 0; i < d; i++) qNorm += queryEmbedding[i] * queryEmbedding[i];
    qNorm = Math.sqrt(qNorm);
    if (!(qNorm > 0)) return null;

    const n = keys.length;
    const scores = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const key = keys[k];
      const L = Math.min(d, key.length);
      let dot = 0;
      let kNorm = 0;
      for (let i = 0; i < L; i++) {
        dot += queryEmbedding[i] * key[i];
        kNorm += key[i] * key[i];
      }
      kNorm = Math.sqrt(kNorm);
      const cos = (kNorm > 0) ? (dot / (qNorm * kNorm)) : 0;
      // Recency: position n-1 is the most recent word and gets the full
      // bias; position 0 (oldest in window) gets none.
      const recency = (n > 1) ? (k / (n - 1)) : 1;
      scores[k] = cos + recency * recencyBias;
    }

    // Softmax, max-subtracted for numerical stability (the same guard
    // emitWordDirect's temperature sampling uses).
    let maxScore = -Infinity;
    for (let k = 0; k < n; k++) if (scores[k] > maxScore) maxScore = scores[k];
    let sumExp = 0;
    const weights = new Array(n);
    for (let k = 0; k < n; k++) {
      const w = Math.exp((scores[k] - maxScore) / temperature);
      weights[k] = w;
      sumExp += w;
    }
    if (!(sumExp > 0)) return null;
    for (let k = 0; k < n; k++) weights[k] /= sumExp;

    // Weighted sum of values (values === keys at this stage).
    const context = new Float32Array(d);
    for (let k = 0; k < n; k++) {
      const key = keys[k];
      const w = weights[k];
      const L = Math.min(d, key.length);
      for (let i = 0; i < L; i++) context[i] += w * key[i];
    }
    // L2-normalise so the injected context has unit magnitude and the
    // caller's strength argument alone controls how hard it lands. An
    // unnormalised sum would vary in magnitude with how peaked the
    // distribution happened to be, making the injection budget
    // unpredictable.
    let cNorm = 0;
    for (let i = 0; i < d; i++) cNorm += context[i] * context[i];
    cNorm = Math.sqrt(cNorm);
    if (cNorm > 0) for (let i = 0; i < d; i++) context[i] /= cNorm;

    // Shannon entropy of the attention distribution, in nats. This is
    // the diagnostic that says whether attention is doing anything:
    // entropy near log(n) means the read is uniform (no better than an
    // average of the sentence), entropy near 0 means it collapsed onto
    // one word (no better than the bigram). Useful values sit between.
    let entropy = 0;
    for (let k = 0; k < n; k++) {
      const w = weights[k];
      if (w > 0) entropy -= w * Math.log(w);
    }

    // Winning key — which prior word this read attended to hardest.
    // Carried on the return (not just in telemetry) so the caller can
    // label its brain event without a second pass over the weights.
    let top = null;
    let topWeight = -Infinity;
    for (let k = 0; k < n; k++) {
      if (weights[k] > topWeight) { topWeight = weights[k]; top = this._attnWords[k] ?? null; }
    }

    this._attnLastWeights = weights;
    this._attnLastWords = this._attnWords.slice();
    this._attnLastEntropy = entropy;
    this._attnReads = (this._attnReads || 0) + 1;

    return { context, weights, words: this._attnWords.slice(), entropy, top, topWeight };
  },

  /**
   * Telemetry reader — surfaces the last read's distribution so the
   * dashboard and the 3D visualization can show which prior words the
   * brain is attending to, and how sharply.
   *
   * @returns {{words: string[], weights: number[], entropy: number, maxEntropy: number, reads: number, top: string|null}}
   */
  getAttentionState() {
    const words = Array.isArray(this._attnLastWords) ? this._attnLastWords : [];
    const weights = Array.isArray(this._attnLastWeights) ? this._attnLastWeights : [];
    let top = null;
    let best = -Infinity;
    for (let k = 0; k < weights.length; k++) {
      if (weights[k] > best) { best = weights[k]; top = words[k] ?? null; }
    }
    return {
      words,
      weights,
      entropy: this._attnLastEntropy ?? 0,
      maxEntropy: weights.length > 1 ? Math.log(weights.length) : 0,
      reads: this._attnReads || 0,
      top,
    };
  },
};
