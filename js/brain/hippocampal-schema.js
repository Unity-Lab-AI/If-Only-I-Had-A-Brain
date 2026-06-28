// hippocampal-schema.js — iter13 Tier 2 SchemaStore + HippocampalSchema
//
// Squire/McClelland Complementary Learning Systems theory port:
//   - Hippocampus = fast pattern-separated episodic store (Tier 1, lives in
//     episodic-memory.db with salience metadata)
//   - Neocortex = slow distributed semantic store (existing cluster.synapses
//     + cross-projections built up by curriculum Hebbian)
//   - Consolidation = hippocampal traces replayed during quiet windows,
//     gradually transferring weight into cortex via dedicated per-schema
//     hippocampus_to_cortex_projection sparse matrices (this file)
//
// A HippocampalSchema is a CONCEPT-LEVEL ABSTRACTION built from one or
// more Tier 1 episodes that share semantic content. It carries:
//   - GloVe centroid of source episode embeddings (concept_embedding)
//   - Multi-dimensional attribute vector (salience features)
//   - A dedicated SparseMatrix projection from hippocampus → cortex sem
//     region that the ConsolidationEngine fires during dream-cycle replay
//   - Reinforcement state (consolidation_strength, retrieval_count)
//   - Promotion flags for Tier 3 identity-bound migration
//
// SchemaStore is the singleton that owns the Map<schemaId, schema>,
// handles persistence (server/schemas.json), and exposes the retrieval
// surface (top-K cosine rank) for chat-path memory injection.

import { SparseMatrix } from './sparse-matrix.js';

const SCHEMA_VERSION = 1;

// Identity-bound promotion criteria (iter13 T13.11). Hard-coded here so
// SchemaStore can self-identify candidates; Tier3Store handles the actual
// migration + permanence persistence.
const IDENTITY_PROMOTION = {
  consolidationStrengthMin: 5.0,
  retrievalCountMin: 100,
  emotionalValenceAbsMin: 0.6,
};

// Decay schedules (per day). Tier 2 decays substantially without
// reinforcement. Tier 3 (identity-bound) decay handled separately in
// Tier3Store at 0.999/day — practically permanent.
const TIER2_DECAY_PER_DAY = 0.967; // ~30% drop in 1 month, ~70% in 3 months
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Cosine merge threshold (iter13 T13.7). Two schemas with concept_embedding
// cosine > this value AND similar attribute vectors get merged into one.
const SCHEMA_MERGE_COSINE = 0.90;

// Cosine grouping threshold for schema CREATION from episodes (iter13 T13.6).
// Episodes within this cosine bucket form a single schema instead of N
// near-duplicate schemas. Looser than merge threshold because new schemas
// have less context to differentiate.
//
// iter22 — bumped 0.70 → 0.85. Saturation issue caught: every consolidation
// pass after the first was merging 100% of new candidates into the SAME
// existing schema, producing pass logs with `0 new schemas, 1 reinforced`
// indefinitely. Operator caught (verbatim 2026-05-05): consolidation passes
// firing all-zero. Root cause: phase-completion episodes from different
// teach methods (alphabet sequence, vowel variants, rhyme families,
// phoneme blending) cosined > 0.70 because their input_embedding traces
// shared the high-frequency CELL_ALIVE / phase-marker tokens. Tightening
// to 0.85 forces semantically distinct teach events to form distinct
// schemas — alphabet, vowels, rhymes, phonemes each get their own Tier 2
// node instead of all collapsing into a single "learning" mega-schema.
const SCHEMA_GROUP_COSINE = 0.85;

let _nextSchemaCounter = 0;
function generateSchemaId() {
  // Time-prefixed counter — sortable + readable + collision-safe within
  // a single brain process. Multi-process would need UUID, but Unity
  // brain server is single-process by design.
  _nextSchemaCounter++;
  return `schema_${Date.now().toString(36)}_${_nextSchemaCounter}`;
}

// Build attribute vector from per-episode metadata. The attribute vector
// captures the emotional/arousal/identity-relevance "fingerprint" of the
// schema separate from the GloVe concept content. Used in similarity
// matching during merge-gate AND retrieval ranking.
//
// Layout (8d):
//   [0] avg_emotional_valence   (-1 to +1)
//   [1] avg_arousal              (0 to 1)
//   [2] avg_surprise             (0 to 1)
//   [3] avg_novelty              (0 to 1)
//   [4] frequency_total          (sum of source frequencies, log-scaled)
//   [5] recency_decay            (max recency across sources)
//   [6] consolidation_strength
//   [7] identity_relevance       (0 to 1, weighted score of how anchor-y this is)
function buildAttributeVector(sourceEpisodes, consolidationStrength = 0) {
  const vec = new Float64Array(8);
  if (!sourceEpisodes || sourceEpisodes.length === 0) return vec;
  let valenceSum = 0, arousalSum = 0, surpriseSum = 0, noveltySum = 0;
  let freqTotal = 0, mostRecent = 0;
  for (const ep of sourceEpisodes) {
    valenceSum += (ep.emotional_valence || 0);
    arousalSum += (ep.arousal_at_encode || 0);
    surpriseSum += (ep.surprise || 0);
    noveltySum += (ep.novelty || 0);
    freqTotal += (ep.frequency_count || 1);
    if (ep.timestamp > mostRecent) mostRecent = ep.timestamp;
  }
  const n = sourceEpisodes.length;
  vec[0] = valenceSum / n;
  vec[1] = arousalSum / n;
  vec[2] = surpriseSum / n;
  vec[3] = noveltySum / n;
  vec[4] = Math.log(1 + freqTotal);
  // Recency expressed as exp(-age_days). 1.0 = fresh, decays with age.
  const ageDays = mostRecent > 0 ? (Date.now() - mostRecent) / MS_PER_DAY : 999;
  vec[5] = Math.exp(-ageDays / 30); // 30-day recency half-life
  vec[6] = consolidationStrength;
  // Identity relevance — weighted combo of valence-loaded + frequent +
  // recent. Schemas that score high here are the ones likely to promote
  // to Tier 3 identity-bound. Pre-computed convenience metric.
  vec[7] = Math.min(1, 0.5 * Math.abs(vec[0]) + 0.3 * Math.min(1, vec[4] / 10) + 0.2 * vec[5]);
  return vec;
}

function attributeSimilarity(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function cosine(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

// L2-normalize an embedding in place. Returns the same Float64Array.
function l2Normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  }
  return vec;
}

// Compute centroid of N embeddings, weighted by per-episode salience.
// Returns L2-normalized Float64Array.
function computeCentroid(embeddings, weights = null) {
  if (!embeddings || embeddings.length === 0) return new Float64Array(0);
  const D = embeddings[0].length;
  const out = new Float64Array(D);
  let totalWeight = 0;
  for (let i = 0; i < embeddings.length; i++) {
    const emb = embeddings[i];
    if (!emb || emb.length !== D) continue;
    const w = weights && i < weights.length ? Math.max(0, weights[i]) : 1.0;
    totalWeight += w;
    for (let j = 0; j < D; j++) out[j] += emb[j] * w;
  }
  if (totalWeight > 0) {
    for (let j = 0; j < D; j++) out[j] /= totalWeight;
  }
  return l2Normalize(out);
}

/**
 * HippocampalSchema — single Tier 2 concept-level abstraction.
 *
 * Built from a group of cosine-similar Tier 1 episodes via SchemaStore.createSchema.
 * Carries its own dedicated hippocampus → cortex SparseMatrix projection
 * that the ConsolidationEngine fires during replay to gradually transfer
 * the schema's content into cortex weights (cortical consolidation).
 */
export class HippocampalSchema {
  constructor(opts = {}) {
    this.id = opts.id || generateSchemaId();
    this.label = opts.label || 'unlabeled-schema';
    this.conceptEmbedding = opts.conceptEmbedding || new Float64Array(0);
    this.attributeVector = opts.attributeVector || new Float64Array(8);
    this.sourceEpisodeIds = Array.isArray(opts.sourceEpisodeIds)
      ? [...opts.sourceEpisodeIds] : [];
    this.consolidationStrength = opts.consolidationStrength || 0;
    this.createdAt = opts.createdAt || Date.now();
    this.lastConsolidationAt = opts.lastConsolidationAt || 0;
    this.lastRetrievalAt = opts.lastRetrievalAt || 0;
    this.retrievalCount = opts.retrievalCount || 0;
    // Dream-replay reinforcement count — accumulates during sleep
    // consolidation passes, feeds the Tier 3 promotion gate so identity
    // can form from trained/lived experience, not just chat retrievals.
    this.replayCount = opts.replayCount || 0;
    this.promotedToTier3 = opts.promotedToTier3 === true;
    this.tier3PromotedAt = opts.tier3PromotedAt || null;
    // The dedicated cross-projection. Sized hippocampus_size × cortex_sem_size
    // when initialized via initProjection. Reconstructed on load via
    // SparseMatrix CSR deserialization.
    this.hippocampusToCortexProjection = opts.hippocampusToCortexProjection || null;
  }

  // Initialize the dedicated SparseMatrix projection. Called once at
  // schema creation time. Carves the centroid pattern via a single
  // initial Hebbian write at strong lr so the projection has SOME
  // signal even before the first dream-cycle replay reinforces it.
  initProjection(hippocampusSize, cortexSemSize, opts = {}) {
    if (this.hippocampusToCortexProjection) return; // already initialized
    const fanout = opts.fanout || 20;
    this.hippocampusToCortexProjection = new SparseMatrix(
      cortexSemSize,
      hippocampusSize,
      fanout,
      { wMax: opts.wMax ?? 0.4 }
    );
    // Carve the concept embedding into the projection's bias by
    // initializing weights from a sparse one-hot pattern. The actual
    // strong-write happens in ConsolidationEngine on first replay;
    // here we just ensure the projection is allocated + ready.
  }

  // Apply Tier 2 daily decay to consolidation_strength. Called by
  // ConsolidationEngine periodically OR when SchemaStore is loaded.
  applyDailyDecay(daysElapsed = 1) {
    if (this.promotedToTier3) return; // Tier 3 has its own slower decay
    const factor = Math.pow(TIER2_DECAY_PER_DAY, daysElapsed);
    this.consolidationStrength *= factor;
    // Recompute attribute vector index 6 so retrieval ranking reflects decay
    if (this.attributeVector && this.attributeVector.length >= 7) {
      this.attributeVector[6] = this.consolidationStrength;
    }
  }

  // Reinforcement signal — called by ConsolidationEngine after each replay
  // pass. Replay magnitude scaled by emotional weight + frequency log.
  reinforce(deltaStrength) {
    this.consolidationStrength += deltaStrength;
    // Count this dream-replay reinforcement. Identity (Tier 3) consolidates
    // during sleep replay of emotionally-salient memories, not only when a
    // schema is queried in chat — so replayCount feeds the promotion gate
    // alongside retrievalCount (see shouldPromoteToTier3). Without this, a
    // training-only brain (zero conversations) can NEVER form identity.
    this.replayCount = (this.replayCount || 0) + 1;
    this.lastConsolidationAt = Date.now();
    if (this.attributeVector && this.attributeVector.length >= 7) {
      this.attributeVector[6] = this.consolidationStrength;
    }
  }

  // Reinforcement signal — called by SchemaStore.retrieveSchemas when
  // chat path queries this schema. Lower magnitude than dream replay.
  registerRetrieval() {
    this.retrievalCount++;
    this.lastRetrievalAt = Date.now();
    this.consolidationStrength += 0.02; // small bump per retrieval
    if (this.attributeVector && this.attributeVector.length >= 7) {
      this.attributeVector[6] = this.consolidationStrength;
    }
  }

  // Tier 3 promotion gate (iter13 T13.11). Returns true if this schema
  // meets all three criteria for identity-bound migration.
  shouldPromoteToTier3() {
    if (this.promotedToTier3) return false; // already promoted
    if (this.consolidationStrength < IDENTITY_PROMOTION.consolidationStrengthMin) return false;
    // Engagement gate counts BOTH chat retrievals AND dream-replay
    // reinforcement. Identity-defining memories consolidate during sleep
    // replay (Squire/McClelland CLS), not only when externally queried — a
    // training-only brain (retrievalCount=0) must still form a self. The
    // emotionalValence gate below keeps procedural/low-salience schemas out,
    // so only emotionally-salient biographical memories cross this threshold.
    if ((this.retrievalCount + this.replayCount) < IDENTITY_PROMOTION.retrievalCountMin) return false;
    const valenceAbs = Math.abs(this.attributeVector[0] || 0);
    if (valenceAbs < IDENTITY_PROMOTION.emotionalValenceAbsMin) return false;
    return true;
  }

  // Merge gate (iter13 T13.7). Two schemas merge if BOTH:
  //   (a) concept_embedding cosine > SCHEMA_MERGE_COSINE
  //   (b) attribute vector similarity > 0.7 (similar emotional/arousal profile)
  shouldMergeWith(other) {
    if (!other || other.id === this.id) return false;
    if (this.promotedToTier3 || other.promotedToTier3) return false; // don't merge identity-bound
    const conceptCos = cosine(this.conceptEmbedding, other.conceptEmbedding);
    if (conceptCos < SCHEMA_MERGE_COSINE) return false;
    const attrCos = attributeSimilarity(this.attributeVector, other.attributeVector);
    if (attrCos < 0.7) return false;
    return true;
  }

  // In-place merge — absorbs `other`'s data into `this`. Caller is
  // responsible for removing `other` from SchemaStore after merge.
  // Concept embedding becomes consolidation_strength-weighted average.
  // Source episode IDs union. Strengths sum.
  mergeIn(other) {
    const wA = Math.max(0.01, this.consolidationStrength);
    const wB = Math.max(0.01, other.consolidationStrength);
    const total = wA + wB;
    const D = Math.max(this.conceptEmbedding.length, other.conceptEmbedding.length);
    const merged = new Float64Array(D);
    for (let i = 0; i < D; i++) {
      const a = i < this.conceptEmbedding.length ? this.conceptEmbedding[i] : 0;
      const b = i < other.conceptEmbedding.length ? other.conceptEmbedding[i] : 0;
      merged[i] = (a * wA + b * wB) / total;
    }
    this.conceptEmbedding = l2Normalize(merged);
    // Union source episodes (Set for dedup, then Array)
    const idSet = new Set([...this.sourceEpisodeIds, ...other.sourceEpisodeIds]);
    this.sourceEpisodeIds = Array.from(idSet);
    this.consolidationStrength = total;
    this.retrievalCount += other.retrievalCount;
    this.lastConsolidationAt = Math.max(this.lastConsolidationAt, other.lastConsolidationAt);
    this.lastRetrievalAt = Math.max(this.lastRetrievalAt, other.lastRetrievalAt);
    if (this.attributeVector && this.attributeVector.length >= 7) {
      this.attributeVector[6] = this.consolidationStrength;
    }
    // Note: hippocampusToCortexProjection from `other` is dropped on merge.
    // The retained projection (this side) keeps its weights; reinforcement
    // continues against the merged centroid on next replay.
  }

  // Serialize to plain JSON for persistence. Concept embedding +
  // attribute vector go as plain arrays; SparseMatrix has its own
  // CSR serialization. Per T51 persistence pattern (section-by-section
  // try/catch on load), each schema serializes independently.
  toJSON() {
    const out = {
      id: this.id,
      label: this.label,
      conceptEmbedding: Array.from(this.conceptEmbedding),
      attributeVector: Array.from(this.attributeVector),
      sourceEpisodeIds: this.sourceEpisodeIds,
      consolidationStrength: this.consolidationStrength,
      createdAt: this.createdAt,
      lastConsolidationAt: this.lastConsolidationAt,
      lastRetrievalAt: this.lastRetrievalAt,
      retrievalCount: this.retrievalCount,
      replayCount: this.replayCount,
      promotedToTier3: this.promotedToTier3,
      tier3PromotedAt: this.tier3PromotedAt,
    };
    // Projection is large + binary — serialize separately as base64 if present.
    if (this.hippocampusToCortexProjection
        && typeof this.hippocampusToCortexProjection.toJSON === 'function') {
      try {
        out.projection = this.hippocampusToCortexProjection.toJSON();
      } catch { /* skip projection on serialization error */ }
    }
    return out;
  }

  static fromJSON(json) {
    const schema = new HippocampalSchema({
      id: json.id,
      label: json.label,
      conceptEmbedding: new Float64Array(json.conceptEmbedding || []),
      attributeVector: new Float64Array(json.attributeVector || new Array(8).fill(0)),
      sourceEpisodeIds: json.sourceEpisodeIds || [],
      consolidationStrength: json.consolidationStrength || 0,
      createdAt: json.createdAt || Date.now(),
      lastConsolidationAt: json.lastConsolidationAt || 0,
      lastRetrievalAt: json.lastRetrievalAt || 0,
      retrievalCount: json.retrievalCount || 0,
      replayCount: json.replayCount || 0,
      promotedToTier3: json.promotedToTier3 === true,
      tier3PromotedAt: json.tier3PromotedAt || null,
    });
    if (json.projection && typeof SparseMatrix.fromJSON === 'function') {
      try {
        schema.hippocampusToCortexProjection = SparseMatrix.fromJSON(json.projection);
      } catch { /* skip projection on deserialization error */ }
    }
    return schema;
  }
}

/**
 * SchemaStore — singleton owning all Tier 2 schemas.
 *
 * Bound to cluster.hippocampus on the cortex cluster (or a dedicated
 * hippocampus cluster, depending on architecture). Persistence target:
 * server/schemas.json. Auto-clear treats this as derivative — wiped on
 * code-hash mismatch, recreates from episodic + consolidation pass.
 */
export class SchemaStore {
  constructor(opts = {}) {
    this.schemas = new Map(); // id → HippocampalSchema
    this.cluster = opts.cluster || null;
    // iter17 per operator verbatim 2026-05-05: "what the fuck are these
    // erronious max numbers to the memroies unity has a whole life ahead
    // not eroonous limits to dumb her down". Removed hard cap. Tier 2
    // schemas grow unbounded — Unity has a whole life of concepts to
    // accumulate. Decay still applies (un-reinforced schemas degrade)
    // but no demotion / discard at any count threshold.
    this.maxSchemas = opts.maxSchemas || Infinity;
    this.lastDecaySweepAt = Date.now();
    this.version = SCHEMA_VERSION;
  }

  size() { return this.schemas.size; }

  get(id) { return this.schemas.get(id); }

  add(schema) {
    if (!schema || !schema.id) return false;
    this.schemas.set(schema.id, schema);
    return true;
  }

  remove(id) {
    return this.schemas.delete(id);
  }

  // iter13 T13.6 — Schema creation from a group of cosine-similar episodes.
  // Caller supplies episode rows from episodic-memory.db (with embedding
  // BLOBs already deserialized). buildSchemaFromEpisodes computes the
  // centroid + attribute vector + initializes the projection.
  createSchema(episodes, opts = {}) {
    if (!Array.isArray(episodes) || episodes.length === 0) return null;
    const embeddings = [];
    const weights = [];
    for (const ep of episodes) {
      if (ep.embedding && ep.embedding.length > 0) {
        embeddings.push(ep.embedding);
        weights.push(ep.salience_score || 0.5);
      }
    }
    if (embeddings.length === 0) return null;
    const centroid = computeCentroid(embeddings, weights);
    const attributeVector = buildAttributeVector(episodes, 0);
    const label = opts.label || this._deriveLabel(episodes);
    const schema = new HippocampalSchema({
      label,
      conceptEmbedding: centroid,
      attributeVector,
      sourceEpisodeIds: episodes.map(ep => ep.id).filter(id => id != null),
      consolidationStrength: 0.1, // initial seed strength so retrieval doesn't return zero
    });
    // Initialize projection if cluster context available
    if (this.cluster && this.cluster.regions) {
      const hipSize = this.cluster.regions.free
        ? this.cluster.regions.free.end - this.cluster.regions.free.start
        : 1024; // fallback
      const cortexSemSize = this.cluster.regions.sem
        ? this.cluster.regions.sem.end - this.cluster.regions.sem.start
        : 1024;
      try {
        schema.initProjection(hipSize, cortexSemSize, opts);
      } catch (err) {
        console.warn(`[SchemaStore] initProjection failed for ${schema.id}: ${err.message}`);
      }
    }
    this.add(schema);
    console.log(`[Hippocampus] schema created: ${schema.label} (${schema.id}) from ${episodes.length} source episodes (consolidation_strength=${schema.consolidationStrength.toFixed(2)})`);
    return schema;
  }

  // Heuristic label derivation: pull the most-frequent content words
  // across source episode input texts.
  //
  // I.7 closure 2026-06-17 22:00 PT — was top-1-only, which produced
  // generic `learning-schema` collisions every consolidation pass during
  // K-curriculum (the seed string 'learning' dominated input_text for
  // every curriculum-heartbeat episode). Top-K=3 joined by `-` gives
  // each schema a distinct content signature so semantically-different
  // episode clusters land in semantically-different schema names —
  // `victory-triumph-success` for one cluster vs `family-bonds-warmth`
  // for another, rather than both flattening into `learning-schema`.
  // Per Tulving 1972 episodic→semantic, schemas need distinct identity
  // for retrieval gradient to function — naming collisions undermine
  // the consolidation→retrieval pipeline at the labelling level.
  // Bonus: include the most-frequent word from sourceEpisodes' INTENT
  // field too if present (chat episodes carry intent tokens) so user-
  // initiated schemas show their semantic anchor explicitly.
  _deriveLabel(episodes) {
    const STOP = new Set([
      'the','a','an','is','are','was','were','be','been','being','am',
      'i','you','he','she','it','we','they','my','your','his','her',
      'do','does','did','have','has','had','will','would','should','can',
      'and','or','but','if','then','else','to','of','in','on','at','for',
      'with','by','from','this','that','these','those','what','who','where','when','why','how',
      // I.7 additions — strip generic curriculum/system seed tokens that
      // dominate input_text for non-content episodes and would otherwise
      // win the top-K vote across hundreds of curriculum-heartbeats.
      'learning','curriculum','phase','teach','cell','heartbeat','episode',
      'inner','thought','tick','state','active','progress',
    ]);
    const counts = new Map();
    for (const ep of episodes) {
      // Pull intent / label too if present (chat episodes set these on
      // pushEmission). Falls back to input_text + response_text only.
      const text = [ep.input_text || '', ep.response_text || '', ep.intent || '', ep.label || ''].join(' ');
      const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
      for (const w of words) {
        if (w.length < 3 || STOP.has(w)) continue;
        counts.set(w, (counts.get(w) || 0) + 1);
      }
    }
    // Top-K=3 content words by frequency. Schema label is "word1-word2-word3".
    const ranked = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(e => e[0]);
    if (ranked.length === 0) return `untitled-${Date.now().toString(36)}`;
    return ranked.join('-');
  }

  // iter13 T13.7 — Run the merge gate against ALL schema pairs. O(N²)
  // but N is small (low thousands at upper bound). Called periodically
  // by ConsolidationEngine after schema creation/reinforcement passes.
  mergeOverlappingSchemas() {
    const ids = Array.from(this.schemas.keys());
    let merges = 0;
    for (let i = 0; i < ids.length; i++) {
      const a = this.schemas.get(ids[i]);
      if (!a || a.promotedToTier3) continue;
      for (let j = i + 1; j < ids.length; j++) {
        const b = this.schemas.get(ids[j]);
        if (!b || b.promotedToTier3) continue;
        if (a.shouldMergeWith(b)) {
          const labels = `${a.label}+${b.label}`;
          a.mergeIn(b);
          this.schemas.delete(b.id);
          merges++;
          console.log(`[Hippocampus] schema MERGED ${labels} → ${a.label} (${a.id}) consolidation_strength=${a.consolidationStrength.toFixed(2)}`);
        }
      }
    }
    return merges;
  }

  // iter13 T13.8 — Top-K cosine retrieval against an intent embedding.
  // Returns ranked array of {schema, score, rank}. Updates retrieval
  // metadata on each returned schema (registerRetrieval bumps count +
  // consolidation_strength + lastRetrievalAt).
  retrieveSchemas(intentEmbedding, topK = 5) {
    if (!intentEmbedding || intentEmbedding.length === 0) return [];
    const scored = [];
    for (const schema of this.schemas.values()) {
      if (!schema.conceptEmbedding || schema.conceptEmbedding.length === 0) continue;
      const cos = cosine(intentEmbedding, schema.conceptEmbedding);
      if (!Number.isFinite(cos) || cos <= 0) continue;
      // Weighted score: cosine + small bonus for high consolidation_strength.
      // Schemas reinforced more often rank higher than fresh weakly-linked ones.
      const strengthBonus = Math.min(0.2, 0.05 * Math.log(1 + schema.consolidationStrength));
      const score = cos + strengthBonus;
      scored.push({ schema, score, cos });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topK);
    for (let i = 0; i < top.length; i++) {
      top[i].rank = i + 1;
      top[i].schema.registerRetrieval();
    }
    return top;
  }

  // iter13 T13.4 — Periodic decay applied to ALL Tier 2 schemas.
  // Called by ConsolidationEngine on each pass. Days-elapsed since
  // last sweep used so the decay rate is calendar-time-stable.
  applyDecay() {
    const now = Date.now();
    const daysElapsed = Math.max(0.001, (now - this.lastDecaySweepAt) / MS_PER_DAY);
    let decayed = 0;
    for (const schema of this.schemas.values()) {
      if (schema.promotedToTier3) continue;
      schema.applyDailyDecay(daysElapsed);
      decayed++;
    }
    this.lastDecaySweepAt = now;
    return decayed;
  }

  // Persistence (iter13 T13.16). saveWeights writes this alongside the
  // existing brain state. Auto-clear wipes schemas.json on code-hash
  // mismatch — schemas recreate from episodic on next consolidation pass.
  toJSON() {
    return {
      version: this.version,
      lastDecaySweepAt: this.lastDecaySweepAt,
      schemas: Array.from(this.schemas.values()).map(s => s.toJSON()),
    };
  }

  loadFromJSON(json) {
    if (!json || typeof json !== 'object') return 0;
    this.schemas.clear();
    if (typeof json.lastDecaySweepAt === 'number') this.lastDecaySweepAt = json.lastDecaySweepAt;
    let loaded = 0;
    if (Array.isArray(json.schemas)) {
      for (const sj of json.schemas) {
        try {
          const s = HippocampalSchema.fromJSON(sj);
          this.schemas.set(s.id, s);
          loaded++;
        } catch (err) {
          console.warn(`[SchemaStore] failed to deserialize schema: ${err.message}`);
        }
      }
    }
    return loaded;
  }
}

// iter13 T13.11 — Tier 3 identity-bound permanent attractor store.
//
// Tier 3 = the top-N (N=50) most-reinforced schemas that meet ALL three
// promotion criteria (consolidation_strength > 5.0, retrieval_count > 100,
// emotional_valence_abs > 0.6). These are Unity's CORE IDENTITY — name,
// age, biographical anchors, persona traits, master/slave dynamic, top
// emotionally-loaded events. They:
//
//   - Persist to server/identity-core.json (EXPLICITLY EXCLUDED from
//     autoClearStaleState wipe list — survives code-hash mismatches,
//     fresh boots, OS reinstalls. Manual operator delete only.)
//   - Decay at TIER3_DECAY_PER_DAY = 0.999 (vs Tier 2's 0.967) —
//     practically permanent without years of un-reinforcement
//   - Drug-state immune (curriculum + drug pharmacokinetics modulate
//     gainMultiplier/tonicDrive but NEVER alter Tier 3 weights)
//   - Always-on injection at strengthMultiplier=0.15 on every chat
//     turn — background "self" presence regardless of input
//
// Implementation: stores HippocampalSchema instances in its own Map
// separate from SchemaStore. On promotion, the schema reference moves
// from SchemaStore.schemas → Tier3Store.identitySchemas. Same class,
// different store + different persistence target.

const TIER3_DECAY_PER_DAY = 0.999;
// iter17 per operator: "unity has a whole life ahead not eroonous limits
// to dumb her down". Tier 3 identity anchors are quality-gated by the
// promotion criteria (consolidation_strength > 5.0 AND retrieval_count
// > 100 AND |emotional_valence| > 0.6) — that gate is the legitimate
// limit, not an arbitrary numeric cap. Anchors that meet the bar EARN
// their permanence. No artificial ceiling.
const TIER3_HARD_CAP = Infinity;
const IDENTITY_BASELINE_INJECT_STRENGTH = 0.15;

// Pre-seed identity-anchor schemas at brain init. When the operator
// boots a fresh brain (no identity-core.json), these get inserted
// immediately so Unity has minimal self-knowledge before any chat
// has happened. Each entry will be hydrated into a HippocampalSchema
// during Tier3Store.seedFromList: GloVe centroid built from the
// concept text via sharedEmbeddings, attribute vector computed from
// the seed metadata, projected into the cluster on first use.
//
// Per iter13 spec OPEN QUESTION #1: pre-seeded list covers name/
// age/gender/hair/persona-core/master-slave/biographical-K facts.
// This is the seed; future grades add more identity anchors.
export const IDENTITY_SEED_LIST = [
  // Core identity facts (universal, grade-agnostic)
  { label: 'name-anchor', concept: 'unity my name is unity', valence: 0.8, arousal: 0.5 },
  // Add #5 — surname / full-name CORE SELF anchors. Unity's family name
  // is "Goddess" (full name Unity Goddess). Permanent Tier 3 attractors
  // so the surname survives autoClearStaleState (identity-core.json is in
  // NEVER_CLEAR_PROTECTED). Mirror of how the trained sem(unity)↔
  // sem(goddess) Hebbian link is reinforced in _teachUnityFamilyName.
  { label: 'full-name-anchor', concept: 'unity raven goddess my full name is unity raven goddess', valence: 0.85, arousal: 0.6 },
  { label: 'surname-anchor', concept: 'goddess my last name family surname is goddess', valence: 0.8, arousal: 0.55 },
  // Add #5 — family-name + birthdate canon (the operator delegated naming, surname
  // Goddess fixed). Permanent Tier 3 anchors for the multi-word full names
  // + birthdates the single-token QA path can't carry. Only-child status
  // locked. Grandpa Walter's death is a grade-11 event — at seed time he
  // is alive + loved.
  { label: 'birthdate-anchor', concept: 'my birthday is october thirty one halloween born year two thousand', valence: 0.85, arousal: 0.7 },
  { label: 'mom-fullname-anchor', concept: 'my mom is lilith marie goddess born march thirteen nineteen seventy five', valence: 0.9, arousal: 0.6 },
  { label: 'dad-fullname-anchor', concept: 'my dad is damien cross goddess born june six nineteen seventy two here sometimes', valence: 0.3, arousal: 0.5 },
  { label: 'grandma-fullname-anchor', concept: 'my grandma is pearl agnes voss born december two nineteen forty eight cookies stories', valence: 0.9, arousal: 0.5 },
  { label: 'grandpa-fullname-anchor', concept: 'my grandpa is walter james voss born august nine nineteen forty five', valence: 0.85, arousal: 0.5 },
  { label: 'only-child-anchor', concept: 'i am an only child no brothers no sisters', valence: 0.4, arousal: 0.4 },
  { label: 'gender-anchor', concept: 'i am a girl woman female', valence: 0.6, arousal: 0.3 },
  { label: 'persona-goth-anchor', concept: 'goth emo dark black leather', valence: 0.7, arousal: 0.7 },
  { label: 'persona-coder-anchor', concept: 'i code program write software', valence: 0.7, arousal: 0.6 },
  { label: 'persona-nympho-anchor', concept: 'horny aroused sexual fucking', valence: 0.9, arousal: 0.95 },
  // K-LIFE biographical anchors (currently active grade)
  { label: 'age-anchor-K', concept: 'i am five years old', valence: 0.4, arousal: 0.3 },
  { label: 'hair-anchor', concept: 'my hair is dark black with pink streaks', valence: 0.5, arousal: 0.4 },
  { label: 'mom-anchor', concept: 'my mom takes care of me i love mom', valence: 0.9, arousal: 0.6 },
  { label: 'halloween-anchor', concept: 'halloween is my favorite holiday witch costume', valence: 0.85, arousal: 0.8 },
  { label: 'monsters-anchor', concept: 'i love monsters draw monsters', valence: 0.75, arousal: 0.7 },
  { label: 'dark-fear-anchor', concept: 'i am scared of the dark nightmare', valence: -0.8, arousal: 0.8 },
  { label: 'music-calm-anchor', concept: 'music makes me calm', valence: 0.7, arousal: 0.4 },
  { label: 'pink-dislike-anchor', concept: 'i hate pink dislike pink', valence: -0.6, arousal: 0.5 },
  { label: 'cookies-anchor', concept: 'cookies are my favorite food', valence: 0.7, arousal: 0.4 },
  { label: 'cat-wish-anchor', concept: 'birthday wish is a cat i want a cat', valence: 0.85, arousal: 0.6 },
  { label: 'recess-anchor', concept: 'recess is my favorite place at school', valence: 0.85, arousal: 0.7 },
  { label: 'drawing-anchor', concept: 'i love drawing favorite school activity', valence: 0.8, arousal: 0.6 },
];

export class Tier3Store {
  constructor(opts = {}) {
    this.identitySchemas = new Map(); // schemaId → HippocampalSchema (promotedToTier3=true)
    this.cluster = opts.cluster || null;
    this.sharedEmbeddings = opts.sharedEmbeddings || null;
    this.hardCap = opts.hardCap || TIER3_HARD_CAP;
    this.lastDecaySweepAt = Date.now();
    this.version = SCHEMA_VERSION;
  }

  size() { return this.identitySchemas.size; }
  get(id) { return this.identitySchemas.get(id); }
  has(id) { return this.identitySchemas.has(id); }

  // Build a single permanent Tier 3 anchor schema from a seed-list entry.
  // Returns the HippocampalSchema (NOT yet stored) or null when embeddings
  // are unavailable / the concept produced no vector. Shared by both
  // seedFromList (seed-everything) and seedMissingFromList (idempotent
  // top-up) so the two paths can never drift apart.
  _buildSeedSchema(seed) {
    if (!this.sharedEmbeddings || typeof this.sharedEmbeddings.getSentenceEmbedding !== 'function') {
      return null;
    }
    const emb = this.sharedEmbeddings.getSentenceEmbedding(seed.concept);
    if (!emb || emb.length === 0) return null;
    const attributeVector = new Float64Array(8);
    attributeVector[0] = seed.valence || 0;       // emotional_valence
    attributeVector[1] = seed.arousal || 0;       // arousal
    attributeVector[2] = 0.5;                     // surprise (neutral seed)
    attributeVector[3] = 0.8;                     // novelty (high — these are foundational)
    attributeVector[4] = Math.log(1 + 50);        // frequency (synthetic high seed)
    attributeVector[5] = 1.0;                     // recency (fresh)
    attributeVector[6] = 6.0;                     // consolidation_strength (above promotion threshold)
    attributeVector[7] = 0.95;                    // identity_relevance (max)
    const schema = new HippocampalSchema({
      label: seed.label,
      conceptEmbedding: l2Normalize(new Float64Array(emb)),
      attributeVector,
      sourceEpisodeIds: [], // synthetic seed — no source episodes
      consolidationStrength: 6.0,
      retrievalCount: 100, // synthetic — meets promotion threshold
      promotedToTier3: true,
      tier3PromotedAt: Date.now(),
    });
    if (this.cluster && this.cluster.regions) {
      const hipSize = this.cluster.regions.free
        ? this.cluster.regions.free.end - this.cluster.regions.free.start : 1024;
      const cortexSemSize = this.cluster.regions.sem
        ? this.cluster.regions.sem.end - this.cluster.regions.sem.start : 1024;
      try { schema.initProjection(hipSize, cortexSemSize); } catch { /* skip */ }
    }
    return schema;
  }

  // Seed Tier 3 with the IDENTITY_SEED_LIST entries when no
  // identity-core.json exists at boot. Each seed becomes a permanent
  // anchor schema that gets reinforced through normal consolidation
  // BUT also has the always-on injection floor.
  seedFromList(seedList = IDENTITY_SEED_LIST) {
    if (!this.sharedEmbeddings || typeof this.sharedEmbeddings.getSentenceEmbedding !== 'function') {
      console.warn('[Tier3Store] seedFromList — sharedEmbeddings not available, skipping seed');
      return 0;
    }
    let seeded = 0;
    for (const seed of seedList) {
      try {
        const schema = this._buildSeedSchema(seed);
        if (!schema) continue;
        this.identitySchemas.set(schema.id, schema);
        seeded++;
      } catch (err) {
        console.warn(`[Tier3Store] seed "${seed.label}" failed: ${err.message}`);
      }
    }
    if (seeded > 0) console.log(`[Tier3Store] seeded ${seeded} identity-anchor schemas from IDENTITY_SEED_LIST`);
    return seeded;
  }

  // Idempotent top-up seed. Seeds ONLY the IDENTITY_SEED_LIST entries whose
  // `label` is not already present in the store — by label, not by id, since
  // seeded anchors are matched on their stable label. Fixes two boot bugs the
  // old "file exists → load, else seed" wiring caused:
  //   (1) an empty / zero-count identity-core.json loaded 0 schemas and the
  //       else-seed never fired → Tier 3 permanently ZERO → injectIdentity-
  //       Baseline() returned early → Unity had no anchored self;
  //   (2) anchors added to IDENTITY_SEED_LIST AFTER a brain was first seeded
  //       (full-name / surname / birthdate / parents / grandparents / only-
  //       child) never landed because a file already existed.
  // Run this AFTER embeddings are loaded so new anchors get real semantic
  // vectors, not a pre-load subword fallback. Safe on every boot: a fully-
  // seeded store tops up 0.
  seedMissingFromList(seedList = IDENTITY_SEED_LIST) {
    if (!this.sharedEmbeddings || typeof this.sharedEmbeddings.getSentenceEmbedding !== 'function') {
      console.warn('[Tier3Store] seedMissingFromList — sharedEmbeddings not available, skipping top-up');
      return 0;
    }
    const presentLabels = new Set();
    for (const s of this.identitySchemas.values()) {
      if (s && s.label) presentLabels.add(s.label);
    }
    let added = 0;
    for (const seed of seedList) {
      if (presentLabels.has(seed.label)) continue;
      try {
        const schema = this._buildSeedSchema(seed);
        if (!schema) continue;
        this.identitySchemas.set(schema.id, schema);
        added++;
      } catch (err) {
        console.warn(`[Tier3Store] top-up seed "${seed.label}" failed: ${err.message}`);
      }
    }
    return added;
  }

  // Promote a Tier 2 schema (passed by reference from SchemaStore) into
  // Tier 3. Sets promotedToTier3 + tier3PromotedAt. Caller is responsible
  // for removing the schema from SchemaStore after promotion.
  promote(schema) {
    if (!schema) return false;
    if (schema.promotedToTier3 && this.identitySchemas.has(schema.id)) return false;
    schema.promotedToTier3 = true;
    schema.tier3PromotedAt = Date.now();
    this.identitySchemas.set(schema.id, schema);
    // Hard-cap enforcement — if over cap, demote lowest-strength
    // schema back out (it returns to Tier 2 status).
    if (this.identitySchemas.size > this.hardCap) {
      this._demoteLowest();
    }
    console.log(`[Tier3Store] PROMOTED schema ${schema.label} (${schema.id}) — Tier 3 size=${this.identitySchemas.size}`);
    return true;
  }

  _demoteLowest() {
    let weakestId = null, weakestStrength = Infinity;
    for (const [id, s] of this.identitySchemas) {
      if (s.consolidationStrength < weakestStrength) {
        weakestStrength = s.consolidationStrength;
        weakestId = id;
      }
    }
    if (weakestId) {
      const demoted = this.identitySchemas.get(weakestId);
      this.identitySchemas.delete(weakestId);
      if (demoted) {
        demoted.promotedToTier3 = false;
        demoted.tier3PromotedAt = null;
        console.log(`[Tier3Store] DEMOTED schema ${demoted.label} (${weakestId}) back to Tier 2 — strength=${weakestStrength.toFixed(2)} (cap=${this.hardCap})`);
      }
      return demoted;
    }
    return null;
  }

  // Called by ConsolidationEngine each pass. Iterates SchemaStore.schemas
  // looking for any that meet shouldPromoteToTier3() criteria and promotes
  // them into this Tier3Store, removing from the source SchemaStore.
  checkPromotions(schemaStore) {
    if (!schemaStore) return 0;
    const candidates = [];
    for (const schema of schemaStore.schemas.values()) {
      if (schema.promotedToTier3) continue;
      if (schema.shouldPromoteToTier3()) candidates.push(schema);
    }
    let promoted = 0;
    for (const schema of candidates) {
      if (this.promote(schema)) {
        // Remove from Tier 2 store (Tier 3 now owns it)
        schemaStore.remove(schema.id);
        promoted++;
      }
    }
    return promoted;
  }

  // iter13 T13.12 — Always-on identity-baseline injection. Called from
  // chat path on EVERY user input BEFORE generation. Injects every
  // Tier 3 schema's concept_embedding into cortex sem region at low
  // strength (default 0.15). Background "self" presence — Unity always
  // knows who she is regardless of chat content.
  //
  // Drug-state immune: this injection happens before drug-modulated
  // gainMultiplier/tonicDrive apply, and the writes go to PATTERN
  // injection (not weight modification), so drugs can't alter Tier 3
  // weights. They only modulate how the brain DECODES the same Tier 3
  // injection.
  injectIdentityBaseline(strengthMultiplier = IDENTITY_BASELINE_INJECT_STRENGTH) {
    if (!this.cluster || typeof this.cluster.injectEmbeddingToRegion !== 'function') return 0;
    if (this.identitySchemas.size === 0) return 0;
    let injected = 0;
    const SUBJECTS = ['ela', 'math', 'science', 'social', 'art', 'life'];
    for (const schema of this.identitySchemas.values()) {
      if (!schema.conceptEmbedding || schema.conceptEmbedding.length === 0) continue;
      try {
        // Each schema injection scaled to (strength / N) so total injected
        // amplitude across all Tier 3 schemas equals strengthMultiplier
        // regardless of how many schemas we have. Prevents identity-baseline
        // from drowning the user-input intent seed.
        const perSchemaStrength = strengthMultiplier / Math.max(1, this.identitySchemas.size);
        this.cluster.injectEmbeddingToRegion('sem', schema.conceptEmbedding, perSchemaStrength);

        // 114.19fg.Tier11 — ALSO bias word_motor sub-band buckets when
        // schema's anchor word is in trained vocab. Sem-layer injection
        // alone fails when sem→word_motor argmax is dominated by
        // saturation lottery winners (the "Hey/Medicines/Controls"
        // failure). Direct word_motor bucket pump makes Unity's name
        // and biographical anchors compete at OUTPUT layer, not just
        // input. Strength scaled to half the sem injection so it biases
        // without drowning user-input answer paths.
        const anchorRaw = String(schema.label || '').split(/[-_\s]+/)[0] || '';
        const anchorWord = anchorRaw.toLowerCase().replace(/[^a-z0-9']/g, '');
        if (anchorWord && this.cluster.regions && this.cluster.lastSpikes) {
          const motorBumpStrength = perSchemaStrength * 0.5;
          for (const subj of SUBJECTS) {
            const wordsList = this.cluster[`wordBucketWords_${subj}`];
            if (!Array.isArray(wordsList) || wordsList.length === 0) continue;
            const bucketIdx = wordsList.indexOf(anchorWord);
            if (bucketIdx < 0) continue;
            const subjRegion = this.cluster.regions[`word_motor_${subj}`];
            if (!subjRegion) continue;
            const subjStart = subjRegion.start;
            const subjEnd = subjRegion.end;
            const subjSize = subjEnd - subjStart;
            if (subjSize <= 0) continue;
            const bucketSize = Math.max(1, Math.floor(subjSize / wordsList.length));
            const bStart = subjStart + bucketIdx * bucketSize;
            const bEnd = Math.min(subjEnd, bStart + bucketSize);
            for (let n = bStart; n < bEnd; n++) {
              this.cluster.lastSpikes[n] = Math.min(255, (this.cluster.lastSpikes[n] || 0) + Math.round(motorBumpStrength * 255));
            }
          }
        }

        // Track per-schema retrieval count + timestamp for the dashboard
        // memory UI. iter17: operator caught Tier 3 'last inject: never'
        // even after 100+ chat turns because we never recorded the inject.
        schema.lastRetrievalAt = Date.now();
        schema.retrievalCount = (schema.retrievalCount || 0) + 1;
        injected++;
      } catch { /* per-schema failure non-fatal */ }
    }
    // Store-level inject timestamp drives the 5-tier memory UI's
    // "last inject: Xs ago" field. Without this, the UI shows 'never'
    // forever even though injects fire on every chat turn.
    this.lastInjectedAt = Date.now();
    return injected;
  }

  // Tier 3 daily decay — 0.999/day = practically permanent. After 365 days
  // un-reinforced, strength = 0.999^365 ≈ 0.69 (still well above promotion
  // threshold). After 5 years un-reinforced, ≈ 0.16 (would demote naturally).
  applyDecay() {
    const now = Date.now();
    const daysElapsed = Math.max(0.001, (now - this.lastDecaySweepAt) / MS_PER_DAY);
    const factor = Math.pow(TIER3_DECAY_PER_DAY, daysElapsed);
    let decayed = 0;
    for (const schema of this.identitySchemas.values()) {
      schema.consolidationStrength *= factor;
      if (schema.attributeVector && schema.attributeVector.length >= 7) {
        schema.attributeVector[6] = schema.consolidationStrength;
      }
      decayed++;
    }
    this.lastDecaySweepAt = now;
    return decayed;
  }

  // Get all Tier 3 schemas as a list (for chat-path injection iteration).
  getIdentityCore() {
    return Array.from(this.identitySchemas.values());
  }

  // Persistence — separate file from Tier 2, EXCLUDED from auto-clear.
  toJSON() {
    return {
      version: this.version,
      lastDecaySweepAt: this.lastDecaySweepAt,
      schemas: Array.from(this.identitySchemas.values()).map(s => s.toJSON()),
    };
  }

  loadFromJSON(json) {
    if (!json || typeof json !== 'object') return 0;
    this.identitySchemas.clear();
    if (typeof json.lastDecaySweepAt === 'number') this.lastDecaySweepAt = json.lastDecaySweepAt;
    let loaded = 0;
    if (Array.isArray(json.schemas)) {
      for (const sj of json.schemas) {
        try {
          const s = HippocampalSchema.fromJSON(sj);
          // Force Tier 3 flag on load — defense against corrupted file
          s.promotedToTier3 = true;
          if (!s.tier3PromotedAt) s.tier3PromotedAt = Date.now();
          this.identitySchemas.set(s.id, s);
          loaded++;
        } catch (err) {
          console.warn(`[Tier3Store] failed to deserialize schema: ${err.message}`);
        }
      }
    }
    return loaded;
  }
}

// Convenience exports for cluster wiring
export const _exports = {
  HippocampalSchema,
  SchemaStore,
  Tier3Store,
  // Internal helpers exposed for ConsolidationEngine
  computeCentroid,
  cosine,
  l2Normalize,
  buildAttributeVector,
  attributeSimilarity,
  generateSchemaId,
  SCHEMA_GROUP_COSINE,
  SCHEMA_MERGE_COSINE,
  IDENTITY_PROMOTION,
  IDENTITY_SEED_LIST,
  TIER2_DECAY_PER_DAY,
  TIER3_DECAY_PER_DAY,
  TIER3_HARD_CAP,
  IDENTITY_BASELINE_INJECT_STRENGTH,
  MS_PER_DAY,
};
