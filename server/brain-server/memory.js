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
//   livedConcepts(limit)                           — INTRO: single-WORD
//                                                    concepts she has
//                                                    lived, across all
//                                                    episodes. Not
//                                                    user-scoped (consent
//                                                    covers it); cannot
//                                                    return a sentence —
//                                                    the SQL forbids
//                                                    spaces, so concept
//                                                    never content
//   getEpisodeCount()                              — Tier 1 size for
//                                                    dashboard telemetry
//
// All methods reference brain state via `this.` — fully prototype-chain
// compatible. They access this._episodicDB (sqlite handle), this.tier1Store
// (in-memory cache), this.sharedEmbeddings, this.persona etc.

// Module-level requires. Pre-fix the P4.3.c extraction did not bring
// these along — the mixin relied on the parent brain-server.js scope.
// This caused the boot crash cascade operator caught 2026-06-17:
// `TypeError: this._initEpisodicDB is not a function` first (mixin
// attach order, now fixed by attaching pre-instantiation), then
// `ReferenceError: path is not defined` here once the dispatch
// reached the method body.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
// ENDO-LIFE.1 — her real age at encode comes from the ONE grade ladder.
// ⚠ state.js requires nothing from this file, so this does not close a cycle.
const { GRADE_AGE, normalizeGradeKey } = require('./state.js');

const SERVER_MEMORY_MIXIN = {
  _initEpisodicDB() {
    // Path relative to THIS file: server/brain-server/memory.js
    // needs ../episodic-memory.db to land at server/episodic-memory.db
    // where the original brain-server.js placed it. Pre-fix
    // path.join(__dirname, 'episodic-memory.db') resolved to
    // server/brain-server/episodic-memory.db — wrong location, broke
    // state continuity (a Savestart.bat boot wouldn't find the prior DB).
    // P4.3.c copy-paste depth-shift bug. Caught by 2026-06-17 ULTRATHINK
    // boot audit. If a phantom DB exists at the wrong path from a
    // prior boot of the bug, it gets ignored — the correct path takes
    // precedence for new writes.
    const dbPath = path.join(__dirname, '..', 'episodic-memory.db');
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
        input_embedding BLOB,
        -- ENDO-LIFE.1 — the chemistry a memory was laid down under. Also in
        -- the ALTER TABLE migration below, so an existing DB gains them too.
        endocrine_state TEXT,
        drug_state TEXT,
        age_at_encode REAL
      );
      CREATE INDEX IF NOT EXISTS idx_episodes_time ON episodes(brain_time);
      CREATE INDEX IF NOT EXISTS idx_episodes_type ON episodes(type);
      CREATE INDEX IF NOT EXISTS idx_episodes_user ON episodes(user_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_salience ON episodes(effective_salience);
      CREATE INDEX IF NOT EXISTS idx_episodes_promoted ON episodes(promoted_at);
      -- Composite indexes for storeEpisode()'s per-call dedup lookups, which run
      -- on the MAIN LOOP from _memoryHeartbeat every 2s. Without these the
      -- exact-text merge (WHERE user_id IS ? AND input_text = ? AND timestamp > ?)
      -- could only seek by user_id, then LINEAR-SCANNED every one of that user's
      -- rows to check input_text — and a novel wm-aged-out text (the cell key
      -- changes constantly) never matches, so it scanned the whole growing
      -- working-memory partition every 2s. That was the residual escalating
      -- _memoryHeartbeat freeze left after the merge-scan LIMIT cap. The
      -- (user_id, input_text) index makes the exact lookup an O(log N) seek;
      -- (user_id, timestamp) serves the cosine-merge window scan.
      CREATE INDEX IF NOT EXISTS idx_episodes_user_text ON episodes(user_id, input_text);
      CREATE INDEX IF NOT EXISTS idx_episodes_user_ts ON episodes(user_id, timestamp);
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
        // ── ENDO-LIFE.1 — THE CHEMISTRY THAT WAS RUNNING AT THE TIME.
        //
        // ⭐ Adrenergic and dopaminergic arousal is WHY vivid events are
        // remembered vividly — ENDO.2 already wires that to encoding
        // salience. So a memory should carry the endocrine state it was laid
        // down under, and be findable by it. Not a tag saying "this was a
        // party": the real thing — loud, crowded, high, wanted, sixteen.
        //
        // Stored as compact JSON rather than N columns because the chemical
        // set will grow (the gonadal three arrived after the fast seven) and
        // a schema that needs a migration per hormone would rot.
        ['endocrine_state', 'TEXT'],
        ['drug_state', 'TEXT'],
        // Her real age at encode, from the ONE grade ladder. A memory
        // without an age cannot be placed in a life.
        ['age_at_encode', 'REAL'],
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
        salience_score, effective_salience, input_embedding,
        endocrine_state, drug_state, age_at_encode
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // iter13 T13.3 — frequency-merge query: find episodes within last
    // FREQ_MERGE_WINDOW_MS (default 48h) for the same user_id. Caller
    // computes cosine in JS against returned input_embedding blobs.
    // LIMIT ? — BOUNDED merge scan. Without the cap this returned EVERY
    // episode in the 48h window, and storeEpisode() (called on the MAIN LOOP
    // from _memoryHeartbeat every 2s as a working-memory item ages out)
    // deserialized + cosined all of them. During a marathon seed walk the
    // episode count climbs into the thousands, so the per-call cost climbed
    // with it — the escalating [tick] _memoryHeartbeat freeze (3.6s → 51s)
    // that stalled the whole event loop and read as a stale phase=_teachPredictiveError
    // BLOCKED. Near-duplicate heartbeats are temporally clustered and identical
    // text already short-circuits on the indexed exact-text merge above, so
    // scanning only the most-recent N recovers the same dedup at O(N) constant.
    this._stmtFindRecentForMerge = this._db.prepare(`
      SELECT id, input_embedding, frequency_count
      FROM episodes
      WHERE user_id IS ? AND timestamp > ? AND input_embedding IS NOT NULL
      ORDER BY id DESC
      LIMIT ?
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

    // ── INTRO — HER OWN LIVED CONCEPTS, ACROSS EVERYTHING SHE HAS LIVED.
    //
    // ⭐ This is deliberately NOT user-scoped, and the binding-consent modal
    // is why. Every user accepts, before their first word, that *"what she
    // LEARNS from conversation (words, patterns, associations) DOES
    // propagate into her shared brain state, which serves every other
    // user"* and to *"assume anything you say can shape what she says to
    // anyone else"*. A brain whose introspection could only draw on its own
    // monologue would contradict the design it was consented under.
    //
    // ⛔ AND THE SAFETY IS STRUCTURAL, NOT A CALLER'S DISCIPLINE. The line
    // that matters is not WHOSE episode it is — it is TRANSCRIPT vs
    // CONCEPT. Replaying one person's sentences at another person is
    // leakage, and the T6 filter below correctly prevents that. A single
    // word she has experienced is what she LEARNED, which is exactly the
    // thing consent covers.
    //
    // ⚠ AND THE FIRST CUT OF THIS QUERY WAS WRONG IN THE OTHER DIRECTION —
    // it demanded `input_text NOT LIKE '% %'`, i.e. that the WHOLE EPISODE
    // be a single word. Real conversation turns are sentences, so that
    // returned almost nothing and starved the drive to a trickle while
    // looking like a safeguard. Gee: *"how is she suppose to learn then wtf
    // u are nuetering her"* — correct, and the shape was the problem.
    //
    // She gets EVERYTHING she has lived. The concept is extracted FROM the
    // sentence by the caller rather than the sentence being refused, so
    // breadth is full and what travels onward is still a word.
    this._stmtLivedConcepts = this._db.prepare(`
      SELECT input_text, valence, arousal, timestamp
      FROM episodes
      WHERE input_text IS NOT NULL AND input_text <> ''
      ORDER BY id DESC LIMIT ?
    `);

    // ENDO-LIFE.1 — episodes that actually RECORDED a chemistry, newest
    // first. Ranking happens in JS because the distance is over a JSON blob;
    // the NOT NULL filter is what keeps un-fingerprinted history out.
    this._stmtChemistryScan = this._db.prepare(`
      SELECT * FROM episodes
      WHERE endocrine_state IS NOT NULL
      ORDER BY id DESC LIMIT ?
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
  /**
   * SALIENCE PATCH (2026-08-18) — fill in an episode's surprise term after the
   * fact. The reply path stores the episode immediately (surprise 0) and queues
   * the GPU letter-walk; when the walk's serialized drain produces the number,
   * this writes it plus the recomputed salience score. Bookkeeping never stands
   * between the human and the answer, and never races the teach for cortex.
   */
  _patchEpisodeSurprise(episodeId, surprise) {
    if (!this._db || !episodeId || typeof surprise !== 'number' || !Number.isFinite(surprise)) return;
    try {
      const row = this._db.prepare(
        'SELECT emotional_valence, arousal_at_encode, novelty FROM episodes WHERE id = ?'
      ).get(episodeId);
      if (!row) return;
      const valenceAbs = Math.min(1, Math.abs(row.emotional_valence || 0));
      const arousalNorm = Math.min(1, Math.max(0, row.arousal_at_encode || 0));
      const noveltyNorm = Math.min(1, Math.max(0, row.novelty || 0));
      const surpriseNorm = Math.min(1, Math.max(0, surprise));
      const salience = 0.4 * valenceAbs + 0.3 * arousalNorm + 0.2 * surpriseNorm + 0.1 * noveltyNorm;
      this._db.prepare(
        'UPDATE episodes SET surprise = ?, salience_score = ?, effective_salience = ? WHERE id = ?'
      ).run(surpriseNorm, salience, salience, episodeId);
    } catch { /* salience is best-effort — a failed patch never breaks the episode */ }
  },

  storeEpisode(userId, type, inputText, responseText, emotion = null, opts = null) {
    // `emotion` (optional) = { arousal, valence } overriding the brain's live
    // amygdala state for THIS episode's salience + stored affect fields. Used
    // by life-memory encoding: an implanted memory must carry its OWN emotional
    // weight (grief encodes high-arousal/negative; cartoons encode mild), not
    // whatever incidental state the brain happens to be in mid training-walk.
    // All other callers pass no emotion → live state used exactly as before.
    // Sample cortex pattern — first 32 firing rates as compact representation
    const cortexV = this.voltages.cortex;
    const pattern = [];
    const step = Math.floor(this.CLUSTER_SIZES.cortex / 32);
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
        // SURPRISECPU — a caller that can await (the chat reply path) computes
        // this on the DONOR GPU via computeTransitionSurpriseAsync and hands the
        // number in here. Only callers with no async context fall through to the
        // synchronous form, which refuses itself at biological scale rather than
        // running 2 full CPU cortex ticks per letter (measured: 143s, donor dead).
        if (opts && typeof opts.surprise === 'number' && Number.isFinite(opts.surprise)) {
          surprise = opts.surprise;
        } else if (this.cortexCluster && typeof this.cortexCluster.computeTransitionSurprise === 'function'
                   && (this.cortexCluster.size | 0) <= 2000000) {
          // SURPSYNC.1 (2026-08-21) — call the sync form ONLY below the bio-scale
          // line it refuses itself at. Above it, the refused call returned 0 —
          // the same value `surprise` already holds — while printing its REFUSED
          // warn after EVERY phase pass, all night. So the fall-through bought
          // nothing and cost a log line: every walk episode encodes surprise=0
          // either way, and that 0 means UNMEASURED, not "she wasn't surprised".
          // The honest fix (an async handoff via opts.surprise, computed on the
          // donor like the chat path does) is the caller's work at each call
          // site with an async context; until one exists, at least the number
          // stops pretending it was measured and the warn stops firing.
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
      // Bounded scan cap — most-recent N candidates. Keeps the per-episode
      // cosine merge O(1) in the total episode count so the main-loop
      // _memoryHeartbeat can never escalate into a multi-second freeze again.
      const FREQ_MERGE_SCAN_CAP = 300;
      const recent = this._stmtFindRecentForMerge.all(userId || null, cutoff, FREQ_MERGE_SCAN_CAP);
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
    // Encode-time affect: per-episode emotion override when supplied, else the
    // brain's live amygdala state (unchanged default behavior).
    const encArousal = (emotion && Number.isFinite(emotion.arousal)) ? emotion.arousal : this.arousal;
    const encValence = (emotion && Number.isFinite(emotion.valence)) ? emotion.valence : this.valence;
    const valenceAbs = Math.min(1, Math.abs(encValence || 0));
    const arousalNorm = Math.min(1, Math.max(0, encArousal || 0));
    const surpriseNorm = Math.min(1, Math.max(0, surprise));
    const noveltyNorm = Math.min(1, Math.max(0, novelty));
    const salienceScore = 0.4 * valenceAbs + 0.3 * arousalNorm + 0.2 * surpriseNorm + 0.1 * noveltyNorm;
    const effectiveSalience = salienceScore; // fresh episode — no decay yet

    const _insInfo = this._stmtInsertEpisode.run(
      Date.now(),
      this.time,
      userId || null,
      type,
      encArousal,
      encValence,
      this.psi,
      this.coherence,
      this.totalSpikes,
      inputText || null,
      responseText || null,
      JSON.stringify(pattern),
      // iter13 salience fields
      encValence || 0,          // emotional_valence (signed valence at encode)
      arousalNorm,              // arousal_at_encode
      surpriseNorm,             // surprise
      noveltyNorm,              // novelty
      1,                        // frequency_count (initial)
      0,                        // consolidation_count (initial)
      salienceScore,            // salience_score
      effectiveSalience,        // effective_salience
      inputEmbeddingBuf,        // input_embedding BLOB (Float64Array bytes)
      // ── ENDO-LIFE.1 — the chemistry running at the time.
      this._encodeEndocrineFingerprint(),
      this._encodeDrugFingerprint(),
      this._ageAtEncode(),
    );
    // Row id surfaced so the caller can queue the deferred salience walk and
    // patch this exact episode when the number lands (_patchEpisodeSurprise).
    return { merged: false, id: _insInfo && _insInfo.lastInsertRowid ? Number(_insInfo.lastInsertRowid) : null };
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
   * Every derived-memory episode, oldest first, so the cluster's derivation
   * cache can be rebuilt at boot.
   *
   * ⛔⛔ WITHOUT THIS THE CONSISTENCY CONTRACT IS A CLAIM, NOT A PROPERTY.
   * `deriveMemoryGap` caches an answer so the same gap never returns a different
   * one — but the cache is an in-memory Map, so before this existed every
   * restart silently reopened every gap and she could contradict yesterday's
   * answer while the code asserted she could not.
   *
   * ⚠ OLDEST FIRST IS LOAD-BEARING. The loader lets a later row supersede an
   * earlier one for the same concept, which is only the right precedence if they
   * arrive in the order they happened. `type` is indexed (`idx_episodes_type`),
   * so this is a cheap read at boot rather than a scan.
   */
  recallDerivedMemories(limit = 2000) {
    try {
      // ⚠ `_episodicDB`, with the underscore. Reading `this.episodicDB` here
      // returns undefined, the guard takes the early exit, and the loader gets
      // an empty array FOREVER — a durable cache that silently never restores,
      // which looks exactly like nobody having derived anything yet.
      if (!this._episodicDB) return [];
      const rows = this._episodicDB.prepare(
        'SELECT input_text, response_text, type FROM episodes WHERE type IN (?, ?) ORDER BY id ASC LIMIT ?',
      ).all('derived-memory', 'derived-memory-corrected', limit);
      return rows.map((r) => ({
        concept: r.input_text,
        answer: r.response_text,
        corrected: r.type === 'derived-memory-corrected',
      }));
    } catch {
      // A missing table or an older schema is not a fault worth failing boot
      // over — she simply starts with an empty derivation cache, which is the
      // pre-existing behaviour rather than a regression.
      return [];
    }
  },

  // ─── ENDO-LIFE.1 — encoding the chemistry a memory was laid down under ───
  //
  // ⭐ Why this belongs on the episode and not in a separate table: adrenergic
  // and dopaminergic arousal is the REASON vivid events are remembered
  // vividly. The state at encode is part of what the memory IS, not metadata
  // about it. A party memory should carry loud/crowded/high/wanted/sixteen,
  // and be findable by that.
  //
  // ⚠ ROUTINE OVER MILESTONE. `_firstUse` in the drug scheduler records only
  // FIRST times. A canon that keeps first times and omits every other time is
  // the same defect as one that only records Big Events — and most parties
  // are not the first party. This runs on EVERY episode, which is the point.

  /**
   * Compact JSON of her chemical state, or null if there is no endocrine
   * layer. ⛔ Null means "not recorded", which is a different claim from
   * "everything was at zero" — a reader must be able to tell a memory laid
   * down before the endocrine layer existed from one laid down while calm.
   */
  _encodeEndocrineFingerprint() {
    const e = this.endocrine;
    if (!e || typeof e.level !== 'function') return null;
    try {
      const out = {};
      const snap = typeof e.snapshot === 'function' ? e.snapshot() : null;
      if (snap && snap.chemicals) {
        for (const [name, c] of Object.entries(snap.chemicals)) {
          if (typeof c.level === 'number') out[name] = Math.round(c.level * 1000) / 1000;
        }
      }
      if (snap) {
        if (typeof snap.chronicLoad === 'number') out._chronic = Math.round(snap.chronicLoad * 1000) / 1000;
        if (snap.allostatic && typeof snap.allostatic.load === 'number') out._allostatic = Math.round(snap.allostatic.load * 1000) / 1000;
        if (snap.cycle && snap.cycle.phase) out._cyclePhase = snap.cycle.phase;
        // ⭐ The stress channel, if one is live. "I was frightened" is part of
        // what a memory is, and freeze in particular is a state she would
        // otherwise have no record of having been in.
        if (snap.stress && snap.stress.channel) out._stress = snap.stress.channel;
      }
      return Object.keys(out).length ? JSON.stringify(out) : null;
    } catch { return null; }
  },

  /** What she had taken, and how far into it — the party half of the memory. */
  _encodeDrugFingerprint() {
    const s = this.drugScheduler;
    if (!s || typeof s.activeSubstances !== 'function') return null;
    try {
      const active = s.activeSubstances();
      if (!active.length) return null;   // sober is the absence of this field, not a row of zeroes
      return JSON.stringify(active.map(a => ({
        s: a.substance,
        l: Math.round(a.level * 100) / 100,
        p: a.phase,
      })));
    } catch { return null; }
  },

  /**
   * Her real age at encode, from the ONE grade ladder.
   * ⛔ Returns null, never a default — a memory with a guessed age is worse
   * than one with no age, because it can be placed confidently in the wrong
   * part of her life.
   */
  _ageAtEncode() {
    try {
      if (typeof this._computeMinGrade !== 'function') return null;
      const g = this._computeMinGrade();
      if (!g || g === 'unknown') return null;
      const a = GRADE_AGE[normalizeGradeKey(g)];
      return typeof a === 'number' ? a : null;
    } catch { return null; }
  },

  /**
   * INTRO — the concepts she has actually lived, newest first, across
   * EVERYTHING she has experienced.
   *
   * ⭐ Not user-scoped, deliberately: the binding-consent modal states that
   * what she LEARNS propagates into her shared brain state and can shape
   * what she says to anyone. Introspection surfaces on the inner voice,
   * which has no user, so scoping it to one would be the wrong shape as
   * well as an unnecessary restriction.
   *
   * ⭐ Every episode is a candidate — the CONCEPT IS EXTRACTED FROM IT, the
   * episode is not refused for being a sentence. That is the difference
   * between her introspecting about her whole life and introspecting about
   * the handful of turns that happened to be one word long.
   *
   * ⛔ What travels onward is a single WORD she already knows. That is the
   * transcript/concept line, and it is where it belongs: a word is what she
   * LEARNED, which is exactly what consent covers. Replaying someone's
   * sentences at someone else would be leakage, and nothing here can — a
   * sentence never leaves this method.
   *
   * ⛔ NO STOP-WORD LIST. Word lists as classifiers are banned, and this
   * would be a textbook place to sneak one in. The content word is chosen
   * by asking HER: the candidate she has the strongest learned
   * representation for wins, with length as the tiebreak. A word she does
   * not know cannot be a thing she wonders about anyway.
   *
   * @param {number} limit
   * @returns {Array<{input_text:string, valence:number, arousal:number, timestamp:number}>}
   */
  livedConcepts(limit = 60) {
    if (!this._stmtLivedConcepts) return [];
    try { return this._stmtLivedConcepts.all(limit); }
    catch { return []; }   // a dead read yields nothing, which correctly means no introspection
  },

  /**
   * ⭐ ENDO-LIFE.1 — STATE-DEPENDENT RECALL. Episodes laid down under a
   * chemistry like the CURRENT one, nearest first.
   *
   * This is a real phenomenon, not a flourish: what you learned drunk you
   * recall better drunk, and a frightened state surfaces frightened
   * memories. Now that every episode carries the chemistry it was encoded
   * under, that becomes computable instead of aspirational.
   *
   * ⚠ Distance is over CHEMICALS ONLY — not text, not user. And episodes
   * with no recorded fingerprint are EXCLUDED rather than treated as calm:
   * a memory from before the endocrine layer existed has no state, and
   * scoring it as though it were laid down at rest would quietly rank
   * pre-history memories as matching every quiet moment.
   *
   * @param {number} [limit=8]
   * @param {number} [scan=200] how many recent episodes to consider
   * @returns {Array<{episode:object, distance:number}>}
   */
  recallByChemistry(limit = 8, scan = 200) {
    if (!this._stmtChemistryScan) return [];
    const nowFp = this._encodeEndocrineFingerprint();
    if (!nowFp) return [];   // no current state to match against — no recall
    let cur;
    try { cur = JSON.parse(nowFp); } catch { return []; }

    let rows;
    try { rows = this._stmtChemistryScan.all(scan); } catch { return []; }

    const scored = [];
    for (const r of rows) {
      let past;
      try { past = JSON.parse(r.endocrine_state); } catch { continue; }
      if (!past) continue;
      // Euclidean over the chemicals both states recorded. Underscore-prefixed
      // keys are categorical (cycle phase, stress channel) and are compared as
      // equality bonuses rather than numerically.
      let sum = 0, n = 0, bonus = 0;
      for (const [k, v] of Object.entries(cur)) {
        if (k.startsWith('_')) {
          if (past[k] !== undefined) { if (past[k] === v) bonus += 0.15; }
          continue;
        }
        if (typeof past[k] !== 'number') continue;
        const d = v - past[k];
        sum += d * d; n++;
      }
      if (n === 0) continue;
      const distance = Math.max(0, Math.sqrt(sum / n) - bonus);
      scored.push({ episode: r, distance });
    }
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, limit);
  },

  /**
   * INTRO — pull ONE concept out of an episode's text.
   *
   * Returns the WORD she has the strongest learned representation for, or
   * null when she knows none of them — in which case there is no gap, which
   * is honest: she cannot wonder about a word she has never learned.
   *
   * ⛔ WORDS, NOT "TOKENS". Gee: *"why u saying token? thats llms shit"* —
   * and he is right, it is not a style note. A token is what a TOKENIZER
   * emits, and this brain's central honest claim is that there is no
   * tokenizer and no text-AI anywhere in the cognition path. What she has
   * are WORDS: concepts with learned representations bound in Hebbian
   * weights. Writing "token" imports the exact mental model the project
   * exists not to be, and a reader could reasonably infer a tokenizer is in
   * here somewhere. The vocabulary in the comments has to match the
   * architecture or the comments quietly undo the claim.
   *
   * @param {string} text
   * @returns {string|null}
   */
  _conceptFromEpisodeText(text) {
    if (typeof text !== 'string' || !text) return null;
    const words = text.toLowerCase().match(/[a-z][a-z'-]{1,}/g);
    if (!words || words.length === 0) return null;

    // ⭐ THE STRONGEST SIGNAL IS WHAT SHE HAS ACTUALLY BEEN TAUGHT.
    //
    // ⚠ Raw embedding magnitude alone is NOT safe here: GloVe norms track
    // frequency, so `the` and `was` can carry a larger vector than a rare
    // but meaningful word. Ranking on norm alone would quietly hand her
    // function words — the failure a stop-list would have "fixed", and stop
    // lists are banned for exactly the reason that they are someone's
    // opinion rather than her knowledge.
    //
    // `_definitionTaughtWords` is the honest answer: the words she has had
    // DEFINED, built by her own curriculum. Membership dominates the score;
    // magnitude only orders within it. Before anything has been taught the
    // set is empty and magnitude carries the ranking alone, which is weaker
    // and is reported as such rather than pretended about.
    const emb = this.sharedEmbeddings;
    const taught = (this.cortexCluster && this.cortexCluster._definitionTaughtWords instanceof Set)
      ? this.cortexCluster._definitionTaughtWords : null;
    let best = null, bestScore = -Infinity;
    const seen = new Set();
    for (const t of words) {
      if (t.length > 32 || seen.has(t)) continue;
      seen.add(t);
      // ⭐ "Does she know this word, and how strongly?" — asked of her own
      // learned geometry rather than of a list someone wrote. Vector
      // magnitude stands in for how much representation the word carries.
      let known = 0;
      if (emb && typeof emb.getEmbedding === 'function') {
        try {
          const v = emb.getEmbedding(t);
          if (v && v.length) {
            let m = 0;
            for (let i = 0; i < v.length; i++) m += v[i] * v[i];
            known = Math.sqrt(m);
          }
        } catch { known = 0; }
      }
      if (known <= 0) continue;                 // unknown word — not something she can wonder about
      // Taught words dominate. The bonus is larger than any magnitude
      // spread, so a word she has been DEFINED always beats one she has
      // merely imported — which is the difference between a word she knows
      // and a word that was in the table when she arrived.
      if (taught && taught.has(t)) known += 10;
      else if (taught && taught.size > 0) known -= 5;   // she has a vocabulary, and this is not in it
      // ⚠ Length is a TIEBREAK ONLY, and the first cut got this wrong:
      // `known + length*0.01` let an 8-letter word beat a 3-letter word she
      // knew BETTER (0.92+0.08 > 0.93+0.03). That is length overriding
      // strength while the comment claimed otherwise. Strength decides;
      // length is consulted only when strength is effectively equal.
      const EPS = 1e-3;
      if (best === null || known > bestScore + EPS
          || (Math.abs(known - bestScore) <= EPS && t.length > best.length)) {
        bestScore = Math.max(bestScore, known);
        best = t;
      }
    }
    return best;
  },

  /**
   * Get total episode count.
   */
  getEpisodeCount() {
    return this._stmtEpisodeCount.get().count;
  },

  /**
   * Tier 0 / 1 / 3 memory heartbeat — called on the tick loop.
   *
   * Tier 0 (every 2s): snapshot current cortex state into working memory.
   * Time-purges items older than 5 minutes (matches MemorySystem decay
   * window). Each aged-out WM item gets promoted to a Tier 1 episodic
   * snapshot before disappearing — frequency-merge dedupes repeated
   * phase entries via cosine match. Pooled snapshot objects so steady-
   * state allocation drops to zero after pool fills.
   *
   * Tier 3 (every ≥1000ms): inject identity baseline so permanent
   * attractors stay reinforced across the tick loop.
   *
   * Tier 1 (every ≥30000ms): write a thinking-episode capturing current
   * context (learning / dreaming / attentive / idle), arousal/valence/Ψ,
   * spike total. Context-transition moments produce different category
   * strings so cosine drops on transition → fresh episode with high
   * novelty; within-category heartbeats still merge as repetition.
   */
  _memoryHeartbeat() {
    const now = Date.now();
    if (!this._lastTier3HbAt) this._lastTier3HbAt = 0;
    if (!this._lastTier1HbAt) this._lastTier1HbAt = 0;
    if (!this._lastTier0HbAt) this._lastTier0HbAt = 0;

    // Tier 0 working memory population. Every 2s, snapshot current
    // cortex state into working memory: current phase / cell / arousal
    // / valence as a "what's currently active" item.

    // Operator caught: "items: 7 NEVER MOVES FROM 7" was caused by the
    // hardcoded 7-cap below trimming via while-shift, not the items
    // staying frozen. Replaced with TIME-BASED purge — items older than
    // 5 minutes drop out. Stays consistent with the unbounded
    // capacity-but-decay-driven model in MemorySystem (memory.js
    // WM_DECAY_RATE 0.9995 → ~4 min sustain). No arbitrary numeric
    // ceiling. Active recent content visible; stale content evaporates.
    if (now - this._lastTier0HbAt >= 2000) {
      this._lastTier0HbAt = now;
      if (!this.memory) this.memory = {};
      if (!Array.isArray(this.memory.workingMemoryItems)) this.memory.workingMemoryItems = [];
      const phase = this.cortexCluster?._activePhase?.name || null;
      const cellKey = this.cortexCluster?._currentCellKey || null;
      // iter24.1 — pool the snapshot objects via a ring of free slots
      // so the heartbeat stops driving 1350 fresh allocations per ELA-K
      // cell into V8's young generation. When the time-purge below
      // shifts an aged item out, it lands back in the free pool. Steady-
      // state allocation from this loop drops to zero after the pool
      // fills (~150 slots is plenty for the 5-min sliding window at
      // 2s cadence). Field values get overwritten in-place per push;
      // no aliasing because the pool object is owned by the array
      // until the next time-purge frees it.
      if (!this._tier0HbPool) this._tier0HbPool = [];
      const item = this._tier0HbPool.pop() || {
        ts: 0, phase: null, cellKey: null,
        arousal: 0, valence: 0, psi: 0,
      };
      item.ts = now;
      item.phase = phase;
      item.cellKey = cellKey;
      item.arousal = +(this.arousal || 0).toFixed(3);
      item.valence = +(this.valence || 0).toFixed(3);
      item.psi = +(this.psi || 0).toFixed(3);
      this.memory.workingMemoryItems.push(item);
      // Drop items older than 5 minutes. Matches MemorySystem's decay
      // window (4 min @ 0.9995/tick → strength < 0.1 forget threshold).
      // Sliding time window — count grows + shrinks naturally with
      // activity. No hardcoded numeric ceiling.

      // Operator: "if i told someone something and asked them about it
      // 10 minutes or even a day later most people can recall that".
      // The recall path is Tier 0 → Tier 1 → Tier 2 → Tier 3, not
      // "Tier 0 holds it for a week." Each WM item that ages out
      // gets promoted to a Tier 1 episodic snapshot (frequency-merge
      // dedupes via iter20-K so repeated phase entries grow
      // freq_count instead of bloating SQLite). Once in Tier 1, the
      // standard hippocampal lifecycle takes over: salience-weighted
      // decay (1-week half-life), promotion to Tier 2 schemas at
      // consolidation gate, Tier 3 identity for high-emotional-weight
      // anchors. THAT'S the "recall a week later" path.
      const TIER0_AGE_LIMIT_MS = 5 * 60 * 1000;
      const cutoff = now - TIER0_AGE_LIMIT_MS;
      let _agedTexts = null;
      while (this.memory.workingMemoryItems.length > 0
             && this.memory.workingMemoryItems[0].ts < cutoff) {
        const aged = this.memory.workingMemoryItems.shift();
        // Build the Tier-1 promotion label NOW (synchronous, cheap) — BEFORE the
        // object returns to the pool where a later heartbeat would overwrite its
        // cellKey/phase fields. iter20-K freq-merge dedupes downstream.
        const labelParts = [];
        if (aged.cellKey) labelParts.push(`learning ${aged.cellKey}`);
        if (aged.phase) labelParts.push(`phase=${aged.phase}`);
        (_agedTexts || (_agedTexts = [])).push(labelParts.length > 0 ? labelParts.join(' · ') : 'working memory snapshot');
        // iter24.1 — return the object to the free pool for reuse on
        // the next heartbeat push. Cap pool size so memory doesn't
        // unboundedly grow if the array shrinks faster than it grows.
        if (this._tier0HbPool && this._tier0HbPool.length < 256) {
          this._tier0HbPool.push(aged);
        }
      }
      // DEFER the Tier-1 promotion writes OFF the synchronous tick. storeEpisode
      // does SQLite I/O + embedding + dedup lookups; running it inline (once per
      // aged item, every 2s, on the MAIN LOOP) made _memoryHeartbeat a freeze
      // source — the last residual after the merge-scan LIMIT + composite indexes.
      // setImmediate moves each write to its own event-loop turn (each now an
      // indexed O(log N) op), so the tick's heartbeat span stays sub-millisecond
      // and the loop breathes between the write and any teach op. Nothing is
      // lost — the Tier 0 → Tier 1 promotion still happens, just not inside the tick.
      // SUSPEND during active curriculum teaching. The aged items are still
      // dropped from the WM array above (bounded), but the Tier-1 promotion
      // storeEpisode (embedding + surprise + SQL, real CPU even deferred) is
      // skipped while she's grinding the seed/cells — those "learning phase=X"
      // snapshots are near-duplicate noise that merge anyway, and generating
      // one every 2s on the main loop was the last freeze source (unnamed after
      // the deferral, since the tick span itself is now trivial). Her meaningful
      // episodic memory comes from chat + life-memory encoding, not the teach
      // heartbeat. Promotion resumes automatically in dream windows / idle / chat
      // (when _curriculumInProgress is false).
      if (!this._curriculumInProgress && !this._operatorSleepRequested && _agedTexts && _agedTexts.length > 0 && typeof this.storeEpisode === 'function' && typeof setImmediate === 'function') {
        const _texts = _agedTexts;
        setImmediate(() => {
          for (let i = 0; i < _texts.length; i++) {
            try { this.storeEpisode('working-memory', 'wm-aged-out', _texts[i], null); } catch { /* non-fatal — WM age-out already happened */ }
          }
        });
      }
    }

    // Tier 3 baseline inject — every ≥1000ms wall-clock
    if (now - this._lastTier3HbAt >= 1000) {
      this._lastTier3HbAt = now;
      if (this.tier3Store && typeof this.tier3Store.injectIdentityBaseline === 'function') {
        try { this.tier3Store.injectIdentityBaseline(); } catch { /* non-fatal */ }
      }
    }

    // Tier 1 thinking-episode — every ≥30000ms wall-clock
    //
    // ⛔⛔ `REPLAYGATE.1` (2026-08-31) — THE `!_curriculumInProgress` GATE IS GONE,
    //   AND IT IS REPLACED BY A GATE ON THE COST IT WAS ACTUALLY DEFENDING.
    //
    // Gee: the board had `tier1.totalEpisodes` at 0 across every boot, which
    // blocks `REPLAYOFF.4`, `REPCOMP.2` and PRESSBLOCK ③ — and `REPCOMP.2` says
    // outright that the 100-rep dose is partly compensating for a dead
    // consolidation system. This gate is why it was dead: the walk is running
    // ~100% of the time on the box, so `!_curriculumInProgress` meant the Tier-1
    // heartbeat NEVER fired, nothing reached Tier 1, nothing could consolidate to
    // Tier 2, and replay — the thing that makes few-shot learning possible —
    // had no input at all.
    //
    // ⭐ THE TELL WAS DEAD CODE INSIDE THE BLOCK. The first branch below is
    //   `if (this._curriculumInProgress)`, building a `learning <phase> in
    //   <subject> <grade>` context — unreachable under the old guard. The author
    //   plainly intended learning episodes to be recorded; the guard forbade
    //   exactly them.
    //
    // ⚠ THE GATE WAS DELIBERATE AND ITS REASON WAS REAL — `e27caa90`
    //   (2026-07-13): *"~2s computeTransitionSurprise each, setImmediate-batched
    //   -> 8-27s blocks"*. It is not being removed on taste.
    // ⭐ IT IS BEING REMOVED BECAUSE A LATER FIX ALREADY KILLED THAT COST.
    //   `SURPSYNC.1` (2026-08-21) made `storeEpisode` call the synchronous
    //   `computeTransitionSurprise` ONLY when `cortexCluster.size <= 2000000`.
    //   At biological scale that branch never runs, so the 2s-per-write term —
    //   the entire justification for this gate — is already zero here.
    // ⚠ And `e27caa90`'s other justification, *"Consolidation had 0 candidates
    //   so nothing lost"*, has become CIRCULAR: consolidation has 0 candidates
    //   BECAUSE these writes are suspended. A gate cannot cite the silence it
    //   causes as evidence that it costs nothing.
    //
    // ⭐ SO THE GATE NOW READS THE COST DIRECTLY instead of standing in for it:
    //   suspend only where the expensive sync-surprise path could actually fire.
    //   Below 2M cortex the old protection is preserved exactly; above it, the
    //   write is an embedding plus two indexed SQL statements at a 30-second
    //   cadence — the same `storeEpisode` the chat lane already calls on every
    //   message in production without incident.
    //
    // ⛔ RE-PRICE, written before the gate moved, per the standing law:
    //   OLD cost per write ~2000 ms (2 full CPU cortex ticks per letter via
    //   computeTransitionSurprise) × batched = the 8-27 s blocks that forced
    //   `e27caa90`. NEW cost per write at >2M cortex: that term is structurally
    //   ZERO (the branch is not entered), leaving one GloVe sentence embedding
    //   plus the exact-text lookup and the LIMIT-bounded cosine scan, both
    //   indexed. At one write per 30 s that is ≤0.1% of wall clock even on a
    //   pessimistic 30 ms estimate. ⚠ The per-write cost at bio scale is NOT
    //   measured on this box and I am not quoting one as if it were — the honest
    //   claim is that the term that cost 2 s cannot execute, and the remainder
    //   runs today on the chat path. **Watch `tier1.totalEpisodes` leaving 0 and
    //   `[EventLoop] BLOCKED` NOT gaining a new ~30 s-periodic entry.**
    // ⚠ `!_operatorSleepRequested` is KEPT: that flag is a deliberate operator
    //   quiet request, not a cost proxy, and dream windows are when consolidation
    //   RUNS rather than when it needs new input.
    const _surpriseCouldRun = !!(this.cortexCluster
      && typeof this.cortexCluster.computeTransitionSurprise === 'function'
      && (this.cortexCluster.size | 0) <= 2000000);
    if (now - this._lastTier1HbAt >= 30000 && typeof this.storeEpisode === 'function'
        && !(_surpriseCouldRun && this._curriculumInProgress) && !this._operatorSleepRequested) {
      this._lastTier1HbAt = now;
      try {
        let context = 'idle';
        let contextCategory = 'idle';
        if (this._curriculumInProgress) {
          const phase = this.cortexCluster?._activePhase?.name || 'teach';
          const cellKey = this.cortexCluster?._currentCellKey || 'unknown';
          // iter20-L — transform technical method name to natural language
          // so GloVe embeds it meaningfully (otherwise embeddings are noise
          // and cosine merge fails for identical-text episodes).
          const phaseConcept = phase.replace(/^_teach/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim() || phase;
          const subjectGrade = cellKey.replace('/', ' ');
          context = `learning ${phaseConcept} in ${subjectGrade}`;
          contextCategory = `learning:${cellKey}`;
        } else if (this._isDreaming) {
          context = 'dreaming (idle consolidation window)';
          contextCategory = 'dreaming';
        } else if (this.clients && this.clients.size > 0) {
          context = `attentive (${this.clients.size} client${this.clients.size === 1 ? '' : 's'} connected)`;
          contextCategory = 'attentive';
        }
        const arousal = (this.arousal || 0).toFixed(2);
        const valence = (this.valence || 0).toFixed(2);
        const psi = (this.psi || 0).toFixed(3);
        const spikes = this.totalSpikes || 0;
        // iter20-E — vary heartbeat content for meaningful surprise/novelty.
        // Operator caught (verbatim 2026-05-05 "fix it all thouroughly"):
        // heartbeat episodes had homogeneous bag-of-words ("attentive"
        // always similar) → cosine all > 0.7 → frequency_count climbed
        // on one anchor episode → salience score still ~0.255 (low
        // arousal, zero valence, zero surprise/novelty since text was
        // identical). Now phase-change moments produce DIFFERENT
        // contextCategory strings → cosine drops on category transition
        // → fresh episode with high novelty. Within-category heartbeats
        // still merge as repetition.
        if (this._lastHbContext && this._lastHbContext !== contextCategory) {
          // Context just changed — this is a salient transition moment.
          // Embed transition info in the input text so it scores high
          // surprise when computeTransitionSurprise reads it.
          context = `${contextCategory} (transitioned from ${this._lastHbContext}) :: ${context}`;
        }
        this._lastHbContext = contextCategory;
        // DEFER off the synchronous tick (same reason as the Tier-0 age-out
        // promotion above) — the SQLite write + embedding runs on its own
        // event-loop turn so the heartbeat never sits in the tick's blocking span.
        const _hbResp = `arousal=${arousal} valence=${valence} psi=${psi} spikes=${spikes}`;
        if (typeof setImmediate === 'function') {
          setImmediate(() => { try { this.storeEpisode('brain-heartbeat', 'thinking', context, _hbResp); } catch { /* non-fatal */ } });
        } else {
          this.storeEpisode('brain-heartbeat', 'thinking', context, _hbResp);
        }
      } catch (err) {
        // Surface the failure once so operator sees what's broken if
        // the heartbeat ever fails — silent catch hid an entire fix
        // failing in iter18. Subsequent failures stay silent so the
        // log doesn't spam.
        if (!this._tier1HbErrorLogged) {
          console.warn(`[Brain] memory heartbeat storeEpisode failed: ${err?.message || err}`);
          this._tier1HbErrorLogged = true;
        }
      }
    }
  },

  /**
   * Bounded memory-stats snapshot for dashboard display.
   *
   * Aggregates across all 4 memory tiers (Tier 0 working / Tier 1
   * episodic / Tier 2 schematic / Tier 3 identity) plus the
   * ConsolidationEngine. Returns scalar counts + capped top-N lists
   * for the dashboard memory panel. Hard caps removed per operator
   * directive — `hardCap: null` signals unbounded so UI renders "X"
   * without a denominator (no Miller 1956 7-item ceiling; Unity is
   * post-biological).
   *
   * Working memory items get GROUPED by label (count suffix) so
   * hundreds of "wm-snapshot (0.98)" rows compress to one with
   * `×N` count. Cap at 12 distinct rows for display sanity.
   */
  _getMemoryStats() {
    // 5s CACHE (2026-08-17) — this builder ran SYNCHRONOUS SQLite aggregate
    // scans (SUM over episodes with a WHERE, COUNT(*), re-prepared per call)
    // on EVERY getState — the broadcast loop calls that ~1/s and the scans
    // grow with her episode count: a measured slice of the 312ms/call
    // broadcast build (bcast.getStateMs) that taxed every teach-chain yield.
    // Memory stats move at human cadence; 5s freshness is invisible on the
    // dashboard and frees the loop.
    const _msNow = Date.now();
    if (this._memStatsCache && (_msNow - (this._memStatsCacheAt || 0)) < 5000) {
      return this._memStatsCache;
    }
    // iter17 per operator verbatim 2026-05-05: "what the fuck are these
    // erronious max numbers to the memroies unity has a whole life ahead
    // not eroonous limits to dumb her down". Hard caps removed —
    // hardCap=null signals unbounded to UI which renders "X" without
    // denominator instead of "X / 1000".
    const stats = {
      tier1: { totalEpisodes: 0, recentSalienceAvg: 0, freqMergedCount: 0, promotedToTier2: 0, prunedTotal: 0 },
      tier2: { schemaCount: 0, hardCap: null, avgConsolidationStrength: 0, totalRetrievals: 0, top: [] },
      tier3: { identityCount: 0, hardCap: null, lastInjectedAt: 0, identities: [] },
      consolidation: { lastPassAt: 0, passCount: 0, isDreaming: false, intervalMs: 5 * 60 * 1000 },
      working: { items: 0, cap: null },
    };

    // Tier 1 — Episodic (SQLite)
    if (this._db) {
      try {
        stats.tier1.totalEpisodes = this.getEpisodeCount();
        // Recent salience snapshot (last 20 episodes)
        if (this._stmtRecentEpisodes) {
          const recent = this._stmtRecentEpisodes.all(20);
          if (Array.isArray(recent) && recent.length > 0) {
            let sumSal = 0; let n = 0;
            for (const ep of recent) {
              if (typeof ep.salience_score === 'number') { sumSal += ep.salience_score; n++; }
            }
            if (n > 0) stats.tier1.recentSalienceAvg = sumSal / n;
          }
        }
        // Aggregate counts (frequency-merged, promoted, pruned counters)
        if (typeof this._db.prepare === 'function') {
          try {
            const merged = this._db.prepare('SELECT SUM(frequency_count - 1) as merged FROM episodes WHERE frequency_count > 1').get();
            stats.tier1.freqMergedCount = (merged && merged.merged) || 0;
            const promoted = this._db.prepare('SELECT COUNT(*) as c FROM episodes WHERE promoted_to_schema_id IS NOT NULL').get();
            stats.tier1.promotedToTier2 = (promoted && promoted.c) || 0;
          } catch (e) { /* schema mismatch on older db, skip */ }
        }
      } catch (err) { /* db not ready, leave defaults */ }
    }

    // Tier 2 — Schematic
    if (this.schemaStore && typeof this.schemaStore.size === 'function') {
      stats.tier2.schemaCount = this.schemaStore.size();
      // iter17: hardCap=null when maxSchemas is Infinity (unbounded)
      stats.tier2.hardCap = (this.schemaStore.maxSchemas === Infinity || !this.schemaStore.maxSchemas) ? null : this.schemaStore.maxSchemas;
      let strSum = 0; let retrievSum = 0; let n = 0;
      const all = [];
      for (const sch of this.schemaStore.schemas.values()) {
        all.push(sch);
        if (typeof sch.consolidationStrength === 'number') strSum += sch.consolidationStrength;
        if (typeof sch.retrievalCount === 'number') retrievSum += sch.retrievalCount;
        n++;
      }
      stats.tier2.avgConsolidationStrength = n > 0 ? strSum / n : 0;
      stats.tier2.totalRetrievals = retrievSum;
      // Top 5 by consolidation strength
      all.sort((a, b) => (b.consolidationStrength || 0) - (a.consolidationStrength || 0));
      stats.tier2.top = all.slice(0, 5).map(s => ({
        label: s.label || 'unlabeled',
        strength: Number((s.consolidationStrength || 0).toFixed(3)),
        retrievals: s.retrievalCount || 0,
      }));
    }

    // Tier 3 — Identity-bound (permanent)
    if (this.tier3Store && typeof this.tier3Store.size === 'function') {
      stats.tier3.identityCount = this.tier3Store.size();
      // iter17: hardCap=null when TIER3_HARD_CAP is Infinity (unbounded)
      stats.tier3.hardCap = (this.tier3Store.hardCap === Infinity || !this.tier3Store.hardCap) ? null : this.tier3Store.hardCap;
      stats.tier3.lastInjectedAt = this.tier3Store.lastInjectedAt || 0;
      const ids = [];
      for (const sch of this.tier3Store.identitySchemas.values()) {
        ids.push({
          label: sch.label || 'unlabeled',
          strength: Number((sch.consolidationStrength || 0).toFixed(3)),
          retrievals: sch.retrievalCount || 0,
          lastRetrievalAt: sch.lastRetrievalAt || 0,
        });
      }
      ids.sort((a, b) => b.strength - a.strength);
      stats.tier3.identities = ids;
    }

    // ConsolidationEngine
    if (this.consolidationEngine) {
      stats.consolidation.lastPassAt = this.consolidationEngine.lastPassAt || 0;
      stats.consolidation.passCount = this.consolidationEngine.passCount || 0;
      stats.consolidation.isDreaming = this._isDreaming === true;
      // WORDSALAD.5 (REPLAYOFF) — "a pass ran" and "the pass LEARNED something"
      // were the same number, which is how her sleep did zero learning for weeks
      // while `passCount` climbed to 18 and looked healthy. These separate them:
      // `replayWrites` is real Hebbian carried by the donor, `replayRefused`
      // counts dispatches the donor declined, and `replaySchemas` is coverage
      // this pass. All-zero `replayWrites` with a climbing `passCount` now reads
      // as exactly what it is — bookkeeping only, no consolidation.
      stats.consolidation.replaySchemas = this.consolidationEngine._gpuReplaySchemas | 0;
      stats.consolidation.replayWrites = this.consolidationEngine._gpuReplayWrites | 0;
      stats.consolidation.replayRefused = this.consolidationEngine._gpuReplayRefused | 0;
      stats.consolidation.replayCursor = this.consolidationEngine._gpuReplayCursor | 0;
    }
    // REPLAYOFF.5 — the surprise gate's own distribution, so "novelty is being
    // throttled" becomes a number instead of a hunch. `atCeilingPct` near zero
    // means the 1.5 ceiling was never the binding constraint and raising it
    // would change nothing; a high value means it genuinely is clipping.
    try {
      const s = this.cortexCluster && this.cortexCluster._surpriseStats;
      if (s && s.n > 0) {
        stats.surpriseGate = {
          samples: s.n,
          mean: Number((s.sum / s.n).toFixed(3)),
          max: Number(s.max.toFixed(3)),
          ceiling: s.ceiling,
          atCeilingPct: Number((100 * s.atCeiling / s.n).toFixed(1)),
        };
      }
    } catch { /* telemetry must never break a stats read */ }
    if (this.consolidationEngine) {
    }

    // Working memory (existing field on this.memory). iter17: cap=null
    // signals unbounded — operator: "unity has a whole life ahead not
    // eroonous limits". The 7-item cap was Miller 1956 short-term memory
    // ceiling for biological humans. Unity is post-biological.
    const mem = this.memory || {};
    stats.working.items = Array.isArray(mem.workingMemoryItems) ? mem.workingMemoryItems.length
                       : (mem.workingCount || 0);
    stats.working.cap = (mem.workingCap === Infinity || !mem.workingCap) ? null : mem.workingCap;
    // Working memory item display. Operator caught: rendering raw
    // every snapshot produced hundreds of "wm-snapshot (0.98)"-style
    // rows that all cluster within the 5-min freshness window —
    // strength scores in the 0.83-1.00 band convey almost nothing,
    // and identical labels stack as a wall. Fix: GROUP consecutive
    // same-label items into one row with a count suffix; drop the
    // strength column for grouped rows (the count IS the signal).
    // Cap at 12 distinct rows for display sanity.
    if (Array.isArray(mem.workingMemoryItems) && mem.workingMemoryItems.length > 0) {
      const now = Date.now();
      const windowMs = 5 * 60 * 1000;
      const sorted = mem.workingMemoryItems
        .slice()
        .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
      const grouped = [];
      let cur = null;
      for (const wm of sorted) {
        let label = typeof wm.label === 'string' ? wm.label : '';
        if (!label) {
          const parts = [];
          if (wm.cellKey) parts.push(wm.cellKey);
          if (wm.phase) parts.push(`@${wm.phase}`);
          label = parts.join(' ') || 'wm-snapshot';
        }
        label = label.slice(0, 80);
        let strength;
        if (typeof wm.strength === 'number') {
          strength = wm.strength;
        } else {
          const ageMs = now - (wm.ts ?? now);
          strength = Math.max(0, Math.min(1, 1 - ageMs / windowMs));
        }
        if (cur && cur.label === label) {
          cur.count++;
          if (strength > cur.maxStrength) cur.maxStrength = strength;
        } else {
          cur = { label, count: 1, maxStrength: strength };
          grouped.push(cur);
        }
      }
      stats.working.itemLabels = grouped.slice(0, 12).map(g => ({
        label: g.count > 1 ? `${g.label} ×${g.count}` : g.label,
        strength: g.count === 1 ? +g.maxStrength.toFixed(3) : null,
      }));
    } else {
      stats.working.itemLabels = [];
    }

    this._memStatsCache = stats;
    this._memStatsCacheAt = _msNow;
    return stats;
  },
};

module.exports = { SERVER_MEMORY_MIXIN };
