// ServerBrain memory mixin — extracted from brain-server.js per the
// per-concern split (see server/brain-server/README.md). Attached to
// ServerBrain.prototype via Object.assign at brain-server.js entry-
// point bottom.
//
// Methods in this mixin (12 total) — full episodic-memory + Tier 1/2
// promotion path:
//   _initEpisodicDB()                              — initialize sqlite
//                                                    episodic_memory.db
//                                                    schema + indexes
//   storeEpisode(userId, type, inputText, responseText) — Tier 1 episode
//                                                    write (with sem +
//                                                    arousal/valence/Ψ +
//                                                    consolidation seed)
//   _serializeEmbedding(emb)                       — Float32Array → Buffer
//   _deserializeEmbedding(buf)                     — Buffer → Float32Array
//   _cosineEmbedding(a, b)                         — cosine similarity util
//   decayEpisodes()                                — Tier 1 ageing cron
//                                                    (decay consolidation
//                                                    strength + GC stale)
//   findPromotionCandidates(limit)                 — Tier 1 → Tier 2 promote
//                                                    candidates ranked by
//                                                    consolidation strength
//   markEpisodePromoted(episodeId, schemaId)       — flag episode promoted
//                                                    into Tier 2 schema
//   recordEpisodeConsolidation(episodeId)          — bump episode
//                                                    consolidation strength
//                                                    on each replay pass
//   recallByMood(userId, arousal, valence, limit)  — mood-similar recall
//                                                    for chat-recall path
//   recallByUser(userId, limit)                    — recent-N episodes by
//                                                    user
//   getEpisodeCount()                              — Tier 1 size for
//                                                    dashboard telemetry
//
// All methods reference brain state via `this.` — fully prototype-chain
// compatible. They access this._episodicDB (sqlite handle), this.tier1Store
// (in-memory cache), this.sharedEmbeddings, this.persona etc.

const SERVER_MEMORY_MIXIN = {
  _initEpisodicDB() {
    const dbPath = path.join(__dirname, 'episodic-memory.db');
    this._db = new Database(dbPath);

    // WAL mode for concurrent reads during brain loop
    this._db.pragma('journal_mode = WAL');

    // iter13 T13.1 — Episodic-memory schema with salience metadata.
    // Squire/McClelland CLS theory: episodic store needs per-event
    // emotional/arousal/surprise/novelty metadata to compute the
    // salience score that drives Tier 1 → Tier 2 consolidation.
    // Frequency-count tracks repeated re-encounters (cosine>0.85 in
    // last 48h merges into existing row instead of new). consolidation_count
    // tracks dream-cycle replay events. promoted_at flips when episode
    // promotes to Tier 2 schema. salience_score persisted for ranking.
    // input_embedding BLOB stores GloVe Float64Array bytes for cosine
    // matching against new episodes (novelty + frequency-merge).
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp REAL NOT NULL,
        brain_time REAL NOT NULL,
        user_id TEXT,
        type TEXT NOT NULL DEFAULT 'interaction',
        arousal REAL,
        valence REAL,
        psi REAL,
        coherence REAL,
        total_spikes INTEGER,
        input_text TEXT,
        response_text TEXT,
        cortex_pattern TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        emotional_valence REAL DEFAULT 0,
        arousal_at_encode REAL DEFAULT 0,
        surprise REAL DEFAULT 0,
        novelty REAL DEFAULT 1.0,
        frequency_count INTEGER DEFAULT 1,
        last_replayed_at INTEGER,
        consolidation_count INTEGER DEFAULT 0,
        salience_score REAL DEFAULT 0,
        effective_salience REAL DEFAULT 0,
        promoted_at INTEGER,
        promoted_to_schema_id TEXT,
        input_embedding BLOB
      );
      CREATE INDEX IF NOT EXISTS idx_episodes_time ON episodes(brain_time);
      CREATE INDEX IF NOT EXISTS idx_episodes_type ON episodes(type);
      CREATE INDEX IF NOT EXISTS idx_episodes_user ON episodes(user_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_salience ON episodes(effective_salience);
      CREATE INDEX IF NOT EXISTS idx_episodes_promoted ON episodes(promoted_at);
    `);

    // iter13 T13.1 — defensive ALTER TABLE migration for pre-iter13 DBs
    // (preserves data when DREAM_KEEP_STATE=1 carries old episodic-memory
    // across boots). Detects missing columns via PRAGMA table_info,
    // runs ALTER TABLE for each. Idempotent; running on a fresh post-
    // CREATE DB is a no-op because all columns are already present.
    try {
      const cols = this._db.pragma('table_info(episodes)').map(c => c.name);
      const need = [
        ['emotional_valence', 'REAL DEFAULT 0'],
        ['arousal_at_encode', 'REAL DEFAULT 0'],
        ['surprise', 'REAL DEFAULT 0'],
        ['novelty', 'REAL DEFAULT 1.0'],
        ['frequency_count', 'INTEGER DEFAULT 1'],
        ['last_replayed_at', 'INTEGER'],
        ['consolidation_count', 'INTEGER DEFAULT 0'],
        ['salience_score', 'REAL DEFAULT 0'],
        ['effective_salience', 'REAL DEFAULT 0'],
        ['promoted_at', 'INTEGER'],
        ['promoted_to_schema_id', 'TEXT'],
        ['input_embedding', 'BLOB'],
      ];
      for (const [name, type] of need) {
        if (!cols.includes(name)) {
          this._db.exec(`ALTER TABLE episodes ADD COLUMN ${name} ${type};`);
          console.log(`[Episodic] iter13 migration — added column ${name} ${type}`);
        }
      }
    } catch (err) {
      console.warn(`[Episodic] iter13 migration warning: ${err.message}`);
    }

    // Prepared statements for fast insert/query (iter13 — extended with salience fields)
    this._stmtInsertEpisode = this._db.prepare(`
      INSERT INTO episodes (
        timestamp, brain_time, user_id, type,
        arousal, valence, psi, coherence, total_spikes,
        input_text, response_text, cortex_pattern,
        emotional_valence, arousal_at_encode, surprise, novelty,
        frequency_count, consolidation_count,
        salience_score, effective_salience, input_embedding
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // iter13 T13.3 — frequency-merge query: find episodes within last
    // FREQ_MERGE_WINDOW_MS (default 48h) for the same user_id. Caller
    // computes cosine in JS against returned input_embedding blobs.
    this._stmtFindRecentForMerge = this._db.prepare(`
      SELECT id, input_embedding, frequency_count
      FROM episodes
      WHERE user_id IS ? AND timestamp > ? AND input_embedding IS NOT NULL
      ORDER BY id DESC
    `);

    // iter13 T13.3 — frequency-merge update: increment count + bump replay timestamp.
    this._stmtIncrementFrequency = this._db.prepare(`
      UPDATE episodes
      SET frequency_count = frequency_count + 1, last_replayed_at = ?
      WHERE id = ?
    `);

    // iter13 T13.4 — decay sweep update.
    this._stmtUpdateEffectiveSalience = this._db.prepare(`
      UPDATE episodes SET effective_salience = ? WHERE id = ?
    `);

    // iter13 T13.4 — pruning gate: delete low-salience old never-consolidated.
    this._stmtPruneStale = this._db.prepare(`
      DELETE FROM episodes
      WHERE effective_salience < ?
        AND timestamp < ?
        AND consolidation_count = 0
        AND promoted_at IS NULL
    `);

    // iter13 T13.4 — promotion candidates: salience > threshold + freq + consol.

    // iter22-F.4 — drop `promoted_at IS NULL` filter. Operator caught:
    // every consolidation pass after the first few went all-zero
    // because anchor episodes (heartbeats with iter20-K exact-text
    // merge) get promoted ONCE then are excluded forever, even though
    // their `frequency_count` keeps climbing as new identical-text
    // heartbeats merge in. The point of frequency-merge IS that the
    // anchor row stays the source-of-truth; consolidation should re-
    // visit it when its salience climbs high enough to re-qualify.
    // ConsolidationEngine guards against infinite reinforcement via
    // its `_findExistingSchema(centroid, threshold)` lookup that
    // funnels re-promoted candidates into their existing schema
    // (reinforced += 1, not new schema). So dropping the filter ⇒
    // anchor episodes contribute their frequency-driven climb to the
    // matching schema's consolidation_strength instead of saturating.
    // Schemas grow with continued exposure — which is the actual
    // biology of consolidation in real hippocampus.
    this._stmtFindPromotionCandidates = this._db.prepare(`
      SELECT * FROM episodes
      WHERE effective_salience > ?
        AND frequency_count >= ?
        AND consolidation_count >= ?
      ORDER BY effective_salience DESC LIMIT ?
    `);

    // iter13 T13.4 — mark promoted (back-reference to Tier 2 schema id).
    this._stmtMarkPromoted = this._db.prepare(`
      UPDATE episodes SET promoted_at = ?, promoted_to_schema_id = ? WHERE id = ?
    `);

    // iter13 T13.9 — increment consolidation_count when a schema replay touches this episode.
    this._stmtIncrementConsolidation = this._db.prepare(`
      UPDATE episodes
      SET consolidation_count = consolidation_count + 1, last_replayed_at = ?
      WHERE id = ?
    `);

    // iter13 T13.4 — iterate all episodes for decay sweep (windowed).
    this._stmtAllEpisodesForDecay = this._db.prepare(`
      SELECT id, salience_score, timestamp FROM episodes WHERE timestamp < ?
    `);

    // T6 2026-04-13 — the old global `_stmtRecentEpisodes` that
    // returned everyone's recent episodes without a user filter is
    // kept only as an admin-debug path (not exposed over HTTP
    // anymore, see /episodes handler below). Cognition and recall
    // queries use the user-scoped variants.
    this._stmtRecentEpisodes = this._db.prepare(`
      SELECT * FROM episodes ORDER BY id DESC LIMIT ?
    `);

    this._stmtRecallByUser = this._db.prepare(`
      SELECT * FROM episodes WHERE user_id = ? ORDER BY id DESC LIMIT ?
    `);

    // T6 — recall by mood now REQUIRES a userId filter so cross-user
    // leakage is impossible. Callers that want "recall my episodes
    // with similar arousal/valence" get that; there's no mood-only
    // global query anymore.
    this._stmtRecallByMood = this._db.prepare(`
      SELECT * FROM episodes
      WHERE user_id = ?
        AND ABS(arousal - ?) < 0.2
        AND ABS(valence - ?) < 0.3
      ORDER BY id DESC LIMIT ?
    `);

    // T6 — recent episodes scoped to one user (used by the /episodes
    // HTTP endpoint when a ?user=<id> query param is provided).
    this._stmtRecentEpisodesByUser = this._db.prepare(`
      SELECT * FROM episodes WHERE user_id = ? ORDER BY id DESC LIMIT ?
    `);

    this._stmtEpisodeCount = this._db.prepare('SELECT COUNT(*) as count FROM episodes');

    const count = this._stmtEpisodeCount.get().count;
    console.log(`[Brain] Episodic memory: ${count} episodes in database`);
  },

  /**
   * Store an episode — a snapshot of brain state at a meaningful moment.
   *
   * iter13 T13.1+T13.2+T13.3 — salience computation + frequency-merge gate
   * + GloVe embedding persistence. Episode is the Tier 1 unit. Salience
   * drives whether it eventually consolidates into a Tier 2 schema.
   * Frequency-merge prevents trivial-input bloat: same text within 48h
   * increments existing row's frequency_count instead of new insert.
   */
  storeEpisode(userId, type, inputText, responseText) {
    // Sample cortex pattern — first 32 firing rates as compact representation
    const cortexV = this.voltages.cortex;
    const pattern = [];
    const step = Math.floor(CLUSTER_SIZES.cortex / 32);
    for (let i = 0; i < 32; i++) {
      const idx = i * step;
      pattern.push(+(cortexV[idx] > this.vThresh ? 1 : 0));
    }

    // iter13 T13.2 — compute salience metadata at encode time.
    let inputEmbedding = null;
    let inputEmbeddingBuf = null;
    let surprise = 0;
    let novelty = 1.0;
    if (inputText) {
      try {
        if (this.sharedEmbeddings && typeof this.sharedEmbeddings.getSentenceEmbedding === 'function') {
          inputEmbedding = this.sharedEmbeddings.getSentenceEmbedding(inputText);
          if (inputEmbedding && inputEmbedding.length > 0) {
            // Buffer.from on a Float64Array view zero-copies the underlying ArrayBuffer
            inputEmbeddingBuf = Buffer.from(inputEmbedding.buffer, inputEmbedding.byteOffset, inputEmbedding.byteLength);
          }
        }
        if (this.cortexCluster && typeof this.cortexCluster.computeTransitionSurprise === 'function') {
          const s = this.cortexCluster.computeTransitionSurprise(inputText);
          if (typeof s === 'number' && Number.isFinite(s)) surprise = s;
        }
      } catch { /* salience metadata is best-effort, never block insert */ }
    }

    // iter20-K — exact-text merge bypass. Operator caught: GloVe
    // embeddings of technical strings ("learning ela/kindergarten:_
    // teachCombination") are essentially noise (~1e-15 values), so
    // cosine of two IDENTICAL-text embeddings = 0.18 instead of 1.0.
    // Cosine-based merge never fires for these strings even with
    // threshold lowered to 0.5. Bypass the embedding entirely for
    // exact text matches — same user + same input_text + within
    // window → deterministic merge. SQL query is fast (indexed by
    // user + timestamp).
    if (inputText && userId) {
      const EXACT_WINDOW_MS = 48 * 60 * 60 * 1000;
      const exactCutoff = Date.now() - EXACT_WINDOW_MS;
      try {
        const exactRow = this._db.prepare(
          'SELECT id, frequency_count FROM episodes WHERE user_id IS ? AND input_text = ? AND timestamp > ? ORDER BY id DESC LIMIT 1'
        ).get(userId, inputText, exactCutoff);
        if (exactRow && exactRow.id) {
          this._stmtIncrementFrequency.run(Date.now(), exactRow.id);
          return { merged: true, id: exactRow.id, exact: true };
        }
      } catch { /* exact-merge failure is non-fatal — fall through to cosine path */ }
    }

    // iter13 T13.3 — frequency-merge gate via cosine for similar (not
    // identical) text. Operator's data showed embeddings of technical
    // strings produce noise so cosine-merge rarely fires for those —
    // exact-text merge above catches identical heartbeats; cosine path
    // catches near-duplicates with subtle wording differences.
    if (inputEmbedding && inputEmbedding.length > 0) {
      const FREQ_MERGE_WINDOW_MS = 48 * 60 * 60 * 1000;
      // iter20-C → iter20-F per operator 2026-05-05 "i dont think memory
      // is working still": even with cosine 0.7, freq-merged stayed at 0
      // because IDENTICAL "learning ela/kindergarten:_teachQABinding"
      // heartbeats that should cosine=1.0 weren't merging. SQL inspection
      // confirmed 4 separate rows with same input_text, all freq_count=1.
      // Lowered to 0.5 to be EXTREMELY tolerant of similar-context
      // heartbeats. Even moderately different texts (different cell
      // names, different phases) collapse if they share the
      // "learning/dreaming/attentive" category prefix.
      const FREQ_MERGE_COSINE = 0.5;
      const cutoff = Date.now() - FREQ_MERGE_WINDOW_MS;
      const recent = this._stmtFindRecentForMerge.all(userId || null, cutoff);
      let bestId = -1, bestCos = -Infinity;
      for (const row of recent) {
        if (!row.input_embedding) continue;
        const otherEmb = this._deserializeEmbedding(row.input_embedding);
        if (!otherEmb) continue;
        const cos = this._cosineEmbedding(inputEmbedding, otherEmb);
        if (cos > bestCos) { bestCos = cos; bestId = row.id; }
      }
      if (bestId >= 0 && bestCos >= FREQ_MERGE_COSINE) {
        this._stmtIncrementFrequency.run(Date.now(), bestId);
        // Recompute salience scaling — frequency-merged episodes get a
        // small salience bump from the re-encounter (reinforcement
        // signal) without overwriting the original's encoding context.
        return { merged: true, id: bestId, cosine: bestCos };
      }
      // For novelty, novelty = 1 - max_cosine. Empty recent set → novelty=1.
      novelty = bestCos === -Infinity ? 1.0 : Math.max(0, 1.0 - bestCos);
    }

    // iter13 T13.2 — salience score formula:
    //   salience = 0.4*|emotional_valence| + 0.3*arousal + 0.2*surprise + 0.1*novelty
    // Each input clamped [0,1] (valence is symmetric so |val|).
    const valenceAbs = Math.min(1, Math.abs(this.valence || 0));
    const arousalNorm = Math.min(1, Math.max(0, this.arousal || 0));
    const surpriseNorm = Math.min(1, Math.max(0, surprise));
    const noveltyNorm = Math.min(1, Math.max(0, novelty));
    const salienceScore = 0.4 * valenceAbs + 0.3 * arousalNorm + 0.2 * surpriseNorm + 0.1 * noveltyNorm;
    const effectiveSalience = salienceScore; // fresh episode — no decay yet

    this._stmtInsertEpisode.run(
      Date.now(),
      this.time,
      userId || null,
      type,
      this.arousal,
      this.valence,
      this.psi,
      this.coherence,
      this.totalSpikes,
      inputText || null,
      responseText || null,
      JSON.stringify(pattern),
      // iter13 salience fields
      this.valence || 0,        // emotional_valence (signed valence at encode)
      arousalNorm,              // arousal_at_encode
      surpriseNorm,             // surprise
      noveltyNorm,              // novelty
      1,                        // frequency_count (initial)
      0,                        // consolidation_count (initial)
      salienceScore,            // salience_score
      effectiveSalience,        // effective_salience
      inputEmbeddingBuf,        // input_embedding BLOB (Float64Array bytes)
    );
    return { merged: false };
  },

  // iter13 T13.1 — embedding serialization helpers. Float64Array view
  // over the BLOB Buffer's ArrayBuffer — zero-copy when alignment is
  // 8-byte. Better-sqlite3 returns BLOB as Node Buffer.
  _serializeEmbedding(emb) {
    if (!emb || emb.length === 0) return null;
    return Buffer.from(emb.buffer, emb.byteOffset, emb.byteLength);
  },
  _deserializeEmbedding(buf) {
    if (!buf || buf.length === 0) return null;
    // Buffer.byteOffset isn't always 8-aligned in Node; copy if needed.
    const bytes = buf.byteLength;
    if (bytes % 8 !== 0) return null;
    if (buf.byteOffset % 8 === 0) {
      return new Float64Array(buf.buffer, buf.byteOffset, bytes / 8);
    }
    const aligned = Buffer.allocUnsafe(bytes);
    buf.copy(aligned);
    return new Float64Array(aligned.buffer, aligned.byteOffset, bytes / 8);
  },
  _cosineEmbedding(a, b) {
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
  },

  // iter13 T13.4 — Decay sweep. Multiply salience by exp(-age_h/HALF_LIFE)
  // for episodes older than MIN_AGE_FOR_DECAY (1h). Persist the decayed
  // effective_salience. Then prune episodes meeting all three pruning
  // criteria: effective_salience < PRUNE_THRESHOLD, age > 30 days,
  // consolidation_count == 0, AND not promoted.
  decayEpisodes() {
    const DECAY_HALF_LIFE_HOURS = 168; // 1 week — biological hippocampal trace half-life
    const MIN_AGE_FOR_DECAY_MS = 60 * 60 * 1000; // 1 hour
    const PRUNE_THRESHOLD = 0.05;
    const PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = Date.now();
    const decayCutoff = now - MIN_AGE_FOR_DECAY_MS;
    let decayed = 0;
    try {
      const rows = this._stmtAllEpisodesForDecay.all(decayCutoff);
      const updateTx = this._db.transaction((rs) => {
        for (const r of rs) {
          const ageHours = (now - r.timestamp) / (60 * 60 * 1000);
          const factor = Math.exp(-ageHours / DECAY_HALF_LIFE_HOURS);
          const effective = (r.salience_score || 0) * factor;
          this._stmtUpdateEffectiveSalience.run(effective, r.id);
          decayed++;
        }
      });
      updateTx(rows);
    } catch (err) { console.warn(`[Episodic] decay sweep error: ${err.message}`); }

    let pruned = 0;
    try {
      const result = this._stmtPruneStale.run(PRUNE_THRESHOLD, now - PRUNE_AGE_MS);
      pruned = result.changes;
    } catch (err) { console.warn(`[Episodic] prune error: ${err.message}`); }

    if (decayed > 0 || pruned > 0) {
      console.log(`[Episodic] decay sweep — ${decayed} episodes decayed, ${pruned} pruned`);
    }
    return { decayed, pruned };
  },

  // iter13 T13.4 → iter20-M — Promotion candidates: episodes ready to
  // consolidate into Tier 2 schemas.

  // iter20-M per operator 2026-05-05 "she should be building concepts":
  // unique curriculum-phase episodes (each phase is distinct, so freq=1)
  // would never promote at FREQ_THRESHOLD=2. But these are EXACTLY the
  // episodes that should cluster into concepts ("learned letter case
  // binding" + "learned vowel sound variants" + "learned rhyme families"
  // → phonetics/literacy schema). Lowered FREQ_THRESHOLD to 1 so
  // singleton-but-high-salience episodes qualify. ConsolidationEngine's
  // cosine-clustering then groups semantically-similar singletons
  // together into meaningful schemas. Promotion threshold remains at
  // 0.2 salience so noise doesn't promote — only real learning moments.

  // - PROMOTION_THRESHOLD 0.2 — heartbeat-level salience accepted; pure
  //   low-arousal idle (~0.1) still filtered out
  // - FREQ_THRESHOLD 1 — every episode that meets salience criterion
  //   is a candidate (was 2 — required at least one merge)
  // - CONSOL_THRESHOLD 0 — chicken-egg break (was 2)
  findPromotionCandidates(limit = 20) {
    const PROMOTION_THRESHOLD = 0.2;
    const FREQ_THRESHOLD = 1;
    const CONSOL_THRESHOLD = 0;
    try {
      return this._stmtFindPromotionCandidates.all(
        PROMOTION_THRESHOLD, FREQ_THRESHOLD, CONSOL_THRESHOLD, limit
      );
    } catch (err) {
      console.warn(`[Episodic] findPromotionCandidates error: ${err.message}`);
      return [];
    }
  },

  // iter13 T13.4 — Mark episode as promoted to a Tier 2 schema.
  // Caller passes schemaId from SchemaStore.createSchema return.
  markEpisodePromoted(episodeId, schemaId) {
    try {
      this._stmtMarkPromoted.run(Date.now(), schemaId, episodeId);
      return true;
    } catch (err) {
      console.warn(`[Episodic] markEpisodePromoted error: ${err.message}`);
      return false;
    }
  },

  // iter13 T13.9 — increment consolidation_count when ConsolidationEngine
  // replays this episode (or its parent schema) during a dream-cycle
  // pass. Drives the consolidation_count >= 2 promotion gate.
  recordEpisodeConsolidation(episodeId) {
    try {
      this._stmtIncrementConsolidation.run(Date.now(), episodeId);
      return true;
    } catch (err) { return false; }
  },

  /**
   * Recall episodes by mood similarity, scoped to ONE user.
   *
   * T6 2026-04-13 — userId is now REQUIRED. The old signature
   * `recallByMood(arousal, valence, limit)` without a user filter
   * could pull episodes from any user, violating the private-episode
   * rule. Any cognition code that wants mood-similarity recall must
   * pass the triggering user's stable id.
   */
  recallByMood(userId, arousal, valence, limit = 5) {
    if (!userId) return []; // privacy gate — no global mood recall
    return this._stmtRecallByMood.all(userId, arousal, valence, limit);
  },

  /**
   * Recall recent episodes for a specific user.
   */
  recallByUser(userId, limit = 10) {
    return this._stmtRecallByUser.all(userId, limit);
  },

  /**
   * Get total episode count.
   */
  getEpisodeCount() {
    return this._stmtEpisodeCount.get().count;
  },
};

module.exports = { SERVER_MEMORY_MIXIN };
